import { Controller, Get, UseGuards } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';
import { PersonRoleName } from './generated/prisma';
import { PrismaService } from './prisma.service';

@UseGuards(RateLimitGuard)
@Controller('public')
export class PublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('leader') leader() {
    return { name:'Vénérable Suprême Évangéliste SEWADE KOUESSIVI Lucien', title:'Chargé paroissial', photoUrl:'leader-720.webp', welcome:'Bienvenue à la paroisse Amour des Apôtres, Sainte-Cécile. Que la paix du Seigneur soit avec vous.' };
  }

  @Get('team') async getTeam() {
    const people=await this.prisma.person.findMany({where:{active:true,roles:{some:{role:{in:[PersonRoleName.LEADER,PersonRoleName.MONITEUR_TABLE,PersonRoleName.RESUME_PRECEDENT,PersonRoleName.EXPLICATION_TEXTE,PersonRoleName.PRESENTATION_THEME]}}}},include:{roles:true},orderBy:{displayOrder:'asc'}});
    return people.map(person=>{
      // Older seed data stored “Dehoto” in the family name instead of grade.
      // Normalize it for display without requiring a database write or reseed.
      const isDehoto=person.grade?.toLocaleLowerCase('fr')==='dehoto'||/^DEHOTO\s+/i.test(person.lastName);
      const familyName=isDehoto?person.lastName.replace(/^DEHOTO\s+/i,''):person.lastName;
      return {id:person.id,name:`${familyName} ${person.firstName}`,grade:isDehoto?(person.grade??'Dehoto'):person.grade,roles:person.roles.map(role=>role.role)};
    });
  }

  @Get('sessions/next') next() { const d=new Date(); const until=((8-d.getUTCDay())%7)||7; d.setUTCDate(d.getUTCDate()+until); return {date:d.toISOString().slice(0,10),startTime:'19:30',endTime:'21:30',theme:'Thème à venir'}; }
  @Get('sessions') sessions() { return []; }
}
