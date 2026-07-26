import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RevokedToken } from './entities/revoked-token.entity';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let userService: jest.Mocked<UserService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserService,
          useValue: { create: jest.fn(), findOneById: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: getRepositoryToken(RevokedToken),
          useValue: { findOne: jest.fn(), save: jest.fn(), delete: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    userService = module.get(UserService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
  });

  describe('register', () => {
    it('creates a user and returns tokens', async () => {
      const dto = { uid: 'uid1', email: 'a@b.com' };
      userService.create.mockResolvedValue(dto as any);
      configService.get.mockImplementation((key: string) =>
        key === 'JWT_SECRET' ? 'secret' : 'refresh-secret',
      );
      jwtService.signAsync.mockResolvedValue('token');

      const result = await service.register(dto);

      expect(result.access_token).toBe('token');
      expect(result.refresh_token).toBe('token');
      expect(userService.create).toHaveBeenCalledWith(dto);
    });

    it('throws InternalServerErrorException on failure', async () => {
      userService.create.mockRejectedValue(new Error('db error'));

      await expect(
        service.register({ uid: 'u1', email: 'a@b.com' }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('login', () => {
    it('returns user with tokens when found', async () => {
      const user = { uid: 'uid1', email: 'a@b.com' };
      userService.findOneById.mockResolvedValue(user as any);
      configService.get.mockReturnValue('secret');
      jwtService.signAsync.mockResolvedValue('token');

      const result = await service.login({ uid: 'uid1' } as any);

      expect(result.access_token).toBe('token');
    });

    it('throws BadRequestException when user not found', async () => {
      userService.findOneById.mockResolvedValue(null);

      await expect(service.login({ uid: 'unknown' } as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('refreshToken', () => {
    it('returns new tokens', async () => {
      configService.get.mockReturnValue('secret');
      jwtService.signAsync.mockResolvedValue('new-token');

      const result = await service.refreshToken('uid1');

      expect(result.access_token).toBe('new-token');
      expect(result.refresh_token).toBe('new-token');
      expect(result.jti).toBeDefined();
    });
  });

  describe('logout', () => {
    it('revokes the refresh token', async () => {
      const result = await service.logout('uid1', 'jti1');

      expect(result.message).toBe('Logged out successfully');
    });
  });
});
