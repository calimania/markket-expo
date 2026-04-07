import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, Radii } from '@/constants/theme';
import { Spacing } from '@/constants/spacing';

type SkeletonBlockProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function SkeletonBlock({ width = '100%', height = 14, radius = 10, style }: SkeletonBlockProps) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.95,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius: radius,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <View style={styles.stack}>
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBlock
          key={index}
          width={index === lines - 1 ? '62%' : '100%'}
          height={12}
          radius={8}
        />
      ))}
    </View>
  );
}

export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <SkeletonBlock height={170} radius={Radii.md} />
      <View style={styles.cardBody}>
        <SkeletonBlock width="34%" height={20} radius={Radii.full} />
        <SkeletonBlock width="70%" height={20} />
        <SkeletonText lines={2} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: Colors.light.surfaceContainerHighest,
  },
  stack: {
    gap: Spacing.xs,
  },
  card: {
    borderWidth: 1,
    borderColor: Colors.light.outlineVariant,
    borderRadius: Radii.md,
    overflow: 'hidden',
    backgroundColor: Colors.light.surface,
  },
  cardBody: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
});
