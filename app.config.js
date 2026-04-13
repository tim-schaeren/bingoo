export default {
  expo: {
    name: 'bingoo',
    slug: 'bingoo',
    version: '1.1.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'bingoo',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#F9F7FE',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.bingoo.app',
      buildNumber: '12',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSUserNotificationsUsageDescription: 'bingoo notifies you when a prediction comes true, the game starts, or someone wins.',
      },
    },
    android: {
      package: 'com.bingoo.app',
      versionCode: 8,
      adaptiveIcon: {
        backgroundColor: '#6C3CE2',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      intentFilters: [
        {
          action: 'VIEW',
          data: [{ scheme: 'bingoo' }],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      ['expo-notifications', { icon: './assets/icon.png', color: '#6C3CE2' }],
      ['expo-av', { microphonePermission: false }],
    ],
    extra: {
      // These values are bundled into the app binary and are visible to anyone
      // who inspects the build. This is standard for React Native + Firebase.
      // Firestore security rules are the actual security layer — not these keys.
      firebaseApiKey: process.env.FIREBASE_API_KEY,
      firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
      firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId: process.env.FIREBASE_APP_ID,
      eas: {
        projectId: '206cbb27-b38a-462e-b5fa-672de4ad55c8',
      },
    },
  },
};
