import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

interface JwtPayload {
  sub: string;
  jti?: string;
  type?: string;
}

function extractJwtFromCookie(req: Request): string | null {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.refresh_token ?? null;
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

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    super({
      jwtFromRequest: (req: Request): string | null => {
        const extract = ExtractJwt.fromAuthHeaderAsBearerToken();
        const headerToken = extract(req);
        return headerToken ?? extractJwtFromCookie(req);
      },
      secretOrKey: refreshSecret,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload) {
    const cookies = req.cookies as Record<string, string> | undefined;
    const authHeader = req.headers.authorization;
    const refreshToken =
      authHeader?.split(' ')[1] ?? cookies?.refresh_token ?? null;

    return {
      userId: payload.sub,
      jti: payload.jti ?? null,
      type: payload.type ?? null,
      refreshToken,
    };
  }
}
