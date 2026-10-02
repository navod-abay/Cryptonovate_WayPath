import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Upcoming from './pages/Upcoming';
import Orders from './pages/Orders';
import Fleet from './pages/Fleet';
import { IncidentDetails, OrderDetails, TripDetails, VehicleDetails } from './pages/Details';

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); document.title = 'WayPath · Dispatcher'; }, [pathname]);
  return <div className="dispatcher-app"><Navbar /><Routes>
    <Route path="/" element={<Navigate to="/dispatcher" replace />} />
    <Route path="/dispatcher" element={<Dashboard />} />
    <Route path="/dispatcher/schedule/today" element={<Schedule />} />
    <Route path="/dispatcher/schedule/upcoming" element={<Upcoming />} />
    <Route path="/dispatcher/schedule/trips/:tripId" element={<TripDetails />} />
    <Route path="/dispatcher/orders" element={<Orders />} />
    <Route path="/dispatcher/orders/:orderId" element={<OrderDetails />} />
    <Route path="/dispatcher/fleet" element={<Fleet />} />
    <Route path="/dispatcher/fleet/:vehicleId" element={<VehicleDetails />} />
    <Route path="/dispatcher/incidents/:incidentId" element={<IncidentDetails />} />
    <Route path="*" element={<main className="page"><h1>Page not found</h1><a className="text-link" href="/dispatcher">Back to Dashboard</a></main>} />
  </Routes></div>;
}
