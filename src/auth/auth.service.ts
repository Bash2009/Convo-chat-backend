import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { UserService } from 'src/user/user.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dto/login.dto';
import { TokenBlacklistService } from './token-blacklist.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private tokenBlacklist: TokenBlacklistService,
  ) {}

  private async getTokens(uid: string, oldJti?: string) {
    if (oldJti) {
      await this.tokenBlacklist.blacklist(oldJti, 7 * 24 * 60 * 60);
    }

    const jwtid = uuidv4();
    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(
        { sub: uid, jti: jwtid },
        {
          secret: this.configService.get<string>('JWT_SECRET'),
          expiresIn: '15m',
        },
      ),
      this.jwtService.signAsync(
        { sub: uid, jti: jwtid },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: '7d',
        },
      ),
    ]);
    return { access_token, refresh_token };
  }

  async register(createUserDto: CreateUserDto) {
    try {
      const user = await this.userService.create(createUserDto);
      const tokens = await this.getTokens(user.uid);
      return { ...user, ...tokens };
    } catch (error) {
      this.logger.error(
        `Registration failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new InternalServerErrorException('Registration failed');
    }
  }

  async login(loginDto: LoginDto) {
    const user = await this.userService.findOneById(loginDto.uid);
    if (!user) throw new BadRequestException('User not found');
    const tokens = await this.getTokens(user.uid);
    return { ...user, ...tokens };
  }

  async refreshToken(uid: string, oldRefreshToken?: string) {
    let oldJti: string | undefined;
    if (oldRefreshToken) {
      try {
        const payload = this.jwtService.verify<{ jti: string }>(
          oldRefreshToken,
          { secret: this.configService.get<string>('JWT_REFRESH_SECRET') },
        );
        oldJti = payload.jti;
      } catch {
        throw new UnauthorizedException('Invalid refresh token');
      }
    }
    return this.getTokens(uid, oldJti);
  }

  async logout(accessToken: string) {
    try {
      const payload = this.jwtService.verify<{ jti: string }>(accessToken, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      await this.tokenBlacklist.blacklist(payload.jti, 15 * 60);
    } catch {
      // Token already expired or invalid — best-effort blacklist
    }
    return { message: 'Logged out successfully' };
  }
}
