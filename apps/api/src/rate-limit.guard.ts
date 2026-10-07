import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';

type Bucket = { count: number; resetAt: number };

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const path = String(request.path ?? request.originalUrl ?? '').split('?')[0];
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase().slice(0, 254) : '';
    const ip = typeof request.ip === 'string' ? request.ip : 'unknown';
    const now = Date.now();
    const windowMs = 10 * 60_000;
    const limit = path.endsWith('/login') ? 10
      : path.endsWith('/social/register') || path.endsWith('/social/email/resend') ? 4
      : path.endsWith('/social/email/confirm') ? 10
      : path.endsWith('/2fa/setup') || path.endsWith('/2fa/new-secret') || path.endsWith('/2fa/recovery-codes') ? 5
      : path.endsWith('/password/forgot') ? 4
      : path.endsWith('/password/reset') ? 10
      : path.endsWith('/register') ? 8
      : 60;

    // Bound memory use; expired buckets are opportunistically removed.
    if (this.buckets.size > 10_000) {
      for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    for (const key of [`${ip}:${path}`, ...(email ? [`account:${email}:${path}`] : [])]) {
      const current = this.buckets.get(key);
      if(!current&&this.buckets.size>=10_000)throw new HttpException('Trop de tentatives. Réessayez plus tard.',429);
      if (!current || current.resetAt <= now) this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      else if (current.count >= limit) throw new HttpException('Trop de tentatives. Réessayez plus tard.',429);
      else current.count++;
    }
    return true;
  }
}
