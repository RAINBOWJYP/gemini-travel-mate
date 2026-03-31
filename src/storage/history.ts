import AsyncStorage from '@react-native-async-storage/async-storage';

import type { HistoryEntry } from '../types/translation';

const STORAGE_KEY = 'cn_ko_translation_history_v1';
const MAX_ENTRIES = 80;

const sortByNewestFirst = (entries: HistoryEntry[]): HistoryEntry[] =>
  [...entries].sort((a, b) => b.createdAt - a.createdAt);

const isHistoryEntry = (value: unknown): value is HistoryEntry => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const id = Reflect.get(value, 'id');
  const createdAt = Reflect.get(value, 'createdAt');
  const direction = Reflect.get(value, 'direction');
  const original = Reflect.get(value, 'original');
  const translation = Reflect.get(value, 'translation');
  if (typeof id !== 'string' || typeof createdAt !== 'number') {
    return false;
  }
  if (typeof original !== 'string' || typeof translation !== 'string') {
    return false;
  }
  return direction === 'cn-ko' || direction === 'ko-cn';
};

export const loadHistory = async (): Promise<HistoryEntry[]> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const entries: HistoryEntry[] = [];
    for (const item of parsed) {
      if (isHistoryEntry(item)) {
        entries.push(item);
      }
    }
    return sortByNewestFirst(entries);
  } catch {
    return [];
  }
};

export const appendHistory = async (entry: HistoryEntry): Promise<void> => {
  const current = await loadHistory();
  const next = sortByNewestFirst([entry, ...current]).slice(0, MAX_ENTRIES);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};

export const clearHistory = async (): Promise<void> => {
  await AsyncStorage.removeItem(STORAGE_KEY);
};
