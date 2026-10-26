import { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

const REQUIRED_PRODUCTION_VALUES = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'RESEND_API_KEY', 'MAIL_FROM', 'APP_PUBLIC_URL', 'TRUST_PROXY_DEPTH'] as const;

export function assertProductionConfiguration(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== 'production') return;
  for (const name of REQUIRED_PRODUCTION_VALUES) {
    const value = env[name]?.trim();
    if (!value || /(?:change[-_ ]?me|example|placeholder|replace[-_ ]?me|test[-_ ]?only|your[-_ ](?:key|secret)|private[-_ ]?provider[-_ ]?key|dummy|sample)/i.test(value)) {
      throw new Error('Configuration de production incomplète ou contenant une valeur exemple.');
    }
  }
  if (trustedProxyDepth(env) === null || Buffer.byteLength(env.JWT_ACCESS_SECRET?.trim() ?? '', 'utf8') < 32) {
    throw new Error('Configuration de production incomplète ou contenant une valeur exemple.');
  }
  try {
    const publicUrl = new URL(env.APP_PUBLIC_URL!);
    if (publicUrl.protocol !== 'https:' || publicUrl.origin !== env.APP_PUBLIC_URL || publicUrl.username || publicUrl.password) throw new Error();
  } catch {
    throw new Error('Configuration de production incomplète ou contenant une valeur exemple.');
  }
}

/** Number of trusted infrastructure proxy hops in front of the API (Railway web/Nginx: 1). */
export function trustedProxyDepth(env: NodeJS.ProcessEnv): number | null {
  const raw = env.TRUST_PROXY_DEPTH?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  const depth = Number(raw);
  return Number.isSafeInteger(depth) && depth >= 1 && depth <= 5 ? depth : null;
}

export function corsOrigin(env: NodeJS.ProcessEnv): string {
  return env.NODE_ENV === 'production' ? env.APP_PUBLIC_URL! : env.FRONTEND_ORIGIN ?? 'http://localhost:4200';
}

export function sessionCookieOptions(production: boolean, maxAge: number) {
  return { httpOnly: true, secure: production, sameSite: 'strict' as const, path: '/', maxAge };
}

export function applySecurityHeaders(app: INestApplication, production: boolean): void {
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], frameSrc: ["'none'"], frameAncestors: ["'none'"],
      connectSrc: ["'self'"], imgSrc: ["'self'", 'data:'], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
    } },
    hsts: production ? { maxAge: 31_536_000, includeSubDomains: true, preload: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    noSniff: true,
    frameguard: { action: 'deny' },
  }));
}
