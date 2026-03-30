-- CreateEnum
CREATE TYPE "ParkingSpotType" AS ENUM ('street', 'garage', 'private');

-- CreateEnum
CREATE TYPE "RestrictionType" AS ENUM ('street_cleaning', 'permit', 'meter');

-- CreateEnum
CREATE TYPE "ParkingSessionStatus" AS ENUM ('pending', 'active', 'completed', 'expired', 'cancelled');

-- CreateTable
CREATE TABLE "ParkingSpot" (
    "id" SERIAL NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "type" "ParkingSpotType" NOT NULL,
    "pricePerHour" DECIMAL(10,2) NOT NULL,
    "streetName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParkingSpot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingRule" (
    "id" SERIAL NOT NULL,
    "streetName" TEXT NOT NULL,
    "restrictionType" "RestrictionType" NOT NULL,
    "activeDays" TEXT[],
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParkingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" SERIAL NOT NULL,
    "spotId" INTEGER NOT NULL,
    "predictedAvailability" BOOLEAN NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingSession" (
    "id" SERIAL NOT NULL,
    "spotId" INTEGER NOT NULL,
    "amountPaid" DECIMAL(10,2) NOT NULL,
    "status" "ParkingSessionStatus" NOT NULL DEFAULT 'pending',
    "stripeSessionId" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParkingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParkingSpot_latitude_longitude_idx" ON "ParkingSpot"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "ParkingSpot_streetName_idx" ON "ParkingSpot"("streetName");

-- CreateIndex
CREATE INDEX "ParkingSpot_type_isAvailable_idx" ON "ParkingSpot"("type", "isAvailable");

-- CreateIndex
CREATE INDEX "ParkingRule_streetName_idx" ON "ParkingRule"("streetName");

-- CreateIndex
CREATE INDEX "Prediction_spotId_timestamp_idx" ON "Prediction"("spotId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingSession_stripeSessionId_key" ON "ParkingSession"("stripeSessionId");

-- CreateIndex
CREATE INDEX "ParkingSession_spotId_status_idx" ON "ParkingSession"("spotId", "status");

-- CreateIndex
CREATE INDEX "ParkingSession_expiresAt_idx" ON "ParkingSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "ParkingSpot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingSession" ADD CONSTRAINT "ParkingSession_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "ParkingSpot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
