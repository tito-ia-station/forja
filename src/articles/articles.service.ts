/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDirectus, rest, staticToken, readItems } from '@directus/sdk';

@Injectable()
export class ArticlesService {
  private client: any;

  constructor(private configService: ConfigService) {
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
}
