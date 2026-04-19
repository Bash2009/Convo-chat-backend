import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Post('create')
  @UseInterceptors(FileInterceptor('avatar'))
  create(
    @Body() createProfileDto: CreateProfileDto,
    @UploadedFile() avatar: Express.Multer.File,
  ) {
    return this.profileService.create(createProfileDto, avatar);
  }

  @Get('id/:uid')
  findOneById(@Param('uid') uid: string) {
    return this.profileService.findUserById(uid);
  }

  @Get('name/:name')
  findOneByName(@Param('name') name: string) {
    return this.profileService.findUserByName(name);
  }
}
