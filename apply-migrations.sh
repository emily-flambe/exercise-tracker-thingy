#!/bin/bash
# Script to manually apply migrations to production

echo "Applying migrations to production D1 database..."
npx wrangler d1 migrations apply workout-db --remote

echo ""
echo "Listing applied migrations:"
npx wrangler d1 migrations list workout-db --remote
