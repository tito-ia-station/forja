/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDirectus, rest, staticToken, readItems } from '@directus/sdk';
import { DirectusService } from '../directus/directus.service';

@Injectable()
export class ArticlesService {
  private client: any;

  constructor(
    private configService: ConfigService,
    private readonly directus: DirectusService,
  ) {
    const url = this.configService.get<string>('directus.url') as string;
    const token = this.configService.get<string>('directus.token') as string;
    this.client = (createDirectus as any)(url).with(staticToken(token)).with(rest());
  }

  async findAll(page = 1, limit = 20, status?: string): Promise<{ data: any[]; total: number }> {
    const filter: any = {};
    if (status) filter.status = { _eq: status };

    const [data, total] = await Promise.all([
      this.client.request(
        (readItems as any)('fw_articles', {
          filter,
          limit,
          offset: (page - 1) * limit,
          sort: ['-processed_at'],
          fields: ['id', 'document_id', 'title', 'summary', 'topic', 'edu_level', 'quality_score', 'status', 'processed_at'],
        }),
      ),
      this.client.request(
        (readItems as any)('fw_articles', {
          filter,
          aggregate: { count: ['id'] },
        }),
      ),
    ]);

    return { data, total: total[0]?.count?.id || 0 };
  }

  async createArticle(data: {
    documentId: number;
    ollamaResult: {
      title: string;
      summary: string;
      key_points: string[];
      topic: string;
      edu_level: string;
      quality_score: number;
    };
    document: {
      url: string;
      edu_score: number;
      token_count: number;
      dump: string;
    };
    modelUsed: string;
  }): Promise<any> {
    const article = await this.directus.createItem('fw_articles', {
      document_id: data.documentId,
      title: data.ollamaResult.title,
      summary: data.ollamaResult.summary,
      key_points: data.ollamaResult.key_points,
      topic: data.ollamaResult.topic,
      edu_level: data.ollamaResult.edu_level,
      quality_score: data.ollamaResult.quality_score,
      language: 'es',
      model_used: data.modelUsed,
      status: 'done',
      processed_at: new Date().toISOString(),
      source_url: data.document.url,
      source_edu_score: data.document.edu_score,
      source_token_count: data.document.token_count,
      source_dump: data.document.dump,
    });

    for (let i = 0; i < data.ollamaResult.key_points.length; i++) {
      await this.directus.createItem('fw_article_key_points', {
        article_id: article.id,
        content: data.ollamaResult.key_points[i],
        position: i,
      });
    }

    return article;
  }
}
