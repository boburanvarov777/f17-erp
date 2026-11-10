/** What the balance will be after a stock operation — shown live while typing. */
export interface StockPreview {
  stock: number;      // on hand now
  reserved: number;   // reserved now
  available: number;  // stock − reserved
  after: number;      // on hand after the operation
  afterAvailable: number;
  /** OUT / RESERVE larger than what is free. */
  insufficient: boolean;
}

export function stockPreview(
  m: { stock: number | string; reserved?: number | string | null },
  op: string,
  qtyRaw: number | string | null | undefined,
): StockPreview {
  const stock = +m.stock || 0;
  const reserved = +(m.reserved ?? 0) || 0;
  const qty = Math.max(0, +(qtyRaw ?? 0) || 0);
  const available = stock - reserved;
  let after = stock;
  let afterReserved = reserved;
  switch (op) {
    case 'IN': after = stock + qty; break;
    case 'OUT': after = stock - qty; break;
    case 'RESERVE': afterReserved = reserved + qty; break;
    case 'RETURN': after = stock + qty; afterReserved = Math.max(0, reserved - qty); break;
    case 'INVENTORY': after = qty; break;
  }
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return {
    stock: r(stock), reserved: r(reserved), available: r(available),
    after: r(after), afterAvailable: r(after - afterReserved),
    insufficient: (op === 'OUT' || op === 'RESERVE') && qty > available,
  };
}
