import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { Colors, Radii } from '@/constants/theme';

type InputProps = TextInputProps & {
  containerStyle?: ViewStyle;
};

export function Input({ containerStyle, style, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, focused ? styles.containerFocused : undefined, containerStyle]}>
      <TextInput
        {...rest}
        allowFontScaling={rest.allowFontScaling ?? true}
        style={[styles.input, style]}
        placeholderTextColor={Colors.light.outline}
        onFocus={(event) => {
          setFocused(true);
          rest.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          rest.onBlur?.(event);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 58,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.light.outlineVariant,
    backgroundColor: Colors.light.surface,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  containerFocused: {
    borderColor: Colors.light.secondary,
    backgroundColor: Colors.light.surfaceContainerLow,
  },
  input: {
    fontFamily: 'Manrope',
    fontSize: 15,
    lineHeight: 20,
    color: Colors.light.onSurface,
  },
});
