/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDirectus, rest, staticToken, readItems, createItem, updateItem } from '@directus/sdk';

type DirectusAnyClient = any;

@Injectable()
export class DirectusService {
  private readonly logger = new Logger(DirectusService.name);
  // typed as any to avoid complex Directus SDK generics at compile time
  private client: DirectusAnyClient;

  constructor(private configService: ConfigService) {
    const url = this.configService.get<string>('directus.url') as string;
    const token = this.configService.get<string>('directus.token') as string;
    // Build the client with schema omitted (untyped) to satisfy TS
    this.client = (createDirectus as any)(url)
      .with(staticToken(token))
      .with(rest());
  }

  async getDocuments(offset: number, limit: number, minScore: number): Promise<any[]> {
    try {
      const items = await this.client.request(
        (readItems as any)('fw_documents', {
          filter: { edu_score: { _gte: minScore } },
          limit,
          offset,
          fields: ['id', 'url', 'edu_score', 'title'],
        }),
      );
      return items;
    } catch (error) {
      this.logger.error(`Error fetching documents: ${error.message}`);
      throw error;
    }
  }

  async getDocumentSections(documentId: number): Promise<any[]> {
    try {
      const sections = await this.client.request(
        (readItems as any)('fw_sections', {
          filter: { document_id: { _eq: documentId } },
          sort: ['sort'],
          fields: ['id', 'content', 'sort'],
        }),
      );
      return sections;
    } catch (error) {
      this.logger.error(`Error fetching sections for doc ${documentId}: ${error.message}`);
      throw error;
    }
  }

  async getArticleByDocumentId(documentId: number): Promise<any | null> {
    try {
      const items = await this.client.request(
        (readItems as any)('fw_articles', {
          filter: { document_id: { _eq: documentId } },
          limit: 1,
          fields: ['id', 'status'],
        }),
      );
      return items.length > 0 ? items[0] : null;
    } catch (error) {
      this.logger.error(`Error fetching article for doc ${documentId}: ${error.message}`);
      return null;
    }
  }

  async createArticle(data: {
    document_id: number;
    title: string;
    summary: string;
    key_points: string[];
    topic: string;
    edu_level: string;
    quality_score: number;
    language?: string;
    model_used: string;
    status: string;
    processed_at: string;
  }): Promise<any> {
    try {
      const article = await this.client.request(
        (createItem as any)('fw_articles', {
          ...data,
          language: data.language || 'es',
        }),
      );
      return article;
    } catch (error) {
      this.logger.error(`Error creating article: ${error.message}`);
      throw error;
    }
  }

  async updateArticleStatus(id: number, status: string, errorMessage?: string): Promise<any> {
    try {
      const payload: any = { status };
      if (errorMessage) payload.error_message = errorMessage;
      if (status === 'done') payload.processed_at = new Date().toISOString();
      const article = await this.client.request((updateItem as any)('fw_articles', id, payload));
      return article;
    } catch (error) {
      this.logger.error(`Error updating article ${id}: ${error.message}`);
      throw error;
    }
  }
}
