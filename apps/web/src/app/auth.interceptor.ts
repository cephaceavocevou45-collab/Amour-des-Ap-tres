import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';

export const authInterceptor:HttpInterceptorFn=(request,next)=>{
  const http=inject(HttpClient);
  let headers=request.headers;
  if(!['GET','HEAD','OPTIONS'].includes(request.method)){
    const match=typeof document==='undefined'?null:document.cookie.split(';').map(part=>part.trim()).find(part=>part.startsWith('paroisse_csrf='));
    if(match){try{headers=headers.set('X-CSRF-Token',decodeURIComponent(match.slice('paroisse_csrf='.length)));}catch{headers=headers.delete('X-CSRF-Token');}}
  }
  const prepared=request.clone({withCredentials:true,headers});
  return next(prepared).pipe(catchError((error:HttpErrorResponse)=>{
    const isAuthEndpoint=request.url.includes('/auth/');
    if(error.status!==401||isAuthEndpoint||!sessionStorage.getItem('paroisse_role'))return throwError(()=>error);
    return http.post('/api/v1/auth/refresh',{}).pipe(switchMap(()=>next(prepared)),catchError(()=>throwError(()=>error)));
  }));
};
