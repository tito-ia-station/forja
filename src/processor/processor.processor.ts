import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { DirectusService } from '../directus/directus.service';
import { OllamaService, OllamaCircuitOpenError } from '../ollama/ollama.service';
import { ArticlesService } from '../articles/articles.service';

@Processor('documents')
export class DocumentProcessor {
  private readonly logger = new Logger(DocumentProcessor.name);

  constructor(
    private readonly directusService: DirectusService,
    private readonly ollamaService: OllamaService,
    private readonly configService: ConfigService,
    private readonly articlesService: ArticlesService,
  ) {}

  private notify(message: string): void {
    const enabled = this.configService.get<boolean>('alerts.openclawNotify');
    if (!enabled) return;
    exec(`openclaw system event --text "${message}" --mode now`, (err) => {
      if (err) this.logger.warn(`OpenClaw notify failed: ${err.message}`);
    });
  }

  @Process({ name: 'process-document', concurrency: 1 })
  async handleDocument(job: Job<{
    documentId: number;
    url: string;
    edu_score: number;
    token_count: number;
    dump: string;
  }>): Promise<void> {
    const { documentId, url, edu_score, token_count, dump } = job.data;
    this.logger.log(`📥 [Job ${job.id}] Recibido doc ${documentId} (url: ${url?.slice(0, 60)}) | attempt ${job.attemptsMade + 1}`);

    let articleId: number | null = null;
    let step = 'init';

    try {
      // Create article in pending state if not exists
      step = 'check-existing';
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

      // Get content
      step = 'read-content';
      this.logger.log(`📖 [Job ${job.id}] Obteniendo contenido del doc ${documentId}...`);
      const content = await this.directusService.getDocumentContent(documentId);
      this.logger.log(`📖 [Job ${job.id}] Contenido: ${content.length} chars`);

      if (!content.trim()) {
        throw new Error('Document has no content in sections');
      }

      // Call Ollama
      step = 'ollama';
      this.logger.log(`🤖 [Job ${job.id}] Enviando a Ollama (${content.length} chars)...`);
      const result = await this.ollamaService.generate(content);
      this.logger.log(`✅ [Job ${job.id}] Ollama respondió: "${result.title}" | topic: ${result.topic} | score: ${result.quality_score}`);

      // Update article to done and save full schema with source metadata
      step = 'save-article';
      this.logger.log(`💾 [Job ${job.id}] Guardando artículo en Directus...`);
      await this.directusService.updateArticleStatus(articleId, 'done');
      await this.articlesService.createArticle({
        documentId,
        ollamaResult: {
          title: result.title,
          summary: result.summary,
          key_points: result.key_points,
          topic: result.topic,
          edu_level: result.edu_level,
          quality_score: result.quality_score,
        },
        document: {
          url: url || '',
          edu_score: edu_score || 0,
          token_count: token_count || 0,
          dump: dump || '',
        },
        modelUsed: this.configService.get<string>('ollama.model'),
      });

      this.logger.log(`✅ [Job ${job.id}] Artículo guardado (articleId: ${articleId}, doc: ${documentId})`);
    } catch (error) {
      this.logger.error(`❌ [Job ${job.id}] Error en paso "${step}": ${error.message}`);

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
    if (job.attemptsMade < (job.opts.attempts || 3)) {
      this.logger.warn(`🔄 [Job ${job.id}] Reintento ${job.attemptsMade}/${job.opts.attempts || 3} para doc ${job.data.documentId}`);
    }
    this.logger.error(`❌ [Job ${job.id}] Falló tras ${job.attemptsMade} intentos: ${error.message}`);

    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      const dlqThreshold = this.configService.get<number>('alerts.dlqAlertThreshold');
      // Check DLQ count — notify if needed
      this.notify(`ALERTA Forja: Job ${job.id} movido a DLQ tras ${job.attemptsMade} intentos`);
      this.logger.warn(`Job ${job.id} moved to DLQ`);
    }
  }
}
