import React, { useState, useEffect, useRef } from 'react';
import { BackendService, supabase } from '../services/backend';
import { Biscuit, ExchangeRule, P2PTrade, User, InventoryItem } from '../types';
import { CustomSelect } from '../components/CustomSelect';
import { ConfirmModal } from '../components/ConfirmModal';
import { Modal } from '../components/Modal';
import { BiscuitIcon } from '../components/BiscuitIcon';
import { Plus, Trash2, RefreshCcw, User as UserIcon, ArrowRight, History, Cookie, Settings, Check, X, Lock, Unlock, Pen, Upload, Info, Loader2, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

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

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'biscuits' | 'trades' | 'rules'>('users');
  
  const [rules, setRules] = useState<ExchangeRule[]>([]);
  const [biscuits, setBiscuits] = useState<Biscuit[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [allTrades, setAllTrades] = useState<P2PTrade[]>([]);
  
  // Rule / Inventory State
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [userInventory, setUserInventory] = useState<InventoryItem[]>([]);

  // Biscuit Edit State
  const [editingBiscuit, setEditingBiscuit] = useState<Biscuit | null>(null);
  const [editName, setEditName] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Deletion State for Biscuits
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modals
  const [confirmState, setConfirmState] = useState<{ isOpen: boolean, msg: string, onConfirm: () => void, isDestructive?: boolean }>({ isOpen: false, msg: '', onConfirm: () => {} });

  // Initial Data Load & Realtime
  useEffect(() => {
    const fetchData = async () => {
      // Parallel fetch for speed on mount
      const [r, b, u, t] = await Promise.all([
        BackendService.getRules(),
        BackendService.getBiscuits(),
        BackendService.getUsers(),
        BackendService.getAllTrades()
      ]);
      setRules(r);
      setBiscuits(b);
      setUsers(u);
      setAllTrades(t);
    };
    fetchData();

    // REALTIME SUBSCRIPTION FOR ADMIN
    // Listens to changes in all key tables to update UI instantly without reload
    const channel = supabase.channel('admin_dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
          BackendService.getUsers().then(setUsers);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'biscuits' }, () => {
          BackendService.getBiscuits().then(setBiscuits);
          // Refresh rules/trades too as they might be cascade deleted or updated
          BackendService.getRules().then(setRules);
          BackendService.getAllTrades().then(setAllTrades);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'exchange_rules' }, () => {
          BackendService.getRules().then(setRules);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'p2p_trades' }, () => {
          BackendService.getAllTrades().then(setAllTrades);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Fetch data specific to the active tab when switching
  // This ensures that even if realtime missed an event, the user sees fresh data upon navigation
  useEffect(() => {
    const refreshTab = async () => {
      if (activeTab === 'users') setUsers(await BackendService.getUsers());
      if (activeTab === 'biscuits') setBiscuits(await BackendService.getBiscuits());
      if (activeTab === 'trades') setAllTrades(await BackendService.getAllTrades());
      if (activeTab === 'rules') {
        const [r, b] = await Promise.all([BackendService.getRules(), BackendService.getBiscuits()]);
        setRules(r);
        setBiscuits(b);
      }
    };
    refreshTab();
  }, [activeTab]);

  useEffect(() => {
    if (selectedUser) {
      loadUserInventory(selectedUser);
      
      // Subscribe to inventory changes for the selected user
      const invChannel = supabase.channel(`admin_inv_${selectedUser}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory', filter: `user_id=eq.${selectedUser}` }, () => {
           loadUserInventory(selectedUser);
        })
        .subscribe();
        
      return () => { supabase.removeChannel(invChannel); };
    } else {
      setUserInventory([]);
    }
  }, [selectedUser]);

  const loadUserInventory = async (userId: string) => {
    const inv = await BackendService.getUserInventory(userId);
    setUserInventory(inv);
  };

  // --- ACTIONS ---

  const handleToggleFreeze = (user: User) => {
    setConfirmState({
      isOpen: true,
      msg: user.isFrozen ? `Unfreeze ${user.name}? They will be able to trade again.` : `Freeze ${user.name}? They will be unable to login or trade.`,
      isDestructive: !user.isFrozen,
      onConfirm: async () => {
        // Optimistic Update
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isFrozen: !user.isFrozen } : u));
        await BackendService.toggleUserFreeze(user.id, user.isFrozen);
        // Background refresh to confirm
        BackendService.getUsers().then(setUsers);
      }
    });
  };

  const handleDeleteUser = (user: User) => {
    setConfirmState({
      isOpen: true,
      msg: `Permanently delete ${user.name}? This removes their inventory and trade history. This cannot be undone.`,
      isDestructive: true,
      onConfirm: async () => {
        // Optimistic Update
        setUsers(prev => prev.filter(u => u.id !== user.id));
        await BackendService.deleteUser(user.id);
      }
    });
  };

  const openEditBiscuit = (b: Biscuit) => {
    setEditingBiscuit(b);
    setEditName(b.name);
    setEditBrand(b.brand);
    setEditColor(b.color);
    setEditIcon(b.icon);
  };

  const handleDeleteBiscuit = (b: Biscuit) => {
    setConfirmState({
      isOpen: true,
      msg: `Delete ${b.name} from the catalogue? This will remove it from all users' inventories, cancel related active trades, and remove trade rules.`,
      isDestructive: true,
      onConfirm: async () => {
        setDeletingId(b.id);
        const success = await BackendService.deleteBiscuit(b.id);
        if (success) {
           if (editingBiscuit?.id === b.id) setEditingBiscuit(null);
           // Optimistic Update
           setBiscuits(prev => prev.filter(i => i.id !== b.id));
           // Refresh dependencies
           BackendService.getRules().then(setRules);
           BackendService.getAllTrades().then(setAllTrades);
        } else {
           alert("Failed to delete biscuit. Check console for details.");
        }
        setDeletingId(null);
      }
    });
  };

  const handleSaveBiscuit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBiscuit) return;
    
    // Create optimistic object
    const updatedBiscuit = { ...editingBiscuit, name: editName, brand: editBrand, color: editColor, icon: editIcon };
    setBiscuits(prev => prev.map(b => b.id === editingBiscuit.id ? updatedBiscuit : b));
    setEditingBiscuit(null);

    await BackendService.updateBiscuit(editingBiscuit.id, {
      name: editName,
      brand: editBrand,
      color: editColor,
      icon: editIcon
    });
    
    // Confirm with server
    BackendService.getBiscuits().then(setBiscuits);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setEditIcon(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleRule = async (rule: ExchangeRule) => {
    // Optimistic
    const updated = { ...rule, isActive: !rule.isActive };
    setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
    await BackendService.saveRule(updated);
  };

  const deleteRule = (id: string) => {
    setConfirmState({
      isOpen: true,
      msg: "Permanently delete this trade rule?",
      isDestructive: true,
      onConfirm: async () => {
        setRules(prev => prev.filter(r => r.id !== id));
        await BackendService.deleteRule(id);
      }
    });
  };

  const createRule = async () => {
    if (biscuits.length < 2) {
       alert("You need at least two biscuit types to create a trade route.");
       return;
    }

    const newRule: ExchangeRule = {
      id: Date.now().toString(), // Temp ID
      fromBiscuitId: biscuits[0].id,
      toBiscuitId: biscuits[1].id,
      fromQty: 1,
      toQty: 1,
      isActive: false
    };
    
    // Add optimistic (with temp ID)
    setRules(prev => [...prev, newRule]);
    await BackendService.saveRule(newRule);
    // Refresh to get real ID
    BackendService.getRules().then(setRules);
  };

  const updateRuleValue = async (id: string, field: keyof ExchangeRule, value: any) => {
    const rule = rules.find(r => r.id === id);
    if (rule) {
      const updated = { ...rule, [field]: value };
      // Optimistic update
      setRules(prev => prev.map(r => r.id === id ? updated : r));
      await BackendService.saveRule(updated);
    }
  };

  const handleInventoryChange = (biscuitId: string, val: string) => {
    const qty = parseInt(val);
    if (!isNaN(qty) && qty >= 0) {
      setUserInventory(prev => prev.map(i => i.biscuitId === biscuitId ? { ...i, quantity: qty } : i));
    }
  };

  const commitInventoryChange = async (biscuitId: string, qty: number) => {
    if (!selectedUser) return;
    await BackendService.updateUserInventory(selectedUser, biscuitId, qty);
  };

  const getBiscuitName = (id: string) => biscuits.find(b => b.id === id)?.name || id;
  const getBiscuit = (id: string) => biscuits.find(b => b.id === id);

  const biscuitOptions = biscuits.map(b => ({ value: b.id, label: b.name, icon: b.icon }));
  const userOptions = users.map(u => ({ value: u.id, label: `${u.name} (${u.email})` }));

  return (
    <div className="pb-12 h-full flex flex-col">
      <ConfirmModal 
        isOpen={confirmState.isOpen}
        message={confirmState.msg}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(prev => ({...prev, isOpen: false}))}
        isDestructive={confirmState.isDestructive}
      />

      {/* Edit Biscuit Modal */}
      <Modal isOpen={!!editingBiscuit} onClose={() => setEditingBiscuit(null)} title="Edit Biscuit Details" icon={<Cookie className="text-amber-500" />}>
        <form onSubmit={handleSaveBiscuit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Name</label>
              <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm" />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Brand</label>
              <input value={editBrand} onChange={e => setEditBrand(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Icon</label>
             <div className="flex items-center gap-3">
               <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center overflow-hidden border border-slate-700">
                  {editIcon.startsWith('http') || editIcon.startsWith('data:') ? <img src={editIcon} className="w-full h-full object-cover"/> : <span className="text-2xl">{editIcon}</span>}
               </div>
               <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded border border-slate-700 text-white flex gap-2"><Upload size={14}/> Upload New</button>
               <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
             </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2">Color Tag</label>
            <div className="flex flex-wrap gap-2">
              {BRAND_COLORS.map(c => (
                <button type="button" key={c.name} onClick={() => setEditColor(c.class)} className={clsx("w-6 h-6 rounded-full border-2", c.class, editColor === c.class ? "border-white scale-110" : "border-transparent opacity-50")} />
              ))}
            </div>
          </div>
          <button type="submit" className="w-full py-2 bg-amber-600 hover:bg-amber-500 rounded text-white font-bold text-sm">Save Changes</button>
        </form>
      </Modal>

      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Admin Console</h2>
          <p className="text-slate-500 text-sm mt-1">Full system control.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 mb-6 bg-slate-900/50 rounded-t-xl overflow-hidden">
        {[
          { id: 'users', label: 'Users', icon: UserIcon },
          { id: 'biscuits', label: 'Catalogue', icon: Cookie },
          { id: 'trades', label: 'Global Trades', icon: History },
          { id: 'rules', label: 'System Rules', icon: Settings },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={clsx(
              "flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-all border-b-2",
              activeTab === tab.id 
                ? "border-amber-500 text-white bg-slate-800" 
                : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50"
            )}
          >
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1">
        
        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
             <div className="grid grid-cols-12 gap-4 p-4 border-b border-slate-800 bg-slate-950/50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <div className="col-span-4">User Details</div>
                <div className="col-span-2">Role</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-4 text-right">Actions</div>
             </div>
             <div className="divide-y divide-slate-800/50">
               {users.map(u => (
                 <div key={u.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-slate-800/30 transition-colors">
                    <div className="col-span-4">
                       <div className="font-bold text-slate-200 text-sm">{u.name}</div>
                       <div className="text-xs text-slate-500">{u.email}</div>
                    </div>
                    <div className="col-span-2">
                       <span className={clsx("text-[10px] px-2 py-0.5 rounded border uppercase font-bold", u.role === 'ADMIN' ? "bg-purple-500/10 text-purple-400 border-purple-500/20" : "bg-slate-800 text-slate-400 border-slate-700")}>{u.role}</span>
                    </div>
                    <div className="col-span-2">
                       {u.isFrozen ? (
                         <span className="flex items-center gap-1 text-xs text-red-400 font-bold"><Lock size={12}/> Frozen</span>
                       ) : (
                         <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold"><Check size={12}/> Active</span>
                       )}
                    </div>
                    <div className="col-span-4 flex justify-end gap-2">
                       <button onClick={() => handleToggleFreeze(u)} className={clsx("p-2 rounded hover:bg-slate-700 transition-colors", u.isFrozen ? "text-emerald-400" : "text-amber-500")} title={u.isFrozen ? "Unfreeze" : "Freeze"}>
                          {u.isFrozen ? <Unlock size={16} /> : <Lock size={16} />}
                       </button>
                       <button onClick={() => handleDeleteUser(u)} className="p-2 rounded hover:bg-red-900/20 text-slate-600 hover:text-red-500 transition-colors" title="Delete User">
                          <Trash2 size={16} />
                       </button>
                    </div>
                 </div>
               ))}
             </div>
          </div>
        )}

        {/* BISCUITS TAB */}
        {activeTab === 'biscuits' && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {biscuits.map(b => (
              <div key={b.id} className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col items-center gap-4 relative group hover:border-slate-600 transition-all overflow-hidden">
                 
                 {/* Deletion Loading Overlay */}
                 {deletingId === b.id && (
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center text-center p-2 rounded-xl">
                      <Loader2 className="animate-spin text-red-500 mb-2" size={28} />
                      <span className="text-red-400 text-[10px] font-bold uppercase tracking-wider">Deleting...</span>
                    </div>
                 )}

                 {/* Manual Delete Link Indicator (Requested Feature) */}
                 {b.imageDeleteHash && b.imageDeleteHash.startsWith('http') && (
                   <a 
                     href={b.imageDeleteHash} 
                     target="_blank" 
                     rel="noopener noreferrer"
                     className="absolute top-2 left-2 p-1.5 bg-slate-800 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700 opacity-0 group-hover:opacity-100 transition-all z-10"
                     title="Open External Delete Page (Manual)"
                   >
                     <ExternalLink size={14} />
                   </a>
                 )}

                 <BiscuitIcon biscuit={b} size="lg" />
                 <div className="text-center">
                    <div className="font-bold text-slate-200">{b.name}</div>
                    <div className="text-xs text-slate-500">{b.brand}</div>
                 </div>
                 
                 <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button 
                      onClick={() => openEditBiscuit(b)}
                      disabled={!!deletingId}
                      className="p-1.5 bg-slate-800 rounded text-slate-500 hover:text-white hover:bg-slate-700 disabled:opacity-50"
                      title="Edit Details"
                    >
                      <Pen size={14} />
                    </button>
                    <button 
                      onClick={() => handleDeleteBiscuit(b)}
                      disabled={!!deletingId}
                      className="p-1.5 bg-slate-800 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700 disabled:opacity-50"
                      title="Delete Biscuit"
                    >
                      <Trash2 size={14} />
                    </button>
                 </div>
              </div>
            ))}
          </div>
        )}

        {/* TRADES TAB */}
        {activeTab === 'trades' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
             <div className="p-4 border-b border-slate-800 bg-slate-950/50 text-xs font-bold text-slate-500 flex justify-between">
                <span>Total Trades: {allTrades.length}</span>
             </div>
             <div className="max-h-[600px] overflow-y-auto">
                {allTrades.map(trade => {
                  const offerB = getBiscuit(trade.offerBiscuitId);
                  const reqB = getBiscuit(trade.requestBiscuitId);
                  // Safely handle if biscuit was just deleted but trade update hasn't propagated or it's a ghost trade
                  if(!offerB || !reqB) return null;
                  
                  return (
                    <div key={trade.id} className="p-4 border-b border-slate-800/50 flex items-center justify-between hover:bg-slate-800/20">
                       <div className="flex items-center gap-4">
                          <span className={clsx("text-[10px] w-20 text-center py-1 rounded border font-bold uppercase", 
                             trade.status === 'COMPLETED' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                             trade.status === 'OPEN' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                             trade.status === 'PENDING' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                             "bg-red-500/10 text-red-400 border-red-500/20"
                          )}>{trade.status}</span>
                          <div className="text-sm text-slate-400">
                             <span className="text-white font-bold">{trade.creatorName}</span> gave <span className="text-amber-500 font-mono">{trade.offerQty} {offerB.name}</span>
                          </div>
                          <ArrowRight size={14} className="text-slate-600"/>
                          <div className="text-sm text-slate-400">
                             to <span className="text-white font-bold">{trade.takerName || 'Anyone'}</span> for <span className="text-emerald-500 font-mono">{trade.requestQty} {reqB.name}</span>
                          </div>
                       </div>
                       <div className="text-[10px] text-slate-300 font-mono">{new Date(trade.createdAt).toLocaleDateString()}</div>
                    </div>
                  )
                })}
             </div>
          </div>
        )}

        {/* RULES TAB */}
        {activeTab === 'rules' && (
          <div className="space-y-8">
            <section className="bg-slate-900/50 rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/80">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 uppercase tracking-wide">
                  <RefreshCcw size={16} className="text-amber-500"/> 
                  Static Exchange Routes (Legacy)
                </h3>
                <button 
                  onClick={createRule}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm"
                >
                  <Plus size={14} /> Add Route
                </button>
              </div>

              <div className="px-6 pt-4">
                 <div className="bg-blue-900/10 border border-blue-500/20 rounded-lg p-3 flex gap-3 text-blue-300">
                    <Info size={18} className="shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1 leading-relaxed">
                       <p className="font-bold">About Exchange Routes</p>
                       <p className="opacity-80">These rules define fixed exchange rates used for automated system trades or reference pricing. Users can still create custom P2P offers in the marketplace.</p>
                    </div>
                 </div>
              </div>
              
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {rules.length === 0 && (
                   <div className="col-span-full text-center py-10 text-slate-500 text-sm italic border-dashed border border-slate-800 rounded-xl">
                      No static rules defined yet. Click "Add Route" to create one.
                   </div>
                )}
                {rules.map(rule => (
                  <div key={rule.id} className="bg-slate-950 border border-slate-800 rounded-xl p-5 relative group hover:border-slate-700 transition-all shadow-sm">
                    <div className="absolute top-4 right-4 flex gap-2">
                       <button 
                         onClick={() => toggleRule(rule)}
                         className={clsx(
                           "w-10 h-5 rounded-full relative transition-colors duration-200 ease-in-out focus:outline-none",
                           rule.isActive ? "bg-emerald-600" : "bg-slate-700"
                         )}
                       >
                         <span className={clsx("absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 shadow-sm", rule.isActive ? "translate-x-5" : "translate-x-0")} />
                       </button>
                       <button onClick={() => deleteRule(rule.id)} className="text-slate-600 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
                    </div>

                    <div className="mt-6 flex items-center gap-2">
                       <div className="flex-1 space-y-2">
                          <input 
                            type="number" min="1" 
                            value={rule.fromQty} 
                            onChange={(e) => updateRuleValue(rule.id, 'fromQty', parseInt(e.target.value))}
                            className="w-full text-center bg-slate-900 border border-slate-700 rounded-lg py-1.5 text-sm font-mono text-white mb-2"
                          />
                          <CustomSelect 
                             value={rule.fromBiscuitId} 
                             onChange={(v) => updateRuleValue(rule.id, 'fromBiscuitId', v)} 
                             options={biscuitOptions}
                             className="w-full"
                          />
                       </div>

                       <div className="flex items-center justify-center pt-8 px-2 text-slate-600">
                          <ArrowRight size={16} />
                       </div>

                       <div className="flex-1 space-y-2">
                          <input 
                            type="number" min="1" 
                            value={rule.toQty} 
                            onChange={(e) => updateRuleValue(rule.id, 'toQty', parseInt(e.target.value))}
                            className="w-full text-center bg-slate-900 border border-slate-700 rounded-lg py-1.5 text-sm font-mono text-white mb-2"
                          />
                          <CustomSelect 
                             value={rule.toBiscuitId} 
                             onChange={(v) => updateRuleValue(rule.id, 'toBiscuitId', v)} 
                             options={biscuitOptions}
                             className="w-full"
                          />
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="bg-slate-900/50 rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
              <div className="p-6 border-b border-slate-800">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 uppercase tracking-wide">
                  <UserIcon size={16} className="text-blue-500"/> 
                  User Inventory Override
                </h3>
              </div>

              <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 h-fit">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-3 tracking-wider">Select User Target</label>
                  <CustomSelect 
                    value={selectedUser}
                    onChange={setSelectedUser}
                    options={userOptions}
                    placeholder="Search Users..."
                  />
                  <p className="text-xs text-slate-500 mt-4 leading-relaxed">
                    Select a user to inspect and manually adjust their inventory levels. Changes here are immediate.
                  </p>
                </div>

                <div className="lg:col-span-2">
                   {selectedUser ? (
                     <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-slate-950 p-6 rounded-xl border border-slate-800">
                       {userInventory.map(item => (
                         <div key={`${selectedUser}-${item.biscuitId}`} className="flex flex-col gap-2 p-3 bg-slate-900 rounded-lg border border-slate-800">
                           <label className="text-[10px] text-slate-400 font-bold uppercase truncate tracking-wider">
                             {getBiscuitName(item.biscuitId)}
                           </label>
                           <input 
                             type="number"
                             min="0"
                             value={item.quantity}
                             onChange={(e) => handleInventoryChange(item.biscuitId, e.target.value)}
                             onBlur={(e) => commitInventoryChange(item.biscuitId, parseInt(e.target.value))}
                             className="bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-white focus:border-blue-500 outline-none w-full text-lg font-mono font-bold"
                           />
                         </div>
                       ))}
                       {userInventory.length === 0 && <p className="text-slate-500">No inventory found for this user.</p>}
                     </div>
                   ) : (
                     <div className="h-full flex items-center justify-center bg-slate-950/50 rounded-xl border border-slate-800 border-dashed min-h-[200px]">
                       <p className="text-slate-500 text-sm">Select a user to view stash.</p>
                     </div>
                   )}
                </div>
              </div>
            </section>
          </div>
        )}

      </div>
    </div>
  );
};