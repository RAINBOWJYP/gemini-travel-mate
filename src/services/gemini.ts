import {
  GoogleGenerativeAI,
  SchemaType,
  type ObjectSchema,
} from '@google/generative-ai';

import {
  SYSTEM_INSTRUCTIONS,
  USER_PROMPT_AUDIO,
  buildUserPromptText,
} from '../config/prompts';
import type { TranslationDirection, TranslationResult } from '../types/translation';

const translationJsonSchema: ObjectSchema = {
  type: SchemaType.OBJECT,
  properties: {
    original: {
      type: SchemaType.STRING,
      description: '음성 인식 또는 입력으로 확정한 원문',
    },
    translation: {
      type: SchemaType.STRING,
      description: '번역 결과만',
    },
  },
  required: ['original', 'translation'],
};

const getApiKey = (): string => {
  const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (typeof key === 'string' && key.trim().length > 0) {
    return key.trim();
  }
  return '';
};

const getModelName = (): string => {
  const fromEnv = process.env.EXPO_PUBLIC_GEMINI_MODEL;
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  // gemini-2.0-flash 는 신규 키에서 404 (미제공). 공식 권장: 2.5 Flash 이상
  return 'gemini-2.5-flash';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseTranslationJson = (raw: string): TranslationResult => {
  const trimmed = raw.trim();
  const parsed: unknown = JSON.parse(trimmed);
  if (!isRecord(parsed)) {
    throw new Error('번역 응답 형식이 올바르지 않습니다.');
  }
  const original = parsed['original'];
  const translation = parsed['translation'];
  if (typeof original !== 'string' || typeof translation !== 'string') {
    throw new Error('번역 응답 형식이 올바르지 않습니다.');
  }
  return {
    original: original.trim(),
    translation: translation.trim(),
  };
};

export const hasGeminiApiKey = (): boolean => getApiKey().length > 0;

export const translateFromAudio = async (
  direction: TranslationDirection,
  base64Audio: string,
  audioMimeType: string
): Promise<TranslationResult> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_GEMINI_API_KEY 가 설정되어 있지 않습니다.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: getModelName(),
    systemInstruction: SYSTEM_INSTRUCTIONS[direction],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: translationJsonSchema,
    },
  });

  try {
    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: USER_PROMPT_AUDIO },
            {
              inlineData: {
                mimeType: audioMimeType,
                data: base64Audio,
              },
            },
          ],
        },
      ],
    });

    const text = result.response.text();
    return parseTranslationJson(text);
  } catch (e) {
    console.error('[gemini][translateFromAudio]', { direction, audioMimeType, error: e });
    throw e;
  }
};

export const translateFromText = async (
  direction: TranslationDirection,
  text: string
): Promise<TranslationResult> => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_GEMINI_API_KEY 가 설정되어 있지 않습니다.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: getModelName(),
    systemInstruction: SYSTEM_INSTRUCTIONS[direction],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: translationJsonSchema,
    },
  });

  try {
    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildUserPromptText(text) }],
        },
      ],
    });

    const raw = result.response.text();
    return parseTranslationJson(raw);
  } catch (e) {
    console.error('[gemini][translateFromText]', { direction, error: e });
    throw e;
  }
};
