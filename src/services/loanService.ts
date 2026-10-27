import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  Borrower,
  CreditTier,
  CurrencyCode,
  encodeLoanPurposeWithPayoutState,
  encodeStaffMetadata,
  Installment,
  InterestMethod,
  Loan,
  LoanStatus,
  parseLoanDisbursementState,
  PaymentFrequency,
  PendingReminderCandidate,
  ReminderChannel,
  ReminderTriggerType,
  resolveWorkerPin,
  resolveWorkerSalaryInfo,
  SalaryApprovalStatus,
  StaffDepartment,
  StaffMember,
  StaffRole,
  STAFF_ROLE_METADATA,
} from '../types/loan';
import {
  buildReminderMessage,
  calculateAmortizationSchedule,
  computeInstallmentStatus,
  generateSafeId,
  getTodayISO,
  sanitizeString,
  VALIDATION_LIMITS,
} from '../utils/loanEngine';

export async function createBorrowerRecord(
  ownerId: string,
  input: {
    fullName: string;
    nationalIdOrRegNo: string;
    phone: string;
    email: string;
    address: string;
    occupationOrSector: string;
    creditTier: CreditTier;
    monthlyIncomeUGX: number;
    collateralSummary: string;
  }
): Promise<string> {
  const borrowerId = generateSafeId('brw');
  const path = `borrowers/${borrowerId}`;
  try {
    await setDoc(doc(db, 'borrowers', borrowerId), {
      ownerId,
      fullName: sanitizeString(
        input.fullName,
        VALIDATION_LIMITS.FULL_NAME_MAX,
        VALIDATION_LIMITS.FULL_NAME_MIN,
        'Registered Borrower'
      ),
      nationalIdOrRegNo: sanitizeString(
        input.nationalIdOrRegNo,
        VALIDATION_LIMITS.NIN_MAX,
        VALIDATION_LIMITS.NIN_MIN,
        'NIN-0000'
      ),
      phone: sanitizeString(
        input.phone,
        VALIDATION_LIMITS.PHONE_MAX,
        VALIDATION_LIMITS.PHONE_MIN,
        '+256700000000'
      ),
      email: sanitizeString(
        input.email,
        VALIDATION_LIMITS.EMAIL_MAX,
        VALIDATION_LIMITS.EMAIL_MIN,
        'client@pristen.ug'
      ),
      address: sanitizeString(
        input.address,
        VALIDATION_LIMITS.ADDRESS_MAX,
        VALIDATION_LIMITS.ADDRESS_MIN,
        'Kampala, Uganda'
      ),
      occupationOrSector: sanitizeString(
        input.occupationOrSector,
        VALIDATION_LIMITS.SECTOR_MAX,
        VALIDATION_LIMITS.SECTOR_MIN,
        'Commercial Trade'
      ),
      creditTier: input.creditTier,
      monthlyIncomeUGX: Math.max(0, Math.min(1000000000000, Number(input.monthlyIncomeUGX) || 0)),
      collateralSummary: sanitizeString(
        input.collateralSummary,
        VALIDATION_LIMITS.COLLATERAL_MAX,
        VALIDATION_LIMITS.COLLATERAL_MIN,
        'Registered Chattel & Corporate Guarantee'
      ),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return borrowerId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function createLoanWithSchedule(
  ownerId: string,
  borrower: Borrower,
  input: {
    loanReference: string;
    currency: CurrencyCode;
    principalAmount: number;
    annualInterestRate: number;
    interestMethod: InterestMethod;
    termMonths: number;
    paymentFrequency: PaymentFrequency;
    disbursementDate: string;
    autoReminderEnabled: boolean;
    reminderDaysBefore: number;
    purpose: string;
  }
): Promise<string> {
  const loanId = generateSafeId('loan');
  const schedule = calculateAmortizationSchedule({
    principalAmount: input.principalAmount,
    annualInterestRate: input.annualInterestRate,
    termMonths: input.termMonths,
    interestMethod: input.interestMethod,
    paymentFrequency: input.paymentFrequency,
    disbursementDate: input.disbursementDate,
    currency: input.currency,
  });

  const firstDueDate =
    schedule.installments.length > 0
      ? schedule.installments[0].dueDate
      : input.disbursementDate;

  const hasOverdue = schedule.installments.some(
    (inst) =>
      computeInstallmentStatus(inst.dueDate, 0, inst.scheduledAmount, input.reminderDaysBefore) ===
      'overdue'
  );
  const initialLoanStatus: LoanStatus = hasOverdue ? 'overdue' : 'active';

  const firstBatch = writeBatch(db);
  const loanRef = doc(db, 'loans', loanId);

  firstBatch.set(loanRef, {
    ownerId,
    loanReference: sanitizeString(
      input.loanReference,
      VALIDATION_LIMITS.LOAN_REF_MAX,
      VALIDATION_LIMITS.LOAN_REF_MIN,
      'PHL-2026-001'
    ),
    borrowerId: borrower.id,
    borrowerName: sanitizeString(
      borrower.fullName,
      VALIDATION_LIMITS.FULL_NAME_MAX,
      VALIDATION_LIMITS.FULL_NAME_MIN
    ),
    borrowerPhone: sanitizeString(
      borrower.phone,
      VALIDATION_LIMITS.PHONE_MAX,
      VALIDATION_LIMITS.PHONE_MIN
    ),
    borrowerEmail: sanitizeString(
      borrower.email,
      VALIDATION_LIMITS.EMAIL_MAX,
      VALIDATION_LIMITS.EMAIL_MIN
    ),
    currency: input.currency,
    principalAmount: Math.max(1, Number(input.principalAmount)),
    annualInterestRate: Math.max(0, Math.min(200, Number(input.annualInterestRate))),
    interestMethod: input.interestMethod,
    termMonths: Math.max(1, Math.min(360, Math.round(Number(input.termMonths)))),
    paymentFrequency: input.paymentFrequency,
    disbursementDate: input.disbursementDate.slice(0, 10),
    nextDueDate: firstDueDate.slice(0, 10),
    totalInterestProjected: schedule.totalInterestProjected,
    totalPayable: schedule.totalPayable,
    amountPaid: 0,
    outstandingBalance: schedule.totalPayable,
    installmentsCount: schedule.installmentsCount,
    paidInstallmentsCount: 0,
    status: initialLoanStatus,
    autoReminderEnabled: Boolean(input.autoReminderEnabled),
    reminderDaysBefore: Math.max(0, Math.min(30, Math.round(Number(input.reminderDaysBefore)))),
    purpose: sanitizeString(
      input.purpose,
      VALIDATION_LIMITS.PURPOSE_MAX,
      VALIDATION_LIMITS.PURPOSE_MIN,
      'Working Capital Facility'
    ),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const CHUNK_SIZE = 8;
  const firstChunk = schedule.installments.slice(0, CHUNK_SIZE);

  for (const item of firstChunk) {
    const instId = `${loanId}_inst_${String(item.installmentNumber).padStart(3, '0')}`;
    const instRef = doc(db, 'loans', loanId, 'installments', instId);
    const status = computeInstallmentStatus(
      item.dueDate,
      0,
      item.scheduledAmount,
      input.reminderDaysBefore
    );

    firstBatch.set(instRef, {
      ownerId,
      loanId,
      installmentNumber: item.installmentNumber,
      dueDate: item.dueDate,
      scheduledAmount: item.scheduledAmount,
      principalComponent: item.principalComponent,
      interestComponent: item.interestComponent,
      remainingBalanceAfter: item.remainingBalanceAfter,
      amountPaid: 0,
      paidDate: '',
      paymentReference: '',
      status,
      reminderSentCount: 0,
      lastReminderAt: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await firstBatch.commit();

    for (let i = CHUNK_SIZE; i < schedule.installments.length; i += CHUNK_SIZE) {
      const chunk = schedule.installments.slice(i, i + CHUNK_SIZE);
      const nextBatch = writeBatch(db);
      for (const item of chunk) {
        const instId = `${loanId}_inst_${String(item.installmentNumber).padStart(3, '0')}`;
        const instRef = doc(db, 'loans', loanId, 'installments', instId);
        const status = computeInstallmentStatus(
          item.dueDate,
          0,
          item.scheduledAmount,
          input.reminderDaysBefore
        );

        nextBatch.set(instRef, {
          ownerId,
          loanId,
          installmentNumber: item.installmentNumber,
          dueDate: item.dueDate,
          scheduledAmount: item.scheduledAmount,
          principalComponent: item.principalComponent,
          interestComponent: item.interestComponent,
          remainingBalanceAfter: item.remainingBalanceAfter,
          amountPaid: 0,
          paidDate: '',
          paymentReference: '',
          status,
          reminderSentCount: 0,
          lastReminderAt: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await nextBatch.commit();
    }

    return loanId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `loans/${loanId}`);
  }
}

export async function recordInstallmentPayment(params: {
  ownerId: string;
  loan: Loan;
  installment: Installment;
  allInstallments: Installment[];
  paymentAmount: number;
  paymentReference: string;
  paidDate: string;
  sendReceiptReminder: boolean;
}): Promise<void> {
  const {
    ownerId,
    loan,
    installment,
    allInstallments,
    paymentAmount,
    paymentReference,
    paidDate,
    sendReceiptReminder,
  } = params;

  const isUGX = loan.currency === 'UGX';
  const roundVal = (v: number) => (isUGX ? Math.round(v) : Math.round(v * 100) / 100);

  const newInstAmountPaid = roundVal(
    Math.min(installment.scheduledAmount, installment.amountPaid + paymentAmount)
  );
  const newInstStatus = computeInstallmentStatus(
    installment.dueDate,
    newInstAmountPaid,
    installment.scheduledAmount,
    loan.reminderDaysBefore
  );

  // Compute updated parent loan totals
  const updatedInstallments = allInstallments.map((inst) =>
    inst.id === installment.id
      ? { ...inst, amountPaid: newInstAmountPaid, status: newInstStatus }
      : inst
  );

  const totalAmountPaid = roundVal(
    updatedInstallments.reduce((sum, inst) => sum + inst.amountPaid, 0)
  );
  const newOutstandingBalance = Math.max(0, roundVal(loan.totalPayable - totalAmountPaid));
  const paidInstallmentsCount = updatedInstallments.filter((i) => i.status === 'paid').length;

  const unpaidSorted = updatedInstallments
    .filter((i) => i.status !== 'paid')
    .sort((a, b) => a.installmentNumber - b.installmentNumber);

  const nextDueDate =
    unpaidSorted.length > 0 ? unpaidSorted[0].dueDate : installment.dueDate;

  let newLoanStatus: LoanStatus = 'active';
  if (newOutstandingBalance <= 0 || paidInstallmentsCount >= loan.installmentsCount) {
    newLoanStatus = 'paid_off';
  } else if (unpaidSorted.some((i) => i.status === 'overdue')) {
    newLoanStatus = 'overdue';
  }

  const batch = writeBatch(db);
  const instRef = doc(db, 'loans', loan.id, 'installments', installment.id);
  const loanRef = doc(db, 'loans', loan.id);

  const safeRef = sanitizeString(
    paymentReference || `RCPT-${Date.now().toString().slice(-6)}`,
    VALIDATION_LIMITS.PAYMENT_REF_MAX,
    0,
    ''
  );

  batch.update(instRef, {
    amountPaid: newInstAmountPaid,
    paidDate: paidDate.slice(0, 25),
    paymentReference: safeRef,
    status: newInstStatus,
    reminderSentCount: sendReceiptReminder
      ? Math.min(100, installment.reminderSentCount + 1)
      : installment.reminderSentCount,
    lastReminderAt: sendReceiptReminder
      ? new Date().toISOString().slice(0, 19)
      : installment.lastReminderAt,
    updatedAt: serverTimestamp(),
  });

  batch.update(loanRef, {
    amountPaid: totalAmountPaid,
    outstandingBalance: newOutstandingBalance,
    paidInstallmentsCount,
    nextDueDate,
    status: newLoanStatus,
    updatedAt: serverTimestamp(),
  });

  if (sendReceiptReminder) {
    const reminderId = generateSafeId('rem');
    const reminderRef = doc(db, 'reminders', reminderId);
    const messageBody = buildReminderMessage({
      borrowerName: loan.borrowerName,
      loanReference: loan.loanReference,
      installmentNumber: installment.installmentNumber,
      dueDate: installment.dueDate,
      amountDue: paymentAmount,
      currency: loan.currency,
      triggerType: 'Payment Receipt',
      daysDelta: 0,
    });

    batch.set(reminderRef, {
      ownerId,
      loanId: loan.id,
      loanReference: loan.loanReference,
      borrowerName: loan.borrowerName,
      borrowerContact: loan.borrowerPhone,
      channel: 'SMS',
      triggerType: 'Payment Receipt',
      installmentNumber: installment.installmentNumber,
      dueDate: installment.dueDate,
      amountDue: roundVal(paymentAmount),
      currency: loan.currency,
      messageBody: sanitizeString(
        messageBody,
        VALIDATION_LIMITS.MESSAGE_MAX,
        VALIDATION_LIMITS.MESSAGE_MIN
      ),
      deliveryStatus: 'dispatched',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `loans/${loan.id}/installments/${installment.id}`
    );
  }
}

export async function updateLoanReminderSettings(
  loanId: string,
  autoReminderEnabled: boolean,
  reminderDaysBefore: number
): Promise<void> {
  const path = `loans/${loanId}`;
  try {
    await updateDoc(doc(db, 'loans', loanId), {
      autoReminderEnabled: Boolean(autoReminderEnabled),
      reminderDaysBefore: Math.max(0, Math.min(30, Math.round(reminderDaysBefore))),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function dispatchReminder(params: {
  ownerId: string;
  loan: Loan;
  installment: Installment;
  channel: ReminderChannel;
  triggerType: ReminderTriggerType;
  messageBody: string;
}): Promise<void> {
  const { ownerId, loan, installment, channel, triggerType, messageBody } = params;
  const reminderId = generateSafeId('rem');
  const batch = writeBatch(db);

  const reminderRef = doc(db, 'reminders', reminderId);
  const instRef = doc(db, 'loans', loan.id, 'installments', installment.id);

  const contact =
    channel === 'Email' ? loan.borrowerEmail : loan.borrowerPhone;
  const remainingDue = Math.max(0, installment.scheduledAmount - installment.amountPaid);

  batch.set(reminderRef, {
    ownerId,
    loanId: loan.id,
    loanReference: loan.loanReference,
    borrowerName: loan.borrowerName,
    borrowerContact: sanitizeString(
      contact,
      VALIDATION_LIMITS.EMAIL_MAX,
      VALIDATION_LIMITS.EMAIL_MIN,
      loan.borrowerPhone
    ),
    channel,
    triggerType,
    installmentNumber: installment.installmentNumber,
    dueDate: installment.dueDate,
    amountDue: remainingDue > 0 ? remainingDue : installment.scheduledAmount,
    currency: loan.currency,
    messageBody: sanitizeString(
      messageBody,
      VALIDATION_LIMITS.MESSAGE_MAX,
      VALIDATION_LIMITS.MESSAGE_MIN
    ),
    deliveryStatus: 'dispatched',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (installment.status !== 'paid') {
    batch.update(instRef, {
      reminderSentCount: Math.min(100, installment.reminderSentCount + 1),
      lastReminderAt: new Date().toISOString().slice(0, 19),
      status: installment.status,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `reminders/${reminderId}`);
  }
}

export async function dispatchReminderBatch(
  ownerId: string,
  candidates: PendingReminderCandidate[]
): Promise<number> {
  if (candidates.length === 0) return 0;
  const nowStr = new Date().toISOString().slice(0, 19);
  const CHUNK_SIZE = 4;

  try {
    for (let i = 0; i < candidates.length; i += CHUNK_SIZE) {
      const chunk = candidates.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      for (const item of chunk) {
        const reminderId = generateSafeId('rem');
        const reminderRef = doc(db, 'reminders', reminderId);
        const instRef = doc(db, 'loans', item.loan.id, 'installments', item.installment.id);
        const contact =
          item.suggestedChannel === 'Email'
            ? item.loan.borrowerEmail
            : item.loan.borrowerPhone;
        const remainingDue = Math.max(
          0,
          item.installment.scheduledAmount - item.installment.amountPaid
        );

        batch.set(reminderRef, {
          ownerId,
          loanId: item.loan.id,
          loanReference: item.loan.loanReference,
          borrowerName: item.loan.borrowerName,
          borrowerContact: sanitizeString(
            contact,
            VALIDATION_LIMITS.EMAIL_MAX,
            VALIDATION_LIMITS.EMAIL_MIN,
            item.loan.borrowerPhone
          ),
          channel: item.suggestedChannel,
          triggerType: item.triggerType,
          installmentNumber: item.installment.installmentNumber,
          dueDate: item.installment.dueDate,
          amountDue: remainingDue,
          currency: item.loan.currency,
          messageBody: sanitizeString(
            item.suggestedMessage,
            VALIDATION_LIMITS.MESSAGE_MAX,
            VALIDATION_LIMITS.MESSAGE_MIN
          ),
          deliveryStatus: 'dispatched',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (item.installment.status !== 'paid') {
          batch.update(instRef, {
            reminderSentCount: Math.min(100, item.installment.reminderSentCount + 1),
            lastReminderAt: nowStr,
            status: item.installment.status,
            updatedAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();
    }

    return candidates.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'reminders');
  }
}

export async function acknowledgeReminderDelivery(reminderId: string): Promise<void> {
  const path = `reminders/${reminderId}`;
  try {
    await updateDoc(doc(db, 'reminders', reminderId), {
      deliveryStatus: 'acknowledged',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Seeds a realistic Uganda commercial & SME credit portfolio for Pristen Investments Ltd.
 */
export async function seedPristenHoldingsPortfolio(ownerId: string): Promise<void> {
  const today = getTodayISO(); // e.g., 2026-10-26

  const sampleBorrowers = [
    {
      id: generateSafeId('brw_kla'),
      fullName: 'Victoria Nile Agro-Processors (U) Ltd',
      nationalIdOrRegNo: 'URSB-800294110',
      phone: '+256 772 418 920',
      email: 'treasury@victorianileagro.co.ug',
      address: 'Plot 44 Jinja Road, Industrial Area, Kampala',
      occupationOrSector: 'Coffee & Grain Export Processing',
      creditTier: 'Prime' as CreditTier,
      monthlyIncomeUGX: 68000000,
      collateralSummary: 'Mailo Land Title Block 204 Plot 91 Kyadondo & Hulling Plant Machinery',
    },
    {
      id: generateSafeId('brw_mkn'),
      fullName: 'Rwenzori Civil & Logistics Ltd',
      nationalIdOrRegNo: 'URSB-800175402',
      phone: '+256 752 883 104',
      email: 'accounts@rwenzorilogistics.ug',
      address: 'Plot 19 Port Bell Road, Bugolobi, Kampala',
      occupationOrSector: 'Haulage & Civil Infrastructure',
      creditTier: 'Standard' as CreditTier,
      monthlyIncomeUGX: 42000000,
      collateralSummary: '2 SinoTruck Howo Prime Movers (UAZ 441K, UBA 812M) Comprehensive Insured',
    },
    {
      id: generateSafeId('brw_ent'),
      fullName: 'Grace Namukasa — Entebbe Cold Chain Mart',
      nationalIdOrRegNo: 'CF88019204912K',
      phone: '+256 782 509 311',
      email: 'gnamukasa@entebbefresh.ug',
      address: 'Plot 8 Kampala-Entebbe Highway, Abaita Ababiri',
      occupationOrSector: 'Cold Storage & Commercial Retail',
      creditTier: 'Prime' as CreditTier,
      monthlyIncomeUGX: 19500000,
      collateralSummary: 'Leasehold Title Volume 4120 Folio 18 Wakiso District',
    },
  ];

  // Helper to shift date relative to today
  const offsetMonths = (monthsDiff: number, extraDays = 0) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + monthsDiff);
    d.setUTCDate(d.getUTCDate() + extraDays);
    return d.toISOString().slice(0, 10);
  };

  const sampleLoans = [
    {
      id: generateSafeId('loan_phl1'),
      loanReference: 'PHL-2026-0104',
      borrower: sampleBorrowers[0],
      currency: 'UGX' as CurrencyCode,
      principalAmount: 120000000,
      annualInterestRate: 12,
      interestMethod: 'reducing_balance' as InterestMethod,
      termMonths: 6,
      paymentFrequency: 'monthly' as PaymentFrequency,
      disbursementDate: offsetMonths(-2, 3), // 1st paid, 2nd due in 3 days!
      paidCount: 1,
      autoReminderEnabled: true,
      reminderDaysBefore: 5,
      purpose: 'Parchment Arabica Coffee Inventory & Export Pre-Financing',
    },
    {
      id: generateSafeId('loan_phl2'),
      loanReference: 'PHL-2026-0089',
      borrower: sampleBorrowers[1],
      currency: 'UGX' as CurrencyCode,
      principalAmount: 85000000,
      annualInterestRate: 12,
      interestMethod: 'flat_rate' as InterestMethod,
      termMonths: 6,
      paymentFrequency: 'monthly' as PaymentFrequency,
      disbursementDate: offsetMonths(-2, -6), // 1st paid, 2nd is 6 days OVERDUE!
      paidCount: 1,
      autoReminderEnabled: true,
      reminderDaysBefore: 7,
      purpose: 'Heavy Fleet Tyre Replacement & Cross-Border Fuel Working Capital',
    },
    {
      id: generateSafeId('loan_phl3'),
      loanReference: 'PHL-2026-0118',
      borrower: sampleBorrowers[2],
      currency: 'UGX' as CurrencyCode,
      principalAmount: 36000000,
      annualInterestRate: 12,
      interestMethod: 'reducing_balance' as InterestMethod,
      termMonths: 4,
      paymentFrequency: 'monthly' as PaymentFrequency,
      disbursementDate: offsetMonths(-1, 0), // 1st installment DUE TODAY!
      paidCount: 0,
      autoReminderEnabled: true,
      reminderDaysBefore: 5,
      purpose:
        '[PENDING_FINANCE_PAYOUT|MTN MoMo Corporate|Teller: Mercy Nabukeera] Solar Walk-In Cold Room Compressor Upgrade',
    },
  ];

  try {
    // 1. Commit borrowers first
    const borrowerBatch = writeBatch(db);
    for (const b of sampleBorrowers) {
      borrowerBatch.set(doc(db, 'borrowers', b.id), {
        ownerId,
        fullName: b.fullName,
        nationalIdOrRegNo: b.nationalIdOrRegNo,
        phone: b.phone,
        email: b.email,
        address: b.address,
        occupationOrSector: b.occupationOrSector,
        creditTier: b.creditTier,
        monthlyIncomeUGX: b.monthlyIncomeUGX,
        collateralSummary: b.collateralSummary,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await borrowerBatch.commit();

    // 2. Commit each loan + its installments in its own dedicated batch
    for (const l of sampleLoans) {
      const loanBatch = writeBatch(db);
      const schedule = calculateAmortizationSchedule({
        principalAmount: l.principalAmount,
        annualInterestRate: l.annualInterestRate,
        termMonths: l.termMonths,
        interestMethod: l.interestMethod,
        paymentFrequency: l.paymentFrequency,
        disbursementDate: l.disbursementDate,
        currency: l.currency,
      });

      let totalPaid = 0;
      let nextDueDate = schedule.installments[0].dueDate;
      let hasOverdue = false;

      for (const item of schedule.installments) {
        const isPaid = item.installmentNumber <= l.paidCount;
        const amtPaid = isPaid ? item.scheduledAmount : 0;
        if (isPaid) {
          totalPaid += amtPaid;
        }
        const status = computeInstallmentStatus(
          item.dueDate,
          amtPaid,
          item.scheduledAmount,
          l.reminderDaysBefore
        );
        if (status === 'overdue') {
          hasOverdue = true;
        }
        if (!isPaid && nextDueDate === schedule.installments[0].dueDate && l.paidCount > 0) {
          if (item.installmentNumber === l.paidCount + 1) {
            nextDueDate = item.dueDate;
          }
        }

        const instId = `${l.id}_inst_${String(item.installmentNumber).padStart(3, '0')}`;
        loanBatch.set(doc(db, 'loans', l.id, 'installments', instId), {
          ownerId,
          loanId: l.id,
          installmentNumber: item.installmentNumber,
          dueDate: item.dueDate,
          scheduledAmount: item.scheduledAmount,
          principalComponent: item.principalComponent,
          interestComponent: item.interestComponent,
          remainingBalanceAfter: item.remainingBalanceAfter,
          amountPaid: amtPaid,
          paidDate: isPaid ? item.dueDate : '',
          paymentReference: isPaid ? `STANBIC-RTGS-70${item.installmentNumber}91` : '',
          status,
          reminderSentCount: isPaid ? 1 : 0,
          lastReminderAt: isPaid ? `${item.dueDate}T09:00:00` : '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const outstandingBalance = Math.max(0, schedule.totalPayable - totalPaid);
      const loanStatus: LoanStatus = hasOverdue ? 'overdue' : 'active';

      loanBatch.set(doc(db, 'loans', l.id), {
        ownerId,
        loanReference: l.loanReference,
        borrowerId: l.borrower.id,
        borrowerName: l.borrower.fullName,
        borrowerPhone: l.borrower.phone,
        borrowerEmail: l.borrower.email,
        currency: l.currency,
        principalAmount: l.principalAmount,
        annualInterestRate: l.annualInterestRate,
        interestMethod: l.interestMethod,
        termMonths: l.termMonths,
        paymentFrequency: l.paymentFrequency,
        disbursementDate: l.disbursementDate,
        nextDueDate,
        totalInterestProjected: schedule.totalInterestProjected,
        totalPayable: schedule.totalPayable,
        amountPaid: totalPaid,
        outstandingBalance,
        installmentsCount: schedule.installmentsCount,
        paidInstallmentsCount: l.paidCount,
        status: loanStatus,
        autoReminderEnabled: l.autoReminderEnabled,
        reminderDaysBefore: l.reminderDaysBefore,
        purpose: l.purpose,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await loanBatch.commit();
    }

    // 3. Seed historical reminder audit entry
    const firstLoan = sampleLoans[1];
    const remId1 = generateSafeId('rem_init1');
    await setDoc(doc(db, 'reminders', remId1), {
      ownerId,
      loanId: firstLoan.id,
      loanReference: firstLoan.loanReference,
      borrowerName: firstLoan.borrower.fullName,
      borrowerContact: firstLoan.borrower.phone,
      channel: 'SMS',
      triggerType: 'Upcoming Due',
      installmentNumber: 1,
      dueDate: offsetMonths(-1, -6),
      amountDue: 17283333,
      currency: 'UGX',
      messageBody:
        'PRISTEN INVESTMENTS LTD: Dear Rwenzori Civil & Logistics Ltd, Installment #1 of UGX 17,283,333 for Facility PHL-2026-0089 is due soon. Remit via Stanbic Bank or MTN MoMo 449120.',
      deliveryStatus: 'acknowledged',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 4. Seed Corporate Executive, Finance & Workers Roster
    await seedCorporateStaffRoster(ownerId);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'loans');
  }
}

export async function createStaffMemberRecord(
  ownerId: string,
  input: {
    fullName: string;
    employeeCode: string;
    role: StaffRole;
    department?: StaffDepartment;
    phone: string;
    email: string;
    status?: 'active' | 'suspended';
  }
): Promise<string> {
  const staffId = generateSafeId('stf');
  const path = `staff/${staffId}`;
  const defaultDept = STAFF_ROLE_METADATA[input.role].department;
  try {
    await setDoc(doc(db, 'staff', staffId), {
      ownerId,
      fullName: sanitizeString(input.fullName, 120, 2, 'Staff Member'),
      employeeCode: sanitizeString(input.employeeCode, 40, 3, 'PHL-EMP-001'),
      role: input.role,
      department: input.department || defaultDept,
      phone: sanitizeString(input.phone, 30, 7, '+256 700 000000'),
      email: sanitizeString(input.email, 120, 3, 'staff@pristeninvestments.co.ug'),
      status: input.status || 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return staffId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateStaffMemberStatus(
  staffId: string,
  status: 'active' | 'suspended'
): Promise<void> {
  const path = `staff/${staffId}`;
  try {
    await updateDoc(doc(db, 'staff', staffId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateStaffMemberPin(
  staffId: string,
  newPin: string,
  existingMember?: StaffMember
): Promise<void> {
  const path = `staff/${staffId}`;
  const cleanPin = /^\d{4}$/.test(newPin.trim())
    ? newPin.trim()
    : String(Math.floor(1000 + Math.random() * 9000));
  const salaryInfo = existingMember
    ? resolveWorkerSalaryInfo(existingMember)
    : {
        monthlySalaryUGX: 2500000,
        salaryStatus: 'pending_approval' as SalaryApprovalStatus,
        paymentRef: '',
      };
  try {
    await updateDoc(doc(db, 'staff', staffId), {
      email: encodeStaffMetadata({
        pin: cleanPin,
        salaryUGX: salaryInfo.monthlySalaryUGX,
        salaryStatus: salaryInfo.salaryStatus,
        paymentRef: salaryInfo.paymentRef,
      }),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function upsertWorkerSalaryAndPayrollState(
  ownerId: string,
  worker: {
    id: string;
    isFirestoreDoc: boolean;
    fullName: string;
    employeeCode: string;
    role: StaffRole;
    department: StaffDepartment;
    phone: string;
    pin: string;
    status: 'active' | 'suspended';
  },
  updates: {
    salaryUGX: number;
    salaryStatus: SalaryApprovalStatus;
    paymentRef?: string;
  }
): Promise<void> {
  const encodedEmail = encodeStaffMetadata({
    pin: worker.pin || resolveWorkerPin(worker),
    salaryUGX: updates.salaryUGX,
    salaryStatus: updates.salaryStatus,
    paymentRef: updates.paymentRef || '',
  });

  if (worker.isFirestoreDoc) {
    const path = `staff/${worker.id}`;
    try {
      await updateDoc(doc(db, 'staff', worker.id), {
        email: encodedEmail,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  } else {
    const staffId = generateSafeId('stf');
    const path = `staff/${staffId}`;
    try {
      await setDoc(doc(db, 'staff', staffId), {
        ownerId,
        fullName: sanitizeString(worker.fullName, 120, 2, 'Staff Member'),
        employeeCode: sanitizeString(worker.employeeCode, 40, 3, 'PHL-EMP-001'),
        role: worker.role,
        department: worker.department || STAFF_ROLE_METADATA[worker.role].department,
        phone: sanitizeString(worker.phone, 30, 7, '+256 700 000000'),
        email: encodedEmail,
        status: worker.status || 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }
}

export async function approveAndSendLoanToClient(
  loan: Loan,
  approverName: string,
  payoutChannelOverride?: string
): Promise<void> {
  const path = `loans/${loan.id}`;
  const parsed = parseLoanDisbursementState(loan);
  const channel = payoutChannelOverride || parsed.channel || 'Stanbic Bank RTGS';
  const todayISO = getTodayISO();

  const updatedPurpose = encodeLoanPurposeWithPayoutState({
    payoutStatus: 'disbursed_to_client',
    channel,
    narration: parsed.cleanPurpose,
    actorName: approverName,
    actionDate: todayISO,
  });

  try {
    await updateDoc(doc(db, 'loans', loan.id), {
      purpose: sanitizeString(
        updatedPurpose,
        VALIDATION_LIMITS.PURPOSE_MAX,
        VALIDATION_LIMITS.PURPOSE_MIN,
        'Working Capital Facility'
      ),
      disbursementDate: loan.disbursementDate,
      status: loan.status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function seedCorporateStaffRoster(ownerId: string): Promise<void> {
  const roster: {
    id: string;
    fullName: string;
    employeeCode: string;
    role: StaffRole;
    department: StaffDepartment;
    phone: string;
    email: string;
    status: 'active' | 'suspended';
  }[] = [
    {
      id: generateSafeId('stf_ed'),
      fullName: 'Joshua Ijoyi',
      employeeCode: 'PHL-EXEC-001',
      role: 'executive_director',
      department: 'Executive Office',
      phone: '+256 772 800100',
      email: encodeStaffMetadata({
        pin: '2233',
        salaryUGX: 12000000,
        salaryStatus: 'approved_by_ed',
        paymentRef: '',
      }),
      status: 'active',
    },
    {
      id: generateSafeId('stf_coo'),
      fullName: 'Grace Namusisi',
      employeeCode: 'PHL-COO-002',
      role: 'coo',
      department: 'Operations (COO)',
      phone: '+256 752 800200',
      email: encodeStaffMetadata({
        pin: '3716',
        salaryUGX: 8500000,
        salaryStatus: 'approved_by_ed',
        paymentRef: '',
      }),
      status: 'active',
    },
    {
      id: generateSafeId('stf_cfo'),
      fullName: 'CPA Ronald Mugisha',
      employeeCode: 'PHL-CFO-003',
      role: 'cfo',
      department: 'Finance Department (CFO)',
      phone: '+256 776 800300',
      email: encodeStaffMetadata({
        pin: '5924',
        salaryUGX: 7800000,
        salaryStatus: 'approved_by_ed',
        paymentRef: '',
      }),
      status: 'active',
    },
    {
      id: generateSafeId('stf_fin1'),
      fullName: 'Prossy Katusiime',
      employeeCode: 'PHL-FIN-004',
      role: 'finance_officer',
      department: 'Finance Department (CFO)',
      phone: '+256 701 800400',
      email: encodeStaffMetadata({
        pin: '6048',
        salaryUGX: 4200000,
        salaryStatus: 'pending_approval',
        paymentRef: '',
      }),
      status: 'active',
    },
    {
      id: generateSafeId('stf_hr1'),
      fullName: 'Diana Nakato',
      employeeCode: 'PHL-HR-005',
      role: 'hr',
      department: 'Human Resources (HR)',
      phone: '+256 774 800450',
      email: encodeStaffMetadata({
        pin: '7319',
        salaryUGX: 4500000,
        salaryStatus: 'pending_approval',
        paymentRef: '',
      }),
      status: 'active',
    },
    {
      id: generateSafeId('stf_mgr'),
      fullName: 'Denis Otim',
      employeeCode: 'PHL-MGR-006',
      role: 'manager',
      department: 'Credit Management',
      phone: '+256 782 800500',
      email: encodeStaffMetadata({
        pin: '4185',
        salaryUGX: 5200000,
        salaryStatus: 'approved_by_ed',
        paymentRef: '',
      }),
      status: 'active',
    },
    {
      id: generateSafeId('stf_sls1'),
      fullName: 'Brenda Akello',
      employeeCode: 'PHL-SLS-007',
      role: 'sales_person',
      department: 'Sales & Origination',
      phone: '+256 754 800600',
      email: encodeStaffMetadata({
        pin: '9263',
        salaryUGX: 2800000,
        salaryStatus: 'pending_approval',
        paymentRef: '',
      }),
      status: 'active',
    },
    {
      id: generateSafeId('stf_sls2'),
      fullName: 'Ivan Ssemakula',
      employeeCode: 'PHL-SLS-008',
      role: 'sales_person',
      department: 'Sales & Origination',
      phone: '+256 779 800700',
      email: encodeStaffMetadata({
        pin: '1594',
        salaryUGX: 2800000,
        salaryStatus: 'pending_approval',
        paymentRef: '',
      }),
      status: 'active',
    },
    {
      id: generateSafeId('stf_tlr1'),
      fullName: 'Mercy Nabukeera',
      employeeCode: 'PHL-TLR-009',
      role: 'teller',
      department: 'Teller Disbursement Desk',
      phone: '+256 704 800800',
      email: encodeStaffMetadata({
        pin: '2847',
        salaryUGX: 1800000,
        salaryStatus: 'pending_approval',
        paymentRef: '',
      }),
      status: 'active',
    },
    {
      id: generateSafeId('stf_tlr2'),
      fullName: 'Samuel Okello',
      employeeCode: 'PHL-TLR-010',
      role: 'teller',
      department: 'Teller Disbursement Desk',
      phone: '+256 788 800900',
      email: encodeStaffMetadata({
        pin: '6738',
        salaryUGX: 1800000,
        salaryStatus: 'pending_approval',
        paymentRef: '',
      }),
      status: 'active',
    },
  ];

  try {
    const batch = writeBatch(db);
    for (const s of roster) {
      batch.set(doc(db, 'staff', s.id), {
        ownerId,
        fullName: s.fullName,
        employeeCode: s.employeeCode,
        role: s.role,
        department: s.department,
        phone: s.phone,
        email: s.email,
        status: s.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'staff');
  }
}



