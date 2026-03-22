#!/bin/bash
set -e

# Load Firebase env vars from .env so they get baked into the build
if [ -f .env ]; then
  set -a && source .env && set +a
else
  echo "Error: .env not found. Copy .env.example and fill in your Firebase values."
  exit 1
fi

# Bump iOS build number
CURRENT=$(node -e "const c = require('./app.config.js'); console.log(c.default.expo.ios.buildNumber)")
NEXT=$((CURRENT + 1))
sed -i '' "s/buildNumber: '$CURRENT'/buildNumber: '$NEXT'/" app.config.js
echo "▶ Build number bumped: $CURRENT → $NEXT"
git add app.config.js && git commit -m "chore: bump iOS build number to $NEXT" && git push

echo "▶ Building..."
eas build --platform ios --profile production --local

# Find the IPA that was just produced
IPA=$(ls -t build-*.ipa 2>/dev/null | head -1)
if [ -z "$IPA" ]; then
  echo "Error: no .ipa file found after build."
  exit 1
fi

echo "▶ Submitting $IPA to TestFlight..."
eas submit --platform ios --path "$IPA" --profile production --non-interactive --no-wait

echo "✓ Done. Check App Store Connect → TestFlight in ~10 minutes."
