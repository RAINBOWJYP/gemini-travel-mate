import { StyleSheet, Text, View } from 'react-native';

import { WAVEFORM_BAR_COUNT } from '../utils/audioMetering';

type RecordingWaveformProps = {
  levels: number[];
  /** 한 줄 레이아웃(마이크 FAB 위 등)일 때 힌트 생략·높이 축소 */
  compact?: boolean;
};

/**
 * 녹음 중 마이크 입력 레벨을 막대 파형으로 표시 (듣고 있다 / 녹음 중 피드백)
 */
export const RecordingWaveform = ({ levels, compact = false }: RecordingWaveformProps) => {
  const bars: number[] = [];
  for (let i = 0; i < WAVEFORM_BAR_COUNT; i += 1) {
    const v = levels[i];
    bars.push(typeof v === 'number' ? v : 0.08);
  }

  const maxBarPx = compact ? 40 : 56;
  const minBarPx = 4;
  const barAreaH = compact ? 44 : 60;

  return (
    <View
      style={[styles.wrap, compact && styles.wrapCompact]}
      accessibilityLabel="녹음 중입니다. 마이크 입력 레벨을 표시합니다."
    >
      {!compact && <Text style={styles.hint}>듣는 중… 말씀해 주세요</Text>}
      <View style={[styles.bars, { height: barAreaH }]}>
        {bars.map((level, index) => {
          const h = minBarPx + level * (maxBarPx - minBarPx);
          return (
            <View key={index} style={[styles.barTrack, { height: barAreaH }]}>
              <View style={[styles.bar, { height: h }]} />
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  wrapCompact: {
    marginBottom: 0,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 288,
  },
  hint: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
    fontWeight: '500',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
  },
  barTrack: {
    flex: 1,
    maxWidth: 5,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  bar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: '#ffffff',
  },
});
