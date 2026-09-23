import { describe, expect, it } from "vitest";
import {
  autoTypeSequenceError,
  AutoTypeSequenceError,
  DEFAULT_AUTO_TYPE_SEQUENCE,
  MAX_AUTO_TYPE_DELAY_MS,
  parseAutoTypeSequence,
  resolveAutoTypeSequence,
} from "./auto-type";

const VALUES = {
  username: "menno",
  password: "hunter2",
  url: "https://github.com",
  title: "GitHub",
  totp: "123456",
};

describe("parseAutoTypeSequence", () => {
  it("splits the default sequence into fields and keys", () => {
    expect(parseAutoTypeSequence(DEFAULT_AUTO_TYPE_SEQUENCE)).toEqual([
      { kind: "field", field: "username" },
      { kind: "key", key: "tab" },
      { kind: "field", field: "password" },
      { kind: "key", key: "enter" },
    ]);
  });

  it("keeps literal text around placeholders", () => {
    expect(parseAutoTypeSequence("id:{USERNAME}@work")).toEqual([
      { kind: "text", text: "id:" },
      { kind: "field", field: "username" },
      { kind: "text", text: "@work" },
    ]);
  });

  it("is case- and whitespace-insensitive about placeholder names", () => {
    expect(parseAutoTypeSequence("{ Password }")).toEqual([{ kind: "field", field: "password" }]);
  });

  it("accepts the alternate spellings of a field and a key", () => {
    expect(parseAutoTypeSequence("{USER}{RETURN}")).toEqual([
      { kind: "field", field: "username" },
      { kind: "key", key: "enter" },
    ]);
  });

  it("parses every field placeholder", () => {
    expect(parseAutoTypeSequence("{USERNAME}{PASSWORD}{TOTP}{URL}{TITLE}")).toEqual([
      { kind: "field", field: "username" },
      { kind: "field", field: "password" },
      { kind: "field", field: "totp" },
      { kind: "field", field: "url" },
      { kind: "field", field: "title" },
    ]);
  });

  it("parses the focus placeholders for the username and password fields", () => {
    expect(parseAutoTypeSequence("{FOCUS USERNAME}{ focus  Password }")).toEqual([
      { kind: "focus", field: "username" },
      { kind: "focus", field: "password" },
    ]);
  });

  it("rejects focusing a field that isn't a form field", () => {
    expect(() => parseAutoTypeSequence("{FOCUS TOTP}")).toThrow(AutoTypeSequenceError);
  });

  it("parses every key placeholder", () => {
    const keys = parseAutoTypeSequence(
      "{TAB}{ENTER}{SPACE}{BACKSPACE}{DELETE}{ESC}{ESCAPE}{HOME}{END}{UP}{DOWN}{LEFT}{RIGHT}",
    );

    expect(keys.map((token) => (token.kind === "key" ? token.key : undefined))).toEqual([
      "tab",
      "enter",
      "space",
      "backspace",
      "delete",
      "escape",
      "escape",
      "home",
      "end",
      "up",
      "down",
      "left",
      "right",
    ]);
  });

  it("parses a delay", () => {
    expect(parseAutoTypeSequence("{DELAY 500}")).toEqual([{ kind: "delay", milliseconds: 500 }]);
  });

  it("unescapes literal braces", () => {
    expect(parseAutoTypeSequence("a{{}b{}}c")).toEqual([
      { kind: "text", text: "a" },
      { kind: "text", text: "{" },
      { kind: "text", text: "b" },
      { kind: "text", text: "}" },
      { kind: "text", text: "c" },
    ]);
  });

  it("leaves an unpaired brace as literal text", () => {
    expect(parseAutoTypeSequence("100% {sure")).toEqual([{ kind: "text", text: "100% {sure" }]);
  });

  it("rejects an unknown placeholder", () => {
    expect(() => parseAutoTypeSequence("{USERNAMEE}")).toThrow(AutoTypeSequenceError);
    expect(() => parseAutoTypeSequence("{USERNAMEE}")).toThrow(/not a known auto-type placeholder/);
  });

  it("rejects an empty placeholder", () => {
    expect(() => parseAutoTypeSequence("{}")).toThrow(AutoTypeSequenceError);
  });

  it("rejects a delay longer than the cap, so a typo can't wedge auto-type", () => {
    expect(() => parseAutoTypeSequence(`{DELAY ${MAX_AUTO_TYPE_DELAY_MS + 1}}`)).toThrow(
      /waits longer than/,
    );
  });

  it("accepts a delay exactly at the cap", () => {
    expect(parseAutoTypeSequence(`{DELAY ${MAX_AUTO_TYPE_DELAY_MS}}`)).toEqual([
      { kind: "delay", milliseconds: MAX_AUTO_TYPE_DELAY_MS },
    ]);
  });

  it("does not carry regex state between calls", () => {
    expect(parseAutoTypeSequence("{TAB}")).toEqual(parseAutoTypeSequence("{TAB}"));
  });
});

describe("autoTypeSequenceError", () => {
  it("returns undefined for a usable sequence", () => {
    expect(autoTypeSequenceError(DEFAULT_AUTO_TYPE_SEQUENCE)).toBeUndefined();
  });

  it("reports the parse failure", () => {
    expect(autoTypeSequenceError("{NOPE}")).toMatch(/not a known auto-type placeholder/);
  });

  it("rejects an empty sequence rather than silently typing nothing", () => {
    expect(autoTypeSequenceError("")).toBe("The sequence is empty");
  });
});

describe("resolveAutoTypeSequence", () => {
  it("expands fields and keeps keys and delays in order", () => {
    expect(resolveAutoTypeSequence("{USERNAME}{TAB}{PASSWORD}{DELAY 50}{ENTER}", VALUES)).toEqual([
      { kind: "text", text: "menno" },
      { kind: "key", key: "tab" },
      { kind: "text", text: "hunter2" },
      { kind: "delay", milliseconds: 50 },
      { kind: "key", key: "enter" },
    ]);
  });

  it("expands the remaining fields", () => {
    expect(resolveAutoTypeSequence("{TOTP}|{URL}|{TITLE}", VALUES)).toEqual([
      { kind: "text", text: "123456" },
      { kind: "text", text: "|" },
      { kind: "text", text: "https://github.com" },
      { kind: "text", text: "|" },
      { kind: "text", text: "GitHub" },
    ]);
  });

  it("skips an empty field but keeps the keys around it, so tabs still land right", () => {
    expect(
      resolveAutoTypeSequence(DEFAULT_AUTO_TYPE_SEQUENCE, { ...VALUES, username: "" }),
    ).toEqual([
      { kind: "key", key: "tab" },
      { kind: "text", text: "hunter2" },
      { kind: "key", key: "enter" },
    ]);
  });

  it("treats a missing TOTP code as an empty field", () => {
    expect(resolveAutoTypeSequence("{TOTP}{ENTER}", { ...VALUES, totp: undefined })).toEqual([
      { kind: "key", key: "enter" },
    ]);
  });

  it("passes focus steps through untouched, even when the field they precede is empty", () => {
    expect(
      resolveAutoTypeSequence("{FOCUS USERNAME}{USERNAME}{FOCUS PASSWORD}{PASSWORD}", {
        ...VALUES,
        username: "",
      }),
    ).toEqual([
      { kind: "focus", field: "username" },
      { kind: "focus", field: "password" },
      { kind: "text", text: "hunter2" },
    ]);
  });

  it("keeps literal text as typed", () => {
    expect(resolveAutoTypeSequence("hello", VALUES)).toEqual([{ kind: "text", text: "hello" }]);
  });
});
