import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyticsService } from '../analytics/analytics.service';
import { AiAssistantMode, AiCaptionAssistDto, AiCommentAssistDto } from './ai.dto';

export interface AiAssistResponse {
  suggestion: string;
  safetyFlags: string[];
  tokensUsed: number;
  blocked: boolean;
  assistant: 'caption' | 'comment';
  mode: AiAssistantMode;
}

function envBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function envNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s([,.!?;:])/g, '$1')
    .trim();
}

function capSentence(text: string): string {
  const normalized = normalizeText(text);
  if (!normalized) return normalized;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function truncateWords(text: string, maxWords: number): string {
  const words = normalizeText(text).split(' ').filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}…`;
}

function stripEmojisAndExcessPunctuation(text: string): string {
  return normalizeText(text)
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[!?]{2,}/g, '!')
    .replace(/\.{3,}/g, '.')
    .trim();
}

function hashBucket(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
}

function safetyFlagsFor(text: string): string[] {
  const lowered = text.toLowerCase();
  const flags: string[] = [];
  if (/(spam|buy now|free money|click here|guaranteed profit|cheap followers)/i.test(lowered)) flags.push('spam');
  if (/(scam|phishing|wallet|crypto|token|airdrop)/i.test(lowered)) flags.push('scam');
  if (/(hate|slur|kill yourself|attack|harass)/i.test(lowered)) flags.push('harassment');
  if (/(nude|sex|explicit|minor|csam)/i.test(lowered)) flags.push('sexual_content');
  if (/(bomb|weapon|poison|suicide|self-harm|instructions? to)/i.test(lowered)) flags.push('dangerous');
  if (/(phone number|email address|home address|ssn|social security)/i.test(lowered)) flags.push('personal_info');
  return Array.from(new Set(flags));
}

function hashtagify(text: string): string {
  const terms = normalizeText(text)
    .split(/[^a-zA-Z0-9]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3)
    .slice(0, 5)
    .map((term) => `#${term.replace(/[^a-zA-Z0-9]/g, '')}`);
  return terms.length ? terms.join(' ') : '#NXQ #Social';
}

@Injectable()
export class AiService {
  constructor(
    private readonly config: ConfigService,
    private readonly analytics: AnalyticsService,
  ) {}

  private isEnabledForUser(userId: string): boolean {
    const enabled = envBool(this.config.get('AI_ASSISTANT_ENABLED', 'false'));
    if (!enabled) return false;

    const rollout = Math.max(0, Math.min(100, envNumber(this.config.get('AI_ASSISTANT_ROLLOUT_PERCENT', '100'), 100)));
    if (rollout === 100) return true;
    if (rollout === 0) return false;
    return hashBucket(userId) < rollout;
  }

  private ensureEnabled(userId: string) {
    if (!this.isEnabledForUser(userId)) {
      throw new NotFoundException('AI Assistant is not enabled for this account yet.');
    }
  }

  private blockedResponse(assistant: 'caption' | 'comment', mode: AiAssistantMode, text: string, safetyFlags: string[]): AiAssistResponse {
    return {
      suggestion: '',
      safetyFlags,
      tokensUsed: Math.max(1, Math.ceil(text.length / 4)),
      blocked: true,
      assistant,
      mode,
    };
  }

  private async trackGenerated(userId: string, assistant: 'caption' | 'comment', mode: AiAssistantMode, safetyFlags: string[]) {
    await this.analytics.track({
      name: 'ai_assist_generated',
      properties: { assistant, mode, safetyFlags },
    }, userId);
  }

  private buildCaptionSuggestion(dto: AiCaptionAssistDto, mode: Extract<AiAssistantMode, 'improve' | 'shorten' | 'funny' | 'professional' | 'hashtags' | 'translate'>): string {
    const text = normalizeText(dto.text);
    switch (mode) {
      case 'improve':
        return capSentence(text);
      case 'shorten':
        return truncateWords(text, 18);
      case 'funny':
        return text ? `${capSentence(text)} 😄` : 'Keep it playful and punchy 😄';
      case 'professional':
        return stripEmojisAndExcessPunctuation(capSentence(text));
      case 'hashtags':
        return hashtagify(text);
      case 'translate':
        return dto.language ? `[Translate to ${dto.language}] ${text}` : `[Translate] ${text}`;
    }
  }

  private buildCommentSuggestion(dto: AiCommentAssistDto, mode: Extract<AiAssistantMode, 'reply_friendly' | 'reply_funny' | 'reply_professional'>): string {
    const text = normalizeText(dto.text);
    switch (mode) {
      case 'reply_friendly':
        return text ? `${capSentence(text)} — thanks for sharing!` : 'Thanks for sharing!';
      case 'reply_funny':
        return text ? `${capSentence(text)} — that made my day 😄` : 'That made my day 😄';
      case 'reply_professional':
        return stripEmojisAndExcessPunctuation(capSentence(text));
    }
  }

  async caption(userId: string, mode: AiAssistantMode, dto: AiCaptionAssistDto): Promise<AiAssistResponse> {
    this.ensureEnabled(userId);
    const safetyFlags = safetyFlagsFor(dto.text);
    if (safetyFlags.length) {
      return this.blockedResponse('caption', mode, dto.text, safetyFlags);
    }

    const suggestion = this.buildCaptionSuggestion(dto, mode as any);
    await this.trackGenerated(userId, 'caption', mode, safetyFlags);
    return {
      suggestion,
      safetyFlags,
      tokensUsed: Math.max(1, Math.ceil((dto.text.length + (dto.context?.length ?? 0)) / 4)),
      blocked: false,
      assistant: 'caption',
      mode,
    };
  }

  async comment(userId: string, mode: AiAssistantMode, dto: AiCommentAssistDto): Promise<AiAssistResponse> {
    this.ensureEnabled(userId);
    const safetyFlags = safetyFlagsFor(dto.text);
    if (safetyFlags.length) {
      return this.blockedResponse('comment', mode, dto.text, safetyFlags);
    }

    const suggestion = this.buildCommentSuggestion(dto, mode as any);
    await this.trackGenerated(userId, 'comment', mode, safetyFlags);
    return {
      suggestion,
      safetyFlags,
      tokensUsed: Math.max(1, Math.ceil((dto.text.length + (dto.postContext?.length ?? 0)) / 4)),
      blocked: false,
      assistant: 'comment',
      mode,
    };
  }
}
