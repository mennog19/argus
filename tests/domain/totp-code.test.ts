import { describe, expect, it } from "vitest";
import { base32Decode, TotpAlgorithm, TotpConfig } from "../../src/domain/totp";
import { generateTotpCode, Hmac } from "../../src/domain/totp-code";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Uint8Array): string {
  let bits = "";
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, "0");
  }
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder !== 0) {
    out += BASE32_ALPHABET[parseInt(bits.slice(bits.length - remainder).padEnd(5, "0"), 2)];
  }
  return out;
}

// RFC 6238 Appendix B secrets: the ASCII digits repeated to the algorithm's
// natural key length (20/32/64 bytes for SHA1/SHA256/SHA512).
const RFC_SECRETS: Record<TotpAlgorithm, string> = {
  SHA1: base32Encode(new TextEncoder().encode("12345678901234567890")),
  SHA256: base32Encode(new TextEncoder().encode("12345678901234567890123456789012")),
  SHA512: base32Encode(
    new TextEncoder().encode("1234567890123456789012345678901234567890123456789012345678901234"),
  ),
};

describe("generateTotpCode", () => {
  it.each([
    { algorithm: "SHA1" as const, time: 59, expected: "94287082" },
    { algorithm: "SHA256" as const, time: 59, expected: "46119246" },
    { algorithm: "SHA512" as const, time: 59, expected: "90693936" },
    { algorithm: "SHA1" as const, time: 1111111109, expected: "07081804" },
    { algorithm: "SHA256" as const, time: 1111111109, expected: "68084774" },
    { algorithm: "SHA1" as const, time: 20000000000, expected: "65353130" },
  ])(
    "matches the RFC 6238 $algorithm test vector at t=$time",
    async ({ algorithm, time, expected }) => {
      const config = new TotpConfig(RFC_SECRETS[algorithm], algorithm, 8, 30);

      const result = await generateTotpCode(config, new Date(time * 1000));

      expect(result.value).toBe(expected);
    },
  );

  it("reports the seconds remaining until the code rotates", async () => {
    const config = new TotpConfig(RFC_SECRETS.SHA1, "SHA1", 8, 30);

    const at59 = await generateTotpCode(config, new Date(59 * 1000));
    const at60 = await generateTotpCode(config, new Date(60 * 1000));
    const at89 = await generateTotpCode(config, new Date(89 * 1000));

    expect(at59.secondsRemaining).toBe(1);
    expect(at60.secondsRemaining).toBe(30);
    expect(at89.secondsRemaining).toBe(1);
  });

  it("pads the code with leading zeros to the configured digit count", async () => {
    const config = new TotpConfig(RFC_SECRETS.SHA1, "SHA1", 6, 30);
    const zeroPaddingHmac: Hmac = async () =>
      // Truncation of an all-zero HMAC yields binCode 0, so the code is "0".
      new Uint8Array(20);

    const result = await generateTotpCode(config, new Date(0), zeroPaddingHmac);

    expect(result.value).toBe("000000");
  });

  it("passes the decoded secret and counter bytes to the injected hmac", async () => {
    const config = new TotpConfig(RFC_SECRETS.SHA1, "SHA1", 6, 30);
    let capturedKey: Uint8Array | undefined;
    let capturedMessage: Uint8Array | undefined;
    const capturingHmac: Hmac = async (_algorithm, key, message) => {
      capturedKey = key;
      capturedMessage = message;
      return new Uint8Array(20);
    };

    await generateTotpCode(config, new Date(59 * 1000), capturingHmac);

    expect(capturedKey).toEqual(base32Decode(RFC_SECRETS.SHA1));
    // t=59 -> counter = floor(59 / 30) = 1, big-endian 8-byte counter.
    expect(capturedMessage).toEqual(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1]));
  });

  it("falls back to the real Web Crypto HMAC when none is injected", async () => {
    const config = new TotpConfig(RFC_SECRETS.SHA1, "SHA1", 8, 30);

    const result = await generateTotpCode(config, new Date(59 * 1000));

    expect(result.value).toBe("94287082");
  });
});
