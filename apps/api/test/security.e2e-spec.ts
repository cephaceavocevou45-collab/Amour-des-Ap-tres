import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';
import * as argon2 from 'argon2';
import { UserRole, SheetType, SheetStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { CsrfGuard } from '../src/csrf.guard';
import { encryptTotpSecret } from '../src/totp';
import * as attendanceModule from '../src/attendance';

jest.setTimeout(120_000);
let app:any,prisma:PrismaService,baseUrl:string;
const userIds:string[]=[],sheetIds:string[]=[];
const password='e2e_password_Long_2026!';
const testEmail=()=>`${randomUUID()}@security-test.invalid`;
function localDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Porto-Novo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function weekday(date:string){const value=new Date(`${date}T00:00:00Z`).getUTCDay();return value===0?7:value;}
function monday(date:string){const value=new Date(`${date}T00:00:00Z`),day=value.getUTCDay();value.setUTCDate(value.getUTCDate()-(day===0?6:day-1));return value.toISOString().slice(0,10);}
async function addUser(role:UserRole,options:{active?:boolean;day?:number;secret?:string;email?:string}={}){const row=await prisma.user.create({data:{email:options.email??testEmail(),fullName:'E2E account',phone:'+2290100000000',passwordHash:await argon2.hash(password,{type:argon2.argon2id}),role,active:options.active??true,assignedDayOfWeek:options.day,totpSecret:options.secret?encryptTotpSecret(options.secret):null}});userIds.push(row.id);return row;}
function jwt(user:{id:string;role:UserRole;sessionVersion:number}){const enc=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url'),now=Math.floor(Date.now()/1000),unsigned=`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:user.id,role:user.role,ver:user.sessionVersion,iat:now,exp:now+600})}`;return `${unsigned}.${createHmac('sha256',process.env.JWT_ACCESS_SECRET!).update(unsigned).digest('base64url')}`;}
async function call(path:string,options:{method?:string;token?:string;body?:unknown;headers?:Record<string,string>}={}){const headers:Record<string,string>={...(options.body?{'Content-Type':'application/json'}:{}),...(options.token?{Authorization:`Bearer ${options.token}`} : {}),...options.headers};const response=await fetch(`${baseUrl}/api/v1${path}`,{method:options.method??'GET',headers,...(options.body?{body:JSON.stringify(options.body)}:{})});const raw=await response.text();return {status:response.status,body:raw?JSON.parse(raw):null,headers:response.headers};}
async function addSheet(type:SheetType,date=localDate()){const existing=await prisma.attendanceSheet.findUnique({where:{type_date:{type,date:new Date(`${date}T00:00:00.000Z`)}}});if(existing){sheetIds.push(existing.id);return existing;}const row=await prisma.attendanceSheet.create({data:{id:`e2e-${randomUUID()}`,type,date:new Date(`${date}T00:00:00.000Z`),status:SheetStatus.OUVERTE}});sheetIds.push(row.id);return row;}

beforeAll(async()=>{
  if(!process.env.TEST_DATABASE_URL||!new URL(process.env.TEST_DATABASE_URL).pathname.toLowerCase().includes('test'))throw new Error('Les e2e exigent TEST_DATABASE_URL pointant vers une base dédiée dont le nom contient test.');
  process.env.NODE_ENV='test';
  process.env.JWT_ACCESS_SECRET??='security-e2e-only-jwt-secret-not-for-deployment';
  process.env.TOTP_ENCRYPTION_KEY??='security-e2e-only-totp-key-not-for-deployment';
  app=await NestFactory.create(AppModule,{logger:false});
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  app.useGlobalGuards(new CsrfGuard());
  await app.listen(0,'127.0.0.1');
  baseUrl=`http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  prisma=app.get(PrismaService);
  await prisma.$connect();
});
afterAll(async()=>{
  if(prisma){await prisma.auditLog.deleteMany({where:{OR:[{userId:{in:userIds}},{entityId:{in:sheetIds}}]}});await prisma.attendanceSheet.deleteMany({where:{id:{in:sheetIds}}});await prisma.user.deleteMany({where:{id:{in:userIds}}});}
  if(app)await app.close();
});

describe('security HTTP e2e on isolated PostgreSQL',()=>{
  it('refuses role escalation at registration and creates a pending, sessionless account',async()=>{
    const attempted=await call('/auth/register',{method:'POST',body:{fullName:'E2E Applicant',phone:'+2290100000000',email:testEmail(),password,requestedRole:'RESPONSABLE_SEMAINE',requestedDayOfWeek:weekday(localDate()),role:'ADMIN'}});
    expect(attempted.status).toBe(400);
    const email=testEmail(),registered=await call('/auth/register',{method:'POST',body:{fullName:'E2E Applicant',phone:'+2290100000000',email,password,requestedRole:'RESPONSABLE_SEMAINE',requestedDayOfWeek:weekday(localDate())}});
    expect(registered.status).toBe(201);expect(registered.body).not.toHaveProperty('accessToken');
    const row=await prisma.user.findUniqueOrThrow({where:{email}});userIds.push(row.id);expect(row.role).toBe(UserRole.PENDING);expect(row.active).toBe(false);
  });

  it('registers a confirmed-email-only FIDELE account, forbids privilege fields, and keeps all attendance routes inaccessible',async()=>{
    const keys=['SOCIAL_MIN_AGE','SOCIAL_CHARTER_VERSION','SOCIAL_CHARTER_TEXT','RESEND_API_KEY','MAIL_FROM','APP_PUBLIC_URL','CAPTCHA_SECRET_KEY','CAPTCHA_SITE_KEY'];const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
    Object.assign(process.env,{SOCIAL_MIN_AGE:'13',SOCIAL_CHARTER_VERSION:'phase1-e2e-v1',SOCIAL_CHARTER_TEXT:'Charte de test sans valeur juridique.',RESEND_API_KEY:'test-only-not-a-real-key',MAIL_FROM:'Paroisse <test@example.invalid>',APP_PUBLIC_URL:baseUrl});delete process.env.CAPTCHA_SECRET_KEY;delete process.env.CAPTCHA_SITE_KEY;
    const realFetch=globalThis.fetch.bind(globalThis),sent:any[]=[];jest.spyOn(globalThis,'fetch').mockImplementation(async(input:any,init:any)=>{if(String(input).includes('api.resend.com')){sent.push(JSON.parse(String(init?.body)));return new Response('{}',{status:200});}return realFetch(input,init);});
    try{
      const email=testEmail(),body={fullName:'New Social Member',phone:'+2290100000000',email,password,dateOfBirth:'1990-03-15',acceptCharter:true,charterVersion:'phase1-e2e-v1'};
      expect((await call('/auth/social/register',{method:'POST',body:{...body,role:'ADMIN'}})).status).toBe(400);
      const registered=await call('/auth/social/register',{method:'POST',body});expect(registered.status).toBe(201);expect(registered.body).not.toHaveProperty('accessToken');expect(sent).toHaveLength(1);
      const member=await prisma.user.findUniqueOrThrow({where:{email}});userIds.push(member.id);expect(member.role).toBe(UserRole.FIDELE);expect(member.active).toBe(false);expect(member.emailVerifiedAt).toBeNull();expect(member.charterVersion).toBe('phase1-e2e-v1');
      expect((await call('/auth/login',{method:'POST',body:{email,password}})).status).toBe(401);
      const link=sent[0].html.match(/confirmer-email\?token=([A-Za-z0-9_-]{43})/);expect(link).not.toBeNull();const rawToken=link[1];
      const stored=await prisma.emailVerificationToken.findFirstOrThrow({where:{userId:member.id}});expect(stored.tokenHash).toBe(createHash('sha256').update(rawToken).digest('hex'));expect(stored.tokenHash).not.toBe(rawToken);
      expect((await call('/auth/social/email/confirm',{method:'POST',body:{token:rawToken}})).status).toBe(201);expect((await call('/auth/social/email/confirm',{method:'POST',body:{token:rawToken}})).status).toBe(400);
      const active=await prisma.user.findUniqueOrThrow({where:{id:member.id}});expect(active.active).toBe(true);expect(active.emailVerifiedAt).toBeInstanceOf(Date);
      const login=await call('/auth/login',{method:'POST',body:{email,password}});expect(login.status).toBe(201);expect(login.body).not.toHaveProperty('accessToken');const cookie=login.headers.get('set-cookie')?.match(/paroisse_access=([^;]+)/)?.[1];expect(cookie).toBeDefined();
      expect((await call('/attendance/today',{headers:{Cookie:`paroisse_access=${cookie}`}})).status).toBe(403);
      const admin=await addUser(UserRole.ADMIN),adminToken=jwt(admin);
      const suspended=await call(`/auth/social/admin/members/${member.id}/suspension`,{method:'PATCH',token:adminToken,body:{suspended:true,reason:'Demande de modération vérifiée'}});expect(suspended.status).toBe(200);
      expect((await call('/auth/login',{method:'POST',body:{email,password}})).status).toBe(401);
      expect(await prisma.refreshToken.count({where:{userId:member.id,revokedAt:null}})).toBe(0);
      expect(await prisma.auditLog.count({where:{userId:admin.id,action:'COMPTE_SUSPENDU',entityId:member.id}})).toBe(1);
      expect((await call(`/auth/social/admin/members/${member.id}/suspension`,{method:'PATCH',token:adminToken,body:{suspended:false}})).status).toBe(200);
      expect((await call('/auth/login',{method:'POST',body:{email,password}})).status).toBe(201);
    }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
  });

  it('equalizes failure messages and applies the same minimum response time to existing and unknown accounts',async()=>{
    const known=await addUser(UserRole.SECRETAIRE_PRESENCE),inputs=[known.email,testEmail()],durations:number[]=[],messages:any[]=[];
    for(const email of inputs){const started=Date.now(),result=await call('/auth/login',{method:'POST',body:{email,password:'incorrect-password'}});durations.push(Date.now()-started);messages.push(result.body);expect(result.status).toBe(401);}
    expect(messages[0]).toEqual(messages[1]);expect(durations.every(value=>value>=450)).toBe(true);expect(Math.abs(durations[0]-durations[1])).toBeLessThan(350);
  });

  it('limits president reads to own day/sheet and prevents cross-role writes on each attendance route',async()=>{
    jest.spyOn(attendanceModule,'isWithinAttendanceWindow').mockReturnValue(true);
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
    const list=await call('/auth/admin/members',{token});expect(list.status).toBe(200);const row=list.body.find((item:any)=>item.id===pending.id);expect(row).toBeDefined();expect(row).not.toHaveProperty('email');expect(row).not.toHaveProperty('phone');
    expect((await call(`/auth/admin/members/${editor.id}/decision`,{method:'PATCH',token,body:{action:'VALIDER'}})).status).toBe(403);
    expect((await call(`/auth/admin/members/${pending.id}/subadmin`,{method:'PATCH',token,body:{enabled:true}})).status).toBe(403);
  });

  it('lets only the administrator grant scoped sub-admin permissions',async()=>{
    const admin=await addUser(UserRole.ADMIN),secret='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',editor=await addUser(UserRole.EDITEUR,{secret}),adminToken=jwt(admin),editorToken=jwt(editor);
    expect((await call('/auth/admin/login',{method:'POST',body:{email:editor.email,password,totp:totp(secret)}})).status).toBe(401);
    const subLogin=await call('/auth/subadmin/login',{method:'POST',body:{email:editor.email,password,totp:totp(secret)}});expect(subLogin.status).toBe(201);expect(subLogin.body).not.toHaveProperty('accessToken');
    expect((await call('/auth/admin/members',{token:editorToken})).status).toBe(401);
    expect((await call('/attendance/course/2026-10-05',{token:editorToken})).status).toBe(403);
    expect((await call(`/auth/admin/members/${editor.id}/permissions`,{method:'PATCH',token:editorToken,body:{permissions:['GESTION_COMPTES']}})).status).toBe(401);
    expect((await call(`/auth/admin/members/${editor.id}/permissions`,{method:'PATCH',token:adminToken,body:{permissions:['PROGRAMME_BIBLIQUE']}})).status).toBe(200);
    let editorFresh=await prisma.user.findUniqueOrThrow({where:{id:editor.id}});let freshToken=jwt(editorFresh);
    expect((await call('/attendance/course/2026-10-05',{token:freshToken})).status).toBe(200);
    expect((await call('/auth/admin/members',{token:editorToken})).status).toBe(401);
    expect((await call(`/auth/admin/members/${editor.id}/permissions`,{method:'PATCH',token:adminToken,body:{permissions:['GESTION_COMPTES']}})).status).toBe(200);
    editorFresh=await prisma.user.findUniqueOrThrow({where:{id:editor.id}});freshToken=jwt(editorFresh);
    const memberRows=await call('/auth/admin/members',{token:freshToken});expect(memberRows.status).toBe(200);expect(memberRows.body.find((row:any)=>row.id===admin.id)).toBeUndefined();expect(memberRows.body.every((row:any)=>!('email'in row)&&!('phone'in row))).toBe(true);
    expect((await call(`/auth/admin/members/${editor.id}/permissions`,{method:'PATCH',token:freshToken,body:{permissions:['PROGRAMME_BIBLIQUE']}})).status).toBe(401);
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

  it('makes the concurrent entry/submit race leave totals consistent with the saved rows',async()=>{
    jest.spyOn(attendanceModule,'isWithinAttendanceWindow').mockReturnValue(true);
    const user=await addUser(UserRole.RESPONSABLE_SEMAINE,{day:weekday(localDate())}),token=jwt(user),sheet=await addSheet(SheetType.GROUPE_SEMAINE),entry={fullName:'Race attendee',sex:'F',zone:'SALLE_VISION',clientUuid:randomUUID()};
    const [added,submitted]=await Promise.all([call(`/attendance/sheets/${sheet.id}/entries`,{method:'POST',token,body:entry}),call(`/attendance/sheets/${sheet.id}/submit`,{method:'POST',token,body:{}})]);
    expect([201,409]).toContain(added.status);expect(submitted.status).toBe(201);
    const [saved,count]=await Promise.all([prisma.attendanceSheet.findUniqueOrThrow({where:{id:sheet.id}}),prisma.attendanceEntry.count({where:{sheetId:sheet.id}})]);
    expect(saved.totalAll).toBe(count);
  });

  it('does not put bearer or refresh tokens in browser storage',async()=>{
    const fs=require('node:fs'),file=require('node:path').resolve(__dirname,'../../web/src/app/auth.component.ts'),source=fs.readFileSync(file,'utf8');
    expect(source).not.toMatch(/sessionStorage\.setItem\(['"]paroisse_(?:access|refresh)_token/);
    expect(source).not.toMatch(/localStorage\.setItem\(['"]paroisse_(?:access|refresh)_token/);
  });
});

function totp(secret:string){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const char of secret)bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');const bytes:number[]=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));const secretBytes=Buffer.from(bytes);const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const digest=createHmac('sha1',secretBytes).update(counter).digest(),offset=digest[digest.length-1]&15,n=(digest.readUInt32BE(offset)&0x7fffffff)%1000000;return String(n).padStart(6,'0');}
