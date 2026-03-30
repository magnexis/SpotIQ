import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

function HeatmapLayer({ points, visible }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!map.getPane('heatmapPane')) {
      const pane = map.createPane('heatmapPane');
      pane.style.zIndex = '350';
    }

    if (!layerRef.current) {
      layerRef.current = L.heatLayer(points, {
        pane: 'heatmapPane',
        radius: 28,
        blur: 24,
        maxZoom: 18,
        minOpacity: 0.35,
        gradient: {
          0.2: '#22c55e',
          0.5: '#facc15',
          1.0: '#ef4444'
        }
      });
    }

    return () => {
      const heatLayer = layerRef.current;

      if (heatLayer && map.hasLayer(heatLayer)) {
        map.removeLayer(heatLayer);
      }
    };
  }, [map]);

  useEffect(() => {
    const heatLayer = layerRef.current;

    if (!heatLayer) {
      return undefined;
    }

    if (visible && !map.hasLayer(heatLayer)) {
      heatLayer.addTo(map);
    }

    if (!visible && map.hasLayer(heatLayer)) {
      map.removeLayer(heatLayer);
    }

    return undefined;
  }, [map, visible]);

  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.setLatLngs(points);
    }
  }, [points]);

  return null;
}

export default HeatmapLayer;
