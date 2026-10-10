import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CsrfGuard } from './csrf.guard';
import { configureSwagger } from './swagger-config';
import { applySecurityHeaders, assertProductionConfiguration, corsOrigin } from './runtime-config';
import { SafeExceptionFilter } from './safe-exception.filter';
import * as express from 'express';

async function bootstrap() {
  loadEnv({ path: '../../.env' });
  assertProductionConfiguration(process.env);
  const app = await NestFactory.create(AppModule,{bodyParser:false});
  app.use(express.json({limit:'64kb'}));
  app.use(express.urlencoded({extended:false,limit:'64kb'}));
  app.enableShutdownHooks();
  if(process.env.NODE_ENV==='production')app.getHttpAdapter().getInstance().set('trust proxy',(address:string)=>address==='172.30.0.2'||address==='::ffff:172.30.0.2');
  app.setGlobalPrefix('api/v1',{exclude:['health','ready']});
  app.enableCors({ origin: corsOrigin(process.env), credentials: true });
  applySecurityHeaders(app, process.env.NODE_ENV === 'production');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalGuards(new CsrfGuard());
  app.useGlobalFilters(new SafeExceptionFilter());
  await configureSwagger(app);
  const port = process.env.PLAYWRIGHT_API_PORT ?? process.env.PORT ?? 3000;
  await app.listen(port);
}
void bootstrap();
