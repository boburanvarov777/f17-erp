export type Lang = 'uz' | 'ru' | 'en';

export type StageType = 'CUTTING' | 'SEWING' | 'WASHING' | 'LASER' | 'PACKING' | 'LOADING';
export type StageStatus = 'NOT_STARTED' | 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED' | 'BLOCKED';
export type OrderStatus = 'NEW' | 'CONFIRMED' | 'IN_PRODUCTION' | 'READY' | 'LOADING' | 'COMPLETED' | 'CANCELLED' | 'DELAYED';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type UserStatus = 'ACTIVE' | 'BLOCKED' | 'ARCHIVED';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
export type StockOp = 'IN' | 'OUT' | 'RESERVE' | 'RETURN' | 'INVENTORY';

export const STAGES: StageType[] = ['CUTTING', 'SEWING', 'WASHING', 'LASER', 'PACKING', 'LOADING'];

export const STAGE_SLUG: Record<StageType, string> = {
  CUTTING: 'cutting', SEWING: 'sewing', WASHING: 'washing',
  LASER: 'laser', PACKING: 'packing', LOADING: 'loading',
};

export interface Paginated<T> { items: T[]; total: number; page: number; limit: number; pages: number; }

export interface Department { id: string; code: string; nameUz: string; nameRu: string; nameEn: string; stage?: StageType | null; _count?: { users: number }; }
export interface Role { id: string; code: string; name: string; description?: string; isSystem: boolean; permissions: string[]; _count?: { users: number }; }

export interface CurrentUser {
  id: string; firstName: string; lastName: string; fullName: string;
  login: string; phone: string; email?: string; avatar?: string; position?: string;
  lang: 'UZ' | 'RU' | 'EN'; status: UserStatus; telegramId?: string | null;
  role: { id: string; code: string; name: string } | null;
  permissions: string[];
  department: { id: string; code: string; name: string; stage?: StageType | null } | null;
}

export interface AuthResponse { accessToken: string; refreshToken: string; expiresIn: number; user: CurrentUser; }

export interface User {
  id: string; firstName: string; lastName: string; phone: string; login: string;
  email?: string; avatar?: string; note?: string; employeeId?: string; position?: string;
  status: UserStatus; lang: 'UZ' | 'RU' | 'EN'; telegramId?: string | null; telegramUsername?: string;
  lastLoginAt?: string; createdAt: string;
  department?: Department | null; role?: Role | null;
}

export interface Client { id: string; code: string; name: string; contact?: string; phone?: string; note?: string; _count?: { orders: number; models: number }; }

export interface ModelSize { id?: string; size: string; qty: number; }
export interface ModelColor { id?: string; name: string; hex?: string; photo?: string; }
export interface Accessory { id?: string; name: string; color?: string; size?: string; code?: string; qty?: number; photo?: string; }
export interface ModelFile { id: string; name: string; url: string; mime?: string; size?: number; }
export interface ModelPhoto { id: string; url: string; sortOrder?: number; }

export interface ProductModel {
  id: string; code: string; name: string; category?: string; season?: string; color?: string;
  fabric?: string; lining?: string; cost?: string | number; description?: string; photo?: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  client?: Client | null;
  sizes?: ModelSize[]; colors?: ModelColor[]; accessories?: Accessory[]; files?: ModelFile[]; photos?: ModelPhoto[];
  orders?: Order[]; _count?: { orders: number };
}

export interface OrderStage {
  id: string; orderId: string; stage: StageType;
  planQty: number; doneQty: number; defectQty: number; status: StageStatus;
  remainingQty?: number; progress?: number; defectRate?: number;
  responsible?: { id: string; firstName: string; lastName: string } | null;
  startDate?: string; endDate?: string; deadline?: string; meta?: Record<string, unknown>;
  entries?: StageEntry[]; order?: Order;
}

export interface StageEntry {
  id: string; qty: number; defectQty: number; date: string; note?: string;
  source: 'WEB' | 'TELEGRAM' | 'MINIAPP'; cancelled: boolean;
  user?: { id: string; firstName: string; lastName: string } | null;
  meta?: Record<string, unknown>;
}

export interface Defect {
  id: string; orderId: string; stage: StageType; type: string; qty: number;
  reason?: string; comment?: string; date: string;
  user?: { firstName: string; lastName: string } | null;
}

export interface Order {
  id: string; number: string; qty: number; orderDate: string; deadline: string;
  priority: Priority; status: OrderStatus; note?: string;
  sampleStatus?: string; sampleSentAt?: string; sampleApprovedAt?: string; sampleNote?: string;
  client?: Client | null; model?: ProductModel | null;
  responsible?: { id: string; firstName: string; lastName: string } | null;
  createdBy?: { id: string; firstName: string; lastName: string } | null;
  sizes?: { id?: string; size: string; color?: string; qty: number }[];
  stages?: OrderStage[]; defects?: Defect[]; shipments?: Shipment[]; comments?: OrderComment[];
  completedQty?: number; remainingQty?: number; progress?: number; defectQty?: number; isLate?: boolean;
  archivedAt?: string | null;
}

export interface OrderComment { id: string; text: string; createdAt: string; user?: { firstName: string; lastName: string; avatar?: string } | null; }

export interface Shipment {
  id: string; orderId: string; vehicle?: string; driver?: string; driverPhone?: string;
  qty: number; boxCount: number; loadingDate?: string;
  status: 'READY' | 'LOADING' | 'LOADED' | 'SHIPPED' | 'COMPLETED';
  document?: string; trackNo?: string; note?: string; order?: Order;
}

export interface Material {
  id: string; code: string; name: string; category?: string; unit: string;
  stock: number; reserved: number; available: number; minStock: number;
  supplier?: string; price?: number | null; status: 'OK' | 'LOW' | 'OUT';
}

export interface StockTransaction {
  id: string; op: StockOp; qty: number; balance: number; note?: string; createdAt: string;
  material?: { code: string; name: string; unit: string };
  user?: { firstName: string; lastName: string };
  order?: { number: string };
}

export interface Task {
  id: string; title: string; description?: string; date: string;
  startedAt?: string; finishedAt?: string; status: TaskStatus; note?: string; qty?: number;
  stage?: StageType | null;
  user?: { id: string; firstName: string; lastName: string; avatar?: string };
  order?: { id: string; number: string } | null;
}

export interface PlanModelBreakdown {
  orderId: string; orderNumber: string; modelCode: string; modelName?: string | null;
  stage: StageType; qty: number; defectQty: number; targetQty?: number;
}

export interface PlanView {
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY'; dateFrom: string; dateTo: string;
  tasks: Task[]; total: number; done: number; overdue: number; progress: number;
  targetQty: number; producedQty: number; entries: StageEntry[];
  byModel?: PlanModelBreakdown[];
  lines?: PlanModelBreakdown[];
}

export interface NotificationItem {
  id: string; type: string; title: string; body?: string; link?: string;
  isRead: boolean; createdAt: string;
}

export interface AuditLog {
  id: string; action: string; entity?: string; entityId?: string;
  oldValue?: unknown; newValue?: unknown; ip?: string; device?: string;
  telegramUsername?: string | null; createdAt: string;
  user?: { id: string; firstName: string; lastName: string; login: string } | null;
}

export interface DashboardData {
  kpis: {
    activeOrders: number; totalOrders: number; inProductionQty: number;
    lateOrders: number; readyToLoad: number; shippedQty: number;
    defectQty: number; defectRate: number;
  };
  stages: { stage: StageType; plan: number; done: number; defect: number; remaining: number; progress: number; orders: number }[];
  recent: { id: string; at: string; qty: number; defectQty: number; source: string; stage: StageType; progress: number; order: { id: string; number: string; model?: { code: string } }; user: string }[];
  upcoming: { id: string; number: string; qty: number; deadline: string; status: OrderStatus; priority: Priority; client?: string; model?: string; daysLeft: number; isLate: boolean; progress: number }[];
  trend: { date: string; qty: number; defect: number }[];
  defects: { stage: StageType; qty: number; count: number }[];
}

export interface ScheduleRow {
  id: string; number: string; qty: number; status: OrderStatus; priority: Priority;
  client?: string; model?: string; responsible?: string; start: string; end: string;
  bars: { stage: StageType; start: string; end: string; planQty: number; doneQty: number; status: StageStatus; progress: number }[];
}

export interface GlobalSearchResult {
  orders: Order[]; models: ProductModel[]; clients: Client[];
  materials: Material[]; users: User[];
}
