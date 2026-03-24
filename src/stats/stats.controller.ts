import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueService } from '../queue/queue.service';
import { OllamaService } from '../ollama/ollama.service';

@Controller('stats')
export class StatsController {
  constructor(
    private readonly queueService: QueueService,
    private readonly ollamaService: OllamaService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  async getStats() {
    const queueStats = await this.queueService.getQueueStats();
    const dlqCount = await this.queueService.getDlqCount();

    const totalProcessed = queueStats.completed + queueStats.failed;
    const processingRate = totalProcessed > 0 ? `${Math.round(totalProcessed)} docs/hour` : 'N/A';
    const etaMinutes = queueStats.waiting > 0 && totalProcessed > 0
      ? Math.round((queueStats.waiting / totalProcessed) * 60)
      : 0;

    return {
      queue: queueStats,
      dlq: { count: dlqCount },
      processing_rate: processingRate,
      eta_minutes: etaMinutes,
      worker_role: this.configService.get<string>('worker.role'),
      ollama_status: this.ollamaService.isCircuitOpen ? 'circuit_open' : 'ok',
    };
  }
}
