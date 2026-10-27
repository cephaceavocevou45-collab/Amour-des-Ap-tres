import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

type Bucket = { count: number; resetAt: number };

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const path = String(request.path ?? request.originalUrl ?? '').split('?')[0];
    const method = String(request.method ?? 'GET').toUpperCase();
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase().slice(0, 254) : '';
    const account = email || (typeof request.user?.sub === 'string' ? request.user.sub : '');
    const ip = typeof request.ip === 'string' ? request.ip : 'unknown';
    const now = Date.now();
    const register = /\/register(?:\/|$)/.test(path);
    const login = path.endsWith('/login');
    const windowMs = register ? 60 * 60_000 : 10 * 60_000;
    const forgotPassword = path.endsWith('/password/forgot');
    const limit = register ? 3
      : path.endsWith('/login') ? 20
      : forgotPassword ? 4
      : path.endsWith('/password/reset') ? 10
      : path.endsWith('/names/access') || path.endsWith('/export') ? 5
      : path.endsWith('/entries') || path.endsWith('/submit') ? 30
      : 60;

    // Bound memory use; expired buckets are opportunistically removed.
    if (this.buckets.size >= 10_000) {
      for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    // Shared parish, school, and mobile networks often send many legitimate
    // users through one public IP. Keep a strict per-account cap while giving
    // those shared IPs room to authenticate. Registration remains stricter
    // per email than per network.
    const ipLimit = login ? 80 : register ? 20 : forgotPassword ? 30 : limit;
    const accountLimit = login ? 20 : register ? 3 : forgotPassword ? 4 : limit;
    const keys:Array<{key:string;limit:number}>=[{key:`ip:${hash(ip)}:${method}:${path}`,limit:ipLimit}, ...(account ? [{key:`account:${hash(account)}:${method}:${path}`,limit:accountLimit}] : [])];
    for (const {key,limit:keyLimit} of keys) {
      const current = this.buckets.get(key);
      if(!current&&this.buckets.size>=10_000){
        const oldest=[...this.buckets.entries()].reduce<[string,Bucket]|null>((candidate,entry)=>!candidate||entry[1].resetAt<candidate[1].resetAt?entry:candidate,null);
        if(oldest)this.buckets.delete(oldest[0]);
      }
      if (!current || current.resetAt <= now) this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      else if (current.count >= keyLimit){request.res?.setHeader?.('Retry-After',String(Math.max(1,Math.ceil((current.resetAt-now)/1000))));throw new HttpException('Trop de tentatives. Réessayez plus tard.',429);}
      else current.count++;
    }
    return true;
  }
}
