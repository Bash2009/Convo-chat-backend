import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>('REDIS_URL');
        if (!url) return { connection: { host: 'localhost', port: 6379 } };
        return { connection: { url } };
      },
    }),
    BullModule.registerQueue({ name: 'chat-events' }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
