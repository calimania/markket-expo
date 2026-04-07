import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?:
  | 'default'
  | 'title'
  | 'defaultSemiBold'
  | 'subtitle'
  | 'link'
  | 'display'
  | 'headline'
  | 'label'
  | 'mono';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        type === 'display' ? styles.display : undefined,
        type === 'headline' ? styles.headline : undefined,
        type === 'label' ? styles.label : undefined,
        type === 'mono' ? styles.mono : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontFamily: 'Manrope',
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontFamily: 'Manrope',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  title: {
    fontFamily: 'Newsreader',
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 32,
  },
  subtitle: {
    fontFamily: 'Newsreader',
    fontSize: 20,
    fontWeight: '700',
  },
  display: {
    fontFamily: 'Newsreader',
    fontStyle: 'italic',
    fontSize: 34,
    lineHeight: 40,
  },
  headline: {
    fontFamily: 'Manrope',
    fontWeight: '700',
    fontSize: 17,
    lineHeight: 24,
  },
  label: {
    fontFamily: 'SpaceGrotesk',
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  mono: {
    fontFamily: 'RobotoMono',
    fontSize: 13,
    lineHeight: 18,
  },
  link: {
    fontFamily: 'RobotoMono',
    lineHeight: 30,
    fontSize: 16,
    color: '#0891B2',
  },
});
