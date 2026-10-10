import { AuthController, AuthService } from './auth';
import { PrismaService } from './prisma.service';

describe('security-sensitive authentication flows',()=>{
  it('exposes registration only for attendance responsibilities',()=>{
    expect(AuthController.prototype).toHaveProperty('register');
    expect(AuthController.prototype).toHaveProperty('login');
  });

  it('stores an attendance responsibility request inactive and audits it without logging credentials',async()=>{
    const created={id:'pending-member',fullName:'Responsable Exemple',email:'responsable@example.invalid',role:'SECRETAIRE_PRESENCE',assignedDayOfWeek:null};
    const tx={user:{create:jest.fn().mockResolvedValue(created)},auditLog:{create:jest.fn().mockResolvedValue({})}};
    const prisma={$transaction:jest.fn((work:any)=>work(tx))} as unknown as PrismaService;
    const password='Un_mot_de_passe_fort_2026!';
    const result=await new AuthService(prisma).requestResponsibleAccount({fullName:created.fullName,email:created.email,phone:'+2290150000000',requestedRole:'SECRETAIRE_PRESENCE',password} as any);
    expect(result.message).toContain('validation');
    expect(tx.user.create).toHaveBeenCalledWith({data:expect.objectContaining({role:'SECRETAIRE_PRESENCE',active:false,assignedDayOfWeek:null})});
    expect(tx.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({action:'DEMANDE_ACCES_PRESENCES',entityId:created.id,after:{role:'SECRETAIRE_PRESENCE',assignedDayOfWeek:null}})});
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(password);
  });

  it('rejects a reused or expired email recovery code before changing the account',async()=>{
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'u1',role:'SECRETAIRE_PRESENCE',totpSecret:null,active:true})},passwordResetToken:{findMany:jest.fn().mockResolvedValue([])},$transaction:jest.fn()} as unknown as PrismaService;
    await expect(new AuthService(prisma).resetPassword({email:'member@example.invalid',code:'123456',password:'motDePasseNouveauTresFort2026!',confirmPassword:'motDePasseNouveauTresFort2026!'})).rejects.toMatchObject({status:400});
    expect(prisma.passwordResetToken.findMany).toHaveBeenCalledWith({where:expect.objectContaining({userId:'u1',usedAt:null,expiresAt:{gt:expect.any(Date)},failedAttempts:{lt:5}}),select:{id:true,tokenHash:true,failedAttempts:true}});
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns the same reset response when the account is absent or mail delivery fails',async()=>{
    const keys=['RESEND_API_KEY','MAIL_FROM'],previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
    Object.assign(process.env,{RESEND_API_KEY:'test-only',MAIL_FROM:'Test <test@example.invalid>',APP_PUBLIC_URL:'http://localhost'});
    const emailQuota={sendImmediate:jest.fn().mockResolvedValue(false)};
    try{
      const existingPrisma={user:{findUnique:jest.fn().mockResolvedValue({id:'u1',email:'known@example.invalid',fullName:'Test',role:'SECRETAIRE_PRESENCE',active:true})},passwordResetToken:{findFirst:jest.fn().mockResolvedValue(null),updateMany:jest.fn().mockResolvedValue({count:0}),create:jest.fn().mockResolvedValue({id:'r1'})}} as unknown as PrismaService;
      const unknownPrisma={user:{findUnique:jest.fn().mockResolvedValue(null)}} as unknown as PrismaService;
      const started=Date.now();
      const existing=await new AuthService(existingPrisma,emailQuota as any).requestPasswordReset('known@example.invalid');
      const unknown=await new AuthService(unknownPrisma).requestPasswordReset('unknown@example.invalid');
      expect(existing).toEqual(unknown);
      expect(existing.message).toContain('plafond quotidien');
      expect(existingPrisma.passwordResetToken.create).toHaveBeenCalledWith({data:expect.objectContaining({userId:'u1',expiresAt:expect.any(Date),failedAttempts:0,tokenHash:expect.any(String)})});
      expect(existingPrisma.passwordResetToken.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({where:{id:'r1',usedAt:null},data:{usedAt:expect.any(Date)}}));
      expect(Date.now()-started).toBeGreaterThanOrEqual(990);
    }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
  });

  it('does not expose HTTP 2FA enrollment endpoints',()=>{
    expect(AuthController.prototype).not.toHaveProperty('setup');
    expect(AuthController.prototype).not.toHaveProperty('newSecret');
    expect(AuthController.prototype).toHaveProperty('recoveryCodes');
  });

  it('creates responsible accounts with a one-time temporary password and an audit record',async()=>{
    const row={id:'member-1',fullName:'Responsable Test',email:'responsable@example.invalid',phone:null,role:'SECRETAIRE_PRESENCE',active:true,permissions:[],assignedDayOfWeek:null,mustChangePassword:true};
    const tx={user:{create:jest.fn().mockResolvedValue(row)},auditLog:{create:jest.fn().mockResolvedValue({})}};
    const prisma={$transaction:jest.fn((work:any)=>work(tx))} as unknown as PrismaService;
    const reauth={requireRecentProof:jest.fn().mockResolvedValue(undefined)} as any;
    const result=await new AuthService(prisma,undefined,reauth).createManagedAccount({fullName:'Responsable Test',email:row.email,role:'SECRETAIRE_PRESENCE',reason:'Désignation confirmée par le chargé paroissial.'} as any,'admin-1');
    expect(result.member).toMatchObject({id:row.id,role:row.role,mustChangePassword:true});
    expect(result.temporaryPassword).toHaveLength(32);
    expect(tx.user.create).toHaveBeenCalledWith({data:expect.objectContaining({role:'SECRETAIRE_PRESENCE',mustChangePassword:true,active:true})});
    expect(tx.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({userId:'admin-1',action:'COMPTE_RESPONSABLE_CREE',reason:'Désignation confirmée par le chargé paroissial.'})});
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(result.temporaryPassword);
  });

  it('requires the temporary password before allowing the first password change and revokes sessions',async()=>{
    const argon2=require('argon2');
    const passwordHash=await argon2.hash('temporary-password-that-is-long-enough');
    const tx={user:{update:jest.fn().mockResolvedValue({})},refreshToken:{updateMany:jest.fn().mockResolvedValue({count:1})},auditLog:{create:jest.fn().mockResolvedValue({})}};
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({passwordHash,mustChangePassword:true})},$transaction:jest.fn((work:any)=>work(tx))} as unknown as PrismaService;
    const service=new AuthService(prisma);
    await expect(service.changeFirstLoginPassword('member-1',{currentPassword:'wrong',newPassword:'A_new_safe_password_2026!',confirmPassword:'A_new_safe_password_2026!'})).rejects.toMatchObject({status:403});
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await expect(service.changeFirstLoginPassword('member-1',{currentPassword:'temporary-password-that-is-long-enough',newPassword:'A_new_safe_password_2026!',confirmPassword:'A_new_safe_password_2026!'})).resolves.toHaveProperty('message');
    expect(tx.user.update).toHaveBeenCalledWith({where:{id:'member-1'},data:expect.objectContaining({mustChangePassword:false,sessionVersion:{increment:1}})});
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({where:{userId:'member-1',revokedAt:null},data:{revokedAt:expect.any(Date)}});
    expect(tx.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({userId:'member-1',action:'MOT_DE_PASSE_INITIAL_MODIFIE'})});
  });
});

describe('production session cookies',()=>{
  it('sets access and refresh cookies to HttpOnly, Secure and SameSite Strict',()=>{
    const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';
    try{const response={cookie:jest.fn()},controller=new AuthController({} as any);(controller as any).setSessionCookies(response,{accessToken:'access',refreshToken:'refresh'});const settings=response.cookie.mock.calls.map(([, ,options])=>options);expect(settings.slice(0,2)).toEqual([expect.objectContaining({httpOnly:true,secure:true,sameSite:'strict'}),expect.objectContaining({httpOnly:true,secure:true,sameSite:'strict'})]);expect(response.cookie.mock.calls.map(([name])=>name)).toEqual(['paroisse_access','paroisse_refresh','paroisse_csrf']);expect(settings[2]).toMatchObject({httpOnly:false,secure:true,sameSite:'strict'});}
    finally{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
  });
});
