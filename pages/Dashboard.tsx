import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { BackendService, supabase } from '../services/backend';
import { Biscuit, InventoryItem, P2PTrade } from '../types';
import { BiscuitIcon } from '../components/BiscuitIcon';
import { Modal } from '../components/Modal';
import { CustomSelect } from '../components/CustomSelect';
import { ConfirmModal } from '../components/ConfirmModal';
import { RefreshCw, Plus, Check, Clock, ShoppingBag, X, ArrowRight, PackagePlus, Cookie, Upload, Loader2, AlertCircle, History } from 'lucide-react';
import clsx from 'clsx';

const BRAND_COLORS = [
  { name: 'Slate', class: 'bg-slate-700' },
  { name: 'Red', class: 'bg-red-700' },
  { name: 'Orange', class: 'bg-orange-600' },
  { name: 'Amber', class: 'bg-amber-600' },
  { name: 'Green', class: 'bg-emerald-600' },
  { name: 'Blue', class: 'bg-blue-600' },
  { name: 'Purple', class: 'bg-purple-600' },
  { name: 'Pink', class: 'bg-pink-600' },
];

// Fix for framer-motion type issues
const MotionDiv = motion.div as any;
const MotionButton = motion.button as any;

// --- Sub-components for Trade UI ---

const MarketTradeCard: React.FC<{
  trade: P2PTrade;
  biscuits: Biscuit[];
  onAccept: () => void;
  userBalance: number;
}> = ({ trade, biscuits, onAccept, userBalance }) => {
  const offerB = biscuits.find(b => b.id === trade.offerBiscuitId);
  const reqB = biscuits.find(b => b.id === trade.requestBiscuitId);
  
  if (!offerB || !reqB) return null;

  const canAfford = userBalance >= trade.requestQty;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4 hover:border-slate-700 transition-all shadow-sm group">
      <div className="flex justify-between items-center">
         <div className="flex items-center gap-2">
           <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span>
           <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Offer from {trade.creatorName}</span>
         </div>
         <span className="text-[10px] text-slate-600 font-mono">#{trade.id.slice(0,4)}...</span>
      </div>

      <div className="flex items-center justify-between px-2 py-2 bg-slate-950/50 rounded-lg border border-slate-800/50">
        <div className="flex flex-col items-center gap-2">
           <div className="relative">
             <BiscuitIcon biscuit={offerB} size="md" />
             <span className="absolute -top-2 -right-2 bg-slate-800 text-emerald-400 text-[9px] font-bold px-1.5 py-0.5 rounded border border-slate-700 shadow-sm">GET</span>
           </div>
           <span className="text-xs font-bold text-slate-300">x{trade.offerQty} {offerB.name}</span>
        </div>
        
        <div className="flex flex-col items-center text-slate-600">
           <ArrowRight size={18} className="group-hover:text-slate-400 transition-colors" />
        </div>

        <div className="flex flex-col items-center gap-2">
           <div className="relative">
             <BiscuitIcon biscuit={reqB} size="md" />
             <span className="absolute -top-2 -right-2 bg-slate-800 text-amber-500 text-[9px] font-bold px-1.5 py-0.5 rounded border border-slate-700 shadow-sm">GIVE</span>
           </div>
           <span className="text-xs font-bold text-amber-500">x{trade.requestQty} {reqB.name}</span>
        </div>
      </div>

      <div className="pt-2">
        <button 
          onClick={onAccept}
          disabled={!canAfford}
          className={clsx(
            "w-full py-3 rounded-lg font-bold text-xs uppercase tracking-wide transition-all flex items-center justify-center gap-2",
            canAfford 
              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20 active:scale-[0.98]" 
              : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
          )}
        >
          {canAfford ? (
            <>Accept Deal <Check size={14} /></>
          ) : (
            <>Need {trade.requestQty - userBalance} more {reqB.name}</>
          )}
        </button>
      </div>
    </div>
  );
};

const PendingTradeRow: React.FC<{
  trade: P2PTrade;
  biscuits: Biscuit[];
  onConfirm: () => void;
  isWaitingOnMe: boolean;
}> = ({ trade, biscuits, onConfirm, isWaitingOnMe }) => {
  const offerB = biscuits.find(b => b.id === trade.offerBiscuitId);
  const reqB = biscuits.find(b => b.id === trade.requestBiscuitId);

  if (!offerB || !reqB) return null;

  return (
    <div className={clsx(
      "border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden transition-all",
      isWaitingOnMe ? "bg-amber-500/5 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.05)]" : "bg-slate-900/50 border-slate-800"
    )}>
       {isWaitingOnMe && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />}
       
       <div className="flex items-center gap-4 sm:gap-8">
          <div className="flex items-center gap-3">
             <div className="relative">
                <BiscuitIcon biscuit={offerB} size="sm" />
                <div className="absolute -bottom-1 -right-1 bg-slate-800 text-[9px] px-1 rounded border border-slate-700 text-slate-400">OFFER</div>
             </div>
             <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-200">{trade.offerQty} {offerB.name}</span>
                <span className="text-[10px] text-slate-500 uppercase">From {trade.creatorName}</span>
             </div>
          </div>
          
          <ArrowRight size={14} className="text-slate-600 shrink-0" />
          
          <div className="flex items-center gap-3">
             <div className="relative">
                <BiscuitIcon biscuit={reqB} size="sm" />
                <div className="absolute -bottom-1 -right-1 bg-slate-800 text-[9px] px-1 rounded border border-slate-700 text-slate-400">REQ</div>
             </div>
             <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-200">{trade.requestQty} {reqB.name}</span>
                <span className="text-[10px] text-slate-500 uppercase">From {trade.takerName || 'Partner'}</span>
             </div>
          </div>
       </div>

       <div className="flex items-center justify-end">
         {isWaitingOnMe ? (
            <button 
              onClick={onConfirm}
              className="w-full sm:w-auto px-6 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold text-xs rounded-lg shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <Check size={16} /> Confirm Receipt
            </button>
         ) : (
            <div className="flex items-center gap-2 text-slate-500 text-xs font-medium px-4 py-2 bg-slate-800 rounded-lg border border-slate-700">
               <Loader2 size={14} className="animate-spin text-slate-400" /> Waiting for Partner
            </div>
         )}
       </div>
    </div>
  );
};

const HistoryRow: React.FC<{
  trade: P2PTrade;
  biscuits: Biscuit[];
  userId: string;
}> = ({ trade, biscuits, userId }) => {
  const offerB = biscuits.find(b => b.id === trade.offerBiscuitId);
  const reqB = biscuits.find(b => b.id === trade.requestBiscuitId);
  
  if (!offerB || !reqB) return null;

  const isCreator = trade.creatorId === userId;
  
  // Logic: 
  // If I am Creator: I gave Offer, I got Request
  // If I am Taker: I gave Request, I got Offer
  
  const gaveQty = isCreator ? trade.offerQty : trade.requestQty;
  const gaveBiscuit = isCreator ? offerB : reqB;
  
  const gotQty = isCreator ? trade.requestQty : trade.offerQty;
  const gotBiscuit = isCreator ? reqB : offerB;

  const otherName = isCreator ? trade.takerName : trade.creatorName;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 flex items-center justify-between hover:border-slate-700 transition-colors">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-bold text-slate-500 mb-1">OUT</span>
          <div className="flex items-center gap-2 text-slate-400">
             <span className="font-mono font-bold text-red-400">-{gaveQty}</span>
             <BiscuitIcon biscuit={gaveBiscuit} size="sm" className="scale-75" />
          </div>
        </div>
        <ArrowRight size={14} className="text-slate-600" />
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-bold text-slate-500 mb-1">IN</span>
          <div className="flex items-center gap-2 text-slate-200">
             <span className="font-mono font-bold text-emerald-400">+{gotQty}</span>
             <BiscuitIcon biscuit={gotBiscuit} size="sm" className="scale-75" />
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="text-xs text-slate-400 font-medium">Traded with <span className="text-slate-200">{otherName}</span></div>
        <div className="text-[10px] text-slate-600 mt-1">{new Date(trade.createdAt).toLocaleString()}</div>
      </div>
    </div>
  )
}

// --- Main Dashboard ---

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'market' | 'my-trades' | 'history'>('market');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [biscuits, setBiscuits] = useState<Biscuit[]>([]);
  const [p2pTrades, setP2PTrades] = useState<P2PTrade[]>([]);
  const [history, setHistory] = useState<P2PTrade[]>([]);
  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  // Loading States
  const [isProcessing, setIsProcessing] = useState(false);

  // Confirmation State
  const [confirmState, setConfirmState] = useState<{ isOpen: boolean, msg: string, onConfirm: () => void }>({ isOpen: false, msg: '', onConfirm: () => {} });

  // Create Trade Form State
  const [isCreating, setIsCreating] = useState(false);
  const [offerBid, setOfferBid] = useState('');
  const [offerQty, setOfferQty] = useState(1);
  const [reqBid, setReqBid] = useState('');
  const [reqQty, setReqQty] = useState(1);

  // Restock State
  const [isRestocking, setIsRestocking] = useState(false);
  const [restockId, setRestockId] = useState('');
  const [restockQty, setRestockQty] = useState(10);

  // New Biscuit State
  const [isCreatingBiscuit, setIsCreatingBiscuit] = useState(false);
  const [newBiscuitName, setNewBiscuitName] = useState('');
  const [newBiscuitBrand, setNewBiscuitBrand] = useState('');
  const [newBiscuitIcon, setNewBiscuitIcon] = useState('');
  const [newBiscuitColor, setNewBiscuitColor] = useState(BRAND_COLORS[0].class);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data Loading Wrappers for Subscription
  const fetchInventory = async () => { if(user) setInventory(await BackendService.getUserInventory(user.id)); }
  const fetchTrades = async () => { setP2PTrades(await BackendService.getP2PTrades()); }
  const fetchHistory = async () => { if(user) setHistory(await BackendService.getTradeHistory(user.id)); }
  const fetchBiscuits = async () => { setBiscuits(await BackendService.getBiscuits()); }

  // Initial Load
  useEffect(() => {
    if (!user) return;
    fetchInventory();
    fetchTrades();
    fetchHistory();
    fetchBiscuits();

    // REALTIME SUBSCRIPTION
    const channel = supabase.channel('dashboard_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory', filter: `user_id=eq.${user.id}` }, () => {
            fetchInventory();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'p2p_trades' }, () => {
            fetchTrades();
            fetchHistory(); // History might update on trade completion
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'biscuits' }, () => {
            fetchBiscuits();
        })
        .subscribe();

    return () => { supabase.removeChannel(channel); }
  }, [user]);

  const notify = (msg: string, type: 'success' | 'error') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // --- Handlers ---

  const handleCreateTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !offerBid || !reqBid) return;
    
    setIsProcessing(true);
    try {
      const res = await BackendService.createP2PTrade(user.id, offerBid, offerQty, reqBid, reqQty);
      if (res.success) {
        notify(res.message, 'success');
        setIsCreating(false);
        setOfferQty(1); setReqQty(1); setOfferBid(''); setReqBid('');
        // Data updates automatically via Realtime
      } else {
        notify(res.message, 'error');
      }
    } catch (e) {
      notify('Transaction failed', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !restockId) return;

    setIsProcessing(true);
    try {
      await BackendService.adjustInventory(user.id, restockId, restockQty);
      notify(`Added ${restockQty} packets to inventory`, 'success');
      setIsRestocking(false);
      setRestockQty(10);
      setRestockId('');
    } catch(e) {
      notify('Failed to update stash', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { 
        notify('Image too large (Max 2MB)', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setNewBiscuitIcon(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateBiscuit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newBiscuitName.trim() || !newBiscuitBrand.trim() || !newBiscuitIcon) {
      notify("All fields are required.", "error");
      return;
    }
    
    setIsProcessing(true);
    try {
      const result = await BackendService.createBiscuit(user.id, newBiscuitName, newBiscuitBrand, newBiscuitIcon, newBiscuitColor);
      if (result.success && result.data) {
        // Optimistic update handled by Realtime for safety
        notify(`${result.data.name} created (+10 packets added)`, 'success');
        setIsCreatingBiscuit(false);
        setNewBiscuitName(''); setNewBiscuitBrand(''); setNewBiscuitIcon('');
        setNewBiscuitColor(BRAND_COLORS[0].class);
      } else {
        notify(result.error || 'Failed to create biscuit.', 'error');
      }
    } catch (e) {
      notify('Error creating biscuit.', 'error');
    } finally {
      setIsProcessing(false); 
    }
  };

  // Trade Actions with Custom Confirm
  const handleAccept = (tradeId: string) => {
    if (!user) return;
    setConfirmState({
      isOpen: true,
      msg: "Are you sure you want to accept this trade? Your biscuits will be reserved until the deal is complete.",
      onConfirm: async () => {
        setIsProcessing(true);
        try {
          const res = await BackendService.acceptP2PTrade(tradeId, user.id);
          notify(res.message, res.success ? 'success' : 'error');
        } finally {
          setIsProcessing(false);
        }
      }
    });
  };

  const handleConfirm = async (tradeId: string) => {
    if (!user) return;
    setIsProcessing(true);
    try {
      const res = await BackendService.confirmP2PTrade(tradeId, user.id);
      notify(res.message, res.success ? 'success' : 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = (tradeId: string) => {
    if (!user) return;
    setConfirmState({
      isOpen: true,
      msg: "Cancel this trade offer? Your items will be refunded to your inventory.",
      onConfirm: async () => {
        setIsProcessing(true);
        try {
          const res = await BackendService.cancelP2PTrade(tradeId, user.id);
          notify(res.message, res.success ? 'success' : 'error');
        } finally {
          setIsProcessing(false);
        }
      }
    });
  };

  const getBiscuit = (id: string) => biscuits.find(b => b.id === id);
  const biscuitOptions = biscuits.map(b => ({ value: b.id, label: b.name, icon: b.icon }));

  // Derived State
  const openTrades = p2pTrades.filter(t => t.status === 'OPEN' && t.creatorId !== user?.id);
  const myActionRequired = p2pTrades.filter(t => {
    if (t.status !== 'PENDING') return false;
    const isMe = t.creatorId === user?.id || t.takerId === user?.id;
    if (!isMe) return false;
    if (t.creatorId === user?.id && !t.creatorConfirmed) return true;
    if (t.takerId === user?.id && !t.takerConfirmed) return true;
    return false;
  });
  const myPendingOthers = p2pTrades.filter(t => {
    if (t.status !== 'PENDING') return false;
    const isMe = t.creatorId === user?.id || t.takerId === user?.id;
    if (!isMe) return false;
    if (t.creatorId === user?.id && t.creatorConfirmed) return true;
    if (t.takerId === user?.id && t.takerConfirmed) return true;
    return false;
  });
  const myListings = p2pTrades.filter(t => t.status === 'OPEN' && t.creatorId === user?.id);

  return (
    <div className="space-y-8 pb-20 relative">
      
      {/* --- MODALS --- */}

      {/* Loading Overlay */}
      <AnimatePresence>
        {isProcessing && (
           <MotionDiv 
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
             className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[100] flex items-center justify-center"
           >
             <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
               <Loader2 className="animate-spin text-amber-500" size={40} />
               <span className="text-white font-bold text-sm tracking-wide uppercase">Processing...</span>
             </div>
           </MotionDiv>
        )}
      </AnimatePresence>

      {/* Confirm Modal */}
      <ConfirmModal 
        isOpen={confirmState.isOpen}
        message={confirmState.msg}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Restock Modal */}
      <Modal 
        isOpen={isRestocking} 
        onClose={() => setIsRestocking(false)} 
        title="Add Inventory" 
        icon={<PackagePlus className="text-amber-500" />}
      >
        <form onSubmit={handleRestock} className="space-y-6">
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-wider">Biscuit Type</label>
            <CustomSelect 
              value={restockId}
              onChange={setRestockId}
              options={biscuitOptions}
              placeholder="Select Biscuit..."
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-wider">Quantity</label>
            <div className="relative">
              <input 
                type="number" min="1" max="1000"
                value={restockQty} 
                onChange={e => setRestockQty(parseInt(e.target.value))} 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-amber-500 outline-none text-sm font-mono" 
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 text-xs font-bold">PACKETS</span>
            </div>
          </div>
          <button type="submit" disabled={!restockId} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-sm shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
            Update Stash
          </button>
        </form>
      </Modal>

      {/* New Biscuit Modal */}
      <Modal 
        isOpen={isCreatingBiscuit} 
        onClose={() => setIsCreatingBiscuit(false)} 
        title="Define New Biscuit"
        icon={<Cookie className="text-purple-500" />}
      >
        <form onSubmit={handleCreateBiscuit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-wider">Name</label>
              <input 
                required type="text" placeholder="e.g. Tim Tam"
                value={newBiscuitName} 
                onChange={e => setNewBiscuitName(e.target.value)} 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:border-purple-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-wider">Brand</label>
              <input 
                required type="text" placeholder="e.g. Arnotts"
                value={newBiscuitBrand} 
                onChange={e => setNewBiscuitBrand(e.target.value)} 
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:border-purple-500 outline-none text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-wider">Biscuit Image</label>
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" className="hidden" />
            
            <div className="flex items-center gap-4">
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()}
                className={clsx(
                  "flex-1 py-3 px-4 border border-dashed rounded-xl transition-all flex items-center justify-center gap-2 group",
                   newBiscuitIcon ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-300 bg-slate-950"
                )}
              >
                {newBiscuitIcon ? (
                  <>
                     <Check size={16} /> Image Selected
                  </>
                ) : (
                  <>
                     <Upload size={16} className="group-hover:scale-110 transition-transform"/> 
                     <span className="text-xs font-bold uppercase tracking-wide">Upload Photo</span>
                  </>
                )}
              </button>
              
              {newBiscuitIcon && (
                <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-700 shrink-0">
                   <img src={newBiscuitIcon} className="w-full h-full object-cover" alt="Preview" />
                   <button 
                     type="button"
                     onClick={() => { setNewBiscuitIcon(''); if(fileInputRef.current) fileInputRef.current.value = ''; }}
                     className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                   >
                     <X size={16} />
                   </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2 tracking-wider">Brand Color</label>
            <div className="flex flex-wrap gap-2">
              {BRAND_COLORS.map((color) => (
                <button
                  key={color.name}
                  type="button"
                  onClick={() => setNewBiscuitColor(color.class)}
                  className={clsx(
                    "w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                    color.class,
                    newBiscuitColor === color.class ? "border-white scale-110 shadow-lg" : "border-transparent opacity-60 hover:opacity-100"
                  )}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          <button 
            type="submit" 
            disabled={!newBiscuitName || !newBiscuitBrand || !newBiscuitIcon}
            className={clsx(
              "w-full py-3 rounded-lg font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.98]",
              (!newBiscuitName || !newBiscuitBrand || !newBiscuitIcon) 
                ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/20"
            )}
          >
            Create Biscuit Type
          </button>
        </form>
      </Modal>

      {/* --- DASHBOARD CONTENT --- */}

      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-bold text-white tracking-tight">My Stash</h2>
            <p className="text-slate-400 text-sm mt-1">Real-time inventory valuation.</p>
          </div>
          <div className="flex items-center gap-2 md:gap-4">
             <button 
               onClick={() => setIsCreatingBiscuit(true)}
               className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-purple-500/50 text-slate-300 hover:text-purple-400 text-xs font-bold uppercase tracking-wider rounded-lg transition-all shadow-sm"
             >
               <Cookie size={14} /> <span className="hidden sm:inline">New Type</span>
             </button>
             <button 
               onClick={() => setIsRestocking(true)}
               className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold uppercase tracking-wider rounded-lg transition-all shadow-sm"
             >
               <Plus size={14} /> Add Stock
             </button>

            <AnimatePresence>
              {notification && (
                <MotionDiv 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className={clsx(
                    "px-4 py-2 rounded-lg font-medium shadow-xl border text-sm backdrop-blur-md hidden sm:block",
                    notification.type === 'success' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                  )}
                >
                  {notification.msg}
                </MotionDiv>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Inventory Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {inventory.map((item) => {
            const b = getBiscuit(item.biscuitId);
            if (!b) return null;
            return (
              <div key={item.biscuitId} className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex flex-col items-center shadow-lg hover:border-slate-700 transition-all group hover:-translate-y-1 duration-300">
                <div className="transform group-hover:scale-110 transition-transform duration-300 drop-shadow-lg">
                  <BiscuitIcon biscuit={b} size="sm" />
                </div>
                <div className="mt-4 text-center">
                  <span className="block font-mono text-2xl font-bold text-slate-100">{item.quantity}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mt-1 block">{b.name}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Action Area */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden min-h-[600px] flex flex-col shadow-2xl">
        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30">
          <button 
            onClick={() => setActiveTab('market')}
            className={clsx("flex-1 py-5 text-sm font-semibold flex items-center justify-center gap-2 transition-all border-b-2 relative", activeTab === 'market' ? "border-amber-500 text-white bg-slate-800/30" : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/20")}
          >
            <ShoppingBag size={18} /> Marketplace <span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-[10px] min-w-[20px]">{openTrades.length}</span>
          </button>
          <button 
            onClick={() => setActiveTab('my-trades')}
            className={clsx("flex-1 py-5 text-sm font-semibold flex items-center justify-center gap-2 transition-all border-b-2 relative", activeTab === 'my-trades' ? "border-amber-500 text-white bg-slate-800/30" : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/20")}
          >
            <Clock size={18} /> Active Trades 
            {(myActionRequired.length > 0) && <span className="absolute top-4 right-1/3 w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-red-500/50" />}
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={clsx("flex-1 py-5 text-sm font-semibold flex items-center justify-center gap-2 transition-all border-b-2 relative", activeTab === 'history' ? "border-amber-500 text-white bg-slate-800/30" : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/20")}
          >
            <History size={18} /> Trade History
          </button>
        </div>

        <div className="p-6 md:p-8 flex-1 bg-slate-950/30 relative">
          
          {/* Post Offer */}
          {(activeTab === 'market' || activeTab === 'my-trades') && (
          <div className="mb-8">
            <AnimatePresence mode='wait'>
            {!isCreating ? (
              <MotionButton 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setIsCreating(true)}
                className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-dashed border-slate-700 hover:border-amber-500/50 rounded-xl font-medium transition-all flex items-center justify-center gap-3 group shadow-sm hover:shadow-md hover:text-amber-500"
              >
                <div className="p-1 bg-slate-800 rounded-md border border-slate-700 group-hover:bg-amber-500 group-hover:text-slate-900 transition-colors">
                   <Plus size={18} />
                </div>
                Create New Exchange Offer
              </MotionButton>
            ) : (
              <MotionDiv 
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="bg-slate-900 p-6 rounded-xl border border-slate-700 shadow-xl overflow-hidden"
              >
                <div className="flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
                  <h3 className="font-bold text-white text-sm uppercase tracking-wide flex items-center gap-2">
                    <RefreshCw size={16} className="text-amber-500"/> New Limit Order
                  </h3>
                  <button onClick={() => setIsCreating(false)} className="text-slate-500 hover:text-slate-300 p-1 hover:bg-slate-800 rounded transition-colors"><X size={18}/></button>
                </div>
                <form onSubmit={handleCreateTrade} className="flex flex-col lg:flex-row gap-6 items-start lg:items-end">
                  <div className="flex-1 space-y-2 w-full">
                    <label className="text-[10px] text-emerald-500 uppercase font-bold tracking-wider flex items-center gap-2"><ArrowRight className="rotate-180" size={12}/> You Give</label>
                    <div className="flex gap-3">
                      <input type="number" min="1" value={offerQty} onChange={e => setOfferQty(parseInt(e.target.value))} className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:border-amber-500 outline-none text-sm font-mono text-center" />
                      <div className="flex-1">
                         <CustomSelect value={offerBid} onChange={setOfferBid} options={biscuitOptions} placeholder="Select Biscuit..." />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center self-center pb-2 text-slate-600">
                    <ArrowRight size={24} className="hidden lg:block"/>
                    <ArrowRight size={24} className="lg:hidden rotate-90"/>
                  </div>
                  
                  <div className="flex-1 space-y-2 w-full">
                    <label className="text-[10px] text-amber-500 uppercase font-bold tracking-wider flex items-center gap-2"><ArrowRight size={12}/> You Get</label>
                    <div className="flex gap-3">
                      <input type="number" min="1" value={reqQty} onChange={e => setReqQty(parseInt(e.target.value))} className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:border-amber-500 outline-none text-sm font-mono text-center" />
                      <div className="flex-1">
                         <CustomSelect value={reqBid} onChange={setReqBid} options={biscuitOptions} placeholder="Select Biscuit..." />
                      </div>
                    </div>
                  </div>

                  <button type="submit" className="w-full lg:w-auto px-8 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-lg font-bold text-sm shadow-lg shadow-orange-900/20 transition-all active:scale-[0.98]">
                    Post Trade
                  </button>
                </form>
              </MotionDiv>
            )}
            </AnimatePresence>
          </div>
          )}

          {activeTab === 'market' && (
            <div className="space-y-4">
               {openTrades.length === 0 ? (
                 <div className="text-center py-24 bg-slate-900/30 rounded-2xl border border-slate-800/50 border-dashed">
                   <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                     <ShoppingBag size={24} className="text-slate-600" />
                   </div>
                   <p className="text-slate-400 text-sm font-bold">The market is quiet.</p>
                   <p className="text-slate-600 text-xs mt-2">Be the first to post a trade offer!</p>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                   {openTrades.map(trade => (
                     <MarketTradeCard 
                        key={trade.id} 
                        trade={trade} 
                        biscuits={biscuits} 
                        onAccept={() => handleAccept(trade.id)} 
                        userBalance={inventory.find(i => i.biscuitId === trade.requestBiscuitId)?.quantity || 0}
                      />
                   ))}
                 </div>
               )}
            </div>
          )}

          {activeTab === 'my-trades' && (
            <div className="space-y-10">
              {/* ACTION REQUIRED */}
              {(myActionRequired.length > 0 || myPendingOthers.length > 0) && (
                <div className="space-y-4">
                   <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-3">
                     <AlertCircle size={14} className="text-amber-500"/> Action Required
                   </h3>
                   <div className="grid gap-4">
                    {myActionRequired.map(trade => (
                        <PendingTradeRow key={trade.id} trade={trade} biscuits={biscuits} onConfirm={() => handleConfirm(trade.id)} isWaitingOnMe={true} />
                    ))}
                    {myPendingOthers.map(trade => (
                        <PendingTradeRow key={trade.id} trade={trade} biscuits={biscuits} onConfirm={() => {}} isWaitingOnMe={false} />
                    ))}
                   </div>
                </div>
              )}

              {/* MY LISTINGS */}
              <div className="space-y-4">
                 <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-3">My Open Orders</h3>
                 {myListings.length === 0 && (
                    <div className="text-slate-600 text-sm italic px-4">No active orders posted.</div>
                 )}
                 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                 {myListings.map(trade => {
                    const offerB = getBiscuit(trade.offerBiscuitId);
                    const reqB = getBiscuit(trade.requestBiscuitId);
                    if(!offerB || !reqB) return null;

                    return (
                    <div key={trade.id} className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex justify-between items-center hover:border-slate-700 transition-colors shadow-sm">
                      <div className="flex items-center gap-4">
                         <div className="flex items-center gap-2">
                            <span className="font-bold text-emerald-400 font-mono text-lg">{trade.offerQty}</span>
                            <BiscuitIcon biscuit={offerB} size="sm" />
                         </div>
                         <ArrowRight size={14} className="text-slate-600" />
                         <div className="flex items-center gap-2">
                            <span className="font-bold text-amber-500 font-mono text-lg">{trade.requestQty}</span>
                            <BiscuitIcon biscuit={reqB} size="sm" />
                         </div>
                      </div>
                      <button 
                        onClick={() => handleCancel(trade.id)} 
                        className="text-slate-500 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-all"
                        title="Cancel Trade"
                      >
                        <X size={18} />
                      </button>
                    </div>
                 )})}
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
             <div className="space-y-4">
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-3">Completed Exchanges</h3>
               {history.length === 0 ? (
                 <div className="text-slate-500 text-sm italic px-4 py-8 text-center bg-slate-900/30 rounded-xl border border-slate-800 border-dashed">
                    No completed trades yet. Start swapping!
                 </div>
               ) : (
                 <div className="grid gap-3">
                   {history.map(trade => (
                     <HistoryRow key={trade.id} trade={trade} biscuits={biscuits} userId={user?.id || ''} />
                   ))}
                 </div>
               )}
             </div>
          )}

        </div>
      </div>
    </div>
  );
};