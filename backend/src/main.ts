import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { existsSync, mkdirSync } from 'fs';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // rawBody: true enables req.rawBody for Stripe webhook signature verification
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // ── Security headers ──────────────────────────────────────────────────────
  app.use(helmet());

  // ── Upload dirs (local fallback only — S3/R2 preferred in production) ─────
  for (const dir of ['uploads/avatars', 'uploads/images', 'uploads/videos']) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));

  // ── CORS ─────────────────────────────────────────────────────────────────
  const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3001').split(',').map((s) => s.trim());
  app.enableCors({ origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins, credentials: true });

  app.setGlobalPrefix('api');

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`NXQ Social API running on port ${port} [${process.env.NODE_ENV ?? 'development'}]`);
}
bootstrap();


