/**
 * Unit tests for the AES-256-GCM token encryption utility (SPEC_GAPS #15).
 *
 * Run with:
 *   npx tsx --test server/utils/encryption.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import {
  encryptToken,
  decryptToken,
  isEncryptionConfigured,
  isEncrypted,
} from "./encryption";

const TEST_SECRET = "test-encryption-secret-do-not-use-in-prod-32chars";
let originalSecret: string | undefined;

before(() => {
  originalSecret = process.env.TOKEN_ENCRYPTION_SECRET;
  process.env.TOKEN_ENCRYPTION_SECRET = TEST_SECRET;
});

after(() => {
  if (originalSecret === undefined) {
    delete process.env.TOKEN_ENCRYPTION_SECRET;
  } else {
    process.env.TOKEN_ENCRYPTION_SECRET = originalSecret;
  }
});

describe("encryption: round-trip", () => {
  it("reports configured when a 32+ char secret is set", () => {
    assert.equal(isEncryptionConfigured(), true);
  });

  it("encrypts and decrypts a Graph access token shape", () => {
    const plaintext = "EwBwA8l6BAAU" + "x".repeat(1500); // simulate a Graph JWT
    const ciphertext = encryptToken(plaintext);
    assert.notEqual(ciphertext, plaintext, "ciphertext should differ from plaintext");
    assert.equal(isEncrypted(ciphertext), true, "ciphertext should be tagged as encrypted");
    const decrypted = decryptToken(ciphertext);
    assert.equal(decrypted, plaintext);
  });

  it("encrypts and decrypts short and unicode strings", () => {
    const cases = ["a", "短い", "🔐 secret 🔑", "with:colons:in:value"];
    for (const plaintext of cases) {
      const ct = encryptToken(plaintext);
      assert.equal(isEncrypted(ct), true);
      assert.equal(decryptToken(ct), plaintext);
    }
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const plaintext = "the-same-plaintext-encrypted-twice";
    const a = encryptToken(plaintext);
    const b = encryptToken(plaintext);
    assert.notEqual(a, b, "two encryptions of the same plaintext should differ");
    assert.equal(decryptToken(a), plaintext);
    assert.equal(decryptToken(b), plaintext);
  });
});

describe("encryption: tamper detection", () => {
  it("rejects modified ciphertext via the GCM auth tag", () => {
    const plaintext = "tamper-target-token";
    const ciphertext = encryptToken(plaintext);
    const [iv, tag, body] = ciphertext.split(":");
    // Flip the last byte of the encrypted body.
    const flipped = body.slice(0, -2) + (body.endsWith("0") ? "1" : "0");
    const tampered = `${iv}:${tag}:${flipped}`;
    assert.throws(() => decryptToken(tampered), /.+/);
  });

  it("rejects ciphertext encrypted under a different secret", () => {
    const plaintext = "secret-from-key-A";
    const ciphertext = encryptToken(plaintext);

    process.env.TOKEN_ENCRYPTION_SECRET = "different-secret-also-32-chars-long-xx";
    assert.throws(() => decryptToken(ciphertext), /.+/);

    // Restore so subsequent tests pass.
    process.env.TOKEN_ENCRYPTION_SECRET = TEST_SECRET;
  });

  it("returns plaintext unchanged when value is not in encrypted format", () => {
    // Backward-compatibility branch: legacy unencrypted tokens pass through.
    assert.equal(decryptToken("plain-value-no-colons"), "plain-value-no-colons");
  });
});

describe("isEncrypted format guard", () => {
  it("recognizes well-formed iv:tag:body strings", () => {
    const ct = encryptToken("hello");
    assert.equal(isEncrypted(ct), true);
  });

  it("rejects strings missing the auth tag segment", () => {
    assert.equal(isEncrypted("aa:bb"), false);
    assert.equal(isEncrypted("not-encrypted"), false);
    assert.equal(isEncrypted(""), false);
  });

  it("rejects strings with wrong-length iv or tag", () => {
    assert.equal(isEncrypted("00:00:abcd"), false);
  });
});
