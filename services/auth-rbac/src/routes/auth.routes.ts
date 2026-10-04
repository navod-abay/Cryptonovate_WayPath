import { Router } from 'express';
import { AuthController, loginSchema, pinLoginSchema, refreshSchema, changePasswordSchema } from '../controllers/auth.controller';
import { validateRequest } from '../middleware/validate';
import { authenticateJwt } from '../middleware/auth';
import { requireRoles } from '../middleware/rbac';

const router = Router();

// Public Endpoints
router.post('/login', validateRequest(loginSchema), AuthController.login);
router.post('/pin-login', validateRequest(pinLoginSchema), AuthController.pinLogin);
router.post('/refresh', validateRequest(refreshSchema), AuthController.refresh);
router.post('/logout', AuthController.logout);
router.get('/health', AuthController.health);

// Authenticated Endpoints
router.get('/me', authenticateJwt, AuthController.me);
// Service token (role "system", e.g. Planning) or a dispatcher.
router.get('/loaders', authenticateJwt, requireRoles(['dispatcher', 'system']), AuthController.loaders);
router.post('/change-password', authenticateJwt, validateRequest(changePasswordSchema), AuthController.changePassword);

export default router;

