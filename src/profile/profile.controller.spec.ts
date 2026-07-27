import { Test, TestingModule } from '@nestjs/testing';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

describe('ProfileController', () => {
  let controller: ProfileController;
  let service: jest.Mocked<ProfileService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        {
          provide: ProfileService,
          useValue: {
            create: jest.fn(),
            findUserById: jest.fn(),
            findUserByName: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(ProfileController);
    service = module.get(ProfileService);
  });

  describe('create', () => {
    it('delegates to service.create with authenticated user', async () => {
      const dto = {
        userName: 'john',
        firstName: 'John',
        lastName: 'Doe',
        bio: 'Hi',
        location: 'NYC',
      } as any;
      const avatar = { buffer: Buffer.from('') } as Express.Multer.File;
      const req = { user: { userId: 'uid1' } } as any;
      service.create.mockResolvedValue(dto);

      const result = await controller.create(req, dto, avatar);

      expect(result).toEqual(dto);
      expect(service.create).toHaveBeenCalledWith('uid1', dto, avatar);
    });
  });

  describe('findOneById', () => {
    it('delegates to service.findUserById', async () => {
      const profile = { id: 'uuid', firstName: 'John' } as any;
      service.findUserById.mockResolvedValue(profile);

      const result = await controller.findOneById('uid1');

      expect(result).toEqual(profile);
      expect(service.findUserById).toHaveBeenCalledWith('uid1');
    });
  });

  describe('findOneByName', () => {
    it('delegates to service.findUserByName', async () => {
      service.findUserByName.mockResolvedValue({
        userExists: true,
        profile: {} as any,
      });

      const result = await controller.findOneByName('johndoe');

      expect(result.userExists).toBe(true);
      expect(service.findUserByName).toHaveBeenCalledWith('johndoe');
    });
  });

  describe('update', () => {
    it('delegates to service.update with authenticated user', async () => {
      const dto = { firstName: 'Jane' };
      const avatar = { buffer: Buffer.from('') } as Express.Multer.File;
      const req = { user: { userId: 'uid1' } } as any;
      service.update.mockResolvedValue({ firstName: 'Jane' } as any);

      const result = await controller.update(req, dto, avatar);

      expect(result.firstName).toBe('Jane');
      expect(service.update).toHaveBeenCalledWith('uid1', dto, avatar);
    });
  });
});
