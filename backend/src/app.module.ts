import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StorageModule,
    ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', 'uploads'), serveRoot: '/uploads' }),
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
  ],
})
export class AppModule {}

