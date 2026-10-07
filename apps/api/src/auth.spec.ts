import { UserRole } from '@prisma/client';
import { AuthController, AuthService } from './auth';
import { PrismaService } from './prisma.service';

describe('security-sensitive authentication flows',()=>{
  it('creates a privilege-free inactive account and no session before approval',async()=>{
    const create=jest.fn().mockResolvedValue({id:'new-user'});
    const prisma={user:{findUnique:jest.fn().mockResolvedValue(null),create}} as unknown as PrismaService;
    const result=await new AuthService(prisma).register({fullName:'Test Fidele',phone:'+2290100000000',email:'test@example.com',password:'unMotDePasseTresFort!2026',requestedRole:UserRole.RESPONSABLE_SEMAINE,requestedDayOfWeek:2,role:UserRole.ADMIN} as any);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({role:UserRole.PENDING,active:false,requestedRole:UserRole.RESPONSABLE_SEMAINE})}));
    expect(result).not.toHaveProperty('accessToken');
  });

  it('returns the same registration response for an already-used address without creating another account',async()=>{
    const create=jest.fn();
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'existing'}),create}} as unknown as PrismaService;
    const result=await new AuthService(prisma).register({fullName:'Test Fidele',phone:'+2290100000000',email:'test@example.com',password:'unMotDePasseTresFort!2026',requestedRole:UserRole.SECRETAIRE_PRESENCE} as any);
    expect(result).toEqual({message:'Si votre demande peut être enregistrée, elle sera transmise à l’administration paroissiale.'});
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects reuse of a reset token when the atomic claim loses a race',async()=>{
    const reset={id:'reset-id',userId:'u1',usedAt:null,expiresAt:new Date(Date.now()+60_000)};
    const tx={passwordResetToken:{updateMany:jest.fn().mockResolvedValue({count:0})},user:{update:jest.fn()},refreshToken:{updateMany:jest.fn()}};
    const prisma={passwordResetToken:{findUnique:jest.fn().mockResolvedValue(reset)},$transaction:jest.fn((fn:any)=>fn(tx))} as unknown as PrismaService;
    await expect(new AuthService(prisma).resetPassword({token:'token-value',password:'motDePasseNouveauTresFort2026!',confirmPassword:'motDePasseNouveauTresFort2026!'})).rejects.toMatchObject({status:400});
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects expired reset tokens before changing the account',async()=>{
    const prisma={passwordResetToken:{findUnique:jest.fn().mockResolvedValue({id:'r1',userId:'u1',usedAt:null,expiresAt:new Date(Date.now()-1000)})},$transaction:jest.fn()} as unknown as PrismaService;
    await expect(new AuthService(prisma).resetPassword({token:'expired',password:'motDePasseNouveauTresFort2026!',confirmPassword:'motDePasseNouveauTresFort2026!'})).rejects.toMatchObject({status:400});
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not expose HTTP 2FA enrollment endpoints',()=>{
    expect(AuthController.prototype).not.toHaveProperty('setup');
    expect(AuthController.prototype).not.toHaveProperty('newSecret');
    expect(AuthController.prototype).toHaveProperty('recoveryCodes');
  });

  it('prevents a sub-admin from validating their own role request',async()=>{
    const auth=new AuthService({} as PrismaService);
    await expect(auth.decideAccess('actor-id','VALIDER','actor-id')).rejects.toMatchObject({status:403});
  });
});
