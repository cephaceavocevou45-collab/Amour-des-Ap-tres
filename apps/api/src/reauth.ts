import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from './prisma.service';
export type ReauthProof = { reauthPassword?: string };

@Injectable()
export class ReauthService {
  constructor(private readonly prisma: PrismaService) {}

  async requireRecentProof(userId: string, proof: ReauthProof): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, active: true } });
    if (!user?.active) throw new UnauthorizedException('Réauthentification requise.');
    const validPassword = typeof proof.reauthPassword === 'string' && proof.reauthPassword.length <= 128
      ? await argon2.verify(user.passwordHash, proof.reauthPassword).catch(() => false)
      : false;
    if (!validPassword) throw new UnauthorizedException('Réauthentification requise. Confirmez votre mot de passe.');
  }
}
