import { describe, expect, it } from "vitest";
import { CustomField } from "../../src/domain/custom-field";
import { CustomFields } from "../../src/domain/custom-fields";
import {
  base32Decode,
  parseOtpauthUri,
  parseTotpInput,
  TotpConfig,
  totpConfigFromCustomFields,
} from "../../src/domain/totp";

describe("TotpConfig", () => {
  it("defaults to SHA1, 6 digits, 30s period", () => {
    const config = new TotpConfig("jbswy3dpehpk3pxp");

    expect(config.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(config.algorithm).toBe("SHA1");
    expect(config.digits).toBe(6);
    expect(config.period).toBe(30);
  });

  it("normalizes the secret: strips whitespace and padding, uppercases", () => {
    const config = new TotpConfig("jbsw y3dp ehpk 3pxp ====");

    expect(config.secret).toBe("JBSWY3DPEHPK3PXP");
  });

  it("accepts explicit algorithm, digits, and period", () => {
    const config = new TotpConfig("JBSWY3DPEHPK3PXP", "SHA256", 8, 60);

    expect(config.algorithm).toBe("SHA256");
    expect(config.digits).toBe(8);
    expect(config.period).toBe(60);
  });

  it("rejects an empty secret", () => {
    expect(() => new TotpConfig("")).toThrow(/base32/i);
  });

  it("rejects a secret with non-base32 characters", () => {
    expect(() => new TotpConfig("not-base32!!!")).toThrow(/base32/i);
  });

  it("rejects digits outside 6-8", () => {
    expect(() => new TotpConfig("JBSWY3DPEHPK3PXP", "SHA1", 5)).toThrow(/digits/i);
    expect(() => new TotpConfig("JBSWY3DPEHPK3PXP", "SHA1", 9)).toThrow(/digits/i);
  });

  it("rejects a non-positive period", () => {
    expect(() => new TotpConfig("JBSWY3DPEHPK3PXP", "SHA1", 6, 0)).toThrow(/period/i);
  });

  it("compares by value", () => {
    const a = new TotpConfig("JBSWY3DPEHPK3PXP", "SHA1", 6, 30);
    const b = new TotpConfig("JBSWY3DPEHPK3PXP", "SHA1", 6, 30);
    const c = new TotpConfig("JBSWY3DPEHPK3PXP", "SHA256", 6, 30);

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it("serializes to an otpauth URI that round-trips through the parser", () => {
    const config = new TotpConfig("JBSWY3DPEHPK3PXP", "SHA256", 8, 60);

    const uri = config.toOtpauthUri("GitHub:octocat");
    const parsed = parseOtpauthUri(uri);

    expect(uri.startsWith("otpauth://totp/")).toBe(true);
    expect(parsed).toBeDefined();
    expect(parsed!.equals(config)).toBe(true);
  });
});

describe("base32Decode", () => {
  it("decodes a base32-encoded string back to its original bytes", () => {
    expect(new TextDecoder().decode(base32Decode("JBSWY3DPEB3W64TMMQ"))).toBe("Hello world");
  });
});

describe("parseOtpauthUri", () => {
  it("parses secret, algorithm, digits, and period", () => {
    const config = parseOtpauthUri(
      "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&algorithm=SHA256&digits=8&period=60",
    );

    expect(config).toBeDefined();
    expect(config!.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(config!.algorithm).toBe("SHA256");
    expect(config!.digits).toBe(8);
    expect(config!.period).toBe(60);
  });

  it("defaults algorithm, digits, and period when omitted", () => {
    const config = parseOtpauthUri("otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP");

    expect(config!.algorithm).toBe("SHA1");
    expect(config!.digits).toBe(6);
    expect(config!.period).toBe(30);
  });

  it("returns undefined for a non-otpauth URI", () => {
    expect(parseOtpauthUri("https://example.com")).toBeUndefined();
  });

  it("returns undefined for an otpauth URI that isn't type totp", () => {
    expect(parseOtpauthUri("otpauth://hotp/Example?secret=JBSWY3DPEHPK3PXP")).toBeUndefined();
  });

  it("returns undefined when the secret param is missing", () => {
    expect(parseOtpauthUri("otpauth://totp/Example")).toBeUndefined();
  });

  it("returns undefined for an unparseable URI", () => {
    expect(parseOtpauthUri("not a uri")).toBeUndefined();
  });

  it("falls back to the default algorithm for an unrecognized algorithm param", () => {
    const config = parseOtpauthUri("otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP&algorithm=MD5");

    expect(config!.algorithm).toBe("SHA1");
  });

  it("returns undefined when the secret fails TotpConfig validation", () => {
    expect(parseOtpauthUri("otpauth://totp/Example?secret=not-base32!!!")).toBeUndefined();
  });
});

describe("parseTotpInput", () => {
  it("parses an otpauth URI", () => {
    const config = parseTotpInput("otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP&digits=8");

    expect(config).toBeDefined();
    expect(config!.digits).toBe(8);
  });

  it("is case-insensitive when detecting an otpauth URI", () => {
    const config = parseTotpInput("OTPAuth://totp/Example?secret=JBSWY3DPEHPK3PXP");

    expect(config).toBeDefined();
  });

  it("returns undefined for an unparseable otpauth URI", () => {
    expect(parseTotpInput("otpauth://totp/Example")).toBeUndefined();
  });

  it("parses a bare base32 secret using the defaults", () => {
    const config = parseTotpInput("  jbswy3dp ehpk 3pxp  ");

    expect(config).toBeDefined();
    expect(config!.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(config!.algorithm).toBe("SHA1");
    expect(config!.digits).toBe(6);
    expect(config!.period).toBe(30);
  });

  it("returns undefined for an invalid bare secret", () => {
    expect(parseTotpInput("not-base32!!!")).toBeUndefined();
  });
});

describe("totpConfigFromCustomFields", () => {
  it("returns undefined when there is no TOTP data", () => {
    expect(totpConfigFromCustomFields(new CustomFields())).toBeUndefined();
  });

  it("parses the modern single otp field", () => {
    const fields = new CustomFields([
      new CustomField("otp", "otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP&digits=8", true),
    ]);

    const config = totpConfigFromCustomFields(fields);

    expect(config).toBeDefined();
    expect(config!.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(config!.digits).toBe(8);
  });

  it("returns undefined when the otp field is present but unparseable", () => {
    const fields = new CustomFields([new CustomField("otp", "not a uri", true)]);

    expect(totpConfigFromCustomFields(fields)).toBeUndefined();
  });

  it("parses the classic TOTP Seed / TOTP Settings field pair", () => {
    const fields = new CustomFields([
      new CustomField("TOTP Seed", "JBSWY3DPEHPK3PXP", true),
      new CustomField("TOTP Settings", "60;8"),
    ]);

    const config = totpConfigFromCustomFields(fields);

    expect(config).toBeDefined();
    expect(config!.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(config!.algorithm).toBe("SHA1");
    expect(config!.period).toBe(60);
    expect(config!.digits).toBe(8);
  });

  it("defaults period and digits when TOTP Settings is missing or malformed", () => {
    const withoutSettings = totpConfigFromCustomFields(
      new CustomFields([new CustomField("TOTP Seed", "JBSWY3DPEHPK3PXP", true)]),
    );
    expect(withoutSettings!.period).toBe(30);
    expect(withoutSettings!.digits).toBe(6);

    const malformedSettings = totpConfigFromCustomFields(
      new CustomFields([
        new CustomField("TOTP Seed", "JBSWY3DPEHPK3PXP", true),
        new CustomField("TOTP Settings", "garbage"),
      ]),
    );
    expect(malformedSettings!.period).toBe(30);
    expect(malformedSettings!.digits).toBe(6);
  });

  it("returns undefined when the classic seed fails TotpConfig validation", () => {
    const fields = new CustomFields([new CustomField("TOTP Seed", "not-base32!!!", true)]);

    expect(totpConfigFromCustomFields(fields)).toBeUndefined();
  });

  it("prefers the modern otp field over classic fields when both are present", () => {
    const fields = new CustomFields([
      new CustomField("otp", "otpauth://totp/Example?secret=AAAAAAAAAAAAAAAA", true),
      new CustomField("TOTP Seed", "JBSWY3DPEHPK3PXP", true),
    ]);

    const config = totpConfigFromCustomFields(fields);

    expect(config!.secret).toBe("AAAAAAAAAAAAAAAA");
  });
});
