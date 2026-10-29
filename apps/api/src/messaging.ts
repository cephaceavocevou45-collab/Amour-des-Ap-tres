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
    if(conversation.requesterId!==userId&&!(user?.canRespondMessages||['ADMIN','SUPER_ADMIN'].includes(role)))throw new ForbiddenException('Cette conversation ne vous est pas destinée.');
    return conversation;
  }
  async list(userId:string,role:string){
    const responder=await this.prisma.user.findUnique({where:{id:userId},select:{canRespondMessages:true}});
    const where=responder?.canRespondMessages||['ADMIN','SUPER_ADMIN'].includes(role)?{}:{requesterId:userId};
    return this.prisma.conversation.findMany({where,orderBy:{updatedAt:'desc'},take:100,include:{requester:{select:{id:true,fullName:true,role:true}},assignedTo:{select:{id:true,fullName:true}},messages:{orderBy:{createdAt:'asc'},take:100,include:{sender:{select:{id:true,fullName:true,role:true}}}}}});
  }
  async open(userId:string,dto:OpenConversationDto){
    const subject=dto.subject.trim(),message=dto.message.trim();
    if(subject.length<3||message.length<2)throw new BadRequestException('Indiquez un objet et un message avant l’envoi.');
    const responders=await this.prisma.user.findMany({where:{active:true,canRespondMessages:true},select:{id:true},orderBy:{createdAt:'asc'}});
    if(!responders.length)throw new BadRequestException('L’équipe de réponse n’est pas encore désignée par l’administration.');
    const conv=await this.prisma.conversation.create({data:{subject,requesterId:userId,assignedToId:responders[0].id,messages:{create:{body:message,senderId:userId}}}});
    return {id:conv.id};
  }
  async reply(userId:string,role:string,id:string,dto:ReplyDto){
    const conversation=await this.access(userId,role,id),content=dto.message.trim();
    if(!content)throw new BadRequestException('Le message ne peut pas être vide.');
    if(conversation.requesterId!==userId&&!conversation.assignedToId){throw new ForbiddenException('Aucun répondant n’est affecté.');}
    await this.prisma.$transaction(async tx=>{await tx.message.create({data:{conversationId:id,senderId:userId,body:content}});await tx.conversation.update({where:{id},data:{updatedAt:new Date()}})});
    return {sent:true};
  }
}

@UseGuards(JwtAuthGuard,RateLimitGuard)
@Controller('messages')
export class MessagingController {
  constructor(private readonly messaging:MessagingService){}
  @Get() list(@Req() req:any){return this.messaging.list(req.user.sub,req.user.role)}
  @Post() open(@Req() req:any,@Body() body:OpenConversationDto){return this.messaging.open(req.user.sub,body)}
  @Post(':id/reply') reply(@Req() req:any,@Param('id') id:string,@Body() body:ReplyDto){return this.messaging.reply(req.user.sub,req.user.role,id,body)}
}
