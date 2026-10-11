# 01. System Topology & Decoupled Architecture

This diagram illustrates the layered software architecture of PayPost, detailing how HTTP requests travel from the client SPA through validation, authentication, business services, and database ACID transactions, alongside the background worker polling loops.

---

```mermaid
graph TD
    subgraph Client Layer [Client Application - React 18 + Vite + Tailwind]
        BrowserMobile[Mobile Viewport - Bottom Tab Bar]
        BrowserDesktop[Desktop Viewport - Top Navbar]
        AxiosClient[Axios API Client + Bearer JWT Interceptor]
    end

    BrowserMobile --> AxiosClient
    BrowserDesktop --> AxiosClient

    subgraph Entrypoint & Gateway [Express HTTP Server - Node.js CommonJS]
        CORS[CORS Origin Middleware]
        Parser[Express JSON Body Parser]
        AuthGuard[Auth Middleware - JWT Verify]
        RoleGuard[Role Guard - Brand / Creator Isolation]
        Validator[Zod Validation Middleware]
    end

    AxiosClient -->|HTTP JSON / Authorization Header| CORS
    CORS --> Parser
    Parser --> AuthGuard
    AuthGuard --> RoleGuard
    RoleGuard --> Validator

    subgraph Controllers Layer [HTTP Controllers]
        AuthCtrl[auth.controller.js]
        CampCtrl[campaign.controller.js]
        AppCtrl[application.controller.js]
        SubCtrl[submission.controller.js]
        WalletCtrl[wallet.controller.js]
        WithdrawalCtrl[withdrawal.controller.js]
        AttentionCtrl[creator.controller.js]
    end

    Validator --> AuthCtrl
    Validator --> CampCtrl
    Validator --> AppCtrl
    Validator --> SubCtrl
    Validator --> WalletCtrl
    Validator --> WithdrawalCtrl
    Validator --> AttentionCtrl

    subgraph Domain Services Layer [Business Rules & ACID Orchestration]
        CampService[campaign.service.js]
        AppService[application.service.js]
        SubService[submissionService.js]
        FeeCalc[feeCalculator.js - Pure Integer Math]
        PayoutService[payoutService.js]
        WalletService[walletService.js]
        WithdrawalService[withdrawalService.js]
        NotifService[notificationService.js - Outbox]
        QuietHours[quietHours.js - Pure UTC Math]
    end

    CampCtrl --> CampService
    AppCtrl --> AppService
    SubCtrl --> SubService
    SubService --> FeeCalc
    SubService --> PayoutService
    PayoutService --> WalletService
    WalletCtrl --> WalletService
    WithdrawalCtrl --> WithdrawalService
    AttentionCtrl --> AppService
    AttentionCtrl --> SubService

    AppService --> NotifService
    SubService --> NotifService
    PayoutService --> NotifService
    WithdrawalService --> NotifService
    NotifService --> QuietHours

    subgraph Storage Layer [MongoDB Replica Set - Mongoose Models]
        TxHelper[withTransaction.js - Multi-Doc Session]
        DBCamp[(Campaigns)]
        DBApp[(Applications)]
        DBSub[(Submissions)]
        DBWallet[(Wallets)]
        DBLedger[(LedgerEntries - Append Only)]
        DBWithdrawal[(Withdrawals - Partial Unique Index)]
        DBNotif[(NotificationJobs - Outbox Collection)]
    end

    CampService --> TxHelper
    AppService --> TxHelper
    SubService --> TxHelper
    PayoutService --> TxHelper
    WithdrawalService --> TxHelper

    TxHelper --> DBCamp
    TxHelper --> DBApp
    TxHelper --> DBSub
    TxHelper --> DBWallet
    TxHelper --> DBLedger
    TxHelper --> DBWithdrawal
    TxHelper --> DBNotif

    subgraph Background Asynchronous Workers [Polling Loops]
        WithdrawalWorker[withdrawalWorker.js - Polls Every 3s]
        NotifWorker[notificationWorker.js - Polls Every 5s]
        MockPayoutProvider[mockPayoutProvider.js - UPI Dispatch]
        MockEmail[mockEmailProvider.js]
        MockWA[mockWhatsappProvider.js]
    end

    DBWithdrawal <-->|Atomic Claim / Settle| WithdrawalWorker
    WithdrawalWorker -->|Dispatches Call Outside DB Session| MockPayoutProvider
    DBNotif <-->|Atomic Claim / Dispatch| NotifWorker
    NotifWorker --> MockEmail
    NotifWorker --> MockWA
```
