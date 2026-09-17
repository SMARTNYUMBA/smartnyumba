'use strict';
/**
 * SSRF guard for user-supplied outbound URLs (webhooks).
 *
 * SECURITY: routes/webhooks.js lets a super_admin register a URL that
 * this server will later POST to automatically (on payment.received,
 * invoice.created, etc.), and can also test-fire immediately. Without
 * this check, that URL could point at an internal address — a cloud
 * metadata endpoint (169.254.169.254), localhost, or another service on
 * the private network — turning an already-trusted admin action into a
 * way to probe or attack infrastructure the outside world can't reach
 * directly.
 *
 * This validates both the URL's own syntax AND where its hostname
 * actually resolves to, since "https://example.com" can still resolve
 * to a private IP (accidentally, or deliberately via attacker-controlled
 * DNS — "DNS rebinding"). Call this at registration time AND again
 * immediately before every actual delivery attempt (see
 * services/webhooks.js#attemptDelivery) — re-checking at delivery time
 * closes the rebinding window a registration-time-only check would
 * leave open (DNS could point somewhere safe when registered, then be
 * changed to point internally before the next real delivery).
 */
const dns = require('dns').promises;
const net = require('net');

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return true; // malformed — treat as unsafe
  const [a, b] = parts;
  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 127) return true;                          // 127.0.0.0/8 loopback
  if (a === 0) return true;                             // 0.0.0.0/8
  if (a === 169 && b === 254) return true;              // 169.254.0.0/16 link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;      // 172.16.0.0/12
  if (a === 192 && b === 168) return true;               // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;     // 100.64.0.0/10 carrier-grade NAT
  if (a === 192 && b === 0 && parts[2] === 0) return true;   // 192.0.0.0/24
  if (a === 192 && b === 0 && parts[2] === 2) return true;   // 192.0.2.0/24 (docs)
  if (a === 198 && (b === 18 || b === 19)) return true;   // 198.18.0.0/15
  if (a === 198 && b === 51 && parts[2] === 100) return true; // 198.51.100.0/24 (docs)
  if (a === 203 && b === 0 && parts[2] === 113) return true;  // 203.0.113.0/24 (docs)
  if (a >= 224) return true;                              // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + broadcast
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;              // loopback / unspecified
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 unique local
  if (lower.startsWith('fe8') || lower.startsWith('fe9') ||
      lower.startsWith('fea') || lower.startsWith('feb')) return true; // fe80::/10 link-local
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — check the embedded IPv4 too
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateIP(ip) {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // couldn't tell — treat as unsafe
}

/**
 * Throws if the URL is unsafe to fetch server-side: wrong protocol, or
 * its hostname resolves (at call time) to any private/internal/reserved
 * IP. Resolves ALL A/AAAA records and rejects if ANY of them are
 * private, since an attacker's DNS can return multiple answers and a
 * naive check of just the first one can be bypassed.
 */
async function assertPublicUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new Error('Invalid URL'); }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('URL must use http or https');
  }

  const hostname = parsed.hostname;
  if (hostname.toLowerCase() === 'localhost') throw new Error('URL may not point to a private or internal address');

  // If the hostname is already a literal IP, skip DNS and check it directly.
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) throw new Error('URL may not point to a private or internal address');
    return;
  }

  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('URL hostname could not be resolved');
  }
  if (!records.length || records.some(r => isPrivateIP(r.address))) {
    throw new Error('URL may not point to a private or internal address');
  }
}

module.exports = { assertPublicUrl, isPrivateIP };
