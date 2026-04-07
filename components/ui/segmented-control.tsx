import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii } from '@/constants/theme';
import { Spacing } from '@/constants/spacing';

type SegmentOption<T extends string> = {
  label: string;
  value: T;
};

type SegmentedControlProps<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: SegmentedControlProps<T>) {
  return (
    <View style={[styles.container, disabled ? styles.containerDisabled : undefined]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active ? styles.segmentActive : undefined]}>
            <ThemedText type="label" style={[styles.label, active ? styles.labelActive : undefined]}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.light.outlineVariant,
    backgroundColor: Colors.light.surfaceContainerHigh,
    padding: 4,
    gap: 4,
  },
  containerDisabled: {
    opacity: 0.6,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  segmentActive: {
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.primary,
  },
  label: {
    color: Colors.light.onSurfaceVariant,
  },
  labelActive: {
    color: Colors.light.onBackground,
  },
});
