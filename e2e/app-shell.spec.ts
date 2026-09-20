import { test, expect } from "@playwright/test";

// Smoke test only: this drives the Vite dev server directly (the same UI
// code Tauri renders), not a native Tauri window, so there's no Tauri IPC
// backend here — settings never load and the app stays on its initial
// welcome screen, which is enough to confirm the shell renders and wires up.
test("loads the app shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /open your vault/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /open existing vault/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /create new vault/i })).toBeVisible();
});
