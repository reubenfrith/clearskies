import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App.js";
import "./index.css";
import "leaflet/dist/leaflet.css";
import { GeotabProvider, setGeotabApi } from "./lib/geotabContext.js";

// ─── Geotab Add-In lifecycle registration ─────────────────────────────────────
// MyGeotab calls initialize() once, then focus() each time the user navigates to
// our add-in page. We mount React on initialize and let React handle the rest.

let root: ReactDOM.Root | null = null;

window.geotab = window.geotab || {};
window.geotab.addin = window.geotab.addin || {};

window.geotab.addin.clearskies = {
  initialize(_api, _state, callback) {
    // Store the live Geotab API ref so MapView can request live positions.
    setGeotabApi(_api);

    // Mount React into the #root div that MyGeotab hosts our HTML inside.
    // We use HashRouter because MyGeotab's iframe environment doesn't support
    // browser history push-state reliably across all versions.
    const container = document.getElementById("root");
    if (container && !root) {
      root = ReactDOM.createRoot(container);
      root.render(
        <React.StrictMode>
          <GeotabProvider>
            <HashRouter>
              <App />
            </HashRouter>
          </GeotabProvider>
        </React.StrictMode>
      );
    }
    callback();
  },

  focus(_api, _state) {
    // Called each time the add-in page becomes active.
    // React handles its own re-renders; nothing needed here unless we
    // want to trigger a manual data refresh.
  },

  blur(_api, _state) {
    // Called when the user navigates away.
    // Clean up timers, subscriptions, etc. if needed.
  },
};

// ─── Standalone mode (dev server + GitHub Pages + any non-Geotab host) ────────
// MyGeotab calls initialize() above; everywhere else we mount directly.
if (!window.location.hostname.includes("geotab")) {
  const container = document.getElementById("root");
  if (container && !root) {
    root = ReactDOM.createRoot(container);
    root.render(
      <React.StrictMode>
        <GeotabProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </GeotabProvider>
      </React.StrictMode>
    );
  }
}
