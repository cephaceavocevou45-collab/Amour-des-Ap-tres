import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

type FailureState = { count: number };

@Injectable()
export class LoginBackoffPolicy {
  private readonly failures = new Map<string, FailureState>();
  private readonly maximumTrackedKeys = 20_000;
  private readonly maximumFailures = 12;

  private key(ip: string, email: string): string {
    const account = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
    return `${ip}:${account}`;
  }

  failureCount(ip: string, email: string): number {
    return this.failures.get(this.key(ip, email))?.count ?? 0;
  }

  delayMs(ip: string, email: string): number {
    const prior = this.failureCount(ip, email);
    if (prior < 3) return 0;
    return Math.min(8_000, 500 * 2 ** Math.min(prior - 3, 4));
  }

  async wait(ip: string, email: string): Promise<number> {
    const delay = this.delayMs(ip, email);
    if (delay > 0) await new Promise<void>(resolve => setTimeout(resolve, delay));
    return delay;
  }

  recordFailure(ip: string, email: string): void {
    const key = this.key(ip, email);
    if (this.failures.size >= this.maximumTrackedKeys && !this.failures.has(key)) {
      this.failures.delete(this.failures.keys().next().value!);
    }
    this.failures.set(key, { count: Math.min(this.failureCount(ip, email) + 1, this.maximumFailures) });
  }

  clear(ip: string, email: string): void {
    this.failures.delete(this.key(ip, email));
  }
}
