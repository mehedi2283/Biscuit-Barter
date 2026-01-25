-- !!! CRITICAL: RUN THIS IN SUPABASE SQL EDITOR !!!

-- 1. CLEANUP (Drop existing objects)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS p2p_trades CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS exchange_rules CASCADE;
DROP TABLE IF EXISTS biscuits CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. CREATE TABLES

-- Public Users Profile (Synced with Auth)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'USER',
  password_hash TEXT, -- Visual reference only
  is_frozen BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Biscuits
CREATE TABLE public.biscuits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory
CREATE TABLE public.inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  biscuit_id UUID REFERENCES public.biscuits(id) ON DELETE CASCADE NOT NULL,
  quantity INT DEFAULT 0,
  UNIQUE(user_id, biscuit_id)
);

-- Trades
CREATE TABLE public.p2p_trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  creator_name TEXT,
  taker_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  taker_name TEXT,
  offer_biscuit_id UUID REFERENCES public.biscuits(id) NOT NULL,
  offer_qty INT NOT NULL,
  request_biscuit_id UUID REFERENCES public.biscuits(id) NOT NULL,
  request_qty INT NOT NULL,
  status TEXT DEFAULT 'OPEN',
  creator_confirmed BOOLEAN DEFAULT false,
  taker_confirmed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Legacy Rules
CREATE TABLE public.exchange_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_biscuit_id UUID REFERENCES public.biscuits(id),
  to_biscuit_id UUID REFERENCES public.biscuits(id),
  from_qty INT DEFAULT 1,
  to_qty INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true
);

-- 3. AUTOMATION (The Fix for Login Issues)

-- Function to handle new user creation automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role, password_hash)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', 'Trader'),
    new.email,
    'USER',
    COALESCE(new.raw_user_meta_data->>'visual_hash', 'encrypted')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run the function
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. SEED DATA
INSERT INTO biscuits (name, brand, icon, color) VALUES
('Oreo', 'Cadbury', '⚫️', 'bg-slate-700'),
('Marie Gold', 'Britannia', '🟡', 'bg-yellow-600'),
('Good Day', 'Britannia', '🍪', 'bg-orange-500'),
('Bourbon', 'Britannia', '🟫', 'bg-amber-900'),
('Dark Fantasy', 'Sunfeast', '🍫', 'bg-red-900'),
('Digestive', 'McVities', '🌾', 'bg-amber-200');

-- 5. SECURITY POLICIES (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biscuits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p2p_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rules ENABLE ROW LEVEL SECURITY;

-- Permissive policies for this internal app
CREATE POLICY "Enable all access for users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for biscuits" ON public.biscuits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for inventory" ON public.inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for trades" ON public.p2p_trades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for rules" ON public.exchange_rules FOR ALL USING (true) WITH CHECK (true);
