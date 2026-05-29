import { Injectable, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './auth.dto';

const SAFE_USER_SELECT = {
  id: true, email: true, username: true,
  role: true, verificationStatus: true, trustScore: true,
  createdAt: true, updatedAt: true,
  profile: { select: { displayName: true, bio: true, avatarUrl: true, bannerUrl: true, location: true, website: true } },
};

function flattenUser(user: any) {
  const { profile, ...base } = user;
  return { ...base, ...(profile ?? {}) };
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const requiredCode = process.env.BETA_INVITE_CODE;
    if (requiredCode && dto.inviteCode !== requiredCode) {
      throw new ForbiddenException('Invalid invite code — this is a closed beta');
    }

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) throw new ConflictException('Email or username already taken');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash,
        verificationStatus: 'BASIC',
        trustScore: 10,
        profile: { create: { displayName: dto.displayName } },
      },
      select: SAFE_USER_SELECT,
    });

    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { access_token: token, user: flattenUser(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { ...SAFE_USER_SELECT, passwordHash: true },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    const { passwordHash: _, ...rest } = user;
    return { access_token: token, user: flattenUser(rest) };
  }
}

