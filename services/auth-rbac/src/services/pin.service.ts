import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Kiosk and phone sign-in with a 4-digit PIN (loaders at the depot, drivers in their vehicle). A PIN
 * only has to be unique among the same role at the same depot, so it is stored as a keyed hash of
 * role, depot and PIN: sign-in is one indexed lookup instead of a bcrypt comparison per user, and a
 * unique index on users(role, depot, pin_lookup) stops two people sharing a PIN. The key is the
 * server's access-token secret, so the stored values are useless without it; changing that secret
 * means re-seeding the PINs.
 */
export function pinLookup(role: 'loader' | 'driver', depot: string, pin: string): string {
  return crypto
    .createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(`pin|${role}|${depot.trim().toLowerCase()}|${pin}`)
    .digest('hex');
}
