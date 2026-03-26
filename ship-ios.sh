#!/bin/bash
set -e

# Load Firebase env vars from .env so they get baked into the build
if [ -f .env ]; then
  set -a && source .env && set +a
else
  echo "Error: .env not found. Copy .env.example and fill in your Firebase values."
  exit 1
fi

echo "▶ Building iOS..."
EAS_BUILD_NO_EXPO_GO_WARNING=true eas build --platform ios --profile production --local

IPA=$(ls -t build-*.ipa 2>/dev/null | head -1)
if [ -z "$IPA" ]; then
  echo "Error: no .ipa file found after build."
  exit 1
fi

echo "▶ Submitting $IPA to TestFlight..."
eas submit --platform ios --path "$IPA" --profile production --non-interactive --no-wait

echo "✓ Done. Check App Store Connect → TestFlight in ~10 minutes."
