/* eslint-disable no-bitwise */
/**
 * Minimal synchronous SHA-256 (ASCII input), ported verbatim from
 * `@pack/packlytics` so ids stay identical to the Oxygen implementation.
 */
function sha256(ascii: string): string | undefined {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i: number;
  let j: number;
  let result = '';
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  const cache = sha256 as unknown as {h?: number[]; k?: number[]};
  let hash: number[] = (cache.h = cache.h || []);
  const k: number[] = (cache.k = cache.k || []);
  let primeCounter = k.length;

  const isComposite: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return undefined; // ASCII check: only accept characters in range 0-255
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (j = 0; j < words.length;) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? 0 : '') + b.toString(16);
    }
  }
  return result;
}

function createHash(data: string) {
  const hash = sha256(data);
  return [
    hash?.substring(0, 8),
    hash?.substring(8, 12),
    hash?.substring(12, 16),
    hash?.substring(16, 20),
    hash?.substring(20, 32),
  ].join('-');
}

/**
 * Generates a UUID from the user data, such as user-agent and IP Address + Salt
 * The salt is generated on the current date + a Secret from the StoreFront,
 * So this UUID will be regenerated every day.
 *
 * We can never use this id to trace back users for GDPR compliance.
 */
export function getPacklyticsId(data: string, secret: string) {
  const formattedDate = new Date().toLocaleDateString('en-US');
  const salt = sha256(formattedDate + secret);
  return createHash(data + salt);
}
/* eslint-enable no-bitwise */
