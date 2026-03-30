import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { io } from 'socket.io-client';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
import HeatmapLayer from './HeatmapLayer.jsx';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
const DEFAULT_CENTER = {
  lat: 40.758,
  lng: -73.9855
};
const DEFAULT_RADIUS_KM = 5;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

const calculateDistanceKm = (startLat, startLng, endLat, endLng) => {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(endLat - startLat);
  const dLng = toRadians(endLng - startLng);
  const lat1 = toRadians(startLat);
  const lat2 = toRadians(endLat);

  const haversine =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
};

const mergeSpotUpdate = (spots, updatedSpot, viewport) => {
  const distanceFromViewport = calculateDistanceKm(
    viewport.lat,
    viewport.lng,
    updatedSpot.latitude,
    updatedSpot.longitude
  );
  const isInViewport = distanceFromViewport <= viewport.radiusKm * 1.2;
  const existingIndex = spots.findIndex((spot) => spot.id === updatedSpot.id);

  if (!isInViewport && existingIndex === -1) {
    return spots;
  }

  if (!isInViewport && existingIndex >= 0) {
    return spots.filter((spot) => spot.id !== updatedSpot.id);
  }

  if (existingIndex === -1) {
    return [...spots, updatedSpot].sort((left, right) => {
      const leftDistance = left.distanceKm ?? Number.POSITIVE_INFINITY;
      const rightDistance = right.distanceKm ?? Number.POSITIVE_INFINITY;
      return leftDistance - rightDistance;
    });
  }

  return spots.map((spot) => (spot.id === updatedSpot.id ? { ...spot, ...updatedSpot } : spot));
};

function ViewportWatcher({ onViewportChange }) {
  const debounceRef = useRef();
  const map = useMapEvents({
    moveend() {
      const center = map.getCenter();
      const northEast = map.getBounds().getNorthEast();
      const nextRadius = Math.max(
        1,
        Math.min(calculateDistanceKm(center.lat, center.lng, northEast.lat, northEast.lng), 8)
      );

      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        onViewportChange({
          lat: Number(center.lat.toFixed(6)),
          lng: Number(center.lng.toFixed(6)),
          radiusKm: Number(nextRadius.toFixed(2))
        });
      }, 300);
    }
  });

  useEffect(
    () => () => {
      window.clearTimeout(debounceRef.current);
    },
    []
  );

  return null;
}

function ParkingMap({ showHeatmap }) {
  const [spots, setSpots] = useState([]);
  const [heatmapPoints, setHeatmapPoints] = useState([]);
  const [loadingState, setLoadingState] = useState('Loading parking map...');
  const [viewport, setViewport] = useState({
    lat: DEFAULT_CENTER.lat,
    lng: DEFAULT_CENTER.lng,
    radiusKm: DEFAULT_RADIUS_KM
  });
  const viewportRef = useRef(viewport);
  const heatmapDebounceRef = useRef();
  const deferredHeatmapPoints = useDeferredValue(heatmapPoints);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    const fetchParkingSpots = async () => {
      try {
        setLoadingState('Loading parking markers...');
        const response = await fetch(
          `${API_BASE_URL}/parking/nearby?lat=${viewport.lat}&lng=${viewport.lng}&radius=${viewport.radiusKm}&page=1&limit=250`
        );

        if (!response.ok) {
          throw new Error(`Failed to load parking spots: ${response.status}`);
        }

        const payload = await response.json();
        startTransition(() => {
          setSpots(payload.data || []);
          setLoadingState(`Showing ${payload.meta?.total ?? payload.data?.length ?? 0} nearby spots`);
        });
      } catch (error) {
        setLoadingState(error.message);
      }
    };

    fetchParkingSpots();
  }, [viewport]);

  useEffect(() => {
    const fetchHeatmap = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/parking/heatmap`);

        if (!response.ok) {
          throw new Error(`Failed to load heatmap: ${response.status}`);
        }

        const payload = await response.json();
        startTransition(() => {
          setHeatmapPoints(Array.isArray(payload) ? payload : payload.points || []);
        });
      } catch (error) {
        setLoadingState(error.message);
      }
    };

    fetchHeatmap();
  }, []);

  useEffect(() => {
    const socket = io(API_BASE_URL, {
      transports: ['websocket']
    });

    socket.on('parking:update', (payload) => {
      if (!payload?.spot) {
        return;
      }

      startTransition(() => {
        setSpots((currentSpots) =>
          mergeSpotUpdate(currentSpots, payload.spot, viewportRef.current)
        );
      });
    });

    socket.on('heatmap:update', (payload) => {
      window.clearTimeout(heatmapDebounceRef.current);
      heatmapDebounceRef.current = window.setTimeout(() => {
        startTransition(() => {
          setHeatmapPoints(Array.isArray(payload) ? payload : payload.points || []);
        });
      }, 150);
    });

    return () => {
      window.clearTimeout(heatmapDebounceRef.current);
      socket.disconnect();
    };
  }, []);

  const markerSummary = useMemo(() => {
    const availableCount = spots.filter((spot) => spot.isAvailable).length;

    return {
      total: spots.length,
      available: availableCount,
      occupied: spots.length - availableCount
    };
  }, [spots]);

  return (
    <div className="map-shell">
      <div className="map-toolbar">
        <span>{loadingState}</span>
        <span>
          Available: <strong>{markerSummary.available}</strong> / {markerSummary.total}
        </span>
      </div>

      <MapContainer
        center={[DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]}
        zoom={14}
        className="parking-map"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ViewportWatcher onViewportChange={setViewport} />
        <HeatmapLayer points={deferredHeatmapPoints} visible={showHeatmap} />

        {spots.map((spot) => (
          <Marker key={spot.id} position={[spot.latitude, spot.longitude]}>
            <Popup>
              <div className="popup-content">
                <strong>{spot.streetName}</strong>
                <span>Spot #{spot.id}</span>
                <span>Type: {spot.type}</span>
                <span>Status: {spot.availabilityStatus || (spot.isAvailable ? 'available' : 'occupied')}</span>
                <span>Price: ${Number(spot.pricePerHour).toFixed(2)} / session</span>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export default ParkingMap;
