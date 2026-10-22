// ======================================================
// File Name : sapAdapter.ts
// Purpose   : The SAP "adapter" — the ONLY file that knows what SAP data
//             looks like and how it turns into a ledger Addition.
//               1. fetchSapRecords : gets acquisition records from SAP.
//                  - SAP_BASE_URL set  -> LIVE: GET <base><path>?from&to
//                  - SAP_BASE_URL empty -> MOCK: built-in sample records
//               2. mapToAddition   : SAP record -> { assetNumber, fields }
//                  in the exact shape the Addition event expects.
//             The record format below is a SAMPLE structure, not SAP's real
//             API. When the client shares their real SAP response, only this
//             file needs to change — the page, duplicate check and posting
//             all stay the same.
// ======================================================

import { loadAssetClasses } from '../../db/repo.js';
import { listAssetTypes } from '../assetTypeConfig.js';

export interface SapRecord {
  documentId: string;      // unique SAP document no. — used to stop double imports
  assetNumber: string;
  companyCode: string;
  assetClass: string;      // must match a name in Configuration -> Asset Classes
  description: string;
  acquisitionCost: number;
  capitalizationDate: string; // YYYY-MM-DD
}

export type SapMode = 'mock' | 'live';

export function sapMode(): SapMode {
  return process.env.SAP_BASE_URL?.trim() ? 'live' : 'mock';
}

// Sample data for demos/tests until the real SAP API is available.
// The last one has an asset class that does not exist, to show an "invalid" row.
const MOCK_RECORDS: SapRecord[] = [
  { documentId: 'SAP-DOC-5001', assetNumber: 'SAP-10001', companyCode: '5B', assetClass: '00.12',  description: 'Laptops (50 units)',  acquisitionCost: 62000,  capitalizationDate: '2026-02-10' },
  { documentId: 'SAP-DOC-5002', assetNumber: 'SAP-10002', companyCode: 'R9', assetClass: '00.11',  description: 'CNC machine',         acquisitionCost: 215000, capitalizationDate: '2026-04-22' },
  { documentId: 'SAP-DOC-5003', assetNumber: 'SAP-10003', companyCode: '2D', assetClass: '00.13',  description: 'Office furniture',    acquisitionCost: 38500,  capitalizationDate: '2026-07-08' },
  { documentId: 'SAP-DOC-5004', assetNumber: 'SAP-10004', companyCode: '5B', assetClass: '00.241', description: 'Delivery van',        acquisitionCost: 54000,  capitalizationDate: '2026-09-14' },
  { documentId: 'SAP-DOC-5005', assetNumber: 'SAP-10005', companyCode: 'GD', assetClass: 'ZZ.99',  description: 'Unmapped asset class', acquisitionCost: 12000, capitalizationDate: '2026-09-30' }
];

export async function fetchSapRecords(range: { from?: string; to?: string }): Promise<SapRecord[]> {
  if (sapMode() === 'mock') {
    return MOCK_RECORDS.filter((r) =>
      (!range.from || r.capitalizationDate >= range.from) && (!range.to || r.capitalizationDate <= range.to));
  }

  const url = new URL(`${process.env.SAP_BASE_URL!.replace(/\/+$/, '')}${process.env.SAP_ASSETS_PATH || '/assets'}`);
  if (range.from) url.searchParams.set('from', range.from);
  if (range.to) url.searchParams.set('to', range.to);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (process.env.SAP_API_TOKEN) headers.Authorization = `Bearer ${process.env.SAP_API_TOKEN}`;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`SAP responded ${res.status} ${res.statusText}`);
  const body = (await res.json()) as unknown;
  const list = Array.isArray(body) ? body : (body as { records?: unknown }).records;
  if (!Array.isArray(list)) throw new Error('SAP response was not a list of records');
  return list as SapRecord[];
}

// ---------- mapping SAP record -> Addition fields ----------

const QUARTERS = ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Q4 (Oct–Dec)'];
const TABLE_YEARS = [3, 5, 7, 10, 15, 20];

function lastDayOfMonth(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export type MapResult =
  | { ok: true; assetNumber: string; fields: Record<string, unknown> }
  | { ok: false; error: string };

export async function buildMapper() {
  const classes = await loadAssetClasses();
  const types = listAssetTypes();

  return function mapToAddition(rec: SapRecord): MapResult {
    if (!rec.assetNumber?.trim()) return { ok: false, error: 'Missing asset number' };
    if (!rec.documentId?.trim()) return { ok: false, error: 'Missing SAP document id' };
    if (!(Number(rec.acquisitionCost) > 0)) return { ok: false, error: 'Acquisition cost must be greater than 0' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.capitalizationDate ?? '')) return { ok: false, error: 'Capitalization date must be YYYY-MM-DD' };

    const cls = classes.find((c) => c.name === rec.assetClass);
    if (!cls) return { ok: false, error: `Asset class "${rec.assetClass}" is not in Configuration → Asset Classes` };

    const life = /(\d+)\s*years?(?:\s*(\d+)\s*months?)?/i.exec(cls.life);
    const lifeMonths = life ? Number(life[1]) * 12 + Number(life[2] ?? 0) : 0;
    const years = lifeMonths / 12;
    if (!lifeMonths) return { ok: false, error: `Could not read the life of class "${cls.name}" (${cls.life})` };

    // Sample adapter maps personal-property classes only (MACRS 200% DB, half-year).
    if (!cls.propertyType.startsWith('PP')) return { ok: false, error: `Class "${cls.name}" is not personal property — extend the adapter to map it` };
    if (!Number.isInteger(years) || !TABLE_YEARS.includes(years)) return { ok: false, error: `No MACRS table mapped for a ${years}-year life` };

    const assetType = types.find((t) => t.label === `Personal Property ${years}yr MACRS 200% DB (GDS)`);
    if (!assetType) return { ok: false, error: `No asset type configured for a ${years}-year personal property life` };

    const month = Number(rec.capitalizationDate.slice(5, 7));
    return {
      ok: true,
      assetNumber: rec.assetNumber.trim(),
      fields: {
        book: process.env.SAP_DEFAULT_BOOK || 'GAAP',
        company: rec.companyCode,
        assetType: assetType.label,
        assetClass: cls.name,
        propertyType: cls.propertyType,
        method: cls.method,
        ratePct: Number(cls.ratePct),
        cost: Number(rec.acquisitionCost),
        placedInService: rec.capitalizationDate,
        lifeMonths,
        rateTable: `MACRS Table A-1 HY 200% DB — ${years} Year`,
        convention: 'HY (Half-Year)',
        quarter: QUARTERS[Math.floor((month - 1) / 3)],
        bonusPct: Number(cls.bonusPct || 0),
        electOutBonus: false,
        accountingPeriodDate: lastDayOfMonth(rec.capitalizationDate)
      }
    };
  };
}

// ======================================================
// END OF FILE : sapAdapter.ts
// ======================================================
