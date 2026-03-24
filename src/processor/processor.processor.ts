import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { DirectusService } from '../directus/directus.service';
import { OllamaService, OllamaCircuitOpenError } from '../ollama/ollama.service';

@Processor('documents')
export class DocumentProcessor {
  private readonly logger = new Logger(DocumentProcessor.name);

  constructor(
    private readonly directusService: DirectusService,
    private readonly ollamaService: OllamaService,
    private readonly configService: ConfigService,
  ) {}

  private notify(message: string): void {
    const enabled = this.configService.get<boolean>('alerts.openclawNotify');
    if (!enabled) return;
    exec(`openclaw system event --text "${message}" --mode now`, (err) => {
      if (err) this.logger.warn(`OpenClaw notify failed: ${err.message}`);
    });
  }

  @Process({ name: 'process-document', concurrency: 1 })
  async handleDocument(job: Job<{ documentId: number; url: string; eduScore: number }>): Promise<void> {
    const { documentId } = job.data;
    this.logger.log(`Processing document ${documentId} (attempt ${job.attemptsMade + 1})`);

    let articleId: number | null = null;

    try {
      // Create article in pending state if not exists
      const existing = await this.directusService.getArticleByDocumentId(documentId);
      if (existing) {
        articleId = existing.id;
        await this.directusService.updateArticleStatus(articleId, 'processing');
      } else {
        const created = await this.directusService.createArticle({
          document_id: documentId,
          title: '',
          summary: '',
          key_points: [],
          topic: '',
          edu_level: 'basico',
          quality_score: 0,
          model_used: this.configService.get<string>('ollama.model'),
          status: 'processing',
          processed_at: new Date().toISOString(),
        });
        articleId = created.id;
      }

      // Get sections
      const sections = await this.directusService.getDocumentSections(documentId);
      const content = sections.map((s: any) => s.content).join('\n\n');

      if (!content.trim()) {
        throw new Error('Document has no content in sections');
      }

      // Call Ollama
      const result = await this.ollamaService.generate(content);

      // Save article
      await this.directusService.updateArticleStatus(articleId, 'done');
      await this.directusService.createArticle({
        document_id: documentId,
        title: result.title,
        summary: result.summary,
        key_points: result.key_points,
        topic: result.topic,
        edu_level: result.edu_level,
        quality_score: result.quality_score,
        model_used: this.configService.get<string>('ollama.model'),
        status: 'done',
        processed_at: new Date().toISOString(),
      });

      this.logger.log(`Document ${documentId} processed successfully`);
    } catch (error) {
      this.logger.error(`Error processing document ${documentId}: ${error.message}`);

      if (articleId) {
        await this.directusService.updateArticleStatus(articleId, 'error', error.message);
      }

      if (error instanceof OllamaCircuitOpenError) {
        throw error;
      }

      throw error;
    }
  }

  @OnQueueFailed()
  async onFailed(job: Job, error: Error): Promise<void> {
    this.logger.error(`Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`);

    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      const dlqThreshold = this.configService.get<number>('alerts.dlqAlertThreshold');
      // Check DLQ count — notify if needed
      this.notify(`ALERTA Forja: Job ${job.id} movido a DLQ tras ${job.attemptsMade} intentos`);
      this.logger.warn(`Job ${job.id} moved to DLQ`);
    }
  }
}
