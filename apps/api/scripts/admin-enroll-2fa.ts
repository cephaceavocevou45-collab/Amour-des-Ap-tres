import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma';
import { createInterface } from 'node:readline';
import { completeAdminTwoFactorEnrollment, prepareAdminTwoFactorEnrollment, resetAdminTwoFactor } from './admin-2fa-operations';

loadEnv({path:'../../.env'});
const prisma=new PrismaClient();
function arg(name:string){return process.argv.slice(2).find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);}
function prompt(label:string,hidden=false):Promise<string>{return new Promise((resolve,reject)=>{if(!process.stdin.isTTY||!process.stdin.setRawMode)return reject(new Error('Exécutez cette commande depuis un terminal interactif sécurisé.'));const input=process.stdin;process.stdout.write(label);let value='';const done=(error?:Error)=>{input.setRawMode(false);input.pause();input.off('data',onData);process.stdout.write('\n');error?reject(error):resolve(value);};const onData=(buffer:Buffer)=>{for(const char of buffer.toString('utf8')){if(char==='\u0003')return done(new Error('Interrompu.'));if(char==='\r'||char==='\n')return done();if(char==='\u007f'||char==='\b'){value=value.slice(0,-1);continue;}value+=char;if(!hidden)process.stdout.write(char);}};input.setRawMode(true);input.resume();input.on('data',onData);});}
async function main(){
  const email=arg('email')?.trim().toLowerCase(),actorEmail=arg('actor-email')?.trim().toLowerCase();
  if(!email)throw new Error('Usage : npm run admin:enroll-2fa -- --email=admin@example.org');
  if(actorEmail){
    const password=await prompt('Mot de passe du SUPER_ADMIN : ',true),factor=await prompt('Code TOTP ou code de secours du SUPER_ADMIN : ',true);
    await resetAdminTwoFactor(prisma,{targetEmail:email,actorEmail,confirmation:arg('confirm')??'',password,factor});
    console.log('Double vérification réinitialisée après contrôle par le SUPER_ADMIN. Relancez ensuite la commande sans --actor-email pour enrôler ce compte.');return;
  }
  const target=await prisma.user.findUnique({where:{email}}),password=await prompt('Mot de passe du compte à enrôler : ',true);
  const currentFactor=target?.totpSecret?await prompt('Code TOTP ou code de secours actuel : ',true):undefined;
  const setup=await prepareAdminTwoFactorEnrollment(prisma,email,password,currentFactor);
  console.log(`Ajoutez ce compte à l’application TOTP : ${setup.uri}`);
  console.log(`Clé manuelle : ${setup.secret}`);
  const code=await prompt('Saisissez le code à 6 chiffres de l’application : ',true);
  const recoveryCodes=await completeAdminTwoFactorEnrollment(prisma,setup.userId,setup.secret,code);
  console.log('Double vérification activée. Codes de secours (à conserver hors ligne ; ils ne seront plus affichés) :');recoveryCodes.forEach(value=>console.log(value));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Échec de la procédure sécurisée.');process.exitCode=1;}).finally(()=>prisma.$disconnect());
