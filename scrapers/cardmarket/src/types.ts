export interface ScrapedCard {
  idProduct: number;
  setNumber: string;
  urlVariant: string | null;
  urlPath: string;
  name: string;
}

export interface ScrapedExpansion {
  idExpansion: number;
  slug: string;
  name: string;
  cards: ScrapedCard[];
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
