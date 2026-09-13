export type Locale = 'en' | 'es' | 'fr' | 'de';
export type PolicyKind = 'conduct' | 'rules';

export type PolicySection = { title: string; paragraphs?: string[]; bullets?: string[] };
export type PolicyPageContent = { eyebrow: string; title: string; intro: string; sections: PolicySection[]; back: string };
export type TranslationCatalog = {
  copy: Record<string, string>;
  homeEligibility: { eyebrow: string; title: string; text: string };
  policies: { conduct: PolicyPageContent; rules: PolicyPageContent };
};
