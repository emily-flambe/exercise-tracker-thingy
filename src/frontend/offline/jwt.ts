// Minimal, UNVERIFIED JWT payload decode.
// Used only for offline cache hydration — never trust these values for authz.
// Server still validates the token on every request.

export interface JwtPayload {
  sub?: string;
  userId?: string;
  username?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

function base64UrlDecode(input: string): string {
  // Replace URL-safe chars and pad.
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4 !== 0) s += '=';
  if (typeof atob === 'function') {
    return atob(s);
  }
  // Fallback for Node/test environments.
  return Buffer.from(s, 'base64').toString('binary');
}

export function decodeJwtUnverified(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const json = base64UrlDecode(parts[1]);
    // atob returns a binary string; decodeURIComponent escape handles UTF-8.
    let decoded: string;
    try {
      decoded = decodeURIComponent(
        Array.from(json)
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
    } catch {
      decoded = json;
    }
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}

export function isJwtExpired(payload: JwtPayload | null, nowMs = Date.now()): boolean {
  if (!payload || typeof payload.exp !== 'number') return false;
  return payload.exp * 1000 <= nowMs;
}
