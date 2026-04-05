# Markket Community App

Markket is great. This app is a simple community-first mobile client to browse Markket stores and open each store directly in an in-app web view.

Built with Expo + React Native + Expo Router.

## What It Does

- Home tab shows a card list of stores from the Markket API.
- Settings tab lets you change:
  - API base URL (for your own Strapi/Markket instance)
  - Display base URL (used when opening store pages)
- Tapping a store opens a WebView at `displayBaseUrl + storeSlug`.
- Settings are persisted locally with AsyncStorage.

## Default URLs

- API base URL: `https://api.markket.place`
- Display base URL: `https://markket.place/`

The app requests stores with logos from this path:

`/api/stores?populate[]=Logo`

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npx expo start
```

3. Open on iOS, Android, or web from Expo CLI.

## Useful Scripts

- Start dev server: `npm run start`
- iOS: `npm run ios`
- Android: `npm run android`
- Web: `npm run web`
- Lint: `npm run lint`

## Project Structure

- `app/(tabs)/index.tsx`: Home list of Markket stores
- `app/(tabs)/explore.tsx`: Settings screen
- `app/store/[slug].tsx`: Store WebView screen
- `hooks/use-app-config.tsx`: Persisted app config and URL settings

## Notes

- If you change the API base URL in Settings, return to Home and pull to refresh.
- If you host your own instance, ensure CORS/network rules allow app access.
