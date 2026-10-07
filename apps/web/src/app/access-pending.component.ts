import { Component, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../environments/environment';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-access-pending',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="pending-page">
      <section class="pending-card">
        <img src="ecc-logo.png" alt="Église du Christianisme Céleste">
        <span class="pending-kicker">ESPACE FIDÈLES · AMOUR DES APÔTRES</span>
        <div class="pending-icon" aria-hidden="true">✓</div>
        <h1>Connexion réussie</h1>
        <p>Votre compte fidèle est actif. L’accès à la saisie des présences est réservé aux personnes désignées par l’administration paroissiale.</p>
        @for(notice of notices();track notice.id){<p class="notice">{{notice.message}}</p>}
        <p class="pending-next">Si vous avez demandé une responsabilité, l’administration examinera votre demande. Votre décision apparaîtra ici après votre prochaine connexion.</p>
        <button type="button" (click)="logout()">Se déconnecter</button>
        <a routerLink="/">Retour à l’accueil</a>
      </section>
    </main>
  `,
  styles: [`
    .pending-page{min-height:100vh;display:grid;place-items:center;padding:28px;background:radial-gradient(circle at 50% 0,#263f62,#0b1d38 72%);font-family:'DM Sans','Segoe UI',sans-serif;color:#172b46}
    .pending-card{width:min(100%,540px);padding:42px 46px;text-align:center;background:#fffefa;border:1px solid #e6ddc9;box-shadow:0 24px 70px #06152b66}
    .pending-card img{width:112px;height:112px;object-fit:contain;display:block;margin:0 auto 18px}
    .pending-kicker{font-size:10px;letter-spacing:1.8px;color:#94733d;font-weight:700}
    .pending-icon{width:42px;height:42px;margin:28px auto 12px;border:1px solid #c9ac6c;border-radius:50%;display:grid;place-items:center;color:#94733d;font-size:20px}
    h1{font:500 32px 'Playfair Display',Georgia,serif;margin:0 0 14px;color:#0b1d38}
    p{font-size:14px;line-height:1.8;color:#596779;margin:0}
    .pending-next{margin-top:12px;padding:13px 15px;background:#f4f0e6;font-size:12px}
    .notice{margin-top:12px;padding:13px 15px;background:#e9f2eb;border:1px solid #d4e5d7;color:#315e40;font-size:12px;line-height:1.7}
    button{display:block;width:100%;margin-top:24px;padding:13px;border:0;background:#0b1d38;color:white;font-weight:600}
    .pending-card>a{display:inline-block;margin-top:17px;font-size:12px;color:#806331}
    @media(max-width:520px){.pending-card{padding:32px 23px}h1{font-size:28px}}
  `]
})
export class AccessPendingComponent {
  notices=signal<Array<{id:string;message:string}>>([]);
  constructor(private router: Router,private http:HttpClient) { void this.loadNotices(); }

  private async loadNotices(){try{this.notices.set(await firstValueFrom(this.http.get<Array<{id:string;message:string}>>(environment.apiUrl+'/auth/notifications',{headers:new HttpHeaders()})));}catch{}}

  logout() {
    void this.http.post(environment.apiUrl+'/auth/logout',{}).subscribe({complete:()=>{sessionStorage.clear();void this.router.navigate(['/connexion']);},error:()=>{sessionStorage.clear();void this.router.navigate(['/connexion']);}});
  }
}
