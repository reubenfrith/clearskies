import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { UserFormatProvider } from "@geotab/zenith";
import { App } from "./App.js";
import "./index.css";
import "leaflet/dist/leaflet.css";
import { GeotabProvider, setGeotabApi } from "./lib/geotabContext.js";
import { PasswordGate } from "./components/PasswordGate.js";

// Mount React immediately — works on GitHub Pages, local dev, and inside MyGeotab.
// MyGeotab loads our index.html as an iframe src, so document and #root are always present.
const container = document.getElementById("root");
if (container) ReactDOM.createRoot(container).render(
      <React.StrictMode>
        <UserFormatProvider dateFormat="dd MMMM yyyy" timeFormat="hh:mm" weekStartsOnSunday={false}>
          <PasswordGate>
            <GeotabProvider>
              <MemoryRouter>
                <App />
              </MemoryRouter>
            </GeotabProvider>
          </PasswordGate>
        </UserFormatProvider>
      </React.StrictMode>
  );

// ─── Geotab Add-In lifecycle ───────────────────────────────────────────────────
// MyGeotab calls initialize() after the page loads. React is already mounted;
// we just store the API ref so MapView can fetch live vehicle positions.
window.geotab = window.geotab || {};
window.geotab.addin = window.geotab.addin || {};

// Geotab requires a factory function — it calls clearskies() to get the lifecycle object.
window.geotab.addin.clearskies = function () {
  return {
    initialize(_api: any, _state: any, callback: () => void) {
      setGeotabApi(_api);
      callback();
    },
    focus(_api: any, _state: any) {},
    blur(_api: any, _state: any) {},
  };
};
