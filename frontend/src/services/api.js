/**
 * VES CONNECTIONS LIMITED — API Service Layer
 * All HTTP calls to the Express backend live here.
 * File: src/services/api.js
 */

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// ─── Token helpers ────────────────────────────────────────────────────────────
export const getToken = () => localStorage.getItem("ves_token");
export const setToken = (t) => localStorage.setItem("ves_token", t);
export const clearToken = () => localStorage.removeItem("ves_token");

//------------------Core fetch
wrapper--------------------------------------------------------------//
async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  // If the server sends back a non-JSON response (e.g. file download) return as-is
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    return res; // caller handles blob/stream
  }

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.message || data?.errors?.[0]?.msg || `Error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

const get  = (path)         => request(path);
const post = (path, body)   => request(path, { method: "POST",   body: JSON.stringify(body) });
const put  = (path, body)   => request(path, { method: "PUT",    body: JSON.stringify(body) });
const patch= (path, body)   => request(path, { method: "PATCH",  body: JSON.stringify(body) });
const del  = (path)         => request(path, { method: "DELETE" });

// ─── Auth & Password Backup System ───────────────────────────────────────────
export const authAPI = {
  login: async (username, password) => {
    const res = await post("/auth/login", { username, password });
    if (res.token) setToken(res.token);
    return res;
  },
  me:             ()                             => get("/auth/me"),
  changePassword: (currentPassword, newPassword) => put("/auth/change-password", { currentPassword, newPassword }),

  // ── Password Backup / Recovery ─────────────────────────────────────────────
  requestReset:       (username)                         => post("/auth/request-reset",        { username }),
  verifyToken:        (token)                            => post("/auth/verify-token",          { token }),
  resetPassword:      (token, newPassword)               => post("/auth/reset-password",        { token, newPassword }),
  adminReset:         (userId, newPassword, mustChange, reason) =>
                        post("/auth/admin-reset",         { userId, newPassword, mustChange, reason }),
  generateAdminToken: (userId, expiryHours, notes)       => post("/auth/generate-admin-token",  { userId, expiryHours, notes }),
  listResetTokens:    ()                                 => get("/auth/reset-tokens"),
  revokeToken:        (id)                               => del(`/auth/reset-tokens/${id}`),
  passwordHistory:    (userId)                           => get(`/auth/password-history/${userId}`),
  setRecoveryHint:    (hint)                             => post("/auth/set-recovery-hint",     { hint }),
  usersSecurity:      ()                                 => get("/auth/users-security"),
  unlockUser:         (userId)                           => post("/auth/unlock-user",            { userId }),
};

// ─── Products ─────────────────────────────────────────────────────────────────
export const productsAPI = {
  list:       (params = {}) => get(`/products?${new URLSearchParams(params)}`),
  get:        (id)          => get(`/products/${id}`),
  categories: ()            => get("/products/categories"),
  create:     (data)        => post("/products", data),
  update:     (id, data)    => put(`/products/${id}`, data),
  adjustStock:(id, branch, qty, operation) => patch(`/products/${id}/stock`, { branch, qty, operation }),
  delete:     (id)          => del(`/products/${id}`),
};

// ─── Sales ────────────────────────────────────────────────────────────────────
export const salesAPI = {
  list:       (params = {}) => get(`/sales?${new URLSearchParams(params)}`),
  get:        (id)          => get(`/sales/${id}`),
  create:     (data)        => post("/sales", data),
  updateStatus:(id, status) => patch(`/sales/${id}/status`, { status }),
  delete:     (id)          => del(`/sales/${id}`),
};

// ─── Purchase Orders ──────────────────────────────────────────────────────────
export const purchaseOrdersAPI = {
  list:         (params = {}) => get(`/purchase-orders?${new URLSearchParams(params)}`),
  get:          (id)          => get(`/purchase-orders/${id}`),
  create:       (data)        => post("/purchase-orders", data),
  updateStatus: (id, status)  => patch(`/purchase-orders/${id}/status`, { status }),
  delete:       (id)          => del(`/purchase-orders/${id}`),
};

// ─── Customers ────────────────────────────────────────────────────────────────
export const customersAPI = {
  list:   (params = {}) => get(`/customers?${new URLSearchParams(params)}`),
  get:    (id)          => get(`/customers/${id}`),
  create: (data)        => post("/customers", data),
  update: (id, data)    => put(`/customers/${id}`, data),
  delete: (id)          => del(`/customers/${id}`),
};

// ─── Suppliers ────────────────────────────────────────────────────────────────
export const suppliersAPI = {
  list:   ()           => get("/suppliers"),
  create: (data)       => post("/suppliers", data),
  update: (id, data)   => put(`/suppliers/${id}`, data),
  delete: (id)         => del(`/suppliers/${id}`),
};

// ─── Expenses ─────────────────────────────────────────────────────────────────
export const expensesAPI = {
  list:   (params = {}) => get(`/expenses?${new URLSearchParams(params)}`),
  create: (data)        => post("/expenses", data),
  delete: (id)          => del(`/expenses/${id}`),
};

// ─── Reports ──────────────────────────────────────────────────────────────────
export const reportsAPI = {
  summary:    (params = {}) => get(`/reports/summary?${new URLSearchParams(params)}`),
  auditLog:   ()            => get("/reports/audit-log"),

  exportExcel: async (branch = 'All Branches') => {
    const token = getToken();
    const res = await fetch(`${BASE_URL}/reports/export/xlsx?branch=${encodeURIComponent(branch)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url  = window.URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `VES-Report-${branch.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  },

  exportPdf: async (params = {}) => {
    const res = await request(`/reports/export/pdf?${new URLSearchParams(params)}`);
    return res;
  },
};

// ─── Users (Admin) ────────────────────────────────────────────────────────────
export const usersAPI = {
  list:       ()           => get("/users"),
  create:     (data)       => post("/users", data),
  update:     (id, data)   => put(`/users/${id}`, data),
  deactivate: (id)         => del(`/users/${id}`),
};

// ─── Download helper (triggers browser save-as dialog) ───────────────────────
export async function downloadFile(apiCall, filename) {
  const res = await apiCall();
  const blob = await res.blob();
  const url  = window.URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// ─── Stock Transfers ──────────────────────────────────────────────────────────
export const transfersAPI = {
  list:   ()     => get("/transfers"),
  create: (data) => post("/transfers", data),
  delete: (id)   => del(`/transfers/${id}`),
};

// ─── Debt Tracker ─────────────────────────────────────────────────────────────
export const debtsAPI = {
  list:    ()           => get("/debts"),
  create:  (data)       => post("/debts", data),
  pay:     (id, amount) => post(`/debts/${id}/pay`, { payAmount: amount }),
  delete:  (id)         => del(`/debts/${id}`),
};

// ─── Cash Register ────────────────────────────────────────────────────────────
export const registerAPI = {
  list:    ()              => get("/register"),
  today:   (branch)        => get(`/register/today?branch=${encodeURIComponent(branch)}`),
  open:    (data)          => post("/register/open", data),
  close:   (id, data)      => post(`/register/${id}/close`, data),
};

// ─── Sales Returns ────────────────────────────────────────────────────────────
export const returnsAPI = {
  list:   ()     => get("/returns"),
  create: (data) => post("/returns", data),
  delete: (id)   => del(`/returns/${id}`),
};

// ─── Time Logs ────────────────────────────────────────────────────────────────
export const timeLogsAPI = {
  list:     ()      => get("/time-logs"),
  today:    ()      => get("/time-logs/today"),
  clockIn:  (data)  => post("/time-logs/clock-in", data),
  clockOut: ()      => post("/time-logs/clock-out", {}),
};

// ─── Logistics & Delivery ─────────────────────────────────────────────────────
export const logisticsAPI = {
  list:         (params = {}) => get(`/logistics?${new URLSearchParams(params)}`),
  create:       (data)        => post('/logistics', data),
  updateStatus: (id, status, note) => patch(`/logistics/${id}/status`, { status, note }),
  delete:       (id)          => del(`/logistics/${id}`),
};

// ─── Currency / FX Rates ──────────────────────────────────────────────────────
export const currencyAPI = {
  list:    ()               => get('/currency'),
  update:  (currency, rate) => put(`/currency/${currency}`, { rate }),
  convert: (data)           => post('/currency/convert', data),
};

// ─── Documents ────────────────────────────────────────────────────────────────
export const documentsAPI = {
  list:   (params = {}) => get(`/documents?${new URLSearchParams(params)}`),
  get:    (id)          => get(`/documents/${id}`),
  create: (data)        => post('/documents', data),
  delete: (id)          => del(`/documents/${id}`),
};

// ─── M-Pesa ───────────────────────────────────────────────────────────────────
export const mpesaAPI = {
  transactions: (params = {}) => get(`/mpesa/transactions?${new URLSearchParams(params)}`),
  summary:      ()            => get('/mpesa/summary'),
  stkPush:      (data)        => post('/mpesa/stk-push', data),
  updateTxn:    (id, data)    => patch(`/mpesa/transactions/${id}/status`, data),
  getConfig:    ()            => get('/mpesa/config'),
  saveConfig:   (data)        => post('/mpesa/config', data),
  testToken:    ()            => get('/mpesa/token-test'),
};

// ─── Companies ────────────────────────────────────────────────────────────────
export const companiesAPI = {
  list:   ()         => get('/companies'),
  create: (data)     => post('/companies', data),
  update: (id, data) => put(`/companies/${id}`, data),
  delete: (id)       => del(`/companies/${id}`),
};

// ─── Roles & Permissions ─────────────────────────────────────────────────────
export const rolesAPI = {
  list:           ()              => get('/roles'),
  create:         (data)          => post('/roles', data),
  delete:         (id)            => del(`/roles/${id}`),
  updatePerms:    (id, perms)     => put(`/roles/${id}/permissions`, { permissions: perms }),
  myPermissions:  ()              => get('/roles/my-permissions'),
};

// ─── Product Categories ───────────────────────────────────────────────────────
export const productCategoriesAPI = {
  list:   ()         => get('/product-categories'),
  create: (data)     => post('/product-categories', data),
  update: (id, data) => put(`/product-categories/${id}`, data),
  delete: (id)       => del(`/product-categories/${id}`),
};

// ─── Warehouses ───────────────────────────────────────────────────────────────
export const warehousesAPI = {
  list:   ()         => get('/warehouses'),
  create: (data)     => post('/warehouses', data),
  update: (id, data) => put(`/warehouses/${id}`, data),
};

// ─── Invoices ─────────────────────────────────────────────────────────────────
export const invoicesAPI = {
  list:         (params = {}) => get(`/invoices?${new URLSearchParams(params)}`),
  create:       (data)        => post('/invoices', data),
  updateStatus: (id, status)  => patch(`/invoices/${id}/status`, { status }),
  delete:       (id)          => del(`/invoices/${id}`),
};

// ─── Payments ─────────────────────────────────────────────────────────────────
export const paymentsAPI = {
  list:   (params = {}) => get(`/payments?${new URLSearchParams(params)}`),
  create: (data)        => post('/payments', data),
  delete: (id)          => del(`/payments/${id}`),
};

// ─── Employees ────────────────────────────────────────────────────────────────
export const employeesAPI = {
  list:   (params = {}) => get(`/employees?${new URLSearchParams(params)}`),
  create: (data)        => post('/employees', data),
  update: (id, data)    => put(`/employees/${id}`, data),
  delete: (id)          => del(`/employees/${id}`),
};

// ─── Departments ──────────────────────────────────────────────────────────────
export const departmentsAPI = {
  list:   ()         => get('/departments'),
  create: (data)     => post('/departments', data),
  update: (id, data) => put(`/departments/${id}`, data),
  delete: (id)       => del(`/departments/${id}`),
};

// ─── Attendance ───────────────────────────────────────────────────────────────
export const attendanceAPI = {
  list:    (params = {}) => get(`/attendance?${new URLSearchParams(params)}`),
  summary: (month)       => get(`/attendance/summary?month=${month}`),
  record:  (data)        => post('/attendance', data),
  delete:  (id)          => del(`/attendance/${id}`),
};

// ─── Assets ───────────────────────────────────────────────────────────────────
export const assetsAPI = {
  list:   (params = {}) => get(`/assets?${new URLSearchParams(params)}`),
  create: (data)        => post('/assets', data),
  update: (id, data)    => put(`/assets/${id}`, data),
  delete: (id)          => del(`/assets/${id}`),
};

// ─── Expense Categories ───────────────────────────────────────────────────────
export const expenseCategoriesAPI = {
  list:   ()         => get('/expense-categories'),
  create: (data)     => post('/expense-categories', data),
  update: (id, data) => put(`/expense-categories/${id}`, data),
  delete: (id)       => del(`/expense-categories/${id}`),
};

// ─── Onfon Stock Management ───────────────────────────────────────────────────
export const onfonAPI = {
  // Agents
  listAgents:   ()         => get('/onfon/agents'),
  createAgent:  (data)     => post('/onfon/agents', data),
  updateAgent:  (id, data) => put(`/onfon/agents/${id}`, data),
  deleteAgent:  (id)       => del(`/onfon/agents/${id}`),
  agentPerf:    (id)       => get(`/onfon/agents/${id}/performance`),

  // Devices
  listDevices:  (params={}) => get(`/onfon/devices?${new URLSearchParams(params)}`),
  deleteDevice: (id)        => del(`/onfon/devices/${id}`),
  deleteAllDevices: ()      => del(`/onfon/devices`),
  lookup:       (imei)      => get(`/onfon/lookup/${imei}`),
  stats:        ()          => get('/onfon/stats'),

  // Operations
  receive:      (data) => post('/onfon/receive',    data),
  assign:       (data) => post('/onfon/assign',     data),
  agentSale:    (data) => post('/onfon/agent-sale', data),
  shopSale:     (data) => post('/onfon/shop-sale',  data),
  returnDevice: (data) => post('/onfon/return',     data),
};

// ─── Onfon Extended APIs ──────────────────────────────────────────────────────
export const onfonReportsAPI = {
  weekly:   (params={}) => get(`/onfon/reports/weekly?${new URLSearchParams(params)}`),
  monthly:  (params={}) => get(`/onfon/reports/monthly?${new URLSearchParams(params)}`),
  annual:   (params={}) => get(`/onfon/reports/annual?${new URLSearchParams(params)}`),
  released: (params={}) => get(`/onfon/released-devices?${new URLSearchParams(params)}`),
  exportCSV:(params={}) => `${import.meta.env.VITE_API_URL||'http://localhost:5000/api'}/onfon/export/csv?${new URLSearchParams(params)}`,
};

// ─── Data Wipe API (Admin only) ───────────────────────────────────────────────
export const wipeAPI = {
  preview:      ()                       => post("/admin/wipe/preview",      {}),
  transactions: (confirmCode, reason)    => post("/admin/wipe/transactions", { confirmCode, reason }),
  full:         (confirmCode, reason)    => post("/admin/wipe/full",         { confirmCode, reason }),
};

// ─── Cash Reconciliation ──────────────────────────────────────────────────────
export const reconciliationAPI = {
  list:    (params={}) => get(`/reconciliation?${new URLSearchParams(params)}`),
  save:    (data)      => post('/reconciliation', data),
  submit:  (id)        => put(`/reconciliation/${id}/submit`, {}),
  approve: (id)        => put(`/reconciliation/${id}/approve`, {}),
  summary: (params={}) => get(`/reconciliation/summary?${new URLSearchParams(params)}`),
  delete:  (id)        => del(`/reconciliation/${id}`),
};

// ─── Supplier Payments ────────────────────────────────────────────────────────
export const supplierPaymentsAPI = {
  list:        (params={}) => get(`/supplier-payments?${new URLSearchParams(params)}`),
  forSupplier: (id)        => get(`/supplier-payments/supplier/${id}`),
  create:      (data)      => post('/supplier-payments', data),
  balance:     (id)        => get(`/supplier-payments/balance/${id}`),
  delete:      (id)        => del(`/supplier-payments/${id}`),
};

// ─── Reorder Rules ────────────────────────────────────────────────────────────
export const reorderAPI = {
  list:    ()     => get('/reorder-rules'),
  alerts:  ()     => get('/reorder-rules/alerts'),
  save:    (data) => post('/reorder-rules', data),
  delete:  (id)   => del(`/reorder-rules/${id}`),
};

// ─── Customer Loyalty ─────────────────────────────────────────────────────────
export const loyaltyAPI = {
  account:      (cid)         => get(`/loyalty/account/${cid}`),
  enroll:       (customer_id) => post('/loyalty/enroll', { customer_id }),
  earn:         (data)        => post('/loyalty/earn',   data),
  redeem:       (data)        => post('/loyalty/redeem', data),
  addCredit:    (data)        => post('/loyalty/credit/add',   data),
  spendCredit:  (data)        => post('/loyalty/credit/spend', data),
  transactions: (cid)         => get(`/loyalty/transactions/${cid}`),
  settings:     ()            => get('/loyalty/settings'),
  saveSettings: (data)        => put('/loyalty/settings', data),
  leaderboard:  ()            => get('/loyalty/leaderboard'),
};

// ─── Quotations ───────────────────────────────────────────────────────────────
export const quotationsAPI = {
  list:       (params={}) => get(`/quotations?${new URLSearchParams(params)}`),
  get:        (id)        => get(`/quotations/${id}`),
  create:     (data)      => post('/quotations', data),
  setStatus:  (id,status) => patch(`/quotations/${id}/status`, { status }),
  delete:     (id)        => del(`/quotations/${id}`),
};

// ─── Supplier Returns ─────────────────────────────────────────────────────────
export const supplierReturnsAPI = {
  list:      ()           => get('/supplier-returns'),
  get:       (id)         => get(`/supplier-returns/${id}`),
  create:    (data)       => post('/supplier-returns', data),
  setStatus: (id, status) => patch(`/supplier-returns/${id}/status`, { status }),
  delete:    (id)         => del(`/supplier-returns/${id}`),
};

// ─── Commission ───────────────────────────────────────────────────────────────
export const commissionAPI = {
  rules:      ()       => get('/commission/rules'),
  saveRule:   (data)   => post('/commission/rules', data),
  deleteRule: (id)     => del(`/commission/rules/${id}`),
  earnings:   (p={})   => get(`/commission/earnings?${new URLSearchParams(p)}`),
  summary:    (p={})   => get(`/commission/summary?${new URLSearchParams(p)}`),
  approve:    (id)     => patch(`/commission/earnings/${id}/approve`, {}),
  payBatch:   (data)   => patch('/commission/earnings/pay-batch', data),
  calculate:  (items)  => post('/commission/calculate', { items }),
};

// ─── Payroll ──────────────────────────────────────────────────────────────────
export const payrollAPI = {
  runs:    (p={})  => get(`/payroll/runs?${new URLSearchParams(p)}`),
  getRun:  (id)    => get(`/payroll/runs/${id}`),
  create:  (data)  => post('/payroll/runs', data),
  approve: (id)    => patch(`/payroll/runs/${id}/approve`, {}),
  pay:     (id)    => patch(`/payroll/runs/${id}/pay`, {}),
  delete:  (id)    => del(`/payroll/runs/${id}`),
};