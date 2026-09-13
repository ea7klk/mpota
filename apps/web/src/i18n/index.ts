import { de, deExtra } from './de';
import { en, enExtra } from './en';
import { es, esExtra } from './es';
import { fr, frExtra } from './fr';
import type { Locale, TranslationCatalog } from './types';

export const catalogs: Record<Locale, TranslationCatalog> = {
  en: { ...en, copy: { ...en.copy, ...enExtra } },
  es: { ...es, copy: { ...es.copy, ...esExtra } },
  fr: { ...fr, copy: { ...fr.copy, ...frExtra } },
  de: { ...de, copy: { ...de.copy, ...deExtra } }
};

export type { Locale, PolicyKind, TranslationCatalog } from './types';
