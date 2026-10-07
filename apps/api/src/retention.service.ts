import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from './prisma.service';

@Injectable()
export class RetentionService {
  private readonly logger=new Logger(RetentionService.name);
  constructor(private readonly prisma:PrismaService){}

  @Cron('0 0 2 * * *',{timeZone:'Africa/Porto-Novo'})
  async purgeOldAttendanceNames(){
    const configured=Number(process.env.DATA_RETENTION_MONTHS??12);
    const months=Number.isInteger(configured)&&configured>=1&&configured<=120?configured:12;
    const cutoff=new Date();cutoff.setUTCMonth(cutoff.getUTCMonth()-months);
    const sheets=await this.prisma.attendanceSheet.findMany({where:{date:{lt:cutoff}},select:{id:true,totalAll:true}});
    let anonymized=0;
    for(const sheet of sheets){
      const groups=await this.prisma.attendanceEntry.groupBy({by:['zone','sex'],where:{sheetId:sheet.id},_count:{_all:true}});
      const byZone:Record<string,{men:number;women:number;total:number}>={};let totalMen=0,totalWomen=0,totalAll=0;
      for(const item of groups){const row=byZone[item.zone]??{men:0,women:0,total:0};row.total+=item._count._all;if(item.sex==='M'){row.men+=item._count._all;totalMen+=item._count._all;}else{row.women+=item._count._all;totalWomen+=item._count._all;}totalAll+=item._count._all;byZone[item.zone]=row;}
      await this.prisma.$transaction(async tx=>{await tx.attendanceSheet.update({where:{id:sheet.id},data:{totalMen,totalWomen,totalAll,totalsByZone:byZone}});const result=await tx.attendanceEntry.updateMany({where:{sheetId:sheet.id,OR:[{fullName:{not:null}},{normalizedName:{not:null}}]},data:{fullName:null,normalizedName:null}});anonymized+=result.count;});
    }
    const auditMonths=Number(process.env.AUDIT_RETENTION_MONTHS??36);
    if(!Number.isInteger(auditMonths)||auditMonths<36||auditMonths>120)throw new Error('AUDIT_RETENTION_MONTHS doit être compris entre 36 et 120.');
    const auditCutoff=new Date();auditCutoff.setUTCMonth(auditCutoff.getUTCMonth()-auditMonths);
    const audit=await this.prisma.auditLog.deleteMany({where:{createdAt:{lt:auditCutoff}}});
    if(anonymized||audit.count)this.logger.log(`Anonymized ${anonymized} attendance records and purged ${audit.count} expired audit events.`);
  }
}
