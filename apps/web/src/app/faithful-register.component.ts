import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../environments/environment';
import { ParishFooterComponent } from './parish-footer.component';

type RegisterEntry = { number: number; fullName: string; createdAt: string };
type RegisterResponse = { entries: RegisterEntry[]; total: number; nextNumber: number };

@Component({
  selector: 'app-faithful-register',
  standalone: true,
  imports: [FormsModule, RouterLink, ParishFooterComponent],
  template: `
    <main class="register-page">
      <header>
        <a class="brand" [routerLink]="isAdmin ? '/admin' : '/presence'">AMOUR DES APÔTRES<small>REGISTRE DES FIDÈLES</small></a>
        <nav><a routerLink="/profil">Mon profil</a><a [routerLink]="isAdmin ? '/admin' : '/presence'">Retour à mon espace</a></nav>
      </header>
      <section class="register-content">
        <span class="kicker">REGISTRE PAROISSIAL PARTAGÉ</span>
        <h1>Liste des fidèles</h1>
        <p class="intro">Un registre commun à tous les secrétaires de présence. Chaque ajout reçoit le numéro suivant et reste visible pour les personnes autorisées.</p>
        @if(error()){<p class="notice error" role="alert">{{error()}}</p>}
        @if(message()){<p class="notice success" role="status">{{message()}}</p>}
        <form class="add-form" (ngSubmit)="add()">
          <label for="faithful-name">Nom complet du fidèle</label>
          <div class="form-row"><input id="faithful-name" name="fullName" [(ngModel)]="fullName" maxlength="240" required placeholder="Prénom et nom"><button type="submit" [disabled]="saving()">{{saving() ? 'Enregistrement…' : 'Ajouter à la liste'}}</button></div>
        </form>
        <section class="list-card" aria-labelledby="registry-heading">
          <div class="list-heading"><div><span class="kicker">LISTE PARTAGÉE</span><h2 id="registry-heading">{{entries().length}} fidèle{{entries().length === 1 ? '' : 's'}} enregistré{{entries().length === 1 ? '' : 's'}}</h2></div><button type="button" class="refresh" (click)="load()" [disabled]="loading()">{{loading() ? 'Actualisation…' : 'Actualiser la liste'}}</button></div>
          @if(loading() && !entries().length){<p class="empty">Chargement du registre…</p>}
          @else if(entries().length){<ol class="entries">@for(entry of entries(); track entry.number){<li><strong>{{entry.number}}</strong><span>{{entry.fullName}}</span><time [attr.datetime]="entry.createdAt">{{formatDate(entry.createdAt)}}</time></li>}</ol>}
          @else{<p class="empty">Le registre est encore vide. Le premier ajout commencera au numéro 1.</p>}
          <p class="next-number">Prochain numéro attribué : <strong>{{nextNumber()}}</strong></p>
        </section>
      </section>
    </main>
    <parish-footer />
  `,
  styles: [`
    :host{display:block}.register-page{min-height:75vh;background:#f7f4ec;color:#102542;font-family:'DM Sans','Segoe UI',sans-serif}.register-page header{min-height:72px;padding:0 6%;display:flex;align-items:center;justify-content:space-between;background:#fffefa;border-bottom:1px solid #e4e0d6}.brand{color:#102542;text-decoration:none;font-size:12px;font-weight:800;letter-spacing:1px}.brand small{display:block;margin-top:5px;color:#987642;font-size:8px}.register-page nav{display:flex;gap:18px}.register-page nav a{color:#725a31;text-decoration:none;font-size:11px}.register-content{max-width:900px;margin:auto;padding:46px 20px 70px}.kicker{color:#987642;font-size:9px;font-weight:700;letter-spacing:1.6px}.register-content h1{margin:12px 0;font:40px Georgia,serif}.intro{max-width:650px;color:#66758a;font-size:13px;line-height:1.7}.add-form,.list-card{margin-top:24px;padding:22px;background:#fffefa;border:1px solid #e4dfd3}.add-form label{display:block;margin-bottom:8px;color:#52647a;font-size:11px;font-weight:700}.form-row{display:flex;gap:10px}.form-row input{min-width:0;flex:1;padding:12px;border:1px solid #dcd7cb;font:13px 'DM Sans','Segoe UI',sans-serif}.form-row button,.refresh{padding:11px 15px;border:0;background:#102542;color:#fff;font-size:11px;font-weight:700;cursor:pointer}.form-row button:disabled,.refresh:disabled{opacity:.55;cursor:wait}.notice{padding:12px;font-size:11px}.error{background:#f7e9e5;color:#873f32}.success{background:#e9f2eb;color:#356244}.list-heading{display:flex;justify-content:space-between;align-items:center;gap:16px}.list-heading h2{margin:7px 0 0;font:23px Georgia,serif}.refresh{background:#ece7dc;color:#33465e}.entries{max-height:520px;overflow:auto;padding:0;margin:20px 0;list-style:none;border-top:1px solid #e5dfd2}.entries li{display:grid;grid-template-columns:52px 1fr auto;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid #e5dfd2;font-size:12px}.entries li>strong{color:#987642}.entries time{color:#788596;font-size:10px}.empty,.next-number{color:#69788b;font-size:12px}.next-number{margin:16px 0 0;padding-top:14px;border-top:1px solid #e5dfd2}.next-number strong{color:#987642}@media(max-width:600px){.register-page header{padding:12px 16px;gap:12px;flex-wrap:wrap}.register-page nav{gap:12px}.register-content{padding-top:30px}.add-form,.list-card{padding:16px}.form-row{flex-direction:column}.list-heading{align-items:flex-start;flex-direction:column}.entries li{grid-template-columns:36px 1fr}.entries time{grid-column:2}}
  `]
})
export class FaithfulRegisterComponent {
  readonly isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(sessionStorage.getItem('paroisse_role') ?? '');
  readonly entries = signal<RegisterEntry[]>([]);
  readonly nextNumber = signal(1);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  fullName = '';

  constructor(private readonly http: HttpClient) {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.http.get<RegisterResponse>(`${environment.apiUrl}/faithful-register`).subscribe({
      next: response => {
        this.entries.set(response.entries);
        this.nextNumber.set(response.nextNumber);
        this.loading.set(false);
      },
      error: response => {
        this.error.set(response?.error?.message ?? 'Le registre des fidèles n’a pas pu être chargé.');
        this.loading.set(false);
      }
    });
  }

  add() {
    const fullName = this.fullName.trim().replace(/\s+/g, ' ');
    if (fullName.length < 3) {
      this.error.set('Saisissez le nom complet du fidèle.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    this.http.post<RegisterEntry>(`${environment.apiUrl}/faithful-register`, { fullName }).subscribe({
      next: entry => {
        this.fullName = '';
        this.message.set(`Fidèle ajouté au numéro ${entry.number}.`);
        this.saving.set(false);
        this.load();
      },
      error: response => {
        this.error.set(response?.error?.message ?? 'Le fidèle n’a pas pu être ajouté au registre.');
        this.saving.set(false);
      }
    });
  }

  formatDate(value: string) {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Porto-Novo', dateStyle: 'medium' }).format(new Date(value));
  }
}
