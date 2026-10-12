import { ExecutionContext } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { JwtAuthGuard } from './auth.guard';
import { CsrfGuard } from './csrf.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { PrismaService } from './prisma.service';

function token(role='ADMIN',fam?:string){
  const b64=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const header=b64({alg:'HS256',typ:'JWT'}),payload=b64({sub:'user-1',role,ver:0,...(fam?{fam}:{}),exp:Math.floor(Date.now()/1000)+300,iat:Math.floor(Date.now()/1000)}),unsigned=`${header}.${payload}`;
  return `${unsigned}.${createHmac('sha256',process.env.JWT_ACCESS_SECRET!).update(unsigned).digest('base64url')}`;
}
function context(request:any){return {switchToHttp:()=>({getRequest:()=>request})} as ExecutionContext;}

describe('security guards',()=>{
  const originalSecret=process.env.JWT_ACCESS_SECRET;
  beforeEach(()=>{process.env.JWT_ACCESS_SECRET=randomBytes(32).toString('base64url');});
  afterAll(()=>{if(originalSecret===undefined)delete process.env.JWT_ACCESS_SECRET;else process.env.JWT_ACCESS_SECRET=originalSecret;});

  it('uses the current database role instead of a stale role embedded in a token',async()=>{
    const request:any={headers:{authorization:`Bearer ${token('ADMIN')}`}};
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'user-1',role:'SECRETAIRE_PRESENCE',active:true,sessionVersion:0})}} as unknown as PrismaService;
    await expect(new JwtAuthGuard(prisma).canActivate(context(request))).resolves.toBe(true);
    expect((request as any).user.role).toBe('SECRETAIRE_PRESENCE');
  });

  it('invalidates sessions immediately when the account is inactive',async()=>{
    const request={headers:{authorization:`Bearer ${token()}`}};
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'user-1',role:'ADMIN',active:false,sessionVersion:0})}} as unknown as PrismaService;
    await expect(new JwtAuthGuard(prisma).canActivate(context(request))).rejects.toMatchObject({status:401});
  });

  it('expires an idle signed-in session after the configured inactivity interval',async()=>{
    const family='session-family-12345678',request:any={headers:{authorization:`Bearer ${token('ADMIN',family)}`}};
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'user-1',role:'ADMIN',active:true,sessionVersion:0})},refreshToken:{findFirst:jest.fn().mockResolvedValueOnce({lastSeenAt:new Date(Date.now()-31*60_000)}).mockResolvedValueOnce({createdAt:new Date(Date.now()-60_000)}),updateMany:jest.fn().mockResolvedValue({count:1})}} as unknown as PrismaService;
    await expect(new JwtAuthGuard(prisma).canActivate(context(request))).rejects.toMatchObject({status:401});
    expect((prisma as any).refreshToken.updateMany).toHaveBeenCalledWith({where:{family,revokedAt:null},data:{revokedAt:expect.any(Date)}});
  });

  it('rejects family-less bearer tokens in production',async()=>{
    const previous=process.env.NODE_ENV;process.env.NODE_ENV='production';
    try{const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'user-1',role:'ADMIN',active:true,sessionVersion:0})}} as unknown as PrismaService;await expect(new JwtAuthGuard(prisma).canActivate(context({headers:{authorization:`Bearer ${token()}`}}))).rejects.toMatchObject({status:401});}
    finally{if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;}
  });

  it('requires a matching CSRF header for cookie-authenticated mutations',()=>{
    const guard=new CsrfGuard();
    expect(()=>guard.canActivate(context({method:'POST',headers:{cookie:'paroisse_access=jwt; paroisse_csrf=abc','x-csrf-token':'wrong'}}))).toThrow();
    expect(guard.canActivate(context({method:'POST',headers:{cookie:'paroisse_access=jwt; paroisse_csrf=abc','x-csrf-token':'abc'}}))).toBe(true);
    expect(()=>guard.canActivate(context({method:'POST',headers:{cookie:'paroisse_refresh=jwt'}}))).toThrow();
    expect(()=>guard.canActivate(context({method:'DELETE',headers:{cookie:'paroisse_refresh=jwt; paroisse_csrf=abc'}}))).toThrow();
    expect(guard.canActivate(context({method:'POST',headers:{cookie:'paroisse_refresh=jwt; paroisse_csrf=abc','x-csrf-token':'abc'}}))).toBe(true);
  });
  it('rejects cross-site or origin-less browser writes in production, including login',()=>{
    const previousNodeEnv=process.env.NODE_ENV,previousOrigin=process.env.APP_PUBLIC_URL;
    process.env.NODE_ENV='production';process.env.APP_PUBLIC_URL='https://paroisse.example';
    try{
      const guard=new CsrfGuard();
      expect(()=>guard.canActivate(context({method:'POST',path:'/api/v1/auth/login',headers:{origin:'https://evil.example'}}))).toThrow();
      expect(()=>guard.canActivate(context({method:'POST',path:'/api/v1/auth/login',headers:{}}))).toThrow();
      expect(guard.canActivate(context({method:'POST',path:'/api/v1/auth/login',headers:{origin:'https://paroisse.example'}}))).toBe(true);
      expect(()=>guard.canActivate(context({method:'POST',headers:{origin:'https://evil.example',cookie:'paroisse_access=jwt; paroisse_csrf=abc','x-csrf-token':'abc'}}))).toThrow();
    }finally{
      if(previousNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNodeEnv;
      if(previousOrigin===undefined)delete process.env.APP_PUBLIC_URL;else process.env.APP_PUBLIC_URL=previousOrigin;
    }
  });
  it('applies CSRF validation to every unsafe HTTP method and permits safe reads',()=>{
    const guard=new CsrfGuard();
    for(const method of ['POST','PUT','PATCH','DELETE']){
      expect(()=>guard.canActivate(context({method,headers:{cookie:'paroisse_access=jwt'}}))).toThrow();
      expect(guard.canActivate(context({method,headers:{cookie:'paroisse_access=jwt; paroisse_csrf=valid','x-csrf-token':'valid'}}))).toBe(true);
    }
    for(const method of ['GET','HEAD','OPTIONS'])expect(guard.canActivate(context({method,headers:{cookie:'paroisse_access=jwt'}}))).toBe(true);
  });

  it('limits repeated login attempts by client address and route',()=>{
    const guard=new RateLimitGuard();
    for(let i=0;i<10;i++)expect(guard.canActivate(context({path:'/api/v1/auth/login',ip:'192.0.2.1',body:{email:'one@example.com'}}))).toBe(true);
    expect(()=>guard.canActivate(context({path:'/api/v1/auth/login',ip:'192.0.2.1',body:{email:'one@example.com'}}))).toThrow();
  });

  it('limits attendance account applications independently by IP and address',()=>{
    const byIp=new RateLimitGuard();
    for(let i=0;i<3;i++)expect(byIp.canActivate(context({path:'/api/v1/auth/register',method:'POST',ip:'198.51.100.10',body:{email:`applicant-${i}@example.invalid`}}))).toBe(true);
    expect(()=>byIp.canActivate(context({path:'/api/v1/auth/register',method:'POST',ip:'198.51.100.10',body:{email:'another@example.invalid'}}))).toThrow();
    const byEmail=new RateLimitGuard();
    for(let i=0;i<3;i++)expect(byEmail.canActivate(context({path:'/api/v1/auth/register',method:'POST',ip:`198.51.100.${i+20}`,body:{email:'same@example.invalid'}}))).toBe(true);
    expect(()=>byEmail.canActivate(context({path:'/api/v1/auth/register',method:'POST',ip:'198.51.100.30',body:{email:'same@example.invalid'}}))).toThrow();
  });
});
