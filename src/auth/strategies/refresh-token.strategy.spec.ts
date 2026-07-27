import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenStrategy } from './refresh-token.strategy';

describe('RefreshTokenStrategy', () => {
  let strategy: RefreshTokenStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenStrategy,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-refresh-secret') },
        },
      ],
    }).compile();

    strategy = module.get(RefreshTokenStrategy);
  });

  describe('validate', () => {
    it('returns userId, jti, type and refresh token', () => {
      const req = {
        headers: { authorization: 'Bearer my-refresh-token' },
        cookies: {},
      } as any;

      const result = strategy.validate(req, { sub: 'uid1', jti: 'jti1', type: 'refresh' });

      expect(result).toEqual({
        userId: 'uid1',
        jti: 'jti1',
        type: 'refresh',
        refreshToken: 'my-refresh-token',
      });
    });

    it('returns null refresh token when header is missing', () => {
      const req = { headers: {}, cookies: {} } as any;

      const result = strategy.validate(req, { sub: 'uid1' });

      expect(result).toEqual({
        userId: 'uid1',
        jti: null,
        type: null,
        refreshToken: null,
      });
    });
  });
});
