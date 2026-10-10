import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

const team = [
  {name:'DOSSEH Justin', grade:'Suprême Évangéliste', roles:['MONITEUR_TABLE']},
  {name:'SEWADE Isaac', grade:'Évangéliste', roles:['MONITEUR_TABLE','PRESENTATION_THEME']},
  {name:'NONDJIGNON Luc', grade:'Suprême Évangéliste', roles:['MONITEUR_TABLE','RESUME_PRECEDENT']},
  {name:'NANHOU Romain', grade:'Suprême Senior Évangéliste', roles:['EXPLICATION_TEXTE']},
  {name:'KOUEYIHOUN Victorin', grade:'Suprême Senior Évangéliste', roles:['EXPLICATION_TEXTE']},
  {name:'ASSOU Félicien', grade:'Assistant Évangéliste', roles:['PRESENTATION_THEME']},
  {name:'DEHOTO TABO Christian', grade:null, roles:['PRESENTATION_THEME']},
  {name:'DAYE Brice', grade:'Senior Leader', roles:['PRESENTATION_THEME']}
];
@ApiTags('Public')
@Controller('public')
export class PublicController {
  @Get('leader') leader() { return { name:'SEWADE KOUESSI Lucien', title:'Vénérable Suprême Évangéliste', photoUrl:null, welcome:'Bienvenue à la paroisse Amour des Apôtres, Sainte-Cécile. Que la paix du Seigneur soit avec vous.' }; }
  @Get('team') getTeam() { return team; }
  @Get('sessions/next') next() { const d=new Date(); const until=((8-d.getUTCDay())%7)||7; d.setUTCDate(d.getUTCDate()+until); return {date:d.toISOString().slice(0,10),startTime:'19:30',endTime:'21:30',theme:'Thème à venir'}; }
  @Get('sessions') sessions() { return []; }
}
