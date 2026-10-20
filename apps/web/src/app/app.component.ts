import { Component, OnDestroy, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { NavigationEnd } from '@angular/router';
import { environment } from '../environments/environment';

type ProgramCorrection={id:string;message:string;date:string|null;createdAt:string};

@Component({selector:'app-root',standalone:true,imports:[RouterOutlet],template:`
@if(environment.isStaging){<aside class="staging-banner" role="status">ENVIRONNEMENT DE TEST — DONNÉES FICTIVES UNIQUEMENT</aside>}
<router-outlet />
@if(correction();as item){<aside class="correction-toast" role="status" aria-live="polite"><span class="toast-kicker">MESSAGE DE L’ADMINISTRATION</span><strong>Correction du programme biblique</strong><p>{{item.message}}</p>@if(item.date){<small>Séance du {{item.date}}</small>}<button type="button" (click)="dismiss(item.id)">Compris</button></aside>}
`,styles:[`:host{display:contents}.staging-banner{position:relative;z-index:10001;padding:9px 12px;background:#7f1d1d;color:#fff;text-align:center;font:700 12px/1.4 'DM Sans','Segoe UI',sans-serif;letter-spacing:.04em}.correction-toast{position:fixed;right:22px;bottom:22px;z-index:10000;width:min(370px,calc(100vw - 32px));box-sizing:border-box;padding:19px 20px;background:#fffefa;color:#102542;border:1px solid #d8c79f;border-left:4px solid #b28a48;box-shadow:0 16px 48px #10254230;font-family:'DM Sans','Segoe UI',sans-serif}.toast-kicker{display:block;margin-bottom:8px;color:#987642;font-size:9px;font-weight:700;letter-spacing:1.3px}.correction-toast strong{font:18px 'Playfair Display',Georgia,serif}.correction-toast p{margin:9px 0;color:#425267;font-size:12px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.correction-toast small{display:block;color:#778292;font-size:10px}.correction-toast button{display:block;margin:14px 0 0 auto;padding:9px 15px;background:#102542;border:0;color:#fff;font-size:11px;font-weight:600;cursor:pointer}.correction-toast button:focus-visible{outline:3px solid #bb9754;outline-offset:2px}@media(max-width:480px){.correction-toast{right:12px;bottom:12px}}`]} )
export class AppComponent implements OnDestroy {
  readonly environment=environment;
  correction=signal<ProgramCorrection|null>(null);
  private readonly subs=new Subscription();
  private timer:ReturnType<typeof setInterval>|null=null;
  private loaded=false;
  constructor(private readonly http:HttpClient,router:Router){
    this.subs.add(router.events.pipe(filter(event=>event instanceof NavigationEnd)).subscribe(()=>this.loadCorrection()));
    this.timer=setInterval(()=>this.loadCorrection(),20000);
  }
  private loadCorrection(){
    if(sessionStorage.getItem('paroisse_role')!=='SECRETAIRE_PRESENCE')return;
    if(this.loaded)return;
    this.loaded=true;
    this.http.get<ProgramCorrection[]>(`${environment.apiUrl}/attendance/course-corrections`).subscribe({next:items=>{if(items.length)this.correction.set(items[0]);this.loaded=false},error:()=>{this.loaded=false}});
  }
  dismiss(id:string){
    this.http.post(`${environment.apiUrl}/attendance/course-corrections/read`,{requestId:id}).subscribe({next:()=>this.correction.set(null),error:()=>this.correction.set(null)});
  }
  ngOnDestroy(){this.subs.unsubscribe();if(this.timer)clearInterval(this.timer)}
}
