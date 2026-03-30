const EARTH_RADIUS_KM = 6371;

const degreesToRadians = (degrees) => (degrees * Math.PI) / 180;

const calculateDistanceKm = (startLat, startLng, endLat, endLng) => {
  const dLat = degreesToRadians(endLat - startLat);
  const dLng = degreesToRadians(endLng - startLng);
  const lat1 = degreesToRadians(startLat);
  const lat2 = degreesToRadians(endLat);

  const haversineA =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const haversineC = 2 * Math.atan2(Math.sqrt(haversineA), Math.sqrt(1 - haversineA));

  return EARTH_RADIUS_KM * haversineC;
};

const buildBoundingBox = (latitude, longitude, radiusKm) => {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos(degreesToRadians(latitude)));

  return {
    minLat: latitude - latDelta,
    maxLat: latitude + latDelta,
    minLng: longitude - lngDelta,
    maxLng: longitude + lngDelta
  };
};

const filterSpotsWithinRadius = (spots, latitude, longitude, radiusKm) =>
  spots
    .map((spot) => ({
      ...spot,
      distanceKm: Number(
        calculateDistanceKm(latitude, longitude, spot.latitude, spot.longitude).toFixed(3)
      )
    }))
    .filter((spot) => spot.distanceKm <= radiusKm)
    .sort((left, right) => left.distanceKm - right.distanceKm);

module.exports = {
  calculateDistanceKm,
  buildBoundingBox,
  filterSpotsWithinRadius
};
