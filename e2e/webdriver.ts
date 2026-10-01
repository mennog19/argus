/**
 * Just enough of a W3C WebDriver client to drive the real app: tauri-driver
 * speaks the protocol over plain HTTP, so a few `fetch` calls do what a test
 * framework's whole dependency tree would otherwise be pulled in for.
 * https://www.w3.org/TR/webdriver2/
 */

/** The key the protocol returns an element's id under. */
const ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf";

/** WebDriver's codes for keys that have no character of their own. */
const KEY_CONTROL = "";
const KEY_RELEASE_ALL = "";

const POLL_INTERVAL_MS = 150;

export type Locator = { css: string } | { xpath: string };

export interface TauriCapabilities {
  /** The app's executable. */
  application: string;
}

interface ElementReference {
  [ELEMENT_KEY]: string;
}

function describe(locator: Locator): string {
  return "css" in locator ? locator.css : locator.xpath;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WebDriverSession {
  private constructor(
    private readonly serverUrl: string,
    private readonly sessionId: string,
  ) {}

  /** Launches the app and attaches to its webview. */
  static async start(serverUrl: string, app: TauriCapabilities): Promise<WebDriverSession> {
    const response = await fetch(`${serverUrl}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        capabilities: { alwaysMatch: { browserName: "wry", "tauri:options": app } },
      }),
    });
    const body = (await response.json()) as { value: { sessionId?: string; message?: string } };
    if (!response.ok || !body.value.sessionId) {
      throw new Error(`Could not start the app: ${body.value.message ?? response.statusText}`);
    }
    return new WebDriverSession(serverUrl, body.value.sessionId);
  }

  private async command<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.serverUrl}/session/${this.sessionId}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const parsed = (await response.json()) as { value: T & { message?: string } };
    if (!response.ok) {
      throw new Error(`${method} ${path} failed: ${parsed.value?.message ?? response.statusText}`);
    }
    return parsed.value;
  }

  private async findAll(locator: Locator): Promise<string[]> {
    const elements = await this.command<ElementReference[]>("POST", "/elements", {
      using: "css" in locator ? "css selector" : "xpath",
      value: describe(locator),
    });
    return elements.map((element) => element[ELEMENT_KEY]);
  }

  /** Whether the page currently has an element matching `locator`. */
  async exists(locator: Locator): Promise<boolean> {
    return (await this.findAll(locator)).length > 0;
  }

  /**
   * The first element matching `locator`, waiting for it to appear: nearly
   * everything in the app follows a key derivation or a file write.
   */
  async waitFor(locator: Locator, timeoutMs = 30_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const [element] = await this.findAll(locator);
      if (element) {
        return element;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Timed out waiting for ${describe(locator)}. The window shows: ${await this.visibleText()}`,
        );
      }
      await delay(POLL_INTERVAL_MS);
    }
  }

  /** What the window currently says, for telling why a wait gave up. */
  private async visibleText(): Promise<string> {
    const source = await this.command<string>("GET", "/source");
    const text = source
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text === "" ? "(nothing)" : text.slice(0, 500);
  }

  /** Waits until nothing matches `locator` any more. */
  async waitUntilGone(locator: Locator, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (await this.exists(locator)) {
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for ${describe(locator)} to go away`);
      }
      await delay(POLL_INTERVAL_MS);
    }
  }

  async click(locator: Locator): Promise<void> {
    const element = await this.waitFor(locator);
    await this.command("POST", `/element/${element}/click`, {});
  }

  /** Types `text` into a field, replacing whatever it held. */
  async fill(locator: Locator, text: string): Promise<void> {
    const element = await this.waitFor(locator);
    // Select-all then type, rather than the protocol's "clear": typing is
    // what a controlled React input is guaranteed to notice.
    await this.command("POST", `/element/${element}/value`, {
      text: `${KEY_CONTROL}a${KEY_RELEASE_ALL}${text}`,
    });
  }

  async text(locator: Locator): Promise<string> {
    const element = await this.waitFor(locator);
    return this.command<string>("GET", `/element/${element}/text`);
  }

  /** Ends the session, which closes the app. */
  async quit(): Promise<void> {
    await fetch(`${this.serverUrl}/session/${this.sessionId}`, { method: "DELETE" });
  }
}
