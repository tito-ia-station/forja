import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DirectusModule } from './directus/directus.module';
import { OllamaModule } from './ollama/ollama.module';
import { QueueModule } from './queue/queue.module';
import { ProcessorModule } from './processor/processor.module';
import { ArticlesModule } from './articles/articles.module';
import { StatsModule } from './stats/stats.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),
    DirectusModule,
    OllamaModule,
    QueueModule,
    ProcessorModule,
    ArticlesModule,
    StatsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
