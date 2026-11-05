import { FaithfulRegisterController } from './faithful-register';
import { PrismaService } from './prisma.service';

describe('faithful register', () => {
  it('returns the shared list in its permanent number order', async () => {
    const entries = [
      { number: 10, fullName: 'Fidèle Dix', grade: 'Membre', functionName: 'Chantre', sex: 'F', createdAt: new Date('2026-11-05T10:00:00Z') },
      { number: 11, fullName: 'Fidèle Onze', grade: 'Membre', functionName: 'Fidèle', sex: 'M', createdAt: new Date('2026-11-05T11:00:00Z') }
    ];
    const prisma = { faithfulRegisterEntry: { findMany: jest.fn().mockResolvedValue(entries) } } as unknown as PrismaService;
    const result = await new FaithfulRegisterController(prisma).list({ user: { role: 'SECRETAIRE_PRESENCE' } });

    expect(result).toEqual({ entries, total: 2, nextNumber: 12 });
    expect(prisma.faithfulRegisterEntry.findMany).toHaveBeenCalledWith({
      orderBy: { number: 'asc' },
      select: { number: true, fullName: true, grade: true, functionName: true, sex: true, createdAt: true }
    });
  });

  it('records additions with the database-assigned next number and an audit entry', async () => {
    const entry = { number: 12, fullName: 'Marie Ahouandjinou', grade: 'Membre', functionName: 'Chantre', sex: 'F', createdAt: new Date('2026-11-05T12:00:00Z') };
    const tx = {
      faithfulRegisterEntry: { create: jest.fn().mockResolvedValue(entry) },
      auditLog: { create: jest.fn().mockResolvedValue({}) }
    };
    const prisma = { $transaction: jest.fn((work: any) => work(tx)) } as unknown as PrismaService;
    const result = await new FaithfulRegisterController(prisma).add(
      { fullName: '  Marie   Ahouandjinou  ', grade: ' Membre ', functionName: ' Chantre ', sex: 'F' },
      { user: { role: 'SECRETAIRE_PRESENCE', sub: 'secretary-1' } }
    );

    expect(result).toEqual(entry);
    expect(tx.faithfulRegisterEntry.create).toHaveBeenCalledWith({
      data: { fullName: 'Marie Ahouandjinou', grade: 'Membre', functionName: 'Chantre', sex: 'F', createdById: 'secretary-1' },
      select: { number: true, fullName: true, grade: true, functionName: true, sex: true, createdAt: true }
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'REGISTRE_FIDELE_AJOUTE', entityId: '12' })
    });
  });

  it('denies access to other account roles', async () => {
    const controller = new FaithfulRegisterController({} as PrismaService);
    await expect(controller.list({ user: { role: 'FIDELE' } })).rejects.toMatchObject({ status: 403 });
  });
});
