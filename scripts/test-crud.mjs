import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  'https://bqhsiotwmyaufiopqtbi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxaHNpb3R3bXlhdWZpb3BxdGJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc3Mzk3MSwiZXhwIjoyMDkxMzQ5OTcxfQ.GRyS0xlZoaNt1hN0Miki9NvYSaPcEL5TmEPmvx4MoBg'
);

let pass = 0, fail = 0;
const test = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  PASS: ${name}${detail ? ' - ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
};

async function run() {
  console.log('=== Arcane Vault CRUD Test Suite ===\n');

  // 1. Create user
  console.log('1. Auth & Trigger');
  const { data: { user }, error: authErr } = await sb.auth.admin.createUser({
    email: 'crudbot@testing.dev', password: 'CrudBot123!', email_confirm: true,
    user_metadata: { display_name: 'CRUD Bot' }
  });
  test('Create user', !authErr && user?.id, user?.id?.substring(0, 8));
  if (!user) { console.log('ABORT: no user created', authErr); return; }
  const uid = user.id;

  // 2. Verify trigger
  const { data: profile } = await sb.from('profiles').select('*').eq('id', uid).single();
  test('Profile auto-created', !!profile, profile?.display_name);

  const { data: binders } = await sb.from('binders').select('*').eq('user_id', uid).order('name');
  test('Default binders created', binders?.length === 2, binders?.map(b => b.name).join(', '));
  const collBinder = binders?.find(b => b.binder_type === 'collection');
  const wishBinder = binders?.find(b => b.binder_type === 'wishlist');
  test('Collection binder exists', !!collBinder, collBinder?.id?.substring(0, 8));
  test('Wishlist binder exists', !!wishBinder, wishBinder?.id?.substring(0, 8));

  // 3. Collection CRUD
  console.log('\n2. Collection Cards');
  const { data: card1, error: addErr } = await sb.from('collection_cards').insert({
    user_id: uid, binder_id: collBinder.id, scryfall_id: 'bolt-test', name: 'Lightning Bolt',
    qty: 4, condition: 'NM', foil: false, language: 'en', rarity: 'common', cmc: 1,
    prices: { usd: '0.50' }, image_uris: { small: 'test.jpg' }
  }).select().single();
  test('Add card to collection', !addErr && card1?.name === 'Lightning Bolt', `qty:${card1?.qty} cond:${card1?.condition}`);

  const { data: updated } = await sb.from('collection_cards').update({ condition: 'LP', foil: true, qty: 8 })
    .eq('id', card1.id).select().single();
  test('Update card metadata', updated?.condition === 'LP' && updated?.foil === true && updated?.qty === 8, `cond:${updated?.condition} foil:${updated?.foil} qty:${updated?.qty}`);

  const { data: cards } = await sb.from('collection_cards').select('*').eq('binder_id', collBinder.id);
  test('Read collection', cards?.length === 1, `${cards?.length} cards`);

  // Move to wishlist
  const { error: moveErr } = await sb.from('collection_cards').update({ binder_id: wishBinder.id }).eq('id', card1.id);
  test('Move card to wishlist', !moveErr);
  const { data: wishCards } = await sb.from('collection_cards').select('*').eq('binder_id', wishBinder.id);
  test('Card in wishlist', wishCards?.length === 1, wishCards?.[0]?.name);

  const { error: delCardErr } = await sb.from('collection_cards').delete().eq('id', card1.id);
  test('Delete card', !delCardErr);

  // 4. Deck CRUD
  console.log('\n3. Decks');
  const { data: deck, error: deckErr } = await sb.from('decks').insert({
    user_id: uid, name: 'Test Commander', format: 'commander', tags: ['Combo', 'Control'], notes: 'Test deck'
  }).select().single();
  test('Create deck', !deckErr && deck?.name === 'Test Commander', `format:${deck?.format} tags:${deck?.tags?.join(',')}`);

  const { data: updDeck } = await sb.from('decks').update({ name: 'Renamed Deck', notes: 'Updated' }).eq('id', deck.id).select().single();
  test('Rename deck', updDeck?.name === 'Renamed Deck', updDeck?.name);

  // Deck cards
  const { data: dc1 } = await sb.from('deck_cards').insert({
    deck_id: deck.id, user_id: uid, scryfall_id: 'sol-ring', name: 'Sol Ring', board: 'main', qty: 1, cmc: 1
  }).select().single();
  test('Add card to deck', dc1?.name === 'Sol Ring', `board:${dc1?.board}`);

  const { data: dc2 } = await sb.from('deck_cards').insert({
    deck_id: deck.id, user_id: uid, scryfall_id: 'cmd-001', name: 'Atraxa', board: 'commander', qty: 1
  }).select().single();
  test('Add commander', dc2?.board === 'commander', dc2?.name);

  const { data: dc3 } = await sb.from('deck_cards').insert({
    deck_id: deck.id, user_id: uid, scryfall_id: 'side-001', name: 'Rest in Peace', board: 'sideboard', qty: 2
  }).select().single();
  test('Add sideboard card', dc3?.board === 'sideboard', `qty:${dc3?.qty}`);

  // Move card between zones
  await sb.from('deck_cards').update({ board: 'maybeboard' }).eq('id', dc3.id);
  const { data: moved } = await sb.from('deck_cards').select('board').eq('id', dc3.id).single();
  test('Move card to maybeboard', moved?.board === 'maybeboard');

  const { data: allDC } = await sb.from('deck_cards').select('*').eq('deck_id', deck.id);
  test('Read all deck cards', allDC?.length === 3, allDC?.map(c => c.name).join(', '));

  // Delete deck (cascade deletes cards)
  await sb.from('decks').delete().eq('id', deck.id);
  const { data: orphans } = await sb.from('deck_cards').select('id').eq('deck_id', deck.id);
  test('Cascade delete deck cards', orphans?.length === 0, `${orphans?.length} remaining`);

  // 5. Trade history
  console.log('\n4. Trade History');
  const { data: trade } = await sb.from('trade_history').insert({
    user_id: uid, trade_date: '2026-04-10',
    give: [{ name: 'Lightning Bolt', qty: 4, price: '0.50' }],
    recv: [{ name: 'Force of Will', qty: 1, price: '45.00' }],
    give_total: 2.0, recv_total: 45.0
  }).select().single();
  test('Save trade', trade?.trade_date === '2026-04-10', `give:$${trade?.give_total} recv:$${trade?.recv_total}`);

  const { data: trades } = await sb.from('trade_history').select('*').eq('user_id', uid);
  test('List trades', trades?.length === 1);

  // 6. Binder CRUD
  console.log('\n5. Binder Management');
  const { data: newBinder } = await sb.from('binders').insert({
    user_id: uid, name: 'Trade Binder', binder_type: 'collection'
  }).select().single();
  test('Create custom binder', newBinder?.name === 'Trade Binder');

  await sb.from('binders').update({ name: 'My Trade Binder' }).eq('id', newBinder.id);
  const { data: renamedB } = await sb.from('binders').select('name').eq('id', newBinder.id).single();
  test('Rename binder', renamedB?.name === 'My Trade Binder');

  await sb.from('binders').delete().eq('id', newBinder.id);
  const { data: afterDel } = await sb.from('binders').select('id').eq('id', newBinder.id);
  test('Delete binder', afterDel?.length === 0);

  // 7. Edge cases
  console.log('\n6. Edge Cases');
  const { error: dupeErr } = await sb.from('decks').insert({ user_id: uid, name: '' }).select();
  // Empty name should still work (no NOT NULL constraint on empty string)
  test('Empty deck name', !dupeErr, 'Allowed (no constraint)');

  const { error: bigErr } = await sb.from('collection_cards').insert({
    user_id: uid, binder_id: collBinder.id, scryfall_id: 'big-test', name: 'A'.repeat(500),
    qty: 99999, condition: 'NM', foil: false
  }).select();
  test('Large qty + long name', !bigErr, 'Accepted');

  // Cleanup big test card
  await sb.from('collection_cards').delete().eq('scryfall_id', 'big-test');
  await sb.from('decks').delete().eq('user_id', uid);

  // 8. Cleanup
  console.log('\n7. Cleanup');
  const { error: delUserErr } = await sb.auth.admin.deleteUser(uid);
  test('Delete test user', !delUserErr);

  const { data: remainB } = await sb.from('binders').select('id').eq('user_id', uid);
  test('Cascade cleared binders', remainB?.length === 0, `${remainB?.length} remaining`);

  const { data: remainC } = await sb.from('collection_cards').select('id').eq('user_id', uid);
  test('Cascade cleared cards', remainC?.length === 0);

  const { data: remainT } = await sb.from('trade_history').select('id').eq('user_id', uid);
  test('Cascade cleared trades', remainT?.length === 0);

  // Summary
  console.log(`\n${'='.repeat(40)}`);
  console.log(`RESULTS: ${pass} passed, ${fail} failed out of ${pass + fail} tests`);
  console.log(`Confidence: ${fail === 0 ? 'HIGH' : fail <= 2 ? 'MEDIUM' : 'LOW'}`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('FATAL:', e); process.exit(1); });
