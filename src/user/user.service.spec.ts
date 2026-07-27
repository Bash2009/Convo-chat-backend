import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserService } from './user.service';
import { Repository } from 'typeorm';

describe('UserService', () => {
  let service: UserService;
  let repo: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: { save: jest.fn(), findOneBy: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(UserService);
    repo = module.get(getRepositoryToken(User));
  });

  describe('create', () => {
    it('saves and returns the user', async () => {
      const dto = { uid: 'uid1', email: 'a@b.com' };
      repo.save.mockResolvedValue(dto as User);

      const result = await service.create(dto);

      expect(result).toEqual(dto);
      expect(repo.save).toHaveBeenCalledWith(dto);
    });
  });

  describe('findOneById', () => {
    it('returns user when found', async () => {
      const user = { uid: 'uid1', email: 'a@b.com' };
      repo.findOneBy.mockResolvedValue(user as User);

      const result = await service.findOneById('uid1');

      expect(result).toEqual(user);
      expect(repo.findOneBy).toHaveBeenCalledWith({ uid: 'uid1' });
    });

    it('returns null when not found', async () => {
      repo.findOneBy.mockResolvedValue(null);

      const result = await service.findOneById('unknown');

      expect(result).toBeNull();
    });
  });

  describe('findOneByEmail', () => {
    it('returns user when found', async () => {
      const user = { uid: 'uid1', email: 'a@b.com' };
      repo.findOneBy.mockResolvedValue(user as User);

      const result = await service.findOneByEmail('a@b.com');

      expect(result).toEqual(user);
      expect(repo.findOneBy).toHaveBeenCalledWith({ email: 'a@b.com' });
    });

    it('returns null when not found', async () => {
      repo.findOneBy.mockResolvedValue(null);

      const result = await service.findOneByEmail('unknown@b.com');

      expect(result).toBeNull();
    });
  });
});
