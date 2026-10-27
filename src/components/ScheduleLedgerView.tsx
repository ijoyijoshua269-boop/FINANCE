import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Download,
  Bell,
  CreditCard,
  Sliders,
} from 'lucide-react';
import { Installment, Loan } from '../types/loan';
import { formatCurrency } from '../utils/loanEngine';
import { updateLoanReminderSettings } from '../services/loanService';

interface ScheduleLedgerViewProps {
  loans: Loan[];
  selectedLoanId: string | null;
  onSelectLoan: (loanId: string) => void;
  installmentsByLoan: Record<string, Installment[]>;
  onOpenPaymentModal: (loan: Loan, installment: Installment) => void;
  onOpenReminderModal: (loan: Loan, installment: Installment) => void;
}

export const ScheduleLedgerView: React.FC<ScheduleLedgerViewProps> = ({
  loans,
  selectedLoanId,
  onSelectLoan,
  installmentsByLoan,
  onOpenPaymentModal,
  onOpenReminderModal,
}) => {
  const activeLoan =
    loans.find((l) => l.id === selectedLoanId) || loans[0] || null;
  const installments = activeLoan
    ? [...(installmentsByLoan[activeLoan.id] || [])].sort(
        (a, b) => a.installmentNumber - b.installmentNumber
      )
    : [];

  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const handleToggleAutoReminder = async () => {
    if (!activeLoan || activeLoan.status === 'paid_off' || activeLoan.status === 'defaulted') return;
    setSavingSettings(true);
    setSettingsError(null);
    try {
      await updateLoanReminderSettings(
        activeLoan.id,
        !activeLoan.autoReminderEnabled,
        activeLoan.reminderDaysBefore
      );
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : 'Unable to update reminder settings.'
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const handleChangeReminderDays = async (days: number) => {
    if (!activeLoan || activeLoan.status === 'paid_off' || activeLoan.status === 'defaulted') return;
    setSavingSettings(true);
    setSettingsError(null);
    try {
      await updateLoanReminderSettings(
        activeLoan.id,
        activeLoan.autoReminderEnabled,
        days
      );
    } catch (err) {
      setSettingsError(
        err instanceof Error ? err.message : 'Unable to update reminder lead days.'
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const handleExportLoanScheduleCSV = () => {
    if (!activeLoan) return;
    const headers = [
      'Loan Reference',
      'Borrower',
      'Installment #',
      'Due Date',
      'Scheduled Amount',
      'Principal Component',
      'Interest Component',
      'Remaining Principal',
      'Amount Paid',
      'Paid Date',
      'Payment Reference',
      'Status',
    ];
    const rows = installments.map((inst) => [
      activeLoan.loanReference,
      `"${activeLoan.borrowerName}"`,
      inst.installmentNumber,
      inst.dueDate,
      inst.scheduledAmount,
      inst.principalComponent,
      inst.interestComponent,
      inst.remainingBalanceAfter,
      inst.amountPaid,
      inst.paidDate || '-',
      inst.paymentReference || '-',
      inst.status,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `${activeLoan.loanReference}_Schedule.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!activeLoan) {
    return (
      <div className="bg-white border border-blue-100 rounded-xl p-12 text-center shadow-2xs">
        <h3 className="text-base font-semibold text-slate-900">
          No Active Loan Facilities Found
        </h3>
        <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
          Originate a new loan facility or load the sample Pristen Investments Ltd portfolio from the overview screen to inspect amortization schedules.
        </p>
      </div>
    );
  }

  const repaymentProgressPct =
    activeLoan.totalPayable > 0
      ? Math.min(100, Math.round((activeLoan.amountPaid / activeLoan.totalPayable) * 100))
      : 0;

  return (
    <div className="space-y-6">
      {/* Top Selector & Export Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-blue-100 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-xs font-semibold text-blue-950 whitespace-nowrap">
            Select Facility Ledger:
          </label>
          <select
            value={activeLoan.id}
            onChange={(e) => onSelectLoan(e.target.value)}
            className="px-3.5 py-2 text-sm font-medium bg-white border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {loans.map((l) => (
              <option key={l.id} value={l.id}>
                {l.loanReference} — {l.borrowerName} ({formatCurrency(l.principalAmount, l.currency)})
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleExportLoanScheduleCSV}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-orange-600" />
            Export Schedule CSV
          </button>
        </div>
      </div>

      {settingsError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between text-xs text-red-900 font-mono break-all">
          <span>{settingsError}</span>
          <button
            type="button"
            onClick={() => setSettingsError(null)}
            className="text-red-700 font-semibold hover:underline ml-4 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Facility Metadata & Automated Reminder Rules Strip */}
      <div className="bg-white border border-blue-100 rounded-xl p-6 space-y-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-blue-50 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              <span className="text-blue-700 font-semibold">{activeLoan.loanReference}</span>
              <span aria-hidden="true">·</span>
              <span>
                {activeLoan.interestMethod === 'reducing_balance'
                  ? 'Reducing Balance'
                  : activeLoan.interestMethod === 'flat_rate'
                  ? 'Flat Rate'
                  : 'Interest-Only'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-orange-600 font-semibold">{activeLoan.annualInterestRate}% / month</span>
              <span aria-hidden="true">·</span>
              <span>{activeLoan.borrowerPhone}</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">
              {activeLoan.borrowerName}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Purpose: {activeLoan.purpose}
            </p>
          </div>

          {/* Automated Reminder Rule Controls */}
          <div className="flex flex-wrap items-center gap-4 bg-blue-50/50 border border-blue-100 rounded-lg px-4 py-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-700" />
              <span className="text-xs font-semibold text-blue-950">
                Automated Reminder Rule:
              </span>
            </div>
            <button
              type="button"
              disabled={savingSettings || activeLoan.status === 'paid_off'}
              onClick={handleToggleAutoReminder}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeLoan.autoReminderEnabled
                  ? 'bg-blue-700 text-white'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              {activeLoan.autoReminderEnabled ? 'Enabled' : 'Paused'}
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-700">
              <span>Trigger</span>
              <select
                disabled={savingSettings || activeLoan.status === 'paid_off'}
                value={activeLoan.reminderDaysBefore}
                onChange={(e) => handleChangeReminderDays(Number(e.target.value))}
                className="px-2 py-1 font-mono text-xs bg-white border border-blue-200 rounded-md"
              >
                <option value={1}>1 day</option>
                <option value={3}>3 days</option>
                <option value={5}>5 days</option>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
              </select>
              <span>before due date</span>
            </div>
          </div>
        </div>

        {/* 4-Column Financial Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <div className="text-xs text-slate-500">Disbursed Principal</div>
            <div className="text-base font-bold font-mono tabular-nums text-blue-700 mt-1">
              {formatCurrency(activeLoan.principalAmount, activeLoan.currency)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 font-mono">
              Disbursed {activeLoan.disbursementDate}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500">Total Projected Interest</div>
            <div className="text-base font-bold font-mono tabular-nums text-orange-600 mt-1">
              {formatCurrency(activeLoan.totalInterestProjected, activeLoan.currency)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Total Payable: {formatCurrency(activeLoan.totalPayable, activeLoan.currency)}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500">Cumulative Repaid ({repaymentProgressPct}%)</div>
            <div className="text-base font-bold font-mono tabular-nums text-emerald-700 mt-1">
              {formatCurrency(activeLoan.amountPaid, activeLoan.currency)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 font-mono">
              {activeLoan.paidInstallmentsCount} of {activeLoan.installmentsCount} installments settled
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-500">Outstanding Balance</div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatCurrency(activeLoan.outstandingBalance, activeLoan.currency)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 font-mono">
              Next Due: {activeLoan.status === 'paid_off' ? 'Settled' : activeLoan.nextDueDate}
            </div>
          </div>
        </div>
      </div>

      {/* Installment Schedule Table */}
      <div className="bg-white border border-blue-100 rounded-xl overflow-hidden shadow-2xs">
        <div className="px-6 py-4 border-b border-blue-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Repayment Schedule & Settlement Ledger
          </h3>
          <span className="text-xs text-blue-700 font-semibold font-mono tabular-nums">
            {installments.length} Scheduled Installments
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-blue-50/70 border-b border-blue-100 text-xs font-semibold text-blue-950">
              <tr>
                <th className="py-3 px-5">#</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4 text-right">Scheduled</th>
                <th className="py-3 px-4 text-right">Principal</th>
                <th className="py-3 px-4 text-right">Interest</th>
                <th className="py-3 px-4 text-right">Amount Paid</th>
                <th className="py-3 px-4">Status & Reference</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {installments.map((inst) => {
                const isPaid = inst.status === 'paid';
                const isOverdue = inst.status === 'overdue';
                const isDueSoon = inst.status === 'due_soon';

                return (
                  <tr
                    key={inst.id}
                    className={`transition-colors ${
                      isOverdue
                        ? 'bg-red-50/40 hover:bg-red-50/70'
                        : 'hover:bg-blue-50/40'
                    }`}
                  >
                    <td className="py-3 px-5 font-mono tabular-nums text-slate-500">
                      {inst.installmentNumber}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                      {inst.dueDate}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatCurrency(inst.scheduledAmount, activeLoan.currency)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-blue-700 whitespace-nowrap">
                      {formatCurrency(inst.principalComponent, activeLoan.currency)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-orange-600 whitespace-nowrap">
                      {formatCurrency(inst.interestComponent, activeLoan.currency)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-medium text-emerald-700 whitespace-nowrap">
                      {formatCurrency(inst.amountPaid, activeLoan.currency)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        {isPaid ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="text-emerald-700">Paid</span>
                          </>
                        ) : isOverdue ? (
                          <>
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                            <span className="text-red-700 font-semibold">Overdue</span>
                          </>
                        ) : isDueSoon ? (
                          <>
                            <Clock className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                            <span className="text-orange-600 font-semibold">Due Soon</span>
                          </>
                        ) : inst.status === 'partial' ? (
                          <>
                            <Clock className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                            <span className="text-orange-600">Partial</span>
                          </>
                        ) : (
                          <>
                            <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="text-slate-600">Scheduled</span>
                          </>
                        )}
                        {inst.paymentReference && (
                          <span className="text-slate-400 font-mono">
                            · {inst.paymentReference}
                          </span>
                        )}
                        {inst.reminderSentCount > 0 && (
                          <span className="text-orange-600 font-mono">
                            · {inst.reminderSentCount} rem.
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      {!isPaid ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenPaymentModal(activeLoan, inst)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
                          >
                            <CreditCard className="w-3 h-3" />
                            Record Payment
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenReminderModal(activeLoan, inst)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 transition-colors whitespace-nowrap shrink-0"
                          >
                            <Bell className="w-3 h-3" />
                            Remind
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-mono text-slate-400">
                          Settled {inst.paidDate}
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
