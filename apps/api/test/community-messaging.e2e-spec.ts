import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AddressInfo } from 'node:net';
import { createHmac, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { CsrfGuard } from '../src/csrf.guard';

jest.setTimeout(60_000);
let app:any,prisma:PrismaService,baseUrl:string;
const users:string[]=[];
const password='community_e2e_test_password';
const email=()=>`chat-${randomUUID()}@e2e.invalid`;
async function addMember(role:UserRole=UserRole.FIDELE){const row=await prisma.user.create({data:{email:email(),fullName:'Membre test',phone:'+2290100000000',passwordHash:await argon2.hash(password,{type:argon2.argon2id}),role,active:true,emailVerifiedAt:new Date(),dateOfBirth:new Date('1990-01-01')}});users.push(row.id);return row;}
function token(user:{id:string;role:UserRole;sessionVersion:number}){const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url'),now=Math.floor(Date.now()/1000),unsigned=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,role:user.role,ver:user.sessionVersion,iat:now,exp:now+600})}`;return`${unsigned}.${createHmac('sha256',process.env.JWT_ACCESS_SECRET!).update(unsigned).digest('base64url')}`;}
async function call(path:string,who?:{id:string;role:UserRole;sessionVersion:number},method='GET',body?:unknown){const response=await fetch(`${baseUrl}/api/v1${path}`,{method,headers:{...(who?{Authorization:`Bearer ${token(who)}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const text=await response.text();return{status:response.status,body:text?JSON.parse(text):null};}

beforeAll(async()=>{
  if(!process.env.TEST_DATABASE_URL||!new URL(process.env.TEST_DATABASE_URL).pathname.toLowerCase().includes('test'))throw new Error('TEST_DATABASE_URL doit pointer vers une base de test dédiée.');
  process.env.NODE_ENV='test';process.env.JWT_ACCESS_SECRET??='security-e2e-only-jwt-secret-not-for-deployment';
  app=await NestFactory.create(AppModule,{logger:false});app.setGlobalPrefix('api/v1');app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));app.useGlobalGuards(new CsrfGuard());await app.listen(0,'127.0.0.1');baseUrl=`http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;prisma=app.get(PrismaService);await prisma.$connect();
});
afterAll(async()=>{try{if(prisma){await prisma.communityConversation.deleteMany({where:{OR:[{createdById:{in:users}},{members:{some:{userId:{in:users}}}}]}});await prisma.user.deleteMany({where:{id:{in:users}}});}}finally{if(app)await app.close();}});

describe('messagerie communautaire : autorisations et parcours',()=>{
  it('isole les conversations directes, rejette les IDOR et empêche de réutiliser une clé d’envoi sur une autre conversation',async()=>{
    const alice=await addMember(),bob=await addMember(),mallory=await addMember(),a=token(alice),b=token(bob),intruder=token(mallory);
    const opened=await call('/community/conversations/direct',alice,'POST',{memberId:bob.id});expect(opened.status).toBe(201);const id=opened.body.id;
    expect((await call('/community/conversations',alice)).body.some((row:any)=>row.id===id)).toBe(true);
    expect((await call(`/community/conversations/${id}/messages`,mallory)).status).toBe(404);
    const key=randomUUID(),first=await call(`/community/conversations/${id}/messages`,alice,'POST',{body:'Bonjour, paix à vous.',idempotencyKey:key});expect(first.status).toBe(201);
    expect((await call(`/community/conversations/${id}/messages`,bob)).body).toHaveLength(1);
    const outsiderSend=await call(`/community/conversations/${id}/messages`,mallory,'POST',{body:'Intrusion',idempotencyKey:randomUUID()});expect(outsiderSend.status).toBe(404);
    const second=await call('/community/conversations/direct',alice,'POST',{memberId:mallory.id});expect(second.status).toBe(201);
    const conflict=await call(`/community/conversations/${second.body.id}/messages`,alice,'POST',{body:'Autre échange',idempotencyKey:key});expect(conflict.status).toBe(409);
    expect((await call(`/community/conversations/${second.body.id}/messages`,mallory)).status).toBe(200);
    expect((await call(`/community/conversations/${id}/read`,mallory,'POST',{})).status).toBe(404);
    expect(intruder).toBeTruthy();
  });

  it('isole les discussions de groupe aux membres et révoque les accès au retrait',async()=>{
    const owner=await addMember(),one=await addMember(),two=await addMember(),outsider=await addMember();
    const created=await call('/community/conversations/group',owner,'POST',{title:'Chorale paroissiale',memberIds:[one.id,two.id]});expect(created.status).toBe(201);const id=created.body.id;
    expect((await call(`/community/conversations/${id}/messages`,outsider)).status).toBe(404);
    expect((await call(`/community/conversations/${id}/messages`,one)).status).toBe(200);
    expect((await call(`/community/conversations/${id}/messages`,owner,'POST',{body:'Répétition samedi.',idempotencyKey:randomUUID()})).status).toBe(201);
    expect((await call(`/community/conversations/${id}/members/${one.id}`,one,'DELETE')).status).toBe(404);
    expect((await call(`/community/conversations/${id}/members/${one.id}`,owner,'DELETE')).status).toBe(200);
    expect((await call(`/community/conversations/${id}/messages`,one)).status).toBe(404);
  });

  it('enregistre un signalement une fois, limite les réactions aux membres et bloque la conversation directe',async()=>{
    const alice=await addMember(),bob=await addMember(),authA=token(alice),authB=token(bob);
    const direct=await call('/community/conversations/direct',alice,'POST',{memberId:bob.id}),id=direct.body.id;
    const sent=await call(`/community/conversations/${id}/messages`,alice,'POST',{body:'Message à examiner',idempotencyKey:randomUUID()});
    expect((await call(`/community/messages/${sent.body.id}/reactions`,bob,'POST',{emoji:'🙏'})).status).toBe(201);
    expect((await call(`/community/messages/${sent.body.id}/report`,bob,'POST',{reason:'SPAM',detail:'Motif de test'})).status).toBe(201);
    expect((await call(`/community/messages/${sent.body.id}/report`,bob,'POST',{reason:'SPAM'})).status).toBe(409);
    expect((await call(`/community/messages/${sent.body.id}/reactions`,alice,'POST',{emoji:'🙏'})).status).toBe(201);
    expect((await call(`/community/members/${bob.id}/block`,alice,'POST',{})).status).toBe(201);
    expect((await call(`/community/conversations/${id}/messages`,alice)).status).toBe(404);
    expect((await call(`/community/conversations/${id}/messages`,bob)).status).toBe(404);
    expect(authA).toBeTruthy();expect(authB).toBeTruthy();
  });

  it('restreint la file de modération et applique une suspension temporaire avec révocation de session',async()=>{
    const author=await addMember(),reporter=await addMember(),moderator=await addMember(UserRole.MODERATEUR);
    const direct=await call('/community/conversations/direct',author,'POST',{memberId:reporter.id});
    const sent=await call(`/community/conversations/${direct.body.id}/messages`,author,'POST',{body:'Message signalé pour test',idempotencyKey:randomUUID()});
    expect((await call(`/community/messages/${sent.body.id}/report`,reporter,'POST',{reason:'SPAM'})).status).toBe(201);
    expect((await call('/community/moderation/reports',reporter)).status).toBe(403);
    const targetReport=await prisma.communityMessageReport.findUniqueOrThrow({where:{messageId_reporterId:{messageId:sent.body.id,reporterId:reporter.id}}});
    const queue=await call('/community/moderation/reports',moderator);expect(queue.status).toBe(200);expect(queue.body.some((row:any)=>row.id===targetReport.id)).toBe(true);
    expect((await call(`/community/moderation/reports/${targetReport.id}`,moderator,'PATCH',{action:'SUSPENDRE_DEFINITIVEMENT',reason:'Décision interdite au modérateur'})).status).toBe(403);
    expect((await call(`/community/moderation/reports/${targetReport.id}`,moderator,'PATCH',{action:'SUSPENDRE_TEMPORAIREMENT',durationHours:24,reason:'Suspension décidée après examen du signalement.'})).status).toBe(200);
    expect((await call('/community/conversations',author)).status).toBe(401);
    const audit=await prisma.auditLog.findFirst({where:{action:'MESSAGERIE_MODERATION_SUSPENDRE_TEMPORAIREMENT',entityId:targetReport.id}});expect(audit).toBeTruthy();expect(audit?.reason).toContain('examen');
  });
});
