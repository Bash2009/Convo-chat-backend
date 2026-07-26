import { Controller, Post, Body, UseGuards, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('register')
  async register(
    @Body() createUserDto: CreateUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(createUserDto);
    res.cookie('refresh_token', result.refresh_token, REFRESH_COOKIE_OPTIONS);
    return result;
  }

  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);
    res.cookie('refresh_token', result.refresh_token, REFRESH_COOKIE_OPTIONS);
    return result;
  }

  /** Issues a new token pair. Accepts refresh token via Bearer header or httpOnly cookie. */
  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req['user'] as { userId: string; jti?: string };
    const result = await this.authService.refreshToken(user.userId, user.jti);
    res.cookie('refresh_token', result.refresh_token, REFRESH_COOKIE_OPTIONS);
    return result;
  }

  /** Signs the user out — revokes the refresh token. */
  @UseGuards(RefreshTokenGuard)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = req['user'] as { userId: string; jti?: string };
    const result = await this.authService.logout(user.userId, user.jti ?? '');
    res.clearCookie('refresh_token', { path: '/auth' });
    return result;
  }
}
