import { EmailQuotaService } from './email-quota.service';

describe('EmailQuotaService',()=>{
  const envKeys=['RESEND_API_KEY','MAIL_FROM','RESEND_DAILY_LIMIT','RESEND_ALERT_AT'] as const;
  let previous:Record<string,string|undefined>;
  beforeEach(()=>{
    previous=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
    Object.assign(process.env,{RESEND_API_KEY:'test-key',MAIL_FROM:'Test <test@example.invalid>',RESEND_DAILY_LIMIT:'100',RESEND_ALERT_AT:'80'});
  });
  afterEach(()=>{for(const key of envKeys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}jest.restoreAllMocks();});

  it('does not send once the atomic daily quota is exhausted',async()=>{
    const query=jest.fn().mockResolvedValue([]),fetchSpy=jest.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}',{status:200}));
    const service=new EmailQuotaService({$queryRaw:query} as any);
    await expect(service.sendImmediate('member@example.invalid','Test','body')).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('raises a privacy-safe warning once at the configured daily threshold',async()=>{
    const updateMany=jest.fn().mockResolvedValue({count:1});
    const prisma={$queryRaw:jest.fn().mockResolvedValue([{sentCount:80,alertSent:false}]),emailDailyUsage:{updateMany}};
    const service=new EmailQuotaService(prisma as any);
    const warning=jest.spyOn((service as any).logger,'warn').mockImplementation();
    jest.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}',{status:200}));
    await expect(service.sendImmediate('member@example.invalid','Test','body')).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{day:expect.any(Date),alertSent:false}}));
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('plafond quotidien'));
  });
});
