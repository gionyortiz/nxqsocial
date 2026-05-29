import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ScanResult {
  safe: boolean;
  flags: Array<{ type: string; detail: string }>;
  riskScore: number; // 0-100
}

/**
 * Heuristic scam / link scanner.
 *
 * Checks for:
 *   - Known phishing keywords
 *   - Crypto / investment scam patterns
 *   - Fake giveaway / prize patterns
 *   - Suspicious URL shorteners
 *   - Repeated spam links
 *   - Urgency manipulation language
 *
 * Designed to run synchronously (no external API) so it never blocks
 * the request path. When you add an external provider (e.g. Google
 * Safe Browsing, VirusTotal), wrap it as an async enhancement step.
 */
@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);

  constructor(private prisma: PrismaService) {}

  // ── Pattern libraries ──────────────────────────────────────────────────────

  private readonly PHISHING_PATTERNS = [
    /verify[\s-]?your[\s-]?(account|wallet|identity|credentials)/i,
    /confirm[\s-]?your[\s-]?(password|login|email|identity)/i,
    /click[\s-]here[\s-]to[\s-]unlock/i,
    /your[\s-]account[\s-]has[\s-]been[\s-](suspended|locked|compromised)/i,
    /unusual[\s-]sign[\s-]in[\s-]activity/i,
    /billing[\s-]information[\s-]required/i,
    /lose[\s-]access/i,
    /urgent.*verify|verify.*urgent/i,
  ];

  private readonly CRYPTO_SCAM_PATTERNS = [
    /send\s+[\d.,]+\s*(btc|eth|usdt|sol|bnb|crypto|bitcoin|ethereum)/i,
    /double\s+your\s+(bitcoin|eth|crypto|money)/i,
    /guaranteed\s+\d+%\s+return/i,
    /invest\s+now\s+and\s+earn/i,
    /(crypto|bitcoin|btc|eth|ethereum)\s+giveaway/i,
    /elon\s+musk.*giveaway/i,
    /\bpump\b.*\bgroup\b/i,
    /passive\s+income.*crypto/i,
    /\d+x\s+(back|returns?|profit)/i,
    /get\s+(rich|wealthy)\s+quick/i,
  ];

  private readonly FAKE_GIVEAWAY_PATTERNS = [
    /you[\s']+ve?\s+been\s+(selected|chosen|picked)/i,
    /congratulations.*winner/i,
    /claim\s+your\s+prize/i,
    /free\s+iphone/i,
    /free\s+gift\s+card/i,
    /limited[\s-]time\s+offer.*click/i,
    /you\s+have\s+won/i,
  ];

  private readonly SUSPICIOUS_SHORTENERS = [
    'bit.ly', 'tinyurl.com', 'ow.ly', 't.co', 'goo.gl',
    'rebrand.ly', 'tiny.cc', 'cutt.ly', 'rb.gy', 'short.io',
  ];

  private readonly SPAM_LINK_PATTERNS = [
    /https?:\/\/\S+\.(xyz|top|click|bid|win|stream|download)\b/i,
    /earn\s+\$\d+\s+per\s+(day|week|hour)/i,
  ];

  private readonly URGENCY_PATTERNS = [
    /\burgent\b/i,
    /act\s+now/i,
    /expires\s+in\s+\d+\s+(hour|minute|second)/i,
    /last\s+chance/i,
    /limited\s+spots?\s+remaining/i,
    /don'?t\s+(miss|wait|delay)/i,
  ];

  // ── Core scan method ───────────────────────────────────────────────────────

  scan(text: string): ScanResult {
    const flags: Array<{ type: string; detail: string }> = [];

    for (const pattern of this.PHISHING_PATTERNS) {
      if (pattern.test(text)) flags.push({ type: 'phishing', detail: pattern.source });
    }
    for (const pattern of this.CRYPTO_SCAM_PATTERNS) {
      if (pattern.test(text)) flags.push({ type: 'crypto_scam', detail: pattern.source });
    }
    for (const pattern of this.FAKE_GIVEAWAY_PATTERNS) {
      if (pattern.test(text)) flags.push({ type: 'fake_giveaway', detail: pattern.source });
    }
    for (const pattern of this.SPAM_LINK_PATTERNS) {
      if (pattern.test(text)) flags.push({ type: 'spam_link', detail: pattern.source });
    }
    for (const pattern of this.URGENCY_PATTERNS) {
      if (pattern.test(text)) flags.push({ type: 'urgency_manipulation', detail: pattern.source });
    }

    // Check for suspicious URL shorteners (with or without https:// prefix)
    for (const shortener of this.SUSPICIOUS_SHORTENERS) {
      if (text.toLowerCase().includes(shortener)) {
        const urlMatch = text.match(new RegExp(`https?:\\/\\/${shortener.replace('.', '\\.')}\\S*`, 'i'))
          ?? text.match(new RegExp(`\\b${shortener.replace('.', '\\.')}\\S*`, 'i'));
        if (urlMatch) {
          flags.push({ type: 'suspicious_url', detail: urlMatch[0] });
        }
      }
    }

    const riskScore = Math.min(100, flags.length * 25);

    return {
      safe: flags.length === 0,
      flags,
      riskScore,
    };
  }

  /** Scan and persist a safety flag if content is unsafe */
  async scanAndPersist(entityType: 'post' | 'comment', entityId: string, text: string): Promise<ScanResult> {
    const result = this.scan(text);

    if (!result.safe) {
      this.logger.warn(`Safety flag on ${entityType}:${entityId} — ${result.flags.map((f) => f.type).join(', ')}`);
      await this.prisma.safetyFlag.createMany({
        data: result.flags.map((f) => ({
          entityType,
          entityId,
          flagType: f.type,
          detail: f.detail,
        })),
        skipDuplicates: true,
      });
    }

    return result;
  }

  /** Admin: get unresolved safety flags */
  async getPendingFlags(take = 100) {
    return this.prisma.safetyFlag.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async resolveFlag(flagId: string) {
    return this.prisma.safetyFlag.update({
      where: { id: flagId },
      data: { resolvedAt: new Date() },
    });
  }
}
