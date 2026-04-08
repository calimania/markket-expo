import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { Spacing } from '@/constants/spacing';

type SectionHeaderProps = ViewProps & {
  title: string;
  subtitle?: string;
  eyebrow?: string;
};

export function SectionHeader({ title, subtitle, eyebrow, style, ...rest }: SectionHeaderProps) {
  return (
    <View style={[styles.container, style]} {...rest}>
      {eyebrow ? (
        <ThemedText type="label" style={styles.eyebrow}>
          {eyebrow}
        </ThemedText>
      ) : null}
      <ThemedText type="headline" style={styles.title}>
        {title}
      </ThemedText>
      {subtitle ? <ThemedText style={styles.subtitle}>{subtitle}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  eyebrow: {
    color: Colors.light.secondary,
  },
  title: {
    color: Colors.light.onBackground,
    fontSize: 20,
    lineHeight: 28,
  },
  subtitle: {
    color: Colors.light.onSurfaceVariant,
  },
});
