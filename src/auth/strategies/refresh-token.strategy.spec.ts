import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenStrategy } from './refresh-token.strategy';

describe('RefreshTokenStrategy', () => {
  let strategy: RefreshTokenStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenStrategy,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-refresh-secret') } },
      ],
    }).compile();

    strategy = module.get(RefreshTokenStrategy);
  });

  describe('validate', () => {
    it('returns userId, email and refresh token', () => {
      const req = { get: jest.fn().mockReturnValue('Bearer my-refresh-token') } as any;

      const result = strategy.validate(req, { sub: 'uid1', email: 'a@b.com' });

      expect(result).toEqual({ userId: 'uid1', email: 'a@b.com', refreshToken: 'my-refresh-token' });
    });

    it('returns null refresh token when header is missing', () => {
      const req = { get: jest.fn().mockReturnValue(undefined) } as any;

      const result = strategy.validate(req, { sub: 'uid1' });

      expect(result).toEqual({ userId: 'uid1', email: null, refreshToken: null });
    });
  });
});
