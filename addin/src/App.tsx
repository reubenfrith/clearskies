import { Routes, Route, Navigate, Link } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard.js";
import { HoldManagement } from "./pages/HoldManagement.js";
import { ComplianceLog } from "./pages/ComplianceLog.js";
import { MapView } from "./pages/MapView.js";

// Minimal nav — embedded inside MyGeotab which provides the outer chrome
function Nav() {
  return (
    <nav className="bg-geotab-blue text-white px-4 py-2 flex items-center gap-6 text-sm font-medium">
      <span className="font-bold text-base">🌤️ ClearSkies</span>
      <Link to="/" className="hover:text-blue-200 transition-colors">Dashboard</Link>
      <Link to="/map" className="hover:text-blue-200 transition-colors">Map</Link>
      <Link to="/log" className="hover:text-blue-200 transition-colors">Compliance Log</Link>
    </nav>
  );
}

export function App() {
  return (
    <div className="h-screen flex flex-col bg-gray-50 font-sans overflow-hidden">
      <Nav />
      <main className="flex-1 overflow-auto">
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
