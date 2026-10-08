import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpException, Injectable, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Length, MaxLength, Min, Max } from 'class-validator';
import { SocialAppealStatus, SocialModerationPriority, SocialModerationStatus, SocialReportReason, SocialReportTarget, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';

const MEMBER_ROLES:UserRole[]=[UserRole.FIDELE,UserRole.SECRETAIRE_PRESENCE,UserRole.RESPONSABLE_SEMAINE];
const STAFF_ROLES:UserRole[]=[UserRole.MODERATEUR,UserRole.ADMIN,UserRole.SUPER_ADMIN];
const OPEN_CASE_STATUSES:SocialModerationStatus[]=[SocialModerationStatus.OPEN,SocialModerationStatus.AUTO_HIDDEN];
class CreateReportDto { @IsEnum(SocialReportTarget) targetType!:SocialReportTarget; @IsString() @Length(1,40) targetId!:string; @IsEnum(SocialReportReason) reason!:SocialReportReason; }
class ModerationActionDto { @IsString() @Length(2,30) action!:string; @IsString() @Length(8,1000) reason!:string; @IsOptional() @IsInt() @Min(1) @Max(4320) durationHours?:number; }
class AppealDto { @IsEmail() email!:string; @IsString() @Length(1,128) password!:string; @IsString() @Length(8,1000) reason!:string; }
class AppealDecisionDto { @IsBoolean() accept!:boolean; @IsString() @Length(8,1000) reason!:string; }

@Injectable()
export class SocialModerationService {
  constructor(private readonly prisma:PrismaService){}

  private requireMember(user:{sub:string;role:string}){if(!MEMBER_ROLES.includes(user.role as UserRole))throw new ForbiddenException('Cette action est réservée aux membres de la communauté.');return user.sub;}
  private requireStaff(user:{sub:string;role:string}){if(!STAFF_ROLES.includes(user.role as UserRole))throw new ForbiddenException('Accès réservé à l’équipe de modération.');return user.sub;}
  private autoHideThreshold(){const value=Number(process.env.SOCIAL_AUTO_HIDE_THRESHOLD??3);return Number.isInteger(value)&&value>=2&&value<=20?value:3;}
  private autoHideHours(){const value=Number(process.env.SOCIAL_AUTO_HIDE_HOURS??48);return Number.isInteger(value)&&value>=1&&value<=168?value:48;}

  private async reportTarget(type:SocialReportTarget,id:string,reporterId:string){
    if(type===SocialReportTarget.POST){
      const post=await this.prisma.socialPost.findUnique({where:{id},include:{author:{select:{id:true,role:true,active:true,suspendedAt:true}},hiddenBy:{where:{userId:reporterId},select:{id:true}}}});
      if(!post||post.deletedAt||post.moderationHidden&&(!post.moderationHiddenUntil||post.moderationHiddenUntil>new Date())||post.visibility==='MOI_SEUL'&&post.authorId!==reporterId||post.hiddenBy.length||!MEMBER_ROLES.includes(post.author.role)||!post.author.active||post.author.suspendedAt)throw new NotFoundException('Contenu introuvable.');
      if(post.authorId===reporterId)throw new BadRequestException('Vous ne pouvez pas signaler votre propre contenu.');
      const blocked=await this.prisma.socialBlock.findFirst({where:{OR:[{blockerId:reporterId,blockedId:post.authorId},{blockerId:post.authorId,blockedId:reporterId}]},select:{id:true}});if(blocked)throw new NotFoundException('Contenu introuvable.');
      return post.authorId;
    }
    if(type===SocialReportTarget.COMMENT){
      const comment=await this.prisma.socialComment.findUnique({where:{id},include:{author:{select:{id:true,role:true,active:true,suspendedAt:true}},post:{include:{author:{select:{id:true,role:true,active:true,suspendedAt:true}}}}}});
      if(!comment||comment.deletedAt||comment.post.deletedAt||comment.post.visibility==='MOI_SEUL'&&comment.post.authorId!==reporterId||comment.moderationHidden&&(!comment.moderationHiddenUntil||comment.moderationHiddenUntil>new Date())||!MEMBER_ROLES.includes(comment.post.author.role)||!comment.post.author.active||comment.post.author.suspendedAt||!MEMBER_ROLES.includes(comment.author.role)||!comment.author.active||comment.author.suspendedAt)throw new NotFoundException('Contenu introuvable.');
      if(comment.authorId===reporterId)throw new BadRequestException('Vous ne pouvez pas signaler votre propre commentaire.');
      return comment.authorId;
    }
    const profile=await this.prisma.user.findFirst({where:{id,role:{in:MEMBER_ROLES},active:true,suspendedAt:null,moderationProfileHidden:false,socialProfileDiscoverable:true,deletionScheduledAt:null},select:{id:true}});
    if(!profile||profile.id===reporterId)throw new NotFoundException('Profil introuvable.');
    const blocked=await this.prisma.socialBlock.findFirst({where:{OR:[{blockerId:reporterId,blockedId:id},{blockerId:id,blockedId:reporterId}]},select:{id:true}});if(blocked)throw new NotFoundException('Profil introuvable.');
    return profile.id;
  }

  async report(user:{sub:string;role:string},dto:CreateReportDto){
    const reporterId=this.requireMember(user),targetAuthorId=await this.reportTarget(dto.targetType,dto.targetId,reporterId);
    const moderationCase=await this.prisma.socialModerationCase.upsert({where:{targetType_targetId:{targetType:dto.targetType,targetId:dto.targetId}},create:{targetType:dto.targetType,targetId:dto.targetId,targetAuthorId},update:{}});
    try{
      await this.prisma.$transaction(async tx=>{
        await tx.socialReport.create({data:{caseId:moderationCase.id,reporterId,reason:dto.reason}});
        const count=await tx.socialReport.count({where:{caseId:moderationCase.id}});
        if(count>=this.autoHideThreshold()&&moderationCase.status===SocialModerationStatus.OPEN){
          const hours=this.autoHideHours(),until=new Date(Date.now()+hours*3600_000);
          await this.hideTarget(tx,dto.targetType,dto.targetId,until);
          await tx.socialModerationCase.update({where:{id:moderationCase.id},data:{status:SocialModerationStatus.AUTO_HIDDEN,priority:SocialModerationPriority.URGENTE}});
          await tx.socialModerationEvent.create({data:{caseId:moderationCase.id,action:'MASQUAGE_AUTOMATIQUE',reason:'Seuil configurable de signalements atteint.',until}});
        }else if(count>=Math.max(2,Math.ceil(this.autoHideThreshold()/2))&&moderationCase.status===SocialModerationStatus.OPEN){
          await tx.socialModerationCase.update({where:{id:moderationCase.id},data:{priority:SocialModerationPriority.ELEVEE}});
        }
        await tx.auditLog.create({data:{userId:reporterId,action:'CONTENU_SIGNALE',entity:'SocialModerationCase',entityId:moderationCase.id,after:{targetType:dto.targetType,reason:dto.reason}}});
      });
    }catch(error:any){if(error?.code==='P2002')throw new HttpException('Vous avez déjà signalé ce contenu.',409);throw error;}
    return {received:true,message:'Votre signalement a été transmis à l’équipe de modération.'};
  }

  private hideTarget(tx:any,type:SocialReportTarget,id:string,until:Date|null){
    if(type===SocialReportTarget.POST)return tx.socialPost.updateMany({where:{id,deletedAt:null},data:{moderationHidden:true,moderationHiddenUntil:until}});
    if(type===SocialReportTarget.COMMENT)return tx.socialComment.updateMany({where:{id,deletedAt:null},data:{moderationHidden:true,moderationHiddenUntil:until}});
    return tx.user.updateMany({where:{id,active:true},data:{moderationProfileHidden:true,moderationProfileHiddenUntil:until}});
  }

  private async targetSummary(moderationCase:any){
    if(moderationCase.targetType===SocialReportTarget.POST){const post=await this.prisma.socialPost.findUnique({where:{id:moderationCase.targetId},include:{author:{select:{fullName:true,dateOfBirth:true}}}});return post?{text:post.body,authorName:this.displayName(post.author)}:null;}
    if(moderationCase.targetType===SocialReportTarget.COMMENT){const comment=await this.prisma.socialComment.findUnique({where:{id:moderationCase.targetId},include:{author:{select:{fullName:true,dateOfBirth:true}}}});return comment?{text:comment.body,authorName:this.displayName(comment.author)}:null;}
    const profile=await this.prisma.user.findUnique({where:{id:moderationCase.targetId},select:{fullName:true,dateOfBirth:true}});return profile?{authorName:this.displayName(profile)}:null;
  }
  private displayName(user:{fullName:string|null;dateOfBirth:Date|null}){if(!user.dateOfBirth)return 'Membre fidèle';let age=new Date().getUTCFullYear()-user.dateOfBirth.getUTCFullYear();if(new Date().getUTCMonth()<user.dateOfBirth.getUTCMonth()||new Date().getUTCMonth()===user.dateOfBirth.getUTCMonth()&&new Date().getUTCDate()<user.dateOfBirth.getUTCDate())age--;return age<18?'Membre fidèle':user.fullName??'Membre fidèle';}

  async queue(user:{sub:string;role:string},statusInput?:string){
    this.requireStaff(user);const where:any={status:{in:OPEN_CASE_STATUSES}};
    if(statusInput){if(!Object.values(SocialModerationStatus).includes(statusInput as SocialModerationStatus))throw new BadRequestException('Filtre de modération invalide.');where.status=statusInput;}
    const rows=await this.prisma.socialModerationCase.findMany({where,orderBy:[{priority:'desc'},{updatedAt:'asc'}],take:100,include:{_count:{select:{reports:true}},reports:{orderBy:{createdAt:'desc'},take:10,select:{reason:true,createdAt:true}},events:{orderBy:{createdAt:'desc'},take:20,select:{action:true,reason:true,until:true,createdAt:true}},sanctions:{orderBy:{createdAt:'desc'},take:5,select:{id:true,targetUserId:true,createdById:true,reason:true,suspendedUntil:true,permanent:true,appealStatus:true,appealReason:true,appealDecidedAt:true}}}});
    return Promise.all(rows.map(async row=>({...row,target:await this.targetSummary(row)})));
  }

  private async caseTarget(id:string){const row=await this.prisma.socialModerationCase.findUnique({where:{id}});if(!row)throw new NotFoundException('Signalement introuvable.');return row;}
  private async hideFromCommunity(tx:any,type:SocialReportTarget,id:string,until:Date|null,hidden:boolean){
    const data={moderationHidden:hidden,moderationHiddenUntil:hidden?until:null};
    if(type===SocialReportTarget.POST)return tx.socialPost.updateMany({where:{id,deletedAt:null},data});
    if(type===SocialReportTarget.COMMENT)return tx.socialComment.updateMany({where:{id,deletedAt:null},data});
    return tx.user.updateMany({where:{id},data:{moderationProfileHidden:hidden,moderationProfileHiddenUntil:hidden?until:null}});
  }
  private async deleteTarget(tx:any,type:SocialReportTarget,id:string){if(type===SocialReportTarget.POST)return tx.socialPost.updateMany({where:{id,deletedAt:null},data:{deletedAt:new Date(),body:'Publication retirée par la modération',idempotencyKey:null}});if(type===SocialReportTarget.COMMENT)return tx.socialComment.updateMany({where:{id,deletedAt:null},data:{deletedAt:new Date(),body:'Commentaire retiré par la modération'}});return tx.user.updateMany({where:{id,active:true},data:{active:false,suspendedAt:new Date(),suspensionReason:'Compte désactivé après décision de modération.',suspendedUntil:null,sessionVersion:{increment:1}}});}

  async act(user:{sub:string;role:string},id:string,dto:ModerationActionDto){
    const actorId=this.requireStaff(user),admin=user.role==='ADMIN'||user.role==='SUPER_ADMIN',reason=dto.reason.trim(),action=dto.action.toUpperCase();
    if(!reason)throw new BadRequestException('Le motif de la décision est obligatoire.');
    let until:Date|null=null;
    if(action==='MASQUER'){
      if(dto.durationHours!==undefined&&(dto.durationHours<1||dto.durationHours>720))throw new BadRequestException('Le masquage doit durer de 1 à 720 heures.');
      until=dto.durationHours?new Date(Date.now()+dto.durationHours*3600_000):null;
    }else if(action==='SUPPRIMER'){
      if(!admin)throw new ForbiddenException('Seul l’administrateur peut supprimer définitivement un contenu signalé.');
    }else if(action==='AVERTIR'){
    }else if(action==='SUSPENDRE_TEMPORAIREMENT'){
      const hours=dto.durationHours;if(!hours||hours<1||hours>4320)throw new BadRequestException('Choisissez une durée de suspension de 1 à 4 320 heures.');
      if(!admin&&hours>720)throw new ForbiddenException('Un modérateur peut suspendre un compte pendant 30 jours au maximum.');
      until=new Date(Date.now()+hours*3600_000);
    }else if(action==='SUSPENDRE_DEFINITIVEMENT'){
      if(!admin)throw new ForbiddenException('Seul l’administrateur peut suspendre définitivement un compte.');
    }else if(action==='REJETER'){
    }else throw new BadRequestException('Action de modération inconnue.');
    const result=await this.prisma.$transaction(async tx=>{
      const moderationCase=await tx.socialModerationCase.findUnique({where:{id}});if(!moderationCase)throw new NotFoundException('Signalement introuvable.');
      const resolved=await tx.socialModerationCase.updateMany({where:{id,status:{in:OPEN_CASE_STATUSES}},data:{status:action==='REJETER'?SocialModerationStatus.DISMISSED:SocialModerationStatus.REVIEWED,resolvedAt:new Date()}});if(!resolved.count)throw new HttpException('Ce dossier a déjà été traité.',409);
      if(action==='MASQUER')await this.hideFromCommunity(tx,moderationCase.targetType,moderationCase.targetId,until,true);
      else if(action==='SUPPRIMER')await this.deleteTarget(tx,moderationCase.targetType,moderationCase.targetId);
      else if(action==='AVERTIR')await tx.userNotification.create({data:{userId:moderationCase.targetAuthorId,message:`L’équipe de modération vous adresse un avertissement. Motif : ${reason}`}});
      else if(action==='SUSPENDRE_TEMPORAIREMENT'||action==='SUSPENDRE_DEFINITIVEMENT'){
        const target=await tx.user.findUnique({where:{id:moderationCase.targetAuthorId},select:{role:true}});if(!target||!MEMBER_ROLES.includes(target.role))throw new NotFoundException('Compte membre introuvable.');
        await tx.user.update({where:{id:moderationCase.targetAuthorId},data:{suspendedAt:new Date(),suspensionReason:reason,suspendedUntil:until,sessionVersion:{increment:1}}});await tx.refreshToken.updateMany({where:{userId:moderationCase.targetAuthorId,revokedAt:null},data:{revokedAt:new Date()}});
        await tx.auditLog.create({data:{userId:actorId,action:action==='SUSPENDRE_DEFINITIVEMENT'?'COMPTE_SUSPENDU_DEFINITIVEMENT':'COMPTE_SUSPENDU',entity:'UserSecurity',entityId:moderationCase.targetAuthorId,after:{suspendedUntil:until?.toISOString()??null,permanent:action==='SUSPENDRE_DEFINITIVEMENT'},reason}});
      }else if(action==='REJETER'){
        const autoHidden=await tx.socialModerationEvent.findFirst({where:{caseId:id,action:'MASQUAGE_AUTOMATIQUE'},select:{id:true}});if(autoHidden)await this.hideFromCommunity(tx,moderationCase.targetType,moderationCase.targetId,null,false);
      }
      const sanctionAction=action==='SUSPENDRE_TEMPORAIREMENT'||action==='SUSPENDRE_DEFINITIVEMENT';
      let sanction:any=null;
      if(sanctionAction)sanction=await tx.socialSanction.create({data:{caseId:id,targetUserId:moderationCase.targetAuthorId,createdById:actorId,reason,suspendedUntil:until,permanent:action==='SUSPENDRE_DEFINITIVEMENT'}});
      await tx.socialModerationEvent.create({data:{caseId:id,actorId,action,reason,until}});
      await tx.auditLog.create({data:{userId:actorId,action:`MODERATION_${action}`,entity:'SocialModerationCase',entityId:id,after:{targetType:moderationCase.targetType,until:until?.toISOString()??null,sanctionId:sanction?.id??null},reason}});
      return {id:moderationCase.id,status:action==='REJETER'?SocialModerationStatus.DISMISSED:SocialModerationStatus.REVIEWED,sanctionId:sanction?.id??null};
    });
    return result;
  }

  private async suspendUser(userId:string,actorId:string,reason:string,until:Date|null,permanent:boolean){
    await this.prisma.$transaction(async tx=>{
      const target=await tx.user.findUnique({where:{id:userId},select:{role:true}});if(!target||!MEMBER_ROLES.includes(target.role))throw new NotFoundException('Compte fidèle introuvable.');
      await tx.user.update({where:{id:userId},data:{suspendedAt:new Date(),suspensionReason:reason,suspendedUntil:until,sessionVersion:{increment:1}}});
      await tx.refreshToken.updateMany({where:{userId,revokedAt:null},data:{revokedAt:new Date()}});
      await tx.auditLog.create({data:{userId:actorId,action:permanent?'COMPTE_SUSPENDU_DEFINITIVEMENT':'COMPTE_SUSPENDU',entity:'UserSecurity',entityId:userId,after:{suspendedUntil:until?.toISOString()??null,permanent},reason}});
    });
  }

  async appeal(sanctionId:string,dto:AppealDto){
    const generic='Si les informations concordent et que ce recours est disponible, il sera transmis à l’administration.';
    const sanction=await this.prisma.socialSanction.findUnique({where:{id:sanctionId},include:{target:{select:{id:true,email:true,passwordHash:true,role:true,suspendedAt:true}}}});
    const passwordOk=!!sanction&&sanction.target.email.toLowerCase()===dto.email.trim().toLowerCase()&&await argon2.verify(sanction.target.passwordHash,dto.password).catch(()=>false);
    if(!sanction||!passwordOk||!sanction.target.suspendedAt||sanction.appealStatus!==SocialAppealStatus.NONE||sanction.target.role===UserRole.ADMIN||sanction.target.role===UserRole.SUPER_ADMIN)return {message:generic};
    const updated=await this.prisma.socialSanction.updateMany({where:{id:sanctionId,targetUserId:sanction.target.id,appealStatus:SocialAppealStatus.NONE},data:{appealStatus:SocialAppealStatus.PENDING,appealedAt:new Date(),appealReason:dto.reason.trim()}});
    if(updated.count)await this.prisma.auditLog.create({data:{userId:sanction.target.id,action:'APPEL_SUSPENSION_DEPOSE',entity:'SocialSanction',entityId:sanctionId}});
    return {message:generic};
  }

  async decideAppeal(user:{sub:string;role:string},sanctionId:string,dto:AppealDecisionDto){
    const adminId=this.requireStaff(user);if(!['ADMIN','SUPER_ADMIN'].includes(user.role))throw new ForbiddenException('Le traitement des appels est réservé à l’administrateur.');
    const sanction=await this.prisma.socialSanction.findUnique({where:{id:sanctionId}});if(!sanction)throw new NotFoundException('Appel introuvable.');if(sanction.createdById===adminId)throw new ForbiddenException('Un autre administrateur doit traiter cet appel.');if(sanction.appealStatus!==SocialAppealStatus.PENDING)throw new HttpException('Cet appel a déjà été traité ou n’est pas disponible.',409);
    await this.prisma.$transaction(async tx=>{
      const changed=await tx.socialSanction.updateMany({where:{id:sanctionId,appealStatus:SocialAppealStatus.PENDING},data:{appealStatus:dto.accept?SocialAppealStatus.ACCEPTED:SocialAppealStatus.REJECTED,appealDecidedById:adminId,appealDecisionReason:dto.reason.trim(),appealDecidedAt:new Date()}});if(!changed.count)throw new HttpException('Cet appel a déjà été traité.',409);
      await tx.socialModerationEvent.create({data:{caseId:sanction.caseId,actorId:adminId,action:dto.accept?'APPEL_ACCEPTE':'APPEL_REJETE',reason:dto.reason.trim()}});
      await tx.auditLog.create({data:{userId:adminId,action:dto.accept?'APPEL_SUSPENSION_ACCEPTE':'APPEL_SUSPENSION_REJETE',entity:'SocialSanction',entityId:sanctionId,reason:dto.reason.trim()}});
      if(dto.accept){const other=await tx.socialSanction.count({where:{targetUserId:sanction.targetUserId,id:{not:sanctionId},appealStatus:{not:SocialAppealStatus.ACCEPTED},OR:[{permanent:true},{suspendedUntil:null},{suspendedUntil:{gt:new Date()}}]}});if(!other){await tx.user.update({where:{id:sanction.targetUserId},data:{suspendedAt:null,suspensionReason:null,suspendedUntil:null,sessionVersion:{increment:1}}});await tx.refreshToken.updateMany({where:{userId:sanction.targetUserId,revokedAt:null},data:{revokedAt:new Date()}});}}
    });
    return {sanctionId,accepted:dto.accept};
  }
}

@Controller('social')
export class SocialModerationController {
  constructor(private readonly moderation:SocialModerationService){}
  @Post('reports') @UseGuards(JwtAuthGuard,RateLimitGuard) report(@Req() req:any,@Body() body:CreateReportDto){return this.moderation.report(req.user,body);}
  @Get('moderation/cases') @UseGuards(JwtAuthGuard) queue(@Req() req:any,@Query('status') status?:string){return this.moderation.queue(req.user,status);}
  @Patch('moderation/cases/:id') @UseGuards(JwtAuthGuard) act(@Req() req:any,@Param('id') id:string,@Body() body:ModerationActionDto){return this.moderation.act(req.user,id,body);}
  @Post('moderation/sanctions/:id/appeal') @UseGuards(RateLimitGuard) appeal(@Param('id') id:string,@Body() body:AppealDto){return this.moderation.appeal(id,body);}
  @Post('moderation/sanctions/:id/appeal/decision') @UseGuards(JwtAuthGuard) decideAppeal(@Req() req:any,@Param('id') id:string,@Body() body:AppealDecisionDto){return this.moderation.decideAppeal(req.user,id,body);}
}
