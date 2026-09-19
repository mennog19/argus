import { test, expect } from "@playwright/test";

// Smoke test only: this drives the Vite dev server directly (the same UI
// code Tauri renders), not a native Tauri window, so `invoke()` has no IPC
// backend to call here — it's exercised by the Vitest component test instead.
test("loads the app shell", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /welcome to tauri \+ react/i }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Enter a name...")).toBeVisible();
});
