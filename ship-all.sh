#!/bin/bash
set -e

VERSION=${1:-""}

if [ -z "$VERSION" ]; then
  echo "Usage: bash ship-all.sh <version>"
  echo "  e.g. bash ship-all.sh 1.1.0"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "▶ Setting version to $VERSION..."
node -e "
const fs = require('fs');
let c = fs.readFileSync('app.config.js', 'utf8');
c = c.replace(/version: '[^']+'/, \"version: '$VERSION'\");
fs.writeFileSync('app.config.js', c);
const match = c.match(/version: '([^']+)'/);
console.log('  version →', match[1]);
"

bash "$SCRIPT_DIR/ship-ios.sh"
bash "$SCRIPT_DIR/ship-android.sh"

echo ""
echo "▶ Committing version bump..."
git add app.config.js
git commit -m "Bump version to $VERSION"
git tag "v$VERSION"

echo ""
echo "✓ Version $VERSION shipped to TestFlight and Google Play!"
echo "  Run 'git push && git push --tags' to push to remote."
