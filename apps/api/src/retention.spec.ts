import { RetentionService } from './retention.service';
import { PrismaService } from './prisma.service';

describe('attendance and audit retention', () => {
  const originalDataMonths = process.env.DATA_RETENTION_MONTHS;
  const originalAuditMonths = process.env.AUDIT_RETENTION_MONTHS;
  afterEach(() => {
    if (originalDataMonths === undefined) delete process.env.DATA_RETENTION_MONTHS; else process.env.DATA_RETENTION_MONTHS = originalDataMonths;
    if (originalAuditMonths === undefined) delete process.env.AUDIT_RETENTION_MONTHS; else process.env.AUDIT_RETENTION_MONTHS = originalAuditMonths;
  });

  it('anonymizes old entry names, freezes correct totals, and never selects audit logs younger than 36 months', async () => {
    process.env.DATA_RETENTION_MONTHS = '1';
    process.env.AUDIT_RETENTION_MONTHS = '36';
    const sheetUpdate = jest.fn(), entryUpdate = jest.fn().mockResolvedValue({ count: 2 });
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]), attendanceSheet: { findMany: jest.fn().mockResolvedValue([{ id: 'old-sheet' }]), update: sheetUpdate }, attendanceEntry: { groupBy: jest.fn().mockResolvedValue([
        { zone: 'TEMPLE', sex: 'M', _count: { _all: 2 } },
        { zone: 'SALLE_VISION', sex: 'F', _count: { _all: 1 } },
      ]), updateMany: entryUpdate }, auditLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) }, refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 4 }) }, passwordResetToken: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) } };
    const prisma = {
      $transaction: jest.fn((work: any) => work(tx)),
    } as unknown as PrismaService;
    await new RetentionService(prisma).purgeOldAttendanceNames();
    expect(sheetUpdate).toHaveBeenCalledWith({ where: { id: 'old-sheet' }, data: { totalMen: 2, totalWomen: 1, totalAll: 3, totalsByZone: { TEMPLE: { men: 2, women: 0, total: 2 }, SALLE_VISION: { men: 0, women: 1, total: 1 } } } });
    expect(entryUpdate).toHaveBeenCalledWith({ where: { sheetId: 'old-sheet', OR: [{ fullName: { not: null } }, { normalizedName: { not: null } }] }, data: { fullName: null, normalizedName: null } });
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({where:{expiresAt:{lt:expect.any(Date)}}});
    expect(tx.passwordResetToken.deleteMany).toHaveBeenCalledWith({where:{OR:[{expiresAt:{lt:expect.any(Date)}},{usedAt:{not:null}}]}});
    const cutoff = tx.auditLog.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    const ageDays = (Date.now() - cutoff.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThanOrEqual(1094);
    expect(ageDays).toBeLessThan(1100);
  });

  it('refuses an audit retention period shorter than 36 months', async () => {
    process.env.DATA_RETENTION_MONTHS = '12';
    process.env.AUDIT_RETENTION_MONTHS = '35';
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{locked:true}]), attendanceSheet: { findMany: jest.fn().mockResolvedValue([]) }, auditLog: { deleteMany: jest.fn() }, refreshToken:{deleteMany:jest.fn()}, passwordResetToken:{deleteMany:jest.fn()} };
    const prisma = { $transaction: jest.fn((work:any)=>work(tx)) } as unknown as PrismaService;
    await expect(new RetentionService(prisma).purgeOldAttendanceNames()).rejects.toThrow('AUDIT_RETENTION_MONTHS');
    expect(tx.auditLog.deleteMany).not.toHaveBeenCalled();
  });

  it('skips the purge when another API instance owns the advisory lock', async()=>{
    const tx={$queryRaw:jest.fn().mockResolvedValue([{locked:false}]),attendanceSheet:{findMany:jest.fn()},auditLog:{deleteMany:jest.fn()},refreshToken:{deleteMany:jest.fn()},passwordResetToken:{deleteMany:jest.fn()}};
    const prisma={$transaction:jest.fn((work:any)=>work(tx))} as unknown as PrismaService;
    await new RetentionService(prisma).purgeOldAttendanceNames();
    expect(tx.attendanceSheet.findMany).not.toHaveBeenCalled();
    expect(tx.auditLog.deleteMany).not.toHaveBeenCalled();
  });
});
