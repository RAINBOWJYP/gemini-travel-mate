import * as Speech from 'expo-speech';

import type { TranslationDirection } from '../types/translation';

const baseOptions = {
  rate: 0.92,
  pitch: 1,
};

/** 원문: 中→한 이면 중국어(간체), 한→中 이면 한국어 */
export const speakOriginal = async (
  text: string,
  direction: TranslationDirection
): Promise<void> => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return;
  }
  await Speech.stop();
  const language = direction === 'cn-ko' ? 'zh-CN' : 'ko-KR';
  Speech.speak(trimmed, {
    ...baseOptions,
    language,
  });
};

/** 번역문: 中→한 이면 한국어, 한→中 이면 중국어(간체) */
export const speakTranslation = async (
  text: string,
  direction: TranslationDirection
): Promise<void> => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return;
  }
  await Speech.stop();
  const language = direction === 'cn-ko' ? 'ko-KR' : 'zh-CN';
  Speech.speak(trimmed, {
    ...baseOptions,
    language,
  });
};

export const stopSpeaking = async (): Promise<void> => {
  await Speech.stop();
};
