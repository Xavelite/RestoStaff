import { expect, test, type Page } from '@playwright/test';

type RoleFixture = {
  name: string;
  email: string | undefined;
  password: string | undefined;
  destination: '/home' | '/my-service';
  visibleModule: string;
  forbiddenPath: string;
  desktopPaths: string[];
  mobilePath: string;
};

const fixtures: RoleFixture[] = [
  {
    name: 'owner',
    email: process.env.E2E_OWNER_EMAIL,
    password: process.env.E2E_OWNER_PASSWORD,
    destination: '/home',
    visibleModule: 'Payroll',
    forbiddenPath: '/my-service',
    desktopPaths: ['/home', '/restaurant', '/team', '/schedule', '/timesheet', '/badge-terminal'],
    mobilePath: '/schedule'
  },
  {
    name: 'manager',
    email: process.env.E2E_MANAGER_EMAIL,
    password: process.env.E2E_MANAGER_PASSWORD,
    destination: '/home',
    visibleModule: 'Schedule',
    forbiddenPath: '/payroll',
    desktopPaths: ['/home', '/restaurant', '/team', '/schedule', '/timesheet', '/badge-terminal'],
    mobilePath: '/timesheet'
  },
  {
    name: 'employee',
    email: process.env.E2E_EMPLOYEE_EMAIL,
    password: process.env.E2E_EMPLOYEE_PASSWORD,
    destination: '/my-service',
    visibleModule: 'My time',
    forbiddenPath: '/team',
    desktopPaths: ['/my-service', '/my-time'],
    mobilePath: '/my-service'
  }
];

async function signIn(page: Page, fixture: RoleFixture): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(fixture.email ?? '');
  await page.getByLabel('Password').fill(fixture.password ?? '');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`${fixture.destination.replace('/', '\\/')}$`));
}

for (const fixture of fixtures) {
  test(`${fixture.name} shell exposes only its authorized workspace`, async ({ page }) => {
    test.slow();
    test.skip(
      !fixture.email || !fixture.password,
      `Set E2E_${fixture.name.toUpperCase()}_EMAIL and E2E_${fixture.name.toUpperCase()}_PASSWORD.`
    );

    await signIn(page, fixture);
    await expect(page.getByRole('link', { name: fixture.visibleModule, exact: true })).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    for (const path of fixture.desktopPaths) {
      await page.goto(path);
      await expect(page.locator('.cl-main')).toBeVisible();
      await expect(page).not.toHaveURL(/\/login/);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(fixture.mobilePath);
    await expect(page.locator('.cl-main')).toBeVisible();
    const overflow = await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.goto(fixture.forbiddenPath);
    await expect(page).not.toHaveURL(new RegExp(`${fixture.forbiddenPath}$`));
  });
}

test('the optional assistant stays clear of the messenger action', async ({ page }) => {
  test.slow();
  const owner = fixtures[0];
  test.skip(!owner.email || !owner.password, 'Set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD.');

  await signIn(page, owner);
  await page.evaluate(() => {
    localStorage.setItem('rst-popcorn-pet-visible', 'on');
    localStorage.setItem('rst-popcorn-pet-position', JSON.stringify({ x: 9999, y: 9999 }));
  });
  await page.reload();

  const pet = page.getByRole('complementary', { name: 'Popcorn' });
  const messenger = page.getByRole('button', { name: 'Team messages' });
  await expect(pet).toBeVisible();
  await expect(messenger).toBeVisible();
  const [petBox, messengerBox] = await Promise.all([pet.boundingBox(), messenger.boundingBox()]);
  expect(petBox).not.toBeNull();
  expect(messengerBox).not.toBeNull();
  const separated =
    petBox!.x + petBox!.width <= messengerBox!.x ||
    messengerBox!.x + messengerBox!.width <= petBox!.x ||
    petBox!.y + petBox!.height <= messengerBox!.y ||
    messengerBox!.y + messengerBox!.height <= petBox!.y;
  expect(separated).toBe(true);
});
