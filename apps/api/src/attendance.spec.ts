import { normalizeName, totals } from '../../../packages/shared/src';
import { SheetType, SheetStatus } from '@prisma/client';
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
    const controller=new AttendanceController(prisma),request={user:{sub:'admin-1',role:'ADMIN'},ip:'127.0.0.1'};
    const summary=await controller.summary('sheet-1',request);
    expect(summary.entries).toEqual([]);expect(summary.totals.total).toBe(1);
    const names=await controller.accessNames('sheet-1',{reason:'VERIFICATION_DEMANDE'} as any,request);
    expect(names.entries).toHaveLength(1);expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({action:'CONSULTATION_NOMINATIVE',reason:'VERIFICATION_DEMANDE'})}));
  });
  it('rejects a secretary attempting to enter names outside the secretary zone',async()=>{
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Porto-Novo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),sheet={id:`COURS_BIBLIQUE-${today}`,type:SheetType.COURS_BIBLIQUE,date:new Date(`${today}T00:00:00.000Z`),status:SheetStatus.OUVERTE};
    const prisma={attendanceSheet:{findUnique:jest.fn().mockResolvedValue(sheet)}} as unknown as PrismaService,controller=new AttendanceController(prisma);
    jest.spyOn(controller as any,'canAccessSheet').mockResolvedValue(true);
    await expect(controller.add(sheet.id,{fullName:'Forbidden',sex:'F',zone:'TEMPLE',clientUuid:'ec92902b-d087-4bef-b7a2-93c5b92d1167'} as any,{user:{sub:'secretary',role:'SECRETAIRE_PRESENCE'}})).rejects.toMatchObject({status:403});
  });
});
