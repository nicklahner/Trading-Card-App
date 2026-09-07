/**
 * Shared types for all provider interfaces.
 * Derived from DESIGN.md §3.4 and §5.3.
 */

// --- Image reference ---

export interface ImageRef {
  url: string;
  side: 'front' | 'back' | 'front_tilt' | 'label' | 'serial_closeup';
}

// --- Grading ---

export type Grader = 'PSA' | 'BGS' | 'SGC' | 'CGC' | 'TAG' | 'ACE' | 'OTHER';

/**
 * 'RAW' for ungraded, or `${Grader}:${grade}` for graded.
 * Examples: 'RAW', 'PSA:10', 'BGS:9.5', 'BGS:10B'
 */
export type GradeKey = string;

// --- Sales ---

export type SaleType =
  | 'auction'
  | 'fixed_price'
  | 'best_offer_accepted'
  | 'best_offer_unknown_price'
  | 'unknown';

export interface Sale {
  providerSaleId?: string;
  soldAt: Date;
  /** Price paid for the item, excluding shipping. Integer cents. */
  priceCents: number;
  buyerPremiumCents?: number;
  shippingCents?: number;
  saleType: SaleType;
  /** Normalized marketplace: 'ebay', 'fanatics_collect', etc. */
  marketplace: string;
  gradeKey: GradeKey;
  title?: string;
  url?: string;
}

// --- Parallels ---

export interface Parallel {
  id: string;
  name: string;
  printRun: number | null;
  /** 'variable' = per-player print runs (stat-line or jersey-number parallels). */
  printRunKind: 'fixed' | 'variable';
}

// --- Grade price table (SportsCardsPro) ---

export interface GradePriceTable {
  productId: string;
  productName: string;
  setName: string;
  salesVolumeYearly?: number;
  /** Keys: 'RAW', 'PSA:10', 'BGS:10', 'BGS:10B', 'CGC:10', 'CGC:10P', 'SGC:10', 'TAG:10', 'ACE:10', 'GRADED:1'..'GRADED:9.5' */
  prices: Partial<Record<string, number>>;
}

// --- Catalog ---

export interface ExternalRef {
  provider: string;
  id: string;
}

export interface CatalogQuery {
  year?: number;
  setName?: string;
  playerName?: string;
  cardNumber?: string;
  /** Free-text query string for providers that support it. */
  query?: string;
}

export interface CatalogCard {
  provider: string;
  cardId: string;
  playerName: string;
  year: number;
  setName: string;
  subsetOrInsert: string | null;
  cardNumber: string;
  isRookie: boolean;
  isAutograph: boolean;
  isMemorabilia: boolean;
  parallels: Parallel[];
  /** Provider-specific external references for this card's set. */
  setRef: ExternalRef;
  imageUrl?: string;
}

// --- Identification ---

export interface IdentifyCandidate {
  provider: string;
  cardId: string;
  parallelId: string | null;
  confidence: number;
  playerName: string;
  year: number;
  setName: string;
  subsetOrInsert: string | null;
  cardNumber: string;
  parallelName: string | null;
  isRookie: boolean;
  imageUrl?: string;
}

// --- Extraction (Claude Vision) ---

export interface Field<T> {
  value: T | null;
  confidence: number;
  evidence?: string;
}

export interface CardExtraction {
  kind: 'raw' | 'slab' | 'redemption' | 'not_a_card';
  players: Array<{ name: string; confidence: number; evidence: string }>;
  team: Field<string>;
  position: Field<string>;
  set_year: Field<number>;
  copyright_year: Field<number>;
  manufacturer: Field<string>;
  set_name: Field<string>;
  subset_or_insert: Field<string>;
  card_number: Field<string>;
  rookie_logo_printed: Field<boolean>;
  autograph: {
    present: boolean | null;
    type: 'on_card' | 'sticker' | 'facsimile' | 'unknown' | null;
    certification:
      | 'manufacturer_certified'
      | 'third_party_authenticated'
      | 'none_visible'
      | 'unknown';
    confidence: number;
  };
  memorabilia: Field<boolean>;
  serial: {
    printed: string | null;
    number: number | null;
    print_run: number | null;
    readable: 'yes' | 'partial' | 'no' | 'none_visible';
    confidence: number;
  };
  finish: {
    base_color: string | null;
    border_color: string | null;
    pattern:
      | 'none'
      | 'wave'
      | 'shimmer'
      | 'mojo'
      | 'scope'
      | 'cracked_ice'
      | 'disco'
      | 'pulsar'
      | 'other'
      | null;
    refractor_sheen_visible: 'yes' | 'no' | 'cannot_tell';
    parallel_name_printed: string | null;
    description: string;
  };
  slab: null | {
    grader: Grader;
    grade: number | null;
    grade_label: string | null;
    auto_grade: number | null;
    cert_number: string | null;
    subgrades: Record<string, number> | null;
    label_text: string;
  };
  photo_quality: {
    glare: 'none' | 'minor' | 'major';
    blur: 'none' | 'minor' | 'major';
    card_fully_in_frame: boolean;
    suggest_retake: Array<
      'front' | 'back' | 'serial_closeup' | 'tilt_shot' | 'label_closeup'
    >;
  };
  front_text: string[];
  back_text: string[];
}

// --- Cert lookup ---

export interface CertResult {
  grader: Grader;
  certNumber: string;
  grade: number;
  gradeLabel: string | null;
  autoGrade: number | null;
  year: number | null;
  setName: string | null;
  playerName: string | null;
  cardNumber: string | null;
  subjectDescription: string | null;
}

// --- Result wrappers ---

export type UnavailableReason =
  | 'rate_limited'
  | 'quota_exceeded'
  | 'timeout'
  | 'server_error'
  | 'invalid_payload';

export type CompsResult =
  | { status: 'ok'; sales: Sale[] }
  | { status: 'unavailable'; reason: UnavailableReason };

export type ModelPriceResult =
  | { status: 'ok'; table: GradePriceTable }
  | { status: 'unavailable'; reason: UnavailableReason };
