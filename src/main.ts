import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 3001;
  const workerRole = process.env.WORKER_ROLE || 'worker';
  await app.listen(port);
  Logger.log(`Forja running on port ${port} | WORKER_ROLE=${workerRole}`, 'Bootstrap');
}
bootstrap();
