import { InventoryItem } from '../types';
import {
  CATEGORIES,
  REFERENCE_ITEM_DATA,
  STANDARD_MOVING_ITEMS,
} from '../constants';
import { supabaseFunctionsUrl } from './supabaseClient';

// -----------------------------------------------------------------------------
// Types for talking to the Edge Function
// -----------------------------------------------------------------------------

type GeminiMode = 'image' | 'video' | 'voice';

interface GeminiImagePayload {
  imageBase64: string;
}

interface GeminiVideoPayload {
  frames: string[];
}

interface GeminiVoicePayload {
  transcript: string;
}

type GeminiRequestPayload =
  | { mode: 'image'; payload: GeminiImagePayload }
  | { mode: 'video'; payload: GeminiVideoPayload }
  | { mode: 'voice'; payload: GeminiVoicePayload };

interface GeminiEdgeItem {
  id?: string;
  name: string;
  quantity: number;
  category?: string;
  volumeCuFt?: number;
  weightLbs?: number;
  selected?: boolean;
  tags?: string[];
  imageUrl?: string;
  confidence?: number;
  disassembly?: string;
}

type GeminiEdgeResponse = GeminiEdgeItem[] | { items: GeminiEdgeItem[] };

// Supabase Edge function name
const GEMINI_EDGE_FUNCTION = 'identify-items';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const normalizeString = (str: string): string =>
  str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const levenshteinDistance = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  let prev: number[] = Array(n + 1).fill(0);
  let curr: number[] = Array(n + 1).fill(0);

  for (let j = 0; j <= n; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const deletion = prev[j]!;
      const insertion = curr[j - 1]!;
      const substitution = prev[j - 1]!;

      curr[j] = Math.min(
        deletion + 1, // deletion
        insertion + 1, // insertion
        substitution + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n]!;
};

const similarity = (a: string, b: string): number => {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  const len = longer.length;
  if (len === 0) return 1;
  const dist = levenshteinDistance(longer, shorter);
  return (len - dist) / len;
};

const lookupReferenceStats = (
  name: string,
): { volumeCuFt: number; weightLbs: number } | null => {
  const direct = REFERENCE_ITEM_DATA[name];
  if (direct) {
    return { volumeCuFt: direct.volume, weightLbs: direct.weight };
  }

  const lower = normalizeString(name);
  const keys = Object.keys(REFERENCE_ITEM_DATA);

  let bestKey: string | null = null;
  let bestScore = 0;

  for (const key of keys) {
    const s = similarity(lower, normalizeString(key));
    if (s > bestScore) {
      bestScore = s;
      bestKey = key;
    }
  }

  if (bestKey && bestScore > 0.7) {
    const ref = REFERENCE_ITEM_DATA[bestKey];
    if (!ref) return null;
    return { volumeCuFt: ref.volume, weightLbs: ref.weight };
  }

  return null;
};

const estimateItemStatsLocal = (
  name: string,
  category: string,
): { volumeCuFt: number; weightLbs: number } => {
  const lower = normalizeString(name);

  if (lower.includes('sofa') || lower.includes('couch')) {
    return { volumeCuFt: 80, weightLbs: 150 };
  }
  if (lower.includes('bed')) {
    if (lower.includes('king')) return { volumeCuFt: 70, weightLbs: 180 };
    if (lower.includes('queen')) return { volumeCuFt: 60, weightLbs: 160 };
    return { volumeCuFt: 50, weightLbs: 140 };
  }
  if (lower.includes('table')) {
    return { volumeCuFt: 35, weightLbs: 80 };
  }

  if (category === 'Boxes') {
    if (lower.includes('wardrobe')) return { volumeCuFt: 15, weightLbs: 60 };
    if (lower.includes('tote')) return { volumeCuFt: 4, weightLbs: 35 };
    return { volumeCuFt: 3, weightLbs: 35 };
  }

  // Generic fallback
  return { volumeCuFt: 10, weightLbs: 40 };
};

const mapEdgeItemToInventory = (raw: GeminiEdgeItem): InventoryItem => {
  const name = String(raw.name ?? 'Unknown Item');
  const quantity =
    typeof raw.quantity === 'number' && raw.quantity > 0 ? raw.quantity : 1;

  const category: string =
    typeof raw.category === 'string' && raw.category.trim().length > 0
      ? raw.category
      : (CATEGORIES.includes('Misc') ? 'Misc' : CATEGORIES[0] ?? 'Misc');

  const statsFromRef = lookupReferenceStats(name);

  const volumeCuFt =
    typeof raw.volumeCuFt === 'number'
      ? raw.volumeCuFt
      : statsFromRef?.volumeCuFt ?? 0;
  const weightLbs =
    typeof raw.weightLbs === 'number'
      ? raw.weightLbs
      : statsFromRef?.weightLbs ?? 0;

  return {
    id: raw.id ?? crypto.randomUUID(),
    name,
    quantity,
    category,
    volumeCuFt,
    weightLbs,
    selected: raw.selected ?? true,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    imageUrl: raw.imageUrl,
    confidence: raw.confidence,
    disassembly: raw.disassembly,
  };
};

const normalizeEdgeResponse = (data: GeminiEdgeResponse): InventoryItem[] => {
  const itemsArray = Array.isArray(data) ? data : data.items ?? [];
  const mapped = itemsArray.map(mapEdgeItemToInventory);

  // consolidate duplicates by name+category
  const map = new Map<string, InventoryItem>();
  for (const item of mapped) {
    const key = `${item.name.toLowerCase()}|${item.category}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
};

const callGeminiEdge = async <T extends GeminiRequestPayload>(
  body: T,
): Promise<InventoryItem[]> => {
  const url = `${supabaseFunctionsUrl}/${GEMINI_EDGE_FUNCTION}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Gemini edge function failed (${res.status}): ${text || res.statusText}`,
    );
  }

  const json = (await res.json()) as GeminiEdgeResponse;
  return normalizeEdgeResponse(json);
};

// -----------------------------------------------------------------------------
// Exported functions used by the rest of the app
// -----------------------------------------------------------------------------

export const analyzeImageForInventory = async (
  base64Image: string,
): Promise<InventoryItem[]> => {
  return callGeminiEdge({
    mode: 'image',
    payload: { imageBase64: base64Image },
  });
};

export const analyzeVideoFrames = async (
  frames: string[],
): Promise<InventoryItem[]> => {
  return callGeminiEdge({
    mode: 'video',
    payload: { frames },
  });
};

export const parseVoiceCommand = async (
  transcript: string,
): Promise<InventoryItem[]> => {
  return callGeminiEdge({
    mode: 'voice',
    payload: { transcript },
  });
};

// Local, non-Gemini stat estimation (no API key needed on client)
export const estimateItemStats = async (
  name: string,
  category: string,
): Promise<{ volumeCuFt: number; weightLbs: number }> => {
  const ref = lookupReferenceStats(name);
  if (ref) {
    return ref;
  }
  return estimateItemStatsLocal(name, category || 'Misc');
};
