import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  isBlockedCallbackHostname,
  isNonPublicNetworkAddress,
} = require('../lib/infrastructure/net/public-https-callback.js');

test('private, documentation, and translation prefixes are non-public', () => {
  for (const address of [
    '10.0.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.5.4',
    '192.168.1.1',
    '100.64.1.1',
    '192.0.2.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '2001:db8::1',
    '2002:0a00:0001::1',
    '2001:0:4136:e378:8000:63bf:3fff:fdd2',
    '64:ff9b::a00:1',
    '::ffff:10.1.2.3',
  ]) {
    assert.equal(isNonPublicNetworkAddress(address), true, address);
  }
});

test('public unicast addresses remain allowed', () => {
  assert.equal(isNonPublicNetworkAddress('8.8.8.8'), false);
  assert.equal(isNonPublicNetworkAddress('1.1.1.1'), false);
  assert.equal(isNonPublicNetworkAddress('2001:4860:4860::8888'), false);
});

test('internal hostnames are blocked before DNS', () => {
  assert.equal(isBlockedCallbackHostname('localhost'), true);
  assert.equal(isBlockedCallbackHostname('app.internal'), true);
  assert.equal(isBlockedCallbackHostname('printer.local'), true);
  assert.equal(isBlockedCallbackHostname('metadata.google.internal'), true);
  assert.equal(isBlockedCallbackHostname('shop.example'), false);
});
