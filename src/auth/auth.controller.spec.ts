import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const mockRes = () => {
  const res: any = {};
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            refreshToken: jest.fn(),
            logout: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(AuthController);
    authService = module.get(AuthService);
  });

  describe('register', () => {
    it('delegates to authService.register', async () => {
      const dto = { uid: 'u1', email: 'a@b.com' };
      authService.register.mockResolvedValue({
        ...dto,
        access_token: 't',
      } as any);
      const res = mockRes();

      const result = await controller.register(dto, res);

      expect(result.access_token).toBe('t');
      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(res.cookie).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('delegates to authService.login', async () => {
      const dto = { uid: 'u1' } as any;
      authService.login.mockResolvedValue({
        uid: 'u1',
        email: 'a@b.com',
        access_token: 't',
        refresh_token: 't',
      } as any);
      const res = mockRes();

      const result = await controller.login(dto, res);

      expect(result.access_token).toBe('t');
      expect(authService.login).toHaveBeenCalledWith(dto);
      expect(res.cookie).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('delegates to authService.refreshToken', async () => {
      const req = { user: { userId: 'uid1' } } as any;
      const res = mockRes();
      authService.refreshToken.mockResolvedValue({
        access_token: 't',
        refresh_token: 't',
        jti: 'jti1',
      } as any);

      const result = await controller.refresh(req, res);

      expect(result.access_token).toBe('t');
      expect(authService.refreshToken).toHaveBeenCalledWith('uid1', undefined);
      expect(res.cookie).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('delegates to authService.logout', async () => {
      const req = { user: { userId: 'uid1', jti: 'jti1' } } as any;
      const res = mockRes();
      authService.logout.mockResolvedValue({
        message: 'Logged out successfully',
      } as any);

      const result = await controller.logout(req, res);

      expect(result.message).toBe('Logged out successfully');
      expect(authService.logout).toHaveBeenCalledWith('uid1', 'jti1');
      expect(res.clearCookie).toHaveBeenCalled();
    });
  });
});
