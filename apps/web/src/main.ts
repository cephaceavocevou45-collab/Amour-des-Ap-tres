import { enableProdMode, importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, Routes } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { AppComponent } from './app/app.component';
import { HomeComponent } from './app/home.component';
import { authGuard } from './app/auth.guard';
import { authInterceptor } from './app/auth.interceptor';
import { environment } from './environments/environment';

const routes: Routes = [
  {path:'', component:HomeComponent},
  {path:'fideles',loadComponent:()=>import('./app/faithful.component').then(m=>m.FaithfulComponent)},
  {path:'connexion',loadComponent:()=>import('./app/auth.component').then(m=>m.AuthComponent),data:{mode:'login'}},
  {path:'inscription-responsable',loadComponent:()=>import('./app/auth.component').then(m=>m.AuthComponent),data:{mode:'register'}},
  {path:'mot-de-passe-oublie',loadComponent:()=>import('./app/auth.component').then(m=>m.AuthComponent),data:{mode:'forgot'}},
  {path:'nouveau-mot-de-passe',redirectTo:'mot-de-passe-oublie'},
  {path:'premiere-connexion',loadComponent:()=>import('./app/auth.component').then(m=>m.AuthComponent),data:{mode:'first-password-change'}},
  {path:'programme-biblique',loadComponent:()=>import('./app/course-program.component').then(m=>m.CourseProgramComponent),canActivate:[authGuard],data:{program:true}},
  {path:'admin/connexion',loadComponent:()=>import('./app/auth.component').then(m=>m.AuthComponent),data:{mode:'admin'}},
  {path:'sous-admin/connexion',loadComponent:()=>import('./app/auth.component').then(m=>m.AuthComponent),data:{mode:'subadmin'}},
  {path:'admin',loadComponent:()=>import('./app/admin.component').then(m=>m.AdminComponent),canActivate:[authGuard],data:{admin:true}},
  {path:'admin/informations',loadComponent:()=>import('./app/admin-announcements.component').then(m=>m.AdminAnnouncementsComponent),canActivate:[authGuard],data:{announcements:true}},
  {path:'presence', loadComponent:()=>import('./app/attendance.component').then(m=>m.AttendanceComponent),canActivate:[authGuard]},
  {path:'**', redirectTo:''}
];
bootstrapApplication(AppComponent, {providers:[provideRouter(routes),provideHttpClient(withInterceptors([authInterceptor])),provideServiceWorker('ngsw-worker.js',{enabled:environment.production,registrationStrategy:'registerWhenStable:30000'})]}).catch(console.error);
