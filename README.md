# Markket

Markkët ios client, discover new creators

Built with Expo + React Native + Expo Router.

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

## Strapi v5 Guardrails (Important)

Store-scoped screens must always enforce store filters. If a filter is missing or malformed,
Strapi may return global content from all stores.

### Non-Negotiable Rules

- Always include a store slug filter for store-specific content.
- Never render results blindly. Validate that each returned item belongs to the active store.
- If store ownership cannot be confirmed, fail closed (show empty state), not open.
- Use fallback query variants only when still store-scoped.

### Known-Good Store-Scoped Query Shapes

Use `slug` as the active store slug.

- Stores:
  - `/api/stores?filter[slug][$eq]=slug`
  - `/api/stores?filters[slug][$eq]=slug`
- Articles (blog):
  - `/api/articles?filter[store][slug]=slug`
  - `/api/articles?filters[store][slug]=slug`
- Pages:
  - `/api/pages?filter[store][slug]=slug&populate[]=SEO.socialImage`
  - `/api/pages?filter[store][slug][$eq]=slug&populate[]=SEO.socialImage`
- Products:
  - `/api/products?filters[stores][slug][$eq]=slug`

### Safe Populate Strategy

- Prefer explicit populate for required media fields (`cover`, `SEO.socialImage`, etc.).
- Avoid relying only on `populate=*` for critical behavior.
- Keep populate fallbacks, but keep store filter fixed in every attempt.

### Runtime Validation Checklist

Before rendering cards in store-specific rails:

- Articles: verify `article.store.slug === activeSlug` or `article.stores[].slug` contains `activeSlug`.
- Pages: verify `page.store.slug === activeSlug` or `page.stores[].slug` contains `activeSlug`.
- If relation fields are not populated, treat response as untrusted for strict filtering.

### Content Format Compatibility (Markdown + Rich Text)

Some stores currently return mixed content formats:

- Plain Markdown strings
- Strapi Rich Text/Blocks JSON arrays (nodes with `type`, `children`, `text`)

Current app behavior should remain format-tolerant:

- Do not assume `Content` is always Markdown.
- Always normalize unknown content to safe preview text for cards/lists.
- Render Markdown parsing only when the source is confirmed string Markdown.
- For blocks JSON, flatten text nodes for previews and keep native detail rendering resilient.

Practical rule:

- If content type is uncertain, prefer safe text extraction over strict formatting.

### Debug Procedure (When Content Disappears)

1. Copy the exact request URL used by the app.
2. Test it directly in browser/curl.
3. Confirm whether result items include store relation and matching slug.
4. If not, fix filter first, then populate.
5. Do not weaken store filter to "make data appear".
