import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health';

describe('HealthService',()=>{
  it('returns a minimal liveness response',()=>{
    const service=new HealthService({} as any);
    expect(service.liveness()).toEqual({status:'ok'});
  });

  it('reports readiness without database details',async()=>{
    const service=new HealthService({$queryRaw:jest.fn().mockResolvedValue([{ '?column?':1 }])} as any);
    await expect(service.readiness()).resolves.toEqual({status:'ready',database:'available'});
  });

  it('fails readiness without exposing the database exception',async()=>{
    const service=new HealthService({$queryRaw:jest.fn().mockRejectedValue(new Error('private connection string'))} as any);
    await expect(service.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.readiness()).rejects.not.toThrow('private connection string');
  });
});
