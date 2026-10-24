import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

export const authGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const role = sessionStorage.getItem('paroisse_role');
  if (!role) return router.createUrlTree([route.data['faithful'] ? '/connexion-fidele' : route.data['admin']||route.data['announcements'] ? '/admin/connexion' : '/connexion']);
  let permissions: string[] = [];
  try { permissions = JSON.parse(sessionStorage.getItem('paroisse_permissions') ?? '[]'); } catch { /* Session locale invalide. */ }
  if (route.data['faithful'] && role !== 'FIDELE') return router.createUrlTree(['ADMIN','SUPER_ADMIN','EDITEUR'].includes(role) ? ['/admin'] : ['SECRETAIRE_PRESENCE','RESPONSABLE_SEMAINE'].includes(role) ? ['/presence'] : ['/connexion-fidele']);
  if (route.data['program'] && !['ADMIN', 'SUPER_ADMIN', 'EDITEUR', 'SECRETAIRE_PRESENCE'].includes(role)) return router.createUrlTree(['/connexion']);
  if (route.data['program'] && role === 'EDITEUR' && !permissions.includes('PROGRAMME_BIBLIQUE')) return router.createUrlTree(['/admin']);
  if (route.data['admin'] && !['ADMIN', 'SUPER_ADMIN', 'EDITEUR'].includes(role)) return router.createUrlTree(['/connexion']);
  if (route.data['announcements'] && !['ADMIN', 'SUPER_ADMIN'].includes(role)) return router.createUrlTree(['/admin']);
  if (!route.data['admin'] && !route.data['program'] && !route.data['faithful'] && !['ADMIN', 'SUPER_ADMIN', 'SECRETAIRE_PRESENCE', 'RESPONSABLE_SEMAINE'].includes(role)) return router.createUrlTree([role==='FIDELE'?'/fideles':'/connexion']);
  if (route.routeConfig?.path === 'presence' && role === 'EDITEUR') return router.createUrlTree(['/admin']);
  return true;
};
