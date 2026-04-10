import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase, signUp, signIn, signOut, getUser, getSession, bindersApi, cardsApi, decksApi, deckCardsApi, tradeApi, profileApi } from "./supabase.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCRYFALL API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const PLACEHOLDER_IMG = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const getImg = (card, version = "normal") => {
  const uris = card?.image_uris || card?.card_faces?.[0]?.image_uris;
  if (!uris) return PLACEHOLDER_IMG;
  return version === "small" ? (uris.small || uris.normal) : uris.normal;
};

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDebounced(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return debounced;
}

async function searchScryfall(query, colors = [], type = "", set = "", extra = {}) {
  let parts = [];
  if (query) parts.push(query);
  if (colors.length) parts.push(`id>=${colors.join("").toLowerCase()}`);
  if (type) parts.push(`t:${type}`);
  if (set) parts.push(`set:${set}`);
  if (extra.rarity) parts.push(`r:${extra.rarity}`);
  if (extra.cmc) parts.push(`cmc${extra.cmc}`);
  if (extra.oracle) parts.push(`o:"${extra.oracle}"`);
  if (extra.legality) parts.push(`f:${extra.legality}`);
  if (!parts.length) return { data: [], total: 0 };
  try {
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(parts.join(" "))}&order=name&unique=${set ? "prints" : "cards"}`);
    if (!res.ok) return { data: [], total: 0 };
    const json = await res.json();
    return { data: json.data || [], total: json.total_cards || 0, nextPage: json.has_more ? json.next_page : null };
  } catch { return { data: [], total: 0, nextPage: null }; }
}

async function fetchNextPage(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return { data: [], nextPage: null };
    const json = await res.json();
    return { data: json.data || [], nextPage: json.has_more ? json.next_page : null };
  } catch { return { data: [], nextPage: null }; }
}

async function searchCards(query, colors = [], type = "") {
  if (query.length < 2 && !colors.length && !type) return [];
  let parts = [];
  if (query) parts.push(query);
  if (colors.length) parts.push(`id>=${colors.join("").toLowerCase()}`);
  if (type) parts.push(`t:${type}`);
  if (!parts.length) return [];
  try {
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(parts.join(" "))}&order=name&unique=cards`);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []).slice(0, 12);
  } catch { return []; }
}

async function fetchAutocomplete(query) {
  if (query.length < 2) return [];
  try {
    const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    return (await res.json()).data || [];
  } catch { return []; }
}

async function fetchSetCards(setCode) {
  const cards = [];
  let url = `https://api.scryfall.com/cards/search?q=set:${setCode}+is:booster&unique=cards&order=collector_number`;
  try {
    while (url) {
      const res = await fetch(url);
      if (!res.ok) break;
      const json = await res.json();
      cards.push(...(json.data || []));
      url = json.has_more ? json.next_page : null;
      if (url) await new Promise(r => setTimeout(r, 80));
    }
  } catch {}
  return cards;
}

async function fetchRulings(rulingsUri) {
  if (!rulingsUri) return [];
  try {
    const res = await fetch(rulingsUri);
    if (!res.ok) return [];
    return (await res.json()).data || [];
  } catch { return []; }
}

async function fetchPrintings(cardName) {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${cardName}"`)}&unique=prints&order=released`);
    if (!res.ok) return [];
    return (await res.json()).data || [];
  } catch { return []; }
}

async function fetchSets() {
  try {
    const res = await fetch("https://api.scryfall.com/sets");
    if (!res.ok) return [];
    return ((await res.json()).data || []).filter(s => ["core","expansion","masters","draft_innovation","funny"].includes(s.set_type)).slice(0, 80);
  } catch { return []; }
}

async function fetchRandomCard() {
  try {
    const res = await fetch("https://api.scryfall.com/cards/random?q=has%3Aflavor+-is%3Adigital+has%3Aart");
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// OCR scanner with worker caching, timeout, and fuzzy correction
let _ocrWorker = null;
let _ocrIdleTimer = null;
async function getOcrWorker() {
  if (_ocrIdleTimer) { clearTimeout(_ocrIdleTimer); _ocrIdleTimer = null; }
  if (_ocrWorker) return _ocrWorker;
  const { createWorker } = await import("tesseract.js");
  _ocrWorker = await createWorker("eng");
  return _ocrWorker;
}
function scheduleWorkerCleanup() {
  if (_ocrIdleTimer) clearTimeout(_ocrIdleTimer);
  _ocrIdleTimer = setTimeout(async () => {
    if (_ocrWorker) { try { await _ocrWorker.terminate(); } catch {} _ocrWorker = null; }
  }, 60000);
}

async function scanCardImage(file) {
  let worker = null;
  try {
    worker = await Promise.race([
      getOcrWorker(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("OCR timeout")), 20000))
    ]);
    const { data: { text } } = await worker.recognize(file);
    const rawLine = (text.split("\n").map(l => l.trim()).filter(Boolean))[0] || "";
    if (!rawLine) return "";
    scheduleWorkerCleanup();
    const cleaned = rawLine.replace(/[{}\[\]|]/g, "").replace(/\d+$/,"").trim();
    // Fuzzy correct via Scryfall autocomplete
    try {
      const suggestions = await fetchAutocomplete(cleaned);
      if (suggestions.length > 0) return suggestions[0]; // Best match
    } catch {}
    return cleaned;
  } catch (e) {
    // On error, kill worker so next scan gets a fresh one
    if (worker) { try { await worker.terminate(); } catch {} _ocrWorker = null; }
    throw e;
  }
}

function parseDeckList(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("//") && !l.startsWith("#"));
  const entries = []; let board = "main";
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (["sideboard","sideboard:","// sideboard"].includes(lower)) { board = "sideboard"; continue; }
    if (["commander","commander:","// commander"].includes(lower)) { board = "commander"; continue; }
    if (["companion","companion:","// companion"].includes(lower)) { board = "companion"; continue; }
    if (["maybeboard","maybeboard:","// maybeboard","maybe","maybe:"].includes(lower)) { board = "maybeboard"; continue; }
    if (["mainboard","mainboard:","main:","// mainboard","deck","deck:"].includes(lower)) { board = "main"; continue; }
    const match = line.match(/^(\d+)x?\s+(.+)$/i);
    if (match) entries.push({ qty: parseInt(match[1]), name: match[2].trim(), board });
    else entries.push({ qty: 1, name: line, board });
  }
  return entries;
}

function exportCollectionCSV(cards) {
  const header = "Quantity,Name,Set,Set Code,Collector Number,Condition,Foil,Language,Price USD";
  const rows = cards.map(c => `${c.qty},"${c.name}","${c.set_name||""}","${c.set||""}","${c.collector_number||""}","${c.condition||"NM"}","${c.foil?"Yes":"No"}","${(c.language||"en").toUpperCase()}","${c.prices?.usd||""}"`);
  return header + "\n" + rows.join("\n");
}

function parseCollectionCSV(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const entries = [];
  for (let i = 1; i < lines.length; i++) {
    const match = lines[i].match(/^(\d+),"([^"]*)"(?:,"([^"]*)")?(?:,"([^"]*)")?(?:,"([^"]*)")?(?:,"([^"]*)")?(?:,"([^"]*)")?(?:,"([^"]*)")?(?:,"([^"]*)")?/);
    if (match) entries.push({ qty: parseInt(match[1]) || 1, name: match[2], condition: match[6] || "NM", foil: match[7] === "Yes", language: (match[8] || "EN").toLowerCase() });
  }
  return entries;
}

function exportDeckList(deck, format = "text") {
  let out = "";
  const cmdr = deck.cards.filter(c => c.board === "commander"), main = deck.cards.filter(c => c.board === "main");
  const side = deck.cards.filter(c => c.board === "sideboard"), companion = deck.cards.filter(c => c.board === "companion");
  const maybe = deck.cards.filter(c => c.board === "maybeboard");
  const line = (c) => format === "arena" ? `${c.qty} ${c.name} (${(c.set||"").toUpperCase()}) ${c.collector_number||""}` : `${c.qty} ${c.name}`;
  if (cmdr.length) { out += "Commander\n"; cmdr.forEach(c => { out += line(c) + "\n"; }); out += "\n"; }
  if (companion.length) { out += "Companion\n"; companion.forEach(c => { out += line(c) + "\n"; }); out += "\n"; }
  if (main.length) main.forEach(c => { out += line(c) + "\n"; });
  if (side.length) { out += "\nSideboard\n"; side.forEach(c => { out += line(c) + "\n"; }); }
  if (maybe.length) { out += "\nMaybeboard\n"; maybe.forEach(c => { out += line(c) + "\n"; }); }
  return out.trim();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FORMAT RULES & DECK VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const FORMAT_RULES = {
  commander: { min: 100, max: 100, copies: 1, sideboard: 0, label: "Commander" },
  standard:  { min: 60, max: null, copies: 4, sideboard: 15, label: "Standard" },
  modern:    { min: 60, max: null, copies: 4, sideboard: 15, label: "Modern" },
  pioneer:   { min: 60, max: null, copies: 4, sideboard: 15, label: "Pioneer" },
  legacy:    { min: 60, max: null, copies: 4, sideboard: 15, label: "Legacy" },
  vintage:   { min: 60, max: null, copies: 4, sideboard: 15, label: "Vintage" },
  pauper:    { min: 60, max: null, copies: 4, sideboard: 15, label: "Pauper" },
};
const BASIC_LANDS = ["plains","island","swamp","mountain","forest","wastes","snow-covered plains","snow-covered island","snow-covered swamp","snow-covered mountain","snow-covered forest"];

function validateDeck(deck) {
  const rules = FORMAT_RULES[deck.format] || FORMAT_RULES.standard;
  const warnings = [];
  const mainCards = deck.cards.filter(c => c.board === "main" || c.board === "commander");
  const sideCards = deck.cards.filter(c => c.board === "sideboard");
  const mainCount = mainCards.reduce((a, c) => a + c.qty, 0);
  const sideCount = sideCards.reduce((a, c) => a + c.qty, 0);
  if (rules.min && mainCount < rules.min) warnings.push({ msg: `${mainCount}/${rules.min} cards (need ${rules.min - mainCount} more)`, severity: "error" });
  if (rules.max && mainCount > rules.max) warnings.push({ msg: `${mainCount}/${rules.max} cards (${mainCount - rules.max} over)`, severity: "error" });
  if (rules.min && mainCount >= rules.min && (!rules.max || mainCount <= rules.max)) warnings.push({ msg: `${mainCount}/${rules.min}+ cards`, severity: "ok" });
  if (rules.sideboard > 0 && sideCount > rules.sideboard) warnings.push({ msg: `Sideboard: ${sideCount}/${rules.sideboard} (${sideCount - rules.sideboard} over)`, severity: "warn" });
  const violations = [];
  mainCards.forEach(c => { if (!BASIC_LANDS.includes(c.name.toLowerCase()) && c.qty > rules.copies) violations.push(`${c.name} (${c.qty}x, max ${rules.copies})`); });
  if (violations.length) warnings.push({ msg: `Over copy limit: ${violations.join(", ")}`, severity: "error" });

  // Commander color identity validation
  if (deck.format === "commander") {
    const commanders = deck.cards.filter(c => c.board === "commander");
    if (commanders.length === 0) warnings.push({ msg: "No commander designated", severity: "warn" });
    else {
      const cmdCI = new Set();
      commanders.forEach(c => (c.color_identity || []).forEach(ci => cmdCI.add(ci)));
      const ciViolations = [];
      deck.cards.filter(c => c.board === "main").forEach(c => {
        const cardCI = c.color_identity || [];
        if (cardCI.some(ci => !cmdCI.has(ci))) ciViolations.push(c.name);
      });
      if (ciViolations.length) warnings.push({ msg: `Outside color identity: ${ciViolations.slice(0, 3).join(", ")}${ciViolations.length > 3 ? ` +${ciViolations.length - 3} more` : ""}`, severity: "error" });
    }
  }

  // Banned card check (uses Scryfall legalities data on cards)
  const bannedCards = deck.cards.filter(c => c.legalities && c.legalities[deck.format] === "banned");
  if (bannedCards.length) warnings.push({ msg: `Banned: ${bannedCards.map(c => c.name).join(", ")}`, severity: "error" });

  const restrictedCards = deck.cards.filter(c => c.legalities && c.legalities[deck.format] === "restricted" && c.qty > 1);
  if (restrictedCards.length) warnings.push({ msg: `Restricted (max 1): ${restrictedCards.map(c => c.name).join(", ")}`, severity: "warn" });

  // Companion validation
  const companions = deck.cards.filter(c => c.board === "companion");
  if (companions.length > 1) warnings.push({ msg: "Only 1 companion allowed", severity: "error" });
  if (companions.length === 1) {
    const comp = companions[0];
    const compName = comp.name?.toLowerCase() || "";
    const nonLandMain = deck.cards.filter(c => (c.board === "main" || c.board === "commander") && !(c.type_line || "").toLowerCase().includes("land"));
    if (compName.includes("lurrus")) {
      const violations = nonLandMain.filter(c => c.cmc > 2 && (c.type_line || "").match(/creature|artifact|enchantment/i));
      if (violations.length) warnings.push({ msg: `Lurrus: ${violations.length} permanents with MV>2`, severity: "error" });
    }
    if (compName.includes("yorion")) {
      const mc = deck.cards.filter(c => c.board === "main").reduce((a, c) => a + c.qty, 0);
      if (mc < 80) warnings.push({ msg: `Yorion requires 80+ cards (have ${mc})`, severity: "error" });
    }
    if (compName.includes("kaheera")) {
      const bad = nonLandMain.filter(c => (c.type_line||"").toLowerCase().includes("creature") && !["cat","elemental","nightmare","dinosaur","beast"].some(t => (c.type_line||"").toLowerCase().includes(t)));
      if (bad.length) warnings.push({ msg: `Kaheera: ${bad.length} invalid creature types`, severity: "error" });
    }
    if (compName.includes("obosh")) {
      const bad = nonLandMain.filter(c => c.cmc > 0 && c.cmc % 2 === 0);
      if (bad.length) warnings.push({ msg: `Obosh: ${bad.length} cards with even MV`, severity: "error" });
    }
    if (compName.includes("gyruda")) {
      const bad = nonLandMain.filter(c => c.cmc > 0 && c.cmc % 2 !== 0);
      if (bad.length) warnings.push({ msg: `Gyruda: ${bad.length} cards with odd MV`, severity: "error" });
    }
    if (compName.includes("keruga")) {
      const bad = nonLandMain.filter(c => c.cmc < 3 && c.cmc > 0);
      if (bad.length) warnings.push({ msg: `Keruga: ${bad.length} nonland cards with MV<3`, severity: "error" });
    }
    if (compName.includes("umori")) {
      const types = new Set(nonLandMain.map(c => {const tl=(c.type_line||"").toLowerCase();return ["creature","artifact","enchantment","instant","sorcery","planeswalker"].find(t=>tl.includes(t))||"other"}));
      if (types.size > 1) warnings.push({ msg: `Umori: deck has ${types.size} card types (need 1)`, severity: "error" });
    }
    if (compName.includes("jegantha")) {
      const bad = nonLandMain.filter(c => {const mc=c.mana_cost||"";const pips=(mc.match(/\{[WUBRGC]\}/g)||[]).map(p=>p[1]);return pips.length>0&&pips.some(p=>pips.filter(x=>x===p).length>1)});
      if (bad.length) warnings.push({ msg: `Jegantha: ${bad.length} cards with repeated mana symbols`, severity: "error" });
    }
    if (compName.includes("zirda")) {
      const bad = nonLandMain.filter(c => !(c.oracle_text||"").includes("activate") && !(c.oracle_text||"").includes("cycling") && (c.type_line||"").match(/creature|artifact|enchantment/i));
      // Zirda check is approximate — full validation needs activated ability detection
    }
    if (compName.includes("lutri")) {
      const names = {};
      nonLandMain.forEach(c => {names[c.name]=(names[c.name]||0)+c.qty});
      const dupes = Object.entries(names).filter(([,n])=>n>1);
      if (dupes.length) warnings.push({ msg: `Lutri: ${dupes.length} cards with 2+ copies`, severity: "error" });
    }
  }

  return warnings;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COLOR IDENTITY & NAMING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function getDeckColors(deck) {
  const colors = new Set();
  deck.cards.forEach(c => (c.color_identity || []).forEach(ci => colors.add(ci)));
  return ["W","U","B","R","G"].filter(c => colors.has(c));
}

const COLOR_PAIR_NAMES = {
  "":"Colorless","W":"Mono White","U":"Mono Blue","B":"Mono Black","R":"Mono Red","G":"Mono Green",
  "WU":"Azorius","WB":"Orzhov","UB":"Dimir","UR":"Izzet","BR":"Rakdos",
  "WR":"Boros","BG":"Golgari","RG":"Gruul","WG":"Selesnya","UG":"Simic",
  "WUB":"Esper","WUR":"Jeskai","WUG":"Bant","WBR":"Mardu","WBG":"Abzan",
  "WRG":"Naya","UBR":"Grixis","UBG":"Sultai","URG":"Temur","BRG":"Jund",
  "WUBR":"Non-Green","WUBG":"Non-Red","WURG":"Non-Black","WBRG":"Non-Blue","UBRG":"Non-White",
  "WUBRG":"Five-Color",
};

function getDeckColorName(deck) {
  const c = getDeckColors(deck).join("");
  return COLOR_PAIR_NAMES[c] || (c.length ? c : "Colorless");
}

// Mana-adaptive background tint based on deck colors
const COLOR_TINTS = { W:"#1E1C16",U:"#0E1A2A",B:"#14101A",R:"#1E1012",G:"#0E1A14" };
function getDeckTint(deck) {
  const c = getDeckColors(deck);
  if (!c.length) return T.bg;
  return COLOR_TINTS[c[0]] || T.bg;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// THEME & HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const fmt = (p) => p ? `$${parseFloat(p).toFixed(2)}` : "\u2014";
const MCLR = { W:"#F9FAF4",U:"#0E68AB",B:"#211510",R:"#D3202A",G:"#00733E",C:"#CAC5C0" };
const MBDR = { W:"#C4B998",U:"#064A7A",B:"#44403C",R:"#9A1620",G:"#005C30",C:"#9E9A96" };
const MTXT = { W:"#444",U:"#fff",B:"#C9A96E",R:"#fff",G:"#fff",C:"#444" };
const RARITY_CLR = { common:"#9A9DAE", uncommon:"#B8C4D0", rare:"#E8C349", mythic:"#F06834", special:"#9F5FBF", bonus:"#9F5FBF" };

const T = {
  bg: "#0C0E14", card: "#12141F", cardBorder: "#1E2235", surface: "#181B2A", cardInner: "#0F1119",
  gold: "#C9A96E", goldDark: "#A88B4A", goldGlow: "rgba(201,169,110,.15)",
  text: "#E2E0DC", textMuted: "#8A8D9E", textDim: "#5A5D6E", parchment: "#E8E0D0",
  accent: "#F0D78C", green: "#4ADE80", red: "#EF4444", blue: "#60A5FA", purple: "#C084FC",
  mythicOrange: "#F06834",
};

// Fonts
const F = { heading: "'Cinzel', serif", body: "'Cormorant Garamond', 'Palatino Linotype', serif", ui: "'Cormorant Garamond', 'SF Pro Text', 'Segoe UI', system-ui, sans-serif" };
const GLOW = "0 0 20px rgba(201,169,110,.25)";

// Error retry queue for Supabase writes
const retryQueue = [];
const MAX_RETRY_QUEUE = 50;
async function enqueueWrite(fn) {
  try { return await fn(); }
  catch (e) {
    if (retryQueue.length < MAX_RETRY_QUEUE) retryQueue.push(fn);
    else console.warn("Retry queue full, dropping write");
    return { error: e };
  }
}
if (typeof window !== "undefined") {
  setInterval(async () => {
    let attempts = 0;
    while (retryQueue.length > 0 && attempts < 10) {
      const fn = retryQueue[0];
      try { await fn(); retryQueue.shift(); attempts++; } catch { break; }
    }
  }, 30000);
}

// MTG-style CSS patterns
const S = {
  filigree: `linear-gradient(90deg, transparent 0%, ${T.gold}44 15%, ${T.gold} 50%, ${T.gold}44 85%, transparent 100%)`,
  filFaint: `linear-gradient(90deg, transparent, ${T.gold}33, transparent)`,
  vignette: `radial-gradient(ellipse at 50% 0%, #161A28 0%, #0C0E14 60%, #080A10 100%)`,
  cardFrame: `inset 0 0 0 1px ${T.cardInner}, inset 0 0 0 2px ${T.cardBorder}, 0 2px 12px rgba(0,0,0,.4)`,
  goldGlow: `0 0 0 1px ${T.gold}44, 0 4px 16px rgba(201,169,110,.25), 0 1px 3px rgba(0,0,0,.4)`,
  texture: `repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(255,255,255,.008) 4px, rgba(255,255,255,.008) 5px)`,
  insetInput: `inset 0 2px 4px rgba(0,0,0,.3)`,
};

// Loading phrases
const LOADING = ["Scrying the Multiverse...","Consulting the archives...","Tutor resolving...","Divining results...","Planar bridge activating..."];
const loadPhrase = () => LOADING[Math.floor(Math.random() * LOADING.length)];

// Flavor text (real MTG-inspired)
const FLAVOR = {
  search: ['"The things I once imagined would be my greatest achievements were only the first steps toward a future I can only begin to fathom." \u2014 Jace Beleren','"Every answer requires a more specific question." \u2014 Azami, Lady of Scrolls'],
  decks: ['"The finest specimens of each spell, collected and bound for ready use." \u2014 Ertai, Wizard Adept','"A true warrior is always prepared." \u2014 Gideon Jura'],
  binder: ['"I have seen the world\u2019s wonders catalogued in vaults of glass and gold." \u2014 Jhoira of the Ghitu','"Every artifact tells a story of its creator." \u2014 Urza'],
  trade: ['"In the Bazaar, information is currency and every card has a price." \u2014 Marchesa, the Black Rose','"Fair trade is a spell that benefits both casters."'],
};
const randomFlavor = (key) => FLAVOR[key][Math.floor(Math.random() * FLAVOR[key].length)];

const typeCategory = (typeLine) => {
  if (!typeLine) return "Other";
  const t = typeLine.toLowerCase();
  if (t.includes("creature")) return "Creatures"; if (t.includes("instant")) return "Instants";
  if (t.includes("sorcery")) return "Sorceries"; if (t.includes("enchantment")) return "Enchantments";
  if (t.includes("artifact")) return "Artifacts"; if (t.includes("planeswalker")) return "Planeswalkers";
  if (t.includes("land")) return "Lands"; return "Other";
};
const TYPE_ORDER = ["Creatures","Planeswalkers","Instants","Sorceries","Enchantments","Artifacts","Lands","Other"];

// IndexedDB store with localStorage migration
const store = {
  db: null,
  async init() {
    if (this.db) return;
    return new Promise((resolve) => {
      const req = indexedDB.open("arcane-vault", 1);
      req.onupgradeneeded = (e) => { const db = e.target.result; if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv"); };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
      req.onerror = () => resolve(); // fallback gracefully
    });
  },
  async get(k) {
    await this.init();
    if (!this.db) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
    return new Promise((resolve) => {
      const tx = this.db.transaction("kv", "readonly");
      const req = tx.objectStore("kv").get(k);
      req.onsuccess = () => {
        if (req.result !== undefined) { resolve(req.result); return; }
        // Migrate from localStorage on first access
        try { const v = JSON.parse(localStorage.getItem(k)); if (v) { this.set(k, v); localStorage.removeItem(k); } resolve(v); }
        catch { resolve(null); }
      };
      req.onerror = () => resolve(null);
    });
  },
  async set(k, v) {
    await this.init();
    if (!this.db) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} return; }
    return new Promise((resolve) => {
      const tx = this.db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(v, k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Pip({s,sz=18}) {
  return <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:sz,height:sz,borderRadius:"50%",background:`radial-gradient(circle at 35% 30%, ${MCLR[s]||"#ccc"}dd, ${MCLR[s]||"#aaa"})`,border:`1.5px solid ${MBDR[s]||"#666"}`,fontSize:sz*.55,fontWeight:800,color:MTXT[s]||"#fff",flexShrink:0,boxShadow:`inset 0 2px 3px rgba(255,255,255,.25), inset 0 -2px 3px rgba(0,0,0,.35), 0 1px 2px rgba(0,0,0,.4)`}}>{s}</span>;
}
function Cost({c,sz=18}) {
  if(!c) return null;
  return <span style={{display:"inline-flex",gap:2,alignItems:"center"}}>{(c.match(/\{([^}]+)\}/g)||[]).map((p,i)=>{const s=p.replace(/[{}]/g,"");return "WUBRGC".includes(s)?<Pip key={i} s={s} sz={sz}/>:<span key={i} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:sz,height:sz,borderRadius:"50%",background:"#ddd",border:"1.5px solid #bbb",fontSize:sz*.55,fontWeight:800,color:"#333"}}>{s}</span>;})}</span>;
}
function RarityBadge({rarity,sz=16}) {
  const c = RARITY_CLR[rarity] || RARITY_CLR.common;
  return <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:sz,height:sz,borderRadius:3,background:`${c}22`,border:`1px solid ${c}55`,fontSize:sz*.55,fontWeight:800,color:c,flexShrink:0,lineHeight:1}}>{(rarity||"c")[0].toUpperCase()}</span>;
}
function ColorPills({colors,setColors,size=34}) {
  return <>{Object.keys(MCLR).map(c=>(
    <button key={c} onClick={()=>setColors(p=>p.includes(c)?p.filter(x=>x!==c):[...p,c])} style={{width:size,height:size,borderRadius:"50%",border:colors.includes(c)?`2.5px solid ${T.gold}`:"2px solid #333",background:MCLR[c],fontSize:size*.35,fontWeight:800,color:MTXT[c],cursor:"pointer",opacity:colors.includes(c)?1:.45,transition:"all .15s",flexShrink:0}}>{c}</button>
  ))}</>;
}
function TypeSelect({type,setType,h=34}) {
  return <select value={type} onChange={e=>setType(e.target.value)} style={{padding:"0 10px",borderRadius:18,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.textMuted,fontSize:11,cursor:"pointer",flexShrink:0,appearance:"none",minWidth:68,height:h,textAlign:"center"}}>
    <option value="">All types</option>
    {["Creature","Instant","Sorcery","Enchantment","Artifact","Planeswalker","Land"].map(t=><option key={t} value={t.toLowerCase()}>{t}</option>)}
  </select>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ICONS (uniform SVG line-art)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const I = {
  search: (c) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.5" y1="15.5" x2="21" y2="21"/></svg>,
  vault: (c) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-6 9 6v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path d="M9 22V12h6v10"/></svg>,
  trade: (c) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>,
  deck: (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 8h20"/><path d="M9 4v4"/></svg>,
  binder: (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>,
  simulate: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="8" height="12" rx="1.5"/><rect x="14" y="10" width="8" height="12" rx="1.5"/><rect x="8" y="6" width="8" height="12" rx="1.5"/></svg>,
  import: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>,
  export: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3m0 0l-4 4m4-4l4 4"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>,
  camera: (c) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  back: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg>,
  close: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  chevL: (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>,
  chevR: (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>,
  chevD: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>,
  chevU: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6"/></svg>,
  gear: (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  plus: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  sparkle: (c) => <svg width="20" height="20" viewBox="0 0 24 24" fill={c} stroke="none"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/></svg>,
  grid: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  list: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1" fill={c}/><circle cx="4" cy="12" r="1" fill={c}/><circle cx="4" cy="18" r="1" fill={c}/></svg>,
  check: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  warn: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  trash: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BLURRED ART BACKGROUND
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ArtBg({src,opacity=.18,blur=28,gradient=true}) {
  if (!src || src === PLACEHOLDER_IMG) return null;
  return <div style={{position:"absolute",inset:0,overflow:"hidden",borderRadius:"inherit",pointerEvents:"none",zIndex:0}}>
    <img src={src} alt="" style={{position:"absolute",top:"-20%",left:"-20%",width:"140%",height:"140%",objectFit:"cover",filter:`blur(${blur}px) saturate(1.3)`,opacity,transform:"scale(1.1)"}}/>
    {gradient&&<div style={{position:"absolute",inset:0,background:`linear-gradient(180deg, rgba(12,14,20,.4) 0%, ${T.bg} 100%)`}}/>}
  </div>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TOAST
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((msg, type = "success") => {
    const id = Date.now(); setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 2200);
  }, []);
  return { toasts, show };
}
function ToastContainer({ toasts }) {
  if (!toasts.length) return null;
  return <div style={{position:"fixed",top:12,left:"50%",transform:"translateX(-50%)",zIndex:500,display:"flex",flexDirection:"column",gap:6,width:"90%",maxWidth:400,pointerEvents:"none"}}>
    {toasts.map(t => <div key={t.id} style={{padding:"10px 16px",borderRadius:12,display:"flex",alignItems:"center",gap:8,background:t.type==="success"?"#0F2A1A":t.type==="error"?"#2A0F0F":T.surface,border:`1px solid ${t.type==="success"?T.green+"44":t.type==="error"?T.red+"44":T.cardBorder}`,color:t.type==="success"?T.green:t.type==="error"?T.red:T.text,fontSize:13,fontWeight:600,fontFamily:F.body,boxShadow:"0 4px 20px rgba(0,0,0,.5)",animation:"toastIn .25s ease-out"}}>{t.type==="success"&&I.check(T.green)}{t.msg}</div>)}
  </div>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SKELETON LOADING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SkeletonGrid({count=6}) {
  return <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,paddingTop:4}}>
    {Array.from({length:count}).map((_,i)=><div key={i} style={{borderRadius:12,overflow:"hidden",background:T.card,border:`1px solid ${T.cardBorder}`,boxShadow:S.cardFrame}}>
      <div style={{width:"100%",paddingTop:"140%",background:`linear-gradient(110deg, ${T.card} 30%, ${T.surface} 50%, ${T.card} 70%)`,backgroundSize:"200% 100%",animation:"shimmer 1.5s infinite"}}/>
      <div style={{padding:10}}><div style={{width:"70%",height:12,borderRadius:4,background:T.surface,marginBottom:6}}/><div style={{width:"40%",height:10,borderRadius:4,background:T.surface}}/></div>
    </div>)}
  </div>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BOTTOM SHEET + CONFIRM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function BottomSheet({open,onClose,children}) {
  if(!open) return null;
  return <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
    <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.7)"}}/>
    <div onClick={e=>e.stopPropagation()} style={{position:"relative",background:T.surface,borderRadius:"20px 20px 0 0",maxHeight:"88vh",overflow:"auto",paddingBottom:32,animation:"slideUp .25s ease-out",backgroundImage:S.texture}}>
      <div style={{display:"flex",justifyContent:"center",padding:"10px 0 4px"}}><div style={{width:40,height:4,borderRadius:2,background:"#3A3D4E"}}/></div>
      {children}
    </div>
  </div>;
}
function ConfirmDialog({open,title,message,confirmLabel="Delete",confirmColor=T.red,onConfirm,onCancel}) {
  if (!open) return null;
  return <div style={{position:"fixed",inset:0,zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:32}} onClick={onCancel}>
    <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.7)"}}/>
    <div onClick={e=>e.stopPropagation()} style={{position:"relative",background:T.surface,borderRadius:16,padding:24,maxWidth:320,width:"100%",border:`1px solid ${T.cardBorder}`,boxShadow:S.cardFrame,animation:"toastIn .2s ease-out"}}>
      <div style={{fontSize:16,fontWeight:700,color:T.accent,fontFamily:F.heading,letterSpacing:.5}}>{title}</div>
      <div style={{fontSize:14,color:T.textMuted,marginTop:8,marginBottom:20,lineHeight:1.5,fontFamily:F.body}}>{message}</div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={onCancel} style={{flex:1,padding:12,borderRadius:10,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.textMuted,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:F.body}}>Cancel</button>
        <button onClick={onConfirm} style={{flex:1,padding:12,borderRadius:10,border:"none",background:confirmColor,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F.body}}>{confirmLabel}</button>
      </div>
    </div>
  </div>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CARD SLIDER (universal detail viewer)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function CardSlider({cards,index,onIndexChange,onClose,actions}) {
  const [dragX,setDragX]=useState(0);const [dragging,setDragging]=useState(false);
  const [printings,setPrintings]=useState([]);const [showPrintings,setShowPrintings]=useState(false);
  const [rulings,setRulings]=useState([]);const [showRulings,setShowRulings]=useState(false);
  const [flipped,setFlipped]=useState(false);
  const startX=useRef(0);const card=cards[index]; if(!card) return null;
  const loadPrintings=async()=>{if(showPrintings){setShowPrintings(false);return;}setPrintings(await fetchPrintings(card.name));setShowPrintings(true);setShowRulings(false)};
  const loadRulings=async()=>{if(showRulings){setShowRulings(false);return;}setRulings(await fetchRulings(card.rulings_uri));setShowRulings(true);setShowPrintings(false)};
  const onTS=e=>{startX.current=e.touches[0].clientX;setDragging(true);setDragX(0)};
  const onTM=e=>{if(dragging)setDragX(e.touches[0].clientX-startX.current)};
  const onTE=()=>{setDragging(false);if(dragX<-60&&index<cards.length-1)onIndexChange(index+1);else if(dragX>60&&index>0)onIndexChange(index-1);setDragX(0)};
  const rc=RARITY_CLR[card.rarity]||RARITY_CLR.common;

  return <div style={{position:"fixed",inset:0,zIndex:300,background:"#000",display:"flex",flexDirection:"column"}} onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}>
    <ArtBg src={getImg(card)} opacity={.12} blur={40} gradient={false}/>
    <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",flex:1}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",flexShrink:0}}>
      <button onClick={onClose} style={{background:"none",border:"none",color:T.textMuted,fontSize:14,cursor:"pointer",padding:8,display:"flex",alignItems:"center",gap:6,fontFamily:F.body}}>{I.close(T.textMuted)} Close</button>
      <span style={{fontSize:12,color:T.textDim,fontFamily:F.body}}>{index+1} / {cards.length}</span>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>index>0&&onIndexChange(index-1)} disabled={index===0} style={{background:"none",border:`1px solid ${T.cardBorder}`,borderRadius:8,width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{I.chevL(index>0?T.gold:"#333")}</button>
        <button onClick={()=>index<cards.length-1&&onIndexChange(index+1)} disabled={index>=cards.length-1} style={{background:"none",border:`1px solid ${T.cardBorder}`,borderRadius:8,width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{I.chevR(index<cards.length-1?T.gold:"#333")}</button>
      </div>
    </div>
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",overflow:"auto",padding:"0 16px"}}>
      <div style={{position:"relative",maxWidth:"85%"}}>
        <img src={flipped&&card.card_faces?.[1]?.image_uris?.normal?card.card_faces[1].image_uris.normal:getImg(card)} alt={card.name} style={{width:"100%",maxHeight:"46vh",borderRadius:14,transform:`translateX(${dragX*.3}px) rotate(${dragX*.02}deg)${flipped?" rotateY(180deg)":""}`,transition:dragging?"none":"transform .4s",pointerEvents:"none",objectFit:"contain"}}/>
        {card.card_faces?.length>1&&card.card_faces[1]?.image_uris&&<button onClick={()=>setFlipped(!flipped)} style={{position:"absolute",bottom:8,right:8,width:36,height:36,borderRadius:18,background:"rgba(0,0,0,.7)",border:`1.5px solid ${T.gold}`,color:T.gold,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}} title="Flip card">{"\u21BB"}</button>}
      </div>
      <div style={{marginTop:12,textAlign:"center",width:"100%",maxWidth:340}}>
        <h3 style={{margin:"0 0 4px",fontSize:22,fontWeight:700,color:T.accent,fontFamily:F.heading,letterSpacing:.5}}>{card.name}</h3>
        <div style={{display:"flex",justifyContent:"center",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <Cost c={card.mana_cost} sz={20}/>
          <span style={{fontSize:13,color:T.textMuted,fontFamily:F.body}}>{card.type_line}</span>
          {card.rarity&&<span style={{fontSize:10,fontWeight:700,color:rc,textTransform:"uppercase",padding:"1px 6px",borderRadius:4,background:`${rc}18`,fontFamily:F.body}}>{card.rarity}</span>}
        </div>
        {card.set_name&&<div style={{fontSize:12,color:T.textDim,marginTop:3,fontFamily:F.body}}>{card.set_name} ({card.set?.toUpperCase()})</div>}
        {card.power&&<div style={{fontSize:15,color:T.gold,marginTop:4,fontWeight:700,fontFamily:F.heading}}>{card.power}/{card.toughness}</div>}
        <div style={{marginTop:8,padding:12,background:T.cardInner,borderRadius:12,fontSize:13,color:"#CCC",lineHeight:1.7,textAlign:"left",fontFamily:F.body,boxShadow:S.insetInput}}>
          {(card.oracle_text||card.card_faces?.[0]?.oracle_text||"").split("\n").map((l,i,a)=><div key={i} style={{marginBottom:i<a.length-1?4:0}}>{l}</div>)}
          {card.flavor_text&&<div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${T.cardBorder}`,fontStyle:"italic",color:T.textDim,fontSize:12}}>{card.flavor_text}</div>}
        </div>
        <div style={{display:"flex",justifyContent:"center",gap:12,marginTop:8}}>
          {[["TCG",card.prices?.usd,T.green],["Foil",card.prices?.usd_foil,T.purple],["EUR",card.prices?.eur,T.blue],["MTGO",card.prices?.tix?""+card.prices.tix+" tix":null,"#E8C349"]].filter(([,v])=>v).map(([l,v,c])=>
            <span key={l} style={{fontSize:11,color:c,fontWeight:700,fontFamily:F.body}}>{l}: {l==="MTGO"?v:fmt(v)}</span>
          )}
        </div>
        {/* Purchase links */}
        {/* Price context */}
        {card.prices?.usd&&<div style={{textAlign:"center",marginTop:4,fontSize:10,fontFamily:F.body,color:T.textDim}}>
          {parseFloat(card.prices.usd)<1?"Budget-friendly":parseFloat(card.prices.usd)<5?"Affordable":parseFloat(card.prices.usd)<20?"Mid-range":parseFloat(card.prices.usd)<50?"Premium":"High-end"} {card.rarity&&`for ${card.rarity}`}
        </div>}
        {card.purchase_uris&&<div style={{display:"flex",gap:8,marginTop:6,justifyContent:"center"}}>
          {card.purchase_uris.tcgplayer&&<a href={card.purchase_uris.tcgplayer} target="_blank" rel="noopener" style={{fontSize:10,color:T.green,fontFamily:F.body,textDecoration:"underline"}}>TCGPlayer</a>}
          {card.purchase_uris.cardmarket&&<a href={card.purchase_uris.cardmarket} target="_blank" rel="noopener" style={{fontSize:10,color:T.blue,fontFamily:F.body,textDecoration:"underline"}}>Cardmarket</a>}
          {card.purchase_uris.cardhoarder&&<a href={card.purchase_uris.cardhoarder} target="_blank" rel="noopener" style={{fontSize:10,color:"#E8C349",fontFamily:F.body,textDecoration:"underline"}}>Cardhoarder</a>}
        </div>}
        {card.scryfall_uri&&<div style={{textAlign:"center",marginTop:4}}><a href={card.scryfall_uri} target="_blank" rel="noopener" style={{fontSize:10,color:T.textDim,fontFamily:F.body,textDecoration:"underline"}}>View on Scryfall</a></div>}
        <div style={{display:"flex",gap:6,marginTop:8,justifyContent:"center"}}>
          <button onClick={loadPrintings} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${T.cardBorder}`,background:showPrintings?T.goldGlow:"transparent",color:T.gold,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F.body}}>
            {showPrintings?"Hide":"Printings"}
          </button>
          {card.rulings_uri&&<button onClick={loadRulings} style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${T.cardBorder}`,background:showRulings?T.goldGlow:"transparent",color:T.textMuted,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F.body}}>
            {showRulings?"Hide":"Rulings"}
          </button>}
        </div>
        {showPrintings&&printings.length>0&&<div style={{marginTop:8,maxHeight:160,overflowY:"auto",background:T.cardInner,borderRadius:10,padding:6}}>
          {printings.map(p=><div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:6,marginBottom:2,background:p.id===card.id?T.goldGlow:"transparent"}}>
            <img src={getImg(p,"small")} alt={p.set_name} style={{width:28,height:39,borderRadius:3,objectFit:"cover"}}/>
            <div style={{flex:1,textAlign:"left",minWidth:0}}><div style={{fontSize:11,fontWeight:600,color:T.text}}>{p.set_name}</div><div style={{fontSize:10,color:T.textDim}}>{p.set?.toUpperCase()} {p.collector_number}</div></div>
            <span style={{fontSize:11,color:T.green,fontWeight:600,flexShrink:0}}>{fmt(p.prices?.usd)}</span>
          </div>)}
        </div>}
        {showRulings&&rulings.length>0&&<div style={{marginTop:8,maxHeight:180,overflowY:"auto",background:T.cardInner,borderRadius:10,padding:8}}>
          {rulings.map((r,i)=><div key={i} style={{padding:"6px 0",borderBottom:i<rulings.length-1?`1px solid ${T.cardBorder}`:"none"}}>
            <div style={{fontSize:11,color:T.text,lineHeight:1.5,fontFamily:F.body}}>{r.comment}</div>
            <div style={{fontSize:9,color:T.textDim,marginTop:2,fontFamily:F.body}}>{r.source} \u2022 {r.published_at}</div>
          </div>)}
        </div>}
        {showRulings&&rulings.length===0&&<div style={{marginTop:8,fontSize:11,color:T.textDim,fontFamily:F.body,textAlign:"center"}}>No rulings available</div>}
        {card.legalities&&<div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:8,justifyContent:"center"}}>
          {Object.entries(card.legalities).filter(([,v])=>v==="legal"||v==="banned"||v==="restricted").map(([f,v])=>
            <span key={f} style={{padding:"2px 6px",borderRadius:4,fontSize:9,fontWeight:600,textTransform:"uppercase",background:v==="legal"?"#0F2A1A":v==="banned"?"#2A0F0F":"#1A1A2A",color:v==="legal"?T.green:v==="banned"?T.red:"#E8C349"}}>{f}</span>
          )}
        </div>}
      </div>
    </div>
    {actions&&<div style={{padding:"12px 16px",flexShrink:0}}>{actions(card)}</div>}
    </div>{/* close zIndex:1 wrapper */}
  </div>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN APP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Card conditions & metadata options
const CONDITIONS = ["NM","LP","MP","HP","DMG"];
const LANGUAGES = ["en","ja","de","fr","it","es","pt","ko","zhs","zht","ru"];
const LANG_LABELS = {en:"English",ja:"Japanese",de:"German",fr:"French",it:"Italian",es:"Spanish",pt:"Portuguese",ko:"Korean",zhs:"S. Chinese",zht:"T. Chinese",ru:"Russian"};

export default function App() {
  const [tab,setTab]=useState("search");
  const [decks,setDecks]=useState([]);
  const [binders,setBinders]=useState([{id:"main",name:"Collection",cards:[]},{id:"wishlist",name:"Wishlist",type:"wishlist",cards:[]}]);
  const [activeBinder,setActiveBinder]=useState("main");
  const [ready,setReady]=useState(false);
  const {toasts,show:toast}=useToast();
  const [settings,setSettings]=useState({currency:"usd",defaultFormat:"commander"});
  const [showSettings,setShowSettings]=useState(false);
  const [showOnboarding,setShowOnboarding]=useState(false);
  const [isOffline,setIsOffline]=useState(!navigator.onLine);
  const [user,setUser]=useState(null);
  const [authMode,setAuthMode]=useState(null); // null=hidden, "signin", "signup"
  const [authLoading,setAuthLoading]=useState(false);
  const [authError,setAuthError]=useState("");
  const isOnline=useRef(!!user);isOnline.current=!!user;

  // Online/offline detector
  useEffect(()=>{
    const on=()=>setIsOffline(false);const off=()=>setIsOffline(true);
    window.addEventListener("online",on);window.addEventListener("offline",off);
    return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off)};
  },[]);

  // Auth state listener
  useEffect(()=>{
    if(!supabase)return;
    getSession().then(s=>{if(s?.user)setUser(s.user)});
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{
      setUser(session?.user||null);
    });
    return()=>subscription.unsubscribe();
  },[]);

  // Auth handlers
  const handleAuth=async(email,password,name)=>{
    setAuthLoading(true);setAuthError("");
    try{
      if(authMode==="signup"){
        const{error}=await signUp(email,password,name||email.split("@")[0]);
        if(error)throw error;
        toast("Account created! Check your email to verify.");
      }else{
        const{error}=await signIn(email,password);
        if(error)throw error;
        toast("Welcome back, Planeswalker!");
      }
      setAuthMode(null);
    }catch(e){setAuthError(e.message||"Authentication failed")}
    setAuthLoading(false);
  };
  const handleSignOut=async()=>{await signOut();setUser(null);toast("Signed out")};

  // Load settings
  useEffect(()=>{
    if(user){profileApi.get().then(({data})=>{if(data?.settings)setSettings(s=>({...s,...data.settings}))});}
    else{store.get("av-settings").then(s=>{if(s)setSettings(s);else setShowOnboarding(true)})}
  },[user]);
  useEffect(()=>{
    if(ready&&!user)store.set("av-settings",settings);
    if(user)profileApi.update({settings}).catch(()=>{});
  },[settings,ready,user]);

  // Load data: Supabase if logged in, IndexedDB if not
  useEffect(()=>{(async()=>{
    if(user){
      // Check for local data to merge on first login
      const localBinders=await store.get("av-binders");
      const localDecks=await store.get("av-decks");
      const hasLocalData=(localBinders&&localBinders.some(b=>b.cards?.length>0))||(localDecks&&localDecks.length>0);

      // Load from Supabase
      const{data:sBinds}=await bindersApi.list();
      if(sBinds&&sBinds.length){
        // Load cards for each binder
        const fullBinders=await Promise.all(sBinds.map(async b=>{
          const{data:cards}=await cardsApi.list(b.id);
          return{...b,cards:(cards||[]).map(c=>({...c,id:c.scryfall_id,image_uris:c.image_uris||{},prices:c.prices||{},legalities:c.legalities||{},color_identity:c.color_identity||[]}))};
        }));
        setBinders(fullBinders);
        if(fullBinders[0])setActiveBinder(fullBinders[0].id);
      }
      const{data:sDecks}=await decksApi.list();
      if(sDecks){
        const fullDecks=await Promise.all(sDecks.map(async d=>{
          const{data:cards}=await deckCardsApi.list(d.id);
          return{...d,cards:(cards||[]).map(c=>({...c,id:c.scryfall_id,board:c.board||"main",image_uris:c.image_uris||{},prices:c.prices||{},legalities:c.legalities||{},color_identity:c.color_identity||[]})),tags:d.tags||[],notes:d.notes||""};
        }));
        setDecks(fullDecks);
      }

      // Merge local data to cloud on first login (safe: verify before deleting, skip if already merged)
      const alreadyMerged=await store.get("av-merged");
      if(hasLocalData&&sBinds&&!alreadyMerged){
        let mergeSuccess=true;let mergedCards=0;let mergedDecks=0;
        const collBinder=sBinds.find(b=>b.binder_type==="collection");
        if(collBinder&&localBinders){
          for(const lb of localBinders){
            if(lb.cards?.length){
              for(const c of lb.cards){
                const{error}=await cardsApi.add(collBinder.id,{...c,id:c.scryfall_id||c.id},{condition:c.condition||"NM",foil:c.foil||false,language:c.language||"en",qty:c.qty||1});
                if(error)mergeSuccess=false;else mergedCards++;
              }
            }
          }
        }
        if(localDecks){
          for(const ld of localDecks){
            const{data:nd,error:dErr}=await decksApi.create(ld.name,ld.format,ld.tags||[]);
            if(dErr){mergeSuccess=false;continue;}
            mergedDecks++;
            if(nd&&ld.cards){for(const c of ld.cards){await deckCardsApi.add(nd.id,{...c,id:c.scryfall_id||c.id},c.board||"main")}}
          }
        }
        // Only clear local data if merge had no failures
        if(mergeSuccess){
          await store.set("av-binders",null);await store.set("av-decks",null);await store.set("av-merged",true);
          toast(`Synced ${mergedCards} cards and ${mergedDecks} decks to cloud!`);
        }else{
          if(mergedCards>0||mergedDecks>0)await store.set("av-merged",true); // partial merge, don't re-merge what succeeded
          toast(`Partial sync: ${mergedCards} cards, ${mergedDecks} decks. Local backup kept.`,"info");
        }
        // Reload from Supabase
        const{data:refreshedBinds}=await bindersApi.list();
        if(refreshedBinds){
          const rb=await Promise.all(refreshedBinds.map(async b=>{const{data:cards}=await cardsApi.list(b.id);return{...b,cards:(cards||[]).map(c=>({...c,id:c.scryfall_id,image_uris:c.image_uris||{},prices:c.prices||{},legalities:c.legalities||{},color_identity:c.color_identity||[]}))};}));
          setBinders(rb);if(rb[0])setActiveBinder(rb[0].id);
        }
        const{data:refreshedDecks}=await decksApi.list();
        if(refreshedDecks){
          const rd=await Promise.all(refreshedDecks.map(async d=>{const{data:cards}=await deckCardsApi.list(d.id);return{...d,cards:(cards||[]).map(c=>({...c,id:c.scryfall_id,board:c.board||"main",image_uris:c.image_uris||{},prices:c.prices||{},legalities:c.legalities||{},color_identity:c.color_identity||[]})),tags:d.tags||[],notes:d.notes||""};}));
          setDecks(rd);
        }
      }
    }else{
      // Load from IndexedDB (offline mode)
      const d=await store.get("av-decks");if(d)setDecks(d);
      const b=await store.get("av-binders");
      if(b){setBinders(b)}
      else{const oldColl=await store.get("av-coll");if(oldColl&&oldColl.length){setBinders([{id:"main",name:"Collection",cards:oldColl},{id:"wishlist",name:"Wishlist",type:"wishlist",cards:[]}])}}
    }
    setReady(true);
  })()},[user]);

  // Persist to IndexedDB when offline
  useEffect(()=>{if(ready&&!user)store.set("av-decks",decks)},[decks,ready,user]);
  useEffect(()=>{if(ready&&!user)store.set("av-binders",binders)},[binders,ready,user]);

  // Derived: flat collection of all cards across binders (for "you own" badges)
  const allCollCards=useMemo(()=>{const m=new Map();binders.forEach(b=>b.cards.forEach(c=>{const ex=m.get(c.id);if(ex)m.set(c.id,{...ex,qty:ex.qty+c.qty});else m.set(c.id,{...c})}));return m},[binders]);

  const addColl=useCallback(async(card,meta={})=>{
    // Optimistic local update
    setBinders(p=>p.map(b=>{
      if(b.id!==activeBinder)return b;
      const ex=b.cards.find(c=>c.id===card.id&&(c.condition||"NM")===(meta.condition||"NM")&&(c.foil||false)===(meta.foil||false));
      if(ex)return{...b,cards:b.cards.map(c=>c===ex?{...c,qty:c.qty+1}:c)};
      return{...b,cards:[...b.cards,{...card,qty:1,addedAt:Date.now(),condition:meta.condition||"NM",foil:meta.foil||false,language:meta.language||"en",...meta}]};
    }));
    const binderName=binders.find(b=>b.id===activeBinder)?.name||"collection";
    toast(`Added ${card.name} to ${binderName}`);
    // Persist to Supabase if logged in
    if(isOnline.current) enqueueWrite(()=>cardsApi.add(activeBinder,card,meta));
  },[activeBinder,binders,toast]);
  const addDeck=useCallback(async(did,card,board="main")=>{
    setDecks(p=>p.map(d=>{if(d.id!==did)return d;const ex=d.cards.find(c=>c.id===card.id&&c.board===board);if(ex)return{...d,cards:d.cards.map(c=>c===ex?{...c,qty:c.qty+1}:c)};return{...d,cards:[...d.cards,{...card,qty:1,board}]}}));
    if(isOnline.current) enqueueWrite(()=>deckCardsApi.add(did,card,board));
  },[]);

  const tabs=[{id:"search",icon:I.search,label:"Search"},{id:"vault",icon:I.vault,label:"Vault"},{id:"trade",icon:I.trade,label:"Trade"}];
  const hdr={search:["Search","Scry the Multiverse"],vault:["Vault","Decks & Collection"],trade:["Trade","Card Evaluator"]};

  const isOled=settings.theme==="oled";
  return <div style={{minHeight:"100vh",background:isOled?"#000":S.vignette,fontFamily:F.ui,color:T.text,display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto",position:"relative",animation:isOled?undefined:"blindEternities 20s ease-in-out infinite"}}>
    <ToastContainer toasts={toasts}/>
    {isOffline&&<div style={{background:"#2A1A0F",padding:"6px 16px",textAlign:"center",fontSize:11,color:"#E8C349",fontFamily:F.body,fontWeight:600,borderBottom:`1px solid #E8C34933`}}>You are offline \u2014 changes saved locally</div>}
    {/* Branded header with filigree */}
    <div style={{padding:"14px 18px 10px",flexShrink:0,background:`linear-gradient(180deg, ${T.surface} 0%, transparent 100%)`,borderBottom:"1px solid transparent",borderImage:S.filigree,borderImageSlice:1,display:"flex",alignItems:"center",gap:10}}>
      <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg, ${T.gold}, ${T.goldDark})`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:S.goldGlow,flexShrink:0}}>
        {I.sparkle("#0C0E14")}
      </div>
      <div style={{flex:1}}>
        <div style={{fontSize:17,fontWeight:700,color:T.accent,lineHeight:1.1,fontFamily:F.heading,letterSpacing:1.2,textTransform:"uppercase"}}>{hdr[tab][0]}</div>
        <div style={{fontSize:10,fontWeight:600,letterSpacing:2,color:T.textDim,textTransform:"uppercase",marginTop:1,fontFamily:F.body}}>{hdr[tab][1]}</div>
      </div>
      <button onClick={()=>setShowSettings(!showSettings)} style={{background:"none",border:"none",cursor:"pointer",padding:4}}>{I.gear(showSettings?T.gold:T.textDim)}</button>
      {user?<button onClick={handleSignOut} style={{background:"none",border:"none",cursor:"pointer",padding:4,display:"flex",alignItems:"center",gap:4}}>
        <div style={{width:26,height:26,borderRadius:13,background:`linear-gradient(135deg,${T.gold},${T.goldDark})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#000",fontFamily:F.heading}}>{(user.user_metadata?.display_name||user.email||"?")[0].toUpperCase()}</div>
      </button>
      :<button onClick={()=>setAuthMode("signin")} style={{padding:"5px 12px",borderRadius:4,border:`1px solid ${T.gold}`,background:"transparent",color:T.gold,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:F.body,flexShrink:0}}>Sign In</button>}
    </div>

    {/* Settings panel */}
    {showSettings&&<div style={{padding:"12px 18px",background:T.surface,borderBottom:`1px solid ${T.cardBorder}`}}>
      <div style={{fontSize:14,fontWeight:700,color:T.accent,marginBottom:10,fontFamily:F.heading}}>Settings</div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:T.textMuted,fontFamily:F.body}}>Currency
          <select value={settings.currency} onChange={e=>setSettings(p=>({...p,currency:e.target.value}))} style={{padding:"5px 8px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:11,fontFamily:F.body}}>
            <option value="usd">USD ($)</option><option value="eur">EUR (\u20ac)</option>
          </select>
        </label>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:T.textMuted,fontFamily:F.body}}>Default Format
          <select value={settings.defaultFormat} onChange={e=>setSettings(p=>({...p,defaultFormat:e.target.value}))} style={{padding:"5px 8px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:11,fontFamily:F.body}}>
            {Object.entries(FORMAT_RULES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:T.textMuted,fontFamily:F.body}}>Theme
          <select value={settings.theme||"dark"} onChange={e=>setSettings(p=>({...p,theme:e.target.value}))} style={{padding:"5px 8px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:11,fontFamily:F.body}}>
            <option value="dark">Dark</option><option value="oled">OLED Black</option>
          </select>
        </label>
      </div>
    </div>}

    {/* Auth modal */}
    {authMode&&<div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.9)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32}} onClick={()=>setAuthMode(null)}>
      <div onClick={e=>e.stopPropagation()} style={{background:T.surface,borderRadius:8,padding:28,maxWidth:340,width:"100%",border:`1px solid ${T.cardBorder}`,boxShadow:S.cardFrame}}>
        <div style={{fontSize:20,fontWeight:700,color:T.accent,fontFamily:F.heading,marginBottom:4,textAlign:"center"}}>{authMode==="signup"?"Create Account":"Welcome Back"}</div>
        <div style={{fontSize:11,color:T.textDim,textAlign:"center",marginBottom:16,fontFamily:F.body}}>{authMode==="signup"?"Join the Multiverse":"Enter the Vault"}</div>
        {authError&&<div style={{padding:"8px 12px",borderRadius:4,background:"#2A0F0Faa",color:T.red,fontSize:11,marginBottom:12,fontFamily:F.body}}>{authError}</div>}
        <form onSubmit={e=>{e.preventDefault();const fd=new FormData(e.target);handleAuth(fd.get("email"),fd.get("password"),fd.get("name"))}}>
          {authMode==="signup"&&<input name="name" placeholder="Display name" style={{width:"100%",padding:"12px 14px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:14,marginBottom:8,boxSizing:"border-box",fontFamily:F.body,boxShadow:S.insetInput}}/>}
          <input name="email" type="email" placeholder="Email" required style={{width:"100%",padding:"12px 14px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:14,marginBottom:8,boxSizing:"border-box",fontFamily:F.body,boxShadow:S.insetInput}}/>
          <input name="password" type="password" placeholder="Password" required minLength={6} style={{width:"100%",padding:"12px 14px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:14,marginBottom:14,boxSizing:"border-box",fontFamily:F.body,boxShadow:S.insetInput}}/>
          <button type="submit" disabled={authLoading} style={{width:"100%",padding:14,borderRadius:4,border:"none",background:`linear-gradient(135deg,${T.gold},${T.goldDark})`,color:"#000",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:F.body,boxShadow:S.goldGlow,opacity:authLoading?.6:1}}>
            {authLoading?"Loading...":authMode==="signup"?"Create Account":"Sign In"}
          </button>
        </form>
        <div style={{textAlign:"center",marginTop:12}}>
          <button onClick={()=>{setAuthMode(authMode==="signup"?"signin":"signup");setAuthError("")}} style={{background:"none",border:"none",color:T.gold,fontSize:12,cursor:"pointer",fontFamily:F.body,textDecoration:"underline"}}>
            {authMode==="signup"?"Already have an account? Sign in":"Don't have an account? Sign up"}
          </button>
        </div>
        <button onClick={()=>setAuthMode(null)} style={{display:"block",margin:"10px auto 0",background:"none",border:"none",color:T.textDim,fontSize:11,cursor:"pointer",fontFamily:F.body}}>Continue without account</button>
      </div>
    </div>}

    {/* Onboarding overlay */}
    {showOnboarding&&<div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.9)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32,textAlign:"center"}}>
      <div style={{width:48,height:48,borderRadius:12,background:`linear-gradient(135deg,${T.gold},${T.goldDark})`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:S.goldGlow,marginBottom:20}}>{I.sparkle("#0C0E14")}</div>
      <div style={{fontSize:24,fontWeight:900,color:T.accent,fontFamily:F.heading,letterSpacing:1,marginBottom:6}}>ARCANE VAULT</div>
      <div style={{fontSize:12,color:T.textMuted,fontFamily:F.body,marginBottom:24}}>Your MTG Companion</div>
      <div style={{display:"flex",flexDirection:"column",gap:12,maxWidth:280,width:"100%",marginBottom:24}}>
        {[["Search","Find any card ever printed. Filter by color, type, set, rarity, or oracle text.",I.search],["Vault","Build decks, manage your collection across multiple binders, track value.",I.vault],["Trade","Evaluate trades in real-time with card images and price balance.",I.trade]].map(([t,d,ic])=>
          <div key={t} style={{display:"flex",gap:10,alignItems:"flex-start",textAlign:"left"}}>
            <span style={{flexShrink:0,marginTop:2}}>{ic(T.gold)}</span>
            <div><div style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:F.body}}>{t}</div><div style={{fontSize:11,color:T.textDim,fontFamily:F.body,lineHeight:1.4}}>{d}</div></div>
          </div>
        )}
      </div>
      <button onClick={()=>{setShowOnboarding(false);store.set("av-settings",settings)}} style={{padding:"14px 40px",borderRadius:4,border:"none",background:`linear-gradient(135deg,${T.gold},${T.goldDark})`,color:"#000",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:F.body,boxShadow:S.goldGlow}}>Enter the Vault</button>
    </div>}

    <div style={{flex:1,overflowY:"auto",paddingBottom:72}}>
      <div key={tab} style={{animation:"fadeSlideIn .25s ease-out"}}>
      {tab==="search"&&<SearchView addColl={addColl} addDeck={addDeck} decks={decks} toast={toast} allCollCards={allCollCards}/>}
      {tab==="vault"&&<VaultView decks={decks} setDecks={setDecks} addDeck={addDeck} binders={binders} setBinders={setBinders} activeBinder={activeBinder} setActiveBinder={setActiveBinder} toast={toast} allCollCards={allCollCards}/>}
      {tab==="trade"&&<TradeView toast={toast}/>}
      </div>
    </div>

    {/* Nav with filigree top border */}
    <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"linear-gradient(0deg, #0A0C12 0%, rgba(12,14,20,.97) 100%)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderTop:"1px solid transparent",borderImage:S.filFaint,borderImageSlice:1,display:"flex",padding:"8px 0 env(safe-area-inset-bottom,8px)",zIndex:100}}>
      {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:"none",border:"none",cursor:"pointer",padding:"4px 0",transition:"all .15s",position:"relative"}}>
        {tab===t.id&&<div style={{position:"absolute",top:-6,left:"15%",right:"15%",height:12,background:`radial-gradient(ellipse at 50% 100%, ${T.gold}88 0%, transparent 70%)`,filter:"blur(4px)",opacity:.6}}/>}
        <span style={{lineHeight:0}}>{t.icon(tab===t.id?T.gold:T.textDim)}</span>
        <span style={{fontSize:10,fontWeight:tab===t.id?700:500,letterSpacing:.5,color:tab===t.id?T.gold:T.textDim,fontFamily:F.body}}>{t.label}</span>
      </button>)}
    </div>
  </div>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEARCH (with Card of the Day)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SearchView({addColl,addDeck,decks,toast,allCollCards}) {
  const [q,setQ]=useState("");const [colors,setColors]=useState([]);const [type,setType]=useState("");
  const [set,setSet]=useState("");const [sets,setSets]=useState([]);
  const [rarity,setRarity]=useState("");const [cmcOp,setCmcOp]=useState("");
  const [oText,setOText]=useState("");const [showAdv,setShowAdv]=useState(false);
  const [results,setResults]=useState([]);const [total,setTotal]=useState(0);const [loading,setLoading]=useState(false);
  const [slideIdx,setSlideIdx]=useState(-1);const [showAdd,setShowAdd]=useState(false);
  const [scanning,setScanning]=useState(false);const [scanStatus,setScanStatus]=useState("");const [scanPreview,setScanPreview]=useState(null);
  const [browseSet,setBrowseSet]=useState(null);const [setCards,setSetCards]=useState([]);const [sLoading,setSLoading]=useState(false);
  const [nextPage,setNextPage]=useState(null);const [loadingMore,setLoadingMore]=useState(false);
  const [cotd,setCotd]=useState(null);
  const [autocomplete,setAutocomplete]=useState([]);const [acFocused,setAcFocused]=useState(false);
  const [showBurst,setShowBurst]=useState(false);
  const fileRef=useRef();

  useEffect(()=>{fetchSets().then(setSets);fetchRandomCard().then(setCotd)},[]);
  // Autocomplete
  const dQAc=useDebounce(q,200);
  useEffect(()=>{if(dQAc.length>=2&&acFocused)fetchAutocomplete(dQAc).then(setAutocomplete);else setAutocomplete([])},[dQAc,acFocused]);
  const dQ=useDebounce(q,350),dC=useDebounce(colors,350),dT=useDebounce(type,350),dS=useDebounce(set,350);
  const dR=useDebounce(rarity,350),dCmc=useDebounce(cmcOp,350),dOT=useDebounce(oText,350);

  useEffect(()=>{
    let cancelled=false;const has=dQ||dC.length||dT||dS||dR||dCmc||dOT;
    if(!has){setResults([]);setTotal(0);return;}
    setLoading(true);
    searchScryfall(dQ,dC,dT,dS,{rarity:dR,cmc:dCmc,oracle:dOT}).then(res=>{if(!cancelled){setResults(res.data);setTotal(res.total);setNextPage(res.nextPage);setLoading(false)}});
    return()=>{cancelled=true};
  },[dQ,dC,dT,dS,dR,dCmc,dOT]);

  const hasQuery=q||colors.length||type||set||rarity||cmcOp||oText;

  const handleScan=async(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    const blobUrl=URL.createObjectURL(file);
    setScanPreview(blobUrl);setScanning(true);setScanStatus("Loading OCR engine...");
    try{
      setScanStatus("Scanning card text...");
      const name=await scanCardImage(file);
      if(name){setQ(name);setScanStatus(`Found: "${name}"`);setTimeout(()=>{setScanning(false);setScanPreview(null);URL.revokeObjectURL(blobUrl)},1200)}
      else{setScanStatus("Could not read card name. Try better lighting.");setTimeout(()=>{setScanning(false);setScanPreview(null);URL.revokeObjectURL(blobUrl)},2500)}
    }catch(err){
      const msg=err?.message?.includes("timeout")?"Scan timed out. Try a clearer photo.":"Scan failed. Try again with better lighting.";
      setScanStatus(msg);setTimeout(()=>{setScanning(false);setScanPreview(null);URL.revokeObjectURL(blobUrl)},2500);
    }
    if(fileRef.current)fileRef.current.value="";
  };

  return <div style={{padding:"0 16px"}}>
    {scanning&&<div style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,.9)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:32}}>
      {scanPreview&&<img src={scanPreview} alt="scan" style={{maxWidth:"70%",maxHeight:"40vh",borderRadius:12,border:`2px solid ${T.gold}`}}/>}
      <div style={{fontSize:15,color:T.gold,fontWeight:600,fontFamily:F.body}}>{scanStatus}</div>
      <div style={{width:120,height:3,borderRadius:2,background:T.cardBorder,overflow:"hidden"}}><div style={{width:"70%",height:"100%",background:T.gold,borderRadius:2,animation:"pulse 1s ease-in-out infinite alternate"}}/></div>
      <div style={{display:"flex",gap:10,marginTop:8}}>
        <button onClick={()=>fileRef.current?.click()} style={{padding:"10px 20px",borderRadius:4,border:`1.5px solid ${T.gold}`,background:"transparent",color:T.gold,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:F.body}}>Retry</button>
        <button onClick={()=>{setScanning(false);setScanPreview(null)}} style={{padding:"10px 20px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.textDim,fontSize:12,cursor:"pointer",fontFamily:F.body}}>Cancel</button>
      </div>
    </div>}

    <div style={{position:"sticky",top:0,background:T.bg,paddingTop:12,paddingBottom:8,zIndex:10}}>
      <div style={{display:"flex",gap:8}}>
        <div style={{position:"relative",flex:1}}>
          <input aria-label="Search cards" value={q} onChange={e=>setQ(e.target.value)} onFocus={()=>setAcFocused(true)} onBlur={()=>setTimeout(()=>setAcFocused(false),200)} placeholder="Name a spell... (try o:draw or t:angel)" style={{width:"100%",padding:"14px 16px 14px 42px",borderRadius:14,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:16,outline:"none",boxSizing:"border-box",fontFamily:F.body,boxShadow:S.insetInput}}/>
          <span style={{position:"absolute",left:14,top:14,opacity:.4}}>{I.search(T.textDim)}</span>
          {autocomplete.length>0&&acFocused&&<div style={{position:"absolute",top:"100%",left:0,right:0,marginTop:4,background:T.surface,border:`1px solid ${T.cardBorder}`,borderRadius:8,overflow:"hidden",zIndex:20,boxShadow:"0 8px 24px rgba(0,0,0,.5)",maxHeight:200,overflowY:"auto"}}>
            {autocomplete.slice(0,8).map(name=><div key={name} onMouseDown={()=>{setQ(name);setAutocomplete([])}} style={{padding:"10px 14px",cursor:"pointer",fontSize:13,color:T.text,fontFamily:F.body,borderBottom:`1px solid ${T.cardBorder}`}}>{name}</div>)}
          </div>}
        </div>
        <button onClick={()=>fileRef.current?.click()} style={{width:52,height:52,borderRadius:14,border:`2px solid ${T.gold}`,background:T.cardInner,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:S.goldGlow}} title="Divine a card">{I.camera(T.gold)}</button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleScan} style={{display:"none"}}/>
      </div>
      <div style={{display:"flex",gap:6,marginTop:8,overflowX:"auto",paddingBottom:4,alignItems:"center"}}>
        <ColorPills colors={colors} setColors={setColors}/>
        <TypeSelect type={type} setType={setType}/>
        <select value={set} onChange={e=>{setSet(e.target.value);if(e.target.value){setBrowseSet(null)}}} style={{padding:"0 10px",borderRadius:18,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.textMuted,fontSize:11,cursor:"pointer",flexShrink:0,appearance:"none",minWidth:72,height:34,textAlign:"center"}}><option value="">All sets</option>{sets.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}</select>
        {set&&<button onClick={async()=>{if(browseSet===set){setBrowseSet(null);return;}setBrowseSet(set);setSLoading(true);const c=await fetchSetCards(set);setSetCards(c);setSLoading(false)}} style={{padding:"0 10px",borderRadius:18,border:`1px solid ${browseSet?T.gold:T.cardBorder}`,background:browseSet?T.goldGlow:"transparent",color:browseSet?T.gold:T.textDim,fontSize:10,cursor:"pointer",flexShrink:0,height:34,fontFamily:F.body}}>{sLoading?"...":"Checklist"}</button>}
        {hasQuery&&<button onClick={()=>{setQ("");setColors([]);setType("");setSet("");setRarity("");setCmcOp("");setOText("");setShowAdv(false)}} style={{padding:"0 10px",borderRadius:18,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.textDim,fontSize:10,cursor:"pointer",flexShrink:0,height:34,fontFamily:F.body}}>Clear</button>}
        <button onClick={()=>setShowAdv(!showAdv)} style={{padding:"0 10px",borderRadius:18,border:`1px solid ${showAdv||(rarity||cmcOp||oText)?T.gold+"66":T.cardBorder}`,background:showAdv?T.goldGlow:"transparent",color:showAdv||rarity||cmcOp||oText?T.gold:T.textDim,fontSize:10,cursor:"pointer",flexShrink:0,height:34,fontFamily:F.body}}>More</button>
      </div>
      {showAdv&&<div style={{display:"flex",gap:6,marginTop:6,overflowX:"auto",alignItems:"center",paddingBottom:4}}>
        <select value={rarity} onChange={e=>setRarity(e.target.value)} style={{padding:"0 8px",borderRadius:18,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.textMuted,fontSize:11,cursor:"pointer",flexShrink:0,appearance:"none",minWidth:68,height:30,textAlign:"center"}}><option value="">Rarity</option><option value="common">Common</option><option value="uncommon">Uncommon</option><option value="rare">Rare</option><option value="mythic">Mythic</option></select>
        <select value={cmcOp} onChange={e=>setCmcOp(e.target.value)} style={{padding:"0 8px",borderRadius:18,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.textMuted,fontSize:11,cursor:"pointer",flexShrink:0,appearance:"none",minWidth:52,height:30,textAlign:"center"}}><option value="">MV</option>{[0,1,2,3,4,5,6,7].map(n=><option key={n} value={`=${n}`}>{n}</option>)}<option value=">=8">8+</option></select>
        <input value={oText} onChange={e=>setOText(e.target.value)} placeholder="Oracle text..." style={{flex:1,padding:"0 10px",borderRadius:18,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:11,height:30,minWidth:80,fontFamily:F.body,boxSizing:"border-box"}}/>
      </div>}
      <div style={{fontSize:12,color:T.textDim,marginTop:4,fontFamily:F.body}}>
        {loading?loadPhrase():hasQuery?`${total.toLocaleString()} cards found (showing ${results.length})`:""}
      </div>
    </div>

    {/* Set Completion Tracker */}
    {browseSet&&setCards.length>0&&<div style={{background:T.card,borderRadius:4,border:`1px solid ${T.cardBorder}`,padding:12,marginBottom:12,boxShadow:S.cardFrame}}>
      {(()=>{
        const owned=setCards.filter(c=>allCollCards.has(c.id));
        const pct=setCards.length?Math.round((owned.length/setCards.length)*100):0;
        const byRarity={mythic:[],rare:[],uncommon:[],common:[]};
        setCards.forEach(c=>{const r=c.rarity||"common";if(byRarity[r])byRarity[r].push(c)});
        return <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <div style={{fontSize:14,fontWeight:700,color:T.accent,fontFamily:F.heading}}>{sets.find(s=>s.code===browseSet)?.name||browseSet.toUpperCase()}</div>
            <button onClick={()=>setBrowseSet(null)} style={{background:"none",border:"none",cursor:"pointer",padding:4}}>{I.close(T.textDim)}</button>
          </div>
          <div style={{display:"flex",gap:12,marginBottom:10,alignItems:"center"}}>
            <div style={{fontSize:28,fontWeight:900,color:pct===100?T.green:T.accent,fontFamily:F.heading}}>{pct}%</div>
            <div style={{flex:1}}>
              <div style={{fontSize:11,color:T.textMuted,fontFamily:F.body,marginBottom:4}}>{owned.length} / {setCards.length} cards collected</div>
              <div style={{height:6,borderRadius:3,background:T.cardInner,overflow:"hidden"}}>
                <div style={{width:`${pct}%`,height:"100%",borderRadius:3,background:pct===100?T.green:`linear-gradient(90deg,${T.gold},${T.goldDark})`,transition:"width .3s"}}/>
              </div>
            </div>
          </div>
          {/* Rarity breakdown */}
          <div style={{display:"flex",gap:6,marginBottom:8}}>
            {[["mythic",T.mythicOrange],["rare","#E8C349"],["uncommon","#B8C4D0"],["common",T.textDim]].map(([r,c])=>{
              const total=byRarity[r]?.length||0;const own=byRarity[r]?.filter(cd=>allCollCards.has(cd.id)).length||0;
              return total>0&&<div key={r} style={{fontSize:10,color:c,fontFamily:F.body}}>{r[0].toUpperCase()}: {own}/{total}</div>;
            })}
          </div>
          {/* Missing cards list */}
          <div style={{maxHeight:200,overflowY:"auto"}}>
            <div style={{fontSize:10,color:T.textMuted,fontFamily:F.body,marginBottom:4,fontWeight:600}}>Missing Cards:</div>
            {setCards.filter(c=>!allCollCards.has(c.id)).map(c=>(
              <div key={c.id} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",fontSize:11,color:T.text,fontFamily:F.body}}>
                <span style={{color:RARITY_CLR[c.rarity]||T.textDim,fontWeight:700,width:14,textAlign:"center"}}>{(c.rarity||"c")[0].toUpperCase()}</span>
                <span>{c.collector_number}</span>
                <span style={{flex:1}}>{c.name}</span>
                <span style={{color:T.green,fontSize:10}}>{fmt(c.prices?.usd)}</span>
              </div>
            ))}
            {setCards.filter(c=>!allCollCards.has(c.id)).length===0&&<div style={{fontSize:12,color:T.green,fontFamily:F.body,textAlign:"center",padding:8}}>Set complete!</div>}
          </div>
        </>;
      })()}
    </div>}

    {loading&&results.length===0&&<SkeletonGrid count={6}/>}

    {(!loading||results.length>0)&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,paddingTop:4,paddingBottom:16}}>
      {results.map((card,i)=>{const rc=RARITY_CLR[card.rarity]||RARITY_CLR.common;return(
        <div key={card.id} onClick={()=>{setSlideIdx(i);setShowAdd(false)}} style={{borderRadius:4,overflow:"hidden",background:T.card,border:`1px solid ${T.cardBorder}`,cursor:"pointer",boxShadow:card.rarity==="mythic"?`inset 0 0 0 1px #F0683444, 0 0 12px #F0683422, 0 2px 8px rgba(0,0,0,.4)`:card.rarity==="rare"?`0 0 0 1px #E8C34944, 0 2px 8px #E8C34933`:S.cardFrame,backgroundImage:S.texture,borderTop:`2px solid ${card.rarity!=="common"?rc:T.cardBorder}`,animation:card.rarity==="mythic"?"mythicPulse 2.5s ease-in-out infinite":undefined,transition:"transform .15s",WebkitTapHighlightColor:"transparent"}}>
          <img src={getImg(card)} alt={card.name} loading="lazy" style={{width:"100%",display:"block"}}/>
          <div style={{padding:"8px 10px 10px"}}>
            <div style={{fontSize:13,fontWeight:700,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:F.body}}>{card.name}</div>
            <div style={{fontSize:10,color:T.textDim,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:F.body}}>{card.set_name}</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
              <Cost c={card.mana_cost} sz={14}/>
              <span style={{fontSize:12,fontWeight:600,color:T.green,fontFamily:F.body}}>{fmt(card.prices?.usd)}</span>
            </div>
          </div>
        </div>
      );})}
    </div>}

    {/* Load More pagination */}
    {nextPage&&!loading&&results.length>0&&<div style={{textAlign:"center",padding:"12px 0 20px"}}>
      <button onClick={async()=>{setLoadingMore(true);const res=await fetchNextPage(nextPage);setResults(p=>[...p,...res.data]);setNextPage(res.nextPage);setLoadingMore(false)}} disabled={loadingMore} style={{padding:"12px 32px",borderRadius:4,border:`1.5px solid ${T.gold}`,background:"transparent",color:T.gold,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F.body,opacity:loadingMore?.5:1}}>
        {loadingMore?"Loading...":"Load More Cards"}
      </button>
    </div>}

    {/* Card of the Day — empty state */}
    {!hasQuery&&!loading&&<div style={{textAlign:"center",padding:"32px 20px",color:T.textDim,position:"relative",overflow:"hidden"}}>
      {/* Floating ambient particles */}
      {[0,1,2].map(i=><div key={i} style={{position:"absolute",width:100+i*40,height:100+i*40,borderRadius:"50%",background:`radial-gradient(circle, ${T.gold}22, transparent)`,animation:`float ${7+i*2}s ease-in-out infinite`,animationDelay:`${i*2.5}s`,top:`${10+i*25}%`,left:`${10+i*30}%`,pointerEvents:"none"}}/>)}
      <div style={{position:"relative",fontSize:26,fontWeight:900,color:T.accent,fontFamily:F.heading,letterSpacing:2.5,marginBottom:6,textTransform:"uppercase",textShadow:GLOW}}>The Blind Eternities Await</div>
      <div style={{fontSize:13,color:T.textMuted,fontFamily:F.body,marginBottom:20}}>Name a spell, choose your colors, or divine a card by sight</div>
      {cotd&&<div style={{position:"relative",overflow:"hidden",background:T.card,borderRadius:4,border:`1px solid ${T.cardBorder}`,boxShadow:S.cardFrame,padding:16,textAlign:"center"}}>
        <ArtBg src={getImg(cotd)} opacity={.12} blur={30}/>
        <div style={{position:"relative",fontSize:10,color:T.gold,fontWeight:700,textTransform:"uppercase",letterSpacing:2,marginBottom:10,fontFamily:F.heading}}>Card of the Day</div>
        <div style={{position:"relative",display:"inline-block",maxWidth:"65%",marginBottom:10}}>
          <img src={getImg(cotd)} alt={cotd.name} style={{width:"100%",borderRadius:10,display:"block"}}/>
          <div style={{position:"absolute",inset:0,borderRadius:10,background:"linear-gradient(105deg, transparent 40%, rgba(255,219,112,.12) 45%, rgba(132,204,255,.08) 50%, rgba(255,112,253,.06) 55%, transparent 60%)",backgroundSize:"200% 200%",animation:"foilSweep 3s ease-in-out infinite",mixBlendMode:"screen",pointerEvents:"none"}}/>
        </div>
        <div style={{position:"relative",background:"rgba(12,14,20,.85)",borderRadius:8,padding:"10px 14px",marginTop:4}}>
          <div style={{fontSize:16,fontWeight:700,color:T.accent,fontFamily:F.heading}}>{cotd.name}</div>
          {cotd.flavor_text&&<div style={{fontSize:12,color:T.textMuted,fontStyle:"italic",marginTop:6,lineHeight:1.6,fontFamily:F.body}}>"{cotd.flavor_text}"</div>}
        </div>
      </div>}
      {!cotd&&<div style={{fontSize:12,color:T.textDim,fontStyle:"italic",lineHeight:1.5,fontFamily:F.body}}>{randomFlavor("search")}</div>}
    </div>}

    {hasQuery&&!loading&&results.length===0&&<div style={{textAlign:"center",padding:"60px 20px",color:T.textDim}}>
      <div style={{fontSize:15,fontFamily:F.body}}>The spell fizzles \u2014 no cards found</div>
    </div>}

    {slideIdx>=0&&results[slideIdx]&&<CardSlider cards={results} index={slideIdx} onIndexChange={setSlideIdx} onClose={()=>setSlideIdx(-1)}
      actions={(card)=><div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>{addColl(card);setShowBurst(true);setTimeout(()=>{setShowBurst(false);setSlideIdx(-1)},400)}} style={{flex:1,padding:14,borderRadius:12,border:"none",background:`linear-gradient(135deg,${T.gold},${T.goldDark})`,color:"#000",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:F.body,boxShadow:S.goldGlow}}>+ Collection</button>
          <button onClick={()=>setShowAdd(!showAdd)} style={{flex:1,padding:14,borderRadius:12,border:`2px solid ${T.gold}`,background:"transparent",color:T.gold,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:F.body}}>+ Deck</button>
        </div>
        {showAdd&&decks.length>0&&<div style={{marginTop:8}}>{decks.map(d=>
          <button key={d.id} onClick={()=>{addDeck(d.id,card);toast(`Added ${card.name} to ${d.name}`);setSlideIdx(-1);setShowAdd(false)}} style={{display:"block",width:"100%",padding:"12px 14px",marginBottom:4,borderRadius:10,border:`1px solid ${T.cardBorder}`,background:T.card,color:T.text,fontSize:13,cursor:"pointer",textAlign:"left",fontFamily:F.body}}>{d.name} <span style={{color:T.textDim,fontSize:11}}>({d.format})</span></button>
        )}</div>}
        {showAdd&&decks.length===0&&<div style={{padding:12,color:T.textDim,fontSize:12,textAlign:"center",fontFamily:F.body}}>Create a deck first in the Vault</div>}
      </div>}
    />}

    {/* Collect burst */}
    {showBurst&&<div style={{position:"fixed",inset:0,zIndex:600,pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:200,height:200,borderRadius:"50%",background:`radial-gradient(circle, ${T.gold}66, transparent 70%)`,animation:"collectBurst .5s ease-out forwards"}}/>
    </div>}
  </div>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VAULT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function VaultView({decks,setDecks,addDeck,binders,setBinders,activeBinder,setActiveBinder,toast,allCollCards}) {
  const [subTab,setSubTab]=useState("decks");const [activeDeck,setActiveDeck]=useState(null);
  const coll=useMemo(()=>(binders.find(b=>b.id===activeBinder)?.cards||[]),[binders,activeBinder]);
  const setColl=useCallback((fn)=>setBinders(p=>p.map(b=>b.id===activeBinder?{...b,cards:typeof fn==="function"?fn(b.cards):fn}:b)),[activeBinder,setBinders]);

  // Vault Stats (all binders combined)
  const vaultStats=useMemo(()=>{
    const all=[];binders.forEach(b=>all.push(...b.cards));
    const totalCards=all.reduce((a,c)=>a+c.qty,0);
    const totalValue=all.reduce((a,c)=>a+(parseFloat(c.foil?c.prices?.usd_foil:c.prices?.usd||0)*c.qty),0);
    const uniqueCards=all.length;
    const sets=new Set(all.map(c=>c.set).filter(Boolean));
    const colorCounts={W:0,U:0,B:0,R:0,G:0};
    all.forEach(c=>(c.color_identity||[]).forEach(ci=>{if(colorCounts[ci]!==undefined)colorCounts[ci]+=c.qty}));
    const topColor=Object.entries(colorCounts).sort((a,b)=>b[1]-a[1])[0];
    const priciest=all.length?[...all].sort((a,b)=>(parseFloat(b.prices?.usd||0))-(parseFloat(a.prices?.usd||0)))[0]:null;
    const foilCount=all.filter(c=>c.foil).reduce((a,c)=>a+c.qty,0);
    return{totalCards,totalValue,uniqueCards,sets:sets.size,colorCounts,topColor,priciest,foilCount,deckCount:decks.length,binderCount:binders.length};
  },[binders,decks]);

  if(activeDeck) return <DeckEditor deckId={activeDeck} decks={decks} setDecks={setDecks} addDeck={addDeck} onBack={()=>setActiveDeck(null)} toast={toast} coll={coll} allCollCards={allCollCards}/>;

  const vs=vaultStats;
  const totalClrsV=Object.values(vs.colorCounts).reduce((a,b)=>a+b,0)||1;

  return <div style={{padding:16}}>
    {/* Vault Stats overview */}
    {subTab==="stats"&&<div style={{marginBottom:16}}>
      <h2 style={{margin:"0 0 12px",fontSize:20,fontWeight:700,color:T.accent,fontFamily:F.heading}}>Your Vault</h2>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        {[["Total Cards",vs.totalCards,T.text],["Vault Value","$"+vs.totalValue.toFixed(2),T.green],["Unique Cards",vs.uniqueCards,T.text],["Sets Owned",vs.sets,T.text],[`${vs.deckCount} Decks`,`${vs.binderCount} Binders`,T.textMuted],["Foil Cards",vs.foilCount,T.purple]].map(([l,v,c],i)=>
          <div key={i} style={{background:T.card,borderRadius:4,border:`1px solid ${T.cardBorder}`,padding:12,textAlign:"center",boxShadow:S.cardFrame,backgroundImage:S.texture}}>
            <div style={{fontSize:9,color:T.textDim,textTransform:"uppercase",letterSpacing:.5,fontFamily:F.body}}>{l}</div>
            <div style={{fontSize:18,fontWeight:800,color:c,marginTop:2,fontFamily:F.heading}}>{v}</div>
          </div>
        )}
      </div>
      {/* Color identity breakdown */}
      {totalClrsV>1&&<div style={{background:T.card,borderRadius:4,border:`1px solid ${T.cardBorder}`,padding:14,marginBottom:12,boxShadow:S.cardFrame}}>
        <div style={{fontSize:10,color:T.textMuted,marginBottom:8,fontWeight:600,textTransform:"uppercase",letterSpacing:.5,fontFamily:F.body}}>Your Color Identity</div>
        <div style={{display:"flex",gap:0,height:10,borderRadius:5,overflow:"hidden",marginBottom:8}}>
          {Object.entries(vs.colorCounts).filter(([,n])=>n>0).map(([c,n])=><div key={c} style={{width:`${(n/totalClrsV)*100}%`,background:MCLR[c],height:"100%"}}/>)}
        </div>
        <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
          {Object.entries(vs.colorCounts).filter(([,n])=>n>0).map(([c,n])=><div key={c} style={{display:"flex",alignItems:"center",gap:4}}><Pip s={c} sz={18}/><span style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:F.body}}>{n}</span></div>)}
        </div>
        {vs.topColor&&vs.topColor[1]>0&&<div style={{textAlign:"center",marginTop:8,fontSize:12,color:T.textMuted,fontFamily:F.body,fontStyle:"italic"}}>You are primarily a <span style={{color:MCLR[vs.topColor[0]],fontWeight:700}}>{{W:"White",U:"Blue",B:"Black",R:"Red",G:"Green"}[vs.topColor[0]]}</span> mage</div>}
      </div>}
      {/* Priciest card */}
      {vs.priciest&&<div style={{position:"relative",overflow:"hidden",background:T.card,borderRadius:4,border:`1px solid ${T.cardBorder}`,padding:14,boxShadow:S.cardFrame}}>
        <ArtBg src={getImg(vs.priciest)} opacity={.12} blur={24}/>
        <div style={{position:"relative"}}>
          <div style={{fontSize:10,color:T.gold,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:8,fontFamily:F.heading}}>Most Valuable Card</div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <img src={getImg(vs.priciest,"small")} alt={vs.priciest.name} style={{width:48,height:67,borderRadius:4,objectFit:"cover"}}/>
            <div>
              <div style={{fontSize:16,fontWeight:700,color:T.accent,fontFamily:F.heading}}>{vs.priciest.name}</div>
              <div style={{fontSize:12,color:T.textDim,fontFamily:F.body}}>{vs.priciest.set_name}</div>
              <div style={{fontSize:18,fontWeight:800,color:T.green,fontFamily:F.heading,marginTop:2}}>{fmt(vs.priciest.prices?.usd)}</div>
            </div>
          </div>
        </div>
      </div>}
      {/* Duplicate detection */}
      {(()=>{
        const dupes=new Map();
        binders.forEach(b=>b.cards.forEach(c=>{const k=c.name||c.scryfall_id;if(!dupes.has(k))dupes.set(k,[]);dupes.get(k).push(b.name)}));
        const realDupes=[...dupes.entries()].filter(([,bs])=>bs.length>1).slice(0,5);
        return realDupes.length>0&&<div style={{background:T.card,borderRadius:4,border:`1px solid ${T.cardBorder}`,padding:12,marginTop:12,boxShadow:S.cardFrame}}>
          <div style={{fontSize:10,color:"#E8C349",fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:6,fontFamily:F.heading}}>Cards in Multiple Binders</div>
          {realDupes.map(([name,bs])=><div key={name} style={{fontSize:11,color:T.textMuted,fontFamily:F.body,marginBottom:2}}>{name} \u2014 <span style={{color:T.textDim}}>{[...new Set(bs)].join(", ")}</span></div>)}
        </div>;
      })()}
    </div>}

    <div style={{display:"flex",gap:0,background:T.card,borderRadius:4,padding:3,marginBottom:16,border:`1px solid ${T.cardBorder}`,boxShadow:S.cardFrame}}>
      {[["stats","Overview",I.sparkle],["decks","Decks",I.deck],["binder","Collection",I.binder]].map(([id,label,icon])=>
        <button key={id} onClick={()=>setSubTab(id)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:10,borderRadius:3,border:"none",cursor:"pointer",transition:"all .15s",background:subTab===id?`linear-gradient(135deg,${T.gold},${T.goldDark})`:"transparent",color:subTab===id?"#000":T.textDim,fontSize:13,fontWeight:subTab===id?700:500,fontFamily:F.body}}>{icon(subTab===id?"#000":T.textDim)}{label}</button>
      )}
    </div>
    {subTab==="decks"&&<DecksList decks={decks} setDecks={setDecks} onOpen={setActiveDeck} toast={toast}/>}
    {subTab==="binder"&&<BinderView coll={coll} setColl={setColl} toast={toast} binders={binders} setBinders={setBinders} activeBinder={activeBinder} setActiveBinder={setActiveBinder}/>}
  </div>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GRIMOIRES LIST (decks)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function DecksList({decks,setDecks,onOpen,toast}) {
  const [showNew,setShowNew]=useState(false);const [name,setName]=useState("");const [format,setFormat]=useState("commander");
  const [deleteTarget,setDeleteTarget]=useState(null);const [sortBy,setSortBy]=useState("recent");

  const sortedDecks=useMemo(()=>{const d=[...decks];if(sortBy==="name")d.sort((a,b)=>a.name.localeCompare(b.name));else if(sortBy==="format")d.sort((a,b)=>a.format.localeCompare(b.format));else d.sort((a,b)=>(b.ts||0)-(a.ts||0));return d},[decks,sortBy]);

  const [tag,setTag]=useState("");
  const TAGS=["Aggro","Midrange","Control","Combo","Tempo","Ramp","Tribal","Voltron","Stax","Mill","Burn","Tokens","Reanimator","Spellslinger"];
  const create=()=>{if(!name.trim())return;const d={id:Date.now().toString(),name,format,cards:[],notes:"",tags:tag?[tag]:[],ts:Date.now()};setDecks(p=>[...p,d]);onOpen(d.id);setName("");setShowNew(false);setTag("");toast(`Created "${name}"`)};
  const confirmDelete=()=>{if(!deleteTarget)return;const dk=decks.find(d=>d.id===deleteTarget);setDecks(p=>p.filter(x=>x.id!==deleteTarget));setDeleteTarget(null);if(dk)toast(`Deleted "${dk.name}"`,"error")};
  const cloneDeck=(d)=>{const clone={...d,id:Date.now().toString(),name:d.name+" (copy)",cards:[...d.cards],ts:Date.now()};setDecks(p=>[...p,clone]);toast(`Cloned "${d.name}"`)};

  return <>
    <ConfirmDialog open={!!deleteTarget} title="Delete this deck?" message="This will permanently remove the deck and all its cards. This cannot be undone." onConfirm={confirmDelete} onCancel={()=>setDeleteTarget(null)}/>

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <h2 style={{margin:0,fontSize:20,fontWeight:700,color:T.accent,fontFamily:F.heading,letterSpacing:.5}}>My Decks</h2>
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.textMuted,fontSize:10,fontFamily:F.body}}>
          <option value="recent">Recent</option><option value="name">Name</option><option value="format">Format</option>
        </select>
        <button onClick={()=>setShowNew(!showNew)} style={{padding:"10px 16px",borderRadius:4,border:"none",background:`linear-gradient(135deg,${T.gold},${T.goldDark})`,color:"#000",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5,fontFamily:F.body,boxShadow:S.goldGlow}}>{I.plus("#000")} New Deck</button>
      </div>
    </div>

    {showNew&&<div style={{background:T.card,borderRadius:4,border:`1px solid ${T.cardBorder}`,padding:16,marginBottom:16,boxShadow:S.cardFrame,backgroundImage:S.texture}}>
      <input aria-label="Deck name" value={name} onChange={e=>setName(e.target.value)} placeholder="Deck name..." onKeyDown={e=>e.key==="Enter"&&create()} style={{width:"100%",padding:"12px 14px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:16,marginBottom:8,boxSizing:"border-box",fontFamily:F.body,boxShadow:S.insetInput}}/>
      <div style={{display:"flex",gap:8,marginBottom:8}}>
        <select value={format} onChange={e=>setFormat(e.target.value)} style={{flex:1,padding:"10px 12px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:13,fontFamily:F.body}}>
          {Object.entries(FORMAT_RULES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={tag} onChange={e=>setTag(e.target.value)} style={{flex:1,padding:"10px 12px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.textMuted,fontSize:13,fontFamily:F.body}}>
          <option value="">Archetype (optional)</option>
          {TAGS.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <button onClick={create} style={{width:"100%",padding:"10px 24px",borderRadius:4,border:"none",background:T.gold,color:"#000",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F.body}}>Create</button>
    </div>}

    {decks.length===0?<div style={{textAlign:"center",padding:"48px 20px",color:T.textDim}}>
      <div style={{width:72,height:72,borderRadius:36,background:`linear-gradient(135deg, ${T.card}, ${T.surface})`,border:`1.5px solid ${T.gold}33`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",animation:"pulseGlow 3s ease-in-out infinite"}}>{I.deck(T.textDim)}</div>
      <div style={{fontSize:15,color:T.textMuted,fontFamily:F.body}}>No decks yet</div>
      <div style={{fontSize:13,marginTop:4,marginBottom:14,fontFamily:F.body}}>Tap + New Deck to build your first spellbook</div>
      <div style={{fontSize:13,color:T.textDim,fontStyle:"italic",lineHeight:1.6,fontFamily:F.body}}>{randomFlavor("decks")}</div>
    </div>
    :sortedDecks.map(d=>{
      const n=d.cards.reduce((a,c)=>a+c.qty,0);const mainN=d.cards.filter(c=>c.board==="main"||c.board==="commander").reduce((a,c)=>a+c.qty,0);
      const sideN=d.cards.filter(c=>c.board==="sideboard").reduce((a,c)=>a+c.qty,0);
      const v=d.cards.reduce((a,c)=>a+(parseFloat(c.prices?.usd||0)*c.qty),0);
      const preview=d.cards.slice(0,4);const deckColors=getDeckColors(d);const colorName=getDeckColorName(d);
      const rules=FORMAT_RULES[d.format]||FORMAT_RULES.standard;const sizeOk=rules.min?mainN>=rules.min:true;
      const tint=getDeckTint(d);

      const heroArt = d.cards[0] ? getImg(d.cards[0]) : null;
      return <div key={d.id} onClick={()=>onOpen(d.id)} style={{position:"relative",overflow:"hidden",background:`linear-gradient(135deg, ${tint} 0%, ${T.card} 100%)`,border:`1px solid ${T.cardBorder}`,borderRadius:4,padding:14,marginBottom:10,cursor:"pointer",boxShadow:S.cardFrame,borderLeft:deckColors.length?`3px solid ${MCLR[deckColors[0]]}`:`3px solid ${T.cardBorder}`}}
        onMouseEnter={e=>e.currentTarget.style.borderColor=T.gold+"66"} onMouseLeave={e=>e.currentTarget.style.borderColor=T.cardBorder}>
        <ArtBg src={heroArt} opacity={.1} blur={24}/>
        <div style={{position:"relative",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:17,fontWeight:700,color:T.text,fontFamily:F.heading,letterSpacing:.3}}>{d.name}</span>
              {!sizeOk&&<span style={{lineHeight:0}}>{I.warn(T.red)}</span>}
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center",marginTop:3,flexWrap:"wrap"}}>
              <span style={{fontSize:12,color:T.textDim,fontFamily:F.body}}>{d.format[0].toUpperCase()+d.format.slice(1)}</span>
              <span style={{fontSize:12,color:T.textDim,fontFamily:F.body}}>{mainN} main{sideN>0?` / ${sideN} side`:""}</span>
              {deckColors.length>0&&<><span style={{display:"flex",gap:2}}>{deckColors.map(c=><Pip key={c} s={c} sz={14}/>)}</span>
              <span style={{fontSize:11,color:T.textMuted,fontFamily:F.body,fontStyle:"italic"}}>{colorName}</span></>}
              {d.tags&&d.tags.map(t=><span key={t} style={{fontSize:9,padding:"2px 6px",borderRadius:3,background:T.goldGlow,color:T.gold,fontWeight:600,fontFamily:F.body}}>{t}</span>)}
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:15,fontWeight:700,color:T.green,fontFamily:F.body}}>{fmt(v.toFixed(2))}</div>
            <div style={{display:"flex",gap:4,marginTop:4}}>
              <button onClick={e=>{e.stopPropagation();cloneDeck(d)}} style={{padding:"4px 8px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.textMuted,fontSize:10,cursor:"pointer",fontFamily:F.body}}>Clone</button>
              <button onClick={e=>{e.stopPropagation();setDeleteTarget(d.id)}} style={{padding:"4px 8px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.red,fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",gap:3,fontFamily:F.body}}>{I.trash(T.red)}</button>
            </div>
          </div>
        </div>
        {preview.length>0&&<div style={{display:"flex",gap:6,marginTop:10,overflow:"hidden",position:"relative",zIndex:1}}>
          {preview.map(c=><img key={c.id} src={getImg(c,"small")} alt={c.name} style={{width:48,height:67,borderRadius:3,objectFit:"cover",border:`1px solid ${T.cardBorder}`}}/>)}
          {n>4&&<div style={{width:48,height:67,borderRadius:3,background:T.cardInner,border:`1px solid ${T.cardBorder}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:T.textDim}}>+{n-4}</div>}
        </div>}
      </div>;
    })}
  </>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DECK EDITOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function DeckEditor({deckId,decks,setDecks,addDeck,onBack,toast,coll,allCollCards}) {
  const [addQ,setAddQ]=useState("");const [addColors,setAddColors]=useState([]);const [addType,setAddType]=useState("");
  const [addResults,setAddResults]=useState([]);const [viewMode,setViewMode]=useState("visual");
  const [showSim,setShowSim]=useState(false);const [showImport,setShowImport]=useState(false);
  const [importText,setImportText]=useState("");const [importStatus,setImportStatus]=useState("");
  const [statsOpen,setStatsOpen]=useState(true);const [slideIdx,setSlideIdx]=useState(-1);
  const [hand,setHand]=useState([]);const [lib,setLib]=useState([]);const [mulls,setMulls]=useState(0);
  const [drawn,setDrawn]=useState([]);const [turn,setTurn]=useState(0);
  const [editing,setEditing]=useState(false);const [editName,setEditName]=useState("");
  const [mullPhase,setMullPhase]=useState(null);
  const [showNotes,setShowNotes]=useState(false);const [exportFmt,setExportFmt]=useState("text");
  const [suggestions,setSuggestions]=useState([]);const [showSuggest,setShowSuggest]=useState(false);const [sugLoading,setSugLoading]=useState(false);

  const dAQ=useDebounce(addQ,350),dAC=useDebounce(addColors,350),dAT=useDebounce(addType,350);
  useEffect(()=>{let c=false;if(dAQ.length<2&&!dAC.length&&!dAT){setAddResults([]);return;}searchCards(dAQ,dAC,dAT).then(r=>{if(!c)setAddResults(r)});return()=>{c=true}},[dAQ,dAC,dAT]);

  const deck=decks.find(d=>d.id===deckId); if(!deck) return null;
  const tint=getDeckTint(deck);

  const rmCard=(cid,board)=>{
    setDecks(p=>p.map(d=>{if(d.id!==deckId)return d;const c=d.cards.find(x=>x.id===cid&&x.board===board);if(!c)return d;return c.qty>1?{...d,cards:d.cards.map(x=>x===c?{...x,qty:x.qty-1}:x)}:{...d,cards:d.cards.filter(x=>x!==c)}}));
    if(isOnline.current)enqueueWrite(()=>deckCardsApi.remove(deckId,cid,board));
  };

  const moveCard=(cid,fromBoard,toBoard)=>{
    setDecks(p=>p.map(d=>{
      if(d.id!==deckId)return d;
      const c=d.cards.find(x=>x.id===cid&&x.board===fromBoard);if(!c)return d;
      const existing=d.cards.find(x=>x.id===cid&&x.board===toBoard);
      let cards=d.cards.filter(x=>x!==c);
      if(c.qty>1) cards=[...d.cards.map(x=>x===c?{...x,qty:x.qty-1}:x)];
      if(existing) cards=cards.map(x=>x===existing?{...x,qty:x.qty+1}:x);
      else cards=[...cards,{...c,qty:1,board:toBoard}];
      return{...d,cards};
    }));
    if(isOnline.current)enqueueWrite(()=>deckCardsApi.move(deckId,cid,fromBoard,toBoard));
  };

  const renameDeck=(newName)=>{if(!newName.trim())return;setDecks(p=>p.map(d=>d.id===deckId?{...d,name:newName.trim()}:d));setEditing(false);toast(`Renamed to "${newName.trim()}"`);
    if(isOnline.current)enqueueWrite(()=>decksApi.update(deckId,{name:newName.trim()}));
  };
  const updateNotes=(text)=>{setDecks(p=>p.map(d=>d.id===deckId?{...d,notes:text}:d));
    if(isOnline.current)enqueueWrite(()=>decksApi.update(deckId,{notes:text}));
  };

  const stats=useMemo(()=>{
    const main=deck.cards.filter(c=>c.board==="main"||c.board==="commander");
    const curve={},clrs={},types={};let val=0;
    main.forEach(c=>{const cmc=Math.min(Math.floor(c.cmc||0),7);curve[cmc]=(curve[cmc]||0)+c.qty;(c.mana_cost?.match(/\{([WUBRGC])\}/g)||[]).forEach(m=>{const s=m[1];clrs[s]=(clrs[s]||0)+c.qty});types[typeCategory(c.type_line)]=(types[typeCategory(c.type_line)]||0)+c.qty;if(c.prices?.usd)val+=parseFloat(c.prices.usd)*c.qty});
    const total=deck.cards.reduce((a,c)=>a+c.qty,0);const mainN=main.reduce((a,c)=>a+c.qty,0);
    const avgMv=mainN?main.reduce((a,c)=>a+(c.cmc||0)*c.qty,0)/mainN:0;
    const lands=main.filter(c=>(c.type_line||"").toLowerCase().includes("land")).reduce((a,c)=>a+c.qty,0);
    const landPct=mainN?Math.round((lands/mainN)*100):0;
    // Recommended lands based on avg MV (Frank Karsten formula simplified)
    const recLands=Math.round(19.59+(1.9*avgMv));
    const recLandPct=mainN?Math.round((recLands/Math.max(mainN,60))*100):40;
    // Draw probability: chance of drawing at least 1 copy in opening 7
    const drawProb=(copies,deckSize,hand=7)=>{if(!copies||!deckSize||copies>deckSize)return 0;let miss=1;for(let i=0;i<hand;i++)miss*=(deckSize-copies-i)/(deckSize-i);return Math.round((1-miss)*100)};
    return{curve,clrs,types,val,total,avgMv,mainN,sideN:deck.cards.filter(c=>c.board==="sideboard").reduce((a,c)=>a+c.qty,0),lands,landPct,recLands,recLandPct,drawProb};
  },[deck]);

  const warnings=useMemo(()=>validateDeck(deck),[deck]);
  const grouped=useMemo(()=>{const g={};deck.cards.filter(c=>c.board==="main"||c.board==="commander").forEach(c=>{const cat=typeCategory(c.type_line);if(!g[cat])g[cat]=[];g[cat].push(c)});return g},[deck]);
  const allCards=useMemo(()=>deck.cards.filter(c=>c.board==="main"||c.board==="commander"),[deck]);

  const shuffle=a=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b};
  const buildLib=()=>{const c=[];deck.cards.filter(x=>x.board==="main"||x.board==="commander").forEach(x=>{for(let i=0;i<x.qty;i++)c.push({...x,uid:x.id+"-"+i+"-"+Math.random()})});return shuffle(c)};
  const newGame=()=>{const l=buildLib();setHand(l.slice(0,7));setLib(l.slice(7));setMulls(0);setDrawn([]);setTurn(1);setShowSim(true);setMullPhase(null)};
  // London mulligan: draw 7, then put N cards on bottom (N = mulligan count)
  const mull=()=>{const l=buildLib();const newMulls=mulls+1;setHand(l.slice(0,7));setLib(l.slice(7));setMulls(newMulls);setDrawn([]);setTurn(1);setMullPhase(newMulls>0?newMulls:null)};
  const putBack=(uid)=>{if(!mullPhase)return;setHand(h=>h.filter(c=>c.uid!==uid));setLib(l=>[...l,hand.find(c=>c.uid===uid)]);setMullPhase(p=>p-1<=0?null:p-1)};
  const drawCard=()=>{if(!lib.length||mullPhase)return;setDrawn(p=>[...p,lib[0]]);setLib(p=>p.slice(1));setTurn(t=>t+1)};

  const handleImport=async()=>{
    const entries=parseDeckList(importText);if(!entries.length){setImportStatus("No valid entries found");return;}
    setImportStatus(`Importing ${entries.length} cards...`);let imported=0;
    for(const entry of entries){try{const res=await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(entry.name)}`);if(res.ok){const card=await res.json();for(let i=0;i<entry.qty;i++)addDeck(deckId,card,entry.board);imported++}await new Promise(r=>setTimeout(r,80))}catch{}}
    setImportStatus(`Imported ${imported}/${entries.length} cards`);toast(`Imported ${imported} cards`);
    setTimeout(()=>{setShowImport(false);setImportText("");setImportStatus("")},1500);
  };
  const handleExport=(fmt="text")=>{const text=exportDeckList(deck,fmt);navigator.clipboard.writeText(text).then(()=>toast(`Decklist copied (${fmt==="arena"?"Arena":"text"} format)`)).catch(()=>window.prompt("Copy:",text))};

  const fetchSuggestions=async()=>{
    if(sugLoading)return;setSugLoading(true);
    const colors=getDeckColors(deck);
    const ci=colors.length?`id<=${colors.join("").toLowerCase()}`:"";
    const fmt=deck.format!=="commander"?`f:${deck.format}`:"";
    const owned=new Set(deck.cards.map(c=>c.name.toLowerCase()));
    const types=["creature","instant","sorcery","enchantment","artifact"];
    const picked=types[Math.floor(Math.random()*types.length)];
    try{
      const q=[ci,fmt,`t:${picked}`].filter(Boolean).join(" ");
      const res=await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=edhrec&unique=cards`);
      if(res.ok){const json=await res.json();setSuggestions((json.data||[]).filter(c=>!owned.has(c.name.toLowerCase())).slice(0,8))}
    }catch{}
    setSugLoading(false);setShowSuggest(true);
  };

  const mx=Math.max(...Object.values(stats?.curve||{0:1}),1);
  const totalClrs=Object.values(stats?.clrs||{}).reduce((a,b)=>a+b,0)||1;
  const colorName=getDeckColorName(deck);

  return <div style={{padding:16}}>
    <button onClick={onBack} style={{padding:"8px 14px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.textDim,fontSize:13,cursor:"pointer",marginBottom:12,display:"flex",alignItems:"center",gap:6,fontFamily:F.body}}>{I.back(T.textDim)} Back</button>

    {/* Deck header — blurred card art background */}
    <div style={{position:"relative",overflow:"hidden",background:`linear-gradient(135deg, ${tint} 0%, ${T.card} 100%)`,borderRadius:4,border:`1px solid ${T.cardBorder}`,padding:16,marginBottom:12,boxShadow:S.cardFrame}}>
      <ArtBg src={deck.cards[0]?getImg(deck.cards[0]):null} opacity={.2} blur={24}/>
      <div style={{position:"relative",background:"rgba(12,14,20,.75)",borderRadius:4,padding:12,margin:-4}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          {editing?<input value={editName} onChange={e=>setEditName(e.target.value)} onBlur={()=>renameDeck(editName)} onKeyDown={e=>{if(e.key==="Enter")renameDeck(editName);if(e.key==="Escape")setEditing(false)}} autoFocus style={{margin:"0 0 2px",fontSize:22,fontWeight:700,color:T.accent,fontFamily:F.heading,letterSpacing:.5,background:"transparent",border:`1px solid ${T.gold}`,borderRadius:4,padding:"2px 6px",outline:"none",width:"100%",boxSizing:"border-box"}}/>
          :<h2 onClick={()=>{setEditName(deck.name);setEditing(true)}} style={{margin:"0 0 2px",fontSize:22,fontWeight:700,color:T.accent,fontFamily:F.heading,letterSpacing:.5,cursor:"pointer"}} title="Click to rename">{deck.name}</h2>}
          <div style={{display:"flex",gap:8,fontSize:12,color:T.textDim,fontFamily:F.body,flexWrap:"wrap",alignItems:"center"}}>
            <span>{deck.format[0].toUpperCase()+deck.format.slice(1)}</span>
            <span>{stats.mainN} main{stats.sideN>0?` / ${stats.sideN} side`:""}</span>
            <span style={{color:T.green,fontWeight:700}}>{fmt(stats.val.toFixed(2))}</span>
            <span>Avg MV: {stats.avgMv.toFixed(1)}</span>
            {colorName!=="Colorless"&&<span style={{fontStyle:"italic",color:T.textMuted}}>{colorName}</span>}
          </div>
        </div>
        <button onClick={()=>setStatsOpen(!statsOpen)} style={{background:"none",border:"none",cursor:"pointer",padding:4,marginTop:4}}>{statsOpen?I.chevU(T.textDim):I.chevD(T.textDim)}</button>
      </div>

      {warnings.filter(w=>w.severity!=="ok").length>0&&<div style={{marginTop:8,display:"flex",flexDirection:"column",gap:3}}>
        {warnings.filter(w=>w.severity!=="ok").map((w,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,fontWeight:600,color:w.severity==="error"?T.red:"#E8C349",padding:"4px 8px",borderRadius:4,background:w.severity==="error"?"#2A0F0Faa":"#2A2A0Faa",fontFamily:F.body}}>{I.warn(w.severity==="error"?T.red:"#E8C349")} {w.msg}</div>)}
      </div>}
      {warnings.filter(w=>w.severity==="ok").length>0&&warnings.filter(w=>w.severity!=="ok").length===0&&<div style={{marginTop:8,display:"flex",alignItems:"center",gap:6,fontSize:11,fontWeight:600,color:T.green,padding:"4px 8px",borderRadius:4,background:"#0F2A1Aaa",fontFamily:F.body}}>{I.check(T.green)} {warnings.find(w=>w.severity==="ok").msg}</div>}

      {statsOpen&&<>
        <div style={{marginTop:12,marginBottom:10}}>
          <div style={{fontSize:10,color:T.textMuted,marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:.5,fontFamily:F.body}}>Mana Curve</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:4,height:48}}>
            {[0,1,2,3,4,5,6,7].map(cmc=><div key={cmc} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
              <div style={{fontSize:9,color:T.textDim,marginBottom:2}}>{stats.curve[cmc]||0}</div>
              <div style={{width:"100%",borderRadius:"3px 3px 0 0",height:`${((stats.curve[cmc]||0)/mx)*32}px`,background:`linear-gradient(180deg,${T.gold},#7A6530)`,transition:"height .3s"}}/>
              <div style={{fontSize:9,color:T.textDim,marginTop:2}}>{cmc===7?"7+":cmc}</div>
            </div>)}
          </div>
        </div>
        {Object.keys(stats.clrs).length>0&&<div style={{marginBottom:8}}>
          <div style={{fontSize:10,color:T.textMuted,marginBottom:4,fontWeight:600,textTransform:"uppercase",letterSpacing:.5,fontFamily:F.body}}>Colors</div>
          <div style={{display:"flex",gap:0,height:6,borderRadius:3,overflow:"hidden",marginBottom:4}}>{Object.entries(stats.clrs).map(([c,n])=><div key={c} style={{width:`${(n/totalClrs)*100}%`,background:MCLR[c],height:"100%"}}/>)}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{Object.entries(stats.clrs).map(([c,n])=><div key={c} style={{display:"flex",alignItems:"center",gap:3}}><Pip s={c} sz={14}/><span style={{fontSize:10,color:T.textMuted,fontFamily:F.body}}>{n}</span></div>)}</div>
        </div>}
        {Object.keys(stats.types).length>0&&<div>
          <div style={{fontSize:10,color:T.textMuted,marginBottom:4,fontWeight:600,textTransform:"uppercase",letterSpacing:.5,fontFamily:F.body}}>Types</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{TYPE_ORDER.filter(t=>stats.types[t]).map(t=><span key={t} style={{padding:"2px 7px",borderRadius:4,background:T.cardInner,fontSize:10,color:T.textMuted,fontFamily:F.body}}>{t} {stats.types[t]}</span>)}</div>
        </div>}
        {/* Land ratio */}
        {stats.mainN>0&&<div style={{marginTop:8}}>
          <div style={{fontSize:10,color:T.textMuted,marginBottom:4,fontWeight:600,textTransform:"uppercase",letterSpacing:.5,fontFamily:F.body}}>Mana Base</div>
          <div style={{display:"flex",gap:8,alignItems:"center",fontSize:11,fontFamily:F.body}}>
            <span style={{color:T.text}}>{stats.lands} lands ({stats.landPct}%)</span>
            <span style={{color:Math.abs(stats.lands-stats.recLands)<=2?T.green:stats.lands<stats.recLands?T.red:"#E8C349"}}>{stats.lands<stats.recLands?`Need ~${stats.recLands-stats.lands} more`:stats.lands>stats.recLands+3?`${stats.lands-stats.recLands} over recommended`:"On target"}</span>
            <span style={{color:T.textDim,fontSize:10}}>Rec: ~{stats.recLands}</span>
          </div>
        </div>}
      </>}
      </div>{/* close content backdrop */}
    </div>

    {/* Actions */}
    <div style={{display:"flex",gap:6,marginBottom:12}}>
      <button onClick={newGame} style={{flex:1,padding:10,borderRadius:4,border:`1.5px solid ${T.gold}`,background:showSim?T.goldGlow:"transparent",color:T.gold,fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5,fontFamily:F.body}}>{I.simulate(T.gold)} Playtest</button>
      <button onClick={()=>setShowImport(!showImport)} style={{flex:1,padding:10,borderRadius:4,border:`1.5px solid ${T.textDim}`,background:showImport?T.goldGlow:"transparent",color:T.textMuted,fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5,fontFamily:F.body}}>{I.import(T.textMuted)} Import</button>
      <button onClick={()=>handleExport("text")} style={{flex:1,padding:10,borderRadius:4,border:`1.5px solid ${T.textDim}`,background:"transparent",color:T.textMuted,fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5,fontFamily:F.body}}>{I.export(T.textMuted)} Export</button>
      <button onClick={()=>handleExport("arena")} style={{padding:"10px 8px",borderRadius:4,border:`1.5px solid ${T.textDim}`,background:"transparent",color:T.textDim,fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:F.body,flexShrink:0}}>Arena</button>
      <button onClick={fetchSuggestions} style={{padding:"10px 8px",borderRadius:4,border:`1.5px solid ${T.purple}`,background:showSuggest?`${T.purple}15`:"transparent",color:T.purple,fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:F.body,flexShrink:0}}>{sugLoading?"...":"Suggest"}</button>
    </div>

    {/* Card suggestions */}
    {showSuggest&&suggestions.length>0&&<div style={{background:T.card,borderRadius:4,border:`1px solid ${T.purple}33`,padding:10,marginBottom:12,boxShadow:S.cardFrame}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div style={{fontSize:12,fontWeight:700,color:T.purple,fontFamily:F.heading}}>Suggested Cards</div>
        <div style={{display:"flex",gap:4}}>
          <button onClick={fetchSuggestions} style={{fontSize:10,color:T.textMuted,background:"none",border:"none",cursor:"pointer",fontFamily:F.body,textDecoration:"underline"}}>Refresh</button>
          <button onClick={()=>setShowSuggest(false)} style={{background:"none",border:"none",cursor:"pointer",padding:2}}>{I.close(T.textDim)}</button>
        </div>
      </div>
      <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:6}}>
        {suggestions.map(c=><div key={c.id} style={{flexShrink:0,width:90,textAlign:"center"}}>
          <img src={getImg(c,"small")} alt={c.name} style={{width:90,borderRadius:4,display:"block",cursor:"pointer"}} onClick={()=>{addDeck(deckId,c,"main");toast(`Added ${c.name}`)}}/>
          <div style={{fontSize:9,color:T.text,marginTop:3,lineHeight:1.2,fontFamily:F.body,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</div>
          <div style={{fontSize:8,color:T.green,fontFamily:F.body}}>{fmt(c.prices?.usd)}</div>
        </div>)}
      </div>
    </div>}

    {/* Deck notes */}
    <div style={{marginBottom:10}}>
      <button onClick={()=>setShowNotes(!showNotes)} style={{fontSize:11,color:T.textDim,background:"none",border:"none",cursor:"pointer",fontFamily:F.body,padding:0,textDecoration:"underline"}}>{showNotes?"Hide notes":"Notes"}{deck.notes?" \u2022":"..."}</button>
      {showNotes&&<textarea value={deck.notes||""} onChange={e=>updateNotes(e.target.value)} placeholder="Deck strategy, matchup notes, card choices..." style={{width:"100%",marginTop:6,height:60,padding:10,borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:12,resize:"vertical",boxSizing:"border-box",fontFamily:F.body,lineHeight:1.5,boxShadow:S.insetInput}}/>}
    </div>

    {showImport&&<div style={{background:T.card,borderRadius:4,border:`1px solid ${T.cardBorder}`,padding:14,marginBottom:12,boxShadow:S.cardFrame}}>
      <div style={{fontSize:14,fontWeight:700,color:T.accent,marginBottom:6,fontFamily:F.heading}}>Import Decklist</div>
      <div style={{fontSize:11,color:T.textDim,marginBottom:8,lineHeight:1.4,fontFamily:F.body}}>Paste your decklist \u2014 the Vault will resolve each card. Use "Sideboard" or "Commander" headers.</div>
      <textarea value={importText} onChange={e=>setImportText(e.target.value)} placeholder={"4 Lightning Bolt\n4 Counterspell\n\nSideboard\n2 Rest in Peace"} style={{width:"100%",height:120,padding:12,borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:13,resize:"vertical",boxSizing:"border-box",fontFamily:"monospace",lineHeight:1.5,boxShadow:S.insetInput}}/>
      <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center"}}>
        <button onClick={handleImport} disabled={!importText.trim()} style={{padding:"10px 20px",borderRadius:4,border:"none",background:importText.trim()?`linear-gradient(135deg,${T.gold},${T.goldDark})`:"#333",color:importText.trim()?"#000":"#666",fontSize:13,fontWeight:700,cursor:importText.trim()?"pointer":"default",fontFamily:F.body}}>Import</button>
        {importStatus&&<span style={{fontSize:12,color:T.gold,fontFamily:F.body}}>{importStatus}</span>}
      </div>
    </div>}

    {/* Playtest with London mulligan */}
    {showSim&&hand.length>0&&<div style={{background:T.card,borderRadius:4,border:`1px solid ${T.gold}33`,padding:14,marginBottom:12,boxShadow:S.cardFrame}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:14,fontWeight:700,color:T.accent,fontFamily:F.heading}}>Playtest{mullPhase?` \u2014 put ${mullPhase} card${mullPhase>1?"s":""} back`:""}</div>
        <button onClick={()=>setShowSim(false)} style={{background:"none",border:"none",cursor:"pointer",padding:4}}>{I.close(T.textDim)}</button>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <button onClick={mull} style={{flex:1,padding:8,borderRadius:4,border:`1.5px solid ${T.gold}`,background:"transparent",color:T.gold,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:F.body}}>Mulligan{mulls>0?` (${mulls})`:""}</button>
        <button onClick={drawCard} disabled={!lib.length} style={{flex:1,padding:8,borderRadius:4,border:`1.5px solid ${T.green}`,background:"transparent",color:T.green,fontSize:11,fontWeight:700,cursor:"pointer",opacity:lib.length?1:.4,fontFamily:F.body}}>Draw for Turn</button>
        <button onClick={newGame} style={{padding:"8px 12px",borderRadius:4,border:`1.5px solid ${T.textDim}`,background:"transparent",color:T.textDim,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:F.body}}>Reset</button>
      </div>
      <div style={{display:"flex",gap:8,fontSize:11,color:T.textDim,marginBottom:8,fontFamily:F.body}}><span>Library: {lib.length}</span><span>Hand: {hand.length}</span><span>Turn {turn}</span></div>
      <div style={{fontSize:10,color:T.gold,fontWeight:600,marginBottom:4,fontFamily:F.body}}>{mullPhase?"Tap cards to put on bottom:":"Opening Hand"}</div>
      <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:6,WebkitOverflowScrolling:"touch"}}>
        {hand.map(c=><div key={c.uid} onClick={()=>mullPhase&&putBack(c.uid)} style={{flexShrink:0,width:80,cursor:mullPhase?"pointer":"default",opacity:mullPhase?.9:1}}><img src={getImg(c,"small")} alt={c.name} style={{width:80,borderRadius:4,display:"block",border:mullPhase?`2px solid ${T.gold}44`:"2px solid transparent"}}/><div style={{fontSize:9,color:T.text,marginTop:2,textAlign:"center",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:F.body}}>{c.name}</div></div>)}
      </div>
      {drawn.length>0&&<><div style={{fontSize:10,color:T.green,fontWeight:600,marginTop:6,marginBottom:4,fontFamily:F.body}}>Draws</div>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,WebkitOverflowScrolling:"touch"}}>
          {drawn.map((c,i)=><div key={c.uid} style={{flexShrink:0,width:64}}><img src={getImg(c,"small")} alt={c.name} style={{width:64,borderRadius:3,display:"block"}}/><div style={{fontSize:8,color:T.textDim,marginTop:1,textAlign:"center",fontFamily:F.body}}>T{turn-drawn.length+i+1}</div></div>)}
        </div></>}
    </div>}

    {/* Add cards with filters */}
    <div style={{marginBottom:4}}>
      <input value={addQ} onChange={e=>setAddQ(e.target.value)} placeholder="Search cards to add..." style={{width:"100%",padding:"12px 14px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:14,boxSizing:"border-box",marginBottom:6,fontFamily:F.body,boxShadow:S.insetInput}}/>
      <div style={{display:"flex",gap:4,overflowX:"auto",alignItems:"center",paddingBottom:4}}>
        <ColorPills colors={addColors} setColors={setAddColors} size={28}/>
        <TypeSelect type={addType} setType={setAddType} h={30}/>
      </div>
    </div>
    {addResults.length>0&&<div style={{background:T.card,borderRadius:4,border:`1px solid ${T.cardBorder}`,marginBottom:12,overflow:"hidden",boxShadow:S.cardFrame}}>
      {addResults.map(c=>{const owned=allCollCards?.get(c.id);return<div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderBottom:`1px solid ${T.cardBorder}`}}>
        <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
          <img src={getImg(c,"small")} alt={c.name} style={{width:28,height:39,borderRadius:3,objectFit:"cover"}}/>
          <div style={{minWidth:0,flex:1}}><div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:13,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:F.body}}>{c.name}</span><RarityBadge rarity={c.rarity} sz={14}/>{owned&&<span style={{fontSize:9,padding:"1px 4px",borderRadius:3,background:"#0F2A1A",color:T.green,fontWeight:600}}>Own {owned.qty}</span>}</div><Cost c={c.mana_cost} sz={12}/></div>
        </div>
        <div style={{display:"flex",gap:4,flexShrink:0}}>
          <button onClick={()=>{addDeck(deckId,c,"main");toast(`Added ${c.name}`)}} style={{padding:"6px 10px",borderRadius:4,border:"none",background:T.gold,color:"#000",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:F.body}}>Main</button>
          <button onClick={()=>{addDeck(deckId,c,"sideboard");toast(`${c.name} to sideboard`)}} style={{padding:"6px 10px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.textMuted,fontSize:11,cursor:"pointer",fontFamily:F.body}}>Side</button>
          {deck.format==="commander"&&<button onClick={()=>{addDeck(deckId,c,"commander");toast(`${c.name} as commander`)}} style={{padding:"6px 10px",borderRadius:4,border:`1px solid ${T.gold}66`,background:T.goldGlow,color:T.gold,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:F.body}}>Cmdr</button>}
          <button onClick={()=>{addDeck(deckId,c,"maybeboard");toast(`${c.name} to maybeboard`)}} style={{padding:"6px 10px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.textDim,fontSize:11,cursor:"pointer",fontFamily:F.body}}>Maybe</button>
        </div>
      </div>})}
    </div>}

    {/* View toggle */}
    <div style={{display:"flex",gap:4,marginBottom:10}}>
      <button onClick={()=>setViewMode("visual")} style={{flex:1,padding:8,borderRadius:4,border:"none",background:viewMode==="visual"?T.gold:T.card,color:viewMode==="visual"?"#000":T.textDim,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:F.body}}>Visual</button>
      <button onClick={()=>setViewMode("list")} style={{flex:1,padding:8,borderRadius:4,border:"none",background:viewMode==="list"?T.gold:T.card,color:viewMode==="list"?"#000":T.textDim,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:F.body}}>List</button>
    </div>

    {/* Empty deck message */}
    {deck.cards.length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:T.textDim}}>
      <div style={{fontSize:14,fontFamily:F.body,marginBottom:8}}>This deck is empty \u2014 search above to add your first card.</div>
      <div style={{fontSize:13,fontStyle:"italic",color:T.textDim,fontFamily:F.body}}>"An empty page is the most dangerous weapon a mage can carry." \u2014 Teferi</div>
    </div>}

    {viewMode==="visual"&&TYPE_ORDER.map(cat=>{
      const cards=grouped[cat];if(!cards||!cards.length)return null;
      return <div key={cat} style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <span style={{fontSize:13,fontWeight:700,color:T.gold,textTransform:"uppercase",letterSpacing:.5,fontFamily:F.heading}}>{cat}</span>
          <span style={{fontSize:11,color:T.textDim,fontFamily:F.body}}>{cards.reduce((a,c)=>a+c.qty,0)}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
          {cards.map(c=>{const idx=allCards.findIndex(x=>x.id===c.id&&x.board===c.board);return <div key={c.id+c.board} style={{position:"relative",cursor:"pointer"}} onClick={()=>idx>=0&&setSlideIdx(idx)}>
            <img src={getImg(c,"small")} alt={c.name} style={{width:"100%",borderRadius:4,display:"block"}}/>
            {c.qty>1&&<div style={{position:"absolute",top:2,right:2,background:T.gold,color:"#000",borderRadius:4,padding:"1px 5px",fontSize:10,fontWeight:800}}>{c.qty}</div>}
            <button onClick={e=>{e.stopPropagation();rmCard(c.id,c.board)}} style={{position:"absolute",bottom:2,right:2,width:28,height:28,borderRadius:14,border:"none",background:"rgba(0,0,0,.7)",color:T.red,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2212"}</button>
          </div>})}
        </div>
      </div>;
    })}

    {viewMode==="list"&&["commander","companion","main","sideboard","maybeboard"].map(board=>{
      const cards=deck.cards.filter(c=>c.board===board);if(!cards.length)return null;
      return <div key={board} style={{marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:700,color:T.gold,textTransform:"uppercase",marginBottom:6,letterSpacing:.5,fontFamily:F.heading}}>{board} ({cards.reduce((a,c)=>a+c.qty,0)})</div>
        {cards.map(c=>{const idx=allCards.findIndex(x=>x.id===c.id&&x.board===c.board);return <div key={c.id+c.board} onClick={()=>idx>=0&&setSlideIdx(idx)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",borderRadius:4,marginBottom:2,background:T.card,cursor:"pointer"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
            <span style={{fontSize:12,color:T.textDim,width:22,textAlign:"center",fontFamily:F.body}}>{c.qty}x</span>
            <img src={getImg(c,"small")} alt={c.name} style={{width:24,height:34,borderRadius:2,objectFit:"cover"}}/>
            <Cost c={c.mana_cost} sz={13}/>
            <span style={{fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:F.body}}>{c.name}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <span style={{fontSize:9,color:T.textDim,fontFamily:F.body}}>{stats.drawProb(c.qty,stats.mainN)}%</span>
            <span style={{fontSize:11,color:T.green,fontFamily:F.body}}>{fmt(c.prices?.usd)}</span>
            <button onClick={e=>{e.stopPropagation();rmCard(c.id,board)}} style={{width:28,height:28,borderRadius:4,border:"none",background:"#1E1215",color:T.red,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2212"}</button>
          </div>
        </div>})}
      </div>;
    })}

    {viewMode==="visual"&&deck.cards.filter(c=>c.board==="sideboard").length>0&&<div style={{marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6,paddingTop:8,borderTop:"1px solid transparent",borderImage:S.filFaint,borderImageSlice:1,fontFamily:F.heading}}>Sideboard</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
        {deck.cards.filter(c=>c.board==="sideboard").map(c=><div key={c.id+"sb"} style={{position:"relative"}}>
          <img src={getImg(c,"small")} alt={c.name} style={{width:"100%",borderRadius:4,display:"block",opacity:.7}}/>
          {c.qty>1&&<div style={{position:"absolute",top:2,right:2,background:"#666",color:"#fff",borderRadius:4,padding:"1px 5px",fontSize:10,fontWeight:800}}>{c.qty}</div>}
          <button onClick={()=>rmCard(c.id,c.board)} style={{position:"absolute",bottom:2,right:2,width:28,height:28,borderRadius:14,border:"none",background:"rgba(0,0,0,.7)",color:T.red,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2212"}</button>
        </div>)}
      </div>
    </div>}

    {slideIdx>=0&&allCards[slideIdx]&&<CardSlider cards={allCards} index={slideIdx} onIndexChange={setSlideIdx} onClose={()=>setSlideIdx(-1)}
      actions={card=>{const curBoard=card.board||"main";return<div>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          {curBoard!=="main"&&<button onClick={()=>{moveCard(card.id,curBoard,"main");toast(`Moved to main`);setSlideIdx(-1)}} style={{flex:1,padding:8,borderRadius:4,border:`1.5px solid ${T.textMuted}`,background:"transparent",color:T.textMuted,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F.body}}>Main</button>}
          {curBoard!=="sideboard"&&<button onClick={()=>{moveCard(card.id,curBoard,"sideboard");toast(`Moved to sideboard`);setSlideIdx(-1)}} style={{flex:1,padding:8,borderRadius:4,border:`1.5px solid ${T.textMuted}`,background:"transparent",color:T.textMuted,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F.body}}>Side</button>}
          {deck.format==="commander"&&curBoard!=="commander"&&<button onClick={()=>{moveCard(card.id,curBoard,"commander");toast(`Set as commander`);setSlideIdx(-1)}} style={{flex:1,padding:8,borderRadius:4,border:`1.5px solid ${T.gold}`,background:T.goldGlow,color:T.gold,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F.body}}>Cmdr</button>}
          {curBoard!=="maybeboard"&&<button onClick={()=>{moveCard(card.id,curBoard,"maybeboard");toast(`Moved to maybeboard`);setSlideIdx(-1)}} style={{flex:1,padding:8,borderRadius:4,border:`1.5px solid ${T.textDim}`,background:"transparent",color:T.textDim,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:F.body}}>Maybe</button>}
        </div>
        <button onClick={()=>{rmCard(card.id,curBoard);toast(`Cut ${card.name}`);setSlideIdx(-1)}} style={{width:"100%",padding:12,borderRadius:4,border:`2px solid ${T.red}`,background:"transparent",color:T.red,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:F.body}}>Cut from Deck</button>
      </div>}}
    />}
  </div>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ARCANUM (binder)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function BinderView({coll,setColl,toast,binders,setBinders,activeBinder,setActiveBinder}) {
  const [filter,setFilter]=useState("");const [sort,setSort]=useState("name");const [view,setView]=useState("list");
  const [fColors,setFColors]=useState([]);const [fType,setFType]=useState("");const [fRarity,setFRarity]=useState("");const [fSet,setFSet]=useState("");const [fMinPrice,setFMinPrice]=useState("");
  const [slideIdx,setSlideIdx]=useState(-1);const [showFilters,setShowFilters]=useState(false);
  const [showNewBinder,setShowNewBinder]=useState(false);const [newBinderName,setNewBinderName]=useState("");
  const [selectMode,setSelectMode]=useState(false);const [selected,setSelected]=useState(new Set());
  const [showImportColl,setShowImportColl]=useState(false);const [importCollText,setImportCollText]=useState("");const [importCollStatus,setImportCollStatus]=useState("");

  const currentBinder=binders.find(b=>b.id===activeBinder)||binders[0];
  const totalVal=coll.reduce((a,c)=>a+(parseFloat(c.foil?c.prices?.usd_foil:c.prices?.usd||0)*c.qty),0);
  const totalCards=coll.reduce((a,c)=>a+c.qty,0);

  const createBinder=()=>{if(!newBinderName.trim())return;const id=Date.now().toString();setBinders(p=>[...p,{id,name:newBinderName.trim(),cards:[]}]);setActiveBinder(id);setNewBinderName("");setShowNewBinder(false);toast(`Created "${newBinderName.trim()}"`)};
  const deleteBinder=(id)=>{if(id==="main")return;setBinders(p=>p.filter(b=>b.id!==id));if(activeBinder===id)setActiveBinder("main");toast("Binder deleted","error")};
  const toggleSelect=(id)=>setSelected(p=>{const n=new Set(p);if(n.has(id))n.delete(id);else n.add(id);return n});
  const selectAll=()=>setSelected(new Set(items.map(c=>c.id)));
  const bulkDelete=()=>{setColl(p=>p.filter(c=>!selected.has(c.id)));toast(`Removed ${selected.size} cards`,"error");setSelected(new Set());setSelectMode(false)};
  const bulkMoveTo=(targetId)=>{const toMove=coll.filter(c=>selected.has(c.id));setBinders(p=>p.map(b=>{if(b.id===activeBinder)return{...b,cards:b.cards.filter(c=>!selected.has(c.id))};if(b.id===targetId)return{...b,cards:[...b.cards,...toMove]};return b}));toast(`Moved ${selected.size} cards`);setSelected(new Set());setSelectMode(false)};
  const editCardMeta=(cardId,field,value)=>{setColl(p=>p.map(c=>c.id===cardId?{...c,[field]:value}:c));if(supabase)enqueueWrite(()=>cardsApi.update(cardId,{[field]:value}))};
  const handleExportCSV=()=>{const csv=exportCollectionCSV(coll);navigator.clipboard.writeText(csv).then(()=>toast("CSV copied to clipboard")).catch(()=>window.prompt("Copy:",csv))};
  const handleImportColl=async()=>{
    const entries=parseCollectionCSV(importCollText);
    if(!entries.length){setImportCollStatus("No valid entries");return;}
    setImportCollStatus(`Importing ${entries.length} cards...`);let imported=0;
    for(const entry of entries){try{const res=await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(entry.name)}`);if(res.ok){const card=await res.json();setColl(p=>[...p,{...card,qty:entry.qty,addedAt:Date.now(),condition:entry.condition,foil:entry.foil,language:entry.language}]);imported++}await new Promise(r=>setTimeout(r,80))}catch{}}
    setImportCollStatus(`Imported ${imported}/${entries.length}`);toast(`Imported ${imported} cards`);
    setTimeout(()=>{setShowImportColl(false);setImportCollText("");setImportCollStatus("")},1500);
  };

  const items=useMemo(()=>{
    let r=[...coll];
    if(filter)r=r.filter(c=>c.name.toLowerCase().includes(filter.toLowerCase()));
    if(fColors.length)r=r.filter(c=>{const ci=c.color_identity||[];return fColors.every(fc=>ci.includes(fc))});
    if(fType)r=r.filter(c=>(c.type_line||"").toLowerCase().includes(fType));
    if(fRarity)r=r.filter(c=>c.rarity===fRarity);
    if(fSet)r=r.filter(c=>(c.set||c.set_code||"")===fSet);
    if(fMinPrice)r=r.filter(c=>parseFloat(c.prices?.usd||0)>=parseFloat(fMinPrice));
    r.sort((a,b)=>{if(sort==="name")return a.name.localeCompare(b.name);if(sort==="price")return(parseFloat(b.prices?.usd||0))-(parseFloat(a.prices?.usd||0));if(sort==="recent")return(b.addedAt||0)-(a.addedAt||0);return 0});
    return r;
  },[coll,filter,sort,fColors,fType,fRarity,fSet,fMinPrice]);

  const adj=(id,d)=>setColl(p=>p.map(c=>{if(c.id!==id)return c;const n=c.qty+d;return n<=0?null:{...c,qty:n}}).filter(Boolean));
  const hasFilters=fColors.length||fType||fRarity||fSet||fMinPrice;
  const collSets=useMemo(()=>[...new Set(coll.map(c=>c.set||c.set_code).filter(Boolean))].sort(),[coll]);

  return <>
    {/* Binder selector */}
    <div style={{display:"flex",gap:4,marginBottom:10,overflowX:"auto",paddingBottom:4}}>
      {binders.map(b=><button key={b.id} onClick={()=>setActiveBinder(b.id)} style={{padding:"6px 12px",borderRadius:4,border:activeBinder===b.id?`1.5px solid ${T.gold}`:`1px solid ${T.cardBorder}`,background:activeBinder===b.id?T.goldGlow:T.card,color:activeBinder===b.id?T.gold:T.textDim,fontSize:11,fontWeight:activeBinder===b.id?700:500,cursor:"pointer",fontFamily:F.body,flexShrink:0,whiteSpace:"nowrap"}}>{b.type==="wishlist"?"\u2661 ":""}{b.name} ({b.cards.reduce((a,c)=>a+c.qty,0)})</button>)}
      <button onClick={()=>setShowNewBinder(!showNewBinder)} style={{padding:"6px 10px",borderRadius:4,border:`1px dashed ${T.cardBorder}`,background:"transparent",color:T.textDim,fontSize:11,cursor:"pointer",fontFamily:F.body,flexShrink:0}}>+ New</button>
    </div>
    {showNewBinder&&<div style={{display:"flex",gap:6,marginBottom:10}}>
      <input value={newBinderName} onChange={e=>setNewBinderName(e.target.value)} placeholder="Binder name..." onKeyDown={e=>e.key==="Enter"&&createBinder()} style={{flex:1,padding:"8px 12px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:13,fontFamily:F.body,boxShadow:S.insetInput}}/>
      <button onClick={createBinder} style={{padding:"8px 14px",borderRadius:4,border:"none",background:T.gold,color:"#000",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:F.body}}>Create</button>
    </div>}

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <h2 style={{margin:0,fontSize:18,fontWeight:700,color:T.accent,fontFamily:F.heading,letterSpacing:.5}}>{currentBinder.name}</h2>
      <div style={{display:"flex",gap:4}}>
        {activeBinder!=="main"&&activeBinder!=="wishlist"&&<button onClick={()=>deleteBinder(activeBinder)} style={{width:32,height:32,borderRadius:4,border:"none",background:T.card,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{I.trash(T.red)}</button>}
        <button onClick={()=>setShowFilters(!showFilters)} style={{width:32,height:32,borderRadius:4,border:"none",background:showFilters||hasFilters?T.goldGlow:T.card,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>{I.search(showFilters||hasFilters?T.gold:T.textDim)}{hasFilters&&<div style={{position:"absolute",top:2,right:2,width:6,height:6,borderRadius:3,background:T.gold}}/>}</button>
        <button onClick={()=>setView("grid")} style={{width:32,height:32,borderRadius:4,border:"none",background:view==="grid"?T.goldGlow:T.card,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{I.grid(view==="grid"?T.gold:T.textDim)}</button>
        <button onClick={()=>setView("list")} style={{width:32,height:32,borderRadius:4,border:"none",background:view==="list"?T.goldGlow:T.card,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{I.list(view==="list"?T.gold:T.textDim)}</button>
      </div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
      {[["Unique",coll.length,T.text],["Total",totalCards,T.text],["Value","$"+totalVal.toFixed(2),T.green]].map(([l,v,c])=>
        <div key={l} style={{background:T.card,borderRadius:4,border:`1px solid ${T.cardBorder}`,padding:10,textAlign:"center",boxShadow:S.cardFrame}}>
          <div style={{fontSize:9,color:T.textDim,textTransform:"uppercase",letterSpacing:.5,fontFamily:F.body}}>{l}</div>
          <div style={{fontSize:16,fontWeight:800,color:c,marginTop:2,fontFamily:F.heading}}>{v}</div>
        </div>
      )}
    </div>

    {/* Bulk actions + export/import */}
    <div style={{display:"flex",gap:4,marginBottom:8}}>
      <button onClick={()=>{setSelectMode(!selectMode);setSelected(new Set())}} style={{padding:"6px 10px",borderRadius:4,border:`1px solid ${selectMode?T.gold:T.cardBorder}`,background:selectMode?T.goldGlow:"transparent",color:selectMode?T.gold:T.textDim,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:F.body}}>{selectMode?"Cancel":"Select"}</button>
      {selectMode&&<><button onClick={selectAll} style={{padding:"6px 10px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.textMuted,fontSize:10,cursor:"pointer",fontFamily:F.body}}>All ({items.length})</button>
        {selected.size>0&&<button onClick={bulkDelete} style={{padding:"6px 10px",borderRadius:4,border:`1px solid ${T.red}`,background:"transparent",color:T.red,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:F.body}}>Delete ({selected.size})</button>}
        {selected.size>0&&binders.length>1&&<select onChange={e=>{if(e.target.value)bulkMoveTo(e.target.value);e.target.value=""}} style={{padding:"6px 8px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.textMuted,fontSize:10,fontFamily:F.body}}><option value="">Move to...</option>{binders.filter(b=>b.id!==activeBinder).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}
      </>}
      {!selectMode&&<>
        <button onClick={handleExportCSV} style={{padding:"6px 10px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.textMuted,fontSize:10,cursor:"pointer",fontFamily:F.body}}>{I.export(T.textDim)} CSV</button>
        <button onClick={()=>setShowImportColl(!showImportColl)} style={{padding:"6px 10px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:showImportColl?T.goldGlow:"transparent",color:showImportColl?T.gold:T.textMuted,fontSize:10,cursor:"pointer",fontFamily:F.body}}>{I.import(T.textDim)} Import</button>
      </>}
    </div>
    {showImportColl&&<div style={{background:T.card,borderRadius:4,border:`1px solid ${T.cardBorder}`,padding:12,marginBottom:10,boxShadow:S.cardFrame}}>
      <div style={{fontSize:12,fontWeight:700,color:T.accent,marginBottom:6,fontFamily:F.heading}}>Import Collection (CSV)</div>
      <div style={{fontSize:10,color:T.textDim,marginBottom:6,fontFamily:F.body}}>Paste CSV with headers: Quantity,Name,Set,Set Code,Collector Number,Condition,Foil,Language,Price USD</div>
      <textarea value={importCollText} onChange={e=>setImportCollText(e.target.value)} placeholder={"Quantity,Name,...\n1,\"Lightning Bolt\",...\n4,\"Counterspell\",..."} style={{width:"100%",height:100,padding:10,borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:12,resize:"vertical",boxSizing:"border-box",fontFamily:"monospace",lineHeight:1.4,boxShadow:S.insetInput}}/>
      <div style={{display:"flex",gap:8,marginTop:6,alignItems:"center"}}>
        <button onClick={handleImportColl} disabled={!importCollText.trim()} style={{padding:"8px 16px",borderRadius:4,border:"none",background:importCollText.trim()?`linear-gradient(135deg,${T.gold},${T.goldDark})`:"#333",color:importCollText.trim()?"#000":"#666",fontSize:12,fontWeight:700,cursor:importCollText.trim()?"pointer":"default",fontFamily:F.body}}>Import</button>
        {importCollStatus&&<span style={{fontSize:11,color:T.gold,fontFamily:F.body}}>{importCollStatus}</span>}
      </div>
    </div>}

    <div style={{display:"flex",gap:8,marginBottom:showFilters?8:12}}>
      <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter cards..." style={{flex:1,padding:"10px 14px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:13,fontFamily:F.body,boxShadow:S.insetInput}}/>
      <select value={sort} onChange={e=>setSort(e.target.value)} style={{padding:"10px 12px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.textMuted,fontSize:12,fontFamily:F.body}}><option value="name">A-Z</option><option value="price">Price</option><option value="recent">Recent</option></select>
    </div>

    {showFilters&&<div style={{display:"flex",gap:4,overflowX:"auto",alignItems:"center",paddingBottom:8,marginBottom:4}}>
      <ColorPills colors={fColors} setColors={setFColors} size={28}/>
      <TypeSelect type={fType} setType={setFType} h={30}/>
      <select value={fRarity} onChange={e=>setFRarity(e.target.value)} style={{padding:"0 10px",borderRadius:18,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.textMuted,fontSize:11,cursor:"pointer",flexShrink:0,appearance:"none",minWidth:68,height:30,textAlign:"center"}}><option value="">All rarities</option>{["common","uncommon","rare","mythic"].map(r=><option key={r} value={r}>{r[0].toUpperCase()+r.slice(1)}</option>)}</select>
      {collSets.length>1&&<select value={fSet} onChange={e=>setFSet(e.target.value)} style={{padding:"0 8px",borderRadius:18,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.textMuted,fontSize:11,cursor:"pointer",flexShrink:0,appearance:"none",minWidth:52,height:30,textAlign:"center"}}><option value="">All sets</option>{collSets.map(s=><option key={s} value={s}>{s.toUpperCase()}</option>)}</select>}
      <select value={fMinPrice} onChange={e=>setFMinPrice(e.target.value)} style={{padding:"0 8px",borderRadius:18,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.textMuted,fontSize:11,cursor:"pointer",flexShrink:0,appearance:"none",minWidth:52,height:30,textAlign:"center"}}><option value="">Min $</option><option value="1">$1+</option><option value="5">$5+</option><option value="10">$10+</option><option value="20">$20+</option><option value="50">$50+</option></select>
      {hasFilters&&<button onClick={()=>{setFColors([]);setFType("");setFRarity("");setFSet("");setFMinPrice("")}} style={{padding:"4px 10px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.textDim,fontSize:10,cursor:"pointer",flexShrink:0,fontFamily:F.body}}>Clear</button>}
    </div>}

    {coll.length===0?<div style={{textAlign:"center",padding:"48px 20px",color:T.textDim}}>
      <div style={{marginBottom:12}}>{I.binder(T.textDim)}</div>
      <div style={{fontSize:15,color:T.textMuted,fontFamily:F.body}}>Your collection is empty</div>
      <div style={{fontSize:13,marginTop:4,marginBottom:14,fontFamily:F.body}}>Collect cards from the Search tab</div>
      <div style={{fontSize:13,color:T.textDim,fontStyle:"italic",lineHeight:1.6,fontFamily:F.body}}>{randomFlavor("binder")}</div>
    </div>
    :items.length===0?<div style={{textAlign:"center",padding:"40px 20px",color:T.textDim,fontFamily:F.body}}>The spell fizzles \u2014 no cards match</div>
    :view==="grid"?<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
      {items.map((c,i)=><div key={c.id} style={{position:"relative",borderRadius:4,overflow:"hidden",background:T.card,border:`1px solid ${selected.has(c.id)?T.gold:T.cardBorder}`,cursor:"pointer",boxShadow:S.cardFrame}} onClick={()=>selectMode?toggleSelect(c.id):setSlideIdx(i)}>
        <img src={getImg(c,"small")} alt={c.name} style={{width:"100%",display:"block"}}/>
        {c.qty>1&&<div style={{position:"absolute",top:4,right:4,background:T.gold,color:"#000",borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:800}}>{c.qty}</div>}
        <div style={{padding:"6px 8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:11,fontWeight:600,color:T.green,fontFamily:F.body}}>{fmt(c.prices?.usd)}</span>
          <div style={{display:"flex",gap:2}}>
            <button onClick={e=>{e.stopPropagation();adj(c.id,-1)}} style={{width:32,height:32,borderRadius:6,border:"none",background:"#1E1215",color:T.red,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2212"}</button>
            <button onClick={e=>{e.stopPropagation();adj(c.id,1)}} style={{width:32,height:32,borderRadius:6,border:"none",background:"#0F1E15",color:T.green,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
          </div>
        </div>
      </div>)}
    </div>
    :items.map((c,i)=><div key={c.id} onClick={()=>selectMode?toggleSelect(c.id):setSlideIdx(i)} style={{display:"flex",alignItems:"center",padding:"10px 12px",borderRadius:4,marginBottom:4,background:T.card,cursor:"pointer",backgroundImage:S.texture,border:`1px solid ${selected.has(c.id)?T.gold:"transparent"}`}}>
      <img src={getImg(c,"small")} alt={c.name} style={{width:40,height:56,borderRadius:3,objectFit:"cover",marginRight:10}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:F.body}}>{c.name}</div>
        <div style={{display:"flex",gap:4,alignItems:"center",marginTop:2,flexWrap:"wrap"}}><Cost c={c.mana_cost} sz={12}/><span style={{fontSize:10,color:T.textDim,fontFamily:F.body}}>{c.set_name}</span>
          {c.condition&&c.condition!=="NM"&&<span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:c.condition==="LP"?"#2A2A0F":c.condition==="MP"?"#2A1A0F":"#2A0F0F",color:c.condition==="LP"?"#E8C349":c.condition==="MP"?"#F09030":T.red,fontWeight:700}}>{c.condition}</span>}
          {c.foil&&<span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:"#1A0F2A",color:T.purple,fontWeight:700}}>FOIL</span>}
          {c.language&&c.language!=="en"&&<span style={{fontSize:8,padding:"1px 4px",borderRadius:3,background:T.cardInner,color:T.textDim}}>{c.language.toUpperCase()}</span>}
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
        <button onClick={e=>{e.stopPropagation();adj(c.id,-1)}} style={{width:30,height:30,borderRadius:4,border:"none",background:"#1E1215",color:T.red,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2212"}</button>
        <span style={{fontSize:14,fontWeight:700,minWidth:20,textAlign:"center",fontFamily:F.body}}>{c.qty}</span>
        <button onClick={e=>{e.stopPropagation();adj(c.id,1)}} style={{width:30,height:30,borderRadius:4,border:"none",background:"#0F1E15",color:T.green,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
        <span style={{fontSize:12,color:T.green,minWidth:48,textAlign:"right",fontWeight:600,fontFamily:F.body}}>{fmt(c.prices?.usd)}</span>
      </div>
    </div>)}

    {slideIdx>=0&&items[slideIdx]&&<CardSlider cards={items} index={slideIdx} onIndexChange={setSlideIdx} onClose={()=>setSlideIdx(-1)}
      actions={card=>{const cc=coll.find(c=>c.id===card.id);return<div>
        <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
          <button onClick={()=>{adj(card.id,-1);if((cc?.qty||1)<=1)setSlideIdx(-1)}} style={{width:44,height:44,borderRadius:4,border:`2px solid ${T.red}`,background:"transparent",color:T.red,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2212"}</button>
          <span style={{fontSize:18,fontWeight:800,minWidth:30,textAlign:"center",fontFamily:F.heading}}>{cc?.qty||0}</span>
          <button onClick={()=>adj(card.id,1)} style={{width:44,height:44,borderRadius:4,border:`2px solid ${T.green}`,background:"transparent",color:T.green,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
          <div style={{flex:1}}/>
          <span style={{fontSize:14,fontWeight:700,color:T.green,fontFamily:F.body}}>{fmt(card.foil?card.prices?.usd_foil:card.prices?.usd)}</span>
        </div>
        {/* Metadata editing */}
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <select value={cc?.condition||"NM"} onChange={e=>editCardMeta(card.id,"condition",e.target.value)} style={{padding:"5px 8px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:11,fontFamily:F.body}}>
            {CONDITIONS.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:T.textMuted,fontFamily:F.body,cursor:"pointer"}}>
            <input type="checkbox" checked={cc?.foil||false} onChange={e=>editCardMeta(card.id,"foil",e.target.checked)} style={{accentColor:T.purple}}/> Foil
          </label>
          <select value={cc?.language||"en"} onChange={e=>editCardMeta(card.id,"language",e.target.value)} style={{padding:"5px 8px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:11,fontFamily:F.body}}>
            {LANGUAGES.map(l=><option key={l} value={l}>{LANG_LABELS[l]}</option>)}
          </select>
        </div>
        {/* Per-card notes */}
        <input value={cc?.notes||""} onChange={e=>editCardMeta(card.id,"notes",e.target.value)} placeholder="Card notes..." style={{width:"100%",marginTop:6,padding:"6px 10px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:11,fontFamily:F.body,boxSizing:"border-box",boxShadow:S.insetInput}}/>
      </div>}}
    />}
  </>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TRADE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TradeView({toast}) {
  const [give,setGive]=useState([]);const [recv,setRecv]=useState([]);
  const [side,setSide]=useState(null);const [q,setQ]=useState("");const [results,setResults]=useState([]);
  const [history,setHistory]=useState([]);const [showHistory,setShowHistory]=useState(false);
  const dQ=useDebounce(q,350);
  useEffect(()=>{let c=false;if(dQ.length<2){setResults([]);return;}searchCards(dQ).then(r=>{if(!c)setResults(r)});return()=>{c=true}},[dQ]);
  // Load trade history
  useEffect(()=>{
    if(supabase){tradeApi.list().then(({data})=>{if(data&&data.length)setHistory(data.map(t=>({id:t.id,date:t.trade_date,give:t.give,recv:t.recv,giveTotal:t.give_total,recvTotal:t.recv_total})))})}
    else{store.get("av-trade-history").then(h=>{if(h)setHistory(h)})}
  },[]);

  const add=card=>{const e={...card,uid:Date.now(),qty:1};if(side==="give")setGive(p=>[...p,e]);else setRecv(p=>[...p,e]);setSide(null);setQ("");setResults([]);toast(`Added ${card.name}`)};
  const adjTrade=(list,setList,uid,d)=>setList(p=>p.map(c=>{if(c.uid!==uid)return c;const n=c.qty+d;return n<=0?null:{...c,qty:n}}).filter(Boolean));
  const giveT=give.reduce((a,c)=>a+(parseFloat(c.prices?.usd||0))*(c.qty||1),0);
  const recvT=recv.reduce((a,c)=>a+(parseFloat(c.prices?.usd||0))*(c.qty||1),0);
  const diff=giveT-recvT;
  const clearAll=()=>{setGive([]);setRecv([]);toast("Trade cleared","info")};
  const saveTrade=async()=>{
    if(!give.length&&!recv.length)return;
    const entry={id:Date.now(),date:new Date().toISOString().split("T")[0],give:give.map(c=>({name:c.name,qty:c.qty,price:c.prices?.usd})),recv:recv.map(c=>({name:c.name,qty:c.qty,price:c.prices?.usd})),giveTotal:giveT,recvTotal:recvT};
    const newH=[entry,...history].slice(0,20);setHistory(newH);
    if(supabase){try{await tradeApi.save(entry)}catch{}}
    else{store.set("av-trade-history",newH)}
    toast("Trade saved to history");setGive([]);setRecv([]);
  };

  const TradeSide=({title,cards,s,total,clr,onRm,onAdj})=><div style={{flex:1}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
      <span style={{fontSize:13,fontWeight:700,color:clr,fontFamily:F.heading}}>{title} ({cards.reduce((a,c)=>a+(c.qty||1),0)})</span>
      <span style={{fontSize:12,fontWeight:700,color:T.green,fontFamily:F.body}}>${total.toFixed(2)}</span>
    </div>
    <div style={{background:T.card,borderRadius:4,border:`1px solid ${clr}22`,minHeight:100,padding:6,boxShadow:S.cardFrame}}>
      {cards.map(c=><div key={c.uid} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 6px",borderRadius:4,marginBottom:3,background:T.cardInner}}>
        <img src={getImg(c,"small")} alt={c.name} style={{width:24,height:34,borderRadius:3,objectFit:"cover",flexShrink:0}}/>
        <div style={{flex:1,minWidth:0}}><div style={{fontSize:10,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:F.body}}>{c.name}</div><span style={{fontSize:9,color:T.green,fontFamily:F.body}}>{(c.qty||1)>1?`${c.qty}x `:""}{fmt(c.prices?.usd)}</span></div>
        <div style={{display:"flex",alignItems:"center",gap:2,flexShrink:0}}>
          <button onClick={()=>onAdj(c.uid,-1)} style={{width:28,height:28,borderRadius:6,border:"none",background:"#1E1215",color:T.red,fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2212"}</button>
          <span style={{fontSize:10,fontWeight:700,minWidth:14,textAlign:"center",fontFamily:F.body}}>{c.qty||1}</span>
          <button onClick={()=>onAdj(c.uid,1)} style={{width:28,height:28,borderRadius:6,border:"none",background:"#0F1E15",color:T.green,fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
        </div>
      </div>)}
      <button onClick={()=>{setSide(s);setQ("");setResults([])}} style={{width:"100%",padding:10,borderRadius:4,border:`1px dashed ${T.cardBorder}`,background:"transparent",color:T.textDim,fontSize:11,cursor:"pointer",marginTop:4,fontFamily:F.body}}>+ Add card</button>
    </div>
  </div>;

  return <div style={{padding:16}}>
    {(give.length===0&&recv.length===0)&&<div style={{textAlign:"center",padding:"20px 20px 28px",color:T.textDim}}>
      <div style={{fontSize:14,color:T.textMuted,marginBottom:4,fontFamily:F.body}}>Evaluate your trades in real-time</div>
      <div style={{fontSize:13,fontStyle:"italic",lineHeight:1.6,fontFamily:F.body}}>{randomFlavor("trade")}</div>
    </div>}

    <BottomSheet open={!!side} onClose={()=>setSide(null)}>
      <div style={{padding:"8px 20px 20px"}}>
        <div style={{fontSize:16,fontWeight:700,color:T.accent,marginBottom:10,fontFamily:F.heading}}>Add to {side==="give"?"Giving":"Receiving"}</div>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Name a card..." autoFocus style={{width:"100%",padding:"12px 14px",borderRadius:4,border:`1px solid ${T.cardBorder}`,background:T.cardInner,color:T.text,fontSize:14,boxSizing:"border-box",marginBottom:6,fontFamily:F.body,boxShadow:S.insetInput}}/>
        {results.map(c=><div key={c.id} onClick={()=>add(c)} style={{display:"flex",alignItems:"center",gap:10,padding:10,borderRadius:4,marginBottom:2,background:T.cardInner,cursor:"pointer"}}>
          <img src={getImg(c,"small")} alt={c.name} style={{width:32,height:45,borderRadius:3,objectFit:"cover"}}/>
          <div style={{flex:1,minWidth:0}}><div style={{fontSize:14,fontWeight:600,fontFamily:F.body}}>{c.name}</div><Cost c={c.mana_cost} sz={12}/></div>
          <span style={{fontSize:12,color:T.green,fontWeight:600,flexShrink:0,fontFamily:F.body}}>{fmt(c.prices?.usd)}</span>
        </div>)}
      </div>
    </BottomSheet>

    <div style={{display:"flex",gap:8}}>
      <TradeSide title="Giving" cards={give} s="give" total={giveT} clr={T.red} onRm={uid=>setGive(p=>p.filter(c=>c.uid!==uid))} onAdj={(uid,d)=>adjTrade(give,setGive,uid,d)}/>
      <TradeSide title="Receiving" cards={recv} s="recv" total={recvT} clr={T.green} onRm={uid=>setRecv(p=>p.filter(c=>c.uid!==uid))} onAdj={(uid,d)=>adjTrade(recv,setRecv,uid,d)}/>
    </div>

    {(give.length>0||recv.length>0)&&<>
      <div style={{marginTop:16,background:T.card,borderRadius:4,border:`1px solid ${T.cardBorder}`,padding:16,textAlign:"center",boxShadow:S.cardFrame}}>
        <div style={{fontSize:11,color:T.textDim,marginBottom:6,fontFamily:F.body}}>Trade Balance</div>
        <div style={{fontSize:22,fontWeight:800,color:Math.abs(diff)<1?T.green:diff>0?T.red:T.blue,fontFamily:F.heading}}>
          {Math.abs(diff)<0.5?"Balanced \u2014 the Scales hold":diff>0?`You sacrifice $${diff.toFixed(2)}`:`You gain $${Math.abs(diff).toFixed(2)} value`}
        </div>
        <div style={{marginTop:10,height:8,borderRadius:4,background:T.cardInner,overflow:"hidden"}}>
          {(giveT+recvT)>0&&<div style={{width:`${(giveT/(giveT+recvT))*100}%`,height:"100%",borderRadius:4,background:Math.abs(diff)<1?T.green:`linear-gradient(90deg,${T.red},${T.gold})`,transition:"width .3s"}}/>}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:10,color:T.textDim,fontFamily:F.body}}><span>Give: ${giveT.toFixed(2)}</span><span>Get: ${recvT.toFixed(2)}</span></div>
      </div>
      <div style={{display:"flex",gap:6,marginTop:8}}>
        <button onClick={saveTrade} style={{flex:1,padding:10,borderRadius:4,border:"none",background:`linear-gradient(135deg,${T.gold},${T.goldDark})`,color:"#000",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:F.body,boxShadow:S.goldGlow}}>Save Trade</button>
        <button onClick={clearAll} style={{flex:1,padding:10,borderRadius:4,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.textDim,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:F.body}}>Clear All</button>
      </div>
    </>}

    {/* Trade History */}
    {history.length>0&&<div style={{marginTop:16}}>
      <button onClick={()=>setShowHistory(!showHistory)} style={{fontSize:12,color:T.textMuted,background:"none",border:"none",cursor:"pointer",fontFamily:F.body,padding:0,textDecoration:"underline"}}>{showHistory?"Hide":"Show"} trade history ({history.length})</button>
      {showHistory&&<div style={{marginTop:8}}>
        {history.map(h=><div key={h.id} style={{background:T.card,borderRadius:4,border:`1px solid ${T.cardBorder}`,padding:10,marginBottom:6,boxShadow:S.cardFrame}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:10,color:T.textDim,fontFamily:F.body}}>{h.date}</span>
            <span style={{fontSize:10,color:Math.abs(h.giveTotal-h.recvTotal)<1?T.green:h.giveTotal>h.recvTotal?T.red:T.blue,fontWeight:700,fontFamily:F.body}}>
              {Math.abs(h.giveTotal-h.recvTotal)<.5?"Fair":h.giveTotal>h.recvTotal?`-$${(h.giveTotal-h.recvTotal).toFixed(2)}`:`+$${(h.recvTotal-h.giveTotal).toFixed(2)}`}
            </span>
          </div>
          <div style={{display:"flex",gap:8,fontSize:10,fontFamily:F.body}}>
            <div style={{flex:1}}><span style={{color:T.red,fontWeight:600}}>Gave:</span> {h.give.map(c=>`${c.qty}x ${c.name}`).join(", ")||"nothing"}</div>
            <div style={{flex:1}}><span style={{color:T.green,fontWeight:600}}>Got:</span> {h.recv.map(c=>`${c.qty}x ${c.name}`).join(", ")||"nothing"}</div>
          </div>
        </div>)}
      </div>}
    </div>}
  </div>;
}
