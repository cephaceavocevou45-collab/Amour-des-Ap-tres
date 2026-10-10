import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AddressInfo } from 'node:net';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { UserRole } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { CsrfGuard } from '../src/csrf.guard';
import { SocialAccountsService } from '../src/social-accounts';
import { CommunityMessagingService } from '../src/community-messaging';
import { RateLimitGuard } from '../src/rate-limit.guard';

jest.setTimeout(60_000);
let app:any,prisma:PrismaService,baseUrl:string;
const users:string[]=[];
const password='community_e2e_test_password';
const email=()=>`chat-${randomUUID()}@e2e.invalid`;
async function addMember(role:UserRole=UserRole.FIDELE,dateOfBirth:Date=new Date('1990-01-01')){const row=await prisma.user.create({data:{email:email(),fullName:'Membre test',phone:'+2290100000000',passwordHash:await argon2.hash(password,{type:argon2.argon2id}),role,active:true,assignedDayOfWeek:role===UserRole.RESPONSABLE_SEMAINE?1:null,emailVerifiedAt:new Date(),dateOfBirth}});users.push(row.id);return row;}
function token(user:{id:string;role:UserRole;sessionVersion:number}){const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url'),now=Math.floor(Date.now()/1000),unsigned=`${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:user.id,role:user.role,ver:user.sessionVersion,iat:now,exp:now+600})}`;return`${unsigned}.${createHmac('sha256',process.env.JWT_ACCESS_SECRET!).update(unsigned).digest('base64url')}`;}
async function call(path:string,who?:{id:string;role:UserRole;sessionVersion:number},method='GET',body?:unknown){const response=await fetch(`${baseUrl}/api/v1${path}`,{method,headers:{...(who?{Authorization:`Bearer ${token(who)}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const text=await response.text();return{status:response.status,body:text?JSON.parse(text):null};}

beforeAll(async()=>{
  if(!process.env.TEST_DATABASE_URL||!new URL(process.env.TEST_DATABASE_URL).pathname.toLowerCase().includes('test'))throw new Error('TEST_DATABASE_URL doit pointer vers une base de test dédiée.');
  process.env.NODE_ENV='test';process.env.JWT_ACCESS_SECRET??='security-e2e-only-jwt-secret-not-for-deployment';
  app=await NestFactory.create(AppModule,{logger:['error']});app.setGlobalPrefix('api/v1');app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true}));app.useGlobalGuards(new CsrfGuard());await app.listen(0,'127.0.0.1');baseUrl=`http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;prisma=app.get(PrismaService);await prisma.$connect();
});
afterAll(async()=>{try{if(prisma){await prisma.communityConversation.deleteMany({where:{OR:[{createdById:{in:users}},{members:{some:{userId:{in:users}}}}]}});await prisma.user.deleteMany({where:{id:{in:users}}});}}finally{if(app)await app.close();}});
beforeEach(()=>{(app.get(RateLimitGuard) as any).buckets.clear();});

describe('messagerie communautaire : autorisations et parcours',()=>{
  it('rend les membres actifs trouvables par nom sans exposer leurs coordonnées',async()=>{
    const viewer=await addMember(),visible=await addMember(UserRole.FIDELE,new Date('1992-04-03')),minor=await addMember(UserRole.FIDELE,new Date(Date.now()-15*365.25*86400_000));
    await prisma.user.update({where:{id:visible.id},data:{fullName:'Nom Annuaire Vérifié'}});
    await prisma.user.update({where:{id:minor.id},data:{fullName:'Nom Mineur Caché'}});
    const rows=await call(`/community/members?q=${encodeURIComponent('Nom Annuaire Vérifié')}`,viewer);
    expect(rows.status).toBe(200);expect(rows.body).toEqual(expect.arrayContaining([expect.objectContaining({id:visible.id,displayName:'Nom Annuaire Vérifié'})]));
    expect(JSON.stringify(rows.body)).not.toContain(visible.email);expect(JSON.stringify(rows.body)).not.toContain(visible.phone);expect(JSON.stringify(rows.body)).not.toContain('dateOfBirth');
    const minorRows=await call(`/community/members?q=${encodeURIComponent('Nom Mineur Caché')}`,viewer);
    expect(minorRows.body).toEqual(expect.arrayContaining([expect.objectContaining({id:minor.id,displayName:'Membre paroissial'})]));expect(JSON.stringify(minorRows.body)).not.toContain('Nom Mineur Caché');
  });

  it('isole les conversations directes, rejette les IDOR et empêche de réutiliser une clé d’envoi sur une autre conversation',async()=>{
    const alice=await addMember(UserRole.RESPONSABLE_SEMAINE),bob=await addMember(),mallory=await addMember(),a=token(alice),b=token(bob),intruder=token(mallory);
    const opened=await call('/community/conversations/direct',alice,'POST',{memberId:bob.id});expect(opened.status).toBe(201);const id=opened.body.id;
    expect((await call('/community/conversations',alice)).body.some((row:any)=>row.id===id)).toBe(true);
    expect((await call(`/community/conversations/${id}/messages`,mallory)).status).toBe(404);
    const key=randomUUID(),first=await call(`/community/conversations/${id}/messages`,alice,'POST',{body:'Bonjour, paix à vous.',idempotencyKey:key});expect(first.status).toBe(201);
    expect((await call(`/community/conversations/${id}/messages`,bob)).body).toHaveLength(1);
    const bobAfterReconnect=await prisma.user.findUniqueOrThrow({where:{id:bob.id},select:{id:true,role:true,sessionVersion:true}});
    expect((await call('/community/conversations',bobAfterReconnect)).body.some((row:any)=>row.id===id)).toBe(true);
    expect((await call(`/community/conversations/${id}/messages`,bobAfterReconnect)).body[0].body).toBe('Bonjour, paix à vous.');
    const outsiderSend=await call(`/community/conversations/${id}/messages`,mallory,'POST',{body:'Intrusion',idempotencyKey:randomUUID()});expect(outsiderSend.status).toBe(404);
    const second=await call('/community/conversations/direct',alice,'POST',{memberId:mallory.id});expect(second.status).toBe(201);
    const conflict=await call(`/community/conversations/${second.body.id}/messages`,alice,'POST',{body:'Autre échange',idempotencyKey:key});expect(conflict.status).toBe(409);
    expect((await call(`/community/conversations/${second.body.id}/messages`,mallory)).status).toBe(200);
    expect((await call(`/community/conversations/${second.body.id}/messages`,bob)).status).toBe(404);
    expect((await call('/community/conversations',bob)).body.some((row:any)=>row.id===second.body.id)).toBe(false);
    expect((await call(`/community/conversations/${id}/read`,mallory,'POST',{})).status).toBe(404);
    expect(intruder).toBeTruthy();
  });

  it('isole les discussions de groupe aux membres et révoque les accès au retrait',async()=>{
    const owner=await addMember(),one=await addMember(),two=await addMember(),outsider=await addMember();
    await prisma.user.update({where:{id:owner.id},data:{permissions:['CREER_GROUPE']}});
    const created=await call('/community/conversations/group',owner,'POST',{title:'Chorale paroissiale',memberIds:[one.id,two.id]});expect(created.status).toBe(201);const id=created.body.id;expect(created.body.inviteCode).toMatch(/^[A-Z0-9_-]{8}$/);expect(created.body).not.toHaveProperty('joinCodeHash');const storedCode=await prisma.communityConversation.findUniqueOrThrow({where:{id},select:{joinCodeHash:true}});expect(storedCode.joinCodeHash).toBe(createHash('sha256').update(created.body.inviteCode).digest('hex'));
    expect((await call(`/community/conversations/${id}/messages`,outsider)).status).toBe(404);
    expect((await call(`/community/conversations/${id}/messages`,one)).status).toBe(200);
    expect((await call(`/community/conversations/${id}/messages`,owner,'POST',{body:'Répétition samedi.',idempotencyKey:randomUUID()})).status).toBe(201);
    expect((await call(`/community/conversations/${id}/members/${one.id}`,one,'DELETE')).status).toBe(404);
    expect((await call(`/community/conversations/${id}/members/${one.id}`,owner,'DELETE')).status).toBe(200);
    expect((await call(`/community/conversations/${id}/messages`,one)).status).toBe(404);
    const newcomer=await addMember();const joined=await call('/community/groups/join',newcomer,'POST',{code:created.body.inviteCode});expect(joined.status).toBe(201);expect((await call(`/community/conversations/${id}/messages`,newcomer)).status).toBe(200);const minor=await addMember(UserRole.FIDELE,new Date(Date.now()-15*365.25*86400_000));expect((await call('/community/groups/join',minor,'POST',{code:created.body.inviteCode})).status).toBe(403);expect((await call('/community/groups/join',outsider,'POST',{code:'INVALID1'})).status).toBe(404);
  });

  it('publie un annuaire adulte, traite les demandes de groupe et contrôle les rôles et les codes',async()=>{
    const owner=await addMember(),applicant=await addMember(),refused=await addMember(),cancelled=await addMember(),outsider=await addMember();
    await prisma.user.update({where:{id:owner.id},data:{permissions:['CREER_GROUPE']}});
    const open=await call('/community/conversations/group',owner,'POST',{title:'Chorale ouverte',visibility:'OPEN_REQUEST',description:'Répétitions et annonces.',rules:'Respect et ponctualité.'});expect(open.status).toBe(201);const groupId=open.body.id;
    expect((await call('/community/groups',applicant)).body).toEqual(expect.arrayContaining([expect.objectContaining({id:groupId,visibility:'OPEN_REQUEST',memberCount:1,isMember:false})]));
    expect((await call(`/community/groups/${groupId}/requests`,outsider)).status).toBe(404);
    expect((await call(`/community/groups/${groupId}/requests`,applicant,'POST',{note:'Je souhaite rejoindre la chorale.'})).status).toBe(201);
    expect((await call(`/community/groups/${groupId}/requests`,applicant,'POST',{})).status).toBe(409);
    const pending=await call(`/community/groups/${groupId}/requests`,owner);expect(pending.status).toBe(200);expect(pending.body).toHaveLength(1);const requestId=pending.body[0].id;
    expect((await call(`/community/groups/${groupId}/requests/${requestId}`,outsider,'PATCH',{action:'ACCEPT'})).status).toBe(404);
    expect((await call(`/community/groups/${groupId}/requests/${requestId}`,owner,'PATCH',{action:'ACCEPT'})).status).toBe(200);
    expect((await call(`/community/conversations/${groupId}/messages`,applicant)).status).toBe(200);
    expect((await call(`/community/groups/${groupId}/members/${applicant.id}/role`,owner,'PATCH',{role:'ADMIN_GROUPE'})).status).toBe(200);
    expect((await call(`/community/groups/${groupId}/members/${refused.id}/role`,applicant,'PATCH',{role:'ADMIN_GROUPE'})).status).toBe(403);
    expect((await call(`/community/groups/${groupId}`,applicant,'PATCH',{title:'Nouvelle chorale'})).status).toBe(200);
    expect((await call(`/community/conversations/${groupId}/members/${applicant.id}`,owner,'DELETE')).status).toBe(200);
    expect((await call(`/community/conversations/${groupId}/messages`,applicant)).status).toBe(404);
    expect((await call(`/community/groups/${groupId}/leave`,owner,'DELETE')).status).toBe(409);
    expect((await call(`/community/groups/${groupId}/transfer/${applicant.id}`,owner,'POST',{})).status).toBe(404);

    const second=await addMember();expect((await call(`/community/groups/${groupId}/requests`,refused,'POST',{})).status).toBe(201);const secondPending=await call(`/community/groups/${groupId}/requests`,owner);const refusedId=secondPending.body.find((row:any)=>row.requester.id===refused.id).id;expect((await call(`/community/groups/${groupId}/requests/${refusedId}`,owner,'PATCH',{action:'REFUSE'})).status).toBe(200);
    expect((await call(`/community/groups/${groupId}/requests`,cancelled,'POST',{})).status).toBe(201);expect((await call(`/community/groups/${groupId}/requests`,cancelled,'DELETE')).status).toBe(200);
    expect((await call(`/community/groups/${groupId}/requests`,second,'POST',{})).status).toBe(201);const nextPending=await call(`/community/groups/${groupId}/requests`,owner);const nextId=nextPending.body.find((row:any)=>row.requester.id===second.id).id;expect((await call(`/community/groups/${groupId}/requests/${nextId}`,owner,'PATCH',{action:'ACCEPT'})).status).toBe(200);expect((await call(`/community/groups/${groupId}/transfer/${second.id}`,owner,'POST',{})).status).toBe(201);expect((await prisma.communityConversationMember.findUniqueOrThrow({where:{conversationId_userId:{conversationId:groupId,userId:second.id}}})).groupRole).toBe('CREATOR');expect((await call(`/community/groups/${groupId}/requests`,owner)).status).toBe(404);

    const privateGroup=await call('/community/conversations/group',owner,'POST',{title:'Groupe privé de test',visibility:'PRIVATE_CODE'});expect(privateGroup.status).toBe(201);expect((await call('/community/groups',outsider)).body.some((row:any)=>row.id===privateGroup.body.id)).toBe(false);
    const replacement=await call(`/community/groups/${privateGroup.body.id}/invite-code`,owner,'POST',{});expect(replacement.status).toBe(201);expect(replacement.body.inviteCode).not.toBe(privateGroup.body.inviteCode);expect((await call('/community/groups/join',second,'POST',{code:privateGroup.body.inviteCode})).status).toBe(404);
    expect((await call(`/community/groups/${privateGroup.body.id}/invite-code`,outsider,'DELETE')).status).toBe(404);expect((await call(`/community/groups/${privateGroup.body.id}/invite-code`,owner,'DELETE')).status).toBe(200);expect((await call('/community/groups/join',second,'POST',{code:replacement.body.inviteCode})).status).toBe(404);
    const audits=await prisma.auditLog.count({where:{userId:owner.id,action:{in:['GROUPE_DEMANDE_ACCEPTED','GROUPE_DEMANDE_REFUSED','GROUPE_CODE_REGENERE','GROUPE_CODE_REVOQUE','GROUPE_CREATEUR_TRANSFERE']}}});expect(audits).toBe(6);
  });

  it('enregistre un signalement une fois, limite les réactions aux membres et bloque la conversation directe',async()=>{
    const alice=await addMember(UserRole.RESPONSABLE_SEMAINE),bob=await addMember(),authA=token(alice),authB=token(bob);
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
    const author=await addMember(UserRole.RESPONSABLE_SEMAINE),reporter=await addMember(),moderator=await addMember(UserRole.MODERATEUR);
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

  it('autorise les échanges directs entre adultes et refuse les échanges ou groupes entre tranches d’âge différentes',async()=>{
    const adult=await addMember(),leader=await addMember(UserRole.RESPONSABLE_SEMAINE),minor=await addMember(UserRole.FIDELE,new Date(Date.now()-15*365.25*86400_000)),minorPeer=await addMember(UserRole.FIDELE,new Date(Date.now()-16*365.25*86400_000)),adultPeer=await addMember();
    await prisma.user.update({where:{id:adult.id},data:{permissions:['CREER_GROUPE']}});
    expect((await call('/community/conversations/direct',adult,'POST',{memberId:minor.id})).status).toBe(404);
    expect((await call('/community/conversations/direct',minor,'POST',{memberId:adult.id})).status).toBe(404);
    expect((await call('/community/conversations/direct',leader,'POST',{memberId:minor.id})).status).toBe(404);
    expect((await call('/community/conversations/group',adult,'POST',{title:'Groupe mixte',memberIds:[minor.id,adultPeer.id]})).status).toBe(403);
    expect((await call('/community/conversations/direct',adult,'POST',{memberId:adultPeer.id})).status).toBe(201);
    const group=await call('/community/conversations/group',adult,'POST',{title:'Groupe adulte',memberIds:[adultPeer.id,leader.id]});expect(group.status).toBe(201);
    expect((await call('/community/conversations/direct',adult,'POST',{memberId:adultPeer.id})).status).toBe(201);
    expect((await call('/community/conversations/direct',leader,'POST',{memberId:adult.id})).status).toBe(201);
    const minorGroup=await call('/community/conversations/group',minor,'POST',{title:'Groupe de jeunes',memberIds:[minorPeer.id,(await addMember(UserRole.FIDELE,new Date(Date.now()-17*365.25*86400_000))).id]});expect(minorGroup.status).toBe(403);
  });

  it('publie des stories textuelles 24 heures et filtre par tranche d’âge, blocage et compte actif',async()=>{
    const author=await addMember(),peer=await addMember(),minor=await addMember(UserRole.FIDELE,new Date(Date.now()-15*365.25*86400_000)),admin=await addMember(UserRole.ADMIN);
    const created=await call('/community/stories',author,'POST',{body:'Pensée de la paroisse <script>alert(1)</script>'});expect(created.status).toBe(201);expect(created.body.author.displayName).toBe('Membre test');expect(Date.parse(created.body.expiresAt)-Date.parse(created.body.createdAt)).toBeGreaterThanOrEqual(24*3600_000-1000);
    const visible=await call('/community/stories',peer);expect(visible.status).toBe(200);expect(visible.body.some((row:any)=>row.id===created.body.id&&row.body.includes('<script>'))).toBe(true);expect((await call('/community/stories',minor)).body.some((row:any)=>row.id===created.body.id)).toBe(false);
    const adminList=await call('/community/stories',admin);expect(adminList.body.some((row:any)=>row.id===created.body.id)).toBe(true);expect(await prisma.auditLog.findFirst({where:{userId:admin.id,action:'COMMUNAUTE_STORIES_ADMIN_CONSULTEES'}})).toBeTruthy();
    await prisma.communityStory.update({where:{id:created.body.id},data:{expiresAt:new Date(Date.now()-1000)}});expect((await call('/community/stories',peer)).body.some((row:any)=>row.id===created.body.id)).toBe(false);await app.get(CommunityMessagingService).purgeStoriesAndLiveSignals();expect(await prisma.communityStory.findUnique({where:{id:created.body.id}})).toBeNull();
    for(let i=0;i<10;i++)expect((await call('/community/stories',author,'POST',{body:`Story ${i}`})).status).toBe(201);expect((await call('/community/stories',author,'POST',{body:'Trop de stories'})).status).toBe(429);
  });

  it('restreint les signalements de stories et audite leur masquage par un modérateur',async()=>{
    const author=await addMember(),reporter=await addMember(),moderator=await addMember(UserRole.MODERATEUR);
    const created=await call('/community/stories',author,'POST',{body:'Story à examiner'});expect(created.status).toBe(201);
    expect((await call(`/community/stories/${created.body.id}/report`,reporter,'POST',{reason:'SPAM',detail:'Contenu indésirable'})).status).toBe(201);
    expect((await call(`/community/stories/${created.body.id}/report`,reporter,'POST',{reason:'SPAM'})).status).toBe(409);
    expect((await call('/community/moderation/stories',reporter)).status).toBe(403);
    const queue=await call('/community/moderation/stories',moderator);expect(queue.status).toBe(200);expect(queue.body).toEqual(expect.arrayContaining([expect.objectContaining({story:expect.objectContaining({id:created.body.id})})]));
    const reportId=queue.body.find((row:any)=>row.story.id===created.body.id).id;
    expect((await call(`/community/moderation/stories/${reportId}`,moderator,'PATCH',{action:'MASQUER',durationHours:48,reason:'Masquage provisoire après examen.'})).status).toBe(200);
    expect((await call('/community/stories',reporter)).body.some((row:any)=>row.id===created.body.id)).toBe(false);
    expect(await prisma.auditLog.findFirst({where:{action:'COMMUNAUTE_STORY_MODERATION_MASQUER',entityId:reportId,reason:'Masquage provisoire après examen.'}})).toBeTruthy();
  });

  it('protège les directs WebRTC par compte, tranche d’âge et capacité, puis ferme les sessions',async()=>{
    const host=await addMember(),viewer=await addMember(),minor=await addMember(UserRole.FIDELE,new Date(Date.now()-15*365.25*86400_000)),admin=await addMember(UserRole.ADMIN);
    expect((await call('/community/lives',host,'POST',{title:'Direct sans autorisation'})).status).toBe(403);
    await prisma.user.update({where:{id:host.id},data:{permissions:['LANCER_LIVE']}});
    const started=await call('/community/lives',host,'POST',{title:'Culte paroissial en direct'});expect(started.status).toBe(201);expect(started.body.iceServers).toEqual(expect.arrayContaining([expect.objectContaining({urls:expect.anything()})]));const liveId=started.body.id;expect(await prisma.userNotification.count({where:{userId:viewer.id,message:{contains:'direct paroissial'}}})).toBe(1);const consumed=await call('/auth/notifications',viewer);expect(consumed.body.some((item:any)=>item.message.includes('direct paroissial'))).toBe(true);const persistedAnnouncement=await call('/community/lives/notifications',viewer);expect(persistedAnnouncement.status).toBe(200);expect(persistedAnnouncement.body).toHaveLength(1);
    expect((await call('/community/lives',viewer)).body.some((row:any)=>row.id===liveId)).toBe(true);expect((await call('/community/lives',minor)).body.some((row:any)=>row.id===liveId)).toBe(false);expect((await call('/community/lives',admin)).body.some((row:any)=>row.id===liveId)).toBe(true);
    expect((await call(`/community/lives/${liveId}/join`,minor,'POST',{})).status).toBe(404);
    const joined=await call(`/community/lives/${liveId}/join`,viewer,'POST',{});expect(joined.status).toBe(201);const joinSignal=await call(`/community/lives/${liveId}/signals`,host);expect(joinSignal.body.some((row:any)=>row.senderId===viewer.id&&row.kind==='JOIN')).toBe(true);
    expect((await call(`/community/lives/${liveId}/signals`,minor)).status).toBe(404);expect((await call(`/community/lives/${liveId}/signals`,admin)).status).toBe(403);
    expect((await call(`/community/lives/${liveId}/signals`,host,'POST',{targetId:viewer.id,kind:'OFFER',payload:JSON.stringify({type:'offer',sdp:'test'})})).status).toBe(201);
    expect((await call(`/community/lives/${liveId}/signals`,viewer,'POST',{targetId:host.id,kind:'ANSWER',payload:JSON.stringify({type:'answer',sdp:'test'})})).status).toBe(201);
    for(let i=0;i<3;i++){const next=await addMember();expect((await call(`/community/lives/${liveId}/join`,next,'POST',{})).status).toBe(201)}
    const full=await addMember();expect((await call(`/community/lives/${liveId}/join`,full,'POST',{})).status).toBe(409);
    expect((await call(`/community/lives/${liveId}/join`,admin,'POST',{})).status).toBe(403);expect((await call(`/community/lives/${liveId}`,host,'DELETE')).status).toBe(200);expect((await call(`/community/lives/${liveId}/signals`,viewer)).status).toBe(404);
  });

  it('refuse la création de groupe sans permission serveur et interdit aux mineurs de créer un groupe',async()=>{
    const ordinary=await addMember(),minor=await addMember(UserRole.FIDELE,new Date(Date.now()-16*365.25*86400_000)),peerA=await addMember(UserRole.FIDELE,new Date(Date.now()-15*365.25*86400_000)),peerB=await addMember(UserRole.FIDELE,new Date(Date.now()-17*365.25*86400_000));
    expect((await call('/community/conversations/group',ordinary,'POST',{title:'Groupe sans droit',memberIds:[peerA.id,peerB.id]})).status).toBe(403);
    await prisma.user.update({where:{id:minor.id},data:{permissions:['CREER_GROUPE']}});
    expect((await call('/community/conversations/group',minor,'POST',{title:'Groupe mineurs',memberIds:[peerA.id,peerB.id]})).status).toBe(403);
  });

  it('allows admin read-only oversight and logs every conversation content view',async()=>{
    const author=await addMember(),peer=await addMember(),admin=await addMember(UserRole.ADMIN);
    const direct=await call('/community/conversations/direct',author,'POST',{memberId:peer.id});expect(direct.status).toBe(201);const id=direct.body.id;
    const sent=await call(`/community/conversations/${id}/messages`,author,'POST',{body:'Confidential audit test message',idempotencyKey:randomUUID()});expect(sent.status).toBe(201);
    const list=await call('/community/admin/conversations',admin);expect(list.status).toBe(200);expect(list.body.some((row:any)=>row.id===id)).toBe(true);
    const messages=await call(`/community/admin/conversations/${id}/messages`,admin);expect(messages.status).toBe(200);expect(messages.body[0].body).toBe('Confidential audit test message');
    expect((await call(`/community/conversations/${id}/messages`,admin)).status).toBe(403);
    expect((await call(`/community/conversations/${id}/messages`,admin,'POST',{body:'Admin cannot send',idempotencyKey:randomUUID()})).status).toBe(403);
    const audits=await prisma.auditLog.findMany({where:{userId:admin.id,action:{in:['MESSAGERIE_ADMIN_LISTE_CONSULTEE','MESSAGERIE_ADMIN_CONTENU_CONSULTE']}}});expect(audits.map(row=>row.action).sort()).toEqual(['MESSAGERIE_ADMIN_CONTENU_CONSULTE','MESSAGERIE_ADMIN_LISTE_CONSULTEE']);expect(JSON.stringify(audits)).not.toContain('Confidential audit test message');
  });
  it('limite la consultation de modération aux signalements, fournit dix messages maximum et journalise sans contenu',async()=>{
    const author=await addMember(UserRole.RESPONSABLE_SEMAINE),reporter=await addMember(),moderator=await addMember(UserRole.MODERATEUR),admin=await addMember(UserRole.ADMIN);
    const direct=await call('/community/conversations/direct',author,'POST',{memberId:reporter.id});expect(direct.status).toBe(201);const conversationId=direct.body.id;
    const messages:any[]=[];for(let index=0;index<14;index++){const body=index===6?`message-secret-${randomUUID()}`:`message de contexte ${index}`;const sent=await call(`/community/conversations/${conversationId}/messages`,author,'POST',{body,idempotencyKey:randomUUID()});if(sent.status!==201)throw new Error(`context-message-${index}: ${JSON.stringify(sent.body)}`);expect(sent.status).toBe(201);messages.push(sent.body);}
    const reported=messages[6],reportDetail=`detail-secret-${randomUUID()}`;expect((await call(`/community/messages/${reported.id}/report`,reporter,'POST',{reason:'SPAM',detail:reportDetail})).status).toBe(201);
    for(const staff of [moderator,admin]){
      const queue=await call('/community/moderation/reports',staff);expect(queue.status).toBe(200);expect(queue.body.map((item:any)=>item.message.id)).toContain(reported.id);
      expect([403,404]).toContain((await call(`/community/conversations/${conversationId}/messages`,staff)).status);
      const context=await call(`/community/moderation/reports/${(await prisma.communityMessageReport.findUniqueOrThrow({where:{messageId_reporterId:{messageId:reported.id,reporterId:reporter.id}}})).id}/context`,staff);
      expect(context.status).toBe(200);expect(context.body.messages).toHaveLength(10);expect(context.body.messages.filter((message:any)=>message.reported).map((message:any)=>message.id)).toEqual([reported.id]);
    }
    const audit=await prisma.auditLog.findMany({where:{userId:{in:[author.id,reporter.id,moderator.id,admin.id]}}});const serialized=JSON.stringify(audit);
    expect(serialized).not.toContain(reported.body);expect(serialized).not.toContain(reportDetail);
    expect(await prisma.auditLog.count({where:{action:'MESSAGERIE_MODERATION_CONSULTATION_CONTEXTE',userId:moderator.id}})).toBe(1);
  });

  it('applique la rétention configurable et exporte les messages accessibles avant suppression du compte',async()=>{
    const member=await addMember(UserRole.RESPONSABLE_SEMAINE),peer=await addMember();const direct=await call('/community/conversations/direct',member,'POST',{memberId:peer.id});expect(direct.status).toBe(201);const id=direct.body.id;
    const old=await call(`/community/conversations/${id}/messages`,member,'POST',{body:'Message ancien à purger',idempotencyKey:randomUUID()});expect(old.status).toBe(201);
    const recent=await call(`/community/conversations/${id}/messages`,peer,'POST',{body:'Message récent conservé',idempotencyKey:randomUUID()});expect(recent.status).toBe(201);
    await prisma.communityMessage.update({where:{id:old.body.id},data:{createdAt:new Date(Date.now()-31*86400_000)}});
    process.env.COMMUNITY_MESSAGE_RETENTION_DAYS='30';const purged=await app.get(CommunityMessagingService).purgeExpiredMessages();delete process.env.COMMUNITY_MESSAGE_RETENTION_DAYS;
    expect(purged).toMatchObject({deletedCount:1,retentionDays:30});expect(await prisma.communityMessage.findUnique({where:{id:old.body.id}})).toBeNull();expect(await prisma.communityMessage.findUnique({where:{id:recent.body.id}})).not.toBeNull();
    const ownRecent=await call(`/community/conversations/${id}/messages`,member,'POST',{body:'Message personnel à effacer',idempotencyKey:randomUUID()});expect(ownRecent.status).toBe(201);
    const accounts=app.get(SocialAccountsService),exported=await accounts.exportData(member.id);expect(exported.conversationMessages.some((message:any)=>message.id===recent.body.id&&message.body==='Message récent conservé')).toBe(true);expect(exported.conversationMessages.some((message:any)=>message.id===ownRecent.body.id&&message.body==='Message personnel à effacer')).toBe(true);
    await accounts.requestDeletion(member.id,'Demande de fermeture de compte pour test');await prisma.user.update({where:{id:member.id},data:{deletionScheduledAt:new Date(Date.now()-1000)}});await accounts.processAccountDeletions();
    expect(await prisma.communityMessage.findUnique({where:{id:ownRecent.body.id}})).toBeNull();expect(await prisma.communityMessage.findUnique({where:{id:recent.body.id}})).not.toBeNull();expect(await prisma.user.findUnique({where:{id:member.id}})).toBeNull();
  });
});
