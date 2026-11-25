import type { StorageLike } from './scheduledTests';

export type LostFoundCategory =
  | 'Electronics'
  | 'Clothing & Outerwear'
  | 'Water Bottles & Gear'
  | 'Bags & Backpacks'
  | 'Keys, IDs & Wallets'
  | 'Books & Stationery'
  | 'Other';

export interface FoundItem {
  id: string;
  title: string;
  category: LostFoundCategory;
  locationFound: string;
  foundAtIso: string;
  staffName: string;
  description: string;
  photoDataUrl?: string;
  status: 'open' | 'claimed';
  claimedBy?: string;
}

export interface MissingReport {
  id: string;
  itemName: string;
  category: LostFoundCategory;
  reporterType: 'student' | 'parent';
  reporterName: string;
  contactInfo: string;
  lastSeenLocation: string;
  lostAtIso: string;
  description: string;
  photoDataUrl?: string;
  status: 'searching' | 'resolved';
}

export interface GeminiMatchSuggestion {
  id: string;
  foundItemId: string;
  missingReportId: string;
  confidencePct: number;
  reason: string;
  visualEvidence: string;
  createdAtIso: string;
}

export const LOST_FOUND_CATEGORIES: readonly LostFoundCategory[] = [
  'Electronics',
  'Clothing & Outerwear',
  'Water Bottles & Gear',
  'Bags & Backpacks',
  'Keys, IDs & Wallets',
  'Books & Stationery',
  'Other',
];

export const FOUND_ITEMS_STORAGE_KEY = 'pummel_facilities_found_items_v1';
export const MISSING_REPORTS_STORAGE_KEY = 'pummel_facilities_missing_reports_v1';
export const GEMINI_MATCHES_STORAGE_KEY = 'pummel_facilities_gemini_matches_v1';

export function parseDataUrlBase64(
  dataUrl?: string
): { mimeType: string; data: string } | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl.trim()
  );
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

export function validateGeminiMatchCandidates(
  rawCandidates: unknown,
  validFoundIds: ReadonlySet<string>,
  validMissingIds: ReadonlySet<string>,
  nowIso: string = new Date().toISOString()
): GeminiMatchSuggestion[] {
  if (!Array.isArray(rawCandidates)) return [];

  const seenPairs = new Set<string>();
  const out: GeminiMatchSuggestion[] = [];

  for (const item of rawCandidates) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const foundItemId = typeof obj.foundItemId === 'string' ? obj.foundItemId.trim() : '';
    const missingReportId =
      typeof obj.missingReportId === 'string' ? obj.missingReportId.trim() : '';
    if (!validFoundIds.has(foundItemId) || !validMissingIds.has(missingReportId)) {
      continue;
    }

    const pairKey = `${foundItemId}::${missingReportId}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const rawConf = typeof obj.confidencePct === 'number' ? obj.confidencePct : Number(obj.confidencePct);
    const confidencePct = Number.isFinite(rawConf)
      ? Math.max(0, Math.min(100, Math.round(rawConf)))
      : 50;

    const reason =
      typeof obj.reason === 'string' && obj.reason.trim().length > 0
        ? obj.reason.trim()
        : 'Matching item characteristics and location context.';

    const visualEvidence =
      typeof obj.visualEvidence === 'string' && obj.visualEvidence.trim().length > 0
        ? obj.visualEvidence.trim()
        : 'Matched from item descriptions and metadata.';

    out.push({
      id: `match-${foundItemId}-${missingReportId}`,
      foundItemId,
      missingReportId,
      confidencePct,
      reason,
      visualEvidence,
      createdAtIso: nowIso,
    });
  }

  return out.sort((a, b) => b.confidencePct - a.confidencePct);
}

export function createSeededFoundItems(nowMs: number = Date.now()): FoundItem[] {
  return [
    {
      id: 'found-101',
      title: 'Navy 32oz Insulated Water Bottle with Space Stickers',
      category: 'Water Bottles & Gear',
      locationFound: 'Main Gymnasium Bleachers (East Wing)',
      foundAtIso: new Date(nowMs - 3 * 3600_000).toISOString(),
      staffName: 'M. Alvarez (Facilities)',
      description:
        'Stainless steel navy bottle, slightly dented base, covered with two NASA-style planet stickers and a silver carabiner clip on the lid.',
      status: 'open',
    },
    {
      id: 'found-102',
      title: 'TI-84 Plus CE Graphing Calculator (Black)',
      category: 'Electronics',
      locationFound: 'Science Hall Room 204',
      foundAtIso: new Date(nowMs - 6 * 3600_000).toISOString(),
      staffName: 'R. Chen (Custodial)',
      description:
        'Black slide-case Texas Instruments TI-84 Plus CE left near lab bench #4. Initials "M.T." etched faintly on the back cover.',
      status: 'open',
    },
    {
      id: 'found-103',
      title: 'Maroon Zip-Up Robotics Club Hoodie (Size M)',
      category: 'Clothing & Outerwear',
      locationFound: 'Cafeteria Courtyard Bench',
      foundAtIso: new Date(nowMs - 20 * 3600_000).toISOString(),
      staffName: 'D. Patel (Facilities)',
      description:
        'Heavyweight maroon fleece zip hoodie with white "RoboHawks 404" crest on chest and paint smudge near left cuff.',
      status: 'open',
    },
  ];
}

export function createSeededMissingReports(nowMs: number = Date.now()): MissingReport[] {
  return [
    {
      id: 'miss-201',
      itemName: 'Blue Hydro-style bottle with galaxy stickers',
      category: 'Water Bottles & Gear',
      reporterType: 'student',
      reporterName: 'Maya Lin (Grade 10)',
      contactInfo: 'maya.lin@campus.edu',
      lastSeenLocation: 'Basketball Gym after 5th period',
      lostAtIso: new Date(nowMs - 4 * 3600_000).toISOString(),
      description:
        'Dark navy metal bottle, 32oz, has planet stickers and a metal clip attached to the cap.',
      status: 'searching',
    },
    {
      id: 'miss-202',
      itemName: 'Graphing calculator for AP Calculus',
      category: 'Electronics',
      reporterType: 'parent',
      reporterName: 'Sandra Torres (Parent of Mateo T.)',
      contactInfo: '(555) 014-8821',
      lastSeenLocation: '2nd Floor Chemistry / Science Wing',
      lostAtIso: new Date(nowMs - 8 * 3600_000).toISOString(),
      description:
        'Black TI-84 Plus CE color screen calculator. My son Mateo has his initials M.T. scratched on the back.',
      status: 'searching',
    },
  ];
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    return null;
  }
  return null;
}

export function loadFoundItems(storage: StorageLike | null = getDefaultStorage()): FoundItem[] {
  const seeds = createSeededFoundItems();
  if (!storage) return seeds;
  try {
    const raw = storage.getItem(FOUND_ITEMS_STORAGE_KEY);
    if (!raw) return seeds;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return seeds;
    return parsed as FoundItem[];
  } catch {
    return seeds;
  }
}

export function saveFoundItems(
  items: readonly FoundItem[],
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(FOUND_ITEMS_STORAGE_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

export function loadMissingReports(
  storage: StorageLike | null = getDefaultStorage()
): MissingReport[] {
  const seeds = createSeededMissingReports();
  if (!storage) return seeds;
  try {
    const raw = storage.getItem(MISSING_REPORTS_STORAGE_KEY);
    if (!raw) return seeds;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return seeds;
    return parsed as MissingReport[];
  } catch {
    return seeds;
  }
}

export function saveMissingReports(
  reports: readonly MissingReport[],
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(MISSING_REPORTS_STORAGE_KEY, JSON.stringify(reports));
    return true;
  } catch {
    return false;
  }
}

export function loadSavedMatches(
  storage: StorageLike | null = getDefaultStorage()
): GeminiMatchSuggestion[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(GEMINI_MATCHES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GeminiMatchSuggestion[]) : [];
  } catch {
    return [];
  }
}

export function saveMatches(
  matches: readonly GeminiMatchSuggestion[],
  storage: StorageLike | null = getDefaultStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(GEMINI_MATCHES_STORAGE_KEY, JSON.stringify(matches));
    return true;
  } catch {
    return false;
  }
}
