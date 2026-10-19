import * as express from 'express';
import { AddressInfo } from 'node:net';
import { isTrustedProxyAddress, noStoreResponses } from './http-security';
import { RateLimitGuard } from './rate-limit.guard';

describe('trusted proxy and response caching',()=>{
  it('trusts only the exact private Nginx peer address',()=>{
    expect(isTrustedProxyAddress('172.31.0.2')).toBe(true);
    expect(isTrustedProxyAddress('::ffff:172.31.0.2')).toBe(true);
    for(const address of ['172.31.0.3','172.32.0.3','127.0.0.1','::1','198.51.100.20'])expect(isTrustedProxyAddress(address)).toBe(false);
  });

  it('does not let a direct client spoof X-Forwarded-For or CF-Connecting-IP to impersonate an IP or bypass the limiter',async()=>{
    const server=express();
    server.set('trust proxy',isTrustedProxyAddress);
    server.use(express.json());
    server.use(noStoreResponses);
    const limiter=new RateLimitGuard();
    server.post('/api/v1/auth/login',(request,response)=>{
      try{
        limiter.canActivate({switchToHttp:()=>({getRequest:()=>request})} as any);
        response.json({ip:request.ip});
      }catch(error:any){response.status(error.getStatus?.()??500).json({ip:request.ip});}
    });
    const listener=server.listen(0,'127.0.0.1');
    try{
      await new Promise<void>(resolve=>listener.once('listening',resolve));
      const address=listener.address() as AddressInfo;
      let final:Response|undefined;
      for(let attempt=0;attempt<11;attempt++){
        final=await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/login`,{method:'POST',headers:{'Connection':'close','Content-Type':'application/json','X-Forwarded-For':`203.0.113.${attempt+1}`,'X-Real-IP':`203.0.113.${attempt+1}`,'CF-Connecting-IP':`203.0.113.${attempt+1}`},body:JSON.stringify({email:`spoof-${attempt}@example.invalid`})});
        expect((await final.json()).ip).toBe('127.0.0.1');
        expect(final.status).toBe(attempt<10?200:429);
      }
      expect(final?.headers.get('cache-control')).toBe('no-store');
      expect(final?.headers.get('pragma')).toBe('no-cache');
    }finally{await new Promise<void>((resolve,reject)=>{listener.close(error=>error&&(error as NodeJS.ErrnoException).code!=='ERR_SERVER_NOT_RUNNING'?reject(error):resolve());listener.closeAllConnections();});}
  });
});
