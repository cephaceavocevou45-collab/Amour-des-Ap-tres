import type { Request, Response, NextFunction } from 'express';

/** The only HTTP peer allowed to supply X-Forwarded-For to the API. */
export function isTrustedProxyAddress(address: string): boolean {
  return address === '172.31.0.2' || address === '::ffff:172.31.0.2';
}

/** Keep all API responses, including anonymous health and auth responses, out of shared/browser caches. */
export function noStoreResponses(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
  next();
}
