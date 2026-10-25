# Immich Sort

An Android companion for sorting an existing Immich library one week at a time.
Built like the adjacent VanDijkFit project: Expo SDK 54, React Native 0.81,
TypeScript, Expo Router and a persisted Zustand store. The fitness app is untouched.

## First design and terminal build

See [BUILD.md](BUILD.md) for the ready-to-run Gradle release command.
The previous 1.0.0 installer had a native packaging defect and must not be reused.
The corrected 1.0.1 source still needs verification in Android after rebuilding.

## Use on Android

```bash
cd /home/thijs/Projects/immich-sort
npm ci
npm start
```

Open the QR code in **Expo Go for SDK 54** on an Android phone connected to the
same Wi-Fi. If the current store version of Expo Go no longer supports SDK 54,
use the SDK 54 Android build from https://expo.dev/go, or create the standalone
Android build below. This deliberately matches VanDijkFit's SDK version.

```bash
npm run android
```

This generates a native Android project and installs a development build on an
attached Android device/emulator. With Java 17, an Android SDK and the generated
Android project, create a standalone APK with:

```bash
npx expo prebuild --platform android
cd android
./gradlew assembleRelease --max-workers=2
```

Expo's generated local release build uses a development signing key by default;
configure your own signing key before distributing outside personal testing.
Output: `android/app/build/outputs/apk/release/app-release.apk`.
Build every advertised architecture; do not narrow `reactNativeArchitectures`
without also filtering every packaged native dependency. Validate the installer:

```bash
python3 scripts/check-apk.py android/app/build/outputs/apk/release/app-release.apk
```

## Connect your library

1. In Immich's website open **Account Settings → API Keys** and create a key
   for this app with these permissions:
   `user.read`, `asset.read`, `asset.view`, `asset.download`, `asset.update`, `asset.delete`, `asset.statistics`,
   `album.read`, `album.create`, `album.update`, `albumAsset.create`.
2. Find the server laptop's Wi-Fi IP using `hostname -I`.
3. In this app enter `http://<laptop-ip>:2283` and paste the API key. Do not use
   `localhost` on the phone: that means the phone itself.
4. Select a week, or enter any date to jump to its Monday–Sunday week.
5. Swipe right to keep a photo in your library, left to queue it for Trash,
   or up to choose an album for that photo. Closing the album picker leaves it undecided.
6. Undo pending choices, then press Apply to Immich (N) directly on the swipe screen. The number decreases after each successful update; unfinished decisions remain saved for retry.

The app targets the **Immich v3.3.5** API. All photos/videos owned by this account
in the selected week's visible timeline are fetched through cursor pagination.
Archived, locked, trashed and other users' assets are excluded. Weeks use the
phone's local timezone and the authoritative capture timestamp. A travel photo
may belong to a different local week than in Immich's EXIF-local timeline.

## Safety and storage

- No real photo or album is changed during swiping. Decisions and completed IDs
  are persisted in AsyncStorage, separated by server URL and user ID.
- Creating an album is an explicit immediate server operation. Photo placement
  is deferred until Apply to Immich is pressed.
- Right-swipe Keep leaves the photo unchanged in Immich. Up-swipe album choices
  add album membership when applied; they do not move original files on disk.
- Trash retention and ownership are checked before deleting, and the API call
  always uses `force: false`. Trash must be enabled with at least one day's
  retention. No permanent-delete endpoint is exposed. There is a small unavoidable
  race if an administrator changes trash settings during a request.
- Trashed items expire according to Immich's settings. Restore using Immich.
  This app does not delete the phone-gallery original.
- Each successful decision is marked complete independently. A failed operation
  leaves subsequent choices pending; duplicate album additions and already-trashed
  items can safely be retried.
- Undo is for pending decisions. Applied changes remain in Immich.
- Android API keys are stored in Expo SecureStore, excluded from Android backup.
  No API key is stored in Zustand, source files, logs or URLs. Browser preview
  credentials are memory-only and disappear on refresh. Real browser connections
  require the server's CORS policy to permit the preview origin; Android doesn't.
- Requests go directly to the configured server; there is no intermediary service.
  The Android manifest permits HTTP for this home-network setup. Use HTTPS on
  untrusted networks. No phone-gallery access permission is requested.
- Progress is local to this app/device and is lost if app storage is cleared.
  Disconnecting keeps it; changing the server URL creates a separate progress scope.
- Sample mode uses generated illustrations and makes no network requests.
- The library is not snapshotted while you sort. Refresh/reopen a week to include
  later phone uploads. An empty queue means the loaded assets are sorted.

## Source structure

- `app/index.tsx`: connection, week selection, sorting, immediate apply and settings flows.
- `components/PhotoCard.tsx`: PanResponder swipe cards, image inspection, video.
- `features/sorting/`: week boundaries, decisions, resumable commit, sample data.
- `store/useSortStore.ts`: account-scoped local progress.
- `lib/immich.ts`: typed HTTP client; API keys sent only in headers.
- `lib/credentials.ts`: SecureStore on Android, memory-only on web.
- `plugins/withLocalNetwork.js`: native HTTP support for your existing server.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run export:web
```

Tests cover DST/week boundaries, pagination, authentication errors, trash checks,
explicit soft deletion, album retries and failure recovery. Live mutation tests
must use disposable assets in a test Immich account, never the real library.

### Standalone Android smoke test

Use a dedicated emulator with fresh Immich Sort app data. This test runs the
release APK through startup, sample photo inspection, keep/album selection,
both real swipe gestures, undo and direct apply and its remaining-count indicator. It uses only
sample data and never connects to a real library.

```bash
python3 scripts/prepare-android-tests.py
cd android
./gradlew assembleRelease assembleReleaseAndroidTest --max-workers=2
```

Install the app and the generated `app-release-androidTest.apk` on the emulator,
then run `adb -s emulator-5554 shell am instrument -w
nl.vandijk.immichsort.test/androidx.test.runner.AndroidJUnitRunner`.
The test saves `native-sample-flow.png` in the app's external files directory.

Before sharing any APK, run `scripts/check-apk.py` against that exact file.
The original 1.0.0 APK failed this check: only arm64 had the complete native
runtime even though it advertised all four architectures.

API reference: https://api.immich.app/
Versioned contract: https://github.com/immich-app/immich/blob/v3.3.5/open-api/immich-openapi-specs.json

## Home tabs

Photos opens first with a paginated, newest-first photo grid. Albums shows owned
albums and their timeline photos. Search uses Immich smart search (paginated as you scroll), plus People and Location
browsing. People needs the `person.read`, `person.update` API-key permission. Smart search needs
Immich machine-learning indexing; locations need photo location metadata.
Photos are grouped under capture-date headings. Search retains relevance order.
Pull down to refresh a gallery; use Load more for older results. Tap a photo to
inspect it. These views exclude Trash, locked and archived assets.

Sort contains the week list. Toggle All weeks / Unsorted only to hide completed
weeks. Open a completed week and choose Sort further to re-sort its remaining
photos. The swipe screen stays fixed vertically; right keeps, left queues Trash,
and up opens the album picker. Changes still require confirmation.

## Shared progress

The companion service in `server/` stores completed photo IDs per Immich user.
It is installed on this laptop as the user service `immich-sort-sync`, port 2284.
Install the updated APK over the old app and open the phone first to upload its
local progress. Other devices using the same Immich account will download it.
Use Settings → Sync progress now to retry; failures retain local progress.
Pending swipes are never synced or applied by the companion service.

Mark week sorted snapshots the loaded photos as reviewed without modifying
Immich. It is unavailable while the week has pending decisions. New photo IDs
reopen a manually completed week. Empty weeks can be marked too.
See server/README.md for service startup, storage and backup details.
