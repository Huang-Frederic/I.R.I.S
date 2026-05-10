export interface ScrapedCard {
  idProduct: number;
  setNumber: string;
  urlVariant: string | null;
  urlPath: string;
  name: string;
  /** S3 image-URL prefix (e.g. "BRS", "LOR"). Constant per expansion. */
  setPrefix: string | null;
}

export interface ScrapedExpansion {
  idExpansion: number;
  slug: string;
  name: string;
  cards: ScrapedCard[];
  /** Derived from the first card's image URL. Used to build S3 image URLs. */
  setPrefix: string | null;
}

export interface ExpansionInput {
  idExpansion: number;
  name: string;
  slug: string;
}

export interface ActorInput {
  expansions: ExpansionInput[];
  skipExisting?: boolean;
  concurrency?: number;
  perPage?: number;
}
