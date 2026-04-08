import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii } from '@/constants/theme';
import { Spacing } from '@/constants/spacing';

export type ImageSelectorOption = {
  id: string;
  label: string;
  imageUrl: string;
};

type ImageSelectorProps = {
  options: ImageSelectorOption[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export function ImageSelector({ options, selectedId, onSelect }: ImageSelectorProps) {
  return (
    <View style={styles.grid}>
      {options.map((option) => {
        const selected = option.id === selectedId;
        return (
          <Pressable
            key={option.id}
            style={[styles.option, selected ? styles.optionSelected : undefined]}
            onPress={() => onSelect(option.id)}>
            <Image source={{ uri: option.imageUrl }} style={styles.image} contentFit="cover" />
            <View style={styles.labelRow}>
              <ThemedText type="label" style={selected ? styles.labelSelected : undefined}>
                {option.label}
              </ThemedText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  option: {
    width: '47%',
    borderWidth: 1,
    borderColor: Colors.light.outlineVariant,
    borderRadius: Radii.md,
    overflow: 'hidden',
    backgroundColor: Colors.light.surface,
  },
  optionSelected: {
    borderColor: Colors.light.primary,
    borderWidth: 2,
  },
  image: {
    width: '100%',
    height: 94,
    backgroundColor: Colors.light.surfaceDim,
  },
  labelRow: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  labelSelected: {
    color: Colors.light.primary,
  },
});
