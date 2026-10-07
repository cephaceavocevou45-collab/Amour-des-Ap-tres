import { createHmac } from 'node:crypto';
import { SocialAccountsService } from './social-accounts';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';

const originalEnv={...process.env};
function configure(){process.env.SOCIAL_MIN_AGE='13';process.env.SOCIAL_CHARTER_VERSION='test-v1';process.env.SOCIAL_CHARTER_TEXT='Règles de test';process.env.RESEND_API_KEY='test-key-not-for-use';process.env.MAIL_FROM='Tests <test@example.invalid>';process.env.APP_PUBLIC_URL='http://localhost:4200';delete process.env.CAPTCHA_SECRET_KEY;}
function token(){const secret='test-jwt-secret-for-social-accounts-unit';process.env.JWT_ACCESS_SECRET=secret;const b64=(v:string)=>Buffer.from(v).toString('base64url'),head=b64(JSON.stringify({alg:'HS256',typ:'JWT'})),payload=b64(JSON.stringify({sub:'social-user',role:'FIDELE',ver:0,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600})),unsigned=`${head}.${payload}`;return `${unsigned}.${createHmac('sha256',secret).update(unsigned).digest('base64url')}`;}

describe('phase 1 social accounts',()=>{
  afterEach(()=>{process.env= {...originalEnv};jest.restoreAllMocks();});

  it('keeps signup disabled until age, approved charter, and mail settings are configured',async()=>{
    delete process.env.SOCIAL_MIN_AGE;delete process.env.SOCIAL_CHARTER_VERSION;delete process.env.SOCIAL_CHARTER_TEXT;
    const prisma={user:{findUnique:jest.fn().mockResolvedValue(null),create:jest.fn()}} as unknown as PrismaService;
    const service=new SocialAccountsService(prisma);
    expect(service.registrationConfig().enabled).toBe(false);
    await expect(service.register({fullName:'Applicant Name',phone:'+2290100000000',email:'a@example.org',password:'StrongPasswordForTest2026!',dateOfBirth:'1990-01-01',acceptCharter:true,charterVersion:'test-v1'} as any)).rejects.toMatchObject({status:503});
    expect((prisma as any).user.create).not.toHaveBeenCalled();
  });

  it('rejects an account below the configured minimum age before creating it',async()=>{
    configure();const prisma={user:{findUnique:jest.fn().mockResolvedValue(null),create:jest.fn()}} as unknown as PrismaService;
    await expect(new SocialAccountsService(prisma).register({fullName:'Young Applicant',phone:'+2290100000000',email:'young@example.org',password:'StrongPasswordForTest2026!',dateOfBirth:'2015-01-01',acceptCharter:true,charterVersion:'test-v1'} as any)).rejects.toMatchObject({status:400});
    expect((prisma as any).user.create).not.toHaveBeenCalled();
  });

  it('creates a non-active FIDELE account and emails only a one-time token whose hash is stored',async()=>{
    configure();const create=jest.fn().mockResolvedValue({id:'fid-1',email:'member@example.org',fullName:'New Member'}),tokenCreate=jest.fn();
    const prisma={user:{findUnique:jest.fn().mockResolvedValue(null),create},emailVerificationToken:{updateMany:jest.fn(),create:tokenCreate}} as unknown as PrismaService;
    const mail=jest.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}',{status:200}));
    const result=await new SocialAccountsService(prisma).register({fullName:'New Member',phone:'+2290100000000',email:'member@example.org',password:'StrongPasswordForTest2026!',dateOfBirth:'1990-02-03',acceptCharter:true,charterVersion:'test-v1',role:'ADMIN'} as any);
    expect(create).toHaveBeenCalledWith({data:expect.objectContaining({role:'FIDELE',active:false,emailVerifiedAt:null,charterVersion:'test-v1',charterAcceptedAt:expect.any(Date),dateOfBirth:expect.any(Date)})});
    expect(tokenCreate.mock.calls[0][0].data).toEqual(expect.objectContaining({userId:'fid-1',tokenHash:expect.stringMatching(/^[a-f0-9]{64}$/),expiresAt:expect.any(Date)}));
    expect(JSON.stringify(result)).not.toMatch(/[A-Za-z0-9_-]{43}/);expect(mail).toHaveBeenCalledTimes(1);
  });

  it('consumes email confirmation atomically, activates the account, and audits it',async()=>{
    const row={id:'verify-1',userId:'fid-1',usedAt:null,expiresAt:new Date(Date.now()+60_000),user:{role:'FIDELE'}};
    const tokenUpdate=jest.fn().mockResolvedValue({count:1}),userUpdate=jest.fn(),refreshUpdate=jest.fn(),auditCreate=jest.fn();
    const tx={emailVerificationToken:{updateMany:tokenUpdate},user:{update:userUpdate},refreshToken:{updateMany:refreshUpdate},auditLog:{create:auditCreate}};
    const prisma={emailVerificationToken:{findUnique:jest.fn().mockResolvedValue(row)},$transaction:jest.fn((fn:any)=>fn(tx))} as unknown as PrismaService;
    const result=await new SocialAccountsService(prisma).confirm('a'.repeat(43));
    expect(result.message).toContain('confirmée');expect(tokenUpdate).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:'verify-1',usedAt:null,expiresAt:{gt:expect.any(Date)}})}));
    expect(userUpdate).toHaveBeenCalledWith({where:{id:'fid-1'},data:expect.objectContaining({active:true,emailVerifiedAt:expect.any(Date),sessionVersion:{increment:1}})});
    expect(refreshUpdate).toHaveBeenCalled();expect(auditCreate).toHaveBeenCalledWith({data:expect.objectContaining({action:'EMAIL_CONFIRME'})});
  });

  it('refuses confirmation when another concurrent request already consumed the token',async()=>{
    const row={id:'verify-1',userId:'fid-1',usedAt:null,expiresAt:new Date(Date.now()+60_000),user:{role:'FIDELE'}};
    const userUpdate=jest.fn(),tx={emailVerificationToken:{updateMany:jest.fn().mockResolvedValue({count:0})},user:{update:userUpdate}};
    const prisma={emailVerificationToken:{findUnique:jest.fn().mockResolvedValue(row)},$transaction:jest.fn((fn:any)=>fn(tx))} as unknown as PrismaService;
    await expect(new SocialAccountsService(prisma).confirm('b'.repeat(43))).rejects.toMatchObject({status:400});expect(userUpdate).not.toHaveBeenCalled();
  });

  it('revokes all sessions and records the required reason on suspension',async()=>{
    const userUpdate=jest.fn(),refreshUpdate=jest.fn(),auditCreate=jest.fn();const tx={user:{update:userUpdate},refreshToken:{updateMany:refreshUpdate},auditLog:{create:auditCreate}};
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'fid-1',role:'FIDELE',suspendedAt:null,suspendedUntil:null})},$transaction:jest.fn((fn:any)=>fn(tx))} as unknown as PrismaService;
    await new SocialAccountsService(prisma).setSuspension('fid-1',true,'Motif de modération','', 'admin-1');
    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({suspendedAt:expect.any(Date),suspensionReason:'Motif de modération',sessionVersion:{increment:1}})}));
    expect(refreshUpdate).toHaveBeenCalledWith({where:{userId:'fid-1',revokedAt:null},data:{revokedAt:expect.any(Date)}});expect(auditCreate.mock.calls[0][0].data.reason).toBe('Motif de modération');
  });

  it('blocks unverified FIDELE sessions even when the access token remains valid',async()=>{
    const request={headers:{authorization:`Bearer ${token()}`}};const context={switchToHttp:()=>({getRequest:()=>request})} as any;
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'social-user',role:'FIDELE',active:true,sessionVersion:0,permissions:[],emailVerifiedAt:null,suspendedAt:null,suspendedUntil:null})}} as unknown as PrismaService;
    await expect(new JwtAuthGuard(prisma).canActivate(context)).rejects.toMatchObject({status:401});
  });

  it('blocks a suspended FIDELE session immediately even with a valid token',async()=>{
    const request={headers:{authorization:`Bearer ${token()}`}};const context={switchToHttp:()=>({getRequest:()=>request})} as any;
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'social-user',role:'FIDELE',active:true,sessionVersion:0,permissions:[],emailVerifiedAt:new Date(),suspendedAt:new Date(),suspendedUntil:null})}} as unknown as PrismaService;
    await expect(new JwtAuthGuard(prisma).canActivate(context)).rejects.toMatchObject({status:401});
  });
});
