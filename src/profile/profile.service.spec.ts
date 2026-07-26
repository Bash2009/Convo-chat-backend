import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ProfileService } from './profile.service';
import { Profile } from './entities/profile.entity';
import { UserService } from '../user/user.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

describe('ProfileService', () => {
  let service: ProfileService;
  let repo: jest.Mocked<Repository<Profile>>;
  let userService: jest.Mocked<UserService>;
  let cloudinary: jest.Mocked<CloudinaryService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        {
          provide: getRepositoryToken(Profile),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: UserService,
          useValue: { findOneById: jest.fn() },
        },
        {
          provide: CloudinaryService,
          useValue: { uploadImage: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(ProfileService);
    repo = module.get(getRepositoryToken(Profile));
    userService = module.get(UserService);
    cloudinary = module.get(CloudinaryService);
  });

  const mockUser = { uid: 'uid1', email: 'a@b.com' } as any;
  const mockProfile = {
    id: 'uuid',
    firstName: 'John',
    lastName: 'Doe',
    username: 'johndoe',
    bio: 'Hi',
    location: 'NYC',
    avatarUrl: null,
    user: mockUser,
  } as Profile;

  describe('create', () => {
    it('creates a profile without avatar', async () => {
      const dto = {
        userName: 'JohnDoe',
        firstName: 'John',
        lastName: 'Doe',
        bio: 'Hi',
        location: 'NYC',
      } as any;
      userService.findOneById.mockResolvedValue(mockUser);
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(mockProfile);
      repo.save.mockResolvedValue(mockProfile);

      const result = await service.create('uid1', dto, undefined);

      expect(result).toEqual(mockProfile);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'johndoe', user: mockUser }),
      );
    });

    it('uploads avatar when provided', async () => {
      const dto = {
        userName: 'JohnDoe',
        firstName: 'John',
        lastName: 'Doe',
        bio: 'Hi',
        location: 'NYC',
      } as any;
      const avatar = {
        buffer: Buffer.from(''),
        filename: '',
      } as Express.Multer.File;
      userService.findOneById.mockResolvedValue(mockUser);
      repo.findOne.mockResolvedValue(null);
      cloudinary.uploadImage.mockResolvedValue({
        url: 'https://cdn.com/avatar',
      } as any);
      repo.create.mockReturnValue({
        ...mockProfile,
        avatarUrl: 'https://cdn.com/avatar',
      });
      repo.save.mockResolvedValue({
        ...mockProfile,
        avatarUrl: 'https://cdn.com/avatar',
      });

      const result = await service.create('uid1', dto, avatar);

      expect(result.avatarUrl).toBe('https://cdn.com/avatar');
      expect(cloudinary.uploadImage).toHaveBeenCalledWith(avatar);
    });

    it('throws NotFoundException when user does not exist', async () => {
      userService.findOneById.mockResolvedValue(null);

      await expect(
        service.create('unknown', {} as any, undefined),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when profile already exists', async () => {
      userService.findOneById.mockResolvedValue(mockUser);
      repo.findOne.mockResolvedValue(mockProfile);

      await expect(
        service.create('uid1', {} as any, undefined),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException on duplicate username (PG error 23505)', async () => {
      userService.findOneById.mockResolvedValue(mockUser);
      repo.findOne.mockResolvedValue(null);
      repo.save.mockImplementation(() =>
        Promise.reject({ driverError: { code: '23505' } }),
      );

      await expect(
        service.create('uid1', { userName: 'John' } as any, undefined),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findUserById', () => {
    it('returns profile when found', async () => {
      repo.findOne.mockResolvedValue(mockProfile);

      const result = await service.findUserById('uid1');

      expect(result).toEqual(mockProfile);
    });

    it('throws NotFoundException when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findUserById('unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findUserByName', () => {
    it('returns profile when found', async () => {
      repo.findOne.mockResolvedValue(mockProfile);

      const result = await service.findUserByName('johndoe');

      expect(result).toEqual({ userExists: true, profile: mockProfile });
    });

    it('returns userExists false when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.findUserByName('unknown');

      expect(result).toEqual({ userExists: false });
    });
  });

  describe('update', () => {
    it('updates profile fields', async () => {
      const dto = { firstName: 'Jane' };
      repo.findOne.mockResolvedValue({ ...mockProfile, firstName: 'John' });
      repo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.update('uid1', dto);

      expect(result.firstName).toBe('Jane');
      expect(repo.save).toHaveBeenCalled();
    });

    it('generates username from userName', async () => {
      const dto = { userName: 'Jane Doe' };
      repo.findOne.mockResolvedValue(mockProfile);
      repo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.update('uid1', dto as any);

      expect(result.username).toBe('jane-doe');
    });

    it('uploads avatar when provided', async () => {
      const avatar = {
        buffer: Buffer.from(''),
        filename: '',
      } as Express.Multer.File;
      repo.findOne.mockResolvedValue(mockProfile);
      cloudinary.uploadImage.mockResolvedValue({
        url: 'https://cdn.com/new-avatar',
      } as any);
      repo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.update('uid1', {}, avatar);

      expect(result.avatarUrl).toBe('https://cdn.com/new-avatar');
    });

    it('throws NotFoundException when profile not found', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update('unknown', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException on duplicate username', async () => {
      const dto = { userName: 'TakenName' };
      repo.findOne.mockResolvedValue(mockProfile);
      const err = new Error();
      (err as any).driverError = { code: '23505' };
      repo.save.mockImplementation(() => {
        throw err;
      });

      await expect(service.update('uid1', dto as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
