import { Component, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ParishFooterComponent } from './parish-footer.component';
import { environment } from '../environments/environment';

type FaithfulMember = { id:string; fullName:string|null; firstName:string|null; lastName:string|null; grade:string|null; parish:string|null; functionName:string|null };

@Component({
  selector:'app-faithful-directory',
  standalone:true,
  imports:[RouterLink,ParishFooterComponent],
  template:`
    <main class="directory-page">
      <header><a routerLink="/" class="brand"><img src="ecc-emblem.webp" alt=""><span>AMOUR DES APÔTRES<small>SAINTE-CÉCILE · COTONOU</small></span></a><a class="back" [routerLink]="backLink">Retour à mon espace</a></header>
      <section class="hero"><span>ESPACE PAROISSIAL</span><h1>Annuaire des fidèles</h1><p>Liste des comptes fidèles actifs, avec les grades, paroisses et fonctions renseignés.</p></section>
      <section class="content">
        <div class="summary"><strong>{{filtered().length}}</strong><span>fidèles affichés</span><small>{{gradeCount()}} grades représentés</small></div>
      <label class="search">Rechercher une personne, un grade ou une paroisse<input [value]="query" (input)="filter($event)" type="search" placeholder="Nom, grade, paroisse…"></label>
        @if(error()){<p class="error" role="alert">{{error()}}</p>}@else if(loading()){<p class="empty">Chargement de l’annuaire…</p>}@else if(filtered().length){<div class="member-grid">@for(person of filtered();track person.id){<article class="member"><div class="avatar">{{initials(person)}}</div><div><h2>{{person.fullName||displayName(person)}}</h2><p>{{person.grade||'Grade non renseigné'}}</p><small>{{person.parish||'Paroisse non renseignée'}}</small>@if(person.functionName){<small class="function">{{person.functionName}}</small>}</div></article>}</div>}@else{<p class="empty">Aucun fidèle ne correspond à la recherche.</p>}
      </section>
    </main><parish-footer />`,
  styles:[`:host{display:block}.directory-page{min-height:75vh;background:#f7f8fa;color:#102542;font-family:'DM Sans','Segoe UI',sans-serif}.directory-page header{height:72px;padding:0 max(calc((100vw - 1120px)/2),5%);display:flex;align-items:center;justify-content:space-between;background:white;border-bottom:1px solid #e5e8eb}.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:#102542;font-size:10px;font-weight:800;letter-spacing:1px}.brand img{width:40px;height:40px;object-fit:contain}.brand small{display:block;margin-top:4px;color:#987642;font-size:8px}.back{color:#314964;font-size:11px;text-decoration:none}.hero{padding:48px max(calc((100vw - 1000px)/2),6%);background:#102542;color:white}.hero span{color:#c8ac70;font-size:9px;letter-spacing:1.8px}.hero h1{margin:12px 0;font:40px 'Playfair Display',Georgia,serif}.hero p{color:#d1d9e2;font-size:12px}.content{max-width:1000px;margin:auto;padding:32px 20px 60px}.summary{display:flex;align-items:baseline;gap:9px;padding:15px 18px;background:white;border:1px solid #e4e7ea}.summary strong{font:28px Georgia,serif}.summary span{font-size:12px}.summary small{margin-left:auto;color:#738090;font-size:10px}.search{display:grid;gap:7px;margin:20px 0;color:#52647a;font-size:10px;font-weight:700}.search input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #d9dee4;background:white;font:12px inherit}.member-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.member{display:flex;gap:13px;align-items:center;padding:15px;background:white;border:1px solid #e4e7ea;border-radius:10px}.avatar{width:42px;height:42px;flex:0 0 42px;display:grid;place-items:center;border-radius:50%;background:#f2efe7;color:#856b3e;font-weight:700;font-size:12px}.member h2{margin:0;font-size:13px}.member p{margin:5px 0;color:#876633;font-size:10px;font-weight:700}.member small{display:block;margin-top:3px;color:#718096;font-size:10px}.member .function{color:#52647a}.empty,.error{padding:18px;background:white;color:#65758a;font-size:12px}.error{color:#873f32;background:#f7e9e5}@media(max-width:620px){.member-grid{grid-template-columns:1fr}.hero h1{font-size:32px}.summary{flex-wrap:wrap}.summary small{width:100%;margin:0}}`]
})
export class FaithfulDirectoryComponent {
  readonly role=sessionStorage.getItem('paroisse_role')??'';
  readonly backLink=this.role==='SECRETAIRE_PROGRAMME'?'/programmes-responsable':['ADMIN','SUPER_ADMIN','EDITEUR'].includes(this.role)?'/admin':'/fideles';
  readonly members=signal<FaithfulMember[]>([]);readonly filtered=signal<FaithfulMember[]>([]);readonly loading=signal(true);readonly error=signal('');query='';
  constructor(http:HttpClient){http.get<FaithfulMember[]>(`${environment.apiUrl}/auth/faithful/directory`).subscribe({next:rows=>{const safe=Array.isArray(rows)?rows:[];this.members.set(safe);this.filtered.set(safe);this.loading.set(false)},error:response=>{this.error.set(response?.error?.message??'L’annuaire n’a pas pu être chargé.');this.loading.set(false)}})}
  filter(event:Event){this.query=(event.target as HTMLInputElement).value.toLocaleLowerCase('fr');const value=this.query;this.filtered.set(this.members().filter(person=>[person.fullName,person.firstName,person.lastName,person.grade,person.parish,person.functionName].some(field=>field?.toLocaleLowerCase('fr').includes(value))))}
  displayName(person:FaithfulMember){return [person.firstName,person.lastName].filter(Boolean).join(' ')||'Nom non renseigné'}
  initials(person:FaithfulMember){return this.displayName(person).split(/\s+/).slice(0,2).map(word=>word[0]?.toLocaleUpperCase('fr')).join('')||'F'}
  gradeCount(){return new Set(this.filtered().map(person=>person.grade?.trim()).filter(Boolean)).size}
}
