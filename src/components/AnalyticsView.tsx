import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Download, TrendingUp, PieChart as PieChartIcon, BarChart3, ShieldAlert } from 'lucide-react';
import { Borrower, CurrencyCode, Installment, Loan, Reminder } from '../types/loan';
import { formatCurrency } from '../utils/loanEngine';

interface AnalyticsViewProps {
  loans: Loan[];
  borrowers: Borrower[];
  installmentsByLoan: Record<string, Installment[]>;
  reminders: Reminder[];
}

const STATUS_COLORS: Record<string, string> = {
  'Performing (Active)': '#1d4ed8',
  'Due Soon': '#ea580c',
  'Overdue / Arrears': '#dc2626',
  'Settled (Paid Off)': '#3b82f6',
};

const SECTOR_COLORS = ['#1d4ed8', '#ea580c', '#2563eb', '#f97316', '#0284c7', '#fb923c'];

const BENCHMARK_MONTHLY_SERIES = [
  {
    month: '2026-05',
    label: 'May 26',
    scheduledInflow: 48500000,
    actualCollected: 48500000,
    principalComponent: 39200000,
    interestYield: 9300000,
    cumulativeCollected: 48500000,
    collectionEfficiency: 100,
  },
  {
    month: '2026-06',
    label: 'Jun 26',
    scheduledInflow: 64200000,
    actualCollected: 61800000,
    principalComponent: 49800000,
    interestYield: 14400000,
    cumulativeCollected: 110300000,
    collectionEfficiency: 96.3,
  },
  {
    month: '2026-07',
    label: 'Jul 26',
    scheduledInflow: 72000000,
    actualCollected: 70500000,
    principalComponent: 55100000,
    interestYield: 16900000,
    cumulativeCollected: 180800000,
    collectionEfficiency: 97.9,
  },
  {
    month: '2026-08',
    label: 'Aug 26',
    scheduledInflow: 86400000,
    actualCollected: 82100000,
    principalComponent: 66000000,
    interestYield: 20400000,
    cumulativeCollected: 262900000,
    collectionEfficiency: 95.0,
  },
  {
    month: '2026-09',
    label: 'Sep 26',
    scheduledInflow: 94800000,
    actualCollected: 91200000,
    principalComponent: 72300000,
    interestYield: 22500000,
    cumulativeCollected: 354100000,
    collectionEfficiency: 96.2,
  },
  {
    month: '2026-10',
    label: 'Oct 26',
    scheduledInflow: 108500000,
    actualCollected: 89400000,
    principalComponent: 82100000,
    interestYield: 26400000,
    cumulativeCollected: 443500000,
    collectionEfficiency: 82.4,
  },
];

function formatCompactUGX(value: number, currency: CurrencyCode = 'UGX'): string {
  if (!Number.isFinite(value)) return '0';
  if (currency === 'USD') {
    if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}k`;
    return `$${value.toFixed(0)}`;
  }
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return String(Math.round(value));
}

function formatMonthLabel(yyyyMm: string): string {
  const parts = yyyyMm.split('-');
  if (parts.length < 2) return yyyyMm;
  const year = parts[0].slice(2);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[monthIdx] || parts[1]} ${year}`;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  loans,
  borrowers,
  installmentsByLoan,
  reminders,
}) => {
  const [currencyFilter, setCurrencyFilter] = useState<CurrencyCode>('UGX');
  const [dataSourceMode, setDataSourceMode] = useState<'live' | 'benchmark'>('live');

  const currencyLoans = useMemo(
    () => loans.filter((l) => l.currency === currencyFilter),
    [loans, currencyFilter]
  );

  const useBenchmark = dataSourceMode === 'benchmark' || currencyLoans.length === 0;

  // 1. Monthly Cashflow, Collections & Interest Yield Series (Line & Bar Charts)
  const monthlySeries = useMemo(() => {
    if (useBenchmark) {
      return BENCHMARK_MONTHLY_SERIES;
    }

    const map: Record<
      string,
      {
        month: string;
        scheduledInflow: number;
        actualCollected: number;
        principalComponent: number;
        interestYield: number;
      }
    > = {};

    for (const loan of currencyLoans) {
      const insts = installmentsByLoan[loan.id] || [];
      for (const inst of insts) {
        const monthKey = inst.dueDate.slice(0, 7);
        if (!map[monthKey]) {
          map[monthKey] = {
            month: monthKey,
            scheduledInflow: 0,
            actualCollected: 0,
            principalComponent: 0,
            interestYield: 0,
          };
        }
        map[monthKey].scheduledInflow += inst.scheduledAmount;
        map[monthKey].actualCollected += inst.amountPaid;
        map[monthKey].principalComponent += inst.principalComponent;
        map[monthKey].interestYield += inst.interestComponent;
      }
    }

    const sortedMonths = Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
    let runningCollected = 0;

    return sortedMonths.map((item) => {
      runningCollected += item.actualCollected;
      const eff =
        item.scheduledInflow > 0
          ? Math.round((item.actualCollected / item.scheduledInflow) * 1000) / 10
          : 0;
      return {
        ...item,
        label: formatMonthLabel(item.month),
        cumulativeCollected: runningCollected,
        collectionEfficiency: eff,
      };
    });
  }, [useBenchmark, currencyLoans, installmentsByLoan]);

  // 2. Portfolio Health & Status Distribution (Pie / Donut Chart)
  const statusDistribution = useMemo(() => {
    if (useBenchmark) {
      return [
        { name: 'Performing (Active)', value: 185000000, count: 8 },
        { name: 'Due Soon', value: 42000000, count: 3 },
        { name: 'Overdue / Arrears', value: 28500000, count: 2 },
        { name: 'Settled (Paid Off)', value: 94000000, count: 5 },
      ];
    }

    const buckets: Record<string, { value: number; count: number }> = {
      'Performing (Active)': { value: 0, count: 0 },
      'Due Soon': { value: 0, count: 0 },
      'Overdue / Arrears': { value: 0, count: 0 },
      'Settled (Paid Off)': { value: 0, count: 0 },
    };

    for (const loan of currencyLoans) {
      const insts = installmentsByLoan[loan.id] || [];
      const hasOverdue = loan.status === 'overdue' || insts.some((i) => i.status === 'overdue');
      const hasDueSoon = insts.some((i) => i.status === 'due_soon');

      if (loan.status === 'paid_off') {
        buckets['Settled (Paid Off)'].value += loan.totalPayable;
        buckets['Settled (Paid Off)'].count += 1;
      } else if (hasOverdue) {
        buckets['Overdue / Arrears'].value += loan.outstandingBalance;
        buckets['Overdue / Arrears'].count += 1;
      } else if (hasDueSoon) {
        buckets['Due Soon'].value += loan.outstandingBalance;
        buckets['Due Soon'].count += 1;
      } else {
        buckets['Performing (Active)'].value += loan.outstandingBalance;
        buckets['Performing (Active)'].count += 1;
      }
    }

    return Object.entries(buckets)
      .map(([name, data]) => ({ name, value: data.value, count: data.count }))
      .filter((item) => item.value > 0 || item.count > 0);
  }, [useBenchmark, currencyLoans, installmentsByLoan]);

  // 3. Economic Sector Concentration (Pie Chart & Bar Breakdown)
  const sectorDistribution = useMemo(() => {
    if (useBenchmark) {
      return [
        { name: 'Coffee & Grain Export', principal: 145000000, interest: 26100000, count: 5 },
        { name: 'Haulage & Civil Works', principal: 98000000, interest: 21560000, count: 4 },
        { name: 'Cold Chain & Retail', principal: 64000000, interest: 12480000, count: 4 },
        { name: 'Commercial Real Estate', principal: 52000000, interest: 9360000, count: 2 },
      ];
    }

    const borrowerMap = new Map<string, Borrower>();
    borrowers.forEach((b) => borrowerMap.set(b.id, b));

    const sectorMap: Record<
      string,
      { name: string; principal: number; interest: number; count: number }
    > = {};

    for (const loan of currencyLoans) {
      const b = borrowerMap.get(loan.borrowerId);
      const sectorName = b?.occupationOrSector || 'Commercial Trade';
      if (!sectorMap[sectorName]) {
        sectorMap[sectorName] = {
          name: sectorName,
          principal: 0,
          interest: 0,
          count: 0,
        };
      }
      sectorMap[sectorName].principal += loan.principalAmount;
      sectorMap[sectorName].interest += loan.totalInterestProjected;
      sectorMap[sectorName].count += 1;
    }

    return Object.values(sectorMap).sort((a, b) => b.principal - a.principal);
  }, [useBenchmark, currencyLoans, borrowers]);

  // 4. Facility-by-Facility Performance Comparison (Bar Graph)
  const facilityComparison = useMemo(() => {
    if (useBenchmark) {
      return [
        {
          loanRef: 'PHL-2026-0104',
          borrower: 'Victoria Nile Agro',
          principal: 120000000,
          interest: 12780000,
          paid: 44260000,
          outstanding: 88520000,
        },
        {
          loanRef: 'PHL-2026-0089',
          borrower: 'Rwenzori Civil Ltd',
          principal: 85000000,
          interest: 9350000,
          paid: 31450000,
          outstanding: 62900000,
        },
        {
          loanRef: 'PHL-2026-0118',
          borrower: 'Entebbe Cold Chain',
          principal: 36000000,
          interest: 2940000,
          paid: 19470000,
          outstanding: 19470000,
        },
        {
          loanRef: 'PHL-2026-0072',
          borrower: 'Bugolobi Steel Works',
          principal: 95000000,
          interest: 17100000,
          paid: 84075000,
          outstanding: 28025000,
        },
      ];
    }

    return currencyLoans.slice(0, 8).map((l) => ({
      loanRef: l.loanReference,
      borrower:
        l.borrowerName.length > 20 ? `${l.borrowerName.slice(0, 18)}…` : l.borrowerName,
      principal: l.principalAmount,
      interest: l.totalInterestProjected,
      paid: l.amountPaid,
      outstanding: l.outstandingBalance,
    }));
  }, [useBenchmark, currencyLoans]);

  // 5. Executive Financial Ratios & PAR Metrics
  const executiveKPIs = useMemo(() => {
    if (useBenchmark) {
      return {
        totalPrincipal: 359000000,
        totalInterest: 69500000,
        weightedYieldPct: 19.36,
        parAmount: 28500000,
        parPct: 11.15,
        collectionEfficiencyPct: 94.8,
        avgLoanSize: 89750000,
        dispatchedRemindersCount: 18,
      };
    }

    const totalPrincipal = currencyLoans.reduce((s, l) => s + l.principalAmount, 0);
    const totalInterest = currencyLoans.reduce((s, l) => s + l.totalInterestProjected, 0);
    const totalPayable = currencyLoans.reduce((s, l) => s + l.totalPayable, 0);
    const totalPaid = currencyLoans.reduce((s, l) => s + l.amountPaid, 0);
    const totalOutstanding = currencyLoans.reduce((s, l) => s + l.outstandingBalance, 0);

    const overdueExposure = currencyLoans
      .filter((l) => {
        const insts = installmentsByLoan[l.id] || [];
        return l.status === 'overdue' || insts.some((i) => i.status === 'overdue');
      })
      .reduce((s, l) => s + l.outstandingBalance, 0);

    const weightedYieldPct =
      totalPrincipal > 0 ? (totalInterest / totalPrincipal) * 100 : 0;
    const parPct =
      totalOutstanding > 0 ? (overdueExposure / totalOutstanding) * 100 : 0;
    const collectionEfficiencyPct =
      totalPayable > 0 ? (totalPaid / totalPayable) * 100 : 0;
    const avgLoanSize =
      currencyLoans.length > 0 ? totalPrincipal / currencyLoans.length : 0;

    return {
      totalPrincipal,
      totalInterest,
      weightedYieldPct,
      parAmount: overdueExposure,
      parPct,
      collectionEfficiencyPct,
      avgLoanSize,
      dispatchedRemindersCount: reminders.length,
    };
  }, [useBenchmark, currencyLoans, installmentsByLoan, reminders]);

  const totalStatusValue = useMemo(
    () => statusDistribution.reduce((sum, item) => sum + item.value, 0),
    [statusDistribution]
  );

  const totalSectorPrincipal = useMemo(
    () => sectorDistribution.reduce((sum, item) => sum + item.principal, 0),
    [sectorDistribution]
  );

  const handleExportAnalyticsCSV = () => {
    const headers = [
      'Month',
      'Scheduled Inflow',
      'Actual Collected',
      'Principal Portion',
      'Interest Yield',
      'Cumulative Collected',
      'Collection Efficiency (%)',
    ];
    const rows = monthlySeries.map((m) => [
      m.month,
      m.scheduledInflow,
      m.actualCollected,
      m.principalComponent,
      m.interestYield,
      m.cumulativeCollected,
      m.collectionEfficiency,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute(
      'download',
      `Pristen_Investments_Executive_Analytics_${currencyFilter}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      {/* Header & Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-blue-100 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Executive Treasury & Portfolio Performance Analytics
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Cashflow velocity, principal-to-interest decomposition, Portfolio at Risk (PAR), and sector exposure for Pristen Investments Ltd.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Data Source Mode Selector */}
          <div className="flex items-center gap-1 p-1 bg-blue-50/80 border border-blue-100 rounded-lg">
            <button
              type="button"
              onClick={() => setDataSourceMode('live')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                !useBenchmark
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-blue-800'
              }`}
            >
              Live Ledger ({currencyLoans.length})
            </button>
            <button
              type="button"
              onClick={() => setDataSourceMode('benchmark')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                useBenchmark
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-blue-800'
              }`}
            >
              6-Month Treasury Benchmark
            </button>
          </div>

          {/* Currency Selector */}
          <div className="flex items-center gap-1 p-1 bg-orange-50/80 border border-orange-100 rounded-lg">
            {(['UGX', 'USD'] as CurrencyCode[]).map((curr) => (
              <button
                key={curr}
                type="button"
                onClick={() => setCurrencyFilter(curr)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  currencyFilter === curr
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-orange-800'
                }`}
              >
                {curr}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportAnalyticsCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-orange-600" />
            Export Report CSV
          </button>
        </div>
      </div>

      {/* 4-Column Executive Financial Ratio Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-orange-100 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Gross Interest Yield Ratio</span>
            <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-orange-600 mt-2">
            {executiveKPIs.weightedYieldPct.toFixed(2)}%
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            Yield: {formatCurrency(executiveKPIs.totalInterest, currencyFilter)}
          </div>
        </div>

        <div className="bg-white border border-blue-100 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Portfolio at Risk (PAR &gt; 1d)</span>
            <span className="w-7 h-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-red-700 mt-2">
            {executiveKPIs.parPct.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            Arrears Exposure: {formatCurrency(executiveKPIs.parAmount, currencyFilter)}
          </div>
        </div>

        <div className="bg-white border border-blue-100 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Collection Realization Rate</span>
            <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 mt-2">
            {executiveKPIs.collectionEfficiencyPct.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            Avg Ticket: {formatCurrency(executiveKPIs.avgLoanSize, currencyFilter)}
          </div>
        </div>

        <div className="bg-white border border-orange-100 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Active Sector Diversification</span>
            <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
              <PieChartIcon className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-2">
            {sectorDistribution.length} Sectors
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {executiveKPIs.dispatchedRemindersCount} Automated Notices Logged
          </div>
        </div>
      </div>

      {/* ROW 1: Line Chart (Cashflow Trajectory) + Bar Graph (Monthly Principal vs Interest) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Line Chart: Scheduled vs Actual Collections & Cumulative Trajectory */}
        <div className="lg:col-span-6 min-w-0 bg-white border border-blue-100 rounded-xl p-6 flex flex-col justify-between shadow-2xs">
          <div className="border-b border-blue-50 pb-4 mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Repayment Velocity & Cashflow Trajectory (Line Chart)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Scheduled monthly obligations vs. actual cash collected ({currencyFilter})
              </p>
            </div>
            <span className="text-xs font-mono text-blue-700 font-semibold tabular-nums">
              {monthlySeries.length} Periods
            </span>
          </div>

          <div className="h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height={288} minWidth={0}>
              <LineChart
                data={monthlySeries}
                margin={{ top: 10, right: 16, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eff6ff" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatCompactUGX(v, currencyFilter)}
                  tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    formatCurrency(Number(value) || 0, currencyFilter),
                    String(name ?? ''),
                  ]}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#bfdbfe',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontFamily: 'JetBrains Mono',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
                />
                <Line
                  type="monotone"
                  dataKey="scheduledInflow"
                  name="Scheduled Obligation"
                  stroke="#1d4ed8"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#1d4ed8' }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="actualCollected"
                  name="Actual Cash Collected"
                  stroke="#ea580c"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#ea580c' }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="interestYield"
                  name="Interest Revenue"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 3, fill: '#3b82f6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Graph: Monthly Principal Recovery vs Interest Yield */}
        <div className="lg:col-span-6 min-w-0 bg-white border border-blue-100 rounded-xl p-6 flex flex-col justify-between shadow-2xs">
          <div className="border-b border-blue-50 pb-4 mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Principal Recovery vs. Interest Yield (Bar Graph)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Monthly amortization breakdown separating capital recovery from interest profit
              </p>
            </div>
            <span className="text-xs font-mono text-orange-600 font-semibold tabular-nums">
              Yield Analysis
            </span>
          </div>

          <div className="h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height={288} minWidth={0}>
              <BarChart
                data={monthlySeries}
                margin={{ top: 10, right: 16, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eff6ff" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatCompactUGX(v, currencyFilter)}
                  tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    formatCurrency(Number(value) || 0, currencyFilter),
                    String(name ?? ''),
                  ]}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#bfdbfe',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontFamily: 'JetBrains Mono',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
                <Bar
                  dataKey="principalComponent"
                  name="Principal Recovery"
                  stackId="a"
                  fill="#1d4ed8"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="interestYield"
                  name="Projected Interest"
                  stackId="a"
                  fill="#ea580c"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ROW 2: Two Pie Charts (Portfolio Status Distribution + Economic Sector Exposure) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Pie Chart 1: Portfolio Health & Lifecycle Status */}
        <div className="lg:col-span-6 min-w-0 bg-white border border-blue-100 rounded-xl p-6 flex flex-col justify-between shadow-2xs">
          <div className="border-b border-blue-50 pb-4 mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Portfolio Health & Risk Classification (Pie Chart)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Distribution of capital exposure across performing, due-soon, overdue, and settled books
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            <div className="sm:col-span-6 h-60 min-w-0">
              <ResponsiveContainer width="100%" height={240} minWidth={0}>
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={82}
                    paddingAngle={2}
                  >
                    {statusDistribution.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={STATUS_COLORS[entry.name] || '#1d4ed8'}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => [
                      formatCurrency(Number(value) || 0, currencyFilter),
                      String(name ?? ''),
                    ]}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#bfdbfe',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontFamily: 'JetBrains Mono',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="sm:col-span-6 space-y-3">
              {statusDistribution.map((item) => {
                const pct =
                  totalStatusValue > 0
                    ? ((item.value / totalStatusValue) * 100).toFixed(1)
                    : '0.0';
                return (
                  <div
                    key={item.name}
                    className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-b-0"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-xs shrink-0"
                        style={{
                          backgroundColor: STATUS_COLORS[item.name] || '#1d4ed8',
                        }}
                      />
                      <div>
                        <div className="text-xs font-semibold text-slate-900">
                          {item.name}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                          {item.count} facilit{item.count === 1 ? 'y' : 'ies'} · {pct}%
                        </div>
                      </div>
                    </div>
                    <div className="text-xs font-mono tabular-nums font-semibold text-slate-900">
                      {formatCompactUGX(item.value, currencyFilter)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Pie Chart 2: Economic Sector Exposure */}
        <div className="lg:col-span-6 min-w-0 bg-white border border-blue-100 rounded-xl p-6 flex flex-col justify-between shadow-2xs">
          <div className="border-b border-blue-50 pb-4 mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Industry & Sector Credit Allocation (Pie Chart)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Principal concentration by borrower industry across Uganda commercial sectors
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            <div className="sm:col-span-6 h-60 min-w-0">
              <ResponsiveContainer width="100%" height={240} minWidth={0}>
                <PieChart>
                  <Pie
                    data={sectorDistribution}
                    dataKey="principal"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={82}
                    paddingAngle={2}
                  >
                    {sectorDistribution.map((entry, idx) => (
                      <Cell
                        key={entry.name}
                        fill={SECTOR_COLORS[idx % SECTOR_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: unknown, name: unknown) => [
                      formatCurrency(Number(value) || 0, currencyFilter),
                      String(name ?? ''),
                    ]}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#bfdbfe',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontFamily: 'JetBrains Mono',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="sm:col-span-6 space-y-3">
              {sectorDistribution.map((sector, idx) => {
                const pct =
                  totalSectorPrincipal > 0
                    ? ((sector.principal / totalSectorPrincipal) * 100).toFixed(1)
                    : '0.0';
                return (
                  <div
                    key={sector.name}
                    className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-b-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-xs shrink-0"
                        style={{
                          backgroundColor: SECTOR_COLORS[idx % SECTOR_COLORS.length],
                        }}
                      />
                      <div className="truncate">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {sector.name}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                          {sector.count} loan{sector.count === 1 ? '' : 's'} · {pct}%
                        </div>
                      </div>
                    </div>
                    <div className="text-xs font-mono tabular-nums font-semibold text-slate-900 shrink-0 pl-2">
                      {formatCompactUGX(sector.principal, currencyFilter)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ROW 3: Facility-Level Collected vs Outstanding Exposure Bar Graph */}
      <div className="bg-white border border-blue-100 rounded-xl p-6 shadow-2xs">
        <div className="border-b border-blue-50 pb-4 mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Facility-by-Facility Repayment Realization vs. Outstanding Balance (Bar Graph)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Direct comparison of settled repayments against remaining balance across individual borrower facilities
            </p>
          </div>
          <span className="text-xs font-mono text-blue-700 font-semibold tabular-nums">
            Showing {facilityComparison.length} Facilities
          </span>
        </div>

        <div className="h-72 w-full min-w-0">
          <ResponsiveContainer width="100%" height={288} minWidth={0}>
            <BarChart
              data={facilityComparison}
              margin={{ top: 10, right: 20, left: 8, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#eff6ff" vertical={false} />
              <XAxis
                dataKey="borrower"
                tick={{ fontSize: 11, fill: '#334155' }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatCompactUGX(v, currencyFilter)}
                tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                width={58}
              />
              <Tooltip
                formatter={(value: unknown, name: unknown) => [
                  formatCurrency(Number(value) || 0, currencyFilter),
                  String(name ?? ''),
                ]}
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderColor: '#bfdbfe',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontFamily: 'JetBrains Mono',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
              <Bar
                dataKey="paid"
                name="Amount Collected"
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="outstanding"
                name="Outstanding Balance"
                fill="#1d4ed8"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="interest"
                name="Projected Interest Yield"
                fill="#ea580c"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
