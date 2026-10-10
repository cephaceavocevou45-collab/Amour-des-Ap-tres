import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page, role?: string) {
  await page.setViewportSize({ width: 360, height: 800 });
  if (role) await page.addInitScript(value => {
    sessionStorage.setItem('paroisse_role', value);
    sessionStorage.setItem('paroisse_permissions', JSON.stringify(value === 'EDITEUR' ? ['PROGRAMME_BIBLIQUE'] : []));
  }, role);
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/session')) return route.fulfill({ status: 200, json: { user: { id: 'test-user', role } } });
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

async function seedLocalAttendance(page: Page, entry: Record<string, unknown>) {
  const rootDocument = 'http://127.0.0.1:4310/';
  await page.route(rootDocument, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.goto('/');
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('paroisse-presences', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('entries', { keyPath: 'clientUuid' });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, transaction = db.transaction('entries', 'readwrite');
        transaction.objectStore('entries').put(value);
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, entry);
  await page.unroute(rootDocument);
}

const pages = [
  { name: 'accueil public', path: '/' },
  { name: 'connexion responsable', path: '/connexion' },
  { name: 'demande d’accès aux présences', path: '/inscription-responsable' },
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

test('la demande propose les deux rôles et les sept jours du président', async ({ page }) => {
  await prepare(page);
  await page.goto('/inscription-responsable');
  await expect(page.getByLabel('Responsabilité demandée')).toBeVisible();
  await expect(page.locator('#requestedRole option[value="SECRETAIRE_PRESENCE"]')).toHaveText(/Secrétaire des présences/);
  await expect(page.locator('#requestedRole option[value="RESPONSABLE_SEMAINE"]')).toHaveText(/Président d’un jour/);
  await page.getByLabel('Responsabilité demandée').selectOption('RESPONSABLE_SEMAINE');
  const days = page.getByLabel('Jour à prendre en charge');
  await expect(days).toBeVisible();
  await expect(days.locator('option')).toHaveCount(7);
  await expect(page.getByRole('button', { name: /Envoyer ma demande/ })).toBeVisible();
});

test('un nom hostile reste du texte dans la liste des présences', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T20:00:00Z') });
  const hostile = '<script>window.__presenceXss=true</script><img src=x onerror="window.__presenceXss=true">';
  await prepare(page, 'SECRETAIRE_PRESENCE');
  await page.addInitScript(() => { (window as any).__presenceXss = false; });
  await page.goto('/presence');
  await page.getByRole('button', { name: /Cours biblique/ }).click();
  await page.getByLabel('NOM ET PRÉNOM').fill(hostile);
  await page.getByRole('button', { name: /Homme/ }).click();
  await page.getByRole('button', { name: /Ajouter à la liste/ }).click();
  await expect(page.getByText(hostile, { exact: true })).toBeVisible();
  await expect(page.locator('.entries-list script, .entries-list img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__presenceXss)).toBe(false);
});

test('un pointage synchronisé est immédiatement supprimé du stockage local', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T20:00:00Z') });
  const queued = { fullName: 'Pointage à synchroniser', sex: 'M', zone: 'FIDELES', clientUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pending: true, queuedAt: Date.now(), sheetId: 'course-1' };
  await prepare(page, 'SECRETAIRE_PRESENCE');
  await seedLocalAttendance(page, queued);
  await page.route('**/api/v1/attendance/sheets/course-1/entries', async route => route.fulfill({ status: 201, json: { id: 'course-1', type: 'COURS_BIBLIQUE', date: '2026-10-05', status: 'OUVERTE', entries: [], totals: { men: 1, women: 0, total: 1 } } }));
  await page.goto('/presence');
  await page.getByRole('button', { name: /Cours biblique/ }).click();
  await expect(page.getByText('Pointage à synchroniser')).toBeVisible();
  await page.getByRole('button', { name: /Enregistrer cette feuille/ }).click();
  await expect.poll(() => page.evaluate(() => new Promise<number>(resolve => {
    const request = indexedDB.open('paroisse-presences', 1);
    request.onsuccess = () => { const db=request.result, tx=db.transaction('entries','readonly'), count=tx.objectStore('entries').count();count.onsuccess=()=>{db.close();resolve(count.result)}; };
  }))).toBe(0);
});

test('les pointages en attente de plus de sept jours sont purgés avec un avertissement', async ({ page }) => {
  const now = Date.parse('2026-10-05T20:00:00Z');
  await page.clock.install({ time: now });
  const queued = { fullName: 'Ancien pointage', sex: 'F', zone: 'FIDELES', clientUuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', pending: true, queuedAt: now - 8 * 24 * 60 * 60_000, sheetId: 'course-1' };
  await prepare(page, 'SECRETAIRE_PRESENCE');
  await seedLocalAttendance(page, queued);
  await page.goto('/presence');
  await expect(page.getByRole('alert')).toContainText('plus de 7 jours');
  await page.getByRole('button', { name: /Cours biblique/ }).click();
  await expect(page.getByText('Ancien pointage')).toHaveCount(0);
});

test('la déconnexion efface les pointages stockés sur cet appareil', async ({ page }) => {
  const queued = { fullName: 'Présence privée locale', sex: 'M', zone: 'TEMPLE', clientUuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', pending: true, queuedAt: Date.now(), sheetId: 'course-1' };
  await prepare(page, 'SECRETAIRE_PRESENCE');
  await seedLocalAttendance(page, queued);
  await page.goto('/presence');
  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await expect(page).toHaveURL(/\/connexion$/);
  await expect.poll(() => page.evaluate(() => new Promise<number>(resolve => {
    const request = indexedDB.open('paroisse-presences', 1);
    request.onsuccess = () => { const db=request.result, tx=db.transaction('entries','readonly'), count=tx.objectStore('entries').count();count.onsuccess=()=>{db.close();resolve(count.result)}; };
  }))).toBe(0);
});

test('une session refusée par le serveur ne peut pas afficher les pointages en attente', async ({ page }) => {
  const queued = { fullName: 'Présence privée invalidée', sex: 'F', zone: 'TEMPLE', clientUuid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', pending: true, queuedAt: Date.now(), sheetId: 'course-1' };
  await prepare(page, 'SECRETAIRE_PRESENCE');
  await page.route('**/api/v1/auth/session', route => route.fulfill({ status: 401, json: { message: 'Connexion requise.' } }));
  await seedLocalAttendance(page, queued);
  await page.goto('/presence');
  await expect(page).toHaveURL(/\/connexion$/);
  await expect(page.getByText('Présence privée invalidée')).toHaveCount(0);
});
