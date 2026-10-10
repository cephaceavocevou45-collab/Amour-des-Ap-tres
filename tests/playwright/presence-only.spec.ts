import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page, role?: string) {
  await page.setViewportSize({ width: 360, height: 800 });
  if (role) await page.addInitScript(value => {
    sessionStorage.setItem('paroisse_role', value);
    sessionStorage.setItem('paroisse_permissions', JSON.stringify(value === 'EDITEUR' ? ['PROGRAMME_BIBLIQUE'] : []));
  }, role);
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/attendance/today')) {
      return route.fulfill({ status: 200, json: [{ id: 'course-1', type: 'COURS_BIBLIQUE', date: '2026-10-05', status: 'OUVERTE', totals: { men: 0, women: 0, total: 0 } }] });
    }
    if (path.endsWith('/attendance/sheets/course-1/summary')) {
      return route.fulfill({ status: 200, json: { id: 'course-1', type: 'COURS_BIBLIQUE', date: '2026-10-05', status: 'OUVERTE', entries: [], totals: { men: 0, women: 0, total: 0 } } });
    }
    if (path.endsWith('/attendance/sheets/course-1/entries') && route.request().method() === 'POST') {
      return route.fulfill({ status: 201, json: { id: 'course-1', status: 'OUVERTE', entries: [], totals: { men: 1, women: 0, total: 1 } } });
    }
    if (path.endsWith('/attendance/week')) return route.fulfill({ status: 200, json: { days: [] } });
    if (path.endsWith('/auth/admin/members')) return route.fulfill({ status: 200, json: [] });
    if (path.includes('/attendance/course/')) return route.fulfill({ status: 200, json: { roster: [], meeting: null, selected: {} } });
    return route.fulfill({ status: 200, json: {} });
  });
}

const pages = [
  { name: 'accueil public', path: '/' },
  { name: 'connexion responsable', path: '/connexion' },
  { name: 'mot de passe oublié', path: '/mot-de-passe-oublie' },
  { name: 'première connexion', path: '/premiere-connexion' },
  { name: 'connexion administrateur', path: '/admin/connexion' },
  { name: 'connexion sous-administrateur', path: '/sous-admin/connexion' },
  { name: 'présences', path: '/presence', role: 'SECRETAIRE_PRESENCE' },
  { name: 'administration', path: '/admin', role: 'ADMIN' },
  { name: 'programme biblique', path: '/programme-biblique', role: 'SECRETAIRE_PRESENCE' },
];

for (const screen of pages) {
  test(`${screen.name} reste lisible à 360 px`, async ({ page }) => {
    await prepare(page, screen.role);
    await page.goto(screen.path);
    await expect(page.locator('body')).toBeVisible();
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content, `débordement horizontal sur ${screen.path}`).toBeLessThanOrEqual(dimensions.viewport + 1);
  });
}

test('la navigation mobile de l’accueil fonctionne au clavier', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  const toggle = page.locator('.mobile-nav');
  await expect(toggle).toBeVisible();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#mobile-navigation')).toBeVisible();
});

test('un nom hostile reste du texte dans la liste des présences', async ({ page }) => {
  const hostile = '<script>window.__presenceXss=true</script><img src=x onerror="window.__presenceXss=true">';
  await prepare(page, 'SECRETAIRE_PRESENCE');
  await page.addInitScript(() => { (window as any).__presenceXss = false; });
  await page.goto('/presence');
  await page.getByRole('button', { name: /Cours biblique/ }).click();
  await page.getByLabel('NOM ET PRÉNOM').fill(hostile);
  await page.getByRole('button', { name: /Homme/ }).click();
  await page.getByRole('button', { name: /Ajouter à la liste/ }).click();
  await expect(page.getByText(hostile, { exact: true })).toBeVisible();
  await expect(page.locator('script, img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__presenceXss)).toBe(false);
});
