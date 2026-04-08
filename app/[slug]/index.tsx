import { Redirect, useLocalSearchParams } from 'expo-router';

function normalizeSlug(value: string | string[] | undefined): string {
  if (!value) return '';
  const raw = Array.isArray(value) ? value[0] ?? '' : value;
  return raw.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

export default function RootSlugRedirectScreen() {
  const { slug } = useLocalSearchParams<{ slug?: string | string[] }>();
  const cleanSlug = normalizeSlug(slug);

  if (!cleanSlug) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Redirect
      href={{
        pathname: '/store/[slug]',
        params: { slug: cleanSlug },
      }}
    />
  );
}
