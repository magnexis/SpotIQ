require('dotenv').config();

const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

const getBaselineAvailabilityProbability = (type, at = new Date()) => {
  const hour = at.getHours();
  const isWeekend = [0, 6].includes(at.getDay());
  let baseline;

  switch (type) {
    case 'street':
      if (hour < 6) baseline = 0.9;
      else if (hour < 9) baseline = 0.32;
      else if (hour < 12) baseline = 0.48;
      else if (hour < 16) baseline = 0.38;
      else if (hour < 19) baseline = 0.26;
      else if (hour < 22) baseline = 0.52;
      else baseline = 0.74;
      if (isWeekend) baseline += 0.12;
      break;
    case 'garage':
      if (hour < 7) baseline = 0.82;
      else if (hour < 10) baseline = 0.41;
      else if (hour < 16) baseline = 0.57;
      else if (hour < 20) baseline = 0.46;
      else baseline = 0.7;
      if (isWeekend) baseline += 0.08;
      break;
    case 'private':
      if (hour < 7) baseline = 0.18;
      else if (hour < 18) baseline = 0.62;
      else if (hour < 22) baseline = 0.34;
      else baseline = 0.22;
      if (isWeekend) baseline -= 0.08;
      break;
    default:
      baseline = 0.5;
  }

  return clamp(baseline, 0.05, 0.95);
};

const streetRules = [
  {
    streetName: 'Broadway',
    restrictionType: 'meter',
    activeDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    startTime: '08:00',
    endTime: '20:00'
  },
  {
    streetName: 'Broadway',
    restrictionType: 'street_cleaning',
    activeDays: ['Tuesday', 'Friday'],
    startTime: '11:00',
    endTime: '12:30'
  },
  {
    streetName: '5th Avenue',
    restrictionType: 'meter',
    activeDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    startTime: '09:00',
    endTime: '19:00'
  },
  {
    streetName: 'Lexington Avenue',
    restrictionType: 'permit',
    activeDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    startTime: '00:00',
    endTime: '23:59'
  },
  {
    streetName: 'Madison Avenue',
    restrictionType: 'street_cleaning',
    activeDays: ['Wednesday'],
    startTime: '08:30',
    endTime: '10:00'
  },
  {
    streetName: 'Park Avenue',
    restrictionType: 'meter',
    activeDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    startTime: '07:00',
    endTime: '22:00'
  },
  {
    streetName: 'Hudson Street',
    restrictionType: 'street_cleaning',
    activeDays: ['Monday', 'Thursday'],
    startTime: '09:30',
    endTime: '11:00'
  },
  {
    streetName: 'Canal Street',
    restrictionType: 'meter',
    activeDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    startTime: '08:00',
    endTime: '18:00'
  },
  {
    streetName: 'Houston Street',
    restrictionType: 'street_cleaning',
    activeDays: ['Tuesday'],
    startTime: '09:00',
    endTime: '10:30'
  },
  {
    streetName: 'Delancey Street',
    restrictionType: 'permit',
    activeDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    startTime: '18:00',
    endTime: '07:00'
  },
  {
    streetName: '14th Street',
    restrictionType: 'meter',
    activeDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    startTime: '08:00',
    endTime: '21:00'
  },
  {
    streetName: '23rd Street',
    restrictionType: 'street_cleaning',
    activeDays: ['Thursday'],
    startTime: '10:00',
    endTime: '11:30'
  },
  {
    streetName: '34th Street',
    restrictionType: 'meter',
    activeDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    startTime: '07:00',
    endTime: '22:00'
  },
  {
    streetName: '42nd Street',
    restrictionType: 'street_cleaning',
    activeDays: ['Friday'],
    startTime: '09:30',
    endTime: '11:00'
  }
];

const streetCoordinates = [
  { streetName: 'Broadway', latitude: 40.7196, longitude: -74.0027 },
  { streetName: '5th Avenue', latitude: 40.7614, longitude: -73.9776 },
  { streetName: 'Lexington Avenue', latitude: 40.7516, longitude: -73.9736 },
  { streetName: 'Madison Avenue', latitude: 40.7553, longitude: -73.979 },
  { streetName: 'Park Avenue', latitude: 40.7543, longitude: -73.9767 },
  { streetName: 'Hudson Street', latitude: 40.7288, longitude: -74.0072 },
  { streetName: 'Canal Street', latitude: 40.7191, longitude: -74.0007 },
  { streetName: 'Houston Street', latitude: 40.7283, longitude: -73.9941 },
  { streetName: 'Delancey Street', latitude: 40.7186, longitude: -73.988 },
  { streetName: '14th Street', latitude: 40.7386, longitude: -73.9965 },
  { streetName: '23rd Street', latitude: 40.7411, longitude: -73.9897 },
  { streetName: '34th Street', latitude: 40.7506, longitude: -73.9894 },
  { streetName: '42nd Street', latitude: 40.7577, longitude: -73.9857 }
];

const buildParkingSpots = () => {
  const spotTypes = ['street', 'garage', 'private'];
  const priceMatrix = {
    street: [2.5, 3, 3.5, 4, 4.5, 5],
    garage: [6, 7, 8, 9, 10, 12],
    private: [4, 5, 6, 7]
  };

  const spots = [];

  streetCoordinates.forEach((street, streetIndex) => {
    for (let index = 0; index < 5; index += 1) {
      const type = spotTypes[(streetIndex + index) % spotTypes.length];
      const latitudeOffset = ((index % 5) - 2) * 0.00055 + streetIndex * 0.00003;
      const longitudeOffset = ((index % 3) - 1) * 0.00062 - streetIndex * 0.00002;
      const priceOptions = priceMatrix[type];
      const pricePerHour = priceOptions[(streetIndex + index) % priceOptions.length];
      const initialAvailabilityProbability = clamp(
        getBaselineAvailabilityProbability(type, new Date()) + ((streetIndex % 4) - 1.5) * 0.03,
        0.1,
        0.9
      );

      spots.push({
        latitude: Number((street.latitude + latitudeOffset).toFixed(6)),
        longitude: Number((street.longitude + longitudeOffset).toFixed(6)),
        isAvailable: index % 2 === 0 ? initialAvailabilityProbability > 0.4 : initialAvailabilityProbability > 0.55,
        type,
        pricePerHour,
        streetName: street.streetName
      });
    }
  });

  return spots;
};

const buildPredictionHistory = (spots) => {
  const predictions = [];
  const now = new Date();

  spots.forEach((spot, spotIndex) => {
    for (let dayOffset = 14; dayOffset >= 1; dayOffset -= 1) {
      for (const hour of [0, 4, 8, 12, 16, 20]) {
        const timestamp = new Date(now);
        timestamp.setDate(now.getDate() - dayOffset);
        timestamp.setHours(hour, 0, 0, 0);

        const baseline = getBaselineAvailabilityProbability(spot.type, timestamp);
        const streetBias = ((spotIndex % 5) - 2) * 0.03;
        const weekendBoost = [0, 6].includes(timestamp.getDay()) ? 0.06 : 0;
        const probability = clamp(baseline + streetBias + weekendBoost, 0.05, 0.95);
        const predictedAvailability = probability >= 0.5;
        const confidence = clamp(0.65 + Math.abs(probability - 0.5) * 0.4, 0.55, 0.95);

        predictions.push({
          spotId: spot.id,
          predictedAvailability,
          confidence: Number(confidence.toFixed(2)),
          timestamp
        });
      }
    }
  });

  return predictions;
};

const buildCompletedSessions = (spots) => {
  const now = new Date();

  return spots.slice(0, 8).map((spot, index) => {
    const startTime = new Date(now);
    startTime.setDate(now.getDate() - (index + 1));
    startTime.setHours(8 + index, 0, 0, 0);

    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + 1);

    return {
      spotId: spot.id,
      amountPaid: Number(spot.pricePerHour),
      status: 'completed',
      stripeSessionId: `seed_session_${spot.id}_${index + 1}`,
      startTime,
      endTime,
      expiresAt: new Date(startTime.getTime() + 30 * 60 * 1000)
    };
  });
};

const seed = async () => {
  console.log(`Using environment from ${path.resolve(process.cwd(), '.env')}`);

  await prisma.prediction.deleteMany();
  await prisma.parkingSession.deleteMany();
  await prisma.parkingRule.deleteMany();
  await prisma.parkingSpot.deleteMany();

  await prisma.parkingRule.createMany({
    data: streetRules
  });

  const parkingSpots = buildParkingSpots();
  await prisma.parkingSpot.createMany({
    data: parkingSpots
  });

  const createdSpots = await prisma.parkingSpot.findMany({
    orderBy: {
      id: 'asc'
    }
  });

  const completedSessions = buildCompletedSessions(createdSpots);
  await prisma.parkingSession.createMany({
    data: completedSessions
  });

  const predictionHistory = buildPredictionHistory(createdSpots);

  for (let start = 0; start < predictionHistory.length; start += 500) {
    await prisma.prediction.createMany({
      data: predictionHistory.slice(start, start + 500)
    });
  }

  const availableCount = await prisma.parkingSpot.count({
    where: {
      isAvailable: true
    }
  });

  console.log(`Seeded ${createdSpots.length} parking spots.`);
  console.log(`Seeded ${streetRules.length} parking rules.`);
  console.log(`Seeded ${completedSessions.length} completed parking sessions.`);
  console.log(`Seeded ${predictionHistory.length} historical predictions.`);
  console.log(`${availableCount} spots are initially available.`);
};

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
