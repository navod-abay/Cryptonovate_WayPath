import { Router } from 'express';
import { VehicleController } from '../controllers/vehicle.controller';
import { OutletController } from '../controllers/outlet.controller';
import { TravelController } from '../controllers/travel.controller';

export const fleetRoutes = Router();

fleetRoutes.get('/vehicles', VehicleController.getVehicles);
fleetRoutes.post('/outlets/batch', OutletController.getOutletsBatch);
fleetRoutes.get('/travel-metrics', TravelController.getTravelMetrics);
fleetRoutes.post('/vehicles/:vehicle_id/log-distance', VehicleController.logDistance);
fleetRoutes.patch('/vehicles/:vehicle_id/status', VehicleController.updateVehicleStatus);

export default fleetRoutes;
