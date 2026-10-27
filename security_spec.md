# Security Specification — Pristen Holdings (U) Ltd Loan Management System

## 1. Data Invariants

1. **Authentication & Email Verification Invariant**: Every write operation (`create`, `update`, `delete`) across `/borrowers`, `/loans`, `/loans/{loanId}/installments`, and `/reminders` requires an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`).
2. **Ownership & Identity Invariant**: Every created document must declare `ownerId == request.auth.uid`. `ownerId` and `createdAt` are strictly immutable on all updates (`incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`).
3. **Temporal Integrity Invariant**: `createdAt` on document creation and `updatedAt` on document creation/update must strictly equal `request.time` (server timestamp). Client-supplied arbitrary timestamps are rejected.
4. **PII Isolation Invariant**: `/borrowers/{borrowerId}`, `/loans/{loanId}`, `/loans/{loanId}/installments/{installmentId}`, and `/reminders/{reminderId}` contain sensitive financial and personal data (phone numbers, emails, national IDs, loan balances). Both `get` and `list` operations strictly require `resource.data.ownerId == request.auth.uid || isAdmin()`. Blanket `isSignedIn()` reads are forbidden.
5. **Relational Existence & Master Gate Invariant**:
   - A `Loan` cannot be created unless its referenced `/borrowers/$(incoming().borrowerId)` document exists and is owned by `request.auth.uid` (or user is admin).
   - An `Installment` under `/loans/{loanId}/installments/{installmentId}` requires that the parent `/loans/{loanId}` document exists and its `ownerId == request.auth.uid` (Master Gate), and `incoming().loanId == loanId`.
   - A `Reminder` cannot be created unless `/loans/$(incoming().loanId)` exists and belongs to `request.auth.uid`.
6. **Terminal State Locking Invariant**:
   - Once a `Loan` reaches a terminal status (`existing().status in ['paid_off', 'defaulted']`), non-admin users cannot update it.
   - Once an `Installment` reaches terminal status (`existing().status == 'paid'`), non-admin users cannot alter its financial settlement fields (except incrementing reminder/receipt metadata if permitted by admin, or locked to admin).
7. **Strict Key Allowlisting & Boundary Enforcement**: Every entity validation helper enforces `hasAll` and `hasOnly` on document keys, explicit string `.size()` bounds, numeric boundaries, and regex validation on IDs (`^[a-zA-Z0-9_\-]+$`).

---

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 — Shadow Field Injection on Borrower Create**:
   Includes all required `Borrower` fields plus `"isSuperAdmin": true`. Rejected by `data.keys().hasOnly(...)`.
2. **Payload 2 — Unverified Email Spoofing on Admin Access**:
   Authenticated token with `email: "ijoyijoshua269@gmail.com"` and `email_verified: false`. Rejected by `request.auth.token.email_verified == true`.
3. **Payload 3 — Cross-Tenant PII Scrape (`list` on `/borrowers` without owner filter)**:
   Authenticated user queries `collection(db, 'borrowers')` without `where('ownerId', '==', uid)`. Rejected by `allow list: if isSignedIn() && (resource.data.ownerId == request.auth.uid || isAdmin())`.
4. **Payload 4 — Orphaned Loan Creation (Non-existent `borrowerId`)**:
   Creates a `Loan` pointing to `borrowerId: "non_existent_borrower_999"`. Rejected by `exists(/databases/$(database)/documents/borrowers/$(incoming().borrowerId))`.
5. **Payload 5 — Cross-Owner Loan Attachment**:
   User B attempts to create a `Loan` referencing a `Borrower` owned by User A. Rejected because `get(/databases/$(database)/documents/borrowers/$(incoming().borrowerId)).data.ownerId == request.auth.uid` fails.
6. **Payload 6 — Forged Client Timestamp (`createdAt` backdating)**:
   Creates a `Loan` with `createdAt: Timestamp.fromMillis(1700000000000)` instead of `serverTimestamp()`. Rejected by `incoming().createdAt == request.time`.
7. **Payload 7 — Immutable Ownership Hijack on Update**:
   Updates a `Loan` changing `ownerId` from User A to User B. Rejected by `incoming().ownerId == existing().ownerId` and `affectedKeys().hasOnly(...)`.
8. **Payload 8 — Terminal State Reversal Attack**:
   Updates a `Loan` whose current status is `'paid_off'` back to `'active'` with a modified `outstandingBalance` as a non-admin. Rejected by Terminal State Lock (`!(existing().status in ['paid_off', 'defaulted'])`).
9. **Payload 9 — Value Poisoning on Whitelisted Update Key**:
   Updates `Loan.status` (an allowed key in `affectedKeys()`) to `"hacked_status"` or a 1MB string. Rejected because `isValidLoan(incoming())` wraps the entire `allow update` block.
10. **Payload 10 — ID Poisoning Attack**:
    Attempts to create `/borrowers/bad$id!with/slashes` or a 500-character ID. Rejected by `isValidId(borrowerId)`.
11. **Payload 11 — Subcollection Master Gate Bypass**:
    User B attempts to read or write an installment under `/loans/{userALoanId}/installments/{instId}`. Rejected by the Master Gate check verifying parent `/loans/$(loanId)` ownership.
12. **Payload 12 — Self-Assigned Admin Privilege Escalation**:
    Authenticated user attempts to write to `/admins/$(request.auth.uid)`. Rejected by `allow write: if false;` on `/admins/{adminId}`.
