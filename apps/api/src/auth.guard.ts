import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifiedToken } from './auth-token';
import { PrismaService } from './prisma.service';
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly prisma:PrismaService){}
  async canActivate(context:ExecutionContext){const request=context.switchToHttp().getRequest();const value=request.headers.authorization as string|undefined;const cookie=(request.headers.cookie as string|undefined)?.split(';').map((part:string)=>part.trim()).find((part:string)=>part.startsWith('paroisse_access='))?.slice('paroisse_access='.length);const token=value?.startsWith('Bearer ')?value.slice(7):cookie??'';const claims=verifiedToken(token);if(!claims)throw new UnauthorizedException('Connexion requise.');const user=await (this.prisma as any).user.findUnique({where:{id:claims.sub},select:{id:true,role:true,active:true,sessionVersion:true,permissions:true,emailVerifiedAt:true,suspendedAt:true,suspendedUntil:true}});const now=new Date();const suspended=!!user?.suspendedAt&&(!user.suspendedUntil||user.suspendedUntil>now);if(!user||!user.active||user.sessionVersion!==claims.ver||suspended||(user.role==='FIDELE'&&!user.emailVerifiedAt))throw new UnauthorizedException('Connexion requise.');request.user={...claims,role:user.role,permissions:user.permissions??[]};return true;}
}
