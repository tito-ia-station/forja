import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { QueueModule } from '../queue/queue.module';
import { OllamaModule } from '../ollama/ollama.module';

@Module({
  imports: [QueueModule, OllamaModule],
  controllers: [StatsController],
})
export class StatsModule {}
