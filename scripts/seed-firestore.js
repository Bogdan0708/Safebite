/**
 * Firestore Seed Script for SafeBite
 *
 * Seeds initial test restaurants with safety profiles and trust scores.
 * Run with: node seed-firestore.js
 */

const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// Try to find credentials
let app;

// Check for service account key first
const serviceAccountPath = path.join(__dirname, 'service-account.json');
if (fs.existsSync(serviceAccountPath)) {
  console.log('Using service account credentials');
  app = initializeApp({
    credential: cert(serviceAccountPath),
    projectId: 'safebite-production-13ba1'
  });
} else {
  // Try application default credentials
  console.log('Using application default credentials');
  console.log('If this fails, create a service account key at:');
  console.log('https://console.firebase.google.com/project/safebite-production-13ba1/settings/serviceaccounts/adminsdk');
  console.log('');

  try {
    app = initializeApp({
      credential: applicationDefault(),
      projectId: 'safebite-production-13ba1'
    });
  } catch (error) {
    console.error('Failed to initialize with ADC. Please create a service account:');
    console.error('1. Go to Firebase Console > Project Settings > Service Accounts');
    console.error('2. Click "Generate new private key"');
    console.error('3. Save as scripts/service-account.json');
    process.exit(1);
  }
}

const db = getFirestore();

// Sample restaurants across Europe
const restaurants = [
  {
    id: 'uk-london-001',
    googlePlaceId: 'ChIJdd4hrwug2EcRmSrV3Vo6llI',
    name: 'The Gluten Free Kitchen',
    address: '123 High Street',
    city: 'London',
    country: 'United Kingdom',
    latitude: 51.5074,
    longitude: -0.1278,
    cuisineTypes: ['British', 'Bakery'],
    priceLevel: 2,
    hasDedicatedKitchen: true,
    hasSeparateFryer: true,
    hasTrainedStaff: true,
    staffTrainingType: 'Coeliac UK Accredited',
    certifications: ['Coeliac UK Accredited'],
    hasDedicatedMenu: true,
    verificationMethod: 'dietitianVerified',
    verifiedBy: 'Sarah Jones, RD',
    lastVerifiedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    professionalScore: 35,
    reviewCount: 47,
    averageSafetyRating: 4.8,
    incidentCount: 0,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  },
  {
    id: 'uk-london-002',
    googlePlaceId: null,
    name: 'Celiac Kitchen London',
    address: '45 Borough Market',
    city: 'London',
    country: 'United Kingdom',
    latitude: 51.5055,
    longitude: -0.0910,
    cuisineTypes: ['British', 'Modern European'],
    priceLevel: 3,
    hasDedicatedKitchen: true,
    hasSeparateFryer: true,
    hasTrainedStaff: true,
    staffTrainingType: 'AllerTrain',
    certifications: ['Coeliac UK Accredited', 'GFCO Certified'],
    hasDedicatedMenu: true,
    verificationMethod: 'certificationVerified',
    verifiedBy: 'Coeliac UK',
    lastVerifiedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    professionalScore: 40,
    reviewCount: 89,
    averageSafetyRating: 4.9,
    incidentCount: 0,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  },
  {
    id: 'uk-manchester-001',
    googlePlaceId: null,
    name: 'Northern Quarter GF',
    address: '78 Oldham Street',
    city: 'Manchester',
    country: 'United Kingdom',
    latitude: 53.4839,
    longitude: -2.2357,
    cuisineTypes: ['Cafe', 'Brunch'],
    priceLevel: 2,
    hasDedicatedKitchen: false,
    hasSeparateFryer: true,
    hasTrainedStaff: true,
    staffTrainingType: 'In-House Training',
    certifications: [],
    hasDedicatedMenu: true,
    verificationMethod: 'communityVerified',
    verifiedBy: null,
    lastVerifiedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
    professionalScore: 15,
    reviewCount: 23,
    averageSafetyRating: 4.2,
    incidentCount: 1,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  },
  {
    id: 'it-rome-001',
    googlePlaceId: null,
    name: 'Ristorante Senza Glutine',
    address: 'Via del Corso 156',
    city: 'Rome',
    country: 'Italy',
    latitude: 41.9028,
    longitude: 12.4964,
    cuisineTypes: ['Italian', 'Pizza', 'Pasta'],
    priceLevel: 2,
    hasDedicatedKitchen: true,
    hasSeparateFryer: true,
    hasTrainedStaff: true,
    staffTrainingType: 'AIC Certified',
    certifications: ['AIC (Italian Coeliac Association)'],
    hasDedicatedMenu: true,
    verificationMethod: 'certificationVerified',
    verifiedBy: 'AIC Italia',
    lastVerifiedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    professionalScore: 38,
    reviewCount: 156,
    averageSafetyRating: 4.7,
    incidentCount: 0,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  },
  {
    id: 'it-milan-001',
    googlePlaceId: null,
    name: 'Pizzeria Celiachia',
    address: 'Corso Buenos Aires 42',
    city: 'Milan',
    country: 'Italy',
    latitude: 45.4773,
    longitude: 9.2082,
    cuisineTypes: ['Italian', 'Pizza'],
    priceLevel: 2,
    hasDedicatedKitchen: true,
    hasSeparateFryer: true,
    hasTrainedStaff: true,
    staffTrainingType: 'AIC Certified',
    certifications: ['AIC (Italian Coeliac Association)'],
    hasDedicatedMenu: true,
    verificationMethod: 'certificationVerified',
    verifiedBy: 'AIC Italia',
    lastVerifiedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    professionalScore: 37,
    reviewCount: 234,
    averageSafetyRating: 4.8,
    incidentCount: 1,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  },
  {
    id: 'de-berlin-001',
    googlePlaceId: null,
    name: 'Glutenfrei Berlin',
    address: 'Friedrichstraße 123',
    city: 'Berlin',
    country: 'Germany',
    latitude: 52.5200,
    longitude: 13.4050,
    cuisineTypes: ['German', 'European'],
    priceLevel: 2,
    hasDedicatedKitchen: false,
    hasSeparateFryer: true,
    hasTrainedStaff: true,
    staffTrainingType: 'DZG Certified',
    certifications: ['DZG (German Coeliac Society)'],
    hasDedicatedMenu: true,
    verificationMethod: 'certificationVerified',
    verifiedBy: 'DZG',
    lastVerifiedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    professionalScore: 32,
    reviewCount: 67,
    averageSafetyRating: 4.5,
    incidentCount: 0,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  },
  {
    id: 'fr-paris-001',
    googlePlaceId: null,
    name: 'Le Sans Gluten',
    address: '28 Rue de Rivoli',
    city: 'Paris',
    country: 'France',
    latitude: 48.8566,
    longitude: 2.3522,
    cuisineTypes: ['French', 'Bakery', 'Patisserie'],
    priceLevel: 3,
    hasDedicatedKitchen: true,
    hasSeparateFryer: true,
    hasTrainedStaff: true,
    staffTrainingType: 'In-House Training',
    certifications: [],
    hasDedicatedMenu: true,
    verificationMethod: 'ownerVerified',
    verifiedBy: 'Marie Dupont (Owner)',
    lastVerifiedAt: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000),
    professionalScore: 28,
    reviewCount: 89,
    averageSafetyRating: 4.6,
    incidentCount: 0,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  },
  {
    id: 'es-barcelona-001',
    googlePlaceId: null,
    name: 'Sin Gluten Barcelona',
    address: 'La Rambla 89',
    city: 'Barcelona',
    country: 'Spain',
    latitude: 41.3851,
    longitude: 2.1734,
    cuisineTypes: ['Spanish', 'Tapas'],
    priceLevel: 2,
    hasDedicatedKitchen: false,
    hasSeparateFryer: true,
    hasTrainedStaff: true,
    staffTrainingType: 'In-House Training',
    certifications: [],
    hasDedicatedMenu: true,
    verificationMethod: 'communityVerified',
    verifiedBy: null,
    lastVerifiedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    professionalScore: 12,
    reviewCount: 34,
    averageSafetyRating: 4.1,
    incidentCount: 2,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  },
  {
    id: 'uk-edinburgh-001',
    googlePlaceId: null,
    name: 'Edinburgh GF Cafe',
    address: '12 Royal Mile',
    city: 'Edinburgh',
    country: 'United Kingdom',
    latitude: 55.9533,
    longitude: -3.1883,
    cuisineTypes: ['Scottish', 'Cafe', 'Bakery'],
    priceLevel: 2,
    hasDedicatedKitchen: true,
    hasSeparateFryer: true,
    hasTrainedStaff: true,
    staffTrainingType: 'Coeliac UK Accredited',
    certifications: ['Coeliac UK Accredited'],
    hasDedicatedMenu: true,
    verificationMethod: 'dietitianVerified',
    verifiedBy: 'Dr. James MacLeod, RD',
    lastVerifiedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
    professionalScore: 36,
    reviewCount: 78,
    averageSafetyRating: 4.7,
    incidentCount: 0,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  },
  {
    id: 'uk-bristol-001',
    googlePlaceId: null,
    name: 'Bristol Free From',
    address: '45 Clifton Village',
    city: 'Bristol',
    country: 'United Kingdom',
    latitude: 51.4545,
    longitude: -2.5879,
    cuisineTypes: ['British', 'Vegan', 'Health Food'],
    priceLevel: 2,
    hasDedicatedKitchen: true,
    hasSeparateFryer: true,
    hasTrainedStaff: false,
    staffTrainingType: null,
    certifications: [],
    hasDedicatedMenu: true,
    verificationMethod: 'unverified',
    verifiedBy: null,
    lastVerifiedAt: null,
    professionalScore: 0,
    reviewCount: 12,
    averageSafetyRating: 4.0,
    incidentCount: 0,
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }
];

// Calculate trust scores
function calculateTrustScore(restaurant) {
  const professionalScore = restaurant.professionalScore;
  const communityScore = Math.min(35, Math.floor(restaurant.reviewCount * 0.3 * (restaurant.averageSafetyRating / 5)));

  let freshnessScore = 0;
  if (restaurant.lastVerifiedAt) {
    const daysSince = Math.floor((Date.now() - restaurant.lastVerifiedAt.getTime()) / (24 * 60 * 60 * 1000));
    if (daysSince <= 7) freshnessScore = 25;
    else if (daysSince <= 30) freshnessScore = 20;
    else if (daysSince <= 90) freshnessScore = 15;
    else if (daysSince <= 180) freshnessScore = 10;
    else if (daysSince <= 365) freshnessScore = 5;
  }

  const totalScore = Math.min(100, professionalScore + communityScore + freshnessScore);

  let trustLevel;
  if (totalScore >= 80) trustLevel = 'verified';
  else if (totalScore >= 60) trustLevel = 'communitySafe';
  else if (totalScore >= 30) trustLevel = 'useCaution';
  else trustLevel = 'unverified';

  return {
    restaurantId: restaurant.id,
    professionalScore,
    communityScore,
    freshnessScore,
    totalScore,
    trustLevel,
    lastCalculatedAt: FieldValue.serverTimestamp()
  };
}

// Sample reviews
const reviews = [
  {
    id: 'review-001',
    restaurantId: 'uk-london-001',
    userId: 'sample-user-001',
    userDisplayName: 'Emma T.',
    isVerifiedReviewer: true,
    content: 'Absolutely fantastic! Staff were incredibly knowledgeable about coeliac disease. They showed me their dedicated prep area and explained their protocols. The food was delicious too!',
    safetyRating: 5,
    foodRating: 5,
    hadReaction: false,
    itemsOrdered: ['GF Fish & Chips', 'Victoria Sponge'],
    photoURLs: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  },
  {
    id: 'review-002',
    restaurantId: 'uk-london-001',
    userId: 'sample-user-002',
    userDisplayName: 'David K.',
    isVerifiedReviewer: true,
    content: 'Best GF bakery in London. Everything is made in a dedicated gluten-free kitchen. The sourdough is incredible.',
    safetyRating: 5,
    foodRating: 5,
    hadReaction: false,
    itemsOrdered: ['GF Sourdough', 'Almond Croissant'],
    photoURLs: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  },
  {
    id: 'review-003',
    restaurantId: 'it-rome-001',
    userId: 'sample-user-003',
    userDisplayName: 'Sofia M.',
    isVerifiedReviewer: true,
    content: 'Finally proper Italian GF pasta! AIC certified so you know they take it seriously. The carbonara was perfect.',
    safetyRating: 5,
    foodRating: 5,
    hadReaction: false,
    itemsOrdered: ['Carbonara GF', 'Tiramisu GF'],
    photoURLs: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  },
  {
    id: 'review-004',
    restaurantId: 'uk-manchester-001',
    userId: 'sample-user-004',
    userDisplayName: 'James W.',
    isVerifiedReviewer: false,
    content: 'Nice cafe with good options. No dedicated kitchen but they were careful. Had a slight reaction but might have been unrelated.',
    safetyRating: 3,
    foodRating: 4,
    hadReaction: true,
    itemsOrdered: ['GF Pancakes', 'Eggs Benedict on GF bread'],
    photoURLs: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }
];

async function seedDatabase() {
  console.log('🔥 Starting Firestore seed...\n');

  try {
    // Seed restaurants
    console.log('📍 Seeding restaurants...');
    const restaurantBatch = db.batch();
    for (const restaurant of restaurants) {
      const ref = db.collection('restaurants').doc(restaurant.id);
      restaurantBatch.set(ref, restaurant);
    }
    await restaurantBatch.commit();
    console.log(`   ✓ Added ${restaurants.length} restaurants\n`);

    // Seed trust scores
    console.log('📊 Seeding trust scores...');
    const trustBatch = db.batch();
    for (const restaurant of restaurants) {
      const score = calculateTrustScore(restaurant);
      const ref = db.collection('trustScores').doc(restaurant.id);
      trustBatch.set(ref, score);
    }
    await trustBatch.commit();
    console.log(`   ✓ Added ${restaurants.length} trust scores\n`);

    // Seed reviews
    console.log('💬 Seeding reviews...');
    const reviewBatch = db.batch();
    for (const review of reviews) {
      const ref = db.collection('reviews').doc(review.id);
      reviewBatch.set(ref, review);
    }
    await reviewBatch.commit();
    console.log(`   ✓ Added ${reviews.length} reviews\n`);

    console.log('✅ Database seeded successfully!\n');
    console.log('Restaurants by city:');
    const cityCounts = restaurants.reduce((acc, r) => {
      acc[r.city] = (acc[r.city] || 0) + 1;
      return acc;
    }, {});
    Object.entries(cityCounts).forEach(([city, count]) => {
      console.log(`   - ${city}: ${count}`);
    });

    console.log('\nTrust levels:');
    const levelCounts = restaurants.reduce((acc, r) => {
      const score = calculateTrustScore(r);
      acc[score.trustLevel] = (acc[score.trustLevel] || 0) + 1;
      return acc;
    }, {});
    Object.entries(levelCounts).forEach(([level, count]) => {
      console.log(`   - ${level}: ${count}`);
    });

  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
    if (error.message.includes('Could not load the default credentials')) {
      console.error('\n📋 To fix this, create a service account key:');
      console.error('1. Go to: https://console.firebase.google.com/project/safebite-production-13ba1/settings/serviceaccounts/adminsdk');
      console.error('2. Click "Generate new private key"');
      console.error('3. Save the file as: scripts/service-account.json');
      console.error('4. Run this script again');
    }
    process.exit(1);
  }

  process.exit(0);
}

seedDatabase();
