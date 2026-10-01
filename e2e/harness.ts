import { ChildProcess, execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tauriConfig from "../src-tauri/tauri.conf.json" with { type: "json" };

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(E2E_DIR, "..");

const DRIVER_PORT = 4444;
export const DRIVER_URL = `http://127.0.0.1:${DRIVER_PORT}`;

/** The WebView2 runtime's entry under Edge's updater, which holds its version. */
const WEBVIEW2_CLIENT = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
const WEBVIEW2_REGISTRY_KEYS = [
  `HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_CLIENT}`,
  `HKCU\\Software\\Microsoft\\EdgeUpdate\\Clients\\${WEBVIEW2_CLIENT}`,
];

/** What Argus keeps in its app-data folder that a test run would otherwise change. */
const APP_DATA_FILES = ["settings.json", ".persisted-scope"];
const APP_DATA_BACKUP = ".e2e-backup";

/**
 * The app under test: `ARGUS_E2E_APP`, or the release build that
 * `pnpm tauri build --no-bundle` leaves behind. Not the debug build, which
 * loads its frontend from the Vite dev server rather than carrying it.
 */
export function appExecutable(): string {
  const path =
    process.env.ARGUS_E2E_APP ?? join(REPO_ROOT, "src-tauri", "target", "release", "argus.exe");
  if (!existsSync(path)) {
    throw new Error(`No app at ${path}. Build it first with: pnpm tauri build --no-bundle`);
  }
  return path;
}

function tauriDriver(): string {
  const path = join(homedir(), ".cargo", "bin", "tauri-driver.exe");
  if (!existsSync(path)) {
    throw new Error("tauri-driver is not installed. Run: cargo install tauri-driver --locked");
  }
  return path;
}

function webView2Version(): string {
  for (const key of WEBVIEW2_REGISTRY_KEYS) {
    try {
      const output = execFileSync("reg", ["query", key, "/v", "pv"], { encoding: "utf8" });
      const version = /pv\s+REG_SZ\s+([\d.]+)/.exec(output)?.[1];
      if (version && version !== "0.0.0.0") {
        return version;
      }
    } catch {
      // Not installed under this key; try the next.
    }
  }
  throw new Error("The WebView2 runtime doesn't seem to be installed.");
}

function systemTool(name: string): string {
  return join(process.env.SystemRoot ?? "C:\\Windows", "System32", name);
}

/**
 * The Edge WebDriver matching the installed WebView2 runtime, downloaded on
 * first use. The two have to be the same version, and the runtime updates
 * itself, so a driver checked in or installed once would go stale.
 */
function edgeDriver(): string {
  if (process.env.MSEDGEDRIVER) {
    return process.env.MSEDGEDRIVER;
  }
  const version = webView2Version();
  const folder = join(E2E_DIR, ".drivers", version);
  const driver = join(folder, "msedgedriver.exe");
  if (!existsSync(driver)) {
    mkdirSync(folder, { recursive: true });
    const archive = join(folder, "edgedriver.zip");
    const url = `https://msedgedriver.microsoft.com/${version}/edgedriver_win64.zip`;
    // Both ship with Windows 10 and later. Named by full path: Git puts a
    // `tar` of its own on the PATH, which takes `C:` for a remote host.
    execFileSync(systemTool("curl.exe"), [
      "--fail",
      "--silent",
      "--show-error",
      "-L",
      "-o",
      archive,
      url,
    ]);
    execFileSync(systemTool("tar.exe"), ["-xf", archive, "-C", folder]);
    rmSync(archive);
  }
  return driver;
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolvePort, reject) => {
    const attempt = () => {
      const socket = connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.destroy();
        resolvePort();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`tauri-driver didn't start listening on port ${port}`));
        } else {
          setTimeout(attempt, 100);
        }
      });
    };
    attempt();
  });
}

/** Starts tauri-driver; the returned function stops it and everything it started. */
export async function startDriver(): Promise<() => void> {
  const driver: ChildProcess = spawn(
    tauriDriver(),
    ["--port", String(DRIVER_PORT), "--native-driver", edgeDriver()],
    { stdio: "ignore" },
  );
  await waitForPort(DRIVER_PORT, 15_000);
  return () => {
    // The whole tree: tauri-driver runs msedgedriver, which runs the app.
    try {
      execFileSync("taskkill", ["/pid", String(driver.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // Already gone.
    }
  };
}

/**
 * Gives the app an empty app-data folder for the run, so that neither the
 * developer's own settings shape the test nor the test's vault ends up in
 * their recent list. The returned function puts everything back.
 *
 * Argus's folder is fixed by its identifier and can't be pointed elsewhere,
 * so the real one is used with its contents set aside. A backup left by a run
 * that died before restoring is kept as it is: that is the developer's data,
 * and what's in the folder now is the dead run's.
 */
export function isolateAppData(): () => void {
  const appData = process.env.APPDATA;
  if (!appData) {
    throw new Error("APPDATA is not set.");
  }
  const folder = join(appData, tauriConfig.identifier);
  const backup = join(folder, APP_DATA_BACKUP);

  if (!existsSync(backup)) {
    mkdirSync(backup, { recursive: true });
    for (const file of APP_DATA_FILES) {
      if (existsSync(join(folder, file))) {
        copyFileSync(join(folder, file), join(backup, file));
      }
    }
  }
  for (const file of APP_DATA_FILES) {
    rmSync(join(folder, file), { force: true });
  }

  return () => {
    for (const file of APP_DATA_FILES) {
      rmSync(join(folder, file), { force: true });
      if (existsSync(join(backup, file))) {
        copyFileSync(join(backup, file), join(folder, file));
      }
    }
    rmSync(backup, { recursive: true, force: true });
  };
}

/** A KeePass-written fixture vault, as a path in the repository. */
export function fixturePath(name: string): string {
  return join(REPO_ROOT, "tests", "fixtures", "keepass", name);
}
