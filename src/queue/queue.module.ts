import { Module, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { DirectusModule } from '../directus/directus.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: 'documents' }),
    DirectusModule,
  ],
  providers: [QueueService],
  controllers: [QueueController],
  exports: [QueueService, BullModule],
})
export class QueueModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(QueueModule.name);

  constructor(private readonly queueService: QueueService) {}

  onApplicationBootstrap() {
    if (process.env.WORKER_ROLE === 'enqueuer') {
      this.logger.log('WORKER_ROLE=enqueuer detectado, arrancando enqueuer automáticamente...');
      this.queueService.startEnqueuer();
    } else {
      this.logger.log(`WORKER_ROLE=${process.env.WORKER_ROLE || 'worker'} — modo worker activo`);
    }
  }
}
