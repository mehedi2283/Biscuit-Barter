import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { BackendService, supabase } from '../services/backend';
import { Biscuit, ExchangeRule, InventoryItem, P2PTrade, TradeItem } from '../types';
import { BiscuitIcon } from '../components/BiscuitIcon';
import { TradeCard } from '../components/TradeCard';
import { Modal } from '../components/Modal';
import { CustomSelect } from '../components/CustomSelect';
import { ConfirmModal } from '../components/ConfirmModal';
import { Package, Plus, Minus, RefreshCcw, ShoppingBag, History, ArrowRight, Gavel, Trash2, CheckCircle, Loader2, Cookie, Upload, RefreshCw, Calendar, User, Clock, Layers } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';

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

export const Dashboard: React.FC = () => {
  const { user, refreshUser } = useAuth();
  
  // Data State
  const [biscuits, setBiscuits] = useState<Biscuit[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [rules, setRules] = useState<ExchangeRule[]>([]);
  const [p2pTrades, setP2PTrades] = useState<P2PTrade[]>([]);
  
  // UI State
  const [activeTab, setActiveTab] = useState<'market' | 'p2p' | 'history'>('market');
  const [isLoading, setIsLoading] = useState(true);

  // Loading States for Actions
  const [isSubmittingTrade, setIsSubmittingTrade] = useState(false);
  const [isSubmittingStock, setIsSubmittingStock] = useState(false);
  const [isSubmittingItem, setIsSubmittingItem] = useState(false);

  // Modal State: Inventory
  const [isRestocking, setIsRestocking] = useState(false);
  const [manageMode, setManageMode] = useState<'add' | 'remove'>('add');
  const [restockId, setRestockId] = useState<string>('');
  const [restockQty, setRestockQty] = useState<number>(1);

  // Modal State: Create Trade
  const [isCreatingTrade, setIsCreatingTrade] = useState(false);
  
  // Single Item State (Fixed Price)
  const [offerId, setOfferId] = useState('');
  const [offerQty, setOfferQty] = useState(1);
  
  // Multi Item State (Auction Bundle)
  const [bundleItems, setBundleItems] = useState<TradeItem[]>([]);
  
  const [reqId, setReqId] = useState('');
  const [reqQty, setReqQty] = useState(1);
  const [tradeType, setTradeType] = useState<'FIXED' | 'AUCTION'>('FIXED');

  // Modal State: Create Biscuit (User)
  const [isCreatingBiscuit, setIsCreatingBiscuit] = useState(false);
  const [formName, setFormName] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formColor, setFormColor] = useState(BRAND_COLORS[0].class);
  const [formIcon, setFormIcon] = useState('🍪');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Confirmation
  const [confirmState, setConfirmState] = useState<{ isOpen: boolean, msg: string, onConfirm: () => void, isDestructive?: boolean }>({ isOpen: false, msg: '', onConfirm: () => {} });

  // Initial Load & Realtime
  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      const [b, i, r, t] = await Promise.all([
        BackendService.getBiscuits(),
        BackendService.getUserInventory(user.id),
        BackendService.getRules(),
        BackendService.getP2PTrades()
      ]);
      setBiscuits(b);
      setInventory(i);
      setRules(r.filter(x => x.isActive)); // Only active rules for users
      setP2PTrades(t);
      setIsLoading(false);
    };
    loadData();

    // Subscriptions
    const channel = supabase.channel('dashboard_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory', filter: `user_id=eq.${user.id}` }, () => {
         BackendService.getUserInventory(user.id).then(setInventory);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'p2p_trades' }, () => {
         BackendService.getP2PTrades().then(setP2PTrades);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exchange_rules' }, () => {
         BackendService.getRules().then(r => setRules(r.filter(x => x.isActive)));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'biscuits' }, () => {
         BackendService.getBiscuits().then(setBiscuits);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Helpers
  const getBiscuit = (id: string) => biscuits.find(b => b.id === id);
  const getQty = (id: string) => inventory.find(i => i.biscuitId === id)?.quantity || 0;
  const biscuitOptions = biscuits.map(b => ({ value: b.id, label: b.name, icon: b.icon }));
  
  // Validation Helper for Single Item
  const maxOfferAvailable = offerId ? getQty(offerId) : 0;

  // Handlers
  const handleRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !restockId) return;

    setIsSubmittingStock(true);
    try {
        const delta = manageMode === 'add' ? restockQty : -restockQty;
        const success = await BackendService.adjustInventory(user.id, restockId, delta);
        
        if (success) {
        setRestockQty(1);
        setIsRestocking(false);
        const freshInventory = await BackendService.getUserInventory(user.id);
        setInventory(freshInventory);
        } else {
        alert("Failed to update inventory. Check if you have enough stock to remove.");
        }
    } finally {
        setIsSubmittingStock(false);
    }
  };

  const executeRule = async (ruleId: string) => {
    if (!user) return;
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;

    if (getQty(rule.fromBiscuitId) < rule.fromQty) {
      alert("Not enough biscuits!");
      return;
    }

    const deduct = await BackendService.adjustInventory(user.id, rule.fromBiscuitId, -rule.fromQty);
    if (deduct) {
      await BackendService.adjustInventory(user.id, rule.toBiscuitId, rule.toQty);
      const freshInventory = await BackendService.getUserInventory(user.id);
      setInventory(freshInventory);
    } else {
       alert("Transaction failed.");
    }
  };

  const handleAddBundleItem = () => {
      // Default to first available item that isn't already 0 quantity (optional logic)
      if (biscuits.length > 0) {
          setBundleItems([...bundleItems, { biscuitId: biscuits[0].id, qty: 1 }]);
      }
  };

  const updateBundleItem = (index: number, field: keyof TradeItem, value: any) => {
      const newItems = [...bundleItems];
      newItems[index] = { ...newItems[index], [field]: value };
      setBundleItems(newItems);
  };

  const removeBundleItem = (index: number) => {
      setBundleItems(bundleItems.filter((_, i) => i !== index));
  };

  const handleCreateTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmittingTrade(true);
    try {
        let finalOfferId = offerId;
        let finalOfferQty = offerQty;
        let finalOfferBundle: TradeItem[] | undefined = undefined;

        // Validation based on Type
        if (tradeType === 'AUCTION' && bundleItems.length > 0) {
            // Bundle Validation
            for (const item of bundleItems) {
                const avail = getQty(item.biscuitId);
                if (item.qty > avail) {
                    alert(`Insufficient stock for ${getBiscuit(item.biscuitId)?.name}. You have ${avail}.`);
                    setIsSubmittingTrade(false);
                    return;
                }
            }
            finalOfferBundle = bundleItems;
            // Use first item as display placeholder
            finalOfferId = bundleItems[0].biscuitId;
            finalOfferQty = bundleItems[0].qty;
        } else {
            // Single Item Validation
            if (!offerId) {
                alert("Please select an item to offer.");
                setIsSubmittingTrade(false);
                return;
            }
            if (offerQty > maxOfferAvailable) {
                alert(`You only have ${maxOfferAvailable} of this item.`);
                setIsSubmittingTrade(false);
                return;
            }
        }

        let finalReqId = reqId;
        let isAny = false;

        // Detect "Any" choice
        if (tradeType === 'AUCTION' && reqId === 'any') {
            isAny = true;
            // Use offerId (or first bundle item) as placeholder to satisfy DB constraint
            finalReqId = finalOfferId || (biscuits.length > 0 ? biscuits[0].id : ''); 
        }

        if (!finalReqId) {
            alert("Please select a valid item to request or enable 'Surprise Me'");
            setIsSubmittingTrade(false);
            return;
        }

        const res = await BackendService.createP2PTrade(
            user.id, finalOfferId, finalOfferQty, finalReqId, reqQty, tradeType, isAny, finalOfferBundle
        );
        
        if (res.success) {
            setIsCreatingTrade(false);
            setOfferQty(1);
            setReqQty(1);
            setOfferId('');
            setReqId('');
            setBundleItems([]);
            
            const [freshInv, freshTrades] = await Promise.all([
                BackendService.getUserInventory(user.id),
                BackendService.getP2PTrades()
            ]);
            setInventory(freshInv);
            setP2PTrades(freshTrades);
        
        } else {
            alert(res.message);
        }
    } finally {
        setIsSubmittingTrade(false);
    }
  };

  const handleAcceptTrade = (trade: P2PTrade) => {
    if (!user) return;
    
    // Construct Give Message
    const giveMsg = trade.requestQty + " " + (getBiscuit(trade.requestBiscuitId)?.name || "Items");
    
    // Construct Get Message
    let getMsg = "";
    if (trade.offerDetails && trade.offerDetails.length > 0) {
        getMsg = trade.offerDetails.map(item => `${item.qty} ${getBiscuit(item.biscuitId)?.name}`).join(", ");
    } else {
        getMsg = `${trade.offerQty} ${getBiscuit(trade.offerBiscuitId)?.name}`;
    }

    setConfirmState({
      isOpen: true,
      msg: `Accept this trade? You will give ${giveMsg} and receive ${getMsg}.`,
      onConfirm: async () => {
         const res = await BackendService.acceptP2PTrade(trade.id, user.id);
         if (!res.success) alert(res.message);
         else {
             const [freshInv, freshTrades] = await Promise.all([
                BackendService.getUserInventory(user.id),
                BackendService.getP2PTrades()
             ]);
             setInventory(freshInv);
             setP2PTrades(freshTrades);
         }
      }
    });
  };

  const handleCancelTrade = (trade: P2PTrade) => {
    if (!user) return;
    setConfirmState({
      isOpen: true,
      msg: "Cancel this trade? Your items will be refunded.",
      isDestructive: true,
      onConfirm: async () => {
        const res = await BackendService.cancelP2PTrade(trade.id, user.id);
        if (!res.success) alert(res.message);
        else {
             const [freshInv, freshTrades] = await Promise.all([
                BackendService.getUserInventory(user.id),
                BackendService.getP2PTrades()
             ]);
             setInventory(freshInv);
             setP2PTrades(freshTrades);
         }
      }
    });
  };
  
  const handleConfirmTrade = async (trade: P2PTrade) => {
      if (!user) return;
      await BackendService.confirmP2PTrade(trade.id, user.id);
  };

  // --- NEW BISCUIT LOGIC ---
  const openCreateBiscuit = () => {
    setFormName('');
    setFormBrand('');
    setFormColor(BRAND_COLORS[0].class);
    setFormIcon('🍪');
    setIsCreatingBiscuit(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFormIcon(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBiscuitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (!formName || !formBrand) {
        alert("Name and Brand are required.");
        return;
    }

    setIsSubmittingItem(true);
    try {
        const res = await BackendService.createBiscuit(user.id, formName, formBrand, formIcon || '🍪', formColor);
        if (res.success) {
            setIsCreatingBiscuit(false);
            setBiscuits(await BackendService.getBiscuits());
        } else {
            alert(res.error);
        }
    } finally {
        setIsSubmittingItem(false);
    }
  };

  // Derived Lists
  const activeP2P = p2pTrades.filter(t => t.status === 'OPEN' && t.creatorId !== user?.id);
  // Show ALL trades involving the user in history, including Cancelled
  const myHistoryTrades = p2pTrades.filter(t => t.creatorId === user?.id || t.takerId === user?.id);

  // Options for Auction (Include "Any")
  const auctionRequestOptions = [
    { value: 'any', label: 'Any / Surprise Me', icon: '🎁' },
    ...biscuitOptions
  ];

  return (
    <div className="space-y-8 pb-20">
      <ConfirmModal 
        isOpen={confirmState.isOpen} 
        message={confirmState.msg} 
        onConfirm={confirmState.onConfirm} 
        onCancel={() => setConfirmState({...confirmState, isOpen: false})} 
        isDestructive={confirmState.isDestructive}
      />

      {/* Header & Inventory Strip */}
      <section>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-4">
           <div>
             <h2 className="text-2xl md:text-4xl font-bold text-white tracking-tight">Trading Floor</h2>
             <p className="text-slate-500 text-sm md:text-base mt-1">Real-time biscuit exchange.</p>
           </div>
           <div className="flex gap-3 w-full md:w-auto">
             <button 
                onClick={openCreateBiscuit}
                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-5 py-3 md:py-3.5 rounded-xl text-xs md:text-sm font-bold transition-colors border border-slate-700 shadow-sm"
              >
                <Plus size={18} /> Add Item
             </button>
             <button 
               onClick={() => setIsRestocking(true)}
               className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-5 py-3 md:py-3.5 rounded-xl text-xs md:text-sm font-bold transition-colors border border-slate-700 shadow-sm"
             >
               <Package size={18} /> Manage Stash
             </button>
           </div>
        </div>

        {/* Inventory Scroll - Scaled Up for Desktop */}
        <div className="flex gap-4 overflow-x-auto pb-6 custom-scrollbar">
          {biscuits.map(b => {
             const qty = getQty(b.id);
             return (
               <div key={b.id} className={clsx("flex-shrink-0 bg-slate-900 border rounded-2xl p-3 md:p-5 w-28 md:w-48 flex flex-col items-center gap-3 transition-all group", qty > 0 ? "border-slate-700 opacity-100 shadow-lg" : "border-slate-800 opacity-60")}>
                  <div className="relative transform group-hover:scale-105 transition-transform duration-300">
                    <BiscuitIcon biscuit={b} size="sm" className="md:w-20 md:h-20 md:text-4xl" />
                    <span className="absolute -top-2 -right-2 bg-slate-800 text-white text-[10px] md:text-xs font-bold px-2 py-0.5 rounded-full border border-slate-600 shadow">{qty}</span>
                  </div>
                  <span className="text-xs md:text-sm font-bold text-slate-400 truncate w-full text-center group-hover:text-white transition-colors">{b.name}</span>
               </div>
             );
          })}
        </div>
      </section>

      {/* Main Tabs - Larger on Desktop */}
      <div className="flex border-b border-slate-800 mb-8 bg-slate-900/50 rounded-t-2xl overflow-hidden shadow-sm">
        {[
          { id: 'market', label: 'Fixed Exchange', icon: RefreshCcw },
          { id: 'p2p', label: 'P2P Market', icon: ShoppingBag },
          { id: 'history', label: 'My Trades', icon: History },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={clsx(
              "flex-1 py-4 md:py-6 text-sm md:text-lg font-bold flex items-center justify-center gap-2 md:gap-3 transition-all border-b-2 tracking-wide",
              activeTab === tab.id 
                ? "border-amber-500 text-white bg-slate-800/80" 
                : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
            )}
          >
            <tab.icon className="w-4 h-4 md:w-5 md:h-5" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div>
        {activeTab === 'market' && (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
             {rules.map(rule => {
                const fromB = getBiscuit(rule.fromBiscuitId);
                const toB = getBiscuit(rule.toBiscuitId);
                if (!fromB || !toB) return null;
                return (
                  <TradeCard 
                    key={rule.id}
                    rule={rule}
                    fromBiscuit={fromB}
                    toBiscuit={toB}
                    userBalance={getQty(rule.fromBiscuitId)}
                    onTrade={executeRule}
                  />
                );
             })}
             {rules.length === 0 && (
                <div className="col-span-full text-center py-20 text-slate-500 border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/30">
                  <RefreshCcw size={48} className="mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No fixed exchange rules active.</p>
                </div>
             )}
           </div>
        )}

        {activeTab === 'p2p' && (
           <div>
              <div className="flex justify-end mb-6">
                 <button 
                   onClick={() => setIsCreatingTrade(true)}
                   className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-6 py-3 md:px-8 md:py-4 rounded-xl text-sm md:text-lg font-bold shadow-xl shadow-amber-900/20 active:scale-95 transition-all"
                 >
                   <Plus size={20} /> Create Offer
                 </button>
              </div>
              <div className="space-y-4 md:space-y-6">
                 {activeP2P.map(trade => {
                    const offerB = getBiscuit(trade.offerBiscuitId);
                    const reqB = getBiscuit(trade.requestBiscuitId);
                    if (!offerB || !reqB) return null;
                    const canAfford = getQty(trade.requestBiscuitId) >= trade.requestQty;

                    // Handle Bundles Visual
                    const isBundle = trade.offerDetails && trade.offerDetails.length > 0;

                    return (
                      <div key={trade.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-8 flex flex-col lg:flex-row items-center justify-between gap-6 hover:border-slate-700 transition-colors shadow-sm">
                         <div className="flex items-center gap-6 md:gap-10 flex-1 w-full justify-center lg:justify-start">
                            {/* OFFER SIDE */}
                            <div className="flex flex-col items-center gap-2 relative">
                               {isBundle ? (
                                   <div className="relative">
                                       <div className="absolute -right-2 -top-2 z-10 bg-amber-500 text-slate-900 font-bold text-[10px] px-2 py-0.5 rounded-full border border-white shadow-sm">
                                           +{trade.offerDetails!.length - 1} More
                                       </div>
                                       {/* Stack Effect */}
                                       <div className="absolute top-1 left-1 w-full h-full bg-slate-800 rounded-full opacity-50 -z-10 translate-x-1 translate-y-1"></div>
                                       <BiscuitIcon biscuit={offerB} size="sm" className="md:w-20 md:h-20 md:text-4xl" />
                                   </div>
                               ) : (
                                   <BiscuitIcon biscuit={offerB} size="sm" className="md:w-20 md:h-20 md:text-4xl" />
                               )}
                               
                               <span className="text-xs md:text-base font-bold text-slate-400">
                                   {isBundle ? "Mixed Bundle" : `x${trade.offerQty} ${offerB.name}`}
                               </span>
                            </div>
                            
                            <div className="flex flex-col items-center justify-center px-2">
                                <ArrowRight className="text-slate-600 w-6 h-6 md:w-8 md:h-8" />
                            </div>

                            {/* REQUEST SIDE */}
                            <div className="flex flex-col items-center gap-2">
                               {trade.isAny ? (
                                   <div className="w-10 h-10 md:w-20 md:h-20 flex items-center justify-center text-2xl md:text-4xl bg-slate-800 rounded-full border border-slate-700 shadow-inner">🎁</div>
                               ) : (
                                   <BiscuitIcon biscuit={reqB} size="sm" className="md:w-20 md:h-20 md:text-4xl" />
                               )}
                               <span className="text-xs md:text-base font-bold text-amber-500">
                                   {trade.isAny ? "Any Item" : `x${trade.requestQty} ${reqB.name}`}
                               </span>
                            </div>

                            <div className="hidden lg:block h-12 w-px bg-slate-800 mx-4"></div>

                            <div className="text-center lg:text-left">
                               <div className="text-sm md:text-xl font-bold text-white">{trade.creatorName}</div>
                               <div className="text-xs md:text-sm text-slate-500 uppercase tracking-wider font-bold mt-1">{trade.tradeType} TRADE</div>
                            </div>
                         </div>
                         
                         <button 
                           onClick={() => handleAcceptTrade(trade)}
                           disabled={!canAfford}
                           className={clsx(
                             "w-full lg:w-auto px-8 py-4 rounded-xl font-bold text-sm md:text-lg uppercase tracking-wide transition-all shadow-lg min-w-[160px]",
                             canAfford 
                               ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20 active:scale-95" 
                               : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                           )}
                         >
                            {canAfford ? "Accept Deal" : "Need Stock"}
                         </button>
                      </div>
                    );
                 })}
                 {activeP2P.length === 0 && (
                    <div className="text-center py-20 text-slate-500 border-2 border-dashed border-slate-800 rounded-3xl">
                      <ShoppingBag size={48} className="mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">No active P2P offers. Be the first!</p>
                    </div>
                 )}
              </div>
           </div>
        )}

        {activeTab === 'history' && (
           <div className="space-y-4 md:space-y-6">
              {myHistoryTrades.sort((a,b) => b.createdAt - a.createdAt).map(trade => {
                 const offerB = getBiscuit(trade.offerBiscuitId);
                 const reqB = getBiscuit(trade.requestBiscuitId);
                 if (!offerB || !reqB) return null;
                 
                 const isCreator = trade.creatorId === user?.id;
                 const statusColor = trade.status === 'COMPLETED' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : trade.status === 'CANCELLED' ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20';
                 const needsMyConfirm = trade.status === 'PENDING' && ((isCreator && !trade.creatorConfirmed) || (!isCreator && !trade.takerConfirmed));
                 const waitingPartner = trade.status === 'PENDING' && ((isCreator && trade.creatorConfirmed) || (!isCreator && trade.takerConfirmed));

                 // Logic for Partner Name
                 let partnerName = isCreator ? trade.takerName : trade.creatorName;
                 if (!partnerName) {
                    if (trade.status === 'CANCELLED') partnerName = "—";
                    else partnerName = "Pending...";
                 }

                 const isBundle = trade.offerDetails && trade.offerDetails.length > 0;

                 return (
                    <div key={trade.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-8 flex flex-col lg:flex-row items-center gap-6 shadow-sm">
                        {/* 1. STATUS & DATE */}
                        <div className="flex flex-col items-center lg:items-start min-w-[140px] gap-2 border-r border-transparent lg:border-slate-800 pr-0 lg:pr-8 w-full lg:w-auto">
                            <span className={clsx("text-xs md:text-sm font-bold uppercase px-3 py-1.5 rounded-lg w-full text-center border tracking-wide", statusColor)}>
                              {trade.status}
                            </span>
                            <div className="text-[10px] md:text-xs text-slate-500 flex flex-row lg:flex-col items-center lg:items-start gap-4 lg:gap-1 mt-1">
                              <span className="flex items-center gap-1.5"><Calendar size={12}/> {new Date(trade.createdAt).toLocaleDateString()}</span>
                              <span className="flex items-center gap-1.5"><Clock size={12}/> {new Date(trade.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                        </div>

                        {/* 2. TRANSACTION DETAILS */}
                        <div className="flex-1 w-full">
                           <div className="flex items-center justify-between gap-4 bg-slate-950/50 p-4 md:p-6 rounded-xl border border-slate-800">
                              {/* LEFT: You gave / they gave */}
                              <div className="flex items-center gap-3">
                                 <div className="flex flex-col items-end">
                                    <span className="text-[10px] md:text-xs uppercase font-bold text-slate-500 mb-1">{isCreator ? "You Offered" : "Partner Offered"}</span>
                                    <span className="text-sm md:text-xl font-bold text-white flex items-center gap-3">
                                       {isBundle ? (
                                           <span className="flex items-center gap-2">
                                             <Layers size={18} className="text-amber-500"/> Bundle ({trade.offerDetails!.length} Items)
                                           </span>
                                       ) : (
                                           <>
                                            {trade.offerQty} {offerB.name}
                                            <BiscuitIcon biscuit={offerB} size="sm" className="w-8 h-8 md:w-12 md:h-12 text-sm md:text-xl"/>
                                           </>
                                       )}
                                    </span>
                                 </div>
                              </div>

                              <ArrowRight className="text-slate-600 w-5 h-5 md:w-8 md:h-8" />

                              {/* RIGHT: You got / they got */}
                              <div className="flex items-center gap-3">
                                 <div className="flex flex-col items-start">
                                    <span className="text-[10px] md:text-xs uppercase font-bold text-slate-500 mb-1">{isCreator ? "You Requested" : "Partner Requested"}</span>
                                    {trade.isAny && trade.status === 'OPEN' ? (
                                        <span className="text-sm md:text-xl font-bold text-purple-400 flex items-center gap-3">
                                            🎁 Surprise
                                        </span>
                                    ) : (
                                        <span className="text-sm md:text-xl font-bold text-white flex items-center gap-3">
                                            <BiscuitIcon biscuit={reqB} size="sm" className="w-8 h-8 md:w-12 md:h-12 text-sm md:text-xl"/>
                                            {trade.requestQty} {reqB.name}
                                        </span>
                                    )}
                                 </div>
                              </div>
                           </div>
                        </div>

                        {/* 3. PARTNER INFO */}
                        <div className="flex flex-col items-center lg:items-start min-w-[140px] text-xs md:text-sm">
                           <span className="text-[10px] md:text-xs uppercase font-bold text-slate-500 mb-1.5">Partner</span>
                           <div className="flex items-center gap-2 text-slate-300 font-bold bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
                              <User size={14} /> {partnerName}
                           </div>
                        </div>

                        {/* 4. ACTIONS */}
                        <div className="flex gap-3 w-full lg:w-auto justify-center">
                           {trade.status === 'OPEN' && isCreator && (
                              <button onClick={() => handleCancelTrade(trade)} className="text-xs md:text-sm font-bold text-red-400 hover:text-red-300 bg-red-500/10 px-6 py-3 rounded-xl border border-red-500/20 whitespace-nowrap hover:bg-red-500/20 transition-colors">
                                Cancel
                              </button>
                           )}
                           
                           {needsMyConfirm && (
                              <button onClick={() => handleConfirmTrade(trade)} className="flex items-center gap-2 text-xs md:text-sm font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 px-6 py-3 rounded-xl shadow-lg shadow-emerald-500/20 animate-pulse whitespace-nowrap transition-colors">
                                <CheckCircle size={16}/> Confirm Receipt
                              </button>
                           )}
                           
                           {waitingPartner && (
                              <span className="text-xs md:text-sm font-bold text-slate-500 italic flex items-center gap-2 whitespace-nowrap bg-slate-950 px-4 py-2 rounded-lg border border-slate-800"><Loader2 size={14} className="animate-spin"/> Waiting Partner...</span>
                           )}
                        </div>
                    </div>
                 );
              })}
              {myHistoryTrades.length === 0 && (
                <div className="text-center py-20 text-slate-500 border-2 border-dashed border-slate-800 rounded-3xl">
                   <History size={48} className="mx-auto mb-4 opacity-50"/>
                   <p className="text-lg font-medium">No trade history found.</p>
                </div>
              )}
           </div>
        )}
      </div>

      {/* --- MODALS --- */}

      {/* Inventory Modal */}
      <Modal 
        isOpen={isRestocking} 
        onClose={() => setIsRestocking(false)} 
        title="Manage Inventory" 
        icon={<Package className="text-amber-500" />}
      >
        <form onSubmit={handleRestock} className="space-y-6">
          <div className="flex bg-slate-950 p-1.5 rounded-xl border border-slate-800 mb-6">
             <button
               type="button"
               onClick={() => setManageMode('add')}
               className={clsx("flex-1 py-3 text-xs md:text-sm font-bold uppercase rounded-lg transition-all flex items-center justify-center gap-2", manageMode === 'add' ? "bg-emerald-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300")}
             >
               <Plus size={16} /> Add Stock
             </button>
             <button
               type="button"
               onClick={() => setManageMode('remove')}
               className={clsx("flex-1 py-3 text-xs md:text-sm font-bold uppercase rounded-lg transition-all flex items-center justify-center gap-2", manageMode === 'remove' ? "bg-red-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300")}
             >
               <Minus size={16} /> Remove Stock
             </button>
          </div>

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
            <div className="flex items-center gap-3">
              <button 
                type="button" 
                onClick={() => setRestockQty(Math.max(1, restockQty - 1))}
                className="h-12 w-12 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:border-slate-600 transition-all active:scale-95"
              >
                <Minus size={20} />
              </button>
              <div className="relative flex-1">
                <input 
                  type="number" min="1" max="1000"
                  value={restockQty} 
                  onChange={e => {
                    const val = parseInt(e.target.value);
                    setRestockQty(isNaN(val) ? 0 : val);
                  }} 
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-amber-500 outline-none text-xl font-mono text-center font-bold" 
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 text-[10px] font-bold tracking-wider pointer-events-none">PKTS</span>
              </div>
              <button 
                type="button" 
                onClick={() => setRestockQty(restockQty + 1)}
                className="h-12 w-12 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:text-white hover:border-slate-600 transition-all active:scale-95"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>
          <button 
             type="submit" 
             disabled={!restockId || isSubmittingStock} 
             className={clsx(
               "w-full py-4 rounded-xl font-bold text-sm md:text-base shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-white uppercase tracking-wide flex items-center justify-center gap-2",
               manageMode === 'add' ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20" : "bg-red-600 hover:bg-red-500 shadow-red-900/20"
             )}
          >
            {isSubmittingStock ? <Loader2 className="animate-spin" size={20}/> : (manageMode === 'add' ? 'Confirm Addition' : 'Confirm Removal')}
          </button>
        </form>
      </Modal>

      {/* Create Trade Modal (Re-Designed) */}
      <Modal 
        isOpen={isCreatingTrade} 
        onClose={() => setIsCreatingTrade(false)} 
        title="New Listing" 
        icon={<RefreshCw className="text-amber-500"/>}
        maxWidth="max-w-5xl"
      >
         <form onSubmit={handleCreateTrade} className="space-y-8">
            {/* Header Tabs */}
            <div className="flex gap-4 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
               <button 
                 type="button"
                 onClick={() => { setTradeType('FIXED'); setBundleItems([]); }}
                 className={clsx(
                   "flex-1 py-3 text-sm md:text-base font-bold uppercase tracking-wide rounded-lg transition-all flex items-center justify-center gap-2",
                   tradeType === 'FIXED' 
                     ? "bg-slate-800 text-white shadow-lg" 
                     : "text-slate-500 hover:text-slate-300"
                 )}
               >
                 <RefreshCcw size={18} /> Fixed Price
               </button>
               <button 
                 type="button"
                 onClick={() => setTradeType('AUCTION')}
                 className={clsx(
                   "flex-1 py-3 text-sm md:text-base font-bold uppercase tracking-wide rounded-lg transition-all flex items-center justify-center gap-2",
                   tradeType === 'AUCTION' 
                     ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg" 
                     : "text-slate-500 hover:text-slate-300"
                 )}
               >
                 <Gavel size={18} /> Auction
               </button>
            </div>

            {/* Horizontal Layout */}
            <div className="flex flex-col md:flex-row items-start gap-6">
               {/* Left: YOU GIVE */}
               <div className="flex-1 w-full space-y-3 p-6 bg-slate-950 rounded-2xl border border-slate-800 shadow-inner min-h-[300px] flex flex-col">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs uppercase font-bold text-emerald-500 flex items-center gap-2">
                        <ArrowRight size={14} className="rotate-180" /> You Give {tradeType === 'AUCTION' && "(Bundle)"}
                    </span>
                    {tradeType === 'AUCTION' && (
                        <button type="button" onClick={handleAddBundleItem} className="text-[10px] bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded border border-slate-700 text-slate-300 font-bold uppercase transition-colors">
                            + Add Item
                        </button>
                    )}
                  </div>
                  
                  {tradeType === 'AUCTION' && bundleItems.length > 0 ? (
                      <div className="space-y-3 flex-1 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                          {bundleItems.map((item, idx) => {
                              const avail = getQty(item.biscuitId);
                              return (
                                  <div key={idx} className="flex items-center gap-2 bg-slate-900 p-2 rounded-xl border border-slate-800">
                                      <div className="flex-1">
                                         <CustomSelect 
                                            value={item.biscuitId}
                                            onChange={(v) => updateBundleItem(idx, 'biscuitId', v)}
                                            options={biscuitOptions}
                                            className="text-xs"
                                         />
                                      </div>
                                      <div className="w-20">
                                          <input 
                                            type="number" min="1" max={avail}
                                            value={item.qty}
                                            onChange={(e) => updateBundleItem(idx, 'qty', parseInt(e.target.value) || 1)}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 px-2 text-center text-white font-bold text-sm outline-none focus:border-amber-500"
                                          />
                                      </div>
                                      <button type="button" onClick={() => removeBundleItem(idx)} className="p-2.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"><Trash2 size={16}/></button>
                                  </div>
                              )
                          })}
                      </div>
                  ) : (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <CustomSelect 
                                value={offerId} 
                                onChange={(val) => {
                                    setOfferId(val);
                                    setOfferQty(1); // Reset qty on change
                                }} 
                                options={biscuitOptions} 
                                placeholder="Select Item"
                                />
                            </div>
                        </div>
                        
                        <div className={clsx("flex items-center border rounded-xl h-12 transition-colors", !offerId ? "border-slate-800 bg-slate-900/50 opacity-50" : "border-slate-700 bg-slate-900")}>
                            <button 
                                type="button" 
                                disabled={!offerId || offerQty <= 1}
                                onClick={() => setOfferQty(Math.max(1, offerQty - 1))} 
                                className="w-12 h-full flex items-center justify-center text-slate-400 hover:text-white border-r border-slate-700 active:bg-slate-800 rounded-l-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Minus size={18}/>
                            </button>
                            
                            <input 
                            type="number" min="1" max={maxOfferAvailable}
                            value={offerQty} 
                            disabled={!offerId}
                            onChange={e => {
                                const val = parseInt(e.target.value) || 0;
                                setOfferQty(Math.max(1, Math.min(val, maxOfferAvailable)));
                            }} 
                            className="flex-1 bg-transparent text-center text-white font-bold font-mono outline-none text-lg disabled:cursor-not-allowed disabled:text-slate-500"
                            />
                            
                            <button 
                                type="button" 
                                disabled={!offerId || offerQty >= maxOfferAvailable}
                                onClick={() => setOfferQty(Math.min(maxOfferAvailable, offerQty + 1))} 
                                className="w-12 h-full flex items-center justify-center text-slate-400 hover:text-white border-l border-slate-700 active:bg-slate-800 rounded-r-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Plus size={18}/>
                            </button>
                        </div>
                        {offerId && (
                            <div className="flex justify-between items-center text-[10px] font-bold mt-1 px-1">
                                <span className="text-slate-500 uppercase tracking-wider">Inventory Limit</span>
                                <span className={clsx("transition-colors", offerQty === maxOfferAvailable ? "text-amber-500" : "text-slate-400")}>{offerQty} / {maxOfferAvailable}</span>
                            </div>
                        )}
                        {tradeType === 'AUCTION' && bundleItems.length === 0 && (
                            <button type="button" onClick={handleAddBundleItem} className="w-full py-3 border border-dashed border-slate-700 rounded-xl text-slate-500 text-xs font-bold uppercase hover:border-amber-500 hover:text-amber-500 transition-colors">
                                Switch to Multi-Item Bundle
                            </button>
                        )}
                    </div>
                  )}
               </div>
               
               {/* Center Arrow */}
               <div className="flex items-center justify-center text-slate-600 shrink-0 self-center">
                  <ArrowRight className="hidden md:block text-slate-500" size={32} />
                  <ArrowRight className="block md:hidden rotate-90 text-slate-500" size={32} />
               </div>

               {/* Right: YOU GET / PREFERRED */}
               <div className="flex-1 w-full space-y-3 p-6 bg-slate-950 rounded-2xl border border-slate-800 shadow-inner min-h-[300px]">
                  <span className={clsx(
                      "text-xs uppercase font-bold flex items-center gap-2 mb-3",
                      tradeType === 'AUCTION' ? "text-purple-400" : "text-amber-500"
                  )}>
                    <ArrowRight size={14} /> {tradeType === 'AUCTION' ? "Preferred Request (Optional)" : "You Get"}
                  </span>
                  
                  <div className="flex items-center gap-3">
                     <div className="flex-1">
                        <CustomSelect 
                           value={reqId} 
                           onChange={setReqId} 
                           options={tradeType === 'AUCTION' ? auctionRequestOptions : biscuitOptions} 
                           placeholder={tradeType === 'AUCTION' ? "Any or Select..." : "Select Item"}
                        />
                     </div>
                  </div>

                  {/* Hide quantity if "Any" is selected */}
                  {reqId !== 'any' && (
                    <div className="flex items-center border border-slate-700 rounded-xl bg-slate-900 mt-3 h-12">
                        <button type="button" onClick={() => setReqQty(Math.max(1, reqQty - 1))} className="w-12 h-full flex items-center justify-center text-slate-400 hover:text-white border-r border-slate-700 active:bg-slate-800 rounded-l-xl transition-colors"><Minus size={18}/></button>
                        <input 
                        type="number" min="1" 
                        value={reqQty} 
                        onChange={e => setReqQty(Math.max(1, parseInt(e.target.value) || 0))} 
                        className="flex-1 bg-transparent text-center text-white font-bold font-mono outline-none text-lg"
                        />
                        <button type="button" onClick={() => setReqQty(reqQty + 1)} className="w-12 h-full flex items-center justify-center text-slate-400 hover:text-white border-l border-slate-700 active:bg-slate-800 rounded-r-xl transition-colors"><Plus size={18}/></button>
                    </div>
                  )}

                  {tradeType === 'AUCTION' && (
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-500 mt-6 leading-relaxed">
                          <p className="font-bold text-slate-400 mb-1">Auction Note:</p>
                          In an auction, users can bid anything. The item you select here is just a <em>preference</em> to guide bidders. You can accept any incoming bid.
                      </div>
                  )}
               </div>
            </div>

            <button 
              type="submit" 
              disabled={(!offerId && bundleItems.length === 0) || (tradeType === 'FIXED' && !reqId) || isSubmittingTrade} 
              className={clsx(
                "w-full font-bold py-5 rounded-xl shadow-xl transition-all text-base md:text-lg uppercase tracking-wide active:scale-[0.99] flex items-center justify-center gap-3",
                tradeType === 'AUCTION' 
                   ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white" 
                   : "bg-amber-600 hover:bg-amber-500 text-white"
              )}
            >
              {isSubmittingTrade ? <Loader2 className="animate-spin" size={24}/> : (tradeType === 'AUCTION' ? "Start Auction" : "Post Fixed Trade")}
            </button>
         </form>
      </Modal>

      {/* Add New Biscuit Modal (User) */}
      <Modal 
        isOpen={isCreatingBiscuit} 
        onClose={() => setIsCreatingBiscuit(false)} 
        title="Add New Biscuit" 
        icon={<Cookie className="text-amber-500" />}
      >
        <form onSubmit={handleBiscuitSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">Name</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Bourbon" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white text-sm focus:border-amber-500 outline-none" required />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">Brand</label>
              <input value={formBrand} onChange={e => setFormBrand(e.target.value)} placeholder="e.g. Britannia" className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white text-sm focus:border-amber-500 outline-none" required />
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">Icon / Image</label>
             <div className="flex items-center gap-4">
               <div className="w-16 h-16 bg-slate-800 rounded-xl flex items-center justify-center overflow-hidden border border-slate-700 shadow-inner">
                  {formIcon && (formIcon.startsWith('http') || formIcon.startsWith('data:')) ? <img src={formIcon} className="w-full h-full object-cover"/> : <span className="text-3xl">{formIcon || '🍪'}</span>}
               </div>
               <div className="flex-1 flex gap-2">
                 <button type="button" onClick={() => fileInputRef.current?.click()} className="flex-1 text-sm bg-slate-800 hover:bg-slate-700 px-4 py-3 rounded-lg border border-slate-700 text-white flex items-center justify-center gap-2 transition-colors"><Upload size={16}/> Upload Image</button>
               </div>
               <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*" />
             </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2">Color Tag</label>
            <div className="flex flex-wrap gap-3">
              {BRAND_COLORS.map(c => (
                <button 
                  type="button" 
                  key={c.name} 
                  onClick={() => setFormColor(c.class)} 
                  className={clsx(
                    "w-9 h-9 rounded-full border-2 transition-transform", 
                    c.class, 
                    formColor === c.class ? "border-white scale-110 shadow-lg" : "border-transparent opacity-50 hover:opacity-100 hover:scale-105"
                  )} 
                />
              ))}
            </div>
          </div>
          <button type="submit" disabled={isSubmittingItem} className="w-full py-4 bg-amber-600 hover:bg-amber-500 rounded-xl text-white font-bold text-sm shadow-lg shadow-amber-900/20 active:scale-[0.98] uppercase tracking-wide flex items-center justify-center gap-2">
            {isSubmittingItem ? <Loader2 className="animate-spin" size={20}/> : "Create Biscuit"}
          </button>
        </form>
      </Modal>

    </div>
  );
};