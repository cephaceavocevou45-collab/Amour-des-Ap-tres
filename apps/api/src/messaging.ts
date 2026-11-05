import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';
import { RateLimitGuard } from './rate-limit.guard';

class OpenConversationDto { @IsString() @Length(3,160) subject!:string; @IsString() @Length(2,4000) message!:string; }
class ReplyDto { @IsString() @Length(1,4000) message!:string; }

@Injectable()
export class MessagingService {
  constructor(private readonly prisma:PrismaService){}
  private async access(userId:string,role:string,conversationId:string){
    const conversation=await this.prisma.conversation.findUnique({where:{id:conversationId},select:{id:true,requesterId:true,assignedToId:true}});
    if(!conversation)throw new NotFoundException('Conversation introuvable.');
    const user=await this.prisma.user.findUnique({where:{id:userId},select:{canRespondMessages:true}});
    if(conversation.requesterId!==userId&&!(conversation.assignedToId===userId&&(user?.canRespondMessages??false))&&!['ADMIN','SUPER_ADMIN'].includes(role))throw new ForbiddenException('Cette conversation ne vous est pas destinée.');
    return conversation;
  }
  async list(userId:string,role:string){
    const responder=await this.prisma.user.findUnique({where:{id:userId},select:{canRespondMessages:true}});
    const where=['ADMIN','SUPER_ADMIN'].includes(role)?{}:responder?.canRespondMessages?{assignedToId:userId}:{requesterId:userId};
    return this.prisma.conversation.findMany({where,orderBy:{updatedAt:'desc'},take:100,include:{requester:{select:{id:true,fullName:true,role:true,photoUrl:true}},assignedTo:{select:{id:true,fullName:true,photoUrl:true}},messages:{orderBy:{createdAt:'asc'},take:100,include:{sender:{select:{id:true,fullName:true,role:true,photoUrl:true}}}}}});
  }
  async faithfulRecipients(userId:string,role:string){
    const user=await this.prisma.user.findUnique({where:{id:userId},select:{canRespondMessages:true}});
    if(!['ADMIN','SUPER_ADMIN'].includes(role)&&!user?.canRespondMessages)throw new ForbiddenException('Seuls les répondants désignés peuvent contacter les fidèles.');
    return this.prisma.user.findMany({where:{role:'FIDELE',active:true},select:{id:true,fullName:true,photoUrl:true,grade:true},orderBy:[{fullName:'asc'}]});
  }
  async open(userId:string,dto:OpenConversationDto){
    const subject=dto.subject.trim(),message=dto.message.trim();
    if(subject.length<3||message.length<2)throw new BadRequestException('Indiquez un objet et un message avant l’envoi.');
    const responders=await this.prisma.user.findMany({where:{active:true,canRespondMessages:true},select:{id:true},orderBy:{createdAt:'asc'}});
    const administrators=await this.prisma.user.findMany({where:{active:true,role:{in:['ADMIN','SUPER_ADMIN']}},select:{id:true},orderBy:{createdAt:'asc'}});
    const assignedToId=responders[0]?.id??administrators[0]?.id;
    if(!assignedToId)throw new BadRequestException('Aucune personne n’est disponible pour recevoir les messages.');
    const conv=await this.prisma.$transaction(async tx=>{
      const created=await tx.conversation.create({data:{subject,requesterId:userId,assignedToId,messages:{create:{body:message,senderId:userId}}}});
      const recipientIds=[...new Set([assignedToId,...administrators.map(user=>user.id)])].filter(id=>id!==userId);
      if(recipientIds.length)await tx.notification.createMany({data:recipientIds.map(id=>({userId:id,title:'Nouveau message de fidèle',body:'Un fidèle attend une réponse dans les messages de la paroisse.',href:'/messages'}))});
      return created;
    });
    return {id:conv.id};
  }
  async openForFaithful(userId:string,role:string,faithfulId:string,dto:OpenConversationDto){
    const user=await this.prisma.user.findUnique({where:{id:userId},select:{canRespondMessages:true}});
    if(!['ADMIN','SUPER_ADMIN'].includes(role)&&!user?.canRespondMessages)throw new ForbiddenException('Seuls les répondants désignés peuvent contacter les fidèles.');
    const faithful=await this.prisma.user.findUnique({where:{id:faithfulId},select:{id:true,role:true,active:true}});
    if(!faithful||faithful.role!=='FIDELE'||!faithful.active)throw new NotFoundException('Ce compte fidèle est introuvable ou inactif.');
    const subject=dto.subject.trim(),message=dto.message.trim();
    if(subject.length<3||message.length<2)throw new BadRequestException('Indiquez un objet et un message avant l’envoi.');
    const conversation=await this.prisma.$transaction(async tx=>{
      const created=await tx.conversation.create({data:{subject,requesterId:faithfulId,assignedToId:userId,messages:{create:{body:message,senderId:userId}}}});
      await tx.notification.create({data:{userId:faithfulId,title:'Nouveau message de la paroisse',body:'Un responsable de la paroisse vous a envoyé un message.',href:'/messages'}});
      return created;
    });
    return {id:conversation.id};
  }
  async reply(userId:string,role:string,id:string,dto:ReplyDto){
    const conversation=await this.access(userId,role,id),content=dto.message.trim();
    if(!content)throw new BadRequestException('Le message ne peut pas être vide.');
    if(conversation.requesterId!==userId&&!conversation.assignedToId){throw new ForbiddenException('Aucun répondant n’est affecté.');}
    await this.prisma.$transaction(async tx=>{
      await tx.message.create({data:{conversationId:id,senderId:userId,body:content}});
      await tx.conversation.update({where:{id},data:{updatedAt:new Date()}});
      const admins=await tx.user.findMany({where:{active:true,role:{in:['ADMIN','SUPER_ADMIN']}},select:{id:true}});
      const targets=[...new Set([conversation.requesterId,conversation.assignedToId??'',...admins.map(user=>user.id)])].filter(target=>target&&target!==userId);
      if(targets.length)await tx.notification.createMany({data:targets.map(target=>({userId:target,title:'Nouvelle réponse',body:'Une réponse est disponible dans une conversation paroissiale.',href:'/messages'}))});
    });
    return {sent:true};
  }
}

@UseGuards(JwtAuthGuard,RateLimitGuard)
@Controller('messages')
export class MessagingController {
  constructor(private readonly messaging:MessagingService){}
  @Get() list(@Req() req:any){return this.messaging.list(req.user.sub,req.user.role)}
  @Get('faithful') faithfulRecipients(@Req() req:any){return this.messaging.faithfulRecipients(req.user.sub,req.user.role)}
  @Post() open(@Req() req:any,@Body() body:OpenConversationDto){return this.messaging.open(req.user.sub,body)}
  @Post('to/:faithfulId') openForFaithful(@Req() req:any,@Param('faithfulId') faithfulId:string,@Body() body:OpenConversationDto){return this.messaging.openForFaithful(req.user.sub,req.user.role,faithfulId,body)}
  @Post(':id/reply') reply(@Req() req:any,@Param('id') id:string,@Body() body:ReplyDto){return this.messaging.reply(req.user.sub,req.user.role,id,body)}
}
