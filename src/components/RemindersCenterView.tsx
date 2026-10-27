import React, { useState } from 'react';
import {
  Bell,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MessageSquare,
  Mail,
  PhoneCall,
} from 'lucide-react';
import {
  Installment,
  Loan,
  PendingReminderCandidate,
  Reminder,
  ReminderChannel,
} from '../types/loan';
import { formatCurrency } from '../utils/loanEngine';
import {
  acknowledgeReminderDelivery,
  dispatchReminderBatch,
} from '../services/loanService';

interface RemindersCenterViewProps {
  ownerId: string;
  pendingCandidates: PendingReminderCandidate[];
  reminders: Reminder[];
  onOpenCustomReminder: (loan: Loan, installment: Installment) => void;
}

export const RemindersCenterView: React.FC<RemindersCenterViewProps> = ({
  ownerId,
  pendingCandidates,
  reminders,
  onOpenCustomReminder,
}) => {
  const [channelFilter, setChannelFilter] = useState<'ALL' | ReminderChannel>('ALL');
  const [isDispatchingBatch, setIsDispatchingBatch] = useState(false);
  const [batchSuccessCount, setBatchSuccessCount] = useState<number | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const handleRunAutomatedSweep = async () => {
    if (pendingCandidates.length === 0 || isDispatchingBatch) return;
    setIsDispatchingBatch(true);
    setBatchSuccessCount(null);
    setDispatchError(null);
    try {
      const count = await dispatchReminderBatch(ownerId, pendingCandidates);
      setBatchSuccessCount(count);
    } catch (err) {
      setDispatchError(
        err instanceof Error ? err.message : 'Unable to complete automated reminder sweep.'
      );
    } finally {
      setIsDispatchingBatch(false);
    }
  };

  const handleAcknowledge = async (reminderId: string) => {
    setDispatchError(null);
    try {
      await acknowledgeReminderDelivery(reminderId);
    } catch (err) {
      setDispatchError(
        err instanceof Error ? err.message : 'Unable to update reminder status.'
      );
    }
  };

  const filteredReminders = reminders.filter((r) =>
    channelFilter === 'ALL' ? true : r.channel === channelFilter
  );

  return (
    <div className="space-y-8">
      {/* Header & Automated Sweep Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-blue-100 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Automated Payment Reminders & Dispatch Engine
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Real-time detection of overdue escalations, same-day maturities, and pre-due reminders across Pristen Investments Ltd facilities.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={pendingCandidates.length === 0 || isDispatchingBatch}
            onClick={handleRunAutomatedSweep}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            {isDispatchingBatch
              ? 'Dispatching Sweep...'
              : `Run Automated Sweep (${pendingCandidates.length})`}
          </button>
        </div>
      </div>

      {dispatchError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between text-xs text-red-900 font-mono break-all">
          <span>{dispatchError}</span>
          <button
            type="button"
            onClick={() => setDispatchError(null)}
            className="text-red-700 font-semibold hover:underline ml-4 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {batchSuccessCount !== null && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between text-xs text-blue-950">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-blue-700 shrink-0" />
            <span>
              Successfully dispatched {batchSuccessCount} automated payment reminder
              {batchSuccessCount === 1 ? '' : 's'} and updated installment reminder logs.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setBatchSuccessCount(null)}
            className="text-blue-700 font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Pending Actionable Reminders Queue */}
      <div className="bg-white border border-blue-100 rounded-xl overflow-hidden shadow-2xs">
        <div className="px-6 py-4 border-b border-blue-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-orange-600" />
            <h3 className="text-sm font-semibold text-slate-900">
              Pending Automated Reminder Queue ({pendingCandidates.length})
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Evaluated against each loan’s configured lead-day window
          </span>
        </div>

        {pendingCandidates.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-slate-800">
              All active installments are outside their reminder trigger window or already settled.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Upcoming installments will automatically surface here when they enter the pre-due window.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingCandidates.map((cand) => {
              const isOverdue = cand.triggerType === 'Overdue Escalation';
              const isDueToday = cand.triggerType === 'Due Today';
              const remainingDue = Math.max(
                0,
                cand.installment.scheduledAmount - cand.installment.amountPaid
              );

              return (
                <div
                  key={`${cand.loan.id}_${cand.installment.id}`}
                  className="p-5 hover:bg-blue-50/40 transition-colors flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                >
                  <div className="space-y-1.5 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {isOverdue ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Overdue Escalation ({Math.abs(cand.daysDelta)}d past due)
                        </span>
                      ) : isDueToday ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-orange-600">
                          <Clock className="w-3.5 h-3.5" />
                          Due Today ({cand.installment.dueDate})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-blue-700">
                          <Clock className="w-3.5 h-3.5" />
                          Upcoming Due (in {cand.daysDelta}d · {cand.installment.dueDate})
                        </span>
                      )}
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="font-mono text-blue-700 font-medium">{cand.loan.loanReference}</span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="font-semibold text-slate-900">
                        {cand.loan.borrowerName}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="font-mono font-semibold text-orange-600">
                        {formatCurrency(remainingDue, cand.loan.currency)}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="text-slate-500 font-mono">
                        Sent {cand.installment.reminderSentCount}x
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 font-mono bg-blue-50/40 border border-blue-100 rounded-lg p-3 leading-relaxed">
                      {cand.suggestedMessage}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenCustomReminder(cand.loan, cand.installment)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Send className="w-3.5 h-3.5 text-orange-600" />
                      Customize & Dispatch
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dispatched Reminder Audit History */}
      <div className="bg-white border border-blue-100 rounded-xl overflow-hidden shadow-2xs">
        <div className="px-6 py-4 border-b border-blue-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Dispatched Reminder Audit Log ({filteredReminders.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Immutable ledger of SMS, WhatsApp, and Email payment reminders sent to borrowers
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-blue-50/80 border border-blue-100 rounded-lg">
            {(['ALL', 'SMS', 'WhatsApp', 'Email'] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannelFilter(ch)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  channelFilter === ch
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-blue-800'
                }`}
              >
                {ch === 'ALL' ? 'All Channels' : ch}
              </button>
            ))}
          </div>
        </div>

        {filteredReminders.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No reminder logs recorded for the selected channel filter yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-blue-50/70 border-b border-blue-100 text-xs font-semibold text-blue-950">
                <tr>
                  <th className="py-3 px-5">Facility & Borrower</th>
                  <th className="py-3 px-4">Channel & Trigger</th>
                  <th className="py-3 px-4 text-right">Amount Due</th>
                  <th className="py-3 px-4">Message Excerpt</th>
                  <th className="py-3 px-4">Delivery Status</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredReminders.map((rem) => (
                  <tr key={rem.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="font-semibold text-slate-900 text-xs sm:text-sm">
                        {rem.borrowerName}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        <span className="text-blue-700">{rem.loanReference}</span> · Inst #{rem.installmentNumber} · Due {rem.dueDate}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800">
                        {rem.channel === 'SMS' ? (
                          <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
                        ) : rem.channel === 'Email' ? (
                          <Mail className="w-3.5 h-3.5 text-orange-600" />
                        ) : (
                          <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                        )}
                        <span>{rem.channel}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-600">{rem.triggerType}</span>
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        {rem.borrowerContact}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-orange-600 whitespace-nowrap">
                      {formatCurrency(rem.amountDue, rem.currency)}
                    </td>
                    <td className="py-3.5 px-4 max-w-md">
                      <p className="text-xs text-slate-600 line-clamp-2 font-mono">
                        {rem.messageBody}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {rem.deliveryStatus === 'acknowledged' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Acknowledged
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                          <Clock className="w-3.5 h-3.5 text-orange-500" />
                          Dispatched
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      {rem.deliveryStatus !== 'acknowledged' ? (
                        <button
                          type="button"
                          onClick={() => handleAcknowledge(rem.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
                        >
                          Mark Acknowledged
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Verified</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
