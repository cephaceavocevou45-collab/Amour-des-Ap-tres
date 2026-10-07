import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Param, Patch, Post, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDateString, IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { createHash, randomBytes } from 'node:crypto';
import { UserRole } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';
import * as argon2 from 'argon2';

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
class VerifyEmailDto { @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!:string; }
class ResendEmailDto { @IsEmail() email!:string; }
class SuspendSocialAccountDto { @IsBoolean() suspended!:boolean; @IsOptional() @IsString() @Length(8,1000) reason?:string; @IsOptional() @IsDateString() suspendedUntil?:string; }

const forbiddenPasswords=new Set(['password1234','123456789012','azerty123456','qwerty123456','motdepasse123']);

@Injectable()
export class SocialAccountsService {
  constructor(private readonly prisma:PrismaService){}

  registrationConfig(){
    const rawAge=Number(process.env.SOCIAL_MIN_AGE),minimumAge=Number.isInteger(rawAge)&&rawAge>=13&&rawAge<=120?rawAge:null;
    const charterVersion=process.env.SOCIAL_CHARTER_VERSION?.trim()||null,charterText=process.env.SOCIAL_CHARTER_TEXT?.trim()||null;
    const captchaConfigured=!!process.env.CAPTCHA_SECRET_KEY===!!process.env.CAPTCHA_SITE_KEY;
    return {enabled:!!(minimumAge&&charterVersion&&charterText&&process.env.RESEND_API_KEY&&process.env.MAIL_FROM&&process.env.APP_PUBLIC_URL&&captchaConfigured),minimumAge,charterVersion,charterText,captchaSiteKey:process.env.CAPTCHA_SITE_KEY||null};
  }

  async register(dto:SocialRegisterDto){
    const email=dto.email.trim().toLowerCase();
    if(forbiddenPasswords.has(dto.password.toLowerCase()))throw new BadRequestException('Choisissez un mot de passe moins courant.');
    if(await this.prisma.user.findUnique({where:{email}}))return {message:'Si cette adresse peut être enregistrée, un lien de confirmation lui sera envoyé.'};
    const config=this.registrationConfig();
    if(!config.enabled)throw new ServiceUnavailableException('La création de comptes fidèles n’est pas encore configurée.');
    if(!dto.acceptCharter||dto.charterVersion!==config.charterVersion)throw new BadRequestException('Acceptez la charte actuellement en vigueur.');
    const birthDate=this.parseBirthDate(dto.dateOfBirth),age=this.ageOn(birthDate,new Date());
    if(age<config.minimumAge!)throw new BadRequestException(`Vous devez avoir au moins ${config.minimumAge} ans pour créer un compte.`);
    if(age>120)throw new BadRequestException('Vérifiez votre date de naissance.');
    if(this.isDisposableEmail(email))throw new BadRequestException('Utilisez une adresse e-mail personnelle qui peut recevoir le lien de confirmation.');
    await this.verifyCaptcha(dto.captchaToken);
    const passwordHash=await argon2.hash(dto.password,{type:argon2.argon2id});
    let user;
    try{user=await this.prisma.user.create({data:{fullName:dto.fullName.trim(),phone:dto.phone?.trim()||null,email,passwordHash,role:UserRole.FIDELE,active:false,dateOfBirth:birthDate,emailVerifiedAt:null,charterVersion:config.charterVersion,charterAcceptedAt:new Date()}});}
    catch(error:any){if(error?.code==='P2002')return {message:'Si cette adresse peut être enregistrée, un lien de confirmation lui sera envoyé.'};throw error;}
    await this.sendVerification(user.id,user.email,user.fullName);
    return {message:'Si cette adresse peut être enregistrée, un lien de confirmation lui sera envoyé.'};
  }

  async confirm(token:string){
    const tokenHash=createHash('sha256').update(token).digest('hex'),now=new Date();
    const row=await this.prisma.emailVerificationToken.findUnique({where:{tokenHash},include:{user:true}});
    if(!row||row.usedAt||row.expiresAt<=now||row.user.role!==UserRole.FIDELE)throw new BadRequestException('Ce lien de confirmation est invalide ou a expiré. Demandez un nouvel envoi.');
    await this.prisma.$transaction(async tx=>{
      const claimed=await tx.emailVerificationToken.updateMany({where:{id:row.id,usedAt:null,expiresAt:{gt:now}},data:{usedAt:now}});
      if(claimed.count!==1)throw new BadRequestException('Ce lien de confirmation est invalide ou a expiré. Demandez un nouvel envoi.');
      await tx.user.update({where:{id:row.userId},data:{emailVerifiedAt:now,active:true,sessionVersion:{increment:1}}});
      await tx.refreshToken.updateMany({where:{userId:row.userId,revokedAt:null},data:{revokedAt:now}});
      await tx.auditLog.create({data:{userId:row.userId,action:'EMAIL_CONFIRME',entity:'UserSecurity',entityId:row.userId}});
    });
    return {message:'Votre adresse est confirmée. Votre compte fidèle est activé; vous pouvez vous connecter.'};
  }

  async resend(emailInput:string){
    const email=emailInput.trim().toLowerCase(),user=await this.prisma.user.findUnique({where:{email},select:{id:true,email:true,fullName:true,role:true,emailVerifiedAt:true}});
    if(user?.role===UserRole.FIDELE&&!user.emailVerifiedAt)await this.sendVerification(user.id,user.email,user.fullName);
    return {message:'Si cette adresse correspond à un compte fidèle non confirmé, un lien de confirmation sera envoyé.'};
  }

  listForAdministration(){return this.prisma.user.findMany({where:{role:{in:[UserRole.FIDELE,UserRole.MODERATEUR]}},select:{id:true,fullName:true,email:true,role:true,active:true,emailVerifiedAt:true,suspendedAt:true,suspendedUntil:true},orderBy:{fullName:'asc'}});}

  async setSuspension(id:string,suspended:boolean,reason:string|undefined,suspendedUntil:string|undefined,actorId:string){
    const member=await this.prisma.user.findUnique({where:{id},select:{id:true,role:true,suspendedAt:true,suspendedUntil:true}});
    const socialRoles:UserRole[]=[UserRole.FIDELE,UserRole.MODERATEUR];
    if(!member||!socialRoles.includes(member.role))throw new ForbiddenException('Seuls les comptes du réseau social peuvent être suspendus ici.');
    let until:Date|null=null;
    if(suspended){if(!reason?.trim())throw new BadRequestException('Un motif est obligatoire pour suspendre un compte.');if(suspendedUntil){until=new Date(suspendedUntil);if(Number.isNaN(until.getTime())||until<=new Date())throw new BadRequestException('La fin de suspension doit être une date future.');}}
    await this.prisma.$transaction(async tx=>{
      await tx.user.update({where:{id},data:{suspendedAt:suspended?new Date():null,suspensionReason:suspended?reason!.trim():null,suspendedUntil:suspended?until:null,sessionVersion:{increment:1}}});
      await tx.refreshToken.updateMany({where:{userId:id,revokedAt:null},data:{revokedAt:new Date()}});
      await tx.auditLog.create({data:{userId:actorId,action:suspended?'COMPTE_SUSPENDU':'COMPTE_REACTIVE',entity:'UserSecurity',entityId:id,before:{role:member.role,suspendedAt:member.suspendedAt,suspendedUntil:member.suspendedUntil},after:{role:member.role,suspendedAt:suspended?new Date().toISOString():null,suspendedUntil:until?.toISOString()??null},reason:suspended?reason!.trim():undefined}});
    });
    return {id,suspended,suspendedUntil:until};
  }

  private async sendVerification(userId:string,email:string,name:string|null){
    const token=randomBytes(32).toString('base64url'),tokenHash=createHash('sha256').update(token).digest('hex'),expiresAt=new Date(Date.now()+30*60_000);
    await this.prisma.emailVerificationToken.updateMany({where:{userId,usedAt:null},data:{usedAt:new Date()}});
    await this.prisma.emailVerificationToken.create({data:{userId,tokenHash,expiresAt}});
    const link=`${process.env.APP_PUBLIC_URL!.replace(/\/$/,'')}/confirmer-email?token=${encodeURIComponent(token)}`;
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.MAIL_FROM,to:[email],subject:'Confirmez votre adresse e-mail · Amour des Apôtres',html:`<p>Bonjour ${this.escapeHtml(name||'fidèle')},</p><p>Confirmez votre adresse pour activer votre compte paroissial.</p><p><a href="${link}">Confirmer mon adresse e-mail</a></p><p>Ce lien expire dans 30 minutes et ne peut être utilisé qu’une seule fois.</p>`})});
    if(!response.ok)throw new ServiceUnavailableException('Le message de confirmation n’a pas pu être envoyé. Vous pourrez demander un nouvel envoi.');
  }
  private async verifyCaptcha(token?:string){const secret=process.env.CAPTCHA_SECRET_KEY;if(!secret)return;if(!token)throw new BadRequestException('Veuillez confirmer que vous n’êtes pas un robot.');const body=new URLSearchParams({secret,response:token});const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});if(!response.ok)throw new ServiceUnavailableException('La vérification de sécurité est momentanément indisponible.');const result=await response.json() as {success?:boolean};if(!result.success)throw new BadRequestException('La vérification de sécurité a échoué. Réessayez.');}
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
  @Post('email/confirm') confirm(@Body() dto:VerifyEmailDto){return this.social.confirm(dto.token);}
  @Post('email/resend') resend(@Body() dto:ResendEmailDto){return this.social.resend(dto.email);}
  @UseGuards(JwtAuthGuard) @Get('admin/members') members(@Req() req:any){if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new ForbiddenException('Action réservée à l’administration paroissiale.');return this.social.listForAdministration();}
  @UseGuards(JwtAuthGuard) @Patch('admin/members/:id/suspension') suspend(@Param('id') id:string,@Body() dto:SuspendSocialAccountDto,@Req() req:any){if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new ForbiddenException('Action réservée à l’administration paroissiale.');return this.social.setSuspension(id,dto.suspended,dto.reason,dto.suspendedUntil,req.user.sub);}
}
