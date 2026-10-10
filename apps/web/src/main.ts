import { enableProdMode, importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, Routes } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { AppComponent } from './app/app.component';
import { HomeComponent } from './app/home.component';
import { AttendanceComponent } from './app/attendance.component';
import { AuthComponent } from './app/auth.component';
import { AdminComponent } from './app/admin.component';
import { authGuard } from './app/auth.guard';
import { authInterceptor } from './app/auth.interceptor';
import { CourseProgramComponent } from './app/course-program.component';
import { environment } from './environments/environment';

const routes: Routes = [
  {path:'', component:HomeComponent},
  {path:'connexion',component:AuthComponent,data:{mode:'login'}},
  {path:'inscription-responsable',component:AuthComponent,data:{mode:'responsible-registration'}},
  {path:'mot-de-passe-oublie',component:AuthComponent,data:{mode:'forgot'}},
  {path:'nouveau-mot-de-passe',redirectTo:'mot-de-passe-oublie'},
  {path:'premiere-connexion',component:AuthComponent,data:{mode:'first-password-change'}},
  {path:'programme-biblique',component:CourseProgramComponent,canActivate:[authGuard],data:{program:true}},
  {path:'admin/connexion',component:AuthComponent,data:{mode:'admin'}},
  {path:'sous-admin/connexion',component:AuthComponent,data:{mode:'subadmin'}},
  {path:'admin',component:AdminComponent,canActivate:[authGuard],data:{admin:true}},
  {path:'presence', component:AttendanceComponent,canActivate:[authGuard]},
  {path:'**', redirectTo:''}
];
bootstrapApplication(AppComponent, {providers:[provideRouter(routes),provideHttpClient(withInterceptors([authInterceptor])),provideServiceWorker('ngsw-worker.js',{enabled:environment.production,registrationStrategy:'registerWhenStable:30000'})]}).catch(console.error);
