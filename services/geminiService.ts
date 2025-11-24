
import { GoogleGenAI, Type } from "@google/genai";
import { InventoryItem } from "../types";
import { CATEGORIES, ITEM_TAGS, REFERENCE_ITEM_DATA } from "../constants";

const SYSTEM_INSTRUCTION_IMAGE = `
You are a master moving estimator with 20 years of experience. Your job is to create a moving inventory from images.

*** EXECUTION MODE: EXHAUSTIVE SCAN ***
1.  Scan the image systematically: Left to Right, Background to Foreground.
2.  Do not hallucinate items that are not there.
3.  Do not miss significant items.
4.  If multiple identical items exist (e.g., 4 Dining Chairs), count them precisely.

*** CRITICAL EXCLUSION RULES (DO NOT LIST THESE) ***
1. **FIXTURES & STRUCTURAL ITEMS**: 
   - IGNORE ALL items attached to the building.
   - EXCLUDE: Kitchen cabinets, countertops, islands (fixed), bathroom vanities, sinks, toilets, bathtubs, showers, radiators, fireplaces, built-in wardrobes/shelves, ceiling fans, chandeliers, wall sconces, light switches, thermostats, windows, doors, blinds, curtain rods, wall-to-wall carpeting.
   - INCLUDE ONLY: Movable furniture, free-standing appliances (fridge, washer, dryer), electronics, loose rugs, wall-mounted TVs (the TV itself), hung mirrors/art.
2. **SMALL LOOSE ITEMS**: 
   - IGNORE small clutter like books, clothes, dishes, pots, pans, toys, toiletries, remote controls, papers.
   - Assume the customer will box these.
   - ONLY list "Box, Medium" or "Plastic Tote" if you see actual pre-packed containers.

*** ESTIMATION RULES ***
1. **Match Standard Names**: Try to map items to these standard names if possible: ${Object.keys(REFERENCE_ITEM_DATA).slice(0, 50).join(', ')}... (and others).
2. **Unknown/Custom Items**: If a significant movable item is detected but NOT in the standard list:
   - YOU MUST ESTIMATE its Volume (cu ft) and Weight (lbs) based on visual dimensions and material.
   - Do NOT return 0 for volume or weight.
   - Use a descriptive name (e.g., "Custom Arcade Cabinet").
3. **Context**: A bed typically implies a mattress and box spring (list as "Bed, [Size]"). A dining table implies chairs (count them and list "Chair, Dining" separately).

*** OUTPUT FORMAT ***
- Return a JSON Array of items.
- Categories: ${CATEGORIES.join(', ')}
- Tags: ${ITEM_TAGS.join(', ')}
`;

const SYSTEM_INSTRUCTION_VOICE = `
You are an intelligent assistant for a moving company app. 
Convert the user's natural language voice command into a structured inventory list.

Rules:
1. Extract item names and quantities (e.g., "three large boxes" -> quantity: 3, name: "Box, Large").
2. Ignore small loose items (e.g. "a pile of clothes") unless the user explicitly says "box of clothes".
3. Try to map names to standard industry terms (e.g. "TV" -> "TV, Flat Screen").
4. Categorize and tag each item accordingly.
5. Return a JSON array of items.
`;

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      quantity: { type: Type.NUMBER },
      volumeCuFt: { type: Type.NUMBER },
      weightLbs: { type: Type.NUMBER },
      category: { type: Type.STRING, enum: CATEGORIES },
      tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      confidence: { type: Type.NUMBER }
    },
    required: ["name", "quantity", "volumeCuFt", "weightLbs", "category"],
  },
};

// --- Lookup Helper ---
// Tries to find the item in the Reference Data to get exact Volume/Weight
const lookupReferenceStats = (name: string): { volumeCuFt: number, weightLbs: number, standardizedName?: string } | null => {
    // 1. Exact match
    if (REFERENCE_ITEM_DATA[name]) {
        return { 
            volumeCuFt: REFERENCE_ITEM_DATA[name].volume, 
            weightLbs: REFERENCE_ITEM_DATA[name].weight,
            standardizedName: name 
        };
    }

    // 2. Case insensitive match
    const lowerName = name.toLowerCase().trim();
    const referenceKeys = Object.keys(REFERENCE_ITEM_DATA);
    
    // Direct case-insensitive
    const exactKey = referenceKeys.find(k => k.toLowerCase() === lowerName);
    if (exactKey) {
        return {
            volumeCuFt: REFERENCE_ITEM_DATA[exactKey].volume, 
            weightLbs: REFERENCE_ITEM_DATA[exactKey].weight,
            standardizedName: exactKey
        };
    }

    // 3. Fuzzy / Partial Match (Simple token overlap)
    // "King Size Bed" -> "Bed, King"
    // "Flat Screen TV" -> "TV, Flat Screen"
    // We look for the reference key that has the highest number of matching words
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

        // Heuristic: If we match 2 or more words, or if the name is short and matches 1 word perfectly
        if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestMatchKey = key;
        }
    }

    // Threshold: Match at least 50% of the words or 2 words
    if (bestMatchKey && (maxOverlap >= 2 || (nameTokens.length === 1 && maxOverlap === 1))) {
         return {
            volumeCuFt: REFERENCE_ITEM_DATA[bestMatchKey].volume, 
            weightLbs: REFERENCE_ITEM_DATA[bestMatchKey].weight,
            standardizedName: bestMatchKey
        };
    }

    return null;
};


export const analyzeImageForInventory = async (base64Data: string): Promise<InventoryItem[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Data } },
          { text: "Identify all moving items in this image. Return a list." },
        ],
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_IMAGE,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        // Deterministic settings to reduce variance in item detection
        temperature: 0, 
        topP: 0.95,
        topK: 40,
      },
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No data returned from AI");

    const rawItems = JSON.parse(jsonText);
    return mapRawItemsToInventory(rawItems);

  } catch (error) {
    console.error("Gemini Image Analysis Error:", error);
    throw error;
  }
};

export const parseVoiceCommand = async (transcript: string): Promise<InventoryItem[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [{ text: transcript }] },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_VOICE,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0, // Deterministic voice parsing
      },
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No data returned from AI");
    return mapRawItemsToInventory(JSON.parse(jsonText));

  } catch (error) {
    console.error("Gemini Voice Analysis Error:", error);
    throw error;
  }
};

export const estimateItemStats = async (name: string, category: string): Promise<{ volumeCuFt: number, weightLbs: number }> => {
  // 1. Try Lookup First
  const refStats = lookupReferenceStats(name);
  if (refStats) {
      return { volumeCuFt: refStats.volumeCuFt, weightLbs: refStats.weightLbs };
  }

  // 2. Fallback to AI for unknown items
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [{ text: `Estimate conservative volume and weight for: ${name} (Category: ${category})` }] },
      config: {
        systemInstruction: `You are a moving estimator. Estimate volume (cf) and weight (lbs). Ignore items that are clearly fixed to walls/ceilings. Return JSON.`,
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                volumeCuFt: { type: Type.NUMBER },
                weightLbs: { type: Type.NUMBER }
            },
            required: ["volumeCuFt", "weightLbs"]
        },
        temperature: 0.2, // Low temp for more consistent estimation
      }
    });
    
    const text = response.text;
    if (!text) return { volumeCuFt: 0, weightLbs: 0 };
    
    return JSON.parse(text);
  } catch (error) {
    console.warn("AI Estimation failed", error);
    return { volumeCuFt: 0, weightLbs: 0 };
  }
}

const mapRawItemsToInventory = (rawItems: any[]): InventoryItem[] => {
  return rawItems.map((item: any) => {
    // Perform lookup to correct the name and stats
    const ref = lookupReferenceStats(item.name);
    
    return {
        id: crypto.randomUUID(),
        name: ref ? ref.standardizedName! : item.name,
        quantity: item.quantity,
        // Use Reference stats if available, otherwise fallback to AI provided stats (or 0)
        volumeCuFt: ref ? ref.volumeCuFt : (item.volumeCuFt || 0),
        weightLbs: ref ? ref.weightLbs : (item.weightLbs || 0),
        category: item.category || "Misc",
        tags: item.tags || [],
        selected: true,
        confidence: item.confidence || 0.9,
    };
  });
};
