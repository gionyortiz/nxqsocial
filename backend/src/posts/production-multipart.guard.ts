import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { StorageService } from '../common/storage/storage.service';

@Injectable()
export class ProductionMultipartGuard implements CanActivate {
  constructor(private readonly storage: StorageService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const raw = request.headers?.['content-type'];
    const contentType = Array.isArray(raw) ? raw[0] : raw;
    if (
      !this.storage.localDiskFallbackAllowed &&
      contentType?.toLowerCase().startsWith('multipart/form-data')
    ) {
      throw new BadRequestException(
        'Production media uploads must use the direct upload flow',
      );
    }
    return true;
  }
}
