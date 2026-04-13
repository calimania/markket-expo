# Markket App Feature Tracker

Last updated: 2026-04-10

## Shipped

- [x] Home: stores feed
- [x] Home: blog feed
- [x] Media Studio: slot preview + local replacement flow
- [x] Composer: fullscreen editing canvas with floating tools
- [x] Slides Manager: reorder + replace selected slide
- [x] Profile: editable display name + bio + avatar upload

## In Progress

- [ ] Tienda content list (article | event | page | product)
- [ ] Dashboard IA pass: group content into clear sections owners understand
- [ ] Media Studio polish pass (copy, spacing, flow clarity, paste)
- [ ] Profile language cleanup for consumer-first UX
- [ ] data api layer, caching
- [ ] prebaked data and offline mode

## Roadmap Ideas (Owner-Friendly)

- [ ] Special Pages section in dashboard (highlighted separately from regular content)
- [ ] Products Page template owners can customize (hero, collections, call-to-action)
- [ ] Events Page template owners can customize (upcoming events, RSVP/checkout focus)
- [ ] Story/Blog Page template owners can customize (featured story + latest updates)
- [ ] Simple visibility controls: what visitors see first vs what stays secondary
- [ ] Per-page style controls with safe defaults (headline, cover image, accent color)

Definition: Special Pages are high-impact storefront pages that control first impression and conversion flow
Owner value: One place to shape what visitors see without editing every item one by one

## Missing / Gaps

- [ ] Unified analytics events for key actions (compose, publish, save profile)
- [ ] Empty states that guide next action on every major screen
- [ ] Error states with friendlier copy and recovery action
- [ ] Lightweight settings/help center surface inside app
- [ ] String audit checklist across auth/profile/media/store flows

## Sprint Planning

### Sprint A: UX Consistency + Copy

- [ ] Replace technical terms in profile/media with consumer-friendly wording
- [ ] Align button labels and tone across Account + Media Studio
- [ ] Add product copy QA pass before release build

### Sprint B: Content + Store Operations

- [ ] Complete tienda content list and filtering flow
- [ ] Add Special Pages area in dashboard navigation
- [ ] Add page templates for products/events/stories with owner-friendly labels
- [ ] Add quick action routing from profile into store content management
- [ ] Harden store load error handling and retries

### Sprint C: Reliability + Instrumentation

- [x] Add telemetry baseline for network failures (global fetch instrumentation)
- [ ] Add telemetry for profile save and media publish outcomes
- [ ] Add diagnostics for auth/token expiry edge cases
- [x] Add API smoke-check script for endpoint health validation
- [ ] Add smoke-test checklist for iOS + Android before release

## String Pass: Profile (Consumer-Friendly)

Goal: remove internal/technical wording and keep a warm, simple tone.

- [ ] "Session" -> "Order ID"
- [ ] "Local" phrasing -> "On this device"
- [ ] "Slug"/internal field language -> plain "store link"
- [ ] "No session token" -> clear signed-out guidance
- [ ] Reduce engineering wording in seller order history labels

## API Contract Notes (Profile Save)

- Send only editable profile fields: `displayName`, `bio`
- Keep fallback attempts for profile save endpoint/method variations
- Treat 400/401/404/405 as retryable in save fallback loop
- Keep this behavior stable across iterations to avoid regressions

## Performance Guardrails

- [x] Keep app native-first for core creator and visitor flows
- [ ] Avoid webview for normal usage; reserve it for debugging or emergency fallback only
- [ ] Keep templates lightweight (fast initial paint, minimal layout shifts)
- [ ] Keep media previews optimized to protect scroll and editor performance

## Upcoming

- [ ] Reviewing orders
- [ ] Reviewing subscribers
- [ ] Review newsletter segmentation
- [ ] Display analytics
- [ ] Composing newsletters
- [ ] Adding prices to products & events
- [ ] Stripe connect integration
- [ ] Invite users to store
- [ ] Inbox
