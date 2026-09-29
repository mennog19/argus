import { describe, expect, it } from "vitest";
import {
  autoTypeHost,
  autoTypeMatches,
  autoTypeMatchScore,
  autoTypeSiteName,
  autoTypeTitleMismatches,
  AUTO_TYPE_MATCH_SCORES,
} from "../../src/domain/auto-type-match";
import { Entry } from "../../src/domain/entry";

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
      autoTypeMatchScore(entry({ title: "Work", url: "https://github.com" }), {
        title: "github.com/login",
      }),
    ).toBe(AUTO_TYPE_MATCH_SCORES.host);
  });

  it("falls back to the site name when the full host is absent", () => {
    expect(
      autoTypeMatchScore(entry({ title: "Work", url: "https://github.com" }), {
        title: "Sign in to GitHub - Mozilla Firefox",
      }),
    ).toBe(AUTO_TYPE_MATCH_SCORES.siteName);
  });

  it("falls back to the entry title when the URL matches nothing", () => {
    expect(
      autoTypeMatchScore(entry({ title: "Jira", url: "https://github.com" }), {
        title: "Jira - Chrome",
      }),
    ).toBe(AUTO_TYPE_MATCH_SCORES.title);
  });

  it("is case-insensitive", () => {
    expect(autoTypeMatchScore(entry({ url: "https://GITHUB.com" }), { title: "github.com" })).toBe(
      AUTO_TYPE_MATCH_SCORES.host,
    );
  });

  it("does not match on anything shorter than three characters", () => {
    expect(
      autoTypeMatchScore(entry({ title: "Go", url: "" }), { title: "Going to the shops" }),
    ).toBe(0);
  });

  it("does not match a host with no usable site name", () => {
    expect(autoTypeMatchScore(entry({ title: "", url: "http://ab" }), { title: "ab test" })).toBe(
      0,
    );
  });

  it("scores an entry with nothing to match on as zero", () => {
    expect(autoTypeMatchScore(entry({}), { title: "Sign in - Chrome" })).toBe(0);
  });

  it("scores an unrelated window as zero", () => {
    expect(
      autoTypeMatchScore(entry({ title: "GitHub", url: "https://github.com" }), {
        title: "Untitled - Notepad",
      }),
    ).toBe(0);
  });
});

describe("autoTypeMatches", () => {
  it("drops non-matching entries and ranks the rest strongest first", () => {
    const byHost = entry({ title: "Zed", url: "https://github.com" });
    const bySiteName = entry({ title: "Yan", url: "https://github.io" });
    const byTitle = entry({ title: "Xylo sync", url: "" });
    const unrelated = entry({ title: "Bank", url: "https://bank.example" });

    const matches = autoTypeMatches([byTitle, unrelated, bySiteName, byHost], {
      title: "Xylo sync — github.com — Mozilla Firefox",
    });

    expect(matches.map((match) => match.entry)).toEqual([byHost, bySiteName, byTitle]);
  });

  it("breaks ties alphabetically by title so the order is stable between presses", () => {
    const beta = entry({ title: "Beta", url: "https://github.com" });
    const alpha = entry({ title: "Alpha", url: "https://github.com" });

    expect(
      autoTypeMatches([beta, alpha], { title: "github.com" }).map((match) => match.entry.title),
    ).toEqual(["Alpha", "Beta"]);
  });

  it("returns nothing when no entry relates to the window", () => {
    expect(autoTypeMatches([entry({ title: "Bank" })], { title: "Untitled - Notepad" })).toEqual(
      [],
    );
  });
});

describe("matching against a browser's real address", () => {
  const github = entry({ title: "GitHub", url: "https://github.com" });

  it("matches on the address, and says so", () => {
    const matches = autoTypeMatches([github], {
      title: "Sign in to GitHub · GitHub — Google Chrome",
      url: "github.com/login",
    });

    expect(matches).toEqual([
      { entry: github, score: AUTO_TYPE_MATCH_SCORES.address, verified: true },
    ]);
  });

  it("does not offer an entry to a page that only claims its name in the title", () => {
    const phishing = {
      title: "github.com – Sign in — Google Chrome",
      url: "https://github-login.evil.example/session",
    };

    expect(autoTypeMatchScore(github, phishing)).toBe(0);
    expect(autoTypeMatches([github], phishing)).toEqual([]);
  });

  it("accepts a subdomain of the entry's host, but not a lookalike ending", () => {
    const google = entry({ title: "Google", url: "google.com" });

    expect(autoTypeMatchScore(google, { title: "", url: "https://accounts.google.com/" })).toBe(
      AUTO_TYPE_MATCH_SCORES.address,
    );
    expect(autoTypeMatchScore(google, { title: "", url: "https://google.com.evil.example" })).toBe(
      0,
    );
    expect(autoTypeMatchScore(google, { title: "", url: "https://notgoogle.com" })).toBe(0);
  });

  it("never matches an entry with a URL when the address is blank", () => {
    expect(autoTypeMatchScore(github, { title: "GitHub", url: "" })).toBe(0);
  });

  it("still offers an entry with no URL on its title, ranked below address matches, unverified", () => {
    const noUrl = entry({ title: "Intranet", url: "" });

    const matches = autoTypeMatches([noUrl, github], {
      title: "Intranet — Edge",
      url: "https://github.com",
    });

    expect(matches).toEqual([
      { entry: github, score: AUTO_TYPE_MATCH_SCORES.address, verified: true },
      { entry: noUrl, score: AUTO_TYPE_MATCH_SCORES.title, verified: false },
    ]);
    expect(autoTypeMatchScore(noUrl, { title: "Something else", url: "https://github.com" })).toBe(
      0,
    );
  });

  it("marks title-only matches as unverified", () => {
    expect(autoTypeMatches([github], { title: "github.com" })[0].verified).toBe(false);
  });
});

describe("autoTypeTitleMismatches", () => {
  const github = entry({ title: "GitHub", url: "https://github.com" });
  const bank = entry({ title: "Bank", url: "https://bank.example" });
  const noUrl = entry({ title: "GitHub notes", url: "" });

  it("names the entries a page's title points at but its address rules out", () => {
    const phishing = { title: "Sign in to GitHub — Chrome", url: "https://evil.example" };

    expect(autoTypeTitleMismatches([github, bank, noUrl], phishing)).toEqual([github]);
  });

  it("is empty when the address agrees with the title", () => {
    expect(
      autoTypeTitleMismatches([github], { title: "Sign in to GitHub", url: "https://github.com" }),
    ).toEqual([]);
  });

  it("ignores a title that only happens to contain an entry's title", () => {
    const weak = entry({ title: "Chrome", url: "https://chrome.example.org" });

    expect(
      autoTypeTitleMismatches([weak], {
        title: "News — Google Chrome",
        url: "https://news.example",
      }),
    ).toEqual([]);
  });

  it("is always empty without an address, since there's nothing to contradict the title", () => {
    expect(autoTypeTitleMismatches([github], { title: "Sign in to GitHub" })).toEqual([]);
  });
});
