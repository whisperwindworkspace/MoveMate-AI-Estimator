
import { GoogleGenAI, Type } from "@google/genai";
import { InventoryItem } from "../types";
import { CATEGORIES, ITEM_TAGS, REFERENCE_ITEM_DATA, FORBIDDEN_KEYWORDS, STANDARD_MOVING_ITEMS } from "../constants";

// Pre-compute the list string for prompts to avoid overhead on every call
const STANDARD_ITEM_LIST_STRING = STANDARD_MOVING_ITEMS.join(", ");

const SYSTEM_INSTRUCTION_IMAGE = `
You are an expert moving estimator. Your job is to create a highly accurate inventory for a moving quote.

*** 1. IDENTIFY FURNITURE & APPLIANCES ***
- Scan the image for **FREE-STANDING** furniture (Sofas, Tables, Chairs, Beds, Dressers, Lamps, etc.) and major appliances.
- **Sets**: Group identical items (e.g., "4 x Chair, Dining", "2 x Lamp, Table"). DO NOT list them individually.
- **Hidden Items**: Look for items partially hidden by others (e.g., a chair tucked under a table, a nightstand behind a bed).
- **Naming**: STRICTLY map the item to a name in the **Standard Reference List** below. 
  - If it looks like a "Dining Chair", call it "Chair, Dining".
  - If it looks like a "Sectional", call it "Sofa, Sectional".
  - If it is not in the list, use the closest matching Category + Name (e.g. "Table, Utility" or "Cabinet, Utility").
  - DO NOT invent new names or synonyms (e.g., do not say "Couch", say "Sofa, 3 Cushion").

*** 2. IDENTIFY BOXES ***
- Check for cardboard boxes, plastic totes, or bins.
- Estimate their size and map to:
  - "Box, Small" (1.5 cu ft - Book/Record size)
  - "Box, Medium" (3.0 cu ft - Microwave size)
  - "Box, Large" (4.5 cu ft - Large items/Linens)
  - "Box, Wardrobe" (Tall hanging clothes box)
  - "Box, Tote" (Plastic bins)
- Count them accurately.

*** 3. EXCLUSIONS (STRICT) ***
- **Attached Fixtures**: STRICTLY EXCLUDE items permanently attached to walls/ceilings/floors UNLESS they are in the Standard Reference List (e.g., "AC, Small/Window").
  - EXCLUDE: Kitchen cabinets, islands, bathroom vanities (attached), built-in shelving, wall-mounted shelves, light fixtures (chandeliers, sconces), ceiling fans, curtain rods, blinds, towel racks, radiators.
  - RULE: If it is part of the house structure or screwed into the wall (and not a TV or AC unit), DO NOT list it.
  - **Exception**: Lamps (Floor/Table) ARE included. Mounted TVs ARE included.
- **Small Loose Items**: Do NOT list items that fit in a box (books, clothes, shoes, toys, dishes, electronics, toiletries). Only list the "Box" if they are packed.
- **Trash/Clutter**: Ignore garbage or obvious debris.

*** 4. STANDARD REFERENCE LIST (USE THESE NAMES ONLY) ***
${STANDARD_ITEM_LIST_STRING}

*** OUTPUT FORMAT ***
- JSON Array of objects with properties: name, quantity, category, confidence.
- Consolidate all identical items into a SINGLE entry with the total quantity.
`;

const SYSTEM_INSTRUCTION_VIDEO = `
You are analyzing a video walkthrough for a moving estimate. Create a single consolidated inventory.

*** RULES ***
1. **INCLUSIONS**: Free-standing Furniture, Lamps, Large Appliances (inc. Window AC), Large Electronics, Packed Boxes.
2. **NAMING**: STRICTLY use the **Standard Reference List** names. Do not use synonyms.
3. **EXCLUSIONS (STRICT)**: 
   - **Fixtures/Attached**: Wall shelves, floating shelves, built-ins, ceiling fans, chandeliers, sconces, blinds, curtain rods, attached cabinets.
   - **Small Items**: Alarm clocks, hair dryers, clothes, dishes, toys, small kitchenware (unless in a box).
4. **DEDUPLICATION**: Do not double count items seen in multiple frames. Track items across the sequence.
5. **CONSOLIDATION**: Return one entry per item type with total count (e.g., "Quantity: 6" for dining chairs).

*** STANDARD REFERENCE LIST ***
${STANDARD_ITEM_LIST_STRING}

*** OUTPUT ***
- JSON Array of unique items.
`;

const SYSTEM_INSTRUCTION_VOICE = `
You are a moving inventory assistant. Convert voice commands to a JSON list.

*** RULES ***
1. **MATCH STANDARD NAMES**: Map user descriptions to these standard items ONLY: ${STANDARD_ITEM_LIST_STRING}.
2. **IGNORE SMALL ITEMS**: Filter out books, clothes, dishes, toys, etc., unless the user explicitly says "Box of [item]".
3. **IGNORE FIXTURES**: Do not list wall shelves, built-ins, or lights attached to the house (unless user says "Window AC" or similar valid item).
4. **QUANTITIES**: Extract exact numbers. Sum them up if mentioned multiple times.
`;

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      quantity: { type: Type.NUMBER },
      // Note: We deliberately exclude volume/weight from AI schema here so it relies on our logic
      // unless specifically needed. But to allow it to pass-through if confident, we keep them optional.
      volumeCuFt: { type: Type.NUMBER },
      weightLbs: { type: Type.NUMBER },
      category: { type: Type.STRING }, 
      tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      confidence: { type: Type.NUMBER }
    },
    required: ["name", "quantity", "category"],
  },
};

// --- String Similarity Helpers ---

// 1. Canonicalization: Lowercase, remove non-alphanumeric, sort tokens
// e.g. "Chair, Dining" -> "chair dining"
// e.g. "Dining Chair" -> "chair dining"
const getCanonicalTokens = (str: string): string => {
    return str.toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .split(/\s+/)            // Split by whitespace
        .filter(t => t.length > 0) // Remove empty
        .sort()                  // Alphabetical sort
        .join(' ');
};

// 2. Levenshtein Distance
const levenshteinDistance = (a: string, b: string): number => {
    const matrix = [];
    let i, j;

    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    for (i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
};

const getSimilarityScore = (s1: string, s2: string): number => {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    
    const distance = levenshteinDistance(longer, shorter);
    return (longerLength - distance) / parseFloat(longerLength.toString());
};


// --- Lookup Helper ---
const lookupReferenceStats = (name: string): { volumeCuFt: number, weightLbs: number, standardizedName?: string } | null => {
    // 1. Direct Lookup
    if (REFERENCE_ITEM_DATA[name]) {
        return { 
            volumeCuFt: REFERENCE_ITEM_DATA[name].volume, 
            weightLbs: REFERENCE_ITEM_DATA[name].weight,
            standardizedName: name 
        };
    }

    const lowerName = name.toLowerCase().trim();
    const canonicalInput = getCanonicalTokens(name);
    const referenceKeys = Object.keys(REFERENCE_ITEM_DATA);
    
    // 2. Exact Case-Insensitive Match
    const exactKey = referenceKeys.find(k => k.toLowerCase() === lowerName);
    if (exactKey) {
        return {
            volumeCuFt: REFERENCE_ITEM_DATA[exactKey].volume, 
            weightLbs: REFERENCE_ITEM_DATA[exactKey].weight,
            standardizedName: exactKey
        };
    }

    // 3. Token-Sort Fuzzy Match
    // This handles "Dining Chair" vs "Chair, Dining" perfectly.
    
    let bestMatchKey = "";
    let highestScore = 0;

    for (const key of referenceKeys) {
        const canonicalKey = getCanonicalTokens(key);

        // A. Token Sort Similarity (High weight)
        const tokenScore = getSimilarityScore(canonicalInput, canonicalKey);

        // B. Raw Levenshtein Similarity (Medium weight - catches typos in same-order words)
        const rawScore = getSimilarityScore(lowerName, key.toLowerCase());

        // Maximize
        const score = Math.max(tokenScore, rawScore);
        
        if (score > highestScore) {
            highestScore = score;
            bestMatchKey = key;
        }
    }

    // Thresholds
    // 0.82 allows for minor typos + reordering but prevents "Table" matching "Pool Table" (which is ~0.5)
    if (highestScore > 0.82) {
         // console.log(`Fuzzy Match: "${name}" -> "${bestMatchKey}" (Score: ${highestScore.toFixed(2)})`);
         return {
            volumeCuFt: REFERENCE_ITEM_DATA[bestMatchKey].volume, 
            weightLbs: REFERENCE_ITEM_DATA[bestMatchKey].weight,
            standardizedName: bestMatchKey
        };
    }

    // 4. Token Intersection Fallback
    // Good for "Small Chair" -> "Chair, Small" if Levenshtein penalty was too high due to length
    let maxTokenOverlap = 0;
    let tokenBestKey = "";
    const nameTokens = getCanonicalTokens(name).split(' ');
    
    for (const key of referenceKeys) {
        const keyTokens = getCanonicalTokens(key).split(' ');
        let overlap = 0;
        
        nameTokens.forEach(token => {
            if (keyTokens.includes(token) && token.length > 2) overlap++; // Ignore small words
        });
        
        // Penalize if key has many more tokens (e.g. input "Chair", key "Chair, Wing Back")
        // We want tight matches.
        if (overlap > 0) {
             const sizeDiff = Math.abs(keyTokens.length - nameTokens.length);
             // If we have overlap but size diff is huge, it's a weak match
             if (sizeDiff <= 1) {
                 if (overlap > maxTokenOverlap) {
                    maxTokenOverlap = overlap;
                    tokenBestKey = key;
                }
             }
        }
    }

    // Require significant overlap (2+ words or 1 word if it's the majority)
    if (maxTokenOverlap >= 2) {
         return {
            volumeCuFt: REFERENCE_ITEM_DATA[tokenBestKey].volume, 
            weightLbs: REFERENCE_ITEM_DATA[tokenBestKey].weight,
            standardizedName: tokenBestKey
        };
    }

    // Single token match safety check (e.g. "Table")
    // Only map if it's a generic word mapping to a standard variant and length is similar
    if (maxTokenOverlap === 1 && nameTokens.length === 1) {
        // e.g. Input: "Sofa" -> Key: "Sofa, 3 Cushion"
        // Avoid Input: "Table" -> Key: "Pool Table"
        if (tokenBestKey.toLowerCase().includes(nameTokens[0])) {
             return {
                volumeCuFt: REFERENCE_ITEM_DATA[tokenBestKey].volume, 
                weightLbs: REFERENCE_ITEM_DATA[tokenBestKey].weight,
                standardizedName: tokenBestKey
            };
        }
    }

    return null;
};

// --- Local Estimation Helper ---
// Fallback for items NOT in the reference list.
// We use SAFE HIGH estimates to ensure we don't under-quote.
const estimateItemStatsLocal = (name: string, category?: string): { volumeCuFt: number, weightLbs: number } => {
    // 1. Try exact lookup again just in case
    const stats = lookupReferenceStats(name);
    if (stats) return stats;

    // 2. Deterministic Fallback based on Category
    // "Highest Predicted" logic: If unsure, use the higher weight of the category to be safe.
    const cat = category?.toLowerCase() || '';
    
    if (cat.includes('box')) return { volumeCuFt: 6, weightLbs: 50 }; // Safe bet: Large Box / Tote
    
    if (cat.includes('furniture')) {
        // Safe bet for unknown furniture. 
        // Using "High Predicted" values:
        if (name.toLowerCase().includes('sofa') || name.toLowerCase().includes('couch')) return { volumeCuFt: 70, weightLbs: 300 }; // Heavy sofa
        if (name.toLowerCase().includes('table')) return { volumeCuFt: 40, weightLbs: 200 }; // Heavy table
        if (name.toLowerCase().includes('chair')) return { volumeCuFt: 25, weightLbs: 80 }; // Heavy chair
        if (name.toLowerCase().includes('bed')) return { volumeCuFt: 70, weightLbs: 250 }; // Heavy bed frame
        if (name.toLowerCase().includes('cabinet') || name.toLowerCase().includes('dresser')) return { volumeCuFt: 50, weightLbs: 300 };
        return { volumeCuFt: 30, weightLbs: 200 }; // Generic heavy furniture
    }
    
    if (cat.includes('appliance')) return { volumeCuFt: 40, weightLbs: 250 }; // Heavy appliance
    if (cat.includes('electronic')) return { volumeCuFt: 15, weightLbs: 80 }; // Heavy electronics
    
    // Misc items
    return { volumeCuFt: 10, weightLbs: 50 }; // Safe misc buffer
};

// --- Filtering Logic ---
const processAIResponse = (rawItems: any[]): InventoryItem[] => {
    const processed: InventoryItem[] = [];

    // 1. First Pass: Normalize, Filter, and Calculate Stats
    for (const item of rawItems) {
        // A. Check against Reference List (Allow list)
        const stats = lookupReferenceStats(item.name);
        
        let shouldKeep = true;
        let finalName = item.name;
        
        // IMPORTANT: We do NOT use item.volumeCuFt or item.weightLbs from the AI 
        // unless it's a reference item. We force the Reference List or Local Estimate
        // to ensure deterministic weights (consistency across scans).
        let finalVol = 0;
        let finalWeight = 0;

        if (stats) {
             // It's a reference item! Keep it.
             shouldKeep = true;
             if (stats.standardizedName) finalName = stats.standardizedName;
             finalVol = stats.volumeCuFt;
             finalWeight = stats.weightLbs;
        } else {
             // It's NOT in the reference list.
             
             // B. Check Forbidden Keywords (Block list)
             const nameLower = item.name.toLowerCase();
             for (const forbidden of FORBIDDEN_KEYWORDS) {
                if (nameLower.includes(forbidden)) {
                    shouldKeep = false; 
                    console.log(`Filtered out forbidden item: ${item.name} (Matched: ${forbidden})`);
                    break;
                }
             }

             // C. Fallback Estimation - FORCE HIGH PREDICTED
             if (shouldKeep) {
                  // FORCE local estimation for consistency
                  const est = estimateItemStatsLocal(item.name, item.category);
                  finalVol = est.volumeCuFt;
                  finalWeight = est.weightLbs;
             }
        }

        if (shouldKeep) {
             processed.push({
                 id: crypto.randomUUID(), // Temp ID, will be new object later anyway
                 name: finalName,
                 quantity: item.quantity || 1,
                 volumeCuFt: finalVol,
                 weightLbs: finalWeight,
                 category: item.category || 'Misc',
                 tags: item.tags || [],
                 confidence: item.confidence || 0.8,
                 selected: true
             });
        }
    }

    // 2. Aggregation Step
    // Consolidate items with the same final name to prevent "split" rows
    // e.g. "Chair" (1) and "Chair" (1) becomes "Chair" (2)
    // This solves the issue of AI returning inconsistent list formats (rows vs qty).
    const aggregatedMap = new Map<string, InventoryItem>();

    for (const item of processed) {
        if (aggregatedMap.has(item.name)) {
            const existing = aggregatedMap.get(item.name)!;
            existing.quantity += item.quantity;
            // Keep the higher confidence if available
            existing.confidence = Math.max(existing.confidence || 0, item.confidence || 0);
        } else {
            // Clone to avoid reference issues
            aggregatedMap.set(item.name, { ...item, id: crypto.randomUUID() });
        }
    }

    return Array.from(aggregatedMap.values());
};

// --- Exported Services ---

export const analyzeImageForInventory = async (base64Image: string): Promise<InventoryItem[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: SYSTEM_INSTRUCTION_IMAGE }
                ]
            },
            config: {
                responseMimeType: 'application/json',
                responseSchema: RESPONSE_SCHEMA,
                temperature: 0.0 // Zero temperature for maximum determinism
            }
        });

        const rawJson = JSON.parse(response.text);
        if (Array.isArray(rawJson)) {
            return processAIResponse(rawJson);
        }
        return [];
    } catch (error) {
        console.error("Gemini Analysis Error:", error);
        throw new Error("Failed to analyze image.");
    }
};

export const analyzeVideoFrames = async (frames: string[]): Promise<InventoryItem[]> => {
    if (frames.length === 0) return [];
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Prepare parts: text instruction first, then all image frames
    const parts: any[] = [{ text: SYSTEM_INSTRUCTION_VIDEO }];
    frames.forEach(frame => {
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: frame } });
    });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts },
            config: {
                responseMimeType: 'application/json',
                responseSchema: RESPONSE_SCHEMA,
                temperature: 0.0 // Zero temperature for maximum determinism
            }
        });

        const rawJson = JSON.parse(response.text);
        if (Array.isArray(rawJson)) {
            return processAIResponse(rawJson);
        }
        return [];
    } catch (error) {
        console.error("Gemini Video Analysis Error:", error);
        throw new Error("Failed to analyze video.");
    }
};

export const parseVoiceCommand = async (transcript: string): Promise<InventoryItem[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [{ text: `${SYSTEM_INSTRUCTION_VOICE}\n\nUSER COMMAND: "${transcript}"` }]
            },
            config: {
                responseMimeType: 'application/json',
                responseSchema: RESPONSE_SCHEMA,
                temperature: 0.0
            }
        });

        const rawJson = JSON.parse(response.text);
        if (Array.isArray(rawJson)) {
            return processAIResponse(rawJson);
        }
        return [];
    } catch (error) {
        console.error("Gemini Voice Analysis Error:", error);
        throw new Error("Failed to process voice command.");
    }
};

export const estimateItemStats = async (name: string, category: string): Promise<{ volumeCuFt: number, weightLbs: number }> => {
    // 1. Try Local Lookup
    const local = lookupReferenceStats(name);
    if (local) return { volumeCuFt: local.volumeCuFt, weightLbs: local.weightLbs };

    // 2. Deterministic Fallback (Do not use AI guessing for consistent weights)
    return estimateItemStatsLocal(name, category);
};