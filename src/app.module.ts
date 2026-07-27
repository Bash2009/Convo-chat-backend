import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ProfileModule } from './profile/profile.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { ChatsModule } from './chats/chats.module';

@Module({
  imports: [
    AuthModule,
    UserModule,
    ProfileModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url:
          configService.get<string>('DATABASE_URL') ||
          `postgres://postgres:${configService.get<string>('DB_PASSWORD')}@localhost:${configService.get<string>('DB_PORT') || 5432}/${configService.get<string>('DB_NAME')}`,
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        logging: configService.get<string>('NODE_ENV') === 'development',
        synchronize: configService.get<string>('NODE_ENV') === 'development',
        migrationsRun: configService.get<string>('NODE_ENV') === 'production',
        // ssl: {
        //   rejectUnauthorized: configService.get<string>('NODE_ENV') === 'production',
        // },
      }),
    }),
    CloudinaryModule,
    ChatsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
