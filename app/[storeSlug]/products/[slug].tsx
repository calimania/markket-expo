import { Redirect, useLocalSearchParams } from 'expo-router';

function normalizeParam(value: string | string[] | undefined): string {
  if (!value) return '';
  const raw = Array.isArray(value) ? value[0] ?? '' : value;
  return raw.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

export default function StoreProductDeepLinkScreen() {
  const { storeSlug, slug } = useLocalSearchParams<{
    storeSlug?: string | string[];
    slug?: string | string[];
  }>();

  const cleanStoreSlug = normalizeParam(storeSlug);
  const cleanProductSlug = normalizeParam(slug);

  if (!cleanProductSlug) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Redirect
      href={{
        pathname: '/product/[slug]',
        params: {
          slug: cleanProductSlug,
          store: cleanStoreSlug,
        },
      }}
    />
  );
}
