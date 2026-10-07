const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

test('AES-256-GCM backup roundtrip detects modification and leaves no plaintext',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'paroisse-backup-test-'));
  const source=path.join(dir,'source.dump'),encrypted=path.join(dir,'backup.enc'),restored=path.join(dir,'restored.dump'),tampered=path.join(dir,'tampered.enc'),rejected=path.join(dir,'rejected.dump');
  const secret=crypto.randomBytes(32).toString('hex'),payload=crypto.randomBytes(2048);
  const run=(op,input,output)=>spawnSync(process.execPath,[path.join(__dirname,'backup-crypto.cjs'),op,input,output],{env:{...process.env,BACKUP_KEY_HEX:secret},encoding:'utf8'});
  try{
    await fs.writeFile(source,payload);
    assert.equal(run('encrypt',source,encrypted).status,0);
    assert.notDeepEqual(await fs.readFile(encrypted),payload);
    assert.equal(run('decrypt',encrypted,restored).status,0);
    assert.deepEqual(await fs.readFile(restored),payload);
    const bytes=await fs.readFile(encrypted);bytes[Math.floor(bytes.length/2)]^=0xff;await fs.writeFile(tampered,bytes);
    assert.notEqual(run('decrypt',tampered,rejected).status,0);
    await assert.rejects(fs.access(rejected));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
