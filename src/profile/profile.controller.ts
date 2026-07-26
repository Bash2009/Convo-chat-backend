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
  MaxFileSizeValidator,
  ParseFilePipe,
  FileTypeValidator,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { Request } from 'express';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB

const avatarFilePipe = new ParseFilePipe({
  validators: [
    new MaxFileSizeValidator({ maxSize: MAX_AVATAR_SIZE }),
    new FileTypeValidator({ fileType: /(jpg|jpeg|png|gif|webp)$/ }),
  ],
  fileIsRequired: false,
});

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Post('create')
  @UseInterceptors(FileInterceptor('avatar', { limits: { fileSize: MAX_AVATAR_SIZE } }))
  create(
    @Req() req: Request,
    @Body() createProfileDto: CreateProfileDto,
    @UploadedFile(avatarFilePipe) avatar?: Express.Multer.File,
  ) {
    const uid = (req['user'] as { userId: string }).userId;
    return this.profileService.create(uid, createProfileDto, avatar);
  }

  @Patch('update')
  @UseInterceptors(FileInterceptor('avatar', { limits: { fileSize: MAX_AVATAR_SIZE } }))
  update(
    @Req() req: Request,
    @Body() dto: UpdateProfileDto,
    @UploadedFile(avatarFilePipe) avatar?: Express.Multer.File,
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
