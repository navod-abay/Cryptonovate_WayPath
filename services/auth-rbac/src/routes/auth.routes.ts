import { Router } from 'express';
import { AuthController, loginSchema, refreshSchema } from '../controllers/auth.controller';
import { validateRequest } from '../middleware/validate';
import { authenticateJwt } from '../middleware/auth';

const router = Router();

// Public Endpoints
router.post('/login', validateRequest(loginSchema), AuthController.login);
router.post('/refresh', validateRequest(refreshSchema), AuthController.refresh);
router.get('/health', AuthController.health);

// Authenticated Endpoints
router.get('/me', authenticateJwt, AuthController.me);

export default router;
