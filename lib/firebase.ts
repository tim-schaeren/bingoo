import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
// Import directly from @firebase/auth so Metro uses its "react-native" field
// in package.json, which resolves to dist/rn/index.js — the only bundle that
// exports getReactNativePersistence. Importing from 'firebase/auth' instead
// would hit the browser bundle (no react-native field in the firebase wrapper).
// @ts-ignore — types don't declare getReactNativePersistence but Metro resolves
// @firebase/auth to dist/rn/index.js (via "react-native" in package.json) which exports it
import { initializeAuth, getReactNativePersistence, getAuth } from '@firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const {
  firebaseApiKey,
  firebaseAuthDomain,
  firebaseProjectId,
  firebaseStorageBucket,
  firebaseMessagingSenderId,
  firebaseAppId,
} = Constants.expoConfig?.extra ?? {};

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: firebaseAuthDomain,
  projectId: firebaseProjectId,
  storageBucket: firebaseStorageBucket,
  messagingSenderId: firebaseMessagingSenderId,
  appId: firebaseAppId,
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);

// initializeAuth must only be called once per app instance.
// During Expo hot reload the module may re-evaluate while the Firebase app
// is still alive, so we fall back to getAuth() if already initialised.
let _auth;
try {
  _auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  _auth = getAuth(app);
}
export const auth = _auth;
