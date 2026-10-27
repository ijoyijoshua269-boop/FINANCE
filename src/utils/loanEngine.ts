import {
  CurrencyCode,
  Installment,
  InstallmentStatus,
  InterestMethod,
  Loan,
  PaymentFrequency,
  PendingReminderCandidate,
  ReminderChannel,
  ReminderTriggerType,
} from '../types/loan';

// Validation constants strictly synchronized with firebase-blueprint.json & firestore.rules
export const VALIDATION_LIMITS = {
  ID_MAX: 128,
  ID_PATTERN: /^[a-zA-Z0-9_\-]+$/,
  FULL_NAME_MIN: 2,
  FULL_NAME_MAX: 120,
  NIN_MIN: 3,
  NIN_MAX: 50,
  PHONE_MIN: 7,
  PHONE_MAX: 30,
  EMAIL_MIN: 3,
  EMAIL_MAX: 120,
  ADDRESS_MIN: 2,
  ADDRESS_MAX: 200,
  SECTOR_MIN: 2,
  SECTOR_MAX: 100,
  COLLATERAL_MIN: 2,
  COLLATERAL_MAX: 300,
  LOAN_REF_MIN: 3,
  LOAN_REF_MAX: 40,
  PURPOSE_MIN: 2,
  PURPOSE_MAX: 250,
  PAYMENT_REF_MAX: 80,
  MESSAGE_MIN: 5,
  MESSAGE_MAX: 1000,
} as const;

export function sanitizeString(val: string, maxLen: number, minLen = 0, fallback = 'N/A'): string {
  const trimmed = (val || '').trim();
  if (trimmed.length < minLen) {
    return fallback.slice(0, maxLen);
  }
  return trimmed.slice(0, maxLen);
}

export function generateSafeId(prefix: string): string {
  const randomPart = Math.random().toString(36).substring(2, 10);
  const timePart = Date.now().toString(36);
  return `${prefix}_${timePart}_${randomPart}`.replace(/[^a-zA-Z0-9_\-]/g, '');
}

export function formatCurrency(amount: number, currency: CurrencyCode = 'UGX'): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  if (currency === 'UGX') {
    return `UGX ${Math.round(safeAmount).toLocaleString('en-US')}`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount);
}

export function getTodayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function daysBetweenDates(dateA: string, dateB: string): number {
  const a = new Date(`${dateA.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${dateB.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export function addPeriodToDate(
  startDateISO: string,
  periodIndex: number,
  frequency: PaymentFrequency
): string {
  const base = new Date(`${startDateISO.slice(0, 10)}T00:00:00Z`);
  if (frequency === 'monthly') {
    base.setUTCMonth(base.getUTCMonth() + periodIndex);
  } else if (frequency === 'biweekly') {
    base.setUTCDate(base.getUTCDate() + periodIndex * 14);
  } else {
    base.setUTCDate(base.getUTCDate() + periodIndex * 7);
  }
  return base.toISOString().slice(0, 10);
}

export function computeInstallmentStatus(
  dueDate: string,
  amountPaid: number,
  scheduledAmount: number,
  reminderDaysBefore = 5
): InstallmentStatus {
  if (amountPaid >= scheduledAmount - 0.5) {
    return 'paid';
  }
  if (amountPaid > 0 && amountPaid < scheduledAmount - 0.5) {
    const today = getTodayISO();
    const diff = daysBetweenDates(today, dueDate);
    return diff < 0 ? 'overdue' : 'partial';
  }
  const today = getTodayISO();
  const daysUntilDue = daysBetweenDates(today, dueDate);
  if (daysUntilDue < 0) {
    return 'overdue';
  }
  if (daysUntilDue <= reminderDaysBefore) {
    return 'due_soon';
  }
  return 'upcoming';
}

export interface GeneratedScheduleItem {
  installmentNumber: number;
  dueDate: string;
  scheduledAmount: number;
  principalComponent: number;
  interestComponent: number;
  remainingBalanceAfter: number;
}

export interface AmortizationResult {
  installments: GeneratedScheduleItem[];
  totalInterestProjected: number;
  totalPayable: number;
  periodicPayment: number;
  installmentsCount: number;
  effectiveAnnualRate: number;
}

/**
 * Generates an accurate amortization schedule using a MONTHLY interest rate (e.g. 12% per month)
 * for Reducing Balance, Flat Rate, or Interest-Only loans.
 */
export function calculateAmortizationSchedule(params: {
  principalAmount: number;
  annualInterestRate: number; // Stored field representing Monthly Interest Rate (% per month, e.g. 12)
  termMonths: number;
  interestMethod: InterestMethod;
  paymentFrequency: PaymentFrequency;
  disbursementDate: string;
  currency: CurrencyCode;
}): AmortizationResult {
  const {
    principalAmount,
    annualInterestRate,
    termMonths,
    interestMethod,
    paymentFrequency,
    disbursementDate,
    currency,
  } = params;

  const isUGX = currency === 'UGX';
  const roundVal = (val: number) => (isUGX ? Math.round(val) : Math.round(val * 100) / 100);

  // Determine number of installments based on repayment frequency
  let installmentsCount = termMonths;
  if (paymentFrequency === 'biweekly') {
    installmentsCount = Math.max(1, Math.round((termMonths * 26) / 12));
  } else if (paymentFrequency === 'weekly') {
    installmentsCount = Math.max(1, Math.round((termMonths * 52) / 12));
  }

  // Monthly interest rate (e.g. 12% -> 0.12 per month)
  const monthlyRate = annualInterestRate / 100;
  const periodicRate =
    paymentFrequency === 'monthly'
      ? monthlyRate
      : (monthlyRate * termMonths) / installmentsCount;

  const installments: GeneratedScheduleItem[] = [];
  let remainingBalance = principalAmount;
  let totalInterestProjected = 0;

  if (interestMethod === 'reducing_balance') {
    let emi = 0;
    if (periodicRate === 0) {
      emi = principalAmount / installmentsCount;
    } else {
      const factor = Math.pow(1 + periodicRate, installmentsCount);
      emi = (principalAmount * (periodicRate * factor)) / (factor - 1);
    }

    for (let i = 1; i <= installmentsCount; i++) {
      const interestRaw = remainingBalance * periodicRate;
      const interestComponent = roundVal(interestRaw);
      let principalComponent = roundVal(emi - interestRaw);

      if (i === installmentsCount) {
        principalComponent = roundVal(remainingBalance);
      }
      const scheduledAmount = roundVal(principalComponent + interestComponent);
      remainingBalance = Math.max(0, roundVal(remainingBalance - principalComponent));
      totalInterestProjected = roundVal(totalInterestProjected + interestComponent);

      installments.push({
        installmentNumber: i,
        dueDate: addPeriodToDate(disbursementDate, i, paymentFrequency),
        scheduledAmount,
        principalComponent,
        interestComponent,
        remainingBalanceAfter: remainingBalance,
      });
    }
  } else if (interestMethod === 'flat_rate') {
    // Monthly flat rate: e.g. 12% of principal per month * termMonths
    const totalFlatInterest = principalAmount * monthlyRate * termMonths;
    const periodicInterest = roundVal(totalFlatInterest / installmentsCount);
    const periodicPrincipal = roundVal(principalAmount / installmentsCount);

    for (let i = 1; i <= installmentsCount; i++) {
      const principalComponent =
        i === installmentsCount ? roundVal(remainingBalance) : periodicPrincipal;
      const interestComponent = periodicInterest;
      const scheduledAmount = roundVal(principalComponent + interestComponent);
      remainingBalance = Math.max(0, roundVal(remainingBalance - principalComponent));
      totalInterestProjected = roundVal(totalInterestProjected + interestComponent);

      installments.push({
        installmentNumber: i,
        dueDate: addPeriodToDate(disbursementDate, i, paymentFrequency),
        scheduledAmount,
        principalComponent,
        interestComponent,
        remainingBalanceAfter: remainingBalance,
      });
    }
  } else {
    // interest_only (monthly/periodic interest with bullet principal at final installment)
    const periodicInterest = roundVal(principalAmount * periodicRate);
    for (let i = 1; i <= installmentsCount; i++) {
      const principalComponent = i === installmentsCount ? roundVal(principalAmount) : 0;
      const interestComponent = periodicInterest;
      const scheduledAmount = roundVal(principalComponent + interestComponent);
      remainingBalance = i === installmentsCount ? 0 : roundVal(principalAmount);
      totalInterestProjected = roundVal(totalInterestProjected + interestComponent);

      installments.push({
        installmentNumber: i,
        dueDate: addPeriodToDate(disbursementDate, i, paymentFrequency),
        scheduledAmount,
        principalComponent,
        interestComponent,
        remainingBalanceAfter: remainingBalance,
      });
    }
  }

  const totalPayable = roundVal(principalAmount + totalInterestProjected);
  const periodicPayment = installments.length > 0 ? installments[0].scheduledAmount : 0;
  const effectiveAnnualRate = annualInterestRate * 12;

  return {
    installments,
    totalInterestProjected,
    totalPayable,
    periodicPayment,
    installmentsCount,
    effectiveAnnualRate: Math.round(effectiveAnnualRate * 100) / 100,
  };
}

/**
 * Formats a professional Pristen Investments Ltd payment reminder message.
 */
export function buildReminderMessage(params: {
  borrowerName: string;
  loanReference: string;
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
  currency: CurrencyCode;
  triggerType: ReminderTriggerType;
  daysDelta: number;
}): string {
  const {
    borrowerName,
    loanReference,
    installmentNumber,
    dueDate,
    amountDue,
    currency,
    triggerType,
    daysDelta,
  } = params;

  const formattedAmt = formatCurrency(amountDue, currency);

  if (triggerType === 'Payment Receipt') {
    return `PRISTEN INVESTMENTS LTD: Dear ${borrowerName}, we confirm receipt of ${formattedAmt} for Facility ${loanReference} (Installment #${installmentNumber}). Thank you for maintaining a strong credit standing.`;
  }

  if (triggerType === 'Overdue Escalation') {
    const overdueDays = Math.abs(daysDelta);
    return `URGENT — PRISTEN INVESTMENTS LTD: Dear ${borrowerName}, Installment #${installmentNumber} of ${formattedAmt} under Facility ${loanReference} fell due on ${dueDate} (${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue). Please remit immediately via Stanbic Bank RTGS or MTN MoMo Merchant Code 449120 to avoid late penalty charges.`;
  }

  if (triggerType === 'Due Today') {
    return `PRISTEN INVESTMENTS LTD: Dear ${borrowerName}, this is a courtesy reminder that Installment #${installmentNumber} of ${formattedAmt} for Facility ${loanReference} is due today (${dueDate}). Settle via MTN MoMo (449120) or Stanbic Bank quoting ref ${loanReference}.`;
  }

  return `PRISTEN INVESTMENTS LTD: Dear ${borrowerName}, upcoming Installment #${installmentNumber} of ${formattedAmt} for Facility ${loanReference} is scheduled for ${dueDate} (in ${daysDelta} day${daysDelta === 1 ? '' : 's'}). Please prepare your remittance quoting ${loanReference}.`;
}

/**
 * Scans all loans and installments to build the live queue of automated reminder candidates.
 */
export function detectPendingReminders(
  loans: Loan[],
  installmentsByLoan: Record<string, Installment[]>
): PendingReminderCandidate[] {
  const today = getTodayISO();
  const candidates: PendingReminderCandidate[] = [];

  for (const loan of loans) {
    if (!loan.autoReminderEnabled) continue;
    if (loan.status === 'paid_off' || loan.status === 'defaulted') continue;

    const installments = installmentsByLoan[loan.id] || [];
    for (const inst of installments) {
      if (inst.status === 'paid') continue;

      const remainingDue = Math.max(0, inst.scheduledAmount - inst.amountPaid);
      if (remainingDue <= 0) continue;

      const daysDelta = daysBetweenDates(today, inst.dueDate);
      let triggerType: ReminderTriggerType | null = null;
      let suggestedChannel: ReminderChannel = 'SMS';

      if (daysDelta < 0) {
        triggerType = 'Overdue Escalation';
        suggestedChannel = 'SMS';
      } else if (daysDelta === 0) {
        triggerType = 'Due Today';
        suggestedChannel = 'WhatsApp';
      } else if (daysDelta <= loan.reminderDaysBefore) {
        triggerType = 'Upcoming Due';
        suggestedChannel = 'Email';
      }

      if (triggerType) {
        const suggestedMessage = buildReminderMessage({
          borrowerName: loan.borrowerName,
          loanReference: loan.loanReference,
          installmentNumber: inst.installmentNumber,
          dueDate: inst.dueDate,
          amountDue: remainingDue,
          currency: loan.currency,
          triggerType,
          daysDelta,
        });

        candidates.push({
          loan,
          installment: inst,
          triggerType,
          daysDelta,
          suggestedChannel,
          suggestedMessage: sanitizeString(
            suggestedMessage,
            VALIDATION_LIMITS.MESSAGE_MAX,
            VALIDATION_LIMITS.MESSAGE_MIN
          ),
        });
      }
    }
  }

  // Sort overdue first, then due today, then upcoming soonest
  return candidates.sort((a, b) => a.daysDelta - b.daysDelta);
}
