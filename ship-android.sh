#!/bin/bash
set -e

# Load Firebase env vars from .env so they get baked into the build
if [ -f .env ]; then
  set -a && source .env && set +a
else
  echo "Error: .env not found. Copy .env.example and fill in your Firebase values."
  exit 1
fi

echo "▶ Bumping Android version code..."
node -e "
const fs = require('fs');
let c = fs.readFileSync('app.config.js', 'utf8');
c = c.replace(/versionCode: (\d+)/, (_, n) => 'versionCode: ' + (parseInt(n) + 1));
fs.writeFileSync('app.config.js', c);
const match = c.match(/versionCode: (\d+)/);
console.log('  versionCode →', match[1]);
"

echo "▶ Building Android..."
EAS_BUILD_NO_EXPO_GO_WARNING=true eas build --platform android --profile production --local

AAB=$(ls -t build-*.aab 2>/dev/null | head -1)
if [ -z "$AAB" ]; then
  echo "Error: no .aab file found after build."
  exit 1
fi

if [ -f bingoo-service-account.json ]; then
  echo "▶ Submitting $AAB to Google Play (internal track)..."
  eas submit --platform android --path "$AAB" --profile production --non-interactive
  echo "✓ Done. Check Google Play Console → Internal testing in ~10 minutes."
else
  echo "⚠ Skipping submit — google-play-key.json not found."
  echo "  To enable: https://expo.dev/docs/submit/android"
  echo "✓ Build done: $AAB"
fi
