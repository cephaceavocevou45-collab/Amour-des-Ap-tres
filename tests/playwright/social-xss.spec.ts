import { expect, test } from '@playwright/test';

const postPayload = '<script>window.__xssExecuted = true</script><b>HTML</b><img src=x onerror="window.__xssExecuted = true"><svg onload="window.__xssExecuted = true">SVG</svg>';
const commentPayload = '<script>window.__xssCommentExecuted = true</script><i>Commentaire HTML</i><img src=x onerror="window.__xssCommentExecuted = true"><svg onload="window.__xssCommentExecuted = true">SVG</svg>';

const hostileName = '<img src=x onerror="window.__xssNameExecuted = true"><a href="javascript:window.__xssNameExecuted = true">Profil</a>';
const post = (body: string) => ({
  id: 'post-xss-e2e', body, visibility: 'TOUS_LES_FIDELES', pinned: false,
  createdAt: '2026-10-07T10:00:00.000Z', author: { id: 'fidele-e2e', displayName: hostileName },
  sharedPost: null, commentCount: 0, likes: 0, hearts: 0, likedByMe: false, heartedByMe: false,
});

 test('renders hostile publication and comment payloads as text without executing markup', async ({ page }) => {
  const posts: ReturnType<typeof post>[] = [];
  let comments: object[] = [];
  await page.addInitScript(() => sessionStorage.setItem('paroisse_role', 'FIDELE'));
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === '/api/v1/auth/session') {
      return route.fulfill({ json: { user: { id: 'fidele-e2e', role: 'FIDELE' } } });
    }
    if (url.pathname === '/api/v1/social/settings') {
      return route.fulfill({ json: { notificationsEnabled: false } });
    }
    if (url.pathname === '/api/v1/social/profile') {
      return route.fulfill({ json: { displayName: hostileName, bio: '', profileDiscoverable: true } });
    }
    if (url.pathname === '/api/v1/social/posts' && method === 'GET') {
      return route.fulfill({ json: { items: posts, nextCursor: null } });
    }
    if (url.pathname === '/api/v1/social/posts' && method === 'POST') {
      const item = post(request.postDataJSON().body);
      posts.unshift(item);
      return route.fulfill({ status: 201, json: item });
    }
    if (url.pathname === '/api/v1/social/posts/post-xss-e2e/comments' && method === 'GET') {
      return route.fulfill({ json: comments });
    }
    if (url.pathname === '/api/v1/social/posts/post-xss-e2e/comments' && method === 'POST') {
      const item = { id: 'comment-xss-e2e', body: request.postDataJSON().body, createdAt: '2026-10-07T10:01:00.000Z', author: { id: 'fidele-e2e', displayName: hostileName }, replies: [] };
      comments = [item];
      return route.fulfill({ status: 201, json: item });
    }
    return route.fulfill({ status: 200, json: {} });
  });

  await page.goto('/actualites');
  await page.getByLabel('Votre publication').fill(postPayload);
  await page.getByRole('button', { name: 'Publier' }).click();
  const renderedPost = page.locator('.post-body');
  await expect(renderedPost).toHaveText(postPayload);
  await expect(renderedPost.locator('*')).toHaveCount(0);
  await expect(page.locator('.post-author strong')).toHaveText(hostileName);
  await expect(page.locator('.post-author a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.evaluate(() => (window as any).__xssExecuted)).resolves.toBeUndefined();

  await page.getByRole('button', { name: /Commentaires/ }).click();
  await page.getByPlaceholder('Écrire un commentaire…').fill(commentPayload);
  await page.getByRole('button', { name: 'Envoyer' }).click();
  const renderedComment = page.locator('.comment p');
  await expect(renderedComment).toHaveText(commentPayload);
  await expect(renderedComment.locator('*')).toHaveCount(0);
  await expect(page.evaluate(() => (window as any).__xssCommentExecuted)).resolves.toBeUndefined();
  await expect(page.locator('.comment strong')).toHaveText(hostileName);
  await expect(page.locator('.comment a[href^="javascript:"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Mon profil' }).click();
  const profileName = page.locator('.profile-name');
  await expect(profileName).toHaveText(hostileName);
  await expect(profileName.locator('*')).toHaveCount(0);
  await expect(page.evaluate(() => (window as any).__xssNameExecuted)).resolves.toBeUndefined();
});
