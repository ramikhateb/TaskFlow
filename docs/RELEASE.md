# Release & Store Readiness (M12)

Status snapshot as of M12. This documents what's in place and what's still an owner decision — it doesn't publish anything, create accounts, or generate certificates/identifiers.

## Current state

- **Expo config** (`apps/mobile/app.json`): `name: "TaskFlow"`, `slug: "taskflow"`, `scheme: "taskflow"`, `version: "1.0.0"`. Icon and adaptive-icon assets are configured. `ios.supportsTablet: true`. No `ios.bundleIdentifier`, no `android.package`, no EAS project id, no `eas.json` — none of these existed before M12 and none were invented during it (see "Owner decisions" below).
- **Environment/config**: the API fails fast at boot on missing/invalid env vars (`apps/api/src/env.ts`); no secrets are committed (`.env` is gitignored, `.env.example` files carry placeholders only); the mobile app takes its API base URL from `EXPO_PUBLIC_API_URL`, defaulting to `localhost` for the simulator and overridable for a LAN-IP physical-device workflow or a future staging/production API. See [README.md](../README.md) for the exact setup steps.
- **CORS / transport**: `apps/api` restricts origins per `ARCHITECTURE.md` §6; HTTPS is a deployment-time requirement (no TLS termination exists yet, since there's no deployed environment).
- **Rate limiting**: not implemented anywhere (documented, accepted v1 gap — `ARCHITECTURE.md` §6, `REQUIREMENTS.md` §4 Security). Worth adding before any public/unauthenticated exposure, particularly on `GET /users/search`.

## What's needed for each distribution stage

### Expo Go (development) — works today

`npm run dev -w apps/mobile`, scan the QR code. No further setup.

### Internal / TestFlight-style testing (EAS Build)

1. `npx eas login` / `npx eas init` inside `apps/mobile` — creates an EAS project and writes an `eas.json`. Not done in M12 (would create a real, external EAS project tied to someone's Expo account — an owner action, not something to do automatically).
2. Decide and set `ios.bundleIdentifier` (e.g. `com.<owner>.taskflow`) and `android.package` in `app.json` — **owner decision, see below**.
3. `eas build --platform ios --profile preview` (and `--platform android`) — produces an installable build without an Apple Developer Program membership for internal iOS distribution via ad-hoc, or immediately for Android.
4. For actual TestFlight distribution specifically: an active Apple Developer Program membership ($99/yr), an App Store Connect app record, and `eas submit --platform ios`.

### App Store / Play Store release

All of the above, plus:

- Final app icon/splash art if the current placeholder assets aren't the real ones — **owner decision**.
- App Store Connect / Play Console listing: screenshots, description, category, content rating questionnaire.
- **A privacy policy URL** — required by both stores once real user accounts/data are involved (registration, email, task content). Not created in M12 — no policy content exists yet, and writing one is a legal/product decision, not an engineering one.
- Apple's App Tracking Transparency / data-collection disclosure forms — TaskFlow collects account/task data but no third-party tracking or analytics exist in v1, which simplifies this, but the forms still need to be filled in by whoever owns the App Store Connect account.
- Play Console's Data Safety form (Android equivalent).
- A support/contact URL or email for both listings.

## Owner decisions still required (not guessed at in M12)

TaskFlow's `app.json` uses `TaskFlow`/`taskflow` throughout, which reads as a working product name rather than a confirmed final one. Per this milestone's explicit instruction, none of the following were invented:

1. **Final product name**, if `TaskFlow` isn't final — renaming later is possible but touches the Expo slug/scheme and any store listing already created under the old name, so it's cheaper to confirm before the first EAS/store submission than after.
2. **iOS bundle identifier** (`ios.bundleIdentifier`, e.g. `com.yourcompany.taskflow`) and **Android package name** (`android.package`, e.g. `com.yourcompany.taskflow`) — both are effectively permanent once a store listing is created against them.
3. **Which Apple/Google developer accounts** these builds should belong to (personal vs. an org account) — affects billing and who can manage the listing long-term.
4. **Final icon/splash art**, if the current assets are placeholders rather than the intended production identity.
5. **Privacy policy content and hosting URL.**

None of these block continued development, on-device testing via Expo Go, or EAS internal builds using a temporary/personal identifier — they only block an actual store submission.
