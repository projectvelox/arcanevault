import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: 'aws-0-ap-south-1.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.bqhsiotwmyaufiopqtbi',
  password: '!_Zs5fjG%bpL-b*',
  ssl: false,
  ssl: { rejectUnauthorized: false }
});

const SQL = `
-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settings JSONB DEFAULT '{}'::jsonb
);

-- Binders (collection containers)
CREATE TABLE IF NOT EXISTS public.binders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Collection',
  binder_type TEXT DEFAULT 'collection',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Collection cards (cards in binders)
CREATE TABLE IF NOT EXISTS public.collection_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  binder_id UUID REFERENCES public.binders(id) ON DELETE CASCADE NOT NULL,
  scryfall_id TEXT NOT NULL,
  name TEXT NOT NULL,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  mana_cost TEXT,
  cmc REAL DEFAULT 0,
  type_line TEXT,
  oracle_text TEXT,
  rarity TEXT,
  color_identity TEXT[] DEFAULT '{}',
  prices JSONB DEFAULT '{}',
  image_uris JSONB DEFAULT '{}',
  card_faces JSONB,
  legalities JSONB DEFAULT '{}',
  power TEXT,
  toughness TEXT,
  flavor_text TEXT,
  rulings_uri TEXT,
  qty INTEGER DEFAULT 1,
  condition TEXT DEFAULT 'NM',
  foil BOOLEAN DEFAULT FALSE,
  language TEXT DEFAULT 'en',
  added_at TIMESTAMPTZ DEFAULT NOW()
);

-- Decks
CREATE TABLE IF NOT EXISTS public.decks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'commander',
  notes TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deck cards
CREATE TABLE IF NOT EXISTS public.deck_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deck_id UUID REFERENCES public.decks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  scryfall_id TEXT NOT NULL,
  name TEXT NOT NULL,
  set_code TEXT,
  set_name TEXT,
  collector_number TEXT,
  mana_cost TEXT,
  cmc REAL DEFAULT 0,
  type_line TEXT,
  oracle_text TEXT,
  rarity TEXT,
  color_identity TEXT[] DEFAULT '{}',
  prices JSONB DEFAULT '{}',
  image_uris JSONB DEFAULT '{}',
  card_faces JSONB,
  legalities JSONB DEFAULT '{}',
  power TEXT,
  toughness TEXT,
  flavor_text TEXT,
  rulings_uri TEXT,
  qty INTEGER DEFAULT 1,
  board TEXT DEFAULT 'main'
);

-- Trade history
CREATE TABLE IF NOT EXISTS public.trade_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date TEXT NOT NULL,
  give JSONB DEFAULT '[]',
  recv JSONB DEFAULT '[]',
  give_total REAL DEFAULT 0,
  recv_total REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_collection_cards_user ON public.collection_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_collection_cards_binder ON public.collection_cards(binder_id);
CREATE INDEX IF NOT EXISTS idx_collection_cards_name ON public.collection_cards(name);
CREATE INDEX IF NOT EXISTS idx_deck_cards_deck ON public.deck_cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_decks_user ON public.decks(user_id);
CREATE INDEX IF NOT EXISTS idx_binders_user ON public.binders(user_id);

-- Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.binders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DO $$ BEGIN
  -- Profiles
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_select') THEN
    CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_insert') THEN
    CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_update') THEN
    CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (auth.uid() = id);
  END IF;

  -- Binders
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='binders' AND policyname='binders_select') THEN
    CREATE POLICY binders_select ON public.binders FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='binders' AND policyname='binders_insert') THEN
    CREATE POLICY binders_insert ON public.binders FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='binders' AND policyname='binders_update') THEN
    CREATE POLICY binders_update ON public.binders FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='binders' AND policyname='binders_delete') THEN
    CREATE POLICY binders_delete ON public.binders FOR DELETE USING (auth.uid() = user_id);
  END IF;

  -- Collection cards
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='collection_cards' AND policyname='cc_select') THEN
    CREATE POLICY cc_select ON public.collection_cards FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='collection_cards' AND policyname='cc_insert') THEN
    CREATE POLICY cc_insert ON public.collection_cards FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='collection_cards' AND policyname='cc_update') THEN
    CREATE POLICY cc_update ON public.collection_cards FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='collection_cards' AND policyname='cc_delete') THEN
    CREATE POLICY cc_delete ON public.collection_cards FOR DELETE USING (auth.uid() = user_id);
  END IF;

  -- Decks
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='decks' AND policyname='decks_select') THEN
    CREATE POLICY decks_select ON public.decks FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='decks' AND policyname='decks_insert') THEN
    CREATE POLICY decks_insert ON public.decks FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='decks' AND policyname='decks_update') THEN
    CREATE POLICY decks_update ON public.decks FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='decks' AND policyname='decks_delete') THEN
    CREATE POLICY decks_delete ON public.decks FOR DELETE USING (auth.uid() = user_id);
  END IF;

  -- Deck cards
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='deck_cards' AND policyname='dc_select') THEN
    CREATE POLICY dc_select ON public.deck_cards FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='deck_cards' AND policyname='dc_insert') THEN
    CREATE POLICY dc_insert ON public.deck_cards FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='deck_cards' AND policyname='dc_update') THEN
    CREATE POLICY dc_update ON public.deck_cards FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='deck_cards' AND policyname='dc_delete') THEN
    CREATE POLICY dc_delete ON public.deck_cards FOR DELETE USING (auth.uid() = user_id);
  END IF;

  -- Trade history
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trade_history' AND policyname='th_select') THEN
    CREATE POLICY th_select ON public.trade_history FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trade_history' AND policyname='th_insert') THEN
    CREATE POLICY th_insert ON public.trade_history FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trade_history' AND policyname='th_delete') THEN
    CREATE POLICY th_delete ON public.trade_history FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Auto-create profile and default binders on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.binders (user_id, name, binder_type) VALUES (NEW.id, 'Collection', 'collection');
  INSERT INTO public.binders (user_id, name, binder_type) VALUES (NEW.id, 'Wishlist', 'wishlist');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
`;

async function run() {
  try {
    await client.connect();
    console.log('Connected to Supabase Postgres');
    console.log('Running migration...');
    await client.query(SQL);
    console.log('Migration complete!');

    // Verify tables
    const res = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
    console.log('\\nTables created:');
    res.rows.forEach(r => console.log('  -', r.tablename));

    // Verify policies
    const pol = await client.query("SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename");
    console.log(`\\nRLS policies: ${pol.rows.length} total`);

    await client.end();
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

run();
