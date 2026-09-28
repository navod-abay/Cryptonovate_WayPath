# Cryptonovate_TBD — Remaining Issues (Post-Fix Report)

> Updated: 2026-09-28 | Build status: ✅ All 17 containers healthy

## ✅ Issues Resolved This Session

| # | Issue |
|---|---|
| 1 | Wrong fallback ports in 4 stub services |
| 3 | Missing UUID extension guard in `02-init-fleet.sql` |
| 5 | `.env` committed / broken `.gitignore` |
| 11 | `npm install` instead of `npm ci` in all Dockerfiles |
| 13 | Mixed `@waypoint/` vs `@delivery/` package namespaces |
| 15 | Source volume mounts not enabling hot reload |

---

## 🔴 Critical (1)

### Issue #2 — Schema Mismatch: SQL Init vs. Application Seed

**Risk:** Auth service fails to insert seed users on a fresh database volume.

**Files involved:**
- [`infrastructure/postgres-init/01-init-auth.sql`](file:///d:/GitHub/Cryptonovate_TBD/infrastructure/postgres-init/01-init-auth.sql)
- [`services/auth-rbac/src/db/seed.ts`](file:///d:/GitHub/Cryptonovate_TBD/services/auth-rbac/src/db/seed.ts)

**The conflict in detail:**

| Property | `01-init-auth.sql` | `seed.ts` (app-level) |
|---|---|---|
| ENUM type name | `user_role` | `user_role_enum` |
| UUID generator | `uuid_generate_v4()` (uuid-ossp) | `gen_random_uuid()` (pgcrypto) |
| `email` column | ✅ EXISTS (NOT NULL UNIQUE) | ❌ MISSING |
| `full_name` column | ❌ MISSING | ✅ EXISTS |
| `outlet_id` column | ❌ MISSING | ✅ EXISTS |
| `depot` column | ❌ MISSING | ✅ EXISTS |
| `updated_at` column | ✅ EXISTS | ❌ MISSING |
| Seed usernames | `loader_jack`, `driver_bob` | `loader_peliyagoda`, `driver_colombo` |

**What happens on a fresh volume:**
1. Postgres runs `01-init-auth.sql` → creates `users` table with the SQL schema (missing `full_name`, `outlet_id`, `depot`)
2. `auth-rbac` starts, `seed.ts` runs `CREATE TABLE IF NOT EXISTS users` → **no-op** (table already exists)
3. `seed.ts` tries to `INSERT` with `outlet_id` and `depot` columns → **runtime error** (columns don't exist)

**Recommended fix:** Align `01-init-auth.sql` with the schema `seed.ts` expects, or remove the application-level `seed.ts` DDL entirely and rely solely on the SQL init scripts. The SQL init script is the correct place for schema definition in a Dockerized setup.

---

## 🟠 High (4)

### Issue #6 — Wildcard CORS on All Services

**Risk:** Any origin (including attacker-controlled sites) can make authenticated cross-origin requests.

**Files:**
- [`services/auth-rbac/src/index.ts`](file:///d:/GitHub/Cryptonovate_TBD/services/auth-rbac/src/index.ts) line 11
- [`services/fleet-directory/src/index.ts`](file:///d:/GitHub/Cryptonovate_TBD/services/fleet-directory/src/index.ts) line 7
- All other stub service `index.ts` files

```typescript
// ❌ Current — allows any origin
app.use(cors());

// ✅ Fix — restrict to the frontend origin
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
```

---

### Issue #7 — Non-Standard HTTP Status Code `444` in Auth Controller

**Risk:** HTTP 444 is an unofficial NGINX extension meaning "close connection with no response". It can confuse clients and proxies in unexpected ways.

**File:** [`services/auth-rbac/src/controllers/auth.controller.ts`](file:///d:/GitHub/Cryptonovate_TBD/services/auth-rbac/src/controllers/auth.controller.ts) — line 151

```typescript
// ❌ Current
res.status(444).json({ ... code: 'USER_NOT_FOUND' ... });

// ✅ Fix
res.status(404).json({ ... code: 'USER_NOT_FOUND' ... });
```

---

### Issue #8 — Duplicate RBAC Middleware (Dead Code)

**Risk:** Confusion over which middleware to use when building out the other services; one implementation will be silently ignored.

**Files:**
- [`services/auth-rbac/src/middleware/rbac.ts`](file:///d:/GitHub/Cryptonovate_TBD/services/auth-rbac/src/middleware/rbac.ts) — exports `requireRoles()`
- [`services/auth-rbac/src/middleware/authGuard.ts`](file:///d:/GitHub/Cryptonovate_TBD/services/auth-rbac/src/middleware/authGuard.ts) — exports `requireRole()` (singular)

Neither is imported in [`auth.routes.ts`](file:///d:/GitHub/Cryptonovate_TBD/services/auth-rbac/src/routes/auth.routes.ts).

**Recommended fix:** Delete `rbac.ts` (it duplicates what `authGuard.ts` already does), wire `requireRole` from `authGuard.ts` into the routes that need role enforcement.

---

### Issue #9 — Duplicate `declare global` for Express Request Augmentation

**Risk:** TypeScript may raise conflicts or silently pick one declaration over the other.

**Files (same content in both):**
- [`services/auth-rbac/src/types/auth.types.ts`](file:///d:/GitHub/Cryptonovate_TBD/services/auth-rbac/src/types/auth.types.ts) lines 40–46
- [`services/auth-rbac/src/middleware/authGuard.ts`](file:///d:/GitHub/Cryptonovate_TBD/services/auth-rbac/src/middleware/authGuard.ts) lines 20–26

```typescript
// This block exists in BOTH files — should only exist in auth.types.ts
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}
```

**Fix:** Remove the `declare global` block from `authGuard.ts`. It belongs solely in `auth.types.ts`.

---

## 🟡 Medium (3)

### Issue #10 — Frontend Docker Image Uses `next dev` (Dev Server)

**File:** [`frontend/Dockerfile`](file:///d:/GitHub/Cryptonovate_TBD/frontend/Dockerfile) line 17

```dockerfile
# ❌ Current — runs dev server (unoptimized, hot-reload overhead)
CMD ["npm", "run", "dev"]
```

This is acceptable for a development-only docker-compose setup, but if this compose file is ever used in a staging/production context, it will serve the unoptimized dev bundle. A separate production Dockerfile with `next build && next start` should be created when needed.

> **Note:** This is intentional trade-off since hot-reload (Issue #15) was fixed using `next dev`. Acceptable as-is for dev.

---

### Issue #12 — Frontend Doesn't Use `@waypoint/shared-types` Schemas

**Context:** The `shared-types` package defines [`LoginRequestSchema`](file:///d:/GitHub/Cryptonovate_TBD/packages/shared-types/src/schemas/api.schema.ts), `LoginResponseSchema`, `UserProfileSchema` — but the frontend doesn't import or use any of them, leading to potential type drift between the API and the UI.

**Files:**
- [`packages/shared-types/src/schemas/api.schema.ts`](file:///d:/GitHub/Cryptonovate_TBD/packages/shared-types/src/schemas/api.schema.ts)
- [`frontend/src/`](file:///d:/GitHub/Cryptonovate_TBD/frontend/src/) — no imports of `@waypoint/shared-types`

**Fix:** Add `@waypoint/shared-types` to `frontend/package.json` dependencies and use the shared Zod schemas for API response parsing/validation in the frontend.

---

### Issue #14 — `calendar.csv` Mounted but Never Used

**File:** [`data/calendar.csv`](file:///d:/GitHub/Cryptonovate_TBD/data/calendar.csv) (36 KB)

The `./data` directory is mounted into the Postgres container at `/data`, and the fleet SQL script uses `COPY FROM '/data/outlets.csv'`, `vehicles.csv`, etc. — but `calendar.csv` is never referenced by any SQL script or service.

**Fix:** Either wire it up to the relevant service (likely `planning-allocation` for delivery scheduling logic), or remove it to avoid confusion.

---

## Priority Order for Next Fixes

```
1. 🔴 Issue #2  — Schema mismatch (blocks fresh deployments)
2. 🟠 Issue #7  — HTTP 444 status code (quick 1-line fix)
3. 🟠 Issue #9  — Duplicate global type declaration (quick cleanup)
4. 🟠 Issue #8  — Dead RBAC middleware (cleanup + wire up auth guards)
5. 🟠 Issue #6  — Wildcard CORS (security fix)
6. 🟡 Issue #12 — Frontend shared-types integration
7. 🟡 Issue #14 — calendar.csv wiring or removal
```
