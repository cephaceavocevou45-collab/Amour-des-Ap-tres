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

jest.setTimeout(120_000);
let app:any,prisma:PrismaService,baseUrl:string;
const userIds:string[]=[],sheetIds:string[]=[];
const observedLogs:string[]=[],sensitiveCanaries=new Set<string>();
const maxObservedLogEntries=2_000;
const password='e2e_password_Long_2026!';
const nativeFetch=globalThis.fetch.bind(globalThis);
sensitiveCanaries.add(password);
const testEmail=()=>`${randomUUID()}@security-test.invalid`;
function localDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Porto-Novo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function weekday(date:string){const value=new Date(`${date}T00:00:00Z`).getUTCDay();return value===0?7:value;}
function monday(date:string){const value=new Date(`${date}T00:00:00Z`),day=value.getUTCDay();value.setUTCDate(value.getUTCDate()-(day===0?6:day-1));return value.toISOString().slice(0,10);}
async function addUser(role:UserRole,options:{active?:boolean;day?:number;secret?:string;email?:string;createdAt?:Date;emailVerifiedAt?:Date|null}={}){const row=await prisma.user.create({data:{email:options.email??testEmail(),fullName:'E2E account',phone:'+2290100000000',passwordHash:await argon2.hash(password,{type:argon2.argon2id}),role,active:options.active??true,assignedDayOfWeek:options.day,totpSecret:options.secret?encryptTotpSecret(options.secret):null,emailVerifiedAt:options.emailVerifiedAt!==undefined?options.emailVerifiedAt:role===UserRole.FIDELE?new Date():undefined,dateOfBirth:role===UserRole.FIDELE?new Date('1990-01-01'):undefined,...(options.createdAt?{createdAt:options.createdAt}:{})}});userIds.push(row.id);return row;}
function jwt(user:{id:string;role:UserRole;sessionVersion:number}){const enc=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url'),now=Math.floor(Date.now()/1000),unsigned=`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:user.id,role:user.role,ver:user.sessionVersion,iat:now,exp:now+600})}`,token=`${unsigned}.${createHmac('sha256',process.env.JWT_ACCESS_SECRET!).update(unsigned).digest('base64url')}`;sensitiveCanaries.add(token);return token;}
async function call(path:string,options:{method?:string;token?:string;body?:unknown;headers?:Record<string,string>}={}){const headers:Record<string,string>={...(options.body?{'Content-Type':'application/json'}:{}),...(options.token?{Authorization:`Bearer ${options.token}`} : {}),...options.headers};if(options.token)sensitiveCanaries.add(options.token);for(const value of Object.values(headers))if(/paroisse_(?:access|refresh)=/.test(value))sensitiveCanaries.add(value.split('=').slice(1).join('=').split(';')[0]);if(options.body&&typeof options.body==='object'){for(const [key,value]of Object.entries(options.body as any))if(typeof value==='string'&&/(?:password|token|fullName|code)/i.test(key))sensitiveCanaries.add(value);}const response=await fetch(`${baseUrl}/api/v1${path}`,{method:options.method??'GET',headers,...(options.body?{body:JSON.stringify(options.body)}:{})});const raw=await response.text();return {status:response.status,body:raw?JSON.parse(raw):null,headers:response.headers};}
async function addSheet(type:SheetType,date=localDate()){const existing=await prisma.attendanceSheet.findUnique({where:{type_date:{type,date:new Date(`${date}T00:00:00.000Z`)}}});if(existing){sheetIds.push(existing.id);return existing;}const row=await prisma.attendanceSheet.create({data:{id:`e2e-${randomUUID()}`,type,date:new Date(`${date}T00:00:00.000Z`),status:SheetStatus.OUVERTE}});sheetIds.push(row.id);return row;}

beforeAll(async()=>{
  if(!process.env.TEST_DATABASE_URL||!new URL(process.env.TEST_DATABASE_URL).pathname.toLowerCase().includes('test'))throw new Error('Les e2e exigent TEST_DATABASE_URL pointant vers une base dédiée dont le nom contient test.');
  process.env.NODE_ENV='test';
  process.env.JWT_ACCESS_SECRET??='security-e2e-only-jwt-secret-not-for-deployment';
  process.env.TOTP_ENCRYPTION_KEY??='security-e2e-only-totp-key-not-for-deployment';
  const capture=(...args:any[])=>{if(observedLogs.length>=maxObservedLogEntries)observedLogs.splice(0,maxObservedLogEntries/2);observedLogs.push(args.map(value=>typeof value==='string'?value:JSON.stringify(value)).join(' '));};
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
  try{
    if(prisma){await prisma.communityConversation.deleteMany({where:{OR:[{createdById:{in:userIds}},{members:{some:{userId:{in:userIds}}}}]}});await prisma.auditLog.deleteMany({where:{OR:[{userId:{in:userIds}},{entityId:{in:sheetIds}}]}});await prisma.attendanceEntry.deleteMany({where:{sheetId:{in:sheetIds}}});await prisma.attendanceSheet.deleteMany({where:{id:{in:sheetIds}}});await prisma.user.deleteMany({where:{id:{in:userIds}}});}
  }finally{
    try{if(app)await app.close();}finally{if(prisma)await prisma.$disconnect();observedLogs.length=0;sensitiveCanaries.clear();jest.restoreAllMocks();}
  }
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
    const sent:any[]=[],mail=jest.spyOn(globalThis,'fetch').mockImplementation(async(input:any,init:any)=>{if(String(input).includes('api.resend.com')){sent.push(JSON.parse(String(init?.body)));return new Response('{}',{status:200});}return nativeFetch(input,init);});
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
    }finally{mail.mockRestore();for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
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
    const keys=['CAPTCHA_ENABLED','CAPTCHA_SECRET_KEY','CAPTCHA_SITE_KEY','SOCIAL_CHARTER_VERSION','SOCIAL_CHARTER_TEXT'],previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));let verification:jest.SpyInstance|undefined;const captchaAttempts:string[]=[];
    try{
      delete process.env.CAPTCHA_ENABLED;delete process.env.CAPTCHA_SECRET_KEY;delete process.env.CAPTCHA_SITE_KEY;
      process.env.SOCIAL_CHARTER_VERSION='phase1-e2e-v1';process.env.SOCIAL_CHARTER_TEXT='Charte de test sans valeur juridique.';
      const optional=await call('/auth/social/registration-config');expect(optional.body.enabled).toBe(true);expect(optional.body.captchaEnabled).toBe(false);expect(optional.body.captchaSiteKey).toBeNull();expect(optional.body.captchaMessage).toContain('désactivée par défaut');
      process.env.CAPTCHA_ENABLED='true';
      const required=await call('/auth/social/registration-config');expect(required.body.enabled).toBe(false);expect(required.body.captchaMessage).toContain('configuration de la vérification anti-robot est incomplète');
      const refused=await call('/auth/social/register',{method:'POST',headers:{'X-Forwarded-For':'198.51.100.77'},body:{fullName:'CAPTCHA Test',email:testEmail(),password,dateOfBirth:'1990-01-01',acceptCharter:true,charterVersion:'phase1-e2e-v1'}});expect(refused.status).toBe(503);
      process.env.CAPTCHA_SECRET_KEY='test-turnstile-secret';process.env.CAPTCHA_SITE_KEY='test-turnstile-site';
      verification=jest.spyOn(globalThis,'fetch').mockImplementation(async(input:any,init:any)=>{
        if(String(input).includes('challenges.cloudflare.com/turnstile/v0/siteverify')){
          const params=new URLSearchParams(String(init?.body??''));
          const token=params.get('response')??'';captchaAttempts.push(token);
          return new Response(JSON.stringify({success:token==='valid-test-captcha'}),{status:200,headers:{'Content-Type':'application/json'}});
        }
        return nativeFetch(input,init);
      });
      const base={fullName:'CAPTCHA Test',phone:'+2290100000000',password,dateOfBirth:'1990-01-01',acceptCharter:true,charterVersion:'phase1-e2e-v1'},captchaHeaders={'X-Forwarded-For':'198.51.100.78'};
      expect((await call('/auth/social/register',{method:'POST',headers:captchaHeaders,body:{...base,email:testEmail()}})).status).toBe(400);
      expect((await call('/auth/social/register',{method:'POST',headers:captchaHeaders,body:{...base,email:testEmail(),captchaToken:'invalid-test-captcha'}})).status).toBe(400);
      const email=testEmail(),accepted=await call('/auth/social/register',{method:'POST',headers:captchaHeaders,body:{...base,email,captchaToken:'valid-test-captcha'}});expect(accepted.status).toBe(201);
      const created=await prisma.user.findUniqueOrThrow({where:{email}});userIds.push(created.id);expect(created.emailVerifiedAt).toBeNull();expect(captchaAttempts).toEqual(['invalid-test-captcha','valid-test-captcha']);
    }finally{verification?.mockRestore();for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
  });

  it('does not grant sensitive administration or attendance access to an account with an unconfirmed e-mail',async()=>{
    const member=await addUser(UserRole.FIDELE,{emailVerifiedAt:null}),token=jwt(member);
    const denied=['/attendance/today','/attendance/week','/auth/admin/members','/auth/social/admin/members'];
    for(const path of denied)expect([401,403]).toContain((await call(path,{token})).status);
    const persisted=await prisma.user.findUniqueOrThrow({where:{id:member.id},select:{emailVerifiedAt:true}});
    expect(persisted.emailVerifiedAt).toBeNull();
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
    const historicalDate=new Date(Date.parse(`${localDate()}T00:00:00Z`)-(2+Math.floor(Math.random()*300))*86400000).toISOString().slice(0,10),sheet=await addSheet(SheetType.GROUPE_SEMAINE,historicalDate),entry=await prisma.attendanceEntry.create({data:{sheetId:sheet.id,clientUuid:randomUUID(),fullName:'Private attendee',normalizedName:'private attendee',sex:'F',zone:'SALLE_VISION'}}),admin=await addUser(UserRole.ADMIN),token=jwt(admin);
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

  it('supports private account settings, session control, password change, export and 14-day account closure',async()=>{
    const member=await addUser(UserRole.FIDELE),other=await addUser(UserRole.FIDELE),token=jwt(member),currentRaw=randomBytes(32).toString('base64url'),otherRaw=randomBytes(32).toString('base64url'),currentHash=createHash('sha256').update(currentRaw).digest('hex');
    const current=await prisma.refreshToken.create({data:{userId:member.id,hashedToken:currentHash,expiresAt:new Date(Date.now()+86400000),family:randomUUID()}}),otherSession=await prisma.refreshToken.create({data:{userId:member.id,hashedToken:createHash('sha256').update(otherRaw).digest('hex'),expiresAt:new Date(Date.now()+86400000),family:randomUUID()}});
    const listed=await call('/auth/social/account/sessions',{token,headers:{Cookie:`paroisse_refresh=${currentRaw}`}});expect(listed.status).toBe(200);expect(listed.body).toHaveLength(2);expect(listed.body.find((row:any)=>row.id===current.id).isCurrent).toBe(true);expect(JSON.stringify(listed.body)).not.toContain(currentHash);expect(JSON.stringify(listed.body)).not.toContain(currentRaw);
    expect((await call(`/auth/social/account/sessions/${otherSession.id}`,{method:'DELETE',token:jwt(other)})).status).toBe(403);
    expect((await call(`/auth/social/account/sessions/${otherSession.id}`,{method:'DELETE',token})).status).toBe(200);
    expect((await prisma.refreshToken.findUniqueOrThrow({where:{id:otherSession.id}})).revokedAt).toBeTruthy();
    const passwordChange=await call('/auth/social/account/password',{method:'POST',token,headers:{Cookie:`paroisse_refresh=${currentRaw}`},body:{currentPassword:password,newPassword:'New_Strong_Password_2026!',confirmPassword:'New_Strong_Password_2026!'}});expect(passwordChange.status).toBe(201);
    expect((await prisma.refreshToken.findUniqueOrThrow({where:{id:current.id}})).revokedAt).toBeNull();
    expect((await call('/auth/login',{method:'POST',body:{email:member.email,password}})).status).toBe(401);
    expect((await call('/auth/login',{method:'POST',body:{email:member.email,password:'New_Strong_Password_2026!'}})).status).toBe(201);
    const exported=await call('/auth/social/account/export',{token});expect(exported.status).toBe(200);expect(exported.body).toHaveProperty('sentMessages');expect(JSON.stringify(exported.body)).not.toContain('passwordHash');
    const closed=await call('/auth/social/account',{method:'DELETE',token,body:{reason:'Je souhaite fermer mon compte'}});expect(closed.status).toBe(200);expect(closed.body.graceDays).toBe(14);expect(new Date(closed.body.scheduledAt).getTime()-Date.now()).toBeGreaterThan(13*86400000);expect((await call('/auth/session',{token})).status).toBe(401);
    expect((await call('/auth/social/account/deletion/cancel',{method:'POST',body:{email:member.email,password:'New_Strong_Password_2026!'}})).status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({where:{id:member.id}})).deletionScheduledAt).toBeNull();expect((await call('/auth/login',{method:'POST',body:{email:member.email,password:'New_Strong_Password_2026!'}})).status).toBe(201);
    expect((await call('/auth/social/account/deletion/cancel',{method:'POST',body:{email:member.email,password:'incorrect-password'}})).body.message).toBe('Si le compte est en période de fermeture et que le mot de passe concorde, la demande sera annulée.');
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
