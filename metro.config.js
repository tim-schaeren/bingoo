const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase uses the "react-native" field in @firebase/auth/package.json to
// provide a React Native-specific bundle (dist/rn/index.js) that includes
// getReactNativePersistence and proper auth component registration.
// Metro's package `exports` field resolution takes precedence over "react-native"
// and routes imports to the browser bundle instead, breaking Firebase Auth.
// Setting this to false restores the classic resolution order where "react-native"
// beats "browser" and "main".
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
