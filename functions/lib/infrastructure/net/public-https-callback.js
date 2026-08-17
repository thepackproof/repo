"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DnsPublicHttpsCallbackValidator = void 0;
exports.isNonPublicNetworkAddress = isNonPublicNetworkAddress;
exports.isBlockedCallbackHostname = isBlockedCallbackHostname;
const promises_1 = require("node:dns/promises");
const node_net_1 = require("node:net");
const errors_1 = require("../../application/v1/errors");
const blocked = new node_net_1.BlockList();
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
function ipv4MappedAddress(address) {
    const value = address.toLowerCase();
    if (value.startsWith('::ffff:')) {
        const mapped = value.slice('::ffff:'.length);
        return (0, node_net_1.isIP)(mapped) === 4 ? mapped : null;
    }
    return null;
}
function isNonPublicNetworkAddress(address) {
    const mapped = ipv4MappedAddress(address);
    if (mapped)
        return isNonPublicNetworkAddress(mapped);
    if ((0, node_net_1.isIP)(address) === 4)
        return blocked.check(address, 'ipv4');
    if ((0, node_net_1.isIP)(address) === 6)
        return blocked.check(address.toLowerCase(), 'ipv6');
    return true;
}
function isBlockedCallbackHostname(hostname) {
    const host = hostname.toLowerCase().replace(/\.$/, '');
    if (!host || host === 'localhost' || host === 'metadata.google.internal')
        return true;
    return host.endsWith('.localhost')
        || host.endsWith('.local')
        || host.endsWith('.internal')
        || host.endsWith('.lan')
        || host.endsWith('.corp')
        || host.endsWith('.home')
        || host.endsWith('.metadata.google.internal');
}
class DnsPublicHttpsCallbackValidator {
    async validate(callbackUrl, allowedOrigins) {
        let parsed;
        try {
            parsed = new URL(callbackUrl);
        }
        catch {
            throw new errors_1.ApplicationError('INVALID_ARGUMENT', 'INVALID_CALLBACK_URL', 'Callback URL must be a valid public HTTPS URL.');
        }
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
            throw new errors_1.ApplicationError('INVALID_ARGUMENT', 'INVALID_CALLBACK_URL', 'Callback URL must use public HTTPS without embedded credentials.');
        }
        if (allowedOrigins.length && !allowedOrigins.includes(parsed.origin)) {
            throw new errors_1.ApplicationError('FORBIDDEN', 'CALLBACK_ORIGIN_NOT_ALLOWED', 'Callback origin is not allowlisted for this integration.');
        }
        if (isBlockedCallbackHostname(parsed.hostname)
            || ((0, node_net_1.isIP)(parsed.hostname) !== 0 && isNonPublicNetworkAddress(parsed.hostname))) {
            throw new errors_1.ApplicationError('INVALID_ARGUMENT', 'INVALID_CALLBACK_URL', 'Callback hostname is not public.');
        }
        const addresses = await (0, promises_1.lookup)(parsed.hostname, { all: true, verbatim: true }).catch(() => []);
        if (!addresses.length || addresses.some(({ address }) => isNonPublicNetworkAddress(address))) {
            throw new errors_1.ApplicationError('INVALID_ARGUMENT', 'INVALID_CALLBACK_URL', 'Callback hostname must resolve only to public network addresses.');
        }
    }
}
exports.DnsPublicHttpsCallbackValidator = DnsPublicHttpsCallbackValidator;
//# sourceMappingURL=public-https-callback.js.map