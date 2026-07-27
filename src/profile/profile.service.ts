import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from './entities/profile.entity';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserService } from 'src/user/user.service';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(Profile)
    private profileRepository: Repository<Profile>,
    private userService: UserService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async create(
    uid: string,
    createProfileDto: CreateProfileDto,
    avatar: Express.Multer.File,
  ) {
    try {
      if (avatar) {
        avatar.filename = `${Date.now()}-${uid}`;
        const avatarUpload = await this.cloudinaryService
          .uploadImage(avatar)
          .catch((error: Error) => {
            throw new ConflictException(
              `Failed to upload avatar: ${error.message}`,
            );
          });
        createProfileDto.avatarUrl = (avatarUpload as { url: string }).url;
      }
      // Check if user exists
      const user = await this.userService.findOneById(uid);
      if (!user) {
        throw new NotFoundException(`User with ID ${uid} not found`);
      }

      // Check if profile already exists for this user
      const existingProfile = await this.profileRepository.findOne({
        where: { user: { uid } },
      });

      if (existingProfile) {
        throw new ConflictException('Profile already exists for this user');
      }

      const userProfile = this.profileRepository.create({
        ...createProfileDto,
        username: createProfileDto.userName.toLowerCase().replace(/\s+/g, '-'), // Generate uniqueName from userName
        user: user, // Associate the profile with the user
      });
      await this.profileRepository.save(userProfile);
      return userProfile;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const driverError = (error as { driverError?: { code?: string } })
        .driverError;
      if (driverError?.code === '23505') {
        throw new ConflictException('Username already exists');
      }
      throw new InternalServerErrorException('Profile creation failed');
    }
  }

  async findUserById(uid: string) {
    const profile = await this.profileRepository.findOne({
      where: { user: { uid } },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  async update(
    uid: string,
    dto: UpdateProfileDto,
    avatar?: Express.Multer.File,
  ) {
    try {
      const profile = await this.findUserById(uid);

      if (avatar) {
        avatar.filename = `${Date.now()}-${uid}`;
        const upload = await this.cloudinaryService.uploadImage(avatar);
        dto.avatarUrl = (upload as { url: string }).url;
      }

      if (dto.userName) {
        dto['username'] = dto.userName.toLowerCase().replace(/\s+/g, '-');
        delete dto.userName;
      }

      Object.assign(profile, dto);
      return this.profileRepository.save(profile);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const driverError = (error as { driverError?: { code?: string } })
        .driverError;
      if (driverError?.code === '23505') {
        throw new ConflictException('Username already exists');
      }
      throw new InternalServerErrorException('Profile update failed');
    }
  }

  async findUserByName(username: string) {
    const profile = await this.profileRepository.findOne({
      where: { username },
      relations: ['user'],
    });
    if (!profile) {
      return { userExists: false };
    }
    return { userExists: true, profile: profile };
  }
}
