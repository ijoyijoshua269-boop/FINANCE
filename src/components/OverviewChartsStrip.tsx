import React, { useMemo } from 'react';
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
} from 'recharts';
import { ArrowUpRight } from 'lucide-react';
import { Installment, Loan } from '../types/loan';
import { formatCurrency } from '../utils/loanEngine';

interface OverviewChartsStripProps {
  loans: Loan[];
  installmentsByLoan: Record<string, Installment[]>;
  onOpenFullAnalytics: () => void;
}

const PIE_COLORS = ['#1d4ed8', '#ea580c', '#3b82f6', '#f97316'];

function compactUGX(val: number): string {
  if (Math.abs(val) >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(0)}M`;
  if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(0)}K`;
  return String(Math.round(val));
}

export const OverviewChartsStrip: React.FC<OverviewChartsStripProps> = ({
  loans,
  installmentsByLoan,
  onOpenFullAnalytics,
}) => {
  const ugxLoans = useMemo(() => loans.filter((l) => l.currency === 'UGX'), [loans]);

  // Monthly series for Line Chart & Bar Graph
  const monthlyData = useMemo(() => {
    if (ugxLoans.length === 0) {
      return [
        { label: 'Jun', scheduled: 64200000, collected: 61800000, principal: 49800000, interest: 14400000 },
        { label: 'Jul', scheduled: 72000000, collected: 70500000, principal: 55100000, interest: 16900000 },
        { label: 'Aug', scheduled: 86400000, collected: 82100000, principal: 66000000, interest: 20400000 },
        { label: 'Sep', scheduled: 94800000, collected: 91200000, principal: 72300000, interest: 22500000 },
        { label: 'Oct', scheduled: 108500000, collected: 89400000, principal: 82100000, interest: 26400000 },
      ];
    }

    const map: Record<
      string,
      { month: string; scheduled: number; collected: number; principal: number; interest: number }
    > = {};

    for (const loan of ugxLoans) {
      const insts = installmentsByLoan[loan.id] || [];
      for (const inst of insts) {
        const key = inst.dueDate.slice(0, 7);
        if (!map[key]) {
          map[key] = { month: key, scheduled: 0, collected: 0, principal: 0, interest: 0 };
        }
        map[key].scheduled += inst.scheduledAmount;
        map[key].collected += inst.amountPaid;
        map[key].principal += inst.principalComponent;
        map[key].interest += inst.interestComponent;
      }
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return Object.values(map)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6)
      .map((m) => {
        const idx = parseInt(m.month.split('-')[1] || '1', 10) - 1;
        return {
          ...m,
          label: `${monthNames[idx] || m.month} '${m.month.slice(2, 4)}`,
        };
      });
  }, [ugxLoans, installmentsByLoan]);

  // Portfolio Composition Pie Chart
  const pieData = useMemo(() => {
    if (ugxLoans.length === 0) {
      return [
        { name: 'Active Principal', value: 185000000 },
        { name: 'Projected Interest', value: 54000000 },
        { name: 'Collected Repayments', value: 142000000 },
        { name: 'Overdue Arrears', value: 28500000 },
      ];
    }

    const collected = ugxLoans.reduce((s, l) => s + l.amountPaid, 0);
    const interest = ugxLoans.reduce((s, l) => s + l.totalInterestProjected, 0);
    const overdue = ugxLoans
      .filter((l) => {
        const insts = installmentsByLoan[l.id] || [];
        return l.status === 'overdue' || insts.some((i) => i.status === 'overdue');
      })
      .reduce((s, l) => s + l.outstandingBalance, 0);
    const performingOutstanding = Math.max(
      0,
      ugxLoans.reduce((s, l) => s + l.outstandingBalance, 0) - overdue
    );

    return [
      { name: 'Performing Balance', value: performingOutstanding },
      { name: 'Projected Interest', value: interest },
      { name: 'Collected Cashflow', value: collected },
      { name: 'Overdue Arrears', value: overdue },
    ].filter((d) => d.value > 0);
  }, [ugxLoans, installmentsByLoan]);

  return (
    <div className="bg-white border border-blue-100 rounded-xl p-6 space-y-6 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-blue-50 pb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Business Performance & Portfolio Telemetry
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time cashflow trajectory (Line), principal vs. interest yield (Bar), and capital allocation (Pie)
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenFullAnalytics}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          Open Full Analytics Suite
          <ArrowUpRight className="w-3.5 h-3.5 text-orange-600" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* 1. Line Chart: Cashflow Velocity */}
        <div className="lg:col-span-4 min-w-0 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-100 pb-5 lg:pb-0 lg:pr-5">
          <div className="mb-3">
            <div className="text-xs font-semibold text-blue-950">
              01. Cashflow & Collection Trajectory (Line)
            </div>
            <div className="text-xs text-slate-500">
              Scheduled inflow (Blue) vs. actual collected (Orange)
            </div>
          </div>
          <div className="h-48 w-full min-w-0">
            <ResponsiveContainer width="100%" height={192} minWidth={0}>
              <LineChart data={monthlyData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eff6ff" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={compactUGX}
                  tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [
                    formatCurrency(Number(v) || 0, 'UGX'),
                    String(name ?? ''),
                  ]}
                  contentStyle={{
                    fontSize: '11px',
                    fontFamily: 'JetBrains Mono',
                    borderRadius: '8px',
                    borderColor: '#bfdbfe',
                    backgroundColor: '#ffffff',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="scheduled"
                  name="Scheduled"
                  stroke="#1d4ed8"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: '#1d4ed8' }}
                />
                <Line
                  type="monotone"
                  dataKey="collected"
                  name="Collected"
                  stroke="#ea580c"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: '#ea580c' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Bar Graph: Principal vs Interest */}
        <div className="lg:col-span-4 min-w-0 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-100 pb-5 lg:pb-0 lg:pr-5">
          <div className="mb-3">
            <div className="text-xs font-semibold text-blue-950">
              02. Principal vs. Interest Yield (Bar)
            </div>
            <div className="text-xs text-slate-500">
              Principal recovery (Blue) vs. interest yield (Orange)
            </div>
          </div>
          <div className="h-48 w-full min-w-0">
            <ResponsiveContainer width="100%" height={192} minWidth={0}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eff6ff" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={compactUGX}
                  tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [
                    formatCurrency(Number(v) || 0, 'UGX'),
                    String(name ?? ''),
                  ]}
                  contentStyle={{
                    fontSize: '11px',
                    fontFamily: 'JetBrains Mono',
                    borderRadius: '8px',
                    borderColor: '#bfdbfe',
                    backgroundColor: '#ffffff',
                  }}
                />
                <Bar dataKey="principal" name="Principal" stackId="a" fill="#1d4ed8" />
                <Bar
                  dataKey="interest"
                  name="Interest Yield"
                  stackId="a"
                  fill="#ea580c"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Pie Chart: Capital & Yield Breakdown */}
        <div className="lg:col-span-4 min-w-0 flex flex-col justify-between">
          <div className="mb-2">
            <div className="text-xs font-semibold text-blue-950">
              03. Portfolio Capital Breakdown (Pie)
            </div>
            <div className="text-xs text-slate-500">
              Performing book, yield, collections & arrears
            </div>
          </div>
          <div className="grid grid-cols-12 items-center gap-2">
            <div className="col-span-6 h-44 min-w-0">
              <ResponsiveContainer width="100%" height={176} minWidth={0}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={32}
                    outerRadius={60}
                    paddingAngle={2}
                  >
                    {pieData.map((entry, idx) => (
                      <Cell key={entry.name} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: unknown, name: unknown) => [
                      formatCurrency(Number(v) || 0, 'UGX'),
                      String(name ?? ''),
                    ]}
                    contentStyle={{
                      fontSize: '11px',
                      fontFamily: 'JetBrains Mono',
                      borderRadius: '8px',
                      borderColor: '#bfdbfe',
                      backgroundColor: '#ffffff',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="col-span-6 space-y-2">
              {pieData.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-600 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                    />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="font-mono font-semibold text-slate-900 pl-1">
                    {compactUGX(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
