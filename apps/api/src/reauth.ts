import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from './prisma.service';
import { decryptTotpSecretAndMigrate, verifyTotp } from './totp';

export type ReauthProof = { reauthPassword?: string; reauthFactor?: string };

@Injectable()
export class ReauthService {
  constructor(private readonly prisma: PrismaService) {}

  async requireRecentProof(userId: string, proof: ReauthProof): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, totpSecret: true, active: true } });
    if (!user?.active) throw new UnauthorizedException('Réauthentification requise.');
    const validPassword = typeof proof.reauthPassword === 'string' && proof.reauthPassword.length <= 128
      ? await argon2.verify(user.passwordHash, proof.reauthPassword).catch(() => false)
      : false;
    let validFactor = false;
    if (typeof proof.reauthFactor === 'string' && user.totpSecret) {
      const encryptedSecret = user.totpSecret;
      try {
        const secret = await decryptTotpSecretAndMigrate(encryptedSecret, reencryptedSecret => this.prisma.user.updateMany({ where: { id: userId, totpSecret: encryptedSecret }, data: { totpSecret: reencryptedSecret } }));
        validFactor = verifyTotp(secret, proof.reauthFactor);
      } catch { validFactor = false; }
    }
    if (!validPassword && !validFactor) throw new UnauthorizedException('Réauthentification requise. Confirmez votre mot de passe ou votre code de vérification.');
  }
}
