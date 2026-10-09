import { expect, test, type Page } from '@playwright/test';

async function prepare(page:Page,role?:string){
  await page.setViewportSize({width:360,height:800});
  if(role)await page.addInitScript((value)=>{sessionStorage.setItem('paroisse_role',value);sessionStorage.setItem('paroisse_permissions','[]');},role);
  await page.route('**/api/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname;let body:any={};
    if(path.endsWith('/auth/session'))body={user:{id:'mobile-preview',role:role??'FIDELE',permissions:[]}};
    else if(path.endsWith('/community/conversations')||path.endsWith('/community/members'))body=[];
    else if(path.endsWith('/attendance/today')||path.endsWith('/auth/notifications')||path.endsWith('/auth/admin/members')||path.endsWith('/auth/social/admin/members')||path.endsWith('/public/team'))body=[];
    else if(path.includes('/attendance/week'))body={days:[]};
    else if(path.endsWith('/auth/social/registration-config'))body={enabled:true,minimumAge:13,charterVersion:'preview',charterText:'Charte de prévisualisation.',captchaSiteKey:null};
    else if(path.endsWith('/social/settings'))body={notificationsEnabled:true,profileDiscoverable:true};
    else if(path.endsWith('/social/posts'))body={items:[],nextCursor:null};
    else if(path.endsWith('/social/media/config'))body={enabled:false};
    else if(path.endsWith('/social/moderation/cases'))body=[];
    else if(path.endsWith('/auth/social/registration-config'))body={enabled:true,minimumAge:13,charterVersion:'preview',charterText:'Charte de prévisualisation.',captchaSiteKey:null};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
}

const screens=[
  {name:'accueil',path:'/',role:undefined},
  {name:'inscription',path:'/inscription',role:undefined},
  {name:'connexion fidèle',path:'/connexion',role:undefined},
  {name:'mot de passe oublié',path:'/mot-de-passe-oublie',role:undefined},
  {name:'nouveau mot de passe',path:'/nouveau-mot-de-passe?token=preview',role:undefined},
  {name:'connexion administrateur',path:'/admin/connexion',role:undefined},
  {name:'connexion sous-administrateur',path:'/sous-admin/connexion',role:undefined},
  {name:'actualités',path:'/actualites',role:'FIDELE'},
  {name:'présences',path:'/presence',role:'SECRETAIRE_PRESENCE'},
  {name:'administration',path:'/admin',role:'ADMIN'},
  {name:'modération',path:'/admin/moderation',role:'MODERATEUR'},
  {name:'programme biblique',path:'/programme-biblique',role:'SECRETAIRE_PRESENCE'},
];

for(const screen of screens){
  test(`affiche ${screen.name} sans débordement à 360 px`,async({page})=>{
    await prepare(page,screen.role);
    await page.goto(screen.path);
    await expect(page.locator('body')).toBeVisible();
    await page.waitForTimeout(150);
    const dimensions=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,content:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll<HTMLElement>('body *')].map(el=>({tag:el.tagName,cls:typeof el.className==='string'?el.className:'',text:(el.innerText||'').slice(0,48),left:Math.round(el.getBoundingClientRect().left),right:Math.round(el.getBoundingClientRect().right),width:Math.round(el.getBoundingClientRect().width),scroll:el.scrollWidth,client:el.clientWidth})).filter(el=>el.right>document.documentElement.clientWidth+1||el.scroll>el.client+1).slice(0,12)}));
    expect(dimensions.content,`débordement horizontal sur ${screen.path}: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport+1);
  });
}

test('le menu mobile de l’accueil s’ouvre au clavier et annonce son état',async({page})=>{
  await prepare(page);
  await page.goto('/');
  const toggle=page.locator('.mobile-nav');
  await expect(toggle).toBeVisible();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded','true');
  await expect(page.locator('#mobile-navigation')).toBeVisible();
});

test('les textes principaux de la communauté respectent le contraste WCAG AA',async({page})=>{
  await page.setViewportSize({width:1280,height:900});
  await prepare(page,'FIDELE');
  await page.goto('/actualites');
  const checks=await page.evaluate(()=>{
    const selectors=['.inbox h1','.eyebrow','.chat-item .preview','.notice','.thread-title h2','.composer textarea','.identity'];
    const rgb=(value:string)=>{const match=value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);return match?[Number(match[1]),Number(match[2]),Number(match[3]),match[4]===undefined?1:Number(match[4])]:null;};
    const luminance=(color:number[])=>{const channels=color.slice(0,3).map(value=>{const v=value/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return 0.2126*channels[0]+0.7152*channels[1]+0.0722*channels[2];};
    return selectors.flatMap(selector=>{const element=document.querySelector<HTMLElement>(selector);if(!element)return[];const style=getComputedStyle(element);const foreground=rgb(style.color);let parent:HTMLElement|null=element;let background:number[]|null=null;while(parent&&!background){const parsed=rgb(getComputedStyle(parent).backgroundColor);if(parsed&&parsed[3]===1)background=parsed;parent=parent.parentElement;}if(!foreground||!background)return[{selector,ratio:0}];const ratio=(Math.max(luminance(foreground),luminance(background))+0.05)/(Math.min(luminance(foreground),luminance(background))+0.05);return[{selector,ratio,large:Number.parseFloat(style.fontSize)>=24||(Number.parseFloat(style.fontSize)>=18.66&&Number.parseInt(style.fontWeight,10)>=700)}];});
  });
  expect(checks.filter((check:any)=>check.ratio<(check.large?3:4.5)),JSON.stringify(checks)).toEqual([]);
});

test('la création de conversation reste utilisable au clavier sur ordinateur',async({page})=>{
  await page.setViewportSize({width:1280,height:900});
  await prepare(page,'FIDELE');
  await page.goto('/messages');
  const create=page.getByRole('button',{name:'Démarrer une conversation'});
  await expect(create).toBeVisible();
  await create.focus();
  await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Rechercher un membre').focus();
  await page.keyboard.type('Membre');
  await expect(dialog.getByLabel('Rechercher un membre')).toHaveValue('Membre');
});

test('le panneau de détails de conversation est accessible sur téléphone',async({page})=>{
  await prepare(page,'FIDELE');
  await page.goto('/messages');
  await page.getByRole('button',{name:'Détails de la conversation'}).click();
  await expect(page.locator('aside.details')).toBeVisible();
  await expect(page.locator('aside.details')).toContainText('Votre communauté');
});
