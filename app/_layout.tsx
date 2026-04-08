import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AppConfigProvider } from '@/hooks/use-app-config';
import { AuthSessionProvider } from '@/hooks/use-auth-session';
import { Colors } from '@/constants/theme';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore repeated calls while fast-refreshing during development.
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Manrope: require('@/assets/fonts/Manrope-VariableFont_wght.ttf'),
    Newsreader: require('@/assets/fonts/Newsreader-VariableFont_opsz,wght.ttf'),
    RobotoMono: require('@/assets/fonts/RobotoMono-VariableFont_wght.ttf'),
    SpaceGrotesk: require('@/assets/fonts/SpaceGrotesk-VariableFont_wght.ttf'),
    ComicMono: require('@/assets/fonts/ComicMono.ttf'),
    ComicMonoBold: require('@/assets/fonts/ComicMono-Bold.ttf'),
    GilroyBold: require('@/assets/fonts/Gilroy-Bold.ttf'),
    GilroyBlack: require('@/assets/fonts/Gilroy-Black.ttf'),
  });

  useEffect(() => {
    if (!fontsLoaded) return;

    SplashScreen.hideAsync().catch(() => {
      // Ignore hide failures; app can continue rendering.
    });
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  const navigationTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: Colors.light.tint,
      background: Colors.light.background,
      card: '#FFF8DB',
      text: Colors.light.text,
      border: '#FDE68A',
      notification: '#D946EF',
    },
  };

  return (
    <AppConfigProvider>
      <AuthSessionProvider>
        <ThemeProvider value={navigationTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="article/[slug]" options={{ title: 'Article' }} />
            <Stack.Screen
              name="store-blog/[slug]"
              options={{
                title: 'Articles',
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen name="page/[slug]" options={{ title: 'Page' }} />
            <Stack.Screen name="legal/[kind]" options={{ title: 'Legal' }} />
            <Stack.Screen name="profile" options={{ title: 'Profile' }} />
            <Stack.Screen
              name="store/[slug]"
              options={{
                title: 'Store',
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen name="web" options={{ title: 'Preview Link' }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <StatusBar style="dark" />
        </ThemeProvider>
      </AuthSessionProvider>
    </AppConfigProvider>
  );
}
