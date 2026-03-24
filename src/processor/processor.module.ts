import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DocumentProcessor } from './processor.processor';
import { DirectusModule } from '../directus/directus.module';
import { OllamaModule } from '../ollama/ollama.module';

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
    OllamaModule,
  ],
  providers: [DocumentProcessor],
})
export class ProcessorModule {}
