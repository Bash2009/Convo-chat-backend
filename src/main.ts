import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'https://social-media-frontend-blush.vercel.app',
      'https://social-media-frontend-bashirs-projects-4584c438.vercel.app/',
    ],
    methods: 'GET, HEAD, PUT, PATCH, POST, DELETE',
    credentials: true,
  });

  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', [
        'http://localhost:5173',
        'https://social-media-frontend-blush.vercel.app',
        'https://social-media-frontend-bashirs-projects-4584c438.vercel.app',
      ]);

      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, PUT, PATCH, POST, DELETE, OPTIONS',
      );

      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization',
      );
      return res.status(200).end();
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are present
      transform: true, // Transform payloads to be objects typed according to their DTO classes
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
