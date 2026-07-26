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
import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private tokenBlacklist = new Set<string>();

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private async getTokens(uid: string) {
    const jti = randomBytes(16).toString('hex');
    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(
        { sub: uid, type: 'access' },
        {
          secret: this.configService.get<string>('JWT_SECRET'),
          expiresIn: '15m',
        },
      ),
      this.jwtService.signAsync(
        { sub: uid, type: 'refresh', jti },
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
    try {
      const decoded = await admin.auth().verifyIdToken(loginDto.firebaseToken);
      if (decoded.uid !== loginDto.uid) {
        throw new UnauthorizedException('Token UID mismatch');
      }
    } catch {
      throw new UnauthorizedException('Invalid Firebase ID token');
    }

    const user = await this.userService.findOneById(loginDto.uid);
    if (!user) throw new BadRequestException('User not found');
    const tokens = await this.getTokens(user.uid);
    return { ...user, ...tokens };
  }

  async refreshToken(uid: string, oldRefreshJti?: string) {
    if (oldRefreshJti) {
      if (this.tokenBlacklist.has(oldRefreshJti)) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }
      this.tokenBlacklist.add(oldRefreshJti);
    }
    return this.getTokens(uid);
  }

  logout() {
    return { message: 'Logged out successfully' };
  }
}
