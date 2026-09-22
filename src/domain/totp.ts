import { CustomFields } from "./custom-fields";

export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";

const DEFAULT_ALGORITHM: TotpAlgorithm = "SHA1";
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD = 30;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const TOTP_ALGORITHMS: readonly TotpAlgorithm[] = ["SHA1", "SHA256", "SHA512"];

function isTotpAlgorithm(value: string): value is TotpAlgorithm {
  return (TOTP_ALGORITHMS as readonly string[]).includes(value);
}

function normalizeSecret(secret: string): string {
  return secret.replace(/\s+/g, "").replace(/=+$/, "").toUpperCase();
}

function isValidBase32(secret: string): boolean {
  return secret.length > 0 && [...secret].every((char) => BASE32_ALPHABET.includes(char));
}

/** Decodes a normalized (no padding, uppercase) base32 string into raw bytes. */
export function base32Decode(secret: string): Uint8Array<ArrayBuffer> {
  let bits = "";
  for (const char of secret) {
    bits += BASE32_ALPHABET.indexOf(char).toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

/**
 * A TOTP (RFC 6238) configuration: the shared secret plus the algorithm,
 * code length, and rotation period needed to derive codes from it. Immutable
 * and validated at construction so a `TotpConfig` in hand is always usable.
 */
export class TotpConfig {
  readonly secret: string;
  readonly algorithm: TotpAlgorithm;
  readonly digits: number;
  readonly period: number;

  constructor(
    secret: string,
    algorithm: TotpAlgorithm = DEFAULT_ALGORITHM,
    digits: number = DEFAULT_DIGITS,
    period: number = DEFAULT_PERIOD,
  ) {
    const normalizedSecret = normalizeSecret(secret);
    if (!isValidBase32(normalizedSecret)) {
      throw new Error("TOTP secret must be a non-empty base32 string");
    }
    if (!Number.isInteger(digits) || digits < 6 || digits > 8) {
      throw new Error("TOTP digits must be an integer between 6 and 8");
    }
    if (!Number.isInteger(period) || period <= 0) {
      throw new Error("TOTP period must be a positive number of seconds");
    }
    this.secret = normalizedSecret;
    this.algorithm = algorithm;
    this.digits = digits;
    this.period = period;
  }

  equals(other: TotpConfig): boolean {
    return (
      other.secret === this.secret &&
      other.algorithm === this.algorithm &&
      other.digits === this.digits &&
      other.period === this.period
    );
  }

  /** Serializes to the `otpauth://totp/...` URI KeePassXC's `otp` field stores. */
  toOtpauthUri(label: string): string {
    const params = new URLSearchParams({
      secret: this.secret,
      algorithm: this.algorithm,
      digits: String(this.digits),
      period: String(this.period),
    });
    return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
  }
}

/** Parses an `otpauth://totp/...` URI, returning `undefined` if it isn't one. */
export function parseOtpauthUri(uri: string): TotpConfig | undefined {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return undefined;
  }
  if (url.protocol !== "otpauth:" || url.hostname !== "totp") {
    return undefined;
  }
  const secret = url.searchParams.get("secret");
  if (!secret) {
    return undefined;
  }
  const algorithmParam = (url.searchParams.get("algorithm") ?? DEFAULT_ALGORITHM).toUpperCase();
  const algorithm = isTotpAlgorithm(algorithmParam) ? algorithmParam : DEFAULT_ALGORITHM;
  const digits = Number(url.searchParams.get("digits") ?? DEFAULT_DIGITS);
  const period = Number(url.searchParams.get("period") ?? DEFAULT_PERIOD);
  try {
    return new TotpConfig(secret, algorithm, digits, period);
  } catch {
    return undefined;
  }
}

/**
 * Parses a user-entered TOTP setup value: either a full `otpauth://totp/...`
 * URI (preserving its algorithm/digits/period), or a bare base32 secret
 * (using the KeePassXC defaults). Returns `undefined` if neither parses.
 */
export function parseTotpInput(value: string): TotpConfig | undefined {
  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith("otpauth://")) {
    return parseOtpauthUri(trimmed);
  }
  try {
    return new TotpConfig(trimmed);
  } catch {
    return undefined;
  }
}

/** Parses the classic KeePass2 TOTP plugin's `TOTP Settings` field: `"<period>;<digits>"`. */
function parseClassicSettings(settings: string | undefined): { digits: number; period: number } {
  const [periodPart, digitsPart] = (settings ?? "").split(";");
  const period = Number(periodPart);
  const digits = Number(digitsPart);
  return {
    period: Number.isFinite(period) && period > 0 ? period : DEFAULT_PERIOD,
    digits: Number.isFinite(digits) && digits > 0 ? digits : DEFAULT_DIGITS,
  };
}

/** Custom field keys either TOTP convention stores data under. */
export const TOTP_FIELD_KEYS: ReadonlySet<string> = new Set(["otp", "TOTP Seed", "TOTP Settings"]);

/**
 * Derives a `TotpConfig` from an entry's custom fields, supporting both
 * conventions real-world KDBX files use: KeePassXC's modern single `otp`
 * otpauth:// URI field, and the classic `TOTP Seed`/`TOTP Settings` pair.
 * Returns `undefined` when the entry carries no (parseable) TOTP data.
 */
export function totpConfigFromCustomFields(customFields: CustomFields): TotpConfig | undefined {
  const otp = customFields.get("otp")?.value;
  if (otp) {
    return parseOtpauthUri(otp);
  }

  const seed = customFields.get("TOTP Seed")?.value;
  if (!seed) {
    return undefined;
  }
  const { digits, period } = parseClassicSettings(customFields.get("TOTP Settings")?.value);
  try {
    return new TotpConfig(seed, DEFAULT_ALGORITHM, digits, period);
  } catch {
    return undefined;
  }
}
