# Immich Sort — getting started

Project folder: `/home/thijs/Projects/immich-sort`

First, copy **Immich-Sort.apk** to your Android phone and open it with the Files app to install. Android may ask you to allow installation from that app. This build supports 64-bit ARM phones running Android 7 or later.

1. Open Immich in your laptop browser and go to **Account Settings → API Keys**.
2. Create an app key with: `user.read`, `asset.read`, `asset.view`, `asset.download`, `asset.delete`, `album.read`, `album.create`, `albumAsset.create`.
3. Open Immich Sort on your Android phone. Enter the server laptop’s Wi-Fi address, for example `http://192.168.1.20:2283`, and paste the key. Keep both devices on the same Wi-Fi.
4. Choose a week, then an album. Swipe left to queue deletion, right to keep and add to that album. Undo works before applying.
5. Open the review, inspect any item again, then confirm. Deleted items go to Immich Trash and expire according to the server’s settings. Phone-gallery originals are not changed by this app.

Use **Try a sample week** first to learn the controls without connecting to your photos.

To find this laptop’s Wi-Fi address, run `hostname -I` and choose its home-network address. `localhost` will not work from the phone. HTTP is intended for your trusted home network; use HTTPS for untrusted networks.

If you prefer the Expo development version:

```bash
cd /home/thijs/Projects/immich-sort
npm start
```

Scan the QR code with Expo Go compatible with SDK 54. Full technical instructions are in the project’s README.md.

Validation completed: Android release build, APK signing verification, TypeScript checks, lint, 13 automated tests, and a browser sample flow covering both swipe directions, album selection, undo, review confirmation and saved progress. Physical-device playback and changes against a disposable live Immich library still need verification. Your real library was not changed during development.
