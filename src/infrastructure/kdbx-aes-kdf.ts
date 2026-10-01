import { KDF_LIMITS } from "../application/vault-settings";

/** The most AES-KDF rounds Argus will run to unlock a file. See `KDF_LIMITS`. */
export const AES_KDF_MAX_ROUNDS = KDF_LIMITS.aesMaxRounds;

const SIGNATURE_AND_VERSION_BYTES = 12;
const MAJOR_VERSION_OFFSET = 10;
const END_OF_HEADER_FIELD = 0;
/** KDBX 3: the AES-KDF round count, as a field of its own. */
const TRANSFORM_ROUNDS_FIELD = 6;
/** KDBX 4: the KDF's settings, as a dictionary. AES-KDF keeps its rounds under `R`. */
const KDF_PARAMETERS_FIELD = 11;
const DICTIONARY_VERSION_BYTES = 2;
const DICTIONARY_END = 0;
const DICTIONARY_UINT64 = 0x05;
const ROUNDS_KEY = "R";

/** `R` from a KDBX 4 KDF dictionary, when it's there as the 64-bit number AES-KDF stores. */
function roundsFromDictionary(view: DataView): bigint | undefined {
  let offset = DICTIONARY_VERSION_BYTES;
  for (;;) {
    const type = view.getUint8(offset);
    if (type === DICTIONARY_END) {
      return undefined;
    }
    const keyLength = view.getUint32(offset + 1, true);
    const keyStart = offset + 5;
    const key = new TextDecoder().decode(
      new Uint8Array(view.buffer, view.byteOffset + keyStart, keyLength),
    );
    const valueLength = view.getUint32(keyStart + keyLength, true);
    const valueStart = keyStart + keyLength + 4;
    if (key === ROUNDS_KEY && type === DICTIONARY_UINT64) {
      return view.getBigUint64(valueStart, true);
    }
    offset = valueStart + valueLength;
  }
}

function findAesKdfRounds(view: DataView): bigint | undefined {
  const isKdbx4 = view.getUint16(MAJOR_VERSION_OFFSET, true) >= 4;
  let offset = SIGNATURE_AND_VERSION_BYTES;
  for (;;) {
    const id = view.getUint8(offset);
    const size = isKdbx4 ? view.getUint32(offset + 1, true) : view.getUint16(offset + 1, true);
    const start = offset + (isKdbx4 ? 5 : 3);
    if (id === END_OF_HEADER_FIELD) {
      return undefined;
    }
    if (!isKdbx4 && id === TRANSFORM_ROUNDS_FIELD) {
      return view.getBigUint64(start, true);
    }
    if (isKdbx4 && id === KDF_PARAMETERS_FIELD) {
      return roundsFromDictionary(new DataView(view.buffer, view.byteOffset + start, size));
    }
    offset = start + size;
  }
}

/**
 * The AES-KDF round count a `.kdbx` file's header asks for, or `undefined`
 * when it has none: an Argon2 vault, or bytes that aren't a readable header at
 * all, which is left for the real parser to report.
 */
export function aesKdfRounds(fileBytes: ArrayBuffer): bigint | undefined {
  try {
    return findAesKdfRounds(new DataView(fileBytes));
  } catch {
    // Reading past the end of a truncated or garbled header.
    return undefined;
  }
}

/**
 * Refuses a file whose header asks for more AES-KDF rounds than
 * `AES_KDF_MAX_ROUNDS`. Has to run before the file is handed to kdbxweb,
 * which starts the transform straight away and offers no way to stop it.
 */
export function checkAesKdfLimit(fileBytes: ArrayBuffer): void {
  const rounds = aesKdfRounds(fileBytes);
  if (rounds !== undefined && rounds > BigInt(AES_KDF_MAX_ROUNDS)) {
    throw new Error(
      `This vault asks for ${rounds.toLocaleString("en-US")} AES-KDF rounds to unlock. ` +
        `Argus allows at most ${AES_KDF_MAX_ROUNDS.toLocaleString("en-US")}.`,
    );
  }
}
