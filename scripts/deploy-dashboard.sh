#!/bin/bash
set -e

cd "$(dirname "$0")/../dashboard"

VITE_API_URL="${VITE_API_URL:-https://mahoraga.arushshankar.workers.dev/agent}"

echo "Building dashboard with API URL: $VITE_API_URL"
VITE_API_URL="$VITE_API_URL" npm run build

echo "Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist --project-name mahoraga-dashboard

echo "Done!"
