import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.provider';

@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly inMemory = new Set<string>();

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    private readonly configService: ConfigService,
  ) {}

  async blacklist(jti: string, ttlSeconds: number): Promise<void> {
    if (this.redis) {
      await this.redis.set(`bl:${jti}`, '1', 'EX', ttlSeconds).catch((err) => {
        this.logger.error(`Redis blacklist set failed: ${(err as Error).message}`);
      });
    }
    this.inMemory.add(jti);
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    if (this.inMemory.has(jti)) return true;
    if (this.redis) {
      const val = await this.redis.get(`bl:${jti}`).catch(() => null);
      if (val === '1') {
        this.inMemory.add(jti);
        return true;
      }
    }
    return false;
  }
}
