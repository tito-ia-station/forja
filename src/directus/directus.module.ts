import { Module } from '@nestjs/common';
import { DirectusService } from './directus.service';

@Module({
  providers: [DirectusService],
  exports: [DirectusService],
})
export class DirectusModule {}
