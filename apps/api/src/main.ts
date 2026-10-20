import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CsrfGuard } from './csrf.guard';
import { applySecurityHeaders, assertProductionConfiguration, corsOrigin, trustedProxyDepth } from './runtime-config';
import { SafeExceptionFilter } from './safe-exception.filter';
import { isTrustedProxyAddress, noStoreResponses } from './http-security';
import * as express from 'express';

async function bootstrap() {
  loadEnv({ path: '../../.env' });
  assertProductionConfiguration(process.env);
  const app = await NestFactory.create(AppModule,{bodyParser:false});
  app.use(noStoreResponses);
  app.use(express.json({limit:'64kb'}));
  app.use(express.urlencoded({extended:false,limit:'64kb'}));
  app.enableShutdownHooks();
  if(process.env.NODE_ENV==='production')app.getHttpAdapter().getInstance().set('trust proxy',trustedProxyDepth(process.env)!);
  else app.getHttpAdapter().getInstance().set('trust proxy',isTrustedProxyAddress);
  app.setGlobalPrefix('api/v1',{exclude:['health','ready']});
  app.enableCors({ origin: corsOrigin(process.env), credentials: true });
  applySecurityHeaders(app, process.env.NODE_ENV === 'production');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalGuards(new CsrfGuard());
  app.useGlobalFilters(new SafeExceptionFilter());
  const port = process.env.PORT ?? (process.env.NODE_ENV === 'production' ? undefined : process.env.PLAYWRIGHT_API_PORT) ?? 3000;
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
}
void bootstrap();
