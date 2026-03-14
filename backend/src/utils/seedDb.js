/**
 * VES CONNECTIONS LIMITED — 
 * Run: node src/utils/seedDb.js
 */
require('dotenv').config();
const pool = require('../../config/db');
const bcrypt = require('bcryptjs');

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🌱 Seeding VES CONNECTIONS ERP database...\n');

    await client.query('BEGIN');

    // ── Users ──────────────────────────────────────────────────────────────
    console.log('👤 Creating users...');
    const pwAdmin   = await bcrypt.hash('admin123', 10);
    const pwJames   = await bcrypt.hash('james123', 10);
    const pwMary    = await bcrypt.hash('mary123', 10);

    const usersRes = await client.query(`
      INSERT INTO users (name, username, password_hash, role, branch, avatar)
      VALUES
        ('System Administrator', 'admin',  $1, 'Admin',   NULL,           'SA'),
        ('James Kamau',          'james',  $2, 'Manager', 'Main Branch',  'JK'),
        ('Mary Wanjiku',         'mary',   $3, 'Cashier', 'West Branch',  'MW')
      ON CONFLICT (username) DO NOTHING
      RETURNING id, username;
    `, [pwAdmin, pwJames, pwMary]);
    console.log(`   ✓ ${usersRes.rowCount} users`);

    // ── Suppliers ──────────────────────────────────────────────────────────
    console.log('🤝 Creating suppliers...');
    const suppRes = await client.query(`
      INSERT INTO suppliers (name, contact, email, address, categories, rating)
      VALUES
        ('Apple Kenya',      '+254 700 111 222', 'orders@applekenya.co.ke',  'Westlands, Nairobi', 'Smartphones, Accessories', 5),
        ('Samsung EA',       '+254 700 333 444', 'supply@samsungea.com',     'Upper Hill, Nairobi','Smartphones, Chargers, Displays', 4),
        ('TechMart',         '+254 700 555 666', 'info@techmart.co.ke',      'CBD, Nairobi',       'Cables, Accessories, Bags', 4),
        ('JBL Africa',       '+254 700 777 888', 'orders@jblafrica.com',     'Karen, Nairobi',     'Audio', 5),
        ('Anker EA',         '+254 700 999 000', 'supply@anker.co.ke',       'Kilimani, Nairobi',  'Power, Storage', 3)
      RETURNING id, name;
    `);
    const supMap = {};
    suppRes.rows.forEach(r => { supMap[r.name] = r.id; });
    console.log(`   ✓ ${suppRes.rowCount} suppliers`);

    // ── Products ───────────────────────────────────────────────────────────
    console.log('📦 Creating products...');
    const prodData = [
      ['iPhone 15 Pro','APL-IP15P','8901234560001','Smartphones',980,1299,12,8,5,supMap['Apple Kenya']],
      ['Samsung Galaxy S24','SAM-GS24','8901234560002','Smartphones',820,1099,7,14,5,supMap['Samsung EA']],
      ['AirPods Pro 2','APL-APP2','8901234560003','Accessories',180,249,25,18,10,supMap['Apple Kenya']],
      ['USB-C Cable 2m','CAB-UC2M','8901234560004','Cables',5,15,3,2,20,supMap['TechMart']],
      ['Samsung 65W Charger','SAM-C65W','8901234560005','Chargers',28,45,18,22,10,supMap['Samsung EA']],
      ['JBL Bluetooth Speaker','JBL-SPK1','8901234560006','Audio',55,89,9,5,5,supMap['JBL Africa']],
      ['Laptop Bag 15"','BAG-LP15','8901234560007','Bags',18,35,0,4,8,supMap['TechMart']],
      ['Power Bank 20000mAh','PWR-20K','8901234560008','Power',32,55,11,6,8,supMap['Anker EA']],
      ['Wireless Mouse','MOU-WL01','8901234560009','Accessories',20,38,15,10,6,supMap['TechMart']],
      ['Mechanical Keyboard','KEY-MK01','8901234560010','Accessories',65,110,5,3,4,supMap['TechMart']],
      ['27" Monitor','MON-27A','8901234560011','Displays',290,420,4,2,3,supMap['Samsung EA']],
      ['SSD 1TB','SSD-1TB','8901234560012','Storage',80,130,8,7,5,supMap['Anker EA']],
    ];
    const prodRes = await client.query(`
      INSERT INTO products (name,sku,barcode,category,buy_price,sell_price,main_branch_qty,west_branch_qty,min_stock,supplier_id)
      SELECT unnest($1::text[]),unnest($2::text[]),unnest($3::text[]),unnest($4::text[]),
             unnest($5::numeric[]),unnest($6::numeric[]),unnest($7::int[]),unnest($8::int[]),
             unnest($9::int[]),unnest($10::uuid[])
      RETURNING id, sku;
    `, [
      prodData.map(p=>p[0]), prodData.map(p=>p[1]), prodData.map(p=>p[2]),
      prodData.map(p=>p[3]), prodData.map(p=>p[4]), prodData.map(p=>p[5]),
      prodData.map(p=>p[6]), prodData.map(p=>p[7]), prodData.map(p=>p[8]),
      prodData.map(p=>p[9]),
    ]);
    const prodMap = {};
    prodRes.rows.forEach(r => { prodMap[r.sku] = r.id; });
    console.log(`   ✓ ${prodRes.rowCount} products`);

    // ── Customers ──────────────────────────────────────────────────────────
    console.log('👥 Creating customers...');
    const custRes = await client.query(`
      INSERT INTO customers (name, phone, email, total_spent, visits)
      VALUES
        ('Alice Mwangi', '+254 712 111 111', 'alice@email.com',  498,  3),
        ('Bob Ochieng',  '+254 712 222 222', 'bob@email.com',   1094,  2),
        ('Carol Njeri',  '+254 712 333 333', 'carol@email.com',  140,  1),
        ('David Maina',  '+254 712 444 444', 'david@email.com',   89,  1),
        ('Eve Kamau',    '+254 712 555 555', 'eve@email.com',    138,  2)
      RETURNING id, name;
    `);
    const custMap = {};
    custRes.rows.forEach(r => { custMap[r.name] = r.id; });
    console.log(`   ✓ ${custRes.rowCount} customers`);

    // ── Users lookup ───────────────────────────────────────────────────────
    const uRes = await client.query('SELECT id, username FROM users');
    const userMap = {};
    uRes.rows.forEach(r => { userMap[r.username] = r.id; });

    // ── Sales ──────────────────────────────────────────────────────────────
    console.log('🛒 Creating sales...');
    const salesData = [
      { rcpt:'RCP-0001', date:'2026-02-20', cust:'Walk-in',    custId:null,                  branch:'Main Branch', staff:'james', pay:'Cash',          sub:1299, disc:0,  total:1299, items:[{sku:'APL-IP15P',name:'iPhone 15 Pro',qty:1,price:1299}] },
      { rcpt:'RCP-0002', date:'2026-02-21', cust:'Alice Mwangi',custId:custMap['Alice Mwangi'],branch:'West Branch', staff:'mary',  pay:'M-Pesa',        sub:498,  disc:0,  total:498,  items:[{sku:'APL-APP2',name:'AirPods Pro 2',qty:2,price:249}] },
      { rcpt:'RCP-0003', date:'2026-02-22', cust:'Bob Ochieng', custId:custMap['Bob Ochieng'], branch:'Main Branch', staff:'james', pay:'Card',          sub:1144, disc:50, total:1094, items:[{sku:'SAM-GS24',name:'Samsung Galaxy S24',qty:1,price:1099},{sku:'SAM-C65W',name:'Samsung 65W Charger',qty:1,price:45}] },
      { rcpt:'RCP-0004', date:'2026-02-23', cust:'Walk-in',    custId:null,                  branch:'West Branch', staff:'mary',  pay:'Cash',          sub:75,   disc:0,  total:75,   items:[{sku:'CAB-UC2M',name:'USB-C Cable 2m',qty:5,price:15}] },
      { rcpt:'RCP-0005', date:'2026-02-24', cust:'Carol Njeri', custId:custMap['Carol Njeri'], branch:'Main Branch', staff:'james', pay:'M-Pesa',        sub:140,  disc:0,  total:140,  items:[{sku:'PWR-20K',name:'Power Bank 20000mAh',qty:2,price:55},{sku:'CAB-UC2M',name:'USB-C Cable 2m',qty:2,price:15}] },
      { rcpt:'RCP-0006', date:'2026-02-25', cust:'David Maina', custId:custMap['David Maina'], branch:'West Branch', staff:'mary',  pay:'Cash',          sub:89,   disc:0,  total:89,   items:[{sku:'JBL-SPK1',name:'JBL Bluetooth Speaker',qty:1,price:89}] },
      { rcpt:'RCP-0007', date:'2026-02-26', cust:'Eve Kamau',   custId:custMap['Eve Kamau'],   branch:'Main Branch', staff:'james', pay:'Card',          sub:148,  disc:10, total:138,  items:[{sku:'MOU-WL01',name:'Wireless Mouse',qty:1,price:38},{sku:'KEY-MK01',name:'Mechanical Keyboard',qty:1,price:110}] },
      { rcpt:'RCP-0008', date:'2026-02-27', cust:'Walk-in',    custId:null,                  branch:'West Branch', staff:'mary',  pay:'M-Pesa',        sub:130,  disc:0,  total:130,  items:[{sku:'SSD-1TB',name:'SSD 1TB',qty:1,price:130}] },
    ];
    for (const s of salesData) {
      const sr = await client.query(`
        INSERT INTO sales (receipt_no,customer_id,customer_name,branch,staff_id,staff_name,pay_method,subtotal,discount,tax,total,sale_date)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11) RETURNING id`,
        [s.rcpt, s.custId, s.cust, s.branch, userMap[s.staff], s.staff==='james'?'James Kamau':'Mary Wanjiku', s.pay, s.sub, s.disc, s.total, s.date]
      );
      const saleId = sr.rows[0].id;
      for (const it of s.items) {
        await client.query(`INSERT INTO sale_items (sale_id,product_id,product_name,qty,unit_price) VALUES ($1,$2,$3,$4,$5)`,
          [saleId, prodMap[it.sku], it.name, it.qty, it.price]);
      }
    }
    await client.query(`UPDATE counters SET value = 9 WHERE key = 'receipt'`);
    console.log(`   ✓ ${salesData.length} sales with items`);

    // ── Purchase Orders ────────────────────────────────────────────────────
    console.log('📋 Creating purchase orders...');
    const poData = [
      { num:'PO-001', supp:'Apple Kenya',  branch:'Main Branch', status:'Delivered', date:'2026-02-18', items:[{n:'iPhone 15 Pro',q:10,c:980},{n:'AirPods Pro 2',q:20,c:180}] },
      { num:'PO-002', supp:'Samsung EA',   branch:'West Branch', status:'In Transit',date:'2026-02-22', items:[{n:'Galaxy S24',q:15,c:820},{n:'65W Charger',q:30,c:28}] },
      { num:'PO-003', supp:'TechMart',     branch:'Main Branch', status:'Pending',   date:'2026-02-25', items:[{n:'USB-C Cable',q:100,c:5},{n:'Laptop Bag',q:20,c:18}] },
    ];
    for (const po of poData) {
      const tot = po.items.reduce((s,i) => s + i.q*i.c, 0);
      const pr = await client.query(`
        INSERT INTO purchase_orders (po_number,supplier_id,supplier_name,branch,total,status,order_date,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [po.num, supMap[po.supp], po.supp, po.branch, tot, po.status, po.date, userMap['admin']]
      );
      const poId = pr.rows[0].id;
      for (const it of po.items) {
        await client.query(`INSERT INTO po_items (po_id,item_name,qty,unit_cost) VALUES ($1,$2,$3,$4)`,
          [poId, it.n, it.q, it.c]);
      }
    }
    console.log(`   ✓ ${poData.length} purchase orders`);

    // ── Expenses ───────────────────────────────────────────────────────────
    console.log('💸 Creating expenses...');
    await client.query(`
      INSERT INTO expenses (category, description, amount, branch, added_by_id, added_by, expense_date)
      VALUES
        ('Rent',      'February rent',       45000, 'Main Branch', $1, 'James Kamau',          '2026-02-20'),
        ('Rent',      'February rent',       32000, 'West Branch', $2, 'Mary Wanjiku',          '2026-02-20'),
        ('Utilities', 'Electricity bill',     5000, 'Main Branch', $1, 'James Kamau',          '2026-02-22'),
        ('Salaries',  'Staff salaries',     120000, 'Main Branch', $3, 'System Administrator', '2026-02-24'),
        ('Marketing', 'Social media ads',    15000, 'West Branch', $2, 'Mary Wanjiku',          '2026-02-25')
    `, [userMap['james'], userMap['mary'], userMap['admin']]);
    console.log('   ✓ 5 expenses');

    await client.query('COMMIT');
    console.log('\n🎉 Database seeded successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Login credentials:');
    console.log('  admin / admin123  (Admin)');
    console.log('  james / james123  (Manager)');
    console.log('  mary  / mary123   (Cashier)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
