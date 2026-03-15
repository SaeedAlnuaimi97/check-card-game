import geoip from 'geoip-lite';

// ============================================================
// IP Geolocation Utility (F-363)
// ============================================================

/**
 * Converts a 2-letter ISO country code to a flag emoji.
 * Each letter is offset by 127397 from its ASCII value to reach the
 * Regional Indicator Symbol range (U+1F1E6..U+1F1FF).
 */
export function countryCodeToFlag(countryCode: string): string {
  const code = countryCode.toUpperCase();
  if (code.length !== 2) return '';

  const first = code.codePointAt(0);
  const second = code.codePointAt(1);
  if (!first || !second) return '';

  return String.fromCodePoint(first + 127397) + String.fromCodePoint(second + 127397);
}

/**
 * Looks up the country flag emoji for a given IP address using the local
 * geoip-lite database. Returns undefined if the IP cannot be resolved
 * (e.g. localhost, private ranges, unknown IPs).
 */
export function getCountryFlagFromIP(ip: string): string | undefined {
  if (!ip) return undefined;

  // Strip IPv6-mapped IPv4 prefix (e.g. ::ffff:1.2.3.4 -> 1.2.3.4)
  const cleanIP = ip.replace(/^::ffff:/, '');

  const geo = geoip.lookup(cleanIP);
  if (!geo?.country) return undefined;

  const flag = countryCodeToFlag(geo.country);
  return flag || undefined;
}

/**
 * Extracts the client IP address from a Socket.io socket.
 * Checks x-forwarded-for header first (for reverse proxies),
 * then falls back to the direct connection address.
 */
export function getClientIP(socket: {
  handshake: { headers: Record<string, string | string[] | undefined>; address: string };
}): string {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    // x-forwarded-for can contain multiple IPs; the first is the client
    return forwarded.split(',')[0].trim();
  }
  return socket.handshake.address;
}
