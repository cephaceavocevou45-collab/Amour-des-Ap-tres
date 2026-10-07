import { createHmac, timingSafeEqual } from 'node:crypto';
import { UserRole } from '@prisma/client';

export function verifiedToken(token:string):{sub:string;role:UserRole;exp:number;ver:number}|null {
  try {
    const [header,payload,signature]=token.split('.');
    if(!header||!payload||!signature)return null;
    const secret=process.env.JWT_ACCESS_SECRET;
    if(!secret||secret.length<32)return null;
    const actual=createHmac('sha256',secret).update(`${header}.${payload}`).digest();
    const supplied=Buffer.from(signature,'base64url');
    if(actual.length!==supplied.length||!timingSafeEqual(actual,supplied))return null;
    const claims=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    if(typeof claims.sub!=='string'||!claims.sub||typeof claims.exp!=='number'||claims.exp<=Math.floor(Date.now()/1000)||!Object.values(UserRole).includes(claims.role)||!Number.isInteger(claims.ver)||claims.ver<0)return null;
    return claims;
  } catch { return null; }
}
