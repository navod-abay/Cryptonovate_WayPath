import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import ProfilePage from './pages/ProfilePage';
import HomePage from './pages/HomePage';
import PlaceOrderPage from './pages/PlaceOrderPage';
import OrderStatusPage from './pages/OrderStatusPage';
import OrderHistoryPage from './pages/OrderHistoryPage';
import TodayDeliveriesPage from './pages/TodayDeliveriesPage';
import ReceiveDeliveryPage from './pages/ReceiveDeliveryPage';
import PastDeliveriesPage from './pages/PastDeliveriesPage';
import StoreDataGate from './components/StoreDataGate';
import Toasts from './components/Toasts';
import { useAppStore } from './state/store';

/** Everything except /login needs a signed-in store manager. */
function RequireAuth({ children }: { children: ReactNode }) {
  const signedIn = useAppStore((s) => !!s.session);
  const location = useLocation();
  if (!signedIn) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return (
    <>
      <Navbar />
      <StoreDataGate>{children}</StoreDataGate>
    </>
  );
}

const guard = (page: ReactNode) => <RequireAuth>{page}</RequireAuth>;

export default function App() {
  const signedIn = useAppStore((s) => !!s.session);
  return (
    <>
    <Toasts />
    <Routes>
      <Route path="/login" element={signedIn ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={guard(<HomePage />)} />
      <Route path="/profile" element={guard(<ProfilePage />)} />
      <Route path="/orders" element={guard(<OrderHistoryPage />)} />
      <Route path="/orders/new/:type" element={guard(<PlaceOrderPage />)} />
      <Route path="/orders/:orderId" element={guard(<OrderStatusPage />)} />
      <Route path="/deliveries/today" element={guard(<TodayDeliveriesPage />)} />
      <Route path="/deliveries/past" element={guard(<PastDeliveriesPage />)} />
      <Route path="/deliveries/:deliveryId/receive" element={guard(<ReceiveDeliveryPage />)} />
      <Route path="*" element={<Navigate to={signedIn ? '/' : '/login'} replace />} />
    </Routes>
    </>
  );
}
