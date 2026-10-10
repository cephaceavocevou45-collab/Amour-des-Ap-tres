import { PrismaClient, UserRole } from '../src/generated/prisma';
import * as argon2 from 'argon2';
import { createTotpSecret, decryptTotpSecret, encryptTotpSecret, generateRecoveryCodes, totpUri, verifyTotp } from '../src/totp';

const adminRoles=new Set<string>([UserRole.ADMIN,UserRole.SUPER_ADMIN,UserRole.EDITEUR]);
const responsibleRoles=new Set<string>([UserRole.SECRETAIRE_PRESENCE,UserRole.RESPONSABLE_SEMAINE]);
function canEnroll(user:{role:UserRole;totpSecret:string|null}){return adminRoles.has(user.role)||!!user.totpSecret||(process.env['2FA_REQUIS_RESPONSABLES']==='true'&&responsibleRoles.has(user.role));}

async function consumeRecoveryCode(prisma:PrismaClient,userId:string,code:string){
  if(!/^[A-F0-9]{5}(?:-[A-F0-9]{5}){3}$/.test(code))return false;
  const recovery=prisma as any,rows=await recovery.recoveryCode.findMany({where:{userId,usedAt:null},select:{id:true,codeHash:true}});
  for(const row of rows)if(await argon2.verify(row.codeHash,code).catch(()=>false))return (await recovery.recoveryCode.updateMany({where:{id:row.id,usedAt:null},data:{usedAt:new Date()}})).count===1;
  return false;
}

async function confirmFactor(prisma:PrismaClient,userId:string,encryptedSecret:string,code:string){
  if(verifyTotp(decryptTotpSecret(encryptedSecret),code))return true;
  return consumeRecoveryCode(prisma,userId,code);
}

export async function prepareAdminTwoFactorEnrollment(prisma:PrismaClient,emailInput:string,password:string,currentFactor?:string){
  const email=emailInput.trim().toLowerCase(),user=await prisma.user.findUnique({where:{email}});
  if(!user||!user.active||!canEnroll(user))throw new Error('Le compte cible est introuvable, inactif ou non autorisé pour la double vérification.');
  if(!await argon2.verify(user.passwordHash,password).catch(()=>false))throw new Error('Authentification refusée.');
  if(user.totpSecret&&(!currentFactor||!await confirmFactor(prisma,user.id,user.totpSecret,currentFactor)))throw new Error('Confirmation 2FA refusée.');
  const secret=createTotpSecret();
  return {userId:user.id,email:user.email,secret,uri:totpUri(user.email,secret),replacing:!!user.totpSecret};
}

export async function completeAdminTwoFactorEnrollment(prisma:PrismaClient,userId:string,secret:string,newCode:string){
  if(!verifyTotp(secret,newCode))throw new Error('Code TOTP invalide ; aucune clé n’a été enregistrée.');
  const user=await prisma.user.findUnique({where:{id:userId}});
  if(!user||!user.active||!canEnroll(user))throw new Error('Le compte cible n’est plus actif ou autorisé pour la double vérification.');
  const codes=generateRecoveryCodes();
  await prisma.$transaction(async tx=>{
    const db=tx as any;
    await db.recoveryCode.deleteMany({where:{userId}});
    await tx.user.update({where:{id:userId},data:{totpSecret:encryptTotpSecret(secret),sessionVersion:{increment:1}}});
    await db.recoveryCode.createMany({data:await Promise.all(codes.map(async code=>({userId,codeHash:await argon2.hash(code,{type:argon2.argon2id})})))});
    await tx.refreshToken.updateMany({where:{userId,revokedAt:null},data:{revokedAt:new Date()}});
    await tx.auditLog.create({data:{userId,action:user.totpSecret?'2FA_CHANGED_CLI':'2FA_ENROLLED_CLI',entity:'UserSecurity',entityId:userId}});
  });
  return codes;
}

export async function resetAdminTwoFactor(prisma:PrismaClient,input:{targetEmail:string;actorEmail:string;confirmation:string;password:string;factor:string}){
  if(input.confirmation!=='RESET-2FA')throw new Error('La récupération exige la confirmation RESET-2FA.');
  const [target,actor]=await Promise.all([
    prisma.user.findUnique({where:{email:input.targetEmail.trim().toLowerCase()}}),
    prisma.user.findUnique({where:{email:input.actorEmail.trim().toLowerCase()}})
  ]);
  if(!target||!target.active||!canEnroll(target))throw new Error('Le compte cible est introuvable ou inactif.');
  if(!actor||!actor.active||actor.role!==UserRole.SUPER_ADMIN||actor.id===target.id||!actor.totpSecret)throw new Error('La récupération exige un autre SUPER_ADMIN actif déjà protégé par la 2FA.');
  if(!await argon2.verify(actor.passwordHash,input.password).catch(()=>false))throw new Error('Authentification refusée.');
  if(!await confirmFactor(prisma,actor.id,actor.totpSecret,input.factor))throw new Error('Authentification refusée.');
  await prisma.$transaction([
    (prisma as any).recoveryCode.deleteMany({where:{userId:target.id}}),
    prisma.refreshToken.updateMany({where:{userId:target.id,revokedAt:null},data:{revokedAt:new Date()}}),
    prisma.user.update({where:{id:target.id},data:{totpSecret:null,sessionVersion:{increment:1}}}),
    prisma.auditLog.create({data:{userId:actor.id,action:'2FA_RECOVERY_CLI',entity:'UserSecurity',entityId:target.id}})
  ]);
}
