import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import PlaceOrderPage from './pages/PlaceOrderPage';
import OrderStatusPage from './pages/OrderStatusPage';
import OrderHistoryPage from './pages/OrderHistoryPage';
import TodayDeliveriesPage from './pages/TodayDeliveriesPage';
import ReceiveDeliveryPage from './pages/ReceiveDeliveryPage';
import PastDeliveriesPage from './pages/PastDeliveriesPage';

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/orders" element={<OrderHistoryPage />} />
        <Route path="/orders/new/:type" element={<PlaceOrderPage />} />
        <Route path="/orders/:orderId" element={<OrderStatusPage />} />
        <Route path="/deliveries/today" element={<TodayDeliveriesPage />} />
        <Route path="/deliveries/past" element={<PastDeliveriesPage />} />
        <Route path="/deliveries/:deliveryId/receive" element={<ReceiveDeliveryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
