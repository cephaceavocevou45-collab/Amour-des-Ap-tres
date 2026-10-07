import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';

@Component({selector:'app-social-email',standalone:true,imports:[FormsModule,RouterLink],template:`
<main class="auth-page"><aside class="auth-brand-panel"><a routerLink="/">← Retour à l’accueil</a><img src="ecc-logo.png" alt="Emblème de l’Église du Christianisme Céleste"><h2>Amour des Apôtres</h2><p>Sainte-Cécile · Cotonou</p></aside><section class="auth-form-panel"><form class="auth-form" (ngSubmit)="resend()"><span class="auth-kicker">COMPTE FIDÈLE</span><h1>{{isConfirm?'Confirmation de l’adresse':'Renvoyer le lien'}}</h1><p>{{isConfirm?'Vérification du lien de confirmation de votre compte.':'Indiquez votre adresse e-mail pour demander un nouvel e-mail de confirmation.'}}</p>@if(message()){<div class="auth-message" role="status">{{message()}}</div>}@if(!isConfirm){<label for="email">Adresse e-mail</label><input id="email" name="email" type="email" [(ngModel)]="email" required autocomplete="email"><button class="auth-submit" [disabled]="busy()">{{busy()?'Envoi…':'Renvoyer le lien'}} →</button>}<div class="auth-switch"><a routerLink="/connexion">Retour à la connexion</a></div><div class="auth-security">Un lien expiré ou déjà utilisé doit être remplacé par un nouvel e-mail.</div></form></section></main>`})
export class SocialEmailComponent {
  private http=inject(HttpClient);private route=inject(ActivatedRoute);readonly isConfirm=this.route.snapshot.data['mode']==='confirm';email='';message=signal(this.isConfirm?'Vérification du lien…':'');busy=signal(false);
  constructor(){if(this.isConfirm){const token=this.route.snapshot.queryParamMap.get('token')??'';this.http.post<{message:string}>(environment.apiUrl+'/auth/social/email/confirm',{token}).subscribe({next:value=>this.message.set(value.message),error:error=>this.message.set(error?.error?.message??'Le lien de confirmation est invalide ou expiré.')});}}
  resend(){if(this.isConfirm)return;this.busy.set(true);this.message.set('');this.http.post<{message:string}>(environment.apiUrl+'/auth/social/email/resend',{email:this.email.trim().toLowerCase()}).subscribe({next:value=>this.message.set(value.message),error:error=>{this.message.set(error?.error?.message??'La demande n’a pas pu être traitée.');this.busy.set(false);},complete:()=>this.busy.set(false)});}
}
