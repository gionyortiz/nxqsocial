import { Controller, Post, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { SafetyService } from './safety.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IsString, MaxLength } from 'class-validator';

class CheckTextDto {
  @IsString()
  @MaxLength(5000)
  text!: string;
}

@Controller('safety')
@UseGuards(JwtAuthGuard)
export class SafetyController {
  constructor(private safetyService: SafetyService) {}

  /** Quick synchronous scan — returns result without persisting */
  @Post('check')
  check(@Body() dto: CheckTextDto) {
    return this.safetyService.scan(dto.text);
  }

  /** Admin: pending safety flags */
  @Get('flags')
  getFlags() {
    return this.safetyService.getPendingFlags();
  }

  /** Admin: resolve a flag */
  @Patch('flags/:id/resolve')
  resolveFlag(@Param('id') id: string) {
    return this.safetyService.resolveFlag(id);
  }
}
