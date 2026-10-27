import React, { useMemo, useState } from 'react';
import { Calculator, ArrowRight, Download } from 'lucide-react';
import { CurrencyCode, InterestMethod, PaymentFrequency } from '../types/loan';
import {
  calculateAmortizationSchedule,
  formatCurrency,
  getTodayISO,
} from '../utils/loanEngine';

interface InterestCalculatorViewProps {
  onOriginateFromCalc: (preset: {
    currency: CurrencyCode;
    principalAmount: number;
    annualInterestRate: number;
    interestMethod: InterestMethod;
    termMonths: number;
    paymentFrequency: PaymentFrequency;
    disbursementDate: string;
  }) => void;
}

export const InterestCalculatorView: React.FC<InterestCalculatorViewProps> = ({
  onOriginateFromCalc,
}) => {
  const [currency, setCurrency] = useState<CurrencyCode>('UGX');
  const [principalAmount, setPrincipalAmount] = useState<number>(50000000);
  const [annualInterestRate, setAnnualInterestRate] = useState<number>(12);
  const [termMonths, setTermMonths] = useState<number>(12);
  const [interestMethod, setInterestMethod] = useState<InterestMethod>('reducing_balance');
  const [paymentFrequency, setPaymentFrequency] = useState<PaymentFrequency>('monthly');
  const [disbursementDate, setDisbursementDate] = useState<string>(getTodayISO());

  const activeSchedule = useMemo(
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

  // Compute side-by-side comparison across all 3 methods
  const comparisonMatrix = useMemo(() => {
    const methods: { key: InterestMethod; label: string; description: string }[] = [
      {
        key: 'reducing_balance',
        label: 'Reducing Balance (EMI)',
        description: 'Interest computed on declining principal balance each period',
      },
      {
        key: 'flat_rate',
        label: 'Flat Rate Commercial',
        description: 'Fixed periodic principal and interest across all installments',
      },
      {
        key: 'interest_only',
        label: 'Interest-Only (Bullet)',
        description: 'Periodic interest servicing with principal bullet at maturity',
      },
    ];

    return methods.map((m) => ({
      ...m,
      result: calculateAmortizationSchedule({
        principalAmount: Math.max(1, principalAmount),
        annualInterestRate: Math.max(0, annualInterestRate),
        termMonths: Math.max(1, termMonths),
        interestMethod: m.key,
        paymentFrequency,
        disbursementDate,
        currency,
      }),
    }));
  }, [principalAmount, annualInterestRate, termMonths, paymentFrequency, disbursementDate, currency]);

  const handleExportSimulatedCSV = () => {
    const headers = [
      'Installment #',
      'Due Date',
      'Scheduled Payment',
      'Principal Component',
      'Interest Component',
      'Remaining Principal Balance',
    ];
    const rows = activeSchedule.installments.map((item) => [
      item.installmentNumber,
      item.dueDate,
      item.scheduledAmount,
      item.principalComponent,
      item.interestComponent,
      item.remainingBalanceAfter,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Pristen_Investments_Quote_${interestMethod}_${disbursementDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      {/* Header & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-blue-100 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Interest & Amortization Structuring Simulator
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Model repayment schedules across Reducing Balance, Flat Rate, and Bullet structures before originating a facility.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleExportSimulatedCSV}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-blue-700" />
            Download Quote CSV
          </button>
          <button
            type="button"
            onClick={() =>
              onOriginateFromCalc({
                currency,
                principalAmount,
                annualInterestRate,
                interestMethod,
                termMonths,
                paymentFrequency,
                disbursementDate,
              })
            }
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0"
          >
            Convert to Live Facility
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Parameter Controls & Summary Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Input Parameters */}
        <div className="lg:col-span-5 bg-white border border-blue-100 rounded-xl p-6 space-y-5 shadow-2xs">
          <div className="flex items-center justify-between border-b border-blue-50 pb-3">
            <h3 className="text-sm font-semibold text-slate-900">Facility Structuring Inputs</h3>
            <div className="flex items-center gap-1 p-1 bg-orange-50/80 border border-orange-100 rounded-lg">
              {(['UGX', 'USD'] as CurrencyCode[]).map((curr) => (
                <button
                  key={curr}
                  type="button"
                  onClick={() => {
                    setCurrency(curr);
                    setPrincipalAmount(curr === 'UGX' ? 50000000 : 15000);
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    currency === curr
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-orange-800'
                  }`}
                >
                  {curr}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Principal Facility Amount ({currency})
              </label>
              <input
                type="number"
                min={100}
                step={currency === 'UGX' ? 500000 : 100}
                value={principalAmount}
                onChange={(e) => setPrincipalAmount(Math.max(1, Number(e.target.value)))}
                className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Monthly Interest Rate (% / mo)
              </label>
              <input
                type="number"
                min={0}
                max={200}
                step="any"
                value={annualInterestRate}
                onChange={(e) => setAnnualInterestRate(Math.max(0, Number(e.target.value)))}
                className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Facility Tenor (Months)
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={termMonths}
                onChange={(e) => setTermMonths(Math.max(1, Math.min(120, Number(e.target.value))))}
                className="w-full px-3.5 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Repayment Cadence
              </label>
              <select
                value={paymentFrequency}
                onChange={(e) => setPaymentFrequency(e.target.value as PaymentFrequency)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
              >
                <option value="monthly">Monthly (12/yr)</option>
                <option value="biweekly">Bi-Weekly (26/yr)</option>
                <option value="weekly">Weekly (52/yr)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Disbursement Date
              </label>
              <input
                type="date"
                value={disbursementDate}
                onChange={(e) => setDisbursementDate(e.target.value || getTodayISO())}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Active Interest Methodology
              </label>
              <div className="grid grid-cols-3 gap-2 p-1 bg-blue-50/80 border border-blue-100 rounded-lg">
                {(
                  [
                    { id: 'reducing_balance', label: 'Reducing Balance' },
                    { id: 'flat_rate', label: 'Flat Rate' },
                    { id: 'interest_only', label: 'Interest-Only' },
                  ] as { id: InterestMethod; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setInterestMethod(tab.id)}
                    className={`py-2 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      interestMethod === tab.id
                        ? 'bg-blue-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-blue-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Methodology Comparison Matrix */}
        <div className="lg:col-span-7 bg-white border border-blue-100 rounded-xl p-6 flex flex-col justify-between shadow-2xs">
          <div>
            <div className="flex items-center justify-between border-b border-blue-50 pb-3 mb-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Side-by-Side Methodology Comparison
              </h3>
              <span className="text-xs text-blue-700 font-semibold font-mono tabular-nums">
                {activeSchedule.installmentsCount} Installments · {annualInterestRate}% / month
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-blue-100 text-xs font-semibold text-blue-950">
                    <th className="py-2.5 pr-4">Calculation Method</th>
                    <th className="py-2.5 px-3 text-right">1st Installment</th>
                    <th className="py-2.5 px-3 text-right">Total Interest</th>
                    <th className="py-2.5 pl-3 text-right">Total Payable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {comparisonMatrix.map((row) => {
                    const isSelected = row.key === interestMethod;
                    return (
                      <tr
                        key={row.key}
                        onClick={() => setInterestMethod(row.key)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50/70 font-medium' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3.5 pr-4">
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              checked={isSelected}
                              onChange={() => setInterestMethod(row.key)}
                              className="accent-blue-700"
                            />
                            <div>
                              <div className="text-slate-900 font-semibold text-xs sm:text-sm">
                                {row.label}
                              </div>
                              <div className="text-xs text-slate-500">{row.description}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums text-xs sm:text-sm text-blue-700 font-semibold whitespace-nowrap">
                          {formatCurrency(row.result.periodicPayment, currency)}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums text-xs sm:text-sm text-orange-600 font-semibold whitespace-nowrap">
                          {formatCurrency(row.result.totalInterestProjected, currency)}
                        </td>
                        <td className="py-3.5 pl-3 text-right font-mono tabular-nums text-xs sm:text-sm font-bold text-slate-900 whitespace-nowrap">
                          {formatCurrency(row.result.totalPayable, currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-blue-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-slate-500">Monthly Interest Rate</div>
              <div className="text-sm font-mono tabular-nums font-semibold text-blue-700 mt-0.5">
                {annualInterestRate.toFixed(2)}% / mo
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Interest-to-Principal</div>
              <div className="text-sm font-mono tabular-nums font-semibold text-orange-600 mt-0.5">
                {principalAmount > 0
                  ? ((activeSchedule.totalInterestProjected / principalAmount) * 100).toFixed(1)
                  : '0.0'}
                %
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">First Due Date</div>
              <div className="text-sm font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                {activeSchedule.installments[0]?.dueDate || disbursementDate}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Maturity Date</div>
              <div className="text-sm font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                {activeSchedule.installments[activeSchedule.installments.length - 1]?.dueDate ||
                  disbursementDate}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full Simulated Amortization Schedule Table */}
      <div className="bg-white border border-blue-100 rounded-xl overflow-hidden shadow-2xs">
        <div className="px-6 py-4 border-b border-blue-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-blue-700" />
            <h3 className="text-sm font-semibold text-slate-900">
              Projected Amortization Schedule ({activeSchedule.installmentsCount} Installments)
            </h3>
          </div>
          <div className="text-xs text-slate-600 font-mono tabular-nums">
            Total Principal: <span className="text-blue-700 font-semibold">{formatCurrency(principalAmount, currency)}</span> · Total Interest:{' '}
            <span className="text-orange-600 font-semibold">{formatCurrency(activeSchedule.totalInterestProjected, currency)}</span>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[480px]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-blue-50/70 sticky top-0 border-b border-blue-100 text-xs font-semibold text-blue-950">
              <tr>
                <th className="py-3 px-6">#</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4 text-right">Scheduled Installment</th>
                <th className="py-3 px-4 text-right">Principal Portion</th>
                <th className="py-3 px-4 text-right">Interest Portion</th>
                <th className="py-3 px-6 text-right">Closing Principal Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm font-mono tabular-nums">
              {activeSchedule.installments.map((inst) => (
                <tr key={inst.installmentNumber} className="hover:bg-blue-50/40 transition-colors">
                  <td className="py-2.5 px-6 text-slate-500">{inst.installmentNumber}</td>
                  <td className="py-2.5 px-4 text-slate-900">{inst.dueDate}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-slate-900">
                    {formatCurrency(inst.scheduledAmount, currency)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-blue-700 font-medium">
                    {formatCurrency(inst.principalComponent, currency)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-orange-600 font-medium">
                    {formatCurrency(inst.interestComponent, currency)}
                  </td>
                  <td className="py-2.5 px-6 text-right text-slate-700">
                    {formatCurrency(inst.remainingBalanceAfter, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
