import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { BackendService, supabase } from '../services/backend';
import { Biscuit, InventoryItem, P2PTrade, P2PTradeType, TradeBid } from '../types';
import { BiscuitIcon } from '../components/BiscuitIcon';
import { Modal } from '../components/Modal';
import { CustomSelect } from '../components/CustomSelect';
import { ConfirmModal } from '../components/ConfirmModal';
import { RefreshCw, Plus, Check, Clock, ShoppingBag, X, ArrowRight, PackagePlus, Cookie, Upload, Loader2, AlertCircle, History, Gavel, HandCoins, User } from 'lucide-react';
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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col gap-6 hover:border-slate-600 transition-all shadow-lg group hover:shadow-2xl hover:shadow-black/50 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-2 opacity-50">
        <RefreshCw size={100} className="text-slate-800 -rotate-12" />
      </div>
      
      <div className="flex justify-between items-center border-b border-slate-800 pb-3 relative z-10">
         <div className="flex items-center gap-3">
           <div className="relative">
             <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
           </div>
           <div>
             <span className="text-xs text-slate-400 font-bold uppercase tracking-wider block leading-none">Fixed Price</span>
             <span className="text-sm font-bold text-white">{trade.creatorName}</span>
           </div>
         </div>
         <span className="text-[10px] text-slate-700 font-mono font-bold px-2 py-1 bg-slate-950 rounded">#{trade.id.slice(0,4)}</span>
      </div>

      <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center bg-slate-950/50 rounded-xl p-4 border border-slate-800/50 relative z-10">
        {/* GET SIDE */}
        <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 w-full transition-colors group-hover:bg-emerald-500/10">
           <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-900/30 px-2 py-0.5 rounded">You Get</span>
           <BiscuitIcon biscuit={offerB} size="md" className="shadow-2xl" />
           <div className="text-center mt-1">
             <span className="block text-2xl font-bold text-white leading-none">x{trade.offerQty}</span>
             <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide truncate max-w-[80px] block">{offerB.name}</span>
           </div>
        </div>
        
        {/* ARROW */}
        <div className="flex flex-col items-center justify-center text-slate-600">
           <ArrowRight size={32} strokeWidth={2.5} className="group-hover:text-amber-500 transition-colors duration-300" />
        </div>

        {/* GIVE SIDE */}
        <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 w-full transition-colors group-hover:bg-amber-500/10">
           <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest bg-amber-900/30 px-2 py-0.5 rounded">You Give</span>
           <BiscuitIcon biscuit={reqB} size="md" className="shadow-2xl" />
           <div className="text-center mt-1">
             <span className={clsx("block text-2xl font-bold leading-none", canAfford ? "text-white" : "text-red-400")}>x{trade.requestQty}</span>
             <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide truncate max-w-[80px] block">{reqB.name}</span>
           </div>
        </div>
      </div>

      <button 
        onClick={onAccept}
        disabled={!canAfford}
        className={clsx(
          "w-full py-4 rounded-xl font-bold text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 relative z-10",
          canAfford 
            ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 active:scale-[0.98] hover:shadow-blue-500/20" 
            : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700 hover:bg-slate-800"
        )}
      >
        {canAfford ? (
          <>Accept Trade <Check size={18} strokeWidth={3} /></>
        ) : (
          <span className="flex items-center gap-2 text-red-400">
             <X size={16}/> Insufficient Stock
          </span>
        )}
      </button>
    </div>
  );
};

const AuctionTradeCard: React.FC<{
  trade: P2PTrade;
  biscuits: Biscuit[];
  onBid: (biscuitId: string, qty: number) => void;
}> = ({ trade, biscuits, onBid }) => {
  const offerB = biscuits.find(b => b.id === trade.offerBiscuitId);
  const prefB = biscuits.find(b => b.id === trade.requestBiscuitId);
  const [bidQty, setBidQty] = useState(1);
  const [bidBiscuitId, setBidBiscuitId] = useState(trade.requestBiscuitId || biscuits[0]?.id);

  if (!offerB) return null;

  const biscuitOptions = biscuits.map(b => ({ value: b.id, label: b.name, icon: b.icon }));

  return (
    <div className="bg-slate-900 border border-purple-500/30 rounded-2xl p-6 flex flex-col gap-6 hover:border-purple-500/60 transition-all shadow-lg group hover:shadow-2xl hover:shadow-purple-900/20 relative overflow-hidden">
       {/* Decorative Background */}
       <div className="absolute top-0 right-0 p-2 opacity-50">
         <Gavel size={100} className="text-slate-800 -rotate-12" />
       </div>

      <div className="flex justify-between items-center border-b border-slate-800 pb-3 relative z-10">
         <div className="flex items-center gap-3">
           <div className="relative">
             <div className="w-3 h-3 rounded-full bg-purple-500 animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
           </div>
           <div>
             <span className="text-xs text-purple-400 font-bold uppercase tracking-wider block leading-none">Auction</span>
             <span className="text-sm font-bold text-white">{trade.creatorName}</span>
           </div>
         </div>
         <span className="text-[10px] text-slate-700 font-mono font-bold px-2 py-1 bg-slate-950 rounded">#{trade.id.slice(0,4)}</span>
      </div>

      <div className="flex items-center justify-center py-2 relative z-10">
         <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-purple-500/5 border border-purple-500/10 w-full">
            <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest bg-purple-900/30 px-2 py-0.5 rounded">Offered Item</span>
            <div className="flex items-center gap-4">
               <BiscuitIcon biscuit={offerB} size="lg" className="shadow-2xl ring-purple-500/30" />
               <div className="flex flex-col">
                  <span className="text-3xl font-bold text-white">x{trade.offerQty}</span>
                  <span className="text-sm font-bold text-slate-400 uppercase">{offerB.name}</span>
               </div>
            </div>
            {prefB && (
               <div className="text-[10px] text-slate-500 mt-2 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                  Preferred: <span className="text-slate-300 font-bold">{trade.requestQty} {prefB.name}</span>
               </div>
            )}
         </div>
      </div>

      <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 relative z-10 space-y-3">
         <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Your Bid</div>
         <div className="flex gap-3">
             <input type="number" min="1" value={bidQty} onChange={e => setBidQty(parseInt(e.target.value))} className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 text-center text-white font-mono font-bold focus:border-purple-500 outline-none" />
             <div className="flex-1">
                <CustomSelect value={bidBiscuitId} onChange={setBidBiscuitId} options={biscuitOptions} />
             </div>
         </div>
         <button 
           onClick={() => onBid(bidBiscuitId, bidQty)}
           className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm uppercase tracking-wide shadow-lg shadow-purple-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
         >
           Place Bid <HandCoins size={16} />
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
      "border rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden transition-all shadow-lg",
      isWaitingOnMe ? "bg-amber-500/5 border-amber-500/30 shadow-amber-900/10" : "bg-slate-900/80 border-slate-800"
    )}>
       {isWaitingOnMe && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-500" />}
       
       <div className="flex items-center gap-8 flex-1">
          {/* OFFER PART */}
          <div className="flex items-center gap-4">
             <div className="relative">
                <BiscuitIcon biscuit={offerB} size="md" />
                <div className="absolute -bottom-2 -right-2 bg-slate-900 text-[10px] px-2 py-0.5 rounded-full border border-slate-700 text-emerald-400 font-bold shadow-lg">GET</div>
             </div>
             <div className="flex flex-col">
                <span className="text-2xl font-bold text-white">{trade.offerQty} <span className="text-sm text-slate-400 font-normal">{offerB.name}</span></span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">From {trade.creatorName}</span>
             </div>
          </div>
          
          <div className="hidden md:flex items-center justify-center w-12 h-12 rounded-full bg-slate-900 border border-slate-700 shrink-0">
             <ArrowRight size={20} className="text-slate-500" />
          </div>
          
          {/* REQUEST PART */}
          <div className="flex items-center gap-4">
             <div className="relative">
                <BiscuitIcon biscuit={reqB} size="md" />
                <div className="absolute -bottom-2 -right-2 bg-slate-900 text-[10px] px-2 py-0.5 rounded-full border border-slate-700 text-amber-500 font-bold shadow-lg">GIVE</div>
             </div>
             <div className="flex flex-col">
                <span className="text-2xl font-bold text-white">{trade.requestQty} <span className="text-sm text-slate-400 font-normal">{reqB.name}</span></span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">To {trade.takerName || 'Partner'}</span>
             </div>
          </div>
       </div>

       <div className="flex items-center justify-end md:min-w-[200px]">
         {isWaitingOnMe ? (
            <button 
              onClick={onConfirm}
              className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-900 font-bold text-sm rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <Check size={20} strokeWidth={3} /> Confirm Receipt
            </button>
         ) : (
            <div className="flex items-center gap-3 text-slate-400 text-sm font-bold px-6 py-4 bg-slate-950 rounded-xl border border-slate-800">
               <Loader2 size={18} className="animate-spin text-amber-500" /> Waiting for Partner...
            </div>
         )}
       </div>
    </div>
  );
};

const MyListingCard: React.FC<{
  trade: P2PTrade;
  biscuits: Biscuit[];
  onCancel: () => void;
  onAcceptBid: (bidId: string) => void;
}> = ({ trade, biscuits, onCancel, onAcceptBid }) => {
  const offerB = biscuits.find(b => b.id === trade.offerBiscuitId);
  const reqB = biscuits.find(b => b.id === trade.requestBiscuitId);
  const [bids, setBids] = useState<TradeBid[]>([]);
  const [showBids, setShowBids] = useState(false);
  
  // Realtime bids fetch
  useEffect(() => {
    if (trade.tradeType === 'AUCTION') {
      const fetchBids = async () => setBids(await BackendService.getBidsForTrade(trade.id));
      fetchBids();
      // Subscribe
      const channel = supabase.channel(`bids_${trade.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'trade_bids', filter: `trade_id=eq.${trade.id}` }, fetchBids)
        .subscribe();
      return () => { supabase.removeChannel(channel) };
    }
  }, [trade.id, trade.tradeType]);

  if (!offerB) return null;

  return (
    <div className={clsx(
       "bg-slate-900/50 border rounded-2xl overflow-hidden transition-all duration-300 group shadow-lg flex flex-col",
       trade.tradeType === 'AUCTION' ? "border-purple-500/30 hover:border-purple-500/60" : "border-slate-800 hover:border-slate-600"
    )}>
      <div className={clsx("p-1 h-1 w-full bg-gradient-to-r transition-all duration-500",
         trade.tradeType === 'AUCTION' ? "from-purple-900 via-purple-500 to-purple-900" : "from-slate-800 via-blue-900 to-slate-800"
      )} />
      
      <div className="p-5 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
           <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Order Ref</span>
              <span className="font-mono text-xs text-slate-300 bg-slate-950 px-2 py-1 rounded border border-slate-800">#{trade.id.slice(0, 6)}</span>
           </div>
           <div className={clsx("flex items-center gap-2 px-2.5 py-1 rounded-full border", 
              trade.tradeType === 'AUCTION' ? "bg-purple-500/10 border-purple-500/20" : "bg-blue-500/10 border-blue-500/20"
           )}>
              <div className={clsx("w-1.5 h-1.5 rounded-full animate-pulse", trade.tradeType === 'AUCTION' ? "bg-purple-400" : "bg-blue-400")} />
              <span className={clsx("text-[10px] font-bold uppercase tracking-wide", trade.tradeType === 'AUCTION' ? "text-purple-400" : "text-blue-400")}>
                {trade.tradeType === 'AUCTION' ? "Live Auction" : "Fixed Price"}
              </span>
           </div>
        </div>

        {/* Content */}
        <div className="flex items-center justify-between relative mb-6">
           {/* Left */}
           <div className="flex items-center gap-3">
              <div className="relative">
                 <BiscuitIcon biscuit={offerB} size="md" className="ring-2 ring-slate-800 group-hover:ring-slate-700 transition-all" />
                 <div className="absolute -bottom-2 right-0 bg-slate-900 text-slate-300 text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-700 shadow-sm z-10">
                   x{trade.offerQty}
                 </div>
              </div>
              <div className="flex flex-col">
                 <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">You Give</span>
                 <span className="text-sm font-bold text-white leading-tight max-w-[80px] truncate">{offerB.name}</span>
              </div>
           </div>

           {/* Center Arrow */}
           <div className="flex flex-col items-center justify-center text-slate-700 group-hover:text-slate-500 transition-colors">
              <ArrowRight size={24} strokeWidth={1.5} />
           </div>

           {/* Right (Depending on Type) */}
           {trade.tradeType === 'FIXED' && reqB ? (
             <div className="flex items-center gap-3 flex-row-reverse text-right">
                <div className="relative">
                   <BiscuitIcon biscuit={reqB} size="md" className="ring-2 ring-slate-800 group-hover:ring-slate-700 transition-all" />
                   <div className="absolute -bottom-2 left-0 bg-slate-900 text-amber-500 text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-700 shadow-sm z-10">
                     x{trade.requestQty}
                   </div>
                </div>
                <div className="flex flex-col items-end">
                   <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">You Get</span>
                   <span className="text-sm font-bold text-white leading-tight max-w-[80px] truncate">{reqB.name}</span>
                </div>
             </div>
           ) : (
             <div className="flex flex-col items-end justify-center h-full">
                <span className="text-3xl font-bold text-white">{bids.length}</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Active Bids</span>
             </div>
           )}
        </div>
        
        {/* Auction Bids Section */}
        {trade.tradeType === 'AUCTION' && (
           <div className="mb-4">
              <button onClick={() => setShowBids(!showBids)} className="w-full text-xs text-purple-400 hover:text-purple-300 font-bold uppercase tracking-wider flex items-center justify-between bg-purple-500/10 px-3 py-2 rounded-lg border border-purple-500/20 mb-2">
                 <span>{showBids ? "Hide Bids" : "View Bids"}</span>
                 <Gavel size={14} />
              </button>
              
              <AnimatePresence>
              {showBids && (
                <MotionDiv initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                   <div className="flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar p-1">
                      {bids.length === 0 && <div className="text-center text-xs text-slate-500 italic py-2">No bids yet.</div>}
                      {bids.map(bid => {
                         const bidBiscuit = biscuits.find(b => b.id === bid.biscuitId);
                         return (
                            <div key={bid.id} className="flex justify-between items-center bg-slate-950 p-2 rounded border border-slate-800">
                               <div className="flex items-center gap-2">
                                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1 rounded">{bid.bidderName}</span>
                                  {bidBiscuit && (
                                     <div className="flex items-center gap-1 text-xs text-white font-bold">
                                        <span>{bid.qty}x</span>
                                        <span>{bidBiscuit.name}</span>
                                     </div>
                                  )}
                               </div>
                               <button onClick={() => onAcceptBid(bid.id)} className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded font-bold uppercase">Accept</button>
                            </div>
                         )
                      })}
                   </div>
                </MotionDiv>
              )}
              </AnimatePresence>
           </div>
        )}

        {/* Footer Action */}
        <button 
          onClick={onCancel}
          className="w-full py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-xs font-bold uppercase tracking-widest hover:bg-red-900/10 hover:text-red-400 hover:border-red-900/30 transition-all flex items-center justify-center gap-2 group/btn mt-auto"
        >
          <X size={14} className="group-hover/btn:scale-110 transition-transform" /> Cancel Listing
        </button>
      </div>
    </div>
  )
}

const HistoryRow: React.FC<{
  trade: P2PTrade;
  biscuits: Biscuit[];
  userId: string;
}> = ({ trade, biscuits, userId }) => {
  const offerB = biscuits.find(b => b.id === trade.offerBiscuitId);
  const reqB = biscuits.find(b => b.id === trade.requestBiscuitId);
  
  if (!offerB || !reqB) return null;

  const isCreator = trade.creatorId === userId;
  
  const gaveQty = isCreator ? trade.offerQty : trade.requestQty;
  const gaveBiscuit = isCreator ? offerB : reqB;
  
  const gotQty = isCreator ? trade.requestQty : trade.offerQty;
  const gotBiscuit = isCreator ? reqB : offerB;

  const otherName = isCreator ? trade.takerName : trade.creatorName;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between hover:border-slate-700 transition-colors gap-4">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
             <div className="flex flex-col items-center gap-1">
               <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Sent</span>
               <BiscuitIcon biscuit={gaveBiscuit} size="sm" />
             </div>
             <span className="font-mono font-bold text-xl text-slate-300">-{gaveQty}</span>
        </div>
        
        <ArrowRight size={16} className="text-slate-700" />
        
        <div className="flex items-center gap-3">
             <span className="font-mono font-bold text-xl text-white">+{gotQty}</span>
             <div className="flex flex-col items-center gap-1">
               <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Received</span>
               <BiscuitIcon biscuit={gotBiscuit} size="sm" />
             </div>
        </div>
      </div>

      <div className="text-right flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 border-slate-800 pt-3 sm:pt-0">
        <div className="text-sm text-slate-300 font-bold">Traded with <span className="text-amber-500">{otherName}</span></div>
        <div className="text-[10px] text-slate-500 font-mono mt-1">{new Date(trade.createdAt).toLocaleString()}</div>
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
  const [createType, setCreateType] = useState<P2PTradeType>('FIXED');
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
      const res = await BackendService.createP2PTrade(user.id, offerBid, offerQty, reqBid, reqQty, createType);
      if (res.success) {
        notify(res.message, 'success');
        setIsCreating(false);
        setOfferQty(1); setReqQty(1); setOfferBid(''); setReqBid('');
        setCreateType('FIXED');
        // Immediate Update
        fetchTrades();
        fetchInventory();
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
      // Immediate Update
      fetchInventory();
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
        notify(`${result.data.name} created (+10 packets added)`, 'success');
        setIsCreatingBiscuit(false);
        setNewBiscuitName(''); setNewBiscuitBrand(''); setNewBiscuitIcon('');
        setNewBiscuitColor(BRAND_COLORS[0].class);
        // Immediate Update
        fetchBiscuits();
        fetchInventory();
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
          if (res.success) {
            fetchTrades();
            fetchInventory();
          }
        } finally {
          setIsProcessing(false);
        }
      }
    });
  };

  const handlePlaceBid = (tradeId: string, biscuitId: string, qty: number) => {
    if (!user) return;
    setConfirmState({
      isOpen: true,
      msg: `Place bid of ${qty} packets? This will reserve them from your inventory until the auction ends.`,
      onConfirm: async () => {
        setIsProcessing(true);
        try {
          const res = await BackendService.placeBid(tradeId, user.id, biscuitId, qty);
          notify(res.message, res.success ? 'success' : 'error');
          if (res.success) fetchInventory();
        } finally {
          setIsProcessing(false);
        }
      }
    });
  };

  const handleAcceptBid = (bidId: string, tradeId: string) => {
    if (!user) return;
    setConfirmState({
      isOpen: true,
      msg: "Accept this bid? All other bids will be refunded and trade will move to confirmation.",
      onConfirm: async () => {
         setIsProcessing(true);
         try {
           const res = await BackendService.acceptBid(tradeId, bidId, user.id);
           notify(res.message, res.success ? 'success' : 'error');
           if (res.success) {
              fetchTrades();
           }
         } finally {
           setIsProcessing(false);
         }
      }
    })
  }

  const handleConfirm = async (tradeId: string) => {
    if (!user) return;
    setIsProcessing(true);
    try {
      const res = await BackendService.confirmP2PTrade(tradeId, user.id);
      notify(res.message, res.success ? 'success' : 'error');
      if (res.success) {
        fetchTrades();
        fetchHistory();
        fetchInventory();
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = (tradeId: string) => {
    if (!user) return;
    setConfirmState({
      isOpen: true,
      msg: "Cancel this listing? Your items (and any bids) will be refunded.",
      onConfirm: async () => {
        setIsProcessing(true);
        try {
          const res = await BackendService.cancelP2PTrade(tradeId, user.id);
          notify(res.message, res.success ? 'success' : 'error');
          if (res.success) {
            fetchTrades();
            fetchInventory();
          }
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {inventory.map((item) => {
            const b = getBiscuit(item.biscuitId);
            if (!b) return null;
            return (
              <div key={item.biscuitId} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 flex flex-col items-center shadow-xl hover:border-slate-600 transition-all group hover:-translate-y-1 duration-300 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"/>
                <div className="transform group-hover:scale-105 transition-transform duration-300 drop-shadow-2xl z-10">
                  <BiscuitIcon biscuit={b} size="lg" />
                </div>
                <div className="mt-5 text-center z-10">
                  <span className="block font-mono text-3xl font-bold text-slate-100 tracking-tight">{item.quantity}</span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mt-1 block truncate max-w-[120px]">{b.name}</span>
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
                className="w-full py-6 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-dashed border-slate-700 hover:border-amber-500/50 rounded-xl font-medium transition-all flex items-center justify-center gap-3 group shadow-sm hover:shadow-md hover:text-amber-500"
              >
                <div className="p-2 bg-slate-800 rounded-lg border border-slate-700 group-hover:bg-amber-500 group-hover:text-slate-900 transition-colors">
                   <Plus size={20} />
                </div>
                <span className="text-lg font-bold">Create New Exchange Offer</span>
              </MotionButton>
            ) : (
              <MotionDiv 
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="bg-slate-900 p-8 rounded-xl border border-slate-700 shadow-xl overflow-hidden"
              >
                <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
                  <h3 className="font-bold text-white text-lg uppercase tracking-wide flex items-center gap-2">
                    <RefreshCw size={20} className="text-amber-500"/> New Listing
                  </h3>
                  <button onClick={() => setIsCreating(false)} className="text-slate-500 hover:text-slate-300 p-2 hover:bg-slate-800 rounded transition-colors"><X size={20}/></button>
                </div>

                {/* Trade Type Switcher */}
                <div className="flex gap-4 mb-6">
                   <button 
                    onClick={() => setCreateType('FIXED')}
                    className={clsx("flex-1 py-3 border rounded-lg font-bold text-sm uppercase flex items-center justify-center gap-2 transition-all", createType === 'FIXED' ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-950 border-slate-700 text-slate-500 hover:border-slate-600")}
                   >
                     <RefreshCw size={16} /> Fixed Price
                   </button>
                   <button 
                    onClick={() => setCreateType('AUCTION')}
                    className={clsx("flex-1 py-3 border rounded-lg font-bold text-sm uppercase flex items-center justify-center gap-2 transition-all", createType === 'AUCTION' ? "bg-purple-600 border-purple-500 text-white" : "bg-slate-950 border-slate-700 text-slate-500 hover:border-slate-600")}
                   >
                     <Gavel size={16} /> Auction
                   </button>
                </div>

                <form onSubmit={handleCreateTrade} className="flex flex-col xl:flex-row gap-8 items-start xl:items-end">
                  <div className="flex-1 space-y-3 w-full">
                    <label className="text-xs text-emerald-500 uppercase font-bold tracking-wider flex items-center gap-2"><ArrowRight className="rotate-180" size={14}/> You Give</label>
                    <div className="flex gap-4">
                      <input type="number" min="1" value={offerQty} onChange={e => setOfferQty(parseInt(e.target.value))} className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-amber-500 outline-none text-lg font-mono text-center font-bold" />
                      <div className="flex-1">
                         <CustomSelect value={offerBid} onChange={setOfferBid} options={biscuitOptions} placeholder="Select Biscuit..." />
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-center self-center pb-2 text-slate-600">
                    <ArrowRight size={32} className="hidden xl:block"/>
                    <ArrowRight size={32} className="xl:hidden rotate-90"/>
                  </div>
                  
                  <div className="flex-1 space-y-3 w-full">
                    <label className={clsx("text-xs uppercase font-bold tracking-wider flex items-center gap-2", createType === 'FIXED' ? "text-amber-500" : "text-purple-500")}>
                       <ArrowRight size={14}/> {createType === 'FIXED' ? "You Get" : "Preferred (Optional)"}
                    </label>
                    <div className="flex gap-4">
                      <input type="number" min="1" value={reqQty} onChange={e => setReqQty(parseInt(e.target.value))} className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-amber-500 outline-none text-lg font-mono text-center font-bold" />
                      <div className="flex-1">
                         <CustomSelect value={reqBid} onChange={setReqBid} options={biscuitOptions} placeholder="Select Biscuit..." />
                      </div>
                    </div>
                  </div>

                  <button type="submit" className={clsx(
                     "w-full xl:w-auto px-10 py-4 text-white rounded-lg font-bold text-sm uppercase tracking-wider shadow-lg transition-all active:scale-[0.98]",
                     createType === 'FIXED' ? "bg-gradient-to-r from-blue-600 to-cyan-600 shadow-blue-900/20" : "bg-gradient-to-r from-purple-600 to-pink-600 shadow-purple-900/20"
                  )}>
                    {createType === 'FIXED' ? "Post Trade" : "Start Auction"}
                  </button>
                </form>
              </MotionDiv>
            )}
            </AnimatePresence>
          </div>
          )}

          {activeTab === 'market' && (
            <div className="space-y-6">
               {openTrades.length === 0 ? (
                 <div className="text-center py-24 bg-slate-900/30 rounded-2xl border border-slate-800/50 border-dashed">
                   <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                     <ShoppingBag size={32} className="text-slate-600" />
                   </div>
                   <p className="text-slate-400 text-lg font-bold">The market is quiet.</p>
                   <p className="text-slate-600 text-sm mt-2">Be the first to post a trade offer!</p>
                 </div>
               ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-8">
                   {openTrades.map(trade => {
                     if (trade.tradeType === 'AUCTION') {
                        return (
                          <AuctionTradeCard 
                             key={trade.id}
                             trade={trade}
                             biscuits={biscuits}
                             onBid={(bidId, qty) => handlePlaceBid(trade.id, bidId, qty)}
                          />
                        )
                     }
                     return (
                       <MarketTradeCard 
                          key={trade.id} 
                          trade={trade} 
                          biscuits={biscuits} 
                          onAccept={() => handleAccept(trade.id)} 
                          userBalance={inventory.find(i => i.biscuitId === trade.requestBiscuitId)?.quantity || 0}
                        />
                     )
                   })}
                 </div>
               )}
            </div>
          )}

          {activeTab === 'my-trades' && (
            <div className="space-y-12">
              {/* ACTION REQUIRED */}
              {(myActionRequired.length > 0 || myPendingOthers.length > 0) && (
                <div className="space-y-6">
                   <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-4">
                     <AlertCircle size={16} className="text-amber-500"/> Action Required
                   </h3>
                   <div className="grid gap-6">
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
              <div className="space-y-6">
                 <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-4">My Open Orders</h3>
                 {myListings.length === 0 && (
                    <div className="text-slate-600 text-sm italic px-4">No active orders posted.</div>
                 )}
                 <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                 {myListings.map(trade => (
                    <MyListingCard 
                      key={trade.id} 
                      trade={trade} 
                      biscuits={biscuits} 
                      onCancel={() => handleCancel(trade.id)}
                      onAcceptBid={(bidId) => handleAcceptBid(bidId, trade.id)} 
                    />
                 ))}
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
             <div className="space-y-6">
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-4">Completed Exchanges</h3>
               {history.length === 0 ? (
                 <div className="text-slate-500 text-sm italic px-4 py-8 text-center bg-slate-900/30 rounded-xl border border-slate-800 border-dashed">
                    No completed trades yet. Start swapping!
                 </div>
               ) : (
                 <div className="grid gap-4">
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