import { incidents, orders, vehicles } from './seed';

// Read-only demo adapter. Replace implementations when real services are agreed.
// No backend endpoints or request contracts are assumed by the UI.
export const dispatcherRepository = {
  getOrders: () => orders,
  getVehicles: () => vehicles,
  getIncidents: () => incidents,
};
