import { Component, HostListener, OnDestroy, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../environments/environment';
import { ParishFooterComponent } from './parish-footer.component';

type DoctrineKey = 'precepts' | 'ordinances' | 'sacraments' | 'commandments';
type DoctrineEntry = { number: string; title: string; reference: string; note?: string };

@Component({
  selector: 'parish-home',
  standalone: true,
  imports: [RouterLink, ParishFooterComponent],
  template: `
<main class="site">
  <header class="site-header" [class.is-scrolled]="headerScrolled()">
    <a class="wordmark" href="#accueil"><img src="ecc-emblem.webp" alt=""/><span>AMOUR DES APÔTRES<small>PAROISSE SAINTE-CÉCILE · COTONOU</small></span></a>
    <nav aria-label="Navigation principale"><a href="#prochain-cours">Prochain cours</a><a href="#paroisse">La paroisse</a><a href="#bible">La Bible</a><a href="#foi">Notre foi</a><a href="#contact">Contact</a></nav>
    <div class="header-actions"><a class="faithful-link" routerLink="/fideles">Espace fidèles</a><a class="sign-in" routerLink="/connexion">Connexion responsables</a><a class="sign-up" routerLink="/admin/connexion">Administration <span>↗</span></a></div>
    <button type="button" class="mobile-nav" [attr.aria-label]="mobileMenu()?'Fermer le menu':'Ouvrir le menu'" [attr.aria-expanded]="mobileMenu()" aria-controls="mobile-navigation" (click)="toggleMobileMenu()"><span></span><span></span><span></span></button>
    @if(mobileMenu()){<nav id="mobile-navigation" class="mobile-menu" aria-label="Navigation mobile"><a href="#prochain-cours" (click)="closeMobileMenu()">Prochain cours</a><a href="#paroisse" (click)="closeMobileMenu()">La paroisse</a><a href="#bible" (click)="closeMobileMenu()">La Bible</a><a href="#foi" (click)="closeMobileMenu()">Notre foi</a><a href="#contact" (click)="closeMobileMenu()">Contact</a><a routerLink="/fideles" (click)="closeMobileMenu()">Espace fidèles</a><a routerLink="/connexion" (click)="closeMobileMenu()">Connexion responsables</a><a routerLink="/admin/connexion" (click)="closeMobileMenu()">Connexion administrateur</a><a routerLink="/sous-admin/connexion" (click)="closeMobileMenu()">Connexion sous-administrateur</a></nav>}
  </header>

  <section class="hero" id="accueil"><div class="hero-copy"><span class="eyebrow"><i></i> AMOUR DES APÔTRES · SAINTE-CÉCILE, COTONOU</span><h1 aria-label="Vénérable Suprême Évangéliste SEWADE KOUESSIVI Lucien"><span class="hero-title-line">Vénérable Suprême</span><span class="hero-title-line">Évangéliste</span><em class="hero-name">SEWADE KOUESSIVI Lucien</em></h1><p class="hero-role">Chargé paroissial · Paroisse Amour des Apôtres</p><p>Bienvenue dans notre maison de prière à Sainte-Cécile. Avançons ensemble dans la Parole de Dieu, la prière et le service.</p><div class="hero-ctas"><a class="gold-button" href="#paroisse">Découvrir la paroisse <span aria-hidden="true">↗</span></a><a class="quiet-link" routerLink="/connexion">Accéder aux présences <span aria-hidden="true">→</span></a></div><div class="hero-verse"><span aria-hidden="true">“</span><div>« Ta parole est une lampe à mes pieds,<br>et une lumière sur mon sentier. »<small>PSAUME 119:105</small></div></div></div><div class="hero-seal"><div class="hero-halo" aria-hidden="true"></div><picture class="hero-photo"><source type="image/webp" srcset="leader-480.webp 480w, leader-720.webp 720w" sizes="(max-width: 650px) 100vw, 440px"/><img src="leader-720.webp" width="720" height="480" alt="Vénérable Suprême Évangéliste SEWADE KOUESSIVI Lucien, chargé paroissial" fetchpriority="high" decoding="async"/></picture><img class="hero-emblem" src="ecc-emblem.webp" width="124" height="112" alt="Emblème de l’Église du Christianisme Céleste"/><div class="seal-caption"><strong>PAROISSE AMOUR DES APÔTRES</strong><span>SAINTE-CÉCILE · COTONOU</span></div></div><div class="hero-bottom"><span>SAINTE-CÉCILE · COTONOU, BÉNIN</span><span class="hero-line"></span><span>OUVERT À TOUS</span></div></section>

  <section class="course-card" id="prochain-cours" aria-labelledby="course-heading"><div><span class="course-kicker">ÉTUDE BIBLIQUE · SAINTE-CÉCILE</span><h2 id="course-heading">Prochain cours biblique</h2><p class="course-date" data-testid="next-course-date">{{nextCourseDate()}}</p><p>Chaque lundi · de 19 h 30 à 21 h 30 · Heure de Cotonou</p></div><div class="course-status" data-testid="course-status" [class.is-live]="sessionInProgress()" role="status">{{sessionInProgress() ? 'Séance en cours' : 'Prochaine rencontre'}}</div><div class="course-countdown"><strong>{{sessionInProgress() ? 'Fin estimée dans' : 'Début dans'}}</strong><span data-testid="course-countdown" aria-live="off">{{courseCountdown()}}</span></div></section>

  <section class="welcome section" id="paroisse"><div class="section-kicker"><span>01</span> NOTRE PAROISSE</div><div class="welcome-layout"><div><h2>Grandir dans la foi,<br><em>servir avec amour.</em></h2><p>La paroisse Amour des Apôtres est un lieu de prière, d’enseignement et de fraternité. Nous accueillons chacun avec joie pour découvrir les Écritures et cheminer ensemble.</p><div class="welcome-meta"><span class="meta-icon">✦</span><span>Église du Christianisme Céleste<br><small>Sainte-Cécile · Cotonou</small></span></div></div><div class="welcome-quote"><span class="quote-star">✳</span><p>« Là où deux ou trois sont assemblés en mon nom, je suis au milieu d’eux. »</p><small>MATTHIEU 18:20</small><img src="ecc-emblem.webp" alt=""/></div></div></section>

  <section class="scripture-marquee" aria-label="Versets bibliques à méditer"><div class="scripture-track">@for(verse of verses;track verse.reference){<article class="scripture-item"><span aria-hidden="true">✦</span><p>« {{verse.text}} »</p><small>{{verse.reference}}</small></article>}</div></section>

  <section class="portrait-section section" aria-labelledby="portrait-heading"><div class="section-kicker">MÉMOIRE ET ESPÉRANCE</div><div class="portrait-heading"><h2 id="portrait-heading">Une foi reçue,<br><em>une espérance vivante.</em></h2><p>À travers l’histoire de l’ECC et le témoignage de Jésus-Christ, nous gardons vivante la foi qui nous rassemble.</p></div><div class="portrait-grid"><figure class="portrait-card founder-card"><picture><source type="image/webp" srcset="fondateur-ecc-480.webp 480w, fondateur-ecc-640.webp 640w" sizes="(max-width: 650px) 92vw, 42vw"/><img src="fondateur-ecc-640.webp" width="640" height="812" alt="Portrait de Samuel Biléou Joseph Oshoffa, fondateur de l’Église du Christianisme Céleste" loading="lazy" decoding="async"/></picture><figcaption><span>FONDATEUR DE L’ECC</span><strong>Samuel Biléou Joseph Oshoffa</strong><small>Repère historique de l’Église du Christianisme Céleste</small></figcaption></figure><figure class="portrait-card christ-card"><picture><source type="image/webp" srcset="jesus-christ-480.webp 480w, jesus-christ-720.webp 720w" sizes="(max-width: 650px) 92vw, 42vw"/><img src="jesus-christ-720.webp" width="720" height="1080" alt="Illustration de Jésus-Christ fournie par la paroisse" loading="lazy" decoding="async"/></picture><figcaption><span>JÉSUS-CHRIST</span><strong>Le Christ, espérance de notre foi</strong><small>Illustration fournie pour la paroisse.</small></figcaption></figure></div></section>

  <section class="leader-section"><div class="section leader-inner"><div class="section-kicker"><span>02</span> UN MOT D’ACCUEIL</div><div class="leader-card"><div class="leader-mark leader-mark-seal"><picture><source type="image/webp" srcset="paroisse-emblem-480.webp 480w, paroisse-emblem-720.webp 720w" sizes="(max-width: 650px) 64vw, 360px"/><img src="paroisse-emblem-720.webp" width="720" height="720" alt="Emblème de la paroisse Amour des Apôtres" decoding="async"/></picture></div><div class="leader-copy"><div class="eyebrow">LE CHARGÉ PAROISSIAL</div><h2>Vénérable Suprême<br>Évangéliste <em>SEWADE<br>KOUESSIVI Lucien</em></h2><blockquote>« Que la paix du Seigneur soit avec vous. C’est avec joie que nous vous accueillons dans notre maison de prière. Que chaque rencontre fortifie votre foi et vous apporte la paix. »</blockquote><span class="leader-signature">Avec amour et bénédiction</span></div></div></div></section>

  <section class="bible-section section" id="bible"><div class="section-kicker"><span>03</span> LA PAROLE DE DIEU</div><div class="bible-heading"><div><h2>La Bible, à lire<br><em>et à méditer.</em></h2><p>Retrouvez les Écritures selon plusieurs traductions françaises et explorez les livres de l’Ancien et du Nouveau Testament.</p></div><span class="bible-sigil">✝</span></div><figure class="bible-goun-feature"><picture><source type="image/webp" srcset="bible-goun-480.webp 480w, bible-goun-720.webp 720w" sizes="(max-width: 650px) 35vw, 220px"/><img src="bible-goun-720.webp" width="720" height="960" alt="Bible en langue goun" loading="lazy" decoding="async"/></picture><figcaption><span>ÉCRITURES EN LANGUE GOUN</span><strong>Bible en langue goun</strong></figcaption></figure><div class="versions"><a href="https://www.bible.com/fr/bible/93/GEN.1.LSG" target="_blank" rel="noopener"><span class="version-icon">A</span><span><strong>Louis Segond 1910</strong><small>Traduction classique · Français</small></span><b>↗</b></a><a href="https://www.bible.com/fr/bible/96/GEN.1.OST" target="_blank" rel="noopener"><span class="version-icon">B</span><span><strong>Ostervald 1996</strong><small>Version révisée · Français</small></span><b>↗</b></a><a href="https://www.bible.com/fr/bible/64/GEN.1.DBY" target="_blank" rel="noopener"><span class="version-icon">C</span><span><strong>Darby 1885</strong><small>Traduction littérale · Français</small></span><b>↗</b></a></div><div class="testament-grid"><article><span>ANCIEN TESTAMENT</span><strong>39 livres</strong><p>De la Genèse à Malachie</p><a href="https://www.bible.com/fr/bible/93/GEN.1.LSG" target="_blank" rel="noopener">Ouvrir les Écritures <b>↗</b></a></article><article><span>NOUVEAU TESTAMENT</span><strong>27 livres</strong><p>De Matthieu à l’Apocalypse</p><a href="https://www.bible.com/fr/bible/93/MAT.1.LSG" target="_blank" rel="noopener">Ouvrir les Écritures <b>↗</b></a></article></div><p class="bible-note">La lecture complète s’ouvre sur Bible.com. Les traductions et leurs conditions d’utilisation dépendent de leur éditeur.</p></section>

  <section class="study-section"><div class="section study-inner"><div class="section-kicker"><span>04</span> ÉTUDE BIBLIQUE</div><div class="study-layout"><div><h2>Un rendez-vous<br><em>avec la Parole.</em></h2><p>Chaque semaine, retrouvons-nous pour apprendre, poser nos questions et grandir ensemble dans la connaissance des Écritures.</p></div><div class="study-steps"><div><b>01</b><span><strong>Résumé précédent</strong><small>Reprendre le fil de notre étude</small></span></div><div><b>02</b><span><strong>Explication du texte</strong><small>Comprendre le passage biblique</small></span></div><div><b>03</b><span><strong>Échange des moniteurs</strong><small>Écouter les éclairages de l’équipe</small></span></div><div><b>04</b><span><strong>Explication du thème</strong><small>Approfondir le sujet de la rencontre</small></span></div></div></div></div></section>

  <section class="faith-section section" id="foi"><div class="section-kicker"><span>05</span> REPÈRES DE FOI</div><div class="faith-heading"><div><h2>Notre foi,<br><em>nos repères.</em></h2><p>Explorez les textes bibliques qui éclairent les enseignements et les pratiques de la paroisse.</p></div><a class="source-link" routerLink="/connexion">Accès au programme biblique <span>↗</span></a></div>
    <div class="doctrine-tabs" role="tablist" aria-label="Rubriques doctrinales"><button id="doctrine-precepts-tab" role="tab" [attr.aria-selected]="activeDoctrine()==='precepts'" [class.active]="activeDoctrine()==='precepts'" (click)="activeDoctrine.set('precepts')">12 interdits <small>01</small></button><button id="doctrine-ordinances-tab" role="tab" [attr.aria-selected]="activeDoctrine()==='ordinances'" [class.active]="activeDoctrine()==='ordinances'" (click)="activeDoctrine.set('ordinances')">11 ordonnances <small>02</small></button><button id="doctrine-sacrements-tab" role="tab" [attr.aria-selected]="activeDoctrine()==='sacraments'" [class.active]="activeDoctrine()==='sacraments'" (click)="activeDoctrine.set('sacraments')">04 sacrements <small>03</small></button><button id="doctrine-commandments-tab" role="tab" [attr.aria-selected]="activeDoctrine()==='commandments'" [class.active]="activeDoctrine()==='commandments'" (click)="activeDoctrine.set('commandments')">10 commandements <small>04</small></button></div>
    <div class="doctrine-panel" role="tabpanel" [attr.aria-labelledby]="'doctrine-'+activeDoctrine()+'-tab'">
      @if(activeDoctrine()==='precepts'){<div class="doctrine-intro"><strong>12 interdits — repères bibliques</strong><span>Sélection pédagogique de passages bibliques. La formulation doctrinale propre à la paroisse reste à confirmer par son dirigeant.</span></div>}
      @if(activeDoctrine()==='ordinances'){<div class="doctrine-intro"><strong>11 ordonnances</strong><span>Selon les éléments communiqués pour la paroisse ; les références renvoient aux passages associés.</span></div>}
      @if(activeDoctrine()==='sacraments'){<div class="doctrine-intro"><strong>04 sacrements — repères de célébration</strong><span>Proposition de quatre rites appuyés par ces passages ; à confirmer par le dirigeant paroissial avant de les présenter comme liste officielle.</span></div>}
      @if(activeDoctrine()==='commandments'){<div class="doctrine-intro"><strong>Les dix commandements</strong><span>Résumé de la loi donnée à Moïse, à lire dans son contexte biblique.</span></div>}
      <div class="doctrine-grid">@for(entry of doctrineEntries[activeDoctrine()];track entry.number){<article class="doctrine-card"><span class="doctrine-number">{{entry.number}}</span><div><h3>{{entry.title}}</h3><small>{{entry.reference}}</small>@if(entry.note){<p>{{entry.note}}</p>}</div></article>}</div>
    </div>
  </section>

  <section class="team-section"><div class="section team-inner"><div class="section-kicker"><span>06</span> L’ÉQUIPE DES COURS BIBLIQUES</div><div class="team-heading"><h2>Des serviteurs<br><em>au cœur de la Parole.</em></h2><p>Une équipe engagée pour préparer et animer nos temps d’étude.</p></div><div class="team-grid"><article><span>RÉSUMÉ PRÉCÉDENT</span><h3>NONDJIGNON Luc</h3><small>Suprême Évangéliste</small></article><article><span>PRÉSENTATION DU THÈME</span><div class="presenter-list">@for(presenter of themePresenters();track presenter.id){<p>@if(presenter.grade){<b class="presenter-grade">{{presenter.grade}}</b><span class="presenter-separator"> - </span> }{{presenter.name}}</p>}</div></article><article><span>EXPLICATION DU TEXTE</span><h3>NANHOU Romain<br>KOUEYIHOUN Victorin</h3><small>Suprêmes Seniors Évangélistes</small></article><article><span>MONITEURS À LA TABLE</span><h3>DOSSEH Justin · SEWADE Isaac<br>NONDJIGNON Luc</h3><small>À votre écoute après le cours</small></article></div></div></section>

  <section class="attendance-cta"><div class="cta-ornament">✳</div><div class="eyebrow">ESPACE DE GESTION DES PRÉSENCES</div><h2>Au service de la paroisse,<br><em>dans la fidélité.</em></h2><p>Les présences sont enregistrées par les responsables désignés et suivies par l’administration paroissiale.</p><div><a class="gold-button" routerLink="/fideles">Programme et informations pour les fidèles <span>↗</span></a><a class="quiet-link light-link" routerLink="/connexion">Connexion responsables</a></div><a class="admin-entry" routerLink="/admin/connexion">Connexion administrateur <span>↗</span></a></section>

  <parish-footer id="contact" />
</main>`
})
export class HomeComponent implements OnDestroy {
  mobileMenu = signal(false);
  activeDoctrine = signal<DoctrineKey>('precepts');
  headerScrolled = signal(false);
  sessionInProgress = signal(false);
  nextCourseDate = signal('');
  courseCountdown = signal('');
  private countdownTimer?: ReturnType<typeof setInterval>;
  readonly fallbackThemePresenters = [
    { id: 'fallback-1', name: 'ASSOU Félicien', grade: 'Assistant Évangéliste', roles: ['PRESENTATION_THEME'] },
    { id: 'fallback-2', name: 'SEWADE Isaac', grade: 'Évangéliste', roles: ['PRESENTATION_THEME'] },
    { id: 'fallback-3', name: 'TABO Christian', grade: 'Dehoto', roles: ['PRESENTATION_THEME'] },
    { id: 'fallback-4', name: 'DAYE Brice', grade: 'Senior Lead', roles: ['PRESENTATION_THEME'] },
    { id: 'fallback-5', name: 'SEWADE Jean', grade: 'Évangéliste', roles: ['PRESENTATION_THEME'] }
  ];
  themePresenters = signal<Array<{id:string;name:string;grade:string|null;roles:string[]}>>(this.fallbackThemePresenters);

  constructor(private readonly http: HttpClient) {
    this.updateCourseCountdown();
    this.countdownTimer = setInterval(() => this.updateCourseCountdown(), 1_000);
    this.http.get<Array<{id:string;name:string;grade:string|null;roles:string[]}>>(`${environment.apiUrl}/public/team`).subscribe({
      next: team => this.themePresenters.set(Array.isArray(team) ? team.filter(person => person.roles.includes('PRESENTATION_THEME')) : this.fallbackThemePresenters),
      error: () => this.themePresenters.set(this.fallbackThemePresenters)
    });
  }

  @HostListener('window:scroll')
  onWindowScroll() { this.headerScrolled.set(window.scrollY > 20); }

  ngOnDestroy() { if (this.countdownTimer) clearInterval(this.countdownTimer); }

  private updateCourseCountdown() {
    const zone = 'Africa/Porto-Novo';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const value = (key: string) => parts.find(part => part.type === key)?.value ?? '0';
    const year = Number(value('year')), month = Number(value('month')), day = Number(value('day'));
    const hour = Number(value('hour')), minute = Number(value('minute')), second = Number(value('second'));
    const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(value('weekday'));
    const minutesToday = hour * 60 + minute;
    const active = weekday === 0 && minutesToday >= 19 * 60 + 30 && minutesToday < 21 * 60 + 30;
    this.sessionInProgress.set(active);
    const daysToMonday = weekday === 0 ? (minutesToday < 19 * 60 + 30 || active ? 0 : 7) : 7 - weekday;
    const monday = new Date(Date.UTC(year, month - 1, day + daysToMonday));
    const target = this.portoNovoWallTimeToDate(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), 19, 30);
    this.nextCourseDate.set(new Intl.DateTimeFormat('fr-FR', {
      timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(target));
    const remainingSeconds = Math.max(0, Math.floor((target.getTime() - Date.now()) / 1_000));
    if (active) {
      const end = this.portoNovoWallTimeToDate(year, month, day, 21, 30);
      this.courseCountdown.set(this.formatCountdown(Math.max(0, Math.floor((end.getTime() - Date.now()) / 1_000))));
    } else {
      this.courseCountdown.set(this.formatCountdown(remainingSeconds));
    }
  }

  private portoNovoWallTimeToDate(year: number, month: number, day: number, hour: number, minute: number) {
    const wallTimeAsUtc = Date.UTC(year, month - 1, day, hour, minute);
    // Use formatted parts rather than parsing locale text, so host locale does not affect the offset.
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Porto-Novo', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(wallTimeAsUtc));
    const part = (key: string) => Number(parts.find(item => item.type === key)?.value ?? 0);
    const observedUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
    return new Date(wallTimeAsUtc - (observedUtc - wallTimeAsUtc));
  }

  private formatCountdown(seconds: number) {
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);
    const remainingSeconds = seconds % 60;
    return `${days} j · ${String(hours).padStart(2, '0')} h · ${String(minutes).padStart(2, '0')} min · ${String(remainingSeconds).padStart(2, '0')} s`;
  }

  readonly verses = [
    { text: 'Ta parole est une lampe à mes pieds.', reference: 'PSAUME 119:105' },
    { text: 'Que tout ce que vous faites se fasse avec charité !', reference: '1 CORINTHIENS 16:14' },
    { text: 'Je suis le chemin, la vérité et la vie.', reference: 'JEAN 14:6' },
    { text: 'Aimez-vous les uns les autres.', reference: 'JEAN 13:34' }
  ];

  readonly doctrineEntries: Record<DoctrineKey, DoctrineEntry[]> = {
    precepts: [
      { number: '01', title: 'Ne pas adorer d’autres dieux ni les idoles', reference: 'Exode 20:3–5' },
      { number: '02', title: 'Ne pas prendre le nom de Dieu en vain', reference: 'Exode 20:7' },
      { number: '03', title: 'Garder un temps consacré à Dieu', reference: 'Exode 20:8–11' },
      { number: '04', title: 'Honorer son père et sa mère', reference: 'Exode 20:12' },
      { number: '05', title: 'Ne pas commettre de meurtre', reference: 'Exode 20:13' },
      { number: '06', title: 'Ne pas commettre d’adultère', reference: 'Exode 20:14' },
      { number: '07', title: 'Ne pas voler', reference: 'Exode 20:15' },
      { number: '08', title: 'Ne pas porter de faux témoignage', reference: 'Exode 20:16' },
      { number: '09', title: 'Ne pas convoiter ce qui appartient à autrui', reference: 'Exode 20:17' },
      { number: '10', title: 'Fuir l’immoralité sexuelle', reference: '1 Corinthiens 6:18' },
      { number: '11', title: 'Éviter l’ivresse', reference: 'Éphésiens 5:18' },
      { number: '12', title: 'Ne pas faire de favoritisme', reference: 'Jacques 2:1–4' }
    ],
    ordinances: [
      { number: '01', title: 'Le baptême par immersion', reference: 'Matthieu 3:16 ; Matthieu 28:19' },
      { number: '02', title: 'L’onction pour la sanctification', reference: 'Lévitique 8:12 ; Jacques 5:14' },
      { number: '03', title: 'L’adoration dans le respect', reference: 'Néhémie 8:6' },
      { number: '04', title: 'Les sept temps de prière', reference: 'Psaume 119:164' },
      { number: '05', title: 'La célébration de la Nativité', reference: 'Luc 2:10–11' },
      { number: '06', title: 'Le lavement des pieds', reference: 'Jean 13:14–15' },
      { number: '07', title: 'La communion — Sainte Cène', reference: '1 Corinthiens 11:23–26' },
      { number: '08', title: 'La célébration de la résurrection', reference: 'Jean 20:1–18', note: 'Veillée du samedi saint au dimanche, à 00 h, selon l’horaire paroissial.' },
      { number: '09', title: 'La célébration de la Pâque', reference: '1 Corinthiens 5:7–8' },
      { number: '10', title: 'L’Ascension de Jésus-Christ', reference: 'Luc 24:50–51' },
      { number: '11', title: 'La Pentecôte et l’effusion de l’Esprit', reference: 'Actes 2:1–4' }
    ],
    sacraments: [
      { number: '01', title: 'Le baptême', reference: 'Matthieu 3:16 ; Matthieu 28:19' },
      { number: '02', title: 'L’onction et la sanctification', reference: 'Lévitique 8:12 ; Jacques 5:14' },
      { number: '03', title: 'La Sainte Cène', reference: '1 Corinthiens 11:23–26' },
      { number: '04', title: 'Le lavement des pieds', reference: 'Jean 13:14–15' }
    ],
    commandments: [
      { number: '01', title: 'Tu n’auras pas d’autres dieux devant ma face', reference: 'Exode 20:3' },
      { number: '02', title: 'Tu ne te feras pas d’image taillée', reference: 'Exode 20:4–6' },
      { number: '03', title: 'Tu ne prendras pas le nom de Dieu en vain', reference: 'Exode 20:7' },
      { number: '04', title: 'Souviens-toi du jour du repos pour le sanctifier', reference: 'Exode 20:8–11' },
      { number: '05', title: 'Honore ton père et ta mère', reference: 'Exode 20:12' },
      { number: '06', title: 'Tu ne tueras point', reference: 'Exode 20:13' },
      { number: '07', title: 'Tu ne commettras point d’adultère', reference: 'Exode 20:14' },
      { number: '08', title: 'Tu ne déroberas point', reference: 'Exode 20:15' },
      { number: '09', title: 'Tu ne porteras point de faux témoignage', reference: 'Exode 20:16' },
      { number: '10', title: 'Tu ne convoiteras point', reference: 'Exode 20:17' }
    ]
  };

  toggleMobileMenu() { this.mobileMenu.update(open => !open); }
  closeMobileMenu() { this.mobileMenu.set(false); }
}
