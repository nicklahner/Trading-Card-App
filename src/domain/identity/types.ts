/**
 * Domain types for card identity. Pure — no I/O.
 */

export interface PlayerInfo {
  name: string;
  team: string | null;
  position: string | null;
}

export type AutoType = 'on_card' | 'sticker' | 'cut' | 'unknown';

export type Licensed = 'nfl_licensed' | 'nflpa_only' | 'unlicensed' | 'unknown';

export interface CardIdentity {
  year: number;
  manufacturer: string;
  setName: string;
  subset: string | null;
  cardNumber: string;
  players: PlayerInfo[];
  parallel: string | null;
  printRun: number | null;
  isAuto: boolean;
  autoType: AutoType | null;
  isMemorabilia: boolean;
  isRookie: boolean;
  variation: string | null;
  licensed: Licensed;
}

/**
 * Build the identity key used to deduplicate cards.
 * Format: year|manufacturer|set|subset|card_no|player_slug|parallel_slug|print_run|auto|memo|variation
 */
export function buildIdentityKey(card: CardIdentity): string {
  const slug = (s: string | null): string =>
    (s ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const playerSlug = card.players
    .map((p) => slug(p.name))
    .sort()
    .join('+');

  return [
    card.year,
    slug(card.manufacturer),
    slug(card.setName),
    slug(card.subset),
    slug(card.cardNumber),
    playerSlug,
    slug(card.parallel),
    card.printRun ?? '',
    card.isAuto ? '1' : '0',
    card.isMemorabilia ? '1' : '0',
    slug(card.variation),
  ].join('|');
}
