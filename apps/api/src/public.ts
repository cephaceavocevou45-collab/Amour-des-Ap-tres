import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { RateLimitGuard } from './rate-limit.guard';
import { PersonRoleName } from './generated/prisma';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';
import { ReauthProof, ReauthService } from './reauth';

class AnnouncementDto implements ReauthProof {
  @IsString() @Length(3,160) title!:string;
  @IsString() @Length(8,5000) body!:string;
  @IsString() @Length(8,1000) reason!:string;
  @IsOptional() @IsString() @MaxLength(128) reauthPassword?:string;
}
class AnnouncementVisibilityDto implements ReauthProof {
  @IsBoolean() published!:boolean;
  @IsString() @Length(8,1000) reason!:string;
  @IsOptional() @IsString() @MaxLength(128) reauthPassword?:string;
}

@UseGuards(RateLimitGuard)
@Controller('public')
export class PublicController {
  constructor(private readonly prisma: PrismaService,private readonly reauth:ReauthService) {}

  @Get('leader') leader() {
    return { name:'Vénérable Suprême Évangéliste SEWADE KOUESSIVI Lucien', title:'Chargé paroissial', photoUrl:'leader-720.webp', welcome:'Bienvenue à la paroisse Amour des Apôtres, Sainte-Cécile. Que la paix du Seigneur soit avec vous.' };
  }

  @Get('team') async getTeam() {
    const people=await this.prisma.person.findMany({where:{active:true,roles:{some:{role:{in:[PersonRoleName.LEADER,PersonRoleName.MONITEUR_TABLE,PersonRoleName.RESUME_PRECEDENT,PersonRoleName.EXPLICATION_TEXTE,PersonRoleName.PRESENTATION_THEME]}}}},include:{roles:true},orderBy:{displayOrder:'asc'}});
    return people.map(person=>{
      // Older seed data stored “Dehoto” in the family name instead of grade.
      // Normalize it for display without requiring a database write or reseed.
      const isDehoto=person.grade?.toLocaleLowerCase('fr')==='dehoto'||/^DEHOTO\s+/i.test(person.lastName);
      const familyName=isDehoto?person.lastName.replace(/^DEHOTO\s+/i,''):person.lastName;
      return {id:person.id,name:`${familyName} ${person.firstName}`,grade:isDehoto?(person.grade??'Dehoto'):person.grade,roles:person.roles.map(role=>role.role)};
    });
  }

  @Get('sessions/next') next() { const d=new Date(); const until=((8-d.getUTCDay())%7)||7; d.setUTCDate(d.getUTCDate()+until); return {date:d.toISOString().slice(0,10),startTime:'19:30',endTime:'21:30',theme:'Thème à venir'}; }
  @UseGuards(JwtAuthGuard) @Get('sessions') async sessions(@Req() req:any) {
    this.requireFaithful(req.user.role);
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Porto-Novo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const today=`${parts.find(part=>part.type==='year')!.value}-${parts.find(part=>part.type==='month')!.value}-${parts.find(part=>part.type==='day')!.value}`;
    const rows=await this.prisma.session.findMany({
      where:{date:{gte:new Date(`${today}T00:00:00.000Z`)}},
      orderBy:{date:'asc'},take:12,
      select:{date:true,startTime:true,endTime:true,theme:true,bibleReference:true,bibleText:true,previousSummary:true,assignments:{select:{role:true,person:{select:{firstName:true,lastName:true,grade:true}}}}}
    });
    return rows.map(row=>({date:row.date.toISOString().slice(0,10),startTime:row.startTime,endTime:row.endTime,theme:row.theme,bibleReference:row.bibleReference,bibleText:row.bibleText,previousSummary:row.previousSummary,people:row.assignments.map(item=>({role:item.role,name:`${item.person.firstName} ${item.person.lastName}`,grade:item.person.grade}))}));
  }

  @UseGuards(JwtAuthGuard) @Get('announcements') async announcements(@Req() req:any){
    this.requireFaithful(req.user.role);
    return this.prisma.announcement.findMany({where:{published:true},orderBy:{createdAt:'desc'},take:30,select:{id:true,title:true,body:true,createdAt:true}});
  }

  @UseGuards(JwtAuthGuard) @Get('admin/announcements') async adminAnnouncements(@Req() req:any){
    this.requireAdmin(req.user.role);
    return this.prisma.announcement.findMany({orderBy:{createdAt:'desc'},take:100,select:{id:true,title:true,body:true,published:true,createdAt:true}});
  }

  @UseGuards(JwtAuthGuard) @Post('admin/announcements') async createAnnouncement(@Body() body:AnnouncementDto,@Req() req:any){
    this.requireAdmin(req.user.role);await this.reauth.requireRecentProof(req.user.sub,body);
    const reason=body.reason.trim();if(reason.length<8)throw new BadRequestException('Le motif doit contenir au moins huit caractères.');
    return this.prisma.$transaction(async tx=>{
      const item=await tx.announcement.create({data:{title:body.title.trim(),body:body.body.trim(),authorId:req.user.sub}});
      await tx.auditLog.create({data:{userId:req.user.sub,action:'ANNONCE_PUBLIEE',entity:'Announcement',entityId:item.id,after:{title:item.title,published:item.published},reason,ip:req.ip??'unknown'}});
      return item;
    });
  }

  @UseGuards(JwtAuthGuard) @Patch('admin/announcements/:id') async setAnnouncementVisibility(@Param('id') id:string,@Body() body:AnnouncementVisibilityDto,@Req() req:any){
    this.requireAdmin(req.user.role);await this.reauth.requireRecentProof(req.user.sub,body);
    const reason=body.reason.trim();if(reason.length<8)throw new BadRequestException('Le motif doit contenir au moins huit caractères.');
    return this.prisma.$transaction(async tx=>{
      const previous=await tx.announcement.findUnique({where:{id},select:{id:true,published:true,title:true}});
      if(!previous)throw new NotFoundException('Annonce introuvable.');
      const item=await tx.announcement.update({where:{id},data:{published:body.published}});
      await tx.auditLog.create({data:{userId:req.user.sub,action:body.published?'ANNONCE_REPUBLIEE':'ANNONCE_ARCHIVEE',entity:'Announcement',entityId:id,before:{published:previous.published},after:{published:item.published,title:item.title},reason,ip:req.ip??'unknown'}});
      return item;
    });
  }

  private requireAdmin(role:string){if(!['ADMIN','SUPER_ADMIN'].includes(role))throw new ForbiddenException('Action réservée à l’administration paroissiale.');}
  private requireFaithful(role:string){if(role!=='FIDELE')throw new ForbiddenException('Cette rubrique est réservée aux comptes fidèles.');}
}
