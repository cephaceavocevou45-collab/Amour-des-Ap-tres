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
import { AccessPendingComponent } from './app/access-pending.component';
import { CourseProgramComponent } from './app/course-program.component';
import { SocialRegisterComponent } from './app/social-register.component';
import { CommunityMessagingComponent } from './app/community-messaging.component';
import { CommunityModerationComponent } from './app/community-moderation.component';
import { CommunityStoriesComponent } from './app/community-stories.component';
import { CommunityLiveComponent } from './app/community-live.component';
import { ParishContentComponent } from './app/parish-content.component';
import { CommunityGroupsComponent } from './app/community-groups.component';
import { CommunityAccountComponent } from './app/community-account.component';
import { environment } from './environments/environment';

const routes: Routes = [
  {path:'', component:HomeComponent},
  {path:'inscription',component:SocialRegisterComponent},
  {path:'connexion',component:AuthComponent,data:{mode:'login'}},
  {path:'mot-de-passe-oublie',component:AuthComponent,data:{mode:'forgot'}},
  {path:'nouveau-mot-de-passe',component:AuthComponent,data:{mode:'reset-password'}},
  {path:'programme-biblique',component:CourseProgramComponent,canActivate:[authGuard],data:{program:true}},
  {path:'programme',component:ParishContentComponent,canActivate:[authGuard],data:{social:true,communityAdmin:true,contentPage:'programme'}},
  {path:'etudes-bibliques',component:ParishContentComponent,canActivate:[authGuard],data:{social:true,communityAdmin:true,contentPage:'etudes'}},
  {path:'histoire',component:ParishContentComponent,canActivate:[authGuard],data:{social:true,communityAdmin:true,contentPage:'histoire'}},
  {path:'actualites',component:CommunityMessagingComponent,canActivate:[authGuard],data:{social:true,communityAdmin:true}},
  {path:'messages',component:CommunityMessagingComponent,canActivate:[authGuard],data:{social:true,communityAdmin:true}},
  {path:'community/stories',component:CommunityStoriesComponent,canActivate:[authGuard],data:{social:true,communityAdmin:true}},
  {path:'community/live',component:CommunityLiveComponent,canActivate:[authGuard],data:{social:true,communityAdmin:true}},
  {path:'community/groups',component:CommunityGroupsComponent,canActivate:[authGuard],data:{social:true,communityAdmin:true}},
  {path:'profil',component:CommunityAccountComponent,canActivate:[authGuard],data:{social:true,communityAdmin:true,accountPage:'profile'}},
  {path:'parametres',component:CommunityAccountComponent,canActivate:[authGuard],data:{social:true,communityAdmin:true,accountPage:'settings'}},
  {path:'admin/connexion',component:AuthComponent,data:{mode:'admin'}},
  {path:'sous-admin/connexion',component:AuthComponent,data:{mode:'subadmin'}},
  {path:'admin',component:AdminComponent,canActivate:[authGuard],data:{admin:true}},
  {path:'admin/moderation',component:CommunityModerationComponent,canActivate:[authGuard],data:{moderation:true}},
  {path:'acces-en-attente',component:AccessPendingComponent},
  {path:'presence', component:AttendanceComponent,canActivate:[authGuard]},
  {path:'**', redirectTo:''}
];
bootstrapApplication(AppComponent, {providers:[provideRouter(routes),provideHttpClient(withInterceptors([authInterceptor])),provideServiceWorker('ngsw-worker.js',{enabled:environment.production,registrationStrategy:'registerWhenStable:30000'})]}).catch(console.error);
