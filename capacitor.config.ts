import type { CapacitorConfig } from '@capacitor/cli';

// Native push is delivered through @capacitor-firebase/messaging (FCM), which
// needs no entry here — it reads its config from the native GoogleService
// files added during the iOS/Android setup (see CAPACITOR_PUSH_SETUP.md).
// (Do NOT add a `PushNotifications` plugin block: that plugin is not installed
// and would point at a different, unused implementation.)
const config: CapacitorConfig = {
  appId: 'com.treasuretrail.app',
  appName: 'TreasureTrail',
  webDir: 'dist',
};

export default config;
