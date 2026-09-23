import { describe, expect, it } from "vitest";
import {
  autoTypeHost,
  autoTypeMatches,
  autoTypeMatchScore,
  autoTypeSiteName,
  AUTO_TYPE_MATCH_SCORES,
} from "./auto-type-match";
import { Entry } from "./entry";

function entry(fields: { title?: string; url?: string }): Entry {
  return Entry.create({ title: fields.title ?? "", url: fields.url ?? "" });
}

describe("autoTypeHost", () => {
  it("strips the scheme, path, and a leading www.", () => {
    expect(autoTypeHost("https://www.github.com/login?next=/")).toBe("github.com");
  });

  it("handles a scheme-less URL, which entry URLs often are", () => {
    expect(autoTypeHost("github.com/login")).toBe("github.com");
  });

  it("strips credentials and a port", () => {
    expect(autoTypeHost("http://user:pw@intranet.local:8080/app")).toBe("intranet.local");
  });

  it("lower-cases and trims", () => {
    expect(autoTypeHost("  HTTPS://GitHub.COM  ")).toBe("github.com");
  });

  it("is empty for an empty URL", () => {
    expect(autoTypeHost("")).toBe("");
  });

  it("stops at a fragment or query with no path", () => {
    expect(autoTypeHost("https://example.org#top")).toBe("example.org");
  });
});

describe("autoTypeSiteName", () => {
  it("takes the label before the top-level domain", () => {
    expect(autoTypeSiteName("github.com")).toBe("github");
  });

  it("ignores subdomains", () => {
    expect(autoTypeSiteName("mail.google.com")).toBe("google");
  });

  it("is empty for a host with no dot", () => {
    expect(autoTypeSiteName("localhost")).toBe("");
  });
});

describe("autoTypeMatchScore", () => {
  it("scores a full host appearing in the window title highest", () => {
    expect(
      autoTypeMatchScore(entry({ title: "Work", url: "https://github.com" }), "github.com/login"),
    ).toBe(AUTO_TYPE_MATCH_SCORES.host);
  });

  it("falls back to the site name when the full host is absent", () => {
    expect(
      autoTypeMatchScore(
        entry({ title: "Work", url: "https://github.com" }),
        "Sign in to GitHub - Mozilla Firefox",
      ),
    ).toBe(AUTO_TYPE_MATCH_SCORES.siteName);
  });

  it("falls back to the entry title when the URL matches nothing", () => {
    expect(
      autoTypeMatchScore(entry({ title: "Jira", url: "https://github.com" }), "Jira - Chrome"),
    ).toBe(AUTO_TYPE_MATCH_SCORES.title);
  });

  it("is case-insensitive", () => {
    expect(autoTypeMatchScore(entry({ url: "https://GITHUB.com" }), "github.com")).toBe(
      AUTO_TYPE_MATCH_SCORES.host,
    );
  });

  it("does not match on anything shorter than three characters", () => {
    expect(autoTypeMatchScore(entry({ title: "Go", url: "" }), "Going to the shops")).toBe(0);
  });

  it("does not match a host with no usable site name", () => {
    expect(autoTypeMatchScore(entry({ title: "", url: "http://ab" }), "ab test")).toBe(0);
  });

  it("scores an entry with nothing to match on as zero", () => {
    expect(autoTypeMatchScore(entry({}), "Sign in - Chrome")).toBe(0);
  });

  it("scores an unrelated window as zero", () => {
    expect(
      autoTypeMatchScore(
        entry({ title: "GitHub", url: "https://github.com" }),
        "Untitled - Notepad",
      ),
    ).toBe(0);
  });
});

describe("autoTypeMatches", () => {
  it("drops non-matching entries and ranks the rest strongest first", () => {
    const byHost = entry({ title: "Zed", url: "https://github.com" });
    const bySiteName = entry({ title: "Yan", url: "https://github.io" });
    const byTitle = entry({ title: "Xylo sync", url: "" });
    const unrelated = entry({ title: "Bank", url: "https://bank.example" });

    const matches = autoTypeMatches(
      [byTitle, unrelated, bySiteName, byHost],
      "Xylo sync — github.com — Mozilla Firefox",
    );

    expect(matches.map((match) => match.entry)).toEqual([byHost, bySiteName, byTitle]);
  });

  it("breaks ties alphabetically by title so the order is stable between presses", () => {
    const beta = entry({ title: "Beta", url: "https://github.com" });
    const alpha = entry({ title: "Alpha", url: "https://github.com" });

    expect(autoTypeMatches([beta, alpha], "github.com").map((match) => match.entry.title)).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  it("returns nothing when no entry relates to the window", () => {
    expect(autoTypeMatches([entry({ title: "Bank" })], "Untitled - Notepad")).toEqual([]);
  });
});
