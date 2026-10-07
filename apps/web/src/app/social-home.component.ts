import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../environments/environment';
import { signal } from '@angular/core';

@Component({selector:'app-social-home',standalone:true,imports:[RouterLink],template:`<main class="social-home"><header><a routerLink="/" class="wordmark"><img src="ecc-logo.png" alt=""><span>AMOUR DES APÔTRES<small>ESPACE FIDÈLES</small></span></a><button type="button" (click)="logout()">Se déconnecter</button></header>@if(ready()){<section><span class="kicker">COMPTE CONFIRMÉ</span><h1>Bienvenue dans votre espace paroissial.</h1><p>Votre adresse e-mail est confirmée. Le fil Actualités sera disponible dans la prochaine phase du projet.</p><a routerLink="/">Découvrir la paroisse →</a></section>}@else{<section>Vérification de votre accès…</section>}</main>`,styles:[`:host{display:block}.social-home{min-height:100vh;background:#f7f4ec;color:#102542;font-family:'DM Sans','Segoe UI',sans-serif}.social-home header{height:75px;padding:0 6%;background:#fffefa;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e4e0d6}.wordmark{display:flex;align-items:center;gap:10px;color:#102542;font-size:11px;font-weight:700;letter-spacing:1.1px}.wordmark img{width:39px;height:39px;object-fit:contain}.wordmark small{display:block;margin-top:5px;color:#947541;font-size:8px;letter-spacing:1.7px}.social-home button{background:#0b1d38;color:white;border:0;padding:12px 17px;font-size:11px}.social-home section{max-width:780px;margin:auto;padding:80px 24px}.kicker{font-size:9px;letter-spacing:1.8px;color:#987642}.social-home h1{font:500 42px/1.15 'Playfair Display',Georgia,serif}.social-home p{color:#687687;line-height:1.7;font-size:14px}.social-home section>a{display:inline-block;margin-top:20px;color:#8c6a34;font-weight:600}@media(max-width:620px){.social-home section{padding:50px 20px}.social-home h1{font-size:34px}}`]})
export class SocialHomeComponent {
  private http=inject(HttpClient);private router=inject(Router);
  ready=signal(false);
  constructor(){this.http.get<{user:{role:string}}>(environment.apiUrl+'/auth/session').subscribe({next:result=>{if(result.user.role==='FIDELE')this.ready.set(true);else this.finish();},error:()=>this.finish()});}
  logout(){this.http.post(environment.apiUrl+'/auth/logout',{}).subscribe({complete:()=>this.finish(),error:()=>this.finish()});}
  private finish(){sessionStorage.clear();void this.router.navigate(['/connexion']);}
}
