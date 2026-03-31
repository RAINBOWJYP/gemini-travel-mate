import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

/**
 * 더기 마스코트(오리) — 살짝 커졌다 작아지는 루프
 */
export const DuckMascot = () => {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.09,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [scale]);

  return (
    <View style={styles.wrap} accessibilityLabel="마스코트 오리">
      <Animated.View style={{ transform: [{ scale }] }}>
        <Text style={styles.emoji}>🦆</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: 4,
  },
  emoji: {
    fontSize: 56,
  },
});
