import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Like JwtAuthGuard, but never rejects — populates req.user when a valid token is present, leaves it null otherwise. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(_err: any, user: any) {
    return user || null;
  }
}
