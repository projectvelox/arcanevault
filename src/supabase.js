import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Graceful fallback when env vars are missing (e.g., before Vercel env setup)
const isConfigured = !!(supabaseUrl && supabaseAnonKey);
export const supabase = isConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

// Null-safe wrapper: returns {data:null,error:{message}} when not configured
const guard = (fn) => async (...args) => {
  if (!supabase) return { data: null, error: { message: 'Supabase not configured' } };
  try { return await fn(...args); } catch (e) { return { data: null, error: { message: e.message || 'Unknown error' } }; }
};

// Auth helpers
export const signUp = guard(async (email, password, displayName) => {
  const { data, error } = await supabase.auth.signUp({
    email, password, options: { data: { display_name: displayName }, emailRedirectTo: window.location.origin }
  });
  if (error) throw error;
  return { data, error: null };
});

export const signIn = guard(async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { data, error: null };
});

export const signOut = guard(async () => {
  return await supabase.auth.signOut();
});

export async function getSession() {
  if (!supabase) return null;
  try { const { data: { session } } = await supabase.auth.getSession(); return session; } catch { return null; }
}

export async function getUser() {
  if (!supabase) return null;
  try { const { data: { user } } = await supabase.auth.getUser(); return user; } catch { return null; }
}

// Binders CRUD
export const bindersApi = {
  async list() {
    const { data, error } = await supabase.from('binders').select('*').order('created_at');
    return { data, error };
  },
  async create(name, binderType = 'collection') {
    const user = await getUser();
    if (!user) return { error: { message: 'Not authenticated' } };
    const { data, error } = await supabase.from('binders').insert({ user_id: user.id, name, binder_type: binderType }).select().single();
    return { data, error };
  },
  async delete(id) {
    const { error } = await supabase.from('binders').delete().eq('id', id);
    return { error };
  },
  async update(id, updates) {
    const { data, error } = await supabase.from('binders').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    return { data, error };
  }
};

// Collection Cards CRUD
export const cardsApi = {
  async list(binderId) {
    const { data, error } = await supabase.from('collection_cards').select('*').eq('binder_id', binderId).order('added_at', { ascending: false });
    return { data, error };
  },
  async add(binderId, card, meta = {}) {
    const user = await getUser();
    if (!user) return { error: { message: 'Not authenticated' } };
    const { data, error } = await supabase.from('collection_cards').insert({
      user_id: user.id,
      binder_id: binderId,
      scryfall_id: card.id,
      name: card.name,
      set_code: card.set,
      set_name: card.set_name,
      collector_number: card.collector_number,
      mana_cost: card.mana_cost,
      cmc: card.cmc || 0,
      type_line: card.type_line,
      oracle_text: card.oracle_text,
      rarity: card.rarity,
      color_identity: card.color_identity || [],
      prices: card.prices || {},
      image_uris: card.image_uris || {},
      card_faces: card.card_faces,
      legalities: card.legalities || {},
      power: card.power,
      toughness: card.toughness,
      flavor_text: card.flavor_text,
      rulings_uri: card.rulings_uri,
      qty: meta.qty || 1,
      condition: meta.condition || 'NM',
      foil: meta.foil || false,
      language: meta.language || 'en',
    }).select().single();
    return { data, error };
  },
  async update(id, updates) {
    const { data, error } = await supabase.from('collection_cards').update(updates).eq('id', id).select().single();
    return { data, error };
  },
  async delete(id) {
    const { error } = await supabase.from('collection_cards').delete().eq('id', id);
    return { error };
  },
  async bulkDelete(ids) {
    const { error } = await supabase.from('collection_cards').delete().in('id', ids);
    return { error };
  },
  async bulkMove(ids, newBinderId) {
    const { error } = await supabase.from('collection_cards').update({ binder_id: newBinderId }).in('id', ids);
    return { error };
  }
};

// Decks CRUD
export const decksApi = {
  async list() {
    const { data, error } = await supabase.from('decks').select('*').order('updated_at', { ascending: false });
    return { data, error };
  },
  async create(name, format, tags = []) {
    const user = await getUser();
    if (!user) return { error: { message: 'Not authenticated' } };
    const { data, error } = await supabase.from('decks').insert({ user_id: user.id, name, format, tags }).select().single();
    return { data, error };
  },
  async update(id, updates) {
    const { data, error } = await supabase.from('decks').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    return { data, error };
  },
  async delete(id) {
    const { error } = await supabase.from('decks').delete().eq('id', id);
    return { error };
  },
  async clone(id) {
    const { data: deck } = await supabase.from('decks').select('*').eq('id', id).single();
    if (!deck) return { error: { message: 'Deck not found' } };
    const user = await getUser();
    const { data: newDeck, error } = await supabase.from('decks').insert({
      user_id: user.id, name: deck.name + ' (copy)', format: deck.format, notes: deck.notes, tags: deck.tags
    }).select().single();
    if (error) return { error };
    // Copy cards
    const { data: cards } = await supabase.from('deck_cards').select('*').eq('deck_id', id);
    if (cards && cards.length) {
      const newCards = cards.map(c => ({ ...c, id: undefined, deck_id: newDeck.id, user_id: user.id }));
      await supabase.from('deck_cards').insert(newCards);
    }
    return { data: newDeck };
  }
};

// Deck Cards CRUD
export const deckCardsApi = {
  async list(deckId) {
    const { data, error } = await supabase.from('deck_cards').select('*').eq('deck_id', deckId);
    return { data, error };
  },
  async add(deckId, card, board = 'main') {
    const user = await getUser();
    if (!user) return { error: { message: 'Not authenticated' } };
    // Check if card already exists in this board
    const { data: existing } = await supabase.from('deck_cards').select('*').eq('deck_id', deckId).eq('scryfall_id', card.id).eq('board', board).single();
    if (existing) {
      return await supabase.from('deck_cards').update({ qty: existing.qty + 1 }).eq('id', existing.id).select().single();
    }
    const { data, error } = await supabase.from('deck_cards').insert({
      deck_id: deckId,
      user_id: user.id,
      scryfall_id: card.id,
      name: card.name,
      set_code: card.set,
      set_name: card.set_name,
      collector_number: card.collector_number,
      mana_cost: card.mana_cost,
      cmc: card.cmc || 0,
      type_line: card.type_line,
      oracle_text: card.oracle_text,
      rarity: card.rarity,
      color_identity: card.color_identity || [],
      prices: card.prices || {},
      image_uris: card.image_uris || {},
      card_faces: card.card_faces,
      legalities: card.legalities || {},
      power: card.power,
      toughness: card.toughness,
      flavor_text: card.flavor_text,
      rulings_uri: card.rulings_uri,
      qty: 1,
      board,
    }).select().single();
    return { data, error };
  },
  async remove(deckId, scryfallId, board) {
    const { data: existing } = await supabase.from('deck_cards').select('*').eq('deck_id', deckId).eq('scryfall_id', scryfallId).eq('board', board).single();
    if (!existing) return { error: { message: 'Card not found' } };
    if (existing.qty > 1) {
      return await supabase.from('deck_cards').update({ qty: existing.qty - 1 }).eq('id', existing.id).select().single();
    }
    return await supabase.from('deck_cards').delete().eq('id', existing.id);
  },
  async move(deckId, scryfallId, fromBoard, toBoard) {
    const { data: existing } = await supabase.from('deck_cards').select('*').eq('deck_id', deckId).eq('scryfall_id', scryfallId).eq('board', fromBoard).single();
    if (!existing) return { error: { message: 'Card not found' } };
    // Check if already exists in target board
    const { data: target } = await supabase.from('deck_cards').select('*').eq('deck_id', deckId).eq('scryfall_id', scryfallId).eq('board', toBoard).single();
    if (target) {
      await supabase.from('deck_cards').update({ qty: target.qty + 1 }).eq('id', target.id);
    } else {
      const user = await getUser();
      await supabase.from('deck_cards').insert({ ...existing, id: undefined, board: toBoard, qty: 1, user_id: user.id });
    }
    if (existing.qty > 1) {
      await supabase.from('deck_cards').update({ qty: existing.qty - 1 }).eq('id', existing.id);
    } else {
      await supabase.from('deck_cards').delete().eq('id', existing.id);
    }
    return { error: null };
  },
  async update(id, updates) {
    const { data, error } = await supabase.from('deck_cards').update(updates).eq('id', id).select().single();
    return { data, error };
  }
};

// Trade History CRUD
export const tradeApi = {
  async list() {
    const { data, error } = await supabase.from('trade_history').select('*').order('created_at', { ascending: false }).limit(20);
    return { data, error };
  },
  async save(trade) {
    const user = await getUser();
    if (!user) return { error: { message: 'Not authenticated' } };
    const { data, error } = await supabase.from('trade_history').insert({
      user_id: user.id,
      trade_date: trade.date,
      give: trade.give,
      recv: trade.recv,
      give_total: trade.giveTotal,
      recv_total: trade.recvTotal,
    }).select().single();
    return { data, error };
  },
  async delete(id) {
    const { error } = await supabase.from('trade_history').delete().eq('id', id);
    return { error };
  }
};

// Profile/Settings
export const profileApi = {
  async get() {
    const user = await getUser();
    if (!user) return { data: null };
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    return { data, error };
  },
  async update(updates) {
    const user = await getUser();
    if (!user) return { error: { message: 'Not authenticated' } };
    const { data, error } = await supabase.from('profiles').update(updates).eq('id', user.id).select().single();
    return { data, error };
  }
};
