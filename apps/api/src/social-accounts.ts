import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Logger, Param, Patch, Post, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDateString, IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { Cron } from '@nestjs/schedule';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';

class SocialRegisterDto {
  @IsString() @Length(3,120) fullName!:string;
  @IsOptional() @IsString() @Matches(/^\+?[0-9 ()-]{8,20}$/) phone?:string;
  @IsEmail() email!:string;
  @IsString() @MinLength(12) @MaxLength(128) password!:string;
  @IsDateString() dateOfBirth!:string;
  @IsBoolean() acceptCharter!:boolean;
  @IsString() @Length(1,40) charterVersion!:string;
  @IsOptional() @IsString() @MaxLength(4096) captchaToken?:string;
}
class SuspendSocialAccountDto { @IsBoolean() suspended!:boolean; @IsOptional() @IsString() @Length(8,1000) reason?:string; @IsOptional() @IsDateString() suspendedUntil?:string; }
class DeleteSocialAccountDto { @IsString() @Length(8,1000) reason!:string; }
class ChangePasswordDto { @IsString() @MaxLength(128) currentPassword!:string; @IsString() @MinLength(12) @MaxLength(128) newPassword!:string; @IsString() @MinLength(12) @MaxLength(128) confirmPassword!:string; }
class CancelDeletionDto { @IsEmail() email!:string; @IsString() @MaxLength(128) password!:string; }

const forbiddenPasswords=new Set(['password1234','123456789012','azerty123456','qwerty123456','motdepasse123']);

@Injectable()
export class SocialAccountsService {
  private readonly logger=new Logger(SocialAccountsService.name);
  constructor(private readonly prisma:PrismaService){}

  async sessions(userId:string,currentToken?:string){const rows=await this.prisma.refreshToken.findMany({where:{userId},orderBy:{createdAt:'desc'},select:{id:true,createdAt:true,expiresAt:true,revokedAt:true,hashedToken:true,userAgent:true,ip:true}});const currentHash=currentToken?createHash('sha256').update(currentToken).digest('hex'):'';return rows.map(({hashedToken,...row})=>({...row,isCurrent:!!currentHash&&hashedToken===currentHash,device:row.userAgent?row.userAgent.slice(0,180):'Appareil non identifié'}));}
  async revokeSession(userId:string,id:string){const result=await this.prisma.refreshToken.updateMany({where:{id,userId,revokedAt:null},data:{revokedAt:new Date()}});if(!result.count)throw new ForbiddenException('Cette session ne vous appartient pas ou est déjà fermée.');await this.prisma.auditLog.create({data:{userId,action:'SESSION_REVOQUEE',entity:'RefreshToken',entityId:id}});return {id,revoked:true};}
  async changePassword(userId:string,dto:ChangePasswordDto,currentToken?:string){if(dto.newPassword!==dto.confirmPassword)throw new BadRequestException('La confirmation du nouveau mot de passe ne correspond pas.');if(forbiddenPasswords.has(dto.newPassword.toLowerCase()))throw new BadRequestException('Choisissez un mot de passe moins courant.');const user=await this.prisma.user.findUnique({where:{id:userId},select:{passwordHash:true}});if(!user||!await argon2.verify(user.passwordHash,dto.currentPassword).catch(()=>false))throw new ForbiddenException('Le mot de passe actuel est incorrect.');const passwordHash=await argon2.hash(dto.newPassword,{type:argon2.argon2id}),currentHash=currentToken?createHash('sha256').update(currentToken).digest('hex'):'';await this.prisma.$transaction(async tx=>{await tx.user.update({where:{id:userId},data:{passwordHash}});await tx.refreshToken.updateMany({where:{userId,revokedAt:null,...(currentHash?{hashedToken:{not:currentHash}}:{})},data:{revokedAt:new Date()}});await tx.auditLog.create({data:{userId,action:'MOT_DE_PASSE_MODIFIE',entity:'UserSecurity',entityId:userId}});});return {updated:true,sessionsRevoked:true};}
  async exportData(userId:string){const [user,posts,comments,reactions,shares,saved,blocks]=await Promise.all([this.prisma.user.findUnique({where:{id:userId},select:{id:true,fullName:true,phone:true,email:true,role:true,dateOfBirth:true,socialBio:true,socialNotificationsEnabled:true,socialProfileDiscoverable:true}}),this.prisma.socialPost.findMany({where:{authorId:userId},select:{id:true,body:true,visibility:true,createdAt:true,updatedAt:true,deletedAt:true}}),this.prisma.socialComment.findMany({where:{authorId:userId},select:{id:true,postId:true,parentId:true,body:true,createdAt:true,deletedAt:true}}),this.prisma.socialReaction.findMany({where:{userId},select:{targetKey:true,type:true,createdAt:true}}),this.prisma.socialShare.findMany({where:{userId},select:{postId:true,createdAt:true}}),this.prisma.socialSavedPost.findMany({where:{userId},select:{postId:true,createdAt:true}}),this.prisma.socialBlock.findMany({where:{blockerId:userId},select:{blockedId:true,createdAt:true}})]);if(!user)throw new ForbiddenException('Compte introuvable.');await this.prisma.auditLog.create({data:{userId,action:'EXPORT_DONNEES_PERSONNELLES',entity:'UserSecurity',entityId:userId}});return {exportedAt:new Date().toISOString(),account:user,posts,comments,reactions,shares,saved,blockedAccounts:blocks};}
  async requestDeletion(userId:string,reason:string){const scheduledAt=new Date(Date.now()+14*86400_000);await this.prisma.$transaction(async tx=>{await tx.user.update({where:{id:userId},data:{active:false,deletionScheduledAt:scheduledAt,sessionVersion:{increment:1}}});await tx.refreshToken.updateMany({where:{userId,revokedAt:null},data:{revokedAt:new Date()}});await tx.auditLog.create({data:{userId,action:'SUPPRESSION_COMPTE_DEMANDEE',entity:'UserSecurity',entityId:userId,after:{scheduledAt:scheduledAt.toISOString()},reason:reason.trim()}});});return {scheduledAt,graceDays:14};}
  async cancelDeletion(dto:CancelDeletionDto){const email=dto.email.trim().toLowerCase(),user=await this.prisma.user.findUnique({where:{email}}),generic='Si le compte est en période de fermeture et que le mot de passe concorde, la demande sera annulée.';if(!user?.deletionScheduledAt||user.deletionScheduledAt<=new Date()||!await argon2.verify(user.passwordHash,dto.password).catch(()=>false))return {message:generic};await this.prisma.$transaction(async tx=>{await tx.user.update({where:{id:user.id},data:{active:true,deletionScheduledAt:null,sessionVersion:{increment:1}}});await tx.auditLog.create({data:{userId:user.id,action:'SUPPRESSION_COMPTE_ANNULEE',entity:'UserSecurity',entityId:user.id}});});return {message:generic};}

  @Cron('0 30 2 * * *',{timeZone:'Africa/Porto-Novo'})
  async processAccountDeletions(){const due=await this.prisma.user.findMany({where:{deletionScheduledAt:{lte:new Date()}},select:{id:true}});for(const user of due){await this.prisma.$transaction(async tx=>{await tx.auditLog.create({data:{userId:user.id,action:'SUPPRESSION_COMPTE_EFFECTUEE',entity:'UserSecurity',entityId:user.id}});await tx.user.delete({where:{id:user.id}});});}}

  registrationConfig(){
    const rawAge=Number(process.env.SOCIAL_MIN_AGE),minimumAge=Number.isInteger(rawAge)&&rawAge>=13&&rawAge<=120?rawAge:13;
    const charterVersion=process.env.SOCIAL_CHARTER_VERSION?.trim()||'2026-10',charterText=process.env.SOCIAL_CHARTER_TEXT?.trim()||'Je m’engage à utiliser cet espace avec respect, bienveillance et conformément aux enseignements de l’Église.';
    const captchaEnabled=process.env.CAPTCHA_ENABLED==='true',hasSecret=!!process.env.CAPTCHA_SECRET_KEY?.trim(),hasSiteKey=!!process.env.CAPTCHA_SITE_KEY?.trim();
    const captchaConfigured=hasSecret===hasSiteKey&&(!captchaEnabled||hasSecret&&hasSiteKey);
    const mailConfigured=!!(process.env.RESEND_API_KEY&&process.env.MAIL_FROM&&process.env.APP_PUBLIC_URL);
    const captchaMessage=!captchaConfigured?'L’inscription est désactivée : CAPTCHA_ENABLED=true exige CAPTCHA_SITE_KEY et CAPTCHA_SECRET_KEY.':captchaEnabled?'Une vérification anti-robot est requise pour créer un compte.':'La vérification anti-robot est désactivée par défaut. Les inscriptions restent limitées par adresse IP et adresse e-mail.';
    return {enabled:captchaConfigured,minimumAge,charterVersion,charterText,captchaEnabled:captchaEnabled&&captchaConfigured,captchaMessage,captchaSiteKey:captchaEnabled&&captchaConfigured?process.env.CAPTCHA_SITE_KEY!:null,mailConfigured};
  }

  async register(dto:SocialRegisterDto){
    const email=dto.email.trim().toLowerCase();
    if(forbiddenPasswords.has(dto.password.toLowerCase()))throw new BadRequestException('Choisissez un mot de passe moins courant.');
    if(await this.prisma.user.findUnique({where:{email}}))return {message:'Si cette adresse peut être enregistrée, vous pourrez vous connecter.'};
    const config=this.registrationConfig();
    if(!config.enabled)throw new ServiceUnavailableException('L’inscription est momentanément indisponible : la configuration de la vérification anti-robot est incomplète.');
    if(!dto.acceptCharter||dto.charterVersion!==config.charterVersion)throw new BadRequestException('Acceptez la charte actuellement en vigueur.');
    const birthDate=this.parseBirthDate(dto.dateOfBirth),age=this.ageOn(birthDate,new Date());
    if(age<config.minimumAge)throw new BadRequestException(`Vous devez avoir au moins ${config.minimumAge} ans pour créer un compte.`);
    if(age>120)throw new BadRequestException('Vérifiez votre date de naissance.');
    if(this.isDisposableEmail(email))throw new BadRequestException('Utilisez une adresse e-mail personnelle afin de pouvoir récupérer votre mot de passe si nécessaire.');
    await this.verifyCaptcha(dto.captchaToken);
    const passwordHash=await argon2.hash(dto.password,{type:argon2.argon2id});
    let user;
    try{user=await this.prisma.user.create({data:{fullName:dto.fullName.trim(),phone:dto.phone?.trim()||null,email,passwordHash,role:UserRole.FIDELE,active:true,dateOfBirth:birthDate,emailVerifiedAt:null,charterVersion:config.charterVersion,charterAcceptedAt:new Date()}});}
    catch(error:any){if(error?.code==='P2002')return {message:'Si cette adresse peut être enregistrée, vous pourrez vous connecter.'};throw error;}
    await this.prisma.userNotification.create({data:{userId:user.id,message:'Bienvenue à la paroisse Amour des Apôtres. « Ta parole est une lampe à mes pieds, et une lumière sur mon sentier. » — Psaume 119:105'}}).catch(()=>undefined);
    return {message:'Votre compte fidèle est créé. Vous pouvez vous connecter sans confirmation par e-mail. Votre adresse e-mail servira à récupérer votre mot de passe en cas d’oubli.'};
  }

  listForAdministration(){return this.prisma.user.findMany({where:{role:{in:[UserRole.FIDELE,UserRole.MODERATEUR]}},select:{id:true,fullName:true,email:true,role:true,active:true,emailVerifiedAt:true,suspendedAt:true,suspendedUntil:true},orderBy:{fullName:'asc'}});}

  async deleteFaithful(id:string,reason:string,actorId:string){
    const member=await this.prisma.user.findUnique({where:{id},select:{id:true,role:true,active:true,emailVerifiedAt:true}});
    if(!member||member.role!==UserRole.FIDELE)throw new ForbiddenException('Seuls les comptes fidèles peuvent être supprimés depuis cette page.');
    await this.prisma.$transaction(async tx=>{
      await tx.auditLog.create({data:{userId:actorId,action:'COMPTE_FIDELE_SUPPRIME',entity:'UserSecurity',entityId:id,before:{role:member.role,active:member.active,emailVerified:!!member.emailVerifiedAt},reason:reason.trim()}});
      await tx.user.delete({where:{id}});
    });
    return {id,deleted:true};
  }

  @Cron('0 0 9 * * *',{timeZone:'Africa/Porto-Novo'})
  async remindInactiveFaithful(){
    const apiKey=process.env.RESEND_API_KEY,from=process.env.MAIL_FROM;
    if(!apiKey||!from||!process.env.APP_PUBLIC_URL)return;
    const rawDays=Number(process.env.SOCIAL_INACTIVITY_DAYS??30),days=Number.isInteger(rawDays)&&rawDays>=7&&rawDays<=365?rawDays:30;
    const now=new Date(),cutoff=new Date(now.getTime()-days*86400_000);
    const users=await this.prisma.user.findMany({where:{role:UserRole.FIDELE,active:true,suspendedAt:null,socialNotificationsEnabled:true},select:{id:true,email:true,fullName:true}});
    for(const user of users){
      const activity=await this.prisma.auditLog.findFirst({where:{userId:user.id,action:{in:['CONNEXION_REUSSIE','EMAIL_CONFIRME']}},orderBy:{createdAt:'desc'},select:{createdAt:true}});
      const lastActivity=activity?.createdAt;
      if(!lastActivity)continue;
      if(lastActivity>cutoff)continue;
      const recentReminder=await this.prisma.auditLog.findFirst({where:{userId:user.id,action:'RAPPEL_INACTIVITE_ENVOYE',createdAt:{gt:cutoff}},select:{id:true}});
      if(recentReminder)continue;
      try{
        const name=this.escapeHtml(user.fullName||'fidèle');
        const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[user.email],subject:'Vous nous manquez · Amour des Apôtres',html:`<p>Bonjour ${name},</p><p>La communauté de la paroisse Amour des Apôtres serait heureuse de vous retrouver dans votre espace fidèle.</p><p>Connectez-vous pour découvrir les actualités et rester en lien avec la paroisse.</p><p>« N’abandonnons pas notre assemblée, comme c’est la coutume de quelques-uns. » — Hébreux 10:25</p><p><a href="${this.escapeHtml(process.env.APP_PUBLIC_URL!.replace(/\/$/,''))}/connexion">Ouvrir mon espace</a></p>`})});
        if(response.ok)await this.prisma.auditLog.create({data:{userId:user.id,action:'RAPPEL_INACTIVITE_ENVOYE',entity:'UserSecurity',entityId:user.id}});
      }catch{this.logger.warn('Un rappel d’inactivité n’a pas pu être envoyé.');}
    }
  }

  async setSuspension(id:string,suspended:boolean,reason:string|undefined,suspendedUntil:string|undefined,actorId:string){
    const member=await this.prisma.user.findUnique({where:{id},select:{id:true,role:true,suspendedAt:true,suspendedUntil:true}});
    if(!member||member.role===UserRole.ADMIN||member.role===UserRole.SUPER_ADMIN)throw new ForbiddenException('Les comptes administrateurs ne peuvent pas être suspendus par cette action.');
    let until:Date|null=null;
    if(suspended){if(!reason?.trim())throw new BadRequestException('Un motif est obligatoire pour suspendre un compte.');if(suspendedUntil){until=new Date(suspendedUntil);if(Number.isNaN(until.getTime())||until<=new Date())throw new BadRequestException('La fin de suspension doit être une date future.');}}
    await this.prisma.$transaction(async tx=>{
      await tx.user.update({where:{id},data:{suspendedAt:suspended?new Date():null,suspensionReason:suspended?reason!.trim():null,suspendedUntil:suspended?until:null,sessionVersion:{increment:1}}});
      await tx.refreshToken.updateMany({where:{userId:id,revokedAt:null},data:{revokedAt:new Date()}});
      await tx.auditLog.create({data:{userId:actorId,action:suspended?'COMPTE_SUSPENDU':'COMPTE_REACTIVE',entity:'UserSecurity',entityId:id,before:{role:member.role,suspendedAt:member.suspendedAt,suspendedUntil:member.suspendedUntil},after:{role:member.role,suspendedAt:suspended?new Date().toISOString():null,suspendedUntil:until?.toISOString()??null},reason:suspended?reason!.trim():undefined}});
    });
    return {id,suspended,suspendedUntil:until};
  }

  private async verifyCaptcha(token?:string){if(process.env.CAPTCHA_ENABLED!=='true')return;const secret=process.env.CAPTCHA_SECRET_KEY?.trim();if(!secret||!process.env.CAPTCHA_SITE_KEY?.trim())throw new ServiceUnavailableException('L’inscription est momentanément indisponible : la configuration de la vérification anti-robot est incomplète.');if(!token)throw new BadRequestException('Veuillez terminer la vérification anti-robot.');const body=new URLSearchParams({secret,response:token});const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});if(!response.ok)throw new ServiceUnavailableException('La vérification de sécurité est momentanément indisponible.');const result=await response.json() as {success?:boolean};if(!result.success)throw new BadRequestException('La vérification de sécurité a échoué. Réessayez.');}
  private isDisposableEmail(email:string){const domain=email.split('@').pop()?.toLowerCase()??'';const configured=(process.env.DISPOSABLE_EMAIL_DOMAINS??'mailinator.com,10minutemail.com,guerrillamail.com,tempmail.com,yopmail.com,throwawaymail.com').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);return configured.includes(domain);}
  private parseBirthDate(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new BadRequestException('La date de naissance doit être au format AAAA-MM-JJ.');const date=new Date(`${value}T00:00:00.000Z`);if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value)throw new BadRequestException('La date de naissance est invalide.');return date;}
  private ageOn(birth:Date,today:Date){let age=today.getUTCFullYear()-birth.getUTCFullYear();if(today.getUTCMonth()<birth.getUTCMonth()||(today.getUTCMonth()===birth.getUTCMonth()&&today.getUTCDate()<birth.getUTCDate()))age--;return age;}
  private escapeHtml(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));}
}

@UseGuards(RateLimitGuard)
@Controller('auth/social')
export class SocialAccountsController {
  constructor(private readonly social:SocialAccountsService){}
  @Get('registration-config') config(){return this.social.registrationConfig();}
  @Post('register') register(@Body() dto:SocialRegisterDto){return this.social.register(dto);}
  @UseGuards(JwtAuthGuard) @Get('admin/members') members(@Req() req:any){if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new ForbiddenException('Action réservée à l’administration paroissiale.');return this.social.listForAdministration();}
  @UseGuards(JwtAuthGuard) @Patch('admin/members/:id/suspension') suspend(@Param('id') id:string,@Body() dto:SuspendSocialAccountDto,@Req() req:any){if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new ForbiddenException('Action réservée à l’administration paroissiale.');return this.social.setSuspension(id,dto.suspended,dto.reason,dto.suspendedUntil,req.user.sub);}
  @UseGuards(JwtAuthGuard) @Delete('admin/members/:id') delete(@Param('id') id:string,@Body() dto:DeleteSocialAccountDto,@Req() req:any){if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new ForbiddenException('Action réservée à l’administration paroissiale.');return this.social.deleteFaithful(id,dto.reason,req.user.sub);}
  @UseGuards(JwtAuthGuard) @Get('account/sessions') sessions(@Req() req:any){return this.social.sessions(req.user.sub,this.cookieValue(req,'paroisse_refresh'));}
  @UseGuards(JwtAuthGuard) @Delete('account/sessions/:id') revokeSession(@Req() req:any,@Param('id') id:string){return this.social.revokeSession(req.user.sub,id);}
  @UseGuards(JwtAuthGuard) @Post('account/password') changePassword(@Req() req:any,@Body() dto:ChangePasswordDto){return this.social.changePassword(req.user.sub,dto,this.cookieValue(req,'paroisse_refresh'));}
  @UseGuards(JwtAuthGuard) @Get('account/export') exportData(@Req() req:any){return this.social.exportData(req.user.sub);}
  @UseGuards(JwtAuthGuard) @Delete('account') deleteAccount(@Req() req:any,@Body() dto:DeleteSocialAccountDto){return this.social.requestDeletion(req.user.sub,dto.reason);}
  @Post('account/deletion/cancel') cancelDeletion(@Body() dto:CancelDeletionDto){return this.social.cancelDeletion(dto);}
  private cookieValue(req:any,name:string){return String(req.headers.cookie??'').split(';').map((part:string)=>part.trim()).find((part:string)=>part.startsWith(`${name}=`))?.slice(name.length+1);}
}
