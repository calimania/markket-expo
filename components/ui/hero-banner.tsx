import { Image } from 'expo-image';
import { Pressable, StyleSheet, View, type PressableProps, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { BrandColors, Colors, Radii } from '@/constants/theme';
import { Spacing } from '@/constants/spacing';

type HeroBannerProps = PressableProps & {
  imageUrl: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  containerStyle?: ViewStyle;
};

export function HeroBanner({
  imageUrl,
  title,
  subtitle,
  ctaLabel,
  onCtaPress,
  containerStyle,
  ...rest
}: HeroBannerProps) {
  return (
    <Pressable style={[styles.container, containerStyle]} {...rest}>
      <Image source={{ uri: imageUrl }} style={styles.image} contentFit="cover" />
      <View style={styles.overlay}>
        <ThemedText type="display" style={styles.title}>
          {title}
        </ThemedText>
        {subtitle ? <ThemedText style={styles.subtitle}>{subtitle}</ThemedText> : null}
        {ctaLabel ? (
          <View style={styles.ctaWrap}>
            <Button label={ctaLabel} onPress={onCtaPress} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radii.lg,
    overflow: 'hidden',
    minHeight: 240,
    borderWidth: 1,
    borderColor: Colors.light.outlineVariant,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.light.surfaceDim,
  },
  overlay: {
    minHeight: 240,
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: 'rgba(30,27,75,0.30)',
  },
  title: {
    color: BrandColors.white,
  },
  subtitle: {
    color: BrandColors.white,
  },
  ctaWrap: {
    marginTop: Spacing.xs,
    alignSelf: 'flex-start',
    minWidth: 170,
  },
});
