
import React, { useState, useEffect } from 'react';
import { InventoryItem, JobDetails } from '../types';
import { dbService } from '../services/dbService';
import { analyzeImageForInventory, analyzeVideoFrames, parseVoiceCommand } from '../services/geminiService';

interface UseInventoryResult {
  items: InventoryItem[];
  setItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  isLoadingItems: boolean;
  isAnalyzing: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  jobDetails: JobDetails;
  setJobDetails: React.Dispatch<React.SetStateAction<JobDetails>>;
  handleImageCaptured: (base64: string) => Promise<void>;
  handleVideoCaptured: (frames: string[]) => Promise<void>;
  handleVoiceResult: (transcript: string) => Promise<void>;
  handleUpdateJobDetails: (details: JobDetails) => Promise<void>;
  handleToggleSelect: (id: string) => Promise<void>;
  handleSelectAll: (select: boolean) => Promise<void>;
  handleUpdateQuantity: (id: string, d: number) => Promise<void>;
  handleDeleteItem: (id: string) => Promise<void>;
  handleSaveItem: (data: Partial<InventoryItem>, editingId?: string) => Promise<void>;
}

export const useInventory = (sessionId: string, isLimitReached: boolean): UseInventoryResult => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<JobDetails>({});

  const activeJobId = jobDetails.jobId || sessionId;

  useEffect(() => {
    if (isLimitReached) return;

    const init = async () => {
        await dbService.checkConnection();
        setIsLoadingItems(true);
        const fetchedItems = await dbService.getItems(activeJobId);
        setItems(fetchedItems);
        setIsLoadingItems(false);
    };
    init();
  }, [activeJobId, isLimitReached]);

  const handleImageCaptured = async (base64: string) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const newItems = await analyzeImageForInventory(base64);
      const savedItems = [];
      for (const item of newItems) {
         const saved = await dbService.upsertItem(item, activeJobId);
         savedItems.push(saved);
      }
      setItems(prev => [...prev, ...savedItems]);
    } catch (err: any) {
      console.error(err);
      setError("Failed to analyze image. " + (err.message || ''));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleVideoCaptured = async (frames: string[]) => {
      setIsAnalyzing(true);
      setError(null);
      try {
          const newItems = await analyzeVideoFrames(frames);
          const savedItems = [];
          for (const item of newItems) {
              const saved = await dbService.upsertItem(item, activeJobId);
              savedItems.push(saved);
          }
          setItems(prev => [...prev, ...savedItems]);
      } catch (err) {
          console.error(err);
          setError("Failed to analyze video.");
      } finally {
          setIsAnalyzing(false);
      }
  };

  const handleVoiceResult = async (transcript: string) => {
    setIsAnalyzing(true);
    setError(null);
    try {
        const newItems = await parseVoiceCommand(transcript);
        const savedItems = [];
        for (const item of newItems) {
            const saved = await dbService.upsertItem(item, activeJobId);
            savedItems.push(saved);
        }
        setItems(p => [...p, ...savedItems]);
    } catch (err) { 
        console.error(err); 
        setError("Voice command failed."); 
    } finally { 
        setIsAnalyzing(false); 
    }
  };

  const handleUpdateJobDetails = async (details: JobDetails) => {
    const oldId = jobDetails.jobId || sessionId;
    setJobDetails(details);
    if (details.jobId && details.jobId !== oldId) {
       try {
         await dbService.updateJobId(oldId, details.jobId);
         const refreshed = await dbService.getItems(details.jobId);
         setItems(refreshed);
       } catch (e) { console.error(e); }
    }
  };

  const handleToggleSelect = async (id: string) => {
    setItems(currentItems => {
        const item = currentItems.find(i => i.id === id);
        if (item) {
            const updated = { ...item, selected: !item.selected };
            dbService.upsertItem(updated, activeJobId).catch(e => console.error("Toggle failed:", JSON.stringify(e, null, 2)));
            return currentItems.map(i => i.id === id ? updated : i);
        }
        return currentItems;
    });
  };

  const handleSelectAll = async (select: boolean) => {
      setItems(current => {
          const updated = current.map(i => ({ ...i, selected: select }));
          updated.forEach(i => dbService.upsertItem(i, activeJobId).catch(e => console.error("SelectAll failed:", JSON.stringify(e, null, 2))));
          return updated;
      });
  };

  const handleUpdateQuantity = async (id: string, d: number) => {
    setItems(current => {
        const item = current.find(i => i.id === id);
        if (item) {
            const updated = { ...item, quantity: Math.max(1, item.quantity + d) };
            dbService.upsertItem(updated, activeJobId).catch(e => console.error("Qty failed:", JSON.stringify(e, null, 2)));
            return current.map(i => i.id === id ? updated : i);
        }
        return current;
    });
  };

  const handleDeleteItem = async (id: string) => {
    setItems(current => current.filter(i => i.id !== id));
    await dbService.deleteItem(id);
  };

  const handleSaveItem = async (data: Partial<InventoryItem>, editingId?: string) => {
      if (editingId) {
          const updated = { ...data, id: editingId } as InventoryItem;
          setItems(current => current.map(i => i.id === editingId ? updated : i));
          await dbService.upsertItem(updated, activeJobId).catch(e => console.error("Save failed:", JSON.stringify(e, null, 2)));
      } else {
          const newItem = { ...data, id: crypto.randomUUID(), selected: true } as InventoryItem;
          setItems(current => [...current, newItem]);
          await dbService.upsertItem(newItem, activeJobId).catch(e => console.error("Create failed:", JSON.stringify(e, null, 2)));
      }
  };

  return {
    items, setItems, isLoadingItems, isAnalyzing, error, setError,
    jobDetails, setJobDetails,
    handleImageCaptured, handleVideoCaptured, handleVoiceResult,
    handleUpdateJobDetails, handleToggleSelect, handleSelectAll,
    handleUpdateQuantity, handleDeleteItem, handleSaveItem
  };
};
