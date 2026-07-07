import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

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
      authService.register.mockResolvedValue({ ...dto, access_token: 't' });

      const result = await controller.register(dto);

      expect(result).toEqual({ ...dto, access_token: 't' });
      expect(authService.register).toHaveBeenCalledWith(dto);
    });
  });

  describe('login', () => {
    it('delegates to authService.login', async () => {
      const dto = { uid: 'u1' };
      authService.login.mockResolvedValue({ uid: 'u1', email: 'a@b.com', access_token: 't', refresh_token: 't' });

      const result = await controller.login(dto);

      expect(result.access_token).toBe('t');
      expect(authService.login).toHaveBeenCalledWith(dto);
    });
  });

  describe('refresh', () => {
    it('delegates to authService.refreshToken', async () => {
      const req = { user: { userId: 'uid1' } } as any;
      authService.refreshToken.mockResolvedValue({ access_token: 't', refresh_token: 't' });

      const result = await controller.refresh(req);

      expect(result.access_token).toBe('t');
      expect(authService.refreshToken).toHaveBeenCalledWith('uid1');
    });
  });

  describe('logout', () => {
    it('delegates to authService.logout', () => {
      authService.logout.mockReturnValue({ message: 'Logged out successfully' });

      const result = controller.logout();

      expect(result.message).toBe('Logged out successfully');
      expect(authService.logout).toHaveBeenCalled();
    });
  });
});
