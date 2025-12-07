import React, { useState, useEffect } from 'react';
import { InventoryItem } from '../types';
import {
  CATEGORIES,
  ITEM_TAGS,
  STANDARD_MOVING_ITEMS,
  FORBIDDEN_KEYWORDS,
} from '../constants';
import { X, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { estimateItemStats } from '../services/geminiService';
import LoadingOverlay from './LoadingOverlay';

interface ItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Partial<InventoryItem>) => void;
  initialData?: InventoryItem;
}

const ItemFormModal: React.FC<ItemFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const [formData, setFormData] = useState<Partial<InventoryItem>>({
    name: '',
    quantity: 1,
    volumeCuFt: 0,
    weightLbs: 0,
    category: 'Misc',
    tags: [],
    selected: true,
  });
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);

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
          selected: true,
        });
        setImagePreview(null);
      }
      setWarningMsg(null);
    }
  }, [isOpen, initialData]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    if (name === 'quantity') {
      const num = parseInt(value || '0', 10);
      setFormData((prev) => ({
        ...prev,
        quantity: isNaN(num) ? 0 : Math.max(0, num),
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleTagToggle = (tag: string) => {
    setFormData((prev) => {
      const currentTags = prev.tags || [];
      if (currentTags.includes(tag)) {
        return { ...prev, tags: currentTags.filter((t) => t !== tag) };
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
        setFormData((prev) => ({ ...prev, imageUrl: result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    // Client-side validation for forbidden items
    const nameLower = formData.name.toLowerCase();
    for (const forbidden of FORBIDDEN_KEYWORDS) {
      if (
        nameLower.includes(forbidden) &&
        !nameLower.includes('box') &&
        !nameLower.includes('tote')
      ) {
        setWarningMsg(
          `Please do not list small loose items like "${forbidden}". Pack them in a box and list "Box" instead.`,
        );
        return;
      }
    }

    let finalData = { ...formData };

    setIsEstimating(true);
    try {
      const stats = await estimateItemStats(
        formData.name,
        finalData.category || 'Misc',
      );
      finalData.volumeCuFt = stats.volumeCuFt;
      finalData.weightLbs = stats.weightLbs;
    } catch (e) {
      console.warn('Failed to auto-estimate stats on save', e);
    } finally {
      setIsEstimating(false);
    }

    onSave(finalData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 text-slate-100 rounded-2xl shadow-2xl w-full max-w-xl border border-slate-800 relative overflow-hidden">
        {isEstimating && <LoadingOverlay message="Estimating size and weight..." />}

        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Add / Edit Item</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Use AI suggestions or enter details manually.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-800 transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {warningMsg && (
          <div className="flex items-start gap-2 px-4 py-2 bg-amber-500/10 text-amber-300 border-b border-amber-500/40 text-xs">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>{warningMsg}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)] gap-4">
            {/* Left column: main fields */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Item Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name || ''}
                  onChange={handleChange}
                  placeholder="e.g. Sofa, Sectional"
                  className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    name="quantity"
                    min={0}
                    value={formData.quantity ?? 0}
                    onChange={handleChange}
                    className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Volume (cu ft)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="volumeCuFt"
                    value={formData.volumeCuFt ?? 0}
                    onChange={handleChange}
                    className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Weight (lbs)
                  </label>
                  <input
                    type="number"
                    step="1"
                    name="weightLbs"
                    value={formData.weightLbs ?? 0}
                    onChange={handleChange}
                    className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Category
                </label>
                <select
                  name="category"
                  value={formData.category || 'Misc'}
                  onChange={handleChange}
                  className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Tags
                </label>
                <div className="flex flex-wrap gap-2">
                  {ITEM_TAGS.map((tag) => {
                    const active = formData.tags?.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleTagToggle(tag)}
                        className={`px-2.5 py-1 rounded-full text-[11px] border transition ${
                          active
                            ? 'bg-blue-500/90 border-blue-400 text-white'
                            : 'bg-slate-800/80 border-slate-600 text-slate-200 hover:bg-slate-700'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Quick Presets
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {STANDARD_MOVING_ITEMS.slice(0, 18).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          name: item,
                          category: prev.category || 'Misc',
                        }))
                      }
                      className="px-2 py-1 rounded-md bg-slate-800 text-[11px] text-slate-100 border border-slate-700 hover:bg-slate-700"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right column: image & AI hints */}
            <div className="space-y-3 border-l border-slate-800 pl-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Reference Image
                </label>
                <div className="aspect-square rounded-xl border border-dashed border-slate-700 bg-slate-900/60 flex items-center justify-center overflow-hidden">
                  {imagePreview ? (
                    <img
                      src={imagePreview}
                      alt="Item preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-slate-500 text-xs">
                      <ImageIcon className="w-6 h-6 mb-1" />
                      <span>Upload an image for better estimates</span>
                    </div>
                  )}
                </div>
                <label className="mt-2 inline-flex items-center justify-center px-3 py-1.5 rounded-md border border-slate-700 text-xs font-medium text-slate-100 bg-slate-900 hover:bg-slate-800 cursor-pointer">
                  <span>Upload Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="text-[11px] text-slate-400 space-y-1.5 bg-slate-900/70 rounded-lg p-2 border border-slate-800">
                <p className="font-semibold text-slate-200">
                  AI Estimation Tips
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Use standard names like in the presets list.</li>
                  <li>Upload a clear photo when the item is unusual.</li>
                  <li>
                    Volume/Weight will be auto-filled using the AI reference
                    table.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-slate-800">
            <p className="text-[11px] text-slate-500 max-w-[240px]">
              Items marked as selected will be included in the inventory
              summary...
            </p>
            <button
              type="submit"
              disabled={isEstimating}
              className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-sm transition flex justify-center items-center gap-2 disabled:opacity-70"
            >
              Save Item
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ItemFormModal;
