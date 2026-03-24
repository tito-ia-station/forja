import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { DirectusService } from '../directus/directus.service';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);

  private enqueuerRunning = false;
  private enqueuerOffset = 0;
  private lastRefillAt: Date | null = null;
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(
    @InjectQueue('documents') private readonly documentQueue: Queue,
    private readonly directusService: DirectusService,
    private readonly configService: ConfigService,
  ) {}

  onModuleDestroy() {
    this.stopEnqueuer();
  }

  // ── Smart enqueuer ───────────────────────────────────────────────────────────

  startEnqueuer(): { message: string } {
    if (this.enqueuerRunning) {
      return { message: 'Enqueuer already running' };
    }

    const intervalMs = this.configService.get<number>('queue.checkIntervalMs') ?? 10000;

    this.enqueuerRunning = true;
    this.logger.log(`Enqueuer started (interval=${intervalMs}ms)`);

    void this.refillIfNeeded();
    this.intervalHandle = setInterval(() => void this.refillIfNeeded(), intervalMs);

    return { message: 'Enqueuer started' };
  }

  stopEnqueuer(): { message: string } {
    if (!this.enqueuerRunning) {
      return { message: 'Enqueuer not running' };
    }

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.enqueuerRunning = false;
    this.logger.log('Enqueuer stopped');

    return { message: 'Enqueuer stopped' };
  }

  getEnqueuerStatus(): { running: boolean; offset: number; lastRefillAt: Date | null } {
    return {
      running: this.enqueuerRunning,
      offset: this.enqueuerOffset,
      lastRefillAt: this.lastRefillAt,
    };
  }

  private async refillIfNeeded(): Promise<void> {
    const maxSize = this.configService.get<number>('queue.maxSize') ?? 500;
    const refillSize = this.configService.get<number>('queue.refillSize') ?? 100;
    const minScore = this.configService.get<number>('worker.minEduScore');
    const batchSize = this.configService.get<number>('worker.batchSize') ?? 50;

    const [waiting, active] = await Promise.all([
      this.documentQueue.getWaitingCount(),
      this.documentQueue.getActiveCount(),
    ]);
    const current = waiting + active;

    if (current >= maxSize) {
      this.logger.log(`Queue full (${current}/${maxSize}), skipping refill`);
      return;
    }

    const canAdd = Math.min(refillSize, maxSize - current);
    let enqueued = 0;
    let localOffset = this.enqueuerOffset;

    while (enqueued < canAdd) {
      const fetchSize = Math.min(batchSize, canAdd - enqueued);
      const docs = await this.directusService.getDocuments(localOffset, fetchSize, minScore);

      if (docs.length === 0) {
        this.logger.log('All docs enqueued, stopping refill loop');
        this.stopEnqueuer();
        return;
      }

      for (const doc of docs) {
        const existing = await this.directusService.getArticleByDocumentId(doc.id);
        if (existing && existing.status === 'done') {
          localOffset++;
          continue;
        }

        await this.documentQueue.add(
          'process-document',
          { documentId: doc.id, url: doc.url, eduScore: doc.edu_score },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: false,
            removeOnFail: false,
          },
        );
        enqueued++;
        localOffset++;
      }

      if (docs.length < fetchSize) {
        break;
      }
    }

    this.enqueuerOffset = localOffset;
    this.lastRefillAt = new Date();

    const newCurrent = current + enqueued;
    this.logger.log(`Enqueued ${enqueued} docs (queue size: ${newCurrent}/${maxSize})`);
  }

  // ── Stats / utility ──────────────────────────────────────────────────────────

  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    enqueuer: { running: boolean; offset: number; lastRefillAt: Date | null };
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.documentQueue.getWaitingCount(),
      this.documentQueue.getActiveCount(),
      this.documentQueue.getCompletedCount(),
      this.documentQueue.getFailedCount(),
    ]);
    return {
      waiting,
      active,
      completed,
      failed,
      enqueuer: this.getEnqueuerStatus(),
    };
  }

  async getDlqCount(): Promise<number> {
    return this.documentQueue.getFailedCount();
  }

  async clearQueue(): Promise<void> {
    await this.documentQueue.empty();
    this.logger.log('Queue cleared');
  }
}
