
import React from 'react';
import { InventoryItem } from '../types';
import { Trash2, Package, Truck, Box, Sofa, CheckCircle2, Circle, Edit2, Zap, Monitor, Armchair, AlertTriangle, CheckSquare, Square } from 'lucide-react';

interface InventoryListProps {
  items: InventoryItem[];
  onToggleSelect: (id: string) => void;
  onSelectAll: (select: boolean) => void;
  onUpdateQuantity: (id: string, delta: number) => void;
  onDeleteItem: (id: string) => void;
  onEditItem: (item: InventoryItem) => void;
}

const InventoryList: React.FC<InventoryListProps> = ({ 
  items, 
  onToggleSelect, 
  onSelectAll,
  onUpdateQuantity,
  onDeleteItem,
  onEditItem
}) => {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 dark:text-slate-600">
        <Package size={48} className="mx-auto mb-4 opacity-50" />
        <p>No items added yet. Capture items or add manually.</p>
      </div>
    );
  }

  const allSelected = items.length > 0 && items.every(i => i.selected);
  const selectedCount = items.filter(i => i.selected).length;

  const getIcon = (category?: string) => {
    const cat = category?.toLowerCase() || '';
    if (cat.includes('box')) return <Box size={20} className="text-amber-600 dark:text-amber-500" />;
    if (cat.includes('furniture')) return <Sofa size={20} className="text-indigo-600 dark:text-indigo-400" />;
    if (cat.includes('appliance')) return <Truck size={20} className="text-slate-600 dark:text-slate-400" />;
    if (cat.includes('electronic')) return <Monitor size={20} className="text-cyan-600 dark:text-cyan-400" />;
    if (cat.includes('decor')) return <Armchair size={20} className="text-pink-600 dark:text-pink-400" />;
    return <Package size={20} className="text-blue-600 dark:text-blue-400" />;
  };

  const getTagColor = (tag: string) => {
      const t = tag.toLowerCase();
      if (t === 'fragile') return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
      if (t === 'heavy') return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800';
      if (t === 'valuable') return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800';
      return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
  };

  return (
    <div className="space-y-4 pb-24">
        {/* Bulk Actions Header */}
        <div className="sticky top-[73px] z-30 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 py-3 mb-2 flex justify-between items-center -mx-4 px-4 shadow-sm transition-colors">
            <div 
                className="flex items-center gap-2 cursor-pointer group"
                onClick={() => onSelectAll(!allSelected)}
            >
                {allSelected ? (
                    <CheckSquare size={20} className="text-blue-600 dark:text-blue-500" />
                ) : (
                    <Square size={20} className="text-slate-400 dark:text-slate-500 group-hover:text-blue-500" />
                )}
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">
                    {allSelected ? 'Deselect All' : 'Select All'}
                </span>
            </div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-2 py-1 rounded">
                {selectedCount} / {items.length} Selected
            </div>
        </div>

      {items.map((item) => (
        <div 
          key={item.id} 
          className={`relative bg-white dark:bg-slate-900 rounded-xl shadow-sm border transition-all duration-200 ${
            item.selected 
            ? 'border-blue-200 dark:border-blue-900 ring-1 ring-blue-50 dark:ring-blue-900/20 opacity-100' 
            : 'border-slate-100 dark:border-slate-800 opacity-60 bg-slate-50 dark:bg-slate-950 grayscale-[0.5]'
          }`}
        >
          {/* Selection Toggle Overlay */}
          <div 
            className="absolute top-0 left-0 bottom-0 w-12 cursor-pointer z-10 flex items-center justify-center border-r border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-l-xl group"
            onClick={() => onToggleSelect(item.id)}
          >
            {item.selected ? (
              <CheckCircle2 className="text-blue-500 fill-white dark:fill-slate-900" size={24} />
            ) : (
              <Circle className="text-slate-300 dark:text-slate-600 fill-white dark:fill-slate-900 group-hover:text-slate-400 dark:group-hover:text-slate-500" size={24} />
            )}
          </div>

          <div className="p-4 pl-14">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-3">
                {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="w-12 h-12 rounded-lg object-cover border border-slate-100 dark:border-slate-700 shadow-sm" />
                ) : (
                    <span className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                        {getIcon(item.category)}
                    </span>
                )}
                
                <div>
                    <h4 className={`font-semibold text-sm sm:text-base flex items-center gap-2 ${item.selected ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-600 line-through'}`}>
                        {item.name}
                        {item.confidence !== undefined && item.confidence < 0.7 && item.selected && (
                            <span className="text-orange-500" title="Low confidence AI detection. Please verify.">
                                <AlertTriangle size={14} />
                            </span>
                        )}
                    </h4>
                    <div className="flex flex-wrap gap-1 mt-1">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {item.category || 'Misc'}
                        </span>
                        {item.tags && item.tags.map(tag => (
                            <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded border ${getTagColor(tag)}`}>
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                 <button 
                    onClick={() => onEditItem(item)}
                    className="text-slate-400 hover:text-blue-500 p-2 rounded hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => onDeleteItem(item.id)}
                    className="text-slate-400 hover:text-red-500 p-2 rounded hover:bg-red-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
              </div>
            </div>

            <div className={`grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-dashed border-slate-100 dark:border-slate-800`}>
               {/* Stats */}
               <div className="space-y-1">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Volume (unit)</div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.volumeCuFt} cf</div>
               </div>
               <div className="space-y-1">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Weight (unit)</div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.weightLbs} lbs</div>
               </div>
            </div>
            
            <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                    <button 
                        onClick={() => onUpdateQuantity(item.id, -1)}
                        className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-700 rounded shadow-sm text-slate-600 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50"
                        disabled={!item.selected || item.quantity <= 1}
                    >
                        -
                    </button>
                    <span className="w-10 text-center font-semibold text-slate-700 dark:text-slate-200">{item.quantity}</span>
                    <button 
                         onClick={() => onUpdateQuantity(item.id, 1)}
                         className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-700 rounded shadow-sm text-slate-600 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50"
                         disabled={!item.selected}
                    >
                        +
                    </button>
                </div>
                <div className="text-right">
                    <div className="text-xs text-slate-400 dark:text-slate-500">Total</div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        {Math.round(item.volumeCuFt * item.quantity)} cf
                    </div>
                </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default InventoryList;
