import { createClient } from '@supabase/supabase-js';
import { User, Biscuit, ExchangeRule, InventoryItem, TradeLog, TradeResult, P2PTrade, P2PTradeType, TradeBid, TradeItem } from '../types';

// CONFIG
const SUPABASE_URL = 'https://ggwhjljqmxvwjfelfgxz.supabase.co';
const SUPABASE_KEY = 'sb_publishable__Vn2SKMgbwTGwkKzPyXe0Q_XOsPMIAZ';
const FALLBACK_COOKIE_IMG = 'https://cdn-icons-png.flaticon.com/512/541/541732.png';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const BackendService = {
  
  // --- IMGBB IMAGE HANDLING (VIA EDGE FUNCTION) ---
  
  uploadImage: async (base64Image: string): Promise<{ url: string, deleteHash?: string } | null> => {
    try {
      // Strip Data URI prefix (data:image/png;base64,) to send raw base64 to ImgBB
      const cleanBase64 = base64Image.replace(/^data:image\/[a-z]+;base64,/, "");

      const { data, error } = await supabase.functions.invoke('biscuit-barter', {
        body: {
          action: 'upload-image',
          image: cleanBase64
        }
      });

      if (error) {
        console.error("Edge Function Upload Error:", error);
        return null;
      }

      // --- CRITICAL: LOG FULL RESPONSE FOR USER DEBUGGING ---
      if (data && data.raw) {
        console.group("ImgBB Upload Debug Info");
        console.log("Full Raw API Response:", data.raw);
        console.log("Delete URL (Manual):", data.raw.data?.delete_url);
        console.groupEnd();
      }

      if (data && data.success) {
        return {
          url: data.url,
          deleteHash: data.deleteHash
        };
      }
      
      return null;
    } catch (e) {
      console.warn("Upload exception:", e);
      return null;
    }
  },

  deleteImageFromHost: async (deleteHash: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('biscuit-barter', {
        body: {
          action: 'delete-image',
          deleteHash: deleteHash
        }
      });

      if (error) {
         console.warn("Edge Function Delete Error:", error);
         return false;
      }
      return data?.success || false;
    } catch (e) {
      console.warn("Delete exception:", e);
      return false;
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
    const { data, error } = await supabase.from('users').select('*').eq('id', id).single();
    
    if (error && error.code !== 'PGRST116') {
       // Log genuine errors (not just 'Row not found')
       console.error("getUserById DB Error:", error);
    }

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
    try {
      // 1. Sign In via Supabase Auth (GoTrue)
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        console.warn("Auth failed:", error.message);
        return { error: error.message };
      }
      
      if (!data.user) {
        return { error: "Authentication failed. No user returned." };
      }

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
        // Force logout if frozen
        await supabase.auth.signOut();
        return { error: "Your account has been frozen by an Administrator." };
      }
      
      return { user: profile };
    } catch (e: any) {
      console.error("Login Exception:", e);
      return { error: e.message || "Unexpected login error." };
    }
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
      imageDeleteHash: b.image_delete_hash // Now stores Storage Path (filename)
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

      // Explicitly saving deleteHash to 'image_delete_hash' column
      const { data, error } = await supabase.from('biscuits').insert({
        name, 
        brand, 
        icon: finalIcon, 
        color,
        image_delete_hash: deleteHash
      }).select().single();

      if (error) throw error;

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
      // 1. Get biscuit to find image hash
      const { data: biscuit } = await supabase.from('biscuits').select('image_delete_hash').eq('id', id).single();
      
      // 2. Delete image via Supabase Storage
      if (biscuit?.image_delete_hash) {
        await BackendService.deleteImageFromHost(biscuit.image_delete_hash);
      }
      
      // 3. Database cleanup (Rules, Trades, Inventory)
      await supabase.from('exchange_rules').delete().or(`from_biscuit_id.eq.${id},to_biscuit_id.eq.${id}`);
      await supabase.from('p2p_trades').delete().or(`offer_biscuit_id.eq.${id},request_biscuit_id.eq.${id}`);
      await supabase.from('inventory').delete().eq('biscuit_id', id);

      // 4. Delete Biscuit Row
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
    const isTempId = !rule.id.includes('-');

    const payload: any = {
      from_biscuit_id: rule.fromBiscuitId,
      to_biscuit_id: rule.toBiscuitId,
      from_qty: rule.fromQty,
      to_qty: rule.toQty,
      is_active: rule.isActive
    };
    
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
      offerDetails: t.offer_details, // Map new Bundle column
      requestBiscuitId: t.request_biscuit_id,
      requestQty: t.request_qty,
      status: t.status,
      tradeType: t.trade_type || 'FIXED', 
      isAny: t.is_any, // Map DB column to Type
      creatorConfirmed: t.creator_confirmed,
      takerConfirmed: t.taker_confirmed,
      createdAt: new Date(t.created_at).getTime()
    }));
  },

  getAllTrades: async (): Promise<P2PTrade[]> => {
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
      offerDetails: t.offer_details,
      requestBiscuitId: t.request_biscuit_id,
      requestQty: t.request_qty,
      status: t.status,
      tradeType: t.trade_type || 'FIXED',
      isAny: t.is_any,
      creatorConfirmed: t.creator_confirmed,
      takerConfirmed: t.taker_confirmed,
      createdAt: new Date(t.created_at).getTime()
    }));
  },

  createP2PTrade: async (userId: string, offerBiscuitId: string, offerQty: number, reqBiscuitId: string, reqQty: number, tradeType: P2PTradeType = 'FIXED', isAny: boolean = false, offerBundle?: TradeItem[]): Promise<TradeResult> => {
    const user = await BackendService.getUserById(userId);
    if (!user) return { success: false, message: 'User not found' };

    // 1. Inventory Deduction Check & Execution
    if (offerBundle && offerBundle.length > 0) {
      // BUNDLE LOGIC
      for (const item of offerBundle) {
        const success = await BackendService.adjustInventory(userId, item.biscuitId, -item.qty);
        if (!success) {
           // Rollback previous deductions if one fails
           for (const rbItem of offerBundle) {
             if (rbItem.biscuitId === item.biscuitId) break; // Don't rollback current failed one
             await BackendService.adjustInventory(userId, rbItem.biscuitId, rbItem.qty);
           }
           return { success: false, message: `Insufficient inventory for ${item.biscuitId}` };
        }
      }
    } else {
      // SINGLE ITEM LOGIC
      const success = await BackendService.adjustInventory(userId, offerBiscuitId, -offerQty);
      if (!success) return { success: false, message: 'Insufficient biscuits to post this trade.' };
    }

    const payload: any = {
      creator_id: userId,
      creator_name: user.name,
      offer_biscuit_id: offerBiscuitId,
      offer_qty: offerQty,
      request_biscuit_id: reqBiscuitId,
      request_qty: reqQty,
      status: 'OPEN',
      trade_type: tradeType,
      creator_confirmed: false,
      taker_confirmed: false
    };

    if (offerBundle && offerBundle.length > 0) {
      payload.offer_details = offerBundle;
    }

    // Only add is_any if true to avoid schema cache errors on older DBs for standard trades
    if (isAny) {
      payload.is_any = true;
    }

    const { error } = await supabase.from('p2p_trades').insert(payload);

    if (error) {
      console.error("CREATE TRADE DB ERROR:", error);
      
      // Attempt Refund
      if (offerBundle && offerBundle.length > 0) {
         for (const item of offerBundle) {
           await BackendService.adjustInventory(userId, item.biscuitId, item.qty);
         }
      } else {
         await BackendService.adjustInventory(userId, offerBiscuitId, offerQty);
      }
      
      // PGRST204 is 'Could not find the column'
      // 42703 is 'undefined_column'
      if (error.code === '42703' || error.code === 'PGRST204' || error.message?.includes('is_any') || error.message?.includes('offer_details')) {
         return { success: false, message: 'System Sync Error: Please refresh the Database Schema Cache in Supabase settings.' };
      }
      return { success: false, message: `Database error: ${error.message}` };
    }
    return { success: true, message: tradeType === 'AUCTION' ? 'Auction Started!' : 'Trade Posted!' };
  },

  // --- BIDDING SYSTEM ---

  placeBid: async (tradeId: string, bidderId: string, biscuitId: string, qty: number): Promise<TradeResult> => {
    const user = await BackendService.getUserById(bidderId);
    if (!user) return { success: false, message: 'User not found' };

    // 1. Deduct Inventory (Commitment)
    const success = await BackendService.adjustInventory(bidderId, biscuitId, -qty);
    if (!success) return { success: false, message: 'Insufficient biscuits to place this bid.' };

    // 2. Insert Bid
    const { error } = await supabase.from('trade_bids').insert({
      trade_id: tradeId,
      bidder_id: bidderId,
      bidder_name: user.name,
      biscuit_id: biscuitId,
      qty: qty
    });

    if (error) {
      // Refund on failure
      await BackendService.adjustInventory(bidderId, biscuitId, qty);
      return { success: false, message: 'Failed to place bid.' };
    }

    return { success: true, message: 'Bid Placed!' };
  },

  getBidsForTrade: async (tradeId: string): Promise<TradeBid[]> => {
    const { data } = await supabase.from('trade_bids').select('*').eq('trade_id', tradeId).order('created_at', { ascending: false });
    return (data || []).map((b: any) => ({
      id: b.id,
      tradeId: b.trade_id,
      bidderId: b.bidder_id,
      bidderName: b.bidder_name,
      biscuitId: b.biscuit_id,
      qty: b.qty,
      createdAt: new Date(b.created_at).getTime()
    }));
  },

  acceptBid: async (tradeId: string, bidId: string, creatorId: string): Promise<TradeResult> => {
    // 1. Fetch Bid and Trade details
    const { data: bid } = await supabase.from('trade_bids').select('*').eq('id', bidId).single();
    const { data: trade } = await supabase.from('p2p_trades').select('*').eq('id', tradeId).single();

    if (!bid || !trade) return { success: false, message: 'Bid or Trade not found.' };
    if (trade.creator_id !== creatorId) return { success: false, message: 'Not authorized.' };

    // 2. Convert Trade to Pending
    const { error: updateError } = await supabase.from('p2p_trades').update({
      status: 'PENDING',
      taker_id: bid.bidder_id,
      taker_name: bid.bidder_name,
      request_biscuit_id: bid.biscuit_id, // Lock in the bid item as the final request
      request_qty: bid.qty,
      is_any: false // No longer "Any" once accepted
    }).eq('id', tradeId);

    if (updateError) return { success: false, message: 'Failed to update trade status.' };

    // 3. Refund all OTHER bidders
    const { data: allBids } = await supabase.from('trade_bids').select('*').eq('trade_id', tradeId);
    if (allBids) {
      for (const b of allBids) {
        if (b.id !== bidId) {
          // Refund
          await BackendService.adjustInventory(b.bidder_id, b.biscuit_id, b.qty);
        }
      }
    }

    // 4. Cleanup bids for this trade
    await supabase.from('trade_bids').delete().eq('trade_id', tradeId);

    return { success: true, message: 'Bid Accepted! Trade is now Pending confirmation.' };
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
        // If Bundle:
        if (trade.offer_details && Array.isArray(trade.offer_details)) {
           for (const item of trade.offer_details) {
              await BackendService.adjustInventory(trade.taker_id, item.biscuitId, item.qty);
           }
        } else {
           // Standard
           await BackendService.adjustInventory(trade.taker_id, trade.offer_biscuit_id, trade.offer_qty);
        }
        
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
    if (trade.offer_details && Array.isArray(trade.offer_details)) {
      for (const item of trade.offer_details) {
         await BackendService.adjustInventory(userId, item.biscuitId, item.qty);
      }
    } else {
      await BackendService.adjustInventory(userId, trade.offer_biscuit_id, trade.offer_qty);
    }
    
    // Also Refund any active bids
    const { data: bids } = await supabase.from('trade_bids').select('*').eq('trade_id', tradeId);
    if (bids) {
      for (const b of bids) {
        await BackendService.adjustInventory(b.bidder_id, b.biscuit_id, b.qty);
      }
    }
    // Delete bids
    await supabase.from('trade_bids').delete().eq('trade_id', tradeId);
    
    await supabase.from('p2p_trades').update({ status: 'CANCELLED' }).eq('id', tradeId);
    return { success: true, message: 'Trade cancelled, items refunded.' };
  },

  resetDatabase: async () => {
     alert("Please use Supabase Dashboard SQL Editor to reset data.");
  }
};