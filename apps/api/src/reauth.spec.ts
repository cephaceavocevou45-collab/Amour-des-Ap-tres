import * as argon2 from 'argon2';
import { ReauthService } from './reauth';
import { PrismaService } from './prisma.service';

describe('sensitive-action reauthentication', () => {
  it('requires a current valid password or a valid current TOTP factor', async () => {
    const passwordHash = await argon2.hash('reauthentication-test-password');
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ passwordHash, totpSecret: null, active: true }) } } as unknown as PrismaService;
    const service = new ReauthService(prisma);
    await expect(service.requireRecentProof('admin-id', {})).rejects.toMatchObject({ status: 401 });
    await expect(service.requireRecentProof('admin-id', { reauthPassword: 'incorrect-password' })).rejects.toMatchObject({ status: 401 });
    await expect(service.requireRecentProof('admin-id', { reauthPassword: 'reauthentication-test-password' })).resolves.toBeUndefined();
  });
});
