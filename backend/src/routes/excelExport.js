/**
 * VES CONNECTIONS LIMITED — Excel Export Route
 * GET /api/reports/export/xlsx?branch=All+Branches
 * Returns a styled multi-sheet .xlsx workbook
 */
const express  = require('express');
const router   = express.Router();
const ExcelJS  = require('exceljs');
const pool     = require('../../config/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ── colour palette ────────────────────────────────────────────────────────────
const GOLD   = 'FFF0A500';
const DARK   = 'FF0A1628';
const NAVY   = 'FF0D2137';
const WHITE  = 'FFFFFFFF';
const GREEN  = 'FF16A34A';
const RED    = 'FFDC2626';
const BLUE   = 'FF2563EB';
const LGRAY  = 'FFF1F5F9';
const BORDER = 'FFE2E8F0';

// ── helpers ───────────────────────────────────────────────────────────────────
const headerStyle = (ws, row, cols, bgColor = DARK, fgColor = WHITE) => {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getRow(row).getCell(c);
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    cell.font   = { bold: true, color: { argb: fgColor }, name: 'Arial', size: 10 };
    cell.border = { bottom: { style: 'thin', color: { argb: GOLD } } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
};

const dataRow = (ws, row, cols, shade) => {
  for (let c = 1; c <= cols; c++) {
    const cell = ws.getRow(row).getCell(c);
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: shade ? LGRAY : WHITE } };
    cell.font      = { name: 'Arial', size: 9 };
    cell.border    = { bottom: { style: 'hair', color: { argb: BORDER } } };
    cell.alignment = { vertical: 'middle', wrapText: false };
  }
};

const ksh = v => `KSh ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

const titleBlock = (ws, title, subtitle, cols) => {
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell('A1');
  t.value     = 'VES CONNECTIONS LIMITED';
  t.font      = { bold: true, name: 'Arial', size: 14, color: { argb: GOLD } };
  t.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, cols);
  const s = ws.getCell('A2');
  s.value     = `${title}  |  ${subtitle}  |  Generated: ${new Date().toLocaleString('en-KE')}`;
  s.font      = { italic: true, name: 'Arial', size: 9, color: { argb: WHITE } };
  s.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  s.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 18;
};

// ── GET /api/reports/export/xlsx ──────────────────────────────────────────────
router.get('/xlsx', async (req, res, next) => {
  const branchFilter = req.query.branch || 'All Branches';
  const bWhere = branchFilter === 'All Branches' ? '' : `AND branch = $1`;
  const bParam = branchFilter === 'All Branches' ? [] : [branchFilter];

  try {
    // ── fetch all data ───────────────────────────────────────────────────────
    const [salesRes, expRes, prodRes, custRes, suppRes, ordersRes] = await Promise.all([
      pool.query(`SELECT s.*, u.name AS staff_name FROM sales s LEFT JOIN users u ON s.staff_id=u.id WHERE 1=1 ${bWhere} ORDER BY s.sale_date DESC`, bParam),
      pool.query(`SELECT e.*, u.name AS added_by_name FROM expenses e LEFT JOIN users u ON e.added_by=u.id WHERE 1=1 ${bWhere} ORDER BY e.expense_date DESC`, bParam),
      pool.query(`SELECT p.*, s.name AS supplier_name FROM products p LEFT JOIN suppliers s ON p.supplier_id=s.id WHERE p.is_active=TRUE ORDER BY p.category, p.name`),
      pool.query(`SELECT * FROM customers ORDER BY total_spent DESC`),
      pool.query(`SELECT * FROM suppliers WHERE is_active=TRUE ORDER BY name`),
      pool.query(`SELECT po.*, s.name AS supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id=s.id ORDER BY po.order_date DESC LIMIT 200`),
    ]);

    const sales    = salesRes.rows;
    const expenses = expRes.rows;
    const products = prodRes.rows;
    const customers= custRes.rows;
    const suppliers= suppRes.rows;
    const orders   = ordersRes.rows;

    const totalRev  = sales.reduce((s, x) => s + parseFloat(x.total || 0), 0);
    const totalExp  = expenses.reduce((s, x) => s + parseFloat(x.amount || 0), 0);
    const grossProfit = sales.reduce((s, sale) => {
      const items = typeof sale.items === 'string' ? JSON.parse(sale.items) : (sale.items || []);
      const saleGross = items.reduce((a, item) => {
        const prod = products.find(p => p.id === item.productId || p.id === item.product_id);
        return a + (prod ? (parseFloat(item.price) - parseFloat(prod.buy_price)) * item.qty : 0);
      }, 0);
      return s + saleGross - parseFloat(sale.discount || 0);
    }, 0);

    // ── build workbook ───────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator  = 'VES CONNECTIONS LIMITED ERP';
    wb.created  = new Date();
    wb.modified = new Date();

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 1 — SUMMARY DASHBOARD
    // ════════════════════════════════════════════════════════════════════════
    const ws1 = wb.addWorksheet('📊 Summary', { tabColor: { argb: GOLD.slice(2) } });
    ws1.views = [{ showGridLines: false }];
    titleBlock(ws1, 'Financial Summary Dashboard', branchFilter, 4);

    // KPI block
    const kpis = [
      ['💰 Total Revenue',   totalRev,               BLUE,  'Revenue from all completed sales'],
      ['💸 Total Expenses',  totalExp,                RED,   'All recorded operating expenses'],
      ['📈 Gross Profit',    grossProfit,             GREEN, 'Revenue minus cost of goods sold'],
      ['💎 Net Profit',      grossProfit - totalExp,  grossProfit - totalExp >= 0 ? GREEN : RED, 'Gross profit minus expenses'],
      ['🛒 Total Transactions', sales.length,         BLUE,  'Number of sales transactions'],
      ['📦 Active Products', products.length,         BLUE,  'Products currently in inventory'],
      ['👥 Customers',       customers.length,        BLUE,  'Total registered customers'],
      ['⚠️ Low Stock Items', products.filter(p => p.main_branch_qty < p.min_stock || p.west_branch_qty < p.min_stock).length, RED, 'Products below minimum stock level'],
    ];

    ws1.getRow(4).height = 16;
    ['Metric', 'Value (KSh / Count)', 'Status', 'Description'].forEach((h, i) => {
      ws1.getRow(5).getCell(i + 1).value = h;
    });
    headerStyle(ws1, 5, 4);
    ws1.getRow(5).height = 22;

    kpis.forEach(([label, value, color, desc], idx) => {
      const r = idx + 6;
      const row = ws1.getRow(r);
      row.getCell(1).value = label;
      row.getCell(2).value = typeof value === 'number' && label.includes('KSh') || label.includes('Revenue') || label.includes('Expense') || label.includes('Profit') ? ksh(value) : value;
      row.getCell(3).value = color === GREEN ? '✅ Healthy' : color === RED ? '⚠️ Attention' : 'ℹ️ Info';
      row.getCell(4).value = desc;
      dataRow(ws1, r, 4, idx % 2 === 0);
      row.getCell(2).font = { bold: true, color: { argb: color }, name: 'Arial', size: 10 };
      row.height = 20;
    });

    ws1.columns = [{ width: 28 }, { width: 26 }, { width: 16 }, { width: 42 }];

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 2 — SALES TRANSACTIONS
    // ════════════════════════════════════════════════════════════════════════
    const ws2 = wb.addWorksheet('🛒 Sales', { tabColor: { argb: '16A34A' } });
    ws2.views = [{ showGridLines: false }];
    titleBlock(ws2, 'Sales Transactions', branchFilter, 9);

    const sHeaders = ['Receipt No', 'Date', 'Customer', 'Branch', 'Items', 'Discount', 'Total (KSh)', 'Payment', 'Staff'];
    sHeaders.forEach((h, i) => { ws2.getRow(4).getCell(i + 1).value = h; });
    headerStyle(ws2, 4, 9);
    ws2.getRow(4).height = 22;

    sales.forEach((s, idx) => {
      const items = typeof s.items === 'string' ? JSON.parse(s.items) : (s.items || []);
      const r = idx + 5;
      const row = ws2.getRow(r);
      row.getCell(1).value = s.receipt_no || '';
      row.getCell(2).value = (s.sale_date || '').toString().split('T')[0];
      row.getCell(3).value = s.customer_name || 'Walk-in';
      row.getCell(4).value = s.branch || '';
      row.getCell(5).value = items.map(i => `${i.name}×${i.qty}`).join(', ');
      row.getCell(6).value = parseFloat(s.discount || 0);
      row.getCell(7).value = parseFloat(s.total || 0);
      row.getCell(8).value = s.pay_method || '';
      row.getCell(9).value = s.staff_name || '';
      dataRow(ws2, r, 9, idx % 2 === 0);
      row.getCell(6).numFmt = '#,##0.00';
      row.getCell(7).numFmt = '#,##0.00';
      row.getCell(7).font = { bold: true, color: { argb: GREEN }, name: 'Arial', size: 9 };
      row.height = 18;
    });

    // Totals row
    const sTotalRow = sales.length + 5;
    ws2.getRow(sTotalRow).getCell(1).value = `TOTAL (${sales.length} transactions)`;
    ws2.getRow(sTotalRow).getCell(7).value = totalRev;
    ws2.getRow(sTotalRow).getCell(7).numFmt = '#,##0.00';
    headerStyle(ws2, sTotalRow, 9, NAVY, GOLD);
    ws2.getRow(sTotalRow).height = 22;

    ws2.columns = [
      { width: 14 }, { width: 13 }, { width: 20 }, { width: 14 },
      { width: 35 }, { width: 12 }, { width: 16 }, { width: 12 }, { width: 18 },
    ];

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 3 — EXPENSES
    // ════════════════════════════════════════════════════════════════════════
    const ws3 = wb.addWorksheet('💸 Expenses', { tabColor: { argb: 'DC2626' } });
    ws3.views = [{ showGridLines: false }];
    titleBlock(ws3, 'Expense Records', branchFilter, 6);

    ['Date', 'Category', 'Description', 'Branch', 'Amount (KSh)', 'Added By'].forEach((h, i) => {
      ws3.getRow(4).getCell(i + 1).value = h;
    });
    headerStyle(ws3, 4, 6);
    ws3.getRow(4).height = 22;

    expenses.forEach((e, idx) => {
      const r = idx + 5;
      const row = ws3.getRow(r);
      row.getCell(1).value = (e.expense_date || '').toString().split('T')[0];
      row.getCell(2).value = e.category || '';
      row.getCell(3).value = e.description || '';
      row.getCell(4).value = e.branch || '';
      row.getCell(5).value = parseFloat(e.amount || 0);
      row.getCell(6).value = e.added_by_name || '';
      dataRow(ws3, r, 6, idx % 2 === 0);
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(5).font = { bold: true, color: { argb: RED }, name: 'Arial', size: 9 };
      row.height = 18;
    });

    const eTotalRow = expenses.length + 5;
    ws3.getRow(eTotalRow).getCell(1).value = `TOTAL (${expenses.length} expenses)`;
    ws3.getRow(eTotalRow).getCell(5).value = totalExp;
    ws3.getRow(eTotalRow).getCell(5).numFmt = '#,##0.00';
    headerStyle(ws3, eTotalRow, 6, NAVY, GOLD);
    ws3.getRow(eTotalRow).height = 22;

    ws3.columns = [{ width: 13 }, { width: 16 }, { width: 32 }, { width: 14 }, { width: 16 }, { width: 20 }];

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 4 — INVENTORY
    // ════════════════════════════════════════════════════════════════════════
    const ws4 = wb.addWorksheet('📦 Inventory', { tabColor: { argb: '2563EB' } });
    ws4.views = [{ showGridLines: false }];
    titleBlock(ws4, 'Inventory Report', 'All Branches', 10);

    ['Product', 'SKU', 'Barcode', 'Category', 'Buy Price', 'Sell Price', 'Main Stock', 'Juja Stock', 'Min Stock', 'Status'].forEach((h, i) => {
      ws4.getRow(4).getCell(i + 1).value = h;
    });
    headerStyle(ws4, 4, 10);
    ws4.getRow(4).height = 22;

    products.forEach((p, idx) => {
      const r = idx + 5;
      const row = ws4.getRow(r);
      const isLow = p.main_branch_qty < p.min_stock || p.west_branch_qty < p.min_stock;
      row.getCell(1).value  = p.name;
      row.getCell(2).value  = p.sku;
      row.getCell(3).value  = p.barcode || '';
      row.getCell(4).value  = p.category || '';
      row.getCell(5).value  = parseFloat(p.buy_price || 0);
      row.getCell(6).value  = parseFloat(p.sell_price || 0);
      row.getCell(7).value  = parseInt(p.main_branch_qty || 0);
      row.getCell(8).value  = parseInt(p.west_branch_qty || 0);
      row.getCell(9).value  = parseInt(p.min_stock || 0);
      row.getCell(10).value = isLow ? '⚠️ Low Stock' : '✅ OK';
      dataRow(ws4, r, 10, idx % 2 === 0);
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(6).numFmt = '#,##0.00';
      row.getCell(10).font  = { bold: true, color: { argb: isLow ? RED : GREEN }, name: 'Arial', size: 9 };
      row.height = 18;
    });

    ws4.columns = [
      { width: 24 }, { width: 14 }, { width: 16 }, { width: 14 },
      { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 14 },
    ];

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 5 — CUSTOMERS
    // ════════════════════════════════════════════════════════════════════════
    const ws5 = wb.addWorksheet('👥 Customers', { tabColor: { argb: '7C3AED' } });
    ws5.views = [{ showGridLines: false }];
    titleBlock(ws5, 'Customer Records', 'All', 6);

    ['Name', 'Phone', 'Email', 'Total Spent (KSh)', 'Visits', 'Joined'].forEach((h, i) => {
      ws5.getRow(4).getCell(i + 1).value = h;
    });
    headerStyle(ws5, 4, 6);
    ws5.getRow(4).height = 22;

    customers.forEach((c, idx) => {
      const r = idx + 5;
      const row = ws5.getRow(r);
      row.getCell(1).value = c.name;
      row.getCell(2).value = c.phone || '';
      row.getCell(3).value = c.email || '';
      row.getCell(4).value = parseFloat(c.total_spent || 0);
      row.getCell(5).value = parseInt(c.visits || 0);
      row.getCell(6).value = (c.created_at || '').toString().split('T')[0];
      dataRow(ws5, r, 6, idx % 2 === 0);
      row.getCell(4).numFmt = '#,##0.00';
      row.getCell(4).font = { bold: true, color: { argb: GREEN }, name: 'Arial', size: 9 };
      row.height = 18;
    });

    ws5.columns = [{ width: 22 }, { width: 18 }, { width: 26 }, { width: 18 }, { width: 10 }, { width: 13 }];

    // ════════════════════════════════════════════════════════════════════════
    // SHEET 6 — PURCHASE ORDERS
    // ════════════════════════════════════════════════════════════════════════
    const ws6 = wb.addWorksheet('📋 Purchase Orders', { tabColor: { argb: 'F59E0B' } });
    ws6.views = [{ showGridLines: false }];
    titleBlock(ws6, 'Purchase Orders', branchFilter, 6);

    ['Order ID', 'Date', 'Supplier', 'Branch', 'Total (KSh)', 'Status'].forEach((h, i) => {
      ws6.getRow(4).getCell(i + 1).value = h;
    });
    headerStyle(ws6, 4, 6);
    ws6.getRow(4).height = 22;

    orders.forEach((o, idx) => {
      const r = idx + 5;
      const row = ws6.getRow(r);
      const statusColor = o.status === 'Delivered' ? GREEN : o.status === 'Pending' ? GOLD.slice(2) : BLUE;
      row.getCell(1).value = o.id?.toString().slice(0, 8).toUpperCase() || '';
      row.getCell(2).value = (o.order_date || '').toString().split('T')[0];
      row.getCell(3).value = o.supplier_name || '';
      row.getCell(4).value = o.branch || '';
      row.getCell(5).value = parseFloat(o.total || 0);
      row.getCell(6).value = o.status || '';
      dataRow(ws6, r, 6, idx % 2 === 0);
      row.getCell(5).numFmt = '#,##0.00';
      row.getCell(6).font = { bold: true, color: { argb: statusColor }, name: 'Arial', size: 9 };
      row.height = 18;
    });

    ws6.columns = [{ width: 12 }, { width: 13 }, { width: 20 }, { width: 14 }, { width: 16 }, { width: 14 }];

    // ── stream to response ───────────────────────────────────────────────────
    const fileName = `VES-Report-${branchFilter.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type',        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
});

module.exports = router;