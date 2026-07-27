import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { TokenBlacklistService } from './token-blacklist.service';

jest.mock('uuid', () => ({ v4: () => 'fixed-jti' }));

describe('AuthService', () => {
  let service: AuthService;
  let userService: jest.Mocked<UserService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;
  let tokenBlacklist: jest.Mocked<TokenBlacklistService>;

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
          useValue: { signAsync: jest.fn(), verify: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: TokenBlacklistService,
          useValue: { blacklist: jest.fn(), isBlacklisted: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    userService = module.get(UserService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
    tokenBlacklist = module.get(TokenBlacklistService);
  });

  describe('register', () => {
    it('creates a user and returns tokens', async () => {
      const dto = { uid: 'uid1', email: 'a@b.com' };
      userService.create.mockResolvedValue(dto);
      configService.get.mockImplementation((key: string) =>
        key === 'JWT_SECRET' ? 'secret' : 'refresh-secret',
      );
      jwtService.signAsync.mockResolvedValue('token');

      const result = await service.register(dto);

      expect(result).toEqual({
        ...dto,
        access_token: 'token',
        refresh_token: 'token',
      });
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
      userService.findOneById.mockResolvedValue(user);
      configService.get.mockReturnValue('secret');
      jwtService.signAsync.mockResolvedValue('token');

      const result = await service.login({ uid: 'uid1' });

      expect(result.access_token).toBe('token');
    });

    it('throws BadRequestException when user not found', async () => {
      userService.findOneById.mockResolvedValue(null);

      await expect(service.login({ uid: 'unknown' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('refreshToken', () => {
    it('blacklists old jti and returns new tokens', async () => {
      configService.get.mockReturnValue('secret');
      jwtService.verify.mockReturnValue({ jti: 'old-jti' });
      jwtService.signAsync.mockResolvedValue('new-token');

      const result = await service.refreshToken('uid1', 'old-refresh-token');

      expect(jwtService.verify).toHaveBeenCalledWith('old-refresh-token', {
        secret: 'secret',
      });
      expect(tokenBlacklist.blacklist).toHaveBeenCalledWith(
        'old-jti',
        7 * 24 * 60 * 60,
      );
      expect(result).toEqual({
        access_token: 'new-token',
        refresh_token: 'new-token',
      });
    });

    it('returns new tokens without blacklisting when no old token', async () => {
      configService.get.mockReturnValue('secret');
      jwtService.signAsync.mockResolvedValue('new-token');

      const result = await service.refreshToken('uid1');

      expect(tokenBlacklist.blacklist).not.toHaveBeenCalled();
      expect(result).toEqual({
        access_token: 'new-token',
        refresh_token: 'new-token',
      });
    });
  });

  describe('logout', () => {
    it('blacklists the access token jti', async () => {
      configService.get.mockReturnValue('jwt-secret');
      jwtService.verify.mockReturnValue({ jti: 'token-jti' });

      const result = await service.logout('Bearer token');

      expect(jwtService.verify).toHaveBeenCalledWith('Bearer token', {
        secret: 'jwt-secret',
      });
      expect(tokenBlacklist.blacklist).toHaveBeenCalledWith(
        'token-jti',
        15 * 60,
      );
      expect(result).toEqual({ message: 'Logged out successfully' });
    });

    it('succeeds even if token is invalid', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error();
      });

      const result = await service.logout('invalid-token');

      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });
});
