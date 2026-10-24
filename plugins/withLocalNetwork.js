const { withAndroidManifest } = require('expo/config-plugins');
module.exports = (config) => withAndroidManifest(config, (mod) => {
  // This self-hosted installation currently uses HTTP on the home network.
  mod.modResults.manifest.application[0].$['android:usesCleartextTraffic'] = 'true';
  return mod;
});
