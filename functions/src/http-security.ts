import { createHmac, timingSafeEqual } from 'node:crypto';

export const PACKPROOF_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

export function applySecurityHeaders(response: { setHeader(name: string, value: string): unknown }): void {
  for (const [name, value] of Object.entries(PACKPROOF_SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }
}

export function constantTimeSecretEquals(provided: string, expected: string): boolean {
  if (!expected || expected.length < 16) return false;
  const digest = (value: string) => createHmac('sha256', 'packproof-secret-compare-v1').update(value, 'utf8').digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

export function requestIp(request: { ip?: string }): string {
  return typeof request.ip === 'string' && request.ip.trim() ? request.ip.trim() : 'unavailable';
}
