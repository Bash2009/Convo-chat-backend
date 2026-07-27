import { REDIS } from './constants';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const RedisProvider = {
  provide: REDIS,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const url =
      configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    return new Redis(url);
  },
};
