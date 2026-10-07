import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { CsrfGuard } from './csrf.guard';

async function bootstrap() {
  loadEnv({ path: '../../.env' });
  const app = await NestFactory.create(AppModule);
  if(process.env.NODE_ENV==='production')app.getHttpAdapter().getInstance().set('trust proxy',(address:string)=>address==='172.30.0.2'||address==='::ffff:172.30.0.2');
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200', credentials: true });
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://challenges.cloudflare.com'], frameSrc: ["'self'", 'https://challenges.cloudflare.com'], connectSrc: ["'self'", 'https://challenges.cloudflare.com'], imgSrc: ["'self'", 'data:'], objectSrc: ["'none'"] } } }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalGuards(new CsrfGuard());
  if(process.env.NODE_ENV!=='production'){
    const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger');
    const config = new DocumentBuilder().setTitle('Paroisse Amour des Apôtres').setVersion('1.0').addBearerAuth().build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
