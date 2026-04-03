import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from './entities/profile.entity';
import { CreateProfileDto } from './dto/create-profile.dto';
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
    createProfileDto: CreateProfileDto,
    avatar: Express.Multer.File,
  ) {
    try {
      if (avatar) {
        avatar.filename = ` ${Date.now()}-${createProfileDto.uid}`;
        const avatarUpload = await this.cloudinaryService
          .uploadImage(avatar)
          .catch((error) => {
            throw new ConflictException(
              `Failed to upload avatar: ${error.message}`,
            );
          });
        createProfileDto.avatarUrl = avatarUpload.url;
      }
      // Check if user exists
      const user = await this.userService.findOneById(createProfileDto.uid);
      if (!user) {
        throw new NotFoundException(
          `User with ID ${createProfileDto.uid} not found`,
        );
      }

      // Check if profile already exists for this user
      const existingProfile = await this.profileRepository.findOne({
        where: { user: { uid: createProfileDto.uid } },
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
      if (error.message.includes('not found')) {
        throw new NotFoundException(error.message);
      } else {
        throw new ConflictException(error.message);
      }
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
