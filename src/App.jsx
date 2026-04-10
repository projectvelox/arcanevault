import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCRYFALL API HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const PLACEHOLDER_IMG = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const getImg = (card, version = "normal") => {
  const uris = card?.image_uris || card?.card_faces?.[0]?.image_uris;
  if (!uris) return PLACEHOLDER_IMG;
  return version === "small" ? (uris.small || uris.normal) : uris.normal;
};

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

async function searchScryfall(query, colors = [], type = "", set = "") {
  let parts = [];
  if (query) parts.push(query);
  if (colors.length) parts.push(`id>=${colors.join("").toLowerCase()}`);
  if (type) parts.push(`t:${type}`);
  if (set) parts.push(`set:${set}`);
  if (!parts.length) return { data: [], total: 0 };
  const q = parts.join(" ");
  try {
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=name&unique=${set ? "prints" : "cards"}`);
    if (!res.ok) return { data: [], total: 0 };
    const json = await res.json();
    return { data: json.data || [], total: json.total_cards || 0 };
  } catch { return { data: [], total: 0 }; }
}

async function searchByName(query) {
  if (query.length < 2) return [];
  try {
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=name&unique=cards`);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []).slice(0, 10);
  } catch { return []; }
}

async function fetchPrintings(cardName) {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${cardName}"`)}&unique=prints&order=released`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch { return []; }
}

async function fetchSets() {
  try {
    const res = await fetch("https://api.scryfall.com/sets");
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []).filter(s => ["core","expansion","masters","draft_innovation","funny"].includes(s.set_type)).slice(0, 80);
  } catch { return []; }
}

// OCR scanner
async function scanCardImage(file) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  const { data: { text } } = await worker.recognize(file);
  await worker.terminate();
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  return lines[0] || "";
}

// Parse decklist text
function parseDeckList(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("//") && !l.startsWith("#"));
  const entries = [];
  let board = "main";
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower === "sideboard" || lower === "sideboard:" || lower === "// sideboard") { board = "sideboard"; continue; }
    if (lower === "commander" || lower === "commander:" || lower === "// commander") { board = "commander"; continue; }
    if (lower === "mainboard" || lower === "mainboard:" || lower === "main:" || lower === "// mainboard") { board = "main"; continue; }
    const match = line.match(/^(\d+)x?\s+(.+)$/i);
    if (match) {
      entries.push({ qty: parseInt(match[1]), name: match[2].trim(), board });
    } else {
      entries.push({ qty: 1, name: line, board });
    }
  }
  return entries;
}

// Export decklist as text
function exportDeckList(deck) {
  let out = "";
  const commander = deck.cards.filter(c => c.board === "commander");
  const main = deck.cards.filter(c => c.board === "main");
  const side = deck.cards.filter(c => c.board === "sideboard");
  if (commander.length) {
    out += "Commander\n";
    commander.forEach(c => { out += `${c.qty} ${c.name}\n`; });
    out += "\n";
  }
  if (main.length) {
    main.forEach(c => { out += `${c.qty} ${c.name}\n`; });
  }
  if (side.length) {
    out += "\nSideboard\n";
    side.forEach(c => { out += `${c.qty} ${c.name}\n`; });
  }
  return out.trim();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS & THEME
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const fmt = (p) => p ? `$${parseFloat(p).toFixed(2)}` : "\u2014";
const MCLR = { W:"#F9FAF4",U:"#0E68AB",B:"#211510",R:"#D3202A",G:"#00733E",C:"#CAC5C0" };
const MBDR = { W:"#C4B998",U:"#064A7A",B:"#44403C",R:"#9A1620",G:"#005C30",C:"#9E9A96" };
const MTXT = { W:"#444",U:"#fff",B:"#C9A96E",R:"#fff",G:"#fff",C:"#444" };

const RARITY_CLR = { common:"#9A9DAE", uncommon:"#B8C4D0", rare:"#E8C349", mythic:"#F06834", special:"#9F5FBF", bonus:"#9F5FBF" };
const RARITY_LABEL = { common:"C", uncommon:"U", rare:"R", mythic:"M", special:"S", bonus:"B" };

const T = {
  bg: "#0C0E14",
  card: "#12141F",
  cardBorder: "#1E2235",
  surface: "#181B2A",
  gold: "#C9A96E",
  goldDark: "#A88B4A",
  goldGlow: "rgba(201,169,110,.15)",
  text: "#E2E0DC",
  textMuted: "#8A8D9E",
  textDim: "#5A5D6E",
  accent: "#F0D78C",
  green: "#4ADE80",
  red: "#EF4444",
  blue: "#60A5FA",
  purple: "#C084FC",
};

// MTG Flavor quotes for empty states
const FLAVOR = {
  search: ['"The greatest bounty is that which you have yet to discover." \u2014 Jace Beleren', '"Knowledge has a price. Are you willing to pay it?"'],
  decks: ['"A true warrior is always prepared." \u2014 Gideon Jura', '"The battlefield is won before the first spell is cast."'],
  binder: ['"Every artifact tells a story of its creator." \u2014 Urza', '"A collector\u2019s eye sees value where others see dust."'],
  trade: ['"Fair trade is a spell that benefits both casters."', '"The Bazaar of Baghdad never closes."'],
};
const randomFlavor = (key) => FLAVOR[key][Math.floor(Math.random() * FLAVOR[key].length)];

function Pip({s,sz=18}) {
  return <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:sz,height:sz,borderRadius:"50%",background:MCLR[s]||"#aaa",border:`1.5px solid ${MBDR[s]||"#666"}`,fontSize:sz*.55,fontWeight:800,color:MTXT[s]||"#fff",flexShrink:0}}>{s}</span>;
}
function Cost({c,sz=18}) {
  if(!c) return null;
  return <span style={{display:"inline-flex",gap:2,alignItems:"center"}}>{(c.match(/\{([^}]+)\}/g)||[]).map((p,i)=>{const s=p.replace(/[{}]/g,"");return "WUBRGC".includes(s)?<Pip key={i} s={s} sz={sz}/>:<span key={i} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:sz,height:sz,borderRadius:"50%",background:"#ddd",border:"1.5px solid #bbb",fontSize:sz*.55,fontWeight:800,color:"#333"}}>{s}</span>;})}</span>;
}

function RarityBadge({rarity,sz=16}) {
  const c = RARITY_CLR[rarity] || RARITY_CLR.common;
  const l = RARITY_LABEL[rarity] || "?";
  return <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:sz,height:sz,borderRadius:3,background:`${c}22`,border:`1px solid ${c}55`,fontSize:sz*.55,fontWeight:800,color:c,flexShrink:0,lineHeight:1}}>{l}</span>;
}

const store = {
  async get(k){try{const v=localStorage.getItem(k);return v?JSON.parse(v):null}catch{return null}},
  async set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){console.error(e)}},
};

const typeCategory = (typeLine) => {
  if (!typeLine) return "Other";
  const t = typeLine.toLowerCase();
  if (t.includes("creature")) return "Creatures";
  if (t.includes("instant")) return "Instants";
  if (t.includes("sorcery")) return "Sorceries";
  if (t.includes("enchantment")) return "Enchantments";
  if (t.includes("artifact")) return "Artifacts";
  if (t.includes("planeswalker")) return "Planeswalkers";
  if (t.includes("land")) return "Lands";
  return "Other";
};
const TYPE_ORDER = ["Creatures","Planeswalkers","Instants","Sorceries","Enchantments","Artifacts","Lands","Other"];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SVG ICONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const Icons = {
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
  chevLeft: (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>,
  chevRight: (c) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>,
  plus: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  sparkle: (c) => <svg width="20" height="20" viewBox="0 0 24 24" fill={c} stroke="none"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/></svg>,
  grid: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  list: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  check: (c) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  copy: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  chevDown: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>,
  chevUp: (c) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6"/></svg>,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TOAST NOTIFICATION SYSTEM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((msg, type = "success") => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 2200);
  }, []);
  return { toasts, show };
}

function ToastContainer({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 500, display: "flex", flexDirection: "column", gap: 6, width: "90%", maxWidth: 400, pointerEvents: "none" }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: "10px 16px", borderRadius: 12, display: "flex", alignItems: "center", gap: 8,
          background: t.type === "success" ? "#0F2A1A" : t.type === "error" ? "#2A0F0F" : T.surface,
          border: `1px solid ${t.type === "success" ? T.green + "44" : t.type === "error" ? T.red + "44" : T.cardBorder}`,
          color: t.type === "success" ? T.green : t.type === "error" ? T.red : T.text,
          fontSize: 13, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,.5)",
          animation: "toastIn .25s ease-out",
        }}>
          {t.type === "success" && Icons.check(T.green)}
          {t.msg}
        </div>
      ))}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BOTTOM SHEET
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function BottomSheet({open,onClose,children}) {
  if(!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.7)"}}/>
      <div onClick={e=>e.stopPropagation()} style={{
        position:"relative",background:T.surface,borderRadius:"20px 20px 0 0",
        maxHeight:"88vh",overflow:"auto",paddingBottom:32,
        animation:"slideUp .25s ease-out"
      }}>
        <div style={{display:"flex",justifyContent:"center",padding:"10px 0 4px"}}><div style={{width:40,height:4,borderRadius:2,background:"#3A3D4E"}}/></div>
        {children}
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONFIRM DIALOG
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ConfirmDialog({open,title,message,confirmLabel="Delete",confirmColor=T.red,onConfirm,onCancel}) {
  if (!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:32}} onClick={onCancel}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.7)"}}/>
      <div onClick={e=>e.stopPropagation()} style={{
        position:"relative",background:T.surface,borderRadius:16,padding:24,maxWidth:320,width:"100%",
        border:`1px solid ${T.cardBorder}`,animation:"toastIn .2s ease-out"
      }}>
        <div style={{fontSize:16,fontWeight:800,color:T.accent,marginBottom:8}}>{title}</div>
        <div style={{fontSize:13,color:T.textMuted,marginBottom:20,lineHeight:1.5}}>{message}</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onCancel} style={{flex:1,padding:"12px",borderRadius:10,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.textMuted,fontSize:13,fontWeight:600,cursor:"pointer"}}>Cancel</button>
          <button onClick={onConfirm} style={{flex:1,padding:"12px",borderRadius:10,border:"none",background:confirmColor,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SWIPEABLE CARD VIEWER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function CardSlider({cards,index,onIndexChange,onClose,actions}) {
  const [dragX,setDragX]=useState(0);
  const [dragging,setDragging]=useState(false);
  const [printings,setPrintings]=useState([]);
  const [showPrintings,setShowPrintings]=useState(false);
  const startX=useRef(0);
  const card=cards[index];
  if(!card) return null;

  const loadPrintings = async () => {
    if (showPrintings) { setShowPrintings(false); return; }
    const p = await fetchPrintings(card.name);
    setPrintings(p);
    setShowPrintings(true);
  };

  const onTouchStart=(e)=>{startX.current=e.touches[0].clientX;setDragging(true);setDragX(0)};
  const onTouchMove=(e)=>{if(dragging)setDragX(e.touches[0].clientX-startX.current)};
  const onTouchEnd=()=>{
    setDragging(false);
    if(dragX<-60&&index<cards.length-1) onIndexChange(index+1);
    else if(dragX>60&&index>0) onIndexChange(index-1);
    setDragX(0);
  };

  const rarityColor = RARITY_CLR[card.rarity] || RARITY_CLR.common;

  return (
    <div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,.95)",display:"flex",flexDirection:"column"}}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",flexShrink:0}}>
        <button onClick={onClose} style={{background:"none",border:"none",color:T.textMuted,fontSize:14,cursor:"pointer",padding:"8px",display:"flex",alignItems:"center",gap:6}}>
          {Icons.close(T.textMuted)} Close
        </button>
        <span style={{fontSize:12,color:T.textDim}}>{index+1} / {cards.length}</span>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>index>0&&onIndexChange(index-1)} disabled={index===0}
            style={{background:"none",border:`1px solid ${T.cardBorder}`,borderRadius:8,width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            {Icons.chevLeft(index>0?T.gold:"#333")}
          </button>
          <button onClick={()=>index<cards.length-1&&onIndexChange(index+1)} disabled={index>=cards.length-1}
            style={{background:"none",border:`1px solid ${T.cardBorder}`,borderRadius:8,width:36,height:36,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            {Icons.chevRight(index<cards.length-1?T.gold:"#333")}
          </button>
        </div>
      </div>

      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",overflow:"auto",padding:"0 16px"}}>
        <img src={getImg(card)} alt={card.name}
          style={{maxWidth:"85%",maxHeight:"46vh",borderRadius:14,transform:`translateX(${dragX*.3}px) rotate(${dragX*.02}deg)`,transition:dragging?"none":"transform .2s",pointerEvents:"none"}}/>
        <div style={{marginTop:12,textAlign:"center",width:"100%",maxWidth:340}}>
          <h3 style={{margin:"0 0 4px",fontSize:20,fontWeight:800,color:T.accent}}>{card.name}</h3>
          <div style={{display:"flex",justifyContent:"center",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <Cost c={card.mana_cost} sz={20}/>
            <span style={{fontSize:12,color:T.textMuted}}>{card.type_line}</span>
            {card.rarity && <span style={{fontSize:10,fontWeight:700,color:rarityColor,textTransform:"uppercase",padding:"1px 6px",borderRadius:4,background:`${rarityColor}18`}}>{card.rarity}</span>}
          </div>
          {card.set_name && <div style={{fontSize:11,color:T.textDim,marginTop:3}}>{card.set_name} ({card.set?.toUpperCase()})</div>}
          {card.power&&<div style={{fontSize:14,color:T.gold,marginTop:4,fontWeight:700}}>{card.power}/{card.toughness}</div>}
          <div style={{marginTop:8,padding:12,background:T.card,borderRadius:12,fontSize:12,color:"#CCC",lineHeight:1.6,textAlign:"left"}}>
            {(card.oracle_text||card.card_faces?.[0]?.oracle_text||"").split("\n").map((l,i,a)=><div key={i} style={{marginBottom:i<a.length-1?4:0}}>{l}</div>)}
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:12,marginTop:8}}>
            {[["USD",card.prices?.usd,T.green],["Foil",card.prices?.usd_foil,T.purple],["EUR",card.prices?.eur,T.blue]].map(([l,v,c])=>(
              <span key={l} style={{fontSize:12,color:c,fontWeight:700}}>{l}: {fmt(v)}</span>
            ))}
          </div>

          <button onClick={loadPrintings} style={{
            marginTop:8,padding:"6px 16px",borderRadius:8,border:`1px solid ${T.cardBorder}`,
            background:showPrintings?T.goldGlow:"transparent",color:T.gold,fontSize:11,fontWeight:600,cursor:"pointer"
          }}>
            {showPrintings ? "Hide Printings" : "View All Printings"}
          </button>
          {showPrintings && printings.length > 0 && (
            <div style={{marginTop:8,maxHeight:160,overflowY:"auto",background:T.card,borderRadius:10,padding:6}}>
              {printings.map(p => (
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:6,marginBottom:2,background:p.id===card.id?T.goldGlow:"transparent"}}>
                  <img src={getImg(p,"small")} alt={p.set_name} style={{width:28,height:39,borderRadius:3,objectFit:"cover"}}/>
                  <div style={{flex:1,textAlign:"left",minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.set_name}</div>
                    <div style={{fontSize:10,color:T.textDim}}>{p.set?.toUpperCase()} {p.collector_number}</div>
                  </div>
                  <span style={{fontSize:11,color:T.green,fontWeight:600,flexShrink:0}}>{fmt(p.prices?.usd)}</span>
                </div>
              ))}
            </div>
          )}

          {card.legalities&&<div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:8,justifyContent:"center"}}>
            {Object.entries(card.legalities).map(([f,v])=>(
              <span key={f} style={{
                padding:"2px 6px",borderRadius:4,fontSize:9,fontWeight:600,textTransform:"uppercase",
                background:v==="legal"?"#0F2A1A":v==="banned"?"#2A0F0F":"#1A1A2A",
                color:v==="legal"?T.green:v==="banned"?T.red:T.textDim,
              }}>{f}</span>
            ))}
          </div>}
        </div>
      </div>

      {actions&&<div style={{padding:"12px 16px",flexShrink:0}}>{actions(card)}</div>}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE HEADER (contextual, replaces permanent branding)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function PageHeader({title,subtitle,right}) {
  return (
    <div style={{
      padding:"12px 18px 10px",flexShrink:0,
      background:`linear-gradient(180deg, ${T.surface} 0%, ${T.bg} 100%)`,
      borderBottom:`1px solid ${T.cardBorder}`,
      display:"flex",justifyContent:"space-between",alignItems:"center",
    }}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{
          width:30,height:30,borderRadius:8,
          background:`linear-gradient(135deg, ${T.gold}, ${T.goldDark})`,
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:`0 2px 8px ${T.goldGlow}`,flexShrink:0,
        }}>
          {Icons.sparkle("#0C0E14")}
        </div>
        <div>
          <div style={{fontSize:16,fontWeight:800,color:T.accent,lineHeight:1.1}}>{title}</div>
          {subtitle && <div style={{fontSize:9,fontWeight:600,letterSpacing:1.5,color:T.textDim,textTransform:"uppercase",marginTop:1}}>{subtitle}</div>}
        </div>
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN APP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function App() {
  const [tab,setTab]=useState("search");
  const [decks,setDecks]=useState([]);
  const [coll,setColl]=useState([]);
  const [ready,setReady]=useState(false);
  const { toasts, show: toast } = useToast();

  useEffect(()=>{(async()=>{
    const d=await store.get("av-decks"),c=await store.get("av-coll");
    if(d)setDecks(d);if(c)setColl(c);setReady(true);
  })()},[]);
  useEffect(()=>{if(ready)store.set("av-decks",decks)},[decks,ready]);
  useEffect(()=>{if(ready)store.set("av-coll",coll)},[coll,ready]);

  const addColl=useCallback((card)=>{
    setColl(p=>{const ex=p.find(c=>c.id===card.id);if(ex)return p.map(c=>c===ex?{...c,qty:c.qty+1}:c);return[...p,{...card,qty:1,addedAt:Date.now()}]});
    toast(`Added ${card.name} to Binder`);
  },[toast]);

  const addDeck=useCallback((did,card,board="main")=>{
    setDecks(p=>p.map(d=>{if(d.id!==did)return d;const ex=d.cards.find(c=>c.id===card.id&&c.board===board);if(ex)return{...d,cards:d.cards.map(c=>c===ex?{...c,qty:c.qty+1}:c)};return{...d,cards:[...d.cards,{...card,qty:1,board}]}}));
  },[]);

  const tabs=[
    {id:"search",icon:Icons.search,label:"Search"},
    {id:"vault",icon:Icons.vault,label:"Vault"},
    {id:"trade",icon:Icons.trade,label:"Trade"},
  ];

  const headerTitles = {
    search: ["Search", "MTG Catalog"],
    vault: ["Vault", "Decks & Binder"],
    trade: ["Trade", "Card Evaluator"],
  };

  return (
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'SF Pro Text','Segoe UI',system-ui,sans-serif",color:T.text,display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto",position:"relative"}}>
      <ToastContainer toasts={toasts} />

      <PageHeader title={headerTitles[tab][0]} subtitle={headerTitles[tab][1]} />

      <div style={{flex:1,overflowY:"auto",paddingBottom:72}}>
        {tab==="search"&&<SearchView addColl={addColl} addDeck={addDeck} decks={decks} toast={toast}/>}
        {tab==="vault"&&<VaultView decks={decks} setDecks={setDecks} addDeck={addDeck} coll={coll} setColl={setColl} toast={toast}/>}
        {tab==="trade"&&<TradeView/>}
      </div>

      <div style={{
        position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,
        background:`rgba(12,14,20,.95)`,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
        borderTop:`1px solid ${T.cardBorder}`,display:"flex",padding:"8px 0 env(safe-area-inset-bottom,8px)",zIndex:100
      }}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4,
            background:"none",border:"none",cursor:"pointer",padding:"4px 0",
            transition:"all .15s",position:"relative",
          }}>
            {tab===t.id && <div style={{position:"absolute",top:-1,left:"25%",right:"25%",height:2,borderRadius:1,background:T.gold}}/>}
            <span style={{lineHeight:0}}>{t.icon(tab===t.id?T.gold:T.textDim)}</span>
            <span style={{fontSize:10,fontWeight:tab===t.id?700:500,letterSpacing:.3,color:tab===t.id?T.gold:T.textDim}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEARCH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SearchView({addColl,addDeck,decks,toast}) {
  const [q,setQ]=useState("");
  const [colors,setColors]=useState([]);
  const [type,setType]=useState("");
  const [set,setSet]=useState("");
  const [sets,setSets]=useState([]);
  const [results,setResults]=useState([]);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(false);
  const [slideIdx,setSlideIdx]=useState(-1);
  const [showAdd,setShowAdd]=useState(false);
  const [scanning,setScanning]=useState(false);
  const [scanStatus,setScanStatus]=useState("");
  const [scanPreview,setScanPreview]=useState(null);
  const fileRef=useRef();

  useEffect(()=>{fetchSets().then(setSets)},[]);

  const debouncedQ = useDebounce(q, 350);
  const debouncedColors = useDebounce(colors, 350);
  const debouncedType = useDebounce(type, 350);
  const debouncedSet = useDebounce(set, 350);

  useEffect(()=>{
    let cancelled = false;
    const hasQuery = debouncedQ || debouncedColors.length || debouncedType || debouncedSet;
    if (!hasQuery) { setResults([]); setTotal(0); return; }
    setLoading(true);
    searchScryfall(debouncedQ, debouncedColors, debouncedType, debouncedSet).then(res => {
      if (!cancelled) { setResults(res.data); setTotal(res.total); setLoading(false); }
    });
    return () => { cancelled = true; };
  },[debouncedQ,debouncedColors,debouncedType,debouncedSet]);

  const hasQuery = q || colors.length || type || set;

  const handleScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanPreview(URL.createObjectURL(file));
    setScanning(true);
    setScanStatus("Loading OCR engine...");
    try {
      setScanStatus("Scanning card...");
      const name = await scanCardImage(file);
      if (name) {
        setQ(name);
        setScanStatus(`Found: "${name}"`);
        setTimeout(() => { setScanning(false); setScanPreview(null); }, 1200);
      } else {
        setScanStatus("Could not read card name. Try again.");
        setTimeout(() => { setScanning(false); setScanPreview(null); }, 2000);
      }
    } catch {
      setScanStatus("Scan failed. Try a clearer photo.");
      setTimeout(() => { setScanning(false); setScanPreview(null); }, 2000);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div style={{padding:"0 16px"}}>
      {scanning&&<div style={{position:"fixed",inset:0,zIndex:400,background:"rgba(0,0,0,.9)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:32}}>
        {scanPreview&&<img src={scanPreview} alt="Scanned card" style={{maxWidth:"70%",maxHeight:"40vh",borderRadius:12,border:`2px solid ${T.gold}`}}/>}
        <div style={{fontSize:14,color:T.gold,fontWeight:600}}>{scanStatus}</div>
        <div style={{width:120,height:3,borderRadius:2,background:T.cardBorder,overflow:"hidden"}}>
          <div style={{width:"70%",height:"100%",background:T.gold,borderRadius:2,animation:"pulse 1s ease-in-out infinite alternate"}}/>
        </div>
        <style>{`@keyframes pulse{from{opacity:.4;width:30%}to{opacity:1;width:80%}}`}</style>
      </div>}

      <div style={{position:"sticky",top:0,background:T.bg,paddingTop:12,paddingBottom:8,zIndex:10}}>
        <div style={{display:"flex",gap:8}}>
          <div style={{position:"relative",flex:1}}>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search cards..."
              style={{width:"100%",padding:"14px 16px 14px 42px",borderRadius:14,border:`1px solid ${T.cardBorder}`,background:T.card,color:T.text,fontSize:16,outline:"none",boxSizing:"border-box"}}/>
            <span style={{position:"absolute",left:14,top:14,opacity:.4}}>{Icons.search(T.textDim)}</span>
          </div>
          <button onClick={()=>fileRef.current?.click()} style={{
            width:52,height:52,borderRadius:14,border:`2px solid ${T.gold}`,background:T.card,
            cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0
          }} title="Scan card">{Icons.camera(T.gold)}</button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleScan} style={{display:"none"}}/>
        </div>

        <div style={{display:"flex",gap:6,marginTop:8,overflowX:"auto",paddingBottom:4,alignItems:"center"}}>
          {Object.keys(MCLR).map(c=>(
            <button key={c} onClick={()=>setColors(p=>p.includes(c)?p.filter(x=>x!==c):[...p,c])} style={{
              width:34,height:34,borderRadius:"50%",border:colors.includes(c)?`2.5px solid ${T.gold}`:"2px solid #333",
              background:MCLR[c],fontSize:12,fontWeight:800,color:MTXT[c],cursor:"pointer",
              opacity:colors.includes(c)?1:.45,transition:"all .15s",flexShrink:0
            }}>{c}</button>
          ))}
          <select value={type} onChange={e=>setType(e.target.value)} style={{
            padding:"0 10px",borderRadius:18,border:`1px solid ${T.cardBorder}`,background:T.card,
            color:T.textMuted,fontSize:11,cursor:"pointer",flexShrink:0,appearance:"none",minWidth:72,height:34,textAlign:"center"
          }}>
            <option value="">All types</option>
            {["Creature","Instant","Sorcery","Enchantment","Artifact","Planeswalker","Land"].map(t=>
              <option key={t} value={t.toLowerCase()}>{t}</option>
            )}
          </select>
          <select value={set} onChange={e=>setSet(e.target.value)} style={{
            padding:"0 10px",borderRadius:18,border:`1px solid ${T.cardBorder}`,background:T.card,
            color:T.textMuted,fontSize:11,cursor:"pointer",flexShrink:0,appearance:"none",minWidth:72,height:34,textAlign:"center"
          }}>
            <option value="">All sets</option>
            {sets.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </div>
        <div style={{fontSize:11,color:T.textDim,marginTop:4}}>
          {loading ? "Searching..." : hasQuery ? `${total.toLocaleString()} cards found (showing ${results.length})` : "Search the entire MTG catalog"}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,paddingTop:4,paddingBottom:16}}>
        {results.map((card,i)=>{
          const rc = RARITY_CLR[card.rarity] || RARITY_CLR.common;
          return (
            <div key={card.id} onClick={()=>{setSlideIdx(i);setShowAdd(false)}} style={{
              borderRadius:12,overflow:"hidden",background:T.card,border:`1px solid ${T.cardBorder}`,
              WebkitTapHighlightColor:"transparent",cursor:"pointer",transition:"transform .1s"
            }}>
              <div style={{position:"relative"}}>
                <img src={getImg(card)} alt={card.name} loading="lazy" style={{width:"100%",display:"block",borderRadius:"12px 12px 0 0"}}/>
                {/* Rarity gem */}
                <div style={{position:"absolute",top:6,right:6,padding:"2px 6px",borderRadius:4,background:"rgba(0,0,0,.7)",backdropFilter:"blur(4px)",fontSize:9,fontWeight:700,color:rc,textTransform:"uppercase",letterSpacing:.3}}>
                  {card.rarity}
                </div>
              </div>
              <div style={{padding:"8px 10px 10px"}}>
                <div style={{fontSize:12,fontWeight:700,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{card.name}</div>
                <div style={{fontSize:10,color:T.textDim,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{card.set_name}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
                  <Cost c={card.mana_cost} sz={14}/>
                  <span style={{fontSize:12,fontWeight:600,color:T.green}}>{fmt(card.prices?.usd)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!hasQuery&&<div style={{textAlign:"center",padding:"48px 24px",color:T.textDim}}>
        <div style={{marginBottom:16}}>{Icons.sparkle(T.gold)}</div>
        <div style={{fontSize:15,fontWeight:600,color:T.textMuted}}>Search the entire MTG catalog</div>
        <div style={{fontSize:12,marginTop:4,marginBottom:16}}>Type a name, select colors, filter by set, or scan a card</div>
        <div style={{fontSize:11,color:T.textDim,fontStyle:"italic",lineHeight:1.5,maxWidth:260,margin:"0 auto"}}>{randomFlavor("search")}</div>
      </div>}

      {hasQuery&&!loading&&results.length===0&&<div style={{textAlign:"center",padding:"60px 20px",color:T.textDim}}>
        <div style={{fontSize:14}}>No cards match your search</div>
      </div>}

      {slideIdx>=0&&results[slideIdx]&&<CardSlider
        cards={results}
        index={slideIdx}
        onIndexChange={setSlideIdx}
        onClose={()=>setSlideIdx(-1)}
        actions={(card)=>(
          <div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{addColl(card);setSlideIdx(-1)}} style={{
                flex:1,padding:"14px",borderRadius:12,border:"none",
                background:`linear-gradient(135deg,${T.gold},${T.goldDark})`,color:"#000",
                fontSize:14,fontWeight:700,cursor:"pointer"
              }}>+ Binder</button>
              <button onClick={()=>setShowAdd(!showAdd)} style={{
                flex:1,padding:"14px",borderRadius:12,border:`2px solid ${T.gold}`,
                background:"transparent",color:T.gold,fontSize:14,fontWeight:700,cursor:"pointer"
              }}>+ Deck</button>
            </div>
            {showAdd&&decks.length>0&&<div style={{marginTop:8}}>
              {decks.map(d=>(
                <button key={d.id} onClick={()=>{addDeck(d.id,card);toast(`Added ${card.name} to ${d.name}`);setSlideIdx(-1);setShowAdd(false)}} style={{
                  display:"block",width:"100%",padding:"12px 14px",marginBottom:4,borderRadius:10,
                  border:`1px solid ${T.cardBorder}`,background:T.card,color:T.text,
                  fontSize:13,cursor:"pointer",textAlign:"left"
                }}>{d.name} <span style={{color:T.textDim,fontSize:11}}>({d.format})</span></button>
              ))}
            </div>}
            {showAdd&&decks.length===0&&<div style={{padding:12,color:T.textDim,fontSize:12,textAlign:"center"}}>Create a deck first in the Vault tab</div>}
          </div>
        )}
      />}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VAULT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function VaultView({decks,setDecks,addDeck,coll,setColl,toast}) {
  const [subTab,setSubTab]=useState("decks");
  const [activeDeck,setActiveDeck]=useState(null);

  if (activeDeck) {
    return <DeckEditor deckId={activeDeck} decks={decks} setDecks={setDecks} addDeck={addDeck} onBack={()=>setActiveDeck(null)} toast={toast}/>;
  }

  return (
    <div style={{padding:16}}>
      <div style={{display:"flex",gap:0,background:T.card,borderRadius:12,padding:3,marginBottom:16,border:`1px solid ${T.cardBorder}`}}>
        {[["decks","Decks",Icons.deck],["binder","Binder",Icons.binder]].map(([id,label,icon])=>(
          <button key={id} onClick={()=>setSubTab(id)} style={{
            flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,
            padding:"10px",borderRadius:10,border:"none",cursor:"pointer",transition:"all .15s",
            background:subTab===id?`linear-gradient(135deg,${T.gold},${T.goldDark})`:"transparent",
            color:subTab===id?"#000":T.textDim,fontSize:13,fontWeight:subTab===id?700:500,
          }}>
            {icon(subTab===id?"#000":T.textDim)}
            {label}
          </button>
        ))}
      </div>

      {subTab==="decks" && <DecksList decks={decks} setDecks={setDecks} onOpen={setActiveDeck} toast={toast}/>}
      {subTab==="binder" && <BinderView coll={coll} setColl={setColl} />}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DECKS LIST (with delete confirmation)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function DecksList({decks,setDecks,onOpen,toast}) {
  const [showNew,setShowNew]=useState(false);
  const [name,setName]=useState("");
  const [format,setFormat]=useState("commander");
  const [deleteTarget,setDeleteTarget]=useState(null);

  const create=()=>{
    if(!name.trim())return;
    const d={id:Date.now().toString(),name,format,cards:[],ts:Date.now()};
    setDecks(p=>[...p,d]);onOpen(d.id);setName("");setShowNew(false);
    toast(`Created "${name}"`);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const deck = decks.find(d => d.id === deleteTarget);
    setDecks(p => p.filter(x => x.id !== deleteTarget));
    setDeleteTarget(null);
    if (deck) toast(`Deleted "${deck.name}"`, "error");
  };

  return (
    <>
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Deck"
        message="This action cannot be undone. All cards in this deck will be removed."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <h2 style={{margin:0,fontSize:18,fontWeight:800,color:T.accent}}>My Decks</h2>
        <button onClick={()=>setShowNew(!showNew)} style={{
          padding:"10px 16px",borderRadius:12,border:"none",
          background:`linear-gradient(135deg,${T.gold},${T.goldDark})`,
          color:"#000",fontSize:13,fontWeight:700,cursor:"pointer",
          display:"flex",alignItems:"center",gap:5,
        }}>{Icons.plus("#000")} New</button>
      </div>

      {showNew&&<div style={{background:T.card,borderRadius:14,border:`1px solid ${T.cardBorder}`,padding:16,marginBottom:16}}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Deck name" onKeyDown={e=>e.key==="Enter"&&create()}
          style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${T.cardBorder}`,background:T.bg,color:T.text,fontSize:15,marginBottom:8,boxSizing:"border-box"}}/>
        <div style={{display:"flex",gap:8}}>
          <select value={format} onChange={e=>setFormat(e.target.value)} style={{flex:1,padding:"10px 12px",borderRadius:10,border:`1px solid ${T.cardBorder}`,background:T.bg,color:T.text,fontSize:13}}>
            {["commander","standard","modern","pioneer","legacy","vintage","pauper"].map(f=><option key={f} value={f}>{f[0].toUpperCase()+f.slice(1)}</option>)}
          </select>
          <button onClick={create} style={{padding:"10px 24px",borderRadius:10,border:"none",background:T.gold,color:"#000",fontSize:13,fontWeight:700,cursor:"pointer"}}>Create</button>
        </div>
      </div>}

      {decks.length===0?<div style={{textAlign:"center",padding:"48px 20px",color:T.textDim}}>
        <div style={{marginBottom:12}}>{Icons.deck(T.textDim)}</div>
        <div style={{fontSize:14,color:T.textMuted}}>No decks yet</div>
        <div style={{fontSize:12,marginTop:4,marginBottom:14}}>Tap + New to build your first deck</div>
        <div style={{fontSize:11,color:T.textDim,fontStyle:"italic",lineHeight:1.5}}>{randomFlavor("decks")}</div>
      </div>
      :decks.map(d=>{
        const n=d.cards.reduce((a,c)=>a+c.qty,0);
        const v=d.cards.reduce((a,c)=>a+(parseFloat(c.prices?.usd||0)*c.qty),0);
        const preview=d.cards.slice(0,4);
        return(
          <div key={d.id} onClick={()=>onOpen(d.id)} style={{background:T.card,border:`1px solid ${T.cardBorder}`,borderRadius:14,padding:14,marginBottom:10,cursor:"pointer",transition:"border-color .15s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=T.gold+"44"}
            onMouseLeave={e=>e.currentTarget.style.borderColor=T.cardBorder}
          >
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{fontSize:16,fontWeight:700,color:T.text}}>{d.name}</div>
                <div style={{fontSize:12,color:T.textDim,marginTop:2}}>{d.format[0].toUpperCase()+d.format.slice(1)} \u2022 {n} cards</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:15,fontWeight:700,color:T.green}}>{fmt(v.toFixed(2))}</div>
                <button onClick={e=>{e.stopPropagation();setDeleteTarget(d.id)}} style={{marginTop:4,padding:"4px 10px",borderRadius:6,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.red,fontSize:10,cursor:"pointer"}}>Delete</button>
              </div>
            </div>
            {preview.length>0&&<div style={{display:"flex",gap:6,marginTop:10,overflow:"hidden"}}>
              {preview.map(c=>(
                <img key={c.id} src={getImg(c,"small")} alt={c.name} style={{width:48,height:67,borderRadius:4,objectFit:"cover",border:`1px solid ${T.cardBorder}`}}/>
              ))}
              {n>4&&<div style={{width:48,height:67,borderRadius:4,background:T.bg,border:`1px solid ${T.cardBorder}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:T.textDim}}>+{n-4}</div>}
            </div>}
          </div>
        );
      })}
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DECK EDITOR (simulator + import + export + collapsible stats)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function DeckEditor({deckId,decks,setDecks,addDeck,onBack,toast}) {
  const [addQ,setAddQ]=useState("");
  const [addResults,setAddResults]=useState([]);
  const [viewMode,setViewMode]=useState("visual");
  const [showSim,setShowSim]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [importText,setImportText]=useState("");
  const [importStatus,setImportStatus]=useState("");
  const [statsOpen,setStatsOpen]=useState(true);

  const [hand,setHand]=useState([]);
  const [lib,setLib]=useState([]);
  const [mulls,setMulls]=useState(0);
  const [drawn,setDrawn]=useState([]);
  const [turn,setTurn]=useState(0);

  const debouncedAddQ = useDebounce(addQ, 350);
  useEffect(()=>{
    let cancelled = false;
    if (debouncedAddQ.length < 2) { setAddResults([]); return; }
    searchByName(debouncedAddQ).then(r => { if (!cancelled) setAddResults(r); });
    return () => { cancelled = true; };
  },[debouncedAddQ]);

  const deck=decks.find(d=>d.id===deckId);
  if (!deck) return null;

  const rmCard=(cid,board)=>setDecks(p=>p.map(d=>{
    if(d.id!==deckId)return d;
    const c=d.cards.find(x=>x.id===cid&&x.board===board);
    if(!c)return d;
    return c.qty>1?{...d,cards:d.cards.map(x=>x===c?{...x,qty:x.qty-1}:x)}:{...d,cards:d.cards.filter(x=>x!==c)};
  }));

  const stats=useMemo(()=>{
    const main=deck.cards.filter(c=>c.board==="main"||c.board==="commander");
    const curve={};const clrs={};const types={};let val=0;
    main.forEach(c=>{
      const cmc=Math.min(Math.floor(c.cmc||0),7);
      curve[cmc]=(curve[cmc]||0)+c.qty;
      (c.mana_cost?.match(/\{([WUBRGC])\}/g)||[]).forEach(m=>{const s=m[1];clrs[s]=(clrs[s]||0)+c.qty});
      const tp=typeCategory(c.type_line);
      types[tp]=(types[tp]||0)+c.qty;
      if(c.prices?.usd)val+=parseFloat(c.prices.usd)*c.qty;
    });
    const total=deck.cards.reduce((a,c)=>a+c.qty,0);
    return{curve,clrs,types,val,total};
  },[deck]);

  const grouped=useMemo(()=>{
    const g={};
    deck.cards.filter(c=>c.board==="main"||c.board==="commander").forEach(c=>{
      const cat=typeCategory(c.type_line);
      if(!g[cat])g[cat]=[];
      g[cat].push(c);
    });
    return g;
  },[deck]);

  const shuffle=(a)=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b};
  const buildLib=()=>{const c=[];deck.cards.filter(x=>x.board==="main"||x.board==="commander").forEach(x=>{for(let i=0;i<x.qty;i++)c.push({...x,uid:x.id+"-"+i+"-"+Math.random()})});return shuffle(c)};
  const newGame=()=>{const l=buildLib();setHand(l.slice(0,7));setLib(l.slice(7));setMulls(0);setDrawn([]);setTurn(0);setShowSim(true)};
  const mull=()=>{const l=buildLib();setHand(l.slice(0,7));setLib(l.slice(7));setMulls(m=>m+1);setDrawn([]);setTurn(0)};
  const draw=()=>{if(!lib.length)return;setDrawn(p=>[...p,lib[0]]);setLib(p=>p.slice(1));setTurn(t=>t+1)};

  const handleImport = async () => {
    const entries = parseDeckList(importText);
    if (!entries.length) { setImportStatus("No valid entries found"); return; }
    setImportStatus(`Importing ${entries.length} cards...`);
    let imported = 0;
    for (const entry of entries) {
      try {
        const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(entry.name)}`);
        if (res.ok) {
          const card = await res.json();
          for (let i = 0; i < entry.qty; i++) addDeck(deckId, card, entry.board);
          imported++;
        }
        await new Promise(r => setTimeout(r, 80));
      } catch { /* skip */ }
    }
    setImportStatus(`Imported ${imported}/${entries.length} cards`);
    toast(`Imported ${imported} cards`);
    setTimeout(() => { setShowImport(false); setImportText(""); setImportStatus(""); }, 1500);
  };

  const handleExport = () => {
    const text = exportDeckList(deck);
    navigator.clipboard.writeText(text).then(() => {
      toast("Decklist copied to clipboard");
    }).catch(() => {
      // Fallback: show in a prompt
      window.prompt("Copy this decklist:", text);
    });
  };

  const mx=Math.max(...Object.values(stats?.curve||{0:1}),1);
  const totalClrs=Object.values(stats?.clrs||{}).reduce((a,b)=>a+b,0)||1;

  return (
    <div style={{padding:16}}>
      <button onClick={onBack} style={{padding:"8px 14px",borderRadius:8,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.textDim,fontSize:13,cursor:"pointer",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
        {Icons.back(T.textDim)} Back
      </button>

      {/* Deck header with collapsible stats */}
      <div style={{background:T.card,borderRadius:16,border:`1px solid ${T.cardBorder}`,padding:16,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <h2 style={{margin:"0 0 2px",fontSize:20,fontWeight:800,color:T.accent}}>{deck.name}</h2>
            <div style={{display:"flex",gap:12,fontSize:12,color:T.textDim}}>
              <span>{deck.format[0].toUpperCase()+deck.format.slice(1)}</span>
              <span>{stats.total} cards</span>
              <span style={{color:T.green,fontWeight:700}}>{fmt(stats.val.toFixed(2))}</span>
            </div>
          </div>
          <button onClick={()=>setStatsOpen(!statsOpen)} style={{background:"none",border:"none",cursor:"pointer",padding:4,marginTop:4}}>
            {statsOpen ? Icons.chevUp(T.textDim) : Icons.chevDown(T.textDim)}
          </button>
        </div>

        {statsOpen && <>
          {/* Mana Curve */}
          <div style={{marginTop:12,marginBottom:12}}>
            <div style={{fontSize:10,color:T.textDim,marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>Mana Curve</div>
            <div style={{display:"flex",alignItems:"flex-end",gap:4,height:48}}>
              {[0,1,2,3,4,5,6,7].map(cmc=>(
                <div key={cmc} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
                  <div style={{fontSize:9,color:T.textDim,marginBottom:2}}>{stats.curve[cmc]||0}</div>
                  <div style={{width:"100%",borderRadius:"4px 4px 0 0",height:`${((stats.curve[cmc]||0)/mx)*32}px`,background:`linear-gradient(180deg,${T.gold},#7A6530)`,transition:"height .3s"}}/>
                  <div style={{fontSize:9,color:T.textDim,marginTop:2}}>{cmc===7?"7+":cmc}</div>
                </div>
              ))}
            </div>
          </div>

          {Object.keys(stats.clrs).length>0&&<div style={{marginBottom:8}}>
            <div style={{fontSize:10,color:T.textDim,marginBottom:4,fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>Colors</div>
            <div style={{display:"flex",gap:0,height:6,borderRadius:3,overflow:"hidden",marginBottom:4}}>
              {Object.entries(stats.clrs).map(([c,n])=>(
                <div key={c} style={{width:`${(n/totalClrs)*100}%`,background:MCLR[c],height:"100%"}}/>
              ))}
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {Object.entries(stats.clrs).map(([c,n])=><div key={c} style={{display:"flex",alignItems:"center",gap:3}}><Pip s={c} sz={14}/><span style={{fontSize:10,color:T.textMuted}}>{n}</span></div>)}
            </div>
          </div>}

          {Object.keys(stats.types).length>0&&<div>
            <div style={{fontSize:10,color:T.textDim,marginBottom:4,fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>Types</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
              {TYPE_ORDER.filter(t=>stats.types[t]).map(t=>(
                <span key={t} style={{padding:"2px 7px",borderRadius:6,background:T.bg,fontSize:10,color:T.textMuted}}>{t} {stats.types[t]}</span>
              ))}
            </div>
          </div>}
        </>}
      </div>

      {/* Action buttons */}
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        <button onClick={newGame} style={{
          flex:1,padding:"10px",borderRadius:10,border:`1.5px solid ${T.gold}`,
          background:showSim?T.goldGlow:"transparent",color:T.gold,fontSize:11,fontWeight:700,
          cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5,
        }}>
          {Icons.simulate(T.gold)} Simulate
        </button>
        <button onClick={()=>setShowImport(!showImport)} style={{
          flex:1,padding:"10px",borderRadius:10,border:`1.5px solid ${T.textDim}`,
          background:showImport?T.goldGlow:"transparent",color:T.textMuted,fontSize:11,fontWeight:700,
          cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5,
        }}>
          {Icons.import(T.textMuted)} Import
        </button>
        <button onClick={handleExport} style={{
          flex:1,padding:"10px",borderRadius:10,border:`1.5px solid ${T.textDim}`,
          background:"transparent",color:T.textMuted,fontSize:11,fontWeight:700,
          cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5,
        }}>
          {Icons.export(T.textMuted)} Export
        </button>
      </div>

      {/* Import panel */}
      {showImport&&<div style={{background:T.card,borderRadius:14,border:`1px solid ${T.cardBorder}`,padding:14,marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:700,color:T.accent,marginBottom:6}}>Import Decklist</div>
        <div style={{fontSize:10,color:T.textDim,marginBottom:8,lineHeight:1.4}}>
          Paste your decklist. Formats: "4x Lightning Bolt", "4 Lightning Bolt", or "Lightning Bolt". Use "Sideboard" or "Commander" on its own line to switch sections.
        </div>
        <textarea value={importText} onChange={e=>setImportText(e.target.value)} placeholder={"4 Lightning Bolt\n4 Counterspell\n2 Swords to Plowshares\n\nSideboard\n2 Rest in Peace"}
          style={{width:"100%",height:140,padding:12,borderRadius:10,border:`1px solid ${T.cardBorder}`,background:T.bg,color:T.text,fontSize:13,resize:"vertical",boxSizing:"border-box",fontFamily:"monospace",lineHeight:1.5}}/>
        <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center"}}>
          <button onClick={handleImport} disabled={!importText.trim()} style={{
            padding:"10px 20px",borderRadius:10,border:"none",
            background:importText.trim()?`linear-gradient(135deg,${T.gold},${T.goldDark})`:"#333",
            color:importText.trim()?"#000":"#666",fontSize:13,fontWeight:700,cursor:importText.trim()?"pointer":"default"
          }}>Import</button>
          {importStatus&&<span style={{fontSize:12,color:T.gold}}>{importStatus}</span>}
        </div>
      </div>}

      {/* Simulator panel */}
      {showSim&&hand.length>0&&<div style={{background:T.card,borderRadius:14,border:`1px solid ${T.gold}33`,padding:14,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:12,fontWeight:700,color:T.accent}}>Hand Simulator</div>
          <button onClick={()=>setShowSim(false)} style={{background:"none",border:"none",cursor:"pointer",padding:4}}>
            {Icons.close(T.textDim)}
          </button>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <button onClick={mull} style={{flex:1,padding:"8px",borderRadius:8,border:`1.5px solid ${T.gold}`,background:"transparent",color:T.gold,fontSize:11,fontWeight:700,cursor:"pointer"}}>
            Mulligan{mulls>0?` (${mulls})`:""}</button>
          <button onClick={draw} disabled={!lib.length} style={{flex:1,padding:"8px",borderRadius:8,border:`1.5px solid ${T.green}`,background:"transparent",color:T.green,fontSize:11,fontWeight:700,cursor:"pointer",opacity:lib.length?1:.4}}>
            Draw</button>
          <button onClick={newGame} style={{padding:"8px 12px",borderRadius:8,border:`1.5px solid ${T.textDim}`,background:"transparent",color:T.textDim,fontSize:11,fontWeight:700,cursor:"pointer"}}>
            Reset</button>
        </div>
        <div style={{display:"flex",gap:8,fontSize:11,color:T.textDim,marginBottom:8}}>
          <span>Library: {lib.length}</span><span>Hand: {hand.length}</span>{turn>0&&<span>Turn {turn}</span>}
        </div>
        <div style={{fontSize:10,color:T.gold,fontWeight:600,marginBottom:4}}>Opening Hand</div>
        <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:6,WebkitOverflowScrolling:"touch"}}>
          {hand.map(c=>(
            <div key={c.uid} style={{flexShrink:0,width:80}}>
              <img src={getImg(c,"small")} alt={c.name} style={{width:80,borderRadius:6,display:"block"}}/>
              <div style={{fontSize:9,color:T.text,marginTop:2,textAlign:"center",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</div>
            </div>
          ))}
        </div>
        {drawn.length>0&&<>
          <div style={{fontSize:10,color:T.green,fontWeight:600,marginTop:6,marginBottom:4}}>Drawn</div>
          <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,WebkitOverflowScrolling:"touch"}}>
            {drawn.map((c,i)=>(
              <div key={c.uid} style={{flexShrink:0,width:64}}>
                <img src={getImg(c,"small")} alt={c.name} style={{width:64,borderRadius:4,display:"block"}}/>
                <div style={{fontSize:8,color:T.textDim,marginTop:1,textAlign:"center"}}>T{i+1}</div>
              </div>
            ))}
          </div>
        </>}
      </div>}

      {/* Add cards search */}
      <input value={addQ} onChange={e=>setAddQ(e.target.value)} placeholder="Search cards to add..."
        style={{width:"100%",padding:"12px 14px",borderRadius:12,border:`1px solid ${T.cardBorder}`,background:T.card,color:T.text,fontSize:14,boxSizing:"border-box",marginBottom:4}}/>
      {addResults.length>0&&<div style={{background:T.card,borderRadius:12,border:`1px solid ${T.cardBorder}`,marginBottom:12,overflow:"hidden"}}>
        {addResults.map(c=>(
          <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderBottom:`1px solid ${T.cardBorder}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
              <img src={getImg(c,"small")} alt={c.name} style={{width:28,height:39,borderRadius:3,objectFit:"cover"}}/>
              <div style={{minWidth:0,flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <div style={{fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</div>
                  <RarityBadge rarity={c.rarity} sz={14}/>
                </div>
                <Cost c={c.mana_cost} sz={12}/>
              </div>
            </div>
            <div style={{display:"flex",gap:4,flexShrink:0}}>
              <button onClick={()=>{addDeck(deckId,c,"main");toast(`Added ${c.name}`)}} style={{padding:"6px 12px",borderRadius:8,border:"none",background:T.gold,color:"#000",fontSize:11,fontWeight:700,cursor:"pointer"}}>Main</button>
              <button onClick={()=>{addDeck(deckId,c,"sideboard");toast(`Added ${c.name} to sideboard`)}} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${T.cardBorder}`,background:"transparent",color:T.textMuted,fontSize:11,cursor:"pointer"}}>Side</button>
            </div>
          </div>
        ))}
      </div>}

      {/* View toggle */}
      <div style={{display:"flex",gap:4,marginBottom:10}}>
        <button onClick={()=>setViewMode("visual")} style={{flex:1,padding:"8px",borderRadius:8,border:"none",background:viewMode==="visual"?T.gold:T.card,color:viewMode==="visual"?"#000":T.textDim,fontSize:11,fontWeight:700,cursor:"pointer"}}>Visual</button>
        <button onClick={()=>setViewMode("list")} style={{flex:1,padding:"8px",borderRadius:8,border:"none",background:viewMode==="list"?T.gold:T.card,color:viewMode==="list"?"#000":T.textDim,fontSize:11,fontWeight:700,cursor:"pointer"}}>List</button>
      </div>

      {viewMode==="visual"&&TYPE_ORDER.map(cat=>{
        const cards=grouped[cat];
        if(!cards||!cards.length) return null;
        const catTotal=cards.reduce((a,c)=>a+c.qty,0);
        return <div key={cat} style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:12,fontWeight:700,color:T.gold,textTransform:"uppercase",letterSpacing:.5}}>{cat}</span>
            <span style={{fontSize:11,color:T.textDim}}>{catTotal}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
            {cards.map(c=>(
              <div key={c.id+c.board} style={{position:"relative"}}>
                <img src={getImg(c,"small")} alt={c.name} style={{width:"100%",borderRadius:6,display:"block"}}/>
                {c.qty>1&&<div style={{position:"absolute",top:2,right:2,background:T.gold,color:"#000",borderRadius:6,padding:"1px 5px",fontSize:10,fontWeight:800}}>{c.qty}</div>}
                <button onClick={()=>rmCard(c.id,c.board)} style={{position:"absolute",bottom:2,right:2,width:20,height:20,borderRadius:10,border:"none",background:"rgba(0,0,0,.7)",color:T.red,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2212"}</button>
              </div>
            ))}
          </div>
        </div>;
      })}

      {viewMode==="list"&&["commander","main","sideboard"].map(board=>{
        const cards=deck.cards.filter(c=>c.board===board);if(!cards.length)return null;
        return <div key={board} style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:T.gold,textTransform:"uppercase",marginBottom:6,letterSpacing:.5}}>{board} ({cards.reduce((a,c)=>a+c.qty,0)})</div>
          {cards.map(c=>(
            <div key={c.id+c.board} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",borderRadius:8,marginBottom:2,background:T.card}}>
              <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
                <span style={{fontSize:12,color:T.textDim,width:22,textAlign:"center"}}>{c.qty}x</span>
                <img src={getImg(c,"small")} alt={c.name} style={{width:24,height:34,borderRadius:2,objectFit:"cover"}}/>
                <Cost c={c.mana_cost} sz={13}/>
                <span style={{fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                <span style={{fontSize:11,color:T.green}}>{fmt(c.prices?.usd)}</span>
                <button onClick={()=>rmCard(c.id,board)} style={{width:28,height:28,borderRadius:8,border:"none",background:"#1E1215",color:T.red,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2212"}</button>
              </div>
            </div>
          ))}
        </div>;
      })}

      {viewMode==="visual"&&deck.cards.filter(c=>c.board==="sideboard").length>0&&<div style={{marginBottom:14}}>
        <div style={{fontSize:12,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:.5,marginBottom:6,paddingTop:8,borderTop:`1px solid ${T.cardBorder}`}}>Sideboard</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
          {deck.cards.filter(c=>c.board==="sideboard").map(c=>(
            <div key={c.id+"sb"} style={{position:"relative"}}>
              <img src={getImg(c,"small")} alt={c.name} style={{width:"100%",borderRadius:6,display:"block",opacity:.7}}/>
              {c.qty>1&&<div style={{position:"absolute",top:2,right:2,background:"#666",color:"#fff",borderRadius:6,padding:"1px 5px",fontSize:10,fontWeight:800}}>{c.qty}</div>}
              <button onClick={()=>rmCard(c.id,c.board)} style={{position:"absolute",bottom:2,right:2,width:20,height:20,borderRadius:10,border:"none",background:"rgba(0,0,0,.7)",color:T.red,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2212"}</button>
            </div>
          ))}
        </div>
      </div>}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BINDER (with grid/list toggle)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function BinderView({coll,setColl}) {
  const [filter,setFilter]=useState("");
  const [sort,setSort]=useState("name");
  const [view,setView]=useState("list");

  const totalVal=coll.reduce((a,c)=>a+(parseFloat(c.prices?.usd||0)*c.qty),0);
  const totalCards=coll.reduce((a,c)=>a+c.qty,0);

  const items=useMemo(()=>{
    let r=[...coll];
    if(filter) r=r.filter(c=>c.name.toLowerCase().includes(filter.toLowerCase()));
    r.sort((a,b)=>{
      if(sort==="name")return a.name.localeCompare(b.name);
      if(sort==="price")return(parseFloat(b.prices?.usd||0))-(parseFloat(a.prices?.usd||0));
      if(sort==="recent")return(b.addedAt||0)-(a.addedAt||0);
      return 0;
    });
    return r;
  },[coll,filter,sort]);

  const adj=(id,d)=>setColl(p=>p.map(c=>{if(c.id!==id)return c;const n=c.qty+d;return n<=0?null:{...c,qty:n}}).filter(Boolean));

  return (
    <>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <h2 style={{margin:0,fontSize:18,fontWeight:800,color:T.accent}}>My Binder</h2>
        <div style={{display:"flex",gap:4}}>
          <button onClick={()=>setView("grid")} style={{width:32,height:32,borderRadius:8,border:"none",background:view==="grid"?T.goldGlow:T.card,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            {Icons.grid(view==="grid"?T.gold:T.textDim)}
          </button>
          <button onClick={()=>setView("list")} style={{width:32,height:32,borderRadius:8,border:"none",background:view==="list"?T.goldGlow:T.card,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            {Icons.list(view==="list"?T.gold:T.textDim)}
          </button>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {[["Unique",coll.length,T.text],["Total",totalCards,T.text],["Value","$"+totalVal.toFixed(2),T.green]].map(([l,v,c])=>(
          <div key={l} style={{background:T.card,borderRadius:12,border:`1px solid ${T.cardBorder}`,padding:"10px",textAlign:"center"}}>
            <div style={{fontSize:9,color:T.textDim,textTransform:"uppercase",letterSpacing:.5}}>{l}</div>
            <div style={{fontSize:16,fontWeight:800,color:c,marginTop:2}}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter cards..."
          style={{flex:1,padding:"10px 14px",borderRadius:10,border:`1px solid ${T.cardBorder}`,background:T.card,color:T.text,fontSize:13}}/>
        <select value={sort} onChange={e=>setSort(e.target.value)}
          style={{padding:"10px 12px",borderRadius:10,border:`1px solid ${T.cardBorder}`,background:T.card,color:T.textMuted,fontSize:12}}>
          <option value="name">A-Z</option><option value="price">Price</option><option value="recent">Recent</option>
        </select>
      </div>

      {coll.length===0?<div style={{textAlign:"center",padding:"48px 20px",color:T.textDim}}>
        <div style={{marginBottom:12}}>{Icons.binder(T.textDim)}</div>
        <div style={{fontSize:14,color:T.textMuted}}>Your binder is empty</div>
        <div style={{fontSize:12,marginTop:4,marginBottom:14}}>Add cards from the Search tab</div>
        <div style={{fontSize:11,color:T.textDim,fontStyle:"italic",lineHeight:1.5}}>{randomFlavor("binder")}</div>
      </div>
      : view === "grid" ? (
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {items.map(c=>(
            <div key={c.id} style={{position:"relative",borderRadius:8,overflow:"hidden",background:T.card,border:`1px solid ${T.cardBorder}`}}>
              <img src={getImg(c,"small")} alt={c.name} style={{width:"100%",display:"block",borderRadius:"8px 8px 0 0"}}/>
              {c.qty>1&&<div style={{position:"absolute",top:4,right:4,background:T.gold,color:"#000",borderRadius:6,padding:"1px 6px",fontSize:10,fontWeight:800}}>{c.qty}</div>}
              <div style={{padding:"6px 8px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:11,fontWeight:600,color:T.green}}>{fmt(c.prices?.usd)}</span>
                <div style={{display:"flex",gap:2}}>
                  <button onClick={()=>adj(c.id,-1)} style={{width:22,height:22,borderRadius:6,border:"none",background:"#1E1215",color:T.red,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2212"}</button>
                  <button onClick={()=>adj(c.id,1)} style={{width:22,height:22,borderRadius:6,border:"none",background:"#0F1E15",color:T.green,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        items.map(c=>(
          <div key={c.id} style={{display:"flex",alignItems:"center",padding:"10px 12px",borderRadius:10,marginBottom:4,background:T.card}}>
            <img src={getImg(c,"small")} alt={c.name} style={{width:40,height:56,borderRadius:4,objectFit:"cover",marginRight:10}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</div>
              <div style={{display:"flex",gap:4,alignItems:"center",marginTop:2}}><Cost c={c.mana_cost} sz={12}/><span style={{fontSize:10,color:T.textDim}}>{c.set_name}</span></div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              <button onClick={()=>adj(c.id,-1)} style={{width:30,height:30,borderRadius:8,border:"none",background:"#1E1215",color:T.red,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2212"}</button>
              <span style={{fontSize:14,fontWeight:700,minWidth:20,textAlign:"center"}}>{c.qty}</span>
              <button onClick={()=>adj(c.id,1)} style={{width:30,height:30,borderRadius:8,border:"none",background:"#0F1E15",color:T.green,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
              <span style={{fontSize:12,color:T.green,minWidth:48,textAlign:"right",fontWeight:600}}>{fmt(c.prices?.usd)}</span>
            </div>
          </div>
        ))
      )}
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TRADE (with card images)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TradeView() {
  const [give,setGive]=useState([]);
  const [recv,setRecv]=useState([]);
  const [side,setSide]=useState(null);
  const [q,setQ]=useState("");
  const [results,setResults]=useState([]);

  const debouncedQ = useDebounce(q, 350);
  useEffect(()=>{
    let cancelled = false;
    if (debouncedQ.length < 2) { setResults([]); return; }
    searchByName(debouncedQ).then(r => { if (!cancelled) setResults(r); });
    return () => { cancelled = true; };
  },[debouncedQ]);

  const add=(card)=>{
    const e={...card,uid:Date.now()};
    if(side==="give")setGive(p=>[...p,e]);else setRecv(p=>[...p,e]);
    setSide(null);setQ("");setResults([]);
  };

  const giveT=give.reduce((a,c)=>a+(parseFloat(c.prices?.usd||0)),0);
  const recvT=recv.reduce((a,c)=>a+(parseFloat(c.prices?.usd||0)),0);
  const diff=giveT-recvT;

  const TradeSide=({title,cards,s,total,clr,onRm})=>(
    <div style={{flex:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:700,color:clr}}>{title}</span>
        <span style={{fontSize:12,fontWeight:700,color:T.green}}>${total.toFixed(2)}</span>
      </div>
      <div style={{background:T.card,borderRadius:12,border:`1px solid ${clr}22`,minHeight:100,padding:6}}>
        {cards.map(c=>(
          <div key={c.uid} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 6px",borderRadius:8,marginBottom:3,background:T.bg}}>
            <img src={getImg(c,"small")} alt={c.name} style={{width:24,height:34,borderRadius:3,objectFit:"cover",flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:10,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</div>
              <span style={{fontSize:9,color:T.green}}>{fmt(c.prices?.usd)}</span>
            </div>
            <button onClick={()=>onRm(c.uid)} style={{width:20,height:20,borderRadius:6,border:"none",background:"#2A1515",color:T.red,fontSize:10,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2715"}</button>
          </div>
        ))}
        <button onClick={()=>{setSide(s);setQ("");setResults([])}} style={{width:"100%",padding:"10px",borderRadius:8,border:`1px dashed ${T.cardBorder}`,background:"transparent",color:T.textDim,fontSize:11,cursor:"pointer",marginTop:4}}>+ Add card</button>
      </div>
    </div>
  );

  return (
    <div style={{padding:16}}>
      {(give.length===0&&recv.length===0)&&<div style={{textAlign:"center",padding:"20px 20px 28px",color:T.textDim}}>
        <div style={{fontSize:13,color:T.textMuted,marginBottom:4}}>Evaluate your trades in real-time</div>
        <div style={{fontSize:11,fontStyle:"italic",lineHeight:1.5}}>{randomFlavor("trade")}</div>
      </div>}

      <BottomSheet open={!!side} onClose={()=>setSide(null)}>
        <div style={{padding:"8px 20px 20px"}}>
          <div style={{fontSize:14,fontWeight:700,color:T.accent,marginBottom:10}}>Add to {side==="give"?"Give":"Receive"}</div>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search card..." autoFocus
            style={{width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${T.cardBorder}`,background:T.bg,color:T.text,fontSize:14,boxSizing:"border-box",marginBottom:6}}/>
          {results.map(c=>(
            <div key={c.id} onClick={()=>add(c)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px",borderRadius:10,marginBottom:2,background:T.bg,cursor:"pointer"}}>
              <img src={getImg(c,"small")} alt={c.name} style={{width:32,height:45,borderRadius:4,objectFit:"cover"}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600}}>{c.name}</div>
                <Cost c={c.mana_cost} sz={12}/>
              </div>
              <span style={{fontSize:12,color:T.green,fontWeight:600,flexShrink:0}}>{fmt(c.prices?.usd)}</span>
            </div>
          ))}
        </div>
      </BottomSheet>

      <div style={{display:"flex",gap:8}}>
        <TradeSide title="You Give" cards={give} s="give" total={giveT} clr={T.red} onRm={uid=>setGive(p=>p.filter(c=>c.uid!==uid))}/>
        <TradeSide title="You Get" cards={recv} s="recv" total={recvT} clr={T.green} onRm={uid=>setRecv(p=>p.filter(c=>c.uid!==uid))}/>
      </div>

      {(give.length>0||recv.length>0)&&<div style={{marginTop:16,background:T.card,borderRadius:14,border:`1px solid ${T.cardBorder}`,padding:16,textAlign:"center"}}>
        <div style={{fontSize:11,color:T.textDim,marginBottom:6}}>Trade Balance</div>
        <div style={{fontSize:22,fontWeight:800,color:Math.abs(diff)<1?T.green:diff>0?T.red:T.blue}}>
          {Math.abs(diff)<0.5?"\u2713 Fair Trade":diff>0?`You overpay $${diff.toFixed(2)}`:`You gain $${Math.abs(diff).toFixed(2)}`}
        </div>
        <div style={{marginTop:10,height:8,borderRadius:4,background:T.bg,overflow:"hidden"}}>
          {(giveT+recvT)>0&&<div style={{width:`${(giveT/(giveT+recvT))*100}%`,height:"100%",borderRadius:4,background:Math.abs(diff)<1?T.green:`linear-gradient(90deg,${T.red},${T.gold})`,transition:"width .3s"}}/>}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:10,color:T.textDim}}>
          <span>Give: ${giveT.toFixed(2)}</span><span>Get: ${recvT.toFixed(2)}</span>
        </div>
      </div>}
    </div>
  );
}
