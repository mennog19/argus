import { describe, expect, it } from "vitest";
import { openableUrl } from "../../src/domain/entry-url";

describe("openableUrl", () => {
  it("assumes https for a bare host or host and path", () => {
    expect(openableUrl("github.com")).toBe("https://github.com");
    expect(openableUrl("github.com/login?next=/")).toBe("https://github.com/login?next=/");
    expect(openableUrl("www.example.org")).toBe("https://www.example.org");
  });

  it("reads host:port as a host, not as a scheme called 'localhost'", () => {
    expect(openableUrl("localhost:8080")).toBe("https://localhost:8080");
    expect(openableUrl("intranet:3000/admin")).toBe("https://intranet:3000/admin");
  });

  it("assumes https for a protocol-relative URL", () => {
    expect(openableUrl("//example.com/path")).toBe("https://example.com/path");
  });

  it("leaves a URL that already has a scheme alone", () => {
    expect(openableUrl("http://192.168.1.1")).toBe("http://192.168.1.1");
    expect(openableUrl("HTTPS://Example.com")).toBe("HTTPS://Example.com");
    expect(openableUrl("ftp://files.example.com")).toBe("ftp://files.example.com");
  });

  it("leaves mailto: and tel: links alone", () => {
    expect(openableUrl("mailto:me@example.com")).toBe("mailto:me@example.com");
    expect(openableUrl("tel:+31201234567")).toBe("tel:+31201234567");
  });

  it("trims surrounding whitespace", () => {
    expect(openableUrl("  github.com  ")).toBe("https://github.com");
  });

  it("returns an empty string for an empty or blank URL", () => {
    expect(openableUrl("")).toBe("");
    expect(openableUrl("   ")).toBe("");
  });
});
