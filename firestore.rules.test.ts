/**
 * Firestore Security Rules Test Suite — Pristen Holdings (U) Ltd
 * Verifies that all "Dirty Dozen" adversarial payloads return PERMISSION_DENIED.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on Borrower Create',
    collectionPath: '/borrowers/borrower_01',
    operation: 'create',
    auth: { uid: 'user_a', email: 'usera@pristen.ug', email_verified: true },
    payload: {
      ownerId: 'user_a',
      fullName: 'Kampala Agro Traders Ltd',
      nationalIdOrRegNo: 'URSB-80029182',
      phone: '+256772100200',
      email: 'finance@kampalaagro.ug',
      address: 'Plot 22 Nakasero Road, Kampala',
      occupationOrSector: 'Agribusiness',
      creditTier: 'Prime',
      monthlyIncomeUGX: 45000000,
      collateralSummary: 'Commercial Title Block 12 Plot 44',
      isSuperAdmin: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Spoofing on Admin Access',
    collectionPath: '/borrowers/borrower_01',
    operation: 'create',
    auth: { uid: 'spoof_admin', email: 'ijoyijoshua269@gmail.com', email_verified: false },
    payload: {
      ownerId: 'spoof_admin',
      fullName: 'Test Entity',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-Tenant PII Scrape on Borrowers List',
    collectionPath: '/borrowers',
    operation: 'list',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Orphaned Loan Creation with Non-existent Borrower ID',
    collectionPath: '/loans/loan_orphan_01',
    operation: 'create',
    auth: { uid: 'user_a', email: 'usera@pristen.ug', email_verified: true },
    payload: {
      ownerId: 'user_a',
      borrowerId: 'non_existent_borrower_999',
      loanReference: 'PHL-2026-999',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Cross-Owner Loan Attachment',
    collectionPath: '/loans/loan_cross_01',
    operation: 'create',
    auth: { uid: 'user_b', email: 'userb@pristen.ug', email_verified: true },
    payload: {
      ownerId: 'user_b',
      borrowerId: 'borrower_owned_by_user_a',
      loanReference: 'PHL-2026-888',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Forged Client Timestamp on Create',
    collectionPath: '/loans/loan_past_01',
    operation: 'create',
    auth: { uid: 'user_a', email: 'usera@pristen.ug', email_verified: true },
    payload: {
      ownerId: 'user_a',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Immutable Ownership Hijack on Loan Update',
    collectionPath: '/loans/loan_01',
    operation: 'update',
    auth: { uid: 'user_a', email: 'usera@pristen.ug', email_verified: true },
    payload: {
      ownerId: 'user_b',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Terminal State Reversal Attack on Paid-Off Loan',
    collectionPath: '/loans/loan_paid_off_01',
    operation: 'update',
    auth: { uid: 'user_a', email: 'usera@pristen.ug', email_verified: true },
    payload: {
      status: 'active',
      outstandingBalance: 15000000,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Value Poisoning on Whitelisted Update Key',
    collectionPath: '/loans/loan_01',
    operation: 'update',
    auth: { uid: 'user_a', email: 'usera@pristen.ug', email_verified: true },
    payload: {
      status: 'INVALID_ENUM_STATE',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'ID Poisoning with Special Characters',
    collectionPath: '/borrowers/invalid$id!@#',
    operation: 'create',
    auth: { uid: 'user_a', email: 'usera@pristen.ug', email_verified: true },
    payload: {
      ownerId: 'user_a',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Subcollection Master Gate Bypass on Installments',
    collectionPath: '/loans/loan_user_a/installments/inst_01',
    operation: 'get',
    auth: { uid: 'user_b', email: 'userb@pristen.ug', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Self-Assigned Admin Privilege Escalation',
    collectionPath: '/admins/user_a',
    operation: 'create',
    auth: { uid: 'user_a', email: 'usera@pristen.ug', email_verified: true },
    payload: {
      email: 'usera@pristen.ug',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
];
