import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/user.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let userService: jest.Mocked<UserService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-secret') } },
        { provide: UserService, useValue: { findOneById: jest.fn() } },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
    userService = module.get(UserService);
  });

  describe('validate', () => {
    it('returns user object when user exists', async () => {
      userService.findOneById.mockResolvedValue({ uid: 'uid1', email: 'a@b.com' } as any);

      const result = await strategy.validate({ sub: 'uid1', email: 'a@b.com' });

      expect(result).toEqual({ userId: 'uid1', email: 'a@b.com' });
    });

    it('throws UnauthorizedException when user not found', async () => {
      userService.findOneById.mockResolvedValue(null);

      await expect(strategy.validate({ sub: 'unknown' })).rejects.toThrow(UnauthorizedException);
    });

    it('returns null email when not provided', async () => {
      userService.findOneById.mockResolvedValue({ uid: 'uid1' } as any);

      const result = await strategy.validate({ sub: 'uid1' });

      expect(result).toEqual({ userId: 'uid1', email: null });
    });
  });
});
