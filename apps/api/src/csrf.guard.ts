import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request=context.switchToHttp().getRequest();
    if(['GET','HEAD','OPTIONS'].includes(request.method))return true;
    const cookies=String(request.headers.cookie??'').split(';').map((part:string)=>part.trim());
    const access=cookies.find((part:string)=>part.startsWith('paroisse_access='));
    if(!access)return true;
    const cookie=cookies.find((part:string)=>part.startsWith('paroisse_csrf='))?.slice('paroisse_csrf='.length);
    const header=request.headers['x-csrf-token'];
    if(typeof cookie!=='string'||typeof header!=='string')throw new ForbiddenException('Jeton CSRF requis.');
    let decoded:string;
    try{decoded=decodeURIComponent(cookie);}catch{throw new ForbiddenException('Jeton CSRF invalide.');}
    const a=Buffer.from(decoded),b=Buffer.from(header);
    if(a.length!==b.length||!timingSafeEqual(a,b))throw new ForbiddenException('Jeton CSRF invalide.');
    return true;
  }
}
