import { PrismaClient, PersonRoleName, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
loadEnv({path:resolve(__dirname,'../../../.env')});
const prisma = new PrismaClient();
const members:{firstName:string;lastName:string;grade?:string;roles:PersonRoleName[]}[]=[
 {firstName:'Lucien',lastName:'SEWADE KOUESSI',grade:'Vénérable Suprême Évangéliste',roles:['LEADER']},
 {firstName:'Justin',lastName:'DOSSEH',grade:'Suprême Évangéliste',roles:['MONITEUR_TABLE']},
 {firstName:'Isaac',lastName:'SEWADE',grade:'Évangéliste',roles:['MONITEUR_TABLE','PRESENTATION_THEME']},
 {firstName:'Luc',lastName:'NONDJIGNON',grade:'Suprême Évangéliste',roles:['MONITEUR_TABLE','RESUME_PRECEDENT']},
 {firstName:'Romain',lastName:'NANHOU',grade:'Suprême Senior Évangéliste',roles:['EXPLICATION_TEXTE']},
 {firstName:'Victorin',lastName:'KOUEYIHOUN',grade:'Suprême Senior Évangéliste',roles:['EXPLICATION_TEXTE']},
 {firstName:'Félicien',lastName:'ASSOU',grade:'Assistant Évangéliste',roles:['PRESENTATION_THEME']},
 {firstName:'Christian',lastName:'DEHOTO TABO',roles:['PRESENTATION_THEME']},
 {firstName:'Brice',lastName:'DAYE',grade:'Senior Leader',roles:['PRESENTATION_THEME']}
];
async function main(){for(const [displayOrder,member] of members.entries()){await prisma.person.upsert({where:{id:`seed-${member.firstName.toLowerCase()}`},update:{firstName:member.firstName,lastName:member.lastName,grade:member.grade,displayOrder,roles:{deleteMany:{},create:member.roles.map(role=>({role}))}},create:{id:`seed-${member.firstName.toLowerCase()}`,firstName:member.firstName,lastName:member.lastName,grade:member.grade,displayOrder,roles:{create:member.roles.map(role=>({role}))}}});}const email=process.env.BOOTSTRAP_ADMIN_EMAIL;const password=process.env.BOOTSTRAP_ADMIN_PASSWORD;if(email&&password){const passwordHash=await argon2.hash(password,{type:argon2.argon2id});await prisma.user.upsert({where:{email:email.toLowerCase()},update:{passwordHash,active:true},create:{email:email.toLowerCase(),passwordHash,role:UserRole.SUPER_ADMIN,fullName:'Administrateur initial'}});}}
main().finally(()=>prisma.$disconnect());
