import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { TrustEngineService } from './trust-engine.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('trust')
@UseGuards(JwtAuthGuard)
export class TrustEngineController {
  constructor(private trustEngine: TrustEngineService) {}

  @Post('recalculate')
  async recalculateMine(@CurrentUser() user: any) {
    const score = await this.trustEngine.recalculate(user.id);
    return { trustScore: score, band: TrustEngineService.band(score) };
  }

  @Get('leaderboard')
  getLeaderboard() {
    return this.trustEngine.getLeaderboard();
  }
}

