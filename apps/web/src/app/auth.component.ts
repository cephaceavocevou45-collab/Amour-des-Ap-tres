import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../environments/environment';
import { ParishFooterComponent } from './parish-footer.component';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule, RouterLink, ParishFooterComponent],
  template: `
    <main class="auth-page">
      <aside class="auth-brand-panel">
        <a routerLink="/" aria-label="Retour à l’accueil">← Retour à l’accueil</a>
        <img src="ecc-emblem.webp" alt="Emblème de l’Église du Christianisme Céleste">
        <h2>Amour des Apôtres</h2><p>Sainte-Cécile · Cotonou</p>
      </aside>
      <section class="auth-form-panel"><form class="auth-form" (ngSubmit)="submit()">
        <span class="auth-kicker">{{unifiedLogin?'ESPACE DE CONNEXION':admin?'ESPACE D’ADMINISTRATION':faithful||faithfulRegister?'ESPACE FIDÈLES':register?'DEMANDE D’ACCÈS RESPONSABLE':'ESPACE RESPONSABLES'}}</span>
        @if(admin){<span class="auth-admin-tag">{{subadmin?'ACCÈS SOUS-ADMINISTRATEUR':'ACCÈS ADMINISTRATEUR'}}</span>}
        <h1>{{faithfulRegister?'Créer mon compte fidèle':register?'Demander un compte responsable':firstLogin?'Sécuriser votre compte':forgot?(recoveryRequested()?'Réinitialiser le mot de passe':'Mot de passe oublié'):unifiedLogin?'Se connecter':subadmin?'Connexion sous-administrateur':admin?'Connexion administrateur':faithful?'Connexion fidèle':'Connexion responsables'}}</h1>
        <p>{{faithfulRegister?'Créez votre compte vous-même. Il sera actif immédiatement, sans demande ni validation de l’administration.':register?'Les responsables et sous-administrateurs peuvent soumettre une demande. L’accès reste désactivé jusqu’à sa validation par l’administration.':firstLogin?'Votre administrateur vous a remis un mot de passe temporaire. Remplacez-le pour activer votre accès.':forgot?(recoveryRequested()?'Saisissez le code reçu par e-mail, puis choisissez un nouveau mot de passe.':'Saisissez l’adresse e-mail de votre compte. Si elle correspond à un compte, un code de récupération sera envoyé.'):unifiedLogin?'Choisissez votre type de compte, puis saisissez l’adresse e-mail et le mot de passe associés.':subadmin?'Connectez-vous avec le compte et les autorisations attribués par l’administrateur.':admin?'Connectez-vous à votre espace d’administration sécurisé.':faithful?'Connectez-vous pour consulter le programme et les informations réservés aux fidèles inscrits.':'Connectez-vous pour accéder au suivi des présences qui vous est attribué.'}}</p>
        @if(message()){<div class="auth-message" [class.success-message]="!messageIsError()" [attr.role]="messageIsError()?'alert':'status'">{{message()}}</div>}

          @if(unifiedLogin){
            <label for="profile">Type de compte</label>
            <select id="profile" name="profile" [(ngModel)]="profile" required>
              <option value="" disabled>Choisissez votre type de compte</option>
              <option value="faithful">Fidèle</option>
              <option value="presence">Secrétaire de présence ou président d’un jour</option>
              <option value="program">Secrétaire de la paroisse</option>
              <option value="treasury">Trésorier</option>
              <option value="admin">Administrateur</option>
              <option value="subadmin">Sous-administrateur</option>
            </select>
          }

          @if(register){
            <label for="firstName">Prénom</label><input id="firstName" name="firstName" [(ngModel)]="firstName" autocomplete="given-name" required maxlength="80" placeholder="Votre prénom">
            <label for="lastName">Nom</label><input id="lastName" name="lastName" [(ngModel)]="lastName" autocomplete="family-name" required maxlength="120" placeholder="Votre nom de famille">
            <label for="grade">Grade</label><input id="grade" name="grade" [(ngModel)]="grade" required maxlength="80" placeholder="Votre grade dans l’Église">
            <label for="parish">Paroisse</label><input id="parish" name="parish" [(ngModel)]="parish" required maxlength="160" placeholder="Nom de votre paroisse">
            <label for="functionName">Fonction</label><input id="functionName" name="functionName" [(ngModel)]="functionName" required maxlength="120" placeholder="Votre fonction paroissiale">
            <label for="sex">Sexe</label><select id="sex" name="sex" [(ngModel)]="sex" required><option value="" disabled>Choisir</option><option value="M">Masculin</option><option value="F">Féminin</option></select>
            <label for="email">Adresse e-mail</label><input id="email" name="email" [(ngModel)]="email" type="email" autocomplete="email" required maxlength="254" placeholder="vous@exemple.com">
            <label for="phone">Téléphone (facultatif)</label><input id="phone" name="phone" [(ngModel)]="phone" type="tel" autocomplete="tel" maxlength="32" placeholder="+229…">
            @if(!faithfulRegister){
              <label for="requestedRole">Responsabilité demandée</label>
              <select id="requestedRole" name="requestedRole" [(ngModel)]="requestedRole"  required><option value="SECRETAIRE_PRESENCE">Secrétaire de présence</option><option value="SECRETAIRE_PROGRAMME">Secrétaire de la paroisse</option><option value="TRESORIER">Trésorier</option><option value="RESPONSABLE_SEMAINE">Président d’un jour</option><option value="EDITEUR">Sous-administrateur</option></select>
              @if(requestedRole==='RESPONSABLE_SEMAINE'){
                <label for="assignedDay">Jour demandé</label><select id="assignedDay" name="assignedDay" [(ngModel)]="assignedDay" required><option [ngValue]="1">Lundi</option><option [ngValue]="2">Mardi</option><option [ngValue]="3">Mercredi</option><option [ngValue]="4">Jeudi</option><option [ngValue]="5">Vendredi</option><option [ngValue]="6">Samedi</option><option [ngValue]="7">Dimanche</option></select>
              }
            }
            <label for="password">Mot de passe (12 caractères minimum)</label><input id="password" name="password" [(ngModel)]="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required>
            <label for="confirmPassword">Confirmer le mot de passe</label><input id="confirmPassword" name="confirmPassword" [(ngModel)]="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required>
          }
          @else{
          @if(!firstLogin){<label for="email">Adresse e-mail</label><input id="email" name="email" [(ngModel)]="email" type="email" autocomplete="username" required placeholder="vous@exemple.com" [readonly]="forgot&&recoveryRequested()">}
          @if(firstLogin){<label for="password">Mot de passe temporaire</label><input id="password" name="password" [(ngModel)]="password" type="password" autocomplete="current-password" required placeholder="Mot de passe remis par l’administration">}
          @if(!forgot&&!firstLogin){<label for="password">Mot de passe</label><span class="password-field"><input id="password" name="password" [(ngModel)]="password" [type]="passwordVisible()?'text':'password'" autocomplete="current-password" required placeholder="Votre mot de passe"><button class="password-toggle" type="button" (mousedown)="$event.preventDefault()" (click)="togglePassword()" [attr.aria-label]="passwordVisible()?'Masquer le mot de passe':'Afficher le mot de passe'" [attr.aria-pressed]="passwordVisible()"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></span>}
          @if(forgot&&recoveryRequested()){
            <label for="recoveryCode">Code reçu par e-mail</label><input id="recoveryCode" name="recoveryCode" [(ngModel)]="recoveryCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="Code à 6 chiffres">
            <label for="newPassword">Nouveau mot de passe</label><input id="newPassword" name="newPassword" [(ngModel)]="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required placeholder="12 caractères minimum">
            <label for="confirmPassword">Confirmer le nouveau mot de passe</label><input id="confirmPassword" name="confirmPassword" [(ngModel)]="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required placeholder="Saisissez-le une seconde fois">
          }
          @if(firstLogin){
            <label for="newPassword">Nouveau mot de passe</label><input id="newPassword" name="newPassword" [(ngModel)]="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required placeholder="12 caractères minimum">
            <label for="confirmPassword">Confirmer le nouveau mot de passe</label><input id="confirmPassword" name="confirmPassword" [(ngModel)]="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required placeholder="Saisissez-le une seconde fois">
          }
          }
          <button class="auth-submit" [disabled]="busy()">{{busy()?'Veuillez patienter…':faithfulRegister?'Créer mon compte':register?'Envoyer la demande':forgot?(recoveryRequested()?'Réinitialiser le mot de passe':'Envoyer le code'):firstLogin?'Enregistrer le nouveau mot de passe':'Se connecter'}} <span>→</span></button>
          @if(register){<div class="auth-switch">Déjà un compte ? <a [routerLink]="faithfulRegister?'/connexion-fidele':'/connexion'">Se connecter</a></div>}
          @if(forgot){<div class="auth-switch"><a [routerLink]="faithful?'/connexion-fidele':'/connexion'">Retour à la connexion</a>@if(recoveryRequested()){ · <button type="button" class="text-button" (click)="recoveryRequested.set(false)">Demander un autre code</button>}</div>}
          @else if(unifiedLogin){<div class="auth-switch"><a routerLink="/inscription-fidele">Créer un compte fidèle</a> · <a routerLink="/inscription-responsable">Demander un compte responsable</a></div>}
          @else if(subadmin){<div class="auth-switch">Administrateur ? <a routerLink="/connexion">Connexion</a></div>}
          @else if(admin){<div class="auth-switch"><a routerLink="/sous-admin/connexion">Connexion sous-administrateur</a></div>}
          @else if(faithful){<div class="auth-switch">Pas encore de compte fidèle ? <a routerLink="/inscription-fidele">Créer mon compte</a></div>}
          @else if(!register){<div class="auth-switch">Besoin d’un compte responsable ? <a routerLink="/inscription-responsable">Envoyer une demande</a></div>}
          @if(!forgot&&!firstLogin&&!register){<div class="auth-switch"><a [routerLink]="faithful?'/mot-de-passe-oublie-fidele':'/mot-de-passe-oublie'">Mot de passe oublié ?</a></div>}
        <div class="auth-security">{{faithful||faithfulRegister?'Votre compte donne accès aux informations réservées aux fidèles. N’utilisez pas un mot de passe déjà employé sur un autre service.':'Les accès aux présences sont réservés aux responsables validés et sont journalisés. N’utilisez pas un mot de passe déjà employé sur un autre service.'}}</div>
      </form></section>
    </main><parish-footer />`
})
export class AuthComponent {
  private route=inject(ActivatedRoute);private router=inject(Router);private http=inject(HttpClient);
  readonly subadmin=this.route.snapshot.data['mode']==='subadmin';
  readonly faithful=['faithful','faithful-forgot'].includes(this.route.snapshot.data['mode']);
  readonly faithfulRegister=this.route.snapshot.data['mode']==='faithful-register';
  readonly register=this.route.snapshot.data['mode']==='register'||this.faithfulRegister;
  readonly admin=this.route.snapshot.data['mode']==='admin'||this.subadmin;
  readonly forgot=['forgot','faithful-forgot'].includes(this.route.snapshot.data['mode']);
  readonly firstLogin=this.route.snapshot.data['mode']==='first-password-change';
  readonly unifiedLogin=this.route.snapshot.data['mode']==='login';
  profile='';
  email='';password='';newPassword='';confirmPassword='';recoveryCode='';
  fullName='';firstName='';lastName='';grade='';parish='';functionName='';sex: 'M'|'F'|''='';phone='';requestedRole='SECRETAIRE_PRESENCE';assignedDay=1;
  recoveryRequested=signal(false);busy=signal(false);message=signal('');messageIsError=signal(false);passwordVisible=signal(false);

  constructor(){if(this.route.snapshot.queryParamMap.get('expired')){this.message.set('Votre session administrateur a expiré. Reconnectez-vous pour continuer.');this.messageIsError.set(true);}if(this.route.snapshot.queryParamMap.get('passwordChanged'))this.message.set('Votre mot de passe a été modifié. Connectez-vous avec le nouveau mot de passe.');}

  togglePassword(){this.passwordVisible.update(visible=>!visible);}

  async submit(){
    this.busy.set(true);this.message.set('');this.messageIsError.set(false);
    try{
      const email=this.email.trim().toLowerCase();
      if(this.register){
        if(this.password!==this.confirmPassword)throw new Error('La confirmation du mot de passe ne correspond pas.');
        if(this.faithfulRegister){
          const fullName=`${this.firstName.trim()} ${this.lastName.trim()}`;
          const result=await this.http.post<{message:string}>(environment.apiUrl+'/auth/register/faithful',{fullName,firstName:this.firstName.trim(),lastName:this.lastName.trim(),grade:this.grade.trim(),parish:this.parish.trim(),functionName:this.functionName.trim(),sex:this.sex,email,phone:this.phone.trim()||undefined,password:this.password,confirmPassword:this.confirmPassword}).toPromise();
          this.message.set(result?.message??'Votre compte fidèle est créé et actif. Vous pouvez vous connecter dès maintenant.');this.messageIsError.set(false);this.password='';this.confirmPassword='';this.firstName='';this.lastName='';this.grade='';this.parish='';this.functionName='';this.sex='';this.phone='';return;
        }
        const fullName=`${this.firstName.trim()} ${this.lastName.trim()}`;
        const result=await this.http.post<{message:string;profileSetupToken:string}>(environment.apiUrl+'/auth/register',{fullName,firstName:this.firstName.trim(),lastName:this.lastName.trim(),grade:this.grade.trim(),parish:this.parish.trim(),functionName:this.functionName.trim(),sex:this.sex,email,phone:this.phone.trim()||undefined,role:this.requestedRole,...(this.requestedRole==='RESPONSABLE_SEMAINE'?{assignedDayOfWeek:this.assignedDay}:{}),password:this.password,confirmPassword:this.confirmPassword}).toPromise();
        if(!result?.profileSetupToken)throw new Error('La demande a été envoyée, mais l’étape de profil n’a pas pu être ouverte. Contactez le chargé paroissial.');
        localStorage.setItem('paroisse_profile_setup_token',result.profileSetupToken);
        await this.router.navigate(['/demande-responsable-envoyee']);
        this.password='';this.confirmPassword='';this.sex='';return;
      }
      if(this.forgot&&!this.recoveryRequested()){await this.http.post(environment.apiUrl+'/auth/password/forgot',{email}).toPromise();this.recoveryRequested.set(true);this.message.set('Si cette adresse correspond à un compte, un code de récupération sera envoyé. Il expire après 15 minutes.');return;}
      if(this.forgot){const result=await this.http.post<{message:string}>(environment.apiUrl+'/auth/password/reset',{email,code:this.recoveryCode,password:this.newPassword,confirmPassword:this.confirmPassword}).toPromise();this.message.set(result?.message??'Mot de passe modifié. Vous pouvez vous connecter.');this.messageIsError.set(false);this.recoveryRequested.set(false);this.password='';this.newPassword='';this.confirmPassword='';this.recoveryCode='';return;}
      if(this.firstLogin){await this.http.post(environment.apiUrl+'/auth/account/password/first-login',{currentPassword:this.password,newPassword:this.newPassword,confirmPassword:this.confirmPassword}).toPromise();const welcome=sessionStorage.getItem('paroisse_welcome_pending');sessionStorage.clear();if(welcome)sessionStorage.setItem('paroisse_welcome_pending',welcome);await this.router.navigate([this.subadmin?'/sous-admin/connexion':this.admin?'/admin/connexion':'/connexion'],{queryParams:{passwordChanged:'1'}});return;}
      const selectedProfile=this.unifiedLogin?this.profile:this.subadmin?'subadmin':this.admin?'admin':this.faithful?'faithful':'presence';
      const endpoint=selectedProfile==='subadmin'?'/auth/subadmin/login':selectedProfile==='admin'?'/auth/admin/login':selectedProfile==='faithful'?'/auth/faithful/login':'/auth/login';
      const response=await this.http.post<{user:{id:string;name?:string;role:string;permissions?:string[];mustChangePassword?:boolean;firstLogin?:boolean}}>(environment.apiUrl+endpoint,{email,password:this.password}).toPromise();
      if(!response?.user)throw new Error('Réponse de connexion invalide.');
      const expectedRoles:Record<string,string[]>={faithful:['FIDELE'],presence:['SECRETAIRE_PRESENCE','RESPONSABLE_SEMAINE'],program:['SECRETAIRE_PROGRAMME'],treasury:['TRESORIER'],admin:['ADMIN','SUPER_ADMIN'],subadmin:['EDITEUR']};
      if(this.unifiedLogin&&!expectedRoles[selectedProfile]?.includes(response.user.role))throw new Error('Ce compte ne correspond pas au type sélectionné. Choisissez le bon type de compte.');
      if(this.subadmin&&response.user.role!=='EDITEUR')throw new Error('Ce compte n’est pas un sous-administrateur.');
      sessionStorage.removeItem('paroisse_access_token');sessionStorage.setItem('paroisse_user_id',response.user.id);sessionStorage.setItem('paroisse_user_name',response.user.name??'');sessionStorage.setItem('paroisse_role',response.user.role);sessionStorage.setItem('paroisse_permissions',JSON.stringify(response.user.permissions??[]));sessionStorage.setItem('paroisse_verse_pending','1');if(response.user.firstLogin)sessionStorage.setItem('paroisse_welcome_pending','1');
      if(response.user.mustChangePassword){await this.router.navigate(['/premiere-connexion']);return;}
      const role=response.user.role;
      const destination=role==='FIDELE'?'/fideles':['ADMIN','SUPER_ADMIN','EDITEUR'].includes(role)?'/admin':role==='SECRETAIRE_PROGRAMME'?'/programmes-responsable':role==='TRESORIER'?'/tresorerie':['SECRETAIRE_PRESENCE','RESPONSABLE_SEMAINE'].includes(role)?'/presence':'/connexion';await this.router.navigate([destination]);
    }catch(error:any){
      const backend=error?.error?.message,detail=Array.isArray(backend)?backend.join(' '):typeof backend==='string'?backend:'';
      const proxyError=error?.status===500&&error?.headers?.get('content-type')?.includes('text/plain');
      const apiUnavailable=error?.status===0||error?.status===502||error?.status===504||proxyError;
      const retrySeconds=Number(error?.headers?.get('Retry-After')??0),retryText=retrySeconds>0?(retrySeconds<60?` Réessayez dans ${retrySeconds} seconde(s).`:` Réessayez dans environ ${Math.ceil(retrySeconds/60)} minute(s).`):'';
      this.message.set(error?.status===429?`Trop de demandes ont été effectuées depuis ce compte ou cette connexion réseau.${retryText}`:apiUnavailable?'Le serveur API est injoignable. Vérifiez son démarrage et sa connexion à PostgreSQL.':error?.status===503?detail||'Le service demandé est temporairement indisponible.':error?.status===500?'L’API a rencontré une erreur interne. Consultez les journaux du serveur API et sa connexion PostgreSQL.':detail||(error instanceof Error?error.message:'')||'Connexion impossible. Vérifiez vos informations et réessayez.');this.messageIsError.set(true);
    }finally{this.busy.set(false);}
  }
  onRegistrationRoleChange(role:string){this.requestedRole=role;}
}
