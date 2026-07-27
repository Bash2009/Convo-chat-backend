import { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export const redisProvider: FactoryProvider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const url = configService.get<string>('REDIS_URL');
    if (!url) return null;
    return new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  },
};
