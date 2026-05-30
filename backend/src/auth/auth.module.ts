import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { MailService } from './mail.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') as string,
        signOptions: { expiresIn: configService.get('JWT_EXPIRES_IN', '7d') as any },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy, MailService],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}
