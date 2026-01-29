export type Role = 'ADMIN' | 'USER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isFrozen: boolean;
}

export interface Biscuit {
  id: string;
  name: string;
  brand: string;
  icon: string; // Emoji or URL
  color: string; // Tailwind color class for accents
  imageDeleteHash?: string; // Storing the API delete_hash (Best Practice)
}

export interface InventoryItem {
  biscuitId: string;
  quantity: number;
}

// Legacy House Rules (Admin managed)
export interface ExchangeRule {
  id: string;
  fromBiscuitId: string;
  toBiscuitId: string;
  fromQty: number;
  toQty: number;
  isActive: boolean;
}

// P2P Trade Models
export type P2PTradeStatus = 'OPEN' | 'PENDING' | 'COMPLETED' | 'CANCELLED';
export type P2PTradeType = 'FIXED' | 'AUCTION';

export interface P2PTrade {
  id: string;
  creatorId: string;
  creatorName: string; // Snapshot for display
  takerId?: string;
  takerName?: string;
  
  offerBiscuitId: string;
  offerQty: number;
  
  // For Fixed: Exact request. For Auction: Preferred/Display only.
  requestBiscuitId: string;
  requestQty: number;
  
  status: P2PTradeStatus;
  tradeType: P2PTradeType; 
  isAny?: boolean; // New flag for "Surprise Me" trades
  
  creatorConfirmed: boolean;
  takerConfirmed: boolean;
  
  createdAt: number;
}

export interface TradeBid {
  id: string;
  tradeId: string;
  bidderId: string;
  bidderName: string;
  biscuitId: string;
  qty: number;
  createdAt: number;
}

export interface TradeLog {
  id: string;
  userId: string;
  fromBiscuitId: string;
  toBiscuitId: string;
  fromQty: number;
  toQty: number;
  timestamp: number;
}

export interface TradeResult {
  success: boolean;
  message: string;
  newInventory?: InventoryItem[];
}