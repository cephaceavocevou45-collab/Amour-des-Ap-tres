import { DatePipe } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../environments/environment';

type AppointmentMessage = {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  sender: { id: string; fullName: string | null; role: string; photoUrl: string | null };
};
type Appointment = {
  id: string;
  preferredAt: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
  requester: { id: string; fullName: string | null; email: string; phone: string | null };
  conversation: { id: string; messages: AppointmentMessage[] } | null;
};

@Component({
  selector: 'app-appointments-inbox',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <main class="page">
      <header>
        <a class="brand" [routerLink]="isAdmin ? '/admin' : '/fideles'">
          AMOUR DES APÔTRES
          <small>{{ isAdmin ? 'ESPACE ADMINISTRATION' : 'ESPACE FIDÈLES' }}</small>
        </a>
        <a class="back" [routerLink]="isAdmin ? '/admin' : '/fideles'">← Retour</a>
      </header>
      <section class="content">
        <span class="kicker">RENCONTRE PAROISSIALE</span>
        <h1>{{ isAdmin ? 'Demandes de rendez-vous' : 'Rencontrer le chargé paroissial' }}</h1>
        @if (feedback()) {
          <p class="notice" [class.error]="failed()" role="status">{{ feedback() }}</p>
        }

        @if (!isAdmin) {
          <p class="intro">Décrivez votre demande et proposez une date. Le chargé paroissial recevra une alerte; vous pourrez poursuivre cet échange ici.</p>
          <form class="card form" (ngSubmit)="submit()">
            <label>Sujet<input name="subject" [(ngModel)]="subject" required minlength="3" maxlength="160" placeholder="Ex. Rencontre avec le chargé paroissial"></label>
            <label>Date et heure souhaitées<input name="preferredAt" type="datetime-local" [(ngModel)]="preferredAt" required></label>
            <label>Votre message<textarea name="message" [(ngModel)]="message" required minlength="8" maxlength="2000" placeholder="Précisez brièvement l’objet de votre demande"></textarea></label>
            <button type="submit" [disabled]="busy()">{{ busy() ? 'Envoi…' : 'Envoyer la demande' }}</button>
          </form>
        }

        @if (loading()) {
          <p class="card">Chargement des demandes…</p>
        } @else if (items().length) {
          @for (item of items(); track item.id) {
            <article class="card appointment">
              <div class="row">
                <h2>{{ item.subject }}</h2>
                <span class="status">{{ statusLabel(item.status) }}</span>
              </div>
              @if (isAdmin) {
                <p><strong>{{ item.requester.fullName || 'Fidèle' }}</strong> · {{ item.requester.email }}{{ item.requester.phone ? ' · ' + item.requester.phone : '' }}</p>
              }
              <p><strong>Date souhaitée :</strong> {{ item.preferredAt | date:'full' }}</p>
              <section class="thread" aria-label="Conversation du rendez-vous">
                <h3>Échange avec le chargé paroissial</h3>
                @for (entry of item.conversation?.messages ?? []; track entry.id) {
                  <article class="message" [class.mine]="entry.senderId === currentUserId">
                    <div class="message-heading">
                      @if (entry.sender.photoUrl) { <img [src]="entry.sender.photoUrl" [alt]="'Photo de ' + (entry.sender.fullName || 'la personne')"> }
                      <strong>{{ entry.senderId === currentUserId ? 'Vous' : (entry.sender.fullName || (entry.sender.role === 'ADMIN' || entry.sender.role === 'SUPER_ADMIN' ? 'Chargé paroissial' : 'Secrétaire')) }}</strong>
                      <time>{{ entry.createdAt | date:'short' }}</time>
                    </div>
                    <p>{{ entry.body }}</p>
                  </article>
                } @empty {
                  <p class="empty">Aucun message dans cet échange.</p>
                }
              </section>
              <form class="reply" (ngSubmit)="reply(item)">
                <label [for]="'reply-' + item.id">Votre réponse<textarea [id]="'reply-' + item.id" [name]="'reply-' + item.id" [(ngModel)]="replyDrafts[item.id]" required maxlength="4000" placeholder="Écrivez votre réponse"></textarea></label>
                <button type="submit" [disabled]="replyingId() === item.id || !replyDrafts[item.id]?.trim()">
                  {{ replyingId() === item.id ? 'Envoi…' : 'Envoyer la réponse' }}
                </button>
              </form>
              @if (isAdmin && item.status === 'EN_ATTENTE') {
                <div class="actions">
                  <button type="button" (click)="setStatus(item, 'CONFIRME')" [disabled]="busy()">Confirmer le rendez-vous</button>
                  <button class="secondary" type="button" (click)="setStatus(item, 'REFUSE')" [disabled]="busy()">Refuser</button>
                </div>
              }
            </article>
          }
        } @else if (!isAdmin) {
          <p class="card empty">Vos demandes de rendez-vous et leurs réponses apparaîtront ici.</p>
        } @else {
          <p class="card empty">Aucune demande de rendez-vous pour le moment.</p>
        }
      </section>
    </main>
  `,
  styles: [`
    :host{display:block}.page{min-height:100vh;background:#f7f5ef;color:#142944;font-family:'DM Sans','Segoe UI',sans-serif}
    .page header{height:70px;padding:0 6%;display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #e4e0d6}
    .brand,.back{color:#142944;text-decoration:none}.brand{font-size:11px;font-weight:700;letter-spacing:1px}.brand small{display:block;margin-top:4px;color:#987642;font-size:8px;letter-spacing:1.5px}.back{font-size:11px}
    .content{max-width:850px;margin:auto;padding:48px 20px 80px}.kicker{color:#987642;font-size:9px;font-weight:700;letter-spacing:1.8px}
    .content h1{font:38px Georgia,serif;margin:12px 0}.intro{color:#69788a;font-size:13px;line-height:1.7}
    .card{margin:16px 0;padding:20px;background:#fff;border:1px solid #e3dfd5}.form,.reply{display:grid;gap:15px}
    label{display:grid;gap:6px;color:#59697b;font-size:11px;font-weight:700}
    input,textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid #dcd7cb;background:#fff;color:#18304d;font:13px 'DM Sans','Segoe UI',sans-serif}
    textarea{min-height:100px;resize:vertical}.form button,.reply button,.actions button{padding:12px 16px;background:#142944;color:#fff;border:0;font-weight:600;cursor:pointer}
    button:disabled{opacity:.6;cursor:wait}.notice{padding:12px;background:#e9f2eb;color:#356244}.notice.error{background:#f7e9e5;color:#873f32}
    .row{display:flex;justify-content:space-between;gap:12px;align-items:center}.row h2{margin:0;font:22px Georgia,serif}.status{padding:5px 8px;background:#f1eee7;color:#725a31;font-size:10px}
    .appointment>p{color:#53657b;font-size:12px;line-height:1.7}.thread{margin:20px 0;padding:16px;background:#f8f7f3;border:1px solid #ebe7de}.thread h3{margin:0 0 14px;font:18px Georgia,serif}
    .message{margin:10px 0;padding:12px;background:#fff;border:1px solid #e6e1d7}.message.mine{margin-left:8%;background:#eef3f8}.message-heading{display:flex;align-items:center;gap:8px;font-size:10px}.message-heading img{width:28px;height:28px;border-radius:50%;object-fit:cover}.message-heading time{margin-left:auto;color:#778394}.message p{margin:9px 0 0;white-space:pre-wrap;font-size:12px;line-height:1.6}
    .reply{margin-top:14px}.actions{display:flex;gap:9px;margin-top:14px}.actions .secondary{background:#fff;color:#142944;border:1px solid #dcd7cb}.empty{color:#6e7c8e;font-size:12px}
    @media(max-width:600px){.content{padding:34px 14px 60px}.content h1{font-size:32px}.card{padding:16px}.row{align-items:flex-start;flex-direction:column}.message.mine{margin-left:3%}}
  `],
})
export class AppointmentsInboxComponent {
  readonly isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(sessionStorage.getItem('paroisse_role') ?? '');
  readonly currentUserId = sessionStorage.getItem('paroisse_user_id') ?? '';
  readonly items = signal<Appointment[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly replyingId = signal('');
  readonly feedback = signal('');
  readonly failed = signal(false);
  replyDrafts: Record<string, string> = {};
  subject = '';
  message = '';
  preferredAt = this.defaultDateTime();

  constructor(private readonly http: HttpClient, private readonly router: Router) {
    if (!this.isAdmin && sessionStorage.getItem('paroisse_role') !== 'FIDELE') {
      void this.router.navigate(['/connexion']);
      return;
    }
    this.load();
  }

  private defaultDateTime() {
    const date = new Date(Date.now() + 86_400_000);
    date.setMinutes(0, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  load() {
    this.loading.set(true);
    this.http.get<Appointment[]>(`${environment.apiUrl}/appointments`).subscribe({
      next: rows => { this.items.set(rows); this.loading.set(false); },
      error: response => { this.loading.set(false); this.failed.set(true); this.feedback.set(response?.error?.message ?? 'Impossible de charger les demandes.'); },
    });
  }

  submit() {
    if (this.subject.trim().length < 3 || this.message.trim().length < 8 || !this.preferredAt) return;
    this.busy.set(true);
    this.failed.set(false);
    this.feedback.set('');
    this.http.post(`${environment.apiUrl}/appointments`, {
      subject: this.subject.trim(),
      message: this.message.trim(),
      preferredAt: new Date(this.preferredAt).toISOString(),
    }).subscribe({
      next: () => {
        this.busy.set(false);
        this.subject = '';
        this.message = '';
        this.feedback.set('Votre demande a bien été reçue par le chargé paroissial. Il est occupé pour le moment et vous répondra dans quelques instants.');
        this.load();
      },
      error: response => {
        this.busy.set(false);
        this.failed.set(true);
        this.feedback.set(response?.error?.message ?? 'La demande n’a pas pu être envoyée. Réessayez.');
      },
    });
  }

  reply(item: Appointment) {
    const message = this.replyDrafts[item.id]?.trim();
    if (!message) return;
    this.replyingId.set(item.id);
    this.http.post(`${environment.apiUrl}/appointments/${item.id}/reply`, { message }).subscribe({
      next: () => {
        this.replyDrafts[item.id] = '';
        this.replyingId.set('');
        this.failed.set(false);
        this.feedback.set('Votre réponse a été envoyée.');
        this.load();
      },
      error: response => {
        this.replyingId.set('');
        this.failed.set(true);
        this.feedback.set(response?.error?.message ?? 'La réponse n’a pas pu être envoyée.');
      },
    });
  }

  setStatus(item: Appointment, status: 'CONFIRME' | 'REFUSE') {
    this.busy.set(true);
    this.failed.set(false);
    this.feedback.set('');
    this.http.patch(`${environment.apiUrl}/appointments/${item.id}/status`, { status }).subscribe({
      next: () => {
        this.busy.set(false);
        this.feedback.set(status === 'CONFIRME' ? 'Rendez-vous confirmé. Le fidèle a été averti.' : 'Demande refusée. Le fidèle a été averti.');
        this.load();
      },
      error: response => {
        this.busy.set(false);
        this.failed.set(true);
        this.feedback.set(response?.error?.message ?? 'La demande n’a pas pu être mise à jour.');
      },
    });
  }

  statusLabel(status: string) {
    return status === 'CONFIRME' ? 'Confirmé' : status === 'REFUSE' ? 'Refusé' : 'En attente';
  }
}
