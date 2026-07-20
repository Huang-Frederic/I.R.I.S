/**
 * THE LIST — every shop, its info, and its associated extractor.
 *
 * Adding a shop = (1) create extractors/<shop>.ts, (2) add one line here.
 * You never touch core.ts, types.ts, or the other extractors.
 */
import type { Source } from './types';
import { loufoque } from './extractors/loufoque';
import { gentlemen } from './extractors/gentlemen';

export const SOURCES: Source[] = [
  {
    id: 'loufoque',
    name: 'Boutique Loufoque',
    city: 'Paris',
    url: 'https://shop.loufoque.fr/collections/tournois-pokemon',
    extract: loufoque,
  },
  {
    id: 'gentlemen',
    name: 'Les Gentlemen du Jeu',
    city: 'Paris',
    url: 'https://lesgentlemendujeu.com/104-evenements-pokemon',
    extract: gentlemen,
  },
];
