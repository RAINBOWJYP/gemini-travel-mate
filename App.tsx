import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    LayoutChangeEvent,
    Platform,
    Pressable,
    ScrollView,
    StatusBar as RNStatusBar,
    StyleSheet,
    Text,
    TextInput,
    useWindowDimensions,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { DuckMascot } from './src/components/DuckMascot';
import { RecordingWaveform } from './src/components/RecordingWaveform';
import { hasGeminiApiKey, translateFromAudio, translateFromText } from './src/services/gemini';
import { appendHistory, clearHistory, loadHistory } from './src/storage/history';
import type { HistoryEntry, TranslationDirection } from './src/types/translation';
import { WAVEFORM_BAR_COUNT, createInitialWaveformLevels, meteringToLevel } from './src/utils/audioMetering';
import { logUserFacingError } from './src/utils/reportError';
import { speakOriginal, speakTranslation, stopSpeaking } from './src/utils/tts';

const generateId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;

const directionLabel = (d: TranslationDirection): string => (d === 'cn-ko' ? '中 → 한' : '한 → 中');

const getRecordingMimeType = (): string => {
    if (Platform.OS === 'web') {
        return 'audio/webm';
    }
    return 'audio/aac';
};

const isAudioSupported = (): boolean => Platform.OS !== 'web';

export default function App() {
    const [direction, setDirection] = useState<TranslationDirection>('cn-ko');
    const [textInput, setTextInput] = useState('');
    const [latest, setLatest] = useState<HistoryEntry | null>(null);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [voiceProcessing, setVoiceProcessing] = useState(false);
    const [textProcessing, setTextProcessing] = useState(false);
    const [recording, setRecording] = useState(false);
    const [waveformLevels, setWaveformLevels] = useState<number[]>(() => createInitialWaveformLevels());
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const recordingRef = useRef<Audio.Recording | null>(null);
    const { height: windowHeight } = useWindowDimensions();
    const scrollRef = useRef<ScrollView>(null);
    const textInputRectRef = useRef<{ y: number; height: number }>({ y: 0, height: 0 });
    const scrollViewportHeightRef = useRef(0);

    const handleScrollViewLayout = useCallback((event: LayoutChangeEvent) => {
        scrollViewportHeightRef.current = event.nativeEvent.layout.height;
    }, []);

    const handleTextInputRowLayout = useCallback((event: LayoutChangeEvent) => {
        const { y, height } = event.nativeEvent.layout;
        textInputRectRef.current = { y, height };
    }, []);

    const scrollTextInputIntoView = useCallback(() => {
        const { y, height } = textInputRectRef.current;
        const measuredViewport = scrollViewportHeightRef.current;
        const viewportH =
            measuredViewport > 0 ? measuredViewport : Math.max(280, windowHeight * 0.55);
        const targetY = y + height / 2 - viewportH / 2;
        const scroll = (): void => {
            scrollRef.current?.scrollTo({
                y: Math.max(0, targetY),
                animated: true,
            });
        };
        requestAnimationFrame(scroll);
        setTimeout(scroll, 120);
        setTimeout(scroll, 320);
    }, [windowHeight]);

    const refreshHistory = useCallback(async () => {
        const items = await loadHistory();
        setHistory(items);
    }, []);

    useEffect(() => {
        void refreshHistory();
    }, [refreshHistory]);

    useEffect(() => {
        return () => {
            void stopSpeaking();
        };
    }, []);

    const handleAppendResult = useCallback(
        async (entry: HistoryEntry) => {
            setLatest(entry);
            await appendHistory(entry);
            await refreshHistory();
        },
        [refreshHistory],
    );

    const handleTranslateText = useCallback(async () => {
        setErrorMessage(null);
        if (!hasGeminiApiKey()) {
            const msg = '.env 에 EXPO_PUBLIC_GEMINI_API_KEY 를 설정해 주세요.';
            logUserFacingError('config', msg);
            setErrorMessage(msg);
            return;
        }
        const trimmed = textInput.trim();
        if (trimmed.length === 0) {
            const msg = '번역할 문장을 입력해 주세요.';
            logUserFacingError('translateText', msg);
            setErrorMessage(msg);
            return;
        }
        setTextProcessing(true);
        try {
            const result = await translateFromText(direction, trimmed);
            await handleAppendResult({
                id: generateId(),
                createdAt: Date.now(),
                direction,
                original: result.original,
                translation: result.translation,
            });
            setTextInput('');
        } catch (e) {
            const message = e instanceof Error ? e.message : '번역에 실패했습니다.';
            logUserFacingError('translateText', message, e);
            setErrorMessage(message);
        } finally {
            setTextProcessing(false);
        }
    }, [direction, textInput, handleAppendResult]);

    const handleStartRecording = useCallback(async () => {
        setErrorMessage(null);
        if (!isAudioSupported()) {
            const msg = '웹에서는 텍스트 번역만 지원합니다.';
            logUserFacingError('audio', msg);
            setErrorMessage(msg);
            return;
        }
        if (!hasGeminiApiKey()) {
            const msg = '.env 에 EXPO_PUBLIC_GEMINI_API_KEY 를 설정해 주세요.';
            logUserFacingError('config', msg);
            setErrorMessage(msg);
            return;
        }
        if (recordingRef.current !== null) {
            return;
        }
        try {
            const perm = await Audio.requestPermissionsAsync();
            if (perm.status !== 'granted') {
                const msg = '마이크 권한이 필요합니다.';
                logUserFacingError('record', msg);
                setErrorMessage(msg);
                return;
            }
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: true,
                playsInSilentModeIOS: true,
            });
            setWaveformLevels(createInitialWaveformLevels());
            const { recording: rec } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY,
                (status) => {
                    if (!status.isRecording) {
                        return;
                    }
                    const level = meteringToLevel(status.metering);
                    setWaveformLevels((prev) => {
                        if (prev.length !== WAVEFORM_BAR_COUNT) {
                            return createInitialWaveformLevels();
                        }
                        return [...prev.slice(1), level];
                    });
                },
                80,
            );
            recordingRef.current = rec;
            setRecording(true);
        } catch (e) {
            const message = e instanceof Error ? e.message : '녹음을 시작할 수 없습니다.';
            logUserFacingError('record', message, e);
            setErrorMessage(message);
        }
    }, []);

    const handleStopRecording = useCallback(async () => {
        const rec = recordingRef.current;
        if (rec === null) {
            return;
        }
        setRecording(false);
        setWaveformLevels(createInitialWaveformLevels());
        recordingRef.current = null;
        setVoiceProcessing(true);
        setErrorMessage(null);
        try {
            await rec.stopAndUnloadAsync();
            const uri = rec.getURI();
            if (uri === null) {
                throw new Error('녹음 파일을 읽을 수 없습니다.');
            }
            const base64 = await FileSystem.readAsStringAsync(uri, {
                encoding: 'base64',
            });
            const mime = getRecordingMimeType();
            const result = await translateFromAudio(direction, base64, mime);
            await handleAppendResult({
                id: generateId(),
                createdAt: Date.now(),
                direction,
                original: result.original,
                translation: result.translation,
            });
        } catch (e) {
            const message = e instanceof Error ? e.message : '음성 번역에 실패했습니다.';
            logUserFacingError('voiceTranslate', message, e);
            setErrorMessage(message);
        } finally {
            setVoiceProcessing(false);
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                playsInSilentModeIOS: true,
            });
        }
    }, [direction, handleAppendResult]);

    const handlePressRecordToggle = useCallback(() => {
        if (recording) {
            void handleStopRecording();
        } else {
            void handleStartRecording();
        }
    }, [recording, handleStartRecording, handleStopRecording]);

    const handleClearHistory = useCallback(() => {
        Alert.alert('히스토리 삭제', '모든 기록을 지울까요?', [
            { text: '취소', style: 'cancel' },
            {
                text: '삭제',
                style: 'destructive',
                onPress: () => {
                    void (async () => {
                        await clearHistory();
                        setLatest(null);
                        await refreshHistory();
                    })();
                },
            },
        ]);
    }, [refreshHistory]);

    const handleSelectDirectionCnKo = useCallback(() => {
        setDirection('cn-ko');
    }, []);

    const handleSelectDirectionKoCn = useCallback(() => {
        setDirection('ko-cn');
    }, []);

    const handleSpeakOriginalPress = useCallback(() => {
        if (latest === null) {
            return;
        }
        void (async () => {
            try {
                await speakOriginal(latest.original, latest.direction);
            } catch (e) {
                const message = e instanceof Error ? e.message : '음성 재생에 실패했습니다.';
                logUserFacingError('tts', message, e);
                setErrorMessage(message);
            }
        })();
    }, [latest]);

    const handleSpeakTranslationPress = useCallback(() => {
        if (latest === null) {
            return;
        }
        void (async () => {
            try {
                await speakTranslation(latest.translation, latest.direction);
            } catch (e) {
                const message = e instanceof Error ? e.message : '음성 재생에 실패했습니다.';
                logUserFacingError('tts', message, e);
                setErrorMessage(message);
            }
        })();
    }, [latest]);

    const handleStopSpeakingPress = useCallback(() => {
        void stopSpeaking();
    }, []);

    const keyboardVerticalOffset =
        Platform.OS === 'ios' ? 56 : (RNStatusBar.currentHeight ?? 0);

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={keyboardVerticalOffset}
        >
            <StatusBar style="dark" />
            <ScrollView
                ref={scrollRef}
                onLayout={handleScrollViewLayout}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
            >
                <DuckMascot />
                <Text style={styles.title}>더기</Text>
                <Text style={styles.tagline}>덕이~ 더기~ · duck + 이 · 중한 통역</Text>
                <View style={styles.badgeRow}>
                    <Text style={styles.badge}>Gemini</Text>
                    <Text style={styles.badgeHint}>iOS/Android 음성</Text>
                </View>

                <View style={styles.segment}>
                    <Pressable
                        onPress={handleSelectDirectionCnKo}
                        style={[styles.segmentBtn, direction === 'cn-ko' && styles.segmentBtnActive]}
                        accessibilityRole="button"
                        accessibilityLabel="중국어를 한국어로 번역"
                    >
                        <View style={styles.segmentInner}>
                            <Ionicons
                                name="arrow-forward-circle-outline"
                                size={20}
                                color={direction === 'cn-ko' ? '#b45309' : '#94a3b8'}
                            />
                            <Text style={[styles.segmentText, direction === 'cn-ko' && styles.segmentTextActive]}>
                                中 → 한
                            </Text>
                        </View>
                    </Pressable>
                    <Pressable
                        onPress={handleSelectDirectionKoCn}
                        style={[styles.segmentBtn, direction === 'ko-cn' && styles.segmentBtnActive]}
                        accessibilityRole="button"
                        accessibilityLabel="한국어를 중국어로 번역"
                    >
                        <View style={styles.segmentInner}>
                            <Ionicons
                                name="arrow-back-circle-outline"
                                size={20}
                                color={direction === 'ko-cn' ? '#b45309' : '#94a3b8'}
                            />
                            <Text style={[styles.segmentText, direction === 'ko-cn' && styles.segmentTextActive]}>
                                한 → 中
                            </Text>
                        </View>
                    </Pressable>
                </View>

                {latest !== null && (
                    <View style={styles.resultCard}>
                        <View style={styles.resultCardHeader}>
                            <Ionicons name="sparkles-outline" size={18} color="#f59e0b" />
                            <Text style={styles.resultLabel}>방금 번역</Text>
                        </View>
                        <Text style={styles.resultMain}>{latest.translation}</Text>
                        <Text style={styles.resultSub}>원문 · {latest.original}</Text>
                        <View style={styles.resultTtsRow}>
                            <Pressable
                                onPress={handleSpeakOriginalPress}
                                style={({ pressed }) => [styles.ttsIconBtn, styles.ttsIconBtnPrimary, pressed && styles.pressed]}
                                accessibilityRole="button"
                                accessibilityLabel={
                                    latest.direction === 'cn-ko' ? '원문 중국어 듣기' : '원문 한국어 듣기'
                                }
                            >
                                <Ionicons name="volume-medium" size={22} color="#fff" />
                            </Pressable>
                            <Pressable
                                onPress={handleSpeakTranslationPress}
                                style={({ pressed }) => [
                                    styles.ttsIconBtn,
                                    styles.ttsIconBtnSecondary,
                                    pressed && styles.pressed,
                                ]}
                                accessibilityRole="button"
                                accessibilityLabel={
                                    latest.direction === 'cn-ko' ? '번역 한국어 듣기' : '번역 중국어 듣기'
                                }
                            >
                                <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
                            </Pressable>
                            <Pressable
                                onPress={handleStopSpeakingPress}
                                style={({ pressed }) => [styles.ttsIconBtn, styles.ttsIconBtnGhost, pressed && styles.pressed]}
                                accessibilityRole="button"
                                accessibilityLabel="재생 중지"
                            >
                                <Ionicons name="stop-circle-outline" size={24} color="#64748b" />
                            </Pressable>
                        </View>
                        <Text style={styles.ttsHint}>왼쪽 원문 · 가운데 번역 · 오른쪽 정지</Text>
                    </View>
                )}

                <View style={styles.sectionRow}>
                    <Ionicons name="mic-outline" size={18} color="#f59e0b" />
                    <Text style={styles.sectionTitleInline}>말로 하기</Text>
                </View>
                <View style={styles.voiceRow}>
                    <Pressable
                        onPress={handlePressRecordToggle}
                        style={[
                            styles.micFab,
                            recording && styles.micFabActive,
                            !isAudioSupported() && styles.micFabDisabled,
                        ]}
                        disabled={voiceProcessing || textProcessing || !isAudioSupported()}
                        accessibilityRole="button"
                        accessibilityLabel={recording ? '녹음 종료' : '녹음 시작'}
                    >
                        {voiceProcessing && !recording ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Ionicons
                                name={!isAudioSupported() ? 'mic-off-outline' : recording ? 'stop' : 'mic'}
                                size={30}
                                color="#fff"
                            />
                        )}
                    </Pressable>
                    {recording && isAudioSupported() && (
                        <RecordingWaveform levels={waveformLevels} compact />
                    )}
                </View>
                {!recording && isAudioSupported() && (
                    <Text style={styles.voiceHint}>노란 버튼 탭 → 말하고 → 다시 탭</Text>
                )}

                <View style={styles.sectionRow}>
                    <Ionicons name="create-outline" size={18} color="#0ea5e9" />
                    <Text style={styles.sectionTitleInline}>글로 하기</Text>
                </View>
                <View onLayout={handleTextInputRowLayout} style={styles.textInputSection}>
                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.inputFlex}
                            value={textInput}
                            onChangeText={setTextInput}
                            placeholder={direction === 'cn-ko' ? '중국어 입력…' : '한국어 입력…'}
                            placeholderTextColor="#94a3b8"
                            multiline
                            editable={!textProcessing && !voiceProcessing}
                            onFocus={scrollTextInputIntoView}
                        />
                    <Pressable
                        onPress={handleTranslateText}
                        style={[styles.sendFab, textProcessing && styles.sendFabDisabled]}
                        disabled={textProcessing || voiceProcessing}
                        accessibilityRole="button"
                        accessibilityLabel="번역 보내기"
                    >
                        {textProcessing ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Ionicons name="send" size={22} color="#fff" />
                        )}
                    </Pressable>
                    </View>
                </View>

                {errorMessage !== null && <Text style={styles.error}>{errorMessage}</Text>}

                <View style={styles.historyHeader}>
                    <View style={styles.sectionRow}>
                        <Ionicons name="time-outline" size={18} color="#64748b" />
                        <Text style={styles.sectionTitleInline}>히스토리</Text>
                    </View>
                    {history.length > 0 && (
                        <Pressable onPress={handleClearHistory} style={styles.trashBtn} accessibilityRole="button">
                            <Ionicons name="trash-outline" size={22} color="#ef4444" />
                        </Pressable>
                    )}
                </View>

                {history.length === 0 ? (
                    <Text style={styles.empty}>아직 기록이 없어요 🌱</Text>
                ) : (
                    history.map((item) => (
                        <View key={item.id} style={styles.historyItem}>
                            <Text style={styles.historyMeta}>
                                {directionLabel(item.direction)} · {new Date(item.createdAt).toLocaleString('ko-KR')}
                            </Text>
                            <Text style={styles.historyTranslation}>{item.translation}</Text>
                            <Text style={styles.historyOriginal}>{item.original}</Text>
                        </View>
                    ))
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#fffdf7',
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 56 : 40,
        paddingBottom: 36,
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: '#1e293b',
        textAlign: 'center',
        marginBottom: 6,
        letterSpacing: -0.5,
    },
    tagline: {
        fontSize: 14,
        color: '#78716c',
        textAlign: 'center',
        marginBottom: 10,
        lineHeight: 20,
    },
    badgeRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginBottom: 18,
    },
    badge: {
        backgroundColor: '#fef3c7',
        color: '#b45309',
        fontSize: 11,
        fontWeight: '700',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        overflow: 'hidden',
    },
    badgeHint: {
        fontSize: 12,
        color: '#a8a29e',
    },
    segment: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 5,
        marginBottom: 18,
        borderWidth: 1,
        borderColor: '#fde68a',
        shadowColor: '#f59e0b',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    segmentBtn: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 12,
    },
    segmentInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    segmentBtnActive: {
        backgroundColor: '#fffbeb',
    },
    segmentText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#94a3b8',
    },
    segmentTextActive: {
        color: '#b45309',
    },
    resultCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 16,
        marginBottom: 18,
        borderWidth: 1,
        borderColor: '#e7e5e4',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 3,
    },
    resultCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    resultLabel: {
        fontSize: 13,
        color: '#78716c',
        fontWeight: '600',
    },
    resultMain: {
        fontSize: 21,
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: 10,
        lineHeight: 28,
    },
    resultSub: {
        fontSize: 14,
        color: '#57534e',
        lineHeight: 20,
        marginBottom: 12,
    },
    resultTtsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 4,
    },
    ttsIconBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ttsIconBtnPrimary: {
        backgroundColor: '#f59e0b',
    },
    ttsIconBtnSecondary: {
        backgroundColor: '#0ea5e9',
    },
    ttsIconBtnGhost: {
        backgroundColor: '#f5f5f4',
    },
    pressed: {
        opacity: 0.85,
    },
    ttsHint: {
        fontSize: 11,
        color: '#a8a29e',
        marginTop: 8,
        textAlign: 'center',
    },
    sectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    sectionTitleInline: {
        fontSize: 15,
        fontWeight: '700',
        color: '#44403c',
    },
    voiceRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: 12,
        marginBottom: 8,
    },
    micFab: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#f59e0b',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#f59e0b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 6,
    },
    micFabActive: {
        backgroundColor: '#ef4444',
        shadowColor: '#ef4444',
    },
    micFabDisabled: {
        backgroundColor: '#d6d3d1',
        shadowOpacity: 0,
    },
    voiceHint: {
        fontSize: 12,
        color: '#a8a29e',
        marginBottom: 18,
        marginLeft: 2,
    },
    textInputSection: {
        marginBottom: 0,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 10,
        marginBottom: 16,
    },
    inputFlex: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e7e5e4',
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 16,
        minHeight: 88,
        maxHeight: 160,
        textAlignVertical: 'top',
        color: '#0f172a',
    },
    sendFab: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: '#0ea5e9',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
        shadowColor: '#0ea5e9',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 4,
    },
    sendFabDisabled: {
        opacity: 0.65,
    },
    error: {
        color: '#b91c1c',
        fontSize: 14,
        marginBottom: 12,
    },
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
        marginBottom: 8,
    },
    trashBtn: {
        padding: 6,
    },
    historyItem: {
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#e7e5e4',
    },
    historyMeta: {
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 6,
    },
    historyTranslation: {
        fontSize: 16,
        fontWeight: '600',
        color: '#0f172a',
        marginBottom: 6,
    },
    historyOriginal: {
        fontSize: 14,
        color: '#64748b',
    },
    empty: {
        color: '#a8a29e',
        fontSize: 14,
        paddingVertical: 8,
        textAlign: 'center',
    },
});
