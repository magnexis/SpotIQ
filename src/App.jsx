import { useState } from 'react';
import ParkingMap from './components/ParkingMap.jsx';

function App() {
  const [showHeatmap, setShowHeatmap] = useState(false);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">SpotIQ</p>
          <h1>Smart Parking Map</h1>
          <p className="subheading">
            Live parking markers, predictive availability, and a real-time density heatmap.
          </p>
        </div>

        <button
          type="button"
          className={`heatmap-toggle ${showHeatmap ? 'active' : ''}`}
          onClick={() => setShowHeatmap((current) => !current)}
        >
          {showHeatmap ? 'Hide Heatmap' : 'Show Heatmap'}
        </button>
      </header>

      <main className="content-grid">
        <section className="map-panel">
          <ParkingMap showHeatmap={showHeatmap} />
        </section>

        <aside className="sidebar">
          <div className="card">
            <h2>Heatmap Legend</h2>
            <div className="legend-item">
              <span className="legend-swatch green" />
              <span>High availability</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch yellow" />
              <span>Medium availability</span>
            </div>
            <div className="legend-item">
              <span className="legend-swatch red" />
              <span>Low availability / full</span>
            </div>
          </div>

          <div className="card">
            <h2>How It Works</h2>
            <p>
              Spot markers refresh as the parking simulation runs. The heatmap recalculates parking
              density from the live spot dataset and updates instantly over Socket.io.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
