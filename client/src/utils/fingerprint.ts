// ============================================================
// Stable Guest ID (F-230)
// ============================================================
// Generates a best-effort device fingerprint for guest identity.
// Uses a simple djb2 hash of browser characteristics. Stored in
// localStorage so returning users keep the same guest ID.

const STORAGE_KEY = 'checkgame_guest_id';

/** Simple djb2 hash -> hex string */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  // Convert to unsigned 32-bit and then to hex
  return (hash >>> 0).toString(16);
}

/** Build a fingerprint string from browser characteristics. */
function buildFingerprint(): string {
  const parts: string[] = [
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    `${screen.colorDepth}`,
  ];
  return parts.join('|');
}

/**
 * Returns a stable guest ID for the current device/browser.
 * If one exists in localStorage, it is returned. Otherwise a new
 * one is generated from a browser fingerprint and stored.
 *
 * Wrapped in try/catch for environments where localStorage is
 * unavailable or restricted (e.g. iOS Safari Private Browsing).
 */
export function getOrCreateGuestId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      return existing;
    }
  } catch {
    // localStorage not available — fall through to generate
  }

  const fingerprint = buildFingerprint();
  const guestId = `guest_${djb2Hash(fingerprint)}`;

  try {
    localStorage.setItem(STORAGE_KEY, guestId);
  } catch {
    // Private browsing or storage full — guestId works for this session only
  }

  return guestId;
}
