import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { UserService } from 'src/user/user.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // Returns [access_token, refresh_token]
  private async getTokens(uid: string) {
    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(
        { sub: uid },
        {
          secret: this.configService.get<string>('JWT_SECRET'),
          expiresIn: '15m',
        },
      ),
      this.jwtService.signAsync(
        { sub: uid },
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

  async refreshToken(uid: string) {
    return this.getTokens(uid);
  }

  /** Stateless logout — tokens are short-lived so no server-side blacklist needed.
   *  The client discards both tokens; this endpoint exists for a clean API surface. */
  logout() {
    return { message: 'Logged out successfully' };
  }
}
