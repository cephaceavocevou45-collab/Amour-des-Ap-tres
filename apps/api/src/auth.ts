import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Optional, Param, Patch, Post, Req, Res, ServiceUnavailableException, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Matches, Min, Max, MinLength, MaxLength } from 'class-validator';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';
import { PersonRoleName, UserRole } from './generated/prisma';
import * as argon2 from 'argon2';
import { RateLimitGuard } from './rate-limit.guard';
import { EmailQuotaService } from './email-quota.service';
import { ReauthProof, ReauthService } from './reauth';
import { sessionCookieOptions } from './runtime-config';
import { LoginBackoffPolicy } from './login-backoff.policy';

class ForgotPasswordDto { @IsEmail() email!:string; }
class ResetPasswordDto { @IsEmail() email!:string; @IsString() @Matches(/^\d{6}$/) code!:string; @IsString() @MinLength(12) @MaxLength(128) password!:string; @IsString() @MinLength(12) @MaxLength(128) confirmPassword!:string; }
class LoginDto {
  @IsEmail() email!:string;
  @IsString() @MinLength(1) @MaxLength(128) password!:string;
}
class RegisterAccountDto {
  @IsString() @Length(3,120) fullName!:string;
  @IsEmail() @MaxLength(254) email!:string;
  @IsOptional() @IsString() @MaxLength(32) phone?:string;
  @IsIn(['SECRETAIRE_PRESENCE','RESPONSABLE_SEMAINE','SECRETAIRE_PROGRAMME','TRESORIER','EDITEUR']) role!:string;
  @IsOptional() @IsInt() @Min(1) @Max(7) assignedDayOfWeek?:number;
  @IsString() @MinLength(12) @MaxLength(128) password!:string;
  @IsString() @MinLength(12) @MaxLength(128) confirmPassword!:string;
}
class RegisterFaithfulDto {
  @IsString() @Length(3,120) fullName!:string;
  @IsEmail() @MaxLength(254) email!:string;
  @IsOptional() @IsString() @MaxLength(32) phone?:string;
  @IsString() @MinLength(12) @MaxLength(128) password!:string;
  @IsString() @MinLength(12) @MaxLength(128) confirmPassword!:string;
}
class SubAdminPermissionsDto implements ReauthProof { @IsArray() @ArrayMaxSize(2) @IsIn(['GESTION_COMPTES','PROGRAMME_BIBLIQUE'],{each:true}) permissions!:string[]; @IsString() @Length(8,1000) reason!:string; @IsOptional() @IsString() @MaxLength(128) reauthPassword?:string; }
class ChangePasswordDto { @IsString() @MaxLength(128) currentPassword!:string; @IsString() @MinLength(12) @MaxLength(128) newPassword!:string; @IsString() @MinLength(12) @MaxLength(128) confirmPassword!:string; }
class ChangeEmailDto { @IsEmail() @MaxLength(254) email!:string; @IsString() @MaxLength(128) currentPassword!:string; }
class MessageResponderDto { @IsBoolean() enabled!:boolean; }
class CreateManagedAccountDto implements ReauthProof { @IsString() @Length(3,120) fullName!:string; @IsEmail() @MaxLength(254) email!:string; @IsOptional() @IsString() @MaxLength(32) phone?:string; @IsIn(['SECRETAIRE_PRESENCE','RESPONSABLE_SEMAINE','SECRETAIRE_PROGRAMME','TRESORIER','EDITEUR']) role!:string; @IsOptional() @IsInt() @Min(1) @Max(7) assignedDayOfWeek?:number; @IsOptional() @IsArray() @ArrayMaxSize(2) @IsIn(['GESTION_COMPTES','PROGRAMME_BIBLIQUE'],{each:true}) permissions?:string[]; @IsString() @Length(8,1000) reason!:string; @IsOptional() @IsString() @MaxLength(128) reauthPassword?:string; }
class UpdateManagedAccountDto implements ReauthProof { @IsOptional() @IsBoolean() active?:boolean; @IsOptional() @IsIn(['SECRETAIRE_PRESENCE','RESPONSABLE_SEMAINE','SECRETAIRE_PROGRAMME','TRESORIER','EDITEUR']) role?:string; @IsOptional() @IsInt() @Min(1) @Max(7) assignedDayOfWeek?:number; @IsOptional() @IsArray() @ArrayMaxSize(2) @IsIn(['GESTION_COMPTES','PROGRAMME_BIBLIQUE'],{each:true}) permissions?:string[]; @IsOptional() @IsString() @Length(8,1000) reason?:string; @IsOptional() @IsString() @MaxLength(128) reauthPassword?:string; }
class ManagePresenterDto implements ReauthProof { @IsString() @Length(1,80) firstName!:string; @IsString() @Length(1,120) lastName!:string; @IsOptional() @IsString() @MaxLength(80) grade?:string|null; @IsString() @Length(8,1000) reason!:string; @IsOptional() @IsString() @MaxLength(128) reauthPassword?:string; }
class RemovePresenterDto implements ReauthProof { @IsString() @Length(8,1000) reason!:string; @IsOptional() @IsString() @MaxLength(128) reauthPassword?:string; }

const forbiddenPasswords=new Set(['password1234','123456789012','azerty123456','qwerty123456','motdepasse123']);
function b64(value:string){return Buffer.from(value).toString('base64url');}
function signToken(user:{id:string;role:UserRole;sessionVersion:number},family:string) {
  const header=b64(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const payload=b64(JSON.stringify({sub:user.id,role:user.role,ver:user.sessionVersion,fam:family,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600}));
  const unsigned=`${header}.${payload}`;
  const secret=process.env.JWT_ACCESS_SECRET;
  if(!secret||Buffer.byteLength(secret,'utf8')<32)throw new Error('JWT_ACCESS_SECRET doit contenir au moins 32 octets.');
  return `${unsigned}.${createHmac('sha256',secret).update(unsigned).digest('base64url')}`;
}
@Injectable()
export class AuthService {
  constructor(private prisma:PrismaService,@Optional() private readonly emailQuota?:EmailQuotaService,private readonly reauth?:ReauthService,@Optional() private readonly loginBackoff:LoginBackoffPolicy=new LoginBackoffPolicy()){}
  async login(dto:LoginDto,adminOnly=false,ip='unknown',subAdminOnly=false,faithfulOnly=false){const started=Date.now(),email=dto.email.trim().toLowerCase();await this.loginBackoff.wait(ip,email);const user=await this.prisma.user.findUnique({where:{email}});const generic='Adresse e-mail ou mot de passe invalide.';const good=user?await argon2.verify(user.passwordHash,dto.password).catch(()=>false):await argon2.verify(await AuthService.dummyHash(),dto.password).catch(()=>false);let authorized=!!user&&user.active&&good;if(authorized&&adminOnly)authorized=subAdminOnly?user!.role==='EDITEUR':['ADMIN','SUPER_ADMIN'].includes(user!.role);else if(authorized&&faithfulOnly)authorized=user!.role==='FIDELE';else if(authorized)authorized=['SECRETAIRE_PRESENCE','RESPONSABLE_SEMAINE','SECRETAIRE_PROGRAMME','TRESORIER'].includes(user!.role);if(!authorized){this.loginBackoff.recordFailure(ip,email);await this.prisma.auditLog.create({data:{userId:user?.id,action:'CONNEXION_ECHOUEE',entity:'LoginAttempt',entityId:createHash('sha256').update(email).digest('hex'),ip}}).catch(()=>undefined);await new Promise(resolve=>setTimeout(resolve,Math.max(0,500-(Date.now()-started))));throw new UnauthorizedException(generic);}this.loginBackoff.clear(ip,email);const firstLogin=!user!.welcomeShownAt;await this.prisma.user.update({where:{id:user!.id},data:{failedAttempts:0,lockedUntil:null,...(firstLogin?{welcomeShownAt:new Date()}:{})}});await this.prisma.auditLog.create({data:{userId:user!.id,action:'CONNEXION_REUSSIE',entity:'UserSecurity',entityId:user!.id,ip}});return this.session(user!,firstLogin);}
  private static readonly fakeHashPromise=argon2.hash('not-a-real-user-password-value',{type:argon2.argon2id});
  private static dummyHash(){return this.fakeHashPromise;}
  async refresh(rawToken:string){const hashedToken=createHash('sha256').update(rawToken).digest('hex');const stored=await this.prisma.refreshToken.findUnique({where:{hashedToken},include:{user:true}});if(!stored)throw new UnauthorizedException('Connexion expirée.');const now=new Date(),idleMinutes=this.sessionIdleMinutes(),absoluteDays=this.sessionAbsoluteDays(),oldest=await this.prisma.refreshToken.findFirst({where:{family:stored.family},orderBy:{createdAt:'asc'},select:{createdAt:true}});const expiredByInactivity=now.getTime()-stored.lastSeenAt.getTime()>idleMinutes*60_000,expiredAbsolutely=!oldest||now.getTime()-oldest.createdAt.getTime()>absoluteDays*86_400_000;if(stored.revokedAt){await this.prisma.$transaction([this.prisma.refreshToken.updateMany({where:{family:stored.family,revokedAt:null},data:{revokedAt:now}}),this.prisma.user.update({where:{id:stored.userId},data:{sessionVersion:{increment:1}}})]);throw new UnauthorizedException('Connexion expirée.');}if(stored.expiresAt<=now||expiredByInactivity||expiredAbsolutely||!stored.user.active){await this.prisma.refreshToken.updateMany({where:{family:stored.family,revokedAt:null},data:{revokedAt:now}});throw new UnauthorizedException('Connexion expirée.');}const nextRaw=randomBytes(32).toString('base64url'),nextHash=createHash('sha256').update(nextRaw).digest('hex');const rotated=await this.prisma.$transaction(async tx=>{const claim=await tx.refreshToken.updateMany({where:{id:stored.id,revokedAt:null,expiresAt:{gt:now}},data:{revokedAt:now,lastSeenAt:now}});if(claim.count!==1){await tx.refreshToken.updateMany({where:{family:stored.family,revokedAt:null},data:{revokedAt:now}});await tx.user.update({where:{id:stored.userId},data:{sessionVersion:{increment:1}}});return false;}await tx.refreshToken.create({data:{userId:stored.userId,hashedToken:nextHash,expiresAt:new Date(Math.min(now.getTime()+7*24*60*60_000,oldest.createdAt.getTime()+absoluteDays*86_400_000)),family:stored.family,lastSeenAt:now}});return true;});if(!rotated)throw new UnauthorizedException('Connexion expirée.');return {accessToken:signToken({id:stored.user.id,role:stored.user.role,sessionVersion:stored.user.sessionVersion},stored.family),refreshToken:nextRaw,expiresIn:600,user:{id:stored.user.id,role:stored.user.role,name:stored.user.fullName,email:stored.user.email,permissions:(stored.user as any).permissions??[]}};}
  async logout(rawToken?:string){if(!rawToken)return;const hashedToken=createHash('sha256').update(rawToken).digest('hex');const token=await this.prisma.refreshToken.findUnique({where:{hashedToken},select:{userId:true,family:true}});if(!token)return;await this.prisma.$transaction([this.prisma.refreshToken.updateMany({where:{family:token.family,revokedAt:null},data:{revokedAt:new Date()}}),this.prisma.user.update({where:{id:token.userId},data:{sessionVersion:{increment:1}}})]);}
  async revokeAllSessions(userId:string){const now=new Date();await this.prisma.$transaction(async tx=>{await tx.refreshToken.updateMany({where:{userId,revokedAt:null},data:{revokedAt:now}});await tx.user.update({where:{id:userId},data:{sessionVersion:{increment:1}}});await tx.auditLog.create({data:{userId,action:'TOUTES_LES_SESSIONS_REVOQUEES',entity:'UserSecurity',entityId:userId}});});return {revoked:true};}
  async recordSessionDevice(rawToken:string,ip:string,userAgent:string){const hashedToken=createHash('sha256').update(rawToken).digest('hex');await this.prisma.refreshToken.updateMany({where:{hashedToken,revokedAt:null},data:{ip:ip.slice(0,64),userAgent:userAgent.slice(0,500)}});}
  async logPasswordResetRequest(email:string,ip:string){await this.prisma.auditLog.create({data:{action:'RESET_DEMANDE',entity:'PasswordReset',entityId:createHash('sha256').update(email.trim().toLowerCase()).digest('hex'),ip}});}
  async registerManagedAccount(dto:RegisterAccountDto,ip:string){
    if(dto.password!==dto.confirmPassword)throw new BadRequestException('La confirmation du mot de passe ne correspond pas.');
    if(forbiddenPasswords.has(dto.password.toLowerCase()))throw new BadRequestException('Choisissez un mot de passe moins courant.');
    const role=dto.role as UserRole,email=dto.email.trim().toLowerCase();
    if(role===UserRole.RESPONSABLE_SEMAINE)this.requireWeekday(dto.assignedDayOfWeek);
    else if(dto.assignedDayOfWeek!==undefined)throw new BadRequestException('Un jour ne peut être attribué qu’au président du jour.');
    const passwordHash=await argon2.hash(dto.password,{type:argon2.argon2id});
    try{
      await this.prisma.$transaction(async tx=>{
        const user=await tx.user.create({data:{fullName:dto.fullName.trim(),email,phone:dto.phone?.trim()||null,role,assignedDayOfWeek:role===UserRole.RESPONSABLE_SEMAINE?dto.assignedDayOfWeek:null,permissions:[],passwordHash,active:false,mustChangePassword:false}});
        await tx.auditLog.create({data:{action:'DEMANDE_ACCES_PRESENCES',entity:'UserAccess',entityId:user.id,after:{role,assignedDayOfWeek:user.assignedDayOfWeek},reason:'Inscription en attente de validation administrative.',ip}});
      });
      return {message:'Votre demande a été reçue. L’administration paroissiale doit valider votre compte avant votre première connexion.'};
    }catch(error:any){if(error?.code==='P2002')throw new BadRequestException('Cette adresse e-mail est déjà utilisée.');throw error;}
  }
  async registerFaithful(dto:RegisterFaithfulDto,ip:string){
    if(dto.password!==dto.confirmPassword)throw new BadRequestException('La confirmation du mot de passe ne correspond pas.');
    if(forbiddenPasswords.has(dto.password.toLowerCase()))throw new BadRequestException('Choisissez un mot de passe moins courant.');
    const email=dto.email.trim().toLowerCase(),passwordHash=await argon2.hash(dto.password,{type:argon2.argon2id});
    try{
      await this.prisma.$transaction(async tx=>{
        const user=await tx.user.create({data:{fullName:dto.fullName.trim(),email,phone:dto.phone?.trim()||null,role:UserRole.FIDELE,passwordHash,active:true,mustChangePassword:false,permissions:[]}});
        await tx.auditLog.create({data:{userId:user.id,action:'COMPTE_FIDELE_CREE',entity:'UserAccess',entityId:user.id,after:{role:UserRole.FIDELE},ip}});
      });
      return {message:'Votre compte fidèle est créé et actif. Vous pouvez vous connecter dès maintenant.'};
    }catch(error:any){if(error?.code==='P2002')throw new BadRequestException('Cette adresse e-mail possède déjà un compte. Connectez-vous ou utilisez la récupération de mot de passe.');throw error;}
  }
  async listManagedAccounts(){
    const accounts=await this.prisma.user.findMany({where:{role:{in:[UserRole.FIDELE,UserRole.SECRETAIRE_PRESENCE,UserRole.RESPONSABLE_SEMAINE,UserRole.SECRETAIRE_PROGRAMME,UserRole.TRESORIER,UserRole.EDITEUR]}},select:{id:true,fullName:true,email:true,phone:true,role:true,active:true,permissions:true,assignedDayOfWeek:true,canRespondMessages:true},orderBy:[{role:'asc'},{fullName:'asc'}]});
    if(!accounts.length)return [];
    const events=await this.prisma.auditLog.findMany({where:{entity:'UserAccess',entityId:{in:accounts.map(account=>account.id)},action:{in:['DEMANDE_ACCES_PRESENCES','DEMANDE_ACCES_PRESENCES_VALIDEE','DEMANDE_ACCES_PRESENCES_REFUSEE']}},select:{entityId:true,action:true},orderBy:{createdAt:'desc'}});
    const lastEvent=new Map<string,string>();for(const event of events)if(!lastEvent.has(event.entityId))lastEvent.set(event.entityId,event.action);
    return accounts.map(account=>({...account,approvalPending:!account.active&&lastEvent.get(account.id)==='DEMANDE_ACCES_PRESENCES'})).sort((a,b)=>Number(b.approvalPending)-Number(a.approvalPending));
  }
  async createManagedAccount(dto:CreateManagedAccountDto,actorId:string){
    if(!this.reauth)throw new UnauthorizedException('Réauthentification indisponible.');
    await this.reauth.requireRecentProof(actorId,dto);
    const reason=dto.reason.trim(),role=dto.role as UserRole,email=dto.email.trim().toLowerCase();
    if(reason.length<8)throw new BadRequestException('Le motif doit contenir au moins huit caractères.');
    if(role===UserRole.RESPONSABLE_SEMAINE)this.requireWeekday(dto.assignedDayOfWeek);
    else if(dto.assignedDayOfWeek!==undefined)throw new BadRequestException('Un jour ne peut être attribué qu’au président du jour.');
    const permissions=role===UserRole.EDITEUR?[...new Set(dto.permissions??[])]:[];
    const temporaryPassword=randomBytes(24).toString('base64url'),passwordHash=await argon2.hash(temporaryPassword,{type:argon2.argon2id});
    try{
      const user=await this.prisma.$transaction(async tx=>{
        const created=await tx.user.create({data:{fullName:dto.fullName.trim(),email,phone:dto.phone?.trim()||null,role,assignedDayOfWeek:role===UserRole.RESPONSABLE_SEMAINE?dto.assignedDayOfWeek:null,permissions,passwordHash,mustChangePassword:true,active:true}});
        await tx.auditLog.create({data:{userId:actorId,action:'COMPTE_RESPONSABLE_CREE',entity:'UserAccess',entityId:created.id,after:{role,assignedDayOfWeek:created.assignedDayOfWeek,permissions},reason}});
        return created;
      });
      return {member:{id:user.id,fullName:user.fullName,email:user.email,phone:user.phone,role:user.role,active:user.active,permissions:user.permissions,assignedDayOfWeek:user.assignedDayOfWeek,mustChangePassword:user.mustChangePassword},temporaryPassword};
    }catch(error:any){if(error?.code==='P2002')throw new BadRequestException('Cette adresse e-mail est déjà utilisée.');throw error;}
  }
  async updateManagedAccount(id:string,dto:UpdateManagedAccountDto,actorId:string){
    if(id===actorId)throw new ForbiddenException('Vous ne pouvez pas modifier votre propre accès depuis cette page.');
    const member=await this.prisma.user.findUnique({where:{id},select:{id:true,role:true,active:true,permissions:true,assignedDayOfWeek:true,sessionVersion:true}});
    const managedRoles:string[]=[UserRole.SECRETAIRE_PRESENCE,UserRole.RESPONSABLE_SEMAINE,UserRole.SECRETAIRE_PROGRAMME,UserRole.TRESORIER,UserRole.EDITEUR];
    if(!member||!managedRoles.includes(member.role))throw new NotFoundException('Compte responsable introuvable.');
    const requestEvent=await this.prisma.auditLog.findFirst({where:{entity:'UserAccess',entityId:id,action:{in:['DEMANDE_ACCES_PRESENCES','DEMANDE_ACCES_PRESENCES_VALIDEE','DEMANDE_ACCES_PRESENCES_REFUSEE']}},select:{action:true},orderBy:{createdAt:'desc'}});
    const approvalPending=requestEvent?.action==='DEMANDE_ACCES_PRESENCES'&&!member.active;
    const approvalOnly=approvalPending&&dto.active===true&&dto.role===undefined&&dto.assignedDayOfWeek===undefined&&dto.permissions===undefined;
    if(!approvalOnly){if(!this.reauth)throw new UnauthorizedException('Réauthentification indisponible.');await this.reauth.requireRecentProof(actorId,dto);}
    const reason=dto.reason?.trim()??'';if(!approvalOnly&&reason.length<8)throw new BadRequestException('Le motif doit contenir au moins huit caractères.');
    const role=(dto.role??member.role) as UserRole,assignedDayOfWeek=role===UserRole.RESPONSABLE_SEMAINE?(dto.assignedDayOfWeek??member.assignedDayOfWeek):null;
    if(role===UserRole.RESPONSABLE_SEMAINE)this.requireWeekday(assignedDayOfWeek);
    if(role!==UserRole.RESPONSABLE_SEMAINE&&dto.assignedDayOfWeek!==undefined)throw new BadRequestException('Un jour ne peut être attribué qu’au président du jour.');
    const permissions=role===UserRole.EDITEUR?(dto.permissions??member.permissions):[];
    const nextActive=dto.active??member.active;
    return this.prisma.$transaction(async tx=>{
      const updated=await tx.user.update({where:{id},data:{role,assignedDayOfWeek,permissions,active:nextActive,sessionVersion:{increment:1}}});
      await tx.refreshToken.updateMany({where:{userId:id,revokedAt:null},data:{revokedAt:new Date()}});
      await tx.auditLog.create({data:{userId:actorId,action:'COMPTE_RESPONSABLE_MODIFIE',entity:'UserAccess',entityId:id,before:{role:member.role,active:member.active,permissions:member.permissions,assignedDayOfWeek:member.assignedDayOfWeek},after:{role,active:nextActive,permissions,assignedDayOfWeek},reason:reason||'Demande d’accès approuvée par l’administration.'}});
      if(approvalPending&&dto.active===true)await tx.auditLog.create({data:{userId:actorId,action:'DEMANDE_ACCES_PRESENCES_VALIDEE',entity:'UserAccess',entityId:id,reason:reason||'Demande approuvée.'}});
      if(approvalPending&&dto.active===false)await tx.auditLog.create({data:{userId:actorId,action:'DEMANDE_ACCES_PRESENCES_REFUSEE',entity:'UserAccess',entityId:id,reason}});
      return {id:updated.id,role:updated.role,active:updated.active,permissions:updated.permissions,assignedDayOfWeek:updated.assignedDayOfWeek};
    });
  }
  async listManagedPresenters(){
    const people=await this.prisma.person.findMany({where:{active:true,roles:{some:{role:PersonRoleName.PRESENTATION_THEME}}},include:{roles:true},orderBy:[{displayOrder:'asc'},{lastName:'asc'},{firstName:'asc'}]});
    // Normalize the previous seed format in the admin editor too. Saving any
    // edit persists the clean family name and grade through updateManagedPresenter.
    return people.map(person=>{
      const legacyDehoto=/^DEHOTO\s+/i.test(person.lastName);
      return {...person,lastName:legacyDehoto?person.lastName.replace(/^DEHOTO\s+/i,''):person.lastName,grade:person.grade??(legacyDehoto?'Dehoto':null)};
    });
  }
  async createManagedPresenter(dto:ManagePresenterDto,actorId:string){
    if(!this.reauth)throw new UnauthorizedException('Réauthentification indisponible.');
    await this.reauth.requireRecentProof(actorId,dto);
    const firstName=dto.firstName.trim(),lastName=dto.lastName.trim(),grade=dto.grade?.trim()||null,reason=dto.reason.trim();
    const duplicate=await this.prisma.person.findFirst({where:{firstName,lastName,active:true,roles:{some:{role:PersonRoleName.PRESENTATION_THEME}}},select:{id:true}});
    if(duplicate)throw new BadRequestException('Cette personne figure déjà parmi les intervenants du thème.');
    const order=await this.prisma.person.aggregate({_max:{displayOrder:true}});
    return this.prisma.$transaction(async tx=>{
      const person=await tx.person.create({data:{firstName,lastName,grade,displayOrder:(order._max.displayOrder??0)+1,roles:{create:{role:PersonRoleName.PRESENTATION_THEME}}},include:{roles:true}});
      await tx.auditLog.create({data:{userId:actorId,action:'INTERVENANT_BIBLIQUE_AJOUTE',entity:'Person',entityId:person.id,after:{firstName,lastName,grade,role:PersonRoleName.PRESENTATION_THEME},reason}});
      return person;
    });
  }
  async updateManagedPresenter(id:string,dto:ManagePresenterDto,actorId:string){
    if(!this.reauth)throw new UnauthorizedException('Réauthentification indisponible.');
    await this.reauth.requireRecentProof(actorId,dto);
    const person=await this.prisma.person.findFirst({where:{id,active:true,roles:{some:{role:PersonRoleName.PRESENTATION_THEME}}},select:{id:true,firstName:true,lastName:true,grade:true}});
    if(!person)throw new NotFoundException('Cet intervenant n’est plus dans la liste.');
    const firstName=dto.firstName.trim(),lastName=dto.lastName.trim(),grade=dto.grade?.trim()||null,reason=dto.reason.trim();
    return this.prisma.$transaction(async tx=>{
      const updated=await tx.person.update({where:{id},data:{firstName,lastName,grade},include:{roles:true}});
      await tx.auditLog.create({data:{userId:actorId,action:'INTERVENANT_BIBLIQUE_MODIFIE',entity:'Person',entityId:id,before:{firstName:person.firstName,lastName:person.lastName,grade:person.grade},after:{firstName,lastName,grade},reason}});
      return updated;
    });
  }
  async removeManagedPresenter(id:string,dto:RemovePresenterDto,actorId:string){
    if(!this.reauth)throw new UnauthorizedException('Réauthentification indisponible.');
    await this.reauth.requireRecentProof(actorId,dto);
    const person=await this.prisma.person.findFirst({where:{id,active:true,roles:{some:{role:PersonRoleName.PRESENTATION_THEME}}},select:{id:true,firstName:true,lastName:true,grade:true}});
    if(!person)throw new NotFoundException('Cet intervenant n’est plus dans la liste.');
    const reason=dto.reason.trim();
    await this.prisma.$transaction(async tx=>{
      await tx.personRole.delete({where:{personId_role:{personId:id,role:PersonRoleName.PRESENTATION_THEME}}});
      await tx.auditLog.create({data:{userId:actorId,action:'INTERVENANT_BIBLIQUE_RETIRE',entity:'Person',entityId:id,before:{firstName:person.firstName,lastName:person.lastName,grade:person.grade,role:PersonRoleName.PRESENTATION_THEME},reason}});
    });
    return {id,removed:true};
  }
  async sessions(userId:string,currentToken?:string){const rows=await this.prisma.refreshToken.findMany({where:{userId},orderBy:{createdAt:'desc'},select:{id:true,createdAt:true,expiresAt:true,revokedAt:true,hashedToken:true,userAgent:true}});const currentHash=currentToken?createHash('sha256').update(currentToken).digest('hex'):'';return rows.map(({hashedToken,userAgent,...row})=>({...row,isCurrent:!!currentHash&&hashedToken===currentHash,device:userAgent?userAgent.slice(0,180):'Appareil non identifié'}));}
  async accountProfile(userId:string){const user=await this.prisma.user.findUnique({where:{id:userId},select:{id:true,email:true,fullName:true,role:true}});if(!user)throw new UnauthorizedException('Compte introuvable.');return user;}
  async revokeSession(userId:string,id:string){const result=await this.prisma.refreshToken.updateMany({where:{id,userId,revokedAt:null},data:{revokedAt:new Date()}});if(!result.count)throw new ForbiddenException('Cette session ne vous appartient pas ou est déjà fermée.');await this.prisma.auditLog.create({data:{userId,action:'SESSION_REVOQUEE',entity:'RefreshToken',entityId:id}});return {id,revoked:true};}
  async changePassword(userId:string,dto:ChangePasswordDto,currentToken?:string){if(dto.newPassword!==dto.confirmPassword)throw new BadRequestException('La confirmation du nouveau mot de passe ne correspond pas.');if(forbiddenPasswords.has(dto.newPassword.toLowerCase()))throw new BadRequestException('Choisissez un mot de passe moins courant.');const user=await this.prisma.user.findUnique({where:{id:userId},select:{id:true,passwordHash:true}});if(!user||!await argon2.verify(user.passwordHash,dto.currentPassword).catch(()=>false))throw new ForbiddenException('Le mot de passe actuel est incorrect.');const passwordHash=await argon2.hash(dto.newPassword,{type:argon2.argon2id}),currentHash=currentToken?createHash('sha256').update(currentToken).digest('hex'):'';await this.prisma.$transaction(async tx=>{await tx.user.update({where:{id:userId},data:{passwordHash}});await tx.refreshToken.updateMany({where:{userId,revokedAt:null,...(currentHash?{hashedToken:{not:currentHash}}:{})},data:{revokedAt:new Date()}});await tx.auditLog.create({data:{userId,action:'MOT_DE_PASSE_MODIFIE',entity:'UserSecurity',entityId:userId}});});return {updated:true,sessionsRevoked:true};}
  async changeEmail(userId:string,dto:ChangeEmailDto){const email=dto.email.trim().toLowerCase(),user=await this.prisma.user.findUnique({where:{id:userId},select:{id:true,email:true,passwordHash:true}});if(!user||!await argon2.verify(user.passwordHash,dto.currentPassword).catch(()=>false))throw new ForbiddenException('Le mot de passe actuel est incorrect.');if(email===user.email)return {updated:true,changed:false,email};try{await this.prisma.$transaction(async tx=>{await tx.user.update({where:{id:userId},data:{email}});await tx.refreshToken.updateMany({where:{userId,revokedAt:null},data:{revokedAt:new Date()}});await tx.auditLog.create({data:{userId,action:'ADRESSE_E_MAIL_MODIFIEE',entity:'UserSecurity',entityId:userId,before:{email:user.email},after:{email}}});});return {updated:true,changed:true,email};}catch(error:any){if(error?.code==='P2002')throw new BadRequestException('Cette adresse e-mail est déjà utilisée.');throw error;}}
  async setMessageResponder(id:string,enabled:boolean,actorId:string){
    const member=await this.prisma.user.findUnique({where:{id},select:{id:true,role:true,active:true,canRespondMessages:true}});
    if(!member||!member.active||['FIDELE','ADMIN','SUPER_ADMIN'].includes(member.role))throw new BadRequestException('Choisissez un compte responsable actif.');
    await this.prisma.$transaction(async tx=>{
      await tx.user.update({where:{id},data:{canRespondMessages:enabled}});
      await tx.auditLog.create({data:{userId:actorId,action:enabled?'REPONDANT_MESSAGES_DESIGNE':'REPONDANT_MESSAGES_RETIRE',entity:'UserAccess',entityId:id,before:{canRespondMessages:member.canRespondMessages},after:{canRespondMessages:enabled}}});
    });
    return {id,canRespondMessages:enabled};
  }
  async changeFirstLoginPassword(userId:string,dto:ChangePasswordDto){
    if(dto.newPassword!==dto.confirmPassword)throw new BadRequestException('La confirmation du nouveau mot de passe ne correspond pas.');
    if(forbiddenPasswords.has(dto.newPassword.toLowerCase()))throw new BadRequestException('Choisissez un mot de passe moins courant.');
    const user=await this.prisma.user.findUnique({where:{id:userId},select:{passwordHash:true,mustChangePassword:true}});
    if(!user?.mustChangePassword)throw new BadRequestException('Aucun changement initial de mot de passe n’est requis.');
    if(!await argon2.verify(user.passwordHash,dto.currentPassword).catch(()=>false))throw new ForbiddenException('Le mot de passe temporaire est incorrect.');
    const now=new Date(),passwordHash=await argon2.hash(dto.newPassword,{type:argon2.argon2id});
    await this.prisma.$transaction(async tx=>{await tx.user.update({where:{id:userId},data:{passwordHash,mustChangePassword:false,sessionVersion:{increment:1}}});await tx.refreshToken.updateMany({where:{userId,revokedAt:null},data:{revokedAt:now}});await tx.auditLog.create({data:{userId,action:'MOT_DE_PASSE_INITIAL_MODIFIE',entity:'UserSecurity',entityId:userId}});});
    return {message:'Mot de passe modifié. Reconnectez-vous avec votre nouveau mot de passe.'};
  }
  async setSubAdminPermissions(id:string,permissions:string[],actorId:string,reason:string,proof:ReauthProof){if(!this.reauth)throw new UnauthorizedException('Réauthentification indisponible.');await this.reauth.requireRecentProof(actorId,proof);const allowed=new Set(['GESTION_COMPTES','PROGRAMME_BIBLIQUE']);const normalized=[...new Set(permissions)];if(normalized.some(permission=>!allowed.has(permission)))throw new ForbiddenException('Autorisation inconnue.');const member=await this.prisma.user.findUnique({where:{id},select:{id:true,role:true,active:true,permissions:true}});if(!member||!member.active||!['EDITEUR','SECRETAIRE_PRESENCE','RESPONSABLE_SEMAINE'].includes(member.role))throw new ForbiddenException('Le compte sélectionné ne peut pas recevoir ces autorisations.');const auditReason=reason.trim();if(auditReason.length<8)throw new BadRequestException('Le motif doit contenir au moins huit caractères.');await this.prisma.$transaction(async tx=>{await tx.user.update({where:{id},data:{permissions:normalized,sessionVersion:{increment:1}}});await tx.refreshToken.updateMany({where:{userId:id,revokedAt:null},data:{revokedAt:new Date()}});await tx.auditLog.create({data:{userId:actorId,action:'PERMISSIONS_PRESENCES_MODIFIEES',entity:'UserAccess',entityId:id,before:{permissions:member.permissions},after:{permissions:normalized},reason:auditReason}});});return {id,role:member.role,permissions:normalized};}
  async requestPasswordReset(emailInput:string){
    const started=Date.now(),message='Si cette adresse correspond à un compte, un code de récupération sera envoyé. Il expire après 15 minutes. Le plafond quotidien d’envoi peut retarder le message ; si aucun e-mail n’arrive, contactez la paroisse.';
    const reply=async()=>{await new Promise(resolve=>setTimeout(resolve,Math.max(0,1_000-(Date.now()-started))));return {message};};
    const email=emailInput.trim().toLowerCase(),user=await this.prisma.user.findUnique({where:{email},select:{id:true,email:true,fullName:true,role:true,active:true}});
    if(!user||!user.active||!['ADMIN','SUPER_ADMIN','EDITEUR','SECRETAIRE_PRESENCE','RESPONSABLE_SEMAINE','SECRETAIRE_PROGRAMME','TRESORIER','FIDELE'].includes(user.role))return reply();
    const recent=await this.prisma.passwordResetToken.findFirst({where:{userId:user.id,createdAt:{gt:new Date(Date.now()-60_000)}},select:{id:true}});
    if(recent)return reply();
    const code=String(randomBytes(4).readUInt32BE(0)%1_000_000).padStart(6,'0'),codeHash=await argon2.hash(code,{type:argon2.argon2id}),expiresAt=new Date(Date.now()+15*60_000);
    await this.prisma.passwordResetToken.updateMany({where:{userId:user.id,usedAt:null},data:{usedAt:new Date()}});
    const saved=await this.prisma.passwordResetToken.create({data:{userId:user.id,tokenHash:codeHash,expiresAt,failedAttempts:0}});
    const html=`<p>Bonjour ${this.escapeHtml(user.fullName??'responsable')},</p><p>Votre code de récupération est :</p><p style="font-size:24px;font-weight:bold;letter-spacing:5px">${code}</p><p>Il est valable 15 minutes et ne peut être utilisé qu’une seule fois. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.</p>`;
    const sent=this.emailQuota?await this.emailQuota.sendImmediate(user.email,'Code de récupération · Amour des Apôtres',html):false;
    if(!sent)await this.prisma.passwordResetToken.updateMany({where:{id:saved.id,usedAt:null},data:{usedAt:new Date()}});
    return reply();
  }
  async resetPassword(dto:ResetPasswordDto){
    if(dto.password!==dto.confirmPassword)throw new BadRequestException('Les deux mots de passe ne correspondent pas.');
    if(forbiddenPasswords.has(dto.password.toLowerCase()))throw new BadRequestException('Choisissez un mot de passe moins courant.');
    const email=dto.email.trim().toLowerCase(),user=await this.prisma.user.findUnique({where:{email},select:{id:true,active:true}}),now=new Date();
    const generic='Le code ou les informations de récupération sont invalides, ou le code a expiré.';
    if(!user||!user.active)throw new BadRequestException(generic);
    const candidates=await this.prisma.passwordResetToken.findMany({where:{userId:user.id,usedAt:null,expiresAt:{gt:now},failedAttempts:{lt:5}},select:{id:true,tokenHash:true,failedAttempts:true}});
    let matched:typeof candidates[number]|undefined;
    for(const candidate of candidates)if(await argon2.verify(candidate.tokenHash,dto.code).catch(()=>false)){matched=candidate;break;}
    if(!matched){await Promise.all(candidates.map(row=>this.prisma.passwordResetToken.updateMany({where:{id:row.id,usedAt:null,failedAttempts:{lt:5}},data:{failedAttempts:{increment:1}}})));throw new BadRequestException(generic);}
    const passwordHash=await argon2.hash(dto.password,{type:argon2.argon2id});
    await this.prisma.$transaction(async tx=>{
      const consumed=await tx.passwordResetToken.updateMany({where:{id:matched!.id,usedAt:null,expiresAt:{gt:now},failedAttempts:{lt:5}},data:{usedAt:now}});
      if(consumed.count!==1)throw new BadRequestException(generic);
      await tx.user.update({where:{id:user.id},data:{passwordHash,failedAttempts:0,lockedUntil:null,sessionVersion:{increment:1}}});
      await tx.refreshToken.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:now}});
      await tx.passwordResetToken.updateMany({where:{userId:user.id,usedAt:null},data:{usedAt:now}});
      await tx.auditLog.create({data:{userId:user.id,action:'RESET_UTILISE',entity:'UserSecurity',entityId:user.id}});
    });
    return {message:'Votre mot de passe a été modifié. Vous pouvez vous connecter.'};
  }
  private escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));}
  private requireWeekday(value:number|undefined|null){if(!value||!Number.isInteger(value)||value<1||value>7)throw new BadRequestException('Choisissez un jour de la semaine, du lundi au dimanche.');return value;}
  private weekdayLabel(value:number){return ['','lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'][value]??'jour non défini';}
  private sessionIdleMinutes(){const value=Number(process.env.SESSION_IDLE_MINUTES??30);return Number.isInteger(value)&&value>=5&&value<=240?value:30;}
  private sessionAbsoluteDays(){const value=Number(process.env.SESSION_ABSOLUTE_DAYS??30);return Number.isInteger(value)&&value>=1&&value<=90?value:30;}
  private async session(user:{id:string;role:UserRole;fullName:string|null;email:string;sessionVersion:number;mustChangePassword:boolean},firstLogin=false){const refreshToken=randomBytes(32).toString('base64url'),family=randomUUID(),now=new Date();await this.prisma.refreshToken.create({data:{userId:user.id,hashedToken:createHash('sha256').update(refreshToken).digest('hex'),expiresAt:new Date(now.getTime()+7*24*60*60_000),family,lastSeenAt:now}});return {accessToken:signToken(user,family),refreshToken,expiresIn:600,user:{id:user.id,role:user.role,name:user.fullName,email:user.email,permissions:(user as any).permissions??[],mustChangePassword:user.mustChangePassword,firstLogin}};}
}

@UseGuards(RateLimitGuard)
@Controller('auth')
export class AuthController {
  constructor(private auth:AuthService){}
  private setSessionCookies(response:any,session:{accessToken:string;refreshToken:string}){const secure=process.env.NODE_ENV==='production';response.cookie('paroisse_access',session.accessToken,sessionCookieOptions(secure,600_000));response.cookie('paroisse_refresh',session.refreshToken,sessionCookieOptions(secure,7*24*60*60_000));response.cookie('paroisse_csrf',randomBytes(32).toString('base64url'),{httpOnly:false,secure,sameSite:'strict',path:'/',maxAge:7*24*60*60_000});}
  private publicSession(session:any){return {expiresIn:session.expiresIn,user:session.user};}
  @Post('register') register(@Body() dto:RegisterAccountDto,@Req() req:any){return this.auth.registerManagedAccount(dto,req.ip??'unknown');}
  @Post('register/faithful') registerFaithful(@Body() dto:RegisterFaithfulDto,@Req() req:any){return this.auth.registerFaithful(dto,req.ip??'unknown');}
  @Post('password/forgot') async forgotPassword(@Body() dto:ForgotPasswordDto,@Req() req:any){await this.auth.logPasswordResetRequest(dto.email,req.ip);return this.auth.requestPasswordReset(dto.email);}
  @Post('password/reset') resetPassword(@Body() dto:ResetPasswordDto){return this.auth.resetPassword(dto);}
  @Post('login') async login(@Body() dto:LoginDto,@Req() req:any,@Res({passthrough:true}) response:any){const session=await this.auth.login(dto,false,req.ip);await this.auth.recordSessionDevice(session.refreshToken,req.ip??'unknown',req.headers['user-agent']??'');this.setSessionCookies(response,session);return this.publicSession(session);}
  @Post('admin/login') async adminLogin(@Body() dto:LoginDto,@Req() req:any,@Res({passthrough:true}) response:any){const session=await this.auth.login(dto,true,req.ip);await this.auth.recordSessionDevice(session.refreshToken,req.ip??'unknown',req.headers['user-agent']??'');this.setSessionCookies(response,session);return this.publicSession(session);}
  @Post('subadmin/login') async subAdminLogin(@Body() dto:LoginDto,@Req() req:any,@Res({passthrough:true}) response:any){const session=await this.auth.login(dto,true,req.ip,true);await this.auth.recordSessionDevice(session.refreshToken,req.ip??'unknown',req.headers['user-agent']??'');this.setSessionCookies(response,session);return this.publicSession(session);}
  @Post('faithful/login') async faithfulLogin(@Body() dto:LoginDto,@Req() req:any,@Res({passthrough:true}) response:any){const session=await this.auth.login(dto,false,req.ip,false,true);await this.auth.recordSessionDevice(session.refreshToken,req.ip??'unknown',req.headers['user-agent']??'');this.setSessionCookies(response,session);return this.publicSession(session);}
  @UseGuards(JwtAuthGuard) @Get('session') session(@Req() req:any){return {user:{id:req.user.sub,role:req.user.role,permissions:req.user.permissions??[],mustChangePassword:!!req.user.mustChangePassword}};}
  @UseGuards(JwtAuthGuard) @Get('account/profile') profile(@Req() req:any){return this.auth.accountProfile(req.user.sub);}
  @UseGuards(JwtAuthGuard) @Get('account/sessions') sessions(@Req() req:any){return this.auth.sessions(req.user.sub,this.cookieValue(req.headers.cookie,'paroisse_refresh'));}
  @UseGuards(JwtAuthGuard) @Post('account/sessions/revoke-all') revokeAllSessions(@Req() req:any,@Res({passthrough:true}) response:any){const result=this.auth.revokeAllSessions(req.user.sub);response.clearCookie('paroisse_access',{path:'/'});response.clearCookie('paroisse_refresh',{path:'/'});response.clearCookie('paroisse_csrf',{path:'/'});return result;}
  @UseGuards(JwtAuthGuard) @Delete('account/sessions/:id') revokeSession(@Req() req:any,@Param('id') id:string){return this.auth.revokeSession(req.user.sub,id);}
  @UseGuards(JwtAuthGuard) @Post('account/password') changePassword(@Req() req:any,@Body() dto:ChangePasswordDto){return this.auth.changePassword(req.user.sub,dto,this.cookieValue(req.headers.cookie,'paroisse_refresh'));}
  @UseGuards(JwtAuthGuard) @Patch('account/email') async changeEmail(@Req() req:any,@Body() dto:ChangeEmailDto,@Res({passthrough:true}) response:any){const result=await this.auth.changeEmail(req.user.sub,dto);if(result.changed){response.clearCookie('paroisse_access',{path:'/'});response.clearCookie('paroisse_refresh',{path:'/'});response.clearCookie('paroisse_csrf',{path:'/'});}return result;}
  @UseGuards(JwtAuthGuard) @Post('account/password/first-login') firstLoginPassword(@Req() req:any,@Body() dto:ChangePasswordDto){return this.auth.changeFirstLoginPassword(req.user.sub,dto);}
  @Post('refresh') async refresh(@Req() req:any,@Res({passthrough:true}) response:any){const token=this.cookieValue(req.headers.cookie,'paroisse_refresh');if(!token)throw new UnauthorizedException('Connexion expirée.');const session=await this.auth.refresh(token);await this.auth.recordSessionDevice(session.refreshToken,req.ip??'unknown',req.headers['user-agent']??'');this.setSessionCookies(response,session);return this.publicSession(session);}
  @Post('logout') async logout(@Req() req:any,@Res({passthrough:true}) response:any){await this.auth.logout(this.cookieValue(req.headers.cookie,'paroisse_refresh'));response.clearCookie('paroisse_access',{path:'/'});response.clearCookie('paroisse_refresh',{path:'/'});response.clearCookie('paroisse_csrf',{path:'/'});return {message:'Déconnexion effectuée.'};}
  private cookieValue(header:string|undefined,name:string){return header?.split(';').map((part:string)=>part.trim()).find((part:string)=>part.startsWith(`${name}=`))?.slice(name.length+1);}
  @UseGuards(JwtAuthGuard) @Get('admin/members') members(@Req() req:any){if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new ForbiddenException('La liste des comptes est réservée aux personnes administratrices.');return this.auth.listManagedAccounts();}
  @UseGuards(JwtAuthGuard) @Get('admin/presenters') presenters(@Req() req:any){if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new ForbiddenException('La gestion des intervenants est réservée à l’administration.');return this.auth.listManagedPresenters();}
  @UseGuards(JwtAuthGuard) @Post('admin/presenters') createPresenter(@Body() body:ManagePresenterDto,@Req() req:any){if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new ForbiddenException('Seul l’administrateur peut ajouter un intervenant.');return this.auth.createManagedPresenter(body,req.user.sub);}
  @UseGuards(JwtAuthGuard) @Patch('admin/presenters/:id') updatePresenter(@Param('id') id:string,@Body() body:ManagePresenterDto,@Req() req:any){if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new ForbiddenException('Seul l’administrateur peut modifier un intervenant.');return this.auth.updateManagedPresenter(id,body,req.user.sub);}
  @UseGuards(JwtAuthGuard) @Patch('admin/presenters/:id/retirer') removePresenter(@Param('id') id:string,@Body() body:RemovePresenterDto,@Req() req:any){if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new ForbiddenException('Seul l’administrateur peut retirer un intervenant.');return this.auth.removeManagedPresenter(id,body,req.user.sub);}
  @UseGuards(JwtAuthGuard) @Post('admin/members') createManagedAccount(@Body() body:CreateManagedAccountDto,@Req() req:any){if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new ForbiddenException('Seul l’administrateur principal peut créer les comptes responsables.');return this.auth.createManagedAccount(body,req.user.sub);}
  @UseGuards(JwtAuthGuard) @Patch('admin/members/:id') updateManagedAccount(@Param('id') id:string,@Body() body:UpdateManagedAccountDto,@Req() req:any){if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new ForbiddenException('Seul l’administrateur principal peut modifier les comptes responsables.');return this.auth.updateManagedAccount(id,body,req.user.sub);}
  @UseGuards(JwtAuthGuard) @Patch('admin/members/:id/permissions') subAdminPermissions(@Param('id') id:string,@Body() body:SubAdminPermissionsDto,@Req() req:any){if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new ForbiddenException('Seul l’administrateur principal peut attribuer ces autorisations.');return this.auth.setSubAdminPermissions(id,body.permissions,req.user.sub,body.reason,body);}
  @UseGuards(JwtAuthGuard) @Patch('admin/members/:id/message-responder') setMessageResponder(@Param('id') id:string,@Body() body:MessageResponderDto,@Req() req:any){if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new ForbiddenException('Seule l’administration peut désigner les répondants.');return this.auth.setMessageResponder(id,body.enabled,req.user.sub);}
}
