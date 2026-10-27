import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  LayoutDashboard,
  CalendarClock,
  Calculator,
  Bell,
  Users,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  LogOut,
  Database,
  ArrowUpRight,
  CreditCard,
  BarChart3,
  TrendingUp,
  Wallet,
  Banknote,
  Landmark,
  Building2,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutUser,
} from './firebase';
import {
  Borrower,
  CurrencyCode,
  DEFAULT_CORPORATE_WORKERS,
  Installment,
  InterestMethod,
  Loan,
  PaymentFrequency,
  parseLoanDisbursementState,
  Reminder,
  resolveWorkerPin,
  StaffMember,
  StaffRole,
  STAFF_ROLE_METADATA,
} from './types/loan';
import {
  computeInstallmentStatus,
  detectPendingReminders,
  formatCurrency,
} from './utils/loanEngine';
import { seedPristenHoldingsPortfolio } from './services/loanService';
import { InterestCalculatorView } from './components/InterestCalculatorView';
import { ScheduleLedgerView } from './components/ScheduleLedgerView';
import { RemindersCenterView } from './components/RemindersCenterView';
import { AnalyticsView } from './components/AnalyticsView';
import { OverviewChartsStrip } from './components/OverviewChartsStrip';
import {
  ExecutiveCooPasswordVault,
  FinanceDepartmentView,
  NewStaffModal,
  SalariesSectorView,
  StaffGovernanceView,
  TellerDisbursementView,
} from './components/OrganizationFinanceViews';
import {
  NewBorrowerModal,
  NewLoanModal,
  RecordPaymentModal,
  SendReminderModal,
} from './components/Modals';

type ActiveTab =
  | 'overview'
  | 'salaries'
  | 'finance'
  | 'staff'
  | 'teller_desk'
  | 'analytics'
  | 'schedules'
  | 'calculator'
  | 'reminders'
  | 'borrowers';

const ROLE_ALLOWED_TABS: Record<StaffRole, ActiveTab[]> = {
  executive_director: [
    'overview',
    'salaries',
    'finance',
    'staff',
    'teller_desk',
    'schedules',
    'analytics',
    'calculator',
    'reminders',
    'borrowers',
  ],
  coo: [
    'overview',
    'salaries',
    'staff',
    'teller_desk',
    'schedules',
    'analytics',
    'reminders',
    'borrowers',
    'calculator',
    'finance',
  ],
  // FINANCE ROLE RESTRICTION: Strictly limited to the financial bit of the business (including Salaries Sector & Client Loan Payout Approvals)
  cfo: ['finance', 'salaries', 'schedules', 'calculator'],
  finance_officer: ['finance', 'salaries', 'schedules', 'calculator'],
  // HUMAN RESOURCE (H.R.) DUTY: Dedicated to managing the staff
  hr: ['staff'],
  manager: [
    'overview',
    'salaries',
    'teller_desk',
    'schedules',
    'borrowers',
    'reminders',
    'calculator',
    'analytics',
  ],
  // SALES TEAM ON ANALYTICS: Centered on Performance Analytics
  sales_person: ['analytics', 'borrowers', 'calculator'],
  // STRICT TELLER CONSTRAINT: Tellers ONLY access the part for giving out loans
  teller: ['teller_desk'],
};

interface WorkerSession {
  fullName: string;
  role: StaffRole;
  employeeCode: string;
  pin: string;
}

const WORKER_SESSION_STORAGE_KEY = 'pristen_investments_worker_session_v2';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Worker Name + Unique Anonymous 4-Digit Password Session
  const [workerSession, setWorkerSession] = useState<WorkerSession | null>(() => {
    try {
      const saved = localStorage.getItem(WORKER_SESSION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as WorkerSession;
        if (
          parsed &&
          parsed.fullName &&
          parsed.role &&
          ROLE_ALLOWED_TABS[parsed.role]
        ) {
          return {
            ...parsed,
            pin: parsed.pin || resolveWorkerPin(parsed),
          };
        }
      }
    } catch {
      // Ignore storage errors
    }
    return null;
  });

  // Login Form State (Name & Unique Anonymous 4-Digit Password)
  const [loginWorkerName, setLoginWorkerName] = useState<string>('Joshua Ijoyi');
  const [loginRole, setLoginRole] = useState<StaffRole>('executive_director');
  const [loginPassword, setLoginPassword] = useState<string>('');

  const [activeRole, setActiveRole] = useState<StaffRole>(
    workerSession?.role || 'executive_director'
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    ROLE_ALLOWED_TABS[workerSession?.role || 'executive_director'][0]
  );
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [installmentsByLoan, setInstallmentsByLoan] = useState<Record<string, Installment[]>>({});
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [seeding, setSeeding] = useState<boolean>(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<{
    borrowerId: string;
    borrowerName: string;
    message: string;
  } | null>(null);

  // Filters & Selection
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'overdue' | 'paid_off'>('ALL');
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);

  // Modals State
  const [showNewBorrowerModal, setShowNewBorrowerModal] = useState<boolean>(false);
  const [showNewLoanModal, setShowNewLoanModal] = useState<boolean>(false);
  const [showNewStaffModal, setShowNewStaffModal] = useState<boolean>(false);
  const [initialStaffRole, setInitialStaffRole] = useState<StaffRole>('teller');
  const [preselectedBorrowerId, setPreselectedBorrowerId] = useState<string | null>(null);
  const [returnToLoanModal, setReturnToLoanModal] = useState<boolean>(false);
  const [loanPreset, setLoanPreset] = useState<{
    currency: CurrencyCode;
    principalAmount: number;
    annualInterestRate: number;
    interestMethod: InterestMethod;
    termMonths: number;
    paymentFrequency: PaymentFrequency;
    disbursementDate: string;
  } | null>(null);

  const [paymentModalTarget, setPaymentModalTarget] = useState<{
    loan: Loan;
    installment: Installment;
  } | null>(null);

  const [reminderModalTarget, setReminderModalTarget] = useState<{
    loan: Loan;
    installment: Installment;
  } | null>(null);

  const workspaceOwnerId = user?.uid || 'pristen_investments_corp';

  // 1. Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Enforce Role-Based Access Control (RBAC) Tab Guard
  useEffect(() => {
    const allowed = ROLE_ALLOWED_TABS[activeRole];
    if (!allowed.includes(activeTab)) {
      setActiveTab(allowed[0]);
    }
  }, [activeRole, activeTab]);

  const handleRoleSwitch = (nextRole: StaffRole, workerNameOverride?: string) => {
    setActiveRole(nextRole);
    const allowed = ROLE_ALLOWED_TABS[nextRole];
    if (!allowed.includes(activeTab)) {
      setActiveTab(allowed[0]);
    }
    if (workerSession) {
      const matchedStaff = staffMembers.find(
        (m) =>
          (workerNameOverride &&
            m.fullName.toLowerCase() === workerNameOverride.toLowerCase()) ||
          m.role === nextRole
      );
      const matchedPreset = DEFAULT_CORPORATE_WORKERS.find(
        (w) =>
          (workerNameOverride &&
            w.fullName.toLowerCase() === workerNameOverride.toLowerCase()) ||
          w.role === nextRole
      );
      const resolvedName =
        workerNameOverride ||
        matchedStaff?.fullName ||
        matchedPreset?.fullName ||
        workerSession.fullName;
      const resolvedCode =
        matchedStaff?.employeeCode ||
        matchedPreset?.employeeCode ||
        workerSession.employeeCode;
      const resolvedPin = matchedStaff
        ? resolveWorkerPin(matchedStaff)
        : matchedPreset?.pin ||
          resolveWorkerPin({
            fullName: resolvedName,
            employeeCode: resolvedCode,
            role: nextRole,
          });

      const updatedSession: WorkerSession = {
        fullName: resolvedName,
        role: nextRole,
        employeeCode: resolvedCode,
        pin: resolvedPin,
      };
      setWorkerSession(updatedSession);
      try {
        localStorage.setItem(
          WORKER_SESSION_STORAGE_KEY,
          JSON.stringify(updatedSession)
        );
      } catch {
        // Ignore storage errors
      }
    }
  };

  // 2. Real-Time Firestore Listeners (Staff always active so newly created workers can sign in; Borrowers/Loans/Reminders active when signed in)
  useEffect(() => {
    if (!authReady) return;

    const staffQuery = query(
      collection(db, 'staff'),
      where('ownerId', '==', workspaceOwnerId)
    );

    const unsubStaff = onSnapshot(
      staffQuery,
      (snap) => {
        const list: StaffMember[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<StaffMember, 'id'>),
        }));
        setStaffMembers(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'staff');
        } catch (formattedErr) {
          setWorkspaceError(
            formattedErr instanceof Error ? formattedErr.message : String(formattedErr)
          );
        }
      }
    );

    if (!workerSession) {
      setDataLoading(false);
      return () => {
        unsubStaff();
      };
    }

    setDataLoading(true);

    const borrowersQuery = query(
      collection(db, 'borrowers'),
      where('ownerId', '==', workspaceOwnerId)
    );
    const loansQuery = query(
      collection(db, 'loans'),
      where('ownerId', '==', workspaceOwnerId)
    );
    const remindersQuery = query(
      collection(db, 'reminders'),
      where('ownerId', '==', workspaceOwnerId)
    );

    const unsubBorrowers = onSnapshot(
      borrowersQuery,
      (snap) => {
        const list: Borrower[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Borrower, 'id'>),
        }));
        setBorrowers(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'borrowers');
        } catch (formattedErr) {
          setWorkspaceError(
            formattedErr instanceof Error ? formattedErr.message : String(formattedErr)
          );
        }
      }
    );

    const unsubLoans = onSnapshot(
      loansQuery,
      (snap) => {
        const list: Loan[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Loan, 'id'>),
        }));
        setLoans(list);
        if (list.length > 0 && !selectedLoanId) {
          setSelectedLoanId(list[0].id);
        }
        setDataLoading(false);
      },
      (err) => {
        setDataLoading(false);
        try {
          handleFirestoreError(err, OperationType.LIST, 'loans');
        } catch (formattedErr) {
          setWorkspaceError(
            formattedErr instanceof Error ? formattedErr.message : String(formattedErr)
          );
        }
      }
    );

    const unsubReminders = onSnapshot(
      remindersQuery,
      (snap) => {
        const list: Reminder[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Reminder, 'id'>),
        }));
        setReminders(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'reminders');
        } catch (formattedErr) {
          setWorkspaceError(
            formattedErr instanceof Error ? formattedErr.message : String(formattedErr)
          );
        }
      }
    );

    return () => {
      unsubBorrowers();
      unsubLoans();
      unsubReminders();
      unsubStaff();
    };
  }, [authReady, workerSession, workspaceOwnerId]);

  // 3. Subcollection Listeners for Installments of Each Loan
  useEffect(() => {
    if (!authReady || !workerSession || loans.length === 0) {
      setInstallmentsByLoan({});
      return;
    }

    const unsubs = loans.map((loan) => {
      const instQuery = query(
        collection(db, 'loans', loan.id, 'installments'),
        where('ownerId', '==', workspaceOwnerId)
      );
      return onSnapshot(
        instQuery,
        (snap) => {
          const items: Installment[] = snap.docs
            .map((d) => {
              const raw = d.data() as Omit<Installment, 'id'>;
              const liveStatus = computeInstallmentStatus(
                raw.dueDate,
                raw.amountPaid,
                raw.scheduledAmount,
                loan.reminderDaysBefore
              );
              return {
                id: d.id,
                ...raw,
                status: raw.status === 'paid' ? 'paid' : liveStatus,
              };
            })
            .sort((a, b) => a.installmentNumber - b.installmentNumber);

          setInstallmentsByLoan((prev) => ({
            ...prev,
            [loan.id]: items,
          }));
        },
        (err) => {
          try {
            handleFirestoreError(
              err,
              OperationType.LIST,
              `loans/${loan.id}/installments`
            );
          } catch (formattedErr) {
            setWorkspaceError(
              formattedErr instanceof Error ? formattedErr.message : String(formattedErr)
            );
          }
        }
      );
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, workerSession, workspaceOwnerId, loans]);

  // 4. Portfolio Metrics & Pending Automated Reminders
  const pendingReminders = useMemo(
    () => detectPendingReminders(loans, installmentsByLoan),
    [loans, installmentsByLoan]
  );

  const portfolioStats = useMemo(() => {
    const ugxLoans = loans.filter((l) => l.currency === 'UGX');
    const totalDisbursedUGX = ugxLoans.reduce((s, l) => s + l.principalAmount, 0);
    const totalOutstandingUGX = ugxLoans.reduce((s, l) => s + l.outstandingBalance, 0);
    const totalProjectedInterestUGX = ugxLoans.reduce(
      (s, l) => s + l.totalInterestProjected,
      0
    );
    const totalCollectedUGX = ugxLoans.reduce((s, l) => s + l.amountPaid, 0);
    const totalPayableUGX = ugxLoans.reduce((s, l) => s + l.totalPayable, 0);

    const collectionRate =
      totalPayableUGX > 0 ? Math.round((totalCollectedUGX / totalPayableUGX) * 100) : 0;

    const overdueLoansCount = loans.filter((l) => {
      const insts = installmentsByLoan[l.id] || [];
      return l.status === 'overdue' || insts.some((i) => i.status === 'overdue');
    }).length;

    return {
      totalDisbursedUGX,
      totalOutstandingUGX,
      totalProjectedInterestUGX,
      totalCollectedUGX,
      collectionRate,
      overdueLoansCount,
    };
  }, [loans, installmentsByLoan]);

  const filteredLoans = useMemo(() => {
    return loans.filter((loan) => {
      const insts = installmentsByLoan[loan.id] || [];
      const hasOverdueInst = insts.some((i) => i.status === 'overdue');
      const effectiveStatus =
        loan.status === 'paid_off'
          ? 'paid_off'
          : hasOverdueInst
          ? 'overdue'
          : loan.status;
      const matchesStatus =
        statusFilter === 'ALL' ? true : effectiveStatus === statusFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        loan.loanReference.toLowerCase().includes(q) ||
        loan.borrowerName.toLowerCase().includes(q) ||
        loan.purpose.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [loans, installmentsByLoan, statusFilter, searchQuery]);

  const handleWorkerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const trimmedName = loginWorkerName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setAuthError('Please enter your Worker Name.');
      return;
    }

    const enteredPin = loginPassword.trim();
    if (!/^\d{4}$/.test(enteredPin)) {
      setAuthError(
        'Please enter a valid 4-digit anonymous worker password.'
      );
      return;
    }

    // Match against Firestore staff roster first, then default corporate roster
    const matchedFirestoreWorker = staffMembers.find(
      (m) =>
        m.fullName.trim().toLowerCase() === trimmedName.toLowerCase() ||
        (m.role === loginRole && resolveWorkerPin(m) === enteredPin)
    );
    const matchedDefaultWorker = DEFAULT_CORPORATE_WORKERS.find(
      (w) =>
        w.fullName.trim().toLowerCase() === trimmedName.toLowerCase() ||
        (w.role === loginRole && w.pin === enteredPin) ||
        w.role === loginRole
    );

    const expectedPin = matchedFirestoreWorker
      ? resolveWorkerPin(matchedFirestoreWorker)
      : matchedDefaultWorker
      ? matchedDefaultWorker.pin
      : resolveWorkerPin({ fullName: trimmedName, role: loginRole });

    if (enteredPin !== expectedPin) {
      setAuthError(
        `Incorrect 4-digit password for ${trimmedName} (${STAFF_ROLE_METADATA[loginRole].shortTitle}). Please enter your assigned 4-digit password.`
      );
      return;
    }

    const session: WorkerSession = {
      fullName: trimmedName,
      role: loginRole,
      employeeCode:
        matchedFirestoreWorker?.employeeCode ||
        matchedDefaultWorker?.employeeCode ||
        'PHL-WK-100',
      pin: expectedPin,
    };

    setWorkerSession(session);
    setActiveRole(loginRole);
    setActiveTab(ROLE_ALLOWED_TABS[loginRole][0]);
    setLoginPassword('');

    try {
      localStorage.setItem(WORKER_SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Ignore storage errors
    }
  };

  const handleWorkerSignOut = async () => {
    setWorkerSession(null);
    setLoginPassword('');
    try {
      localStorage.removeItem(WORKER_SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    if (user) {
      await signOutUser();
    }
  };

  const handleSeedPortfolio = async () => {
    if (seeding) return;
    setSeeding(true);
    setWorkspaceError(null);
    try {
      await seedPristenHoldingsPortfolio(workspaceOwnerId);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error ? err.message : 'Unable to provision sample portfolio.'
      );
    } finally {
      setSeeding(false);
    }
  };

  const COMPANY_LOGO_URL =
    '/assets/aistudio/ChatGPT_Image_Oct_26__2026__10_17_22_PM_94815fc7.jpg';

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // ==========================================================================
  // Unauthenticated First Display: Company Logo, Company Name & Worker Name + 4-Digit Password Login (No PINs Shown)
  // ==========================================================================
  if (!workerSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 sm:p-10 shadow-2xl text-center space-y-6">
          <div className="mx-auto w-40 h-40 rounded-2xl overflow-hidden bg-black border border-amber-500/40 shadow-md flex items-center justify-center">
            <img
              src={COMPANY_LOGO_URL}
              alt="Pristen Investments Ltd Logo"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-display">
              Pristen Investments Ltd
            </h1>
            <p className="text-xs font-medium text-slate-500">
              Worker Sign In — Name &amp; 4-Digit Password
            </p>
          </div>

          {authError && (
            <div className="p-3.5 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg text-left">
              {authError}
            </div>
          )}

          <form onSubmit={handleWorkerLogin} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Select Worker Duty / Role
              </label>
              <select
                value={loginRole}
                onChange={(e) => {
                  const nextRole = e.target.value as StaffRole;
                  setLoginRole(nextRole);
                  setAuthError(null);
                  const preset = DEFAULT_CORPORATE_WORKERS.find(
                    (w) => w.role === nextRole
                  );
                  if (preset) {
                    setLoginWorkerName(preset.fullName);
                  }
                }}
                className="w-full px-3 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="executive_director">
                  Executive Director — Joshua Ijoyi
                </option>
                <option value="coo">
                  Chief Operating Officer (C.O.O.) — Grace Namusisi
                </option>
                <option value="cfo">
                  Chief Financial Officer (C.F.O.) — CPA Ronald Mugisha
                </option>
                <option value="finance_officer">
                  Finance Officer — Prossy Katusiime
                </option>
                <option value="hr">
                  Human Resource (H.R.) — Diana Nakato
                </option>
                <option value="manager">
                  Branch / Credit Manager — Denis Otim
                </option>
                <option value="sales_person">
                  Sales Team (Analytics) — Brenda Akello
                </option>
                <option value="teller">
                  Teller (Give Out Loans Only) — Mercy Nabukeera
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Worker Name
              </label>
              <input
                type="text"
                required
                value={loginWorkerName}
                onChange={(e) => setLoginWorkerName(e.target.value)}
                placeholder="Enter worker full name..."
                className="w-full px-3.5 py-2.5 text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                4-Digit Password
              </label>
              <input
                type="password"
                required
                maxLength={4}
                value={loginPassword}
                onChange={(e) =>
                  setLoginPassword(e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                placeholder="Enter your 4-digit password"
                className="w-full px-3.5 py-2.5 text-sm font-mono tracking-widest bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
              />
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-700 rounded-xl hover:bg-blue-800 transition-colors cursor-pointer"
            >
              <span>Sign In to Workspace</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Authenticated SaaS Workspace Canvas (Sidebar + Contextual Top Bar + Viewport)
  // ==========================================================================
  const allNavItems: {
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }[] = [
    { id: 'overview', label: 'Portfolio Overview', icon: LayoutDashboard },
    {
      id: 'salaries',
      label: 'Salaries Sector',
      icon: Wallet,
    },
    {
      id: 'teller_desk',
      label: 'Give Out Loans (Teller Desk)',
      icon: Banknote,
    },
    {
      id: 'finance',
      label: 'Finance Dept (C.F.O.)',
      icon: Landmark,
    },
    {
      id: 'staff',
      label: 'Human Resource & Staff',
      icon: Building2,
      count: staffMembers.length,
    },
    { id: 'analytics', label: 'Performance Analytics', icon: BarChart3 },
    {
      id: 'schedules',
      label: 'Payment Schedules',
      icon: CalendarClock,
      count: loans.length,
    },
    { id: 'calculator', label: 'Interest Simulator', icon: Calculator },
    {
      id: 'reminders',
      label: 'Automated Reminders',
      icon: Bell,
      count: pendingReminders.length,
    },
    {
      id: 'borrowers',
      label: 'Borrower Registry',
      icon: Users,
      count: borrowers.length,
    },
  ];

  const allowedTabsForRole = ROLE_ALLOWED_TABS[activeRole];
  const navItems = allNavItems.filter((item) =>
    allowedTabsForRole.includes(item.id)
  );

  const activeNavLabel =
    navItems.find((n) => n.id === activeTab)?.label ||
    (activeRole === 'teller'
      ? 'Give Out Loans (Teller Desk)'
      : activeRole === 'cfo' || activeRole === 'finance_officer'
      ? 'Finance Dept (C.F.O.)'
      : activeRole === 'sales_person'
      ? 'Performance Analytics'
      : activeRole === 'hr'
      ? 'Human Resource & Staff'
      : 'Portfolio Overview');

  const signedInUserName = workerSession.fullName || 'Executive Officer';
  const currentRoleMeta = STAFF_ROLE_METADATA[activeRole];
  const isFinanceRole = activeRole === 'cfo' || activeRole === 'finance_officer';
  const isHrRole = activeRole === 'hr';
  const isSalesRole = activeRole === 'sales_person';
  const isExecOrCooRole =
    activeRole === 'executive_director' || activeRole === 'coo';

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col lg:flex-row">
      {/* Left Sidebar Navigation (260px) */}
      <aside className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-blue-100 shrink-0 flex flex-col justify-between">
        <div>
          {/* Brand Header with Company Logo */}
          <div className="px-5 py-5 border-b border-blue-100 flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-black border border-amber-500/40 shrink-0 shadow-xs">
              <img
                src={COMPANY_LOGO_URL}
                alt="Pristen Logo"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight text-blue-950 font-display truncate">
                Pristen Investments Ltd
              </div>
              <div className="text-xs font-medium text-amber-600 mt-0.5 truncate">
                {currentRoleMeta.shortTitle}
              </div>
            </div>
          </div>

          {activeRole === 'teller' && (
            <div className="mx-3 mt-3 p-3 rounded-lg bg-orange-50 border border-orange-200 text-xs text-orange-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-orange-800">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>Teller Counter Mode</span>
              </div>
              <p className="text-orange-700 leading-snug">
                Restricted strictly to giving out loans.
              </p>
            </div>
          )}

          {isFinanceRole && (
            <div className="mx-3 mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-blue-800">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>Finance Department Scope</span>
              </div>
              <p className="text-blue-700 leading-snug">
                Limited strictly to financial operations, schedules, and interest computation.
              </p>
            </div>
          )}

          {isSalesRole && (
            <div className="mx-3 mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                <span>Sales Analytics Desk</span>
              </div>
              <p className="text-emerald-700 leading-snug">
                Focused on Performance Analytics, Borrower KYC, and Interest Simulation.
              </p>
            </div>
          )}

          {isHrRole && (
            <div className="mx-3 mt-3 p-3 rounded-lg bg-purple-50 border border-purple-200 text-xs text-purple-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-purple-800">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Human Resource (H.R.)</span>
              </div>
              <p className="text-purple-700 leading-snug">
                Dedicated duty to manage company staff, roles, and worker onboarding.
              </p>
            </div>
          )}

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-blue-50/70 hover:text-blue-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-orange-300' : 'text-blue-600'
                      }`}
                    />
                    <span>{item.label}</span>
                  </span>
                  {typeof item.count === 'number' && item.count > 0 && (
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        isActive ? 'text-orange-200 font-bold' : 'text-orange-600 font-semibold'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Account Footer */}
        <div className="p-4 border-t border-blue-100 space-y-3">
          <div className="px-2">
            <div className="text-xs font-semibold text-slate-900 truncate">
              {signedInUserName}
            </div>
            <div className="text-xs text-blue-700 font-semibold truncate">
              {currentRoleMeta.label}
            </div>
            <div className="text-xs text-slate-500 truncate font-mono">
              ID: {workerSession.employeeCode} ·{' '}
              {isExecOrCooRole ? `PIN: ${workerSession.pin}` : 'PIN: ••••'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleWorkerSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out Worker
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Workspace Header (Breadcrumb on Left, Role Switcher & Primary Actions on Right) */}
        <header className="bg-white border-b border-blue-100 px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs text-slate-500 whitespace-nowrap overflow-x-auto">
            <img
              src={COMPANY_LOGO_URL}
              alt="Pristen Logo"
              className="w-7 h-7 rounded-md object-cover bg-black border border-amber-500/40 shrink-0"
            />
            <span className="font-semibold text-blue-950">Pristen Investments Ltd</span>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-slate-700">{currentRoleMeta.department}</span>
            <span aria-hidden="true">/</span>
            <span className="font-semibold text-orange-600">{activeNavLabel}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Active Role Switcher so Executive/Tester can verify Teller, Finance, Sales, HR & Executive Views */}
            <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1">
              <span className="text-xs font-semibold text-slate-500">Role:</span>
              <select
                value={activeRole}
                onChange={(e) => handleRoleSwitch(e.target.value as StaffRole)}
                className="text-xs font-bold text-blue-900 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="executive_director">
                  Executive Director (Displays All Worker PINs)
                </option>
                <option value="coo">
                  C.O.O. (Displays All Worker PINs)
                </option>
                <option value="cfo">C.F.O. (Finance Only)</option>
                <option value="finance_officer">Finance Officer (Finance Only)</option>
                <option value="hr">Human Resource (Manage Staff)</option>
                <option value="manager">Manager</option>
                <option value="sales_person">Sales Team (Analytics)</option>
                <option value="teller">Teller (Give Out Loans Only)</option>
              </select>
            </div>

            {isHrRole ? (
              <button
                type="button"
                onClick={() => {
                  setInitialStaffRole('teller');
                  setShowNewStaffModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Provision Worker (4-Digit PIN)
              </button>
            ) : !isFinanceRole ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setReturnToLoanModal(false);
                    setShowNewBorrowerModal(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-700" />
                  Register Borrower
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activeRole === 'teller') {
                      setActiveTab('teller_desk');
                    } else {
                      setLoanPreset(null);
                      setPreselectedBorrowerId(null);
                      setShowNewLoanModal(true);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {activeRole === 'teller' ? 'Give Out Loan' : 'Originate Loan'}
                </button>
              </>
            ) : null}
          </div>
        </header>

        {/* Main Viewport Content */}
        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8">
          {/* Personalized Signed-In Officer Greeting Banner */}
          <div className="bg-slate-950 text-white border border-amber-500/30 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-black border border-amber-400/50 shrink-0">
                <img
                  src={COMPANY_LOGO_URL}
                  alt="Pristen Investments Ltd"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-400 tracking-wide uppercase font-mono">
                  <span>
                    {getTimeGreeting()}, {signedInUserName}
                  </span>
                  <span>·</span>
                  <span className="px-2 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30">
                    {currentRoleMeta.label}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white font-display">
                  {activeRole === 'teller'
                    ? 'Pristen Investments Ltd — Teller Loan Disbursement Desk'
                    : isFinanceRole
                    ? 'Pristen Investments Ltd — Finance Department (Financial Operations Only)'
                    : isSalesRole
                    ? 'Pristen Investments Ltd — Sales Team Performance Analytics'
                    : isHrRole
                    ? 'Pristen Investments Ltd — Human Resource (Staff Management)'
                    : activeRole === 'coo'
                    ? 'Pristen Investments Ltd — Chief Operating Officer (C.O.O.) Desk'
                    : 'Pristen Investments Ltd — Executive Director Desk'}
                </h2>
                <p className="text-xs text-slate-300">
                  {currentRoleMeta.permissionsSummary} · Standard Monthly Rate:{' '}
                  <span className="text-amber-400 font-mono font-semibold">
                    12% / month
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono shrink-0">
              <div className="px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 text-right">
                <div className="text-slate-400">Borrowers</div>
                <div className="text-sm font-bold text-amber-400">{borrowers.length}</div>
              </div>
              <div className="px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 text-right">
                <div className="text-slate-400">Active Loans</div>
                <div className="text-sm font-bold text-white">{loans.length}</div>
              </div>
              {activeRole !== 'teller' && (
                <div className="px-3.5 py-2 rounded-lg bg-white/5 border border-white/10 text-right">
                  <div className="text-slate-400">Staff Roster</div>
                  <div className="text-sm font-bold text-emerald-400">
                    {staffMembers.length || DEFAULT_CORPORATE_WORKERS.length}
                  </div>
                </div>
              )}
            </div>
          </div>
          {workspaceError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3.5 flex items-center justify-between gap-4 text-xs text-red-900 font-mono break-all">
              <span>{workspaceError}</span>
              <button
                type="button"
                onClick={() => setWorkspaceError(null)}
                className="px-2.5 py-1 font-sans font-semibold text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-100 shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}
          {workspaceNotice && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs text-emerald-950">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{workspaceNotice.message}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setPreselectedBorrowerId(workspaceNotice.borrowerId);
                    setLoanPreset(null);
                    setShowNewLoanModal(true);
                    setWorkspaceNotice(null);
                  }}
                  className="px-3 py-1.5 font-semibold text-white bg-orange-600 rounded-md hover:bg-orange-700 transition-colors"
                >
                  Originate Loan for {workspaceNotice.borrowerName}
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceNotice(null)}
                  className="px-2.5 py-1.5 font-semibold text-emerald-800 bg-white border border-emerald-200 rounded-md hover:bg-emerald-100"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          {dataLoading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
              <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
              <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
              <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
            </div>
          ) : (
            <>
              {/* TAB 1: PORTFOLIO OVERVIEW (AND EXECUTIVE DIRECTOR / C.O.O. DESK PASSWORD VAULT) */}
              {activeTab === 'overview' && (
                <div className="space-y-8">
                  {/* EXECUTIVE DIRECTOR & C.O.O. DESK: Display All Workers' Anonymous 4-Digit Passwords */}
                  {isExecOrCooRole && (
                    <ExecutiveCooPasswordVault
                      activeRole={activeRole}
                      staffMembers={staffMembers}
                      onSwitchRole={(role, workerName) =>
                        handleRoleSwitch(role, workerName)
                      }
                      onOpenNewStaffModal={(defaultRole) => {
                        setInitialStaffRole(defaultRole || 'teller');
                        setShowNewStaffModal(true);
                      }}
                    />
                  )}

                  {/* 4-Column Executive KPI Strip */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white border border-blue-100 rounded-xl p-5 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                        <span>Total Portfolio Disbursed</span>
                        <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                          <Wallet className="w-4 h-4" />
                        </span>
                      </div>
                      <div className="text-xl font-bold font-mono tabular-nums text-blue-700 mt-2">
                        {formatCurrency(portfolioStats.totalDisbursedUGX, 'UGX')}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 font-mono">
                        {loans.length} Active & Historical Facilities
                      </div>
                    </div>

                    <div className="bg-white border border-blue-100 rounded-xl p-5 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                        <span>Outstanding Principal & Interest</span>
                        <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                          <CreditCard className="w-4 h-4" />
                        </span>
                      </div>
                      <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-2">
                        {formatCurrency(portfolioStats.totalOutstandingUGX, 'UGX')}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 font-mono">
                        Collected: <span className="text-blue-700 font-semibold">{formatCurrency(portfolioStats.totalCollectedUGX, 'UGX')}</span> ({portfolioStats.collectionRate}%)
                      </div>
                    </div>

                    <div className="bg-white border border-orange-100 rounded-xl p-5 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                        <span>Projected Interest Yield</span>
                        <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                          <TrendingUp className="w-4 h-4" />
                        </span>
                      </div>
                      <div className="text-xl font-bold font-mono tabular-nums text-orange-600 mt-2">
                        {formatCurrency(portfolioStats.totalProjectedInterestUGX, 'UGX')}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Reducing Balance & Flat Rate Yield
                      </div>
                    </div>

                    <div className="bg-white border border-orange-100 rounded-xl p-5 shadow-2xs">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                        <span>Pending Automated Reminders</span>
                        <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                          <Bell className="w-4 h-4" />
                        </span>
                      </div>
                      <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-2">
                        {pendingReminders.length} Actionable
                      </div>
                      <div className="text-xs text-orange-600 font-medium mt-1">
                        {portfolioStats.overdueLoansCount} Overdue Facilit
                        {portfolioStats.overdueLoansCount === 1 ? 'y' : 'ies'}
                      </div>
                    </div>
                  </div>

                  {/* Embedded Executive Charts Strip (Line, Bar, and Pie Charts) */}
                  <OverviewChartsStrip
                    loans={loans}
                    installmentsByLoan={installmentsByLoan}
                    onOpenFullAnalytics={() => setActiveTab('analytics')}
                  />

                  {/* Empty State with 1-Click Sample Portfolio Loader */}
                  {loans.length === 0 ? (
                    <div className="bg-white border border-blue-100 rounded-xl p-10 text-center space-y-4 shadow-2xs">
                      <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center mx-auto">
                        <Database className="w-5 h-5" />
                      </div>
                      <div className="max-w-lg mx-auto space-y-1.5">
                        <h3 className="text-base font-bold text-slate-900">
                          {borrowers.length > 0
                            ? `${borrowers.length} Borrower${borrowers.length === 1 ? '' : 's'} Registered — Ready to Originate Loan`
                            : 'Your Pristen Investments Ltd Ledger is Ready'}
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-600">
                          {borrowers.length > 0
                            ? 'You have registered borrower profiles in the directory. You can now originate a loan facility for your registered clients or view the Borrower Registry.'
                            : 'Start by registering a client and originating a loan facility, or load our pre-configured Uganda commercial credit portfolio (including active, due-today, and overdue installments) to populate live schedules, analytics, and automated reminders immediately.'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                        {borrowers.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setLoanPreset(null);
                                setPreselectedBorrowerId(borrowers[0].id);
                                setShowNewLoanModal(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Originate Loan Facility
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveTab('borrowers')}
                              className="px-4 py-2.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                              View Registered Borrowers ({borrowers.length})
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={seeding}
                          onClick={handleSeedPortfolio}
                          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-50 transition-colors"
                        >
                          <Database className="w-3.5 h-3.5" />
                          {seeding
                            ? 'Provisioning Sample Portfolio...'
                            : 'Load Sample Pristen Investments Ltd Portfolio'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReturnToLoanModal(false);
                            setShowNewBorrowerModal(true);
                          }}
                          className="px-4 py-2.5 text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
                        >
                          {borrowers.length > 0
                            ? 'Register Another Borrower'
                            : 'Register First Borrower Manually'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Urgent Repayment & Reminder Action Strip */}
                      {pendingReminders.length > 0 && (
                        <div className="bg-white border border-orange-200 rounded-xl overflow-hidden shadow-2xs">
                          <div className="px-6 py-4 bg-orange-50/40 border-b border-orange-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-semibold text-slate-900">
                                Priority Repayment & Reminder Queue ({pendingReminders.length})
                              </h3>
                              <p className="text-xs text-slate-500">
                                Installments currently overdue, due today, or within their automated pre-due reminder window
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setActiveTab('reminders')}
                              className="text-xs font-semibold text-orange-600 hover:text-orange-700 hover:underline whitespace-nowrap"
                            >
                              Open Automated Reminder Center →
                            </button>
                          </div>

                          <div className="divide-y divide-slate-100">
                            {pendingReminders.slice(0, 4).map((cand) => {
                              const remainingDue = Math.max(
                                0,
                                cand.installment.scheduledAmount - cand.installment.amountPaid
                              );
                              return (
                                <div
                                  key={`${cand.loan.id}_${cand.installment.id}`}
                                  className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-blue-50/30 transition-colors"
                                >
                                  <div className="space-y-0.5">
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                      {cand.triggerType === 'Overdue Escalation' ? (
                                        <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                                          <AlertTriangle className="w-3.5 h-3.5" />
                                          Overdue ({Math.abs(cand.daysDelta)}d)
                                        </span>
                                      ) : cand.triggerType === 'Due Today' ? (
                                        <span className="inline-flex items-center gap-1 font-semibold text-orange-600">
                                          <Clock className="w-3.5 h-3.5" />
                                          Due Today
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 font-semibold text-blue-700">
                                          <Clock className="w-3.5 h-3.5" />
                                          Due in {cand.daysDelta}d
                                        </span>
                                      )}
                                      <span aria-hidden="true">·</span>
                                      <span className="font-mono text-blue-700 font-medium">
                                        {cand.loan.loanReference}
                                      </span>
                                      <span aria-hidden="true">·</span>
                                      <span className="font-semibold text-slate-900">
                                        {cand.loan.borrowerName}
                                      </span>
                                    </div>
                                    <div className="text-xs text-slate-500 font-mono">
                                      Installment #{cand.installment.installmentNumber} · Due{' '}
                                      {cand.installment.dueDate} · Amount:{' '}
                                      <strong className="text-orange-600">
                                        {formatCurrency(remainingDue, cand.loan.currency)}
                                      </strong>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPaymentModalTarget({
                                          loan: cand.loan,
                                          installment: cand.installment,
                                        })
                                      }
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 whitespace-nowrap shrink-0"
                                    >
                                      <CreditCard className="w-3 h-3" />
                                      Record Payment
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setReminderModalTarget({
                                          loan: cand.loan,
                                          installment: cand.installment,
                                        })
                                      }
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 whitespace-nowrap shrink-0"
                                    >
                                      <Bell className="w-3 h-3" />
                                      Send Reminder
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Active Loan Facility Ledger */}
                      <div className="bg-white border border-blue-100 rounded-xl overflow-hidden shadow-2xs">
                        <div className="px-6 py-4 border-b border-blue-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900">
                              Active Loan Facility Ledger ({filteredLoans.length})
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Click any facility row to inspect its full amortization schedule and payment history
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            {/* Search Input */}
                            <div className="relative">
                              <Search className="w-3.5 h-3.5 text-blue-500 absolute left-3 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search borrower or ref..."
                                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                              />
                            </div>

                            {/* Interactive Filter Tabs */}
                            <div className="flex items-center gap-1 p-1 bg-blue-50/80 border border-blue-100 rounded-lg">
                              {(
                                [
                                  { id: 'ALL', label: 'All' },
                                  { id: 'active', label: 'Active' },
                                  { id: 'overdue', label: 'Overdue' },
                                  { id: 'paid_off', label: 'Paid Off' },
                                ] as const
                              ).map((f) => (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={() => setStatusFilter(f.id)}
                                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                                    statusFilter === f.id
                                      ? 'bg-blue-700 text-white shadow-xs'
                                      : 'text-slate-600 hover:text-blue-800'
                                  }`}
                                >
                                  {f.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead className="bg-blue-50/70 border-b border-blue-100 text-xs font-semibold text-blue-950">
                              <tr>
                                <th className="py-3 px-5">Facility & Borrower</th>
                                <th className="py-3 px-4">Interest Terms</th>
                                <th className="py-3 px-4 text-right">Principal</th>
                                <th className="py-3 px-4 text-right">Total Interest</th>
                                <th className="py-3 px-4 text-right">Outstanding</th>
                                <th className="py-3 px-4">Schedule Progress</th>
                                <th className="py-3 px-5 text-right">Status & Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm">
                              {filteredLoans.map((loan) => {
                                const insts = installmentsByLoan[loan.id] || [];
                                const hasOverdueInst = insts.some(
                                  (i) => i.status === 'overdue'
                                );
                                const effectiveStatus =
                                  loan.status === 'paid_off'
                                    ? 'paid_off'
                                    : hasOverdueInst
                                    ? 'overdue'
                                    : loan.status;
                                const progressPct =
                                  loan.totalPayable > 0
                                    ? Math.min(
                                        100,
                                        Math.round((loan.amountPaid / loan.totalPayable) * 100)
                                      )
                                    : 0;

                                return (
                                  <tr
                                    key={loan.id}
                                    onClick={() => {
                                      setSelectedLoanId(loan.id);
                                      setActiveTab('schedules');
                                    }}
                                    className="cursor-pointer hover:bg-blue-50/40 transition-colors"
                                  >
                                    <td className="py-3.5 px-5">
                                      <div className="font-semibold text-slate-900">
                                        {loan.borrowerName}
                                      </div>
                                      <div className="text-xs text-slate-500 font-mono">
                                        <span className="text-blue-700 font-medium">{loan.loanReference}</span> · {loan.borrowerPhone}
                                      </div>
                                    </td>
                                    <td className="py-3.5 px-4">
                                      <div className="text-xs font-mono font-semibold text-orange-600">
                                        {loan.annualInterestRate}% / month
                                      </div>
                                      <div className="text-xs text-slate-500">
                                        {loan.interestMethod === 'reducing_balance'
                                          ? 'Reducing Balance'
                                          : loan.interestMethod === 'flat_rate'
                                          ? 'Flat Rate'
                                          : 'Interest-Only'}{' '}
                                        · {loan.termMonths}m
                                      </div>
                                    </td>
                                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-blue-700 font-medium whitespace-nowrap">
                                      {formatCurrency(loan.principalAmount, loan.currency)}
                                    </td>
                                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-orange-600 font-medium whitespace-nowrap">
                                      {formatCurrency(loan.totalInterestProjected, loan.currency)}
                                    </td>
                                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                                      {formatCurrency(loan.outstandingBalance, loan.currency)}
                                    </td>
                                    <td className="py-3.5 px-4 min-w-[150px]">
                                      <div className="flex items-center justify-between text-xs font-mono text-slate-700 mb-1">
                                        <span>
                                          {loan.paidInstallmentsCount}/{loan.installmentsCount} Paid
                                        </span>
                                        <span className="text-blue-700 font-semibold">{progressPct}%</span>
                                      </div>
                                      <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-blue-600 rounded-full"
                                          style={{ width: `${progressPct}%` }}
                                        />
                                      </div>
                                      <div className="text-xs text-slate-500 font-mono mt-1">
                                        Next: {loan.status === 'paid_off' ? 'Settled' : loan.nextDueDate}
                                      </div>
                                    </td>
                                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                                      <div className="inline-flex items-center gap-3">
                                        {
                                          parseLoanDisbursementState(loan)
                                            .payoutStatus ===
                                          'pending_finance_payout' ? (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                                              <Clock className="w-3.5 h-3.5" />
                                              Pending Finance Payout
                                            </span>
                                          ) : effectiveStatus === 'paid_off' ? (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                              <CheckCircle2 className="w-3.5 h-3.5" />
                                              Paid Off
                                            </span>
                                          ) : effectiveStatus === 'overdue' ? (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                                              <AlertTriangle className="w-3.5 h-3.5" />
                                              Overdue
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                                              <CheckCircle2 className="w-3.5 h-3.5" />
                                              Sent to Client
                                            </span>
                                          )
                                        }
                                        <span className="text-xs font-semibold text-orange-600 underline">
                                          Schedule →
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}

                  {/* SALARIES SECTOR ON EXECUTIVE DIRECTOR, C.O.O., AND MANAGER PAGES */}
                  {(activeRole === 'executive_director' ||
                    activeRole === 'coo' ||
                    activeRole === 'manager') && (
                    <SalariesSectorView
                      ownerId={workspaceOwnerId}
                      activeRole={activeRole}
                      staffMembers={staffMembers}
                      onSwitchRole={(role, workerName) =>
                        handleRoleSwitch(role, workerName)
                      }
                    />
                  )}
                </div>
              )}

              {/* DEDICATED TAB: SALARIES SECTOR (FINANCE, MANAGER, C.O.O., EXECUTIVE DIRECTOR) */}
              {activeTab === 'salaries' &&
                (activeRole === 'executive_director' ||
                  activeRole === 'coo' ||
                  activeRole === 'manager' ||
                  activeRole === 'cfo' ||
                  activeRole === 'finance_officer') && (
                  <SalariesSectorView
                    ownerId={workspaceOwnerId}
                    activeRole={activeRole}
                    staffMembers={staffMembers}
                    onSwitchRole={(role, workerName) =>
                      handleRoleSwitch(role, workerName)
                    }
                  />
                )}

              {/* TAB 2: PERFORMANCE ANALYTICS (LINE, BAR, PIE CHARTS) */}
              {activeTab === 'analytics' && (
                <AnalyticsView
                  loans={loans}
                  borrowers={borrowers}
                  installmentsByLoan={installmentsByLoan}
                  reminders={reminders}
                />
              )}

              {/* TAB 3: PAYMENT SCHEDULES & AMORTIZATION LEDGER */}
              {activeTab === 'schedules' && (
                <ScheduleLedgerView
                  loans={loans}
                  selectedLoanId={selectedLoanId}
                  onSelectLoan={(id) => setSelectedLoanId(id)}
                  installmentsByLoan={installmentsByLoan}
                  onOpenPaymentModal={(loan, installment) =>
                    setPaymentModalTarget({ loan, installment })
                  }
                  onOpenReminderModal={(loan, installment) =>
                    setReminderModalTarget({ loan, installment })
                  }
                />
              )}

              {/* TAB 4: INTEREST & AMORTIZATION SIMULATOR */}
              {activeTab === 'calculator' && (
                <InterestCalculatorView
                  onOriginateFromCalc={(preset) => {
                    setLoanPreset(preset);
                    setShowNewLoanModal(true);
                  }}
                />
              )}

              {/* TAB 5: AUTOMATED REMINDERS CENTER */}
              {activeTab === 'reminders' && (
                <RemindersCenterView
                  ownerId={workspaceOwnerId}
                  pendingCandidates={pendingReminders}
                  reminders={reminders}
                  onOpenCustomReminder={(loan, installment) =>
                    setReminderModalTarget({ loan, installment })
                  }
                />
              )}

              {/* TAB 6: BORROWER DIRECTORY & KYC REGISTRY */}
              {activeTab === 'borrowers' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-blue-100 pb-5">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                        Borrower KYC & Collateral Registry ({borrowers.length})
                      </h2>
                      <p className="text-sm text-slate-600 mt-1">
                        Verified corporate and individual borrowers registered with Pristen Investments Ltd.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setReturnToLoanModal(false);
                        setShowNewBorrowerModal(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Borrower Profile
                    </button>
                  </div>

                  {borrowers.length === 0 ? (
                    <div className="bg-white border border-blue-100 rounded-xl p-10 text-center space-y-3 shadow-2xs">
                      <p className="text-sm font-medium text-slate-800">
                        No borrowers registered yet.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setReturnToLoanModal(false);
                          setShowNewBorrowerModal(true);
                        }}
                        className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800"
                      >
                        Register First Borrower
                      </button>
                    </div>
                  ) : (
                    <div className="bg-white border border-blue-100 rounded-xl overflow-hidden shadow-2xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-blue-50/70 border-b border-blue-100 text-xs font-semibold text-blue-950">
                            <tr>
                              <th className="py-3 px-5">Legal Entity / Name</th>
                              <th className="py-3 px-4">NIN / URSB Reg & Tier</th>
                              <th className="py-3 px-4">Contact & Address</th>
                              <th className="py-3 px-4 text-right">Monthly Cashflow</th>
                              <th className="py-3 px-5">Pledged Collateral</th>
                              <th className="py-3 px-5 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-sm">
                            {borrowers.map((b) => (
                              <tr key={b.id} className="hover:bg-blue-50/40 transition-colors">
                                <td className="py-3.5 px-5">
                                  <div className="font-semibold text-slate-900">
                                    {b.fullName}
                                  </div>
                                  <div className="text-xs text-orange-600 font-medium">
                                    {b.occupationOrSector}
                                  </div>
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="font-mono text-xs font-medium text-blue-700">
                                    {b.nationalIdOrRegNo}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    Tier: <span className="font-semibold text-slate-800">{b.creditTier}</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="font-mono text-xs text-slate-800">
                                    {b.phone} · {b.email}
                                  </div>
                                  <div className="text-xs text-slate-500">{b.address}</div>
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-blue-700 whitespace-nowrap">
                                  {formatCurrency(b.monthlyIncomeUGX, 'UGX')}
                                </td>
                                <td className="py-3.5 px-5 max-w-xs">
                                  <p className="text-xs text-slate-600 line-clamp-2">
                                    {b.collateralSummary}
                                  </p>
                                </td>
                                <td className="py-3.5 px-5 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPreselectedBorrowerId(b.id);
                                      setLoanPreset(null);
                                      setShowNewLoanModal(true);
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-orange-600 rounded-md hover:bg-orange-700 transition-colors"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Originate Loan
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* TAB: TELLER LOAN DISBURSEMENT DESK (GIVING OUT LOANS) */}
              {activeTab === 'teller_desk' && (
                <TellerDisbursementView
                  ownerId={workspaceOwnerId}
                  activeRole={activeRole}
                  signedInWorkerName={signedInUserName}
                  borrowers={borrowers}
                  loans={loans}
                  onOpenNewBorrower={() => {
                    setReturnToLoanModal(false);
                    setShowNewBorrowerModal(true);
                  }}
                  onDisbursed={(newLoanId) => {
                    setSelectedLoanId(newLoanId);
                  }}
                />
              )}

              {/* TAB: FINANCE DEPARTMENT (HEADED BY THE C.F.O.) */}
              {activeTab === 'finance' && activeRole !== 'teller' && (
                <FinanceDepartmentView
                  ownerId={workspaceOwnerId}
                  activeRole={activeRole}
                  signedInWorkerName={signedInUserName}
                  loans={loans}
                  installmentsByLoan={installmentsByLoan}
                  staffMembers={staffMembers}
                  onSelectLoanForSchedule={(loanId) => {
                    setSelectedLoanId(loanId);
                    setActiveTab('schedules');
                  }}
                  onOpenCalculator={() => setActiveTab('calculator')}
                  onSwitchRole={(role, workerName) =>
                    handleRoleSwitch(role, workerName)
                  }
                />
              )}

              {/* TAB: HUMAN RESOURCE (H.R.) — STAFF & WORKER MANAGEMENT */}
              {activeTab === 'staff' && activeRole !== 'teller' && (
                <StaffGovernanceView
                  ownerId={workspaceOwnerId}
                  staffMembers={staffMembers}
                  activeRole={activeRole}
                  onSwitchRole={(role, workerName) =>
                    handleRoleSwitch(role, workerName)
                  }
                  onOpenNewStaffModal={(defaultRole) => {
                    setInitialStaffRole(defaultRole || 'teller');
                    setShowNewStaffModal(true);
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* MODALS */}
      {showNewStaffModal && (
        <NewStaffModal
          ownerId={workspaceOwnerId}
          initialRole={initialStaffRole}
          onClose={() => setShowNewStaffModal(false)}
        />
      )}

      {showNewBorrowerModal && (
        <NewBorrowerModal
          ownerId={workspaceOwnerId}
          onClose={() => {
            setShowNewBorrowerModal(false);
            setReturnToLoanModal(false);
          }}
          onCreated={(newBorrowerId, newBorrowerName) => {
            setShowNewBorrowerModal(false);
            setPreselectedBorrowerId(newBorrowerId);
            setWorkspaceNotice({
              borrowerId: newBorrowerId,
              borrowerName: newBorrowerName,
              message: `Borrower "${newBorrowerName}" has been registered in the Credit Ledger.`,
            });
            if (returnToLoanModal) {
              setReturnToLoanModal(false);
              setShowNewLoanModal(true);
            } else if (activeRole === 'teller') {
              setActiveTab('teller_desk');
            } else {
              setActiveTab('borrowers');
            }
          }}
        />
      )}

      {showNewLoanModal && (
        <NewLoanModal
          ownerId={workspaceOwnerId}
          borrowers={borrowers}
          initialBorrowerId={preselectedBorrowerId}
          initialPreset={loanPreset}
          onClose={() => setShowNewLoanModal(false)}
          onCreated={(newLoanId) => {
            setSelectedLoanId(newLoanId);
            if (activeRole === 'teller') {
              setActiveTab('teller_desk');
            } else {
              setActiveTab('schedules');
            }
          }}
          onOpenNewBorrower={() => {
            setReturnToLoanModal(true);
            setShowNewBorrowerModal(true);
          }}
        />
      )}

      {paymentModalTarget && (
        <RecordPaymentModal
          ownerId={workspaceOwnerId}
          loan={paymentModalTarget.loan}
          installment={paymentModalTarget.installment}
          allInstallments={installmentsByLoan[paymentModalTarget.loan.id] || []}
          onClose={() => setPaymentModalTarget(null)}
        />
      )}

      {reminderModalTarget && (
        <SendReminderModal
          ownerId={workspaceOwnerId}
          loan={reminderModalTarget.loan}
          installment={reminderModalTarget.installment}
          onClose={() => setReminderModalTarget(null)}
        />
      )}
    </div>
  );
}
