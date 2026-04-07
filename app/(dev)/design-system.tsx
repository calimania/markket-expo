import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandColors, Colors } from '@/constants/theme';
import { Spacing } from '@/constants/spacing';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { HeroBanner } from '@/components/ui/hero-banner';
import { NewsletterCard } from '@/components/ui/newsletter-card';
import { ImageSelector, type ImageSelectorOption } from '@/components/ui/image-selector';
import { SkeletonBlock, SkeletonCard, SkeletonText } from '@/components/ui/skeleton';

const swatches = [
  ['Primary', BrandColors.primary],
  ['Secondary', BrandColors.secondary],
  ['Tertiary', BrandColors.tertiary],
  ['Surface Low', BrandColors.surfaceContainerLow],
  ['Surface', BrandColors.surface],
  ['Outline', BrandColors.outline],
  ['On Background', BrandColors.onBackground],
];

const imageOptions: ImageSelectorOption[] = [
  {
    id: 'studio',
    label: 'Studio',
    imageUrl: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'runway',
    label: 'Runway',
    imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'street',
    label: 'Street',
    imageUrl: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'editorial',
    label: 'Editorial',
    imageUrl: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=900&q=80',
  },
];

const usageItems = [
  'Theme tokens: BrandColors, Colors, Radii, Spacing',
  'Typography: display, headline, default, label, mono',
  'UI primitives: Button, Input, Badge, Card',
  'Composed blocks: SectionHeader, HeroBanner, NewsletterCard, ImageSelector',
  'Behavior patterns: selected states, CTA layout, reusable section structure',
];

export default function DesignSystemScreen() {
  const [email, setEmail] = useState('');
  const [selectedImageId, setSelectedImageId] = useState(imageOptions[0]?.id ?? '');

  const selectedImageOption = useMemo(
    () => imageOptions.find((option) => option.id === selectedImageId) ?? imageOptions[0],
    [selectedImageId]
  );

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="display">Markket Design System</ThemedText>
        <ThemedText type="label">phase 1 foundation</ThemedText>

        <View style={styles.section}>
          <SectionHeader
            eyebrow="inventory"
            title="What we're using"
            subtitle="Quick reference of active tokens and reusable patterns for this app."
          />
          <View style={styles.checklistCard}>
            {usageItems.map((item) => (
              <ThemedText key={item} type="mono" style={styles.checklistItem}>
                + {item}
              </ThemedText>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            eyebrow="hero"
            title="Title + Subtitle + Image"
            subtitle="Reference for feature intros and seasonal campaign headers."
          />
          <HeroBanner
            imageUrl="https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1200&q=80"
            title="Spring stories, styled."
            subtitle="A richer intro block pairing display type with editorial imagery."
            ctaLabel="Browse Looks"
            onCtaPress={() => Alert.alert('CTA', 'Hero CTA pressed')}
          />
        </View>

        <View style={styles.section}>
          <SectionHeader title="Color Tokens" subtitle="Core palette and surface hierarchy." />
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
          <SectionHeader title="Type Scale" subtitle="Readable pairings for marketing and content screens." />
          <ThemedText type="display">Display Newsreader Italic</ThemedText>
          <ThemedText type="headline">Headline Manrope 17</ThemedText>
          <ThemedText type="default">Default body copy for content.</ThemedText>
          <ThemedText type="label">Label Space Grotesk uppercase</ThemedText>
          <ThemedText type="mono">MONO ROBOTO MONO 13PT</ThemedText>
        </View>

        <View style={styles.section}>
          <SectionHeader title="Buttons" subtitle="Primary, secondary, and lightweight ghost actions." />
          <Button label="Primary Action" variant="primary" />
          <Button label="Secondary Outline" variant="secondary" />
          <Button label="Ghost Interaction" variant="ghost" />
        </View>

        <View style={styles.section}>
          <SectionHeader title="Input" subtitle="Plain baseline input for forms and search." />
          <Input placeholder="Search curated stores..." />
        </View>

        <View style={styles.section}>
          <SectionHeader
            eyebrow="newsletter"
            title="Newsletter with Button"
            subtitle="Drop-in CTA block for landing pages and article footers."
          />
          <NewsletterCard
            value={email}
            onChangeText={setEmail}
            onSubmit={() => Alert.alert('Newsletter', email ? `Submitted: ${email}` : 'Enter an email first')}
            buttonLabel="Subscribe"
          />
        </View>

        <View style={styles.section}>
          <SectionHeader
            eyebrow="loading"
            title="Skeleton Loading States"
            subtitle="Use these instead of generic spinners for content-heavy surfaces."
          />
          <View style={styles.skeletonPanel}>
            <SkeletonBlock width="45%" height={26} radius={12} />
            <SkeletonText lines={3} />
            <SkeletonCard />
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            eyebrow="selector"
            title="Card + Image Selector"
            subtitle="Useful for choosing visual style before creating a post or campaign."
          />
          <ImageSelector
            options={imageOptions}
            selectedId={selectedImageId}
            onSelect={setSelectedImageId}
          />
          {selectedImageOption ? (
            <Card
              title={`${selectedImageOption.label} Preview`}
              description="Selected style reflected in a card preview for quick visual confirmation."
              imageUrl={selectedImageOption.imageUrl}
              badgeLabel="selected"
            />
          ) : null}
        </View>

        <View style={styles.section}>
          <SectionHeader title="Card" subtitle="Editorial baseline for stores, posts, and pages." />
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
  checklistCard: {
    borderWidth: 1,
    borderColor: Colors.light.outlineVariant,
    borderRadius: 12,
    backgroundColor: Colors.light.surfaceContainerLow,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  checklistItem: {
    color: Colors.light.onSurface,
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
  skeletonPanel: {
    gap: Spacing.sm,
  },
});
