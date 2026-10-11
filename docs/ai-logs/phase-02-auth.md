# Phase 2: Authentication, Role-Based Access Control & Wallet Auto-Provisioning

## Prompt I sent

```text
Implement secure authentication and role isolation for PayPost:
1. User Roles:
   - System supports two mutually exclusive roles: 'brand' and 'creator'.
   - Role is selected once at registration and is completely immutable thereafter.
2. Password Security:
   - Use bcryptjs with 10 salt rounds for secure password hashing.
   - Enforce strong password complexity rules via Zod schemas (minimum 8 characters, at least one uppercase, one lowercase, one number, and one special character).
3. JWT Authentication:
   - Issue signed JSON Web Tokens with a 7-day expiration containing userId, email, and role.
   - Verify token via auth.middleware.js checking the Authorization: Bearer <token> header.
   - Reject expired, malformed, or missing tokens with HTTP 401 Unauthorized.
4. Role-Based Access Control (RBAC):
   - Create roleGuard(...allowedRoles) middleware.
   - Protect brand endpoints from creators and creator endpoints from brands with HTTP 403 Forbidden.
5. Automatic Creator Wallet Provisioning:
   - Every newly registered creator must automatically have an active Wallet document created (balancePaise: 0, heldPaise: 0) inside the same database transaction as the User creation.
   - If wallet creation fails, the user registration must roll back completely.
6. Validation & Test Coverage:
   - Write comprehensive tests in tests/auth.test.js covering registration, login, duplicate email prevention, invalid credentials, token verification, and role guards.
```

---

## What the AI built (Detailed Architecture & Implementation)

### 1. Data Schema & Models
- **User Schema (`src/models/User.js`)**:
  - Fields: `name` (String), `email` (lowercase, unique index), `passwordHash` (String, select: false), `role` (Enum: `'brand'` | `'creator'`, immutable), `notificationPreferences` ({ `email`: Boolean, `whatsapp`: Boolean }).
  - Methods: `comparePassword(plainPassword)` using bcryptjs.

### 2. Controllers & Authentication Endpoints
- `POST /api/auth/signup`:
  - Validates payload using `signupSchema` (Zod).
  - Checks email uniqueness via database query.
  - Generates bcrypt hash and creates User document.
  - If `role === 'creator'`, automatically creates associated `Wallet` document (`balancePaise: 0`, `heldPaise: 0`) inside the registration transaction session.
  - Returns signed JWT and user DTO (excluding password hash).
- `POST /api/auth/login`:
  - Validates login credentials against stored bcrypt hash.
  - Returns JWT token and user profile on success.
- `GET /api/auth/me`:
  - Returns sanitized profile of authenticated user from `req.user`.

### 3. Middleware Security Guards
- `src/middleware/auth.middleware.js`: Extracts token from `Authorization: Bearer <token>`, verifies signature via `jwt.verify()`, loads user from database, and attaches to `req.user`.
- `src/middleware/roleGuard.js`: Factory middleware `roleGuard('brand')` or `roleGuard('creator')` verifying `req.user.role`.

### 4. Frontend Authentication Context
- `AuthContext.jsx`: Manages reactive user state, stores token in `localStorage`, provides `login()`, `signup()`, and `logout()` helpers, and automatically initializes auth state on page refresh.

---

## What I tested myself, what I found or fixed & Verification Proofs

### 1. Automated Test Suite (`tests/auth.test.js`)
- **Valid Registration**: Successfully created brand and creator accounts, received JWT token and user profile.
- **Duplicate Email Prevention**: Attempting to register an existing email returned HTTP 400 with message *"Email already registered"*.
- **Weak Password Rejection**: Attempting to register with short or weak password was rejected by Zod validation with detailed field errors.
- **Credential Verification**: Valid login returned 200 with JWT; incorrect password returned 401 with *"Invalid email or password"*.
- **Token Verification**: Protected routes successfully authenticated valid tokens and rejected malformed/tampered tokens with 401 Unauthorized.
- **Role Guard Enforcement**: Sent request with creator token to brand-only route $ightarrow$ received HTTP 403 Forbidden.

### 2. Atomic Wallet Provisioning Verification
- Inspected database collections after creator registration: verified that linked `Wallet` document was created with `balancePaise: 0` and `heldPaise: 0`.
- Verified that brand registration did **not** create a wallet document.

### 3. Browser & Postman Testing
- Tested login/signup flow in browser: authenticated state persisted across page reloads via localStorage.
- Verified that logging out immediately cleared token and redirected to `/login`.
