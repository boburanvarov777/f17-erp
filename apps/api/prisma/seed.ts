/* eslint-disable no-console */
import { Lang, PrismaClient, Prisma, StageType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const hash = (p: string) =>
  argon2.hash(p, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

const STAGES: StageType[] = ['CUTTING', 'SEWING', 'WASHING', 'LASER', 'PACKING', 'LOADING'];

const ALL = ['*'];

const READ_ONLY = [
  'dashboard.read', 'orders.read', 'models.read', 'warehouse.read', 'schedule.read',
  'cutting.read', 'sewing.read', 'washing.read', 'laser.read', 'packing.read', 'loading.read',
  'reports.read', 'tasks.read', 'plans.read',
];

const stagePerms = (prefix: string) => [`${prefix}.read`, `${prefix}.create`, `${prefix}.update`];

async function main() {
  console.log('▸ Seeding F17 JEANS & ZARINA DENIM ERP…');

  // ─── Departments ───
  const departments = [
    { code: 'ADMIN', nameUz: 'Administratsiya', nameRu: 'Администрация', nameEn: 'Administration', stage: null },
    { code: 'PLANNING', nameUz: 'Rejalashtirish', nameRu: 'Планирование', nameEn: 'Planning', stage: null },
    { code: 'PRODUCTION', nameUz: 'Ishlab chiqarish', nameRu: 'Производство', nameEn: 'Production', stage: null },
    { code: 'WAREHOUSE', nameUz: 'Ombor', nameRu: 'Склад', nameEn: 'Warehouse', stage: null },
    { code: 'CUTTING', nameUz: 'Kesim', nameRu: 'Раскрой', nameEn: 'Cutting', stage: 'CUTTING' as StageType },
    { code: 'SEWING', nameUz: 'Tikuv', nameRu: 'Пошив', nameEn: 'Sewing', stage: 'SEWING' as StageType },
    { code: 'WASHING', nameUz: 'Varka', nameRu: 'Стирка', nameEn: 'Washing', stage: 'WASHING' as StageType },
    { code: 'LASER', nameUz: 'Lazer', nameRu: 'Лазер', nameEn: 'Laser', stage: 'LASER' as StageType },
    { code: 'PACKING', nameUz: 'Upakovka', nameRu: 'Упаковка', nameEn: 'Packing', stage: 'PACKING' as StageType },
    { code: 'LOADING', nameUz: 'Ortish', nameRu: 'Отгрузка', nameEn: 'Loading', stage: 'LOADING' as StageType },
    { code: 'IT', nameUz: 'IT', nameRu: 'IT', nameEn: 'IT', stage: null },
  ];
  for (const d of departments) {
    await prisma.department.upsert({ where: { code: d.code }, create: d, update: d });
  }
  const dept = Object.fromEntries((await prisma.department.findMany()).map((d) => [d.code, d]));
  console.log(`  departments: ${departments.length}`);

  // ─── Roles ───
  const roles = [
    { code: 'SUPER_ADMIN', name: 'Super Admin', description: 'To‘liq huquq', permissions: ALL, isSystem: true },
    {
      code: 'ADMIN', name: 'Administrator', description: 'Super Admin bergan huquqlar',
      permissions: [
        ...READ_ONLY, 'orders.create', 'orders.update', 'orders.delete',
        'models.create', 'models.update', 'models.delete',
        'warehouse.create', 'warehouse.update', 'clients.read', 'clients.create', 'clients.update',
        'users.read', 'users.create', 'users.update', 'roles.read', 'departments.read',
        'tasks.create', 'tasks.update', 'tasks.delete', 'plans.update', 'schedule.update', 'audit.read',
        ...STAGES.flatMap((s) => stagePerms(s.toLowerCase())),
      ],
      isSystem: true,
    },
    {
      code: 'PLANNING', name: 'Rejalashtirish menejeri', description: 'Zakaz va model boshqaruvi',
      permissions: [
        ...READ_ONLY, 'orders.create', 'orders.update', 'models.create', 'models.update',
        'clients.read', 'clients.create', 'schedule.update', 'tasks.create', 'tasks.update', 'plans.update', 'users.read',
      ],
      isSystem: true,
    },
    {
      code: 'PRODUCTION_MANAGER', name: 'Ishlab chiqarish mudiri', description: 'Barcha bosqichlarni boshqaradi',
      permissions: [...READ_ONLY, ...STAGES.flatMap((s) => stagePerms(s.toLowerCase())), 'tasks.create', 'tasks.update', 'plans.update', 'users.read', 'schedule.update'],
      isSystem: true,
    },
    {
      code: 'WAREHOUSE_MANAGER', name: 'Ombor mudiri', description: 'Ombor operatsiyalari',
      permissions: ['dashboard.read', 'warehouse.read', 'warehouse.create', 'warehouse.update', 'orders.read', 'models.read', 'reports.read', 'tasks.read', 'tasks.update'],
      isSystem: true,
    },
    ...STAGES.map((s) => ({
      code: `${s}_MASTER`,
      name: { CUTTING: 'Kesim mas’uli', SEWING: 'Tikuv mas’uli', WASHING: 'Varka mas’uli', LASER: 'Lazer mas’uli', PACKING: 'Upakovka mas’uli', LOADING: 'Ortish mas’uli' }[s],
      description: `${s} bosqichi`,
      permissions: ['dashboard.read', 'orders.read', 'models.read', 'tasks.read', 'tasks.create', 'tasks.update', 'plans.read', ...stagePerms(s.toLowerCase())],
      isSystem: true,
    })),
    {
      code: 'EMPLOYEE', name: 'Xodim', description: 'Faqat o‘z ishlari',
      permissions: ['dashboard.read', 'tasks.read', 'tasks.create', 'tasks.update', 'plans.read', 'orders.read'],
      isSystem: true,
    },
  ];
  for (const r of roles) {
    await prisma.role.upsert({ where: { code: r.code }, create: r as any, update: { name: r.name, description: r.description, permissions: r.permissions } });
  }
  const role = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.code, r]));
  console.log(`  roles: ${roles.length}`);

  // ─── Users ───
  const superPassword = process.env.SEED_SUPERADMIN_PASSWORD || 'Admin!2026';
  const defaultPassword = 'F17erp!2026';

  const users = [
    { login: process.env.SEED_SUPERADMIN_LOGIN || 'bobur', password: superPassword, firstName: 'Bobur', lastName: 'Anvarov', phone: '+998997162616', role: 'SUPER_ADMIN', dept: 'ADMIN', position: 'Rahbar', lang: 'UZ' },
    { login: 'admin', password: superPassword, firstName: 'Komiljon', lastName: 'Toxirov', phone: '+998901110001', role: 'SUPER_ADMIN', dept: 'ADMIN', position: 'Rahbar', lang: 'UZ' },
    { login: 'planning', password: defaultPassword, firstName: 'Susana', lastName: 'Ishikova', phone: '+998901110002', role: 'PLANNING', dept: 'PLANNING', position: 'Planlashtirish menejeri', lang: 'RU' },
    { login: 'director', password: defaultPassword, firstName: 'Ali', lastName: 'Yildirim', phone: '+998901110003', role: 'PRODUCTION_MANAGER', dept: 'PRODUCTION', position: 'Ishlab chiqarish mudiri', lang: 'RU' },
    { login: 'kesim', password: defaultPassword, firstName: 'Abduhamid', lastName: 'Mamatov', phone: '+998901110004', role: 'CUTTING_MASTER', dept: 'CUTTING', position: 'Kesim mas’uli', lang: 'UZ' },
    { login: 'tikuv', password: defaultPassword, firstName: 'Oygul', lastName: 'Mirzaboyeva', phone: '+998901110005', role: 'SEWING_MASTER', dept: 'SEWING', position: 'Tikuv mas’uli', lang: 'UZ' },
    { login: 'varka', password: defaultPassword, firstName: 'Vedat', lastName: 'Bey', phone: '+998901110006', role: 'WASHING_MASTER', dept: 'WASHING', position: 'Varka mas’uli', lang: 'RU' },
    { login: 'lazer', password: defaultPassword, firstName: 'Ahmadali', lastName: 'Barakabayev', phone: '+998901110007', role: 'LASER_MASTER', dept: 'LASER', position: 'Lazer operatori', lang: 'UZ' },
    { login: 'upakovka', password: defaultPassword, firstName: 'Mashhura', lastName: 'Inagamova', phone: '+998901110008', role: 'PACKING_MASTER', dept: 'PACKING', position: 'Upakovka mas’uli', lang: 'UZ' },
    { login: 'ortish', password: defaultPassword, firstName: 'Sardor', lastName: 'Qodirov', phone: '+998901110009', role: 'LOADING_MASTER', dept: 'LOADING', position: 'Logistika', lang: 'UZ' },
    { login: 'ombor', password: defaultPassword, firstName: 'Dilnoza', lastName: 'Yusupova', phone: '+998901110010', role: 'WAREHOUSE_MANAGER', dept: 'WAREHOUSE', position: 'Ombor mudiri', lang: 'UZ' },
  ];

  for (const u of users) {
    const data = {
      firstName: u.firstName, lastName: u.lastName, phone: u.phone, login: u.login,
      passwordHash: await hash(u.password),
      position: u.position, lang: u.lang as Lang,
      roleId: role[u.role].id, departmentId: dept[u.dept].id,
    };
    await prisma.user.upsert({
      where: { login: u.login },
      create: data,
      update: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        passwordHash: data.passwordHash,
        position: data.position,
        roleId: data.roleId,
        departmentId: data.departmentId,
      },
    });
  }
  const userByLogin = Object.fromEntries((await prisma.user.findMany()).map((u) => [u.login, u]));
  console.log(`  users: ${users.length} (super admin: ${users[0].login} / ${superPassword})`);

  // ─── Clients ───
  const clients = [
    { code: 'ZARINA', name: 'ZARINA (Melon Fashion Group)', contact: 'Melon Fashion Group, Sankt-Peterburg', phone: '+7 812 000 0000' },
    { code: 'BEFREE', name: 'befree (Melon Fashion Group)', contact: 'Melon Fashion Group' },
    { code: 'LOVE', name: 'LOVE REPUBLIC', contact: 'Melon Fashion Group' },
  ];
  for (const c of clients) await prisma.client.upsert({ where: { code: c.code }, create: c, update: c });
  const client = Object.fromEntries((await prisma.client.findMany()).map((c) => [c.code, c]));
  console.log(`  clients: ${clients.length}`);

  // ─── Models ───
  const models = [
    { code: 'ZR-104', name: 'Straight Fit Denim', category: 'Jeans', season: 'SS-26', color: 'Indigo', fabric: 'Denim 12.5 oz, 98% cotton / 2% elastane', lining: 'Pocket twill 100% cotton', cost: 84000, clientCode: 'ZARINA' },
    { code: 'ZR-118', name: 'Mom Fit High Waist', category: 'Jeans', season: 'SS-26', color: 'Light Blue', fabric: 'Denim 11 oz, 100% cotton', lining: 'Pocket twill', cost: 79000, clientCode: 'ZARINA' },
    { code: 'ZR-131', name: 'Wide Leg Denim', category: 'Jeans', season: 'FW-26', color: 'Black', fabric: 'Denim 13 oz rigid', lining: 'Pocket twill', cost: 92000, clientCode: 'ZARINA' },
    { code: 'ZR-142', name: 'Denim Jacket Oversize', category: 'Outerwear', season: 'FW-26', color: 'Ecru', fabric: 'Denim 14 oz', lining: '—', cost: 128000, clientCode: 'ZARINA' },
    { code: 'BF-207', name: 'Skinny Fit Stretch', category: 'Jeans', season: 'SS-26', color: 'Dark Blue', fabric: 'Denim 10.5 oz stretch', lining: 'Pocket twill', cost: 71000, clientCode: 'BEFREE' },
  ];
  const sizeGrid = ['26', '27', '28', '29', '30', '31', '32'];

  for (const m of models) {
    const { clientCode, cost, ...rest } = m;
    const created = await prisma.productModel.upsert({
      where: { code: m.code },
      create: { ...rest, cost: new Prisma.Decimal(cost), clientId: client[clientCode].id },
      update: { ...rest, cost: new Prisma.Decimal(cost), clientId: client[clientCode].id },
    });
    await prisma.modelSize.deleteMany({ where: { modelId: created.id } });
    await prisma.modelSize.createMany({
      data: sizeGrid.map((size, i) => ({ modelId: created.id, size, qty: [100, 150, 250, 300, 200, 150, 100][i] })),
    });
    await prisma.modelColor.deleteMany({ where: { modelId: created.id } });
    await prisma.modelColor.createMany({
      data: [
        { modelId: created.id, name: 'Indigo', hex: '#22345c' },
        { modelId: created.id, name: 'Washed Blue', hex: '#7b8fae' },
        { modelId: created.id, name: 'Black', hex: '#1c1c1e' },
      ],
    });
    await prisma.accessory.deleteMany({ where: { modelId: created.id } });
    await prisma.accessory.createMany({
      data: [
        { modelId: created.id, name: 'Tugma (shank button)', color: 'Antique brass', size: '17 mm', code: 'BTN-17-AB', qty: 1 },
        { modelId: created.id, name: 'Zamok (YKK)', color: 'Antique brass', size: '14 cm', code: 'ZIP-YKK-14', qty: 1 },
        { modelId: created.id, name: 'Zayolka (rivet)', color: 'Antique brass', size: '9 mm', code: 'RIV-9-AB', qty: 6 },
        { modelId: created.id, name: 'Etiketka (main label)', color: 'Woven', size: '—', code: 'LBL-MAIN', qty: 1 },
        { modelId: created.id, name: 'Care label', color: 'Satin', size: '—', code: 'LBL-CARE', qty: 1 },
      ],
    });
  }
  const model = Object.fromEntries((await prisma.productModel.findMany()).map((m) => [m.code, m]));
  console.log(`  models: ${models.length}`);

  // ─── Materials ───
  const materials = [
    { code: 'FBR-1250', name: 'Denim 12.5 oz Indigo', category: 'Mato', unit: 'm', quantity: 8400, minStock: 1500, supplier: 'Bursa Tekstil', price: 42000 },
    { code: 'FBR-1100', name: 'Denim 11 oz Light Blue', category: 'Mato', unit: 'm', quantity: 3100, minStock: 1200, supplier: 'Bursa Tekstil', price: 38000 },
    { code: 'FBR-1300', name: 'Denim 13 oz Black Rigid', category: 'Mato', unit: 'm', quantity: 950, minStock: 1000, supplier: 'Kahramanmaras Denim', price: 46000 },
    { code: 'FBR-1400', name: 'Denim 14 oz Ecru', category: 'Mato', unit: 'm', quantity: 2200, minStock: 800, supplier: 'Kahramanmaras Denim', price: 51000 },
    { code: 'TWL-001', name: 'Pocket twill 100% cotton', category: 'Astar', unit: 'm', quantity: 5600, minStock: 1000, supplier: 'Toshkent To‘qimachilik', price: 9000 },
    { code: 'BTN-17-AB', name: 'Tugma 17mm Antique Brass', category: 'Aksesuar', unit: 'dona', quantity: 42000, minStock: 10000, supplier: 'YKK', price: 900 },
    { code: 'ZIP-YKK-14', name: 'Zamok YKK 14cm', category: 'Aksesuar', unit: 'dona', quantity: 18500, minStock: 8000, supplier: 'YKK', price: 3400 },
    { code: 'RIV-9-AB', name: 'Zayolka 9mm Antique Brass', category: 'Aksesuar', unit: 'dona', quantity: 96000, minStock: 30000, supplier: 'YKK', price: 320 },
    { code: 'LBL-MAIN', name: 'Etiketka ZARINA main', category: 'Aksesuar', unit: 'dona', quantity: 24000, minStock: 8000, supplier: 'Label Print', price: 700 },
    { code: 'LBL-CARE', name: 'Care label', category: 'Aksesuar', unit: 'dona', quantity: 6200, minStock: 8000, supplier: 'Label Print', price: 450 },
    { code: 'THR-402', name: 'Ip 402 Gold', category: 'Ip', unit: 'kg', quantity: 320, minStock: 100, supplier: 'Coats', price: 78000 },
    { code: 'PKG-BOX', name: 'Karobka 60x40x40', category: 'Qadoq', unit: 'dona', quantity: 1450, minStock: 500, supplier: 'Karton Servis', price: 12000 },
    { code: 'PKG-BAG', name: 'Polietilen paket', category: 'Qadoq', unit: 'dona', quantity: 31000, minStock: 10000, supplier: 'Karton Servis', price: 350 },
  ];
  for (const m of materials) {
    const { quantity, minStock, price, ...rest } = m;
    const status = quantity <= 0 ? 'OUT' : quantity <= minStock ? 'LOW' : 'OK';
    const created = await prisma.material.upsert({
      where: { code: m.code },
      create: { ...rest, stock: new Prisma.Decimal(quantity), minStock: new Prisma.Decimal(minStock), price: new Prisma.Decimal(price), status },
      update: { ...rest, stock: new Prisma.Decimal(quantity), minStock: new Prisma.Decimal(minStock), price: new Prisma.Decimal(price), status },
    });
    const hasTx = await prisma.stockTransaction.count({ where: { materialId: created.id } });
    if (!hasTx) {
      await prisma.stockTransaction.create({
        data: {
          materialId: created.id, op: 'INVENTORY',
          qty: new Prisma.Decimal(quantity), balance: new Prisma.Decimal(quantity),
          userId: userByLogin['ombor'].id, note: 'Boshlang‘ich qoldiq (seed)',
        },
      });
    }
  }
  console.log(`  materials: ${materials.length}`);

  // ─── Orders + production stages ───
  const today = new Date();
  const day = (n: number) => {
    const d = new Date(today);
    d.setDate(today.getDate() + n);
    d.setHours(12, 0, 0, 0);
    return d;
  };

  const orders = [
    { number: 'ZR-2026-041', modelCode: 'ZR-104', clientCode: 'ZARINA', qty: 1200, orderDate: day(-42), deadline: day(-2), priority: 'HIGH', progress: [1200, 1200, 1200, 1200, 1200, 900] },
    { number: 'ZR-2026-044', modelCode: 'ZR-118', clientCode: 'ZARINA', qty: 1500, orderDate: day(-35), deadline: day(6), priority: 'URGENT', progress: [1500, 1350, 1100, 900, 620, 0] },
    { number: 'ZR-2026-047', modelCode: 'ZR-131', clientCode: 'ZARINA', qty: 900, orderDate: day(-28), deadline: day(12), priority: 'NORMAL', progress: [900, 720, 480, 300, 0, 0] },
    { number: 'ZR-2026-051', modelCode: 'ZR-142', clientCode: 'ZARINA', qty: 600, orderDate: day(-18), deadline: day(20), priority: 'NORMAL', progress: [520, 310, 120, 0, 0, 0] },
    { number: 'BF-2026-012', modelCode: 'BF-207', clientCode: 'BEFREE', qty: 2000, orderDate: day(-12), deadline: day(28), priority: 'HIGH', progress: [1100, 640, 220, 0, 0, 0] },
    { number: 'ZR-2026-055', modelCode: 'ZR-104', clientCode: 'ZARINA', qty: 800, orderDate: day(-5), deadline: day(34), priority: 'NORMAL', progress: [240, 0, 0, 0, 0, 0] },
    { number: 'ZR-2026-058', modelCode: 'ZR-118', clientCode: 'ZARINA', qty: 1000, orderDate: day(-1), deadline: day(45), priority: 'LOW', progress: [0, 0, 0, 0, 0, 0] },
  ];

  const stageOwner: Record<StageType, string> = {
    CUTTING: 'kesim', SEWING: 'tikuv', WASHING: 'varka', LASER: 'lazer', PACKING: 'upakovka', LOADING: 'ortish',
  };

  for (const o of orders) {
    const existing = await prisma.order.findUnique({ where: { number: o.number } });
    if (existing) continue;

    const created = await prisma.order.create({
      data: {
        number: o.number,
        qty: o.qty,
        orderDate: o.orderDate,
        deadline: o.deadline,
        priority: o.priority as any,
        status: 'NEW',
        clientId: client[o.clientCode].id,
        modelId: model[o.modelCode].id,
        responsibleId: userByLogin['planning'].id,
        createdById: userByLogin['admin'].id,
        sampleStatus: o.progress[0] > 0 ? 'APPROVED' : 'PENDING',
        sampleSentAt: o.progress[0] > 0 ? day(-30) : null,
        sampleApprovedAt: o.progress[0] > 0 ? day(-26) : null,
        sizes: {
          create: sizeGrid.map((size, i) => ({
            size,
            qty: Math.round(o.qty * [0.08, 0.12, 0.18, 0.22, 0.18, 0.12, 0.1][i]),
          })),
        },
      },
    });

    let orderStatus: string = 'NEW';
    for (let i = 0; i < STAGES.length; i++) {
      const stage = STAGES[i];
      const done = o.progress[i];
      const defect = done > 0 ? Math.round(done * (0.004 + i * 0.0015)) : 0;
      const status = done === 0 ? (i === 0 || o.progress[i - 1] > 0 ? 'WAITING' : 'NOT_STARTED') : done >= o.qty ? 'COMPLETED' : 'IN_PROGRESS';

      const st = await prisma.orderStage.create({
        data: {
          orderId: created.id,
          stage,
          planQty: o.qty,
          doneQty: done,
          defectQty: defect,
          status: status as any,
          responsibleId: userByLogin[stageOwner[stage]].id,
          startDate: done > 0 ? day(-30 + i * 3) : null,
          endDate: done >= o.qty ? day(-28 + i * 3) : null,
          deadline: day(-30 + i * 5 + 8),
        },
      });

      // A few realistic operation records so history and charts are populated.
      if (done > 0) {
        const chunks = Math.min(5, Math.max(1, Math.round(done / 250)));
        const per = Math.floor(done / chunks);
        for (let c = 0; c < chunks; c++) {
          const qty = c === chunks - 1 ? done - per * (chunks - 1) : per;
          await prisma.stageEntry.create({
            data: {
              orderStageId: st.id,
              qty,
              defectQty: c === 0 ? defect : 0,
              date: day(-20 + i * 2 + c),
              userId: userByLogin[stageOwner[stage]].id,
              source: c % 2 === 0 ? 'TELEGRAM' : 'WEB',
              note: c === 0 ? 'Smena 1' : null,
            },
          });
        }
        if (defect > 0) {
          await prisma.defect.create({
            data: {
              orderId: created.id, stage, type: ['Tikuv braki', 'Mato nuqsoni', 'Rang farqi', 'Lazer nuqsoni', 'Qadoq nuqsoni', 'Transport shikasti'][i],
              qty: defect, reason: 'QC tekshiruvida aniqlangan',
              userId: userByLogin[stageOwner[stage]].id, date: day(-18 + i * 2),
            },
          });
        }
        orderStatus = 'IN_PRODUCTION';
      }
      if (stage === 'PACKING' && done >= o.qty) orderStatus = 'READY';
      if (stage === 'LOADING' && done > 0 && done < o.qty) orderStatus = 'LOADING';
      if (stage === 'LOADING' && done >= o.qty) orderStatus = 'COMPLETED';
    }

    if (o.deadline < today && !['COMPLETED', 'CANCELLED'].includes(orderStatus)) orderStatus = 'DELAYED';
    await prisma.order.update({ where: { id: created.id }, data: { status: orderStatus as any } });

    if (o.progress[5] > 0) {
      await prisma.shipment.create({
        data: {
          orderId: created.id,
          vehicle: 'Isuzu NPR 01 A 777 AA',
          driver: 'Rustam Ergashev',
          driverPhone: '+998901234567',
          qty: o.progress[5],
          boxCount: Math.ceil(o.progress[5] / 40),
          loadingDate: day(-3),
          status: o.progress[5] >= o.qty ? 'SHIPPED' : 'LOADING',
          trackNo: 'TR-' + created.number,
        },
      });
    }
  }
  console.log(`  orders: ${orders.length} (with 6 stages each)`);

  // ─── Tasks ───
  const taskTemplates = [
    { title: 'Kesim: ZR-2026-044 partiyasi', stage: 'CUTTING' as StageType, login: 'kesim' },
    { title: 'Tikuv liniyasini sozlash', stage: 'SEWING' as StageType, login: 'tikuv' },
    { title: 'Varka retsepti #12 sinovi', stage: 'WASHING' as StageType, login: 'varka' },
    { title: 'Lazer dizayn kodini yangilash', stage: 'LASER' as StageType, login: 'lazer' },
    { title: 'Karobkalarni markirovkalash', stage: 'PACKING' as StageType, login: 'upakovka' },
    { title: 'Mashina yuklash jadvalini tasdiqlash', stage: 'LOADING' as StageType, login: 'ortish' },
    { title: 'Ombor inventarizatsiyasi', stage: null, login: 'ombor' },
  ];
  const existingTasks = await prisma.task.count();
  if (existingTasks === 0) {
    for (let d = 0; d < 10; d++) {
      for (const tpl of taskTemplates) {
        const date = day(-d);
        const done = d > 0 ? Math.random() > 0.25 : Math.random() > 0.6;
        await prisma.task.create({
          data: {
            title: `${tpl.title}`,
            description: 'Kunlik ishlab chiqarish vazifasi',
            date,
            status: done ? 'DONE' : d === 0 ? 'IN_PROGRESS' : 'TODO',
            finishedAt: done ? date : null,
            userId: userByLogin[tpl.login].id,
            createdById: userByLogin['director'].id,
            stage: tpl.stage,
          },
        });
      }
    }
    console.log(`  tasks: ${taskTemplates.length * 10}`);
  }

  // ─── Plans ───
  for (const login of ['kesim', 'tikuv', 'varka', 'lazer', 'upakovka', 'ortish']) {
    const u = userByLogin[login];
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(start); end.setDate(start.getDate() + 1);
    await prisma.plan.upsert({
      where: { userId_period_dateFrom: { userId: u.id, period: 'DAILY', dateFrom: start } },
      create: { userId: u.id, period: 'DAILY', dateFrom: start, dateTo: end, targetQty: 250 },
      update: { targetQty: 250 },
    });
  }

  await prisma.notification.deleteMany({ where: { type: 'SEED' } });
  await prisma.notification.create({
    data: { type: 'SEED', title: 'ERP tizimi ishga tushdi', body: 'Demo ma’lumotlar yuklandi', link: '/dashboard' },
  });

  console.log('✔ Seed complete.');
  console.log('');
  console.log('  Login:');
  for (const u of users) console.log(`    ${u.login.padEnd(10)} ${u.password.padEnd(14)} ${u.position}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
