import { expect, test } from '@playwright/test';

const hostile = (flag: string) => `<script>window.${flag}=true</script><img src=x onerror="window.${flag}=true"><a href="javascript:window.${flag}=true">Lien</a><svg onload="window.${flag}=true">SVG</svg>`;
const hostileName = hostile('__xssNameExecuted');
const postPayload = hostile('__xssPostExecuted');
const commentPayload = hostile('__xssCommentExecuted');
const pollQuestion = hostile('__xssPollQuestionExecuted');
const eventDescription = hostile('__xssEventDescriptionExecuted');
const biography = hostile('__xssBiographyExecuted');
const pollOptionPayload = '<img src=x onerror="window.__xssPollOptionExecuted=true">';
const eventTitlePayload = '<script>window.__xssEventTitleExecuted=true</script>';
const eventLocationPayload = '<a href="javascript:window.__xssEventLocationExecuted=true">Lieu</a>';

const createPost = (body: string) => ({
  id: `post-${Math.random().toString(36).slice(2)}`, body, visibility: 'TOUS_LES_FIDELES', pinned: false,
  createdAt: '2026-10-07T10:00:00.000Z', author: { id: 'autre-fidele-e2e', displayName: hostileName },
  sharedPost: null, media: [], poll: null, event: null, commentCount: 0, likes: 0, hearts: 0, likedByMe: false, heartedByMe: false,
});

test('rend les textes sociaux hostiles comme du texte sans exécuter de balise ni gestionnaire', async ({ page }) => {
  const posts: any[] = [];
  let comments: any[] = [];
  let groupPosts: any[] = [];
  let groupComments: any[] = [];
  await page.addInitScript(() => sessionStorage.setItem('paroisse_role', 'FIDELE'));
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.pathname === '/api/v1/auth/session') return route.fulfill({ json: { user: { id: 'fidele-e2e', role: 'FIDELE' } } });
    if (url.pathname === '/api/v1/social/settings') return route.fulfill({ json: { notificationsEnabled: false, profileDiscoverable: true } });
    if (url.pathname === '/api/v1/social/profile' && method === 'GET') return route.fulfill({ json: { displayName: hostileName, bio: biography, profileDiscoverable: true } });
    if (url.pathname === '/api/v1/social/profile' && method === 'PATCH') return route.fulfill({ json: { displayName: hostileName, bio: request.postDataJSON().bio } });
    if (/^\/api\/v1\/social\/profiles\//.test(url.pathname) && method === 'GET') return route.fulfill({ json: { id: 'autre-fidele-e2e', displayName: hostileName, bio: biography, posts: [createPost(postPayload)] } });
    if (url.pathname === '/api/v1/social/groups' && method === 'GET') return route.fulfill({ json: [{ id: 'group-xss-e2e', name: 'Groupe de test', description: 'Discussion paroissiale', visibility: 'PUBLIC', createdAt: '2026-10-07T10:00:00.000Z', owner: { id: 'fidele-e2e', displayName: 'Responsable' }, memberCount: 1, myRole: 'OWNER', myStatus: 'MEMBER', pendingCount: 0, pendingRequests: [] }] });
    if (url.pathname === '/api/v1/social/groups/group-xss-e2e/posts' && method === 'GET') return route.fulfill({ json: groupPosts });
    if (url.pathname === '/api/v1/social/groups/group-xss-e2e/posts' && method === 'POST') { const data = request.postDataJSON(), post = { id: 'group-post-xss-e2e', body: data.body, createdAt: '2026-10-07T10:02:00.000Z', author: { id: 'fidele-e2e', displayName: hostileName }, commentCount: 0, canDelete: true }; groupPosts = [post]; return route.fulfill({ status: 201, json: post }); }
    if (url.pathname === '/api/v1/social/groups/posts/group-post-xss-e2e/comments' && method === 'GET') return route.fulfill({ json: groupComments });
    if (url.pathname === '/api/v1/social/groups/posts/group-post-xss-e2e/comments' && method === 'POST') { const comment = { id: 'group-comment-xss-e2e', body: request.postDataJSON().body, createdAt: '2026-10-07T10:03:00.000Z', author: { id: 'fidele-e2e', displayName: hostileName }, canDelete: true }; groupComments = [comment]; return route.fulfill({ status: 201, json: comment }); }
    if (url.pathname === '/api/v1/social/posts' && method === 'GET') return route.fulfill({ json: { items: posts, nextCursor: null } });
    if (url.pathname === '/api/v1/social/posts' && method === 'POST') {
      const item = createPost(request.postDataJSON().body); posts.unshift(item); return route.fulfill({ status: 201, json: item });
    }
    if (url.pathname === '/api/v1/social/polls' && method === 'POST') {
      const data = request.postDataJSON(), item = createPost(data.body);
      item.poll = { id: 'poll-xss-e2e', closesAt: null, closed: false, totalVotes: 0, userVote: null, options: data.options.map((text: string, index: number) => ({ id: `option-${index}`, text, votes: 0, percentage: 0 })) };
      posts.unshift(item); return route.fulfill({ status: 201, json: { postId: item.id, poll: item.poll } });
    }
    if (url.pathname === '/api/v1/social/events' && method === 'POST') {
      const data = request.postDataJSON(), item = createPost(data.body);
      item.event = { id: 'event-xss-e2e', title: data.title, startsAt: data.startsAt, endsAt: data.endsAt ?? null, location: data.location ?? null, counts: { PARTICIPATING: 0, INTERESTED: 0, DECLINED: 0 }, userRsvp: null };
      posts.unshift(item); return route.fulfill({ status: 201, json: { postId: item.id, event: item.event } });
    }
    if (url.pathname.endsWith('/comments') && method === 'GET') return route.fulfill({ json: comments });
    if (url.pathname.endsWith('/comments') && method === 'POST') {
      const item = { id: 'comment-xss-e2e', body: request.postDataJSON().body, createdAt: '2026-10-07T10:01:00.000Z', author: { id: 'autre-fidele-e2e', displayName: hostileName }, replies: [] };
      comments = [item]; return route.fulfill({ status: 201, json: item });
    }
    if (url.pathname === '/api/v1/social/reports' && method === 'POST') return route.fulfill({ status: 201, json: { id: 'report-xss-e2e' } });
    return route.fulfill({ status: 200, json: {} });
  });

  await page.goto('/actualites');
  await page.getByLabel('Votre publication').fill(postPayload);
  await page.getByRole('button', { name: 'Publier' }).click();
  const postContent = page.locator('.post-body').first();
  await expect(postContent).toHaveText(postPayload);
  await expect(postContent.locator('*')).toHaveCount(0);
  await expect(page.locator('.post-author strong').first()).toHaveText(hostileName);
  await expect(page.locator('.post-author a[href^="javascript:"]')).toHaveCount(0);
  await page.locator('.post-author .profile-link').first().click();
  const publicProfile = page.locator('.public-profile');
  await expect(publicProfile.locator('h2')).toHaveText(hostileName);
  await expect(publicProfile.locator('.public-profile-bio')).toHaveText(biography);
  await expect(publicProfile.locator('.profile-post p')).toHaveText(postPayload);
  await expect(publicProfile.locator('* script, * img, * svg, a[href^="javascript:"]')).toHaveCount(0);
  await publicProfile.getByRole('button', { name: 'Retour au fil' }).click();

  await page.getByRole('button', { name: /Commentaires/ }).first().click();
  await page.getByPlaceholder('Écrire un commentaire…').fill(commentPayload);
  await page.getByRole('button', { name: 'Envoyer' }).click();
  const comment = page.locator('.comment p').first();
  await expect(comment).toHaveText(commentPayload);
  await expect(comment.locator('*')).toHaveCount(0);
  await expect(page.locator('.comment strong').first()).toHaveText(hostileName);

  await page.getByRole('button', { name: /Créer un sondage/ }).click();
  await page.getByLabel('Votre publication').fill(pollQuestion);
  await page.getByLabel('Choix 1').fill(pollOptionPayload);
  await page.getByLabel('Choix 2').fill('Choix simple');
  await page.getByRole('button', { name: 'Publier le sondage' }).click();
  const pollBody = page.locator('.post-body').filter({ hasText: pollQuestion }).first();
  await expect(pollBody).toHaveText(pollQuestion);
  await expect(pollBody.locator('*')).toHaveCount(0);
  const option = page.locator('.poll-option').first().locator('span').first();
  await expect(option).toHaveText(pollOptionPayload);
  await expect(option.locator('*')).toHaveCount(0);

  await page.getByRole('button', { name: /Créer un événement/ }).click();
  await page.getByLabel('Votre publication').fill(eventDescription);
  await page.getByLabel('Titre de l’événement').fill(eventTitlePayload);
  const future = new Date(Date.now() + 30 * 60_000);
  const localFuture = new Date(future.getTime() - future.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await page.getByLabel('Date et heure de début').fill(localFuture);
  await page.getByLabel('Lieu (facultatif)').fill(eventLocationPayload);
  await page.getByRole('button', { name: 'Publier l’événement' }).click();
  const eventPost = page.locator('.event-card').filter({ hasText: eventTitlePayload }).first();
  await expect(eventPost.locator('h3')).toHaveText(eventTitlePayload);
  await expect(eventPost.locator('h3 *')).toHaveCount(0);
  await expect(eventPost).toContainText(eventLocationPayload);
  await expect(eventPost.locator('a[href^="javascript:"]')).toHaveCount(0);
  const eventDescriptionNode = page.locator('.post-body').filter({ hasText: eventDescription }).first();
  await expect(eventDescriptionNode).toHaveText(eventDescription);
  await expect(eventDescriptionNode.locator('*')).toHaveCount(0);

  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.getByRole('button', { name: 'Mon profil' }).click();
  await expect(page.locator('.profile-name')).toHaveText(hostileName);
  await expect(page.locator('.profile-name *')).toHaveCount(0);
  const bio = page.getByLabel('Ma présentation (500 caractères maximum)');
  await expect(bio).toHaveValue(biography);
  await bio.fill(biography);
  await page.getByRole('button', { name: 'Enregistrer ma présentation' }).click();
  await expect(bio).toHaveValue(biography);

  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.locator('.community-nav').getByRole('link', { name: 'Fil d’actualité' }).click();
  const report = page.locator('.post-card').first();
  await report.getByRole('button', { name: 'Signaler', exact: true }).click();
  const reportForm = page.locator('.report-form').first();
  const reason = reportForm.getByLabel('Pourquoi souhaitez-vous signaler ?');
  await expect(reason.locator('option')).toHaveCount(5);
  expect(await reason.locator('option').allTextContents()).toEqual(['Spam','Harcèlement','Contenu inapproprié','Usurpation','Autre motif']);
  await expect(page.locator('.report-form input, .report-form textarea, .report-form [contenteditable="true"]')).toHaveCount(0);
  await reason.selectOption('AUTRE');
  await reportForm.getByRole('button', { name: 'Transmettre le signalement' }).click();

  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.locator('.community-nav').getByRole('button', { name: 'Groupes' }).click();
  await page.getByRole('button', { name: 'Ouvrir les échanges' }).click();
  await page.getByLabel('Votre message').fill(hostile);
  await page.getByRole('button', { name: 'Publier dans le groupe' }).click();
  const groupPost = page.locator('.group-post').filter({ hasText: hostile });
  await expect(groupPost.locator('p').first()).toHaveText(hostile);
  await expect(groupPost.locator('p').first().locator('*')).toHaveCount(0);
  await groupPost.getByRole('button', { name: /Commentaires/ }).click();
  await page.getByLabel('Commenter').fill(hostile);
  await page.getByRole('button', { name: 'Répondre' }).click();
  const groupComment = page.locator('.group-comments > p').last();
  await expect(groupComment).toContainText(hostile);
  await expect(groupComment.locator('*')).toHaveCount(0);

  const executed = await page.evaluate(() => Object.keys(window).filter(key => key.startsWith('__xss') && (window as any)[key] === true));
  expect(executed).toEqual([]);
});
