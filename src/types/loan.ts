export type CreditTier = 'Prime' | 'Standard' | 'Watchlist';
export type CurrencyCode = 'UGX' | 'USD';
export type InterestMethod = 'reducing_balance' | 'flat_rate' | 'interest_only';
export type PaymentFrequency = 'monthly' | 'biweekly' | 'weekly';
export type LoanStatus = 'active' | 'overdue' | 'paid_off' | 'defaulted';
export type InstallmentStatus = 'upcoming' | 'due_soon' | 'paid' | 'partial' | 'overdue';
export type ReminderChannel = 'SMS' | 'Email' | 'WhatsApp';
export type ReminderTriggerType =
  | 'Upcoming Due'
  | 'Due Today'
  | 'Overdue Escalation'
  | 'Payment Receipt';
export type ReminderDeliveryStatus = 'dispatched' | 'scheduled' | 'acknowledged';

export interface Borrower {
  id: string;
  ownerId: string;
  fullName: string;
  nationalIdOrRegNo: string;
  phone: string;
  email: string;
  address: string;
  occupationOrSector: string;
  creditTier: CreditTier;
  monthlyIncomeUGX: number;
  collateralSummary: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Loan {
  id: string;
  ownerId: string;
  loanReference: string;
  borrowerId: string;
  borrowerName: string;
  borrowerPhone: string;
  borrowerEmail: string;
  currency: CurrencyCode;
  principalAmount: number;
  annualInterestRate: number;
  interestMethod: InterestMethod;
  termMonths: number;
  paymentFrequency: PaymentFrequency;
  disbursementDate: string;
  nextDueDate: string;
  totalInterestProjected: number;
  totalPayable: number;
  amountPaid: number;
  outstandingBalance: number;
  installmentsCount: number;
  paidInstallmentsCount: number;
  status: LoanStatus;
  autoReminderEnabled: boolean;
  reminderDaysBefore: number;
  purpose: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Installment {
  id: string;
  ownerId: string;
  loanId: string;
  installmentNumber: number;
  dueDate: string;
  scheduledAmount: number;
  principalComponent: number;
  interestComponent: number;
  remainingBalanceAfter: number;
  amountPaid: number;
  paidDate: string;
  paymentReference: string;
  status: InstallmentStatus;
  reminderSentCount: number;
  lastReminderAt: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Reminder {
  id: string;
  ownerId: string;
  loanId: string;
  loanReference: string;
  borrowerName: string;
  borrowerContact: string;
  channel: ReminderChannel;
  triggerType: ReminderTriggerType;
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
  currency: CurrencyCode;
  messageBody: string;
  deliveryStatus: ReminderDeliveryStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PendingReminderCandidate {
  loan: Loan;
  installment: Installment;
  triggerType: ReminderTriggerType;
  daysDelta: number; // negative = overdue days, 0 = due today, positive = days until due
  suggestedChannel: ReminderChannel;
  suggestedMessage: string;
}

export type StaffRole =
  | 'executive_director'
  | 'coo'
  | 'cfo'
  | 'finance_officer'
  | 'hr'
  | 'manager'
  | 'sales_person'
  | 'teller';

export type StaffDepartment =
  | 'Executive Office'
  | 'Operations (COO)'
  | 'Finance Department (CFO)'
  | 'Human Resources (HR)'
  | 'Credit Management'
  | 'Sales & Origination'
  | 'Teller Disbursement Desk';

export interface StaffMember {
  id: string;
  ownerId: string;
  fullName: string;
  employeeCode: string;
  role: StaffRole;
  department: StaffDepartment;
  phone: string;
  email: string;
  status: 'active' | 'suspended';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const STAFF_ROLE_METADATA: Record<
  StaffRole,
  {
    label: string;
    shortTitle: string;
    department: StaffDepartment;
    permissionsSummary: string;
  }
> = {
  executive_director: {
    label: 'Executive Director',
    shortTitle: 'Exec. Director',
    department: 'Executive Office',
    permissionsSummary:
      'Full executive governance: Sole authority to edit worker salary figures and approve payroll for CFO payment, plus Portfolio, Finance & HR access.',
  },
  coo: {
    label: 'Chief Operating Officer (C.O.O.)',
    shortTitle: 'C.O.O.',
    department: 'Operations (COO)',
    permissionsSummary:
      'End-to-end operational authority across Loan Servicing, Salaries Sector, HR Staff Roster, Collections, and Analytics.',
  },
  cfo: {
    label: 'Chief Financial Officer (C.F.O.)',
    shortTitle: 'C.F.O. (Head of Finance)',
    department: 'Finance Department (CFO)',
    permissionsSummary:
      'HEAD OF FINANCE: Pays staff salaries approved by the Executive Director, approves & sends Teller-initiated loan money to clients, and manages Treasury & 12% Monthly Yield.',
  },
  finance_officer: {
    label: 'Finance & Treasury Officer',
    shortTitle: 'Finance Officer',
    department: 'Finance Department (CFO)',
    permissionsSummary:
      'FINANCE DEPARTMENT: Approves & sends Teller-initiated loan disbursements to clients, monitors the Salaries Sector, and reconciles 12% monthly schedules.',
  },
  hr: {
    label: 'Human Resource (H.R.) Manager',
    shortTitle: 'Human Resource (H.R.)',
    department: 'Human Resources (HR)',
    permissionsSummary:
      'HUMAN RESOURCE DUTY: Manages all company staff, worker onboarding, role assignments, anonymous 4-digit PIN provisioning, and employment status.',
  },
  manager: {
    label: 'Branch / Credit Manager',
    shortTitle: 'Manager',
    department: 'Credit Management',
    permissionsSummary:
      'Supervises loan operations, Salaries Sector oversight, borrower KYC, repayment schedules, and reminders.',
  },
  sales_person: {
    label: 'Sales Team & Analytics Officer',
    shortTitle: 'Sales Team (Analytics)',
    department: 'Sales & Origination',
    permissionsSummary:
      'SALES & ANALYTICS: Assigned to Performance Analytics, portfolio growth telemetry, borrower onboarding, and 12% monthly interest quotes.',
  },
  teller: {
    label: 'Teller (Loan Disbursement Desk)',
    shortTitle: 'Teller',
    department: 'Teller Disbursement Desk',
    permissionsSummary:
      'STRICTLY RESTRICTED: Initiates loan disbursements at the Teller Desk; Finance Department approves and sends the money to the client.',
  },
};

export type SalaryApprovalStatus =
  | 'pending_approval'
  | 'approved_by_ed'
  | 'paid_by_cfo';

export type LoanFinancePayoutStatus =
  | 'pending_finance_payout'
  | 'disbursed_to_client';

export const DEFAULT_ROLE_MONTHLY_SALARY_UGX: Record<StaffRole, number> = {
  executive_director: 12000000,
  coo: 8500000,
  cfo: 7800000,
  finance_officer: 4200000,
  hr: 4500000,
  manager: 5200000,
  sales_person: 2800000,
  teller: 1800000,
};

export interface CorporateWorkerCredential {
  fullName: string;
  employeeCode: string;
  role: StaffRole;
  department: StaffDepartment;
  phone: string;
  pin: string; // Unique anonymous 4-digit password
  defaultMonthlySalaryUGX: number;
}

export const DEFAULT_CORPORATE_WORKERS: CorporateWorkerCredential[] = [
  {
    fullName: 'Joshua Ijoyi',
    employeeCode: 'PHL-EXEC-001',
    role: 'executive_director',
    department: 'Executive Office',
    phone: '+256 772 800100',
    pin: '2233',
    defaultMonthlySalaryUGX: 12000000,
  },
  {
    fullName: 'Grace Namusisi',
    employeeCode: 'PHL-COO-002',
    role: 'coo',
    department: 'Operations (COO)',
    phone: '+256 752 800200',
    pin: '3716',
    defaultMonthlySalaryUGX: 8500000,
  },
  {
    fullName: 'CPA Ronald Mugisha',
    employeeCode: 'PHL-CFO-003',
    role: 'cfo',
    department: 'Finance Department (CFO)',
    phone: '+256 776 800300',
    pin: '5924',
    defaultMonthlySalaryUGX: 7800000,
  },
  {
    fullName: 'Prossy Katusiime',
    employeeCode: 'PHL-FIN-004',
    role: 'finance_officer',
    department: 'Finance Department (CFO)',
    phone: '+256 701 800400',
    pin: '6048',
    defaultMonthlySalaryUGX: 4200000,
  },
  {
    fullName: 'Diana Nakato',
    employeeCode: 'PHL-HR-005',
    role: 'hr',
    department: 'Human Resources (HR)',
    phone: '+256 774 800450',
    pin: '7319',
    defaultMonthlySalaryUGX: 4500000,
  },
  {
    fullName: 'Denis Otim',
    employeeCode: 'PHL-MGR-006',
    role: 'manager',
    department: 'Credit Management',
    phone: '+256 782 800500',
    pin: '4185',
    defaultMonthlySalaryUGX: 5200000,
  },
  {
    fullName: 'Brenda Akello',
    employeeCode: 'PHL-SLS-007',
    role: 'sales_person',
    department: 'Sales & Origination',
    phone: '+256 754 800600',
    pin: '9263',
    defaultMonthlySalaryUGX: 2800000,
  },
  {
    fullName: 'Ivan Ssemakula',
    employeeCode: 'PHL-SLS-008',
    role: 'sales_person',
    department: 'Sales & Origination',
    phone: '+256 779 800700',
    pin: '1594',
    defaultMonthlySalaryUGX: 2800000,
  },
  {
    fullName: 'Mercy Nabukeera',
    employeeCode: 'PHL-TLR-009',
    role: 'teller',
    department: 'Teller Disbursement Desk',
    phone: '+256 704 800800',
    pin: '2847',
    defaultMonthlySalaryUGX: 1800000,
  },
  {
    fullName: 'Samuel Okello',
    employeeCode: 'PHL-TLR-010',
    role: 'teller',
    department: 'Teller Disbursement Desk',
    phone: '+256 788 800900',
    pin: '6738',
    defaultMonthlySalaryUGX: 1800000,
  },
];

export function generateAnonymousFourDigitPin(existingPins: string[] = []): string {
  const used = new Set(existingPins);
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = String(Math.floor(1000 + Math.random() * 9000));
    if (!used.has(candidate) && candidate !== '2233' && candidate !== '0000' && candidate !== '1234') {
      return candidate;
    }
  }
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function resolveWorkerPin(worker: {
  fullName: string;
  employeeCode?: string;
  role?: StaffRole;
  email?: string;
}): string {
  if (worker.role === 'executive_director') {
    return '2233';
  }

  if (worker.email) {
    const matchPinPrefix = worker.email.match(/^PIN-(\d{4})/);
    if (matchPinPrefix && matchPinPrefix[1] !== '2233') {
      return matchPinPrefix[1];
    }
    if (/^\d{4}$/.test(worker.email) && worker.email !== '2233') {
      return worker.email;
    }
  }

  const byName = DEFAULT_CORPORATE_WORKERS.find(
    (w) => w.fullName.toLowerCase() === worker.fullName.trim().toLowerCase()
  );
  if (byName) return byName.pin;

  if (worker.employeeCode) {
    const byCode = DEFAULT_CORPORATE_WORKERS.find(
      (w) => w.employeeCode.toLowerCase() === worker.employeeCode!.trim().toLowerCase()
    );
    if (byCode) return byCode.pin;
  }

  // Deterministic anonymous 4-digit PIN based on worker name + code
  const seedStr = `${worker.fullName.trim().toLowerCase()}_${worker.employeeCode || ''}`;
  let hash = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    hash ^= seedStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const pinNum = 1000 + (Math.abs(hash) % 8999);
  return String(pinNum === 2233 ? 5841 : pinNum);
}

export function encodeStaffMetadata(params: {
  pin: string;
  salaryUGX: number;
  salaryStatus: SalaryApprovalStatus;
  paymentRef?: string;
}): string {
  const cleanPin = /^\d{4}$/.test(params.pin.trim()) ? params.pin.trim() : '4829';
  const cleanSal = Math.max(0, Math.round(Number(params.salaryUGX) || 0));
  const cleanRef = (params.paymentRef || '')
    .replace(/[|]/g, '')
    .trim()
    .slice(0, 28);
  return `PIN-${cleanPin}|SAL:${cleanSal}|PAY:${params.salaryStatus}|REF:${cleanRef}`.slice(
    0,
    120
  );
}

export function resolveWorkerSalaryInfo(worker: {
  fullName: string;
  employeeCode?: string;
  role: StaffRole;
  email?: string;
}): {
  monthlySalaryUGX: number;
  salaryStatus: SalaryApprovalStatus;
  paymentRef: string;
} {
  const byName = DEFAULT_CORPORATE_WORKERS.find(
    (w) => w.fullName.toLowerCase() === worker.fullName.trim().toLowerCase()
  );
  const byCode = worker.employeeCode
    ? DEFAULT_CORPORATE_WORKERS.find(
        (w) =>
          w.employeeCode.toLowerCase() === worker.employeeCode!.trim().toLowerCase()
      )
    : undefined;

  let monthlySalaryUGX =
    byName?.defaultMonthlySalaryUGX ??
    byCode?.defaultMonthlySalaryUGX ??
    DEFAULT_ROLE_MONTHLY_SALARY_UGX[worker.role] ??
    2500000;

  let salaryStatus: SalaryApprovalStatus = 'pending_approval';
  let paymentRef = '';

  if (worker.email && worker.email.includes('|SAL:')) {
    const parts = worker.email.split('|');
    for (const part of parts) {
      if (part.startsWith('SAL:')) {
        const parsed = Number(part.slice(4));
        if (!Number.isNaN(parsed) && parsed > 0) {
          monthlySalaryUGX = parsed;
        }
      } else if (part.startsWith('PAY:')) {
        const st = part.slice(4) as SalaryApprovalStatus;
        if (
          st === 'pending_approval' ||
          st === 'approved_by_ed' ||
          st === 'paid_by_cfo'
        ) {
          salaryStatus = st;
        }
      } else if (part.startsWith('REF:')) {
        paymentRef = part.slice(4);
      }
    }
  }

  return {
    monthlySalaryUGX,
    salaryStatus,
    paymentRef,
  };
}

export function encodeLoanPurposeWithPayoutState(params: {
  payoutStatus: LoanFinancePayoutStatus;
  channel: string;
  narration: string;
  actorName?: string;
  actionDate?: string;
}): string {
  const cleanChannel = (params.channel || 'Stanbic Bank RTGS')
    .replace(/[\[\]|]/g, '')
    .trim()
    .slice(0, 32);
  const cleanActor = (params.actorName || 'Officer')
    .replace(/[\[\]|]/g, '')
    .trim()
    .slice(0, 32);
  const cleanDate = (params.actionDate || '').replace(/[\[\]|]/g, '').trim().slice(0, 12);
  const cleanNarration = (params.narration || 'Commercial Working Capital Facility')
    .replace(/^\[(PENDING_FINANCE_PAYOUT|FINANCE_SENT_TO_CLIENT|Disbursed via)[^\]]*\]\s*/i, '')
    .trim();

  if (params.payoutStatus === 'pending_finance_payout') {
    const prefix = `[PENDING_FINANCE_PAYOUT|${cleanChannel}|Teller: ${cleanActor}] `;
    return `${prefix}${cleanNarration}`.slice(0, 245);
  }

  const datePart = cleanDate ? ` on ${cleanDate}` : '';
  const prefix = `[FINANCE_SENT_TO_CLIENT|${cleanChannel}|Sent by ${cleanActor}${datePart}] `;
  return `${prefix}${cleanNarration}`.slice(0, 245);
}

export function parseLoanDisbursementState(loan: Pick<Loan, 'purpose'>): {
  payoutStatus: LoanFinancePayoutStatus;
  channel: string;
  metaSummary: string;
  cleanPurpose: string;
} {
  const raw = loan.purpose || '';

  if (raw.startsWith('[PENDING_FINANCE_PAYOUT|')) {
    const closeIdx = raw.indexOf(']');
    if (closeIdx !== -1) {
      const header = raw.slice(1, closeIdx);
      const segments = header.split('|');
      const channel = segments[1] || 'Cash Counter';
      const metaSummary = segments[2] || 'Initiated by Teller';
      const cleanPurpose = raw.slice(closeIdx + 1).trim() || 'Working Capital Facility';
      return {
        payoutStatus: 'pending_finance_payout',
        channel,
        metaSummary,
        cleanPurpose,
      };
    }
  }

  if (raw.startsWith('[FINANCE_SENT_TO_CLIENT|')) {
    const closeIdx = raw.indexOf(']');
    if (closeIdx !== -1) {
      const header = raw.slice(1, closeIdx);
      const segments = header.split('|');
      const channel = segments[1] || 'Bank / Mobile Money';
      const metaSummary = segments[2] || 'Approved & Sent by Finance Dept';
      const cleanPurpose = raw.slice(closeIdx + 1).trim() || 'Working Capital Facility';
      return {
        payoutStatus: 'disbursed_to_client',
        channel,
        metaSummary,
        cleanPurpose,
      };
    }
  }

  const legacyMatch = raw.match(/^\[Disbursed via ([^\]]+)\]\s*(.*)$/i);
  if (legacyMatch) {
    return {
      payoutStatus: 'disbursed_to_client',
      channel: legacyMatch[1],
      metaSummary: 'Approved & Disbursed by Finance Dept',
      cleanPurpose: legacyMatch[2] || 'Working Capital Facility',
    };
  }

  return {
    payoutStatus: 'disbursed_to_client',
    channel: 'Stanbic Bank RTGS',
    metaSummary: 'Approved & Disbursed by Finance Dept',
    cleanPurpose: raw || 'Working Capital Facility',
  };
}




