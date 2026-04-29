import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';

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
            ]),
        );
        loop.start();
        return () => {
            loop.stop();
        };
    }, [scale]);

    return (
        <View style={styles.wrap} accessibilityLabel="duck_header">
            <Animated.View style={{ transform: [{ scale }] }}>
                <Image
                    source={require('../../assets/deogi-duck-nukki.png')}
                    style={styles.mascot}
                    resizeMode="contain"
                    accessible={false}
                />
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    wrap: {
        alignItems: 'center',
        marginBottom: 4,
    },
    mascot: {
        width: 64,
        height: 64,
    },
});
