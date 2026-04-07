import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Colors, Radii } from '@/constants/theme';
import { Spacing } from '@/constants/spacing';

type NewsletterCardProps = ViewProps & {
  title?: string;
  subtitle?: string;
  value: string;
  onChangeText: (value: string) => void;
  onSubmit?: () => void;
  buttonLabel?: string;
  placeholder?: string;
};

export function NewsletterCard({
  title = 'Newsletter',
  subtitle = 'Get drops, launches, and editor picks each week.',
  value,
  onChangeText,
  onSubmit,
  buttonLabel = 'Join list',
  placeholder = 'you@example.com',
  style,
  ...rest
}: NewsletterCardProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      <ThemedText type="headline">{title}</ThemedText>
      <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>
      <Input
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder={placeholder}
      />
      <Button label={buttonLabel} onPress={onSubmit} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.light.outlineVariant,
    backgroundColor: Colors.light.surfaceContainer,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  subtitle: {
    color: Colors.light.onSurfaceVariant,
  },
});
