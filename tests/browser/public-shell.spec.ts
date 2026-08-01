import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'narrow-phone', width: 360, height: 800 }
] as const;

async function expectNoViewportOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

for (const viewport of viewports) {
  test(`sign-in stays usable at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('Email address')).toBeEditable();
    await expect(page.getByLabel('Password')).toBeEditable();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expectNoViewportOverflow(page);
  });
}

test('public entry points render without serious accessibility violations', async ({ page }) => {
  for (const path of ['/', '/login', '/station']) {
    await page.goto(path);
    await page.locator('main, .landing, .station').first().waitFor();
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
      `${path} has serious accessibility violations`
    ).toEqual([]);
    await expectNoViewportOverflow(page);
  }
});

test('protected routes preserve the intended destination through sign-in', async ({ page }) => {
  await page.goto('/timesheet');
  await expect(page).toHaveURL(/\/login\?next=%2Ftimesheet$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('badge station is a signed-out pairing surface', async ({ page }) => {
  await page.goto('/station');
  await expect(page.getByRole('heading', { name: 'Pair this device' })).toBeVisible();
  await expect(page.getByPlaceholder('Pairing code')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pair device' })).toBeDisabled();
  await expect(page.getByRole('link')).toHaveCount(0);
});
