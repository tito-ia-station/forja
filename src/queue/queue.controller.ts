import { Controller, Post, Delete, Get } from '@nestjs/common';
import { QueueService } from './queue.service';

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post('start')
  start() {
    return this.queueService.startEnqueuer();
  }

  @Delete('stop')
  stop() {
    return this.queueService.stopEnqueuer();
  }

  @Get('stats')
  async stats() {
    return this.queueService.getQueueStats();
  }
}
