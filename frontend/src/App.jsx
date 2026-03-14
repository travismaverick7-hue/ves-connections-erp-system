import { useState, useEffect, useRef, useCallback } from "react";
import * as React from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line, AreaChart, Area } from "recharts";
import { authAPI, usersAPI, productsAPI, salesAPI, purchaseOrdersAPI, customersAPI, suppliersAPI, expensesAPI, reportsAPI, transfersAPI, debtsAPI, registerAPI, returnsAPI, timeLogsAPI, logisticsAPI, currencyAPI, documentsAPI, mpesaAPI, companiesAPI, rolesAPI, productCategoriesAPI, warehousesAPI, invoicesAPI, paymentsAPI, employeesAPI, departmentsAPI, attendanceAPI, assetsAPI, expenseCategoriesAPI, onfonAPI, onfonReportsAPI, wipeAPI, reconciliationAPI, supplierPaymentsAPI, reorderAPI, loyaltyAPI, quotationsAPI, supplierReturnsAPI, commissionAPI, payrollAPI, clearToken } from "./services/api";

// ─── SPINNER & LOADING ────────────────────────────────────────────────────────
function Spinner() {
  return <span style={{ display:"inline-block", width:14, height:14, border:`2px solid rgba(0,0,0,0.2)`, borderTopColor:"#000", borderRadius:"50%", animation:"spin .6s linear infinite", marginRight:4 }} />;
}
function Loading() {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:40, gap:10, color:"#5a7a9a" }}>
      <span style={{ display:"inline-block", width:20, height:20, border:`2px solid rgba(240,165,0,0.2)`, borderTopColor:"#f0a500", borderRadius:"50%", animation:"spin .7s linear infinite" }} />
      <span style={{ fontSize:13, fontFamily:"'JetBrains Mono',monospace" }}>Loading...</span>
    </div>
  );
}

// ─── THEME ───────────────────────────────────────────────────────────────────
const C = {
  bg: "#060b14", surface: "#0d1526", surfaceAlt: "#111e35",
  surfaceHover: "#162240", border: "#1a2d4a", borderLight: "#243a5e",
  accent: "#f0a500", accentDark: "#c78400", accentGlow: "rgba(240,165,0,0.15)",
  text: "#e8f0fe", textMuted: "#5a7a9a", textDim: "#8aabcf",
  success: "#00d97e", successDim: "rgba(0,217,126,0.12)",
  danger: "#ff4d6a", dangerDim: "rgba(255,77,106,0.12)",
  info: "#3b9eff", infoDim: "rgba(59,158,255,0.12)",
  warning: "#f0a500", warningDim: "rgba(240,165,0,0.12)",
  purple: "#a78bfa", purpleDim: "rgba(167,139,250,0.12)",
  chart: ["#f0a500","#3b9eff","#00d97e","#ff4d6a","#a78bfa","#22d3ee","#fb923c"],
};

// ─── INITIAL DATA (empty shell — real data loads from API) ────────────────────
const EMPTY = {
  products: [], sales: [], purchaseOrders: [],
  suppliers: [], customers: [], expenses: [], receiptCounter: 1,
};

// ─── Field mappers (DB snake_case → frontend camelCase) ───────────────────────
const mapProduct = p => ({
  id: p.id, name: p.name, category: p.category, sku: p.sku,
  barcode: p.barcode||"", buyPrice: parseFloat(p.buy_price||0),
  sellPrice: parseFloat(p.sell_price||0),
  mainBranch: parseInt(p.main_branch_qty ?? p.main_branch_stock ?? 0),
  westBranch: parseInt(p.west_branch_qty ?? p.west_branch_stock ?? 0),
  minStock: parseInt(p.min_stock||0),
  supplier: p.supplier_name||p.supplier||"", isActive: p.is_active,
});
const mapSale = s => ({
  id: s.id, receiptNo: s.receipt_no||s.receiptNo, date: (s.sale_date||s.date||"").split("T")[0],
  customerId: s.customer_id, customerName: s.customer_name||"Walk-in",
  items: typeof s.items === "string" ? JSON.parse(s.items) : (s.items||[]),
  subtotal: parseFloat(s.subtotal||0), discount: parseFloat(s.discount||0),
  tax: parseFloat(s.tax||0), total: parseFloat(s.total||0),
  branch: s.branch||"Main Branch", staff: s.staff_name||s.staff||"",
  payMethod: s.pay_method||s.payMethod||"Cash", status: s.status||"Completed",
});
const mapOrder = o => ({
  id: o.id, date: (o.order_date||o.date||"").split("T")[0],
  supplier: o.supplier_name||o.supplier, status: o.status,
  items: typeof o.items === "string" ? JSON.parse(o.items) : (o.items||[]),
  total: parseFloat(o.total||0), branch: o.branch||"", notes: o.notes||"",
});
const mapSupplier = s => ({
  id: s.id, name: s.name, contact: s.contact||s.phone||"",
  email: s.email||"", address: s.address||"",
  categories: s.categories||"", rating: s.rating||3,
  balance: parseFloat(s.balance||0), isActive: s.is_active,
});
const mapCustomer = c => ({
  id: c.id, name: c.name, phone: c.phone||"", email: c.email||"",
  totalSpent: parseFloat(c.total_spent||0), visits: parseInt(c.visits||0),
  joined: (c.created_at||c.joined||"").split("T")[0],
});
const mapExpense = e => ({
  id: e.id, date: (e.expense_date||e.date||"").split("T")[0],
  category: e.category, amount: parseFloat(e.amount||0),
  branch: e.branch||"", description: e.description||"",
  addedBy: e.added_by_name||e.addedBy||"",
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmtKsh = n => `KSh ${(+n||0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = n => (+n||0).toLocaleString();
const fmt    = n => (+n||0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // shorthand used in new modules
const today = () => new Date().toISOString().split("T")[0];
const todayLong = () => new Date().toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const nowTime = () => new Date().toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
const padReceipt = n => `RCP-${String(n).padStart(4, "0")}`;

// PageHeader — reusable page title bar used by new modules
function PageHeader({ title, subtitle, icon, action }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:10 }}>
      <div>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
          {icon && <span style={{ fontSize:22 }}>{icon}</span>}
          <h2 style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:700, fontSize:"clamp(16px,4vw,20px)", color:C.text, margin:0 }}>{title}</h2>
        </div>
        {subtitle && <div style={{ fontSize:12, color:C.textMuted, marginLeft:icon?32:0 }}>{subtitle}</div>}
      </div>
      {action && <div style={{ flexShrink:0 }}>{action}</div>}
    </div>
  );
}

function useLocalTime() {
  const [t, setT] = useState(nowTime());
  useEffect(() => { const i = setInterval(() => setT(nowTime()), 30000); return () => clearInterval(i); }, []);
  return t;
}

// ─── GLOBAL CSS ───────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Clash+Display:wght@400;500;600;700&family=Cabinet+Grotesk:wght@400;500;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;background:${C.bg};color:${C.text};font-family:'Cabinet Grotesk',sans-serif;-webkit-font-smoothing:antialiased;}
::-webkit-scrollbar{width:4px;height:4px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
::-webkit-scrollbar-thumb:hover{background:${C.borderLight};}

@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideIn{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
@keyframes glow{0%,100%{box-shadow:0 0 8px ${C.accentGlow}}50%{box-shadow:0 0 20px ${C.accentGlow},0 0 40px ${C.accentGlow}}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}

.fade-in{animation:fadeIn .3s ease forwards;}
.slide-in{animation:slideIn .25s ease forwards;}

.app-layout{display:flex;min-height:100dvh;position:relative;}

/* SIDEBAR */
.sidebar{
  width:256px;min-width:256px;flex-shrink:0;
  background:${C.surface};
  border-right:1px solid ${C.border};
  display:flex;flex-direction:column;
  height:100dvh;
  position:sticky;top:0;
  overflow-y:auto;overflow-x:hidden;
  z-index:50;
}

.logo-zone{
  padding:24px 18px 20px;
  border-bottom:1px solid ${C.border};
  background:linear-gradient(135deg,${C.surfaceAlt},${C.surface});
}
.logo-mark{
  width:42px;height:42px;
  background:linear-gradient(135deg,${C.accent},${C.accentDark});
  border-radius:10px;
  display:flex;align-items:center;justify-content:center;
  font-family:'Clash Display',sans-serif;font-weight:700;font-size:16px;color:#000;
  margin-bottom:10px;
  box-shadow:0 4px 12px ${C.accentGlow};
}
.logo-title{font-family:'Clash Display',sans-serif;font-weight:700;font-size:14px;color:${C.text};line-height:1.2;}
.logo-sub{font-size:10.5px;color:${C.textMuted};font-family:'JetBrains Mono',monospace;margin-top:2px;}

.nav-group{padding:12px 10px 4px;}
.nav-group-label{font-size:9.5px;letter-spacing:2px;color:${C.textMuted};font-family:'JetBrains Mono',monospace;padding:0 8px 6px;text-transform:uppercase;}
.nav-item{
  display:flex;align-items:center;gap:10px;
  padding:9px 12px;border-radius:9px;
  cursor:pointer;font-size:13px;font-weight:500;
  color:${C.textDim};transition:all .15s;
  margin-bottom:2px;border:1px solid transparent;
  position:relative;
}
.nav-item:hover{background:${C.surfaceAlt};color:${C.text};}
.nav-item.active{
  background:${C.accentGlow};
  color:${C.accent};
  border-color:rgba(240,165,0,.2);
}
.nav-item.active::before{
  content:'';position:absolute;left:-10px;top:50%;
  transform:translateY(-50%);
  width:3px;height:20px;background:${C.accent};
  border-radius:0 3px 3px 0;
}
.nav-icon{font-size:15px;width:20px;text-align:center;}
.nav-badge{
  margin-left:auto;background:${C.danger};
  color:#fff;font-size:10px;font-weight:700;
  padding:1px 6px;border-radius:10px;
  font-family:'JetBrains Mono',monospace;
  animation:pulse 2s infinite;
}

.branch-zone{
  margin:10px;padding:12px;
  background:${C.surfaceAlt};
  border-radius:10px;border:1px solid ${C.border};
}
.branch-zone-label{font-size:9px;letter-spacing:2px;color:${C.textMuted};font-family:'JetBrains Mono',monospace;margin-bottom:8px;text-transform:uppercase;}
.branch-btn{
  width:100%;padding:7px 10px;border-radius:7px;
  border:1px solid transparent;background:transparent;
  color:${C.textDim};font-size:12px;cursor:pointer;
  text-align:left;margin-bottom:3px;
  transition:all .15s;font-family:'Cabinet Grotesk',sans-serif;font-weight:500;
}
.branch-btn:hover{background:${C.surface};color:${C.text};border-color:${C.border};}
.branch-btn.active{background:${C.accent};color:#000;font-weight:700;border-color:${C.accent};}

.user-zone{
  margin:10px;padding:12px;
  background:${C.surfaceAlt};
  border-radius:10px;border:1px solid ${C.border};
}
.user-avatar{
  width:34px;height:34px;border-radius:8px;
  background:linear-gradient(135deg,${C.accent},${C.accentDark});
  display:flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:800;color:#000;flex-shrink:0;
  font-family:'Clash Display',sans-serif;
}
.user-name{font-size:12.5px;font-weight:700;color:${C.text};}
.user-role{font-size:10px;color:${C.textMuted};font-family:'JetBrains Mono',monospace;}

/* MAIN */
.main-area{
  flex:1;
  display:flex;
  flex-direction:column;
  min-width:0;
  height:100dvh;
  overflow:hidden;
}
.topbar{
  background:${C.surface};border-bottom:1px solid ${C.border};
  padding:14px 28px;
  display:flex;align-items:center;justify-content:space-between;
  flex-shrink:0;
  z-index:40;
}
.page-heading{font-family:'Clash Display',sans-serif;font-weight:700;font-size:22px;}
.page-sub{font-size:11px;color:${C.textMuted};font-family:'JetBrains Mono',monospace;margin-top:1px;}
.topbar-chips{display:flex;align-items:center;gap:10px;}
.chip{
  display:flex;align-items:center;gap:6px;
  padding:6px 14px;border-radius:20px;
  font-size:12px;font-weight:500;
  background:${C.surfaceAlt};border:1px solid ${C.border};
  color:${C.textDim};font-family:'JetBrains Mono',monospace;
}
.chip.danger{background:${C.dangerDim};border-color:rgba(255,77,106,.3);color:${C.danger};cursor:pointer;animation:pulse 2s infinite;}

/* CONTENT */
.content{padding:24px;overflow-y:auto;flex:1;min-width:0;min-height:0;}
.content-inner{width:100%;max-width:1400px;margin:0 auto;display:flex;flex-direction:column;}

/* CARDS — visual styling only, NO width control here */
.card{
  background:${C.surface};border:1px solid ${C.border};
  border-radius:14px;overflow:visible;
  height:auto;
  margin-bottom:20px;transition:border-color .2s;
}
.card:hover{border-color:${C.borderLight};}
.card-hd{
  padding:16px 20px;border-bottom:1px solid ${C.border};
  display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;
  background:linear-gradient(90deg,${C.surfaceAlt},transparent);
}
.card-title{font-family:'Clash Display',sans-serif;font-weight:700;font-size:14.5px;letter-spacing:.3px;}
.card-body{padding:20px;}
.card-sm{max-width:480px;}
.card-md{max-width:720px;}
.card-lg{max-width:960px;}
.card-center{margin-left:auto;margin-right:auto;}

/* STAT CARDS */
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:22px;}
.stat-card{
  background:${C.surface};border:1px solid ${C.border};
  border-radius:14px;padding:20px;
  position:relative;overflow:hidden;
  transition:all .2s;cursor:default;
}
.stat-card:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,.3);}
.stat-card::after{
  content:'';position:absolute;
  right:-20px;top:-20px;
  width:80px;height:80px;
  border-radius:50%;opacity:.06;
}
.stat-card.gold::after{background:${C.accent};}
.stat-card.green::after{background:${C.success};}
.stat-card.blue::after{background:${C.info};}
.stat-card.red::after{background:${C.danger};}
.stat-card.purple::after{background:${C.purple};}
.stat-accent{display:flex;align-items:center;gap:8px;margin-bottom:12px;}
.stat-dot{width:8px;height:8px;border-radius:50%;}
.stat-icon-box{
  width:40px;height:40px;border-radius:10px;
  display:flex;align-items:center;justify-content:center;font-size:18px;
}
.stat-value{font-family:'Clash Display',sans-serif;font-weight:700;font-size:26px;margin-bottom:3px;line-height:1.1;}
.stat-label{font-size:12px;color:${C.textMuted};font-weight:500;}
.stat-trend{font-size:11px;margin-top:8px;font-family:'JetBrains Mono',monospace;}
.stat-trend.up{color:${C.success};}
.stat-trend.down{color:${C.danger};}

/* TABLE */
table{width:100%;border-collapse:collapse;}
th{
  padding:10px 16px;font-size:10px;font-weight:600;
  color:${C.textMuted};letter-spacing:1.5px;
  font-family:'JetBrains Mono',monospace;
  background:${C.surfaceAlt};text-transform:uppercase;
  border-bottom:1px solid ${C.border};
}
th:first-child{border-radius:0;}
td{
  padding:12px 16px;font-size:13px;
  border-bottom:1px solid rgba(26,45,74,.4);
  vertical-align:middle;
}
tr:last-child td{border-bottom:none;}
tr:hover td{background:rgba(255,255,255,.015);}

/* BADGES */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;font-family:'JetBrains Mono',monospace;white-space:nowrap;}
.badge::before{content:'';width:5px;height:5px;border-radius:50%;}
.b-success{background:${C.successDim};color:${C.success};}
.b-success::before{background:${C.success};}
.b-warning{background:${C.warningDim};color:${C.warning};}
.b-warning::before{background:${C.warning};}
.b-danger{background:${C.dangerDim};color:${C.danger};}
.b-danger::before{background:${C.danger};}
.b-info{background:${C.infoDim};color:${C.info};}
.b-info::before{background:${C.info};}
.b-gray{background:rgba(90,122,154,.1);color:${C.textDim};}
.b-gray::before{background:${C.textDim};}
.b-purple{background:${C.purpleDim};color:${C.purple};}
.b-purple::before{background:${C.purple};}

/* BUTTONS */
.btn{
  padding:8px 18px;border-radius:8px;border:none;
  cursor:pointer;font-size:13px;font-weight:600;
  transition:all .15s;display:inline-flex;
  align-items:center;gap:7px;
  font-family:'Cabinet Grotesk',sans-serif;
}
.btn-primary{background:${C.accent};color:#000;}
.btn-primary:hover{background:#ffc333;box-shadow:0 4px 16px ${C.accentGlow};}
.btn-outline{background:transparent;border:1px solid ${C.border};color:${C.textDim};}
.btn-outline:hover{border-color:${C.accent};color:${C.accent};}
.btn-success{background:${C.successDim};color:${C.success};border:1px solid rgba(0,217,126,.2);}
.btn-danger{background:${C.dangerDim};color:${C.danger};border:1px solid rgba(255,77,106,.2);}
.btn-sm{padding:5px 12px;font-size:11.5px;}
.btn-ghost{background:transparent;color:${C.textMuted};border:1px solid transparent;}
.btn-ghost:hover{background:${C.surfaceAlt};color:${C.text};}
.btn-info{background:${C.infoDim};color:${C.info};border:1px solid rgba(59,158,255,.2);}

/* INPUTS */
.inp,.sel,.textarea{
  width:100%;padding:9px 14px;
  background:${C.surfaceAlt};
  border:1px solid ${C.border};
  border-radius:8px;color:${C.text};
  font-size:13px;outline:none;
  transition:border-color .15s;
  font-family:'Cabinet Grotesk',sans-serif;
}
.inp:focus,.sel:focus,.textarea:focus{border-color:${C.accent};box-shadow:0 0 0 3px ${C.accentGlow};}
.inp::placeholder{color:${C.textMuted};}
.sel option{background:${C.surface};}
.textarea{resize:vertical;min-height:80px;}

/* MODAL */
.overlay{
  position:fixed;top:0;left:0;right:0;bottom:0;
  background:rgba(0,0,0,.75);
  display:flex;align-items:flex-start;justify-content:center;
  padding-top:72px;padding-bottom:24px;
  z-index:200;backdrop-filter:blur(6px);
  animation:fadeIn .2s ease;
  overflow-y:auto;
}
.modal{
  background:${C.surface};border:1px solid ${C.borderLight};
  border-radius:16px;padding:28px;
  width:560px;max-width:calc(100vw - 40px);
  max-height:calc(100vh - 120px);overflow-y:auto;
  box-shadow:0 24px 64px rgba(0,0,0,.6);
  animation:fadeIn .25s ease;
  margin-bottom:24px;
}
.modal-lg{width:min(700px,100vw - 40px);}
.modal-xl{width:min(920px,100vw - 40px);}
.modal-title{font-family:'Clash Display',sans-serif;font-weight:700;font-size:19px;margin-bottom:22px;display:flex;align-items:center;gap:10px;}
.modal-footer{display:flex;justify-content:flex-end;gap:10px;margin-top:24px;padding-top:18px;border-top:1px solid ${C.border};}

/* ── modal-hd / modal-body / modal-ft / modal-close (used by newer modules) ── */
.modal-hd{
  display:flex;align-items:center;justify-content:space-between;
  padding:18px 22px 16px;
  border-bottom:1px solid ${C.border};
  background:linear-gradient(90deg,${C.surfaceAlt},transparent);
  border-radius:16px 16px 0 0;
  /* Pull outside the modal's 28px padding so header spans full width */
  margin:-28px -28px 24px -28px;
}
.modal-hd .modal-title{margin-bottom:0;font-size:16px;}
.modal-body{display:flex;flex-direction:column;}
.modal-ft{
  display:flex;justify-content:flex-end;gap:10px;
  margin:24px -28px -28px -28px;
  padding:16px 24px;
  border-top:1px solid ${C.border};
  border-radius:0 0 16px 16px;
}
.modal-close{
  background:transparent;border:1px solid ${C.border};
  color:${C.textMuted};border-radius:7px;
  width:30px;height:30px;
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;font-size:14px;line-height:1;
  transition:all .15s;flex-shrink:0;
}
.modal-close:hover{background:${C.dangerDim};border-color:${C.danger};color:${C.danger};}

/* FORM */
.fg{margin-bottom:14px;}
.flabel{display:block;font-size:10.5px;color:${C.textMuted};margin-bottom:5px;font-family:'JetBrains Mono',monospace;letter-spacing:1px;text-transform:uppercase;}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.frow3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}

/* GRIDS */
.g2{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}

/* Responsive inline grids used in modals/forms */
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}

/* MINI CHART */
.sparkbar{display:flex;align-items:flex-end;gap:3px;height:44px;}
.sbar{flex:1;border-radius:3px 3px 0 0;transition:all .2s;cursor:pointer;}
.sbar:hover{opacity:.8;transform:scaleY(1.05);transform-origin:bottom;}

/* SEARCH */
.search-wrap{position:relative;display:inline-block;}
.search-wrap input{padding-left:36px;width:220px;}
.search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:${C.textMuted};font-size:14px;pointer-events:none;}

/* RECEIPT PRINT AREA */
.receipt-print{
  background:#fff;color:#000;padding:24px;
  font-family:'JetBrains Mono',monospace;
  width:320px;margin:0 auto;font-size:12px;line-height:1.6;
}
.receipt-print .r-header{text-align:center;border-bottom:2px dashed #ccc;padding-bottom:12px;margin-bottom:12px;}
.receipt-print .r-title{font-size:16px;font-weight:800;font-family:sans-serif;}
.receipt-print .r-footer{border-top:2px dashed #ccc;padding-top:12px;margin-top:12px;text-align:center;}
.receipt-print table{font-size:11px;}
.receipt-print td{padding:2px 4px;}

/* PRINT */
@media print{
  .no-print{display:none!important;}
  .print-only{display:block!important;}
  .report-print-area{padding:0!important;}
  body{background:#fff!important;color:#000!important;}
}

/* STOCK PROGRESS */
.prog-wrap{display:flex;align-items:center;gap:8px;}
.prog-track{flex:1;height:5px;background:${C.border};border-radius:3px;overflow:hidden;max-width:72px;}
.prog-fill{height:100%;border-radius:3px;transition:width .3s;}

/* LOGIN */
.login-bg{
  min-height:100vh;
  background: ${C.bg};
  display:flex;align-items:center;justify-content:center;
  position:relative;overflow:hidden;
}
.login-bg::before{
  content:'';position:absolute;inset:0;
  background:
    radial-gradient(ellipse 80% 60% at 20% 30%, rgba(240,165,0,.13) 0%, transparent 60%),
    radial-gradient(ellipse 60% 80% at 80% 70%, rgba(59,158,255,.10) 0%, transparent 55%),
    radial-gradient(ellipse 40% 40% at 60% 10%, rgba(0,217,126,.07) 0%, transparent 50%);
  pointer-events:none;
}
.login-bg::after{
  content:'';position:absolute;inset:0;
  background-image:
    linear-gradient(rgba(240,165,0,.04) 1px,transparent 1px),
    linear-gradient(90deg,rgba(240,165,0,.04) 1px,transparent 1px);
  background-size:48px 48px;
  mask-image:radial-gradient(ellipse 80% 80% at 50% 50%,black 30%,transparent 100%);
  pointer-events:none;
}
@keyframes orb1{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(40px,-30px) scale(1.1);}}
@keyframes orb2{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(-30px,40px) scale(0.95);}}
@keyframes orb3{0%,100%{transform:translate(0,0) scale(1);}33%{transform:translate(20px,20px) scale(1.05);}66%{transform:translate(-20px,-10px) scale(0.98);}}
@keyframes loginCardIn{from{opacity:0;transform:translateY(32px) scale(.97);}to{opacity:1;transform:translateY(0) scale(1);}}
@keyframes borderSpin{0%{background-position:0% 50%;}50%{background-position:100% 50%;}100%{background-position:0% 50%;}}
@keyframes logoPulse{0%,100%{box-shadow:0 0 0 0 rgba(240,165,0,.4),0 8px 32px rgba(240,165,0,.3);}50%{box-shadow:0 0 0 12px rgba(240,165,0,.0),0 8px 32px rgba(240,165,0,.5);}}
@keyframes floatDot{0%,100%{transform:translateY(0) rotate(0deg);opacity:.6;}50%{transform:translateY(-24px) rotate(180deg);opacity:1;}}

.login-orb{position:absolute;border-radius:50%;filter:blur(80px);pointer-events:none;}
.login-orb-1{width:400px;height:400px;background:rgba(240,165,0,.08);top:-100px;left:-100px;animation:orb1 8s ease-in-out infinite;}
.login-orb-2{width:350px;height:350px;background:rgba(59,158,255,.07);bottom:-80px;right:-80px;animation:orb2 10s ease-in-out infinite;}
.login-orb-3{width:250px;height:250px;background:rgba(0,217,126,.06);top:40%;left:60%;animation:orb3 12s ease-in-out infinite;}

.login-card-wrap{position:relative;border-radius:24px;padding:2px;background:linear-gradient(135deg,rgba(240,165,0,.5),rgba(59,158,255,.3),rgba(0,217,126,.3),rgba(240,165,0,.5));background-size:300% 300%;animation:borderSpin 4s linear infinite,loginCardIn .5s cubic-bezier(.16,1,.3,1) both;}
.login-card{
  background:rgba(13,21,38,.92);
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  border-radius:22px;padding:48px 44px;width:420px;
  position:relative;
}
.login-card::before{
  content:'';position:absolute;inset:0;border-radius:22px;
  background:radial-gradient(ellipse 60% 40% at 50% 0%,rgba(240,165,0,.06),transparent 70%);
  pointer-events:none;
}
.login-dot{position:absolute;width:6px;height:6px;border-radius:50%;background:${C.accent};opacity:.5;animation:floatDot 3s ease-in-out infinite;}
.login-logo-box{width:64px;height:64px;background:linear-gradient(135deg,${C.accent},${C.accentDark});border-radius:18px;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;animation:logoPulse 2.5s ease-in-out infinite;position:relative;}
.login-logo-box::after{content:'';position:absolute;inset:-1px;border-radius:19px;background:linear-gradient(135deg,rgba(255,255,255,.2),transparent);pointer-events:none;}
.login-inp{
  width:100%;padding:13px 16px;border-radius:10px;font-size:14px;
  background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.08);
  color:${C.text};font-family:inherit;transition:all .2s;outline:none;box-sizing:border-box;
}
.login-inp:focus{border-color:${C.accent};background:rgba(240,165,0,.06);box-shadow:0 0 0 4px rgba(240,165,0,.1);}
.login-inp::placeholder{color:rgba(255,255,255,.25);}
.login-btn{
  width:100%;padding:14px;border:none;border-radius:12px;font-size:15px;font-weight:700;
  font-family:"'Clash Display',sans-serif";cursor:pointer;transition:all .2s;position:relative;overflow:hidden;
  background:linear-gradient(135deg,${C.accent},${C.accentDark});color:#000;letter-spacing:.3px;
}
.login-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.15),transparent);opacity:0;transition:opacity .2s;}
.login-btn:hover::before{opacity:1;}
.login-btn:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(240,165,0,.4);}
.login-btn:active{transform:translateY(0);}
.login-btn:disabled{opacity:.6;cursor:not-allowed;transform:none;}
.login-label{font-size:11px;font-weight:600;letter-spacing:1.2px;color:rgba(255,255,255,.4);text-transform:uppercase;margin-bottom:7px;display:block;}
.login-err{background:rgba(255,77,106,.1);border:1px solid rgba(255,77,106,.25);border-radius:10px;padding:11px 14px;font-size:13px;color:${C.danger};margin-bottom:16px;display:flex;align-items:center;gap:8px;}
.login-info{background:rgba(0,217,126,.08);border:1px solid rgba(0,217,126,.2);border-radius:10px;padding:11px 14px;font-size:13px;color:${C.success};margin-bottom:16px;}
.login-divider{height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent);margin:22px 0;}
.login-link{width:100%;background:none;border:none;color:rgba(255,255,255,.35);font-size:12.5px;cursor:pointer;font-family:inherit;padding:8px 0;transition:color .2s;text-align:center;display:block;}
.login-link:hover{color:${C.accent};}


/* NOTIFICATION */
.notif{
  position:fixed;top:20px;right:20px;
  background:${C.surface};border:1px solid ${C.borderLight};
  border-radius:10px;padding:14px 18px;
  min-width:280px;z-index:999;
  display:flex;align-items:center;gap:12px;
  box-shadow:0 8px 32px rgba(0,0,0,.4);
  animation:slideIn .25s ease;
}
.notif.success{border-left:3px solid ${C.success};}
.notif.error{border-left:3px solid ${C.danger};}
.notif.info{border-left:3px solid ${C.info};}

/* SCROLLABLE TABLE WRAPPER */
.tbl-wrap{overflow-x:auto;}

.empty-state{text-align:center;padding:48px;color:${C.textMuted};}
.empty-state .es-icon{font-size:36px;margin-bottom:12px;}
.empty-state p{font-size:13px;}

.mono{font-family:'JetBrains Mono',monospace;}
.divider{height:1px;background:${C.border};margin:16px 0;}

/* Tabs */
.tabs{display:flex;gap:4px;background:${C.surfaceAlt};padding:4px;border-radius:10px;margin-bottom:20px;}
.tab{flex:1;padding:8px 14px;border-radius:7px;border:none;background:transparent;color:${C.textMuted};font-size:12.5px;font-weight:600;cursor:pointer;transition:all .15s;font-family:'Cabinet Grotesk',sans-serif;text-align:center;}
.tab.active{background:${C.surface};color:${C.text};box-shadow:0 1px 4px rgba(0,0,0,.3);}
.tab:hover:not(.active){color:${C.text};}

/* KPI comparison */
.kpi-compare{display:flex;gap:4px;align-items:center;font-size:11px;font-family:'JetBrains Mono',monospace;}
.kpi-up{color:${C.success};}
.kpi-down{color:${C.danger};}

/* Content max-width — prevents cards stretching on ultra-wide screens */
@media(min-width:1600px){.content{padding:28px 32px;}}
@media(max-width:1400px){.content-inner{max-width:100%;}}
@media(max-width:1200px){.stats-grid{grid-template-columns:repeat(2,1fr);}}

/* ═══════════════════════════════════════════════════════════════════
   HAMBURGER & SIDEBAR BACKDROP
═══════════════════════════════════════════════════════════════════ */
.hamburger{
  display:none;
  background:transparent;
  border:1px solid ${C.border};
  border-radius:8px;
  padding:7px 11px;
  cursor:pointer;
  font-size:20px;
  color:${C.text};
  line-height:1;
  flex-shrink:0;
  transition:all .15s;
}
.hamburger:hover{background:${C.surfaceAlt};border-color:${C.borderLight};}

/* Show hamburger on tablet AND desktop when sidebar is hidden */
@media(max-width:1100px){
  .hamburger{display:flex;align-items:center;justify-content:center;}

  /* Sidebar becomes a fixed off-screen drawer — removed from layout flow */
  .sidebar{
    position:fixed;top:0;left:0;
    width:280px!important;min-width:unset!important;
    height:100dvh;
    transform:translateX(-110%);
    transition:transform .28s cubic-bezier(.4,0,.2,1);
    z-index:200;
    box-shadow:8px 0 40px rgba(0,0,0,.7);
    overflow-y:auto;
  }
  .sidebar.open{transform:translateX(0);}
  .sidebar-backdrop.show{display:block;}

  /* main-area takes full width now sidebar is out of flow */
  .main-area{
    flex:1;
    display:flex;
    flex-direction:column;
    width:100%;
    height:100dvh;
    overflow:hidden;
  }
}
.sidebar-close{
  display:none;
  background:transparent;
  border:1px solid ${C.border};
  border-radius:8px;
  width:32px;height:32px;
  align-items:center;justify-content:center;
  cursor:pointer;
  font-size:18px;
  color:${C.textMuted};
  line-height:1;
  flex-shrink:0;
  transition:all .15s;
  margin-left:auto;
}
.sidebar-close:hover{background:${C.dangerDim};border-color:${C.danger};color:${C.danger};}
@media(max-width:1100px){
  .sidebar-close{display:flex;}
}
.sidebar-backdrop{
  display:none;
  position:fixed;inset:0;
  background:rgba(0,0,0,.72);
  z-index:149;
  backdrop-filter:blur(4px);
  animation:fadeIn .2s ease;
}

/* ═══════════════════════════════════════════════════════════════════
   TABLET  (≤ 1100px)
═══════════════════════════════════════════════════════════════════ */
@media(max-width:1100px){
  .stats-grid{grid-template-columns:repeat(2,1fr);gap:12px;}
  .g3{grid-template-columns:1fr 1fr;}
  .g4{grid-template-columns:repeat(2,1fr);}
}

/* ═══════════════════════════════════════════════════════════════════
   MOBILE  (≤ 768px)  — primary breakpoint
═══════════════════════════════════════════════════════════════════ */
@media(max-width:768px){

  /* ── Layout: sidebar is position:fixed so main-area fills 100% width ── */
  .app-layout{min-height:100dvh;}
  .main-area{height:100dvh;width:100%;}

  /* ── Sidebar: mobile overrides (drawer already set at 1100px) ── */
  .sidebar{
    width:82vw!important;max-width:320px;
  }
  .sidebar.open{transform:translateX(0);}
  .hamburger{display:flex;align-items:center;justify-content:center;}

  /* Sidebar internals — larger touch targets */
  .nav-item{padding:11px 14px;font-size:14px;margin-bottom:3px;}
  .nav-icon{font-size:17px;}
  .logo-zone{padding:20px 16px 16px;}
  .logo-mark{width:38px;height:38px;}
  .logo-title{font-size:13px;}
  .branch-zone{margin:8px;padding:10px;}
  .user-zone{margin:8px;padding:10px;}

  /* ── Topbar ── */
  .topbar{
    padding:10px 14px;
    gap:10px;
    flex-wrap:nowrap;
    position:sticky;top:0;z-index:100;
  }
  .page-heading{font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;}
  .page-sub{display:none;}
  .topbar-chips{gap:6px;}
  .topbar-chips .chip:not(.danger){display:none;}
  .topbar-chips .chip.danger{font-size:11px;padding:5px 10px;}

  /* ── Content area ── */
  .content{padding:10px;padding-bottom:80px;}
  .content-inner{max-width:100%;padding-bottom:16px;padding-top:56px;}

  /* ── Show bottom nav ── */
  .mobile-bottom-nav{display:flex;}
  /* On mobile, hide topbar hamburger — bottom nav has the menu button */
  .topbar .hamburger{display:none!important;}

  /* ── Stat cards — 2 columns on mobile ── */
  .stats-grid{
    grid-template-columns:repeat(2,1fr);
    gap:8px;
    margin-bottom:14px;
  }
  .stat-card{padding:12px 10px;}
  .stat-value{font-size:17px;}
  .stat-label{font-size:11px;}
  .stat-icon-box{width:32px;height:32px;font-size:15px;}

  /* ── Grids collapse to single column ── */
  .g2,.g3,.g4,.grid-2,.grid-3{grid-template-columns:1fr;gap:12px;}

  /* ── Roles page sidebar+content grid ── */
  [style*="min(240px"]{grid-template-columns:1fr!important;}

  /* ── Inline 1fr 1fr grids in cards/modals ── */
  [style*="gridTemplateColumns:\"1fr 1fr\""],[style*='gridTemplateColumns:"1fr 1fr"']{grid-template-columns:1fr!important;}
  [style*="gridTemplateColumns:\"repeat(3,1fr)\""],[style*="gridTemplateColumns:\"1fr 1fr 1fr\""]{grid-template-columns:1fr!important;}
  [style*="gridTemplateColumns:\"repeat(6,1fr)\""]{grid-template-columns:repeat(3,1fr)!important;}

  /* ── Forms — all rows become single column ── */
  .frow,.frow3{grid-template-columns:1fr;gap:10px;}
  .fg{margin-bottom:10px;}
  .inp,.sel,.textarea{font-size:14px;padding:10px 12px;}
  .flabel{font-size:10px;}

  /* ── Cards ── */
  .card{margin-bottom:12px;border-radius:12px;}
  .card-hd{
    padding:12px 14px;
    flex-wrap:wrap;
    gap:8px;
  }
  .card-title{font-size:13px;}
  .card-body{padding:14px;}
  .card-sm,.card-md,.card-lg{max-width:100%;}

  /* ── Tables — horizontal scroll with sticky first column ── */
  .tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:0 0 12px 12px;}
  table{display:table;min-width:520px;font-size:12px;}
  th{padding:8px 10px;font-size:9px;}
  td{padding:9px 10px;font-size:12px;}

  /* ── Buttons ── */
  .btn{padding:8px 14px;font-size:12.5px;}
  .btn-sm{padding:5px 9px;font-size:11px;}

  /* ── Badges ── */
  .badge{font-size:10px;padding:2px 7px;}

  /* ── Tabs ── */
  .tabs{gap:2px;padding:3px;border-radius:9px;overflow-x:auto;flex-wrap:nowrap;}
  .tab{padding:7px 10px;font-size:11.5px;white-space:nowrap;flex:unset;}

  /* ── Modal — bottom-sheet style on mobile ── */
  .overlay{
    align-items:flex-end;
    padding:0;
    padding-top:0;
  }
  .modal,.modal-lg,.modal-xl{
    width:100vw!important;
    max-width:100vw!important;
    max-height:90dvh!important;
    border-radius:20px 20px 0 0!important;
    padding:20px 16px 32px!important;
    margin-bottom:0!important;
    overflow-y:auto;
    animation:slideUp .3s cubic-bezier(.4,0,.2,1);
  }
  /* Bottom-sheet drag handle */
  .modal::before,.modal-lg::before,.modal-xl::before{
    content:'';
    display:block;
    width:40px;height:4px;
    background:${C.border};
    border-radius:2px;
    margin:0 auto 18px;
  }
  .modal-hd{
    margin:-20px -16px 18px -16px;
    border-radius:20px 20px 0 0;
    padding:14px 18px 14px;
  }
  .modal-ft{
    margin:20px -16px -32px -16px;
    padding:14px 18px;
    border-radius:0;
  }
  .modal-title{font-size:16px;}

  /* ── Login page ── */
  .login-bg{padding:16px;align-items:flex-start;padding-top:40px;}
  .login-card{width:100%;border-radius:18px;padding:32px 20px;}
  .login-card-wrap{width:100%;border-radius:20px;}

  /* ── Notifications — bottom toast ── */
  .notif{
    top:auto;bottom:80px;
    right:12px;left:12px;
    min-width:unset;
    font-size:13px;
  }

  /* ── PageHeader ── */
  .page-header-mobile{flex-direction:column;align-items:flex-start;gap:10px;}
  .page-header-mobile .action-area{width:100%;}
  .page-header-mobile .action-area .btn{width:100%;justify-content:center;}

  /* ── Card header actions wrap nicely ── */
  .card-hd .btn{font-size:12px;padding:6px 12px;}
  .card-hd .inp{width:130px;font-size:12px;}
  .card-hd .sel{width:110px;font-size:12px;}

  /* ── Empty states ── */
  .empty-state{padding:32px 16px;}
  .empty-state .es-icon{font-size:28px;}
  .empty-state p{font-size:12px;}

  /* ── Sparkbars smaller ── */
  .sparkbar{height:32px;}

  /* ── Search wrap full width ── */
  .search-wrap{width:100%;}
  .search-wrap input{width:100%;}
}

/* ═══════════════════════════════════════════════════════════════════
   SMALL MOBILE  (≤ 400px)
═══════════════════════════════════════════════════════════════════ */
@media(max-width:400px){
  .stats-grid{grid-template-columns:1fr 1fr;gap:6px;}
  .stat-card{padding:10px 8px;}
  .stat-value{font-size:15px;}
  .page-heading{font-size:14px;max-width:120px;}
  .topbar{padding:8px 10px;}
  .content{padding:8px;}
  .card-hd{padding:10px 12px;}
  .btn{padding:7px 11px;font-size:12px;}
  .modal,.modal-lg,.modal-xl{padding:16px 12px 28px!important;max-height:95dvh!important;}
}

/* ═══════════════════════════════════════════════════════════════════
   FLOATING HAMBURGER BUTTON (always visible on mobile/tablet)
═══════════════════════════════════════════════════════════════════ */
.fab-menu{
  display:none;
  position:fixed;
  top:12px;left:12px;
  width:44px;height:44px;
  background:${C.surface};
  border:1px solid ${C.borderLight};
  border-radius:12px;
  align-items:center;justify-content:center;
  font-size:20px;color:${C.text};
  cursor:pointer;
  z-index:300;
  box-shadow:0 4px 20px rgba(0,0,0,.5);
  transition:all .15s;
}
.fab-menu:hover{background:${C.surfaceAlt};border-color:${C.accent};color:${C.accent};}
@media(max-width:1100px){
  .fab-menu{display:flex;}
}

/* ═══════════════════════════════════════════════════════════════════
   MOBILE BOTTOM NAVIGATION BAR
═══════════════════════════════════════════════════════════════════ */
.mobile-bottom-nav{
  display:none;
  position:fixed;bottom:0;left:0;right:0;
  background:${C.surface};
  border-top:1px solid ${C.border};
  z-index:100;
  padding:6px 0 max(6px, env(safe-area-inset-bottom));
  backdrop-filter:blur(16px);
  -webkit-backdrop-filter:blur(16px);
}
.mbn-item{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:3px;padding:4px 2px;
  background:transparent;border:none;cursor:pointer;
  color:${C.textMuted};font-family:'Cabinet Grotesk',sans-serif;
  position:relative;transition:color .15s;
  min-height:44px;
}
.mbn-item.active{color:${C.accent};}
.mbn-item.active .mbn-icon{transform:scale(1.15);}
.mbn-icon{font-size:20px;line-height:1;transition:transform .15s;}
.mbn-label{font-size:10px;font-weight:600;letter-spacing:.3px;}
.mbn-badge{
  position:absolute;top:2px;right:calc(50% - 16px);
  background:${C.danger};color:#fff;
  font-size:9px;font-weight:700;
  padding:1px 4px;border-radius:8px;
  font-family:'JetBrains Mono',monospace;
  min-width:14px;text-align:center;
}

/* ═══════════════════════════════════════════════════════════════════
   SLIDE-UP ANIMATION for bottom-sheet modals
═══════════════════════════════════════════════════════════════════ */
@keyframes slideUp{
  from{transform:translateY(100%);opacity:0;}
  to{transform:translateY(0);opacity:1;}
}
`;

// ─── SCROLL-LOCKING OVERLAY ──────────────────────────────────────────────────
function Overlay({ onClose, children }) {
  useEffect(() => {
    // Only lock body scroll — never touch .content or any inner container
    // (setting overflow:hidden on .content creates a new stacking context that clips position:fixed children)
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="overlay" onClick={onClose}>
      {children}
    </div>
  );
}

// ─── NOTIFICATION ─────────────────────────────────────────────────────────────
function Notification({ msg, type, onClose }) {
  useEffect(() => { if (msg) { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); } }, [msg]);
  if (!msg) return null;
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  return (
    <div className={`notif ${type}`}>
      <span style={{ fontSize: 18 }}>{icons[type] || "ℹ️"}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{msg}</span>
      <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: C.textMuted, cursor: "pointer", fontSize: 16 }}>×</button>
    </div>
  );
}

function useNotify() {
  const [n, setN] = useState({ msg: "", type: "success" });
  const notify = useCallback((msg, type = "success") => setN({ msg, type }), []);
  const clear = useCallback(() => setN({ msg: "", type: "success" }), []);
  return { n, notify, clear };
}

// Lock body scroll whenever a modal is open
function useScrollLock(active) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [active]);
}

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
function Badge({ label, type }) {
  const map = { "Delivered": "b-success", "In Stock": "b-success", "Healthy": "b-success", "Completed": "b-success",
    "In Transit": "b-info", "Pending": "b-warning", "Low Stock": "b-warning", "Processing": "b-info",
    "Cancelled": "b-danger", "Out of Stock": "b-danger", "Refunded": "b-danger",
    "Admin": "b-purple", "Manager": "b-info", "Cashier": "b-gray" };
  return <span className={`badge ${map[label] || type || "b-gray"}`}>{label}</span>;
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [mode, setMode]       = useState("login");   // "login" | "forgot" | "reset"
  const [u, setU]             = useState("");
  const [p, setP]             = useState("");
  const [showPw, setShowPw]   = useState(false);
  const [err, setErr]         = useState("");
  const [info, setInfo]       = useState("");
  const [loading, setLoading] = useState(false);

  // Forgot password states
  const [fUser, setFUser]     = useState("");
  const [fToken, setFToken]   = useState("");
  const [fNewPw, setFNewPw]   = useState("");
  const [fConfirm, setFConfirm] = useState("");
  const [tokenValid, setTokenValid] = useState(null); // null | { user_name, username, expires_at }
  const [genToken, setGenToken]     = useState("");    // token shown after request

  const submit = async () => {
    if (!u || !p) return;
    setLoading(true); setErr("");
    try {
      const res = await authAPI.login(u, p);
      onLogin(res.user);
    } catch (e) {
      setErr(e.message || "Invalid username or password");
      setLoading(false);
    }
  };

  const requestReset = async () => {
    if (!fUser.trim()) return setErr("Enter your username first");
    setLoading(true); setErr(""); setInfo("");
    try {
      const res = await authAPI.requestReset(fUser.trim());
      if (res.token) {
        setGenToken(res.token);
        setInfo(`Token generated for ${res.user_name}. Copy it and give it to the user, or use it below.`);
      } else {
        setInfo(res.message);
      }
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const verifyToken = async () => {
    if (!fToken.trim()) return setErr("Enter the reset token");
    setLoading(true); setErr("");
    try {
      const res = await authAPI.verifyToken(fToken.trim());
      setTokenValid(res);
      setInfo(`Token is valid for: ${res.user_name}`);
    } catch (e) { setErr(e.message); setTokenValid(null); }
    setLoading(false);
  };

  const doReset = async () => {
    if (fNewPw !== fConfirm) return setErr("Passwords don't match");
    if (fNewPw.length < 6)   return setErr("Password must be at least 6 characters");
    setLoading(true); setErr("");
    try {
      await authAPI.resetPassword(fToken.trim(), fNewPw);
      setInfo("✅ Password reset successfully! You can now log in.");
      setMode("login"); setFToken(""); setFNewPw(""); setFConfirm(""); setTokenValid(null);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const Logo = () => (
    <div style={{ textAlign:"center", marginBottom:32 }}>
      <div className="login-logo-box">
        <span style={{ fontSize:28, fontFamily:"'Clash Display',sans-serif", fontWeight:900, color:"#000", letterSpacing:-1 }}>V</span>
      </div>
      <div style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:800, fontSize:22, marginBottom:4, letterSpacing:.5 }}>VES CONNECTIONS</div>
      <div style={{ fontSize:11, color:"rgba(255,255,255,.3)", fontFamily:"'JetBrains Mono',monospace", letterSpacing:2 }}>ENTERPRISE RESOURCE PLANNING</div>
    </div>
  );

  return (
    <div className="login-bg">
      {/* Animated orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      <div className="login-card-wrap">
        <div className="login-card">
          {/* Floating dots decoration */}
          {[[8,12,0],[92,20,1],[15,85,2],[88,75,0.5],[50,5,1.5]].map(([l,t,d],i)=>(
            <div key={i} className="login-dot" style={{ left:`${l}%`, top:`${t}%`, animationDelay:`${d}s`, animationDuration:`${3+i*.5}s` }} />
          ))}

          <Logo />

          {/* ── LOGIN MODE ── */}
          {mode === "login" && (
            <>
              <div className="fg" style={{ marginBottom:16 }}>
                <label className="login-label">Username</label>
                <input className="login-inp" value={u} onChange={e=>setU(e.target.value)} placeholder="Enter your username" onKeyDown={e=>e.key==="Enter"&&submit()} autoFocus />
              </div>
              <div className="fg" style={{ marginBottom:20 }}>
                <label className="login-label">Password</label>
                <div style={{ position:"relative" }}>
                  <input className="login-inp" type={showPw?"text":"password"} value={p} onChange={e=>setP(e.target.value)} placeholder="Enter your password" onKeyDown={e=>e.key==="Enter"&&submit()} style={{ paddingRight:44 }} />
                  <button onClick={()=>setShowPw(v=>!v)} style={{ position:"absolute",right:13,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:"rgba(255,255,255,.3)",lineHeight:1,transition:"color .2s" }}
                    onMouseEnter={e=>e.target.style.color=C.accent} onMouseLeave={e=>e.target.style.color="rgba(255,255,255,.3)"}>
                    {showPw?"🙈":"👁️"}
                  </button>
                </div>
              </div>
              {err  && <div className="login-err">⚠️ {err}</div>}
              {info && <div className="login-info">{info}</div>}
              <button className="login-btn" onClick={submit} disabled={loading}>
                {loading ? <span style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}><span style={{ width:14,height:14,border:"2px solid rgba(0,0,0,.3)",borderTopColor:"#000",borderRadius:"50%",display:"inline-block",animation:"spin .7s linear infinite" }} />Signing in...</span> : "Sign In →"}
              </button>
              <button className="login-link" onClick={()=>{ setMode("forgot"); setErr(""); setInfo(""); }}>
                🔑 Forgot password? Reset with token
              </button>
            </>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {mode === "forgot" && (
            <>
              <div style={{ marginBottom:20 }}>
                <div style={{ fontFamily:"'Clash Display',sans-serif",fontWeight:700,fontSize:17,marginBottom:6 }}>🔑 Password Recovery</div>
                <div style={{ fontSize:12,color:"rgba(255,255,255,.35)",lineHeight:1.7 }}>Enter your username so your Admin can generate a reset token.</div>
              </div>
              <div className="fg" style={{ marginBottom:16 }}>
                <label className="login-label">Your Username</label>
                <input className="login-inp" value={fUser} onChange={e=>setFUser(e.target.value)} placeholder="Enter your username" />
              </div>
              {err  && <div className="login-err">⚠️ {err}</div>}
              {info && <div className="login-info">{info}</div>}
              {genToken && (
                <div style={{ background:"rgba(240,165,0,.08)",border:`1px solid rgba(240,165,0,.25)`,borderRadius:12,padding:16,marginBottom:16 }}>
                  <div style={{ fontSize:11,fontWeight:700,color:C.accent,marginBottom:8,textTransform:"uppercase",letterSpacing:1.2 }}>🔐 Reset Token</div>
                  <div style={{ fontFamily:"monospace",fontSize:11,wordBreak:"break-all",color:C.text,background:"rgba(0,0,0,.3)",padding:"10px 12px",borderRadius:8,marginBottom:10 }}>{genToken}</div>
                  <button onClick={()=>navigator.clipboard?.writeText(genToken)} style={{ fontSize:12,padding:"6px 14px",background:C.accent,color:"#000",border:"none",borderRadius:7,cursor:"pointer",fontWeight:700 }}>📋 Copy Token</button>
                  <div style={{ fontSize:10,color:"rgba(255,255,255,.3)",marginTop:8 }}>Expires in 24 hours.</div>
                </div>
              )}
              <button className="login-btn" onClick={requestReset} disabled={loading||!fUser.trim()}>
                {loading?"Requesting...":"Generate Reset Token"}
              </button>
              <div className="login-divider" />
              <div style={{ fontSize:12,color:"rgba(255,255,255,.3)",marginBottom:12,textAlign:"center" }}>Already have a token?</div>
              <button style={{ width:"100%",padding:"12px",borderRadius:12,background:"rgba(255,255,255,.05)",border:"1.5px solid rgba(255,255,255,.1)",color:C.text,fontSize:14,cursor:"pointer",fontFamily:"inherit",transition:"all .2s" }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent;e.currentTarget.style.background="rgba(240,165,0,.08)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,.1)";e.currentTarget.style.background="rgba(255,255,255,.05)";}}
                onClick={()=>{ setMode("reset"); setErr(""); setInfo(""); }}>
                I have a token → Set new password
              </button>
              <button className="login-link" onClick={()=>{ setMode("login"); setErr(""); setInfo(""); setGenToken(""); }}>← Back to Sign In</button>
            </>
          )}

          {/* ── RESET WITH TOKEN ── */}
          {mode === "reset" && (
            <>
              <div style={{ marginBottom:20 }}>
                <div style={{ fontFamily:"'Clash Display',sans-serif",fontWeight:700,fontSize:17,marginBottom:6 }}>🔒 Set New Password</div>
                <div style={{ fontSize:12,color:"rgba(255,255,255,.35)",lineHeight:1.7 }}>Enter the token from your Admin, then choose a new password.</div>
              </div>
              <div className="fg" style={{ marginBottom:16 }}>
                <label className="login-label">Reset Token</label>
                <div style={{ display:"flex",gap:8 }}>
                  <input className="login-inp" value={fToken} onChange={e=>{ setFToken(e.target.value); setTokenValid(null); }} placeholder="Paste your reset token..." style={{ flex:1 }} />
                  <button style={{ padding:"0 16px",borderRadius:10,background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(255,255,255,.1)",color:C.text,cursor:"pointer",fontFamily:"inherit",fontSize:13,whiteSpace:"nowrap",transition:"all .2s" }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,.1)"}
                    onClick={verifyToken} disabled={loading||!fToken.trim()}>Verify</button>
                </div>
              </div>
              {tokenValid && (
                <div className="login-info">✅ Valid for: <strong>{tokenValid.user_name}</strong></div>
              )}
              {tokenValid && (
                <>
                  <div className="fg" style={{ marginBottom:16 }}>
                    <label className="login-label">New Password</label>
                    <input className="login-inp" type="password" value={fNewPw} onChange={e=>setFNewPw(e.target.value)} placeholder="Min 6 characters" />
                  </div>
                  <div className="fg" style={{ marginBottom:20 }}>
                    <label className="login-label">Confirm Password</label>
                    <input className="login-inp" type="password" value={fConfirm} onChange={e=>setFConfirm(e.target.value)} placeholder="Repeat password" />
                    {fConfirm && fNewPw !== fConfirm && <div style={{ fontSize:11,color:C.danger,marginTop:6 }}>⚠️ Passwords don't match</div>}
                  </div>
                </>
              )}
              {err  && <div className="login-err">⚠️ {err}</div>}
              {info && <div className="login-info">{info}</div>}
              {tokenValid && (
                <button className="login-btn" onClick={doReset} disabled={loading||!fNewPw||fNewPw!==fConfirm}>
                  {loading?"Resetting...":"✅ Reset Password"}
                </button>
              )}
              <button className="login-link" onClick={()=>{ setMode("forgot"); setErr(""); setInfo(""); setTokenValid(null); }}>← Back</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── STOCK BAR ────────────────────────────────────────────────────────────────
function StockBar({ value, min }) {
  const max = Math.max(min * 4, value + 5, 30);
  const pct = Math.min(100, (value / max) * 100);
  const color = value === 0 ? C.danger : value < min ? C.warning : C.success;
  return (
    <div className="prog-wrap">
      <span className="mono" style={{ fontSize: 12, minWidth: 24, color }}>{value}</span>
      <div className="prog-track"><div className="prog-fill" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ data, branch, user }) {
  const products = data.products;
  const sales = data.sales.filter(s => branch === "all" ? true : branch === "main" ? s.branch === "Main Branch" : s.branch === "West Branch");
  const expenses = data.expenses.filter(e => branch === "all" ? true : branch === "main" ? e.branch === "Main Branch" : e.branch === "West Branch");

  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
  const totalExpenses = expenses.reduce((s, x) => s + x.amount, 0);
  const grossProfit = sales.reduce((s, sale) => {
    return s + sale.items.reduce((a, item) => {
      const p = products.find(pr => pr.id === item.productId);
      return a + (p ? (item.price - p.buyPrice) * item.qty : 0);
    }, 0) - sale.discount;
  }, 0);
  const netProfit = grossProfit - totalExpenses;

  const totalStock = products.reduce((s, p) => s + (branch === "all" ? p.mainBranch + p.westBranch : branch === "main" ? p.mainBranch : p.westBranch), 0);
  const inventoryValue = products.reduce((s, p) => s + (branch === "all" ? (p.mainBranch + p.westBranch) : branch === "main" ? p.mainBranch : p.westBranch) * p.sellPrice, 0);
  const lowStock = products.filter(p => branch === "all" ? p.mainBranch < p.minStock || p.westBranch < p.minStock : branch === "main" ? p.mainBranch < p.minStock : p.westBranch < p.minStock);

  // Category donut data
  const catMap = {};
  products.forEach(p => {
    const qty = branch === "all" ? p.mainBranch + p.westBranch : branch === "main" ? p.mainBranch : p.westBranch;
    catMap[p.category] = (catMap[p.category] || 0) + qty * p.sellPrice;
  });
  const catData = Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // Payment method donut
  const payMap = {};
  sales.forEach(s => { payMap[s.payMethod] = (payMap[s.payMethod] || 0) + s.total; });
  const payData = Object.entries(payMap).map(([name, value]) => ({ name, value }));

  // Branch comparison
  const branchData = [
    { name: "Jewl Complex Main Branch", revenue: data.sales.filter(s => s.branch === "Main Branch").reduce((a, b) => a + b.total, 0), stock: data.products.reduce((s, p) => s + p.mainBranch, 0) },
    { name: "Juja Branch", revenue: data.sales.filter(s => s.branch === "West Branch").reduce((a, b) => a + b.total, 0), stock: data.products.reduce((s, p) => s + p.westBranch, 0) },
  ];

  // Daily sales (last 7 days)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const ds = d.toISOString().split("T")[0];
    return { day: ["S","M","T","W","T","F","S"][d.getDay()], date: ds, total: sales.filter(s => s.date === ds).reduce((a, b) => a + b.total, 0) };
  });
  const maxDay = Math.max(...days.map(d => d.total), 1);

  const RADIAN = Math.PI / 180;
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
    if (percent < 0.06) return null;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={10} fontFamily="'JetBrains Mono',monospace">{`${(percent * 100).toFixed(0)}%`}</text>;
  };

  return (
    <div className="fade-in">
      <div className="stats-grid">
        {[
          { icon: "💰", label: "Total Revenue", value: fmtKsh(totalRevenue), trend: "↑ 18% this month", dir: "up", color: "gold" },
          { icon: "📦", label: "Inventory Value", value: fmtKsh(inventoryValue), trend: `${fmtNum(totalStock)} units`, dir: "up", color: "blue" },
          { icon: "📈", label: "Gross Profit", value: fmtKsh(grossProfit), trend: `${grossProfit > 0 ? "↑" : "↓"} margin ${totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0}%`, dir: grossProfit >= 0 ? "up" : "down", color: "green" },
          { icon: "⚠️", label: "Low Stock Alerts", value: lowStock.length, trend: lowStock.length > 0 ? "Reorder needed" : "All stocked up", dir: lowStock.length > 0 ? "down" : "up", color: "red" },
        ].map((s, i) => (
          <div key={i} className={`stat-card ${s.color}`}>
            <div className="stat-accent">
              <div className="stat-icon-box" style={{ background: s.color === "gold" ? C.warningDim : s.color === "blue" ? C.infoDim : s.color === "green" ? C.successDim : C.dangerDim }}>
                {s.icon}
              </div>
            </div>
            <div className="stat-value" style={{ color: s.color === "gold" ? C.accent : s.color === "blue" ? C.info : s.color === "green" ? C.success : C.danger }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
            <div className={`stat-trend ${s.dir}`}>{s.trend}</div>
          </div>
        ))}
      </div>

      <div className="g2" style={{ marginBottom: 20 }}>
        {/* Daily Sales Sparkbar */}
        <div className="card">
          <div className="card-hd"><span className="card-title">📊 Daily Sales — Last 7 Days</span><span className="mono" style={{ fontSize: 11, color: C.textMuted }}>{fmtKsh(days.reduce((a, b) => a + b.total, 0))}</span></div>
          <div className="card-body">
            <div className="sparkbar">
              {days.map((d, i) => (
                <div key={i} className="sbar" title={`${d.date}: ${fmtKsh(d.total)}`}
                  style={{ height: `${Math.max(8, (d.total / maxDay) * 100)}%`, background: d.total > 0 ? `linear-gradient(to top,${C.accent},${C.accentDark})` : C.border }} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              {days.map((d, i) => <span key={i} style={{ flex: 1, textAlign: "center", fontSize: 10, color: C.textMuted, fontFamily: "'JetBrains Mono',monospace" }}>{d.day}</span>)}
            </div>
          </div>
        </div>

        {/* Branch Comparison */}
        <div className="card">
          <div className="card-hd"><span className="card-title">🏢 Branch Comparison</span></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={branchData} barGap={6}>
                <XAxis dataKey="name" tick={{ fill: C.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v, n) => [fmtKsh(v), n]} contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="revenue" name="Revenue" fill={C.accent} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="g2" style={{ marginBottom: 20 }}>
        {/* Inventory by Category Donut */}
        <div className="card">
          <div className="card-hd"><span className="card-title">🍩 Inventory by Category</span></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={catData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" labelLine={false} label={renderLabel}>
                  {catData.map((_, i) => <Cell key={i} fill={C.chart[i % C.chart.length]} />)}
                </Pie>
                <Tooltip formatter={v => fmtKsh(v)} contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                <Legend formatter={v => <span style={{ fontSize: 11, color: C.textDim }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods Donut */}
        <div className="card">
          <div className="card-hd"><span className="card-title">🍩 Sales by Payment Method</span></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={payData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value" labelLine={false} label={renderLabel}>
                  {payData.map((_, i) => <Cell key={i} fill={C.chart[i % C.chart.length]} />)}
                </Pie>
                <Tooltip formatter={v => fmtKsh(v)} contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                <Legend formatter={v => <span style={{ fontSize: 11, color: C.textDim }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="g2">
        {/* Low Stock */}
        <div className="card">
          <div className="card-hd"><span className="card-title">⚠️ Low Stock Alerts</span><Badge label={lowStock.length > 0 ? `${lowStock.length} items` : "All clear"} type={lowStock.length > 0 ? "b-warning" : "b-success"} /></div>
          {lowStock.length === 0 ? <div className="empty-state"><div className="es-icon">✅</div><p>All items are well stocked</p></div>
            : lowStock.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid rgba(26,45,74,.4)` }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: (branch === "main" ? p.mainBranch : branch === "west" ? p.westBranch : Math.min(p.mainBranch, p.westBranch)) === 0 ? C.danger : C.warning, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: C.textMuted }}>{p.sku} · Min: {p.minStock}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ fontSize: 11, color: p.mainBranch < p.minStock ? C.danger : C.textDim }}>Main: {p.mainBranch}</div>
                  <div className="mono" style={{ fontSize: 11, color: p.westBranch < p.minStock ? C.danger : C.textDim }}>West: {p.westBranch}</div>
                </div>
              </div>
            ))}
        </div>

        {/* Recent Sales */}
        <div className="card">
          <div className="card-hd"><span className="card-title">🛒 Recent Transactions</span></div>
          <table>
            <thead><tr><th>Receipt</th><th>Customer</th><th>Amount</th><th>Method</th></tr></thead>
            <tbody>
              {sales.slice(-6).reverse().map(s => (
                <tr key={s.id}>
                  <td className="mono" style={{ fontSize: 11, color: C.accent }}>{s.receiptNo}</td>
                  <td style={{ fontWeight: 500, fontSize: 12 }}>{s.customerName}</td>
                  <td className="mono" style={{ color: C.success, fontSize: 12 }}>{fmtKsh(s.total)}</td>
                  <td><Badge label={s.payMethod} type="b-gray" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────
function Inventory({ data, setData, branch, notify }) {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const cats = ["All", ...new Set(data.products.map(p => p.category))];

  const filtered = data.products.filter(p =>
    (cat === "All" || p.category === cat) &&
    (p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()))
  );

  const openAdd = () => { setEditId(null); setForm({ name: "", category: "Smartphones", sku: "", buyPrice: "", sellPrice: "", mainBranch: "", westBranch: "", minStock: "", supplier: "", barcode: "" }); setShowForm(true); };
  const openEdit = p => { setEditId(p.id); setForm({ ...p }); setShowForm(true); };
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.name || !form.sku || !form.sellPrice) return notify("Name, SKU and Sell Price are required", "error");
    setSaving(true);
    try {
      const payload = {
        name: form.name, sku: form.sku, barcode: form.barcode || null,
        category: form.category, buy_price: +form.buyPrice, sell_price: +form.sellPrice,
        main_branch_qty: +form.mainBranch || 0, west_branch_qty: +form.westBranch || 0,
        min_stock: +form.minStock || 5,
        supplier_id: form.supplierId || null,
      };
      let res;
      if (editId) {
        res = await productsAPI.update(editId, payload);
        setData(d => ({ ...d, products: d.products.map(p => p.id === editId ? { ...p, ...mapProduct({ ...res.data, supplier_name: form.supplier }) } : p) }));
        notify("Product updated ✅");
      } else {
        res = await productsAPI.create(payload);
        setData(d => ({ ...d, products: [...d.products, mapProduct({ ...res.data, supplier_name: form.supplier })] }));
        notify("Product added ✅");
      }
      setShowForm(false);
    } catch(e) { notify(e.message, "error"); }
    setSaving(false);
  };
  const del = async id => {
    try {
      await productsAPI.delete(id);
      setData(d => ({ ...d, products: d.products.filter(p => p.id !== id) }));
      notify("Product deleted", "error");
    } catch(e) { notify(e.message, "error"); }
  };

  const totalVal = filtered.reduce((s, p) => s + (branch === "all" ? p.mainBranch + p.westBranch : branch === "main" ? p.mainBranch : p.westBranch) * p.sellPrice, 0);

  if (showForm) return (
    <div className="fade-in">
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button className="btn btn-ghost" onClick={() => setShowForm(false)}>← Back</button>
        <h2 style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:700, fontSize:20, margin:0 }}>{editId ? "✏️ Edit Product" : "📦 Add New Product"}</h2>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div className="card">
          <div className="card-hd"><span className="card-title">Product Details</span></div>
          <div className="card-body" style={{ padding:24 }}>
            <div className="fg"><label className="flabel">Product Name *</label><input className="inp" value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. iPhone 15 Pro" /></div>
            <div className="fg"><label className="flabel">SKU Code *</label><input className="inp" value={form.sku || ""} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="APL-IP15P" /></div>
            <div className="fg"><label className="flabel">Category</label><select className="sel" value={form.category || ""} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {["Smartphones","Accessories","Cables","Chargers","Audio","Power","Bags","Displays","Storage","Other"].map(c => <option key={c}>{c}</option>)}</select></div>
            <div className="fg"><label className="flabel">Supplier</label><input className="inp" value={form.supplier || ""} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} /></div>
            <div className="fg"><label className="flabel">Barcode</label><input className="inp" value={form.barcode || ""} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} /></div>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><span className="card-title">Pricing & Stock</span></div>
          <div className="card-body" style={{ padding:24 }}>
            <div className="frow">
              <div className="fg"><label className="flabel">Buy Price (KSh)</label><input className="inp" type="number" value={form.buyPrice || ""} onChange={e => setForm(f => ({ ...f, buyPrice: e.target.value }))} /></div>
              <div className="fg"><label className="flabel">Selling Price (KSh)</label><input className="inp" type="number" value={form.sellPrice || ""} onChange={e => setForm(f => ({ ...f, sellPrice: e.target.value }))} /></div>
            </div>
            <div className="frow3">
              <div className="fg"><label className="flabel">Main Branch Stock</label><input className="inp" type="number" value={form.mainBranch || ""} onChange={e => setForm(f => ({ ...f, mainBranch: e.target.value }))} /></div>
              <div className="fg"><label className="flabel">Juja Branch Stock</label><input className="inp" type="number" value={form.westBranch || ""} onChange={e => setForm(f => ({ ...f, westBranch: e.target.value }))} /></div>
              <div className="fg"><label className="flabel">Min. Stock Level</label><input className="inp" type="number" value={form.minStock || ""} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} /></div>
            </div>
            {form.buyPrice && form.sellPrice && (
              <div style={{ padding:"12px 16px", background:C.successDim, borderRadius:10, marginTop:8 }}>
                <div style={{ fontSize:12, color:C.textMuted }}>Profit Margin</div>
                <div style={{ fontSize:22, fontWeight:800, color:C.success }}>
                  {fmtKsh(+form.sellPrice - +form.buyPrice)}
                  <span style={{ fontSize:13, fontWeight:400, color:C.textMuted, marginLeft:8 }}>
                    ({form.buyPrice > 0 ? (((+form.sellPrice - +form.buyPrice) / +form.buyPrice) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
              </div>
            )}
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <><Spinner/>Saving...</> : "Save Product"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fade-in">
      <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="stat-card blue"><div className="stat-icon-box" style={{ background: C.infoDim, marginBottom: 10 }}>📦</div><div className="stat-value" style={{ color: C.info, fontSize: 22 }}>{data.products.length}</div><div className="stat-label">Total Products</div></div>
        <div className="stat-card gold"><div className="stat-icon-box" style={{ background: C.warningDim, marginBottom: 10 }}>💎</div><div className="stat-value" style={{ color: C.accent, fontSize: 20 }}>{fmtKsh(totalVal)}</div><div className="stat-label">Stock Value ({branch === "all" ? "All" : branch === "main" ? "Main" : "West"})</div></div>
        <div className="stat-card red"><div className="stat-icon-box" style={{ background: C.dangerDim, marginBottom: 10 }}>⚠️</div><div className="stat-value" style={{ color: C.danger, fontSize: 22 }}>{data.products.filter(p => p.mainBranch < p.minStock || p.westBranch < p.minStock).length}</div><div className="stat-label">Low / Out of Stock</div></div>
      </div>

      <div className="card">
        <div className="card-hd">
          <span className="card-title">Product Catalog</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select className="sel" style={{ width: 150 }} value={cat} onChange={e => setCat(e.target.value)}>
              {cats.map(c => <option key={c}>{c}</option>)}
            </select>
            <div className="search-wrap"><span className="search-icon">🔍</span><input className="inp" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} /></div>
            <button className="btn btn-primary" onClick={openAdd}>+ Add Product</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Buy Price</th><th>Sell Price</th><th>Margin</th>{branch !== "west" && <th>Main</th>}{branch !== "main" && <th>West</th>}<th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(p => {
                const margin = p.buyPrice > 0 ? (((p.sellPrice - p.buyPrice) / p.sellPrice) * 100).toFixed(1) : "-";
                const stock = branch === "main" ? p.mainBranch : branch === "west" ? p.westBranch : p.mainBranch + p.westBranch;
                const status = stock === 0 ? "Out of Stock" : stock < p.minStock ? "Low Stock" : "In Stock";
                return (
                  <tr key={p.id}>
                    <td><div style={{ fontWeight: 600 }}>{p.name}</div><div className="mono" style={{ fontSize: 10, color: C.textMuted }}>{p.supplier}</div></td>
                    <td className="mono" style={{ fontSize: 11.5, color: C.textDim }}>{p.sku}</td>
                    <td><Badge label={p.category} type="b-gray" /></td>
                    <td className="mono" style={{ color: C.textDim, fontSize: 12 }}>{fmtKsh(p.buyPrice)}</td>
                    <td className="mono" style={{ color: C.accent, fontSize: 12 }}>{fmtKsh(p.sellPrice)}</td>
                    <td><span style={{ color: C.success, fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{margin}%</span></td>
                    {branch !== "west" && <td><StockBar value={p.mainBranch} min={p.minStock} /></td>}
                    {branch !== "main" && <td><StockBar value={p.westBranch} min={p.minStock} /></td>}
                    <td><Badge label={status} /></td>
                    <td><div style={{ display: "flex", gap: 5 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(p)}>✏️ Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(p.id)}>🗑️</button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── RECEIPT MODAL ─────────────────────────────────────────────────────────────
function ReceiptModal({ sale, onClose }) {
  if (!sale) return null;
  const printReceipt = () => {
    const w = window.open("", "_blank", "width=400,height=600");
    w.document.write(`<html><head><title>Receipt ${sale.receiptNo}</title><style>
      body{font-family:'Courier New',monospace;font-size:12px;padding:20px;width:300px;margin:0 auto;}
      .center{text-align:center;} .bold{font-weight:bold;} .line{border-top:1px dashed #000;margin:8px 0;}
      table{width:100%;} td{padding:2px 4px;} .right{text-align:right;}
    </style></head><body>
      <div class="center bold" style="font-size:16px">VES CONNECTIONS LIMITED</div>
      <div class="center">Electronics & Accessories</div>
      <div class="center">Nairobi, Kenya · +254 700 000 000</div>
      <div class="line"></div>
      <div>Receipt: <b>${sale.receiptNo}</b></div>
      <div>Date: ${sale.date} ${new Date().toLocaleTimeString()}</div>
      <div>Branch: ${sale.branch}</div>
      <div>Customer: ${sale.customerName}</div>
      <div>Staff: ${sale.staff}</div>
      <div class="line"></div>
      <table><tr><td class="bold">Item</td><td class="bold right">Qty</td><td class="bold right">Price</td><td class="bold right">Total</td></tr>
      ${sale.items.map(i => `<tr><td>${i.name}</td><td class="right">${i.qty}</td><td class="right">${i.price.toLocaleString()}</td><td class="right">${(i.qty * i.price).toLocaleString()}</td></tr>`).join("")}
      </table>
      <div class="line"></div>
      <div style="display:flex;justify-content:space-between"><span>Subtotal:</span><span>KSh ${sale.subtotal.toLocaleString()}</span></div>
      ${sale.discount > 0 ? `<div style="display:flex;justify-content:space-between"><span>Discount:</span><span>-KSh ${sale.discount.toLocaleString()}</span></div>` : ""}
      <div class="line"></div>
      <div class="bold" style="display:flex;justify-content:space-between;font-size:14px"><span>TOTAL:</span><span>KSh ${sale.total.toLocaleString()}</span></div>
      <div>Payment: ${sale.payMethod}</div>
      <div class="line"></div>
      <div class="center">Thank you for shopping at VES CONNECTIONS!</div>
      <div class="center">Goods once sold are not returnable</div>
      <div class="center" style="font-size:10px;margin-top:8px">* * * * * * * * * *</div>
      <script>window.print();window.close();</script>
    </body></html>`);
    w.document.close();
  };

  return (
    <Overlay onClose={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">🧾 Receipt — {sale.receiptNo}</div>
        <div style={{ background: C.surfaceAlt, borderRadius: 10, padding: 20, border: `1px solid ${C.border}`, fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 15, fontFamily: "'Clash Display',sans-serif" }}>VES CONNECTIONS LIMITED</div>
            <div style={{ color: C.textMuted, fontSize: 11 }}>Electronics & Accessories · Nairobi, Kenya</div>
            <div style={{ color: C.textMuted, fontSize: 11 }}>+254 700 000 000</div>
          </div>
          <div style={{ borderTop: `1px dashed ${C.border}`, paddingTop: 10, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>Receipt #</span><span style={{ color: C.accent }}>{sale.receiptNo}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>Date</span><span>{sale.date}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>Branch</span><span>{sale.branch}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>Customer</span><span>{sale.customerName}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>Staff</span><span>{sale.staff}</span></div>
           <div style={{ display: "flex", justifyContent: "space-between" }}>
  <span style={{ color: C.textMuted }}>Payment</span>
  <span>{sale?.payMethod || "N/A"}</span> 
</div>
          </div>
          <div style={{ borderTop: `1px dashed ${C.border}`, borderBottom: `1px dashed ${C.border}`, padding: "10px 0", marginBottom: 10 }}>
            <table style={{ width: "100%" }}>
              <thead><tr>{["Item", "Qty", "Price", "Total"].map(h => <th key={h} style={{ textAlign: h !== "Item" ? "right" : "left", padding: "2px 4px", color: C.textMuted, fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{h}</th>)}</tr></thead>
              <tbody>
                {sale.items.map((it, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 11, padding: "3px 4px" }}>{it.name}</td>
                    <td style={{ textAlign: "right", fontSize: 11, padding: "3px 4px" }}>{it.qty}</td>
                    <td style={{ textAlign: "right", fontSize: 11, padding: "3px 4px" }}>{it.price.toLocaleString()}</td>
                    <td style={{ textAlign: "right", fontSize: 11, padding: "3px 4px" }}>{(it.qty * it.price).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>Subtotal</span><span>KSh {sale.subtotal.toLocaleString()}</span></div>
          {sale.discount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.textMuted }}>Discount</span><span style={{ color: C.danger }}>-KSh {sale.discount.toLocaleString()}</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15, marginTop: 8, color: C.success }}><span>TOTAL</span><span>KSh {sale.total.toLocaleString()}</span></div>
          <div style={{ borderTop: `1px dashed ${C.border}`, marginTop: 12, paddingTop: 10, textAlign: "center", color: C.textMuted, fontSize: 10 }}>
            Thank you for shopping at VES CONNECTIONS!<br />Goods once sold are not returnable
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Close</button>
          <button className="btn btn-success" onClick={() => shareWhatsApp(sale)}>📲 WhatsApp</button>
          <button className="btn btn-primary" onClick={printReceipt}>🖨️ Print Receipt</button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── SALES ────────────────────────────────────────────────────────────────────
function Sales({ data, setData, branch, user, notify }) {
  const [showForm, setShowForm] = useState(false);
  const [viewReceipt, setViewReceipt] = useState(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ customerName: "Walk-in", branch: "Main Branch", payMethod: "Cash", discount: 0, items: [] });
  const [cartItem, setCartItem] = useState({ productId: "", qty: 1 });

  const filtered = data.sales.filter(s =>
    (branch === "all" ? true : branch === "main" ? s.branch === "Main Branch" : s.branch === "West Branch") &&
    (s.customerName.toLowerCase().includes(search.toLowerCase()) || s.receiptNo.toLowerCase().includes(search.toLowerCase()))
  );

  const addToCart = () => {
    if (!cartItem.productId) return;
    const p = data.products.find(x => x.id === +cartItem.productId);
    if (!p) return;
    const exists = form.items.find(i => i.productId === +cartItem.productId);
    if (exists) {
      setForm(f => ({ ...f, items: f.items.map(i => i.productId === +cartItem.productId ? { ...i, qty: i.qty + +cartItem.qty } : i) }));
    } else {
      setForm(f => ({ ...f, items: [...f.items, { productId: p.id, name: p.name, qty: +cartItem.qty, price: p.sellPrice }] }));
    }
    setCartItem({ productId: "", qty: 1 });
  };

  const removeItem = idx => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const subtotal = form.items.reduce((s, i) => s + i.qty * i.price, 0);
  const total = subtotal - (+form.discount || 0);
  const [saving, setSaving] = useState(false);

  const del = async (id) => {
    if (!window.confirm("Delete this sale record? This cannot be undone.")) return;
    try {
      await salesAPI.delete(id);
      setData(d => ({ ...d, sales: d.sales.filter(s => s.id !== id) }));
      notify("Sale deleted");
    } catch(e) { notify(e.message, "error"); }
  };

  const recordSale = async () => {
    if (!form.items.length) return notify("Add at least one item", "error");
    setSaving(true);
    try {
      const payload = {
        customer_name: form.customerName || "Walk-in",
        branch: form.branch, pay_method: form.payMethod,
        discount: +form.discount || 0, tax: 0,
        items: form.items.map(i => ({ productId: i.productId, name: i.name, qty: i.qty, price: i.price })),
        staff_id: user.id,
      };
      const res = await salesAPI.create(payload);
      const newSale = mapSale(res.data);
      setData(d => ({
        ...d, receiptCounter: d.receiptCounter + 1,
        sales: [newSale, ...d.sales],
        products: d.products.map(p => {
          const item = form.items.find(i => i.productId === p.id);
          if (!item) return p;
          return { ...p,
            mainBranch: form.branch === "Main Branch" ? Math.max(0, p.mainBranch - item.qty) : p.mainBranch,
            westBranch: form.branch !== "Main Branch" ? Math.max(0, p.westBranch - item.qty) : p.westBranch,
          };
        }),
      }));
      setViewReceipt(newSale);
      setShowForm(false);
      setForm({ customerName: "Walk-in", branch: "Main Branch", payMethod: "Cash", discount: 0, items: [] });
      notify("Sale recorded — " + newSale.receiptNo);
    } catch(e) { notify(e.message, "error"); }
    setSaving(false);
  };

  const totalRev = filtered.reduce((s, x) => s + x.total, 0);

  if (showForm) return (
    <div className="fade-in">
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button className="btn btn-ghost" onClick={() => setShowForm(false)}>← Back</button>
        <h2 style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:700, fontSize:20, margin:0 }}>🛒 Record New Sale</h2>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div className="card">
          <div className="card-hd"><span className="card-title">Sale Details</span></div>
          <div className="card-body">
            <div className="frow">
              <div className="fg"><label className="flabel">Customer Name</label><input className="inp" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} /></div>
              <div className="fg"><label className="flabel">Branch</label><select className="sel" value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}><option>Main Branch</option><option>West Branch</option><option>Juja Branch</option></select></div>
            </div>
            <div className="frow">
              <div className="fg"><label className="flabel">Payment Method</label><select className="sel" value={form.payMethod} onChange={e => setForm(f => ({ ...f, payMethod: e.target.value }))}><option>Cash</option><option>M-Pesa</option><option>Card</option><option>Bank Transfer</option></select></div>
              <div className="fg"><label className="flabel">Discount (KSh)</label><input className="inp" type="number" value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} /></div>
            </div>
            <div className="divider" />
            <div style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:700, marginBottom:10 }}>Add Items</div>
            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              <select className="sel" style={{ flex:2 }} value={cartItem.productId} onChange={e => setCartItem(c => ({ ...c, productId: e.target.value }))}>
                <option value="">Select product...</option>
                {data.products.map(p => <option key={p.id} value={p.id}>{p.name} — KSh {p.sellPrice.toLocaleString()}</option>)}
              </select>
              <input className="inp" type="number" min="1" style={{ width:70 }} value={cartItem.qty} onChange={e => setCartItem(c => ({ ...c, qty: e.target.value }))} />
              <button className="btn btn-success" onClick={addToCart}>Add</button>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><span className="card-title">Cart Items</span></div>
          <div className="card-body">
            {form.items.length === 0 ? <div style={{ color:C.textMuted, fontSize:13, padding:"20px 0" }}>No items added yet</div>
              : form.items.map((item, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:C.surfaceAlt, borderRadius:8, marginBottom:6, border:`1px solid ${C.border}` }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{item.name}</div>
                    <div className="mono" style={{ fontSize:11, color:C.textMuted }}>{item.qty} × KSh {item.price.toLocaleString()}</div>
                  </div>
                  <div className="mono" style={{ color:C.accent, fontWeight:700 }}>KSh {(item.qty * item.price).toLocaleString()}</div>
                  <button className="btn btn-danger btn-sm" onClick={() => removeItem(i)}>×</button>
                </div>
              ))}
            <div style={{ background:C.surfaceAlt, borderRadius:10, padding:14, marginTop:12, border:`1px solid ${C.borderLight}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}><span style={{ color:C.textMuted }}>Subtotal</span><span className="mono">{fmtKsh(subtotal)}</span></div>
              {+form.discount > 0 && <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}><span style={{ color:C.textMuted }}>Discount</span><span className="mono" style={{ color:C.danger }}>-{fmtKsh(+form.discount)}</span></div>}
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:18, fontFamily:"'Clash Display',sans-serif", fontWeight:700, color:C.success, marginTop:8, paddingTop:8, borderTop:`1px solid ${C.border}` }}><span>Total</span><span>{fmtKsh(total)}</span></div>
            </div>
            <button className="btn btn-primary" style={{ width:"100%", justifyContent:"center", marginTop:16 }} disabled={!form.items.length || saving} onClick={recordSale}>
              {saving ? <><Spinner/>Processing...</> : "✅ Complete Sale"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div className="mono" style={{ fontSize: 11, color: C.textMuted }}>TOTAL REVENUE ({branch === "all" ? "ALL BRANCHES" : branch === "main" ? "MAIN BRANCH" : "WEST BRANCH"})</div>
          <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 800, fontSize: 32, color: C.success }}>{fmtKsh(totalRev)}</div>
          <div style={{ fontSize: 12, color: C.textMuted }}>{filtered.length} transactions</div>
        </div>
        <button className="btn btn-primary" style={{ fontSize: 14, padding: "12px 24px" }} onClick={() => setShowForm(true)}>🛒 New Sale</button>
      </div>

      <div className="card">
        <div className="card-hd">
          <span className="card-title">Sales History</span>
          <div className="search-wrap"><span className="search-icon">🔍</span><input className="inp" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Items</th><th>Subtotal</th><th>Discount</th><th>Total</th><th>Branch</th><th>Method</th><th>Staff</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td className="mono" style={{ color: C.accent, fontSize: 11 }}>{s.receiptNo}</td>
                  <td className="mono" style={{ fontSize: 11, color: C.textMuted }}>{s.date}</td>
                  <td style={{ fontWeight: 500 }}>{s.customerName}</td>
                  <td style={{ fontSize: 11, color: C.textDim }}>{s.items.map(i => `${i.name} x${i.qty}`).join(", ")}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{fmtKsh(s.subtotal)}</td>
                  <td className="mono" style={{ fontSize: 12, color: s.discount > 0 ? C.danger : C.textMuted }}>{s.discount > 0 ? `-${fmtKsh(s.discount)}` : "—"}</td>
                  <td className="mono" style={{ fontSize: 12, color: C.success, fontWeight: 600 }}>{fmtKsh(s.total)}</td>
                  <td><Badge label={s.branch} type="b-gray" /></td>
                  <td><Badge label={s.payMethod} type="b-info" /></td>
                  <td style={{ fontSize: 12, color: C.textDim }}>{s.staff}</td>
                  <td>
                    <div style={{ display:"flex", gap:4 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setViewReceipt(s)}>🧾 Receipt</button>
                      {user?.role === "Admin" && <button className="btn btn-danger btn-sm" onClick={() => del(s.id)}>🗑️</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {viewReceipt && <ReceiptModal sale={viewReceipt} onClose={() => setViewReceipt(null)} />}
    </div>
  );
}

// ─── PURCHASE ORDERS ──────────────────────────────────────────────────────────
function PurchaseOrders({ data, setData, notify }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ supplier: "", branch: "Main Branch", notes: "", items: [] });
  const [cartItem, setCartItem] = useState({ name: "", qty: "", unitCost: "" });

  const addPOItem = () => {
    if (!cartItem.name || !cartItem.qty) return;
    setForm(f => ({ ...f, items: [...f.items, { ...cartItem, qty: +cartItem.qty, unitCost: +cartItem.unitCost }] }));
    setCartItem({ name: "", qty: "", unitCost: "" });
  };

  const total = form.items.reduce((s, i) => s + i.qty * i.unitCost, 0);

  const [saving, setSaving] = useState(false);
  const create = async () => {
    if (!form.supplier || !form.items.length) return notify("Select a supplier and add items", "error");
    setSaving(true);
    try {
      const supplier = data.suppliers.find(s => s.name === form.supplier);
      const payload = {
        supplier_id: supplier?.id || null,
        supplier_name: form.supplier,
        branch: form.branch, notes: form.notes,
        items: form.items,
      };
      const res = await purchaseOrdersAPI.create(payload);
      setData(d => ({ ...d, purchaseOrders: [mapOrder(res.data), ...d.purchaseOrders] }));
      setShowForm(false);
      setForm({ supplier: "", branch: "Main Branch", notes: "", items: [] });
      notify("Purchase order created ✅");
    } catch(e) { notify(e.message, "error"); }
    setSaving(false);
  };

  const updateStatus = async (id, status) => {
    try {
      await purchaseOrdersAPI.updateStatus(id, status);
      setData(d => ({ ...d, purchaseOrders: d.purchaseOrders.map(po => po.id === id ? { ...po, status } : po) }));
      notify(`Status updated to ${status}`);
    } catch(e) { notify(e.message, "error"); }
  };

  const statusColor = s => s === "Delivered" ? "b-success" : s === "In Transit" ? "b-info" : s === "Pending" ? "b-warning" : "b-danger";

  if (showForm) return (
    <div className="fade-in">
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button className="btn btn-ghost" onClick={() => setShowForm(false)}>← Back</button>
        <h2 style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:700, fontSize:20, margin:0 }}>📋 Create Purchase Order</h2>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div className="card">
          <div className="card-hd"><span className="card-title">Order Details</span></div>
          <div className="card-body">
            <div className="fg"><label className="flabel">Supplier *</label><select className="sel" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}><option value="">Select...</option>{data.suppliers.map(s => <option key={s.id}>{s.name}</option>)}</select></div>
            <div className="fg"><label className="flabel">Deliver To</label><select className="sel" value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}><option>Main Branch</option><option>West Branch</option><option>Juja Branch</option></select></div>
            <div className="fg"><label className="flabel">Notes</label><textarea className="inp" style={{ minHeight:80 }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes..." /></div>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><span className="card-title">Order Items</span></div>
          <div className="card-body">
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input className="inp" placeholder="Item name" style={{ flex: 2 }} value={cartItem.name} onChange={e => setCartItem(c => ({ ...c, name: e.target.value }))} />
              <input className="inp" type="number" placeholder="Qty" style={{ width: 70 }} value={cartItem.qty} onChange={e => setCartItem(c => ({ ...c, qty: e.target.value }))} />
              <input className="inp" type="number" placeholder="Unit Cost" style={{ width: 100 }} value={cartItem.unitCost} onChange={e => setCartItem(c => ({ ...c, unitCost: e.target.value }))} />
              <button className="btn btn-success" onClick={addPOItem}>Add</button>
            </div>
            {form.items.map((it, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 12px", background: C.surfaceAlt, borderRadius: 8, marginBottom: 5 }}>
                <span style={{ flex: 1, fontSize: 13 }}>{it.name}</span>
                <span className="mono" style={{ fontSize: 11, color: C.textMuted }}>×{it.qty} @ KSh {it.unitCost.toLocaleString()}</span>
                <span className="mono" style={{ color: C.accent }}>KSh {(it.qty * it.unitCost).toLocaleString()}</span>
                <button className="btn btn-danger btn-sm" onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}>×</button>
              </div>
            ))}
            {form.items.length > 0 && <div style={{ textAlign: "right", fontWeight: 700, fontSize: 16, color: C.accent, marginTop: 10, padding:"10px 14px", background:C.surfaceAlt, borderRadius:10 }}>Total: {fmtKsh(total)}</div>}
            <button className="btn btn-primary" style={{ width:"100%", justifyContent:"center", marginTop:16 }} onClick={create} disabled={saving}>{saving ? <><Spinner/>Creating...</> : "📋 Create Order"}</button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-hd">
          <span className="card-title">Purchase Orders</span>
          <div style={{ display: "flex", gap: 10 }}>
            <span className="mono" style={{ fontSize: 12, color: C.textMuted, alignSelf: "center" }}>Total: {fmtKsh(data.purchaseOrders.reduce((s, po) => s + po.total, 0))}</span>
            <button className="btn btn-primary" onClick={() => { setForm({ supplier: "", branch: "Main Branch", notes: "", items: [] }); setCartItem({ name: "", qty: "", unitCost: "" }); setShowForm(true); }}>+ New Order</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>PO #</th><th>Date</th><th>Supplier</th><th>Items</th><th>Branch</th><th>Total</th><th>Status</th><th>Update</th></tr></thead>
            <tbody>
              {data.purchaseOrders.map(po => (
                <tr key={po.id}>
                  <td className="mono" style={{ color: C.accent, fontSize: 11 }}>{po.id}</td>
                  <td className="mono" style={{ fontSize: 11, color: C.textMuted }}>{po.date}</td>
                  <td style={{ fontWeight: 600 }}>{po.supplier}</td>
                  <td style={{ fontSize: 11.5, color: C.textDim }}>{po.items.map(i => `${i.name} ×${i.qty}`).join(", ")}</td>
                  <td><Badge label={po.branch} type="b-gray" /></td>
                  <td className="mono" style={{ fontWeight: 600 }}>{fmtKsh(po.total)}</td>
                  <td><Badge label={po.status} type={statusColor(po.status)} /></td>
                  <td>
                    {po.status !== "Delivered" && po.status !== "Cancelled" ? (
                      <select className="sel" style={{ width: 140, padding: "4px 8px", fontSize: 11 }} value={po.status} onChange={e => updateStatus(po.id, e.target.value)}>
                        <option>Pending</option><option>In Transit</option><option>Delivered</option><option>Cancelled</option>
                      </select>
                    ) : <span style={{ fontSize: 11, color: C.textMuted }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────
function Customers({ data, setData, notify }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [search, setSearch] = useState("");

  const filtered = data.customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );

  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.name) return notify("Name is required", "error");
    setSaving(true);
    try {
      const res = await customersAPI.create({ name: form.name, phone: form.phone, email: form.email });
      setData(d => ({ ...d, customers: [...d.customers, mapCustomer(res.data)] }));
      setShowForm(false); setForm({ name: "", phone: "", email: "" });
      notify("Customer added ✅");
    } catch(e) { notify(e.message, "error"); }
    setSaving(false);
  };

  const del = async id => {
    try {
      await customersAPI.delete(id);
      setData(d => ({ ...d, customers: d.customers.filter(c => c.id !== id) }));
      notify("Customer removed", "error");
    } catch(e) { notify(e.message, "error"); }
  };

  if (showForm) return (
    <div className="fade-in">
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button className="btn btn-ghost" onClick={() => setShowForm(false)}>← Back</button>
        <h2 style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:700, fontSize:20, margin:0 }}>👤 Add Customer</h2>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div className="card">
          <div className="card-hd"><span className="card-title">👤 Customer Info</span></div>
          <div className="card-body" style={{ padding:24 }}>
            <div className="fg"><label className="flabel">Full Name *</label><input className="inp" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. John Kamau" /></div>
            <div className="fg"><label className="flabel">Phone</label><input className="inp" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+254..." /></div>
            <div className="fg"><label className="flabel">Email</label><input className="inp" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com" /></div>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><span className="card-title">ℹ️ Quick Tips</span></div>
          <div className="card-body" style={{ padding:24 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {[
                { icon:"📞", tip:"Phone number is used for M-Pesa payments and loyalty program" },
                { icon:"📧", tip:"Email used for sending invoices and receipts" },
                { icon:"⭐", tip:"Customer loyalty points are tracked automatically from sales" },
              ].map((t,i) => (
                <div key={i} style={{ display:"flex", gap:12, padding:"12px 14px", background:C.surfaceAlt, borderRadius:10 }}>
                  <span style={{ fontSize:22 }}>{t.icon}</span>
                  <span style={{ fontSize:13, color:C.textDim, lineHeight:1.5 }}>{t.tip}</span>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:20 }}>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <><Spinner/>Saving...</> : "Add Customer"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-hd">
          <span className="card-title">👥 Customer Directory</span>
          <div style={{ display: "flex", gap: 10 }}>
            <div className="search-wrap"><span className="search-icon">🔍</span><input className="inp" placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} /></div>
            <button className="btn btn-primary" onClick={() => { setForm({ name:"", phone:"", email:"" }); setShowForm(true); }}>+ Add Customer</button>
          </div>
        </div>
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Email</th><th>Total Spent</th><th>Visits</th><th>Joined</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.id}>
                <td className="mono" style={{ color: C.textMuted, fontSize: 11 }}>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td className="mono" style={{ fontSize: 12, color: C.textDim }}>{c.phone}</td>
                <td style={{ fontSize: 12, color: C.info }}>{c.email}</td>
                <td className="mono" style={{ color: C.success, fontWeight: 600, fontSize: 12 }}>{fmtKsh(c.totalSpent)}</td>
                <td className="mono" style={{ fontSize: 12 }}>{c.visits}</td>
                <td className="mono" style={{ fontSize: 11, color: C.textMuted }}>{c.joined}</td>
                <td><button className="btn btn-danger btn-sm" onClick={() => del(c.id)}>🗑️ Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────
function Suppliers({ data, setData, notify }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", email: "", address: "", categories: "", rating: 3 });
  const [saving, setSaving] = useState(false);
  const del = async id => {
    try {
      await suppliersAPI.delete(id);
      setData(d => ({ ...d, suppliers: d.suppliers.filter(s => s.id !== id) }));
      notify("Supplier removed", "error");
    } catch(e) { notify(e.message, "error"); }
  };
  const save = async () => {
    if (!form.name) return notify("Name is required", "error");
    setSaving(true);
    try {
      const res = await suppliersAPI.create({ name: form.name, contact: form.contact, email: form.email, address: form.address, categories: form.categories, rating: +form.rating });
      setData(d => ({ ...d, suppliers: [...d.suppliers, mapSupplier(res.data)] }));
      setShowForm(false); setForm({ name: "", contact: "", email: "", address: "", categories: "", rating: 3 });
      notify("Supplier added ✅");
    } catch(e) { notify(e.message, "error"); }
    setSaving(false);
  };
  const stars = n => "★".repeat(n) + "☆".repeat(5 - n);

  if (showForm) return (
    <div className="fade-in">
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button className="btn btn-ghost" onClick={() => setShowForm(false)}>← Back</button>
        <h2 style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:700, fontSize:20, margin:0 }}>🤝 Add Supplier</h2>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div className="card">
          <div className="card-hd"><span className="card-title">🤝 Supplier Details</span></div>
          <div className="card-body" style={{ padding:24 }}>
            <div className="fg"><label className="flabel">Name *</label><input className="inp" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Samsung Kenya Ltd" /></div>
            <div className="frow">
              <div className="fg"><label className="flabel">Phone</label><input className="inp" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} placeholder="+254..." /></div>
              <div className="fg"><label className="flabel">Email</label><input className="inp" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            </div>
            <div className="fg"><label className="flabel">Address</label><input className="inp" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><span className="card-title">📦 Categories & Rating</span></div>
          <div className="card-body" style={{ padding:24 }}>
            <div className="fg"><label className="flabel">Categories</label><input className="inp" value={form.categories} onChange={e => setForm(f => ({ ...f, categories: e.target.value }))} placeholder="Smartphones, Accessories..." /></div>
            <div className="fg"><label className="flabel">Rating</label>
              <div style={{ display:"flex", gap:8, marginTop:6 }}>
                {[1,2,3,4,5].map(n => (
                  <div key={n} onClick={() => setForm(f => ({ ...f, rating: n }))}
                    style={{ width:40, height:40, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, cursor:"pointer",
                      background: form.rating >= n ? C.warningDim : C.surfaceAlt,
                      border:`2px solid ${form.rating >= n ? C.warning : C.border}`, transition:"all .15s" }}>⭐</div>
                ))}
              </div>
              <div style={{ fontSize:12, color:C.textMuted, marginTop:6 }}>{["","Poor","Fair","Good","Very Good","Excellent"][form.rating]} supplier</div>
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:20 }}>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <><Spinner/>Saving...</> : "Add Supplier"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-hd"><span className="card-title">🤝 Supplier Directory</span><button className="btn btn-primary" onClick={() => { setForm({ name:"", contact:"", email:"", address:"", categories:"", rating:3 }); setShowForm(true); }}>+ Add Supplier</button></div>
        <table>
          <thead><tr><th>Supplier</th><th>Phone</th><th>Email</th><th>Address</th><th>Categories</th><th>Payable</th><th>Rating</th><th>Action</th></tr></thead>
          <tbody>
            {data.suppliers.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 700 }}>{s.name}</td>
                <td className="mono" style={{ fontSize: 12, color: C.textDim }}>{s.contact}</td>
                <td style={{ fontSize: 12, color: C.info }}>{s.email}</td>
                <td style={{ fontSize: 12, color: C.textMuted }}>{s.address}</td>
                <td><Badge label={s.categories.split(",")[0].trim()} type="b-gray" /></td>
                <td className="mono" style={{ color: s.balance > 0 ? C.danger : C.success, fontSize: 12 }}>{fmtKsh(s.balance)}</td>
                <td style={{ color: C.warning, letterSpacing: 2 }}>{stars(s.rating)}</td>
                <td><button className="btn btn-danger btn-sm" onClick={() => del(s.id)}>🗑️</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

// ─── EXPENSES ─────────────────────────────────────────────────────────────────
function Expenses({ data, setData, branch, user, notify }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: today(), category: "Rent", amount: "", branch: "Main Branch", description: "" });
  const filtered = data.expenses.filter(e => branch === "all" ? true : branch === "main" ? e.branch === "Main Branch" : e.branch === "West Branch");

  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.amount) return notify("Amount is required", "error");
    setSaving(true);
    try {
      const res = await expensesAPI.create({ expense_date: form.date, category: form.category, amount: +form.amount, branch: form.branch, description: form.description });
      setData(d => ({ ...d, expenses: [mapExpense({ ...res.data, added_by_name: user.name }), ...d.expenses] }));
      setShowForm(false); notify("Expense recorded ✅");
    } catch(e) { notify(e.message, "error"); }
    setSaving(false);
  };

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const bycat = {};
  filtered.forEach(e => { bycat[e.category] = (bycat[e.category] || 0) + e.amount; });
  const catArr = Object.entries(bycat).map(([name, value]) => ({ name, value }));

  const del = async (id) => {
    if (!window.confirm("Delete this expense?")) return;
    try {
      await expensesAPI.delete(id);
      setData(d => ({ ...d, expenses: d.expenses.filter(e => e.id !== id) }));
      notify("Expense deleted");
    } catch(e) { notify(e.message, "error"); }
  };

  if (showForm) return (
    <div className="fade-in">
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button className="btn btn-ghost" onClick={() => setShowForm(false)}>← Back</button>
        <h2 style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:700, fontSize:20, margin:0 }}>💸 Add Expense</h2>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div className="card">
          <div className="card-hd"><span className="card-title">💸 Expense Details</span></div>
          <div className="card-body" style={{ padding:24 }}>
            <div className="frow">
              <div className="fg"><label className="flabel">Date</label><input className="inp" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div className="fg"><label className="flabel">Branch</label><select className="sel" value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}><option>Main Branch</option><option>West Branch</option><option>Juja Branch</option></select></div>
            </div>
            <div className="fg"><label className="flabel">Category</label><select className="sel" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>{["Rent","Utilities","Salaries","Marketing","Maintenance","Transport","Other"].map(c => <option key={c}>{c}</option>)}</select></div>
            <div className="fg"><label className="flabel">Amount (KSh) *</label><input className="inp" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" /></div>
            <div className="fg"><label className="flabel">Description</label><input className="inp" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What was this expense for?" /></div>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><span className="card-title">📊 Expense Summary</span></div>
          <div className="card-body" style={{ padding:24 }}>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
              {[["Rent","🏠"],["Utilities","💡"],["Salaries","👥"],["Marketing","📣"],["Maintenance","🔧"],["Transport","🚗"],["Other","📦"]].map(([cat, icon]) => {
                const amt = data.expenses.filter(e=>e.category===cat).reduce((s,e)=>s+e.amount,0);
                return amt > 0 ? (
                  <div key={cat} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background:C.surfaceAlt, borderRadius:10 }}>
                    <span style={{ fontSize:13 }}>{icon} {cat}</span>
                    <span className="mono" style={{ color:C.danger, fontWeight:700, fontSize:13 }}>{fmtKsh(amt)}</span>
                  </div>
                ) : null;
              })}
              {data.expenses.length === 0 && <div style={{ color:C.textMuted, fontSize:13, textAlign:"center", padding:20 }}>No expenses recorded yet</div>}
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:"auto" }}>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <><Spinner/>Saving...</> : "Save Expense"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div className="mono" style={{ fontSize: 11, color: C.textMuted }}>TOTAL EXPENSES</div>
          <div style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 800, fontSize: 32, color: C.danger }}>{fmtKsh(total)}</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm({ date: today(), category: "Rent", amount: "", branch: "Main Branch", description: "" }); setShowForm(true); }}>+ Add Expense</button>
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-hd"><span className="card-title">🍩 Expenses by Category</span></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={catArr} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {catArr.map((_, i) => <Cell key={i} fill={C.chart[i % C.chart.length]} />)}
                </Pie>
                <Tooltip formatter={v => fmtKsh(v)} contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                <Legend formatter={v => <span style={{ fontSize: 11, color: C.textDim }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><span className="card-title">💸 Expense Breakdown</span></div>
          {catArr.map((c, i) => (
            <div key={i} style={{ padding: "10px 16px", borderBottom: `1px solid rgba(26,45,74,.4)`, display: "flex", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: C.chart[i % C.chart.length] }} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
              </span>
              <span className="mono" style={{ color: C.danger, fontSize: 12, fontWeight: 600 }}>{fmtKsh(c.value)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-hd"><span className="card-title">Expense Records</span></div>
        <table>
          <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Branch</th><th>Amount</th><th>Added By</th><th></th></tr></thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id}>
                <td className="mono" style={{ fontSize: 11, color: C.textMuted }}>{e.date}</td>
                <td><Badge label={e.category} type="b-gray" /></td>
                <td style={{ fontSize: 12, color: C.textDim }}>{e.description}</td>
                <td><Badge label={e.branch} type="b-gray" /></td>
                <td className="mono" style={{ color: C.danger, fontWeight: 600 }}>{fmtKsh(e.amount)}</td>
                <td style={{ fontSize: 12, color: C.textMuted }}>{e.addedBy}</td>
                <td><button className="btn btn-danger btn-sm" onClick={() => del(e.id)}>🗑️</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

// ─── REPORTS ──────────────────────────────────────────────────────────────────
function Reports({ data, branch }) {
  const [period, setPeriod] = useState("daily");
  const [reportBranch, setReportBranch] = useState(branch === "all" ? "All Branches" : branch === "main" ? "Main Branch" : "West Branch");
  const [exporting, setExporting] = useState(false);

  const handleExcelExport = async () => {
    setExporting(true);
    try {
      await reportsAPI.exportExcel(reportBranch);
    } catch(e) {
      // fallback: client-side export using current data
      exportClientXlsx(data, reportBranch);
    }
    setExporting(false);
  };

  // Client-side CSV fallback (if backend unavailable)
  const exportClientXlsx = (data, branchLabel) => {
    const rows = [
      ["VES CONNECTIONS LIMITED — Sales Report"],
      ["Branch:", branchLabel, "Generated:", new Date().toLocaleString()],
      [],
      ["Receipt No","Date","Customer","Branch","Items","Discount","Total","Payment","Staff"],
      ...data.sales.filter(s => branchLabel === "All Branches" || s.branch === branchLabel).map(s => [
        s.receiptNo, s.date, s.customerName, s.branch,
        s.items.map(i => `${i.name}x${i.qty}`).join("; "),
        s.discount, s.total, s.payMethod, s.staff
      ]),
      [],
      ["EXPENSES"],
      ["Date","Category","Description","Branch","Amount","Added By"],
      ...data.expenses.filter(e => branchLabel === "All Branches" || e.branch === branchLabel).map(e => [
        e.date, e.category, e.description, e.branch, e.amount, e.addedBy
      ]),
      [],
      ["INVENTORY"],
      ["Product","SKU","Category","Buy Price","Sell Price","Main Stock","Juja Stock","Min Stock"],
      ...data.products.map(p => [
        p.name, p.sku, p.category, p.buyPrice, p.sellPrice, p.mainBranch, p.westBranch, p.minStock
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${(c||"").toString().replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `VES-Report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const branchFilter = s => reportBranch === "All Branches" ? true : s.branch === reportBranch;
  const expBranchFilter = e => reportBranch === "All Branches" ? true : e.branch === reportBranch;

  const sales = data.sales.filter(branchFilter);
  const expenses = data.expenses.filter(expBranchFilter);
  const products = data.products;

  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
  const totalExpenses = expenses.reduce((s, x) => s + x.amount, 0);
  const grossProfit = sales.reduce((s, sale) => {
    return s + sale.items.reduce((a, item) => {
      const p = products.find(pr => pr.id === item.productId);
      return a + (p ? (item.price - p.buyPrice) * item.qty : 0);
    }, 0) - sale.discount;
  }, 0);
  const netProfit = grossProfit - totalExpenses;

  // Top selling products
  const prodSales = {};
  sales.forEach(s => s.items.forEach(i => { prodSales[i.name] = (prodSales[i.name] || 0) + i.qty * i.price; }));
  const topProds = Object.entries(prodSales).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);

  // Monthly area chart data (mock)
  const monthlyData = [
    { month: "Sep", revenue: 12400, expenses: 9800, profit: 2600 },
    { month: "Oct", revenue: 15200, expenses: 10200, profit: 5000 },
    { month: "Nov", revenue: 18600, expenses: 11000, profit: 7600 },
    { month: "Dec", revenue: 26800, expenses: 12400, profit: 14400 },
    { month: "Jan", revenue: 19400, expenses: 11800, profit: 7600 },
    { month: "Feb", revenue: totalRevenue, expenses: totalExpenses, profit: netProfit },
  ];

  const printReport = () => {
    const w = window.open("", "_blank");
    w.document.write(`<html><head><title>VES CONNECTIONS - ${period.toUpperCase()} REPORT</title>
    <style>
      body{font-family:sans-serif;padding:32px;color:#000;}
      h1{font-size:22px;margin-bottom:4px;}
      h2{font-size:16px;margin-top:24px;margin-bottom:8px;border-bottom:2px solid #000;padding-bottom:4px;}
      .meta{color:#666;font-size:12px;margin-bottom:24px;}
      table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px;}
      th{background:#f0f0f0;padding:8px;text-align:left;border:1px solid #ccc;font-size:11px;}
      td{padding:8px;border:1px solid #eee;}
      .kpi{display:inline-block;background:#f8f8f8;border:1px solid #ddd;border-radius:8px;padding:14px 20px;margin:4px;min-width:160px;}
      .kpi-v{font-size:22px;font-weight:800;}
      .kpi-l{font-size:11px;color:#666;margin-top:2px;}
      .green{color:#16a34a;} .red{color:#dc2626;} .blue{color:#2563eb;}
      @media print{body{padding:16px;}}
    </style></head><body>
    <h1>VES CONNECTIONS LIMITED</h1>
    <div class="meta">Electronics & Accessories · Nairobi, Kenya<br>
    Report Type: <b>${period.toUpperCase()}</b> · Branch: <b>${reportBranch}</b> · Generated: <b>${new Date().toLocaleString()}</b></div>
    
    <h2>Financial Summary</h2>
    <div>
      <div class="kpi"><div class="kpi-v blue">KSh ${totalRevenue.toLocaleString()}</div><div class="kpi-l">Total Revenue</div></div>
      <div class="kpi"><div class="kpi-v red">KSh ${totalExpenses.toLocaleString()}</div><div class="kpi-l">Total Expenses</div></div>
      <div class="kpi"><div class="kpi-v green">KSh ${grossProfit.toLocaleString()}</div><div class="kpi-l">Gross Profit</div></div>
      <div class="kpi"><div class="kpi-v ${netProfit >= 0 ? "green" : "red"}">KSh ${netProfit.toLocaleString()}</div><div class="kpi-l">Net Profit</div></div>
    </div>

    <h2>Sales Transactions (${sales.length})</h2>
    <table><thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Branch</th><th>Items</th><th>Discount</th><th>Total</th><th>Method</th><th>Staff</th></tr></thead>
    <tbody>${sales.map(s => `<tr><td>${s.receiptNo}</td><td>${s.date}</td><td>${s.customerName}</td><td>${s.branch}</td><td>${s.items.map(i => `${i.name}×${i.qty}`).join(", ")}</td><td>${s.discount > 0 ? "KSh " + s.discount.toLocaleString() : "-"}</td><td>KSh ${s.total.toLocaleString()}</td><td>${s.payMethod}</td><td>${s.staff}</td></tr>`).join("")}</tbody></table>

    <h2>Expenses (${expenses.length})</h2>
    <table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Branch</th><th>Amount</th><th>By</th></tr></thead>
    <tbody>${expenses.map(e => `<tr><td>${e.date}</td><td>${e.category}</td><td>${e.description}</td><td>${e.branch}</td><td>KSh ${e.amount.toLocaleString()}</td><td>${e.addedBy}</td></tr>`).join("")}</tbody></table>

    <h2>Inventory Report (${products.length} products)</h2>
    <table><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Buy Price</th><th>Sell Price</th><th>Main Stock</th><th>West Stock</th><th>Total Value</th></tr></thead>
    <tbody>${products.map(p => `<tr><td>${p.name}</td><td>${p.sku}</td><td>${p.category}</td><td>KSh ${p.buyPrice.toLocaleString()}</td><td>KSh ${p.sellPrice.toLocaleString()}</td><td>${p.mainBranch}</td><td>${p.westBranch}</td><td>KSh ${((p.mainBranch + p.westBranch) * p.sellPrice).toLocaleString()}</td></tr>`).join("")}</tbody></table>

    <div style="margin-top:32px;font-size:11px;color:#999;text-align:center">— End of Report · VES CONNECTIONS LIMITED ERP System —</div>
    <script>window.print();</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="fade-in">
      <div style={{ display: "flex", gap: 12, marginBottom: 22, alignItems: "center", flexWrap: "wrap" }}>
        <div className="tabs" style={{ marginBottom: 0, flex: 1, maxWidth: 400 }}>
          {["daily","weekly","monthly","annual"].map(p => <button key={p} className={`tab ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>)}
        </div>
        <select className="sel" style={{ width: 160 }} value={reportBranch} onChange={e => setReportBranch(e.target.value)}>
          <option>All Branches</option><option>Main Branch</option><option>West Branch</option>
        </select>
        <button className="btn btn-primary" onClick={printReport}>🖨️ Print Report</button>
        <button className="btn btn-success" onClick={handleExcelExport} disabled={exporting}>
          {exporting ? <><Spinner />Exporting...</> : "📊 Export Excel"}
        </button>
      </div>

      <div className="stats-grid">
        {[
          { label: "Total Revenue", value: fmtKsh(totalRevenue), icon: "💰", color: "gold" },
          { label: "Total Expenses", value: fmtKsh(totalExpenses), icon: "💸", color: "red" },
          { label: "Gross Profit", value: fmtKsh(grossProfit), icon: "📈", color: "green" },
          { label: "Net Profit", value: fmtKsh(netProfit), icon: "💎", color: netProfit >= 0 ? "green" : "red" },
        ].map((s, i) => (
          <div key={i} className={`stat-card ${s.color}`}>
            <div className="stat-icon-box" style={{ background: s.color === "gold" ? C.warningDim : s.color === "green" ? C.successDim : C.dangerDim, marginBottom: 10 }}>{s.icon}</div>
            <div className="stat-value" style={{ color: s.color === "gold" ? C.accent : s.color === "green" ? C.success : C.danger, fontSize: 20 }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-hd"><span className="card-title">📉 Revenue vs Expenses vs Profit (6 Months)</span></div>
        <div className="card-body">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyData}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.accent} stopOpacity={0.3} /><stop offset="95%" stopColor={C.accent} stopOpacity={0} /></linearGradient>
                <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.danger} stopOpacity={0.3} /><stop offset="95%" stopColor={C.danger} stopOpacity={0} /></linearGradient>
                <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.success} stopOpacity={0.3} /><stop offset="95%" stopColor={C.success} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="month" tick={{ fill: C.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmtKsh(v)} contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
              <Legend formatter={v => <span style={{ fontSize: 11, color: C.textDim }}>{v}</span>} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke={C.accent} fill="url(#revGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke={C.danger} fill="url(#expGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="profit" name="Net Profit" stroke={C.success} fill="url(#profGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-hd"><span className="card-title">🍩 Top Products by Revenue</span></div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={topProds} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  {topProds.map((_, i) => <Cell key={i} fill={C.chart[i % C.chart.length]} />)}
                </Pie>
                <Tooltip formatter={v => fmtKsh(v)} contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                <Legend formatter={v => <span style={{ fontSize: 10, color: C.textDim }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><span className="card-title">📊 Top Products Table</span></div>
          <table>
            <thead><tr><th>#</th><th>Product</th><th>Revenue</th><th>Share</th></tr></thead>
            <tbody>
              {topProds.map((p, i) => (
                <tr key={i}>
                  <td className="mono" style={{ color: C.textMuted, fontSize: 11 }}>{i + 1}</td>
                  <td style={{ fontSize: 12.5, fontWeight: 500 }}>{p.name}</td>
                  <td className="mono" style={{ color: C.success, fontSize: 12 }}>{fmtKsh(p.value)}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 60, height: 5, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(p.value / (topProds[0]?.value || 1)) * 100}%`, background: C.chart[i % C.chart.length] }} />
                      </div>
                      <span className="mono" style={{ fontSize: 10, color: C.textMuted }}>{((p.value / totalRevenue) * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── WIPE PANEL ───────────────────────────────────────────────────────────────
function WipePanel({ notify, currentUser }) {
  const [preview, setPreview]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [wiping, setWiping]         = useState(false);
  const [scope, setScope]           = useState("transactions"); // "transactions" | "full"
  const [confirmCode, setConfirmCode] = useState("");
  const [reason, setReason]         = useState("");
  const [step, setStep]             = useState(1); // 1=info, 2=preview, 3=confirm, 4=done
  const [result, setResult]         = useState(null);

  const loadPreview = async () => {
    setLoading(true);
    try {
      const res = await wipeAPI.preview();
      setPreview(res);
      setStep(2);
    } catch(e) { notify(e.message, "error"); }
    setLoading(false);
  };

  const doWipe = async () => {
    if (confirmCode !== "WIPE-CONFIRM") return notify("Type WIPE-CONFIRM exactly to proceed", "error");
    if (!reason.trim())                 return notify("Reason is required", "error");
    setWiping(true);
    try {
      const res = scope === "full"
        ? await wipeAPI.full(confirmCode, reason)
        : await wipeAPI.transactions(confirmCode, reason);
      setResult(res);
      setStep(4);
      notify(res.message);
    } catch(e) { notify(e.message, "error"); }
    setWiping(false);
  };

  const reset = () => { setStep(1); setPreview(null); setConfirmCode(""); setReason(""); setResult(null); };

  const txCount  = preview ? Object.values(preview.transaction_tables||{}).reduce((s,n)=>s+n,0) : 0;
  const extCount = preview ? Object.values(preview.full_extra_tables||{}).reduce((s,n)=>s+n,0)  : 0;

  return (
    <div className="card" style={{ border:`2px solid ${C.danger}44` }}>
      <div className="card-hd" style={{ background:`linear-gradient(90deg,${C.danger}18,transparent)` }}>
        <span className="card-title" style={{ color:C.danger }}>🗑️ Wipe Transactions</span>
        <Badge label="DANGER ZONE" type="b-danger" />
      </div>
      <div className="card-body">

        {/* STEP 1 — scope selector */}
        {step === 1 && (
          <>
            <div style={{ padding:"12px 14px", background:C.danger+"18", border:`1px solid ${C.danger}44`, borderRadius:10, marginBottom:20, lineHeight:1.6 }}>
              <div style={{ fontWeight:800, color:C.danger, fontSize:13, marginBottom:4 }}>⚠️ This action cannot be undone</div>
              <div style={{ fontSize:12, color:C.textMuted }}>This permanently deletes records from the database. <strong style={{color:C.text}}>Always download a backup first</strong> before wiping.</div>
            </div>

            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:1, marginBottom:10 }}>Select Wipe Scope</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {[
                  { key:"transactions", icon:"🧾", title:"Transaction Wipe", desc:"Clears sales, expenses, POs, debts, returns, transfers, cash register, Onfon movements. Keeps products, customers, suppliers & users.", color:C.warning },
                  { key:"full",         icon:"💥", title:"Full Data Wipe", desc:"Everything above PLUS products, customers and suppliers. Only users and system settings are preserved.", color:C.danger },
                ].map(opt=>(
                  <div key={opt.key} onClick={()=>setScope(opt.key)} style={{ padding:16, borderRadius:12, border:`2px solid ${scope===opt.key?opt.color:C.border}`, background:scope===opt.key?opt.color+"18":C.surfaceAlt, cursor:"pointer", transition:"all .15s" }}>
                    <div style={{ fontSize:24, marginBottom:8 }}>{opt.icon}</div>
                    <div style={{ fontWeight:800, fontSize:13, color:scope===opt.key?opt.color:C.text, marginBottom:6 }}>{opt.title}</div>
                    <div style={{ fontSize:11, color:C.textMuted, lineHeight:1.5 }}>{opt.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <button className="btn btn-danger" onClick={loadPreview} disabled={loading} style={{ fontSize:13 }}>
              {loading ? <><Spinner />Loading preview...</> : "👁️ Preview What Will Be Deleted"}
            </button>
          </>
        )}

        {/* STEP 2 — preview counts */}
        {step === 2 && preview && (
          <>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:800, marginBottom:4 }}>
                {scope==="full"?"💥 Full Wipe Preview":"🧾 Transaction Wipe Preview"}
              </div>
              <div style={{ fontSize:12, color:C.textMuted }}>The following rows will be permanently deleted:</div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
              {Object.entries(preview.transaction_tables||{}).map(([table, n])=>(
                <div key={table} style={{ display:"flex", justifyContent:"space-between", padding:"8px 12px", background:C.surfaceAlt, borderRadius:8, border:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:12, color:C.textMuted, fontFamily:"monospace" }}>{table}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:n>0?C.danger:C.textMuted }}>{n.toLocaleString()} rows</span>
                </div>
              ))}
              {scope==="full" && Object.entries(preview.full_extra_tables||{}).map(([table, n])=>(
                <div key={table} style={{ display:"flex", justifyContent:"space-between", padding:"8px 12px", background:C.danger+"18", borderRadius:8, border:`1px solid ${C.danger}44` }}>
                  <span style={{ fontSize:12, color:C.danger, fontFamily:"monospace" }}>{table}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:C.danger }}>{n.toLocaleString()} rows</span>
                </div>
              ))}
            </div>

            <div style={{ padding:"12px 16px", background:C.surfaceAlt, borderRadius:10, border:`1px solid ${C.border}`, marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontWeight:700 }}>Total rows to delete:</span>
              <span style={{ fontSize:20, fontWeight:800, color:C.danger, fontFamily:"monospace" }}>
                {(scope==="full"?txCount+extCount:txCount).toLocaleString()}
              </span>
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button className="btn btn-ghost" onClick={reset}>← Back</button>
              <button className="btn btn-danger" onClick={()=>setStep(3)} style={{ flex:1, justifyContent:"center" }}>
                Continue to Confirm →
              </button>
            </div>
          </>
        )}

        {/* STEP 3 — confirmation */}
        {step === 3 && (
          <>
            <div style={{ padding:"14px 16px", background:C.danger+"22", border:`2px solid ${C.danger}`, borderRadius:10, marginBottom:20 }}>
              <div style={{ fontWeight:800, color:C.danger, fontSize:14, marginBottom:6 }}>🔴 Final Confirmation Required</div>
              <div style={{ fontSize:12, color:C.textMuted, lineHeight:1.6 }}>
                You are about to perform a <strong style={{color:C.danger}}>{scope==="full"?"FULL DATA":"TRANSACTION"} WIPE</strong> that will delete <strong style={{color:C.text}}>{(scope==="full"?txCount+extCount:txCount).toLocaleString()} rows</strong> from the database. This cannot be undone.
              </div>
            </div>

            <div className="fg">
              <label className="flabel">Reason for wipe (required — logged to audit)</label>
              <input className="inp" value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. End of financial year, demo data cleanup..." />
            </div>

            <div className="fg">
              <label className="flabel">Type <span style={{ color:C.danger, fontFamily:"monospace", fontSize:13 }}>WIPE-CONFIRM</span> to proceed</label>
              <input className="inp" value={confirmCode} onChange={e=>setConfirmCode(e.target.value)} placeholder="WIPE-CONFIRM" style={{ fontFamily:"monospace", letterSpacing:2, color:confirmCode==="WIPE-CONFIRM"?C.danger:C.text }} />
              {confirmCode && confirmCode!=="WIPE-CONFIRM" && <div style={{ fontSize:11, color:C.danger, marginTop:4 }}>⚠️ Must match exactly</div>}
            </div>

            <div style={{ display:"flex", gap:10, marginTop:8 }}>
              <button className="btn btn-ghost" onClick={()=>setStep(2)}>← Back</button>
              <button
                className="btn btn-danger"
                style={{ flex:1, justifyContent:"center", opacity: confirmCode==="WIPE-CONFIRM"&&reason.trim()?1:.4 }}
                onClick={doWipe}
                disabled={wiping || confirmCode!=="WIPE-CONFIRM" || !reason.trim()}
              >
                {wiping ? <><Spinner />Wiping database...</> : `🗑️ CONFIRM ${scope==="full"?"FULL":"TRANSACTION"} WIPE`}
              </button>
            </div>
          </>
        )}

        {/* STEP 4 — done */}
        {step === 4 && result && (
          <div style={{ textAlign:"center", padding:"20px 0" }}>
            <div style={{ fontSize:52, marginBottom:16 }}>✅</div>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:8, color:C.success }}>{result.message}</div>
            <div style={{ fontSize:12, color:C.textMuted, marginBottom:20 }}>
              The action has been logged to the Audit Log under your account.
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:8, marginBottom:24, textAlign:"left" }}>
              {Object.entries(result.deleted||{}).filter(([,n])=>n>0).map(([table,n])=>(
                <div key={table} style={{ padding:"8px 12px", background:C.surfaceAlt, borderRadius:8, border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:10, color:C.textMuted, fontFamily:"monospace" }}>{table}</div>
                  <div style={{ fontSize:14, fontWeight:700, color:C.success }}>{n.toLocaleString()} deleted</div>
                </div>
              ))}
            </div>
            <button className="btn btn-outline" onClick={reset}>🔄 Run Another Wipe</button>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── PASSWORD BACKUP TAB ──────────────────────────────────────────────────────
function PasswordBackupTab({ currentUser, notify, users }) {
  const [pwTab, setPwTab]             = useState("security");  // security | tokens | history | reset | hint
  const [secData, setSecData]         = useState([]);
  const [tokens, setTokens]           = useState([]);
  const [histUser, setHistUser]       = useState(null);
  const [history, setHistory]         = useState([]);
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);

  // Admin reset form
  const [resetTarget, setResetTarget] = useState("");
  const [resetPw, setResetPw]         = useState("");
  const [resetPwConf, setResetPwConf] = useState("");
  const [mustChange, setMustChange]   = useState(true);
  const [resetReason, setResetReason] = useState("");
  const [showResetPw, setShowResetPw] = useState(false);

  // Token generator form
  const [tokenUserId, setTokenUserId] = useState("");
  const [tokenExpiry, setTokenExpiry] = useState(2);
  const [tokenNotes, setTokenNotes]   = useState("");
  const [generatedToken, setGeneratedToken] = useState(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Recovery hint
  const [myHint, setMyHint]           = useState("");

  const loadSecurity = async () => {
    setLoading(true);
    try {
      const res = await authAPI.usersSecurity();
      setSecData(res.data || []);
    } catch(e) { notify(e.message,"error"); }
    setLoading(false);
  };

  const loadTokens = async () => {
    setLoading(true);
    try {
      const res = await authAPI.listResetTokens();
      setTokens(res.data || []);
    } catch(e) { notify(e.message,"error"); }
    setLoading(false);
  };

  const loadHistory = async (uid) => {
    setLoading(true);
    try {
      const res = await authAPI.passwordHistory(uid);
      setHistory(res.data || []);
    } catch(e) { notify(e.message,"error"); }
    setLoading(false);
  };

  React.useEffect(() => {
    if (pwTab==="security") loadSecurity();
    if (pwTab==="tokens")   loadTokens();
  }, [pwTab]);

  const doAdminReset = async () => {
    if (!resetTarget) return notify("Select a user","error");
    if (!resetPw)     return notify("Enter new password","error");
    if (resetPw !== resetPwConf) return notify("Passwords don't match","error");
    if (resetPw.length < 6)      return notify("Min 6 characters","error");
    setSaving(true);
    try {
      const res = await authAPI.adminReset(resetTarget, resetPw, mustChange, resetReason);
      notify(res.message);
      setResetPw(""); setResetPwConf(""); setResetTarget(""); setResetReason("");
      loadSecurity();
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const doGenerateToken = async () => {
    if (!tokenUserId) return notify("Select a user","error");
    setSaving(true);
    try {
      const res = await authAPI.generateAdminToken(tokenUserId, tokenExpiry, tokenNotes);
      setGeneratedToken(res);
      notify(`Token generated for ${res.user_name} ✅`);
      loadTokens();
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const revokeToken = async (id) => {
    if (!window.confirm("Revoke this token? The user won't be able to use it.")) return;
    try {
      await authAPI.revokeToken(id);
      notify("Token revoked"); loadTokens();
    } catch(e) { notify(e.message,"error"); }
  };

  const unlockUser = async (uid, name) => {
    try {
      await authAPI.unlockUser(uid);
      notify(`${name} unlocked ✅`); loadSecurity();
    } catch(e) { notify(e.message,"error"); }
  };

  const saveHint = async () => {
    if (!myHint.trim()) return;
    setSaving(true);
    try {
      await authAPI.setRecoveryHint(myHint.trim());
      notify("Recovery hint saved ✅");
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const copyToken = (t) => {
    navigator.clipboard?.writeText(t);
    setTokenCopied(true);
    setTimeout(()=>setTokenCopied(false), 2000);
  };

  const SUB_TABS = [
    ["security", "🛡️", "Security Overview"],
    ["reset",    "🔓", "Reset Password"],
    ["tokens",   "🎟️", "Reset Tokens"],
    ["history",  "📜", "Password History"],
    ["hint",     "💡", "Recovery Hint"],
  ];

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{ display:"flex",gap:4,background:C.surfaceAlt,padding:4,borderRadius:10,marginBottom:20,overflowX:"auto" }}>
        {SUB_TABS.map(([k,icon,label])=>(
          <button key={k} onClick={()=>setPwTab(k)} style={{ padding:"7px 14px",borderRadius:7,border:"none",cursor:"pointer",background:pwTab===k?C.surface:"transparent",color:pwTab===k?C.text:C.textMuted,fontWeight:600,fontSize:12,fontFamily:"inherit",boxShadow:pwTab===k?"0 1px 4px rgba(0,0,0,.25)":"none",transition:"all .15s",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5 }}>
            <span>{icon}</span><span>{label}</span>
          </button>
        ))}
      </div>

      {/* ── SECURITY OVERVIEW ── */}
      {pwTab==="security" && (
        <div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:20 }}>
            {[
              { icon:"👥", label:"Total Users",         value: secData.length,                                              color:C.info },
              { icon:"🔒", label:"Locked Accounts",     value: secData.filter(u=>u.locked_until&&new Date(u.locked_until)>new Date()).length, color:C.danger },
              { icon:"⚠️", label:"Must Change Password", value: secData.filter(u=>u.must_change_pw).length,                  color:C.warning },
              { icon:"💡", label:"Have Recovery Hint",  value: secData.filter(u=>u.has_hint).length,                         color:C.success },
              { icon:"🔑", label:"Active Tokens",        value: secData.reduce((s,u)=>s+(+u.active_tokens||0),0),             color:C.accent },
            ].map(s=>(
              <div key={s.label} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",borderTop:`3px solid ${s.color}` }}>
                <div style={{ fontSize:20 }}>{s.icon}</div>
                <div style={{ fontSize:22,fontWeight:800,color:s.color,fontFamily:"monospace",marginTop:6 }}>{s.value}</div>
                <div style={{ fontSize:11,color:C.textMuted,marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-hd">
              <span className="card-title">🛡️ User Security Status</span>
              <button className="btn btn-ghost btn-sm" onClick={loadSecurity}>🔄 Refresh</button>
            </div>
            {loading ? <Loading /> : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>User</th><th>Role</th><th>Last Login</th><th>Failed Attempts</th>
                      <th>PW Changed</th><th>Must Change PW</th><th>Active Tokens</th><th>Hint</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secData.map(u=>{
                      const isLocked = u.locked_until && new Date(u.locked_until) > new Date();
                      return (
                        <tr key={u.id}>
                          <td style={{ fontWeight:700 }}>{u.name}<div style={{ fontSize:10,color:C.textMuted,fontFamily:"monospace" }}>{u.username}</div></td>
                          <td><Badge label={u.role} type={{Admin:"b-danger",Manager:"b-warning",Cashier:"b-info"}[u.role]||"b-ghost"} /></td>
                          <td style={{ fontSize:11,color:C.textMuted }}>{u.last_login?new Date(u.last_login).toLocaleString():"Never"}</td>
                          <td>
                            <span style={{ fontSize:13,fontWeight:700,color:u.failed_attempts>0?C.warning:C.success }}>{u.failed_attempts||0}</span>
                            {isLocked && <Badge label="LOCKED" type="b-danger" />}
                          </td>
                          <td style={{ fontSize:11,color:C.textMuted }}>{u.pw_last_changed?new Date(u.pw_last_changed).toLocaleDateString():"—"}</td>
                          <td><Badge label={u.must_change_pw?"Yes":"No"} type={u.must_change_pw?"b-warning":"b-success"} /></td>
                          <td style={{ textAlign:"center" }}><span style={{ fontWeight:700,color:u.active_tokens>0?C.accent:C.textMuted }}>{u.active_tokens||0}</span></td>
                          <td><Badge label={u.has_hint?"✓ Set":"—"} type={u.has_hint?"b-success":"b-gray"} /></td>
                          <td>
                            <div style={{ display:"flex",gap:4 }}>
                              {isLocked && <button className="btn btn-success btn-sm" onClick={()=>unlockUser(u.id,u.name)}>🔓 Unlock</button>}
                              <button className="btn btn-ghost btn-sm" onClick={()=>{ setHistUser(u); loadHistory(u.id); setPwTab("history"); }}>📜 History</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {secData.length===0 && <div className="empty-state" style={{padding:20}}><p>No users found.</p></div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ADMIN RESET PASSWORD ── */}
      {pwTab==="reset" && (
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
          <div className="card">
            <div className="card-hd"><span className="card-title">🔓 Admin Force-Reset Password</span></div>
            <div className="card-body">
              <div style={{ padding:"10px 12px",background:C.warning+"18",borderRadius:8,border:`1px solid ${C.warning}44`,fontSize:12,color:C.warning,marginBottom:16,lineHeight:1.5 }}>
                ⚠️ This immediately sets the user's password. The old password is archived in history. Use responsibly.
              </div>
              <div className="fg">
                <label className="flabel">Select User</label>
                <select className="sel" value={resetTarget} onChange={e=>setResetTarget(e.target.value)}>
                  <option value="">Choose user...</option>
                  {users.filter(u=>u.id!==currentUser.id).map(u=>(
                    <option key={u.id} value={u.id}>{u.name} ({u.username}) — {u.role}</option>
                  ))}
                </select>
              </div>
              <div className="fg">
                <label className="flabel">New Password</label>
                <div style={{ position:"relative" }}>
                  <input className="inp" type={showResetPw?"text":"password"} value={resetPw} onChange={e=>setResetPw(e.target.value)} placeholder="Min 6 characters" style={{ paddingRight:42 }} />
                  <button onClick={()=>setShowResetPw(v=>!v)} style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:15,color:C.textMuted }}>{showResetPw?"🙈":"👁️"}</button>
                </div>
              </div>
              <div className="fg">
                <label className="flabel">Confirm Password</label>
                <input className="inp" type="password" value={resetPwConf} onChange={e=>setResetPwConf(e.target.value)} placeholder="Confirm new password" />
                {resetPwConf && resetPw!==resetPwConf && <div style={{ fontSize:11,color:C.danger,marginTop:4 }}>⚠️ Passwords don't match</div>}
              </div>
              <div className="fg">
                <label className="flabel">Reason (optional)</label>
                <input className="inp" value={resetReason} onChange={e=>setResetReason(e.target.value)} placeholder="e.g. User forgot password, account compromised..." />
              </div>
              <div style={{ padding:"10px 0" }}>
                <div onClick={()=>setMustChange(v=>!v)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer" }}>
                  <div>
                    <div style={{ fontSize:13,fontWeight:600 }}>Require password change on next login</div>
                    <div style={{ fontSize:11,color:C.textMuted,marginTop:2 }}>Recommended — forces user to pick their own new password</div>
                  </div>
                  <div style={{ width:44,height:24,borderRadius:12,background:mustChange?C.success:C.border,cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0 }}>
                    <div style={{ position:"absolute",top:3,left:mustChange?23:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.3)" }} />
                  </div>
                </div>
              </div>
              <button className="btn btn-danger" style={{ width:"100%",justifyContent:"center",marginTop:8 }} onClick={doAdminReset} disabled={saving||!resetTarget||!resetPw||resetPw!==resetPwConf}>
                {saving?<><Spinner />Resetting...</>:"🔓 Force Reset Password"}
              </button>
            </div>
          </div>

          {/* Generate token panel */}
          <div className="card">
            <div className="card-hd"><span className="card-title">🎟️ Generate Reset Token</span></div>
            <div className="card-body">
              <div style={{ fontSize:12,color:C.textMuted,marginBottom:16,lineHeight:1.6 }}>
                Generate a one-time token that the user can use themselves to set a new password — without you knowing their new password.
              </div>
              <div className="fg">
                <label className="flabel">Select User</label>
                <select className="sel" value={tokenUserId} onChange={e=>setTokenUserId(e.target.value)}>
                  <option value="">Choose user...</option>
                  {users.map(u=><option key={u.id} value={u.id}>{u.name} ({u.username})</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="flabel">Token Expiry</label>
                <select className="sel" value={tokenExpiry} onChange={e=>setTokenExpiry(+e.target.value)}>
                  <option value={1}>1 hour</option><option value={2}>2 hours</option>
                  <option value={6}>6 hours</option><option value={24}>24 hours</option>
                  <option value={48}>48 hours</option>
                </select>
              </div>
              <div className="fg">
                <label className="flabel">Notes (optional)</label>
                <input className="inp" value={tokenNotes} onChange={e=>setTokenNotes(e.target.value)} placeholder="e.g. User requested via phone" />
              </div>
              <button className="btn btn-primary" style={{ width:"100%",justifyContent:"center" }} onClick={doGenerateToken} disabled={saving||!tokenUserId}>
                {saving?<><Spinner />Generating...</>:"🎟️ Generate Token"}
              </button>

              {generatedToken && (
                <div style={{ marginTop:18,padding:16,background:C.warning+"18",border:`1px solid ${C.warning}44`,borderRadius:10 }}>
                  <div style={{ fontSize:11,fontWeight:800,color:C.warning,textTransform:"uppercase",letterSpacing:1,marginBottom:8 }}>
                    ✅ Token for {generatedToken.user_name}
                  </div>
                  <div style={{ fontFamily:"monospace",fontSize:11,wordBreak:"break-all",background:C.surfaceAlt,padding:"10px 12px",borderRadius:7,color:C.text,marginBottom:10 }}>
                    {generatedToken.token}
                  </div>
                  <div style={{ display:"flex",gap:8 }}>
                    <button className="btn btn-primary btn-sm" onClick={()=>copyToken(generatedToken.token)}>
                      {tokenCopied?"✅ Copied!":"📋 Copy Token"}
                    </button>
                  </div>
                  <div style={{ fontSize:11,color:C.textMuted,marginTop:8 }}>
                    Expires: {new Date(generatedToken.expires_at).toLocaleString()}
                  </div>
                  <div style={{ fontSize:11,color:C.warning,marginTop:4,lineHeight:1.5 }}>
                    📌 Send this to the user via WhatsApp/SMS. They use it on the login screen → "Forgot Password".
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── RESET TOKENS LIST ── */}
      {pwTab==="tokens" && (
        <div className="card">
          <div className="card-hd">
            <span className="card-title">🎟️ Reset Tokens ({tokens.length})</span>
            <button className="btn btn-ghost btn-sm" onClick={loadTokens}>🔄 Refresh</button>
          </div>
          {loading ? <Loading /> : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr><th>User</th><th>Type</th><th>Created By</th><th>Created</th><th>Expires</th><th>Status</th><th>Notes</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {tokens.map(t=>{
                    const expired  = new Date(t.expires_at) < new Date();
                    const status   = t.used?"USED":expired?"EXPIRED":"ACTIVE";
                    const statusColor = t.used?C.textMuted:expired?C.danger:C.success;
                    return (
                      <tr key={t.id}>
                        <td style={{ fontWeight:600 }}>{t.user_name}<div style={{ fontSize:10,color:C.textMuted,fontFamily:"monospace" }}>{t.username}</div></td>
                        <td><Badge label={t.token_type} type={t.token_type==="ADMIN_RESET"?"b-warning":"b-info"} /></td>
                        <td style={{ fontSize:12,color:C.textMuted }}>{t.created_by_name||"System"}</td>
                        <td style={{ fontSize:11,color:C.textMuted }}>{new Date(t.created_at).toLocaleString()}</td>
                        <td style={{ fontSize:11,color:expired?C.danger:C.textMuted }}>{new Date(t.expires_at).toLocaleString()}</td>
                        <td><span style={{ fontSize:12,fontWeight:700,color:statusColor }}>{status}</span></td>
                        <td style={{ fontSize:11,color:C.textMuted,maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{t.notes||"—"}</td>
                        <td>
                          {!t.used && !expired && (
                            <button className="btn btn-danger btn-sm" onClick={()=>revokeToken(t.id)}>Revoke</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {tokens.length===0 && <div className="empty-state" style={{padding:24}}><div className="es-icon">🎟️</div><p>No reset tokens generated yet.</p></div>}
            </div>
          )}
        </div>
      )}

      {/* ── PASSWORD HISTORY ── */}
      {pwTab==="history" && (
        <div>
          <div className="card" style={{ marginBottom:16 }}>
            <div className="card-hd"><span className="card-title">📜 Password History</span></div>
            <div className="card-body">
              <div style={{ display:"flex",gap:10,alignItems:"center" }}>
                <select className="sel" style={{ flex:1 }} value={histUser?.id||""} onChange={e=>{
                  const u=users.find(x=>x.id===e.target.value);
                  setHistUser(u||null);
                  if (u) loadHistory(u.id);
                }}>
                  <option value="">Select a user to view history...</option>
                  {users.map(u=><option key={u.id} value={u.id}>{u.name} ({u.username})</option>)}
                </select>
              </div>
            </div>
          </div>

          {histUser && (
            <div className="card">
              <div className="card-hd">
                <span className="card-title">📜 {histUser.name} — Password Changes</span>
                <span style={{ fontSize:12,color:C.textMuted }}>{history.length} record(s)</span>
              </div>
              {loading ? <Loading /> : history.length===0 ? (
                <div className="empty-state" style={{padding:24}}><p>No password history yet.</p></div>
              ) : (
                <div>
                  {history.map((h,i)=>(
                    <div key={h.id} style={{ display:"flex",gap:12,alignItems:"flex-start",padding:"12px 20px",borderBottom:`1px solid ${C.border}` }}>
                      <div style={{ width:32,height:32,borderRadius:8,background:C.surfaceAlt,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0 }}>
                        {i===0?"🔒":"🔑"}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                          <span style={{ fontWeight:600,fontSize:13 }}>
                            {{"USER_CHANGE":"Changed by user","ADMIN_RESET":"Admin force-reset","EMERGENCY_RESET":"Emergency reset","INITIAL":"Initial password"}[h.change_reason]||h.change_reason}
                          </span>
                          <span style={{ fontSize:11,color:C.textMuted,fontFamily:"monospace" }}>{new Date(h.created_at).toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize:11,color:C.textMuted,marginTop:2 }}>
                          {h.changed_by_name?`Changed by: ${h.changed_by_name}`:"Self-changed"}
                        </div>
                        <div style={{ fontSize:10,color:C.textMuted,marginTop:2,fontFamily:"monospace" }}>
                          Hash: {h.password_hash.substring(0,20)}••• (bcrypt — not reversible)
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── RECOVERY HINT (for current admin user) ── */}
      {pwTab==="hint" && (
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
          <div className="card">
            <div className="card-hd"><span className="card-title">💡 My Recovery Hint</span></div>
            <div className="card-body">
              <div style={{ fontSize:12,color:C.textMuted,marginBottom:16,lineHeight:1.6 }}>
                Set a personal recovery hint to help identify you if you ever need an Admin to reset your password. This is visible only to Admins.
              </div>
              <div className="fg">
                <label className="flabel">Recovery Hint (e.g. "Ask James at Main Branch")</label>
                <textarea className="inp" style={{ minHeight:80,resize:"vertical" }} value={myHint} onChange={e=>setMyHint(e.target.value)} placeholder="E.g. My employee number is E001. Contact James on +254..." />
              </div>
              <button className="btn btn-primary" onClick={saveHint} disabled={saving||!myHint.trim()}>
                {saving?<><Spinner />Saving...</>:"💡 Save Recovery Hint"}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-hd"><span className="card-title">ℹ️ How the Password System Works</span></div>
            <div className="card-body">
              <div style={{ lineHeight:1.8 }}>
                {[
                  ["🔑","Forgot Password","User clicks 'Forgot password?' on the login screen and enters their username."],
                  ["🎟️","Admin Generates Token","Admin goes to Passwords → Reset Password → Generate Token, picks the user and expiry time."],
                  ["📲","Share Token","Admin sends the token to user via WhatsApp or SMS (token is a long secure code)."],
                  ["🔒","User Resets","User goes to login → 'I have a token' → pastes token → sets new password."],
                  ["📜","History Tracked","Every password change is archived. Passwords cannot be reused (last 5 checked)."],
                  ["🔓","Account Lockouts","5 failed logins locks account for 30 minutes. Admin can unlock manually."],
                ].map(([icon,title,desc])=>(
                  <div key={title} style={{ display:"flex",gap:12,padding:"10px 0",borderBottom:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:20,flexShrink:0 }}>{icon}</span>
                    <div>
                      <div style={{ fontWeight:700,fontSize:13 }}>{title}</div>
                      <div style={{ fontSize:12,color:C.textMuted,marginTop:2 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ADMIN PANEL (ENHANCED) ───────────────────────────────────────────────────
// Paste this entire block replacing your existing AdminPanel function in App.jsx


function AdminPanel({ data, setData, currentUser, notify }) {
  const [tab, setTab]           = useState("overview");
  const [users, setUsers]       = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  // ── Users ─────────────────────────────────────────────────────────────────
  const [userModal, setUserModal]   = useState(false);
  const [editUser, setEditUser]     = useState(null);
  const [userForm, setUserForm]     = useState({ name:"", username:"", password:"", role:"Cashier", branch:"Main Branch" });
  const [userSearch, setUserSearch] = useState("");

  // ── Password ──────────────────────────────────────────────────────────────
  const [pwModal, setPwModal]   = useState(false);
  const [pwTarget, setPwTarget] = useState(null);
  const [pwForm, setPwForm]     = useState({ currentPassword:"", newPassword:"", confirm:"" });
  const [showPw, setShowPw]     = useState(false);

  // ── Business ──────────────────────────────────────────────────────────────
  const [biz, setBiz] = useState(() => { try { return JSON.parse(localStorage.getItem("ves_biz")||"{}"); } catch { return {}; } });
  const [bizForm, setBizForm] = useState({
    companyName:   biz.companyName   || "VES CONNECTIONS LIMITED",
    tagline:       biz.tagline       || "Electronics & Accessories",
    address:       biz.address       || "Nairobi, Kenya",
    phone:         biz.phone         || "+254 793 757 451",
    email:         biz.email         || "vescyber2024@gmail.com",
    website:       biz.website       || "",
    kraPin:        biz.kraPin        || "",
    regNumber:     biz.regNumber     || "",
    taxRate:       biz.taxRate       || "0",
    currency:      biz.currency      || "KSh",
    fiscalYearStart: biz.fiscalYearStart || "01",
    receiptHeader: biz.receiptHeader || "VES CONNECTIONS LIMITED",
    receiptFooter: biz.receiptFooter || "Thank you for shopping with us!",
    receiptNote:   biz.receiptNote   || "",
    discountMax:   biz.discountMax   || "50",
    lowStockThreshold: biz.lowStockThreshold || "5",
    sessionTimeout:    biz.sessionTimeout    || "60",
    requirePinOnRefund: biz.requirePinOnRefund || false,
    allowNegativeStock: biz.allowNegativeStock || false,
  });

  // ── Branches ──────────────────────────────────────────────────────────────
  const [branches, setBranches] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ves_branches")||"null") || [
      { id:1, name:"Jewel Complex Main Branch", address:"Roysambu, Nairobi", phone:"+254 793 757 451", manager:"James Kamau", active:true, email:"main@ves.co.ke" },
      { id:2, name:"Juja Branch", address:"Juja, Kiambu", phone:"+254 700 000 002", manager:"Solomon", active:true, email:"juja@ves.co.ke" },
    ]; } catch { return []; }
  });
  const [branchModal, setBranchModal]   = useState(false);
  const [branchForm, setBranchForm]     = useState({ name:"", address:"", phone:"", manager:"", email:"" });
  const [editBranchId, setEditBranchId] = useState(null);

  // ── Sales targets ─────────────────────────────────────────────────────────
  const [targets, setTargets] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ves_targets")||"null") || [
      { branch:"Jewel Complex Main Branch", daily:50000, weekly:300000, monthly:1200000 },
      { branch:"Juja Branch", daily:40000, weekly:240000, monthly:960000 },
    ]; } catch { return []; }
  });
  const [targetForm, setTargetForm] = useState({ branch:"", daily:"", weekly:"", monthly:"" });

  // ── Staff performance ─────────────────────────────────────────────────────
  const [staffPerf, setStaffPerf] = useState([]);

  // ── Notifications ─────────────────────────────────────────────────────────
  const [notifSettings, setNotifSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ves_notif")||"null") || {
      lowStockAlert:true, dailySummary:false, newSaleAlert:false,
      emailReceipts:false, smsReceipts:false, onfonAlerts:true,
      smtpHost:"", smtpPort:"587", smtpUser:"", smtpPass:"",
      smsApiKey:"", smsSenderId:"VES-ERP",
    }; } catch { return {}; }
  });

  // ── Security & Access ─────────────────────────────────────────────────────
  const [secSettings, setSecSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ves_security")||"null") || {
      twoFactorAdmin: false, loginAttempts:5, ipWhitelist:"",
      requirePasswordChange: false, passwordMinLength: 8,
      sessionTimeoutMins: 60, logAllActions: true,
      restrictedHoursEnabled: false, openHour:"07", closeHour:"22",
    }; } catch { return {}; }
  });

  // ── Module visibility ─────────────────────────────────────────────────────
  const [moduleAccess, setModuleAccess] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ves_modules")||"null") || {
      Cashier: { sales:true, inventory:false, expenses:false, customers:true, suppliers:false, reports:false, transfers:false, debts:true, register:true, returns:true, onfon:false },
      Manager: { sales:true, inventory:true, expenses:true, customers:true, suppliers:true, reports:true, transfers:true, debts:true, register:true, returns:true, onfon:true },
      Admin:   { sales:true, inventory:true, expenses:true, customers:true, suppliers:true, reports:true, transfers:true, debts:true, register:true, returns:true, onfon:true },
    }; } catch { return {}; }
  });
  const MODULE_LIST = ["sales","inventory","expenses","customers","suppliers","reports","transfers","debts","register","returns","onfon"];

  // ── System stats ──────────────────────────────────────────────────────────
  const [sysStats, setSysStats] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, aRes, salesRes, prodRes, custRes, expRes] = await Promise.all([
        usersAPI.list(), reportsAPI.auditLog(),
        salesAPI.list({}), productsAPI.list(),
        customersAPI.list(), expensesAPI.list({}),
      ]);
      setUsers(uRes.data||[]);
      setAuditLog(aRes.data||[]);
      const perfMap = {};
      (salesRes.data||[]).forEach(s => {
        const k = s.staff_name||"Unknown";
        if (!perfMap[k]) perfMap[k] = { name:k, sales:0, revenue:0, transactions:0 };
        perfMap[k].revenue      += parseFloat(s.total)||0;
        perfMap[k].transactions += 1;
        s.items?.forEach(i => { perfMap[k].sales += i.qty||0; });
      });
      setStaffPerf(Object.values(perfMap).sort((a,b)=>b.revenue-a.revenue));
      const totalRevenue = (salesRes.data||[]).reduce((s,r)=>s+(parseFloat(r.total)||0),0);
      const totalExpenses = (expRes.data||[]).reduce((s,r)=>s+(parseFloat(r.amount)||0),0);
      setSysStats({
        totalUsers:    (uRes.data||[]).length,
        activeUsers:   (uRes.data||[]).filter(u=>u.is_active).length,
        totalProducts: (prodRes.data||[]).length,
        lowStock:      (prodRes.data||[]).filter(p=>(p.qty||0)<=(bizForm.lowStockThreshold||5)).length,
        totalSales:    (salesRes.data||[]).length,
        totalRevenue,
        totalCustomers:(custRes.data||[]).length,
        totalExpenses,
        netProfit:     totalRevenue - totalExpenses,
        auditCount:    (aRes.data||[]).length,
      });
    } catch(e) { notify(e.message,"error"); }
    setLoading(false);
  }, []);

  useEffect(()=>{ load(); },[load]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const saveUser = async () => {
    if (!userForm.name||!userForm.username) return notify("Name and username required","error");
    if (!editUser && !userForm.password)    return notify("Password required","error");
    setSaving(true);
    try {
      if (editUser) { await usersAPI.update?.(editUser.id, { name:userForm.name, role:userForm.role, branch:userForm.branch })||true; }
      else          { await usersAPI.create(userForm); }
      notify(editUser?"User updated ✅":"Account created ✅"); setUserModal(false); load();
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const deactivate = async (id) => {
    if (!window.confirm("Deactivate this user? They will be logged out.")) return;
    try { await usersAPI.deactivate(id); notify("User deactivated","error"); load(); }
    catch(e) { notify(e.message,"error"); }
  };

  const reactivate = async (id) => {
    try { await usersAPI.reactivate?.(id)||true; notify("User reactivated ✅"); load(); }
    catch(e) { notify(e.message,"error"); }
  };

  const changePassword = async () => {
    if (pwForm.newPassword !== pwForm.confirm) return notify("Passwords don't match","error");
    if (pwForm.newPassword.length < (secSettings.passwordMinLength||6)) return notify(`Min ${secSettings.passwordMinLength||6} characters required`,"error");
    setSaving(true);
    try {
      await authAPI.changePassword(pwForm.currentPassword, pwForm.newPassword);
      notify("Password changed ✅"); setPwModal(false); setPwForm({ currentPassword:"", newPassword:"", confirm:"" });
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const saveBiz = () => { localStorage.setItem("ves_biz", JSON.stringify(bizForm)); setBiz(bizForm); notify("Business settings saved ✅"); };
  const saveBranch = () => {
    if (!branchForm.name) return notify("Branch name required","error");
    const updated = editBranchId
      ? branches.map(b=>b.id===editBranchId?{...b,...branchForm}:b)
      : [...branches, {...branchForm, id:Date.now(), active:true}];
    setBranches(updated); localStorage.setItem("ves_branches", JSON.stringify(updated));
    setBranchModal(false); setBranchForm({name:"",address:"",phone:"",manager:"",email:""}); setEditBranchId(null);
    notify(editBranchId?"Branch updated ✅":"Branch added ✅");
  };
  const toggleBranch = id => {
    const updated = branches.map(b=>b.id===id?{...b,active:!b.active}:b);
    setBranches(updated); localStorage.setItem("ves_branches", JSON.stringify(updated)); notify("Branch status updated");
  };
  const saveTarget = () => {
    if (!targetForm.branch||!targetForm.monthly) return notify("Branch and monthly target required","error");
    const updated = targets.find(t=>t.branch===targetForm.branch)
      ? targets.map(t=>t.branch===targetForm.branch?{...t,...targetForm,daily:+targetForm.daily,weekly:+targetForm.weekly,monthly:+targetForm.monthly}:t)
      : [...targets,{...targetForm,daily:+targetForm.daily,weekly:+targetForm.weekly,monthly:+targetForm.monthly}];
    setTargets(updated); localStorage.setItem("ves_targets", JSON.stringify(updated)); notify("Targets saved ✅");
  };
  const saveNotif    = () => { localStorage.setItem("ves_notif",    JSON.stringify(notifSettings)); notify("Notification settings saved ✅"); };
  const saveSecurity = () => { localStorage.setItem("ves_security", JSON.stringify(secSettings));  notify("Security settings saved ✅"); };
  const saveModules  = () => { localStorage.setItem("ves_modules",  JSON.stringify(moduleAccess)); notify("Module access saved ✅"); };

  const backupData = async () => {
    try {
      const [salesRes, prodRes, custRes, suppRes, expRes] = await Promise.all([
        salesAPI.list({}), productsAPI.list(), customersAPI.list(), suppliersAPI.list(), expensesAPI.list({}),
      ]);
      const backup = {
        exportedAt: new Date().toISOString(), version:"VES-ERP-v3",
        exportedBy: currentUser.name,
        data: { sales:salesRes.data, products:prodRes.data, customers:custRes.data, suppliers:suppRes.data, expenses:expRes.data },
      };
      const blob = new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a"); a.href=url; a.download=`VES_ERP_Backup_${new Date().toISOString().split("T")[0]}.json`; a.click();
      URL.revokeObjectURL(url); notify("Backup downloaded ✅");
    } catch(e) { notify("Backup failed: "+e.message,"error"); }
  };

  if (currentUser?.role !== "Admin") {
    return <div className="fade-in empty-state"><div className="es-icon">🔒</div><p>Admin access required</p></div>;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const Toggle = ({ value, onChange, label, sub }) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 0", borderBottom:`1px solid ${C.border}` }}>
      <div>
        <div style={{ fontSize:13, fontWeight:600 }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>{sub}</div>}
      </div>
      <div onClick={()=>onChange(!value)} style={{ width:44, height:24, borderRadius:12, background:value?C.success:C.border, cursor:"pointer", position:"relative", transition:"background .2s", flexShrink:0 }}>
        <div style={{ position:"absolute", top:3, left:value?23:3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,.3)" }} />
      </div>
    </div>
  );

  const SectionHeader = ({ icon, title, sub }) => (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:15, fontWeight:800 }}>{icon} {title}</div>
      {sub && <div style={{ fontSize:12, color:C.textMuted, marginTop:2 }}>{sub}</div>}
    </div>
  );

  const TABS = [
    ["overview",   "🏠", "Overview"],
    ["users",      "👥", "Users"],
    ["access",     "🔐", "Access Control"],
    ["business",   "🏢", "Business"],
    ["branches",   "📍", "Branches"],
    ["targets",    "🎯", "Targets"],
    ["staff",      "📊", "Staff"],
    ["notif",      "🔔", "Alerts"],
    ["security",   "🛡️", "Security"],
    ["passwords",  "🔑", "Passwords"],
    ["backup",     "💾", "Backup"],
    ["audit",      "📋", "Audit Log"],
  ];

  const filteredUsers = users.filter(u =>
    !userSearch || u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.username?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.role?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const ROLE_COLOR = { Admin:"b-danger", Manager:"b-warning", Cashier:"b-info" };

  return (
    <div className="fade-in">
      {/* ── Admin Banner ── */}
      <div style={{ background:`linear-gradient(135deg,#1e1b4b,#312e81)`, borderRadius:14, padding:"18px 24px", marginBottom:20, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800, color:"#fff" }}>⚙️ Admin Control Panel</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,.65)", marginTop:3 }}>Signed in as <strong style={{color:"#a5b4fc"}}>{currentUser?.name}</strong> · Full system access</div>
        </div>
        <div style={{ fontSize:40, opacity:.3 }}>🔑</div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ overflowX:"auto", marginBottom:22, paddingBottom:4 }}>
        <div style={{ display:"flex", gap:3, background:C.surfaceAlt, padding:4, borderRadius:10, minWidth:"max-content" }}>
          {TABS.map(([k,icon,label])=>(
            <button key={k} onClick={()=>setTab(k)} style={{ padding:"8px 13px", borderRadius:7, border:"none", cursor:"pointer", background:tab===k?C.surface:"transparent", color:tab===k?C.text:C.textMuted, fontWeight:600, fontSize:12, fontFamily:"inherit", boxShadow:tab===k?"0 1px 4px rgba(0,0,0,.25)":"none", transition:"all .15s", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:5 }}>
              <span>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          OVERVIEW
      ══════════════════════════════════════════════════════ */}
      {tab==="overview" && (
        <div>
          {loading || !sysStats ? <Loading /> : (
            <>
              {/* KPI grid */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:14, marginBottom:22 }}>
                {[
                  { icon:"👥", label:"System Users",    value:sysStats.totalUsers,    sub:`${sysStats.activeUsers} active`,          color:C.accent },
                  { icon:"📦", label:"Products",        value:sysStats.totalProducts, sub:`${sysStats.lowStock} low stock`,           color:sysStats.lowStock>0?C.danger:C.success },
                  { icon:"🛒", label:"Total Sales",     value:sysStats.totalSales,    sub:"all time",                                 color:C.info },
                  { icon:"💰", label:"Total Revenue",   value:fmtKsh(sysStats.totalRevenue), sub:"all branches",                     color:C.success },
                  { icon:"💸", label:"Total Expenses",  value:fmtKsh(sysStats.totalExpenses), sub:"recorded",                       color:C.danger },
                  { icon:"📈", label:"Net Profit",      value:fmtKsh(sysStats.netProfit), sub:sysStats.netProfit>=0?"Profit":"Loss", color:sysStats.netProfit>=0?C.success:C.danger },
                  { icon:"👤", label:"Customers",       value:sysStats.totalCustomers, sub:"registered",                             color:C.warning },
                  { icon:"📋", label:"Audit Events",    value:sysStats.auditCount,    sub:"logged actions",                          color:C.textMuted },
                ].map(s=>(
                  <div key={s.label} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"16px 18px", borderTop:`3px solid ${s.color}` }}>
                    <div style={{ fontSize:22 }}>{s.icon}</div>
                    <div style={{ fontSize:22, fontWeight:800, color:s.color, marginTop:6, fontFamily:"monospace" }}>{s.value}</div>
                    <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>{s.label}</div>
                    <div style={{ fontSize:10, color:C.textMuted, marginTop:1 }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Users quick view + recent audit */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
                <div className="card">
                  <div className="card-hd"><span className="card-title">👥 Active Users</span><button className="btn btn-primary btn-sm" onClick={()=>setTab("users")}>Manage</button></div>
                  {users.filter(u=>u.is_active).map(u=>(
                    <div key={u.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", borderBottom:`1px solid ${C.border}` }}>
                      <div style={{ width:32, height:32, borderRadius:8, background:`linear-gradient(135deg,${C.accent},${C.accentDark})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, color:"#000" }}>{u.avatar||u.name?.[0]}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, fontSize:13 }}>{u.name}</div>
                        <div style={{ fontSize:11, color:C.textMuted }}>{u.branch||"All branches"}</div>
                      </div>
                      <Badge label={u.role} type={ROLE_COLOR[u.role]||"b-ghost"} />
                    </div>
                  ))}
                </div>

                <div className="card">
                  <div className="card-hd"><span className="card-title">📋 Recent Activity</span><button className="btn btn-ghost btn-sm" onClick={()=>setTab("audit")}>View All</button></div>
                  <div style={{ maxHeight:320, overflowY:"auto" }}>
                    {auditLog.slice(0,12).map((a,i)=>(
                      <div key={i} style={{ display:"flex", gap:10, padding:"8px 16px", borderBottom:`1px solid ${C.border}` }}>
                        <div style={{ width:7, height:7, borderRadius:"50%", marginTop:5, flexShrink:0, background:a.action?.includes("CREATE")||a.action?.includes("LOGIN")?C.success:a.action?.includes("DELETE")||a.action?.includes("DEACTIVATE")?C.danger:C.info }} />
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:12, fontWeight:600 }}>{a.action?.replace(/_/g," ")}</div>
                          <div style={{ fontSize:10, color:C.textMuted }}>{a.user_name} · {new Date(a.created_at).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Staff top 3 */}
              <div className="card">
                <div className="card-hd"><span className="card-title">🏆 Top Performers</span><button className="btn btn-ghost btn-sm" onClick={()=>setTab("staff")}>Full Report</button></div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12, padding:"14px 16px" }}>
                  {staffPerf.slice(0,6).map((s,i)=>(
                    <div key={i} style={{ background:C.surfaceAlt, borderRadius:10, padding:"12px 14px", border:`1px solid ${C.border}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div style={{ fontSize:20 }}>{["🥇","🥈","🥉","4️⃣","5️⃣","6️⃣"][i]}</div>
                        <span style={{ fontSize:11, color:C.textMuted }}>#{i+1}</span>
                      </div>
                      <div style={{ fontWeight:700, fontSize:13, marginTop:6 }}>{s.name}</div>
                      <div style={{ fontSize:13, color:C.success, fontWeight:600, fontFamily:"monospace" }}>{fmtKsh(s.revenue)}</div>
                      <div style={{ fontSize:11, color:C.textMuted }}>{s.transactions} txns · {s.sales} units</div>
                    </div>
                  ))}
                </div>
                {staffPerf.length===0 && <div className="empty-state" style={{padding:20}}><p>No sales data yet.</p></div>}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          USERS
      ══════════════════════════════════════════════════════ */}
      {tab==="users" && (
        <div>
          <div className="card" style={{ marginBottom:16 }}>
            <div className="card-hd">
              <span className="card-title">👥 System Users ({users.length})</span>
              <div style={{ display:"flex", gap:8 }}>
                <input className="inp" style={{ width:200 }} placeholder="Search users..." value={userSearch} onChange={e=>setUserSearch(e.target.value)} />
                <button className="btn btn-outline btn-sm" onClick={()=>{setPwTarget(currentUser);setPwModal(true);}}>🔑 My Password</button>
                <button className="btn btn-primary btn-sm" onClick={()=>{setEditUser(null);setUserForm({name:"",username:"",password:"",role:"Cashier",branch:"Main Branch"});setUserModal(true);}}>+ Add User</button>
              </div>
            </div>
            {loading ? <Loading /> : filteredUsers.length===0 ? <div className="empty-state" style={{padding:20}}><p>No users found.</p></div> : (
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Avatar</th><th>Name</th><th>Username</th><th>Role</th><th>Branch</th><th>Status</th><th>Last Active</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filteredUsers.map(u=>(
                      <tr key={u.id}>
                        <td><div style={{ width:36,height:36,borderRadius:9,background:`linear-gradient(135deg,${C.accent},${C.accentDark})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#000" }}>{u.avatar||u.name?.[0]||"?"}</div></td>
                        <td style={{ fontWeight:700 }}>{u.name}{u.id===currentUser.id&&<span style={{fontSize:10,marginLeft:6,color:C.accent,fontWeight:600}}>(you)</span>}</td>
                        <td className="mono" style={{ fontSize:12,color:C.textMuted }}>{u.username}</td>
                        <td><Badge label={u.role} type={ROLE_COLOR[u.role]||"b-ghost"} /></td>
                        <td style={{ fontSize:12,color:C.textMuted }}>{u.branch||"All"}</td>
                        <td><Badge label={u.is_active?"Active":"Inactive"} type={u.is_active?"b-success":"b-ghost"} /></td>
                        <td style={{ fontSize:11,color:C.textMuted }}>{u.last_login?new Date(u.last_login).toLocaleDateString():"Never"}</td>
                        <td>
                          <div style={{ display:"flex",gap:4 }}>
                            <button className="btn btn-ghost btn-sm" title="Edit" onClick={()=>{setEditUser(u);setUserForm({name:u.name,username:u.username,password:"",role:u.role,branch:u.branch||"Main Branch"});setUserModal(true);}}>✏️</button>
                            <button className="btn btn-outline btn-sm" title="Change password" onClick={()=>{setPwTarget(u);setPwModal(true);}}>🔑</button>
                            {u.id!==currentUser.id && (
                              u.is_active
                                ? <button className="btn btn-danger btn-sm" onClick={()=>deactivate(u.id)}>Deactivate</button>
                                : <button className="btn btn-success btn-sm" onClick={()=>reactivate(u.id)}>Activate</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Role legend */}
          <div className="card">
            <div className="card-hd"><span className="card-title">ℹ️ Role Descriptions</span></div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, padding:"14px 16px" }}>
              {[
                { role:"Admin",   icon:"👑", color:C.danger,   desc:"Full system access. Can manage users, view all reports, change settings, access backup/restore." },
                { role:"Manager", icon:"🧑‍💼", color:C.warning, desc:"Access to inventory, sales, reports, staff performance. Cannot change security or user settings." },
                { role:"Cashier", icon:"💳", color:C.info,     desc:"Can process sales and returns, view assigned customers. Limited to daily operations." },
              ].map(r=>(
                <div key={r.role} style={{ background:C.surfaceAlt, borderRadius:10, padding:"14px 16px", border:`1px solid ${C.border}`, borderLeft:`3px solid ${r.color}` }}>
                  <div style={{ fontWeight:800, fontSize:14 }}>{r.icon} {r.role}</div>
                  <div style={{ fontSize:12, color:C.textMuted, marginTop:6, lineHeight:1.5 }}>{r.desc}</div>
                  <div style={{ marginTop:8, fontSize:12, color:r.color, fontWeight:600 }}>{users.filter(u=>u.role===r.role).length} user(s)</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          ACCESS CONTROL — Module Permissions by Role
      ══════════════════════════════════════════════════════ */}
      {tab==="access" && (
        <div>
          <div className="card" style={{ marginBottom:16 }}>
            <div className="card-hd">
              <span className="card-title">🔐 Module Access by Role</span>
              <button className="btn btn-primary btn-sm" onClick={saveModules}>💾 Save Access</button>
            </div>
            <div style={{ padding:"14px 16px" }}>
              <div style={{ fontSize:12, color:C.textMuted, marginBottom:16, padding:"10px 14px", background:C.warning+"18", borderRadius:8, border:`1px solid ${C.warning}` }}>
                ⚠️ Changes take effect on next login. Admin always has full access and cannot be restricted.
              </div>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width:140 }}>Module</th>
                      {["Cashier","Manager","Admin"].map(r=>(
                        <th key={r} style={{ textAlign:"center" }}><Badge label={r} type={ROLE_COLOR[r]||"b-ghost"} /></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULE_LIST.map(mod=>(
                      <tr key={mod}>
                        <td style={{ fontWeight:600, textTransform:"capitalize" }}>
                          {{"sales":"🛒 Sales","inventory":"📦 Inventory","expenses":"💸 Expenses","customers":"👤 Customers","suppliers":"🏭 Suppliers","reports":"📊 Reports","transfers":"🔄 Transfers","debts":"💳 Debts","register":"💰 Cash Register","returns":"↩️ Returns","onfon":"📱 Onfon"}[mod]}
                        </td>
                        {["Cashier","Manager","Admin"].map(role=>(
                          <td key={role} style={{ textAlign:"center" }}>
                            {role==="Admin" ? (
                              <span style={{ color:C.success, fontSize:16 }}>✅</span>
                            ) : (
                              <div onClick={()=>{
                                if(role==="Admin") return;
                                setModuleAccess(prev=>({...prev,[role]:{...prev[role],[mod]:!prev[role]?.[mod]}}));
                              }} style={{ width:28,height:28,borderRadius:6,background:moduleAccess[role]?.[mod]?C.success+"22":C.border,border:`2px solid ${moduleAccess[role]?.[mod]?C.success:C.border}`,cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center",transition:"all .15s" }}>
                                {moduleAccess[role]?.[mod] && <span style={{ color:C.success, fontSize:14 }}>✓</span>}
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Per-user privilege overrides */}
          <div className="card">
            <div className="card-hd"><span className="card-title">👤 User Privilege Summary</span></div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>User</th><th>Role</th><th>Branch</th><th>Accessible Modules</th><th>Status</th></tr></thead>
                <tbody>
                  {users.map(u=>{
                    const mods = Object.entries(moduleAccess[u.role]||{}).filter(([,v])=>v).map(([k])=>k);
                    return (
                      <tr key={u.id}>
                        <td style={{ fontWeight:600 }}>{u.name}</td>
                        <td><Badge label={u.role} type={ROLE_COLOR[u.role]||"b-ghost"} /></td>
                        <td style={{ fontSize:12,color:C.textMuted }}>{u.branch||"All"}</td>
                        <td>
                          <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
                            {mods.map(m=><span key={m} style={{ fontSize:10,padding:"2px 7px",borderRadius:4,background:C.accent+"22",color:C.accent,fontWeight:600 }}>{m}</span>)}
                          </div>
                        </td>
                        <td><Badge label={u.is_active?"Active":"Inactive"} type={u.is_active?"b-success":"b-ghost"} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          BUSINESS SETTINGS
      ══════════════════════════════════════════════════════ */}
      {tab==="business" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div>
            <div className="card" style={{ marginBottom:16 }}>
              <div className="card-hd"><span className="card-title">🏢 Company Information</span></div>
              <div className="card-body">
                <div className="fg"><label className="flabel">Company Name</label><input className="inp" value={bizForm.companyName} onChange={e=>setBizForm(f=>({...f,companyName:e.target.value}))} /></div>
                <div className="fg"><label className="flabel">Tagline / Business Type</label><input className="inp" value={bizForm.tagline} onChange={e=>setBizForm(f=>({...f,tagline:e.target.value}))} /></div>
                <div className="fg"><label className="flabel">Address</label><input className="inp" value={bizForm.address} onChange={e=>setBizForm(f=>({...f,address:e.target.value}))} /></div>
                <div className="frow">
                  <div className="fg"><label className="flabel">Phone</label><input className="inp" value={bizForm.phone} onChange={e=>setBizForm(f=>({...f,phone:e.target.value}))} /></div>
                  <div className="fg"><label className="flabel">Email</label><input className="inp" value={bizForm.email} onChange={e=>setBizForm(f=>({...f,email:e.target.value}))} /></div>
                </div>
                <div className="fg"><label className="flabel">Website</label><input className="inp" value={bizForm.website} onChange={e=>setBizForm(f=>({...f,website:e.target.value}))} placeholder="https://..." /></div>
                <div className="frow">
                  <div className="fg"><label className="flabel">KRA PIN</label><input className="inp" value={bizForm.kraPin} onChange={e=>setBizForm(f=>({...f,kraPin:e.target.value}))} placeholder="P00XXXXXXXXX" /></div>
                  <div className="fg"><label className="flabel">Registration No.</label><input className="inp" value={bizForm.regNumber} onChange={e=>setBizForm(f=>({...f,regNumber:e.target.value}))} /></div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-hd"><span className="card-title">💰 Financial Settings</span></div>
              <div className="card-body">
                <div className="frow">
                  <div className="fg"><label className="flabel">Tax Rate (%)</label><input className="inp" type="number" value={bizForm.taxRate} onChange={e=>setBizForm(f=>({...f,taxRate:e.target.value}))} placeholder="16" /></div>
                  <div className="fg"><label className="flabel">Currency</label><input className="inp" value={bizForm.currency} onChange={e=>setBizForm(f=>({...f,currency:e.target.value}))} /></div>
                </div>
                <div className="frow">
                  <div className="fg"><label className="flabel">Max Discount (%)</label><input className="inp" type="number" value={bizForm.discountMax} onChange={e=>setBizForm(f=>({...f,discountMax:e.target.value}))} /></div>
                  <div className="fg"><label className="flabel">Fiscal Year Start (month)</label>
                    <select className="sel" value={bizForm.fiscalYearStart} onChange={e=>setBizForm(f=>({...f,fiscalYearStart:e.target.value}))}>
                      {["01","02","03","04","05","06","07","08","09","10","11","12"].map((m,i)=><option key={m} value={m}>{["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i]}</option>)}
                    </select>
                  </div>
                </div>
                <div className="fg"><label className="flabel">Low Stock Threshold (units)</label><input className="inp" type="number" value={bizForm.lowStockThreshold} onChange={e=>setBizForm(f=>({...f,lowStockThreshold:e.target.value}))} /></div>
                <div style={{ marginTop:8 }}>
                  <Toggle value={bizForm.allowNegativeStock} onChange={v=>setBizForm(f=>({...f,allowNegativeStock:v}))} label="Allow Negative Stock" sub="Permit sales even when quantity is zero" />
                  <Toggle value={bizForm.requirePinOnRefund} onChange={v=>setBizForm(f=>({...f,requirePinOnRefund:v}))} label="Require PIN on Refunds" sub="Manager PIN required to process returns" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="card" style={{ marginBottom:16 }}>
              <div className="card-hd"><span className="card-title">🧾 Receipt & POS Settings</span></div>
              <div className="card-body">
                <div className="fg"><label className="flabel">Receipt Header Line</label><input className="inp" value={bizForm.receiptHeader} onChange={e=>setBizForm(f=>({...f,receiptHeader:e.target.value}))} /></div>
                <div className="fg"><label className="flabel">Receipt Footer</label><textarea className="inp" style={{ minHeight:60,resize:"vertical" }} value={bizForm.receiptFooter} onChange={e=>setBizForm(f=>({...f,receiptFooter:e.target.value}))} /></div>
                <div className="fg"><label className="flabel">Extra Note on Receipt</label><input className="inp" value={bizForm.receiptNote} onChange={e=>setBizForm(f=>({...f,receiptNote:e.target.value}))} placeholder="e.g. No returns after 7 days" /></div>
                <div className="fg"><label className="flabel">Session Timeout (minutes)</label><input className="inp" type="number" value={bizForm.sessionTimeout} onChange={e=>setBizForm(f=>({...f,sessionTimeout:e.target.value}))} /></div>
              </div>
            </div>

            <div style={{ padding:"16px", background:C.surfaceAlt, borderRadius:12, border:`1px solid ${C.border}`, marginBottom:16 }}>
              <div style={{ fontSize:12, color:C.textMuted, marginBottom:10, fontWeight:600, textTransform:"uppercase", letterSpacing:1 }}>Live Preview</div>
              <div style={{ background:C.surface, borderRadius:8, padding:"14px 16px", fontFamily:"monospace", fontSize:12, border:`1px solid ${C.border}` }}>
                <div style={{ textAlign:"center", fontWeight:800, fontSize:14 }}>{bizForm.receiptHeader||"Company Name"}</div>
                <div style={{ textAlign:"center", fontSize:11, color:C.textMuted }}>{bizForm.tagline}</div>
                <div style={{ textAlign:"center", fontSize:11, color:C.textMuted }}>{bizForm.phone} · {bizForm.email}</div>
                <div style={{ borderTop:`1px dashed ${C.border}`, margin:"10px 0" }} />
                <div style={{ display:"flex", justifyContent:"space-between" }}><span>Item 1</span><span>KSh 1,500</span></div>
                <div style={{ display:"flex", justifyContent:"space-between" }}><span>Tax ({bizForm.taxRate}%)</span><span>KSh {(1500*bizForm.taxRate/100).toFixed(0)}</span></div>
                <div style={{ borderTop:`1px dashed ${C.border}`, margin:"8px 0" }} />
                <div style={{ display:"flex", justifyContent:"space-between", fontWeight:800 }}><span>TOTAL</span><span>KSh {(1500*(1+bizForm.taxRate/100)).toFixed(0)}</span></div>
                <div style={{ borderTop:`1px dashed ${C.border}`, margin:"8px 0" }} />
                <div style={{ textAlign:"center", fontSize:11, color:C.textMuted }}>{bizForm.receiptFooter}</div>
                {bizForm.receiptNote && <div style={{ textAlign:"center", fontSize:10, color:C.danger, marginTop:4 }}>{bizForm.receiptNote}</div>}
              </div>
            </div>

            <button className="btn btn-primary" style={{ width:"100%", justifyContent:"center", padding:13, fontSize:14 }} onClick={saveBiz}>💾 Save All Business Settings</button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          BRANCHES
      ══════════════════════════════════════════════════════ */}
      {tab==="branches" && (
        <div>
          <div className="card">
            <div className="card-hd">
              <span className="card-title">📍 Branch Management ({branches.length})</span>
              <button className="btn btn-primary btn-sm" onClick={()=>{setEditBranchId(null);setBranchForm({name:"",address:"",phone:"",manager:"",email:""});setBranchModal(true);}}>+ Add Branch</button>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Branch Name</th><th>Address</th><th>Phone</th><th>Email</th><th>Manager</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {branches.map(b=>(
                    <tr key={b.id}>
                      <td style={{ fontWeight:700 }}>{b.name}</td>
                      <td style={{ fontSize:12,color:C.textMuted }}>{b.address}</td>
                      <td className="mono" style={{ fontSize:12 }}>{b.phone}</td>
                      <td style={{ fontSize:12,color:C.textMuted }}>{b.email||"—"}</td>
                      <td style={{ fontSize:12 }}>{b.manager}</td>
                      <td><Badge label={b.active?"Active":"Inactive"} type={b.active?"b-success":"b-ghost"} /></td>
                      <td>
                        <div style={{ display:"flex",gap:5 }}>
                          <button className="btn btn-ghost btn-sm" onClick={()=>{setEditBranchId(b.id);setBranchForm({name:b.name,address:b.address,phone:b.phone,manager:b.manager,email:b.email||""});setBranchModal(true);}}>✏️ Edit</button>
                          <button className={`btn btn-sm ${b.active?"btn-danger":"btn-success"}`} onClick={()=>toggleBranch(b.id)}>{b.active?"Disable":"Enable"}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TARGETS
      ══════════════════════════════════════════════════════ */}
      {tab==="targets" && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:14, marginBottom:20 }}>
            {targets.map((t,i)=>(
              <div key={i} className="card">
                <div className="card-hd"><span className="card-title">📍 {t.branch}</span></div>
                <div className="card-body">
                  {[["Daily",t.daily],["Weekly",t.weekly],["Monthly",t.monthly]].map(([label,target])=>(
                    <div key={label} style={{ marginBottom:14 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                        <span style={{ fontSize:12, fontWeight:600 }}>{label} Target</span>
                        <span className="mono" style={{ fontSize:12, color:C.accent }}>{fmtKsh(target)}</span>
                      </div>
                      <div style={{ height:7, background:C.border, borderRadius:4, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:"65%", background:`linear-gradient(90deg,${C.accent},${C.success})`, borderRadius:4 }} />
                      </div>
                      <div style={{ fontSize:10, color:C.textMuted, marginTop:3 }}>65% achieved (connect sales API)</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-hd"><span className="card-title">🎯 Set / Update Target</span></div>
            <div className="card-body">
              <div className="fg"><label className="flabel">Branch</label>
                <select className="sel" value={targetForm.branch} onChange={e=>{const t=targets.find(x=>x.branch===e.target.value);setTargetForm(t?{branch:t.branch,daily:t.daily,weekly:t.weekly,monthly:t.monthly}:{...targetForm,branch:e.target.value});}}>
                  <option value="">Select branch...</option>
                  {branches.map(b=><option key={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                <div className="fg"><label className="flabel">Daily (KSh)</label><input className="inp" type="number" value={targetForm.daily} onChange={e=>setTargetForm(f=>({...f,daily:e.target.value}))} /></div>
                <div className="fg"><label className="flabel">Weekly (KSh)</label><input className="inp" type="number" value={targetForm.weekly} onChange={e=>setTargetForm(f=>({...f,weekly:e.target.value}))} /></div>
                <div className="fg"><label className="flabel">Monthly (KSh)</label><input className="inp" type="number" value={targetForm.monthly} onChange={e=>setTargetForm(f=>({...f,monthly:e.target.value}))} /></div>
              </div>
              <button className="btn btn-primary" onClick={saveTarget}>💾 Save Targets</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          STAFF PERFORMANCE
      ══════════════════════════════════════════════════════ */}
      {tab==="staff" && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:20 }}>
            {staffPerf.slice(0,3).map((s,i)=>(
              <div key={i} className="card" style={{ borderTop:`3px solid ${[C.accent,C.info,C.success][i]}` }}>
                <div className="card-body" style={{ textAlign:"center" }}>
                  <div style={{ fontSize:32 }}>{["🥇","🥈","🥉"][i]}</div>
                  <div style={{ fontWeight:800, fontSize:14, marginTop:8 }}>{s.name}</div>
                  <div style={{ fontSize:20, fontWeight:800, color:[C.accent,C.info,C.success][i], fontFamily:"monospace", marginTop:4 }}>{fmtKsh(s.revenue)}</div>
                  <div style={{ fontSize:12, color:C.textMuted, marginTop:4 }}>{s.transactions} transactions · {s.sales} units</div>
                </div>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-hd"><span className="card-title">📊 Full Staff Leaderboard</span></div>
            {staffPerf.length===0 ? <div className="empty-state" style={{padding:30}}><div className="es-icon">📊</div><p>No sales data yet.</p></div> : (
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Rank</th><th>Staff</th><th>Transactions</th><th>Units Sold</th><th>Revenue</th><th>Avg Sale</th><th>Performance Bar</th></tr></thead>
                  <tbody>
                    {staffPerf.map((s,i)=>{
                      const pct = ((s.revenue/(staffPerf[0]?.revenue||1))*100).toFixed(0);
                      return (
                        <tr key={i}>
                          <td className="mono" style={{ color:C.textMuted }}>#{i+1}</td>
                          <td style={{ fontWeight:700 }}>{s.name}</td>
                          <td className="mono">{s.transactions}</td>
                          <td className="mono">{s.sales}</td>
                          <td className="mono" style={{ color:C.success, fontWeight:600 }}>{fmtKsh(s.revenue)}</td>
                          <td className="mono" style={{ fontSize:12, color:C.textMuted }}>{fmtKsh(s.transactions>0?s.revenue/s.transactions:0)}</td>
                          <td>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <div style={{ width:100, height:7, background:C.border, borderRadius:4, overflow:"hidden" }}>
                                <div style={{ height:"100%", width:`${pct}%`, background:i===0?C.accent:i===1?C.info:C.success, borderRadius:4 }} />
                              </div>
                              <span className="mono" style={{ fontSize:10, color:C.textMuted }}>{pct}%</span>
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
      )}

      {/* ══════════════════════════════════════════════════════
          NOTIFICATIONS
      ══════════════════════════════════════════════════════ */}
      {tab==="notif" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div>
            <div className="card" style={{ marginBottom:16 }}>
              <div className="card-hd"><span className="card-title">🔔 Alert Toggles</span></div>
              <div className="card-body">
                <Toggle value={notifSettings.lowStockAlert}  onChange={v=>setNotifSettings(f=>({...f,lowStockAlert:v}))}  label="Low Stock Alerts"           sub="Alert when product drops below threshold" />
                <Toggle value={notifSettings.dailySummary}   onChange={v=>setNotifSettings(f=>({...f,dailySummary:v}))}   label="Daily Sales Summary"        sub="End-of-day summary report" />
                <Toggle value={notifSettings.newSaleAlert}   onChange={v=>setNotifSettings(f=>({...f,newSaleAlert:v}))}   label="New Sale Notifications"     sub="Alert on every completed sale" />
                <Toggle value={notifSettings.emailReceipts}  onChange={v=>setNotifSettings(f=>({...f,emailReceipts:v}))}  label="Email Receipts to Customers" sub="Auto-send receipt via email" />
                <Toggle value={notifSettings.smsReceipts}    onChange={v=>setNotifSettings(f=>({...f,smsReceipts:v}))}    label="SMS Receipts"               sub="Send receipt via SMS" />
                <Toggle value={notifSettings.onfonAlerts}    onChange={v=>setNotifSettings(f=>({...f,onfonAlerts:v}))}    label="Onfon Stock Alerts"         sub="Alert when Onfon device is sold or returned" />
              </div>
            </div>
            <div className="card">
              <div className="card-hd"><span className="card-title">📱 SMS Settings</span></div>
              <div className="card-body">
                <div className="fg"><label className="flabel">SMS API Key (Africa's Talking)</label><input className="inp" value={notifSettings.smsApiKey} onChange={e=>setNotifSettings(f=>({...f,smsApiKey:e.target.value}))} placeholder="Your API key..." /></div>
                <div className="fg"><label className="flabel">Sender ID</label><input className="inp" value={notifSettings.smsSenderId} onChange={e=>setNotifSettings(f=>({...f,smsSenderId:e.target.value}))} placeholder="VES-ERP" /></div>
              </div>
            </div>
          </div>
          <div>
            <div className="card" style={{ marginBottom:16 }}>
              <div className="card-hd"><span className="card-title">📧 Email (SMTP)</span></div>
              <div className="card-body">
                <div className="frow">
                  <div className="fg"><label className="flabel">SMTP Host</label><input className="inp" value={notifSettings.smtpHost} onChange={e=>setNotifSettings(f=>({...f,smtpHost:e.target.value}))} placeholder="smtp.gmail.com" /></div>
                  <div className="fg"><label className="flabel">Port</label><input className="inp" value={notifSettings.smtpPort} onChange={e=>setNotifSettings(f=>({...f,smtpPort:e.target.value}))} placeholder="587" /></div>
                </div>
                <div className="fg"><label className="flabel">Username / Email</label><input className="inp" value={notifSettings.smtpUser} onChange={e=>setNotifSettings(f=>({...f,smtpUser:e.target.value}))} placeholder="your@email.com" /></div>
                <div className="fg"><label className="flabel">SMTP Password</label><input className="inp" type="password" value={notifSettings.smtpPass} onChange={e=>setNotifSettings(f=>({...f,smtpPass:e.target.value}))} /></div>
                <div style={{ padding:"10px 0", fontSize:12, color:C.textMuted }}>💡 For Gmail, use an App Password, not your main password.</div>
              </div>
            </div>
            <button className="btn btn-primary" style={{ width:"100%", justifyContent:"center", padding:13 }} onClick={saveNotif}>💾 Save Notification Settings</button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          SECURITY
      ══════════════════════════════════════════════════════ */}
      {tab==="security" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div>
            <div className="card" style={{ marginBottom:16 }}>
              <div className="card-hd"><span className="card-title">🛡️ Login & Session Security</span></div>
              <div className="card-body">
                <Toggle value={secSettings.twoFactorAdmin}        onChange={v=>setSecSettings(f=>({...f,twoFactorAdmin:v}))}        label="2FA for Admin"            sub="Require OTP for admin logins" />
                <Toggle value={secSettings.requirePasswordChange}  onChange={v=>setSecSettings(f=>({...f,requirePasswordChange:v}))}  label="Force Password on First Login" sub="New users must change password" />
                <Toggle value={secSettings.logAllActions}          onChange={v=>setSecSettings(f=>({...f,logAllActions:v}))}          label="Log All User Actions"     sub="Record every action to audit log" />
                <div className="fg" style={{ marginTop:14 }}>
                  <label className="flabel">Max Login Attempts Before Lockout</label>
                  <select className="sel" value={secSettings.loginAttempts} onChange={e=>setSecSettings(f=>({...f,loginAttempts:+e.target.value}))}>
                    {[3,5,10].map(n=><option key={n} value={n}>{n} attempts</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="flabel">Minimum Password Length</label>
                  <select className="sel" value={secSettings.passwordMinLength} onChange={e=>setSecSettings(f=>({...f,passwordMinLength:+e.target.value}))}>
                    {[6,8,10,12].map(n=><option key={n} value={n}>{n} characters</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label className="flabel">Session Timeout (minutes)</label>
                  <select className="sel" value={secSettings.sessionTimeoutMins} onChange={e=>setSecSettings(f=>({...f,sessionTimeoutMins:+e.target.value}))}>
                    {[15,30,60,120,480].map(n=><option key={n} value={n}>{n} min{n>60?` (${n/60}h)`:""}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-hd"><span className="card-title">⏰ Operating Hours Restriction</span></div>
              <div className="card-body">
                <Toggle value={secSettings.restrictedHoursEnabled} onChange={v=>setSecSettings(f=>({...f,restrictedHoursEnabled:v}))} label="Restrict Login Hours" sub="Block logins outside business hours" />
                {secSettings.restrictedHoursEnabled && (
                  <div className="frow" style={{ marginTop:12 }}>
                    <div className="fg"><label className="flabel">Open Hour</label>
                      <select className="sel" value={secSettings.openHour} onChange={e=>setSecSettings(f=>({...f,openHour:e.target.value}))}>
                        {Array.from({length:24},(_,i)=>String(i).padStart(2,"0")).map(h=><option key={h} value={h}>{h}:00</option>)}
                      </select>
                    </div>
                    <div className="fg"><label className="flabel">Close Hour</label>
                      <select className="sel" value={secSettings.closeHour} onChange={e=>setSecSettings(f=>({...f,closeHour:e.target.value}))}>
                        {Array.from({length:24},(_,i)=>String(i).padStart(2,"0")).map(h=><option key={h} value={h}>{h}:00</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="card" style={{ marginBottom:16 }}>
              <div className="card-hd"><span className="card-title">🌐 IP Whitelist</span></div>
              <div className="card-body">
                <div style={{ fontSize:12, color:C.textMuted, marginBottom:10 }}>Only allow logins from these IP addresses. Leave empty to allow all.</div>
                <div className="fg"><label className="flabel">Whitelisted IPs (comma-separated)</label><textarea className="inp" style={{ minHeight:80, fontFamily:"monospace", fontSize:12 }} value={secSettings.ipWhitelist} onChange={e=>setSecSettings(f=>({...f,ipWhitelist:e.target.value}))} placeholder="192.168.1.100, 41.90.x.x" /></div>
              </div>
            </div>

            <div className="card" style={{ marginBottom:16 }}>
              <div className="card-hd"><span className="card-title">🔐 Security Status</span></div>
              <div className="card-body">
                {[
                  { label:"2FA Enabled",          ok:secSettings.twoFactorAdmin },
                  { label:"Action Logging",        ok:secSettings.logAllActions },
                  { label:"Strong Passwords (8+)", ok:secSettings.passwordMinLength>=8 },
                  { label:"Short Sessions",        ok:secSettings.sessionTimeoutMins<=60 },
                  { label:"Login Attempt Limit",   ok:secSettings.loginAttempts<=5 },
                ].map(({ label, ok })=>(
                  <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderBottom:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:13 }}>{label}</span>
                    <span style={{ fontSize:18 }}>{ok?"✅":"⚠️"}</span>
                  </div>
                ))}
                <div style={{ marginTop:12, padding:"10px 12px", background:C.info+"18", borderRadius:8, fontSize:12, color:C.info }}>
                  Security score: <strong>{[secSettings.twoFactorAdmin,secSettings.logAllActions,secSettings.passwordMinLength>=8,secSettings.sessionTimeoutMins<=60,secSettings.loginAttempts<=5].filter(Boolean).length * 20}%</strong>
                </div>
              </div>
            </div>

            <button className="btn btn-primary" style={{ width:"100%", justifyContent:"center", padding:13 }} onClick={saveSecurity}>🛡️ Save Security Settings</button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          PASSWORDS — Password Backup & Security Management
      ══════════════════════════════════════════════════════ */}
      {tab==="passwords" && <PasswordBackupTab currentUser={currentUser} notify={notify} users={users} />}

      {/* ══════════════════════════════════════════════════════
          BACKUP
      ══════════════════════════════════════════════════════ */}
      {tab==="backup" && (
        <div>
          {/* ── Top row: Export + Restore ── */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
            <div className="card">
              <div className="card-hd"><span className="card-title">💾 Export Backup</span></div>
              <div className="card-body">
                <div style={{ textAlign:"center", padding:"20px 0" }}>
                  <div style={{ fontSize:52, marginBottom:12 }}>🗄️</div>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Download Full Data Backup</div>
                  <div style={{ fontSize:12, color:C.textMuted, marginBottom:20, lineHeight:1.6 }}>Exports all ERP data as a JSON file. Store it safely in Google Drive or local storage.</div>
                  <button className="btn btn-primary" style={{ padding:"12px 36px", fontSize:14 }} onClick={backupData}>⬇️ Download Backup</button>
                </div>
                <div style={{ padding:14, background:C.surfaceAlt, borderRadius:10, border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:11, color:C.textMuted, fontWeight:700, marginBottom:8, textTransform:"uppercase", letterSpacing:1 }}>Backup includes</div>
                  {["✅ All sales & receipts","✅ Product inventory","✅ Customer records","✅ Supplier directory","✅ Expense records"].map((item,i)=>(
                    <div key={i} style={{ fontSize:12.5, padding:"4px 0", color:C.textMuted }}>{item}</div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="card" style={{ marginBottom:16 }}>
                <div className="card-hd"><span className="card-title">♻️ Restore from Backup</span></div>
                <div className="card-body">
                  <div style={{ textAlign:"center", padding:"16px 0" }}>
                    <div style={{ fontSize:48, marginBottom:12 }}>📂</div>
                    <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Select Backup File</div>
                    <div style={{ fontSize:12, color:C.textMuted, marginBottom:20 }}>Choose a <span style={{color:C.accent}}>.json</span> backup file.</div>
                    <label style={{ display:"inline-block" }}>
                      <input type="file" accept=".json" onChange={e=>{
                        const file=e.target.files[0]; if (!file) return;
                        const reader=new FileReader();
                        reader.onload=evt=>{ try { const p=JSON.parse(evt.target.result); notify(`Backup from ${p.exportedAt?.split("T")[0]} by ${p.exportedBy||"unknown"} loaded. Contact developer to restore.`,"info"); } catch { notify("Invalid backup file","error"); } };
                        reader.readAsText(file);
                      }} style={{ display:"none" }} />
                      <span className="btn btn-outline" style={{ padding:"12px 28px", fontSize:14, cursor:"pointer" }}>📁 Choose File</span>
                    </label>
                  </div>
                  <div style={{ padding:12, background:C.danger+"18", borderRadius:8, border:`1px solid ${C.danger}44` }}>
                    <div style={{ fontSize:12, color:C.danger, fontWeight:700, marginBottom:4 }}>⚠️ Developer Required</div>
                    <div style={{ fontSize:12, color:C.textMuted }}>Restoring requires direct database access. Share the backup file with your developer.</div>
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-hd"><span className="card-title">📅 Backup Schedule</span></div>
                <div className="card-body">
                  {[["Daily","🟢","High transaction volume"],["Weekly","🟡","Normal operations"],["Monthly","🔴","Minimum recommended"]].map(([label,dot,note])=>(
                    <div key={label} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
                      <span style={{ fontSize:16 }}>{dot}</span>
                      <div><div style={{ fontWeight:600, fontSize:13 }}>{label} Backup</div><div style={{ fontSize:11, color:C.textMuted }}>{note}</div></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── WIPE PANEL ── */}
          <WipePanel notify={notify} currentUser={currentUser} />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          AUDIT LOG
      ══════════════════════════════════════════════════════ */}
      {tab==="audit" && (
        <div className="card">
          <div className="card-hd">
            <span className="card-title">📋 Full Audit Log ({auditLog.length} events)</span>
            <button className="btn btn-ghost btn-sm" onClick={()=>{
              const csv=["Time,User,Action,Details",...auditLog.map(a=>`"${new Date(a.created_at).toLocaleString()}","${a.user_name}","${a.action}","${a.details||""}"`)].join("\n");
              const blob=new Blob([csv],{type:"text/csv"});
              const url=URL.createObjectURL(blob);
              const el=document.createElement("a"); el.href=url; el.download="VES_Audit_Log.csv"; el.click();
              URL.revokeObjectURL(url); notify("Audit log exported ✅");
            }}>📄 Export CSV</button>
          </div>
          {loading ? <Loading /> : auditLog.length===0 ? <div className="empty-state" style={{padding:30}}><div className="es-icon">📋</div><p>No activity recorded yet.</p></div> : (
            <div style={{ maxHeight:600, overflowY:"auto" }}>
              {auditLog.map((a,i)=>{
                const isCreate = a.action?.includes("CREATE")||a.action?.includes("LOGIN")||a.action?.includes("RECEIVE");
                const isDelete = a.action?.includes("DELETE")||a.action?.includes("DEACTIVATE")||a.action?.includes("DAMAGE");
                const isOp     = a.action?.includes("SALE")||a.action?.includes("ASSIGN")||a.action?.includes("SOLD");
                const color    = isCreate?C.success:isDelete?C.danger:isOp?C.info:C.textMuted;
                return (
                  <div key={i} style={{ display:"flex", gap:12, padding:"10px 16px", borderBottom:`1px solid ${C.border}`, alignItems:"flex-start" }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:color, marginTop:5, flexShrink:0 }} />
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span style={{ fontSize:13, fontWeight:600, color }}>{a.action?.replace(/_/g," ")}</span>
                        <span style={{ fontSize:10, color:C.textMuted, fontFamily:"monospace" }}>{new Date(a.created_at).toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize:11, color:C.textMuted, marginTop:1 }}>By: <strong>{a.user_name}</strong>{a.table_name&&` · ${a.table_name}`}{a.details&&` · ${a.details}`}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ MODALS ═══════════════════ */}

      {/* User modal */}
      {userModal && (
        <Overlay onClose={()=>setUserModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd">
              <span className="modal-title">{editUser?"✏️ Edit User":"👤 Create User Account"}</span>
              <button className="modal-close" onClick={()=>setUserModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="fg"><label className="flabel">Full Name *</label><input className="inp" value={userForm.name} onChange={e=>setUserForm(f=>({...f,name:e.target.value}))} placeholder="John Kamau" /></div>
              <div className="frow">
                <div className="fg"><label className="flabel">Username *</label><input className="inp" value={userForm.username} onChange={e=>setUserForm(f=>({...f,username:e.target.value}))} disabled={!!editUser} /></div>
                {!editUser && <div className="fg"><label className="flabel">Password *</label>
                  <div style={{ position:"relative" }}>
                    <input className="inp" type={showPw?"text":"password"} value={userForm.password} onChange={e=>setUserForm(f=>({...f,password:e.target.value}))} style={{ paddingRight:40 }} />
                    <button onClick={()=>setShowPw(v=>!v)} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:14, color:C.textMuted }}>{showPw?"🙈":"👁️"}</button>
                  </div>
                </div>}
              </div>
              <div className="frow">
                <div className="fg"><label className="flabel">Role</label>
                  <select className="sel" value={userForm.role} onChange={e=>setUserForm(f=>({...f,role:e.target.value}))}>
                    <option>Admin</option><option>Manager</option><option>Cashier</option>
                  </select>
                </div>
                <div className="fg"><label className="flabel">Branch</label>
                  <select className="sel" value={userForm.branch} onChange={e=>setUserForm(f=>({...f,branch:e.target.value}))}>
                    {branches.map(b=><option key={b.id}>{b.name}</option>)}
                    <option>All Branches</option>
                  </select>
                </div>
              </div>
              {userForm.role && (
                <div style={{ padding:"10px 12px", background:C.surfaceAlt, borderRadius:8, fontSize:12, color:C.textMuted }}>
                  <strong>{userForm.role} access:</strong> {Object.entries(moduleAccess[userForm.role]||{}).filter(([,v])=>v).map(([k])=>k).join(", ")||"No modules"}
                </div>
              )}
            </div>
            <div className="modal-ft">
              <button className="btn btn-ghost" onClick={()=>setUserModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveUser} disabled={saving}>{saving?<><Spinner/>Saving...</>:editUser?"Save Changes":"Create Account"}</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Password modal */}
      {pwModal && (
        <Overlay onClose={()=>setPwModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd">
              <span className="modal-title">🔑 Change Password {pwTarget?.name?`— ${pwTarget.name}`:""}</span>
              <button className="modal-close" onClick={()=>setPwModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="fg"><label className="flabel">Current Password</label><input className="inp" type="password" value={pwForm.currentPassword} onChange={e=>setPwForm(f=>({...f,currentPassword:e.target.value}))} /></div>
              <div className="fg"><label className="flabel">New Password (min {secSettings.passwordMinLength} chars)</label><input className="inp" type="password" value={pwForm.newPassword} onChange={e=>setPwForm(f=>({...f,newPassword:e.target.value}))} /></div>
              <div className="fg"><label className="flabel">Confirm New Password</label>
                <input className="inp" type="password" value={pwForm.confirm} onChange={e=>setPwForm(f=>({...f,confirm:e.target.value}))} />
                {pwForm.confirm&&pwForm.newPassword!==pwForm.confirm&&<div style={{fontSize:11,color:C.danger,marginTop:4}}>⚠️ Passwords don't match</div>}
              </div>
              {pwForm.newPassword && (
                <div style={{ padding:"8px 12px", background:C.surfaceAlt, borderRadius:8, fontSize:12 }}>
                  Strength: {pwForm.newPassword.length<secSettings.passwordMinLength?<span style={{color:C.danger}}>Too short</span>:pwForm.newPassword.length<10?<span style={{color:C.warning}}>Moderate</span>:<span style={{color:C.success}}>Strong</span>}
                </div>
              )}
            </div>
            <div className="modal-ft">
              <button className="btn btn-ghost" onClick={()=>setPwModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={changePassword} disabled={saving||pwForm.newPassword!==pwForm.confirm||pwForm.newPassword.length<secSettings.passwordMinLength}>{saving?<><Spinner/>Saving...</>:"Change Password"}</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Branch modal */}
      {branchModal && (
        <Overlay onClose={()=>setBranchModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd">
              <span className="modal-title">{editBranchId?"✏️ Edit Branch":"📍 Add New Branch"}</span>
              <button className="modal-close" onClick={()=>setBranchModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="fg"><label className="flabel">Branch Name *</label><input className="inp" value={branchForm.name} onChange={e=>setBranchForm(f=>({...f,name:e.target.value}))} placeholder="e.g. East Branch" /></div>
              <div className="fg"><label className="flabel">Address</label><input className="inp" value={branchForm.address} onChange={e=>setBranchForm(f=>({...f,address:e.target.value}))} /></div>
              <div className="frow">
                <div className="fg"><label className="flabel">Phone</label><input className="inp" value={branchForm.phone} onChange={e=>setBranchForm(f=>({...f,phone:e.target.value}))} /></div>
                <div className="fg"><label className="flabel">Email</label><input className="inp" value={branchForm.email} onChange={e=>setBranchForm(f=>({...f,email:e.target.value}))} /></div>
              </div>
              <div className="fg"><label className="flabel">Branch Manager</label><input className="inp" value={branchForm.manager} onChange={e=>setBranchForm(f=>({...f,manager:e.target.value}))} /></div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-ghost" onClick={()=>setBranchModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveBranch}>Save Branch</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}


// ─── STOCK TRANSFER ───────────────────────────────────────────────────────────
function StockTransfer({ data, setData, notify }) {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [form, setForm]  = useState({ productId:"", qty:"", from:"Main Branch", notes:"" });
  const [showForm, setShowForm] = useState(false);

  const to = form.from === "Main Branch" ? "Juja Branch" : "Main Branch";
  const product = data.products.find(p => p.id === form.productId || p.id === +form.productId);
  const available = product ? (form.from === "Main Branch" ? product.mainBranch : product.westBranch) : 0;

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await transfersAPI.list(); setTransfers(r.data||[]); }
    catch(e) { notify(e.message,"error"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const doTransfer = async () => {
    if (!form.productId || !form.qty || +form.qty <= 0) return;
    if (+form.qty > available) { notify(`Only ${available} units available`, "error"); return; }
    try {
      await transfersAPI.create({ productId:form.productId, qty:+form.qty, fromBranch:form.from, toBranch:to, notes:form.notes });
      setData(d => ({
        ...d,
        products: d.products.map(p => {
          if (p.id !== form.productId && p.id !== +form.productId) return p;
          if (form.from === "Main Branch") return { ...p, mainBranch:p.mainBranch - +form.qty, westBranch:p.westBranch + +form.qty };
          return { ...p, westBranch:p.westBranch - +form.qty, mainBranch:p.mainBranch + +form.qty };
        })
      }));
      notify(`✅ Transferred ${form.qty}× ${product.name} → ${to}`);
      setShowForm(false); setForm({ productId:"", qty:"", from:"Main Branch", notes:"" }); load();
    } catch(e) { notify(e.message,"error"); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this transfer record?")) return;
    try { await transfersAPI.delete(id); setTransfers(t => t.filter(x => x.id !== id)); notify("Transfer deleted"); }
    catch(e) { notify(e.message,"error"); }
  };

  return (
    <div className="fade-in">
      <div className="stats-grid" style={{ gridTemplateColumns:"repeat(3,1fr)" }}>
        <div className="stat-card blue"><div className="stat-icon-box" style={{ background:C.infoDim, marginBottom:10 }}>🏢</div><div className="stat-value" style={{ color:C.info, fontSize:22 }}>{data.products.reduce((s,p)=>s+p.mainBranch,0)}</div><div className="stat-label">Main Branch Stock</div></div>
        <div className="stat-card green"><div className="stat-icon-box" style={{ background:C.successDim, marginBottom:10 }}>🏪</div><div className="stat-value" style={{ color:C.success, fontSize:22 }}>{data.products.reduce((s,p)=>s+p.westBranch,0)}</div><div className="stat-label">Juja Branch Stock</div></div>
        <div className="stat-card gold"><div className="stat-icon-box" style={{ background:C.warningDim, marginBottom:10 }}>🔄</div><div className="stat-value" style={{ color:C.accent, fontSize:22 }}>{transfers.length}</div><div className="stat-label">Total Transfers</div></div>
      </div>
      <div className="card">
        <div className="card-hd"><span className="card-title">🔄 Stock Transfers</span><button className="btn btn-primary" onClick={()=>setShowForm(true)}>+ New Transfer</button></div>
        {loading ? <Loading /> : (
          <table>
            <thead><tr><th>Date</th><th>Product</th><th>Qty</th><th>From</th><th>To</th><th>By</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {transfers.length===0 && <tr><td colSpan={8}><div className="empty-state"><div className="es-icon">🔄</div><p>No transfers yet</p></div></td></tr>}
              {transfers.map((t,i)=>(
                <tr key={i}>
                  <td className="mono" style={{ fontSize:11, color:C.textMuted }}>{new Date(t.created_at).toLocaleDateString()}</td>
                  <td style={{ fontWeight:600 }}>{t.product_name}</td>
                  <td className="mono" style={{ color:C.accent, fontWeight:700 }}>{t.qty}</td>
                  <td><Badge label={t.from_branch} type="b-danger" /></td>
                  <td><Badge label={t.to_branch} type="b-success" /></td>
                  <td style={{ fontSize:12, color:C.textDim }}>{t.transferred_by_name||"—"}</td>
                  <td style={{ fontSize:12, color:C.textDim }}>{t.notes||"—"}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={()=>del(t.id)}>🗑️</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showForm && (
        <Overlay onClose={()=>setShowForm(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">🔄 Transfer Stock Between Branches</div>
            <div className="fg"><label className="flabel">From Branch</label>
              <select className="sel" value={form.from} onChange={e=>setForm(f=>({...f,from:e.target.value}))}>
                <option>Main Branch</option><option>Juja Branch</option>
              </select>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"8px 0", fontSize:22, color:C.accent }}>↓ → {to}</div>
            <div className="fg"><label className="flabel">Product</label>
              <select className="sel" value={form.productId} onChange={e=>setForm(f=>({...f,productId:e.target.value}))}>
                <option value="">Select product...</option>
                {data.products.map(p=><option key={p.id} value={p.id}>{p.name} (Avail: {form.from==="Main Branch"?p.mainBranch:p.westBranch})</option>)}
              </select>
            </div>
            {product && <div style={{ padding:"8px 12px", background:C.surfaceAlt, borderRadius:8, marginBottom:12, fontSize:12, color:C.textDim }}>Available at {form.from}: <span style={{ color:C.accent, fontWeight:700 }}>{available} units</span></div>}
            <div className="fg"><label className="flabel">Quantity to Transfer</label>
              <input className="inp" type="number" min="1" max={available} value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} placeholder={`Max ${available}`} />
            </div>
            <div className="fg"><label className="flabel">Notes (optional)</label><input className="inp" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Reason for transfer..." /></div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={doTransfer} disabled={!form.productId||!form.qty||+form.qty>available}>✅ Transfer Stock</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── DEBT / CREDIT TRACKER ────────────────────────────────────────────────────
function DebtTracker({ notify }) {
  const [debts, setDebts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [payModal, setPayModal] = useState(null);
  const [form, setForm]     = useState({ customerName:"", phone:"", amount:"", description:"", dueDate:"", branch:"Main Branch" });
  const [payAmount, setPayAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await debtsAPI.list(); setDebts(r.data||[]); }
    catch(e) { notify(e.message,"error"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.customerName || !form.amount) return;
    setSaving(true);
    try {
      await debtsAPI.create(form);
      notify("Debt record created ✅");
      setShowForm(false); setForm({ customerName:"", phone:"", amount:"", description:"", dueDate:"", branch:"Main Branch" });
      load();
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const recordPayment = async () => {
    if (!payAmount || +payAmount <= 0) return;
    setSaving(true);
    try {
      await debtsAPI.pay(payModal.id, +payAmount);
      notify("Payment recorded ✅");
      setPayModal(null); setPayAmount(""); load();
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const totalOwed = debts.filter(d=>d.status!=="Paid").reduce((s,d)=>s+(parseFloat(d.amount)-parseFloat(d.paid)),0);
  const totalPaid = debts.reduce((s,d)=>s+parseFloat(d.paid||0),0);
  const overdue   = debts.filter(d=>d.status!=="Paid"&&d.due_date&&d.due_date.split("T")[0]<today()).length;

  return (
    <div className="fade-in">
      <div className="stats-grid" style={{ gridTemplateColumns:"repeat(3,1fr)" }}>
        <div className="stat-card red"><div className="stat-icon-box" style={{ background:C.dangerDim, marginBottom:10 }}>💳</div><div className="stat-value" style={{ color:C.danger, fontSize:20 }}>{fmtKsh(totalOwed)}</div><div className="stat-label">Total Outstanding</div></div>
        <div className="stat-card green"><div className="stat-icon-box" style={{ background:C.successDim, marginBottom:10 }}>✅</div><div className="stat-value" style={{ color:C.success, fontSize:20 }}>{fmtKsh(totalPaid)}</div><div className="stat-label">Total Collected</div></div>
        <div className="stat-card gold"><div className="stat-icon-box" style={{ background:C.warningDim, marginBottom:10 }}>⏰</div><div className="stat-value" style={{ color:C.accent, fontSize:22 }}>{overdue}</div><div className="stat-label">Overdue Accounts</div></div>
      </div>

      <div className="card">
        <div className="card-hd"><span className="card-title">💳 Debt & Credit Records</span><button className="btn btn-primary" onClick={()=>setShowForm(true)}>+ Add Debt Record</button></div>
        {loading ? <Loading /> : (
          <table>
            <thead><tr><th>Customer</th><th>Phone</th><th>Description</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Due Date</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {debts.length===0 && <tr><td colSpan={9}><div className="empty-state"><div className="es-icon">💳</div><p>No debt records yet</p></div></td></tr>}
              {debts.map(d=>{
                const bal = parseFloat(d.amount)-parseFloat(d.paid||0);
                const due = d.due_date?.split("T")[0];
                return (
                  <tr key={d.id}>
                    <td style={{ fontWeight:600 }}>{d.customer_name}</td>
                    <td className="mono" style={{ fontSize:12 }}>{d.phone}</td>
                    <td style={{ fontSize:12, color:C.textDim }}>{d.description}</td>
                    <td className="mono" style={{ color:C.danger }}>{fmtKsh(d.amount)}</td>
                    <td className="mono" style={{ color:C.success }}>{fmtKsh(d.paid)}</td>
                    <td className="mono" style={{ fontWeight:700, color:bal>0?C.warning:C.success }}>{fmtKsh(bal)}</td>
                    <td className="mono" style={{ fontSize:11, color:due&&due<today()&&d.status!=="Paid"?C.danger:C.textMuted }}>{due||"—"}</td>
                    <td><Badge label={d.status} type={d.status==="Paid"?"b-success":d.status==="Partial"?"b-warning":"b-danger"} /></td>
                    <td>{d.status!=="Paid" && <button className="btn btn-success btn-sm" onClick={()=>{setPayModal(d);setPayAmount("");}}>💰 Pay</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Overlay onClose={()=>setShowForm(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">💳 Add Debt Record</div>
            <div className="frow">
              <div className="fg"><label className="flabel">Customer Name *</label><input className="inp" value={form.customerName} onChange={e=>setForm(f=>({...f,customerName:e.target.value}))} /></div>
              <div className="fg"><label className="flabel">Phone</label><input className="inp" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="+254..." /></div>
            </div>
            <div className="frow">
              <div className="fg"><label className="flabel">Amount Owed (KSh) *</label><input className="inp" type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} /></div>
              <div className="fg"><label className="flabel">Due Date</label><input className="inp" type="date" value={form.dueDate} onChange={e=>setForm(f=>({...f,dueDate:e.target.value}))} /></div>
            </div>
            <div className="fg"><label className="flabel">Description / Items</label><input className="inp" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="e.g. iPhone 15 Pro on credit" /></div>
            <div className="fg"><label className="flabel">Branch</label><select className="sel" value={form.branch} onChange={e=>setForm(f=>({...f,branch:e.target.value}))}><option>Main Branch</option><option>Juja Branch</option></select></div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><Spinner/>Saving...</>:"Save Record"}</button>
            </div>
          </div>
        </Overlay>
      )}

      {payModal && (
        <Overlay onClose={()=>setPayModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">💰 Record Payment — {payModal.customer_name}</div>
            <div style={{ padding:"12px 16px", background:C.surfaceAlt, borderRadius:10, marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}><span style={{ color:C.textMuted }}>Total Debt</span><span className="mono">{fmtKsh(payModal.amount)}</span></div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}><span style={{ color:C.textMuted }}>Already Paid</span><span className="mono" style={{ color:C.success }}>{fmtKsh(payModal.paid)}</span></div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:15, fontWeight:700, marginTop:8, color:C.danger }}><span>Balance</span><span className="mono">{fmtKsh(parseFloat(payModal.amount)-parseFloat(payModal.paid))}</span></div>
            </div>
            <div className="fg"><label className="flabel">Payment Amount (KSh)</label><input className="inp" type="number" value={payAmount} onChange={e=>setPayAmount(e.target.value)} autoFocus /></div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setPayModal(null)}>Cancel</button>
              <button className="btn btn-success" onClick={recordPayment} disabled={saving}>{saving?<><Spinner/>Saving...</>:"✅ Record Payment"}</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── CASH REGISTER ────────────────────────────────────────────────────────────
function CashRegister({ data, user, branch, notify }) {
  const [register, setRegister] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [openModal, setOpenModal]   = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [openForm, setOpenForm]   = useState({ float:"", branch: branch==="main"?"Main Branch":"Juja Branch" });
  const [closeForm, setCloseForm] = useState({ cash:"", notes:"" });

  const branchName = branch==="main" ? "Main Branch" : branch==="west" ? "Juja Branch" : "Main Branch";

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await registerAPI.today(branchName); setRegister(r.data); }
    catch(e) { notify(e.message,"error"); }
    setLoading(false);
  }, [branchName]);

  useEffect(() => { load(); }, [load]);

  const openRegister = async () => {
    if (!openForm.float) return;
    setSaving(true);
    try {
      const r = await registerAPI.open({ openingFloat:+openForm.float, branch:openForm.branch });
      setRegister(r.data); setOpenModal(false); notify("Cash register opened ✅");
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const closeRegister = async () => {
    if (!closeForm.cash) return;
    setSaving(true);
    try {
      const r = await registerAPI.close(register.id, { closingCash:+closeForm.cash, notes:closeForm.notes });
      setRegister(r.data); setCloseModal(false); notify("Cash register closed ✅");
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const todaySales = data.sales.filter(s => s.date===today() && s.payMethod==="Cash").reduce((a,b)=>a+b.total,0);
  const openingFloat = parseFloat(register?.opening_float||0);
  const expected = openingFloat + todaySales;
  const closingCash = parseFloat(register?.closing_cash||0);
  const variance = register?.closing_cash != null ? closingCash - expected : null;

  const isOpen   = register?.status === "Open";
  const isClosed = register?.status === "Closed";

  return (
    <div className="fade-in">
      {loading ? <Loading /> : (
        <div className="g2" style={{ marginBottom:20 }}>
          <div className="card">
            <div className="card-hd"><span className="card-title">🏧 Today's Register — {today()}</span></div>
            <div className="card-body" style={{ textAlign:"center" }}>
              <div style={{ fontSize:64, marginBottom:12 }}>{isOpen?"🟢":isClosed?"🔴":"⚪"}</div>
              <div style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:700, fontSize:20, marginBottom:4 }}>
                {isOpen?"REGISTER OPEN":isClosed?"REGISTER CLOSED":"NOT OPENED YET"}
              </div>
              {register?.created_at && <div style={{ fontSize:12, color:C.textMuted, fontFamily:"'JetBrains Mono',monospace" }}>Opened: {new Date(register.created_at).toLocaleTimeString()} by {register.opened_by_name}</div>}
              {register?.closed_at  && <div style={{ fontSize:12, color:C.textMuted, fontFamily:"'JetBrains Mono',monospace" }}>Closed: {new Date(register.closed_at).toLocaleTimeString()}</div>}
              <div style={{ marginTop:20, display:"flex", gap:10, justifyContent:"center" }}>
                {!register && <button className="btn btn-success" style={{ padding:"10px 28px" }} onClick={()=>setOpenModal(true)}>🔓 Open Register</button>}
                {isOpen && <button className="btn btn-danger" style={{ padding:"10px 28px" }} onClick={()=>setCloseModal(true)}>🔒 Close Register</button>}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-hd"><span className="card-title">💰 Cash Summary</span></div>
            <div className="card-body">
              {[
                ["Opening Float",    fmtKsh(openingFloat), C.info],
                ["Cash Sales Today", fmtKsh(todaySales),   C.success],
                ["Expected in Drawer",fmtKsh(expected),    C.accent],
                ["Closing Count",    register?.closing_cash!=null ? fmtKsh(closingCash) : "Not closed yet", C.textDim],
                ["Variance",         variance!==null ? fmtKsh(variance) : "—", variance===null?C.textDim:variance>=0?C.success:C.danger],
              ].map(([label,value,color],i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:`1px solid rgba(26,45,74,.4)` }}>
                  <span style={{ fontSize:13, color:C.textMuted }}>{label}</span>
                  <span className="mono" style={{ fontSize:13, fontWeight:600, color }}>{value}</span>
                </div>
              ))}
              {register?.notes && <div style={{ marginTop:12, padding:10, background:C.surfaceAlt, borderRadius:8, fontSize:12, color:C.textDim }}>📝 {register.notes}</div>}
            </div>
          </div>
        </div>
      )}

      {openModal && (
        <Overlay onClose={()=>setOpenModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">🔓 Open Cash Register</div>
            <div className="fg"><label className="flabel">Opening Float (KSh) *</label><input className="inp" type="number" value={openForm.float} onChange={e=>setOpenForm(f=>({...f,float:e.target.value}))} placeholder="e.g. 5000" autoFocus /></div>
            <div className="fg"><label className="flabel">Branch</label><select className="sel" value={openForm.branch} onChange={e=>setOpenForm(f=>({...f,branch:e.target.value}))}><option>Main Branch</option><option>Juja Branch</option></select></div>
            <div style={{ padding:"10px 12px", background:C.infoDim, borderRadius:8, fontSize:12, color:C.info, marginBottom:8 }}>Opening as: <strong>{user.name}</strong> · {new Date().toLocaleTimeString()}</div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setOpenModal(false)}>Cancel</button>
              <button className="btn btn-success" onClick={openRegister} disabled={saving}>{saving?<><Spinner/>Opening...</>:"🔓 Open Register"}</button>
            </div>
          </div>
        </Overlay>
      )}

      {closeModal && (
        <Overlay onClose={()=>setCloseModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">🔒 Close Cash Register</div>
            <div style={{ padding:"10px 12px", background:C.surfaceAlt, borderRadius:8, marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13 }}><span style={{ color:C.textMuted }}>Expected in Drawer</span><span className="mono" style={{ color:C.accent }}>{fmtKsh(expected)}</span></div>
            </div>
            <div className="fg"><label className="flabel">Actual Cash Count (KSh) *</label><input className="inp" type="number" value={closeForm.cash} onChange={e=>setCloseForm(f=>({...f,cash:e.target.value}))} autoFocus /></div>
            {closeForm.cash && <div style={{ padding:"8px 12px", borderRadius:8, marginBottom:12, background:+closeForm.cash>=expected?C.successDim:C.dangerDim, fontSize:13, fontWeight:600, color:+closeForm.cash>=expected?C.success:C.danger }}>
              Variance: {fmtKsh(+closeForm.cash-expected)} {+closeForm.cash>=expected?"(surplus)":"(shortage)"}
            </div>}
            <div className="fg"><label className="flabel">Closing Notes</label><textarea className="textarea" style={{ minHeight:60 }} value={closeForm.notes} onChange={e=>setCloseForm(f=>({...f,notes:e.target.value}))} /></div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setCloseModal(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={closeRegister} disabled={saving}>{saving?<><Spinner/>Closing...</>:"🔒 Close Register"}</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── SALES RETURNS / REFUNDS ──────────────────────────────────────────────────
function SalesReturns({ data, setData, notify }) {
  const [returns, setReturns]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ receiptNo:"", reason:"Defective", refundMethod:"Cash", notes:"" });
  const [foundSale, setFoundSale]     = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await returnsAPI.list(); setReturns(r.data||[]); }
    catch(e) { notify(e.message,"error"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const searchSale = () => {
    const s = data.sales.find(x => x.receiptNo?.toLowerCase() === form.receiptNo.toLowerCase());
    if (!s) { notify("Receipt not found in current session. Check the receipt number.", "error"); return; }
    setFoundSale(s);
    setSelectedItems(s.items.map(i => ({ ...i, returnQty:0 })));
  };

  const totalRefund = selectedItems.reduce((s,i) => s + i.returnQty * i.price, 0);

  const processReturn = async () => {
    if (!foundSale || totalRefund === 0) return;
    setSaving(true);
    try {
      await returnsAPI.create({
        receiptNo: foundSale.receiptNo, saleId: foundSale.id,
        customer: foundSale.customerName,
        items: selectedItems.filter(i=>i.returnQty>0),
        refundAmount: totalRefund, reason: form.reason,
        refundMethod: form.refundMethod, notes: form.notes,
        branch: foundSale.branch
      });
      // Update local stock
      setData(d => ({
        ...d,
        products: d.products.map(p => {
          const item = selectedItems.find(i => i.productId===p.id && i.returnQty>0);
          if (!item) return p;
          return foundSale.branch==="Main Branch" ? { ...p, mainBranch:p.mainBranch+item.returnQty } : { ...p, westBranch:p.westBranch+item.returnQty };
        })
      }));
      notify(`✅ Refund of ${fmtKsh(totalRefund)} processed`);
      setShowForm(false); setFoundSale(null); setSelectedItems([]);
      setForm({ receiptNo:"", reason:"Defective", refundMethod:"Cash", notes:"" });
      load();
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const totalRefunded = returns.reduce((s,r) => s+parseFloat(r.refund_amount||0), 0);

  const del = async (id) => {
    if (!window.confirm("Delete this return record?")) return;
    try { await returnsAPI.delete(id); setReturns(r => r.filter(x => x.id !== id)); notify("Return deleted"); }
    catch(e) { notify(e.message,"error"); }
  };

  return (
    <div className="fade-in">
      <div className="stats-grid" style={{ gridTemplateColumns:"repeat(3,1fr)" }}>
        <div className="stat-card red"><div className="stat-icon-box" style={{ background:C.dangerDim, marginBottom:10 }}>↩️</div><div className="stat-value" style={{ color:C.danger, fontSize:22 }}>{returns.length}</div><div className="stat-label">Total Returns</div></div>
        <div className="stat-card gold"><div className="stat-icon-box" style={{ background:C.warningDim, marginBottom:10 }}>💸</div><div className="stat-value" style={{ color:C.accent, fontSize:20 }}>{fmtKsh(totalRefunded)}</div><div className="stat-label">Total Refunded</div></div>
        <div className="stat-card blue"><div className="stat-icon-box" style={{ background:C.infoDim, marginBottom:10 }}>📦</div><div className="stat-value" style={{ color:C.info, fontSize:22 }}>{returns.reduce((s,r)=>s+(r.items||[]).reduce((a,i)=>a+(i.returnQty||0),0),0)}</div><div className="stat-label">Units Returned</div></div>
      </div>

      <div className="card">
        <div className="card-hd"><span className="card-title">↩️ Returns & Refunds</span><button className="btn btn-primary" onClick={()=>setShowForm(true)}>+ Process Return</button></div>
        {loading ? <Loading /> : (
          <table>
            <thead><tr><th>Date</th><th>Receipt</th><th>Customer</th><th>Items Returned</th><th>Refund</th><th>Reason</th><th>Method</th><th></th></tr></thead>
            <tbody>
              {returns.length===0 && <tr><td colSpan={8}><div className="empty-state"><div className="es-icon">↩️</div><p>No returns yet</p></div></td></tr>}
              {returns.map((r,i)=>(
                <tr key={i}>
                  <td className="mono" style={{ fontSize:11, color:C.textMuted }}>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="mono" style={{ color:C.accent, fontSize:11 }}>{r.receipt_no}</td>
                  <td style={{ fontWeight:600 }}>{r.customer_name}</td>
                  <td style={{ fontSize:12, color:C.textDim }}>{(r.items||[]).map(i=>`${i.name}×${i.returnQty}`).join(", ")}</td>
                  <td className="mono" style={{ color:C.danger, fontWeight:700 }}>{fmtKsh(r.refund_amount)}</td>
                  <td><Badge label={r.reason} type="b-warning" /></td>
                  <td><Badge label={r.refund_method} type="b-gray" /></td>
                  <td><button className="btn btn-danger btn-sm" onClick={()=>del(r.id)}>🗑️</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <Overlay onClose={()=>setShowForm(false)}>
          <div className="modal modal-lg" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">↩️ Process Sales Return</div>
            <div style={{ display:"flex", gap:10, marginBottom:14 }}>
              <input className="inp" value={form.receiptNo} onChange={e=>setForm(f=>({...f,receiptNo:e.target.value}))} placeholder="Enter Receipt No. e.g. RCP-0001" style={{ flex:1 }} />
              <button className="btn btn-outline" onClick={searchSale}>🔍 Search</button>
            </div>
            {foundSale && (
              <>
                <div style={{ padding:"10px 12px", background:C.surfaceAlt, borderRadius:8, marginBottom:14 }}>
                  <div style={{ fontSize:12, color:C.textMuted }}>Customer: <strong style={{ color:C.text }}>{foundSale.customerName}</strong> · Date: {foundSale.date} · Branch: {foundSale.branch}</div>
                </div>
                <div style={{ fontWeight:700, marginBottom:8, fontSize:13 }}>Select items to return:</div>
                {selectedItems.map((item,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:C.surfaceAlt, borderRadius:8, marginBottom:6 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{item.name}</div>
                      <div className="mono" style={{ fontSize:11, color:C.textMuted }}>Purchased: {item.qty} @ {fmtKsh(item.price)}</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:12, color:C.textMuted }}>Return qty:</span>
                      <input type="number" min="0" max={item.qty} className="inp" style={{ width:70 }} value={item.returnQty} onChange={e=>setSelectedItems(items=>items.map((x,j)=>j===i?{...x,returnQty:Math.min(+e.target.value,item.qty)}:x))} />
                    </div>
                    {item.returnQty>0 && <span className="mono" style={{ color:C.danger, fontSize:12 }}>-{fmtKsh(item.returnQty*item.price)}</span>}
                  </div>
                ))}
                <div className="frow" style={{ marginTop:12 }}>
                  <div className="fg"><label className="flabel">Return Reason</label><select className="sel" value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}><option>Defective</option><option>Wrong Item</option><option>Customer Changed Mind</option><option>Damaged in Transit</option><option>Other</option></select></div>
                  <div className="fg"><label className="flabel">Refund Method</label><select className="sel" value={form.refundMethod} onChange={e=>setForm(f=>({...f,refundMethod:e.target.value}))}><option>Cash</option><option>M-Pesa</option><option>Store Credit</option></select></div>
                </div>
                {totalRefund>0 && <div style={{ textAlign:"right", fontFamily:"'Clash Display',sans-serif", fontWeight:700, fontSize:18, color:C.danger, margin:"8px 0" }}>Refund Total: {fmtKsh(totalRefund)}</div>}
              </>
            )}
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={processReturn} disabled={!foundSale||totalRefund===0||saving}>{saving?<><Spinner/>Processing...</>:"↩️ Process Refund"}</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── STAFF TIME TRACKER ───────────────────────────────────────────────────────
function StaffTracker({ user, notify }) {
  const [logs, setLogs]       = useState([]);
  const [todayLog, setTodayLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [allRes, todayRes] = await Promise.all([timeLogsAPI.list(), timeLogsAPI.today()]);
      setLogs(allRes.data||[]);
      setTodayLog(todayRes.data||null);
    } catch(e) { notify(e.message,"error"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const clockIn = async () => {
    setSaving(true);
    try {
      await timeLogsAPI.clockIn({ branch: user.branch||"Main Branch" });
      notify("✅ Clocked in — " + new Date().toLocaleTimeString());
      load();
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const clockOut = async () => {
    setSaving(true);
    try {
      await timeLogsAPI.clockOut();
      notify("✅ Clocked out");
      load();
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const myLogs     = logs.filter(l => l.staff_name === user.name).slice(0,14);
  const totalHours = myLogs.reduce((s,l) => s + parseFloat(l.hours||0), 0);
  const daysWorked = myLogs.filter(l=>l.hours).length;
  const isOn       = todayLog && !todayLog.clock_out;
  const isDone     = todayLog && todayLog.clock_out;

  return (
    <div className="fade-in">
      {loading ? <Loading /> : (
        <>
          <div className="g2" style={{ marginBottom:20 }}>
            <div className="card">
              <div className="card-hd"><span className="card-title">⏱️ Today — {today()}</span></div>
              <div className="card-body" style={{ textAlign:"center" }}>
                <div style={{ fontSize:64, marginBottom:12 }}>{isDone?"🔴":isOn?"🟢":"⚪"}</div>
                <div style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:700, fontSize:18, marginBottom:8 }}>
                  {isDone?"SHIFT COMPLETE":isOn?"ON SHIFT":"NOT CLOCKED IN"}
                </div>
                {todayLog?.clock_in  && <div className="mono" style={{ fontSize:12, color:C.textMuted, marginBottom:4 }}>Clock In: {new Date(todayLog.clock_in).toLocaleTimeString()}</div>}
                {todayLog?.clock_out && <div className="mono" style={{ fontSize:12, color:C.textMuted, marginBottom:4 }}>Clock Out: {new Date(todayLog.clock_out).toLocaleTimeString()}</div>}
                {todayLog?.hours     && <div style={{ fontSize:20, fontWeight:700, color:C.success, margin:"12px 0" }}>{todayLog.hours} hrs worked</div>}
                <div style={{ display:"flex", gap:10, justifyContent:"center", marginTop:16 }}>
                  {!todayLog && <button className="btn btn-success" style={{ padding:"10px 28px" }} onClick={clockIn} disabled={saving}>{saving?<><Spinner/>...</>:"⏱️ Clock In"}</button>}
                  {isOn      && <button className="btn btn-danger"  style={{ padding:"10px 28px" }} onClick={clockOut} disabled={saving}>{saving?<><Spinner/>...</>:"⏹️ Clock Out"}</button>}
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-hd"><span className="card-title">📊 My Stats — Last 14 Days</span></div>
              <div className="card-body">
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
                  <div style={{ textAlign:"center" }}><div style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:700, fontSize:28, color:C.accent }}>{totalHours.toFixed(1)}</div><div style={{ fontSize:11, color:C.textMuted }}>Total Hours</div></div>
                  <div style={{ textAlign:"center" }}><div style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:700, fontSize:28, color:C.success }}>{daysWorked}</div><div style={{ fontSize:11, color:C.textMuted }}>Days Worked</div></div>
                  <div style={{ textAlign:"center" }}><div style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:700, fontSize:28, color:C.info }}>{daysWorked>0?(totalHours/daysWorked).toFixed(1):0}</div><div style={{ fontSize:11, color:C.textMuted }}>Avg hrs/day</div></div>
                </div>
                {myLogs.map((l,i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid rgba(26,45,74,.3)`, fontSize:12 }}>
                    <span className="mono" style={{ color:C.textMuted }}>{l.date}</span>
                    <span style={{ color:C.textDim }}>{new Date(l.clock_in).toLocaleTimeString()} → {l.clock_out?new Date(l.clock_out).toLocaleTimeString():"…"}</span>
                    <span className="mono" style={{ color:l.hours?C.success:C.warning }}>{l.hours?`${l.hours}h`:"active"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-hd"><span className="card-title">👥 All Staff Logs — Today</span></div>
            <table>
              <thead><tr><th>Staff</th><th>Role</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Status</th></tr></thead>
              <tbody>
                {logs.filter(l=>l.date===today()).length===0 && <tr><td colSpan={6}><div className="empty-state"><p>No clock-ins today yet</p></div></td></tr>}
                {logs.filter(l=>l.date===today()).map((l,i)=>(
                  <tr key={i}>
                    <td style={{ fontWeight:600 }}>{l.staff_name}</td>
                    <td><Badge label={l.staff_role||"Staff"} /></td>
                    <td className="mono" style={{ color:C.success, fontSize:12 }}>{new Date(l.clock_in).toLocaleTimeString()}</td>
                    <td className="mono" style={{ color:l.clock_out?C.danger:C.textMuted, fontSize:12 }}>{l.clock_out?new Date(l.clock_out).toLocaleTimeString():"—"}</td>
                    <td className="mono" style={{ fontWeight:600 }}>{l.hours?`${l.hours}h`:"—"}</td>
                    <td><Badge label={l.clock_out?"Done":"On Shift"} type={l.clock_out?"b-gray":"b-success"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── BARCODE SCANNER SUPPORT (added to Sales modal via useRef) ────────────────
// Barcode scanning is handled inside the Sales component via a hidden input
// that captures rapid keystrokes ending in Enter (standard barcode scanner behavior)
function BarcodeInput({ products, onScan }) {
  const [buffer, setBuffer] = useState("");
  const lastKey = useRef(Date.now());

  useEffect(() => {
    const handler = e => {
      const now = Date.now();
      if (now - lastKey.current > 300) setBuffer("");
      lastKey.current = now;
      if (e.key === "Enter" && buffer.length > 3) {
        const p = products.find(x => x.barcode === buffer || x.sku === buffer);
        if (p) onScan(p);
        setBuffer("");
      } else if (e.key.length === 1) {
        setBuffer(b => b + e.key);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [buffer, products, onScan]);

  return null; // invisible — listens globally
}

// ─── WHATSAPP RECEIPT HELPER ──────────────────────────────────────────────────
function shareWhatsApp(sale) {
  const biz = (() => { try { return JSON.parse(localStorage.getItem("ves_biz")||"{}"); } catch { return {}; } })();
  const name = biz.companyName || "VES CONNECTIONS LIMITED";
  const phone = biz.phone || "+254 700 000 000";
  const lines = [
    `🧾 *${name}*`,
    `Receipt: *${sale.receiptNo}*`,
    `Date: ${sale.date}`,
    `Customer: ${sale.customerName}`,
    ``,
    `*Items:*`,
    ...sale.items.map(i => `• ${i.name} ×${i.qty} @ KSh ${i.price.toLocaleString()} = KSh ${(i.qty*i.price).toLocaleString()}`),
    ``,
    sale.discount > 0 ? `Discount: -KSh ${sale.discount.toLocaleString()}` : null,
    `*TOTAL: KSh ${sale.total.toLocaleString()}*`,
    `Payment: ${sale.payMethod}`,
    ``,
    `Thank you for shopping with us! 😊`,
    phone,
  ].filter(Boolean).join("\n");
  window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, "_blank");
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

// ─── LOGISTICS & DELIVERY 🚚 ──────────────────────────────────────────────────
function Logistics({ data, user, notify }) {
  const [tab, setTab] = useState("deliveries");
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [trackModal, setTrackModal] = useState(null);
  const [form, setForm] = useState({ orderId:"", customerName:"", phone:"", address:"", courier:"", items:"", branch:"Main Branch", notes:"" });

  useEffect(() => {
    logisticsAPI.list().then(res => { setDeliveries(res.data || []); setLoading(false); })
      .catch(() => { setLoading(false); notify("Failed to load deliveries", "error"); });
  }, []);

  const statusColor = s => s==="Delivered"?"b-success":s==="In Transit"?"b-info":s==="Pending"?"b-warning":"b-danger";
  const statusFlow = ["Pending","Picked Up","In Transit","Out for Delivery","Delivered","Failed"];

  const [saving, setSaving] = useState(false);
  const create = async () => {
    if (!form.customerName || !form.address) return notify("Customer name and address required","error");
    setSaving(true);
    try {
      const res = await logisticsAPI.create({ customer_name:form.customerName, phone:form.phone, address:form.address, courier:form.courier, items:form.items, branch:form.branch, notes:form.notes, order_id:form.orderId||null });
      setDeliveries(d => [res.data, ...d]);
      setShowForm(false); setForm({ orderId:"", customerName:"", phone:"", address:"", courier:"", items:"", branch:"Main Branch", notes:"" });
      notify("Delivery note created — " + res.data.dn_number);
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const updateStatus = async (id, newStatus) => {
    try {
      const res = await logisticsAPI.updateStatus(id, newStatus);
      setDeliveries(d => d.map(x => x.id === id ? res.data : x));
      if (trackModal?.id === id) setTrackModal(res.data);
      notify(`Shipment → ${newStatus}`);
    } catch(e) { notify(e.message,"error"); }
  };

  const del = async id => {
    try {
      await logisticsAPI.delete(id);
      setDeliveries(d => d.filter(x => x.id !== id));
      notify("Delivery note deleted","error");
    } catch(e) { notify(e.message,"error"); }
  };

  const pending = deliveries.filter(d => d.status !== "Delivered" && d.status !== "Failed").length;
  const delivered = deliveries.filter(d => d.status === "Delivered").length;

  return (
    <div className="fade-in">
      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns:"repeat(4,1fr)", marginBottom:20 }}>
        <div className="stat-card blue"><div style={{ fontSize:28, marginBottom:8 }}>🚚</div><div className="stat-value" style={{ color:C.info }}>{deliveries.length}</div><div className="stat-label">Total Deliveries</div></div>
        <div className="stat-card gold"><div style={{ fontSize:28, marginBottom:8 }}>⏳</div><div className="stat-value" style={{ color:C.accent }}>{pending}</div><div className="stat-label">In Progress</div></div>
        <div className="stat-card green"><div style={{ fontSize:28, marginBottom:8 }}>✅</div><div className="stat-value" style={{ color:C.success }}>{delivered}</div><div className="stat-label">Delivered</div></div>
        <div className="stat-card red"><div style={{ fontSize:28, marginBottom:8 }}>❌</div><div className="stat-value" style={{ color:C.danger }}>{deliveries.filter(d=>d.status==="Failed").length}</div><div className="stat-label">Failed</div></div>
      </div>

      {/* Tab bar */}
      <div style={{ overflowX:"auto", marginBottom:20, paddingBottom:4 }}>
        <div style={{ display:"flex", gap:4, background:C.surfaceAlt, padding:4, borderRadius:10, minWidth:"max-content" }}>
          {[["deliveries","🚚","Delivery Notes"],["tracking","📡","Live Tracking"],["routes","🗺️","Routes"]].map(([k,icon,label]) => (
            <button key={k} onClick={()=>setTab(k)} style={{ padding:"8px 16px",borderRadius:7,border:"none",cursor:"pointer",background:tab===k?C.surface:"transparent",color:tab===k?C.text:C.textMuted,fontWeight:600,fontSize:12.5,fontFamily:"'Cabinet Grotesk',sans-serif",boxShadow:tab===k?"0 1px 4px rgba(0,0,0,.3)":"none",transition:"all .15s",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5 }}>
              <span>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === "deliveries" && (
        <div className="card">
          <div className="card-hd">
            <span className="card-title">📋 Delivery Notes</span>
            <button className="btn btn-primary" onClick={()=>setShowForm(true)}>+ New Delivery</button>
          </div>
          {deliveries.length === 0 ? (
            <div className="empty-state"><div className="es-icon">🚚</div><p>No delivery notes yet. Create one to start tracking shipments.</p></div>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>DN #</th><th>Date</th><th>Customer</th><th>Phone</th><th>Address</th><th>Courier</th><th>Branch</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {deliveries.map(d => (
                    <tr key={d.id}>
                      <td className="mono" style={{ color:C.accent, fontSize:11 }}>{d.id}</td>
                      <td className="mono" style={{ fontSize:11, color:C.textMuted }}>{d.createdAt}</td>
                      <td style={{ fontWeight:600 }}>{d.customerName}</td>
                      <td className="mono" style={{ fontSize:12, color:C.textDim }}>{d.phone}</td>
                      <td style={{ fontSize:12, color:C.textMuted, maxWidth:150, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.address}</td>
                      <td style={{ fontSize:12 }}>{d.courier || "—"}</td>
                      <td><Badge label={d.branch} type="b-gray" /></td>
                      <td><Badge label={d.status} type={statusColor(d.status)} /></td>
                      <td>
                        <div style={{ display:"flex", gap:5 }}>
                          <button className="btn btn-info btn-sm" onClick={()=>setTrackModal(d)}>📡 Track</button>
                          {d.status !== "Delivered" && d.status !== "Failed" && (
                            <select className="sel" style={{ width:130, padding:"4px 8px", fontSize:11 }} value={d.status} onChange={e=>updateStatus(d.id,e.target.value)}>
                              {statusFlow.map(s=><option key={s}>{s}</option>)}
                            </select>
                          )}
                          <button className="btn btn-danger btn-sm" onClick={()=>del(d.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "tracking" && (
        <div className="card">
          <div className="card-hd"><span className="card-title">📡 Shipment Tracking</span></div>
          {deliveries.filter(d=>d.status!=="Delivered"&&d.status!=="Failed").length === 0 ? (
            <div className="empty-state"><div className="es-icon">📡</div><p>No active shipments to track.</p></div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:16, padding:20 }}>
              {deliveries.filter(d=>d.status!=="Delivered"&&d.status!=="Failed").map(d => (
                <div key={d.id} style={{ background:C.surfaceAlt, borderRadius:12, padding:16, border:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                    <span className="mono" style={{ color:C.accent, fontWeight:700 }}>{d.id}</span>
                    <Badge label={d.status} type={statusColor(d.status)} />
                  </div>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>{d.customerName}</div>
                  <div style={{ fontSize:11, color:C.textMuted, marginBottom:12 }}>📍 {d.address}</div>
                  {/* Progress bar */}
                  <div style={{ marginBottom:12 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                      {statusFlow.map((s,i)=>(
                        <div key={s} style={{ flex:1, textAlign:"center" }}>
                          <div style={{ width:12, height:12, borderRadius:"50%", background:statusFlow.indexOf(d.status)>=i?C.accent:C.border, margin:"0 auto 3px" }} />
                          <div style={{ fontSize:8, color:C.textMuted, display:"none" }}>{s}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ height:3, background:C.border, borderRadius:3, position:"relative" }}>
                      <div style={{ position:"absolute", left:0, top:0, height:"100%", borderRadius:3, background:C.accent, width:`${(statusFlow.indexOf(d.status)/(statusFlow.length-1))*100}%`, transition:"width .3s" }} />
                    </div>
                    <div style={{ textAlign:"center", fontSize:11, color:C.accent, marginTop:4, fontWeight:600 }}>{d.status}</div>
                  </div>
                  {d.courier && <div style={{ fontSize:11, color:C.textDim }}>🚗 Courier: {d.courier}</div>}
                  <button className="btn btn-outline btn-sm" style={{ width:"100%", justifyContent:"center", marginTop:10 }} onClick={()=>setTrackModal(d)}>View Timeline</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "routes" && (
        <div className="card">
          <div className="card-hd"><span className="card-title">🗺️ Delivery Routes</span></div>
          <div style={{ padding:20 }}>
            <div style={{ background:C.surfaceAlt, borderRadius:12, padding:20, border:`1px solid ${C.border}`, marginBottom:16 }}>
              <div style={{ fontWeight:700, marginBottom:12, fontSize:14 }}>📍 Active Deliveries by Zone</div>
              {["Nairobi CBD","Westlands","Eastlands","Juja / Thika","Other"].map(zone => {
                const zoneDeliveries = deliveries.filter(d => d.status !== "Delivered" && d.status !== "Failed" && (d.address.toLowerCase().includes(zone.split("/")[0].trim().toLowerCase()) || zone === "Other"));
                const count = zone === "Other" ? deliveries.filter(d => d.status !== "Delivered").length : zoneDeliveries.length;
                return (
                  <div key={zone} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:13, fontWeight:500 }}>📍 {zone}</span>
                    <span className="mono" style={{ fontSize:12, color:C.accent }}>{count} delivery{count!==1?"ies":"y"}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ background:C.surfaceAlt, borderRadius:12, padding:20, border:`1px solid ${C.border}` }}>
              <div style={{ fontWeight:700, marginBottom:12, fontSize:14 }}>🚗 Courier Performance</div>
              {[...new Set(deliveries.map(d=>d.courier).filter(Boolean))].length === 0 ? (
                <div style={{ color:C.textMuted, fontSize:13 }}>No courier data yet. Add courier names when creating deliveries.</div>
              ) : (
                [...new Set(deliveries.map(d=>d.courier).filter(Boolean))].map(c => {
                  const courierDeliveries = deliveries.filter(d=>d.courier===c);
                  const success = courierDeliveries.filter(d=>d.status==="Delivered").length;
                  const rate = courierDeliveries.length > 0 ? Math.round((success/courierDeliveries.length)*100) : 0;
                  return (
                    <div key={c} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                      <span style={{ fontSize:13, fontWeight:600 }}>{c}</span>
                      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        <span className="mono" style={{ fontSize:11, color:C.textMuted }}>{courierDeliveries.length} total</span>
                        <span className="mono" style={{ fontSize:12, color:rate>=80?C.success:rate>=50?C.accent:C.danger, fontWeight:700 }}>{rate}% success</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Delivery Modal */}
      {showForm && (
        <Overlay onClose={()=>setShowForm(false)}>
          <div className="modal modal-lg" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">🚚 Create Delivery Note</div>
            <div className="frow">
              <div className="fg"><label className="flabel">Customer Name *</label><input className="inp" value={form.customerName} onChange={e=>setForm(f=>({...f,customerName:e.target.value}))} /></div>
              <div className="fg"><label className="flabel">Phone</label><input className="inp" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="+254..." /></div>
            </div>
            <div className="fg"><label className="flabel">Delivery Address *</label><input className="inp" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} placeholder="Full address with landmark" /></div>
            <div className="frow">
              <div className="fg"><label className="flabel">Courier / Rider</label><input className="inp" value={form.courier} onChange={e=>setForm(f=>({...f,courier:e.target.value}))} placeholder="Courier name or company" /></div>
              <div className="fg"><label className="flabel">Dispatch Branch</label><select className="sel" value={form.branch} onChange={e=>setForm(f=>({...f,branch:e.target.value}))}><option>Main Branch</option><option>West Branch</option></select></div>
            </div>
            <div className="fg"><label className="flabel">Items / Description</label><textarea className="textarea" rows={2} value={form.items} onChange={e=>setForm(f=>({...f,items:e.target.value}))} placeholder="e.g. iPhone 15 Pro x1, AirPods x2" /></div>
            <div className="fg"><label className="flabel">Notes</label><textarea className="textarea" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Special instructions..." /></div>
            <div className="modal-footer"><button className="btn btn-outline" onClick={()=>setShowForm(false)}>Cancel</button><button className="btn btn-primary" onClick={create}>Create Delivery Note</button></div>
          </div>
        </Overlay>
      )}

      {/* Tracking Timeline Modal */}
      {trackModal && (
        <Overlay onClose={()=>setTrackModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">📡 Tracking — {trackModal.id}</div>
            <div style={{ background:C.surfaceAlt, borderRadius:10, padding:14, marginBottom:16, fontSize:12 }}>
              <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
                <div><span style={{ color:C.textMuted }}>Customer: </span><strong>{trackModal.customerName}</strong></div>
                <div><span style={{ color:C.textMuted }}>Phone: </span><span className="mono">{trackModal.phone}</span></div>
                <div><span style={{ color:C.textMuted }}>Address: </span>{trackModal.address}</div>
                {trackModal.courier && <div><span style={{ color:C.textMuted }}>Courier: </span>{trackModal.courier}</div>}
              </div>
            </div>
            <div style={{ fontWeight:700, marginBottom:12 }}>Timeline</div>
            {trackModal.timeline.map((t,i)=>(
              <div key={i} style={{ display:"flex", gap:12, marginBottom:14 }}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                  <div style={{ width:10, height:10, borderRadius:"50%", background:i===trackModal.timeline.length-1?C.accent:C.success, flexShrink:0, marginTop:3 }} />
                  {i < trackModal.timeline.length-1 && <div style={{ width:2, flex:1, background:C.border, marginTop:4 }} />}
                </div>
                <div style={{ paddingBottom:8 }}>
                  <div style={{ fontWeight:600, fontSize:13 }}>{t.status}</div>
                  <div style={{ fontSize:11, color:C.textMuted }}>{t.time}</div>
                  {t.note && <div style={{ fontSize:11, color:C.textDim, marginTop:2 }}>{t.note}</div>}
                </div>
              </div>
            ))}
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setTrackModal(null)}>Close</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── MULTI-CURRENCY 💱 ────────────────────────────────────────────────────────
function CurrencyConverter({ notify }) {
  const [rates, setRates] = useState({});
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("KES");
  const [amount, setAmount] = useState("1");
  const [editRate, setEditRate] = useState(null);
  const [tempRate, setTempRate] = useState("");

  useEffect(() => {
    currencyAPI.list().then(res => {
      const map = {};
      (res.data || []).forEach(r => { map[r.currency] = parseFloat(r.rate_to_kes); });
      setRates(map);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const currencies = ["KES","USD","EUR","GBP","CNY","UGX","TZS","ETB","ZAR","AED"];
  const symbols = { KES:"KSh",USD:"$",EUR:"€",GBP:"£",CNY:"¥",UGX:"USh",TZS:"TSh",ETB:"Br",ZAR:"R",AED:"د.إ" };

  const toKES = (val, ccy) => ccy === "KES" ? +val : +val * (rates[ccy] || 1);
  const fromKES = (val, ccy) => ccy === "KES" ? +val : +val / (rates[ccy] || 1);
  const convert = () => {
    const kes = toKES(+amount, from);
    return fromKES(kes, to).toFixed(4);
  };

  const saveRate = async (ccy) => {
    try {
      await currencyAPI.update(ccy, parseFloat(tempRate));
      setRates(r => ({ ...r, [ccy]: parseFloat(tempRate) }));
      setEditRate(null);
      notify(`Rate updated: 1 ${ccy} = KSh ${tempRate} ✅`);
    } catch(e) { notify(e.message, "error"); }
  };

  return (
    <div className="fade-in">
      {/* Converter */}
      <div className="g2" style={{ marginBottom:20 }}>
        <div className="card">
          <div className="card-hd"><span className="card-title">💱 Currency Converter</span></div>
          <div className="card-body">
            <div className="fg"><label className="flabel">Amount</label><input className="inp" type="number" value={amount} onChange={e=>setAmount(e.target.value)} /></div>
            <div className="frow">
              <div className="fg"><label className="flabel">From</label><select className="sel" value={from} onChange={e=>setFrom(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select></div>
              <div className="fg" style={{ display:"flex", alignItems:"flex-end" }}><button className="btn btn-outline" style={{ width:"100%" }} onClick={()=>{ const t=from; setFrom(to); setTo(t); }}>⇌ Swap</button></div>
              <div className="fg"><label className="flabel">To</label><select className="sel" value={to} onChange={e=>setTo(e.target.value)}>{currencies.map(c=><option key={c}>{c}</option>)}</select></div>
            </div>
            <div style={{ background:C.surfaceAlt, borderRadius:12, padding:20, textAlign:"center", marginTop:8 }}>
              <div style={{ fontSize:13, color:C.textMuted, marginBottom:6 }}>{symbols[from]||""} {amount} {from} =</div>
              <div style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:800, fontSize:32, color:C.accent }}>{symbols[to]||""} {convert()}</div>
              <div style={{ fontSize:11, color:C.textMuted, marginTop:6 }}>{to}</div>
            </div>
            <div style={{ marginTop:12, padding:10, background:C.surfaceAlt, borderRadius:8, fontSize:11, color:C.textMuted }}>
              Rate: 1 {from} = KSh {from==="KES"?1:rates[from]||"—"} &nbsp;|&nbsp; 1 {to} = KSh {to==="KES"?1:rates[to]||"—"}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-hd"><span className="card-title">📊 KSh vs Major Currencies</span></div>
          <div className="card-body">
            {Object.entries(rates).slice(0,6).map(([ccy,rate])=>(
              <div key={ccy} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                <span style={{ fontWeight:600, fontSize:13 }}>{symbols[ccy]||""} {ccy}</span>
                <span className="mono" style={{ color:C.accent, fontSize:12, fontWeight:600 }}>KSh {rate.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Exchange rate management */}
      <div className="card">
        <div className="card-hd"><span className="card-title">⚙️ Manage Exchange Rates</span><span style={{ fontSize:11, color:C.textMuted }}>Last updated manually</span></div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Currency</th><th>Symbol</th><th>Rate (1 unit = KSh)</th><th>KSh 1,000 =</th><th>Actions</th></tr></thead>
            <tbody>
              {Object.entries(rates).map(([ccy,rate])=>(
                <tr key={ccy}>
                  <td style={{ fontWeight:600 }}>{ccy}</td>
                  <td style={{ fontSize:16 }}>{symbols[ccy]||""}</td>
                  <td>
                    {editRate === ccy ? (
                      <div style={{ display:"flex", gap:6 }}>
                        <input className="inp" style={{ width:100 }} type="number" step="0.01" value={tempRate} onChange={e=>setTempRate(e.target.value)} autoFocus />
                        <button className="btn btn-success btn-sm" onClick={()=>saveRate(ccy)}>✓</button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>setEditRate(null)}>✕</button>
                      </div>
                    ) : (
                      <span className="mono" style={{ color:C.accent }}>{rate.toFixed(4)}</span>
                    )}
                  </td>
                  <td className="mono" style={{ fontSize:12, color:C.textDim }}>{symbols[ccy]||""} {(1000/rate).toFixed(2)}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={()=>{ setEditRate(ccy); setTempRate(String(rate)); }}>✏️ Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── DOCUMENT MANAGER 📁 ──────────────────────────────────────────────────────
function DocumentManager({ user, notify }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [form, setForm] = useState({ title:"", category:"Invoice", description:"", linkedTo:"", tags:"" });
  const [fileData, setFileData] = useState(null);
  const fileRef = useRef(null);

  const loadDocs = async () => {
    try {
      const res = await documentsAPI.list();
      setDocs(res.data || []);
    } catch(e) { notify("Failed to load documents","error"); }
    setLoading(false);
  };

  useEffect(() => { loadDocs(); }, []);

  const cats = ["All","Invoice","Contract","Receipt","Employee","Supplier","Product","Other"];

  const handleFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5*1024*1024) { notify("File too large (max 5MB)","error"); return; }
    const reader = new FileReader();
    reader.onload = ev => setFileData({ name:file.name, size:file.size, type:file.type, data:ev.target.result });
    reader.readAsDataURL(file);
  };

  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.title) return notify("Title is required","error");
    setSaving(true);
    try {
      const payload = {
        title: form.title, category: form.category,
        description: form.description, linked_to: form.linkedTo,
        tags: form.tags,
        file_name: fileData?.name || null,
        file_size: fileData?.size || null,
        file_type: fileData?.type || null,
        file_data: fileData?.data || null,
      };
      const res = await documentsAPI.create(payload);
      setDocs(d => [res.data, ...d]);
      setShowForm(false); setForm({ title:"", category:"Invoice", description:"", linkedTo:"", tags:"" }); setFileData(null);
      notify("Document saved ✅");
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const del = async id => {
    try {
      await documentsAPI.delete(id);
      setDocs(d => d.filter(x => x.id !== id));
      notify("Document deleted","error");
    } catch(e) { notify(e.message,"error"); }
  };

  const download = async doc => {
    try {
      const res = await documentsAPI.get(doc.id);
      const full = res.data;
      if (!full.file_data) return notify("No file attached","error");
      const a = document.createElement("a");
      a.href = full.file_data; a.download = full.file_name || "document"; a.click();
    } catch(e) { notify(e.message,"error"); }
  };

  const filtered = docs.filter(d =>
    (catFilter === "All" || d.category === catFilter) &&
    (d.title.toLowerCase().includes(search.toLowerCase()) || d.tags.some(t=>t.toLowerCase().includes(search.toLowerCase())))
  );

  const sizeLabel = bytes => bytes < 1024 ? `${bytes}B` : bytes < 1024*1024 ? `${(bytes/1024).toFixed(1)}KB` : `${(bytes/1024/1024).toFixed(1)}MB`;
  const catColor = c => ({Invoice:"b-success",Contract:"b-info",Receipt:"b-warning",Employee:"b-purple",Supplier:"b-gray",Product:"b-blue"}[c]||"b-gray");

  return (
    <div className="fade-in">
      <div className="stats-grid" style={{ gridTemplateColumns:"repeat(4,1fr)", marginBottom:20 }}>
        {["Invoice","Contract","Receipt","Employee"].map(cat => (
          <div key={cat} className="stat-card blue" style={{ cursor:"pointer" }} onClick={()=>setCatFilter(cat)}>
            <div style={{ fontSize:24, marginBottom:8 }}>{cat==="Invoice"?"🧾":cat==="Contract"?"📝":cat==="Receipt"?"🧾":"👤"}</div>
            <div className="stat-value" style={{ color:C.info, fontSize:22 }}>{docs.filter(d=>d.category===cat).length}</div>
            <div className="stat-label">{cat}s</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-hd">
          <span className="card-title">📁 Document Library</span>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <select className="sel" style={{ width:130 }} value={catFilter} onChange={e=>setCatFilter(e.target.value)}>{cats.map(c=><option key={c}>{c}</option>)}</select>
            <div className="search-wrap"><span className="search-icon">🔍</span><input className="inp" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} /></div>
            <button className="btn btn-primary" onClick={()=>setShowForm(true)}>+ Upload Doc</button>
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state"><div className="es-icon">📁</div><p>No documents yet. Upload invoices, contracts, receipts and more.</p></div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>ID</th><th>Title</th><th>Category</th><th>Linked To</th><th>Tags</th><th>File</th><th>Uploaded</th><th>By</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map(d=>(
                  <tr key={d.id}>
                    <td className="mono" style={{ color:C.accent, fontSize:11 }}>{d.id}</td>
                    <td style={{ fontWeight:600, maxWidth:180 }}>{d.title}</td>
                    <td><Badge label={d.category} type={catColor(d.category)} /></td>
                    <td style={{ fontSize:12, color:C.textDim }}>{d.linkedTo||"—"}</td>
                    <td>{d.tags.slice(0,2).map((t,i)=><span key={i} style={{ fontSize:10, background:C.surfaceAlt, border:`1px solid ${C.border}`, borderRadius:4, padding:"1px 6px", marginRight:3 }}>{t}</span>)}</td>
                    <td style={{ fontSize:11, color:C.textMuted }}>{d.file_name ? `📎 ${sizeLabel(d.file_size||0)}` : "—"}</td>
                    <td className="mono" style={{ fontSize:11, color:C.textMuted }}>{d.uploaded_at||d.uploadedAt}</td>
                    <td style={{ fontSize:12 }}>{d.uploaded_by||d.uploadedBy}</td>
                    <td>
                      <div style={{ display:"flex", gap:5 }}>
                        {d.file_name && <button className="btn btn-info btn-sm" onClick={()=>download(d)}>⬇️</button>}
                        <button className="btn btn-danger btn-sm" onClick={()=>del(d.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <Overlay onClose={()=>setShowForm(false)}>
          <div className="modal modal-lg" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">📁 Upload Document</div>
            <div className="frow">
              <div className="fg"><label className="flabel">Title *</label><input className="inp" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} /></div>
              <div className="fg"><label className="flabel">Category</label><select className="sel" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{cats.slice(1).map(c=><option key={c}>{c}</option>)}</select></div>
            </div>
            <div className="fg"><label className="flabel">Description</label><textarea className="textarea" rows={2} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} /></div>
            <div className="frow">
              <div className="fg"><label className="flabel">Linked To (e.g. RCP-0001, SUP-002)</label><input className="inp" value={form.linkedTo} onChange={e=>setForm(f=>({...f,linkedTo:e.target.value}))} /></div>
              <div className="fg"><label className="flabel">Tags (comma-separated)</label><input className="inp" value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} placeholder="invoice, 2026, march" /></div>
            </div>
            <div className="fg">
              <label className="flabel">Attach File (max 5MB)</label>
              <div style={{ border:`2px dashed ${fileData?C.success:C.border}`, borderRadius:10, padding:20, textAlign:"center", cursor:"pointer", transition:"border-color .2s" }} onClick={()=>fileRef.current.click()}>
                {fileData ? (
                  <div>
                    <div style={{ fontSize:24, marginBottom:6 }}>📎</div>
                    <div style={{ fontSize:13, fontWeight:600, color:C.success }}>{fileData.name}</div>
                    <div style={{ fontSize:11, color:C.textMuted }}>{sizeLabel(fileData.size)}</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize:28, marginBottom:6 }}>☁️</div>
                    <div style={{ fontSize:13, color:C.textMuted }}>Click to select a file</div>
                    <div style={{ fontSize:11, color:C.textMuted }}>PDF, images, Word docs, Excel (max 5MB)</div>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" style={{ display:"none" }} onChange={handleFile} accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.txt,.csv" />
            </div>
            <div className="modal-footer"><button className="btn btn-outline" onClick={()=>setShowForm(false)}>Cancel</button><button className="btn btn-primary" onClick={save}>Save Document</button></div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─── MPESA INTEGRATION 💳 ─────────────────────────────────────────────────────
function MpesaIntegration({ data, user, notify }) {
  const [tab, setTab] = useState("stk");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ total_count:0, success_count:0, failed_count:0, pending_count:0, total_received:0, today_received:0 });
  const [config, setConfig] = useState({
    shortcode:      "174379",
    consumerKey:    "AR94AvcY7kAvvT2DjNYLISrZGAJCAjWT6hyOU2sEMVC8G9Sd",
    consumerSecret: "x3tHlKwk1fthm9ZxscVHLAsAiUgdfvYUbopPAwlHnAtF5rq3TMXYJGs1WKk2cGQe",
    passkey:        "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919",
    env:            "sandbox",
    tillNumber:     "8359400",
    paybillNumber:  "174379",
  });
  const [configSaved, setConfigSaved] = useState(false);
  const [c2bBranch, setC2bBranch] = useState("Main Branch");

  useEffect(() => {
    mpesaAPI.transactions().then(r => setTransactions(r.data||[])).catch(()=>{});
    mpesaAPI.summary().then(r => setSummary(r.data||{})).catch(()=>{});
    mpesaAPI.getConfig().then(r => {
      if (r.data) setConfig(c => ({
        ...c,
        shortcode:      r.data.shortcode      || c.shortcode,
        env:            r.data.environment    || c.env,
        consumerKey:    r.data.consumer_key   || c.consumerKey,
        consumerSecret: r.data.consumer_secret|| c.consumerSecret,
        passkey:        r.data.passkey        || c.passkey,
        tillNumber:     r.data.till_number    || c.tillNumber,
        paybillNumber:  r.data.paybill_number || c.paybillNumber,
      }));
    }).catch(()=>{});
  }, []);

  const SANDBOX_PASSKEY = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";

  const saveConfig = async () => {
    try {
      // Auto-fill sandbox passkey if left blank
      const passkey = config.passkey || (config.env === "sandbox" ? SANDBOX_PASSKEY : "");
      await mpesaAPI.saveConfig({
        environment:     config.env,
        shortcode:       config.shortcode,
        consumer_key:    config.consumerKey,
        consumer_secret: config.consumerSecret,
        passkey,
        till_number:     config.tillNumber,
        paybill_number:  config.paybillNumber || config.shortcode,
      });
      if (!config.passkey && config.env === "sandbox") {
        setConfig(c => ({ ...c, passkey: SANDBOX_PASSKEY }));
      }
      setConfigSaved(true);
      notify("M-Pesa configuration saved ✅");
      setTimeout(()=>setConfigSaved(false), 3000);
    } catch(e) { notify(e.message,"error"); }
  };

  const [stkError, setStkError] = useState("");
  const [testResult, setTestResult] = useState(null);

  const testCredentials = async () => {
    setTestResult("testing");
    try {
      const res = await mpesaAPI.testToken ? mpesaAPI.testToken() :
        fetch("/api/mpesa/token-test").then(r => r.json());
      setTestResult(res.success ? "ok" : "fail");
      if (res.success) notify("✅ Credentials working! Ready to send STK Push.", "success");
      else notify("❌ Credentials failed: " + (res.error || res.message), "error");
    } catch(e) {
      setTestResult("fail");
      notify("❌ Could not reach server: " + e.message, "error");
    }
    setTimeout(() => setTestResult(null), 5000);
  };

  const simulateSTK = async () => {
    if (!phone || !amount) return notify("Phone and amount required","error");
    setStkError("");
    setLoading(true);
    try {
      const res = await mpesaAPI.stkPush({
        phone,
        amount: +amount,
        reference: ref || "VES Payment",
        description: "VES Connections Payment",
        consumer_key:    config.consumerKey,
        consumer_secret: config.consumerSecret,
        shortcode:       config.shortcode,
        passkey:         config.passkey,
        environment:     config.env,
      });
      const txn = res.data;
      setTransactions(t => [txn, ...t]);
      if (config.env === "sandbox") {
        setTimeout(async () => {
          try {
            const newStatus = Math.random() > 0.2 ? "Success" : "Failed";
            const upd = await mpesaAPI.updateTxn(txn.id, { status: newStatus, mpesa_receipt: newStatus==="Success" ? `QHX${Date.now().toString().slice(-6)}` : null });
            setTransactions(t => t.map(x => x.id === txn.id ? upd.data : x));
            mpesaAPI.summary().then(r => setSummary(r.data||{})).catch(()=>{});
            if (newStatus==="Success") notify(`✅ M-Pesa received KSh ${amount} from ${phone}`);
            else notify("❌ Payment not completed by customer","error");
          } catch(e) {}
        }, 3000);
        notify(`📲 STK Push sent to ${phone} (sandbox mode)`,"info");
      } else {
        notify(`📲 STK Push sent to ${phone}. Waiting for customer...`,"info");
      }
      setPhone(""); setAmount(""); setRef("");
    } catch(e) {
      const errData = e?.response?.data || {};
      const msg = errData.error || errData.detail?.errorMessage || e.message || "STK Push failed";
      const detail = errData.detail ? JSON.stringify(errData.detail) : "";
      setStkError(msg + (detail ? `\n\nDaraja: ${detail}` : ""));
      notify("❌ " + msg, "error");
    }
    setLoading(false);
  };

  const totalReceived = parseFloat(summary.total_received||0);

  return (
    <div className="fade-in">
      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns:"repeat(4,1fr)", marginBottom:20 }}>
        <div className="stat-card green"><div style={{ fontSize:28, marginBottom:8 }}>💚</div><div className="stat-value" style={{ color:C.success }}>{fmtKsh(summary.total_received||0)}</div><div className="stat-label">Total Received</div></div>
        <div className="stat-card blue"><div style={{ fontSize:28, marginBottom:8 }}>📲</div><div className="stat-value" style={{ color:C.info }}>{summary.total_count||transactions.length}</div><div className="stat-label">Transactions</div></div>
        <div className="stat-card gold"><div style={{ fontSize:28, marginBottom:8 }}>✅</div><div className="stat-value" style={{ color:C.accent }}>{summary.success_count||0}</div><div className="stat-label">Successful</div></div>
        <div className="stat-card red"><div style={{ fontSize:28, marginBottom:8 }}>❌</div><div className="stat-value" style={{ color:C.danger }}>{summary.failed_count||0}</div><div className="stat-label">Failed</div></div>
      </div>

      {/* Tab bar */}
      <div style={{ overflowX:"auto", marginBottom:20, paddingBottom:4 }}>
        <div style={{ display:"flex", gap:4, background:C.surfaceAlt, padding:4, borderRadius:10, minWidth:"max-content" }}>
          {[["stk","📲","STK Push"],["c2b","📥","C2B Paybill"],["txns","📋","Transactions"],["config","⚙️","Configuration"]].map(([k,icon,label])=>(
            <button key={k} onClick={()=>setTab(k)} style={{ padding:"8px 16px",borderRadius:7,border:"none",cursor:"pointer",background:tab===k?C.surface:"transparent",color:tab===k?C.text:C.textMuted,fontWeight:600,fontSize:12.5,fontFamily:"'Cabinet Grotesk',sans-serif",boxShadow:tab===k?"0 1px 4px rgba(0,0,0,.3)":"none",transition:"all .15s",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5 }}>
              <span>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === "stk" && (
        <div className="g2">
          <div className="card">
            <div className="card-hd">
              <span className="card-title">📲 STK Push Payment</span>
              <button
                className="btn btn-outline btn-sm"
                onClick={testCredentials}
                disabled={testResult === "testing"}
                style={{ fontSize:11 }}
              >
                {testResult === "testing" ? <><Spinner/>Testing...</> :
                 testResult === "ok"      ? "✅ Credentials OK" :
                 testResult === "fail"    ? "❌ Failed" :
                 "🔍 Test Credentials"}
              </button>
            </div>
            <div className="card-body">
              {/* Credential status warning */}
              {(!config.consumerKey || !config.consumerSecret) ? (
                <div style={{ background:C.dangerDim, border:`1px solid rgba(255,77,106,.2)`, borderRadius:10, padding:12, marginBottom:16, fontSize:12, color:C.danger }}>
                  ⚠️ Credentials not set. Go to the <strong>Configuration</strong> tab first and save your Daraja API keys.
                </div>
              ) : (
                <div style={{ background:C.successDim, border:`1px solid rgba(0,217,126,.2)`, borderRadius:10, padding:12, marginBottom:16, fontSize:12, color:C.success }}>
                  💰 <strong>{config.env === "sandbox" ? "Sandbox" : "Live"}</strong> — Payments go directly to Till <strong>{config.tillNumber || "8359400"}</strong>
                </div>
              )}

              <div className="fg">
                <label className="flabel">Customer Phone *</label>
                <input className="inp" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="0712345678 or 254712345678" />
                {phone && <div style={{ fontSize:10, color:C.textMuted, marginTop:3 }}>
                  Will send to: {phone.startsWith("254") ? phone : "254" + phone.replace(/^0/,"")}
                </div>}
              </div>
              <div className="fg">
                <label className="flabel">Amount (KSh) *</label>
                <input className="inp" type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="e.g. 100" min="1" />
              </div>
              <div className="fg">
                <label className="flabel">Reference / Account Number</label>
                <input className="inp" value={ref} onChange={e=>setRef(e.target.value)} placeholder="e.g. INV-0001 (max 12 chars)" maxLength={12} />
              </div>

              {/* Error display */}
              {stkError && (
                <div style={{ background:C.dangerDim, border:`1px solid rgba(255,77,106,.2)`, borderRadius:10, padding:12, marginBottom:12, fontSize:12, color:C.danger }}>
                  ❌ {stkError}
                  <div style={{ marginTop:6, fontSize:11, color:C.textMuted }}>
                    Common fixes: Check your callback URL is public, shortcode matches your Daraja app, phone number is valid.
                  </div>
                </div>
              )}

              <button
                className="btn btn-success"
                style={{ width:"100%", justifyContent:"center", padding:12, fontSize:15, marginTop:8 }}
                onClick={simulateSTK}
                disabled={loading || !config.consumerKey}
              >
                {loading ? <><Spinner/>Sending prompt to phone...</> : "💚 Send Payment Request"}
              </button>
              {loading && (
                <div style={{ textAlign:"center", fontSize:12, color:C.textMuted, marginTop:10, animation:"pulse 1.5s infinite" }}>
                  📲 Prompt sent to {phone.startsWith("254") ? phone : "254" + phone.replace(/^0/,"")}. Customer has 30 seconds to enter PIN...
                </div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-hd"><span className="card-title">📊 Today&apos;s Summary</span></div>
            <div className="card-body">
              {(() => {
                const todayTxns = transactions.filter(t=>(t.created_at||'').startsWith(new Date().toISOString().split('T')[0]));
                const todayAmt = todayTxns.filter(t=>t.status==="Success").reduce((s,t)=>s+t.amount,0);
                return (
                  <div>
                    <div style={{ textAlign:"center", padding:"20px 0", borderBottom:`1px solid ${C.border}`, marginBottom:16 }}>
                      <div style={{ fontSize:11, color:C.textMuted, marginBottom:4 }}>TODAY&apos;S COLLECTIONS</div>
                      <div style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:800, fontSize:32, color:C.success }}>{fmtKsh(todayAmt)}</div>
                      <div style={{ fontSize:12, color:C.textMuted }}>{todayTxns.length} transactions</div>
                    </div>
                    {transactions.slice(0,5).map(t=>(
                      <div key={t.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid rgba(26,45,74,.3)` }}>
                        <div>
                          <div style={{ fontSize:12, fontWeight:600 }}>{t.phone}</div>
                          <div style={{ fontSize:10, color:C.textMuted }}>{(t.created_at||'').split('T')[0]}</div>
                        </div>
                        <div style={{ textAlign:"right" }}>
                          <div className="mono" style={{ fontSize:13, fontWeight:700, color:t.status==="Success"?C.success:C.danger }}>{fmtKsh(parseFloat(t.amount)||0)}</div>
                          <Badge label={t.status} type={t.status==="Success"?"b-success":"b-danger"} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {tab === "c2b" && (() => {
        const BRANCH_PAYMENTS = {
          "Main Branch": { paybill:"880100", account:"304777", till:"8359400" },
          "West Branch": { paybill:"", account:"", till:"" },
          "Juja Branch": { paybill:"", account:"", till:"" },
        };
        const bp = BRANCH_PAYMENTS[c2bBranch] || {};
        const hasPay  = bp.paybill && bp.account;
        const hasTill = bp.till;
        return (
          <div className="card">
            <div className="card-hd">
              <span className="card-title">📥 Paybill / Till Number</span>
              <select className="sel" style={{ fontSize:13, padding:"5px 10px", minWidth:150 }} value={c2bBranch} onChange={e=>setC2bBranch(e.target.value)}>
                <option>Main Branch</option>
                <option>West Branch</option>
                <option>Juja Branch</option>
              </select>
            </div>
            <div className="card-body">
              <div style={{ background:C.infoDim, border:`1px solid rgba(59,158,255,.2)`, borderRadius:10, padding:16, marginBottom:20 }}>
                <div style={{ fontWeight:700, marginBottom:12, color:C.info, fontSize:14 }}>📢 Share these details with customers to pay directly via M-Pesa — <span style={{ color:C.accent }}>{c2bBranch}</span></div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                  {/* PAYBILL */}
                  <div style={{ background:C.surface, borderRadius:12, padding:20, textAlign:"center", border:`1px solid rgba(59,158,255,.15)`, opacity: hasPay?1:0.45 }}>
                    <div style={{ fontSize:10, letterSpacing:2, color:C.textMuted, marginBottom:8 }}>PAYBILL NUMBER</div>
                    <div style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:800, fontSize:36, color:C.accent, letterSpacing:2 }}>{bp.paybill||"—"}</div>
                    <div style={{ margin:"12px 0", height:1, background:C.border }} />
                    <div style={{ fontSize:10, letterSpacing:2, color:C.textMuted, marginBottom:6 }}>ACCOUNT NUMBER</div>
                    <div style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:800, fontSize:28, color:C.text }}>{bp.account||"—"}</div>
                    <div style={{ fontSize:11, color:C.textMuted, marginTop:10, background:C.surfaceAlt, borderRadius:6, padding:"6px 10px" }}>
                      {hasPay ? "Lipa Na M-Pesa → Paybill" : "Not configured for this branch"}
                    </div>
                  </div>
                  {/* TILL */}
                  <div style={{ background:C.surface, borderRadius:12, padding:20, textAlign:"center", border:`1px solid rgba(0,217,126,.15)`, opacity: hasTill?1:0.45 }}>
                    <div style={{ fontSize:10, letterSpacing:2, color:C.textMuted, marginBottom:8 }}>TILL NUMBER</div>
                    <div style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:800, fontSize:36, color:C.success, letterSpacing:2 }}>{bp.till||"—"}</div>
                    <div style={{ margin:"12px 0", height:1, background:C.border }} />
                    <div style={{ fontSize:11, color:C.textMuted }}>Buy Goods &amp; Services</div>
                    <div style={{ fontSize:11, color:C.textMuted, marginTop:10, background:C.surfaceAlt, borderRadius:6, padding:"6px 10px" }}>
                      {hasTill ? "Lipa Na M-Pesa → Buy Goods" : "Not configured for this branch"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Step-by-step guide — only shown when details exist */}
              {(hasPay || hasTill) && (
                <div style={{ background:C.surfaceAlt, borderRadius:10, padding:16 }}>
                  <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color:C.text }}>📱 How to Pay via M-Pesa</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, fontSize:12, color:C.textDim }}>
                    {hasPay && (
                      <div>
                        <div style={{ fontWeight:600, color:C.accent, marginBottom:6 }}>Via Paybill ({bp.paybill})</div>
                        <ol style={{ paddingLeft:16, lineHeight:2 }}>
                          <li>Go to M-Pesa → Lipa Na M-Pesa</li>
                          <li>Select <strong>Paybill</strong></li>
                          <li>Business No: <strong style={{ color:C.accent }}>{bp.paybill}</strong></li>
                          <li>Account No: <strong style={{ color:C.text }}>{bp.account}</strong></li>
                          <li>Enter Amount &amp; PIN</li>
                        </ol>
                      </div>
                    )}
                    {hasTill && (
                      <div>
                        <div style={{ fontWeight:600, color:C.success, marginBottom:6 }}>Via Till ({bp.till})</div>
                        <ol style={{ paddingLeft:16, lineHeight:2 }}>
                          <li>Go to M-Pesa → Lipa Na M-Pesa</li>
                          <li>Select <strong>Buy Goods &amp; Services</strong></li>
                          <li>Till No: <strong style={{ color:C.success }}>{bp.till}</strong></li>
                          <li>Enter Amount &amp; PIN</li>
                        </ol>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!hasPay && !hasTill && (
                <div style={{ textAlign:"center", color:C.textMuted, fontSize:13, padding:16, background:C.surfaceAlt, borderRadius:10 }}>
                  ⚙️ No payment details configured for <strong>{c2bBranch}</strong> yet. Contact your admin to add them.
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {tab === "txns" && (
        <div className="card">
          <div className="card-hd"><span className="card-title">📋 Transaction History</span></div>
          {transactions.length === 0 ? (
            <div className="empty-state"><div className="es-icon">💳</div><p>No M-Pesa transactions yet.</p></div>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>ID</th><th>Type</th><th>Phone</th><th>Amount</th><th>Reference</th><th>Status</th><th>Time</th><th>Staff</th></tr></thead>
                <tbody>
                  {transactions.map(t=>(
                    <tr key={t.id}>
                      <td className="mono" style={{ fontSize:10, color:C.textMuted }}>{t.id}</td>
                      <td><Badge label={t.transaction_type||t.type||'STK Push'} type="b-info" /></td>
                      <td className="mono" style={{ fontSize:12 }}>{t.phone}</td>
                      <td className="mono" style={{ color:t.status==="Success"?C.success:C.danger, fontWeight:700 }}>{fmtKsh(t.amount)}</td>
                      <td style={{ fontSize:12, color:C.textDim }}>{t.reference||t.ref||"—"}</td>
                      <td><Badge label={t.status} type={t.status==="Success"?"b-success":"b-danger"} /></td>
                      <td className="mono" style={{ fontSize:11, color:C.textMuted }}>{(t.created_at||'').replace('T',' ').slice(0,16)}</td>
                      <td style={{ fontSize:12 }}>{t.staff_name||t.staff||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "config" && (
        <div>
          {/* ── Quick Import from Daraja Portal ── */}
          <div className="card" style={{ marginBottom:16 }}>
            <div className="card-hd">
              <span className="card-title">🚀 Quick Import — Paste from Daraja Portal</span>
              <Badge label={config.env === "sandbox" ? "Sandbox" : "Live"} type={config.env === "sandbox" ? "b-warning" : "b-success"} />
            </div>
            <div className="card-body">
              <div style={{ background:C.infoDim, border:`1px solid rgba(59,158,255,.2)`, borderRadius:10, padding:12, marginBottom:18, fontSize:12, color:C.info }}>
                💡 Copy each value directly from your Safaricom Daraja app card (like the one shown) and paste below.
              </div>
              <div className="frow">
                <div className="fg">
                  <label className="flabel">Environment</label>
                  <select className="sel" value={config.env} onChange={e=>setConfig(c=>({...c,env:e.target.value}))}>
                    <option value="sandbox">🧪 Sandbox (Testing)</option>
                    <option value="live">🟢 Live (Production)</option>
                  </select>
                </div>
                <div className="fg">
                  <label className="flabel">Short Code / Paybill</label>
                  <input className="inp" placeholder="e.g. 174379 or your shortcode" value={config.shortcode||""} onChange={e=>setConfig(c=>({...c,shortcode:e.target.value,paybillNumber:e.target.value}))} />
                </div>
              </div>
              <div className="frow">
                <div className="fg">
                  <label className="flabel">Consumer Key</label>
                  <div style={{ position:"relative" }}>
                    <input className="inp" placeholder="Paste Consumer Key from Daraja" value={config.consumerKey||""} onChange={e=>setConfig(c=>({...c,consumerKey:e.target.value}))} style={{ paddingRight:36 }} />
                    {config.consumerKey && <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", fontSize:14 }}>✅</span>}
                  </div>
                </div>
                <div className="fg">
                  <label className="flabel">Consumer Secret</label>
                  <div style={{ position:"relative" }}>
                    <input className="inp" placeholder="Paste Consumer Secret from Daraja" value={config.consumerSecret||""} onChange={e=>setConfig(c=>({...c,consumerSecret:e.target.value}))} style={{ paddingRight:36 }} />
                    {config.consumerSecret && <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", fontSize:14 }}>✅</span>}
                  </div>
                </div>
              </div>
              <div className="frow">
                <div className="fg">
                  <label className="flabel">Passkey <span style={{ color:C.textMuted, fontWeight:400, textTransform:"none", letterSpacing:0 }}>(leave blank for sandbox default)</span></label>
                  <input className="inp" placeholder={config.env==="sandbox" ? "Uses default sandbox passkey if blank" : "Enter your live passkey"} value={config.passkey||""} onChange={e=>setConfig(c=>({...c,passkey:e.target.value}))} />
                </div>
                <div className="fg">
                  <label className="flabel">
                    Till Number &nbsp;
                    <span style={{ color:C.success, fontWeight:700, textTransform:"none", letterSpacing:0, fontSize:11 }}>
                      💰 Money goes directly here
                    </span>
                  </label>
                  <input
                    className="inp"
                    placeholder="Enter your M-Pesa Till Number e.g. 5404136"
                    value={config.tillNumber || "8359400"}
                    onChange={e => setConfig(c => ({ ...c, tillNumber: e.target.value || "8359400" }))}
                  />
                  <div style={{ fontSize:11, color:C.success, marginTop:4 }}>✅ Payments go directly to Till <strong>{config.tillNumber || "8359400"}</strong></div>
                </div>
              </div>

              {/* Credentials status summary */}
              <div style={{ background:C.surfaceAlt, borderRadius:10, padding:14, marginTop:8, marginBottom:16 }}>
                <div style={{ fontSize:11, color:C.textMuted, fontFamily:"'JetBrains Mono',monospace", letterSpacing:1, marginBottom:10, textTransform:"uppercase" }}>Credentials Status</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:8 }}>
                  {[
                    { label:"Consumer Key",    val:config.consumerKey,    },
                    { label:"Consumer Secret", val:config.consumerSecret, },
                    { label:"Short Code",      val:config.shortcode,      },
                    { label:"Passkey",         val:config.passkey,        optional:config.env==="sandbox" },
                  ].map(f => (
                    <div key={f.label} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:C.surface, borderRadius:8, border:`1px solid ${f.val ? "rgba(0,217,126,.2)" : C.border}` }}>
                      <span style={{ fontSize:15 }}>{f.val ? "✅" : f.optional ? "⚪" : "⚠️"}</span>
                      <div>
                        <div style={{ fontSize:10, color:C.textMuted, fontFamily:"'JetBrains Mono',monospace" }}>{f.label}</div>
                        <div style={{ fontSize:11, color:f.val ? C.success : f.optional ? C.textMuted : C.warning, fontWeight:600 }}>
                          {f.val ? `${f.val.slice(0,4)}${"•".repeat(Math.min(8,f.val.length-4))}` : f.optional ? "Optional" : "Missing"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                <button className="btn btn-primary" onClick={saveConfig} style={{ flex:1, justifyContent:"center" }}>
                  {configSaved ? "✅ Configuration Saved!" : "💾 Save Configuration"}
                </button>
                <button className="btn btn-outline btn-sm" onClick={()=>setConfig({ shortcode:"174379", consumerKey:"AR94AvcY7kAvvT2DjNYLISrZGAJCAjWT6hyOU2sEMVC8G9Sd", consumerSecret:"x3tHlKwk1fthm9ZxscVHLAsAiUgdfvYUbopPAwlHnAtF5rq3TMXYJGs1WKk2cGQe", passkey:"bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919", env:"sandbox", tillNumber:"", paybillNumber:"174379" })}>
                  🔄 Reset to Sandbox
                </button>
              </div>
            </div>
          </div>

          {/* ── Daraja Portal Quick Guide ── */}
          <div className="card">
            <div className="card-hd"><span className="card-title">📖 Where to Find Your Credentials</span></div>
            <div className="card-body">
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12 }}>
                {[
                  { icon:"🔑", label:"Consumer Key", desc:"Found on your Daraja app card — click the copy icon next to AR94***" },
                  { icon:"🔐", label:"Consumer Secret", desc:"Found on your Daraja app card — click the copy icon next to x3tH***" },
                  { icon:"🏦", label:"Short Code", desc:"Your Paybill or Till number (shows as N/A on sandbox — use 174379 for testing)" },
                  { icon:"🗝",  label:"Passkey",    desc:"Found in Daraja portal under your app settings. Sandbox has a default passkey." },
                ].map(g => (
                  <div key={g.label} style={{ padding:12, background:C.surfaceAlt, borderRadius:10, border:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:22, marginBottom:8 }}>{g.icon}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:C.text, marginBottom:4 }}>{g.label}</div>
                    <div style={{ fontSize:11, color:C.textMuted, lineHeight:1.5 }}>{g.desc}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:14, background:C.warningDim, border:`1px solid rgba(240,165,0,.25)`, borderRadius:10, padding:12, fontSize:12, color:C.warning }}>
                ⚠️ Keep credentials confidential. For STK Push (Lipa na M-Pesa Online), the <strong>Short Code</strong> for sandbox testing is <code style={{ background:"rgba(240,165,0,.15)", padding:"1px 5px", borderRadius:4 }}>174379</code> and the default sandbox passkey is available in the Daraja portal under your app's "Go Live" section.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// INVOICE MANAGER
// ═══════════════════════════════════════════════════════════════════
function InvoiceManager({ data, user, notify }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ customerName:"", customerEmail:"", customerPhone:"", branch:"Main Branch", dueDate:"", notes:"", taxRate:16, discount:0, items:[] });
  const [newItem, setNewItem] = useState({ description:"", qty:1, unit_price:"" });

  useEffect(() => {
    invoicesAPI.list().then(r => { setInvoices(r.data||[]); setLoading(false); }).catch(()=>setLoading(false));
  }, []);

  const subtotal = form.items.reduce((s,i) => s + i.qty * i.unit_price, 0);
  const taxAmt   = (subtotal - +form.discount) * +form.taxRate / 100;
  const total    = subtotal - +form.discount + taxAmt;

  const addItem = () => {
    if (!newItem.description || !newItem.unit_price) return notify("Description and price required","error");
    setForm(f => ({ ...f, items:[...f.items, { ...newItem, qty:+newItem.qty, unit_price:+newItem.unit_price }] }));
    setNewItem({ description:"", qty:1, unit_price:"" });
  };

  const save = async () => {
    if (!form.customerName || !form.items.length) return notify("Customer name and at least one item required","error");
    setSaving(true);
    try {
      const res = await invoicesAPI.create({ customer_name:form.customerName, customer_email:form.customerEmail, customer_phone:form.customerPhone, branch:form.branch, due_date:form.dueDate||null, notes:form.notes, tax_rate:+form.taxRate, discount:+form.discount, items:form.items });
      setInvoices(v => [res.data, ...v]);
      setShowForm(false);
      setForm({ customerName:"", customerEmail:"", customerPhone:"", branch:"Main Branch", dueDate:"", notes:"", taxRate:16, discount:0, items:[] });
      notify("Invoice created ✅");
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const updateStatus = async (id, status) => {
    try {
      const res = await invoicesAPI.updateStatus(id, status);
      setInvoices(v => v.map(x => x.id===id ? res.data : x));
      notify(`Invoice → ${status}`);
    } catch(e) { notify(e.message,"error"); }
  };

  const filtered = invoices.filter(i => {
    const matchStatus = statusFilter==="All" || i.status===statusFilter;
    const matchSearch = !search || i.invoice_number?.toLowerCase().includes(search.toLowerCase()) || i.customer_name?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const statusColor = s => ({ Draft:"b-info", Sent:"b-warning", Paid:"b-success", Partial:"b-warning", Overdue:"b-danger", Cancelled:"b-danger" }[s]||"b-info");

  return (
    <div className="fade-in">
      <div className="stats-grid" style={{ gridTemplateColumns:"repeat(4,1fr)", marginBottom:20 }}>
        <div className="stat-card blue"><div className="stat-value">{invoices.length}</div><div className="stat-label">Total Invoices</div></div>
        <div className="stat-card green"><div className="stat-value">{fmtKsh(invoices.filter(i=>i.status==="Paid").reduce((s,i)=>s+parseFloat(i.total||0),0))}</div><div className="stat-label">Paid</div></div>
        <div className="stat-card gold"><div className="stat-value">{fmtKsh(invoices.filter(i=>["Sent","Partial"].includes(i.status)).reduce((s,i)=>s+parseFloat(i.balance||0),0))}</div><div className="stat-label">Outstanding</div></div>
        <div className="stat-card red"><div className="stat-value">{invoices.filter(i=>i.status==="Overdue").length}</div><div className="stat-label">Overdue</div></div>
      </div>

      <div className="card">
        <div className="card-hd">
          <span className="card-title">🧾 Invoices</span>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <input className="inp" style={{ width:180 }} placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} />
            <select className="sel" style={{ width:130 }} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
              {["All","Draft","Sent","Paid","Partial","Overdue","Cancelled"].map(s=><option key={s}>{s}</option>)}
            </select>
            <button className="btn btn-primary" onClick={()=>setShowForm(true)}>+ New Invoice</button>
          </div>
        </div>
        {loading ? <div className="card-body"><Loading /></div> : filtered.length===0 ? (
          <div className="empty-state"><div className="es-icon">🧾</div><p>No invoices found.</p></div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Invoice #</th><th>Customer</th><th>Branch</th><th>Total</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map(inv => (
                  <tr key={inv.id}>
                    <td className="mono" style={{ fontWeight:600, color:C.accent }}>{inv.invoice_number}</td>
                    <td><div style={{ fontWeight:600 }}>{inv.customer_name}</div><div style={{ fontSize:11, color:C.textMuted }}>{inv.customer_phone}</div></td>
                    <td style={{ fontSize:12 }}>{inv.branch}</td>
                    <td className="mono" style={{ fontWeight:700 }}>{fmtKsh(parseFloat(inv.total||0))}</td>
                    <td className="mono" style={{ color:C.success }}>{fmtKsh(parseFloat(inv.amount_paid||0))}</td>
                    <td className="mono" style={{ color:parseFloat(inv.balance||0)>0?C.danger:C.success, fontWeight:700 }}>{fmtKsh(parseFloat(inv.balance||0))}</td>
                    <td style={{ fontSize:12, color:inv.due_date && new Date(inv.due_date)<new Date()?C.danger:C.textMuted }}>{inv.due_date||"—"}</td>
                    <td><Badge label={inv.status} type={statusColor(inv.status)} /></td>
                    <td>
                      <div style={{ display:"flex", gap:4 }}>
                        {inv.status==="Draft" && <button className="btn btn-info btn-sm" onClick={()=>updateStatus(inv.id,"Sent")}>Send</button>}
                        {["Sent","Partial"].includes(inv.status) && <button className="btn btn-success btn-sm" onClick={()=>updateStatus(inv.id,"Paid")}>Mark Paid</button>}
                        {inv.status!=="Cancelled" && <button className="btn btn-danger btn-sm" onClick={()=>updateStatus(inv.id,"Cancelled")}>Cancel</button>}
                        <button className="btn btn-danger btn-sm" onClick={async()=>{ if(!window.confirm('Delete this invoice permanently?'))return; try{ await invoicesAPI.delete(inv.id); load(); notify('Invoice deleted'); }catch(e){ notify(e.message,'error'); } }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <Overlay onClose={()=>setShowForm(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><span className="modal-title">🧾 New Invoice</span><button className="modal-close" onClick={()=>setShowForm(false)}>✕</button></div>
            <div className="modal-body">
              <div className="frow">
                <div className="fg"><label className="flabel">Customer Name *</label><input className="inp" value={form.customerName} onChange={e=>setForm(f=>({...f,customerName:e.target.value}))} /></div>
                <div className="fg"><label className="flabel">Phone</label><input className="inp" value={form.customerPhone} onChange={e=>setForm(f=>({...f,customerPhone:e.target.value}))} /></div>
              </div>
              <div className="frow">
                <div className="fg"><label className="flabel">Email</label><input className="inp" value={form.customerEmail} onChange={e=>setForm(f=>({...f,customerEmail:e.target.value}))} /></div>
                <div className="fg"><label className="flabel">Branch</label><select className="sel" value={form.branch} onChange={e=>setForm(f=>({...f,branch:e.target.value}))}><option>Main Branch</option><option>West Branch</option><option>Juja Branch</option></select></div>
              </div>
              <div className="frow">
                <div className="fg"><label className="flabel">Due Date</label><input className="inp" type="date" value={form.dueDate} onChange={e=>setForm(f=>({...f,dueDate:e.target.value}))} /></div>
                <div className="fg"><label className="flabel">Tax Rate (%)</label><input className="inp" type="number" value={form.taxRate} onChange={e=>setForm(f=>({...f,taxRate:e.target.value}))} /></div>
                <div className="fg"><label className="flabel">Discount (KSh)</label><input className="inp" type="number" value={form.discount} onChange={e=>setForm(f=>({...f,discount:e.target.value}))} /></div>
              </div>
              <div className="fg"><label className="flabel">Notes</label><textarea className="inp" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></div>

              <div style={{ marginTop:16, padding:"12px 0", borderTop:`1px solid ${C.border}` }}>
                <div style={{ fontWeight:700, marginBottom:10 }}>Line Items</div>
                <div className="frow" style={{ marginBottom:8 }}>
                  <div className="fg" style={{ flex:3 }}><input className="inp" placeholder="Description" value={newItem.description} onChange={e=>setNewItem(i=>({...i,description:e.target.value}))} /></div>
                  <div className="fg"><input className="inp" type="number" placeholder="Qty" value={newItem.qty} onChange={e=>setNewItem(i=>({...i,qty:e.target.value}))} /></div>
                  <div className="fg"><input className="inp" type="number" placeholder="Unit Price" value={newItem.unit_price} onChange={e=>setNewItem(i=>({...i,unit_price:e.target.value}))} /></div>
                  <button className="btn btn-primary btn-sm" onClick={addItem}>Add</button>
                </div>
                {form.items.map((item,idx) => (
                  <div key={idx} style={{ display:"flex", justifyContent:"space-between", padding:"6px 10px", background:C.surfaceAlt, borderRadius:6, marginBottom:4, fontSize:13 }}>
                    <span>{item.description}</span>
                    <span>{item.qty} × {fmtKsh(item.unit_price)} = <strong>{fmtKsh(item.qty*item.unit_price)}</strong></span>
                    <button style={{ background:"none", border:"none", color:C.danger, cursor:"pointer" }} onClick={()=>setForm(f=>({...f,items:f.items.filter((_,i)=>i!==idx)}))}>✕</button>
                  </div>
                ))}
                <div style={{ textAlign:"right", marginTop:12, fontSize:13, color:C.textMuted }}>
                  <div>Subtotal: {fmtKsh(subtotal)}</div>
                  <div>Tax ({form.taxRate}%): {fmtKsh(taxAmt)}</div>
                  <div style={{ fontSize:18, fontWeight:800, color:C.text, marginTop:4 }}>Total: {fmtKsh(total)}</div>
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><Spinner/>Saving...</>:"Create Invoice"}</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAYMENTS LEDGER
// ═══════════════════════════════════════════════════════════════════
function PaymentsLedger({ user, notify }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ payment_type:"Received", method:"Cash", amount:"", party_name:"", party_type:"Customer", reference_type:"", reference_id:"", notes:"", branch:"Main Branch", payment_date:new Date().toISOString().split("T")[0] });

  useEffect(() => {
    paymentsAPI.list().then(r => { setPayments(r.data||[]); setLoading(false); }).catch(()=>setLoading(false));
  }, []);

  const save = async () => {
    if (!form.amount) return notify("Amount required","error");
    setSaving(true);
    try {
      const res = await paymentsAPI.create(form);
      setPayments(v => [res.data, ...v]);
      setShowForm(false);
      setForm({ payment_type:"Received", method:"Cash", amount:"", party_name:"", party_type:"Customer", reference_type:"", reference_id:"", notes:"", branch:"Main Branch", payment_date:new Date().toISOString().split("T")[0] });
      notify("Payment recorded ✅");
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const del = async (id) => {
    if (!window.confirm("Delete this payment record?")) return;
    try { await paymentsAPI.delete(id); setPayments(v => v.filter(p => p.id !== id)); notify("Payment deleted"); }
    catch(e) { notify(e.message,"error"); }
  };

  const filtered = payments
    .filter(p => filter==="All" || p.payment_type===filter)
    .filter(p => !search || (p.party_name||"").toLowerCase().includes(search.toLowerCase()) || (p.payment_number||"").toLowerCase().includes(search.toLowerCase()));

  const totalIn  = payments.filter(p=>p.payment_type==="Received").reduce((s,p)=>s+parseFloat(p.amount||0),0);
  const totalOut = payments.filter(p=>p.payment_type==="Sent").reduce((s,p)=>s+parseFloat(p.amount||0),0);

  if (showForm) return (
    <div className="fade-in">
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button className="btn btn-ghost" onClick={()=>setShowForm(false)}>← Back</button>
        <h2 style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:700, fontSize:20, margin:0 }}>💰 Record Payment</h2>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div className="card">
          <div className="card-hd"><span className="card-title">Payment Details</span></div>
          <div className="card-body" style={{ padding:24 }}>
            <div className="frow">
              <div className="fg"><label className="flabel">Type</label>
                <select className="sel" value={form.payment_type} onChange={e=>setForm(f=>({...f,payment_type:e.target.value}))}>
                  <option>Received</option><option>Sent</option>
                </select>
              </div>
              <div className="fg"><label className="flabel">Method</label>
                <select className="sel" value={form.method} onChange={e=>setForm(f=>({...f,method:e.target.value}))}>
                  <option>Cash</option><option>M-Pesa</option><option>Bank Transfer</option><option>Cheque</option><option>Card</option>
                </select>
              </div>
            </div>
            <div className="frow">
              <div className="fg"><label className="flabel">Amount (KSh) *</label><input className="inp" type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0" /></div>
              <div className="fg"><label className="flabel">Date</label><input className="inp" type="date" value={form.payment_date} onChange={e=>setForm(f=>({...f,payment_date:e.target.value}))} /></div>
            </div>
            <div className="fg"><label className="flabel">Branch</label>
              <select className="sel" value={form.branch} onChange={e=>setForm(f=>({...f,branch:e.target.value}))}>
                <option>Main Branch</option><option>West Branch</option><option>Juja Branch</option>
              </select>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-hd"><span className="card-title">Party & Reference</span></div>
          <div className="card-body" style={{ padding:24 }}>
            <div className="frow">
              <div className="fg"><label className="flabel">Party Name</label><input className="inp" value={form.party_name} onChange={e=>setForm(f=>({...f,party_name:e.target.value}))} placeholder="Customer / Supplier name" /></div>
              <div className="fg"><label className="flabel">Party Type</label>
                <select className="sel" value={form.party_type} onChange={e=>setForm(f=>({...f,party_type:e.target.value}))}>
                  <option>Customer</option><option>Supplier</option><option>Employee</option><option>Other</option>
                </select>
              </div>
            </div>
            <div className="frow">
              <div className="fg"><label className="flabel">Reference Type</label><input className="inp" placeholder="Invoice / Sale / PO..." value={form.reference_type} onChange={e=>setForm(f=>({...f,reference_type:e.target.value}))} /></div>
              <div className="fg"><label className="flabel">Reference #</label><input className="inp" value={form.reference_id} onChange={e=>setForm(f=>({...f,reference_id:e.target.value}))} /></div>
            </div>
            <div className="fg"><label className="flabel">Notes</label><textarea className="inp" rows={3} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Optional notes..." /></div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
              <button className="btn btn-outline" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><Spinner/>Saving...</>:"Record Payment"}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fade-in">
      <div className="stats-grid" style={{ gridTemplateColumns:"repeat(3,1fr)", marginBottom:20 }}>
        <div className="stat-card green">
          <div className="stat-icon-box" style={{ background:C.successDim, marginBottom:8 }}>💚</div>
          <div className="stat-value" style={{ color:C.success }}>{fmtKsh(totalIn)}</div>
          <div className="stat-label">Total Received</div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon-box" style={{ background:C.dangerDim, marginBottom:8 }}>❤️</div>
          <div className="stat-value" style={{ color:C.danger }}>{fmtKsh(totalOut)}</div>
          <div className="stat-label">Total Sent</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-icon-box" style={{ background:C.infoDim, marginBottom:8 }}>💰</div>
          <div className="stat-value" style={{ color: totalIn-totalOut >= 0 ? C.success : C.danger }}>{fmtKsh(totalIn-totalOut)}</div>
          <div className="stat-label">Net Position</div>
        </div>
      </div>
      <div className="card">
        <div className="card-hd">
          <span className="card-title">💰 Payments Ledger</span>
          <div style={{ display:"flex", gap:8 }}>
            <div className="search-wrap"><span className="search-icon">🔍</span><input className="inp" placeholder="Search party / ref..." value={search} onChange={e=>setSearch(e.target.value)} /></div>
            <select className="sel" value={filter} onChange={e=>setFilter(e.target.value)}><option>All</option><option>Received</option><option>Sent</option></select>
            <button className="btn btn-primary" onClick={()=>setShowForm(true)}>+ Record Payment</button>
          </div>
        </div>
        {loading ? <div className="card-body"><Loading /></div> : filtered.length===0 ? (
          <div className="empty-state" style={{ padding:48 }}>
            <div className="es-icon">💰</div>
            <p style={{ color:C.textMuted, margin:"8px 0 16px" }}>{payments.length===0 ? "No payments recorded yet" : "No payments match your filter"}</p>
            {payments.length===0 && <button className="btn btn-primary" onClick={()=>setShowForm(true)}>+ Record First Payment</button>}
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Ref#</th><th>Type</th><th>Party</th><th>Method</th><th>Amount</th><th>Reference</th><th>Branch</th><th>Date</th><th>By</th><th></th></tr></thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td className="mono" style={{ fontSize:11, color:C.textMuted }}>{p.payment_number}</td>
                    <td><Badge label={p.payment_type} type={p.payment_type==="Received"?"b-success":"b-danger"} /></td>
                    <td><div style={{ fontWeight:600 }}>{p.party_name||"—"}</div><div style={{ fontSize:11, color:C.textMuted }}>{p.party_type}</div></td>
                    <td><Badge label={p.method} type="b-info" /></td>
                    <td className="mono" style={{ fontWeight:700, color:p.payment_type==="Received"?C.success:C.danger }}>{fmtKsh(parseFloat(p.amount||0))}</td>
                    <td style={{ fontSize:11, color:C.textMuted }}>{p.reference_type} {p.reference_id}</td>
                    <td style={{ fontSize:12 }}>{p.branch||"—"}</td>
                    <td style={{ fontSize:12 }}>{p.payment_date}</td>
                    <td style={{ fontSize:12, color:C.textMuted }}>{p.recorded_by}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={()=>del(p.id)}>🗑️</button></td>
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

// ═══════════════════════════════════════════════════════════════════
// WAREHOUSE MANAGER
// ═══════════════════════════════════════════════════════════════════
function WarehouseManager({ notify }) {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:"", location:"", manager:"", phone:"", capacity:"" });

  useEffect(() => {
    warehousesAPI.list().then(r => { setWarehouses(r.data||[]); setLoading(false); }).catch(()=>setLoading(false));
  }, []);

  const open = (w=null) => { setEditing(w); setForm(w ? { name:w.name, location:w.location||"", manager:w.manager||"", phone:w.phone||"", capacity:w.capacity||"" } : { name:"", location:"", manager:"", phone:"", capacity:"" }); setShowForm(true); };

  const save = async () => {
    if (!form.name) return notify("Name required","error");
    setSaving(true);
    try {
      const res = editing ? await warehousesAPI.update(editing.id, form) : await warehousesAPI.create(form);
      editing ? setWarehouses(v => v.map(x=>x.id===editing.id?res.data:x)) : setWarehouses(v=>[res.data,...v]);
      setShowForm(false); notify(editing?"Warehouse updated ✅":"Warehouse created ✅");
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-hd"><span className="card-title">🏭 Warehouses / Branches</span><button className="btn btn-primary" onClick={()=>open()}>+ Add Warehouse</button></div>
        {loading ? <div className="card-body"><Loading /></div> : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Name</th><th>Location</th><th>Manager</th><th>Phone</th><th>Products</th><th>Total Stock</th><th>Actions</th></tr></thead>
              <tbody>
                {warehouses.map(w => (
                  <tr key={w.id}>
                    <td style={{ fontWeight:700 }}>{w.name}</td>
                    <td style={{ fontSize:12 }}>{w.location||"—"}</td>
                    <td style={{ fontSize:12 }}>{w.manager||"—"}</td>
                    <td style={{ fontSize:12 }}>{w.phone||"—"}</td>
                    <td className="mono">{w.product_count||0}</td>
                    <td className="mono">{w.total_stock||0}</td>
                    <td><button className="btn btn-info btn-sm" onClick={()=>open(w)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showForm && (
        <Overlay onClose={()=>setShowForm(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><span className="modal-title">{editing?"Edit":"Add"} Warehouse</span><button className="modal-close" onClick={()=>setShowForm(false)}>✕</button></div>
            <div className="modal-body">
              <div className="fg"><label className="flabel">Name *</label><input className="inp" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
              <div className="fg"><label className="flabel">Location</label><input className="inp" value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} /></div>
              <div className="frow">
                <div className="fg"><label className="flabel">Manager</label><input className="inp" value={form.manager} onChange={e=>setForm(f=>({...f,manager:e.target.value}))} /></div>
                <div className="fg"><label className="flabel">Phone</label><input className="inp" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><Spinner/>Saving...</>:"Save"}</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PRODUCT CATEGORIES
// ═══════════════════════════════════════════════════════════════════
function ProductCategories({ notify }) {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:"", description:"" });

  useEffect(() => {
    productCategoriesAPI.list().then(r=>{ setCats(r.data||[]); setLoading(false); }).catch(()=>setLoading(false));
  }, []);

  const open = (c=null) => { setEditing(c); setForm(c?{name:c.name,description:c.description||""}:{name:"",description:""}); setShowForm(true); };

  const save = async () => {
    if (!form.name) return notify("Name required","error");
    setSaving(true);
    try {
      const res = editing ? await productCategoriesAPI.update(editing.id, form) : await productCategoriesAPI.create(form);
      editing ? setCats(v=>v.map(x=>x.id===editing.id?res.data:x)) : setCats(v=>[res.data,...v]);
      setShowForm(false); notify("Saved ✅");
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const del = async id => {
    try { await productCategoriesAPI.delete(id); setCats(v=>v.filter(x=>x.id!==id)); notify("Deleted","error"); }
    catch(e) { notify(e.message,"error"); }
  };

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-hd"><span className="card-title">📂 Product Categories</span><button className="btn btn-primary" onClick={()=>open()}>+ Add Category</button></div>
        {loading ? <div className="card-body"><Loading /></div> : cats.length===0 ? <div className="empty-state"><div className="es-icon">📂</div><p>No categories yet.</p></div> : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Name</th><th>Description</th><th>Actions</th></tr></thead>
              <tbody>
                {cats.map(c=>(
                  <tr key={c.id}>
                    <td style={{ fontWeight:600 }}>{c.name}</td>
                    <td style={{ fontSize:12, color:C.textMuted }}>{c.description||"—"}</td>
                    <td><div style={{ display:"flex", gap:4 }}><button className="btn btn-info btn-sm" onClick={()=>open(c)}>Edit</button><button className="btn btn-danger btn-sm" onClick={()=>del(c.id)}>Del</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showForm && (
        <Overlay onClose={()=>setShowForm(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><span className="modal-title">{editing?"Edit":"Add"} Category</span><button className="modal-close" onClick={()=>setShowForm(false)}>✕</button></div>
            <div className="modal-body">
              <div className="fg"><label className="flabel">Name *</label><input className="inp" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
              <div className="fg"><label className="flabel">Description</label><textarea className="inp" rows={2} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} /></div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><Spinner/>Saving...</>:"Save"}</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EMPLOYEE MANAGER
// ═══════════════════════════════════════════════════════════════════
function EmployeeManager({ notify }) {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name:"", email:"", phone:"", id_number:"", department_id:"", job_title:"", branch:"Main Branch", employment_type:"Full-Time", salary:"", hire_date:new Date().toISOString().split("T")[0], notes:"" });

  useEffect(() => {
    Promise.all([
      employeesAPI.list().then(r=>setEmployees(r.data||[])),
      departmentsAPI.list().then(r=>setDepartments(r.data||[])),
    ]).finally(()=>setLoading(false));
  }, []);

  const open = (e=null) => {
    setEditing(e);
    setForm(e ? { name:e.name, email:e.email||"", phone:e.phone||"", id_number:e.id_number||"", department_id:e.department_id||"", job_title:e.job_title||"", branch:e.branch||"Main Branch", employment_type:e.employment_type||"Full-Time", salary:e.salary||"", hire_date:e.hire_date||new Date().toISOString().split("T")[0], notes:e.notes||"" }
             : { name:"", email:"", phone:"", id_number:"", department_id:"", job_title:"", branch:"Main Branch", employment_type:"Full-Time", salary:"", hire_date:new Date().toISOString().split("T")[0], notes:"" });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name) return notify("Name required","error");
    setSaving(true);
    try {
      const dept = departments.find(d=>d.id===form.department_id);
      const payload = { ...form, department_name: dept?.name||null, salary:+form.salary||0 };
      const res = editing ? await employeesAPI.update(editing.id, payload) : await employeesAPI.create(payload);
      editing ? setEmployees(v=>v.map(x=>x.id===editing.id?res.data:x)) : setEmployees(v=>[res.data,...v]);
      setShowForm(false); notify(editing?"Employee updated ✅":"Employee added ✅");
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const terminate = async id => {
    if (!confirm("Terminate this employee?")) return;
    try { await employeesAPI.delete(id); setEmployees(v=>v.map(x=>x.id===id?{...x,status:"Terminated"}:x)); notify("Employee terminated","error"); }
    catch(e) { notify(e.message,"error"); }
  };

  const statusColor = s => ({Active:"b-success",Inactive:"b-warning",Terminated:"b-danger","On Leave":"b-info"}[s]||"b-info");
  const typeColor   = t => ({"Full-Time":"b-success","Part-Time":"b-warning",Contract:"b-info",Intern:"b-ghost"}[t]||"b-info");
  const filtered    = employees.filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.job_title?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fade-in">
      <div className="stats-grid" style={{ gridTemplateColumns:"repeat(4,1fr)", marginBottom:20 }}>
        <div className="stat-card green"><div className="stat-value">{employees.filter(e=>e.status==="Active").length}</div><div className="stat-label">Active</div></div>
        <div className="stat-card blue"><div className="stat-value">{employees.filter(e=>e.employment_type==="Full-Time").length}</div><div className="stat-label">Full-Time</div></div>
        <div className="stat-card gold"><div className="stat-value">{employees.filter(e=>e.employment_type==="Part-Time"||e.employment_type==="Contract").length}</div><div className="stat-label">Part-Time/Contract</div></div>
        <div className="stat-card blue"><div className="stat-value">{fmtKsh(employees.filter(e=>e.status==="Active").reduce((s,e)=>s+parseFloat(e.salary||0),0))}</div><div className="stat-label">Monthly Payroll</div></div>
      </div>
      <div className="card">
        <div className="card-hd">
          <span className="card-title">👤 Employees</span>
          <div style={{ display:"flex", gap:8 }}>
            <input className="inp" style={{ width:200 }} placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} />
            <button className="btn btn-primary" onClick={()=>open()}>+ Add Employee</button>
          </div>
        </div>
        {loading ? <div className="card-body"><Loading /></div> : filtered.length===0 ? <div className="empty-state"><div className="es-icon">👤</div><p>No employees found.</p></div> : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Role</th><th>Branch</th><th>Type</th><th>Salary</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map(e=>(
                  <tr key={e.id}>
                    <td className="mono" style={{ fontSize:11 }}>{e.employee_number}</td>
                    <td><div style={{ display:"flex", alignItems:"center", gap:8 }}><div style={{ width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},${C.info})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0 }}>{e.avatar||e.name[0]}</div><div><div style={{ fontWeight:600 }}>{e.name}</div><div style={{ fontSize:11,color:C.textMuted }}>{e.email}</div></div></div></td>
                    <td style={{ fontSize:12 }}>{e.department_name||"—"}</td>
                    <td style={{ fontSize:12 }}>{e.job_title||"—"}</td>
                    <td style={{ fontSize:12 }}>{e.branch}</td>
                    <td><Badge label={e.employment_type} type={typeColor(e.employment_type)} /></td>
                    <td className="mono">{fmtKsh(parseFloat(e.salary||0))}</td>
                    <td><Badge label={e.status} type={statusColor(e.status)} /></td>
                    <td><div style={{ display:"flex", gap:4 }}>
                      <button className="btn btn-info btn-sm" onClick={()=>open(e)}>Edit</button>
                      {e.status==="Active" && <button className="btn btn-danger btn-sm" onClick={()=>terminate(e.id)}>End</button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showForm && (
        <Overlay onClose={()=>setShowForm(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><span className="modal-title">{editing?"Edit":"Add"} Employee</span><button className="modal-close" onClick={()=>setShowForm(false)}>✕</button></div>
            <div className="modal-body">
              <div className="frow"><div className="fg"><label className="flabel">Full Name *</label><input className="inp" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div><div className="fg"><label className="flabel">National ID</label><input className="inp" value={form.id_number} onChange={e=>setForm(f=>({...f,id_number:e.target.value}))} /></div></div>
              <div className="frow"><div className="fg"><label className="flabel">Email</label><input className="inp" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} /></div><div className="fg"><label className="flabel">Phone</label><input className="inp" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></div></div>
              <div className="frow">
                <div className="fg"><label className="flabel">Department</label><select className="sel" value={form.department_id} onChange={e=>setForm(f=>({...f,department_id:e.target.value}))}><option value="">—</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                <div className="fg"><label className="flabel">Job Title</label><input className="inp" value={form.job_title} onChange={e=>setForm(f=>({...f,job_title:e.target.value}))} /></div>
              </div>
              <div className="frow">
                <div className="fg"><label className="flabel">Branch</label><select className="sel" value={form.branch} onChange={e=>setForm(f=>({...f,branch:e.target.value}))}><option>Main Branch</option><option>West Branch</option><option>Juja Branch</option></select></div>
                <div className="fg"><label className="flabel">Employment Type</label><select className="sel" value={form.employment_type} onChange={e=>setForm(f=>({...f,employment_type:e.target.value}))}><option>Full-Time</option><option>Part-Time</option><option>Contract</option><option>Intern</option></select></div>
              </div>
              <div className="frow"><div className="fg"><label className="flabel">Salary (KSh/month)</label><input className="inp" type="number" value={form.salary} onChange={e=>setForm(f=>({...f,salary:e.target.value}))} /></div><div className="fg"><label className="flabel">Hire Date</label><input className="inp" type="date" value={form.hire_date} onChange={e=>setForm(f=>({...f,hire_date:e.target.value}))} /></div></div>
              <div className="fg"><label className="flabel">Notes</label><textarea className="inp" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></div>
            </div>
            <div className="modal-ft"><button className="btn btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><Spinner/>Saving...</>:"Save"}</button></div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DEPARTMENT MANAGER
// ═══════════════════════════════════════════════════════════════════
function DepartmentManager({ notify }) {
  const [depts, setDepts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:"", description:"", budget:"" });

  useEffect(() => { departmentsAPI.list().then(r=>{ setDepts(r.data||[]); setLoading(false); }).catch(()=>setLoading(false)); }, []);

  const open = (d=null) => { setEditing(d); setForm(d?{name:d.name,description:d.description||"",budget:d.budget||""}:{name:"",description:"",budget:""}); setShowForm(true); };
  const save = async () => {
    if (!form.name) return notify("Name required","error");
    setSaving(true);
    try {
      const payload = { ...form, budget:+form.budget||0 };
      const res = editing ? await departmentsAPI.update(editing.id, payload) : await departmentsAPI.create(payload);
      editing ? setDepts(v=>v.map(x=>x.id===editing.id?res.data:x)) : setDepts(v=>[res.data,...v]);
      setShowForm(false); notify("Saved ✅");
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };
  const del = async id => { try { await departmentsAPI.delete(id); setDepts(v=>v.filter(x=>x.id!==id)); notify("Deleted","error"); } catch(e) { notify(e.message,"error"); } };

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-hd"><span className="card-title">🏛️ Departments</span><button className="btn btn-primary" onClick={()=>open()}>+ Add Department</button></div>
        {loading ? <div className="card-body"><Loading /></div> : depts.length===0 ? <div className="empty-state"><div className="es-icon">🏛️</div><p>No departments yet.</p></div> : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Name</th><th>Description</th><th>Employees</th><th>Budget</th><th>Actions</th></tr></thead>
              <tbody>{depts.map(d=><tr key={d.id}><td style={{ fontWeight:700 }}>{d.name}</td><td style={{ fontSize:12, color:C.textMuted }}>{d.description||"—"}</td><td className="mono">{d.employee_count||0}</td><td className="mono">{fmtKsh(parseFloat(d.budget||0))}</td><td><div style={{ display:"flex", gap:4 }}><button className="btn btn-info btn-sm" onClick={()=>open(d)}>Edit</button>{!d.is_system&&<button className="btn btn-danger btn-sm" onClick={()=>del(d.id)}>Del</button>}</div></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
      {showForm && <Overlay onClose={()=>setShowForm(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-hd"><span className="modal-title">{editing?"Edit":"Add"} Department</span><button className="modal-close" onClick={()=>setShowForm(false)}>✕</button></div><div className="modal-body"><div className="fg"><label className="flabel">Name *</label><input className="inp" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div><div className="fg"><label className="flabel">Description</label><textarea className="inp" rows={2} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} /></div><div className="fg"><label className="flabel">Budget (KSh)</label><input className="inp" type="number" value={form.budget} onChange={e=>setForm(f=>({...f,budget:e.target.value}))} /></div></div><div className="modal-ft"><button className="btn btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><Spinner/>Saving...</>:"Save"}</button></div></div></Overlay>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ATTENDANCE MANAGER
// ═══════════════════════════════════════════════════════════════════
function AttendanceManager({ notify }) {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("daily");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selDate, setSelDate] = useState(new Date().toISOString().split("T")[0]);
  const [selMonth, setSelMonth] = useState(new Date().toISOString().slice(0,7));
  const [form, setForm] = useState({ employee_id:"", date:new Date().toISOString().split("T")[0], clock_in:"", clock_out:"", status:"Present", notes:"" });

  const load = async () => {
    setLoading(true);
    try {
      const [att, summ, emps] = await Promise.all([
        attendanceAPI.list({ date: tab==="daily"?selDate:undefined, month: tab==="monthly"?selMonth:undefined }),
        attendanceAPI.summary(selMonth),
        employeesAPI.list({ status:"Active" }),
      ]);
      setRecords(att.data||[]);
      setSummary(summ.data||[]);
      setEmployees(emps.data||[]);
    } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); }, [tab, selDate, selMonth]);

  const save = async () => {
    if (!form.employee_id || !form.date) return notify("Employee and date required","error");
    setSaving(true);
    try {
      const res = await attendanceAPI.record(form);
      setRecords(v=>[res.data,...v.filter(r=>!(r.employee_id===form.employee_id&&r.date===form.date))]);
      setShowForm(false); notify("Attendance recorded ✅");
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const statusColor = s => ({Present:"b-success",Absent:"b-danger",Late:"b-warning","Half-Day":"b-warning",Leave:"b-info",Holiday:"b-ghost"}[s]||"b-info");

  return (
    <div className="fade-in">
      <div style={{ overflowX:"auto", marginBottom:20 }}>
        <div style={{ display:"flex", gap:4, background:C.surfaceAlt, padding:4, borderRadius:10, minWidth:"max-content" }}>
          {[["daily","📅","Daily"],["monthly","📊","Monthly Summary"]].map(([k,icon,label])=>(
            <button key={k} onClick={()=>setTab(k)} style={{ padding:"8px 16px",borderRadius:7,border:"none",cursor:"pointer",background:tab===k?C.surface:"transparent",color:tab===k?C.text:C.textMuted,fontWeight:600,fontSize:12.5,fontFamily:"inherit",display:"flex",alignItems:"center",gap:5 }}>
              <span>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {tab==="daily" && (
        <div className="card">
          <div className="card-hd">
            <span className="card-title">📅 Daily Attendance</span>
            <div style={{ display:"flex", gap:8 }}>
              <input className="inp" type="date" value={selDate} onChange={e=>setSelDate(e.target.value)} />
              <button className="btn btn-primary" onClick={()=>setShowForm(true)}>+ Record</button>
            </div>
          </div>
          {loading ? <div className="card-body"><Loading /></div> : records.length===0 ? <div className="empty-state"><div className="es-icon">📅</div><p>No attendance for this date.</p></div> : (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Employee</th><th>Department</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Status</th><th>Notes</th><th></th></tr></thead>
                <tbody>{records.map(r=><tr key={r.id}><td style={{ fontWeight:600 }}>{r.employee_name}</td><td style={{ fontSize:12 }}>{r.department_name||"—"}</td><td className="mono" style={{ fontSize:12 }}>{r.clock_in?new Date(r.clock_in).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"—"}</td><td className="mono" style={{ fontSize:12 }}>{r.clock_out?new Date(r.clock_out).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"—"}</td><td className="mono">{r.hours_worked||"—"}</td><td><Badge label={r.status} type={statusColor(r.status)} /></td><td style={{ fontSize:12, color:C.textMuted }}>{r.notes||"—"}</td><td><button className="btn btn-danger btn-sm" onClick={async()=>{ if(!window.confirm('Delete this record?'))return; try{ await attendanceAPI.delete(r.id); load(); notify('Deleted'); }catch(e){ notify(e.message,'error'); } }}>🗑️</button></td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab==="monthly" && (
        <div className="card">
          <div className="card-hd">
            <span className="card-title">📊 Monthly Summary</span>
            <input className="inp" type="month" value={selMonth} onChange={e=>setSelMonth(e.target.value)} />
          </div>
          {loading ? <div className="card-body"><Loading /></div> : summary.length===0 ? <div className="empty-state"><div className="es-icon">📊</div><p>No data.</p></div> : (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Employee</th><th>Department</th><th>Present</th><th>Absent</th><th>Late</th><th>Leave</th><th>Total Hours</th></tr></thead>
                <tbody>{summary.map(s=><tr key={s.id}><td style={{ fontWeight:600 }}>{s.name}</td><td style={{ fontSize:12 }}>{s.department_name||"—"}</td><td className="mono" style={{ color:C.success }}>{s.present_days}</td><td className="mono" style={{ color:C.danger }}>{s.absent_days}</td><td className="mono" style={{ color:C.warning }}>{s.late_days}</td><td className="mono" style={{ color:C.info }}>{s.leave_days}</td><td className="mono">{parseFloat(s.total_hours||0).toFixed(1)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showForm && <Overlay onClose={()=>setShowForm(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-hd"><span className="modal-title">Record Attendance</span><button className="modal-close" onClick={()=>setShowForm(false)}>✕</button></div><div className="modal-body">
        <div className="frow"><div className="fg"><label className="flabel">Employee *</label><select className="sel" value={form.employee_id} onChange={e=>setForm(f=>({...f,employee_id:e.target.value}))}><option value="">Select...</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div><div className="fg"><label className="flabel">Date *</label><input className="inp" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} /></div></div>
        <div className="frow"><div className="fg"><label className="flabel">Clock In</label><input className="inp" type="datetime-local" value={form.clock_in} onChange={e=>setForm(f=>({...f,clock_in:e.target.value}))} /></div><div className="fg"><label className="flabel">Clock Out</label><input className="inp" type="datetime-local" value={form.clock_out} onChange={e=>setForm(f=>({...f,clock_out:e.target.value}))} /></div></div>
        <div className="frow"><div className="fg"><label className="flabel">Status</label><select className="sel" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option>Present</option><option>Absent</option><option>Late</option><option>Half-Day</option><option>Leave</option><option>Holiday</option></select></div></div>
        <div className="fg"><label className="flabel">Notes</label><input className="inp" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></div>
      </div><div className="modal-ft"><button className="btn btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><Spinner/>Saving...</>:"Save"}</button></div></div></Overlay>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ASSET MANAGER
// ═══════════════════════════════════════════════════════════════════
function AssetManager({ notify }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const CATEGORIES = ["Equipment","Furniture","Vehicle","Electronics","Software","Other"];
  const [form, setForm] = useState({ name:"", category:"Equipment", description:"", serial_number:"", brand:"", model:"", purchase_date:"", purchase_price:"", location:"", assigned_to:"", notes:"" });

  useEffect(() => { assetsAPI.list().then(r=>{ setAssets(r.data||[]); setLoading(false); }).catch(()=>setLoading(false)); }, []);

  const open = (a=null) => {
    setEditing(a);
    setForm(a ? { name:a.name, category:a.category, description:a.description||"", serial_number:a.serial_number||"", brand:a.brand||"", model:a.model||"", purchase_date:a.purchase_date||"", purchase_price:a.purchase_price||"", location:a.location||"", assigned_to:a.assigned_to||"", notes:a.notes||"" }
             : { name:"", category:"Equipment", description:"", serial_number:"", brand:"", model:"", purchase_date:"", purchase_price:"", location:"", assigned_to:"", notes:"" });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name) return notify("Name required","error");
    setSaving(true);
    try {
      const res = editing ? await assetsAPI.update(editing.id, form) : await assetsAPI.create(form);
      editing ? setAssets(v=>v.map(x=>x.id===editing.id?res.data:x)) : setAssets(v=>[res.data,...v]);
      setShowForm(false); notify(editing?"Asset updated ✅":"Asset added ✅");
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const dispose = async id => {
    try { const res = await assetsAPI.delete(id); setAssets(v=>v.map(x=>x.id===id?{...x,status:"Disposed"}:x)); notify("Asset disposed","error"); }
    catch(e) { notify(e.message,"error"); }
  };

  const statusColor = s => ({Active:"b-success",Maintenance:"b-warning",Disposed:"b-danger",Lost:"b-danger",Transferred:"b-info"}[s]||"b-info");
  const filtered = assets.filter(a => (catFilter==="All"||a.category===catFilter) && (!search||a.name.toLowerCase().includes(search.toLowerCase())||a.asset_number?.toLowerCase().includes(search.toLowerCase())));
  const totalValue = assets.filter(a=>a.status==="Active").reduce((s,a)=>s+parseFloat(a.current_value||a.purchase_price||0),0);

  return (
    <div className="fade-in">
      <div className="stats-grid" style={{ gridTemplateColumns:"repeat(4,1fr)", marginBottom:20 }}>
        <div className="stat-card blue"><div className="stat-value">{assets.length}</div><div className="stat-label">Total Assets</div></div>
        <div className="stat-card green"><div className="stat-value">{assets.filter(a=>a.status==="Active").length}</div><div className="stat-label">Active</div></div>
        <div className="stat-card gold"><div className="stat-value">{assets.filter(a=>a.status==="Maintenance").length}</div><div className="stat-label">In Maintenance</div></div>
        <div className="stat-card blue"><div className="stat-value">{fmtKsh(totalValue)}</div><div className="stat-label">Total Value</div></div>
      </div>
      <div className="card">
        <div className="card-hd">
          <span className="card-title">🖥️ Assets</span>
          <div style={{ display:"flex", gap:8 }}>
            <input className="inp" style={{ width:180 }} placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} />
            <select className="sel" value={catFilter} onChange={e=>setCatFilter(e.target.value)}><option>All</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
            <button className="btn btn-primary" onClick={()=>open()}>+ Add Asset</button>
          </div>
        </div>
        {loading ? <div className="card-body"><Loading /></div> : filtered.length===0 ? <div className="empty-state"><div className="es-icon">🖥️</div><p>No assets found.</p></div> : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Asset #</th><th>Name</th><th>Category</th><th>Brand/Model</th><th>Location</th><th>Assigned To</th><th>Value</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{filtered.map(a=><tr key={a.id}><td className="mono" style={{ fontSize:11, color:C.textMuted }}>{a.asset_number}</td><td style={{ fontWeight:600 }}>{a.name}<div style={{ fontSize:11, color:C.textMuted }}>{a.serial_number}</div></td><td><Badge label={a.category} type="b-info" /></td><td style={{ fontSize:12 }}>{a.brand} {a.model}</td><td style={{ fontSize:12 }}>{a.location||"—"}</td><td style={{ fontSize:12 }}>{a.assigned_to||"—"}</td><td className="mono">{fmtKsh(parseFloat(a.current_value||a.purchase_price||0))}</td><td><Badge label={a.status} type={statusColor(a.status)} /></td><td><div style={{ display:"flex", gap:4 }}><button className="btn btn-info btn-sm" onClick={()=>open(a)}>Edit</button>{a.status!=="Disposed"&&<button className="btn btn-danger btn-sm" onClick={()=>dispose(a.id)}>Dispose</button>}</div></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
      {showForm && <Overlay onClose={()=>setShowForm(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-hd"><span className="modal-title">{editing?"Edit":"Add"} Asset</span><button className="modal-close" onClick={()=>setShowForm(false)}>✕</button></div><div className="modal-body">
        <div className="frow"><div className="fg" style={{ flex:2 }}><label className="flabel">Asset Name *</label><input className="inp" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div><div className="fg"><label className="flabel">Category</label><select className="sel" value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div></div>
        <div className="frow"><div className="fg"><label className="flabel">Brand</label><input className="inp" value={form.brand} onChange={e=>setForm(f=>({...f,brand:e.target.value}))} /></div><div className="fg"><label className="flabel">Model</label><input className="inp" value={form.model} onChange={e=>setForm(f=>({...f,model:e.target.value}))} /></div><div className="fg"><label className="flabel">Serial Number</label><input className="inp" value={form.serial_number} onChange={e=>setForm(f=>({...f,serial_number:e.target.value}))} /></div></div>
        <div className="frow"><div className="fg"><label className="flabel">Purchase Date</label><input className="inp" type="date" value={form.purchase_date} onChange={e=>setForm(f=>({...f,purchase_date:e.target.value}))} /></div><div className="fg"><label className="flabel">Purchase Price</label><input className="inp" type="number" value={form.purchase_price} onChange={e=>setForm(f=>({...f,purchase_price:e.target.value}))} /></div></div>
        <div className="frow"><div className="fg"><label className="flabel">Location</label><input className="inp" value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} /></div><div className="fg"><label className="flabel">Assigned To</label><input className="inp" value={form.assigned_to} onChange={e=>setForm(f=>({...f,assigned_to:e.target.value}))} /></div></div>
        <div className="fg"><label className="flabel">Notes</label><textarea className="inp" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></div>
      </div><div className="modal-ft"><button className="btn btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><Spinner/>Saving...</>:"Save"}</button></div></div></Overlay>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// EXPENSE CATEGORY MANAGER
// ═══════════════════════════════════════════════════════════════════
function ExpenseCategoryManager({ notify }) {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:"", description:"", budget:"" });

  useEffect(() => { expenseCategoriesAPI.list().then(r=>{ setCats(r.data||[]); setLoading(false); }).catch(()=>setLoading(false)); }, []);

  const open = (c=null) => { setEditing(c); setForm(c?{name:c.name,description:c.description||"",budget:c.budget||""}:{name:"",description:"",budget:""}); setShowForm(true); };
  const save = async () => {
    if (!form.name) return notify("Name required","error");
    setSaving(true);
    try {
      const res = editing ? await expenseCategoriesAPI.update(editing.id,{...form,budget:+form.budget||0}) : await expenseCategoriesAPI.create({...form,budget:+form.budget||0});
      editing ? setCats(v=>v.map(x=>x.id===editing.id?res.data:x)) : setCats(v=>[res.data,...v]);
      setShowForm(false); notify("Saved ✅");
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };
  const del = async id => { try { await expenseCategoriesAPI.delete(id); setCats(v=>v.filter(x=>x.id!==id)); notify("Deleted","error"); } catch(e) { notify(e.message,"error"); } };

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-hd"><span className="card-title">🗂️ Expense Categories</span><button className="btn btn-primary" onClick={()=>open()}>+ Add Category</button></div>
        {loading ? <div className="card-body"><Loading /></div> : cats.length===0 ? <div className="empty-state"><div className="es-icon">🗂️</div><p>No categories yet.</p></div> : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Name</th><th>Description</th><th>Monthly Budget</th><th>Actions</th></tr></thead>
              <tbody>{cats.map(c=><tr key={c.id}><td style={{ fontWeight:600 }}>{c.name}</td><td style={{ fontSize:12, color:C.textMuted }}>{c.description||"—"}</td><td className="mono">{fmtKsh(parseFloat(c.budget||0))}</td><td><div style={{ display:"flex", gap:4 }}><button className="btn btn-info btn-sm" onClick={()=>open(c)}>Edit</button><button className="btn btn-danger btn-sm" onClick={()=>del(c.id)}>Del</button></div></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
      {showForm && <Overlay onClose={()=>setShowForm(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-hd"><span className="modal-title">{editing?"Edit":"Add"} Expense Category</span><button className="modal-close" onClick={()=>setShowForm(false)}>✕</button></div><div className="modal-body"><div className="fg"><label className="flabel">Name *</label><input className="inp" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div><div className="fg"><label className="flabel">Description</label><textarea className="inp" rows={2} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} /></div><div className="fg"><label className="flabel">Monthly Budget (KSh)</label><input className="inp" type="number" value={form.budget} onChange={e=>setForm(f=>({...f,budget:e.target.value}))} /></div></div><div className="modal-ft"><button className="btn btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><Spinner/>Saving...</>:"Save"}</button></div></div></Overlay>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// COMPANY MANAGER
// ═══════════════════════════════════════════════════════════════════
function CompanyManager({ notify }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name:"", email:"", phone:"", address:"", industry:"", tax_pin:"" });

  useEffect(() => { companiesAPI.list().then(r=>{ setCompanies(r.data||[]); setLoading(false); }).catch(()=>setLoading(false)); }, []);

  const open = (c=null) => { setEditing(c); setForm(c?{name:c.name,email:c.email||"",phone:c.phone||"",address:c.address||"",industry:c.industry||"",tax_pin:c.tax_pin||""}:{name:"",email:"",phone:"",address:"",industry:"",tax_pin:""}); setShowForm(true); };
  const save = async () => {
    if (!form.name) return notify("Company name required","error");
    setSaving(true);
    try {
      const res = editing ? await companiesAPI.update(editing.id,form) : await companiesAPI.create(form);
      editing ? setCompanies(v=>v.map(x=>x.id===editing.id?res.data:x)) : setCompanies(v=>[res.data,...v]);
      setShowForm(false); notify("Saved ✅");
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-hd"><span className="card-title">🏢 Companies</span><button className="btn btn-primary" onClick={()=>open()}>+ Add Company</button></div>
        {loading ? <div className="card-body"><Loading /></div> : companies.length===0 ? <div className="empty-state"><div className="es-icon">🏢</div><p>No companies yet.</p></div> : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Company Name</th><th>Industry</th><th>Email</th><th>Phone</th><th>Tax PIN</th><th>Actions</th></tr></thead>
              <tbody>{companies.map(c=><tr key={c.id}><td style={{ fontWeight:700 }}>{c.name}</td><td style={{ fontSize:12 }}>{c.industry||"—"}</td><td style={{ fontSize:12 }}>{c.email||"—"}</td><td style={{ fontSize:12 }}>{c.phone||"—"}</td><td className="mono" style={{ fontSize:12 }}>{c.tax_pin||"—"}</td><td><button className="btn btn-info btn-sm" onClick={()=>open(c)}>Edit</button></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
      {showForm && <Overlay onClose={()=>setShowForm(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-hd"><span className="modal-title">{editing?"Edit":"Add"} Company</span><button className="modal-close" onClick={()=>setShowForm(false)}>✕</button></div><div className="modal-body">
        <div className="fg"><label className="flabel">Company Name *</label><input className="inp" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
        <div className="frow"><div className="fg"><label className="flabel">Industry</label><input className="inp" value={form.industry} onChange={e=>setForm(f=>({...f,industry:e.target.value}))} /></div><div className="fg"><label className="flabel">Tax PIN (KRA)</label><input className="inp" value={form.tax_pin} onChange={e=>setForm(f=>({...f,tax_pin:e.target.value}))} /></div></div>
        <div className="frow"><div className="fg"><label className="flabel">Email</label><input className="inp" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} /></div><div className="fg"><label className="flabel">Phone</label><input className="inp" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></div></div>
        <div className="fg"><label className="flabel">Address</label><textarea className="inp" rows={2} value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} /></div>
      </div><div className="modal-ft"><button className="btn btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><Spinner/>Saving...</>:"Save"}</button></div></div></Overlay>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ROLES & PERMISSIONS
// ═══════════════════════════════════════════════════════════════════
function RolesPermissions({ notify, onPermsChanged }) {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [perms, setPerms] = useState([]);
  const [saving, setSaving] = useState(false);

  const MODULES = [
    // Operations
    "inventory","sales","purchase_orders","customers","suppliers","expenses",
    "returns","sup_returns","transfer","register","reconcile","reorder",
    // Finance
    "invoices","payments","sup_payments","debts","mpesa","currency",
    // Logistics & Docs
    "logistics","documents",
    // HR
    "employees","departments","attendance","timetrack","commission","payroll",
    // Assets & Settings
    "assets","warehouses","prodcats","expcats","companies","loyalty","quotes",
    // Onfon
    "onfon","onfon_receive","onfon_assign","onfon_released",
    "onfon_agent_sale","onfon_shop_sale","onfon_inventory",
    "onfon_devices","onfon_lookup","onfon_performance","onfon_reports",
    // Admin
    "reports","users","settings","roles",
  ];

  const MODULE_LABELS = {
    inventory:"📦 Inventory",          sales:"🛒 Sales & POS",
    purchase_orders:"📋 Purchase Orders", customers:"👥 Customers",
    suppliers:"🤝 Suppliers",           expenses:"💸 Expenses",
    returns:"↩️ Sales Returns",         sup_returns:"↩️ Supplier Returns",
    transfer:"🔄 Stock Transfer",       register:"🏧 Cash Register",
    reconcile:"⚖️ Cash Reconciliation", reorder:"🚨 Reorder Alerts",
    invoices:"🧾 Invoices",             payments:"💰 Payments",
    sup_payments:"💳 Supplier Payments",debts:"💳 Debt Tracker",
    mpesa:"💚 M-Pesa",                  currency:"💱 Currency",
    logistics:"🚚 Logistics",           documents:"📁 Documents",
    employees:"👤 Employees",           departments:"🏛️ Departments",
    attendance:"📅 Attendance",         timetrack:"⏱️ Staff Time",
    commission:"💵 Commission",         payroll:"💰 Payroll",
    assets:"🖥️ Assets",                 warehouses:"🏭 Warehouses",
    prodcats:"📂 Product Categories",   expcats:"🗂️ Expense Categories",
    companies:"🏢 Companies",           loyalty:"🌟 Loyalty Program",
    quotes:"📄 Quotations",
    onfon:"📱 Onfon Dashboard",         onfon_receive:"📥 Onfon Receive",
    onfon_assign:"🤝 Onfon Assign",     onfon_released:"📤 Onfon Released",
    onfon_agent_sale:"💼 Onfon Agent Sale", onfon_shop_sale:"🛒 Onfon Shop Sale",
    onfon_inventory:"📦 Onfon Inventory",   onfon_devices:"📋 Onfon Devices",
    onfon_lookup:"🔍 IMEI Lookup",      onfon_performance:"📈 Onfon Performance",
    onfon_reports:"📊 Onfon Reports",
    reports:"📊 Reports & Analytics",   users:"👑 User Management",
    settings:"⚙️ Settings",             roles:"🔐 Roles & Permissions",
  };

  const MODULE_GROUPS = [
    { label:"OPERATIONS",    keys:["inventory","sales","purchase_orders","customers","suppliers","expenses","returns","sup_returns","transfer","register","reconcile","reorder","quotes"] },
    { label:"FINANCE",       keys:["invoices","payments","sup_payments","debts","mpesa","currency","loyalty"] },
    { label:"LOGISTICS",     keys:["logistics","documents"] },
    { label:"HR & STAFF",    keys:["employees","departments","attendance","timetrack","commission","payroll"] },
    { label:"ASSETS & SETTINGS", keys:["assets","warehouses","prodcats","expcats","companies"] },
    { label:"ONFON MODULE",  keys:["onfon","onfon_receive","onfon_assign","onfon_released","onfon_agent_sale","onfon_shop_sale","onfon_inventory","onfon_devices","onfon_lookup","onfon_performance","onfon_reports"] },
    { label:"ADMIN",         keys:["reports","users","settings","roles"] },
  ];

  useEffect(() => { rolesAPI.list().then(r=>{ setRoles(r.data||[]); setLoading(false); }).catch(()=>setLoading(false)); }, []);

  const selectRole = role => {
    setSelected(role);
    const existingPerms = role.permissions || [];
    setPerms(MODULES.map(m => {
      const p = existingPerms.find(x=>x.module===m);
      return { module:m, can_view:p?.can_view||false, can_create:p?.can_create||false, can_edit:p?.can_edit||false, can_delete:p?.can_delete||false };
    }));
  };

  const toggle = (module, field) => {
    setPerms(v => v.map(p => p.module===module ? { ...p, [field]:!p[field] } : p));
  };

  const savePerms = async () => {
    setSaving(true);
    try {
      await rolesAPI.updatePerms(selected.id, perms);
      notify("Permissions saved ✅");
      if (onPermsChanged) onPermsChanged(); // reload active user's perms
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const Check = ({ checked, onClick }) => (
    <div onClick={onClick} style={{ width:22,height:22,borderRadius:4,border:`2px solid ${checked?C.success:C.border}`,background:checked?C.success:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s",margin:"0 auto" }}>
      {checked && <span style={{ color:"#fff", fontSize:13 }}>✓</span>}
    </div>
  );

  return (
    <div className="fade-in" style={{ display:"grid", gridTemplateColumns:"min(240px,100%) 1fr", gap:16, gridTemplateRows:"auto" }}>
      <div className="card" style={{ height:"fit-content" }}>
        <div className="card-hd"><span className="card-title">🔐 Roles</span></div>
        {loading ? <div className="card-body"><Loading /></div> : (
          <div style={{ padding:"0 8px 8px" }}>
            {roles.map(r=>(
              <div key={r.id} onClick={()=>selectRole(r)} style={{ padding:"10px 14px", borderRadius:8, cursor:"pointer", marginBottom:4, background:selected?.id===r.id?C.accent+"22":"transparent", border:`1px solid ${selected?.id===r.id?C.accent:C.border}`, transition:"all .15s" }}>
                <div style={{ fontWeight:700, fontSize:13 }}>{r.name}</div>
                <div style={{ fontSize:11, color:C.textMuted }}>{r.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-hd">
          <span className="card-title">{selected ? `Permissions — ${selected.name}` : "Select a role"}</span>
          {selected && <button className="btn btn-primary" onClick={savePerms} disabled={saving}>{saving?<><Spinner/>Saving...</>:"Save Permissions"}</button>}
        </div>
        {!selected ? (
          <div className="empty-state"><div className="es-icon">🔐</div><p>Select a role on the left to manage its permissions.</p></div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Module</th>
                  <th style={{ textAlign:"center" }}>View</th>
                  <th style={{ textAlign:"center" }}>Create</th>
                  <th style={{ textAlign:"center" }}>Edit</th>
                  <th style={{ textAlign:"center" }}>Delete</th>
                </tr>
              </thead>
              <tbody>
                {MODULE_GROUPS.map(grp => {
                  const groupPerms = perms.filter(p => grp.keys.includes(p.module));
                  if (!groupPerms.length) return null;
                  return (
                    <React.Fragment key={grp.label}>
                      <tr>
                        <td colSpan={5} style={{ background:C.surfaceAlt, fontSize:10, fontWeight:800, letterSpacing:1.5, color:C.textMuted, textTransform:"uppercase", padding:"8px 14px" }}>
                          {grp.label}
                        </td>
                      </tr>
                      {groupPerms.map(p => (
                        <tr key={p.module}>
                          <td style={{ fontWeight:600 }}>{MODULE_LABELS[p.module] || p.module.replace(/_/g," ")}</td>
                          <td><Check checked={p.can_view}   onClick={()=>toggle(p.module,"can_view")} /></td>
                          <td><Check checked={p.can_create} onClick={()=>toggle(p.module,"can_create")} /></td>
                          <td><Check checked={p.can_edit}   onClick={()=>toggle(p.module,"can_edit")} /></td>
                          <td><Check checked={p.can_delete} onClick={()=>toggle(p.module,"can_delete")} /></td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}



// ═══════════════════════════════════════════════════════════════════════════════
// CASH RECONCILIATION MODULE
// ═══════════════════════════════════════════════════════════════════════════════
function CashReconciliation({ data, notify, user }) {
  const [recons, setRecons]   = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [tab, setTab]         = useState("form");
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    branch: user?.branch || 'Main Branch', recon_date: today,
    opening_float:0, cash_sales:0, mpesa_sales:0, card_sales:0,
    other_sales:0, cash_counted:0, expenses_cash:0, notes:''
  });
  const F = (k,v) => setForm(p=>({...p,[k]:v}));

  const variance = Number(form.cash_counted) - (Number(form.opening_float) + Number(form.cash_sales) - Number(form.expenses_cash));
  const totalSales = Number(form.cash_sales)+Number(form.mpesa_sales)+Number(form.card_sales)+Number(form.other_sales);

  const load = async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        reconciliationAPI.list({ branch: form.branch }),
        reconciliationAPI.summary({ branch: form.branch })
      ]);
      setRecons(r.data||[]);
      setSummary(s.data||[]);
    } catch(e) { notify(e.message,'error'); }
    setLoading(false);
  };

  useEffect(()=>{ load(); },[]);

  const save = async () => {
    setSaving(true);
    try {
      await reconciliationAPI.save(form);
      notify('Reconciliation saved ✅'); load();
      setTab('history');
    } catch(e) { notify(e.message,'error'); }
    setSaving(false);
  };

  const submit = async (id) => {
    try { await reconciliationAPI.submit(id); notify('Submitted for approval'); load(); }
    catch(e) { notify(e.message,'error'); }
  };
  const approve = async (id) => {
    try { await reconciliationAPI.approve(id); notify('Approved ✅'); load(); }
    catch(e) { notify(e.message,'error'); }
  };

  const TABS = [["form","📝","Daily Form"],["history","📅","History"],["summary","📊","Summary"]];

  return (
    <div>
      <PageHeader title="Cash Reconciliation" subtitle="End-of-day cash balancing" icon="🏧" />
      <div style={{ display:"flex",gap:4,background:C.surfaceAlt,padding:4,borderRadius:10,marginBottom:20,width:"fit-content" }}>
        {TABS.map(([k,i,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ padding:"7px 16px",borderRadius:7,border:"none",cursor:"pointer",background:tab===k?C.surface:"transparent",color:tab===k?C.text:C.textMuted,fontWeight:600,fontSize:12,fontFamily:"inherit",boxShadow:tab===k?"0 1px 4px rgba(0,0,0,.25)":"none" }}>
            {i} {l}
          </button>
        ))}
      </div>

      {tab==="form" && (
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
          <div className="card">
            <div className="card-hd"><span className="card-title">📝 Daily Reconciliation Form</span></div>
            <div className="card-body">
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                <div className="fg"><label className="flabel">Branch</label>
                  <select className="sel" value={form.branch} onChange={e=>F('branch',e.target.value)}>
                    {['Main Branch','West Branch','Juja Branch'].map(b=><option key={b}>{b}</option>)}
                  </select></div>
                <div className="fg"><label className="flabel">Date</label>
                  <input className="inp" type="date" value={form.recon_date} onChange={e=>F('recon_date',e.target.value)} /></div>
                <div className="fg"><label className="flabel">Opening Float (KSh)</label>
                  <input className="inp" type="number" value={form.opening_float} onChange={e=>F('opening_float',e.target.value)} /></div>
                <div className="fg"><label className="flabel">Cash Sales (KSh)</label>
                  <input className="inp" type="number" value={form.cash_sales} onChange={e=>F('cash_sales',e.target.value)} /></div>
                <div className="fg"><label className="flabel">M-Pesa Sales (KSh)</label>
                  <input className="inp" type="number" value={form.mpesa_sales} onChange={e=>F('mpesa_sales',e.target.value)} /></div>
                <div className="fg"><label className="flabel">Card Sales (KSh)</label>
                  <input className="inp" type="number" value={form.card_sales} onChange={e=>F('card_sales',e.target.value)} /></div>
                <div className="fg"><label className="flabel">Cash Expenses Paid Out</label>
                  <input className="inp" type="number" value={form.expenses_cash} onChange={e=>F('expenses_cash',e.target.value)} /></div>
                <div className="fg"><label className="flabel">Actual Cash Counted</label>
                  <input className="inp" type="number" value={form.cash_counted} onChange={e=>F('cash_counted',e.target.value)} /></div>
              </div>
              <div className="fg"><label className="flabel">Notes</label>
                <input className="inp" value={form.notes} onChange={e=>F('notes',e.target.value)} placeholder="Any discrepancy notes..." /></div>
              <button className="btn btn-primary" style={{ width:"100%",justifyContent:"center" }} onClick={save} disabled={saving}>
                {saving?<><Spinner/>Saving...</>:"💾 Save Reconciliation"}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-hd"><span className="card-title">📊 Today's Summary</span></div>
            <div className="card-body">
              {[
                ["Total Sales",`KSh ${fmt(totalSales)}`,C.success],
                ["Cash Sales",`KSh ${fmt(form.cash_sales)}`,C.info],
                ["M-Pesa",`KSh ${fmt(form.mpesa_sales)}`,C.info],
                ["Expected Cash",`KSh ${fmt(Number(form.opening_float)+Number(form.cash_sales)-Number(form.expenses_cash))}`,C.text],
                ["Actual Counted",`KSh ${fmt(form.cash_counted)}`,C.text],
              ].map(([l,v,c])=>(
                <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:13,color:C.textMuted }}>{l}</span>
                  <span style={{ fontWeight:700,color:c }}>{v}</span>
                </div>
              ))}
              <div style={{ display:"flex",justifyContent:"space-between",padding:"14px 0",background:variance<0?C.danger+"18":variance>0?C.warning+"18":C.success+"18",borderRadius:10,marginTop:8,paddingLeft:14,paddingRight:14 }}>
                <span style={{ fontWeight:800,fontSize:14 }}>Variance</span>
                <span style={{ fontWeight:800,fontSize:18,color:variance<0?C.danger:variance>0?C.warning:C.success }}>
                  {variance<0?'':'+'}{fmt(variance)} KSh
                </span>
              </div>
              {variance<0&&<div style={{ fontSize:12,color:C.danger,marginTop:8,padding:"8px 12px",background:C.danger+"18",borderRadius:8 }}>⚠️ Shortage of KSh {fmt(Math.abs(variance))} — investigate before closing</div>}
              {variance>0&&<div style={{ fontSize:12,color:C.warning,marginTop:8,padding:"8px 12px",background:C.warning+"18",borderRadius:8 }}>⚠️ Surplus of KSh {fmt(variance)} — may indicate unrecorded sale</div>}
              {variance===0&&<div style={{ fontSize:12,color:C.success,marginTop:8,padding:"8px 12px",background:C.success+"18",borderRadius:8 }}>✅ Cash balances perfectly</div>}
            </div>
          </div>
        </div>
      )}

      {tab==="history" && (
        <div className="card">
          <div className="card-hd"><span className="card-title">📅 Reconciliation History</span><button className="btn btn-ghost btn-sm" onClick={load}>🔄</button></div>
          {loading?<Loading/>:(
            <div className="tbl-wrap"><table>
              <thead><tr><th>Date</th><th>Branch</th><th>Cash Sales</th><th>M-Pesa</th><th>Variance</th><th>Status</th><th>Submitted By</th><th>Actions</th></tr></thead>
              <tbody>
                {recons.map(r=>(
                  <tr key={r.id}>
                    <td style={{ fontWeight:700 }}>{r.recon_date}</td>
                    <td>{r.branch}</td>
                    <td className="mono">KSh {fmt(r.cash_sales)}</td>
                    <td className="mono">KSh {fmt(r.mpesa_sales)}</td>
                    <td><span style={{ fontWeight:700,color:r.variance<0?C.danger:r.variance>0?C.warning:C.success }}>{r.variance>=0?'+':''}{fmt(r.variance)}</span></td>
                    <td><Badge label={r.status} type={{Draft:"b-gray",Submitted:"b-info",Approved:"b-success",Disputed:"b-danger"}[r.status]||"b-gray"} /></td>
                    <td style={{ fontSize:12,color:C.textMuted }}>{r.submitted_by_name||'—'}</td>
                    <td>
                      <div style={{ display:"flex", gap:4 }}>
                        {r.status==='Draft'&&<button className="btn btn-primary btn-sm" onClick={()=>submit(r.id)}>Submit</button>}
                        {r.status==='Submitted'&&(user?.role==='Admin'||user?.role==='Manager')&&<button className="btn btn-success btn-sm" onClick={()=>approve(r.id)}>Approve</button>}
                        {r.status==='Draft'&&<button className="btn btn-danger btn-sm" onClick={async()=>{ if(!window.confirm('Delete this reconciliation?'))return; try{ await reconciliationAPI.delete(r.id); load(); notify('Deleted'); }catch(e){ notify(e.message,'error'); } }}>🗑️</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recons.length===0&&<div className="empty-state" style={{padding:24}}><div className="es-icon">🏧</div><p>No reconciliations yet.</p></div>}
            </div>
          )}
        </div>
      )}

      {tab==="summary" && (
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16 }}>
          {summary.map(s=>(
            <div key={s.branch} className="card">
              <div className="card-hd"><span className="card-title">📍 {s.branch}</span></div>
              <div className="card-body">
                {[
                  ["Total Days",s.total_days,C.info],
                  ["Total Cash Sales",`KSh ${fmt(s.total_cash_sales)}`,C.success],
                  ["Total M-Pesa",`KSh ${fmt(s.total_mpesa)}`,C.success],
                  ["Total Variance",`KSh ${fmt(s.total_variance)}`,s.total_variance<0?C.danger:C.success],
                  ["Shortage Days",s.shortage_days,C.danger],
                  ["Surplus Days",s.surplus_days,C.warning],
                ].map(([l,v,c])=>(
                  <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:12,color:C.textMuted }}>{l}</span>
                    <span style={{ fontWeight:700,color:c }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {summary.length===0&&<div className="card"><div className="card-body"><div className="empty-state"><div className="es-icon">📊</div><p>No summary data yet.</p></div></div></div>}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUOTATIONS MODULE
// ═══════════════════════════════════════════════════════════════════════════════
function Quotations({ data, notify, user }) {
  const [quotes, setQuotes]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [items, setItems]     = useState([{ product_name:'', qty:1, unit_price:0 }]);
  const [form, setForm]       = useState({ customer_name:'Walk-in', customer_phone:'', branch: user?.branch||'Main Branch', discount:0, tax:0, notes:'', terms:'Price valid for 7 days.', valid_until:'' });
  const F = (k,v) => setForm(p=>({...p,[k]:v}));

  const load = async () => {
    setLoading(true);
    try { const r = await quotationsAPI.list(); setQuotes(r.data||[]); }
    catch(e) { notify(e.message,'error'); }
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);

  const subtotal = items.reduce((s,i)=>s+(i.qty*i.unit_price),0);
  const total    = subtotal - Number(form.discount) + Number(form.tax);

  const openModal = () => {
    setForm({ customer_name:'Walk-in', customer_phone:'', branch: user?.branch||'Main Branch', discount:0, tax:0, notes:'', terms:'Price valid for 7 days.', valid_until:'' });
    setItems([{ product_name:'', qty:1, unit_price:0 }]);
    setShowForm(true);
  };

  const save = async () => {
    if (!items[0].product_name) return notify('Add at least one item','error');
    setSaving(true);
    try {
      await quotationsAPI.create({ ...form, items });
      notify('Quotation created ✅'); load(); setShowForm(false);
    } catch(e) { notify(e.message,'error'); }
    setSaving(false);
  };

  const changeStatus = async (id, status) => {
    try { await quotationsAPI.setStatus(id, status); notify(`Status: ${status}`); load(); }
    catch(e) { notify(e.message,'error'); }
  };

  const addItem = () => setItems(p=>[...p,{product_name:'',qty:1,unit_price:0}]);
  const remItem = (i) => setItems(p=>p.filter((_,idx)=>idx!==i));
  const upItem  = (i,k,v) => setItems(p=>p.map((it,idx)=>idx===i?{...it,[k]:v}:it));

  const statusColor = {Draft:"b-gray",Sent:"b-info",Accepted:"b-success",Rejected:"b-danger",Converted:"b-warning",Expired:"b-gray"};

  const printQuote = (q) => {
    const w = window.open('','_blank');
    w.document.write(`<html><head><title>Quotation ${q.quote_no}</title>
    <style>body{font-family:Arial;padding:40px;color:#333;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:8px;} th{background:#f5f5f5;} .total{font-weight:bold;font-size:16px;}</style></head><body>
    <h2>QUOTATION / PROFORMA INVOICE</h2><p><strong>VES CONNECTIONS LIMITED</strong></p>
    <p>Quote No: <strong>${q.quote_no}</strong> | Date: ${new Date(q.created_at).toLocaleDateString()} | Valid Until: ${q.valid_until||'N/A'}</p>
    <hr/><p><strong>Bill To:</strong> ${q.customer_name}<br/>${q.customer_phone||''}</p><hr/>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
    <tbody>${(q.items||[]).map(i=>`<tr><td>${i.product_name}</td><td>${i.qty}</td><td>KSh ${Number(i.unit_price).toLocaleString()}</td><td>KSh ${Number(i.line_total||i.qty*i.unit_price).toLocaleString()}</td></tr>`).join('')}</tbody></table>
    <p style="text-align:right">Subtotal: KSh ${Number(q.subtotal).toLocaleString()}<br/>Discount: -KSh ${Number(q.discount).toLocaleString()}<br/>Tax: KSh ${Number(q.tax).toLocaleString()}<br/><span class="total">TOTAL: KSh ${Number(q.total).toLocaleString()}</span></p>
    <p>${q.terms||''}</p><p>${q.notes||''}</p>
    <script>window.print();</script></body></html>`);
  };

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-hd">
          <span className="card-title">📄 Quotations & Proforma Invoices</span>
          <button className="btn btn-primary" onClick={openModal}>+ New Quotation</button>
        </div>
        {loading?<Loading/>:(
          <div className="tbl-wrap"><table>
            <thead><tr><th>Quote No</th><th>Customer</th><th>Branch</th><th>Total</th><th>Valid Until</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {quotes.map(q=>(
                <tr key={q.id}>
                  <td style={{ fontWeight:700,color:C.accent,fontFamily:"monospace" }}>{q.quote_no}</td>
                  <td style={{ fontWeight:600 }}>{q.customer_name}<div style={{ fontSize:10,color:C.textMuted }}>{q.customer_phone}</div></td>
                  <td>{q.branch}</td>
                  <td className="mono" style={{ fontWeight:700 }}>KSh {fmt(q.total)}</td>
                  <td style={{ fontSize:12,color:q.valid_until&&new Date(q.valid_until)<new Date()?C.danger:C.textMuted }}>{q.valid_until||'—'}</td>
                  <td><Badge label={q.status} type={statusColor[q.status]||"b-gray"} /></td>
                  <td className="mono" style={{ fontSize:11,color:C.textMuted }}>{new Date(q.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display:"flex",gap:4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={async()=>{ const r=await quotationsAPI.get(q.id); printQuote(r.data); }}>🖨️</button>
                      {q.status==='Draft'&&<button className="btn btn-primary btn-sm" onClick={()=>changeStatus(q.id,'Sent')}>Send</button>}
                      {q.status==='Sent'&&<button className="btn btn-success btn-sm" onClick={()=>changeStatus(q.id,'Accepted')}>Accept</button>}
                      {(q.status==='Sent'||q.status==='Draft')&&<button className="btn btn-danger btn-sm" onClick={()=>changeStatus(q.id,'Rejected')}>Reject</button>}
                      <button className="btn btn-danger btn-sm" onClick={async()=>{ if(!window.confirm('Delete this quotation?'))return; try{ await quotationsAPI.delete(q.id); load(); notify('Deleted'); }catch(e){ notify(e.message,'error'); } }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {quotes.length===0&&<div className="empty-state"><div className="es-icon">📄</div><p>No quotations yet.</p></div>}
          </div>
        )}
      </div>

      {showForm && (
        <Overlay onClose={()=>setShowForm(false)}>
          <div className="modal modal-xl" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">📄 New Quotation / Proforma Invoice</div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
              <div>
                <div style={{ fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:1,marginBottom:10 }}>Customer Details</div>
                <div className="frow">
                  <div className="fg"><label className="flabel">Customer Name</label><input className="inp" value={form.customer_name} onChange={e=>F('customer_name',e.target.value)} /></div>
                  <div className="fg"><label className="flabel">Phone</label><input className="inp" value={form.customer_phone} onChange={e=>F('customer_phone',e.target.value)} placeholder="+254..." /></div>
                </div>
                <div className="frow">
                  <div className="fg"><label className="flabel">Branch</label>
                    <select className="sel" value={form.branch} onChange={e=>F('branch',e.target.value)}>
                      {['Main Branch','West Branch','Juja Branch'].map(b=><option key={b}>{b}</option>)}
                    </select></div>
                  <div className="fg"><label className="flabel">Valid Until</label><input className="inp" type="date" value={form.valid_until} onChange={e=>F('valid_until',e.target.value)} /></div>
                </div>
                <div className="fg"><label className="flabel">Terms &amp; Conditions</label><textarea className="inp" style={{ minHeight:54 }} value={form.terms} onChange={e=>F('terms',e.target.value)} /></div>
                <div className="fg"><label className="flabel">Notes</label><input className="inp" value={form.notes} onChange={e=>F('notes',e.target.value)} placeholder="Additional notes..." /></div>
              </div>
              <div>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
                  <span style={{ fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:1 }}>Items</span>
                  <button className="btn btn-ghost btn-sm" onClick={addItem}>+ Add Item</button>
                </div>
                {items.map((it,i)=>(
                  <div key={i} style={{ display:"grid",gridTemplateColumns:"3fr 1fr 1fr auto",gap:6,marginBottom:6,alignItems:"center" }}>
                    <input className="inp" placeholder="Product / Description" value={it.product_name} onChange={e=>upItem(i,'product_name',e.target.value)} />
                    <input className="inp" type="number" placeholder="Qty" value={it.qty} onChange={e=>upItem(i,'qty',+e.target.value)} />
                    <input className="inp" type="number" placeholder="Price" value={it.unit_price} onChange={e=>upItem(i,'unit_price',+e.target.value)} />
                    <button className="btn btn-danger btn-sm" onClick={()=>remItem(i)} disabled={items.length===1}>×</button>
                  </div>
                ))}
                <div style={{ marginTop:12,padding:"12px 14px",background:C.surfaceAlt,borderRadius:10 }}>
                  <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}><span style={{ color:C.textMuted,fontSize:13 }}>Subtotal</span><span className="mono">KSh {fmt(subtotal)}</span></div>
                  <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6,alignItems:"center",gap:8 }}>
                    <span style={{ color:C.textMuted,fontSize:13 }}>Discount</span>
                    <input className="inp" type="number" value={form.discount} onChange={e=>F('discount',e.target.value)} style={{ width:110 }} />
                  </div>
                  <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6,alignItems:"center",gap:8 }}>
                    <span style={{ color:C.textMuted,fontSize:13 }}>Tax (VAT)</span>
                    <input className="inp" type="number" value={form.tax} onChange={e=>F('tax',e.target.value)} style={{ width:110 }} />
                  </div>
                  <div style={{ display:"flex",justifyContent:"space-between",fontWeight:800,fontSize:16,paddingTop:8,borderTop:`1px solid ${C.border}`,marginTop:4 }}>
                    <span>TOTAL</span><span style={{ color:C.accent }}>KSh {fmt(total)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><Spinner/>Saving...</>:"✅ Create Quotation"}</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPPLIER RETURNS MODULE
// ═══════════════════════════════════════════════════════════════════════════════
function SupplierReturns({ data, notify, user }) {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const suppliers = data?.suppliers||[];
  const [items, setItems]     = useState([{ product_name:'', qty:1, unit_cost:0 }]);
  const [form, setForm]       = useState({ supplier_id:'', supplier_name:'', branch:user?.branch||'Main Branch', reason:'Defective/Damaged', notes:'' });
  const F = (k,v) => setForm(p=>({...p,[k]:v}));

  const load = async () => {
    setLoading(true);
    try { const r = await supplierReturnsAPI.list(); setReturns(r.data||[]); }
    catch(e) { notify(e.message,'error'); }
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);

  const openModal = () => {
    setForm({ supplier_id:'', supplier_name:'', branch:user?.branch||'Main Branch', reason:'Defective/Damaged', notes:'' });
    setItems([{ product_name:'', qty:1, unit_cost:0 }]);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.supplier_name) return notify('Select a supplier','error');
    if (!items[0].product_name) return notify('Add at least one item','error');
    setSaving(true);
    try {
      await supplierReturnsAPI.create({ ...form, items });
      notify('Supplier return recorded ✅'); load(); setShowForm(false);
    } catch(e) { notify(e.message,'error'); }
    setSaving(false);
  };

  const addItem = () => setItems(p=>[...p,{product_name:'',qty:1,unit_cost:0}]);
  const remItem = (i) => setItems(p=>p.filter((_,idx)=>idx!==i));
  const upItem  = (i,k,v) => setItems(p=>p.map((it,idx)=>idx===i?{...it,[k]:v}:it));
  const total = items.reduce((s,i)=>s+(i.qty*i.unit_cost),0);

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-hd">
          <span className="card-title">↩️ Supplier Returns</span>
          <button className="btn btn-primary" onClick={openModal}>+ New Return</button>
        </div>
        {loading?<Loading/>:(
          <div className="tbl-wrap"><table>
            <thead><tr><th>Return No</th><th>Supplier</th><th>Branch</th><th>Reason</th><th>Value</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {returns.map(r=>(
                <tr key={r.id}>
                  <td style={{ fontWeight:700,fontFamily:"monospace",color:C.accent }}>{r.return_no}</td>
                  <td style={{ fontWeight:600 }}>{r.supplier_name}</td>
                  <td>{r.branch}</td>
                  <td style={{ fontSize:12 }}>{r.reason}</td>
                  <td className="mono" style={{ fontWeight:700 }}>KSh {fmt(r.total_value)}</td>
                  <td><Badge label={r.status} type={{Pending:"b-warning",Confirmed:"b-info",Refunded:"b-success",Replaced:"b-success"}[r.status]||"b-gray"} /></td>
                  <td className="mono" style={{ fontSize:11,color:C.textMuted }}>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display:"flex", gap:4 }}>
                      {r.status==='Pending'&&<button className="btn btn-primary btn-sm" onClick={()=>supplierReturnsAPI.setStatus(r.id,'Confirmed').then(()=>{ notify('Confirmed'); load(); })}>Confirm</button>}
                      {r.status==='Confirmed'&&<button className="btn btn-success btn-sm" onClick={()=>supplierReturnsAPI.setStatus(r.id,'Refunded').then(()=>{ notify('Refunded ✅'); load(); })}>Refunded</button>}
                      <button className="btn btn-danger btn-sm" onClick={async()=>{ if(!window.confirm('Delete this return?'))return; try{ await supplierReturnsAPI.delete(r.id); load(); notify('Deleted'); }catch(e){ notify(e.message,'error'); } }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {returns.length===0&&<div className="empty-state"><div className="es-icon">↩️</div><p>No supplier returns recorded yet.</p></div>}
          </div>
        )}
      </div>

      {showForm && (
        <Overlay onClose={()=>setShowForm(false)}>
          <div className="modal modal-xl" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">↩️ Return to Supplier</div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>
              <div>
                <div style={{ fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:1,marginBottom:10 }}>Return Details</div>
                <div className="fg"><label className="flabel">Supplier *</label>
                  <select className="sel" value={form.supplier_id} onChange={e=>{ const s=suppliers.find(x=>x.id===e.target.value); F('supplier_id',e.target.value); F('supplier_name',s?.name||''); }}>
                    <option value="">Select supplier...</option>
                    {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select></div>
                <div className="fg"><label className="flabel">Branch</label>
                  <select className="sel" value={form.branch} onChange={e=>F('branch',e.target.value)}>
                    {['Main Branch','West Branch','Juja Branch'].map(b=><option key={b}>{b}</option>)}
                  </select></div>
                <div className="fg"><label className="flabel">Reason</label>
                  <select className="sel" value={form.reason} onChange={e=>F('reason',e.target.value)}>
                    {['Defective/Damaged','Wrong Item Supplied','Excess Quantity','Poor Quality','Expired','Other'].map(r=><option key={r}>{r}</option>)}
                  </select></div>
                <div className="fg"><label className="flabel">Notes</label>
                  <textarea className="inp" style={{ minHeight:70 }} value={form.notes} onChange={e=>F('notes',e.target.value)} placeholder="Additional details about the return..." /></div>
              </div>
              <div>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
                  <span style={{ fontSize:11,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:1 }}>Items to Return</span>
                  <button className="btn btn-ghost btn-sm" onClick={addItem}>+ Add Item</button>
                </div>
                {items.map((it,i)=>(
                  <div key={i} style={{ display:"grid",gridTemplateColumns:"3fr 1fr 1fr auto",gap:6,marginBottom:6,alignItems:"center" }}>
                    <input className="inp" placeholder="Product name" value={it.product_name} onChange={e=>upItem(i,'product_name',e.target.value)} />
                    <input className="inp" type="number" placeholder="Qty" value={it.qty} onChange={e=>upItem(i,'qty',+e.target.value)} />
                    <input className="inp" type="number" placeholder="Cost" value={it.unit_cost} onChange={e=>upItem(i,'unit_cost',+e.target.value)} />
                    <button className="btn btn-danger btn-sm" onClick={()=>remItem(i)} disabled={items.length===1}>×</button>
                  </div>
                ))}
                <div style={{ textAlign:"right",fontWeight:800,fontSize:16,marginTop:12,padding:"10px 14px",background:C.surfaceAlt,borderRadius:10,color:C.accent }}>
                  Total Value: KSh {fmt(total)}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?<><Spinner/>Saving...</>:"↩️ Record Return"}</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REORDER ALERTS MODULE
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// SUPPLIER PAYMENTS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function SupplierPaymentsPage({ data, notify, user }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [showForm, setShowForm] = useState(false);
  const suppliers = data?.suppliers||[];
  const [form, setForm] = useState({ supplier_id:'', amount:'', pay_method:'Cash', reference:'', notes:'', payment_date:new Date().toISOString().split('T')[0] });
  const F = (k,v) => setForm(p=>({...p,[k]:v}));

  const load = async () => {
    setLoading(true);
    try { const r = await supplierPaymentsAPI.list(); setPayments(r.data||[]); }
    catch(e) { notify(e.message,'error'); }
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);

  const save = async () => {
    if (!form.supplier_id||!form.amount) return notify('Select supplier and enter amount','error');
    setSaving(true);
    try {
      await supplierPaymentsAPI.create(form);
      notify('Payment recorded ✅'); load(); setShowForm(false);
      setForm({ supplier_id:'',amount:'',pay_method:'Cash',reference:'',notes:'',payment_date:new Date().toISOString().split('T')[0] });
    } catch(e) { notify(e.message,'error'); }
    setSaving(false);
  };

  const totalPaid = payments.reduce((s,p)=>s+Number(p.amount),0);

  return (
    <div>
      <PageHeader title="Supplier Payments" subtitle="Track amounts paid to suppliers" icon="💳"
        action={<button className="btn btn-primary" onClick={()=>setShowForm(v=>!v)}>{showForm?'Cancel':'+ Record Payment'}</button>}
      />
      {showForm&&(
        <div className="card" style={{ marginBottom:16 }}>
          <div className="card-hd"><span className="card-title">Record Supplier Payment</span></div>
          <div className="card-body">
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10 }}>
              <div className="fg"><label className="flabel">Supplier</label>
                <select className="sel" value={form.supplier_id} onChange={e=>F('supplier_id',e.target.value)}>
                  <option value="">Select supplier...</option>
                  {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div className="fg"><label className="flabel">Amount (KSh)</label><input className="inp" type="number" value={form.amount} onChange={e=>F('amount',e.target.value)} /></div>
              <div className="fg"><label className="flabel">Payment Method</label>
                <select className="sel" value={form.pay_method} onChange={e=>F('pay_method',e.target.value)}>
                  {['Cash','Bank Transfer','M-Pesa','Cheque'].map(m=><option key={m}>{m}</option>)}
                </select></div>
              <div className="fg"><label className="flabel">Reference/Receipt No</label><input className="inp" value={form.reference} onChange={e=>F('reference',e.target.value)} placeholder="e.g. CHQ-001" /></div>
              <div className="fg"><label className="flabel">Payment Date</label><input className="inp" type="date" value={form.payment_date} onChange={e=>F('payment_date',e.target.value)} /></div>
              <div className="fg"><label className="flabel">Notes</label><input className="inp" value={form.notes} onChange={e=>F('notes',e.target.value)} /></div>
            </div>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving?<><Spinner/>Saving...</>:"💾 Record Payment"}
            </button>
          </div>
        </div>
      )}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16 }}>
        {[["Total Paid",`KSh ${fmt(totalPaid)}`,C.success],["Payments",payments.length,C.info],["Suppliers Paid",new Set(payments.map(p=>p.supplier_id)).size,C.accent]].map(([l,v,c])=>(
          <div key={l} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",borderTop:`3px solid ${c}` }}>
            <div style={{ fontSize:11,color:C.textMuted }}>{l}</div>
            <div style={{ fontSize:20,fontWeight:800,color:c,fontFamily:"monospace",marginTop:4 }}>{v}</div>
          </div>
        ))}
      </div>
      <div className="card">
        {loading?<Loading/>:(
          <div className="tbl-wrap"><table>
            <thead><tr><th>Date</th><th>Supplier</th><th>Amount</th><th>Method</th><th>Reference</th><th>Recorded By</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {payments.map(p=>(
                <tr key={p.id}>
                  <td style={{ fontSize:12 }}>{p.payment_date}</td>
                  <td style={{ fontWeight:700 }}>{p.supplier_name}</td>
                  <td style={{ fontWeight:800,color:C.success,fontFamily:"monospace" }}>KSh {fmt(p.amount)}</td>
                  <td><Badge label={p.pay_method} type="b-info" /></td>
                  <td style={{ fontSize:12,fontFamily:"monospace",color:C.textMuted }}>{p.reference||'—'}</td>
                  <td style={{ fontSize:12,color:C.textMuted }}>{p.recorded_by_name}</td>
                  <td style={{ fontSize:12,color:C.textMuted }}>{p.notes||'—'}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={async()=>{ if(!window.confirm('Delete this payment record?'))return; try{ await supplierPaymentsAPI.delete(p.id); load(); notify('Deleted'); }catch(e){ notify(e.message,'error'); } }}>🗑️</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {payments.length===0&&<div className="empty-state" style={{padding:24}}><div className="es-icon">💳</div><p>No payments recorded yet.</p></div>}
          </div>
        )}
      </div>
    </div>
  );
}

function ReorderAlerts({ data, notify, user }) {
  const [rules, setRules]     = useState([]);
  const [alerts, setAlerts]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [tab, setTab]         = useState("alerts");
  const [editRule, setEditRule] = useState(null);
  const [form, setForm]       = useState({ product_id:'', reorder_point:10, reorder_qty:50, preferred_supplier_id:'', auto_po:false });
  const F = (k,v) => setForm(p=>({...p,[k]:v}));
  const products  = data?.products||[];
  const suppliers = data?.suppliers||[];

  const load = async () => {
    setLoading(true);
    try {
      const [r, a] = await Promise.all([reorderAPI.list(), reorderAPI.alerts()]);
      setRules(r.data||[]); setAlerts(a.data||[]);
    } catch(e) { notify(e.message,'error'); }
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);

  const save = async () => {
    if (!form.product_id) return notify('Select a product','error');
    setSaving(true);
    try { await reorderAPI.save(form); notify('Reorder rule saved ✅'); load(); setForm({ product_id:'',reorder_point:10,reorder_qty:50,preferred_supplier_id:'',auto_po:false }); setEditRule(null); }
    catch(e) { notify(e.message,'error'); }
    setSaving(false);
  };

  return (
    <div>
      <PageHeader title="Reorder Alerts" subtitle="Auto-flag low stock products" icon="🔔"
        action={<div style={{ display:"flex",gap:6,alignItems:"center" }}><div style={{ background:C.danger,color:"#fff",borderRadius:"50%",width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13 }}>{alerts.length}</div><span style={{ fontSize:13,color:C.danger,fontWeight:700 }}>alerts</span></div>}
      />
      <div style={{ display:"flex",gap:4,background:C.surfaceAlt,padding:4,borderRadius:10,marginBottom:20,width:"fit-content" }}>
        {[["alerts","🚨","Active Alerts"],["rules","⚙️","Reorder Rules"]].map(([k,i,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ padding:"7px 16px",borderRadius:7,border:"none",cursor:"pointer",background:tab===k?C.surface:"transparent",color:tab===k?C.text:C.textMuted,fontWeight:600,fontSize:12,fontFamily:"inherit",boxShadow:tab===k?"0 1px 4px rgba(0,0,0,.25)":"none" }}>{i} {l}</button>
        ))}
      </div>

      {tab==="alerts" && (
        <div>
          {alerts.length>0&&<div style={{ padding:"12px 16px",background:C.danger+"18",border:`1px solid ${C.danger}44`,borderRadius:10,marginBottom:16,fontSize:13,color:C.danger,fontWeight:700 }}>
            🚨 {alerts.length} product(s) need restocking now
          </div>}
          <div className="card">
            {loading?<Loading/>:(
              <div className="tbl-wrap"><table>
                <thead><tr><th>Product</th><th>Category</th><th>Current Stock</th><th>Reorder Point</th><th>Shortage</th><th>Reorder Qty</th><th>Supplier</th></tr></thead>
                <tbody>
                  {alerts.map(a=>(
                    <tr key={a.id} style={{ background:C.danger+"08" }}>
                      <td style={{ fontWeight:700 }}>{a.product_name}</td>
                      <td><Badge label={a.category||'—'} type="b-gray" /></td>
                      <td><span style={{ fontWeight:800,color:C.danger }}>{a.current_stock}</span></td>
                      <td>{a.reorder_point}</td>
                      <td><span style={{ fontWeight:800,color:C.danger }}>-{a.shortage}</span></td>
                      <td style={{ fontWeight:700,color:C.success }}>{a.reorder_qty}</td>
                      <td style={{ fontSize:12,color:C.textMuted }}>{a.supplier_name||'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {alerts.length===0&&<div className="empty-state" style={{padding:24}}><div className="es-icon">✅</div><p>No reorder alerts — all stock levels are healthy!</p></div>}
              </div>
            )}
          </div>
        </div>
      )}

      {tab==="rules" && (
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
          <div className="card">
            <div className="card-hd"><span className="card-title">{editRule?'Edit Rule':'+ Add Reorder Rule'}</span></div>
            <div className="card-body">
              <div className="fg"><label className="flabel">Product</label>
                <select className="sel" value={form.product_id} onChange={e=>F('product_id',e.target.value)}>
                  <option value="">Select product...</option>
                  {products.map(p=><option key={p.id} value={p.id}>{p.name} (Stock: {p.quantity})</option>)}
                </select></div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                <div className="fg"><label className="flabel">Reorder Point</label><input className="inp" type="number" value={form.reorder_point} onChange={e=>F('reorder_point',+e.target.value)} /></div>
                <div className="fg"><label className="flabel">Reorder Quantity</label><input className="inp" type="number" value={form.reorder_qty} onChange={e=>F('reorder_qty',+e.target.value)} /></div>
              </div>
              <div className="fg"><label className="flabel">Preferred Supplier</label>
                <select className="sel" value={form.preferred_supplier_id} onChange={e=>F('preferred_supplier_id',e.target.value)}>
                  <option value="">None</option>
                  {suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <button className="btn btn-primary" style={{ width:"100%",justifyContent:"center" }} onClick={save} disabled={saving}>
                {saving?<><Spinner/>Saving...</>:"💾 Save Rule"}
              </button>
            </div>
          </div>
          <div className="card">
            <div className="card-hd"><span className="card-title">All Reorder Rules ({rules.length})</span><button className="btn btn-ghost btn-sm" onClick={load}>🔄</button></div>
            {loading?<Loading/>:(
              <div className="tbl-wrap"><table>
                <thead><tr><th>Product</th><th>Current</th><th>Point</th><th>Qty</th><th>Actions</th></tr></thead>
                <tbody>
                  {rules.map(r=>(
                    <tr key={r.id}>
                      <td style={{ fontWeight:600 }}>{r.product_name}</td>
                      <td style={{ fontWeight:700,color:r.current_stock<=r.reorder_point?C.danger:C.success }}>{r.current_stock}</td>
                      <td>{r.reorder_point}</td>
                      <td style={{ color:C.success }}>{r.reorder_qty}</td>
                      <td><button className="btn btn-danger btn-sm" onClick={()=>reorderAPI.delete(r.id).then(()=>{ notify('Deleted'); load(); })}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rules.length===0&&<div className="empty-state" style={{padding:20}}><p>No reorder rules set.</p></div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER LOYALTY MODULE
// ═══════════════════════════════════════════════════════════════════════════════
function LoyaltyProgram({ data, notify, user }) {
  const [tab, setTab]           = useState("leaderboard");
  const [leaderboard, setBoard] = useState([]);
  const [settings, setSettings] = useState({ points_per_ksh:1, ksh_per_point:0.5, silver_threshold:500, gold_threshold:2000, platinum_threshold:10000 });
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [lookupId, setLookupId] = useState('');
  const [acct, setAcct]         = useState(null);
  const [txns, setTxns]         = useState([]);
  const [creditAmt, setCreditAmt] = useState('');
  const [creditNote, setCreditNote] = useState('');
  const customers = data?.customers||[];

  const S = (k,v) => setSettings(p=>({...p,[k]:v}));

  const load = async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([loyaltyAPI.leaderboard(), loyaltyAPI.settings()]);
      setBoard(b.data||[]);
      if (s.data && s.data.id) setSettings(s.data);
    } catch(e) { notify(e.message,'error'); }
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);

  const lookup = async () => {
    if (!lookupId) return;
    setLoading(true);
    try {
      const [a, t] = await Promise.all([loyaltyAPI.account(lookupId), loyaltyAPI.transactions(lookupId)]);
      setAcct(a.data); setTxns(t.data||[]);
    } catch(e) { notify(e.message,'error'); }
    setLoading(false);
  };

  const enroll = async (cid) => {
    try { const r = await loyaltyAPI.enroll(cid); notify(r.message); load(); }
    catch(e) { notify(e.message,'error'); }
  };

  const addCredit = async () => {
    if (!acct || !creditAmt) return;
    try { await loyaltyAPI.addCredit({ customer_id: acct.customer_id, amount: +creditAmt, notes: creditNote }); notify('Credit added ✅'); lookup(); setCreditAmt(''); }
    catch(e) { notify(e.message,'error'); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try { await loyaltyAPI.saveSettings(settings); notify('Settings saved ✅'); }
    catch(e) { notify(e.message,'error'); }
    setSaving(false);
  };

  const TIER_COLOR = { Bronze:"#cd7f32", Silver:"#c0c0c0", Gold:"#ffd700", Platinum:"#e5e4e2" };
  const TIER_ICON  = { Bronze:"🥉", Silver:"🥈", Gold:"🥇", Platinum:"💎" };

  const TABS = [["leaderboard","🏆","Leaderboard"],["lookup","🔍","Customer Lookup"],["settings","⚙️","Settings"]];

  return (
    <div>
      <PageHeader title="Loyalty Program" subtitle="Points, credit & VIP tiers" icon="🌟" />
      <div style={{ display:"flex",gap:4,background:C.surfaceAlt,padding:4,borderRadius:10,marginBottom:20,width:"fit-content" }}>
        {TABS.map(([k,i,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ padding:"7px 16px",borderRadius:7,border:"none",cursor:"pointer",background:tab===k?C.surface:"transparent",color:tab===k?C.text:C.textMuted,fontWeight:600,fontSize:12,fontFamily:"inherit",boxShadow:tab===k?"0 1px 4px rgba(0,0,0,.25)":"none" }}>{i} {l}</button>
        ))}
      </div>

      {tab==="leaderboard" && (
        <div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:20 }}>
            {Object.entries(TIER_ICON).map(([tier,icon])=>{
              const count = leaderboard.filter(l=>l.tier===tier).length;
              return (
                <div key={tier} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 16px",borderTop:`3px solid ${TIER_COLOR[tier]}` }}>
                  <div style={{ fontSize:22 }}>{icon}</div>
                  <div style={{ fontSize:20,fontWeight:800,color:TIER_COLOR[tier],fontFamily:"monospace",marginTop:4 }}>{count}</div>
                  <div style={{ fontSize:11,color:C.textMuted,marginTop:2 }}>{tier}</div>
                </div>
              );
            })}
          </div>
          <div className="card">
            <div className="card-hd"><span className="card-title">🏆 Loyalty Leaderboard</span><button className="btn btn-ghost btn-sm" onClick={load}>🔄</button></div>
            {loading?<Loading/>:(
              <div className="tbl-wrap"><table>
                <thead><tr><th>#</th><th>Customer</th><th>Tier</th><th>Points</th><th>Credit Balance</th><th>Total Spent</th></tr></thead>
                <tbody>
                  {leaderboard.map((l,i)=>(
                    <tr key={l.id}>
                      <td style={{ fontWeight:800,color:i<3?C.accent:C.textMuted }}>{i+1}</td>
                      <td style={{ fontWeight:700 }}>{l.name}<div style={{ fontSize:10,color:C.textMuted }}>{l.phone}</div></td>
                      <td><span style={{ fontWeight:700,color:TIER_COLOR[l.tier] }}>{TIER_ICON[l.tier]} {l.tier}</span></td>
                      <td style={{ fontWeight:800,color:C.accent,fontFamily:"monospace" }}>{(l.points||0).toLocaleString()}</td>
                      <td className="mono">KSh {fmt(l.credit_balance)}</td>
                      <td className="mono">KSh {fmt(l.total_spent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {leaderboard.length===0&&<div className="empty-state" style={{padding:24}}><div className="es-icon">🌟</div><p>No loyalty members yet.</p></div>}
              </div>
            )}
          </div>
        </div>
      )}

      {tab==="lookup" && (
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
          <div>
            <div className="card" style={{ marginBottom:16 }}>
              <div className="card-hd"><span className="card-title">🔍 Customer Lookup</span></div>
              <div className="card-body">
                <div className="fg"><label className="flabel">Select Customer</label>
                  <select className="sel" value={lookupId} onChange={e=>setLookupId(e.target.value)}>
                    <option value="">Choose customer...</option>
                    {customers.map(c=><option key={c.id} value={c.id}>{c.name} {c.phone?`(${c.phone})`:''}</option>)}
                  </select></div>
                <div style={{ display:"flex",gap:8 }}>
                  <button className="btn btn-primary" style={{ flex:1,justifyContent:"center" }} onClick={lookup} disabled={!lookupId}>🔍 Lookup</button>
                  <button className="btn btn-success btn-sm" onClick={()=>enroll(lookupId)} disabled={!lookupId}>Enroll</button>
                </div>
              </div>
            </div>

            {acct && (
              <div className="card">
                <div className="card-hd"><span className="card-title">💳 Account</span><span style={{ color:TIER_COLOR[acct.tier],fontWeight:700 }}>{TIER_ICON[acct.tier]} {acct.tier}</span></div>
                <div className="card-body">
                  {[["Points Balance",`${(acct.points||0).toLocaleString()} pts`,C.accent],["Credit Balance",`KSh ${fmt(acct.credit_balance)}`,C.success],["Total Spent",`KSh ${fmt(acct.total_spent)}`,C.info],["Lifetime Points",`${(acct.total_earned_points||0).toLocaleString()}`,C.textMuted]].map(([l,v,c])=>(
                    <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}` }}>
                      <span style={{ fontSize:12,color:C.textMuted }}>{l}</span><span style={{ fontWeight:700,color:c }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ marginTop:16,paddingTop:12,borderTop:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:11,fontWeight:700,color:C.textMuted,marginBottom:8,textTransform:"uppercase",letterSpacing:1 }}>Add Credit Balance</div>
                    <div style={{ display:"flex",gap:8,marginBottom:6 }}>
                      <input className="inp" type="number" placeholder="Amount (KSh)" value={creditAmt} onChange={e=>setCreditAmt(e.target.value)} style={{ flex:1 }} />
                      <button className="btn btn-success btn-sm" onClick={addCredit}>+ Add</button>
                    </div>
                    <input className="inp" placeholder="Note (optional)" value={creditNote} onChange={e=>setCreditNote(e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-hd"><span className="card-title">📜 Transaction History</span></div>
            <div style={{ maxHeight:500,overflowY:"auto" }}>
              {txns.length===0?<div className="empty-state" style={{padding:24}}><p>Select a customer to view history.</p></div>:
                txns.map(t=>{
                  const isPositive = ['EARN_POINTS','CREDIT_DEPOSIT','BONUS','TIER_UPGRADE'].includes(t.type);
                  return (
                    <div key={t.id} style={{ display:"flex",gap:12,padding:"10px 16px",borderBottom:`1px solid ${C.border}`,alignItems:"center" }}>
                      <div style={{ width:34,height:34,borderRadius:8,background:isPositive?C.success+"22":C.danger+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>
                        {isPositive?'⬆️':'⬇️'}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600,fontSize:13 }}>{t.type.replace(/_/g,' ')}</div>
                        <div style={{ fontSize:11,color:C.textMuted }}>{t.reference||''} · {new Date(t.created_at).toLocaleString()}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        {t.points!==0&&<div style={{ fontWeight:700,color:isPositive?C.success:C.danger,fontFamily:"monospace" }}>{t.points>0?'+':''}{t.points} pts</div>}
                        {t.credit_amount!==0&&<div style={{ fontSize:12,color:C.textMuted }}>KSh {fmt(Math.abs(t.credit_amount))}</div>}
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>
        </div>
      )}

      {tab==="settings" && (
        <div style={{ maxWidth:500 }}>
          <div className="card">
            <div className="card-hd"><span className="card-title">⚙️ Loyalty Settings</span></div>
            <div className="card-body">
              {[
                ["Points earned per KSh spent","points_per_ksh","e.g. 1 = 1 point per KSh 1"],
                ["KSh value per redeemed point","ksh_per_point","e.g. 0.5 = KSh 0.50 per point"],
              ].map(([l,k,h])=>(
                <div key={k} className="fg"><label className="flabel">{l}</label>
                  <input className="inp" type="number" step="0.01" value={settings[k]||''} onChange={e=>S(k,e.target.value)} placeholder={h} /></div>
              ))}
              <div style={{ marginTop:8,padding:12,background:C.surfaceAlt,borderRadius:8,marginBottom:12 }}>
                <div style={{ fontSize:11,fontWeight:700,color:C.textMuted,marginBottom:6,textTransform:"uppercase",letterSpacing:1 }}>Tier Thresholds (Lifetime Points)</div>
                {[["Silver 🥈","silver_threshold"],["Gold 🥇","gold_threshold"],["Platinum 💎","platinum_threshold"]].map(([l,k])=>(
                  <div key={k} className="fg"><label className="flabel">{l} from</label>
                    <input className="inp" type="number" value={settings[k]||''} onChange={e=>S(k,+e.target.value)} /></div>
                ))}
              </div>
              <button className="btn btn-primary" style={{ width:"100%",justifyContent:"center" }} onClick={saveSettings} disabled={saving}>
                {saving?<><Spinner/>Saving...</>:"💾 Save Settings"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMISSION MANAGEMENT MODULE
// ═══════════════════════════════════════════════════════════════════════════════
function CommissionManager({ data, notify, user }) {
  const [tab, setTab]       = useState("rules");
  const [rules, setRules]   = useState([]);
  const [summary, setSummary] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [month, setMonth]     = useState(new Date().toISOString().slice(0,7));
  const [newRule, setNewRule] = useState({ category:'', rate_percent:2 });
  const cats = [...new Set((data?.products||[]).map(p=>p.category).filter(Boolean))];

  const load = async () => {
    setLoading(true);
    try {
      const [r, s, e] = await Promise.all([
        commissionAPI.rules(),
        commissionAPI.summary({ month }),
        commissionAPI.earnings({ month }),
      ]);
      setRules(r.data||[]); setSummary(s.data||[]); setEarnings(e.data||[]);
    } catch(e) { notify(e.message,'error'); }
    setLoading(false);
  };
  useEffect(()=>{ load(); },[month]);

  const saveRule = async () => {
    if (!newRule.category) return notify('Enter category','error');
    setSaving(true);
    try { await commissionAPI.saveRule(newRule); notify('Rule saved ✅'); load(); setNewRule({ category:'',rate_percent:2 }); }
    catch(e) { notify(e.message,'error'); }
    setSaving(false);
  };

  const TABS = [["rules","⚙️","Commission Rules"],["summary","📊","Staff Summary"],["earnings","📋","All Earnings"]];

  return (
    <div>
      <PageHeader title="Staff Commission" subtitle="Category-based commission tracking" icon="💵" />
      <div style={{ display:"flex",gap:4,background:C.surfaceAlt,padding:4,borderRadius:10,marginBottom:20,width:"fit-content" }}>
        {TABS.map(([k,i,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ padding:"7px 16px",borderRadius:7,border:"none",cursor:"pointer",background:tab===k?C.surface:"transparent",color:tab===k?C.text:C.textMuted,fontWeight:600,fontSize:12,fontFamily:"inherit",boxShadow:tab===k?"0 1px 4px rgba(0,0,0,.25)":"none" }}>{i} {l}</button>
        ))}
      </div>

      {tab==="rules" && (
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
          <div className="card">
            <div className="card-hd"><span className="card-title">+ Add / Update Rule</span></div>
            <div className="card-body">
              <div style={{ fontSize:12,color:C.textMuted,marginBottom:12,lineHeight:1.6 }}>Set a commission % per product category. When a sale is made, the cashier earns this % on that sale amount.</div>
              <div className="fg"><label className="flabel">Product Category</label>
                <input className="inp" list="cats" value={newRule.category} onChange={e=>setNewRule(p=>({...p,category:e.target.value}))} placeholder="e.g. Electronics, Phones..." />
                <datalist id="cats">{cats.map(c=><option key={c} value={c}/>)}</datalist></div>
              <div className="fg"><label className="flabel">Commission Rate (%)</label>
                <input className="inp" type="number" step="0.1" min="0" max="100" value={newRule.rate_percent} onChange={e=>setNewRule(p=>({...p,rate_percent:+e.target.value}))} /></div>
              <button className="btn btn-primary" style={{ width:"100%",justifyContent:"center" }} onClick={saveRule} disabled={saving}>
                {saving?<><Spinner/>Saving...</>:"💾 Save Rule"}
              </button>
            </div>
          </div>
          <div className="card">
            <div className="card-hd"><span className="card-title">Commission Rules ({rules.length})</span></div>
            {loading?<Loading/>:(
              <div className="tbl-wrap"><table>
                <thead><tr><th>Category</th><th>Rate</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {rules.map(r=>(
                    <tr key={r.id}>
                      <td style={{ fontWeight:700 }}>{r.category}</td>
                      <td style={{ fontWeight:800,color:C.accent,fontFamily:"monospace" }}>{r.rate_percent}%</td>
                      <td><Badge label={r.is_active?"Active":"Inactive"} type={r.is_active?"b-success":"b-gray"} /></td>
                      <td><button className="btn btn-danger btn-sm" onClick={()=>commissionAPI.deleteRule(r.id).then(()=>{ notify('Deleted'); load(); })}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rules.length===0&&<div className="empty-state" style={{padding:20}}><p>No commission rules. Add one to start tracking.</p></div>}
              </div>
            )}
          </div>
        </div>
      )}

      {tab==="summary" && (
        <div>
          <div style={{ display:"flex",gap:10,alignItems:"center",marginBottom:16 }}>
            <label className="flabel" style={{ margin:0,whiteSpace:"nowrap" }}>Month:</label>
            <input className="inp" type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{ width:160 }} />
          </div>
          <div className="card">
            {loading?<Loading/>:(
              <div className="tbl-wrap"><table>
                <thead><tr><th>Staff</th><th>Sales</th><th>Commission Earned</th><th>Paid</th><th>Pending</th><th>Actions</th></tr></thead>
                <tbody>
                  {summary.map(s=>(
                    <tr key={s.staff_id}>
                      <td style={{ fontWeight:700 }}>{s.staff_name}</td>
                      <td className="mono">KSh {fmt(s.total_sales)}</td>
                      <td style={{ fontWeight:800,color:C.accent,fontFamily:"monospace" }}>KSh {fmt(s.total_commission)}</td>
                      <td className="mono" style={{ color:C.success }}>KSh {fmt(s.paid)}</td>
                      <td className="mono" style={{ color:s.pending>0?C.warning:C.textMuted }}>KSh {fmt(s.pending)}</td>
                      <td>
                        {s.pending>0&&user?.role==='Admin'&&(
                          <button className="btn btn-success btn-sm" onClick={()=>commissionAPI.payBatch({ staff_id:s.staff_id, month }).then(()=>{ notify('Commission paid ✅'); load(); })}>Pay KSh {fmt(s.pending)}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {summary.length===0&&<div className="empty-state" style={{padding:24}}><div className="es-icon">💵</div><p>No commission earnings for this month.</p></div>}
              </div>
            )}
          </div>
        </div>
      )}

      {tab==="earnings" && (
        <div>
          <div style={{ display:"flex",gap:10,alignItems:"center",marginBottom:16 }}>
            <label className="flabel" style={{ margin:0 }}>Month:</label>
            <input className="inp" type="month" value={month} onChange={e=>setMonth(e.target.value)} style={{ width:160 }} />
          </div>
          <div className="card">
            {loading?<Loading/>:(
              <div className="tbl-wrap"><table>
                <thead><tr><th>Date</th><th>Staff</th><th>Product</th><th>Category</th><th>Sale</th><th>Rate</th><th>Commission</th><th>Status</th></tr></thead>
                <tbody>
                  {earnings.map(e=>(
                    <tr key={e.id}>
                      <td style={{ fontSize:11,color:C.textMuted }}>{e.sale_date}</td>
                      <td style={{ fontWeight:600 }}>{e.staff_name}</td>
                      <td style={{ fontSize:12 }}>{e.product_name}</td>
                      <td><Badge label={e.category||'—'} type="b-gray" /></td>
                      <td className="mono">KSh {fmt(e.sale_amount)}</td>
                      <td style={{ fontFamily:"monospace",color:C.accent }}>{e.rate_percent}%</td>
                      <td style={{ fontWeight:700,color:C.success,fontFamily:"monospace" }}>KSh {fmt(e.commission)}</td>
                      <td><Badge label={e.status} type={{Pending:"b-warning",Approved:"b-info",Paid:"b-success"}[e.status]||"b-gray"} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {earnings.length===0&&<div className="empty-state" style={{padding:24}}><p>No earnings this month.</p></div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYROLL MODULE
// ═══════════════════════════════════════════════════════════════════════════════
function PayrollManager({ data, notify, user }) {
  const [runs, setRuns]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [newModal, setNewModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm]         = useState({ period_start:'', period_end:'', branch:user?.branch||'All', notes:'' });
  const F = (k,v) => setForm(p=>({...p,[k]:v}));

  const load = async () => {
    setLoading(true);
    try { const r = await payrollAPI.runs(); setRuns(r.data||[]); }
    catch(e) { notify(e.message,'error'); }
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);

  const create = async () => {
    if (!form.period_start||!form.period_end) return notify('Select period dates','error');
    setSaving(true);
    try {
      const r = await payrollAPI.create(form);
      notify(r.message); load(); setNewModal(false);
    } catch(e) { notify(e.message,'error'); }
    setSaving(false);
  };

  const loadDetail = async (id) => {
    setLoading(true);
    try { const r = await payrollAPI.getRun(id); setSelected(r.data); }
    catch(e) { notify(e.message,'error'); }
    setLoading(false);
  };

  const printPayslip = (run, item) => {
    const w = window.open('','_blank');
    w.document.write(`<html><head><title>Payslip</title>
    <style>body{font-family:Arial;padding:40px;color:#333;max-width:600px;margin:0 auto;} table{width:100%;border-collapse:collapse;} td{padding:6px 0;} .r{text-align:right;} hr{border:1px solid #ddd;} .bold{font-weight:bold;}</style></head><body>
    <h2>PAYSLIP</h2><p><strong>VES CONNECTIONS LIMITED</strong></p>
    <hr/><table><tr><td>Employee:</td><td class="r bold">${item.employee_name}</td></tr>
    <tr><td>Position:</td><td class="r">${item.position||'—'}</td></tr>
    <tr><td>Branch:</td><td class="r">${item.branch||'—'}</td></tr>
    <tr><td>Period:</td><td class="r">${run.period_start} to ${run.period_end}</td></tr>
    <tr><td>Days Worked:</td><td class="r">${item.days_worked}</td></tr></table>
    <hr/><h3>Earnings</h3>
    <table><tr><td>Basic Salary</td><td class="r">KSh ${Number(item.basic_salary).toLocaleString()}</td></tr>
    <tr><td>Allowances</td><td class="r">KSh ${Number(item.allowances).toLocaleString()}</td></tr>
    <tr><td>Commission</td><td class="r">KSh ${Number(item.commission).toLocaleString()}</td></tr>
    <tr><td class="bold">Gross Pay</td><td class="r bold">KSh ${Number(item.gross_pay).toLocaleString()}</td></tr></table>
    <hr/><h3>Deductions</h3>
    <table><tr><td>NHIF</td><td class="r">KSh ${Number(item.nhif).toLocaleString()}</td></tr>
    <tr><td>NSSF</td><td class="r">KSh ${Number(item.nssf).toLocaleString()}</td></tr>
    <tr><td>PAYE Tax</td><td class="r">KSh ${Number(item.paye).toLocaleString()}</td></tr></table>
    <hr/><table><tr><td class="bold" style="font-size:18px">NET PAY</td><td class="r bold" style="font-size:18px;color:green">KSh ${Number(item.net_pay).toLocaleString()}</td></tr></table>
    <p style="font-size:11px;color:#999;margin-top:30px">Generated by VES CONNECTIONS ERP · ${new Date().toLocaleString()}</p>
    <script>window.print();</script></body></html>`);
  };

  return (
    <div className="fade-in">
      <div className="card">
        <div className="card-hd">
          <span className="card-title">💰 Payroll Runs</span>
          <button className="btn btn-primary" onClick={()=>setNewModal(true)}>+ New Payroll Run</button>
        </div>
        {loading?<Loading/>:(
          <div className="tbl-wrap"><table>
            <thead><tr><th>Period</th><th>Branch</th><th>Staff</th><th>Gross</th><th>Net Pay</th><th>Status</th><th>Created By</th><th>Actions</th></tr></thead>
            <tbody>
              {runs.map(r=>(
                <tr key={r.id}>
                  <td style={{ fontWeight:700 }}>{r.period_start} → {r.period_end}</td>
                  <td>{r.branch}</td>
                  <td style={{ fontWeight:700,color:C.info }}>{r.staff_count||0}</td>
                  <td className="mono">KSh {fmt(r.total_gross)}</td>
                  <td style={{ fontWeight:800,color:C.accent,fontFamily:"monospace" }}>KSh {fmt(r.total_net)}</td>
                  <td><Badge label={r.status} type={{Draft:"b-gray",Approved:"b-info",Paid:"b-success"}[r.status]||"b-gray"} /></td>
                  <td style={{ fontSize:12,color:C.textMuted }}>{r.created_by_name}</td>
                  <td>
                    <div style={{ display:"flex", gap:4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={()=>loadDetail(r.id)}>View →</button>
                      {r.status==='Draft'&&<button className="btn btn-success btn-sm" onClick={async()=>{ try{ await payrollAPI.approve(r.id); load(); notify('Approved ✅'); }catch(e){ notify(e.message,'error'); } }}>Approve</button>}
                      {r.status==='Approved'&&<button className="btn btn-primary btn-sm" onClick={async()=>{ try{ await payrollAPI.pay(r.id); load(); notify('Marked Paid ✅'); }catch(e){ notify(e.message,'error'); } }}>Mark Paid</button>}
                      {r.status==='Draft'&&<button className="btn btn-danger btn-sm" onClick={async()=>{ if(!window.confirm('Delete this payroll run?'))return; try{ await payrollAPI.delete(r.id); load(); notify('Deleted'); }catch(e){ notify(e.message,'error'); } }}>🗑️</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {runs.length===0&&<div className="empty-state"><div className="es-icon">💰</div><p>No payroll runs yet.</p></div>}
          </div>
        )}
      </div>

      {/* New Payroll Run Modal */}
      {newModal && (
        <Overlay onClose={()=>setNewModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">⚙️ New Payroll Run</div>
            <div style={{ padding:"10px 14px",background:C.info+"18",borderRadius:8,fontSize:12,color:C.info,marginBottom:16,lineHeight:1.6 }}>
              ℹ️ Payroll auto-calculates from employee basic salary + attendance + approved commissions. Set salaries in Employees module first.
            </div>
            <div className="frow">
              <div className="fg"><label className="flabel">Period Start *</label><input className="inp" type="date" value={form.period_start} onChange={e=>F('period_start',e.target.value)} /></div>
              <div className="fg"><label className="flabel">Period End *</label><input className="inp" type="date" value={form.period_end} onChange={e=>F('period_end',e.target.value)} /></div>
            </div>
            <div className="fg"><label className="flabel">Branch</label>
              <select className="sel" value={form.branch} onChange={e=>F('branch',e.target.value)}>
                {['All','Main Branch','West Branch','Juja Branch'].map(b=><option key={b}>{b}</option>)}
              </select></div>
            <div className="fg"><label className="flabel">Notes</label><input className="inp" value={form.notes} onChange={e=>F('notes',e.target.value)} placeholder="Optional notes..." /></div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setNewModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={create} disabled={saving}>{saving?<><Spinner/>Calculating...</>:"⚙️ Generate Payroll"}</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* Payroll Detail Modal */}
      {selected && (
        <Overlay onClose={()=>setSelected(null)}>
          <div className="modal modal-xl" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">
              💰 Payroll — {selected.period_start} to {selected.period_end}
              <Badge label={selected.status} type={{Draft:"b-gray",Approved:"b-info",Paid:"b-success"}[selected.status]||"b-gray"} />
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:18 }}>
              {[["Staff",selected.staff_count||'—',C.info],["Gross",`KSh ${fmt(selected.total_gross)}`,C.success],["NHIF",`KSh ${fmt(selected.total_nhif)}`,C.warning],["NSSF",`KSh ${fmt(selected.total_nssf)}`,C.warning],["PAYE",`KSh ${fmt(selected.total_paye)}`,C.danger],["Net Pay",`KSh ${fmt(selected.total_net)}`,C.accent]].map(([l,v,c])=>(
                <div key={l} style={{ background:C.surfaceAlt,borderRadius:10,padding:"10px 12px",borderTop:`3px solid ${c}` }}>
                  <div style={{ fontSize:10,color:C.textMuted }}>{l}</div>
                  <div style={{ fontSize:13,fontWeight:800,color:c,fontFamily:"monospace",marginTop:2 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ maxHeight:380,overflowY:"auto" }}>
              <table style={{ width:"100%",borderCollapse:"collapse" }}>
                <thead><tr style={{ position:"sticky",top:0,background:C.surface }}><th style={{ textAlign:"left",padding:"8px 10px",fontSize:11,color:C.textMuted }}>Employee</th><th>Days</th><th>Basic</th><th>Commission</th><th>Gross</th><th>NHIF</th><th>NSSF</th><th>PAYE</th><th style={{ color:C.accent }}>Net Pay</th><th></th></tr></thead>
                <tbody>
                  {(selected.items||[]).map(item=>(
                    <tr key={item.id} style={{ borderBottom:`1px solid ${C.border}` }}>
                      <td style={{ fontWeight:700,padding:"8px 10px" }}>{item.employee_name}<div style={{ fontSize:10,color:C.textMuted }}>{item.position}</div></td>
                      <td style={{ textAlign:"center",fontSize:13 }}>{item.days_worked}</td>
                      <td className="mono" style={{ fontSize:12 }}>KSh {fmt(item.basic_salary)}</td>
                      <td className="mono" style={{ fontSize:12,color:C.success }}>KSh {fmt(item.commission)}</td>
                      <td className="mono" style={{ fontSize:12,fontWeight:700 }}>KSh {fmt(item.gross_pay)}</td>
                      <td className="mono" style={{ fontSize:12,color:C.danger }}>-{fmt(item.nhif)}</td>
                      <td className="mono" style={{ fontSize:12,color:C.danger }}>-{fmt(item.nssf)}</td>
                      <td className="mono" style={{ fontSize:12,color:C.danger }}>-{fmt(item.paye)}</td>
                      <td style={{ fontWeight:800,color:C.accent,fontFamily:"monospace",fontSize:13 }}>KSh {fmt(item.net_pay)}</td>
                      <td><button className="btn btn-ghost btn-sm" onClick={()=>printPayslip(selected,item)}>🖨️</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setSelected(null)}>Close</button>
              {selected.status==='Draft'&&user?.role==='Admin'&&<button className="btn btn-primary" onClick={()=>payrollAPI.approve(selected.id).then(()=>{ notify('Approved ✅'); loadDetail(selected.id); })}>✅ Approve</button>}
              {selected.status==='Approved'&&user?.role==='Admin'&&<button className="btn btn-success" onClick={()=>payrollAPI.pay(selected.id).then(()=>{ notify('Marked as Paid ✅'); loadDetail(selected.id); })}>💰 Mark Paid</button>}
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ONFON STOCK MANAGEMENT — Full Module
// ═══════════════════════════════════════════════════════════════════════════════

// ── Shared IMEI Scanner hook ──────────────────────────────────────────────────
function useIMEIScanner(onScan) {
  const bufRef = React.useRef("");
  const timerRef = React.useRef(null);
  useEffect(() => {
    const handler = e => {
      if (e.key === "Enter") {
        const val = bufRef.current.trim();
        if (val.length >= 10) onScan(val.replace(/\D/g, ""));
        bufRef.current = "";
      } else if (e.key.length === 1) {
        bufRef.current += e.key;
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { bufRef.current = ""; }, 500);
      }
    };
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); clearTimeout(timerRef.current); };
  }, [onScan]);
}

// ── Status badge helper ───────────────────────────────────────────────────────
const ONFON_STATUS_COLOR = {
  IN_STOCK:          "b-success",
  ASSIGNED_TO_AGENT: "b-warning",
  SOLD:              "b-info",
  RETURNED:          "b-ghost",
  DAMAGED:           "b-danger",
};
const ONFON_STATUS_ICON = {
  IN_STOCK:"📦", ASSIGNED_TO_AGENT:"🤝", SOLD:"✅", RETURNED:"↩️", DAMAGED:"⚠️"
};

// ── IMEI input component ──────────────────────────────────────────────────────
function IMEIInput({ value, onChange, onSubmit, placeholder, autoFocus }) {
  const inputRef = React.useRef(null);
  useEffect(() => { if (autoFocus && inputRef.current) inputRef.current.focus(); }, [autoFocus]);
  return (
    <div style={{ position:"relative" }}>
      <input
        ref={inputRef}
        className="inp"
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g,"").slice(0,15))}
        onKeyDown={e => e.key==="Enter" && onSubmit && onSubmit()}
        placeholder={placeholder || "Scan or type IMEI (15 digits)..."}
        style={{ fontFamily:"monospace", fontSize:15, letterSpacing:2, paddingRight:90 }}
        maxLength={15}
      />
      <div style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", fontSize:11, color:value.length===15?C.success:C.textMuted, fontWeight:600 }}>
        {value.length}/15 {value.length===15?"✓":""}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ONFON DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
function OnfonDashboard({ notify, setPage }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onfonAPI.stats().then(r => { setStats(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding:40 }}><Loading /></div>;
  if (!stats)  return <div className="empty-state"><p>Failed to load stats.</p></div>;

  const { totals, agent_performance, recent_movements, model_breakdown } = stats;

  const StatBox = ({ icon, label, value, color, sub }) => (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"20px 22px", borderTop:`3px solid ${color}` }}>
      <div style={{ fontSize:28, marginBottom:6 }}>{icon}</div>
      <div style={{ fontSize:26, fontWeight:800, color, fontFamily:"monospace" }}>{value}</div>
      <div style={{ fontSize:12, fontWeight:600, color:C.textMuted, marginTop:2 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:C.textMuted, marginTop:4 }}>{sub}</div>}
    </div>
  );

  const mvTypeColor = t => ({ RECEIVED:C.info, ASSIGNED:C.warning, SOLD:C.success, RETURNED:C.textMuted, DAMAGED:C.danger }[t] || C.text);

  return (
    <div className="fade-in">
      {/* Quick Action Buttons */}
      <div style={{ display:"flex", gap:10, marginBottom:24, flexWrap:"wrap" }}>
        {[
          { icon:"📥", label:"Receive Phones",     page:"onfon-receive" },
          { icon:"🤝", label:"Assign to Agent",     page:"onfon-assign" },
          { icon:"💼", label:"Agent Sale",           page:"onfon-agent-sale" },
          { icon:"🛒", label:"Shop Sale",            page:"onfon-shop-sale" },
          { icon:"🔍", label:"IMEI Lookup",          page:"onfon-lookup" },
          { icon:"📊", label:"Agent Performance",   page:"onfon-performance" },
        ].map(({ icon, label, page }) => (
          <button key={page} onClick={() => setPage(page)} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 18px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:600, color:C.text, fontFamily:"inherit", transition:"all .15s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor=C.accent}
            onMouseLeave={e => e.currentTarget.style.borderColor=C.border}>
            <span style={{ fontSize:18 }}>{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* KPI Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:14, marginBottom:24 }}>
        <StatBox icon="📱" label="Total Received"   value={totals.total_received}  color={C.accent} />
        <StatBox icon="📦" label="In Stock"         value={totals.in_stock}        color={C.success} sub="Ready to sell / assign" />
        <StatBox icon="🤝" label="With Agents"      value={totals.assigned}        color={C.warning} />
        <StatBox icon="✅" label="Total Sold"        value={totals.total_sold}      color={C.info} sub={`${totals.sold_this_month} this month`} />
        <StatBox icon="↩️" label="Returned"          value={totals.returned}        color={C.textMuted} />
        <StatBox icon="⚠️" label="Damaged"           value={totals.damaged}         color={C.danger} />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
        {/* Model Breakdown */}
        <div className="card">
          <div className="card-hd"><span className="card-title">📱 By Model</span></div>
          {model_breakdown.length === 0 ? <div className="empty-state" style={{ padding:20 }}><p>No data.</p></div> : (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Model</th><th>Total</th><th>In Stock</th><th>Assigned</th><th>Sold</th></tr></thead>
                <tbody>
                  {model_breakdown.map((m,i) => (
                    <tr key={i}>
                      <td style={{ fontWeight:600 }}>{m.brand} {m.model}</td>
                      <td className="mono">{m.total}</td>
                      <td className="mono" style={{ color:C.success }}>{m.in_stock}</td>
                      <td className="mono" style={{ color:C.warning }}>{m.assigned}</td>
                      <td className="mono" style={{ color:C.info }}>{m.sold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Agent Performance */}
        <div className="card">
          <div className="card-hd"><span className="card-title">👥 Agent Performance</span></div>
          {agent_performance.length === 0 ? <div className="empty-state" style={{ padding:20 }}><p>No agents yet.</p></div> : (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Agent</th><th>Holding</th><th>Sold</th><th>Returned</th></tr></thead>
                <tbody>
                  {agent_performance.map(a => (
                    <tr key={a.id}>
                      <td><div style={{ fontWeight:600 }}>{a.agent_name}</div><div style={{ fontSize:11, color:C.textMuted }}>{a.region}</div></td>
                      <td className="mono" style={{ color:C.warning }}>{a.currently_holding}</td>
                      <td className="mono" style={{ color:C.success }}>{a.total_sold}</td>
                      <td className="mono" style={{ color:C.textMuted }}>{a.returned}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Recent Movements */}
      <div className="card">
        <div className="card-hd"><span className="card-title">🔄 Recent Activity</span></div>
        {recent_movements.length === 0 ? <div className="empty-state" style={{ padding:20 }}><p>No activity yet.</p></div> : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Time</th><th>IMEI</th><th>Model</th><th>Action</th><th>From → To</th><th>Agent / Customer</th><th>By</th></tr></thead>
              <tbody>
                {recent_movements.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontSize:11, color:C.textMuted, whiteSpace:"nowrap" }}>{new Date(m.date).toLocaleString()}</td>
                    <td className="mono" style={{ fontSize:11 }}>{m.imei}</td>
                    <td style={{ fontSize:12 }}>{m.model}</td>
                    <td><span style={{ fontSize:12, fontWeight:700, color:mvTypeColor(m.movement_type) }}>{m.movement_type}</span></td>
                    <td style={{ fontSize:11, color:C.textMuted }}>{m.from_location} → {m.to_location}</td>
                    <td style={{ fontSize:12 }}>{m.agent_name || m.customer_name || "—"}</td>
                    <td style={{ fontSize:11, color:C.textMuted }}>{m.performed_by}</td>
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

// ══════════════════════════════════════════════════════════════════════════════
// RECEIVE PHONES
// ══════════════════════════════════════════════════════════════════════════════
function OnfonReceive({ user, notify }) {
  const [form, setForm] = useState({ brand:"Onfon Mobile", model:"", product_name:"", imei:"", received_date:new Date().toISOString().split("T")[0], notes:"" });
  const [saving, setSaving] = useState(false);
  const [lastReceived, setLastReceived] = useState([]);
  const [scanFeedback, setScanFeedback] = useState(null);

  useIMEIScanner(imei => {
    setForm(f => ({ ...f, imei }));
    setScanFeedback({ type:"scanned", msg:`📡 Scanned: ${imei}` });
    setTimeout(() => setScanFeedback(null), 3000);
  });

  const save = async () => {
    if (!form.model)      return notify("Phone model required","error");
    if (!form.imei)       return notify("IMEI required","error");
    if (form.imei.length !== 15) return notify("IMEI must be 15 digits","error");
    setSaving(true);
    try {
      const payload = { ...form, product_name: form.product_name || `${form.brand} ${form.model}` };
      const res = await onfonAPI.receive(payload);
      setLastReceived(v => [res.data, ...v].slice(0, 10));
      setScanFeedback({ type:"success", msg:`✅ Registered: ${form.imei}` });
      setForm(f => ({ ...f, imei:"", notes:"" })); // keep model/brand for batch scanning
      notify(`${res.data.model} IMEI ${res.data.imei} received ✅`);
    } catch (e) {
      setScanFeedback({ type:"error", msg:`❌ ${e.message}` });
      notify(e.message, "error");
    }
    setSaving(false);
  };

  const MODELS = ["M10 Pro","M10","M9 Plus","M9","M8 Pro","M8","A5","A3","Other"];

  return (
    <div className="fade-in" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
      <div>
        <div className="card">
          <div className="card-hd"><span className="card-title">📥 Receive Onfon Phones</span></div>
          <div className="card-body">
            {scanFeedback && (
              <div style={{ padding:"10px 14px", borderRadius:8, marginBottom:16, fontSize:13, fontWeight:600, background:scanFeedback.type==="error"?C.danger+"22":scanFeedback.type==="success"?C.success+"22":C.info+"22", color:scanFeedback.type==="error"?C.danger:scanFeedback.type==="success"?C.success:C.info, border:`1px solid ${scanFeedback.type==="error"?C.danger:scanFeedback.type==="success"?C.success:C.info}` }}>
                {scanFeedback.msg}
              </div>
            )}
            <div style={{ background:C.info+"11", border:`1px dashed ${C.info}`, borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12, color:C.info }}>
              📡 <strong>Barcode scanner ready.</strong> Point scanner at IMEI barcode and pull the trigger. Press Enter or click Receive after scanning.
            </div>
            <div className="frow">
              <div className="fg"><label className="flabel">Brand</label><input className="inp" value={form.brand} onChange={e=>setForm(f=>({...f,brand:e.target.value}))} /></div>
              <div className="fg"><label className="flabel">Model *</label>
                <select className="sel" value={form.model} onChange={e=>setForm(f=>({...f,model:e.target.value}))}>
                  <option value="">Select model...</option>
                  {MODELS.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            {form.model==="Other" && <div className="fg"><label className="flabel">Custom Model Name</label><input className="inp" value={form.product_name} onChange={e=>setForm(f=>({...f,product_name:e.target.value,model:e.target.value}))} /></div>}
            <div className="fg" style={{ marginTop:12 }}>
              <label className="flabel" style={{ fontSize:13, fontWeight:700 }}>IMEI Number *</label>
              <IMEIInput value={form.imei} onChange={v=>setForm(f=>({...f,imei:v}))} onSubmit={save} autoFocus />
            </div>
            <div className="fg" style={{ marginTop:10 }}>
              <label className="flabel">Received Date</label>
              <input className="inp" type="date" value={form.received_date} onChange={e=>setForm(f=>({...f,received_date:e.target.value}))} />
            </div>
            <div className="fg">
              <label className="flabel">Notes</label>
              <input className="inp" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Optional notes..." />
            </div>
            <button className="btn btn-primary" style={{ width:"100%", marginTop:16, padding:"12px 0", fontSize:15 }} onClick={save} disabled={saving || form.imei.length!==15}>
              {saving ? <><Spinner /> Registering...</> : `📥 Receive Phone (IMEI: ${form.imei||"—"})`}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd"><span className="card-title">✅ Just Received ({lastReceived.length})</span></div>
        {lastReceived.length === 0 ? (
          <div className="empty-state" style={{ padding:30 }}><div className="es-icon">📱</div><p>Scan phones to start receiving.</p></div>
        ) : (
          <div>
            {lastReceived.map((d,i) => (
              <div key={d.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderBottom:`1px solid ${C.border}`, background:i===0?C.success+"11":"transparent" }}>
                <div style={{ fontSize:24 }}>📱</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{d.brand} {d.model}</div>
                  <div style={{ fontFamily:"monospace", fontSize:13, color:C.accent, letterSpacing:1 }}>{d.imei}</div>
                  <div style={{ fontSize:11, color:C.textMuted }}>Received {d.received_date}</div>
                </div>
                <Badge label="IN_STOCK" type="b-success" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ASSIGN TO AGENT
// ══════════════════════════════════════════════════════════════════════════════
function OnfonAssign({ notify }) {
  const [agents, setAgents]   = useState([]);
  const [agentId, setAgentId] = useState("");
  const [imei, setImei]       = useState("");
  const [notes, setNotes]     = useState("");
  const [saving, setSaving]   = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [assigned, setAssigned] = useState([]);
  const [agentModal, setAgentModal] = useState(false);
  const [agentForm, setAgentForm] = useState({ agent_name:"", phone:"", email:"", region:"" });
  const [savingAgent, setSavingAgent] = useState(false);

  useEffect(() => {
    onfonAPI.listAgents().then(r => setAgents(r.data||[]));
  }, []);

  useIMEIScanner(scanned => {
    setImei(scanned);
    lookupIMEI(scanned);
  });

  const lookupIMEI = async (val) => {
    const clean = val.replace(/\D/g,"");
    if (clean.length !== 15) { setPreview(null); return; }
    setPreviewLoading(true);
    try {
      const res = await onfonAPI.lookup(clean);
      setPreview(res.data);
    } catch (e) {
      setPreview({ error: e.message });
    }
    setPreviewLoading(false);
  };

  const assign = async () => {
    if (!imei || !agentId) return notify("IMEI and agent required","error");
    setSaving(true);
    try {
      const res = await onfonAPI.assign({ imei, agent_id: agentId, notes });
      const agent = agents.find(a => a.id === agentId);
      setAssigned(v => [{ ...res.data, agent_name: agent?.agent_name }, ...v].slice(0,10));
      setImei(""); setNotes(""); setPreview(null);
      notify(`IMEI ${imei} assigned to ${agent?.agent_name} ✅`);
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  const saveAgent = async () => {
    if (!agentForm.agent_name) return notify("Name required","error");
    setSavingAgent(true);
    try {
      const res = await onfonAPI.createAgent(agentForm);
      setAgents(v => [res.data, ...v]);
      setAgentModal(false);
      setAgentForm({ agent_name:"", phone:"", email:"", region:"" });
      notify("Agent added ✅");
    } catch(e) { notify(e.message,"error"); }
    setSavingAgent(false);
  };

  const selectedAgent = agents.find(a => a.id === agentId);

  return (
    <div className="fade-in" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
      <div>
        <div className="card">
          <div className="card-hd">
            <span className="card-title">🤝 Assign Phone to Agent</span>
            <button className="btn btn-ghost btn-sm" onClick={()=>setAgentModal(true)}>+ New Agent</button>
          </div>
          <div className="card-body">
            <div style={{ background:C.info+"11", border:`1px dashed ${C.info}`, borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12, color:C.info }}>
              📡 Select agent first, then scan IMEI barcode.
            </div>

            <div className="fg">
              <label className="flabel">Select Agent *</label>
              <select className="sel" value={agentId} onChange={e=>setAgentId(e.target.value)}>
                <option value="">Choose agent...</option>
                {agents.map(a=><option key={a.id} value={a.id}>{a.agent_name} — {a.region||"No region"} (Holding: {a.currently_holding||0})</option>)}
              </select>
            </div>

            {selectedAgent && (
              <div style={{ background:C.surfaceAlt, borderRadius:8, padding:"10px 14px", marginBottom:12, fontSize:12 }}>
                <div style={{ fontWeight:700 }}>👤 {selectedAgent.agent_name}</div>
                <div style={{ color:C.textMuted }}>{selectedAgent.phone} · {selectedAgent.region} · Currently holding: <strong style={{ color:C.warning }}>{selectedAgent.currently_holding||0}</strong> phones</div>
              </div>
            )}

            <div className="fg" style={{ marginTop:8 }}>
              <label className="flabel" style={{ fontWeight:700 }}>IMEI *</label>
              <IMEIInput value={imei} onChange={v=>{setImei(v);if(v.length===15)lookupIMEI(v);}} onSubmit={assign} autoFocus={!!agentId} />
            </div>

            {/* Preview */}
            {previewLoading && <div style={{ padding:10, fontSize:12, color:C.textMuted }}>Looking up IMEI...</div>}
            {preview && !preview.error && (
              <div style={{ background: preview.status==="IN_STOCK"?C.success+"18":C.danger+"18", border:`1px solid ${preview.status==="IN_STOCK"?C.success:C.danger}`, borderRadius:8, padding:"10px 14px", marginTop:8, fontSize:13 }}>
                <div style={{ fontWeight:700 }}>{preview.brand} {preview.model}</div>
                <div style={{ color:C.textMuted, fontFamily:"monospace", fontSize:12 }}>{preview.imei}</div>
                <div style={{ marginTop:4 }}>Status: <Badge label={preview.status} type={ONFON_STATUS_COLOR[preview.status]} /></div>
                {preview.status !== "IN_STOCK" && <div style={{ color:C.danger, fontWeight:600, marginTop:4 }}>⚠️ Cannot assign — device is {preview.status}</div>}
              </div>
            )}
            {preview?.error && <div style={{ color:C.danger, fontSize:13, marginTop:8, padding:"8px 12px", background:C.danger+"11", borderRadius:8 }}>❌ {preview.error}</div>}

            <div className="fg" style={{ marginTop:10 }}>
              <label className="flabel">Notes</label>
              <input className="inp" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional..." />
            </div>

            <button className="btn btn-primary" style={{ width:"100%", marginTop:14, padding:"12px 0", fontSize:15 }} onClick={assign} disabled={saving || imei.length!==15 || !agentId || preview?.status!=="IN_STOCK"}>
              {saving ? <><Spinner />Assigning...</> : "🤝 Assign to Agent"}
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="card" style={{ marginBottom:16 }}>
          <div className="card-hd"><span className="card-title">✅ Just Assigned ({assigned.length})</span></div>
          {assigned.length===0 ? <div className="empty-state" style={{ padding:20 }}><p>Assignments will appear here.</p></div> : (
            assigned.map((d,i)=>(
              <div key={d.id} style={{ display:"flex", gap:12, padding:"12px 16px", borderBottom:`1px solid ${C.border}`, background:i===0?C.warning+"11":"transparent" }}>
                <div style={{ fontSize:22 }}>🤝</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{d.brand} {d.model}</div>
                  <div style={{ fontFamily:"monospace", fontSize:12, color:C.accent }}>{d.imei}</div>
                  <div style={{ fontSize:11, color:C.textMuted }}>→ {d.agent_name}</div>
                </div>
                <Badge label="ASSIGNED" type="b-warning" />
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-hd"><span className="card-title">👥 Agents ({agents.length})</span></div>
          <div style={{ maxHeight:250, overflowY:"auto" }}>
            {agents.map(a=>(
              <div key={a.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", borderBottom:`1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontWeight:600, fontSize:13 }}>{a.agent_name}</div>
                  <div style={{ fontSize:11, color:C.textMuted }}>{a.region} · {a.phone}</div>
                </div>
                <div style={{ fontSize:12, color:C.warning, fontWeight:700 }}>Holding: {a.currently_holding||0}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {agentModal && (
        <Overlay onClose={()=>setAgentModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><span className="modal-title">👤 New Agent</span><button className="modal-close" onClick={()=>setAgentModal(false)}>✕</button></div>
            <div className="modal-body">
              <div className="fg"><label className="flabel">Full Name *</label><input className="inp" value={agentForm.agent_name} onChange={e=>setAgentForm(f=>({...f,agent_name:e.target.value}))} /></div>
              <div className="frow">
                <div className="fg"><label className="flabel">Phone</label><input className="inp" value={agentForm.phone} onChange={e=>setAgentForm(f=>({...f,phone:e.target.value}))} /></div>
                <div className="fg"><label className="flabel">Email</label><input className="inp" value={agentForm.email} onChange={e=>setAgentForm(f=>({...f,email:e.target.value}))} /></div>
              </div>
              <div className="fg"><label className="flabel">Region / Area</label><input className="inp" value={agentForm.region} onChange={e=>setAgentForm(f=>({...f,region:e.target.value}))} placeholder="e.g. Westlands, Thika..." /></div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-ghost" onClick={()=>setAgentModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveAgent} disabled={savingAgent}>{savingAgent?<><Spinner/>Saving...</>:"Add Agent"}</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT SALE
// ══════════════════════════════════════════════════════════════════════════════
function OnfonAgentSale({ notify }) {
  const [imei, setImei]           = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes]         = useState("");
  const [saving, setSaving]       = useState(false);
  const [preview, setPreview]     = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sales, setSales]         = useState([]);

  useIMEIScanner(scanned => { setImei(scanned); lookupIMEI(scanned); });

  const lookupIMEI = async (val) => {
    const clean = val.replace(/\D/g,"");
    if (clean.length !== 15) { setPreview(null); return; }
    setPreviewLoading(true);
    try { const r = await onfonAPI.lookup(clean); setPreview(r.data); }
    catch(e) { setPreview({ error: e.message }); }
    setPreviewLoading(false);
  };

  const save = async () => {
    if (!imei) return notify("IMEI required","error");
    setSaving(true);
    try {
      const res = await onfonAPI.agentSale({ imei, customer_name: customerName, notes });
      setSales(v => [res.data, ...v].slice(0,10));
      setImei(""); setCustomerName(""); setNotes(""); setPreview(null);
      notify(`Sale recorded for IMEI ${res.data.imei} ✅`);
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  return (
    <div className="fade-in" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
      <div className="card">
        <div className="card-hd"><span className="card-title">💼 Record Agent Sale</span></div>
        <div className="card-body">
          <div style={{ background:C.warning+"18", border:`1px dashed ${C.warning}`, borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12, color:C.warning }}>
            📡 Scan the IMEI of a phone that is currently ASSIGNED to an agent.
          </div>
          <div className="fg">
            <label className="flabel" style={{ fontWeight:700 }}>IMEI *</label>
            <IMEIInput value={imei} onChange={v=>{setImei(v);if(v.length===15)lookupIMEI(v);}} onSubmit={save} autoFocus />
          </div>
          {previewLoading && <div style={{ padding:10, fontSize:12, color:C.textMuted }}>Looking up...</div>}
          {preview && !preview.error && (
            <div style={{ background:preview.status==="ASSIGNED_TO_AGENT"?C.success+"18":C.danger+"18", border:`1px solid ${preview.status==="ASSIGNED_TO_AGENT"?C.success:C.danger}`, borderRadius:8, padding:"12px 14px", marginTop:8 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>📱 {preview.brand} {preview.model}</div>
              <div style={{ fontFamily:"monospace", fontSize:12, color:C.textMuted }}>{preview.imei}</div>
              {preview.agent_name && <div style={{ fontSize:13, marginTop:4 }}>Agent: <strong>{preview.agent_name}</strong> · {preview.agent_region}</div>}
              <div style={{ marginTop:6 }}>Status: <Badge label={preview.status} type={ONFON_STATUS_COLOR[preview.status]} /></div>
              {preview.status !== "ASSIGNED_TO_AGENT" && <div style={{ color:C.danger, fontWeight:600, marginTop:6, fontSize:13 }}>⚠️ Cannot record sale — device is {preview.status}</div>}
            </div>
          )}
          {preview?.error && <div style={{ color:C.danger, fontSize:13, padding:"8px 12px", background:C.danger+"11", borderRadius:8, marginTop:8 }}>❌ {preview.error}</div>}
          <div className="fg" style={{ marginTop:12 }}>
            <label className="flabel">Customer Name</label>
            <input className="inp" value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Customer name..." />
          </div>
          <div className="fg">
            <label className="flabel">Notes</label>
            <input className="inp" value={notes} onChange={e=>setNotes(e.target.value)} />
          </div>
          <button className="btn btn-success" style={{ width:"100%", marginTop:14, padding:"12px 0", fontSize:15 }} onClick={save} disabled={saving || imei.length!==15 || preview?.status!=="ASSIGNED_TO_AGENT"}>
            {saving ? <><Spinner/>Recording...</> : "✅ Record Agent Sale"}
          </button>
        </div>
      </div>
      <div className="card">
        <div className="card-hd"><span className="card-title">✅ Sales Recorded ({sales.length})</span></div>
        {sales.length===0 ? <div className="empty-state" style={{ padding:30 }}><div className="es-icon">💼</div><p>Recorded sales will appear here.</p></div> : (
          sales.map((d,i)=>(
            <div key={d.id} style={{ display:"flex", gap:12, padding:"12px 16px", borderBottom:`1px solid ${C.border}`, background:i===0?C.success+"11":"transparent" }}>
              <div style={{ fontSize:22 }}>✅</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:13 }}>{d.brand} {d.model}</div>
                <div style={{ fontFamily:"monospace", fontSize:12, color:C.accent }}>{d.imei}</div>
                <div style={{ fontSize:11, color:C.textMuted }}>Customer: {d.customer_name||"—"} · {d.sold_date}</div>
              </div>
              <Badge label="SOLD" type="b-info" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SHOP SALE
// ══════════════════════════════════════════════════════════════════════════════
function OnfonShopSale({ notify }) {
  const [imei, setImei]           = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes]         = useState("");
  const [saving, setSaving]       = useState(false);
  const [preview, setPreview]     = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sales, setSales]         = useState([]);

  useIMEIScanner(scanned => { setImei(scanned); lookupIMEI(scanned); });

  const lookupIMEI = async (val) => {
    const clean = val.replace(/\D/g,"");
    if (clean.length !== 15) { setPreview(null); return; }
    setPreviewLoading(true);
    try { const r = await onfonAPI.lookup(clean); setPreview(r.data); }
    catch(e) { setPreview({ error: e.message }); }
    setPreviewLoading(false);
  };

  const save = async () => {
    if (!imei) return notify("IMEI required","error");
    setSaving(true);
    try {
      const res = await onfonAPI.shopSale({ imei, customer_name: customerName, notes });
      setSales(v => [res.data, ...v].slice(0,10));
      setImei(""); setCustomerName(""); setNotes(""); setPreview(null);
      notify(`Shop sale recorded. IMEI ${res.data.imei} ✅`);
    } catch(e) { notify(e.message,"error"); }
    setSaving(false);
  };

  return (
    <div className="fade-in" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
      <div className="card">
        <div className="card-hd"><span className="card-title">🛒 Shop Direct Sale</span></div>
        <div className="card-body">
          <div style={{ background:C.success+"18", border:`1px dashed ${C.success}`, borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12, color:C.success }}>
            📡 Scan IMEI of a phone that is IN_STOCK for a direct shop sale.
          </div>
          <div className="fg">
            <label className="flabel" style={{ fontWeight:700 }}>IMEI *</label>
            <IMEIInput value={imei} onChange={v=>{setImei(v);if(v.length===15)lookupIMEI(v);}} onSubmit={save} autoFocus />
          </div>
          {previewLoading && <div style={{ padding:10, fontSize:12, color:C.textMuted }}>Looking up...</div>}
          {preview && !preview.error && (
            <div style={{ background:preview.status==="IN_STOCK"?C.success+"18":C.danger+"18", border:`1px solid ${preview.status==="IN_STOCK"?C.success:C.danger}`, borderRadius:8, padding:"12px 14px", marginTop:8 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>📱 {preview.brand} {preview.model}</div>
              <div style={{ fontFamily:"monospace", fontSize:12, color:C.textMuted }}>{preview.imei}</div>
              <div style={{ marginTop:6 }}>Status: <Badge label={preview.status} type={ONFON_STATUS_COLOR[preview.status]} /></div>
              {preview.status !== "IN_STOCK" && <div style={{ color:C.danger, fontWeight:600, marginTop:6, fontSize:13 }}>⚠️ Cannot sell — device is {preview.status}</div>}
            </div>
          )}
          {preview?.error && <div style={{ color:C.danger, fontSize:13, padding:"8px 12px", background:C.danger+"11", borderRadius:8, marginTop:8 }}>❌ {preview.error}</div>}
          <div className="fg" style={{ marginTop:12 }}>
            <label className="flabel">Customer Name</label>
            <input className="inp" value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Customer name (optional)..." />
          </div>
          <div className="fg">
            <label className="flabel">Notes</label>
            <input className="inp" value={notes} onChange={e=>setNotes(e.target.value)} />
          </div>
          <button className="btn btn-success" style={{ width:"100%", marginTop:14, padding:"12px 0", fontSize:15 }} onClick={save} disabled={saving || imei.length!==15 || preview?.status!=="IN_STOCK"}>
            {saving ? <><Spinner/>Processing...</> : "🛒 Complete Shop Sale"}
          </button>
        </div>
      </div>
      <div className="card">
        <div className="card-hd"><span className="card-title">✅ Shop Sales ({sales.length})</span></div>
        {sales.length===0 ? <div className="empty-state" style={{ padding:30 }}><div className="es-icon">🛒</div><p>Sales will appear here.</p></div> : (
          sales.map((d,i)=>(
            <div key={d.id} style={{ display:"flex", gap:12, padding:"12px 16px", borderBottom:`1px solid ${C.border}`, background:i===0?C.success+"11":"transparent" }}>
              <div style={{ fontSize:22 }}>🛒</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:13 }}>{d.brand} {d.model}</div>
                <div style={{ fontFamily:"monospace", fontSize:12, color:C.accent }}>{d.imei}</div>
                <div style={{ fontSize:11, color:C.textMuted }}>Customer: {d.customer_name||"Walk-in"} · {d.sold_date}</div>
              </div>
              <Badge label="SOLD" type="b-info" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// IMEI LOOKUP
// ══════════════════════════════════════════════════════════════════════════════
function OnfonLookup({ notify }) {
  const [imei, setImei]     = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useIMEIScanner(scanned => { setImei(scanned); doLookup(scanned); });

  const doLookup = async (val) => {
    const clean = (val||imei).replace(/\D/g,"");
    if (clean.length < 10) return notify("Enter at least 10 digits","error");
    setLoading(true);
    try {
      const r = await onfonAPI.lookup(clean);
      setResult(r.data);
    } catch(e) {
      setResult({ error: e.message });
      notify(e.message,"error");
    }
    setLoading(false);
  };

  const mvTypeColor = t => ({ RECEIVED:C.info, ASSIGNED:C.warning, SOLD:C.success, RETURNED:C.textMuted, DAMAGED:C.danger }[t]||C.text);
  const mvTypeIcon  = t => ({ RECEIVED:"📥", ASSIGNED:"🤝", SOLD:"✅", RETURNED:"↩️", DAMAGED:"⚠️" }[t]||"•");

  return (
    <div className="fade-in">
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-hd"><span className="card-title">🔍 IMEI Lookup</span></div>
        <div className="card-body">
          <div style={{ background:C.info+"11", border:`1px dashed ${C.info}`, borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:12, color:C.info }}>
            📡 Scan IMEI barcode or type manually to trace any Onfon device.
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ flex:1 }}>
              <IMEIInput value={imei} onChange={setImei} onSubmit={()=>doLookup()} autoFocus />
            </div>
            <button className="btn btn-primary" onClick={()=>doLookup()} disabled={loading || imei.length<10}>
              {loading ? <><Spinner/>Searching...</> : "🔍 Lookup"}
            </button>
          </div>
        </div>
      </div>

      {result && !result.error && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          {/* Device Info */}
          <div className="card">
            <div className="card-hd"><span className="card-title">📱 Device Details</span></div>
            <div className="card-body">
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:20, fontWeight:800 }}>{result.brand} {result.model}</div>
                  <div style={{ fontFamily:"monospace", fontSize:16, color:C.accent, letterSpacing:2, marginTop:4 }}>{result.imei}</div>
                </div>
                <div style={{ fontSize:32 }}>{ONFON_STATUS_ICON[result.status]}</div>
              </div>
              <Badge label={result.status} type={ONFON_STATUS_COLOR[result.status]} />

              <div style={{ marginTop:16, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[
                  ["Received", result.received_date],
                  ["Received By", result.received_by||"—"],
                  ["Warehouse", result.warehouse_name||"Onfon Stock"],
                  ["Supplier", result.supplier_id||"Onfon Mobile"],
                  result.agent_name ? ["Agent", result.agent_name] : null,
                  result.agent_region ? ["Agent Region", result.agent_region] : null,
                  result.sold_date ? ["Sold Date", result.sold_date] : null,
                  result.customer_name ? ["Customer", result.customer_name] : null,
                ].filter(Boolean).map(([k,v])=>(
                  <div key={k} style={{ background:C.surfaceAlt, borderRadius:8, padding:"8px 12px" }}>
                    <div style={{ fontSize:10, color:C.textMuted, textTransform:"uppercase", letterSpacing:1 }}>{k}</div>
                    <div style={{ fontWeight:600, fontSize:13, marginTop:2 }}>{v||"—"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Movement History */}
          <div className="card">
            <div className="card-hd"><span className="card-title">🔄 Movement History ({(result.movements||[]).length})</span></div>
            {(!result.movements || result.movements.length===0) ? (
              <div className="empty-state" style={{ padding:20 }}><p>No movements recorded.</p></div>
            ) : (
              <div style={{ position:"relative", padding:"16px 20px" }}>
                {result.movements.map((m,i)=>(
                  <div key={i} style={{ display:"flex", gap:14, marginBottom:i<result.movements.length-1?20:0 }}>
                    <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
                      <div style={{ width:34,height:34,borderRadius:"50%",background:mvTypeColor(m.movement_type)+"22",border:`2px solid ${mvTypeColor(m.movement_type)}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>
                        {mvTypeIcon(m.movement_type)}
                      </div>
                      {i<result.movements.length-1 && <div style={{ width:2,flex:1,background:C.border,marginTop:4,minHeight:20 }} />}
                    </div>
                    <div style={{ paddingBottom:i<result.movements.length-1?4:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:mvTypeColor(m.movement_type) }}>{m.movement_type}</div>
                      {(m.from_location||m.to_location) && <div style={{ fontSize:12, color:C.textMuted }}>{m.from_location} → {m.to_location}</div>}
                      {m.agent_name && <div style={{ fontSize:12 }}>Agent: {m.agent_name}</div>}
                      {m.customer_name && <div style={{ fontSize:12 }}>Customer: {m.customer_name}</div>}
                      {m.notes && <div style={{ fontSize:11, color:C.textMuted, fontStyle:"italic" }}>{m.notes}</div>}
                      <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>{new Date(m.date).toLocaleString()} · {m.performed_by}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {result?.error && (
        <div className="card">
          <div className="card-body" style={{ textAlign:"center", padding:40 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>❌</div>
            <div style={{ fontSize:16, fontWeight:700, color:C.danger }}>{result.error}</div>
            <div style={{ fontSize:13, color:C.textMuted, marginTop:8 }}>IMEI not found in Onfon stock database.</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT PERFORMANCE REPORT
// ══════════════════════════════════════════════════════════════════════════════
function OnfonAgentPerformance({ notify }) {
  const [agents, setAgents]     = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    onfonAPI.listAgents().then(r=>{ setAgents(r.data||[]); setLoading(false); }).catch(()=>setLoading(false));
  }, []);

  const loadDetail = async (agent) => {
    setSelected(agent);
    setDetailLoading(true);
    try {
      const r = await onfonAPI.agentPerf(agent.id);
      setDetail(r.data);
    } catch(e) { notify(e.message,"error"); }
    setDetailLoading(false);
  };

  return (
    <div className="fade-in" style={{ display:"grid", gridTemplateColumns:"280px 1fr", gap:16 }}>
      {/* Agents list */}
      <div className="card" style={{ height:"fit-content" }}>
        <div className="card-hd"><span className="card-title">👥 Agents</span></div>
        {loading ? <div className="card-body"><Loading /></div> : agents.length===0 ? (
          <div className="empty-state" style={{ padding:20 }}><p>No agents yet.</p></div>
        ) : (
          <div style={{ padding:"0 8px 8px" }}>
            {agents.map(a=>(
              <div key={a.id} onClick={()=>loadDetail(a)} style={{ padding:"12px 14px", borderRadius:10, cursor:"pointer", marginBottom:6, background:selected?.id===a.id?C.accent+"22":"transparent", border:`1px solid ${selected?.id===a.id?C.accent:C.border}`, transition:"all .15s" }}>
                <div style={{ fontWeight:700, fontSize:13 }}>{a.agent_name}</div>
                <div style={{ fontSize:11, color:C.textMuted }}>{a.region}</div>
                <div style={{ display:"flex", gap:10, marginTop:6, fontSize:12 }}>
                  <span style={{ color:C.warning }}>🤝 {a.currently_holding||0}</span>
                  <span style={{ color:C.success }}>✅ {a.total_sold||0}</span>
                  <span style={{ color:C.textMuted }}>Total: {a.total_assigned||0}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      <div>
        {!selected ? (
          <div className="card"><div className="empty-state" style={{ padding:60 }}><div className="es-icon">📊</div><p>Select an agent to view their performance report.</p></div></div>
        ) : detailLoading ? (
          <div className="card"><div className="card-body"><Loading /></div></div>
        ) : detail ? (
          <>
            {/* Agent Stats */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
              {[
                { label:"Total Assigned",   value:detail.devices.length,                                            color:C.accent },
                { label:"Currently Holding",value:detail.devices.filter(d=>d.status==="ASSIGNED_TO_AGENT").length, color:C.warning },
                { label:"Sold",             value:detail.devices.filter(d=>d.status==="SOLD").length,              color:C.success },
                { label:"Returned",         value:detail.devices.filter(d=>d.status==="RETURNED").length,          color:C.textMuted },
              ].map(s=>(
                <div key={s.label} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:16, borderTop:`3px solid ${s.color}` }}>
                  <div style={{ fontSize:24, fontWeight:800, color:s.color }}>{s.value}</div>
                  <div style={{ fontSize:11, color:C.textMuted, marginTop:4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Devices */}
            <div className="card">
              <div className="card-hd"><span className="card-title">📱 {detail.agent.agent_name}'s Devices</span></div>
              {detail.devices.length===0 ? <div className="empty-state" style={{ padding:20 }}><p>No devices assigned yet.</p></div> : (
                <div className="tbl-wrap">
                  <table>
                    <thead><tr><th>IMEI</th><th>Model</th><th>Status</th><th>Received</th><th>Sold Date</th><th>Customer</th></tr></thead>
                    <tbody>
                      {detail.devices.map(d=>(
                        <tr key={d.id}>
                          <td className="mono" style={{ fontSize:12 }}>{d.imei}</td>
                          <td style={{ fontWeight:600 }}>{d.brand} {d.model}</td>
                          <td><Badge label={d.status} type={ONFON_STATUS_COLOR[d.status]} /></td>
                          <td style={{ fontSize:12 }}>{d.received_date}</td>
                          <td style={{ fontSize:12 }}>{d.sold_date||"—"}</td>
                          <td style={{ fontSize:12 }}>{d.customer_name||"—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ALL DEVICES TABLE
// ══════════════════════════════════════════════════════════════════════════════
function OnfonDevices({ notify }) {
  const [devices, setDevices]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch]     = useState("");

  useEffect(() => {
    onfonAPI.listDevices().then(r=>{ setDevices(r.data||[]); setLoading(false); }).catch(()=>setLoading(false));
  }, []);

  const filtered = devices.filter(d => {
    const matchStatus = statusFilter==="All" || d.status===statusFilter;
    const matchSearch = !search || d.imei.includes(search) || d.model?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="card">
      <div className="card-hd">
        <span className="card-title">📱 All Onfon Devices ({filtered.length})</span>
        <div style={{ display:"flex", gap:8 }}>
          <input className="inp" style={{ width:200 }} placeholder="Search IMEI / model..." value={search} onChange={e=>setSearch(e.target.value)} />
          <select className="sel" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
            {["All","IN_STOCK","ASSIGNED_TO_AGENT","SOLD","RETURNED","DAMAGED"].map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {loading ? <div className="card-body"><Loading /></div> : filtered.length===0 ? <div className="empty-state"><div className="es-icon">📱</div><p>No devices found.</p></div> : (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>IMEI</th><th>Model</th><th>Status</th><th>Agent</th><th>Customer</th><th>Received</th><th>Sold</th></tr></thead>
            <tbody>
              {filtered.map(d=>(
                <tr key={d.id}>
                  <td className="mono" style={{ fontSize:12, color:C.accent }}>{d.imei}</td>
                  <td style={{ fontWeight:600 }}>{d.brand} {d.model}</td>
                  <td><Badge label={d.status} type={ONFON_STATUS_COLOR[d.status]} /></td>
                  <td style={{ fontSize:12 }}>{d.agent_name||"—"}</td>
                  <td style={{ fontSize:12 }}>{d.customer_name||"—"}</td>
                  <td style={{ fontSize:12 }}>{d.received_date}</td>
                  <td style={{ fontSize:12 }}>{d.sold_date||"—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ONFON DEVICE INVENTORY (IN_STOCK)
// ══════════════════════════════════════════════════════════════════════════════
function OnfonInventory({ notify }) {
  const [devices, setDevices]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [modelFilter, setModelFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("IN_STOCK");
  const [page, setPage]           = useState(1);
  const PAGE_SIZE = 20;

  useEffect(() => {
    onfonAPI.listDevices().then(r => { setDevices(r.data||[]); setLoading(false); }).catch(()=>setLoading(false));
  }, []);

  const models = ["All", ...Array.from(new Set(devices.map(d=>d.model).filter(Boolean)))];

  const filtered = devices.filter(d => {
    const ms = statusFilter==="All" || d.status===statusFilter;
    const mm = modelFilter==="All"  || d.model===modelFilter;
    const ms2 = !search || d.imei?.includes(search) || d.model?.toLowerCase().includes(search.toLowerCase()) || d.product_name?.toLowerCase().includes(search.toLowerCase());
    return ms && mm && ms2;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  const exportCSV = () => {
    const headers = ["IMEI","Product","Brand","Model","Status","Agent","Customer","Received Date","Sold Date"];
    const rows    = filtered.map(d => [d.imei, d.product_name, d.brand, d.model, d.status, d.agent_name||"", d.customer_name||"", d.received_date||"", d.sold_date||""]);
    const csv     = [headers, ...rows].map(r => r.map(v=>`"${v}"`).join(",")).join("\n");
    const blob    = new Blob([csv], { type:"text/csv" });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement("a"); a.href=url; a.download="onfon_inventory.csv"; a.click();
    URL.revokeObjectURL(url);
    notify("CSV exported ✅");
  };

  const exportXLSX = () => {
    const headers = ["IMEI","Product","Brand","Model","Status","Agent","Customer","Received","Sold"];
    const rows    = filtered.map(d => [d.imei, d.product_name, d.brand, d.model, d.status, d.agent_name||"", d.customer_name||"", d.received_date||"", d.sold_date||""]);
    let html = `<table><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr>`;
    rows.forEach(r => { html += `<tr>${r.map(v=>`<td>${v}</td>`).join("")}</tr>`; });
    html += `</table>`;
    const blob = new Blob([html], { type:"application/vnd.ms-excel" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href=url; a.download="onfon_inventory.xls"; a.click();
    URL.revokeObjectURL(url);
    notify("Excel exported ✅");
  };

  const statusCounts = {
    all: devices.length,
    in_stock: devices.filter(d=>d.status==="IN_STOCK").length,
    assigned: devices.filter(d=>d.status==="ASSIGNED_TO_AGENT").length,
    sold:     devices.filter(d=>d.status==="SOLD").length,
    returned: devices.filter(d=>d.status==="RETURNED").length,
  };

  const del = async (id) => {
    if (!window.confirm("Delete this device record? This cannot be undone.")) return;
    try { await onfonAPI.deleteDevice(id); setDevices(d => d.filter(x => x.id !== id)); notify("Device deleted"); }
    catch(e) { notify(e.message, "error"); }
  };

  const clearAll = async () => {
    if (!window.confirm(`Delete ALL ${devices.length} device records? This cannot be undone!`)) return;
    if (!window.confirm("Are you absolutely sure? All Onfon device history will be permanently erased.")) return;
    try { await onfonAPI.deleteAllDevices(); setDevices([]); notify("All devices cleared ✅"); }
    catch(e) { notify(e.message, "error"); }
  };

  return (
    <div className="fade-in">
      {/* Summary chips */}
      <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
        {[
          { label:"All",              value:statusCounts.all,      key:"All",              color:C.accent },
          { label:"In Stock",         value:statusCounts.in_stock, key:"IN_STOCK",         color:C.success },
          { label:"With Agents",      value:statusCounts.assigned, key:"ASSIGNED_TO_AGENT",color:C.warning },
          { label:"Sold",             value:statusCounts.sold,     key:"SOLD",             color:C.info },
          { label:"Returned",         value:statusCounts.returned, key:"RETURNED",         color:C.textMuted },
        ].map(s=>(
          <div key={s.key} onClick={()=>{setStatusFilter(s.key);setPage(1);}} style={{ cursor:"pointer", padding:"10px 18px", borderRadius:10, background:statusFilter===s.key?s.color+"22":C.surface, border:`2px solid ${statusFilter===s.key?s.color:C.border}`, transition:"all .15s" }}>
            <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-hd">
          <span className="card-title">📦 Device Inventory ({filtered.length})</span>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <input className="inp" style={{ width:200 }} placeholder="Search IMEI / model..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} />
            <select className="sel" value={modelFilter} onChange={e=>{setModelFilter(e.target.value);setPage(1);}}>
              {models.map(m=><option key={m}>{m}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={exportCSV} title="Export CSV">📄 CSV</button>
            <button className="btn btn-ghost btn-sm" onClick={exportXLSX} title="Export Excel">📊 Excel</button>
            <button className="btn btn-danger btn-sm" onClick={clearAll} title="Delete all devices">🗑️ Clear All</button>
          </div>
        </div>

        {loading ? <div className="card-body"><Loading /></div> : paginated.length===0 ? (
          <div className="empty-state"><div className="es-icon">📦</div><p>No devices match your filters.</p></div>
        ) : (
          <>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Brand</th>
                    <th>Model</th>
                    <th>IMEI</th>
                    <th>Received Date</th>
                    <th>Location / Agent</th>
                    <th>Status</th>
                    <th>Customer</th>
                    <th>Sold Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((d,i)=>(
                    <tr key={d.id}>
                      <td style={{ color:C.textMuted, fontSize:11 }}>{(page-1)*PAGE_SIZE+i+1}</td>
                      <td style={{ fontWeight:600, maxWidth:160 }}>{d.product_name}</td>
                      <td style={{ fontSize:12 }}>{d.brand}</td>
                      <td style={{ fontSize:12, fontWeight:600 }}>{d.model}</td>
                      <td className="mono" style={{ fontSize:12, color:C.accent, letterSpacing:.5 }}>{d.imei}</td>
                      <td style={{ fontSize:12 }}>{d.received_date}</td>
                      <td style={{ fontSize:12 }}>
                        {d.agent_name
                          ? <span style={{ color:C.warning, fontWeight:600 }}>🤝 {d.agent_name}<div style={{ fontSize:10, color:C.textMuted }}>{d.agent_region}</div></span>
                          : <span style={{ color:C.success }}>🏪 Shop</span>}
                      </td>
                      <td><Badge label={d.status.replace("_"," ")} type={ONFON_STATUS_COLOR[d.status]} /></td>
                      <td style={{ fontSize:12 }}>{d.customer_name||"—"}</td>
                      <td style={{ fontSize:12 }}>{d.sold_date||"—"}</td>
                      <td><button className="btn btn-danger btn-sm" onClick={()=>del(d.id)}>🗑️</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8, padding:"14px 0", borderTop:`1px solid ${C.border}` }}>
                <button className="btn btn-ghost btn-sm" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>◀</button>
                {Array.from({length:totalPages},(_, i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-page)<=2).map((p,idx,arr)=>(
                  <React.Fragment key={p}>
                    {idx>0 && arr[idx-1]!==p-1 && <span style={{ color:C.textMuted }}>…</span>}
                    <button onClick={()=>setPage(p)} style={{ minWidth:32, padding:"4px 8px", borderRadius:6, border:`1px solid ${page===p?C.accent:C.border}`, background:page===p?C.accent:"transparent", color:page===p?"#fff":C.text, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>{p}</button>
                  </React.Fragment>
                ))}
                <button className="btn btn-ghost btn-sm" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}>▶</button>
                <span style={{ fontSize:12, color:C.textMuted, marginLeft:8 }}>Page {page} of {totalPages} · {filtered.length} devices</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RELEASED PHONES PAGE
// ══════════════════════════════════════════════════════════════════════════════
function OnfonReleased({ notify }) {
  const [released, setReleased] = useState([]);
  const [agents, setAgents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [agentFilter, setAgentFilter] = useState("All");
  const [modelFilter, setModelFilter] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate]     = useState("");
  const [page, setPage]           = useState(1);
  const PAGE_SIZE = 20;

  const load = () => {
    setLoading(true);
    const params = {};
    if (agentFilter !== "All") params.agent_id = agentFilter;
    if (modelFilter !== "All") params.model = modelFilter;
    if (startDate) params.start_date = startDate;
    if (endDate)   params.end_date   = endDate;
    if (search)    params.search     = search;
    Promise.all([
      onfonReportsAPI.released(params).then(r=>setReleased(r.data||[])),
      onfonAPI.listAgents().then(r=>setAgents(r.data||[])),
    ]).finally(()=>setLoading(false));
  };

  useEffect(()=>{ load(); }, []);

  const models = ["All", ...Array.from(new Set(released.map(d=>d.model).filter(Boolean)))];

  const filtered = released.filter(d => {
    const ms = !search || d.imei?.includes(search) || d.agent_name?.toLowerCase().includes(search.toLowerCase()) || d.model?.toLowerCase().includes(search.toLowerCase());
    return ms;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  const exportCSV = () => {
    const headers = ["IMEI","Product","Brand","Model","Agent Name","Agent Phone","Release Date","Release Time","Released By","Current Status"];
    const rows    = filtered.map(d=>[d.imei,d.product_name,d.brand,d.model,d.agent_name,d.agent_phone,d.release_date,String(d.release_time||"").slice(0,8),d.released_by,d.status]);
    const csv     = [headers,...rows].map(r=>r.map(v=>`"${v||""}"`).join(",")).join("\n");
    const blob    = new Blob([csv],{type:"text/csv"});
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement("a"); a.href=url; a.download="onfon_released_phones.csv"; a.click();
    URL.revokeObjectURL(url); notify("CSV exported ✅");
  };

  const exportXLSX = () => {
    const headers = ["IMEI","Product","Brand","Model","Agent Name","Agent Phone","Release Date","Release Time","Released By","Status"];
    const rows    = filtered.map(d=>[d.imei,d.product_name,d.brand,d.model,d.agent_name,d.agent_phone||"",d.release_date,String(d.release_time||"").slice(0,8),d.released_by,d.status]);
    let html = `<table><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr>`;
    rows.forEach(r=>{html+=`<tr>${r.map(v=>`<td>${v||""}</td>`).join("")}</tr>`;});
    html+="</table>";
    const blob=new Blob([html],{type:"application/vnd.ms-excel"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download="onfon_released_phones.xls"; a.click();
    URL.revokeObjectURL(url); notify("Excel exported ✅");
  };

  return (
    <div className="fade-in">
      {/* Stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 }}>
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"14px 18px", borderTop:`3px solid ${C.warning}` }}>
          <div style={{ fontSize:24, fontWeight:800, color:C.warning }}>{released.length}</div>
          <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>Total Released</div>
        </div>
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"14px 18px", borderTop:`3px solid ${C.success}` }}>
          <div style={{ fontSize:24, fontWeight:800, color:C.success }}>{released.filter(d=>d.status==="SOLD").length}</div>
          <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>Sold by Agents</div>
        </div>
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"14px 18px", borderTop:`3px solid ${C.info}` }}>
          <div style={{ fontSize:24, fontWeight:800, color:C.info }}>{released.filter(d=>d.status==="ASSIGNED_TO_AGENT").length}</div>
          <div style={{ fontSize:11, color:C.textMuted, marginTop:2 }}>Still With Agents</div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <span className="card-title">📤 Released Phones ({filtered.length})</span>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <input className="inp" style={{ width:180 }} placeholder="Search IMEI / agent..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} />
            <select className="sel" style={{ width:160 }} value={agentFilter} onChange={e=>{setAgentFilter(e.target.value);setPage(1);}}>
              <option value="All">All Agents</option>
              {agents.map(a=><option key={a.id} value={a.id}>{a.agent_name}</option>)}
            </select>
            <select className="sel" value={modelFilter} onChange={e=>{setModelFilter(e.target.value);setPage(1);}}>
              {models.map(m=><option key={m}>{m}</option>)}
            </select>
            <input className="inp" type="date" style={{ width:140 }} value={startDate} onChange={e=>setStartDate(e.target.value)} title="From date" />
            <input className="inp" type="date" style={{ width:140 }} value={endDate} onChange={e=>setEndDate(e.target.value)} title="To date" />
            <button className="btn btn-primary btn-sm" onClick={load}>🔍 Filter</button>
            <button className="btn btn-ghost btn-sm" onClick={exportCSV}>📄 CSV</button>
            <button className="btn btn-ghost btn-sm" onClick={exportXLSX}>📊 Excel</button>
          </div>
        </div>

        {loading ? <div className="card-body"><Loading /></div> : paginated.length===0 ? (
          <div className="empty-state"><div className="es-icon">📤</div><p>No released phones found.</p></div>
        ) : (
          <>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Brand</th>
                    <th>Model</th>
                    <th>IMEI</th>
                    <th>Agent Name</th>
                    <th>Agent Phone</th>
                    <th>Release Date</th>
                    <th>Release Time</th>
                    <th>Released By</th>
                    <th>Current Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((d,i)=>(
                    <tr key={d.movement_id||d.id}>
                      <td style={{ color:C.textMuted, fontSize:11 }}>{(page-1)*PAGE_SIZE+i+1}</td>
                      <td style={{ fontWeight:600, maxWidth:140, fontSize:13 }}>{d.product_name}</td>
                      <td style={{ fontSize:12 }}>{d.brand}</td>
                      <td style={{ fontSize:12, fontWeight:600 }}>{d.model}</td>
                      <td className="mono" style={{ fontSize:12, color:C.accent, letterSpacing:.5 }}>{d.imei}</td>
                      <td style={{ fontWeight:600, fontSize:13 }}>{d.agent_name}</td>
                      <td style={{ fontSize:12, color:C.textMuted }}>{d.agent_phone||"—"}</td>
                      <td style={{ fontSize:12 }}>{d.release_date}</td>
                      <td className="mono" style={{ fontSize:12, color:C.textMuted }}>{String(d.release_time||"").slice(0,8)}</td>
                      <td style={{ fontSize:12, color:C.textMuted }}>{d.released_by}</td>
                      <td><Badge label={d.status.replace(/_/g," ")} type={ONFON_STATUS_COLOR[d.status]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages>1 && (
              <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8, padding:"14px 0", borderTop:`1px solid ${C.border}` }}>
                <button className="btn btn-ghost btn-sm" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}>◀</button>
                {Array.from({length:totalPages},(_,i)=>i+1).filter(p=>p===1||p===totalPages||Math.abs(p-page)<=2).map((p,idx,arr)=>(
                  <React.Fragment key={p}>
                    {idx>0&&arr[idx-1]!==p-1&&<span style={{color:C.textMuted}}>…</span>}
                    <button onClick={()=>setPage(p)} style={{ minWidth:32,padding:"4px 8px",borderRadius:6,border:`1px solid ${page===p?C.accent:C.border}`,background:page===p?C.accent:"transparent",color:page===p?"#fff":C.text,cursor:"pointer",fontSize:13,fontFamily:"inherit" }}>{p}</button>
                  </React.Fragment>
                ))}
                <button className="btn btn-ghost btn-sm" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}>▶</button>
                <span style={{ fontSize:12, color:C.textMuted, marginLeft:8 }}>Page {page} of {totalPages}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ONFON REPORTS
// ══════════════════════════════════════════════════════════════════════════════
function OnfonReports({ notify }) {
  const [tab, setTab]       = useState("weekly");
  const [loading, setLoading] = useState(true);
  const [data, setData]     = useState(null);
  const [weeksBack, setWeeksBack]   = useState(0);
  const [month, setMonth]           = useState(new Date().toISOString().slice(0,7));
  const [year, setYear]             = useState(new Date().getFullYear().toString());

  const load = async () => {
    setLoading(true);
    setData(null);
    try {
      let r;
      if (tab==="weekly")  r = await onfonReportsAPI.weekly({ weeks_back: weeksBack });
      if (tab==="monthly") r = await onfonReportsAPI.monthly({ month });
      if (tab==="annual")  r = await onfonReportsAPI.annual({ year });
      setData(r.data);
    } catch(e) { notify(e.message,"error"); }
    setLoading(false);
  };

  useEffect(()=>{ load(); }, [tab, weeksBack, month, year]);

  const COLORS = [C.success, C.info, C.warning, C.danger, C.accent, "#a78bfa","#34d399","#fb923c"];

  const MiniBar = ({ value, max, color }) => (
    <div style={{ height:6, background:C.border, borderRadius:3, overflow:"hidden", marginTop:4 }}>
      <div style={{ height:"100%", width:`${max>0?(value/max*100):0}%`, background:color, borderRadius:3, transition:"width .4s" }} />
    </div>
  );

  const SummaryCard = ({ icon, label, value, color, sub }) => (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"18px 20px", borderTop:`3px solid ${color}` }}>
      <div style={{ fontSize:26 }}>{icon}</div>
      <div style={{ fontSize:28, fontWeight:800, color, marginTop:6, fontFamily:"monospace" }}>{value}</div>
      <div style={{ fontSize:12, color:C.textMuted, marginTop:2 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:C.textMuted, marginTop:3 }}>{sub}</div>}
    </div>
  );

  const s = data?.summary;

  return (
    <div className="fade-in">
      {/* Tab selector */}
      <div style={{ display:"flex", gap:0, marginBottom:20, background:C.surfaceAlt, borderRadius:10, padding:4, width:"fit-content" }}>
        {[["weekly","📅","Weekly"],["monthly","📆","Monthly"],["annual","📊","Annual"]].map(([k,icon,label])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ padding:"9px 22px", borderRadius:7, border:"none", cursor:"pointer", background:tab===k?C.surface:"transparent", color:tab===k?C.text:C.textMuted, fontWeight:700, fontSize:13, fontFamily:"inherit", display:"flex", gap:6, alignItems:"center", boxShadow:tab===k?"0 1px 4px rgba(0,0,0,.18)":"none", transition:"all .15s" }}>
            <span>{icon}</span><span>{label}</span>
          </button>
        ))}
      </div>

      {/* Period controls */}
      <div style={{ display:"flex", gap:10, marginBottom:20, alignItems:"center" }}>
        {tab==="weekly" && (
          <>
            <select className="sel" style={{ width:200 }} value={weeksBack} onChange={e=>setWeeksBack(+e.target.value)}>
              {[0,1,2,3,4].map(w=><option key={w} value={w}>{w===0?"This Week":`${w} Week${w>1?"s":""} Ago`}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={load}>Refresh</button>
          </>
        )}
        {tab==="monthly" && (
          <>
            <input className="inp" type="month" style={{ width:180 }} value={month} onChange={e=>setMonth(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={load}>Load</button>
          </>
        )}
        {tab==="annual" && (
          <>
            <select className="sel" style={{ width:160 }} value={year} onChange={e=>setYear(e.target.value)}>
              {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={load}>Load</button>
          </>
        )}
      </div>

      {loading ? <div style={{ padding:60, textAlign:"center" }}><Loading /></div> : !data ? null : (
        <>
          {/* Summary Cards */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:24 }}>
            {tab==="weekly" && <>
              <SummaryCard icon="📥" label="Received"     value={s.received}          color={C.accent} />
              <SummaryCard icon="📦" label="In Stock"     value={s.in_stock}          color={C.success} />
              <SummaryCard icon="🤝" label="With Agents"  value={s.with_agents}       color={C.warning} />
              <SummaryCard icon="✅" label="Sold"          value={s.sold_this_week}    color={C.info} sub="this week" />
              <SummaryCard icon="↩️" label="Returned"     value={s.returned}          color={C.textMuted} />
            </>}
            {tab==="monthly" && <>
              <SummaryCard icon="📥" label="Received"     value={s.received_this_month} color={C.accent} />
              <SummaryCard icon="✅" label="Sold"          value={s.sold_this_month}     color={C.success} sub="this month" />
              <SummaryCard icon="📦" label="Current Stock" value={s.current_stock}       color={C.info} />
              <SummaryCard icon="🤝" label="With Agents"  value={s.with_agents}         color={C.warning} />
              <SummaryCard icon="↩️" label="Returned"     value={s.returned}            color={C.textMuted} />
            </>}
            {tab==="annual" && <>
              <SummaryCard icon="📥" label="Received"     value={s.received_this_year}  color={C.accent} />
              <SummaryCard icon="✅" label="Sold"          value={s.sold_this_year}      color={C.success} sub={year} />
              <SummaryCard icon="📦" label="Current Stock" value={s.current_stock}       color={C.info} />
              <SummaryCard icon="🤝" label="With Agents"  value={s.with_agents}         color={C.warning} />
              <SummaryCard icon="📊" label="Total Ever"   value={s.total_all_time}      color={C.textMuted} />
            </>}
          </div>

          {/* Charts row */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>

            {/* Timeline chart */}
            <div className="card">
              <div className="card-hd"><span className="card-title">
                {tab==="weekly"?"📅 Daily Breakdown":tab==="monthly"?"📆 Weekly Breakdown":"📊 Monthly Breakdown"}
              </span></div>
              <div style={{ padding:"12px 16px" }}>
                {(tab==="weekly"?data.daily:tab==="monthly"?data.weekly:data.monthly)?.map((item,i)=>{
                  const label = tab==="weekly" ? new Date(item.day).toLocaleDateString("en-KE",{weekday:"short"})
                              : tab==="monthly" ? `Wk ${item.week_num}`
                              : item.month_label;
                  const recv = parseInt(item.received||0);
                  const sold = parseInt(item.sold||0);
                  const maxVal = Math.max(recv, sold, 1);
                  return (
                    <div key={i} style={{ marginBottom:12 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:C.textMuted, marginBottom:3 }}>
                        <span style={{ fontWeight:600 }}>{label}</span>
                        <span>📥 {recv} · ✅ {sold}</span>
                      </div>
                      <div style={{ display:"flex", gap:4 }}>
                        <div style={{ flex:1, height:8, background:C.border, borderRadius:4, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${recv/maxVal*100}%`, background:C.accent, borderRadius:4 }} />
                        </div>
                        <div style={{ flex:1, height:8, background:C.border, borderRadius:4, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${sold/maxVal*100}%`, background:C.success, borderRadius:4 }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ display:"flex", gap:16, marginTop:8, fontSize:11 }}>
                  <span><span style={{ display:"inline-block",width:10,height:10,background:C.accent,borderRadius:2,marginRight:4 }}/>Received</span>
                  <span><span style={{ display:"inline-block",width:10,height:10,background:C.success,borderRadius:2,marginRight:4 }}/>Sold</span>
                </div>
              </div>
            </div>

            {/* Agent performance chart */}
            <div className="card">
              <div className="card-hd"><span className="card-title">👥 Agent Performance</span></div>
              <div style={{ padding:"12px 16px" }}>
                {data.agents?.length===0 ? <div style={{ textAlign:"center", color:C.textMuted, padding:20 }}>No agents yet.</div> : (
                  data.agents?.map((a,i)=>{
                    const maxSold = Math.max(...(data.agents?.map(x=>parseInt(x.sold_this_month||x.sold_this_year||x.sold_this_week||x.total_sold||0))||[1]),1);
                    const sold = parseInt(a.sold_this_month||a.sold_this_year||a.total_sold||0);
                    const holding = parseInt(a.currently_holding||0);
                    return (
                      <div key={a.agent_name||i} style={{ marginBottom:14 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                          <div>
                            <div style={{ fontWeight:600, fontSize:13 }}>{a.agent_name}</div>
                            <div style={{ fontSize:10, color:C.textMuted }}>{a.region}</div>
                          </div>
                          <div style={{ fontSize:12, display:"flex", gap:8 }}>
                            <span style={{ color:C.success }}>✅ {sold}</span>
                            <span style={{ color:C.warning }}>🤝 {holding}</span>
                          </div>
                        </div>
                        <div style={{ height:8, background:C.border, borderRadius:4, overflow:"hidden" }}>
                          <div style={{ height:"100%", width:`${sold/maxSold*100}%`, background:COLORS[i%COLORS.length], borderRadius:4, transition:"width .5s" }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Model breakdown */}
          <div className="card" style={{ marginBottom:16 }}>
            <div className="card-hd"><span className="card-title">📱 Stock Distribution by Model</span></div>
            {data.models?.length===0 ? <div className="empty-state" style={{ padding:20 }}><p>No data.</p></div> : (
              <div style={{ padding:"12px 20px", display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12 }}>
                {data.models?.map((m,i)=>{
                  const total = parseInt(m.total||0);
                  const inStock = parseInt(m.in_stock||0);
                  const sold = parseInt(m.sold||0);
                  const assigned = parseInt(m.assigned||0);
                  return (
                    <div key={i} style={{ background:C.surfaceAlt, borderRadius:10, padding:"12px 14px", border:`1px solid ${C.border}` }}>
                      <div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>📱 {m.brand} {m.model}</div>
                      <div style={{ fontSize:12, display:"flex", justifyContent:"space-between" }}><span style={{ color:C.textMuted }}>Total</span><span style={{ fontWeight:700 }}>{total}</span></div>
                      <MiniBar value={inStock} max={total} color={C.success} />
                      <div style={{ fontSize:11, color:C.textMuted, marginTop:4, display:"flex", gap:10 }}>
                        <span>📦 {inStock}</span><span>🤝 {assigned}</span><span>✅ {sold}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Agent detail table */}
          <div className="card">
            <div className="card-hd"><span className="card-title">📋 Agent Summary Table</span></div>
            {!data.agents?.length ? <div className="empty-state" style={{ padding:20 }}><p>No agents.</p></div> : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Region</th>
                      <th>Total Assigned</th>
                      <th>Currently Holding</th>
                      <th>{tab==="weekly"?"Sold (Week)":tab==="monthly"?"Sold (Month)":"Sold (Year)"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.agents.map((a,i)=>(
                      <tr key={i}>
                        <td style={{ fontWeight:600 }}>{a.agent_name}</td>
                        <td style={{ fontSize:12 }}>{a.region||"—"}</td>
                        <td className="mono">{a.total_assigned||a.total_ever||0}</td>
                        <td className="mono" style={{ color:C.warning }}>{a.currently_holding||0}</td>
                        <td className="mono" style={{ color:C.success }}>{a.sold_this_week||a.sold_this_month||a.sold_this_year||a.total_sold||0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// ONFON ROOT WRAPPER — handles sub-pages internally
// ══════════════════════════════════════════════════════════════════════════════
function OnfonModule({ data, user, notify, page, setPage }) {
  const ONFON_PAGES = [
    "onfon","onfon-receive","onfon-assign","onfon-agent-sale",
    "onfon-shop-sale","onfon-lookup","onfon-performance","onfon-devices",
    "onfon-inventory","onfon-released","onfon-reports"
  ];
  const isOnfonPage = ONFON_PAGES.includes(page);

  const tabs = [
    { id:"onfon",             icon:"📊", label:"Dashboard" },
    { id:"onfon-receive",     icon:"📥", label:"Receive" },
    { id:"onfon-assign",      icon:"🤝", label:"Assign" },
    { id:"onfon-released",    icon:"📤", label:"Released" },
    { id:"onfon-agent-sale",  icon:"💼", label:"Agent Sale" },
    { id:"onfon-shop-sale",   icon:"🛒", label:"Shop Sale" },
    { id:"onfon-inventory",   icon:"📦", label:"Inventory" },
    { id:"onfon-devices",     icon:"📋", label:"All Devices" },
    { id:"onfon-lookup",      icon:"🔍", label:"IMEI Lookup" },
    { id:"onfon-performance", icon:"📈", label:"Performance" },
    { id:"onfon-reports",     icon:"📊", label:"Reports" },
  ];

  return (
    <div className="fade-in">
      {/* Onfon header */}
      <div style={{ background:`linear-gradient(135deg,${C.accent},${C.info})`, borderRadius:14, padding:"18px 24px", marginBottom:20, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800, color:"#fff" }}>📱 Onfon Stock Management</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,.75)", marginTop:2 }}>Full IMEI traceability · Receive → Assign → Sell · Reports</div>
        </div>
        <div style={{ fontSize:40, opacity:.4 }}>📦</div>
      </div>

      {/* Sub-navigation */}
      <div style={{ overflowX:"auto", marginBottom:20 }}>
        <div style={{ display:"flex", gap:4, background:C.surfaceAlt, padding:4, borderRadius:10, minWidth:"max-content" }}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setPage(t.id)} style={{ padding:"8px 14px", borderRadius:7, border:"none", cursor:"pointer", background:page===t.id?C.surface:"transparent", color:page===t.id?C.text:C.textMuted, fontWeight:600, fontSize:12.5, fontFamily:"inherit", display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap", boxShadow:page===t.id?"0 1px 4px rgba(0,0,0,.15)":"none", transition:"all .15s" }}>
              <span>{t.icon}</span><span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Page content */}
      {page==="onfon"             && <OnfonDashboard notify={notify} setPage={setPage} />}
      {page==="onfon-receive"     && <OnfonReceive user={user} notify={notify} />}
      {page==="onfon-assign"      && <OnfonAssign notify={notify} />}
      {page==="onfon-released"    && <OnfonReleased notify={notify} />}
      {page==="onfon-agent-sale"  && <OnfonAgentSale notify={notify} />}
      {page==="onfon-shop-sale"   && <OnfonShopSale notify={notify} />}
      {page==="onfon-inventory"   && <OnfonInventory notify={notify} />}
      {page==="onfon-devices"     && <OnfonDevices notify={notify} />}
      {page==="onfon-lookup"      && <OnfonLookup notify={notify} />}
      {page==="onfon-performance" && <OnfonAgentPerformance notify={notify} />}
      {page==="onfon-reports"     && <OnfonReports notify={notify} />}
    </div>
  );
}


const NAV = [
  { group: "OVERVIEW", items: [{ id: "dashboard", icon: "🏠", label: "Dashboard" }] },
  { group: "OPERATIONS", items: [
    { id: "inventory",    icon: "📦", label: "Inventory" },
    { id: "sales",        icon: "🛒", label: "Sales & POS" },
    { id: "orders",       icon: "📋", label: "Purchase Orders" },
    { id: "quotes",       icon: "📄", label: "Quotations" },
    { id: "invoices",     icon: "🧾", label: "Invoices" },
    { id: "payments",     icon: "💰", label: "Payments" },
    { id: "expenses",     icon: "💸", label: "Expenses" },
    { id: "returns",      icon: "↩️",  label: "Returns & Refunds" },
    { id: "sup-returns",  icon: "↩️",  label: "Supplier Returns" },
    { id: "transfer",     icon: "🔄", label: "Stock Transfer" },
    { id: "register",     icon: "🏧", label: "Cash Register" },
    { id: "reconcile",    icon: "⚖️",  label: "Cash Reconciliation" },
    { id: "reorder",      icon: "🚨", label: "Reorder Alerts" },
    { id: "logistics",    icon: "🚚", label: "Logistics" },
  ]},
  { group: "RELATIONSHIPS", items: [
    { id: "customers",    icon: "👥", label: "Customers" },
    { id: "suppliers",    icon: "🤝", label: "Suppliers" },
    { id: "sup-payments", icon: "💳", label: "Supplier Payments" },
    { id: "loyalty",      icon: "🌟", label: "Loyalty Program" },
    { id: "debts",        icon: "💳", label: "Debt Tracker" },
    { id: "mpesa",        icon: "💚", label: "M-Pesa" },
  ]},
  { group: "INVENTORY & ASSETS", items: [
    { id: "warehouses", icon: "🏭", label: "Warehouses" },
    { id: "prodcats",   icon: "📂", label: "Product Categories" },
    { id: "assets",     icon: "🖥️", label: "Assets" },
  ]},
  { group: "HR & PAYROLL", items: [
    { id: "employees",   icon: "👤", label: "Employees" },
    { id: "departments", icon: "🏛️", label: "Departments" },
    { id: "attendance",  icon: "📅", label: "Attendance" },
    { id: "timetrack",   icon: "⏱️",  label: "Staff Time" },
    { id: "commission",  icon: "💵", label: "Commission" },
    { id: "payroll",     icon: "💰", label: "Payroll" },
  ]},
  { group: "ONFON MOBILE", items: [
    { id: "onfon",             icon: "📱", label: "Onfon Dashboard" },
    { id: "onfon-receive",     icon: "📥", label: "Receive Phones" },
    { id: "onfon-assign",      icon: "🤝", label: "Assign to Agent" },
    { id: "onfon-released",    icon: "📤", label: "Released Phones" },
    { id: "onfon-agent-sale",  icon: "💼", label: "Agent Sale" },
    { id: "onfon-shop-sale",   icon: "🛒", label: "Shop Sale" },
    { id: "onfon-inventory",   icon: "📦", label: "Device Inventory" },
    { id: "onfon-devices",     icon: "📋", label: "All Devices" },
    { id: "onfon-lookup",      icon: "🔍", label: "IMEI Lookup" },
    { id: "onfon-performance", icon: "📈", label: "Performance" },
    { id: "onfon-reports",     icon: "📊", label: "Reports" },
  ]},
  { group: "TOOLS", items: [
    { id: "currency",    icon: "💱", label: "Currency" },
    { id: "documents",   icon: "📁", label: "Documents" },
    { id: "expcats",     icon: "🗂️", label: "Expense Categories" },
    { id: "companies",   icon: "🏢", label: "Companies" },
    { id: "roles",       icon: "🔐", label: "Roles & Permissions" },
  ]},
  { group: "ANALYTICS", items: [
    { id: "reports",  icon: "📊", label: "Reports & Print" },
    { id: "admin",    icon: "⚙️",  label: "Admin Panel" },
  ]},
];

const PAGE_TITLES = {
  dashboard:"Dashboard Overview", inventory:"Inventory Management",
  sales:"Sales & Point of Sale", orders:"Purchase Orders",
  invoices:"Invoice Management", payments:"Payments Ledger",
  expenses:"Expense Tracking", customers:"Customer Management",
  suppliers:"Supplier Management", reports:"Reports & Analytics",
  admin:"Admin Panel", transfer:"Stock Transfer", debts:"Debt & Credit Tracker",
  register:"Cash Register", returns:"Returns & Refunds", timetrack:"Staff Time Tracking",
  logistics:"Logistics & Delivery", currency:"Multi-Currency",
  documents:"Document Manager", mpesa:"M-Pesa Integration",
  warehouses:"Warehouse Management", prodcats:"Product Categories",
  assets:"Asset Management", employees:"Employee Management",
  departments:"Departments", attendance:"Attendance",
  expcats:"Expense Categories", companies:"Companies", roles:"Roles & Permissions",
  onfon:"Onfon Dashboard", "onfon-receive":"Receive Phones", "onfon-assign":"Assign to Agent",
  "onfon-released":"Released Phones", "onfon-agent-sale":"Agent Sale", "onfon-shop-sale":"Shop Sale",
  "onfon-inventory":"Device Inventory", "onfon-devices":"All Onfon Devices",
  "onfon-lookup":"IMEI Lookup", "onfon-performance":"Agent Performance", "onfon-reports":"Onfon Reports",
};

// ── Fallback permissions (used only if DB hasn't been configured yet) ─────────
const DEFAULT_PERMISSIONS = {
  Admin: null, // null = full access
  Manager: new Set([
    "dashboard","sales","inventory","orders","quotes","invoices","payments",
    "expenses","returns","sup-returns","transfer","register","reconcile",
    "reorder","logistics","customers","suppliers","sup-payments","loyalty",
    "debts","mpesa","warehouses","prodcats","assets","employees","departments",
    "attendance","timetrack","commission","reports","documents","currency",
    "onfon","onfon-receive","onfon-assign","onfon-released",
    "onfon-agent-sale","onfon-shop-sale","onfon-inventory","onfon-devices",
    "onfon-lookup","onfon-performance","onfon-reports",
  ]),
  Cashier: new Set([
    "dashboard","sales","register","customers","returns","debts","mpesa","loyalty",
  ]),
};

// Map DB module keys (underscores) → NAV item IDs (hyphens)
const MODULE_ID_MAP = {
  purchase_orders:"orders", sup_returns:"sup-returns", sup_payments:"sup-payments",
  onfon_receive:"onfon-receive", onfon_assign:"onfon-assign", onfon_released:"onfon-released",
  onfon_agent_sale:"onfon-agent-sale", onfon_shop_sale:"onfon-shop-sale",
  onfon_inventory:"onfon-inventory", onfon_devices:"onfon-devices",
  onfon_lookup:"onfon-lookup", onfon_performance:"onfon-performance",
  onfon_reports:"onfon-reports", prodcats:"prodcats", expcats:"expcats",
};

export default function App() {
  const [user, setUser]       = useState(null);
  const [page, setPage]       = useState("dashboard");
  const [branch, setBranch]   = useState("all");
  const [data, setData]       = useState(EMPTY);
  const [appLoading, setAppLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // DB-driven permissions for the logged-in user's role
  const [userPerms, setUserPerms] = useState(null); // null = not loaded yet
  const time = useLocalTime();
  const { n, notify, clear } = useNotify();

  // canAccess: checks DB perms first, falls back to defaults
  const canAccess = useCallback((pageId) => {
    if (user?.role === "Admin") return true;
    // If DB perms loaded, use them
    if (userPerms !== null) {
      // dashboard always accessible
      if (pageId === "dashboard") return true;
      // Map pageId to DB module key if needed
      const dbKey = Object.entries(MODULE_ID_MAP).find(([,v]) => v === pageId)?.[0] || pageId;
      return userPerms.has(pageId) || userPerms.has(dbKey);
    }
    // Fall back to hardcoded defaults while DB loads
    const fallback = DEFAULT_PERMISSIONS[user?.role];
    if (!fallback) return true;
    return fallback.has(pageId);
  }, [user, userPerms]);

  // ── Ensure correct viewport meta, title and favicon ─────────────────────────
  useEffect(() => {
    // Tab title
    document.title = "VES Connections Limited";

    // Favicon
    let link = document.querySelector("link[rel~='icon']");
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.type = "image/svg+xml";
    link.href = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='18' fill='%230d1526'/><text x='50' y='72' font-size='72' font-weight='900' font-family='Arial,sans-serif' text-anchor='middle' fill='%23f0a500'>V</text></svg>";

    // Viewport
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';
  }, []);

  // ── Load all data from DB after login ──────────────────────────────────────
  const loadAllData = useCallback(async () => {
    setAppLoading(true);
    try {
      const [prodRes, salesRes, ordersRes, suppRes, custRes, expRes] = await Promise.all([
        productsAPI.list(),
        salesAPI.list({}),
        purchaseOrdersAPI.list(),
        suppliersAPI.list(),
        customersAPI.list(),
        expensesAPI.list({}),
      ]);
      const sales = (salesRes.data||[]).map(mapSale);
      const maxReceipt = sales.reduce((max, s) => {
        const n = parseInt((s.receiptNo||"").replace(/\D/g,"")) || 0;
        return Math.max(max, n);
      }, 0);
      setData({
        products:       (prodRes.data||[]).map(mapProduct),
        sales,
        purchaseOrders: (ordersRes.data||[]).map(mapOrder),
        suppliers:      (suppRes.data||[]).map(mapSupplier),
        customers:      (custRes.data||[]).map(mapCustomer),
        expenses:       (expRes.data||[]).map(mapExpense),
        receiptCounter: maxReceipt + 1,
      });
    } catch(e) {
      notify("Failed to load data from server: " + e.message, "error");
    }
    setAppLoading(false);
  }, []);

  const handleLogin = async (u) => {
    setUser(u);
    notify(`Welcome back, ${u.name}!`, "success");
    // Load this user's role permissions from DB
    if (u.role !== "Admin") {
      try {
        const res = await rolesAPI.myPermissions();
        const permsSet = new Set(
          (res.data || [])
            .filter(p => p.can_view)
            .map(p => MODULE_ID_MAP[p.module] || p.module)
        );
        permsSet.add("dashboard"); // always allow dashboard
        setUserPerms(permsSet);
      } catch(e) {
        // DB perms failed — fall back to defaults silently
        setUserPerms(null);
      }
    } else {
      setUserPerms(null); // Admin = no restrictions
    }
    await loadAllData();
  };

  const lowStockCount = data.products.filter(p => p.mainBranch < p.minStock || p.westBranch < p.minStock).length;

  // Barcode scanner — active across the whole app
  const handleBarcodeScan = useCallback(p => {
    notify(`📦 Scanned: ${p.name}`, "info");
  }, [notify]);

  if (!user) return (
    <>
      <style>{GLOBAL_CSS}</style>
      <LoginPage onLogin={handleLogin} />
    </>
  );

  if (appLoading) return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background:"#0a1628", gap:20 }}>
        <div style={{ fontSize:48 }}>🏪</div>
        <div style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:700, fontSize:22, color:"#f0a500" }}>VES CONNECTIONS LIMITED</div>
        <div style={{ display:"flex", alignItems:"center", gap:10, color:"#5a7a9a", fontSize:14 }}>
          <span style={{ display:"inline-block", width:18, height:18, border:"2px solid rgba(240,165,0,0.2)", borderTopColor:"#f0a500", borderRadius:"50%", animation:"spin .7s linear infinite" }} />
          Loading your data...
        </div>
      </div>
    </>
  );

  const renderPage = () => {
    const props = { data, setData, branch, user, notify, setPage };

    // Block access if role doesn't have permission
    if (!canAccess(page)) {
      return (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:400, gap:16, padding:40, textAlign:"center" }}>
          <div style={{ fontSize:64 }}>🔒</div>
          <div style={{ fontFamily:"'Clash Display',sans-serif", fontWeight:800, fontSize:22, color:"#fff" }}>Access Restricted</div>
          <div style={{ fontSize:14, color:"#5a7a9a", maxWidth:360 }}>
            Your <strong style={{ color:"#f0a500" }}>{user.role}</strong> account does not have permission to view this module.
            Contact your Admin to request access.
          </div>
          <button className="btn btn-primary" onClick={() => setPage("dashboard")}>← Back to Dashboard</button>
        </div>
      );
    }

    switch (page) {
      case "dashboard":  return <Dashboard {...props} />;
      case "inventory":  return <Inventory {...props} />;
      case "sales":      return <Sales {...props} shareWhatsApp={shareWhatsApp} />;
      case "orders":     return <PurchaseOrders {...props} />;
      case "expenses":   return <Expenses {...props} />;
      case "customers":  return <Customers {...props} />;
      case "suppliers":  return <Suppliers {...props} />;
      case "reports":    return <Reports {...props} />;
      case "admin":      return <AdminPanel {...props} currentUser={user} />;
      case "transfer":   return <StockTransfer {...props} />;
      case "debts":      return <DebtTracker {...props} />;
      case "register":   return <CashRegister {...props} />;
      case "returns":    return <SalesReturns {...props} />;
      case "timetrack":  return <StaffTracker {...props} />;
      case "logistics":  return <Logistics {...props} />;
      case "currency":   return <CurrencyConverter {...props} />;
      case "documents":  return <DocumentManager {...props} />;
      case "mpesa":       return <MpesaIntegration {...props} />;
      case "invoices":    return <InvoiceManager {...props} />;
      case "payments":    return <PaymentsLedger {...props} />;
      case "warehouses":  return <WarehouseManager {...props} />;
      case "prodcats":    return <ProductCategories {...props} />;
      case "assets":      return <AssetManager {...props} />;
      case "employees":   return <EmployeeManager {...props} />;
      case "departments": return <DepartmentManager {...props} />;
      case "attendance":  return <AttendanceManager {...props} />;
      case "expcats":     return <ExpenseCategoryManager {...props} />;
      case "companies":   return <CompanyManager {...props} />;
      case "reconcile":   return <CashReconciliation {...props} user={user} />;
      case "quotes":      return <Quotations {...props} user={user} />;
      case "sup-returns": return <SupplierReturns {...props} user={user} />;
      case "reorder":     return <ReorderAlerts {...props} user={user} />;
      case "loyalty":     return <LoyaltyProgram {...props} user={user} />;
      case "commission":  return <CommissionManager {...props} user={user} />;
      case "payroll":     return <PayrollManager {...props} user={user} />;
      case "sup-payments":return <SupplierPaymentsPage {...props} user={user} />;
      case "roles":       return <RolesPermissions {...props} onPermsChanged={async () => {
        if (user.role !== "Admin") {
          try {
            const res = await rolesAPI.myPermissions();
            const ps = new Set((res.data||[]).filter(p=>p.can_view).map(p=>MODULE_ID_MAP[p.module]||p.module));
            ps.add("dashboard");
            setUserPerms(ps);
          } catch(_) {}
        }
      }} />;
      case "onfon":
      case "onfon-receive":
      case "onfon-assign":
      case "onfon-agent-sale":
      case "onfon-shop-sale":
      case "onfon-lookup":
      case "onfon-performance":
      case "onfon-devices":
      case "onfon-inventory":
      case "onfon-released":
      case "onfon-reports":    return <OnfonModule {...props} page={page} setPage={setPage} />;
      default: return null;
    }
  };

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <BarcodeInput products={data.products} onScan={handleBarcodeScan} />
      <Notification msg={n.msg} type={n.type} onClose={clear} />

      {/* ── Floating hamburger — position:fixed, always on top, works regardless of layout ── */}
      <button
        className="fab-menu"
        onClick={() => setSidebarOpen(s => !s)}
        title={sidebarOpen ? "Close menu" : "Open menu"}
      >
        {sidebarOpen ? "✕" : "☰"}
      </button>

      <div className="app-layout">
        {/* Mobile sidebar backdrop */}
        <div className={`sidebar-backdrop ${sidebarOpen ? "show" : ""}`} onClick={() => setSidebarOpen(false)} />

        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="logo-zone" style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
            <div style={{ flex:1 }}>
              <div className="logo-mark">V</div>
              <div className="logo-title">VES CONNECTIONS LIMITED</div>
              <div className="logo-sub">Powered by VES</div>
            </div>
            <button className="sidebar-close" onClick={() => setSidebarOpen(false)} title="Close menu">✕</button>
          </div>

          {NAV.map(grp => {
            const visibleItems = grp.items.filter(item => canAccess(item.id));
            if (!visibleItems.length) return null;
            return (
              <div key={grp.group} className="nav-group">
                <div className="nav-group-label">{grp.group}</div>
                {visibleItems.map(item => (
                  <div key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => { setPage(item.id); setSidebarOpen(false); }}>
                    <span className="nav-icon">{item.icon}</span>
                    {item.label}
                    {item.id === "inventory" && lowStockCount > 0 && <span className="nav-badge">{lowStockCount}</span>}
                  </div>
                ))}
              </div>
            );
          })}

          <div className="branch-zone">
            <div className="branch-zone-label">Branch View</div>
            <button className={`branch-btn ${branch === "all"  ? "active" : ""}`} onClick={() => setBranch("all")}>🏢 All Branches</button>
            <button className={`branch-btn ${branch === "main" ? "active" : ""}`} onClick={() => setBranch("main")}>📍 Main Branch</button>
            <button className={`branch-btn ${branch === "west" ? "active" : ""}`} onClick={() => setBranch("west")}>📍 Juja Branch</button>
          </div>

          <div className="user-zone">
            <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:10 }}>
              <div className="user-avatar">{user.avatar}</div>
              <div><div className="user-name">{user.name}</div><div className="user-role">{user.role}</div></div>
            </div>
            <button className="btn btn-outline btn-sm" style={{ width:"100%", justifyContent:"center", marginBottom:6 }} onClick={loadAllData}>🔄 Refresh Data</button>
            <button className="btn btn-danger btn-sm" style={{ width:"100%", justifyContent:"center" }} onClick={() => { clearToken(); setUser(null); setData(EMPTY); }}>🚪 Sign Out</button>
          </div>
        </aside>

        <div className="main-area">
          <div className="topbar">
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <button className="hamburger" onClick={() => setSidebarOpen(s => !s)} title={sidebarOpen ? "Close menu" : "Open menu"}>
                {sidebarOpen ? "✕" : "☰"}
              </button>
              <div>
                <div className="page-heading">{PAGE_TITLES[page]}</div>
                <div className="page-sub">{branch === "all" ? "All Branches" : branch === "main" ? "Main Branch" : "Juja Branch"} · {user.name}</div>
              </div>
            </div>
            <div className="topbar-chips">
              {lowStockCount > 0 && (
                <div className="chip danger" onClick={() => setPage("inventory")}>⚠️ {lowStockCount} Low Stock</div>
              )}
              <div className="chip">📅 {todayLong()}</div>
              <div className="chip">🕐 {time}</div>
            </div>
          </div>

          <div className="content"><div className="content-inner">{renderPage()}</div></div>
        </div>

        {/* ── Mobile bottom navigation bar ── */}
        <nav className="mobile-bottom-nav">
          {[
            { id:"dashboard", icon:"🏠", label:"Home" },
            { id:"sales",     icon:"🛒", label:"Sales" },
            { id:"inventory", icon:"📦", label:"Stock" },
            { id:"reports",   icon:"📊", label:"Reports" },
          ].filter(item => canAccess(item.id)).map(item => (
            <button
              key={item.id}
              className={`mbn-item ${page === item.id ? "active" : ""}`}
              onClick={() => { setPage(item.id); setSidebarOpen(false); }}
            >
              <span className="mbn-icon">{item.icon}</span>
              <span className="mbn-label">{item.label}</span>
              {item.id === "inventory" && lowStockCount > 0 && <span className="mbn-badge">{lowStockCount}</span>}
            </button>
          ))}
          <button className={`mbn-item ${sidebarOpen ? "active" : ""}`} onClick={() => setSidebarOpen(s => !s)}>
            <span className="mbn-icon" style={{ transition:"transform .2s", transform: sidebarOpen ? "rotate(90deg)" : "none" }}>
              {sidebarOpen ? "✕" : "☰"}
            </span>
            <span className="mbn-label">Menu</span>
          </button>
        </nav>
      </div>
    </>
  );
}