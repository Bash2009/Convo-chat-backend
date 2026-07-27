import { Module } from '@nestjs/common';
import { SocketDocsController } from './socket-docs.controller';

@Module({
  controllers: [SocketDocsController],
})
export class SocketDocsModule {}
