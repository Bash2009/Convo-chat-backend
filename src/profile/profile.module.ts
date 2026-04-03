import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { UserModule } from 'src/user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profile } from './entities/profile.entity';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

@Module({
  controllers: [ProfileController],
  providers: [ProfileService],
  imports: [UserModule, TypeOrmModule.forFeature([Profile]), CloudinaryModule],
  exports: [ProfileService],
})
export class ProfileModule {}
