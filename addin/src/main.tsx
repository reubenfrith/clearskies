import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App.js";
import "./index.css";
import "leaflet/dist/leaflet.css";
import { GeotabProvider, setGeotabApi } from "./lib/geotabContext.js";

// Mount React immediately — works on GitHub Pages, local dev, and inside MyGeotab.
// MyGeotab loads our index.html as an iframe src, so document and #root are always present.
const container = document.getElementById("root");
if (container) ReactDOM.createRoot(container).render(
      <React.StrictMode>
        <GeotabProvider>
          <HashRouter>
            <App />
          </HashRouter>
        </GeotabProvider>
      </React.StrictMode>
  );

// ─── Geotab Add-In lifecycle ───────────────────────────────────────────────────
// MyGeotab calls initialize() after the page loads. React is already mounted;
// we just store the API ref so MapView can fetch live vehicle positions.
window.geotab = window.geotab || {};
window.geotab.addin = window.geotab.addin || {};

window.geotab.addin.clearskies = {
  initialize(_api, _state, callback) {
    setGeotabApi(_api);
    callback();
  },
  focus(_api, _state) {},
  blur(_api, _state) {},
};
