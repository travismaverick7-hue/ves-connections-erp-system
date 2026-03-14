/**
 * VES CONNECTIONS LIMITED — ERP Backend
 * Node.js + Express + PostgreSQL
 */
require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const rateLimit   = require('express-rate-limit');

const authRoutes  = require('./routes/auth');
const userRoutes  = require('./routes/users');
const prodRoutes  = require('./routes/products');
const salesRoutes = require('./routes/sales');
const poRoutes    = require('./routes/purchaseOrders');
const reportRoutes= require('./routes/reports');
const { custRouter, suppRouter, expRouter } = require('./routes/entities');
const transferRoutes  = require('./routes/transfers');
const debtRoutes      = require('./routes/debts');
const registerRoutes  = require('./routes/register');
const returnsRoutes   = require('./routes/returns');
const timeRoutes      = require('./routes/timeLogs');
const excelRoutes     = require('./routes/excelExport');
const logisticsRoutes = require('./routes/logistics');
const currencyRoutes  = require('./routes/currency');
const documentRoutes  = require('./routes/documents');
const mpesaRoutes     = require('./routes/mpesa');
const companiesRoutes   = require('./routes/companies');
const rolesRoutes       = require('./routes/roles');
const productCatRoutes  = require('./routes/productCategories');
const warehousesRoutes  = require('./routes/warehouses');
const invoicesRoutes    = require('./routes/invoices');
const paymentsRoutes    = require('./routes/payments');
const employeesRoutes   = require('./routes/employees');
const departmentsRoutes = require('./routes/departments');
const attendanceRoutes  = require('./routes/attendance');
const assetsRoutes      = require('./routes/assets');
const expenseCatRoutes  = require('./routes/expenseCategories');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security & Middleware ─────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://yourdomain.com']
    : '*',
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// Rate limiter — 200 req/15min globally
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
}));

// Stricter limiter for auth endpoints
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
}));

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'VES CONNECTIONS ERP API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',             authRoutes);
app.use('/api/users',            userRoutes);
app.use('/api/products',         prodRoutes);
app.use('/api/sales',            salesRoutes);
app.use('/api/purchase-orders',  poRoutes);
app.use('/api/customers',        custRouter);
app.use('/api/suppliers',        suppRouter);
app.use('/api/expenses',         expRouter);
app.use('/api/reports',          reportRoutes);
app.use('/api/transfers',        transferRoutes);
app.use('/api/debts',            debtRoutes);
app.use('/api/register',         registerRoutes);
app.use('/api/returns',          returnsRoutes);
app.use('/api/time-logs',        timeRoutes);
app.use('/api/reports/export',   excelRoutes);
app.use('/api/logistics',        logisticsRoutes);
app.use('/api/currency',         currencyRoutes);
app.use('/api/documents',        documentRoutes);
app.use('/api/mpesa',            mpesaRoutes);
app.use('/api/companies',        companiesRoutes);
app.use('/api/roles',            rolesRoutes);
app.use('/api/product-categories', productCatRoutes);
app.use('/api/warehouses',       warehousesRoutes);
app.use('/api/invoices',         invoicesRoutes);
app.use('/api/payments',         paymentsRoutes);
app.use('/api/employees',        employeesRoutes);
app.use('/api/departments',      departmentsRoutes);
app.use('/api/attendance',       attendanceRoutes);
app.use('/api/assets',           assetsRoutes);
app.use('/api/expense-categories', expenseCatRoutes);
const onfonRoutes = require('./routes/onfon');
app.use('/api/onfon', onfonRoutes);
const passwordBackupRoutes = require('./routes/passwordBackup');
app.use('/api/auth', passwordBackupRoutes);
const wipeRoutes = require('./routes/wipe');
app.use('/api/admin/wipe', wipeRoutes);

// ── 13 New Feature Routes ─────────────────────────────────────────────────────
const reconciliationRoutes  = require('./routes/reconciliation');
const supplierPaymentsRoutes= require('./routes/supplierPayments');
const reorderRulesRoutes    = require('./routes/reorderRules');
const loyaltyRoutes         = require('./routes/loyalty');
const quotationsRoutes      = require('./routes/quotations');
const supplierReturnsRoutes = require('./routes/supplierReturns');
const commissionRoutes      = require('./routes/commission');
const payrollRoutes         = require('./routes/payroll');

app.use('/api/reconciliation',    reconciliationRoutes);
app.use('/api/supplier-payments', supplierPaymentsRoutes);
app.use('/api/reorder-rules',     reorderRulesRoutes);
app.use('/api/loyalty',           loyaltyRoutes);
app.use('/api/quotations',        quotationsRoutes);
app.use('/api/supplier-returns',  supplierReturnsRoutes);
app.use('/api/commission',        commissionRoutes);
app.use('/api/payroll',           payrollRoutes);

// ── API Docs (inline) ─────────────────────────────────────────────────────────
app.get('/api', (req, res) => {
  res.json({
    name: 'VES CONNECTIONS ERP API',
    version: '1.0.0',
    endpoints: {
      auth:           { login:'POST /api/auth/login', me:'GET /api/auth/me', changePassword:'PUT /api/auth/change-password' },
      users:          { list:'GET /api/users', create:'POST /api/users', update:'PUT /api/users/:id', deactivate:'DELETE /api/users/:id' },
      products:       { list:'GET /api/products', get:'GET /api/products/:id', create:'POST /api/products', update:'PUT /api/products/:id', stock:'PATCH /api/products/:id/stock', delete:'DELETE /api/products/:id' },
      sales:          { list:'GET /api/sales', get:'GET /api/sales/:id', create:'POST /api/sales', status:'PATCH /api/sales/:id/status' },
      purchaseOrders: { list:'GET /api/purchase-orders', get:'GET /api/purchase-orders/:id', create:'POST /api/purchase-orders', status:'PATCH /api/purchase-orders/:id/status' },
      customers:      { list:'GET /api/customers', get:'GET /api/customers/:id', create:'POST /api/customers', update:'PUT /api/customers/:id', delete:'DELETE /api/customers/:id' },
      suppliers:      { list:'GET /api/suppliers', create:'POST /api/suppliers', update:'PUT /api/suppliers/:id', delete:'DELETE /api/suppliers/:id' },
      expenses:       { list:'GET /api/expenses', create:'POST /api/expenses', delete:'DELETE /api/expenses/:id' },
      reports:        { summary:'GET /api/reports/summary', excel:'GET /api/reports/export/excel', pdf:'GET /api/reports/export/pdf', auditLog:'GET /api/reports/audit-log' },
    },
    queryParams: {
      sales:    'branch, start_date, end_date, pay_method, search',
      expenses: 'branch, start_date, end_date, category',
      products: 'category, search, low_stock=true',
      reports:  'branch, period (daily|weekly|monthly|annual), start_date, end_date',
    },
  });
});

// ── Error Handlers ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   VES CONNECTIONS LIMITED — ERP Backend      ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  🚀  Server running on port ${PORT}              ║`);
  console.log(`║  🌍  Environment: ${process.env.NODE_ENV || 'development'}               ║`);
  console.log(`║  📖  API docs: http://localhost:${PORT}/api       ║`);
  console.log(`║  ❤️   Health:   http://localhost:${PORT}/health    ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;