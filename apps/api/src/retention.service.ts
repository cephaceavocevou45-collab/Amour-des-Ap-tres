import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from './prisma.service';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 0 2 * * *', { timeZone: 'Africa/Porto-Novo' })
  async purgeOldAttendanceNames(): Promise<void> {
    await this.prisma.$transaction(async tx => {
      // Transaction-scoped PostgreSQL lock: only one API replica performs the scheduled purge.
      const lock = await (tx as any).$queryRaw`SELECT pg_try_advisory_xact_lock(202610190) AS locked`;
      if (!lock?.[0]?.locked) return;

      const configuredMonths = Number(process.env.DATA_RETENTION_MONTHS ?? 12);
      const retentionMonths = Number.isInteger(configuredMonths) && configuredMonths >= 1 && configuredMonths <= 120
        ? configuredMonths
        : 12;
      const attendanceCutoff = new Date();
      attendanceCutoff.setUTCMonth(attendanceCutoff.getUTCMonth() - retentionMonths);

      const sheets = await tx.attendanceSheet.findMany({
        where: { date: { lt: attendanceCutoff } },
        select: { id: true },
      });

      let anonymizedEntries = 0;
      for (const sheet of sheets) {
        const groups = await tx.attendanceEntry.groupBy({
          by: ['zone', 'sex'],
          where: { sheetId: sheet.id },
          _count: { _all: true },
        });
        const totalsByZone: Record<string, { men: number; women: number; total: number }> = {};
        let totalMen = 0;
        let totalWomen = 0;
        let totalAll = 0;

        for (const group of groups) {
          const zoneTotals = totalsByZone[group.zone] ?? { men: 0, women: 0, total: 0 };
          const count = group._count._all;
          zoneTotals.total += count;
          if (group.sex === 'M') {
            zoneTotals.men += count;
            totalMen += count;
          } else {
            zoneTotals.women += count;
            totalWomen += count;
          }
          totalAll += count;
          totalsByZone[group.zone] = zoneTotals;
        }

        await tx.attendanceSheet.update({
          where: { id: sheet.id },
          data: { totalMen, totalWomen, totalAll, totalsByZone },
        });
        const anonymized = await tx.attendanceEntry.updateMany({
          where: {
            sheetId: sheet.id,
            OR: [{ fullName: { not: null } }, { normalizedName: { not: null } }],
          },
          data: { fullName: null, normalizedName: null },
        });
        anonymizedEntries += anonymized.count;
      }

      const auditMonths = Number(process.env.AUDIT_RETENTION_MONTHS ?? 36);
      if (!Number.isInteger(auditMonths) || auditMonths < 36 || auditMonths > 120) {
        throw new Error('AUDIT_RETENTION_MONTHS doit être compris entre 36 et 120.');
      }
      const auditCutoff = new Date();
      auditCutoff.setUTCMonth(auditCutoff.getUTCMonth() - auditMonths);
      const expiredAudit = await tx.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } });

      const now = new Date();
      const expiredSessions = await tx.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } });
      const expiredResetTokens = await tx.passwordResetToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
      });

      if (anonymizedEntries || expiredAudit.count || expiredSessions.count || expiredResetTokens.count) {
        this.logger.log(
          `Anonymized ${anonymizedEntries} attendance records and purged ${expiredAudit.count} expired audit events, ${expiredSessions.count} expired sessions and ${expiredResetTokens.count} reset tokens.`,
        );
      }
    }, { maxWait: 5_000, timeout: 120_000 });
  }
}
