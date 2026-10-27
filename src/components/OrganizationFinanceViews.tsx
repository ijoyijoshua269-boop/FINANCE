import React, { useMemo, useState } from 'react';
import {
  Banknote,
  Building2,
  CheckCircle2,
  CreditCard,
  Landmark,
  Lock,
  Plus,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  X,
  ArrowUpRight,
  KeyRound,
  Calculator,
  RefreshCw,
  Clock,
  Send,
  Edit3,
} from 'lucide-react';
import {
  Borrower,
  CurrencyCode,
  DEFAULT_CORPORATE_WORKERS,
  DEFAULT_ROLE_MONTHLY_SALARY_UGX,
  encodeLoanPurposeWithPayoutState,
  encodeStaffMetadata,
  generateAnonymousFourDigitPin,
  Installment,
  InterestMethod,
  Loan,
  parseLoanDisbursementState,
  PaymentFrequency,
  resolveWorkerPin,
  resolveWorkerSalaryInfo,
  SalaryApprovalStatus,
  StaffDepartment,
  StaffMember,
  StaffRole,
  STAFF_ROLE_METADATA,
} from '../types/loan';
import {
  calculateAmortizationSchedule,
  formatCurrency,
  getTodayISO,
} from '../utils/loanEngine';
import {
  approveAndSendLoanToClient,
  createLoanWithSchedule,
  createStaffMemberRecord,
  seedCorporateStaffRoster,
  updateStaffMemberPin,
  updateStaffMemberStatus,
  upsertWorkerSalaryAndPayrollState,
} from '../services/loanService';

// ============================================================================
// 1. TELLER LOAN DISBURSEMENT DESK (INITIATES LOAN -> FINANCE APPROVES & SENDS)
// ============================================================================
interface TellerDisbursementViewProps {
  ownerId: string;
  activeRole: StaffRole;
  signedInWorkerName?: string;
  borrowers: Borrower[];
  loans: Loan[];
  onOpenNewBorrower: () => void;
  onDisbursed?: (loanId: string) => void;
}

export const TellerDisbursementView: React.FC<TellerDisbursementViewProps> = ({
  ownerId,
  activeRole,
  signedInWorkerName = 'Mercy Nabukeera',
  borrowers,
  loans,
  onOpenNewBorrower,
  onDisbursed,
}) => {
  const [selectedBorrowerId, setSelectedBorrowerId] = useState<string>(
    borrowers[0]?.id || ''
  );
  const [currency, setCurrency] = useState<CurrencyCode>('UGX');
  const [principalAmount, setPrincipalAmount] = useState<number>(15000000);
  const [monthlyInterestRate, setMonthlyInterestRate] = useState<number>(12);
  const [interestMethod, setInterestMethod] =
    useState<InterestMethod>('reducing_balance');
  const [termMonths, setTermMonths] = useState<number>(6);
  const [paymentFrequency, setPaymentFrequency] =
    useState<PaymentFrequency>('monthly');
  const [disbursementDate, setDisbursementDate] = useState<string>(getTodayISO());
  const [disbursementChannel, setDisbursementChannel] = useState<
    'Cash Counter' | 'Stanbic Bank RTGS' | 'MTN MoMo Corporate' | 'Airtel Money'
  >('MTN MoMo Corporate');
  const [purpose, setPurpose] = useState<string>(
    'Commercial Working Capital & Trade Inventory Financing'
  );
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [disbursementReceipt, setDisbursementReceipt] = useState<{
    loanId: string;
    loanRef: string;
    borrowerName: string;
    principalFormatted: string;
    channel: string;
    firstDueDate: string;
    periodicInstallmentFormatted: string;
  } | null>(null);

  const effectiveBorrowerId =
    selectedBorrowerId && borrowers.some((b) => b.id === selectedBorrowerId)
      ? selectedBorrowerId
      : borrowers[0]?.id || '';

  const selectedBorrower = borrowers.find((b) => b.id === effectiveBorrowerId);

  const previewSchedule = useMemo(
    () =>
      calculateAmortizationSchedule({
        principalAmount,
        annualInterestRate: monthlyInterestRate,
        interestMethod,
        termMonths,
        paymentFrequency,
        disbursementDate,
        currency,
      }),
    [
      principalAmount,
      monthlyInterestRate,
      interestMethod,
      termMonths,
      paymentFrequency,
      disbursementDate,
      currency,
    ]
  );

  const handleGiveOutLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBorrower) {
      setError('Please select or register a borrower before initiating a loan disbursement.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const loanRefCode = `PHL-${new Date().getFullYear()}-${Math.floor(
        1000 + Math.random() * 8999
      )}`;
      const encodedPurpose = encodeLoanPurposeWithPayoutState({
        payoutStatus: 'pending_finance_payout',
        channel: disbursementChannel,
        narration: purpose,
        actorName: signedInWorkerName,
      });

      const loanId = await createLoanWithSchedule(ownerId, selectedBorrower, {
        loanReference: loanRefCode,
        currency,
        principalAmount,
        annualInterestRate: monthlyInterestRate,
        interestMethod,
        termMonths,
        paymentFrequency,
        disbursementDate,
        autoReminderEnabled: true,
        reminderDaysBefore: 3,
        purpose: encodedPurpose,
      });
      const firstDueDate =
        previewSchedule.installments[0]?.dueDate || disbursementDate;
      setDisbursementReceipt({
        loanId,
        loanRef: loanRefCode,
        borrowerName: selectedBorrower.fullName,
        principalFormatted: formatCurrency(principalAmount, currency),
        channel: disbursementChannel,
        firstDueDate,
        periodicInstallmentFormatted: formatCurrency(
          previewSchedule.periodicPayment,
          currency
        ),
      });
      if (onDisbursed) {
        onDisbursed(loanId);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to submit loan disbursement request.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const pendingFinanceCount = useMemo(
    () =>
      loans.filter(
        (l) => parseLoanDisbursementState(l).payoutStatus === 'pending_finance_payout'
      ).length,
    [loans]
  );

  return (
    <div className="space-y-6">
      {/* Teller Desk Header Banner */}
      <div className="bg-white border border-blue-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-2xs">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold text-orange-600">
            <Banknote className="w-4 h-4" />
            <span>Teller Loan Disbursement Desk — Two-Stage Finance Payout Control</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Teller Loan Origination Terminal (Routed to Finance Department for Client Payout)
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            After a Teller submits a loan disbursement here, the request is automatically queued for the{' '}
            <strong className="text-slate-900">Finance Department (C.F.O. / Finance Officer)</strong>, which is responsible for approving and sending the money to the client.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenNewBorrower}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Register New Borrower
          </button>
        </div>
      </div>

      {disbursementReceipt && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900 font-mono">
              <Clock className="w-4 h-4 text-amber-700" />
              <span>
                Teller Request Submitted ({disbursementReceipt.loanRef}) — Routed to Finance Department for Approval &amp; Client Payout
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-900">
              {disbursementReceipt.principalFormatted} for{' '}
              <span className="underline">{disbursementReceipt.borrowerName}</span>{' '}
              ({disbursementReceipt.channel}) is now awaiting the{' '}
              <strong className="text-blue-800">Finance Department</strong> to approve and send the money to the client.
            </p>
            <p className="text-xs text-slate-700 font-mono">
              First Installment Due: {disbursementReceipt.firstDueDate} · Scheduled Payment:{' '}
              {disbursementReceipt.periodicInstallmentFormatted}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDisbursementReceipt(null)}
            className="px-3 py-1.5 text-xs font-semibold text-amber-950 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 shrink-0 cursor-pointer"
          >
            Acknowledge
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl font-mono">
          {error}
        </div>
      )}

      {/* Main Two-Column Disbursement Workstation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Loan Disbursement Form */}
        <form
          onSubmit={handleGiveOutLoan}
          className="lg:col-span-7 bg-white border border-blue-100 rounded-xl p-6 space-y-5 shadow-2xs"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">
              1. Borrower Selection &amp; Teller Disbursement Request
            </h3>
            <span className="text-xs font-mono font-semibold text-orange-600">
              Standard Rate: 12% / Month
            </span>
          </div>

          {borrowers.length === 0 ? (
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-amber-950">
                  No Registered Borrowers Found
                </div>
                <p className="text-xs text-amber-800">
                  Register the client’s KYC details first to initiate their loan disbursement.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenNewBorrower}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Register Borrower Now
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Select Verified Borrower *
                </label>
                <button
                  type="button"
                  onClick={onOpenNewBorrower}
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  + New Borrower KYC
                </button>
              </div>
              <select
                value={effectiveBorrowerId}
                onChange={(e) => setSelectedBorrowerId(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {borrowers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.fullName} — {b.nationalIdOrRegNo} ({b.phone})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg font-mono"
              >
                <option value="UGX">UGX (Shillings)</option>
                <option value="USD">USD (Dollars)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Loan Principal Amount Requested *
              </label>
              <input
                type="number"
                required
                min={10000}
                step={currency === 'UGX' ? 100000 : 50}
                value={principalAmount}
                onChange={(e) =>
                  setPrincipalAmount(Math.max(0, Number(e.target.value)))
                }
                className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Monthly Interest (% / Mo)
              </label>
              <input
                type="number"
                required
                min={0.1}
                max={100}
                step={0.5}
                value={monthlyInterestRate}
                onChange={(e) =>
                  setMonthlyInterestRate(Math.max(0, Number(e.target.value)))
                }
                className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Interest Computation
              </label>
              <select
                value={interestMethod}
                onChange={(e) =>
                  setInterestMethod(e.target.value as InterestMethod)
                }
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="reducing_balance">Reducing Balance</option>
                <option value="flat_rate">Flat Rate</option>
                <option value="interest_only">Interest-Only + Balloon</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Duration (Months)
              </label>
              <input
                type="number"
                required
                min={1}
                max={120}
                value={termMonths}
                onChange={(e) =>
                  setTermMonths(Math.max(1, Number(e.target.value)))
                }
                className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Repayment Frequency
              </label>
              <select
                value={paymentFrequency}
                onChange={(e) =>
                  setPaymentFrequency(e.target.value as PaymentFrequency)
                }
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="monthly">Monthly</option>
                <option value="biweekly">Bi-Weekly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Disbursement Date
              </label>
              <input
                type="date"
                required
                value={disbursementDate}
                onChange={(e) => setDisbursementDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Requested Client Payout Channel
              </label>
              <select
                value={disbursementChannel}
                onChange={(e) =>
                  setDisbursementChannel(
                    e.target.value as typeof disbursementChannel
                  )
                }
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="MTN MoMo Corporate">MTN MoMo Corporate</option>
                <option value="Stanbic Bank RTGS">Stanbic Bank RTGS</option>
                <option value="Airtel Money">Airtel Money</option>
                <option value="Cash Counter">Cash Counter</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Loan Purpose &amp; Teller Narration *
            </label>
            <input
              type="text"
              required
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 text-xs text-blue-950 flex items-center justify-between gap-3">
            <div>
              <strong className="font-semibold">Finance Department Payout Protocol:</strong>{' '}
              Submitting this facility sends it to the Finance Department (C.F.O. / Finance Officer) to approve and send the money to the client.
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="submit"
              disabled={submitting || borrowers.length === 0}
              className="inline-flex items-center gap-2 px-6 py-3 text-xs font-bold text-white bg-orange-600 rounded-xl hover:bg-orange-700 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            >
              <Send className="w-4 h-4" />
              {submitting
                ? 'Routing to Finance Dept...'
                : `Submit Loan for Finance Approval & Payout (${formatCurrency(
                    principalAmount,
                    currency
                  )})`}
            </button>
          </div>
        </form>

        {/* Right 5 Columns: Live Disbursement Voucher & Schedule Summary */}
        <div className="lg:col-span-5 bg-slate-950 text-white border border-amber-500/30 rounded-xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <div className="text-xs font-mono text-amber-400">
                Disbursement Voucher Preview
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                {selectedBorrower
                  ? selectedBorrower.fullName
                  : 'Select a Borrower'}
              </h3>
            </div>
            <span className="px-2.5 py-1 text-xs font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/30 rounded-md">
              {monthlyInterestRate}% / month
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3.5 rounded-lg bg-white/5 border border-white/10">
              <div className="text-slate-400">Requested Principal</div>
              <div className="text-base font-bold text-amber-400 mt-1 tabular-nums">
                {formatCurrency(principalAmount, currency)}
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-white/5 border border-white/10">
              <div className="text-slate-400">Periodic Installment</div>
              <div className="text-base font-bold text-white mt-1 tabular-nums">
                {formatCurrency(previewSchedule.periodicPayment, currency)}
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-white/5 border border-white/10">
              <div className="text-slate-400">Total Monthly Interest</div>
              <div className="text-sm font-semibold text-orange-300 mt-1 tabular-nums">
                {formatCurrency(
                  previewSchedule.totalInterestProjected,
                  currency
                )}
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-white/5 border border-white/10">
              <div className="text-slate-400">Total Payable</div>
              <div className="text-sm font-semibold text-emerald-300 mt-1 tabular-nums">
                {formatCurrency(previewSchedule.totalPayable, currency)}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-white/5 border border-amber-400/30 text-xs space-y-1">
            <div className="font-mono font-semibold text-amber-300">
              Payout Workflow Stage:
            </div>
            <div className="text-slate-300">
              1. Teller originates loan request → 2. Finance Department approves &amp; sends money to client ({disbursementChannel}).
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span>First 4 Scheduled Installments</span>
              <span>{previewSchedule.installmentsCount} Total Installments</span>
            </div>
            <div className="border border-white/10 rounded-lg overflow-hidden divide-y divide-white/10 text-xs font-mono">
              {previewSchedule.installments.slice(0, 4).map((r) => (
                <div
                  key={r.installmentNumber}
                  className="px-3.5 py-2 flex items-center justify-between bg-white/5"
                >
                  <span className="text-slate-300">
                    #{r.installmentNumber} · {r.dueDate}
                  </span>
                  <span className="text-amber-300 font-semibold tabular-nums">
                    {formatCurrency(r.scheduledAmount, currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Counter Log of Teller Loan Requests & Finance Payout Status */}
      <div className="bg-white border border-blue-100 rounded-xl overflow-hidden shadow-2xs">
        <div className="px-6 py-4 border-b border-blue-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Teller Loan Disbursement Queue &amp; Finance Payout Status ({loans.length})
            </h3>
            <p className="text-xs text-slate-500">
              Tracks loans initiated by Tellers and whether the Finance Department has approved and sent the money to the client
            </p>
          </div>
          <div className="text-xs font-mono text-amber-700 font-semibold">
            {pendingFinanceCount} Awaiting Finance Approval &amp; Client Transfer
          </div>
        </div>

        {loans.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No loan disbursement requests yet. Use the Teller form above to initiate a loan.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-blue-50/70 border-b border-blue-100 text-xs font-semibold text-blue-950">
                <tr>
                  <th className="py-3 px-5">Loan Ref &amp; Borrower</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Monthly Rate</th>
                  <th className="py-3 px-4 text-right">Principal Amount</th>
                  <th className="py-3 px-4">Payout Channel &amp; Purpose</th>
                  <th className="py-3 px-5 text-right">Finance Approval &amp; Client Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loans.slice(0, 12).map((loan) => {
                  const payoutInfo = parseLoanDisbursementState(loan);
                  const isPendingFinance =
                    payoutInfo.payoutStatus === 'pending_finance_payout';
                  return (
                    <tr key={loan.id} className="hover:bg-blue-50/30">
                      <td className="py-3 px-5">
                        <div className="font-semibold text-slate-900">
                          {loan.borrowerName}
                        </div>
                        <div className="text-xs font-mono text-blue-700">
                          {loan.loanReference} · {loan.borrowerPhone}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700">
                        {loan.disbursementDate}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-orange-600">
                        {loan.annualInterestRate}% / mo ({loan.termMonths}m)
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-blue-700">
                        {formatCurrency(loan.principalAmount, loan.currency)}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700 max-w-xs">
                        <div className="font-semibold text-slate-900">
                          {payoutInfo.channel}
                        </div>
                        <div className="text-slate-500 truncate">
                          {payoutInfo.cleanPurpose}
                        </div>
                      </td>
                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        {isPendingFinance ? (
                          <div className="inline-flex flex-col items-end">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                              <Clock className="w-3.5 h-3.5" />
                              Pending Finance Approval &amp; Payout
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">
                              Finance Dept to approve &amp; send money
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-end">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Approved &amp; Money Sent to Client
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">
                              {payoutInfo.metaSummary}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 1B. SALARIES & PAYROLL SECTOR (ON FINANCE, MANAGER, C.O.O. & EXEC. DIRECTOR PAGES)
// ============================================================================
interface SalariesSectorViewProps {
  ownerId: string;
  activeRole: StaffRole;
  staffMembers: StaffMember[];
  onSwitchRole?: (role: StaffRole, workerName?: string) => void;
}

export const SalariesSectorView: React.FC<SalariesSectorViewProps> = ({
  ownerId,
  activeRole,
  staffMembers,
  onSwitchRole,
}) => {
  const isExecutiveDirector = activeRole === 'executive_director';
  const isCfo = activeRole === 'cfo';

  // Local state for editing a worker's salary figure (strictly Executive Director only)
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [draftSalaryAmount, setDraftSalaryAmount] = useState<number>(0);
  const [busyWorkerId, setBusyWorkerId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<boolean>(false);
  const [payrollNotice, setPayrollNotice] = useState<string | null>(null);
  const [payrollError, setPayrollError] = useState<string | null>(null);

  const combinedPayrollRoster = useMemo(() => {
    const items: {
      id: string;
      isFirestoreDoc: boolean;
      fullName: string;
      employeeCode: string;
      role: StaffRole;
      department: StaffDepartment;
      phone: string;
      pin: string;
      status: 'active' | 'suspended';
      monthlySalaryUGX: number;
      salaryStatus: SalaryApprovalStatus;
      paymentRef: string;
    }[] = [];

    const seenKeys = new Set<string>();

    staffMembers.forEach((m) => {
      const key = `${m.fullName.trim().toLowerCase()}_${m.role}`;
      seenKeys.add(key);
      const salInfo = resolveWorkerSalaryInfo(m);
      items.push({
        id: m.id,
        isFirestoreDoc: true,
        fullName: m.fullName,
        employeeCode: m.employeeCode,
        role: m.role,
        department: m.department,
        phone: m.phone,
        pin: resolveWorkerPin(m),
        status: m.status,
        monthlySalaryUGX: salInfo.monthlySalaryUGX,
        salaryStatus: salInfo.salaryStatus,
        paymentRef: salInfo.paymentRef,
      });
    });

    DEFAULT_CORPORATE_WORKERS.forEach((def) => {
      const key = `${def.fullName.trim().toLowerCase()}_${def.role}`;
      const alreadyByCode = staffMembers.some(
        (m) => m.employeeCode.toLowerCase() === def.employeeCode.toLowerCase()
      );
      if (!seenKeys.has(key) && !alreadyByCode) {
        items.push({
          id: `default_${def.employeeCode}`,
          isFirestoreDoc: false,
          fullName: def.fullName,
          employeeCode: def.employeeCode,
          role: def.role,
          department: def.department,
          phone: def.phone,
          pin: def.pin,
          status: 'active',
          monthlySalaryUGX: def.defaultMonthlySalaryUGX,
          salaryStatus:
            def.role === 'executive_director' ||
            def.role === 'coo' ||
            def.role === 'cfo' ||
            def.role === 'manager'
              ? 'approved_by_ed'
              : 'pending_approval',
          paymentRef: '',
        });
      }
    });

    return items;
  }, [staffMembers]);

  const payrollSummary = useMemo(() => {
    const totalMonthlyPayrollUGX = combinedPayrollRoster.reduce(
      (sum, w) => sum + w.monthlySalaryUGX,
      0
    );
    const pendingList = combinedPayrollRoster.filter(
      (w) => w.salaryStatus === 'pending_approval'
    );
    const approvedList = combinedPayrollRoster.filter(
      (w) => w.salaryStatus === 'approved_by_ed'
    );
    const paidList = combinedPayrollRoster.filter(
      (w) => w.salaryStatus === 'paid_by_cfo'
    );

    return {
      totalMonthlyPayrollUGX,
      pendingCount: pendingList.length,
      pendingTotalUGX: pendingList.reduce((s, w) => s + w.monthlySalaryUGX, 0),
      approvedCount: approvedList.length,
      approvedTotalUGX: approvedList.reduce((s, w) => s + w.monthlySalaryUGX, 0),
      paidCount: paidList.length,
      paidTotalUGX: paidList.reduce((s, w) => s + w.monthlySalaryUGX, 0),
    };
  }, [combinedPayrollRoster]);

  // 1. Executive Director edits salary figure
  const handleSaveSalaryFigure = async (
    worker: (typeof combinedPayrollRoster)[number]
  ) => {
    if (!isExecutiveDirector) {
      setPayrollError('Salary figures can only be edited by the Executive Director.');
      return;
    }
    const cleanAmount = Math.max(100000, Math.round(Number(draftSalaryAmount) || 0));
    setBusyWorkerId(worker.id);
    setPayrollError(null);
    setPayrollNotice(null);
    try {
      await upsertWorkerSalaryAndPayrollState(ownerId, worker, {
        salaryUGX: cleanAmount,
        salaryStatus: worker.salaryStatus,
        paymentRef: worker.paymentRef,
      });
      setEditingWorkerId(null);
      setPayrollNotice(
        `Executive Director updated ${worker.fullName}'s monthly salary figure to ${formatCurrency(
          cleanAmount,
          'UGX'
        )}.`
      );
    } catch (err) {
      setPayrollError(
        err instanceof Error ? err.message : 'Failed to update salary figure.'
      );
    } finally {
      setBusyWorkerId(null);
    }
  };

  // 2. Executive Director approves salary for CFO payment
  const handleExecutiveApproveSalary = async (
    worker: (typeof combinedPayrollRoster)[number]
  ) => {
    if (!isExecutiveDirector) {
      setPayrollError('Only the Executive Director can approve staff salaries.');
      return;
    }
    setBusyWorkerId(worker.id);
    setPayrollError(null);
    setPayrollNotice(null);
    try {
      await upsertWorkerSalaryAndPayrollState(ownerId, worker, {
        salaryUGX: worker.monthlySalaryUGX,
        salaryStatus: 'approved_by_ed',
        paymentRef: '',
      });
      setPayrollNotice(
        `Executive Director approved ${worker.fullName}'s salary (${formatCurrency(
          worker.monthlySalaryUGX,
          'UGX'
        )}). Ready for C.F.O. payment.`
      );
    } catch (err) {
      setPayrollError(
        err instanceof Error ? err.message : 'Failed to approve worker salary.'
      );
    } finally {
      setBusyWorkerId(null);
    }
  };

  // 3. C.F.O. pays an Executive-Director-approved salary
  const handleCfoPaySalary = async (
    worker: (typeof combinedPayrollRoster)[number]
  ) => {
    if (!isCfo) {
      setPayrollError('Salaries are paid exclusively by the Chief Financial Officer (C.F.O.).');
      return;
    }
    if (worker.salaryStatus !== 'approved_by_ed') {
      setPayrollError(
        'This salary must first be approved by the Executive Director before the C.F.O. can pay it.'
      );
      return;
    }
    setBusyWorkerId(worker.id);
    setPayrollError(null);
    setPayrollNotice(null);
    try {
      const refCode = `CFO-PAY-${getTodayISO().slice(5, 10)}-${Math.floor(
        100 + Math.random() * 899
      )}`;
      await upsertWorkerSalaryAndPayrollState(ownerId, worker, {
        salaryUGX: worker.monthlySalaryUGX,
        salaryStatus: 'paid_by_cfo',
        paymentRef: refCode,
      });
      setPayrollNotice(
        `C.F.O. disbursed salary of ${formatCurrency(
          worker.monthlySalaryUGX,
          'UGX'
        )} to ${worker.fullName} (Ref: ${refCode}).`
      );
    } catch (err) {
      setPayrollError(
        err instanceof Error ? err.message : 'Failed to disburse salary payment.'
      );
    } finally {
      setBusyWorkerId(null);
    }
  };

  // Bulk Approve All Pending (Executive Director)
  const handleBulkApproveAll = async () => {
    if (!isExecutiveDirector || bulkBusy) return;
    const pendingWorkers = combinedPayrollRoster.filter(
      (w) => w.salaryStatus === 'pending_approval'
    );
    if (pendingWorkers.length === 0) return;
    setBulkBusy(true);
    setPayrollError(null);
    setPayrollNotice(null);
    try {
      for (const w of pendingWorkers) {
        await upsertWorkerSalaryAndPayrollState(ownerId, w, {
          salaryUGX: w.monthlySalaryUGX,
          salaryStatus: 'approved_by_ed',
          paymentRef: '',
        });
      }
      setPayrollNotice(
        `Executive Director approved all ${pendingWorkers.length} pending staff salaries for C.F.O. disbursement.`
      );
    } catch (err) {
      setPayrollError(
        err instanceof Error ? err.message : 'Failed to bulk approve salaries.'
      );
    } finally {
      setBulkBusy(false);
    }
  };

  // Bulk Pay All Approved (C.F.O.)
  const handleBulkPayAllApproved = async () => {
    if (!isCfo || bulkBusy) return;
    const approvedWorkers = combinedPayrollRoster.filter(
      (w) => w.salaryStatus === 'approved_by_ed'
    );
    if (approvedWorkers.length === 0) return;
    setBulkBusy(true);
    setPayrollError(null);
    setPayrollNotice(null);
    try {
      for (const w of approvedWorkers) {
        const refCode = `CFO-PAY-${getTodayISO().slice(5, 10)}-${Math.floor(
          100 + Math.random() * 899
        )}`;
        await upsertWorkerSalaryAndPayrollState(ownerId, w, {
          salaryUGX: w.monthlySalaryUGX,
          salaryStatus: 'paid_by_cfo',
          paymentRef: refCode,
        });
      }
      setPayrollNotice(
        `C.F.O. successfully paid all ${approvedWorkers.length} Executive-Director-approved staff salaries.`
      );
    } catch (err) {
      setPayrollError(
        err instanceof Error ? err.message : 'Failed to bulk pay approved salaries.'
      );
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Salaries Sector Header Banner */}
      <div className="bg-slate-950 text-white border border-amber-500/40 rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 shadow-sm">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold text-amber-400">
            <Banknote className="w-4 h-4" />
            <span>
              Pristen Investments Ltd — Corporate Salaries &amp; Payroll Sector
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-display">
            Staff Salaries Ledger, Executive Approval &amp; C.F.O. Payroll Disbursement
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
            Governance Policy: <strong className="text-amber-300">Salary figures are edited strictly by the Executive Director</strong>. Salaries are <strong className="text-amber-300">approved by the Executive Director</strong> and <strong className="text-emerald-300">paid by the C.F.O.</strong> Accessible on the Executive Director, C.O.O., Manager, and Finance pages.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {isExecutiveDirector && payrollSummary.pendingCount > 0 && (
            <button
              type="button"
              disabled={bulkBusy}
              onClick={handleBulkApproveAll}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-slate-950 bg-amber-400 rounded-xl hover:bg-amber-300 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              {bulkBusy
                ? 'Approving Salaries...'
                : `Approve All Pending Salaries (${payrollSummary.pendingCount})`}
            </button>
          )}

          {isCfo && payrollSummary.approvedCount > 0 && (
            <button
              type="button"
              disabled={bulkBusy}
              onClick={handleBulkPayAllApproved}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-500 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Banknote className="w-4 h-4" />
              {bulkBusy
                ? 'Paying Approved Salaries...'
                : `Pay All Approved Salaries (${payrollSummary.approvedCount})`}
            </button>
          )}

          {onSwitchRole && (
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-xl p-1">
              <button
                type="button"
                onClick={() => onSwitchRole('executive_director')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  isExecutiveDirector
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                Exec. Director (Edit &amp; Approve)
              </button>
              <button
                type="button"
                onClick={() => onSwitchRole('cfo')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  isCfo
                    ? 'bg-emerald-500 text-white'
                    : 'text-slate-200 hover:bg-white/10'
                }`}
              >
                C.F.O. (Pay Salaries)
              </button>
            </div>
          )}
        </div>
      </div>

      {payrollNotice && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3.5 flex items-center justify-between gap-4 text-xs text-emerald-950">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{payrollNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setPayrollNotice(null)}
            className="px-2.5 py-1 font-semibold text-emerald-800 bg-white border border-emerald-200 rounded-md hover:bg-emerald-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {payrollError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3.5 flex items-center justify-between gap-4 text-xs text-red-900">
          <span>{payrollError}</span>
          <button
            type="button"
            onClick={() => setPayrollError(null)}
            className="px-2.5 py-1 font-semibold text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 4-Column Payroll KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-blue-100 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Total Monthly Payroll</span>
            <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-blue-700 mt-2">
            {formatCurrency(payrollSummary.totalMonthlyPayrollUGX, 'UGX')}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono">
            {combinedPayrollRoster.length} Corporate Staff &amp; Workers
          </div>
        </div>

        <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Awaiting Exec. Director Approval</span>
            <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-2">
            {formatCurrency(payrollSummary.pendingTotalUGX, 'UGX')}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono">
            {payrollSummary.pendingCount} Worker{payrollSummary.pendingCount === 1 ? '' : 's'} Pending ED Approval
          </div>
        </div>

        <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Approved by ED (Ready for CFO)</span>
            <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            {formatCurrency(payrollSummary.approvedTotalUGX, 'UGX')}
          </div>
          <div className="text-xs text-blue-700 font-semibold mt-1 font-mono">
            {payrollSummary.approvedCount} Approved for C.F.O. Payout
          </div>
        </div>

        <div className="bg-white border border-emerald-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Salaries Paid by C.F.O.</span>
            <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-2">
            {formatCurrency(payrollSummary.paidTotalUGX, 'UGX')}
          </div>
          <div className="text-xs text-emerald-700 font-semibold mt-1 font-mono">
            {payrollSummary.paidCount} Worker{payrollSummary.paidCount === 1 ? '' : 's'} Paid This Cycle
          </div>
        </div>
      </div>

      {/* Salaries & Payroll Table */}
      <div className="bg-white border border-blue-100 rounded-xl overflow-hidden shadow-2xs">
        <div className="px-6 py-4 border-b border-blue-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Corporate Salaries Schedule &amp; Disbursement Ledger ({combinedPayrollRoster.length} Workers)
            </h3>
            <p className="text-xs text-slate-500">
              {isExecutiveDirector
                ? 'Executive Director Authority Active: You can edit any worker’s salary figure and approve salaries for C.F.O. payment.'
                : isCfo
                ? 'C.F.O. Authority Active: Salary figures are locked (edited by Executive Director only). You can pay all salaries approved by the Executive Director.'
                : `${STAFF_ROLE_METADATA[activeRole].shortTitle} View: Monitoring staff salaries. Salary figures are edited by the Executive Director; approved by the Executive Director and paid by the C.F.O.`}
            </p>
          </div>
          <div className="text-xs font-mono text-slate-500">
            Active Desk:{' '}
            <strong className="text-blue-800">
              {STAFF_ROLE_METADATA[activeRole].shortTitle}
            </strong>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-blue-50/70 border-b border-blue-100 text-xs font-semibold text-blue-950">
              <tr>
                <th className="py-3 px-5">Worker Name &amp; ID</th>
                <th className="py-3 px-4">Role &amp; Department</th>
                <th className="py-3 px-4 text-right">
                  Monthly Salary Figure (UGX)
                </th>
                <th className="py-3 px-4">Approval &amp; Payment Status</th>
                <th className="py-3 px-5 text-right">
                  Executive Approval / C.F.O. Payment Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {combinedPayrollRoster.map((worker) => {
                const meta = STAFF_ROLE_METADATA[worker.role];
                const isEditingThis = editingWorkerId === worker.id;
                const isBusyThis = busyWorkerId === worker.id;

                return (
                  <tr key={worker.id} className="hover:bg-blue-50/30">
                    <td className="py-3.5 px-5">
                      <div className="font-semibold text-slate-900">
                        {worker.fullName}
                      </div>
                      <div className="text-xs font-mono text-blue-700">
                        {worker.employeeCode} · {worker.phone}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 text-xs">
                        {meta.label}
                      </div>
                      <div className="text-xs text-orange-600 font-medium">
                        {worker.department}
                      </div>
                    </td>

                    {/* Monthly Salary Figure — Editable ONLY by Executive Director */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      {isExecutiveDirector && isEditingThis ? (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <input
                            type="number"
                            min={100000}
                            step={100000}
                            value={draftSalaryAmount}
                            onChange={(e) =>
                              setDraftSalaryAmount(Number(e.target.value))
                            }
                            className="w-36 px-2.5 py-1 text-xs font-mono font-bold text-right bg-white border border-blue-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                          <button
                            type="button"
                            disabled={isBusyThis}
                            onClick={() => handleSaveSalaryFigure(worker)}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingWorkerId(null)}
                            className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex flex-col items-end">
                          <div className="inline-flex items-center gap-2">
                            <span className="font-mono tabular-nums font-bold text-slate-900">
                              {formatCurrency(worker.monthlySalaryUGX, 'UGX')}
                            </span>
                            {isExecutiveDirector && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingWorkerId(worker.id);
                                  setDraftSalaryAmount(worker.monthlySalaryUGX);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Edit Figure</span>
                              </button>
                            )}
                          </div>
                          {!isExecutiveDirector && (
                            <span className="text-[11px] font-mono text-slate-400 inline-flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" />
                              Edited by Exec. Director Only
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Status Column */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {worker.salaryStatus === 'paid_by_cfo' ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Paid by C.F.O.
                          </span>
                          <div className="text-[11px] font-mono text-slate-500">
                            Approved by ED · {worker.paymentRef || 'Disbursed'}
                          </div>
                        </div>
                      ) : worker.salaryStatus === 'approved_by_ed' ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Approved by Executive Director
                          </span>
                          <div className="text-[11px] font-mono text-slate-500">
                            Ready for C.F.O. Payment
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                            <Clock className="w-3.5 h-3.5" />
                            Pending Exec. Director Approval
                          </span>
                          <div className="text-[11px] font-mono text-slate-500">
                            Requires ED approval before CFO payment
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Action Column */}
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      {isExecutiveDirector ? (
                        worker.salaryStatus === 'pending_approval' ? (
                          <button
                            type="button"
                            disabled={isBusyThis}
                            onClick={() => handleExecutiveApproveSalary(worker)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 rounded-lg hover:bg-amber-300 disabled:opacity-50 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {isBusyThis
                              ? 'Approving...'
                              : 'Approve Salary (Exec. Director)'}
                          </button>
                        ) : worker.salaryStatus === 'approved_by_ed' ? (
                          <span className="text-xs font-mono font-semibold text-blue-700">
                            Approved · Awaiting CFO Payment
                          </span>
                        ) : (
                          <span className="text-xs font-mono font-semibold text-emerald-700">
                            Disbursed by CFO ({worker.paymentRef})
                          </span>
                        )
                      ) : isCfo ? (
                        worker.salaryStatus === 'approved_by_ed' ? (
                          <button
                            type="button"
                            disabled={isBusyThis}
                            onClick={() => handleCfoPaySalary(worker)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                          >
                            <Banknote className="w-3.5 h-3.5" />
                            {isBusyThis ? 'Paying...' : 'Pay Salary (C.F.O.)'}
                          </button>
                        ) : worker.salaryStatus === 'pending_approval' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-mono text-amber-700">
                            <Lock className="w-3 h-3" />
                            Awaiting Exec. Director Approval
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Salary Paid ({worker.paymentRef})
                          </span>
                        )
                      ) : (
                        <span className="text-xs font-mono text-slate-500">
                          {worker.salaryStatus === 'paid_by_cfo'
                            ? `Paid by CFO (${worker.paymentRef})`
                            : worker.salaryStatus === 'approved_by_ed'
                            ? 'Approved by ED · Pending CFO'
                            : 'Awaiting ED Approval'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. FINANCE DEPARTMENT VIEW (HEADED BY C.F.O. — LOAN PAYOUT APPROVALS + TREASURY + SALARIES)
// ============================================================================
interface FinanceDepartmentViewProps {
  ownerId: string;
  activeRole: StaffRole;
  signedInWorkerName: string;
  loans: Loan[];
  installmentsByLoan: Record<string, Installment[]>;
  staffMembers: StaffMember[];
  onSelectLoanForSchedule: (loanId: string) => void;
  onOpenCalculator: () => void;
  onSwitchRole?: (role: StaffRole, workerName?: string) => void;
}

export const FinanceDepartmentView: React.FC<FinanceDepartmentViewProps> = ({
  ownerId,
  activeRole,
  signedInWorkerName,
  loans,
  installmentsByLoan,
  staffMembers,
  onSelectLoanForSchedule,
  onOpenCalculator,
  onSwitchRole,
}) => {
  const [approvingLoanId, setApprovingLoanId] = useState<string | null>(null);
  const [channelOverrides, setChannelOverrides] = useState<Record<string, string>>({});
  const [payoutNotice, setPayoutNotice] = useState<string | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);

  const cfoOfficer = useMemo(
    () => staffMembers.find((s) => s.role === 'cfo'),
    [staffMembers]
  );

  const pendingTellerLoans = useMemo(
    () =>
      loans.filter(
        (l) => parseLoanDisbursementState(l).payoutStatus === 'pending_finance_payout'
      ),
    [loans]
  );

  const handleApproveAndSendMoney = async (loan: Loan) => {
    setApprovingLoanId(loan.id);
    setPayoutError(null);
    setPayoutNotice(null);
    try {
      const parsed = parseLoanDisbursementState(loan);
      const selectedChannel = channelOverrides[loan.id] || parsed.channel;
      await approveAndSendLoanToClient(loan, signedInWorkerName, selectedChannel);
      setPayoutNotice(
        `Finance Department Approved & Sent Money: ${formatCurrency(
          loan.principalAmount,
          loan.currency
        )} has been sent to client ${loan.borrowerName} (${loan.borrowerPhone}) via ${selectedChannel}.`
      );
    } catch (err) {
      setPayoutError(
        err instanceof Error
          ? err.message
          : 'Failed to approve and send loan money to client.'
      );
    } finally {
      setApprovingLoanId(null);
    }
  };

  const treasuryMetrics = useMemo(() => {
    const ugxLoans = loans.filter((l) => l.currency === 'UGX');
    const totalPrincipalDisbursed = ugxLoans.reduce(
      (sum, l) => sum + l.principalAmount,
      0
    );
    const totalProjectedInterest = ugxLoans.reduce(
      (sum, l) => sum + l.totalInterestProjected,
      0
    );
    const totalContractualPayable = ugxLoans.reduce(
      (sum, l) => sum + l.totalPayable,
      0
    );
    const totalCashCollected = ugxLoans.reduce(
      (sum, l) => sum + l.amountPaid,
      0
    );
    const totalOutstandingReceivable = ugxLoans.reduce(
      (sum, l) => sum + l.outstandingBalance,
      0
    );

    let realizedInterestUGX = 0;
    let realizedPrincipalUGX = 0;
    let overdueBalanceUGX = 0;

    ugxLoans.forEach((loan) => {
      const insts = installmentsByLoan[loan.id] || [];
      let loanHasOverdue = loan.status === 'overdue';
      insts.forEach((inst) => {
        if (inst.amountPaid > 0 && inst.scheduledAmount > 0) {
          const ratio = Math.min(1, inst.amountPaid / inst.scheduledAmount);
          realizedInterestUGX += Math.round(inst.interestComponent * ratio);
          realizedPrincipalUGX += Math.round(inst.principalComponent * ratio);
        }
        if (inst.status === 'overdue') {
          loanHasOverdue = true;
        }
      });
      if (loanHasOverdue) {
        overdueBalanceUGX += loan.outstandingBalance;
      }
    });

    if (realizedInterestUGX === 0 && totalCashCollected > 0 && totalContractualPayable > 0) {
      const interestShare = totalProjectedInterest / totalContractualPayable;
      realizedInterestUGX = Math.round(totalCashCollected * interestShare);
      realizedPrincipalUGX = totalCashCollected - realizedInterestUGX;
    }

    const performingBalance = Math.max(
      0,
      totalOutstandingReceivable - overdueBalanceUGX
    );
    const provisioningReserveUGX = Math.round(
      performingBalance * 0.02 + overdueBalanceUGX * 0.25
    );

    return {
      totalPrincipalDisbursed,
      totalProjectedInterest,
      totalContractualPayable,
      totalCashCollected,
      totalOutstandingReceivable,
      realizedInterestUGX,
      realizedPrincipalUGX,
      overdueBalanceUGX,
      provisioningReserveUGX,
    };
  }, [loans, installmentsByLoan]);

  return (
    <div className="space-y-8">
      {/* CFO & Finance Department Authority Header */}
      <div className="bg-slate-950 text-white border border-amber-500/30 rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 shadow-sm">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold text-amber-400">
            <Landmark className="w-4 h-4" />
            <span>Finance Department — Headed by the Chief Financial Officer (C.F.O.)</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-display">
            Client Loan Payout Approvals, C.F.O. Payroll &amp; 12% Monthly Yield Ledger
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
            Department Head:{' '}
            <span className="font-semibold text-amber-300">
              {cfoOfficer
                ? `${cfoOfficer.fullName} (${cfoOfficer.employeeCode})`
                : 'CPA Ronald Mugisha — Chief Financial Officer (C.F.O.)'}
            </span>{' '}
            · Responsible for <strong className="text-white">approving and sending Teller-initiated loan money to clients</strong>, <strong className="text-white">paying staff salaries approved by the Executive Director</strong>, and reconciling the 12% monthly interest ledger.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenCalculator}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-slate-950 bg-amber-400 rounded-xl hover:bg-amber-300 transition-colors cursor-pointer"
          >
            <Calculator className="w-3.5 h-3.5" />
            12% Monthly Interest Simulator
          </button>
        </div>
      </div>

      {/* FINANCE DEPARTMENT QUEUE: APPROVE & SEND TELLER-DISBURSED LOANS TO CLIENTS */}
      <div className="bg-white border border-orange-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="px-6 py-4 bg-orange-50/50 border-b border-orange-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-orange-700">
              <Send className="w-3.5 h-3.5" />
              <span>
                FINANCE DISBURSEMENT CONTROL — APPROVE &amp; SEND MONEY TO CLIENTS
              </span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 mt-0.5">
              Teller-Initiated Loans Awaiting Finance Approval &amp; Client Transfer ({pendingTellerLoans.length})
            </h3>
            <p className="text-xs text-slate-600">
              After Tellers submit a loan disbursement at the counter, the Finance Department approves and sends the funds to the client here.
            </p>
          </div>
          <span className="text-xs font-mono font-semibold text-orange-700 shrink-0">
            {pendingTellerLoans.length} Pending Client Payout{pendingTellerLoans.length === 1 ? '' : 's'}
          </span>
        </div>

        {payoutNotice && (
          <div className="m-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-4 text-xs text-emerald-950">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{payoutNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setPayoutNotice(null)}
              className="px-2.5 py-1 font-semibold text-emerald-800 bg-white border border-emerald-200 rounded-md"
            >
              Dismiss
            </button>
          </div>
        )}

        {payoutError && (
          <div className="m-4 p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 font-mono">
            {payoutError}
          </div>
        )}

        {pendingTellerLoans.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-600">
            All Teller-initiated loan requests have been approved and the money has been sent to the clients.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-800">
                <tr>
                  <th className="py-3 px-5">Loan Reference &amp; Client</th>
                  <th className="py-3 px-4">Teller Initiation &amp; Purpose</th>
                  <th className="py-3 px-4 text-right">Amount to Send</th>
                  <th className="py-3 px-4">Transfer Channel</th>
                  <th className="py-3 px-5 text-right">Finance Department Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {pendingTellerLoans.map((loan) => {
                  const parsed = parseLoanDisbursementState(loan);
                  const currentChannel =
                    channelOverrides[loan.id] || parsed.channel;
                  const isApproving = approvingLoanId === loan.id;

                  return (
                    <tr key={loan.id} className="hover:bg-orange-50/20">
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-900">
                          {loan.borrowerName}
                        </div>
                        <div className="text-xs font-mono text-blue-700">
                          {loan.loanReference} · {loan.borrowerPhone}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="text-xs font-mono font-semibold text-amber-800">
                          {parsed.metaSummary}
                        </div>
                        <div className="text-xs text-slate-600 truncate">
                          {parsed.cleanPurpose}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-orange-600 whitespace-nowrap">
                        {formatCurrency(loan.principalAmount, loan.currency)}
                      </td>
                      <td className="py-3.5 px-4">
                        <select
                          value={currentChannel}
                          onChange={(e) =>
                            setChannelOverrides((prev) => ({
                              ...prev,
                              [loan.id]: e.target.value,
                            }))
                          }
                          className="px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
                        >
                          <option value="MTN MoMo Corporate">
                            MTN MoMo Corporate
                          </option>
                          <option value="Stanbic Bank RTGS">
                            Stanbic Bank RTGS
                          </option>
                          <option value="Airtel Money">Airtel Money</option>
                          <option value="Cash Counter">Cash Counter</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={isApproving}
                          onClick={() => handleApproveAndSendMoney(loan)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {isApproving
                            ? 'Sending Money...'
                            : 'Approve & Send Money to Client'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4-Column CFO Treasury & Yield KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-blue-100 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Treasury Capital Disbursed</span>
            <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-blue-700 mt-2">
            {formatCurrency(treasuryMetrics.totalPrincipalDisbursed, 'UGX')}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono">
            Principal Recovered:{' '}
            <span className="text-slate-800 font-semibold">
              {formatCurrency(treasuryMetrics.realizedPrincipalUGX, 'UGX')}
            </span>
          </div>
        </div>

        <div className="bg-white border border-orange-100 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Projected 12% Monthly Yield</span>
            <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-orange-600 mt-2">
            {formatCurrency(treasuryMetrics.totalProjectedInterest, 'UGX')}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono">
            Realized Interest:{' '}
            <span className="text-emerald-700 font-semibold">
              {formatCurrency(treasuryMetrics.realizedInterestUGX, 'UGX')}
            </span>
          </div>
        </div>

        <div className="bg-white border border-blue-100 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Total Cash Inflows Reconciled</span>
            <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-2">
            {formatCurrency(treasuryMetrics.totalCashCollected, 'UGX')}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono">
            Net Receivable:{' '}
            <span className="text-slate-900 font-semibold">
              {formatCurrency(treasuryMetrics.totalOutstandingReceivable, 'UGX')}
            </span>
          </div>
        </div>

        <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>CFO Provisioning Reserve (PAR)</span>
            <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            {formatCurrency(treasuryMetrics.provisioningReserveUGX, 'UGX')}
          </div>
          <div className="text-xs text-red-600 mt-1 font-mono">
            Overdue Exposure: {formatCurrency(treasuryMetrics.overdueBalanceUGX, 'UGX')}
          </div>
        </div>
      </div>

      {/* CFO Facility-Level Revenue & Amortization Audit Table */}
      <div className="bg-white border border-blue-100 rounded-xl overflow-hidden shadow-2xs">
        <div className="px-6 py-4 border-b border-blue-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              CFO General Ledger — Principal vs. 12% Monthly Interest &amp; Client Payout Status ({loans.length})
            </h3>
            <p className="text-xs text-slate-500">
              Click any facility to reconcile installment repayments and inspect financial schedules
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-blue-50/70 border-b border-blue-100 text-xs font-semibold text-blue-950">
              <tr>
                <th className="py-3 px-5">Facility Reference &amp; Client</th>
                <th className="py-3 px-4 text-right">Principal Outflow</th>
                <th className="py-3 px-4 text-right">Projected Interest (12%/Mo)</th>
                <th className="py-3 px-4 text-right">Cash Collected</th>
                <th className="py-3 px-4 text-right">Net Balance</th>
                <th className="py-3 px-4">Finance Client Payout Status</th>
                <th className="py-3 px-5 text-right">Financial Schedule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loans.map((loan) => {
                const payout = parseLoanDisbursementState(loan);
                return (
                  <tr
                    key={loan.id}
                    onClick={() => onSelectLoanForSchedule(loan.id)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-5">
                      <div className="font-semibold text-slate-900">
                        {loan.borrowerName}
                      </div>
                      <div className="text-xs font-mono text-blue-700">
                        {loan.loanReference} · {loan.annualInterestRate}%/mo · {loan.termMonths}m
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-blue-700 font-medium">
                      {formatCurrency(loan.principalAmount, loan.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-orange-600 font-medium">
                      {formatCurrency(loan.totalInterestProjected, loan.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                      {formatCurrency(loan.amountPaid, loan.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-900 font-bold">
                      {formatCurrency(loan.outstandingBalance, loan.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      {payout.payoutStatus === 'pending_finance_payout' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                          <Clock className="w-3.5 h-3.5" />
                          Pending Finance Approval
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Sent to Client ({payout.channel})
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <span className="text-xs font-semibold text-blue-700 underline">
                        Reconcile Ledger →
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Embedded Salaries Sector on the Finance Department Page */}
      <SalariesSectorView
        ownerId={ownerId}
        activeRole={activeRole}
        staffMembers={staffMembers}
        onSwitchRole={onSwitchRole}
      />
    </div>
  );
};

// ============================================================================
// 2B. EXECUTIVE DIRECTOR & C.O.O. DESK — MASTER WORKER 4-DIGIT PASSWORD VAULT
// ============================================================================
interface ExecutiveCooPasswordVaultProps {
  activeRole: StaffRole;
  staffMembers: StaffMember[];
  onSwitchRole: (role: StaffRole, workerName?: string) => void;
  onOpenNewStaffModal?: (defaultRole?: StaffRole) => void;
}

export const ExecutiveCooPasswordVault: React.FC<
  ExecutiveCooPasswordVaultProps
> = ({ activeRole, staffMembers, onSwitchRole, onOpenNewStaffModal }) => {
  // Strictly restricted to Executive Director and C.O.O. desks
  if (activeRole !== 'executive_director' && activeRole !== 'coo') {
    return null;
  }

  const combinedDirectory = useMemo(() => {
    const items: {
      id: string;
      isFirestoreDoc: boolean;
      fullName: string;
      employeeCode: string;
      role: StaffRole;
      department: string;
      phone: string;
      pin: string;
      status: 'active' | 'suspended';
    }[] = [];

    const seenKeys = new Set<string>();

    staffMembers.forEach((m) => {
      const key = `${m.fullName.trim().toLowerCase()}_${m.role}`;
      seenKeys.add(key);
      items.push({
        id: m.id,
        isFirestoreDoc: true,
        fullName: m.fullName,
        employeeCode: m.employeeCode,
        role: m.role,
        department: m.department,
        phone: m.phone,
        pin: resolveWorkerPin(m),
        status: m.status,
      });
    });

    DEFAULT_CORPORATE_WORKERS.forEach((def) => {
      const key = `${def.fullName.trim().toLowerCase()}_${def.role}`;
      const alreadyByCode = staffMembers.some(
        (m) => m.employeeCode.toLowerCase() === def.employeeCode.toLowerCase()
      );
      if (!seenKeys.has(key) && !alreadyByCode) {
        items.push({
          id: `default_${def.employeeCode}`,
          isFirestoreDoc: false,
          fullName: def.fullName,
          employeeCode: def.employeeCode,
          role: def.role,
          department: def.department,
          phone: def.phone,
          pin: def.pin,
          status: 'active',
        });
      }
    });

    return items;
  }, [staffMembers]);

  const handleRotatePin = async (staffId: string) => {
    const existingPins = combinedDirectory.map((w) => w.pin);
    const nextPin = generateAnonymousFourDigitPin(existingPins);
    const existingMember = staffMembers.find((m) => m.id === staffId);
    await updateStaffMemberPin(staffId, nextPin, existingMember);
  };

  return (
    <div className="bg-slate-950 text-white border border-amber-500/40 rounded-2xl overflow-hidden shadow-md">
      <div className="px-6 py-5 border-b border-white/10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
            <KeyRound className="w-4 h-4" />
            <span>
              {activeRole === 'executive_director'
                ? 'Executive Director Desk — Master Worker 4-Digit Password Register'
                : 'C.O.O. Operations Desk — Master Worker 4-Digit Password Register'}
            </span>
          </div>
          <h3 className="text-base sm:text-lg font-bold text-white font-display">
            All Workers’ Anonymous Four-Digit Login Passwords ({combinedDirectory.length} Workers)
          </h3>
          <p className="text-xs text-slate-300">
            Confidential Executive &amp; C.O.O. Credential Vault: Every worker is assigned a distinct, anonymous 4-digit password. These passwords are displayed exclusively on the <strong className="text-amber-300">Executive Director Desk</strong> and the <strong className="text-amber-300">C.O.O. Desk</strong>.
          </p>
        </div>

        {onOpenNewStaffModal && (
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenNewStaffModal('teller')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 rounded-xl hover:bg-amber-300 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Issue New Worker 4-Digit PIN
            </button>
          </div>
        )}
      </div>

      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {combinedDirectory.map((worker) => {
          const meta = STAFF_ROLE_METADATA[worker.role];
          return (
            <div
              key={worker.id}
              className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col justify-between gap-3 hover:border-amber-400/50 transition-colors"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[11px] font-mono text-slate-400 truncate">
                    {worker.employeeCode}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-400/20 border border-amber-400/40 text-amber-300 font-mono text-xs font-bold tracking-widest">
                    PIN: {worker.pin}
                  </span>
                </div>
                <div className="text-sm font-bold text-white truncate">
                  {worker.fullName}
                </div>
                <div className="text-xs font-medium text-amber-400/90 truncate">
                  {meta.shortTitle}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {worker.department}
                </div>
              </div>

              <div className="pt-2.5 border-t border-white/10 flex items-center justify-between gap-2">
                {worker.isFirestoreDoc ? (
                  <button
                    type="button"
                    onClick={() => handleRotatePin(worker.id)}
                    title="Generate a new random 4-digit anonymous PIN for this worker"
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-300 hover:text-amber-300 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>New PIN</span>
                  </button>
                ) : (
                  <span className="text-[11px] font-mono text-emerald-400">
                    Active PIN
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => onSwitchRole(worker.role, worker.fullName)}
                  className="text-[11px] font-semibold text-amber-300 hover:text-amber-200 underline cursor-pointer"
                >
                  Open Desk →
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// 3. HUMAN RESOURCE (H.R.) — STAFF & WORKER MANAGEMENT VIEW
// ============================================================================
interface StaffGovernanceViewProps {
  ownerId: string;
  staffMembers: StaffMember[];
  activeRole: StaffRole;
  onSwitchRole: (role: StaffRole, workerName?: string) => void;
  onOpenNewStaffModal: (defaultRole?: StaffRole) => void;
}

export const StaffGovernanceView: React.FC<StaffGovernanceViewProps> = ({
  ownerId,
  staffMembers,
  activeRole,
  onSwitchRole,
  onOpenNewStaffModal,
}) => {
  const [seedingStaff, setSeedingStaff] = useState<boolean>(false);
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');

  const canViewWorkerPasswords =
    activeRole === 'executive_director' || activeRole === 'coo';

  const handleSeedStaff = async () => {
    if (seedingStaff) return;
    setSeedingStaff(true);
    try {
      await seedCorporateStaffRoster(ownerId);
    } finally {
      setSeedingStaff(false);
    }
  };

  const handleToggleStatus = async (member: StaffMember) => {
    const nextStatus = member.status === 'active' ? 'suspended' : 'active';
    await updateStaffMemberStatus(member.id, nextStatus);
  };

  const handleRotateMemberPin = async (member: StaffMember) => {
    const existingPins = staffMembers.map((m) => resolveWorkerPin(m));
    const nextPin = generateAnonymousFourDigitPin(existingPins);
    await updateStaffMemberPin(member.id, nextPin, member);
  };

  const roleCards: {
    role: StaffRole;
    badge: string;
    accessScope: string;
    highlightColor: string;
  }[] = [
    {
      role: 'hr',
      badge: 'Human Resource (H.R.) Duty',
      accessScope:
        'Manages all company staff, worker onboarding, role assignments, anonymous 4-digit PIN generation, and active/suspended status.',
      highlightColor: 'border-blue-300 bg-blue-50/40',
    },
    {
      role: 'executive_director',
      badge: 'Executive Directorate (Displays All PINs)',
      accessScope:
        'Unrestricted Executive Authority: Displays all workers’ anonymous 4-digit passwords on desk, plus full Portfolio, Finance & HR access.',
      highlightColor: 'border-amber-300 bg-amber-50/30',
    },
    {
      role: 'coo',
      badge: 'Operations Directorate — C.O.O. (Displays All PINs)',
      accessScope:
        'Chief Operating Officer: Displays all workers’ anonymous 4-digit passwords on desk, plus operational oversight of workflows & collections.',
      highlightColor: 'border-blue-200 bg-white',
    },
    {
      role: 'cfo',
      badge: 'Head of Finance (Strictly Financial)',
      accessScope:
        'Chief Financial Officer: Restricted strictly to the financial bit of the business (Treasury Pool, 12% Monthly Yield & Schedules).',
      highlightColor: 'border-emerald-200 bg-emerald-50/30',
    },
    {
      role: 'sales_person',
      badge: 'Sales Team (Analytics Duty)',
      accessScope:
        'Assigned to Performance Analytics, portfolio growth telemetry, borrower onboarding, and 12% monthly interest quotes.',
      highlightColor: 'border-blue-200 bg-white',
    },
    {
      role: 'teller',
      badge: 'STRICTLY RESTRICTED: Loan Disbursement Only',
      accessScope:
        'Tellers can ONLY access the Loan Disbursement Desk for giving out loans. All other tabs are locked.',
      highlightColor: 'border-orange-300 bg-orange-50/40',
    },
  ];

  const filteredStaff = useMemo(() => {
    if (departmentFilter === 'ALL') return staffMembers;
    return staffMembers.filter((s) => s.department === departmentFilter);
  }, [staffMembers, departmentFilter]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-blue-100 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-blue-700">
            <Building2 className="w-4 h-4" />
            <span>Human Resource (H.R.) Department — Staff & Worker Management</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-1">
            Worker Directory, Role Provisions &amp; Anonymous 4-Digit Passwords
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Every worker has a unique anonymous 4-digit password. All worker passwords are displayed exclusively on the{' '}
            <strong className="text-slate-900">Executive Director Desk</strong> and{' '}
            <strong className="text-slate-900">C.O.O. Desk</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {staffMembers.length === 0 && (
            <button
              type="button"
              disabled={seedingStaff}
              onClick={handleSeedStaff}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" />
              {seedingStaff
                ? 'Loading Corporate Roster...'
                : 'Load Default Staff Roster (10 Workers)'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenNewStaffModal('teller')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Register New Worker (Generate 4-Digit PIN)
          </button>
        </div>
      </div>

      {/* Executive Director & C.O.O. Master Password Vault (Shown only when Executive Director or C.O.O. is active) */}
      {canViewWorkerPasswords ? (
        <ExecutiveCooPasswordVault
          activeRole={activeRole}
          staffMembers={staffMembers}
          onSwitchRole={onSwitchRole}
          onOpenNewStaffModal={onOpenNewStaffModal}
        />
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-950">
                Anonymous 4-Digit Worker Passwords — Executive &amp; C.O.O. Eyes Only
              </div>
              <p className="text-xs text-amber-800">
                Individual 4-digit worker passwords are hidden on the {STAFF_ROLE_METADATA[activeRole].label} desk and displayed only on the Executive Director Desk and C.O.O. Desk.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onSwitchRole('executive_director')}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              Executive Director Desk
            </button>
            <button
              type="button"
              onClick={() => onSwitchRole('coo')}
              className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 cursor-pointer"
            >
              C.O.O. Desk
            </button>
          </div>
        </div>
      )}

      {/* Role Architecture & Instant Role Simulator Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            Departmental Role Provisions &amp; Access Scope (Managed by Human Resource)
          </h3>
          <span className="text-xs font-mono text-slate-500">
            Auth Mode: <strong className="text-blue-700">Unique Anonymous 4-Digit PIN per Worker</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roleCards.map((card) => {
            const meta = STAFF_ROLE_METADATA[card.role];
            const isCurrent = activeRole === card.role;
            const count = staffMembers.filter((s) => s.role === card.role).length;
            return (
              <div
                key={card.role}
                className={`rounded-xl border p-5 flex flex-col justify-between gap-4 transition-all ${
                  card.highlightColor
                } ${isCurrent ? 'ring-2 ring-blue-700' : ''}`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-semibold text-blue-800">
                      {card.badge}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 text-white">
                      {count} Staff
                    </span>
                  </div>
                  <div className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>{meta.label}</span>
                    {card.role === 'teller' && (
                      <Lock className="w-4 h-4 text-orange-600 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {card.accessScope}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-200/70 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenNewStaffModal(card.role)}
                    className="text-xs font-semibold text-slate-700 hover:text-blue-700 hover:underline"
                  >
                    + Add {meta.shortTitle}
                  </button>

                  <button
                    type="button"
                    onClick={() => onSwitchRole(card.role)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-emerald-600 text-white'
                        : card.role === 'teller'
                        ? 'bg-orange-600 text-white hover:bg-orange-700'
                        : 'bg-blue-700 text-white hover:bg-blue-800'
                    }`}
                  >
                    <span>
                      {isCurrent
                        ? 'Active Role'
                        : `Switch to ${meta.shortTitle}`}
                    </span>
                    {!isCurrent && <ArrowUpRight className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Registered Personnel & Workers Directory */}
      <div className="bg-white border border-blue-100 rounded-xl overflow-hidden shadow-2xs">
        <div className="px-6 py-4 border-b border-blue-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Human Resource Staff &amp; Workers Roster ({filteredStaff.length})
            </h3>
            <p className="text-xs text-slate-500">
              {canViewWorkerPasswords
                ? 'Executive / C.O.O. View Active: Showing all workers’ individual 4-digit anonymous passwords.'
                : 'Standard HR View: Worker 4-digit passwords are encrypted here and displayed on the Executive Director & C.O.O. Desks.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              'ALL',
              'Human Resources (HR)',
              'Executive Office',
              'Operations (COO)',
              'Finance Department (CFO)',
              'Credit Management',
              'Sales & Origination',
              'Teller Disbursement Desk',
            ].map((dept) => (
              <button
                key={dept}
                type="button"
                onClick={() => setDepartmentFilter(dept)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  departmentFilter === dept
                    ? 'bg-blue-700 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-blue-50'
                }`}
              >
                {dept === 'ALL' ? 'All Departments' : dept}
              </button>
            ))}
          </div>
        </div>

        {filteredStaff.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-800">
              No personnel records found in this department filter.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={seedingStaff}
                onClick={handleSeedStaff}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800"
              >
                {seedingStaff
                  ? 'Provisioning Corporate Roster...'
                  : 'Load Default Pristen Investments Ltd Staff Roster'}
              </button>
              <button
                type="button"
                onClick={() => onOpenNewStaffModal('manager')}
                className="px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
              >
                Register Worker Manually
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-blue-50/70 border-b border-blue-100 text-xs font-semibold text-blue-950">
                <tr>
                  <th className="py-3 px-5">Worker Login Name &amp; ID</th>
                  <th className="py-3 px-4">Role &amp; Department</th>
                  <th className="py-3 px-4">Assigned Duty &amp; Scope</th>
                  <th className="py-3 px-4">Phone &amp; 4-Digit Password</th>
                  <th className="py-3 px-5 text-right">HR Status &amp; Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredStaff.map((member) => {
                  const meta = STAFF_ROLE_METADATA[member.role];
                  const memberPin = resolveWorkerPin(member);
                  return (
                    <tr key={member.id} className="hover:bg-blue-50/30">
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-900">
                          {member.fullName}
                        </div>
                        <div className="text-xs font-mono text-blue-700">
                          {member.employeeCode}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 text-xs">
                          {meta.label}
                        </div>
                        <div className="text-xs text-orange-600 font-medium">
                          {member.department}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        {member.role === 'teller' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700">
                            <Lock className="w-3.5 h-3.5" />
                            Give Out Loans Only (Teller Desk)
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600 line-clamp-2">
                            {meta.permissionsSummary}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-700">
                        <div>{member.phone}</div>
                        {canViewWorkerPasswords ? (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                              <KeyRound className="w-3 h-3 text-amber-700" />
                              <span>PIN: {memberPin}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRotateMemberPin(member)}
                              className="text-[11px] text-blue-700 hover:underline font-sans font-semibold"
                            >
                              New PIN
                            </button>
                          </div>
                        ) : (
                          <div className="text-slate-500 font-semibold flex items-center gap-1 mt-0.5">
                            <Lock className="w-3 h-3 text-slate-400" />
                            <span>PIN: •••• (Exec/COO Desk)</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(member)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md border ${
                              member.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-300'
                            }`}
                          >
                            {member.status === 'active' ? 'Active' : 'Suspended'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onSwitchRole(member.role, member.fullName)
                            }
                            className="px-3 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
                          >
                            Sign In As Worker
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 4. MODAL: HUMAN RESOURCE — REGISTER NEW WORKER (UNIQUE ANONYMOUS 4-DIGIT PIN)
// ============================================================================
interface NewStaffModalProps {
  ownerId: string;
  initialRole?: StaffRole;
  onClose: () => void;
}

export const NewStaffModal: React.FC<NewStaffModalProps> = ({
  ownerId,
  initialRole = 'teller',
  onClose,
}) => {
  const [fullName, setFullName] = useState('');
  const [employeeCode, setEmployeeCode] = useState(
    `PHL-STF-${Math.floor(100 + Math.random() * 899)}`
  );
  const [role, setRole] = useState<StaffRole>(initialRole);
  const [phone, setPhone] = useState('+256 7');
  const [anonymousPin, setAnonymousPin] = useState<string>(() =>
    generateAnonymousFourDigitPin(DEFAULT_CORPORATE_WORKERS.map((w) => w.pin))
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMeta = STAFF_ROLE_METADATA[role];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = /^\d{4}$/.test(anonymousPin.trim())
      ? anonymousPin.trim()
      : generateAnonymousFourDigitPin();
    setSubmitting(true);
    setError(null);
    try {
      await createStaffMemberRecord(ownerId, {
        fullName,
        employeeCode,
        role,
        department: selectedMeta.department,
        phone,
        email: encodeStaffMetadata({
          pin: cleanPin,
          salaryUGX: DEFAULT_ROLE_MONTHLY_SALARY_UGX[role] || 1800000,
          salaryStatus: 'pending_approval',
          paymentRef: 'HR-ONBOARD',
        }),
        status: 'active',
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to register staff member.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Human Resource — Register New Worker
            </h3>
            <p className="text-xs text-slate-500">
              Provision worker login name, role, and unique anonymous 4-digit password
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
          {error && (
            <div className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Organizational Role &amp; Duty *
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="hr">
                Human Resource (H.R.) Manager (Staff Management)
              </option>
              <option value="executive_director">
                Executive Director (Executive Office)
              </option>
              <option value="coo">
                Chief Operating Officer — C.O.O. (Operations)
              </option>
              <option value="cfo">
                Chief Financial Officer — C.F.O. (Finance Department)
              </option>
              <option value="finance_officer">
                Finance &amp; Treasury Officer (Finance Department)
              </option>
              <option value="manager">
                Branch / Credit Manager (Credit Management)
              </option>
              <option value="sales_person">
                Sales Team Officer (Performance Analytics)
              </option>
              <option value="teller">
                Teller (Strictly Loan Disbursement Desk Only)
              </option>
            </select>
          </div>

          <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200 text-xs space-y-1">
            <div className="font-semibold text-blue-950">
              Assigned Department: {selectedMeta.department}
            </div>
            <div className="text-slate-600">{selectedMeta.permissionsSummary}</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Worker Full Name (Login Name) *
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Mercy Nabukeera"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Staff ID / Employee Code *
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phone Number *
              </label>
              <input
                type="text"
                required
                minLength={7}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Anonymous 4-Digit PIN
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setAnonymousPin(
                      generateAnonymousFourDigitPin(
                        DEFAULT_CORPORATE_WORKERS.map((w) => w.pin)
                      )
                    )
                  }
                  className="text-[11px] font-semibold text-blue-700 hover:underline"
                >
                  Regenerate PIN
                </button>
              </div>
              <input
                type="text"
                required
                maxLength={4}
                pattern="\d{4}"
                value={anonymousPin}
                onChange={(e) =>
                  setAnonymousPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                className="w-full px-3 py-2 text-sm font-mono font-bold text-blue-800 bg-blue-50 border border-blue-200 rounded-lg tracking-widest"
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
            This worker’s anonymous 4-digit password (<strong className="font-mono">{anonymousPin}</strong>) will be automatically displayed on the <strong>Executive Director Desk</strong> and the <strong>C.O.O. Desk</strong>.
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50"
            >
              {submitting ? 'Saving Worker...' : 'Register Worker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

