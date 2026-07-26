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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { LoginDto } from './dto/login.dto';
import { RevokedToken } from './entities/revoked-token.entity';
import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectRepository(RevokedToken)
    private revokedTokenRepository: Repository<RevokedToken>,
  ) {
    void this.cleanExpiredTokens();
  }

  private async cleanExpiredTokens() {
    try {
      await this.revokedTokenRepository.delete({
        expiresAt: LessThan(new Date()),
      });
    } catch {
      // expired-token cleanup is best-effort
    }
  }

  private async getTokens(uid: string) {
    const jti = randomBytes(16).toString('hex');
    const refreshExpiresIn = '7d';
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
          expiresIn: refreshExpiresIn,
        },
      ),
    ]);
    return { access_token, refresh_token, jti };
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
      const revoked = await this.revokedTokenRepository.findOne({
        where: { jti: oldRefreshJti },
      });
      if (revoked) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }
    }
    const tokens = await this.getTokens(uid);
    if (oldRefreshJti) {
      await this.revokedTokenRepository
        .save({
          jti: oldRefreshJti,
          uid,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .catch(() => {});
    }
    return tokens;
  }

  async logout(uid: string, refreshJti: string) {
    await this.revokedTokenRepository
      .save({
        jti: refreshJti,
        uid,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .catch(() => {});
    return { message: 'Logged out successfully' };
  }
}
