import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { existsSync, mkdirSync } from 'fs';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // rawBody: true enables req.rawBody for Stripe webhook signature verification
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.getHttpAdapter().getInstance().set('trust proxy', true);

  // ── Security headers ──────────────────────────────────────────────────────
  // crossOriginResourcePolicy must allow cross-origin so /uploads/* avatars
  // and media render on the frontend domain (different origin than the API).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // ── Upload dirs (local fallback only — S3/R2 preferred in production) ─────
  for (const dir of ['uploads/avatars', 'uploads/images', 'uploads/videos']) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));

  // ── CORS ─────────────────────────────────────────────────────────────────
  const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3001,http://localhost:8081')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins, credentials: true });

  app.setGlobalPrefix('api');

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`NXQ Social API running on port ${port} [${process.env.NODE_ENV ?? 'development'}]`);
}
bootstrap();


