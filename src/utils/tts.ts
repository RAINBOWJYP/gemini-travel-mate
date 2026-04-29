import { setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import type { TranslationDirection } from '../types/translation';

const baseOptions = {
    rate: 0.92,
    pitch: 1,
};

/**
 * iOS: 녹음 세션이 켜져 있으면 TTS가 수화기로만 나갈 수 있음. 재생용 모드로 맞춘다.
 * Android: shouldRouteThroughEarpiece 로 본체 스피커 쪽.
 * iOS에서 여전히 수화기면 Speech 의 useApplicationAudioSession: false 가 추가 완충.
 */
const ensurePlaybackRoutesToMainSpeaker = async (): Promise<void> => {
    if (Platform.OS === 'web') {
        return;
    }
    await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
        shouldPlayInBackground: false,
        interruptionMode: 'mixWithOthers',
    });
};

/** 번역문: 中→한 이면 한국어, 한→中 이면 중국어(간체) */
export const speakTranslation = async (text: string, direction: TranslationDirection): Promise<void> => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
        return;
    }
    await ensurePlaybackRoutesToMainSpeaker();
    await Speech.stop();
    const language = direction === 'cn-ko' ? 'ko-KR' : 'zh-CN';
    Speech.speak(trimmed, {
        ...baseOptions,
        language,
        ...(Platform.OS === 'ios'
            ? {
                  useApplicationAudioSession: false,
              }
            : {}),
    });
};

export const stopSpeaking = async (): Promise<void> => {
    await Speech.stop();
};
