
import React, { useState, useEffect } from 'react';
import { InventoryItem } from '../types';
import { CATEGORIES, ITEM_TAGS, STANDARD_MOVING_ITEMS } from '../constants';
import { X, Upload, Image as ImageIcon, Sparkles, Loader2, Check } from 'lucide-react';
import { estimateItemStats } from '../services/geminiService';

interface ItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Partial<InventoryItem>) => void;
  initialData?: InventoryItem;
}

const ItemFormModal: React.FC<ItemFormModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [formData, setFormData] = useState<Partial<InventoryItem>>({
    name: '',
    quantity: 1,
    volumeCuFt: 0,
    weightLbs: 0,
    category: 'Misc',
    tags: [],
    selected: true
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({ ...initialData });
        setImagePreview(initialData.imageUrl || null);
      } else {
        setFormData({
            name: '',
            quantity: 1,
            volumeCuFt: 0,
            weightLbs: 0,
            category: 'Misc',
            tags: [],
            selected: true
        });
        setImagePreview(null);
      }
    }
  }, [isOpen, initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'quantity' || name === 'volumeCuFt' || name === 'weightLbs' 
        ? parseFloat(value) || 0 
        : value
    }));
  };

  const handleTagToggle = (tag: string) => {
    setFormData(prev => {
      const currentTags = prev.tags || [];
      if (currentTags.includes(tag)) {
        return { ...prev, tags: currentTags.filter(t => t !== tag) };
      } else {
        return { ...prev, tags: [...currentTags, tag] };
      }
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setImagePreview(result);
        setFormData(prev => ({ ...prev, imageUrl: result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAutoEstimate = async () => {
    if (!formData.name) return;
    setIsEstimating(true);
    const stats = await estimateItemStats(formData.name, formData.category || 'Misc');
    setFormData(prev => ({
        ...prev,
        volumeCuFt: stats.volumeCuFt,
        weightLbs: stats.weightLbs
    }));
    setIsEstimating(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    onSave(formData);
    onClose();
  };

  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-100 dark:border-slate-700">
        <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-850">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">
            {initialData ? 'Edit Item' : 'Add New Item'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          {/* Image Upload */}
          <div className="flex justify-center">
             <div className="relative group">
                <div className={`w-32 h-32 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden ${imagePreview ? 'border-blue-500' : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700'}`}>
                    {imagePreview ? (
                        <img src={imagePreview} alt="Item" className="w-full h-full object-cover" />
                    ) : (
                        <div className="text-center text-slate-400 dark:text-slate-500">
                            <ImageIcon className="mx-auto mb-1 opacity-50" size={24}/>
                            <span className="text-xs">Add Photo</span>
                        </div>
                    )}
                    <label className="absolute inset-0 cursor-pointer flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition">
                         <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                </div>
             </div>
          </div>

          <form id="item-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Item Name</label>
              <div className="flex gap-2">
                <input
                    list="standard-items"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g. Sofa, Medium Box"
                    className="flex-1 p-2.5 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 dark:text-white placeholder-slate-400"
                    required
                />
                <button 
                    type="button"
                    onClick={handleAutoEstimate}
                    disabled={!formData.name || isEstimating}
                    className="px-3 py-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg border border-indigo-100 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 disabled:opacity-50"
                    title="Auto-estimate volume & weight with AI"
                >
                    {isEstimating ? <Loader2 className="animate-spin" size={20}/> : <Sparkles size={20}/>}
                </button>
              </div>
              <datalist id="standard-items">
                {STANDARD_MOVING_ITEMS.map(item => <option key={item} value={item} />)}
              </datalist>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map(cat => (
                    <button
                        key={cat}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, category: cat }))}
                        className={`text-xs py-2 px-1 rounded-lg border transition-all ${
                            formData.category === cat 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                            : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-blue-300'
                        }`}
                    >
                        {cat}
                    </button>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
               <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Quantity</label>
                  <input
                    type="number"
                    name="quantity"
                    min="1"
                    value={formData.quantity}
                    onChange={handleChange}
                    className="w-full p-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white rounded-lg"
                  />
               </div>
               <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Vol (cf)</label>
                  <input
                    type="number"
                    name="volumeCuFt"
                    step="0.1"
                    value={formData.volumeCuFt}
                    onChange={handleChange}
                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
               </div>
               <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Weight (lbs)</label>
                  <input
                    type="number"
                    name="weightLbs"
                    step="0.1"
                    value={formData.weightLbs}
                    onChange={handleChange}
                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
               </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Attributes</label>
              <div className="flex flex-wrap gap-2">
                {ITEM_TAGS.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleTagToggle(tag)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                      formData.tags?.includes(tag)
                        ? 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:border-indigo-800'
                        : 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </form>
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="item-form"
            className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-lg shadow-blue-200 dark:shadow-blue-900/30 transition"
          >
            Save Item
          </button>
        </div>
      </div>
    </div>
  );
};

export default ItemFormModal;
