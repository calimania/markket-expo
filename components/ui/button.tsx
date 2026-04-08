import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { Radii, Colors } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = PressableProps & {
  label: string;
  variant?: ButtonVariant;
};

export function Button({ label, variant = 'primary', style, ...props }: ButtonProps) {
  return (
    <Pressable
      {...props}
      style={(state) => [
        styles.base,
        variant === 'primary' ? styles.primary : undefined,
        variant === 'secondary' ? styles.secondary : undefined,
        variant === 'ghost' ? styles.ghost : undefined,
        state.pressed ? styles.pressed : undefined,
        typeof style === 'function' ? style(state) : style,
      ]}>
      <ThemedText
        style={[
          styles.label,
          variant === 'primary' ? styles.primaryLabel : undefined,
          variant === 'secondary' ? styles.secondaryLabel : undefined,
          variant === 'ghost' ? styles.ghostLabel : undefined,
        ]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primary: {
    backgroundColor: Colors.light.primary,
  },
  secondary: {
    borderWidth: 2,
    borderColor: Colors.light.onBackground,
    backgroundColor: 'transparent',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  primaryLabel: {
    color: '#FFFFFF',
  },
  secondaryLabel: {
    color: Colors.light.onBackground,
  },
  ghostLabel: {
    color: Colors.light.onSurfaceVariant,
    fontFamily: 'SpaceGrotesk',
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 1.2,
  },
});
