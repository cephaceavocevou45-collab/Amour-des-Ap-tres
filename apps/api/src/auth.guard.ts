import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifiedToken } from './auth-token';
import { PrismaService } from './prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization as string | undefined;
    const accessCookie = (request.headers.cookie as string | undefined)?.split(';').map((part: string) => part.trim()).find((part: string) => part.startsWith('paroisse_access='))?.slice('paroisse_access='.length);
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : accessCookie ?? '';
    const claims = verifiedToken(token);
    if (!claims) throw new UnauthorizedException('Connexion requise.');

    const user = await (this.prisma as any).user.findUnique({
      where: { id: claims.sub },
      select: { id: true, role: true, active: true, sessionVersion: true, permissions: true, mustChangePassword: true },
    });
    if (!user || !user.active || user.sessionVersion !== claims.ver) throw new UnauthorizedException('Connexion requise.');
    if (process.env.NODE_ENV === 'production' && !claims.fam) throw new UnauthorizedException('Connexion expirée.');

    if (claims.fam) {
      const now = new Date();
      const idleValue = Number(process.env.SESSION_IDLE_MINUTES ?? 30);
      const absoluteValue = Number(process.env.SESSION_ABSOLUTE_DAYS ?? 30);
      const idleMinutes = Number.isInteger(idleValue) && idleValue >= 5 && idleValue <= 240 ? idleValue : 30;
      const absoluteDays = Number.isInteger(absoluteValue) && absoluteValue >= 1 && absoluteValue <= 90 ? absoluteValue : 30;
      const [activeSession, familyStart] = await Promise.all([
        (this.prisma as any).refreshToken.findFirst({ where: { family: claims.fam, userId: claims.sub, revokedAt: null, expiresAt: { gt: now } }, select: { lastSeenAt: true } }),
        (this.prisma as any).refreshToken.findFirst({ where: { family: claims.fam, userId: claims.sub }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      ]);
      const inactive = !activeSession || now.getTime() - activeSession.lastSeenAt.getTime() > idleMinutes * 60_000;
      const tooOld = !familyStart || now.getTime() - familyStart.createdAt.getTime() > absoluteDays * 86_400_000;
      if (inactive || tooOld) {
        await (this.prisma as any).refreshToken.updateMany({ where: { family: claims.fam, revokedAt: null }, data: { revokedAt: now } });
        throw new UnauthorizedException('Connexion expirée.');
      }
      if (now.getTime() - activeSession.lastSeenAt.getTime() > 60_000) {
        await (this.prisma as any).refreshToken.updateMany({ where: { family: claims.fam, revokedAt: null }, data: { lastSeenAt: now } });
      }
    }

    const firstPasswordChange = request.path?.endsWith('/auth/account/password/first-login');
    if (user.mustChangePassword && !firstPasswordChange) throw new UnauthorizedException('Changez votre mot de passe temporaire avant de continuer.');
    request.user = { ...claims, role: user.role, permissions: user.permissions ?? [], mustChangePassword: user.mustChangePassword };
    return true;
  }
}
