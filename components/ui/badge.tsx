import { StyleSheet, View, type ViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radii } from '@/constants/theme';

type BadgeProps = ViewProps & {
  label: string;
};

export function Badge({ label, style, ...rest }: BadgeProps) {
  return (
    <View style={[styles.badge, style]} {...rest}>
      <ThemedText style={styles.text}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: Radii.full,
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: {
    color: '#FFFFFF',
    fontFamily: 'RobotoMono',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
