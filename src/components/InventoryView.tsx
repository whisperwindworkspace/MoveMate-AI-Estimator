import React from 'react';
import { InventoryItem, AppSettings, JobDetails } from '../types';
import { Truck, Plus, Box, FileText, ArrowRight, Package } from 'lucide-react';
import CameraInput from './CameraInput';
import VoiceInput from './VoiceInput';
import InventoryList from './InventoryList';
import { dbService } from '../services/dbService';

interface InventoryViewProps {
  settings: AppSettings;
  jobDetails: JobDetails;
  items: InventoryItem[];
  setItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  isAnalyzing: boolean;
  error: string | null;
  onImageCaptured: (base64: string) => Promise<void>;
  onVideoCaptured: (frames: string[]) => Promise<void>;
  onVoiceResult: (transcript: string) => Promise<void>;
  onToggleSelect: (id: string) => Promise<void>;
  onSelectAll: (select: boolean) => Promise<void>;
  onUpdateQuantity: (id: string, d: number) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onEditItem: (item: InventoryItem) => void;
  onAddItem: () => void;
  onReview: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  settings,
  jobDetails,
  items,
  setItems,
  isAnalyzing,
  error,
  onImageCaptured,
  onVideoCaptured,
  onVoiceResult,
  onToggleSelect,
  onSelectAll,
  onUpdateQuantity,
  onDeleteItem,
  onEditItem,
  onAddItem,
  onReview
}) => {
  const activeItems = items.filter(i => i.selected);
  const boxCount = activeItems.filter(i => i.category === 'Box').reduce((acc, i) => acc + i.quantity, 0);
  const otherCount = activeItems.filter(i => i.category !== 'Box').reduce((acc, i) => acc + i.quantity, 0);

  return (
    <>
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 transition-colors">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Truck style={{ color: settings.primaryColor }} size={24} /> {settings.companyName}
            </h1>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium ml-8">
                {jobDetails.jobId || (jobDetails.customerName ? `${jobDetails.customerName}` : "New Inventory")}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onAddItem} className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium transition">
                <Plus size={16} /> Add Item
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">

        {items.length > 0 ? (
            <div className="mb-4 bg-slate-900 dark:bg-slate-800 text-white rounded-xl p-4 shadow-lg grid grid-cols-2 gap-2 animate-in slide-in-from-top-2">
                <div className="flex flex-col items-center border-r border-slate-700">
                        <div className="text-xs text-slate-400 flex items-center gap-1 mb-1"><Package size={12}/> Bx</div>
                    <div className="font-bold text-sm sm:text-lg">{boxCount}</div>
                </div>
                <div className="flex flex-col items-center">
                        <div className="text-xs text-slate-400 flex items-center gap-1 mb-1"><FileText size={12}/> Itm</div>
                    <div className="font-bold text-sm sm:text-lg">{otherCount}</div>
                </div>
            </div>
        ) : (
            !isAnalyzing && (
                <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300">
                    <strong>Scan Your Items:</strong> Capture single photos of furniture, or use "Video Mode" to walk through a room.
                </div>
            )
        )}

        {error && <div className="mb-6 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>}

        <div className="relative">
            <CameraInput 
                onImageCaptured={onImageCaptured}
                onVideoCaptured={onVideoCaptured}
                isAnalyzing={isAnalyzing} 
                extraAction={<VoiceInput onVoiceResult={onVoiceResult} isProcessing={isAnalyzing} variant="inline" />}
            />
        </div>
        
        {items.length > 0 && (
            <div className="flex items-center justify-between mb-4 mt-8">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Box size={18} className="text-slate-400"/> Inventory <span className="text-xs text-slate-400">({items.length})</span>
                </h2>
                <button onClick={async () => { setItems([]); await Promise.all(items.map(i => dbService.deleteItem(i.id))); }} className="text-xs text-red-400 hover:text-red-600 font-medium">Clear All</button>
            </div>
        )}

        <InventoryList 
            items={items}
            onToggleSelect={onToggleSelect}
            onSelectAll={onSelectAll}
            onUpdateQuantity={onUpdateQuantity}
            onDeleteItem={onDeleteItem}
            onEditItem={onEditItem}
        />
      </main>

      {/* Floating Action Button for Summary */}
      {items.length > 0 && (
        <div className="fixed bottom-6 left-0 right-0 px-4 z-30 flex justify-center pointer-events-none">
            <button
                onClick={onReview}
                className="pointer-events-auto shadow-xl shadow-blue-900/20 bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 py-3 font-bold text-lg flex items-center gap-2 transition-all active:scale-95 animate-in slide-in-from-bottom-4"
            >
                Review Inventory <ArrowRight size={20} />
            </button>
        </div>
      )}
    </>
  );
};