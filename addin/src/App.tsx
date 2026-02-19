import { Routes, Route, Navigate } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard.js";
import { HoldManagement } from "./pages/HoldManagement.js";
import { ComplianceLog } from "./pages/ComplianceLog.js";
import { MapView } from "./pages/MapView.js";

// Minimal nav — embedded inside MyGeotab which provides the outer chrome
function Nav() {
  return (
    <nav className="bg-geotab-blue text-white px-4 py-2 flex items-center gap-6 text-sm font-medium">
      <span className="font-bold text-base">🌤️ ClearSkies</span>
      <a href="#/" className="hover:text-blue-200 transition-colors">Dashboard</a>
      <a href="#/map" className="hover:text-blue-200 transition-colors">Map</a>
      <a href="#/log" className="hover:text-blue-200 transition-colors">Compliance Log</a>
    </nav>
  );
}

export function App() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <Nav />
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/holds/:siteId" element={<HoldManagement />} />
          <Route path="/log" element={<ComplianceLog />} />
          <Route path="/map" element={<MapView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
