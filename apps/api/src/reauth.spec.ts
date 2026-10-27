import * as argon2 from 'argon2';
import { ReauthService } from './reauth';
import { PrismaService } from './prisma.service';

describe('sensitive-action reauthentication', () => {
  it('requires the current valid password for sensitive actions', async () => {
    const passwordHash = await argon2.hash('reauthentication-test-password');
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ passwordHash, active: true }) } } as unknown as PrismaService;
    const service = new ReauthService(prisma);
    await expect(service.requireRecentProof('admin-id', {})).rejects.toMatchObject({ status: 401 });
    await expect(service.requireRecentProof('admin-id', { reauthPassword: 'incorrect-password' })).rejects.toMatchObject({ status: 401 });
    await expect(service.requireRecentProof('admin-id', { reauthPassword: 'reauthentication-test-password' })).resolves.toBeUndefined();
  });
});
