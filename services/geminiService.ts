import { GoogleGenAI, Type } from "@google/genai";
import { InventoryItem } from "../types";
import { CATEGORIES, ITEM_TAGS, REFERENCE_ITEM_DATA, FORBIDDEN_KEYWORDS } from "../constants";

// --- HARD FILTER CONFIGURATION ---
// FORBIDDEN_KEYWORDS imported from ../constants

const SYSTEM_INSTRUCTION_IMAGE = `
You are an expert moving estimator. Identify **ALL** furniture, appliances, electronics, and distinct moveable items in the image.

*** ROBUST DETECTION RULES ***
1. **BE COMPREHENSIVE**: If you see an item that looks like furniture or equipment, LIST IT. Do not be overly conservative.
2. **PERSPECTIVE AWARENESS**: Items in the background or wide shots may appear small. Use context to identify them (e.g., a small rectangle near a bed is likely a "Nightstand", a shape under a desk is likely a "Chair").
3. **PARTIAL VIEWS**: If you see part of a sofa, bed, or table, count it.
4. **GROUPING**: If you see 4 chairs around a table, list {name: "Dining Chair", quantity: 4}.

*** FILTERING (Use Judgment) ***
- **IGNORE**: Trash, loose papers, scattered clothes, and tiny clutter (pens, keys).
- **INCLUDE**: Small but distinct items like "Table Lamp", "Toaster Oven", "Monitor", "Printer", "Stool", "Ottoman".
- **FIXTURES**: Do not list built-in cabinets/counters, but DO list the appliances embedded in them (Stove, Dishwasher).

*** OUTPUT FORMAT ***
- JSON Array.
- Use standard names where possible.
`;

const SYSTEM_INSTRUCTION_VIDEO = `
You are analyzing a sequence of video frames from a moving inventory walkthrough.
Your goal is to create a **single consolidated list** of all unique items found across these frames.

*** VIDEO ANALYSIS RULES ***
1. **DEDUPLICATION**: The frames are a sequence from the same room. If you see the same "Sofa" in Frame 1 and Frame 2, COUNT IT ONCE. Do not double count unless you clearly see two distinct items.
2. **STITCHING**: Use multiple angles to identify items. If Frame 1 shows the back of a chair and Frame 2 shows the front, it is one "Chair".
3. **COMPREHENSIVE SCAN**: Look at the background and corners.
4. **IGNORE CLUTTER**: Ignore books, clothes, dishes, and small loose items. Focus on Furniture, Appliances, and Boxes.

*** OUTPUT FORMAT ***
- Return a JSON Array of unique items.
`;

const SYSTEM_INSTRUCTION_VOICE = `
You are a moving inventory assistant. Convert voice commands to a JSON list.

*** RULES ***
1. **IGNORE SMALL ITEMS**: Filter out books, clothes, dishes, toys, etc., unless the user explicitly says "Box of [item]".
2. **ONLY LIST**: Furniture, Large Appliances, Packed Boxes.
3. **QUANTITIES**: Extract exact numbers.
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
      category: { type: Type.STRING }, 
      tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      confidence: { type: Type.NUMBER }
    },
    required: ["name", "quantity", "volumeCuFt", "weightLbs", "category"],
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
    
    const exactKey = referenceKeys.find(k => k.toLowerCase() === lowerName);
    if (exactKey) {
        return {
            volumeCuFt: REFERENCE_ITEM_DATA[exactKey].volume, 
            weightLbs: REFERENCE_ITEM_DATA[exactKey].weight,
            standardizedName: exactKey
        };
    }

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

// --- Code Filter Helper ---
const postProcessFilter = (items: any[]): any[] => {
    return items.filter(item => {
        const name = item.name.toLowerCase();
        
        // 1. Allow explicit Boxes/Totes
        if (name.includes('box') || name.includes('tote') || name.includes('bin') || name.includes('crate')) {
            return true;
        }

        // 2. Check against Forbidden Keywords
        for (const forbidden of FORBIDDEN_KEYWORDS) {
            if (name === forbidden || name === `${forbidden}s` || name.includes(` ${forbidden} `) || name.endsWith(` ${forbidden}`) || name.startsWith(`${forbidden} `)) {
                 return false;
            }
        }
        return true;
    });
};


export const analyzeImageForInventory = async (base64Data: string): Promise<InventoryItem[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", // Upgrade to Pro model for better reasoning and detection
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Data } },
          { text: "List all furniture and distinct items." },
        ],
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_IMAGE,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2, 
        topP: 0.95,
        topK: 40,
      },
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No data returned from AI");

    const rawItems = JSON.parse(jsonText);
    const filteredItems = postProcessFilter(rawItems); 
    return mapRawItemsToInventory(filteredItems);

  } catch (error) {
    console.error("Gemini Image Analysis Error:", error);
    throw error;
  }
};

export const analyzeVideoFrames = async (frames: string[]): Promise<InventoryItem[]> => {
    if (!frames || frames.length === 0) return [];

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // Construct multipart request with all frames
        const parts = frames.map(frame => ({
            inlineData: { mimeType: "image/jpeg", data: frame }
        }));
        
        // Add text prompt as the last part
        parts.push({ text: "Analyze this sequence of frames from a walkthrough. Identify unique items." } as any);

        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview", // Upgrade to Pro model for better multi-frame consolidation
            contents: { parts },
            config: {
                systemInstruction: SYSTEM_INSTRUCTION_VIDEO,
                responseMimeType: "application/json",
                responseSchema: RESPONSE_SCHEMA,
                temperature: 0.2,
            },
        });

        const jsonText = response.text;
        if (!jsonText) throw new Error("No data returned from AI Video Analysis");

        const rawItems = JSON.parse(jsonText);
        const filteredItems = postProcessFilter(rawItems);
        return mapRawItemsToInventory(filteredItems);

    } catch (error) {
        console.error("Gemini Video Analysis Error:", error);
        throw error;
    }
};

export const parseVoiceCommand = async (transcript: string): Promise<InventoryItem[]> => {
  if (!transcript || !transcript.trim()) return [];

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelParams = {
      model: "gemini-2.5-flash", // Keep flash for fast text processing
      contents: { parts: [{ text: transcript }] },
  };

  try {
    const response = await ai.models.generateContent({
      ...modelParams,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_VOICE,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
      },
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No data returned from AI");
    
    const rawItems = JSON.parse(jsonText);
    const filteredItems = postProcessFilter(rawItems); // Apply hard filter
    return mapRawItemsToInventory(filteredItems);

  } catch (error: any) {
    console.warn("Gemini Voice Analysis Structured Mode Failed, retrying with fallback...", error);
    try {
        const fallbackResponse = await ai.models.generateContent({
            ...modelParams,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION_VOICE + "\nIMPORTANT: Return ONLY a raw JSON array.",
                responseMimeType: "application/json",
                temperature: 0,
            }
        });
        
        const fallbackText = fallbackResponse.text;
        if (!fallbackText) throw new Error("No data returned from AI (Fallback)");
        
        const cleanedText = fallbackText.replace(/```json/g, '').replace(/```/g, '').trim();
        const rawItems = JSON.parse(cleanedText);
        const filteredItems = postProcessFilter(rawItems);
        return mapRawItemsToInventory(filteredItems);
    } catch (fallbackError) {
        console.error("Gemini Voice Analysis Fallback Error:", fallbackError);
        throw fallbackError;
    }
  }
};

export const estimateItemStats = async (name: string, category: string): Promise<{ volumeCuFt: number, weightLbs: number }> => {
  const refStats = lookupReferenceStats(name);
  if (refStats) {
      return { volumeCuFt: refStats.volumeCuFt, weightLbs: refStats.weightLbs };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [{ text: `Estimate volume/weight for: ${name} (Category: ${category}). Return JSON {volumeCuFt, weightLbs}.` }] },
      config: {
        systemInstruction: `Moving estimator. Estimate stats. Return 0 if item is negligible/clutter.`,
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                volumeCuFt: { type: Type.NUMBER },
                weightLbs: { type: Type.NUMBER }
            },
            required: ["volumeCuFt", "weightLbs"]
        },
        temperature: 0.2,
      }
    });
    
    const text = response.text;
    if (!text) return { volumeCuFt: 0, weightLbs: 0 };
    
    return JSON.parse(text);
  } catch (error) {
    return { volumeCuFt: 0, weightLbs: 0 };
  }
}

const mapRawItemsToInventory = (rawItems: any[]): InventoryItem[] => {
  return rawItems.map((item: any) => {
    const ref = lookupReferenceStats(item.name);
    
    return {
        id: crypto.randomUUID(),
        name: ref ? ref.standardizedName! : item.name,
        quantity: item.quantity,
        volumeCuFt: ref ? ref.volumeCuFt : (item.volumeCuFt || 0),
        weightLbs: ref ? ref.weightLbs : (item.weightLbs || 0),
        category: item.category || "Misc",
        tags: item.tags || [],
        selected: true,
        confidence: item.confidence || 0.9,
    };
  });
};
