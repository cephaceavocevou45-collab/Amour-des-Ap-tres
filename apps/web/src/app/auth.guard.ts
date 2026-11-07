import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

function permissionsForSession(): string[] {
  try {
    const permissions: unknown = JSON.parse(sessionStorage.getItem('paroisse_permissions') ?? '[]');
    return Array.isArray(permissions) ? permissions.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function homeForRole(role: string, permissions: string[]): string {
  if (['ADMIN', 'SUPER_ADMIN', 'EDITEUR'].includes(role)) return '/admin';
  if (role === 'FIDELE') return '/fideles';
  if (role === 'SECRETAIRE_PROGRAMME') return '/programmes-responsable';
  if (role === 'TRESORIER' || permissions.includes('TRESORERIE')) return '/tresorerie';
  if (['SECRETAIRE_PRESENCE', 'RESPONSABLE_SEMAINE'].includes(role) || permissions.includes('PROGRAMME_BIBLIQUE')) return '/presence';
  if (permissions.includes('PROGRAMMES_PAROISSIAUX')) return '/programmes-responsable';
  if (permissions.includes('PUBLICATION_ACTUALITES')) return '/admin/informations';
  if (permissions.includes('ANNUAIRE_FIDELES')) return '/annuaire-fideles';
  return '/connexion';
}

export const authenticatedHomeGuard: CanActivateFn = () => {
  const role = sessionStorage.getItem('paroisse_role');
  if (!role) return true;
  return inject(Router).parseUrl(homeForRole(role, permissionsForSession()));
};

export const authGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const role = sessionStorage.getItem('paroisse_role');
  const permissions = permissionsForSession();
  const home = homeForRole(role ?? '', permissions);
  if (!role) return router.createUrlTree([route.data['faithful'] ? '/connexion-fidele' : route.data['admin'] || route.data['announcements'] ? '/admin/connexion' : '/connexion']);

  if (route.data['faithful'] && role !== 'FIDELE') return router.parseUrl(home);
  if (route.data['directory'] && !(['ADMIN', 'SUPER_ADMIN', 'SECRETAIRE_PROGRAMME'].includes(role) || permissions.includes('ANNUAIRE_FIDELES'))) return router.parseUrl(home);
  if (route.data['faithfulRegister'] && !(['ADMIN', 'SUPER_ADMIN', 'SECRETAIRE_PRESENCE'].includes(role) || permissions.includes('PROGRAMME_BIBLIQUE'))) return router.parseUrl(home);
  if (route.data['program'] && !(['ADMIN', 'SUPER_ADMIN', 'SECRETAIRE_PRESENCE', 'SECRETAIRE_PROGRAMME'].includes(role) || permissions.includes('PROGRAMME_BIBLIQUE'))) return router.parseUrl(home);
  if (route.data['admin'] && !['ADMIN', 'SUPER_ADMIN', 'EDITEUR'].includes(role)) return router.parseUrl(home);
  if (route.data['announcements'] && !(['ADMIN', 'SUPER_ADMIN'].includes(role) || permissions.includes('PUBLICATION_ACTUALITES'))) return router.parseUrl(home);
  if (route.data['parishPrograms'] && !(['SECRETAIRE_PROGRAMME', 'ADMIN', 'SUPER_ADMIN'].includes(role) || permissions.includes('PROGRAMMES_PAROISSIAUX'))) return router.parseUrl(home);
  if (route.data['treasury'] && !(['TRESORIER', 'ADMIN', 'SUPER_ADMIN'].includes(role) || permissions.includes('TRESORERIE'))) return router.parseUrl(home);
  if (route.routeConfig?.path === 'presence' && !(['ADMIN', 'SUPER_ADMIN', 'SECRETAIRE_PRESENCE', 'RESPONSABLE_SEMAINE', 'SECRETAIRE_PROGRAMME'].includes(role) || permissions.includes('PROGRAMME_BIBLIQUE'))) return router.parseUrl(home);
  if (!route.data['admin'] && !route.data['program'] && !route.data['faithful'] && !route.data['directory'] && !route.data['faithfulRegister'] && !route.data['parishPrograms'] && !route.data['treasury'] && !route.data['accountSettings'] && !['ADMIN', 'SUPER_ADMIN', 'SECRETAIRE_PRESENCE', 'RESPONSABLE_SEMAINE'].includes(role) && !permissions.includes('PROGRAMME_BIBLIQUE')) return router.parseUrl(home);
  return true;
};
