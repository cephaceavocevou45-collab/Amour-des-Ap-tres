import { ExecutionContext } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { JwtAuthGuard } from './auth.guard';
import { CsrfGuard } from './csrf.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { PrismaService } from './prisma.service';

function token(role='ADMIN'){
  const b64=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const header=b64({alg:'HS256',typ:'JWT'}),payload=b64({sub:'user-1',role,ver:0,exp:Math.floor(Date.now()/1000)+300,iat:Math.floor(Date.now()/1000)}),unsigned=`${header}.${payload}`;
  return `${unsigned}.${createHmac('sha256',process.env.JWT_ACCESS_SECRET!).update(unsigned).digest('base64url')}`;
}
function context(request:any){return {switchToHttp:()=>({getRequest:()=>request})} as ExecutionContext;}

describe('security guards',()=>{
  const originalSecret=process.env.JWT_ACCESS_SECRET;
  beforeEach(()=>{process.env.JWT_ACCESS_SECRET='test-key-that-is-long-enough-for-hmac-signing';});
  afterAll(()=>{if(originalSecret===undefined)delete process.env.JWT_ACCESS_SECRET;else process.env.JWT_ACCESS_SECRET=originalSecret;});

  it('uses the current database role instead of a stale role embedded in a token',async()=>{
    const request:any={headers:{authorization:`Bearer ${token('ADMIN')}`}};
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'user-1',role:'PENDING',active:true,sessionVersion:0})}} as unknown as PrismaService;
    await expect(new JwtAuthGuard(prisma).canActivate(context(request))).resolves.toBe(true);
    expect((request as any).user.role).toBe('PENDING');
  });

  it('invalidates sessions immediately when the account is inactive',async()=>{
    const request={headers:{authorization:`Bearer ${token()}`}};
    const prisma={user:{findUnique:jest.fn().mockResolvedValue({id:'user-1',role:'ADMIN',active:false,sessionVersion:0})}} as unknown as PrismaService;
    await expect(new JwtAuthGuard(prisma).canActivate(context(request))).rejects.toMatchObject({status:401});
  });

  it('requires a matching CSRF header for cookie-authenticated mutations',()=>{
    const guard=new CsrfGuard();
    expect(()=>guard.canActivate(context({method:'POST',headers:{cookie:'paroisse_access=jwt; paroisse_csrf=abc','x-csrf-token':'wrong'}}))).toThrow();
    expect(guard.canActivate(context({method:'POST',headers:{cookie:'paroisse_access=jwt; paroisse_csrf=abc','x-csrf-token':'abc'}}))).toBe(true);
  });

  it('limits repeated login attempts by client address and route',()=>{
    const guard=new RateLimitGuard();
    for(let i=0;i<10;i++)expect(guard.canActivate(context({path:'/api/v1/auth/login',ip:'192.0.2.1',body:{email:'one@example.com'}}))).toBe(true);
    expect(()=>guard.canActivate(context({path:'/api/v1/auth/login',ip:'192.0.2.1',body:{email:'one@example.com'}}))).toThrow();
  });
});
