import { searchCustomers, type CustomerSearchResult } from './db/customers';
import { searchBills, type GlobalBillHit } from './db/bills';
import { searchComplaints, type GlobalComplaintHit } from './db/complaints';

export type SearchKind = 'customer' | 'bill' | 'complaint';

export type SearchResult = {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  meta?: string;
  page: 'customers' | 'billing' | 'complaints';
  focusId?: string; // for bills/complaints focus
};

export async function globalSearch(query: string, max = 12): Promise<SearchResult[]> {
  const q = (query || '').trim();
  if (q.length < 2) return [];

  const [custHits, billHits, compHits] = await Promise.all([
    searchCustomers(q, 6).catch(() => [] as CustomerSearchResult[]),
    searchBills(q, 5).catch(() => [] as GlobalBillHit[]),
    searchComplaints(q, 5).catch(() => [] as GlobalComplaintHit[]),
  ]);

  const results: SearchResult[] = [];

  custHits.forEach((c) => {
    results.push({
      kind: 'customer',
      id: c.id,
      title: c.full_name,
      subtitle: [c.customer_code, c.phone].filter(Boolean).join(' • '),
      meta: c.status || undefined,
      page: 'customers',
    });
  });

  billHits.forEach((b) => {
    results.push({
      kind: 'bill',
      id: b.id,
      title: `${b.customerName} — ${b.month}`,
      subtitle: `Rs ${b.amount} • ${b.status}${b.receiptNo ? ' • ' + b.receiptNo : ''}`,
      meta: b.customerCode || undefined,
      page: 'billing',
      focusId: b.id,
    });
  });

  compHits.forEach((c) => {
    results.push({
      kind: 'complaint',
      id: c.id,
      title: `${c.complaint_code} — ${c.customerName}`,
      subtitle: c.issue ? c.issue.slice(0, 60) : c.status,
      meta: `${c.status} ${c.priority}`,
      page: 'complaints',
      focusId: c.id,
    });
  });

  // simple dedupe by id+kind
  const seen = new Set<string>();
  const deduped = results.filter(r => {
    const k = r.kind + ':' + r.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return deduped.slice(0, max);
}
