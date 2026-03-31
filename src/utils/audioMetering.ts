/** 막대 개수 (녹음 파형 표시용) */
export const WAVEFORM_BAR_COUNT = 32;

/**
 * expo-av RecordingStatus.metering (dBFS, 대략 -160 ~ 0) → 0~1 높이 비율
 */
export const meteringToLevel = (metering: number | undefined): number => {
  if (metering === undefined) {
    return 0.06;
  }
  const t = (metering + 60) / 60;
  return Math.max(0.04, Math.min(1, t));
};

export const createInitialWaveformLevels = (): number[] =>
  Array.from({ length: WAVEFORM_BAR_COUNT }, () => 0.08);
