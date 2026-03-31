export type TranslationDirection = 'cn-ko' | 'ko-cn';

export interface TranslationResult {
  original: string;
  translation: string;
}

export interface HistoryEntry {
  id: string;
  createdAt: number;
  direction: TranslationDirection;
  original: string;
  translation: string;
}
