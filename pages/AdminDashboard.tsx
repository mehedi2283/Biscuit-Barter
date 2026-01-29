import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { BackendService, supabase } from '../services/backend';
import { Biscuit, ExchangeRule, P2PTrade, User, InventoryItem } from '../types';
import { CustomSelect } from '../components/CustomSelect';
import { ConfirmModal } from '../components/ConfirmModal';
import { Modal } from '../components/Modal';
import { BiscuitIcon } from '../components/BiscuitIcon';
import { Plus, Trash2, RefreshCcw, User as UserIcon, ArrowRight, History, Cookie, Settings, Check, X, Lock, Unlock, Pen, Upload, Info, Loader2, ExternalLink, Search } from 'lucide-react';
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
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'biscuits' | 'trades' | 'rules'>('users');
  const [isLoading, setIsLoading] = useState(false);
  
  const [rules, setRules] = useState<ExchangeRule[]>([]);
  const [biscuits, setBiscuits] = useState<Biscuit[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [allTrades, setAllTrades] = useState<P2PTrade[]>([]);
  
  // Rule / Inventory State
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [userInventory, setUserInventory] = useState<InventoryItem[]>([]);

  // Biscuit Create/Edit State
  const [isCreatingBiscuit, setIsCreatingBiscuit] = useState(false);
  const [editingBiscuit, setEditingBiscuit] = useState<Biscuit | null>(null);
  
  // Form State (Shared for Create/Edit)
  const [formName, setFormName] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formColor, setFormColor] = useState(BRAND_COLORS[0].class);
  const [formIcon, setFormIcon] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Deletion State for Biscuits
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modals
  const [confirmState, setConfirmState] = useState<{ isOpen: boolean, msg: string, onConfirm: () => void, isDestructive?: boolean }>({ isOpen: false, msg: '', onConfirm: () => {} });

  // Initial Data Load & Realtime
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
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
      setIsLoading(false);
    };
    fetchData();

    // REALTIME SUBSCRIPTION FOR ADMIN
    const channel = supabase.channel('admin_dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
          BackendService.getUsers().then(setUsers);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'biscuits' }, () => {
          BackendService.getBiscuits().then(b => {
             setBiscuits(b);
             // Also refresh dependent data
             BackendService.getRules().then(setRules);
             BackendService.getAllTrades().then(setAllTrades);
          });
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

  // Helpers to refresh specific data on tab switch
  useEffect(() => {
    const refreshTab = async () => {
      // Background refresh without full loader to keep UI snappy
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
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isFrozen: !user.isFrozen } : u));
        await BackendService.toggleUserFreeze(user.id, user.isFrozen);
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
        setUsers(prev => prev.filter(u => u.id !== user.id));
        await BackendService.deleteUser(user.id);
      }
    });
  };

  // --- BISCUIT ACTIONS ---

  const openCreateBiscuit = () => {
    setFormName('');
    setFormBrand('');
    setFormColor(BRAND_COLORS[0].class);
    setFormIcon('🍪');
    setIsCreatingBiscuit(true);
  };

  const openEditBiscuit = (b: Biscuit) => {
    setEditingBiscuit(b);
    setFormName(b.name);
    setFormBrand(b.brand);
    setFormColor(b.color);
    setFormIcon(b.icon);
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
           setBiscuits(prev => prev.filter(i => i.id !== b.id));
           // Dependencies refresh
           BackendService.getRules().then(setRules);
           BackendService.getAllTrades().then(setAllTrades);
        } else {
           alert("Failed to delete biscuit. Check console for details.");
        }
        setDeletingId(null);
      }
    });
  };

  const handleBiscuitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // VALIDATION
    if (!formName || !formBrand) {
        alert("Name and Brand are required.");
        return;
    }

    if (isCreatingBiscuit) {
        const res = await BackendService.createBiscuit(user.id, formName, formBrand, formIcon || '🍪', formColor);
        if (res.success) {
            setIsCreatingBiscuit(false);
            setBiscuits(await BackendService.getBiscuits());
        } else {
            alert(res.error);
        }
    } else if (editingBiscuit) {
        // Optimistic
        const updated = { ...editingBiscuit, name: formName, brand: formBrand, color: formColor, icon: formIcon };
        setBiscuits(prev => prev.map(b => b.id === editingBiscuit.id ? updated : b));
        setEditingBiscuit(null);

        await BackendService.updateBiscuit(editingBiscuit.id, {
            name: formName,
            brand: formBrand,
            color: formColor,
            icon: formIcon
        });
        BackendService.getBiscuits().then(setBiscuits);
    }
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

  // --- RULE ACTIONS ---

  const toggleRule = async (rule: ExchangeRule) => {
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
    setRules(prev => [...prev, newRule]);
    await BackendService.saveRule(newRule);
    BackendService.getRules().then(setRules);
  };

  const updateRuleValue = async (id: string, field: keyof ExchangeRule, value: any) => {
    const rule = rules.find(r => r.id === id);
    if (rule) {
      const updated = { ...rule, [field]: value };
      setRules(prev => prev.map(r => r.id === id ? updated : r));
      await BackendService.saveRule(updated);
    }
  };

  // --- INVENTORY ACTIONS ---

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

      {/* Biscuit Modal (Shared for Create/Edit) */}
      <Modal 
        isOpen={!!editingBiscuit || isCreatingBiscuit} 
        onClose={() => { setEditingBiscuit(null); setIsCreatingBiscuit(false); }} 
        title={isCreatingBiscuit ? "Add New Biscuit" : "Edit Biscuit Details"} 
        icon={<Cookie className="text-amber-500" />}
      >
        <form onSubmit={handleBiscuitSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Name</label>
              <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Bourbon" className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm focus:border-amber-500 outline-none" required />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Brand</label>
              <input value={formBrand} onChange={e => setFormBrand(e.target.value)} placeholder="e.g. Britannia" className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm focus:border-amber-500 outline-none" required />
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Icon / Image</label>
             <div className="flex items-center gap-3">
               <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center overflow-hidden border border-slate-700">
                  {formIcon && (formIcon.startsWith('http') || formIcon.startsWith('data:')) ? <img src={formIcon} className="w-full h-full object-cover"/> : <span className="text-2xl">{formIcon || '🍪'}</span>}
               </div>
               <div className="flex-1 flex gap-2">
                 <button type="button" onClick={() => fileInputRef.current?.click()} className="flex-1 text-xs bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded border border-slate-700 text-white flex items-center justify-center gap-2"><Upload size={14}/> Upload Image</button>
                 {/* Removed Emoji Input here too */}
               </div>
               <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept="image/*" />
             </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2">Color Tag</label>
            <div className="flex flex-wrap gap-2">
              {BRAND_COLORS.map(c => (
                <button 
                  type="button" 
                  key={c.name} 
                  onClick={() => setFormColor(c.class)} 
                  className={clsx(
                    "w-8 h-8 rounded-full border-2 transition-transform", 
                    c.class, 
                    formColor === c.class ? "border-white scale-110 shadow-lg" : "border-transparent opacity-50 hover:opacity-100 hover:scale-105"
                  )} 
                />
              ))}
            </div>
          </div>
          <button type="submit" className="w-full py-3 bg-amber-600 hover:bg-amber-500 rounded-lg text-white font-bold text-sm shadow-lg shadow-amber-900/20 active:scale-[0.98]">
            {isCreatingBiscuit ? 'Create Biscuit' : 'Save Changes'}
          </button>
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

      <div className="flex-1 relative min-h-[400px]">
        {isLoading && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm rounded-xl">
               <Loader2 className="animate-spin text-amber-500" size={32}/>
            </div>
        )}
        
        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
             <div className="grid grid-cols-12 gap-4 p-4 border-b border-slate-800 bg-slate-950/50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <div className="col-span-4">User Details</div>
                <div className="col-span-2">Role</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-4 text-right">Actions</div>
             </div>
             <div className="divide-y divide-slate-800/50 max-h-[600px] overflow-y-auto">
               {users.map(u => (
                 <div key={u.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-slate-800/30 transition-colors">
                    <div className="col-span-4">
                       <div className="font-bold text-slate-200 text-sm flex items-center gap-2">
                           {u.name} 
                           {u.role === 'ADMIN' && <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 rounded">ADMIN</span>}
                       </div>
                       <div className="text-xs text-slate-500">{u.email}</div>
                    </div>
                    <div className="col-span-2 text-xs text-slate-400">
                       {u.role}
                    </div>
                    <div className="col-span-2">
                       {u.isFrozen ? (
                         <span className="flex items-center gap-1 text-xs text-red-400 font-bold bg-red-900/10 px-2 py-1 rounded w-fit"><Lock size={12}/> Frozen</span>
                       ) : (
                         <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold bg-emerald-900/10 px-2 py-1 rounded w-fit"><Check size={12}/> Active</span>
                       )}
                    </div>
                    <div className="col-span-4 flex justify-end gap-2">
                       <button onClick={() => handleToggleFreeze(u)} className={clsx("p-2 rounded hover:bg-slate-700 transition-colors border border-transparent", u.isFrozen ? "text-emerald-400 hover:border-emerald-500/30" : "text-amber-500 hover:border-amber-500/30")} title={u.isFrozen ? "Unfreeze" : "Freeze"}>
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
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center gap-3">
                   <div className="bg-amber-500/10 p-2 rounded-lg"><Cookie className="text-amber-500" size={20}/></div>
                   <div>
                      <h3 className="text-sm font-bold text-white">Item Catalogue</h3>
                      <p className="text-xs text-slate-500">Manage available biscuits in the system.</p>
                   </div>
                </div>
                <button 
                  onClick={openCreateBiscuit}
                  className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-lg shadow-amber-900/20 transition-all active:scale-95"
                >
                  <Plus size={16} /> Add Item
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                {biscuits.map(b => (
                <div key={b.id} className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col items-center gap-4 relative group hover:border-slate-600 transition-all overflow-hidden shadow-sm">
                    {/* Deletion Loading Overlay */}
                    {deletingId === b.id && (
                        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center text-center p-2 rounded-xl">
                        <Loader2 className="animate-spin text-red-500 mb-2" size={28} />
                        <span className="text-red-400 text-[10px] font-bold uppercase tracking-wider">Deleting...</span>
                        </div>
                    )}

                    {/* Manual Delete Link Indicator */}
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
                    <div className="text-center w-full">
                        <div className="font-bold text-slate-200 truncate">{b.name}</div>
                        <div className="text-xs text-slate-500 truncate">{b.brand}</div>
                    </div>
                    
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                        onClick={() => openEditBiscuit(b)}
                        disabled={!!deletingId}
                        className="p-1.5 bg-slate-800 rounded text-slate-500 hover:text-white hover:bg-slate-700 disabled:opacity-50 border border-slate-700 hover:border-slate-500"
                        title="Edit Details"
                        >
                        <Pen size={14} />
                        </button>
                        <button 
                        onClick={() => handleDeleteBiscuit(b)}
                        disabled={!!deletingId}
                        className="p-1.5 bg-slate-800 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 hover:border-red-900"
                        title="Delete Biscuit"
                        >
                        <Trash2 size={14} />
                        </button>
                    </div>
                </div>
                ))}
                {biscuits.length === 0 && (
                    <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-800 rounded-xl">
                        <Cookie className="mx-auto text-slate-700 mb-2" size={32}/>
                        <p className="text-slate-500 font-bold">Catalogue is empty.</p>
                        <p className="text-slate-600 text-xs mt-1">Add your first biscuit above.</p>
                    </div>
                )}
            </div>
          </div>
        )}

        {/* TRADES TAB */}
        {activeTab === 'trades' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
             <div className="p-4 border-b border-slate-800 bg-slate-950/50 text-xs font-bold text-slate-500 flex justify-between">
                <span>Total Trades: {allTrades.length}</span>
                <span className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Live Feed</span>
             </div>
             <div className="max-h-[600px] overflow-y-auto">
                {allTrades.map(trade => {
                  const offerB = getBiscuit(trade.offerBiscuitId);
                  const reqB = getBiscuit(trade.requestBiscuitId);
                  if(!offerB || !reqB) return null;
                  
                  return (
                    <div key={trade.id} className="p-4 border-b border-slate-800/50 flex flex-col md:flex-row items-center justify-between hover:bg-slate-800/20 gap-3">
                       <div className="flex items-center gap-4 flex-1">
                          <span className={clsx("text-[10px] w-20 text-center py-1 rounded border font-bold uppercase", 
                             trade.status === 'COMPLETED' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                             trade.status === 'OPEN' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                             trade.status === 'PENDING' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                             "bg-red-500/10 text-red-400 border-red-500/20"
                          )}>{trade.status}</span>
                          <div className="text-sm text-slate-400 flex flex-wrap items-center gap-2">
                             <span className="text-white font-bold">{trade.creatorName}</span> offered <span className="text-amber-500 font-mono">{trade.offerQty} {offerB.name}</span>
                             <ArrowRight size={14} className="text-slate-600"/>
                             <span className="text-emerald-500 font-mono">{trade.requestQty} {reqB.name}</span>
                             {trade.takerName && <span className="text-slate-500">to <span className="text-white font-bold">{trade.takerName}</span></span>}
                          </div>
                       </div>
                       <div className="text-[10px] text-slate-500 font-mono whitespace-nowrap">{new Date(trade.createdAt).toLocaleString()}</div>
                    </div>
                  )
                })}
                {allTrades.length === 0 && (
                    <div className="p-12 text-center text-slate-500">
                        No trade history available.
                    </div>
                )}
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
              
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {rules.length === 0 && (
                   <div className="col-span-full text-center py-10 text-slate-500 text-sm italic border-dashed border border-slate-800 rounded-xl">
                      No static rules defined.
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
                       {userInventory.length === 0 && <p className="text-slate-500">No inventory found or user has no items.</p>}
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
