import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:5173',
      "https://social-media-frontend-blush.vercel.app",
      "https://convo-frontend-bashirs-projects-4584c438.vercel.app",
      "https://convo-frontend-adxm6elu4-bashirs-projects-4584c438.vercel.app",
      "https://convo-frontend-git-main-bashirs-projects-4584c438.vercel.app"
    ],
    methods: 'GET, HEAD, PUT, PATCH, POST, DELETE',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Chat App API')
    .setDescription('REST + Socket.IO real-time chat backend')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const pubClient = new Redis(redisUrl);
    const subClient = pubClient.duplicate();
    app.useWebSocketAdapter(
      new (class extends IoAdapter {
        createIOServer(port: number, options?: Record<string, unknown>) {
          const server = super.createIOServer(port, options);
          server.adapter(createAdapter(pubClient, subClient));
          return server;
        }
      })(app),
    );
  }

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
