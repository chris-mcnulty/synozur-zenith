/**
 * E2E tests for the BL-013 notifications experience.
 *
 * Covers:
 *  1. /app/settings/notifications — change cadence, save, assert toast + persisted prefs
 *  2. Bell dropdown — assert unread count badge, click "Mark all read", verify zeroed
 *
 * Prerequisites (handled by e2e/global-setup.ts):
 *  - Test account e2etest@synozur.demo exists with role platform_owner.
 *  - At least one unread notification is seeded so test 2 is always deterministic.
 *
 * Run with:  npx playwright test e2e/notifications.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5000";
const E2E_EMAIL = "e2etest@synozur.demo";
const E2E_PASSWORD = "Zenith2025!";

// ── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Authenticate via direct API call (sets session cookie in browser context),
 * then navigate to the requested app path.
 * This is more reliable than UI form interaction for Playwright E2E tests.
 */
async function loginAndGoTo(page: Page, appPath: string) {
  // Direct API login — sets the session cookie in the browser context.
  const loginResp = await page.request.post(`${BASE_URL}/api/auth/login`, {
    data: { email: E2E_EMAIL, password: E2E_PASSWORD },
  });
  if (!loginResp.ok()) {
    const body = await loginResp.text();
    throw new Error(`Login API returned ${loginResp.status()}: ${body}`);
  }

  // Navigate to target path.
  await page.goto(`${BASE_URL}${appPath}`);
  await page.waitForLoadState("networkidle");

  // Handle tenant-select interstitial if the app presents it.
  if (page.url().includes("/select-tenant")) {
    // Try synozur.demo button first, then any org button.
    const orgBtn = page
      .locator('[data-testid*="synozur"], [data-testid^="button-select-org"], [data-testid^="card-org"]')
      .first();
    if (await orgBtn.isVisible()) {
      await orgBtn.click();
    } else {
      await page.locator("main button, main a").first().click();
    }
    await page.waitForURL((url) => !url.pathname.includes("/select-tenant"), { timeout: 10_000 });
    // Navigate again to the actual target after org selection.
    await page.goto(`${BASE_URL}${appPath}`);
    await page.waitForLoadState("networkidle");
  }
}

// ── Test suite ──────────────────────────────────────────────────────────────

test.describe("Notification Settings Page", () => {
  test("change cadence, save, assert toast and persisted preference", async ({ page }) => {
    await loginAndGoTo(page, "/app/settings/notifications");
    await page.waitForSelector('[data-testid="card-personal-preferences"]', { timeout: 15_000 });

    // Page heading visible.
    await expect(page.getByText("Notification Preferences")).toBeVisible();

    // Read the current cadence from the trigger text so we can change to a different value.
    const triggerText = (await page.locator('[data-testid="select-cadence"]').textContent()) ?? "";
    const targetCadence = triggerText.toLowerCase().includes("daily") ? "weekly" : "daily";

    // Open the Radix UI Select dropdown.
    await page.locator('[data-testid="select-cadence"]').click();
    await page.locator(`[data-testid="option-cadence-${targetCadence}"]`).waitFor({ state: "visible", timeout: 5_000 });
    await page.locator(`[data-testid="option-cadence-${targetCadence}"]`).click();

    // Wait for dropdown to close.
    await page.waitForTimeout(300);

    // Save preferences.
    await page.locator('[data-testid="button-save-preferences"]').click();

    // Assert toast.
    await expect(page.getByText("Preferences saved")).toBeVisible({ timeout: 8_000 });

    // Verify persistence via the same session's API call.
    const prefs = await page.evaluate(async () => {
      const res = await fetch("/api/notifications/preferences");
      return res.json() as Promise<{ preferences: { digestCadence: string } }>;
    });
    expect(prefs.preferences.digestCadence).toBe(targetCadence);

    // Reload page — UI should reflect the persisted value.
    await page.goto(`${BASE_URL}/app/settings/notifications`);
    await page.waitForSelector('[data-testid="card-personal-preferences"]', { timeout: 15_000 });
    const cadenceText = await page.locator('[data-testid="select-cadence"]').textContent();
    expect(cadenceText?.toLowerCase()).toContain(targetCadence);
  });
});

test.describe("Notification Bell Dropdown", () => {
  test("unread count badge shown, Mark all read zeroes the count", async ({ page }) => {
    await loginAndGoTo(page, "/app/dashboard");

    // The bell button must appear in the header.
    const bell = page.locator('[data-testid="button-notifications-bell"]');
    await expect(bell).toBeVisible({ timeout: 15_000 });

    // global-setup seeds at least one unread notification, so count > 0 is guaranteed.
    const countBefore = await page.evaluate(async () => {
      const res = await fetch("/api/notifications/unread-count");
      const data = (await res.json()) as { count: number };
      return data.count;
    });
    expect(countBefore).toBeGreaterThan(0);

    // The badge must be visible.
    const badge = page.locator('[data-testid="badge-notifications-unread-count"]');
    await expect(badge).toBeVisible();

    // Open the dropdown.
    await bell.click();
    await expect(page.locator('[data-testid="popover-notifications"]')).toBeVisible({ timeout: 5_000 });

    // "Mark all read" button must be enabled (we have unread items).
    const markAllBtn = page.locator('[data-testid="button-mark-all-read"]');
    await expect(markAllBtn).toBeEnabled();

    // Click it.
    await markAllBtn.click();
    await page.waitForTimeout(1_500);

    // Verify via API that count is now 0.
    const countAfter = await page.evaluate(async () => {
      const res = await fetch("/api/notifications/unread-count");
      const data = (await res.json()) as { count: number };
      return data.count;
    });
    expect(countAfter).toBe(0);

    // Badge should no longer be visible.
    await expect(badge).not.toBeVisible();
  });
});
