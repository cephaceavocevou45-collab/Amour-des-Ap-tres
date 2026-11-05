import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as argon2 from 'argon2';
import * as express from 'express';
import { UserRole, SheetType, SheetStatus } from '../src/generated/prisma';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth';
import { LoginBackoffPolicy } from '../src/login-backoff.policy';
import { PrismaService } from '../src/prisma.service';
import { CsrfGuard } from '../src/csrf.guard';
import { noStoreResponses } from '../src/http-security';
import * as attendanceModule from '../src/attendance';

jest.setTimeout(120_000);
let app:any,prisma:PrismaService,baseUrl:string;
const userIds:string[]=[],sheetIds:string[]=[];
const observedLogs:string[]=[],sensitiveCanaries=new Set<string>();
const maxObservedLogEntries=2_000;
const password='e2e_password_Long_2026!';
let requestAddress=1;
const nativeFetch=globalThis.fetch.bind(globalThis);
sensitiveCanaries.add(password);
const testEmail=()=>`${randomUUID()}@security-test.invalid`;
function localDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Porto-Novo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function weekday(date:string){const value=new Date(`${date}T00:00:00Z`).getUTCDay();return value===0?7:value;}
function median(values:number[]){const sorted=[...values].sort((left,right)=>left-right);return sorted[Math.floor(sorted.length/2)];}
function monday(date:string){const value=new Date(`${date}T00:00:00Z`),day=value.getUTCDay();value.setUTCDate(value.getUTCDate()-(day===0?6:day-1));return value.toISOString().slice(0,10);}
async function addUser(role:UserRole,options:{active?:boolean;day?:number;email?:string;createdAt?:Date}={}){const row=await prisma.user.create({data:{email:options.email??testEmail(),fullName:'E2E account',phone:'+2290100000000',passwordHash:await argon2.hash(password,{type:argon2.argon2id}),role,active:options.active??true,assignedDayOfWeek:options.day,...(options.createdAt?{createdAt:options.createdAt}:{})}});userIds.push(row.id);return row;}
function jwt(user:{id:string;role:UserRole;sessionVersion:number},family?:string){const enc=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url'),now=Math.floor(Date.now()/1000),unsigned=`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:user.id,role:user.role,ver:user.sessionVersion,...(family?{fam:family}:{}),iat:now,exp:now+600})}`,token=`${unsigned}.${createHmac('sha256',process.env.JWT_ACCESS_SECRET!).update(unsigned).digest('base64url')}`;sensitiveCanaries.add(token);return token;}
async function call(path:string,options:{method?:string;token?:string;body?:unknown;headers?:Record<string,string>}={}){const sensitiveAction=/\/admin\/members(?:\/[^/]+)?(?:\/permissions)?$/.test(path)&&['POST','PATCH'].includes(options.method??'GET')||path.endsWith('/names/access');let requestBody=options.body;if(sensitiveAction&&options.token&&requestBody&&typeof requestBody==='object')requestBody={...(requestBody as any),reauthPassword:password};const address=`198.18.${Math.floor(requestAddress/256)%256}.${requestAddress%256}`;requestAddress++;const headers:Record<string,string>={...(requestBody?{'Content-Type':'application/json'}:{}),'X-Forwarded-For':address,...(options.token?{Authorization:`Bearer ${options.token}`} : {}),...options.headers};if(options.token)sensitiveCanaries.add(options.token);for(const value of Object.values(headers))if(/paroisse_(?:access|refresh)=/.test(value))sensitiveCanaries.add(value.split('=').slice(1).join('=').split(';')[0]);if(requestBody&&typeof requestBody==='object'){for(const [key,value]of Object.entries(requestBody as any))if(typeof value==='string'&&/(?:password|token|fullName|code)/i.test(key))sensitiveCanaries.add(value);}const response=await fetch(`${baseUrl}/api/v1${path}`,{method:options.method??'GET',headers,...(requestBody?{body:JSON.stringify(requestBody)}:{})});const raw=await response.text();return {status:response.status,body:raw?JSON.parse(raw):null,headers:response.headers};}
async function addSheet(type:SheetType,date=localDate()){const existing=await prisma.attendanceSheet.findUnique({where:{type_date:{type,date:new Date(`${date}T00:00:00.000Z`)}}});if(existing){sheetIds.push(existing.id);return existing;}const row=await prisma.attendanceSheet.create({data:{id:`e2e-${randomUUID()}`,type,date:new Date(`${date}T00:00:00.000Z`),status:SheetStatus.OUVERTE}});sheetIds.push(row.id);return row;}

beforeAll(async()=>{
  if(!process.env.TEST_DATABASE_URL||!new URL(process.env.TEST_DATABASE_URL).pathname.toLowerCase().includes('test'))throw new Error('Les e2e exigent TEST_DATABASE_URL pointant vers une base dédiée dont le nom contient test.');
  process.env.NODE_ENV='test';
  process.env.JWT_ACCESS_SECRET??='security-e2e-only-jwt-secret-not-for-deployment';
  const capture=(...args:any[])=>{if(observedLogs.length>=maxObservedLogEntries)observedLogs.splice(0,maxObservedLogEntries/2);observedLogs.push(args.map(value=>typeof value==='string'?value:JSON.stringify(value)).join(' '));};
  const logger={log:capture,error:capture,warn:capture,debug:capture,verbose:capture,fatal:capture};
  for(const method of ['log','info','warn','error','debug'] as const)jest.spyOn(console,method).mockImplementation((...args:any[])=>capture(...args));
  app=await NestFactory.create(AppModule,{logger:logger as any,bodyParser:false});
  app.use(noStoreResponses);
  app.use(express.json({limit:'64kb'}));app.use(express.urlencoded({extended:false,limit:'64kb'}));
  app.getHttpAdapter().getInstance().set('trust proxy','loopback');
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));
  app.useGlobalGuards(new CsrfGuard());
  await app.listen(0,'127.0.0.1');
  baseUrl=`http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
    const response=await nativeFetch(input,init);
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    if(url.origin===baseUrl&&(/^\/api\//.test(url.pathname)||url.pathname==='/health'||url.pathname==='/ready')){
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('pragma')).toBe('no-cache');
    }
    return response;
  };
  prisma=app.get(PrismaService);
  await prisma.$connect();
});
afterAll(async()=>{
  try{
    if(prisma){await prisma.auditLog.deleteMany({where:{OR:[{userId:{in:userIds}},{entityId:{in:sheetIds}}]}});await prisma.attendanceEntry.deleteMany({where:{sheetId:{in:sheetIds}}});await prisma.attendanceSheet.deleteMany({where:{id:{in:sheetIds}}});await prisma.user.deleteMany({where:{id:{in:userIds}}});}
  }finally{
    try{if(app)await app.close();}finally{if(prisma)await prisma.$disconnect();globalThis.fetch=nativeFetch;observedLogs.length=0;sensitiveCanaries.clear();jest.restoreAllMocks();}
  }
});

describe('security HTTP e2e on isolated PostgreSQL',()=>{
  it('retire les routes de communauté et d’inscription sociale obsolètes',async()=>{
    const removed=[
      ['POST','/auth/social/register'],['GET','/auth/social/registration-config'],
      ['GET','/community/conversations'],['POST','/community/conversations/direct'],['POST','/community/conversations/group'],['GET','/community/stories'],['POST','/community/stories'],['GET','/community/lives'],['POST','/community/lives'],
      ['GET','/community/content/programmes'],['GET','/community/groups'],['GET','/social/posts'],['POST','/social/posts'],['POST','/social/reports'],['POST','/media/upload'],['POST','/auth/social/email/confirm']
    ];
    for(const [method,path] of removed)expect((await call(path,{method})).status).toBe(404);
    expect(Object.values(UserRole)).toContain('FIDELE');expect(Object.values(UserRole)).not.toContain('MODERATEUR');expect(Object.values(UserRole)).not.toContain('PENDING');
  });
  it('ne publie aucune route de documentation API ni de schéma OpenAPI',async()=>{
    for(const path of ['/api/docs','/api/docs-json','/api/docs-yaml','/api-json','/docs','/api/v1/api/docs','/openapi.json','/openapi.yaml','/swagger.json'])expect((await call(path)).status).toBe(404);
  });
  it('marks public, authenticated, health and readiness API responses as non-cacheable',async()=>{
    const admin=await addUser(UserRole.ADMIN),token=jwt(admin);
    for(const result of [await fetch(`${baseUrl}/health`),await fetch(`${baseUrl}/ready`),await fetch(`${baseUrl}/api/v1/public/leader`),await call('/auth/session',{token})]){
      expect(result.headers.get('cache-control')).toBe('no-store');
      expect(result.headers.get('pragma')).toBe('no-cache');
    }
  });
  it('allows faithful self-registration immediately but never self-assigns an administrative role',async()=>{
    const email=testEmail(),before=await prisma.user.count({where:{email}});
    const created=await call('/auth/register/faithful',{method:'POST',body:{fullName:'Compte fidèle E2E',firstName:'Compte',lastName:'Fidèle E2E',grade:'Fidèle',parish:'Sainte-Cécile',functionName:'Membre',sex:'F',email,phone:'+2290150000000',password,confirmPassword:password}});
    expect(created.status).toBe(201);
    const faithful=await prisma.user.findUniqueOrThrow({where:{email}});userIds.push(faithful.id);
    expect(faithful).toMatchObject({role:UserRole.FIDELE,active:true,mustChangePassword:false,firstName:'Compte',lastName:'Fidèle E2E',grade:'Fidèle',parish:'Sainte-Cécile',functionName:'Membre',sex:'F'});
    expect(await prisma.user.count({where:{email}})).toBe(before+1);

    const privilegedEmail=testEmail();
    const denied=await call('/auth/register',{method:'POST',body:{fullName:'Tentative admin E2E',email:privilegedEmail,role:'ADMIN',password,confirmPassword:password}});
    expect(denied.status).toBe(400);
    expect(await prisma.user.count({where:{email:privilegedEmail}})).toBe(0);
  });
  it('never resets or reactivates an existing SUPER_ADMIN when the seed is rerun',async()=>{
    const email=testEmail(),seedCli=path.join(process.cwd(),'node_modules','ts-node','dist','bin.js'),seedFile=path.join(process.cwd(),'apps','api','prisma','seed.ts');
    const created=await prisma.user.create({data:{email,fullName:'E2E bootstrap safety',role:UserRole.SUPER_ADMIN,active:false,mustChangePassword:true,passwordHash:await argon2.hash(randomBytes(32).toString('base64url'))}});userIds.push(created.id);
    const runSeed=(passwordValue:string)=>spawnSync(process.execPath,[seedCli,seedFile],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,DATABASE_URL:process.env.TEST_DATABASE_URL!,BOOTSTRAP_ADMIN_EMAIL:email,BOOTSTRAP_ADMIN_PASSWORD:passwordValue}});
    expect(runSeed(randomBytes(32).toString('base64url')).status).toBe(0);
    expect(runSeed(randomBytes(32).toString('base64url')).status).toBe(0);
    const after=await prisma.user.findUniqueOrThrow({where:{id:created.id}});
    expect(after).toMatchObject({active:false,passwordHash:created.passwordHash,mustChangePassword:true});
  });
  it('creates responsible accounts only through administration and forces the first password change',async()=>{
    const admin=await addUser(UserRole.ADMIN),adminToken=jwt(admin),memberEmail=testEmail();
    const body={fullName:'Responsable créé en E2E',email:memberEmail,role:'RESPONSABLE_SEMAINE',assignedDayOfWeek:3,reason:'Désignation approuvée par le chargé paroissial.'};
    expect((await call('/auth/admin/members',{method:'POST',token:jwt(await addUser(UserRole.RESPONSABLE_SEMAINE,{day:3})),body})).status).toBe(403);
    const created=await call('/auth/admin/members',{method:'POST',token:adminToken,body});expect(created.status).toBe(201);expect(created.body.temporaryPassword).toHaveLength(32);expect(created.body.member).toMatchObject({email:memberEmail,role:'RESPONSABLE_SEMAINE',assignedDayOfWeek:3,mustChangePassword:true});
    sensitiveCanaries.add(created.body.temporaryPassword);const row=await prisma.user.findUniqueOrThrow({where:{email:memberEmail}});userIds.push(row.id);
    const memberToken=jwt(row);
    expect((await call('/attendance/today',{token:memberToken})).status).toBe(401);
    expect((await call('/auth/account/password/first-login',{method:'POST',token:memberToken,body:{currentPassword:created.body.temporaryPassword,newPassword:'Responsable_mot_de_passe_2026!',confirmPassword:'Responsable_mot_de_passe_2026!'}})).status).toBe(201);
    expect((await call('/auth/admin/members',{token:adminToken})).body.some((item:any)=>item.id===row.id)).toBe(true);
    expect(await prisma.auditLog.count({where:{action:'COMPTE_RESPONSABLE_CREE',entityId:row.id}})).toBe(1);
  });
  it('requires a fresh password for sensitive administrator actions and revokes every device session',async()=>{
    const admin=await addUser(UserRole.ADMIN),token=jwt(admin),sheet=await addSheet(SheetType.GROUPE_SEMAINE),accountEmail=testEmail();
    const unproved=await fetch(`${baseUrl}/api/v1/auth/admin/members`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({fullName:'Compte contrôlé E2E',email:accountEmail,role:'EDITEUR',reason:'Création autorisée par un administrateur.'})});
    expect(unproved.status).toBe(401);
    const namesPath=`/attendance/sheets/${sheet.id}/names/access`;
    const unprovedNames=await fetch(`${baseUrl}/api/v1${namesPath}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({reason:'VERIFICATION_DEMANDE'})});
    expect(unprovedNames.status).toBe(401);
    const sessionId=await prisma.refreshToken.create({data:{userId:admin.id,hashedToken:createHash('sha256').update(randomBytes(32)).digest('hex'),expiresAt:new Date(Date.now()+60_000),family:randomUUID()}});
    const revoked=await call('/auth/account/sessions/revoke-all',{method:'POST',token});
    expect(revoked.status).toBe(201);
    expect(await prisma.refreshToken.count({where:{userId:admin.id,revokedAt:null}})).toBe(0);
    expect((await call('/attendance/today',{token})).status).toBe(401);
    expect(await prisma.refreshToken.findUnique({where:{id:sessionId.id}})).toMatchObject({revokedAt:expect.any(Date)});
  });
  it('equalizes failure messages and applies a minimum response time to known and unknown accounts',async()=>{
    const known=await addUser(UserRole.SECRETAIRE_PRESENCE),unknownWarmup=testEmail(),knownDurations:number[]=[],unknownDurations:number[]=[],knownMessages:any[]=[],unknownMessages:any[]=[];
    await argon2.verify(known.passwordHash,'warm-up-only');
    expect((await call('/auth/login',{method:'POST',headers:{'X-Forwarded-For':'198.18.110.1'},body:{email:unknownWarmup,password:'warm-up-only'}})).status).toBe(401);
    for(let index=0;index<5;index++){
      const knownStart=Date.now(),knownResult=await call('/auth/login',{method:'POST',headers:{'X-Forwarded-For':`198.18.111.${index+1}`},body:{email:known.email,password:'incorrect-password'}});
      knownDurations.push(Date.now()-knownStart);knownMessages.push(knownResult.body);expect(knownResult.status).toBe(401);
      const unknownStart=Date.now(),unknownResult=await call('/auth/login',{method:'POST',headers:{'X-Forwarded-For':`198.18.112.${index+1}`},body:{email:testEmail(),password:'incorrect-password'}});
      unknownDurations.push(Date.now()-unknownStart);unknownMessages.push(unknownResult.body);expect(unknownResult.status).toBe(401);
    }
    expect(knownMessages.every(message=>JSON.stringify(message)===JSON.stringify(unknownMessages[0]))).toBe(true);
    expect([...knownDurations,...unknownDurations].every(value=>value>=450)).toBe(true);
    expect(Math.abs(median(knownDurations)-median(unknownDurations))).toBeLessThan(350);
  });
  it('slows repeated password failures without permanently locking a valid account and rate-limits reset-code guessing',async()=>{
    const user=await addUser(UserRole.SECRETAIRE_PRESENCE),sourceIp='198.18.200.1',policy=app.get(LoginBackoffPolicy) as LoginBackoffPolicy,observedDelays:number[]=[];
    const originalWait=policy.wait.bind(policy);
    const appliedWait=jest.spyOn(policy,'wait').mockImplementation(async(ip,email)=>{const delay=await originalWait(ip,email);if(ip===sourceIp&&email===user.email)observedDelays.push(delay);return delay;});
    for(let index=0;index<4;index++){const result=await call('/auth/login',{method:'POST',headers:{'X-Forwarded-For':sourceIp},body:{email:user.email,password:'wrong-password'}});expect(result.status).toBe(401);}
    expect(observedDelays).toEqual([0,0,0,500]);
    expect((await call('/auth/login',{method:'POST',headers:{'X-Forwarded-For':sourceIp},body:{email:user.email,password}})).status).toBe(201);
    expect(policy.failureCount(sourceIp,user.email)).toBe(0);
    expect(policy.delayMs(sourceIp,user.email)).toBe(0);
    appliedWait.mockRestore();
    const email=testEmail();let last:any;
    for(let index=0;index<5;index++)last=await call('/auth/password/forgot',{method:'POST',body:{email}});
    expect(last.status).toBe(429);
  });
  it('expires idle and absolute-old sessions on protected requests and revokes the session family',async()=>{
    const user=await addUser(UserRole.SECRETAIRE_PRESENCE),makeSession=async(createdAge:number,lastSeenAge:number)=>{const family=randomUUID(),now=Date.now(),raw=randomBytes(32);await prisma.refreshToken.create({data:{userId:user.id,hashedToken:createHash('sha256').update(raw).digest('hex'),family,createdAt:new Date(now-createdAge),lastSeenAt:new Date(now-lastSeenAge),expiresAt:new Date(now+60*60_000)}});return family;};
    const idleFamily=await makeSession(60_000,31*60_000);expect((await call('/auth/session',{token:jwt(user,idleFamily)})).status).toBe(401);expect(await prisma.refreshToken.count({where:{userId:user.id,family:idleFamily,revokedAt:null}})).toBe(0);
    const absoluteFamily=await makeSession(31*86_400_000,60_000);expect((await call('/auth/session',{token:jwt(user,absoluteFamily)})).status).toBe(401);expect(await prisma.refreshToken.count({where:{userId:user.id,family:absoluteFamily,revokedAt:null}})).toBe(0);
  });
  it('requires CSRF proof for cookie-authenticated writes and rejects oversized request bodies',async()=>{
    const user=await addUser(UserRole.SECRETAIRE_PRESENCE),login=await call('/auth/login',{method:'POST',body:{email:user.email,password}});
    expect(login.status).toBe(201);
    const cookies=login.headers.get('set-cookie')??'',access=cookies.match(/paroisse_access=([^;]+)/)?.[1],csrf=cookies.match(/paroisse_csrf=([^;]+)/)?.[1];
    expect(access).toBeTruthy();expect(csrf).toBeTruthy();
    const revokeUrl=`${baseUrl}/api/v1/auth/account/sessions/revoke-all`,cookie=`paroisse_access=${access}; paroisse_csrf=${csrf}`;
    const blocked=await fetch(revokeUrl,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'});expect(blocked.status).toBe(403);
    const allowed=await fetch(revokeUrl,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','x-csrf-token':csrf!},body:'{}'});expect(allowed.status).toBe(201);
    const oversized=await fetch(`${baseUrl}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password:'x'.repeat(70_000)})});
    expect(oversized.status).toBe(413);
  });
  it('rejects overlong attendance names while accepting legitimate accents, apostrophes and punctuation',async()=>{
    const date=localDate(),president=await addUser(UserRole.RESPONSABLE_SEMAINE,{day:weekday(date)}),sheetId=`GROUPE_SEMAINE-${date}`;sheetIds.push(sheetId);
    jest.useFakeTimers({doNotFake:['setTimeout','clearTimeout','setInterval','clearInterval','setImmediate','clearImmediate','nextTick','queueMicrotask']});jest.setSystemTime(new Date(`${date}T11:00:00.000Z`));
    try{
      const tooLong=await call(`/attendance/sheets/${sheetId}/entries`,{method:'POST',token:jwt(president),body:{fullName:'A'.repeat(121),sex:'F',zone:'TEMPLE',clientUuid:randomUUID()}});expect(tooLong.status).toBe(400);
      const valid=await call(`/attendance/sheets/${sheetId}/entries`,{method:'POST',token:jwt(president),body:{fullName:'Élodie D’Oliveira — N’Guessan',sex:'F',zone:'TEMPLE',clientUuid:randomUUID()}});if(![201,409].includes(valid.status))throw new Error(`Réponse inattendue pour un nom valide : ${JSON.stringify(valid.body)}`);expect([201,409]).toContain(valid.status);
      if(valid.status===201)expect(valid.body.entries.some((entry:any)=>entry.fullName==='Élodie D’Oliveira — N’Guessan')).toBe(true);
    }finally{jest.useRealTimers();}
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
    const priorCourseMonday=new Date(`${monday(today)}T00:00:00.000Z`);priorCourseMonday.setUTCDate(priorCourseMonday.getUTCDate()-7);const priorCourseDate=priorCourseMonday.toISOString().slice(0,10);
    const own=await addSheet(SheetType.GROUPE_SEMAINE,today),otherDay=await addSheet(SheetType.GROUPE_SEMAINE,dateY),course=await addSheet(SheetType.COURS_BIBLIQUE,priorCourseDate);
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
    const crossWeekCourseDate=priorCourseDate;
    const priorWeek=new Date(`${weekStart}T00:00:00.000Z`);priorWeek.setUTCDate(priorWeek.getUTCDate()-7);
    expect((await call(`/attendance/week?start=${priorWeek.toISOString().slice(0,10)}`,{token:tokenX})).status).toBe(403);
    expect((await call(`/attendance/course/${crossWeekCourseDate}`,{token:secretaryToken})).status).toBe(403);
    expect((await call(`/attendance/course/${crossWeekCourseDate}`,{method:'PUT',token:secretaryToken,body:{theme:'Cross date'}})).status).toBe(403);
    expect((await call(`/attendance/course/${crossWeekCourseDate}`,{token:tokenX})).status).toBe(403);
    expect((await call(`/attendance/sheets/${own.id}/entries`,{method:'POST',token:tokenX,body:{fullName:'Wrong zone',sex:'F',zone:'FIDELES',clientUuid:randomUUID()}})).status).toBe(403);
    expect((await call(`/attendance/sheets/${course.id}/summary`,{token:secretaryToken})).status).toBe(403);
    expect((await call(`/attendance/sheets/${own.id}/summary`,{token:secretaryToken})).status).toBe(403);
    expect((await call(`/attendance/sheets/${course.id}/entries`,{method:'POST',token:secretaryToken,body:{fullName:'Wrong zone',sex:'M',zone:'TEMPLE',clientUuid:randomUUID()}})).status).toBe(403);
    expect((await call('/attendance/export',{token:tokenX})).status).toBe(404);
    expect((await call('/attendance/history',{token:tokenX})).status).toBe(404);
    expect((await call('/attendance/today',{token:tokenY})).status).toBe(200);
    const secretaryToday=await call('/attendance/today',{token:secretaryToken});expect(secretaryToday.status).toBe(200);
    if(weekday(today)===1){expect(secretaryToday.body).toHaveLength(1);expect(secretaryToday.body[0]).toMatchObject({type:'COURS_BIBLIQUE',date:today});}
    else expect(secretaryToday.body).toEqual([]);
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

  it('lets only the administrator grant scoped sub-admin permissions',async()=>{
    const admin=await addUser(UserRole.ADMIN),editor=await addUser(UserRole.EDITEUR),adminToken=jwt(admin),editorToken=jwt(editor);
    expect((await call('/auth/admin/login',{method:'POST',body:{email:editor.email,password}})).status).toBe(401);
    const subLogin=await call('/auth/subadmin/login',{method:'POST',body:{email:editor.email,password}});expect(subLogin.status).toBe(201);expect(subLogin.body).not.toHaveProperty('accessToken');
    expect((await call('/auth/admin/members',{token:editorToken})).status).toBe(403);
    expect((await call('/attendance/course/2026-10-05',{token:editorToken})).status).toBe(403);
    expect((await call(`/auth/admin/members/${editor.id}/permissions`,{method:'PATCH',token:editorToken,body:{permissions:['GESTION_COMPTES'],reason:'Motif non autorisé'}})).status).toBe(403);
    expect((await call(`/auth/admin/members/${editor.id}/permissions`,{method:'PATCH',token:adminToken,body:{permissions:['PROGRAMME_BIBLIQUE'],reason:'Autoriser la préparation des cours bibliques.'}})).status).toBe(200);
    let editorFresh=await prisma.user.findUniqueOrThrow({where:{id:editor.id}});let freshToken=jwt(editorFresh);
    expect((await call('/attendance/course/2026-10-05',{token:freshToken})).status).toBe(200);
    expect((await call('/auth/admin/members',{token:freshToken})).status).toBe(403);
    const staleProgrammeToken=freshToken;
    expect((await call(`/auth/admin/members/${editor.id}/permissions`,{method:'PATCH',token:adminToken,body:{permissions:['GESTION_COMPTES'],reason:'Autoriser la gestion des demandes de compte.'}})).status).toBe(200);
    expect((await call('/attendance/course/2026-10-05',{token:staleProgrammeToken})).status).toBe(401);
    editorFresh=await prisma.user.findUniqueOrThrow({where:{id:editor.id}});freshToken=jwt(editorFresh);
    const memberRows=await call('/auth/admin/members',{token:freshToken});expect(memberRows.status).toBe(403);
    expect((await call(`/auth/admin/members/${editor.id}/permissions`,{method:'PATCH',token:freshToken,body:{permissions:['PROGRAMME_BIBLIQUE'],reason:'Tentative non autorisée'}})).status).toBe(403);
    const permissionAudit=await prisma.auditLog.findMany({where:{action:'AUTORISATIONS_COMPTE_MODIFIEES',entityId:editor.id}});expect(permissionAudit).toHaveLength(2);expect(permissionAudit.every(row=>!!row.reason&&row.reason.length>=8)).toBe(true);
  });

  it('invalidates a still-signed access token as soon as the account is disabled',async()=>{
    const user=await addUser(UserRole.RESPONSABLE_SEMAINE,{day:weekday(localDate())}),token=jwt(user);
    expect([200,201]).toContain((await call('/attendance/today',{token})).status);
    await prisma.user.update({where:{id:user.id},data:{active:false,sessionVersion:{increment:1}}});
    expect((await call('/attendance/today',{token})).status).toBe(401);
  });

  it('authenticates administrators with email and password only and exposes no 2FA routes',async()=>{
    const admin=await addUser(UserRole.ADMIN);
    const login=await call('/auth/admin/login',{method:'POST',body:{email:admin.email,password}});
    expect(login.status).toBe(201);expect(login.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect((await call('/auth/admin/login',{method:'POST',body:{email:admin.email,password,totp:'123456'}})).status).toBe(400);
    expect((await call('/auth/admin/2fa/setup',{method:'POST',body:{email:admin.email,password}})).status).toBe(404);
    expect((await call('/auth/admin/2fa/new-secret',{method:'POST',body:{email:admin.email,password}})).status).toBe(404);
    expect((await call('/auth/admin/2fa/recovery-codes',{method:'POST',token:jwt(admin),body:{}})).status).toBe(404);
    expect((await call('/auth/admin/members')).status).toBe(401);
  });
  it('allows only one concurrent password reset and rejects replay and expiration',async()=>{
    const argon2=require('argon2'),user=await addUser(UserRole.SECRETAIRE_PRESENCE),code='481206',hash=await argon2.hash(code);
    await prisma.passwordResetToken.create({data:{userId:user.id,tokenHash:hash,expiresAt:new Date(Date.now()+60_000)}});
    const body={email:user.email,code,password:'nouveau_mot_de_passe_Securise_2026!',confirmPassword:'nouveau_mot_de_passe_Securise_2026!'};
    const results=await Promise.all([call('/auth/password/reset',{method:'POST',body}),call('/auth/password/reset',{method:'POST',body})]);expect(results.filter(x=>x.status===201).length).toBe(1);
    expect((await call('/auth/password/reset',{method:'POST',body})).status).toBe(400);
    const expiredHash=await argon2.hash('746203');await prisma.passwordResetToken.create({data:{userId:user.id,tokenHash:expiredHash,expiresAt:new Date(Date.now()-1000)}});
    expect((await call('/auth/password/reset',{method:'POST',body:{...body,code:'746203'}})).status).toBe(400);
  });

  it('revokes an entire refresh-token family after token reuse',async()=>{
    const user=await addUser(UserRole.SECRETAIRE_PRESENCE),raw=randomBytes(32).toString('base64url'),family=randomUUID();
    await prisma.refreshToken.create({data:{userId:user.id,hashedToken:createHash('sha256').update(raw).digest('hex'),family,expiresAt:new Date(Date.now()+3600000)}});
    expect((await call('/auth/refresh',{method:'POST',headers:{Cookie:`paroisse_refresh=${raw}; paroisse_csrf=test-csrf`,'x-csrf-token':'test-csrf'}})).status).toBe(201);
    expect((await call('/auth/refresh',{method:'POST',headers:{Cookie:`paroisse_refresh=${raw}; paroisse_csrf=test-csrf`,'x-csrf-token':'test-csrf'}})).status).toBe(401);
    expect(await prisma.refreshToken.count({where:{family,revokedAt:null}})).toBe(0);
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

  it('protège les sessions et le changement de mot de passe du compte',async()=>{
    const member=await addUser(UserRole.SECRETAIRE_PRESENCE),other=await addUser(UserRole.SECRETAIRE_PRESENCE),token=jwt(member),currentRaw=randomBytes(32).toString('base64url'),otherRaw=randomBytes(32).toString('base64url'),currentHash=createHash('sha256').update(currentRaw).digest('hex');
    const current=await prisma.refreshToken.create({data:{userId:member.id,hashedToken:currentHash,expiresAt:new Date(Date.now()+86400000),family:randomUUID()}}),otherSession=await prisma.refreshToken.create({data:{userId:member.id,hashedToken:createHash('sha256').update(otherRaw).digest('hex'),expiresAt:new Date(Date.now()+86400000),family:randomUUID()}});
    const listed=await call('/auth/account/sessions',{token,headers:{Cookie:`paroisse_refresh=${currentRaw}`}});expect(listed.status).toBe(200);expect(listed.body).toHaveLength(2);expect(listed.body.find((row:any)=>row.id===current.id).isCurrent).toBe(true);expect(JSON.stringify(listed.body)).not.toContain(currentHash);expect(JSON.stringify(listed.body)).not.toContain(currentRaw);
    expect((await call(`/auth/account/sessions/${otherSession.id}`,{method:'DELETE',token:jwt(other)})).status).toBe(403);
    expect((await call(`/auth/account/sessions/${otherSession.id}`,{method:'DELETE',token})).status).toBe(200);
    expect((await prisma.refreshToken.findUniqueOrThrow({where:{id:otherSession.id}})).revokedAt).toBeTruthy();
    const passwordChange=await call('/auth/account/password',{method:'POST',token,headers:{Cookie:`paroisse_refresh=${currentRaw}; paroisse_csrf=test-csrf`,'x-csrf-token':'test-csrf'},body:{currentPassword:password,newPassword:'New_Strong_Password_2026!',confirmPassword:'New_Strong_Password_2026!'}});expect(passwordChange.status).toBe(201);
    expect((await prisma.refreshToken.findUniqueOrThrow({where:{id:current.id}})).revokedAt).toBeNull();
    expect((await call('/auth/login',{method:'POST',body:{email:member.email,password}})).status).toBe(401);
    expect((await call('/auth/login',{method:'POST',body:{email:member.email,password:'New_Strong_Password_2026!'}})).status).toBe(201);
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
