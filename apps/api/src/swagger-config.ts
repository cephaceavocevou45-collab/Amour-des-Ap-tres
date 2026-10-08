import { INestApplication } from '@nestjs/common';

export async function configureSwagger(app: INestApplication, environment = process.env.NODE_ENV): Promise<void> {
  if (environment === 'production') return;
  const { SwaggerModule, DocumentBuilder } = await import('@nestjs/swagger');
  const config = new DocumentBuilder().setTitle('Paroisse Amour des Apôtres').setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
}
