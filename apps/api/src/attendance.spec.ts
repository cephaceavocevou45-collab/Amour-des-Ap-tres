import { normalizeName, totals } from '../../../packages/shared/src';
import { SheetType, SheetStatus } from './generated/prisma';
import { isWithinAttendanceWindow, AttendanceController } from './attendance';
import { PrismaService } from './prisma.service';
describe('attendance helpers',()=>{
  it('normalizes accents and repeated spaces for duplicate checks',()=>expect(normalizeName('  Élodie   AHO  ')).toBe('elodie aho'));
  it('calculates totals by sex and zone on the server',()=>expect(totals([{sex:'M',zone:'TEMPLE'},{sex:'F',zone:'TEMPLE'},{sex:'M',zone:'SALLE_VISION'}])).toMatchObject({men:2,women:1,total:3,byZone:{TEMPLE:{men:1,women:1,total:2},SALLE_VISION:{men:1,women:0,total:1}}}));
  it('rejects writing outside the configured local attendance window',()=>{
    delete process.env.ATTENDANCE_GRACE_MINUTES;
    expect(isWithinAttendanceWindow(SheetType.GROUPE_SEMAINE,new Date('2026-10-05T09:59:00+01:00'))).toBe(false);
    expect(isWithinAttendanceWindow(SheetType.GROUPE_SEMAINE,new Date('2026-10-05T10:00:00+01:00'))).toBe(true);
    expect(isWithinAttendanceWindow(SheetType.GROUPE_SEMAINE,new Date('2026-10-05T18:00:00+01:00'))).toBe(false);
    expect(isWithinAttendanceWindow(SheetType.COURS_BIBLIQUE,new Date('2026-10-06T20:00:00+01:00'))).toBe(false);
  });
  it('denies a president access to a different weekday sheet',async()=>{
    jest.useFakeTimers().setSystemTime(new Date('2026-10-05T12:00:00+01:00'));
    const prisma={attendanceSheet:{findUnique:jest.fn().mockResolvedValue({id:'tuesday',type:SheetType.GROUPE_SEMAINE,date:new Date('2026-10-06T00:00:00Z'),entries:[],status:SheetStatus.OUVERTE})},user:{findUnique:jest.fn().mockResolvedValue({assignedDayOfWeek:1})}} as unknown as PrismaService;
    await expect(new AttendanceController(prisma).summary('tuesday',{user:{sub:'president-id',role:'RESPONSABLE_SEMAINE'}})).rejects.toMatchObject({status:403});
    jest.useRealTimers();
  });
  it('prevents an administrator from entering attendance on behalf of a responsible person',async()=>{
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Porto-Novo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const date=new Date(`${today}T00:00:00.000Z`);
    const prisma={attendanceSheet:{findUnique:jest.fn().mockResolvedValue({id:`GROUPE_SEMAINE-${today}`,type:SheetType.GROUPE_SEMAINE,date,status:SheetStatus.OUVERTE})}} as unknown as PrismaService;
    await expect(new AttendanceController(prisma).add(`GROUPE_SEMAINE-${today}`,{fullName:'Personne Test',sex:'M',zone:'TEMPLE',clientUuid:'a92cc3ba-7ba2-4e35-98cb-0dfd190caa45'} as any,{user:{sub:'admin-id',role:'ADMIN'}})).rejects.toMatchObject({status:403});
  });
  it('returns totals but no names to an administrator unless a reasoned names-access action is used',async()=>{
    const sheet={id:'sheet-1',type:SheetType.GROUPE_SEMAINE,date:new Date('2026-10-05T00:00:00Z'),status:SheetStatus.ENREGISTREE,totalMen:1,totalWomen:0,totalAll:1,totalsByZone:{TEMPLE:{men:1,women:0,total:1}},entries:[{fullName:'Nom Privé',sex:'M',zone:'TEMPLE',arrivedAt:new Date(),clientUuid:'x'}]};
    const prisma={attendanceSheet:{findUnique:jest.fn().mockResolvedValue(sheet)},auditLog:{create:jest.fn().mockResolvedValue({})}} as unknown as PrismaService;
    const controller=new AttendanceController(prisma,{requireRecentProof:jest.fn().mockResolvedValue(undefined)} as any),request={user:{sub:'admin-1',role:'ADMIN'},ip:'127.0.0.1'};
    const summary=await controller.summary('sheet-1',request);
    expect(summary.entries).toEqual([]);expect(summary.totals.total).toBe(1);
    const names=await controller.accessNames('sheet-1',{reason:'VERIFICATION_DEMANDE'} as any,request);
    expect(names.entries).toHaveLength(1);expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({action:'CONSULTATION_NOMINATIVE',reason:'VERIFICATION_DEMANDE'})}));
  });
  it('lets the parish secretary read historical course attendance by name',async()=>{
    const date=new Date('2026-10-05T00:00:00.000Z');
    const sheet={id:'COURS_BIBLIQUE-2026-10-05',type:SheetType.COURS_BIBLIQUE,date,status:SheetStatus.ENREGISTREE,totalMen:1,totalWomen:1,totalAll:2,totalsByZone:{FIDELES:{men:1,women:1,total:2}},entries:[{fullName:'Fidèle Test',sex:'F',zone:'FIDELES',arrivedAt:date,clientUuid:'entry-1'}]};
    const prisma={attendanceSheet:{findMany:jest.fn().mockResolvedValue([sheet])}} as unknown as PrismaService;
    const result=await new AttendanceController(prisma).courseHistory({user:{sub:'secretary-1',role:'SECRETAIRE_PROGRAMME'}});
    expect(result[0].entries).toEqual([{fullName:'Fidèle Test',sex:'F',zone:'FIDELES',arrivedAt:date,clientUuid:'entry-1'}]);
    expect(prisma.attendanceSheet.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({type:SheetType.COURS_BIBLIQUE,date:expect.objectContaining({gte:expect.any(Date),lte:expect.any(Date)})}),take:53}));
  });
  it('denies group attendance and attendance writes to the parish secretary',async()=>{
    const controller=new AttendanceController({attendanceSheet:{findUnique:jest.fn()}} as unknown as PrismaService);
    const request={user:{sub:'secretary-1',role:'SECRETAIRE_PROGRAMME'}};
    await expect(controller.week(undefined,request)).rejects.toMatchObject({status:403});
    await expect(controller.submit('course-sheet',{} as any,request)).rejects.toMatchObject({status:403});
  });
  it('rejects a secretary attempting to enter names outside the secretary zone',async()=>{
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Porto-Novo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),sheet={id:`COURS_BIBLIQUE-${today}`,type:SheetType.COURS_BIBLIQUE,date:new Date(`${today}T00:00:00.000Z`),status:SheetStatus.OUVERTE};
    const prisma={attendanceSheet:{findUnique:jest.fn().mockResolvedValue(sheet)}} as unknown as PrismaService,controller=new AttendanceController(prisma);
    jest.spyOn(controller as any,'canAccessSheet').mockResolvedValue(true);
    await expect(controller.add(sheet.id,{fullName:'Forbidden',sex:'F',zone:'TEMPLE',clientUuid:'ec92902b-d087-4bef-b7a2-93c5b92d1167'} as any,{user:{sub:'secretary',role:'SECRETAIRE_PRESENCE'}})).rejects.toMatchObject({status:403});
  });
  it('lets the assigned president continue adding after saving, and clears the previous submission marker',async()=>{
    jest.useFakeTimers().setSystemTime(new Date('2026-10-05T11:00:00Z'));
    const date=new Date('2026-10-05T00:00:00.000Z');
    const sheet={id:'GROUPE_SEMAINE-2026-10-05',type:SheetType.GROUPE_SEMAINE,date,status:SheetStatus.ENREGISTREE};
    const tx={attendanceSheet:{findUnique:jest.fn().mockResolvedValue({status:SheetStatus.ENREGISTREE}),updateMany:jest.fn().mockResolvedValue({count:1}),update:jest.fn().mockResolvedValue({})},attendanceEntry:{findUnique:jest.fn().mockResolvedValue(null),findMany:jest.fn().mockResolvedValue([]),create:jest.fn().mockResolvedValue({})}};
    const prisma={attendanceSheet:{findUnique:jest.fn().mockResolvedValue(sheet),findUniqueOrThrow:jest.fn().mockResolvedValue({...sheet,entries:[]})},user:{findUnique:jest.fn().mockResolvedValue({assignedDayOfWeek:1})},$transaction:jest.fn(async callback=>callback(tx))} as unknown as PrismaService;
    await new AttendanceController(prisma).add(sheet.id,{fullName:'Présent Test',sex:'M',zone:'TEMPLE',clientUuid:'a92cc3ba-7ba2-4e35-98cb-0dfd190caa45'} as any,{user:{sub:'president-id',role:'RESPONSABLE_SEMAINE'}});
    expect(tx.attendanceSheet.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:{status:SheetStatus.OUVERTE,submittedAt:null,submittedById:null}}));
    jest.useRealTimers();
  });
  it('sends a structured daily report to administrators during the 17 h reporting window',async()=>{
    jest.useFakeTimers().setSystemTime(new Date('2026-10-05T16:30:00Z'));
    const saved={id:'report-1',summary:'Culte et présence effectués',difficulties:'Aucune',followUp:'Poursuivre les visites',submittedAt:new Date(),president:{fullName:'Président Test',email:'president@test.local'}};
    const tx={parishDailyAttendanceReport:{findUnique:jest.fn().mockResolvedValue(null),upsert:jest.fn().mockResolvedValue(saved)},user:{findMany:jest.fn().mockResolvedValue([{id:'admin-1'}])},notification:{createMany:jest.fn().mockResolvedValue({count:1})},auditLog:{create:jest.fn().mockResolvedValue({})}};
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({assignedDayOfWeek:1})},attendanceEntry:{findMany:jest.fn().mockResolvedValue([{zone:'TEMPLE'},{zone:'SALLE_VISION'}])},$transaction:jest.fn(async callback=>callback(tx))} as unknown as PrismaService;
    const result=await new AttendanceController(prisma).saveDailyReport({summary:saved.summary,difficulties:saved.difficulties,followUp:saved.followUp} as any,{user:{sub:'president-id',role:'RESPONSABLE_SEMAINE'},ip:'127.0.0.1'});
    expect(tx.notification.createMany).toHaveBeenCalledWith({data:[expect.objectContaining({userId:'admin-1',href:'/presence'})]});
    expect(result.attendance).toEqual({total:2,temple:1,salleVision:1});
    jest.useRealTimers();
  });
  it('rejects the daily report before 17 h',async()=>{
    jest.useFakeTimers().setSystemTime(new Date('2026-10-05T15:30:00Z'));
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({assignedDayOfWeek:1})}} as unknown as PrismaService;
    await expect(new AttendanceController(prisma).saveDailyReport({summary:'Culte effectué',difficulties:'Aucune',followUp:'Aucun suivi'} as any,{user:{sub:'president-id',role:'RESPONSABLE_SEMAINE'}})).rejects.toMatchObject({status:403});
    jest.useRealTimers();
  });
  it('requires the president to send the 17 h report before resubmitting attendance',async()=>{
    jest.useFakeTimers().setSystemTime(new Date('2026-10-05T16:30:00Z'));
    const sheet={id:'GROUPE_SEMAINE-2026-10-05',type:SheetType.GROUPE_SEMAINE,date:new Date('2026-10-05T00:00:00.000Z'),status:SheetStatus.OUVERTE};
    const prisma={attendanceSheet:{findUnique:jest.fn().mockResolvedValue(sheet)},user:{findUnique:jest.fn().mockResolvedValue({assignedDayOfWeek:1})},parishDailyAttendanceReport:{findUnique:jest.fn().mockResolvedValue(null)}} as unknown as PrismaService;
    await expect(new AttendanceController(prisma).submit(sheet.id,{} as any,{user:{sub:'president-id',role:'RESPONSABLE_SEMAINE'}})).rejects.toMatchObject({status:400});
    jest.useRealTimers();
  });
  it('recalculates totals when a saved attendance entry is removed',async()=>{
    jest.useFakeTimers().setSystemTime(new Date('2026-10-05T11:00:00Z'));
    const sheet={id:'GROUPE_SEMAINE-2026-10-05',type:SheetType.GROUPE_SEMAINE,date:new Date('2026-10-05T00:00:00.000Z'),status:SheetStatus.ENREGISTREE};
    const tx={attendanceSheet:{updateMany:jest.fn().mockResolvedValue({count:1}),update:jest.fn().mockResolvedValue({})},attendanceEntry:{delete:jest.fn().mockResolvedValue({}),findMany:jest.fn().mockResolvedValue([])},auditLog:{create:jest.fn().mockResolvedValue({})}};
    const prisma={attendanceSheet:{findUnique:jest.fn().mockResolvedValue(sheet),findUniqueOrThrow:jest.fn().mockResolvedValue({...sheet,entries:[]})},attendanceEntry:{findUnique:jest.fn().mockResolvedValue({id:'entry-1',zone:'TEMPLE'})},user:{findUnique:jest.fn().mockResolvedValue({assignedDayOfWeek:1})},$transaction:jest.fn(async callback=>callback(tx))} as unknown as PrismaService;
    await new AttendanceController(prisma).remove(sheet.id,'entry-uuid',{user:{sub:'president-id',role:'RESPONSABLE_SEMAINE'},ip:'127.0.0.1'});
    expect(tx.attendanceSheet.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({totalMen:0,totalWomen:0,totalAll:0})}));
    jest.useRealTimers();
  });
});
