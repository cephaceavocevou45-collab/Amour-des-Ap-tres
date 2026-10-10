import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';

type Bucket = { count: number; resetAt: number };

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const path = String(request.path ?? request.originalUrl ?? '').split('?')[0];
    const method = String(request.method ?? 'GET').toUpperCase();
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase().slice(0, 254) : '';
    const ip = typeof request.ip === 'string' ? request.ip : 'unknown';
    const now = Date.now();
    const windowMs = 10 * 60_000;
    const limit = path.endsWith('/login') ? 10
      : path.includes('/moderation/sanctions/')&&path.endsWith('/appeal') ? 5
      : path.endsWith('/social/register') ? 4
      : path.endsWith('/2fa/setup') || path.endsWith('/2fa/new-secret') || path.endsWith('/2fa/recovery-codes') ? 5
      : path.endsWith('/password/forgot') ? 4
      : path.endsWith('/password/reset') ? 10
      : path.endsWith('/register') ? 8
      : path.endsWith('/community/stories') ? 12
      : path.includes('/community/lives/') && path.endsWith('/signals') ? 1200
      : path.endsWith('/community/lives') ? 10
      : path.includes('/community/groups') ? 12
      : path.includes('/community/conversations/') && path.endsWith('/messages') ? 40
      : path.includes('/community/messages/') && (path.endsWith('/report') || path.endsWith('/reactions')) ? 20
      : path.endsWith('/community/conversations/direct') || path.endsWith('/community/conversations/group') ? 10
      : 60;

    // Bound memory use; expired buckets are opportunistically removed.
    if (this.buckets.size > 10_000) {
      for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    const userId=typeof request.user?.sub==='string'?request.user.sub:'';
    const keys:Array<{key:string;limit:number}>=[{key:`${ip}:${method}:${path}`,limit}, ...(email ? [{key:`account:${email}:${method}:${path}`,limit}] : []),...(userId&&path.includes('/community/lives/')&&path.endsWith('/signals')?[{key:`user:${userId}:${method}:${path}`,limit:1200}]:[]),...(userId&&path.endsWith('/community/stories')?[{key:`user:${userId}:${method}:${path}`,limit:30}]:[]),...(userId&&(path.endsWith('/community/conversations/direct')||path.endsWith('/community/conversations/group'))?[{key:`user:${userId}:${method}:${path}`,limit:10}]:[]),...(userId&&path.includes('/community/groups')?[{key:`user:${userId}:${method}:${path}`,limit:12}]:[]),...(userId&&path.includes('/community/conversations/')&&path.endsWith('/messages')?[{key:`user:${userId}:${method}:${path}`,limit:40}]:[]),...(userId&&path.includes('/community/messages/')&&path.endsWith('/reactions')?[{key:`user:${userId}:${method}:${path}`,limit:20}]:[]),...(userId&&path.includes('/community/messages/')&&path.endsWith('/report')?[{key:`user:${userId}:${method}:${path}`,limit:8}]:[])];
    for (const {key,limit:keyLimit} of keys) {
      const current = this.buckets.get(key);
      if(!current&&this.buckets.size>=10_000)throw new HttpException('Trop de tentatives. Réessayez plus tard.',429);
      if (!current || current.resetAt <= now) this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      else if (current.count >= keyLimit) throw new HttpException('Trop de tentatives. Réessayez plus tard.',429);
      else current.count++;
    }
    return true;
  }
}
