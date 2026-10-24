# Build the first Android design

From your terminal:

```bash
cd /home/thijs/Projects/immich-sort/android
ANDROID_HOME="$HOME/Android/Sdk" NODE_ENV=production ./gradlew :app:assembleRelease --max-workers=2 --no-daemon -Dorg.gradle.parallel=false -Dorg.gradle.jvmargs=-Xmx2048m
cd ..
python3 scripts/check-apk.py android/app/build/outputs/apk/release/app-release.apk
```

The Gradle command is `./gradlew :app:assembleRelease` (not `gradlewrelease`).
The APK appears in `android/app/build/outputs/apk/release/app-release.apk`.
Keep all four configured architectures enabled so every advertised processor
has the full native runtime. Run the packaging check before installing.

First design: a minimal charcoal and gray interface. When disconnected, show
only the server connection form with optional help and sample mode. Once
connected, show a list of weeks; tap one to sort. Older weeks load in yearly
batches. A checkmark means every photo loaded for that week was reviewed and
saved, not merely swiped. Opening a week refreshes its photos and clears the
checkmark when new unsorted uploads are found. Progress belongs to this device
and account. Left swipe queues trash; right swipe selects an album. Review and
confirmation remain required before changing Immich.

Status: the previous 1.0.0 installer crashed on startup. The source and build
configuration have been corrected for missing native libraries, but the next
APK still needs an Android startup test. Do not reuse the old installer.
See README.md for the native smoke test and connection instructions.
