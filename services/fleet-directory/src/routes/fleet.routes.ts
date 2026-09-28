import { Router } from 'express';
import { FleetController } from '../controllers/fleet.controller';

export const fleetRoutes = Router();

fleetRoutes.get('/vehicles', FleetController.getVehicles);
fleetRoutes.post('/outlets/batch', FleetController.getOutletsBatch);
fleetRoutes.get('/travel-metrics', FleetController.getTravelMetrics);
fleetRoutes.post('/vehicles/:vehicle_id/log-distance', FleetController.logDistance);

export default fleetRoutes;
