import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { Request } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'User registered with tokens' })
  register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with Firebase UID' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Tokens returned' })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh token pair' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 200, description: 'New token pair issued' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  refresh(@Req() req: Request) {
    const user = req['user'] as { userId: string };
    return this.authService.refreshToken(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiOperation({ summary: 'Logout (client discards tokens)' })
  @ApiBearerAuth('access-token')
  @ApiResponse({ status: 201, description: 'Logged out' })
  logout() {
    return this.authService.logout();
  }
}
