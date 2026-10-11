import { applySecurityHeaders, assertProductionConfiguration, corsOrigin, sessionCookieOptions } from './runtime-config';

const prod = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://app:private@db:5432/app', JWT_ACCESS_SECRET: 'a'.repeat(40), TOTP_ENCRYPTION_KEY: 'b'.repeat(32), RESEND_API_KEY: `re_${'x'.repeat(32)}`, MAIL_FROM: 'paroisse@paroisse.org', APP_PUBLIC_URL: 'https://paroisse.org' } as NodeJS.ProcessEnv;

describe('production configuration', () => {
  it('requires real production secrets and an exact HTTPS origin without echoing the missing setting', () => {
    expect(() => assertProductionConfiguration({ ...prod, JWT_ACCESS_SECRET: '' })).toThrow('Configuration de production incomplète');
    expect(() => assertProductionConfiguration({ ...prod, TOTP_ENCRYPTION_KEY: 'change-me-please-this-is-an-example' })).toThrow('Configuration de production incomplète');
    expect(() => assertProductionConfiguration({ ...prod, RESEND_API_KEY: 'private-provider-key' })).toThrow('Configuration de production incomplète');
    expect(() => assertProductionConfiguration({ ...prod, MAIL_FROM: '' })).toThrow('Configuration de production incomplète');
    expect(() => assertProductionConfiguration({ ...prod, APP_PUBLIC_URL: 'http://paroisse.example.org' })).toThrow('Configuration de production incomplète');
    expect(() => assertProductionConfiguration(prod)).not.toThrow();
  });

  it('allows only APP_PUBLIC_URL in production and uses the local setting only outside production', () => {
    expect(corsOrigin({ ...prod, FRONTEND_ORIGIN: 'https://attacker.example' })).toBe(prod.APP_PUBLIC_URL);
    expect(corsOrigin({ FRONTEND_ORIGIN: 'http://localhost:4200' })).toBe('http://localhost:4200');
  });

  it('marks both production authentication cookies HttpOnly, Secure and SameSite Strict', () => {
    for (const age of [600_000, 7 * 24 * 60 * 60_000]) expect(sessionCookieOptions(true, age)).toMatchObject({ httpOnly: true, secure: true, sameSite: 'strict' });
    expect(sessionCookieOptions(false, 600_000)).toMatchObject({ httpOnly: true, secure: false, sameSite: 'strict' });
  });

  it('emits production security headers without inline scripts', async () => {
    let middleware: any;
    applySecurityHeaders({ use: (value: any) => { middleware = value; } } as any, true);
    const values = new Map<string, string>();
    const request: any = { headers: { host: 'paroisse.test' }, method: 'GET', secure: true, socket: { encrypted: true } };
    const response: any = { setHeader: (name: string, value: string) => values.set(name.toLowerCase(), String(value)), getHeader: (name: string) => values.get(name.toLowerCase()), removeHeader: (name: string) => values.delete(name.toLowerCase()) };
    await new Promise<void>((resolve, reject) => { try { middleware(request, response, resolve); } catch (error) { reject(error); } });
    const csp = values.get('content-security-policy') ?? '';
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/);
    expect(values.get('strict-transport-security')).toContain('max-age=31536000');
    expect(values.get('x-content-type-options')).toBe('nosniff');
    expect(values.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(values.get('x-frame-options')).toBe('DENY');
  });
});
