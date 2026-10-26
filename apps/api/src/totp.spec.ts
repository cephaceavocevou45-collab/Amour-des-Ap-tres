import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { decryptTotpSecretAndMigrate, decryptTotpSecretWithMigration, encryptTotpSecret } from './totp';

const legacyKey='legacy-2fa-key-that-is-only-used-to-read-old-values';
const secret='JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

function encryptLegacy(value:string,key=legacyKey){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',createHash('sha256').update(key).digest(),iv),data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.');
}

describe('TOTP secret encryption',()=>{
  const originalJwt=process.env.JWT_ACCESS_SECRET;
  const originalLegacy=process.env.TOTP_ENCRYPTION_KEY;
  beforeEach(()=>{process.env.JWT_ACCESS_SECRET=randomBytes(48).toString('base64url');delete process.env.TOTP_ENCRYPTION_KEY;});
  afterAll(()=>{if(originalJwt===undefined)delete process.env.JWT_ACCESS_SECRET;else process.env.JWT_ACCESS_SECRET=originalJwt;if(originalLegacy===undefined)delete process.env.TOTP_ENCRYPTION_KEY;else process.env.TOTP_ENCRYPTION_KEY=originalLegacy;});

  it('encrypts with versioned AES-256-GCM, random IVs and no legacy-key requirement',()=>{
    const first=encryptTotpSecret(secret),second=encryptTotpSecret(secret);
    expect(first.split('.')).toHaveLength(4);expect(first.startsWith('v2.')).toBe(true);expect(first).not.toBe(second);
    expect(decryptTotpSecretWithMigration(first)).toEqual({secret});
  });

  it('re-encrypts a legacy secret on its first successful read and can then discard the legacy key',async()=>{
    const legacy=encryptLegacy(secret);process.env.TOTP_ENCRYPTION_KEY=legacyKey;
    const persist=jest.fn(async(_value:string)=>undefined);
    expect(await decryptTotpSecretAndMigrate(legacy,persist)).toBe(secret);
    expect(persist).toHaveBeenCalledTimes(1);
    const upgraded=persist.mock.calls[0][0];expect(upgraded).toMatch(/^v2\./);expect(upgraded).not.toContain(secret);
    delete process.env.TOTP_ENCRYPTION_KEY;
    expect(decryptTotpSecretWithMigration(upgraded)).toEqual({secret});
  });

  it('fails safely for an old value when its legacy key is absent and exposes no key or secret',()=>{
    const legacy=encryptLegacy(secret);
    expect(()=>decryptTotpSecretWithMigration(legacy)).toThrow('Secret 2FA illisible ; compte à ré-enrôler.');
    try{decryptTotpSecretWithMigration(legacy);}catch(error){expect((error as Error).message).not.toContain(secret);expect((error as Error).message).not.toContain(legacyKey);}
    expect(encryptTotpSecret(secret)).toMatch(/^v2\./);
  });

  it('fails with a sanitized error when the derived-key source is unavailable',()=>{
    delete process.env.JWT_ACCESS_SECRET;
    expect(()=>encryptTotpSecret(secret)).toThrow('Configuration 2FA indisponible.');
  });
});
