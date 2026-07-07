import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { Request } from 'express';

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

  @Patch('update')
  @UseInterceptors(FileInterceptor('avatar'))
  update(
    @Req() req: Request,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    const uid = (req['user'] as { userId: string }).userId;
    return this.profileService.update(uid, dto, avatar);
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
