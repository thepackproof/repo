import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { ApplicationError } from '../../application/v1/errors';
import type { PublicCallbackUrlValidator } from '../../application/v1/merchant-evidence-ports';

const blocked = new BlockList();
blocked.addSubnet('0.0.0.0', 8, 'ipv4');
blocked.addSubnet('10.0.0.0', 8, 'ipv4');
blocked.addSubnet('100.64.0.0', 10, 'ipv4');
blocked.addSubnet('127.0.0.0', 8, 'ipv4');
blocked.addSubnet('169.254.0.0', 16, 'ipv4');
blocked.addSubnet('172.16.0.0', 12, 'ipv4');
blocked.addSubnet('192.0.0.0', 24, 'ipv4');
blocked.addSubnet('192.0.2.0', 24, 'ipv4');
blocked.addSubnet('192.88.99.0', 24, 'ipv4');
blocked.addSubnet('192.168.0.0', 16, 'ipv4');
blocked.addSubnet('198.18.0.0', 15, 'ipv4');
blocked.addSubnet('198.51.100.0', 24, 'ipv4');
blocked.addSubnet('203.0.113.0', 24, 'ipv4');
blocked.addSubnet('224.0.0.0', 4, 'ipv4');
blocked.addSubnet('240.0.0.0', 4, 'ipv4');
blocked.addAddress('255.255.255.255', 'ipv4');
blocked.addAddress('::', 'ipv6');
blocked.addAddress('::1', 'ipv6');
blocked.addSubnet('64:ff9b::', 96, 'ipv6');
blocked.addSubnet('64:ff9b:1::', 48, 'ipv6');
blocked.addSubnet('100::', 64, 'ipv6');
blocked.addSubnet('2001::', 32, 'ipv6');
blocked.addSubnet('2001:2::', 48, 'ipv6');
blocked.addSubnet('2001:10::', 28, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');
blocked.addSubnet('fc00::', 7, 'ipv6');
blocked.addSubnet('fe80::', 10, 'ipv6');
blocked.addSubnet('ff00::', 8, 'ipv6');

function ipv4MappedAddress(address: string): string | null {
  const value = address.toLowerCase();
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length);
    return isIP(mapped) === 4 ? mapped : null;
  }
  return null;
}

export function isNonPublicNetworkAddress(address: string): boolean {
  const mapped = ipv4MappedAddress(address);
  if (mapped) return isNonPublicNetworkAddress(mapped);
  if (isIP(address) === 4) return blocked.check(address, 'ipv4');
  if (isIP(address) === 6) return blocked.check(address.toLowerCase(), 'ipv6');
  return true;
}

export function isBlockedCallbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host === 'metadata.google.internal') return true;
  return host.endsWith('.localhost')
    || host.endsWith('.local')
    || host.endsWith('.internal')
    || host.endsWith('.lan')
    || host.endsWith('.corp')
    || host.endsWith('.home')
    || host.endsWith('.metadata.google.internal');
}

export class DnsPublicHttpsCallbackValidator implements PublicCallbackUrlValidator {
  async validate(callbackUrl: string, allowedOrigins: readonly string[]): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(callbackUrl);
    } catch {
      throw new ApplicationError('INVALID_ARGUMENT', 'INVALID_CALLBACK_URL', 'Callback URL must be a valid public HTTPS URL.');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new ApplicationError('INVALID_ARGUMENT', 'INVALID_CALLBACK_URL', 'Callback URL must use public HTTPS without embedded credentials.');
    }
    if (allowedOrigins.length && !allowedOrigins.includes(parsed.origin)) {
      throw new ApplicationError('FORBIDDEN', 'CALLBACK_ORIGIN_NOT_ALLOWED', 'Callback origin is not allowlisted for this integration.');
    }
    if (isBlockedCallbackHostname(parsed.hostname)
      || (isIP(parsed.hostname) !== 0 && isNonPublicNetworkAddress(parsed.hostname))) {
      throw new ApplicationError('INVALID_ARGUMENT', 'INVALID_CALLBACK_URL', 'Callback hostname is not public.');
    }
    const addresses = await lookup(parsed.hostname, { all: true, verbatim: true }).catch(() => []);
    if (!addresses.length || addresses.some(({ address }) => isNonPublicNetworkAddress(address))) {
      throw new ApplicationError('INVALID_ARGUMENT', 'INVALID_CALLBACK_URL', 'Callback hostname must resolve only to public network addresses.');
    }
  }
}
