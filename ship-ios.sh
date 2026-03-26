#!/bin/bash
set -e

# Load Firebase env vars from .env so they get baked into the build
if [ -f .env ]; then
  set -a && source .env && set +a
else
  echo "Error: .env not found. Copy .env.example and fill in your Firebase values."
  exit 1
fi

echo "▶ Bumping iOS build number..."
node -e "
const fs = require('fs');
let c = fs.readFileSync('app.config.js', 'utf8');
c = c.replace(/buildNumber: '(\d+)'/, (_, n) => 'buildNumber: \'' + (parseInt(n) + 1) + '\'');
fs.writeFileSync('app.config.js', c);
const match = c.match(/buildNumber: '(\d+)'/);
console.log('  buildNumber →', match[1]);
"

echo "▶ Building iOS..."
EAS_BUILD_NO_EXPO_GO_WARNING=true eas build --platform ios --profile production --local

IPA=$(ls -t build-*.ipa 2>/dev/null | head -1)
if [ -z "$IPA" ]; then
  echo "Error: no .ipa file found after build."
  exit 1
fi

echo "▶ Submitting $IPA to TestFlight..."
eas submit --platform ios --path "$IPA" --profile production --non-interactive

echo "✓ Done. Check App Store Connect → TestFlight in ~10 minutes."
