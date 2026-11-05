import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ParishFooterComponent } from './parish-footer.component';

@Component({
  selector: 'app-faithful-resources',
  standalone: true,
  imports: [RouterLink, ParishFooterComponent],
  template: `
    <main class="resources-page">
      <header><a class="brand" routerLink="/fideles">AMOUR DES APÔTRES<small>ESPACE FIDÈLES</small></a><nav><a routerLink="/profil">Mon profil</a><a routerLink="/fideles">Retour à mon espace</a></nav></header>
      <section class="resources-content">
        <span class="kicker">REPÈRES POUR LES FIDÈLES</span>
        <h1>Ressources de l’ECC</h1>
        <p class="intro">Documents, chants et repères de tenue pour accompagner la vie paroissiale.</p>
        <div class="resource-grid">
          <article><span>01</span><div><h2>La Constitution Bleue</h2><p>Document de référence de l’Église du Christianisme Céleste.</p></div></article>
          <article><span>02</span><div><h2>Lumière sur l’ECC</h2><p>Un repère pour mieux connaître l’Église.</p></div></article>
          <article><span>03</span><div><h2>Le livre de cantiques célestes</h2><p>Recueil des chants de l’ECC.</p></div></article>
          <article><span>04</span><div><h2>Carte de membre / carnet de fidèle</h2><p>Délivré par la paroisse.</p></div></article>
          <article><span>05</span><div><h2>La soutane blanche</h2><p>Portée pieds nus.</p></div></article>
        </div>
      </section>
    </main>
    <parish-footer />
  `,
  styles: [`
    :host{display:block}.resources-page{min-height:75vh;background:#f7f4ec;color:#102542;font-family:'DM Sans','Segoe UI',sans-serif}.resources-page header{min-height:72px;padding:0 6%;display:flex;align-items:center;justify-content:space-between;background:#fffefa;border-bottom:1px solid #e4e0d6}.brand{color:#102542;text-decoration:none;font-size:12px;font-weight:800;letter-spacing:1px}.brand small{display:block;margin-top:5px;color:#987642;font-size:8px}.resources-page nav{display:flex;gap:18px}.resources-page nav a{color:#725a31;text-decoration:none;font-size:11px}.resources-content{max-width:900px;margin:auto;padding:46px 20px 70px}.kicker{color:#987642;font-size:9px;font-weight:700;letter-spacing:1.6px}.resources-content h1{margin:12px 0;font:40px Georgia,serif}.intro{color:#66758a;font-size:13px;line-height:1.7}.resource-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:28px}.resource-grid article{display:flex;gap:14px;padding:20px;background:#fffefa;border:1px solid #e4dfd3}.resource-grid article>span{color:#987642;font:20px Georgia,serif}.resource-grid h2{margin:0;font:18px Georgia,serif}.resource-grid p{margin:8px 0 0;color:#6c7888;font-size:12px;line-height:1.6}@media(max-width:600px){.resources-page header{padding:12px 16px;gap:12px;flex-wrap:wrap}.resources-page nav{gap:12px}.resources-content{padding-top:30px}.resource-grid{grid-template-columns:1fr}}
  `]
})
export class FaithfulResourcesComponent {}
