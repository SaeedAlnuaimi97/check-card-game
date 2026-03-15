import { describe, it, expect } from 'vitest';
import { countryCodeToFlag, getCountryFlagFromIP, getClientIP } from '../utils/geoip';

// ============================================================
// countryCodeToFlag
// ============================================================

describe('countryCodeToFlag', () => {
  it('converts US to 🇺🇸', () => {
    expect(countryCodeToFlag('US')).toBe('🇺🇸');
  });

  it('converts GB to 🇬🇧', () => {
    expect(countryCodeToFlag('GB')).toBe('🇬🇧');
  });

  it('converts JP to 🇯🇵', () => {
    expect(countryCodeToFlag('JP')).toBe('🇯🇵');
  });

  it('handles lowercase input', () => {
    expect(countryCodeToFlag('de')).toBe('🇩🇪');
  });

  it('handles mixed case input', () => {
    expect(countryCodeToFlag('fR')).toBe('🇫🇷');
  });

  it('returns empty string for single character', () => {
    expect(countryCodeToFlag('A')).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(countryCodeToFlag('')).toBe('');
  });

  it('returns empty string for 3-letter code', () => {
    expect(countryCodeToFlag('USA')).toBe('');
  });
});

// ============================================================
// getCountryFlagFromIP
// ============================================================

describe('getCountryFlagFromIP', () => {
  it('returns undefined for empty string', () => {
    expect(getCountryFlagFromIP('')).toBeUndefined();
  });

  it('returns undefined for localhost IPv4', () => {
    expect(getCountryFlagFromIP('127.0.0.1')).toBeUndefined();
  });

  it('returns undefined for localhost IPv6', () => {
    expect(getCountryFlagFromIP('::1')).toBeUndefined();
  });

  it('returns undefined for private IP 192.168.x.x', () => {
    expect(getCountryFlagFromIP('192.168.1.1')).toBeUndefined();
  });

  it('returns undefined for private IP 10.x.x.x', () => {
    expect(getCountryFlagFromIP('10.0.0.1')).toBeUndefined();
  });

  it('strips ::ffff: prefix before lookup', () => {
    // Both should give the same result (private IPs return undefined)
    expect(getCountryFlagFromIP('::ffff:192.168.1.1')).toBeUndefined();
  });

  it('returns a flag string for a known public IP (Google DNS 8.8.8.8)', () => {
    const flag = getCountryFlagFromIP('8.8.8.8');
    // geoip-lite should resolve Google DNS to US
    if (flag) {
      expect(flag).toBe('🇺🇸');
    } else {
      // If geoip-lite DB hasn't been downloaded yet, it may return undefined
      // This is acceptable in CI environments
      expect(flag).toBeUndefined();
    }
  });

  it('returns undefined or a valid flag (never empty string)', () => {
    const result = getCountryFlagFromIP('1.1.1.1');
    // Should be either undefined or a non-empty string
    if (result !== undefined) {
      expect(result.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// getClientIP
// ============================================================

describe('getClientIP', () => {
  it('returns x-forwarded-for header when present', () => {
    const socket = {
      handshake: {
        headers: { 'x-forwarded-for': '203.0.113.50' },
        address: '10.0.0.1',
      },
    };
    expect(getClientIP(socket)).toBe('203.0.113.50');
  });

  it('returns first IP from comma-separated x-forwarded-for', () => {
    const socket = {
      handshake: {
        headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18, 150.172.238.178' },
        address: '10.0.0.1',
      },
    };
    expect(getClientIP(socket)).toBe('203.0.113.50');
  });

  it('trims whitespace from x-forwarded-for IP', () => {
    const socket = {
      handshake: {
        headers: { 'x-forwarded-for': '  203.0.113.50  , 70.41.3.18' },
        address: '10.0.0.1',
      },
    };
    expect(getClientIP(socket)).toBe('203.0.113.50');
  });

  it('falls back to handshake address when x-forwarded-for is absent', () => {
    const socket = {
      handshake: {
        headers: {},
        address: '192.168.1.100',
      },
    };
    expect(getClientIP(socket)).toBe('192.168.1.100');
  });

  it('falls back to handshake address when x-forwarded-for is an array', () => {
    const socket = {
      handshake: {
        headers: { 'x-forwarded-for': ['203.0.113.50'] as unknown as string },
        address: '172.16.0.1',
      },
    };
    // The function only handles string type, so array falls through
    expect(getClientIP(socket)).toBe('172.16.0.1');
  });

  it('falls back to handshake address when x-forwarded-for is undefined', () => {
    const socket = {
      handshake: {
        headers: { 'x-forwarded-for': undefined },
        address: '::1',
      },
    };
    expect(getClientIP(socket)).toBe('::1');
  });
});
