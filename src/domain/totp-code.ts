import { base32Decode, TotpAlgorithm, TotpConfig } from "./totp";

export interface TotpCode {
  readonly value: string;
  readonly secondsRemaining: number;
}

export type Hmac = (
  algorithm: TotpAlgorithm,
  key: Uint8Array<ArrayBuffer>,
  message: Uint8Array<ArrayBuffer>,
) => Promise<Uint8Array>;

const WEB_CRYPTO_HASH_NAME: Record<TotpAlgorithm, string> = {
  SHA1: "SHA-1",
  SHA256: "SHA-256",
  SHA512: "SHA-512",
};

const defaultHmac: Hmac = async (algorithm, key, message) => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: WEB_CRYPTO_HASH_NAME[algorithm] },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, message);
  return new Uint8Array(signature);
};

function counterToBytes(counter: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(8);
  let value = counter;
  for (let i = 7; i >= 0; i--) {
    bytes[i] = value % 256;
    value = Math.floor(value / 256);
  }
  return bytes;
}

/** RFC 4226 dynamic truncation, reduced to `digits` decimal digits. */
function truncate(hmacResult: Uint8Array, digits: number): string {
  const offset = hmacResult[hmacResult.length - 1] & 0x0f;
  const binCode =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);
  return (binCode % 10 ** digits).toString().padStart(digits, "0");
}

/**
 * Generates the current TOTP code (RFC 6238) for a config, plus how many
 * seconds remain before it rotates. `hmac` is injectable so tests can supply
 * deterministic vectors instead of depending on the real Web Crypto backend.
 */
export async function generateTotpCode(
  config: TotpConfig,
  at: Date = new Date(),
  hmac: Hmac = defaultHmac,
): Promise<TotpCode> {
  const secondsSinceEpoch = Math.floor(at.getTime() / 1000);
  const counter = Math.floor(secondsSinceEpoch / config.period);
  const secondsRemaining = config.period - (secondsSinceEpoch % config.period);
  const key = base32Decode(config.secret);
  const hmacResult = await hmac(config.algorithm, key, counterToBytes(counter));
  return { value: truncate(hmacResult, config.digits), secondsRemaining };
}
