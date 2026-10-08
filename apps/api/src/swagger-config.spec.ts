import { SwaggerModule } from '@nestjs/swagger';
import { configureSwagger } from './swagger-config';

describe('production Swagger exposure',()=>{
  it('does not register Swagger routes in production',async()=>{
    const setup=jest.spyOn(SwaggerModule,'setup');
    await configureSwagger({} as any,'production');
    expect(setup).not.toHaveBeenCalled();
  });
});
