import { expect, test } from '@playwright/test';

const hostile = '<script>window.__chatXss=true</script><img src=x onerror="window.__chatXss=true"><a href="javascript:window.__chatXss=true">Lien</a><svg onload="window.__chatXss=true">SVG</svg>';

test('affiche les messages hostile comme du texte et ne les exécute pas', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    sessionStorage.setItem('paroisse_role', 'FIDELE');
    sessionStorage.setItem('paroisse_permissions', '[]');
    sessionStorage.setItem('paroisse_user_id', 'chat-user');
  });
  let sent = '';
  const conversation = {
    id: 'conversation-preview', type: 'DIRECT', title: null, updatedAt: new Date().toISOString(), memberCount: 2, unread: 0,
    members: [{ id: 'chat-user', displayName: 'Membre test', role: 'FIDELE' }, { id: 'other-user', displayName: 'Membre paroissial', role: 'FIDELE' }],
    lastMessage: { id: 'initial-message', body: hostile, createdAt: new Date().toISOString(), senderId: 'other-user', senderName: hostile },
  };
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.pathname.endsWith('/auth/session')) return route.fulfill({ status: 200, json: { user: { id: 'chat-user', role: 'FIDELE', permissions: [] } } });
    if (url.pathname.endsWith('/community/conversations') && method === 'GET') return route.fulfill({ status: 200, json: [conversation] });
    if (url.pathname.endsWith('/messages') && method === 'GET') return route.fulfill({ status: 200, json: [{ id: 'initial-message', body: hostile, createdAt: new Date().toISOString(), sender: { id: 'other-user', displayName: hostile }, mine: false, replyTo: null, reactions: [] }] });
    if (url.pathname.endsWith('/read')) return route.fulfill({ status: 201, json: { read: true } });
    if (url.pathname.endsWith('/messages') && method === 'POST') {
      sent = request.postDataJSON().body;
      return route.fulfill({ status: 201, json: { id: 'sent-message', body: sent, createdAt: new Date().toISOString(), sender: { id: 'chat-user', displayName: 'Membre test' }, mine: true, replyTo: null, reactions: [] } });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto('/messages');
  await page.getByRole('button', { name: /Membre paroissial/ }).click();
  const received = page.locator('.message').filter({ hasText: hostile }).first();
  await expect(received.locator('p')).toHaveText(hostile);
  await expect(received.locator('p *')).toHaveCount(0);
  await page.getByLabel('Votre message').fill(hostile);
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  expect(sent).toBe(hostile);
  const own = page.locator('.message.mine').filter({ hasText: hostile }).last();
  await expect(own.locator('p')).toHaveText(hostile);
  await expect(own.locator('p *')).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__chatXss)).toBeUndefined();
});
