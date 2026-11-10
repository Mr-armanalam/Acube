// Minimal browser shim for the Node `crypto` builtin.
//
// crypto-js (used by src/Api/encryption.ts via toEncrypt) only ever
// calls two members on it — see crypto-js/core.js:
//   * crypto.getRandomValues(...) — the browser path (window.crypto /
//     globalThis.crypto), used to seed WordArray.random()
//   * crypto.randomBytes(4).readInt32LE() — the Node fallback, only
//     reached when getRandomValues is unavailable
//
// Without this alias, vite-plugin-node-polyfills maps Node `crypto`
// to crypto-browserify and Rollup bundles its whole tree (~400 kB:
// elliptic, bn.js, browserify-sign/aes/des/rsa, create-hash/hmac,
// pbkdf2, diffie-hellman, ...) even though the browser never
// executes any of it — globalThis.crypto.getRandomValues always wins
// in a real browser. This shim forwards to the Web Crypto API
// instead, so the tree is never bundled. Verified: web unit tests
// (incl. the encryption round-trip in otp.test) and the build pass
// with the alias in place.
//
// Do NOT add real crypto primitives here — this is only the random
// seeding surface crypto-js needs.
import { Buffer } from "buffer";

export function getRandomValues<T extends ArrayBufferView>(array: T): T {
  return globalThis.crypto.getRandomValues(array);
}

export function randomBytes(size: number): Buffer {
  return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(size)));
}
