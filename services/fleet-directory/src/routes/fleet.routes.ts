import { Router } from 'express';
import { VehicleController } from '../controllers/vehicle.controller';
import { OutletController } from '../controllers/outlet.controller';
import { TravelController } from '../controllers/travel.controller';
import { verifyToken, requireRole } from '../middleware/authGuard';

export const fleetRoutes = Router();

// Apply stateless JWT verification to all fleet endpoints
fleetRoutes.use(verifyToken());

// Operational view roles: dispatcher, store_manager, driver, loader, system
const operationalRoles = requireRole('dispatcher', 'store_manager', 'driver', 'loader', 'system');
const managerAndDispatcher = requireRole('dispatcher', 'store_manager', 'system');
const dispatcherOnly = requireRole('dispatcher', 'system');
const driverOrDispatcher = requireRole('driver', 'dispatcher', 'system');

// Vehicles – static routes MUST come before parameterised ones
fleetRoutes.get('/vehicles/fuel-usage', managerAndDispatcher, VehicleController.getFuelUsage);
fleetRoutes.get('/vehicles', operationalRoles, VehicleController.getVehicles);

// Per-vehicle actions
fleetRoutes.post('/vehicles/:vehicle_id/log-distance', driverOrDispatcher, VehicleController.logDistance);
fleetRoutes.patch('/vehicles/:vehicle_id/status', dispatcherOnly, VehicleController.updateVehicleStatus);

// Downtime CRUD
fleetRoutes.post('/vehicles/:vehicle_id/downtime', dispatcherOnly, VehicleController.createDowntime);
fleetRoutes.get('/vehicles/:vehicle_id/downtime', operationalRoles, VehicleController.getDowntime);
fleetRoutes.delete('/vehicles/:vehicle_id/downtime/:id', dispatcherOnly, VehicleController.deleteDowntime);

// Other resources
fleetRoutes.post('/outlets/batch', operationalRoles, OutletController.getOutletsBatch);
fleetRoutes.get('/travel-metrics', operationalRoles, TravelController.getTravelMetrics);

export default fleetRoutes;

