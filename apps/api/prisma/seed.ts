import { PrismaClient, PersonRoleName, UserRole } from '../src/generated/prisma';
import * as argon2 from 'argon2';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
loadEnv({path:resolve(__dirname,'../../../.env')});
const prisma = new PrismaClient();
const members:{firstName:string;lastName:string;grade?:string;roles:PersonRoleName[]}[]=[
 {firstName:'Lucien',lastName:'SEWADE KOUESSIVI',grade:'Vénérable Suprême Évangéliste',roles:['LEADER']},
 {firstName:'Justin',lastName:'DOSSEH',grade:'Suprême Évangéliste',roles:['MONITEUR_TABLE']},
 {firstName:'Isaac',lastName:'SEWADE',grade:'Évangéliste',roles:['MONITEUR_TABLE','PRESENTATION_THEME']},
 {firstName:'Luc',lastName:'NONDJIGNON',grade:'Suprême Évangéliste',roles:['MONITEUR_TABLE','RESUME_PRECEDENT']},
 {firstName:'Romain',lastName:'NANHOU',grade:'Suprême Senior Évangéliste',roles:['EXPLICATION_TEXTE']},
 {firstName:'Victorin',lastName:'KOUEYIHOUN',grade:'Suprême Senior Évangéliste',roles:['EXPLICATION_TEXTE']},
 {firstName:'Félicien',lastName:'ASSOU',grade:'Assistant Évangéliste',roles:['PRESENTATION_THEME']},
 {firstName:'Christian',lastName:'DEHOTO TABO',grade:'Dehoto',roles:['PRESENTATION_THEME']},
 {firstName:'Brice',lastName:'DAYE',grade:'Senior Leader',roles:['PRESENTATION_THEME']},
 {firstName:'Jean',lastName:'SEWADE',grade:'Évangéliste',roles:['PRESENTATION_THEME']}
];
async function main(){for(const [displayOrder,member] of members.entries()){await prisma.person.upsert({where:{id:`seed-${member.firstName.toLowerCase()}`},update:{firstName:member.firstName,lastName:member.lastName,grade:member.grade,displayOrder,roles:{deleteMany:{},create:member.roles.map(role=>({role}))}},create:{id:`seed-${member.firstName.toLowerCase()}`,firstName:member.firstName,lastName:member.lastName,grade:member.grade,displayOrder,roles:{create:member.roles.map(role=>({role}))}}});}const email=process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase(),password=process.env.BOOTSTRAP_ADMIN_PASSWORD;if(Boolean(email)!==Boolean(password))throw new Error('Configuration initiale administrateur incomplète.');if(email&&password){const existingSuperAdmin=await prisma.user.findFirst({where:{role:UserRole.SUPER_ADMIN},select:{id:true}});if(!existingSuperAdmin){const emailOwner=await prisma.user.findUnique({where:{email},select:{id:true}});if(emailOwner)throw new Error('Impossible de créer le compte initial.');const passwordHash=await argon2.hash(password,{type:argon2.argon2id});await prisma.user.create({data:{email,passwordHash,role:UserRole.SUPER_ADMIN,fullName:'Administrateur initial',active:true,mustChangePassword:true}});}}}
main().finally(()=>prisma.$disconnect());
