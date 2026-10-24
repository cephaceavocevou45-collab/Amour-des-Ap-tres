import { LoginBackoffPolicy } from './login-backoff.policy';

describe('LoginBackoffPolicy', () => {
  afterEach(() => jest.useRealTimers());

  it('increases the delay exponentially and caps it at eight seconds', () => {
    const policy = new LoginBackoffPolicy();
    const ip = '198.51.100.10';
    const email = 'Member@Example.invalid';
    expect(policy.delayMs(ip, email)).toBe(0);
    for (let index = 0; index < 3; index++) policy.recordFailure(ip, email);
    expect(policy.delayMs(ip, email)).toBe(500);
    policy.recordFailure(ip, email);
    expect(policy.delayMs(ip, email)).toBe(1_000);
    policy.recordFailure(ip, email);
    expect(policy.delayMs(ip, email)).toBe(2_000);
    for (let index = 0; index < 12; index++) policy.recordFailure(ip, email);
    expect(policy.failureCount(ip, email)).toBe(12);
    expect(policy.delayMs(ip, email)).toBe(8_000);
  });

  it('keeps backoff state isolated by both IP and normalized account', () => {
    const policy = new LoginBackoffPolicy();
    for (let index = 0; index < 5; index++) policy.recordFailure('198.51.100.10', 'person@example.invalid');
    expect(policy.delayMs('198.51.100.10', 'PERSON@example.invalid')).toBe(2_000);
    expect(policy.delayMs('198.51.100.11', 'person@example.invalid')).toBe(0);
    expect(policy.delayMs('198.51.100.10', 'other@example.invalid')).toBe(0);
  });

  it('applies the computed delay with a simulated clock rather than wall-clock timing', async () => {
    const policy = new LoginBackoffPolicy();
    for (let index = 0; index < 3; index++) policy.recordFailure('198.51.100.12', 'person@example.invalid');
    jest.useFakeTimers();
    let completed = false;
    const waiting = policy.wait('198.51.100.12', 'person@example.invalid').then(value => { completed = true; return value; });
    await jest.advanceTimersByTimeAsync(499);
    expect(completed).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(waiting).resolves.toBe(500);
    expect(completed).toBe(true);
  });

  it('clears the transient delay after a valid login instead of locking the account', () => {
    const policy = new LoginBackoffPolicy();
    const ip = '198.51.100.13';
    const email = 'valid@example.invalid';
    for (let index = 0; index < 20; index++) policy.recordFailure(ip, email);
    expect(policy.delayMs(ip, email)).toBe(8_000);
    policy.clear(ip, email);
    expect(policy.failureCount(ip, email)).toBe(0);
    expect(policy.delayMs(ip, email)).toBe(0);
  });
});
