import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

async function prepare(page: Page, role?: string) {
  await page.setViewportSize({ width: 360, height: 800 });
  const managedPresenters = [
    { id: 'presenter-christian', firstName: 'Christian', lastName: 'TABO', grade: 'Dehoto', active: true, roles: [{ role: 'PRESENTATION_THEME' }] },
    { id: 'presenter-jean', firstName: 'Jean', lastName: 'SEWADE', grade: 'Évangéliste', active: true, roles: [{ role: 'PRESENTATION_THEME' }] }
  ];
  if (role) await page.addInitScript(value => {
    sessionStorage.setItem('paroisse_role', value);
    sessionStorage.setItem('paroisse_permissions', JSON.stringify(value === 'EDITEUR' ? ['PROGRAMME_BIBLIQUE'] : []));
  }, role);
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/public/team')) return route.fulfill({ status: 200, json: [
      { id: 'presenter-assou', name: 'ASSOU Félicien', grade: 'Assistant Évangéliste', roles: ['PRESENTATION_THEME'] },
      { id: 'presenter-isac', name: 'SEWADE Isaac', grade: 'Évangéliste', roles: ['PRESENTATION_THEME'] },
      { id: 'presenter-christian', name: 'TABO Christian', grade: 'Dehoto', roles: ['PRESENTATION_THEME'] },
      { id: 'presenter-jean', name: 'SEWADE Jean', grade: 'Évangéliste', roles: ['PRESENTATION_THEME'] }
    ] });
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
    if (path.endsWith('/auth/admin/presenters')) {
      if (route.request().method() === 'GET') return route.fulfill({ status: 200, json: managedPresenters });
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        const created = { id: 'presenter-added', firstName: body.firstName, lastName: body.lastName, grade: body.grade, active: true, roles: [{ role: 'PRESENTATION_THEME' }] };
        managedPresenters.push(created);
        return route.fulfill({ status: 201, json: created });
      }
    }
    if (path.includes('/auth/admin/presenters/')) {
      const id = path.split('/').at(-1) === 'retirer' ? path.split('/').at(-2)! : path.split('/').at(-1)!;
      if (path.endsWith('/retirer')) {
        const index = managedPresenters.findIndex(person => person.id === id);
        if (index >= 0) managedPresenters.splice(index, 1);
        return route.fulfill({ status: 200, json: { id, removed: true } });
      }
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON();
        const index = managedPresenters.findIndex(person => person.id === id);
        if (index >= 0) managedPresenters[index] = { ...managedPresenters[index], firstName: body.firstName, lastName: body.lastName, grade: body.grade };
        return route.fulfill({ status: 200, json: managedPresenters[index] });
      }
    }
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
    await expect(page.locator('parish-footer')).toHaveCount(1);
    await expect(page.locator('parish-footer')).toContainText('AMOUR DES APÔTRES');
    await expect(page.locator('parish-footer')).toContainText('+229 01 97 12 77 69');
    await expect(page.locator('parish-footer a[href*="connexion"]')).toHaveCount(0);
    const technicalEmail = page.getByRole('link', { name: 'Ouvrir Gmail pour écrire au développeur à cephacemacevo@gmail.com' });
    await expect(technicalEmail).toHaveAttribute('href', 'https://mail.google.com/mail/?view=cm&fs=1&to=cephacemacevo%40gmail.com');
    await expect(technicalEmail).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('link', { name: 'Écrire au développeur avec l’application e-mail de cet appareil' })).toHaveAttribute('href', 'mailto:cephacemacevo@gmail.com');
    await expect(page.locator('parish-footer')).toContainText('Développement technique : cephacemacevo@gmail.com');
    await expect(page.locator('parish-footer')).toContainText('Pour un problème technique seulement. N’envoyez jamais de mot de passe ni de nom de fidèle par e-mail.');
    await technicalEmail.focus();
    await expect(technicalEmail).toBeFocused();
    await expect(technicalEmail).toHaveCSS('outline-style', 'solid');
    const contrast = await technicalEmail.evaluate(element => {
      const parse = (value: string) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
      const luminance = (value: string) => {
        const channels = parse(value).map(channel => channel / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const foreground = luminance(getComputedStyle(element).color);
      const background = luminance(getComputedStyle(element.closest('footer')!).backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    });
    expect(contrast, 'le lien technique respecte le contraste WCAG AA').toBeGreaterThanOrEqual(4.5);
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content, `débordement horizontal sur ${screen.path}`).toBeLessThanOrEqual(dimensions.viewport + 1);
  });
}

const publicScreens = pages.filter(screen => !screen.role);
const responsiveWidths = [320, 360, 390, 412, 768];

async function expectNoHorizontalOverflow(page: Page, route: string, viewport: string) {
  const dimensions = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const offenders = [...body.querySelectorAll<HTMLElement>('*')]
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.right > root.clientWidth + 1 || rect.left < -1);
      })
      .sort((left, right) => right.getBoundingClientRect().right - left.getBoundingClientRect().right)
      .slice(0, 12)
      .map(element => ({
        tag: element.tagName.toLowerCase(),
        className: String(element.className).slice(0, 80),
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
        text: (element.textContent ?? '').trim().slice(0, 45),
      }));
    return {
      documentClient: root.clientWidth,
      documentScroll: root.scrollWidth,
      bodyClient: body.clientWidth,
      bodyScroll: body.scrollWidth,
      overflowingBoxes: [...body.querySelectorAll<HTMLElement>('*')]
        .filter(element => element.scrollWidth > element.clientWidth + 1)
        .slice(0, 12)
        .map(element => ({ tag: element.tagName.toLowerCase(), className: String(element.className).slice(0, 60), client: element.clientWidth, scroll: element.scrollWidth, overflowX: getComputedStyle(element).overflowX })),
      offenders,
    };
  });
  const diagnostic = JSON.stringify({ offenders: dimensions.offenders, overflowingBoxes: dimensions.overflowingBoxes });
  expect(dimensions.documentScroll, `${route} (${viewport}) document: ${diagnostic}`).toBeLessThanOrEqual(dimensions.documentClient);
  expect(dimensions.bodyScroll, `${route} (${viewport}) body: ${diagnostic}`).toBeLessThanOrEqual(dimensions.bodyClient);
}

for (const screen of publicScreens) {
  test(`${screen.name} sans débordement à toutes les largeurs, en paysage et avec texte à 200 %`, async ({ page }) => {
    await prepare(page);
    await page.goto(screen.path);
    await expect(page.locator('body')).toBeVisible();
    for (const width of responsiveWidths) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page, screen.path, `${width}px`);
    }
    for (const viewport of [{ width: 568, height: 320 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page, screen.path, `${viewport.width}x${viewport.height} paysage`);
    }
    if (screen.path === '/') {
      const captures = resolve(process.cwd(), 'docs/design/captures');
      mkdirSync(captures, { recursive: true });
      for (const width of [320, 360, 412, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: resolve(captures, `accueil-${width}.png`), fullPage: true });
      }
    }
    await page.evaluate(() => {
      const elements = [...document.querySelectorAll<HTMLElement>('body, body *')];
      const sizes = elements.map(element => ({ element, size: Number.parseFloat(getComputedStyle(element).fontSize) }));
      for (const { element, size } of sizes) {
        if (Number.isFinite(size) && size > 0) element.style.setProperty('font-size', `${size * 2}px`, 'important');
      }
    });
    for (const width of responsiveWidths) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page, screen.path, `${width}px, texte 200 %`);
    }
    for (const viewport of [{ width: 568, height: 320 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page, screen.path, `${viewport.width}x${viewport.height} paysage, texte 200 %`);
    }
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

test('le lien du pied de page ouvre la rédaction Gmail et garde le secours mailto', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await page.context().route('https://mail.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Compose</title>' }));
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Ouvrir Gmail pour écrire au développeur à cephacemacevo@gmail.com' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/mail\.google\.com\/mail\//);
  await expect(popup).toHaveTitle('Compose');
  await expect(page.getByRole('link', { name: 'Écrire au développeur avec l’application e-mail de cet appareil' })).toHaveAttribute('href', 'mailto:cephacemacevo@gmail.com');
});

test('l’emblème de connexion et d’inscription conserve le fond ivoire du point 02 sur téléphone', async ({ page }) => {
  await prepare(page);
  for (const path of ['/connexion', '/inscription-responsable']) {
    await page.goto(path);
    const brandPanel = page.locator('.auth-brand-panel');
    await expect(brandPanel).toBeVisible();
    await expect(brandPanel.locator('img')).toBeVisible();
    await expect.poll(() => brandPanel.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(242, 238, 228)');
  }
});

test('le point 02 de l’accueil affiche l’emblème fourni de la paroisse', async ({ page }) => {
  await page.goto('/');
  const emblem = page.locator('.leader-mark-seal img');
  await expect(emblem).toHaveAttribute('src', 'paroisse-emblem-720.webp');
  await expect(emblem).toHaveAttribute('alt', 'Emblème de la paroisse Amour des Apôtres');
  await expect(page.locator('.leader-mark-seal source')).toHaveAttribute('srcset', 'paroisse-emblem-480.webp 480w, paroisse-emblem-720.webp 720w');
  await expect.poll(() => emblem.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => emblem.evaluate(image => Math.round(image.getBoundingClientRect().width))).toBeGreaterThan(230);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => emblem.evaluate(image => Math.round(image.getBoundingClientRect().width))).toBeGreaterThan(180);
});

test('l’ordre de lecture est logique, les images ont un texte alternatif et le menu reste navigable', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('img:not([alt])')).toHaveCount(0);
  const mobileToggle = page.locator('.mobile-nav');
  await mobileToggle.focus();
  await expect(mobileToggle).toBeFocused();
  await expect(mobileToggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(mobileToggle).toHaveAttribute('aria-expanded', 'true');
  const links = page.locator('#mobile-navigation a');
  await expect(links.first()).toHaveAttribute('href', '#prochain-cours');
  await links.first().focus();
  await expect(links.first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(links.nth(1)).toBeFocused();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('l’administrateur peut ajouter, modifier et retirer un intervenant du point 06', async ({ page }) => {
  await prepare(page, 'ADMIN');
  page.on('dialog', dialog => dialog.accept('mot-de-passe-de-test'));
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Intervenants du thème' })).toBeVisible();

  await page.locator('[name="newPresenterFirstName"]').fill('Brice');
  await page.locator('[name="newPresenterLastName"]').fill('DAYE');
  await page.locator('[name="newPresenterGrade"]').fill('Senior Lead');
  await page.locator('[name="newPresenterReason"]').fill('Ajout approuvé par le dirigeant paroissial.');
  await page.getByRole('button', { name: 'Ajouter à la liste du point 06' }).click();
  const added = page.locator('[data-presenter-id="presenter-added"]');
  await expect(added).toBeVisible();

  await added.getByLabel('Prénom').fill('Brice Junior');
  await added.getByLabel('Motif obligatoire').fill('Correction du prénom confirmée par le dirigeant.');
  await added.getByRole('button', { name: 'Enregistrer la modification' }).click();
  await expect(page.getByText('Intervenant modifié. La page d’accueil affichera le changement.')).toBeVisible();

  await added.getByLabel('Motif obligatoire').fill('La personne ne poursuit plus ce service.');
  await added.getByRole('button', { name: 'Retirer du point 06' }).click();
  await expect(added).toHaveCount(0);
});

test('l’accueil présente les trois portraits et les rubriques doctrinales sur téléphone', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /Vénérable Suprême Évangéliste SEWADE KOUESSIVI Lucien/ })).toBeVisible();
  await expect(page.locator('.leader-copy h2')).toContainText('KOUESSIVI Lucien');
  await expect(page.locator('.leader-copy h2')).toContainText('SEWADE');
  await expect(page.getByText('Échange des moniteurs')).toBeVisible();
  await expect(page.getByText('Explication du thème')).toBeVisible();
  const presenters = page.locator('.presenter-list');
  await expect(presenters).toContainText('Dehoto - TABO Christian');
  await expect(presenters).toContainText('Évangéliste - SEWADE Jean');
  await expect(presenters.locator('.presenter-grade').filter({ hasText: 'Dehoto' })).toBeVisible();
  await expect(presenters.locator('.presenter-grade').filter({ hasText: /^Évangéliste$/ }).first()).toBeVisible();
  await expect(page.locator('parish-footer')).not.toContainText('SEWADE KOUESSIVI Lucien');
  await expect(page.locator('parish-footer a[href="tel:+2290197127769"]')).toContainText('Appeler');
  await expect(page.locator('parish-footer a[href="https://wa.me/2290197127769"]')).toContainText('WhatsApp');
  await expect(page.locator('parish-footer a[href="tel:+2290157179683"]')).toContainText('Appeler');
  await expect(page.locator('parish-footer a[href="https://wa.me/2290157179683"]')).toContainText('WhatsApp');
  await expect(page.locator('parish-footer img[src="ecc-emblem.webp"]')).toBeVisible();
  for (const source of ['leader-720.webp', 'fondateur-ecc-640.webp', 'jesus-christ-720.webp', 'bible-goun-720.webp']) {
    const image = page.locator(`img[src="${source}"]`);
    await expect(image).toBeVisible();
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  }
  await page.getByRole('tab', { name: /04 sacrements/ }).click();
  await expect(page.locator('.doctrine-card')).toHaveCount(4);
  await page.getByRole('tab', { name: /10 commandements/ }).click();
  await expect(page.locator('.doctrine-card')).toHaveCount(10);
  await page.getByRole('tab', { name: /12 interdits/ }).click();
  await expect(page.locator('.doctrine-card')).toHaveCount(12);
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content, 'débordement horizontal de l’accueil sur mobile').toBeLessThanOrEqual(dimensions.viewport + 1);
});

test('le compte à rebours suit les horaires du lundi à Cotonou', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-05T18:29:00Z') }); // lundi, 19 h 29 à Porto-Novo
  await prepare(page);
  await page.goto('/');
  await expect(page.getByTestId('next-course-date')).toContainText('lundi 5 octobre 2026');
  await expect(page.getByTestId('course-status')).toHaveText('Prochaine rencontre');
  await page.clock.setFixedTime(new Date('2026-10-05T18:30:00Z'));
  await page.clock.fastForward(1_000);
  await expect(page.getByTestId('course-status')).toHaveText('Séance en cours');
  await page.clock.setFixedTime(new Date('2026-10-05T20:29:00Z'));
  await page.clock.fastForward(1_000);
  await expect(page.getByTestId('course-status')).toHaveText('Séance en cours');
  await page.clock.setFixedTime(new Date('2026-10-05T20:30:00Z'));
  await page.clock.fastForward(1_000);
  await expect(page.getByTestId('course-status')).toHaveText('Prochaine rencontre');
  await expect(page.getByTestId('next-course-date')).toContainText('lundi 12 octobre 2026');
  await page.clock.setFixedTime(new Date('2026-10-06T18:30:00Z'));
  await page.clock.fastForward(1_000);
  await expect(page.getByTestId('course-status')).toHaveText('Prochaine rencontre');
  await expect(page.getByTestId('next-course-date')).toContainText('lundi 12 octobre 2026');
});

test('les champs du nom de l’équipe affichent le HTML hostile comme texte', async ({ page }) => {
  const hostile = '<script>window.__homeXss=true</script><img src=x onerror="window.__homeXss=true">';
  await page.addInitScript(() => { (window as any).__homeXss = false; });
  await prepare(page);
  await page.route('**/api/v1/public/team', route => route.fulfill({ status: 200, json: [
    { id: 'xss-grade', name: hostile, grade: hostile, roles: ['PRESENTATION_THEME'] }
  ] }));
  await page.goto('/');
  await expect(page.locator('.presenter-list')).toContainText(hostile);
  await expect(page.locator('.presenter-list script, .presenter-list img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__homeXss)).toBe(false);
});

test('accueil sans débordement et captures responsives à 360, 768 et 1440 px', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.locator('.hero-photo img').evaluate((img: HTMLImageElement) => img.decode());
  const captureDir = resolve(process.cwd(), 'docs', 'design', 'captures');
  mkdirSync(captureDir, { recursive: true });
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 360 ? 800 : 1000 });
    await expect(page.locator('.hero h1')).toBeVisible();
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content, `débordement horizontal à ${width} px`).toBeLessThanOrEqual(dimensions.viewport + 1);
    await page.screenshot({ path: resolve(captureDir, `accueil-${width}.png`), fullPage: true, animations: 'disabled' });
  }
});

test('les couleurs principales de l’accueil respectent WCAG AA pour le texte', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  const results = await page.evaluate(() => {
    const selectors = [
      '.hero .eyebrow', '.hero h1', '.hero-role', '.hero-copy>p:not(.hero-role)', '.hero-verse small', '.gold-button', '.quiet-link',
      '.course-kicker', '.course-card h2', '.course-card p', '.course-status', '.course-countdown', '.section-kicker',
      '.welcome-layout>div:first-child>p', '.welcome-quote p', '.portrait-card figcaption>small', '.bible-heading p',
      '.study-layout>div:first-child>p', '.study-steps strong', '.faith-heading>div>p', '.doctrine-card h3', '.team-heading>p',
      '.attendance-cta>p', '.site-footer .footer-bottom'
    ];
    const parse = (value: string) => {
      const parts = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
    };
    const luminance = (color: number[]) => {
      const channels = color.map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    };
    const output: Array<{selector: string; ratio: number}> = [];
    for (const selector of selectors) {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) continue;
      let background: HTMLElement | null = element;
      while (background && getComputedStyle(background).backgroundColor.endsWith(', 0)')) background = background.parentElement;
      const fg = parse(getComputedStyle(element).color);
      const bg = parse(background ? getComputedStyle(background).backgroundColor : 'rgb(255,255,255)');
      const l1 = luminance(fg), l2 = luminance(bg);
      output.push({ selector, ratio: (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05) });
    }
    return output;
  });
  const failing = results.filter(({ selector, ratio }) => ratio < (selector.includes('kicker') ? 4.5 : 4.5));
  expect(failing, `contraste insuffisant : ${JSON.stringify(failing)}`).toEqual([]);
});

test('chaque nœud de texte visible de l’accueil respecte le contraste WCAG AA', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  const failures = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const bad: Array<{text: string; foreground: string; background: string; ratio: number}> = [];
    const color = (value: string) => {
      const parts = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
      return { channels: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0], alpha: parts[3] ?? 1 };
    };
    const lum = (channels: number[]) => {
      const linear = channels.map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
      return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
    };
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const element = node.parentElement as HTMLElement | null;
      if (!text || !element || element.closest('[aria-hidden="true"]')) continue;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || getComputedStyle(element).visibility === 'hidden') continue;
      const foreground = color(getComputedStyle(element).color);
      let parent: HTMLElement | null = element;
      let backdrop = { channels: [255, 255, 255], alpha: 1 };
      while (parent) {
        const candidate = color(getComputedStyle(parent).backgroundColor);
        if (candidate.alpha > 0) { backdrop = candidate; break; }
        parent = parent.parentElement;
      }
      const background = backdrop.channels.map((channel, index) => Math.round(channel * backdrop.alpha + 255 * (1 - backdrop.alpha)));
      const light = lum(foreground.channels), dark = lum(background);
      const ratio = (Math.max(light, dark) + .05) / (Math.min(light, dark) + .05);
      if (ratio < 4.5) bad.push({ text: text.slice(0, 90), foreground: getComputedStyle(element).color, background: getComputedStyle(parent ?? document.body).backgroundColor, ratio: Number(ratio.toFixed(2)) });
    }
    return bad;
  });
  expect(failures, `éléments texte insuffisamment contrastés : ${JSON.stringify(failures)}`).toEqual([]);
});

test('l’accueil respecte reduced-motion et termine le reveal du héros en moins de 1,2 s', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-11T10:00:00Z') });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepare(page);
  await page.goto('/');
  await expect(page.locator('.hero-photo img')).toBeVisible();
  await expect.poll(() => page.locator('.hero-photo').evaluate(el => getComputedStyle(el).clipPath)).toBe('none');
  expect(await page.locator('.hero h1').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await page.waitForTimeout(1_250);
  const pending = await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length);
  expect(pending, 'le reveal du héros doit finir rapidement et aucun autre contenu ne doit s’animer').toBe(0);
});

test('les ressources d’accueil respectent les budgets locaux et ne provoquent pas de décalage visible', async ({ page }) => {
  const publicDir = resolve(process.cwd(), 'apps', 'web', 'public');
  const fontBytes = [
    'fonts/roboto-slab-latin-400-normal.woff2', 'fonts/roboto-slab-latin-ext-400-normal.woff2',
    'fonts/lato-latin-400-normal.woff2', 'fonts/lato-latin-ext-400-normal.woff2'
  ].reduce((total, file) => total + statSync(resolve(publicDir, file)).size, 0);
  expect(fontBytes, 'fonts locales sous 60 Ko au total').toBeLessThanOrEqual(60 * 1024);
  for (const file of ['leader-480.webp', 'leader-720.webp', 'fondateur-ecc-480.webp', 'fondateur-ecc-640.webp', 'jesus-christ-480.webp', 'jesus-christ-720.webp', 'bible-goun-480.webp', 'bible-goun-720.webp', 'og-paroisse.jpg']) {
    expect(statSync(resolve(publicDir, file)).size, `${file} sous 100 Ko`).toBeLessThan(100 * 1024);
  }
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
  await page.addInitScript(() => {
    (window as any).__homeVitals = { cls: 0, lcp: 0 };
    new PerformanceObserver(list => {
      for (const entry of list.getEntries() as any[]) {
        if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) (window as any).__homeVitals.cls += entry.value;
        if (entry.entryType === 'largest-contentful-paint') (window as any).__homeVitals.lcp = entry.startTime;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries() as any[]) {
        (window as any).__homeVitals.lcp = entry.startTime;
        (window as any).__homeVitals.lcpEntry = { name: entry.name, element: (entry as any).element?.outerHTML?.slice(0, 120), startTime: entry.startTime, loadTime: (entry as any).loadTime, renderTime: (entry as any).renderTime };
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  await prepare(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024,
    latency: 150, connectionType: 'cellular3g'
  });
  await page.goto('/');
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(350);
  const vitals = await page.evaluate(() => ({
    ...(window as any).__homeVitals,
    slowResources: performance.getEntriesByType('resource').map((entry: any) => ({ name: entry.name.split('/').at(-1), duration: Math.round(entry.duration), bytes: entry.transferSize })).filter((entry: any) => entry.duration > 150).sort((a: any, b: any) => b.duration - a.duration).slice(0, 8)
  }));
  console.log(`Accueil local sous réseau simulé 1,6 Mbit/s et latence 150 ms : fontes ${fontBytes} octets, LCP ${Math.round(vitals.lcp)} ms, CLS ${vitals.cls.toFixed(3)}, élément LCP ${JSON.stringify(vitals.lcpEntry)}, ressources lentes ${JSON.stringify(vitals.slowResources)}.`);
  expect(vitals.cls, `CLS local mesuré ${vitals.cls}`).toBeLessThan(0.05);
  expect(vitals.lcp, `LCP local mesuré ${vitals.lcp} ms`).toBeGreaterThan(0);
  expect(vitals.lcp, `LCP local mesuré ${vitals.lcp} ms`).toBeLessThan(2_500);
  expect(pageErrors, `erreurs navigateur : ${pageErrors.join(' | ')}`).toEqual([]);
});

test('la création des comptes responsables est réservée à l’administration', async ({ page }) => {
  await prepare(page);
  await page.goto('/inscription-responsable');
  await expect(page).toHaveURL(/\/connexion$/);
  await expect(page.getByText(/comptes responsables sont créés par l’administration paroissiale/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Envoyer ma demande/ })).toHaveCount(0);
  await expect(page.locator('#requestedRole')).toHaveCount(0);
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
