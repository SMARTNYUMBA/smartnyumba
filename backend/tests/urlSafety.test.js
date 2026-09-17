'use strict';

/**
 * Tests for utils/urlSafety.js — the SSRF guard applied to user-supplied
 * webhook URLs in services/webhooks.js (create + attemptDelivery) and
 * routes/webhooks.js (#test). See that file's header comment for why
 * this exists: without it, an admin could register a webhook pointing at
 * an internal address (cloud metadata, localhost, the private network)
 * and have this server fetch it on their behalf.
 *
 * Cases involving real hostname resolution (example.com, a real public
 * IP) require outbound DNS/network access to run correctly — consistent
 * with how the rest of this app already assumes network access for
 * anything hitting a real external host.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { assertPublicUrl, isPrivateIP } = require('../utils/urlSafety');

describe('urlSafety — protocol and format validation', () => {
  test('rejects a non-http(s) protocol', async () => {
    await assert.rejects(() => assertPublicUrl('ftp://example.com/x'), /http or https/);
  });

  test('rejects a malformed URL', async () => {
    await assert.rejects(() => assertPublicUrl('not a url'), /Invalid URL/);
  });
});

describe('urlSafety — literal IP addresses', () => {
  test('rejects a literal private IPv4 address', async () => {
    await assert.rejects(() => assertPublicUrl('http://192.168.1.1/x'), /private or internal/);
  });

  test('rejects the cloud metadata link-local address', async () => {
    await assert.rejects(() => assertPublicUrl('http://169.254.169.254/latest/meta-data/'), /private or internal/);
  });

  test('rejects loopback', async () => {
    await assert.rejects(() => assertPublicUrl('http://127.0.0.1:8080/x'), /private or internal/);
  });

  test('rejects the "localhost" hostname directly (no DNS round-trip needed)', async () => {
    await assert.rejects(() => assertPublicUrl('http://localhost:3000/x'), /private or internal/);
  });

  test('allows a literal public IPv4 address', async () => {
    await assert.doesNotReject(() => assertPublicUrl('https://1.1.1.1/webhook'));
  });
});

describe('urlSafety — hostname resolution', () => {
  test('allows a normal public hostname', async () => {
    await assert.doesNotReject(() => assertPublicUrl('https://example.com/webhook'));
  });
});

describe('urlSafety — isPrivateIP range coverage', () => {
  const privateCases = [
    '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1',
    '127.0.0.1', '169.254.1.1', '0.0.0.0', '100.64.0.1',
    '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1',
  ];
  for (const ip of privateCases) {
    test(`${ip} is private`, () => assert.equal(isPrivateIP(ip), true));
  }

  const publicCases = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111'];
  for (const ip of publicCases) {
    test(`${ip} is public`, () => assert.equal(isPrivateIP(ip), false));
  }
});
