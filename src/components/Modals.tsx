import React, { useMemo, useState } from 'react';
import { X, CheckCircle2, Send } from 'lucide-react';
import {
  Borrower,
  CreditTier,
  CurrencyCode,
  Installment,
  InterestMethod,
  Loan,
  PaymentFrequency,
  ReminderChannel,
  ReminderTriggerType,
} from '../types/loan';
import {
  buildReminderMessage,
  calculateAmortizationSchedule,
  daysBetweenDates,
  formatCurrency,
  getTodayISO,
} from '../utils/loanEngine';
import {
  createBorrowerRecord,
  createLoanWithSchedule,
  dispatchReminder,
  recordInstallmentPayment,
} from '../services/loanService';

// ============================================================================
// 1. Register Borrower Modal
// ============================================================================
interface NewBorrowerModalProps {
  ownerId: string;
  onClose: () => void;
  onCreated: (borrowerId: string, borrowerName: string) => void;
}

export const NewBorrowerModal: React.FC<NewBorrowerModalProps> = ({
  ownerId,
  onClose,
  onCreated,
}) => {
  const [fullName, setFullName] = useState('');
  const [nationalIdOrRegNo, setNationalIdOrRegNo] = useState('');
  const [phone, setPhone] = useState('+256 ');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [occupationOrSector, setOccupationOrSector] = useState('');
  const [creditTier, setCreditTier] = useState<CreditTier>('Prime');
  const [monthlyIncomeUGX, setMonthlyIncomeUGX] = useState<string>('15000000');
  const [collateralSummary, setCollateralSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) {
      setSubmitError('Please enter the borrower or company full legal name (at least 2 characters).');
      return;
    }

    const cleanedPhone = phone.trim();
    const effectivePhone =
      cleanedPhone.length >= 7 && cleanedPhone !== '+256'
        ? cleanedPhone
        : '+256 700 000 000';

    setSubmitting(true);
    setSubmitError(null);
    try {
      const parsedIncome = Number(String(monthlyIncomeUGX).replace(/,/g, ''));
      const id = await createBorrowerRecord(ownerId, {
        fullName: trimmedName,
        nationalIdOrRegNo: nationalIdOrRegNo.trim() || 'NIN-PENDING',
        phone: effectivePhone,
        email: email.trim() || 'client@pristen.ug',
        address: address.trim() || 'Kampala, Uganda',
        occupationOrSector: occupationOrSector.trim() || 'Commercial Enterprise',
        creditTier,
        monthlyIncomeUGX: Number.isFinite(parsedIncome) && parsedIncome >= 0 ? parsedIncome : 0,
        collateralSummary:
          collateralSummary.trim() || 'Registered Chattel & Personal Guarantee',
      });
      onCreated(id, trimmedName);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Unable to save borrower profile.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-blue-950/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-blue-100 rounded-xl max-w-lg w-full overflow-hidden shadow-xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 bg-blue-50/50 border-b border-blue-100 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Register Client / Borrower — Pristen Investments Ltd
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              KYC & Collateral Record for Individual or Corporate Entity
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 min-h-0">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {submitError && (
              <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg font-mono break-all">
                {submitError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Full Legal Name / Registered Company Name *
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g., Kampala Agro-Commodities (U) Ltd"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Uganda NIN / URSB Reg No.
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={nationalIdOrRegNo}
                  onChange={(e) => setNationalIdOrRegNo(e.target.value)}
                  placeholder="e.g., URSB-80029144 or CM90..."
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Credit Risk Tier
                </label>
                <select
                  value={creditTier}
                  onChange={(e) => setCreditTier(e.target.value as CreditTier)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                >
                  <option value="Prime">Prime Tier</option>
                  <option value="Standard">Standard Tier</option>
                  <option value="Watchlist">Watchlist</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Primary Phone / MoMo Number *
                </label>
                <input
                  type="text"
                  maxLength={30}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+256 772 000 000"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  maxLength={120}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="accounts@company.co.ug"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Economic Sector / Occupation
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={occupationOrSector}
                  onChange={(e) => setOccupationOrSector(e.target.value)}
                  placeholder="e.g., Coffee Export & Processing"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Verified Monthly Net Cashflow (UGX)
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={monthlyIncomeUGX}
                  onChange={(e) => setMonthlyIncomeUGX(e.target.value)}
                  placeholder="15000000"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Physical Address (Plot, Road, District)
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Plot 14 Kampala Road, Central Division, Kampala"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Pledged Collateral / Security Summary
                </label>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={collateralSummary}
                  onChange={(e) => setCollateralSummary(e.target.value)}
                  placeholder="e.g., Mailo Land Title Block 204 Plot 88 Kyadondo & Chattel Mortgage"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              {submitting ? 'Registering...' : 'Save Borrower Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// 2. Originate Loan Facility Modal
// ============================================================================
interface NewLoanModalProps {
  ownerId: string;
  borrowers: Borrower[];
  initialBorrowerId?: string | null;
  initialPreset?: {
    currency: CurrencyCode;
    principalAmount: number;
    annualInterestRate: number;
    interestMethod: InterestMethod;
    termMonths: number;
    paymentFrequency: PaymentFrequency;
    disbursementDate: string;
  } | null;
  onClose: () => void;
  onCreated: (loanId: string) => void;
  onOpenNewBorrower: () => void;
}

export const NewLoanModal: React.FC<NewLoanModalProps> = ({
  ownerId,
  borrowers,
  initialBorrowerId,
  initialPreset,
  onClose,
  onCreated,
  onOpenNewBorrower,
}) => {
  const [selectedBorrowerId, setSelectedBorrowerId] = useState<string>(
    initialBorrowerId || borrowers[0]?.id || ''
  );
  const [loanReference, setLoanReference] = useState<string>(
    `PHL-2026-${String(Math.floor(100 + Math.random() * 899))}`
  );
  const [currency, setCurrency] = useState<CurrencyCode>(
    initialPreset?.currency || 'UGX'
  );
  const [principalAmount, setPrincipalAmount] = useState<number>(
    initialPreset?.principalAmount || 45000000
  );
  const [annualInterestRate, setAnnualInterestRate] = useState<number>(
    initialPreset?.annualInterestRate ?? 12
  );
  const [interestMethod, setInterestMethod] = useState<InterestMethod>(
    initialPreset?.interestMethod || 'reducing_balance'
  );
  const [termMonths, setTermMonths] = useState<number>(
    initialPreset?.termMonths || 6
  );
  const [paymentFrequency, setPaymentFrequency] = useState<PaymentFrequency>(
    initialPreset?.paymentFrequency || 'monthly'
  );
  const [disbursementDate, setDisbursementDate] = useState<string>(
    initialPreset?.disbursementDate || getTodayISO()
  );
  const [autoReminderEnabled, setAutoReminderEnabled] = useState<boolean>(true);
  const [reminderDaysBefore, setReminderDaysBefore] = useState<number>(5);
  const [purpose, setPurpose] = useState<string>(
    'Commercial Inventory & Working Capital Expansion'
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const previewSchedule = useMemo(
    () =>
      calculateAmortizationSchedule({
        principalAmount: Math.max(1, principalAmount),
        annualInterestRate: Math.max(0, annualInterestRate),
        termMonths: Math.max(1, termMonths),
        interestMethod,
        paymentFrequency,
        disbursementDate,
        currency,
      }),
    [
      principalAmount,
      annualInterestRate,
      termMonths,
      interestMethod,
      paymentFrequency,
      disbursementDate,
      currency,
    ]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const borrower =
      borrowers.find((b) => b.id === selectedBorrowerId) || borrowers[0];
    if (!borrower || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const loanId = await createLoanWithSchedule(ownerId, borrower, {
        loanReference,
        currency,
        principalAmount,
        annualInterestRate,
        interestMethod,
        termMonths,
        paymentFrequency,
        disbursementDate,
        autoReminderEnabled,
        reminderDaysBefore,
        purpose,
      });
      onCreated(loanId);
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Unable to originate loan facility.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-blue-950/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-blue-100 rounded-xl max-w-2xl w-full overflow-hidden shadow-xl">
        <div className="px-6 py-4 bg-blue-50/50 border-b border-blue-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Originate Loan Facility & Generate Schedule
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Automatically computes amortization installments and activates reminder tracking
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {borrowers.length === 0 ? (
          <div className="p-8 text-center space-y-4">
            <p className="text-sm text-slate-700">
              You must register at least one Borrower before originating a loan facility.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenNewBorrower();
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800"
            >
              Register Borrower First
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
            {submitError && (
              <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg font-mono break-all">
                {submitError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700">
                    Borrower Account *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenNewBorrower();
                    }}
                    className="text-xs font-semibold text-blue-700 hover:underline"
                  >
                    + New Borrower
                  </button>
                </div>
                <select
                  required
                  value={selectedBorrowerId}
                  onChange={(e) => setSelectedBorrowerId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  {borrowers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.fullName} ({b.creditTier})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Facility Reference Code *
                </label>
                <input
                  required
                  minLength={3}
                  maxLength={40}
                  value={loanReference}
                  onChange={(e) => setLoanReference(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Currency & Principal Amount *
                </label>
                <div className="flex gap-2">
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                    className="px-2.5 py-2 text-sm font-mono border border-slate-300 rounded-lg bg-slate-50"
                  >
                    <option value="UGX">UGX</option>
                    <option value="USD">USD</option>
                  </select>
                  <input
                    required
                    type="number"
                    min={1}
                    step="any"
                    value={principalAmount}
                    onChange={(e) => setPrincipalAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Monthly Interest Rate (% per month) *
                </label>
                <input
                  required
                  type="number"
                  min={0}
                  max={200}
                  step="any"
                  value={annualInterestRate}
                  onChange={(e) => setAnnualInterestRate(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Interest Calculation Method
                </label>
                <select
                  value={interestMethod}
                  onChange={(e) => setInterestMethod(e.target.value as InterestMethod)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="reducing_balance">Reducing Balance (EMI)</option>
                  <option value="flat_rate">Flat Rate</option>
                  <option value="interest_only">Interest-Only (Bullet)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Tenor (Months) & Frequency
                </label>
                <div className="flex gap-2">
                  <input
                    required
                    type="number"
                    min={1}
                    max={120}
                    value={termMonths}
                    onChange={(e) => setTermMonths(Number(e.target.value))}
                    className="w-24 px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                  <select
                    value={paymentFrequency}
                    onChange={(e) => setPaymentFrequency(e.target.value as PaymentFrequency)}
                    className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="biweekly">Bi-Weekly</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Disbursement Date *
                </label>
                <input
                  required
                  type="date"
                  value={disbursementDate}
                  onChange={(e) => setDisbursementDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Automated Reminder Rule
                </label>
                <div className="flex items-center gap-2 pt-1.5">
                  <input
                    type="checkbox"
                    checked={autoReminderEnabled}
                    onChange={(e) => setAutoReminderEnabled(e.target.checked)}
                    className="accent-slate-900 w-4 h-4"
                  />
                  <span className="text-xs text-slate-700">Remind</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={reminderDaysBefore}
                    onChange={(e) => setReminderDaysBefore(Number(e.target.value))}
                    className="w-16 px-2 py-1 text-xs font-mono border border-slate-300 rounded-md"
                  />
                  <span className="text-xs text-slate-700">days before due</span>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Commercial Facility Purpose *
                </label>
                <input
                  required
                  minLength={2}
                  maxLength={250}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            {/* Live Amortization Summary Preview */}
            <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="text-xs text-slate-500">Installments</div>
                <div className="text-sm font-mono font-bold text-blue-700 mt-0.5">
                  {previewSchedule.installmentsCount}x ({paymentFrequency})
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">1st Installment</div>
                <div className="text-sm font-mono font-bold text-slate-900 mt-0.5">
                  {formatCurrency(previewSchedule.periodicPayment, currency)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Total Interest</div>
                <div className="text-sm font-mono font-bold text-orange-600 mt-0.5">
                  {formatCurrency(previewSchedule.totalInterestProjected, currency)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Total Repayable</div>
                <div className="text-sm font-mono font-bold text-slate-900 mt-0.5">
                  {formatCurrency(previewSchedule.totalPayable, currency)}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {submitting
                  ? 'Disbursing & Generating Schedule...'
                  : 'Approve & Disburse Facility'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 3. Record Installment Repayment Modal
// ============================================================================
interface RecordPaymentModalProps {
  ownerId: string;
  loan: Loan;
  installment: Installment;
  allInstallments: Installment[];
  onClose: () => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  ownerId,
  loan,
  installment,
  allInstallments,
  onClose,
}) => {
  const remainingOnInstallment = Math.max(
    0,
    installment.scheduledAmount - installment.amountPaid
  );
  const [paymentAmount, setPaymentAmount] = useState<number>(remainingOnInstallment);
  const [paymentReference, setPaymentReference] = useState<string>(
    `MTN-MOMO-${String(Math.floor(100000 + Math.random() * 899999))}`
  );
  const [paidDate, setPaidDate] = useState<string>(getTodayISO());
  const [sendReceiptReminder, setSendReceiptReminder] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || paymentAmount <= 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await recordInstallmentPayment({
        ownerId,
        loan,
        installment,
        allInstallments,
        paymentAmount,
        paymentReference,
        paidDate,
        sendReceiptReminder,
      });
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Unable to record repayment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-blue-950/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-blue-100 rounded-xl max-w-md w-full overflow-hidden shadow-xl">
        <div className="px-6 py-4 bg-blue-50/50 border-b border-blue-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Record Repayment — Installment #{installment.installmentNumber}
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              <span className="text-blue-700">{loan.loanReference}</span> · {loan.borrowerName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {submitError && (
            <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg font-mono break-all">
              {submitError}
            </div>
          )}
          <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-600">Scheduled Installment:</span>
              <span className="font-mono font-semibold text-slate-900">
                {formatCurrency(installment.scheduledAmount, loan.currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Principal / Interest Split:</span>
              <span className="font-mono">
                <span className="text-blue-700 font-medium">{formatCurrency(installment.principalComponent, loan.currency)}</span> /{' '}
                <span className="text-orange-600 font-medium">{formatCurrency(installment.interestComponent, loan.currency)}</span>
              </span>
            </div>
            <div className="flex justify-between border-t border-blue-100 pt-1.5">
              <span className="text-slate-700 font-medium">Remaining Due on Installment:</span>
              <span className="font-mono font-bold text-blue-700">
                {formatCurrency(remainingOnInstallment, loan.currency)}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Amount Received ({loan.currency}) *
            </label>
            <input
              required
              type="number"
              min={1}
              max={remainingOnInstallment}
              step="any"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Payment Receipt / Bank / MoMo Reference *
            </label>
            <input
              required
              maxLength={80}
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="e.g., MTN-MOMO-849201 or STANBIC-RTGS-112"
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Value Date *
            </label>
            <input
              required
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <label className="flex items-center gap-2.5 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={sendReceiptReminder}
              onChange={(e) => setSendReceiptReminder(e.target.checked)}
              className="accent-blue-700 w-4 h-4"
            />
            <span className="text-xs text-slate-700">
              Automatically dispatch SMS payment confirmation receipt to {loan.borrowerPhone}
            </span>
          </label>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {submitting ? 'Posting Ledger Entry...' : 'Confirm & Post Repayment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// 4. Send Custom / Automated Reminder Modal
// ============================================================================
interface SendReminderModalProps {
  ownerId: string;
  loan: Loan;
  installment: Installment;
  onClose: () => void;
}

export const SendReminderModal: React.FC<SendReminderModalProps> = ({
  ownerId,
  loan,
  installment,
  onClose,
}) => {
  const daysDelta = daysBetweenDates(getTodayISO(), installment.dueDate);
  const defaultTrigger: ReminderTriggerType =
    daysDelta < 0
      ? 'Overdue Escalation'
      : daysDelta === 0
      ? 'Due Today'
      : 'Upcoming Due';

  const remainingDue = Math.max(0, installment.scheduledAmount - installment.amountPaid);

  const [channel, setChannel] = useState<ReminderChannel>('SMS');
  const [triggerType, setTriggerType] = useState<ReminderTriggerType>(defaultTrigger);
  const [messageBody, setMessageBody] = useState<string>(() =>
    buildReminderMessage({
      borrowerName: loan.borrowerName,
      loanReference: loan.loanReference,
      installmentNumber: installment.installmentNumber,
      dueDate: installment.dueDate,
      amountDue: remainingDue,
      currency: loan.currency,
      triggerType: defaultTrigger,
      daysDelta,
    })
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleTriggerChange = (newTrigger: ReminderTriggerType) => {
    setTriggerType(newTrigger);
    setMessageBody(
      buildReminderMessage({
        borrowerName: loan.borrowerName,
        loanReference: loan.loanReference,
        installmentNumber: installment.installmentNumber,
        dueDate: installment.dueDate,
        amountDue: remainingDue,
        currency: loan.currency,
        triggerType: newTrigger,
        daysDelta,
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await dispatchReminder({
        ownerId,
        loan,
        installment,
        channel,
        triggerType,
        messageBody,
      });
      onClose();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Unable to dispatch reminder.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-blue-950/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-orange-100 rounded-xl max-w-lg w-full overflow-hidden shadow-xl">
        <div className="px-6 py-4 bg-orange-50/50 border-b border-orange-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Dispatch Payment Reminder — Installment #{installment.installmentNumber}
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              <span className="text-blue-700">{loan.loanReference}</span> · {loan.borrowerName} · Due {installment.dueDate}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {submitError && (
            <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg font-mono break-all">
              {submitError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Notification Channel
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as ReminderChannel)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="SMS">SMS ({loan.borrowerPhone})</option>
                <option value="WhatsApp">WhatsApp ({loan.borrowerPhone})</option>
                <option value="Email">Email ({loan.borrowerEmail})</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Reminder Template Type
              </label>
              <select
                value={triggerType}
                onChange={(e) => handleTriggerChange(e.target.value as ReminderTriggerType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              >
                <option value="Upcoming Due">Upcoming Due Notice</option>
                <option value="Due Today">Due Today Notice</option>
                <option value="Overdue Escalation">Overdue Escalation</option>
                <option value="Payment Receipt">Payment Receipt</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Message Payload (Pristen Investments Ltd) *
            </label>
            <textarea
              required
              rows={4}
              minLength={5}
              maxLength={1000}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono leading-relaxed border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {submitting ? 'Dispatching...' : `Dispatch ${channel} Reminder`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
