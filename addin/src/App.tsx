import { Routes, Route, Navigate, Link } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard.js";
import { HoldManagement } from "./pages/HoldManagement.js";
import { ComplianceLog } from "./pages/ComplianceLog.js";
import { MapView } from "./pages/MapView.js";

// Minimal nav — embedded inside MyGeotab which provides the outer chrome
function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-[2000] bg-geotab-blue text-white px-4 py-2 flex items-center gap-6 text-sm font-medium">
      <span className="font-bold text-base">🌤️ ClearSkies</span>
      <Link to="/" className="hover:text-blue-200 transition-colors">Dashboard</Link>
      <Link to="/map" className="hover:text-blue-200 transition-colors">Map</Link>
      <Link to="/log" className="hover:text-blue-200 transition-colors">Compliance Log</Link>
    </nav>
  );
}

export function App() {
  return (
    <div className="bg-gray-50 font-sans">
      <Nav />
      {/* pt-12 offsets the fixed nav (48px = 12 * 4px) */}
      <main className="pt-12">
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
