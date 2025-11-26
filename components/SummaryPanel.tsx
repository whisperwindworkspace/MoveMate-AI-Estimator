import React, { useState } from 'react';
import { InventoryItem, CRMConfig, JobDetails, PackingRequirements } from '../types';
import {
  Send,
  FileText,
  Scale,
  Box,
  X,
  Mail,
  CheckCircle2,
  CloudLightning,
  Truck,
  Hash,
  User,
  Calendar,
  ArrowRight,
  PackageOpen,
  PenLine,
  Package,
  Loader2
} from 'lucide-react';
import { dbService } from '../services/dbService';
import { emailService } from '../services/emailService';

interface SummaryPanelProps {
  items: InventoryItem[];
  crmConfig: CRMConfig;
  jobDetails: JobDetails;
  adminEmail: string;
  companyName: string;
  onUpdateJobDetails: (details: JobDetails) => void;
}

const SummaryPanel: React.FC<SummaryPanelProps> = ({
  items,
  crmConfig,
  jobDetails,
  adminEmail,
  companyName,
  onUpdateJobDetails
}) => {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [modalStep, setModalStep] = useState<'DETAILS' | 'PACKING' | 'REVIEW'>('REVIEW');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');

  // Email Sending States
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSentSuccess, setEmailSentSuccess] = useState(false);

  // Local state for the details form
  const [inputMode, setInputMode] = useState<'JOB_ID' | 'MANUAL'>('JOB_ID');
  const [tempJobId, setTempJobId] = useState('');
  const [tempName, setTempName] = useState('');
  const [tempDate, setTempDate] = useState(new Date().toISOString().split('T')[0]);

  // Local state for packing reqs
  const [packingReqs, setPackingReqs] = useState<PackingRequirements>({
    tvBox: 0,
    wardrobeBox: 0,
    mirrorBox: 0,
    mattressCover: 0,
    generalNotes: ''
  });

  // Calculate totals for SELECTED items only
  const selectedItems = items.filter(i => i.selected);

  const totalVolume = selectedItems.reduce(
    (acc, item) => acc + item.volumeCuFt * item.quantity,
    0
  );
  const totalWeight = selectedItems.reduce(
    (acc, item) => acc + item.weightLbs * item.quantity,
    0
  );

  // Separation of counts
  const boxCount = selectedItems
    .filter(i => i.category === 'Box')
    .reduce((acc, i) => acc + i.quantity, 0);

  const otherCount = selectedItems
    .filter(i => i.category !== 'Box')
    .reduce((acc, i) => acc + i.quantity, 0);

  const getJobHeader = () => {
    if (jobDetails.jobId) return `Job ID: ${jobDetails.jobId}`;
    if (jobDetails.customerName)
      return `Customer: ${jobDetails.customerName} | Date: ${jobDetails.moveDate}`;
    return 'Draft Estimate';
  };

  const hasJobDetails = !!(
    jobDetails.jobId ||
    (jobDetails.customerName && jobDetails.moveDate)
  );

  // Validation check for the Details form
  const isDetailsValid =
    inputMode === 'JOB_ID'
      ? tempJobId.trim().length > 0
      : tempName.trim().length > 0 && tempDate.trim().length > 0;

  const handleReviewClick = () => {
    // If we have saved packing reqs, load them
    if (jobDetails.packingReqs) {
      setPackingReqs(jobDetails.packingReqs);
    }

    if (!hasJobDetails) {
      setModalStep('DETAILS');
      // Pre-fill fields if partially there
      setTempJobId(jobDetails.jobId || '');
      setTempName(jobDetails.customerName || '');
      setTempDate(jobDetails.moveDate || new Date().toISOString().split('T')[0]);
    } else {
      setModalStep('PACKING'); // Go to packing first if details exist
    }
    setEmailSentSuccess(false); // Reset
    setShowConfirmation(true);
  };

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMode === 'JOB_ID' && tempJobId) {
      onUpdateJobDetails({
        ...jobDetails,
        jobId: tempJobId,
        customerName: undefined,
        moveDate: undefined
      });
      setModalStep('PACKING');
    } else if (inputMode === 'MANUAL' && tempName && tempDate) {
      onUpdateJobDetails({
        ...jobDetails,
        customerName: tempName,
        moveDate: tempDate,
        jobId: undefined
      });
      setModalStep('PACKING');
    }
  };

  const handleSavePacking = () => {
    onUpdateJobDetails({
      ...jobDetails,
      packingReqs: packingReqs
    });
    setModalStep('REVIEW');
  };

  const updatePackingCount = (field: keyof PackingRequirements, delta: number) => {
    setPackingReqs(prev => ({
      ...prev,
      [field]: Math.max(0, (prev[field] as number) + delta)
    }));
  };

  const handleSendEmail = async () => {
    setIsSendingEmail(true);
    try {
      // Enrich job details with companyName for email tagging
      const enrichedJobDetails: JobDetails = {
        ...jobDetails,
        companyName
      };

      // Send email via Supabase Edge Function / Resend
      await emailService.sendInventoryEmail(adminEmail, enrichedJobDetails, items);

      // Also save the job record to DB to track the "Submission" stats
      const cid = new URLSearchParams(window.location.search).get('cid');
      // Only log the job if we actually know which company this session belongs to
      if (cid) {
        // fire-and-forget; no need to block UI
        void dbService.createJob({
          company_id: cid,
          customer_name: jobDetails.customerName || 'Unknown',
          job_id_input: jobDetails.jobId || '',
          total_volume: totalVolume,
          total_weight: totalWeight,
          item_count: selectedItems.length,
          crm_status: 'skipped' // Email only
        });
      } else {
        console.warn('No cid in URL; skipping job logging for email-only flow');
      }

      setEmailSentSuccess(true);

      // Close modal after short delay
      setTimeout(() => {
        setShowConfirmation(false);
        setEmailSentSuccess(false);
      }, 2500);
    } catch (e) {
      console.error('Failed to send email', e);
      alert('Could not send email. Please check your connection.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleCRMSync = async () => {
    setSyncStatus('syncing');

    try {
      // 1. Prepare Payload
      const payload = {
        company_id: (
          await dbService.getCompanyPublicProfile(
            new URLSearchParams(window.location.search).get('cid') || ''
          )
        ).id, // Best effort to get company ID if available via URL, otherwise might be null if purely transient
        customer_name: jobDetails.customerName || 'Unknown',
        job_id_input: jobDetails.jobId || '',
        total_volume: totalVolume,
        total_weight: totalWeight,
        item_count: selectedItems.length,
        crm_status: 'synced' as const,
        items: selectedItems.map(i => ({ name: i.name, qty: i.quantity })) // Simplified for CRM
      };

      // 2. Save to Database (for Admin Stats)
      const cid = new URLSearchParams(window.location.search).get('cid');
      if (cid) {
        payload.company_id = cid;
        await dbService.createJob({
          company_id: cid,
          customer_name: jobDetails.customerName || 'Unknown',
          job_id_input: jobDetails.jobId || '',
          total_volume: totalVolume,
          total_weight: totalWeight,
          item_count: selectedItems.length,
          crm_status: 'synced'
        });
      }

      // 3. Perform Real CRM POST Request
      if (crmConfig.isConnected && crmConfig.endpointUrl) {
        const response = await fetch(crmConfig.endpointUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${crmConfig.apiKey}`
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`CRM responded with ${response.status}`);
        }
      } else {
        // Fallback simulation if no URL provided but marked connected
        await new Promise(r => setTimeout(r, 1000));
      }

      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (e) {
      console.error('Sync failed', e);
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  };

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-40 p-4 pb-6 md:pb-4 transition-colors">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-end mb-4">
            <div className="grid grid-cols-2 gap-2 w-full mr-4 opacity-50 grayscale text-[10px] sm:text-xs">
              <div className="flex flex-col">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Package size={10} /> Bx
                </span>
                <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                  {boxCount}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <FileText size={10} /> Itm
                </span>
                <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                  {otherCount}
                </span>
              </div>
            </div>

            <button
              onClick={handleReviewClick}
              disabled={selectedItems.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-full shadow-lg shadow-blue-200 dark:shadow-blue-900/30 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95 font-semibold flex items-center gap-2 whitespace-nowrap"
              title="Review & Send"
            >
              Review <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[90vh] border border-slate-100 dark:border-slate-700">
            {/* MODAL HEADER */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-850">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                {modalStep === 'DETAILS'
                  ? 'Job Information'
                  : modalStep === 'PACKING'
                  ? 'Packing Requirements'
                  : 'Review & Send'}
              </h3>
              <button
                onClick={() => setShowConfirmation(false)}
                className="text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 p-1 rounded-full transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* MODAL BODY */}
            <div className="p-6 overflow-y-auto">
              {/* STEP 1: JOB DETAILS FORM */}
              {modalStep === 'DETAILS' && (
                <form onSubmit={handleSaveDetails} className="space-y-6">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
                    <Truck
                      size={20}
                      className="mb-2 text-blue-600 dark:text-blue-400"
                    />
                    Please provide the job details for this inventory so {companyName} could finish
                    your estimate/or prepare for your booked job properly.
                  </div>

                  <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setInputMode('JOB_ID')}
                      className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                        inputMode === 'JOB_ID'
                          ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-300 shadow-sm'
                          : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white'
                      }`}
                    >
                      Job ID
                    </button>
                    <button
                      type="button"
                      onClick={() => setInputMode('MANUAL')}
                      className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                        inputMode === 'MANUAL'
                          ? 'bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-300 shadow-sm'
                          : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white'
                      }`}
                    >
                      Manual Entry
                    </button>
                  </div>

                  {inputMode === 'JOB_ID' ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Job ID Number <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Hash
                          className="absolute left-3 top-3 text-slate-400"
                          size={20}
                        />
                        <input
                          type="text"
                          required
                          value={tempJobId}
                          onChange={e => setTempJobId(e.target.value)}
                          placeholder="e.g. JB-4923"
                          className="w-full pl-10 pr-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white"
                          autoFocus
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Customer Name <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <User
                            className="absolute left-3 top-3 text-slate-400"
                            size={20}
                          />
                          <input
                            type="text"
                            required
                            value={tempName}
                            onChange={e => setTempName(e.target.value)}
                            placeholder="Jane Doe"
                            className="w-full pl-10 pr-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Move Date <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <Calendar
                            className="absolute left-3 top-3 text-slate-400"
                            size={20}
                          />
                          <input
                            type="date"
                            required
                            value={tempDate}
                            onChange={e => setTempDate(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!isDetailsValid}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 dark:shadow-blue-900/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next: Packing Needs <ArrowRight size={20} />
                  </button>
                </form>
              )}

              {/* STEP 2: PACKING MATERIALS */}
              {modalStep === 'PACKING' && (
                <div className="space-y-6">
                  <div className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                    Do you need us to bring any special packing materials?
                  </div>

                  <div className="space-y-3">
                    {[
                      { key: 'tvBox', label: 'TV Box (Flat Panel)' },
                      { key: 'wardrobeBox', label: 'Wardrobe Box (Hanging)' },
                      { key: 'mirrorBox', label: 'Mirror / Picture Box' },
                      { key: 'mattressCover', label: 'Mattress Cover' }
                    ].map(item => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600"
                      >
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {item.label}
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() =>
                              updatePackingCount(
                                item.key as keyof PackingRequirements,
                                -1
                              )
                            }
                            className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-600 border border-slate-300 dark:border-slate-500 rounded-lg text-slate-600 dark:text-slate-200 disabled:opacity-50"
                            disabled={
                              !packingReqs[item.key as keyof PackingRequirements]
                            }
                          >
                            -
                          </button>
                          <span className="w-6 text-center font-bold dark:text-white">
                            {packingReqs[item.key as keyof PackingRequirements]}
                          </span>
                          <button
                            onClick={() =>
                              updatePackingCount(
                                item.key as keyof PackingRequirements,
                                1
                              )
                            }
                            className="w-8 h-8 flex items-center justify-center bg-white dark:bg-slate-600 border border-slate-300 dark:border-slate-500 rounded-lg text-blue-600 dark:text-blue-400"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1">
                      <PenLine size={16} /> Additional Notes & Disassembly Instructions
                    </label>
                    <textarea
                      value={packingReqs.generalNotes}
                      onChange={e =>
                        setPackingReqs({
                          ...packingReqs,
                          generalNotes: e.target.value
                        })
                      }
                      placeholder="e.g. Please disassemble the King Bed in the master bedroom. Also bring extra boxes for books..."
                      className="w-full p-3 border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 rounded-xl text-sm h-24 focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setModalStep(hasJobDetails ? 'REVIEW' : 'DETAILS')}
                      className="flex-1 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium rounded-xl transition"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleSavePacking}
                      className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 dark:shadow-blue-900/30 transition-all flex items-center justify-center gap-2"
                    >
                      Next: Final Review <ArrowRight size={20} />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: SUMMARY & ACTIONS */}
              {modalStep === 'REVIEW' && (
                <div className="space-y-6">
                  <div className="text-sm text-slate-500 bg-slate-50 dark:bg-slate-700 p-3 rounded-lg border border-slate-100 dark:border-slate-600 flex justify-between items-center">
                    <div>
                      <div className="font-medium text-slate-800 dark:text-slate-100">
                        {getJobHeader()}
                      </div>
                      {jobDetails.packingReqs && (
                        <div className="text-xs text-slate-400 mt-1 flex gap-2">
                          <span>
                            <PackageOpen size={10} className="inline" /> Packing included
                          </span>
                          {jobDetails.packingReqs.generalNotes && (
                            <span>• Has notes</span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setModalStep('PACKING')}
                      className="text-blue-600 dark:text-blue-400 hover:underline text-xs font-medium"
                    >
                      Edit
                    </button>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-3 flex items-center gap-2">
                      <CheckCircle2
                        size={16}
                        className="text-blue-600 dark:text-blue-400"
                      />{' '}
                      Manifest Summary
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-white dark:bg-slate-800 p-2 rounded-lg shadow-sm">
                        <div className="text-[10px] text-slate-500 uppercase font-bold">
                          Boxes
                        </div>
                        <div className="text-lg font-bold text-slate-800 dark:text-white">
                          {boxCount}
                        </div>
                      </div>
                      <div className="bg-white dark:bg-slate-800 p-2 rounded-lg shadow-sm">
                        <div className="text-[10px] text-slate-500 uppercase font-bold">
                          Other Items
                        </div>
                        <div className="text-lg font-bold text-slate-800 dark:text-white">
                          {otherCount}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    {crmConfig.isConnected && (
                      <button
                        onClick={handleCRMSync}
                        disabled={syncStatus !== 'idle' || isSendingEmail}
                        className={`w-full py-3 px-4 rounded-xl font-semibold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 ${
                          syncStatus === 'success'
                            ? 'bg-green-600 text-white shadow-green-200 dark:shadow-green-900/30'
                            : syncStatus === 'error'
                            ? 'bg-red-600 text-white shadow-red-200'
                            : 'bg-indigo-600 text-white shadow-indigo-200 dark:shadow-indigo-900/30 hover:bg-indigo-700'
                        }`}
                      >
                        {syncStatus === 'syncing' ? (
                          <>Syncing...</>
                        ) : syncStatus === 'success' ? (
                          <>
                            <CheckCircle2 size={20} /> Synced to {crmConfig.provider}
                          </>
                        ) : syncStatus === 'error' ? (
                          <>Sync Failed - Try Again</>
                        ) : (
                          <>
                            <CloudLightning size={20} /> Sync to{' '}
                            {crmConfig.provider === 'supermove' ? 'Supermove' : 'Salesforce'}
                          </>
                        )}
                      </button>
                    )}

                    <button
                      onClick={handleSendEmail}
                      disabled={isSendingEmail || emailSentSuccess}
                      className={`w-full py-3 px-4 rounded-xl font-semibold shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${
                        emailSentSuccess
                          ? 'bg-green-600 text-white shadow-green-200 dark:shadow-green-900/30'
                          : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-100 dark:shadow-blue-900/30'
                      }`}
                    >
                      {isSendingEmail ? (
                        <>
                          <Loader2 className="animate-spin" size={20} /> Sending...
                        </>
                      ) : emailSentSuccess ? (
                        <>
                          <CheckCircle2 size={20} /> Sent Successfully
                        </>
                      ) : (
                        <>
                          <Mail size={20} /> Send via Email
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SummaryPanel;
