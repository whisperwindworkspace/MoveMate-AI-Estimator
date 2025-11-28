
import { GoogleGenAI, Type } from "@google/genai";
import { InventoryItem } from "../types";
import { CATEGORIES, ITEM_TAGS, REFERENCE_ITEM_DATA, FORBIDDEN_KEYWORDS, STANDARD_MOVING_ITEMS } from "../constants";

// Pre-compute the list string for prompts to avoid overhead on every call
const STANDARD_ITEM_LIST_STRING = STANDARD_MOVING_ITEMS.join(", ");

const SYSTEM_INSTRUCTION_IMAGE = `
You are an expert moving estimator. Your job is to create a highly accurate inventory for a moving quote.

*** 1. IDENTIFY FURNITURE & APPLIANCES ***
- Scan the image for all furniture (Sofas, Tables, Chairs, Beds, Dressers, Lamps, etc.) and major appliances.
- **Sets**: Group identical items (e.g., "4 x Chair, Dining", "2 x Lamp, Table").
- **Hidden Items**: Look for items partially hidden by others (e.g., a chair tucked under a table, a nightstand behind a bed).
- **Naming**: ALWAYS try to map the item to a name in the **Standard Reference List** below. If it matches, use that EXACT name.

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
  - EXCLUDE: Wall Shelves, Floating Shelves, Attached Cabinets, Ceiling Fans, Chandeliers, Sconces, Curtain Rods, Blinds, Towel Racks.
  - RULE: If it is screwed into the wall and is not a TV or AC unit, DO NOT list it.
  - **Exception**: Lamps (Floor/Table) ARE included. Mounted TVs ARE included.
- **Small Loose Items**: Do NOT list items that fit in a box (books, clothes, shoes, toys, dishes, electronics, toiletries). Only list the "Box" if they are packed.
- **Trash/Clutter**: Ignore garbage or obvious debris.

*** 4. STANDARD REFERENCE LIST ***
Use these names if the item matches:
${STANDARD_ITEM_LIST_STRING}

*** OUTPUT FORMAT ***
- JSON Array of objects with properties: name, quantity, category, confidence.
`;

const SYSTEM_INSTRUCTION_VIDEO = `
You are analyzing a video walkthrough for a moving estimate. Create a single consolidated inventory.

*** RULES ***
1. **INCLUSIONS**: Furniture, Lamps, Large Appliances (inc. Window AC), Large Electronics, Packed Boxes.
2. **NAMING**: Use the **Standard Reference List** names where possible (e.g., "Sofa, 3 Cushion", "Chair, Dining").
3. **EXCLUSIONS (STRICT)**: 
   - **Fixtures/Attached**: Wall shelves, floating shelves, built-ins, ceiling fans, chandeliers, sconces, blinds, curtain rods.
   - **Small Items**: Alarm clocks, hair dryers, clothes, dishes, toys, small kitchenware (unless in a box).
4. **DEDUPLICATION**: Do not double count items seen in multiple frames. Track items across the sequence.

*** STANDARD REFERENCE LIST ***
${STANDARD_ITEM_LIST_STRING}

*** OUTPUT ***
- JSON Array of unique items.
`;

const SYSTEM_INSTRUCTION_VOICE = `
You are a moving inventory assistant. Convert voice commands to a JSON list.

*** RULES ***
1. **MATCH STANDARD NAMES**: Try to map user descriptions to these standard items: ${STANDARD_ITEM_LIST_STRING}.
2. **IGNORE SMALL ITEMS**: Filter out books, clothes, dishes, toys, etc., unless the user explicitly says "Box of [item]".
3. **IGNORE FIXTURES**: Do not list wall shelves, built-ins, or lights attached to the house (unless user says "Window AC" or similar valid item).
4. **QUANTITIES**: Extract exact numbers.
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

// --- Lookup Helper ---
const lookupReferenceStats = (name: string): { volumeCuFt: number, weightLbs: number, standardizedName?: string } | null => {
    if (REFERENCE_ITEM_DATA[name]) {
        return { 
            volumeCuFt: REFERENCE_ITEM_DATA[name].volume, 
            weightLbs: REFERENCE_ITEM_DATA[name].weight,
            standardizedName: name 
        };
    }

    const lowerName = name.toLowerCase().trim();
    const referenceKeys = Object.keys(REFERENCE_ITEM_DATA);
    
    // Exact case-insensitive match
    const exactKey = referenceKeys.find(k => k.toLowerCase() === lowerName);
    if (exactKey) {
        return {
            volumeCuFt: REFERENCE_ITEM_DATA[exactKey].volume, 
            weightLbs: REFERENCE_ITEM_DATA[exactKey].weight,
            standardizedName: exactKey
        };
    }

    // Fuzzy Token Match
    let bestMatchKey = "";
    let maxOverlap = 0;
    const nameTokens = lowerName.replace(/[(),]/g, '').split(/\s+/);

    for (const key of referenceKeys) {
        const keyLower = key.toLowerCase();
        const keyTokens = keyLower.replace(/[(),]/g, '').split(/\s+/);
        
        let overlap = 0;
        nameTokens.forEach(token => {
            if (keyTokens.includes(token)) overlap++;
        });

        if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestMatchKey = key;
        }
    }

    if (bestMatchKey && (maxOverlap >= 2 || (nameTokens.length === 1 && maxOverlap === 1))) {
         return {
            volumeCuFt: REFERENCE_ITEM_DATA[bestMatchKey].volume, 
            weightLbs: REFERENCE_ITEM_DATA[bestMatchKey].weight,
            standardizedName: bestMatchKey
        };
    }

    return null;
};

// --- Local Estimation Helper ---
// Fallback for items NOT in the reference list.
// We use SAFE (higher) estimates to ensure we don't under-quote.
const estimateItemStatsLocal = (name: string, category?: string): { volumeCuFt: number, weightLbs: number } => {
    // 1. Try exact lookup again just in case
    const stats = lookupReferenceStats(name);
    if (stats) return stats;

    // 2. Deterministic Fallback based on Category
    const cat = category?.toLowerCase() || '';
    
    if (cat.includes('box')) return { volumeCuFt: 4, weightLbs: 35 }; // Avg Medium/Large box
    
    if (cat.includes('furniture')) {
        // Safe bet for unknown furniture (e.g. unknown sofa/cabinet)
        if (name.toLowerCase().includes('sofa') || name.toLowerCase().includes('couch')) return { volumeCuFt: 60, weightLbs: 250 };
        if (name.toLowerCase().includes('table')) return { volumeCuFt: 25, weightLbs: 100 };
        return { volumeCuFt: 25, weightLbs: 120 }; 
    }
    
    if (cat.includes('appliance')) return { volumeCuFt: 35, weightLbs: 200 }; // Avg washer/dryer/fridge
    if (cat.includes('electronic')) return { volumeCuFt: 10, weightLbs: 50 };
    
    // Misc items
    return { volumeCuFt: 5, weightLbs: 25 };
};

// --- Filtering Logic ---
const processAIResponse = (rawItems: any[]): InventoryItem[] => {
    const processed: InventoryItem[] = [];

    for (const item of rawItems) {
        // 1. Check against Reference List (Allow list)
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
             
             // 2. Check Forbidden Keywords (Block list)
             const nameLower = item.name.toLowerCase();
             for (const forbidden of FORBIDDEN_KEYWORDS) {
                if (nameLower.includes(forbidden)) {
                    shouldKeep = false; 
                    console.log(`Filtered out forbidden item: ${item.name} (Matched: ${forbidden})`);
                    break;
                }
             }

             // 3. Fallback Estimation
             if (shouldKeep) {
                  // FORCE local estimation for consistency
                  const est = estimateItemStatsLocal(item.name, item.category);
                  finalVol = est.volumeCuFt;
                  finalWeight = est.weightLbs;
             }
        }

        if (shouldKeep) {
             processed.push({
                 id: crypto.randomUUID(),
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
    return processed;
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
                temperature: 0.1 // Lower temperature for more consistent identification
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
                temperature: 0.1
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
                temperature: 0.1
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
