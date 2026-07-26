import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

interface JwtPayload {
  sub: string;
  jti?: string;
  type?: string;
}

function extractJwtFromCookie(req: Request): string | null {
  return req.cookies?.refresh_token ?? null;
}

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private configService: ConfigService) {
    const refreshSecret = configService.get<string>('JWT_REFRESH_SECRET');

    if (!refreshSecret) {
      throw new Error(
        'JWT_REFRESH_SECRET is not defined in environment variables',
      );
    }

    super({
      jwtFromRequest: (req: Request) => {
        const headerToken = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
        return headerToken ?? extractJwtFromCookie(req);
      },
      secretOrKey: refreshSecret,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload) {
    const authHeader = req.get('Authorization');
    const refreshToken =
      authHeader?.split(' ')[1] ?? req.cookies?.refresh_token ?? null;

    return {
      userId: payload.sub,
      jti: payload.jti ?? null,
      type: payload.type ?? null,
      refreshToken,
    };
  }
}
