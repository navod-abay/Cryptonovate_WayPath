import { Router } from 'express';
import { VehicleController } from '../controllers/vehicle.controller';
import { OutletController } from '../controllers/outlet.controller';
import { TravelController } from '../controllers/travel.controller';

export const fleetRoutes = Router();

// Vehicles – static routes MUST come before parameterised ones
fleetRoutes.get('/vehicles/fuel-usage', VehicleController.getFuelUsage);
fleetRoutes.get('/vehicles', VehicleController.getVehicles);

// Per-vehicle actions
fleetRoutes.post('/vehicles/:vehicle_id/log-distance', VehicleController.logDistance);
fleetRoutes.patch('/vehicles/:vehicle_id/status', VehicleController.updateVehicleStatus);

// Downtime CRUD
fleetRoutes.post('/vehicles/:vehicle_id/downtime', VehicleController.createDowntime);
fleetRoutes.get('/vehicles/:vehicle_id/downtime', VehicleController.getDowntime);
fleetRoutes.delete('/vehicles/:vehicle_id/downtime/:id', VehicleController.deleteDowntime);

// Other resources
fleetRoutes.post('/outlets/batch', OutletController.getOutletsBatch);
fleetRoutes.get('/travel-metrics', TravelController.getTravelMetrics);

export default fleetRoutes;
