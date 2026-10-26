import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_FORMAT_VERSION='v2';
const TOTP_HKDF_SALT=Buffer.from('paroisse-amour-des-apotres/totp/hkdf-salt/v1','utf8');
const TOTP_HKDF_INFO=Buffer.from('paroisse-totp-encryption-v1','utf8');
function derivedEncryptionKey(){const secret=process.env.JWT_ACCESS_SECRET;if(!secret||Buffer.byteLength(secret,'utf8')<32)throw new Error('Configuration 2FA indisponible.');return Buffer.from(hkdfSync('sha256',Buffer.from(secret,'utf8'),TOTP_HKDF_SALT,TOTP_HKDF_INFO,32));}
function encryptWithKey(value:string,key:Buffer){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [TOTP_FORMAT_VERSION,iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.');}
function decryptWithKey(iv:string,tag:string,data:string,key:Buffer){const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');}
function legacyEncryptionKey(){const value=process.env.TOTP_ENCRYPTION_KEY;if(!value||Buffer.byteLength(value,'utf8')<24)throw new Error('Secret 2FA historique illisible ; compte à ré-enrôler.');return createHash('sha256').update(value).digest();}
export function encryptTotpSecret(value:string){return encryptWithKey(value,derivedEncryptionKey());}
export function decryptTotpSecretWithMigration(value:string):{secret:string;reencryptedSecret?:string}{
  try{
    const parts=value.split('.');
    if(parts.length===4&&parts[0]===TOTP_FORMAT_VERSION)return {secret:decryptWithKey(parts[1],parts[2],parts[3],derivedEncryptionKey())};
    if(parts.length!==3)throw new Error();
    const secret=decryptWithKey(parts[0],parts[1],parts[2],legacyEncryptionKey());
    return {secret,reencryptedSecret:encryptTotpSecret(secret)};
  }catch{
    throw new Error('Secret 2FA illisible ; compte à ré-enrôler.');
  }
}
export async function decryptTotpSecretAndMigrate(value:string,persist:(reencryptedSecret:string)=>Promise<unknown>){const result=decryptTotpSecretWithMigration(value);if(result.reencryptedSecret)await persist(result.reencryptedSecret);return result.secret;}
function base32Decode(input:string){let bits='';for(const c of input.replace(/=+$/,'').toUpperCase())bits+=alphabet.indexOf(c).toString(2).padStart(5,'0');const bytes:number[]=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));return Buffer.from(bytes);}
export function verifyTotp(secret:string,code:string){if(!/^[A-Z2-7]{32}$/.test(secret)||!/^[0-9]{6}$/.test(code))return false;const secretBytes=base32Decode(secret),now=Math.floor(Date.now()/30000);for(const step of [now-1,now,now+1]){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const digest=createHmac('sha1',secretBytes).update(counter).digest();const offset=digest[digest.length-1]&15;const number=(digest.readUInt32BE(offset)&0x7fffffff)%1000000;const candidate=Buffer.from(String(number).padStart(6,'0'));if(timingSafeEqual(candidate,Buffer.from(code)))return true;}return false;}
export function createTotpSecret(){let bits='';for(const n of randomBytes(20))bits+=n.toString(2).padStart(8,'0');let secret='';for(let i=0;i<bits.length;i+=5)secret+=alphabet[parseInt(bits.slice(i,i+5).padEnd(5,'0'),2)];return secret;}
export function totpUri(email:string,secret:string){return `otpauth://totp/Amour%20des%20Apotres:${encodeURIComponent(email)}?secret=${secret}&issuer=Amour%20des%20Apotres&algorithm=SHA1&digits=6&period=30`;}
export function generateRecoveryCodes(){return Array.from({length:10},()=>randomBytes(10).toString('hex').toUpperCase().match(/.{1,5}/g)!.join('-'));}
