import { Component } from '@angular/core';

@Component({
  selector: 'parish-footer',
  standalone: true,
  template: `
    <footer class="parish-footer">
      <div class="footer-inner">
        <div class="footer-parish">
          <img src="ecc-emblem.webp" width="46" height="34" alt="Emblème de l’Église du Christianisme Céleste">
          <span><strong>AMOUR DES APÔTRES</strong><small>Église du Christianisme Céleste · Sainte-Cécile, Cotonou</small></span>
        </div>
        <address><small>CHARGÉ PAROISSIAL</small><strong>+229 01 97 12 77 69</strong><div class="footer-actions"><a href="tel:+2290197127769">Appeler</a><a href="https://wa.me/2290197127769" target="_blank" rel="noopener noreferrer">WhatsApp</a></div></address>
        <div class="footer-developer"><small>DÉVELOPPEMENT DU SITE · AVOCEVOU CÉPHACE</small><strong>+229 01 57 17 96 83</strong><div class="footer-actions"><a href="tel:+2290157179683">Appeler</a><a href="https://wa.me/2290157179683" target="_blank" rel="noopener noreferrer">WhatsApp</a></div><a class="footer-email" href="https://mail.google.com/mail/?view=cm&amp;fs=1&amp;to=cephacemacevo%40gmail.com" target="_blank" rel="noopener noreferrer" aria-label="Ouvrir Gmail pour écrire au développeur à cephacemacevo@gmail.com" title="Ouvrir Gmail pour un problème technique seulement">Développement technique : cephacemacevo@gmail.com</a><a class="footer-email-fallback" href="mailto:cephacemacevo@gmail.com" aria-label="Écrire au développeur avec l’application e-mail de cet appareil">Ouvrir une autre application e-mail</a><p class="footer-email-note">Pour un problème technique seulement. N’envoyez jamais de mot de passe ni de nom de fidèle par e-mail.</p></div>
      </div>
      <div class="footer-copyright">© 2026 · Paroisse Amour des Apôtres</div>
    </footer>
  `,
  styles: [`
    :host{display:block;min-width:0}.parish-footer{background:#08172c;color:#f4f6fa;padding:20px max(calc((100vw - 1100px)/2),5%);font-family:'Lato','Segoe UI',sans-serif}.footer-inner{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr) minmax(0,1fr);align-items:center;gap:22px;min-width:0}.footer-parish{display:flex;align-items:center;gap:11px;min-width:0}.footer-parish img{flex:0 0 46px;object-fit:contain}.footer-parish strong,.footer-parish small,.parish-footer address small,.parish-footer address strong,.parish-footer address a,.footer-developer small,.footer-developer strong{display:block}.footer-parish strong,.footer-developer strong{font-size:10px;letter-spacing:.5px}.footer-parish small{margin-top:5px;color:#cbd5e1;font-size:9px;line-height:1.5}.parish-footer address{font-style:normal;min-width:0}.parish-footer address small,.footer-developer small{margin-bottom:5px;color:#e0c990;font-size:8px;letter-spacing:.8px}.parish-footer address strong,.footer-developer strong{font-size:10px;line-height:1.5}.footer-actions{display:flex;gap:12px;margin-top:6px}.parish-footer .footer-actions a{color:#dce5f0;font-size:9px;text-decoration:underline;text-underline-offset:3px}.parish-footer .footer-email,.parish-footer .footer-email-fallback{display:block;width:fit-content;max-width:100%;margin-top:9px;color:#f3d891;font-size:10px;line-height:1.5;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;overflow-wrap:anywhere;cursor:pointer}.parish-footer .footer-email-fallback{margin-top:5px;color:#dce5f0;font-size:9px}.footer-email-note{max-width:36ch;margin:5px 0 0;color:#dce5f0;font-size:9px;line-height:1.55}.parish-footer a:focus-visible{outline:3px solid #f3d891;outline-offset:3px;border-radius:2px}.footer-copyright{margin-top:14px;padding-top:10px;border-top:1px solid #ffffff24;color:#bac7d6;font-size:8px;text-align:center}
    @media(max-width:680px){.parish-footer{padding:18px 16px}.footer-inner{grid-template-columns:minmax(0,1fr);gap:13px}.footer-parish img{width:40px;height:30px;flex-basis:40px}.footer-developer{padding-left:51px;min-width:0}.footer-parish strong,.footer-developer strong{font-size:9px}.parish-footer address{padding-left:51px}.parish-footer address strong{font-size:9px}.footer-actions{gap:16px}.footer-email-note{max-width:100%;font-size:9px}.footer-copyright{text-align:left}}
  `]
})
export class ParishFooterComponent {}
