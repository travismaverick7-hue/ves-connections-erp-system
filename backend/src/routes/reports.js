const express  = require('express');
const router   = express.Router();
const ExcelJS  = require('exceljs');
const PDFDocument = require('pdfkit');
const pool     = require('../../config/db');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);

// ── Shared query helpers ──────────────────────────────────────────────────────
async function getSalesData(branch, startDate, endDate) {
  const params = [];
  let where = [];
  if (branch && branch !== 'all') { params.push(branch); where.push(`s.branch = $${params.length}`); }
  if (startDate) { params.push(startDate); where.push(`s.sale_date >= $${params.length}`); }
  if (endDate)   { params.push(endDate);   where.push(`s.sale_date <= $${params.length}`); }

  const { rows } = await pool.query(`
    SELECT s.*, json_agg(json_build_object(
      'product_name',si.product_name,'qty',si.qty,'unit_price',si.unit_price,'line_total',si.line_total
    )) AS items
    FROM sales s
    LEFT JOIN sale_items si ON s.id = si.sale_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    GROUP BY s.id ORDER BY s.sale_date DESC
  `, params);
  return rows;
}

async function getExpensesData(branch, startDate, endDate) {
  const params = [];
  let where = [];
  if (branch && branch !== 'all') { params.push(branch); where.push(`branch = $${params.length}`); }
  if (startDate) { params.push(startDate); where.push(`expense_date >= $${params.length}`); }
  if (endDate)   { params.push(endDate);   where.push(`expense_date <= $${params.length}`); }

  const { rows } = await pool.query(
    `SELECT * FROM expenses ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY expense_date DESC`,
    params
  );
  return rows;
}

function getDateRange(period) {
  const now = new Date();
  let start, end = now.toISOString().split('T')[0];
  if (period === 'daily') {
    start = end;
  } else if (period === 'weekly') {
    const d = new Date(now); d.setDate(d.getDate() - 6);
    start = d.toISOString().split('T')[0];
  } else if (period === 'monthly') {
    start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  } else { // annual
    start = `${now.getFullYear()}-01-01`;
  }
  return { start, end };
}

// ── GET /api/reports/summary ──────────────────────────────────────────────────
router.get('/summary', async (req, res, next) => {
  try {
    const { branch, period, start_date, end_date } = req.query;
    let startDate = start_date, endDate = end_date;
    if (period && !start_date) { const r = getDateRange(period); startDate = r.start; endDate = r.end; }

    const sales    = await getSalesData(branch, startDate, endDate);
    const expenses = await getExpensesData(branch, startDate, endDate);

    const totalRevenue  = sales.reduce((s, x) => s + parseFloat(x.total), 0);
    const totalExpenses = expenses.reduce((s, x) => s + parseFloat(x.amount), 0);
    const totalDiscount = sales.reduce((s, x) => s + parseFloat(x.discount), 0);

    // Top products by revenue
    const prodMap = {};
    sales.forEach(s => s.items?.forEach(i => {
      if (i && i.product_name) {
        prodMap[i.product_name] = (prodMap[i.product_name] || 0) + parseFloat(i.line_total || 0);
      }
    }));
    const topProducts = Object.entries(prodMap)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    // Payment breakdown
    const payMap = {};
    sales.forEach(s => { payMap[s.pay_method] = (payMap[s.pay_method] || 0) + parseFloat(s.total); });

    // Branch breakdown
    const branchMap = {};
    sales.forEach(s => { branchMap[s.branch] = (branchMap[s.branch] || 0) + parseFloat(s.total); });

    // Category expenses
    const expCatMap = {};
    expenses.forEach(e => { expCatMap[e.category] = (expCatMap[e.category] || 0) + parseFloat(e.amount); });

    // Product stock summary
    const { rows: stockRows } = await pool.query(
      `SELECT p.*, s.name AS supplier_name FROM products p LEFT JOIN suppliers s ON p.supplier_id = s.id WHERE p.is_active=TRUE ORDER BY p.category`
    );
    const lowStock = stockRows.filter(p => p.main_branch_qty < p.min_stock || p.west_branch_qty < p.min_stock);

    res.json({
      success: true,
      period: { start: startDate, end: endDate, label: period || 'custom' },
      summary: {
        totalRevenue,
        totalExpenses,
        totalDiscount,
        grossProfit: totalRevenue - totalExpenses,
        salesCount: sales.length,
        expenseCount: expenses.length,
        lowStockCount: lowStock.length,
        inventoryValue: stockRows.reduce((s, p) => s + (p.main_branch_qty + p.west_branch_qty) * parseFloat(p.sell_price), 0),
      },
      topProducts,
      paymentBreakdown: payMap,
      branchBreakdown: branchMap,
      expenseByCategory: expCatMap,
      lowStockItems: lowStock,
    });
  } catch (err) { next(err); }
});

// ── GET /api/reports/export/excel ─────────────────────────────────────────────
router.get('/export/excel', async (req, res, next) => {
  try {
    const { branch, period, start_date, end_date } = req.query;
    let startDate = start_date, endDate = end_date;
    if (period && !start_date) { const r = getDateRange(period); startDate = r.start; endDate = r.end; }

    const sales    = await getSalesData(branch, startDate, endDate);
    const expenses = await getExpensesData(branch, startDate, endDate);
    const { rows: products } = await pool.query(`SELECT p.*, s.name AS supplier_name FROM products p LEFT JOIN suppliers s ON p.supplier_id=s.id WHERE p.is_active=TRUE ORDER BY category,name`);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'VES CONNECTIONS ERP';
    wb.created = new Date();

    const GOLD   = 'FFF0A500';
    const DARK   = 'FF0D1526';
    const WHITE  = 'FFFFFFFF';
    const LIGHT  = 'FFF5F5F5';

    const hdrFill  = { type:'pattern', pattern:'solid', fgColor:{argb:GOLD} };
    const hdrFont  = { name:'Calibri', bold:true, color:{argb:DARK}, size:11 };
    const bodyFont = { name:'Calibri', size:10 };

    function styleHeader(ws, colCount) {
      const hdrRow = ws.getRow(1);
      hdrRow.height = 22;
      hdrRow.eachCell(cell => {
        cell.fill = hdrFill; cell.font = hdrFont;
        cell.alignment = { vertical:'middle', horizontal:'center' };
        cell.border = { bottom:{style:'thin', color:{argb:DARK}} };
      });
      ws.autoFilter = { from:{row:1,column:1}, to:{row:1,column:colCount} };
    }

    // ── Sheet 1: Summary ──────────────────────────────────────────────────────
    const ws0 = wb.addWorksheet('Summary');
    ws0.mergeCells('A1:D1');
    ws0.getCell('A1').value = 'VES CONNECTIONS LIMITED — ERP REPORT';
    ws0.getCell('A1').font  = { name:'Calibri', bold:true, size:16, color:{argb:GOLD} };
    ws0.getCell('A1').fill  = { type:'pattern', pattern:'solid', fgColor:{argb:DARK} };
    ws0.getCell('A2').value = `Report Period: ${startDate || 'All'} to ${endDate || 'All'}`;
    ws0.getCell('A3').value = `Branch: ${branch || 'All Branches'}`;
    ws0.getCell('A4').value = `Generated: ${new Date().toLocaleString()}`;
    [ws0.getCell('A2'), ws0.getCell('A3'), ws0.getCell('A4')].forEach(c => { c.font = { color:{argb:'FF8AABCF'}, size:10 }; c.fill = {type:'pattern',pattern:'solid',fgColor:{argb:DARK}}; });

    const totalRev = sales.reduce((s, x) => s + parseFloat(x.total), 0);
    const totalExp = expenses.reduce((s, x) => s + parseFloat(x.amount), 0);
    const kpis = [
      ['Total Revenue',  `KSh ${totalRev.toLocaleString()}`,   'FF00D97E'],
      ['Total Expenses', `KSh ${totalExp.toLocaleString()}`,   'FFFF4D6A'],
      ['Gross Profit',   `KSh ${(totalRev - totalExp).toLocaleString()}`, totalRev >= totalExp ? 'FFF0A500' : 'FFFF4D6A'],
      ['Total Sales',    sales.length,                          'FF3B9EFF'],
    ];
    ws0.addRow([]);
    kpis.forEach(([label, value, color]) => {
      const row = ws0.addRow([label, value]);
      row.getCell(1).font = { bold:true, size:12 };
      row.getCell(2).font = { bold:true, size:13, color:{argb:color} };
    });
    ws0.getColumn(1).width = 25;
    ws0.getColumn(2).width = 25;

    // ── Sheet 2: Sales ────────────────────────────────────────────────────────
    const ws1 = wb.addWorksheet('Sales');
    ws1.columns = [
      { header:'Receipt No',    key:'receipt_no',    width:14 },
      { header:'Date',          key:'sale_date',     width:12 },
      { header:'Customer',      key:'customer_name', width:20 },
      { header:'Branch',        key:'branch',        width:14 },
      { header:'Items',         key:'items_str',     width:40 },
      { header:'Subtotal (KSh)',key:'subtotal',      width:16 },
      { header:'Discount (KSh)',key:'discount',      width:16 },
      { header:'Total (KSh)',   key:'total',         width:16 },
      { header:'Payment',       key:'pay_method',    width:12 },
      { header:'Staff',         key:'staff_name',    width:18 },
      { header:'Status',        key:'status',        width:12 },
    ];
    styleHeader(ws1, 11);
    sales.forEach((s, i) => {
      const row = ws1.addRow({
        receipt_no:    s.receipt_no,
        sale_date:     s.sale_date,
        customer_name: s.customer_name,
        branch:        s.branch,
        items_str:     (s.items||[]).map(it => `${it.product_name} x${it.qty}`).join(', '),
        subtotal:      parseFloat(s.subtotal),
        discount:      parseFloat(s.discount),
        total:         parseFloat(s.total),
        pay_method:    s.pay_method,
        staff_name:    s.staff_name,
        status:        s.status,
      });
      row.eachCell(c => { c.font = bodyFont; c.fill = {type:'pattern',pattern:'solid',fgColor:{argb: i%2===0?'FFFFFFFF':'FFF8F9FA'}}; });
      row.getCell('total').font = { ...bodyFont, bold:true, color:{argb:'FF16A34A'} };
    });
    // Totals row
    const sTotRow = ws1.addRow({ customer_name:'TOTAL', total: totalRev });
    sTotRow.font = { bold:true }; sTotRow.getCell('total').font = { bold:true, color:{argb:'FF16A34A'} };

    // ── Sheet 3: Expenses ─────────────────────────────────────────────────────
    const ws2 = wb.addWorksheet('Expenses');
    ws2.columns = [
      { header:'Date',         key:'expense_date', width:12 },
      { header:'Category',     key:'category',     width:16 },
      { header:'Description',  key:'description',  width:30 },
      { header:'Branch',       key:'branch',       width:14 },
      { header:'Amount (KSh)', key:'amount',       width:16 },
      { header:'Added By',     key:'added_by',     width:20 },
    ];
    styleHeader(ws2, 6);
    expenses.forEach((e, i) => {
      const row = ws2.addRow({ ...e, amount: parseFloat(e.amount) });
      row.eachCell(c => { c.font = bodyFont; c.fill = {type:'pattern',pattern:'solid',fgColor:{argb: i%2===0?'FFFFFFFF':'FFF8F9FA'}}; });
      row.getCell('amount').font = { ...bodyFont, color:{argb:'FFDC2626'} };
    });
    const eTotRow = ws2.addRow({ category:'TOTAL', amount: totalExp });
    eTotRow.font = { bold:true };

    // ── Sheet 4: Inventory ────────────────────────────────────────────────────
    const ws3 = wb.addWorksheet('Inventory');
    ws3.columns = [
      { header:'Product',          key:'name',           width:28 },
      { header:'SKU',              key:'sku',            width:14 },
      { header:'Category',         key:'category',       width:14 },
      { header:'Supplier',         key:'supplier_name',  width:20 },
      { header:'Buy Price (KSh)',  key:'buy_price',      width:16 },
      { header:'Sell Price (KSh)', key:'sell_price',     width:16 },
      { header:'Main Branch Qty',  key:'main_branch_qty',width:16 },
      { header:'West Branch Qty',  key:'west_branch_qty',width:16 },
      { header:'Min Stock',        key:'min_stock',      width:12 },
      { header:'Total Value (KSh)',key:'total_value',    width:18 },
      { header:'Status',           key:'status',         width:14 },
    ];
    styleHeader(ws3, 11);
    products.forEach((p, i) => {
      const totalQty   = p.main_branch_qty + p.west_branch_qty;
      const totalValue = totalQty * parseFloat(p.sell_price);
      const status     = totalQty === 0 ? 'Out of Stock' : (p.main_branch_qty < p.min_stock || p.west_branch_qty < p.min_stock) ? 'Low Stock' : 'Healthy';
      const row = ws3.addRow({ ...p, total_value: totalValue, status, buy_price: parseFloat(p.buy_price), sell_price: parseFloat(p.sell_price) });
      row.eachCell(c => { c.font = bodyFont; c.fill = {type:'pattern',pattern:'solid',fgColor:{argb: i%2===0?'FFFFFFFF':'FFF8F9FA'}}; });
      const sc = row.getCell('status');
      sc.font = { ...bodyFont, bold:true, color:{argb: status==='Healthy'?'FF16A34A':status==='Low Stock'?'FFD97706':'FFDC2626'} };
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="VES_ERP_Report_${new Date().toISOString().split('T')[0]}.xlsx"`);
    await wb.xlsx.write(res);
  } catch (err) { next(err); }
});

// ── GET /api/reports/export/pdf ───────────────────────────────────────────────
router.get('/export/pdf', async (req, res, next) => {
  try {
    const { branch, period, start_date, end_date } = req.query;
    let startDate = start_date, endDate = end_date;
    if (period && !start_date) { const r = getDateRange(period); startDate = r.start; endDate = r.end; }

    const sales    = await getSalesData(branch, startDate, endDate);
    const expenses = await getExpensesData(branch, startDate, endDate);
    const { rows: products } = await pool.query('SELECT * FROM products WHERE is_active=TRUE ORDER BY category');

    const totalRev  = sales.reduce((s, x) => s + parseFloat(x.total), 0);
    const totalExp  = expenses.reduce((s, x) => s + parseFloat(x.amount), 0);
    const netProfit = totalRev - totalExp;

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="VES_ERP_Report_${new Date().toISOString().split('T')[0]}.pdf"`);
    doc.pipe(res);

    // Header
    doc.rect(0, 0, doc.page.width, 80).fill('#0D1526');
    doc.fillColor('#F0A500').fontSize(22).font('Helvetica-Bold').text('VES CONNECTIONS LIMITED', 50, 20);
    doc.fillColor('#8AABCF').fontSize(10).font('Helvetica').text(`Electronics & Accessories · ERP Report · ${new Date().toLocaleDateString()}`, 50, 48);
    doc.fillColor('#8AABCF').fontSize(9).text(`Period: ${startDate||'All'} – ${endDate||'All'} | Branch: ${branch||'All'}`, 50, 62);

    doc.moveDown(3);

    // KPI Summary
    doc.fillColor('#F0A500').fontSize(13).font('Helvetica-Bold').text('FINANCIAL SUMMARY', 50, doc.y);
    doc.moveDown(0.5);
    const kpis = [
      ['Total Revenue', `KSh ${totalRev.toLocaleString()}`, '#00D97E'],
      ['Total Expenses', `KSh ${totalExp.toLocaleString()}`, '#FF4D6A'],
      ['Net Profit', `KSh ${netProfit.toLocaleString()}`, netProfit >= 0 ? '#00D97E' : '#FF4D6A'],
      ['Total Transactions', sales.length.toString(), '#3B9EFF'],
    ];
    const startX = 50; let kpiX = startX;
    kpis.forEach(([label, value, color]) => {
      doc.rect(kpiX, doc.y, 115, 55).fill('#111E35');
      doc.fillColor('#8AABCF').fontSize(9).font('Helvetica').text(label, kpiX + 8, doc.y - 50);
      doc.fillColor(color).fontSize(13).font('Helvetica-Bold').text(value, kpiX + 8, doc.y - 35);
      kpiX += 123;
    });
    doc.moveDown(4.5);

    // Sales table
    doc.fillColor('#F0A500').fontSize(13).font('Helvetica-Bold').text('SALES TRANSACTIONS', 50);
    doc.moveDown(0.4);
    const sHeaders = ['Receipt', 'Date', 'Customer', 'Branch', 'Total', 'Method'];
    const sCols    = [80, 75, 110, 90, 80, 80];
    let x = 50;
    doc.rect(50, doc.y, 515, 18).fill('#0D1526');
    sHeaders.forEach((h, i) => {
      doc.fillColor('#F0A500').fontSize(8).font('Helvetica-Bold').text(h, x + 4, doc.y - 14, { width: sCols[i] });
      x += sCols[i];
    });
    doc.moveDown(0.8);
    sales.slice(0, 30).forEach((s, idx) => {
      if (idx % 2 === 0) doc.rect(50, doc.y - 3, 515, 16).fill('#111E35');
      x = 50;
      const row = [s.receipt_no, s.sale_date, s.customer_name, s.branch, `KSh ${parseFloat(s.total).toLocaleString()}`, s.pay_method];
      row.forEach((v, i) => {
        doc.fillColor(i === 4 ? '#00D97E' : '#E8F0FE').fontSize(8).font('Helvetica').text(String(v), x + 4, doc.y - 3, { width: sCols[i] - 4 });
        x += sCols[i];
      });
      doc.moveDown(0.65);
    });
    if (sales.length > 30) { doc.fillColor('#8AABCF').fontSize(8).text(`... and ${sales.length - 30} more transactions`); }

    doc.moveDown(1);

    // Expenses
    doc.fillColor('#F0A500').fontSize(13).font('Helvetica-Bold').text('EXPENSES', 50);
    doc.moveDown(0.4);
    const eHeaders = ['Date', 'Category', 'Description', 'Branch', 'Amount'];
    const eCols    = [75, 90, 160, 100, 90];
    x = 50;
    doc.rect(50, doc.y, 515, 18).fill('#0D1526');
    eHeaders.forEach((h, i) => {
      doc.fillColor('#F0A500').fontSize(8).font('Helvetica-Bold').text(h, x + 4, doc.y - 14, { width: eCols[i] });
      x += eCols[i];
    });
    doc.moveDown(0.8);
    expenses.forEach((e, idx) => {
      if (idx % 2 === 0) doc.rect(50, doc.y - 3, 515, 16).fill('#111E35');
      x = 50;
      const row = [e.expense_date, e.category, e.description||'—', e.branch, `KSh ${parseFloat(e.amount).toLocaleString()}`];
      row.forEach((v, i) => {
        doc.fillColor(i === 4 ? '#FF4D6A' : '#E8F0FE').fontSize(8).font('Helvetica').text(String(v), x + 4, doc.y - 3, { width: eCols[i] - 4 });
        x += eCols[i];
      });
      doc.moveDown(0.65);
    });

    // Footer
    doc.rect(0, doc.page.height - 40, doc.page.width, 40).fill('#0D1526');
    doc.fillColor('#5A7A9A').fontSize(8).text(
      `VES CONNECTIONS LIMITED ERP System · Confidential · Generated ${new Date().toLocaleString()}`,
      50, doc.page.height - 25, { align: 'center', width: doc.page.width - 100 }
    );

    doc.end();
  } catch (err) { next(err); }
});

// ── GET /api/reports/audit-log ────────────────────────────────────────────────
router.get('/audit-log', authorize('Admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

module.exports = router;
