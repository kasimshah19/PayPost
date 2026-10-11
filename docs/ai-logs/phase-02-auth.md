# Phase 2: Authentication & Role Guards

## Prompt I sent

```text
Implement user authentication and role-based access control for PayPost:
1. Roles: strictly 'brand' and 'creator'. The role is chosen at registration and is immutable.
2. Password hashing using bcryptjs (salt rounds: 10).
3. JWT-based authentication (7-day validity) stored in client localStorage.
4. Role guard middleware to isolate brand endpoints from creators and vice-versa.
5. Auto-provision an empty Wallet (balancePaise: 0, heldPaise: 0) for every registered creator at creation time.
6. Validation with Zod on signup and login payloads. Write automated tests for auth, token verification, and role guards.
```

---

## What the AI built (short)

- User model with email, passwordHash, name, role ('brand' | 'creator'), and notificationPreferences.
- Auth controller and routes (POST /api/auth/signup, POST /api/auth/login, GET /api/auth/me).
- auth.middleware.js for Bearer JWT verification and roleGuard.js for endpoint access isolation.
- Automatic creation of creator Wallet on signup inside a database transaction.
- Comprehensive auth test suite (tests/auth.test.js) checking valid logins, bad passwords, duplicate emails, and role protection.

---

## What I tested myself and what I found or fixed

1. Executed 'npm test -- tests/auth.test.js' - 100% passed.
2. Tested signup with duplicate email: correctly returned 400 with duplicate email error.
3. Verified brand account cannot access creator-only wallet routes (returned 403 Forbidden).
4. Verified that creator signup atomically generates a linked Wallet document with 0 balance.
