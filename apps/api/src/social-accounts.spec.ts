import { createHmac } from 'node:crypto';
import { SocialAccountsService } from './social-accounts';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard } from './auth.guard';

const originalEnv={...process.env};
function configure(){process.env.SOCIAL_MIN_AGE='13';process.env.SOCIAL_CHARTER_VERSION='test-v1';process.env.SOCIAL_CHARTER_TEXT='Règles de test';process.env.RESEND_API_KEY='test-key-not-for-use';process.env.MAIL_FROM='Tests <test@example.invalid>';process.env.APP_PUBLIC_URL='http://localhost:4200';delete process.env.CAPTCHA_ENABLED;delete process.env.CAPTCHA_SECRET_KEY;delete process.env.CAPTCHA_SITE_KEY;}
function token(){const secret='test-jwt-secret-for-social-accounts-unit';process.env.JWT_ACCESS_SECRET=secret;const b64=(v:string)=>Buffer.from(v).toString('base64url'),head=b64(JSON.stringify({alg:'HS256',typ:'JWT'})),payload=b64(JSON.stringify({sub:'social-user',role:'FIDELE',ver:0,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600})),unsigned=`${head}.${payload}`;return `${unsigned}.${createHmac('sha256',secret).update(unsigned).digest('base64url')}`;}

describe('phase 1 social accounts',()=>{
  afterEach(()=>{process.env= {...originalEnv};jest.restoreAllMocks();});

  it('does not require email delivery configuration to allow faithful signup',()=>{
    delete process.env.CAPTCHA_ENABLED;delete process.env.CAPTCHA_SECRET_KEY;delete process.env.CAPTCHA_SITE_KEY;delete process.env.RESEND_API_KEY;delete process.env.MAIL_FROM;delete process.env.APP_PUBLIC_URL;
    const service=new SocialAccountsService({} as PrismaService);
    expect(service.registrationConfig().enabled).toBe(true);
    expect(service.registrationConfig().captchaEnabled).toBe(false);
    expect(service.registrationConfig().captchaMessage).toContain('désactivée par défaut');
    expect(service.registrationConfig().mailConfigured).toBe(false);
  });

  it('returns and updates only the signed-in member profile and audits without storing the biography in the audit log',async()=>{
    const profile={id:'fid-1',fullName:'Membre test',email:'member@example.org',phone:'+2290100000000',role:'FIDELE',socialBio:'Présentation'};
    const findFirst=jest.fn().mockResolvedValue(profile),update=jest.fn().mockResolvedValue({...profile,socialBio:'Nouvelle présentation'}),auditCreate=jest.fn();
    const prisma={user:{findFirst,update},auditLog:{create:auditCreate}} as unknown as PrismaService;const service=new SocialAccountsService(prisma);
    await expect(service.profile('fid-1')).resolves.toEqual(profile);
    await expect(service.updateProfile('fid-1',{socialBio:'  Nouvelle présentation  '})).resolves.toEqual({...profile,socialBio:'Nouvelle présentation'});
    expect(update).toHaveBeenCalledWith({where:{id:'fid-1'},data:{socialBio:'Nouvelle présentation'},select:expect.objectContaining({id:true,fullName:true,email:true,phone:true,role:true})});
    expect(auditCreate.mock.calls[0][0].data.after).toEqual({bioPresent:true});
    expect(JSON.stringify(auditCreate.mock.calls[0][0])).not.toContain('Nouvelle présentation');
  });

  it('rejects an account below the configured minimum age before creating it',async()=>{
    configure();const prisma={user:{findUnique:jest.fn().mockResolvedValue(null),create:jest.fn()}} as unknown as PrismaService;
    await expect(new SocialAccountsService(prisma).register({fullName:'Young Applicant',phone:'+2290100000000',email:'young@example.org',password:'StrongPasswordForTest2026!',dateOfBirth:'2015-01-01',acceptCharter:true,charterVersion:'test-v1'} as any)).rejects.toMatchObject({status:400});
    expect((prisma as any).user.create).not.toHaveBeenCalled();
  });

  it('creates an active FIDELE account without confirmation email and sends the correct welcome verse',async()=>{
    configure();const create=jest.fn().mockResolvedValue({id:'fid-1',email:'member@example.org',fullName:'New Member'}),notificationCreate=jest.fn().mockResolvedValue({id:'notice-1'});
    const prisma={user:{findUnique:jest.fn().mockResolvedValue(null),create},userNotification:{create:notificationCreate}} as unknown as PrismaService;
    const mail=jest.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}',{status:200}));
    const result=await new SocialAccountsService(prisma).register({fullName:'New Member',phone:'+2290100000000',email:'member@example.org',password:'StrongPasswordForTest2026!',dateOfBirth:'1990-02-03',acceptCharter:true,charterVersion:'test-v1',role:'ADMIN'} as any);
    expect(create).toHaveBeenCalledWith({data:expect.objectContaining({role:'FIDELE',active:true,emailVerifiedAt:null,charterVersion:'test-v1',charterAcceptedAt:expect.any(Date),dateOfBirth:expect.any(Date)})});
    expect(notificationCreate).toHaveBeenCalledWith({data:{userId:'fid-1',message:'Bienvenue à la paroisse Amour des Apôtres. « Ta parole est une lampe à mes pieds, et une lumière sur mon sentier. » — Psaume 119:105'}});
    expect(result.message).toBe('Votre compte fidèle est créé. Vous pouvez vous connecter sans confirmation par e-mail. Votre adresse e-mail servira à récupérer votre mot de passe en cas d’oubli.');expect(mail).not.toHaveBeenCalled();
  });

  it('revokes all sessions and records the required reason on suspension',async()=>{
    const userUpdate=jest.fn(),refreshUpdate=jest.fn(),auditCreate=jest.fn();const tx={user:{update:userUpdate},refreshToken:{updateMany:refreshUpdate},auditLog:{create:auditCreate}};
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'fid-1',role:'FIDELE',suspendedAt:null,suspendedUntil:null})},$transaction:jest.fn((fn:any)=>fn(tx))} as unknown as PrismaService;
    await new SocialAccountsService(prisma).setSuspension('fid-1',true,'Motif de modération','', 'admin-1');
    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({suspendedAt:expect.any(Date),suspensionReason:'Motif de modération',sessionVersion:{increment:1}})}));
    expect(refreshUpdate).toHaveBeenCalledWith({where:{userId:'fid-1',revokedAt:null},data:{revokedAt:expect.any(Date)}});expect(auditCreate.mock.calls[0][0].data.reason).toBe('Motif de modération');
  });

  it('allows an active FIDELE session without email confirmation',async()=>{
    const request={headers:{authorization:`Bearer ${token()}`}};const context={switchToHttp:()=>({getRequest:()=>request})} as any;
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'social-user',role:'FIDELE',active:true,sessionVersion:0,permissions:[],emailVerifiedAt:null,suspendedAt:null,suspendedUntil:null})}} as unknown as PrismaService;
    await expect(new JwtAuthGuard(prisma).canActivate(context)).resolves.toBe(true);
  });

  it('blocks a suspended FIDELE session immediately even with a valid token',async()=>{
    const request={headers:{authorization:`Bearer ${token()}`}};const context={switchToHttp:()=>({getRequest:()=>request})} as any;
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'social-user',role:'FIDELE',active:true,sessionVersion:0,permissions:[],emailVerifiedAt:new Date(),suspendedAt:new Date(),suspendedUntil:null})}} as unknown as PrismaService;
    await expect(new JwtAuthGuard(prisma).canActivate(context)).rejects.toMatchObject({status:401});
  });
});
