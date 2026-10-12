import { HttpException } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';

function makeContext(request: Record<string, unknown>) {
  const response = { setHeader: jest.fn() };
  return {
    switchToHttp: () => ({ getRequest: () => ({ method: 'GET', path: '/api/v1/public/leader', ip: '127.0.0.1', ...request, res: response }) }),
    response,
  };
}

describe('RateLimitGuard', () => {
  afterEach(() => jest.restoreAllMocks());
  it('limits a public route and reports Retry-After without exposing the key', () => {
    const guard = new RateLimitGuard();
    for (let index = 0; index < 60; index++) {
      expect(guard.canActivate(makeContext({}) as never)).toBe(true);
    }
    const context = makeContext({});
    try {
      guard.canActivate(context as never);
      throw new Error('Expected rate limit');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect(context.response.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    }
  });

  it('limits an authenticated account even when requests come from different IP addresses', () => {
    const guard = new RateLimitGuard();
    for (let index = 0; index < 30; index++) {
      const context = makeContext({ method: 'POST', path: '/api/v1/attendance/sheets/id/entries', ip: `192.0.2.${index}`, user: { sub: 'responsible-user' } });
      expect(guard.canActivate(context as never)).toBe(true);
    }
    const blocked = makeContext({ method: 'POST', path: '/api/v1/attendance/sheets/id/entries', ip: '198.51.100.99', user: { sub: 'responsible-user' } });
    expect(() => guard.canActivate(blocked as never)).toThrow(HttpException);
  });

  it('purges expired buckets when the bounded map reaches capacity', () => {
    const guard = new RateLimitGuard();
    const now = 2_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);
    (guard as any).buckets = new Map(Array.from({ length: 10_000 }, (_, index) => [`expired-${index}`, { count: 1, resetAt: now - 1 }]));
    const context = makeContext({ method: 'GET', path: '/api/v1/public/team', ip: '192.0.2.10' });
    expect(guard.canActivate(context as never)).toBe(true);
    expect((guard as any).buckets.size).toBe(1);
  });
});
