import { expect, test } from '@playwright/test';

const hostile='<script>window.__messageXss=true</script><img src=x onerror="window.__messageXss=true"><a href="javascript:window.__messageXss=true">texte</a>';

test('met les messages hors ligne en file locale puis les renvoie une seule fois',async({page})=>{
  await page.setViewportSize({width:900,height:800});
  await page.addInitScript(()=>{sessionStorage.setItem('paroisse_role','FIDELE');sessionStorage.setItem('paroisse_permissions','[]');sessionStorage.setItem('paroisse_user_id','offline-user');});
  const chat={id:'offline-chat',type:'DIRECT',title:null,updatedAt:new Date().toISOString(),memberCount:2,unread:0,members:[{id:'offline-user',displayName:'Membre test',role:'FIDELE'},{id:'peer',displayName:'Autre membre',role:'FIDELE'}],lastMessage:null};
  let posts=0;let sent:any;let persisted:any[]=[];
  await page.route('**/api/v1/**',async route=>{const req=route.request(),url=new URL(req.url());if(url.pathname.endsWith('/auth/session'))return route.fulfill({status:200,json:{user:{id:'offline-user',role:'FIDELE',permissions:[]}}});if(url.pathname.endsWith('/community/conversations')&&req.method()==='GET')return route.fulfill({status:200,json:[chat]});if(url.pathname.endsWith('/messages')&&req.method()==='GET')return route.fulfill({status:200,json:persisted});if(url.pathname.endsWith('/read'))return route.fulfill({status:201,json:{read:true}});if(url.pathname.endsWith('/messages')&&req.method()==='POST'){posts++;sent=req.postDataJSON();const row={id:'offline-saved',body:sent.body,createdAt:new Date().toISOString(),sender:{id:'offline-user',displayName:'Membre test'},mine:true,replyTo:null,reactions:[]};persisted.push(row);return route.fulfill({status:201,json:row});}return route.fulfill({status:200,json:[]});});
  await page.goto('/messages');await page.locator('.chat-item').click();await expect(page.locator('.composer textarea')).toBeVisible();
  await page.context().setOffline(true);await page.getByLabel('Votre message').fill('Message envoyé après le retour du réseau');await page.getByRole('button',{name:'Envoyer le message'}).click();
  await expect(page.getByRole('status').filter({hasText:'Connexion interrompue'})).toBeVisible();
  await expect(page.getByRole('status').filter({hasText:'message(s) en attente du réseau'})).toBeVisible();expect(posts).toBe(0);
  await page.context().setOffline(false);await expect(page.getByRole('status').filter({hasText:'message(s) en attente du réseau'})).toHaveCount(0);await expect(page.getByRole('status').filter({hasText:'Connexion interrompue'})).toHaveCount(0);await expect(page.locator('.message.mine p')).toHaveText('Message envoyé après le retour du réseau');
  expect(posts).toBe(1);expect(sent.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForTimeout(100);expect(posts).toBe(1);
});

test('garde les titres de groupe et les détails de signalement comme du texte',async({page})=>{
  await page.setViewportSize({width:1280,height:900});
  await page.addInitScript(()=>{sessionStorage.setItem('paroisse_role','FIDELE');sessionStorage.setItem('paroisse_permissions','[]');sessionStorage.setItem('paroisse_user_id','xss-user');});
  const group={id:'hostile-group',type:'GROUP',title:hostile,updatedAt:new Date().toISOString(),memberCount:3,unread:0,members:[{id:'xss-user',displayName:'Membre',role:'FIDELE'},{id:'a',displayName:'A',role:'FIDELE'},{id:'b',displayName:'B',role:'FIDELE'}],lastMessage:null};
  await page.route('**/api/v1/**',async route=>{const req=route.request(),url=new URL(req.url());if(url.pathname.endsWith('/auth/session'))return route.fulfill({status:200,json:{user:{id:'xss-user',role:'FIDELE',permissions:[]}}});if(url.pathname.endsWith('/community/conversations')&&req.method()==='GET')return route.fulfill({status:200,json:[group]});if(url.pathname.endsWith('/messages')&&req.method()==='GET')return route.fulfill({status:200,json:[]});if(url.pathname.endsWith('/read'))return route.fulfill({status:201,json:{read:true}});return route.fulfill({status:200,json:[]});});
  await page.goto('/messages');await page.locator('.chat-item').click();const title=page.locator('.thread-title h2');await expect(title).toHaveText(hostile);await expect(title.locator('*')).toHaveCount(0);await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__messageXss)).toBeUndefined();
});

test('affiche les contenus du dossier de modération sans interpréter leur HTML',async({page})=>{
  await page.setViewportSize({width:1280,height:900});
  await page.addInitScript(()=>{sessionStorage.setItem('paroisse_role','MODERATEUR');sessionStorage.setItem('paroisse_permissions','[]');sessionStorage.setItem('paroisse_user_id','moderator-xss');});
  await page.route('**/api/v1/**',async route=>{const url=new URL(route.request().url());if(url.pathname.endsWith('/auth/session'))return route.fulfill({status:200,json:{user:{id:'moderator-xss',role:'MODERATEUR',permissions:[]}}});if(url.pathname.endsWith('/context'))return route.fulfill({status:200,json:{reportId:'report-xss',messages:[{id:'context-xss',body:hostile,createdAt:new Date().toISOString(),sender:hostile,reported:true}]}});if(url.pathname.endsWith('/community/moderation/reports'))return route.fulfill({status:200,json:[{id:'report-xss',reason:'AUTRE',detail:hostile,createdAt:new Date().toISOString(),message:{id:'m-xss',body:hostile,createdAt:new Date().toISOString()},author:{id:'author',displayName:hostile},reporter:{id:'reporter',displayName:'Membre'},conversation:{id:'private-chat',type:'GROUP',title:hostile}}]});return route.fulfill({status:200,json:[]});});
  await page.goto('/admin/moderation');await expect(page.locator('.case blockquote')).toHaveText(hostile);await expect(page.locator('.case blockquote *')).toHaveCount(0);await expect(page.locator('.case .detail')).toHaveText(`« ${hostile} »`);await expect(page.locator('.case h2')).toHaveText(hostile);await expect(page.locator('.case h2 *')).toHaveCount(0);await page.getByRole('button',{name:'Consulter jusqu’à 10 messages de contexte'}).click();await expect(page.locator('.context p')).toContainText(hostile);await expect(page.locator('.context p script, .context p img, .context p a')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__messageXss)).toBeUndefined();
});

test('ouvre les stories dans un lecteur mobile, avance entre elles et mémorise les vues sur cet appareil',async({page})=>{
  await page.setViewportSize({width:360,height:780});
  await page.addInitScript(()=>{sessionStorage.setItem('paroisse_role','FIDELE');sessionStorage.setItem('paroisse_permissions','[]');sessionStorage.setItem('paroisse_user_id','story-viewer-user');});
  const now=new Date().toISOString(),rows=[{id:'story-one',body:'Première pensée',createdAt:now,expiresAt:new Date(Date.now()+3600000).toISOString(),author:{id:'author-one',displayName:'Auteur paroissial'}},{id:'story-two',body:hostile,createdAt:now,expiresAt:new Date(Date.now()+3600000).toISOString(),author:{id:'author-one',displayName:'Auteur paroissial'}}];
  await page.route('**/api/v1/**',async route=>{const url=new URL(route.request().url());if(url.pathname.endsWith('/auth/session'))return route.fulfill({status:200,json:{user:{id:'story-viewer-user',role:'FIDELE',permissions:[]}}});if(url.pathname.endsWith('/community/stories'))return route.fulfill({status:200,json:rows});return route.fulfill({status:200,json:[]});});
  await page.goto('/community/stories');await page.getByRole('button',{name:'Ouvrir la story de Auteur paroissial'}).click();
  await expect(page.getByRole('dialog',{name:'Story de Auteur paroissial'})).toBeVisible();await expect(page.locator('.story-viewer .viewer-copy')).toHaveText('Première pensée');await expect(page.locator('.story-bubble')).toHaveClass(/seen/);
  await page.getByRole('button',{name:'Story suivante'}).click();await expect(page.locator('.story-viewer .viewer-copy')).toHaveText(hostile);await expect(page.locator('.story-viewer .viewer-copy *')).toHaveCount(0);await expect(page.locator('.story-viewer a[href^="javascript:"]')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__messageXss)).toBeUndefined();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Story de Auteur paroissial'})).toHaveCount(0);expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('paroisse_story_seen')??'[]'))).toEqual(expect.arrayContaining(['story-one','story-two']));
});

test('met en pause une story par appui long puis passe à la suivante automatiquement',async({page})=>{
  await page.clock.install();
  await page.setViewportSize({width:360,height:780});
  await page.addInitScript(()=>{sessionStorage.setItem('paroisse_role','FIDELE');sessionStorage.setItem('paroisse_permissions','[]');sessionStorage.setItem('paroisse_user_id','story-pause-user');});
  const now=new Date().toISOString(),rows=[{id:'pause-one',body:'Story en pause',createdAt:now,expiresAt:new Date(Date.now()+3600000).toISOString(),author:{id:'pause-author',displayName:'Auteur'}},{id:'pause-two',body:'Story suivante',createdAt:new Date(Date.now()+1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),author:{id:'pause-author',displayName:'Auteur'}}];
  await page.route('**/api/v1/**',async route=>{const url=new URL(route.request().url());if(url.pathname.endsWith('/auth/session'))return route.fulfill({status:200,json:{user:{id:'story-pause-user',role:'FIDELE',permissions:[]}}});if(url.pathname.endsWith('/community/stories'))return route.fulfill({status:200,json:rows});return route.fulfill({status:200,json:[]});});
  await page.goto('/community/stories');await page.getByRole('button',{name:'Ouvrir la story de Auteur'}).click();
  const viewer=page.getByRole('dialog',{name:'Story de Auteur'});await expect(viewer.locator('.viewer-copy')).toHaveText('Story en pause');
  await page.mouse.move(180,390);await page.mouse.down();await page.clock.runFor(6000);await expect(viewer.locator('.viewer-copy')).toHaveText('Story en pause');
  await page.mouse.up();await page.clock.runFor(5100);await expect(viewer.locator('.viewer-copy')).toHaveText('Story suivante');
});

test('montre les notifications de lancement de direct dans la rubrique Directs',async({page})=>{
  await page.setViewportSize({width:360,height:780});
  await page.addInitScript(()=>{sessionStorage.setItem('paroisse_role','FIDELE');sessionStorage.setItem('paroisse_permissions','[]');sessionStorage.setItem('paroisse_user_id','live-notice-user');});
  await page.route('**/api/v1/**',async route=>{const url=new URL(route.request().url());if(url.pathname.endsWith('/auth/session'))return route.fulfill({status:200,json:{user:{id:'live-notice-user',role:'FIDELE',permissions:[]}}});if(url.pathname.endsWith('/community/lives/notifications'))return route.fulfill({status:200,json:[{id:'live-notice',message:'Un direct paroissial vient de commencer. Ouvrez la rubrique Directs pour le découvrir.',createdAt:new Date().toISOString()}]});if(url.pathname.endsWith('/community/lives'))return route.fulfill({status:200,json:[]});return route.fulfill({status:200,json:[]});});
  await page.goto('/community/live');await expect(page.getByRole('region',{name:'Notifications de la communauté'})).toContainText('Un direct paroissial vient de commencer');await expect(page.getByText('Aucun direct en cours dans votre tranche d’âge.')).toBeVisible();
});
