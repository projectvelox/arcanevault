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

async function searchScryfall(query, colors = [], type = "") {
  let parts = [];
  if (query) parts.push(query);
  if (colors.length) parts.push(`id>=${colors.join("").toLowerCase()}`);
  if (type) parts.push(`t:${type}`);
  if (!parts.length) return { data: [], total: 0 };
  const q = parts.join(" ");
  try {
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=name&unique=cards`);
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const fmt = (p) => p ? `$${parseFloat(p).toFixed(2)}` : "—";
const MCLR = { W:"#F9FAF4",U:"#0E68AB",B:"#211510",R:"#D3202A",G:"#00733E",C:"#CAC5C0" };
const MBDR = { W:"#C4B998",U:"#064A7A",B:"#44403C",R:"#9A1620",G:"#005C30",C:"#9E9A96" };
const MTXT = { W:"#444",U:"#fff",B:"#C9A96E",R:"#fff",G:"#fff",C:"#444" };

function Pip({s,sz=18}) {
  return <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:sz,height:sz,borderRadius:"50%",background:MCLR[s]||"#aaa",border:`1.5px solid ${MBDR[s]||"#666"}`,fontSize:sz*.55,fontWeight:800,color:MTXT[s]||"#fff",flexShrink:0}}>{s}</span>;
}
function Cost({c,sz=18}) {
  if(!c) return null;
  return <span style={{display:"inline-flex",gap:2,alignItems:"center"}}>{(c.match(/\{([^}]+)\}/g)||[]).map((p,i)=>{const s=p.replace(/[{}]/g,"");return "WUBRGC".includes(s)?<Pip key={i} s={s} sz={sz}/>:<span key={i} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:sz,height:sz,borderRadius:"50%",background:"#ddd",border:"1.5px solid #bbb",fontSize:sz*.55,fontWeight:800,color:"#333"}}>{s}</span>;})}</span>;
}

const store = {
  async get(k){try{const v=localStorage.getItem(k);return v?JSON.parse(v):null}catch{return null}},
  async set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){console.error(e)}},
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BOTTOM SHEET
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function BottomSheet({open,onClose,children}) {
  if(!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.7)"}}/>
      <div onClick={e=>e.stopPropagation()} style={{
        position:"relative",background:"#16182A",borderRadius:"20px 20px 0 0",
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
// MAIN APP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function App() {
  const [tab,setTab]=useState("search");
  const [decks,setDecks]=useState([]);
  const [coll,setColl]=useState([]);
  const [ready,setReady]=useState(false);

  useEffect(()=>{(async()=>{
    const d=await store.get("av-decks"),c=await store.get("av-coll");
    if(d)setDecks(d);if(c)setColl(c);setReady(true);
  })()},[]);
  useEffect(()=>{if(ready)store.set("av-decks",decks)},[decks,ready]);
  useEffect(()=>{if(ready)store.set("av-coll",coll)},[coll,ready]);

  const addColl=useCallback((card)=>{
    setColl(p=>{const ex=p.find(c=>c.id===card.id);if(ex)return p.map(c=>c===ex?{...c,qty:c.qty+1}:c);return[...p,{...card,qty:1,addedAt:Date.now()}]});
  },[]);

  const addDeck=useCallback((did,card,board="main")=>{
    setDecks(p=>p.map(d=>{if(d.id!==did)return d;const ex=d.cards.find(c=>c.id===card.id&&c.board===board);if(ex)return{...d,cards:d.cards.map(c=>c===ex?{...c,qty:c.qty+1}:c)};return{...d,cards:[...d.cards,{...card,qty:1,board}]}}));
  },[]);

  const tabs=[
    {id:"search",icon:"\u{1F50D}",label:"Search"},
    {id:"decks",icon:"\u{1F4DA}",label:"Decks"},
    {id:"sim",icon:"\u{1F3B2}",label:"Simulator"},
    {id:"coll",icon:"\u{1F4E6}",label:"Collection"},
    {id:"trade",icon:"\u2696\uFE0F",label:"Trade"},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#0C0E14",fontFamily:"'SF Pro Text','Segoe UI',system-ui,sans-serif",color:"#E2E0DC",display:"flex",flexDirection:"column",maxWidth:480,margin:"0 auto",position:"relative"}}>
      {/* Status bar spacer */}
      <div style={{height:8,background:"#0C0E14",flexShrink:0}}/>

      {/* Content area */}
      <div style={{flex:1,overflowY:"auto",paddingBottom:72}}>
        {tab==="search"&&<SearchView addColl={addColl} addDeck={addDeck} decks={decks}/>}
        {tab==="decks"&&<DecksView decks={decks} setDecks={setDecks} addDeck={addDeck}/>}
        {tab==="sim"&&<SimView decks={decks}/>}
        {tab==="coll"&&<CollView coll={coll} setColl={setColl}/>}
        {tab==="trade"&&<TradeView/>}
      </div>

      {/* Bottom Nav */}
      <div style={{
        position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,
        background:"rgba(12,14,20,.92)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
        borderTop:"1px solid #1E2235",display:"flex",padding:"6px 0 env(safe-area-inset-bottom,8px)",zIndex:100
      }}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,
            background:"none",border:"none",cursor:"pointer",padding:"4px 0",
            color:tab===t.id?"#C9A96E":"#5A5D6E",transition:"color .15s"
          }}>
            <span style={{fontSize:20,lineHeight:1}}>{t.icon}</span>
            <span style={{fontSize:10,fontWeight:600,letterSpacing:.3}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEARCH (live Scryfall API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SearchView({addColl,addDeck,decks}) {
  const [q,setQ]=useState("");
  const [colors,setColors]=useState([]);
  const [type,setType]=useState("");
  const [sel,setSel]=useState(null);
  const [showAdd,setShowAdd]=useState(false);
  const [results,setResults]=useState([]);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(false);

  const debouncedQ = useDebounce(q, 350);
  const debouncedColors = useDebounce(colors, 350);
  const debouncedType = useDebounce(type, 350);

  useEffect(()=>{
    let cancelled = false;
    const hasQuery = debouncedQ || debouncedColors.length || debouncedType;
    if (!hasQuery) { setResults([]); setTotal(0); return; }
    setLoading(true);
    searchScryfall(debouncedQ, debouncedColors, debouncedType).then(res => {
      if (!cancelled) { setResults(res.data); setTotal(res.total); setLoading(false); }
    });
    return () => { cancelled = true; };
  },[debouncedQ,debouncedColors,debouncedType]);

  const hasQuery = q || colors.length || type;

  return (
    <div style={{padding:"0 16px"}}>
      {/* Search input */}
      <div style={{position:"sticky",top:0,background:"#0C0E14",paddingTop:12,paddingBottom:8,zIndex:10}}>
        <div style={{position:"relative"}}>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search cards..."
            style={{width:"100%",padding:"14px 16px 14px 42px",borderRadius:14,border:"1px solid #2A2D3E",background:"#16182A",color:"#E2E0DC",fontSize:16,outline:"none",boxSizing:"border-box"}}/>
          <span style={{position:"absolute",left:14,top:15,fontSize:18,opacity:.4}}>{"\u{1F50D}"}</span>
        </div>
        {/* Color filter pills */}
        <div style={{display:"flex",gap:6,marginTop:8,overflowX:"auto",paddingBottom:4}}>
          {Object.keys(MCLR).map(c=>(
            <button key={c} onClick={()=>setColors(p=>p.includes(c)?p.filter(x=>x!==c):[...p,c])} style={{
              width:36,height:36,borderRadius:"50%",border:colors.includes(c)?"2.5px solid #C9A96E":"2px solid #333",
              background:MCLR[c],fontSize:13,fontWeight:800,color:MTXT[c],cursor:"pointer",
              opacity:colors.includes(c)?1:.45,transition:"all .15s",flexShrink:0
            }}>{c}</button>
          ))}
          <select value={type} onChange={e=>setType(e.target.value)} style={{
            padding:"0 12px",borderRadius:18,border:"1px solid #2A2D3E",background:"#16182A",
            color:"#9A9DAE",fontSize:12,cursor:"pointer",flexShrink:0,appearance:"none",minWidth:80,textAlign:"center"
          }}>
            <option value="">All types</option>
            {["Creature","Instant","Sorcery","Enchantment","Artifact","Planeswalker","Land"].map(t=>
              <option key={t} value={t.toLowerCase()}>{t}</option>
            )}
          </select>
        </div>
        <div style={{fontSize:11,color:"#5A5D6E",marginTop:4}}>
          {loading ? "Searching..." : hasQuery ? `${total.toLocaleString()} cards found (showing ${results.length})` : "Type to search all MTG cards"}
        </div>
      </div>

      {/* Results */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,paddingTop:4,paddingBottom:16}}>
        {results.map(card=>(
          <div key={card.id} onClick={()=>setSel(card)} style={{
            borderRadius:12,overflow:"hidden",background:"#16182A",border:"1px solid #1E2235",
            WebkitTapHighlightColor:"transparent",cursor:"pointer",
            transition:"transform .1s",active:{transform:"scale(.97)"}
          }}>
            <img src={getImg(card)} alt={card.name} loading="lazy"
              style={{width:"100%",display:"block",borderRadius:"12px 12px 0 0"}}/>
            <div style={{padding:"8px 10px 10px"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#E2E0DC",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{card.name}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
                <Cost c={card.mana_cost} sz={15}/>
                <span style={{fontSize:12,fontWeight:600,color:"#4ADE80"}}>{fmt(card.prices?.usd)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!hasQuery&&<div style={{textAlign:"center",padding:"60px 20px",color:"#5A5D6E"}}>
        <div style={{fontSize:44,marginBottom:12}}>{"\u2728"}</div>
        <div style={{fontSize:14}}>Search the entire MTG catalog</div>
        <div style={{fontSize:12,marginTop:4}}>Type a card name or select a color filter</div>
      </div>}

      {hasQuery&&!loading&&results.length===0&&<div style={{textAlign:"center",padding:"60px 20px",color:"#5A5D6E"}}>
        <div style={{fontSize:44,marginBottom:12}}>{"\u{1F0CF}"}</div>
        <div style={{fontSize:14}}>No cards match your search</div>
      </div>}

      {/* Card Detail Bottom Sheet */}
      <BottomSheet open={!!sel} onClose={()=>{setSel(null);setShowAdd(false)}}>
        {sel&&(
          <div style={{padding:"0 20px"}}>
            <div style={{display:"flex",gap:14,paddingTop:8}}>
              <img src={getImg(sel)} alt={sel.name} style={{width:140,borderRadius:10,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <h3 style={{margin:"0 0 6px",fontSize:18,fontWeight:800,color:"#F0D78C"}}>{sel.name}</h3>
                <Cost c={sel.mana_cost} sz={20}/>
                <div style={{fontSize:12,color:"#9A9DAE",marginTop:6}}>{sel.type_line}</div>
                {sel.power&&<div style={{fontSize:13,color:"#C9A96E",marginTop:4,fontWeight:700}}>{sel.power}/{sel.toughness}</div>}
                <div style={{fontSize:11,color:"#6B6F80",marginTop:4}}>{sel.set_name} · {sel.rarity}</div>
              </div>
            </div>

            {/* Oracle text */}
            <div style={{marginTop:14,padding:14,background:"#0C0E14",borderRadius:12,fontSize:13,color:"#CCC",lineHeight:1.6}}>
              {(sel.oracle_text || sel.card_faces?.[0]?.oracle_text || "")?.split("\n").map((l,i,a)=><div key={i} style={{marginBottom:i<(a.length-1)?6:0}}>{l}</div>)}
            </div>

            {/* Prices */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:12}}>
              {[["USD",sel.prices?.usd,"#4ADE80"],["Foil",sel.prices?.usd_foil,"#C084FC"],["EUR",sel.prices?.eur,"#60A5FA"]].map(([l,v,c])=>(
                <div key={l} style={{background:"#0C0E14",borderRadius:10,padding:"10px 12px",textAlign:"center"}}>
                  <div style={{fontSize:9,color:"#5A5D6E",textTransform:"uppercase",letterSpacing:.5}}>{l}</div>
                  <div style={{fontSize:16,fontWeight:700,color:c,marginTop:2}}>{fmt(v)}</div>
                </div>
              ))}
            </div>

            {/* Legalities */}
            {sel.legalities&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:12}}>
              {Object.entries(sel.legalities).map(([f,v])=>(
                <span key={f} style={{
                  padding:"3px 8px",borderRadius:6,fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:.3,
                  background:v==="legal"?"#0F2A1A":v==="banned"?"#2A0F0F":"#1A1A2A",
                  color:v==="legal"?"#4ADE80":v==="banned"?"#EF4444":"#5A5D6E",
                }}>{f}</span>
              ))}
            </div>}

            {/* Actions */}
            <div style={{display:"flex",gap:10,marginTop:16,marginBottom:8}}>
              <button onClick={()=>{addColl(sel);setSel(null)}} style={{
                flex:1,padding:"14px",borderRadius:12,border:"none",
                background:"linear-gradient(135deg,#C9A96E,#A88B4A)",color:"#000",
                fontSize:14,fontWeight:700,cursor:"pointer"
              }}>+ Collection</button>
              <button onClick={()=>setShowAdd(!showAdd)} style={{
                flex:1,padding:"14px",borderRadius:12,border:"2px solid #C9A96E",
                background:"transparent",color:"#C9A96E",fontSize:14,fontWeight:700,cursor:"pointer"
              }}>+ Deck</button>
            </div>
            {showAdd&&decks.length>0&&<div style={{marginBottom:12}}>
              {decks.map(d=>(
                <button key={d.id} onClick={()=>{addDeck(d.id,sel);setSel(null);setShowAdd(false)}} style={{
                  display:"block",width:"100%",padding:"12px 14px",marginBottom:4,borderRadius:10,
                  border:"1px solid #2A2D3E",background:"#0C0E14",color:"#E2E0DC",
                  fontSize:13,cursor:"pointer",textAlign:"left"
                }}>{d.name} <span style={{color:"#5A5D6E",fontSize:11}}>({d.format})</span></button>
              ))}
            </div>}
            {showAdd&&decks.length===0&&<div style={{padding:12,color:"#5A5D6E",fontSize:12,textAlign:"center"}}>Create a deck first in the Decks tab</div>}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DECKS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function DecksView({decks,setDecks,addDeck}) {
  const [active,setActive]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [name,setName]=useState("");
  const [format,setFormat]=useState("commander");
  const [addQ,setAddQ]=useState("");
  const [addResults,setAddResults]=useState([]);

  const debouncedAddQ = useDebounce(addQ, 350);
  useEffect(()=>{
    let cancelled = false;
    if (debouncedAddQ.length < 2) { setAddResults([]); return; }
    searchByName(debouncedAddQ).then(r => { if (!cancelled) setAddResults(r); });
    return () => { cancelled = true; };
  },[debouncedAddQ]);

  const deck=decks.find(d=>d.id===active);

  const create=()=>{
    if(!name.trim())return;
    const d={id:Date.now().toString(),name,format,cards:[],ts:Date.now()};
    setDecks(p=>[...p,d]);setActive(d.id);setName("");setShowNew(false);
  };

  const rmCard=(cid,board)=>setDecks(p=>p.map(d=>{
    if(d.id!==active)return d;
    const c=d.cards.find(x=>x.id===cid&&x.board===board);
    if(!c)return d;
    return c.qty>1?{...d,cards:d.cards.map(x=>x===c?{...x,qty:x.qty-1}:x)}:{...d,cards:d.cards.filter(x=>x!==c)};
  }));

  const stats=useMemo(()=>{
    if(!deck)return null;
    const main=deck.cards.filter(c=>c.board==="main"||c.board==="commander");
    const curve={};const clrs={};const types={};let val=0;
    main.forEach(c=>{
      const cmc=Math.min(Math.floor(c.cmc||0),7);
      curve[cmc]=(curve[cmc]||0)+c.qty;
      (c.mana_cost?.match(/\{([WUBRGC])\}/g)||[]).forEach(m=>{const s=m[1];clrs[s]=(clrs[s]||0)+c.qty});
      const tp=(c.type_line||"").split("\u2014")[0].trim().split(" ").pop();
      if(tp)types[tp]=(types[tp]||0)+c.qty;
      if(c.prices?.usd)val+=parseFloat(c.prices.usd)*c.qty;
    });
    const total=deck.cards.reduce((a,c)=>a+c.qty,0);
    return{curve,clrs,types,val,total};
  },[deck]);

  if(!active) return (
    <div style={{padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <h2 style={{margin:0,fontSize:20,fontWeight:800,color:"#F0D78C"}}>My Decks</h2>
        <button onClick={()=>setShowNew(!showNew)} style={{padding:"10px 16px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#C9A96E,#A88B4A)",color:"#000",fontSize:13,fontWeight:700,cursor:"pointer"}}>+ New</button>
      </div>
      {showNew&&<div style={{background:"#16182A",borderRadius:14,border:"1px solid #2A2D3E",padding:16,marginBottom:16}}>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Deck name" onKeyDown={e=>e.key==="Enter"&&create()}
          style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1px solid #2A2D3E",background:"#0C0E14",color:"#E2E0DC",fontSize:15,marginBottom:8,boxSizing:"border-box"}}/>
        <div style={{display:"flex",gap:8}}>
          <select value={format} onChange={e=>setFormat(e.target.value)} style={{flex:1,padding:"10px 12px",borderRadius:10,border:"1px solid #2A2D3E",background:"#0C0E14",color:"#E2E0DC",fontSize:13}}>
            {["commander","standard","modern","pioneer","legacy","vintage","pauper"].map(f=><option key={f} value={f}>{f[0].toUpperCase()+f.slice(1)}</option>)}
          </select>
          <button onClick={create} style={{padding:"10px 24px",borderRadius:10,border:"none",background:"#C9A96E",color:"#000",fontSize:13,fontWeight:700,cursor:"pointer"}}>Create</button>
        </div>
      </div>}
      {decks.length===0?<div style={{textAlign:"center",padding:"60px 20px",color:"#5A5D6E"}}><div style={{fontSize:44,marginBottom:12}}>{"\u{1F4DA}"}</div>No decks yet</div>
      :decks.map(d=>{const n=d.cards.reduce((a,c)=>a+c.qty,0);const v=d.cards.reduce((a,c)=>a+(parseFloat(c.prices?.usd||0)*c.qty),0);return(
        <div key={d.id} onClick={()=>setActive(d.id)} style={{background:"#16182A",border:"1px solid #1E2235",borderRadius:14,padding:16,marginBottom:8,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:15,fontWeight:700}}>{d.name}</div>
            <div style={{fontSize:12,color:"#5A5D6E",marginTop:2}}>{d.format[0].toUpperCase()+d.format.slice(1)} · {n} cards</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:14,fontWeight:700,color:"#4ADE80"}}>{fmt(v.toFixed(2))}</div>
            <button onClick={e=>{e.stopPropagation();setDecks(p=>p.filter(x=>x.id!==d.id))}} style={{marginTop:4,padding:"4px 10px",borderRadius:6,border:"1px solid #444",background:"transparent",color:"#EF4444",fontSize:10,cursor:"pointer"}}>Delete</button>
          </div>
        </div>
      )})}
    </div>
  );

  // Deck editor
  const mx=Math.max(...Object.values(stats?.curve||{0:1}),1);
  return (
    <div style={{padding:16}}>
      <button onClick={()=>setActive(null)} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #2A2D3E",background:"transparent",color:"#5A5D6E",fontSize:13,cursor:"pointer",marginBottom:12}}>{"\u2190"} Back</button>
      <h2 style={{margin:"0 0 2px",fontSize:18,fontWeight:800,color:"#F0D78C"}}>{deck.name}</h2>
      <div style={{fontSize:12,color:"#5A5D6E",marginBottom:14}}>{deck.format} · {stats.total} cards · {fmt(stats.val.toFixed(2))}</div>

      {/* Mana Curve */}
      <div style={{background:"#16182A",borderRadius:14,border:"1px solid #1E2235",padding:14,marginBottom:12}}>
        <div style={{fontSize:11,color:"#5A5D6E",marginBottom:8,fontWeight:600}}>Mana Curve</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:56}}>
          {[0,1,2,3,4,5,6,7].map(cmc=>(
            <div key={cmc} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}>
              <div style={{fontSize:9,color:"#5A5D6E",marginBottom:2}}>{stats.curve[cmc]||0}</div>
              <div style={{width:"100%",borderRadius:"4px 4px 0 0",height:`${((stats.curve[cmc]||0)/mx)*40}px`,background:"linear-gradient(180deg,#C9A96E,#7A6530)",transition:"height .3s"}}/>
              <div style={{fontSize:9,color:"#5A5D6E",marginTop:2}}>{cmc===7?"7+":cmc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Color distribution */}
      {Object.keys(stats.clrs).length>0&&<div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        {Object.entries(stats.clrs).map(([c,n])=><div key={c} style={{display:"flex",alignItems:"center",gap:4,background:"#16182A",borderRadius:10,padding:"6px 10px"}}><Pip s={c} sz={20}/><span style={{fontSize:14,fontWeight:700}}>{n}</span></div>)}
      </div>}

      {/* Add cards */}
      <input value={addQ} onChange={e=>setAddQ(e.target.value)} placeholder="Search cards to add..."
        style={{width:"100%",padding:"12px 14px",borderRadius:12,border:"1px solid #2A2D3E",background:"#16182A",color:"#E2E0DC",fontSize:14,boxSizing:"border-box",marginBottom:4}}/>
      {addResults.length>0&&<div style={{background:"#16182A",borderRadius:12,border:"1px solid #2A2D3E",marginBottom:12,overflow:"hidden"}}>
        {addResults.map(c=>(
          <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",borderBottom:"1px solid #1E2235"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
              <Cost c={c.mana_cost} sz={14}/>
              <span style={{fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</span>
            </div>
            <div style={{display:"flex",gap:4,flexShrink:0}}>
              <button onClick={()=>addDeck(active,c,"main")} style={{padding:"6px 12px",borderRadius:8,border:"none",background:"#C9A96E",color:"#000",fontSize:11,fontWeight:700,cursor:"pointer"}}>Main</button>
              <button onClick={()=>addDeck(active,c,"sideboard")} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #444",background:"transparent",color:"#999",fontSize:11,cursor:"pointer"}}>Side</button>
            </div>
          </div>
        ))}
      </div>}

      {/* Card list by board */}
      {["commander","main","sideboard"].map(board=>{
        const cards=deck.cards.filter(c=>c.board===board);if(!cards.length)return null;
        return <div key={board} style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#C9A96E",textTransform:"uppercase",marginBottom:6,letterSpacing:.5}}>{board} ({cards.reduce((a,c)=>a+c.qty,0)})</div>
          {cards.map(c=>(
            <div key={c.id+c.board} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",borderRadius:8,marginBottom:2,background:"#16182A"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
                <span style={{fontSize:12,color:"#5A5D6E",width:22,textAlign:"center"}}>{c.qty}x</span>
                <Cost c={c.mana_cost} sz={13}/>
                <span style={{fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                <span style={{fontSize:11,color:"#4ADE80"}}>{fmt(c.prices?.usd)}</span>
                <button onClick={()=>rmCard(c.id,board)} style={{width:28,height:28,borderRadius:8,border:"none",background:"#1E1215",color:"#EF4444",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2212"}</button>
              </div>
            </div>
          ))}
        </div>;
      })}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SIMULATOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SimView({decks}) {
  const [did,setDid]=useState("");
  const [hand,setHand]=useState([]);
  const [lib,setLib]=useState([]);
  const [mulls,setMulls]=useState(0);
  const [drawn,setDrawn]=useState([]);
  const [turn,setTurn]=useState(0);

  const deck=decks.find(d=>d.id===did);
  const shuffle=(a)=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]]}return b};

  const buildLib=()=>{if(!deck)return[];const c=[];deck.cards.filter(x=>x.board==="main"||x.board==="commander").forEach(x=>{for(let i=0;i<x.qty;i++)c.push({...x,uid:x.id+"-"+i+"-"+Math.random()})});return shuffle(c)};

  const newGame=()=>{const l=buildLib();setHand(l.slice(0,7));setLib(l.slice(7));setMulls(0);setDrawn([]);setTurn(0)};
  const mull=()=>{const l=buildLib();setHand(l.slice(0,7));setLib(l.slice(7));setMulls(m=>m+1);setDrawn([]);setTurn(0)};
  const draw=()=>{if(!lib.length)return;setDrawn(p=>[...p,lib[0]]);setLib(p=>p.slice(1));setTurn(t=>t+1)};

  return (
    <div style={{padding:16}}>
      <h2 style={{margin:"0 0 12px",fontSize:20,fontWeight:800,color:"#F0D78C"}}>Simulator</h2>
      <select value={did} onChange={e=>{setDid(e.target.value);setHand([]);setLib([]);setDrawn([])}}
        style={{width:"100%",padding:"12px 14px",borderRadius:12,border:"1px solid #2A2D3E",background:"#16182A",color:"#E2E0DC",fontSize:14,marginBottom:12,boxSizing:"border-box"}}>
        <option value="">Select a deck...</option>
        {decks.map(d=><option key={d.id} value={d.id}>{d.name} ({d.cards.reduce((a,c)=>a+c.qty,0)})</option>)}
      </select>

      {did&&<div style={{display:"flex",gap:8,marginBottom:14}}>
        <button onClick={newGame} style={{flex:1,padding:"12px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#C9A96E,#A88B4A)",color:"#000",fontSize:13,fontWeight:700,cursor:"pointer"}}>{"\u{1F504}"} New Hand</button>
        <button onClick={mull} disabled={!hand.length} style={{flex:1,padding:"12px",borderRadius:12,border:"2px solid #C9A96E",background:"transparent",color:"#C9A96E",fontSize:13,fontWeight:700,cursor:"pointer",opacity:hand.length?1:.4}}>{"\u267B"} Mulligan{mulls>0?` (${mulls})`:""}</button>
        <button onClick={draw} disabled={!lib.length||!hand.length} style={{padding:"12px 16px",borderRadius:12,border:"2px solid #4ADE80",background:"transparent",color:"#4ADE80",fontSize:13,fontWeight:700,cursor:"pointer",opacity:lib.length&&hand.length?1:.4}}>{"\u{1F4E5}"}</button>
      </div>}

      {hand.length>0&&<>
        <div style={{display:"flex",gap:12,fontSize:12,color:"#5A5D6E",marginBottom:10}}>
          <span>Library: {lib.length}</span><span>Hand: {hand.length}</span>{turn>0&&<span>Turn {turn}</span>}
        </div>
        <div style={{fontSize:11,color:"#C9A96E",fontWeight:700,marginBottom:6}}>Opening Hand</div>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:10,WebkitOverflowScrolling:"touch"}}>
          {hand.map(c=>(
            <div key={c.uid} style={{flexShrink:0,width:110}}>
              <img src={getImg(c,"small")} alt={c.name} style={{width:110,borderRadius:8,display:"block"}}/>
              <div style={{fontSize:10,color:"#E2E0DC",marginTop:4,textAlign:"center",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</div>
            </div>
          ))}
        </div>
      </>}

      {drawn.length>0&&<>
        <div style={{fontSize:11,color:"#4ADE80",fontWeight:700,marginTop:8,marginBottom:6}}>Drawn</div>
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:10,WebkitOverflowScrolling:"touch"}}>
          {drawn.map((c,i)=>(
            <div key={c.uid} style={{flexShrink:0,width:90}}>
              <img src={getImg(c,"small")} alt={c.name} style={{width:90,borderRadius:6,display:"block"}}/>
              <div style={{fontSize:9,color:"#5A5D6E",marginTop:2,textAlign:"center"}}>T{i+1}</div>
            </div>
          ))}
        </div>
      </>}

      {!did&&<div style={{textAlign:"center",padding:"60px 20px",color:"#5A5D6E"}}><div style={{fontSize:44,marginBottom:12}}>{"\u{1F3B2}"}</div>Select a deck to simulate</div>}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COLLECTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function CollView({coll,setColl}) {
  const [filter,setFilter]=useState("");
  const [sort,setSort]=useState("name");

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
    <div style={{padding:16}}>
      <h2 style={{margin:"0 0 12px",fontSize:20,fontWeight:800,color:"#F0D78C"}}>Collection</h2>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
        {[["Unique",coll.length,"#E2E0DC"],["Total",totalCards,"#E2E0DC"],["Value","$"+totalVal.toFixed(2),"#4ADE80"]].map(([l,v,c])=>(
          <div key={l} style={{background:"#16182A",borderRadius:12,border:"1px solid #1E2235",padding:"12px",textAlign:"center"}}>
            <div style={{fontSize:10,color:"#5A5D6E",textTransform:"uppercase",letterSpacing:.5}}>{l}</div>
            <div style={{fontSize:18,fontWeight:800,color:c,marginTop:2}}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter..."
          style={{flex:1,padding:"10px 14px",borderRadius:10,border:"1px solid #2A2D3E",background:"#16182A",color:"#E2E0DC",fontSize:13}}/>
        <select value={sort} onChange={e=>setSort(e.target.value)}
          style={{padding:"10px 12px",borderRadius:10,border:"1px solid #2A2D3E",background:"#16182A",color:"#9A9DAE",fontSize:12}}>
          <option value="name">A-Z</option><option value="price">Price {"\u2193"}</option><option value="recent">Recent</option>
        </select>
      </div>

      {coll.length===0?<div style={{textAlign:"center",padding:"60px 20px",color:"#5A5D6E"}}><div style={{fontSize:44,marginBottom:12}}>{"\u{1F4E6}"}</div>Your collection is empty<div style={{fontSize:12,marginTop:4}}>Add cards from the Search tab</div></div>
      :items.map(c=>(
        <div key={c.id} style={{display:"flex",alignItems:"center",padding:"10px 12px",borderRadius:10,marginBottom:4,background:"#16182A"}}>
          <img src={getImg(c,"small")} alt={c.name} style={{width:40,height:56,borderRadius:4,objectFit:"cover",marginRight:10}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</div>
            <div style={{display:"flex",gap:4,alignItems:"center",marginTop:2}}><Cost c={c.mana_cost} sz={12}/><span style={{fontSize:10,color:"#5A5D6E"}}>{c.set_name}</span></div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <button onClick={()=>adj(c.id,-1)} style={{width:30,height:30,borderRadius:8,border:"none",background:"#1E1215",color:"#EF4444",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2212"}</button>
            <span style={{fontSize:14,fontWeight:700,minWidth:20,textAlign:"center"}}>{c.qty}</span>
            <button onClick={()=>adj(c.id,1)} style={{width:30,height:30,borderRadius:8,border:"none",background:"#0F1E15",color:"#4ADE80",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
            <span style={{fontSize:12,color:"#4ADE80",minWidth:48,textAlign:"right",fontWeight:600}}>{fmt(c.prices?.usd)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TRADE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

  const Side=({title,cards,s,total,clr,onRm})=>(
    <div style={{flex:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:13,fontWeight:700,color:clr}}>{title}</span>
        <span style={{fontSize:13,fontWeight:700,color:"#4ADE80"}}>${total.toFixed(2)}</span>
      </div>
      <div style={{background:"#16182A",borderRadius:12,border:`1px solid ${clr}22`,minHeight:100,padding:8}}>
        {cards.map(c=>(
          <div key={c.uid} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 8px",borderRadius:8,marginBottom:3,background:"#0C0E14"}}>
            <span style={{fontSize:11,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1}}>{c.name}</span>
            <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
              <span style={{fontSize:10,color:"#4ADE80"}}>{fmt(c.prices?.usd)}</span>
              <button onClick={()=>onRm(c.uid)} style={{width:22,height:22,borderRadius:6,border:"none",background:"#2A1515",color:"#EF4444",fontSize:11,cursor:"pointer"}}>{"\u2715"}</button>
            </div>
          </div>
        ))}
        <button onClick={()=>{setSide(s);setQ("");setResults([])}} style={{width:"100%",padding:"10px",borderRadius:8,border:"1px dashed #2A2D3E",background:"transparent",color:"#5A5D6E",fontSize:12,cursor:"pointer",marginTop:4}}>+ Add card</button>
      </div>
    </div>
  );

  return (
    <div style={{padding:16}}>
      <h2 style={{margin:"0 0 14px",fontSize:20,fontWeight:800,color:"#F0D78C"}}>Trade Tool</h2>

      {/* Search overlay */}
      <BottomSheet open={!!side} onClose={()=>setSide(null)}>
        <div style={{padding:"8px 20px 20px"}}>
          <div style={{fontSize:14,fontWeight:700,color:"#F0D78C",marginBottom:10}}>Add to {side==="give"?"Give":"Receive"}</div>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search card..." autoFocus
            style={{width:"100%",padding:"12px 14px",borderRadius:10,border:"1px solid #2A2D3E",background:"#0C0E14",color:"#E2E0DC",fontSize:14,boxSizing:"border-box",marginBottom:6}}/>
          {results.map(c=>(
            <div key={c.id} onClick={()=>add(c)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px",borderRadius:10,marginBottom:2,background:"#0C0E14",cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><Cost c={c.mana_cost} sz={14}/><span style={{fontSize:13}}>{c.name}</span></div>
              <span style={{fontSize:12,color:"#4ADE80",fontWeight:600}}>{fmt(c.prices?.usd)}</span>
            </div>
          ))}
        </div>
      </BottomSheet>

      <div style={{display:"flex",gap:10}}>
        <Side title="You Give" cards={give} s="give" total={giveT} clr="#EF4444" onRm={uid=>setGive(p=>p.filter(c=>c.uid!==uid))}/>
        <Side title="You Get" cards={recv} s="recv" total={recvT} clr="#4ADE80" onRm={uid=>setRecv(p=>p.filter(c=>c.uid!==uid))}/>
      </div>

      {(give.length>0||recv.length>0)&&<div style={{marginTop:16,background:"#16182A",borderRadius:14,border:"1px solid #1E2235",padding:16,textAlign:"center"}}>
        <div style={{fontSize:11,color:"#5A5D6E",marginBottom:6}}>Trade Balance</div>
        <div style={{fontSize:22,fontWeight:800,color:Math.abs(diff)<1?"#4ADE80":diff>0?"#EF4444":"#60A5FA"}}>
          {Math.abs(diff)<0.5?"\u2713 Fair Trade":diff>0?`You overpay $${diff.toFixed(2)}`:`You gain $${Math.abs(diff).toFixed(2)}`}
        </div>
        <div style={{marginTop:10,height:8,borderRadius:4,background:"#0C0E14",overflow:"hidden"}}>
          {(giveT+recvT)>0&&<div style={{width:`${(giveT/(giveT+recvT))*100}%`,height:"100%",borderRadius:4,background:Math.abs(diff)<1?"#4ADE80":"linear-gradient(90deg,#EF4444,#C9A96E)",transition:"width .3s"}}/>}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6,fontSize:10,color:"#5A5D6E"}}>
          <span>Give: ${giveT.toFixed(2)}</span><span>Get: ${recvT.toFixed(2)}</span>
        </div>
      </div>}
    </div>
  );
}
