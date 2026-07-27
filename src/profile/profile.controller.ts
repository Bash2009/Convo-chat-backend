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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { Request } from 'express';

@ApiTags('Profile')
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Post('create')
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create user profile' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateProfileDto })
  @ApiResponse({ status: 201, description: 'Profile created' })
  create(
    @Req() req: Request,
    @Body() createProfileDto: CreateProfileDto,
    @UploadedFile() avatar: Express.Multer.File,
  ) {
    const uid = (req['user'] as { userId: string }).userId;
    return this.profileService.create(uid, createProfileDto, avatar);
  }

  @Patch('update')
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  update(
    @Req() req: Request,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    const uid = (req['user'] as { userId: string }).userId;
    return this.profileService.update(uid, dto, avatar);
  }

  @Get('id/:uid')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get profile by user UID' })
  @ApiResponse({ status: 200, description: 'Profile found' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  findOneById(@Param('uid') uid: string) {
    return this.profileService.findUserById(uid);
  }

  @Get('name/:name')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get profile by username' })
  @ApiResponse({ status: 200, description: 'Profile found' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  findOneByName(@Param('name') name: string) {
    return this.profileService.findUserByName(name);
  }
}
