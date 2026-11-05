import { Component, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../environments/environment';
import { ParishFooterComponent } from './parish-footer.component';
import { readProfilePhoto } from './profile-photo';

@Component({
  selector: 'app-responsible-request',
  standalone: true,
  imports: [RouterLink, ParishFooterComponent],
  template: `
    <main class="request-page">
      <header><a routerLink="/" class="brand">AMOUR DES APÔTRES<small>SAINTE-CÉCILE · COTONOU</small></a></header>
      <section class="request-card">
        <span class="kicker">DEMANDE TRANSMISE</span>
        <div class="check" aria-hidden="true">✓</div>
        <h1>Votre demande a bien été envoyée.</h1>
        <p class="intro">Le chargé paroissial va l’examiner et vous répondra dans les meilleurs délais. Votre compte restera inactif jusqu’à sa validation.</p>
        @if(error()){<p class="notice error" role="alert">{{error()}}</p>}
        @if(success()){<p class="notice success" role="status">{{success()}}</p>}
        @if(canComplete()){
          <section class="profile-step">
            <span class="kicker">DERNIÈRE ÉTAPE</span>
            <h2>Ajoutez votre photo de profil</h2>
            <p>Elle permettra au chargé paroissial de vous identifier avant de confirmer votre demande et de vous attribuer le rôle retenu.</p>
            @if(photoUrl()){<img class="preview" [src]="photoUrl()" alt="Aperçu de votre photo de profil">}
            <label class="photo-picker">Choisir une photo<input type="file" accept="image/jpeg,image/png,image/webp" (change)="onPhotoSelected($event)"></label>
            <small class="photo-help">JPG, PNG ou WebP · 5 Mo maximum</small>
            <button type="button" class="primary" (click)="savePhoto()" [disabled]="saving()||!photoUrl()">{{saving()?'Enregistrement…':'Enregistrer ma photo'}}</button>
          </section>
        }
        <a class="back-link" routerLink="/">Retour à l’accueil</a>
      </section>
    </main>
    <parish-footer />
  `,
  styles: [`
    :host{display:block}.request-page{min-height:75vh;padding:0 18px 56px;background:#f7f4ec;color:#102542;font-family:'DM Sans','Segoe UI',sans-serif}.request-page header{max-width:980px;margin:auto;padding:26px 0}.brand{color:#102542;text-decoration:none;font-size:12px;font-weight:800;letter-spacing:1px}.brand small{display:block;margin-top:5px;color:#987642;font-size:8px}.request-card{box-sizing:border-box;max-width:680px;margin:26px auto;padding:34px;background:#fffefa;border:1px solid #e4dfd3;text-align:center}.kicker{color:#987642;font-size:9px;font-weight:700;letter-spacing:1.6px}.check{display:grid;place-items:center;width:52px;height:52px;margin:20px auto 12px;border-radius:50%;background:#e8f1e9;color:#356244;font-size:26px}.request-card h1{margin:12px 0;font:34px/1.2 Georgia,serif}.intro,.profile-step p{color:#687687;font-size:13px;line-height:1.7}.profile-step{margin-top:28px;padding:22px;background:#f8f6f0;text-align:left}.profile-step h2{margin:8px 0;font:24px Georgia,serif}.preview{display:block;width:104px;height:104px;margin:18px auto 12px;border-radius:50%;object-fit:cover;border:3px solid #c5a35e}.photo-picker{display:block;width:max-content;max-width:100%;margin:16px auto 6px;padding:10px 14px;border:1px solid #dcd7cb;background:#fff;color:#725a31;font-size:12px;cursor:pointer}.photo-picker input{display:block;max-width:220px;margin-top:8px;font-size:10px}.photo-help{display:block;text-align:center;color:#788596;font-size:10px}.primary{display:block;width:100%;margin-top:16px;padding:13px;border:0;background:#102542;color:#fff;font-weight:700;cursor:pointer}.primary:disabled{opacity:.55;cursor:wait}.notice{padding:12px;font-size:11px;text-align:left}.error{background:#f7e9e5;color:#873f32}.success{background:#e9f2eb;color:#356244}.back-link{display:inline-block;margin-top:24px;color:#725a31;font-size:11px;text-decoration:none}@media(max-width:600px){.request-card{margin:8px auto;padding:24px 18px}.request-card h1{font-size:29px}.profile-step{padding:18px 14px}}
  `]
})
export class ResponsibleRequestComponent {
  readonly token = localStorage.getItem('paroisse_profile_setup_token') ?? '';
  readonly canComplete = signal(!!this.token);
  readonly photoUrl = signal('');
  readonly error = signal('');
  readonly success = signal('');
  readonly saving = signal(false);

  constructor(private readonly http: HttpClient) {}

  async onPhotoSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      this.photoUrl.set(await readProfilePhoto(file));
      this.error.set('');
      this.success.set('');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'La photo n’a pas pu être préparée.');
    }
  }

  savePhoto() {
    if (!this.token || !this.photoUrl()) return;
    this.error.set('');
    this.success.set('');
    this.saving.set(true);
    this.http.post<{saved: boolean}>(`${environment.apiUrl}/auth/register/profile`, {
      token: this.token,
      photoUrl: this.photoUrl()
    }).subscribe({
      next: () => {
        localStorage.removeItem('paroisse_profile_setup_token');
        this.canComplete.set(false);
        this.saving.set(false);
        this.success.set('Votre photo est enregistrée. Le chargé paroissial peut maintenant examiner votre profil.');
      },
      error: response => {
        this.saving.set(false);
        this.error.set(response?.error?.message ?? 'La photo n’a pas pu être enregistrée. Réessayez ou contactez le chargé paroissial.');
      }
    });
  }
}
