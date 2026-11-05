import { Body, Controller, Delete, Get, HttpException, Optional, Param, Patch, Post, Put, Query, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { IsArray, IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, ArrayMaxSize, Length, Matches } from 'class-validator';
import { PersonRoleName, SheetStatus, SheetType, Sex, Zone } from './generated/prisma';
import { normalizeName, totals } from '../../../packages/shared/src';
import { JwtAuthGuard } from './auth.guard';
import { PrismaService } from './prisma.service';
import { ReauthProof, ReauthService } from './reauth';
import { RateLimitGuard } from './rate-limit.guard';

class EntryDto {
  @IsString() @MaxLength(120) fullName!: string;
  @IsEnum(Sex) sex!: Sex;
  @IsEnum(Zone) zone!: Zone;
  @IsUUID() clientUuid!: string;
  @IsOptional() @IsBoolean() confirmDuplicate?: boolean;
}
class EntryUpdateDto {
  @IsString() @MaxLength(120) fullName!:string;
  @IsEnum(Sex) sex!:Sex;
  @IsEnum(Zone) zone!:Zone;
  @IsOptional() @IsBoolean() confirmDuplicate?:boolean;
}
class SubmitDto { @IsOptional() @IsString() reason?: string; }
class DailyAttendanceReportDto {
  @IsString() @Length(10,2000) summary!:string;
  @IsString() @Length(1,2000) difficulties!:string;
  @IsString() @Length(1,2000) followUp!:string;
}
class CourseUpdateDto {
  @IsOptional() @IsString() @Length(1,10000) previousSummary?:string;
  @IsOptional() @IsString() @Length(1,300) bibleReference?:string;
  @IsOptional() @IsString() @Length(1,10000) bibleText?:string;
  @IsOptional() @IsString() @Length(1,500) theme?:string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9_-]{1,40}$/i) previousPresenterId?:string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9_-]{1,40}$/i) textPresenterId?:string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9_-]{1,40}$/i) themePresenterId?:string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @Matches(/^[a-z0-9_-]{1,40}$/i,{each:true}) monitorIds?:string[];
}
class CourseCorrectionRequestDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) date!:string;
  @IsString() @Matches(/^[a-z0-9_-]{1,40}$/i) recipientId!:string;
  @IsString() @Length(8,1000) message!:string;
}
class CourseCorrectionReadDto { @IsString() @Matches(/^[a-z0-9_-]{1,40}$/i) requestId!:string; }
class CorrectionDto {
  @IsString() @MaxLength(120) fullName!:string;
  @IsEnum(Sex) sex!:Sex;
  @IsEnum(Zone) zone!:Zone;
  @IsIn(['DOUBLON','ERREUR_DE_SAISIE','JUSTIFICATIF_PAROISSIAL']) reason!:string;
}
class NamesAccessDto implements ReauthProof { @IsIn(['VERIFICATION_DEMANDE','SIGNAL_ADMIN','CORRECTION_ADMIN']) reason!:string; @IsOptional() @IsString() @MaxLength(128) reauthPassword?:string; }

function localDateKey(date=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Porto-Novo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return `${parts.find(p=>p.type==='year')!.value}-${parts.find(p=>p.type==='month')!.value}-${parts.find(p=>p.type==='day')!.value}`;
}
function dateValue(date:string){return new Date(`${date}T00:00:00.000Z`);}
function isoWeekday(date:string){const day=dateValue(date).getUTCDay();return day===0?7:day;}
function todayTypes():SheetType[]{return new Intl.DateTimeFormat('en-US',{timeZone:'Africa/Porto-Novo',weekday:'short'}).format(new Date())==='Mon'?[SheetType.COURS_BIBLIQUE,SheetType.GROUPE_SEMAINE]:[SheetType.GROUPE_SEMAINE];}
export function isWithinAttendanceWindow(type:SheetType,now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Porto-Novo',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'}).formatToParts(now);
  const weekday=parts.find(p=>p.type==='weekday')!.value;
  const minutes=Number(parts.find(p=>p.type==='hour')!.value)*60+Number(parts.find(p=>p.type==='minute')!.value);
  const parsed=Number(process.env.ATTENDANCE_GRACE_MINUTES??0),grace=Number.isInteger(parsed)&&parsed>=0&&parsed<=120?parsed:0;
  const [start,end]=type===SheetType.COURS_BIBLIQUE?[1170,1290]:[600,1080];
  return (type!==SheetType.COURS_BIBLIQUE||weekday==='Mon')&&minutes>=start&&minutes<end+grace;
}

@UseGuards(JwtAuthGuard, RateLimitGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly prisma:PrismaService,@Optional() private readonly reauth?:ReauthService) {}

  @Get('today') async today(@Req() req:any) {
    const role=req.user.role;this.requireAttendanceRole(role);
    const date=localDateKey();
    const rows=await Promise.all(todayTypes().map(type=>this.prisma.attendanceSheet.upsert({
      where:{type_date:{type,date:dateValue(date)}},
      create:{id:`${type}-${date}`,type,date:dateValue(date)},
      update:{},
      include:{entries:{orderBy:{arrivedAt:'asc'}}}
    })));
    const visible=[];for(const sheet of rows)if(await this.canAccessSheet(role,req.user.sub,sheet)){if(role==='ADMIN'||role==='SUPER_ADMIN')await this.auditTotalsView(req,sheet.id);visible.push(this.summaryFor(sheet,role));}return visible;
  }

  @Get('sheets/:id/summary') async summary(@Param('id') id:string,@Req() req:any) {
    const role=req.user.role;this.requireAttendanceRole(role);
    const sheet=await this.prisma.attendanceSheet.findUnique({where:{id},include:{entries:{orderBy:{arrivedAt:'asc'}}}});
    if(!sheet)throw new HttpException('Feuille introuvable',404);
    if(!await this.canAccessSheet(role,req.user.sub,sheet))throw new HttpException('Cette feuille n’est pas comprise dans les responsabilités de votre compte.',403);
    if(role==='ADMIN'||role==='SUPER_ADMIN')await this.auditTotalsView(req,id);
    return this.summaryFor(sheet,role);
  }

  @Post('sheets/:id/names/access') async accessNames(@Param('id') id:string,@Body() body:NamesAccessDto,@Req() req:any){
    if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new HttpException('Consultation nominative réservée à l’administration principale.',403);
    if(!this.reauth)throw new UnauthorizedException('Réauthentification indisponible.');
    await this.reauth.requireRecentProof(req.user.sub,body);
    const sheet=await this.prisma.attendanceSheet.findUnique({where:{id},include:{entries:{orderBy:{arrivedAt:'asc'}}}});
    if(!sheet)throw new HttpException('Feuille introuvable',404);
    await this.prisma.auditLog.create({data:{userId:req.user.sub,action:'CONSULTATION_NOMINATIVE',entity:'AttendanceSheet',entityId:id,reason:body.reason.trim(),ip:req.ip}});
    return this.summaryFor(sheet,'ADMIN',false,true);
  }

  @Post('sheets/:id/entries') async add(@Param('id') id:string,@Body() body:EntryDto,@Req() req:any) {
    const role=req.user.role;
    const sheet=await this.findOrCreateTodaySheet(id);
    if(localDateKey(sheet.date)!==localDateKey())throw new HttpException('La saisie est réservée à la feuille du jour.',403);
    if(!await this.canAccessSheet(role,req.user.sub,sheet))throw new HttpException('Cette feuille n’est pas comprise dans les responsabilités de votre compte.',403);
    this.requireZoneRole(role,sheet.type,body.zone);
    if(!isWithinAttendanceWindow(sheet.type))throw new HttpException(sheet.type===SheetType.GROUPE_SEMAINE?'La saisie du Président de semaine est ouverte de 10 h à 18 h.':'La saisie du cours biblique est ouverte de 19 h 30 à 21 h 30.',403);
    await this.prisma.$transaction(async tx=>{
      const current=await tx.attendanceSheet.findUnique({where:{id},select:{status:true}});
      if(!current)throw new HttpException('Feuille introuvable.',404);
      const existing=await tx.attendanceEntry.findUnique({where:{sheetId_clientUuid:{sheetId:id,clientUuid:body.clientUuid}}});
      if(existing)return;
      if(!isWithinAttendanceWindow(sheet.type))throw new HttpException('La période de saisie de cette feuille est terminée.',403);
      const unlocked=await tx.attendanceSheet.updateMany({where:{id,status:{in:[SheetStatus.OUVERTE,SheetStatus.ENREGISTREE]}},data:{status:SheetStatus.OUVERTE,submittedAt:null,submittedById:null}});
      if(unlocked.count!==1)throw new HttpException('Feuille enregistrée et verrouillée.',409);
      const zoneEntries=await tx.attendanceEntry.findMany({where:{sheetId:id,zone:body.zone},select:{fullName:true,normalizedName:true}});
      const duplicate=zoneEntries.some(entry=>normalizeName(entry.normalizedName??entry.fullName??'')===normalizeName(body.fullName));
      if(duplicate&&!body.confirmDuplicate)throw new HttpException({code:'DUPLICATE_NAME_WARNING',message:'Un nom identique existe déjà dans cette zone.',confirmable:true},409);
      await tx.attendanceEntry.create({data:{sheetId:id,clientUuid:body.clientUuid,fullName:body.fullName.trim().replace(/\s+/g,' '),normalizedName:normalizeName(body.fullName),sex:body.sex,zone:body.zone,createdById:req.user.sub}});
      await this.updateSheetTotals(tx,id);
    });
    return this.summaryFor(await this.withEntries(id),role);
  }

  @Delete('sheets/:id/entries/:clientUuid') async remove(@Param('id') id:string,@Param('clientUuid') clientUuid:string,@Req() req:any) {
    const sheet=await this.prisma.attendanceSheet.findUnique({where:{id}});
    if(!sheet)throw new HttpException('Feuille introuvable',404);
    const entry=await this.prisma.attendanceEntry.findUnique({where:{sheetId_clientUuid:{sheetId:id,clientUuid}}});
    if(!entry)throw new HttpException('Présence introuvable',404);
    this.requireZoneRole(req.user.role,sheet.type,entry.zone);
    if(localDateKey(sheet.date)!==localDateKey()||!await this.canAccessSheet(req.user.role,req.user.sub,sheet))throw new HttpException('La modification est réservée à votre feuille du jour.',403);
    if(!this.isWithinWindow(sheet.type))throw new HttpException('La période de modification de cette feuille est terminée ou n’a pas encore commencé.',403);
    if(!['SECRETAIRE_PRESENCE','RESPONSABLE_SEMAINE'].includes(req.user.role))throw new HttpException('La suppression est réservée à l’agent responsable de cette feuille.',403);
    await this.prisma.$transaction(async tx=>{
      const unlocked=await tx.attendanceSheet.updateMany({where:{id,status:{in:[SheetStatus.OUVERTE,SheetStatus.ENREGISTREE]}},data:{status:SheetStatus.OUVERTE,submittedAt:null,submittedById:null}});
      if(unlocked.count!==1)throw new HttpException('Feuille enregistrée et verrouillée.',409);
      if(!isWithinAttendanceWindow(sheet.type))throw new HttpException('La période de modification de cette feuille est terminée ou n’a pas encore commencé.',403);
      await tx.attendanceEntry.delete({where:{sheetId_clientUuid:{sheetId:id,clientUuid}}});
      await this.updateSheetTotals(tx,id);
      await tx.auditLog.create({data:{userId:req.user.sub,action:'PRESENCE_SUPPRIMEE',entity:'AttendanceEntry',entityId:entry.id,ip:req.ip}});
    });
    return this.summaryFor(await this.withEntries(id),req.user.role);
  }

  @Patch('sheets/:id/entries/:clientUuid') async updateEntry(@Param('id') id:string,@Param('clientUuid') clientUuid:string,@Body() body:EntryUpdateDto,@Req() req:any){
    const role=req.user.role;if(!['SECRETAIRE_PRESENCE','RESPONSABLE_SEMAINE'].includes(role))throw new HttpException('L’administration consulte les feuilles mais ne modifie pas les présences.',403);
    const sheet=await this.prisma.attendanceSheet.findUnique({where:{id}});
    if(!sheet)throw new HttpException('Feuille introuvable.',404);
    const entry=await this.prisma.attendanceEntry.findUnique({where:{sheetId_clientUuid:{sheetId:id,clientUuid}}});
    if(!entry)throw new HttpException('Présence introuvable.',404);
    if(localDateKey(sheet.date)!==localDateKey()||!await this.canAccessSheet(role,req.user.sub,sheet))throw new HttpException('La modification est réservée à votre feuille du jour.',403);
    this.requireZoneRole(role,sheet.type,body.zone);
    if(!isWithinAttendanceWindow(sheet.type))throw new HttpException('La période de modification est terminée ou n’a pas encore commencé.',403);
    const name=body.fullName.trim().replace(/\s+/g,' ');if(!name)throw new HttpException('Le nom ne peut pas être vide.',400);
    const sameZone=await this.prisma.attendanceEntry.findMany({where:{sheetId:id,zone:body.zone,id:{not:entry.id}},select:{fullName:true,normalizedName:true}});
    const duplicate=sameZone.some(row=>normalizeName(row.normalizedName??row.fullName??'')===normalizeName(name));
    if(duplicate&&!body.confirmDuplicate)throw new HttpException({code:'DUPLICATE_NAME_WARNING',message:'Un nom identique existe déjà dans cette zone.',confirmable:true},409);
    await this.prisma.$transaction(async tx=>{
      const available=await tx.attendanceSheet.updateMany({where:{id,status:{in:[SheetStatus.OUVERTE,SheetStatus.ENREGISTREE]}},data:{status:SheetStatus.OUVERTE,submittedAt:null,submittedById:null}});
      if(available.count!==1)throw new HttpException('Feuille enregistrée et verrouillée.',409);
      if(!isWithinAttendanceWindow(sheet.type))throw new HttpException('La période de modification est terminée ou n’a pas encore commencé.',403);
      const updated=await tx.attendanceEntry.update({where:{id:entry.id},data:{fullName:name,normalizedName:normalizeName(name),sex:body.sex,zone:body.zone}});
      await this.updateSheetTotals(tx,id);
      await tx.auditLog.create({data:{userId:req.user.sub,action:'PRESENCE_MODIFIEE',entity:'AttendanceEntry',entityId:entry.id,before:{sex:entry.sex,zone:entry.zone},after:{sex:updated.sex,zone:updated.zone},ip:req.ip}});
    });
    return this.summaryFor(await this.withEntries(id),role);
  }

  @Post('sheets/:id/submit') async submit(@Param('id') id:string,@Body() _body:SubmitDto,@Req() req:any) {
    const role=req.user.role;
    if(!['SECRETAIRE_PRESENCE','RESPONSABLE_SEMAINE'].includes(role))throw new HttpException('L’administration consulte les feuilles mais ne les enregistre pas.',403);
    const sheet=await this.prisma.attendanceSheet.findUnique({where:{id}});
    if(!sheet)throw new HttpException('Feuille introuvable',404);
    if(localDateKey(sheet.date)!==localDateKey()||!await this.canAccessSheet(role,req.user.sub,sheet))throw new HttpException('Cette feuille n’est pas comprise dans les responsabilités de votre compte.',403);
    if(!this.isWithinWindow(sheet.type))throw new HttpException('La période d’enregistrement de cette feuille est terminée ou n’a pas encore commencé.',403);
    if(role==='RESPONSABLE_SEMAINE'&&sheet.type===SheetType.GROUPE_SEMAINE){
      const localTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Porto-Novo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
      const minute=Number(localTime.find(part=>part.type==='hour')!.value)*60+Number(localTime.find(part=>part.type==='minute')!.value);
      if(minute>=1020){
        const report=await this.prisma.parishDailyAttendanceReport.findUnique({where:{date_presidentId:{date:dateValue(localDateKey()),presidentId:req.user.sub}},select:{id:true}});
        if(!report)throw new HttpException('Transmettez d’abord le rapport obligatoire de 17 h avant d’enregistrer la feuille.',400);
      }
    }
    const saved=await this.prisma.$transaction(async tx=>{
      if(!isWithinAttendanceWindow(sheet.type))throw new HttpException('La période d’enregistrement de cette feuille est terminée.',403);
      const locked=await tx.attendanceSheet.updateMany({where:{id,status:{in:[SheetStatus.OUVERTE,SheetStatus.ENREGISTREE]}},data:{status:SheetStatus.ENREGISTREE,submittedAt:new Date(),submittedById:req.user.sub}});
      if(locked.count!==1)return false;
      await this.updateSheetTotals(tx,id);
      await tx.auditLog.create({data:{userId:req.user.sub,action:'FEUILLE_ENREGISTREE',entity:'AttendanceSheet',entityId:id,ip:req.ip}});
      return true;
    });
    if(!saved)throw new HttpException('Feuille déjà verrouillée.',409);
    return this.summaryFor(await this.withEntries(id),role);
  }

  @Get('daily-report/today') async todayReport(@Req() req:any) {
    if(req.user.role!=='RESPONSABLE_SEMAINE')throw new HttpException('Le rapport est réservé au président du jour.',403);
    const user=await this.prisma.user.findUnique({where:{id:req.user.sub},select:{assignedDayOfWeek:true}});
    const date=localDateKey();
    if(!user?.assignedDayOfWeek||isoWeekday(date)!==user.assignedDayOfWeek)throw new HttpException('Ce compte n’est pas le président du jour.',403);
    return this.prisma.parishDailyAttendanceReport.findUnique({where:{date_presidentId:{date:dateValue(date),presidentId:req.user.sub}}});
  }

  @Post('daily-report') async saveDailyReport(@Body() body:DailyAttendanceReportDto,@Req() req:any) {
    if(req.user.role!=='RESPONSABLE_SEMAINE')throw new HttpException('Le rapport quotidien est réservé au président du jour.',403);
    const date=localDateKey();
    const user=await this.prisma.user.findUnique({where:{id:req.user.sub},select:{assignedDayOfWeek:true}});
    if(!user?.assignedDayOfWeek||isoWeekday(date)!==user.assignedDayOfWeek)throw new HttpException('Ce compte n’est pas le président du jour.',403);
    const now=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Porto-Novo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
    const minute=Number(now.find(part=>part.type==='hour')!.value)*60+Number(now.find(part=>part.type==='minute')!.value);
    if(minute<1020||minute>=1080)throw new HttpException('Le rapport peut être envoyé de 17 h à 18 h.',403);
    const summary=body.summary.trim(),difficulties=body.difficulties.trim(),followUp=body.followUp.trim();
    if(summary.length<10||!difficulties||!followUp)throw new HttpException('Renseignez le déroulement (au moins 10 caractères), les difficultés et les suites à donner.',400);
    const dateObject=dateValue(date),sheetId=`${SheetType.GROUPE_SEMAINE}-${date}`;
    const entryRows=await this.prisma.attendanceEntry.findMany({where:{sheetId},select:{zone:true}});
    const attendance={total:entryRows.length,temple:entryRows.filter(entry=>entry.zone===Zone.TEMPLE).length,salleVision:entryRows.filter(entry=>entry.zone===Zone.SALLE_VISION).length};
    const report=await this.prisma.$transaction(async tx=>{
      const existing=await tx.parishDailyAttendanceReport.findUnique({where:{date_presidentId:{date:dateObject,presidentId:req.user.sub}},select:{id:true}});
      const saved=await tx.parishDailyAttendanceReport.upsert({
        where:{date_presidentId:{date:dateObject,presidentId:req.user.sub}},
        create:{date:dateObject,presidentId:req.user.sub,summary,difficulties,followUp},
        update:{summary,difficulties,followUp,submittedAt:new Date()},
        include:{president:{select:{fullName:true,email:true}}}
      });
      if(!existing){
        const admins=await tx.user.findMany({where:{active:true,role:{in:['ADMIN','SUPER_ADMIN']}},select:{id:true}});
        if(admins.length)await tx.notification.createMany({data:admins.map(admin=>({userId:admin.id,title:'Rapport de présence reçu',body:`${saved.president.fullName||saved.president.email} a transmis le rapport du ${date}.`,href:'/presence'}))});
      }
      await tx.auditLog.create({data:{userId:req.user.sub,action:existing?'RAPPORT_PRESENCE_MODIFIE':'RAPPORT_PRESENCE_TRANSMIS',entity:'ParishDailyAttendanceReport',entityId:saved.id,after:{attendance},ip:req.ip}});
      return {...saved,attendance};
    });
    return report;
  }

  @Patch('sheets/:id/entries/:clientUuid/correction') async correct(@Param('id') id:string,@Param('clientUuid') clientUuid:string,@Body() body:CorrectionDto,@Req() req:any){
    if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new HttpException('Correction réservée à l’administration principale.',403);
    const entry=await this.prisma.attendanceEntry.findUnique({where:{sheetId_clientUuid:{sheetId:id,clientUuid}},include:{sheet:true}});
    if(!entry)throw new HttpException('Présence introuvable.',404);
    const validZone=entry.sheet.type===SheetType.COURS_BIBLIQUE?body.zone===Zone.FIDELES:body.zone===Zone.TEMPLE||body.zone===Zone.SALLE_VISION;
    if(!validZone)throw new HttpException('Cette zone ne correspond pas au type de feuille.',400);
    const name=body.fullName.trim().replace(/\s+/g,' ');
    if(!name)throw new HttpException('Le nom ne peut pas être vide.',400);
    await this.prisma.$transaction(async tx=>{
      const updated=await tx.attendanceEntry.update({where:{id:entry.id},data:{fullName:name,normalizedName:normalizeName(name),sex:body.sex,zone:body.zone}});
      await tx.auditLog.create({data:{userId:req.user.sub,action:'CORRECTION_PRESENCE',entity:'AttendanceEntry',entityId:entry.id,before:{sex:entry.sex,zone:entry.zone},after:{sex:updated.sex,zone:updated.zone},reason:body.reason.trim()}});
    });
    return this.summaryFor(await this.withEntries(id),req.user.role);
  }

  @Get('week') async week(@Query('start') start:string|undefined,@Req() req:any) {
    const role=req.user.role;this.requireAttendanceRole(role);
    if(role==='SECRETAIRE_PRESENCE')throw new HttpException('Le secrétaire de présence n’a pas accès aux feuilles du groupe de semaine.',403);
    let requested=start??this.mondayOf(localDateKey());
    if(start&&(!/^\d{4}-\d{2}-\d{2}$/.test(start)||Number.isNaN(Date.parse(`${start}T00:00:00Z`))||new Date(`${start}T00:00:00Z`).toISOString().slice(0,10)!==start))throw new HttpException('Date de début de semaine invalide.',400);
    if(role==='RESPONSABLE_SEMAINE'){const user=await this.prisma.user.findUnique({where:{id:req.user.sub},select:{assignedDayOfWeek:true}});if(!user?.assignedDayOfWeek)throw new HttpException('Aucun jour n’est attribué à ce compte.',403);const currentWeek=this.mondayOf(localDateKey());if(start&&this.mondayOf(start)!==currentWeek)throw new HttpException('Vous pouvez consulter uniquement votre jour de responsabilité dans la semaine en cours.',403);requested=currentWeek;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(requested)||Number.isNaN(Date.parse(`${requested}T00:00:00Z`)))throw new HttpException('Date de début de semaine invalide.',400);
    if(role==='ADMIN'||role==='SUPER_ADMIN'){const currentWeek=this.mondayOf(localDateKey()),requestedWeek=this.mondayOf(requested),delta=(Date.parse(`${requestedWeek}T00:00:00Z`)-Date.parse(`${currentWeek}T00:00:00Z`))/86_400_000;if(delta < -366 || delta > 90)throw new HttpException('La supervision des présences est limitée à 12 mois d’historique et 90 jours à venir.',400);requested=requestedWeek;}
    const userDay=role==='RESPONSABLE_SEMAINE'?(await this.prisma.user.findUnique({where:{id:req.user.sub},select:{assignedDayOfWeek:true}}))?.assignedDayOfWeek:null;
    const dayIndexes=userDay?[userDay-1]:Array.from({length:7},(_,index)=>index);
    const days=await Promise.all(dayIndexes.map(async(index)=>{
      const date=new Date(`${requested}T00:00:00.000Z`);date.setUTCDate(date.getUTCDate()+index);const key=date.toISOString().slice(0,10);
      const id=`${SheetType.GROUPE_SEMAINE}-${key}`;
      const sheet=await this.prisma.attendanceSheet.upsert({where:{type_date:{type:SheetType.GROUPE_SEMAINE,date:dateValue(key)}},create:{id,type:SheetType.GROUPE_SEMAINE,date:dateValue(key)},update:{},include:{entries:{orderBy:{arrivedAt:'asc'}}}});
       const summary=this.summaryFor(sheet,role,true);const byZone:Record<string,ReturnType<typeof totals>>={};for(const zone of [Zone.TEMPLE,Zone.SALLE_VISION])byZone[zone]=totals(summary.entries.filter((entry:any)=>entry.zone===zone));
      return {...summary,byZone};
    }));
    if(role==='ADMIN'||role==='SUPER_ADMIN'){
      for(const day of days)await this.auditTotalsView(req,day.id);
      const ids=[...new Set(days.map((day:any)=>day.submittedById).filter(Boolean))] as string[];
      const users=ids.length?await this.prisma.user.findMany({where:{id:{in:ids}},select:{id:true,fullName:true,email:true}}):[];
      const userById=new Map(users.map(user=>[user.id,{fullName:user.fullName,email:user.email}]));
      const presidents=await this.prisma.user.findMany({where:{active:true,role:'RESPONSABLE_SEMAINE',assignedDayOfWeek:{not:null}},select:{fullName:true,email:true,assignedDayOfWeek:true}});
      const endDate=new Date(`${requested}T00:00:00.000Z`);endDate.setUTCDate(endDate.getUTCDate()+7);
      const reports=await this.prisma.parishDailyAttendanceReport.findMany({where:{date:{gte:dateValue(requested),lt:endDate}},include:{president:{select:{fullName:true,email:true}}}});
      const reportByDate=new Map<string,typeof reports>();
      for(const report of reports){const key=localDateKey(report.date);reportByDate.set(key,[...(reportByDate.get(key)??[]),report]);}
      return {start:requested,end:days[days.length-1].date,days:days.map((day:any)=>{
        const {submittedById,...summary}=day;
        const weekday=isoWeekday(day.date);
        const responsible=presidents.filter(president=>president.assignedDayOfWeek===weekday).map(({fullName,email})=>({fullName,email}));
        return {...summary,submittedBy:submittedById?userById.get(submittedById)??null:null,responsible,dailyReports:reportByDate.get(day.date)??[]};
      })};
    }
    return {start:requested,end:days[days.length-1].date,days:days.map((day:any)=>{const {submittedById,...summary}=day;return summary;})};
  }

  @Get('course/:date') async course(@Param('date') date:string,@Req() req:any){this.requireCourseAccess(req.user);this.requireMondayDate(date);if(req.user.role==='SECRETAIRE_PRESENCE'&&date!==localDateKey())throw new HttpException('Le secrétaire consulte uniquement le cours biblique du lundi en cours.',403);return this.courseData(date);}

  @Put('course/:date') async updateCourse(@Param('date') date:string,@Body() body:CourseUpdateDto,@Req() req:any){if(req.user.role!=='SECRETAIRE_PRESENCE')throw new HttpException('Seul le secrétaire responsable du cours biblique peut modifier le programme.',403);this.requireMondayDate(date);if(date!==localDateKey()||!this.isWithinWindow(SheetType.COURS_BIBLIQUE))throw new HttpException('Le programme du cours peut être modifié le lundi de 19 h 30 à 21 h 30.',403);const roles:[PersonRoleName,string[]][]=[[PersonRoleName.RESUME_PRECEDENT,[body.previousPresenterId].filter((id):id is string=>!!id)],[PersonRoleName.EXPLICATION_TEXTE,[body.textPresenterId].filter((id):id is string=>!!id)],[PersonRoleName.PRESENTATION_THEME,[body.themePresenterId].filter((id):id is string=>!!id)],[PersonRoleName.MONITEUR_TABLE,Array.isArray(body.monitorIds)?body.monitorIds:[]]];const selectedIds=[...new Set(roles.flatMap(([,ids])=>ids))];const people=selectedIds.length?await this.prisma.person.findMany({where:{id:{in:selectedIds},active:true},include:{roles:true}}):[];for(const [role,ids]of roles)for(const id of ids){const person=people.find(row=>row.id===id);if(!person||!person.roles.some(item=>item.role===role))throw new HttpException('Choisissez chaque intervenant dans la liste correspondant à son rôle.',400);}const dateObj=dateValue(date);await this.prisma.$transaction(async tx=>{const session=await tx.session.upsert({where:{date:dateObj},create:{date:dateObj,theme:body.theme?.trim()||'Thème à définir',bibleBook:body.bibleReference?.trim()||'À préciser',bibleChapter:1,previousSummary:body.previousSummary?.trim()||null,bibleReference:body.bibleReference?.trim()||null,bibleText:body.bibleText?.trim()||null},update:{theme:body.theme?.trim()||'Thème à définir',bibleBook:body.bibleReference?.trim()||'À préciser',previousSummary:body.previousSummary?.trim()||null,bibleReference:body.bibleReference?.trim()||null,bibleText:body.bibleText?.trim()||null}});await tx.sessionAssignment.deleteMany({where:{sessionId:session.id}});const assignmentRows=roles.flatMap(([role,ids])=>ids.map(personId=>({sessionId:session.id,personId,role})));if(assignmentRows.length)await tx.sessionAssignment.createMany({data:assignmentRows});});return this.courseData(date);}

  @Post('course-corrections') async requestCourseCorrection(@Body() body:CourseCorrectionRequestDto,@Req() req:any){
    if(!['ADMIN','SUPER_ADMIN'].includes(req.user.role))throw new HttpException('Action réservée à l’administration.',403);
    this.requireMondayDate(body.date);
    const recipient=await this.prisma.user.findUnique({where:{id:body.recipientId},select:{id:true,role:true,active:true}});
    if(!recipient||recipient.role!=='SECRETAIRE_PRESENCE'||!recipient.active)throw new HttpException('Le secrétaire destinataire est introuvable ou inactif.',404);
    return this.prisma.auditLog.create({data:{userId:req.user.sub,action:'CORRECTION_PROGRAMME_DEMANDEE',entity:'CourseProgramCorrection',entityId:recipient.id,reason:body.message.trim(),after:{date:body.date},ip:req.ip},select:{id:true,createdAt:true}});
  }

  @Get('course-corrections') async courseCorrections(@Req() req:any){
    if(req.user.role!=='SECRETAIRE_PRESENCE')throw new HttpException('Ces messages sont réservés au secrétaire des cours bibliques.',403);
    const [requests,reads]=await Promise.all([
      this.prisma.auditLog.findMany({where:{entity:'CourseProgramCorrection',action:'CORRECTION_PROGRAMME_DEMANDEE',entityId:req.user.sub},orderBy:{createdAt:'desc'},take:30,select:{id:true,reason:true,after:true,createdAt:true}}),
      this.prisma.auditLog.findMany({where:{entity:'CourseProgramCorrection',action:'CORRECTION_PROGRAMME_LUE',userId:req.user.sub},select:{after:true}})
    ]);
    const readIds=new Set(reads.map((row:any)=>row.after?.requestId).filter(Boolean));
    return requests.filter((row:any)=>!readIds.has(row.id)).map((row:any)=>({id:row.id,message:row.reason,date:row.after?.date??null,createdAt:row.createdAt}));
  }

  @Post('course-corrections/read') async markCourseCorrectionRead(@Body() body:CourseCorrectionReadDto,@Req() req:any){
    if(req.user.role!=='SECRETAIRE_PRESENCE')throw new HttpException('Ces messages sont réservés au secrétaire des cours bibliques.',403);
    const request=await this.prisma.auditLog.findFirst({where:{id:body.requestId,entity:'CourseProgramCorrection',action:'CORRECTION_PROGRAMME_DEMANDEE',entityId:req.user.sub},select:{id:true}});
    if(!request)throw new HttpException('Demande de correction introuvable.',404);
    const alreadyRead=await this.prisma.auditLog.findFirst({where:{entity:'CourseProgramCorrection',action:'CORRECTION_PROGRAMME_LUE',userId:req.user.sub,after:{path:['requestId'],equals:request.id}},select:{id:true}});
    if(!alreadyRead)await this.prisma.auditLog.create({data:{userId:req.user.sub,action:'CORRECTION_PROGRAMME_LUE',entity:'CourseProgramCorrection',entityId:req.user.sub,after:{requestId:request.id},ip:req.ip}});
    return {read:true};
  }

  private requireCourseAccess(user:{role:string;permissions?:string[]}){if(!['ADMIN','SUPER_ADMIN','EDITEUR','SECRETAIRE_PRESENCE'].includes(user.role))throw new HttpException('Accès au programme biblique non autorisé.',403);if(user.role==='EDITEUR'&&!user.permissions?.includes('PROGRAMME_BIBLIQUE'))throw new HttpException('Votre compte ne dispose pas de l’autorisation programme biblique.',403);}
  private requireMondayDate(date:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(`${date}T00:00:00Z`))||new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)!==date||new Date(`${date}T00:00:00Z`).getUTCDay()!==1)throw new HttpException('La date du cours doit être un lundi valide.',400);}
  private async courseData(date:string){const [meeting,roster]=await Promise.all([this.prisma.session.findUnique({where:{date:dateValue(date)},include:{assignments:{include:{person:true}}}}),this.prisma.person.findMany({where:{active:true},include:{roles:true},orderBy:{displayOrder:'asc'}})]);const assignments=meeting?.assignments??[];const personFor=(role:PersonRoleName)=>assignments.filter(item=>item.role===role).map(item=>({id:item.person.id,name:`${item.person.grade?item.person.grade+' — ':''}${item.person.firstName} ${item.person.lastName}`,grade:item.person.grade}));return {date,meeting:meeting?{id:meeting.id,previousSummary:meeting.previousSummary,bibleReference:meeting.bibleReference,bibleText:meeting.bibleText,theme:meeting.theme}:null,roster:roster.map(person=>({id:person.id,name:`${person.firstName} ${person.lastName}`,grade:person.grade,roles:person.roles.map(role=>role.role)})),selected:{previousPresenterId:assignments.find(item=>item.role===PersonRoleName.RESUME_PRECEDENT)?.personId??'',textPresenterId:assignments.find(item=>item.role===PersonRoleName.EXPLICATION_TEXTE)?.personId??'',themePresenterId:assignments.find(item=>item.role===PersonRoleName.PRESENTATION_THEME)?.personId??'',monitorIds:assignments.filter(item=>item.role===PersonRoleName.MONITEUR_TABLE).map(item=>item.personId)}};}

  private mondayOf(date:string){const value=new Date(`${date}T00:00:00.000Z`);const day=value.getUTCDay();value.setUTCDate(value.getUTCDate()-(day===0?6:day-1));return value.toISOString().slice(0,10);}

  private async findOrCreateTodaySheet(id:string) {
    let sheet=await this.prisma.attendanceSheet.findUnique({where:{id}});
    if(sheet)return sheet;
    const date=localDateKey();
    const type=todayTypes().find(candidate=>id===`${candidate}-${date}`);
    if(!type)throw new HttpException('Feuille introuvable',404);
    sheet=await this.prisma.attendanceSheet.upsert({where:{type_date:{type,date:dateValue(date)}},create:{id,type,date:dateValue(date)},update:{}});
    return sheet;
  }
  private async updateSheetTotals(tx:any,id:string){
    const entries=await tx.attendanceEntry.findMany({where:{sheetId:id},select:{sex:true,zone:true}});
    const byZone:Record<string,{men:number;women:number;total:number}>={};
    for(const zone of Object.values(Zone)){
      const rows=entries.filter((entry:any)=>entry.zone===zone);
      byZone[zone]={men:rows.filter((entry:any)=>entry.sex===Sex.M).length,women:rows.filter((entry:any)=>entry.sex===Sex.F).length,total:rows.length};
    }
    await tx.attendanceSheet.update({where:{id},data:{totalMen:entries.filter((entry:any)=>entry.sex===Sex.M).length,totalWomen:entries.filter((entry:any)=>entry.sex===Sex.F).length,totalAll:entries.length,totalsByZone:byZone}});
  }
  private withEntries(id:string){return this.prisma.attendanceSheet.findUniqueOrThrow({where:{id},include:{entries:{orderBy:{arrivedAt:'asc'}}}});}
  private auditTotalsView(req:any,id:string){return this.prisma.auditLog.create({data:{userId:req.user.sub,action:'CONSULTATION_TOTAUX',entity:'AttendanceSheet',entityId:id,ip:req.ip}});}
  private requireAttendanceRole(role:string){if(!['ADMIN','SUPER_ADMIN','SECRETAIRE_PRESENCE','RESPONSABLE_SEMAINE'].includes(role))throw new HttpException('Accès réservé aux responsables de présence.',403);}
  private async canAccessSheet(role:string,userId:string,sheet:{type:SheetType;date:Date}){if(role==='ADMIN'||role==='SUPER_ADMIN')return true;const key=localDateKey(sheet.date);if(role==='SECRETAIRE_PRESENCE')return sheet.type===SheetType.COURS_BIBLIQUE&&key===localDateKey()&&new Date(`${key}T00:00:00Z`).getUTCDay()===1;if(role==='RESPONSABLE_SEMAINE'&&sheet.type===SheetType.GROUPE_SEMAINE){const user=await this.prisma.user.findUnique({where:{id:userId},select:{assignedDayOfWeek:true}});return !!user?.assignedDayOfWeek&&key===localDateKey()&&isoWeekday(key)===user.assignedDayOfWeek;}return false;}
  private isWithinWindow(type:SheetType){return isWithinAttendanceWindow(type);}
  private requireZoneRole(role:string,type:SheetType,zone:Zone){
    if(role==='ADMIN'||role==='SUPER_ADMIN')throw new HttpException('L’administration consulte les présences mais ne saisit pas les noms.',403);
    if(role==='SECRETAIRE_PRESENCE'&&type===SheetType.COURS_BIBLIQUE&&zone===Zone.FIDELES)return;
    if(role==='RESPONSABLE_SEMAINE'&&type===SheetType.GROUPE_SEMAINE&&(zone===Zone.TEMPLE||zone===Zone.SALLE_VISION))return;
    throw new HttpException('Votre rôle ne permet pas cette saisie.',403);
  }
  private summaryFor(sheet:any,role:string,includeSubmitter=false,withNames=false){
    const admin=role==='ADMIN'||role==='SUPER_ADMIN';
    const entries=sheet.entries.filter((entry:any)=>(admin)||(role==='SECRETAIRE_PRESENCE'&&entry.zone===Zone.FIDELES)||(role==='RESPONSABLE_SEMAINE'&&(entry.zone===Zone.TEMPLE||entry.zone===Zone.SALLE_VISION)));
    const summaryEntries=admin&&!withNames?[]:entries;
    const storedTotal=(sheet.totalAll??0)>0||sheet.status===SheetStatus.ENREGISTREE?{men:sheet.totalMen,women:sheet.totalWomen,total:sheet.totalAll}:totals(entries);
    const result:any={id:sheet.id,type:sheet.type,date:localDateKey(sheet.date),status:sheet.status,entries:summaryEntries.map((entry:any)=>({fullName:entry.fullName,sex:entry.sex,zone:entry.zone,arrivedAt:entry.arrivedAt,clientUuid:entry.clientUuid})),totals:storedTotal};
    if(admin)result.byZone=sheet.totalsByZone??totals(entries).byZone;
    if(includeSubmitter){result.submittedById=sheet.submittedById??null;result.submittedAt=sheet.submittedAt??null;}
    return result;
  }
}
