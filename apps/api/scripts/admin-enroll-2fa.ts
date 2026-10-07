import { config as loadEnv } from 'dotenv';
import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { createTotpSecret, decryptTotpSecret, encryptTotpSecret, generateRecoveryCodes, totpUri, verifyTotp } from '../src/totp';

loadEnv({path:'../../.env'});
const prisma=new PrismaClient();
function arg(name:string){return process.argv.slice(2).find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);}
function prompt(label:string,hidden=false):Promise<string>{return new Promise((resolve,reject)=>{if(!process.stdin.isTTY||!process.stdin.setRawMode)return reject(new Error('Exécutez cette commande depuis un terminal interactif sécurisé.'));const input=process.stdin;process.stdout.write(label);let value='';const done=(error?:Error)=>{input.setRawMode(false);input.pause();input.off('data',onData);process.stdout.write('\n');error?reject(error):resolve(value);};const onData=(buffer:Buffer)=>{for(const char of buffer.toString('utf8')){if(char==='\u0003')return done(new Error('Interrompu.'));if(char==='\r'||char==='\n')return done();if(char==='\u007f'||char==='\b'){value=value.slice(0,-1);continue;}value+=char;if(!hidden)process.stdout.write(char);}};input.setRawMode(true);input.resume();input.on('data',onData);});}
async function main(){
  const email=arg('email')?.trim().toLowerCase(),actorEmail=arg('actor-email')?.trim().toLowerCase();
  if(!email)throw new Error('Usage : npm run admin:enroll-2fa -- --email=admin@example.org');
  if(actorEmail&&arg('confirm')!=='RESET-2FA')throw new Error('La récupération exige --confirm=RESET-2FA, puis une authentification interactive du SUPER_ADMIN distinct.');
  const target=await prisma.user.findUnique({where:{email}});
  if(!target||!target.active||![UserRole.ADMIN,UserRole.SUPER_ADMIN,UserRole.EDITEUR].includes(target.role))throw new Error('Le compte cible est introuvable, inactif ou non administrateur.');
  if(target.totpSecret&&!actorEmail)throw new Error('La 2FA est déjà active. Pour récupérer un compte, utilisez --actor-email avec un compte SUPER_ADMIN distinct.');
  if(actorEmail){
    const actor=await prisma.user.findUnique({where:{email:actorEmail}});
    if(!actor||!actor.active||actor.role!==UserRole.SUPER_ADMIN||actor.id===target.id||!actor.totpSecret)throw new Error('La récupération exige un autre compte SUPER_ADMIN actif déjà protégé par la 2FA.');
    const password=await prompt('Mot de passe du SUPER_ADMIN : ',true);
    if(!await argon2.verify(actor.passwordHash,password).catch(()=>false))throw new Error('Authentification refusée.');
    const code=await prompt('Code TOTP ou code de secours du SUPER_ADMIN : ');
    let valid=verifyTotp(decryptTotpSecret(actor.totpSecret),code);
    if(!valid&&/^[A-F0-9]{5}(?:-[A-F0-9]{5}){3}$/.test(code)){
      const rows=await (prisma as any).recoveryCode.findMany({where:{userId:actor.id,usedAt:null}});
      for(const row of rows)if(await argon2.verify(row.codeHash,code).catch(()=>false)){valid=(await (prisma as any).recoveryCode.updateMany({where:{id:row.id,usedAt:null},data:{usedAt:new Date()}})).count===1;break;}
    }
    if(!valid)throw new Error('Authentification refusée.');
    await prisma.$transaction([(prisma as any).recoveryCode.deleteMany({where:{userId:target.id}}),prisma.refreshToken.updateMany({where:{userId:target.id,revokedAt:null},data:{revokedAt:new Date()}}),prisma.user.update({where:{id:target.id},data:{totpSecret:null,sessionVersion:{increment:1}}}),prisma.auditLog.create({data:{userId:actor.id,action:'2FA_RECOVERY_CLI',entity:'UserSecurity',entityId:target.id}})]);
    console.log('Double vérification réinitialisée après contrôle par le SUPER_ADMIN. Relancez ensuite la commande sans --actor-email pour enrôler ce compte.');return;
  }
  const password=await prompt('Mot de passe du compte à enrôler : ',true);
  if(!await argon2.verify(target.passwordHash,password).catch(()=>false))throw new Error('Authentification refusée.');
  if(target.totpSecret){const code=await prompt('Code TOTP ou code de secours actuel : ');let valid=verifyTotp(decryptTotpSecret(target.totpSecret),code);if(!valid){const rows=await (prisma as any).recoveryCode.findMany({where:{userId:target.id,usedAt:null}});for(const row of rows)if(await argon2.verify(row.codeHash,code).catch(()=>false)){valid=(await (prisma as any).recoveryCode.updateMany({where:{id:row.id,usedAt:null},data:{usedAt:new Date()}})).count===1;break;}}if(!valid)throw new Error('Confirmation 2FA refusée.');}
  const secret=createTotpSecret();
  console.log(`Ajoutez ce compte à l’application TOTP : ${totpUri(target.email,secret)}`);
  console.log(`Clé manuelle : ${secret}`);
  const code=await prompt('Saisissez le code à 6 chiffres de l’application : ');
  if(!verifyTotp(secret,code))throw new Error('Code TOTP invalide ; aucune clé n’a été enregistrée.');
  const codes=generateRecoveryCodes();
  await prisma.$transaction(async tx=>{await (tx as any).recoveryCode.deleteMany({where:{userId:target.id}});await tx.user.update({where:{id:target.id},data:{totpSecret:encryptTotpSecret(secret),sessionVersion:{increment:1}}});await (tx as any).recoveryCode.createMany({data:await Promise.all(codes.map(async value=>({userId:target.id,codeHash:await argon2.hash(value,{type:argon2.argon2id})})))});await tx.refreshToken.updateMany({where:{userId:target.id,revokedAt:null},data:{revokedAt:new Date()}});await tx.auditLog.create({data:{userId:target.id,action:target.totpSecret?'2FA_CHANGED_CLI':'2FA_ENROLLED_CLI',entity:'UserSecurity',entityId:target.id}});});
  console.log('Double vérification activée. Codes de secours (à conserver hors ligne ; ils ne seront plus affichés) :');codes.forEach(value=>console.log(value));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Échec de la procédure sécurisée.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
