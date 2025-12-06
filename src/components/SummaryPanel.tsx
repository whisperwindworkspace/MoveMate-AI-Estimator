
import React, { useEffect, useState, useRef } from 'react';
import { InventoryItem, CRMConfig, JobDetails, PackingRequirements } from '../types';
import { Send, Box, Package, CheckCircle } from 'lucide-react';
import { dbService } from '../services/dbService';
import { sendInventoryEmail } from '../services/emailService';

interface SummaryPanelProps {
  items: InventoryItem[];
  crmConfig: CRMConfig;
  jobDetails: JobDetails;
  adminEmail: string;
  companyName: string;
  onUpdateJobDetails: (details: JobDetails) => void;
  companyId?: string | null;
  sessionId: string;
}

const EMPTY_PACKING: PackingRequirements = {
  tvBox: 0,
  wardrobeBox: 0,
  mirrorBox: 0,
  mattressCover: 0,
  generalNotes: '',
};

const SummaryPanel: React.FC<SummaryPanelProps> = ({
  items,
  crmConfig,
  jobDetails,
  adminEmail,
  companyName,
  onUpdateJobDetails,
  companyId,
  sessionId,
}) => {
  const [localJobDetails, setLocalJobDetails] = useState<JobDetails>(jobDetails);
  const [packing, setPacking] = useState<PackingRequirements>(
    jobDetails.packingRequirements || EMPTY_PACKING
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  
  // Lock refs
  const submittingRef = useRef(false);
  const lastSubmittedJobIdRef = useRef<string | null>(null);

  // Keep local state in sync if parent updates jobDetails
  useEffect(() => {
    setLocalJobDetails(jobDetails);
    setPacking(jobDetails.packingRequirements || EMPTY_PACKING);
  }, [jobDetails]);

  // Use simple truthy check for selection to strictly match InventoryList.tsx logic
  const selectedItems = items.filter(i => i.selected);
  const boxCount = selectedItems.filter(i => i.category === 'Box').reduce((sum, i) => sum + i.quantity, 0);
  const otherCount = selectedItems.filter(i => i.category !== 'Box').reduce((sum, i) => sum + i.quantity, 0);

  // FIX: Multiply unit volume/weight by quantity
  const totalVolume = selectedItems.reduce((sum, i) => sum + ((i.volumeCuFt || 0) * i.quantity), 0);
  const totalWeight = selectedItems.reduce((sum, i) => sum + ((i.weightLbs || 0) * i.quantity), 0);
  const totalPieces = selectedItems.reduce((sum, i) => sum + i.quantity, 0);

  const handleJobFieldChange = (field: keyof JobDetails, value: string) => {
    setLocalJobDetails(prev => ({ ...prev, [field]: value }));
    // Clear error message when user types
    if (statusMessage && (field === 'customerName' || field === 'moveDate')) {
        setStatusMessage(null);
    }
  };

  const handlePackingChange = (field: keyof PackingRequirements, value: number | string) => {
    setPacking(prev => {
      const updated = { ...prev, [field]: value };
      setLocalJobDetails(jd => ({ ...jd, packingRequirements: updated }));
      return updated;
    });
  };

  const handleSubmitInventory = async (e?: React.MouseEvent) => {
    // Prevent double invocation if button is clicked quickly or strict mode effects
    if (e) e.preventDefault();
    if (submittingRef.current) return;

    // 1. Validate Items
    if (selectedItems.length === 0) {
      setStatusMessage('Please select at least one item before submitting.');
      return;
    }

    // 2. Validate Mandatory Fields
    if (!localJobDetails.customerName || !localJobDetails.customerName.trim()) {
      setStatusMessage('Customer Name is required.');
      return;
    }

    if (!localJobDetails.moveDate) {
      setStatusMessage('Move Date is required.');
      return;
    }

    // 3. Validate Company Context (Strict Security)
    if (!companyId) {
        // This is a fail-safe. App.tsx should block this earlier, but we ensure no submission passes without an ID.
        // Try to recover ID from URL if prop is missing (edge case)
        const urlParams = new URLSearchParams(window.location.search);
        const cidFromUrl = urlParams.get('cid');
        
        if (!cidFromUrl) {
            console.error("Submission blocked: Missing Company ID context.");
            setStatusMessage('Error: Unauthorized submission attempt. Missing Company ID.');
            return;
        }
    }

    const normalizedDetails: JobDetails = {
        ...localJobDetails,
        packingRequirements: packing,
    };

    // Determine the final Job ID
    const finalJobId = normalizedDetails.jobId || sessionId;

    // Prevent duplicate submission for the exact same Job ID in this session
    if (lastSubmittedJobIdRef.current === finalJobId) {
        console.warn("Duplicate submission prevented for Job ID:", finalJobId);
        setIsSubmitted(true); // Re-show success screen
        return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const cid = companyId || urlParams.get('cid');

      console.log('--- Submission Started ---');
      console.log('Detected Company ID:', cid);
      console.log('Target Job ID:', finalJobId);

      // 1) Persist job row (usage, analytics) if we know the company
      if (cid) {
        try {
            console.log('Calling dbService.createJob...');
            await dbService.createJob({
              id: finalJobId, // Use the consistent ID
              company_id: cid,
              customer_name: normalizedDetails.customerName || 'Unknown',
              customer_email: normalizedDetails.customerEmail || null,
              customer_phone: normalizedDetails.customerPhone || null,
              move_date: normalizedDetails.moveDate || null,
              origin_address: normalizedDetails.originAddress || null,
              destination_address: normalizedDetails.destinationAddress || null,
              status: 'NEW',
              crm_status: 'skipped',
              job_id_input: normalizedDetails.jobId || '',
              total_volume: totalVolume,
              total_weight: totalWeight,
              item_count: selectedItems.length,
            });
            // Mark as successfully submitted to prevent retries
            lastSubmittedJobIdRef.current = finalJobId;
        } catch (dbError: any) {
            console.error("Database submission failed (Logging only, continuing to email)", JSON.stringify(dbError, null, 2));
            // We log but continue, so the user can still receive the email
        }
      } else {
          console.warn('Submission skipping database log: No Company ID found. Check URL parameters or Slug.');
      }

      // 2) Build email body summary - AGGREGATED
      
      // Group items by name to avoid duplicate lines (e.g. 2 separate "Nightstand" entries become "2 x Nightstand")
      const aggregatedItems: Record<string, number> = {};
      selectedItems.forEach(item => {
        const name = item.name || 'Unknown Item';
        const qty = item.quantity || 1;
        aggregatedItems[name] = (aggregatedItems[name] || 0) + qty;
      });

      // Sort alphabetically
      const sortedNames = Object.keys(aggregatedItems).sort((a, b) => a.localeCompare(b));
      
      // Build lines
      const itemLines = sortedNames.map(name => `${aggregatedItems[name]} x ${name}`);

      let emailBody = `Company: ${companyName}
Customer: ${normalizedDetails.customerName}
`;

      // Only include Job ID line if it exists
      if (normalizedDetails.jobId && normalizedDetails.jobId.trim() !== '') {
        emailBody += `Reference / Job ID (optional): ${normalizedDetails.jobId}\n`;
      }

      emailBody += `Move date: ${normalizedDetails.moveDate}

Inventory Summary
**Inventory** (${totalPieces} items)
Total volume: ${totalVolume.toFixed(2)} ft³
Total weight: ${Math.round(totalWeight)} lbs

${itemLines.join('\n')}`;

      // STRICT SUBJECT LINE
      const subjectHeader = "New Inventory";

      // 3) Send email via Edge Function / Resend
      console.log('Sending email...');
      await sendInventoryEmail({
        tenantName: companyName,
        tenantAdminEmail: adminEmail,
        subjectHeader,
        body: emailBody,
      });
      console.log('Email sent successfully.');

      setStatusMessage('Inventory submitted successfully.');
      onUpdateJobDetails(normalizedDetails);
      
      // TRIGGER SUCCESS SCREEN
      setIsSubmitted(true);
      
    } catch (err: any) {
      console.error('Submit inventory failed', err);
      setStatusMessage(
        'Your submission was saved, but there was a problem sending the email. Please contact support.'
      );
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  if (isSubmitted) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-in fade-in zoom-in duration-300">
          <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mb-6 shadow-sm">
            <CheckCircle size={48} strokeWidth={3} />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4">
            Submission Complete!
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-300 mb-8 max-w-md leading-relaxed">
            Thank you, <strong>{localJobDetails.customerName}</strong>.<br/>
            Your inventory has been successfully sent to <strong>{companyName}</strong>.
          </p>
          
          {localJobDetails.jobId && (
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 max-w-sm w-full mb-8">
                <div className="text-sm text-slate-500 dark:text-slate-400 mb-1 uppercase font-semibold tracking-wider">Reference ID</div>
                <div className="text-xl font-mono font-bold text-slate-800 dark:text-slate-200 tracking-wide">
                    {localJobDetails.jobId}
                </div>
            </div>
          )}

          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-200 dark:shadow-blue-900/20 transition-all active:scale-95"
          >
            Start New Estimate
          </button>
        </div>
      );
  }

  return (
    <section className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Package className="w-5 h-5" />
          Inventory Summary
        </h2>
        <span className="text-xs text-slate-500">
          {totalPieces} piece{totalPieces === 1 ? '' : 's'} across {selectedItems.length} entries
        </span>
      </div>

      {/* Top-level summary stats (Volume/Weight hidden here, shown in email) */}
      <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-slate-500">
            <Box className="w-4 h-4" />
            Boxes
          </div>
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {boxCount}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-slate-500">
            <Package className="w-4 h-4" />
            Other items
          </div>
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {otherCount}
          </div>
        </div>
      </div>

      {/* Job details */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900 space-y-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Job details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500">
              Customer name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={localJobDetails.customerName || ''}
              onChange={e => handleJobFieldChange('customerName', e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 ${
                  !localJobDetails.customerName && statusMessage?.includes('Customer Name') 
                  ? 'border-red-500 focus:ring-red-500' 
                  : 'border-slate-300 dark:border-slate-700 focus:ring-indigo-500'
              }`}
              placeholder="John Smith"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500">
              Reference / Job ID (optional)
            </label>
            <input
              type="text"
              value={localJobDetails.jobId || ''}
              onChange={e => handleJobFieldChange('jobId', e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Internal job reference"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500">
                Move date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              value={localJobDetails.moveDate || ''}
              onChange={e => handleJobFieldChange('moveDate', e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 ${
                !localJobDetails.moveDate && statusMessage?.includes('Move Date') 
                ? 'border-red-500 focus:ring-red-500' 
                : 'border-slate-300 dark:border-slate-700 focus:ring-indigo-500'
            }`}
            />
          </div>
        </div>
      </div>

      {/* Packing requirements */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900 space-y-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Packing requirements (optional)
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500">TV boxes</label>
            <input
              type="number"
              min={0}
              value={packing.tvBox || 0}
              onChange={e =>
                handlePackingChange('tvBox', Math.max(0, Number(e.target.value || 0)))
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500">Wardrobe boxes</label>
            <input
              type="number"
              min={0}
              value={packing.wardrobeBox || 0}
              onChange={e =>
                handlePackingChange(
                  'wardrobeBox',
                  Math.max(0, Number(e.target.value || 0)),
                )
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500">Mirror boxes</label>
            <input
              type="number"
              min={0}
              value={packing.mirrorBox || 0}
              onChange={e =>
                handlePackingChange(
                  'mirrorBox',
                  Math.max(0, Number(e.target.value || 0)),
                )
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500">
              Mattress covers
            </label>
            <input
              type="number"
              min={0}
              value={packing.mattressCover || 0}
              onChange={e =>
                handlePackingChange(
                  'mattressCover',
                  Math.max(0, Number(e.target.value || 0)),
                )
              }
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="space-y-1 text-sm">
          <label className="block text-xs font-medium text-slate-500">
            Packing notes
          </label>
          <textarea
            value={packing.generalNotes || ''}
            onChange={e => handlePackingChange('generalNotes', e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Anything the crew should know about packing, access, or special handling."
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmitInventory}
          disabled={isSubmitting || selectedItems.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
          {isSubmitting ? 'Sending…' : 'Send inventory'}
        </button>
      </div>

      {statusMessage && (
        <div className={`text-xs mt-1 font-medium ${
            statusMessage.includes('required') || statusMessage.includes('problem') 
            ? 'text-red-500' 
            : 'text-green-600 dark:text-green-400'
        }`}>
          {statusMessage}
        </div>
      )}
    </section>
  );
};

export default SummaryPanel;
