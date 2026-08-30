export const COIN_PACKS = {
  starter: { code: 'starter', coins: 100, amountCents: 99, label: 'Starter' },
  sparkle: { code: 'sparkle', coins: 550, amountCents: 499, label: 'Sparkle' },
  creator: { code: 'creator', coins: 1200, amountCents: 999, label: 'Creator' },
  galaxy: { code: 'galaxy', coins: 6500, amountCents: 4999, label: 'Galaxy' },
} as const;

export const LIVE_GIFTS = {
  rose: { code: 'rose', emoji: '🌹', coins: 10, label: 'Rose' },
  applause: { code: 'applause', emoji: '👏', coins: 25, label: 'Applause' },
  star: { code: 'star', emoji: '⭐', coins: 50, label: 'Star' },
  rocket: { code: 'rocket', emoji: '🚀', coins: 100, label: 'Rocket' },
  diamond: { code: 'diamond', emoji: '💎', coins: 250, label: 'Diamond' },
  crown: { code: 'crown', emoji: '👑', coins: 500, label: 'Crown' },
} as const;

export type CoinPackCode = keyof typeof COIN_PACKS;
export type LiveGiftCode = keyof typeof LIVE_GIFTS;
