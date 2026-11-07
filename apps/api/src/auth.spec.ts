import { AuthController, AuthService } from './auth';
import { PrismaService } from './prisma.service';
import { createHash } from 'node:crypto';

describe('security-sensitive authentication flows',()=>{
  it('exposes controlled registration for responsible accounts',()=>{
    expect(AuthController.prototype).toHaveProperty('register');
    expect(AuthController.prototype).toHaveProperty('login');
  });

  it('rejects a reused or expired email recovery code before changing the account',async()=>{
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'u1',role:'SECRETAIRE_PRESENCE',active:true})},passwordResetToken:{findMany:jest.fn().mockResolvedValue([])},$transaction:jest.fn()} as unknown as PrismaService;
    await expect(new AuthService(prisma).resetPassword({email:'member@example.invalid',code:'123456',password:'motDePasseNouveauTresFort2026!',confirmPassword:'motDePasseNouveauTresFort2026!'})).rejects.toMatchObject({status:400});
    expect(prisma.passwordResetToken.findMany).toHaveBeenCalledWith({where:expect.objectContaining({userId:'u1',usedAt:null,expiresAt:{gt:expect.any(Date)},failedAttempts:{lt:5}}),select:{id:true,tokenHash:true,failedAttempts:true}});
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns the same reset response when the account is absent or mail delivery fails',async()=>{
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
    }finally{jest.restoreAllMocks();}
  });

  it('does not expose two-factor authentication endpoints',()=>{
    expect(AuthController.prototype).not.toHaveProperty('setup');
    expect(AuthController.prototype).not.toHaveProperty('newSecret');
    expect(AuthController.prototype).not.toHaveProperty('recoveryCodes');
    expect(AuthController.prototype).not.toHaveProperty('registerTotp');
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

  it('allows an active non-administrator to be designated as a message responder',async()=>{
    const tx={user:{update:jest.fn()},auditLog:{create:jest.fn()},notification:{create:jest.fn()}};
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'member-1',role:'FIDELE',active:true,canRespondMessages:false})},$transaction:jest.fn((work:(transaction:typeof tx)=>unknown)=>work(tx))} as unknown as PrismaService;
    await expect(new AuthService(prisma).setMessageResponder('member-1',true,'admin-1')).resolves.toEqual({id:'member-1',canRespondMessages:true});
    expect(tx.user.update).toHaveBeenCalledWith({where:{id:'member-1'},data:{canRespondMessages:true}});
    expect(tx.notification.create).toHaveBeenCalledWith({data:expect.objectContaining({userId:'member-1',href:'/messages'})});
  });

  it('grants delegated permissions to any active non-administrator account',async()=>{
    const tx={user:{update:jest.fn()},refreshToken:{updateMany:jest.fn()},auditLog:{create:jest.fn()}};
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'member-1',role:'SECRETAIRE_PRESENCE',active:true,permissions:[]})},$transaction:jest.fn((work:(transaction:typeof tx)=>unknown)=>work(tx))} as unknown as PrismaService;
    const reauth={requireRecentProof:jest.fn().mockResolvedValue(undefined)} as any;
    await expect(new AuthService(prisma,undefined,reauth).setSubAdminPermissions('member-1',['ANNUAIRE_FIDELES'],'admin-1','Autorisation demandée par le chargé paroissial.',{}))
      .resolves.toEqual({id:'member-1',role:'SECRETAIRE_PRESENCE',permissions:['ANNUAIRE_FIDELES']});
    expect(tx.user.update).toHaveBeenCalledWith({where:{id:'member-1'},data:{permissions:['ANNUAIRE_FIDELES'],sessionVersion:{increment:1}}});
  });

  it('honors directory permissions assigned to any active role',()=>{
    const controller=new AuthController({faithfulDirectory:jest.fn()} as any);
    expect(()=>controller.faithfulDirectory({user:{role:'TRESORIER',permissions:['ANNUAIRE_FIDELES']}} as any)).not.toThrow();
    expect(()=>controller.faithfulDirectory({user:{role:'TRESORIER',permissions:[]}} as any)).toThrow();
    expect(()=>controller.faithfulDirectory({user:{role:'SECRETAIRE_PROGRAMME',permissions:[]}} as any)).not.toThrow();
  });

  it('limits sub-administrator grants to permissions delegated to that account',()=>{
    const auth={updateManagedAccount:jest.fn()};
    const controller=new AuthController(auth as any);
    expect(()=>controller.updateManagedAccount('member-1',{permissions:['TRESORERIE']} as any,{user:{sub:'editor-1',role:'EDITEUR',permissions:['GESTION_COMPTES']}} as any)).toThrow();
    expect(auth.updateManagedAccount).not.toHaveBeenCalled();
    expect(()=>controller.updateManagedAccount('member-1',{permissions:['PROGRAMME_BIBLIQUE']} as any,{user:{sub:'editor-1',role:'EDITEUR',permissions:['GESTION_COMPTES','PROGRAMME_BIBLIQUE']}} as any)).not.toThrow();
    expect(auth.updateManagedAccount).toHaveBeenCalled();
  });

  it('clears scoped permissions but preserves an explicit responder designation when an account changes role',async()=>{
    const tx={user:{update:jest.fn().mockResolvedValue({id:'member-1',role:'TRESORIER',active:true,permissions:[],assignedDayOfWeek:null})},refreshToken:{updateMany:jest.fn().mockResolvedValue({count:0})},auditLog:{create:jest.fn().mockResolvedValue({})}};
    const prisma={
      user:{findUnique:jest.fn().mockResolvedValue({id:'member-1',role:'EDITEUR',active:true,permissions:['ANNUAIRE_FIDELES','PUBLICATION_ACTUALITES'],canRespondMessages:true,assignedDayOfWeek:null,sessionVersion:0,photoUrl:null,profileSetupRequired:false})},
      auditLog:{findFirst:jest.fn().mockResolvedValue(null)},
      $transaction:jest.fn((work:(transaction:typeof tx)=>unknown)=>work(tx))
    } as unknown as PrismaService;
    const reauth={requireRecentProof:jest.fn().mockResolvedValue(undefined)} as any;
    await new AuthService(prisma,undefined,reauth).updateManagedAccount('member-1',{role:'TRESORIER',active:true,reason:'Changement de responsabilité demandé par la paroisse.'} as any,'admin-1');
    expect(tx.user.update).toHaveBeenCalledWith({where:{id:'member-1'},data:expect.objectContaining({role:'TRESORIER',permissions:[],canRespondMessages:true})});
  });

  it('stores the photo from a one-time responsible profile token and audits completion',async()=>{
    const tx={user:{updateMany:jest.fn().mockResolvedValue({count:1})},auditLog:{create:jest.fn().mockResolvedValue({})}};
    const prisma={
      user:{findUnique:jest.fn().mockResolvedValue({id:'pending-1'})},
      $transaction:jest.fn((work:(transaction:typeof tx)=>unknown)=>work(tx))
    } as unknown as PrismaService;
    const service=new AuthService(prisma);

    await expect(service.completeResponsibleProfile({token:'a'.repeat(43),photoUrl:'data:image/png;base64,abc'} as any)).resolves.toEqual({saved:true});
    expect(prisma.user.findUnique).toHaveBeenCalledWith({where:{profileSetupTokenHash:createHash('sha256').update('a'.repeat(43)).digest('hex')},select:{id:true}});
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where:expect.objectContaining({id:'pending-1',profileSetupTokenHash:expect.any(String),profileSetupExpiresAt:{gt:expect.any(Date)},active:false}),
      data:{photoUrl:'data:image/png;base64,abc',profileSetupTokenHash:null,profileSetupExpiresAt:null,profileSetupRequired:false}
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({entityId:'pending-1',action:'PROFIL_DEMANDE_RESPONSABLE_COMPLETE'})});
  });

  it('does not approve a responsible account before its profile photo is saved',async()=>{
    const prisma={
      user:{
        findUnique:jest.fn().mockResolvedValue({id:'pending-1',role:'SECRETAIRE_PRESENCE',active:false,permissions:[],assignedDayOfWeek:null,sessionVersion:0,photoUrl:null,profileSetupRequired:true})
      },
      auditLog:{findFirst:jest.fn().mockResolvedValue({action:'DEMANDE_ACCES_PRESENCES'})},
      $transaction:jest.fn()
    } as unknown as PrismaService;

    await expect(new AuthService(prisma).updateManagedAccount('pending-1',{active:true,role:'SECRETAIRE_PRESENCE'} as any,'admin-1'))
      .rejects.toMatchObject({status:400});
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lets only administrators manage the point 06 presenters',async()=>{
    const controller=new AuthController({} as any);
    expect(()=>controller.presenters({user:{role:'EDITEUR'}} as any)).toThrow();
    expect(()=>controller.createPresenter({} as any,{user:{role:'SECRETAIRE_PRESENCE',sub:'secretary-1'}} as any)).toThrow();
    expect(()=>controller.updatePresenter('p1',{} as any,{user:{role:'RESPONSABLE_SEMAINE',sub:'president-1'}} as any)).toThrow();
    expect(()=>controller.removePresenter('p1',{} as any,{user:{role:'EDITEUR',sub:'editor-1'}} as any)).toThrow();
  });

  it('adds a presenter with the presentation role and records the administrator and reason',async()=>{
    const person={id:'presenter-1',firstName:'Jean',lastName:'SEWADE',grade:'Évangéliste',active:true,roles:[{role:'PRESENTATION_THEME'}]};
    const tx={person:{create:jest.fn().mockResolvedValue(person)},auditLog:{create:jest.fn().mockResolvedValue({})}};
    const prisma={person:{findFirst:jest.fn().mockResolvedValue(null),aggregate:jest.fn().mockResolvedValue({_max:{displayOrder:5}})},$transaction:jest.fn((work:any)=>work(tx))} as unknown as PrismaService;
    const reauth={requireRecentProof:jest.fn().mockResolvedValue(undefined)} as any;
    const result=await new AuthService(prisma,undefined,reauth).createManagedPresenter({firstName:' Jean ',lastName:' SEWADE ',grade:' Évangéliste ',reason:'Ajout confirmé par le responsable paroissial.',reauthPassword:'valid-proof'} as any,'admin-1');
    expect(result).toEqual(person);
    expect(tx.person.create).toHaveBeenCalledWith({data:{firstName:'Jean',lastName:'SEWADE',grade:'Évangéliste',displayOrder:6,roles:{create:{role:'PRESENTATION_THEME'}}},include:{roles:true}});
    expect(tx.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({userId:'admin-1',action:'INTERVENANT_BIBLIQUE_AJOUTE',entity:'Person',entityId:'presenter-1',reason:'Ajout confirmé par le responsable paroissial.'})});
  });

  it('updates and removes only the point 06 role with audited reasons',async()=>{
    const person={id:'presenter-1',firstName:'Jean',lastName:'SEWADE',grade:null};
    const updated={...person,grade:'Évangéliste',roles:[{role:'PRESENTATION_THEME'}]};
    const tx={person:{update:jest.fn().mockResolvedValue(updated)},personRole:{delete:jest.fn().mockResolvedValue({})},auditLog:{create:jest.fn().mockResolvedValue({})}};
    const prisma={person:{findFirst:jest.fn().mockResolvedValue(person)},$transaction:jest.fn((work:any)=>work(tx))} as unknown as PrismaService;
    const reauth={requireRecentProof:jest.fn().mockResolvedValue(undefined)} as any;
    const service=new AuthService(prisma,undefined,reauth);
    await expect(service.updateManagedPresenter('presenter-1',{firstName:'Jean',lastName:'SEWADE',grade:'Évangéliste',reason:'Correction du grade validée.'} as any,'admin-1')).resolves.toEqual(updated);
    expect(tx.person.update).toHaveBeenCalledWith({where:{id:'presenter-1'},data:{firstName:'Jean',lastName:'SEWADE',grade:'Évangéliste'},include:{roles:true}});
    expect(tx.auditLog.create).toHaveBeenCalledWith({data:expect.objectContaining({action:'INTERVENANT_BIBLIQUE_MODIFIE',reason:'Correction du grade validée.'})});
    await expect(service.removeManagedPresenter('presenter-1',{reason:'La personne ne poursuit plus ce service.'} as any,'admin-1')).resolves.toEqual({id:'presenter-1',removed:true});
    expect(tx.personRole.delete).toHaveBeenCalledWith({where:{personId_role:{personId:'presenter-1',role:'PRESENTATION_THEME'}}});
    expect(tx.auditLog.create).toHaveBeenLastCalledWith({data:expect.objectContaining({action:'INTERVENANT_BIBLIQUE_RETIRE',reason:'La personne ne poursuit plus ce service.'})});
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
