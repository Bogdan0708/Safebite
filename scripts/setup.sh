#!/bin/bash

# SafeBite Firebase Setup Script
# Run this after `firebase login`

set -e

echo "🔥 SafeBite Firebase Setup"
echo "=========================="
echo ""

# Check if logged in
if ! firebase projects:list &>/dev/null; then
    echo "❌ Not logged in to Firebase. Run: firebase login"
    exit 1
fi

echo "✓ Firebase authenticated"
echo ""

# Change to SafeBite directory
cd "$(dirname "$0")/.."

# Check if firebase.json exists
if [ ! -f "firebase.json" ]; then
    echo "❌ firebase.json not found. Are you in the SafeBite directory?"
    exit 1
fi

echo "Project: safebite-production-13ba1"
echo ""

# Deploy Firestore rules
echo "📋 Deploying Firestore security rules..."
firebase deploy --only firestore:rules
echo "✓ Rules deployed"
echo ""

# Deploy Firestore indexes
echo "📇 Deploying Firestore indexes..."
firebase deploy --only firestore:indexes
echo "✓ Indexes deployed"
echo ""

# Install script dependencies
echo "📦 Installing seed script dependencies..."
cd scripts
npm install --silent
cd ..
echo "✓ Dependencies installed"
echo ""

# Ask about seeding
read -p "🌱 Seed test data to Firestore? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Seeding database..."
    cd scripts

    # For seeding, we need service account or ADC
    # Try with gcloud application-default credentials first
    if command -v gcloud &> /dev/null; then
        export GOOGLE_APPLICATION_CREDENTIALS="$(gcloud info --format='value(config.paths.global_config_dir)')/application_default_credentials.json"
    fi

    # Run seed script
    node seed-firestore.js
    cd ..
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Open Package.swift in Xcode on macOS"
echo "2. Set Bundle ID to: com.mitch.safebite"
echo "3. Add GoogleService-Info.plist to target"
echo "4. Set GOOGLE_PLACES_API_KEY environment variable"
echo "5. Run on simulator or device"
