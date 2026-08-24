import { Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { MailService } from './mail.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { TurnstileService } from './turnstile.service';

@Module({
  imports: [
    PassportModule,
    NotificationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<JwtSignOptions['expiresIn']>(
            'JWT_EXPIRES_IN',
            '7d',
          ),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy, MailService, TurnstileService],
  controllers: [AuthController],
  exports: [JwtModule, MailService],
})
export class AuthModule {}
