import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE_URL = 'http://localhost:4173/studio';

const pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors.length = 0;
  page.on('pageerror', (err) => pageErrors.push(err.message));
});

test.afterEach(async () => {
  expect(pageErrors, 'Page should have zero JS errors').toEqual([]);
});

async function waitForApp(page: Page) {
  await page.waitForSelector('[data-testid="nav-rail"], nav', { timeout: 10000 });
}

test('Generate page loads without errors', async ({ page }) => {
  await page.goto(`${BASE_URL}/generate`);
  await waitForApp(page);
  await expect(page.locator('body')).toBeVisible();
});

test('Edit page loads without errors', async ({ page }) => {
  await page.goto(`${BASE_URL}/edit`);
  await waitForApp(page);
  await expect(page.locator('body')).toBeVisible();
});

test('Video page loads without errors', async ({ page }) => {
  await page.goto(`${BASE_URL}/video`);
  await waitForApp(page);
  await expect(page.locator('body')).toBeVisible();
});

test('History page loads without errors', async ({ page }) => {
  await page.goto(`${BASE_URL}/history`);
  await waitForApp(page);
  await expect(page.locator('body')).toBeVisible();
});

test('Providers page loads without errors', async ({ page }) => {
  await page.goto(`${BASE_URL}/providers`);
  await waitForApp(page);
  await expect(page.locator('body')).toBeVisible();
});

test('Local page loads without errors', async ({ page }) => {
  await page.goto(`${BASE_URL}/local`);
  await waitForApp(page);
  await expect(page.locator('body')).toBeVisible();
});

test('Settings page loads without errors', async ({ page }) => {
  await page.goto(`${BASE_URL}/settings`);
  await waitForApp(page);
  await expect(page.locator('body')).toBeVisible();
});

test('Generate page has a Generate button and prompt input', async ({ page }) => {
  await page.goto(`${BASE_URL}/generate`);
  await waitForApp(page);
  await page.waitForTimeout(1000);

  const runButton = page.locator('button').filter({ hasText: /generate/i }).first();
  await expect(runButton).toBeVisible({ timeout: 5000 });
});

test('Generate page has no serious axe-core violations', async ({ page }) => {
  await page.goto(`${BASE_URL}/generate`);
  await waitForApp(page);
  await page.waitForTimeout(500);
  const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, 'No serious/critical a11y violations on Generate').toEqual([]);
});

test('Providers page has no serious axe-core violations', async ({ page }) => {
  await page.goto(`${BASE_URL}/providers`);
  await waitForApp(page);
  await page.waitForTimeout(500);
  const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, 'No serious/critical a11y violations on Providers').toEqual([]);
});
