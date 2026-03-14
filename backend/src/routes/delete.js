
// ─── routes/sales.js ──────────────────────────────────────────────────────────
router.delete('/:id', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM sale_items WHERE sale_id = $1', [req.params.id]);
    await pool.query('DELETE FROM sales WHERE id = $1', [req.params.id]);
    res.json({ message: 'Sale deleted' });
  } catch (err) { next(err); }
});

// ─── routes/purchaseOrders.js (or orders.js) ──────────────────────────────────
router.delete('/:id', authenticate, authorize('Admin', 'Manager'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM purchase_order_items WHERE order_id = $1', [req.params.id]);
    await pool.query('DELETE FROM purchase_orders WHERE id = $1', [req.params.id]);
    res.json({ message: 'Purchase order deleted' });
  } catch (err) { next(err); }
});

// ─── routes/transfers.js ──────────────────────────────────────────────────────
router.delete('/:id', authenticate, authorize('Admin', 'Manager'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM stock_transfers WHERE id = $1', [req.params.id]);
    res.json({ message: 'Transfer deleted' });
  } catch (err) { next(err); }
});

// ─── routes/returns.js (sales returns) ───────────────────────────────────────
router.delete('/:id', authenticate, authorize('Admin', 'Manager'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM return_items WHERE return_id = $1', [req.params.id]).catch(()=>{});
    await pool.query('DELETE FROM sales_returns WHERE id = $1', [req.params.id]);
    res.json({ message: 'Return deleted' });
  } catch (err) { next(err); }
});

// ─── routes/supplierReturns.js ────────────────────────────────────────────────
router.delete('/:id', authenticate, authorize('Admin', 'Manager'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM supplier_return_items WHERE return_id = $1', [req.params.id]).catch(()=>{});
    await pool.query('DELETE FROM supplier_returns WHERE id = $1', [req.params.id]);
    res.json({ message: 'Supplier return deleted' });
  } catch (err) { next(err); }
});

// ─── routes/invoices.js ───────────────────────────────────────────────────────
// (already has delete in api.js — confirm it exists in your route file)
router.delete('/:id', authenticate, authorize('Admin', 'Manager'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM invoice_items WHERE invoice_id = $1', [req.params.id]).catch(()=>{});
    await pool.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);
    res.json({ message: 'Invoice deleted' });
  } catch (err) { next(err); }
});

// ─── routes/payments.js ───────────────────────────────────────────────────────
router.delete('/:id', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM payments WHERE id = $1', [req.params.id]);
    res.json({ message: 'Payment deleted' });
  } catch (err) { next(err); }
});

// ─── routes/supplierPayments.js ───────────────────────────────────────────────
router.delete('/:id', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM supplier_payments WHERE id = $1', [req.params.id]);
    res.json({ message: 'Payment deleted' });
  } catch (err) { next(err); }
});

// ─── routes/attendance.js ─────────────────────────────────────────────────────
router.delete('/:id', authenticate, authorize('Admin', 'Manager'), async (req, res, next) => {
  try {
    await pool.query('DELETE FROM attendance WHERE id = $1', [req.params.id]);
    res.json({ message: 'Attendance record deleted' });
  } catch (err) { next(err); }
});

// ─── routes/reconciliation.js ─────────────────────────────────────────────────
router.delete('/:id', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const check = await pool.query('SELECT status FROM cash_reconciliations WHERE id = $1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Not found' });
    if (check.rows[0].status !== 'Draft') return res.status(400).json({ error: 'Can only delete Draft reconciliations' });
    await pool.query('DELETE FROM cash_reconciliations WHERE id = $1', [req.params.id]);
    res.json({ message: 'Reconciliation deleted' });
  } catch (err) { next(err); }
});

// ─── routes/payroll.js ────────────────────────────────────────────────────────
router.delete('/runs/:id', authenticate, authorize('Admin'), async (req, res, next) => {
  try {
    const check = await pool.query('SELECT status FROM payroll_runs WHERE id = $1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Not found' });
    if (check.rows[0].status !== 'Draft') return res.status(400).json({ error: 'Can only delete Draft payroll runs' });
    await pool.query('DELETE FROM payroll_run_items WHERE run_id = $1', [req.params.id]).catch(()=>{});
    await pool.query('DELETE FROM payroll_runs WHERE id = $1', [req.params.id]);
    res.json({ message: 'Payroll run deleted' });
  } catch (err) { next(err); }
});