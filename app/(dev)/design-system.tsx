import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandColors, Colors } from '@/constants/theme';
import { Spacing } from '@/constants/spacing';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const swatches = [
  ['Primary', BrandColors.primary],
  ['Secondary', BrandColors.secondary],
  ['Tertiary', BrandColors.tertiary],
  ['Surface Low', BrandColors.surfaceContainerLow],
  ['Surface', BrandColors.surface],
  ['Outline', BrandColors.outline],
  ['On Background', BrandColors.onBackground],
];

export default function DesignSystemScreen() {
  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="display">Markket Design System</ThemedText>
        <ThemedText type="label">phase 1 foundation</ThemedText>

        <View style={styles.section}>
          <ThemedText type="headline">Color Tokens</ThemedText>
          <View style={styles.swatchGrid}>
            {swatches.map(([name, hex]) => (
              <View key={name} style={styles.swatchCard}>
                <View style={[styles.swatch, { backgroundColor: hex }]} />
                <ThemedText type="label">{name}</ThemedText>
                <ThemedText type="mono">{hex}</ThemedText>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="headline">Type Scale</ThemedText>
          <ThemedText type="display">Display Newsreader Italic</ThemedText>
          <ThemedText type="headline">Headline Manrope 17</ThemedText>
          <ThemedText type="default">Default body copy for content.</ThemedText>
          <ThemedText type="label">Label Space Grotesk uppercase</ThemedText>
          <ThemedText type="mono">MONO ROBOTO MONO 13PT</ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="headline">Buttons</ThemedText>
          <Button label="Primary Action" variant="primary" />
          <Button label="Secondary Outline" variant="secondary" />
          <Button label="Ghost Interaction" variant="ghost" />
        </View>

        <View style={styles.section}>
          <ThemedText type="headline">Input</ThemedText>
          <Input placeholder="Search curated stores..." />
        </View>

        <View style={styles.section}>
          <ThemedText type="headline">Card</ThemedText>
          <Card
            title="Revolve Studio"
            description="Editorial card baseline for stores, posts and pages."
            badgeLabel="new"
          />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xl,
    paddingBottom: 56,
    gap: Spacing.md,
  },
  section: {
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  swatchCard: {
    width: '47%',
    borderWidth: 1,
    borderColor: Colors.light.outlineVariant,
    borderRadius: 12,
    padding: Spacing.sm,
    gap: 6,
    backgroundColor: Colors.light.surface,
  },
  swatch: {
    width: '100%',
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.outlineVariant,
  },
});
