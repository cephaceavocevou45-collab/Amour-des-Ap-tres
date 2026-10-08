import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';
import * as argon2 from 'argon2';
import { UserRole, SheetType, SheetStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { CsrfGuard } from '../src/csrf.guard';
import { decryptTotpSecret, encryptTotpSecret } from '../src/totp';
import * as attendanceModule from '../src/attendance';
import { completeAdminTwoFactorEnrollment, prepareAdminTwoFactorEnrollment, resetAdminTwoFactor } from '../scripts/admin-2fa-operations';
import { S3Client } from '@aws-sdk/client-s3';
import { SocialMediaService } from '../src/social-media';

jest.setTimeout(120_000);
let app:any,prisma:PrismaService,baseUrl:string;
const userIds:string[]=[],sheetIds:string[]=[];
const observedLogs:string[]=[],sensitiveCanaries=new Set<string>();
const password='e2e_password_Long_2026!';
sensitiveCanaries.add(password);
const testEmail=()=>`${randomUUID()}@security-test.invalid`;
function localDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Porto-Novo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function weekday(date:string){const value=new Date(`${date}T00:00:00Z`).getUTCDay();return value===0?7:value;}
function monday(date:string){const value=new Date(`${date}T00:00:00Z`),day=value.getUTCDay();value.setUTCDate(value.getUTCDate()-(day===0?6:day-1));return value.toISOString().slice(0,10);}
async function addUser(role:UserRole,options:{active?:boolean;day?:number;secret?:string;email?:string;createdAt?:Date}={}){const row=await prisma.user.create({data:{email:options.email??testEmail(),fullName:'E2E account',phone:'+2290100000000',passwordHash:await argon2.hash(password,{type:argon2.argon2id}),role,active:options.active??true,assignedDayOfWeek:options.day,totpSecret:options.secret?encryptTotpSecret(options.secret):null,emailVerifiedAt:role===UserRole.FIDELE?new Date():undefined,dateOfBirth:role===UserRole.FIDELE?new Date('1990-01-01'):undefined,...(options.createdAt?{createdAt:options.createdAt}:{})}});userIds.push(row.id);return row;}
function jwt(user:{id:string;role:UserRole;sessionVersion:number}){const enc=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url'),now=Math.floor(Date.now()/1000),unsigned=`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:user.id,role:user.role,ver:user.sessionVersion,iat:now,exp:now+600})}`,token=`${unsigned}.${createHmac('sha256',process.env.JWT_ACCESS_SECRET!).update(unsigned).digest('base64url')}`;sensitiveCanaries.add(token);return token;}
async function call(path:string,options:{method?:string;token?:string;body?:unknown;headers?:Record<string,string>}={}){const headers:Record<string,string>={...(options.body?{'Content-Type':'application/json'}:{}),...(options.token?{Authorization:`Bearer ${options.token}`} : {}),...options.headers};if(options.token)sensitiveCanaries.add(options.token);for(const value of Object.values(headers))if(/paroisse_(?:access|refresh)=/.test(value))sensitiveCanaries.add(value.split('=').slice(1).join('=').split(';')[0]);if(options.body&&typeof options.body==='object'){for(const [key,value]of Object.entries(options.body as any))if(typeof value==='string'&&/(?:password|token|fullName|code)/i.test(key))sensitiveCanaries.add(value);}const response=await fetch(`${baseUrl}/api/v1${path}`,{method:options.method??'GET',headers,...(options.body?{body:JSON.stringify(options.body)}:{})});const raw=await response.text();return {status:response.status,body:raw?JSON.parse(raw):null,headers:response.headers};}
async function addSheet(type:SheetType,date=localDate()){const existing=await prisma.attendanceSheet.findUnique({where:{type_date:{type,date:new Date(`${date}T00:00:00.000Z`)}}});if(existing){sheetIds.push(existing.id);return existing;}const row=await prisma.attendanceSheet.create({data:{id:`e2e-${randomUUID()}`,type,date:new Date(`${date}T00:00:00.000Z`),status:SheetStatus.OUVERTE}});sheetIds.push(row.id);return row;}

beforeAll(async()=>{
  if(!process.env.TEST_DATABASE_URL||!new URL(process.env.TEST_DATABASE_URL).pathname.toLowerCase().includes('test'))throw new Error('Les e2e exigent TEST_DATABASE_URL pointant vers une base dédiée dont le nom contient test.');
  process.env.NODE_ENV='test';
  process.env.JWT_ACCESS_SECRET??='security-e2e-only-jwt-secret-not-for-deployment';
  process.env.TOTP_ENCRYPTION_KEY??='security-e2e-only-totp-key-not-for-deployment';
  const capture=(...args:any[])=>observedLogs.push(args.map(value=>typeof value==='string'?value:JSON.stringify(value)).join(' '));
  const logger={log:capture,error:capture,warn:capture,debug:capture,verbose:capture,fatal:capture};
  for(const method of ['log','info','warn','error','debug'] as const)jest.spyOn(console,method).mockImplementation((...args:any[])=>capture(...args));
  app=await NestFactory.create(AppModule,{logger:logger as any});
  app.getHttpAdapter().getInstance().set('trust proxy','loopback');
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  app.useGlobalGuards(new CsrfGuard());
  await app.listen(0,'127.0.0.1');
  baseUrl=`http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  prisma=app.get(PrismaService);
  await prisma.$connect();
});
afterAll(async()=>{
  if(prisma){await prisma.socialSanction.deleteMany({where:{OR:[{createdById:{in:userIds}},{targetUserId:{in:userIds}}]}});await prisma.socialModerationEvent.deleteMany({where:{actorId:{in:userIds}}});await prisma.socialReport.deleteMany({where:{reporterId:{in:userIds}}});await prisma.socialModerationCase.deleteMany({where:{targetAuthorId:{in:userIds}}});await prisma.auditLog.deleteMany({where:{OR:[{userId:{in:userIds}},{entityId:{in:sheetIds}}]}});await prisma.attendanceEntry.deleteMany({where:{sheetId:{in:sheetIds}}});await prisma.attendanceSheet.deleteMany({where:{id:{in:sheetIds}}});await prisma.user.deleteMany({where:{id:{in:userIds}}});}
  if(app)await app.close();
  jest.restoreAllMocks();
});

describe('security HTTP e2e on isolated PostgreSQL',()=>{
  it('refuses role escalation at registration and creates a pending, sessionless account',async()=>{
    const attempted=await call('/auth/register',{method:'POST',body:{fullName:'E2E Applicant',phone:'+2290100000000',email:testEmail(),password,requestedRole:'RESPONSABLE_SEMAINE',requestedDayOfWeek:weekday(localDate()),role:'ADMIN'}});
    expect(attempted.status).toBe(400);
    const email=testEmail(),registered=await call('/auth/register',{method:'POST',body:{fullName:'E2E Applicant',phone:'+2290100000000',email,password,requestedRole:'RESPONSABLE_SEMAINE',requestedDayOfWeek:weekday(localDate())}});
    expect(registered.status).toBe(201);expect(registered.body).not.toHaveProperty('accessToken');
    const row=await prisma.user.findUniqueOrThrow({where:{email}});userIds.push(row.id);expect(row.role).toBe(UserRole.PENDING);expect(row.active).toBe(false);
  });

  it('registers an immediately active FIDELE account without email confirmation and keeps attendance routes inaccessible',async()=>{
    const keys=['SOCIAL_MIN_AGE','SOCIAL_CHARTER_VERSION','SOCIAL_CHARTER_TEXT','RESEND_API_KEY','MAIL_FROM','APP_PUBLIC_URL','CAPTCHA_ENABLED','CAPTCHA_SECRET_KEY','CAPTCHA_SITE_KEY'];const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
    Object.assign(process.env,{SOCIAL_MIN_AGE:'13',SOCIAL_CHARTER_VERSION:'phase1-e2e-v1',SOCIAL_CHARTER_TEXT:'Charte de test sans valeur juridique.',RESEND_API_KEY:'test-only-not-a-real-key',MAIL_FROM:'Paroisse <test@example.invalid>',APP_PUBLIC_URL:baseUrl,CAPTCHA_ENABLED:'false'});delete process.env.CAPTCHA_SECRET_KEY;delete process.env.CAPTCHA_SITE_KEY;
    const realFetch=globalThis.fetch.bind(globalThis),sent:any[]=[];jest.spyOn(globalThis,'fetch').mockImplementation(async(input:any,init:any)=>{if(String(input).includes('api.resend.com')){sent.push(JSON.parse(String(init?.body)));return new Response('{}',{status:200});}return realFetch(input,init);});
    try{
      const email=testEmail(),body={fullName:'New Social Member',phone:'+2290100000000',email,password,dateOfBirth:'1990-03-15',acceptCharter:true,charterVersion:'phase1-e2e-v1'};
      expect((await call('/auth/social/register',{method:'POST',body:{...body,role:'ADMIN'}})).status).toBe(400);
      expect((await call('/auth/social/register',{method:'POST',body:{...body,email:testEmail(),dateOfBirth:'2016-01-01'}})).status).toBe(400);
      const registered=await call('/auth/social/register',{method:'POST',body});expect(registered.status).toBe(201);expect(registered.body).not.toHaveProperty('accessToken');expect(sent).toHaveLength(0);
      const member=await prisma.user.findUniqueOrThrow({where:{email}});userIds.push(member.id);expect(member.role).toBe(UserRole.FIDELE);expect(member.active).toBe(true);expect(member.emailVerifiedAt).toBeNull();expect(member.charterVersion).toBe('phase1-e2e-v1');
      const faithfulToken=jwt(member as any);expect([401,403]).toContain((await call('/attendance/today',{token:faithfulToken})).status);
      const login=await call('/auth/login',{method:'POST',body:{email,password}});expect(login.status).toBe(201);expect(login.body).not.toHaveProperty('accessToken');const cookie=login.headers.get('set-cookie')?.match(/paroisse_access=([^;]+)/)?.[1];expect(cookie).toBeDefined();
      for(const route of ['/attendance/today','/attendance/week','/auth/admin/members','/auth/social/admin/members'])expect([401,403]).toContain((await call(route,{headers:{Cookie:`paroisse_access=${cookie}`}})).status);
      const admin=await addUser(UserRole.ADMIN),adminToken=jwt(admin);
      const suspended=await call(`/auth/social/admin/members/${member.id}/suspension`,{method:'PATCH',token:adminToken,body:{suspended:true,reason:'Demande de modération vérifiée'}});expect(suspended.status).toBe(200);
      expect((await call('/auth/login',{method:'POST',body:{email,password}})).status).toBe(401);
      expect(await prisma.refreshToken.count({where:{userId:member.id,revokedAt:null}})).toBe(0);
      expect(await prisma.auditLog.count({where:{userId:admin.id,action:'COMPTE_SUSPENDU',entityId:member.id}})).toBe(1);
      expect((await call(`/auth/social/admin/members/${member.id}/suspension`,{method:'PATCH',token:adminToken,body:{suspended:false}})).status).toBe(200);
      expect((await call('/auth/login',{method:'POST',body:{email,password}})).status).toBe(201);
    }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
  });

  it('limits sign-ups independently by client IP and normalized e-mail address',async()=>{
    for(let index=0;index<5;index++){
      const result=await call('/auth/social/register',{method:'POST',headers:{'X-Forwarded-For':'198.51.100.51'},body:{email:testEmail()}});
      expect(result.status).toBe(index<4?400:429);
    }
    const email=testEmail();
    for(let index=0;index<5;index++){
      const result=await call('/auth/social/register',{method:'POST',headers:{'X-Forwarded-For':`198.51.100.${61+index}`},body:{email:index===0?email.toUpperCase():email}});
      expect(result.status).toBe(index<4?400:429);
    }
  });

  it('keeps CAPTCHA optional by default and clearly disables sign-up when required keys are missing',async()=>{
    const keys=['CAPTCHA_ENABLED','CAPTCHA_SECRET_KEY','CAPTCHA_SITE_KEY'],previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
    try{
      delete process.env.CAPTCHA_ENABLED;delete process.env.CAPTCHA_SECRET_KEY;delete process.env.CAPTCHA_SITE_KEY;
      const optional=await call('/auth/social/registration-config');expect(optional.body.enabled).toBe(true);expect(optional.body.captchaEnabled).toBe(false);expect(optional.body.captchaSiteKey).toBeNull();expect(optional.body.captchaMessage).toContain('désactivée par défaut');
      process.env.CAPTCHA_ENABLED='true';
      const required=await call('/auth/social/registration-config');expect(required.body.enabled).toBe(false);expect(required.body.captchaMessage).toContain('configuration de la vérification anti-robot est incomplète');
      const refused=await call('/auth/social/register',{method:'POST',body:{fullName:'CAPTCHA Test',email:testEmail(),password,dateOfBirth:'1990-01-01',acceptCharter:true,charterVersion:'phase1-e2e-v1'}});expect(refused.status).toBe(503);
    }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
  });

  it('equalizes failure messages and applies the same minimum response time to existing and unknown accounts',async()=>{
    const known=await addUser(UserRole.SECRETAIRE_PRESENCE),inputs=[known.email,testEmail()],durations:number[]=[],messages:any[]=[];
    for(const email of inputs){const started=Date.now(),result=await call('/auth/login',{method:'POST',body:{email,password:'incorrect-password'}});durations.push(Date.now()-started);messages.push(result.body);expect(result.status).toBe(401);}
    expect(messages[0]).toEqual(messages[1]);expect(durations.every(value=>value>=450)).toBe(true);expect(Math.abs(durations[0]-durations[1])).toBeLessThan(350);
  });

  it('limits president reads to own day/sheet and prevents cross-role writes on each attendance route',async()=>{
    const date=localDate(),day=weekday(date),president=await addUser(UserRole.RESPONSABLE_SEMAINE,{day});
    const other=await addSheet(SheetType.GROUPE_SEMAINE,new Date(Date.parse(`${date}T00:00:00Z`)-86400000).toISOString().slice(0,10));
    const ownToken=jwt(president),own=await addSheet(SheetType.GROUPE_SEMAINE,date);
    const clientUuid=randomUUID();await prisma.attendanceEntry.create({data:{sheetId:own.id,clientUuid,fullName:'Private attendee',normalizedName:'private attendee',sex:'M',zone:'TEMPLE',createdById:president.id}});
    expect((await call(`/attendance/sheets/${own.id}/summary`,{token:ownToken})).status).toBe(200);
    expect((await call(`/attendance/sheets/${other.id}/summary`,{token:ownToken})).status).toBe(403);
    const week=await call(`/attendance/week?start=${monday(date)}`,{token:ownToken});expect(week.status).toBe(200);expect(week.body.days).toHaveLength(1);expect(week.body.days[0].date).toBe(date);
    expect((await call('/attendance/week?start=2020-01-06',{token:ownToken})).status).toBe(403);
    const outsider=await addUser(UserRole.EDITEUR),editorToken=jwt(outsider);
    expect((await call(`/attendance/sheets/${own.id}/entries`,{method:'POST',token:editorToken,body:{fullName:'Forbidden',sex:'M',zone:'TEMPLE',clientUuid:randomUUID()}})).status).toBe(403);
    expect((await call(`/attendance/sheets/${own.id}/entries/${clientUuid}`,{method:'DELETE',token:editorToken})).status).toBe(403);
    expect((await call(`/attendance/sheets/${own.id}/submit`,{method:'POST',token:editorToken,body:{}})).status).toBe(403);
    expect((await call(`/attendance/sheets/${own.id}/entries/${clientUuid}/correction`,{method:'PATCH',token:editorToken,body:{fullName:'Changed',sex:'M',zone:'TEMPLE',reason:'ERREUR_DE_SAISIE'}})).status).toBe(403);
    expect((await call(`/attendance/sheets/${other.id}/summary`,{token:ownToken})).status).toBe(403);
    const secretary=await addUser(UserRole.SECRETAIRE_PRESENCE),secretaryToken=jwt(secretary),course=await addSheet(SheetType.COURS_BIBLIQUE,localDate());
    expect((await call(`/attendance/sheets/${course.id}/summary`,{token:ownToken})).status).toBe(403);
    expect((await call(`/attendance/sheets/${own.id}/summary`,{token:secretaryToken})).status).toBe(403);
    expect((await call('/attendance/week',{token:secretaryToken})).status).toBe(403);
    expect((await call('/attendance/course/2026-10-05',{token:ownToken})).status).toBe(403);
  });

  it('enforces the actual Porto-Novo attendance windows and configurable grace boundaries',()=>{
    const previous=process.env.ATTENDANCE_GRACE_MINUTES;
    try{
      process.env.ATTENDANCE_GRACE_MINUTES='5';
      const course=(iso:string)=>attendanceModule.isWithinAttendanceWindow(SheetType.COURS_BIBLIQUE,new Date(iso));
      const weekly=(iso:string)=>attendanceModule.isWithinAttendanceWindow(SheetType.GROUPE_SEMAINE,new Date(iso));
      expect(course('2026-10-05T18:29:00.000Z')).toBe(false);
      expect(course('2026-10-05T18:30:00.000Z')).toBe(true);
      expect(course('2026-10-05T20:34:00.000Z')).toBe(true);
      expect(course('2026-10-05T20:35:00.000Z')).toBe(false);
      expect(course('2026-10-06T18:30:00.000Z')).toBe(false);
      for(const date of ['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11']){
        expect(weekly(`${date}T08:59:00.000Z`)).toBe(false);
        expect(weekly(`${date}T09:00:00.000Z`)).toBe(true);
        expect(weekly(`${date}T17:04:00.000Z`)).toBe(true);
        expect(weekly(`${date}T17:05:00.000Z`)).toBe(false);
      }
    }finally{if(previous===undefined)delete process.env.ATTENDANCE_GRACE_MINUTES;else process.env.ATTENDANCE_GRACE_MINUTES=previous;}
  });

  it('denies cross-day, cross-sheet, cross-zone and named access across attendance routes',async()=>{
    expect(Object.values(UserRole)).not.toContain('RESPONSABLE_SALLE_VISION');
    const today=localDate(),todayDay=weekday(today),dayY=todayDay===7?6:todayDay+1,weekStart=monday(today),otherDayDate=new Date(`${weekStart}T00:00:00.000Z`);otherDayDate.setUTCDate(otherDayDate.getUTCDate()+dayY-1);const dateY=otherDayDate.toISOString().slice(0,10);
    const presidentX=await addUser(UserRole.RESPONSABLE_SEMAINE,{day:todayDay}),presidentY=await addUser(UserRole.RESPONSABLE_SEMAINE,{day:dayY});
    const secretary=await addUser(UserRole.SECRETAIRE_PRESENCE,{day:dayY}),tokenX=jwt(presidentX),tokenY=jwt(presidentY),secretaryToken=jwt(secretary);
    const own=await addSheet(SheetType.GROUPE_SEMAINE,today),otherDay=await addSheet(SheetType.GROUPE_SEMAINE,dateY),course=await addSheet(SheetType.COURS_BIBLIQUE,today);
    const templeId=randomUUID(),visionId=randomUUID(),otherTempleId=randomUUID(),otherVisionId=randomUUID();
    await prisma.attendanceEntry.create({data:{sheetId:own.id,clientUuid:templeId,fullName:'IDOR-TEMPLE-SENTINEL',sex:'M',zone:'TEMPLE',createdById:presidentX.id}});
    await prisma.attendanceEntry.create({data:{sheetId:own.id,clientUuid:visionId,fullName:'IDOR-VISION-SENTINEL',sex:'F',zone:'SALLE_VISION',createdById:presidentX.id}});
    await prisma.attendanceEntry.createMany({data:[{sheetId:otherDay.id,clientUuid:otherTempleId,fullName:'IDOR-OTHER-DAY-TEMPLE',sex:'F',zone:'TEMPLE',createdById:presidentY.id},{sheetId:otherDay.id,clientUuid:otherVisionId,fullName:'IDOR-OTHER-DAY-VISION',sex:'F',zone:'SALLE_VISION',createdById:presidentY.id}]});
    for(const token of [tokenY,secretaryToken]){
      expect([403,404]).toContain((await call(`/attendance/sheets/${own.id}/summary`,{token})).status);
      for(const zone of ['TEMPLE','SALLE_VISION'])expect([403,404]).toContain((await call(`/attendance/sheets/${own.id}/entries`,{method:'POST',token,body:{fullName:'Cross write',sex:'M',zone,clientUuid:randomUUID()}})).status);
      for(const entryId of [templeId,visionId]){
        expect([403,404]).toContain((await call(`/attendance/sheets/${own.id}/entries/${entryId}`,{method:'DELETE',token})).status);
        expect([403,404]).toContain((await call(`/attendance/sheets/${own.id}/entries/${entryId}/correction`,{method:'PATCH',token,body:{fullName:'Changed',sex:'M',zone:'TEMPLE',reason:'ERREUR_DE_SAISIE'}})).status);
      }
      expect([403,404]).toContain((await call(`/attendance/sheets/${own.id}/submit`,{method:'POST',token,body:{}})).status);
      expect([403,404]).toContain((await call(`/attendance/sheets/${own.id}/names/access`,{method:'POST',token,body:{reason:'VERIFICATION_DEMANDE'}})).status);
    }
    const weekX=await call(`/attendance/week?start=${weekStart}`,{token:tokenX}),weekY=await call(`/attendance/week?start=${weekStart}`,{token:tokenY});
    expect(weekX.status).toBe(200);expect(weekX.body.days.map((row:any)=>row.date)).toEqual([today]);expect(weekX.body.days[0].entries.every((row:any)=>row.zone==='TEMPLE'||row.zone==='SALLE_VISION')).toBe(true);
    expect(weekY.status).toBe(200);expect(weekY.body.days.map((row:any)=>row.date)).toEqual([dateY]);expect(weekY.body.days.flatMap((row:any)=>row.entries).some((row:any)=>row.fullName==='IDOR-TEMPLE-SENTINEL'||row.fullName==='IDOR-VISION-SENTINEL')).toBe(false);
    expect([403,404]).toContain((await call(`/attendance/sheets/${otherDay.id}/summary`,{token:tokenX})).status);
    for(const [path,options] of [
      [`/attendance/sheets/${otherDay.id}/summary`,{token:tokenX}],
      [`/attendance/sheets/${otherDay.id}/entries`,{method:'POST',token:tokenX,body:{fullName:'Cross day write',sex:'M',zone:'TEMPLE',clientUuid:randomUUID()}}],
      [`/attendance/sheets/${otherDay.id}/entries/${otherTempleId}`,{method:'DELETE',token:tokenX}],
      [`/attendance/sheets/${otherDay.id}/entries/${otherVisionId}`,{method:'DELETE',token:tokenX}],
      [`/attendance/sheets/${otherDay.id}/submit`,{method:'POST',token:tokenX,body:{}}],
      [`/attendance/sheets/${otherDay.id}/entries/${otherTempleId}/correction`,{method:'PATCH',token:tokenX,body:{fullName:'Changed',sex:'F',zone:'TEMPLE',reason:'ERREUR_DE_SAISIE'}}],
      [`/attendance/sheets/${otherDay.id}/entries/${otherVisionId}/correction`,{method:'PATCH',token:tokenX,body:{fullName:'Changed',sex:'F',zone:'SALLE_VISION',reason:'ERREUR_DE_SAISIE'}}],
      [`/attendance/sheets/${otherDay.id}/names/access`,{method:'POST',token:tokenX,body:{reason:'VERIFICATION_DEMANDE'}}]
    ] as any[]){expect([403,404]).toContain((await call(path,options)).status);}
    for(const zone of ['TEMPLE','SALLE_VISION'])expect([403,404]).toContain((await call(`/attendance/sheets/${otherDay.id}/entries`,{method:'POST',token:tokenX,body:{fullName:'Cross day write',sex:'M',zone,clientUuid:randomUUID()}})).status);
    const mondayDate=monday(today);
    const priorWeek=new Date(`${weekStart}T00:00:00.000Z`);priorWeek.setUTCDate(priorWeek.getUTCDate()-7);
    expect((await call(`/attendance/week?start=${priorWeek.toISOString().slice(0,10)}`,{token:tokenX})).status).toBe(403);
    expect((await call(`/attendance/course/${mondayDate}`,{token:secretaryToken})).status).toBe(403);
    expect((await call(`/attendance/course/${mondayDate}`,{method:'PUT',token:secretaryToken,body:{theme:'Cross date'}})).status).toBe(403);
    expect((await call(`/attendance/course/${mondayDate}`,{token:tokenX})).status).toBe(403);
    expect((await call(`/attendance/sheets/${own.id}/entries`,{method:'POST',token:tokenX,body:{fullName:'Wrong zone',sex:'F',zone:'FIDELES',clientUuid:randomUUID()}})).status).toBe(403);
    expect((await call(`/attendance/sheets/${course.id}/summary`,{token:secretaryToken})).status).toBe(403);
    expect((await call(`/attendance/sheets/${own.id}/summary`,{token:secretaryToken})).status).toBe(403);
    expect((await call(`/attendance/sheets/${course.id}/entries`,{method:'POST',token:secretaryToken,body:{fullName:'Wrong zone',sex:'M',zone:'TEMPLE',clientUuid:randomUUID()}})).status).toBe(403);
    expect((await call('/attendance/export',{token:tokenX})).status).toBe(404);
    expect((await call('/attendance/history',{token:tokenX})).status).toBe(404);
    expect((await call('/attendance/today',{token:tokenY})).status).toBe(200);
    const secretaryToday=await call('/attendance/today',{token:secretaryToken});expect(secretaryToday.status).toBe(200);expect(secretaryToday.body).toEqual([]);
  });

  it('shows totals only by default; named admin access requires a reason and is logged',async()=>{
    const historicalDate=new Date(Date.parse(`${localDate()}T00:00:00Z`)-2*86400000).toISOString().slice(0,10),sheet=await addSheet(SheetType.GROUPE_SEMAINE,historicalDate),entry=await prisma.attendanceEntry.create({data:{sheetId:sheet.id,clientUuid:randomUUID(),fullName:'Private attendee',normalizedName:'private attendee',sex:'F',zone:'SALLE_VISION'}}),admin=await addUser(UserRole.ADMIN),token=jwt(admin);
    const totals=await call(`/attendance/sheets/${sheet.id}/summary`,{token});expect(totals.status).toBe(200);expect(totals.body.entries).toEqual([]);expect(totals.body.totals.total).toBe(1);
    expect((await call('/attendance/week?start=2020-01-06',{token})).status).toBe(400);expect((await call('/attendance/week?start=2030-01-07',{token})).status).toBe(400);
    expect((await call(`/attendance/sheets/${sheet.id}/names/access`,{method:'POST',token,body:{}})).status).toBe(400);
    const names=await call(`/attendance/sheets/${sheet.id}/names/access`,{method:'POST',token,body:{reason:'VERIFICATION_DEMANDE'}});expect(names.status).toBe(201);expect(names.body.entries[0].fullName).toBe('Private attendee');
    expect(await prisma.auditLog.count({where:{userId:admin.id,action:'CONSULTATION_NOMINATIVE',entityId:sheet.id}})).toBe(1);
    expect(entry.fullName).toBe('Private attendee');
  });

  it('keeps editor account contacts private and blocks self-validation',async()=>{
    const editor=await addUser(UserRole.EDITEUR),pending=await addUser(UserRole.PENDING,{active:false}),token=jwt(editor);
    expect((await call('/auth/admin/members')).status).toBe(401);
    expect((await call('/auth/admin/members',{token})).status).toBe(403);
    expect((await call(`/auth/admin/members/${pending.id}`,{token})).status).toBe(404);
    expect((await call(`/auth/admin/members/${editor.id}/decision`,{method:'PATCH',token,body:{action:'VALIDER'}})).status).toBe(403);
    expect((await call(`/auth/admin/members/${pending.id}/subadmin`,{method:'PATCH',token,body:{enabled:true}})).status).toBe(403);
    expect((await call(`/auth/admin/members/${pending.id}/permissions`,{method:'PATCH',token,body:{permissions:['GESTION_COMPTES']}})).status).toBe(403);
    expect((await call(`/auth/social/admin/members/${pending.id}/suspension`,{method:'PATCH',token,body:{suspended:true,reason:'Test refus accès'}})).status).toBe(403);
  });

  it('lets only the administrator grant scoped sub-admin permissions',async()=>{
    const admin=await addUser(UserRole.ADMIN),secret='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',editor=await addUser(UserRole.EDITEUR,{secret}),adminToken=jwt(admin),editorToken=jwt(editor);
    expect((await call('/auth/admin/login',{method:'POST',body:{email:editor.email,password,totp:totp(secret)}})).status).toBe(401);
    const subLogin=await call('/auth/subadmin/login',{method:'POST',body:{email:editor.email,password,totp:totp(secret)}});expect(subLogin.status).toBe(201);expect(subLogin.body).not.toHaveProperty('accessToken');
    expect((await call('/auth/admin/members',{token:editorToken})).status).toBe(403);
    expect((await call('/attendance/course/2026-10-05',{token:editorToken})).status).toBe(403);
    expect((await call(`/auth/admin/members/${editor.id}/permissions`,{method:'PATCH',token:editorToken,body:{permissions:['GESTION_COMPTES']}})).status).toBe(403);
    expect((await call(`/auth/admin/members/${editor.id}/permissions`,{method:'PATCH',token:adminToken,body:{permissions:['PROGRAMME_BIBLIQUE']}})).status).toBe(200);
    let editorFresh=await prisma.user.findUniqueOrThrow({where:{id:editor.id}});let freshToken=jwt(editorFresh);
    expect((await call('/attendance/course/2026-10-05',{token:freshToken})).status).toBe(200);
    expect((await call('/auth/admin/members',{token:freshToken})).status).toBe(403);
    expect((await call(`/auth/admin/members/${editor.id}/permissions`,{method:'PATCH',token:adminToken,body:{permissions:['GESTION_COMPTES']}})).status).toBe(200);
    editorFresh=await prisma.user.findUniqueOrThrow({where:{id:editor.id}});freshToken=jwt(editorFresh);
    const memberRows=await call('/auth/admin/members',{token:freshToken});expect(memberRows.status).toBe(403);
    expect((await call(`/auth/admin/members/${editor.id}/permissions`,{method:'PATCH',token:freshToken,body:{permissions:['PROGRAMME_BIBLIQUE']}})).status).toBe(403);
  });

  it('invalidates a still-signed access token as soon as the account is disabled',async()=>{
    const user=await addUser(UserRole.RESPONSABLE_SEMAINE,{day:weekday(localDate())}),token=jwt(user);
    expect([200,201]).toContain((await call('/attendance/today',{token})).status);
    await prisma.user.update({where:{id:user.id},data:{active:false,sessionVersion:{increment:1}}});
    expect((await call('/attendance/today',{token})).status).toBe(401);
  });

  it('requires 2FA, accepts each recovery code only once, and has no public enrollment routes',async()=>{
    const secret='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',admin=await addUser(UserRole.ADMIN,{secret});
    expect((await call('/auth/admin/2fa/setup',{method:'POST',body:{email:admin.email,password,code:'000000',secret}})).status).toBe(404);
    expect((await call('/auth/admin/2fa/new-secret',{method:'POST',body:{email:admin.email,password}})).status).toBe(404);
    const noCode=await call('/auth/admin/login',{method:'POST',body:{email:admin.email,password}});expect(noCode.status).toBe(401);expect(noCode.headers.get('set-cookie')).toBeNull();
    const token=jwt(admin);
    const codes=await call('/auth/admin/2fa/recovery-codes',{method:'POST',token,body:{code:totp(secret)}});
    expect(codes.status).toBe(201);expect(codes.body.codes).toHaveLength(10);
    const stored=await (prisma as any).recoveryCode.findMany({where:{userId:admin.id}});expect(stored).toHaveLength(10);expect(stored.some((row:any)=>codes.body.codes.includes(row.codeHash))).toBe(false);
    const login=await call('/auth/admin/login',{method:'POST',body:{email:admin.email,password,totp:codes.body.codes[0]}});expect(login.status).toBe(201);expect(login.body).not.toHaveProperty('accessToken');expect(login.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect((await call('/auth/admin/login',{method:'POST',body:{email:admin.email,password,totp:codes.body.codes[0]}})).status).toBe(401);
    for(let i=0;i<4;i++)expect((await call('/auth/admin/2fa/recovery-codes',{method:'POST',token,body:{code:'000000'}})).status).toBe(401);
    expect((await call('/auth/admin/2fa/recovery-codes',{method:'POST',token,body:{code:'000000'}})).status).toBe(429);
    expect((await call('/auth/admin/members')).status).toBe(401);
  });

  it('runs the CLI 2FA enrollment, protected replacement, one-time recovery and confirmed reset against TEST_DATABASE_URL',async()=>{
    const admin=await addUser(UserRole.ADMIN),superAdminSecret='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',superAdmin=await addUser(UserRole.SUPER_ADMIN,{secret:superAdminSecret});
    const initial=await prepareAdminTwoFactorEnrollment(prisma as any,admin.email,password);
    await expect(prepareAdminTwoFactorEnrollment(prisma as any,admin.email,'wrong-password')).rejects.toThrow();
    const firstCodes=await completeAdminTwoFactorEnrollment(prisma as any,initial.userId,initial.secret,totp(initial.secret));
    expect(firstCodes).toHaveLength(10);
    let enrolled=await prisma.user.findUniqueOrThrow({where:{id:admin.id}});expect(enrolled.totpSecret).toBeDefined();expect(enrolled.totpSecret).not.toBe(initial.secret);expect(decryptTotpSecret(enrolled.totpSecret!)).toBe(initial.secret);
    expect(await (prisma as any).recoveryCode.count({where:{userId:admin.id,usedAt:null}})).toBe(10);
    expect(await prisma.auditLog.count({where:{userId:admin.id,action:'2FA_ENROLLED_CLI'}})).toBe(1);
    await expect(prepareAdminTwoFactorEnrollment(prisma as any,admin.email,password)).rejects.toThrow();
    await expect(prepareAdminTwoFactorEnrollment(prisma as any,admin.email,password,'000000')).rejects.toThrow();
    const replacement=await prepareAdminTwoFactorEnrollment(prisma as any,admin.email,password,totp(initial.secret));
    const secondCodes=await completeAdminTwoFactorEnrollment(prisma as any,replacement.userId,replacement.secret,totp(replacement.secret));
    expect(await prisma.auditLog.count({where:{userId:admin.id,action:'2FA_CHANGED_CLI'}})).toBe(1);
    const codeBasedReplacement=await prepareAdminTwoFactorEnrollment(prisma as any,admin.email,password,secondCodes[0]);
    await expect(prepareAdminTwoFactorEnrollment(prisma as any,admin.email,password,secondCodes[0])).rejects.toThrow();
    expect(codeBasedReplacement.userId).toBe(admin.id);
    const refreshValue=randomBytes(32).toString('base64url'),family=randomUUID();await prisma.refreshToken.create({data:{userId:admin.id,hashedToken:createHash('sha256').update(refreshValue).digest('hex'),family,expiresAt:new Date(Date.now()+60_000)}});
    await expect(resetAdminTwoFactor(prisma as any,{targetEmail:admin.email,actorEmail:superAdmin.email,confirmation:'',password,factor:totp(superAdminSecret)})).rejects.toThrow();
    await expect(resetAdminTwoFactor(prisma as any,{targetEmail:admin.email,actorEmail:superAdmin.email,confirmation:'RESET-2FA',password,factor:'000000'})).rejects.toThrow();
    await resetAdminTwoFactor(prisma as any,{targetEmail:admin.email,actorEmail:superAdmin.email,confirmation:'RESET-2FA',password,factor:totp(superAdminSecret)});
    const reset=await prisma.user.findUniqueOrThrow({where:{id:admin.id}});expect(reset.totpSecret).toBeNull();expect(reset.sessionVersion).toBeGreaterThan(admin.sessionVersion);
    expect(await prisma.refreshToken.count({where:{family,revokedAt:null}})).toBe(0);
    expect(await prisma.auditLog.count({where:{userId:superAdmin.id,action:'2FA_RECOVERY_CLI',entityId:admin.id}})).toBe(1);
    const reEnrolled=await prepareAdminTwoFactorEnrollment(prisma as any,admin.email,password);
    await completeAdminTwoFactorEnrollment(prisma as any,reEnrolled.userId,reEnrolled.secret,totp(reEnrolled.secret));
    expect(await prisma.auditLog.count({where:{userId:admin.id,action:'2FA_ENROLLED_CLI'}})).toBe(2);
  });

  it('allows only one concurrent password reset and rejects replay and expiration',async()=>{
    const user=await addUser(UserRole.SECRETAIRE_PRESENCE),raw=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(raw).digest('hex');
    await prisma.passwordResetToken.create({data:{userId:user.id,tokenHash:hash,expiresAt:new Date(Date.now()+60_000)}});
    const body={token:raw,password:'nouveau_mot_de_passe_Securise_2026!',confirmPassword:'nouveau_mot_de_passe_Securise_2026!'};
    const results=await Promise.all([call('/auth/password/reset',{method:'POST',body}),call('/auth/password/reset',{method:'POST',body})]);expect(results.filter(x=>x.status===201).length).toBe(1);
    expect((await call('/auth/password/reset',{method:'POST',body})).status).toBe(400);
    const expired=randomBytes(32).toString('base64url');await prisma.passwordResetToken.create({data:{userId:user.id,tokenHash:createHash('sha256').update(expired).digest('hex'),expiresAt:new Date(Date.now()-1000)}});
    expect((await call('/auth/password/reset',{method:'POST',body:{...body,token:expired}})).status).toBe(400);
  });

  it('revokes an entire refresh-token family after token reuse',async()=>{
    const user=await addUser(UserRole.SECRETAIRE_PRESENCE),raw=randomBytes(32).toString('base64url'),family=randomUUID();
    await prisma.refreshToken.create({data:{userId:user.id,hashedToken:createHash('sha256').update(raw).digest('hex'),family,expiresAt:new Date(Date.now()+3600000)}});
    expect((await call('/auth/refresh',{method:'POST',headers:{Cookie:`paroisse_refresh=${raw}`}})).status).toBe(201);
    expect((await call('/auth/refresh',{method:'POST',headers:{Cookie:`paroisse_refresh=${raw}`}})).status).toBe(401);
    expect(await prisma.refreshToken.count({where:{family,revokedAt:null}})).toBe(0);
  });

  it('suspends a FIDELE or attendance responsible immediately and revokes all sessions',async()=>{
    const admin=await addUser(UserRole.ADMIN),adminToken=jwt(admin);
    for(const member of [await addUser(UserRole.FIDELE),await addUser(UserRole.RESPONSABLE_SEMAINE,{day:weekday(localDate())})]){
      const access=jwt(member),refresh=randomBytes(32).toString('base64url'),family=randomUUID();
      await prisma.refreshToken.create({data:{userId:member.id,hashedToken:createHash('sha256').update(refresh).digest('hex'),family,expiresAt:new Date(Date.now()+3600000)}});
      expect((await call('/auth/session',{token:access})).status).toBe(200);
      expect((await call(`/auth/social/admin/members/${member.id}/suspension`,{method:'PATCH',token:adminToken,body:{suspended:true,reason:'Suspension de sécurité e2e'}})).status).toBe(200);
      expect((await call('/auth/session',{token:access})).status).toBe(401);
      expect((await call('/auth/refresh',{method:'POST',headers:{Cookie:`paroisse_refresh=${refresh}`}})).status).toBe(401);
      expect(await prisma.refreshToken.count({where:{family,revokedAt:null}})).toBe(0);
    }
  });

  it('makes the concurrent entry/submit race leave totals consistent with the saved rows',async()=>{
    // La simulation d’ouverture est réservée à ce scénario de concurrence uniquement.
    const testDate=localDate();
    const user=await addUser(UserRole.RESPONSABLE_SEMAINE,{day:weekday(localDate())}),sheet=await addSheet(SheetType.GROUPE_SEMAINE),entry={fullName:'Race attendee',sex:'F',zone:'SALLE_VISION',clientUuid:randomUUID()};
    await prisma.attendanceEntry.deleteMany({where:{sheetId:sheet.id}});await prisma.attendanceSheet.update({where:{id:sheet.id},data:{status:SheetStatus.OUVERTE,submittedAt:null,totalAll:0,totalMen:0,totalWomen:0}});
    jest.useFakeTimers({doNotFake:['nextTick','setImmediate','setTimeout','setInterval','clearTimeout','clearInterval']} as any);jest.setSystemTime(new Date(`${testDate}T11:00:00.000Z`));
    try{const token=jwt(user);const [added,submitted]=await Promise.all([call(`/attendance/sheets/${sheet.id}/entries`,{method:'POST',token,body:entry}),call(`/attendance/sheets/${sheet.id}/submit`,{method:'POST',token,body:{}})]);
      expect([201,409]).toContain(added.status);expect(submitted.status).toBe(201);
      const [saved,count]=await Promise.all([prisma.attendanceSheet.findUniqueOrThrow({where:{id:sheet.id}}),prisma.attendanceEntry.count({where:{sheetId:sheet.id}})]);expect(saved.totalAll).toBe(count);
    }finally{jest.useRealTimers();}
  });

  it('does not put bearer or refresh tokens in browser storage',async()=>{
    const fs=require('node:fs'),file=require('node:path').resolve(__dirname,'../../web/src/app/auth.component.ts'),source=fs.readFileSync(file,'utf8');
    expect(source).not.toMatch(/sessionStorage\.setItem\(['"]paroisse_(?:access|refresh)_token/);
    expect(source).not.toMatch(/localStorage\.setItem\(['"]paroisse_(?:access|refresh)_token/);
  });

  it('enforces social post ownership, privacy, member roles, idempotency, blocks and escaped text transport',async()=>{
    const author=await addUser(UserRole.FIDELE),reader=await addUser(UserRole.FIDELE,{createdAt:new Date(Date.now()-25*60*60_000)}),admin=await addUser(UserRole.ADMIN),moderator=await addUser(UserRole.MODERATEUR),authorToken=jwt(author),readerToken=jwt(reader),adminToken=jwt(admin),moderatorToken=jwt(moderator);
    const ownProfile=await call('/social/profile',{token:authorToken});expect(ownProfile.status).toBe(200);expect(ownProfile.body).toHaveProperty('displayName');expect(ownProfile.body).not.toHaveProperty('email');expect(ownProfile.body).not.toHaveProperty('phone');expect(ownProfile.body).not.toHaveProperty('dateOfBirth');
    expect((await call('/social/profile',{method:'PATCH',token:authorToken,body:{bio:'Je participe à la vie de la paroisse.'}})).body.bio).toBe('Je participe à la vie de la paroisse.');
    expect((await call('/social/profile',{method:'PATCH',token:authorToken,body:{bio:'a'.repeat(501)}})).status).toBe(400);
    expect((await call('/social/profile',{method:'PATCH',token:adminToken,body:{bio:'Non autorisé'}})).status).toBe(403);
    const key=`post_${randomUUID()}`,body='<script>alert("x")</script> Bonjour';
    const publicPost=await call('/social/posts',{method:'POST',token:authorToken,headers:{'Idempotency-Key':key},body:{body,visibility:'TOUS_LES_FIDELES'}});
    expect(publicPost.status).toBe(201);expect(publicPost.body.body).toBe(body);
    const comment=await call(`/social/posts/${publicPost.body.id}/comments`,{method:'POST',token:readerToken,body:{body:'Un commentaire'}});expect(comment.status).toBe(201);
    const reply=await call(`/social/posts/${publicPost.body.id}/comments`,{method:'POST',token:authorToken,body:{body:'Une réponse',parentId:comment.body.id}});expect(reply.status).toBe(201);expect(reply.body.parentId).toBe(comment.body.id);
    expect((await call('/social/reactions',{method:'POST',token:authorToken,body:{targetType:'comment',targetId:comment.body.id,type:'COEUR',active:true}})).status).toBe(201);
    expect((await call(`/social/posts/${publicPost.body.id}/share`,{method:'POST',token:readerToken,body:{body:'À partager'}})).status).toBe(201);
    expect((await call(`/social/posts/${publicPost.body.id}/save`,{method:'POST',token:readerToken,body:{saved:true}})).status).toBe(201);
    await prisma.socialSavedPost.create({data:{userId:author.id,postId:publicPost.body.id}});
    expect((await call(`/social/posts/${publicPost.body.id}/save`,{method:'POST',token:readerToken,body:{saved:false}})).status).toBe(201);
    expect(await prisma.socialSavedPost.count({where:{userId:author.id,postId:publicPost.body.id}})).toBe(1);
    expect(await prisma.socialShare.count({where:{userId:reader.id,postId:publicPost.body.id}})).toBe(1);
    expect((await call('/social/settings',{method:'PATCH',token:readerToken,body:{notificationsEnabled:false}})).status).toBe(200);
    expect((await call('/social/settings',{token:readerToken})).body.notificationsEnabled).toBe(false);
    expect((await call(`/social/posts/${publicPost.body.id}/pin`,{method:'POST',token:adminToken,body:{pinned:true}})).status).toBe(201);
    const replay=await call('/social/posts',{method:'POST',token:authorToken,headers:{'Idempotency-Key':key},body:{body,visibility:'TOUS_LES_FIDELES'}});expect(replay.status).toBe(201);expect(replay.body.id).toBe(publicPost.body.id);
    expect((await call(`/social/posts/${publicPost.body.id}`,{method:'PATCH',token:readerToken,body:{body:'Altéré',visibility:'TOUS_LES_FIDELES'}})).status).toBe(404);
    expect((await call(`/social/posts/${publicPost.body.id}`,{method:'DELETE',token:readerToken})).status).toBe(404);
    expect((await call(`/social/comments/${comment.body.id}`,{method:'DELETE',token:authorToken})).status).toBe(404);
    expect((await call('/social/posts',{method:'POST',token:adminToken,headers:{'Idempotency-Key':`admin_${randomUUID()}`},body:{body:'Rôle refusé',visibility:'TOUS_LES_FIDELES'}})).status).toBe(403);
    expect((await call('/social/posts',{method:'POST',token:moderatorToken,headers:{'Idempotency-Key':`mod_${randomUUID()}`},body:{body:'Rôle refusé',visibility:'TOUS_LES_FIDELES'}})).status).toBe(403);
    const privatePost=await call('/social/posts',{method:'POST',token:authorToken,headers:{'Idempotency-Key':`private_${randomUUID()}`},body:{body:'Pour moi seul',visibility:'MOI_SEUL'}});expect(privatePost.status).toBe(201);
    expect((await call('/social/posts',{token:readerToken})).body.items.some((item:any)=>item.id===privatePost.body.id)).toBe(false);
    expect((await call(`/social/posts/${privatePost.body.id}/comments`,{token:readerToken})).status).toBe(404);
    expect((await call(`/social/posts/${privatePost.body.id}`,{method:'PATCH',token:readerToken,body:{body:'Test',visibility:'MOI_SEUL'}})).status).toBe(404);
    expect((await call('/social/reactions',{method:'POST',token:readerToken,body:{targetType:'post',targetId:publicPost.body.id,type:'AIME',active:true}})).status).toBe(201);
    expect((await call(`/social/posts/${publicPost.body.id}/hide`,{method:'POST',token:readerToken})).status).toBe(201);
    expect(await prisma.socialHiddenPost.count({where:{userId:reader.id,postId:publicPost.body.id}})).toBe(1);
    expect(await prisma.socialReaction.count({where:{userId:reader.id,targetKey:`post:${publicPost.body.id}`,type:'AIME'}})).toBe(1);
    expect((await call(`/social/blocks/${author.id}`,{method:'POST',token:readerToken})).status).toBe(201);
    const feed=await call('/social/posts',{token:readerToken});expect(feed.status).toBe(200);expect(feed.body.items.some((item:any)=>item.id===publicPost.body.id)).toBe(false);
    expect((await call(`/social/posts/${publicPost.body.id}/comments`,{token:readerToken})).status).toBe(404);
    const reversePost=await call('/social/posts',{method:'POST',token:readerToken,headers:{'Idempotency-Key':`reverse_${randomUUID()}`},body:{body:'Post du bloqueur',visibility:'TOUS_LES_FIDELES'}});expect(reversePost.status).toBe(201);
    const reverseFeed=await call('/social/posts',{token:authorToken});expect(reverseFeed.status).toBe(200);expect(reverseFeed.body.items.some((item:any)=>item.id===reversePost.body.id)).toBe(false);
    expect((await call(`/social/posts/${reversePost.body.id}/comments`,{token:authorToken})).status).toBe(404);
    expect((await call('/social/reactions',{method:'POST',token:readerToken,body:{targetType:'post',targetId:publicPost.body.id,type:'AIME',active:true}})).status).toBe(404);
    expect((await call(`/social/members/${author.id}`,{token:readerToken})).status).toBe(404);
    const fs=require('node:fs'),ui=fs.readFileSync(require('node:path').resolve(__dirname,'../../web/src/app/social-home.component.ts'),'utf8');expect(ui).not.toMatch(/innerHTML|bypassSecurityTrustHtml/);
  });

  it('enforces report ownership, moderation roles, automatic hiding, audited actions and immediate suspension',async()=>{
    const keys=['SOCIAL_AUTO_HIDE_THRESHOLD','SOCIAL_AUTO_HIDE_HOURS'],previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
    process.env.SOCIAL_AUTO_HIDE_THRESHOLD='2';process.env.SOCIAL_AUTO_HIDE_HOURS='48';
    try{
      const author=await addUser(UserRole.FIDELE),reporterA=await addUser(UserRole.FIDELE),reporterB=await addUser(UserRole.FIDELE),stranger=await addUser(UserRole.FIDELE),moderator=await addUser(UserRole.MODERATEUR),admin=await addUser(UserRole.ADMIN);
      const authorToken=jwt(author),tokenA=jwt(reporterA),tokenB=jwt(reporterB),strangerToken=jwt(stranger),moderatorToken=jwt(moderator),adminToken=jwt(admin);
      const post=await call('/social/posts',{method:'POST',token:authorToken,headers:{'Idempotency-Key':`moderation_${randomUUID()}`},body:{body:'Publication à examiner',visibility:'TOUS_LES_FIDELES'}});expect(post.status).toBe(201);
      const first=await call('/social/reports',{method:'POST',token:tokenA,body:{targetType:'POST',targetId:post.body.id,reason:'SPAM'}});expect(first.status).toBe(201);
      expect((await call('/social/reports',{method:'POST',token:tokenA,body:{targetType:'POST',targetId:post.body.id,reason:'SPAM'}})).status).toBe(409);
      expect((await call('/social/reports',{method:'POST',token:tokenB,body:{targetType:'POST',targetId:post.body.id,reason:'CONTENU_INAPPROPRIE'}})).status).toBe(201);
      expect((await call('/social/posts',{token:strangerToken})).body.items.some((row:any)=>row.id===post.body.id)).toBe(false);
      expect((await call('/social/moderation/cases',{token:strangerToken})).status).toBe(403);
      const cases=await call('/social/moderation/cases',{token:moderatorToken});expect(cases.status).toBe(200);
      const moderationCase=cases.body.find((row:any)=>row.targetId===post.body.id);expect(moderationCase.status).toBe('AUTO_HIDDEN');expect(moderationCase.reportsCount??moderationCase._count?.reports).toBeTruthy();
      expect((await call(`/social/moderation/cases/${moderationCase.id}`,{method:'PATCH',token:tokenA,body:{action:'REJETER',reason:'Motif valable pour test'}})).status).toBe(403);
      const suspended=await call(`/social/moderation/cases/${moderationCase.id}`,{method:'PATCH',token:moderatorToken,body:{action:'SUSPENDRE_TEMPORAIREMENT',reason:'Suspension temporaire e2e',durationHours:1}});expect(suspended.status).toBe(200);expect(suspended.body.sanctionId).toBeTruthy();
      expect((await call('/auth/session',{token:authorToken})).status).toBe(401);
      const user=await prisma.user.findUniqueOrThrow({where:{id:author.id}});expect(user.suspendedAt).toBeTruthy();expect(await prisma.refreshToken.count({where:{userId:author.id,revokedAt:null}})).toBe(0);
      expect((await call('/social/moderation/cases',{token:moderatorToken})).status).toBe(200);
      expect((await call(`/social/moderation/sanctions/${suspended.body.sanctionId}/appeal/decision`,{method:'POST',token:moderatorToken,body:{accept:true,reason:'Interdit au modérateur'}})).status).toBe(403);
      expect(await prisma.auditLog.count({where:{entity:'SocialModerationCase',entityId:moderationCase.id,action:'MODERATION_SUSPENDRE_TEMPORAIREMENT'}})).toBe(1);
      expect(await prisma.socialModerationEvent.count({where:{caseId:moderationCase.id}})).toBeGreaterThanOrEqual(2);
      const privatePost=await call('/social/posts',{method:'POST',token:tokenA,headers:{'Idempotency-Key':`private_mod_${randomUUID()}`},body:{body:'Texte privé',visibility:'MOI_SEUL'}});expect(privatePost.status).toBe(201);
      expect((await call('/social/reports',{method:'POST',token:tokenB,body:{targetType:'POST',targetId:privatePost.body.id,reason:'SPAM'}})).status).toBe(404);
      const comment=await call(`/social/posts/${privatePost.body.id}/comments`,{method:'POST',token:tokenA,body:{body:'Commentaire privé'}});expect(comment.status).toBe(201);
      expect((await call('/social/reports',{method:'POST',token:tokenB,body:{targetType:'COMMENT',targetId:comment.body.id,reason:'HARCELEMENT'}})).status).toBe(404);
      expect((await call('/social/reports',{method:'POST',token:tokenB,body:{targetType:'PROFILE',targetId:reporterA.id,reason:'USURPATION'}})).status).toBe(201);
    }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
  });

  it('stores re-encoded community images privately and denies access to private post media',async()=>{
    const keys=['MEDIA_S3_ENDPOINT','MEDIA_S3_REGION','MEDIA_S3_BUCKET','MEDIA_S3_ACCESS_KEY','MEDIA_S3_SECRET_KEY','MEDIA_S3_FORCE_PATH_STYLE','CLAMAV_HOST','CLAMAV_PORT'],previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
    Object.assign(process.env,{SOCIAL_PHOTOS_ENABLED:'true',MEDIA_S3_ENDPOINT:'http://localhost:9000',MEDIA_S3_REGION:'test-1',MEDIA_S3_BUCKET:'paroisse-test',MEDIA_S3_ACCESS_KEY:'test-access-only',MEDIA_S3_SECRET_KEY:'test-secret-only',MEDIA_S3_FORCE_PATH_STYLE:'true',CLAMAV_HOST:'127.0.0.1',CLAMAV_PORT:'3310'});
    const author=await addUser(UserRole.FIDELE,{createdAt:new Date(Date.now()-25*60*60_000)}),reader=await addUser(UserRole.FIDELE),authorToken=jwt(author),readerToken=jwt(reader),mediaService=app.get(SocialMediaService);
    const scan=jest.spyOn(mediaService,'scan').mockResolvedValue(undefined);
    const s3Send=jest.spyOn(S3Client.prototype,'send').mockImplementation(async(command:any)=>command.constructor.name==='GetObjectCommand'?{Body:{transformToByteArray:async()=>Uint8Array.from([82,73,70,70,4,0,0,0,87,69,66,80])}} as any:{} as any);
    try{
      const png=await (require('sharp') as any)({create:{width:2,height:2,channels:3,background:{r:240,g:20,b:30}}}).png().toBuffer();
      async function upload(visibility:string,key:string){const form=new FormData();form.append('body','Photo de la communauté');form.append('visibility',visibility);form.append('media',new Blob([png],{type:'image/png'}),'photo.png');const response=await fetch(`${baseUrl}/api/v1/social/posts/media`,{method:'POST',headers:{Authorization:`Bearer ${authorToken}`,'Idempotency-Key':key},body:form});const raw=await response.text();return {status:response.status,body:raw?JSON.parse(raw):null};}
      expect((await call('/social/media/config',{token:authorToken})).body.enabled).toBe(true);
      const created=await upload('TOUS_LES_FIDELES',`image_${randomUUID()}`);if(created.status!==201)throw new Error(JSON.stringify(created.body));expect(created.status).toBe(201);expect(created.body.media).toHaveLength(1);expect(created.body.media[0]).not.toHaveProperty('objectKey');expect(created.body.media[0].mimeType).toBe('image/webp');expect(scan).toHaveBeenCalledTimes(1);expect(s3Send).toHaveBeenCalled();
      const visible=await fetch(`${baseUrl}/api/v1/social/media/${created.body.media[0].id}`,{headers:{Authorization:`Bearer ${readerToken}`}});expect(visible.status).toBe(200);expect(visible.headers.get('content-type')).toBe('image/webp');
      const privatePost=await upload('MOI_SEUL',`image_private_${randomUUID()}`);expect(privatePost.status).toBe(201);
      const denied=await fetch(`${baseUrl}/api/v1/social/media/${privatePost.body.media[0].id}`,{headers:{Authorization:`Bearer ${readerToken}`}});expect(denied.status).toBe(404);
      const malformed=new FormData();malformed.append('body','Fichier falsifié');malformed.append('visibility','TOUS_LES_FIDELES');malformed.append('media',new Blob(['<svg onload="alert(1)"></svg>'],{type:'image/png'}),'image.png');
      const rejected=await fetch(`${baseUrl}/api/v1/social/posts/media`,{method:'POST',headers:{Authorization:`Bearer ${authorToken}`,'Idempotency-Key':`spoof_${randomUUID()}`},body:malformed});expect(rejected.status).toBe(400);expect(scan).toHaveBeenCalledTimes(2);
    }finally{scan.mockRestore();s3Send.mockRestore();for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
  });

  it('keeps every photo endpoint disabled unless the explicit feature flag is enabled',async()=>{
    const keys=['SOCIAL_PHOTOS_ENABLED','MEDIA_S3_ENDPOINT','MEDIA_S3_REGION','MEDIA_S3_BUCKET','MEDIA_S3_ACCESS_KEY','MEDIA_S3_SECRET_KEY','CLAMAV_HOST','CLAMAV_PORT'],previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
    Object.assign(process.env,{SOCIAL_PHOTOS_ENABLED:'false',MEDIA_S3_ENDPOINT:'http://localhost:9000',MEDIA_S3_REGION:'test-1',MEDIA_S3_BUCKET:'paroisse-test',MEDIA_S3_ACCESS_KEY:'test-access-only',MEDIA_S3_SECRET_KEY:'test-secret-only',CLAMAV_HOST:'127.0.0.1',CLAMAV_PORT:'3310'});
    try{const member=await addUser(UserRole.FIDELE),token=jwt(member);expect((await call('/social/media/config',{token})).body.enabled).toBe(false);const form=new FormData();form.append('body','Tentative désactivée');form.append('visibility','TOUS_LES_FIDELES');form.append('media',new Blob(['not-an-image'],{type:'image/png'}),'photo.png');const result=await fetch(`${baseUrl}/api/v1/social/posts/media`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Idempotency-Key':`disabled_${randomUUID()}`},body:form});expect(result.status).toBe(503);expect((await call('/social/media/not-a-real-image',{token})).status).toBe(503);}finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
  });

  it('limits recent accounts to three posts per rolling day and denies sharing or photos for 24 hours',async()=>{
    const member=await addUser(UserRole.FIDELE),token=jwt(member);
    for(let index=0;index<3;index++)expect((await call('/social/posts',{method:'POST',token,headers:{'Idempotency-Key':`recent_${randomUUID()}`},body:{body:`Publication récente ${index}`,visibility:'TOUS_LES_FIDELES'}})).status).toBe(201);
    expect((await call('/social/posts',{method:'POST',token,headers:{'Idempotency-Key':`recent_${randomUUID()}`},body:{body:'Quatrième publication récente',visibility:'TOUS_LES_FIDELES'}})).status).toBe(429);

    const older=await addUser(UserRole.FIDELE,{createdAt:new Date(Date.now()-25*60*60_000)}),source=await prisma.socialPost.create({data:{authorId:older.id,idempotencyKey:`older_${randomUUID()}`,body:'Publication publique',visibility:'TOUS_LES_FIDELES'}});
    expect((await call(`/social/posts/${source.id}/share`,{method:'POST',token,body:{body:'Partage refusé'}})).status).toBe(403);

    const keys=['SOCIAL_PHOTOS_ENABLED','MEDIA_S3_ENDPOINT','MEDIA_S3_REGION','MEDIA_S3_BUCKET','MEDIA_S3_ACCESS_KEY','MEDIA_S3_SECRET_KEY','CLAMAV_HOST','CLAMAV_PORT'],previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
    Object.assign(process.env,{SOCIAL_PHOTOS_ENABLED:'true',MEDIA_S3_ENDPOINT:'http://localhost:9000',MEDIA_S3_REGION:'test-1',MEDIA_S3_BUCKET:'paroisse-test',MEDIA_S3_ACCESS_KEY:'test-access-only',MEDIA_S3_SECRET_KEY:'test-secret-only',CLAMAV_HOST:'127.0.0.1',CLAMAV_PORT:'3310'});
    try{const form=new FormData();form.append('body','Photo refusée pendant les premières 24 heures');form.append('visibility','TOUS_LES_FIDELES');form.append('media',new Blob(['image non traitée'],{type:'image/png'}),'recent.png');const result=await fetch(`${baseUrl}/api/v1/social/posts/media`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Idempotency-Key':`recent_photo_${randomUUID()}`},body:form});expect(result.status).toBe(403);}finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
  });

  it('rate-limits repeated content reports per member',async()=>{
    const author=await addUser(UserRole.FIDELE),reporter=await addUser(UserRole.FIDELE),authorToken=jwt(author),reporterToken=jwt(reporter);
    for(let index=0;index<9;index++){
      const post=await prisma.socialPost.create({data:{authorId:author.id,body:`Publication signalable ${index}`,visibility:'TOUS_LES_FIDELES',idempotencyKey:`report_limit_${index}_${randomUUID()}`}});
      const report=await call('/social/reports',{method:'POST',token:reporterToken,body:{targetType:'POST',targetId:post.id,reason:'SPAM'}});
      expect(report.status).toBe(index<8?201:429);
    }
  });

  it('supports private account settings, session control, password change, export and 14-day account closure',async()=>{
    const member=await addUser(UserRole.FIDELE),other=await addUser(UserRole.FIDELE),token=jwt(member),currentRaw=randomBytes(32).toString('base64url'),otherRaw=randomBytes(32).toString('base64url'),currentHash=createHash('sha256').update(currentRaw).digest('hex');
    const current=await prisma.refreshToken.create({data:{userId:member.id,hashedToken:currentHash,expiresAt:new Date(Date.now()+86400000),family:randomUUID()}}),otherSession=await prisma.refreshToken.create({data:{userId:member.id,hashedToken:createHash('sha256').update(otherRaw).digest('hex'),expiresAt:new Date(Date.now()+86400000),family:randomUUID()}}),otherToken=jwt(other);
    const listed=await call('/auth/social/account/sessions',{token,headers:{Cookie:`paroisse_refresh=${currentRaw}`}});expect(listed.status).toBe(200);expect(listed.body).toHaveLength(2);expect(listed.body.find((row:any)=>row.id===current.id).isCurrent).toBe(true);expect(JSON.stringify(listed.body)).not.toContain(currentHash);expect(JSON.stringify(listed.body)).not.toContain(currentRaw);
    expect((await call(`/auth/social/account/sessions/${otherSession.id}`,{method:'DELETE',token:jwt(other)})).status).toBe(403);
    expect((await call(`/auth/social/account/sessions/${otherSession.id}`,{method:'DELETE',token})).status).toBe(200);
    expect((await prisma.refreshToken.findUniqueOrThrow({where:{id:otherSession.id}})).revokedAt).toBeTruthy();
    const passwordChange=await call('/auth/social/account/password',{method:'POST',token,headers:{Cookie:`paroisse_refresh=${currentRaw}`},body:{currentPassword:password,newPassword:'New_Strong_Password_2026!',confirmPassword:'New_Strong_Password_2026!'}});expect(passwordChange.status).toBe(201);
    expect((await prisma.refreshToken.findUniqueOrThrow({where:{id:current.id}})).revokedAt).toBeNull();
    expect((await call('/auth/login',{method:'POST',body:{email:member.email,password}})).status).toBe(401);
    expect((await call('/auth/login',{method:'POST',body:{email:member.email,password:'New_Strong_Password_2026!'}})).status).toBe(201);
    const post=await call('/social/posts',{method:'POST',token:jwt(member),headers:{'Idempotency-Key':`export_${randomUUID()}`},body:{body:'Ma publication exportée',visibility:'TOUS_LES_FIDELES'}});expect(post.status).toBe(201);
    const exported=await call('/auth/social/account/export',{token});expect(exported.status).toBe(200);expect(exported.body.posts.some((row:any)=>row.id===post.body.id)).toBe(true);expect(JSON.stringify(exported.body)).not.toContain('passwordHash');
    expect((await call('/social/settings',{method:'PATCH',token,body:{profileDiscoverable:false}})).body.profileDiscoverable).toBe(false);
    expect((await call('/social/profile',{token})).body.profileDiscoverable).toBe(false);
    const closed=await call('/auth/social/account',{method:'DELETE',token,body:{reason:'Je souhaite fermer mon compte'}});expect(closed.status).toBe(200);expect(closed.body.graceDays).toBe(14);expect(new Date(closed.body.scheduledAt).getTime()-Date.now()).toBeGreaterThan(13*86400000);expect((await call('/auth/session',{token})).status).toBe(401);
    expect((await call('/auth/social/account/deletion/cancel',{method:'POST',body:{email:member.email,password:'New_Strong_Password_2026!'}})).status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({where:{id:member.id}})).deletionScheduledAt).toBeNull();expect((await call('/auth/login',{method:'POST',body:{email:member.email,password:'New_Strong_Password_2026!'}})).status).toBe(201);
    expect((await call('/auth/social/account/deletion/cancel',{method:'POST',body:{email:member.email,password:'incorrect-password'}})).body.message).toBe('Si le compte est en période de fermeture et que le mot de passe concorde, la demande sera annulée.');
    const own=await prisma.socialPost.findUniqueOrThrow({where:{id:post.body.id}});expect(own.authorId).toBe(member.id);expect(otherToken).toBeTruthy();
  });

  it('applies social post, comment and reaction rate limits per action',async()=>{
    const member=await addUser(UserRole.FIDELE,{createdAt:new Date(Date.now()-25*60*60_000)}),token=jwt(member),postBody=(body:string)=>call('/social/posts',{method:'POST',token,headers:{'Idempotency-Key':`rate_${randomUUID()}`},body:{body,visibility:'TOUS_LES_FIDELES'}});
    let first:any;for(let i=0;i<6;i++){const result=await postBody(`Publication rate ${i}`);expect(result.status).toBe(201);if(!first)first=result;}
    expect((await postBody('Publication rate finale')).status).toBe(429);
    for(let i=0;i<20;i++)expect((await call(`/social/posts/${first.body.id}/comments`,{method:'POST',token,body:{body:`Commentaire rate ${i}`}})).status).toBe(201);
    expect((await call(`/social/posts/${first.body.id}/comments`,{method:'POST',token,body:{body:'Commentaire rate final'}})).status).toBe(429);
    for(let i=0;i<90;i++)expect((await call('/social/reactions',{method:'POST',token,body:{targetType:'post',targetId:first.body.id,type:'AIME',active:i%2===0}})).status).toBe(201);
    expect((await call('/social/reactions',{method:'POST',token,body:{targetType:'post',targetId:first.body.id,type:'AIME',active:false}})).status).toBe(429);
    expect((await call(`/social/posts/${first.body.id}/report`,{method:'POST',token,body:{reason:'SPAM'}})).status).toBe(404);
    const author=await addUser(UserRole.FIDELE),otherPosts=[] as string[];
    for(let i=0;i<11;i++){const p=await prisma.socialPost.create({data:{authorId:author.id,idempotencyKey:`share_rate_${i}`,body:`Share target ${i}`,visibility:'TOUS_LES_FIDELES'}});otherPosts.push(p.id);}
    const sharer=await addUser(UserRole.FIDELE,{createdAt:new Date(Date.now()-25*60*60_000)}),sharerToken=jwt(sharer);
    for(const id of otherPosts.slice(0,10))expect((await call(`/social/posts/${id}/share`,{method:'POST',token:sharerToken,body:{body:'Partage'}})).status).toBe(201);
    expect((await call(`/social/posts/${otherPosts[10]}/share`,{method:'POST',token:sharerToken,body:{body:'Partage final'}})).status).toBe(429);
  });

  it('does not write attendance names, tokens, or passwords to application logs',async()=>{
    const sentinel='LOG-ATTENDANCE-NAME-SENTINEL';sensitiveCanaries.add(sentinel);
    const admin=await addUser(UserRole.ADMIN),sheet=await addSheet(SheetType.GROUPE_SEMAINE,new Date(Date.parse(`${localDate()}T00:00:00Z`)-86400000).toISOString().slice(0,10));
    await prisma.attendanceEntry.create({data:{sheetId:sheet.id,clientUuid:randomUUID(),fullName:sentinel,normalizedName:sentinel.toLowerCase(),sex:'F',zone:'TEMPLE'}});
    const access=await call(`/attendance/sheets/${sheet.id}/names/access`,{method:'POST',token:jwt(admin),body:{reason:'VERIFICATION_DEMANDE'}});expect(access.status).toBe(201);
    const failed=await call('/auth/login',{method:'POST',body:{email:testEmail(),password:'LOG-PASSWORD-SENTINEL'}});expect(failed.status).toBe(401);sensitiveCanaries.add('LOG-PASSWORD-SENTINEL');
    const dump=observedLogs.join('\n');for(const secret of sensitiveCanaries)if(secret.length>=8)expect(dump).not.toContain(secret);
  });
});

function totp(secret:string){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const char of secret)bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');const bytes:number[]=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));const secretBytes=Buffer.from(bytes);const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const digest=createHmac('sha1',secretBytes).update(counter).digest(),offset=digest[digest.length-1]&15,n=(digest.readUInt32BE(offset)&0x7fffffff)%1000000;return String(n).padStart(6,'0');}
