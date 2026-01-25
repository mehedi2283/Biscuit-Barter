import { createClient } from '@supabase/supabase-js';
import { User, Biscuit, ExchangeRule, InventoryItem, TradeLog, TradeResult, P2PTrade } from '../types';

// CONFIG
const SUPABASE_URL = 'https://ggwhjljqmxvwjfelfgxz.supabase.co';
const SUPABASE_KEY = 'sb_publishable__Vn2SKMgbwTGwkKzPyXe0Q_XOsPMIAZ';
const IMGBB_API_KEY = '70181233b2a623792a5a6fe64367f005';
const FALLBACK_COOKIE_IMG = 'https://cdn-icons-png.flaticon.com/512/541/541732.png';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const BackendService = {
  
  // --- IMGBB IMAGE HOSTING ---
  // Returns object with url and deleteHash if successful
  uploadImage: async (base64Image: string): Promise<{ url: string, deleteHash?: string } | null> => {
    try {
      const formData = new FormData();
      const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
      formData.append("image", cleanBase64);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: "POST",
        body: formData,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const data = await res.json();
      if (data.success) {
        return {
          url: data.data.url,
          deleteHash: data.data.delete_hash // Storing the hash is best for API usage
        };
      }
      return null;
    } catch (e) {
      console.warn("Upload timed out or failed:", e);
      return null;
    }
  },

  // --- AUTH & USERS ---
  
  getUsers: async (): Promise<User[]> => {
    const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error); return []; }
    
    const users = data.map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isFrozen: u.is_frozen
    }));

    // Sort: Admins first, then others
    return users.sort((a: any, b: any) => {
        if (a.role === 'ADMIN' && b.role !== 'ADMIN') return -1;
        if (a.role !== 'ADMIN' && b.role === 'ADMIN') return 1;
        return 0;
    });
  },
  
  getUserById: async (id: string): Promise<User | undefined> => {
    const { data } = await supabase.from('users').select('*').eq('id', id).single();
    if (!data) return undefined;
    return {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role,
      isFrozen: data.is_frozen
    };
  },

  toggleUserFreeze: async (userId: string, currentStatus: boolean): Promise<boolean> => {
    const { error } = await supabase.from('users').update({ is_frozen: !currentStatus }).eq('id', userId);
    return !error;
  },

  deleteUser: async (userId: string): Promise<boolean> => {
    // Note: This deletes the profile. Auth user might remain until deleted via Supabase Admin Console
    const { error } = await supabase.from('users').delete().eq('id', userId);
    return !error;
  },

  authenticate: async (email: string, password: string): Promise<{user?: User, error?: string}> => {
    // 1. Sign In via Supabase Auth (GoTrue)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.warn("Auth failed:", error.message);
      return { error: error.message };
    }
    if (!data.user) return { error: "Auth provider error" };

    // 2. Fetch Profile from public.users
    let profile = await BackendService.getUserById(data.user.id);
    
    // Retry logic if profile creation trigger is slow
    if (!profile) {
       console.log("Profile not found immediately, retrying...");
       await new Promise(r => setTimeout(r, 1000));
       profile = await BackendService.getUserById(data.user.id);
       
       if (!profile) {
           await new Promise(r => setTimeout(r, 2000));
           profile = await BackendService.getUserById(data.user.id);
       }
    }

    if (!profile) {
      return { error: "Login successful, but User Profile is missing. Did you reset the database? Please sign up again." };
    }

    if (profile.isFrozen) {
      return { error: "Your account has been frozen by an Administrator." };
    }
    
    return { user: profile };
  },

  createUser: async (name: string, email: string, password: string): Promise<{user?: User, error?: string}> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          visual_hash: 'supa_enc_' + btoa(password).substring(0, 10) + '...'
        }
      }
    });

    if (error) return { error: error.message };
    if (!data.user) return { error: "Signup failed." };

    const newUser: User = {
        id: data.user.id,
        name,
        email,
        role: 'USER',
        isFrozen: false
    };

    return { user: newUser };
  },

  // --- INVENTORY ---

  getUserInventory: async (userId: string): Promise<InventoryItem[]> => {
    const biscuits = await BackendService.getBiscuits();
    const { data: inventory } = await supabase.from('inventory').select('*').eq('user_id', userId);
    
    return biscuits.map(b => {
      const entry = inventory?.find((i: any) => i.biscuit_id === b.id);
      return { biscuitId: b.id, quantity: entry ? entry.quantity : 0 };
    });
  },

  updateUserInventory: async (userId: string, biscuitId: string, quantity: number) => {
    // Use upsert with explicit constraint
    const { error } = await supabase.from('inventory').upsert({ 
      user_id: userId, 
      biscuit_id: biscuitId, 
      quantity: quantity 
    }, { onConflict: 'user_id, biscuit_id' });
    if (error) console.error("Inventory update failed", error);
  },

  adjustInventory: async (userId: string, biscuitId: string, delta: number): Promise<boolean> => {
    try {
      // 1. Fetch current state with ID
      const { data: current, error: fetchError } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('user_id', userId)
        .eq('biscuit_id', biscuitId)
        .single();

      // Ignore 'Row not found' error (PGRST116), handle others
      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error("Fetch inventory error:", fetchError);
        return false;
      }

      const currentQty = current ? current.quantity : 0;

      // 2. Validate deduction
      if (delta < 0 && currentQty < Math.abs(delta)) {
        console.warn(`AdjustInventory Failed: Not enough stock. Has ${currentQty}, Need ${Math.abs(delta)}`);
        return false;
      }

      const newQty = currentQty + delta;

      // 3. Execute Update or Insert explicitly to avoid upsert ambiguity
      if (current?.id) {
        // Row exists -> Update
        const { error: updateError } = await supabase
          .from('inventory')
          .update({ quantity: newQty })
          .eq('id', current.id);

        if (updateError) {
          console.error("Update inventory error:", updateError);
          return false;
        }
      } else {
        // Row missing -> Insert (Only if we are adding stock)
        // If delta < 0 and no row, we returned false above.
        const { error: insertError } = await supabase
          .from('inventory')
          .insert({
            user_id: userId,
            biscuit_id: biscuitId,
            quantity: newQty
          });

        if (insertError) {
          console.error("Insert inventory error:", insertError);
          return false;
        }
      }

      return true;
    } catch (e) {
      console.error("AdjustInventory Exception:", e);
      return false;
    }
  },

  // --- BISCUITS & RULES ---

  getBiscuits: async (): Promise<Biscuit[]> => {
    const { data } = await supabase.from('biscuits').select('*').order('created_at', { ascending: true });
    return (data || []).map((b: any) => ({
      id: b.id,
      name: b.name,
      brand: b.brand,
      icon: b.icon,
      color: b.color,
      imageDeleteHash: b.image_delete_hash // Back to mapping Hash
    }));
  },

  updateBiscuit: async (id: string, updates: Partial<Biscuit>) => {
    // Check if image needs upload
    let deleteHash = undefined;
    if (updates.icon && updates.icon.startsWith('data:')) {
      const result = await BackendService.uploadImage(updates.icon);
      if (result) {
        updates.icon = result.url;
        deleteHash = result.deleteHash;
      }
    }

    const dbUpdates: any = {
      name: updates.name,
      brand: updates.brand,
      color: updates.color,
      icon: updates.icon,
      image_delete_hash: deleteHash
    };

    // Remove undefined
    Object.keys(dbUpdates).forEach(key => dbUpdates[key] === undefined && delete dbUpdates[key]);

    await supabase.from('biscuits').update(dbUpdates).eq('id', id);
  },

  createBiscuit: async (userId: string, name: string, brand: string, icon: string, color: string): Promise<{ success: boolean, data?: Biscuit, error?: string }> => {
    try {
      let finalIcon = icon;
      let deleteHash: string | undefined = undefined;

      if (icon.startsWith('data:')) {
        const result = await BackendService.uploadImage(icon);
        if (result) {
           finalIcon = result.url;
           deleteHash = result.deleteHash;
        } else {
           finalIcon = FALLBACK_COOKIE_IMG;
        }
      }

      const { data, error } = await supabase.from('biscuits').insert({
        name, 
        brand, 
        icon: finalIcon, 
        color,
        image_delete_hash: deleteHash // Saving the Hash
      }).select().single();

      if (error) throw error;

      if (data) await BackendService.updateUserInventory(userId, data.id, 10);
      
      const newBiscuit: Biscuit = {
        id: data.id,
        name: data.name,
        brand: data.brand,
        icon: data.icon,
        color: data.color,
        imageDeleteHash: data.image_delete_hash
      };

      return { success: true, data: newBiscuit };

    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  deleteBiscuit: async (id: string): Promise<boolean> => {
    try {
      // NOTE: We have removed the browser-side image deletion logic.
      // Trying to delete from ImgBB via browser causes CORS errors (API) or 404s (Delete URL).
      // The correct approach is to use a Supabase Edge Function to handle the deletion securely.
      // For now, we only delete from our database to keep the app stable.
      
      // 1. Database cleanup (Rules, Trades, Inventory)
      await supabase.from('exchange_rules').delete().or(`from_biscuit_id.eq.${id},to_biscuit_id.eq.${id}`);
      await supabase.from('p2p_trades').delete().or(`offer_biscuit_id.eq.${id},request_biscuit_id.eq.${id}`);
      await supabase.from('inventory').delete().eq('biscuit_id', id);

      // 2. Delete Biscuit Row
      const { error } = await supabase.from('biscuits').delete().eq('id', id);
      
      if (error) {
        console.error("Delete Biscuit DB Error:", error);
        return false;
      }
      
      return true;
    } catch (e) {
      console.error("Delete Biscuit Exception:", e);
      return false;
    }
  },

  getRules: async (): Promise<ExchangeRule[]> => {
    const { data } = await supabase.from('exchange_rules').select('*');
    return (data || []).map((r: any) => ({
      id: r.id,
      fromBiscuitId: r.from_biscuit_id,
      toBiscuitId: r.to_biscuit_id,
      fromQty: r.from_qty,
      toQty: r.to_qty,
      isActive: r.is_active
    }));
  },

  saveRule: async (rule: ExchangeRule) => {
    // Logic: If ID is temporary (from Date.now(), no hyphens), we insert.
    // If ID is a UUID (has hyphens), we update.
    const isTempId = !rule.id.includes('-');

    const payload: any = {
      from_biscuit_id: rule.fromBiscuitId,
      to_biscuit_id: rule.toBiscuitId,
      from_qty: rule.fromQty,
      to_qty: rule.toQty,
      is_active: rule.isActive
    };
    
    // Only attach ID if it's a real UUID. 
    // If it's temp, we omit it so Supabase generates a new UUID.
    if (!isTempId) {
       payload.id = rule.id;
    }

    const { error } = await supabase.from('exchange_rules').upsert(payload);
    if (error) console.error("Error saving rule:", error);
  },

  deleteRule: async (ruleId: string) => {
    await supabase.from('exchange_rules').delete().eq('id', ruleId);
  },

  // --- P2P TRADING ---

  getP2PTrades: async (): Promise<P2PTrade[]> => {
    const { data } = await supabase.from('p2p_trades').select('*').order('created_at', { ascending: false });
    return (data || []).map((t: any) => ({
      id: t.id,
      creatorId: t.creator_id,
      creatorName: t.creator_name,
      takerId: t.taker_id,
      takerName: t.taker_name,
      offerBiscuitId: t.offer_biscuit_id,
      offerQty: t.offer_qty,
      requestBiscuitId: t.request_biscuit_id,
      requestQty: t.request_qty,
      status: t.status,
      creatorConfirmed: t.creator_confirmed,
      takerConfirmed: t.taker_confirmed,
      createdAt: new Date(t.created_at).getTime()
    }));
  },

  getAllTrades: async (): Promise<P2PTrade[]> => {
    // Admin function to see everything
    return BackendService.getP2PTrades();
  },

  getTradeHistory: async (userId: string): Promise<P2PTrade[]> => {
    const { data } = await supabase
      .from('p2p_trades')
      .select('*')
      .or(`creator_id.eq.${userId},taker_id.eq.${userId}`)
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false });
      
    return (data || []).map((t: any) => ({
      id: t.id,
      creatorId: t.creator_id,
      creatorName: t.creator_name,
      takerId: t.taker_id,
      takerName: t.taker_name,
      offerBiscuitId: t.offer_biscuit_id,
      offerQty: t.offer_qty,
      requestBiscuitId: t.request_biscuit_id,
      requestQty: t.request_qty,
      status: t.status,
      creatorConfirmed: t.creator_confirmed,
      takerConfirmed: t.taker_confirmed,
      createdAt: new Date(t.created_at).getTime()
    }));
  },

  createP2PTrade: async (userId: string, offerBiscuitId: string, offerQty: number, reqBiscuitId: string, reqQty: number): Promise<TradeResult> => {
    const user = await BackendService.getUserById(userId);
    if (!user) return { success: false, message: 'User not found' };

    const success = await BackendService.adjustInventory(userId, offerBiscuitId, -offerQty);
    if (!success) return { success: false, message: 'Insufficient biscuits to post this trade.' };

    const { error } = await supabase.from('p2p_trades').insert({
      creator_id: userId,
      creator_name: user.name,
      offer_biscuit_id: offerBiscuitId,
      offer_qty: offerQty,
      request_biscuit_id: reqBiscuitId,
      request_qty: reqQty,
      status: 'OPEN',
      creator_confirmed: false,
      taker_confirmed: false
    });

    if (error) {
      // Refund if trade creation fails
      await BackendService.adjustInventory(userId, offerBiscuitId, offerQty);
      return { success: false, message: 'Database error while creating trade.' };
    }
    return { success: true, message: 'Trade Posted!' };
  },

  acceptP2PTrade: async (tradeId: string, takerId: string): Promise<TradeResult> => {
    // 1. Fetch Fresh Trade Data
    const { data: trade, error: tradeError } = await supabase.from('p2p_trades').select('*').eq('id', tradeId).single();
    if (tradeError || !trade) return { success: false, message: 'Trade not found or deleted.' };
    
    if (trade.status !== 'OPEN') return { success: false, message: 'Trade is no longer available.' };
    if (trade.creator_id === takerId) return { success: false, message: 'You cannot trade with yourself.' };

    // 2. Fetch Taker Info
    const taker = await BackendService.getUserById(takerId);
    if (!taker) return { success: false, message: 'User authentication error.' };

    // 3. Deduct Items from Taker
    const deductSuccess = await BackendService.adjustInventory(takerId, trade.request_biscuit_id, -trade.request_qty);
    if (!deductSuccess) {
      return { success: false, message: `Insufficient inventory. You need ${trade.request_qty} packets.` };
    }

    // 4. Update Trade Status
    const { error } = await supabase.from('p2p_trades').update({
      status: 'PENDING',
      taker_id: takerId,
      taker_name: taker.name
    }).eq('id', tradeId);

    // 5. Rollback if update fails
    if (error) {
       console.error("Accept Trade Update Error:", error);
       await BackendService.adjustInventory(takerId, trade.request_biscuit_id, trade.request_qty);
       return { success: false, message: 'System error. Inventory refunded.' };
    }
    
    return { success: true, message: 'Trade Accepted! Waiting for final confirmation.' };
  },

  confirmP2PTrade: async (tradeId: string, userId: string): Promise<TradeResult> => {
    const { data: trade } = await supabase.from('p2p_trades').select('*').eq('id', tradeId).single();
    if (!trade) return { success: false, message: 'Trade not found' };

    const updates: any = {};
    if (userId === trade.creator_id) updates.creator_confirmed = true;
    else if (userId === trade.taker_id) updates.taker_confirmed = true;
    else return { success: false, message: 'Not authorized to confirm this trade.' };

    const isNowComplete = (trade.creator_confirmed || updates.creator_confirmed) && (trade.taker_confirmed || updates.taker_confirmed);
    if (isNowComplete) updates.status = 'COMPLETED';

    const { error } = await supabase.from('p2p_trades').update(updates).eq('id', tradeId);
    
    if (!error && isNowComplete) {
        // Execute the Swap
        // 1. Creator gets what they requested (from Taker's deducted stash)
        await BackendService.adjustInventory(trade.creator_id, trade.request_biscuit_id, trade.request_qty);
        // 2. Taker gets what was offered (from Creator's deducted stash)
        await BackendService.adjustInventory(trade.taker_id, trade.offer_biscuit_id, trade.offer_qty);
        
        return { success: true, message: 'Deal Done! Biscuits transferred successfully.' };
    }
    return { success: true, message: 'Confirmed. Waiting for partner to confirm.' };
  },

  cancelP2PTrade: async (tradeId: string, userId: string): Promise<TradeResult> => {
    const { data: trade } = await supabase.from('p2p_trades').select('*').eq('id', tradeId).single();
    if (!trade) return { success: false, message: 'Trade not found' };
    if (trade.creator_id !== userId) return { success: false, message: 'Not authorized' };
    if (trade.status !== 'OPEN') return { success: false, message: 'Cannot cancel active trade' };

    // Refund Creator
    await BackendService.adjustInventory(userId, trade.offer_biscuit_id, trade.offer_qty);
    
    await supabase.from('p2p_trades').update({ status: 'CANCELLED' }).eq('id', tradeId);
    return { success: true, message: 'Trade cancelled, items refunded.' };
  },

  resetDatabase: async () => {
     alert("Please use Supabase Dashboard SQL Editor to reset data.");
  }
};