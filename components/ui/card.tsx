import { Image } from 'expo-image';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii } from '@/constants/theme';
import { Badge } from '@/components/ui/badge';

type CardProps = ViewProps & {
  title: string;
  description?: string;
  imageUrl?: string;
  badgeLabel?: string;
};

export function Card({ title, description, imageUrl, badgeLabel, style, ...rest }: CardProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.image} contentFit="cover" /> : null}
      <View style={styles.body}>
        {badgeLabel ? <Badge label={badgeLabel} /> : null}
        <ThemedText type="headline" style={styles.title}>
          {title}
        </ThemedText>
        {description ? <ThemedText style={styles.description}>{description}</ThemedText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.md,
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.outlineVariant,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 180,
    backgroundColor: Colors.light.surfaceDim,
  },
  body: {
    padding: 16,
    gap: 8,
  },
  title: {
    color: Colors.light.onBackground,
  },
  description: {
    color: Colors.light.onSurfaceVariant,
  },
});
