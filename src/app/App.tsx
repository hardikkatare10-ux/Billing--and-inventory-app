import { useEffect, useState } from "react";
import AuthScreen from "./auth";
import {
  LayoutDashboard, ShoppingCart, Package, FileText, QrCode,
  Building2, Users, Settings, User, Plus, Search, Bell,
  TrendingUp, IndianRupee, Menu, X, Printer, Send,
  AlertTriangle, Check, Clock, Edit2, Trash2, Phone,
  Mail, MapPin, ArrowUpRight, ArrowDownRight, MessageCircle,
  ExternalLink, CheckCircle2, XCircle, Sparkles, Boxes,
  Tag, ChevronRight, Eye, Star, RotateCcw, LogOut,
  Globe, Copy, Store, ChevronDown,
  Wallet, CreditCard, Gift, Award, Download,
  HardDrive
} from "lucide-react";
import { extractInvoiceFromFile, InvoiceExtractionResult } from "./invoiceParser";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Profile {
  businessId: string; shopName: string; ownerName: string; phone: string; email: string;
  address: string; gst: string; pan: string; category: string; established: string;
}
interface BusinessAccount {
  id: string; businessName: string; ownerName: string; mobile: string;
  storageKey: string; createdAt: string; lastActiveAt: string;
}
interface AppSettings {
  defaultGst: string; taxMode: string; printHeader: boolean;
  printFooter: boolean; autoWhatsApp: boolean;
}
interface Product {
  id: number; name: string; sku: string; barcode: string;
  price: number; costPrice: number; retailPrice?: number; wholesalePrice?: number;
  bulkThreshold?: number; stock: number; unit: string; category: string;
  valuationMethod?: "fifo" | "lifo" | "weighted";
}
interface CustomerLedgerEntry {
  id: string; date: string; type: "invoice" | "payment" | "adjustment"; amount: number; note: string;
}
interface Customer {
  id: number; name: string; phone: string; email: string;
  address: string; gst: string; totalSpent: number; lastPurchase: string;
  creditLimit?: number; outstandingBalance?: number; preferredRate?: "retail" | "wholesale";
  ledger?: CustomerLedgerEntry[];
}
interface UserAccount {
  id: number; name: string; role: UserRole; phone: string; email: string; active: boolean;
}
type UserRole = "admin" | "manager" | "billing_staff" | "inventory_staff" | "readonly";
interface AuthSessionUser {
  username: string;
  shopName: string;
  phone: string;
}
interface RateRule {
  id: number; customerId: number; productId: number; price: number; type: "retail" | "wholesale"; minQty: number;
}
interface PaymentReminder {
  id: number; customerId: number; invoiceId?: string; dueAmount: number; dueDate: string;
  status: "pending" | "sent" | "overdue"; channel: "whatsapp" | "sms"; createdAt: string;
}
interface EWayBill {
  id: string; invoiceId?: string; customerId?: number; vehicleNumber: string;
  fromGst: string; toGst: string; hsnCode: string; transportMode: string;
  totalValue: number; taxableValue: number; driverName: string; generatedAt: string;
  status: "generated" | "confirmed" | "cancelled"; rawData: string;
}
interface BackupRecord {
  id: string; label: string; createdAt: string; data: string; source: string;
}
interface InvoiceItem { productId: number; name: string; qty: number; price: number; gstRate: number; }
interface InvoiceRecord {
  id: string; date: string; customerName: string; total: number; itemCount: number;
  status?: "paid" | "partial" | "unpaid";
  due?: number;
  saleType?: "normal" | "cash";
  invoiceKind?: "tax" | "regular";
  customerId?: number; paymentMethod?: string; outstanding?: number; items?: InvoiceItem[];
}
interface DemandOrder {
  id: number; customerName: string; items: string; date: string;
  status: "pending" | "processing" | "fulfilled" | "cancelled"; total: number;
}
interface PPITransaction {
  id: string; date: string; billNumber: string; amount: number;
  type: "credit" | "debit"; remainingBalance: number; paymentMethod: string; staffName: string;
}
interface PPIOffer {
  id: string; title: string; description: string; validTill: string;
  minBill: number; discountPct: number; category: string; code: string;
}
interface PPICard {
  id: string; cardId: string; customerName: string; mobile: string; email: string;
  address: string; category: "regular" | "vip" | "student" | "staff";
  issueDate: string; expiryDate: string; kycStatus: "verified" | "pending";
  walletLimit: number; balance: number; status: "active" | "expired" | "blocked";
  rewardPoints: number; loyaltyTier: "bronze" | "silver" | "gold" | "platinum";
  transactions: PPITransaction[]; offers: PPIOffer[];
}
type Tab = "dashboard" | "demand" | "inventory" | "invoice" | "invoices" | "reminders" | "ewb" | "rates" | "bulk" | "backup" | "reports" | "sync" | "barcode" | "gst" | "customers" | "settings" | "profile" | "ppi";
type InvoiceTemplate = "modern" | "classic" | "premium" | "official";

const INVOICE_TEMPLATES: { id: InvoiceTemplate; label: string; desc: string }[] = [
  { id: "modern", label: "Modern", desc: "Clean header, bold total and polished table" },
  { id: "classic", label: "Classic", desc: "Traditional black-and-white business bill" },
  { id: "premium", label: "Premium", desc: "Elegant accent bar and executive spacing" },
  { id: "official", label: "Official", desc: "Formal layout for GST and records" },
];

// ─── Defaults ────────────────────────────────────────────────────────────────
const DEFAULT_PROFILE: Profile = { businessId: "", shopName: "", ownerName: "", phone: "", email: "", address: "", gst: "", pan: "", category: "Grocery & Provisions", established: String(new Date().getFullYear()) };
const DEFAULT_SETTINGS: AppSettings = { defaultGst: "18", taxMode: "exclusive", printHeader: true, printFooter: true, autoWhatsApp: false };
const ACCOUNT_INDEX_KEY = "billpro_business_accounts";
const ACTIVE_ACCOUNT_KEY = "billpro_active_business_id";
const LEGACY_KEYS = ["profile", "settings", "products", "customers", "demands", "invoices", "ppi_cards"];

// ─── localStorage Hook ────────────────────────────────────────────────────────
function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initial;
    } catch { return initial; }
  });
  const set = (v: T | ((p: T) => T)) => {
    const next = v instanceof Function ? v(state) : v;
    setState(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* noop */ }
  };
  return [state, set];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const normalizeLookup = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const normalizeScanCode = (value: string) =>
  value
    .trim()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^(?:barcode|bar\s*code|sku|item|code|qr)\s*[:#-]\s*/i, "")
    .replace(/\s+/g, "");

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const approxEqual = (a: number, b: number, tolerance = 0.08) =>
  Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b));

const normalizeMobile = (value: string) => value.replace(/\D/g, "").slice(-10);

const businessSlug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "business";

const makeBusinessId = (businessName: string, mobile: string, accounts: BusinessAccount[]) => {
  const base = businessSlug(businessName);
  const suffix = normalizeMobile(mobile).slice(-4) || String(Date.now()).slice(-4);
  let id = `${base}-${suffix}`.toUpperCase();
  let counter = 2;
  while (accounts.some((a) => a.id === id)) id = `${base}-${suffix}-${counter++}`.toUpperCase();
  return id;
};

const accountKey = (id: string) => `billpro_account_${id.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;

const readStored = <T,>(key: string, fallback: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : fallback;
  } catch { return fallback; }
};

const writeStored = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};

const scopedStorageKey = (storageKey: string, key: string) => `${storageKey}_${key}`;

function migrateLegacyData(storageKey: string) {
  LEGACY_KEYS.forEach((key) => {
    const legacyValue = localStorage.getItem(`billpro_${key}`);
    const nextKey = scopedStorageKey(storageKey, key);
    if (legacyValue && !localStorage.getItem(nextKey)) localStorage.setItem(nextKey, legacyValue);
  });
}

function EmptyState({ icon: Icon, title, desc, action }: { icon: React.ElementType; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-muted-foreground" />
      </div>
      <h3 className="font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-xs">{desc}</p>
      {action}
    </div>
  );
}

function BarcodeDisplay({ value, height = 56 }: { value: string; height?: number }) {
  const bars: { w: number; black: boolean }[] = [];
  bars.push({ w: 2, black: true }, { w: 1, black: false }, { w: 2, black: true });
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    bars.push({ w: ((c >> 5) & 3) + 1, black: true }, { w: ((c >> 3) & 3) + 1, black: false },
              { w: ((c >> 1) & 3) + 1, black: true }, { w: (c & 1) + 1, black: false });
  }
  bars.push({ w: 2, black: true }, { w: 2, black: false }, { w: 1, black: true });
  const total = bars.reduce((s, b) => s + b.w, 0);
  const scale = 220 / total;
  let x = 0;
  return (
    <svg width="220" height={height + 12} viewBox={`0 0 220 ${height + 12}`}>
      {bars.map((b, i) => {
        const bx = x; x += b.w * scale;
        return b.black ? <rect key={`bar-${i}`} x={bx} y={0} width={Math.max(b.w * scale - 0.3, 0.5)} height={height} fill="#0d1b3e" /> : null;
      })}
      <text x="110" y={height + 10} textAnchor="middle" fontSize="8" fontFamily="DM Mono,monospace" fill="#0d1b3e">{value}</text>
    </svg>
  );
}

function generateSVGBars(value: string): string {
  const bars: { w: number; black: boolean }[] = [];
  bars.push({ w: 2, black: true }, { w: 1, black: false }, { w: 2, black: true });
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    bars.push({ w: ((c >> 5) & 3) + 1, black: true }, { w: ((c >> 3) & 3) + 1, black: false },
              { w: ((c >> 1) & 3) + 1, black: true }, { w: (c & 1) + 1, black: false });
  }
  bars.push({ w: 2, black: true }, { w: 2, black: false }, { w: 1, black: true });
  const total = bars.reduce((s, b) => s + b.w, 0);
  const scale = 220 / total;
  let x = 0;
  return bars.map((b, i) => {
    const bx = x; x += b.w * scale;
    return b.black ? `<rect key="${i}" x="${bx.toFixed(2)}" y="0" width="${Math.max(b.w * scale - 0.3, 0.5).toFixed(2)}" height="30" fill="#000"/>` : "";
  }).join("") + `<text x="110" y="40" text-anchor="middle" font-size="8" font-family="monospace">${value}</text>`;
}

const StatusBadge = ({ status }: { status: DemandOrder["status"] }) => {
  const cfg = {
    pending: { color: "bg-amber-100 text-amber-700", icon: <Clock className="w-3 h-3" />, label: "Pending" },
    processing: { color: "bg-blue-100 text-blue-700", icon: <RotateCcw className="w-3 h-3" />, label: "Processing" },
    fulfilled: { color: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="w-3 h-3" />, label: "Fulfilled" },
    cancelled: { color: "bg-red-100 text-red-600", icon: <XCircle className="w-3 h-3" />, label: "Cancelled" },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
};

// ─── Setup / Account Access ───────────────────────────────────────────────────
function AccountAccessScreen({ accounts, onRegister, onActivate }: {
  accounts: BusinessAccount[];
  onRegister: (p: Profile) => void;
  onActivate: (account: BusinessAccount) => void;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(DEFAULT_PROFILE);
  const [login, setLogin] = useState("");
  const [loginError, setLoginError] = useState("");
  const set = (k: keyof Profile, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const canNext = form.shopName.trim() && form.ownerName.trim() && normalizeMobile(form.phone).length === 10;
  const activateAccount = () => {
    const query = login.trim().toLowerCase();
    const mobile = normalizeMobile(login);
    const matches = accounts.filter((a) =>
      a.id.toLowerCase() === query ||
      a.mobile === mobile ||
      a.businessName.toLowerCase() === query
    );
    if (matches.length === 1) {
      onActivate(matches[0]);
      return;
    }
    setLoginError(matches.length > 1 ? "More than one business has this name. Use mobile number or business ID." : "No saved business found for this ID or mobile number.");
  };
  return (
    <div className="min-h-screen bg-[#0f2557] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-br from-[#1e40af] to-[#0f2557] p-8 text-white text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#f59e0b] flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Welcome to Bill Pilot</h1>
          <p className="text-blue-200 text-sm mt-1">Open your business dataset from this device</p>
          <div className="flex items-center gap-2 justify-center mt-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`h-1.5 rounded-full transition-all ${step >= s ? "bg-[#f59e0b] w-8" : "bg-white/20 w-4"}`} />
            ))}
          </div>
        </div>

        <div className="p-7 space-y-4">
          {step === 1 ? (
            <>
              <h2 className="font-semibold text-foreground text-lg">Login with Business ID or Mobile</h2>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Business ID / Mobile Number</label>
                <input value={login} onChange={(e) => { setLogin(e.target.value); setLoginError(""); }} placeholder="e.g. SHARMA-GENERAL-1234 or mobile"
                  className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              {loginError && <p className="text-xs text-red-600">{loginError}</p>}
              <button disabled={!login.trim()} onClick={activateAccount}
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                Activate Account
              </button>
              <button onClick={() => setStep(2)} className="w-full py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">
                Create New Business ID
              </button>
              {accounts.length > 0 && (
                <div className="pt-2 border-t border-border/70">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Saved businesses on this device</p>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {accounts.map((account) => (
                      <button key={account.id} onClick={() => onActivate(account)} className="w-full text-left p-2.5 rounded-lg bg-muted/60 hover:bg-muted transition-colors">
                        <p className="text-sm font-medium text-foreground">{account.businessName}</p>
                        <p className="text-[11px] text-muted-foreground font-[DM_Mono]">{account.id} · {account.mobile}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : step === 2 ? (
            <>
              <h2 className="font-semibold text-foreground text-lg">Shop Information</h2>
              {[
                ["Shop / Business Name", "shopName", "e.g. Sharma General Store"],
                ["Owner Name", "ownerName", "e.g. Rajesh Sharma"],
                ["WhatsApp / Phone", "phone", "10-digit mobile number"],
              ].map(([label, key, placeholder]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">{label} <span className="text-red-400">*</span></label>
                  <input value={(form as any)[key]} onChange={(e) => set(key as keyof Profile, e.target.value)} placeholder={placeholder}
                    className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              ))}
              <button disabled={!canNext} onClick={() => setStep(3)}
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed mt-2">
                Continue →
              </button>
            </>
          ) : (
            <>
              <h2 className="font-semibold text-foreground text-lg">Additional Details <span className="text-xs font-normal text-muted-foreground">(optional)</span></h2>
              {[
                ["Email Address", "email", "shop@example.com"],
                ["Full Address", "address", "Street, City, PIN"],
                ["GST Number", "gst", "e.g. 07AABCS1234N1ZV"],
                ["PAN Number", "pan", "e.g. ABCPS1234D"],
              ].map(([label, key, placeholder]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
                  <input value={(form as any)[key]} onChange={(e) => set(key as keyof Profile, e.target.value)} placeholder={placeholder}
                    className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Business Category</label>
                <select value={form.category} onChange={(e) => set("category", e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  {["Grocery & Provisions", "Electronics", "Clothing & Apparel", "Pharmacy", "Hardware", "Stationery", "Restaurant / Food", "Agriculture", "Wholesale", "Other"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep(2)} className="flex-1 py-3 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">← Back</button>
                <button onClick={() => onRegister(form)} className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors">
                  Launch App
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DashboardView({ products, customers, demands, invoices, nextInvoiceLabel }: {
  products: Product[]; customers: Customer[]; demands: DemandOrder[]; invoices: InvoiceRecord[]; nextInvoiceLabel: string;
}) {
  const totalRevenue = invoices.reduce((s, i) => s + i.total, 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthRevenue = invoices.filter((i) => i.date.startsWith(thisMonth)).reduce((s, i) => s + i.total, 0);
  const lowStock = products.filter((p) => p.stock <= 10).length;
  const pendingCount = demands.filter((d) => d.status === "pending").length;

  const last6Months = Array.from({ length: 6 }, (_, idx) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - idx));
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleString("default", { month: "short" });
    return { month: label, sales: invoices.filter((i) => i.date.startsWith(key)).reduce((s, i) => s + i.total, 0) };
  });

  const hasData = invoices.length > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Revenue", value: fmt(totalRevenue), sub: `${invoices.length} invoices`, icon: IndianRupee, color: "bg-blue-50 text-blue-600", up: true },
          { label: "This Month", value: fmt(monthRevenue), sub: new Date().toLocaleString("default", { month: "long" }), icon: TrendingUp, color: "bg-emerald-50 text-emerald-600", up: true },
          { label: "Pending Orders", value: String(pendingCount), sub: `${demands.length} total orders`, icon: ShoppingCart, color: "bg-amber-50 text-amber-600", up: false },
          { label: "Customers", value: String(customers.length), sub: `${products.length} products`, icon: Users, color: "bg-purple-50 text-purple-600", up: true },
          { label: "Next Invoice", value: nextInvoiceLabel, sub: "Ready to issue", icon: FileText, color: "bg-slate-50 text-slate-700", up: true },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-xl p-4 border border-border shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{s.label}</p>
              <span className={`p-1.5 rounded-lg ${s.color}`}><s.icon className="w-4 h-4" /></span>
            </div>
            <p className="text-2xl font-semibold font-[DM_Mono] text-foreground">{s.value}</p>
            <p className="text-xs mt-1 text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>

      {lowStock > 0 && (
        <div className="flex items-center gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>{lowStock} product{lowStock > 1 ? "s" : ""}</strong> running low on stock — restock soon.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card rounded-xl p-5 border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Sales Overview</h3>
            <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">Last 6 months</span>
          </div>
          {hasData ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={last6Months} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1e40af" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#1e40af" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Area key="area-sales" type="monotone" dataKey="sales" stroke="#1e40af" strokeWidth={2} fill="url(#gSales)" name="Sales" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-center">
              <BarChart data={[]} width={0} height={0}><Bar dataKey="v" /></BarChart>
              <TrendingUp className="w-10 h-10 text-muted/60 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No sales data yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Create your first invoice to see the chart</p>
            </div>
          )}
        </div>

        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <h3 className="font-semibold text-foreground mb-4">Quick Actions</h3>
          <div className="space-y-2">
            {[
              { label: "Create Invoice", desc: "Bill a customer", icon: FileText, color: "text-blue-600 bg-blue-50" },
              { label: "Add Product", desc: "Update inventory", icon: Package, color: "text-emerald-600 bg-emerald-50" },
              { label: "Add Customer", desc: "Save contact", icon: Users, color: "text-purple-600 bg-purple-50" },
              { label: "File GST", desc: "Go to GST portal", icon: Building2, color: "text-amber-600 bg-amber-50" },
            ].map((a) => (
              <div key={a.label} className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/40 cursor-pointer transition-colors border border-transparent hover:border-border">
                <span className={`p-2 rounded-lg ${a.color}`}><a.icon className="w-4 h-4" /></span>
                <div>
                  <p className="text-sm font-medium text-foreground">{a.label}</p>
                  <p className="text-xs text-muted-foreground">{a.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-accent" />
          <h3 className="font-semibold text-foreground">AI Business Insights</h3>
          <span className="ml-auto text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">Based on your data</span>
        </div>
        {hasData ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
              <div className="flex items-center gap-1.5 mb-1.5"><TrendingUp className="w-3.5 h-3.5 text-emerald-500" /><span className="text-xs font-semibold text-foreground">Revenue Trend</span></div>
              <p className="text-xs text-muted-foreground">This month: <span className="font-semibold text-foreground">{fmt(monthRevenue)}</span></p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
              <div className="flex items-center gap-1.5 mb-1.5"><Users className="w-3.5 h-3.5 text-blue-500" /><span className="text-xs font-semibold text-foreground">Customer Base</span></div>
              <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{customers.length}</span> customers on record</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg border border-border/50">
              <div className="flex items-center gap-1.5 mb-1.5"><Package className="w-3.5 h-3.5 text-purple-500" /><span className="text-xs font-semibold text-foreground">Inventory</span></div>
              <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{products.length}</span> products · {lowStock} low stock</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">Add products, customers and invoices to see AI-powered insights about your business.</p>
        )}
      </div>
    </div>
  );
}

// ─── Demand ───────────────────────────────────────────────────────────────────
function DemandView({ demands, setDemands, customers }: { demands: DemandOrder[]; setDemands: (v: DemandOrder[] | ((p: DemandOrder[]) => DemandOrder[])) => void; customers: Customer[]; }) {
  const [filter, setFilter] = useState<"all" | DemandOrder["status"]>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ customerName: "", items: "", total: "", status: "pending" as DemandOrder["status"] });
  const filtered = filter === "all" ? demands : demands.filter((d) => d.status === filter);
  const counts = {
    all: demands.length,
    pending: demands.filter((d) => d.status === "pending").length,
    processing: demands.filter((d) => d.status === "processing").length,
    fulfilled: demands.filter((d) => d.status === "fulfilled").length,
    cancelled: demands.filter((d) => d.status === "cancelled").length,
  };
  const updateStatus = (id: number, status: DemandOrder["status"]) =>
    setDemands((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
  const handleAdd = () => {
    if (!form.customerName || !form.items) return;
    const newD: DemandOrder = { id: Date.now(), customerName: form.customerName, items: form.items, date: new Date().toISOString().split("T")[0], status: form.status, total: Number(form.total) || 0 };
    setDemands((prev) => [newD, ...prev]);
    setForm({ customerName: "", items: "", total: "", status: "pending" });
    setShowAdd(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-between">
        <div className="flex flex-wrap gap-2">
          {(["all", "pending", "processing", "fulfilled", "cancelled"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${filter === f ? "bg-primary text-primary-foreground shadow-sm" : "bg-card text-muted-foreground border border-border hover:border-primary/30"}`}>
              {f} ({counts[f]})
            </button>
          ))}
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors">
          <Plus className="w-3.5 h-3.5" /> New Demand
        </button>
      </div>

      {showAdd && (
        <div className="bg-card rounded-xl p-5 border border-primary/20 shadow-sm space-y-3">
          <h3 className="font-semibold text-foreground text-sm">Add Demand Order</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Customer Name *</label>
              {customers.length > 0 ? (
                <select value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Select customer...</option>
                  {customers.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              ) : (
                <input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="Customer name"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Order Value (₹)</label>
              <input type="number" value={form.total} onChange={(e) => setForm((f) => ({ ...f, total: e.target.value }))} placeholder="0"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Items / Description *</label>
              <input value={form.items} onChange={(e) => setForm((f) => ({ ...f, items: e.target.value }))} placeholder="e.g. Rice 5kg × 10, Dal 1kg × 5"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
            <button onClick={handleAdd} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">Add Order</button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="No demand orders" desc="Add demand orders to track pending customer requests." />
      ) : (
        <div className="space-y-2">
          {filtered.map((d) => (
            <div key={d.id} className="bg-card rounded-xl p-4 border border-border shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm text-foreground">{d.customerName}</span>
                  <StatusBadge status={d.status} />
                </div>
                <p className="text-xs text-muted-foreground truncate">{d.items}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{d.date}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {d.total > 0 && <span className="font-semibold text-sm font-[DM_Mono] text-foreground">{fmt(d.total)}</span>}
                <select value={d.status} onChange={(e) => updateStatus(d.id, e.target.value as DemandOrder["status"])}
                  className="text-xs border border-border rounded-lg px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer">
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="fulfilled">Fulfilled</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button onClick={() => setDemands((prev) => prev.filter((x) => x.id !== d.id))} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Inventory ────────────────────────────────────────────────────────────────
function InventoryView({ products, setProducts }: { products: Product[]; setProducts: (v: Product[] | ((p: Product[]) => Product[])) => void; }) {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoiceResult, setInvoiceResult] = useState<InvoiceExtractionResult | null>(null);
  const [invoiceProcessing, setInvoiceProcessing] = useState(false);
  const [invoiceMessage, setInvoiceMessage] = useState("");
  const [invoiceMargin, setInvoiceMargin] = useState("25");
  const [form, setForm] = useState({ name: "", sku: "", barcode: "", price: "", costPrice: "", stock: "", unit: "Packet", category: "Grocery & Provisions" });
  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));
  const lowStock = products.filter((p) => p.stock <= 10).length;

  const openAdd = () => { setForm({ name: "", sku: "", barcode: "", price: "", costPrice: "", stock: "", unit: "Packet", category: "Grocery & Provisions" }); setEditId(null); setShowForm(true); };
  const openEdit = (p: Product) => { setForm({ name: p.name, sku: p.sku, barcode: p.barcode, price: String(p.price), costPrice: String(p.costPrice), stock: String(p.stock), unit: p.unit, category: p.category }); setEditId(p.id); setShowForm(true); };

  const processInvoiceFile = async () => {
    if (!invoiceFile) return;
    setInvoiceProcessing(true);
    setInvoiceMessage("Detecting invoice region and extracting text...");
    try {
      const result = await extractInvoiceFromFile(invoiceFile, setInvoiceMessage);
      setInvoiceResult(result);
      setInvoiceMessage(`Invoice extraction complete. Found ${result.items.length} item(s).`);
    } catch (error) {
      setInvoiceResult(null);
      setInvoiceMessage(`Invoice OCR failed: ${String(error)}`);
    } finally {
      setInvoiceProcessing(false);
    }
  };

  const importInvoiceItems = () => {
    if (!invoiceResult?.items.length) {
      setInvoiceMessage("No invoice items to import. Process an invoice first.");
      return;
    }
    const marginPct = Number.isFinite(Number(invoiceMargin)) ? Math.max(0, Number(invoiceMargin)) : 0;
    const salePriceFor = (costPrice: number) => costPrice > 0 ? roundMoney(costPrice * (1 + marginPct / 100)) : 0;
    let added = 0;
    let updated = 0;
    let skipped = 0;
    setProducts((prev) => {
      const next = [...prev];
      invoiceResult.items.forEach((item) => {
        const name = item.item_name?.trim();
        if (!name) { skipped++; return; }
        const quantity = item.quantity ? Math.max(1, Math.round(Number(item.quantity))) : 1;
        const costPrice = item.rate ? Number(item.rate) : item.amount ? roundMoney(Number(item.amount) / Math.max(1, quantity)) : 0;
        const existing = next.find((p) => normalizeLookup(p.name) === normalizeLookup(name));
        if (existing) {
          existing.stock += quantity;
          if (costPrice > 0) {
            existing.costPrice = costPrice;
            existing.price = salePriceFor(costPrice);
          }
          updated += 1;
        } else {
          const id = Date.now() + Math.floor(Math.random() * 1000);
          next.push({ id, name, sku: `SKU-${id}`, barcode: "", price: salePriceFor(costPrice), costPrice, stock: quantity, unit: "Piece", category: "Grocery & Provisions" });
          added += 1;
        }
      });
      return next;
    });
    setInvoiceMessage(`Imported ${added + updated} item(s): ${added} new, ${updated} updated${skipped ? `, ${skipped} skipped (no name detected)` : ""}. Sale prices use ${invoiceMargin}% margin.`);
  };

  const clearInvoiceImport = () => {
    setInvoiceFile(null);
    setInvoiceResult(null);
    setInvoiceMessage("");
  };

  const emptyInventory = () => {
    if (!products.length) {
      setInvoiceMessage("Inventory is already empty.");
      return;
    }
    if (window.confirm(`Empty inventory and delete all ${products.length} product(s)? This cannot be undone.`)) {
      setProducts([]);
      setSearch("");
      setInvoiceMessage("Inventory emptied.");
    }
  };

  const handleSave = () => {
    if (!form.name || !form.price) return;
    if (editId !== null) {
      setProducts((prev) => prev.map((p) => p.id === editId ? { ...p, ...form, price: +form.price, costPrice: +form.costPrice, stock: +form.stock } : p));
    } else {
      const ts = Date.now();
      setProducts((prev) => [...prev, { id: ts, name: form.name, sku: form.sku || `SKU-${ts}`, barcode: form.barcode || `89${ts}`, price: +form.price, costPrice: +form.costPrice, stock: +form.stock, unit: form.unit, category: form.category }]);
    }
    setShowForm(false); setEditId(null);
  };

  return (
    <div className="space-y-4">
      {lowStock > 0 && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" /><span><strong>{lowStock} product{lowStock > 1 ? "s" : ""}</strong> running low on stock.</span>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..."
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Add Product
          </button>
          <button onClick={emptyInventory} className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors shadow-sm">
            <RotateCcw className="w-4 h-4" /> Empty Inventory
          </button>
        </div>
      </div>

      <div className="bg-card rounded-xl p-5 border border-border shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-foreground">Invoice OCR & Import</h3>
            <p className="text-xs text-muted-foreground">Upload an invoice image or PDF, extract structured data and import invoice items into inventory.</p>
          </div>
          <span className="text-xs text-muted-foreground">Confidence threshold 80%</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Upload invoice image or PDF</label>
              <input type="file" accept="image/*,.pdf" onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)} className="w-full text-xs" />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button onClick={processInvoiceFile} disabled={!invoiceFile || invoiceProcessing} className="flex-1 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-950 transition-colors disabled:opacity-50">Process Invoice</button>
              <button onClick={clearInvoiceImport} className="flex-1 px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">Clear</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Import margin %</label>
                <input type="number" min="0" value={invoiceMargin} onChange={(e) => setInvoiceMargin(e.target.value)} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div className="flex items-end">
                <button onClick={importInvoiceItems} disabled={!invoiceResult?.items.length || invoiceProcessing} className="w-full px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">Import Items</button>
              </div>
            </div>
            {invoiceMessage && <p className="text-xs text-muted-foreground">{invoiceMessage}</p>}
          </div>
          {invoiceResult && (
            <div className="rounded-2xl border border-border bg-background p-3 text-sm space-y-3">
              <div className="flex flex-wrap gap-2">
                <span className="text-xs font-semibold text-slate-600">Invoice</span>
                <span className="text-xs text-foreground">{invoiceResult.invoice_number || "#unknown"}</span>
                <span className="text-xs text-foreground">{invoiceResult.date || "No date"}</span>
                <span className="text-xs text-foreground">{invoiceResult.customer_name || "No customer"}</span>
                <span className="text-xs text-muted-foreground">Confidence {invoiceResult.confidence}%</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                <div><strong>Subtotal:</strong> {invoiceResult.subtotal || "-"}</div>
                <div><strong>Total:</strong> {invoiceResult.grand_total || "-"}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Rate</th>
                      <th className="px-3 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceResult.items.map((item, idx) => (
                      <tr key={`${item.item_name ?? "item"}-${idx}`} className="border-b border-border/50 even:bg-muted/50">
                        <td className="px-3 py-2 font-medium text-foreground">{item.item_name || "-"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{item.quantity || "-"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{item.rate || "-"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{item.amount || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <textarea readOnly rows={6} value={invoiceResult.raw_text} className="w-full px-3 py-2 bg-background border border-border rounded-xl text-xs font-[DM_Mono] focus:outline-none" />
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="bg-card rounded-xl p-5 border border-primary/20 shadow-sm space-y-4">
          <h3 className="font-semibold text-foreground">{editId ? "Edit Product" : "Add New Product"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[["Product Name *", "name", "text"], ["SKU Code", "sku", "text"], ["Barcode", "barcode", "text"], ["Selling Price (₹) *", "price", "number"], ["Cost Price (₹)", "costPrice", "number"], ["Stock Quantity *", "stock", "number"]].map(([label, key, type]) => (
              <div key={key as string}>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{label as string}</label>
                <input type={type as string} value={(form as any)[key as string]} onChange={(e) => setForm((f) => ({ ...f, [key as string]: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Unit</label>
              <select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                {["Piece", "Packet", "Bag", "Bottle", "Box", "Kg", "Gram", "Litre", "Dozen", "Set"].map((u) => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                {["Grocery & Provisions", "Grains", "Pulses", "Oils", "Spices", "Dairy", "Beverages", "Electronics", "Clothing", "Hardware", "Pharmacy", "Stationery", "Others"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
            <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">Save Product</button>
          </div>
        </div>
      )}

      {products.length === 0 ? (
        <EmptyState icon={Package} title="No products yet" desc="Add your first product to start managing inventory." action={<button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"><Plus className="w-4 h-4" /> Add First Product</button>} />
      ) : (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/30">
              {["Product", "SKU", "Category", "Price", "Stock", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{p.name}<br /><span className="text-xs text-muted-foreground font-[DM_Mono]">{p.barcode}</span></td>
                  <td className="px-4 py-3 text-muted-foreground font-[DM_Mono] text-xs">{p.sku}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 bg-secondary text-secondary-foreground rounded-full text-xs">{p.category}</span></td>
                  <td className="px-4 py-3 font-semibold font-[DM_Mono]">{fmt(p.price)}</td>
                  <td className="px-4 py-3"><span className={`font-semibold font-[DM_Mono] ${p.stock <= 10 ? "text-red-500" : p.stock <= 20 ? "text-amber-500" : "text-emerald-600"}`}>{p.stock} {p.unit}{p.stock <= 10 && <span className="ml-1 text-xs font-normal text-red-400">Low</span>}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(p)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setProducts((prev) => prev.filter((x) => x.id !== p.id))} className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Invoice Generator ────────────────────────────────────────────────────────
function InvoiceView({ products, customers, profile, settings, onSave, onNavigate, nextInvoiceLabel }: {
  products: Product[]; customers: Customer[]; profile: Profile; settings: AppSettings;
  onSave: (inv: InvoiceRecord) => void;
  onNavigate: (tab: Tab) => void;
  nextInvoiceLabel: string;
}) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([{ productId: 0, name: "", qty: 1, price: 0, gstRate: Number(settings.defaultGst) }]);
  const [invoiceSize, setInvoiceSize] = useState<"a4" | "a5" | "thermal">("a4");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "partial" | "unpaid">("paid");
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [showPreview, setShowPreview] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scanCode, setScanCode] = useState("");
  const [scanMessage, setScanMessage] = useState("");
  const [saleType, setSaleType] = useState<"normal" | "cash">("normal");
  const [invoiceKind, setInvoiceKind] = useState<"tax" | "regular">("tax");
  const [invoiceTemplate, setInvoiceTemplate] = useState<InvoiceTemplate>("modern");
  const invoiceNo = nextInvoiceLabel;

  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const totalGst = invoiceKind === "tax"
    ? items.reduce((s, i) => s + i.qty * i.price * i.gstRate / 100, 0)
    : 0;
  const grandTotal = subtotal + totalGst;
  const dueAmount = paymentStatus === "paid" ? 0 : paymentStatus === "unpaid" ? grandTotal : Math.max(0, grandTotal - paidAmount);
  const statusLabel = paymentStatus === "paid" ? "PAID" : paymentStatus === "unpaid" ? "UNPAID" : "PARTIALLY PAID";
  const addItem = () => setItems((prev) => [...prev, { productId: 0, name: "", qty: 1, price: 0, gstRate: Number(settings.defaultGst) }]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: keyof InvoiceItem, value: string | number) =>
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));

  const handleScanCode = (code: string) => {
    const trimmed = normalizeScanCode(code);
    if (!trimmed) {
      setScanMessage("");
      return;
    }
    const product = products.find((p) =>
      normalizeScanCode(p.barcode) === trimmed ||
      normalizeScanCode(p.sku) === trimmed ||
      normalizeLookup(p.name) === normalizeLookup(trimmed)
    );
    if (!product) {
      setScanMessage("No matching registered product found for this QR/barcode.");
      return;
    }
    setItems((prev) => {
      const existing = prev.find((it) => it.productId === product.id);
      if (existing) {
        return prev.map((it) => it.productId === product.id ? { ...it, qty: it.qty + 1, price: product.price, name: product.name } : it);
      }
      const emptyIndex = prev.findIndex((it) => !it.productId && !it.name.trim() && it.price === 0);
      if (emptyIndex >= 0) {
        return prev.map((it, i) => i === emptyIndex ? { productId: product.id, name: product.name, qty: 1, price: product.price, gstRate: Number(settings.defaultGst) } : it);
      }
      return [...prev, { productId: product.id, name: product.name, qty: 1, price: product.price, gstRate: Number(settings.defaultGst) }];
    });
    setScanMessage(`Added ${product.name} to the invoice.`);
    setScanCode("");
  };

  const saveInvoice = () => {
    if (saved) return;
    onSave({
      id: invoiceNo,
      date: new Date().toISOString().split("T")[0],
      customerName: selectedCustomer?.name || "Walk-in",
      total: grandTotal,
      itemCount: items.length,
      status: paymentStatus,
      due: dueAmount,
      saleType,
      invoiceKind,
    });
    setSaved(true);
  };

  const invoiceSizeMap = { a4: { w: "210mm", h: "297mm", px: 210 * 3.7795275591 }, a5: { w: "148mm", h: "210mm", px: 148 * 3.7795275591 }, thermal: { w: "80mm", h: "auto", px: 80 * 3.7795275591 } };

  const createLegacyInvoiceHtml = () => {
    const pageSize = invoiceSizeMap[invoiceSize];
    const pdfFontSize = invoiceSize === "thermal" ? 10 : 12;
    return `<html><head><title>${invoiceNo}</title><style>
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono&display=swap');
      @page{size: ${pageSize.w} ${pageSize.h}; margin:10mm}
      html,body{width:100%;height:100%;margin:0;padding:0;box-sizing:border-box}
      body{font-family:'DM Sans',sans-serif;font-size:${pdfFontSize}px;color:#0d1b3e;line-height:1.45;background:#fff}
      .inv{width:${pageSize.w};max-width:none;min-width:${pageSize.w};padding:${invoiceSize==="thermal"?"8px":"20px"};margin:auto;box-sizing:border-box}
      .top-heading{text-align:center;margin-bottom:24px}
      .top-heading h1{font-size:22px;letter-spacing:0.35em;text-transform:uppercase;margin:0;font-weight:700}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start;margin-bottom:24px}
      .invoice-to{border:2px solid #0d1b3e;padding:16px;min-height:120px;box-sizing:border-box}
      .invoice-to .label{font-size:9px;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:10px;font-weight:700}
      .invoice-to .name{font-size:14px;font-weight:700;margin:0 0 6px}
      .invoice-to p{margin:3px 0;color:#1f2937;font-size:11px}
      .company{display:flex;flex-direction:column;align-items:flex-end;text-align:right;gap:6px}
      .company .name{font-size:16px;font-weight:700;line-height:1.1}
      .company .meta{font-size:10px;color:#64748b;line-height:1.5}
      .company-meta{margin-top:10px;font-size:10px;color:#64748b;text-align:right;line-height:1.5}
      .company-meta span{display:block}
      .items{width:100%;border-collapse:collapse;margin-bottom:24px}
      .items th{background:#111827;color:#fff;padding:12px 14px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.08em}
      .items td{padding:12px 14px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#1f2937}
      .items tbody tr:last-child td{border-bottom:none}
      .summary-section{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:start;margin-top:24px}
      .stamp{width:120px;height:120px;border:4px solid #22c55e;border-radius:999px;display:flex;align-items:center;justify-content:center;color:#22c55e;font-size:10px;font-weight:800;text-align:center;letter-spacing:0.08em;text-transform:uppercase;line-height:1.1}
      .totals{display:flex;flex-direction:column;gap:8px}
      .totals .line{display:flex;justify-content:space-between;font-size:11px;color:#64748b}
      .totals .line strong{color:#1f2937}
      .totals .total{display:flex;justify-content:space-between;align-items:center;background:#111827;color:#fff;padding:14px 16px;border-radius:10px;font-size:12px;font-weight:700}
      .footer{display:flex;justify-content:space-between;align-items:center;margin-top:30px}
      .footer .thanks{font-style:italic;color:#111827;font-size:12px}
      .footer .brand{font-size:10px;font-weight:700;text-transform:uppercase;line-height:1.2;text-align:right}
      .small-text{font-size:10px;color:#64748b}
    </style></head><body><div class="inv">
      <div class="top-heading"><h1>${invoiceKind === "tax" ? "Tax Invoice" : "Invoice"}</h1></div>
      <div class="grid">
        <div class="invoice-to">
          <div class="label">Invoice To</div>
          <div class="name">${selectedCustomer?.name || "Walk-in"}</div>
          ${selectedCustomer?.phone ? `<p>${selectedCustomer.phone}</p>` : ""}
          ${selectedCustomer?.address ? `<p>${selectedCustomer.address}</p>` : ""}
          ${invoiceKind === "tax" ? `<p class="small-text">GST: ${selectedCustomer?.gst ? selectedCustomer.gst : 'N/A'}</p>` : ""}
        </div>
        <div class="company">
          <div class="name">${profile.shopName}</div>
          <div class="meta">${profile.address || ""}${profile.phone ? `<br/>📞 ${profile.phone}` : ""}</div>
          ${invoiceKind === "tax" ? `<div class="meta">GST: ${profile.gst ? profile.gst : 'N/A'}</div>` : ""}
          <div class="company-meta">
            <span>${saleType === "cash" ? "Cash Sale" : "Normal Sale"}</span>
            <span>Invoice No: ${invoiceNo}</span>
            <span>${new Date().toLocaleDateString("en-IN")}</span>
          </div>
        </div>
      </div>
      <table class="items"><thead><tr><th>Product</th><th style="width:80px">Rate</th><th style="width:60px">Qty</th>${invoiceKind === "tax" ? `<th style="width:80px">GST</th>` : ""}<th style="width:90px;text-align:right">Amount</th></tr></thead><tbody>
      ${items.map(it => `<tr><td>${it.name || "—"}</td><td>₹${fmt(it.price)}</td><td>${it.qty}</td>${invoiceKind === "tax" ? `<td>${it.gstRate}%</td>` : ""}<td style="text-align:right">${fmt(it.qty * it.price)}</td></tr>`).join("")}
      </tbody></table>
      <div class="summary-section">
        <div class="stamp">Paid</div>
        <div class="totals">
          <div class="line"><span>Subtotal</span><strong>${fmt(subtotal)}</strong></div>
          ${invoiceKind === "tax" ? `<div class="line"><span>GST</span><strong>${fmt(totalGst)}</strong></div>` : ""}
          <div class="total"><span>Total</span><span>${fmt(grandTotal)}</span></div>
        </div>
      </div>
      <div class="footer"><div class="thanks">Thank you for your business!</div><div class="brand">${profile.shopName}</div></div>
    </div></body></html>`;
  };

  const createInvoiceHtml = () => {
    const pageSize = invoiceSizeMap[invoiceSize];
    const isThermal = invoiceSize === "thermal";
    const title = invoiceKind === "tax" ? "Tax Invoice" : "Invoice";
    const invoiceDate = new Date().toLocaleDateString("en-IN");
    const esc = (value: string | number | undefined | null) =>
      String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] || ch));
    const rows = items.map((it, idx) => `
        <tr>
          <td class="serial">${idx + 1}</td>
          <td class="item-name">${esc(it.name || "Item")}</td>
          <td class="num">${esc(it.qty)}</td>
          <td class="num">${esc(fmt(it.price))}</td>
          ${invoiceKind === "tax" ? `<td class="num">${esc(it.gstRate)}%</td>` : ""}
          <td class="num strong">${esc(fmt(it.qty * it.price))}</td>
        </tr>`).join("");
    const terms = paymentStatus === "paid"
      ? "Payment received. Thank you for your business."
      : `Amount due: ${fmt(dueAmount)}. Please clear the balance as per agreement.`;

    return `<html><head><title>${esc(invoiceNo)}</title><style>
      @page{size:${pageSize.w} ${pageSize.h};margin:0}
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;background:#f3f4f6;color:#172033}
      body{font-family:Arial,'Helvetica Neue',sans-serif;font-size:${isThermal ? "10px" : "12px"};line-height:1.45}
      .inv{width:${pageSize.w};min-width:${pageSize.w};${!isThermal ? `min-height:${pageSize.h};` : ""}margin:0 auto;background:#fff;padding:${isThermal ? "8px" : "18mm"};position:relative;overflow:hidden}
      .mono,.num{font-family:'Courier New',monospace}
      .eyebrow{font-size:9px;text-transform:uppercase;letter-spacing:1.8px;font-weight:700;color:var(--muted)}
      h1,h2,h3,p{margin:0}
      .doc-title{text-transform:uppercase;letter-spacing:3px;font-size:${isThermal ? "12px" : "24px"};font-weight:800;color:var(--ink);margin-bottom:16px}
      .header{display:grid;grid-template-columns:1.25fr .75fr;gap:18px;align-items:start;margin-bottom:18px}
      .shop-card h1{font-size:${isThermal ? "14px" : "25px"};line-height:1.1;color:var(--ink);margin-bottom:8px}
      .shop-card p,.party-card p{color:var(--muted);font-size:${isThermal ? "9px" : "11px"};margin-top:3px}
      .meta-card{border:1px solid var(--line);padding:12px;background:var(--soft)}
      .status{display:inline-block;background:var(--accent);color:#fff;padding:5px 10px;border-radius:999px;font-size:9px;font-weight:800;letter-spacing:1px;margin-bottom:9px}
      .meta-row{display:flex;justify-content:space-between;gap:12px;border-top:1px solid var(--line);padding-top:7px;margin-top:7px;color:var(--muted);font-size:10px}
      .meta-row strong{color:var(--ink);text-align:right}
      .bill-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px}
      .party-card,.note-card{border:1px solid var(--line);padding:13px;background:#fff}
      .party-card h2{font-size:15px;color:var(--ink);margin:6px 0}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th{background:var(--ink);color:#fff;text-align:left;padding:10px 9px;font-size:9px;text-transform:uppercase;letter-spacing:1px}
      td{padding:10px 9px;border-bottom:1px solid var(--line);font-size:11px;color:#263244;vertical-align:top}
      .serial{width:34px;color:var(--muted)}
      .item-name{font-weight:700;color:var(--ink)}
      .num{text-align:right;white-space:nowrap}
      .strong{font-weight:800}
      .summary{display:grid;grid-template-columns:1fr 210px;gap:18px;align-items:start;margin-top:18px}
      .note-card h3{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--ink);margin-bottom:7px}
      .note-card p{font-size:10px;color:var(--muted)}
      .totals{border:1px solid var(--line);background:#fff}
      .total-row{display:flex;justify-content:space-between;padding:9px 12px;border-bottom:1px solid var(--line);color:var(--muted);font-size:11px}
      .total-row strong{color:var(--ink)}
      .grand{display:flex;justify-content:space-between;align-items:center;background:var(--ink);color:#fff;padding:13px 12px;font-size:14px;font-weight:800}
      .footer{display:flex;justify-content:space-between;gap:16px;margin-top:22px;padding-top:12px;border-top:1px solid var(--line);font-size:10px;color:var(--muted)}
      .signature{text-align:right;color:var(--ink);font-weight:700}
      .template-modern{--ink:#12335f;--accent:#0ea5a4;--soft:#ecfeff;--line:#cbd5e1;--muted:#64748b}
      .template-modern .inv{border-top:8px solid var(--accent)}
      .template-classic{--ink:#111827;--accent:#111827;--soft:#f9fafb;--line:#9ca3af;--muted:#4b5563}
      .template-classic .doc-title{text-align:center;border:2px solid var(--ink);padding:8px}
      .template-classic .header{display:block}
      .template-classic .shop-card{text-align:center;margin-bottom:12px}
      .template-classic .meta-card{background:#fff}
      .template-premium{--ink:#1f2937;--accent:#b7791f;--soft:#fffbeb;--line:#d6c6a1;--muted:#6b7280}
      .template-premium .inv:before{content:"";position:absolute;left:0;top:0;bottom:0;width:10mm;background:var(--ink)}
      .template-premium .inv{padding-left:23mm}
      .template-premium th{background:var(--accent)}
      .template-official{--ink:#0f172a;--accent:#2563eb;--soft:#eff6ff;--line:#94a3b8;--muted:#475569}
      .template-official .inv{border:1px solid var(--line)}
      .template-official .doc-title{border-bottom:3px double var(--ink);padding-bottom:8px}
      .template-official .party-card,.template-official .meta-card,.template-official .note-card,.template-official .totals{border-color:#64748b}
      .thermal .inv{padding:8px}
      .thermal .header,.thermal .bill-grid,.thermal .summary{display:block}
      .thermal .doc-title{text-align:center;letter-spacing:1px;margin:6px 0}
      .thermal .shop-card{text-align:center;margin-bottom:8px}
      .thermal .meta-card,.thermal .party-card,.thermal .note-card,.thermal .totals{padding:7px;margin-bottom:8px}
      .thermal th,.thermal td{padding:5px 3px;font-size:8px}
      .thermal .serial,.thermal .note-card,.thermal .signature{display:none}
      .thermal .footer{display:block;text-align:center;margin-top:8px}
      @media print{html,body{background:#fff}.inv{box-shadow:none}}
    </style></head><body class="template-${invoiceTemplate} ${isThermal ? "thermal" : ""}">
      <main class="inv">
        <div class="header">
          <section class="shop-card">
            <h1>${esc(profile.shopName || "Your Business")}</h1>
            ${profile.address ? `<p>${esc(profile.address)}</p>` : ""}
            ${profile.phone ? `<p>Phone: ${esc(profile.phone)}</p>` : ""}
            ${profile.email ? `<p>Email: ${esc(profile.email)}</p>` : ""}
            ${invoiceKind === "tax" ? `<p class="mono">GSTIN: ${esc(profile.gst || "N/A")}</p>` : ""}
            ${profile.pan ? `<p class="mono">PAN: ${esc(profile.pan)}</p>` : ""}
          </section>
          <section class="meta-card">
            <div class="status">${esc(statusLabel)}</div>
            <div class="meta-row"><span>Invoice No</span><strong>${esc(invoiceNo)}</strong></div>
            <div class="meta-row"><span>Date</span><strong>${esc(invoiceDate)}</strong></div>
            <div class="meta-row"><span>Sale Type</span><strong>${saleType === "cash" ? "Cash Sale" : "Normal Sale"}</strong></div>
          </section>
        </div>
        <div class="doc-title">${esc(title)}</div>
        <div class="bill-grid">
          <section class="party-card">
            <div class="eyebrow">Bill To</div>
            <h2>${esc(selectedCustomer?.name || "Walk-in Customer")}</h2>
            ${selectedCustomer?.phone ? `<p>${esc(selectedCustomer.phone)}</p>` : ""}
            ${selectedCustomer?.email ? `<p>${esc(selectedCustomer.email)}</p>` : ""}
            ${selectedCustomer?.address ? `<p>${esc(selectedCustomer.address)}</p>` : ""}
            ${invoiceKind === "tax" ? `<p class="mono">GSTIN: ${esc(selectedCustomer?.gst || "N/A")}</p>` : ""}
          </section>
          <section class="party-card">
            <div class="eyebrow">Payment</div>
            <h2>${esc(statusLabel)}</h2>
            <p>Subtotal: ${esc(fmt(subtotal))}</p>
            ${invoiceKind === "tax" ? `<p>GST: ${esc(fmt(totalGst))}</p>` : ""}
            <p>Due: ${esc(fmt(dueAmount))}</p>
          </section>
        </div>
        <table>
          <thead><tr><th class="serial">#</th><th>Item</th><th class="num">Qty</th><th class="num">Rate</th>${invoiceKind === "tax" ? `<th class="num">GST</th>` : ""}<th class="num">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="summary">
          <section class="note-card">
            <h3>Terms & Notes</h3>
            <p>${esc(terms)}</p>
          </section>
          <section class="totals">
            <div class="total-row"><span>Subtotal</span><strong>${esc(fmt(subtotal))}</strong></div>
            ${invoiceKind === "tax" ? `<div class="total-row"><span>GST</span><strong>${esc(fmt(totalGst))}</strong></div>` : ""}
            <div class="total-row"><span>Due</span><strong>${esc(fmt(dueAmount))}</strong></div>
            <div class="grand"><span>Total</span><span>${esc(fmt(grandTotal))}</span></div>
          </section>
        </div>
        <div class="footer">
          <span>Thank you for your business.</span>
          <span class="signature">Authorized Signatory<br/>${esc(profile.shopName || "")}</span>
        </div>
      </main>
    </body></html>`;
  };

  const prepareInvoiceCanvasContainer = (html: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const inv = doc.querySelector(".inv");
    if (!inv) throw new Error("Invoice markup not found");
    const pageSize = invoiceSizeMap[invoiceSize];
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "0";
    container.style.background = "white";
    container.style.width = `${pageSize.px}px`;
    container.style.minWidth = `${pageSize.px}px`;
    container.style.display = "block";
    container.style.padding = "0";
    container.style.boxSizing = "border-box";
    container.className = doc.body.className;
    doc.querySelectorAll("style").forEach((style) => container.appendChild(style.cloneNode(true)));
    container.appendChild(inv.cloneNode(true));
    document.body.appendChild(container);
    return { container, pageSize };
  };

  const handlePrint = () => {
    // Generate PDF then open in new tab and trigger print
    const loadScript = (src: string) => new Promise<void>((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement("script"); s.src = src; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });

    const printPdf = async () => {
      try {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
        const html = createInvoiceHtml();
        const { container, pageSize } = prepareInvoiceCanvasContainer(html);
        const html2canvas = (window as any).html2canvas;
        const { jsPDF } = (window as any).jspdf || (window as any).window?.jspdf || (window as any);
        if (!html2canvas || !jsPDF) throw new Error('Required PDF libraries not available');
        const canvas = await html2canvas(container, { scale: 2, useCORS: true, allowTaint: true, width: pageSize.px, windowWidth: pageSize.px });
        const imgData = canvas.toDataURL('image/png');
        const pxToMm = (px: number) => px * 0.264583;
        const pdfWidth = pxToMm(canvas.width);
        const pdfHeight = pxToMm(canvas.height);
        const pdf = new jsPDF({ unit: 'mm', format: [pdfWidth, pdfHeight] });
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (win) {
          win.focus();
          setTimeout(() => { try { win.print(); } catch { /* ignore */ } }, 500);
        } else {
          // Fallback to downloading if popup blocked
          const a = document.createElement('a'); a.href = url; a.download = `${invoiceNo}.pdf`; document.body.appendChild(a); a.click(); a.remove();
        }
        document.body.removeChild(container);
        saveInvoice();
      } catch (err) {
        console.error(err);
        // fallback to original HTML print
        const win = window.open("", "_blank");
        if (!win) return;
        const html = createInvoiceHtml();
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 400);
        saveInvoice();
      }
    };

    printPdf();
  };

  const handleDownload = () => {
    // Generate a PDF from the invoice HTML using html2canvas + jsPDF (CDN).
    const loadScript = (src: string) => new Promise<void>((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement("script"); s.src = src; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });

    const makePdf = async () => {
      try {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
        // parse invoice HTML and get the .inv element
        const html = createInvoiceHtml();
        const { container, pageSize } = prepareInvoiceCanvasContainer(html);

        // use the global html2canvas and jspdf
        const html2canvas = (window as any).html2canvas;
        const { jsPDF } = (window as any).jspdf || (window as any).window?.jspdf || (window as any);
        if (!html2canvas || !jsPDF) throw new Error('Required PDF libraries not available');

        const canvas = await html2canvas(container, { scale: 2, useCORS: true, allowTaint: true, width: pageSize.px, windowWidth: pageSize.px });
        const imgData = canvas.toDataURL('image/png');

        // convert px -> mm (1px = 0.264583 mm at 96dpi)
        const pxToMm = (px: number) => px * 0.264583;
        const pdfWidth = pxToMm(canvas.width);
        const pdfHeight = pxToMm(canvas.height);

        const pdf = new jsPDF({ unit: 'mm', format: [pdfWidth, pdfHeight] });
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`${invoiceNo}.pdf`);

        document.body.removeChild(container);
        saveInvoice();
      } catch (err) {
        // Fallback to HTML download if PDF generation fails
        console.error(err);
        const html = createInvoiceHtml();
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${invoiceNo}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        saveInvoice();
      }
    };

    makePdf();
  };

  const sendWhatsApp = () => {
    if (!selectedCustomer) return;
    const msg = `*Invoice ${invoiceNo}*\nDear ${selectedCustomer.name},\nThank you for your purchase!\n\n${items.map((i) => `• ${i.name} × ${i.qty} = ${fmt(i.qty * i.price)}`).join("\n")}\n\n*Grand Total: ${fmt(grandTotal)}*${invoiceKind === "tax" ? " (incl. GST)" : ""}\n\n${profile.shopName}${profile.phone ? ` | ${profile.phone}` : ""}`;
    window.open(`https://wa.me/91${selectedCustomer.phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card rounded-xl p-5 border border-border shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Invoice Details</h3>
              <span className="text-xs font-[DM_Mono] text-muted-foreground bg-muted px-2 py-1 rounded-md">{invoiceNo}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
                <input type="date" defaultValue={new Date().toISOString().split("T")[0]} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Due Date</label>
                <input type="date" className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Bill To</label>
              {customers.length > 0 ? (
                <select onChange={(e) => setSelectedCustomer(customers.find((c) => c.id === +e.target.value) || null)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Select Customer...</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
                </select>
              ) : (
                <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">No customers added yet. Add a customer first.</div>
              )}
              {selectedCustomer && (
                <div className="mt-2 p-3 bg-secondary/50 rounded-lg text-xs text-muted-foreground space-y-0.5">
                  <p><MapPin className="w-3 h-3 inline mr-1" />{selectedCustomer.address}</p>
                  {selectedCustomer.gst && <p className="font-[DM_Mono]">GST: {selectedCustomer.gst}</p>}
                </div>
              )}
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Scan Registered Barcode</label>
                  <div className="flex gap-2">
                    <input
                      value={scanCode}
                      onChange={(e) => setScanCode(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleScanCode(scanCode)}
                      placeholder="Scan or paste barcode / SKU"
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button onClick={() => handleScanCode(scanCode)} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">Add</button>
                  </div>
                  {scanMessage && <p className="mt-2 text-xs text-muted-foreground">{scanMessage}</p>}
                </div>
                <div>
                  <button onClick={() => onNavigate("inventory")} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm">
                    <Package className="w-4 h-4" />
                    Go to Inventory
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 mt-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Sale Type</label>
                  {(["normal", "cash"] as const).map((type) => (
                    <label key={type} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${saleType === type ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                      <input type="radio" name="saleType" value={type} checked={saleType === type} onChange={() => {
                        setSaleType(type);
                        if (type === "cash") { setPaymentStatus("paid"); setPaidAmount(grandTotal); }
                      }} className="accent-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{type === "cash" ? "Cash Sale" : "Normal Sale"}</p>
                        <p className="text-xs text-muted-foreground">{type === "cash" ? "Immediate payment" : "Payment may be completed later"}</p>
                      </div>
                    </label>
                  ))}
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Invoice Type</label>
                  {(["tax", "regular"] as const).map((kind) => (
                    <label key={kind} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${invoiceKind === kind ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                      <input type="radio" name="invoiceKind" value={kind} checked={invoiceKind === kind} onChange={() => setInvoiceKind(kind)} className="accent-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{kind === "tax" ? "Tax Invoice" : "Invoice"}</p>
                        <p className="text-xs text-muted-foreground">{kind === "tax" ? "Show TAX INVOICE label" : "Show INVOICE label"}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
            <h3 className="font-semibold text-foreground mb-3">Items</h3>
            <div className="text-xs font-medium text-muted-foreground grid grid-cols-12 gap-2 mb-2 px-1">
              <span className="col-span-4">Product</span><span className="col-span-2 text-center">Qty</span><span className="col-span-2">Rate</span><span className="col-span-2">GST</span><span className="col-span-1 text-right">Amt</span>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4">
                    {products.length > 0 ? (
                      <select value={item.productId} onChange={(e) => {
                        const p = products.find((p) => p.id === +e.target.value);
                        if (p) { updateItem(idx, "productId", p.id); updateItem(idx, "name", p.name); updateItem(idx, "price", p.price); }
                      }} className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                        <option value={0}>Select...</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    ) : (
                      <input value={item.name} onChange={(e) => updateItem(idx, "name", e.target.value)} placeholder="Item name"
                        className="w-full px-2 py-1.5 bg-background border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    )}
                  </div>
                  <input type="number" value={item.qty} onChange={(e) => updateItem(idx, "qty", +e.target.value)} min={1}
                    className="col-span-2 px-2 py-1.5 bg-background border border-border rounded-lg text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  <input type="number" value={item.price} onChange={(e) => updateItem(idx, "price", +e.target.value)}
                    className="col-span-2 px-2 py-1.5 bg-background border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  <select value={item.gstRate} onChange={(e) => updateItem(idx, "gstRate", +e.target.value)}
                    className="col-span-2 px-2 py-1.5 bg-background border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30">
                    {[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}
                  </select>
                  <span className="col-span-1 text-xs font-[DM_Mono] font-semibold text-right">{fmt(item.qty * item.price)}</span>
                  <button onClick={() => removeItem(idx)} className="col-span-1 p-1 text-red-400 hover:text-red-600 transition-colors flex justify-end"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            <button onClick={addItem} className="mt-3 flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"><Plus className="w-3.5 h-3.5" /> Add Item</button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
            <h3 className="font-semibold text-foreground mb-3">Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="font-[DM_Mono]">{fmt(subtotal)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>GST</span><span className="font-[DM_Mono]">{fmt(totalGst)}</span></div>
              <div className="h-px bg-border my-2" />
              <div className="flex justify-between font-bold text-lg text-primary"><span>Total</span><span className="font-[DM_Mono]">{fmt(grandTotal)}</span></div>
            </div>
          </div>

          <div className="bg-card rounded-xl p-5 border border-border shadow-sm space-y-2">
            <h3 className="font-semibold text-foreground mb-1">Bill Design</h3>
            {INVOICE_TEMPLATES.map((template) => (
              <label key={template.id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${invoiceTemplate === template.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                <input type="radio" name="invoiceTemplate" value={template.id} checked={invoiceTemplate === template.id} onChange={() => setInvoiceTemplate(template.id)} className="accent-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">{template.label}</p>
                  <p className="text-xs text-muted-foreground">{template.desc}</p>
                </div>
              </label>
            ))}
          </div>

          <div className="bg-card rounded-xl p-5 border border-border shadow-sm space-y-2">
            <h3 className="font-semibold text-foreground mb-1">Paper Size</h3>
            {(["a4", "a5", "thermal"] as const).map((s) => (
              <label key={s} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${invoiceSize === s ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                <input type="radio" name="invsize" value={s} checked={invoiceSize === s} onChange={() => setInvoiceSize(s)} className="accent-primary" />
                <div><p className="text-sm font-medium text-foreground">{s === "thermal" ? "Thermal 80mm" : s.toUpperCase()}</p><p className="text-xs text-muted-foreground">{s === "a4" ? "210×297mm" : s === "a5" ? "148×210mm" : "80mm roll"}</p></div>
              </label>
            ))}
          </div>
          <div className="bg-card rounded-xl p-5 border border-border shadow-sm space-y-2">
            <h3 className="font-semibold text-foreground mb-1">Payment Status</h3>
            {(["paid", "partial", "unpaid"] as const).map((status) => (
              <label key={status} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${paymentStatus === status ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"} ${saleType === "cash" && status !== "paid" ? "opacity-50 cursor-not-allowed" : ""}`}>
                <input type="radio" name="paymentStatus" value={status} checked={paymentStatus === status} disabled={saleType === "cash" && status !== "paid"} onChange={() => setPaymentStatus(status)} className="accent-primary" />
                <div><p className="text-sm font-medium text-foreground">{status === "paid" ? "Paid" : status === "unpaid" ? "Unpaid" : "Partially Paid"}</p><p className="text-xs text-muted-foreground">{status === "paid" ? "Full payment received" : status === "unpaid" ? "Payment pending" : "Partial payment accepted"}</p></div>
              </label>
            ))}
            {saleType === "cash" && <p className="text-xs text-amber-600">Cash sale invoices are recorded as paid instantly.</p>}
            {paymentStatus === "partial" && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Amount Paid (₹)</label>
                <input type="number" value={paidAmount} min={0} max={grandTotal} onChange={(e) => setPaidAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <p className="text-xs text-muted-foreground mt-2">Due: ₹{fmt(Math.max(0, grandTotal - paidAmount))}</p>
              </div>
            )}
          </div>
          {selectedCustomer && (
            <button onClick={sendWhatsApp} className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-medium hover:bg-emerald-600 transition-colors shadow-sm">
              <MessageCircle className="w-4 h-4" /> Send on WhatsApp
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={handlePrint} className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"><Printer className="w-4 h-4" /> Print Invoice</button>
        <button onClick={handleDownload} className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors"><Download className="w-4 h-4" /> Download Invoice</button>
        <button onClick={() => setShowPreview((v) => !v)} className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-muted transition-colors">{showPreview ? "Hide Preview" : "Show Preview"}</button>
      </div>

      {showPreview && (
        <div className="bg-card rounded-xl border border-border shadow-sm p-6">
          <iframe
            title="Invoice preview"
            srcDoc={createInvoiceHtml()}
            className="w-full h-[720px] rounded-lg border border-border bg-white"
          />
        </div>
      )}
    </div>
  );
}

// ─── Invoice Records ───────────────────────────────────────────────────────────
function InvoicesView({ invoices, onDelete }: { invoices: InvoiceRecord[]; onDelete: (id: string) => void; }) {
  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">All Invoices</h3>
            <p className="text-sm text-muted-foreground">Review, search and remove invoice records.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-xs text-muted-foreground">
            {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
          </div>
        </div>
        {invoices.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No invoices have been created yet. Create an invoice first to see it here.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border/70">
                  <th className="py-3 px-3">Invoice No</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Customer</th>
                  <th className="py-3 px-3">Total</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-3 font-[DM_Mono] text-foreground">{invoice.id}</td>
                    <td className="py-3 px-3 text-muted-foreground">{invoice.date}</td>
                    <td className="py-3 px-3 text-foreground">{invoice.customerName}</td>
                    <td className="py-3 px-3 font-[DM_Mono] text-foreground">{fmt(invoice.total)}</td>
                    <td className="py-3 px-3 text-xs font-semibold uppercase">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full ${invoice.status === "paid" ? "bg-emerald-100 text-emerald-700" : invoice.status === "partial" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                        {invoice.status || "UNPAID"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button onClick={() => { if (window.confirm(`Delete invoice ${invoice.id}?`)) onDelete(invoice.id); }}
                        className="text-xs text-red-600 hover:text-red-800 font-semibold">
                        Remove
                      </button>
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
}

// ─── Barcode ──────────────────────────────────────────────────────────────────
function BarcodeView({ products }: { products: Product[] }) {
  const [barcodeValue, setBarcodeValue] = useState("8901234567890");
  const [labelText, setLabelText] = useState("Product Name");
  const [mrp, setMrp] = useState("");
  const [qty, setQty] = useState(1);
  const [paperSize, setPaperSize] = useState("A4");
  const [labelSize, setLabelSize] = useState("medium");
  const labelSizes = { small: { w: "38mm", h: "13mm", label: "Small (38×13mm)" }, medium: { w: "50mm", h: "25mm", label: "Medium (50×25mm)" }, large: { w: "100mm", h: "50mm", label: "Large (100×50mm)" } };
  const cols = paperSize === "A4" ? Math.floor(210 / parseFloat(labelSizes[labelSize as keyof typeof labelSizes].w)) : 3;

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const sz = labelSizes[labelSize as keyof typeof labelSizes];
    const labels = Array(qty).fill(null).map(() => `<div class="label"><p class="name">${labelText}</p><svg width="100%" height="28" viewBox="0 0 220 38">${generateSVGBars(barcodeValue)}</svg>${mrp ? `<p class="mrp">MRP: ₹${mrp}</p>` : ""}<p class="bc">${barcodeValue}</p></div>`).join("");
    win.document.write(`<html><head><title>Labels</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif}.grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:3mm;padding:8mm}.label{border:.5px solid #ccc;padding:1.5mm;width:${sz.w};height:${sz.h};overflow:hidden;display:flex;flex-direction:column;justify-content:center;align-items:center}.name{font-size:7px;font-weight:600;text-align:center;margin-bottom:.5mm}.mrp{font-size:7px;font-weight:700;margin-top:.5mm}.bc{font-size:6px;font-family:monospace}@media print{body{margin:0}}</style></head><body><div class="grid">${labels}</div></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl p-5 border border-border shadow-sm space-y-4">
          <h3 className="font-semibold text-foreground">Barcode Generator</h3>
          {[["Barcode Value", barcodeValue, (v: string) => setBarcodeValue(v), "text"], ["Product Label", labelText, (v: string) => setLabelText(v), "text"], ["MRP (₹)", mrp, (v: string) => setMrp(v), "number"]].map(([label, val, setter, type]) => (
            <div key={label as string}>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{label as string}</label>
              <input type={type as string} value={val as string} onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-[DM_Mono] focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          ))}
          <div className="p-6 bg-white rounded-xl border border-border flex flex-col items-center gap-2 shadow-inner">
            <p className="text-xs font-semibold text-foreground">{labelText}</p>
            <BarcodeDisplay value={barcodeValue} height={60} />
            {mrp && <p className="text-xs font-bold text-foreground">MRP: ₹{mrp}</p>}
          </div>
          <button onClick={() => navigator.clipboard?.writeText(barcodeValue)} className="w-full flex items-center justify-center gap-2 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">
            <Copy className="w-3.5 h-3.5" /> Copy Barcode Value
          </button>
        </div>

        <div className="bg-card rounded-xl p-5 border border-border shadow-sm space-y-4">
          <h3 className="font-semibold text-foreground">Print Labels</h3>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Number of Labels: <span className="text-foreground font-semibold">{qty}</span></label>
            <div className="flex items-center gap-3">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-lg text-muted-foreground hover:bg-muted transition-colors">−</button>
              <input type="number" value={qty} min={1} max={500} onChange={(e) => setQty(Math.min(500, Math.max(1, +e.target.value)))} className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-center font-[DM_Mono] focus:outline-none focus:ring-2 focus:ring-primary/30" />
              <button onClick={() => setQty((q) => Math.min(500, q + 1))} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-lg text-muted-foreground hover:bg-muted transition-colors">+</button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Paper Size</label>
            <div className="grid grid-cols-3 gap-2">{["A4", "A5", "4×6 Thermal"].map((s) => <button key={s} onClick={() => setPaperSize(s)} className={`py-2 rounded-lg text-xs font-medium border transition-all ${paperSize === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>{s}</button>)}</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Label Size</label>
            <div className="space-y-1.5">{Object.entries(labelSizes).map(([key, val]) => <label key={key} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${labelSize === key ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}><input type="radio" name="lsize" value={key} checked={labelSize === key} onChange={() => setLabelSize(key)} className="accent-primary" /><span className="text-sm text-foreground">{val.label}</span></label>)}</div>
          </div>
          <button onClick={handlePrint} className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm">
            <Printer className="w-4 h-4" /> Print {qty} Label{qty !== 1 ? "s" : ""}
          </button>
        </div>
      </div>

      {products.length > 0 && (
        <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
          <h3 className="font-semibold text-foreground mb-3">Generate from Inventory</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {products.map((p) => (
              <button key={p.id} onClick={() => { setBarcodeValue(p.barcode); setLabelText(p.name); setMrp(String(p.price)); }}
                className="text-left p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-all">
                <p className="text-xs font-semibold text-foreground truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground font-[DM_Mono] mt-0.5 truncate">{p.barcode}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GST / ITR ────────────────────────────────────────────────────────────────
function GSTView({ profile }: { profile: Profile }) {
  const gstLinks = [
    { label: "File GSTR-1 (Outward Supplies)", desc: "Monthly/quarterly return for outward supplies", url: "https://www.gst.gov.in/", badge: "Monthly" },
    { label: "File GSTR-3B (Summary Return)", desc: "Monthly summary return with tax payment", url: "https://www.gst.gov.in/", badge: "Monthly" },
    { label: "File GSTR-9 (Annual Return)", desc: "Annual consolidated return for the financial year", url: "https://www.gst.gov.in/", badge: "Annual" },
    { label: "Track GST Refund", desc: "Check status of your pending GST refund applications", url: "https://www.gst.gov.in/", badge: "Anytime" },
    { label: "GST Payment (DRC-03)", desc: "Pay GST liability through internet banking or UPI", url: "https://www.gst.gov.in/", badge: "Anytime" },
    { label: "E-Invoice Registration", desc: "Register for e-invoicing if turnover exceeds ₹5 crore", url: "https://einvoice1.gst.gov.in/", badge: "Setup" },
  ];
  return (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
        <Globe className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Official GST Government Portal</p>
          <p className="text-xs text-blue-600 mt-0.5">All links open the official portal at <strong>www.gst.gov.in</strong>. You will need your GST credentials to log in.{profile.gst && <span className="ml-1">Your GST No: <span className="font-[DM_Mono] font-semibold">{profile.gst}</span></span>}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {gstLinks.map((link) => (
          <button key={link.label} onClick={() => window.open(link.url, "_blank")}
            className="text-left p-4 bg-card rounded-xl border border-border shadow-sm hover:border-primary/30 hover:shadow-md transition-all group">
            <div className="flex items-start justify-between mb-2">
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors flex-1 pr-2">{link.label}</p>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{link.badge}</span>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{link.desc}</p>
          </button>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-xs text-amber-700"><span className="font-semibold">Reminder:</span> GSTR-1 is due by the 11th of each month. GSTR-3B is due by the 20th. Keep your filings up to date to avoid penalties.</p>
      </div>
    </div>
  );
}

// ─── Customers ────────────────────────────────────────────────────────────────
function CustomersView({ customers, setCustomers, profile }: {
  customers: Customer[]; setCustomers: (v: Customer[] | ((p: Customer[]) => Customer[])) => void; profile: Profile;
}) {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", gst: "" });
  const filtered = customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search));

  const handleAdd = () => {
    if (!form.name || !form.phone) return;
    setCustomers((prev) => [...prev, { id: Date.now(), name: form.name, phone: form.phone, email: form.email, address: form.address, gst: form.gst, totalSpent: 0, lastPurchase: "-" }]);
    setForm({ name: "", phone: "", email: "", address: "", gst: "" });
    setShowAdd(false);
  };

  const sendWhatsApp = (c: Customer) => {
    const msg = `Hello ${c.name}!\nThank you for shopping at ${profile.shopName}.\n\nFor any queries, contact us at ${profile.phone}.\n\nWe look forward to serving you again! 🙏`;
    window.open(`https://wa.me/91${c.phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers..."
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm">
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      {showAdd && (
        <div className="bg-card rounded-xl p-5 border border-primary/20 shadow-sm space-y-4">
          <h3 className="font-semibold text-foreground">New Customer</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[["Full Name *", "name", ""], ["WhatsApp / Phone *", "phone", "10-digit number"], ["Email", "email", ""], ["GST Number", "gst", "Optional"]].map(([label, key, placeholder]) => (
              <div key={key as string}>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{label as string}</label>
                <input value={(form as any)[key as string]} onChange={(e) => setForm((f) => ({ ...f, [key as string]: e.target.value }))} placeholder={placeholder as string}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Address</label>
              <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
            <button onClick={handleAdd} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">Save Customer</button>
          </div>
        </div>
      )}

      {customers.length === 0 ? (
        <EmptyState icon={Users} title="No customers yet" desc="Add your first customer to start managing contacts and sending invoices." action={<button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"><Plus className="w-4 h-4" /> Add First Customer</button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <div key={c.id} onClick={() => setSelected(selected === c.id ? null : c.id)}
              className={`bg-card rounded-xl p-4 border shadow-sm transition-all cursor-pointer ${selected === c.id ? "border-primary shadow-primary/10" : "border-border hover:border-primary/30"}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">{c.name.charAt(0).toUpperCase()}</div>
                <span className="text-xs font-semibold text-emerald-600 font-[DM_Mono]">{c.totalSpent > 0 ? fmt(c.totalSpent) : "—"}</span>
              </div>
              <p className="font-semibold text-sm text-foreground">{c.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</p>
              {c.email && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3" />{c.email}</p>}
              {c.address && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate"><MapPin className="w-3 h-3 shrink-0" />{c.address}</p>}
              {c.gst && <p className="text-xs text-muted-foreground font-[DM_Mono] mt-0.5">GST: {c.gst}</p>}
              {selected === c.id && (
                <div className="mt-3 pt-3 border-t border-border flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); sendWhatsApp(c); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-500 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setCustomers((prev) => prev.filter((x) => x.id !== c.id)); setSelected(null); }}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function SettingsView({ settings, setSettings, profile, setProfile }: {
  settings: AppSettings; setSettings: (v: AppSettings | ((p: AppSettings) => AppSettings)) => void;
  profile: Profile; setProfile: (v: Profile | ((p: Profile) => Profile)) => void;
}) {
  const [saved, setSaved] = useState(false);
  const [localProfile, setLocalProfile] = useState(profile);

  const handleSave = () => {
    setProfile(localProfile);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const Toggle = ({ label, desc, field }: { label: string; desc: string; field: keyof AppSettings }) => (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
      <div><p className="text-sm font-medium text-foreground">{label}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
      <button onClick={() => setSettings((s) => ({ ...s, [field]: !s[field] }))}
        className={`relative w-11 h-6 rounded-full transition-colors ${settings[field] ? "bg-primary" : "bg-muted"}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings[field] ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-card rounded-xl p-5 border border-border shadow-sm space-y-4">
        <h3 className="font-semibold text-foreground">Business Information</h3>
        <div className="p-3 rounded-lg bg-muted/60 border border-border/70">
          <p className="text-xs font-medium text-muted-foreground mb-1">Business ID</p>
          <p className="text-sm font-[DM_Mono] text-foreground">{profile.businessId || "Not assigned"}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([["Shop / Business Name", "shopName"], ["Owner Name", "ownerName"], ["Phone / WhatsApp", "phone"], ["Email", "email"], ["GST Number", "gst"], ["PAN Number", "pan"]] as [string, keyof Profile][]).map(([label, key]) => (
            <div key={key}>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
              <input value={localProfile[key]} onChange={(e) => setLocalProfile((p) => ({ ...p, [key]: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Full Address</label>
            <input value={localProfile.address} onChange={(e) => setLocalProfile((p) => ({ ...p, address: e.target.value }))}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl p-5 border border-border shadow-sm space-y-4">
        <h3 className="font-semibold text-foreground">Tax & Billing</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Default GST Rate</label>
            <select value={settings.defaultGst} onChange={(e) => setSettings((s) => ({ ...s, defaultGst: e.target.value }))}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              {["0", "5", "12", "18", "28"].map((r) => <option key={r} value={r}>{r}% GST</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Tax Mode</label>
            <select value={settings.taxMode} onChange={(e) => setSettings((s) => ({ ...s, taxMode: e.target.value }))}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="exclusive">GST Exclusive (add on top)</option>
              <option value="inclusive">GST Inclusive (included in price)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
        <h3 className="font-semibold text-foreground mb-2">Print Preferences</h3>
        <Toggle label="Print Header on Invoice" desc="Show business name and contact on printed invoices" field="printHeader" />
        <Toggle label="Print Footer on Invoice" desc="Show thank-you note and terms at the bottom" field="printFooter" />
        <Toggle label="Auto-open WhatsApp after invoice" desc="Prompt to send invoice on WhatsApp when customer selected" field="autoWhatsApp" />
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm ${saved ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}>
          {saved ? <><Check className="w-4 h-4" /> Saved!</> : "Save Changes"}
        </button>
        {saved && <p className="text-xs text-emerald-600">All changes saved to your device.</p>}
      </div>
    </div>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────
function ProfileView({ profile, setProfile, invoices, products, customers }: {
  profile: Profile; setProfile: (v: Profile | ((p: Profile) => Profile)) => void;
  invoices: InvoiceRecord[]; products: Product[]; customers: Customer[];
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(profile);
  const totalRevenue = invoices.reduce((s, i) => s + i.total, 0);

  const handleSave = () => { setProfile(local); setEditing(false); };
  const handleReset = () => {
    if (window.confirm("This will clear ALL your data (products, customers, invoices, settings) and restart setup. Are you sure?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold shadow-sm">
            {profile.shopName ? profile.shopName.charAt(0).toUpperCase() : "?"}
          </div>
          <div>
            <h2 className="font-bold text-xl text-foreground">{profile.shopName || "Your Shop"}</h2>
            <p className="text-sm text-muted-foreground">{profile.ownerName}</p>
            <p className="text-xs text-muted-foreground">{profile.category}{profile.established ? ` · Est. ${profile.established}` : ""}</p>
          </div>
          <button onClick={() => { setLocal(profile); setEditing(!editing); }} className="ml-auto flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">
            <Edit2 className="w-3.5 h-3.5" /> {editing ? "Cancel" : "Edit"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {([["Business ID", "businessId"], ["Shop Name", "shopName"], ["Owner Name", "ownerName"], ["Phone", "phone"], ["Email", "email"], ["GST Number", "gst"], ["PAN Number", "pan"], ["Category", "category"], ["Established", "established"]] as [string, keyof Profile][]).map(([label, key]) => (
            <div key={key}>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
              {editing && key !== "businessId" ? (
                <input value={local[key]} onChange={(e) => setLocal((p) => ({ ...p, [key]: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              ) : (
                <p className={`text-sm text-foreground ${key === "businessId" ? "font-[DM_Mono]" : ""}`}>{profile[key] || <span className="text-muted-foreground italic">Not set</span>}</p>
              )}
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1">Address</label>
            {editing ? (
              <input value={local.address} onChange={(e) => setLocal((p) => ({ ...p, address: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            ) : (
              <p className="text-sm text-foreground">{profile.address || <span className="text-muted-foreground italic">Not set</span>}</p>
            )}
          </div>
        </div>
        {editing && <button onClick={handleSave} className="mt-4 flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"><Check className="w-4 h-4" /> Save Profile</button>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[{ label: "Total Revenue", value: fmt(totalRevenue), icon: IndianRupee, color: "text-blue-600 bg-blue-50" }, { label: "Invoices Raised", value: String(invoices.length), icon: FileText, color: "text-emerald-600 bg-emerald-50" }, { label: "Customers", value: String(customers.length), icon: Users, color: "text-purple-600 bg-purple-50" }, { label: "Products", value: String(products.length), icon: Boxes, color: "text-amber-600 bg-amber-50" }].map((s) => (
          <div key={s.label} className="bg-card rounded-xl p-4 border border-border shadow-sm text-center">
            <span className={`inline-flex p-2.5 rounded-xl mb-2 ${s.color}`}><s.icon className="w-5 h-5" /></span>
            <p className="font-bold text-lg font-[DM_Mono] text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-700">Reset All Data</p>
          <p className="text-xs text-red-600 mt-0.5 mb-2">This permanently deletes all your products, customers, invoices and settings from this device.</p>
          <button onClick={handleReset} className="text-xs font-medium text-red-600 border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors">Reset & Start Over</button>
        </div>
      </div>
    </div>
  );
}

// ─── Closed PPI ───────────────────────────────────────────────────────────────
function ClosedPPIView({ cards, setCards, profile }: {
  cards: PPICard[];
  setCards: (v: PPICard[] | ((p: PPICard[]) => PPICard[])) => void;
  profile: Profile;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "expired" | "blocked" | "low" | "vip" | "expiring">("all");
  const [selected, setSelected] = useState<PPICard | null>(null);
  const [drawerTab, setDrawerTab] = useState<"profile" | "card" | "history" | "offers">("profile");
  const [showRecharge, setShowRecharge] = useState(false);
  const [rechargeTarget, setRechargeTarget] = useState<PPICard | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [rAmt, setRAmt] = useState("");
  const [rMethod, setRMethod] = useState("Cash");
  const [rNote, setRNote] = useState("");
  const [cForm, setCForm] = useState({ name: "", mobile: "", email: "", address: "", category: "regular" as PPICard["category"], walletLimit: "10000", kycStatus: "pending" as PPICard["kycStatus"], months: "12" });

  const today = new Date().toISOString().split("T")[0];
  const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  const totalBalance = cards.reduce((s, c) => s + c.balance, 0);
  const activeCards = cards.filter(c => c.status === "active" && daysUntil(c.expiryDate) >= 0);
  const expiringSoon = activeCards.filter(c => daysUntil(c.expiryDate) <= 30);
  const expiringWeek = activeCards.filter(c => daysUntil(c.expiryDate) <= 7);
  const todayRecharges = cards.reduce((s, c) => s + c.transactions.filter(t => t.date === today && t.type === "credit").reduce((ts, t) => ts + t.amount, 0), 0);

  const statusInfo = (c: PPICard) => {
    if (c.status === "blocked") return { label: "Blocked", cls: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
    const d = daysUntil(c.expiryDate);
    if (d < 0 || c.status === "expired") return { label: "Expired", cls: "bg-red-100 text-red-600", dot: "bg-red-500" };
    if (d <= 7) return { label: `${d}d left`, cls: "bg-red-100 text-red-600", dot: "bg-red-500" };
    if (d <= 30) return { label: `${d}d left`, cls: "bg-amber-100 text-amber-700", dot: "bg-amber-400" };
    return { label: "Active", cls: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" };
  };

  const filtered = cards.filter(c => {
    const q = search.toLowerCase();
    const ms = !q || c.customerName.toLowerCase().includes(q) || c.mobile.includes(q) || c.cardId.toLowerCase().includes(q);
    const mf =
      filter === "all" ? true :
      filter === "active" ? (c.status === "active" && daysUntil(c.expiryDate) >= 0) :
      filter === "expired" ? (c.status === "expired" || daysUntil(c.expiryDate) < 0) :
      filter === "blocked" ? c.status === "blocked" :
      filter === "low" ? c.balance < 200 :
      filter === "vip" ? c.category === "vip" :
      filter === "expiring" ? (daysUntil(c.expiryDate) >= 0 && daysUntil(c.expiryDate) <= 30) : true;
    return ms && mf;
  });

  const openRecharge = (c: PPICard) => { setRechargeTarget(c); setRAmt(""); setRNote(""); setShowRecharge(true); };

  const doRecharge = () => {
    if (!rechargeTarget || !rAmt || +rAmt <= 0) return;
    const amt = +rAmt;
    const newBal = rechargeTarget.balance + amt;
    const txn: PPITransaction = { id: Date.now().toString(), date: today, billNumber: `RCH-${Date.now()}`, amount: amt, type: "credit", remainingBalance: newBal, paymentMethod: rMethod, staffName: profile.ownerName || "Staff" };
    const tier: PPICard["loyaltyTier"] = newBal >= 5000 ? "platinum" : newBal >= 2000 ? "gold" : newBal >= 1000 ? "silver" : "bronze";
    const updated = { ...rechargeTarget, balance: newBal, transactions: [txn, ...rechargeTarget.transactions], loyaltyTier: tier };
    setCards(prev => prev.map(c => c.id === rechargeTarget.id ? updated : c));
    if (selected?.id === rechargeTarget.id) setSelected(updated);
    setShowRecharge(false); setRechargeTarget(null); setRAmt(""); setRNote("");
  };

  const doCreate = () => {
    if (!cForm.name || !cForm.mobile) return;
    const now = new Date();
    const exp = new Date(now); exp.setMonth(exp.getMonth() + +cForm.months);
    const num = String(cards.length + 1).padStart(4, "0");
    const card: PPICard = {
      id: Date.now().toString(), cardId: `PPI-${now.getFullYear()}-${num}`,
      customerName: cForm.name, mobile: cForm.mobile, email: cForm.email, address: cForm.address,
      category: cForm.category, issueDate: today, expiryDate: exp.toISOString().split("T")[0],
      kycStatus: cForm.kycStatus, walletLimit: +cForm.walletLimit, balance: 0,
      status: "active", rewardPoints: 0, loyaltyTier: "bronze", transactions: [],
      offers: [{ id: "w1", title: "Welcome Bonus", description: "5% cashback on first purchase", validTill: exp.toISOString().split("T")[0], minBill: 200, discountPct: 5, category: "All", code: `WELCOME${num}` }],
    };
    setCards(prev => [card, ...prev]);
    setShowCreate(false);
    setCForm({ name: "", mobile: "", email: "", address: "", category: "regular", walletLimit: "10000", kycStatus: "pending", months: "12" });
  };

  const sendWA = (c: PPICard, type: "balance" | "expiry" | "offer") => {
    const msgs = {
      balance: `Hello ${c.customerName}!\n\n💳 *PPI Wallet Balance*\nCard: ${c.cardId}\nBalance: *₹${c.balance.toLocaleString("en-IN")}*\nValid till: ${c.expiryDate}\n\nThank you — ${profile.shopName}`,
      expiry: `⚠️ *Wallet Expiry Reminder*\nDear ${c.customerName}, your PPI wallet *${c.cardId}* expires in *${daysUntil(c.expiryDate)} days* on ${c.expiryDate}.\nVisit us to renew. — ${profile.shopName}${profile.phone ? ` | ${profile.phone}` : ""}`,
      offer: `🎁 *Special Offer for You!*\nDear ${c.customerName},\nYou have *${c.offers.length}* active offer(s).\nPoints: ${c.rewardPoints} | Tier: ${c.loyaltyTier.toUpperCase()}\n\nVisit ${profile.shopName} to redeem!`,
    };
    window.open(`https://wa.me/91${c.mobile}?text=${encodeURIComponent(msgs[type])}`, "_blank");
  };

  const deleteCard = (c: PPICard) => {
    if (!window.confirm(`Delete PPI card ${c.cardId} for ${c.customerName}? This cannot be undone.`)) return;
    setCards(prev => prev.filter(x => x.id !== c.id));
    if (selected?.id === c.id) setSelected(null);
  };

  const toggleBlock = (c: PPICard) => {
    const next = { ...c, status: (c.status === "blocked" ? "active" : "blocked") as PPICard["status"] };
    setCards(prev => prev.map(x => x.id === c.id ? next : x));
    if (selected?.id === c.id) setSelected(next);
  };

  const tierCls: Record<PPICard["loyaltyTier"], string> = { bronze: "text-amber-700 bg-amber-50 border-amber-200", silver: "text-slate-600 bg-slate-100 border-slate-300", gold: "text-yellow-700 bg-yellow-50 border-yellow-200", platinum: "text-purple-700 bg-purple-50 border-purple-200" };
  const catCls: Record<PPICard["category"], string> = { regular: "text-blue-600 bg-blue-50", vip: "text-purple-600 bg-purple-50", student: "text-emerald-600 bg-emerald-50", staff: "text-orange-600 bg-orange-50" };

  const printStatement = (c: PPICard) => {
    const win = window.open("", "_blank"); if (!win) return;
    win.document.write(`<html><head><title>Statement - ${c.cardId}</title><style>body{font-family:sans-serif;padding:20px;color:#0d1b3e}h2{color:#1e40af}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #e2e8f2;padding:8px;text-align:left;font-size:12px}th{background:#f0f4f8;font-weight:600}.mono{font-family:monospace}</style></head><body>
    <h2>Transaction Statement</h2><p>Card: <span class="mono">${c.cardId}</span> | Customer: ${c.customerName} | Balance: ₹${c.balance.toLocaleString("en-IN")}</p>
    <table><thead><tr><th>Date</th><th>Bill No.</th><th>Type</th><th>Amount</th><th>Balance</th><th>Method</th><th>Staff</th></tr></thead><tbody>
    ${c.transactions.map(t => `<tr><td>${t.date}</td><td class="mono">${t.billNumber}</td><td>${t.type}</td><td>₹${Math.abs(t.amount).toLocaleString("en-IN")}</td><td>₹${t.remainingBalance.toLocaleString("en-IN")}</td><td>${t.paymentMethod}</td><td>${t.staffName}</td></tr>`).join("")}
    </tbody></table><p style="margin-top:16px;font-size:11px;color:#64748b">Generated by Bill Pilot — ${new Date().toLocaleString("en-IN")}</p></body></html>`);
    win.document.close(); setTimeout(() => win.print(), 400);
  };

  return (
    <div className="space-y-4 relative">
      {/* Recharge modal */}
      {showRecharge && rechargeTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-sm border border-border">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h2 className="font-bold text-foreground">Add Balance</h2>
                <p className="text-xs text-muted-foreground font-[DM_Mono]">{rechargeTarget.cardId} · {rechargeTarget.customerName}</p>
              </div>
              <button onClick={() => setShowRecharge(false)} className="p-2 rounded-lg hover:bg-muted transition-colors"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted/40 rounded-xl">
                <span className="text-sm text-muted-foreground">Current Balance</span>
                <span className="text-2xl font-bold font-[DM_Mono] text-primary">₹{rechargeTarget.balance.toLocaleString("en-IN")}</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">Quick Amount</label>
                <div className="grid grid-cols-4 gap-2">
                  {[100, 500, 1000, 2000].map(a => (
                    <button key={a} onClick={() => setRAmt(String(a))} className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${+rAmt === a ? "bg-primary text-primary-foreground border-primary shadow-sm" : "border-border text-foreground hover:border-primary/40 hover:bg-primary/5"}`}>₹{a}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Custom Amount (₹)</label>
                <input type="number" value={rAmt} onChange={e => setRAmt(e.target.value)} placeholder="0"
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl text-2xl font-[DM_Mono] font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 text-center" />
                {rAmt && +rAmt > 0 && <p className="text-xs text-emerald-600 mt-1 text-center">New balance: <strong>₹{(rechargeTarget.balance + +rAmt).toLocaleString("en-IN")}</strong></p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">Payment Method</label>
                <div className="grid grid-cols-4 gap-2">
                  {["Cash", "UPI", "Card", "Net Banking"].map(m => (
                    <button key={m} onClick={() => setRMethod(m)} className={`py-2 rounded-lg text-xs font-medium border transition-all ${rMethod === m ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}>{m}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Notes (optional)</label>
                <input value={rNote} onChange={e => setRNote(e.target.value)} placeholder="e.g. Festival top-up"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
            <div className="flex gap-3 p-5 pt-0">
              <button onClick={() => setShowRecharge(false)} className="flex-1 py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button onClick={doRecharge} disabled={!rAmt || +rAmt <= 0} className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40 shadow-sm">
                Recharge ₹{rAmt ? Number(rAmt).toLocaleString("en-IN") : "0"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Active Cards", value: String(activeCards.length), sub: `${cards.length} total issued`, icon: CreditCard, color: "bg-blue-50 text-blue-600" },
          { label: "Expiring Soon", value: String(expiringSoon.length), sub: "within 30 days", icon: Clock, color: expiringSoon.length > 0 ? "bg-amber-50 text-amber-600" : "bg-muted text-muted-foreground" },
          { label: "Total Balance", value: `₹${totalBalance.toLocaleString("en-IN")}`, sub: "across all wallets", icon: Wallet, color: "bg-purple-50 text-purple-600" },
          { label: "Today's Recharges", value: `₹${todayRecharges.toLocaleString("en-IN")}`, sub: new Date().toLocaleDateString("en-IN"), icon: IndianRupee, color: "bg-emerald-50 text-emerald-600" },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl p-4 border border-border shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{s.label}</p>
              <span className={`p-1.5 rounded-lg ${s.color}`}><s.icon className="w-4 h-4" /></span>
            </div>
            <p className="text-xl font-bold font-[DM_Mono] text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {expiringWeek.length > 0 && (
        <div className="flex items-center gap-3 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>{expiringWeek.length} wallet{expiringWeek.length > 1 ? "s" : ""}</strong> expiring this week — send reminders now.</span>
          <button onClick={() => expiringWeek.forEach(c => sendWA(c, "expiry"))} className="ml-auto text-xs font-semibold border border-red-300 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors whitespace-nowrap flex items-center gap-1">
            <MessageCircle className="w-3 h-3" /> Send All
          </button>
        </div>
      )}
      {expiringSoon.length > 0 && expiringWeek.length === 0 && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>{expiringSoon.length} wallet{expiringSoon.length > 1 ? "s" : ""}</strong> expiring within 30 days.</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, mobile, or Card ID…"
            className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm whitespace-nowrap">
            <Plus className="w-4 h-4" /> New PPI Card
          </button>
          <button className="flex items-center gap-2 px-4 py-2.5 border border-border bg-card rounded-xl text-sm text-muted-foreground hover:bg-muted transition-colors">
            <QrCode className="w-4 h-4" /> Scan
          </button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {([
          ["all", "All Cards"],
          ["active", `Active (${activeCards.length})`],
          ["expiring", `Expiring (${expiringSoon.length})`],
          ["low", "Low Balance"],
          ["vip", "VIP"],
          ["blocked", "Blocked"],
          ["expired", "Expired"],
        ] as const).map(([f, l]) => (
          <button key={f} onClick={() => setFilter(f as typeof filter)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filter === f ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card border-border text-muted-foreground hover:border-primary/30"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Create card inline form */}
      {showCreate && (
        <div className="bg-card rounded-xl p-5 border border-primary/20 shadow-sm space-y-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" /> Issue New PPI Card</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {([["Customer Name *", "name", "text"], ["Mobile Number *", "mobile", "tel"], ["Email", "email", "email"]] as const).map(([l, k, t]) => (
              <div key={k}>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{l}</label>
                <input type={t} value={(cForm as any)[k]} onChange={e => setCForm(f => ({ ...f, [k]: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            ))}
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Address</label>
              <input value={cForm.address} onChange={e => setCForm(f => ({ ...f, address: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
              <select value={cForm.category} onChange={e => setCForm(f => ({ ...f, category: e.target.value as PPICard["category"] }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="regular">Regular</option><option value="vip">VIP</option>
                <option value="student">Student</option><option value="staff">Staff</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Wallet Limit (₹)</label>
              <input type="number" value={cForm.walletLimit} onChange={e => setCForm(f => ({ ...f, walletLimit: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Validity</label>
              <select value={cForm.months} onChange={e => setCForm(f => ({ ...f, months: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="6">6 Months</option><option value="12">1 Year</option>
                <option value="24">2 Years</option><option value="36">3 Years</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">KYC Status</label>
              <select value={cForm.kycStatus} onChange={e => setCForm(f => ({ ...f, kycStatus: e.target.value as PPICard["kycStatus"] }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="pending">Pending</option><option value="verified">Verified</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
            <button onClick={doCreate} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm">Issue Card</button>
          </div>
        </div>
      )}

      {/* Main content */}
      {cards.length === 0 ? (
        <EmptyState icon={Wallet} title="No PPI cards issued yet" desc="Issue your first Closed PPI wallet card to manage customer balances, offers and transaction history."
          action={<button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90"><Plus className="w-4 h-4" /> Issue First Card</button>} />
      ) : (
        <div className="flex gap-4 items-start">
          {/* Table */}
          <div className={`bg-card rounded-xl border border-border shadow-sm overflow-x-auto ${selected ? "hidden lg:block flex-1 min-w-0" : "w-full"}`}>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted/30">
                {["Customer", "Mobile", "Card ID", "Balance", "Validity", "Status", "Offers", "Last Txn", "Actions"].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">No cards match your search or filter.</td></tr>
                ) : filtered.map(c => {
                  const si = statusInfo(c);
                  const lastTxn = c.transactions[0];
                  return (
                    <tr key={c.id} onClick={() => { setSelected(selected?.id === c.id ? null : c); setDrawerTab("profile"); }}
                      className={`border-b border-border/50 cursor-pointer transition-colors ${selected?.id === c.id ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/20"}`}>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">{c.customerName.charAt(0)}</div>
                          <div>
                            <p className="font-medium text-foreground text-xs">{c.customerName}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize font-medium ${catCls[c.category]}`}>{c.category}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground font-[DM_Mono]">{c.mobile}</td>
                      <td className="px-3 py-3 text-xs font-[DM_Mono] font-semibold text-foreground">{c.cardId}</td>
                      <td className="px-3 py-3">
                        <span className={`text-sm font-bold font-[DM_Mono] ${c.balance < 200 ? "text-red-500" : c.balance < 500 ? "text-amber-600" : "text-emerald-600"}`}>₹{c.balance.toLocaleString("en-IN")}</span>
                        {c.balance < 200 && <span className="block text-[10px] text-red-400">Low</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground font-[DM_Mono] whitespace-nowrap">{c.expiryDate}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${si.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${si.dot}`} />{si.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {c.offers.length > 0 ? <span className="text-xs font-bold text-accent">{c.offers.length} active</span> : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground font-[DM_Mono] whitespace-nowrap">{lastTxn ? lastTxn.date : "—"}</td>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => openRecharge(c)} title="Recharge" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><IndianRupee className="w-3.5 h-3.5" /></button>
                          <button onClick={() => sendWA(c, "balance")} title="Send Balance" className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors"><MessageCircle className="w-3.5 h-3.5" /></button>
                          <button onClick={() => toggleBlock(c)} title={c.status === "blocked" ? "Unblock" : "Block"} className="p-1.5 text-muted-foreground hover:bg-muted rounded-lg transition-colors">
                            {c.status === "blocked" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => deleteCard(c)} title="Delete Card" className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Detail drawer */}
          {selected && (
            <div className="w-full lg:w-[380px] lg:shrink-0 bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
              {/* Drawer header */}
              <div className="p-4 border-b border-border bg-gradient-to-br from-primary/8 to-transparent">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold shadow-sm shrink-0">
                    {selected.customerName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="font-bold text-foreground text-sm">{selected.customerName}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border capitalize font-semibold ${tierCls[selected.loyaltyTier]}`}>{selected.loyaltyTier}</span>
                    </div>
                    <p className="text-xs text-muted-foreground font-[DM_Mono]">{selected.cardId}</p>
                    <p className="text-2xl font-bold font-[DM_Mono] text-primary mt-1">₹{selected.balance.toLocaleString("en-IN")}</p>
                  </div>
                  <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"><X className="w-4 h-4 text-muted-foreground" /></button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => openRecharge(selected)} className="flex items-center justify-center gap-1.5 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
                    <IndianRupee className="w-3.5 h-3.5" /> Recharge
                  </button>
                  <button onClick={() => sendWA(selected, "balance")} className="flex items-center justify-center gap-1.5 py-2 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" /> Balance
                  </button>
                  <button onClick={() => sendWA(selected, "expiry")} className="flex items-center justify-center gap-1.5 py-2 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors">
                    <Bell className="w-3.5 h-3.5" /> Remind
                  </button>
                </div>
              </div>

              {/* Drawer tabs */}
              <div className="flex border-b border-border shrink-0">
                {(["profile", "card", "history", "offers"] as const).map(t => (
                  <button key={t} onClick={() => setDrawerTab(t)}
                    className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors ${drawerTab === t ? "text-primary border-b-2 border-primary bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}>
                    {t === "history" ? "Txns" : t}
                  </button>
                ))}
              </div>

              {/* Drawer content */}
              <div className="overflow-y-auto" style={{ maxHeight: "480px" }}>
                {drawerTab === "profile" && (
                  <div className="p-4 space-y-0">
                    {([["Mobile", selected.mobile, Phone], ["Email", selected.email || "Not set", Mail], ["Address", selected.address || "Not set", MapPin], ["Category", selected.category, Users], ["Reward Points", String(selected.rewardPoints) + " pts", Award]] as [string, string, React.ElementType][]).map(([label, value, Icon]) => (
                      <div key={label} className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
                        <span className="p-1.5 bg-muted rounded-lg shrink-0"><Icon className="w-3.5 h-3.5 text-muted-foreground" /></span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
                          <p className="text-sm text-foreground capitalize truncate">{value}</p>
                        </div>
                      </div>
                    ))}
                    <div className="pt-3">
                      <button onClick={() => sendWA(selected, "offer")} className="w-full flex items-center justify-center gap-2 py-2.5 border border-border rounded-xl text-xs text-muted-foreground hover:bg-muted transition-colors">
                        <Gift className="w-3.5 h-3.5" /> Send Active Offers on WhatsApp
                      </button>
                    </div>
                  </div>
                )}

                {drawerTab === "card" && (
                  <div className="p-4 space-y-2">
                    {/* Visual card */}
                    <div className="p-4 bg-gradient-to-br from-[#1e40af] to-[#0f2557] rounded-xl text-white mb-4 shadow-md">
                      <p className="text-[10px] opacity-60 tracking-widest uppercase mb-2">Closed PPI Wallet</p>
                      <p className="font-[DM_Mono] text-lg font-bold tracking-[0.2em]">XXXX XXXX {selected.cardId.slice(-4)}</p>
                      <div className="flex justify-between mt-4 text-xs opacity-80">
                        <div><p className="text-[9px] uppercase opacity-70 mb-0.5">Issued</p><p className="font-[DM_Mono]">{selected.issueDate}</p></div>
                        <div className="text-center"><p className="text-[9px] uppercase opacity-70 mb-0.5">Limit</p><p className="font-[DM_Mono]">₹{selected.walletLimit.toLocaleString("en-IN")}</p></div>
                        <div className="text-right"><p className="text-[9px] uppercase opacity-70 mb-0.5">Expires</p><p className="font-[DM_Mono]">{selected.expiryDate}</p></div>
                      </div>
                      <div className="flex justify-between mt-3 items-end">
                        <p className="text-sm font-semibold">{selected.customerName}</p>
                        <p className="text-xs opacity-70">{selected.kycStatus === "verified" ? "✓ KYC Verified" : "⏳ KYC Pending"}</p>
                      </div>
                    </div>
                    {([
                      ["Wallet Limit", `₹${selected.walletLimit.toLocaleString("en-IN")}`, "font-[DM_Mono] text-foreground"],
                      ["Current Balance", `₹${selected.balance.toLocaleString("en-IN")}`, `font-[DM_Mono] font-bold ${selected.balance < 200 ? "text-red-500" : "text-emerald-600"}`],
                      ["KYC Status", selected.kycStatus, selected.kycStatus === "verified" ? "text-emerald-600 capitalize" : "text-amber-600 capitalize"],
                      ["Card Status", selected.status, `capitalize ${selected.status === "active" ? "text-emerald-600" : selected.status === "blocked" ? "text-gray-500" : "text-red-500"}`],
                      ["Loyalty Tier", selected.loyaltyTier.toUpperCase(), "text-purple-600 font-semibold"],
                      ["Total Transactions", String(selected.transactions.length), "text-foreground font-[DM_Mono]"],
                    ] as [string, string, string][]).map(([l, v, cls]) => (
                      <div key={l} className="flex justify-between items-center py-2.5 border-b border-border/50 last:border-0">
                        <span className="text-xs text-muted-foreground">{l}</span>
                        <span className={`text-sm ${cls}`}>{v}</span>
                      </div>
                    ))}
                    <div className="space-y-2">
                      <button onClick={() => toggleBlock(selected)}
                        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors border ${selected.status === "blocked" ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"}`}>
                        {selected.status === "blocked" ? "✓ Unblock This Card" : "⊘ Block This Card"}
                      </button>
                      <button onClick={() => deleteCard(selected)} className="w-full py-2.5 rounded-xl text-sm font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors">
                        <Trash2 className="w-4 h-4 inline mr-2" /> Delete Card
                      </button>
                    </div>
                  </div>
                )}

                {drawerTab === "history" && (
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">{selected.transactions.length} transactions</p>
                      <button onClick={() => printStatement(selected)} className="flex items-center gap-1 text-xs text-primary font-medium hover:underline">
                        <Download className="w-3 h-3" /> Statement
                      </button>
                    </div>
                    {selected.transactions.length === 0 ? (
                      <div className="text-center py-10">
                        <Clock className="w-8 h-8 text-muted/50 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">No transactions yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selected.transactions.map(t => (
                          <div key={t.id} className="flex items-center gap-3 p-2.5 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${t.type === "credit" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                              {t.type === "credit" ? "+" : "−"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-foreground">{t.type === "credit" ? "Recharge" : "Purchase"} · {t.paymentMethod}</p>
                              <p className="text-[10px] text-muted-foreground font-[DM_Mono]">{t.billNumber} · {t.date} · {t.staffName}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-xs font-bold font-[DM_Mono] ${t.type === "credit" ? "text-emerald-600" : "text-red-500"}`}>{t.type === "credit" ? "+" : "−"}₹{Math.abs(t.amount).toLocaleString("en-IN")}</p>
                              <p className="text-[10px] text-muted-foreground font-[DM_Mono]">₹{t.remainingBalance.toLocaleString("en-IN")}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {drawerTab === "offers" && (
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="p-3 bg-purple-50 rounded-xl border border-purple-100 text-center">
                        <p className="text-xl font-bold text-purple-700 font-[DM_Mono]">{selected.rewardPoints}</p>
                        <p className="text-[10px] text-purple-600 mt-0.5">Reward Points</p>
                      </div>
                      <div className={`p-3 rounded-xl border text-center ${tierCls[selected.loyaltyTier]}`}>
                        <p className="text-sm font-bold capitalize">{selected.loyaltyTier}</p>
                        <p className="text-[10px] opacity-70 mt-0.5">Loyalty Tier</p>
                        <p className="text-[10px] opacity-50 mt-0.5">{selected.loyaltyTier === "bronze" ? "→ ₹1000 for Silver" : selected.loyaltyTier === "silver" ? "→ ₹2000 for Gold" : selected.loyaltyTier === "gold" ? "→ ₹5000 for Platinum" : "Top Tier!"}</p>
                      </div>
                    </div>
                    {selected.offers.length === 0 ? (
                      <div className="text-center py-8">
                        <Gift className="w-8 h-8 text-muted/50 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">No active offers.</p>
                      </div>
                    ) : selected.offers.map(o => (
                      <div key={o.id} className="p-3.5 bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 rounded-xl">
                        <div className="flex items-start justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <Gift className="w-3.5 h-3.5 text-accent shrink-0" />
                            <p className="text-xs font-bold text-foreground">{o.title}</p>
                          </div>
                          <span className="text-[10px] bg-accent text-white px-1.5 py-0.5 rounded-full font-bold shrink-0">{o.discountPct}% off</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{o.description}</p>
                        <div className="flex items-center justify-between pt-2 border-t border-accent/15">
                          <p className="text-[10px] text-muted-foreground">Min ₹{o.minBill} · Expires {o.validTill}</p>
                          <span className="text-[10px] font-[DM_Mono] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">{o.code}</span>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => sendWA(selected, "offer")} className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 text-white rounded-xl text-xs font-semibold hover:bg-emerald-600 transition-colors">
                      <MessageCircle className="w-3.5 h-3.5" /> Send Offers on WhatsApp
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Navigation Config ────────────────────────────────────────────────────────
const NAV: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "demand", label: "Demand", icon: ShoppingCart },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "invoice", label: "Invoice", icon: FileText },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "reminders", label: "Reminders", icon: Bell },
  { id: "ewb", label: "E-Way Bill", icon: CreditCard },
  { id: "rates", label: "Party Rates", icon: Tag },
  { id: "bulk", label: "Bulk Update", icon: Download },
  { id: "backup", label: "Backup", icon: HardDrive },
  { id: "reports", label: "Reports", icon: TrendingUp },
  { id: "sync", label: "Sync", icon: Globe },
  { id: "barcode", label: "Barcode", icon: QrCode },
  { id: "ppi", label: "Closed PPI", icon: Wallet },
  { id: "gst", label: "GST / ITR", icon: Building2 },
  { id: "customers", label: "Customers", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "profile", label: "Profile", icon: User },
];

const TITLES: Record<Tab, string> = {
  dashboard: "Dashboard", demand: "Demand Orders", inventory: "Inventory",
  invoice: "Invoice Generator", invoices: "Invoice Records", reminders: "Bulk Payment Reminders",
  ewb: "E-Way Bill Management", rates: "Party Wise Item Rate", bulk: "Bulk Item Update",
  backup: "Data Backup", reports: "Business Reports", sync: "Data Sync Status",
  barcode: "Barcode & Labels", ppi: "Closed PPI Management", gst: "GST / ITR Filing",
  customers: "Customers", settings: "Settings", profile: "My Profile",
};

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [accounts, setAccounts] = useLocalStorage<BusinessAccount[]>(ACCOUNT_INDEX_KEY, []);
  const [activeBusinessId, setActiveBusinessId] = useLocalStorage<string>(ACTIVE_ACCOUNT_KEY, "");
  const activeAccount = accounts.find((a) => a.id === activeBusinessId);
  const storageKey = activeAccount?.storageKey || "billpro_no_active_account";
  const scoped = (key: string) => scopedStorageKey(storageKey, key);
  const [profile, setProfileBase] = useLocalStorage<Profile>(scoped("profile"), DEFAULT_PROFILE);
  const [settings, setSettings] = useLocalStorage<AppSettings>(scoped("settings"), DEFAULT_SETTINGS);
  const [products, setProducts] = useLocalStorage<Product[]>(scoped("products"), []);
  const [customers, setCustomers] = useLocalStorage<Customer[]>(scoped("customers"), []);
  const [demands, setDemands] = useLocalStorage<DemandOrder[]>(scoped("demands"), []);
  const [invoices, setInvoices] = useLocalStorage<InvoiceRecord[]>(scoped("invoices"), []);
  const [paymentReminders, setPaymentReminders] = useLocalStorage<PaymentReminder[]>(scoped("payment_reminders"), []);
  const [eWayBills, setEWayBills] = useLocalStorage<EWayBill[]>(scoped("eway_bills"), []);
  const [rateRules, setRateRules] = useLocalStorage<RateRule[]>(scoped("rate_rules"), []);
  const [backups, setBackups] = useLocalStorage<BackupRecord[]>(scoped("backups"), []);
  const [reports, setReports] = useLocalStorage<BusinessReport[]>(scoped("reports"), []);
  const [syncJobs, setSyncJobs] = useLocalStorage<SyncJob[]>(scoped("sync_jobs"), []);
  const [ppiCards, setPpiCards] = useLocalStorage<PPICard[]>(scoped("ppi_cards"), []);
  const [activeUser, setActiveUser] = useLocalStorage<UserAccount | null>(scoped("active_user"), null);
  const [sessionUser, setSessionUser] = useState<AuthSessionUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleAuthSuccess = (user: AuthSessionUser) => {
    setSessionUser(user);
  };

  useEffect(() => {
    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/me", { credentials: "include" });
        if (!response.ok) return;
        const data = await response.json();
        if (data?.user) {
          setSessionUser(data.user);
        }
      } catch {
        // ignore session fetch errors
      } finally {
        setAuthChecked(true);
      }
    };
    loadSession();
  }, []);

  useEffect(() => {
    if (!sessionUser) return;
    const id = `CLOUD-${sessionUser.username.trim().toUpperCase()}`;
    const accountKeyId = accountKey(id);
    const businessAccount: BusinessAccount = {
      id,
      businessName: sessionUser.shopName,
      ownerName: sessionUser.username,
      mobile: normalizeMobile(sessionUser.phone),
      storageKey: accountKeyId,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };

    setAccounts((prev) => {
      const exists = prev.some((item) => item.id === id);
      if (exists) {
        return prev.map((item) => item.id === id ? { ...item, lastActiveAt: new Date().toISOString() } : item);
      }
      return [businessAccount, ...prev];
    });
    setActiveBusinessId(id);
    setProfileBase({
      businessId: id,
      shopName: sessionUser.shopName,
      ownerName: sessionUser.username,
      phone: normalizeMobile(sessionUser.phone),
      email: "",
      address: "",
      gst: "",
      pan: "",
      category: "Other",
      established: String(new Date().getFullYear()),
    });
    setActiveUser({
      id: 0,
      name: sessionUser.username,
      role: "admin",
      phone: normalizeMobile(sessionUser.phone),
      email: "",
      active: true,
    });
  }, [sessionUser, setActiveBusinessId, setActiveUser, setAccounts, setProfileBase]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // ignore logout network failures
    }
    setSessionUser(null);
    setActiveBusinessId("");
    window.location.reload();
  };

  const activateAccount = (account: BusinessAccount) => {
    setAccounts((prev) => prev.map((a) => a.id === account.id ? { ...a, lastActiveAt: new Date().toISOString() } : a));
    setActiveBusinessId(account.id);
    window.location.reload();
  };

  const registerAccount = (form: Profile) => {
    const mobile = normalizeMobile(form.phone);
    const existingByMobile = accounts.find((a) => a.mobile === mobile);
    if (existingByMobile && window.confirm(`This mobile number already belongs to ${existingByMobile.businessName}. Activate that account instead?`)) {
      activateAccount(existingByMobile);
      return;
    }
    const id = makeBusinessId(form.shopName, mobile, accounts);
    const nextAccount: BusinessAccount = {
      id,
      businessName: form.shopName.trim(),
      ownerName: form.ownerName.trim(),
      mobile,
      storageKey: accountKey(id),
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };
    const nextProfile = { ...form, businessId: id, phone: mobile };
    writeStored(scopedStorageKey(nextAccount.storageKey, "profile"), nextProfile);
    writeStored(scopedStorageKey(nextAccount.storageKey, "settings"), DEFAULT_SETTINGS);
    setAccounts((prev) => [nextAccount, ...prev]);
    setActiveBusinessId(id);
    window.location.reload();
  };

  const setProfile = (value: Profile | ((p: Profile) => Profile)) => {
    setProfileBase((prev) => {
      const next = value instanceof Function ? value(prev) : value;
      if (activeAccount) {
        setAccounts((all) => all.map((a) => a.id === activeAccount.id ? {
          ...a,
          businessName: next.shopName.trim() || a.businessName,
          ownerName: next.ownerName.trim() || a.ownerName,
          mobile: normalizeMobile(next.phone) || a.mobile,
          lastActiveAt: new Date().toISOString(),
        } : a));
      }
      return { ...next, businessId: activeAccount?.id || next.businessId };
    });
  };

  useEffect(() => {
    if (accounts.length) return;
    const legacyProfile = readStored<Profile>("billpro_profile", DEFAULT_PROFILE);
    if (legacyProfile.shopName && legacyProfile.phone) {
      const mobile = normalizeMobile(legacyProfile.phone);
      const id = legacyProfile.businessId || makeBusinessId(legacyProfile.shopName, mobile, []);
      const migratedAccount: BusinessAccount = {
        id,
        businessName: legacyProfile.shopName,
        ownerName: legacyProfile.ownerName,
        mobile,
        storageKey: accountKey(id),
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };
      migrateLegacyData(migratedAccount.storageKey);
      writeStored(scopedStorageKey(migratedAccount.storageKey, "profile"), { ...legacyProfile, businessId: id, phone: mobile });
      setAccounts([migratedAccount]);
      setActiveBusinessId(id);
      window.location.reload();
    }
  }, [accounts.length]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#0f2557] flex items-center justify-center text-white text-lg">Loading authentication...</div>
    );
  }

  if (!sessionUser) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  if (!activeAccount || !profile.shopName) {
    return <AccountAccessScreen accounts={accounts} onRegister={registerAccount} onActivate={activateAccount} />;
  }

  const handleNav = (t: Tab) => { setTab(t); setSidebarOpen(false); };

  const formatInvoiceNo = (n: number) => `INV-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
  const parseInvoiceCounter = (id: string) => {
    const parts = id.split('-');
    const last = parts[parts.length - 1];
    const num = Number(last);
    return Number.isFinite(num) ? num : 0;
  };
  const nextInvoiceNumber = invoices.reduce((max, inv) => Math.max(max, parseInvoiceCounter(inv.id)), 0) + 1;
  const nextInvoiceLabel = formatInvoiceNo(nextInvoiceNumber);

  const saveInvoice = (inv: InvoiceRecord) => {
    setInvoices((prev) => [inv, ...prev]);
  };

  const renderView = () => {
    switch (tab) {
      case "dashboard": return <DashboardView products={products} customers={customers} demands={demands} invoices={invoices} nextInvoiceLabel={nextInvoiceLabel} />;
      case "demand": return <DemandView demands={demands} setDemands={setDemands} customers={customers} />;
      case "inventory": return <InventoryView products={products} setProducts={setProducts} />;
      case "invoice": return <InvoiceView products={products} customers={customers} profile={profile} settings={settings} onSave={saveInvoice} onNavigate={handleNav} nextInvoiceLabel={nextInvoiceLabel} />;
      case "invoices": return <InvoicesView invoices={invoices} onDelete={(id) => setInvoices((prev) => prev.filter((inv) => inv.id !== id))} />;
      case "barcode": return <BarcodeView products={products} />;
      case "ppi": return <ClosedPPIView cards={ppiCards} setCards={setPpiCards} profile={profile} />;
      case "gst": return <GSTView profile={profile} />;
      case "customers": return <CustomersView customers={customers} setCustomers={setCustomers} profile={profile} />;
      case "settings": return <SettingsView settings={settings} setSettings={setSettings} profile={profile} setProfile={setProfile} />;
      case "profile": return <ProfileView profile={profile} setProfile={setProfile} invoices={invoices} products={products} customers={customers} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-60 flex flex-col bg-[#0f2557] transition-transform duration-300 ease-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} shadow-2xl`}>
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center shadow-sm">
            <IndianRupee className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">Bill Pilot</p>
            <p className="text-[10px] text-blue-300/70">Business Suite</p>
          </div>
        </div>
        <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto px-2">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => handleNav(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${tab === id ? "bg-white/10 text-white" : "text-blue-200/70 hover:bg-white/5 hover:text-white"}`}>
              <Icon className={`w-4 h-4 shrink-0 ${tab === id ? "text-accent" : ""}`} />
              {label}
              {tab === id && <ChevronRight className="w-3.5 h-3.5 ml-auto text-accent" />}
            </button>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-white shrink-0">
              {profile.shopName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{profile.ownerName || profile.shopName}</p>
              <p className="text-[10px] text-blue-300/60 truncate">{profile.businessId || profile.shopName}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border shrink-0 shadow-sm">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg lg:hidden text-muted-foreground hover:bg-muted transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-semibold text-foreground">{TITLES[tab]}</h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:block text-xs text-right text-muted-foreground">
              <p className="font-medium text-foreground">{profile.shopName}</p>
              <p className="font-[DM_Mono]">{profile.businessId}</p>
            </div>
            <button onClick={handleLogout}
              title="Sign out"
              className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
            <button onClick={() => handleNav("profile")}
              className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold cursor-pointer hover:bg-primary/90 transition-colors">
              {profile.shopName.charAt(0).toUpperCase()}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {renderView()}
        </main>

        <nav className="lg:hidden flex items-center border-t border-border bg-card px-1 py-1 shrink-0">
          {NAV.slice(0, 5).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => handleNav(id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-medium transition-colors ${tab === id ? "text-primary" : "text-muted-foreground"}`}>
              <Icon className="w-5 h-5" />
              {label.split(" ")[0]}
            </button>
          ))}
          <button onClick={() => setSidebarOpen(true)} className="flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-medium text-muted-foreground">
            <Menu className="w-5 h-5" />
            More
          </button>
        </nav>
      </div>
    </div>
  );
}
