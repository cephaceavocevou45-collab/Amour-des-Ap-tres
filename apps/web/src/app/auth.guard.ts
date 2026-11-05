import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

export const authenticatedHomeGuard: CanActivateFn = () => {
  const role = sessionStorage.getItem('paroisse_role');
  if (!role) return true;
  const destination = role === 'FIDELE' ? '/fideles'
    : ['ADMIN', 'SUPER_ADMIN', 'EDITEUR'].includes(role) ? '/admin'
    : role === 'SECRETAIRE_PROGRAMME' ? '/programmes-responsable'
    : role === 'TRESORIER' ? '/tresorerie'
    : ['SECRETAIRE_PRESENCE', 'RESPONSABLE_SEMAINE'].includes(role) ? '/presence'
    : '/connexion';
  return inject(Router).parseUrl(destination);
};

export const authGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const role = sessionStorage.getItem('paroisse_role');
  if (!role) return router.createUrlTree([route.data['faithful'] ? '/connexion-fidele' : route.data['admin']||route.data['announcements'] ? '/admin/connexion' : '/connexion']);
  let permissions: string[] = [];
  try { permissions = JSON.parse(sessionStorage.getItem('paroisse_permissions') ?? '[]'); } catch { /* Session locale invalide. */ }
  if (route.data['faithful'] && role !== 'FIDELE') return router.createUrlTree(['ADMIN','SUPER_ADMIN','EDITEUR'].includes(role) ? ['/admin'] : ['SECRETAIRE_PRESENCE','RESPONSABLE_SEMAINE'].includes(role) ? ['/presence'] : role==='SECRETAIRE_PROGRAMME'?['/programmes-responsable']:role==='TRESORIER'?['/tresorerie']:['/connexion-fidele']);
  if (route.data['directory'] && !(['ADMIN','SUPER_ADMIN','SECRETAIRE_PROGRAMME'].includes(role)||permissions.includes('ANNUAIRE_FIDELES'))) return router.createUrlTree([role==='FIDELE'?'/fideles':role==='TRESORIER'?'/tresorerie':'/connexion']);
  if (route.data['faithfulRegister'] && !['ADMIN','SUPER_ADMIN','SECRETAIRE_PRESENCE'].includes(role)) return router.createUrlTree([role==='FIDELE'?'/fideles':role==='SECRETAIRE_PROGRAMME'?'/programmes-responsable':'/connexion']);
  if (route.data['program'] && !['ADMIN', 'SUPER_ADMIN', 'EDITEUR', 'SECRETAIRE_PRESENCE'].includes(role)) return router.createUrlTree(['/connexion']);
  if (route.data['program'] && role === 'EDITEUR' && !permissions.includes('PROGRAMME_BIBLIQUE')) return router.createUrlTree(['/admin']);
  if (route.data['admin'] && !['ADMIN', 'SUPER_ADMIN', 'EDITEUR'].includes(role)) return router.createUrlTree(['/connexion']);
  if (route.data['announcements'] && !['ADMIN', 'SUPER_ADMIN'].includes(role)) return router.createUrlTree(['/admin']);
  if (route.data['parishPrograms'] && !['SECRETAIRE_PROGRAMME','ADMIN','SUPER_ADMIN'].includes(role)) return router.createUrlTree(['/connexion']);
  if (route.data['treasury'] && !['TRESORIER','ADMIN','SUPER_ADMIN'].includes(role)) return router.createUrlTree(['/connexion']);
  if (!route.data['admin'] && !route.data['program'] && !route.data['faithful'] && !route.data['directory'] && !route.data['faithfulRegister'] && !route.data['parishPrograms'] && !route.data['treasury'] && !route.data['accountSettings'] && !['ADMIN', 'SUPER_ADMIN', 'SECRETAIRE_PRESENCE', 'RESPONSABLE_SEMAINE'].includes(role)) return router.createUrlTree([role==='FIDELE'?'/fideles':role==='SECRETAIRE_PROGRAMME'?'/programmes-responsable':role==='TRESORIER'?'/tresorerie':'/connexion']);
  if (route.routeConfig?.path === 'presence' && role === 'EDITEUR') return router.createUrlTree(['/admin']);
  return true;
};
