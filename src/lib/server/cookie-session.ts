import * as cookie from 'cookie';

/**
 * Framework-neutral encrypted cookie session. Replaces React Router's
 * `createCookieSessionStorage`, which previously backed the app session, the
 * Pack session and the Pack test session.
 *
 * Session data is JSON, sealed with AES-GCM using a key derived from the
 * session secret, so values (including Customer Account tokens) are neither
 * readable nor forgeable by the browser. Uses Web Crypto only, so it runs in
 * Next's proxy, route handlers and server components alike.
 */

export interface CookieSessionOptions {
  name: string;
  secrets: string[];
  httpOnly?: boolean;
  path?: string;
  sameSite?: 'lax' | 'strict' | 'none';
  secure?: boolean;
  maxAge?: number;
  domain?: string;
}

type SessionData = Record<string, unknown>;

const FLASH_PREFIX = '__flash_';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function getKey(secret: string) {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle
      .digest('SHA-256', encoder.encode(secret))
      .then((hash) =>
        crypto.subtle.importKey('raw', hash, 'AES-GCM', false, [
          'encrypt',
          'decrypt',
        ]),
      );
    keyCache.set(secret, key);
  }
  return key;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function seal(data: SessionData, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv},
    await getKey(secret),
    encoder.encode(JSON.stringify(data)),
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
}

async function unseal(value: string, secrets: string[]) {
  const [iv, payload] = value.split('.');
  if (!iv || !payload) return null;
  // Try every secret so secrets can be rotated without logging everyone out
  for (const secret of secrets) {
    try {
      const decrypted = await crypto.subtle.decrypt(
        {name: 'AES-GCM', iv: fromBase64Url(iv)},
        await getKey(secret),
        fromBase64Url(payload),
      );
      return JSON.parse(decoder.decode(decrypted)) as SessionData;
    } catch {
      // wrong secret or tampered cookie; try the next secret
    }
  }
  return null;
}

export class CookieSession {
  readonly options: CookieSessionOptions;
  #data: SessionData;
  #dirty = false;

  private constructor(options: CookieSessionOptions, data: SessionData) {
    this.options = options;
    this.#data = data;
  }

  /** Reads the session from a `Cookie` header (or any object with `get('cookie')`). */
  static async init(
    cookieHeader: string | null | undefined,
    options: CookieSessionOptions,
  ) {
    const cookies = cookie.parse(cookieHeader || '');
    const raw = cookies[options.name];
    const data = raw ? await unseal(raw, options.secrets) : null;
    return new CookieSession(options, data || {});
  }

  get data(): Readonly<SessionData> {
    return this.#data;
  }

  /** True once the session has been written to and needs committing. */
  get isPending() {
    return this.#dirty;
  }

  has(key: string) {
    return key in this.#data || `${FLASH_PREFIX}${key}` in this.#data;
  }

  get<T = any>(key: string): T | undefined {
    const flashKey = `${FLASH_PREFIX}${key}`;
    if (flashKey in this.#data) {
      const value = this.#data[flashKey];
      delete this.#data[flashKey];
      this.#dirty = true;
      return value as T;
    }
    return this.#data[key] as T | undefined;
  }

  set(key: string, value: unknown) {
    this.#data[key] = value;
    this.#dirty = true;
  }

  flash(key: string, value: unknown) {
    this.#data[`${FLASH_PREFIX}${key}`] = value;
    this.#dirty = true;
  }

  unset(key: string) {
    delete this.#data[key];
    this.#dirty = true;
  }

  clear() {
    this.#data = {};
    this.#dirty = true;
  }

  /** Serialized `Set-Cookie` header value for the current session data. */
  async commit() {
    const {name, secrets, ...cookieOptions} = this.options;
    return cookie.serialize(name, await seal(this.#data, secrets[0]), {
      path: '/',
      httpOnly: true,
      ...cookieOptions,
    });
  }

  /** Raw `name=value` pair, used to forward a freshly committed session to the render. */
  async toRequestCookie() {
    return `${this.options.name}=${await seal(this.#data, this.options.secrets[0])}`;
  }

  /** `Set-Cookie` header value that expires the session cookie. */
  destroy() {
    this.#data = {};
    this.#dirty = true;
    const {name, secrets: _secrets, ...cookieOptions} = this.options;
    return cookie.serialize(name, '', {
      path: '/',
      httpOnly: true,
      ...cookieOptions,
      maxAge: 0,
      expires: new Date(0),
    });
  }
}

/**
 * Replace (or append) one cookie in a `Cookie` request header. Used by the proxy
 * to hand freshly committed session cookies to the render that follows it.
 */
export function replaceRequestCookie(
  cookieHeader: string | null,
  name: string,
  pair: string,
) {
  const parts = (cookieHeader || '')
    .split(/;\s*/)
    .filter((part) => part && !part.startsWith(`${name}=`));
  parts.push(pair);
  return parts.join('; ');
}
