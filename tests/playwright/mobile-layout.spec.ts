import { expect, test, type Page } from '@playwright/test';

async function prepare(page:Page,role?:string){
  await page.setViewportSize({width:360,height:800});
  if(role)await page.addInitScript((value)=>{sessionStorage.setItem('paroisse_role',value);sessionStorage.setItem('paroisse_permissions','[]');},role);
  await page.route('**/api/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname;let body:any={};
    if(path.endsWith('/auth/session'))body={user:{id:'mobile-preview',role:role??'FIDELE',permissions:[]}};
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
