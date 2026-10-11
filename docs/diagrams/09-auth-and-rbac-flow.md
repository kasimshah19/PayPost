# 09. Authentication, Role Guard & Token Lifecycle Flow

This diagram explains the authentication lifecycle in PayPost, including user registration, atomic creator wallet auto-provisioning, bcrypt hashing, JWT issuance, and role-based endpoint isolation.

---

```mermaid
flowchart TD
    subgraph Registration Flow [User Signup & Atomic Provisioning]
        RegReq[POST /api/auth/signup] --> ZodVal{Validate Zod Schema:<br/>Name, Email, Password, Role}
        ZodVal -- Invalid --> Err400[400 Bad Request]
        ZodVal -- Valid --> CheckEmail{Check Unique Email}
        CheckEmail -- Exists --> ErrEmail[400 Email Already Registered]
        CheckEmail -- Unique --> HashPass[Hash Password via bcryptjs: 10 Salt Rounds]
        
        HashPass --> TxStart[Start Mongoose Transaction Session]
        TxStart --> CreateUser[Insert User Document: role is immutable]
        CreateUser --> RoleCheck{User Role?}
        
        RoleCheck -- creator --> CreateWallet[Atomically Create Wallet:<br/>balancePaise = 0, heldPaise = 0]
        RoleCheck -- brand --> SkipWallet[Skip Wallet Creation]
        
        CreateWallet --> CommitReg[session.commitTransaction()]
        SkipWallet --> CommitReg
        CommitReg --> SignJWT[Sign JWT: userId, email, role<br/>Expires: 7 Days]
        SignJWT --> ReturnReg[HTTP 201 Created: Return Token + User DTO]
    end

    subgraph Authentication Middleware [Protected Request Pipeline]
        IncomingReq[Client Request to Protected Route] --> ExtractToken[Extract Authorization: Bearer token]
        ExtractToken --> HasToken{Token Present?}
        HasToken -- No --> Err401A[HTTP 401 Unauthorized]
        HasToken -- Yes --> VerifySig{jwt.verify token with JWT_SECRET}
        VerifySig -- Expired or Tampered --> Err401B[HTTP 401 Invalid Token]
        VerifySig -- Valid Signature --> FetchUser[Find User in DB by userId]
        FetchUser -- Not Found --> Err401C[HTTP 401 User Deleted]
        FetchUser -- Found --> AttachUser[Attach req.user]
        
        AttachUser --> RoleGuardCheck{roleGuard(...allowedRoles)}
        RoleGuardCheck -- Mismatched Role --> Err403[HTTP 403 Forbidden]
        RoleGuardCheck -- Authorized Role --> NextHandler[Call Controller Function]
    end

    style CreateWallet fill:#d4edda,stroke:#28a745,stroke-width:2px;
    style NextHandler fill:#d4edda,stroke:#28a745,stroke-width:2px;
    style Err403 fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
```

---

### What Is Happening in This Diagram:
1. **Atomic Creator Onboarding**: If a creator registers, their wallet is generated inside the registration transaction session. If wallet creation fails, the user document is rolled back so orphaned creator accounts without wallets can never exist.
2. **Strict RBAC Guards**: Endpoints like `/api/campaigns` (creation) and `/api/applications/:id/approve` pass through `roleGuard('brand')`. Creator routes like `/api/withdrawals` pass through `roleGuard('creator')`. Unauthorized roles are halted immediately with HTTP 403 Forbidden.
