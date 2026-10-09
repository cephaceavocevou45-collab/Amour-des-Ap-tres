import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Headers, HttpException, Injectable, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { SocialReactionType, SocialVisibility, UserRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';

class SocialPostDto {
  @IsString() @Length(1,5000) body!:string;
  @IsEnum(SocialVisibility) visibility!:SocialVisibility;
}
class SocialCommentDto {
  @IsString() @Length(1,2000) body!:string;
  @IsOptional() @IsString() @Matches(/^[a-zA-Z0-9_-]{1,40}$/) parentId?:string;
}
class SocialReactionDto {
  @IsString() @Matches(/^(?:post|comment)$/) targetType!:string;
  @IsString() @Matches(/^[a-zA-Z0-9_-]{1,40}$/) targetId!:string;
  @IsEnum(SocialReactionType) type!:SocialReactionType;
  @IsBoolean() active!:boolean;
}
class PinPostDto { @IsBoolean() pinned!:boolean; }
class SavePostDto { @IsBoolean() saved!:boolean; }
class SocialSettingsDto { @IsOptional() @IsBoolean() notificationsEnabled?:boolean; @IsOptional() @IsBoolean() profileDiscoverable?:boolean; }
class SocialProfileDto { @IsOptional() @IsString() @MaxLength(500) bio?:string|null; }
class ShareDto { @IsOptional() @IsString() @MaxLength(1000) body?:string; }

const SOCIAL_MEMBER_ROLES:UserRole[]=[UserRole.FIDELE,UserRole.SECRETAIRE_PRESENCE,UserRole.RESPONSABLE_SEMAINE];

@Injectable()
export class SocialFeedService {
  private readonly activity=new Map<string,{times:number[];hashes:Map<string,number>}>();
  constructor(private readonly prisma:PrismaService){}

  private requireMember(user:{sub:string;role:string}){if(!SOCIAL_MEMBER_ROLES.includes(user.role as UserRole))throw new ForbiddenException('Cette action est réservée aux membres de la communauté paroissiale.');return user.sub;}
  private async isNewAccount(userId:string,now=new Date()){
    const account=await this.prisma.user.findUnique({where:{id:userId},select:{createdAt:true}});
    return !!account&&now.getTime()-account.createdAt.getTime()<24*60*60_000;
  }
  private newAccountPostLimit(){const limit=Number(process.env.SOCIAL_NEW_ACCOUNT_POSTS_PER_DAY??3);return Number.isInteger(limit)&&limit>=1&&limit<=10?limit:3;}
  private throttle(userId:string,action:string,body?:string){
    const now=Date.now(),key=`${userId}:${action}`,state=this.activity.get(key)??{times:[],hashes:new Map<string,number>()};
    state.times=state.times.filter(time=>now-time<10*60_000);for(const [hash,time]of state.hashes)if(now-time>10*60_000)state.hashes.delete(hash);
    const limits:Record<string,number>={post:6,comment:20,reaction:90,share:10,profile:30};
    if(state.times.length>=(limits[action]??30))throw new HttpException('Vous avez effectué trop d’actions. Réessayez plus tard.',429);
    if(body){const hash=createHash('sha256').update(body.trim().toLowerCase()).digest('hex'),previous=state.hashes.get(hash);if(previous&&now-previous<60_000)throw new HttpException('Un contenu identique vient d’être envoyé. Attendez avant de le republier.',409);state.hashes.set(hash,now);}
    state.times.push(now);this.activity.set(key,state);
    if(this.activity.size>20_000){for(const [entry,value]of this.activity)if(!value.times.some(time=>now-time<10*60_000))this.activity.delete(entry);}
  }

  private async blockedIds(userId:string){const rows=await this.prisma.socialBlock.findMany({where:{OR:[{blockerId:userId},{blockedId:userId}]},select:{blockerId:true,blockedId:true}});return [...new Set(rows.map(row=>row.blockerId===userId?row.blockedId:row.blockerId) )];}
  private async notify(userId:string|null|undefined,actorId:string,message:string){if(!userId||userId===actorId)return;const target=await this.prisma.user.findUnique({where:{id:userId},select:{socialNotificationsEnabled:true}});if(target?.socialNotificationsEnabled)await this.prisma.userNotification.create({data:{userId,message}});}
  private async visiblePost(postId:string,userId:string){
    const post=await this.prisma.socialPost.findUnique({where:{id:postId},include:{author:{select:{id:true,fullName:true,dateOfBirth:true,role:true,active:true,suspendedAt:true,moderationProfileHidden:true,moderationProfileHiddenUntil:true}},hiddenBy:{where:{userId},select:{id:true}}}});
    const now=new Date();
    if(!post||post.deletedAt||post.moderationHidden&&(!post.moderationHiddenUntil||post.moderationHiddenUntil>now)||post.author.moderationProfileHidden&&(!post.author.moderationProfileHiddenUntil||post.author.moderationProfileHiddenUntil>now)||!SOCIAL_MEMBER_ROLES.includes(post.author.role)||!post.author.active||post.author.suspendedAt||post.visibility===SocialVisibility.MOI_SEUL&&post.authorId!==userId||post.hiddenBy.length)throw new HttpException('Publication introuvable.',404);
    const block=await this.prisma.socialBlock.findFirst({where:{OR:[{blockerId:userId,blockedId:post.authorId},{blockerId:post.authorId,blockedId:userId}]},select:{id:true}});
    if(block)throw new HttpException('Publication introuvable.',404);
    return post;
  }
  private displayName(author:{fullName:string|null;dateOfBirth:Date|null}){
    if(!author.dateOfBirth)return 'Membre fidèle';
    const today=new Date();let age=today.getUTCFullYear()-author.dateOfBirth.getUTCFullYear();if(today.getUTCMonth()<author.dateOfBirth.getUTCMonth()||(today.getUTCMonth()===author.dateOfBirth.getUTCMonth()&&today.getUTCDate()<author.dateOfBirth.getUTCDate()))age--;
    return age<18?'Membre fidèle':author.fullName??'Membre fidèle';
  }
  private async shape(post:any,userId:string){
    const counts=await this.prisma.socialReaction.groupBy({by:['type'],where:{targetKey:`post:${post.id}`},_count:{_all:true}});
    const media=await this.prisma.socialPostMedia.findMany({where:{postId:post.id},orderBy:{position:'asc'},select:{id:true,mimeType:true,width:true,height:true,byteSize:true,position:true}});
    const poll=await this.prisma.socialPoll.findUnique({where:{postId:post.id},include:{options:{orderBy:{position:'asc'},include:{_count:{select:{votes:true}}}},votes:{where:{userId},select:{optionId:true}}}});
    const totalVotes=poll?.options.reduce((sum,option)=>sum+option._count.votes,0)??0;
    const event=await this.prisma.socialEvent.findUnique({where:{postId:post.id},include:{rsvps:{select:{userId:true,status:true}}}});
    const eventCounts={PARTICIPATING:0,INTERESTED:0,DECLINED:0};for(const response of event?.rsvps??[])eventCounts[response.status]++;
    return {id:post.id,body:post.body,visibility:post.visibility,pinned:post.pinned,createdAt:post.createdAt,updatedAt:post.updatedAt,author:{id:post.author.id,displayName:this.displayName(post.author)},sharedPost:post.sourcePost?{id:post.sourcePost.id,body:post.sourcePost.body,author:{id:post.sourcePost.author.id,displayName:this.displayName(post.sourcePost.author)}}:null,media,poll:poll?{id:poll.id,closesAt:poll.closesAt,closed:Boolean(poll.closesAt&&poll.closesAt<=new Date()),totalVotes,userVote:poll.votes[0]?.optionId??null,options:poll.options.map(option=>({id:option.id,text:option.text,votes:option._count.votes,percentage:totalVotes?Math.round(option._count.votes*100/totalVotes):0}))}:null,event:event?{id:event.id,title:event.title,startsAt:event.startsAt,endsAt:event.endsAt,location:event.location,counts:eventCounts,userRsvp:event.rsvps.find(response=>response.userId===userId)?.status??null}:null,commentCount:post._count?.comments??0,likes:counts.find(row=>row.type===SocialReactionType.AIME)?._count._all??0,hearts:counts.find(row=>row.type===SocialReactionType.COEUR)?._count._all??0,likedByMe:await this.prisma.socialReaction.findFirst({where:{userId,targetKey:`post:${post.id}`,type:SocialReactionType.AIME},select:{id:true}}).then(Boolean),heartedByMe:await this.prisma.socialReaction.findFirst({where:{userId,targetKey:`post:${post.id}`,type:SocialReactionType.COEUR},select:{id:true}}).then(Boolean)};
  }

  async feed(user:{sub:string;role:string},cursor?:string,takeInput?:string,savedOnly=false,searchInput?:string){
    const userId=this.requireMember(user),blocked=await this.blockedIds(userId),hidden=await this.prisma.socialHiddenPost.findMany({where:{userId},select:{postId:true}}),take=Math.max(1,Math.min(30,Number.isInteger(Number(takeInput))?Number(takeInput):20));
    const now=new Date();
    const where:any={deletedAt:null,author:{role:{in:SOCIAL_MEMBER_ROLES},active:true,suspendedAt:null,OR:[{moderationProfileHidden:false},{moderationProfileHiddenUntil:{lte:now}}]},AND:[{OR:[{visibility:SocialVisibility.TOUS_LES_FIDELES},{authorId:userId}]},{OR:[{moderationHidden:false},{moderationHiddenUntil:{lte:now}}]},{authorId:{notIn:blocked}},{id:{notIn:hidden.map(row=>row.postId)}}]};
    if(savedOnly)where.AND.push({saves:{some:{userId}}});
    const search=searchInput?.trim().slice(0,100);if(search)where.AND.push({body:{contains:search,mode:'insensitive'}});
    if(cursor){const marker=await this.prisma.socialPost.findUnique({where:{id:cursor},select:{id:true,createdAt:true}});if(!marker)throw new BadRequestException('Curseur de fil invalide.');where.AND.push({OR:[{createdAt:{lt:marker.createdAt}},{createdAt:marker.createdAt,id:{lt:marker.id}}]});}
    where.AND.push({OR:[{sourcePostId:null},{sourcePost:{is:{deletedAt:null,visibility:SocialVisibility.TOUS_LES_FIDELES,authorId:{notIn:blocked}}}}]});
    const rows=await this.prisma.socialPost.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],take:take+1,include:{author:{select:{id:true,fullName:true,dateOfBirth:true}},sourcePost:{include:{author:{select:{id:true,fullName:true,dateOfBirth:true}}}},_count:{select:{comments:{where:{deletedAt:null,OR:[{moderationHidden:false},{moderationHiddenUntil:{lte:now}}]}}}}}});
    const hasMore=rows.length>take,items=await Promise.all(rows.slice(0,take).map(row=>this.shape(row,userId)));
    return {items,nextCursor:hasMore?rows[take-1].id:null};
  }
  async createPost(user:{sub:string;role:string},dto:SocialPostDto,key?:string){
    const userId=this.requireMember(user),body=dto.body.trim(),idempotency=(key??'').trim();
    if(!idempotency||idempotency.length>120||!/^[A-Za-z0-9_-]+$/.test(idempotency))throw new BadRequestException('Un identifiant Idempotency-Key valide est requis.');
    if(!body||body.length>5000)throw new BadRequestException('La publication doit contenir au plus 5 000 caractères.');
    if((body.match(/https?:\/\//gi)??[]).length>3)throw new BadRequestException('Limitez les liens à trois par publication.');
    const existing=await this.prisma.socialPost.findUnique({where:{authorId_idempotencyKey:{authorId:userId,idempotencyKey:idempotency}},include:{author:{select:{id:true,fullName:true,dateOfBirth:true}},_count:{select:{comments:{where:{deletedAt:null}}}}}});if(existing)return this.shape(existing,userId);
    const now=new Date();if(await this.isNewAccount(userId,now)){const since=new Date(now.getTime()-24*60*60_000),count=await this.prisma.socialPost.count({where:{authorId:userId,createdAt:{gte:since}}});if(count>=this.newAccountPostLimit())throw new HttpException('La limite quotidienne des comptes récents est atteinte. Réessayez demain.',429);}
    this.throttle(userId,'post',body);
    const post=await this.prisma.socialPost.upsert({where:{authorId_idempotencyKey:{authorId:userId,idempotencyKey:idempotency}},update:{},create:{authorId:userId,idempotencyKey:idempotency,body,visibility:dto.visibility},include:{author:{select:{id:true,fullName:true,dateOfBirth:true}},_count:{select:{comments:true}}}});
    return this.shape(post,userId);
  }
  async updatePost(user:{sub:string;role:string},id:string,dto:SocialPostDto){
    const userId=this.requireMember(user),post=await this.prisma.socialPost.findFirst({where:{id,authorId:userId,deletedAt:null}});if(!post||post.sourcePostId)throw new HttpException('Publication introuvable.',404);
    const body=dto.body.trim();if(!body||body.length>5000||(body.match(/https?:\/\//gi)??[]).length>3)throw new BadRequestException('Vérifiez le texte et limitez les liens.');this.throttle(userId,'post',body);
    const updated=await this.prisma.socialPost.update({where:{id},data:{body,visibility:dto.visibility},include:{author:{select:{id:true,fullName:true,dateOfBirth:true}},_count:{select:{comments:true}}}});return this.shape(updated,userId);
  }
  async deletePost(user:{sub:string;role:string},id:string){const userId=this.requireMember(user),post=await this.prisma.socialPost.findFirst({where:{id,authorId:userId,deletedAt:null},select:{id:true,sourcePostId:true}});if(!post)throw new HttpException('Publication introuvable.',404);await this.prisma.$transaction(async tx=>{await tx.socialPost.update({where:{id},data:{deletedAt:new Date(),body:'Publication supprimée',idempotencyKey:null}});if(post.sourcePostId)await tx.socialShare.deleteMany({where:{userId,postId:post.sourcePostId}});});return {deleted:true};}
  async pin(user:{sub:string;role:string},id:string,dto:PinPostDto){if(user.role!==UserRole.ADMIN&&user.role!==UserRole.SUPER_ADMIN)throw new ForbiddenException('Action réservée à l’administration.');const result=await this.prisma.socialPost.updateMany({where:{id,deletedAt:null},data:{pinned:dto.pinned}});if(!result.count)throw new HttpException('Publication introuvable.',404);await this.prisma.auditLog.create({data:{userId:user.sub,action:dto.pinned?'PUBLICATION_EPINGLEE':'PUBLICATION_DES_EPINGLEE',entity:'SocialPost',entityId:id}});return {id,pinned:dto.pinned};}
  async comments(user:{sub:string;role:string},postId:string){const userId=this.requireMember(user);await this.visiblePost(postId,userId);const now=new Date(),rows=await this.prisma.socialComment.findMany({where:{postId,parentId:null,deletedAt:null,OR:[{moderationHidden:false},{moderationHiddenUntil:{lte:now}}]},orderBy:{createdAt:'asc'},take:100,include:{author:{select:{id:true,fullName:true,dateOfBirth:true}},replies:{where:{deletedAt:null,OR:[{moderationHidden:false},{moderationHiddenUntil:{lte:now}}]},orderBy:{createdAt:'asc'},take:30,include:{author:{select:{id:true,fullName:true,dateOfBirth:true}}}}}});const format=(row:any)=>({id:row.id,postId:row.postId,parentId:row.parentId,body:row.body,createdAt:row.createdAt,author:{id:row.author.id,displayName:this.displayName(row.author)},canDelete:row.authorId===userId});return rows.map(row=>({...format(row),replies:row.replies.map(format)}));}
  async comment(user:{sub:string;role:string},postId:string,dto:SocialCommentDto){const userId=this.requireMember(user),post=await this.visiblePost(postId,userId),body=dto.body.trim();if(!body||body.length>2000)throw new BadRequestException('Le commentaire est limité à 2 000 caractères.');this.throttle(userId,'comment',body);let notifyId=post.authorId;if(dto.parentId){const parent=await this.prisma.socialComment.findFirst({where:{id:dto.parentId,postId,parentId:null,deletedAt:null},select:{id:true,authorId:true}});if(!parent)throw new HttpException('Réponse introuvable.',404);notifyId=parent.authorId;}const created=await this.prisma.socialComment.create({data:{postId,authorId:userId,parentId:dto.parentId??null,body}});await this.notify(notifyId,userId,dto.parentId?'Un membre de la communauté a répondu à votre commentaire.':'Un membre de la communauté a commenté une de vos publications.');return {id:created.id,postId,parentId:created.parentId,body:created.body,createdAt:created.createdAt};}
  async deleteComment(user:{sub:string;role:string},id:string){const userId=this.requireMember(user),result=await this.prisma.socialComment.updateMany({where:{id,authorId:userId,deletedAt:null},data:{deletedAt:new Date(),body:'Commentaire supprimé'}});if(!result.count)throw new HttpException('Commentaire introuvable.',404);return {deleted:true};}
  async react(user:{sub:string;role:string},dto:SocialReactionDto){const userId=this.requireMember(user),targetKey=`${dto.targetType}:${dto.targetId}`;this.throttle(userId,'reaction');let notifyId:string;if(dto.targetType==='post')notifyId=(await this.visiblePost(dto.targetId,userId)).authorId;else{const comment=await this.prisma.socialComment.findFirst({where:{id:dto.targetId,deletedAt:null},select:{postId:true,authorId:true}});if(!comment)throw new HttpException('Élément introuvable.',404);await this.visiblePost(comment.postId,userId);notifyId=comment.authorId;}const where={userId,targetKey,type:dto.type};if(dto.active){await this.prisma.socialReaction.upsert({where:{userId_targetKey_type:where},update:{},create:{...where,...(dto.targetType==='post'?{postId:dto.targetId}:{commentId:dto.targetId})}});await this.notify(notifyId,userId,dto.type===SocialReactionType.AIME?'Un membre de la communauté a aimé votre contenu.':'Un membre de la communauté vous a envoyé un cœur.');}else await this.prisma.socialReaction.deleteMany({where});return {active:dto.active};}
  async share(user:{sub:string;role:string},postId:string,dto:ShareDto){const userId=this.requireMember(user),post=await this.visiblePost(postId,userId);if(post.visibility!==SocialVisibility.TOUS_LES_FIDELES)throw new HttpException('Publication introuvable.',404);if(await this.isNewAccount(userId))throw new ForbiddenException('Le partage est disponible après 24 heures d’ancienneté du compte.');this.throttle(userId,'share');const key=`share_${postId}`,existing=await this.prisma.socialPost.findUnique({where:{authorId_idempotencyKey:{authorId:userId,idempotencyKey:key}},include:{author:{select:{id:true,fullName:true,dateOfBirth:true}},sourcePost:{include:{author:{select:{id:true,fullName:true,dateOfBirth:true}}}},_count:{select:{comments:{where:{deletedAt:null}}}}}});if(existing)return this.shape(existing,userId);const body=dto.body?.trim()??'';const repost=await this.prisma.$transaction(async tx=>{await tx.socialShare.upsert({where:{userId_postId:{userId,postId}},update:{},create:{userId,postId,body:body||null}});return tx.socialPost.create({data:{authorId:userId,sourcePostId:postId,idempotencyKey:key,body,visibility:SocialVisibility.TOUS_LES_FIDELES},include:{author:{select:{id:true,fullName:true,dateOfBirth:true}},sourcePost:{include:{author:{select:{id:true,fullName:true,dateOfBirth:true}}}},_count:{select:{comments:{where:{deletedAt:null}}}}}});});await this.notify(post.authorId,userId,'Un membre de la communauté a partagé votre publication.');return this.shape(repost,userId);}
  async save(user:{sub:string;role:string},postId:string,enabled:boolean){const userId=this.requireMember(user);await this.visiblePost(postId,userId);if(enabled)await this.prisma.socialSavedPost.upsert({where:{userId_postId:{userId,postId}},update:{},create:{userId,postId}});else await this.prisma.socialSavedPost.deleteMany({where:{userId,postId}});return {saved:enabled};}
  async hide(user:{sub:string;role:string},postId:string){const userId=this.requireMember(user);await this.visiblePost(postId,userId);await this.prisma.socialHiddenPost.upsert({where:{userId_postId:{userId,postId}},update:{},create:{userId,postId}});return {hidden:true};}
  async block(user:{sub:string;role:string},targetId:string){const userId=this.requireMember(user);if(userId===targetId)throw new BadRequestException('Vous ne pouvez pas bloquer votre propre compte.');const target=await this.prisma.user.findFirst({where:{id:targetId,role:{in:SOCIAL_MEMBER_ROLES},active:true,suspendedAt:null},select:{id:true}});if(!target)throw new HttpException('Compte introuvable.',404);await this.prisma.socialBlock.upsert({where:{blockerId_blockedId:{blockerId:userId,blockedId:targetId}},update:{},create:{blockerId:userId,blockedId:targetId}});return {blocked:true};}
  async unblock(user:{sub:string;role:string},targetId:string){const userId=this.requireMember(user);await this.prisma.socialBlock.deleteMany({where:{blockerId:userId,blockedId:targetId}});return {blocked:false};}
  async listBlocks(user:{sub:string;role:string}){const userId=this.requireMember(user),rows=await this.prisma.socialBlock.findMany({where:{blockerId:userId},include:{blocked:{select:{id:true,fullName:true,dateOfBirth:true}}},orderBy:{createdAt:'desc'}});return rows.map(row=>({id:row.blocked.id,displayName:this.displayName(row.blocked)}));}
  async settings(user:{sub:string;role:string}){const userId=this.requireMember(user),row=await this.prisma.user.findUnique({where:{id:userId},select:{socialNotificationsEnabled:true,socialProfileDiscoverable:true}});return {notificationsEnabled:row?.socialNotificationsEnabled??false,profileDiscoverable:row?.socialProfileDiscoverable??true};}
  async updateSettings(user:{sub:string;role:string},dto:SocialSettingsDto){const userId=this.requireMember(user);const data:any={};if(dto.notificationsEnabled!==undefined)data.socialNotificationsEnabled=dto.notificationsEnabled;if(dto.profileDiscoverable!==undefined)data.socialProfileDiscoverable=dto.profileDiscoverable;const row=await this.prisma.user.update({where:{id:userId},data,select:{socialNotificationsEnabled:true,socialProfileDiscoverable:true}});return {notificationsEnabled:row.socialNotificationsEnabled,profileDiscoverable:row.socialProfileDiscoverable};}
  async profile(user:{sub:string;role:string}){const userId=this.requireMember(user),member=await this.prisma.user.findUnique({where:{id:userId},select:{fullName:true,dateOfBirth:true,socialBio:true,socialProfileDiscoverable:true}});if(!member)throw new HttpException('Profil introuvable.',404);return {displayName:this.displayName(member),bio:member.socialBio??'',profileDiscoverable:member.socialProfileDiscoverable};}
  async publicProfile(user:{sub:string;role:string},targetId:string){
    const userId=this.requireMember(user),now=new Date();this.throttle(userId,'profile');
    const member=await this.prisma.user.findFirst({where:{id:targetId,role:{in:SOCIAL_MEMBER_ROLES},active:true,suspendedAt:null,socialProfileDiscoverable:true,AND:[{OR:[{moderationProfileHidden:false},{moderationProfileHiddenUntil:{lte:now}}]}]},select:{id:true,fullName:true,dateOfBirth:true,socialBio:true}});
    if(!member)throw new HttpException('Profil introuvable.',404);
    if(member.id!==userId){const block=await this.prisma.socialBlock.findFirst({where:{OR:[{blockerId:userId,blockedId:member.id},{blockerId:member.id,blockedId:userId}]},select:{id:true}});if(block)throw new HttpException('Profil introuvable.',404);}
    const rows=await this.prisma.socialPost.findMany({where:{authorId:member.id,visibility:SocialVisibility.TOUS_LES_FIDELES,deletedAt:null,AND:[{OR:[{moderationHidden:false},{moderationHiddenUntil:{lte:now}}]},{hiddenBy:{none:{userId}}}]},orderBy:[{createdAt:'desc'},{id:'desc'}],take:20,include:{author:{select:{id:true,fullName:true,dateOfBirth:true}},sourcePost:{include:{author:{select:{id:true,fullName:true,dateOfBirth:true}}}},_count:{select:{comments:{where:{deletedAt:null,OR:[{moderationHidden:false},{moderationHiddenUntil:{lte:now}}]}}}}}});
    return {id:member.id,displayName:this.displayName(member),bio:member.socialBio??'',posts:await Promise.all(rows.map(post=>this.shape(post,userId)))};
  }
  async updateProfile(user:{sub:string;role:string},dto:SocialProfileDto){const userId=this.requireMember(user),bio=dto.bio?.trim()??'';if(bio.length>500)throw new BadRequestException('La présentation est limitée à 500 caractères.');const member=await this.prisma.user.update({where:{id:userId},data:{socialBio:bio||null},select:{fullName:true,dateOfBirth:true,socialBio:true}});return {displayName:this.displayName(member),bio:member.socialBio??''};}
}

@Controller('social')
@UseGuards(JwtAuthGuard)
export class SocialFeedController {
  constructor(private readonly feed:SocialFeedService){}
  @Get('posts') getFeed(@Req() req:any,@Query('cursor') cursor?:string,@Query('take') take?:string,@Query('q') search?:string){return this.feed.feed(req.user,cursor,take,false,search);}
  @Get('saved') saved(@Req() req:any,@Query('cursor') cursor?:string,@Query('take') take?:string,@Query('q') search?:string){return this.feed.feed(req.user,cursor,take,true,search);}
  @Post('posts') create(@Req() req:any,@Body() body:SocialPostDto,@Headers('idempotency-key') key?:string){return this.feed.createPost(req.user,body,key);}
  @Patch('posts/:id') update(@Req() req:any,@Param('id') id:string,@Body() body:SocialPostDto){return this.feed.updatePost(req.user,id,body);}
  @Delete('posts/:id') remove(@Req() req:any,@Param('id') id:string){return this.feed.deletePost(req.user,id);}
  @Post('posts/:id/pin') pin(@Req() req:any,@Param('id') id:string,@Body() body:PinPostDto){return this.feed.pin(req.user,id,body);}
  @Get('posts/:id/comments') comments(@Req() req:any,@Param('id') id:string){return this.feed.comments(req.user,id);}
  @Post('posts/:id/comments') comment(@Req() req:any,@Param('id') id:string,@Body() body:SocialCommentDto){return this.feed.comment(req.user,id,body);}
  @Delete('comments/:id') deleteComment(@Req() req:any,@Param('id') id:string){return this.feed.deleteComment(req.user,id);}
  @Post('reactions') reaction(@Req() req:any,@Body() body:SocialReactionDto){return this.feed.react(req.user,body);}
  @Post('posts/:id/share') share(@Req() req:any,@Param('id') id:string,@Body() body:ShareDto){return this.feed.share(req.user,id,body);}
  @Post('posts/:id/save') save(@Req() req:any,@Param('id') id:string,@Body() body:SavePostDto){return this.feed.save(req.user,id,body.saved);}
  @Post('posts/:id/hide') hide(@Req() req:any,@Param('id') id:string){return this.feed.hide(req.user,id);}
  @Post('blocks/:id') block(@Req() req:any,@Param('id') id:string){return this.feed.block(req.user,id);}
  @Delete('blocks/:id') unblock(@Req() req:any,@Param('id') id:string){return this.feed.unblock(req.user,id);}
  @Get('blocks') blocks(@Req() req:any){return this.feed.listBlocks(req.user);}
  @Get('settings') settings(@Req() req:any){return this.feed.settings(req.user);}
  @Patch('settings') updateSettings(@Req() req:any,@Body() body:SocialSettingsDto){return this.feed.updateSettings(req.user,body);}
  @Get('profile') profile(@Req() req:any){return this.feed.profile(req.user);}
  @Get('profiles/:id') publicProfile(@Req() req:any,@Param('id') id:string){return this.feed.publicProfile(req.user,id);}
  @Patch('profile') updateProfile(@Req() req:any,@Body() body:SocialProfileDto){return this.feed.updateProfile(req.user,body);}
}
