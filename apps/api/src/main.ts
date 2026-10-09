import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { CsrfGuard } from './csrf.guard';
import { configureSwagger } from './swagger-config';

async function bootstrap() {
  loadEnv({ path: '../../.env' });
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  if(process.env.NODE_ENV==='production')app.getHttpAdapter().getInstance().set('trust proxy',(address:string)=>address==='172.30.0.2'||address==='::ffff:172.30.0.2');
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200', credentials: true });
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://challenges.cloudflare.com'], frameSrc: ["'self'", 'https://challenges.cloudflare.com'], connectSrc: ["'self'", 'https://challenges.cloudflare.com'], imgSrc: ["'self'", 'data:', 'blob:'], mediaSrc: ["'self'", 'blob:'], objectSrc: ["'none'"] } } }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalGuards(new CsrfGuard());
  await configureSwagger(app);
  const port = process.env.PLAYWRIGHT_API_PORT ?? process.env.PORT ?? 3000;
  await app.listen(port);
}
void bootstrap();
