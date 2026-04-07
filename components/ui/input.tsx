import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { Colors, Radii } from '@/constants/theme';

type InputProps = TextInputProps & {
  containerStyle?: ViewStyle;
};

export function Input({ containerStyle, style, ...rest }: InputProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        {...rest}
        style={[styles.input, style]}
        placeholderTextColor={Colors.light.outline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 56,
    borderRadius: Radii.md,
    backgroundColor: Colors.light.surfaceContainerLow,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  input: {
    fontFamily: 'Manrope',
    fontSize: 15,
    color: Colors.light.onSurface,
  },
});
