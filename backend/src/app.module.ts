import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PostsModule } from './posts/posts.module';
import { LikesModule } from './likes/likes.module';
import { CommentsModule } from './comments/comments.module';
import { FollowsModule } from './follows/follows.module';
import { VerificationModule } from './verification/verification.module';
import { TrustEngineModule } from './trust-engine/trust-engine.module';
import { ReportsModule } from './reports/reports.module';
import { SafetyModule } from './safety/safety.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';
import { StorageModule } from './common/storage/storage.module';
import { MediaModule } from './media/media.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { CallsModule } from './calls/calls.module';
import { LiveModule } from './live/live.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { FeedbackModule } from './feedback/feedback.module';
import { FeedModule } from './feed/feed.module';
import { NotificationFeedModule } from './notification-feed/notification-feed.module';
import { AiModule } from './ai/ai.module';
import { MessagesModule } from './messages/messages.module';
import { getClientIpFromRequest } from './common/network/client-ip';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate-limit storage for auth endpoints (applied per-route in AuthController).
    // Skipped under tests so e2e suites can register/login freely.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60000, limit: 60 }],
      skipIf: () => process.env.NODE_ENV === 'test',
      getTracker: (req) => getClientIpFromRequest(req),
      errorMessage: 'Too many attempts. Please wait a minute and try again.',
    }),
    StorageModule,
    ServeStaticModule.forRoot({
      // Serve from <cwd>/uploads so this matches where multer disk storage
      // writes (`./uploads/avatars`) regardless of where compiled JS lives.
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: {
        setHeaders: (res) => {
          // Allow cross-origin <img>/<video> loads from the frontend domain.
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      },
    }),
    RedisModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    PostsModule,
    LikesModule,
    CommentsModule,
    FollowsModule,
    VerificationModule,
    TrustEngineModule,
    ReportsModule,
    SafetyModule,
    NotificationsModule,
    AuditModule,
    MediaModule,
    AdminModule,
    HealthModule,
    CallsModule,
    LiveModule,
    AnalyticsModule,
    AiModule,
    FeedbackModule,
    FeedModule,
    NotificationFeedModule,
    MessagesModule,
  ],
})
export class AppModule {}

