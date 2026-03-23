#!/bin/bash
set -e

# Load Firebase env vars from .env so they get baked into the build
if [ -f .env ]; then
  set -a && source .env && set +a
else
  echo "Error: .env not found. Copy .env.example and fill in your Firebase values."
  exit 1
fi

# Google Play service account key required for submission
if [ ! -f google-play-key.json ]; then
  echo "Error: google-play-key.json not found."
  echo "Download it from Google Play Console → Setup → API access → Service account → JSON key."
  exit 1
fi

export ANDROID_HOME=$HOME/Library/Android/sdk
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

echo "▶ Building..."
EAS_BUILD_NO_EXPO_GO_WARNING=true eas build --platform android --profile production --local

# Find the AAB that was just produced
AAB=$(ls -t build-*.aab 2>/dev/null | head -1)
if [ -z "$AAB" ]; then
  echo "Error: no .aab file found after build."
  exit 1
fi

echo "▶ Submitting $AAB to Google Play (internal track)..."
eas submit --platform android --path "$AAB" --profile production --non-interactive --no-wait

echo "✓ Done. Check Google Play Console → Internal testing in a few minutes."
