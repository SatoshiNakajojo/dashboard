/** @jsxRuntime classic */
const { useState, useEffect, useCallback, useRef } = React;

/* ─── THEMES ─────────────────────────────────────────────── */
const THEMES = {
  luxe: {
    // ✦ Onyx & Champagne — family office. Neutres CHAUDS (taupe), famille de catégories cohérente.
    // Logique : champagne(gold)=marque/actif & Or · bronze(btc)=Crypto · ardoise(blue)=Indices
    //           céladon(teal)=Picking · taupe(gray)=Cash · sauge(green)=gain · bois-de-rose(red)=perte
    bg:"#0B0A08",bg1:"#13110D",bg2:"#1A1712",bg3:"#23201A",
    border:"#2C2820",border2:"#3C3729",
    btc:"#C08A4E",blue:"#7E97B8",teal:"#6FA38F",gold:"#C9A86A",
    purple:"#B08FD4",green:"#7FB89A",red:"#C97F7F",orange:"#D4A86A",gray:"#9A9082",
    text:"#F4F0E8",text2:"#A8A092",text3:"#6B6456",
    name:"✦ Onyx & Champagne", font:"'Inter','-apple-system','BlinkMacSystemFont',sans-serif",
    radius:12, radiusSm:8,
  },
  dark: {
    bg:"#07080D",bg1:"#0E1118",bg2:"#141820",bg3:"#1C2130",
    border:"#252D3D",border2:"#2E3A50",
    btc:"#F7931A",blue:"#1E40AF",teal:"#0EA5E9",gold:"#EAB308",
    purple:"#8B5CF6",green:"#10B981",red:"#EF4444",orange:"#F97316",gray:"#6B7280",
    text:"#F1F5F9",text2:"#9CA3AF",text3:"#4B5563",
    name:"Dark", font:"'-apple-system','BlinkMacSystemFont','SF Pro Display',sans-serif",
    radius:14, radiusSm:8,
  },
  arctic: {
    bg:"#EEF3F8",bg1:"#FFFFFF",bg2:"#E2EAF2",bg3:"#D0DCE8",
    border:"#BFD0E0",border2:"#A8C0D6",
    btc:"#C96A0E",blue:"#1A5FA8",teal:"#0284C7",gold:"#92620A",
    purple:"#6D3FB5",green:"#047857",red:"#DC2626",orange:"#C2410C",gray:"#4A6880",
    text:"#0D1F30",text2:"#2E4D65",text3:"#6B8FA8",
    name:"Arctic Light", font:"'-apple-system','BlinkMacSystemFont','SF Pro Display',sans-serif",
    radius:14, radiusSm:8,
  },
  bloomberg: {
    bg:"#0A0C0A",bg1:"#0E110E",bg2:"#141A14",bg3:"#1A221A",
    border:"#1E2E1E",border2:"#243624",
    btc:"#00FF41",blue:"#00CC33",teal:"#00E676",gold:"#FFD600",
    purple:"#00FF41",green:"#00FF41",red:"#FF3131",orange:"#FFB300",gray:"#4A7A45",
    text:"#C8F0C0",text2:"#7AB870",text3:"#3D6B38",
    name:"Bloomberg Terminal", font:"'Courier New','Lucida Console',monospace",
    radius:3, radiusSm:2,
  },
  midnight: {
    bg:"#080612",bg1:"#0F0A1E",bg2:"#160F2A",bg3:"#1E1538",
    border:"#2D2050",border2:"#3D2D6A",
    btc:"#D4A843",blue:"#7B5EA7",teal:"#9B6DD4",gold:"#D4A843",
    purple:"#B87FE8",green:"#4CC9A0",red:"#E05585",orange:"#D4A843",gray:"#5A4880",
    text:"#EDE8FF",text2:"#A090C8",text3:"#5A4880",
    name:"Midnight Luxury", font:"'-apple-system','BlinkMacSystemFont','SF Pro Display',sans-serif",
    radius:16, radiusSm:10,
  },
  bitcoin: {
    bg:"#0D0800",bg1:"#150C00",bg2:"#1E1200",bg3:"#2A1A00",
    border:"#3D2800",border2:"#5A3C00",
    btc:"#F7931A",blue:"#C4720E",teal:"#FFB347",gold:"#FFD700",
    purple:"#F7931A",green:"#F7931A",red:"#FF4500",orange:"#F7931A",gray:"#6B4E1A",
    text:"#FFF8F0",text2:"#D4956A",text3:"#6B4E1A",
    name:"Bitcoin Maximalist", font:"'-apple-system','BlinkMacSystemFont','SF Pro Display',sans-serif",
    radius:14, radiusSm:8,
  },
  frozen: {
    // ❄ Frozen Throne — nuit arctique, cristaux de glace, runes bleues
    bg:"#020814",bg1:"#060F1E",bg2:"#0B1828",bg3:"#101F35",
    border:"#1A3A5C",border2:"#2A5A8A",
    btc:"#7DD8FF",blue:"#4FACDE",teal:"#00D4FF",gold:"#A8DFFF",
    purple:"#8BB4E8",green:"#4DE8C4",red:"#FF4D6A",orange:"#7DD8FF",gray:"#3A6080",
    text:"#D0EEFF",text2:"#7AADCC",text3:"#3A6080",
    name:"❄ Frozen Throne", font:"'-apple-system','BlinkMacSystemFont','SF Pro Display',sans-serif",
    radius:6, radiusSm:3,
  },
  tropical: {
    // 🌴 Tropical — sable blanc, eau turquoise, soleil
    bg:"#FFF9EE",bg1:"#FFFDF7",bg2:"#FFF3D4",bg3:"#FFE8A8",
    border:"#FFD580",border2:"#FFB830",
    btc:"#FF8C00",blue:"#0099CC",teal:"#00C2C7",gold:"#FFB830",
    purple:"#E040A0",green:"#00A878",red:"#E53935",orange:"#FF8C00",gray:"#8AA0A8",
    text:"#1A3040",text2:"#2D6070",text3:"#8AA0A8",
    name:"🌴 Tropical", font:"'-apple-system','BlinkMacSystemFont','SF Pro Display',sans-serif",
    radius:20, radiusSm:12,
  },
};

/* C est une variable module réassignable au changement de thème */
let C = THEMES.luxe;
const getCC = () => ({Indices:C.blue,Picking:C.teal,Or:C.gold,Cash:C.gray});
let cc = getCC();

/* ─── ICÔNES — jeu filaire unifié (1.5px), thématisable ───────────────────── */
const ICON_PATHS = {
  home:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  pie:'<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M12 3a9 9 0 0 1 9 9h-9z"/>',
  chart:'<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list:'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  gem:'<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18"/><path d="M9 3l-3 6 6 12"/><path d="M15 3l3 6-6 12"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  gear:'<circle cx="12" cy="12" r="3.1"/><path d="M10.59 3.11 L13.41 3.11 L13.52 5.68 L15.4 6.46 L17.29 4.72 L19.28 6.71 L17.54 8.6 L18.32 10.48 L20.89 10.59 L20.89 13.41 L18.32 13.52 L17.54 15.4 L19.28 17.29 L17.29 19.28 L15.4 17.54 L13.52 18.32 L13.41 20.89 L10.59 20.89 L10.48 18.32 L8.6 17.54 L6.71 19.28 L4.72 17.29 L6.46 15.4 L5.68 13.52 L3.11 13.41 L3.11 10.59 L5.68 10.48 L6.46 8.6 L4.72 6.71 L6.71 4.72 L8.6 6.46 L10.48 5.68 Z"/>',
  refresh:'<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  eye:'<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:'<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
  edit:'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  trash:'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  camera:'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  repeat:'<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  plus:'<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  check:'<path d="M20 6L9 17l-5-5"/>',
  x:'<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  cloud:'<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  alert:'<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  search:'<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  clock:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  flame:'<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  coin:'<circle cx="12" cy="12" r="9"/><path d="M14.5 9.2a2.7 2.2 0 0 0-2.5-1.2c-1.5 0-2.6.7-2.6 1.8 0 1.1 1 1.6 2.6 1.9 1.6.3 2.7.8 2.7 2 0 1.2-1.2 1.9-2.8 1.9a2.8 2.2 0 0 1-2.6-1.3"/><path d="M12 6.2v1.4M12 16.4v1.4"/>',
  layers:'<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
  wallet:'<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 9.5v5M18 9.5v5"/><circle cx="12" cy="12" r="2.4"/>',
};
function Icon({name,size=20,color="currentColor",sw=1.5,style}){
  return React.createElement("svg",{
    width:size,height:size,viewBox:"0 0 24 24",fill:"none",
    stroke:color,strokeWidth:sw,strokeLinecap:"round",strokeLinejoin:"round",
    style:style, dangerouslySetInnerHTML:{__html:ICON_PATHS[name]||""}
  });
}

/* Famille de position → icône filaire (plus d'emoji) */
const FAMILY_ICONS = {
  "Crypto":"coin", "Cryptos":"coin", "Indices ETF":"layers", "Stock Picking":"target", "Stocks":"target",
  "Or / Gold":"gem", "Cash Dip":"wallet", "Cash Matelas":"wallet",
};

/* Titre d'onglet — police luxe Cinzel champagne + sous-titre petites capitales */
function PageTitle({title, sub}){
  return React.createElement("div",{style:{marginBottom:18,textAlign:"center"}},
    React.createElement("div",{style:{fontFamily:"'Cinzel',Georgia,serif",fontSize:20,fontWeight:600,letterSpacing:2.5,color:C.gold,lineHeight:1.15}}, title),
    sub ? React.createElement("div",{style:{fontSize:9,letterSpacing:4,color:C.text2,textTransform:"uppercase",textAlign:"center",marginTop:6}}, sub) : null
  );
}

/* Bouton "luxe" réutilisable — style Snapshot ; actif = accent champagne (ou couleur passée) */
function lxBtn(opts){
  opts = opts || {};
  const active = !!opts.active;
  const accent = opts.accent || C.gold;
  return {
    display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,
    padding: opts.padding || "9px 13px",
    borderRadius: C.radiusSm||8, fontFamily:C.font, fontSize: opts.fontSize||12, fontWeight:600,
    letterSpacing:.3, cursor:"pointer", transition:"all .15s", whiteSpace:"nowrap",
    border:`1px solid ${active?accent:C.border2}`,
    background: active ? accent+"16" : "transparent",
    color: active ? accent : C.text2,
    ...(opts.style||{}),
  };
}


/* ─── TF_CUTS dynamiques ─────────────────────────────── */
function makeTFCuts(){
  const t=new Date(Date.now() + NC_OFFSET_MS); // heure locale NC (UTC+11)
  const pad=n=>String(n).padStart(2,"0");
  const fmt=d=>`${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
  const d7=new Date(+t -  7*864e5);
  const d30=new Date(+t - 30*864e5);
  const d1y=new Date(+t - 365*864e5);
  const y=t.getUTCFullYear(), m=pad(t.getUTCMonth()+1);
  return {"1W":fmt(d7),"1M":fmt(d30),"MTD":`${y}-${m}-01`,"YTD":`${y}-01-01`,"1Y":fmt(d1y),"2Y":fmt(new Date(+d1y - 365*864e5)),"ALL":"2020-01-01"};
}

// #70 — Ancrages mensuels base 100 d'un fonds (CGIC/CGIS) à partir des rendements mensuels,
// + interpolation linéaire à une date. Versions globales pour les sparklines des FondCard
// (mêmes formules que le graphe de comparaison, gardées indépendantes pour ne pas le toucher).
function gdbFundAnchors(MAP){
  const arr=[]; let idx=100, started=false;
  const yrs=Object.keys(MAP||{}).filter(y=>/^\d{4}$/.test(y)).sort();
  yrs.forEach(y=>{ const d=MAP[y]; if(!d||!d.m) return;
    d.m.forEach((ml,i)=>{ if(!ml) return;
      const pnl=d.pnl?d.pnl[i]:null;
      if(pnl==null) return;                       // #fix — pas d'ancre pour un mois sans données (sinon courbe gelée à plat)
      const mm=String(i+1).padStart(2,"0");
      const base=(d.bom?d.bom[i]:0||0)+(d.inv?d.inv[i]:0||0);
      if(!started){ arr.push({d:y+"-"+mm+"-01", v:100}); started=true; }
      const ret=(base>0)?pnl/base:0;
      idx=idx*(1+ret);
      arr.push({d:y+"-"+mm+"-28", v:idx});
    });
  });
  return arr;
}
function gdbInterp(anchors, dstr){
  if(!anchors||!anchors.length) return null;
  if(dstr<anchors[0].d) return null;              // #fix — rien avant la création du fonds (plus de plateau à 100)
  if(dstr>=anchors[anchors.length-1].d) return anchors[anchors.length-1].v;
  for(let i=0;i<anchors.length-1;i++){
    if(dstr>=anchors[i].d && dstr<=anchors[i+1].d){
      const t0=new Date(anchors[i].d).getTime(), t1=new Date(anchors[i+1].d).getTime(), t=new Date(dstr).getTime();
      const f=(t-t0)/((t1-t0)||1);
      return anchors[i].v + (anchors[i+1].v-anchors[i].v)*f;
    }
  }
  return anchors[anchors.length-1].v;
}
// Série base-100 d'un fonds sur une fenêtre [cut → aujourd'hui], ~25 points, rebasée à 100.
// liveIdx (optionnel) = valeur d'indice base-100 AUJOURD'HUI (mois courant live) → dernier point réel.
function gdbFundSeries(anchors, cut, liveIdx){
  try{
    if(!anchors||!anchors.length) return [];
    const inception = anchors[0].d;
    const startStr = (cut < inception) ? inception : cut;   // #fix — ne pas échantillonner avant la création (rebase 100 exact)
    const start=new Date(startStr+"T00:00:00").getTime(); const end=Date.now();
    if(!(end>start)) return [];
    const N=24, raw=[];
    for(let i=0;i<N;i++){ const d=new Date(start+(end-start)*i/N).toISOString().slice(0,10); raw.push(gdbInterp(anchors,d)); }
    raw.push((liveIdx!=null&&liveIdx>0) ? liveIdx : gdbInterp(anchors, new Date(end).toISOString().slice(0,10)));
    const f=raw.find(v=>v!=null&&v>0); if(!f) return [];
    return raw.map(v=>(v!=null&&v>0)?v/f*100:null);
  }catch(e){ return []; }
}


/* ─── FONDS — données QUOTIDIENNES (tableau de vérité étendu) ─────────────
   CRYPTO_DAILY : indice CGIC base-100 quotidien, dérivé du fichier d'origine (valeurs €),
   ANCRÉ sur le tableau mensuel (tie-out exact aux fins de mois → cohérent avec les P&L).
   KV_JUNE : NAV par part [date, CGIS$, CGIC$] issues du KV nettoyé (juin), servent de FORME
   quotidienne ; leur magnitude est ré-ancrée entre fin mai et la valeur live (cf gdbAppendJune). */
const CRYPTO_DAILY = [
  ["2022-01-01",100.0],["2022-01-02",100.0],["2022-01-03",100.0],["2022-01-04",100.0],["2022-01-05",100.0],
  ["2022-01-06",100.0],["2022-01-08",100.0],["2022-01-10",100.0],["2022-01-13",100.0],["2022-01-17",100.0],
  ["2022-01-22",100.0],["2022-02-01",100.0],["2022-02-03",90.015],["2022-02-05",90.015],
  ["2022-02-07",103.569],["2022-02-14",103.569],["2022-02-21",90.015],["2022-02-28",93.227],
  ["2022-03-05",97.612],["2022-03-07",96.552],["2022-03-10",96.504],["2022-03-12",97.606],
  ["2022-03-19",102.362],["2022-03-28",117.018],["2022-03-29",119.574],["2022-04-04",128.808],
  ["2022-04-05",128.808],["2022-04-07",95.978],["2022-04-09",95.658],["2022-04-11",95.658],
  ["2022-04-13",95.658],["2022-04-15",95.658],["2022-04-16",95.658],["2022-04-18",95.658],
  ["2022-04-19",95.658],["2022-04-21",95.658],["2022-04-22",95.658],["2022-04-23",95.658],
  ["2022-04-24",97.654],["2022-04-25",96.999],["2022-04-27",95.658],["2022-04-28",127.171],
  ["2022-04-29",128.808],["2022-04-30",103.045],["2022-05-01",88.581],["2022-05-02",104.856],
  ["2022-05-04",104.096],["2022-05-05",118.987],["2022-05-07",75.922],["2022-05-09",70.41],
  ["2022-05-10",66.928],["2022-05-11",67.051],["2022-05-12",75.744],["2022-05-14",73.012],
  ["2022-05-15",67.954],["2022-05-16",77.957],["2022-05-17",76.177],["2022-05-20",66.928],
  ["2022-05-21",66.928],["2022-05-22",66.928],["2022-05-23",66.928],["2022-05-24",66.928],
  ["2022-05-25",69.433],["2022-05-26",69.575],["2022-05-27",66.928],["2022-05-28",66.928],
  ["2022-05-29",66.928],["2022-05-31",77.282],["2022-06-01",87.822],["2022-06-03",64.274],
  ["2022-06-04",66.238],["2022-06-05",68.194],["2022-06-06",87.822],["2022-06-10",75.942],
  ["2022-06-11",69.04],["2022-06-12",64.607],["2022-06-15",86.74],["2022-06-17",83.787],["2022-06-19",61.25],
  ["2022-06-21",52.664],["2022-06-22",52.664],["2022-06-23",52.664],["2022-06-24",52.664],
  ["2022-06-29",58.386],["2022-06-30",59.846],["2022-07-01",58.227],["2022-07-03",58.51],
  ["2022-07-04",58.917],["2022-07-05",60.45],["2022-07-09",61.404],["2022-07-10",63.124],
  ["2022-07-13",60.901],["2022-07-19",65.963],["2022-07-24",68.103],["2022-07-29",70.363],
  ["2022-08-03",69.405],["2022-08-05",70.546],["2022-08-07",70.32],["2022-08-10",70.61],["2022-08-13",73.807],
  ["2022-08-14",73.671],["2022-09-05",59.534],["2022-09-06",59.534],["2022-09-07",59.534],
  ["2022-09-11",59.534],["2022-09-13",59.923],["2022-09-14",59.534],["2022-09-17",59.534],
  ["2022-09-21",59.534],["2022-09-23",59.534],["2022-09-26",59.534],["2022-09-28",63.916],
  ["2022-10-01",63.32],["2022-10-03",63.045],["2022-10-06",64.142],["2022-10-11",63.339],
  ["2022-10-14",64.668],["2022-10-19",64.176],["2022-10-24",64.603],["2022-10-26",65.961],
  ["2022-10-27",66.732],["2022-10-29",67.658],["2022-10-31",67.67],["2022-11-01",68.416],
  ["2022-11-04",71.715],["2022-11-24",49.111],["2022-12-04",46.427],["2022-12-09",46.291],
  ["2022-12-13",46.291],["2022-12-14",46.291],["2022-12-23",46.291],["2022-12-31",47.212],
  ["2023-01-01",47.284],["2023-01-06",49.216],["2023-01-08",49.468],["2023-01-12",51.757],
  ["2023-01-13",53.264],["2023-01-14",58.449],["2023-01-16",58.328],["2023-01-20",59.522],
  ["2023-01-21",63.392],["2023-01-26",63.098],["2023-01-29",65.104],["2023-02-01",64.858],
  ["2023-02-04",65.191],["2023-02-07",65.119],["2023-02-08",65.344],["2023-02-12",64.861],
  ["2023-02-16",65.846],["2023-02-26",65.598],["2023-03-06",64.822],["2023-03-08",64.451],
  ["2023-03-10",60.163],["2023-03-14",69.483],["2023-03-17",72.86],["2023-03-18",76.808],
  ["2023-03-18",77.404],["2023-03-25",75.462],["2023-03-30",77.985],["2023-04-03",78.176],
  ["2023-04-04",77.214],["2023-04-05",78.76],["2023-04-07",77.729],["2023-04-11",82.413],
  ["2023-04-14",84.279],["2023-05-17",75.525],["2023-05-25",84.875],["2023-05-29",78.337],
  ["2023-06-04",77.427],["2023-07-14",82.721],["2023-07-23",78.523],["2023-08-11",79.338],
  ["2023-08-15",79.49],["2023-09-03",71.142],["2023-09-08",71.327],["2023-09-18",73.578],
  ["2023-09-19",74.914],["2023-09-27",72.603],["2023-10-02",78.996],["2023-10-07",76.984],
  ["2023-10-13",74.235],["2023-10-15",74.683],["2023-10-16",75.34],["2023-10-24",89.402],
  ["2023-10-29",92.154],["2023-11-01",94.241],["2023-11-04",92.738],["2023-11-23",97.152],
  ["2023-11-25",97.915],["2023-11-27",96.867],["2023-12-15",107.756],["2023-12-19",103.698],
  ["2023-12-21",109.242],["2023-12-30",107.184],["2024-01-02",110.074],["2024-01-06",108.876],
  ["2024-01-09",110.759],["2024-01-11",111.386],["2024-01-13",109.674],["2024-01-17",109.882],
  ["2024-01-19",108.692],["2024-01-25",107.436],["2024-01-26",107.846],["2024-01-28",109.667],
  ["2024-01-29",109.588],["2024-01-30",110.613],["2024-01-31",110.639],["2024-02-01",111.429],
  ["2024-02-07",116.598],["2024-02-09",122.061],["2024-02-10",124.334],["2024-02-12",129.532],
  ["2024-02-13",128.563],["2024-02-15",134.087],["2024-02-16",134.656],["2024-02-17",134.477],
  ["2024-02-18",134.344],["2024-02-19",136.109],["2024-02-21",134.997],["2024-02-22",135.08],
  ["2024-02-25",134.498],["2024-02-27",143.988],["2024-02-28",151.559],["2024-02-29",158.03],
  ["2024-03-02",160.702],["2024-03-04",165.01],["2024-03-05",170.176],["2024-03-06",172.03],
  ["2024-03-08",172.207],["2024-03-09",173.442],["2024-03-10",174.529],["2024-03-11",179.022],
  ["2024-03-12",180.097],["2024-03-13",182.709],["2024-03-15",181.327],["2024-03-22",168.245],
  ["2024-03-24",164.18],["2024-03-26",175.304],["2024-03-27",177.858],["2024-03-28",178.895],
  ["2024-03-29",177.547],["2024-04-06",170.845],["2024-04-07",173.787],["2024-04-08",182.445],
  ["2024-04-15",160.518],["2024-04-19",161.092],["2024-04-21",163.82],["2024-04-22",169.123],
  ["2024-04-25",162.311],["2024-04-26",160.282],["2024-04-28",159.198],["2024-05-02",152.589],
  ["2024-05-05",162.171],["2024-05-06",160.444],["2024-05-07",158.31],["2024-05-08",155.51],
  ["2024-05-19",165.402],["2024-05-21",177.273],["2024-05-22",175.781],["2024-05-24",170.574],
  ["2024-05-25",175.187],["2024-05-27",174.595],["2024-05-28",171.998],["2024-05-30",173.558],
  ["2024-05-31",173.289],["2024-06-01",171.371],["2024-06-05",181.052],["2024-06-06",183.032],
  ["2024-06-11",171.511],["2024-06-12",170.792],["2024-06-13",172.875],["2024-06-14",171.767],
  ["2024-06-16",172.839],["2024-06-20",164.862],["2024-06-22",162.731],["2024-06-27",152.555],
  ["2024-06-28",157.396],["2024-06-29",151.206],["2024-06-30",154.861],["2024-07-02",158.256],
  ["2024-07-03",154.053],["2024-07-05",147.4],["2024-07-06",147.4],["2024-07-07",147.606],
  ["2024-07-08",147.4],["2024-07-10",149.64],["2024-07-13",151.416],["2024-07-14",157.441],
  ["2024-07-15",162.327],["2024-07-16",165.347],["2024-07-29",170.939],["2024-08-01",170.878],
  ["2024-08-13",142.977],["2024-08-15",140.162],["2024-08-17",139.83],["2024-08-18",140.639],
  ["2024-08-31",137.075],["2024-09-01",137.527],["2024-09-04",137.113],["2024-09-05",134.694],
  ["2024-09-06",134.519],["2024-09-07",133.429],["2024-09-08",132.327],["2024-09-09",134.118],
  ["2024-09-10",137.379],["2024-09-11",138.519],["2024-09-13",138.608],["2024-09-14",143.749],
  ["2024-09-15",142.771],["2024-09-16",140.497],["2024-09-20",149.557],["2024-09-22",149.916],
  ["2024-09-23",152.955],["2024-09-24",153.513],["2024-09-27",155.703],["2024-09-29",155.738],
  ["2024-09-30",155.038],["2024-10-01",154.133],["2024-10-02",148.968],["2024-10-06",150.639],
  ["2024-10-07",153.237],["2024-10-12",154.231],["2024-10-14",157.448],["2024-10-15",160.754],
  ["2024-10-16",163.83],["2024-10-18",165.219],["2024-10-20",165.982],["2024-10-21",169.04],
  ["2024-10-24",162.407],["2024-10-25",164.982],["2024-10-27",162.458],["2024-10-29",170.418],
  ["2024-10-30",174.387],["2024-10-31",171.252],["2024-11-01",166.767],["2024-11-02",166.231],
  ["2024-11-03",163.059],["2024-11-04",163.578],["2024-11-05",163.279],["2024-11-06",178.55],
  ["2024-11-07",182.66],["2024-11-08",185.289],["2024-11-09",187.933],["2024-11-10",197.009],
  ["2024-11-11",202.724],["2024-11-12",220.414],["2024-11-13",211.562],["2024-11-14",226.555],
  ["2024-11-15",219.273],["2024-11-16",223.399],["2024-11-17",221.768],["2024-11-18",223.485],
  ["2024-11-19",223.38],["2024-11-20",223.243],["2024-11-21",235.369],["2024-11-22",240.825],
  ["2024-11-23",244.959],["2024-11-24",243.572],["2024-11-25",242.195],["2024-11-26",229.766],
  ["2024-11-27",235.358],["2024-11-28",237.676],["2024-11-29",243.178],["2024-11-30",243.548],
  ["2024-12-01",246.77],["2024-12-02",251.502],["2024-12-03",241.837],["2024-12-04",252.62],
  ["2024-12-05",254.33],["2024-12-06",254.33],["2024-12-08",254.33],["2024-12-09",254.33],
  ["2024-12-13",254.33],["2024-12-15",254.33],["2024-12-17",254.33],["2024-12-18",254.33],
  ["2024-12-20",223.873],["2024-12-21",252.236],["2024-12-22",239.137],["2024-12-23",228.699],
  ["2024-12-25",236.315],["2024-12-26",244.113],["2024-12-28",229.98],["2024-12-29",233.005],
  ["2024-12-31",223.338],["2025-01-01",226.423],["2025-01-02",234.785],["2025-01-03",238.924],
  ["2025-01-04",244.877],["2025-01-05",244.476],["2025-01-06",247.226],["2025-01-07",248.43],
  ["2025-01-10",231.41],["2025-01-12",229.77],["2025-01-15",232.619],["2025-01-16",240.967],
  ["2025-01-17",247.322],["2025-01-18",254.512],["2025-01-19",250.97],["2025-01-20",256.882],
  ["2025-01-21",239.497],["2025-01-22",246.157],["2025-01-24",244.211],["2025-01-25",241.02],
  ["2025-01-26",244.715],["2025-01-28",239.231],["2025-01-29",240.317],["2025-01-30",244.565],
  ["2025-01-31",245.362],["2025-02-01",241.306],["2025-02-04",223.481],["2025-02-05",221.319],
  ["2025-02-06",223.422],["2025-02-11",224.755],["2025-02-19",214.909],["2025-02-28",180.499],
  ["2025-03-03",185.338],["2025-03-09",183.166],["2025-03-13",171.925],["2025-03-19",172.194],
  ["2025-03-20",179.792],["2025-03-21",176.611],["2025-03-31",171.196],["2025-04-01",175.208],
  ["2025-04-02",176.177],["2025-04-12",164.506],["2025-04-23",182.476],["2025-04-30",187.342],
  ["2025-05-01",189.421],["2025-05-07",190.044],["2025-05-08",190.31],["2025-05-09",206.699],
  ["2025-05-10",208.911],["2025-05-11",212.464],["2025-05-12",216.033],["2025-05-16",210.789],
  ["2025-05-19",208.225],["2025-05-22",222.75],["2025-05-24",216.608],["2025-05-27",220.636],
  ["2025-05-28",219.072],["2025-05-29",219.664],["2025-06-03",205.254],["2025-06-28",205.602],
  ["2025-07-02",204.96],["2025-07-10",216.41],["2025-07-11",230.269],["2025-07-14",231.523],
  ["2025-07-18",239.538],["2025-07-20",237.71],["2025-07-20",237.71],["2025-07-20",237.71],
  ["2025-07-21",240.72],["2025-07-31",242.047],["2025-08-06",228.369],["2025-08-11",251.175],
  ["2025-08-14",251.797],["2025-08-15",251.797],["2025-08-16",243.143],["2025-08-19",236.893],
  ["2025-08-22",233.965],["2025-08-31",223.665],["2025-09-03",227.684],["2025-09-06",225.922],
  ["2025-09-07",225.227],["2025-09-09",227.734],["2025-09-12",228.233],["2025-09-12",228.233],
  ["2025-09-13",228.233],["2025-09-15",228.233],["2025-09-17",228.233],["2025-09-18",228.233],
  ["2025-09-19",228.233],["2025-09-20",228.233],["2025-09-25",226.7],["2025-10-01",240.118],
  ["2025-10-02",240.118],["2025-10-04",240.118],["2025-10-05",240.118],["2025-10-07",240.118],
  ["2025-10-08",240.118],["2025-10-09",240.118],["2025-10-13",240.118],["2025-10-15",230.995],
  ["2025-10-21",222.541],["2025-10-27",235.56],["2025-11-03",220.712],["2025-11-10",216.885],
  ["2025-11-22",171.218],["2025-11-27",186.662],["2025-11-29",185.629],["2025-12-01",159.474],
  ["2025-12-03",195.304],["2025-12-07",179.651],["2025-12-14",182.913],["2025-12-20",171.617],
  ["2025-12-21",174.705],["2025-12-23",165.2],["2025-12-24",164.465],["2025-12-25",167.692],
  ["2026-01-04",173.677],["2026-01-12",175.904],["2026-01-14",176.638],["2026-01-16",176.638],
  ["2026-01-22",173.604],["2026-02-02",145.631],["2026-02-22",129.457],["2026-03-10",133.661],
  ["2026-03-23",132.245],["2026-04-14",143.08],["2026-04-25",149.275],["2026-05-29",140.822],
];
const KV_JUNE = [
  ["2026-06-08",169.6575,135.0777],["2026-06-09",170.1271,134.4453],["2026-06-13",167.8066,135.9786],["2026-06-14",167.8066,137.7111],["2026-06-15",167.8066,139.9665],["2026-06-16",156.674,143.0255],["2026-06-18",150.5304,137.5202],["2026-06-19",148.7182,134.2236],["2026-06-20",148.7293,136.5398],["2026-06-21",148.7293,136.973],["2026-06-22",161.7017,137.2012],["2026-06-23",143.0552,133.3321],["2026-06-24",144.7735,134.2638],["2026-06-25",145.3149,129.9279],["2026-06-27",147.232,129.2356],["2026-06-29",147.2597,128.5415],
];
// CGIS_DAILY : indice CGIS base-100 quotidien (fichier CGIS.xlsx), ancré sur le mensuel CGIS.
const CGIS_DAILY = [
  ["2025-01-01",100.0],["2025-01-02",100.0],["2025-01-03",100.0],["2025-01-05",100.0],["2025-01-12",100.0],
  ["2025-01-15",100.0],["2025-01-16",100.0],["2025-01-17",100.0],["2025-01-18",100.0],["2025-01-19",100.0],
  ["2025-01-20",100.0],["2025-01-21",100.0],["2025-01-22",100.0],["2025-01-24",100.0],["2025-01-25",100.0],
  ["2025-01-26",100.0],["2025-01-28",100.0],["2025-01-29",100.0],["2025-01-30",100.0],["2025-01-31",100.0],
  ["2025-02-01",100.0],["2025-02-04",100.865],["2025-02-05",99.208],["2025-02-06",99.667],
  ["2025-02-11",100.305],["2025-02-19",103.357],["2025-02-28",102.213],["2025-03-03",102.208],
  ["2025-03-09",102.25],["2025-03-13",102.296],["2025-03-19",100.21],["2025-03-20",100.216],
  ["2025-03-21",100.219],["2025-03-31",99.676],["2025-04-01",100.517],["2025-04-02",100.615],
  ["2025-04-12",96.81],["2025-04-23",96.81],["2025-04-30",97.759],["2025-05-01",97.748],["2025-05-07",97.947],
  ["2025-05-08",97.946],["2025-05-09",98.267],["2025-05-10",98.349],["2025-05-11",98.349],
  ["2025-05-16",103.67],["2025-05-19",103.475],["2025-05-22",103.181],["2025-05-24",103.001],
  ["2025-05-27",103.544],["2025-05-28",103.529],["2025-05-29",103.432],["2025-06-02",101.622],
  ["2025-07-02",101.983],["2025-07-10",103.474],["2025-07-11",104.749],["2025-07-14",104.594],
  ["2025-07-18",104.61],["2025-07-20",104.641],["2025-07-21",104.614],["2025-08-06",101.85],
  ["2025-08-11",104.329],["2025-08-14",106.424],["2025-08-15",106.372],["2025-08-16",106.372],
  ["2025-08-19",106.515],["2025-08-22",104.487],["2025-08-31",110.378],["2025-09-03",107.921],
  ["2025-09-06",107.534],["2025-09-07",107.534],["2025-09-09",107.534],["2025-09-11",107.534],
  ["2025-09-12",107.534],["2025-09-13",109.702],["2025-09-15",109.722],["2025-09-17",111.647],
  ["2025-09-18",112.136],["2025-09-19",113.537],["2025-09-20",114.365],["2025-09-25",116.292],
  ["2025-10-01",116.303],["2025-10-02",116.471],["2025-10-04",116.532],["2025-10-05",116.532],
  ["2025-10-07",116.576],["2025-10-08",116.617],["2025-10-09",116.819],["2025-10-13",117.197],
  ["2025-10-15",118.869],["2025-10-21",119.053],["2025-10-27",118.796],["2025-11-03",121.271],
  ["2025-11-10",111.669],["2025-11-22",111.669],["2025-11-27",111.669],["2025-11-29",113.997],
  ["2025-12-01",114.032],["2025-12-03",112.376],["2025-12-07",115.918],["2025-12-14",117.064],
  ["2025-12-20",117.564],["2025-12-21",117.564],["2025-12-23",118.215],["2025-12-25",117.304],
  ["2026-01-04",116.828],["2026-01-12",116.531],["2026-01-14",116.54],["2026-01-16",116.676],
  ["2026-01-22",116.75],["2026-02-02",117.09],["2026-02-22",114.52],["2026-03-10",114.722],
  ["2026-03-23",113.191],["2026-04-14",111.786],["2026-04-25",121.098],["2026-05-29",154.241],
];
function _todayNCstr(){ try{ return (typeof todayNC==="function")?todayNC():new Date().toISOString().slice(0,10); }catch(e){ return new Date().toISOString().slice(0,10); } }
// Assainit la série quotidienne GDBS (KV) : retire le stub base-100 du 31/05/2026 (~100/100)
// et les points du 01→07/06/2026 jugés incohérents (retirés côté Excel). Appliqué à la lecture →
// la série propre se re-persiste au KV au prochain enregistrement.
function sanitizeGDBS(arr){
  try{
    if(!Array.isArray(arr)||arr.length<2) return arr;
    const out=arr.filter(r=>{
      if(!r||r[0]==null) return false;
      if(r[0]==="2026-05-31" && Math.abs((r[1]||0)-100)<1.5 && Math.abs((r[2]||0)-100)<1.5) return false;
      if(r[0]>="2026-06-01" && r[0]<"2026-06-08") return false;
      return true;
    });
    return out.length?out:arr;
  }catch(e){ return arr; }
}
// Ancres CGIC = série quotidienne base-100 (déjà cohérente avec le mensuel).
function gdbCgicDailyAnchors(){
  try{ return (typeof CRYPTO_DAILY!=="undefined"?CRYPTO_DAILY:[]).map(r=>({d:r[0], v:r[1]})); }catch(e){ return []; }
}
function gdbCgisDailyAnchors(){
  try{ return (typeof CGIS_DAILY!=="undefined"?CGIS_DAILY:[]).map(r=>({d:r[0], v:r[1]})); }catch(e){ return []; }
}
// Prolonge des ancres jusqu'à aujourd'hui — ALIMENTATION CONTINUE par les snapshots.
// Priorité 1 : journal quotidien cgi_daily (valeurs € réelles, jField='c' CGIC / 's' CGIS) → toute
// nouvelle journée enregistrée densifie automatiquement la courbe. Priorité 2 : forme du KV de juin
// embarqué (kvCol 2=CGIC / 1=CGIS). La FORME est conservée (ratios) et une légère dérive est répartie
// pour viser la valeur live d'aujourd'hui → endpoints exacts, cohérence avec les P&L garantie.
// #77 v2 — anti-pic à report (global) : neutralise un pic isolé (>35 % vs dernière valeur saine,
// voisin suivant qui revient) en reportant la dernière valeur saine ; préserve les tendances
// progressives. Utilisé par le graphe base 100 ET les sparklines des cartes CGIC/CGIS.
function _despikeCarry(vals){
  if(!Array.isArray(vals)) return vals;
  const out=vals.slice(); let lastGood=null;
  for(let i=0;i<out.length;i++){
    const v=out[i]; if(v==null||v<=0) continue;
    if(lastGood==null){ lastGood=v; continue; }
    if(Math.abs(v-lastGood)/lastGood > 0.35){
      let nx=null; for(let j=i+1;j<out.length;j++){ if(out[j]!=null&&out[j]>0){ nx=out[j]; break; } }
      const returns = (nx==null) ? true : (Math.abs(nx-lastGood)/lastGood < 0.35);
      if(returns){ out[i]=lastGood; continue; }
    }
    lastGood=v;
  }
  return out;
}
function gdbAppendLive(anchors, jField, kvCol, liveIdx){
  try{
    if(!anchors||!anchors.length) return anchors;
    const last = anchors[anchors.length-1];
    const today = _todayNCstr();
    const target = (liveIdx!=null&&liveIdx>0) ? liveIdx : last.v;
    const sortd = a => a.sort((x,y)=> x[0]<y[0]?-1:(x[0]>y[0]?1:0));
    // KV de juin embarqué (dense, fiable comme FORME)
    const KV=(typeof KV_JUNE!=="undefined"?KV_JUNE:[]);
    const kv=sortd(KV.filter(r=>r&&r[0]>last.d&&r[0]<=today&&r[kvCol]!=null&&r[kvCol]>0).map(r=>[r[0],r[kvCol]]));
    // journal cgi_daily (€, réel, continu)
    let jr=[];
    try{
      const j=(typeof lsv9Get==="function")?lsv9Get("cgi_daily"):null;
      if(Array.isArray(j)) jr=sortd(j.filter(x=>x&&x.d>last.d&&x.d<=today&&x[jField]!=null&&x[jField]>0).map(x=>[x.d,x[jField]]));
    }catch(e){}
    // Segment principal = le plus DENSE (le journal l'emporte à densité ≥). Puis on chaîne les
    // points du journal AU-DELÀ (mois suivants) → juin dense garanti + alimentation continue.
    const primary = (jr.length>=kv.length) ? jr : kv;
    const lastPrimD = primary.length ? primary[primary.length-1][0] : last.d;
    const ext = jr.filter(p=>p[0]>lastPrimD);
    // Chaînage en indices : chaque segment rebasé pour continuer le précédent (ratios internes).
    const out=[]; let curV=last.v, curD=last.d;
    const chain=(seg)=>{ const s=seg.filter(p=>p[0]>curD); if(!s.length) return; const v0=s[0][1]; s.forEach(p=>{ out.push([p[0], curV*(p[1]/v0)]); }); curV=out[out.length-1][1]; curD=out[out.length-1][0]; };
    chain(primary); chain(ext);
    if(!out.length){ if(last.d<today) anchors.push({d:today, v:target}); return anchors; }
    // Dérive géométrique répartie → le dernier point atteint exactement la valeur live (cohérence).
    const provN=out[out.length-1][1], k=(provN>0)?(target/provN):1, n=out.length;
    out.forEach((p,i)=>{ const prog=(n>1)?i/(n-1):1; anchors.push({d:p[0], v: p[1]*Math.pow(k,prog)}); });
    if(out[out.length-1][0]<today) anchors.push({d:today, v:target});
    return anchors;
  }catch(e){ return anchors; }
}

/* ─── DATA ──────────────────────────────────────────────── */
/* ─── FONDS JCGI ─────────────────────────────────────────── */
const GDB_S_NB_PARTS = 287;  // CGIS base divisor
const fmtQty = q => (q==null?0:q).toLocaleString("fr-FR",{maximumFractionDigits:2}); // v24 : 2 décimales max
const GDB_C_NB_PARTS = 1048;   // CGIC base divisor
// v25.01 Phase 2a (option B) — parts dynamiques depuis la base cgi_inv.
// FUND_PARTS = cumul des mouvements DB (total courant). Initialise aux totaux du seed,
// recalcule au boot/ajout depuis liveInv. calcGdbPrices divise par ces parts.
// Les constantes 5610/11942 ci-dessus restent UNIQUEMENT pour la reconstruction EOM
// Stats (v23.27), qui inverse des cours enregistres avec ces parts (B-mid traitera ca).
let FUND_PARTS = { S: 286.94, C: 1047.84 };
// v25.05 — proprietaire du portefeuille : seul un investissement a son nom debite/credite
// le Cash Matelas (E1). Les co-investisseurs font grossir le fonds brut sans toucher au Matelas.
const INV_OWNER = "JOHN";
// v2.07 — INV_SEED injecté directement (ne dépend plus de seeds.js pour cette donnée critique)
// Apports et retraits mensuels réels depuis le fichier Excel de John (Jan 2022 → Mar 2026)
const _INV_SEED_APP = [{"id":"fbc30cf7cb","date":"2022-01-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":6.49,"montant":649.0,"bank":"LCL","note":"Apport JAN 2022"},{"id":"8a60ccff71","date":"2022-02-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":6.5,"montant":650.0,"bank":"LCL","note":"Apport FEV 2022"},{"id":"315afd2930","date":"2022-03-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":6.05,"montant":605.0,"bank":"LCL","note":"Apport MAR 2022"},{"id":"83f402a5da","date":"2022-04-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":26.0,"montant":2600.0,"bank":"LCL","note":"Apport AVR 2022"},{"id":"98c3136665","date":"2022-05-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":45.5,"montant":4550.0,"bank":"LCL","note":"Apport MAI 2022"},{"id":"7d03f3cdae","date":"2022-06-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":35.19,"montant":3519.0,"bank":"LCL","note":"Apport JUI 2022"},{"id":"c2726335b3","date":"2022-07-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":34.85,"montant":3485.0,"bank":"LCL","note":"Apport JUL 2022"},{"id":"dee9eb0667","date":"2022-08-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":10.0,"montant":1000.0,"bank":"LCL","note":"Apport AOU 2022"},{"id":"e88a96706b","date":"2022-09-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":34.5,"montant":3450.0,"bank":"LCL","note":"Apport SEP 2022"},{"id":"95cf83edc5","date":"2022-10-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":38.07,"montant":3807.0,"bank":"LCL","note":"Apport OCT 2022"},{"id":"c1d8c4d712","date":"2022-11-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":24.0,"montant":2400.0,"bank":"LCL","note":"Apport NOV 2022"},{"id":"f3492b2ee4","date":"2022-12-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":17.88,"montant":1788.0,"bank":"LCL","note":"Apport DEC 2022"},{"id":"ff2a003b50","date":"2023-01-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":18.86,"montant":1886.0,"bank":"LCL","note":"Apport JAN 2023"},{"id":"40bbfd43ea","date":"2023-02-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":12.87,"montant":1287.0,"bank":"LCL","note":"Apport FEV 2023"},{"id":"7e7caa330a","date":"2023-03-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":8.71,"montant":871.0,"bank":"LCL","note":"Apport MAR 2023"},{"id":"34ecf9891b","date":"2023-04-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":10.45,"montant":1045.0,"bank":"LCL","note":"Apport AVR 2023"},{"id":"616ffe9058","date":"2023-05-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":1.0,"montant":100.0,"bank":"LCL","note":"Apport MAI 2023"},{"id":"1998666a0b","date":"2023-06-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":1.0,"montant":100.0,"bank":"LCL","note":"Apport JUI 2023"},{"id":"bc0f565da3","date":"2023-10-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":7.5,"montant":750.0,"bank":"LCL","note":"Apport OCT 2023"},{"id":"f1910608af","date":"2023-11-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":6.0,"montant":600.0,"bank":"LCL","note":"Apport NOV 2023"},{"id":"ae3e761a6b","date":"2023-12-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":7.0,"montant":700.0,"bank":"LCL","note":"Apport DEC 2023"},{"id":"b8c4cb3eae","date":"2024-01-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":46.36,"montant":4636.0,"bank":"LCL","note":"Apport JAN 2024"},{"id":"126b084aec","date":"2024-02-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":22.13,"montant":2213.0,"bank":"LCL","note":"Apport FEV 2024"},{"id":"96af9cf984","date":"2024-03-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":20.96,"montant":2096.0,"bank":"LCL","note":"Apport MAR 2024"},{"id":"e135e2ce63","date":"2024-05-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":8.0,"montant":800.0,"bank":"LCL","note":"Apport MAI 2024"},{"id":"3fd956e970","date":"2024-06-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":38.69,"montant":3869.0,"bank":"LCL","note":"Apport JUI 2024"},{"id":"a02f36ea23","date":"2024-07-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":15.88,"montant":1588.0,"bank":"LCL","note":"Apport JUL 2024"},{"id":"affb7edf7c","date":"2024-08-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":18.43,"montant":1843.0,"bank":"LCL","note":"Apport AOU 2024"},{"id":"bb8e90b3f9","date":"2024-09-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":47.79,"montant":4779.0,"bank":"LCL","note":"Apport SEP 2024"},{"id":"49a83f3548","date":"2024-10-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":20.48,"montant":2048.0,"bank":"LCL","note":"Apport OCT 2024"},{"id":"3c41cee072","date":"2024-11-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":59.64,"montant":5964.0,"bank":"LCL","note":"Apport NOV 2024"},{"id":"5cd2d1d134","date":"2024-12-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":65.99,"montant":6599.0,"bank":"LCL","note":"Apport DEC 2024"},{"id":"453636aedb","date":"2025-01-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":5.8,"montant":580.0,"bank":"LCL","note":"Apport JAN 2025"},{"id":"b31e7f2838","date":"2025-01-01","fonds":"CGIS","holder":"JOHN","io":"IN","shares":20.5,"montant":2050.0,"bank":"IBKR","note":"Apport JAN 2025"},{"id":"82c3488631","date":"2025-02-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":5.7,"montant":570.0,"bank":"LCL","note":"Apport FEV 2025"},{"id":"02612733e9","date":"2025-03-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":17.85,"montant":1785.0,"bank":"LCL","note":"Apport MAR 2025"},{"id":"57695a8b76","date":"2025-03-01","fonds":"CGIS","holder":"JOHN","io":"IN","shares":79.5,"montant":7950.0,"bank":"IBKR","note":"Apport MAR 2025"},{"id":"6d7ee53bf9","date":"2025-04-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":10.5,"montant":1050.0,"bank":"LCL","note":"Apport AVR 2025"},{"id":"f635686729","date":"2025-05-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":11.7,"montant":1170.0,"bank":"LCL","note":"Apport MAI 2025"},{"id":"a1413abe2d","date":"2025-05-01","fonds":"CGIS","holder":"JOHN","io":"IN","shares":30.0,"montant":3000.0,"bank":"IBKR","note":"Apport MAI 2025"},{"id":"f91cceecaf","date":"2025-06-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":12.5,"montant":1250.0,"bank":"LCL","note":"Apport JUI 2025"},{"id":"9d2ce9c4a5","date":"2025-07-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":11.95,"montant":1195.0,"bank":"LCL","note":"Apport JUL 2025"},{"id":"8fd676b0ce","date":"2025-08-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":30.2,"montant":3020.0,"bank":"LCL","note":"Apport AOU 2025"},{"id":"32614b0217","date":"2025-09-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":7.5,"montant":750.0,"bank":"LCL","note":"Apport SEP 2025"},{"id":"0585d45492","date":"2025-10-01","fonds":"CGIC","holder":"JOHN","io":"OUT","shares":18.0,"montant":1800.0,"bank":"LCL","note":"Retrait OCT 2025"},{"id":"9032bc931e","date":"2025-10-01","fonds":"CGIS","holder":"JOHN","io":"IN","shares":41.0,"montant":4100.0,"bank":"IBKR","note":"Apport OCT 2025"},{"id":"b73b170897","date":"2025-11-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":29.0,"montant":2900.0,"bank":"LCL","note":"Apport NOV 2025"},{"id":"7a99891f41","date":"2025-12-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":115.5,"montant":11550.0,"bank":"LCL","note":"Apport DEC 2025"},{"id":"441d91cad3","date":"2026-01-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":17.0,"montant":1700.0,"bank":"LCL","note":"Apport JAN 2026"},{"id":"2f322bea44","date":"2026-01-01","fonds":"CGIS","holder":"JOHN","io":"IN","shares":10.0,"montant":1000.0,"bank":"IBKR","note":"Apport JAN 2026"},{"id":"a16316a61b","date":"2026-02-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":42.0,"montant":4200.0,"bank":"LCL","note":"Apport FEV 2026"},{"id":"d8a53afcdc","date":"2026-03-01","fonds":"CGIC","holder":"JOHN","io":"IN","shares":11.0,"montant":1100.0,"bank":"LCL","note":"Apport MAR 2026"}];
// Override si seeds.js a une version ancienne (< 40 entrées)
var INV_SEED_OK; try{ INV_SEED_OK = (typeof INV_SEED_OK !== 'undefined' && INV_SEED_OK.length >= 40) ? INV_SEED_OK : _INV_SEED_APP; } catch(e){ INV_SEED_OK = _INV_SEED_APP; }
function cumulFundParts(invArr){
  let S = 0, C = 0;
  (invArr || []).forEach(function(m){
    if(m && typeof m.shares === "number"){
      if(m.fonds === "CGIS") S += m.shares;
      else if(m.fonds === "CGIC") C += m.shares;
    }
  });
  // v1.0 CGI — si aucune transaction de parts trouvée, garder les valeurs calibrées du seed
  // (John est seul investisseur, pas de transactions de parts enregistrées)
  return {
    S: S > 0 ? Math.round(S*1e6)/1e6 : FUND_PARTS.S,
    C: C > 0 ? Math.round(C*1e6)/1e6 : FUND_PARTS.C,
  };
}
function calcGdbPrices(src){
  // v23.21 — KuCoin appartient au fonds CGIC (et non CGIS). Un transfert
  // crypto→KuCoin (vente crypto, contrepartie KuCoin) reste interne à GDB.C
  // → n'impacte NI GDB.C NI GDB.S.
  const kucoinUSD = (src.stocks.items.find(x=>x.t==="KUCOIN")?.val) || 0;
  // GDB.S = tous les stocks SAUF KuCoin (Indices + Picking + Or + Cash EURO/USD/STRC)
  const gdbSfondsUSD = src.stocks.items
    .filter(x=>x.t!=="KUCOIN")
    .reduce((s,x)=>s+x.val, 0);
  // v1.0 CGI — protection contre division par zéro (pas de transactions de parts)
  const safeS = FUND_PARTS.S > 0 ? FUND_PARTS.S : 1;
  const safeC = FUND_PARTS.C > 0 ? FUND_PARTS.C : 1;
  const gdbS = parseFloat((gdbSfondsUSD / safeS).toFixed(4));
  // GDB.C = crypto + KuCoin
  const gdbCfondsUSD = src.crypto.total + kucoinUSD;
  const gdbC = parseFloat((gdbCfondsUSD / safeC).toFixed(4));
  return {gdbS, gdbC, gdbSfondsUSD, gdbCfondsUSD};
}


const GDB_HIST=[
  {d:"2023-01",gdb:100,btc:100,sp:100,nq:100,eth:100},
  {d:"2023-02",gdb:121.4,btc:145.5,sp:105.5,nq:104.6,eth:139.3},
  {d:"2023-03",gdb:168.8,btc:186.5,sp:107.2,nq:107.8,eth:159.5},
  {d:"2023-04",gdb:186.3,btc:208.2,sp:110.6,nq:115.3,eth:175.2},
  {d:"2023-05",gdb:168.0,btc:181.6,sp:108.8,nq:119.4,eth:159.8},
  {d:"2023-06",gdb:188.1,btc:197.3,sp:114.1,nq:130.4,eth:170.6},
  {d:"2023-07",gdb:175.3,btc:179.4,sp:117.5,nq:135.3,eth:157.2},
  {d:"2023-08",gdb:157.8,btc:169.5,sp:114.6,nq:130.0,eth:141.5},
  {d:"2023-09",gdb:163.2,btc:165.0,sp:110.8,nq:124.8,eth:134.7},
  {d:"2023-10",gdb:217.6,btc:212.1,sp:113.1,nq:126.6,eth:149.8},
  {d:"2023-11",gdb:236.5,btc:231.6,sp:120.4,nq:136.9,eth:175.3},
  {d:"2023-12",gdb:281.9,btc:258.8,sp:123.5,nq:144.4,eth:186.4},
  {d:"2024-01",gdb:252.3,btc:263.3,sp:126.6,nq:148.5,eth:167.9},
  {d:"2024-02",gdb:346.2,btc:348.8,sp:134.6,nq:162.7,eth:197.2},
  {d:"2024-03",gdb:330.8,btc:427.3,sp:140.4,nq:174.5,eth:225.7},
  {d:"2024-04",gdb:270.4,btc:386.3,sp:133.0,nq:163.6,eth:208.3},
  {d:"2024-05",gdb:293.6,btc:419.3,sp:138.7,nq:175.3,eth:212.4},
  {d:"2024-06",gdb:252.7,btc:373.0,sp:139.0,nq:178.8,eth:199.2},
  {d:"2024-07",gdb:278.5,btc:405.8,sp:144.9,nq:177.5,eth:203.1},
  {d:"2024-08",gdb:238.7,btc:363.6,sp:148.5,nq:179.7,eth:188.7},
  {d:"2024-09",gdb:310.2,btc:402.5,sp:155.6,nq:186.4,eth:201.3},
  {d:"2024-10",gdb:366.7,btc:443.6,sp:157.3,nq:186.7,eth:207.2},
  {d:"2024-11",gdb:566.7,btc:586.2,sp:162.3,nq:196.1,eth:265.3},
  {d:"2024-12",gdb:537.4,btc:574.4,sp:159.6,nq:193.4,eth:245.8},
  {d:"2025-01",gdb:554.2,btc:638.0,sp:162.9,nq:198.1,eth:247.2},
  {d:"2025-02",gdb:340.2,btc:518.8,sp:155.9,nq:186.0,eth:183.7},
  {d:"2025-03",gdb:335.5,btc:506.8,sp:145.7,nq:173.5,eth:163.0},
  {d:"2025-04",gdb:413.7,btc:578.1,sp:150.9,nq:183.5,eth:190.8},
  {d:"2025-05",gdb:521.3,btc:641.8,sp:163.7,nq:197.3,eth:220.3},
  {d:"2025-06",gdb:494.2,btc:659.8,sp:167.8,nq:205.5,eth:213.7},
  {d:"2025-07",gdb:641.2,btc:727.3,sp:176.0,nq:218.8,eth:249.3},
  {d:"2025-08",gdb:618.0,btc:667.0,sp:171.0,nq:208.7,eth:227.4},
  {d:"2025-09",gdb:633.8,btc:696.6,sp:175.3,nq:212.4,eth:238.2},
  {d:"2025-10",gdb:580.4,btc:671.7,sp:170.8,nq:207.9,eth:228.1},
  {d:"2025-11",gdb:476.8,btc:527.0,sp:165.5,nq:200.8,eth:207.3},
  {d:"2025-12",gdb:443.4,btc:537.7,sp:163.7,nq:198.5,eth:197.2},
  {d:"2026-01",gdb:444.6,btc:563.3,sp:171.2,nq:222.1,eth:268.9},
  {d:"2026-02",gdb:385.3,btc:481.8,sp:163.2,nq:204.9,eth:191.2},
  {d:"2026-03",gdb:390.5,btc:488.2,sp:170.4,nq:218.3,eth:193.5},
  {d:"2026-04",gdb:385.3,btc:481.8,sp:179.4,nq:238.0,eth:196.4},
  {d:"2026-05",gdb:396.8,btc:496.2,sp:181.7,nq:242.5,eth:200.4},
];

const GDBS_2026=[{"d":"Mai-31","s":100.0614,"sp":100,"nq":100}];

const CURRENT={"date":"2026-05-31","totalUSD":142170,"totalEUR":130796,"usdEur":0.92,"eurUsd":1.086957,"btcPrice":43588.99,"gdbC":99.9847,"gdbS":100.0614,"crypto":{"date":"2026-05-31","total":104784,"items":[{"t":"BTC","qty":2.14325481,"pa":43588.99,"live":43588.99,"val":93422,"pnl":0,"pct":0},{"t":"ETH","qty":5.5,"pa":2065.81,"live":2065.81,"val":11362,"pnl":0,"pct":0}]},"stocks":{"date":"2026-05-31","total":28694,"items":[{"t":"NVDA","cat":"Picking","qty":12.0,"pa":179.92,"live":179.92,"val":2159,"pnl":0,"pct":0},{"t":"IWDA","cat":"Indices","qty":20.0,"pa":133.0571,"live":133.0571,"val":2661,"pnl":0,"pct":0},{"t":"APH","cat":"Picking","qty":26.0,"pa":131.41,"live":131.41,"val":3417,"pnl":0,"pct":0},{"t":"ANET","cat":"Picking","qty":20.0,"pa":146.25,"live":146.25,"val":2925,"pnl":0,"pct":0},{"t":"AXON","cat":"Picking","qty":12.5,"pa":386.94,"live":386.94,"val":4837,"pnl":0,"pct":0},{"t":"PLTR","cat":"Picking","qty":50.0,"pa":136.3,"live":136.3,"val":6815,"pnl":0,"pct":0},{"t":"USD","cat":"Cash","qty":5880,"pa":1.0,"live":1.0,"val":5880,"pnl":0,"pct":0},{"t":"KUCOIN","cat":"Cash","qty":0,"pa":1.0,"live":1.0,"val":0,"pnl":0,"pct":0}]},"bank":{"date":"2026-05-31","totalEUR":7997,"breakdown":{"LCL":7159,"BCI":838,"DeBlock":0}},"portfolio":{"date":"2026-05-31","items":[{"t":"BTC","qty":2.14325481,"pa":43588.99,"live":43588.99,"val":93422,"pnl":0,"pct":0,"cat":"Crypto","valEUR":85948},{"t":"ETH","qty":5.5,"pa":2065.81,"live":2065.81,"val":11362,"pnl":0,"pct":0,"cat":"Crypto","valEUR":10453},{"t":"NVDA","cat":"Picking","qty":12.0,"pa":179.92,"live":179.92,"val":2159,"pnl":0,"pct":0,"valEUR":1986},{"t":"IWDA","cat":"Indices","qty":20.0,"pa":133.0571,"live":133.0571,"val":2661,"pnl":0,"pct":0,"valEUR":2448},{"t":"APH","cat":"Picking","qty":26.0,"pa":131.41,"live":131.41,"val":3417,"pnl":0,"pct":0,"valEUR":3144},{"t":"ANET","cat":"Picking","qty":20.0,"pa":146.25,"live":146.25,"val":2925,"pnl":0,"pct":0,"valEUR":2691},{"t":"AXON","cat":"Picking","qty":12.5,"pa":386.94,"live":386.94,"val":4837,"pnl":0,"pct":0,"valEUR":4450},{"t":"PLTR","cat":"Picking","qty":50.0,"pa":136.3,"live":136.3,"val":6815,"pnl":0,"pct":0,"valEUR":6270},{"t":"LCL","cat":"Cash Matelas","qty":7159,"pa":1.0,"live":1.086957,"val":7782,"pnl":0,"pct":0.0,"valEUR":7159},{"t":"BCI","cat":"Cash Matelas","qty":838,"pa":1.0,"live":1.086957,"val":911,"pnl":0,"pct":0.0,"valEUR":838},{"t":"DeBlock","cat":"Cash Matelas","qty":0,"pa":1.0,"live":1.086957,"val":0,"pnl":0,"pct":0.0,"valEUR":0},{"t":"USD","cat":"Cash","qty":5880,"pa":1.0,"live":1.0,"val":5880,"pnl":0,"pct":0,"valEUR":5410},{"t":"KUCOIN","cat":"Cash","qty":0,"pa":1.0,"live":1.0,"val":0,"pnl":0,"pct":0,"valEUR":0}]},"alloc":[{"n":"Crypto","pct":73.7,"tgt":74,"c":"#F7931A"},{"n":"Picking","pct":14.2,"tgt":14,"c":"#7B68EE"},{"n":"Cash Matelas","pct":6.1,"tgt":6,"c":"#6B7280"},{"n":"Cash Dip","pct":4.1,"tgt":4,"c":"#22C55E"},{"n":"Indices","pct":1.9,"tgt":2,"c":"#4A90D9"}]};

const MONTHS={"2022":{"m":["JAN","FEV","MAR","AVR","MAI","JUI","JUL","AOU","SEP","OCT","NOV","DEC"],"pct":[-0.0376,-0.004,0.062,-0.0021,-0.0117,-0.0725,0.0762,0.028,-0.0685,0.0512,-0.0927,0.0121],"pnl":[-2800,-288,4425,-156,-883,-5418,5282,2090,-5254,3660,-6962,824],"ttl":-5480,"inv":[0,0,0,0,0,0,0,0,0,0,0,0]},"2023":{"m":["JAN","FEV","MAR","AVR","MAI","JUI","JUL","AOU","SEP","OCT","NOV","DEC"],"pct":[0.1693,-0.0487,0.1241,0.0551,-0.061,0.0341,-0.0403,0.0272,-0.0285,0.1389,0.0363,0.0878],"pnl":[11678,-3926,9525,4749,-5549,2913,-3559,2307,-2485,11759,3495,8772],"ttl":39679,"inv":[0,0,0,0,0,0,0,0,0,0,0,0]},"2024":{"m":["JAN","FEV","MAR","AVR","MAI","JUI","JUL","AOU","SEP","OCT","NOV","DEC"],"pct":[0.025,0.2988,0.0739,-0.0823,0.1802,-0.0817,0.0867,-0.145,0.103,0.1005,0.3449,-0.0565],"pnl":[2721,33283,10691,-12781,25686,-13752,13392,-24354,14787,15907,60088,-13247],"ttl":112421,"inv":[0,0,0,0,0,0,0,0,0,0,0,0]},"2025":{"m":["JAN","FEV","MAR","AVR","MAI","JUI","JUL","AOU","SEP","OCT","NOV","DEC"],"pct":[0.0856,-0.2298,-0.0387,0.0835,0.164,-0.0763,0.163,-0.0471,0.0186,0.0355,-0.1699,-0.0477],"pnl":[18936,-55156,-7153,14838,31576,-17094,33739,-11350,4271,8293,-41109,-9584],"ttl":-29793,"inv":[2069,0,6316,2179,3315,24,-21,-134,-447,4886,385,-3774]},"2026":{"m":["JAN","FEV","MAR"],"pct":[0.0668,-0.2257,0.1327],"pnl":[12783,-46050,20962],"ttl":-12305,"inv":[6607,29,-548]}};
const SEAS={m:["JAN","FEV","MAR","AVR","MAI","JUI","JUL","AOU","SEP","OCT","NOV","DEC"],pct:[.0757,.0386,.1144,.0094,-.1009,-.1178,.1593,.0002,.0370,.1506,.1247,-.0357]};
// v26.00 Lot B — donnees reelles (spot+IBKR fusionnes, futures, annexe IBKR).






/* ─── UTILS ─────────────────────────────────────────────── */
const fmt=n=>!n||isNaN(n)?"-":Math.round(Math.abs(n)).toLocaleString("fr-FR");
const fmtK=n=>!n||isNaN(n)?"-":n>=1e6?(n/1e6).toFixed(2)+"M":n>=1e3?(n/1e3).toFixed(1)+"k":Math.round(n).toString();
const fmtP=(n,d=1)=>isNaN(n)?"-":(n>=0?"+":"")+((n*100).toFixed(d))+"%";
const clr=n=>(n||0)>=0?"#10B981":"#EF4444";
// Masque les montants si hidden=true, les % restent toujours visibles
const msk=(val,hidden)=>hidden?"••••":val;
// #79 — clone mis à l'échelle d'un modèle EFF pour la démo (montants fictifs cohérents).
// Multiplie les champs MONÉTAIRES (totaux, val, valEUR) pour viser targetUSD, en gardant
// prix unitaires (live/pa) réels ; les catégories/quantités suivent l'échelle des valeurs.
function scaleEFFForDemo(eff, targetUSD){
  try{
    if(!eff) return eff;
    const cur = eff.totalUSD || ((eff.crypto&&eff.crypto.total||0)+(eff.stocks&&eff.stocks.total||0)) || 0;
    if(!(cur>0)) return eff;
    const f = targetUSD/cur;
    const scItem = it => { const o={...it};
      if(o.qty!=null) o.qty = o.qty*f;            // quantités ×f → val=qty×live suit, prix réels
      if(o.val!=null) o.val = Math.round(o.val*f);
      if(o.valEUR!=null) o.valEUR = Math.round(o.valEUR*f);
      if(o.pnl!=null) o.pnl = Math.round(o.pnl*f);
      return o; };
    const scGroup = g => g ? {...g, total: Math.round((g.total||0)*f), items:(g.items||[]).map(scItem)} : g;
    const out = {...eff,
      totalUSD: Math.round((eff.totalUSD||cur)*f),
      totalEUR: Math.round((eff.totalEUR|| (cur*(eff.usdEur||0.92)))*f),
      crypto: scGroup(eff.crypto), stocks: scGroup(eff.stocks),
      portfolio: eff.portfolio ? {...eff.portfolio, items:(eff.portfolio.items||[]).map(scItem)} : eff.portfolio,
      bank: eff.bank ? {...eff.bank, totalEUR: Math.round((eff.bank.totalEUR||0)*f)} : eff.bank,
      _demoScaled:true };
    return out;
  }catch(e){ return eff; }
}
const DEMO_TARGETS = { small:30000, large:1600000 };

/* ═══════════════════════════════════════════════════════════
   LIVE PRICE ENGINE  v6
   - BTC/EUR   : CoinGecko public API (no key needed)
   - Stocks    : Yahoo Finance via allorigins proxy
   Updates CURRENT quantities and recalculates all totals.
═══════════════════════════════════════════════════════════ */

/* Ticker → Yahoo Finance symbol mapping */


/* Ticker → CoinGecko ID mapping (catégorie Crypto) */
const CG_MAP = {
  BTC:  "bitcoin",
  ETH:  "ethereum",
  SOL:  "solana",
  BNB:  "binancecoin",
  XRP:  "ripple",
  ADA:  "cardano",
  DOGE: "dogecoin",
  DOT:  "polkadot",
  AVAX: "avalanche-2",
  MATIC:"matic-network",
  LINK: "chainlink",
  UNI:  "uniswap",
  LTC:  "litecoin",
  ATOM: "cosmos",
  HYPE: "hyperliquid",
};
// Base d'icônes persistante : { ticker: { user: string|null, fmp: url|null } }
// - user : icône choisie par l'utilisateur (emoji ou texte)
// - fmp  : URL logo officiel récupéré via FMP (stocké pour éviter les re-fetches)
// Sauvegardé dans cgi_icons sur Cloudflare KV
let ICON_DB = {};
// Compatibilité : CUSTOM_ICONS = alias en lecture seule sur ICON_DB.user
// (pour le Proxy TICKER_ICONS existant)
let CUSTOM_ICONS = {}; // maintenu en sync avec ICON_DB via syncCustomIcons()
// Tickers EU dont le prix est en € → à convertir en $ après fetch
const EUR_YAHOO_TICKERS_SET = new Set(["AVIO","AI","GOLD"]);

/* Fetch single Yahoo Finance quote via allorigins proxy */
// Tickers EU passent par le Worker Cloudflare (pas de CORS)
// Tickers US passent par les proxies publics
const EU_YAHOO_TICKERS = new Set(["AVIO.MI","AI.PA","GOLD.PA","JEDI.L","AIA"]);

async function fetchYahooCF(symbol){
  // Via Cloudflare Worker — pas de CORS, supporte les bourses EU
  try{
    const res = await fetch(`${CF_WORKER_URL}/yahoo?symbol=${encodeURIComponent(symbol)}`,{
      headers:{"X-Auth-Key":CF_AUTH_KEY},
      signal: AbortSignal.timeout(18000),
    });
    if(!res.ok) return null;
    const data = await res.json();
    return data?.price ?? null;
  }catch(e){ return null; }
}

// v4.16 — repli multi-symboles pour tickers capricieux (ETC illiquides, etc.)
var SYMBOL_FALLBACKS = {
  NICK: ["NICK.MI","NICK.L","NICK.AS","NICK.SW"]
};
async function fetchYahooCFmulti(ticker, primary){
  var first = primary || ticker;
  var p = await fetchYahooCF(first);
  if(p!=null) return p;
  var alts = SYMBOL_FALLBACKS[ticker];
  if(alts){ for(var i=0;i<alts.length;i++){ if(alts[i]===first) continue; var q=await fetchYahooCF(alts[i]); if(q!=null){ try{ YF_MAP[ticker]=alts[i]; }catch(e){} return q; } } }
  return null;
}

async function fetchYahoo(symbol){
  // Essai via Cloudflare d'abord (plus fiable pour EU)
  const cfPrice = await fetchYahooCF(symbol);
  if(cfPrice) return cfPrice;
  // Fallback proxies publics pour tickers US
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
  const proxies = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ];
  for(const proxy of proxies){
    try{
      const res = await fetch(proxy, {signal: AbortSignal.timeout(10000)});
      if(!res.ok) continue;
      const json = await res.json();
      const raw = typeof json.contents === "string" ? json.contents : JSON.stringify(json);
      const data = JSON.parse(raw);
      const result = data?.chart?.result?.[0];
      if(!result) continue;
      const meta = result.meta;
      const live = meta?.regularMarketPrice;
      const closes = result?.indicators?.quote?.[0]?.close?.filter(v=>v!=null) || [];
      const lastClose = closes.length ? closes[closes.length-1] : null;
      const price = (live && live > 0) ? live : lastClose;
      if(price && price > 0) return price;
    }catch(e){ continue; }
  }
  return null;
}

/* v26.03 Lot F — historique Yahoo (cours date) via worker /yahoo-chart, filtre sur la periode du trade */
function ySymFor(ticker, src){
  if(YF_MAP[ticker]) return YF_MAP[ticker];
  if(src==="ibkr") return ticker;          // action : symbole tel quel (US) — EU a mapper
  return ticker+"-USD";                      // crypto
}
function pickRange(fromDate){
  var days=(Date.now()-new Date(fromDate).getTime())/864e5;
  if(days<=28) return "1mo"; if(days<=88) return "3mo"; if(days<=180) return "6mo";
  if(days<=360) return "1y"; if(days<=720) return "2y"; if(days<=1800) return "5y"; return "max";
}
async function fetchYahooHist(symbol, fromDate, toDate){
  var range=pickRange(fromDate);
  var out=[];
  try{
    var res=await fetch(`${CF_WORKER_URL}/yahoo-chart?symbol=${encodeURIComponent(symbol)}&interval=1d&range=${range}&no_logo=1`,
      {headers:{"X-Auth-Key":CF_AUTH_KEY}, signal:AbortSignal.timeout(12000)});
    if(res.ok){
      var d=await res.json();
      var candles=(d&&d.candles)||[];
      out=candles.map(function(c){ return [new Date(c.t).toISOString().slice(0,10), c.c]; });
    }
  }catch(e){}
  if(!out.length){ // fallback proxy public avec period1/period2
    try{
      var p1=Math.floor((new Date(fromDate).getTime())/1000)-7*86400;
      var p2=Math.floor((new Date(toDate).getTime())/1000)+7*86400;
      var u=`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${p1}&period2=${p2}`;
      var r=await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,{signal:AbortSignal.timeout(12000)});
      var j=await r.json(); var raw=typeof j.contents==="string"?j.contents:JSON.stringify(j);
      var dd=JSON.parse(raw); var rr=dd&&dd.chart&&dd.chart.result&&dd.chart.result[0];
      if(rr){ var ts=rr.timestamp||[]; var cl=(rr.indicators&&rr.indicators.quote&&rr.indicators.quote[0]&&rr.indicators.quote[0].close)||[];
        for(var i=0;i<ts.length;i++){ if(cl[i]!=null) out.push([new Date(ts[i]*1000).toISOString().slice(0,10), cl[i]]); } }
    }catch(e){}
  }
  // filtre fenetre [from-7j, to+7j]
  var lo=new Date(new Date(fromDate).getTime()-7*864e5).toISOString().slice(0,10);
  var hi=new Date(new Date(toDate).getTime()+10*864e5).toISOString().slice(0,10);
  return out.filter(function(p){ return p[0]>=lo && p[0]<=hi; });
}

/* Fetch BTC + ETH price and EUR/USD rate from CoinGecko */
async function fetchCoinGecko(){
  const url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd,eur";
  const res = await fetch(url, {signal: AbortSignal.timeout(8000)});
  const data = await res.json();
  return {
    btcUSD: data?.bitcoin?.usd ?? null,
    btcEUR: data?.bitcoin?.eur ?? null,
    ethUSD: data?.ethereum?.usd ?? null,
    eurUSD: data?.bitcoin?.usd && data?.bitcoin?.eur
      ? data.bitcoin.usd / data.bitcoin.eur : null,
  };
}

/* Fetch all prices and return a prices object */
/* ═══════════════════════════════════════════════════════════
   APPLY TRADE  v9
   Met à jour EFF en temps réel quand on enregistre un achat/vente.
   - Recalcule qty, val, pnl, pa du ticker concerné
   - Ajuste bank.totalEUR en contrepartie si banque sélectionnée
   - Retourne le nouvel objet live fusionné avec EFF courant
═══════════════════════════════════════════════════════════ */
function applyTrade(trade, currentEFF){
  const src = currentEFF || CURRENT;
  const {ticker, side, qty, price, bankAccount, cat: tradeCatRaw} = trade;
  const isBuy = side.toUpperCase() === "BUY";
  const tradeUSD = qty * price;
  const usdEur = src.usdEur;

  /* ── Mise à jour des stocks items ── */
  let stocksItems = src.stocks.items.map(item => ({...item}));
  const idx = stocksItems.findIndex(x => x.t.toUpperCase() === ticker.toUpperCase());

  // Catégorie du ticker (depuis le trade si fournie, sinon heuristique)
  const tradeCAT = tradeCatRaw || (
    ticker === "BTC" ? null :
    ["QQQ","AIA","JEDI","ROBO","XLE","OIH"].includes(ticker) ? "Indices" :
    ticker === "GOLD" ? "Or" :
    ticker === "EURO" ? "Cash" : "Picking"
  );

  if(idx >= 0){
    // Ticker existant — mettre à jour
    const item = {...stocksItems[idx]};
    if(isBuy){
      // Recalcul PA pondéré
      const newQty   = item.qty + qty;
      const newCost  = (item.pa * item.qty) + (price * qty);
      item.pa  = newCost / newQty;
      item.qty = newQty;
    } else {
      item.qty = Math.max(0, item.qty - qty);
    }
    item.val = Math.round(item.qty * item.live);
    item.pnl = Math.round(item.val - item.pa * item.qty);
    item.pct = item.pa * item.qty > 0 ? item.pnl / (item.pa * item.qty) : 0;
    stocksItems[idx] = item;
  } else if(isBuy){
    // Nouveau ticker — ajouter
    if(tradeCAT && tradeCAT !== "Crypto") {
      stocksItems.push({
        t: ticker, cat: tradeCAT, qty, pa: price, live: price,
        val: Math.round(qty * price), pnl: 0, pct: 0,
      });
    }
  }

  /* ── Mise à jour crypto (BTC + toute autre crypto) — v23.12 ── */
  let cryptoItems = src.crypto.items.map(i => ({...i}));
  const isCryptoTrade = (tradeCAT === "Crypto") || (ticker.toUpperCase() === "BTC");
  if(isCryptoTrade){
    const cidx = cryptoItems.findIndex(x => (x.t||"").toUpperCase() === ticker.toUpperCase());
    if(cidx >= 0){
      const ci = {...cryptoItems[cidx]};
      if(isBuy){
        const newQty  = ci.qty + qty;
        const newCost = (ci.pa * ci.qty) + (price * qty);
        ci.pa  = newCost / newQty;
        ci.qty = newQty;
      } else {
        ci.qty = Math.max(0, ci.qty - qty);
      }
      ci.val = Math.round(ci.qty * (ci.live || price));
      ci.pnl = Math.round(ci.val - ci.pa * ci.qty);
      ci.pct = ci.pa * ci.qty > 0 ? ci.pnl / (ci.pa * ci.qty) : 0;
      cryptoItems[cidx] = ci;
    } else if(isBuy){
      // Nouvelle crypto — ajouter (cat:"Crypto" pour un classement correct dans portfolio.items)
      cryptoItems.push({
        t: ticker, cat: "Crypto", qty, pa: price, live: price,
        val: Math.round(qty * price), pnl: 0, pct: 0,
      });
    }
  }
  /* ── Mise à jour contrepartie bancaire ── */
  let bank = {...src.bank, breakdown: {...src.bank.breakdown}};
  if(bankAccount && bankAccount !== "Aucune"){
    const tradeEUR = Math.round(tradeUSD * usdEur);
    // v23.14 — 3 cas MUTUELLEMENT EXCLUSIFS (fini l'écriture parasite + double-comptage)
    const isMatelas = Object.prototype.hasOwnProperty.call(bank.breakdown, bankAccount);
    if(isMatelas){
      // Compte Cash Matelas (BCI/Bourso/DeBlock) → bank.breakdown
      const current = bank.breakdown[bankAccount] || 0;
      bank.breakdown[bankAccount] = isBuy ? current - tradeEUR : current + tradeEUR;
      bank.totalEUR = Object.values(bank.breakdown).reduce((s,v)=>s+v, 0);
    } else if(bankAccount === "IBKR"){
      // IBKR → item EURO (trade en €) ou USD (trade en $)
      const tradeInEUR = trade.currency === "EUR";
      if(tradeInEUR){
        const euroIdx = stocksItems.findIndex(x=>x.t==="EURO");
        if(euroIdx >= 0){
          const euroItem = {...stocksItems[euroIdx]};
          const newQtyEUR = isBuy ? euroItem.qty - tradeEUR : euroItem.qty + tradeEUR;
          euroItem.qty = newQtyEUR;
          euroItem.val = Math.round(newQtyEUR * (euroItem.live||1/usdEur));
          euroItem.pnl = Math.round(euroItem.val - (euroItem.pa||1.17) * newQtyEUR);
          euroItem.valEUR = newQtyEUR;
          stocksItems[euroIdx] = euroItem;
        }
      } else {
        const usdIdx = stocksItems.findIndex(x=>x.t==="USD");
        if(usdIdx >= 0){
          const usdItem = {...stocksItems[usdIdx]};
          const tradeUSD_amt = Math.round(tradeUSD);
          const newQtyUSD = isBuy ? usdItem.qty - tradeUSD_amt : usdItem.qty + tradeUSD_amt;
          usdItem.qty = newQtyUSD;
          usdItem.val = newQtyUSD;  // 1 USD = 1 USD
          usdItem.pnl = 0;
          usdItem.valEUR = Math.round(newQtyUSD * usdEur);
          stocksItems[usdIdx] = usdItem;
        }
      }
    } else {
      // Compte "Cash Dip" (ex. KuCoin) → débiter l'item Cash correspondant EN VALEUR ($),
      // sans aucune borne (découvert/crédit autorisé). Pont de casse "KuCoin"↔"KUCOIN".
      const csIdx = stocksItems.findIndex(x=>x.cat==="Cash" && (x.t||"").toUpperCase()===bankAccount.toUpperCase());
      if(csIdx >= 0){
        const cs = {...stocksItems[csIdx]};
        const amtUSD  = Math.round(tradeUSD);
        const beforeV = cs.val || 0;
        const afterV  = isBuy ? beforeV - amtUSD : beforeV + amtUSD;   // peut devenir négatif
        const live    = (cs.live && cs.live !== 0) ? cs.live : 1;
        cs.val    = afterV;
        cs.qty    = afterV / live;
        cs.valEUR = Math.round(afterV * usdEur);
        cs.pnl    = 0;
        stocksItems[csIdx] = cs;
        console.info("[contrepartie] "+cs.t+" : "+beforeV+"$ → "+afterV+"$ (achat "+amtUSD+"$, sans borne)");
      } else {
        console.warn("[contrepartie] item Cash introuvable pour '"+bankAccount+"' — rien débité (tickers Cash: "+stocksItems.filter(x=>x.cat==="Cash").map(x=>x.t).join(",")+")");
      }
    }
  }

  /* ── Recalcul des totaux ── */
  const stocksTotal  = stocksItems.filter(x=>x.cat!=="Cash").reduce((s,x)=>s+x.val, 0);
  const cryptoTotal  = cryptoItems.reduce((s,x)=>s+x.val, 0);
  const bankUSD      = Math.round(bank.totalEUR / usdEur);
  const cashStocks   = stocksItems.filter(x=>x.cat==="Cash").reduce((s,x)=>s+x.val, 0);
  const totalUSD     = cryptoTotal + stocksTotal + bankUSD + cashStocks;
  const totalEUR     = Math.round(totalUSD * usdEur);

  /* ── Suppression des items à quantité zéro ── */
  // On mémorise les tickers à zéro AVANT de les supprimer
  const zeroTickers = new Set([
    ...stocksItems.filter(x=>x.qty<=0 && ["EURO","USD","KUCOIN"].indexOf((x.t||"").toUpperCase())<0).map(x=>x.t),
    ...cryptoItems.filter(x=>x.qty<=0).map(x=>x.t),
  ]);
  stocksItems = stocksItems.filter(x => ["EURO","USD","KUCOIN"].indexOf((x.t||"").toUpperCase())>=0 || x.qty > 0);
  // v23.20 — filtre crypto APRÈS zeroTickers (symétrie avec les stocks) : ainsi une crypto
  // soldée (qty 0) est bien captée dans zeroTickers et retirée de portfolio.items.
  cryptoItems = cryptoItems.filter(x => x.qty > 0);

  /* ── Ajout du nouveau ticker dans YF_MAP si achat nouveau ticker ── */
  if(isBuy && idx < 0 && ticker.toUpperCase() !== "BTC"){
    // Nouveau ticker — on l'ajoute à YF_MAP avec le symbole Yahoo correspondant
    // Convention : ticker US → tel quel, .MI = Milan, .PA = Paris, .L = London
    if(!YF_MAP[ticker]){
      // Heuristique simple — l'utilisateur peut ajuster manuellement
      YF_MAP[ticker] = ticker;
      console.info(`Nouveau ticker ${ticker} ajouté à YF_MAP`);
      saveBase('cgi_yfmap', {...YF_MAP});  // v23.22 — persister immédiatement (pas seulement au snapshot)
    }
  }

  /* ── Mise à jour portfolio.items (structure unifiée) ── */
  let portfolioItems = null;
  if(src.portfolio?.items){
    portfolioItems = src.portfolio.items
      .filter(item => {
        if(item.cat==="Cash Matelas") return true;
        // Supprimer si le ticker est à qty=0 après le trade
        return !zeroTickers.has(item.t);
      })
      .map(item=>{
      // Cash Matelas : quantité = montant€, inchangé par les trades
      if(item.cat==="Cash Matelas"){
        if(bankAccount && bankAccount===item.t){
          const tradeEUR = Math.round(tradeUSD * usdEur);
          const newValEUR = isBuy ? (item.valEUR||item.qty)-tradeEUR : (item.valEUR||item.qty)+tradeEUR;  // négatif autorisé
          const newValUSD = Math.round(newValEUR * (src.eurUsd||1/usdEur));
          return {...item, qty:newValEUR, valEUR:newValEUR, val:newValUSD};
        }
        return item;
      }
      // Crypto/Stocks : mettre à jour depuis cryptoItems/stocksItems
      const updated = [...cryptoItems, ...stocksItems].find(x=>x.t===item.t);
      if(!updated) return item;
      return {...item, qty:updated.qty, pa:updated.pa, val:updated.val, pnl:updated.pnl, pct:updated.pct,
              valEUR:Math.round(updated.val*usdEur)};
    });
  }

  // Ajouter les nouveaux tickers achetés non encore dans portfolio
  if(portfolioItems && isBuy){
    const existing = new Set(portfolioItems.map(x=>x.t));
    [...cryptoItems, ...stocksItems].forEach(item=>{
      if(!existing.has(item.t) && item.qty > 0){
        portfolioItems.push({
          t:item.t, cat:item.cat||"Picking",
          qty:item.qty, pa:item.pa, live:item.live,
          val:item.val, pnl:item.pnl, pct:item.pct,
          valEUR:Math.round(item.val*(src.usdEur||0.852)),
        });
      }
    });
  }

  return {
    ...src,
    totalUSD, totalEUR,
    crypto: {...src.crypto, total: cryptoTotal, items: cryptoItems},
    stocks: {...src.stocks, total: stocksTotal + cashStocks, items: stocksItems},
    bank,
    ...(portfolioItems ? {portfolio:{...src.portfolio, items:portfolioItems}} : {}),
  };
}

async function fetchAllPrices(){
  const results = {errors: []};

  // v23.22 — BTC, ETH, toutes les cryptos ET le taux EUR/USD sont dans YF_MAP
  // (BTC-USD, ETH-USD…, EURUSD=X) et fetché via Yahoo comme les actions.
  // Coingecko n'est plus nécessaire.

  /* Stocks + crypto + taux de change — en parallel (max 3 à la fois) */
  const tickers = Object.entries(YF_MAP);
  for(let i=0; i<tickers.length; i+=3){
    const batch = tickers.slice(i, i+3);
    await Promise.all(batch.map(async([key, sym])=>{
      if(key==="EURUSD") return;  // retire du refresh Yahoo (buggait a chaque refresh)
      try {
        let price = await fetchYahoo(sym);
        if(price==null && SYMBOL_FALLBACKS[key]) price = await fetchYahooCFmulti(key, sym);
        if(price != null) results[key] = price;
        else results.errors.push(`${key}`); // null = échec silencieux
      } catch(e){ results.errors.push(`${key}`); }
    }));
    if(i+3 < tickers.length) await new Promise(r=>setTimeout(r,300));
  }

  return results;
}

/* Apply fetched prices to CURRENT and return updated totals */
function applyPrices(prices, usdEur, effSrc){
  const src  = effSrc || CURRENT;  // ← utilise EFF live, pas CURRENT statique
  const rate = usdEur || src.usdEur;
  const eurUsd = 1 / rate;
  // Suffixes Yahoo Finance des bourses EU (prix en €)
  const EU_SUFFIXES = [".PA",".MI",".AS",".BR",".DE",".F",".HA",".BE",".MU",".SG",".DU",".HM",".VI"];
  // Un ticker est coté en EUR si son Yahoo symbol a un suffixe EU
  const isEurTicker = t => {
    const sym = YF_MAP[t] || t;
    return EU_SUFFIXES.some(s => sym.endsWith(s));
  };

  /* Updated stocks items — depuis src (EFF live) pour conserver les quantités */
  const stocksItems = src.stocks.items.map(item => {
    let newLive = prices[item.t];
    if(!newLive) return item;
    if(isEurTicker(item.t)){
      let priceEUR = newLive;
      if(priceEUR < 1) priceEUR = priceEUR * 100;
      newLive = parseFloat((priceEUR * eurUsd).toFixed(4));
    }
    const currentLive = item.live || 1;
    const variation = Math.abs(newLive - currentLive) / currentLive;
    if(variation > 0.5){
      // #67h — anti-verrouillage : si le « prix aberrant » se CONFIRME (2 lectures consécutives
      // à ±5 %), c'est le prix STOCKÉ qui était périmé (ex. AXON figé à 386,94 rejetant 597) →
      // on accepte le nouveau. Un glitch Yahoo, lui, ne se confirme jamais deux fois.
      let _confirmed=false;
      try{
        const _pk='cgi_px_pending';
        const _pend=JSON.parse(localStorage.getItem(_pk)||'{}');
        const _prev=_pend[item.t];
        if(_prev && Math.abs(newLive-_prev)/_prev < 0.05){
          delete _pend[item.t]; localStorage.setItem(_pk,JSON.stringify(_pend));
          console.warn(`Prix confirmé pour ${item.t}: ${newLive} (référence ${currentLive} périmée) — accepté`);
          _confirmed=true;
        } else {
          _pend[item.t]=newLive; localStorage.setItem(_pk,JSON.stringify(_pend));
        }
      }catch(e){}
      if(!_confirmed){
        console.warn(`Prix aberrant pour ${item.t}: ${newLive} vs ${currentLive} — ignoré (sera accepté s'il se confirme au prochain rafraîchissement)`);
        return item;
      }
    }
    const newVal = Math.round(item.qty * newLive);
    const investi = (item.pa || newLive) * item.qty;  // si pa=0, on utilise le prix live comme base
    const newPnl = Math.round(newVal - investi);
    const newPct = investi > 0 ? newPnl / investi : 0;
    return {...item, live: newLive, val: newVal, pnl: newPnl, pct: newPct};
  });
  const stocksTotal = stocksItems.reduce((s,x)=>s+x.val, 0);
  /* Cryptos — mise à jour générique (BTC, ETH, SOL… tout ce qui est dans src.crypto.items)
     prices[item.t] est fourni par Yahoo via YF_MAP (ex. BTC→"BTC-USD"). */
  const cryptoItems = src.crypto.items.map(item => {
    const newLive = prices[item.t] || item.live;
    const newVal  = Math.round(item.qty * newLive);
    const investi = (item.pa || newLive) * item.qty;
    const newPnl  = Math.round(newVal - investi);
    const newPct  = investi > 0 ? newPnl / investi : 0;
    return {...item, live: newLive, val: newVal, pnl: newPnl, pct: newPct};
  });
  const cryptoTotal = cryptoItems.reduce((s,x)=>s+x.val, 0);
  const btcLive = (cryptoItems.find(x=>x.t==="BTC")?.live) || prices.BTC || src.btcPrice;

  /* CGIC et CGIS */
  const tmpEFF = {
    usdEur: rate, eurUsd, btcPrice: btcLive,
    crypto: {...src.crypto, total: cryptoTotal, items: cryptoItems},
    stocks: {...src.stocks, total: stocksTotal, items: stocksItems},
    bank: {...src.bank},
  };
  const {gdbS, gdbC} = calcGdbPrices(tmpEFF);

  /* Bank stays in EUR — converti en $ au taux live */
  const bankUSD = Math.round(src.bank.totalEUR * eurUsd);

  /* Totaux */
  const totalUSD = cryptoTotal + stocksTotal + bankUSD;
  const totalEUR = Math.round(totalUSD * rate);

  /* Portfolio.items mis à jour */
  const newEurUsd = eurUsd;
  let portfolioItems = null;
  if(src.portfolio?.items){
    portfolioItems = src.portfolio.items.map(item=>{
      const newLive = cryptoItems.find(c=>c.t===item.t)?.live
                   || stocksItems.find(s=>s.t===item.t)?.live
                   || (item.cat==="Cash Matelas" ? newEurUsd : item.live);
      const newVal = item.cat==="Cash Matelas"
        ? Math.round(item.qty * newEurUsd)
        : Math.round((item.qty||1) * newLive);
      const investi2 = item.cat==="Cash Matelas" ? newVal : (item.pa||newLive)*(item.qty||1);
      const newPnl = item.cat==="Cash Matelas" ? 0 : Math.round(newVal - investi2);
      const newPct2 = investi2 > 0 ? newPnl / investi2 : 0;
      return {
        ...item, live: newLive, val: newVal, pnl: newPnl, pct: newPct2,
        valEUR: item.cat==="Cash Matelas" ? item.valEUR : Math.round(newVal * rate),
      };
    });
  }

  return {
    usdEur: rate, eurUsd,
    totalUSD, totalEUR,
    btcPrice: btcLive,
    _ethLive: prices.ETH || src._ethLive || null,  // conservé pour le snapshot
    gdbC, gdbS,
    crypto: {...src.crypto, total: cryptoTotal, items: cryptoItems},
    stocks: {...src.stocks, total: stocksTotal, items: stocksItems},
    bank:   {...src.bank},
    ...(portfolioItems ? {portfolio: {...src.portfolio, items: portfolioItems}} : {}),
  };
}

// Date locale UTC+11 (Nouvelle-Calédonie)
const APP_VERSION = "v7.30";
const APP_LOGO = "data:image/png;base64,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";
// v4.5 — fix NICK : NICK.AS n'existe pas chez Yahoo, le bon symbole EUR est NICK.MI (Milan)
try{ if(typeof YF_MAP!=="undefined" && YF_MAP){ YF_MAP.NICK="NICK.MI"; } }catch(e){}
const NC_OFFSET_MS = 11 * 60 * 60 * 1000;
const todayNC = () => {
  const nc = new Date(Date.now() + NC_OFFSET_MS);
  return nc.toISOString().slice(0, 10);
};
const today = todayNC; // alias utilisé partout dans le code
// mnt: masque la valeur si hidden=true, sinon la formate
const mnt=(val,hidden,prefix="")=>hidden?"***":(prefix+String(val));
const uid=()=>"t"+Date.now();
/* ═══════════════════════════════════════════════════════════
   STORAGE ENGINE v8 — GitHub Gist (multi-appareils) + localStorage (fallback offline)
   Gist layout: un seul fichier cgi_data.json = { chart: [...], txns: [...] }
═══════════════════════════════════════════════════════════ */
/* ── Cloudflare Worker Storage ─────────────────────────────────── */
const CF_WORKER_URL = "https://blue-firefly-2075watchlist-api.jcgi.workers.dev";
const CF_AUTH_KEY   = "watchlist";
const LS_KEY     = "cgi_portfolio_v1";

/* Lit le Gist complet — retourne l'objet JSON ou null */
async function cfRead(){
  // 2 tentatives, délai allongé pour les connexions lentes (LTE)
  for(let attempt=1; attempt<=2; attempt++){
    try{
      const res = await fetch(`${CF_WORKER_URL}/read`,{
        headers:{"X-Auth-Key":CF_AUTH_KEY},
        signal: AbortSignal.timeout(attempt===1 ? 18000 : 25000),
      });
      if(!res.ok){
        const txt = await res.text().catch(()=>"");
        if(attempt<2){ await new Promise(r=>setTimeout(r,1500)); continue; }
        return {_error:true, status:res.status, statusText:res.statusText, body:txt.slice(0,200)};
      }
      return await res.json();
    }catch(e){
      if(attempt<2){ await new Promise(r=>setTimeout(r,1500)); continue; }
      return {_error:true, status:null, statusText:e.message, body:e.name};
    }
  }
}
const gistRead = cfRead;

/* Écrit l'objet complet dans Cloudflare KV */
async function cfWrite(obj){
  try{
    const res = await fetch(`${CF_WORKER_URL}/write`,{
      method:"POST",
      headers:{"X-Auth-Key":CF_AUTH_KEY,"Content-Type":"application/json"},
      body: JSON.stringify(obj),
      signal: AbortSignal.timeout(18000),
    });
    return res.ok;
  }catch{ return false; }
}
const gistWrite = cfWrite;

async function cfPing(){
  try{
    const res = await fetch(`${CF_WORKER_URL}/ping`,{
      headers:{"X-Auth-Key":CF_AUTH_KEY},
      signal: AbortSignal.timeout(5000),
    });
    if(!res.ok) return {_error:true, status:res.status, statusText:res.statusText, body:""};
    const data = await res.json();
    return data?.ok ? null : {_error:true, status:200, statusText:"Réponse inattendue", body:JSON.stringify(data)};
  }catch(e){
    return {_error:true, status:null, statusText:e.message, body:e.name};
  }
}

/* Cache local (localStorage) */
function lsRead(){ try{ const v=localStorage.getItem(LS_KEY); return v?JSON.parse(v):{}; }catch{ return {}; } }
function lsWrite(obj){ try{ localStorage.setItem(LS_KEY,JSON.stringify(obj)); }catch{} }

/* Cache local pour ICON_DB — clé séparée pour éviter les conflits de taille */
const LS_ICONS_KEY = "cgi_icons_v1";
function lsReadIcons(){ try{ const v=localStorage.getItem(LS_ICONS_KEY); return v?JSON.parse(v):null; }catch{ return null; } }
function lsWriteIcons(db){ try{ localStorage.setItem(LS_ICONS_KEY,JSON.stringify(db)); }catch{} }

/* ═══════════════════════════════════════════════════════════
   STORAGE ENGINE v9 — miroir localStorage des 16 clés KV (Phase 1)
   But : installer la couche de persistance locale unifiée.
   ⚠ Phase 1 = conteneur seul. AUCUNE lecture/écriture applicative
   ne dépend encore de v9 (ce sera la Phase 2). On se contente
   d'écrire/seeder le miroir. Rien ne change pour l'utilisateur.
   Chaque entrée est encapsulée : { v: <valeur>, t: <timestamp ms> }.
═══════════════════════════════════════════════════════════ */
const LS_V9_KEY = "cgi_v1";
// CGI v1.0 — Nettoyage automatique des clés localStorage de l'ancien propriétaire
(()=>{ try{ ["gdb_sons_v8","gdb_sons_v9","gdb_sons_v9_dirty","gdb_sons_v9_migrated","gdb_sons_icons_v1"]
  .forEach(k=>{ if(localStorage.getItem(k)!==null) localStorage.removeItem(k); }); }catch(e){} })();

// Mêmes noms que les clés KV (cf. Worker /read & /write-bases ALLOWED)
// v25.00 Phase 1 — Base des mouvements d'investissement dans les fonds (CGIS / CGIC).
// Chaque ligne = {id,date,fonds,holder,io,shares,vps,montant}. Source de verite des parts (option B).

const LSV9_KEYS = [
  "cgi_snapshots","cgi_txns","cgi_dd","cgi_gdbs","cgi_gc","cgi_gsb",
  "cgi_cm","cgi_sm","cgi_tm","cgi_bench",
  "cgi_portfolio","cgi_crypto","cgi_stocks","cgi_bank",
  "cgi_yfmap","cgi_icons",
  "cgi_inv",
  "cgi_futures","cgi_ibkr_annex",
  "cgi_watchlist",
  "cgi_fund_stats",
  "cgi_alloc_targets","cgi_alloc_templates",
  "cgi_daily",
  "cgi_home_ovr",
  "cgi_pin",   // #62b — hash du code PIN (jamais en clair) : doit être accepté par saveBase pour se synchroniser au cloud
];
function lsv9ReadAll(){ try{ const v=localStorage.getItem(LS_V9_KEY); return v?JSON.parse(v):{}; }catch{ return {}; } }
function lsv9WriteAll(obj){ try{ localStorage.setItem(LS_V9_KEY, JSON.stringify(obj)); return true; }catch{ return false; } }
// Lit la valeur d'une base (déballe l'enveloppe {v,t}) — null si absente
function lsv9Get(key){ const all=lsv9ReadAll(); const e=all[key]; return e && typeof e==="object" && "v" in e ? e.v : (e!==undefined?e:null); }
// Lit l'horodatage d'écriture d'une base — null si absente
function lsv9GetMeta(key){ const all=lsv9ReadAll(); const e=all[key]; return e && typeof e==="object" && "t" in e ? e.t : null; }

// ── Helpers partagés trades (#3, #16, #17) ──────────────────────────────────
function getAllTxns(){
  let all=null; try{ all=lsv9Get('cgi_txns'); }catch(e){}
  if(!Array.isArray(all)||!all.length){ try{ all=(typeof SEED_TXNS_REAL!=="undefined")?SEED_TXNS_REAL:[]; }catch(e){ all=[]; } }
  all=Array.isArray(all)?all:[];
  // #72b — fusion de l'archive IBKR (exécutions réelles, prioritaires) : cohérence globale
  // du drill-down (TickerModal), des stats et des flux cash. Affichage seul (jamais persisté ici).
  try{
    const arch=JSON.parse(localStorage.getItem('cgi_ibkr_trades_direct')||'null');
    const ib=(arch&&Array.isArray(arch.trades))?arch.trades:(typeof _IBKR_TRADES_CACHE!=="undefined"?_IBKR_TRADES_CACHE:null);
    if(ib&&ib.length&&typeof mergeTradesIbkrPriority==="function") return mergeTradesIbkrPriority(all, ib);
  }catch(e){}
  return all;
}
var _IBKR_TRADES_CACHE=null; // alimenté au boot depuis cgi_ibkr_trades (pour getAllTxns hors React)
function getTickerTrades(ticker){
  const T=String(ticker||"").toUpperCase().trim();
  if(!T) return [];
  const ledger = getAllTxns().filter(t=>t&&t.ticker&&String(t.ticker).toUpperCase().trim()===T)
                     .sort((a,b)=>(a.date<b.date?-1:(a.date>b.date?1:0)));
  // #48 — Réconciliation : la position initiale (seed CURRENT) n'est pas dans le registre.
  // Si le registre ne couvre pas toute la quantité détenue, on préfixe un lot d'ouverture
  // synthétique pour la différence → la page détail reflète la position réelle (plus d'effacement).
  try{
    const items=(CURRENT&&CURRENT.portfolio&&CURRENT.portfolio.items)||[];
    const seed=items.find(x=>(x.t||"").toUpperCase()===T && x.cat!=="Cash Matelas" && x.cat!=="Cash");
    if(seed && seed.qty>0){
      let net=0; ledger.forEach(t=>{ net+=(t.side==="BUY"?1:-1)*Math.abs(t.qty||0); });
      const gap=seed.qty-net;
      if(gap>1e-8){
        ledger.unshift({ticker:T, side:"BUY", qty:Math.round(gap*1e8)/1e8, price:seed.pa||seed.live||0,
          date:(CURRENT.date||"2022-01-01"), currency:"USD", _synth:true, note:"Position initiale"});
      }
    }
  }catch(e){}
  return ledger;
}
function tradeTickers(){
  return [...new Set(getAllTxns().map(t=>t&&t.ticker).filter(Boolean).map(x=>String(x).toUpperCase().trim()))].sort();
}
// Apparie ventes ↔ achats en FIFO → P&L réalisé, % et durée de détention par vente (#21)
// Perf période d'un fonds = composition des rendements mensuels (CRYPTO_MONTHLY/STOCKS_MONTHLY),
// même base que Stats (cohérent). Mois courant injecté depuis la valeur live (€).
// Source de vérité unique : Home + JCGI + Stats utilisent la même logique.
function fundPeriodPerf(fond, fromDateStr, cm, sm, liveValEUR){
  const MAP = fond==="CGIC" ? cm : sm;
  if(!MAP) return null;
  const now = new Date(Date.now()+11*3600*1000);
  const curY = String(now.getFullYear()), curMI = now.getMonth();
  const yrs = Object.keys(MAP).filter(y=>/^\d{4}$/.test(y)).sort();
  // dernier eom connu (toutes années) pour servir de BOM au mois courant
  const lastEomBefore = (y,mi) => {
    for(let k=yrs.indexOf(y); k>=0; k--){ const Y=yrs[k]; const d=MAP[Y]; if(!d||!d.eom) continue;
      const start = (Y===y)?mi-1:d.eom.length-1;
      for(let j=start;j>=0;j--){ if(d.eom[j]!=null) return d.eom[j]; }
    }
    return null;
  };
  const rows=[];
  yrs.forEach(y=>{ const d=MAP[y]; if(!d||!d.m) return;
    d.m.forEach((ml,i)=>{ if(!ml) return;
      const end = y+"-"+String(i+1).padStart(2,"0")+"-28";
      let pnl=d.pnl?d.pnl[i]:null, bom=d.bom?d.bom[i]:null, inv=(d.inv?d.inv[i]:0)||0;
      if(y===curY && i===curMI && liveValEUR!=null){      // mois courant : valeur live
        const prev = lastEomBefore(y,i);
        if(prev!=null){ bom=prev; pnl=liveValEUR-prev-inv; }
      }
      if(pnl==null||bom==null) return;
      const base=(bom||0)+inv;
      if(base>0) rows.push({end, ret:pnl/base});
    });
  });
  let acc=1, any=false;
  rows.forEach(r=>{ if(r.end>=fromDateStr){ acc*=(1+r.ret); any=true; } });
  return any ? acc-1 : null;
}
function fifoEnrich(trades){
  const lots=[]; // file FIFO des achats {qty,price,date}
  return trades.map(t=>{
    const q=Math.abs(t.qty||0), p=t.price||0;
    if(t.side==="BUY"){ lots.push({qty:q,price:p,date:t.date}); return {...t, held:null, pnl:null, pnlPct:null}; }
    let rem=q, cost=0, matched=0, wDays=0;
    while(rem>1e-9 && lots.length){
      const lot=lots[0]; const take=Math.min(rem,lot.qty);
      cost+=take*lot.price; matched+=take;
      const days=Math.round((new Date(t.date)-new Date(lot.date))/86400000);
      wDays+=take*days; lot.qty-=take; rem-=take;
      if(lot.qty<=1e-9) lots.shift();
    }
    const avgCost=matched>0?cost/matched:null;
    const pnl=avgCost!=null?(p-avgCost)*matched:null;
    const pnlPct=(avgCost!=null&&avgCost>0)?(p/avgCost-1):null;
    const held=matched>0?Math.round(wDays/matched):null;
    return {...t, held, pnl, pnlPct, avgCost};
  });
}
// Écrit une base (ignore les clés inconnues et les valeurs vides)
function lsv9Set(key, value, t){
  if(LSV9_KEYS.indexOf(key)<0) return false;
  if(value===undefined || value===null) return false;
  const all=lsv9ReadAll();
  all[key]={ v:value, t: t || Date.now() };
  return lsv9WriteAll(all);
}
// Écrit plusieurs bases d'un coup — retourne le nombre de bases écrites
function lsv9SetMany(obj, t){
  if(!obj || typeof obj!=="object") return 0;
  const all=lsv9ReadAll(); const ts=t||Date.now(); let n=0;
  LSV9_KEYS.forEach(function(k){
    if(obj[k]!==undefined && obj[k]!==null){ all[k]={ v:obj[k], t:ts }; n++; }
  });
  lsv9WriteAll(all);
  return n;
}
// #16 — journal de snapshots quotidiens : enregistre/écrase l'entrée du jour {d,c,s,t} en €.
// Last-write-wins intraday ; trié ; borné aux ~1200 derniers jours. Persiste + synchronise (clé whitelistée).
function cgiRecordDaySnap(cEUR, sEUR, tEUR){
  try{
    if(!(cEUR>0) && !(sEUR>0)) return false;
    const today = (typeof todayNC==="function") ? todayNC() : new Date().toISOString().slice(0,10);
    let arr = lsv9Get("cgi_daily"); if(!Array.isArray(arr)) arr=[];
    const e = { d:today, c:Math.round(cEUR||0), s:Math.round(sEUR||0), t:Math.round((tEUR!=null?tEUR:((cEUR||0)+(sEUR||0)))) };
    const i = arr.findIndex(x=>x && x.d===today);
    if(i>=0) arr[i]=e; else arr.push(e);
    arr.sort((a,b)=> a.d<b.d ? -1 : (a.d>b.d?1:0));
    if(arr.length>1200) arr=arr.slice(-1200);
    return lsv9Set("cgi_daily", arr);
  }catch(_){ return false; }
}
// ─────────────────────────────────────────────────────────────────────────
// SOURCE DE VÉRITÉ UNIQUE de l'accueil (#fix) — tout en VALEUR € réelle.
// Construit 3 séries (crypto, actions, total=crypto+actions) puis, par horizon,
// calcule { n points, valeur début, valeur fin, %, P&L } de façon identique.
// Les graphes ET le tableau de la page Data lisent EXACTEMENT ceci → cohérence garantie.
// ─────────────────────────────────────────────────────────────────────────
function cgiHomeSeries(EFF, opts){
  opts = opts || {};
  const src = EFF || (typeof CURRENT!=="undefined"?CURRENT:{});
  const ue  = (src && src.usdEur) || 0.92;
  const CM  = opts.CM || (typeof CRYPTO_MONTHLY!=="undefined"?CRYPTO_MONTHLY:{});
  const SM  = opts.SM || (typeof STOCKS_MONTHLY!=="undefined"?STOCKS_MONTHLY:{});
  const today = (typeof todayNC==="function") ? todayNC() : new Date().toISOString().slice(0,10);
  const model = (typeof computePortfolioModel==="function") ? computePortfolioModel(src) : {cryptoUSD:0,stocksUSD:0,totalEUR:0};
  const liveC = Math.round((model.cryptoUSD||0)*ue);
  const liveS = Math.round((model.stocksUSD||0)*ue);
  const journal = (()=>{ const a=lsv9Get("cgi_daily"); return Array.isArray(a)?a:[]; })();
  // valeur € fin de mois d'un fonds = bom + inv + pnl
  function monthlyVals(MAP){
    const out=[]; const yrs=Object.keys(MAP||{}).filter(y=>/^\d{4}$/.test(y)).sort();
    yrs.forEach(y=>{ const d=MAP[y]; if(!d||!d.m) return;
      d.m.forEach((ml,i)=>{ if(ml==null) return;
        const ds=y+"-"+String(i+1).padStart(2,"0")+"-28"; if(ds>today) return;
        const base=(d.bom?(d.bom[i]||0):0)+(d.inv?(d.inv[i]||0):0);
        const v=Math.round(base+(d.pnl?(d.pnl[i]||0):0)); if(v>0) out.push({d:ds, v});
      });
    });
    return out;
  }
  const snaps = (()=>{ const a=lsv9Get("cgi_snapshots"); return Array.isArray(a)?a:[]; })();
  function build(monthly, snapField, journalField, liveEUR){
    const map={};
    monthly.forEach(p=>{ map[p.d]=p.v; });                                   // valeurs fin de mois
    snaps.forEach(s=>{ if(!s||!s.d||s.d>today) return; const v=s[snapField]; if(v>0) map[s.d]=Math.round(v); });   // snapshots manuels (cg/act €)
    journal.forEach(s=>{ if(!s||!s.d||s.d>today) return; const v=s[journalField]; if(v>0 && map[s.d]==null) map[s.d]=Math.round(v); }); // journal quotidien #16 (comble les trous)
    if(liveEUR>0) map[today]=liveEUR;                                        // live aujourd'hui (prioritaire)
    return Object.keys(map).sort().map(d=>({d, v:map[d]}));
  }
  const cryptoS = build(monthlyVals(CM), "cg",  "c", liveC);
  const stocksS = build(monthlyVals(SM), "act", "s", liveS);
  const cMap={}, sMap={};
  cryptoS.forEach(p=>cMap[p.d]=p.v); stocksS.forEach(p=>sMap[p.d]=p.v);
  const allD = Object.keys(Object.assign({}, cMap, sMap)).sort();
  const totalS = allD.map(d=>({d, v:(cMap[d]||0)+(sMap[d]||0)}));

  const DAYS={"D":1,"3D":3,"1S":7,"1M":30,"3M":90,"1A":365,"ALL":999999};
  const LABELS={"D":"1 jour","3D":"3 jours","1S":"7 jours","1M":"30 jours","3M":"3 mois","YTD":"depuis janv.","1A":"1 an","ALL":"tout"};
  const NCo = (typeof NC_OFFSET_MS!=="undefined"?NC_OFFSET_MS:0);
  function cutOf(tf){
    if(tf==="YTD"){ const d=new Date(Date.now()+NCo); return new Date(d.getUTCFullYear(),0,1).toISOString().slice(0,10); }
    const dd=DAYS[tf]||30; return new Date(Date.now()+NCo-dd*864e5).toISOString().slice(0,10);
  }
  function windowOf(series, tf){ const c=cutOf(tf); return series.filter(p=>p.d>=c); }
  const SER = {total:totalS, crypto:cryptoS, stocks:stocksS};
  const OVR = (()=>{ const o=lsv9Get("cgi_home_ovr"); return (o&&typeof o==="object")?o:{}; })();
  const ovrKey = (scope,tf,field)=> scope+":"+tf+":"+field;
  const ovrGet = (scope,tf,field)=>{ const v=OVR[ovrKey(scope,tf,field)]; return (v==null||isNaN(v))?null:Number(v); };
  const ORDER=["D","3D","1S","1M","3M","YTD","1A","ALL"];
  function apportsOf(MAP, fromD, toD){
    let a=0; const yrs=Object.keys(MAP||{}).filter(y=>/^\d{4}$/.test(y)).sort();
    yrs.forEach(y=>{ const d=MAP[y]; if(!d||!d.inv) return;
      d.inv.forEach((iv,i)=>{ if(!iv) return; const ds=y+"-"+String(i+1).padStart(2,"0")+"-28"; if(ds>fromD && ds<=toD) a+=iv; });
    });
    return Math.round(a);
  }
  const MAP_OF = scope => scope==="crypto"?CM : (scope==="stocks"?SM : null);
  function adjWindow(scope, tf){
    const w = windowOf(SER[scope]||[], tf).map(p=>({d:p.d, v:p.v}));
    if(w.length>=2){
      const so=ovrGet(scope,tf,"start"); if(so!=null) w[0].v=so;
      const eo=ovrGet(scope,tf,"end");   if(eo!=null) w[w.length-1].v=eo;
    }
    return w;
  }
  function metricA(scope, tf){
    const w = adjWindow(scope, tf);
    if(w.length<2) return {n:w.length, start:(w[0]?w[0].v:null), end:(w.length?w[w.length-1].v:null), pct:null, pnl:null, apports:0, perf:null, ok:false, win:w};
    const s=w[0].v, e=w[w.length-1].v;
    let ap=ovrGet(scope,tf,"apports");
    if(ap==null){ ap = (scope==="total") ? (apportsOf(CM, w[0].d, today)+apportsOf(SM, w[0].d, today)) : apportsOf(MAP_OF(scope), w[0].d, today); }
    const net=e-s-ap, base=(s+ap)||1;
    return {n:w.length, start:s, end:e, pct:(s>0?e/s-1:null), pnl:Math.round(e-s), apports:Math.round(ap), perf:(base>0?net/base:null), ok:true, win:w};
  }
  const rows = ORDER.map(tf=>({ tf, label:LABELS[tf], total:metricA("total",tf), crypto:metricA("crypto",tf), stocks:metricA("stocks",tf) }));
  // n'expose un horizon que s'il a STRICTEMENT plus de points que le précédent retenu
  // (sinon 1j/3j/7j affichent la même fenêtre tant que le journal est clairsemé)
  const available = (()=>{ let lastN=-1; const out=[];
    ORDER.forEach(tf=>{ const r=rows.find(x=>x.tf===tf); if(!r) return;
      if(r.total.ok && r.crypto.ok && r.stocks.ok && r.total.n>lastN){ out.push(tf); lastN=r.total.n; }
    });
    return out.length?out:["ALL"];
  })();
  return { today, live:{crypto:liveC, stocks:liveS, total:liveC+liveS}, series:SER, rows, available, cutOf, windowOf, adjWin:adjWindow, ovrKey, labels:LABELS };
}

// Tableau éditable « Source de vérité » de l'accueil — chaque valeur est cliquable/modifiable.
function HomeTruthTable({EFF, liveCM, liveSM, hidden}){
  const [tick, setTick] = React.useState(0);
  const [edit, setEdit] = React.useState(null);
  const [draft, setDraft] = React.useState("");
  const HS = cgiHomeSeries(EFF, {CM:liveCM, SM:liveSM});
  const fmtE = v => v==null ? "—" : (hidden ? "•••" : (Math.round(v).toLocaleString("fr-FR")+" €"));
  const fmtPc = v => v==null ? "—" : ((v>=0?"+":"")+(v*100).toFixed(1)+" %");
  const scopes = [["Patrimoine (Crypto + Actions)","total"],["Crypto","crypto"],["Actions","stocks"]];
  function readOvr(){ const o=lsv9Get("cgi_home_ovr"); return (o&&typeof o==="object")?o:{}; }
  function saveOvr(scope,tf,field,value){ const o=readOvr(); const k=scope+":"+tf+":"+field; if(value==null||value===""||isNaN(value)) delete o[k]; else o[k]=Number(value); lsv9Set("cgi_home_ovr", o); setTick(t=>t+1); }
  function startEdit(scope,tf,field,current){ setEdit({scope,tf,field}); setDraft(current==null?"":String(Math.round(current))); }
  function commit(){
    if(!edit){ return; }
    const sc=edit.scope, tf=edit.tf, field=edit.field;
    const row=HS.rows.find(r=>r.tf===tf); const m=row?row[sc]:null;
    const raw=parseFloat(String(draft).replace(/[^0-9.,-]/g,"").replace(",","."));
    if(isNaN(raw)){ setEdit(null); return; }
    if(field==="start"||field==="end"||field==="apports"){ saveOvr(sc,tf,field,Math.round(raw)); }
    else if(field==="pct"){ const st=m?m.start:null; if(st!=null) saveOvr(sc,tf,"end",Math.round(st*(1+raw/100))); }
    else if(field==="perf"){ const st=m?m.start:0, ap=m?m.apports:0; saveOvr(sc,tf,"end",Math.round(st+ap+(raw/100)*(st+ap))); }
    setEdit(null);
  }
  function resetRow(tf){ const o=readOvr(); Object.keys(o).forEach(k=>{ if(k.indexOf(":"+tf+":")>=0) delete o[k]; }); lsv9Set("cgi_home_ovr",o); setTick(t=>t+1); }
  const ovr=readOvr();
  const isOvr=(sc,tf,field)=> (sc+":"+tf+":"+field) in ovr;
  const rowHasOvr=(tf)=> Object.keys(ovr).some(k=>k.indexOf(":"+tf+":")>=0);
  function cell(sc,tf,field,value,display,color){
    const editing = edit && edit.scope===sc && edit.tf===tf && edit.field===field;
    if(editing){
      return React.createElement("input",{autoFocus:true,value:draft,onChange:e=>setDraft(e.target.value),onBlur:commit,
        onKeyDown:e=>{ if(e.key==="Enter") commit(); if(e.key==="Escape") setEdit(null); },
        style:{width:62,fontSize:10.5,padding:"2px 3px",textAlign:"right",border:`1px solid ${C.gold}`,borderRadius:4,background:C.bg,color:C.text,fontFamily:"inherit"}});
    }
    return React.createElement("span",{onClick:()=>startEdit(sc,tf,field,value),
      style:{cursor:"pointer",color:color||C.text2,borderBottom:isOvr(sc,tf,field)?`1px dashed ${C.gold}`:"1px dashed transparent"}}, display);
  }
  const th = {padding:"3px 4px",textAlign:"right",fontWeight:600};
  const td = {padding:"4px 4px",textAlign:"right"};
  return (
    <div style={{background:C.bg2,borderRadius:12,padding:"14px 12px",marginBottom:14,border:`1px solid ${C.border}`}}>
      <div style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:C.gold,textAlign:"center",marginBottom:4}}>Source de vérité — Accueil</div>
      <div style={{fontSize:9.5,color:C.text3,textAlign:"center",marginBottom:12}}>Touche une valeur pour la corriger · les graphes s'alignent · {HS.today}</div>
      {scopes.map(([title,key])=>(
        <div key={key} style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:6}}>{title}</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:10.5,fontVariantNumeric:"tabular-nums"}}>
              <thead><tr style={{color:C.text2}}>
                <th style={{padding:"3px 4px",textAlign:"left",fontWeight:600}}>Horizon</th>
                <th style={th}>Pts</th><th style={th}>Début</th><th style={th}>Fin</th>
                <th style={th}>Δ %</th><th style={th}>Apports</th><th style={th}>Perf.</th><th style={{padding:"3px 2px"}}></th>
              </tr></thead>
              <tbody>
                {HS.rows.map(r=>{ const m=r[key]; const av=m.ok;
                  return (
                    <tr key={r.tf} style={{borderTop:`1px solid ${C.border}`,opacity:av?1:0.4}}>
                      <td style={{padding:"4px 4px",textAlign:"left",color:C.text}}>{r.label}</td>
                      <td style={Object.assign({},td,{color:C.text3})}>{m.n}</td>
                      <td style={td}>{av?cell(key,r.tf,"start",m.start,fmtE(m.start),C.text2):"—"}</td>
                      <td style={td}>{av?cell(key,r.tf,"end",m.end,fmtE(m.end),C.text2):"—"}</td>
                      <td style={td}>{av?cell(key,r.tf,"pct",m.pct!=null?m.pct*100:null,fmtPc(m.pct),m.pct>=0?C.green:C.red):"—"}</td>
                      <td style={td}>{av?cell(key,r.tf,"apports",m.apports,fmtE(m.apports),C.text3):"—"}</td>
                      <td style={td}>{av?cell(key,r.tf,"perf",m.perf!=null?m.perf*100:null,fmtPc(m.perf),m.perf>=0?C.green:C.red):"—"}</td>
                      <td style={{padding:"4px 2px",textAlign:"center"}}>{rowHasOvr(r.tf)?<span onClick={()=>resetRow(r.tf)} title="Réinitialiser" style={{cursor:"pointer",color:C.gold,fontSize:12}}>↺</span>:null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <div style={{fontSize:9,color:C.text3,marginTop:4,lineHeight:1.55}}>
        Touche n'importe quelle valeur pour la modifier (Δ % et Perf. ajustent la valeur de fin). Soulignée en or = corrigée à la main · ↺ réinitialise la ligne. Δ % = fin/début − 1 (avec apports) · Perf. = hors apports.
      </div>
    </div>
  );
}
// Seed depuis une réponse KV /read — REMPLISSAGE des clés manquantes uniquement.
// Ne remplace jamais une base déjà présente en local, ni une base "dirty"
// (changement local non encore synchronisé). La mise à jour local↔cloud par
// récence sera gérée par la réconciliation/loadBase, pas par ce seed.
function lsv9SeedFromKv(kv){
  if(!kv || typeof kv!=="object") return 0;
  const dirty = (typeof lsv9DirtyList==="function") ? lsv9DirtyList() : [];
  const existing = lsv9ReadAll();
  const picked={};
  LSV9_KEYS.forEach(function(k){
    if(dirty.indexOf(k)>=0) return;       // ne pas écraser un changement local non synchronisé
    if(existing[k]!==undefined) return;   // ne pas écraser une base déjà présente
    if(kv[k]!==undefined && kv[k]!==null) picked[k]=kv[k];
  });
  const n=lsv9SetMany(picked);
  console.info("[lsv9] seed KV→v9 : "+n+" base(s) remplie(s) (dirty/existant préservés)");
  return n;
}
// #61 — Forcer la synchro DEPUIS le cloud : écrase TOUTES les bases locales de cet appareil
// par celles du KV (la source partagée). Sert à réaligner un appareil qui a dérivé.
async function cgiForcePullFromCloud(){
  const kv = await cfRead();
  if(!kv || kv._error) throw new Error("KV indisponible"+(kv&&kv.status?(" ("+kv.status+")"):""));
  const picked={};
  LSV9_KEYS.forEach(function(k){ if(kv[k]!==undefined && kv[k]!==null) picked[k]=kv[k]; });
  lsv9SetMany(picked);                                  // écrase les valeurs locales par le cloud
  try{ localStorage.removeItem("cgi_v1_dirty"); }catch(e){}   // efface les "dirty"
  return Object.keys(picked).length;
}
if(typeof window!=="undefined") window.__cgiForcePull = cgiForcePullFromCloud;
// #61 — Forcer la pousse VERS le cloud : envoie TOUTES les bases locales de cet appareil au KV.
// À lancer sur l'appareil À JOUR (celui où tu fais tes saisies) pour publier la vérité.
async function cgiForcePushToCloud(){
  const all = lsv9ReadAll();
  let n=0;
  for(const k of LSV9_KEYS){
    const e=all[k];
    if(e===undefined) continue;
    const val = (e&&typeof e==="object"&&"v" in e)?e.v:e;
    try{ await saveBase(k, val); n++; }catch(e2){}
  }
  return n;
}
if(typeof window!=="undefined") window.__cgiForcePush = cgiForcePushToCloud;

/* ═══════════════════════════════════════════════════════════
   #9 — REGISTRE DES APPAREILS CONNECTÉS
   Chaque appareil s'enregistre dans la clé KV `cgi_devices`
   (map deviceId → {id,label,ua,platform,firstSeen,lastSeen}).
   Forward-compatible : si le worker n'a pas encore whitelisté
   `cgi_devices`, /read l'ignore et /write-bases ne l'écrit pas
   → le registre n'affiche alors que CET appareil (dégradation propre).
   Stockage hors lsv9 (raw localStorage) pour éviter le whitelist/quota.
═══════════════════════════════════════════════════════════ */
const CGI_DEV_ID_KEY    = "cgi_device_id";
const CGI_DEV_LABEL_KEY = "cgi_device_label";
const CGI_DEV_CACHE_KEY = "cgi_devices_cache";

function cgiDeviceId(){
  try{
    var id = localStorage.getItem(CGI_DEV_ID_KEY);
    if(!id){
      id = (typeof crypto!=="undefined" && crypto.randomUUID) ? crypto.randomUUID()
           : ("dev-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8));
      localStorage.setItem(CGI_DEV_ID_KEY, id);
    }
    return id;
  }catch(e){ return "dev-unknown"; }
}
// Devine un nom lisible (OS · navigateur) depuis le User-Agent
function cgiGuessDeviceLabel(){
  var ua = (typeof navigator!=="undefined" && navigator.userAgent) || "";
  var os = "Appareil";
  if(/iPhone/i.test(ua)) os="iPhone";
  else if(/iPad/i.test(ua)) os="iPad";
  else if(/Android/i.test(ua)) os="Android";
  else if(/Macintosh|Mac OS X/i.test(ua)) os="Mac";
  else if(/Windows/i.test(ua)) os="Windows";
  else if(/Linux/i.test(ua)) os="Linux";
  var br = "";
  if(/CriOS/i.test(ua)) br="Chrome";
  else if(/Edg/i.test(ua)) br="Edge";
  else if(/OPR|Opera/i.test(ua)) br="Opera";
  else if(/FxiOS|Firefox/i.test(ua)) br="Firefox";
  else if(/Chrome/i.test(ua)) br="Chrome";
  else if(/Safari/i.test(ua)) br="Safari";
  return br ? (os+" · "+br) : os;
}
function cgiDeviceLabel(){
  try{ var l=localStorage.getItem(CGI_DEV_LABEL_KEY); if(l) return l; }catch(e){}
  return cgiGuessDeviceLabel();
}
function cgiSetDeviceLabel(label){
  try{ localStorage.setItem(CGI_DEV_LABEL_KEY, String(label||"").slice(0,40)); }catch(e){}
}
function cgiDeviceSelf(){
  return {
    id: cgiDeviceId(),
    label: cgiDeviceLabel(),
    ua: (((typeof navigator!=="undefined")&&navigator.userAgent)||"").slice(0,180),
    platform: cgiGuessDeviceLabel(),
    lastSeen: Date.now(),
  };
}
function cgiDevicesCacheRead(){
  try{ var v=localStorage.getItem(CGI_DEV_CACHE_KEY); return v?JSON.parse(v):{}; }catch(e){ return {}; }
}
function cgiDevicesCacheWrite(map){
  try{ localStorage.setItem(CGI_DEV_CACHE_KEY, JSON.stringify(map||{})); }catch(e){}
}
// Écrit la map vers le KV (ignoré côté worker tant que cgi_devices n'est pas whitelisté)
async function cgiDevicesPush(map){
  try{
    var res = await fetch(`${CF_WORKER_URL}/write-bases`,{
      method:"POST",
      headers:{ "Content-Type":"application/json", "X-Auth-Key":CF_AUTH_KEY },
      body: JSON.stringify({ cgi_devices: map }),
      signal: AbortSignal.timeout(12000),
    });
    return res.ok;
  }catch(e){ return false; }
}
// Lit la map depuis le KV (avec repli cache local) ; rafraîchit le cache au passage.
async function cgiDevicesFetch(){
  var map = cgiDevicesCacheRead();
  try{
    var kv = await cfRead();
    if(kv && !kv._error && kv.cgi_devices && typeof kv.cgi_devices==="object"){
      map = kv.cgi_devices; cgiDevicesCacheWrite(map);
    }
  }catch(e){}
  return map || {};
}
// Enregistre CET appareil : fusionne dans la map et réécrit (cache + KV).
async function cgiRegisterDevice(){
  var self = cgiDeviceSelf();
  var map  = await cgiDevicesFetch();
  var prev = map[self.id] || {};
  map[self.id] = {
    id: self.id, label: self.label, ua: self.ua, platform: self.platform,
    firstSeen: prev.firstSeen || self.lastSeen, lastSeen: self.lastSeen,
  };
  cgiDevicesCacheWrite(map);
  await cgiDevicesPush(map);
  return map;
}
// Liste triée (KV ∪ self) par lastSeen décroissant ; garantit la présence de l'appareil courant.
async function cgiDevicesList(){
  var map  = await cgiDevicesFetch();
  var self = cgiDeviceSelf();
  if(!map[self.id]) map[self.id] = { id:self.id, label:self.label, ua:self.ua, platform:self.platform, firstSeen:self.lastSeen, lastSeen:self.lastSeen };
  var arr = Object.keys(map).map(function(k){ return map[k]; }).filter(Boolean);
  arr.sort(function(a,b){ return (b.lastSeen||0)-(a.lastSeen||0); });
  return arr;
}
// Retire un appareil du registre (cache + KV).
async function cgiDeviceRemove(id){
  var map = await cgiDevicesFetch();
  delete map[id];
  cgiDevicesCacheWrite(map);
  await cgiDevicesPush(map);
  return map;
}
if(typeof window!=="undefined"){ window.__cgiRegisterDevice=cgiRegisterDevice; window.__cgiDevicesList=cgiDevicesList; }

// Migration unique v8 → v9 : chart→cgi_snapshots, txns→cgi_txns, icons→cgi_icons
const LSV9_MIGRATED_FLAG = "cgi_v1_migrated";
function migrateV8toV9(){
  try{
    if(localStorage.getItem(LSV9_MIGRATED_FLAG)==="1") return false;
    const v8 = lsRead();           // { chart, txns }
    const icons = lsReadIcons();   // ICON_DB sérialisé
    const seed={};
    if(v8 && v8.chart) seed.cgi_snapshots = v8.chart;
    if(v8 && v8.txns)  seed.cgi_txns      = v8.txns;
    if(icons)          seed.cgi_icons     = icons;
    const n = lsv9SetMany(seed);
    localStorage.setItem(LSV9_MIGRATED_FLAG, "1");
    console.info("[lsv9] migration v8→v9 : "+n+" base(s) migrée(s) ("+Object.keys(seed).join(", ")+")");
    return true;
  }catch(e){ console.warn("[lsv9] migration échouée:", e && e.message); return false; }
}

/* API publique : load / save — transparent Gist + localStorage */
const SK={chart:"chart",txns:"txns"};

async function load(k, fallback){
  // 1. Essai localStorage (instantané)
  const ls = lsRead();
  const cached = ls[k];
  // 2. Essai Gist (vérité de référence multi-appareils)
  const gist = await gistRead();
  if(gist && gist[k]){
    // Mettre à jour le cache local si le Gist est plus récent
    ls[k] = gist[k];
    lsWrite(ls);
    return gist[k];
  }
  return cached || fallback;
}

/* ═══════════════════════════════════════════════════════════
   PHASE 2 (v23.03) — saveBase : écriture unifiée d'une base
   1) miroir local immédiat (lsv9) — jamais bloquant, marche offline
   2) push vers KV /write-bases avec petit retry
   Si le cloud échoue (offline), la donnée reste en local et la clé
   est marquée "dirty" (gdb_sons_v9_dirty) pour un re-push ultérieur.
   ⚠ Aucune lecture ne dépend encore de v9 : on ne fait qu'ÉCRIRE.
═══════════════════════════════════════════════════════════ */
const LSV9_DIRTY_FLAG = "cgi_v1_dirty";
function lsv9DirtyList(){ try{ const r=localStorage.getItem(LSV9_DIRTY_FLAG); return r?JSON.parse(r):[]; }catch{ return []; } }
function lsv9MarkDirty(key){ try{ const s=lsv9DirtyList(); if(s.indexOf(key)<0){ s.push(key); localStorage.setItem(LSV9_DIRTY_FLAG, JSON.stringify(s)); } }catch{} }
function lsv9ClearDirty(key){ try{ const s=lsv9DirtyList().filter(function(k){return k!==key;}); localStorage.setItem(LSV9_DIRTY_FLAG, JSON.stringify(s)); }catch{} }
// Pousse UNE base vers le Worker (même contrat que doSnapUpload)
async function cfWriteBase(key, value){
  const res = await fetch(`${CF_WORKER_URL}/write-bases`, {
    method:"POST",
    headers:{ "Content-Type":"application/json", "X-Auth-Key": CF_AUTH_KEY },
    body: JSON.stringify({ [key]: value }),
    signal: AbortSignal.timeout(15000),
  });
  if(!res.ok) throw new Error("HTTP "+res.status);
  return true;
}
async function saveBase(key, value){
  if(LSV9_KEYS.indexOf(key)<0){ console.warn("[saveBase] clé inconnue ignorée:", key); return false; }
  // 1) local immédiat (jamais bloquant)
  lsv9Set(key, value);
  // 2) push cloud avec retry ; échec → garde local + dirty
  for(let attempt=1; attempt<=3; attempt++){
    try{
      await cfWriteBase(key, value);
      lsv9ClearDirty(key);
      console.info("[saveBase] "+key+" → KV OK (tentative "+attempt+")");
      return true;
    }catch(e){
      if(attempt===3){
        lsv9MarkDirty(key);
        console.warn("[saveBase] "+key+" → KV échec, conservé en local (dirty):", e && e.message);
        return false;
      }
      await new Promise(function(r){ setTimeout(r, 400*attempt); });
    }
  }
}

// Phase 3 (v23.04) — re-push des bases "dirty" (laissées en local hors ligne) vers KV.
// Appelé quand on a la preuve d'être en ligne (après un /read KV réussi au boot).
async function flushDirtyBases(){
  const dirty = lsv9DirtyList();
  if(!dirty.length) return 0;
  console.info("[flush] "+dirty.length+" base(s) dirty à re-pousser : "+dirty.join(", "));
  let ok=0;
  for(const key of dirty){
    const val = lsv9Get(key);
    if(val===null || val===undefined){ lsv9ClearDirty(key); continue; }
    const r = await saveBase(key, val);   // saveBase efface le flag dirty si succès
    if(r) ok++;
  }
  console.info("[flush] "+ok+"/"+dirty.length+" base(s) re-poussée(s) vers KV");
  return ok;
}

// Phase 3 (v23.05) — fusion de deux listes de transactions par id.
// `a` est prioritaire en cas de doublon (local gagne) ; les entrées de `b`
// absentes de `a` sont ajoutées. Multi-appareils safe : ne perd aucune txn.
function unionTxnsById(a, b){
  const out=[]; const seen=new Set();
  (a||[]).forEach(function(t){ if(t && t.id!=null && !seen.has(t.id)){ seen.add(t.id); out.push(t); } });
  (b||[]).forEach(function(t){ if(t && t.id!=null && !seen.has(t.id)){ seen.add(t.id); out.push(t); } });
  return out;
}

// Phase 3 (v23.06) — fusion de deux listes de snapshots par date `d` (upsert).
// `a` (local) prioritaire sur `b` (cloud) en cas de même date ; triée par date.
// Multi-appareils safe : conserve les dates présentes d'un seul côté.
function unionSnapsByDate(a, b){
  const map=new Map();
  (b||[]).forEach(function(s){ if(s && s.d!=null) map.set(s.d, s); });   // cloud d'abord
  (a||[]).forEach(function(s){ if(s && s.d!=null) map.set(s.d, s); });   // local écrase (prioritaire)
  return Array.from(map.values()).sort(function(x,y){ return (x.d||"").localeCompare(y.d||""); });
}

// Phase 3 (v23.08) — fusion de deux séries temporelles [date, …valeurs] par date (row[0]).
// `a` (local/build) d'abord, `b` (KV) écrase en cas de même date → KV prioritaire.
// Multi-appareils safe : conserve les dates présentes d'un seul côté. Triée par date.
function unionSeriesByDate(a, b){
  const map=new Map();
  (a||[]).forEach(function(r){ if(Array.isArray(r) && r[0]!=null) map.set(r[0], r); });
  (b||[]).forEach(function(r){ if(Array.isArray(r) && r[0]!=null) map.set(r[0], r); });
  return Array.from(map.values()).sort(function(x,y){ return (x[0]||"").localeCompare(y[0]||""); });
}

// Phase 3 (v23.10) — fusion des séries MENSUELLES (objets {année:{bom,eom,pnl,…}}).
// Union par année ; pour une année présente des deux côtés, on garde la plus
// COMPLÈTE (le plus de mois renseignés non-null) ; égalité → `b` (KV) prioritaire.
function monthsFilled(yObj){
  if(!yObj || typeof yObj!=="object") return 0;
  const arr = yObj.eom || yObj.pnl || yObj.bom || [];
  return (arr||[]).reduce(function(n,v){ return n + (v!=null?1:0); }, 0);
}
function totalFilled(obj){
  if(!obj || typeof obj!=="object") return 0;
  return Object.keys(obj).reduce(function(n,y){ return n + monthsFilled(obj[y]); }, 0);
}
function unionMonthlyByYear(a, b){
  const out={};
  const years=new Set([].concat(Object.keys(a||{}), Object.keys(b||{})));
  years.forEach(function(y){
    const ya=(a||{})[y], yb=(b||{})[y];
    if(ya && !yb){ out[y]=ya; return; }
    if(yb && !ya){ out[y]=yb; return; }
    out[y] = (monthsFilled(yb) > monthsFilled(ya)) ? yb : (monthsFilled(ya) > monthsFilled(yb) ? ya : yb);
  });
  return out;
}

async function save(k, v){
  // 1. Écriture immédiate dans localStorage
  const ls = lsRead();
  ls[k] = v;
  lsWrite(ls);
  // 2. Sync vers Gist (async, non bloquant)
  gistWrite(ls);  // ls contient maintenant chart + txns
}

/* ─── DAILY DATA from Excel Chart sheet ────────────────
   DD:        [date, wallet_crypto€, total_hors_immo€, BTC$, CGIS$]
              col AO "TOTAL € hors immo" utilisée pour le total
   DB:        [date, J.C. GLOBAL INVESTMENTS, BTC, SP500, Nasdaq, ETH] base100=Jan2023
   GDBS:      [date, CGIS actual$, CGIC actual$]  daily from jan 2026
   PORT_B100: [date, portfolio_hors_immo_base100]  base=Jan2026=€313 653
─────────────────────────────────────────────────────── */


// CGIS et CGIC — cours journaliers [date, cgis$, cgic$]

// GDB.C actual price depuis Jan 2023 [date, gc$]

// GDB.S base100 extended [date, b100|null] — null avant jan 2026

// Portfolio total € base100 = Jan 1 2026 [date, b100_val]

const PORT_B100=[["2026-01-01",100.0],["2026-01-12",103.138],["2026-01-13",103.622],["2026-01-14",105.541],["2026-01-15",106.086],["2026-01-16",106.098],["2026-01-17",106.005],["2026-01-18",106.528],["2026-01-19",105.101],["2026-01-20",107.426],["2026-01-21",105.789],["2026-01-22",106.913],["2026-01-23",106.429],["2026-01-24",106.353],["2026-01-25",104.481],["2026-01-26",104.247],["2026-01-27",104.061],["2026-01-27",103.957],["2026-01-28",102.791],["2026-01-29",102.452],["2026-01-30",99.859],["2026-01-31",99.928],["2026-02-01",97.642],["2026-02-02",96.506],["2026-02-03",97.827],["2026-02-04",96.942],["2026-02-05",93.032],["2026-02-06",90.135],["2026-02-07",92.501],["2026-02-08",92.549],["2026-02-09",92.516],["2026-02-10",92.273],["2026-02-11",90.922],["2026-02-12",91.218],["2026-02-14",92.276],["2026-02-15",93.307],["2026-02-16",92.124],["2026-02-17",91.946],["2026-02-18",91.612],["2026-02-20",93.04],["2026-02-21",93.081],["2026-02-22",93.06],["2026-02-23",91.455],["2026-02-24",89.794],["2026-02-25",91.481],["2026-02-26",93.528],["2026-02-27",93.123],["2026-02-28",90.467],["2026-03-02",92.604],["2026-03-03",94.27],["2026-03-04",95.68],["2026-03-05",97.662],["2026-03-07",93.929],["2026-03-08",93.679],["2026-03-11",95.381],["2026-03-12",96.045],["2026-03-13",97.426],["2026-03-15",96.387],["2026-03-16",97.572],["2026-03-17",97.925],["2026-03-18",98.23],["2026-03-19",95.231],["2026-03-23",92.723],["2026-03-24",94.817],["2026-03-25",94.823],["2026-03-30",92.779],["2026-03-31",92.225],["2026-04-01",92.823],["2026-04-02",92.34],["2026-04-03",92.833],["2026-04-04",93.029],["2026-04-07",94.308],["2026-04-08",95.858],["2026-04-09",96.534],["2026-04-12",96.495],["2026-04-13",95.937],["2026-04-14",98.639],["2026-04-15",98.299],["2026-04-18",101.774],["2026-04-19",100.461],["2026-04-20",100.028],["2026-04-21",101.055],["2026-04-22",102.254],["2026-04-23",102.712],["2026-04-25",102.172],["2026-04-26",102.391],["2026-04-29",101.416],["2026-04-30",100.94],["2026-05-01",101.683],["2026-05-02",103.125],["2026-05-03",103.207],["2026-05-05",105.115],["2026-05-06",105.85],["2026-05-07",106.227],["2026-05-08",104.627]];


/* Helper: date string operations */
const TODAY=todayNC(); // date locale NC (UTC+11)
const parseD=d=>new Date(d+"T00:00:00Z");
const diffDays=(d1,d2)=>Math.round((parseD(d1)-parseD(d2))/(864e5));
const fmtDate=d=>{
  if(!d)return"";
  const[y,m,day]=d.split("-");
  const months=["jan","fév","mar","avr","mai","jun","jul","aoû","sep","oct","nov","déc"];
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
};

/* Filter DD by timeframe key → returns filtered DD rows */
function filterByTF(tf){
  const all=DD.filter(r=>r[0]<=TODAY);
  if(tf==="ALL")return all;
  const last=TODAY;
  if(tf==="1W") return all.filter(r=>diffDays(last,r[0])<=7);
  if(tf==="1M") return all.filter(r=>diffDays(last,r[0])<=31);
  if(tf==="MTD")return all.filter(r=>r[0].slice(0,7)===TODAY.slice(0,7));
  if(tf==="YTD")return all.filter(r=>r[0].startsWith(TODAY.slice(0,4)));
  if(tf==="1Y") return all.filter(r=>diffDays(last,r[0])<=365);
  if(tf==="2Y") return all.filter(r=>diffDays(last,r[0])<=730);
  return all;
}
function filterDB(tf){
  const all=DB.filter(r=>r[0]<=TODAY);
  if(tf==="ALL")return all;
  const last=TODAY;
  if(tf==="1W") return all.filter(r=>diffDays(last,r[0])<=7);
  if(tf==="1M") return all.filter(r=>diffDays(last,r[0])<=31);
  if(tf==="MTD")return all.filter(r=>r[0].slice(0,7)===TODAY.slice(0,7));
  if(tf==="YTD")return all.filter(r=>r[0].startsWith(TODAY.slice(0,4)));
  if(tf==="1Y") return all.filter(r=>diffDays(last,r[0])<=365);
  if(tf==="2Y") return all.filter(r=>diffDays(last,r[0])<=730);
  return all;
}

/* ═══════════════════════════════════════════════════════════
   INTERACTIVE LINE CHART — timeframe selector + date tooltip
   series: [{vals:[v,...], color, label, fmt?}]
   dates: string[] parallel to vals — shown in tooltip on hover
═══════════════════════════════════════════════════════════ */
const TFS=["1W","1M","MTD","YTD","1Y","2Y","ALL"];

function LineChart({series,dates,h=80,legend,defaultTF="ALL",hideTF=false,unit="€",markers}){
  const svgRef=useRef(null);
  const[hover,setHover]=useState(null);
  const[tf,setTF]=useState(defaultTF);

  /* Slice by timeframe — dates array drives the window */
  const sliceByTF=(vals,allDates,tf)=>{
    if(!allDates||tf==="ALL")return{vals,dates:allDates||[]};
    const last=allDates[allDates.length-1]||TODAY;
    let cutoff=last;
    if(tf==="1W")  cutoff=new Date(parseD(last)-7*864e5).toISOString().slice(0,10);
    if(tf==="1M")  cutoff=new Date(parseD(last)-31*864e5).toISOString().slice(0,10);
    if(tf==="MTD") cutoff=last.slice(0,7)+"-01";
    if(tf==="YTD") cutoff=last.slice(0,4)+"-01-01";
    if(tf==="1Y")  cutoff=new Date(parseD(last)-365*864e5).toISOString().slice(0,10);
    if(tf==="2Y")  cutoff=new Date(parseD(last)-730*864e5).toISOString().slice(0,10);
    const startIdx=allDates.findIndex(d=>d>=cutoff);
    const si=startIdx<0?0:startIdx;
    return{vals:vals.slice(si),dates:allDates.slice(si)};
  };

  /* Build sliced series */
  const sliced=series.map(s=>{
    const{vals:sv,dates:sd}=sliceByTF(s.vals,dates,tf);
    return{...s,vals:sv,_dates:sd};
  });

  const allY=sliced.flatMap(s=>s.vals.filter(v=>v!=null));
  if(!allY.length)return null;
  const mn=Math.min(...allY),mx=Math.max(...allY),rng=mx-mn||1;
  const W=300,n=Math.max(...sliced.map(s=>s.vals.length));
  if(n<2)return null;
  const px=i=>i/(n-1)*W;
  const py=v=>h-((v-mn)/rng)*(h-6)+3;

  const getIdx=(clientX,rect)=>{
    const svgX=(clientX-rect.left)*(W/rect.width);
    return Math.min(n-1,Math.max(0,Math.round(svgX/(W/(n-1)))));
  };
  const onMove=ev=>{
    if(!svgRef.current)return;
    const r=svgRef.current.getBoundingClientRect();
    setHover({i:getIdx(ev.clientX,r)});
  };
  const _tm1=useRef(false),_ts1=useRef(0);
  const onTouch=ev=>{
    ev.preventDefault();
    if(!svgRef.current)return;
    const r=svgRef.current.getBoundingClientRect();
    const t=ev.touches[0]||ev.changedTouches[0];
    if(ev.type==="touchstart"){_tm1.current=false;_ts1.current=t.clientX;}
    else{_tm1.current=Math.abs(t.clientX-_ts1.current)>4;}
    setHover({i:getIdx(t.clientX,r)});
  };
  const onTouchEnd1=ev=>{ev.preventDefault();if(!_tm1.current)setHover(null);};

  const hx=hover!=null?px(hover.i):null;
  const hovDate=hover!=null?(sliced[0]?._dates?.[hover.i]||""):null;
  const legH=legend?18:0;
  const grids=[mn,mn+rng*.5,mx];

  /* Format value for tooltip */
  const fv=(v,s)=>{
    if(v==null)return null;
    if(s.pct)return(v>=0?"+":"")+v.toFixed(1)+"%";
    if(v>=1e6)return unit+(v/1e6).toFixed(2)+"M";
    if(v>=1e3)return unit+Math.round(v).toLocaleString("fr-FR");
    return v.toFixed(2);
  };

  return(
    <div style={{position:"relative"}}>
      {/* Timeframe bar */}
      {!hideTF&&(
        <div style={{display:"flex",gap:3,marginBottom:10}}>
          {TFS.map(t=>(
            <button key={t} onClick={()=>{setTF(t);setHover(null);}} style={{
              flex:1,padding:"4px 0",borderRadius:6,fontSize:10,fontWeight:600,letterSpacing:.5,
              border:"none",cursor:"pointer",transition:"background .15s,color .15s",
              background:tf===t?C.gold:"transparent",
              color:tf===t?C.bg:C.text3,
            }}>{t}</button>
          ))}
        </div>
      )}

      {/* Tooltip */}
      {hover!=null&&(
        <div style={{
          position:"absolute",top:hideTF?-2:30,left:"50%",transform:"translateX(-50%)",
          background:"rgba(10,12,18,0.97)",border:`1px solid ${C.border2}`,
          borderRadius:10,padding:"8px 14px",zIndex:50,minWidth:170,
          boxShadow:"0 8px 32px rgba(0,0,0,.7)",pointerEvents:"none",
        }}>
          <div style={{fontSize:11,color:"#fff",fontWeight:600,textAlign:"center",marginBottom:6}}>
            {fmtDate(hovDate)}
          </div>
          {sliced.map((s,si)=>{
            const v=s.vals[hover.i];
            if(v==null)return null;
            const disp=fv(v,s);
            return(
              <div key={si} style={{display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",marginBottom:3}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:8,height:8,borderRadius:2,background:s.color,flexShrink:0}}/>
                  <span style={{fontSize:10,color:C.text2}}> {s.label||""}</span>
                </div>
                <span style={{fontSize:12,fontWeight:600,color:s.color}}>{disp}</span>
              </div>
            );
          })}
          {(markers||[]).filter(function(m){return m && Math.abs(m.i-hover.i)<=1;}).map(function(m,mi){
            return (<div key={"mt"+mi} style={{display:"flex",justifyContent:"space-between",gap:14,marginTop:5,paddingTop:5,borderTop:`1px solid ${C.border}`}}>
              <span style={{fontSize:10,fontWeight:600,color:m.color}}>{m.side==="BUY"?"Achat":"Vente"}{m.qtyTxt?(" "+m.qtyTxt):""}</span>
              <span style={{fontSize:11,fontWeight:600,color:m.color}}>{m.amtTxt||""}</span></div>);
          })}
        </div>
      )}

      <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${h+22+legH}`}
        style={{overflow:"visible",touchAction:"none",userSelect:"none"}}
        onMouseMove={onMove} onMouseLeave={()=>setHover(null)}
        onTouchStart={onTouch} onTouchMove={onTouch} onTouchEnd={onTouchEnd1}>

        {/* Grid */}
        {grids.map((v,i)=>(
          <g key={i}>
            <line x1={0} y1={py(v)} x2={W} y2={py(v)} stroke={C.border} strokeWidth={.4}/>
            <text x={-3} y={py(v)+3} textAnchor="end" fill={C.text3} fontSize={6}>
              {v>=1e6?(v/1e6).toFixed(1)+"M":v>=1000?(v/1000).toFixed(0)+"k":v.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Lines */}
        {sliced.map((s,si)=>{
          const pts=s.vals.map((v,i)=>v!=null?`${px(i)},${py(v)}`:null).filter(Boolean).join(" ");
          return(
            <g key={si}>
              {s.area&&pts&&<polygon points={`0,${h+3} ${pts} ${W},${h+3}`} fill={s.color+"22"} stroke="none"/>}
              <polyline points={pts} fill="none" stroke={s.color}
                strokeWidth={hover!=null&&si===0?2.8:s.bold?2.2:1.5}
                opacity={hover!=null&&si>0?.45:.92}/>
            </g>
          );
        })}

        {/* Markers Buy/Sell (Lot F) */}
        {(markers||[]).map(function(m,mi){
          if(m==null||m.i<0||m.i>=n||m.v==null) return null;
          return (<circle key={"mk"+mi} cx={px(m.i)} cy={py(m.v)} r={m.r||4.5} fill={m.color} stroke={C.bg1} strokeWidth={1.4}/>);
        })}

        {/* Crosshair + dots */}
        {hover!=null&&hx!=null&&(
          <g>
            <line x1={hx} y1={2} x2={hx} y2={h} stroke="rgba(255,255,255,.15)" strokeWidth={1} strokeDasharray="3,3"/>
            {sliced.map((s,si)=>{
              const v=s.vals[hover.i];
              if(v==null)return null;
              return(
                <g key={si}>
                  <circle cx={hx} cy={py(v)} r={5} fill={C.bg1} stroke={s.color} strokeWidth={2.2}/>
                  <circle cx={hx} cy={py(v)} r={2} fill={s.color}/>
                </g>
              );
            })}
          </g>
        )}

        {/* X axis — show date label only on first, hover, last */}
        {sliced[0]?._dates?.map((d,i)=>{
          const n2=sliced[0]._dates.length;
          const isFirst=i===0,isLast=i===n2-1,isHov=hover?.i===i;
          const step=Math.max(1,Math.floor(n2/6));
          const show=isFirst||isLast||isHov||(i%step===0);
          if(!show)return null;
          const label=tf==="1W"||tf==="1M"||tf==="MTD"
            ?d.slice(5).replace("-","/")   // MM/DD
            :d.slice(2,7).replace("-","/"); // YY/MM
          return(
            <text key={i} x={px(i)} y={h+14} textAnchor="middle"
              fill={isHov?"#fff":C.text3} fontSize={isHov?7:5.5} fontWeight={isHov?700:400}>
              {label}
            </text>
          );
        })}

        {/* Legend */}
        {legend&&legend.map((l,i)=>(
          <g key={i} transform={`translate(${i*90},${h+22})`}>
            <rect x={0} y={1} width={12} height={2} fill={l.color} rx={1}/>
            <text x={16} y={5} fill={C.gray} fontSize={7}>{l.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   INTERACTIVE BAR CHART — tap bar → highlight + tooltip
═══════════════════════════════════════════════════════════ */
function BarChart({pcts,months,pnls,h=44}){
  const[sel,setSel]=useState(null);
  if(!pcts?.length)return null;
  const n=pcts.length,W=300,bw=Math.floor(W/n)-3;
  const maxA=Math.max(...pcts.map(Math.abs),.001);

  return(
    <div style={{position:"relative"}}>
      {sel!=null&&(
        <div style={{
          position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",
          background:"rgba(14,17,24,0.97)",border:`1px solid ${C.border2}`,
          borderRadius:10,padding:"8px 14px",zIndex:50,textAlign:"center",
          boxShadow:"0 4px 20px rgba(0,0,0,.6)",pointerEvents:"none",minWidth:100,
        }}>
          <div style={{fontSize:11,fontWeight:600,color:C.text}}>{months?.[sel]}</div>
          <div style={{fontSize:14,fontWeight:700,color:clr(pcts[sel])}}>{fmtP(pcts[sel])}</div>
          {pnls&&<div style={{fontSize:11,color:clr(pnls[sel]),marginTop:2}}>
            {pnls[sel]>=0?"+":""}€{fmt(Math.abs(pnls[sel]))}
          </div>}
        </div>
      )}
      <svg width="100%" viewBox={`0 0 ${W} ${h+18}`} style={{overflow:"visible",cursor:"pointer"}}>
        {pcts.map((v,i)=>{
          const bh=Math.max(Math.abs(v)/maxA*h*.88,1),x=i*(W/n)+1,pos=v>=0;
          const isActive=sel===i;
          return(
            <g key={i} onClick={()=>setSel(sel===i?null:i)} style={{cursor:"pointer"}}>
              <rect x={x-1} y={0} width={bw+2} height={h+2} fill="transparent"/>
              <rect x={x} y={pos?h-bh:h} width={bw} height={bh}
                fill={clr(v)} rx={2}
                opacity={sel==null?0.85:isActive?1:0.35}
                transform={isActive?`translate(0,-2)`:""}
                style={{transition:"opacity .15s,transform .15s"}}/>
              {months&&<text x={x+bw/2} y={h+14} textAnchor="middle"
                fill={isActive?"#fff":C.gray} fontSize={isActive?7:6} fontWeight={isActive?700:400}>
                {months[i]}
              </text>}
            </g>
          );
        })}
        <line x1={0} y1={h} x2={W} y2={h} stroke={C.border2} strokeWidth={.5}/>
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   INTERACTIVE DONUT — touch segment → highlight + center info
═══════════════════════════════════════════════════════════ */
function Donut({data,size=160,ri=30,label,sub}){
  const[sel,setSel]=useState(null);
  const cx=size/2,cy=size/2,R=size/2-7;
  // Normalize so values always sum to exactly 1.0 — no gap
  const total=data.reduce((s,d)=>s+d.v,0)||1;
  let cum=0;
  const sl=data.map((d,i)=>{const s=cum;cum+=d.v/total;return{...d,v:d.v/total,s,e:cum,i};});

  const arc=(s,e,r,expand=false)=>{
    const mid=(s+e)/2;
    const ox=expand?Math.cos(mid*2*Math.PI-Math.PI/2)*4:0;
    const oy=expand?Math.sin(mid*2*Math.PI-Math.PI/2)*4:0;
    const a1=s*2*Math.PI-Math.PI/2,a2=e*2*Math.PI-Math.PI/2;
    const x1=cx+ox+r*Math.cos(a1),y1=cy+oy+r*Math.sin(a1);
    const x2=cx+ox+r*Math.cos(a2),y2=cy+oy+r*Math.sin(a2);
    return `M${cx+ox},${cy+oy}L${x1},${y1}A${r},${r},0,${(e-s)>.5?1:0},1,${x2},${y2}Z`;
  };

  const active=sel!=null?data[sel]:null;

  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{cursor:"pointer"}}>
        {sl.map((s,i)=>{
          const isActive=sel===i;
          return(
            <path key={i} d={arc(s.s,s.e,R,isActive)}
              fill={s.c}
              opacity={sel==null?0.9:isActive?1:0.3}
              stroke={isActive?C.bg:"none"} strokeWidth={isActive?2:0}
              style={{transition:"opacity .2s"}}
              onClick={()=>setSel(sel===i?null:i)}/>
          );
        })}
        {/* Inner circle */}
        <circle cx={cx} cy={cy} r={ri+2} fill={C.bg}/>
        {/* Center text: default or active segment */}
        {active==null?(
          <>
            {label&&<text x={cx} y={cy-6} textAnchor="middle" fill="#fff" fontSize={9} fontWeight="700">{label}</text>}
            {sub&&<text x={cx} y={cy+8} textAnchor="middle" fill={C.btc} fontSize={9} fontWeight="700">{sub}</text>}
          </>
        ):(
          <>
            <text x={cx} y={cy-8} textAnchor="middle" fill={active.c} fontSize={8} fontWeight="800">{active.n||label}</text>
            <text x={cx} y={cy+4} textAnchor="middle" fill="#fff" fontSize={10} fontWeight="800">
              {active.pct!=null?(active.pct.toFixed(1)+"%"):(active.v*100).toFixed(1)+"%"}
            </text>
            {active.usd&&<text x={cx} y={cy+15} textAnchor="middle" fill={C.gray} fontSize={7}>${fmtK(active.usd)}</text>}
          </>
        )}
      </svg>
      {/* Tap-to-dismiss hint */}
      {sel!=null&&(
        <div style={{fontSize:9,color:C.gray,marginTop:4}}>
          Appuyer à nouveau pour fermer
        </div>
      )}
    </div>
  );
}

/* ─── UI ATOMS ──────────────────────────────────────────── */
const SC=({label,val,color,sub,small})=>(
  <div style={{background:C.bg2,borderRadius:10,padding:"10px 12px",border:`1px solid ${C.border}`}}>
    <div style={{fontSize:9,color:C.gray,marginBottom:3,textTransform:"uppercase",letterSpacing:.5}}>{label}</div>
    <div style={{fontSize:small?13:16,fontWeight:600,color:color||C.text,lineHeight:1.1}}>{val}</div>
    {sub&&<div style={{fontSize:10,color:C.text3,marginTop:2}}>{sub}</div>}
  </div>
);
const SH=({label,right,color})=>(
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,marginTop:16}}>
    <span style={{fontSize:10,fontWeight:600,color:color||C.gray,textTransform:"uppercase",letterSpacing:.8}}>{label}</span>
    {right&&<span style={{fontSize:13,fontWeight:600,color:color||C.text}}>{right}</span>}
  </div>
);
const crd=(x={})=>({
  background: C.radius===16
    ? `linear-gradient(135deg,${C.bg1} 0%,${C.bg2} 100%)`
    : C.name==="Bitcoin Maximalist"
      ? `linear-gradient(135deg,${C.bg2},${C.bg3})`
      : C.name==="❄ Frozen Throne"
      ? `linear-gradient(135deg,${C.bg1} 0%,${C.bg2} 100%)`
      : C.name==="🌴 Tropical"
      ? `linear-gradient(135deg,${C.bg1} 0%,${C.bg2} 100%)`
      : C.bg1,
  borderRadius:C.radius||12,
  padding:"12px 14px",
  border:`1px solid ${C.border}`,
  boxShadow: C.radius===16
    ? `0 4px 24px rgba(180,100,240,.06),inset 0 1px 0 rgba(212,168,67,.08)`
    : C.name==="❄ Frozen Throne"
      ? `0 2px 16px rgba(0,212,255,.06),inset 0 1px 0 rgba(125,216,255,.08)`
      : C.name==="🌴 Tropical"
      ? `0 2px 12px rgba(0,194,199,.08)`
      : C.name==="Bitcoin Maximalist"
        ? `0 2px 16px rgba(247,147,26,.06)`
        : "none",
  marginBottom:7,
  ...x,
});
const Modal=({title,onClose,children})=>(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.82)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:300}}>
    <div style={{background:C.bg1,borderRadius:"20px 20px 0 0",width:"100%",maxWidth:430,maxHeight:"92vh",overflowY:"auto",padding:"20px 20px 48px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <span style={{fontSize:16,fontWeight:600}}>{title}</span>
        <button onClick={onClose} style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,width:32,height:32,color:C.text2,fontSize:18,cursor:"pointer"}}>×</button>
      </div>
      {children}
    </div>
  </div>
);
const FI=({label,value,onChange,type="text",placeholder=""})=>{
  const [foc,setFoc]=React.useState(false);
  return (
  <div style={{marginBottom:13}}>
    <div style={{fontSize:9.5,letterSpacing:1.5,textTransform:"uppercase",color:C.text2,marginBottom:6}}>{label}</div>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      onFocus={()=>setFoc(true)} onBlur={()=>setFoc(false)}
      style={{width:"100%",background:C.bg,border:`1px solid ${foc?C.gold:C.border2}`,borderRadius:9,padding:"11px 12px",color:C.text,fontSize:16,outline:"none",transition:"border-color .15s",boxSizing:"border-box"}}/>
  </div>
  );
};
const FS=({label,value,onChange,options})=>{
  const [foc,setFoc]=React.useState(false);
  return (
  <div style={{marginBottom:13}}>
    <div style={{fontSize:9.5,letterSpacing:1.5,textTransform:"uppercase",color:C.text2,marginBottom:6}}>{label}</div>
    <select value={value} onChange={e=>onChange(e.target.value)}
      onFocus={()=>setFoc(true)} onBlur={()=>setFoc(false)}
      style={{width:"100%",background:C.bg,border:`1px solid ${foc?C.gold:C.border2}`,borderRadius:9,padding:"11px 12px",color:C.text,fontSize:16,outline:"none",transition:"border-color .15s",boxSizing:"border-box"}}>
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  </div>
  );
};
const Btn=({label,onClick,color,full,outline,snd})=>(
  <button onClick={onClick} data-snd={snd} style={{background:outline?"transparent":(color||C.gold),border:`1px solid ${color||C.gold}`,borderRadius:10,padding:"12px 20px",color:outline?(color||C.gold):"#0B0A08",fontWeight:600,fontSize:13,cursor:"pointer",width:full?"100%":"auto",marginBottom:full?8:0}}>{label}</button>
);

/* ═══════════════════════════════════════════════════════════
   #71 — Animations sonores de navigation (Web Audio, sans fichiers)
   Sons courts et discrets synthétisés. Activable dans Réglages.
   Un routeur de clic global unique choisit le son via data-snd :
   home / back / txn / none, défaut = clic léger sur tout bouton.
═══════════════════════════════════════════════════════════ */
var cgiSound = (function(){
  var ctx=null, master=null, noiseBuf=null, enabled=true;
  try{ enabled = (localStorage.getItem("cgi_sound")!=="0"); }catch(e){}
  function ac(){
    if(ctx) return ctx;
    try{
      var AC = window.AudioContext || window.webkitAudioContext; if(!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      // petit buffer de bruit (~28 ms) réutilisé pour chaque clic
      var n = Math.max(1, Math.floor(ctx.sampleRate * 0.028));
      noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for(var i=0;i<n;i++){ d[i] = (Math.random()*2-1) * (1 - i/n); } // bruit décroissant
    }catch(e){ ctx=null; }
    return ctx;
  }
  // Clic court, doux et percussif — à la manière d'une touche de clavier iPhone.
  function keyclick(){
    var c=ac(); if(!c) return;
    if(c.state==="suspended"){ try{ c.resume(); }catch(e){} }
    var t=c.currentTime;
    var src=c.createBufferSource(); src.buffer=noiseBuf;
    var bp=c.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=2200; bp.Q.value=0.7;
    var lp=c.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=5200;
    var g=c.createGain();
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(0.16, t+0.0015);  // attaque quasi instantanée
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.026); // déclin ~25 ms
    src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(master||c.destination);
    src.start(t); src.stop(t+0.05);
  }
  // Vibration légère (mobile — Android/standard ; iOS Safari n'expose pas l'API).
  function haptic(){ try{ if(navigator&&typeof navigator.vibrate==="function") navigator.vibrate(8); }catch(e){} }
  function tap(){ if(!enabled) return; keyclick(); haptic(); }
  return {
    isOn:function(){ return enabled; },
    setOn:function(v){ enabled=!!v; try{ localStorage.setItem("cgi_sound", v?"1":"0"); }catch(e){} if(v) tap(); },
    toggle:function(){ this.setOn(!enabled); return enabled; },
    tap:tap,
    // Un seul et même clic partout (les anciens sons distincts sont supprimés).
    click:tap, back:tap, home:tap, transaction:tap,
  };
})();
if(typeof window!=="undefined") window.cgiSound = cgiSound;

// Routeur de clic global : un seul écouteur (capture), son choisi via data-snd.
if(typeof document!=="undefined" && !window.__cgiSndBound){
  window.__cgiSndBound = true;
  document.addEventListener("click", function(ev){
    try{
      if(!cgiSound.isOn()) return;
      var snd=null, hit=null;
      for(var n=ev.target; n && n!==document; n=n.parentElement){
        if(n.getAttribute){
          var ds=n.getAttribute("data-snd"); if(ds && snd===null){ snd=ds; if(!hit) hit=n; }
          var role=n.getAttribute("role"); var tag=(n.tagName||"").toLowerCase();
          if(!hit && (tag==="button"||tag==="a"||role==="button")) hit=n;
        }
        if(snd!==null) break;
      }
      if(!hit) return;
      // Heuristique « retour » : croix de fermeture / boutons explicites
      if(snd===null){
        var txt=((hit.textContent||"").trim());
        var ttl=((hit.getAttribute&&(hit.getAttribute("title")||hit.getAttribute("aria-label")))||"");
        if(txt==="\u00D7"||txt==="\u2715"||txt==="\u2717"||txt==="\u2039"||txt==="\u25C0"||/retour|fermer|back|close|annuler/i.test(ttl)) snd="back";
      }
      if(snd==="home") cgiSound.home();
      else if(snd==="back") cgiSound.back();
      else if(snd==="txn") cgiSound.transaction();
      else if(snd==="none"){ /* silencieux explicite */ }
      else cgiSound.click();
    }catch(e){}
  }, true);
}


/* ═══════════════════════════════════════════════════════════
   TICKER MODAL — chart courbe + infos live via Cloudflare proxy
═══════════════════════════════════════════════════════════ */
const TF_CONFIG = [
  { label:"1h",  interval:"5m",   range:"1d"   },
  { label:"4h",  interval:"15m",  range:"5d"   },
  { label:"1J",  interval:"1h",   range:"5d"   },
  { label:"1S",  interval:"1d",   range:"1mo"  },
  { label:"1M",  interval:"1d",   range:"3mo"  },
  { label:"1A",  interval:"1wk",  range:"1y"   },
  { label:"5A",  interval:"1mo",  range:"5y"   },
  { label:"ALL", interval:"3mo",  range:"max"  },
];

// Timeframes CoinGecko : days valides = 1,7,14,30,90,180,365,max
// Mapping TF_CONFIG index → days CoinGecko
const TF_CG_DAYS = ["1","7","7","14","30","365","1825","max"];

// #60/#72b — SOURCE UNIFIÉE des trades : les exécutions IBKR (fills réels, précis) remplacent
// les saisies manuelles couvrant le même (ticker, sens, jour ±1) ; les ajustements ibkradj
// deviennent redondants dès que l'archive couvre le même (ticker, sens). Affichage uniquement.
function mergeTradesIbkrPriority(txns, ibkrTrades){
  const ib=(ibkrTrades||[]).filter(function(x){return x&&x.symbol;}).map(function(x){
    return {id:"ibkrx_"+(x.tradeID||x.date+"_"+x.qty), date:x.date, side:(x.side||"").toUpperCase(),
      ticker:(x.symbol||"").split(" ")[0].toUpperCase(), qty:Math.abs(x.qty||0), price:x.price,
      valueUSD:Math.round(Math.abs((x.qty||0)*(x.price||0))*100)/100, currency:x.currency||"USD", src:"ibkr", _ibkr:true};
  });
  const cover=new Set(), coverTS=new Set();
  ib.forEach(function(x){ cover.add(x.ticker+"|"+x.side);
    [-1,0,1].forEach(function(d){ try{
      const dt=new Date(new Date(x.date+"T00:00:00").getTime()+d*864e5).toISOString().slice(0,10);
      coverTS.add(x.ticker+"|"+x.side+"|"+dt); }catch(e){} }); });
  const kept=(txns||[]).filter(function(t){
    if(!t||!t.ticker) return false;
    const k=(t.ticker||"").toUpperCase(), sd=(t.side||"").toUpperCase();
    if(String(t.id||"").indexOf("ibkradj_")===0) return !cover.has(k+"|"+sd);
    return !coverTS.has(k+"|"+sd+"|"+t.date);
  });
  return kept.concat(ib).sort(function(a,b){ return (a.date||"")<(b.date||"")?-1:1; });
}
// #60 — Flux cash par devise : chaque ACHAT consomme du cash (sortie), chaque VENTE en génère (entrée).
function CashFlowModal({ cur="USD", trades=[], hidden=false, onClose }){
  const sym = cur==="EUR" ? "€" : "$";
  const rows = (trades||[]).filter(function(t){ return (t.currency||"USD").toUpperCase()===cur; })
    .slice().sort(function(a,b){ return (a.date||"")<(b.date||"")?1:-1; });
  let inn=0, out=0;
  rows.forEach(function(t){ const v=Math.abs(t.valueUSD!=null?t.valueUSD:(t.qty||0)*(t.price||0));
    if((t.side||"").toUpperCase()==="SELL") inn+=v; else out+=v; });
  const fV=function(v){ return sym+Math.round(v).toLocaleString("fr-FR"); };
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:80,background:"rgba(0,0,0,.72)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={function(e){e.stopPropagation();}} style={{width:"100%",maxWidth:560,maxHeight:"82vh",overflowY:"auto",background:C.bg2,border:`1px solid ${C.border2}`,borderRadius:"16px 16px 0 0",padding:"16px 16px 28px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
          <div style={{fontSize:15,fontWeight:700,color:C.text}}>Flux cash · {cur==="EUR"?"IBKR Euro":"Cash Dip (USD)"}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.text3,fontSize:20,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        <div style={{fontSize:11,color:C.text3,marginBottom:12}}>Chaque achat consomme du cash, chaque vente en génère. Source unifiée (IBKR prioritaire), mise à jour automatique.</div>
        <div style={{display:"flex",gap:8,marginBottom:14,fontSize:12}}>
          <span style={{color:C.text2}}>Entrées <b style={{color:C.green}}>{msk("+"+fV(inn),hidden)}</b></span>
          <span style={{color:C.text2}}>Sorties <b style={{color:C.red}}>{msk("−"+fV(out),hidden)}</b></span>
          <span style={{color:C.text2}}>Net <b style={{color:(inn-out)>=0?C.green:C.red}}>{msk((inn-out>=0?"+":"−")+fV(Math.abs(inn-out)),hidden)}</b></span>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {rows.map(function(t,i){
            const sell=(t.side||"").toUpperCase()==="SELL";
            const v=Math.abs(t.valueUSD!=null?t.valueUSD:(t.qty||0)*(t.price||0));
            return (
              <div key={t.id||i} style={{display:"flex",alignItems:"center",gap:8,fontSize:11,borderBottom:`1px solid ${C.border}`,paddingBottom:7}}>
                <span style={{fontSize:9,fontWeight:700,color:sell?C.green:C.red,border:`1px solid ${(sell?C.green:C.red)}55`,borderRadius:5,padding:"1px 6px",minWidth:42,textAlign:"center"}}>{sell?"VENTE":"ACHAT"}</span>
                {t._ibkr && <span style={{fontSize:8,fontWeight:700,color:C.gold,border:`1px solid ${C.gold}55`,borderRadius:5,padding:"1px 5px"}}>IBKR</span>}
                <span style={{color:C.text3,minWidth:62}}>{t.date}</span>
                <span style={{fontWeight:600,color:C.text,minWidth:52}}>{(t.ticker||"").toUpperCase()}</span>
                <span style={{color:C.text3,fontSize:10}}>{Math.abs(t.qty||0).toLocaleString("fr-FR",{maximumFractionDigits:4})} @ {sym}{Number(t.price||0).toFixed(2)}</span>
                <span style={{flex:1,textAlign:"right",fontWeight:700,color:sell?C.green:C.red}}>{msk((sell?"+":"−")+fV(v),hidden)}</span>
              </div>);
          })}
          {rows.length===0 && <div style={{textAlign:"center",color:C.text3,fontSize:13,padding:24}}>Aucun flux {cur} enregistré.</div>}
        </div>
      </div>
    </div>
  );
}
// #83 — Fenêtre banque (Cash Matelas) : courbe de l'évolution du solde de la banque au fil des
// snapshots, sans news (une banque n'est pas un ticker). Source : cgi_bank_hist (soldes datés).
function BankModal({ bank, label, valueEUR=0, eur=false, usdEur=0.92, hidden=false, onClose }){
  const cur = eur ? "€" : "$";
  const conv = v => eur ? v : v*(1/(usdEur||0.92));
  const hist = React.useMemo(function(){
    let h=[]; try{ h=JSON.parse(localStorage.getItem('cgi_bank_hist')||'[]'); }catch(e){}
    const key=(bank||"").toUpperCase();
    const pts=(h||[]).map(function(x){ if(!x||!x.bk) return null;
      const kk=Object.keys(x.bk).find(k=>k.toUpperCase()===key); if(kk==null) return null;
      const val=x.bk[kk]; if(val==null) return null; return {d:x.d, v:val}; }).filter(Boolean);
    // point courant (aujourd'hui) si absent
    const today=new Date().toISOString().slice(0,10);
    if(!pts.length || pts[pts.length-1].d!==today) pts.push({d:today, v:valueEUR});
    return pts;
  }, [bank, valueEUR]);
  const W=300,H=90,PL=6,PR=6,PT=8,PB=8;
  const vals=hist.map(p=>p.v);
  const mn=Math.min(...vals), mx=Math.max(...vals), rng=(mx-mn)||1;
  const n=hist.length;
  const px=i=> PL + (n>1? i/(n-1):0.5)*(W-PL-PR);
  const py=v=> H-PB - ((v-mn)/rng)*(H-PT-PB);
  const line = hist.map((p,i)=>`${px(i).toFixed(1)},${py(p.v).toFixed(1)}`).join(" ");
  const first=vals[0], last=vals[vals.length-1], delta=last-first, up=delta>=0;
  const fV=v=>cur+Math.round(conv(v)).toLocaleString("fr-FR");
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:80,background:"rgba(0,0,0,.72)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:560,maxHeight:"82vh",overflowY:"auto",background:C.bg2,border:`1px solid ${C.border2}`,borderRadius:"16px 16px 0 0",padding:"16px 16px 28px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
          <div style={{fontSize:15,fontWeight:700,color:C.text}}>{label||bank} <span style={{fontSize:11,color:C.text3,fontWeight:400}}>· Cash Matelas</span></div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.text3,fontSize:20,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:2}}>
          <div style={{fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:30,color:C.text,fontVariantNumeric:"tabular-nums"}}>{msk(fV(valueEUR),hidden)}</div>
          {n>1 && <div style={{fontSize:12,fontWeight:600,color:up?C.green:C.red}}>{up?"▲":"▼"} {msk((up?"+":"−")+fV(Math.abs(delta)).slice(1),hidden)}</div>}
        </div>
        <div style={{fontSize:11,color:C.text3,marginBottom:12}}>Évolution du solde · {n} relevé{n>1?"s":""} (snapshots)</div>
        {n>1 ? (
          <svg width="100%" height="110" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:"block",marginBottom:6}}>
            <polyline points={line} fill="none" stroke={up?C.green:C.red} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <div style={{textAlign:"center",color:C.text3,fontSize:12,padding:"22px 0"}}>Pas encore d'historique — les soldes s'enregistrent à chaque snapshot. Modifie puis fais un snapshot pour alimenter la courbe.</div>
        )}
        <div style={{fontSize:10,color:C.text3,marginTop:8,fontStyle:"italic"}}>Aucune actualité affichée : {label||bank} est un établissement bancaire, pas un instrument coté.</div>
      </div>
    </div>
  );
}
function TickerModal({ ticker, cat="", row=null, eur=false, usdEur=0.86, onClose }) {
  // #73 — quantité TOUJOURS lue depuis la position live du portefeuille (source unique) ;
  // la row transmise par la ligne pouvait être un instantané pré-rebuild (AXON 12,5 vs 10,5).
  try{
    const _src2=(typeof EFF!=="undefined"&&EFF)||(typeof CURRENT!=="undefined"&&CURRENT)||null;
    const _pool=_src2 ? [].concat((_src2.stocks&&_src2.stocks.items)||[], (_src2.crypto&&_src2.crypto.items)||[], (_src2.portfolio&&_src2.portfolio.items)||[]) : [];
    const _liveRow=_pool.find(x=>x&&String(x.t||x.ticker||"").toUpperCase()===String(ticker||"").toUpperCase());
    if(_liveRow){ row = Object.assign({}, row||{}, { qty:_liveRow.qty, pa:((row&&row.pa!=null)?row.pa:_liveRow.pa), live:(_liveRow.live!=null?_liveRow.live:((row&&row.live))) }); }
  }catch(e){}
  const isCrypto = cat === "Crypto" || !!(CG_MAP[ticker]);
  const cgId     = CG_MAP[ticker] || ticker.toLowerCase();
  const yfSym    = YF_MAP[ticker] || ticker;

  const [tf, setTf]         = useState(3);
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState(null);
  const [showCity, setShowCity] = useState(false);
  const [dragY, setDragY]   = useState(0);
  const touchStartY = useRef(null);
  const sheetRef    = useRef(null);
  const [crosshair, setCrosshair] = useState(null); // {i, x, y, price, ts}
  const svgRef = useRef(null);
  const [holdingsOpen, setHoldingsOpen] = useState(false);
  const [kpis, setKpis] = useState([]); // v4.0 LOT4 — indicateurs clés
  // ── #3 — Position + historique des trades du ticker ──
  const [posEdit, setPosEdit] = useState(false);
  const [posData, setPosData] = useState(()=>{ try{ return lsv9Get('cgi_pos_'+ticker)||{}; }catch(e){ return {}; } });
  const savePos = (patch)=>{ const next={...posData,...patch}; setPosData(next); try{ lsv9Set('cgi_pos_'+ticker, next); }catch(e){} };
  const tkTrades = getTickerTrades(ticker);
  const pos = (()=>{
    let buyQ=0, buyV=0, sellQ=0, firstBuy=null;
    tkTrades.forEach(t=>{ const q=Math.abs(t.qty||0), p=t.price||0;
      if(t.side==="BUY"){ buyQ+=q; buyV+=q*p; if(!firstBuy) firstBuy=t.date; }
      else if(t.side==="SELL"){ sellQ+=q; } });
    return { netQ:buyQ-sellQ, pru:buyQ>0?buyV/buyQ:null, firstBuy };
  })();
  const holdDays = pos.firstBuy ? Math.round((Date.now()-new Date(pos.firstBuy).getTime())/86400000) : null;
  const fmtHold = d => d==null?"—":(d>=60?Math.round(d/30)+" mois":d+" j");
  const _cur = eur?"€":"$";
  const curPrice = (()=>{
    if(data?.price!=null && !isNaN(Number(data.price))) return Number(data.price);
    const c=data?.candles; if(Array.isArray(c)&&c.length){ const k=c[c.length-1]; const v=k.close??k.c??k.value; if(v!=null) return Number(v); }
    if(row && row.qty) return row.valUSD/row.qty;   // crypto/manuel : NAV depuis la ligne
    return null;
  })();
  // Position affichée : depuis les trades si présents, sinon depuis la LIGNE (crypto saisi manuellement)
  const hasTrades = tkTrades.length>0;
  const dispNetQ = hasTrades ? pos.netQ : (row && row.qty!=null ? row.qty : null);
  const dispPru  = hasTrades ? pos.pru  : (row && row.pa!=null ? row.pa : null);
  // Objectifs de vente multiples (migration depuis l'ancien champ unique)
  const targets = Array.isArray(posData.targets) ? posData.targets : (posData.target!=null&&posData.target!=="" ? [String(posData.target)] : []);
  const setTargets = (arr)=>savePos({targets:arr, target:undefined});
  // v4.0 LOT4 — récupère le plan d'investissement (zones) depuis le watchlist
  const wlPlan = (()=>{
    try{
      const arr=JSON.parse(localStorage.getItem("cgi_watchlist_direct")||"[]");
      return Array.isArray(arr)?(arr.find(x=>x.ticker===ticker)||null):null;
    }catch(e){ return null; }
  })();
  const planZones = (()=>{
    const z=[];
    if(wlPlan){
      if(wlPlan.buyZone&&wlPlan.buyZone.low!=null)  z.push({price:wlPlan.buyZone.low, color:C.green||"#22C55E", title:"Achat min"});
      if(wlPlan.buyZone&&wlPlan.buyZone.high!=null) z.push({price:wlPlan.buyZone.high,color:C.green||"#22C55E", title:"Achat max", dashed:true});
      (wlPlan.sellTargets||[]).forEach((st,i)=>{ if(st.price!=null) z.push({price:st.price,color:C.red||"#EF4444",title:"Cible "+(i+1)}); });
    }
    return z;
  })();

  // Bloquer le scroll du body quand le modal est ouvert
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Pour crypto : métriques chargées une seule fois (cachées KV côté worker)
  // OHLC rechargé à chaque changement de TF (endpoint léger séparé)
  const [cgMeta, setCgMeta] = useState(null); // métriques CoinGecko persistées

  const fetchChart = async (tfIdx) => {
    setLoading(true); setErr(null);
    try {
      if(isCrypto){
        // ── Métriques : uniquement si pas encore chargées ──────────────────
        let meta = cgMeta;
        if(!meta){
          const mUrl = CF_WORKER_URL + "/coingecko-coin?id=" + encodeURIComponent(cgId)
            + "&symbol=" + encodeURIComponent(ticker);
          const mr = await fetch(mUrl, { headers:{"X-Auth-Key":CF_AUTH_KEY}, signal:AbortSignal.timeout(15000) });
          const md = await mr.json();
          if(md.error) throw new Error("CoinGecko meta ["+cgId+"] : "+md.error);
          meta = md;
          setCgMeta(md);
          // Logo CoinGecko → ICON_DB.fmp
          if(md.logoUrl && !ICON_DB[ticker]?.fmp){
            setIconDb(ticker, { fmp: md.logoUrl });
            fetch(CF_WORKER_URL+"/write-bases", {
              method:"POST", headers:{"Content-Type":"application/json","X-Auth-Key":CF_AUTH_KEY},
              body:JSON.stringify({cgi_icons:serializeIconDb()}), signal:AbortSignal.timeout(10000),
            }).catch(()=>{});
          }
        }
        // ── OHLC : Yahoo Finance (pas de rate-limit) ───────────────────────
        const { interval, range } = TF_CONFIG[tfIdx];
        const oUrl = CF_WORKER_URL + "/yahoo-chart?symbol=" + encodeURIComponent(yfSym)
          + "&interval=" + interval + "&range=" + range;
        const or = await fetch(oUrl, { headers:{"X-Auth-Key":CF_AUTH_KEY}, signal:AbortSignal.timeout(10000) });
        const od = await or.json();
        if(od.error) throw new Error("Yahoo chart ["+yfSym+"] : "+od.error);
        // Fusionner métriques CoinGecko + candles Yahoo
        setData({ ...meta, candles: od.candles || [], ohlcDays: range });
      } else {
        // ── Yahoo Finance path ──────────────────────────────────────────────
        const { interval, range } = TF_CONFIG[tfIdx];
        const url = CF_WORKER_URL + "/yahoo-chart?symbol=" + encodeURIComponent(yfSym)
          + "&interval=" + interval + "&range=" + range;
        const r = await fetch(url, { headers: { "X-Auth-Key": CF_AUTH_KEY } });
        const d = await r.json();
        if(d.error) throw new Error(d.error);
        if(d.logoUrl && !ICON_DB[ticker]?.fmp){
          setIconDb(ticker, { fmp: d.logoUrl });
          fetch(CF_WORKER_URL+"/write-bases", {
            method:"POST",
            headers:{"Content-Type":"application/json","X-Auth-Key":CF_AUTH_KEY},
            body: JSON.stringify({ cgi_icons: serializeIconDb() }),
            signal: AbortSignal.timeout(18000),
          }).catch(()=>{});
        }
        setData(d);
      }
    } catch(e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchChart(tf); }, [ticker, tf]);

  // Tri news par pertinence avec le ticker
  const scoreNews = (newsArr) => {
    if(!newsArr || !newsArr.length) return [];
    const tkLow    = ticker.toLowerCase();
    const nameLow  = (data?.name || "").toLowerCase().split(" ").filter(w=>w.length>3);
    // Secteur / industrie → mots-clés de 4+ chars
    const secWords = (data?.sector   || "").toLowerCase().split(/[\s/&,]+/).filter(w=>w.length>3);
    const indWords = (data?.industry || "").toLowerCase().split(/[\s/&,]+/).filter(w=>w.length>3);
    // Top holdings ETF : liste ordonnée, pondération décroissante (rang 0 = poids max)
    const holdings = (data?.topHoldings || []);
    const holdN    = holdings.length;
    return [...newsArr].sort((a,b)=>{
      const score = (n, idx) => {
        const t = (n.title||"").toLowerCase();
        let s = 0;
        // Ticker exact : +10
        if(t.includes(tkLow)) s += 10;
        // Mots du nom de la société : +3 chacun
        nameLow.forEach(w => { if(t.includes(w)) s += 3; });
        // Secteur : +2 par mot-clé trouvé
        secWords.forEach(w => { if(t.includes(w)) s += 2; });
        // Industrie : +1.5 par mot-clé trouvé
        indWords.forEach(w => { if(t.includes(w)) s += 1.5; });
        // ETF top holdings : pondération décroissante par rang
        // holding[0] → +4, holding[1] → +3.6, …, holding[N-1] → poids minimal ~1
        if(holdN > 0){
          holdings.forEach((h, ri) => {
            const hLow = (h.name||h.symbol||"").toLowerCase();
            if(hLow.length > 2 && t.includes(hLow)){
              const weight = holdN === 1 ? 4 : 4 * (1 - ri / holdN * 0.75);
              s += weight;
            }
          });
        }
        return s;
      };
      return score(b) - score(a);
    });
  };

  // Drapeaux pays (emoji)
  const FLAG = {
    US:"🇺🇸", GB:"🇬🇧", FR:"🇫🇷", IT:"🇮🇹", DE:"🇩🇪",
    NL:"🇳🇱", BE:"🇧🇪", CA:"🇨🇦", AU:"🇦🇺", HK:"🇭🇰",
    CN:"🇨🇳", JP:"🇯🇵", FX:"💱", CRYPTO:"₿",
  };

  const fmtMktCap = v => {
    if(!v) return null;
    if(v >= 1e12) return (v/1e12).toFixed(2)+"T";
    if(v >= 1e9)  return (v/1e9).toFixed(1)+"B";
    if(v >= 1e6)  return (v/1e6).toFixed(0)+"M";
    return v.toLocaleString("fr-FR");
  };

  const price     = data?.price;
  const prevClose = data?.prevClose;
  const currency  = data?.currency || "USD";
  const isUSD     = currency === "USD";
  const isEUR     = currency === "EUR";
  const isGBp     = currency === "GBp"; // pence → diviser par 100
  // Normalise le prix en USD-équivalent pour l'affichage cohérent
  // GBp → GBP : diviser par 100
  // EUR ticker (GOLD.PA, AI.PA…) : déjà en EUR, ne pas multiplier par usdEur
  const normalizePrice = v => {
    if(v == null) return null;
    if(isGBp) return v / 100; // GBp → GBP
    return v; // USD ou EUR : déjà dans la bonne devise de base
  };
  // Conversion pour l'affichage (toggle EUR)
  const cvPrice = v => {
    const n = normalizePrice(v);
    if(n == null) return null;
    if(eur){
      if(isEUR || isGBp) return n; // déjà en EUR (GBp→GBP est une approximation acceptable)
      return n * usdEur;           // USD → EUR
    }
    return n; // affichage devise native
  };
  const priceDisp = cvPrice(price);
  const pnl1d     = (price != null && prevClose != null) ? cvPrice(price - prevClose) : null;
  const pct1d     = (price != null && prevClose != null && prevClose !== 0) ? (normalizePrice(price) - normalizePrice(prevClose))/normalizePrice(prevClose) : null;
  const CURRENCY_SYM = { USD:"$", EUR:"€", GBP:"£", GBp:"£", JPY:"¥", CAD:"CA$", AUD:"A$" };
  const cur       = eur ? "€" : (isGBp ? "£" : (CURRENCY_SYM[currency] || currency));
  const fmtAmt    = v => v == null ? "—" : (v>=0?"+":"")+cur+(Math.abs(v)>=100 ? Math.round(Math.abs(v)).toLocaleString("fr-FR") : Math.abs(v).toFixed(2));
  const fmtPct    = v => v == null ? "—" : (v>=0?"+":"")+(Math.abs(v)*100).toFixed(2)+"%";
  const fmtPriceV = v => v == null ? "—" : cur+(v>=100 ? Math.round(v).toLocaleString("fr-FR") : v.toFixed(2));

  // Chart
  const candles = data?.candles || [];
  const closes  = candles.map(c=>c.c).filter(v=>v!=null);
  const W=320, H=110, PAD=6;
  const minV = Math.min(...closes), maxV = Math.max(...closes);
  const rng  = maxV - minV || 1;
  const toY  = v => PAD + (1-(v-minV)/rng)*(H-PAD*2);
  const toX  = (i,n) => PAD + (i/(n-1||1))*(W-PAD*2);
  const pts  = closes.map((v,i)=>toX(i,closes.length)+","+toY(v)).join(" ");
  const isUp = closes.length >= 2 ? closes[closes.length-1] >= closes[0] : true;
  const lineColor = isUp ? C.green : C.red;

  const fmtTs = ts => {
    const d = new Date(ts);
    const lbl = TF_CONFIG[tf].label;
    if(lbl==="1h")  return d.getHours().toString().padStart(2,"0")+":"+d.getMinutes().toString().padStart(2,"0");
    if(lbl==="4h")  return d.getDate()+"/"+(d.getMonth()+1)+" "+d.getHours()+"h";
    if(["1J","1S"].includes(lbl)) return d.getDate()+"/"+(d.getMonth()+1);
    return (d.getMonth()+1)+"/"+d.getFullYear().toString().slice(2);
  };
  const xIdxs = closes.length > 1
    ? [0, Math.floor(closes.length/4), Math.floor(closes.length/2), Math.floor(3*closes.length/4), closes.length-1]
        .filter((v,i,a)=>a.indexOf(v)===i)
    : [];

  const cc   = data?.exchangeCC || "US";
  const flag = FLAG[cc] || "🏳️";
  const city = data?.exchangeCity || data?.exchange || "";
  const mktCap = fmtMktCap(data?.marketCap);
  // quoteType : si Yahoo retourne EQUITY mais le nom contient ETC/ETF/UCITS → forcer ETF
  const rawQuoteType = data?.quoteType || "";
  const nameL = (data?.name || "").toLowerCase();
  const quoteType = (rawQuoteType === "EQUITY" && (
    nameL.includes("etc") || nameL.includes("etf") || nameL.includes("ucits") ||
    nameL.includes("physical") || nameL.includes("tracker") || nameL.includes("index fund") ||
    nameL.includes("amundi") || nameL.includes("ishares") || nameL.includes("lyxor") || nameL.includes("xtrackers")
  )) ? "ETF" : rawQuoteType;
  const sector    = data?.sector || "";

  // Timeframes en 2 rangées (5 + 3)
  const TF_ROW1 = TF_CONFIG.slice(0,5);
  const TF_ROW2 = TF_CONFIG.slice(5);

  const sortedNews = scoreNews(data?.news);

  // ── Swipe-to-close : en haut du scroll OU geste suffisant n'importe où ──────
  const onSheetTouchStart = e => {
    touchStartY.current = e.touches[0].clientY;
    setDragY(0);
  };
  const onSheetTouchMove = e => {
    const sheet = sheetRef.current;
    const dy = e.touches[0].clientY - (touchStartY.current || 0);
    const atTop = sheet && sheet.scrollTop <= 2;
    // Swipe-to-close si on est tout en haut, ou si geste > 60px n'importe où
    if(dy > 0 && (atTop || dy > 60)) {
      e.preventDefault();
      // Résistance légère : quasi 1:1 pour un geste naturel
      const resistance = dy * 0.75;
      setDragY(resistance);
    }
  };
  const onSheetTouchEnd = () => {
    // Seuil abaissé à 50px résistants (~67px de geste réel)
    if(dragY > 50) { onClose(); }
    else { setDragY(0); }
    touchStartY.current = null;
  };

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:1000,
      background:`rgba(0,0,0,${Math.max(0, 0.94 - dragY/300)})`,
      display:"flex", alignItems:"flex-end",
    }} onClick={onClose}>
      <div
        ref={sheetRef}
        onClick={e=>e.stopPropagation()}
        onTouchStart={onSheetTouchStart}
        onTouchMove={onSheetTouchMove}
        onTouchEnd={onSheetTouchEnd}
        style={{
          width:"100%", background:C.bg0, borderRadius:"20px 20px 0 0",
          paddingBottom:36, maxHeight:"88vh", overflowY:"auto",
          transform:`translateY(${dragY}px)`,
          transition: dragY===0 ? "transform 0.25s cubic-bezier(0.32,0.72,0,1)" : "none",
          WebkitOverflowScrolling: "touch",
        }}>
        {/* Handle visuel — indication de swipe */}
        <div style={{display:"flex",justifyContent:"center",padding:"14px 0 8px"}}>
          <div style={{width:36,height:4,borderRadius:2,
            background:dragY>50?C.red:C.border,
            transform:`scaleX(${1 + dragY/200})`,
            transition:"background 0.15s, transform 0.1s"}}/>
        </div>

        {/* v4.0 LOT4 — Graphique TradingView + zones du plan + indicateurs clés */}
        <div style={{padding:"0 14px 8px"}}>
          <LWChart symbol={yfSym} height={280} zones={planZones} onCandles={(c)=>setKpis(computeKeyIndicators(c))}/>
          {planZones.length>0 && (
            <div style={{fontSize:10,color:C.gray,marginTop:2}}>
              Zones du plan (onglet Suivi) : <span style={{color:C.green}}>achat</span> · <span style={{color:C.red}}>cibles de vente</span>
            </div>
          )}
          {kpis.length>0 && (
            <div style={{marginTop:10,background:C.bg1,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 10px"}}>
              <div style={{fontSize:10,fontWeight:600,color:C.btc,marginBottom:6,letterSpacing:.4}}>INDICATEURS CLÉS</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"5px 12px"}}>
                {kpis.map((k,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                    <span style={{color:C.gray}}>{k.label}</span>
                    <span style={{fontWeight:700,color:k.tone==="up"?C.green:k.tone==="down"?C.red:C.text}}>{k.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── #3 MA POSITION (éditable) ── */}
          <div style={{marginTop:10,background:C.bg1,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:10,fontWeight:600,color:C.gold,letterSpacing:.4}}>MA POSITION</span>
              <button onClick={()=>setPosEdit(v=>!v)} style={lxBtn({active:posEdit,style:{padding:"3px 9px",fontSize:10,gap:4}})}>
                <Icon name={posEdit?"check":"edit"} size={12} color={posEdit?C.gold:C.text2}/>{posEdit?"OK":"Éditer"}
              </button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"7px 12px",fontSize:11}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:C.text3}}>Position</span><span style={{fontWeight:700,color:C.text}}>{dispNetQ?Number(dispNetQ).toLocaleString("fr-FR",{maximumFractionDigits:6}):"—"}</span></div>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:C.text3}}>Prix d'achat moyen</span><span style={{fontWeight:700,color:C.text}}>{dispPru!=null?_cur+Number(dispPru).toFixed(2):"—"}</span></div>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:C.text3}}>Cours actuel</span><span style={{fontWeight:700,color:C.text}}>{curPrice!=null?_cur+curPrice.toFixed(2):"—"}</span></div>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:C.text3}}>Durée de hold</span><span style={{fontWeight:700,color:C.text}}>{fmtHold(holdDays)}</span></div>
              {dispPru!=null && curPrice!=null && (()=>{ const pct=curPrice/dispPru-1; return(
                <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:C.text3}}>P&L latent</span><span style={{fontWeight:700,color:pct>=0?C.green:C.red}}>{(pct>=0?"+":"")+(pct*100).toFixed(1)}%</span></div>
              );})()}
            </div>
            {/* Objectifs de vente — multiples, éditables */}
            <div style={{marginTop:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                <span style={{fontSize:10,color:C.text3,textTransform:"uppercase",letterSpacing:1}}>Objectifs de vente</span>
                {posEdit && targets.length<12 && <button onClick={()=>setTargets([...targets,""])} style={lxBtn({style:{padding:"3px 9px",fontSize:10,gap:4}})}><Icon name="plus" size={12} color={C.text2}/>Ajouter</button>}
              </div>
              {targets.length===0 && <div style={{fontSize:11,color:C.text3,fontStyle:"italic"}}>{posEdit?"Clique sur « Ajouter ».":"Aucun objectif."}</div>}
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {targets.map((tg,ti)=>{
                  const tv=parseFloat(tg);
                  const dist=(curPrice!=null&&!isNaN(tv)&&curPrice>0)?(tv/curPrice-1):null;
                  return(
                    <div key={ti} style={{display:"flex",alignItems:"center",gap:8,fontSize:11}}>
                      <span style={{width:18,height:18,borderRadius:5,flexShrink:0,border:`1px solid ${C.gold}55`,color:C.gold,fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{ti+1}</span>
                      {posEdit
                        ? <input type="number" value={tg} onChange={e=>{const a=[...targets];a[ti]=e.target.value;setTargets(a);}} placeholder="prix" style={{flex:1,background:C.bg2,border:`1px solid ${C.border2}`,borderRadius:6,color:C.text,fontSize:11,padding:"3px 8px"}}/>
                        : <span style={{flex:1,fontWeight:700,color:C.text}}>{!isNaN(tv)?_cur+tv.toFixed(2):tg}</span>}
                      {dist!=null && <span style={{fontVariantNumeric:"tabular-nums",color:dist>=0?C.green:C.red,minWidth:54,textAlign:"right"}}>{(dist>=0?"+":"")+(dist*100).toFixed(1)}%</span>}
                      {posEdit && <button onClick={()=>setTargets(targets.filter((_,j)=>j!==ti))} style={{background:"none",border:"none",cursor:"pointer",color:C.red,padding:0,display:"flex"}}><Icon name="trash" size={13}/></button>}
                    </div>
                  );
                })}
              </div>
            </div>
            {tkTrades.length===0 && <div style={{marginTop:8,fontSize:10,color:C.text3,fontStyle:"italic"}}>Aucun trade enregistré pour {ticker} (le symbole du log peut différer — ex. BTC est détenu via IBIT).</div>}
            {posEdit
              ? <input value={posData.note||""} onChange={e=>savePos({note:e.target.value})} placeholder="Note sur la position…" style={{marginTop:8,width:"100%",boxSizing:"border-box",background:C.bg2,border:`1px solid ${C.border2}`,borderRadius:6,color:C.text,fontSize:11,padding:"5px 8px"}}/>
              : (posData.note ? <div style={{marginTop:8,fontSize:11,color:C.text2,fontStyle:"italic"}}>{posData.note}</div> : null)}
          </div>

          {/* ── #3/#21 HISTORIQUE DES TRADES (durée HODL + P&L par vente) ── */}
          {tkTrades.length>0 && (
            <div style={{marginTop:10,background:C.bg1,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px"}}>
              <div style={{fontSize:10,fontWeight:600,color:C.gold,letterSpacing:.4,marginBottom:8}}>HISTORIQUE DES TRADES · {tkTrades.length}</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {fifoEnrich(tkTrades).slice().reverse().map((t,i)=>(
                  <div key={t.id||i} style={{fontSize:11,borderBottom:`1px solid ${C.border}`,paddingBottom:7}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:9,fontWeight:700,color:t.side==="BUY"?C.green:C.red,border:`1px solid ${(t.side==="BUY"?C.green:C.red)}55`,borderRadius:5,padding:"1px 6px",minWidth:42,textAlign:"center"}}>{t.side==="BUY"?"ACHAT":"VENTE"}</span>
                      <span style={{color:C.text3,minWidth:62}}>{t.date}</span>
                      <span style={{flex:1,textAlign:"right",color:C.text}}>{Math.abs(t.qty||0).toLocaleString("fr-FR",{maximumFractionDigits:4})} @ {t.currency==="EUR"?"€":"$"}{Number(t.price||0).toFixed(2)}</span>
                    </div>
                    {t.side==="SELL" && (t.pnl!=null || t.held!=null) && (
                      <div style={{display:"flex",gap:14,justifyContent:"flex-end",marginTop:3,fontSize:10,color:C.text3}}>
                        {t.held!=null && <span>HODL {fmtHold(t.held)}</span>}
                        {t.pnl!=null && <span>P&L <b style={{color:t.pnl>=0?C.green:C.red}}>{(t.pnl>=0?"+":"")+(t.currency==="EUR"?"€":"$")+Math.abs(t.pnl).toFixed(0)}{t.pnlPct!=null?" ("+(t.pnlPct>=0?"+":"")+(t.pnlPct*100).toFixed(1)+"%)":""}</b></span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Header — ticker + nom + flag */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",padding:"4px 18px 10px"}}>
          <div style={{flex:1,minWidth:0}}>
            {/* Ticker grand + logo + nom YF petit */}
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              {(()=>{
                // Priorité : icône user → logo fmp ICON_DB → logoUrl API
                const db = ICON_DB[ticker];
                const logoSrc = db?.user ? null : (db?.fmp || data?.logoUrl);
                const userIcon = db?.user;
                if(userIcon) return(
                  <span style={{fontSize:24,lineHeight:1}}>{userIcon}</span>
                );
                if(logoSrc) return(
                  <img src={logoSrc} alt={ticker}
                    style={{width:28,height:28,borderRadius:6,objectFit:"contain",
                      background:C.bg2,border:`1px solid ${C.border}`,flexShrink:0}}
                    onError={e=>{e.target.style.display="none";}}/>
                );
                return null;
              })()}
              <span style={{fontSize:22,fontWeight:700,color:C.text,letterSpacing:-0.5}}>{ticker}</span>
              {isCrypto && data?.rank && (
                <span style={{fontSize:12,fontWeight:700,color:C.btc,background:C.btc+"22",
                  borderRadius:6,padding:"2px 7px",flexShrink:0}}>#{data.rank}</span>
              )}
              {data?.name
                ? <span style={{fontSize:11,color:C.gray,fontWeight:400,flexShrink:1,minWidth:0}}>{data.name}</span>
                : loading && <span style={{fontSize:11,color:C.border}}>…</span>
              }
            </div>

            {/* Badges : type d'actif + secteur/catégorie + industrie/sous-secteur */}
            {(quoteType || sector || data?.industry) && (
              <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
                {quoteType && (()=>{
                  const QT_COLOR = {
                    EQUITY:"#10B981", ETF:"#1E40AF", MUTUALFUND:"#8B5CF6",
                    CRYPTOCURRENCY:"#F7931A", CRYPTO:"#F7931A", INDEX:"#6B7280", CURRENCY:"#EAB308",
                  };
                  const qc = QT_COLOR[quoteType] || C.teal;
                  return (
                    <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:5,
                      background:qc+"22",color:qc,border:`1px solid ${qc}55`}}>
                      {quoteType === "CRYPTO" ? "CRYPTO" : quoteType}
                    </span>
                  );
                })()}
                {sector && (
                  <span style={{fontSize:9,fontWeight:600,padding:"2px 8px",borderRadius:5,
                    background:C.teal+"18",color:C.teal,border:`1px solid ${C.teal}44`}}>
                    {sector}
                  </span>
                )}
                {data?.industry && (
                  <span style={{fontSize:9,fontWeight:600,padding:"2px 8px",borderRadius:5,
                    background:C.gold+"18",color:C.gold,border:`1px solid ${C.gold}44`}}>
                    {data.industry}
                  </span>
                )}
              </div>
            )}

            {/* Données spécifiques crypto : supply + dominance BTC */}
            {isCrypto && data && (
              <div style={{display:"flex",gap:6,marginTop:5,flexWrap:"wrap",alignItems:"center"}}>
                {/* Circulating / Max supply */}
                {data.circulatingSupply != null && (
                  <span style={{fontSize:9,color:C.text3}}>
                    Supply:{" "}
                    <span style={{color:C.text,fontWeight:700}}>
                      {(data.circulatingSupply/1e6).toFixed(2)}M
                    </span>
                    {data.maxSupply
                      ? <span style={{color:C.btc}}>{" / "}{(data.maxSupply/1e6).toFixed(2)}M ({((data.circulatingSupply/data.maxSupply)*100).toFixed(1)}%)</span>
                      : data.totalSupply
                        ? <span style={{color:C.gray}}>{" / "}{(data.totalSupply/1e6).toFixed(2)}M ({((data.circulatingSupply/data.totalSupply)*100).toFixed(1)}%)</span>
                        : null
                    }
                  </span>
                )}
                {/* Dominance BTC */}
                {data.btcDominance != null && (
                  <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:5,
                    background:C.btc+"22",color:C.btc,border:`1px solid ${C.btc}44`}}>
                    Dom. {data.btcDominance.toFixed(1)}%
                  </span>
                )}
              </div>
            )}
          </div>
          {/* Drapeau + bouton fermer */}
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <div style={{position:"relative"}}>
              <div style={{display:"flex",alignItems:"center",gap:3}}>
                <button onClick={e=>{e.stopPropagation();setShowCity(!showCity);}} style={{
                  background:"transparent",border:"none",fontSize:22,cursor:"pointer",padding:"2px 4px",lineHeight:1,
                }}>{flag}</button>
                {/* Soleil si REGULAR, lune sinon */}
                {data?.marketState && (
                  <span style={{fontSize:12,lineHeight:1}} title={data.marketState}>
                    {data.marketState === "REGULAR" ? "☀️" : "🌙"}
                  </span>
                )}
              </div>
              {showCity && (
                <div style={{
                  position:"absolute",right:0,top:"110%",background:C.bg2,border:`1px solid ${C.border}`,
                  borderRadius:10,padding:"10px 14px",whiteSpace:"nowrap",zIndex:10,
                  minWidth:170,boxShadow:"0 4px 20px #0006",
                }}>
                  <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:6}}>{city || "—"}</div>
                  {data?.marketState && (() => {
                    const isOpen = data.marketState === "REGULAR";
                    const stateLabel = {
                      REGULAR:"Marché ouvert", PRE:"Pré-marché", POST:"Après clôture",
                      PREPRE:"Pré-ouverture", POSTPOST:"Après clôture", CLOSED:"Fermé"
                    }[data.marketState] || data.marketState;
                    return (
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                        <span style={{fontSize:14}}>{isOpen ? "☀️" : "🌙"}</span>
                        <span style={{fontSize:10,fontWeight:600,color:isOpen?C.green:C.text3}}>
                          {stateLabel}
                        </span>
                      </div>
                    );
                  })()}
                  {data?.exchangeTz && (
                    <div style={{fontSize:9,color:C.text3,marginTop:2}}>{data.exchangeTz}</div>
                  )}
                </div>
              )}
            </div>
            <button onClick={onClose} style={{background:"transparent",border:"none",color:C.gray,fontSize:20,cursor:"pointer",padding:"2px 6px"}}>✕</button>
          </div>
        </div>

        <div style={{padding:"0 16px"}}>
          {/* Prix live + P&L 1d */}
          {!loading && !err && price != null && (
            <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:10,flexWrap:"wrap"}}>
              <span style={{fontSize:28,fontWeight:700,color:C.text,letterSpacing:-1}}>
                {fmtPriceV(priceDisp)}
              </span>
              {pnl1d != null && (
                <span style={{fontSize:13,fontWeight:700,color:pnl1d>=0?C.green:C.red}}>
                  {fmtAmt(pnl1d)}
                </span>
              )}
              {pct1d != null && (
                <span style={{fontSize:12,fontWeight:700,padding:"3px 8px",borderRadius:6,
                  background:pct1d>=0?C.green+"22":C.red+"22",color:pct1d>=0?C.green:C.red}}>
                  {fmtPct(pct1d)}
                </span>
              )}
            </div>
          )}

          {/* Debug info — visible si marketCap manquant */}
          {data && !isCrypto && quoteType !== "ETF" && (data._yahooDebug || data._fmpDebug) && (() => {
            const d = data._yahooDebug || data._fmpDebug;
            // N'afficher le debug que si on a une vraie erreur de fetch (pas juste des données nulles)
            // v23.02 — ne montrer le debug que si le chargement a VRAIMENT échoué.
            // Un fcStatus 404 sur l'étape crumb est bénin si quoteSummary a renvoyé
            // un résultat (hasResult:true) : les données sont chargées via le fallback.
            const hasRealError = !d.hasResult && (d.fcStatus === 404 || (d.qsStatus && d.qsStatus !== 200) || d.qsErr || d.error);
            if(!hasRealError) return null;
            return (
            <div style={{background:C.orange+"22",border:`1px solid ${C.orange}44`,borderRadius:8,padding:"8px 12px",marginBottom:10,fontSize:9,color:C.orange}}>
              <b>Debug Yahoo:</b>
              <div>step:{d.step} fcStatus:{d.fcStatus} crumb:{d.crumb}</div>
              <div>qsStatus:{d.qsStatus} qsLen:{d.qsLen} hasResult:{String(d.hasResult)}</div>
              {d.qsErr && <div>qsErr:{d.qsErr}</div>}
              {d.error && <div>error:{d.error}</div>}
              <div style={{marginTop:3}}>
                {["marketCap","volAvg","sector","industry","divRate","divDate","etfCategory","holdingsCount","change","logo"]
                  .map(k=><span key={k} style={{marginRight:5,color:d[k]&&d[k]!=="null"&&d[k]!=="not_in_yahoo"?C.green:C.text3}}>{k}:{d[k]||"?"}</span>)}
              </div>
            </div>
            );
          })()}

          {/* ── Cases de données fondamentales sous le prix ── */}
          {data && (() => {
            const fmtMC = v => {
              if(!v) return null;
              const vv = eur ? (isEUR || isGBp ? v : v * usdEur) : v;
              const sym = eur ? "€" : "$";
              if(vv >= 1e12) return sym + (vv/1e12).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2}) + " Bil.";
              if(vv >= 1e9)  return sym + (vv/1e9).toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2}) + " Mrd.";
              if(vv >= 1e6)  return sym + (vv/1e6).toLocaleString("fr-FR",{minimumFractionDigits:0,maximumFractionDigits:0}) + " M";
              return sym + vv.toLocaleString("fr-FR");
            };
            const fmtVol = v => {
              if(!v) return null;
              if(v >= 1e6) return (v/1e6).toLocaleString("fr-FR",{minimumFractionDigits:1,maximumFractionDigits:1}) + "M";
              if(v >= 1e3) return (v/1e3).toLocaleString("fr-FR",{minimumFractionDigits:0,maximumFractionDigits:0}) + "k";
              return v.toLocaleString("fr-FR");
            };
            const dbg = data._yahooDebug || data._fmpDebug || {};
            const isETF = quoteType === "ETF" || quoteType === "ETC";
            // 3 cases sur 1 ligne — contenu différent selon crypto ou action/ETF
            const cases = isCrypto ? [
              { label:"Cap. marché",
                value: fmtMC(data.marketCap), color:C.text, err:null, dash:!data.marketCap },
              { label:"Vol. 24h",
                value: fmtVol(data.volume24h), color:C.text2, err:null, dash:!data.volume24h },
              { label:"ATH",
                value: data.ath
                  ? cur+(data.ath>=1000?Math.round(data.ath).toLocaleString("fr-FR"):data.ath.toFixed(2))
                    +(data.athChangesPct!=null?" ("+data.athChangesPct.toFixed(1)+"%)":" ")
                  : null,
                color: data.athChangesPct!=null&&data.athChangesPct>=-10 ? C.green : C.text3,
                err:null, dash:!data.ath },
            ] : [
              { label: isETF && !data.marketCap ? "AUM" : "Cap. boursière",
                value: fmtMC(data.marketCap),
                color: C.text,
                err: null,                          // plus jamais d'orange ici
                dash: !data.marketCap,              // — pour tout ticker sans marketCap
              },
              { label:"Vol. moyen",     value: fmtVol(data.volAvg),   color:C.text2,
                err: !data.volAvg    ? (dbg.volAvg    || "null") : null },
              { label:"Dernier div.",
                value: (eur?"€":"$") + (data.lastDiv != null ? Number(data.lastDiv).toFixed(2) : "0.00"),
                color: data.lastDiv > 0 ? C.green : C.text3,
                sub: data.lastDivDate || null, err: null },
            ];
            return (
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:14}}>
                {cases.map((item, i) => (
                  <div key={i} style={{
                    background: item.err ? C.orange+"11" : C.bg1,
                    border:`1px solid ${item.err ? C.orange+"44" : C.border}`,
                    borderRadius:10, padding:"8px 10px",
                    display:"flex",flexDirection:"column",gap:2,
                  }}>
                    <span style={{fontSize:8,color:C.text3,fontWeight:500,textTransform:"uppercase",letterSpacing:0.4}}>
                      {item.label}
                    </span>
                    {item.value
                      ? <>
                          <span style={{fontSize:12,fontWeight:700,color:item.color}}>{item.value}</span>
                          {item.sub && <span style={{fontSize:8,color:C.text3}}>{item.sub}</span>}
                        </>
                      : item.dash
                        ? <span style={{fontSize:12,fontWeight:700,color:C.text3}}>—</span>
                        : <span style={{fontSize:7,color:C.orange,fontFamily:C.font,marginTop:2}}>
                            {dbg.qsStatus ? "qs:" + dbg.qsStatus + " · " + (item.err||"") : "En attente…"}
                          </span>
                    }
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Blocs ETF : catégorie + top holdings ── */}
          {quoteType === "ETF" && (() => {
            const etfDbg = data?._yahooDebug || data?._etfDebug || {};
            const hasHoldings = data?.topHoldings && data.topHoldings.length > 0;
            return (
              <>
                {/* Cadre top holdings — accordéon */}
                <div style={{marginBottom:14}}>
                  <button
                    onClick={() => setHoldingsOpen(o => !o)}
                    style={{
                      display:"flex",alignItems:"center",justifyContent:"space-between",
                      width:"100%",background:holdingsOpen ? C.teal+"15" : C.bg3,
                      border:`1px solid ${holdingsOpen ? C.teal+"88" : C.border}`,
                      borderRadius:8, cursor:"pointer",
                      padding:"8px 12px", textAlign:"left",
                      marginBottom: holdingsOpen ? 6 : 0,
                    }}
                  >
                    <span style={{fontSize:11, color: holdingsOpen ? C.teal : C.text, fontWeight:700, letterSpacing:0.3}}>
                      📊 Top Holdings
                      {hasHoldings && (
                        <span style={{marginLeft:6, fontSize:10, color: holdingsOpen ? C.teal : C.text2, fontWeight:500}}>
                          ({data.topHoldings.length})
                        </span>
                      )}
                    </span>
                    <span style={{
                      fontSize:11, color: holdingsOpen ? C.teal : C.text2,
                      display:"inline-block",
                      transform: holdingsOpen ? "rotate(90deg)" : "rotate(0deg)",
                      transition:"transform .2s", fontWeight:700,
                    }}>▶</span>
                  </button>

                  {holdingsOpen && (
                    hasHoldings
                      ? <div style={{borderRadius:10,overflow:"hidden",border:`1px solid ${C.border}`}}>
                          {data.topHoldings.map((h, i) => {
                            const isLast = i === data.topHoldings.length - 1;
                            const maxPct = data.topHoldings[0]?.pct || 1;
                            const barW = h.pct ? Math.min((h.pct / maxPct) * 100, 100) : 0;
                            return (
                              <div key={i} style={{
                                display:"flex",alignItems:"center",gap:6,padding:"5px 10px",
                                borderBottom:isLast?"none":`1px solid ${C.border}`,
                                background:i%2===0?"transparent":C.bg1+"44",
                              }}>
                                <span style={{fontSize:9,color:C.text3,width:14,flexShrink:0,textAlign:"right"}}>{i+1}</span>
                                <div style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                  <span style={{fontSize:11,fontWeight:600,color:C.text}}>{h.name}</span>
                                </div>
                                <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                                  <div style={{width:50,height:3,background:C.border,borderRadius:2}}>
                                    <div style={{width:`${barW}%`,height:"100%",background:C.teal,borderRadius:2}}/>
                                  </div>
                                  <span style={{fontSize:10,fontWeight:700,color:C.teal,minWidth:36,textAlign:"right"}}>
                                    {h.pct != null ? h.pct.toFixed(1)+"%" : "—"}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      : <div style={{
                          borderRadius:10,padding:"10px 14px",
                          background:C.orange+"11",border:`1px solid ${C.orange+"44"}`,
                          fontSize:8,color:C.orange,fontFamily:C.font,
                        }}>
                          step:{etfDbg.step} qsStatus:{etfDbg.qsStatus} crumb:{etfDbg.crumb}
                          {" "}holdings:{etfDbg.holdingsCount} qsLen:{etfDbg.qsLen}
                          {etfDbg.yfErr && <span> yfErr:{etfDbg.yfErr.slice(0,80)}</span>}
                          {etfDbg.error && <span> err:{etfDbg.error.slice(0,80)}</span>}
                        </div>
                  )}
                </div>
              </>
            );
          })()}

          {/* ── Actualités ── */}
          {sortedNews.length > 0 && (
            <div style={{marginTop:16}}>
              <div style={{fontSize:10,fontWeight:700,color:C.gray,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>
                Actualités
              </div>
              {sortedNews.map((n,i)=>{
                const ago = n.time ? (()=>{
                  const diff = (Date.now() - n.time) / 60000;
                  if(diff < 60)   return Math.round(diff)+"min";
                  if(diff < 1440) return Math.round(diff/60)+"h";
                  return Math.round(diff/1440)+"j";
                })() : null;
                return (
                  <a key={i} href={n.url} target="_blank" rel="noreferrer" style={{
                    display:"flex", gap:10, padding:"10px 0",
                    borderBottom: i < sortedNews.length-1 ? `1px solid ${C.border}` : "none",
                    textDecoration:"none",
                  }}>
                    {n.thumbnail && (
                      <img src={n.thumbnail} alt="" style={{width:56,height:42,borderRadius:6,objectFit:"cover",flexShrink:0}}/>
                    )}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:C.text,lineHeight:1.35,marginBottom:4,
                        display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>
                        {n.title}
                      </div>
                      <div style={{fontSize:10,color:C.gray}}>
                        {n.publisher}{ago && <span style={{marginLeft:6,color:C.text3}}>{ago}</span>}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════
   PORTFOLIO SECTION ROW — cliquable, expand avec ligne détail
═══════════════════════════════════════════════════════════ */
function SectionRow({section, open, onToggle, hidden=false, eur=false, usdEur=0.852, eurUsd=1.173, onTickerClick, iconDbVersion=0, onIconSaved}){
  const {n, icon, color, totalUSD, totalEUR, pct} = section;
  // #64 — positions classées par poids décroissant (la plus grosse en premier)
  const items = (section.items||[]).slice().sort((a,b)=>((b.val||b.valEUR||0)-(a.val||a.valEUR||0)));
  const totalPnl = items.reduce((s,x)=>s+(x.pnl||0), 0);

  // Conversion selon mode €/$
  const cv    = v => { const n=parseFloat(v); return isNaN(n)?0: eur ? Math.round(n * usdEur) : Math.round(n); };
  const cvPnl = v => { const n=parseFloat(v); return isNaN(n)?0: eur ? Math.round(n * usdEur) : Math.round(n); };
  const cur   = eur ? "€" : "$";
  const fmtV  = v => { const n=cv(v); return (n<0?"-":"")+cur+fmtK(Math.abs(n)); };
  const fmtP2 = v => { const n=parseFloat(v); return isNaN(n)?"—":(n>=0?"+":"")+cur+fmtK(Math.abs(cvPnl(n))); };
  const fmtPrice = (n, rate=1) => { const v=n*rate; return v>=100 ? Math.round(v).toLocaleString("fr-FR") : v.toFixed(2); };
  const fmtLive = v => { const n=parseFloat(v); return isNaN(n)?"—":(eur ? "€"+fmtPrice(n,usdEur) : "$"+fmtPrice(n)); };
  const fmtPA   = v => { const n=parseFloat(v); return isNaN(n)?"—":(eur ? "€"+fmtPrice(n,usdEur) : "$"+fmtPrice(n)); };
  const barPct  = Math.min(Math.max(pct, 0), 100);  // 0% si négatif, 100% max

  return(
    <div style={{marginBottom:6}}>
      {/* Header row — clickable */}
      <button
        onClick={onToggle}
        style={{
          width:"100%", background: open ? color+"18" : C.bg1,
          border:`1px solid ${open ? color+"55" : C.border}`,
          borderRadius: open ? "12px 12px 0 0" : 12,
          padding:"12px 14px", cursor:"pointer", display:"flex",
          alignItems:"center", gap:12, transition:"all .18s",
        }}
      >
        {/* Icon — carré bordé, logo filaire (style boutons du bandeau) */}
        <div style={{
          width:38, height:38, borderRadius:C.radiusSm||8, flexShrink:0,
          background:"transparent", border:`1px solid ${open ? color : C.border2}`,
          display:"flex", alignItems:"center", justifyContent:"center",
          color:color, transition:"all .18s",
        }}><Icon name={FAMILY_ICONS[n]||"grid"} size={19} color={color}/></div>

        {/* Name + bar */}
        <div style={{flex:1, textAlign:"left"}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
            <span style={{fontSize:14, fontWeight:600, color: open ? color : C.text}}>{n}</span>
            <div style={{display:"flex", alignItems:"center", gap:8}}>
              <span style={{fontSize:11,fontWeight:700,color:totalPnl>=0?C.green:C.red}}>
                {msk(fmtP2(totalPnl),hidden)}
              </span>
              <span style={{fontSize:14,fontWeight:600,color:C.text}}>
                {msk(fmtV(totalUSD),hidden)}
              </span>
            </div>
          </div>
          <div style={{display:"flex", alignItems:"center", gap:8, marginTop:5}}>
            <div style={{flex:1, background:C.bg3, borderRadius:3, height:4}}>
              <div style={{height:4, borderRadius:3, background:color, width:barPct+"%", transition:"width .3s"}}/>
            </div>
            <span style={{fontSize:10, color:pct<0?C.red:color, fontWeight:700, flexShrink:0}}>{pct.toFixed(1)}%</span>
            <span style={{fontSize:11, color: open?"#fff":C.text3, transition:"transform .2s",
              display:"inline-block", transform: open?"rotate(180deg)":"rotate(0deg)"}}>
              ▾
            </span>
          </div>
        </div>
      </button>

      {/* Expanded detail panel */}
      {open && (
        <div style={{
          background: C.bg2, border:`1px solid ${color+"44"}`,
          borderTop:"none", borderRadius:"0 0 12px 12px",
          overflow:"hidden",
        }}>
          {/* Line items */}
          {items.map((item,i)=>{
            const isLast=i===items.length-1;
            const pnlPct=item.pct??(item.pnl&&item.investi?item.pnl/item.investi:null);
            return(
              <div key={i} onClick={()=>item.ticker&&onTickerClick&&onTickerClick(item.ticker, item.cat, item)} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 12px",borderBottom:isLast?"none":`1px solid ${C.border}`,background:i%2===0?"transparent":C.bg1+"66",cursor:item.ticker?"pointer":"default"}}>
                {/* Icon — TickerIcon si ticker connu, sinon fallback BankLogo/emoji */}
                {(()=>{
                  // Logos SVG custom uniquement pour KUCOIN (pas de ticker boursier, logo SVG maison)
                  // BCI, Bourso, DeBlock → TickerIcon avec leur logo .fmp depuis BANK_LOGOS
                  const SVG_ONLY = ["KUCOIN"];
                  const Logo = item.iconComponent && SVG_ONLY.includes(item.ticker)
                    ? BankLogo[item.iconComponent] : null;
                  if(Logo) return(
                    <div style={{width:32,height:32,borderRadius:8,flexShrink:0,background:color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
                      <Logo/>
                    </div>
                  );
                  // Tous les autres tickers (y compris IBKR, USD, EURO, STRC, BCI, Bourso, DeBlock…) → TickerIcon
                  if(item.ticker && !SVG_ONLY.includes(item.ticker)){
                    return(
                      <TickerIcon
                        ticker={item.ticker}
                        size={32}
                        color={color+"22"}
                        iconDbVersion={iconDbVersion}
                        onIconSaved={onIconSaved}
                      />
                    );
                  }
                  return(
                    <div style={{width:32,height:32,borderRadius:8,flexShrink:0,background:color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
                      {item.icon||item.ticker?.slice(0,4)}
                    </div>
                  );
                })()}

                {/* Main info — nouvelle disposition compacte */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    {/* Gauche : ticker/label + live */}
                    <div style={{minWidth:0}}>
                      <div style={{display:"flex",alignItems:"baseline",gap:6,flexWrap:"wrap"}}>
                        <span style={{fontSize:13,fontWeight:700,color:C.text}}>{item.label||item.ticker}</span>
                        {item.live!=null&&item.live!==false&&(
                          <span style={{fontSize:11,fontWeight:700,color:color}}>
                            {fmtLive(item.live)}
                          </span>
                        )}
                      </div>
                      {/* Qty + PA — bien visibles (#48) */}
                      {(item.qty!=null||item.pa!=null)&&(
                        <div style={{display:"flex",gap:6,marginTop:3,flexWrap:"wrap"}}>
                          {item.qty!=null&&(
                            <span style={{fontSize:11.5,color:C.text2,background:C.bg3,borderRadius:5,padding:"1px 7px",fontVariantNumeric:"tabular-nums"}}>
                              Qté <b style={{color:C.text}}>{fmtQty(item.qty)}</b>
                            </span>
                          )}
                          {item.pa!=null&&item.pa!==false&&(
                            <span style={{fontSize:11.5,color:C.text2,background:C.bg3,borderRadius:5,padding:"1px 7px",fontVariantNumeric:"tabular-nums"}}>
                              PA <b style={{color:C.text}}>{fmtPA(item.pa)}</b>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Droite : valeur + P&L */}
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:C.text}}>
                        {hidden?"***":(item.valUSD===0?"$0":fmtV(item.valUSD))}
                      </div>

                      {item.pnl!==undefined&&item.pnl!==null&&(
                        <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4,marginTop:2}}>
                          <span style={{fontSize:11,fontWeight:600,color:item.pnl>=0?C.green:C.red}}>
                            {hidden?"***":fmtP2(item.pnl)}
                          </span>
                          {pnlPct!==null&&(
                            <span style={{fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:5,
                              background:item.pnl>=0?C.green+"22":C.red+"22",color:item.pnl>=0?C.green:C.red}}>
                              {fmtP(pnlPct)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   JCGI COMPARE CHART
   Left axis  (base 100 = début de la timeframe) : CGIS • CGIC
   Right axis (montant en €/$ selon eur)         : Patrimoine total
   La valeur finale = exactement celle affichée en haut
═══════════════════════════════════════════════════════════ */
function GdbCompareChart({eur, setEur, EFF, tf, setTF, onSparkData, chartData, liveDD, liveGDBS, liveGC}){
  const _DD=liveDD||DD;
  const _GDBS=sanitizeGDBS(liveGDBS||GDBS);
  const _GC=liveGC||GC_FULL;
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [full, setFull] = useState(false);
  // tf et setTF viennent du parent (PageOverview) pour synchroniser avec le card

  const src = EFF||CURRENT;

  // Valeurs live depuis EFF (ou CURRENT si pas encore refreshé)
  // v23.25 — point "aujourd'hui" du chart : lire EFF.gdbS/gdbC (valeur officielle posée
  // au boot/refresh/trade) et non calcGdbPrices(src) qui recalcule sur prix périmés.
  const gcLive = src.gdbC || calcGdbPrices(src).gdbC;
  const gsLive = src.gdbS || calcGdbPrices(src).gdbS;
  const portTodayEUR = src.totalEUR;
  const portTodayUSD = src.totalUSD;
  const portToday = eur ? portTodayEUR : portTodayUSD;
  const cur = eur ? "€" : "$";

  /* ── Cutoff dynamique ── */
  const cutoff = days => {
    const d = new Date(Date.now() + NC_OFFSET_MS);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0,10);
  };
  const today = todayNC();
  const tfCut = { "1W":cutoff(7), "1M":cutoff(31), "MTD":today.slice(0,7)+"-01", "YTD":today.slice(0,4)+"-01-01", "1Y":cutoff(365), "2Y":cutoff(730), "ALL":"2020-01-01" };
  const cut = tfCut[tf] || "2020-01-01";

  // ── Séries enrichies avec le point live ──────────────────────────────────
  // _GDBS étendu avec le point live si sa date > dernier point _GDBS
  const gdbs_last = _GDBS[_GDBS.length-1]?.[0] || "2026-01-01";
  const gdbs_ext = today > gdbs_last
    ? [..._GDBS, [today, gsLive, gcLive]]
    : _GDBS.map(r=>r[0]===today ? [today, gsLive, gcLive] : r);

  // PORT_B100 étendu avec le point live
  // ── Portfolio : utilise _DD directement (col 2 = total hors immo €)
  const dd_last = _DD[_DD.length-1]?.[0] || "2026-01-01";
  const dd_ext = today > dd_last
    ? [..._DD, [today, null, portTodayEUR, null, null]]
    : _DD.map(r=>r[0]===today ? [today, r[1], portTodayEUR, r[3], r[4]] : r);

  const gSlice = gdbs_ext.filter(r => r[0] >= cut && r[0] <= today);
  const ddSlice = dd_ext.filter(r => r[0] >= cut && r[0] <= today && r[2] != null);

  if (!gSlice.length) return null;
  const dates = gSlice.map(r => r[0]);
  const n = dates.length;
  if (n < 2) return null;

  /* ── CGIC / CGIS → base 100 depuis le TABLEAU DE VÉRITÉ (mêmes séries que l'onglet JCGI,
     pour que les deux onglets concordent) : indice quotidien ancré + extension live/journal. ── */
  const _gpH = (typeof calcGdbPrices==="function") ? calcGdbPrices(src) : {};
  const _cmH = (typeof CRYPTO_MONTHLY!=="undefined"?CRYPTO_MONTHLY:{}), _smH=(typeof STOCKS_MONTHLY!=="undefined"?STOCKS_MONTHLY:{});
  const _ueH = src.usdEur||0.852;
  const _liveCgicIdxH = 100*(1 + (fundPeriodPerf("CGIC","2020-01-01",_cmH,_smH,(_gpH.gdbCfondsUSD!=null?_gpH.gdbCfondsUSD:(src.crypto?src.crypto.total:0))*_ueH)||0));
  const _liveCgisIdxH = 100*(1 + (fundPeriodPerf("CGIS","2020-01-01",_cmH,_smH,(_gpH.gdbSfondsUSD!=null?_gpH.gdbSfondsUSD:0)*_ueH)||0));
  const _cgicAH = gdbAppendLive(gdbCgicDailyAnchors(), "c", 2, _liveCgicIdxH);
  const _cgisAH = gdbAppendLive(gdbCgisDailyAnchors(), "s", 1, _liveCgisIdxH);
  const _gcRawH = dates.map(d=>gdbInterp(_cgicAH,d));
  const _gsRawH = dates.map(d=>gdbInterp(_cgisAH,d));
  const _gc0H = _gcRawH.find(v=>v!=null), _gs0H=_gsRawH.find(v=>v!=null);
  const gcB = _gcRawH.map(v => (v!=null&&_gc0H) ? round2(v/_gc0H*100) : null);
  const gsB = _gsRawH.map(v => (v!=null&&_gs0H) ? round2(v/_gs0H*100) : null);

  /* ── Portfolio → valeurs absolues depuis _DD (€), converties si $ ── */
  const ddByDate = {};
  ddSlice.forEach(r => { ddByDate[r[0]] = r[2]; });
  // Pour les dates sans point _DD exact, cherche le plus proche précédent
  const portAbs = dates.map(d => {
    const eur_val = ddByDate[d] ?? _DD.reduceRight((a,r)=>a!=null?a:(r[0]<=d&&r[2]!=null?r[2]:null),null);
    if(eur_val==null) return null;
    // Use historical usdEur from _DD[5] if available, otherwise from chartData snapshot, else src rate
    const ddRow_full = _DD.find(r=>r[0]===d);
    const snap_eur = chartData?.find(s=>s.d===d)?.eur;
    const hist_usdEur = ddRow_full?.[5] || snap_eur || src.usdEur;
    const hist_eurUsd = 1 / hist_usdEur;
    return eur ? Math.round(eur_val) : Math.round(eur_val * hist_eurUsd);
  });

  // Dernier point = valeur live exacte
  if (portAbs.length > 0) portAbs[portAbs.length - 1] = portToday;

  const p0abs = portAbs.find(v => v != null);
  const portB = portAbs.map(v => v != null && p0abs ? round2(v / p0abs * 100) : null);

  // Exposer portAbs au parent pour la sparkline
  useEffect(()=>{ onSparkData&&onSparkData(portAbs); }, [tf, portAbs.join(",")]); // eslint-disable-line

  /* ── SVG geometry ── */
  const W = 300, H = 96, PAD_L = 30, PAD_R = 38;
  const IW = W - PAD_L - PAD_R;

  const leftVals = [...gsB, ...gcB].filter(v => v != null);
  const portBVals = portB.filter(v => v != null);
  const allVals = [...leftVals, ...portBVals];
  const gMin = Math.min(...allVals), gMax = Math.max(...allVals);
  const gRng = gMax - gMin || 1;

  const px = i => PAD_L + (i / (n - 1)) * IW;
  const py = v => v == null ? null : H - ((v - gMin) / gRng) * (H - 4) + 2;

  const makeLine = (vals, color, bold) => {
    const pts = vals.map((v, i) => v != null ? `${px(i)},${py(v)}` : null).filter(Boolean).join(" ");
    return pts ? <polyline points={pts} fill="none" stroke={color}
      strokeWidth={full?(bold?1.2:0.7):(bold?2.2:1.6)} opacity={hover!=null?0.5:(full?0.8:0.92)}/> : null;
  };

  /* ── Interaction ── */
  const getIdx = (clientX, rect) => {
    const svgX = (clientX - rect.left) * (W / rect.width) - PAD_L;
    return Math.min(n - 1, Math.max(0, Math.round(svgX / (IW / (n - 1)))));
  };
  const onMove = e => { if (!svgRef.current) return; setHover({ i: getIdx(e.clientX, svgRef.current.getBoundingClientRect()) }); };
  const _tm2=useRef(false),_ts2=useRef(0);
  const onTouch = e => { e.preventDefault(); if (!svgRef.current) return; const t=e.touches[0]||e.changedTouches[0]; if(e.type==="touchstart"){_tm2.current=false;_ts2.current=t.clientX;}else{_tm2.current=Math.abs(t.clientX-_ts2.current)>4;} setHover({ i: getIdx(t.clientX, svgRef.current.getBoundingClientRect()) }); };
  const onTouchEnd1=ev=>{ev.preventDefault();if(!_tm2.current)setHover(null);};

  /* ── Hover values ── */
  const hi = hover?.i;
  const hDate  = hi != null ? dates[hi] : null;
  const hGs    = hi != null ? gSlice[hi]?.[1] : null;   // CGIS $ actual
  const hGc    = hi != null ? gSlice[hi]?.[2] : null;   // CGIC $ actual
  const hGsB   = hi != null ? gsB[hi] : null;
  const hGcB   = hi != null ? gcB[hi] : null;
  const hPortAbs = hi != null ? portAbs[hi] : null;      // already in €/$ per eur flag
  const hPortB   = hi != null ? portB[hi] : null;

  // Format prix indice JCGI : always $, or convert to € if eur mode
  const fmtGdb = v => v == null ? null : eur ? `€${(v * CURRENT.usdEur).toFixed(2)}` : `$${v.toFixed(2)}`;

  /* ── Axis labels ── */
  const xLabel = d => {
    if (!d) return "";
    const [y, m, day] = d.split("-");
    return (tf==="1W"||tf==="1M"||tf==="MTD") ? `${parseInt(day)}/${m}` : `${m}/${y.slice(2)}`;
  };
  const gridVals = [gMin, (gMin + gMax) / 2, gMax];

  // Right axis: convert base-100 grid value back to absolute portfolio value
  const b100ToPort = b => Math.round(b / 100 * p0abs);

  const vw = typeof window!=="undefined"?window.innerWidth:390;
  const vh = typeof window!=="undefined"?window.innerHeight:844;

  /* ── Contenu du graphique (partagé entre normal et fullscreen) ── */
  const chartContent = (hFull) => (
    <>
      {/* Timeframe selector + bouton € */}
      <div style={{display:"flex",gap:3,marginBottom:10,alignItems:"center"}}>
        {["1W","1M","MTD","YTD","1Y","2Y","ALL"].map(t=>(
          <button key={t} onClick={()=>{setTF(t);setHover(null);}} style={{
            flex:1,padding:"4px 0",borderRadius:6,fontSize:10,fontWeight:700,
            border:"none",cursor:"pointer",
            background:tf===t?C.btc:"transparent",
            color:tf===t?"#000":C.gray,
          }}>{t}</button>
        ))}
        {/* Séparateur */}
        <div style={{width:1,height:16,background:C.border,margin:"0 2px"}}/>
        {/* Bouton € / $ */}
        {setEur&&(
          <button onClick={()=>setEur(!eur)} style={{
            padding:"4px 7px",borderRadius:6,fontSize:10,fontWeight:600,
            border:`1px solid ${eur?C.btc:C.border}`,cursor:"pointer",
            background:eur?C.btc+"22":"transparent",
            color:eur?C.btc:C.gray,
            flexShrink:0,
          }}>{eur?"€":"$"}</button>
        )}
      </div>

      {/* Tooltip flottant — position fixed au dessus du titre */}
      {hover != null && (
        <div style={{
          position:"fixed", top:240, left:"50%", transform:"translateX(-50%)",
          zIndex:200, width:"92%", maxWidth:410,
          background:"rgba(10,12,18,0.97)", border:`1px solid ${C.border2}`,
          borderRadius:10, padding:"7px 12px",
          display:"flex", gap:14, flexWrap:"wrap", justifyContent:"center",
          boxShadow:"0 6px 24px rgba(0,0,0,.85)",
          pointerEvents:"none",
        }}>
          <div style={{fontSize:11,color:"#fff",fontWeight:600,width:"100%",textAlign:"center",marginBottom:1}}>
            {fmtDate(hDate)}
          </div>
          {[
            {color:C.orange, label:"CGIC", val:fmtGdb(hGc), sub:hGcB!=null?`base ${hGcB.toFixed(1)}`:null},
            {color:C.blue,   label:"CGIS", val:fmtGdb(hGs), sub:hGsB!=null?`base ${hGsB.toFixed(1)}`:null},
            {color:C.green,  label:"Portefeuille", val:hPortAbs!=null?`${cur}${fmtK(hPortAbs)}`:null, sub:hPortB!=null?`base ${hPortB.toFixed(1)}`:null},
          ].filter(x=>x.val).map((x,i)=>(
            <div key={i} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:8,height:8,borderRadius:2,background:x.color}}/>
                <span style={{fontSize:10,color:C.text2}}>{x.label}</span>
              </div>
              <span style={{fontSize:13,fontWeight:600,color:x.color}}>{x.val}</span>
              {x.sub&&<span style={{fontSize:9,color:C.gray}}>{x.sub}</span>}
            </div>
          ))}
        </div>
      )}
      <div style={{position:"relative"}}>

      {/* SVG */}
      <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H + 22}`}
        style={{ overflow: "visible", touchAction: "none", userSelect: "none" }}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        onTouchStart={onTouch} onTouchMove={onTouch} onTouchEnd={onTouchEnd1}>
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={PAD_L} y1={py(v)} x2={W - PAD_R} y2={py(v)} stroke={C.border} strokeWidth={0.4}/>
            <text x={PAD_L - 3} y={py(v) + 3} textAnchor="end" fill={C.text3} fontSize={6}>{v.toFixed(0)}</text>
          </g>
        ))}
        {p0abs != null && gridVals.map((v, i) => (
          <text key={i} x={W - PAD_R + 3} y={py(v) + 3} textAnchor="start" fill={C.green} fontSize={5.5} opacity={0.75}>
            {cur}{fmtK(b100ToPort(v))}
          </text>
        ))}
        <line x1={PAD_L} y1={py(100)} x2={W - PAD_R} y2={py(100)} stroke="rgba(255,255,255,.1)" strokeWidth={0.8} strokeDasharray="4,4"/>
        {makeLine(gcB, C.orange, true)}
        {makeLine(gsB, C.blue, true)}
        {makeLine(portB, C.green, false)}
        {hover != null && hi != null && (
          <g>
            <line x1={px(hi)} y1={2} x2={px(hi)} y2={H} stroke="rgba(255,255,255,.18)" strokeWidth={1} strokeDasharray="3,3"/>
            {[[gcB,C.orange],[gsB,C.blue],[portB,C.green]].map(([vals, color], si) => {
              const v = vals[hi]; if (v == null) return null;
              return <g key={si}>
                <circle cx={px(hi)} cy={py(v)} r={4.5} fill={C.bg1} stroke={color} strokeWidth={2}/>
                <circle cx={px(hi)} cy={py(v)} r={1.8} fill={color}/>
              </g>;
            })}
          </g>
        )}
        {dates.map((d, i) => {
          const isFirst=i===0, isLast=i===n-1, isHov=hover?.i===i;
          const step = Math.max(1, Math.floor(n / 5));
          if (!isFirst && !isLast && !isHov && i % step !== 0) return null;
          return <text key={i} x={px(i)} y={H + 13} textAnchor="middle"
            fill={isHov ? "#fff" : C.text3} fontSize={isHov ? 6.5 : 5.5} fontWeight={isHov ? 700 : 400}>
            {xLabel(d)}
          </text>;
        })}
      </svg>

      </div>{/* end tooltip wrapper */}
      {/* Legend */}
      <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 2, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
        {[
          { color: C.orange, label: `CGIC ${eur?"€"+(gcLive*src.usdEur).toFixed(2):"$"+gcLive.toFixed(2)}` },
          { color: C.blue,   label: `CGIS ${eur?"€"+(gsLive*src.usdEur).toFixed(2):"$"+gsLive.toFixed(2)}` },
          { color: C.green,  label: `Patrimoine ${cur}${fmtK(portToday)}` },
        ].map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 12, height: 2, background: l.color, borderRadius: 1 }}/>
            <span style={{ fontSize: 9, color: C.gray }}>{l.label}</span>
          </div>
        ))}
      </div>
    </>
  );

  return full ? (
    /* ── OVERLAY PLEIN ÉCRAN — orientation naturelle du téléphone ── */
    <div style={{
      position:"fixed", inset:0, zIndex:1000,
      background:C.bg,
      display:"flex", flexDirection:"column",
    }}>
      {/* Barre titre */}
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"12px 16px", flexShrink:0,
        background:C.bg1, borderBottom:`1px solid ${C.border}`,
      }}>
        <span style={{fontSize:14, fontWeight:600, color:C.btc}}>CGIC · CGIS · Patrimoine</span>
        <button onClick={()=>setFull(false)} style={{
          background:C.bg2, border:`1px solid ${C.border}`,
          borderRadius:8, padding:"6px 14px",
          color:C.text, fontSize:12, fontWeight:700, cursor:"pointer",
        }}>✕ Fermer</button>
      </div>
      {/* Graphique plein écran */}
      <div style={{flex:1, overflowY:"auto", padding:"12px 16px"}}>
        {chartContent(true)}
      </div>
    </div>
  ) : (
    /* ── VUE NORMALE ── */
    <div style={{background:C.bg1,borderRadius:12,padding:"10px 10px 6px",border:`1px solid ${C.border}`,marginBottom:7,position:"relative"}}>
      {chartContent(false)}
      {/* Bouton plein écran — coin bas droite */}
      <button onClick={()=>setFull(true)} title="Plein écran" style={{
        position:"absolute",bottom:8,right:8,zIndex:10,
        background:C.bg2,border:`1px solid ${C.border}`,
        borderRadius:6,width:22,height:22,
        display:"flex",alignItems:"center",justifyContent:"center",
        cursor:"pointer",fontSize:11,color:C.gray,lineHeight:1,
      }}>⛶</button>
    </div>
  );
}

function round2(v){ return Math.round(v * 100) / 100; }

/* ── PerfStrip: condensed P&L 1J/1S/1M + CGIC + CGIS ───
   Single compact row under the portfolio total header
─────────────────────────────────────────────────────── */
function PerfStrip({eur, EFF}){
  const usd=!eur;
  const _src = EFF||CURRENT;
  const rate = _src.eurUsd;
  const cur  = eur ? "€" : "$";
  // Utiliser les séries live (mises à jour par snapshots/refresh)
  const _DD   = liveDD   || DD;
  const _GDBS = sanitizeGDBS(liveGDBS || GDBS);
  // P&L calculés depuis _DD — col 2 = totalEUR
  const _ddAt = days => {
    const t=new Date(Date.now() + NC_OFFSET_MS); t.setDate(t.getUTCDate()-days);
    const ds=t.toISOString().slice(0,10);
    return _DD.reduceRight((a,r)=>a!=null?a:(r[0]<=ds&&r[2]!=null?r:null),null);
  };
  const _ddLast = _DD.reduceRight((a,r)=>a!=null?a:(r[2]!=null?r[2]:null),null);
  const _aoNow  = _src.totalEUR || _ddLast;
  // Variation : € = différence en €, $ = convertir les deux extrémités au taux de leur date
  const _pnlCell = days => {
    const ref = _ddAt(days);
    if(!ref) return {pnl:0, pct:0};
    const refEUR = ref[2];
    if(eur){
      const diff = _aoNow - refEUR;
      return {pnl:Math.round(diff), pct:refEUR?diff/refEUR:0};
    } else {
      // Convertir chaque valeur au taux de sa date
      const usdEurRef = ref[5] || _src.usdEur;
      const refUSD = Math.round(refEUR / usdEurRef);
      const nowUSD = Math.round(_aoNow / _src.usdEur);
      const diff = nowUSD - refUSD;
      return {pnl:diff, pct:refUSD?diff/refUSD:0};
    }
  };
  const _ao1j  = _ddAt(1);
  const _ao1s  = _ddAt(7);
  const _ao1m  = _ddAt(30);
  const _ao6m  = _ddAt(182);
  const _ao1y  = _ddAt(365);
  const cells = [
    { label:"1J",  ..._pnlCell(1)   },
    { label:"1S",  ..._pnlCell(7)   },
    { label:"1M",  ..._pnlCell(30)  },
    { label:"6M",  ..._pnlCell(182) },
    { label:"1A",  ..._pnlCell(365) },
  ];
  // Perfs CGIC / CGIS depuis _GDBS — tenant compte du taux de change si mode €
  const _gdbsAt = days => {
    const t=new Date(Date.now() + NC_OFFSET_MS); t.setDate(t.getUTCDate()-days);
    const ds=t.toISOString().slice(0,10);
    return _GDBS.reduceRight((a,r)=>a!=null?a:(r[0]<=ds&&r[1]?r:null),null);
  };
  // Taux de change à une date donnée (depuis _DD col 5)
  const _usdEurAt = days => {
    const t=new Date(Date.now() + NC_OFFSET_MS); t.setDate(t.getUTCDate()-days);
    const ds=t.toISOString().slice(0,10);
    const row = _DD.reduceRight((a,r)=>a!=null?a:(r[0]<=ds&&r[5]?r:null),null);
    return row ? row[5] : _src.usdEur; // fallback taux actuel
  };
  const usdEurNow = _src.usdEur;
  const _gcNow = calcGdbPrices(_src).gdbC;
  const _gsNow = calcGdbPrices(_src).gdbS;
  // Variation : en $ = ratio pur, en € = corrigé du taux de change
  const _gpH = calcGdbPrices(_src);
  const _cmH = (typeof CRYPTO_MONTHLY!=="undefined")?CRYPTO_MONTHLY:null;
  const _smH = (typeof STOCKS_MONTHLY!=="undefined")?STOCKS_MONTHLY:null;
  const _gcPerf = d => {
    const t=new Date(Date.now()+NC_OFFSET_MS); t.setDate(t.getUTCDate()-d); const ds=t.toISOString().slice(0,10);
    return fundPeriodPerf("CGIC", ds, _cmH, _smH, (_gpH.gdbCfondsUSD!=null?_gpH.gdbCfondsUSD:0)*usdEurNow);
  };
  const _gsPerf = d => {
    const t=new Date(Date.now()+NC_OFFSET_MS); t.setDate(t.getUTCDate()-d); const ds=t.toISOString().slice(0,10);
    return fundPeriodPerf("CGIS", ds, _cmH, _smH, (_gpH.gdbSfondsUSD!=null?_gpH.gdbSfondsUSD:0)*usdEurNow);
  };
  // Prix indices JCGI depuis _GDBS
  const _gdbs26 = _GDBS.filter(r=>r[0]>='2026-01-01');
  // v23.25 — lire EFF.gdbS/gdbC (valeur officielle posée au boot/refresh/trade),
  // PAS calcGdbPrices(EFF) qui recalcule sur des prix périmés au boot local.
  const _gsT = (EFF||CURRENT).gdbS || CURRENT.gdbS;
  const _gcT = (EFF||CURRENT).gdbC || CURRENT.gdbC;
  const gcPrice = eur ? (_gcT * (EFF||CURRENT).usdEur).toFixed(2) : _gcT.toFixed(2);
  const gsPrice = eur ? (_gsT * (EFF||CURRENT).usdEur).toFixed(2) : _gsT.toFixed(2);
  const gcCur = eur ? "€" : "$";
  const gdb = [
    { label:"CGIC", price:gcPrice, d:_gcPerf(1), w:_gcPerf(7), m:_gcPerf(30), color:C.orange },
    { label:"CGIS", price:gsPrice, d:_gsPerf(1), w:_gsPerf(7), m:_gsPerf(30), color:C.blue },
  ];
  return(
    <div style={{marginTop:10,marginBottom:10}}>
      {/* Row 1 — P&L 1J / 1S / 1M / 6M / 1A */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4,marginBottom:6}}>
        {cells.map((c,i)=>(
          <div key={i} style={{
            background:C.bg2, borderRadius:8, padding:"6px 5px",
            border:`1px solid ${C.border}`, textAlign:"center",
          }}>
            <div style={{fontSize:8,color:C.gray,marginBottom:2}}>{c.label}</div>
            <div style={{fontSize:11,fontWeight:600,color:clr(c.pnl),letterSpacing:-.3}}>
              {c.pnl>=0?"+":""}{cur}{fmtK(Math.abs(c.pnl))}
            </div>
            <div style={{
              display:"inline-block",fontSize:8,fontWeight:700,
              color:clr(c.pct),background:clr(c.pct)+"18",
              borderRadius:3,padding:"1px 3px",marginTop:1,
            }}>{fmtP(c.pct,1)}</div>
          </div>
        ))}
      </div>
      {/* Row 2 — CGIC and CGIS */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
        {gdb.map((g,i)=>(
          <div key={i} style={{
            background:C.bg2, borderRadius:9, padding:"7px 9px",
            border:`1px solid ${C.border}`, display:"flex", gap:8, alignItems:"center",
          }}>
            <div style={{flex:1}}>
              <div style={{fontSize:9,color:C.gray,marginBottom:1}}>{g.label}</div>
              <div style={{fontSize:14,fontWeight:600,color:g.color}}>{gcCur}{g.price}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:1,alignItems:"flex-end"}}>
              {[["1J",g.d],["1S",g.w],["1M",g.m]].map(([tf,v])=>(
                <div key={tf} style={{display:"flex",alignItems:"center",gap:3}}>
                  <span style={{fontSize:8,color:C.text3,width:12}}>{tf}</span>
                  <span style={{
                    fontSize:9,fontWeight:700,color:clr(v),
                    background:clr(v)+"18",borderRadius:3,padding:"0px 4px",
                  }}>{fmtP(v,1)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── KpiBlock — P&L sur une timeframe ──────────────────
   pnl: valeur absolue €, pct: ratio, unit, color
─────────────────────────────────────────────────────── */
function KpiBlock({label, pnl, pct, unit="€", val, sub, color}){
  const isPos = (pnl??pct??0) >= 0;
  const c = pnl===null ? color : clr(pnl);
  return(
    <div style={{
      background:C.bg2, borderRadius:10, padding:"9px 10px",
      border:`1px solid ${C.border}`, display:"flex", flexDirection:"column", gap:2,
    }}>
      <div style={{fontSize:9, color:C.gray, textTransform:"uppercase", letterSpacing:.5}}>{label}</div>
      {val!=null
        ? <div style={{fontSize:14, fontWeight:600, color}}>{val}</div>
        : <div style={{fontSize:14, fontWeight:600, color:c}}>
            {(pnl??0)>=0?"+":""}{unit}{fmtK(Math.abs(pnl??0))}
          </div>
      }
      <div style={{display:"flex", alignItems:"center", gap:4}}>
        <span style={{
          fontSize:10, fontWeight:700, color: clr(pct??0),
          background: clr(pct??0)+"18", borderRadius:4, padding:"1px 5px",
        }}>
          {fmtP(pct??0)}
        </span>
        {sub && <span style={{fontSize:9, color:C.gray}}>{sub}</span>}
      </div>
    </div>
  );
}

/* ── GdbBlock — cours + 3 timeframes sur 2 lignes ──────
─────────────────────────────────────────────────────── */
function GdbBlock({label, price, d, w, m, color}){
  const rows=[["1J",d],["1S",w],["1M",m]];
  return(
    <div style={{
      background:C.bg2, borderRadius:10, padding:"9px 10px",
      border:`1px solid ${C.border}`,
    }}>
      <div style={{fontSize:9, color:C.gray, textTransform:"uppercase", letterSpacing:.5, marginBottom:3}}>{label}</div>
      <div style={{fontSize:15, fontWeight:600, color, marginBottom:5}}>${price.toFixed(2)}</div>
      <div style={{display:"flex", flexDirection:"column", gap:2}}>
        {rows.map(([tf,v])=>(
          <div key={tf} style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
            <span style={{fontSize:9, color:C.text3, width:16}}>{tf}</span>
            <span style={{
              fontSize:10, fontWeight:700, color:clr(v),
              background:clr(v)+"18", borderRadius:4, padding:"1px 6px",
            }}>{fmtP(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── buildSections: shared between Portfolio + Allocation ─ */

/* Mini SVG logos pour les banques sans emoji natif */
const BankLogo = {
  KUCOIN: () => (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <rect width="22" height="22" rx="5" fill="#000"/>
      <text x="11" y="16" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#0EAF7C" fontFamily="Arial,sans-serif">K</text>
    </svg>
  ),

  DeBlock: ()=>(
    <svg width="22" height="22" viewBox="0 0 22 22">
      <rect x="2" y="2" width="18" height="18" rx="5" fill="#1A1A2E"/>
      <rect x="2" y="2" width="18" height="18" rx="5" fill="url(#db)" opacity="0.9"/>
      <defs>
        <linearGradient id="db" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6C63FF"/>
          <stop offset="100%" stopColor="#3B82F6"/>
        </linearGradient>
      </defs>
      <text x="11" y="15.5" textAnchor="middle" fontSize="10" fontWeight="900" fill="white">D</text>
    </svg>
  ),
  Bourso: ()=>(
    <svg width="22" height="22" viewBox="0 0 22 22">
      <rect x="0" y="0" width="22" height="22" rx="5" fill="#E8001C"/>
      <text x="11" y="15.5" textAnchor="middle" fontSize="9" fontWeight="900" fill="white">Bso</text>
    </svg>
  ),
  /* KuCoin — logo vert teal */
  EURO: ()=>(
    <svg width="22" height="22" viewBox="0 0 22 22">
      <rect x="0" y="0" width="22" height="22" rx="5" fill="#1A1A1A"/>
      <circle cx="11" cy="11" r="8" fill="none" stroke="#00D4AA" strokeWidth="2"/>
      <text x="11" y="15" textAnchor="middle" fontSize="10" fontWeight="900" fill="#00D4AA">K</text>
    </svg>
  ),
  /* IBKR — courbe blanche sur fond bleu marine */
  IBKR: ()=>(
    <svg width="22" height="22" viewBox="0 0 22 22">
      <rect x="0" y="0" width="22" height="22" rx="5" fill="#003087"/>
      <polyline points="3,17 7,13 11,15 15,8 19,5" fill="none" stroke="#FF6B00" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  /* BCI — logo stylisé rouge/blanc comme la Banque de la Réunion */
  BCI: ()=>(
    <svg width="22" height="22" viewBox="0 0 22 22">
      <rect x="0" y="0" width="22" height="22" rx="5" fill="#C8102E"/>
      <rect x="4" y="7" width="14" height="2" rx="1" fill="white"/>
      <rect x="4" y="10" width="14" height="2" rx="1" fill="white"/>
      <rect x="4" y="13" width="14" height="2" rx="1" fill="white"/>
    </svg>
  ),
};

const TICKER_ICONS_BASE = {
  BTC:   "₿",
  QQQ:   "🖥️",
  AIA:   "🌏",
  JEDI:  "🚀",
  AVIO:  "✈️",
  ROBO:  "🤖",
  XLE:   "⚡",
  OIH:   "🛢️",
  AI:    "☁️",
  DJT:   "☢️",
  GOLD:  "🏅",
  BCI:   "🏦",
  IBKR:  "💼",
  STRC:  "₿",
  ANET:  "🌐",
  HUT:   "⛏️",
  "2CRSI": "🖥️",
  USD:   "💵",
  EURO:  "💶",
};
// Proxy qui fusionne les icônes custom (CUSTOM_ICONS écrase TICKER_ICONS_BASE)
const TICKER_ICONS = new Proxy({}, {
  get(_, key){ return CUSTOM_ICONS[key] || TICKER_ICONS_BASE[key]; },
  has(_, key){ return key in CUSTOM_ICONS || key in TICKER_ICONS_BASE; },
});

// ── Helpers ICON_DB ───────────────────────────────────────────────────────────
// Synchronise CUSTOM_ICONS depuis ICON_DB (pour compatibilité Proxy ci-dessus)
function syncCustomIcons(){
  Object.keys(ICON_DB).forEach(t => {
    if(ICON_DB[t]?.user) CUSTOM_ICONS[t] = ICON_DB[t].user;
    else delete CUSTOM_ICONS[t];
  });
}
// Retourne la meilleure icône disponible pour un ticker :
//   1. icône user choisie (emoji/texte)
//   2. URL logo FMP (à afficher comme <img>)
//   3. icône base hardcodée
//   4. null (fallback catégorie)
function getBestIcon(ticker){
  const db = ICON_DB[ticker];
  if(db?.user)  return { type:"emoji", value: db.user };
  if(db?.fmp)   return { type:"img",   value: db.fmp  };
  const base = TICKER_ICONS_BASE[ticker];
  if(base)      return { type:"emoji", value: base };
  // v4.18 — logo gratuit de secours (Parqet, sans clé FMP) ; masqué si introuvable (onError)
  return { type:"img", value: "https://assets.parqet.com/logos/symbol/"+encodeURIComponent(ticker)+"?format=png", fallback:true };
}
// Écrit dans ICON_DB, resync CUSTOM_ICONS, persiste en localStorage
function setIconDb(ticker, patch){
  ICON_DB[ticker] = { ...(ICON_DB[ticker]||{}), ...patch };
  syncCustomIcons();
  lsWriteIcons(serializeIconDb()); // persistance locale immédiate
}
// Sérialise ICON_DB pour KV (clé cgi_icons)
function serializeIconDb(){ return JSON.parse(JSON.stringify(ICON_DB)); }
// Désérialise depuis KV et resync
// Désérialise depuis KV et resync + persiste en localStorage
function loadIconDb(raw){
  if(!raw || typeof raw !== "object") return;
  // Support ancien format { ticker: "emoji" } → migration vers nouveau format
  Object.entries(raw).forEach(([t, v]) => {
    if(typeof v === "string") ICON_DB[t] = { user: v, fmp: null };
    else if(typeof v === "object" && v !== null) ICON_DB[t] = { user: v.user||null, fmp: v.fmp||null };
  });
  syncCustomIcons();
  lsWriteIcons(serializeIconDb()); // persister immédiatement en localStorage
}
// URLs logos officiels des comptes bancaires (stockés en .fmp dans ICON_DB)
const BANK_LOGOS = {
  Bourso:  "https://www.boursorama.com/content/branding/square-bourso-arrow-200x200.png",
  DeBlock: "https://play-lh.googleusercontent.com/Tu3s0i6GtutjWCrAYY7HPIwanBnScOccRdYNaDmjebSyBAC2WCmjwdfBva6bp9JGig",
  BCI:     "https://play-lh.googleusercontent.com/ivyTl0CBXQQ8OzSJKt2kPBQtXxoQG-BqZ9_Pyr_TDQMfEsMjuKMqz2ax5AK_9j2gXoc",
  // Tickers EU que FMP ne reconnaît pas — logos hardcodés
  GOLD:    "https://www.amundi.com/themes/custom/amundi/logo.png",
  AI:      "https://upload.wikimedia.org/wikipedia/fr/thumb/3/38/Logo_Air_Liquide.svg/200px-Logo_Air_Liquide.svg.png",
  JEDI:    "https://cdn.getmimo.com/uploads/2024/01/Mimo_Logo_250x250.png",
  // Banque FR + cryptos (fallback fiable, parqet ne les a pas)
  LCL:     "https://www.google.com/s2/favicons?sz=128&domain=lcl.fr",
  ETH:     "https://assets.coingecko.com/coins/images/279/large/ethereum.png",
  BTC:     "https://assets.coingecko.com/coins/images/1/large/bitcoin.png",
};

// Injecte les logos banque dans ICON_DB (.fmp) sans écraser le choix utilisateur (.user)
function seedBankLogos(){
  Object.entries(BANK_LOGOS).forEach(([t, url]) => {
    if(!ICON_DB[t]) ICON_DB[t] = { user: null, fmp: null };
    ICON_DB[t].fmp = url; // toujours mettre à jour le fmp (URL officielle fixe)
    // .user non touché : respecte le choix de l'utilisateur
  });
  syncCustomIcons();
}

// Charge ICON_DB depuis localStorage au démarrage (avant KV, instantané)
function initIconDbFromLS(){
  const raw = lsReadIcons();
  if(raw && typeof raw === "object" && Object.keys(raw).length > 0){
    loadIconDb(raw);
  }
  // Toujours injecter les logos banque (URL fixe, même si localStorage vide)
  seedBankLogos();
  lsWriteIcons(serializeIconDb());
}
// Appel immédiat au chargement du module (avant React)
initIconDbFromLS();

/* ─── TICKER ICON COMPONENT ─────────────────────────────────────────────────
   Affiche la meilleure icône disponible pour un ticker.
   En cliquant dessus : mini-modal inline pour choisir entre user/fmp/base.
   Le clic sur le reste de la ligne déclenche le TickerModal habituel.
─────────────────────────────────────────────────────────────────────────── */
function TickerIcon({ ticker, size=32, color="#ffffff22", onIconSaved, iconDbVersion=0 }){
  const [open, setOpen] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [imgFail, setImgFail] = useState(false);
  React.useEffect(function(){ setImgFail(false); }, [ticker]);
  const db = ICON_DB[ticker] || {};
  const best = getBestIcon(ticker);

  const saveIcon = async (patch) => {
    setSaving(true);
    setIconDb(ticker, patch);
    try {
      await fetch(CF_WORKER_URL+"/write-bases", {
        method:"POST",
        headers:{"Content-Type":"application/json","X-Auth-Key":CF_AUTH_KEY},
        body: JSON.stringify({ cgi_icons: serializeIconDb() }),
        signal: AbortSignal.timeout(18000),
      });
    } catch(e){}
    setSaving(false);
    setOpen(false);
    if(onIconSaved) onIconSaved(ticker);
  };

  return(
    <>
      {/* Zone icône — clic ouvre le mini-modal, ne propage pas vers le TickerModal */}
      <div
        onClick={e => { e.stopPropagation(); setUserInput(db.user||""); setOpen(true); }}
        style={{
          width:size, height:size, borderRadius:size*0.25, flexShrink:0,
          background: color, display:"flex", alignItems:"center",
          justifyContent:"center", fontSize:size*0.5, cursor:"pointer",
          position:"relative",
        }}
        title="Changer l'icône"
      >
        {best?.type==="img" && !imgFail
          ? <img src={best.value} alt={ticker} style={{width:"80%",height:"80%",objectFit:"contain",borderRadius:4}}
              onError={e=>{ if(!e.target.dataset.fb && !best.fallback){ e.target.dataset.fb="1"; e.target.src="https://assets.parqet.com/logos/symbol/"+encodeURIComponent(ticker)+"?format=png"; } else { setImgFail(true); } }}/>
          : (best?.type==="emoji" ? best.value : ticker.slice(0,3))
        }
      </div>

      {/* Mini-modal de sélection d'icône */}
      {open && (
        <div onClick={e=>e.stopPropagation()} style={{
          position:"fixed",inset:0,zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",
          background:"#00000088",
        }}>
          <div style={{background:C.bg2,borderRadius:16,padding:"20px 18px",width:280,border:`1px solid ${C.border}`,boxShadow:"0 8px 32px #0008"}}>
            <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:14}}>
              Icône — <span style={{color:C.btc,fontFamily:C.font}}>{ticker}</span>
            </div>

            {/* Option FMP officielle */}
            {db.fmp && (
              <button onClick={()=>saveIcon({user:null})} style={{
                display:"flex",alignItems:"center",gap:10,width:"100%",background:!db.user?C.btc+"22":"transparent",
                border:`1px solid ${!db.user?C.btc:C.border}`,borderRadius:10,padding:"8px 10px",cursor:"pointer",marginBottom:8,
              }}>
                <img src={db.fmp} alt="" style={{width:28,height:28,objectFit:"contain",borderRadius:4,background:"#fff"}} onError={e=>e.target.style.display="none"}/>
                <div style={{textAlign:"left"}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.text}}>Logo officiel</div>
                  <div style={{fontSize:9,color:C.gray}}>Source FMP</div>
                </div>
                {!db.user && <span style={{marginLeft:"auto",fontSize:11,color:C.btc}}>✓ actif</span>}
              </button>
            )}

            {/* Icône base hardcodée */}
            {TICKER_ICONS_BASE[ticker] && (
              <button onClick={()=>saveIcon({user:TICKER_ICONS_BASE[ticker]})} style={{
                display:"flex",alignItems:"center",gap:10,width:"100%",
                background:db.user===TICKER_ICONS_BASE[ticker]?C.teal+"22":"transparent",
                border:`1px solid ${db.user===TICKER_ICONS_BASE[ticker]?C.teal:C.border}`,
                borderRadius:10,padding:"8px 10px",cursor:"pointer",marginBottom:8,
              }}>
                <span style={{fontSize:22}}>{TICKER_ICONS_BASE[ticker]}</span>
                <div style={{textAlign:"left"}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.text}}>Icône par défaut</div>
                </div>
                {db.user===TICKER_ICONS_BASE[ticker] && <span style={{marginLeft:"auto",fontSize:11,color:C.teal}}>✓ actif</span>}
              </button>
            )}

            {/* Icône personnalisée */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,color:C.gray,marginBottom:5,fontWeight:700}}>Icône personnalisée (emoji)</div>
              <div style={{display:"flex",gap:6}}>
                <input
                  value={userInput}
                  onChange={e=>setUserInput(e.target.value)}
                  placeholder="🟩"
                  style={{flex:1,background:C.bg1,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 8px",color:C.text,fontSize:18,outline:"none",minWidth:0}}
                />
                <button
                  onClick={()=>{ if(userInput.trim()) saveIcon({user:userInput.trim()}); }}
                  disabled={!userInput.trim()||saving}
                  style={{padding:"6px 8px",borderRadius:8,background:C.btc,border:"none",cursor:"pointer",fontSize:10,fontWeight:600,color:"#000",opacity:userInput.trim()?1:0.4,flexShrink:0,whiteSpace:"nowrap"}}
                >
                  {saving?"…":"✓"}
                </button>
              </div>
            </div>

            {/* Réinitialiser */}
            {(db.user||db.fmp) && (
              <button onClick={()=>saveIcon({user:null,fmp:null})} style={{
                display:"block",width:"100%",background:"transparent",border:`1px solid ${C.red}44`,
                borderRadius:8,padding:"6px",cursor:"pointer",fontSize:10,color:C.red,marginBottom:10,
              }}>
                ↺ Réinitialiser (catégorie par défaut)
              </button>
            )}

            <button onClick={()=>setOpen(false)} style={{
              display:"block",width:"100%",background:C.bg3,border:"none",borderRadius:8,
              padding:"8px",cursor:"pointer",fontSize:11,color:C.text,fontWeight:700,
            }}>Fermer</button>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── PORTFOLIO — nouvelle structure unifiée ─────────────────────────
   Remplace la distinction crypto/stocks/bank par une seule collection
   d'items avec catégorie. Utilisée dans la v19+ pour buildSections.
   Structure : { date, items: [{t, cat, qty, pa, live, val, pnl, pct}] }
   Catégories : "Crypto", "Indices", "Picking", "Or", "Cash Dip", "Cash Matelas"
─────────────────────────────────────────────────────────────────────── */
function buildPortfolio(src){
  const items = [
    // Crypto
    ...src.crypto.items.map(x=>({...x, cat:"Crypto"})),
    // Stocks (Indices, Picking, Or, Cash Dip)
    ...src.stocks.items.map(x=>({...x})),
    // Banque (Cash Matelas)
    ...Object.entries(src.bank.breakdown).map(([k,v])=>({
      t:k, cat:"Cash Matelas", qty:1, pa:v, live:v,
      val:Math.round(v * (src.eurUsd||1.173)),
      valEUR:v, pnl:0, pct:0,
    })),
  ];
  return { date: src.crypto?.date || _DD[_DD.length-1]?.[0], items };
}

function buildSections(L){
  const src = L || CURRENT;
  const usdEur = src.usdEur;
  const eurUsd = src.eurUsd || 1/usdEur;

  // Si portfolio.items disponible → source unique de vérité
  if(src.portfolio?.items?.length > 0){
    const pi = src.portfolio.items;
    const bycat = cat => pi.filter(x=>x.cat===cat);
    const sum   = items => items.reduce((s,x)=>s+(x.val||0),0);
    const total = sum(pi.filter(x=>x.cat!=="Cash Matelas"));

    // Synchroniser crypto/stocks/bank depuis portfolio pour compatibilité
    src.crypto = src.crypto || {};
    src.crypto.items = bycat("Crypto");
    src.crypto.total = sum(bycat("Crypto"));
    src.stocks = src.stocks || {};
    src.stocks.items = pi.filter(x=>x.cat!=="Crypto"&&x.cat!=="Cash Matelas");
    src.stocks.total = sum(src.stocks.items);
    src.bank   = src.bank   || {};
    src.bank.totalEUR   = bycat("Cash Matelas").reduce((s,x)=>s+(x.valEUR||0),0);
    src.bank.breakdown  = Object.fromEntries(bycat("Cash Matelas").map(x=>[x.t, x.valEUR||0]));
  }

  // Totaux réels depuis les items live
  const cryptoUSD  = src.crypto.total;
  const indicesUSD = src.stocks.items.filter(x=>x.cat==="Indices").reduce((s,x)=>s+x.val,0);
  const pickingUSD = src.stocks.items.filter(x=>x.cat==="Picking").reduce((s,x)=>s+x.val,0);
  const orUSD      = src.stocks.items.filter(x=>x.cat==="Or").reduce((s,x)=>s+x.val,0);
  const cashStocksUSD = src.stocks.items.filter(x=>x.cat==="Cash").reduce((s,x)=>s+x.val,0);
  // Cash Dip = tous les items cat="Cash" (EURO, STRC, USD négatif...)
  const cashDipUSD = cashStocksUSD;  // peut être négatif si USD < 0
  // Cash Matelas = comptes bancaires (BCI + Bourso + DeBlock)
  const cashMatelasUSD = Math.round(src.bank.totalEUR * eurUsd);
  const bankUSD    = cashDipUSD + cashMatelasUSD;
  const grandUSD   = cryptoUSD + indicesUSD + pickingUSD + orUSD + bankUSD;  // somme des catégories = référence unique
  const pct = v => grandUSD > 0 ? parseFloat((v / grandUSD * 100).toFixed(2)) : 0;

  return [
    {
      key:"bitcoin", n:"Cryptos", icon:"₿", color:C.btc,
      totalUSD: cryptoUSD,
      totalEUR: Math.round(cryptoUSD * usdEur),
      pct: pct(cryptoUSD),
      items: src.crypto.items.map(x=>({
        ticker: x.t, icon: TICKER_ICONS[x.t]||"₿",
        label: ({BTC:"Bitcoin",ETH:"Ethereum",SOL:"Solana",DOGE:"Dogecoin",TAO:"Bittensor"}[x.t]) || x.t,
        detail: `${fmtQty(x.qty)} ${x.t} · $${(x.live||0).toLocaleString("fr-FR")}`,
        valUSD: x.val, valEUR: Math.round(x.val*usdEur),
        pnl: x.pnl, pct: x.pct,
        pa: x.pa, live: x.live,
        qty: x.qty, investi: x.pa*x.qty,
      })),
    },
    {
      key:"indices", n:"Indices ETF", icon:"📈", color:"#4A90D9",
      totalUSD: indicesUSD,
      totalEUR: Math.round(indicesUSD*usdEur),
      pct: pct(indicesUSD),
      items: src.stocks.items.filter(x=>x.cat==="Indices").map(x=>({
        ticker: x.t, icon: TICKER_ICONS[x.t]||"📈", label: x.t,
        detail: `${fmtQty(x.qty)} parts · $${x.live.toFixed(2)}`,
        valUSD: x.val, valEUR: Math.round(x.val*usdEur),
        pnl: x.pnl, pct: x.pct,
        pa: x.pa, live: x.live,
        qty: x.qty, investi: x.pa*x.qty,
      })),
    },
    {
      key:"picking", n:"Stocks", icon:"🎯", color:"#7B68EE",
      totalUSD: pickingUSD,
      totalEUR: Math.round(pickingUSD*usdEur),
      pct: pct(pickingUSD),
      items: src.stocks.items.filter(x=>x.cat==="Picking").map(x=>({
        ticker: x.t, icon: TICKER_ICONS[x.t]||"🎯",
        label: x.t,
        detail: `${fmtQty(x.qty)} parts · $${x.live.toFixed(2)}`,
        valUSD: x.val, valEUR: Math.round(x.val*usdEur),
        pnl: x.pnl, pct: x.pct,
        pa: x.pa, live: x.live,
        qty: x.qty, investi: x.pa*x.qty,
      })),
    },
    {
      key:"or", n:"Or / Gold", icon:"🥇", color:"#EAB308",
      totalUSD: orUSD,
      totalEUR: Math.round(orUSD*usdEur),
      pct: pct(orUSD),
      items: src.stocks.items.filter(x=>x.cat==="Or").map(x=>({
        ticker: x.t, icon: TICKER_ICONS[x.t]||"🥇", label:"Gold ETF",
        detail: `${fmtQty(x.qty)} parts · $${x.live.toFixed(2)}`,
        valUSD: x.val, valEUR: Math.round(x.val*usdEur),
        pnl: x.pnl, pct: x.pct,
        pa: x.pa, live: x.live,
        qty: x.qty, investi: x.pa*x.qty,
      })),
    },
    {
      key:"cashdip", n:"Cash Dip", icon:"💰", color:C.green,
      totalUSD: cashDipUSD,
      totalEUR: Math.round(cashDipUSD*usdEur),
      pct: pct(cashDipUSD),
      items: (()=>{
        // Chercher dans portfolio.items ET stocks.items (selon ce qui est disponible)
        const allItems = src.portfolio?.items?.length>0 ? src.portfolio.items : src.stocks.items;
        const findItem = t => allItems.find(x=>x.t===t) || src.stocks.items?.find(x=>x.t===t);
        const usdItem  = findItem("USD");
        const euroItem = findItem("EURO");
        const strcItem = findItem("STRC");
        const out = [];
        // IBKR Dollar
        if(usdItem){
          const qty = usdItem.qty||0;
          const val = usdItem.val!=null ? usdItem.val : qty;
          out.push({
            ticker:"USD", icon:"💵", label:"IBKR Dollar",
            detail:`${qty<0?"-":""}$${Math.abs(qty).toLocaleString("fr-FR")} cash USD IBKR`,
            valUSD: val, valEUR: Math.round(val*usdEur),
            pnl:0, pct:0, pa:"1.0000", live:"1.0000", qty, investi:qty,
          });
        } else {
          // Valeur fixe si non trouvée
          out.push({ticker:"USD",icon:"💵",label:"IBKR Dollar",detail:"$-5 430 cash USD IBKR",valUSD:-5430,valEUR:Math.round(-5430*usdEur),pnl:0,pct:0,pa:"1.0000",live:"1.0000",qty:-5430,investi:-5430});
        }
        // IBKR Euro
        if(euroItem){
          const qty = euroItem.qty||0;
          const val = euroItem.val!=null ? euroItem.val : Math.round(qty*eurUsd);
          out.push({
            ticker:"EURO", icon:"💶", label:"IBKR Euro",
            detail:`€${qty.toLocaleString("fr-FR")} en cash IBKR`,
            valUSD: val, valEUR: qty,
            pnl:0, pct:0,
            pa:(euroItem.pa||1.17).toFixed(4),
            live:(euroItem.live||eurUsd).toFixed(4),
            qty, investi:(euroItem.pa||1.17)*qty,
          });
        } else {
          out.push({ticker:"EURO",icon:"💶",label:"IBKR Euro",detail:"€2 240 en cash IBKR",valUSD:2603,valEUR:2240,pnl:0,pct:0,pa:"1.1700",live:eurUsd.toFixed(4),qty:2240,investi:2621});
        }
        // Tous les autres instruments en categorie Cash (STRC, JPY, ^TNX, ...) -> actifs normaux
        allItems.filter(function(x){return x.cat==="Cash" && ["USD","EURO","KUCOIN"].indexOf((x.t||"").toUpperCase())<0 && x.qty>0;})
          .forEach(function(it){
            out.push({
              ticker: it.t, icon: TICKER_ICONS[it.t]||"💵", label: it.t,
              detail: fmtQty(it.qty)+" parts · $"+(it.live||0).toFixed(2),
              valUSD: it.val, valEUR: Math.round((it.val||0)*usdEur),
              pnl: it.pnl||0, pct: it.pct||0,
              pa: it.pa||0, live: it.live||0,
              qty: it.qty, investi: (it.pa||0)*(it.qty||0),
            });
          });
        // KuCoin
        // KuCoin — wallet crypto, peut être à 0 ou négatif
        const kucoinItem = allItems.find(x=>x.t==="KUCOIN") || src.stocks.items?.find(x=>x.t==="KUCOIN");
        const kQty  = kucoinItem?.qty  ?? 0;
        const kVal  = kucoinItem?.val  ?? 0;
        const kLive = kucoinItem?.live ?? 0;
        const kPA   = kucoinItem?.pa   ?? 0;
        out.push({
          ticker:"KUCOIN", icon:null, iconComponent:"KUCOIN", label:"KuCoin",
          detail: kQty === 0 ? "Compte vide — rattaché CGIC"
                : kQty > 0  ? `${kQty} USDT · live $${kLive}`
                :              `${kQty} USDT (découvert)`,
          valUSD: kVal, valEUR: Math.round(kVal*usdEur),
          pnl: kucoinItem?.pnl ?? 0,
          pct: kucoinItem?.pct ?? 0,
          pa:   String(kPA),
          live: String(kLive),
          qty:  kQty,
          investi: kPA * kQty,
        });
        return out;
      })(),
    },
    {
      key:"matelas", n:"Cash Matelas", icon:"🏦", color:C.gray,
      totalUSD: cashMatelasUSD,
      totalEUR: src.bank.totalEUR,
      pct: pct(cashMatelasUSD),
      items: Object.entries(src.bank.breakdown).map(([k,v])=>({
        ticker: k, icon: TICKER_ICONS[k]||"🏦",
        iconComponent: k==="Bourso"?"Bourso":k==="DeBlock"?"DeBlock":k==="BCI"?"BCI":null,
        label: k, detail:"Compte courant / Épargne",
        valUSD: Math.round(v*eurUsd), valEUR: v,
        pnl: 0, pct: 0,
      })),
    },
  ];
}

/* ═══════════════════════════════════════════════════════════
   #61 — SOURCE DE CALCUL UNIQUE
   computePortfolioModel(src) : LE modèle canonique du patrimoine.
   buildSections = vérité des positions ; tout (hero, JCGI, Stats, snapshot)
   doit lire ce résultat pour garantir des chiffres identiques partout.
   ═══════════════════════════════════════════════════════════ */
function computePortfolioModel(src){
  const s = src || (typeof CURRENT!=="undefined"?CURRENT:{});
  const ue = s.usdEur || 0.92;
  const sections = buildSections(s);
  const totalUSD = sections.reduce((a,sec)=>a+(sec.totalUSD||0),0);
  // Agrégation par catégorie (mêmes règles que l'overview)
  const agg = {};
  sections.forEach(sec=>{
    let name;
    if(sec.n==="Crypto"||sec.n==="Cryptos") name="Crypto";
    else if(sec.n==="Indices ETF") name="Indices";
    else if(sec.n==="Stock Picking"||sec.n==="Stocks") name="Picking";
    else if(sec.n==="Or / Gold") name="Or";
    else name="Cash";
    if(!agg[name]) agg[name]={usd:0,pnl:0,investi:0};
    agg[name].usd += (sec.totalUSD||0);
    agg[name].pnl += sec.items.reduce((a,x)=>a+(x.pnl||0),0);
    agg[name].investi += sec.items.reduce((a,x)=>a+(x.investi||0),0);
  });
  const cryptoUSD = (agg["Crypto"]&&agg["Crypto"].usd)||0;
  const stocksUSD = ["Indices","Picking","Or"].reduce((a,n)=>a+((agg[n]&&agg[n].usd)||0),0);
  const cashUSD   = (agg["Cash"]&&agg["Cash"].usd)||0;
  return {
    src:s, usdEur:ue, sections, agg,
    totalUSD:Math.round(totalUSD), totalEUR:Math.round(totalUSD*ue),
    cryptoUSD:Math.round(cryptoUSD), stocksUSD:Math.round(stocksUSD), cashUSD:Math.round(cashUSD),
  };
}

/* ═══════════════════════════════════════════════════════════
   #61 — TRONC DE VÉRITÉ : registre central d'audit
   - computePortfolioModel = LA référence canonique.
   - Chaque bloc déclare la valeur qu'il AFFICHE via cgiReport(source, {...}).
   - __cgiAudit() (console) compare tous les blocs à la référence et
     signale d'où vient un écart éventuel.
   ═══════════════════════════════════════════════════════════ */
var CGI_TRUTH = { ref:null, refTs:0, sources:{} };
function cgiSetRef(model){
  if(model && model.totalUSD){
    CGI_TRUTH.ref = { totalUSD:model.totalUSD, totalEUR:model.totalEUR,
      cryptoUSD:model.cryptoUSD, stocksUSD:model.stocksUSD, cashUSD:model.cashUSD,
      usdEur:model.usdEur };
    CGI_TRUTH.refTs = Date.now();
  }
}
function cgiReport(source, vals){ try{ CGI_TRUTH.sources[source] = Object.assign({}, CGI_TRUTH.sources[source]||{}, vals, {ts:Date.now()}); }catch(e){} }
function cgiAudit(){
  const ref = CGI_TRUTH.ref || {};
  const tol = 0.012; // 1,2 % de tolérance (dérive de prix entre deux lectures)
  const rows = [];
  const ecarts = [];
  Object.keys(CGI_TRUTH.sources).forEach(function(src){
    const v = CGI_TRUTH.sources[src];
    const row = { source:src };
    ["totalUSD","cryptoUSD","stocksUSD","cgicPnl","cgisPnl"].forEach(function(k){
      if(v[k]!=null) row[k]=v[k];
    });
    rows.push(row);
    // écart vs référence sur les montants
    ["totalUSD","cryptoUSD","stocksUSD"].forEach(function(k){
      if(v[k]!=null && ref[k]!=null && ref[k]!==0){
        const d=Math.abs(v[k]-ref[k])/Math.abs(ref[k]);
        if(d>tol) ecarts.push(src+" · "+k+" = "+v[k]+" (réf "+ref[k]+", écart "+(d*100).toFixed(1)+"%)");
      }
    });
  });
  // #61 — version de l'app + snapshot KV partagé (pour comparer entre appareils)
  let kv = null, kvAge = null;
  try{ kv = lsv9Get('cgi_fund_stats'); if(kv && kv.ts){ kvAge = Math.round((Date.now()-kv.ts)/1000); } }catch(e){}
  let txnCount = null;
  try{ const _tx = lsv9Get('cgi_txns'); if(Array.isArray(_tx)) txnCount = _tx.length; }catch(e){}
  const ver = (typeof APP_VERSION!=="undefined") ? APP_VERSION : "?";
  try{ console.log("%c=== JCGI · TRONC DE VÉRITÉ ===","font-weight:bold;color:#C9A86A"); console.log("app "+ver+" · snapshot KV total $"+(kv&&kv.totalUSD||"—")+" (il y a "+(kvAge!=null?kvAge+"s":"—")+") · "+txnCount+" transactions"); }catch(e){}
  try{ console.log("RÉFÉRENCE (modèle unique) :", ref); console.table(rows); }catch(e){}
  if(ecarts.length){ try{ console.warn("⚠️ ÉCARTS DÉTECTÉS :\n"+ecarts.join("\n")); }catch(e){} }
  else { try{ console.log("✅ Tous les blocs concordent avec la référence."); }catch(e){} }
  return { version:ver, kvTotalUSD:(kv&&kv.totalUSD)||null, kvAgeSec:kvAge, txnCount:txnCount, ref:ref, sources:CGI_TRUTH.sources, ecarts:ecarts };
}
if(typeof window!=="undefined"){ window.__cgiAudit = cgiAudit; window.__cgiTruth = function(){ return CGI_TRUTH; };
  try{ console.log("%cJCGI · tape __cgiAudit() pour voir le tronc de vérité (chaque bloc + écarts)","color:#C9A86A;font-weight:bold"); }catch(e){} }
// #61 — Santé du stockage local : taille du conteneur, plus grosses clés, test de persistance.
// Sert à diagnostiquer un mobile qui « oublie » ses données (quota Safari dépassé).
function cgiStorageHealth(){
  let totalBytes=0; const per={};
  try{
    const raw = localStorage.getItem(LS_V9_KEY)||"";
    totalBytes = raw.length;
    const all = JSON.parse(raw||"{}");
    Object.keys(all).forEach(function(k){ try{ per[k]=JSON.stringify(all[k]).length; }catch(e){ per[k]=0; } });
  }catch(e){}
  // test de persistance réel : écrire puis relire
  let persists=false, writeErr=null;
  try{ const tk="__cgi_persist_test"; localStorage.setItem(tk, String(Date.now())); persists = (localStorage.getItem(tk)!=null); localStorage.removeItem(tk); }
  catch(e){ persists=false; writeErr=(e&&e.name)||"erreur"; }
  const top = Object.keys(per).map(function(k){return {k:k, kb:Math.round(per[k]/1024)};}).sort(function(a,b){return b.kb-a.kb;}).slice(0,6);
  let seedver=null; try{ seedver = localStorage.getItem('cgi_txns_seedver'); }catch(e){}
  return { totalKB: Math.round(totalBytes/1024), topKeys: top, persists: persists, writeErr: writeErr, txnsSeedver: seedver };
}
if(typeof window!=="undefined") window.__cgiStorage = cgiStorageHealth;
// #61 — Inspecter ce qu'il y a RÉELLEMENT dans le cloud (KV), en direct depuis le Worker.
// Décisif : dit si tes données sont bien sauvegardées côté serveur, ou si l'écriture échoue.
async function cgiCloudInspect(){
  const kv = await cfRead();
  if(!kv || kv._error) return {_error:true, msg:(kv&&(kv.status+" "+kv.statusText))||"cloud illisible"};
  const out={};
  ["cgi_txns","cgi_portfolio","cgi_bank","cgi_stocks","cgi_crypto","cgi_inv","cgi_snapshots","cgi_fund_stats"].forEach(function(k){
    const v=kv[k];
    if(v===undefined||v===null) out[k]="❌ absent";
    else if(Array.isArray(v)) out[k]="✅ "+v.length+" éléments";
    else if(typeof v==="object") out[k]="✅ objet ("+(Object.keys(v).length)+" champs)";
    else out[k]="✅ "+String(v).slice(0,24);
  });
  return out;
}
if(typeof window!=="undefined") window.__cgiCloud = cgiCloudInspect;

/* ═══════════════════════════════════════════════════════════
   PAGE OVERVIEW
═══════════════════════════════════════════════════════════ */
function PageOverview({chartData,onSnapshot,eur,setEur,hidden,setHidden,EFF,refreshing,handleRefresh,refreshedAt,refreshErr,fromSnapshot,gistSync,liveDD,liveCM,liveGDBS,liveGC,chosenSource,iconDbVersion=0,bumpIconDb}){
  const _DD_PO=liveDD||DD;
  const _CM_PO=liveCM||CRYPTO_MONTHLY;
  const [chartTF, setChartTF] = useState("YTD");
  const [heroTF, setHeroTF] = useState("1M"); // #18 — timeframe du hero (sparkline + delta)
  const [heroTFOpen, setHeroTFOpen] = useState(false); // #18 — menu déroulant timeframe
  const [sparkData, setSparkData] = useState([]);
  const cur = eur ? "€" : "$";
  const inv = 94064 * (EFF||CURRENT).usdEur;
  const gcCur = eur ? "€" : "$";
  // Prix indices JCGI depuis GDBS (dernier point non-null) — cohérent avec onglet JCGI
  // v23.25 — lire EFF.gdbS/gdbC (valeur officielle), pas calcGdbPrices(EFF)
  const _gsTov = (EFF||CURRENT).gdbS || CURRENT.gdbS;
  const _gcTov = (EFF||CURRENT).gdbC || CURRENT.gdbC;
  const gcPrice = eur ? (_gcTov * (EFF||CURRENT).usdEur).toFixed(2) : _gcTov.toFixed(2);
  const gsPrice = eur ? (_gsTov * (EFF||CURRENT).usdEur).toFixed(2) : _gsTov.toFixed(2);

  // totalUSD de référence = MODÈLE UNIQUE (#61) — même source partout
  const _effSrc = EFF||CURRENT;
  const _model = computePortfolioModel(_effSrc);
  cgiSetRef(_model);  // #61 — le Home (modèle unique) est LA référence
  cgiReport("Home · hero", {totalUSD:_model.totalUSD, cryptoUSD:_model.cryptoUSD, stocksUSD:_model.stocksUSD});
  const _sections = _model.sections;
  const _sumUSD = _model.totalUSD;
  const _sumEUR = _model.totalEUR;

  // ─── LUXE overview : hero · répartition · performance (maquette v2) ───
  const _po_today = todayNC();
  const _po_rows = _DD_PO.filter(r=>r[0]<=_po_today && r[2]!=null);
  const _HTF_DAYS = {"D":1,"3D":3,"1S":7,"1M":30,"3M":90,"1A":365,"2A":730,"ALL":999999};
  const _HTF_LABEL = {"D":"1 jour","3D":"3 jours","1S":"7 jours","1M":"30 jours","3M":"3 mois","YTD":"depuis janv.","1A":"1 an","2A":"2 ans","ALL":"tout l'historique"};
  const _hcut = (()=>{
    if(heroTF==="YTD") return new Date((new Date(Date.now()+NC_OFFSET_MS)).getUTCFullYear(),0,1).toISOString().slice(0,10);
    const d=_HTF_DAYS[heroTF]||30;
    return new Date(Date.now()+NC_OFFSET_MS-d*864e5).toISOString().slice(0,10);
  })();
  let _spark = _po_rows.filter(r=>r[0]>=_hcut).map(r=>r[2]);
  if(_spark.length<2) _spark = _po_rows.slice(-12).map(r=>r[2]);
  if(_spark.length) _spark[_spark.length-1] = _sumEUR;
  const _sv  = _spark.filter(v=>v!=null);
  const _smn = _sv.length?Math.min(..._sv):0;
  const _smx = _sv.length?Math.max(..._sv):1;
  const _srng= (_smx-_smn)||1;
  const _hn  = Math.max(1,_spark.length-1);
  const _heroPts = _spark.map((v,i)=> v==null?null:`${(i/_hn*120).toFixed(1)},${(30-((v-_smn)/_srng)*26).toFixed(1)}`).filter(Boolean).join(" ");
  const _po_delta = (()=>{
    const ds=_hcut;
    let ref=null,bd=Infinity;
    for(const r of _DD_PO){ if(!r[0]||r[2]==null) continue; const d=Math.abs(new Date(r[0])-new Date(ds)); if(d<bd){bd=d;ref=r;} }
    if(!ref) return {pnl:0,pct:0};
    const startEUR=ref[2];
    if(eur){ const pnl=_sumEUR-startEUR; return {pnl,pct:startEUR?pnl/startEUR:0}; }
    const ueRef=ref[5]||_effSrc.usdEur;
    const startUSD=Math.round(startEUR/ueRef);
    const pnl=_sumUSD-startUSD; return {pnl,pct:startUSD?pnl/startUSD:0};
  })();
  const _dUp = (_po_delta.pct||0)>=0;
  // #61 — RÉPARTITION dérivée du modèle unique (mêmes catégories que le total)
  const _CAT_COLOR = {Crypto:C.btc, Indices:C.blue, Picking:C.teal, Or:C.gold, Cash:C.gray};
  const _po_agg = {};
  Object.keys(_model.agg).forEach(name=>{ _po_agg[name] = {name, color:(_CAT_COLOR[name]||C.gray), ..._model.agg[name]}; });
  const _allocTot = Object.values(_po_agg).reduce((a,c)=>a+Math.max(0,c.usd),0)||1;
  const _alloc = Object.values(_po_agg).filter(c=>c.usd>0)
    .map(c=>({...c, pct:c.usd/_allocTot*100, eurv:Math.round(c.usd*_effSrc.usdEur)}))
    .sort((a,b)=>b.usd-a.usd);
  // Cartes Crypto / Actions : MÊME P&L que JCGI (capital net investi INV vs valeur actuelle) — cohérence garantie
  const _netFundPO = f => { let m=0; (typeof INV_SEED_OK!=="undefined"?INV_SEED_OK:[]).forEach(x=>{ if(x&&x.fonds===f) m+=(x.io==="OUT"?-1:1)*(x.montant||0); }); return m; };
  const _cgicInv = _netFundPO("CGIC"), _cgisInv = _netFundPO("CGIS");
  const _cryptoUSD = _model.cryptoUSD;
  const _stocksUSD = _model.stocksUSD;
  const _ue = _effSrc.usdEur;
  // #16 — journal quotidien : enregistre/rafraichit le snapshot du jour quand les valeurs live sont valides
  React.useEffect(()=>{
    const cE=(_cryptoUSD||0)*_ue, sE=(_stocksUSD||0)*_ue;
    if(cE>0 || sE>0) cgiRecordDaySnap(cE, sE, _sumEUR);
  }, [_cryptoUSD, _stocksUSD, _ue, _sumEUR]);
  // ─── SOURCE DE VÉRITÉ UNIQUE : les graphes lisent EXACTEMENT cgiHomeSeries (= tableau page Data) ───
  const _HS = cgiHomeSeries(EFF, {CM:(typeof liveCM!=="undefined"&&liveCM)?liveCM:(typeof CRYPTO_MONTHLY!=="undefined"?CRYPTO_MONTHLY:{}), SM:(typeof liveSM!=="undefined"&&liveSM)?liveSM:(typeof STOCKS_MONTHLY!=="undefined"?STOCKS_MONTHLY:{})});
  const _TF_LIST = _HS.available.length ? _HS.available : ["ALL"];
  React.useEffect(()=>{ if(_TF_LIST.indexOf(heroTF)<0) setHeroTF(_TF_LIST[_TF_LIST.length-1]); }, [_TF_LIST.join(","), heroTF]);
  const _heroRow = _HS.rows.find(r=>r.tf===heroTF) || _HS.rows[_HS.rows.length-1];
  const _polyOf = (win, W, top, amp) => { if(!win||win.length<2) return ""; const vs=win.map(p=>p.v); const mn=Math.min(...vs), mx=Math.max(...vs), rng=(mx-mn)||1, n=Math.max(1,vs.length-1); return vs.map((v,i)=>`${(i/n*W).toFixed(1)},${(top-((v-mn)/rng)*amp).toFixed(1)}`).join(" "); };
  const _blendHeroPts = _polyOf(_HS.adjWin("total", heroTF), 120, 30, 26);
  // #87 — agrégat des positions (= base du P&L Portfolio), calculé avant les métriques hero.
  const _posAgg = (()=>{ try{
    const _e=EFF||CURRENT; const _it=[].concat((_e.crypto&&_e.crypto.items)||[], (_e.stocks&&_e.stocks.items)||[]);
    let pnl=0, inv=0; _it.forEach(x=>{ if(x&&x.cat!=="Cash"&&x.cat!=="Cash Matelas"){ pnl+=(x.pnl||0); inv+=((x.pa||0)*(x.qty||0)); } });
    return {pnlUSD:pnl, invUSD:inv, pct:(inv>0?pnl/inv:null)};
  }catch(e){ return {pnlUSD:0,invUSD:0,pct:null}; } })();
  const _isAll = (heroTF==="ALL");
  // #75/#87 — money-weighted par période ; en « tout l'historique », % aligné sur le Portfolio.
  const _blendPct = (_isAll && _posAgg.pct!=null) ? _posAgg.pct
                    : ((_heroRow.total.perf!=null) ? _heroRow.total.perf : ((_heroRow.total.pct!=null)?_heroRow.total.pct:0));
  const _bUp = _blendPct>=0;
  const _blendCur = eur ? _sumEUR : _sumUSD;
  // #75 — P&L net = plus-value réelle (brut − apports), cohérent avec le % money-weighted
  const _netPnlEUR = (_heroRow.total.pnl||0) - (_heroRow.total.apports||0);
  const _blendPnl = (_isAll && _posAgg.invUSD>0)
    ? (eur ? Math.round(_posAgg.pnlUSD*_ue) : _posAgg.pnlUSD)
    : (eur ? _netPnlEUR : Math.round(_netPnlEUR/_ue));
  const _mkPerf2 = (name,color,key) => {
    const m=_heroRow[key]||{}; const pct=(m.pct!=null)?m.pct:0;
    const pnl = eur ? (m.pnl||0) : Math.round((m.pnl||0)/_ue);
    return { name, color, pct, pnl, up:pct>=0, pts:_polyOf(_HS.adjWin(key, heroTF), 150, 36, 28) };
  };
  const _perf = [ _mkPerf2("Crypto",C.btc,"crypto"), _mkPerf2("Actions",C.blue,"stocks") ];
  // #2 (Baromètre) — publication COMPLÈTE et CERTIFIÉE du snapshot KV depuis l'accueil (toujours actif),
  // alignée sur le tableau « Source de vérité » : total/cash via le modèle, P&L des fonds = perf all-time (= valeur/investi).
  const _allRow = _HS.rows.find(r=>r.tf==="ALL");
  React.useEffect(()=>{
    try{
      if(!_allRow || !_allRow.crypto.ok || !_allRow.stocks.ok) return;
      const cEUR=_allRow.crypto.end, sEUR=_allRow.stocks.end;
      const _cur = lsv9Get('cgi_fund_stats')||{};
      // #2.8 — cet effet (onglet Stats) n'écrit QUE les totaux. Les champs fonds (cgic/cgis :
      // nav, navUSD, valueUSD, pnlPct money-weighted, sh, mEUR, ue) sont écrits EXCLUSIVEMENT
      // par l'onglet JCGI (cf. #61 ligne handleRefresh). L'ancienne version écrasait cgic/cgis
      // avec un vieux schéma et un P&L time-weighted (_allRow.perf) → NAV/P&L faux sur le baromètre.
      saveBase('cgi_fund_stats', Object.assign({}, _cur, {
        totalUSD:_model.totalUSD, totalEUR:_model.totalEUR,
        cryptoUSD:_model.cryptoUSD, stocksUSD:_model.stocksUSD,
        cashUSD:_model.cashUSD, usdEur:_model.usdEur,
        ts:Date.now()
      }));
    }catch(e){}
  }, [_model.totalUSD, _model.cryptoUSD, _model.stocksUSD, (_allRow?_allRow.crypto.perf:0), (_allRow?_allRow.stocks.perf:0)]);

  return(
    <div style={{margin:"0 -16px"}}>

      {/* ════ HERO ════ */}
      <div style={{padding:"22px 20px 22px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <span style={{fontSize:10,letterSpacing:4,color:C.text2,textTransform:"uppercase",textAlign:"center"}}>Patrimoine total</span>
          <button onClick={()=>setHidden(!hidden)} title={hidden?"Afficher les montants":"Masquer les montants"}
            style={{background:"none",border:"none",cursor:"pointer",color:C.text3,display:"flex",padding:0}}>
            <Icon name={hidden?"eyeOff":"eye"} size={18}/>
          </button>
        </div>
        <div style={{fontFamily:"'Cormorant Garamond',Georgia,serif",fontWeight:400,fontSize:50,letterSpacing:1,color:C.text,fontVariantNumeric:"tabular-nums",lineHeight:1}}>
          {hidden
            ? "••••••"
            : <><span style={{color:C.gold,fontSize:28,verticalAlign:5,marginRight:3}}>{cur}</span>{fmt(Math.round(eur?_sumEUR:_sumUSD))}</>}
        </div>
        {/* #43 — graphe pleine largeur */}
        {(_blendHeroPts||_heroPts) && (
          <svg width="100%" height="64" viewBox="0 0 120 34" preserveAspectRatio="none" style={{display:"block",overflow:"visible",marginTop:16}}>
            <polyline points={_blendHeroPts||_heroPts} fill="none" stroke={_bUp?C.green:C.red} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {/* Ligne du bas : sélecteur TF (gauche) + delta (droite, #42) */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:16,gap:10}}>
          <div style={{position:"relative"}}>
            <button onClick={()=>setHeroTFOpen(o=>!o)} style={lxBtn({active:heroTFOpen,accent:C.gold,style:{padding:"6px 13px",fontSize:11,gap:7}})}>
              {_HTF_LABEL[heroTF]||heroTF} <span style={{fontSize:8,opacity:.8,transition:"transform .15s",display:"inline-block",transform:heroTFOpen?"rotate(180deg)":"none"}}>▼</span>
            </button>
            {heroTFOpen && (
              <div style={{position:"absolute",top:"100%",left:0,marginTop:6,zIndex:30,background:C.bg2,border:`1px solid ${C.border2}`,borderRadius:C.radiusSm||10,padding:5,minWidth:150,boxShadow:"0 10px 28px rgba(0,0,0,0.45)"}}>
                {_TF_LIST.map(tf=>(
                  <button key={tf} onClick={()=>{setHeroTF(tf);setHeroTFOpen(false);}}
                    style={{display:"block",width:"100%",textAlign:"left",background:heroTF===tf?C.gold+"22":"transparent",border:"none",borderRadius:7,color:heroTF===tf?C.gold:C.text,fontSize:12.5,padding:"8px 11px",cursor:"pointer",fontFamily:C.font}}>
                    {_HTF_LABEL[tf]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,color:_bUp?C.green:C.red,fontVariantNumeric:"tabular-nums",border:`1px solid ${(_bUp?C.green:C.red)}47`,borderRadius:999,padding:"4px 11px",whiteSpace:"nowrap"}}>
            {_bUp?"▲":"▼"} {fmtP(_blendPct)} · {_bUp?"+":"-"}{cur}{msk(fmt(Math.abs(_blendPnl)),hidden)}
          </span>
        </div>
      </div>

      {/* ════ RÉPARTITION ════ */}
      <div style={{fontSize:10,letterSpacing:4,color:C.text2,textTransform:"uppercase",textAlign:"center",padding:"20px 20px 12px"}}>Répartition</div>
      <div style={{padding:"0 20px 4px"}}>
        <div style={{display:"flex",height:10,borderRadius:5,overflow:"hidden",marginBottom:14,background:C.bg2}}>
          {_alloc.map((a,i)=>(
            <div key={i} style={{width:a.pct.toFixed(2)+"%",background:a.color}}/>
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:9}}>
          {_alloc.map((a,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,fontSize:13}}>
              <span style={{width:9,height:9,borderRadius:3,flexShrink:0,background:a.color}}/>
              <span style={{flex:1,color:C.text}}>{a.name}</span>
              <span style={{color:C.text2,fontVariantNumeric:"tabular-nums"}}>{a.pct.toFixed(0)} % · {msk(cur+fmt(Math.round(eur?a.eurv:a.eurv/_ue)),hidden)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ════ PERFORMANCE ════ */}
      <div style={{fontSize:10,letterSpacing:4,color:C.text2,textTransform:"uppercase",textAlign:"center",padding:"22px 20px 12px"}}>Performance des fonds · {_HTF_LABEL[heroTF]||heroTF}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,padding:"0 20px 6px"}}>
        {_perf.map((p,i)=>(
          <div key={i} style={{border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 12px 10px",background:C.bg1}}>
            <div style={{fontSize:11,color:C.text2,letterSpacing:1,marginBottom:2}}>{p.name}</div>
            <div style={{fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:21,color:C.text,fontVariantNumeric:"tabular-nums"}}>{fmtP(p.pct)}</div>
            <div style={{fontSize:11,fontVariantNumeric:"tabular-nums",marginTop:1,color:p.up?C.green:C.red}}>
              {p.up?"▲ +":"▼ -"}{cur}{msk(fmt(Math.abs(p.pnl)),hidden)}
            </div>
            <svg width="100%" height="44" viewBox="0 0 150 44" preserveAspectRatio="none" style={{marginTop:8}}>
              <line x1="0" y1="11" x2="150" y2="11" stroke={C.border} strokeWidth="0.5"/>
              <line x1="0" y1="33" x2="150" y2="33" stroke={C.border} strokeWidth="0.5"/>
              {p.pts && <polyline points={p.pts} fill="none" stroke={p.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>}
            </svg>
          </div>
        ))}
      </div>

      {/* ════ Accès détail (graphe complet + CGIC/CGIS) ════ */}
      <div style={{padding:"14px 20px 6px"}}>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onSnapshot} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"11px 0",borderRadius:C.radius||12,border:`1px solid ${C.border2}`,background:"transparent",color:C.text2,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:C.font}}>
            <Icon name="camera" size={15}/> Snapshot
          </button>
          <button onClick={handleRefresh} disabled={refreshing} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"11px 0",borderRadius:C.radius||12,border:`1px solid ${C.border2}`,background:"transparent",color:C.text2,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:C.font,opacity:refreshing?.6:1}}>
            <Icon name="refresh" size={15}/> {refreshing?"…":"Rafraîchir"}
          </button>
        </div>
      </div>

      <div style={{textAlign:"center",fontSize:9,color:C.text3,opacity:.4,marginTop:8,paddingBottom:6,letterSpacing:.5,pointerEvents:"none"}}>
        {APP_VERSION}
      </div>

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE ALLOCATION — camemberts + ajustements + détail par catégorie
═══════════════════════════════════════════════════════════ */
function DonutControlled({data,size=160,ri=30,label,sub,sel,onSel}){
  const cx=size/2,cy=size/2,R=size/2-7;
  const total=data.reduce((s,d)=>s+d.v,0)||1;
  let cum=0;
  const sl=data.map((d,i)=>{const s=cum;cum+=d.v/total;return{...d,v:d.v/total,s,e:cum,i};});
  const arc=(s,e,r,expand=false)=>{
    const mid=(s+e)/2;
    const ox=expand?Math.cos(mid*2*Math.PI-Math.PI/2)*4:0;
    const oy=expand?Math.sin(mid*2*Math.PI-Math.PI/2)*4:0;
    const a1=s*2*Math.PI-Math.PI/2,a2=e*2*Math.PI-Math.PI/2;
    const x1=cx+ox+r*Math.cos(a1),y1=cy+oy+r*Math.sin(a1);
    const x2=cx+ox+r*Math.cos(a2),y2=cy+oy+r*Math.sin(a2);
    return `M${cx+ox},${cy+oy}L${x1},${y1}A${r},${r},0,${(e-s)>.5?1:0},1,${x2},${y2}Z`;
  };
  const active = sel!=null ? data[sel] : null;
  return(
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{cursor:"pointer"}}>
      {sl.map((s,i)=>(
        <path key={i} d={arc(s.s,s.e,R,sel===i)}
          fill={s.c} opacity={sel==null?0.9:sel===i?1:0.3}
          stroke={sel===i?C.bg:"none"} strokeWidth={sel===i?2:0}
          style={{transition:"opacity .2s"}}
          onClick={()=>onSel(i)}/>
      ))}
      <circle cx={cx} cy={cy} r={ri+2} fill={C.bg}/>
      {active==null?(
        <>
          {label&&<text x={cx} y={cy-6} textAnchor="middle" fill={C.text} fontSize={9} fontWeight="700">{label}</text>}
          {sub&&<text x={cx} y={cy+8} textAnchor="middle" fill={C.btc} fontSize={9} fontWeight="700">{sub}</text>}
        </>
      ):(
        <>
          <text x={cx} y={cy-8} textAnchor="middle" fill={active.c} fontSize={8} fontWeight="800">{active.n}</text>
          <text x={cx} y={cy+4} textAnchor="middle" fill={C.text} fontSize={10} fontWeight="800">{active.pct!=null?active.pct.toFixed(1)+"%":(active.v*100).toFixed(1)+"%"}</text>
          {active.usd&&<text x={cx} y={cy+15} textAnchor="middle" fill={C.gray} fontSize={7}>${fmtK(active.usd)}</text>}
        </>
      )}
    </svg>
  );
}

// #57 — Bourses mondiales : statut en direct (ouvert/pré-post/pause/fermé) selon l'heure locale.
function MarketStatus(){
  const [,setT]=React.useState(0);
  const [sel,setSel]=React.useState(null);   // #72 — bourse sélectionnée (fenêtre d'infos)
  React.useEffect(()=>{ const id=setInterval(()=>setT(x=>x+1),30000); return ()=>clearInterval(id); },[]);
  const EXCH=[
    {n:"New York",sub:"NYSE · NASDAQ",flag:"🇺🇸",tz:"America/New_York",o:570,c:960},
    {n:"Chicago",sub:"CME · CBOT (futures)",flag:"🇺🇸",tz:"America/Chicago",o:510,c:915},   // #72
    {n:"Toronto",sub:"TMX",flag:"🇨🇦",tz:"America/Toronto",o:570,c:960},
    {n:"Londres",sub:"LSE",flag:"🇬🇧",tz:"Europe/London",o:480,c:990},
    {n:"Euronext",sub:"Paris · Amsterdam",flag:"🇪🇺",tz:"Europe/Paris",o:540,c:1050},
    {n:"Francfort",sub:"Xetra",flag:"🇩🇪",tz:"Europe/Berlin",o:540,c:1050},
    {n:"Bombay",sub:"NSE",flag:"🇮🇳",tz:"Asia/Kolkata",o:555,c:930},
    {n:"Hong Kong",sub:"HKEX",flag:"🇭🇰",tz:"Asia/Hong_Kong",o:570,c:960,lo:720,lc:780},
    {n:"Shanghai",sub:"SSE",flag:"🇨🇳",tz:"Asia/Shanghai",o:570,c:900,lo:690,lc:780},
    {n:"Tokyo",sub:"JPX",flag:"🇯🇵",tz:"Asia/Tokyo",o:540,c:900,lo:690,lc:750},
    {n:"Sydney",sub:"ASX",flag:"🇦🇺",tz:"Australia/Sydney",o:600,c:960},
  ];
  function parts(ex){
    try{
      const p=new Intl.DateTimeFormat("en-GB",{timeZone:ex.tz,weekday:"short",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date());
      const g=t=>{const x=p.find(z=>z.type===t);return x?x.value:"";};
      return {wd:g("weekday"), h:parseInt(g("hour"),10)%24, m:parseInt(g("minute"),10)};
    }catch(e){ return null; }
  }
  function info(ex){
    const q=parts(ex); if(!q) return {state:"closed",local:"—",label:"—"};
    const mins=q.h*60+q.m, local=String(q.h).padStart(2,"0")+":"+String(q.m).padStart(2,"0");
    if(q.wd==="Sat"||q.wd==="Sun") return {state:"closed",local,label:"Week-end"};
    if(mins>=ex.c||mins<ex.o-30) return {state:"closed",local,label:"Fermé"};
    if(mins<ex.o) return {state:"soon",local,label:"Ouvre bientôt"};
    if(ex.lo!=null&&mins>=ex.lo&&mins<ex.lc) return {state:"lunch",local,label:"Pause"};
    if(mins>=ex.c-15) return {state:"soon",local,label:"Clôture imminente"};
    return {state:"open",local,label:"Ouvert"};
  }
  // #72 — prochain évènement (ouverture/clôture) + délai en minutes, en tenant compte des week-ends
  function nextEvent(ex){
    const q=parts(ex); if(!q) return null;
    const mins=q.h*60+q.m;
    const ORD=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"], dow=ORD.indexOf(q.wd), wk=d=>d>=1&&d<=5;
    if(wk(dow) && mins>=ex.o && mins<ex.c) return {type:"close", inMin:ex.c-mins};
    if(wk(dow) && mins<ex.o) return {type:"open", inMin:ex.o-mins};
    for(let add=1;add<=7;add++){ const nd=(dow+add)%7; if(wk(nd)) return {type:"open", inMin:add*1440-mins+ex.o}; }
    return null;
  }
  const hm=x=>String(Math.floor(x/60)).padStart(2,"0")+":"+String(Math.round(x)%60).padStart(2,"0");
  const fmtDur=mn=>{ mn=Math.max(0,Math.round(mn)); const d=Math.floor(mn/1440),h=Math.floor((mn%1440)/60),m=mn%60; return (d?d+"j ":"")+(h||d?h+"h ":"")+m+"min"; };
  const COL={open:"#3FB67E",soon:"#D9A441",lunch:"#D9A441",closed:"#9A4B47"};
  const ord={open:0,soon:1,lunch:1,closed:2};
  const rows=EXCH.map(ex=>Object.assign({},ex,info(ex))).sort((a,b)=>ord[a.state]-ord[b.state]);
  const nOpen=rows.filter(r=>r.state==="open").length;
  // détails fenêtre
  const det = sel ? (function(){ const ev=nextEvent(sel), nf=info(sel); return {ev,nf}; })() : null;
  return (
    <div style={{marginTop:24,marginBottom:8}}>
      <div style={{fontSize:10,letterSpacing:4,color:C.text2,textTransform:"uppercase",textAlign:"center",margin:"4px 0 12px"}}>Bourses mondiales</div>
      <div style={{border:`1px solid ${C.border}`,borderRadius:C.radius||12,background:C.bg1,overflow:"hidden"}}>
        {rows.map((r,i)=>(
          <div key={r.n} onClick={()=>setSel(r)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderTop:i?`1px solid ${C.border}`:"none",cursor:"pointer"}}>
            <span style={{fontSize:18,lineHeight:1}}>{r.flag}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,color:C.text,fontWeight:500}}>{r.n}</div>
              <div style={{fontSize:10.5,color:C.text3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.sub}</div>
            </div>
            <div style={{textAlign:"right",marginRight:2}}>
              <div style={{fontSize:12.5,color:C.text2,fontVariantNumeric:"tabular-nums"}}>{r.local}</div>
              <div style={{fontSize:9.5,color:COL[r.state],letterSpacing:.3}}>{r.label}</div>
            </div>
            <span style={{width:9,height:9,borderRadius:999,background:COL[r.state],boxShadow:r.state==="open"?`0 0 6px ${COL[r.state]}`:"none",flexShrink:0}}/>
          </div>
        ))}
      </div>
      <div style={{fontSize:9.5,color:C.text3,textAlign:"center",marginTop:8,opacity:.7}}>{nOpen} place{nOpen>1?"s":""} ouverte{nOpen>1?"s":""} · touchez une bourse pour le détail</div>

      {/* #72 — fenêtre d'infos par place */}
      {sel && det && (
        <div onClick={()=>setSel(null)} style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:C.bg1,borderRadius:"20px 20px 0 0",padding:"18px 20px 32px",width:"100%",maxWidth:430,border:`1px solid ${C.border}`}}>
            <div style={{width:36,height:4,borderRadius:2,background:C.border,margin:"0 auto 16px"}}/>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
              <span style={{fontSize:30,lineHeight:1}}>{sel.flag}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:18,fontWeight:700,color:C.text}}>{sel.n}</div>
                <div style={{fontSize:12,color:C.text3}}>{sel.sub}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:18,fontWeight:700,color:C.text2,fontVariantNumeric:"tabular-nums"}}>{det.nf.local}</div>
                <div style={{fontSize:10,color:COL[det.nf.state],fontWeight:600}}>{det.nf.label}</div>
              </div>
            </div>
            <div style={{display:"grid",gap:8}}>
              <div style={{background:C.bg2,borderRadius:10,border:`1px solid ${C.border}`,padding:"11px 13px",display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:C.text3}}>Séance régulière</span>
                <span style={{fontSize:12.5,color:C.text,fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{hm(sel.o)} – {hm(sel.c)}</span>
              </div>
              {sel.lo!=null && (
                <div style={{background:C.bg2,borderRadius:10,border:`1px solid ${C.border}`,padding:"11px 13px",display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:12,color:C.text3}}>Pause déjeuner</span>
                  <span style={{fontSize:12.5,color:C.text,fontWeight:600,fontVariantNumeric:"tabular-nums"}}>{hm(sel.lo)} – {hm(sel.lc)}</span>
                </div>
              )}
              {det.ev && (
                <div style={{background:(det.ev.type==="open"?"#3FB67E":"#D9A441")+"18",borderRadius:10,border:`1px solid ${(det.ev.type==="open"?"#3FB67E":"#D9A441")}55`,padding:"11px 13px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:12,color:C.text2}}>{det.ev.type==="open"?"Prochaine ouverture":"Clôture"}</span>
                  <span style={{fontSize:13,color:det.ev.type==="open"?"#3FB67E":"#D9A441",fontWeight:700}}>dans {fmtDur(det.ev.inMin)}</span>
                </div>
              )}
              <div style={{background:C.bg2,borderRadius:10,border:`1px solid ${C.border}`,padding:"11px 13px",display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:C.text3}}>Jours de cotation</span>
                <span style={{fontSize:12.5,color:C.text,fontWeight:600}}>Lun – Ven</span>
              </div>
              <div style={{background:C.bg2,borderRadius:10,border:`1px solid ${C.border}`,padding:"11px 13px",display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:C.text3}}>Fuseau horaire</span>
                <span style={{fontSize:12,color:C.text2}}>{sel.tz.replace(/_/g," ")}</span>
              </div>
            </div>
            <div style={{fontSize:10,color:C.text3,textAlign:"center",marginTop:14,opacity:.7,lineHeight:1.4}}>Horaires indicatifs · hors jours fériés locaux. Heure affichée : heure locale de la place.</div>
            <button onClick={()=>setSel(null)} style={{marginTop:16,width:"100%",padding:"12px 0",borderRadius:10,border:`1px solid ${C.border2}`,background:"transparent",color:C.text2,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PageAllocation({hidden, EFF, eur=false, setEur, iconDbVersion=0, bumpIconDb, liveOk=false, onTrade, txns=[], ibkrTrades=[]}){
  const [cashFlow,setCashFlow]=useState(null); // #60 — {cur} : flux cash par devise
  const [bankModal,setBankModal]=useState(null); // #83 — {bank,label,valueEUR} : courbe solde banque
  // #60 — source unifiée des trades (IBKR prioritaire), partagée par le drill-down cash
  const _allTrades = React.useMemo(function(){ return mergeTradesIbkrPriority(txns, ibkrTrades); }, [txns, ibkrTrades]);
  const[mode,setMode]=useState("detail");
  const[selSlice,setSelSlice]=useState(null);
  const[openSec,setOpenSec]=useState(null);
  const[tickerModal,setTickerModal]=useState(null); // {ticker, cat}
  // #71 — sections triées par ordre de grandeur (valeur USD décroissante) : donut, légende et cartes suivent.
  const SECTIONS = buildSections(EFF||CURRENT).slice().sort(function(a,b){ return (b.totalUSD||0)-(a.totalUSD||0); });
  // realD = même source que le donut portfolio — SECTIONS live
  const sectionsTotal = SECTIONS.reduce((s,sec)=>s+sec.totalUSD, 0);
  const realD = SECTIONS.map(s=>({v:s.totalUSD/sectionsTotal, c:s.color, n:s.n, pct:s.pct, usd:s.totalUSD}));
  // Mapping SECTIONS.n → alloc cible par nom — #44 cibles ÉDITABLES + persistées + redistribuées
  const _allocSrc = (EFF||CURRENT).alloc || [];
  const _defaultTargets = {}; _allocSrc.forEach(function(a){ _defaultTargets[a.n]=a.tgt||0; });
  const [allocTargets,setAllocTargets] = useState(function(){
    try{ const s=lsv9Get('cgi_alloc_targets'); if(s && typeof s==='object') return {..._defaultTargets,...s}; }catch(e){}
    return {..._defaultTargets};
  });
  const [tgtEdit,setTgtEdit] = useState(false);
  const tgtOf = n => allocTargets[n]!=null ? allocTargets[n] : (_defaultTargets[n]||0);
  // Saisie LIBRE : on ne touche qu'à la cible modifiée (total peut être ≠ 100%)
  const setOneTarget = (name,raw) => {
    let v = parseFloat(raw); if(isNaN(v)) v=0; v=Math.max(0,Math.min(100,v));
    const next = {...allocTargets, [name]:Math.round(v*10)/10};
    setAllocTargets(next);
    try{ lsv9Set('cgi_alloc_targets',next); }catch(e){}
  };
  // Arrondir : ramène le total à 100% en conservant au mieux les proportions saisies
  const roundTargets = () => {
    const names = _allocSrc.map(a=>a.n);
    const sum = names.reduce((s,n)=>s+tgtOf(n),0);
    const next = {...allocTargets};
    if(sum>0) names.forEach(n=>{ next[n]=Math.round(tgtOf(n)/sum*100*10)/10; });
    else names.forEach(n=>{ next[n]=Math.round(100/names.length*10)/10; });
    // corrige la dérive d'arrondi pour tomber pile à 100%
    const tot = names.reduce((s,n)=>s+next[n],0);
    const drift = Math.round((100-tot)*10)/10;
    if(Math.abs(drift)>=0.1){ const big=names.reduce((a,b)=>next[b]>next[a]?b:a,names[0]); next[big]=Math.round((next[big]+drift)*10)/10; }
    setAllocTargets(next);
    try{ lsv9Set('cgi_alloc_targets',next); }catch(e){}
  };
  const resetTargets = () => { setAllocTargets({..._defaultTargets}); try{ lsv9Set('cgi_alloc_targets',{..._defaultTargets}); }catch(e){} };
  // #46 — Modèles de cibles enregistrables (nom + note) + menu de chargement
  const [allocTpls,setAllocTpls] = useState(function(){ try{ const s=lsv9Get('cgi_alloc_templates'); return Array.isArray(s)?s:[]; }catch(e){ return []; } });
  const [tplName,setTplName] = useState("");
  const [tplNote,setTplNote] = useState("");
  const [tplOpen,setTplOpen] = useState(false);
  const _persistTpls = (arr)=>{ setAllocTpls(arr); try{ lsv9Set('cgi_alloc_templates',arr); }catch(e){} };
  const saveTemplate = () => {
    const nm=(tplName||"").trim(); if(!nm) return;
    const tpl={ name:nm, note:(tplNote||"").trim(), targets:{...allocTargets}, ts:Date.now() };
    const arr=allocTpls.filter(t=>t.name.toLowerCase()!==nm.toLowerCase()); arr.push(tpl);
    _persistTpls(arr); setTplName(""); setTplNote("");
  };
  const loadTemplate = (nm) => {
    const t=allocTpls.find(x=>x.name===nm); if(!t) return;
    const merged={..._defaultTargets,...t.targets}; setAllocTargets(merged);
    try{ lsv9Set('cgi_alloc_targets',merged); }catch(e){} setTplOpen(false);
  };
  const deleteTemplate = (nm) => { _persistTpls(allocTpls.filter(t=>t.name!==nm)); };
  const allocByName = {};
  _allocSrc.forEach(function(a){ allocByName[a.n]={...a, tgt: tgtOf(a.n)}; });
  // Map section key → alloc name
  const SECT_TO_ALLOC = {
    "Bitcoin":     "Crypto",
    "Indices ETF": "Indices",
    "Stock Picking":"Picking",
    "Stocks":       "Picking",
    "Or / Gold":   "Or",
    "Cash Dip":    "Cash Dip",
    "Cash Matelas":"Cash Matelas",
  };
  const tgtD = SECTIONS.map(function(s){
    var allocName = SECT_TO_ALLOC[s.n] || s.n;
    var a = allocByName[allocName] || {tgt:0, n:s.n};
    return {v:a.tgt/100, c:s.color, n:s.n, pct:a.tgt};
  });

  /* totals for footer */
  const _src = EFF||CURRENT;
  const _SECTIONS = buildSections(_src);
  const totalUSD = _SECTIONS.reduce((s,sec)=>s+sec.totalUSD,0);
  const totalEUR = Math.round(totalUSD * _src.usdEur);
  const cur2 = eur ? "€" : "$";
  const totalDisplay = eur ? totalEUR : totalUSD;

  return(
    <>
    <div>
      <PageTitle title="Portfolio" sub="Allocation & positions"/>

      {/* ── TOTAL PORTEFEUILLE — toujours visible (Détail + Allocation) ── */}
      {(()=>{
        const sectionsPnl = SECTIONS.reduce((acc,s)=>acc+s.items.reduce((a,x)=>a+(x.pnl||0),0),0);
        const investi = SECTIONS.reduce((acc,s)=>acc+s.items.reduce((a,x)=>a+(x.investi||0),0),0);
        const pnlPct = investi>0?sectionsPnl/investi:0;
        const cur2b = eur?"€":"$";
        return(
          <div style={{marginBottom:20}}>
            <div style={{border:`1px solid ${C.border2}`,borderRadius:C.radius||12,padding:"18px 16px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",background:C.bg1}}>
              <div>
                <div style={{fontFamily:"'Cormorant Garamond',Georgia,serif",fontWeight:400,fontSize:40,lineHeight:1,color:C.text,fontVariantNumeric:"tabular-nums"}}>
                  {hidden?"••••••":<><span style={{color:C.gold,fontSize:24,verticalAlign:4,marginRight:2}}>{cur2b}</span>{fmt(totalDisplay)}</>}
                </div>
                <div style={{fontSize:12,color:C.text3,marginTop:6,fontVariantNumeric:"tabular-nums"}}>{msk(eur?"$"+fmt(totalUSD):"€"+fmt(totalEUR),hidden)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:26,lineHeight:1,color:clr(sectionsPnl),fontVariantNumeric:"tabular-nums"}}>{hidden?"•••":(sectionsPnl>=0?"+":"")+cur2b+fmtK(Math.abs(eur?Math.round(sectionsPnl*(_src.usdEur||0.852)):sectionsPnl))}</div>
                <div style={{fontSize:11,fontVariantNumeric:"tabular-nums",color:clr(sectionsPnl),border:`1px solid ${clr(sectionsPnl)}47`,borderRadius:999,padding:"3px 10px",display:"inline-block",marginTop:8}}>{fmtP(pnlPct)}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* #47 — sélecteur Détail/Allocation · #63 — Achat/Vente intercalé (plus compact) */}
      <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"stretch"}}>
        <button onClick={()=>setMode("detail")} style={lxBtn({active:mode==="detail",style:{flex:1,padding:"9px 0",display:"flex",alignItems:"center",justifyContent:"center",gap:7}})}>
          <span title={liveOk?"Cloud connecté · trades IBKR à jour":"Hors ligne ou trades non synchronisés"} style={{width:8,height:8,borderRadius:"50%",flexShrink:0,background:liveOk?"#22C55E":C.gray,boxShadow:liveOk?"0 0 6px #22C55E99":"none"}}/>
          Live
        </button>
        {onTrade && (
          <button onClick={onTrade} title="Achat / Vente" style={{flex:"0 0 auto",padding:"0 15px",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:10,border:`1px solid ${C.gold}`,background:(C.gold||"#C9A86A")+"18",color:C.gold,cursor:"pointer",fontFamily:"inherit"}}>
            <Icon name="repeat" size={16}/>
          </button>
        )}
        <button onClick={()=>setMode("ajust")} style={lxBtn({active:mode==="ajust",style:{flex:1,padding:"9px 0",display:"flex",alignItems:"center",justifyContent:"center",gap:7}})}>
          Target
        </button>
      </div>

      {(mode==="compare"||mode==="ajust")&&(
        <>
          {/* Donuts côte à côte */}
          <div style={{display:"flex",justifyContent:"space-around",alignItems:"center",marginBottom:10}}>
            <div style={{textAlign:"center"}}>
              <Donut data={realD} size={148} label="RÉEL" sub={(eur?"€":"$")+fmtK(eur?Math.round(sectionsTotal*_src.usdEur):sectionsTotal)} ri={26}/>
              <div style={{fontSize:10,color:C.gray,marginTop:3}}>Réel</div>
            </div>
            <div style={{textAlign:"center"}}>
              <Donut data={tgtD} size={148} label="CIBLE" sub={eur?"€320k":"$380k"} ri={26}/>
              <div style={{fontSize:10,color:C.gray,marginTop:3}}>Cible 2026</div>
            </div>
          </div>
          {/* Légende compacte */}
          <div style={{display:"flex",flexWrap:"wrap",gap:7,justifyContent:"center",marginBottom:14}}>
            {SECTIONS.map((s,i)=>{
              var allocName = SECT_TO_ALLOC[s.n]||s.n;
              var a = allocByName[allocName]||{c:s.color,n:s.n};
              return(
                <div key={i} style={{display:"flex",alignItems:"center",gap:4}}>
                  <div style={{width:7,height:7,borderRadius:2,background:a.c||s.color}}/>
                  <span style={{fontSize:10,color:C.text2}}>{s.n} <b style={{color:a.c||s.color}}>{(s.pct||0).toFixed(1)}%</b></span>
                </div>
              );
            })}
          </div>
          {/* Liste ajustements */}
          {SECTIONS.map((s,i)=>{
            var allocName = SECT_TO_ALLOC[s.n]||s.n;
            var a = allocByName[allocName]||{tgt:0,c:s.color,n:allocName};
            var _ap = s.pct||0;
            var diff = _ap - a.tgt;
            var adjUSD = Math.round((diff/100)*totalUSD);
            var adjEUR = Math.round(adjUSD*_src.usdEur);
            var adjDisp = eur?adjEUR:adjUSD;
            return(
              <div key={i} style={crd()}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                  <div style={{width:9,height:9,borderRadius:2,background:a.c||s.color,flexShrink:0}}/>
                  <span style={{fontSize:13,fontWeight:700,flex:1}}>{s.n}</span>
                  <span style={{fontSize:12,fontWeight:600}}>{(eur?"€":"$")+fmt(eur?Math.round(s.totalUSD*_src.usdEur):s.totalUSD)}</span>
                </div>
                <div style={{position:"relative",height:14,background:C.bg3,borderRadius:4,marginBottom:5,overflow:"hidden"}}>
                  <div style={{position:"absolute",left:0,top:0,height:"100%",width:Math.min(a.tgt/65*100,100)+"%",background:a.c||s.color,opacity:.2,borderRadius:4}}/>
                  <div style={{position:"absolute",left:0,top:2,height:10,width:Math.min(_ap/65*100,100)+"%",background:a.c||s.color,borderRadius:3}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:10,color:C.gray}}>Réel <b style={{color:a.c||s.color}}>{_ap.toFixed(1)}%</b></span>
                  <span style={{fontSize:10,color:C.gray}}>Cible <b style={{color:C.text2}}>{a.tgt}%</b></span>
                  <span style={{fontSize:10,fontWeight:600,color:Math.abs(diff)<1?C.green:diff>0?C.orange:C.blue}}>
                    {diff>=0?"+":""}{diff.toFixed(1)}% → {diff>0?"Vendre":"Achat"} {(eur?"€":"$")+fmt(Math.abs(adjDisp))}
                  </span>
                </div>
              </div>
            );
          })}
          {/* #44 — PLAN CIBLE éditable (redistribution auto) */}
          <div style={{background:C.bg2,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginTop:4,marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <span style={{fontSize:10,color:C.gray,fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>Plan cible</span>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {allocTpls.length>0 && (
                  <div style={{position:"relative"}}>
                    <button onClick={()=>setTplOpen(o=>!o)} style={{background:C.bg3,border:`1px solid ${C.border2}`,color:C.text2,borderRadius:7,fontSize:11,fontWeight:600,padding:"4px 10px",cursor:"pointer"}}>Modèles ▾</button>
                    {tplOpen && (
                      <div style={{position:"absolute",top:"100%",right:0,marginTop:5,zIndex:40,background:C.bg2,border:`1px solid ${C.border2}`,borderRadius:9,padding:5,minWidth:190,boxShadow:"0 10px 28px rgba(0,0,0,.5)"}}>
                        {allocTpls.map((t,i)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 8px",borderRadius:6}}>
                            <div onClick={()=>loadTemplate(t.name)} style={{flex:1,cursor:"pointer",minWidth:0}}>
                              <div style={{fontSize:12.5,fontWeight:600,color:C.text}}>{t.name}</div>
                              {t.note&&<div style={{fontSize:10.5,color:C.text3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.note}</div>}
                            </div>
                            <button onClick={()=>deleteTemplate(t.name)} title="Supprimer" style={{background:"none",border:"none",color:C.red,fontSize:15,cursor:"pointer",lineHeight:1}}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {tgtEdit && <button onClick={resetTargets} style={{background:"none",border:"none",color:C.text3,fontSize:11,cursor:"pointer"}}>Réinit.</button>}
                {tgtEdit && <button onClick={roundTargets} style={{background:C.bg3,border:`1px solid ${C.gold}`,color:C.gold,borderRadius:7,fontSize:11,fontWeight:600,padding:"4px 12px",cursor:"pointer"}}>Arrondir</button>}
                <button onClick={()=>setTgtEdit(e=>!e)} style={{background:tgtEdit?C.gold:C.bg3,border:`1px solid ${tgtEdit?C.gold:C.border2}`,color:tgtEdit?C.bg1:C.text2,borderRadius:7,fontSize:11,fontWeight:600,padding:"4px 13px",cursor:"pointer"}}>{tgtEdit?"OK":"Éditer"}</button>
              </div>
            </div>
            {_allocSrc.map(function(a,i){
              var sect=SECTIONS.find(s=>(SECT_TO_ALLOC[s.n]||s.n)===a.n);
              var col=(sect&&sect.color)||a.c||C.gold;
              return(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:i<_allocSrc.length-1?`1px solid ${C.border}`:"none"}}>
                  <div style={{width:8,height:8,borderRadius:2,background:col,flexShrink:0}}/>
                  <span style={{fontSize:12,fontWeight:600,flex:1}}>{a.n}</span>
                  {tgtEdit
                    ? <input type="number" value={tgtOf(a.n)} onChange={e=>setOneTarget(a.n,e.target.value)} step="0.5" min="0" max="100"
                        style={{width:66,background:C.bg3,border:`1px solid ${C.border2}`,borderRadius:6,color:C.text,fontSize:13,fontWeight:600,padding:"5px 8px",textAlign:"right",fontFamily:C.font}}/>
                    : <span style={{fontSize:13,fontWeight:700,color:col}}>{tgtOf(a.n).toFixed(1)}%</span>}
                </div>
              );
            })}
            <div style={{display:"flex",justifyContent:"space-between",marginTop:9,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
              <span style={{fontSize:11,color:C.text3}}>Total</span>
              <span style={{fontSize:12,fontWeight:700,color:Math.abs(_allocSrc.reduce((s,a)=>s+tgtOf(a.n),0)-100)<0.5?C.green:C.orange}}>
                {_allocSrc.reduce((s,a)=>s+tgtOf(a.n),0).toFixed(1)}%
              </span>
            </div>
            {tgtEdit && (
              <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                <div style={{fontSize:10,color:C.text3,textTransform:"uppercase",letterSpacing:.5,marginBottom:6}}>Enregistrer comme modèle</div>
                <div style={{display:"flex",gap:6}}>
                  <input value={tplName} onChange={e=>setTplName(e.target.value)} placeholder="Nom du modèle" style={{flex:1,minWidth:0,background:C.bg3,border:`1px solid ${C.border2}`,borderRadius:6,color:C.text,fontSize:12,padding:"6px 9px",fontFamily:C.font}}/>
                  <button onClick={saveTemplate} disabled={!tplName.trim()} style={{background:tplName.trim()?C.gold:C.bg3,border:`1px solid ${tplName.trim()?C.gold:C.border2}`,color:tplName.trim()?C.bg1:C.text3,borderRadius:6,fontSize:11.5,fontWeight:600,padding:"6px 14px",cursor:tplName.trim()?"pointer":"default",whiteSpace:"nowrap"}}>Enregistrer</button>
                </div>
                <input value={tplNote} onChange={e=>setTplNote(e.target.value)} placeholder="Note (optionnelle)" style={{width:"100%",marginTop:6,background:C.bg3,border:`1px solid ${C.border2}`,borderRadius:6,color:C.text,fontSize:11.5,padding:"6px 9px",fontFamily:C.font,boxSizing:"border-box"}}/>
              </div>
            )}
          </div>
          {/* Plan d'action résumé */}
          <div style={{background:C.bg2,borderRadius:12,padding:14,border:`1px solid ${C.border}`,marginTop:4}}>
            <div style={{fontSize:10,color:C.gray,marginBottom:10,fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>Plan d'action</div>
            {SECTIONS.filter(function(s){
              var allocName=SECT_TO_ALLOC[s.n]||s.n;
              var a=allocByName[allocName]||{tgt:0};
              return Math.abs((s.pct||0)-a.tgt)>1;
            }).map(function(s,i,arr){
              var allocName=SECT_TO_ALLOC[s.n]||s.n;
              var a=allocByName[allocName]||{tgt:0,c:s.color,n:allocName};
              var _ap2=s.pct||0;
              var diff=_ap2-a.tgt;
              var adjUSD=Math.round((diff/100)*totalUSD);
              var adjEUR=Math.round(adjUSD*_src.usdEur);
              return(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:7,height:7,borderRadius:2,background:a.c||s.color}}/>
                    <span style={{fontSize:12,fontWeight:600}}>{s.n}</span>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:12,fontWeight:600,color:diff>0?C.orange:C.blue}}>
                      {diff>0?"Vendre":"Acheter"} {(eur?"€":"$")+fmt(Math.abs(eur?adjEUR:adjUSD))}
                    </div>
                    <div style={{fontSize:10,color:C.gray}}>
                      {eur?"≈ $"+fmt(Math.abs(adjUSD)):"≈ €"+fmt(Math.abs(adjEUR))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── DÉTAIL PAR CATÉGORIE ── */}
      {mode==="detail"&&(
        <>
          {/* ── RÉPARTITION : camembert + chips (style home) ── */}
          {(()=>{
            const _t = SECTIONS.reduce((a,s)=>a+Math.max(0,s.totalUSD),0)||1;
            const cur2b = eur?"€":"$";
            const cvD = v => eur ? Math.round(v*_src.usdEur) : v;
            const _al = SECTIONS.filter(s=>s.totalUSD>0).map(s=>({n:s.n,color:s.color,pct:s.totalUSD/_t*100,usd:s.totalUSD})).sort((a,b)=>b.usd-a.usd);
            const donutData = SECTIONS.map(s=>({v:s.pct/100,c:s.color,n:s.n,pct:s.pct,usd:s.totalUSD}));
            return(
              <div style={{marginBottom:18}}>
                <div style={{fontSize:10,letterSpacing:4,color:C.text2,textTransform:"uppercase",textAlign:"center",margin:"4px 0 14px"}}>Allocation</div>
                <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:4}}>
                  <DonutControlled size={140} ri={28} label="TOTAL" sub={cur2b+fmtK(cvD(SECTIONS.reduce((s,sec)=>s+sec.totalUSD,0)))}
                    data={donutData} sel={selSlice} onSel={i=>setSelSlice(selSlice===i?null:i)}/>
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:8,minWidth:0}}>
                    {_al.map((a,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:11.5}}>
                        <span style={{width:8,height:8,borderRadius:2,flexShrink:0,background:a.color}}/>
                        <span style={{flex:1,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.n}</span>
                        <span style={{color:C.text2,fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>{a.pct.toFixed(0)}% · {msk(cur2b+fmtK(cvD(a.usd)),hidden)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Titre de section — style home */}
          <div style={{fontSize:10,letterSpacing:4,color:C.text2,textTransform:"uppercase",textAlign:"center",margin:"24px 0 12px"}}>Positions</div>

          {/* Sections accordéon */}
          {SECTIONS.map(sec=>(
            <SectionRow
              key={sec.key}
              section={sec}
              open={openSec===sec.key}
              onToggle={()=>setOpenSec(openSec===sec.key?null:sec.key)}
              onTickerClick={(t, cat, item)=>{
                const tU=(t||"").toUpperCase();
                // #60 — cash : la ligne USD (Cash Dip) et EURO ouvrent le journal des flux de la devise
                if(tU==="USD"||tU==="CASH"){ setCashFlow({cur:"USD"}); return; }
                if(tU==="EURO"||tU==="EUR"){ setCashFlow({cur:"EUR"}); return; }
                // #83 — Cash Matelas : une banque ouvre sa courbe de solde (pas de news, pas un ticker)
                if((item&&item.cat==="Cash Matelas") || ["LCL","BCI","DEBLOCK","BOURSO"].includes(tU)){
                  setBankModal({bank:t, label:(t==="LCL"?"Le Crédit Lyonnais":t==="BCI"?"BCI":t==="DeBlock"?"DeBlock":t), valueEUR:(item&&(item.valEUR!=null?item.valEUR:item.qty))||0});
                  return;
                }
                setTickerModal({ticker:t, cat:cat||"", row:item||null});
              }}
              hidden={hidden}
              eur={eur}
              usdEur={_src.usdEur||0.852}
              eurUsd={_src.eurUsd||1.173}
              iconDbVersion={iconDbVersion}
              onIconSaved={bumpIconDb}
            />
          ))}

          {/* #57 — Bourses mondiales */}
          <MarketStatus/>

        </>
      )}
    </div>
    {tickerModal && (
      <TickerModal
        ticker={tickerModal.ticker}
        cat={tickerModal.cat}
        row={tickerModal.row}
        eur={eur}
        usdEur={(_src||EFF||CURRENT).usdEur||0.86}
        onClose={()=>setTickerModal(null)}
      />
    )}
    {cashFlow && (
      <CashFlowModal cur={cashFlow.cur} trades={_allTrades} hidden={hidden} onClose={()=>setCashFlow(null)}/>
    )}
    {bankModal && (
      <BankModal bank={bankModal.bank} label={bankModal.label} valueEUR={bankModal.valueEUR} eur={eur} usdEur={(_src||EFF||CURRENT).usdEur||0.92} hidden={hidden} onClose={()=>setBankModal(null)}/>
    )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE STATS
═══════════════════════════════════════════════════════════ */
/* ═══ STATS DATA — Monthly breakdown by category ═══════ */



const SEAS_CRYPTO={"m":["JAN","FEV","MAR","AVR","MAI","JUI","JUL","AOU","SEP","OCT","NOV","DEC"],"pct":[0.076,0.039,0.114,0.024,-0.101,-0.118,0.159,0.0,0.037,0.151,0.125,-0.036]};

// v25.08 Phase 5 (D2) — Investi mensuel derive de cgi_inv : somme des montants signes
// (IN +, OUT -) par mois calendaire et par fonds. Aligne sur le tableau m[] de l'annee
// via l'index de depart (gere 2020 qui commence en MAR, evite la collision de label JUI/JUL).
function deriveInvArray(category, year, mArr, invArr){
  const MONTHS=["JAN","FEV","MAR","AVR","MAI","JUI","JUL","AOU","SEP","OCT","NOV","DEC"];
  const want = category==="crypto" ? {"CGIC":1} : category==="stocks" ? {"CGIS":1} : {"CGIC":1,"CGIS":1};
  const byMonth={};
  (invArr||[]).forEach(function(m){
    if(!m||!m.date||!want[m.fonds]) return;
    const p=String(m.date).split("-"); if(p[0]!==String(year)) return;
    const mi=parseInt(p[1],10)-1;
    byMonth[mi]=(byMonth[mi]||0)+(m.montant||0);
  });
  const startMI = (mArr&&mArr.length) ? MONTHS.indexOf(mArr[0]) : 0;
  const n = (mArr&&mArr.length) ? mArr.length : 12;
  const out=[];
  for(let i=0;i<n;i++){ const v=byMonth[startMI+i]; out.push(v?Math.round(v):0); }
  return out;
}
function PageStats({chartData, hidden=false, EFF, eur=false, liveDD, src, liveInv, liveCM, liveSM, liveTM}){
  const[yr,setYr]=useState("2026");
  const[cat,setCat]=useState("total"); // crypto | stocks | total
  const[view,setView]=useState("bars"); // bars | table
  const[pnlTF,setPnlTF]=useState("ALL"); // #9 — timeframe du P&L% cumulé
  const[barMode,setBarMode]=useState("month"); // #23 — barres par mois (année sélectionnée) ou par année
  const[rangeFrom,setRangeFrom]=useState(""); // #13 — fourchette de dates perso
  const[rangeTo,setRangeTo]=useState("");

  // ── Taux USD/EUR historique par date (lit liveDD ou DD global) ────────────
  const _DD_ST = liveDD || DD;
  const _INV_ST = liveInv || INV_SEED_OK;
  // Retourne le taux usdEur <= dateStr, ou taux actuel par défaut
  const usdEurAtDate = dateStr => {
    const row = _DD_ST.reduceRight((a,r)=>a!=null?a:(r[0]<=dateStr&&r[5]?r:null),null);
    return row ? row[5] : (src?.usdEur || 0.86);
  };
  // Taux BOM = frontière avec le mois précédent (= dernier jour du mois mi-1).
  // v23.27 — BOM(mi) doit utiliser le MÊME taux que EOM(mi-1) puisque c'est la même
  // valeur figée à la même frontière. Sinon BOM(M+1)$ ≠ EOM(M)$ (décalage 1 jour de FX).
  const bomRate = (year, mi) => {
    const pad = m => String(m+1).padStart(2,"0");
    if(mi > 0){
      const prevLast = new Date(parseInt(year), mi, 0).getDate(); // dernier jour du mois mi-1
      return usdEurAtDate(`${year}-${pad(mi-1)}-${prevLast}`);
    }
    return usdEurAtDate(`${year}-01-01`);
  };
  // Taux EOM = dernier jour du mois (approx fin du mois)
  const eomRate = (year, mi) => {
    const pad = m => String(m+1).padStart(2,"0");
    const lastDay = new Date(parseInt(year), mi+1, 0).getDate();
    return usdEurAtDate(`${year}-${pad(mi)}-${lastDay}`);
  };
  const cur = eur ? "€" : "$";

  // ── Unités des données statiques par catégorie ────────────────────────────
  // crypto  → BOM/EOM/PNL en €, INV en €
  // stocks  → BOM/EOM/PNL en $, INV en €
  // total   → BOM/EOM/PNL en €, INV en €
  // dataInEUR = true : BOM/EOM/PNL sont en € pour toutes les catégories
  const dataInEUR = true;

  // ── Fusionne les données historiques avec les snapshots récents ────────────
  const getMonthlyData = (category, year) => {
    const _CM = liveCM||CRYPTO_MONTHLY, _SM = liveSM||STOCKS_MONTHLY, _TM = liveTM||TOTAL_MONTHLY;
    const base = category==="crypto" ? _CM[year]
                : category==="stocks" ? _SM[year]
                : _TM[year];
    if(!base) return null;
    const result = {...base};
    // v25.08 Phase 5 (D2) — colonne Investi derivee de cgi_inv (reproduit l'historique +
    // integre les nouveaux investissements). Aligne sur result.m de l'annee.
    result.inv = deriveInvArray(category, year, base.m, _INV_ST);
    // ── Fonction commune : applique la valeur live EOM pour le mois courant ──
    const _applyLiveEOM = (eomVal) => {
      const MONTHS_FR_LOCAL = ["JAN","FEV","MAR","AVR","MAI","JUI","JUL","AOU","SEP","OCT","NOV","DEC"];
      const nowNC2  = new Date(Date.now() + 11*60*60*1000);
      const curMI2  = nowNC2.getMonth();
      const curMonLabel = MONTHS_FR_LOCAL[curMI2];
      const existingM   = result.m || [];
      // v23.26 — le mois "existe déjà" s'il a un BOM réel posé (ligne créée),
      // PAS si son label figure dans m[] (qui contient toujours les 12 mois →
      // includes() était toujours vrai → on tombait dans la branche update qui
      // ne pose jamais le BOM, d'où BOM/P&L/% vides au changement de mois).
      const monthExists = result.bom?.[curMI2] != null;
      if(!monthExists && eomVal){
        const prevEOM = [...(result.eom||[])].filter(v=>v!=null).slice(-1)[0] || eomVal;
        const inv     = result.inv?.[curMI2] || 0;
        const pnl     = Math.round(eomVal - prevEOM - inv);
        const pct     = prevEOM ? pnl / prevEOM : 0;
        result.m   = [...existingM]; result.m[curMI2]   = curMonLabel;
        result.bom = [...(result.bom||[])]; result.bom[curMI2] = prevEOM;
        result.eom = [...(result.eom||[])]; result.eom[curMI2] = eomVal;
        result.pnl = [...(result.pnl||[])]; result.pnl[curMI2] = pnl;
        result.pct = [...(result.pct||[])]; result.pct[curMI2] = pct;
        result.inv = [...(result.inv||[])]; result.inv[curMI2] = inv;
      } else if(monthExists && eomVal){
        result.eom = [...result.eom]; result.eom[curMI2] = eomVal;
        const bom = result.bom[curMI2] || 0;
        const inv = result.inv?.[curMI2] || 0;
        result.pnl = [...result.pnl]; result.pnl[curMI2] = bom ? eomVal - bom - inv : null;
        result.pct = [...result.pct]; result.pct[curMI2] = bom ? (eomVal - bom - inv)/bom : null;
      }
    };

    const nowNC   = new Date(Date.now() + 11*60*60*1000);
    const curYear = String(nowNC.getFullYear());
    const curMI   = nowNC.getMonth();
    const curYYMM = `${curYear}-${String(curMI+1).padStart(2,"0")}`;

    // v23.27 — EOM des mois RÉVOLUS de l'année courante = base DD (source de vérité).
    // Les valeurs const mensuelles ont dérivé (incohérentes : crypto+stocks+bank ≠ total).
    //   crypto = DD col1 (cryptoEUR) ; total = DD col2 (totalEUR) ;
    //   stocks = CGIS(col4) × GDB_S_NB_PARTS × usdEur(col5) — tout en €.
    if(year === curYear){
      const ddLastOfMonth = (mi) => {
        const ym = `${year}-${String(mi+1).padStart(2,"0")}`;
        let last = null;
        for(const r of _DD_ST){ if(r[0] && r[0].startsWith(ym) && r[2]!=null) last = r; }
        return last;
      };
      result.eom = [...(result.eom||[])];
      for(let mi=0; mi<curMI; mi++){
        const r = ddLastOfMonth(mi);
        if(!r) continue;
        let eomEUR = null;
        if(category==="crypto")      eomEUR = r[1];
        else if(category==="total")  eomEUR = r[2];
        else if(category==="stocks") eomEUR = (r[4]!=null && r[5]!=null) ? Math.round(r[4]*GDB_S_NB_PARTS*r[5]) : null;
        if(eomEUR!=null) result.eom[mi] = eomEUR;
      }
      // re-chaîner BOM = EOM du mois précédent (même frontière)
      result.bom = [...(result.bom||[])];
      for(let mi=1; mi<curMI; mi++){
        if(result.eom[mi-1]!=null) result.bom[mi] = result.eom[mi-1];
      }
    }

    if(year === curYear && curMI < 12){
      if(category==="crypto"){
        // Valeur live = total crypto en € (wallet crypto)
        const liveEUR = EFF ? Math.round(EFF.crypto.total * (src?.usdEur || 0.86)) : null;
        const ddRows  = _DD_ST.filter(r=>r[0]&&r[0].startsWith(curYYMM)&&r[1]!=null);
        const ddEUR   = ddRows.length ? ddRows[ddRows.length-1][1] : null;
        _applyLiveEOM(liveEUR || ddEUR);
      }
      if(category==="stocks"){
        // CGIS = tous les items stocks sauf KUCOIN (qui appartient au fonds crypto CGIC)
        // Inclut : actions, ETF, Cash plateforme (EURO/USD/STRC), Or
        // Exclut : KUCOIN (cash crypto), Cash Matelas (matelas, hors fonds)
        const usdEur  = src?.usdEur || 0.86;
        const liveEUR = EFF ? Math.round(
          EFF.stocks.items
            .filter(x => x.t !== "KUCOIN" && x.cat !== "Cash Matelas")
            .reduce((s, x) => s + (x.val || 0), 0) * usdEur
        ) : null;
        _applyLiveEOM(liveEUR);
      }
      if(category==="total"){
        // v23.26 — Total = valeur live du portefeuille total en € (crypto + stocks + banque)
        const liveEUR = EFF ? Math.round(EFF.totalEUR || (EFF.totalUSD||0) * (src?.usdEur || 0.86)) : null;
        const ddRows  = _DD_ST.filter(r=>r[0]&&r[0].startsWith(curYYMM)&&r[2]!=null);
        const ddEUR   = ddRows.length ? ddRows[ddRows.length-1][2] : null;
        _applyLiveEOM(liveEUR || ddEUR);
      }
    }
    return result;
  };

  const years = ["2020","2021","2022","2023","2024","2025","2026"].filter(y=>
    (cat==="crypto"&&(liveCM||CRYPTO_MONTHLY)[y])||(cat==="stocks"&&(liveSM||STOCKS_MONTHLY)[y])||(cat==="total"&&(liveTM||TOTAL_MONTHLY)[y])
  );
  const safeYr = years.includes(yr) ? yr : years[years.length-1] || "2026";
  const data = getMonthlyData(cat, safeYr);

  const catLabel = cat==="crypto"?"Crypto":cat==="stocks"?"Actions":"Total";
  const catColor = cat==="crypto"?C.btc:cat==="stocks"?C.blue:C.green;

  // ── Fonctions de conversion ───────────────────────────────────────────────
  // BOM/EOM/PNL : si dataInEUR → déjà en €, sinon en $
  //   mode € : dataInEUR → garder | data$ → × taux
  //   mode $ : dataInEUR → ÷ taux | data$ → garder
  const cvtBOM_EOM = (v, rate) => {
    if(v == null) return null;
    if(eur)  return dataInEUR ? v                    : Math.round(v * rate);
    else     return dataInEUR ? Math.round(v / rate) : v;
  };
  // INV toujours en € dans les données statiques
  //   mode € → garder | mode $ → ÷ taux
  const cvtINV_val = (v, rate) => {
    if(!v) return null;
    return eur ? v : Math.round(v / rate);
  };

  const cvtBOM = i => cvtBOM_EOM(data?.bom?.[i], bomRate(safeYr,i));
  const cvtEOM = i => cvtBOM_EOM(data?.eom?.[i], eomRate(safeYr,i));
  const cvtINV = i => cvtINV_val(data?.inv?.[i], bomRate(safeYr,i));

  const cvtPNL = i => {
    const bom = data?.bom?.[i], eom = data?.eom?.[i];
    const invEUR = data?.inv?.[i] ?? 0;
    const rate_bom = bomRate(safeYr, i);
    const rate_eom = eomRate(safeYr, i);
    if(bom == null || eom == null) {
      const rawPnl = data?.pnl?.[i];
      if(rawPnl == null) return null;
      // rawPnl est dans l'unité native (€ ou $)
      if(eur)  return dataInEUR ? rawPnl                    : Math.round(rawPnl * rate_eom);
      else     return dataInEUR ? Math.round(rawPnl / rate_eom) : rawPnl;
    }
    // P&L = EOM_cible - BOM_cible - INV_cible
    const eomC = cvtBOM_EOM(eom, rate_eom);
    const bomC = cvtBOM_EOM(bom, rate_bom);
    const invC = eur ? invEUR : Math.round(invEUR / rate_bom);
    return eomC - bomC - invC;
  };

  // ── % FX-aware : P&L converti / BOM converti ─────────────────────────────
  const realPct = (data?.bom||[]).map((bom,i)=>{
    if(bom==null) return null;
    const pnl = cvtPNL(i);
    if(pnl==null) return null;
    const bomC = cvtBOM(i);
    const invC = cvtINV(i);
    // base de capital = valeur début de mois + apports du mois
    // (évite les % aberrants quand BOM est minuscule : début de fonds, gros apport)
    const base = (bomC||0) + (invC||0);
    return base>0 ? pnl/base : null;
  });

  const validPnlC = data?.m?.map((_,i)=>cvtPNL(i)).filter(v=>v!=null)??[];
  const validPct = realPct.filter(v=>v!=null);
  const ttlPnl = validPnlC.reduce((s,v)=>s+v,0);
  const avgPct = validPct.length?validPct.reduce((s,v)=>s+v,0)/validPct.length:0;
  const bestI  = realPct.reduce((bi,v,i)=>{if(v==null)return bi; return bi===-1||v>realPct[bi]?i:bi;}, -1);
  const worstI = realPct.reduce((wi,v,i)=>{if(v==null)return wi; return wi===-1||v<realPct[wi]?i:wi;}, -1);

  // Colors for bars
  const bclr = v => v==null?"transparent":v>=0?catColor:C.red;

  return(
    <div>
      <PageTitle title="Stats" sub="Performance & saisonnalité"/>
      {/* ── Sélecteur catégorie ── */}
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        {[["crypto","₿ Crypto",C.btc],["stocks","↗ Actions",C.blue],["total","∑ Total",C.green]].map(([k,l,c])=>(
          <button key={k} onClick={()=>setCat(k)} style={lxBtn({active:cat===k,accent:c,style:{flex:1,padding:"8px 4px"}})}>{l}</button>
        ))}
      </div>

      {/* ── Sélecteur année (mode mensuel uniquement) ── */}
      {barMode==="month" && (
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {years.map(y=>(
          <button key={y} onClick={()=>setYr(y)} style={lxBtn({active:safeYr===y,accent:catColor,style:{flex:1,padding:"6px 0",fontSize:11}})}>{y}</button>
        ))}
      </div>
      )}

      {/* ── Résumé annuel ── */}
      {data&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,marginBottom:14}}>
          {[
            ["Total P&L",cur+(ttlPnl>=0?"+":"")+Math.round(ttlPnl).toLocaleString("fr-FR"),ttlPnl>=0?C.green:C.red],
            ["Moy./mois",fmtP(avgPct),avgPct>=0?C.green:C.red],
            ["Meilleur",bestI>=0?data.m[bestI]+" "+fmtP(realPct[bestI]):"—",C.green],
            ["Pire",worstI>=0?data.m[worstI]+" "+fmtP(realPct[worstI]):"—",C.red],
          ].map(([l,v,c])=>(
            <div key={l} style={{background:C.bg1,borderRadius:8,padding:"8px 6px",border:`1px solid ${C.border}`,textAlign:"center"}}>
              <div style={{fontSize:8,color:C.text2,marginBottom:3}}>{l}</div>
              <div style={{fontSize:11,fontWeight:600,color:c}}>{msk(v,hidden)}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── #9 P&L % cumulé dans le temps (multi-années + timeframe) ── */}
      {view==="bars" && (()=>{
        const map = cat==="crypto"?(liveCM||CRYPTO_MONTHLY):cat==="stocks"?(liveSM||STOCKS_MONTHLY):(liveTM||TOTAL_MONTHLY);
        const years = Object.keys(map||{}).filter(y=>/^\d{4}$/.test(y)).sort();
        const pts=[];
        years.forEach(y=>{
          const d=getMonthlyData(cat,y); if(!d||!d.m) return;
          d.m.forEach((ml,i)=>{
            const bom=d.bom&&d.bom[i], pnl=d.pnl&&d.pnl[i], inv=d.inv&&d.inv[i];
            if(ml && pnl!=null){ const base=(bom||0)+(inv||0); if(base>0) pts.push({label:ml+" "+String(y).slice(2), ret:pnl/base}); }
          });
        });
        if(pts.length<2) return null;
        const TFS=[["3M",3],["6M",6],["1A",12],["2A",24],["ALL",9999]];
        const nShow = pnlTF==="ALL"?pts.length:Math.min(pts.length, (TFS.find(t=>t[0]===pnlTF)||["",pts.length])[1]);
        const win = pts.slice(-nShow);   // fenêtre = période sélectionnée
        let acc=1; const show = win.map(p=>{ acc*=(1+p.ret); return {label:p.label, v:(acc-1)}; });
        const W=320,H=120,PADX=6,PADY=14;
        const vals=show.map(p=>p.v);
        let mn=Math.min(...vals,0), mx=Math.max(...vals,0); if(mn===mx){mn-=0.01;mx+=0.01;}
        const x=i=>PADX + i*(W-2*PADX)/Math.max(1,show.length-1);
        const y=v=>PADY + (mx-v)/(mx-mn)*(H-2*PADY);
        const linePts=show.map((p,i)=>`${x(i)},${y(p.v)}`).join(" ");
        const areaPts=`${x(0)},${y(mn)} `+linePts+` ${x(show.length-1)},${y(mn)}`;
        const last=show[show.length-1].v, up=last>=0;
        const lineCol=up?catColor:C.red;
        const y0=y(0);
        return(
          <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",margin:"4px 0 10px"}}>
            <span style={{fontSize:10,color:C.text2,letterSpacing:4,textTransform:"uppercase",textAlign:"center"}}>P&L · {cat==="crypto"?"Crypto":cat==="stocks"?"Actions":"Total"} · {pnlTF==="ALL"?"Tout":pnlTF}</span>
            <span style={{fontSize:17,fontWeight:700,fontFamily:"'Cormorant Garamond',serif",color:lineCol}}>{(last>=0?"+":"")+(last*100).toFixed(1)}%</span>
          </div>
          <div style={{...crd(),marginBottom:10}}>
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:"block",overflow:"visible"}}>
              <defs>
                <linearGradient id="pnlArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineCol} stopOpacity="0.28"/>
                  <stop offset="100%" stopColor={lineCol} stopOpacity="0"/>
                </linearGradient>
              </defs>
              {mn<0&&mx>0 && <line x1={PADX} y1={y0} x2={W-PADX} y2={y0} stroke={C.border} strokeWidth={0.7} strokeDasharray="3 3"/>}
              <polygon points={areaPts} fill="url(#pnlArea)"/>
              <polyline points={linePts} fill="none" stroke={lineCol} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"/>
              <circle cx={x(show.length-1)} cy={y(last)} r={3} fill={lineCol}/>
            </svg>
          </div>
          <div style={{display:"flex",gap:6,marginBottom:18}}>
            {TFS.map(([lbl])=>(
              <button key={lbl} onClick={()=>setPnlTF(lbl)} style={lxBtn({active:pnlTF===lbl,accent:catColor,style:{flex:1,padding:"5px 0",fontSize:10}})}>{lbl}</button>
            ))}
          </div>
          </>
        );
      })()}

      {barMode==="month" && data&&(()=>{
        const vals = realPct;
        // P&L converti pour les labels des barres
        const pnlsC = data.m.map((_,i)=>cvtPNL(i));
        const mx = Math.max(...vals.filter(v=>v!=null).map(Math.abs), .01);
        const W=320, HTOP=52, HBOT=52, HLAB=14, HPNL=10, MIDLINE=HTOP;
        const TOTAL_H = HTOP + HBOT + HLAB + HPNL + 4;
        const n12=data.m.length, barW=Math.floor((W-16)/n12)-2, gap=2;
        const bx=i=>8+i*(barW+gap);
        return(
          <>
          <div style={{fontSize:10,color:C.text2,margin:"4px 0 12px",letterSpacing:4,textTransform:"uppercase",textAlign:"center"}}>Performance mensuelle {safeYr} — {cat==="crypto"?"Crypto":cat==="stocks"?"Actions":"Total"} {eur?"€":"$"}</div>
          <div style={{...crd(),marginBottom:14}}>
            <svg width="100%" viewBox={`0 0 ${W} ${TOTAL_H}`} style={{overflow:"visible",display:"block"}}>
              <defs>
                <linearGradient id="stbPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={catColor} stopOpacity="1"/>
                  <stop offset="100%" stopColor={catColor} stopOpacity="0.82"/>
                </linearGradient>
                <linearGradient id="stbNeg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.red} stopOpacity="0.82"/>
                  <stop offset="100%" stopColor={C.red} stopOpacity="1"/>
                </linearGradient>
                <linearGradient id="stbGloss" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.30"/>
                  <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <line x1={4} y1={MIDLINE} x2={W-4} y2={MIDLINE} stroke={C.border} strokeWidth={0.8}/>
              {data.m.map((m,i)=>{
                const v=vals[i], pnl=pnlsC[i];
                const cx=bx(i)+barW/2;
                if(v==null) return(
                  <g key={i}>
                    <rect x={bx(i)} y={MIDLINE-1} width={barW} height={2} fill={C.bg3} rx={1}/>
                    <text x={cx} y={MIDLINE+HBOT+HLAB-2} textAnchor="middle" fill={C.text3} fontSize={6.5}>{m.slice(0,3)}</text>
                  </g>
                );
                const hpx=Math.max(2,Math.abs(v)/mx*(HTOP-8));
                const isPos=v>=0;
                const col=bclr(v);
                const barY=isPos?MIDLINE-hpx:MIDLINE;
                const barH=hpx;
                const lblY=isPos?MIDLINE-hpx-3:MIDLINE+hpx+9;
                const pnlY=isPos?MIDLINE-hpx-11:MIDLINE+hpx+18;
                return(
                  <g key={i}>
                    <rect x={bx(i)} y={barY} width={barW} height={barH}
                      fill={isPos?"url(#stbPos)":"url(#stbNeg)"} rx={2}/>
                    <rect x={bx(i)} y={barY} width={barW} height={barH}
                      fill="url(#stbGloss)" rx={2}/>
                    <text x={cx} y={lblY} textAnchor="middle"
                      fill={col} fontSize={6.5} fontWeight="800">
                      {fmtP(v,0)}
                    </text>
                    {pnl!=null&&(
                      <text x={cx} y={pnlY} textAnchor="middle"
                        fill={C.text3} fontSize={5.5}>
                        {pnl>=0?"+":""}{Math.round(pnl/1000)}k
                      </text>
                    )}
                    <text x={cx} y={MIDLINE+HBOT+HLAB-2} textAnchor="middle"
                      fill={i===bestI?C.green:i===worstI?C.red:C.text3}
                      fontSize={6.5} fontWeight={i===bestI||i===worstI?"800":"400"}>
                      {m.slice(0,3)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          </>
        );
      })()}

      {/* ── #23 Graphe ANNUEL : une barre par année (comparaison) ── */}
      {barMode==="year" && (()=>{
        const map = cat==="crypto"?(liveCM||CRYPTO_MONTHLY):cat==="stocks"?(liveSM||STOCKS_MONTHLY):(liveTM||TOTAL_MONTHLY);
        const yrs = Object.keys(map||{}).filter(y=>/^\d{4}$/.test(y)).sort();
        const rows = yrs.map(y=>{
          const d=getMonthlyData(cat,y); let acc=1, any=false;
          if(d&&d.m) d.m.forEach((ml,i)=>{ const b=d.bom&&d.bom[i],p=d.pnl&&d.pnl[i],iv=d.inv&&d.inv[i];
            if(ml&&p!=null){ const base=(b||0)+(iv||0); if(base>0){ acc*=(1+p/base); any=true; } } });
          return {y, v:any?acc-1:null};
        }).filter(r=>r.v!=null);
        if(rows.length<1) return null;
        const W=320,HTOP=62,HBOT=62,HLAB=16,MID=HTOP,TH=HTOP+HBOT+HLAB+6;
        const mx=Math.max(...rows.map(r=>Math.abs(r.v)),.01);
        const slot=(W-12)/rows.length, bw=Math.min(44, slot-10);
        const bx=i=>6+i*slot+(slot-bw)/2;
        return(
          <>
          <div style={{fontSize:10,color:C.text2,margin:"4px 0 12px",letterSpacing:4,textTransform:"uppercase",textAlign:"center"}}>Performance annuelle — {catLabel} {eur?"€":"$"}</div>
          <div style={{...crd(),marginBottom:16}}>
            <svg width="100%" viewBox={`0 0 ${W} ${TH}`} style={{overflow:"visible",display:"block"}}>
              <defs>
                <linearGradient id="styPos" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={catColor} stopOpacity="1"/><stop offset="100%" stopColor={catColor} stopOpacity="0.82"/></linearGradient>
                <linearGradient id="styNeg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.red} stopOpacity="0.82"/><stop offset="100%" stopColor={C.red} stopOpacity="1"/></linearGradient>
                <linearGradient id="styGloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.30"/><stop offset="55%" stopColor="#FFFFFF" stopOpacity="0"/></linearGradient>
              </defs>
              <line x1={4} y1={MID} x2={W-4} y2={MID} stroke={C.border} strokeWidth={0.8}/>
              {rows.map((r,i)=>{
                const isPos=r.v>=0, h=Math.max(2,Math.abs(r.v)/mx*(HTOP-10));
                const by=isPos?MID-h:MID, col=isPos?catColor:C.red;
                const lblY=isPos?MID-h-4:MID+h+12;
                return(
                  <g key={r.y}>
                    <rect x={bx(i)} y={by} width={bw} height={h} fill={isPos?"url(#styPos)":"url(#styNeg)"} rx={3}/>
                    <rect x={bx(i)} y={by} width={bw} height={h} fill="url(#styGloss)" rx={3}/>
                    <text x={bx(i)+bw/2} y={lblY} textAnchor="middle" fill={col} fontSize={9.5} fontWeight="800">{(r.v>=0?"+":"")+(r.v*100).toFixed(0)+"%"}</text>
                    <text x={bx(i)+bw/2} y={MID+HBOT+HLAB-2} textAnchor="middle" fill={C.text2} fontSize={9} fontWeight="600">{r.y}</text>
                  </g>
                );
              })}
            </svg>
          </div>
          </>
        );
      })()}

      {/* ── #23/#31 Toggle Mensuel / Annuel — sous le graphe ── */}
      <div style={{display:"flex",gap:6,marginBottom:18,marginTop:2}}>
        {[["month","Mensuel"],["year","Annuel"]].map(([k,l])=>(
          <button key={k} onClick={()=>setBarMode(k)} style={lxBtn({active:barMode===k,accent:catColor,style:{flex:1,padding:"9px 0",fontSize:12}})}>{l}</button>
        ))}
      </div>

      {/* ── Tableau mensuel détail ── */}
      {barMode==="month" && data&&(
        <>
        <div style={{fontSize:10,color:C.text2,letterSpacing:4,textTransform:"uppercase",textAlign:"center",margin:"6px 0 12px"}}>Détail mensuel</div>
        <div style={{...crd(),marginBottom:14,padding:"10px 8px"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
              <thead>
                <tr>
                  {["Mois","BOM","EOM","Investi",`P&L ${cur}`,"%"].map(h=>(
                    <th key={h} style={{padding:"4px 6px",color:C.text2,fontWeight:600,textAlign:h==="Mois"?"left":"right",borderBottom:`1px solid ${C.border}`,fontSize:9}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.m.map((m,i)=>{
                  const eomRaw=data.eom[i], bomRaw=data.bom[i];
                  const eomC = cvtEOM(i), bomC = cvtBOM(i), pnlC = cvtPNL(i), ivC = cvtINV(i);
                  // % toujours = P&L_USD / BOM_USD (ratio invariant)
                  const pct = realPct[i];
                  if(eomRaw==null&&bomRaw==null) return null;
                  return(
                    <tr key={i} style={{borderBottom:`1px solid ${C.border}22`}}>
                      <td style={{padding:"5px 6px",color:C.text2,fontWeight:600}}>{m}</td>
                      <td style={{padding:"5px 6px",textAlign:"right",color:C.text2}}>{bomC!=null?msk(cur+Math.round(bomC).toLocaleString("fr-FR"),hidden):"—"}</td>
                      <td style={{padding:"5px 6px",textAlign:"right",color:C.text}}>{eomC!=null?msk(cur+Math.round(eomC).toLocaleString("fr-FR"),hidden):"—"}</td>
                      <td style={{padding:"5px 6px",textAlign:"right",color:ivC?C.teal:C.text3,fontWeight:ivC?700:400}}>{ivC?msk((ivC>0?"+":"")+Math.round(ivC).toLocaleString("fr-FR")+cur,hidden):"—"}</td>
                      <td style={{padding:"5px 6px",textAlign:"right",color:bclr(pnlC)}}>{pnlC!=null?msk((pnlC>=0?"+":"")+Math.round(pnlC).toLocaleString("fr-FR"),hidden):"—"}</td>
                      <td style={{padding:"5px 6px",textAlign:"right",color:bclr(pct)}}>{pct!=null?fmtP(pct):"—"}</td>
                    </tr>
                  );
                })}
                <tr style={{borderTop:`1px solid ${C.border}`,fontWeight:600}}>
                  {(()=>{
                    // BOM = premier mois converti
                    const firstI = data.bom?.findIndex(v=>v!=null) ?? -1;
                    const ttlBOM = firstI>=0 ? cvtBOM(firstI) : null;
                    // EOM = dernier mois converti
                    const lastI = [...(data.eom||[])].map((v,i)=>v!=null?i:-1).filter(i=>i>=0).pop() ?? -1;
                    const ttlEOM = lastI>=0 ? cvtEOM(lastI) : null;
                    // Somme investis convertis
                    const ttlInv2 = data.m.reduce((s,_,i)=>{const v=cvtINV(i); return v?s+v:s;},0);
                    // P&L total converti = somme des P&L mensuels FX-aware
                    const ttlPnlY = ttlPnl;
                    const ttlPctY = ttlBOM ? ttlPnlY / ttlBOM : (ttlInv2 ? ttlPnlY / ttlInv2 : 0);
                    return(<>
                      <td style={{padding:"5px 6px",color:C.text,fontSize:9}}>TOTAL</td>
                      <td style={{padding:"5px 6px",textAlign:"right",color:C.text2,fontSize:9}}>{ttlBOM!=null?msk(cur+Math.round(ttlBOM).toLocaleString("fr-FR"),hidden):"—"}</td>
                      <td style={{padding:"5px 6px",textAlign:"right",color:C.text,fontSize:9}}>{ttlEOM!=null?msk(cur+Math.round(ttlEOM).toLocaleString("fr-FR"),hidden):"—"}</td>
                      <td style={{padding:"5px 6px",textAlign:"right",color:ttlInv2?C.teal:C.text3,fontSize:9}}>{ttlInv2?msk((ttlInv2>0?"+":"")+Math.round(ttlInv2).toLocaleString("fr-FR")+cur,hidden):"—"}</td>
                      <td style={{padding:"5px 6px",textAlign:"right",color:bclr(ttlPnlY),fontSize:9}}>{msk((ttlPnlY>=0?"+":"")+Math.round(ttlPnlY).toLocaleString("fr-FR"),hidden)}</td>
                      <td style={{padding:"5px 6px",textAlign:"right",color:bclr(ttlPctY),fontSize:9,fontWeight:600}}>{fmtP(ttlPctY)}</td>
                    </>);
                  })()}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {/* ── Saisonnalité crypto (toutes années) ── */}
      {cat==="crypto"&&(
        <>
          <SH label="Saisonnalité historique — Crypto" color={C.btc}/>
          <div style={{...crd(),marginBottom:14}}>
            <div style={{fontSize:9,color:C.text2,marginBottom:8}}>Performance mensuelle moyenne (2020–2026)</div>
            {(()=>{
              const mx2=Math.max(...SEAS_CRYPTO.pct.map(Math.abs),.01);
              const WS=320, HT=44, HB=44, HLB=14, MIDL=HT;
              const TH=HT+HB+HLB;
              const n=SEAS_CRYPTO.m.length, bwS=Math.floor((WS-16)/n)-2;
              const bxS=i=>8+i*(bwS+2);
              return(
                <svg width="100%" viewBox={`0 0 ${WS} ${TH}`} style={{overflow:"visible",display:"block"}}>
                  <line x1={4} y1={MIDL} x2={WS-4} y2={MIDL} stroke={C.border} strokeWidth={0.8}/>
                  {SEAS_CRYPTO.m.map((m,i)=>{
                    const v=SEAS_CRYPTO.pct[i];
                    const cx=bxS(i)+bwS/2;
                    const hpx=Math.max(2,Math.abs(v)/mx2*(HT-6));
                    const isPos=v>=0; const col=v>=0?C.btc:C.red;
                    const barY=isPos?MIDL-hpx:MIDL;
                    const lblY=isPos?MIDL-hpx-3:MIDL+hpx+9;
                    return(
                      <g key={i}>
                        <rect x={bxS(i)} y={barY} width={bwS} height={hpx} fill={col} opacity={1} rx={2}/>
                        <text x={cx} y={lblY} textAnchor="middle" fill={col} fontSize={6} fontWeight="800">{fmtP(v,0)}</text>
                        <text x={cx} y={MIDL+HB+HLB-2} textAnchor="middle" fill={C.text3} fontSize={6.5}>{m.slice(0,3)}</text>
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </div>
        </>
      )}

      {/* ── #13 Période personnalisée → graphe sur mesure (valeur totale, DD) ── */}
      <div style={{fontSize:10,color:C.text2,letterSpacing:4,textTransform:"uppercase",margin:"22px 0 12px",textAlign:"center"}}>Période personnalisée</div>
      <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center"}}>
        <input type="date" value={rangeFrom} onChange={e=>setRangeFrom(e.target.value)} style={{flex:1,background:C.bg2,border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,fontSize:12,padding:"7px 9px",fontFamily:C.font,colorScheme:"dark"}}/>
        <span style={{color:C.text3,fontSize:12}}>→</span>
        <input type="date" value={rangeTo} onChange={e=>setRangeTo(e.target.value)} style={{flex:1,background:C.bg2,border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,fontSize:12,padding:"7px 9px",fontFamily:C.font,colorScheme:"dark"}}/>
      </div>
      {(()=>{
        if(!rangeFrom || !rangeTo) return <div style={{...crd(),marginBottom:14,textAlign:"center",color:C.text3,fontSize:12,padding:"22px 12px"}}>Choisis une date de début et de fin.</div>;
        const lo=rangeFrom<rangeTo?rangeFrom:rangeTo, hi=rangeFrom<rangeTo?rangeTo:rangeFrom;
        const rows=_DD_ST.filter(r=>r&&r[0]&&r[2]!=null && r[0]>=lo && r[0]<=hi);
        if(rows.length<2) return <div style={{...crd(),marginBottom:14,textAlign:"center",color:C.text3,fontSize:12,padding:"22px 12px"}}>Pas assez de données sur cette période.</div>;
        const ue=(src&&src.usdEur)||0.92;
        const vals=rows.map(r=>eur?r[2]:r[2]/ue);
        const first=vals[0], lastV=vals[vals.length-1];
        const pct=first>0?lastV/first-1:0, up=pct>=0, lineCol=up?catColor:C.red;
        const delta=Math.round(lastV-first);
        const W=320,H=120,PADX=6,PADY=14;
        let mn=Math.min(...vals), mx=Math.max(...vals); if(mn===mx){mn-=1;mx+=1;}
        const x=i=>PADX+i*(W-2*PADX)/Math.max(1,vals.length-1);
        const y=v=>PADY+(mx-v)/(mx-mn)*(H-2*PADY);
        const line=vals.map((v,i)=>`${x(i)},${y(v)}`).join(" ");
        const area=`${x(0)},${y(mn)} `+line+` ${x(vals.length-1)},${y(mn)}`;
        return (
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",margin:"0 2px 10px"}}>
              <span style={{fontSize:11,color:C.text3}}>{rows.length} jours</span>
              <span style={{fontSize:16,fontWeight:700,fontFamily:"'Cormorant Garamond',serif",color:lineCol}}>{(up?"+":"")+(pct*100).toFixed(1)}% · {up?"+":"-"}{(eur?"€":"$")}{hidden?"•••":Math.abs(delta).toLocaleString("fr-FR")}</span>
            </div>
            <div style={{...crd()}}>
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:"block",overflow:"visible"}}>
                <defs><linearGradient id="rngArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={lineCol} stopOpacity="0.28"/><stop offset="100%" stopColor={lineCol} stopOpacity="0"/></linearGradient></defs>
                <polygon points={area} fill="url(#rngArea)"/>
                <polyline points={line} fill="none" stroke={lineCol} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"/>
                <circle cx={x(vals.length-1)} cy={y(lastV)} r={3} fill={lineCol}/>
              </svg>
            </div>
          </div>
        );
      })()}
    </div>
  );
}


/* ── CompareChart CGIC vs CGIS vs BTC — top-level pour Babel ── */
/* ═══════════════════════════════════════════════════════════
   JCGI COMPARE CHART v10.2
   Toutes les courbes repartent de 100 au début de la timeframe
   sélectionnée — permet la comparaison de performance directe.
   Benchmark dynamique sur la même période.
═══════════════════════════════════════════════════════════ */
function GdbCompareChartGDB({tf:tfProp, onTFChange, liveGSB, liveGDBS, liveBench, liveGC, liveCgicIdx, liveCgisIdx}){
  const [tfState, setTF] = useState("YTD");
  const tf = (tfProp!=null) ? tfProp : tfState;   // #70 — contrôlé par la page quand fourni
  const [hover, setHover] = useState(null);
  const [full, setFull]   = useState(false);
  const svgRef = useRef(null);

  const _GSB_data = liveGSB || GS_B100_EXT;
  const _GDBS_data = liveGDBS || GDBS;
  const _BENCH_data = liveBench || BENCH_IDX;
  // BENCH_IDX cols: [date, BTC, ETH, SP500, NASDAQ, MSCI]
  const lastGSB = _GSB_data.length > 0 ? _GSB_data[_GSB_data.length-1][0] : todayNC();
  const cutFn = days => { const d=new Date(new Date(lastGSB).getTime() - days*864e5); return d.toISOString().slice(0,10); };
  const TF_CUTS = {
    "1W": cutFn(7), "1M": cutFn(31), "MTD": lastGSB.slice(0,7)+"-01",
    "YTD": lastGSB.slice(0,4)+"-01-01", "1Y": cutFn(365), "2Y": cutFn(730), "3Y": cutFn(1095), "ALL": "2022-01-01",
  };
  const cut = TF_CUTS[tf] || "2022-01-01";

  const _GC_data = liveGC || GC_FULL;
  const gcMap  = {};
  _GC_data.forEach(r=>{ if(r[1]!=null) gcMap[r[0]]=r[1]; });         // GC_FULL: [date, gdbC]
  (_GDBS_data||GDBS).forEach(r=>{ if(r[2]!=null) gcMap[r[0]]=r[2]; }); // GDBS plus récent écrase
  const benchMap = {}; _BENCH_data.forEach(r=>{ benchMap[r[0]]=r; });

  // Source de dates : BENCH_IDX couvre depuis 2020, GSB depuis ~2024 seulement
  const dateSource = _BENCH_data.length > _GSB_data.length ? _BENCH_data : _GSB_data;
  const dates = dateSource.map(r=>r[0]).filter(d=>d>=cut);
  const n = dates.length;

  const rebase = (vals) => {
    const first = vals.find(v=>v!=null);
    if(!first) return vals.map(()=>null);
    return vals.map(v=>v!=null ? round2(v/first*100) : null);
  };

  // Assainit une série indicielle : retire les valeurs <=0 et les outliers absurdes
  // (un point > 8x ou < 1/8 de la médiane est une erreur de données → ignoré).
  const sanitize = (vals) => {
    const pos = vals.filter(v=>v!=null && v>0);
    if(pos.length < 3) return vals.map(v=>(v!=null && v>0)?v:null);
    const sorted=[...pos].sort((a,b)=>a-b);
    const med = sorted[Math.floor(sorted.length/2)] || 1;
    return vals.map(v=> (v!=null && v>0 && v<=med*8 && v>=med/8) ? v : null);
  };

  // CGIC/CGIS : courbe complète depuis 2022 via rendements mensuels, LISSÉE par interpolation
  // (sinon effet "marches d'escalier"). Le graphe rebase en base 100 ensuite.
  const _monthlyAnchors = (MAP) => {
    const arr=[]; let idx=100, started=false;
    const yrs=Object.keys(MAP||{}).filter(y=>/^\d{4}$/.test(y)).sort();
    yrs.forEach(y=>{ const d=MAP[y]; if(!d||!d.m) return;
      d.m.forEach((ml,i)=>{ if(!ml) return;
        const mm=String(i+1).padStart(2,"0");
        if(!started){ arr.push({d:y+"-"+mm+"-01", v:100}); started=true; }
        const base=(d.bom?d.bom[i]:0||0)+(d.inv?d.inv[i]:0||0);
        const pnl=d.pnl?d.pnl[i]:null;
        const ret=(pnl!=null && base>0)?pnl/base:0;
        idx=idx*(1+ret);
        arr.push({d:y+"-"+mm+"-28", v:idx});
      });
    });
    return arr;
  };
  const _interp = (anchors, dstr) => {
    if(!anchors.length) return null;
    if(dstr<=anchors[0].d) return anchors[0].v;
    if(dstr>=anchors[anchors.length-1].d) return anchors[anchors.length-1].v;
    for(let i=0;i<anchors.length-1;i++){
      if(dstr>=anchors[i].d && dstr<=anchors[i+1].d){
        const t0=new Date(anchors[i].d).getTime(), t1=new Date(anchors[i+1].d).getTime(), t=new Date(dstr).getTime();
        const f=(t-t0)/((t1-t0)||1);
        return anchors[i].v + (anchors[i+1].v-anchors[i].v)*f;
      }
    }
    return anchors[anchors.length-1].v;
  };
  // CGIC = série quotidienne (ancrée mensuel) ; CGIS = mensuel ; les deux prolongées à aujourd'hui
  // via la forme quotidienne du KV de juin, ré-ancrée entre fin mai et la valeur live.
  const _cgicA=gdbAppendLive(gdbCgicDailyAnchors(), "c", 2, liveCgicIdx);
  const _cgisA=gdbAppendLive(gdbCgisDailyAnchors(), "s", 1, liveCgisIdx);
  const gcRaw  = dates.map(d=>gdbInterp(_cgicA,d));
  const gsRaw  = dates.map(d=>gdbInterp(_cgisA,d));
  const btcRaw = dates.map(d=>{ const r=benchMap[d]; return r?r[1]:null; }); // BTC
  const spRaw  = dates.map(d=>{ const r=benchMap[d]; return r?r[3]:null; }); // SP500
  const nqRaw  = dates.map(d=>{ const r=benchMap[d]; return r?r[4]:null; }); // NASDAQ
  const ethRaw = dates.map(d=>{ const r=benchMap[d]; return r?r[2]:null; }); // ETH
  const msRaw  = dates.map(d=>{ const r=benchMap[d]; return r?r[5]:null; }); // MSCI

  const gcB  = _despikeCarry(rebase(sanitize(gcRaw)));
  const gsB  = _despikeCarry(rebase(sanitize(gsRaw)));
  const btcB = rebase(sanitize(btcRaw));
  const spB  = rebase(sanitize(spRaw));
  const nqB  = rebase(sanitize(nqRaw));
  const ethB = rebase(sanitize(ethRaw));
  const msB  = rebase(sanitize(msRaw));

  const allVals = [...gcB,...gsB,...btcB,...spB,...nqB,...msB].filter(v=>v!=null);
  if(!n||!allVals.length) return null;

  const mn=Math.min(...allVals), mx=Math.max(...allVals), rng=mx-mn||1;
  const W=300, H=110, PL=28, PR=8, IW=W-PL-PR;
  const px=i=>PL+i/(n-1)*IW;
  const py=v=>v==null?null:H-((v-mn)/rng)*(H-4)+2;

  /* Interaction touch/mouse */
  const getIdx = (clientX, rect) => {
    const svgX = (clientX - rect.left) * (W / rect.width) - PL;
    return Math.min(n-1, Math.max(0, Math.round(svgX / (IW/(n-1)))));
  };
  const onMove  = e => { if(!svgRef.current) return; setHover({i:getIdx(e.clientX, svgRef.current.getBoundingClientRect())}); };
  const _tm3=useRef(false),_ts3=useRef(0);
  const onTouch = e => { e.preventDefault(); if(!svgRef.current) return; const t=e.touches[0]||e.changedTouches[0]; if(e.type==="touchstart"){_tm3.current=false;_ts3.current=t.clientX;}else{_tm3.current=Math.abs(t.clientX-_ts3.current)>4;} setHover({i:getIdx(t.clientX, svgRef.current.getBoundingClientRect())}); };
  const onTouchEnd1=ev=>{ev.preventDefault();if(!_tm3.current)setHover(null);};

  const hasData=(vals)=>{
    const nn=vals.filter(v=>v!=null);
    if(nn.length<2) return false;
    const distinct=new Set(nn.map(v=>Math.round(v*100)));
    return distinct.size>=2;   // au moins 2 valeurs distinctes = vraie courbe (sinon plate/0 → ignorée)
  };
  // Lissage Catmull-Rom → cubiques de Bézier (passe par tous les points, arrondit les angles)
  const _smoothPath=(p)=>{
    if(p.length<2) return p.length?`M ${p[0][0]} ${p[0][1]}`:"";
    if(p.length===2) return `M ${p[0][0]} ${p[0][1]} L ${p[1][0]} ${p[1][1]}`;
    let d=`M ${p[0][0]} ${p[0][1]}`;
    for(let i=0;i<p.length-1;i++){
      const p0=p[i-1]||p[i], p1=p[i], p2=p[i+1], p3=p[i+2]||p[i+1];
      const c1x=p1[0]+(p2[0]-p0[0])/6, c1y=p1[1]+(p2[1]-p0[1])/6;
      const c2x=p2[0]-(p3[0]-p1[0])/6, c2y=p2[1]-(p3[1]-p1[1])/6;
      d+=` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };
  const mkLine=(vals,col,bold,smooth)=>{
    if(!hasData(vals)) return null;
    // segments contigus de points non-null (pour gérer les trous éventuels)
    const segs=[]; let cur=[];
    vals.forEach((v,i)=>{ if(v!=null){ cur.push([px(i),py(v)]); } else { if(cur.length){segs.push(cur);} cur=[]; } });
    if(cur.length) segs.push(cur);
    if(!segs.length) return null;
    const sw=full?(bold?1.2:0.7):(bold?2.2:1.3), op=full?0.8:.85;
    if(smooth){
      const d=segs.map(s=>_smoothPath(s)).join(" ");
      return <path key={col} d={d} fill="none" stroke={col} strokeWidth={sw} opacity={op} strokeLinejoin="round" strokeLinecap="round"/>;
    }
    const pts=segs.map(s=>s.map(p=>p[0]+","+p[1]).join(" ")).join(" ");
    return <polyline key={col} points={pts} fill="none" stroke={col} strokeWidth={sw} opacity={op}/>;
  };

  const lastPerf=(vals)=>{ const last=vals.filter(v=>v!=null).at(-1); return last!=null?last-100:null; };
  const handleTF = t => { setTF(t); setHover(null); onTFChange&&onTFChange(t); };
  const xLabel = d => { const [y,m,day]=d.split("-"); return (tf==="1W"||tf==="1M"||tf==="MTD")?`${parseInt(day)}/${m}`:`${m}/${y.slice(2)}`; };
  const step = Math.max(1,Math.floor(n/5));
  const gridVals = [mn,(mn+mx)/2,mx].map(v=>Math.round(v));

  const hi = hover?.i;

  /* Tooltip data au hover */
  const hDate = hi!=null ? dates[hi] : null;
  const SERIES = [
    {vals:gcB,  col:C.btc,    lbl:"CGIC"},
    {vals:gsB,  col:C.blue,   lbl:"CGIS"},
    {vals:btcB, col:C.purple, lbl:"BTC"},
    {vals:nqB,  col:C.green,  lbl:"Nasdaq"},
    {vals:msB,  col:C.gold,   lbl:"MSCI"},
    {vals:spB,  col:C.gray,   lbl:"S&P"},
  ];

  const vw = typeof window!=="undefined"?window.innerWidth:390;
  const vh = typeof window!=="undefined"?window.innerHeight:844;

  /* ── Chart content (shared between normal + fullscreen) ── */
  const chartBody = (
    <>
      {/* TF selector — masqué quand la page pilote le timeframe (#70) */}
      {tfProp==null && (
      <div style={{display:"flex",gap:6,marginBottom:12}}>
        {["1W","1M","MTD","YTD","1Y","2Y","ALL"].map(t=>(
          <button key={t} onClick={()=>handleTF(t)} style={lxBtn({active:tf===t,style:{flex:1,padding:"6px 0",fontSize:10}})}>{t}</button>
        ))}
      </div>
      )}

      {/* Tooltip fixe — au-dessus des encarts CGIC et CGIS */}
      {hover!=null && hDate && (
        <div style={{
          position:"fixed", top:100, left:"50%", transform:"translateX(-50%)",
          zIndex:200, width:"92%", maxWidth:410,
          background:"rgba(10,12,18,.97)",border:`1px solid ${C.border2}`,
          borderRadius:10,padding:"7px 12px",
          display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center",
          boxShadow:"0 6px 24px rgba(0,0,0,.85)",
          pointerEvents:"none",
        }}>
          <div style={{fontSize:10,color:"#fff",fontWeight:600,width:"100%",textAlign:"center",marginBottom:2}}>
            {fmtDate(hDate)}
          </div>
          {SERIES.map(({vals,col,lbl})=>{
            const v = vals[hi];
            if(v==null) return null;
            const perf = v-100;
            return(
              <div key={lbl} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
                <div style={{display:"flex",alignItems:"center",gap:3}}>
                  <div style={{width:7,height:7,borderRadius:2,background:col}}/>
                  <span style={{fontSize:8,color:C.text2}}>{lbl}</span>
                </div>
                <span style={{fontSize:11,fontWeight:600,color:perf>=0?C.green:C.red}}>{perf>=0?"+":""}{perf.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      )}

      {/* SVG */}
      <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H+20}`}
        style={{overflow:"visible",touchAction:"none",userSelect:"none"}}
        onMouseMove={onMove} onMouseLeave={()=>setHover(null)}
        onTouchStart={onTouch} onTouchMove={onTouch} onTouchEnd={onTouchEnd1}>
        {gridVals.map((v,i)=>(
          <g key={i}>
            <line x1={PL} y1={py(v)} x2={W-PR} y2={py(v)} stroke={C.border} strokeWidth={0.4}/>
            <text x={PL-3} y={py(v)+3} textAnchor="end" fill={C.text3} fontSize={6}>{v}</text>
          </g>
        ))}
        <line x1={PL} y1={py(100)} x2={W-PR} y2={py(100)} stroke="rgba(255,255,255,.15)" strokeWidth={.8} strokeDasharray="3,3"/>
        {mkLine(gcB,C.btc,true,true)}{mkLine(gsB,C.blue,true,true)}
        {mkLine(btcB,C.purple,false)}
        {mkLine(nqB,C.green,false)}{mkLine(msB,C.gold,false)}{mkLine(spB,C.gray,false)}
        {/* Crosshair */}
        {hi!=null && <>
          <line x1={px(hi)} y1={2} x2={px(hi)} y2={H} stroke="rgba(255,255,255,.18)" strokeWidth={1} strokeDasharray="3,3"/>
          {SERIES.map(({vals,col})=>{ const v=vals[hi]; if(v==null)return null; return <g key={col}><circle cx={px(hi)} cy={py(v)} r={4} fill={C.bg1} stroke={col} strokeWidth={2}/><circle cx={px(hi)} cy={py(v)} r={1.6} fill={col}/></g>; })}
        </>}
        {dates.map((d,i)=>{
          if(i!==0&&i!==n-1&&i%step!==0) return null;
          return <text key={i} x={px(i)} y={H+13} textAnchor="middle" fill={hi===i?"#fff":C.text3} fontSize={5.5}>{xLabel(d)}</text>;
        })}
      </svg>

      {/* Légende — hors graphique */}
      <div style={{display:"flex",flexWrap:"wrap",gap:12,justifyContent:"center",marginTop:12}}>
        {SERIES.filter(s=>hasData(s.vals)).map(({col,lbl,vals})=>{
          const p=lastPerf(vals);
          return(
            <div key={lbl} style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:12,height:2,background:col,borderRadius:1}}/>
              <span style={{fontSize:9,color:C.text2}}>{lbl}</span>
              {p!=null&&<span style={{fontSize:9,fontWeight:600,color:p>=0?C.green:C.red,fontVariantNumeric:"tabular-nums"}}>{p>=0?"+":""}{p.toFixed(1)}%</span>}
            </div>
          );
        })}
      </div>
    </>
  );

  return full ? (
    <div style={{
      position:"fixed",inset:0,zIndex:1000,background:C.bg,
      display:"flex",flexDirection:"column",
    }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",background:C.bg1,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <span style={{fontSize:13,fontWeight:600,color:C.btc}}>CGIC · CGIS · Benchmarks</span>
        <button onClick={()=>setFull(false)} style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 14px",color:C.text,fontSize:12,fontWeight:700,cursor:"pointer"}}>✕</button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>{chartBody}</div>
    </div>
  ) : (
    <div style={{background:"transparent",border:"none",padding:0,marginBottom:12,position:"relative"}}>
      <button onClick={()=>setFull(true)} title="Plein écran" style={{
        position:"absolute",top:40,right:0,zIndex:10,
        background:"transparent",border:`1px solid ${C.border2}`,borderRadius:6,
        width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",
        cursor:"pointer",fontSize:11,color:C.text2,
      }}>⛶</button>
      {chartBody}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE JCGI  v10
   1. Récapitulatif CGIC + CGIS (nb parts, valeur fonds, cours, perfs)
   2. Graphique comparaison benchmarks (CGIS en rouge)
   3. Benchmark YTD corrigé
   4. Graphique CGIC cours + Graphique CGIS cours
═══════════════════════════════════════════════════════════ */
/* ── FondCard: récapitulatif d'un fonds ── */
function FondCard({label, cours, qty, fonds, color, hidden, eur, usdEur, perfAllTime, onClick, tfLabel, perf, spark}){
  // label format: "CGIC — Crypto" or "CGIS — Actions"
  const [titre, sousTitre] = label.split(" — ");
  // perfAllTime passé depuis PageGDB (corrigé €/$), fallback sur calcul local en €
  const perfCreation = perfAllTime != null ? perfAllTime : (eur ? (cours*(usdEur||0.852))/10-1 : cours/10-1);
  const pUp = perfCreation >= 0;
  const affCours = eur ? "€"+(cours*(usdEur||0.852)).toFixed(2) : "$"+cours.toFixed(2);
  const affFonds = eur ? "€"+fmtK(Math.round(fonds*(usdEur||0.852))) : "$"+fmtK(fonds);
  const valDet = qty*cours;
  const affVal = eur ? "€"+fmtK(Math.round(valDet*(usdEur||0.852))) : "$"+fmtK(valDet);
  const partFonds = fonds>0 ? (valDet/fonds*100) : null;

  // Perfs 1J, 1S, 1M seulement (3 premières)
  // #70 — sparkline (base 100) au timeframe de la page + P&L unique
  const sparkPts = (()=>{
    const arr=(spark||[]).filter(v=>v!=null);
    if(arr.length<2) return null;
    const mn=Math.min(...arr), mx=Math.max(...arr), rng=(mx-mn)||1;
    const W=100, H=30;
    return (spark||[]).map((v,i)=> v==null?null:`${(i/((spark.length-1)||1))*W},${(H - ((v-mn)/rng)*(H-4) - 2).toFixed(1)}`).filter(Boolean).join(" ");
  })();
  const sparkUp = (()=>{ const a=(spark||[]).filter(v=>v!=null); return a.length>=2 ? a[a.length-1]>=a[0] : true; })();

  return(
    <>
    {/* Titre SORTI du bloc — police home (petites capitales) */}
    <div style={{fontSize:10,letterSpacing:4,color:C.text2,textTransform:"uppercase",margin:"2px 0 10px",display:"flex",justifyContent:"center",gap:8,alignItems:"baseline"}}>
      <span style={{color}}>{titre}</span>{sousTitre&&<span style={{color:C.text3,letterSpacing:2}}>· {sousTitre}</span>}
    </div>
    <div onClick={onClick} style={{
      background:C.bg1,
      borderRadius:C.radius||12,
      border:`1px solid ${C.border}`,
      padding:"14px 14px",
      marginBottom:16,
      position:"relative",
      cursor:onClick?"pointer":"default",
    }}>

      {/* Cours + perf création */}
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:16}}>
        <div style={{fontFamily:"'Cormorant Garamond',Georgia,serif",fontWeight:400,fontSize:34,letterSpacing:1,color,lineHeight:1,fontVariantNumeric:"tabular-nums"}}>
          {msk(affCours, hidden)}
        </div>        <div style={{textAlign:"right"}}>
          <div style={{fontSize:14,fontWeight:600,color:pUp?C.green:C.red}}>
            {fmtP(perfCreation)}
          </div>
          <div style={{fontSize:9,color:C.gray,letterSpacing:.3}}>depuis création</div>
        </div>
      </div>

      {/* Séparateur */}
      <div style={{height:1,background:C.border,marginBottom:12}}/>

      {/* Fonds + Valeur détenue + Parts */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:0,marginBottom:14}}>
        <div>
          <div style={{fontSize:8,color:C.gray,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Fonds</div>
          <div style={{fontSize:16,fontWeight:600,color:C.text}}>{msk(affFonds, hidden)}</div>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:8,color:C.gray,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Valeur détenue</div>
          <div style={{fontSize:16,fontWeight:600,color}}>{msk(affVal, hidden)}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:8,color:C.gray,letterSpacing:1.5,textTransform:"uppercase",marginBottom:4}}>Parts</div>
          <div style={{fontSize:16,fontWeight:600,color:C.text}}>{msk(Math.round(qty).toLocaleString("fr-FR"), hidden)}{partFonds!=null&&<span style={{fontSize:10,color:C.text3,fontWeight:600}}> · {partFonds.toFixed(0)}%</span>}</div>
        </div>
      </div>

      {/* #70 — sparkline + P&L unique au timeframe sélectionné en haut de page */}
      <div style={{display:"flex",alignItems:"stretch",gap:10}}>
        <div style={{flex:1,background:C.bg2,borderRadius:8,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",padding:"6px 8px",minHeight:48}}>
          {sparkPts
            ? <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{width:"100%",height:36}}>
                <polyline points={sparkPts} fill="none" stroke={sparkUp?C.green:C.red} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            : <span style={{fontSize:10,color:C.gray}}>Pas d'historique sur {tfLabel}</span>}
        </div>
        <div style={{flex:"0 0 34%",background:C.bg2,borderRadius:8,border:`1px solid ${C.border}`,padding:"7px 0",textAlign:"center",display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <div style={{fontSize:9,color:C.gray,marginBottom:3,letterSpacing:.5}}>P&L · {tfLabel}</div>
          <div style={{fontSize:16,fontWeight:700,color:perf!=null?clr(perf):C.gray}}>
            {perf!=null?fmtP(perf):"—"}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

// v25.09 Phase 5b — modal de detail d'un fonds (clic sur la FondCard).
// Detention par investisseur, PRU + P&L (option A : base = capital net investi),
// et graphe 2 courbes daily : investi cumule (bleu/aire) + valeur du fonds (orange C / rouge S).
function FondDetailModal({fond, EFF, liveInv, liveDD, liveGC, eur, onClose}){
  const isC = fond==="CGIC";
  const color = isC ? C.btc : C.red;
  const [fs,setFs] = useState(false);
  const src = EFF||CURRENT;
  const usdEur = src.usdEur||0.86;
  const _gp = (typeof calcGdbPrices==="function") ? calcGdbPrices(src) : {};
  const valueNowUSD = isC ? (_gp.gdbCfondsUSD!=null?_gp.gdbCfondsUSD:(src.crypto?src.crypto.total:0))
                          : (_gp.gdbSfondsUSD!=null?_gp.gdbSfondsUSD:0);
  const inv = (liveInv||INV_SEED_OK).filter(function(m){return m.fonds===fond;});
  const _sign = function(m){ return m.io==="OUT" ? -1 : 1; };
  // Détention par investisseur (parts NETTES = IN − OUT)
  const byH = {}; inv.forEach(function(m){ byH[m.holder]=(byH[m.holder]||0)+_sign(m)*(m.shares||0); });
  const totalParts = Object.keys(byH).reduce(function(a,h){return a+byH[h];},0);
  const holders = Object.keys(byH).map(function(h){return {h:h, sh:byH[h], pct: totalParts?byH[h]/totalParts:0};})
    .filter(function(x){return Math.abs(x.sh)>0.01;}).sort(function(a,b){return b.sh-a.sh;});
  // Capital net investi (IN − OUT) vs valeur actuelle réelle du fonds en €
  const netInvested = inv.reduce(function(a,m){return a+_sign(m)*(m.montant||0);},0);
  const valueNow = (valueNowUSD||0) * usdEur;
  const coursEur = totalParts ? valueNow/totalParts : 0;   // NAV par part (€), base 100 à la création
  const pru = totalParts ? netInvested/totalParts : 0;
  const pnl = valueNow - netInvested;
  const pnlPct = netInvested ? pnl/netInvested : 0;
  const pnlUp = pnl>=0;
  // Serie quotidienne
  const dd = liveDD || DD;
  const ddU = {}; dd.forEach(function(r){ ddU[r[0]]=r[5]; });
  const movs = inv.slice().sort(function(a,b){return (a.date||"").localeCompare(b.date||"");});
  const start = movs.length ? movs[0].date : null;
  let axis;
  if(isC){ axis = (liveGC||GC_FULL).map(function(r){return {d:r[0], c:r[1], ue:ddU[r[0]]};}); }
  else { axis = dd.filter(function(r){return r[4]!=null;}).map(function(r){return {d:r[0], c:r[4], ue:r[5]};}); }
  if(start) axis = axis.filter(function(p){return p.d>=start;});
  let pi=0, cumS=0, cumM=0;
  const dates=[], invested=[], value=[];
  axis.forEach(function(p){
    while(pi<movs.length && movs[pi].date<=p.d){ cumS+=movs[pi].shares||0; cumM+=movs[pi].montant||0; pi++; }
    const ue = p.ue!=null ? p.ue : usdEur;
    dates.push(p.d); invested.push(cumM); value.push((p.c||0)*ue*cumS);
  });
  const fmtE = function(v){ return "\u20ac"+Math.round(v).toLocaleString("fr-FR"); };
  const chartSeries = [
    {vals:invested, color:C.blue, label:"Investi cumulé", area:true},
    {vals:value,    color:color,  label:"Valeur du fonds"},
  ];

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:650,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={function(e){e.stopPropagation();}} style={{background:C.bg1,borderRadius:"20px 20px 0 0",padding:"22px 18px 32px",width:"100%",maxWidth:460,maxHeight:"88vh",overflowY:"auto",border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
          <div>
            <div style={{fontSize:18,fontWeight:700,color:color}}>{fond}</div>
            <div style={{fontSize:12,color:C.text3,marginTop:2}}>{isC?"Crypto":"Actions"} · {Math.round(totalParts).toLocaleString("fr-FR")} parts</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:18,fontWeight:600,color:C.text}}>{fmtE(valueNow)}</div>
            <div style={{fontSize:11,color:C.text3}}>cours {"\u20ac"}{coursEur.toFixed(4)}</div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
          <div style={{background:(pnlUp?C.green:C.red)+"15",border:`1px solid ${(pnlUp?C.green:C.red)}40`,borderRadius:12,padding:"12px 14px"}}>
            <div style={{fontSize:10,color:C.text3,textTransform:"uppercase",letterSpacing:1}}>P&L latent</div>
            <div style={{fontSize:20,fontWeight:700,color:pnlUp?C.green:C.red}}>{pnlUp?"+":""}{fmtE(pnl)}</div>
            <div style={{fontSize:12,fontWeight:700,color:pnlUp?C.green:C.red}}>{pnlUp?"+":""}{(pnlPct*100).toFixed(1)}%</div>
          </div>
          <div style={{background:C.bg2,borderRadius:12,padding:"12px 14px"}}>
            <div style={{fontSize:10,color:C.text3,textTransform:"uppercase",letterSpacing:1}}>Investi net · PRU</div>
            <div style={{fontSize:20,fontWeight:700,color:C.text}}>{fmtE(netInvested)}</div>
            <div style={{fontSize:12,fontWeight:700,color:C.text2}}>{pru.toFixed(2)} {"\u20ac"}/part</div>
          </div>
        </div>
        <div style={{background:C.bg2,borderRadius:12,padding:"10px 14px",marginBottom:14}}>
          <div style={{fontSize:10,color:C.text3,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Détention</div>
          {holders.map(function(x){return (
            <div key={x.h} style={{marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:3}}>
                <span style={{color:C.text,fontWeight:700}}>{x.h}</span>
                <span style={{color:C.text2}}>{(x.pct*100).toFixed(1)}% · {Math.round(x.sh).toLocaleString("fr-FR")} parts</span>
              </div>
              <div style={{height:5,background:C.border,borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:(Math.max(0,x.pct)*100).toFixed(1)+"%",background:color}}/>
              </div>
            </div>
          );})}
        </div>
        <div style={{background:C.bg2,borderRadius:12,padding:"12px 12px 8px",position:"relative"}}>
          <button onClick={function(){setFs(true);}} title="Plein écran" style={{position:"absolute",top:8,right:8,zIndex:5,background:C.bg1,border:`1px solid ${C.border}`,borderRadius:8,padding:"3px 8px",fontSize:14,lineHeight:1,cursor:"pointer",color:C.text2}}>⛶</button>
          <LineChart series={chartSeries} dates={dates} h={150} unit={"\u20ac"} defaultTF="ALL"/>
        </div>
        {fs && (
          <div onClick={function(){setFs(false);}} style={{position:"fixed",inset:0,zIndex:720,background:C.bg1,display:"flex",flexDirection:"column",padding:"14px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:15,fontWeight:600,color:color}}>{fond} · Investi vs Valeur</div>
              <button onClick={function(){setFs(false);}} style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",fontSize:13,fontWeight:700,cursor:"pointer",color:C.text}}>✕</button>
            </div>
            <div onClick={function(e){e.stopPropagation();}} style={{flex:1,display:"flex",alignItems:"center",width:"100%"}}>
              <div style={{width:"100%"}}>
                <LineChart series={chartSeries} dates={dates} h={340} unit={"\u20ac"} legend={[{color:C.blue,label:"Investi cumulé"},{color:color,label:"Valeur du fonds"}]} defaultTF="ALL"/>
              </div>
            </div>
          </div>
        )}
        <div style={{marginTop:14}}><Btn label="Fermer" onClick={onClose} color={C.gray} outline full/></div>
      </div>
    </div>
  );
}
function PageGDB(
{chartData,hidden,EFF,eur,liveGSB,liveGDBS,liveBench,liveGC,liveDD,liveInv}){
  const [benchTF, setBenchTF] = useState("YTD");
  const [detailFond, setDetailFond] = useState(null);
  const src = EFF||CURRENT;
  const usdEurNow = src.usdEur;
  const _GDBS = sanitizeGDBS(liveGDBS || GDBS);
  const _DD   = liveDD   || DD;

  // Prix actuels CGIC et CGIS
  const {gdbC: gcToday, gdbS: gsToday_calc} = calcGdbPrices(src);
  const gdbs2026 = _GDBS.filter(r=>r[0]>='2026-01-01');
  const gsToday  = gdbs2026[gdbs2026.length-1]?.[1] || src.gdbS;

  // Prix à une date donnée depuis GDBS
  const gsPriceAt = d => { for(let i=_GDBS.length-1;i>=0;i--) if(_GDBS[i][0]<=d) return _GDBS[i][1]; return _GDBS[0]?.[1]||src.gdbS; };
  const gcPriceAt = d => { for(let i=_GDBS.length-1;i>=0;i--) if(_GDBS[i][0]<=d) return _GDBS[i][2]; return _GDBS[0]?.[2]||src.gdbC; };

  // Taux USD/EUR à une date donnée depuis DD (col 5 = usdEur)
  const usdEurAt = d => {
    const row = _DD.reduceRight((a,r)=>a!=null?a:(r[0]<=d&&r[5]?r:null),null);
    return row ? row[5] : usdEurNow;
  };

  // Dates dynamiques depuis makeTFCuts
  const TF = makeTFCuts();
  const d1   = TF["1W"];  // ~7j
  const d7   = TF["1M"];  // ~30j (on réutilise les cuts existants)
  const d30  = TF["1M"];
  const dytd = TF["YTD"];

  // Perf période via composition mensuelle (helper global fundPeriodPerf) — cohérent avec Stats.
  const _gpNow = (typeof calcGdbPrices==="function") ? calcGdbPrices(src) : {};
  const _cmJG = (typeof CRYPTO_MONTHLY!=="undefined")?CRYPTO_MONTHLY:null;
  const _smJG = (typeof STOCKS_MONTHLY!=="undefined")?STOCKS_MONTHLY:null;
  const gcPerf = d => fundPeriodPerf("CGIC", d, _cmJG, _smJG, (_gpNow.gdbCfondsUSD!=null?_gpNow.gdbCfondsUSD:(src.crypto?src.crypto.total:0))*usdEurNow);
  const gsPerf = d => fundPeriodPerf("CGIS", d, _cmJG, _smJG, (_gpNow.gdbSfondsUSD!=null?_gpNow.gdbSfondsUSD:0)*usdEurNow);
  // #fix cohérence — indice base-100 AUJOURD'HUI (croissance totale time-weighted, live inclus) ;
  // sert de dernier point réel pour les sparklines (sinon elles gèlent au dernier mois clôturé).
  const _liveCgicIdx = 100*(1 + (gcPerf(TF["ALL"])||0));
  const _liveCgisIdx = 100*(1 + (gsPerf(TF["ALL"])||0));
  // Ancres des fonds : CGIC = série QUOTIDIENNE (fichier d'origine, ancrée sur le mensuel) ;
  // CGIS = mensuel (pas de quotidien fiable). Les deux prolongées jusqu'à aujourd'hui via la
  // forme quotidienne du KV de juin, ré-ancrée entre fin mai et la valeur live (endpoints exacts).
  const _cgicAnchors = gdbAppendLive(gdbCgicDailyAnchors(), "c", 2, _liveCgicIdx);
  const _cgisAnchors = gdbAppendLive(gdbCgisDailyAnchors(), "s", 1, _liveCgisIdx);
  // La sparkline ET le P&L de la carte dérivent de LA MÊME série (cohérence garantie).
  const _cgicSpark = _despikeCarry(gdbFundSeries(_cgicAnchors, TF[benchTF], _liveCgicIdx));
  const _cgisSpark = _despikeCarry(gdbFundSeries(_cgisAnchors, TF[benchTF], _liveCgisIdx));
  const _seriesPerf = ser => { const a=(ser||[]).filter(v=>v!=null); return a.length>=2 ? (a[a.length-1]/a[0]-1) : null; };
  // Depuis création CGIC : 10€ = 10.88$ au 25 mars 2020
  const GC_CREATION_USD = 10.88;
  const GC_CREATION_DATE = "2020-03-25";
  // Depuis création CGIS : 10€ = 11.67$ au 19 août 2025
  const GS_CREATION_USD = 11.67;
  const GS_CREATION_DATE = "2025-08-19";

  // ALL-TIME : prix de création = 10€ dans les deux cas
  // En € : perf = (cours_actuel_$  * usdEur_actuel) / 10€ - 1
  // En $ : perf = cours_actuel_$ / cours_création_$ - 1
  // (usdEurAt(2020-03-25) peut ne pas être dans DD → on utilise le prix € création = 10€ fixe)
  const GC_CREATION_EUR = 10.0;  // toujours 10€ à la création
  const GS_CREATION_EUR = 10.0;

  // (gcPerfAllTime / gsPerfAllTime sont calculés plus bas depuis INV_SEED — voir bloc "P&L fonds")

  const {gdbS: gcS_calc, gdbC: gcC_calc, gdbSfondsUSD, gdbCfondsUSD} = calcGdbPrices(src);
  const gcQty   = FUND_PARTS.C;
  const gcFonds = Math.round(gdbCfondsUSD != null ? gdbCfondsUSD : src.crypto.total);
  const gsQty   = FUND_PARTS.S;
  const gsFonds = Math.round(gdbSfondsUSD || (src.stocks.items.filter(x=>x.cat!=="Cash").reduce((s,x)=>s+x.val,0) + (src.stocks.items.find(x=>x.t==="EURO")?.val||0)));

  const gsYTD = gsPerf(dytd);   // après gsFonds (évite le TDZ : gcPerf/gsPerf lisent gcFonds/gsFonds)

  // ── P&L fonds depuis INV_SEED (capital net investi) — remplace l'ancien GDBS (indice base-100, cassé) ──
  const _INV_GDB = liveInv || INV_SEED_OK;
  const _netFund = f => { let m=0,sh=0; _INV_GDB.forEach(x=>{ if(x.fonds===f){ const s=(x.io==="OUT")?-1:1; m+=s*(x.montant||0); sh+=s*(x.shares||0); } }); return {m,sh}; };
  const _ncgic=_netFund("CGIC"), _ncgis=_netFund("CGIS");
  const gcNAV = _ncgic.sh>0 ? gcFonds/_ncgic.sh : 0;   // NAV (cours) en $
  const gsNAV = _ncgis.sh>0 ? gsFonds/_ncgis.sh : 0;
  const gcPerfAllTime = _ncgic.m>0 ? (gcFonds*usdEurNow)/_ncgic.m - 1 : 0;   // P&L money-weighted en €
  const gsPerfAllTime = _ncgis.m>0 ? (gsFonds*usdEurNow)/_ncgis.m - 1 : 0;
  // #61 — l'onglet JCGI déclare ses valeurs au tronc de vérité
  try{ const _mJG=computePortfolioModel(src); cgiReport("Onglet JCGI", {totalUSD:_mJG.totalUSD, cryptoUSD:_mJG.cryptoUSD, stocksUSD:_mJG.stocksUSD, cgicPnl:gcPerfAllTime*100, cgisPnl:gsPerfAllTime*100}); }catch(e){}

  // #fund-pl — l'onglet JCGI publie SES valeurs affichées (P&L + cours) dans le snapshot (fusion) → baromètre = app
  React.useEffect(()=>{
    try{
      const _ue=src.usdEur||0.92;
      const _cur=lsv9Get('cgi_fund_stats')||{};
      saveBase('cgi_fund_stats',{..._cur,
        cgic:{nav:gcNAV*_ue, navUSD:gcNAV, valueEUR:Math.round(gcFonds*_ue), valueUSD:Math.round(gcFonds), pnlPct:gcPerfAllTime*100, sh:_ncgic.sh, mEUR:_ncgic.m},
        cgis:{nav:gsNAV*_ue, navUSD:gsNAV, valueEUR:Math.round(gsFonds*_ue), valueUSD:Math.round(gsFonds), pnlPct:gsPerfAllTime*100, sh:_ncgis.sh, mEUR:_ncgis.m},
        ue:_ue, tsFunds:Date.now()});
      // #2.7 — resynchroniser aussi les positions : le baromètre valorise cgi_portfolio en live,
      // un KV périmé (position vendue, quantité modifiée) fausserait les pôles entre deux ouvertures.
      try{ const _pf=lsv9Get('cgi_portfolio'); if(_pf&&_pf.items&&_pf.items.length) saveBase('cgi_portfolio',_pf); }catch(e){}
      cgiReport("Baromètre · snapshot", {cgicPnl:gcPerfAllTime*100, cgisPnl:gsPerfAllTime*100});
    }catch(e){}
  }, [gcPerfAllTime, gsPerfAllTime, gcNAV, gsNAV, gcFonds, gsFonds]);



  const bench = (()=>{
    const TF_CUTS = makeTFCuts();
    const cut = TF_CUTS[benchTF]||"2023-01-01";
    const GS_BASE = 11.7681;
    const _gcData = liveGC || GC_FULL;
    const _gsbData = liveGSB || GS_B100_EXT;
    const _benchData = liveBench || BENCH_IDX;

    // Maps — valeurs null exclues
    const gcMap2 = {}; _gcData.forEach(r=>{ if(r[1]!=null) gcMap2[r[0]]=r[1]; });
    const gsMap3 = {}; _gsbData.forEach(r=>{ if(r[1]!=null) gsMap3[r[0]]=r[1]/100*GS_BASE; });
    const dbMap3 = {}; _benchData.forEach(r=>{ if(r[1]!=null) dbMap3[r[0]]=r; });

    // Derniers points non-null
    const gcLast = _gcData.length>0 ? _gcData[_gcData.length-1][1] : calcGdbPrices(CURRENT).gdbC;
    const gsLast = _gsbData.reduceRight((a,r)=>a!=null?a:(r[1]!=null?r[1]/100*GS_BASE:null),null);
    const dbLast = _benchData.reduceRight((a,r)=>a!=null?a:(r[1]!=null?r:null),null);

    // Premier point non-null à partir de cut
    const fwd = (m, c) => {
      const keys = Object.keys(m).filter(d=>d>=c).sort();
      return keys.length ? m[keys[0]] : null;
    };

    // Taux de change au cut (premier point DD >= cut)
    const usdEurCut = (()=>{
      const row = _DD.reduceRight((a,r)=>a!=null?a:(r[0]<=cut&&r[5]?r:null),null);
      return row ? row[5] : usdEurNow;
    })();

    const fxPerf = (now, start) => {
      if(!start || !now) return null;
      if(eur) return (now*usdEurNow)/(start*usdEurCut)-1;
      return now/start-1;
    };

    const pGC = ()=>{ const s=fwd(gcMap2,cut); return fxPerf(gcLast,s); };
    const pGS = ()=>{
      const ytdStart = gsMap3['2026-01-01']||GS_BASE;
      const s = cut<'2026-01-01' ? ytdStart : fwd(gsMap3,cut);
      return fxPerf(gsLast,s);
    };
    const pDB = col=>{
      const colMap = {}; _benchData.forEach(r=>{ if(r[col]!=null) colMap[r[0]]=r[col]; });
      const s=fwd(colMap,cut), e=colMap[Object.keys(colMap).filter(d=>d<=(_benchData[_benchData.length-1]?.[0]||'9')).sort().at(-1)];
      return fxPerf(e,s);
    };

    return [
      {n:"CGIC",  v:pGC(),  ic:"₿",  color:C.btc},
      {n:"CGIS",  v:pGS(),  ic:"📈", color:C.red},
      {n:"Bitcoin",v:pDB(2), ic:"🟠", color:"#F7931A"},
      {n:"S&P 500",v:pDB(3), ic:"🇺🇸",color:"#6B7280"},
      {n:"Nasdaq", v:pDB(4), ic:"🖥",  color:"#10B981"},
      {n:"ETH",    v:pDB(5), ic:"🔵", color:"#1E40AF"},
      {n:"MSCI",   v:pDB(5), ic:"🌍", color:"#EC4899"},
    ];
  })();

  return(
    <div>
      <PageTitle title="JCGI" sub="Fonds · CGIC & CGIS"/>

      {/* #70 — sélecteur de timeframe remonté en haut, pilote P&L + graphes de la page */}
      <div style={{display:"flex",gap:6,marginBottom:14}}>
        {["1W","1M","MTD","YTD","1Y","2Y","ALL"].map(t=>(
          <button key={t} onClick={()=>setBenchTF(t)} style={lxBtn({active:benchTF===t,style:{flex:1,padding:"7px 0",fontSize:10}})}>{t}</button>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr",gap:8,marginBottom:4}}>
        <FondCard label="CGIC — Crypto" cours={gcNAV} qty={_ncgic.sh} fonds={gcFonds} color={C.btc} hidden={hidden}
          eur={eur} usdEur={src.usdEur} perfAllTime={gcPerfAllTime} onClick={()=>setDetailFond("CGIC")}
          tfLabel={benchTF} perf={benchTF==="ALL" ? gcPerfAllTime : _seriesPerf(_cgicSpark)} spark={_cgicSpark}/>
        <FondCard label="CGIS — Actions" cours={gsNAV} qty={_ncgis.sh} fonds={gsFonds} color={C.blue} hidden={hidden}
          eur={eur} usdEur={src.usdEur} perfAllTime={gsPerfAllTime} onClick={()=>setDetailFond("CGIS")}
          tfLabel={benchTF} perf={benchTF==="ALL" ? gsPerfAllTime : _seriesPerf(_cgisSpark)} spark={_cgisSpark}/>
      </div>
      {detailFond && <FondDetailModal fond={detailFond} EFF={EFF} liveInv={liveInv} liveDD={liveDD} liveGC={liveGC} eur={eur} onClose={()=>setDetailFond(null)}/>}

      <div style={{fontSize:10,letterSpacing:4,color:C.text2,textTransform:"uppercase",textAlign:"center",margin:"22px 0 12px"}}>Comparaison à base 100</div>
      <GdbCompareChartGDB tf={benchTF} onTFChange={setBenchTF} liveGSB={liveGSB} liveGDBS={liveGDBS} liveBench={liveBench} liveGC={liveGC} liveCgicIdx={_liveCgicIdx} liveCgisIdx={_liveCgisIdx}/>
      {/* Liste benchmark en barres retiree a la demande — v26.08 */}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAGE TRADES
═══════════════════════════════════════════════════════════ */
function PageTrades({txns,onAdd,onDel,hidden=false,EFF,onTradeApplied,showAdd:showAddProp,setShowAdd:setShowAddProp}){
  const[showAddLocal,setShowAddLocal]=useState(false);
  const showAdd    = showAddProp    !== undefined ? showAddProp    : showAddLocal;
  const setShowAdd = setShowAddProp !== undefined ? setShowAddProp : setShowAddLocal;
  const[filter,setFilter]=useState("ALL");
  const[form,setForm]=useState({date:today(),side:"BUY",ticker:"BTC",cat:"Picking",qty:"",price:"",currency:"USD",note:"",bank:"Aucune"});
  const fil=txns.filter(t=>filter==="ALL"||t.side.toUpperCase()===filter);
  const pos={};
  txns.forEach(t=>{
    const k=t.ticker.toUpperCase();
    if(!pos[k])pos[k]={t:k,bq:0,sq:0,bc:0};
    if(t.side.toUpperCase()==="BUY"){pos[k].bq+=t.qty;pos[k].bc+=t.qty*t.price;}
    else pos[k].sq+=t.qty;
  });
  const submit=()=>{
    if(!form.qty||!form.price||!form.ticker)return;
    const src = EFF||CURRENT;
    const priceUSD = form.currency==="EUR"
      ? parseFloat(form.price) * src.eurUsd
      : parseFloat(form.price);
    const trade={...form,qty:parseFloat(form.qty),price:priceUSD,priceRaw:parseFloat(form.price),currency:form.currency,id:uid(),bankAccount:form.bank||"Aucune"};
    onAdd(trade);
    onTradeApplied(trade);
    setShowAdd(false);
    setForm({date:today(),side:"BUY",ticker:"BTC",cat:"Picking",qty:"",price:"",currency:"USD",note:"",bank:"Aucune"});
  };

  return(
    <div>
      <button onClick={()=>setShowAdd(true)} style={{width:"100%",background:C.green+"22",border:`1px solid ${C.green}`,borderRadius:10,padding:"11px 0",color:C.green,fontWeight:600,fontSize:13,cursor:"pointer",marginBottom:14}}>
        + Enregistrer achat / vente
      </button>

      <div style={{display:"flex",gap:4,background:C.bg1,borderRadius:10,padding:4,marginBottom:14}}>
        {[["ALL","Toutes"],["BUY","Achats"],["SELL","Ventes"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)} style={{flex:1,padding:"7px 0",borderRadius:7,fontSize:11,fontWeight:700,border:"none",cursor:"pointer",background:filter===v?(v==="BUY"?C.green:v==="SELL"?C.red:C.btc):"transparent",color:filter===v?"#fff":C.gray}}>{l}</button>
        ))}
      </div>

      <SH label="Positions cumulées" color={C.gray}/>
      <div style={{...crd(),padding:"12px"}}>
        {Object.values(pos).map((p,i,arr)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none"}}>
            <div>
              <span style={{fontSize:13,fontWeight:600,color:C.btc}}>{p.t}</span>
              {p.sq>0&&<span style={{fontSize:10,color:C.red,marginLeft:6}}>Vendu: {p.sq.toFixed(3)}</span>}
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:12,fontWeight:700}}>Net: {(p.bq-p.sq).toFixed(4)}</div>
              <div style={{fontSize:10,color:C.gray}}>PA: {hidden?"***":"$"+(p.bc/p.bq).toFixed(2)}</div>
            </div>
          </div>
        ))}
      </div>

      <SH label={`Journal (${fil.length})`} color={C.gray}/>
      {fil.map(t=>{
        const buy=t.side.toUpperCase()==="BUY",valo=t.qty*t.price;
        return(
          <div key={t.id} style={{...crd(),display:"flex",alignItems:"center",gap:10,padding:"10px 12px"}}>
            <div style={{width:34,height:34,borderRadius:9,background:(buy?C.green:C.red)+"22",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{fontSize:14,color:buy?C.green:C.red,fontWeight:600}}>{buy?"↓":"↑"}</span>
            </div>
            <div style={{flex:1}}>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontSize:13,fontWeight:600}}>{t.ticker.toUpperCase()}</span>
                  <span style={{fontSize:9,color:buy?C.green:C.red,background:(buy?C.green:C.red)+"22",padding:"1px 5px",borderRadius:4,fontWeight:700}}>{t.side.toUpperCase()}</span>
                </div>
                <span style={{fontSize:13,fontWeight:600,color:buy?C.green:C.red}}>{hidden?"***":(buy?"-":"+")+"$"+fmt(valo)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:2}}>
                <span style={{fontSize:10,color:C.gray}}>{t.date} · {t.qty} × {hidden?"***":"$"+fmt(t.price)}</span>
                {t.note&&<span style={{fontSize:10,color:C.text3,fontStyle:"italic"}}>{t.note}</span>}
              </div>
            </div>
            <button onClick={()=>onDel(t.id)} style={{background:"none",border:"none",color:C.text3,cursor:"pointer",fontSize:16,padding:"0 4px"}}>×</button>
          </div>
        );
      })}


    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SNAPSHOT MODAL
═══════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
   TRADE MODAL — top-level pour s'afficher depuis n'importe quel onglet
═══════════════════════════════════════════════════════════ */
/* ── YahooTickerSearch : recherche de tickers par nom via Yahoo Finance ──── */
function YahooTickerSearch({onSelect}){
  var query_s=useState(""); var query=query_s[0]; var setQuery=query_s[1];
  var results_s=useState([]); var results=results_s[0]; var setResults=results_s[1];
  var loading_s=useState(false); var loading=loading_s[0]; var setLoading=loading_s[1];
  var error_s=useState(null); var error=error_s[0]; var setError=error_s[1];
  var timer_s=useState(null); var timer=timer_s[0]; var setTimer=timer_s[1];

  var EU_SUFFIXES=[".PA",".MI",".AS",".BR",".DE",".F",".HA",".L",".SW",".CO",".ST",".MC",".AMS"];

  function doSearch(q){
    var q2=(q||query).trim();
    if(!q2||q2.length<2){setResults([]);return;}
    setLoading(true); setError(null);
    // Passer par le worker Cloudflare qui n'a pas de contrainte CORS
    fetch(CF_WORKER_URL+"/search?q="+encodeURIComponent(q2),{
      headers:{"X-Auth-Key":CF_AUTH_KEY},
      signal:AbortSignal.timeout(8000),
    })
      .then(function(r){return r.json();})
      .then(function(data){
        if(data.error) throw new Error(data.error);
        setResults(data.quotes||[]);
        if((data.quotes||[]).length===0) setError("Aucun résultat pour «"+q2+"»");
      })
      .catch(function(e){setResults([]);setError("Erreur: "+e.message);})
      .finally(function(){setLoading(false);});
  }

  function handleChange(v){
    setQuery(v);
    if(timer) clearTimeout(timer);
    var t=setTimeout(function(){doSearch(v);},200);
    setTimer(t);
  }

  return(
    <div>
      <div style={{fontSize:10,color:C.gray,marginBottom:4,fontWeight:600}}>🔍 Rechercher par nom de société</div>
      <div style={{display:"flex",gap:6}}>
        <input value={query} onChange={function(e){handleChange(e.target.value);}}
          onKeyDown={function(e){if(e.key==="Enter") doSearch(query);}}
          placeholder="Ex: Nvidia, TotalEnergies, Bitcoin..."
          style={{flex:1,background:C.bg3,border:"1px solid "+C.border,borderRadius:8,
            padding:"8px 10px",color:C.text,fontSize:13,outline:"none"}}/>
        <button onClick={function(){doSearch(query);}} disabled={loading||query.length<2}
          style={{padding:"8px 12px",borderRadius:8,background:C.teal,border:"none",
            color:"#000",fontSize:12,fontWeight:700,cursor:query.length<2?"default":"pointer",
            opacity:query.length<2?0.5:1}}>
          {loading?"↻":"🔍"}
        </button>
      </div>
      {error&&<div style={{fontSize:10,color:C.red,marginTop:4}}>{error}</div>}
      {results.length>0&&(
        <div style={{background:C.bg3,borderRadius:8,border:"1px solid "+C.teal+"66",marginTop:4,overflow:"hidden"}}>
          {results.map(function(q,i){
            var isEU=EU_SUFFIXES.some(function(s){return q.symbol.endsWith(s);});
            return(
              <div key={i} onClick={function(){
                var base=q.symbol.includes(".")?q.symbol.split(".")[0]:q.symbol;
                onSelect({ticker:base,yahooSym:q.symbol,name:q.shortname,currency:isEU?"EUR":"USD"});
                setQuery(q.shortname+" ("+q.symbol+")");
                setResults([]);
              }} style={{
                padding:"8px 12px",cursor:"pointer",
                borderBottom:i<results.length-1?"1px solid "+C.border+"44":"none",
                display:"flex",justifyContent:"space-between",alignItems:"center",
              }}>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:C.teal}}>{q.symbol}</div>
                  <div style={{fontSize:10,color:C.text2,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.shortname}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:10,color:C.gray}}>{q.exchange}</div>
                  <div style={{fontSize:9,color:isEU?C.blue:C.green}}>{isEU?"🇪🇺 EUR":"🇺🇸 USD"}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TradeModal({onClose, onAdd, onTradeApplied, EFF, holders, onInvestApplied}){
  const[mode,setMode]=useState("trade");
  const[form,setForm]=useState({date:today(),side:"BUY",ticker:"BTC",cat:"Picking",qty:"",price:"",currency:"USD",note:"",bank:"Aucune"});
  const[showNew,setShowNew]=useState(false);
  const[depot,setDepot]=useState({date:today(),bank:"BCI",montant:"",type:"depot",note:""});
  const[confirm,setConfirm]=useState(false);
  const[invest,setInvest]=useState({date:today(),holder:"FLO",io:"IN",fonds:"CGIC",montant:"",bank:"BCI",newHolder:""});
  const[confirmInv,setConfirmInv]=useState(false);
  const[done,setDone]=useState(null); // {type, montant, bank} après succès
  const src = EFF||CURRENT;

  const submitDepot=()=>{
    if(!depot.montant||!depot.bank) return;
    const montantEUR = parseFloat(depot.montant);
    if(isNaN(montantEUR)||montantEUR<=0) return;
    const isRetrait = depot.type==="retrait";
    const delta = isRetrait ? -montantEUR : montantEUR;
    const trade = {
      id:uid(), date:depot.date, side: isRetrait ? "RETRAIT" : "DEPOT",
      ticker:"CASH", qty:montantEUR, price:1,
      currency:"EUR", bankAccount:depot.bank,
      note:depot.note||(isRetrait?"Retrait "+depot.bank:"Dépôt "+depot.bank),
      isDeposit:true,
    };
    onAdd(trade);
    const newBank = {
      ...src.bank,
      breakdown:{...src.bank.breakdown, [depot.bank]:(src.bank.breakdown[depot.bank]||0)+delta},
      totalEUR: src.bank.totalEUR + delta,
    };
    onTradeApplied({...trade, _directBank: newBank});
    // #86b — pousser tout de suite le nouveau solde au cloud (horodaté), sans attendre un snapshot,
    // pour la synchro multi-appareils du cash matelas.
    try{ if(typeof saveBase==="function") saveBase('cgi_bank', {...newBank, savedAt:Date.now()}); }catch(e){}
    setDone({type:isRetrait?"retrait":"depot", montant:montantEUR, bank:depot.bank});
  };

  const submit=()=>{
    const resolvedTicker = form.ticker==="NOUVEAU" ? (form.newTicker||"").toUpperCase() : form.ticker;
    if(!form.qty||!form.price||!resolvedTicker)return;
    const priceUSD = form.currency==="EUR"
      ? parseFloat(form.price)*src.eurUsd
      : parseFloat(form.price);    const valoUSD = parseFloat(form.qty)*priceUSD;
    const valoEUR = Math.round(valoUSD*src.usdEur);
    // Enregistrer Yahoo symbol et icône pour nouveau token
    if(form.ticker==="NOUVEAU"){
      const yahooSym = (form.yahooSymbol||"").trim() || resolvedTicker;
      YF_MAP[resolvedTicker] = yahooSym;
      if(form.newIcon) {
        setIconDb(resolvedTicker, { user: form.newIcon });
        // Sauvegarde immédiate en KV (sans attendre le snapshot)
        fetch(CF_WORKER_URL+"/write-bases", {
          method:"POST",
          headers:{"Content-Type":"application/json","X-Auth-Key":CF_AUTH_KEY},
          body: JSON.stringify({ cgi_icons: serializeIconDb(), cgi_yfmap: YF_MAP }),
          signal: AbortSignal.timeout(18000),
        }).catch(()=>{});
      }
    }
    // v23.20 — catégorie d'une VENTE = catégorie réelle de l'actif vendu.
    // Sinon form.cat reste "Picking" → txn mal classée ET applyTrade ne route pas
    // la crypto (isCryptoTrade testait cat==="Crypto"). On la dérive du portefeuille.
    let resolvedCat = form.cat;
    if(form.side==="SELL"){
      const heldItem = src.portfolio?.items?.find(x=>x.t===resolvedTicker);
      if(heldItem && heldItem.cat) resolvedCat = heldItem.cat;
    }
    const trade={...form, cat:resolvedCat, ticker:resolvedTicker, qty:parseFloat(form.qty),
      price:priceUSD, priceRaw:parseFloat(form.price), currency:form.currency,
      id:uid(), bankAccount:form.bank||"Aucune"};
    onAdd(trade);
    onTradeApplied(trade);
    setShowNew(false);
    setDone({type:"trade", side:form.side, ticker:resolvedTicker, qty:parseFloat(form.qty), valoUSD, valoEUR, bank:form.bank, note:form.note, date:form.date});
  };

  return(
    <Modal title="Transaction" onClose={onClose}>
      {done ? (
        /* ── Écran de confirmation après opération ── */
        <div style={{padding:"8px 0"}}>
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:40,marginBottom:8}}>✅</div>
            <div style={{fontSize:16,fontWeight:600,color:C.green,marginBottom:4}}>
              {done.type==="trade"
                ? (done.side==="BUY" ? "Achat enregistré" : "Vente enregistrée")
                : done.type==="retrait" ? "Retrait effectué" : "Dépôt effectué"}
            </div>
            <div style={{fontSize:12,color:C.text3}}>{done.date}</div>
          </div>
          <div style={{background:C.bg2,borderRadius:12,padding:"12px 14px",marginBottom:14,display:"flex",flexDirection:"column",gap:8}}>
            {done.type==="trade" ? (<>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:C.text2}}>Ticker</span>
                <span style={{fontSize:13,fontWeight:600,color:C.text}}>{done.ticker}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${C.border}`,paddingTop:7}}>
                <span style={{fontSize:12,color:C.text2}}>Quantité</span>
                <span style={{fontSize:13,fontWeight:700,color:C.text}}>{done.qty}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${C.border}`,paddingTop:7}}>
                <span style={{fontSize:12,color:C.text2}}>Montant</span>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:14,fontWeight:600,color:done.side==="BUY"?C.red:C.green}}>
                    {done.side==="BUY"?"-":"+"}${fmt(done.valoUSD)}
                  </div>
                  <div style={{fontSize:10,color:C.text3}}>{done.side==="BUY"?"-":"+"}€{fmt(done.valoEUR)}</div>
                </div>
              </div>
              {done.bank&&done.bank!=="Aucune"&&(
                <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${C.border}`,paddingTop:7}}>
                  <span style={{fontSize:12,color:C.text2}}>Contrepartie</span>
                  <span style={{fontSize:12,fontWeight:700,color:C.teal}}>{done.bank}</span>
                </div>
              )}
              {done.note&&<div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${C.border}`,paddingTop:7}}>
                <span style={{fontSize:12,color:C.text2}}>Note</span>
                <span style={{fontSize:12,color:C.text3}}>{done.note}</span>
              </div>}
            </>) : (<>
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:C.text2}}>Banque</span>
                <span style={{fontSize:13,fontWeight:600,color:C.text}}>{done.bank}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${C.border}`,paddingTop:7}}>
                <span style={{fontSize:12,color:C.text2}}>Montant</span>
                <span style={{fontSize:15,fontWeight:600,color:done.type==="retrait"?C.red:C.green}}>
                  {done.type==="retrait"?"-":"+"}€{fmt(done.montant)}
                </span>
              </div>
            </>)}
          </div>
          <Btn label="Fermer" onClick={onClose} color={C.green}/>
        </div>
      ) : (
        <>
      {/* Sélecteur mode */}
      <div style={{display:"flex",gap:6,marginBottom:14,background:C.bg2,borderRadius:10,padding:4}}>
        {[["trade","Achat / Vente"],["depot","Dépôt"],["invest","Investir"]].map(([k,l])=>(
          <button key={k} onClick={()=>setMode(k)} style={{
            flex:1,padding:"9px 0",borderRadius:8,fontSize:10.5,fontWeight:600,letterSpacing:1.2,textTransform:"uppercase",
            border:"none",cursor:"pointer",transition:"background .15s,color .15s",
            background:mode===k?C.gold:"transparent",
            color:mode===k?"#0B0A08":C.text2,
          }}>{l}</button>
        ))}
      </div>

      {mode==="trade" ? (
        <>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div style={{gridColumn:"1/-1"}}><FI label="Date" type="date" value={form.date} onChange={v=>setForm({...form,date:v})}/></div>
            <div style={{gridColumn:"1/-1"}}>
              <div style={{display:"flex",gap:6,background:C.bg2,borderRadius:8,padding:3}}>
                {[["BUY","Acheter"],["SELL","Vendre"]].map(([k,l])=>(
                  <button key={k} onClick={()=>{
                    const firstSellTicker = k==="SELL" && src.portfolio?.items
                      ? src.portfolio.items.filter(x=>x.cat!=="Cash Matelas"&&x.qty>0).map(x=>x.t)[0]||"BTC"
                      : form.ticker;
                    const ticker = k==="SELL" ? firstSellTicker : form.ticker;
                    const item = src.portfolio?.items?.find(x=>x.t===ticker);
                    const livePrice = item?.live ? String(item.live) : form.price;
                    const cur = item?.live && (YF_MAP[ticker]||ticker).match(/\.(PA|MI|AS|BR|DE|F|L)$/) ? "EUR" : form.currency;
                    setForm({...form, side:k, ticker: k==="SELL" ? firstSellTicker : "_PORTFOLIO_0", price:livePrice, currency:cur});
                  }} style={{
                    flex:1,padding:"8px 0",borderRadius:6,fontSize:13,fontWeight:700,
                    border:"none",cursor:"pointer",
                    background:form.side===k?(k==="BUY"?C.green:C.red):"transparent",
                    color:form.side===k?"#fff":C.gray,
                  }}>{l}</button>
                ))}
              </div>
            </div>
            {form.side==="SELL" ? (
              <FS label="Ticker" value={form.ticker} onChange={v=>{
                const item = src.portfolio?.items?.find(x=>x.t===v);
                const livePrice = item?.live ? String(item.live) : "";
                const cur = item?.live && (YF_MAP[v]||v).match(/\.(PA|MI|AS|BR|DE|F|L)$/) ? "EUR" : "USD";
                const cat = item ? (item.cat||"Picking") : form.cat;   // v23.20 — catégorie réelle de l'actif vendu
                setForm({...form,ticker:v,price:livePrice,currency:cur,cat});
              }}
                options={(src.portfolio&&src.portfolio.items?src.portfolio.items.filter(x=>x.cat!=="Cash Matelas"&&x.qty>0):[]).map(x=>x.t)}/>
            ) : (<>
              {/* Dropdown : caché si nouveau ticker actif */}
              {!showNew && (
              <FS label="Ticker" value={form.ticker} onChange={v=>{
                const item = src.portfolio?.items?.find(x=>x.t===v);
                const livePrice = item?.live ? String(item.live) : "";
                const cur = item?.live && (YF_MAP[v]||v).match(/\.(PA|MI|AS|BR|DE|F|L)$/) ? "EUR" : "USD";
                const cat = item ? (item.cat||"Picking") : form.cat;
                setForm({...form, ticker:v, price:livePrice, currency:cur, cat});
              }}
                options={[
                  ...(src.portfolio&&src.portfolio.items
                    ? src.portfolio.items.filter(x=>x.cat!=="Cash Matelas"&&x.qty>0).map(x=>x.t).sort((a,b)=>a.localeCompare(b))
                    : []),
                  "EUR", "USD",
                ]}/>
              )}

              {/* Bouton nouveau ticker */}
              <div style={{gridColumn:"1/-1"}}>
                <button onClick={()=>{
                  setShowNew(!showNew);
                  if(!showNew) setForm({...form, ticker:"NOUVEAU"});
                  else setForm({...form, ticker:"BTC"});
                }} style={{
                  width:"100%", padding:"10px 14px", borderRadius:10, cursor:"pointer",
                  border:`1.5px ${showNew ? "solid" : "dashed"} ${showNew ? C.red+"aa" : C.teal}`,
                  background: showNew ? C.red+"15" : C.teal+"18",
                  color: showNew ? C.red : C.teal,
                  fontSize:13, fontWeight:600,
                  display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                  letterSpacing:0.2,
                }}>
                  <span style={{fontSize:16,lineHeight:1}}>{showNew ? "✕" : "＋"}</span>
                  {showNew ? "Annuler" : "Nouveau ticker"}
                </button>
              </div>

              {/* Panneau nouveau token */}
              {showNew && (
                <div style={{gridColumn:"1/-1",background:C.bg2,borderRadius:10,padding:"12px 14px",border:"1px solid "+C.teal+"44",display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.teal}}>Nouveau token</div>
                  <YahooTickerSearch
                    onSelect={({ticker, yahooSym, name, currency})=>{
                      const isEU = [".PA",".MI",".AS",".BR",".DE",".F",".HA",".L"].some(s=>(yahooSym||"").endsWith(s));
                      setForm({...form, ticker:"NOUVEAU", newTicker:ticker, yahooSymbol:yahooSym||ticker, currency:isEU?"EUR":form.currency});
                    }}
                  />
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <FI label="Symbole ticker *" value={form.newTicker||""} onChange={v=>setForm({...form,newTicker:v.toUpperCase()})} placeholder="NVDA"/>
                    <FI label="Icône (emoji)" value={form.newIcon||""} onChange={v=>setForm({...form,newIcon:v})} placeholder="🟩"/>
                  </div>
                  <FI label="Symbole Yahoo Finance (facultatif)" value={form.yahooSymbol||""} onChange={v=>{
                    const isEU = [".PA",".MI",".AS",".BR",".DE",".F",".HA",".L"].some(s=>v.endsWith(s));
                    setForm({...form, yahooSymbol:v, currency: isEU ? "EUR" : form.currency});
                  }} placeholder="NVDA, NVDA.PA, NVDA.L ..."/>
                  {(form.yahooSymbol||"").match(/\.(PA|MI|AS|BR|DE|F|L)$/) && (
                    <div style={{fontSize:10,color:C.teal,marginTop:-8}}>Détecté : bourse EU — prix en EUR</div>
                  )}
                  <div style={{fontSize:9,color:C.gray}}>Laisse vide = même symbole que le ticker.</div>
                  <FS label="Catégorie" value={form.cat} onChange={v=>setForm({...form,cat:v})}
                    options={["Crypto","Indices","Picking","Or","Cash"]}/>
                </div>
              )}

              {/* Catégorie pour ticker existant */}
              {!showNew && (
                <FS label="Catégorie" value={form.cat} onChange={v=>setForm({...form,cat:v})}
                  options={["Crypto","Indices","Picking","Or","Cash"]}/>
              )}
            </>)}
            <FI label="Quantité" type="number" value={form.qty} onChange={v=>setForm({...form,qty:v})} placeholder="0.01"/>
            <div>
              <FI label={`Prix (${form.currency})`} type="number" value={form.price} onChange={v=>setForm({...form,price:v})} placeholder={form.currency==="USD"?"77000":"68000"}/>
              {(()=>{
                const item = src.portfolio?.items?.find(x=>x.t===(form.ticker==="NOUVEAU"?form.newTicker:form.ticker));
                if(!item?.live) return null;
                const isLive = form.price === String(item.live);
                return(
                  <div style={{fontSize:9,color:isLive?C.green:C.gray,marginTop:3,paddingLeft:2}}>
                    {isLive?"✓ Prix live":"Live: "}
                    {!isLive&&<span style={{color:C.teal,cursor:"pointer",textDecoration:"underline"}}
                      onClick={()=>setForm({...form,price:String(item.live)})}>
                      {item.live} {form.currency} (cliquer pour appliquer)
                    </span>}
                  </div>
                );
              })()}
            </div>
            <FS label="Devise" value={form.currency} onChange={v=>{
              const oldPrice = parseFloat(form.price);
              let newPrice = form.price;
              if(!isNaN(oldPrice) && oldPrice > 0){
                if(v==="EUR" && form.currency==="USD"){
                  newPrice = String(parseFloat((oldPrice * src.usdEur).toFixed(4)));
                } else if(v==="USD" && form.currency==="EUR"){
                  newPrice = String(parseFloat((oldPrice * src.eurUsd).toFixed(4)));
                }
              }
              setForm({...form, currency:v, price:newPrice});
            }} options={["USD","EUR"]}/>
            <div style={{gridColumn:"1/-1"}}><FI label="Note" value={form.note} onChange={v=>setForm({...form,note:v})} placeholder="DCA, TP..."/></div>
            <div style={{gridColumn:"1/-1"}}>
              <FS label="Contrepartie" value={form.bank||"Aucune"}
                onChange={v=>setForm({...form,bank:v})}
                options={["Aucune","LCL","BCI","DeBlock","KuCoin","IBKR"]}/>
            </div>
          </div>
          {form.qty&&form.price&&(
            <div style={{background:C.bg3,borderRadius:8,padding:"10px 12px",marginBottom:14}}>
              {(()=>{
                const priceUSD = form.currency==="EUR"?parseFloat(form.price||0)*src.eurUsd:parseFloat(form.price||0);
                const valoUSD  = parseFloat(form.qty||0)*priceUSD;
                const valoEUR  = Math.round(valoUSD*src.usdEur);
                const sign     = form.side==="BUY"?"-":"+";
                const col      = form.side==="BUY"?C.red:C.green;
                return(
                  <>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{fontSize:12,color:C.gray}}>Valorisation</span>
                      <div style={{textAlign:"right"}}>
                        <span style={{fontSize:14,fontWeight:600,color:col}}>{sign}${fmt(valoUSD)}</span>
                        <span style={{fontSize:10,color:C.gray,marginLeft:6}}>{sign}€{fmt(valoEUR)}</span>
                      </div>
                    </div>
                    {form.bank&&form.bank!=="Aucune"&&(()=>{
                      const isStockCash=form.bank==="KuCoin"||(form.bank==="IBKR"&&form.currency==="USD");
                      const isIBKR_EUR = form.bank==="IBKR"&&form.currency==="EUR";
                      const bal = isIBKR_EUR
                        ? (src.stocks.items.find(x=>x.t==="EURO")?.qty||0)
                        : form.bank==="KuCoin"
                        ? (src.stocks.items.find(x=>x.t==="KUCOIN")?.val||0)
                        : isStockCash
                        ? (src.stocks.items.find(x=>x.t==="USD")?.val||0)
                        : (src.bank.breakdown[form.bank]||0);
                      const impact = isIBKR_EUR ? Math.round(valoEUR) : isStockCash ? Math.round(valoUSD) : Math.round(valoEUR);
                      const after = form.side==="BUY" ? bal-impact : bal+impact;
                      const sym = isIBKR_EUR ? "€" : isStockCash ? "$" : "€";
                      return(
                        <div style={{display:"flex",justifyContent:"space-between",borderTop:`1px solid ${C.border}`,paddingTop:4}}>
                          <span style={{fontSize:10,color:C.gray}}>{form.bank} après</span>
                          <span style={{fontSize:12,fontWeight:700,color:after<0?C.red:C.green}}>{sym}{fmt(after)}</span>
                        </div>
                      );
                    })()}
                  </>
                );
              })()}
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Btn label="Annuler" onClick={onClose} color={C.gray} outline/>
            <Btn label={form.side==="BUY"?"Acheter":"Vendre"} onClick={submit} color={form.side==="BUY"?C.green:C.red} snd="txn"/>
          </div>
        </>
      ) : mode==="depot" ? (
        <>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            <div style={{gridColumn:"1/-1"}}><FI label="Date" type="date" value={depot.date} onChange={v=>setDepot({...depot,date:v})}/></div>
            <div style={{gridColumn:"1/-1"}}>
              <div style={{display:"flex",gap:6,background:C.bg2,borderRadius:8,padding:3}}>
                {[["depot","⬇ Dépôt"],["retrait","⬆ Retrait"]].map(([k,l])=>(
                  <button key={k} onClick={()=>setDepot({...depot,type:k})} style={{
                    flex:1,padding:"7px 0",borderRadius:6,fontSize:12,fontWeight:700,
                    border:"none",cursor:"pointer",
                    background:depot.type===k?(k==="depot"?C.green:C.red):"transparent",
                    color:depot.type===k?"#fff":C.gray,
                  }}>{l}</button>
                ))}
              </div>
            </div>
            <FS label="Banque" value={depot.bank} onChange={v=>setDepot({...depot,bank:v})} options={["LCL","BCI","DeBlock"]}/>
            <FI label="Montant (€)" type="number" value={depot.montant} onChange={v=>setDepot({...depot,montant:v})} placeholder="1 000"/>
            <div style={{gridColumn:"1/-1"}}><FI label="Note" value={depot.note} onChange={v=>setDepot({...depot,note:v})} placeholder={depot.type==="depot"?"Virement salaire...":"Virement vers courtier..."}/></div>
          </div>
          {depot.montant&&parseFloat(depot.montant)>0&&(()=>{
            const isRetrait = depot.type==="retrait";
            const montant   = parseFloat(depot.montant||0);
            const delta     = isRetrait ? -montant : montant;
            const after     = (src.bank.breakdown[depot.bank]||0) + delta;
            const matelasAfter = src.bank.totalEUR + delta;
            const col       = isRetrait ? C.red : C.green;
            const sign      = isRetrait ? "-" : "+";
            return(
              <div style={{background:C.bg3,borderRadius:8,padding:"10px 12px",marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:12,color:C.gray}}>{isRetrait?"Retrait":"Dépôt"}</span>
                  <span style={{fontSize:14,fontWeight:600,color:col}}>{sign}€{fmt(montant)}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",paddingBottom:4,borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:11,color:C.gray}}>{depot.bank} après</span>
                  <span style={{fontSize:12,fontWeight:700,color:after<0?C.red:C.green}}>€{fmt(after)}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
                  <span style={{fontSize:11,color:C.gray}}>Cash Matelas total</span>
                  <span style={{fontSize:12,fontWeight:700,color:C.teal}}>€{fmt(matelasAfter)}</span>
                </div>
              </div>
            );
          })()}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Btn label="Annuler" onClick={onClose} color={C.gray} outline/>
            <Btn label={depot.type==="retrait"?"Confirmer retrait":"Confirmer dépôt"} onClick={()=>{
              if(!depot.montant||parseFloat(depot.montant)<=0) return;
              setConfirm(true);
            }} color={depot.type==="retrait"?C.red:C.teal}/>
          </div>

          {/* Écran de confirmation */}
          {confirm&&(()=>{
            const isRetrait = depot.type==="retrait";
            const montant   = parseFloat(depot.montant||0);
            const delta     = isRetrait ? -montant : montant;
            const after     = (src.bank.breakdown[depot.bank]||0) + delta;
            const matelasAfter = src.bank.totalEUR + delta;
            const col       = isRetrait ? C.red : C.green;
            return(
              <div style={{
                position:"fixed",inset:0,zIndex:600,
                background:"rgba(0,0,0,.75)",
                display:"flex",alignItems:"flex-end",justifyContent:"center",
              }} onClick={()=>setConfirm(false)}>
                <div onClick={e=>e.stopPropagation()} style={{
                  background:C.bg1,borderRadius:"20px 20px 0 0",
                  padding:"24px 20px 36px",
                  width:"100%",maxWidth:430,
                  border:`1px solid ${C.border}`,
                }}>
                  <div style={{textAlign:"center",marginBottom:20}}>
                    <div style={{fontSize:36,marginBottom:8}}>{isRetrait?"⬆":"⬇"}</div>
                    <div style={{fontSize:16,fontWeight:600,color:C.text}}>
                      Confirmer le {isRetrait?"retrait":"dépôt"}
                    </div>
                    <div style={{fontSize:13,color:C.text3,marginTop:4}}>{depot.bank}</div>
                  </div>

                  {/* Montant en grand */}
                  <div style={{
                    background:col+"15",border:`1px solid ${col}40`,
                    borderRadius:12,padding:"16px",textAlign:"center",marginBottom:16,
                  }}>
                    <div style={{fontSize:32,fontWeight:700,color:col,letterSpacing:-1}}>
                      {isRetrait?"-":"+"}€{fmt(montant)}
                    </div>
                    {depot.note&&<div style={{fontSize:11,color:C.text3,marginTop:4}}>{depot.note}</div>}
                    <div style={{fontSize:11,color:C.text3,marginTop:2}}>{depot.date}</div>
                  </div>

                  {/* Récap impact */}
                  <div style={{background:C.bg2,borderRadius:10,padding:"12px 14px",marginBottom:20}}>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0"}}>
                      <span style={{fontSize:12,color:C.text2}}>{depot.bank} avant</span>
                      <span style={{fontSize:12,color:C.text}}>€{fmt(src.bank.breakdown[depot.bank]||0)}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderTop:`1px solid ${C.border}`}}>
                      <span style={{fontSize:12,fontWeight:700,color:C.text2}}>{depot.bank} après</span>
                      <span style={{fontSize:13,fontWeight:600,color:after<0?C.red:C.green}}>€{fmt(after)}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderTop:`1px solid ${C.border}`}}>
                      <span style={{fontSize:12,color:C.text2}}>Cash Matelas total</span>
                      <span style={{fontSize:12,fontWeight:700,color:C.teal}}>€{fmt(matelasAfter)}</span>
                    </div>
                  </div>

                  {after<0&&(
                    <div style={{background:C.red+"15",border:`1px solid ${C.red}44`,borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:11,color:C.red,textAlign:"center"}}>
                      ⚠ Solde négatif après cette opération
                    </div>
                  )}

                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <Btn label="← Modifier" onClick={()=>setConfirm(false)} color={C.gray} outline/>
                    <Btn label={isRetrait?"✓ Retirer":"✓ Déposer"} onClick={()=>{setConfirm(false);submitDepot();}} color={col}/>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      ) : (
        <>
          {/* Formulaire Investir / Désinvestir (Phase 3 — aperçu, action en Phase 4) */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:6}}>
            <div style={{gridColumn:"1/-1"}}>
              <div style={{display:"flex",gap:6,background:C.bg2,borderRadius:8,padding:3,marginBottom:6}}>
                {[["IN","➕ Investir"],["OUT","➖ Désinvestir"]].map(([k,l])=>(
                  <button key={k} onClick={()=>setInvest({...invest,io:k})} style={{
                    flex:1,padding:"7px 0",borderRadius:6,fontSize:12,fontWeight:700,
                    border:"none",cursor:"pointer",
                    background:invest.io===k?(k==="IN"?C.green:C.red):"transparent",
                    color:invest.io===k?"#fff":C.gray,
                  }}>{l}</button>
                ))}
              </div>
            </div>
            <div><FS label="Investisseur" value={invest.holder} onChange={v=>setInvest({...invest,holder:v})} options={[...(holders&&holders.length?holders:["FLO","GB"]),"+ Nouveau"]}/></div>
            <div><FS label="Fonds" value={invest.fonds} onChange={v=>setInvest({...invest,fonds:v})} options={["CGIC","CGIS"]}/></div>
            {invest.holder==="+ Nouveau" && <div style={{gridColumn:"1/-1"}}><FI label="Nom du nouvel investisseur" value={invest.newHolder||""} onChange={v=>setInvest({...invest,newHolder:v.toUpperCase()})} placeholder="Initiales / nom"/></div>}
            <div style={{gridColumn:"1/-1"}}><FI label="Montant €" type="number" value={invest.montant} onChange={v=>setInvest({...invest,montant:v})} placeholder="0"/></div>
            <div style={{gridColumn:"1/-1"}}><FI label="Date" type="date" value={invest.date} onChange={v=>setInvest({...invest,date:v})}/></div>
            <div style={{gridColumn:"1/-1"}}><FS label={invest.io==="IN"?"Depuis (Cash Matelas)":"Vers (Cash Matelas)"} value={invest.bank} onChange={v=>setInvest({...invest,bank:v})} options={Object.keys((src.bank&&src.bank.breakdown)||{LCL:0,BCI:0,DeBlock:0})}/></div>
          </div>
          {(()=>{
            const coursEur=(invest.fonds==="CGIC"?(src.gdbC||0):(src.gdbS||0))*(src.usdEur||1);
            const montantNum=parseFloat(invest.montant)||0;
            const shares=coursEur>0?montantNum/coursEur:0;
            const isIn=invest.io==="IN";
            return(
              <div style={{background:C.bg2,borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:13}}>
                <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0"}}>
                  <span style={{color:C.text2}}>Cours {invest.fonds} du jour</span>
                  <b style={{color:C.text}}>€{coursEur.toFixed(4)}</b>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderTop:`1px solid ${C.border}`}}>
                  <span style={{color:C.text2}}>Parts {isIn?"créées":"détruites"}</span>
                  <b style={{color:isIn?C.green:C.red}}>{isIn?"+":"-"}{fmtQty(shares)}</b>
                </div>
              </div>
            );
          })()}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Btn label="Annuler" onClick={onClose} color={C.gray} outline/>
            <Btn label={invest.io==="IN"?"Investir":"Désinvestir"} onClick={()=>{ const h=invest.holder==="+ Nouveau"?(invest.newHolder||"").trim():invest.holder; if((parseFloat(invest.montant)||0)>0 && h) setConfirmInv(true); }} color={invest.io==="IN"?C.green:C.red}/>
          </div>

          {/* Écran de validation */}
          {confirmInv&&(()=>{
            const isIn=invest.io==="IN";
            const holderR=invest.holder==="+ Nouveau"?(invest.newHolder||"").trim().toUpperCase():invest.holder;
            const montant=parseFloat(invest.montant||0);
            const coursEur=(invest.fonds==="CGIC"?(src.gdbC||0):(src.gdbS||0))*(src.usdEur||1);
            const shares=coursEur>0?montant/coursEur:0;
            const col=isIn?C.green:C.red;
            return(
              <div style={{position:"fixed",inset:0,zIndex:600,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setConfirmInv(false)}>
                <div onClick={e=>e.stopPropagation()} style={{background:C.bg1,borderRadius:"20px 20px 0 0",padding:"24px 20px 36px",width:"100%",maxWidth:430,border:`1px solid ${C.border}`}}>
                  <div style={{textAlign:"center",marginBottom:20}}>
                    <div style={{fontSize:36,marginBottom:8}}>{isIn?"📈":"📉"}</div>
                    <div style={{fontSize:16,fontWeight:600,color:C.text}}>Confirmer {isIn?"l'investissement":"le désinvestissement"}</div>
                    <div style={{fontSize:13,color:C.text3,marginTop:4}}>{invest.fonds} · {holderR}</div>
                  </div>
                  <div style={{background:col+"15",border:`1px solid ${col}40`,borderRadius:12,padding:"16px",textAlign:"center",marginBottom:16}}>
                    <div style={{fontSize:32,fontWeight:700,color:col,letterSpacing:-1}}>{isIn?"+":"-"}{fmt(montant)}</div>
                    <div style={{fontSize:11,color:C.text3,marginTop:2}}>{invest.date}</div>
                  </div>
                  <div style={{background:C.bg2,borderRadius:10,padding:"12px 14px",marginBottom:16}}>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0"}}>
                      <span style={{fontSize:12,color:C.text2}}>Cours du jour</span>
                      <span style={{fontSize:12,color:C.text}}>€{coursEur.toFixed(4)}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderTop:`1px solid ${C.border}`}}>
                      <span style={{fontSize:12,fontWeight:700,color:C.text2}}>Parts {isIn?"créées":"détruites"}</span>
                      <span style={{fontSize:13,fontWeight:600,color:col}}>{isIn?"+":"-"}{fmtQty(shares)}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderTop:`1px solid ${C.border}`}}>
                      <span style={{fontSize:12,color:C.text2}}>{isIn?"Depuis":"Vers"} (Cash Matelas)</span>
                      <span style={{fontSize:12,fontWeight:700,color:C.teal}}>{invest.bank}</span>
                    </div>
                  </div>
                  <div style={{background:C.btc+"15",border:`1px solid ${C.btc}44`,borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:11,color:C.text3,textAlign:"center"}}>
                    {holderR===INV_OWNER ? ((isIn?"Débit":"Crédit")+" "+invest.bank+" → "+(isIn?"création":"destruction")+" de parts · cours inchangé") : ("Apport externe de "+holderR+" → fonds brut (sans Cash Matelas)")}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <Btn label="← Modifier" onClick={()=>setConfirmInv(false)} color={C.gray} outline/>
                    <Btn label={isIn?"✓ Investir":"✓ Désinvestir"} onClick={()=>{ onInvestApplied&&onInvestApplied({holder:holderR,io:invest.io,fonds:invest.fonds,montant:montant,date:invest.date,bank:invest.bank}); setConfirmInv(false); onClose(); }} color={col}/>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}
        </>
      )}
    </Modal>
  );
}

function SnapshotModal({onSave, onClose, EFF}){
  const src = EFF || CURRENT;  // use live prices if refreshed

  /* Dérivation automatique de toutes les colonnes Chart */
  const derive = (s) => {
    const usdEur = s.usdEur;
    const cryptoEUR  = Math.round(s.crypto.total * usdEur);
    const actionsEUR = Math.round(s.stocks.items.filter(x=>x.cat!=="Cash Matelas").reduce((sum,x)=>sum+(x.val||0),0) * usdEur);
    const stableEUR  = Math.round((s.stocks.items.filter(x=>x.cat==="Cash").reduce((sum,x)=>sum+(x.val||0),0)) * usdEur);
    const banqueEUR  = s.bank.totalEUR;
    const immoEUR    = 167000;  // fixe — bien immobilier
    const totalHorsImmo = cryptoEUR + actionsEUR + banqueEUR; // total portefeuille hors immo
    const totalEUR   = totalHorsImmo; // c'est ce qu'on inscrit dans DD col "Total EUR"
    const btcItem    = s.crypto.items[0];
    const btcPrice   = btcItem.live;

    // P&L réel = valeur portefeuille crypto € - capital investi converti en €
    const investiEUR = Math.round(94064 * usdEur);  // col E en €
    const pnlReel    = cryptoEUR - investiEUR;

    // CGIS cours en €/$ (depuis CURRENT hardcoded si pas live)
    const gdbsEUR = (src.gdbS||CURRENT.gdbS) * usdEur;
    const gdbsUSD = src.gdbS||CURRENT.gdbS;
    const gdbcUSD = src.gdbC||CURRENT.gdbC;

    // Stocks prices
    const sp500  = s.stocks.items.find(x=>x.t==="QQQ")?.live || 663.88;
    const nasdaq = s.stocks.items.find(x=>x.t==="QQQ")?.live || 663.88; // proxy
    const msci   = s.stocks.items.find(x=>x.t==="URTH")?.live || 199.92;
    // ETH : priorité au prix live fetchés, stockés dans EFF comme résultat du dernier refresh
    const ethPrice = src._ethLive || src._lastETH || null;

    // % allocations
    const pctCrypto  = totalEUR > 0 ? cryptoEUR / totalEUR : 0;
    const pctStable  = totalEUR > 0 ? stableEUR / totalEUR : 0;
    const pctBanque  = totalEUR > 0 ? banqueEUR / totalEUR : 0;
    const pctImmo    = 0; // immo non inclus dans le total portefeuille
    const pctActions = totalEUR > 0 ? actionsEUR / totalEUR : 0;

    return {
      // Core
      date:     today(),
      // Col C-K
      wallet_crypto: cryptoEUR,
      pnl:          pnlReel,
      investi:      94064,
      cours_usd_eur: parseFloat(usdEur.toFixed(6)),
      crypto_eur:   cryptoEUR,
      stable_eur:   stableEUR,
      banque_eur:   banqueEUR,
      immo_eur:     immoEUR,
      total_eur:    totalEUR,
      // Col L-O
      pct_crypto:   pctCrypto,
      pct_stable:   pctStable,
      pct_banque:   pctBanque,
      pct_immo:     pctImmo,
      // Col P-R (CGIS)
      nb_actions_gdbs: CURRENT.gdbS ? Math.round(CURRENT.totalUSD / CURRENT.gdbS) : 0,
      cours_gdbs_usd: gdbsUSD,
      var_gdbs:     0,
      // Col S-Y (cryptos individuelles)
      eth:  ethPrice,
      pct_eth: 0,
      sol:  86.15,
      doge: 0.098196,
      btc:  btcPrice,
      pct_btc: 0,
      tao:  247.48,
      // Col Z-AE (indices)
      sp500:    sp500,
      pct_sp500:   0,
      nasdaq:   nasdaq,
      pct_nasdaq:  0,
      msci:     msci,
      pct_msci: 0,
      // Col AF-AN (CGIC / GDB.S détail)
      gdbc_usd:     gdbcUSD,
      var_gdbc:     0,
      total_actions_eur: actionsEUR,
      pct_actions:  pctActions,
      investi_gdbs_eur: CURRENT.gdbS * CURRENT.stocks.items.filter(x=>x.cat!=="Cash").length * 1000,
      nb_actions_gdbs2: 11942,
      gdbs_eur:     gdbsEUR,
      gdbs_usd:     gdbsUSD,
      var_gdbs2:    0,
      // Col AO
      total_hors_immo: totalHorsImmo,
    };
  };

  const[notes, setNotes] = useState("");
  const[dateInput, setDateInput] = useState(today());
  const[saved, setSaved] = useState(false);

  const preview = derive(src);

  const submit = () => {
    // Build the DD-compatible snapshot object (same fields as CHART_MONTHLY)
    const snap = {
      d: dateInput,
      portfolioDate: dateInput,            // date explicite des données portefeuille
      w: preview.wallet_crypto,            // col C
      t: preview.total_eur,               // col K
      b: preview.btc,                     // col W
      gs: preview.gdbs_usd,               // col AM
      // Extended fields (toutes les colonnes Chart)
      pnl:    preview.pnl,               // col D
      inv:    preview.investi,            // col E
      eur:    preview.cours_usd_eur,      // col F
      cg:     preview.crypto_eur,         // col G
      cs:     preview.stable_eur,         // col H
      cb:     preview.banque_eur,         // col I
      ci:     preview.immo_eur,           // col J
      pcc:    preview.pct_crypto,         // col L
      pcs:    preview.pct_stable,         // col M
      pcb:    preview.pct_banque,         // col N
      pci:    preview.pct_immo,           // col O
      gdbs:   preview.cours_gdbs_usd,     // col Q
      eth:    preview.eth,               // col S
      sol:    preview.sol,               // col U
      doge:   preview.doge,              // col V
      tao:    preview.tao,               // col Y
      sp500:  preview.sp500,             // col Z
      nq:     preview.nasdaq,            // col AB
      msci:   preview.msci,             // col AD
      gc:     preview.gdbc_usd,          // col AF
      act:    preview.total_actions_eur, // col AH
      pca:    preview.pct_actions,       // col AI
      gdbs_eur: preview.gdbs_eur,        // col AL
      ao:     preview.total_hors_immo,   // col AO
      notes,
      // ── Détail complet du portfolio au moment du snapshot ──────────────
      _portfolio: {
        date: dateInput,
        totalUSD: Math.round(src.crypto.items.reduce((s,x)=>s+x.val,0) + src.stocks.items.reduce((s,x)=>s+x.val,0) + Math.round(src.bank.totalEUR*(src.eurUsd||1.173))),
        totalEUR: src.totalEUR,
        usdEur: preview.cours_usd_eur || src.usdEur,
        crypto: {
          items: src.crypto.items.map(x=>({
            t:x.t, qty:x.qty, pa:x.pa, live:x.live, val:x.val, pnl:x.pnl, pct:x.pct,
          })),
        },
        stocks: {
          items: src.stocks.items.map(x=>({
            t:x.t, cat:x.cat, qty:x.qty, pa:x.pa, live:x.live, val:x.val, pnl:x.pnl, pct:x.pct,
          })),
        },
        bank: {
          totalEUR: src.bank.totalEUR,
          breakdown: {...src.bank.breakdown},
        },
        gdbC: src.gdbC || CURRENT.gdbC,
        gdbS: src.gdbS || CURRENT.gdbS,
        _ethLive: src._ethLive || null,  // prix ETH live du dernier refresh
      },
    };
    onSave(snap);
    onClose(); // fermer le modal immédiatement, le panneau snapResult prend le relais
  };

  return(
    <Modal title="📸 Snapshot journalier" onClose={onClose}>
      {saved ? (
        <div style={{padding:"8px 0"}}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:36,marginBottom:8}}>✅</div>
            <div style={{fontSize:16,fontWeight:600,color:C.green}}>Snapshot enregistré</div>
            <div style={{fontSize:12,color:C.gray,marginTop:3}}>{saved.d}</div>
          </div>

          {/* ── Base locale : ce qui a été écrit ── */}
          <div style={{background:C.bg2,borderRadius:12,padding:"12px 14px",marginBottom:12}}>
            <div style={{fontSize:10,color:C.gray,fontWeight:600,textTransform:"uppercase",letterSpacing:.5,marginBottom:10}}>📱 Base locale mise à jour</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>

              {/* DD */}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                <span style={{color:C.text2}}>📈 DD (historique quotidien)</span>
                <span style={{color:C.green,fontWeight:700}}>✓ {saved.d}</span>
              </div>

              {/* Patrimoine */}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,borderTop:`1px solid ${C.border}`,paddingTop:6}}>
                <span style={{color:C.text2}}>💼 Patrimoine</span>
                <span style={{color:C.btc,fontWeight:700}}>
                  ${fmt(saved.ao_usd||0)} · €{fmt(saved.ao||0)}
                </span>
              </div>

              {/* BTC */}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                <span style={{color:C.text2}}>₿ Bitcoin</span>
                <span style={{color:C.btc,fontWeight:700}}>${fmt(Math.round(saved.btc_price||0))}</span>
              </div>

              {/* CGIC / CGIS */}
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                <span style={{color:C.text2}}>CGIC / CGIS</span>
                <span style={{color:C.text2,fontWeight:700}}>
                  <span style={{color:C.orange||C.btc}}>${(saved.gc||0).toFixed(2)}</span>
                  {" / "}
                  <span style={{color:C.blue}}>${(saved.gdbs||0).toFixed(2)}</span>
                </span>
              </div>

              {/* Positions */}
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:6}}>
                <div style={{fontSize:10,color:C.gray,marginBottom:5}}>
                  📦 {(saved._portfolio?.stocks?.items||[]).length} positions enregistrées
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {(saved._portfolio?.stocks?.items||[]).map((x,i)=>(
                    <div key={i} style={{background:C.bg3,borderRadius:5,padding:"2px 7px",fontSize:9,color:C.text2,fontWeight:600}}>
                      {x.t} <span style={{color:(x.pnl||0)>=0?C.green:C.red}}>{(x.pnl||0)>=0?"+":""}{fmtK(Math.abs(x.pnl||0))}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Banque */}
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:6,display:"flex",gap:10,flexWrap:"wrap"}}>
                <span style={{fontSize:10,color:C.gray}}>🏦 Banque :</span>
                {Object.entries(saved._portfolio?.bank?.breakdown||{}).map(([k,v])=>(
                  <span key={k} style={{fontSize:10,color:C.text2}}>
                    {k} <span style={{color:C.teal,fontWeight:700}}>€{fmt(Math.round(v))}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <Btn label="Fermer" onClick={onClose} color={C.green}/>
        </div>
      ) : (
        <>
          {/* Info source */}
          <div style={{background:EFF?C.green+"11":C.btc+"11",borderRadius:10,padding:10,marginBottom:14,
            border:`1px solid ${EFF?C.green:C.btc}44`,display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontSize:16}}>{EFF?"🟢":"🟡"}</div>
            <div>
              <div style={{fontSize:11,color:EFF?C.green:C.btc,fontWeight:600}}>
                {EFF?"Prix live (refresh effectué)":"Prix statiques (pas de refresh)"}
              </div>
              <div style={{fontSize:10,color:C.gray}}>
                {EFF?"Les valeurs ci-dessous reflètent les derniers prix actualisés."
                    :"Appuie sur ⟳ pour actualiser avant de faire le snapshot."}
              </div>
            </div>
          </div>

          {/* Date + Notes (seuls champs manuels — P&L auto-calculé) */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            <FI label="Date du snapshot" type="date" value={dateInput} onChange={setDateInput}/>
            <div style={{display:"flex",flexDirection:"column",justifyContent:"flex-end",paddingBottom:13}}>
              <div style={{fontSize:9,color:C.gray,marginBottom:4}}>P&L réel € (col D) — auto</div>
              <div style={{
                background:C.bg3,borderRadius:8,padding:"10px 12px",
                fontSize:13,fontWeight:600,
                color:preview.pnl>=0?C.green:C.red,
              }}>
                {preview.pnl>=0?"+":""}{Math.round(preview.pnl).toLocaleString("fr-FR")} €
              </div>
            </div>
            <div style={{gridColumn:"1/-1"}}>
              <FI label="Notes (optionnel)" value={notes} onChange={setNotes} placeholder="Clôture avr 2026, achat BTC..."/>
            </div>
          </div>

          {/* Preview automatique — 41 colonnes */}
          <div style={{background:C.bg2,borderRadius:10,padding:"10px 12px",marginBottom:14,border:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,color:C.gray,fontWeight:600,marginBottom:10,textTransform:"uppercase",letterSpacing:.5}}>
              Aperçu — 41 colonnes Chart (auto-calculées)
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
              {[
                ["Wallet Crypto", "€"+Math.round(preview.wallet_crypto).toLocaleString("fr-FR"), C.btc],
                ["Total €",       "€"+Math.round(preview.total_eur).toLocaleString("fr-FR"), C.blue],
                ["Total hors immo","€"+Math.round(preview.total_hors_immo).toLocaleString("fr-FR"), C.blue],
                ["BTC",           "$"+Math.round(preview.btc).toLocaleString("fr-FR"), C.gold],
                ["Crypto €",      "€"+Math.round(preview.crypto_eur).toLocaleString("fr-FR"), C.btc],
                ["Actions €",     "€"+Math.round(preview.total_actions_eur).toLocaleString("fr-FR"), C.blue],
                ["Banque €",      "€"+Math.round(preview.banque_eur).toLocaleString("fr-FR"), C.green],
                ["Immo €",        "€"+Math.round(preview.immo_eur).toLocaleString("fr-FR"), C.gray],
                ["CGIC $",       "$"+preview.gdbc_usd.toFixed(2), C.orange],
                ["CGIS $",       "$"+preview.gdbs_usd.toFixed(2), C.blue],
                ["$/€",           preview.cours_usd_eur.toFixed(4), C.gray],
                ["% Crypto",      (preview.pct_crypto*100).toFixed(1)+"%", C.btc],
                ["% Actions",     (preview.pct_actions*100).toFixed(1)+"%", C.blue],
                ["P&L auto",      (preview.pnl>=0?"+":"")+Math.round(preview.pnl).toLocaleString("fr-FR")+"€", preview.pnl>=0?C.green:C.red],
              ].map(([l,v,c],i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:9,color:C.gray}}>{l}</span>
                  <span style={{fontSize:10,fontWeight:700,color:c}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Btn label="Annuler" onClick={onClose} color={C.gray} outline/>
            <Btn label="📸 Enregistrer" onClick={submit} color={C.btc}/>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════
   ROOT APP
═══════════════════════════════════════════════════════════ */
const TABS=["Home","Portfolio","Stats","JCGI","Data","History","Tracking"];
const ICONS=["◎","◑","▲","◈","⬡","♛","◉"];
const NAV_ICONS=["home","pie","chart","gem","grid","list","search"];

/* ── Global API keys (from Power Query in Excel) ── */

/* ═══════════════════════════════════════════════════════════
   PAGE DATA — Explorateur des bases de données
═══════════════════════════════════════════════════════════ */

function CloudKeyList({data, onRefresh}){
  var sel_state = useState(null);
  var selectedKey = sel_state[0]; var setSelectedKey = sel_state[1];
  var search_state = useState("");
  var search = search_state[0]; var setSearch = search_state[1];
  var deleting_state = useState(null);
  var deleting = deleting_state[0]; var setDeleting = deleting_state[1];
  var delMsg_state = useState(null);
  var delMsg = delMsg_state[0]; var setDelMsg = delMsg_state[1];
  var confirmAll_state = useState(false);
  var confirmAll = confirmAll_state[0]; var setConfirmAll = confirmAll_state[1];

  var CLOUD_KEYS = [
    {key:"cgi_snapshots", label:"Snapshots journaliers (objets)"},
    {key:"cgi_txns",      label:"Transactions"},
    {key:"cgi_dd",        label:"DD (historique quotidien)"},
    {key:"cgi_gdbs",      label:"CGIS/CGIC · Cours journaliers"},
    {key:"cgi_gc",        label:"CGIC · Historique cours"},
    {key:"cgi_gsb",       label:"CGIS · Base 100 (jan 2026)"},
    {key:"cgi_cm",        label:"CRYPTO_MONTHLY"},
    {key:"cgi_sm",        label:"STOCKS_MONTHLY"},
    {key:"cgi_tm",        label:"TOTAL_MONTHLY"},
    {key:"cgi_portfolio", label:"Portfolio (positions)"},
    {key:"cgi_crypto",    label:"Crypto (positions)"},
    {key:"cgi_stocks",    label:"Stocks (positions)"},
    {key:"cgi_bank",      label:"Banque (cash matelas)"},
    {key:"cgi_inv",       label:"Investissements (parts fonds)", cols:["Date","Fonds","Investisseur","Sens","Parts","Cours €","Montant €"]},
    {key:"cgi_futures",   label:"Futures (trades clotures)"},
    {key:"cgi_ibkr_annex", label:"IBKR annexe (div./interets/taxes)"},
    {key:"cgi_yfmap",     label:"YF_MAP (tickers Yahoo)"},
    {key:"cgi_icons",     label:"Icônes personnalisées"},
    {key:"cgi_bench",     label:"BENCH_IDX (indices BTC/ETH/SP500...)", cols:["Date","BTC $","ETH $","S&P 500","Nasdaq","MSCI World"]},
  ];

  // v23.17 — rendu lisible des valeurs KV (évite "[object Object]" pour les tableaux/objets)
  function fmtKvVal(v){
    if(v==null) return "";
    if(Array.isArray(v)){
      var preview=v.slice(0,6).map(function(x){
        if(x && typeof x==="object") return x.t||x.d||x.date||JSON.stringify(x).slice(0,18);
        return String(x);
      }).join(", ");
      return v.length+" élt(s): "+preview+(v.length>6?"…":"");
    }
    if(typeof v==="object") return JSON.stringify(v).slice(0,120);
    return String(v);
  }

  function doDelete(keys, all) {
    setDeleting(all ? "all" : keys[0]);
    setDelMsg(null);
    var body = all ? JSON.stringify({all:true}) : JSON.stringify({keys:keys});
    fetch(CF_WORKER_URL+"/delete", {
      method:"POST",
      headers:{"Content-Type":"application/json","X-Auth-Key":CF_AUTH_KEY},
      body: body,
    })
      .then(function(r){ return r.json(); })
      .then(function(d){
        setDeleting(null);
        setConfirmAll(false);
        if(d.ok) {
          setDelMsg({ok:true, msg:"Supprime : "+d.deleted.join(", ")});
          if(onRefresh) onRefresh();
        } else {
          setDelMsg({ok:false, msg:"Erreur : "+(d.errors||[d.error]).join(", ")});
        }
      })
      .catch(function(e){ setDeleting(null); setDelMsg({ok:false, msg:e.message}); });
  }

  // ── Vue detail clé ───────────────────────────────────────────────────────
  if(selectedKey){
    var val   = data[selectedKey];
    var meta  = CLOUD_KEYS.find(function(k){ return k.key===selectedKey; });
    var label = meta ? meta.label : selectedKey;

    var rows = []; var headers = [];
    if(Array.isArray(val)){
      if(val.length>0){
        var sorted = val.slice().sort(function(a,b){
          var da = Array.isArray(a)?a[0]:(a.d||a.date||"");
          var db = Array.isArray(b)?b[0]:(b.d||b.date||"");
          return db.localeCompare(da); // décroissant
        });
        if(Array.isArray(sorted[0])){ headers=meta&&meta.cols ? meta.cols : sorted[0].map(function(_,i){return "Col "+(i+1);}); rows=sorted; }
        else if(typeof sorted[0]==="object"){ headers=Object.keys(sorted[0]); rows=sorted.map(function(r){return headers.map(function(h){return fmtKvVal(r[h]);}); }); }
      }
    } else if(val && typeof val==="object"){
      var entries=Object.entries(val);
      headers=["Clé","Valeur"]; rows=entries.map(function(e){return[e[0], fmtKvVal(e[1])];});
    }
    var filtered = search ? rows.filter(function(r){return r.some(function(v){return String(v||"").toLowerCase().indexOf(search.toLowerCase())>=0;});}) : rows;

    return(
      <div>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
          <button onClick={function(){setSelectedKey(null);setSearch("");}} style={{background:C.bg2,border:"1px solid "+C.border,borderRadius:8,padding:"6px 12px",color:C.text,fontSize:12,cursor:"pointer",fontWeight:700}}>← Retour</button>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:700,color:C.teal}}>{label}</div>
            <div style={{fontSize:9,color:C.gray,fontFamily:C.font}}>{"kv/"+selectedKey+" — "+(Array.isArray(val)?val.length+" lignes":Object.keys(val||{}).length+" cles")}</div>
          </div>
          <button onClick={function(){doDelete([selectedKey],false);}}
            disabled={deleting===selectedKey}
            style={{background:C.red+"22",border:"1px solid "+C.red+"66",borderRadius:8,padding:"6px 10px",color:C.red,fontSize:11,fontWeight:700,cursor:"pointer"}}>
            {deleting===selectedKey?"...":"Effacer"}
          </button>
        </div>
        {delMsg&&<div style={{background:delMsg.ok?C.green+"15":C.red+"15",border:"1px solid "+(delMsg.ok?C.green:C.red)+"44",borderRadius:8,padding:"8px",fontSize:10,color:delMsg.ok?C.green:C.red,marginBottom:10}}>{delMsg.msg}</div>}
        <input value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="Filtrer..."
          style={{width:"100%",background:C.bg2,border:"1px solid "+C.border,borderRadius:8,padding:"7px 10px",color:C.text,fontSize:16,marginBottom:10,outline:"none"}}/>
        {rows.length===0
          ? <div style={{textAlign:"center",padding:"20px",color:C.gray,fontSize:12}}>Vide</div>
          : <div style={{overflowX:"auto",borderRadius:10,border:"1px solid "+C.border}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                <thead><tr style={{background:C.bg3}}>
                  {headers.map(function(h,i){return(<th key={i} style={{padding:"5px 7px",textAlign:"left",color:C.gray,fontWeight:700,borderBottom:"1px solid "+C.border,whiteSpace:"nowrap"}}>{h}</th>);})}
                </tr></thead>
                <tbody>
                  {filtered.slice(0,100).map(function(row,ri){return(
                    <tr key={ri} style={{borderBottom:"1px solid "+C.border+"44",background:ri%2===0?"transparent":C.bg2+"44"}}>
                      {row.map(function(cell,ci){return(<td key={ci} style={{padding:"4px 7px",color:ci===0?C.teal:C.text,fontFamily:C.font,fontSize:10,whiteSpace:"nowrap",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis"}}>{cell}</td>);})}
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
        }
        {filtered.length>100&&<div style={{fontSize:10,color:C.gray,textAlign:"center",marginTop:6}}>100 premiers sur {filtered.length}</div>}
      </div>
    );
  }

  // ── Liste des clés ───────────────────────────────────────────────────────
  return(
    <div>
      {/* Bouton Tout effacer */}
      {!confirmAll ? (
        <button onClick={function(){setConfirmAll(true);}} style={{
          width:"100%",marginBottom:12,padding:"9px 0",borderRadius:10,
          background:C.red+"15",border:"1px solid "+C.red+"44",
          color:C.red,fontSize:12,fontWeight:700,cursor:"pointer",
        }}>Effacer toutes les bases Cloudflare</button>
      ) : (
        <div style={{background:C.red+"15",border:"1px solid "+C.red+"44",borderRadius:10,padding:"12px",marginBottom:12}}>
          <div style={{fontSize:12,color:C.red,fontWeight:700,marginBottom:8}}>Confirmer la suppression de TOUTES les bases ?</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={function(){doDelete(null,true);}} disabled={deleting==="all"} style={{flex:1,padding:"8px 0",borderRadius:8,background:C.red,border:"none",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {deleting==="all"?"Suppression...":"Confirmer"}
            </button>
            <button onClick={function(){setConfirmAll(false);}} style={{flex:1,padding:"8px 0",borderRadius:8,background:C.bg2,border:"1px solid "+C.border,color:C.gray,fontSize:12,cursor:"pointer"}}>Annuler</button>
          </div>
        </div>
      )}
      {delMsg&&<div style={{background:delMsg.ok?C.green+"15":C.red+"15",border:"1px solid "+(delMsg.ok?C.green:C.red)+"44",borderRadius:8,padding:"8px",fontSize:10,color:delMsg.ok?C.green:C.red,marginBottom:10}}>{delMsg.msg}</div>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {CLOUD_KEYS.map(function(item){
          var val = data[item.key];
          var count = Array.isArray(val) ? val.length : (val && typeof val==="object") ? Object.keys(val).length : 0;
          var last = null;
          if(Array.isArray(val) && val.length>0){
            // Trouver la date max (la plus récente) pour l'aperçu
            var dates = val.map(function(r){ return Array.isArray(r)?r[0]:(r.d||r.date||null); }).filter(Boolean);
            last = dates.length>0 ? dates.sort().reverse()[0] : null;
          }
          var empty = !val || (Array.isArray(val) && val.length===0);
          return(
            <div key={item.key} style={{background:C.bg2,borderRadius:10,padding:"10px 12px",border:"1px solid "+(empty?C.border:C.teal+"44"),display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
              <div onClick={function(){if(!empty){setSelectedKey(item.key);setSearch("");setDelMsg(null);}}}
                style={{flex:1,cursor:empty?"default":"pointer",opacity:empty?0.5:1}}>
                <div style={{fontSize:11,fontWeight:700,color:empty?C.gray:C.text}}>{item.label}</div>
                <div style={{fontSize:9,color:C.gray,fontFamily:C.font,marginTop:2}}>{"kv/"+item.key}</div>
              </div>
              <div style={{textAlign:"right",display:"flex",alignItems:"center",gap:8}}>
                {empty ? <span style={{fontSize:10,color:C.gray}}>Vide</span>
                  : <div>
                      <div style={{fontSize:11,fontWeight:700,color:C.teal}}>{count} entrees</div>
                      {last&&<div style={{fontSize:9,color:C.gray}}>{"--> "+last}</div>}
                    </div>
                }
                {!empty&&<span style={{fontSize:14,color:C.teal,cursor:"pointer"}} onClick={function(){if(!empty){setSelectedKey(item.key);setSearch("");setDelMsg(null);}}}>›</span>}
                <button onClick={function(){doDelete([item.key],false);}} disabled={deleting===item.key}
                  style={{background:C.red+"15",border:"1px solid "+C.red+"44",borderRadius:6,padding:"4px 8px",color:C.red,fontSize:10,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                  {deleting===item.key?"...":"✕"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// v26.02 Lot C — reconstruction des trades clotures (round-trip par actif, cout moyen).
// Un cycle = de la 1ere acquisition (position 0->+) au retour a ~0. PnL = ventes - achats.
// v4.17 — Positions ouvertes calculées depuis le journal de transactions
// Coût moyen pondéré : BUY ajoute qté+coût ; SELL réduit qté et coût au prorata du PRU.
function computeOpenPositions(txns){
  var byT={};
  (txns||[]).slice().sort(function(a,b){ return (a.date||"")<(b.date||"")?-1:1; }).forEach(function(t){
    if(!t||!t.ticker) return;
    var tk=t.ticker;
    var p=byT[tk]||(byT[tk]={qty:0,costUSD:0,cur:t.currency||"USD"});
    var q=+t.qty||0, v=Math.abs(+t.valueUSD || (q*(+t.price||0)) || 0);   // repli qty×price (ajustements IBKR #67)
    if(t.side==="BUY"){ p.qty+=q; p.costUSD+=v; }
    else { if(p.qty>1e-9){ var avg=p.costUSD/p.qty; p.costUSD-=avg*Math.min(q,p.qty); } p.qty-=q; }
  });
  return Object.keys(byT).map(function(tk){
    var p=byT[tk];
    return { ticker:tk, qty:Math.round(p.qty*1e6)/1e6, investedUSD:Math.max(0,p.costUSD), avgUSD:p.qty>1e-9?p.costUSD/p.qty:null, currency:p.cur };
  }).filter(function(p){ return p.qty>1e-6; }).sort(function(a,b){ return b.investedUSD-a.investedUSD; });
}

function computeClosedTrades(txns){
  var STABLE={USDT:1,USDC:1,UST:1,DAI:1,BUSD:1,TUSD:1,FDUSD:1};
  var EPS=1e-6;
  var byT={};
  (txns||[]).forEach(function(t){
    if(!t||!t.ticker||STABLE[t.ticker]) return;
    (byT[t.ticker]=byT[t.ticker]||[]).push(t);
  });
  var closed=[];
  Object.keys(byT).forEach(function(tk){
    var rows=byT[tk].slice().sort(function(a,b){
      if(a.date!==b.date) return a.date<b.date?-1:1;
      return (a.side==="BUY"?0:1)-(b.side==="BUY"?0:1);
    });
    var pos=0, cost=0, cyc=null;
    rows.forEach(function(t){
      var q=+t.qty||0, v=+t.valueUSD||0;
      if(t.side==="BUY"){
        if(pos<=EPS){ cyc={ticker:tk,src:t.src,entryDate:t.date,buyQty:0,buyVal:0,sellQty:0,sellVal:0,lastSell:null,nBuy:0,nSell:0,fills:[]}; }
        pos+=q; cost+=v; cyc.buyQty+=q; cyc.buyVal+=v; cyc.nBuy++; cyc.fills.push({date:t.date,side:"BUY",qty:q,price:+t.price||0,valueUSD:v,fee:(+t.fee||0)+(+t.commission||0)});
      } else {
        if(!cyc) return;
        cyc.sellQty+=q; cyc.sellVal+=v; cyc.lastSell=t.date; cyc.nSell++; cyc.fills.push({date:t.date,side:"SELL",qty:q,price:+t.price||0,valueUSD:v,fee:(+t.fee||0)+(+t.commission||0)});
        if(pos>EPS){ var avg=cost/pos; cost-=avg*Math.min(q,pos); }
        pos-=q;
        if(pos<=EPS*Math.max(1,cyc.buyQty)){
          var pnl=cyc.sellVal-cyc.buyVal, inv=cyc.buyVal;
          var dur=Math.round((new Date(cyc.lastSell)-new Date(cyc.entryDate))/864e5);
          closed.push({ticker:tk,src:cyc.src,entryDate:cyc.entryDate,exitDate:cyc.lastSell,
            durationDays:dur, qty:cyc.buyQty,
            entryPrice:cyc.buyQty?cyc.buyVal/cyc.buyQty:0, exitPrice:cyc.sellQty?cyc.sellVal/cyc.sellQty:0,
            investedUSD:inv, pnlUSD:pnl, pct:(inv?pnl/inv*100:null), nBuy:cyc.nBuy, nSell:cyc.nSell, fills:cyc.fills});
          pos=0; cost=0; cyc=null;
        }
      }
    });
  });
  return {closed:closed};
}

var INDEX_ETF={SPY:1,QQQ:1,DIA:1,IWM:1,VOO:1,VTI:1,GDX:1,GDXJ:1,XLE:1,XLF:1,XLK:1,XLV:1,XLI:1,OIH:1,PALL:1,PPLT:1,GLD:1,GLDM:1,SLV:1,USO:1,TLT:1,HYG:1,SOXX:1,SMH:1,ARKK:1,EEM:1,KWEB:1,XBI:1,IBB:1,PFF:1,SPXL:1,TQQQ:1,SQQQ:1,VXX:1,UVXY:1};
function assetClass(ticker, src, isFut){
  if(isFut || src==="crypto") return {label:"Crypto", color:C.btc};
  if(INDEX_ETF[ticker]) return {label:"Indices", color:(C.teal||"#14b8a6")};
  return {label:"Actions", color:C.blue};
}
// v26.04 — tag + markers tailles/tooltip + annexe
// v26.03 Lot F — modal detail d'un trade + courbe Yahoo avec points Buy(vert)/Sell(rouge).
function usdEurAt(date){
  // €/$ a la date (depuis DD col5), plus proche sinon
  if(!DD||!DD.length) return 0.92;
  var best=DD[0][5], bd=DD[0][0];
  for(var i=0;i<DD.length;i++){ if(DD[i][0]<=date){ best=DD[i][5]; bd=DD[i][0]; } else break; }
  return best||0.92;
}
function TradeDetailModal({trade, kind, onClose, liveIbkrAnnex}){
  const isFut = kind==="futures";
  const ticker = trade.ticker;
  const src = isFut ? "crypto" : trade.src;
  const dir = isFut ? trade.dir : null;
  const entryDate = isFut ? trade.entryDate : trade.entryDate;
  const exitDate  = isFut ? trade.exitDate  : trade.exitDate;
  const pnlUSD = trade.pnlUSD;
  const up = pnlUSD>=0;
  const eurRate = usdEurAt(exitDate);
  const pnlEUR = pnlUSD*eurRate;
  const [hist,setHist]=useState(null); // null=loading, []=erreur/vide
  const [err,setErr]=useState(false);
  const ySym = ySymFor(ticker, src);
  useEffect(function(){
    let alive=true; setHist(null); setErr(false);
    fetchYahooHist(ySym, entryDate, exitDate).then(function(pts){
      if(!alive) return;
      if(!pts||!pts.length){ setErr(true); setHist([]); } else setHist(pts);
    }).catch(function(){ if(alive){ setErr(true); setHist([]); } });
    return function(){ alive=false; };
  }, [ySym, entryDate, exitDate]);

  // fills -> markers
  const fills = isFut
    ? [{date:entryDate, side:(dir==="LONG"?"BUY":"SELL"), valueUSD:trade.notionalUSD, qty:""},
       {date:exitDate,  side:(dir==="LONG"?"SELL":"BUY"), valueUSD:trade.notionalUSD, qty:""}]
    : (trade.fills||[]);
  // Annexe IBKR reliee au trade (dividendes / frais dans la fenetre)
  var annexDivs=0, annexFees=0;
  if(src==="ibkr"){
    (liveIbkrAnnex||[]).forEach(function(a){
      if(a && a.ticker===ticker && a.date>=entryDate && a.date<=exitDate){
        if(/Dividend|Lieu/i.test(a.type)) annexDivs += (a.valueUSD||0);
        else annexFees += (a.valueUSD||0);
      }
    });
  }
  var tradeFees = (fills||[]).reduce(function(a,fl){ return a+(fl.fee||0); }, 0);
  let chartSeries=[], chartDates=[], markers=[];
  if(hist && hist.length){
    chartDates = hist.map(function(p){return p[0];});
    const closes = hist.map(function(p){return p[1];});
    chartSeries = [{vals:closes, color:C.blue, label:"Cours", area:true}];
    function nIdx(d){ for(var i=0;i<chartDates.length;i++){ if(chartDates[i]>=d) return i; } return chartDates.length-1; }
    const maxV = Math.max.apply(null, fills.map(function(fl){return fl.valueUSD||0;}).concat([1]));
    markers = fills.map(function(fl){
      const i=nIdx(fl.date);
      const val=fl.valueUSD||0;
      const r=3 + 5*Math.sqrt(Math.min(1, maxV?val/maxV:0));
      return {i:i, v:closes[i], color:(fl.side==="BUY"?C.green:C.red), r:r, side:fl.side,
        qtyTxt:(fl.qty!=null && fl.qty!=="" ? Number(fl.qty).toLocaleString("fr-FR",{maximumFractionDigits:4}) : ""),
        amtTxt:(val ? "$"+Math.round(val).toLocaleString("fr-FR") : "")};
    });
  }
  const fU = function(v){ return (v<0?"-$":"$")+Math.abs(Math.round(v)).toLocaleString("fr-FR"); };
  const fE = function(v){ return (v<0?"-":"")+Math.abs(Math.round(v)).toLocaleString("fr-FR")+" \u20ac"; };
  const typeLabel = isFut ? ("Futures "+dir) : (src==="ibkr"?"Action (spot)":"Crypto (spot)");
  const Info=function(props){ return (
    <div style={{background:C.bg2,borderRadius:10,padding:"9px 11px"}}>
      <div style={{fontSize:9,color:C.text3,textTransform:"uppercase",letterSpacing:1}}>{props.k}</div>
      <div style={{fontSize:14,fontWeight:600,color:props.c||C.text,marginTop:2}}>{props.v}</div>
    </div>
  );};

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:680,background:"rgba(0,0,0,.78)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div onClick={function(e){e.stopPropagation();}} style={{background:C.bg1,borderRadius:"20px 20px 0 0",padding:"20px 16px 30px",width:"100%",maxWidth:460,maxHeight:"90vh",overflowY:"auto",border:`1px solid ${C.border}`}}>
        {/* En-tete */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
          <div>
            <div style={{fontSize:20,fontWeight:700,color:C.text}}>{ticker}</div>
            <div style={{display:"flex",alignItems:"center",gap:7,marginTop:3}}>
              {(function(){var cl=assetClass(ticker,src,isFut);return <span style={{fontSize:9,fontWeight:600,padding:"2px 7px",borderRadius:5,background:cl.color+"22",color:cl.color}}>{cl.label}</span>;})()}
              <span style={{fontSize:11,fontWeight:700,color:isFut?(dir==="LONG"?C.green:C.red):C.text3}}>{typeLabel}{isFut?(" \u00b7 x"+trade.lev):""}</span>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:20,fontWeight:700,color:up?C.green:C.red}}>{(up?"+":"")+fU(pnlUSD)}</div>
            <div style={{fontSize:12,fontWeight:700,color:up?C.green:C.red}}>{(up?"+":"")+fE(pnlEUR)} {trade.pct!=null?("\u00b7 "+(up?"+":"")+trade.pct.toFixed(1)+"%"):""}</div>
          </div>
        </div>
        {/* Infos */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:14}}>
          <Info k="Entree" v={entryDate+" \u00b7 "+(trade.entryPrice||0).toFixed( (trade.entryPrice||0)<10?4:2 )}/>
          <Info k="Sortie" v={exitDate+" \u00b7 "+(trade.exitPrice||0).toFixed( (trade.exitPrice||0)<10?4:2 )}/>
          <Info k="Duree" v={trade.durationDays+" j"}/>
          {isFut
            ? <Info k="Notionnel / Marge" v={fU(trade.notionalUSD)+" / "+fU(trade.marginUSD)}/>
            : <Info k="Quantite" v={(trade.qty||0).toLocaleString("fr-FR",{maximumFractionDigits:6})}/>}
          {isFut
            ? <Info k="Funding / Frais" v={Math.round(trade.raw.fundingUSD)+" / "+Math.round(trade.raw.tradingFeesUSD)+" $"}/>
            : <Info k="Capital investi" v={fU(trade.investedUSD)}/>}
          <Info k={isFut?"Levier":"Operations"} v={isFut?("x"+trade.lev):(trade.nBuy+" achats / "+trade.nSell+" ventes")}/>
          {!isFut && src==="ibkr" && <Info k="Commissions" v={fU(Math.abs(tradeFees)+Math.abs(annexFees))}/>}
          {!isFut && src==="ibkr" && annexDivs>0 && <Info k="Dividendes recus" v={"+"+fU(annexDivs)} c={C.green}/>}
        </div>
        {/* Graphique Yahoo */}
        <div style={{background:C.bg2,borderRadius:12,padding:"12px 12px 8px"}}>
          <div style={{display:"flex",gap:16,marginBottom:6,paddingLeft:2,fontSize:11}}>
            <span style={{color:C.blue,fontWeight:700}}>Cours Yahoo</span>
            <span style={{color:C.green,fontWeight:700}}>\u25cf Buy</span>
            <span style={{color:C.red,fontWeight:700}}>\u25cf Sell</span>
          </div>
          {hist===null && <div style={{textAlign:"center",color:C.text3,fontSize:12,padding:40}}>Chargement du cours {ySym}\u2026</div>}
          {hist!==null && hist.length>0 && <LineChart series={chartSeries} dates={chartDates} h={180} unit={""} hideTF={true} defaultTF="ALL" markers={markers}/>}
          {hist!==null && hist.length===0 && <div style={{textAlign:"center",color:C.text3,fontSize:12,padding:30}}>Cours indisponible pour {ySym}{err?" (a mapper)":""}.</div>}
        </div>
        <div style={{marginTop:14}}><Btn label="Fermer" onClick={onClose} color={C.gray} outline full/></div>
      </div>
    </div>
  );
}
// ══════════════════════════════════════════════════════════════════════════════
// PAGE WATCHLIST — CGI v2.07
// Liste de suivi : tickers + thèses + alertes + prix live
// Stocké dans cgi_watchlist (KV + localStorage)
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// PAGE WATCHLIST v2 — CGI
// Suivi de marché : thèses structurées + scoring + alertes + news
// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// CGI v4.0 — BIBLIOTHÈQUE DE CONDITIONS + MOTEUR TECHNIQUE (validation via Yahoo)
// ══════════════════════════════════════════════════════════════════════════════
var WL_CONDLIB_KEY = 'cgi_condition_library'; // biblio "personnalisée" (localStorage dédié, hors gros conteneur)

// Unité de temps → interval Yahoo (4H = agrégé depuis le 1h)
var COND_TF_UNITS = [["D","Daily"],["W","Weekly"],["M","Monthly"],["4H","4 heures"]];
var COND_TF_INTERVAL = { "D":"1d", "W":"1wk", "M":"1mo", "4H":"1h" };
// Range Yahoo suffisant pour MM200/RSI/MACD selon l'unité
var COND_TF_RANGE = { "D":"2y", "W":"5y", "M":"max", "4H":"3mo" };
var COND_MM_PERIODS = [9,20,50,200];

// Templates techniques (kind:"price" → validables depuis les bougies)
//   param: "mm" | "rsi" | "level" | "unit" | "none" | "manual"
var COND_TECH_TEMPLATES = [
  { id:"mm",         label:"Moyenne mobile", param:"mm"     },
  { id:"rsi",        label:"RSI",            param:"rsi"    },
  { id:"ath",        label:"ATH / plus haut",param:"unit"   },
  { id:"support",    label:"Support",        param:"level"  },
  { id:"resistance", label:"Résistance",     param:"level"  },
  { id:"macd",       label:"MACD",           param:"unit"   },
  { id:"volume",     label:"Volume (spike)", param:"unit"   },
  { id:"divergence", label:"Divergence",     param:"manual" },
];
// Presets fondamentaux (kind:"news" → validables par l'IA depuis les news)
var COND_FOND_PRESETS = [
  "Earnings beat","Revenue growth","Guidance relevée","Catalyseur écosystème",
  "Insider buying","Nouveau contrat / partenariat","Programme de rachat d'actions",
  "Initiation analyste / objectif relevé","Lancement produit majeur",
];

// ── Maths indicateurs (fonctions pures) ──────────────────────────────────────
function cgiSMA(vals, period){
  if(!vals || vals.length<period) return null;
  var s=0; for(var i=vals.length-period;i<vals.length;i++) s+=vals[i]; return s/period;
}
function cgiEMASeries(vals, period){
  if(!vals || vals.length<period) return [];
  var k=2/(period+1), out=[], e=vals[0]; out.push(e);
  for(var i=1;i<vals.length;i++){ e=vals[i]*k+e*(1-k); out.push(e); }
  return out;
}
function cgiRSI(closes, period){
  period=period||14;
  if(!closes || closes.length<period+1) return null;
  var gains=0, losses=0;
  for(var i=closes.length-period;i<closes.length;i++){
    var d=closes[i]-closes[i-1]; if(d>=0) gains+=d; else losses-=d;
  }
  var avgG=gains/period, avgL=losses/period;
  if(avgL===0) return 100;
  var rs=avgG/avgL; return 100-(100/(1+rs));
}
function cgiMACD(closes){
  if(!closes || closes.length<35) return null;
  var e12=cgiEMASeries(closes,12), e26=cgiEMASeries(closes,26);
  var n=Math.min(e12.length,e26.length); if(n<2) return null;
  var macdLine=[];
  for(var i=0;i<n;i++){ macdLine.push(e12[e12.length-n+i]-e26[e26.length-n+i]); }
  var sig=cgiEMASeries(macdLine,9); if(sig.length<2) return null;
  var m=macdLine[macdLine.length-1], s=sig[sig.length-1];
  var mP=macdLine[macdLine.length-2], sP=sig[sig.length-2];
  return { macd:m, signal:s, crossUp:(mP<=sP && m>s), crossDown:(mP>=sP && m<s) };
}
// Agrège des bougies 1h en bougies 4h (best-effort)
function cgiAgg4h(candles){
  if(!candles || !candles.length) return [];
  var out=[]; 
  for(var i=0;i<candles.length;i+=4){
    var grp=candles.slice(i,i+4); if(!grp.length) continue;
    var o=grp[0].o, c=grp[grp.length-1].c, h=null, l=null, v=0;
    grp.forEach(function(k){
      if(k.h!=null) h=(h==null?k.h:Math.max(h,k.h));
      if(k.l!=null) l=(l==null?k.l:Math.min(l,k.l));
      if(k.v!=null) v+=k.v;
    });
    out.push({t:grp[grp.length-1].t,o:o,h:h,l:l,c:c,v:v});
  }
  return out;
}

// ── Génère le libellé d'une condition à partir de ses params ─────────────────
function cgiCondText(c){
  if(!c) return "";
  if(c.cat==="technique" && c.templateId){
    var p=c.params||{}, u=p.unit||"D";
    if(c.templateId==="mm"){
      return "MM"+(p.period||50)+" ("+u+") — prix "+(p.sens==="below"?"< ":"> ")+"MM";
    }
    if(c.templateId==="rsi"){
      return "RSI ("+u+") "+(p.sens==="above"?"> ":"< ")+(p.seuil!=null?p.seuil:(p.sens==="above"?70:30));
    }
    if(c.templateId==="ath")       return "ATH / plus haut ("+u+")";
    if(c.templateId==="support")    return "Support $"+(p.level!=null?p.level:"?")+" ("+u+")";
    if(c.templateId==="resistance") return "Cassure résistance $"+(p.level!=null?p.level:"?")+" ("+u+")";
    if(c.templateId==="macd")       return "MACD croisement haussier ("+u+")";
    if(c.templateId==="volume")     return "Spike volume ("+u+")";
    if(c.templateId==="divergence") return "Divergence ("+u+")";
  }
  return c.text||"";
}

// ── Évalue une condition technique contre les bougies fournies ───────────────
// seriesByUnit : { "D":[candles], "W":[...], ... }   candle = {t,o,h,l,c,v}
// retourne { ok:bool, detail:string } ou null si données insuffisantes (→ on ne touche pas)
function cgiEvalTechnical(c, seriesByUnit){
  if(!c || c.kind!=="price" || c.templateId==="divergence") return null;
  var p=c.params||{}, u=p.unit||"D";
  var candles=seriesByUnit[u];
  if(!candles || candles.length<5) return null;
  var closes=candles.map(function(k){return k.c;}).filter(function(v){return v!=null;});
  var last=closes[closes.length-1];
  if(last==null) return null;
  var fmt=function(v){ return (Math.round(v*100)/100).toLocaleString("fr-FR"); };

  if(c.templateId==="mm"){
    var period=p.period||50;
    var sma=cgiSMA(closes,period); if(sma==null) return null;
    var above=last>sma;
    var ok=(p.sens==="below")?!above:above;
    return { ok:ok, detail:"Prix "+fmt(last)+" "+(above?">":"<")+" MM"+period+" "+fmt(sma)+" ("+u+")" };
  }
  if(c.templateId==="rsi"){
    var rsi=cgiRSI(closes,p.period||14); if(rsi==null) return null;
    var seuil=(p.seuil!=null)?p.seuil:(p.sens==="above"?70:30);
    var ok=(p.sens==="above")?rsi>seuil:rsi<seuil;
    return { ok:ok, detail:"RSI "+fmt(rsi)+" "+(p.sens==="above"?">":"<")+" "+seuil+" ("+u+")" };
  }
  if(c.templateId==="ath"){
    var highs=candles.map(function(k){return k.h!=null?k.h:k.c;}).filter(function(v){return v!=null;});
    var maxH=Math.max.apply(null,highs);
    var pct=(maxH-last)/maxH*100;
    var ok=last>=maxH*0.99; // à 1% du plus haut de la fenêtre
    return { ok:ok, detail:"À "+fmt(pct)+"% du plus haut "+fmt(maxH)+" ("+u+")" };
  }
  if(c.templateId==="support"){
    if(p.level==null) return null;
    return { ok:last<=p.level, detail:"Prix "+fmt(last)+" vs support "+p.level+" ("+u+")" };
  }
  if(c.templateId==="resistance"){
    if(p.level==null) return null;
    return { ok:last>=p.level, detail:"Prix "+fmt(last)+" vs résistance "+p.level+" ("+u+")" };
  }
  if(c.templateId==="macd"){
    var m=cgiMACD(closes); if(m==null) return null;
    return { ok:m.crossUp, detail:(m.crossUp?"Croisement haussier":"Pas de croisement")+" MACD ("+u+")" };
  }
  if(c.templateId==="volume"){
    var vols=candles.map(function(k){return k.v;}).filter(function(v){return v!=null;});
    if(vols.length<21) return null;
    var avg=cgiSMA(vols.slice(0,-1),20); if(!avg) return null;
    var lastV=vols[vols.length-1];
    var ratio=lastV/avg;
    return { ok:ratio>=1.5, detail:"Volume x"+fmt(ratio)+" vs moyenne 20 ("+u+")" };
  }
  return null;
}

// ── Biblio perso : load/save (localStorage dédié) ────────────────────────────
function cgiCondLibLoad(){
  try{ var r=JSON.parse(localStorage.getItem(WL_CONDLIB_KEY)||'[]'); return Array.isArray(r)?r:[]; }
  catch(e){ return []; }
}
function cgiCondLibSave(lib){
  try{ localStorage.setItem(WL_CONDLIB_KEY,JSON.stringify(lib)); }
  catch(e){ console.warn('[condlib] save failed:',e.message); }
}
function cgiCondLibAdd(lib, text, cat){
  text=(text||"").trim(); if(!text) return lib;
  var exists=lib.some(function(x){return (x.text||"").toLowerCase()===text.toLowerCase();});
  if(exists) return lib;
  return lib.concat([{text:text,cat:cat||"perso"}]);
}

// ── Migration : normalise une condition legacy vers le modèle v4.0 ───────────
function cgiMigrateCond(c){
  if(!c || typeof c!=="object") return c;
  if(c.cat && c.kind) return c; // déjà v4
  return {
    id: c.id!=null ? c.id : Date.now()+Math.floor(Math.random()*1000),
    text: c.text||"",
    validated: !!c.validated,
    autoValidated: !!c.autoValidated,
    validatedBy: c.validatedBy||null,
    cat: "perso",
    kind: "news",
    templateId: null,
    params: null,
  };
}
function cgiMigrateEntryConds(e){
  if(!e || !Array.isArray(e.conditions)) return e;
  return { ...e, conditions: e.conditions.map(cgiMigrateCond) };
}

// ══════════════════════════════════════════════════════════════════════════════
// CGI v4.0 — LWChart : graphique chandeliers TradingView + zones + indicateurs
// ══════════════════════════════════════════════════════════════════════════════
var LW_TF = [["30m","30m","1mo",0],["1H","60m","3mo",0],["4H","60m","6mo",4],["12H","60m","1y",12],["J","1d","2y",0],["S","1wk","5y",0],["M","1mo","max",0]];
function lwResample(bars, hours){
  if(!hours||!bars.length) return bars;
  var span=hours*3600, buckets={}, order=[];
  bars.forEach(function(b){
    var key=Math.floor(b.time/span)*span;
    if(!buckets[key]){ buckets[key]={time:key,open:b.open,high:b.high,low:b.low,close:b.close}; order.push(key); }
    else{ var g=buckets[key]; if(b.high>g.high)g.high=b.high; if(b.low<g.low)g.low=b.low; g.close=b.close; }
  });
  return order.sort(function(a,b){return a-b;}).map(function(k){return buckets[k];});
}

// Helper : indicateurs clés depuis les bougies (réutilise le moteur P1)
function computeKeyIndicators(candles){
  if(!candles||candles.length<5) return [];
  var closes=candles.map(function(k){return k.c;}).filter(function(v){return v!=null;});
  var vols=candles.map(function(k){return k.v;}).filter(function(v){return v!=null;});
  var highs=candles.map(function(k){return k.h!=null?k.h:k.c;});
  var last=closes[closes.length-1];
  var out=[];
  var f=function(v){return v==null?"—":(Math.round(v*100)/100).toLocaleString("fr-FR");};
  var perf=function(n){ if(closes.length<n+1) return null; var p=closes[closes.length-1-n]; return p?((last-p)/p*100):null; };
  out.push({label:"Prix",value:f(last),tone:"neutral"});
  var p1=perf(1), p5=perf(5), p21=perf(21), p252=perf(252);
  if(p1!=null)   out.push({label:"Perf 1j",  value:(p1>=0?"+":"")+f(p1)+"%",  tone:p1>=0?"up":"down"});
  if(p5!=null)   out.push({label:"Perf 1sem",value:(p5>=0?"+":"")+f(p5)+"%",  tone:p5>=0?"up":"down"});
  if(p21!=null)  out.push({label:"Perf 1mois",value:(p21>=0?"+":"")+f(p21)+"%",tone:p21>=0?"up":"down"});
  if(p252!=null) out.push({label:"Perf 1an", value:(p252>=0?"+":"")+f(p252)+"%",tone:p252>=0?"up":"down"});
  [9,20,50,200].forEach(function(per){
    var sma=cgiSMA(closes,per); if(sma==null) return;
    var above=last>sma;
    out.push({label:"MM"+per,value:f(sma)+(above?" ↑":" ↓"),tone:above?"up":"down"});
  });
  var rsi=cgiRSI(closes,14);
  if(rsi!=null) out.push({label:"RSI 14",value:f(rsi),tone:rsi>=70?"down":(rsi<=30?"up":"neutral")});
  var macd=cgiMACD(closes);
  if(macd) out.push({label:"MACD",value:macd.crossUp?"Haussier":(macd.crossDown?"Baissier":"Neutre"),tone:macd.crossUp?"up":(macd.crossDown?"down":"neutral")});
  if(highs.length){ var maxH=Math.max.apply(null,highs); out.push({label:"ATH (fenêtre)",value:f(maxH)+" ("+f((maxH-last)/maxH*100)+"%)",tone:"neutral"}); }
  if(vols.length>=21){ var avg=cgiSMA(vols.slice(0,-1),20); if(avg){ var ratio=vols[vols.length-1]/avg; out.push({label:"Volume / moy20",value:"x"+f(ratio),tone:ratio>=1.5?"up":"neutral"}); } }
  return out;
}

function LWChart(props){
  var symbol=props.symbol;
  var height=props.height||280;
  var zones=props.zones||[];          // [{price, color, title}]
  var onPickPrice=props.onPickPrice;  // fn(price) si on veut piocher un niveau
  var pickActive=!!props.pickActive;
  var onCandles=props.onCandles;      // fn(candles) → remonte les bougies au parent (indicateurs)

  var tfState=useState(0); var tfIdx=tfState[0], setTfIdx=tfState[1];
  var loadingState=useState(true); var loading=loadingState[0], setLoading=loadingState[1];
  var errState=useState(null); var err=errState[0], setErr=errState[1];
  var fsState=useState(false); var fs=fsState[0], setFs=fsState[1];
  var maState=useState(false); var showMA=maState[0], setShowMA=maState[1];
  var maSelState=useState({9:false,20:true,50:true,100:false,200:true}); var maSel=maSelState[0], setMaSel=maSelState[1];
  var ichiState=useState(false); var showIchi=ichiState[0], setShowIchi=ichiState[1];
  var rsiState=useState(false); var showRSI=rsiState[0], setShowRSI=rsiState[1];
  var barsRef=useRef([]);
  var maSeriesRef=useRef([]);
  var ichiSeriesRef=useRef([]);
  var rsiSeriesRef=useRef(null);
  // Couche de dessin (trendlines + Fibonacci), persistée par symbole
  var drawModeState=useState(null); var drawMode=drawModeState[0], setDrawMode=drawModeState[1];
  var drawingsState=useState([]); var drawings=drawingsState[0], setDrawings=drawingsState[1];
  var pendingState=useState(null); var pending=pendingState[0], setPending=pendingState[1];
  var drawTickState=useState(0); var drawTick=drawTickState[0], setDrawTick=drawTickState[1];
  var selDrawState=useState(null); var selDraw=selDrawState[0], setSelDraw=selDrawState[1];

  var containerRef=useRef(null);
  var chartRef=useRef(null);
  var seriesRef=useRef(null);
  var lineRefs=useRef([]);
  var pickRef=useRef({active:false,cb:null});
  pickRef.current={active:pickActive,cb:onPickPrice};

  var C2=(typeof C!=="undefined")?C:{};
  var up=C2.green||"#22C55E", down=C2.red||"#EF4444", gridC=C2.border||"#222", txt=C2.text||"#DDD", bgc=C2.bg||"#07080D";

  // Création du graphique (une fois)
  useEffect(function(){
    if(!containerRef.current||!window.LightweightCharts) return;
    var chart=window.LightweightCharts.createChart(containerRef.current,{
      width:containerRef.current.clientWidth, height:height,
      layout:{ background:{color:"transparent"}, textColor:txt, fontSize:10 },
      grid:{ vertLines:{color:gridC+"55"}, horzLines:{color:gridC+"55"} },
      timeScale:{ borderColor:gridC, timeVisible:false },
      rightPriceScale:{ borderColor:gridC },
      crosshair:{ mode:0 },
      handleScale:true, handleScroll:true,
    });
    var series=chart.addCandlestickSeries({ upColor:up, downColor:down, borderUpColor:up, borderDownColor:down, wickUpColor:up, wickDownColor:down });
    chartRef.current=chart; seriesRef.current=series;
    var onClick=function(param){
      var pk=pickRef.current;
      if(!pk.active||!pk.cb||!param.point) return;
      var price=series.coordinateToPrice(param.point.y);
      if(price!=null) pk.cb(Math.round(price*100)/100);
    };
    chart.subscribeClick(onClick);
    var bump=function(){ setDrawTick(function(x){return (x+1)%1000000;}); };
    try{ chart.timeScale().subscribeVisibleTimeRangeChange(bump); }catch(e){}
    var onResize=function(){ if(containerRef.current){ chart.applyOptions({width:containerRef.current.clientWidth}); bump(); } };
    window.addEventListener("resize",onResize);
    return function(){ window.removeEventListener("resize",onResize); try{chart.remove();}catch(e){} chartRef.current=null; seriesRef.current=null; };
  },[]);

  // Chargement des bougies (à chaque TF)
  useEffect(function(){
    if(!symbol) return;
    var tf=LW_TF[tfIdx];
    setLoading(true); setErr(null);
    fetch(CF_WORKER_URL+"/yahoo-chart?symbol="+encodeURIComponent(symbol)+"&interval="+tf[1]+"&range="+tf[2]+"&no_logo=1",
      {headers:{"X-Auth-Key":CF_AUTH_KEY},signal:AbortSignal.timeout(15000)})
      .then(function(r){return r.json();})
      .then(function(d){
        var candles=Array.isArray(d.candles)?d.candles:[];
        if(!candles.length){ setErr("Pas de données"); setLoading(false); return; }
        if(seriesRef.current){
          var seen={};
          var bars=candles.filter(function(k){return k.c!=null&&k.t!=null;}).map(function(k){
            return { time:Math.floor(k.t/1000), open:k.o!=null?k.o:k.c, high:k.h!=null?k.h:k.c, low:k.l!=null?k.l:k.c, close:k.c };
          }).filter(function(b){ if(seen[b.time]) return false; seen[b.time]=1; return true; });
          if(tf[3]) bars=lwResample(bars,tf[3]);
          seriesRef.current.setData(bars);
          barsRef.current=bars;
          if(chartRef.current) chartRef.current.timeScale().fitContent();
        }
        if(onCandles) onCandles(candles);
        setLoading(false);
      })
      .catch(function(e){ setErr(e.message||"Erreur"); setLoading(false); });
  },[symbol,tfIdx]);

  // (Re)dessiner les lignes de zones
  useEffect(function(){
    var series=seriesRef.current; if(!series) return;
    (lineRefs.current||[]).forEach(function(pl){ try{series.removePriceLine(pl);}catch(e){} });
    lineRefs.current=[];
    (zones||[]).forEach(function(z){
      if(z.price==null||isNaN(z.price)) return;
      try{
        var pl=series.createPriceLine({ price:Number(z.price), color:z.color||"#888", lineWidth:2, lineStyle:z.dashed?2:0, axisLabelVisible:true, title:z.title||"" });
        lineRefs.current.push(pl);
      }catch(e){}
    });
  },[JSON.stringify(zones),loading]);

  // Indicateurs : moyennes mobiles, Ichimoku, RSI (séries natives)
  useEffect(function(){
    var chart=chartRef.current; var bars=barsRef.current; if(!chart||!bars||!bars.length) return;
    (maSeriesRef.current||[]).forEach(function(s){ try{chart.removeSeries(s);}catch(e){} });
    (ichiSeriesRef.current||[]).forEach(function(s){ try{chart.removeSeries(s);}catch(e){} });
    if(rsiSeriesRef.current){ try{chart.removeSeries(rsiSeriesRef.current);}catch(e){} rsiSeriesRef.current=null; }
    maSeriesRef.current=[]; ichiSeriesRef.current=[];
    var times=bars.map(function(b){return b.time;});
    var closes=bars.map(function(b){return b.close;});
    var highs=bars.map(function(b){return b.high;});
    var lows=bars.map(function(b){return b.low;});
    var sma=function(n){ var out=[]; for(var i=n-1;i<closes.length;i++){ var s=0; for(var j=i-n+1;j<=i;j++) s+=closes[j]; out.push({time:times[i],value:s/n}); } return out; };
    var addLine=function(color,data){ try{ var ls=chart.addLineSeries({color:color,lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false}); ls.setData(data); return ls; }catch(e){ return null; } };
    if(showMA){
      var MACOL={9:"#22C55E",20:"#3B82F6",50:"#F59E0B",100:"#A855F7",200:"#EF4444"};
      [9,20,50,100,200].forEach(function(n){ if(maSel[n]&&closes.length>=n){ var s=addLine(MACOL[n],sma(n)); if(s) maSeriesRef.current.push(s); } });
    }
    if(showIchi){
      var hl=function(n,i){ var hi=-Infinity,lo=Infinity; for(var j=Math.max(0,i-n+1);j<=i;j++){ if(highs[j]>hi)hi=highs[j]; if(lows[j]<lo)lo=lows[j]; } return (hi+lo)/2; };
      var tenkan=[],kijun=[],ssa=[],ssb=[];
      for(var i=0;i<closes.length;i++){
        if(i>=8) tenkan.push({time:times[i],value:hl(9,i)});
        if(i>=25) kijun.push({time:times[i],value:hl(26,i)});
        if(i>=25) ssa.push({time:times[i],value:(hl(9,i)+hl(26,i))/2});
        if(i>=51) ssb.push({time:times[i],value:hl(52,i)});
      }
      [["#06B6D4",tenkan],["#A855F7",kijun],["#22C55E",ssa],["#EF4444",ssb]].forEach(function(p){ if(p[1].length){ var s=addLine(p[0],p[1]); if(s) ichiSeriesRef.current.push(s); } });
    }
    if(showRSI){
      var period=14,rsiData=[];
      for(var i2=period;i2<closes.length;i2++){ var g=0,l=0; for(var j2=i2-period+1;j2<=i2;j2++){ var d=closes[j2]-closes[j2-1]; if(d>=0)g+=d; else l-=d; } var ag=g/period,al=l/period; var rsi=al===0?100:100-100/(1+ag/al); rsiData.push({time:times[i2],value:rsi}); }
      try{
        var rls=chart.addLineSeries({color:"#EAB308",lineWidth:1,priceScaleId:"rsi",priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
        rls.setData(rsiData);
        chart.priceScale("rsi").applyOptions({scaleMargins:{top:0.82,bottom:0}});
        rsiSeriesRef.current=rls;
      }catch(e){}
    }
  },[showMA,showIchi,showRSI,loading,tfIdx,JSON.stringify(maSel)]);

  var noLib=(typeof window!=="undefined"&&!window.LightweightCharts);

  // Charge les dessins du symbole
  useEffect(function(){ try{ var raw=localStorage.getItem("cgi_draw_"+symbol); setDrawings(raw?JSON.parse(raw):[]); }catch(e){ setDrawings([]); } setPending(null); setDrawMode(null); },[symbol]);
  // Redessine après resize/chargement
  useEffect(function(){ var id=setTimeout(function(){ setDrawTick(function(x){return (x+1)%1000000;}); },60); return function(){clearTimeout(id);}; },[fs,loading]);
  function saveDraws(arr){ setDrawings(arr); try{ localStorage.setItem("cgi_draw_"+symbol, JSON.stringify(arr)); }catch(e){} }
  function clearDraws(){ saveDraws([]); setPending(null); setDrawMode(null); setSelDraw(null); }
  function delOneDraw(i){ var nd=(drawings||[]).slice(); nd.splice(i,1); saveDraws(nd); setSelDraw(null); }
  function colorSelDraw(c){ if(selDraw==null) return; var nd=(drawings||[]).slice(); if(nd[selDraw]){ nd[selDraw]=Object.assign({},nd[selDraw],{color:c}); saveDraws(nd); } }
  function onDrawClick(e){
    if(!drawMode) return;
    var chart=chartRef.current, series=seriesRef.current, cont=containerRef.current; if(!chart||!series||!cont) return;
    var rect=cont.getBoundingClientRect();
    var cx=(e.clientX!=null?e.clientX:(e.touches&&e.touches[0]?e.touches[0].clientX:(e.changedTouches&&e.changedTouches[0]?e.changedTouches[0].clientX:null)));
    var cy=(e.clientY!=null?e.clientY:(e.touches&&e.touches[0]?e.touches[0].clientY:(e.changedTouches&&e.changedTouches[0]?e.changedTouches[0].clientY:null)));
    if(cx==null||cy==null) return;
    var x=cx-rect.left, y=cy-rect.top, l=null, p=null;
    try{ l=chart.timeScale().coordinateToLogical(x); p=series.coordinateToPrice(y); }catch(err){}
    var bars=barsRef.current||[];
    if(l==null||p==null||!bars.length) return;
    if(drawMode==="select"){
      var t2x=function(tt){ try{ var v=chart.timeScale().timeToCoordinate(tt); if(v!=null) return v; }catch(e){} var best=0,bd=Infinity; for(var i=0;i<bars.length;i++){ var dd=Math.abs(bars[i].time-tt); if(dd<bd){bd=dd;best=i;} } try{ return chart.timeScale().logicalToCoordinate(best); }catch(e){ return null; } };
      var p2y=function(pp){ try{ return series.priceToCoordinate(pp); }catch(e){ return null; } };
      var distSeg=function(px,py,ax,ay,bx,by){ var dx=bx-ax,dy=by-ay; var L2=dx*dx+dy*dy; if(L2===0) return Math.hypot(px-ax,py-ay); var u=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/L2)); return Math.hypot(px-(ax+u*dx),py-(ay+u*dy)); };
      var bestI=null,bestD=16;
      (drawings||[]).forEach(function(d,di){
        var dd=Infinity;
        if(d.type==="trend"){ var x1=t2x(d.t1),y1=p2y(d.p1),x2=t2x(d.t2),y2=p2y(d.p2); if(x1!=null&&y1!=null&&x2!=null&&y2!=null) dd=distSeg(x,y,x1,y1,x2,y2); }
        else if(d.type==="fib"){ [0,0.236,0.382,0.5,0.618,0.786,1].forEach(function(f){ var yy=p2y(d.p1+(d.p2-d.p1)*f); if(yy!=null) dd=Math.min(dd,Math.abs(y-yy)); }); }
        if(dd<bestD){ bestD=dd; bestI=di; }
      });
      setSelDraw(bestI); return;
    }
    var idx=Math.max(0,Math.min(bars.length-1,Math.round(l)));
    var t=bars[idx].time;
    if(!pending){ setPending({t:t,p:p}); }
    else { saveDraws(drawings.concat([{type:drawMode,t1:pending.t,p1:pending.p,t2:t,p2:p,color:(drawMode==="trend"?(C2.btc||"#F7931A"):null)}])); setPending(null); setDrawMode(null); }
  }

  // Plein écran : redimensionne le graphique
  useEffect(function(){
    if(!chartRef.current||!containerRef.current) return;
    var h=fs?Math.max(320,(typeof window!=="undefined"?window.innerHeight:600)-150):height;
    try{ chartRef.current.applyOptions({width:containerRef.current.clientWidth,height:h}); chartRef.current.timeScale().fitContent(); }catch(e){}
  },[fs]);

  var chartHeight=fs?Math.max(320,(typeof window!=="undefined"?window.innerHeight:600)-150):height;
  var wrapStyle=fs?{position:"fixed",inset:0,zIndex:9998,background:bgc,padding:"12px 12px 0",overflow:"hidden"}:{position:"relative"};

  return React.createElement("div",{style:wrapStyle},
    React.createElement("div",{style:{display:"flex",gap:6,marginBottom:6,alignItems:"center"}},
      LW_TF.map(function(t,i){
        return React.createElement("button",{key:t[0],onClick:function(){setTfIdx(i);},
          style:{background:tfIdx===i?(C2.btc||"#F7931A"):(C2.bg1||"#11131A"),color:tfIdx===i?"#000":txt,
            border:"1px solid "+gridC,borderRadius:6,padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer"}},t[0]);
      }),
      pickActive&&React.createElement("span",{style:{fontSize:10,color:C2.btc||"#F7931A",marginLeft:6,fontWeight:700}},"✋ Touche le graphique pour fixer le niveau"),
      fs&&React.createElement("div",{style:{display:"flex",gap:5,marginLeft:12}},
        [["MM",showMA,function(){setShowMA(!showMA);}],["Ichimoku",showIchi,function(){setShowIchi(!showIchi);}],["RSI",showRSI,function(){setShowRSI(!showRSI);}]].map(function(b){
          return React.createElement("button",{key:b[0],onClick:b[2],
            style:{background:b[1]?(C2.blue||"#3B82F6"):(C2.bg1||"#11131A"),color:b[1]?"#fff":txt,border:"1px solid "+gridC,borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:700,cursor:"pointer"}},b[0]);
        })
      ),
      fs&&showMA&&React.createElement("div",{style:{display:"flex",gap:4,marginLeft:4,alignItems:"center"}},
        React.createElement("span",{style:{fontSize:9,color:C2.gray||"#888"}},"MM:"),
        [9,20,50,100,200].map(function(n){ var on=!!maSel[n];
          return React.createElement("button",{key:n,onClick:function(){setMaSel(function(prev){var x=Object.assign({},prev);x[n]=!prev[n];return x;});},
            style:{background:on?(C2.btc||"#F7931A"):"transparent",color:on?"#000":(C2.gray||"#888"),border:"1px solid "+gridC,borderRadius:5,padding:"2px 6px",fontSize:10,fontWeight:700,cursor:"pointer"}},n);
        })
      ),
      fs&&React.createElement("div",{style:{display:"flex",gap:5,marginLeft:8,alignItems:"center"}},
        [["╱ Ligne","trend"],["Fib","fib"],["⤰ Sélect.","select"]].map(function(b){ var on=drawMode===b[1];
          return React.createElement("button",{key:b[1],onClick:function(){setDrawMode(on?null:b[1]);setPending(null);setSelDraw(null);},
            style:{background:on?(C2.btc||"#F7931A"):(C2.bg1||"#11131A"),color:on?"#000":txt,border:"1px solid "+gridC,borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:700,cursor:"pointer"}},b[0]);
        }),
        React.createElement("button",{key:"clr",onClick:clearDraws,style:{background:C2.bg1||"#11131A",color:down,border:"1px solid "+gridC,borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:700,cursor:"pointer"}},"Tout effacer"),
        drawMode&&drawMode!=="select"&&React.createElement("span",{style:{fontSize:10,color:C2.btc||"#F7931A",fontWeight:700}},pending?"Touche le 2e point":"Touche le 1er point"),
        drawMode==="select"&&React.createElement("span",{style:{fontSize:10,color:C2.btc||"#F7931A",fontWeight:700}},"Touche un tracé pour le sélectionner")
      ),
      React.createElement("button",{onClick:function(){setFs(!fs);},title:"Plein écran",
        style:{marginLeft:"auto",background:C2.bg1||"#11131A",color:txt,border:"1px solid "+gridC,borderRadius:6,padding:"3px 10px",fontSize:13,fontWeight:700,cursor:"pointer"}},fs?"✕":"⤢")
    ),
    noLib&&React.createElement("div",{style:{fontSize:11,color:down,padding:8}},"Librairie graphique non chargée (recharge la page)."),
    React.createElement("div",{style:{position:"relative",width:"100%",height:chartHeight}},
      React.createElement("div",{ref:containerRef,style:{width:"100%",height:chartHeight,opacity:loading?0.5:1}}),
      (function(){
        var chart=chartRef.current, series=seriesRef.current; var _t=drawTick;
        if(!chart||!series) return null;
        var bars=barsRef.current||[];
        var t2x=function(t){
          try{ var v=chart.timeScale().timeToCoordinate(t); if(v!=null) return v; }catch(e){}
          if(!bars.length) return null;
          var best=0,bd=Infinity; for(var i=0;i<bars.length;i++){ var dd=Math.abs(bars[i].time-t); if(dd<bd){bd=dd;best=i;} }
          try{ return chart.timeScale().logicalToCoordinate(best); }catch(e){ return null; }
        };
        var p2y=function(p){ try{ return series.priceToCoordinate(p); }catch(e){ return null; } };
        var W=(containerRef.current?containerRef.current.clientWidth:300);
        var FIBS=[0,0.236,0.382,0.5,0.618,0.786,1];
        var FIBC=["#9CA3AF","#22C55E","#3B82F6","#EAB308","#A855F7","#F97316","#EF4444"];
        var els=[];
        (drawings||[]).forEach(function(d,di){
          var sel=(selDraw===di);
          if(d.type==="trend"){
            var x1=t2x(d.t1),y1=p2y(d.p1),x2=t2x(d.t2),y2=p2y(d.p2);
            if(x1!=null&&y1!=null&&x2!=null&&y2!=null){
              els.push(React.createElement("line",{key:"t"+di,x1:x1,y1:y1,x2:x2,y2:y2,stroke:d.color||(C2.btc||"#F7931A"),strokeWidth:sel?3:1.5}));
              if(sel){ els.push(React.createElement("circle",{key:"th1"+di,cx:x1,cy:y1,r:4,fill:"#fff",stroke:d.color||C2.btc})); els.push(React.createElement("circle",{key:"th2"+di,cx:x2,cy:y2,r:4,fill:"#fff",stroke:d.color||C2.btc})); }
            }
          } else if(d.type==="fib"){
            FIBS.forEach(function(f,fi){ var price=d.p1+(d.p2-d.p1)*f; var y=p2y(price); if(y!=null){ els.push(React.createElement("line",{key:"f"+di+"_"+fi,x1:0,y1:y,x2:W,y2:y,stroke:FIBC[fi],strokeWidth:sel?1.6:0.8,strokeDasharray:"4,3",opacity:0.9})); els.push(React.createElement("text",{key:"ft"+di+"_"+fi,x:3,y:y-2,fill:FIBC[fi],fontSize:8},(f*100).toFixed(1)+"%")); } });
          }
        });
        if(pending){ var px=t2x(pending.t),py=p2y(pending.p); if(px!=null&&py!=null) els.push(React.createElement("circle",{key:"pend",cx:px,cy:py,r:5,fill:C2.btc||"#F7931A"})); }
        return React.createElement(React.Fragment,null,
          React.createElement("svg",{width:"100%",height:chartHeight,style:{position:"absolute",left:0,top:0,pointerEvents:"none"}},els),
          drawMode&&React.createElement("div",{onPointerUp:onDrawClick,style:{position:"absolute",left:0,top:0,width:"100%",height:chartHeight,zIndex:6,cursor:drawMode==="select"?"pointer":"crosshair",touchAction:"none",background:"transparent"}})
        );
      })(),
      fs&&selDraw!=null&&(drawings||[])[selDraw]&&React.createElement("div",{style:{position:"absolute",top:8,left:"50%",transform:"translateX(-50%)",zIndex:8,display:"flex",gap:6,alignItems:"center",background:C2.bg1||"#11131A",border:"1px solid "+gridC,borderRadius:9,padding:"5px 8px",boxShadow:"0 4px 12px rgba(0,0,0,.4)"}},
        React.createElement("span",{style:{fontSize:10,color:txt,fontWeight:700,marginRight:2}},(drawings[selDraw].type==="fib"?"Fibonacci":"Ligne")),
        (drawings[selDraw].type==="trend")&&["#F7931A","#3B82F6","#22C55E","#EF4444","#A855F7","#EAB308"].map(function(c){
          return React.createElement("button",{key:c,onClick:function(){colorSelDraw(c);},title:"Couleur",style:{width:16,height:16,borderRadius:8,background:c,border:(drawings[selDraw].color===c?"2px solid #fff":"1px solid "+gridC),cursor:"pointer",padding:0}});
        }),
        React.createElement("button",{onClick:function(){delOneDraw(selDraw);},title:"Supprimer ce tracé",style:{background:(C2.red||"#EF4444")+"22",color:C2.red||"#EF4444",border:"1px solid "+(C2.red||"#EF4444")+"66",borderRadius:6,padding:"2px 8px",fontSize:13,cursor:"pointer"}},"🗑"),
        React.createElement("button",{onClick:function(){setSelDraw(null);},title:"Fermer",style:{background:"transparent",color:C2.gray||"#888",border:"none",fontSize:14,cursor:"pointer",padding:"0 2px"}},"✕")
      )
    ),
    err&&React.createElement("div",{style:{fontSize:10,color:down,marginTop:4}},err)
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// JCGI — BtcIndicators : dashboard d'indicateurs BTC
//   backend /btc-signals (prix, Puell, Hash Ribbons, F&G) + on-chain client (bitcoin-data.com)
// ══════════════════════════════════════════════════════════════════════════════
function BtcIndicators(){
  const[btcSig,setBtcSig]=useState(null);
  const[btcSigL,setBtcSigL]=useState(false);
  const[btcSigE,setBtcSigE]=useState(null);
  const[btcOpen,setBtcOpen]=useState({});
  function num(v,d){ if(v==null||isNaN(v))return "—"; return Number(v).toLocaleString("fr-FR",{maximumFractionDigits:d!=null?d:2}); }
  function btcHeatColor(h){ return h==null?C.gray:(h<40?C.green:(h<60?C.gold:(h<80?C.orange:C.red))); }

  function fetchOnchainBtc(force){
    var CK="jcgi_btc_onchain_v1";
    var OC=[
      {key:"mvrvz",slugs:["mvrv-zscore"]},
      {key:"nupl",slugs:["nupl"]},
      {key:"reserverisk",slugs:["reserve-risk"]},
      {key:"rhodl",slugs:["rhodl-ratio"]},
      {key:"sthmvrv",slugs:["sth-mvrv"]},
      {key:"asopr",slugs:["asopr","sopr"]},
      {key:"vdd",slugs:["vdd-multiple","value-days-destroyed-multiple","vdd"]}
    ];
    var cached={}, cachedTs=0;
    try{ var raw=localStorage.getItem(CK); if(raw){ var pj=JSON.parse(raw); cached=pj.vals||{}; cachedTs=pj.ts||0; } }catch(e){}
    var fresh=(Date.now()-cachedTs)<6*3600*1000;
    var haveAll=OC.every(function(m){ return cached[m.key]!=null; });
    if(!force && fresh && haveAll) return Promise.resolve(Object.assign({},cached));
    var pick=function(d){ if(!d||typeof d!=="object")return null; for(var k in d){ if(/^(d|unixts|theday|date|time)$/i.test(k))continue; if(/(1m|1w|7d|14d|30d|90d|sma|ema)$/i.test(k))continue; var n=parseFloat(d[k]); if(isFinite(n))return n; } return null; };
    var sleep=function(ms){ return new Promise(function(r){ setTimeout(r,ms); }); };
    var out=Object.assign({},cached);
    var seq=OC.reduce(function(prev,m){
      return prev.then(function(){
        var attempt=function(i,retried){
          if(i>=m.slugs.length) return Promise.resolve(null);
          return fetch("https://bitcoin-data.com/v1/"+m.slugs[i]+"/last",{headers:{Accept:"application/json"}})
            .then(function(r){
              if(r.status===429){ return (!retried? sleep(700).then(function(){return attempt(i,true);}) : attempt(i+1,false)); }
              if(!r.ok) return attempt(i+1,false);
              return r.json().then(function(d){ if(Array.isArray(d))d=d[d.length-1]; var v=pick(d); return v!=null?v:attempt(i+1,false); });
            })
            .catch(function(){ return (!retried? sleep(500).then(function(){return attempt(i,true);}) : null); });
        };
        return attempt(0,false).then(function(v){ if(v!=null) out[m.key]=v; return sleep(250); });
      });
    }, Promise.resolve());
    return seq.then(function(){
      try{ localStorage.setItem(CK, JSON.stringify({ts:Date.now(), vals:out})); }catch(e){}
      return out;
    });
  }

  function loadBtc(noCache){
    setBtcSigL(true); setBtcSigE(null);
    fetch(CF_WORKER_URL+"/btc-signals"+(noCache?"?no_cache=1":""),{headers:{"X-Auth-Key":CF_AUTH_KEY},signal:AbortSignal.timeout(25000)})
      .then(function(r){return r.json();})
      .then(function(d){
        if(d&&d.error){ setBtcSigE(String(d.error)); setBtcSigL(false); return; }
        var cl=function(v,lo,hi){ return Math.max(0,Math.min(100,(v-lo)/(hi-lo)*100)); };
        var finish=function(oc){
          var ind=(d.indicators||[]).map(function(o){ return Object.assign({},o); });
          var byk={}; ind.forEach(function(o){ byk[o.key]=o; });
          var patch=function(key,val,heat,zone){ var it=byk[key]; if(it){ it.value=val; it.heat=heat; it.zone=zone; } };
          var lg=function(v){ return Math.log(v)/Math.LN10; };
          if(oc.mvrvz!=null){ var a=oc.mvrvz; patch("mvrvz",a.toFixed(2),cl(a,0,7),a<1?"Bas — accumulation/bottom":a>7?"Très au-dessus — top":"Neutre"); }
          if(oc.nupl!=null){ var b=oc.nupl; patch("nupl",b.toFixed(2),cl(b,0,0.75),b<0?"Capitulation":b<0.25?"Espoir":b<0.5?"Optimisme":b<0.75?"Croyance":"Euphorie"); }
          if(oc.reserverisk!=null){ var c=oc.reserverisk; patch("reserverisk",c.toFixed(4),cl(c,0.001,0.02),c<0.002?"Confiance forte, prix bas — achat":c>0.02?"Risque élevé — vente":"Neutre"); }
          if(oc.rhodl!=null){ var e=oc.rhodl; patch("rhodl",String(Math.round(e)),(e>0?cl(lg(e),2.60,4.48):null),e<2000?"Bas — accumulation":e>20000?"Surchauffe — top":"Neutre"); }
          if(oc.sthmvrv!=null){ var g=oc.sthmvrv; patch("sthmvrv",g.toFixed(2),cl(g,0.85,1.5),g<0.9?"Détenteurs court terme en perte — bottom":g>1.35?"Surchauffe locale — top":"Neutre"); }
          if(oc.asopr!=null){ var h=oc.asopr; patch("asopr",h.toFixed(3),cl(h,0.97,1.06),h<1?"Vendeurs en perte — capitulation":h>1.04?"Prise de profit soutenue":"Neutre"); }
          if(oc.vdd!=null){ var j=oc.vdd; patch("vdd",j.toFixed(2),cl(j,0.6,2.9),j<0.6?"Faible — bottom":j>2.9?"Distribution — top":"Neutre"); }
          ind.forEach(function(o){ o.color=btcHeatColor(o.heat); });
          var sw=0,swh=0,nok=0; ind.forEach(function(o){ if(o.heat!=null){ sw+=o.weight; swh+=o.heat*o.weight; nok++; } });
          var ah=sw>0?swh/sw:null;
          var reco=ah==null?null:(ah<25?"Acheter":ah<40?"Accumuler":ah<60?"Conserver":ah<80?"Alléger":"Vendre");
          setBtcSig(Object.assign({},d,{indicators:ind,aggHeat:ah,reco:reco,recoColor:btcHeatColor(ah),nIndicators:nok}));
          setBtcSigL(false);
        };
        fetchOnchainBtc(noCache).then(finish).catch(function(){ finish({}); });
      })
      .catch(function(e){ setBtcSigE((e&&e.message)||"Erreur réseau"); setBtcSigL(false); });
  }
  useEffect(function(){ loadBtc(false); },[]);

  if(btcSigL && !btcSig) return React.createElement("div",{style:{textAlign:"center",color:C.text3,fontSize:12,padding:"30px 0"}},"Chargement des indicateurs BTC…");
  if(btcSigE && !btcSig) return React.createElement("div",{style:{background:C.red+"11",border:"1px solid "+C.red+"44",borderRadius:10,padding:12,color:C.red,fontSize:12}},
    "Erreur : "+btcSigE,
    React.createElement("button",{onClick:function(){loadBtc(true);},style:{marginLeft:8,background:"none",border:"1px solid "+C.red+"66",borderRadius:6,color:C.red,fontSize:11,padding:"2px 8px",cursor:"pointer"}},"Réessayer")
  );
  if(!btcSig) return null;
  var d=btcSig;
  var grad="linear-gradient(90deg,"+C.green+" 0%,"+C.green+" 28%,"+C.gold+" 50%,"+C.orange+" 72%,"+C.red+" 100%)";
  var byKey={}; (d.indicators||[]).forEach(function(o){ byKey[o.key]=o; });
  var groups=[["Cycle & valorisation",["ma2y","mayer","picycle","picyclebot","ma200w","rainbow","ahr999"]],["Tendance & momentum",["bmsb","ema918","rsiw"]],["On-chain",["puell","hashribbons","mvrvz","nupl","sthmvrv","rhodl","reserverisk","asopr","vdd"]],["Sentiment",["feargreed"]]];
  var tog=function(k){ setBtcOpen(function(p){ var n=Object.assign({},p); n[k]=!p[k]; return n; }); };
  var maj=d.ts?new Date(d.ts).toLocaleString("fr-FR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—";

  return React.createElement("div",null,
    React.createElement("div",{style:{background:d.recoColor+"18",border:"1px solid "+d.recoColor+"55",borderRadius:14,padding:"14px 16px",marginBottom:16}},
      React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}},
        React.createElement("div",null,
          React.createElement("div",{style:{fontSize:9,color:C.text3,textTransform:"uppercase",letterSpacing:0.5}},"Recommandation"),
          React.createElement("div",{style:{fontSize:28,fontWeight:600,color:d.recoColor,lineHeight:1.1,marginTop:3}},d.reco||"—")
        ),
        React.createElement("div",{style:{textAlign:"right"}},
          React.createElement("div",{style:{fontSize:9,color:C.text3,textTransform:"uppercase",letterSpacing:0.5}},"Surchauffe"),
          React.createElement("div",{style:{fontSize:24,fontWeight:600,color:d.recoColor,lineHeight:1.1,marginTop:3}},d.aggHeat!=null?Math.round(d.aggHeat):"—",React.createElement("span",{style:{fontSize:12,fontWeight:600,color:C.text2}},"/100"))
        )
      ),
      React.createElement("div",{style:{position:"relative",height:8,borderRadius:5,marginTop:12,background:grad}},
        d.aggHeat!=null&&React.createElement("div",{style:{position:"absolute",top:-3,left:"calc("+Math.max(0,Math.min(100,d.aggHeat))+"% - 7px)",width:14,height:14,borderRadius:"50%",background:"#fff",border:"2px solid "+C.bg,boxShadow:"0 0 0 1px "+C.border}})
      ),
      React.createElement("div",{style:{display:"flex",justifyContent:"space-between",fontSize:9,color:C.text3,marginTop:6}},
        React.createElement("span",null,"Acheter"),React.createElement("span",null,"Conserver"),React.createElement("span",null,"Vendre")
      ),
      React.createElement("div",{style:{fontSize:10,color:C.text2,marginTop:10,fontWeight:600}},"BTC $"+num(d.price,0)+" · "+d.nIndicators+"/"+(d.indicators||[]).length+" indicateurs · maj "+maj)
    ),
    groups.map(function(g,gi){
      return React.createElement("div",{key:gi,style:{marginBottom:14}},
        React.createElement("div",{style:{fontSize:10,fontWeight:700,color:C.text3,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}},g[0]),
        React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:8}},
          g[1].map(function(k){
            var o=byKey[k]; if(!o) return null; var open=!!btcOpen[k];
            return React.createElement("div",{key:k,style:{background:C.bg1,border:"1px solid "+C.border,borderLeft:"3px solid "+o.color,borderRadius:10,overflow:"hidden"}},
              React.createElement("div",{onClick:function(){tog(k);},style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",cursor:"pointer",gap:8}},
                React.createElement("div",{style:{minWidth:0}},
                  React.createElement("div",{style:{fontSize:13,fontWeight:700,color:C.text}},o.name),
                  React.createElement("div",{style:{fontSize:10,color:o.color,marginTop:2,fontWeight:600}},o.zone)
                ),
                React.createElement("div",{style:{display:"flex",alignItems:"center",gap:10,flexShrink:0}},
                  React.createElement("span",{style:{fontSize:15,fontWeight:600,color:C.text}},o.value),
                  React.createElement("span",{style:{width:9,height:9,borderRadius:"50%",background:o.color,flexShrink:0}}),
                  React.createElement("span",{style:{fontSize:10,color:C.text3}},open?"▾":"▸")
                )
              ),
              open&&React.createElement("div",{style:{padding:"0 12px 12px",borderTop:"1px solid "+C.border}},
                o.heat!=null&&React.createElement("div",{style:{position:"relative",height:6,borderRadius:4,margin:"12px 0 6px",background:grad}},
                  React.createElement("div",{style:{position:"absolute",top:-3,left:"calc("+Math.max(0,Math.min(100,o.heat))+"% - 6px)",width:12,height:12,borderRadius:"50%",background:"#fff",border:"2px solid "+C.bg,boxShadow:"0 0 0 1px "+C.border}})
                ),
                React.createElement("div",{style:{fontSize:12,color:C.text2,lineHeight:1.55,marginTop:8}},o.explain)
              )
            );
          })
        )
      );
    }),
    React.createElement("div",{style:{fontSize:10,color:C.text3,lineHeight:1.5,marginTop:6,padding:"0 2px"}},"Agrégat mécanique d'indicateurs publics (prix, on-chain, sentiment) à visée éducative. Ce n'est pas un conseil en investissement.")
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CGI — FundingView : taux de financement perpétuels (backend /funding)
// ══════════════════════════════════════════════════════════════════════════════
function cgiBigUsd(v){ if(v==null||!isFinite(v))return "—"; var a=Math.abs(v); if(a>=1e9)return (v/1e9).toFixed(2)+"B"; if(a>=1e6)return (v/1e6).toFixed(1)+"M"; if(a>=1e3)return (v/1e3).toFixed(0)+"k"; return String(Math.round(v)); }

function FundingView(){
  const[fund,setFund]=useState(null);
  const[fundL,setFundL]=useState(false);
  const[fundE,setFundE]=useState(null);
  const[fundOpen,setFundOpen]=useState({});
  function load(noCache){
    setFundL(true); setFundE(null);
    fetch(CF_WORKER_URL+"/funding"+(noCache?"?no_cache=1":""),{headers:{"X-Auth-Key":CF_AUTH_KEY},signal:AbortSignal.timeout(25000)})
      .then(function(r){return r.json();})
      .then(function(d){ if(d&&d.error){setFundE(String(d.error));} else {setFund(d);} setFundL(false); })
      .catch(function(e){ setFundE((e&&e.message)||"Erreur réseau"); setFundL(false); });
  }
  useEffect(function(){ load(false); },[]);

  if(fundL&&!fund) return React.createElement("div",{style:{textAlign:"center",color:C.text3,fontSize:12,padding:"30px 0"}},"Chargement du funding…");
  if(fundE&&!fund) return React.createElement("div",{style:{background:C.red+"11",border:"1px solid "+C.red+"44",borderRadius:10,padding:12,color:C.red,fontSize:12}},
    "Erreur : "+fundE,
    React.createElement("button",{onClick:function(){load(true);},style:{marginLeft:8,background:"none",border:"1px solid "+C.red+"66",borderRadius:6,color:C.red,fontSize:11,padding:"2px 8px",cursor:"pointer"}},"Réessayer")
  );
  if(!fund) return null;

  var aColor=function(a){ return a==null?C.text3:(a>=0?C.green:C.red); };
  var aTxt=function(a){ return a==null?"—":(a>=0?"+":"")+a.toFixed(2)+"%"; };
  var tog=function(name){ setFundOpen(function(o){ var n=Object.assign({},o); n[name]=!o[name]; return n; }); };

  var cryptoRow=function(name,d){
    var apr=d.aggApr!=null?d.aggApr*100:null; var open=!!fundOpen[name];
    return React.createElement("div",{key:name,style:{background:C.bg1,border:"1px solid "+C.border,borderRadius:10,overflow:"hidden"}},
      React.createElement("button",{onClick:function(){tog(name);},style:{width:"100%",background:"none",border:"none",cursor:"pointer",padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}},
        React.createElement("div",{style:{textAlign:"left"}},
          React.createElement("div",{style:{fontSize:13,fontWeight:600,color:C.text}},name+" ",React.createElement("span",{style:{fontSize:9,color:C.text3}},open?"▾":"▸")),
          React.createElement("div",{style:{fontSize:9,color:C.text3,marginTop:1}},(d.nPlatforms||0)+" plateformes · OI "+cgiBigUsd(d.totalOiUsd)+" · Vol "+cgiBigUsd(d.totalVolUsd))
        ),
        React.createElement("div",{style:{textAlign:"right"}},
          React.createElement("div",{style:{fontSize:15,fontWeight:600,color:aColor(apr)}},aTxt(apr)),
          React.createElement("div",{style:{fontSize:8,color:C.text3}},"APR agrégé (pond. OI)")
        )
      ),
      open&&React.createElement("div",{style:{borderTop:"1px solid "+C.border,padding:"4px 12px 8px"}},
        React.createElement("div",{style:{display:"flex",fontSize:8,color:C.text3,textTransform:"uppercase",letterSpacing:0.4,padding:"4px 0",borderBottom:"1px solid "+C.border+"55"}},
          React.createElement("span",{style:{flex:1.5}},"Plateforme"),
          React.createElement("span",{style:{flex:1,textAlign:"right"}},"APR"),
          React.createElement("span",{style:{flex:1,textAlign:"right"}},"OI"),
          React.createElement("span",{style:{flex:1,textAlign:"right"}},"Vol 24h")
        ),
        (d.platforms||[]).map(function(pl){ var a2=pl.apr!=null?pl.apr*100:null;
          return React.createElement("div",{key:pl.name,style:{display:"flex",alignItems:"center",fontSize:11,padding:"5px 0",borderBottom:"1px solid "+C.border+"22"}},
            React.createElement("span",{style:{flex:1.5,color:C.text,fontWeight:600}},pl.name,pl.intervalH?React.createElement("span",{style:{fontSize:8,color:C.text3,fontWeight:400}}," "+pl.intervalH+"h"):null),
            React.createElement("span",{style:{flex:1,textAlign:"right",fontWeight:700,color:aColor(a2)}},aTxt(a2)),
            React.createElement("span",{style:{flex:1,textAlign:"right",color:C.text2}},pl.oiUsd!=null?cgiBigUsd(pl.oiUsd):"—"),
            React.createElement("span",{style:{flex:1,textAlign:"right",color:C.text2}},pl.volUsd!=null?cgiBigUsd(pl.volUsd):"—")
          );
        })
      )
    );
  };

  var nb=fund.nq_basis;
  return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:6}},
    cryptoRow("BTC",fund.btc||{}),
    cryptoRow("ETH",fund.eth||{}),
    nb&&React.createElement("div",{style:{background:C.bg1,border:"1px solid "+C.border,borderRadius:10,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}},
      React.createElement("div",null,
        React.createElement("div",{style:{fontSize:13,fontWeight:600,color:C.text}},"Nasdaq (NQ)"),
        React.createElement("div",{style:{fontSize:9,color:C.text3,marginTop:1}},"Basis "+(nb.basisPct>=0?"+":"")+nb.basisPct.toFixed(2)+"% · éch. "+nb.expiry+" ("+nb.daysToExpiry+"j)")
      ),
      React.createElement("div",{style:{textAlign:"right"}},
        React.createElement("div",{style:{fontSize:15,fontWeight:600,color:aColor(nb.annualizedPct)}},aTxt(nb.annualizedPct)),
        React.createElement("div",{style:{fontSize:8,color:C.text3}},"Basis annualisé")
      )
    ),
    React.createElement("div",{style:{fontSize:8,color:C.text3,textAlign:"right"}},"Bybit + OKX · maj "+(fund.ts?new Date(fund.ts).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}):"—"))
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// CGI — MoversView : top hausses/baisses (backend /market/movers)
// ══════════════════════════════════════════════════════════════════════════════
function cgiPctColor(p){ return p==null?(typeof C!=="undefined"?C.text3:"#888"):(p>=0?(C.green):(C.red)); }
function cgiPctFmt(p){ return p==null?"—":(p>=0?"+":"")+p.toFixed(2)+"%"; }

function MoversView(){
  const[mov,setMov]=useState(null);const[movL,setMovL]=useState(false);const[movE,setMovE]=useState(null);
  function load(nc){ setMovL(true);setMovE(null);
    fetch(CF_WORKER_URL+"/market/movers"+(nc?"?no_cache=1":""),{headers:{"X-Auth-Key":CF_AUTH_KEY},signal:AbortSignal.timeout(25000)})
      .then(function(r){return r.json();}).then(function(d){ if(d&&d.error)setMovE(String(d.error)); else setMov(d); setMovL(false); })
      .catch(function(e){ setMovE((e&&e.message)||"Erreur réseau"); setMovL(false); }); }
  useEffect(function(){ load(false); },[]);
  if(movL&&!mov) return React.createElement("div",{style:{textAlign:"center",color:C.text3,fontSize:12,padding:"24px 0"}},"Chargement…");
  if(movE&&!mov) return React.createElement("div",{style:{background:C.red+"11",border:"1px solid "+C.red+"44",borderRadius:10,padding:12,color:C.red,fontSize:12}},"Erreur : "+movE,React.createElement("button",{onClick:function(){load(true);},style:{marginLeft:8,background:"none",border:"1px solid "+C.red+"66",borderRadius:6,color:C.red,fontSize:11,padding:"2px 8px",cursor:"pointer"}},"Réessayer"));
  if(!mov) return null;
  var cr=mov.crypto||{}, st=mov.stocks||{};
  var mlist=function(items){
    if(!items||!items.length) return React.createElement("span",{style:{fontSize:9,color:C.text3}},"—");
    return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:4}},
      items.map(function(it,i){
        return React.createElement("div",{key:it.symbol+i,style:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:6,background:C.bg1,border:"1px solid "+C.border,borderRadius:8,padding:"6px 8px"}},
          React.createElement("span",{style:{fontSize:11,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:80}},it.symbol),
          React.createElement("span",{style:{fontSize:11,fontWeight:700,color:cgiPctColor(it.pct),flexShrink:0}},cgiPctFmt(it.pct))
        );
      })
    );
  };
  var block=function(title,gainers,losers){
    return React.createElement("div",null,
      React.createElement("div",{style:{fontSize:9,color:C.text3,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}},title),
      React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}},
        React.createElement("div",null,React.createElement("div",{style:{fontSize:9,fontWeight:700,color:C.green,marginBottom:4}},"▲ Hausses"),mlist(gainers)),
        React.createElement("div",null,React.createElement("div",{style:{fontSize:9,fontWeight:700,color:C.red,marginBottom:4}},"▼ Baisses"),mlist(losers))
      )
    );
  };
  return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:16}},
    block("Crypto — 24 h",cr.gainers,cr.losers),
    block("Actions US — jour",st.gainers,st.losers),
    React.createElement("div",{style:{fontSize:8,color:C.text3,textAlign:"right"}},"CoinGecko + Yahoo · maj "+(mov.ts?new Date(mov.ts).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}):"—"))
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CGI — MacroView : secteurs, taux, VIX, dominance (backend /market/overview)
// ══════════════════════════════════════════════════════════════════════════════
function MacroView(){
  const[mkt,setMkt]=useState(null);const[mktL,setMktL]=useState(false);const[mktE,setMktE]=useState(null);
  function load(nc){ setMktL(true);setMktE(null);
    fetch(CF_WORKER_URL+"/market/overview"+(nc?"?no_cache=1":""),{headers:{"X-Auth-Key":CF_AUTH_KEY},signal:AbortSignal.timeout(25000)})
      .then(function(r){return r.json();}).then(function(d){ if(d&&d.error)setMktE(String(d.error)); else setMkt(d); setMktL(false); })
      .catch(function(e){ setMktE((e&&e.message)||"Erreur réseau"); setMktL(false); }); }
  useEffect(function(){ load(false); },[]);
  if(mktL&&!mkt) return React.createElement("div",{style:{textAlign:"center",color:C.text3,fontSize:12,padding:"24px 0"}},"Chargement…");
  if(mktE&&!mkt) return React.createElement("div",{style:{background:C.red+"11",border:"1px solid "+C.red+"44",borderRadius:10,padding:12,color:C.red,fontSize:12}},"Erreur : "+mktE,React.createElement("button",{onClick:function(){load(true);},style:{marginLeft:8,background:"none",border:"1px solid "+C.red+"66",borderRadius:6,color:C.red,fontSize:11,padding:"2px 8px",cursor:"pointer"}},"Réessayer"));
  if(!mkt) return null;
  var p=mkt.pulse||{}, treas=mkt.treasury||[], sectors=(mkt.sectors||[]).slice().sort(function(a,b){ return (b.pct==null?-999:b.pct)-(a.pct==null?-999:a.pct); });
  var pulseCard=function(label,val,sub,color){
    return React.createElement("div",{style:{flex:1,background:C.bg1,border:"1px solid "+C.border,borderRadius:10,padding:"10px 12px"}},
      React.createElement("div",{style:{fontSize:9,color:C.text3,textTransform:"uppercase",letterSpacing:0.5}},label),
      React.createElement("div",{style:{fontSize:20,fontWeight:600,color:color||C.text,marginTop:3}},val),
      sub?React.createElement("div",{style:{fontSize:10,color:C.text2,marginTop:1}},sub):null
    );
  };
  var maxAbs=Math.max.apply(null,sectors.map(function(s){return Math.abs(s.pct||0);}).concat([0.5]));
  return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:16}},
    React.createElement("div",{style:{display:"flex",gap:8}},
      pulseCard("VIX",p.vix!=null?p.vix.toFixed(1):"—",p.vixPct!=null?cgiPctFmt(p.vixPct):null,p.vix!=null?(p.vix>25?C.red:p.vix<16?C.green:C.text):C.text),
      pulseCard("Dominance BTC",p.btcDominance!=null?p.btcDominance.toFixed(1)+"%":"—",null,C.btc)
    ),
    React.createElement("div",null,
      React.createElement("div",{style:{fontSize:9,color:C.text3,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}},"Taux souverains US"),
      React.createElement("div",{style:{display:"flex",gap:8}},
        treas.map(function(t){
          return React.createElement("div",{key:t.symbol,style:{flex:1,background:C.bg1,border:"1px solid "+C.border,borderRadius:10,padding:"8px 10px",textAlign:"center"}},
            React.createElement("div",{style:{fontSize:9,color:C.text3}},t.label),
            React.createElement("div",{style:{fontSize:16,fontWeight:600,color:C.text,marginTop:2}},t.price!=null?t.price.toFixed(2)+"%":"—"),
            React.createElement("div",{style:{fontSize:9,color:cgiPctColor(t.pct),marginTop:1}},t.pct!=null?cgiPctFmt(t.pct):"")
          );
        })
      )
    ),
    React.createElement("div",null,
      React.createElement("div",{style:{fontSize:9,color:C.text3,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}},"Secteurs S&P 500 — jour"),
      React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:5}},
        sectors.map(function(s){
          var w=Math.min(50,Math.abs(s.pct||0)/maxAbs*50);
          return React.createElement("div",{key:s.symbol,style:{display:"flex",alignItems:"center",gap:8}},
            React.createElement("span",{style:{fontSize:11,color:C.text,width:96,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},s.name),
            React.createElement("div",{style:{flex:1,height:14,position:"relative",background:C.bg1,borderRadius:4,overflow:"hidden"}},
              React.createElement("div",{style:{position:"absolute",top:0,bottom:0,left:"50%",width:(s.pct>=0?w:0)+"%",background:C.green+"99"}}),
              React.createElement("div",{style:{position:"absolute",top:0,bottom:0,right:"50%",width:(s.pct<0?w:0)+"%",background:C.red+"99"}})
            ),
            React.createElement("span",{style:{fontSize:11,fontWeight:700,color:cgiPctColor(s.pct),width:56,textAlign:"right",flexShrink:0}},cgiPctFmt(s.pct))
          );
        })
      )
    ),
    React.createElement("div",{style:{fontSize:8,color:C.text3,textAlign:"right"}},"Yahoo + CoinGecko · maj "+(mkt.ts?new Date(mkt.ts).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}):"—"))
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CGI — CongressView : trades du Congrès (backend /market/congress)
// ══════════════════════════════════════════════════════════════════════════════
function CongressView(){
  const[cong,setCong]=useState(null);const[congL,setCongL]=useState(false);const[congE,setCongE]=useState(null);
  const[congView,setCongView]=useState("trades");const[congOpen,setCongOpen]=useState({});
  function load(nc){ setCongL(true);setCongE(null);
    fetch(CF_WORKER_URL+"/market/congress"+(nc?"?no_cache=1":""),{headers:{"X-Auth-Key":CF_AUTH_KEY},signal:AbortSignal.timeout(30000)})
      .then(function(r){return r.json();}).then(function(d){ if(d&&d.error)setCongE(String(d.error)); else setCong(d); setCongL(false); })
      .catch(function(e){ setCongE((e&&e.message)||"Erreur réseau"); setCongL(false); }); }
  useEffect(function(){ load(false); },[]);
  if(congL&&!cong) return React.createElement("div",{style:{textAlign:"center",color:C.text3,fontSize:12,padding:"24px 0"}},"Chargement…");
  if(congE&&!cong) return React.createElement("div",{style:{background:C.red+"11",border:"1px solid "+C.red+"44",borderRadius:10,padding:12,color:C.red,fontSize:12}},"Erreur : "+congE,React.createElement("button",{onClick:function(){load(true);},style:{marginLeft:8,background:"none",border:"1px solid "+C.red+"66",borderRadius:6,color:C.red,fontSize:11,padding:"2px 8px",cursor:"pointer"}},"Réessayer"));
  if(!cong) return null;
  var members=cong.members||[];
  var toggle=function(i){ setCongOpen(function(p){ var n=Object.assign({},p); n[i]=!p[i]; return n; }); };
  var moneyC=function(v){ return v>=1e6?"$"+(v/1e6).toFixed(1)+" M":(v>=1e3?"$"+Math.round(v/1e3)+" k":"$"+Math.round(v)); };
  var pc=function(p){ return p==="D"?"#4aa3ff":(p==="R"?"#e5484d":C.text3); };
  var sideCol=function(s){ return s==="buy"?C.green:(s==="sell"?C.red:C.text3); };
  var sideSym=function(s){ return s==="buy"?"▲":(s==="sell"?"▼":(s==="exch"?"⇄":"•")); };
  var amtC=function(t){ if(t.amountMid!=null){ var v=t.amountMid; return v>=1e6?"$"+(v/1e6).toFixed(1)+" M":(v>=1e3?"$"+Math.round(v/1e3)+" k":"$"+v); } return t.amount||""; };
  return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:9}},
    React.createElement("div",{style:{display:"flex",gap:6,background:C.bg2,borderRadius:9,padding:3}},
      [["trades","Trades"],["port","Portefeuille est."]].map(function(v){
        return React.createElement("button",{key:v[0],onClick:function(){setCongView(v[0]);},style:{flex:1,padding:"6px 0",borderRadius:7,fontSize:11,fontWeight:700,border:"none",cursor:"pointer",background:congView===v[0]?C.btc:"transparent",color:congView===v[0]?"#000":C.gray}},v[1]);
      })
    ),
    React.createElement("div",{style:{fontSize:9,color:C.text3,lineHeight:1.5,marginBottom:2}},congView==="port"?"Portefeuille estimé = net cumulé (achats − ventes) par titre, en $ médians des fourchettes. Estimation indicative.":"Trades déclarés (STOCK Act) — source : House Stock Watcher (Chambre)."),
    members.map(function(m,mi){
      var open=!!congOpen[mi]; var tr=m.trades||[];
      return React.createElement("div",{key:m.label+mi,style:{background:C.bg1,border:"1px solid "+C.border,borderRadius:10,overflow:"hidden",opacity:m.n===0?0.55:1}},
        React.createElement("div",{onClick:function(){ if(m.n>0) toggle(mi); },style:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,padding:"10px 12px",cursor:m.n>0?"pointer":"default"}},
          React.createElement("div",{style:{display:"flex",alignItems:"center",gap:7,minWidth:0}},
            React.createElement("span",{style:{fontSize:9,fontWeight:600,color:pc(m.party),border:"1px solid "+pc(m.party)+"66",borderRadius:4,padding:"1px 4px",flexShrink:0}},m.party),
            React.createElement("span",{style:{fontSize:12,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},m.label)
          ),
          React.createElement("span",{style:{fontSize:9,color:C.text3,flexShrink:0,textAlign:"right"}},m.n===0?"aucun trade":(congView==="port"?((m.portfolio||[]).length+" pos. · ~"+moneyC(m.portTotal||0)):(m.n+" trades · "+(m.last||""))))
        ),
        open&&m.n>0&&React.createElement("div",{style:{borderTop:"1px solid "+C.border,padding:"4px 10px 8px"}},
          congView==="port"
            ? ((m.portfolio||[]).length===0
                ? React.createElement("span",{style:{fontSize:10,color:C.text3}},"Portefeuille estimé indisponible (que des ventes ou tickers inconnus).")
                : (m.portfolio||[]).map(function(h,hi){ var pf=m.portfolio;
                    return React.createElement("div",{key:hi,style:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,padding:"6px 2px",borderBottom:hi<pf.length-1?"1px solid "+C.border+"66":"none"}},
                      React.createElement("div",{style:{display:"flex",alignItems:"baseline",gap:6,minWidth:0}},
                        React.createElement("span",{style:{fontSize:10,fontWeight:700,color:C.btc,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:120}},h.ticker),
                        React.createElement("span",{style:{fontSize:8,color:C.text3}},h.n+" op.")
                      ),
                      React.createElement("div",{style:{display:"flex",gap:10,alignItems:"baseline",flexShrink:0}},
                        React.createElement("span",{style:{fontSize:10,fontWeight:600,color:C.text}},h.weight!=null?h.weight.toFixed(1)+"%":"—"),
                        React.createElement("span",{style:{fontSize:9,color:C.text3,minWidth:52,textAlign:"right"}},moneyC(h.net))
                      )
                    );
                  }))
            : tr.map(function(t,ti){
                return React.createElement("div",{key:ti,style:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,padding:"6px 2px",borderBottom:ti<tr.length-1?"1px solid "+C.border+"66":"none"}},
                  React.createElement("div",{style:{display:"flex",alignItems:"baseline",gap:6,minWidth:0}},
                    React.createElement("span",{style:{fontSize:11,fontWeight:600,color:sideCol(t.side),flexShrink:0}},sideSym(t.side)),
                    React.createElement("span",{style:{fontSize:10,fontWeight:700,color:t.ticker?C.btc:C.text2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:150}},t.ticker||t.asset)
                  ),
                  React.createElement("div",{style:{display:"flex",gap:10,alignItems:"baseline",flexShrink:0}},
                    React.createElement("span",{style:{fontSize:9,color:C.text2}},amtC(t)),
                    React.createElement("span",{style:{fontSize:8,color:C.text3,minWidth:62,textAlign:"right"}},t.date)
                  )
                );
              })
        )
      );
    }),
    React.createElement("div",{style:{fontSize:8,color:C.text3,textAlign:"right"}},"House Stock Watcher · maj "+(cong.ts?new Date(cong.ts).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}):"—"))
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CGI — FlowMap : rotation des capitaux par momentum (backend /market/flows)
// ══════════════════════════════════════════════════════════════════════════════
function FlowMap(){
  const[fl,setFl]=useState(null);const[flL,setFlL]=useState(false);const[flE,setFlE]=useState(null);const[hz,setHz]=useState("m1");
  function load(nc){ setFlL(true);setFlE(null);
    fetch(CF_WORKER_URL+"/market/flows"+(nc?"?no_cache=1":""),{headers:{"X-Auth-Key":CF_AUTH_KEY},signal:AbortSignal.timeout(30000)})
      .then(function(r){return r.json();}).then(function(d){ if(d&&d.error)setFlE(String(d.error)); else setFl(d); setFlL(false); })
      .catch(function(e){ setFlE((e&&e.message)||"Erreur réseau"); setFlL(false); }); }
  useEffect(function(){ load(false); },[]);
  if(flL&&!fl) return React.createElement("div",{style:{textAlign:"center",color:C.text3,fontSize:12,padding:"24px 0"}},"Chargement…");
  if(flE&&!fl) return React.createElement("div",{style:{background:C.red+"11",border:"1px solid "+C.red+"44",borderRadius:10,padding:12,color:C.red,fontSize:12}},"Erreur : "+flE,React.createElement("button",{onClick:function(){load(true);},style:{marginLeft:8,background:"none",border:"1px solid "+C.red+"66",borderRadius:6,color:C.red,fontSize:11,padding:"2px 8px",cursor:"pointer"}},"Réessayer"));
  if(!fl) return null;
  var items=(fl.classes||[]).filter(function(c){ return c.perf && c.perf[hz]!=null; }).slice();
  items.sort(function(a,b){ return (b.perf[hz]||0)-(a.perf[hz]||0); });
  var pCol=function(p){ return p==null?C.text3:(p>=0?C.green:C.red); };
  var pFmt=function(p){ return p==null?"—":(p>=0?"+":"")+p.toFixed(1)+"%"; };
  var maxAbs=Math.max.apply(null,items.map(function(c){return Math.abs(c.perf[hz]||0);}).concat([1]));
  var inflow=items.slice(0,2).map(function(c){return c.name;});
  var outflow=items.slice(-2).map(function(c){return c.name;}).reverse();
  var hzLabel={w1:"1 semaine",m1:"1 mois",m3:"3 mois"}[hz];
  return React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:14}},
    React.createElement("div",{style:{background:C.bg1,border:"1px solid "+C.border,borderRadius:12,padding:"12px 14px"}},
      React.createElement("div",{style:{fontSize:9,color:C.text3,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}},"Où va l'argent ("+hzLabel+")"),
      React.createElement("div",{style:{fontSize:13,color:C.text,lineHeight:1.6}},
        "Entrées vers ",React.createElement("span",{style:{color:C.green,fontWeight:700}},inflow.join(" & ")),
        " — sorties de ",React.createElement("span",{style:{color:C.red,fontWeight:700}},outflow.join(" & ")),"."
      )
    ),
    React.createElement("div",{style:{display:"flex",gap:6,background:C.bg2,borderRadius:9,padding:3}},
      [["w1","1 sem"],["m1","1 mois"],["m3","3 mois"]].map(function(h){
        return React.createElement("button",{key:h[0],onClick:function(){setHz(h[0]);},style:{flex:1,padding:"6px 0",borderRadius:7,fontSize:11,fontWeight:700,border:"none",cursor:"pointer",background:hz===h[0]?C.btc:"transparent",color:hz===h[0]?"#000":C.gray}},h[1]);
      })
    ),
    React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:6}},
      items.map(function(c){
        var v=c.perf[hz]; var w=Math.min(48,Math.abs(v||0)/maxAbs*48);
        return React.createElement("div",{key:c.symbol,style:{display:"flex",alignItems:"center",gap:8}},
          React.createElement("span",{style:{fontSize:15,width:22,textAlign:"center",flexShrink:0}},c.emoji),
          React.createElement("span",{style:{fontSize:12,color:C.text,width:96,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},c.name),
          React.createElement("div",{style:{flex:1,height:16,position:"relative",background:C.bg1,borderRadius:4,overflow:"hidden"}},
            React.createElement("div",{style:{position:"absolute",top:0,bottom:0,left:"50%",width:(v>=0?w:0)+"%",background:C.green+"aa"}}),
            React.createElement("div",{style:{position:"absolute",top:0,bottom:0,right:"50%",width:(v<0?w:0)+"%",background:C.red+"aa"}}),
            React.createElement("div",{style:{position:"absolute",top:0,bottom:0,left:"50%",width:1,background:C.border}})
          ),
          React.createElement("span",{style:{fontSize:12,fontWeight:700,color:pCol(v),width:56,textAlign:"right",flexShrink:0}},pFmt(v))
        );
      })
    ),
    React.createElement("div",{style:{fontSize:9,color:C.text3,lineHeight:1.5}},"Momentum relatif (perf. des proxies de classes d'actifs), pas des flux de capitaux réels. Indicatif."),
    React.createElement("div",{style:{fontSize:8,color:C.text3,textAlign:"right"}},"Yahoo · maj "+(fl.ts?new Date(fl.ts).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}):"—"))
  );
}

// CGI — MarketDash : conteneur à onglets du dashboard marché
// ══════════════════════════════════════════════════════════════════════════════
function MarketDash(){
  const[tab,setTab]=useState("macro");
  var tabs=[["macro","🌐 Macro"],["btc","₿ Indicateurs"],["movers","📈 Top/Flop"],["funding","💸 Funding"],["flows","🌍 Flux"]];
  return React.createElement("div",null,
    React.createElement("div",{style:{display:"flex",gap:6,marginBottom:14,overflowX:"auto",paddingBottom:2}},
      tabs.map(function(t){
        return React.createElement("button",{key:t[0],onClick:function(){setTab(t[0]);},
          style:{background:tab===t[0]?C.btc:C.bg1,color:tab===t[0]?"#000":C.text2,border:"1px solid "+(tab===t[0]?C.btc:C.border),borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}},t[1]);
      })
    ),
    tab==="macro"&&React.createElement(MacroView,null),
    tab==="btc"&&React.createElement(BtcIndicators,null),
    tab==="movers"&&React.createElement(MoversView,null),
    tab==="funding"&&React.createElement(FundingView,null),
    tab==="flows"&&React.createElement(FlowMap,null)
  );
}

function PageWatchlist({ EFF, hidden }){
  var cardBg=C.bg2, borderC=C.border, textC=C.text, grayC=C.gray;
  var greenC=C.green, redC=C.red, blueC=C.blue, orangeC=C.btc;
  var bgC=C.bg||"#07080D";

  const[list,setList]         = useState([]);
  const[prices,setPrices]     = useState({});
  const[loading,setLoading]   = useState(false);
  const[modal,setModal]       = useState(null);   // null|"add"|entry
  const[editForm,setEditForm] = useState({});
  const[expanded,setExpanded] = useState({});
  const[filter,setFilter]     = useState("all");  // all|fav|alerte
  const[showSearch,setShowSearch] = useState(false);
  const[saving,setSaving]     = useState(false);
  const[newsPanel,setNewsPanel]= useState(false);
  const[news,setNews]         = useState([]);
  const[newsLoading,setNewsLoading]=useState(false);
  const[condLib,setCondLib]   = useState([]);    // v4.0 biblio "personnalisée"
  const[iconTick,setIconTick] = useState(0);     // v4.0 LOT2 — rafraîchit les logos
  const[showChart,setShowChart]=useState(false); // v4.0 LOT4 — graphique dans le modal
  const[showTools,setShowTools]=useState(false);  // v4.7 — menu Outils (News/Tech/Indicateurs)
  const[showIndic,setShowIndic]=useState(false);  // v4.7 — feuille indicateurs BTC
  const[pickMode,setPickMode] =useState(null);   // "low"|"high"|"sell"|null
  // v4.0 LOT2 — backfill best-effort des logos manquants (1× par session)
  useEffect(function(){
    var missing=(list||[]).map(function(e){return e.ticker;})
      .filter(function(tk){ var db=(typeof ICON_DB!=="undefined")?(ICON_DB[tk]||{}):{}; return tk&&!db.fmp&&!db.user; });
    missing=missing.filter(function(v,i,a){return a.indexOf(v)===i;}).slice(0,12);
    if(!missing.length) return;
    var done=0;
    missing.forEach(function(tk){
      var sym=(typeof YF_MAP!=="undefined"&&YF_MAP[tk])?YF_MAP[tk]:tk;
      fetch(CF_WORKER_URL+"/yahoo-chart?symbol="+encodeURIComponent(sym)+"&interval=1d&range=5d",
        {headers:{"X-Auth-Key":CF_AUTH_KEY},signal:AbortSignal.timeout(12000)})
        .then(function(r){return r.json();})
        .then(function(d){ if(d&&d.logoUrl&&typeof setIconDb!=="undefined"){ setIconDb(tk,{fmp:d.logoUrl}); done++; } })
        .catch(function(){})
        .finally(function(){ if(done){ setIconTick(function(x){return x+1;}); try{ fetch(CF_WORKER_URL+"/write-bases",{method:"POST",headers:{"Content-Type":"application/json","X-Auth-Key":CF_AUTH_KEY},body:JSON.stringify({cgi_icons:serializeIconDb()}),signal:AbortSignal.timeout(10000)}); }catch(e){} } });
    });
  },[list.length]);
  const[techMsg,setTechMsg]   = useState("");     // v4.0 retour bouton Tech
  const[techBusy,setTechBusy] = useState(false);
  useEffect(function(){ setCondLib(cgiCondLibLoad()); },[]);

  // ── Chargement ─────────────────────────────────────────────────────────────
  // v3.02 — clé localStorage dédiée (hors cgi_v1 pour éviter quota exceeded)
  var WL_LS_KEY = 'cgi_watchlist_direct';
  // ── TickerAvatar : logo circulaire (lettre + couleur par catégorie) ──────
  function TickerAvatar(e, price){
    var cat=e.cat||"Picking";
    var colors={Crypto:orangeC,Indices:blueC,Picking:C.teal||"#14B8A6",Or:C.gold||"#F59E0B","Cash Dip":grayC,"Cash Matelas":grayC};
    var bg=colors[cat]||blueC;
    var db=(typeof ICON_DB!=="undefined")?(ICON_DB[e.ticker]||{}):{};
    // v4.0 LOT2 — vrai logo si dispo (ICON_DB), sinon avatar initiales/symbole
    if(db.fmp||db.user){
      return React.createElement("div",{style:{width:40,height:40,borderRadius:"50%",overflow:"hidden",flexShrink:0,
        border:"2px solid "+bg+"66",background:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}},
        React.createElement(TickerIcon,{ticker:e.ticker,size:40,iconDbVersion:iconTick}));
    }
    var letters=(e.ticker||"?").slice(0,2).toUpperCase();
    var symbols={BTC:"₿",ETH:"Ξ",SOL:"◎",BNB:"⬡",ADA:"₳",XRP:"✕",DOGE:"Ð",IBIT:"₿"};
    var sym=symbols[e.ticker]||letters;
    return React.createElement("div",{style:{
      width:40,height:40,borderRadius:"50%",background:bg+"22",
      border:"2px solid "+bg,display:"flex",alignItems:"center",
      justifyContent:"center",flexShrink:0,fontSize:sym.length>1?13:18,
      fontWeight:700,color:bg,userSelect:"none"
    }},sym);
  }
  function wlMigrate(arr){ return (Array.isArray(arr)?arr:[]).map(cgiMigrateEntryConds); } // v4.0
  function wlLoad(){ try{ var r=JSON.parse(localStorage.getItem(WL_LS_KEY)||'[]'); return wlMigrate(r); }catch(e){return[];} }
  function wlSave(nl){ try{ localStorage.setItem(WL_LS_KEY,JSON.stringify(nl)); }catch(e){ console.warn('[wl] localStorage save failed:',e.message); } }

  useEffect(function(){
    // 1. Affichage immédiat depuis le localStorage dédié
    var stored = wlLoad();
    if(stored.length){ setList(stored); }
    else { var v9stored = lsv9Get('cgi_watchlist'); if(v9stored&&Array.isArray(v9stored)&&v9stored.length){ var m9=wlMigrate(v9stored); setList(m9); wlSave(m9); } }
    // 2. Réconciliation systématique avec le KV (source partagée entre appareils)
    fetch(CF_WORKER_URL+"/read",{headers:{"X-Auth-Key":CF_AUTH_KEY},signal:AbortSignal.timeout(18000)})
      .then(function(r){return r.json();})
      .then(function(d){ if(d.cgi_watchlist&&Array.isArray(d.cgi_watchlist)&&d.cgi_watchlist.length){ var mk=wlMigrate(d.cgi_watchlist); setList(mk); wlSave(mk); } })
      .catch(function(){});
  },[]);

  // ── Prix live ─────────────────────────────────────────────────────────────
  useEffect(function(){
    if(!list.length) return;
    setLoading(true);
    Promise.all(list.map(function(e){
      var sym=YF_MAP[e.ticker]||e.ticker;
      return fetchYahooCFmulti(e.ticker,sym).then(function(p){return[e.ticker,p];}).catch(function(){return[e.ticker,null];});
    })).then(function(res){
      var pm={}; res.forEach(function(r){if(r[1]!=null)pm[r[0]]=r[1];}); setPrices(pm); checkPriceAlerts(pm); setLoading(false);
    });
  },[list.length]);

  // ── Persist ───────────────────────────────────────────────────────────────
  function persist(nl){
    setList(nl);
    wlSave(nl);                         // localStorage dédié (sync, fiable)
    setSaving(true);
    var r=saveBase('cgi_watchlist',nl); // KV async (best-effort)
    if(r&&typeof r.then==='function') r.then(function(){setSaving(false);}); else setSaving(false);
  }

  function refreshPrices(){
    setLoading(true);
    Promise.all(list.map(function(e){
      var sym=YF_MAP[e.ticker]||e.ticker;
      return fetchYahooCFmulti(e.ticker,sym).then(function(p){return[e.ticker,p];}).catch(function(){return[e.ticker,null];});
    })).then(function(res){
      var pm={}; res.forEach(function(r){if(r[1]!=null)pm[r[0]]=r[1];}); setPrices(pm); checkPriceAlerts(pm); setLoading(false);
    });
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  // v4.0 P2 — alertes de prix → notifications (dédupliquées par jour)
  function checkPriceAlerts(pm){
    var today=new Date().toISOString().slice(0,10);
    list.forEach(function(e){
      var p=pm[e.ticker]; if(p==null) return;
      var fmtp="$"+p.toLocaleString("fr-FR",{maximumFractionDigits:2});
      var ab=(e.alertBuy!=null)?e.alertBuy:((e.alertBelow!=null)?e.alertBelow:null);
      if(ab!=null && p<=ab){
        cgiNotifPush({type:"alert",emoji:"🔻",dedupeKey:"alertbuy_"+e.ticker+"_"+today,
          title:e.ticker+" sous l'alerte achat", body:fmtp+" ≤ $"+ab});
      }
      if(e.alertSell!=null && p>=e.alertSell){
        cgiNotifPush({type:"alert",emoji:"🔺",dedupeKey:"alertsell_"+e.ticker+"_"+today,
          title:e.ticker+" au-dessus de l'alerte vente", body:fmtp+" ≥ $"+e.alertSell});
      }
    });
  }
  function getScore(e){ return (e.conditions||[]).filter(function(c){return c.validated;}).length; }
  function scoreEmoji(s,total){
    if(total===0) return "";
    if(s===0) return "❄️";
    if(s===total) return "🚀";
    if(s>=3) return "🔥🔥";
    if(s>=1) return "🔥";
    return "❄️";
  }

  // ── Toggle condition validée ──────────────────────────────────────────────
  function toggleCondition(entryId,condId){
    persist(list.map(function(e){
      if(e.id!==entryId) return e;
      var conds=(e.conditions||[]).map(function(c){
        return c.id===condId?{...c,validated:!c.validated}:c;
      });
      return {...e,conditions:conds,score:conds.filter(function(c){return c.validated;}).length};
    }));
  }

  function toggleFav(id){
    persist(list.map(function(x){return x.id===id?{...x,fav:!x.fav}:x;}));
  }
  function deleteEntry(id){
    if(!window.confirm("Supprimer ?")) return;
    persist(list.filter(function(x){return x.id!==id;}));
  }
  function toggleExpanded(id){
    setExpanded(function(p){var n={...p};n[id]=!n[id];return n;});
  }

  // ── Analyse IA : une news valide-t-elle des conditions ? ─────────────────
  async function analyzeNewsConditions(ticker, newsItems, conditions){
    // v4.0 : seules les conditions "news" (fondamentales/perso) passent à l'IA — les techniques sont validées via Yahoo
    var conds=conditions.filter(function(c){return c.text&&c.text.trim()&&c.kind!=="price";});
    if(!conds.length||!newsItems.length) return {};
    var newsLetters="ABCDEFGHIJ";
    var newsLines=newsItems.map(function(n,i){return "["+newsLetters[i]+"] "+n.title;}).join("\n");
    var catLabel={technique:"[Technique]",fondamentale:"[Fondamentale]",perso:"[Perso]"};
    var condLines=conds.map(function(c,i){return (i+1)+". "+(catLabel[c.cat]||"")+" "+c.text;}).join("\n");
    var prompt="Tu es un analyste financier expert. Ticker: "+ticker+"\n\n"+
      "Conditions d'investissement à valider:\n"+condLines+"\n\n"+
      "News récentes:\n"+newsLines+"\n\n"+
      "Pour chaque news [A],[B],[C]... indique quelles conditions (numéros 1,2,3...) elle valide ou supporte directement.\n"+
      "RÉPONDS UNIQUEMENT en JSON compact, ex: {\"A\":[1,3],\"B\":[],\"C\":[2]}";
    try{
      var resp=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:300,
          messages:[{role:"user",content:prompt}]
        })
      });
      var d=await resp.json();
      var text=(d.content&&d.content[0]&&d.content[0].text)||"{}";
      var clean=text.replace(/```json|```/g,"").trim();
      var result=JSON.parse(clean);
      // Mapper lettre → condition IDs
      var out={};
      newsItems.forEach(function(n,i){
        var letter=newsLetters[i];
        var condNums=result[letter]||[];
        out[i]=condNums.map(function(num){return conds[num-1]&&conds[num-1].id;}).filter(Boolean);
      });
      return out; // { newsIndex → [conditionId, ...] }
    }catch(e){
      console.warn("[watchlist] AI analysis failed:",e.message);
      return {};
    }
  }

  // ── Fetch news + analyse IA des conditions ────────────────────────────────
  function fetchNews(){
    setNewsLoading(true); setNewsPanel(true);
    var portTickers=[];
    var src=EFF||{};
    if(src.stocks&&src.stocks.items) portTickers=src.stocks.items.filter(function(x){return x.cat!=="Cash"&&x.cat!=="Cash Matelas";}).map(function(x){return x.t;});
    if(src.crypto&&src.crypto.items) portTickers=portTickers.concat(src.crypto.items.map(function(x){return x.t;}));
    var wlFavs=list.filter(function(e){return e.fav;}).map(function(e){return e.ticker;});
    var wlAll=list.map(function(e){return e.ticker;});
    var allTickers=[...new Set([...wlFavs,...portTickers,...wlAll])].slice(0,10);

    Promise.all(allTickers.map(function(t){
      var sym=YF_MAP[t]||t;
      return fetch(CF_WORKER_URL+"/yahoo-chart?symbol="+encodeURIComponent(sym)+"&interval=1d&range=5d&no_logo=1",{
        headers:{"X-Auth-Key":CF_AUTH_KEY},signal:AbortSignal.timeout(12000)
      }).then(function(r){return r.json();})
        .then(function(d){return{ticker:t,news:(d.news||[]).slice(0,5)};})
        .catch(function(){return{ticker:t,news:[]};});
    })).then(async function(results){
      // ── Analyse IA pour les tickers favoris avec des conditions ────────────
      var updatedList=[...list];
      var analysisMap={}; // ticker → { newsIndex → [condIds] }

      var favResults=results.filter(function(r){
        var e=list.find(function(x){return x.ticker===r.ticker&&x.fav;});
        return e&&(e.conditions||[]).some(function(c){return c.text;})&&r.news.length>0;
      });

      await Promise.all(favResults.map(async function(r){
        var entry=list.find(function(x){return x.ticker===r.ticker;});
        if(!entry) return;
        var aiResult=await analyzeNewsConditions(r.ticker,r.news,entry.conditions||[]);
        analysisMap[r.ticker]=aiResult;
        // Auto-valider les conditions détectées
        var conditionsUpdated=false;
        var newConds=(entry.conditions||[]).map(function(c){
          var wasValidated=Object.values(aiResult).some(function(condIds){return condIds.indexOf(c.id)>=0;});
          if(wasValidated&&!c.validated){
            conditionsUpdated=true;
            // Trouver la news source
            var sourceIdx=Object.keys(aiResult).find(function(k){return (aiResult[k]||[]).indexOf(c.id)>=0;});
            var sourceNews=sourceIdx!=null?r.news[parseInt(sourceIdx)]:null;
            cgiNotifPush({type:"ai",emoji:"🤖",telegram:true,
              dedupeKey:"ai_"+entry.ticker+"_"+c.id,
              title:entry.ticker+" — condition validée par l'IA",
              body:c.text+(sourceNews?("\n↗ "+sourceNews.title):"")});
            return {...c,validated:true,autoValidated:true,
              validatedBy:sourceNews?{title:sourceNews.title,url:sourceNews.url,time:sourceNews.time}:null};
          }
          return c;
        });
        if(conditionsUpdated){
          var newScore=newConds.filter(function(c){return c.validated;}).length;
          updatedList=updatedList.map(function(x){
            return x.id===entry.id?{...x,conditions:newConds,score:newScore}:x;
          });
        }
      }));

      // Persister si des conditions ont été auto-validées
      if(updatedList!==list){
        persist(updatedList);
      }

      // ── Construire la liste de news enrichie ───────────────────────────────
      var flat=[];
      results.forEach(function(r){
        var entry=list.find(function(e){return e.ticker===r.ticker;});
        var isFav=!!(entry&&entry.fav);
        var score=entry?getScore(entry):0;
        var tickerAnalysis=analysisMap[r.ticker]||{};
        r.news.forEach(function(n,ni){
          var validatedCondIds=tickerAnalysis[ni]||[];
          var validatedTexts=[];
          if(entry&&validatedCondIds.length){
            validatedTexts=(entry.conditions||[])
              .filter(function(c){return validatedCondIds.indexOf(c.id)>=0;})
              .map(function(c){return c.text;});
          }
          flat.push({...n,ticker:r.ticker,isFav:isFav,score:score,
            validatedConditions:validatedTexts,hasAiValidation:validatedTexts.length>0});
        });
      });

      flat.sort(function(a,b){
        var favDiff=(b.isFav?1:0)-(a.isFav?1:0);
        if(favDiff!==0) return favDiff;
        var aiDiff=(b.hasAiValidation?1:0)-(a.hasAiValidation?1:0);
        if(aiDiff!==0) return aiDiff;
        var sdiff=b.score-a.score;
        if(sdiff!==0) return sdiff;
        return (b.time||0)-(a.time||0);
      });
      setNews(flat); setNewsLoading(false);
    });
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function blankConds(n){ var a=[]; for(var i=0;i<n;i++) a.push(cgiMigrateCond({})); return a; }
  function openAdd(){
    setEditForm({ticker:"",name:"",cat:"Picking",fav:false,description:"",domain:"Tech",
      buyZoneLow:"",buyZoneHigh:"",alertBuy:"",alertSell:"",
      sellTargets:[{price:"",note:""}],
      conditions:blankConds(3),
      risks:""});
    setModal("add");
  }
  function openEdit(e){
    var st=(e.sellTargets&&e.sellTargets.length)?e.sellTargets:[{price:"",note:""}];
    var conds=(e.conditions&&e.conditions.length)?e.conditions.map(cgiMigrateCond):blankConds(3);
    setEditForm({...e,
      buyZoneLow:(e.buyZone&&e.buyZone.low)||"",buyZoneHigh:(e.buyZone&&e.buyZone.high)||"",
      sellTargets:st,conditions:conds});
    setModal("edit");
  }
  function closeModal(){setModal(null);setEditForm({});}

  // v4.0 — patch d'une condition + recalcul kind/libellé
  function updateCondField(idx,patch){
    setEditForm(function(p){
      var conds=[...(p.conditions||[])];
      var c={...conds[idx],...patch};
      if(patch.params) c.params={...(conds[idx].params||{}),...patch.params};
      c.kind=(c.cat==="technique" && c.templateId) ? "price" : "news";
      if(c.cat==="technique" && c.templateId) c.text=cgiCondText(c);
      conds[idx]=c;
      return {...p,conditions:conds};
    });
  }
  function setCondCat(idx,cat){
    setEditForm(function(p){
      var conds=[...(p.conditions||[])];
      var c={...conds[idx],cat:cat};
      if(cat==="technique"){ c.templateId="mm"; c.params={period:50,unit:"D",sens:"above"}; c.kind="price"; c.text=cgiCondText(c); }
      else { c.templateId=null; c.params=null; c.kind="news"; }
      conds[idx]=c;
      return {...p,conditions:conds};
    });
  }
  function setCondTemplate(idx,tid){
    var defaults={ mm:{period:50,unit:"D",sens:"above"}, rsi:{unit:"D",seuil:30,sens:"below"},
      ath:{unit:"D"}, support:{unit:"D",level:""}, resistance:{unit:"D",level:""},
      macd:{unit:"D"}, volume:{unit:"D"}, divergence:{unit:"D"} };
    setEditForm(function(p){
      var conds=[...(p.conditions||[])];
      var c={...conds[idx],templateId:tid,params:{...(defaults[tid]||{unit:"D"})}};
      c.kind="price"; c.text=cgiCondText(c);
      conds[idx]=c;
      return {...p,conditions:conds};
    });
  }
  function setCondText(idx,txt){ updateCondField(idx,{text:txt}); }
  function updateCond(idx,field,val){ updateCondField(idx,{[field]:val}); }
  function addCond(){
    setEditForm(function(p){
      var conds=[...(p.conditions||[])];
      if(conds.length>=6) return p;
      conds.push(cgiMigrateCond({}));
      return{...p,conditions:conds};
    });
  }
  function removeCond(idx){
    setEditForm(function(p){var c=[...(p.conditions||[])];c.splice(idx,1);return{...p,conditions:c};});
  }

  // ── v4.0 — Validation technique via bougies Yahoo ──────────────────────────
  async function fetchCandlesUnit(symbol, unit){
    var interval=COND_TF_INTERVAL[unit]||"1d";
    var range=COND_TF_RANGE[unit]||"2y";
    try{
      var r=await fetch(CF_WORKER_URL+"/yahoo-chart?symbol="+encodeURIComponent(symbol)+"&interval="+interval+"&range="+range+"&no_logo=1",
        {headers:{"X-Auth-Key":CF_AUTH_KEY},signal:AbortSignal.timeout(15000)});
      var d=await r.json();
      var candles=Array.isArray(d.candles)?d.candles:[];
      if(unit==="4H") candles=cgiAgg4h(candles);
      return candles;
    }catch(e){ return []; }
  }
  async function verifyTechnicalEntry(entry){
    var techConds=(entry.conditions||[]).filter(function(c){return c.kind==="price"&&c.templateId&&c.templateId!=="divergence";});
    if(!techConds.length) return {entry:entry,checked:0,validated:0};
    var units=[...new Set(techConds.map(function(c){return (c.params&&c.params.unit)||"D";}))];
    var sym=YF_MAP[entry.ticker]||entry.ticker;
    var seriesByUnit={};
    await Promise.all(units.map(async function(u){ seriesByUnit[u]=await fetchCandlesUnit(sym,u); }));
    var validated=0, checked=0;
    var newConds=(entry.conditions||[]).map(function(c){
      if(c.kind!=="price"||!c.templateId||c.templateId==="divergence") return c;
      var res=cgiEvalTechnical(c,seriesByUnit);
      if(res==null) return c;
      checked++;
      if(res.ok){ validated++;
        if(!c.validated){ cgiNotifPush({type:"tech",emoji:"📈",telegram:true,
          dedupeKey:"tech_"+entry.ticker+"_"+c.id+"_"+new Date().toISOString().slice(0,10),
          title:entry.ticker+" — condition technique validée",
          body:c.text+"\n"+res.detail}); }
        return {...c,validated:true,autoValidated:true,validatedBy:{type:"technique",detail:res.detail,time:Date.now()}};
      }
      if(c.autoValidated && c.validatedBy && c.validatedBy.type==="technique"){ return {...c,validated:false,autoValidated:false,validatedBy:null}; }
      return c;
    });
    return {entry:{...entry,conditions:newConds,score:newConds.filter(function(c){return c.validated;}).length},checked:checked,validated:validated};
  }
  async function verifyTechnicalAll(){
    var targets=list.filter(function(e){return (e.conditions||[]).some(function(c){return c.kind==="price"&&c.templateId&&c.templateId!=="divergence";});});
    if(!targets.length){ setTechMsg("Aucune condition technique à vérifier."); setTimeout(function(){setTechMsg("");},3000); return; }
    setTechBusy(true); setTechMsg("📈 Analyse technique en cours…");
    var totV=0, totC=0, updated=[...list];
    for(var i=0;i<targets.length;i++){
      var r=await verifyTechnicalEntry(targets[i]);
      totV+=r.validated; totC+=r.checked;
      updated=updated.map(function(x){return x.id===r.entry.id?r.entry:x;});
    }
    persist(updated);
    setTechBusy(false);
    setTechMsg("✓ "+totV+"/"+totC+" condition(s) technique(s) validée(s)");
    setTimeout(function(){setTechMsg("");},5000);
  }
  function updateSell(idx,field,val){
    setEditForm(function(p){
      var st=[...(p.sellTargets||[])];st[idx]={...st[idx],[field]:val};return{...p,sellTargets:st};
    });
  }
  function addSell(){
    setEditForm(function(p){
      var st=[...(p.sellTargets||[])];
      if(st.length>=4) return p;
      st.push({price:"",note:""});return{...p,sellTargets:st};
    });
  }
  function removeSell(idx){
    setEditForm(function(p){var st=[...(p.sellTargets||[])];st.splice(idx,1);return{...p,sellTargets:st};});
  }

  function submitForm(){
    if(!editForm.ticker||!editForm.ticker.trim()) return;
    var conds=(editForm.conditions||[]).filter(function(c){return c.text&&c.text.trim();});
    // v4.0 — alimente la biblio "personnalisée" avec les conditions libres
    var lib=condLib;
    conds.forEach(function(c){ if(c.cat==="perso"&&c.text){ lib=cgiCondLibAdd(lib,c.text,"perso"); } });
    if(lib!==condLib){ setCondLib(lib); cgiCondLibSave(lib); }
    var sells=(editForm.sellTargets||[]).filter(function(s){return s.price;}).map(function(s){return{price:parseFloat(s.price),note:s.note||""};});
    var entry={
      id:modal==="edit"?editForm.id:("wl_"+Date.now()),
      ticker:editForm.ticker.trim().toUpperCase(),
      name:editForm.name.trim()||editForm.ticker.trim().toUpperCase(),
      cat:editForm.cat||"Picking",
      fav:!!editForm.fav,
      addedAt:editForm.addedAt||new Date().toISOString().slice(0,10),
      description:editForm.description||"",
      domain:editForm.domain||"",
      buyZone:(editForm.buyZoneLow||editForm.buyZoneHigh)?{low:parseFloat(editForm.buyZoneLow)||null,high:parseFloat(editForm.buyZoneHigh)||null}:null,
      alertBuy:editForm.alertBuy?parseFloat(editForm.alertBuy):null,
      alertSell:editForm.alertSell?parseFloat(editForm.alertSell):null,
      sellTargets:sells,
      conditions:conds,
      risks:editForm.risks||"",
      score:conds.filter(function(c){return c.validated;}).length,
      // compat legacy
      targetPrice:sells.length?sells[0].price:null,
      alertBelow:editForm.alertBuy?parseFloat(editForm.alertBuy):null,
    };
    var nl=modal==="edit"?list.map(function(x){return x.id===entry.id?entry:x;}):[...list,entry];
    persist(nl); closeModal();
  }

  // ── Sort list ─────────────────────────────────────────────────────────────
  var sortedList=[...list].sort(function(a,b){
    // favs first, then by score desc
    var fa=a.fav?1:0, fb=b.fav?1:0;
    if(fb!==fa) return fb-fa;
    return (b.score||0)-(a.score||0);
  });
  var alertCount=list.filter(function(e){var p=prices[e.ticker];return p&&e.alertBelow&&p<=e.alertBelow;}).length;
  var displayed=sortedList.filter(function(e){
    if(filter==="fav") return e.fav;
    if(filter==="alerte"){var p=prices[e.ticker];return p&&e.alertBelow&&p<=e.alertBelow;}
    return true;
  });

  var inputStyle={width:"100%",background:C.bg,border:"1px solid "+borderC,borderRadius:8,padding:"8px 10px",color:textC,fontSize:13,boxSizing:"border-box"};
  var labelStyle={display:"block",fontSize:11,color:grayC,marginBottom:4};

  // ── v4.0 — carte condition structurée (catégorie → template paramétré / preset / libre) ──
  function optEl(v,l){ return React.createElement("option",{key:String(v),value:v},l); }
  function unitSelect(c,i){
    return React.createElement("select",{key:"u",value:(c.params&&c.params.unit)||"D",
      onChange:function(ev){updateCondField(i,{params:{unit:ev.target.value}});},
      style:{...inputStyle,flex:"0 0 78px",padding:"6px 8px"}},
      COND_TF_UNITS.map(function(u){return optEl(u[0],u[0]);}));
  }
  function numField(c,i,key,ph,width){
    return React.createElement("input",{key:key,type:"number",placeholder:ph,
      value:(c.params&&c.params[key]!=null)?c.params[key]:"",
      onChange:function(ev){var v=ev.target.value; updateCondField(i,{params:{[key]:(v===""?null:parseFloat(v))}});},
      style:{...inputStyle,flex:"0 0 "+(width||80)+"px",padding:"6px 8px"}});
  }
  function techParams(c,i){
    var t=c.templateId||"mm", p=c.params||{};
    if(t==="mm") return [
      React.createElement("select",{key:"per",value:p.period||50,onChange:function(ev){updateCondField(i,{params:{period:parseInt(ev.target.value,10)}});},style:{...inputStyle,flex:"0 0 78px",padding:"6px 8px"}},
        COND_MM_PERIODS.map(function(n){return optEl(n,"MM"+n);})),
      unitSelect(c,i),
      React.createElement("select",{key:"sens",value:p.sens||"above",onChange:function(ev){updateCondField(i,{params:{sens:ev.target.value}});},style:{...inputStyle,flex:1,minWidth:120,padding:"6px 8px"}},
        optEl("above","prix > MM"),optEl("below","prix < MM"))
    ];
    if(t==="rsi") return [
      unitSelect(c,i),
      React.createElement("select",{key:"sens",value:p.sens||"below",onChange:function(ev){updateCondField(i,{params:{sens:ev.target.value}});},style:{...inputStyle,flex:"0 0 130px",padding:"6px 8px"}},
        optEl("below","survente <"),optEl("above","surachat >")),
      numField(c,i,"seuil","seuil (30)",72)
    ];
    if(t==="support"||t==="resistance") return [ numField(c,i,"level","niveau $",90), unitSelect(c,i) ];
    if(t==="ath"||t==="macd"||t==="volume") return [ unitSelect(c,i) ];
    if(t==="divergence") return [ unitSelect(c,i), React.createElement("span",{key:"man",style:{fontSize:10,color:grayC,fontStyle:"italic"}},"(coche manuelle)") ];
    return [ unitSelect(c,i) ];
  }
  function CondCard(c,i){
    var cat=c.cat||"perso";
    var line2;
    if(cat==="technique"){
      line2=React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}},
        React.createElement("select",{value:c.templateId||"mm",onChange:function(ev){setCondTemplate(i,ev.target.value);},style:{...inputStyle,flex:"0 0 120px",padding:"6px 8px"}},
          COND_TECH_TEMPLATES.map(function(t){return optEl(t.id,t.label);})),
        techParams(c,i)
      );
    } else if(cat==="fondamentale"){
      line2=React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}},
        React.createElement("select",{value:"",onChange:function(ev){if(ev.target.value)setCondText(i,ev.target.value);},style:{...inputStyle,flex:"0 0 130px",padding:"6px 8px"}},
          [optEl("","＋ preset")].concat(COND_FOND_PRESETS.map(function(p){return optEl(p,p);}))),
        React.createElement("input",{value:c.text||"",placeholder:"…ou saisie libre",onChange:function(ev){setCondText(i,ev.target.value);},style:{...inputStyle,flex:1,minWidth:140}})
      );
    } else {
      line2=React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}},
        (condLib&&condLib.length>0)&&React.createElement("select",{value:"",onChange:function(ev){if(ev.target.value)setCondText(i,ev.target.value);},style:{...inputStyle,flex:"0 0 120px",padding:"6px 8px"}},
          [optEl("","↻ déjà utilisées")].concat(condLib.map(function(x,xi){return React.createElement("option",{key:xi,value:x.text},x.text);}))),
        React.createElement("input",{value:c.text||"",placeholder:"Condition libre…",onChange:function(ev){setCondText(i,ev.target.value);},style:{...inputStyle,flex:1,minWidth:140}})
      );
    }
    return React.createElement("div",{key:c.id||i,style:{border:"1px solid "+borderC,borderRadius:8,padding:8,display:"flex",flexDirection:"column",gap:6}},
      React.createElement("div",{style:{display:"flex",gap:6,alignItems:"center"}},
        React.createElement("input",{type:"checkbox",checked:!!c.validated,title:"Validé",onChange:function(ev){updateCond(i,"validated",ev.target.checked);},style:{flexShrink:0}}),
        React.createElement("select",{value:cat,onChange:function(ev){setCondCat(i,ev.target.value);},style:{...inputStyle,flex:"0 0 138px",padding:"6px 8px"}},
          optEl("technique","⚙️ Technique"),optEl("fondamentale","📊 Fondamentale"),optEl("perso","✎ Perso / libre")),
        c.autoValidated&&React.createElement("span",{style:{fontSize:10,fontWeight:700}},c.validatedBy&&c.validatedBy.type==="technique"?"📈":"🤖"),
        React.createElement("button",{onClick:function(){removeCond(i);},style:{marginLeft:"auto",background:"none",border:"none",color:redC,fontSize:16,cursor:"pointer",padding:"0 4px"}},"×")
      ),
      line2,
      cat==="technique"&&React.createElement("div",{style:{fontSize:10,color:grayC,fontStyle:"italic"}},"→ "+(c.text||cgiCondText(c)))
    );
  }

  return React.createElement("div",{style:{padding:"0 0 80px",fontFamily:C.font||"system-ui,sans-serif"}},

    // ── Header ──────────────────────────────────────────────────────────────
    React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 16px 8px"}},
      React.createElement("div",null,
        React.createElement("div",{style:{fontFamily:"'Cinzel',Georgia,serif",fontSize:19,fontWeight:600,color:C.gold,letterSpacing:2,lineHeight:1.15}},"Tracking"),
        React.createElement("div",{style:{fontSize:11,color:grayC}},list.length+" ticker"+(list.length>1?"s":"")+(saving?" · 💾":""))
      ),
      React.createElement("div",{style:{display:"flex",gap:6,position:"relative"}},
        React.createElement("button",{onClick:function(){setShowSearch(function(v){return !v;});},style:lxBtn({active:showSearch,style:{padding:"7px 10px"}})},React.createElement(Icon,{name:"search",size:15,color:showSearch?C.gold:C.text2})),
        React.createElement("button",{onClick:function(){setShowTools(function(v){return !v;});},style:lxBtn({active:showTools,style:{padding:"7px 11px",fontSize:11}})},"Outils ▾"),
        showTools&&React.createElement("div",{style:{position:"absolute",top:36,right:46,zIndex:50,background:cardBg,border:"1px solid "+borderC,borderRadius:10,padding:6,minWidth:170,boxShadow:"0 8px 24px #000a",display:"flex",flexDirection:"column",gap:2}},
          React.createElement("button",{onClick:function(){setShowTools(false);fetchNews();},style:{background:"none",border:"none",textAlign:"left",padding:"9px 10px",color:blueC,fontSize:12,fontWeight:700,cursor:"pointer",borderRadius:6}},"📰 Analyser les news (IA)"),
          React.createElement("button",{onClick:function(){setShowTools(false);verifyTechnicalAll();},disabled:techBusy,style:{background:"none",border:"none",textAlign:"left",padding:"9px 10px",color:techBusy?grayC:greenC,fontSize:12,fontWeight:700,cursor:"pointer",borderRadius:6}},techBusy?"📈 Vérification…":"📈 Vérifier le technique"),
          React.createElement("button",{onClick:function(){setShowTools(false);setShowIndic(true);},style:{background:"none",border:"none",textAlign:"left",padding:"9px 10px",color:orangeC,fontSize:12,fontWeight:700,cursor:"pointer",borderRadius:6}},"📊 Indicateurs marché")
        ),
        React.createElement("button",{onClick:refreshPrices,disabled:loading,style:lxBtn({style:{padding:"7px 10px",opacity:loading?.6:1}})},React.createElement(Icon,{name:"refresh",size:15,color:C.text2})),
        React.createElement("button",{onClick:openAdd,style:lxBtn({active:true,style:{padding:"7px 12px"}})},React.createElement(Icon,{name:"plus",size:15}))
      )
    ),

    // ── v4.7 — Feuille indicateurs marché (dashboard BTC) ─────────────────────
    showIndic&&ReactDOM.createPortal(
      React.createElement("div",{style:{position:"fixed",inset:0,zIndex:9996,background:C.bg,display:"flex",flexDirection:"column"}},
        React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",borderBottom:"1px solid "+borderC,flexShrink:0}},
          React.createElement("div",{style:{fontSize:15,fontWeight:600,color:textC}},"📊 Indicateurs marché"),
          React.createElement("button",{onClick:function(){setShowIndic(false);},style:{background:"none",border:"none",color:grayC,fontSize:24,cursor:"pointer",lineHeight:1}},"×")
        ),
        React.createElement("div",{style:{flex:1,overflowY:"auto",padding:"14px 16px 30px"}},
          React.createElement(MarketDash,null)
        )
      ),
      document.body
    ),

    // ── Bandeau retour vérif technique (v4.0) ─────────────────────────────────
    techMsg&&React.createElement("div",{style:{margin:"0 16px 8px",padding:"6px 10px",background:greenC+"12",border:"1px solid "+greenC+"44",borderRadius:8,fontSize:11,color:greenC,fontWeight:600}},techMsg),

    // ── Filtres ──────────────────────────────────────────────────────────────
    React.createElement("div",{style:{display:"flex",gap:6,padding:"0 16px 12px",overflowX:"auto"}},
      [["all","Tous ("+list.length+")"],["fav","★ Favoris"],["alerte",alertCount?String(alertCount):""]].map(function(f){
        var active=filter===f[0];
        var acc=f[0]==="alerte"?redC:C.gold;
        var content=f[0]==="alerte"
          ? React.createElement("span",{style:{display:"inline-flex",alignItems:"center",gap:5}},React.createElement(Icon,{name:"bell",size:13,color:active?acc:C.text2}),f[1])
          : f[1];
        return React.createElement("button",{key:f[0],onClick:function(){setFilter(f[0]);},style:lxBtn({active:active,accent:acc,style:{padding:"6px 13px",fontSize:11,borderRadius:999}})},content);
      })
    ),

    showSearch ? React.createElement("div",{style:{padding:"0 16px"}}, React.createElement(TickerSearchPanel,{withPlan:true})) : null,

    // ── Liste des tickers ─────────────────────────────────────────────────────
    displayed.length===0
      ? React.createElement("div",{style:{textAlign:"center",padding:"40px 16px",color:grayC}},
          list.length===0?"Aucun ticker. Clique sur + pour commencer.":"Aucun résultat.")
      : React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:8,padding:"0 12px"}},
          displayed.map(function(e){
            var price=prices[e.ticker];
            var inAlert=price&&e.alertBelow&&price<=e.alertBelow;
            var score=getScore(e);
            var condTotal=(e.conditions||[]).filter(function(c){return c.text;}).length;
            var atBuyZone=price&&e.buyZone&&e.buyZone.low&&price<=e.buyZone.high&&price>=e.buyZone.low;
            var exp=expanded[e.id];

            return React.createElement("div",{key:e.id,style:{
              background:inAlert?redC+"15":atBuyZone?greenC+"10":cardBg,
              border:"1px solid "+(inAlert?redC:atBuyZone?greenC:e.fav?blueC+"66":borderC),
              borderRadius:12,padding:"12px 14px"
            }},
              // Row 1: info principale avec logo
              React.createElement("div",{style:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}},
                TickerAvatar(e, prices[e.ticker]),
                React.createElement("div",{style:{flex:1}},
                  React.createElement("div",{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}},
                    e.fav&&React.createElement("span",{style:{color:orangeC,fontSize:14}},"★"),
                    React.createElement("span",{style:{fontSize:16,fontWeight:700,color:textC}},e.ticker),
                    e.domain&&React.createElement("span",{style:{fontSize:9,background:blueC+"22",border:"1px solid "+blueC+"44",borderRadius:4,padding:"1px 6px",color:blueC}},e.domain),
                    React.createElement("span",{style:{fontSize:9,background:borderC,borderRadius:4,padding:"1px 6px",color:grayC}},e.cat),
                    condTotal>0&&React.createElement("span",{style:{fontSize:11,fontWeight:700,color:score===condTotal&&score>0?greenC:score>0?orangeC:grayC}},
                      scoreEmoji(score,condTotal)+" "+score+"/"+condTotal),
                    inAlert&&React.createElement("span",{style:{display:"inline-flex",alignItems:"center",gap:4,fontSize:10,fontWeight:600,color:redC,border:"1px solid "+redC+"55",borderRadius:C.radiusSm||8,padding:"2px 8px"}},React.createElement(Icon,{name:"bell",size:12,color:redC}),"ALERTE"),
                    atBuyZone&&React.createElement("span",{style:{fontSize:11,color:greenC,fontWeight:700}},"✓ ZONE ACHAT")
                  ),
                  React.createElement("div",{style:{fontSize:11,color:grayC,marginTop:2}},e.name)
                ),
                React.createElement("div",{style:{textAlign:"right"}},
                  price!=null
                    ? React.createElement("span",{style:{fontSize:17,fontWeight:600,color:textC}},"$"+price.toLocaleString("fr-FR",{maximumFractionDigits:2}))
                    : React.createElement("span",{style:{fontSize:13,color:grayC}},loading?"...":"—")
                )
              ),

              // Zones prix
              (e.buyZone||e.alertBuy||e.alertSell||(e.sellTargets&&e.sellTargets.length))&&React.createElement("div",{style:{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}},
                e.buyZone&&e.buyZone.low&&React.createElement("span",{style:{fontSize:10,color:greenC}},"🟢 Achat: $"+e.buyZone.low+"–$"+e.buyZone.high),
                e.alertBuy&&React.createElement("span",{style:{fontSize:10,color:greenC}},"⬇️ Alerte achat: $"+e.alertBuy),
                (e.sellTargets||[]).map(function(st,i){return st.price?React.createElement("span",{key:i,style:{fontSize:10,color:blueC}},"🔵 Cible "+( i+1)+": $"+st.price+(st.note?" ("+st.note+")":"")):null;}),
                e.alertSell&&React.createElement("span",{style:{fontSize:10,color:orangeC}},"⬆️ Alerte vente: $"+e.alertSell)
              ),

              // Conditions scoring
              e.fav&&condTotal>0&&React.createElement("div",{style:{marginTop:8}},
                React.createElement("div",{style:{fontSize:10,color:grayC,marginBottom:4,fontWeight:600}},"CATALYSEURS "+score+"/"+condTotal+" validés"),
                React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:3}},
                  (e.conditions||[]).filter(function(c){return c.text;}).map(function(c){
                    return React.createElement("div",{key:c.id,style:{borderRadius:6,overflow:"hidden"}},
                      React.createElement("div",{
                        onClick:function(){toggleCondition(e.id,c.id);},
                        style:{display:"flex",alignItems:"flex-start",gap:6,cursor:"pointer",padding:"3px 6px",
                          background:c.validated?greenC+"15":C.bg,border:"1px solid "+(c.validated?greenC+"44":borderC)}},
                        React.createElement("span",{style:{fontSize:12,color:c.validated?greenC:grayC,flexShrink:0,marginTop:1}},c.validated?"✓":"○"),
                        React.createElement("span",{style:{fontSize:8,flexShrink:0,marginTop:3,padding:"0 4px",borderRadius:4,fontWeight:600,
                          background:(c.cat==="technique"?blueC:c.cat==="fondamentale"?orangeC:grayC)+"22",
                          color:c.cat==="technique"?blueC:c.cat==="fondamentale"?orangeC:grayC}},
                          c.cat==="technique"?"T":c.cat==="fondamentale"?"F":"P"),
                        React.createElement("span",{style:{fontSize:11,color:c.validated?textC:grayC,lineHeight:1.4,flex:1}},c.text),
                        c.autoValidated&&React.createElement("span",{style:{fontSize:9,color:greenC,flexShrink:0,marginTop:2,fontWeight:700}},
                          c.validatedBy&&c.validatedBy.type==="technique"?"📈":"🤖")
                      ),
                      // Source news (lien) — validation par IA
                      c.autoValidated&&c.validatedBy&&c.validatedBy.url&&React.createElement("a",{
                        href:c.validatedBy.url,target:"_blank",rel:"noopener",
                        onClick:function(ev){ev.stopPropagation();},
                        style:{display:"block",fontSize:9,color:blueC,padding:"2px 6px 3px 24px",
                          background:greenC+"08",borderTop:"1px solid "+greenC+"22",
                          textDecoration:"none",lineHeight:1.3,overflow:"hidden",
                          textOverflow:"ellipsis",whiteSpace:"nowrap"}
                      },"↗ "+c.validatedBy.title),
                      // Détail technique (pas de lien) — validation via Yahoo
                      c.autoValidated&&c.validatedBy&&!c.validatedBy.url&&c.validatedBy.detail&&React.createElement("div",{
                        style:{fontSize:9,color:greenC,padding:"2px 6px 3px 24px",
                          background:greenC+"08",borderTop:"1px solid "+greenC+"22",lineHeight:1.3}
                      },"📈 "+c.validatedBy.detail)
                    );
                  })
                )
              ),

              // Thèse / description (collapsible)
              (e.description||e.thesis||e.risks)&&React.createElement("div",{style:{marginTop:8}},
                React.createElement("div",{onClick:function(){toggleExpanded(e.id);},style:{fontSize:10,color:blueC,cursor:"pointer",fontWeight:600}},
                  exp?"▼ Thèse & risques":"▶ Thèse & risques"),
                exp&&React.createElement("div",{style:{marginTop:6,display:"flex",flexDirection:"column",gap:6}},
                  e.description&&React.createElement("div",{style:{fontSize:12,color:grayC,lineHeight:1.4,padding:"6px 8px",background:bgC,borderRadius:6,borderLeft:"3px solid "+blueC}},
                    React.createElement("span",{style:{color:grayC,fontSize:10,fontWeight:600}},"CONTEXTE "),e.description),
                  e.risks&&React.createElement("div",{style:{fontSize:12,color:redC+"CC",lineHeight:1.4,padding:"6px 8px",background:redC+"08",borderRadius:6,borderLeft:"3px solid "+redC}},
                    React.createElement("span",{style:{color:redC,fontSize:10,fontWeight:600}},"RISQUES / INVALIDATION "),e.risks)
                )
              ),

              // Actions
              React.createElement("div",{style:{display:"flex",gap:6,marginTop:10}},
                React.createElement("button",{onClick:function(){toggleFav(e.id);},style:lxBtn({active:e.fav,style:{padding:"5px 10px",fontSize:12}})},e.fav?"★":"☆"),
                React.createElement("button",{onClick:function(){openEdit(e);},style:lxBtn({style:{padding:"5px 11px",gap:5}})},React.createElement(Icon,{name:"edit",size:14,color:C.text2}),"Éditer"),
                React.createElement("button",{onClick:function(){deleteEntry(e.id);},style:lxBtn({style:{padding:"5px 10px"}})},React.createElement(Icon,{name:"trash",size:14,color:redC}))
              )
            );
          })
        ),


    // ══════════════════════════════════════════════════════════
    // PANEL NEWS — via createPortal (garantit position:fixed)
    // ══════════════════════════════════════════════════════════
    newsPanel&&ReactDOM.createPortal(React.createElement("div",{
      style:{position:"fixed",top:0,left:0,right:0,bottom:0,background:"#000C",zIndex:9998,display:"flex",alignItems:"flex-end"},
      onClick:function(ev){if(ev.target===ev.currentTarget)setNewsPanel(false);}
    },
      React.createElement("div",{style:{background:bgC,border:"1px solid "+borderC,borderRadius:"16px 16px 0 0",width:"100%",maxWidth:520,margin:"0 auto",maxHeight:"85vh",display:"flex",flexDirection:"column"}},
        React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 16px 8px",flexShrink:0}},
          React.createElement("span",{style:{fontSize:16,fontWeight:600,color:textC}},"📰 News — Tickers suivis"),
          React.createElement("button",{onClick:function(){setNewsPanel(false);},style:{background:"none",border:"none",color:grayC,fontSize:20,cursor:"pointer"}},"×")
        ),
        React.createElement("div",{style:{overflowY:"auto",flex:1,padding:"0 12px 16px"}},
          newsLoading?React.createElement("div",{style:{textAlign:"center",padding:40,color:grayC}},
            React.createElement("div",{style:{marginBottom:8,fontSize:14}},"⟳ Chargement..."),
            React.createElement("div",{style:{fontSize:11,color:grayC}},"Analyse IA des conditions en cours 🤖"))
          :news.length===0?React.createElement("div",{style:{textAlign:"center",padding:40,color:grayC}},"Aucune news trouvée.")
          :news.map(function(n,i){
            var timeStr=n.time?new Date(n.time).toLocaleDateString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
            return React.createElement("a",{key:i,href:n.url,target:"_blank",rel:"noopener",style:{display:"block",textDecoration:"none",marginBottom:8}},
              React.createElement("div",{style:{background:n.hasAiValidation?blueC+"12":cardBg,border:"1px solid "+(n.hasAiValidation?blueC+"55":borderC),borderRadius:10,padding:"10px 12px"}},
                React.createElement("div",{style:{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}},
                  React.createElement("span",{style:{fontSize:9,background:n.isFav?orangeC+"22":blueC+"22",border:"1px solid "+(n.isFav?orangeC:blueC)+"44",borderRadius:4,padding:"1px 6px",color:n.isFav?orangeC:blueC,fontWeight:700}},
                    (n.isFav?"★ ":"")+n.ticker+(n.score>0?" 🔥".repeat(Math.min(n.score,3)):"")),
                  n.hasAiValidation&&React.createElement("span",{style:{fontSize:9,background:greenC+"22",border:"1px solid "+greenC+"44",borderRadius:4,padding:"1px 6px",color:greenC,fontWeight:700}},"🤖 IA"),
                  React.createElement("span",{style:{fontSize:9,color:grayC}},n.publisher),
                  React.createElement("span",{style:{fontSize:9,color:grayC,marginLeft:"auto"}},timeStr)
                ),
                React.createElement("div",{style:{fontSize:12,color:textC,lineHeight:1.4,marginBottom:(n.validatedConditions&&n.validatedConditions.length)?6:0}},n.title),
                (n.validatedConditions&&n.validatedConditions.length>0)&&React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:2}},
                  (n.validatedConditions||[]).map(function(ct,ci){
                    return React.createElement("div",{key:ci,style:{fontSize:10,color:greenC,display:"flex",alignItems:"flex-start",gap:4}},
                      React.createElement("span",{style:{flexShrink:0}},"✓"),
                      React.createElement("span",{style:{fontStyle:"italic",lineHeight:1.3}},ct));
                  })
                )
              )
            );
          })
      )
    )),document.body),

    // ══════════════════════════════════════════════════════════
    // MODAL Add/Edit — FORMULAIRE COMPLET
    // ══════════════════════════════════════════════════════════
    modal&&ReactDOM.createPortal(React.createElement("div",{
      style:{position:"fixed",top:0,left:0,right:0,bottom:0,background:"#000C",zIndex:9999,display:"flex",alignItems:"flex-end",justifyContent:"center"},
      onClick:function(ev){if(ev.target===ev.currentTarget)closeModal();}
    },
      React.createElement("div",{style:{background:bgC,border:"1px solid "+borderC,borderRadius:"16px 16px 0 0",width:"100%",maxWidth:500,padding:20,maxHeight:"92vh",overflowY:"auto"}},

        // En-tête modal
        React.createElement("div",{style:{display:"flex",justifyContent:"space-between",marginBottom:16}},
          React.createElement("span",{style:{fontSize:16,fontWeight:600,color:textC}},modal==="add"?"Ajouter un ticker":"Modifier "+editForm.ticker),
          React.createElement("button",{onClick:closeModal,style:{background:"none",border:"none",color:grayC,fontSize:20,cursor:"pointer"}},"×")
        ),

        // Section: Identité
        React.createElement("div",{style:{fontSize:11,color:orangeC,fontWeight:700,marginBottom:8,letterSpacing:.5}},"IDENTITÉ"),
        modal==="add"&&React.createElement("div",{style:{marginBottom:10}},
          React.createElement("label",{style:labelStyle},"🔎 Rechercher un ticker"),
          React.createElement(YahooTickerSearch,{onSelect:function(q){
            var tk=(q.ticker||"").toUpperCase();
            if(q.yahooSym && q.yahooSym!==tk && typeof YF_MAP!=="undefined"){
              YF_MAP[tk]=q.yahooSym;
              try{ saveBase('cgi_yfmap',{...YF_MAP}); }catch(e){}
            }
            setEditForm(function(p){return{...p,ticker:tk,name:p.name||q.name||tk};});
          }})
        ),
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}},
          React.createElement("div",null,React.createElement("label",{style:labelStyle},"Ticker *"),
            React.createElement("input",{value:editForm.ticker||"",placeholder:"AAPL",onChange:function(ev){setEditForm(function(p){return{...p,ticker:ev.target.value};});},style:inputStyle})),
          React.createElement("div",null,React.createElement("label",{style:labelStyle},"Nom"),
            React.createElement("input",{value:editForm.name||"",placeholder:"Apple Inc.",onChange:function(ev){setEditForm(function(p){return{...p,name:ev.target.value};});},style:inputStyle}))
        ),
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}},
          React.createElement("div",null,React.createElement("label",{style:labelStyle},"Catégorie"),
            React.createElement("select",{value:editForm.cat||"Picking",onChange:function(ev){setEditForm(function(p){return{...p,cat:ev.target.value};});},style:inputStyle},
              ["Crypto","Indices","Picking","Or","Cash Dip","Cash Matelas"].map(function(o){return React.createElement("option",{key:o,value:o},o);}))),
          React.createElement("div",null,React.createElement("label",{style:labelStyle},"Domaine"),
            React.createElement("select",{value:editForm.domain||"Tech",onChange:function(ev){setEditForm(function(p){return{...p,domain:ev.target.value};});},style:inputStyle},
              ["IA","Défense","Tech","Santé","Énergie","Finance","Matières premières","Consommation","Immobilier","Crypto","Indices","Or","Autre"].map(function(o){return React.createElement("option",{key:o,value:o},o);})))
        ),

        // Section: Contexte
        React.createElement("div",{style:{fontSize:11,color:orangeC,fontWeight:700,marginBottom:8,letterSpacing:.5}},"CONTEXTE / DESCRIPTIF"),
        React.createElement("textarea",{value:editForm.description||"",rows:3,placeholder:"Décris le contexte actuel de l'entreprise, son positionnement...",onChange:function(ev){setEditForm(function(p){return{...p,description:ev.target.value};});},style:{...inputStyle,resize:"vertical",marginBottom:16}}),

        // Section: Zones de prix
        React.createElement("div",{style:{fontSize:11,color:orangeC,fontWeight:700,marginBottom:8,letterSpacing:.5}},"ZONES DE PRIX"),
        // v4.0 LOT4 — graphique interactif pour fixer les zones en touchant le graphe
        editForm.ticker&&React.createElement("div",{style:{marginBottom:10}},
          React.createElement("button",{onClick:function(){setShowChart(!showChart);setPickMode(null);},
            style:{width:"100%",background:showChart?blueC+"22":cardBg,border:"1px solid "+(showChart?blueC:borderC),borderRadius:8,padding:"8px",color:blueC,fontSize:12,fontWeight:700,cursor:"pointer",marginBottom:8}},
            showChart?"▾ Masquer le graphique":"📊 Graphique & zones (touche pour fixer)"),
          showChart&&React.createElement("div",null,
            React.createElement("div",{style:{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}},
              React.createElement("button",{onClick:function(){setPickMode(pickMode==="low"?null:"low");},style:{background:pickMode==="low"?greenC:cardBg,color:pickMode==="low"?"#000":greenC,border:"1px solid "+greenC,borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}},"⊳ Achat min"),
              React.createElement("button",{onClick:function(){setPickMode(pickMode==="high"?null:"high");},style:{background:pickMode==="high"?greenC:cardBg,color:pickMode==="high"?"#000":greenC,border:"1px solid "+greenC,borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}},"⊳ Achat max"),
              React.createElement("button",{onClick:function(){setPickMode(pickMode==="sell"?null:"sell");},style:{background:pickMode==="sell"?redC:cardBg,color:pickMode==="sell"?"#000":redC,border:"1px solid "+redC,borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}},"⊳ + Cible vente")
            ),
            React.createElement(LWChart,{
              symbol:(typeof YF_MAP!=="undefined"&&YF_MAP[editForm.ticker])?YF_MAP[editForm.ticker]:editForm.ticker,
              height:260,
              pickActive:!!pickMode,
              zones:(function(){
                var z=[];
                if(editForm.buyZoneLow) z.push({price:parseFloat(editForm.buyZoneLow),color:greenC,title:"Achat min"});
                if(editForm.buyZoneHigh) z.push({price:parseFloat(editForm.buyZoneHigh),color:greenC,title:"Achat max",dashed:true});
                (editForm.sellTargets||[]).forEach(function(st,i){ if(st.price) z.push({price:parseFloat(st.price),color:redC,title:"Cible "+(i+1)}); });
                if(editForm.alertBuy) z.push({price:parseFloat(editForm.alertBuy),color:orangeC,title:"Alerte achat",dashed:true});
                if(editForm.alertSell) z.push({price:parseFloat(editForm.alertSell),color:orangeC,title:"Alerte vente",dashed:true});
                return z;
              })(),
              onPickPrice:function(price){
                if(pickMode==="low") setEditForm(function(p){return{...p,buyZoneLow:String(price)};});
                else if(pickMode==="high") setEditForm(function(p){return{...p,buyZoneHigh:String(price)};});
                else if(pickMode==="sell") setEditForm(function(p){ var st=(p.sellTargets||[]).slice(); if(st.length<4) st.push({price:String(price),note:""}); return{...p,sellTargets:st}; });
              }
            })
          )
        ),
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}},
          React.createElement("div",null,React.createElement("label",{style:labelStyle},"Zone achat — min $"),
            React.createElement("input",{type:"number",value:editForm.buyZoneLow||"",placeholder:"ex: 800",onChange:function(ev){setEditForm(function(p){return{...p,buyZoneLow:ev.target.value};});},style:inputStyle})),
          React.createElement("div",null,React.createElement("label",{style:labelStyle},"Zone achat — max $"),
            React.createElement("input",{type:"number",value:editForm.buyZoneHigh||"",placeholder:"ex: 850",onChange:function(ev){setEditForm(function(p){return{...p,buyZoneHigh:ev.target.value};});},style:inputStyle}))
        ),
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}},
          React.createElement("div",null,React.createElement("label",{style:labelStyle},"🔔 Alerte achat < $"),
            React.createElement("input",{type:"number",value:editForm.alertBuy||"",placeholder:"ex: 785",onChange:function(ev){setEditForm(function(p){return{...p,alertBuy:ev.target.value};});},style:inputStyle})),
          React.createElement("div",null,React.createElement("label",{style:labelStyle},"🔔 Alerte vente > $"),
            React.createElement("input",{type:"number",value:editForm.alertSell||"",placeholder:"ex: 1150",onChange:function(ev){setEditForm(function(p){return{...p,alertSell:ev.target.value};});},style:inputStyle}))
        ),

        // Cibles de vente multiples
        React.createElement("div",{style:{marginBottom:16}},
          React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}},
            React.createElement("label",{style:{...labelStyle,marginBottom:0}},"Objectifs de vente"),
            (editForm.sellTargets||[]).length<4&&React.createElement("button",{onClick:addSell,style:{background:"none",border:"1px solid "+borderC,borderRadius:6,padding:"2px 8px",color:blueC,fontSize:10,cursor:"pointer"}},"+")
          ),
          React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:6}},
            (editForm.sellTargets||[]).map(function(st,i){
              return React.createElement("div",{key:i,style:{display:"flex",gap:6,alignItems:"center"}},
                React.createElement("input",{type:"number",value:st.price||"",placeholder:"Prix $",onChange:function(ev){updateSell(i,"price",ev.target.value);},style:{...inputStyle,width:90,flex:"0 0 90px"}}),
                React.createElement("input",{value:st.note||"",placeholder:"Note (ex: Résistance AT)",onChange:function(ev){updateSell(i,"note",ev.target.value);},style:{...inputStyle,flex:1}}),
                React.createElement("button",{onClick:function(){removeSell(i);},style:{background:"none",border:"none",color:redC,fontSize:14,cursor:"pointer",padding:"0 4px"}},"×")
              );
            })
          )
        ),

        // Section: Catalyseurs
        React.createElement("div",{style:{fontSize:11,color:orangeC,fontWeight:700,marginBottom:8,letterSpacing:.5}},"CATALYSEURS / CONDITIONS (scoring)"),
        React.createElement("div",{style:{fontSize:10,color:grayC,marginBottom:8}},"Technique = validé via le bouton 📈 Tech · Fondamentale/Perso = validé par l'IA news 🤖 ou à la main"),
        React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:8,marginBottom:8}},
          (editForm.conditions||[]).map(CondCard)
        ),
        (editForm.conditions||[]).length<6&&React.createElement("button",{onClick:addCond,style:{background:"none",border:"1px solid "+borderC,borderRadius:6,padding:"4px 12px",color:blueC,fontSize:11,cursor:"pointer",marginBottom:16}},
          "+ Ajouter un catalyseur"),

        // Section: Risques
        React.createElement("div",{style:{fontSize:11,color:redC,fontWeight:700,marginBottom:8,letterSpacing:.5}},"RISQUES / INVALIDATION DE LA THÈSE"),
        React.createElement("textarea",{value:editForm.risks||"",rows:3,placeholder:"Dans quel cas la thèse devient invalide ? Ex: Perte de part de marché, concurrence d'OpenAI, margin compression...",onChange:function(ev){setEditForm(function(p){return{...p,risks:ev.target.value};});},style:{...inputStyle,resize:"vertical",marginBottom:12}}),

        // Favori
        React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:16}},
          React.createElement("input",{type:"checkbox",id:"favCbW",checked:!!editForm.fav,onChange:function(ev){setEditForm(function(p){return{...p,fav:ev.target.checked};});}}),
          React.createElement("label",{htmlFor:"favCbW",style:{fontSize:13,color:textC,cursor:"pointer"}},"★ Marquer comme favori (affichage prioritaire)")
        ),

        // Submit
        React.createElement("button",{onClick:submitForm,style:{width:"100%",background:orangeC,border:"none",borderRadius:10,padding:"12px",color:"#000",fontSize:14,fontWeight:600,cursor:"pointer"}},
          modal==="add"?"Ajouter à la watchlist":"Enregistrer")
      )   
    )      
  ,document.body)
  );
}

// ── FIN PageWatchlist v2 ──────────────────────────────────────────────────────


// ── #16/#17/#22 — Recherche ticker : trades (Legend) OU plans+alertes (Tracking) ──
function TickerSearchPanel({withPlan=false}){
  const [q,setQ]=useState("");
  const T=String(q||"").toUpperCase().trim();
  const wl=(()=>{ try{ const a=JSON.parse(localStorage.getItem("cgi_watchlist_direct")||"[]"); return Array.isArray(a)?a:[]; }catch(e){ return []; } })();
  const allTickers = withPlan
    ? [...new Set(wl.map(x=>String(x.ticker||"").toUpperCase().trim()).filter(Boolean))].sort()
    : tradeTickers();
  const matchExact = allTickers.indexOf(T)>=0;
  const suggestions = T && !matchExact ? allTickers.filter(x=>x.indexOf(T)>=0).slice(0,8) : [];
  const SearchBox = (
    <div style={{display:"flex",alignItems:"center",gap:8,border:`1px solid ${C.border2}`,borderRadius:C.radiusSm||8,padding:"8px 11px",background:C.bg1}}>
      <Icon name="search" size={15} color={C.text2}/>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder={withPlan?"Rechercher un plan / une alerte…":"Rechercher un ticker…"} style={{flex:1,background:"transparent",border:"none",outline:"none",color:C.text,fontSize:13,fontFamily:C.font}}/>
      {q?<button onClick={()=>setQ("")} style={{background:"none",border:"none",cursor:"pointer",color:C.text3,padding:0,display:"flex"}}><Icon name="x" size={14}/></button>:null}
    </div>
  );
  const Sugg = suggestions.length>0 ? (
    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
      {suggestions.map(sg=>(<button key={sg} onClick={()=>setQ(sg)} style={lxBtn({style:{padding:"4px 10px",fontSize:11}})}>{sg}</button>))}
    </div>
  ) : null;

  if(withPlan){
    const e = T ? (wl.find(x=>String(x.ticker||"").toUpperCase().trim()===T)||null) : null;
    const bz = e&&e.buyZone; const st = (e&&e.sellTargets)||[];
    return (
      <div style={{marginBottom:16}}>
        {SearchBox}{Sugg}
        {T && !e && suggestions.length===0 && <div style={{marginTop:10,fontSize:12,color:C.text3,fontStyle:"italic"}}>Aucun plan ni alerte pour « {T} ».</div>}
        {e && (
          <div style={{marginTop:12,display:"flex",flexDirection:"column",gap:10}}>
            <div style={{padding:"10px 12px",border:`1px solid ${C.border}`,borderRadius:10,background:C.bg1}}>
              <div style={{fontSize:10,fontWeight:600,color:C.gold,letterSpacing:.4,marginBottom:8}}>PLAN DE TRADE</div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:8}}>
                <span style={{color:C.text3}}>Zone d'achat</span>
                <span style={{fontWeight:700,color:C.green}}>{bz&&(bz.low!=null||bz.high!=null)?((bz.low!=null?bz.low:"?")+" – "+(bz.high!=null?bz.high:"?")):"—"}</span>
              </div>
              <div style={{fontSize:10,color:C.text3,textTransform:"uppercase",letterSpacing:1,margin:"4px 0 5px"}}>Objectifs de vente</div>
              {st.length===0 ? <div style={{fontSize:11,color:C.text3,fontStyle:"italic"}}>Aucun.</div> :
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {st.map((sx,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11}}><span style={{color:C.text3}}>Cible {i+1}</span><span style={{fontWeight:700,color:C.red}}>{sx&&sx.price!=null?sx.price:"—"}</span></div>))}
                </div>}
            </div>
            <div style={{padding:"10px 12px",border:`1px solid ${C.border}`,borderRadius:10,background:C.bg1}}>
              <div style={{fontSize:10,fontWeight:600,color:C.gold,letterSpacing:.4,marginBottom:8,display:"flex",alignItems:"center",gap:6}}><Icon name="bell" size={12} color={C.gold}/>ALERTE DE PRIX</div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                <span style={{color:C.text3}}>Seuil d'alerte (prix sous lequel notifier)</span>
                <span style={{fontWeight:700,color:e.alertBelow!=null?C.text:C.text3}}>{e.alertBelow!=null?e.alertBelow:"—"}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const trades = T?getTickerTrades(T):[];
  let buyQ=0,buyV=0,sellQ=0;
  trades.forEach(t=>{ const qy=Math.abs(t.qty||0),p=t.price||0; if(t.side==="BUY"){buyQ+=qy;buyV+=qy*p;} else if(t.side==="SELL"){sellQ+=qy;} });
  const netQ=buyQ-sellQ, pru=buyQ>0?buyV/buyQ:null;
  // #67l — exécutions IBKR archivées (affichage seul, hors calcul Position/PRU) :
  // taggées, dédoublonnées grossièrement contre les saisies (date+sens+quantité).
  const _sigT=new Set(trades.map(t=>[t.date,(t.side||"").toUpperCase(),Math.round(Math.abs(t.qty||0)*1e4)].join("|")));
  const ibkrRows = T ? (ibkrTrades||[])
    .filter(x=>x && x.symbol && x.symbol.split(" ")[0].toUpperCase()===T.toUpperCase())
    .filter(x=>!_sigT.has([x.date,(x.side||"").toUpperCase(),Math.round(Math.abs(x.qty||0)*1e4)].join("|")))
    .map(x=>({id:"ibkrx_"+(x.tradeID||x.date+"_"+x.qty), date:x.date, side:(x.side||"").toUpperCase(), qty:x.qty, price:x.price, currency:x.currency, _ibkr:true})) : [];
  const allTrades = trades.concat(ibkrRows).sort((a,b)=>(a.date||"")<(b.date||"")?-1:1);
  return (
    <div style={{marginBottom:16}}>
      {SearchBox}{Sugg}
      {T && allTrades.length===0 && suggestions.length===0 && <div style={{marginTop:10,fontSize:12,color:C.text3,fontStyle:"italic"}}>Aucun trade pour « {T} ».</div>}
      {T && allTrades.length>0 && (
        <div style={{marginTop:12}}>
          <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:10,fontSize:12}}>
            <span style={{color:C.text2}}>Position <b style={{color:C.text}}>{netQ.toLocaleString("fr-FR",{maximumFractionDigits:4})}</b></span>
            {pru!=null && <span style={{color:C.text2}}>PRU <b style={{color:C.text}}>{pru.toFixed(2)}</b></span>}
            <span style={{color:C.text2}}>Trades <b style={{color:C.text}}>{trades.length}</b>{ibkrRows.length>0 && <span style={{color:C.text3}}> · +{ibkrRows.length} IBKR</span>}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {allTrades.slice().reverse().map((t,i)=>(
              <div key={t.id||i} style={{display:"flex",alignItems:"center",gap:8,fontSize:11,borderBottom:`1px solid ${C.border}`,paddingBottom:7,opacity:t._ibkr?0.85:1}}>
                <span style={{fontSize:9,fontWeight:700,color:t.side==="BUY"?C.green:C.red,border:`1px solid ${(t.side==="BUY"?C.green:C.red)}55`,borderRadius:5,padding:"1px 6px",minWidth:42,textAlign:"center"}}>{t.side==="BUY"?"ACHAT":"VENTE"}</span>
                {t._ibkr && <span style={{fontSize:8,fontWeight:700,color:C.gold,border:`1px solid ${C.gold}55`,borderRadius:5,padding:"1px 5px"}}>IBKR</span>}
                <span style={{color:C.text3,minWidth:62}}>{t.date}</span>
                <span style={{flex:1,textAlign:"right",color:C.text}}>{Math.abs(t.qty||0).toLocaleString("fr-FR",{maximumFractionDigits:4})} @ {t.currency==="EUR"?"€":"$"}{Number(t.price||0).toFixed(2)}{t.bankAccount?<span style={{color:C.text3,fontSize:9}}> · {t.bankAccount}</span>:null}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PageLegend(
{txns, liveFutures, hidden, eur, EFF, liveIbkrAnnex, ibkrTrades=[]}){
  const [board,setBoard]=useState("spot");
  const [sel,setSel]=useState(null);
  const [sortK,setSortK]=useState("date");
  const [showSearch,setShowSearch]=useState(false);
  // #72b — Spot unifié : trades clôturés calculés sur la source fusionnée (IBKR prioritaire)
  const mergedTx = React.useMemo(function(){ return mergeTradesIbkrPriority(txns, ibkrTrades); }, [txns, ibkrTrades]);
  const spot = React.useMemo(function(){ return computeClosedTrades(mergedTx).closed; }, [mergedTx]);
  const fut = React.useMemo(function(){
    return (liveFutures||SEED_FUTURES).map(function(t){
      return {ticker:t.ticker, dir:t.dir, entryDate:t.openDate, exitDate:t.closeDate, durationDays:t.durationDays,
        pnlUSD:t.realizedPnlUSD, pct:t.pctOnMargin, lev:t.leverage, marginUSD:t.marginUSD, notionalUSD:t.entryNotionalUSD, raw:t};
    });
  }, [liveFutures]);
  const list = board==="spot" ? spot : fut;
  const sorted = list.slice().sort(function(a,b){
    if(sortK==="date"){ var da=new Date(a.exitDate||a.entryDate||0), db=new Date(b.exitDate||b.entryDate||0); return db-da; }
    if(sortK==="pnl") return b.pnlUSD-a.pnlUSD;
    if(sortK==="pct") return (b.pct==null?-1e12:b.pct)-(a.pct==null?-1e12:a.pct);
    return b.durationDays-a.durationDays;
  });
  const tot = list.reduce(function(a,t){return a+(t.pnlUSD||0);},0);
  const wins = list.filter(function(t){return t.pnlUSD>0;}).length;
  const best = list.length?Math.max.apply(null,list.map(function(t){return t.pnlUSD;})):0;
  const worst = list.length?Math.min.apply(null,list.map(function(t){return t.pnlUSD;})):0;
  const winRate = list.length?Math.round(wins/list.length*100):0;
  const avgDur = list.length?Math.round(list.reduce(function(a,t){return a+(t.durationDays||0);},0)/list.length):0;
  const fU = function(v){ return (v<0?"-$":"$")+Math.abs(Math.round(v)).toLocaleString("fr-FR"); };
  const Tab=function(props){ return (
    <button onClick={props.onClick} style={lxBtn({active:props.active,style:{flex:1,padding:"9px 0",fontSize:13}})}>{props.label}</button>
  );};
  const Sort=function(props){ return (
    <button onClick={props.onClick} style={lxBtn({active:props.active,style:{padding:"5px 11px",fontSize:11}})}>{props.label}</button>
  );};
  return (
    <div style={{padding:"8px 14px 96px"}}>
      <PageTitle title="History" sub={"Trades clôturés · "+(board==="spot"?"Spot (saisies + IBKR unifiés)":"Futures")}/>
      <button onClick={()=>setShowSearch(v=>!v)} style={lxBtn({active:showSearch,style:{marginBottom:14,padding:"8px 13px",gap:7}})}>
        <Icon name="search" size={14} color={showSearch?C.gold:C.text2}/>Recherche ticker
      </button>
      {showSearch && <TickerSearchPanel/>}
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <Tab label="Spot" active={board==="spot"} onClick={function(){setBoard("spot");}}/>
        <Tab label="Futures" active={board==="futures"} onClick={function(){setBoard("futures");}}/>
      </div>
      {/* Stats globales */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
        <div style={{background:"transparent",border:`1px solid ${C.border2}`,borderRadius:C.radiusSm||8,padding:"11px 13px"}}>
          <div style={{fontSize:9,color:C.text2,textTransform:"uppercase",letterSpacing:2}}>P&L total</div>
          <div style={{fontSize:19,fontWeight:600,color:tot>=0?C.green:C.red,fontVariantNumeric:"tabular-nums"}}>{msk(fU(tot),hidden)}</div>
        </div>
        <div style={{background:"transparent",border:`1px solid ${C.border2}`,borderRadius:C.radiusSm||8,padding:"11px 13px"}}>
          <div style={{fontSize:9,color:C.text2,textTransform:"uppercase",letterSpacing:2}}>Win rate</div>
          <div style={{fontSize:19,fontWeight:600,color:C.text,fontVariantNumeric:"tabular-nums"}}>{winRate}% <span style={{fontSize:11,color:C.text3,fontWeight:600}}>({wins}/{list.length})</span></div>
        </div>
        <div style={{background:"transparent",border:`1px solid ${C.border2}`,borderRadius:C.radiusSm||8,padding:"11px 13px"}}>
          <div style={{fontSize:9,color:C.text2,textTransform:"uppercase",letterSpacing:2}}>Meilleur</div>
          <div style={{fontSize:15,fontWeight:600,color:C.green,fontVariantNumeric:"tabular-nums"}}>{msk(fU(best),hidden)}</div>
        </div>
        <div style={{background:"transparent",border:`1px solid ${C.border2}`,borderRadius:C.radiusSm||8,padding:"11px 13px"}}>
          <div style={{fontSize:9,color:C.text2,textTransform:"uppercase",letterSpacing:2}}>Pire</div>
          <div style={{fontSize:15,fontWeight:600,color:C.red,fontVariantNumeric:"tabular-nums"}}>{msk(fU(worst),hidden)}</div>
        </div>
        <div style={{gridColumn:"1 / -1",background:"transparent",border:`1px solid ${C.border2}`,borderRadius:C.radiusSm||8,padding:"11px 13px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:9,color:C.text2,textTransform:"uppercase",letterSpacing:2}}>Durée moyenne de trade</div>
          <div style={{fontSize:16,fontWeight:600,color:C.text,fontVariantNumeric:"tabular-nums"}}>{avgDur} jour{avgDur>1?"s":""}</div>
        </div>
      </div>
      {/* Tri */}
      <div style={{display:"flex",gap:8,marginBottom:10,alignItems:"center"}}>
        <span style={{fontSize:11,color:C.text3}}>Trier :</span>
        <Sort label="Date" active={sortK==="date"} onClick={function(){setSortK("date");}}/>
        <Sort label="P&L" active={sortK==="pnl"} onClick={function(){setSortK("pnl");}}/>
        <Sort label="%" active={sortK==="pct"} onClick={function(){setSortK("pct");}}/>
        <Sort label="Durée" active={sortK==="dur"} onClick={function(){setSortK("dur");}}/>
      </div>
      {/* Liste */}
      <div>
        {sorted.map(function(t,i){
          const up=t.pnlUSD>=0;
          const cls=assetClass(t.ticker,t.src,board==="futures");
          return (
            <div key={i} onClick={function(){setSel({trade:t,kind:board});}} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 4px",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:C.text,display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                  <span>{t.ticker}</span>
                  <span style={{fontSize:9,fontWeight:600,padding:"1px 6px",borderRadius:5,background:cls.color+"22",color:cls.color}}>{cls.label}</span>
                  {board==="futures" && <span style={{fontSize:10,fontWeight:700,color:t.dir==="LONG"?C.green:C.red}}>{t.dir} x{t.lev}</span>}
                </div>
                <div style={{fontSize:10,color:C.text3,marginTop:2}}>{t.entryDate} → {t.exitDate} · {t.durationDays}j</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:14,fontWeight:600,color:up?C.green:C.red}}>{msk((up?"+":"")+fU(t.pnlUSD),hidden)}</div>
                <div style={{fontSize:11,fontWeight:700,color:up?C.green:C.red}}>{t.pct==null?"—":((up?"+":"")+t.pct.toFixed(1)+"%")}</div>
              </div>
            </div>
          );
        })}
        {sorted.length===0 && <div style={{textAlign:"center",color:C.text3,fontSize:13,padding:30}}>Aucun trade clôturé.</div>}
      </div>
      {sel && <TradeDetailModal trade={sel.trade} kind={sel.kind} liveIbkrAnnex={liveIbkrAnnex} onClose={function(){setSel(null);}}/>}
    </div>
  );
}
// ══════════════════════════════════════════════════════════════════════════════
// CGI v4.0 — LOT3 : éditeur de transactions (base canonique éditable)
// ══════════════════════════════════════════════════════════════════════════════
function TxnEditor(props){
  var txns=props.txns||[];
  var addTxn=props.addTxn, delTxn=props.delTxn;
  const [open,setOpen]=useState(false);
  const [f,setF]=useState({date:new Date().toISOString().slice(0,10),ticker:"",side:"BUY",qty:"",valueUSD:"",currency:"USD"});
  const [msg,setMsg]=useState("");
  const [focusK,setFocusK]=useState("");
  const SERIF="'Cormorant Garamond',Georgia,serif";
  const lbl={fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:C.text2,marginBottom:5,display:"block"};
  const inp=(k)=>({background:C.bg,border:`1px solid ${focusK===k?C.gold:C.border}`,borderRadius:8,padding:"9px 10px",color:C.text,fontSize:13,width:"100%",boxSizing:"border-box",outline:"none",transition:"border-color .15s",fontFamily:"inherit"});
  function up(k,v){ setF(p=>({...p,[k]:v})); }
  function submit(){
    if(!f.ticker.trim()){ setMsg("⚠ Ticker requis."); return; }
    if(!f.qty||!f.valueUSD){ setMsg("⚠ Quantité et montant requis."); return; }
    const t={ id:Date.now(), date:f.date, ticker:f.ticker.trim().toUpperCase(),
      side:f.side, qty:parseFloat(f.qty), valueUSD:parseFloat(f.valueUSD), currency:f.currency };
    if(addTxn) addTxn(t);
    setMsg("✓ Transaction ajoutée");
    setF({date:f.date,ticker:"",side:"BUY",qty:"",valueUSD:"",currency:f.currency});
    setTimeout(()=>setMsg(""),2500);
  }
  const sorted=txns.slice().sort((a,b)=>(a.date<b.date?1:-1)).slice(0,30);
  return (
    <div style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:12,marginBottom:12,overflow:"hidden"}}>
      <button onClick={()=>setOpen(!open)} style={{width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",background:"none",border:"none",padding:"14px 16px",color:C.text,cursor:"pointer"}}>
        <span style={{fontSize:11,letterSpacing:3,textTransform:"uppercase",color:open?C.gold:C.text}}>Éditer les transactions</span>
        <span style={{fontSize:15,color:C.text3,transform:open?"rotate(90deg)":"none",transition:"transform .15s"}}>›</span>
      </button>
      {open && (
        <div style={{padding:"0 16px 16px"}}>
          <div style={{fontSize:10.5,color:C.text3,marginBottom:14,lineHeight:1.55}}>
            Les positions et la banque sont calculées à partir des transactions. Édite ici la <span style={{color:C.gold}}>source canonique</span>.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div><label style={lbl}>Date</label>
              <input type="date" value={f.date} onFocus={()=>setFocusK("date")} onBlur={()=>setFocusK("")} onChange={e=>up("date",e.target.value)} style={inp("date")}/></div>
            <div><label style={lbl}>Ticker</label>
              <input value={f.ticker} placeholder="NVDA" onFocus={()=>setFocusK("tk")} onBlur={()=>setFocusK("")} onChange={e=>up("ticker",e.target.value)} style={{...inp("tk"),textTransform:"uppercase",letterSpacing:1}}/></div>
            <div><label style={lbl}>Sens</label>
              <select value={f.side} onFocus={()=>setFocusK("sd")} onBlur={()=>setFocusK("")} onChange={e=>up("side",e.target.value)} style={{...inp("sd"),color:f.side==="SELL"?C.red:C.green,fontWeight:600}}>
                <option value="BUY" style={{color:C.text}}>Achat</option><option value="SELL" style={{color:C.text}}>Vente</option></select></div>
            <div><label style={lbl}>Devise</label>
              <select value={f.currency} onFocus={()=>setFocusK("cu")} onBlur={()=>setFocusK("")} onChange={e=>up("currency",e.target.value)} style={inp("cu")}>
                <option value="USD">USD</option><option value="EUR">EUR</option></select></div>
            <div><label style={lbl}>Quantité</label>
              <input type="number" value={f.qty} placeholder="10" onFocus={()=>setFocusK("qt")} onBlur={()=>setFocusK("")} onChange={e=>up("qty",e.target.value)} style={{...inp("qt"),fontVariantNumeric:"tabular-nums"}}/></div>
            <div><label style={lbl}>Montant ({f.currency})</label>
              <input type="number" value={f.valueUSD} placeholder="1500" onFocus={()=>setFocusK("mt")} onBlur={()=>setFocusK("")} onChange={e=>up("valueUSD",e.target.value)} style={{...inp("mt"),fontVariantNumeric:"tabular-nums"}}/></div>
          </div>
          <button onClick={submit} data-snd="txn" style={{width:"100%",background:`linear-gradient(180deg, ${C.gold}, ${C.gold}DD)`,border:"none",borderRadius:9,padding:"11px",color:"#0B0A08",fontSize:12,fontWeight:700,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",fontFamily:"inherit"}}>Ajouter la transaction</button>
          {msg && <div style={{fontSize:11.5,color:msg[0]==="✓"?C.green:C.red,marginTop:10,textAlign:"center"}}>{msg}</div>}
          <div style={{fontSize:9,letterSpacing:2.5,textTransform:"uppercase",color:C.text2,margin:"18px 0 8px",textAlign:"center"}}>Dernières transactions</div>
          <div style={{display:"flex",flexDirection:"column",maxHeight:280,overflowY:"auto"}}>
            {sorted.length===0
              ? <div style={{fontSize:11.5,color:C.text3,padding:10,textAlign:"center"}}>Aucune transaction.</div>
              : sorted.map((t,i)=>(
                  <div key={t.id||i} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 2px",borderBottom:`1px solid ${C.border}`,fontSize:11.5}}>
                    <span style={{color:C.text3,flex:"0 0 70px",fontVariantNumeric:"tabular-nums"}}>{t.date}</span>
                    <span style={{fontWeight:600,color:C.text,flex:"0 0 52px",letterSpacing:.5}}>{t.ticker}</span>
                    <span style={{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:5,flexShrink:0,background:(t.side==="SELL"?C.red:C.green)+"22",color:t.side==="SELL"?C.red:C.green}}>{t.side==="SELL"?"VENTE":"ACHAT"}</span>
                    <span style={{color:C.text2,flex:1,textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{(t.qty!=null?t.qty:"?")+" @ "+(t.valueUSD!=null?Math.round(t.valueUSD).toLocaleString("fr-FR"):"?")+" "+(t.currency||"USD")}</span>
                    {t.id!=null && <button onClick={()=>delTxn&&delTxn(t.id)} style={{background:"none",border:"none",color:C.text3,fontSize:16,cursor:"pointer",flexShrink:0,lineHeight:1,padding:"0 2px"}}>×</button>}
                  </div>
                ))}
          </div>
        </div>
      )}
    </div>
  );
}

// v4.17 — Panneau additif (lecture seule) : positions recalculées depuis les transactions
function ComputedPositions(props){
  var txns=props.txns;
  var positions = React.useMemo(function(){ return computeOpenPositions(txns||[]); }, [txns]);
  var ps=React.useState({}); var prices=ps[0], setPrices=ps[1];
  var vs=React.useState(false); var valuing=vs[0], setValuing=vs[1];
  var os=React.useState(false); var open=os[0], setOpen=os[1];
  var as=React.useState(false); var applied=as[0], setApplied=as[1];
  var fmtUSD=function(v){ return v==null?"—":"$"+Math.round(v).toLocaleString("fr-FR"); };
  var fmtQty=function(q){ var a=Math.abs(q); return a>=1?(Math.round(q*100)/100).toLocaleString("fr-FR"):String(Math.round(q*1e6)/1e6); };
  function valoriser(){
    setValuing(true);
    var out={};
    Promise.all(positions.map(function(p){
      var sym=(typeof YF_MAP!=="undefined"&&YF_MAP[p.ticker])||p.ticker;
      return fetchYahooCFmulti(p.ticker,sym).then(function(px){ if(px!=null) out[p.ticker]=px; }).catch(function(){});
    })).then(function(){ setPrices(out); setValuing(false); });
  }
  var totalInvested=positions.reduce(function(s,p){ return s+(p.investedUSD||0); },0);
  var totalValue=0, hasVal=false;
  positions.forEach(function(p){ var px=prices[p.ticker]; if(px!=null){ totalValue+=p.qty*px; hasVal=true; } });
  var th={flex:1,textAlign:"right"};
  return (
    <div style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:12}}>
      <div onClick={function(){setOpen(!open);}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:C.text}}>Positions calculées <span style={{fontSize:10,color:C.text3,fontWeight:500}}>(depuis les transactions)</span></div>
          <div style={{fontSize:10,color:C.text3,marginTop:2}}>{positions.length} positions · investi {fmtUSD(totalInvested)}</div>
        </div>
        <span style={{fontSize:16,color:C.text3,transform:open?"rotate(90deg)":"none",transition:"transform .15s"}}>›</span>
      </div>
      {open && (
        <div style={{marginTop:12}}>
          <button onClick={valoriser} disabled={valuing} style={{width:"100%",padding:"8px 0",marginBottom:8,borderRadius:8,border:`1px solid ${C.border}`,background:valuing?C.bg2:C.btc,color:valuing?C.text3:"#000",fontSize:12,fontWeight:700,cursor:valuing?"default":"pointer"}}>{valuing?"Valorisation…":"Valoriser au cours actuel"}</button>
          {props.applyPositions && <button onClick={function(){ props.applyPositions(); setApplied(true); }} style={{width:"100%",padding:"8px 0",marginBottom:10,borderRadius:8,border:`1px solid ${C.blue}`,background:C.blue+"22",color:C.blue,fontSize:12,fontWeight:700,cursor:"pointer"}}>{applied?"✓ Appliqué (aperçu) — recharge pour annuler":"Appliquer au portefeuille (aperçu)"}</button>}
          <div style={{display:"flex",fontSize:9,color:C.text3,fontWeight:700,textTransform:"uppercase",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{flex:2}}>Ticker</span><span style={th}>Qté</span><span style={th}>PRU $</span><span style={th}>Investi</span>{hasVal&&<span style={th}>Valeur</span>}{hasVal&&<span style={th}>+/−</span>}
          </div>
          {positions.map(function(p){
            var px=prices[p.ticker]; var val=px!=null?p.qty*px:null; var pnl=val!=null?val-p.investedUSD:null;
            return (
              <div key={p.ticker} style={{display:"flex",fontSize:11,color:C.text,padding:"6px 0",borderBottom:`1px solid ${C.border}66`,alignItems:"center"}}>
                <span style={{flex:2,fontWeight:700}}>{p.ticker}</span>
                <span style={th}>{fmtQty(p.qty)}</span>
                <span style={{flex:1,textAlign:"right",color:C.text2}}>{p.avgUSD!=null?("$"+(Math.round(p.avgUSD*100)/100).toLocaleString("fr-FR")):"—"}</span>
                <span style={{flex:1,textAlign:"right",color:C.text2}}>{fmtUSD(p.investedUSD)}</span>
                {hasVal&&<span style={th}>{val!=null?fmtUSD(val):"—"}</span>}
                {hasVal&&<span style={{flex:1,textAlign:"right",color:pnl==null?C.text3:(pnl>=0?C.green:C.red),fontWeight:700}}>{pnl!=null?((pnl>=0?"+":"")+fmtUSD(pnl)):"—"}</span>}
              </div>
            );
          })}
          {hasVal && <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:12,fontWeight:700}}><span style={{color:C.text2}}>Valeur totale estimée</span><span style={{color:C.text}}>{fmtUSD(totalValue)}</span></div>}
          <div style={{fontSize:9,color:C.text3,marginTop:8,lineHeight:1.5}}>Indicatif : coût moyen pondéré, en USD. La valorisation suppose un cours en USD (juste pour tes actions US ; les tickers EUR comme Paris seront approximatifs tant qu'on n'ajoute pas le change). Compare avec tes positions réelles — une quantité anormale révèle un doublon.</div>
        </div>
      )}
    </div>
  );
}
function PageData(

{EFF, hidden, txns, addTxn, delTxn, applyPositions, chartData, liveDD, liveGDBS, liveGC, liveGSB, liveCM, liveSM, liveTM, liveBench, liveInv, liveFutures, liveIbkrAnnex, kvRefreshTick, handleRefresh, refreshing, gistSync, onOpenKvDiag}){
  var _DD   = liveDD   || DD;
  var _INV  = liveInv  || INV_SEED_OK;
  // v1.0 CGI — force refresh KV après snapshot (kvRefreshTick incrémenté par App)
  React.useEffect(()=>{
    if(kvRefreshTick > 0){ setCloudData(null); setCloudLoading(false); }
  }, [kvRefreshTick]);
  var _FUT  = liveFutures || SEED_FUTURES;
  var _ANX  = liveIbkrAnnex || SEED_IBKR_ANNEX;
  var _GDBS = sanitizeGDBS(liveGDBS || GDBS);
  var _GC   = liveGC   || GC_FULL;
  var _GSB  = liveGSB  || GS_B100_EXT;
  var _CM   = liveCM   || CRYPTO_MONTHLY;
  var _SM   = liveSM   || STOCKS_MONTHLY;
  var _TM   = liveTM   || TOTAL_MONTHLY;
  var _BENCH = liveBench || BENCH_IDX;
  var db_state = useState("DD");
  var db = db_state[0]; var setDb = db_state[1];
  var search_state = useState(""); 
  var search = search_state[0]; var setSearch = search_state[1];
  var vm_state = useState("local");
  var viewMode = vm_state[0]; var setViewMode = vm_state[1];
  var cd_state = useState(null);
  var cloudData = cd_state[0]; var setCloudData = cd_state[1];
  var cl_state = useState(false);
  var cloudLoading = cl_state[0]; var setCloudLoading = cl_state[1];
  var ce_state = useState(null);
  var cloudError = ce_state[0]; var setCloudError = ce_state[1];
  var eb_state = useState(null);
  var expandedBase = eb_state[0]; var setExpandedBase = eb_state[1];

  var src = EFF || CURRENT;

  function doLoadCloud(){
    window.__cgiKvRefresh = doLoadCloud; // toujours pointer vers version fraîche
    setCloudLoading(true);
    setCloudError(null);
    fetch(CF_WORKER_URL+"/read", {
      headers:{"X-Auth-Key":CF_AUTH_KEY},
      signal: AbortSignal.timeout(18000),
    })
      .then(function(r){
        return r.json().then(function(d){
          if(!r.ok) throw new Error("HTTP "+r.status+" — "+(d.error||"erreur inconnue"));
          return d;
        });
      })
      .then(function(d){
        setCloudData(d);
        setCloudLoading(false);

      })
      .catch(function(e){ setCloudError(e.message); setCloudLoading(false); });
  }

  function handleViewMode(mode){
    setViewMode(mode);

  }

  // v2.07 — charger KV quand l'utilisateur clique sur "Cloudflare KV" (viewMode change)
  React.useEffect(function(){
    if(viewMode==="cloud") doLoadCloud();
  }, [viewMode]);

  function getLast(arr){ return (arr && arr.length>0 && arr[arr.length-1]) ? (arr[arr.length-1][0]||"—") : "—"; }
  function fmt(v){ return v!=null ? v.toLocaleString("fr-FR") : "—"; }
  function fmtF(v,d){ return v!=null ? v.toFixed(d) : "—"; }
  function fmtPnl(v){ return v!=null ? (v>=0?"+":"")+v.toLocaleString("fr-FR") : "—"; }
  function fmtPct(v){ return v!=null ? (v*100).toFixed(1)+"%" : "—"; }

  var portfolioItems = (EFF||CURRENT).portfolio && (EFF||CURRENT).portfolio.items ? (EFF||CURRENT).portfolio.items : [];
  var portfolioDate  = (EFF||CURRENT).portfolio && (EFF||CURRENT).portfolio.date ? (EFF||CURRENT).portfolio.date : "—";

  var DATABASES = {
    "DD": {
      label:"DD — Historique quotidien",
      desc:"Valeurs quotidiennes depuis 2020 ("+_DD.length+" points)",
      headers:["Date","Crypto EUR","Total EUR","BTC $","CGIS $","usdEur"],
      rows: _DD.slice().reverse().map(function(r){return[r[0],fmt(r[1]),fmt(r[2]),fmt(r[3]),fmtF(r[4],4),fmtF(r[5],6)];}),
    },
    "CGIS_CGIC": {
      label:"CGIS/CGIC · Cours journaliers",
      desc:"Cours CGIS et CGIC depuis jan 2026 ("+_GDBS.length+" points)",
      headers:["Date","CGIS $","CGIC $"],
      rows: _GDBS.slice().reverse().map(function(r){return[r[0],fmtF(r[1],4),fmtF(r[2],4)];}),
    },
    "GC_FULL": {
      label:"CGIC · Historique cours",
      desc:"Cours CGIC depuis 2020 ("+_GC.length+" points)",
      headers:["Date","CGIC $"],
      rows: _GC.slice().reverse().map(function(r){return[r[0],fmtF(r[1],4)];}),
    },
    "GS_B100": {
      label:"CGIS · Base 100",
      desc:"CGIS base 100 depuis jan 2026 ("+_GSB.length+" points)",
      headers:["Date","CGIS base100"],
      rows: _GSB.slice().reverse().map(function(r){return[r[0],fmtF(r[1],3)];}),
    },
    "BENCH_IDX": {
      label:"BENCH_IDX — Indices de référence",
      desc:"BTC/ETH/SP500/NASDAQ/MSCI World depuis 2020 ("+_BENCH.length+" points)",
      headers:["Date","BTC $","ETH $","S&P 500","Nasdaq","MSCI World"],
      rows: _BENCH.slice().reverse().map(function(r){return[r[0],fmtF(r[1],0),fmtF(r[2],2),fmtF(r[3],2),fmtF(r[4],2),fmtF(r[5],2)];}),
    },
    "DB": {
      label:"DB — Indices base 100",
      desc:"Indices base 100 depuis 2023 ("+DB.length+" points)",
      headers:["Date","Port","Idx1","Idx2","Idx3","Idx4","Idx5"],
      rows: DB.slice().reverse().map(function(r){return[r[0]].concat(r.slice(1).map(function(v){return fmtF(v,1);}));}),
    },
    "PORTFOLIO": {
      label:"Portfolio — Vue unifiee",
      desc:"Toutes les positions au "+portfolioDate,
      headers:["Ticker","Cat","Qty","Live $","Val $","Val EUR","P&L $"],
      rows: portfolioItems.map(function(x){return[x.t,x.cat,x.qty,fmtF(x.live,2),"$"+fmt(x.val),fmt(x.valEUR)+"EUR",fmtPnl(x.pnl)];}),
    },
    "CRYPTO": {
      label:"Crypto — Positions",
      desc:"Detail crypto live",
      headers:["Ticker","Qty","PA $","Live $","Val $","P&L $","%"],
      rows: src.crypto.items.map(function(x){return[x.t,x.qty,fmtF(x.pa,2),fmtF(x.live,0),"$"+fmt(x.val),fmtPnl(x.pnl),fmtPct(x.pct)];}),
    },
    "STOCKS": {
      label:"Stocks — Positions",
      desc:"Detail stocks live",
      headers:["Ticker","Cat","Qty","PA $","Live $","Val $","P&L $"],
      rows: src.stocks.items.map(function(x){return[x.t,x.cat,x.qty,fmtF(x.pa,2),fmtF(x.live,2),"$"+fmt(x.val),fmtPnl(x.pnl)];}),
    },
    "BANK": {
      label:"Banque — Cash Matelas",
      desc:"Comptes bancaires",
      headers:["Banque","Solde EUR","Solde USD"],
      rows: Object.entries(src.bank && src.bank.breakdown ? src.bank.breakdown : {}).map(function(e){
        var name=e[0]; var valEUR=e[1];
        var valUSD = Math.round(valEUR*(src.eurUsd||1.173));
        return[name, valEUR.toLocaleString("fr-FR")+" EUR", valUSD.toLocaleString("fr-FR")+" $"];
      }),
    },
    "TXNS": {
      label:"Transactions — Achats / Ventes",
      desc:"Journal de toutes les transactions ("+(txns||[]).length+" lignes)",
      headers:["Date","Type","Ticker","Cat","Qty","Prix $","Montant $","Contrepartie","Note"],
      rows: (txns||[]).slice().sort(function(a,b){return b.date.localeCompare(a.date);}).map(function(t){
        var valo = Math.round((t.qty||0)*(t.price||0));
        return[t.date, t.side, t.ticker, t.cat||"—", t.qty, fmtF(t.price,2), "$"+fmt(valo), t.bankAccount||"—", t.note||""];
      }),
    },
    "SNAPSHOTS": {
      label:"Snapshots journaliers",
      desc:"Historique des snapshots ("+(chartData||[]).length+" points)",
      headers:["Date","Total EUR","Total USD","usdEur","CGIS","CGIC"],
      rows: (chartData||[]).slice().sort(function(a,b){return b.d.localeCompare(a.d);}).map(function(s){
        // v23.07 — mapping corrigé : champs réels + repli mensuel, Total USD calculé
        var eurTot = (s.ao!=null ? s.ao : s.t);                 // ao (quotidien) ou t (mensuel)
        var usdTot = (eurTot!=null && s.eur) ? Math.round(eurTot / s.eur) : null; // EUR / usdEur
        var gdbS   = (s.gdbs!=null ? s.gdbs : s.gs);            // gdbs (col Q) ou gs (col AM)
        var gdbC   = (s.gc!=null ? s.gc : s.gdbc);              // gc (col AF) = GDB.C réel
        return[s.d, eurTot!=null?eurTot:"—", usdTot!=null?usdTot:"—", s.eur||"—", gdbS!=null?gdbS:"—", gdbC!=null?gdbC:"—"];
      }),
    },
    "MONTHLY": {
      label:"Crypto Monthly",
      desc:"P&L mensuel crypto depuis 2020",
      headers:["An","Mois","BOM","EOM","P&L","Inv","%"],
      rows: (function(){var out=[];Object.entries(_CM).forEach(function(e){var yr=e[0];var d=e[1];d.m.forEach(function(m,i){if(d.bom[i]==null)return;out.push([yr,m,fmt(d.bom[i]),fmt(d.eom[i]),fmtPnl(d.pnl[i]),(d.inv&&d.inv[i]!=null&&d.inv[i]!==0)?(d.inv[i]>0?"+":"")+d.inv[i].toLocaleString("fr-FR"):"—",fmtPct(d.pct[i])]);});});return out.reverse();})(),
    },
    "STOCKS_M": {
      label:"Stocks Monthly",
      desc:"P&L mensuel actions depuis 2026",
      headers:["An","Mois","BOM","EOM","P&L","Inv","%"],
      rows: (function(){var out=[];Object.entries(_SM).forEach(function(e){var yr=e[0];var d=e[1];d.m.forEach(function(m,i){if(d.bom[i]==null)return;out.push([yr,m,fmt(d.bom[i]),fmt(d.eom[i]),fmtPnl(d.pnl[i]),(d.inv&&d.inv[i]!=null&&d.inv[i]!==0)?(d.inv[i]>0?"+":"")+d.inv[i].toLocaleString("fr-FR"):"—",fmtPct(d.pct[i])]);});});return out.reverse();})(),
    },
    "TOTAL_M": {
      label:"Total Monthly",
      desc:"P&L mensuel total portefeuille depuis 2026",
      headers:["An","Mois","BOM","EOM","P&L","Inv","%"],
      rows: (function(){var out=[];Object.entries(_TM).forEach(function(e){var yr=e[0];var d=e[1];d.m.forEach(function(m,i){if(d.bom[i]==null)return;out.push([yr,m,fmt(d.bom[i]),fmt(d.eom[i]),fmtPnl(d.pnl[i]),(d.inv&&d.inv[i]!=null&&d.inv[i]!==0)?(d.inv[i]>0?"+":"")+d.inv[i].toLocaleString("fr-FR"):"—",fmtPct(d.pct[i])]);});});return out.reverse();})(),
    },
    "INV": {
      label:"INV — Investissements (parts fonds)",
      desc:"Mouvements de parts dans les fonds CGIC / CGIS ("+_INV.length+" lignes)",
      headers:["Date","Fonds","Investisseur","Sens","Parts","Cours €","Montant €"],
      rows: _INV.slice().sort(function(a,b){return (b.date||"").localeCompare(a.date||"");}).map(function(m){
        return[m.date, m.fonds, m.holder, m.io, fmtF(m.shares,2), fmtF(m.vps,2), fmt(Math.round(m.montant))];
      }),
    },
    "FUTURES": {
      label:"FUTURES \u2014 Trades clotures",
      desc:"Positions futures cloturees ("+_FUT.length+" trades)",
      headers:["Fermeture","Ticker","Sens","PnL $","%/marge","Levier","Duree j","Notionnel $","Marge $"],
      rows: _FUT.slice().sort(function(a,b){return (b.closeDate||"").localeCompare(a.closeDate||"");}).map(function(t){
        return[t.closeDate, t.ticker, t.dir, fmt(Math.round(t.realizedPnlUSD)), (t.pctOnMargin!=null?t.pctOnMargin+"%":"-"), "x"+t.leverage, t.durationDays, fmt(Math.round(t.entryNotionalUSD)), fmt(Math.round(t.marginUSD))];
      }),
    },
    "ANNEX": {
      label:"ANNEX \u2014 IBKR (div./interets/taxes/frais)",
      desc:"Lignes non-trade IBKR ("+_ANX.length+" lignes)",
      headers:["Date","Type","Ticker","Devise","Montant","USD"],
      rows: _ANX.slice().sort(function(a,b){return (b.date||"").localeCompare(a.date||"");}).map(function(a){
        return[a.date, a.type, a.ticker||"-", a.ccy, fmtF(a.amount,2), fmt(Math.round(a.valueUSD))];
      }),
    },
    "YF_MAP": {
      label:"YF_MAP — Tickers Yahoo Finance",
      desc:"Correspondance ticker interne -> symbole Yahoo ("+(Object.keys(YF_MAP).length)+" tickers)",
      headers:["Ticker","Symbole Yahoo","Bourse EU"],
      rows: Object.entries(YF_MAP).map(function(e){
        var t=e[0]; var sym=e[1];
        var isEU=[".PA",".MI",".AS",".BR",".DE",".F",".L"].some(function(s){return sym.endsWith(s);});
        return[t, sym, isEU ? "OUI" : "—"];
      }),
    },
    "CUSTOM_ICONS": {
      label:"ICON_DB — Base d'icônes (user + FMP)",
      desc:"Icônes stockées en base ("+(Object.keys(ICON_DB).length)+" tickers)",
      headers:["Ticker","Icône user","Logo FMP"],
      rows: Object.entries(ICON_DB).map(function(e){return[e[0], e[1].user||"—", e[1].fmp?"✓ "+e[1].fmp.slice(0,40):"—"];}),
    },
  };

  var currentDB = DATABASES[db];
  var filtered = search
    ? currentDB.rows.filter(function(r){return r.some(function(v){return String(v||"").toLowerCase().indexOf(search.toLowerCase())>=0;});})
    : currentDB.rows;

  function countMonthly(obj){ var n=0; Object.values(obj||{}).forEach(function(d){ n+=(d.m||[]).filter(function(_,i){return d.bom&&d.bom[i]!=null;}).length; }); return n; }
  function lastMonthly(obj){ var yrs=Object.keys(obj||{}).sort(); if(!yrs.length)return"—"; var yr=yrs[yrs.length-1];var d=obj[yr];var ms=(d&&d.m||[]).filter(function(_,i){return d.bom&&d.bom[i]!=null;});return yr+" "+(ms.length?ms[ms.length-1]:""); }

  var LOCAL_SUMMARY = [
    // Séries temporelles
    {name:"DD",          dbKey:"DD",          count:_DD.length,              last:getLast(_DD)},
    {name:"CGIS/CGIC",   dbKey:"CGIS_CGIC",    count:_GDBS.length,            last:getLast(_GDBS)},
    {name:"CGIC · Historique cours",  dbKey:"GC_FULL",  count:_GC.length,    last:getLast(_GC)},
    {name:"CGIS · Base 100",          dbKey:"GS_B100",  count:_GSB.length,   last:getLast(_GSB)},
    {name:"Benchmarks marchés",       dbKey:"BENCH_IDX",count:_BENCH.length,  last:getLast(_BENCH)},
    {name:"Comparaison base 100",     dbKey:"DB",       count:DB.length,      last:getLast(DB)},
    // Monthly
    {name:"CRYPTO_M",    dbKey:"MONTHLY",      count:countMonthly(_CM),       last:lastMonthly(_CM)},
    {name:"STOCKS_M",    dbKey:"STOCKS_M",     count:countMonthly(_SM),       last:lastMonthly(_SM)},
    {name:"TOTAL_M",     dbKey:"TOTAL_M",      count:countMonthly(_TM),       last:lastMonthly(_TM)},
    // Portfolio live
    {name:"Portfolio",   dbKey:"PORTFOLIO",    count:portfolioItems.length,   last:portfolioDate},
    {name:"Crypto",      dbKey:"CRYPTO",       count:(src.crypto&&src.crypto.items?src.crypto.items.length:0), last:(EFF||CURRENT).date||"—"},
    {name:"Stocks",      dbKey:"STOCKS",       count:(src.stocks&&src.stocks.items?src.stocks.items.length:0), last:(EFF||CURRENT).date||"—"},
    {name:"Banque",      dbKey:"BANK",         count:(src.bank&&src.bank.breakdown?Object.keys(src.bank.breakdown).length:0), last:"EUR"},
    // Transactions & snapshots
    {name:"Transactions",dbKey:"TXNS",         count:(txns||[]).length,       last:(txns&&txns.length>0?txns[txns.length-1].date:"—")},
    {name:"Snapshots",   dbKey:"SNAPSHOTS",    count:(chartData||[]).length,  last:(chartData&&chartData.length>0?chartData[chartData.length-1].d:"—")},
    // Références
    {name:"INV (parts)", dbKey:"INV",          count:_INV.length,             last:(_INV.length?_INV.map(function(m){return m.date||"";}).sort().reverse()[0]:"")},
    {name:"FUTURES",     dbKey:"FUTURES",      count:_FUT.length,             last:(_FUT.length?_FUT.map(function(t){return t.closeDate||"";}).sort().reverse()[0]:"")},
    {name:"IBKR annexe",  dbKey:"ANNEX",        count:_ANX.length,             last:(_ANX.length?_ANX.map(function(a){return a.date||"";}).sort().reverse()[0]:"")},
    {name:"YF_MAP",      dbKey:"YF_MAP",       count:Object.keys(YF_MAP).length, last:"tickers"},
    {name:"CUSTOM_ICONS",dbKey:"CUSTOM_ICONS", count:Object.keys(ICON_DB).length, last:"icones"},
  ];

  return(
    <div>
      {/* #1 — déplacés depuis Réglages : maintenance des données */}
      <div style={{display:"grid",gap:8,marginBottom:14}}>
        <button onClick={handleRefresh} disabled={refreshing} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.bg1,cursor:refreshing?"not-allowed":"pointer",fontFamily:"inherit"}}>
          <span style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:18}}>↺</span><span style={{fontSize:13,fontWeight:700,color:C.text}}>Actualiser les prix</span></span>
          <span style={{fontSize:12,color:refreshing?C.btc:C.gray}}>{refreshing?"…":"›"}</span>
        </button>
        <button onClick={onOpenKvDiag} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.bg1,cursor:"pointer",fontFamily:"inherit"}}>
          <span style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:18}}>{gistSync?"☁︎":"✗"}</span><span style={{fontSize:13,fontWeight:700,color:C.text}}>Connexion Cloudflare KV</span></span>
          <span style={{fontSize:12,color:gistSync?C.green:C.red}}>{gistSync?"Connecté":"Erreur"}</span>
        </button>
      </div>
      <HomeTruthTable EFF={EFF} liveCM={liveCM} liveSM={liveSM} hidden={hidden}/>
      <TxnEditor txns={txns} addTxn={addTxn} delTxn={delTxn}/>
      <ComputedPositions txns={txns} applyPositions={applyPositions}/>
      <div style={{display:"flex",gap:6,background:C.bg2,borderRadius:10,padding:4,marginBottom:12}}>
        {["local","cloud"].map(function(k){
          var l = k==="local" ? "Bases locales" : "Cloudflare KV";
          return(
            <button key={k} onClick={function(){handleViewMode(k);}} style={{
              flex:1,padding:"7px 0",borderRadius:8,fontSize:11,fontWeight:700,
              border:"none",cursor:"pointer",
              background:viewMode===k?C.btc:"transparent",
              color:viewMode===k?"#000":C.gray,
            }}>{l}</button>
          );
        })}
      </div>

      {viewMode==="local" ? (
        <div>
          <div style={{background:C.bg2,borderRadius:10,padding:"10px 12px",marginBottom:10,border:"1px solid "+C.border}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:9,color:C.gray,letterSpacing:1,textTransform:"uppercase"}}>📱 Bases locales</div>
              <div style={{fontSize:10,fontWeight:700,color:C.btc}}>{LOCAL_SUMMARY.length} bases</div>
            </div>
            {LOCAL_SUMMARY.map(function(b,i){
              var dbKey = b.dbKey || null;
              var isOpen = expandedBase === b.name;
              var previewDB = dbKey ? DATABASES[dbKey] : null;
              return(
                <div key={i} style={{borderBottom:i<LOCAL_SUMMARY.length-1?"1px solid "+C.border+"33":"none"}}>
                  <button onClick={function(){setExpandedBase(isOpen?null:b.name);}} style={{
                    display:"flex",justifyContent:"space-between",alignItems:"center",
                    width:"100%",background:"transparent",border:"none",cursor:"pointer",
                    padding:"7px 0",textAlign:"left",
                  }}>
                    <span style={{fontSize:11,fontWeight:700,color:isOpen?C.btc:C.teal,fontFamily:C.font}}>{b.name}</span>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:11,color:C.text}}>{b.count} entrées</span>
                      <span style={{fontSize:9,color:C.gray}}>{b.last}</span>
                      <span style={{fontSize:10,color:isOpen?C.btc:C.gray,transition:"transform .2s",display:"inline-block",transform:isOpen?"rotate(90deg)":"rotate(0deg)"}}>▶</span>
                    </div>
                  </button>
                  {isOpen && previewDB && (
                    <div style={{marginBottom:8,borderRadius:8,overflow:"hidden",border:"1px solid "+C.border+"66"}}>
                      <div style={{fontSize:9,color:C.gray,padding:"5px 8px",background:C.bg3,borderBottom:"1px solid "+C.border+"44"}}>
                        {previewDB.desc} — {Math.min(100, previewDB.rows.length)} / {previewDB.rows.length} lignes
                      </div>
                      <div style={{overflowX:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                          <thead>
                            <tr style={{background:C.bg3}}>
                              {previewDB.headers.map(function(h,hi){return(
                                <th key={hi} style={{padding:"4px 7px",textAlign:"left",color:C.gray,fontWeight:700,borderBottom:"1px solid "+C.border+"44",whiteSpace:"nowrap"}}>{h}</th>
                              );})}
                            </tr>
                          </thead>
                          <tbody>
                            {previewDB.rows.slice(0,100).map(function(row,ri){return(
                              <tr key={ri} style={{background:ri%2===0?"transparent":C.bg2+"55"}}>
                                {row.map(function(cell,ci){return(
                                  <td key={ci} style={{padding:"4px 7px",color:ci===0?C.btc:C.text,fontFamily:ci===0?"monospace":"inherit",whiteSpace:"nowrap"}}>{cell}</td>
                                );})}
                              </tr>
                            );})}
                            {previewDB.rows.length===0 && (
                              <tr><td colSpan={previewDB.headers.length} style={{padding:"8px",color:C.gray,fontSize:10,textAlign:"center"}}>Base vide</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {isOpen && !previewDB && (
                    <div style={{fontSize:10,color:C.gray,padding:"6px 0 8px"}}>Aperçu non disponible</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:11,color:C.gray}}>Données stockées dans Cloudflare KV</div>
              <div style={{fontSize:10,fontWeight:700,color:C.btc}}>16 bases</div>
            </div>
            <button onClick={doLoadCloud} style={{background:C.bg2,border:"1px solid "+C.border,borderRadius:8,padding:"5px 12px",color:C.teal,fontSize:11,fontWeight:700,cursor:"pointer"}}>Actualiser</button>
          </div>
          {cloudLoading && <div style={{textAlign:"center",padding:"30px 0",color:C.gray,fontSize:13}}>Chargement (peut prendre jusqu'à 10s)...</div>}
          {cloudError  && <div style={{background:C.red+"15",border:"1px solid "+C.red+"44",borderRadius:8,padding:"12px",color:C.red,fontSize:11}}>Erreur : {cloudError}</div>}
          {cloudData && !cloudLoading && <CloudKeyList data={cloudData} onRefresh={doLoadCloud}/>}
        </div>
      )}
    </div>
  );
}


// v25.02 Phase 2b (B-mid) — recompute RUNTIME des points de cours CGIC post-Chart depuis le
// cumul DB. Le KV ecrase le build (unionSeriesByDate priorise KV), donc on recalcule apres merge,
// de facon deterministe : cours$(date) = cryptoEUR(date) / (usdEur(date) × parts_cumul_C(date)).
// Borne a (CUT, END] = fenetre historique ou KuCoin=0 (END = derniere date build GC_FULL).
function recomputeGcFromDB(gcArr, ddArr, invArr){
  if(!Array.isArray(gcArr) || !gcArr.length) return gcArr;
  const CUT = "2026-01-12";
  const END = (GC_FULL.length ? GC_FULL[GC_FULL.length-1][0] : "2026-05-17");
  const dd = (Array.isArray(ddArr) && ddArr.length) ? ddArr : DD;
  const ce = {}, ue = {};
  dd.forEach(function(r){ ce[r[0]] = r[1]; ue[r[0]] = r[5]; });
  const movs = ((Array.isArray(invArr) && invArr.length) ? invArr : INV_SEED_OK)
    .filter(function(m){ return m && m.fonds === "CGIC"; })
    .slice().sort(function(a,b){ return (a.date||"").localeCompare(b.date||""); });
  function cumC(d){ var s=0; for(var i=0;i<movs.length;i++){ if(movs[i].date<=d) s+=movs[i].shares; else break; } return s; }
  return gcArr.map(function(r){
    const d = r[0];
    if(d <= CUT || d > END) return r;
    const c = ce[d], u = ue[d], p = cumC(d);
    if(c==null || u==null || !p) return r;
    return [d, parseFloat((c/(u*p)).toFixed(4))].concat(r.slice(2));
  });
}
// ══════════════════════════════════════════════════════════════════════════════
// CGI v4.0 — P2 : NOTIFICATIONS + TELEGRAM
// ══════════════════════════════════════════════════════════════════════════════
var CGI_NOTIF_KEY = 'cgi_notifications'; // localStorage dédié (hors gros conteneur)

function cgiNotifLoad(){ try{ var r=JSON.parse(localStorage.getItem(CGI_NOTIF_KEY)||'[]'); return Array.isArray(r)?r:[]; }catch(e){ return []; } }
function cgiNotifSaveRaw(arr){ try{ localStorage.setItem(CGI_NOTIF_KEY,JSON.stringify(arr.slice(0,80))); }catch(e){ console.warn('[notif] save failed:',e.message); } }
function cgiNotifEmit(){ try{ window.dispatchEvent(new CustomEvent('cgi-notif')); }catch(e){} }

async function cgiTelegramSend(text){
  try{
    var r=await fetch(CF_WORKER_URL+"/telegram-send",{
      method:"POST",
      headers:{"Content-Type":"application/json","X-Auth-Key":CF_AUTH_KEY},
      body:JSON.stringify({text:text}),
      signal:AbortSignal.timeout(10000)
    });
    var d=null; try{ d=await r.json(); }catch(e){}
    if(r.ok && d && d.ok) return {ok:true, error:null};
    return {ok:false, error:(d&&d.error)||("HTTP "+r.status)};
  }catch(e){ return {ok:false, error:"réseau: "+(e&&e.message||"timeout")}; }
}

// n = { type, emoji, title, body, dedupeKey?, telegram? }
function cgiNotifPush(n){
  var arr=cgiNotifLoad();
  if(n.dedupeKey && arr.some(function(x){return x.dedupeKey===n.dedupeKey;})) return false;
  var notif={
    id:'n_'+Date.now()+'_'+Math.floor(Math.random()*10000),
    type:n.type||'info', emoji:n.emoji||'🔔',
    title:n.title||'', body:n.body||'',
    ts:Date.now(), read:false, dedupeKey:n.dedupeKey||null
  };
  arr.unshift(notif);
  cgiNotifSaveRaw(arr);
  cgiNotifEmit();
  if(n.telegram){ cgiTelegramSend((n.emoji||'🔔')+' '+(n.title||'')+(n.body?"\n"+n.body:"")); }
  return true;
}
function cgiNotifMarkAllRead(){ var a=cgiNotifLoad(); var any=a.some(function(x){return !x.read;}); if(!any) return; cgiNotifSaveRaw(a.map(function(x){return {...x,read:true};})); cgiNotifEmit(); }
function cgiNotifClear(){ cgiNotifSaveRaw([]); cgiNotifEmit(); }
function cgiNotifTimeAgo(ts){
  var s=Math.floor((Date.now()-ts)/1000);
  if(s<60) return "à l'instant";
  if(s<3600) return Math.floor(s/60)+" min";
  if(s<86400) return Math.floor(s/3600)+" h";
  return Math.floor(s/86400)+" j";
}

function NotifBell(){
  const[open,setOpen]   = useState(false);
  const[items,setItems] = useState(cgiNotifLoad());
  const[view,setView]   = useState("list"); // "list" | "settings"
  const[tgToken,setTgToken] = useState("");
  const[tgChat,setTgChat]   = useState("");
  const[tgStatus,setTgStatus] = useState(null);
  const[tgMsg,setTgMsg]     = useState("");

  useEffect(function(){
    function refresh(){ setItems(cgiNotifLoad()); }
    window.addEventListener('cgi-notif',refresh);
    return function(){ window.removeEventListener('cgi-notif',refresh); };
  },[]);

  useEffect(function(){
    if(open && view==="settings" && tgStatus==null){
      fetch(CF_WORKER_URL+"/telegram-config",{headers:{"X-Auth-Key":CF_AUTH_KEY},signal:AbortSignal.timeout(18000)})
        .then(function(r){return r.json();})
        .then(function(d){ setTgStatus(d); if(d&&d.chatId) setTgChat(d.chatId); })
        .catch(function(){ setTgStatus({configured:false}); });
    }
  },[open,view]);

  var unread=items.filter(function(x){return !x.read;}).length;
  var C2=(typeof C!=="undefined")?C:{};
  var bg=C2.bg2||"#11131A", border=C2.border||"#222", text=C2.text||"#EEE", gray=C2.text3||C2.gray||"#888";
  var green=C2.green||"#22C55E", red=C2.red||"#EF4444", blue=C2.blue||"#3B82F6", btc=C2.btc||"#F7931A";

  function closePanel(){ setOpen(false); cgiNotifMarkAllRead(); }

  async function saveTg(){
    var tk=tgToken.replace(/\s+/g,""); // retire tout espace parasite du token
    if(!tk||!tgChat.trim()){ setTgMsg("Token et Chat ID requis."); return; }
    setTgMsg("Enregistrement…");
    try{
      var r=await fetch(CF_WORKER_URL+"/telegram-config",{
        method:"POST",headers:{"Content-Type":"application/json","X-Auth-Key":CF_AUTH_KEY},
        body:JSON.stringify({token:tk,chatId:tgChat.trim()}),signal:AbortSignal.timeout(10000)});
      var d=await r.json();
      if(d.ok){ setTgMsg("✓ Enregistré dans le KV."); setTgToken(""); setTgStatus({configured:true,chatId:tgChat.trim()}); }
      else setTgMsg("Erreur : "+(d.error||("HTTP "+r.status)));
    }catch(e){ setTgMsg("Erreur réseau (worker injoignable ?)."); }
  }
  async function testTg(){    setTgMsg("Envoi du test…");
    // Si un token est saisi, on l'enregistre d'abord (Tester lit le KV, pas le formulaire)
    var tk=tgToken.replace(/\s+/g,"");
    if(tk){
      if(!tgChat.trim()){ setTgMsg("Chat ID requis."); return; }
      try{
        var rc=await fetch(CF_WORKER_URL+"/telegram-config",{
          method:"POST",headers:{"Content-Type":"application/json","X-Auth-Key":CF_AUTH_KEY},
          body:JSON.stringify({token:tk,chatId:tgChat.trim()}),signal:AbortSignal.timeout(10000)});
        var dc=await rc.json();
        if(!dc.ok){ setTgMsg("Config non enregistrée : "+(dc.error||("HTTP "+rc.status))); return; }
        setTgStatus({configured:true,chatId:tgChat.trim()}); setTgToken("");
      }catch(e){ setTgMsg("Erreur réseau (config) — worker redéployé ?"); return; }
    }
    var res=await cgiTelegramSend("Test CGI — notifications Telegram operationnelles.");
    setTgMsg(res.ok ? "✓ Message de test envoyé." : ("Échec : "+(res.error||"inconnu")));
  }
  async function forceCheck(){
    setTgMsg("🔄 Vérification en cours…");
    try{
      var r=await fetch(CF_WORKER_URL+"/check-now",{method:"POST",
        headers:{"X-Auth-Key":CF_AUTH_KEY},signal:AbortSignal.timeout(20000)});
      var d=await r.json();
      setTgMsg(d.ok?"✓ Vérification lancée — regarde Telegram.":("Erreur : "+(d.error||("HTTP "+r.status))));
    }catch(e){ setTgMsg("Erreur réseau (worker redéployé ?)."); }
  }

  var inp={width:"100%",background:C2.bg||"#07080D",border:"1px solid "+border,borderRadius:8,padding:"8px 10px",color:text,fontSize:13,boxSizing:"border-box"};
  var lbl={display:"block",fontSize:11,color:gray,marginBottom:4};

  // ── Bouton cloche (inline dans le header, ou flottant en repli) ──
  var inline=!!(arguments[0]&&arguments[0].inline);
  var bellStyle=inline
    ? {position:"relative",width:32,height:32,borderRadius:C2.radiusSm||8,background:"transparent",border:"1px solid "+(C2.border2||border),color:(C2.text2||text),fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}
    : {position:"fixed",top:10,right:12,zIndex:200,width:38,height:38,borderRadius:"50%",background:bg,border:"1px solid "+border,color:text,fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 8px #0006"};
  var bell=React.createElement("button",{
    onClick:function(){ setOpen(true); },
    "aria-label":"Notifications",
    style:bellStyle
  },
    React.createElement(Icon,{name:"bell",size:17,color:(C2.text2||text)}),
    unread>0&&React.createElement("span",{style:{position:"absolute",top:-4,right:-4,minWidth:18,height:18,padding:"0 4px",
      borderRadius:9,background:red,color:"#fff",fontSize:10,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid "+(C2.bg||"#07080D")}},
      unread>9?"9+":unread)
  );

  if(!open) return bell;

  // ── Panel ──
  var headerTabs=React.createElement("div",{style:{display:"flex",gap:6}},
    React.createElement("button",{onClick:function(){setView("list");},style:{background:view==="list"?btc:bg,border:"1px solid "+(view==="list"?btc:border),borderRadius:8,padding:"4px 10px",color:view==="list"?"#000":gray,fontSize:11,fontWeight:700,cursor:"pointer"}},"Notifications"),
    React.createElement("button",{onClick:function(){setView("settings");},style:{background:view==="settings"?btc:bg,border:"1px solid "+(view==="settings"?btc:border),borderRadius:8,padding:"4px 10px",color:view==="settings"?"#000":gray,fontSize:11,fontWeight:700,cursor:"pointer"}},"⚙️ Telegram")
  );

  var listView=React.createElement("div",{style:{overflowY:"auto",flex:1,padding:"0 12px 12px"}},
    items.length===0
      ? React.createElement("div",{style:{textAlign:"center",padding:36,color:gray,fontSize:13}},"Aucune notification.")
      : items.map(function(n){
          return React.createElement("div",{key:n.id,style:{display:"flex",gap:10,padding:"10px 8px",borderBottom:"1px solid "+border,opacity:n.read?0.62:1}},
            React.createElement("span",{style:{fontSize:18,flexShrink:0,marginTop:1}},n.emoji||"🔔"),
            React.createElement("div",{style:{flex:1,minWidth:0}},
              React.createElement("div",{style:{fontSize:13,fontWeight:700,color:text}},n.title),
              n.body&&React.createElement("div",{style:{fontSize:11,color:gray,lineHeight:1.4,marginTop:2,whiteSpace:"pre-wrap"}},n.body)
            ),
            React.createElement("span",{style:{fontSize:9,color:gray,flexShrink:0,marginTop:2}},cgiNotifTimeAgo(n.ts)),
            !n.read&&React.createElement("span",{style:{width:7,height:7,borderRadius:"50%",background:blue,flexShrink:0,marginTop:5}})
          );
        })
  );

  var settingsView=React.createElement("div",{style:{overflowY:"auto",flex:1,padding:"4px 16px 16px"}},
    React.createElement("div",{style:{fontSize:11,color:gray,marginBottom:12,lineHeight:1.5}},
      "Le token est stocké dans le KV Cloudflare (jamais sur GitHub). Renseigne-le une fois ici."),
    tgStatus&&React.createElement("div",{style:{fontSize:11,marginBottom:12,color:tgStatus.configured?green:gray}},
      tgStatus.configured?("✓ Configuré"+(tgStatus.chatId?(" · chat "+tgStatus.chatId):"")+(tgStatus.tokenHint?(" · token "+tgStatus.tokenHint):"")):"Non configuré"),
    React.createElement("label",{style:lbl},"Bot Token"),
    React.createElement("input",{value:tgToken,placeholder:"123456:ABC… (collé une fois)",onChange:function(e){setTgToken(e.target.value);},style:{...inp,marginBottom:10}}),
    React.createElement("label",{style:lbl},"Chat ID"),
    React.createElement("input",{value:tgChat,placeholder:"7592951435",onChange:function(e){setTgChat(e.target.value);},style:{...inp,marginBottom:14}}),
    React.createElement("div",{style:{display:"flex",gap:8}},
      React.createElement("button",{onClick:saveTg,style:{flex:1,background:btc,border:"none",borderRadius:8,padding:"10px",color:"#000",fontSize:13,fontWeight:600,cursor:"pointer"}},"Enregistrer"),
      React.createElement("button",{onClick:testTg,style:{flex:"0 0 80px",background:bg,border:"1px solid "+border,borderRadius:8,padding:"10px",color:blue,fontSize:13,fontWeight:700,cursor:"pointer"}},"Tester"),
      React.createElement("button",{onClick:forceCheck,style:{flex:"0 0 100px",background:bg,border:"1px solid "+border,borderRadius:8,padding:"10px",color:green,fontSize:12,fontWeight:700,cursor:"pointer"}},"🔄 Forcer")
    ),
    tgMsg&&React.createElement("div",{style:{fontSize:11,color:tgMsg.indexOf("✓")>=0?green:(tgMsg.indexOf("Err")>=0||tgMsg.indexOf("Échec")>=0?red:gray),marginTop:10}},tgMsg)
  );

  var panel=ReactDOM.createPortal(React.createElement("div",{
    style:{position:"fixed",inset:0,background:"#000C",zIndex:9997,display:"flex",alignItems:"flex-end"},
    onClick:function(ev){ if(ev.target===ev.currentTarget) closePanel(); }
  },
    React.createElement("div",{style:{background:C2.bg||"#07080D",border:"1px solid "+border,borderRadius:"16px 16px 0 0",width:"100%",maxWidth:520,margin:"0 auto",maxHeight:"85vh",display:"flex",flexDirection:"column"}},
      React.createElement("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px 10px",flexShrink:0,gap:8}},
        headerTabs,
        React.createElement("div",{style:{display:"flex",gap:6,alignItems:"center"}},
          view==="list"&&items.length>0&&React.createElement("button",{onClick:cgiNotifClear,style:{background:"none",border:"1px solid "+border,borderRadius:8,padding:"4px 8px",color:gray,fontSize:10,cursor:"pointer"}},"Vider"),
          React.createElement("button",{onClick:closePanel,style:{background:"none",border:"none",color:gray,fontSize:22,cursor:"pointer",lineHeight:1}},"×")
        )
      ),
      view==="list"?listView:settingsView
    )
  ),document.body);

  return React.createElement(React.Fragment,null,bell,panel);
}

/* ===== Verrouillage par code PIN (accès visuel local à l'appareil) ===== */
function cgiPinHash(pin){
  var h=5381, s="jcgi_v1_"+String(pin);
  for(var i=0;i<s.length;i++){ h=((h<<5)+h+s.charCodeAt(i))>>>0; }
  return String(h);
}
function cgiGetPin(){ try{ return localStorage.getItem("cgi_pin")||""; }catch(e){ return ""; } }
function cgiSetPinRaw(pin){
  try{ if(pin) localStorage.setItem("cgi_pin",cgiPinHash(pin)); else localStorage.removeItem("cgi_pin"); }catch(e){}
  // #62 — synchroniser le code (HASH uniquement, jamais le code en clair) via le cloud, pour que
  // TOUS les appareils (dont le PWA iPhone au stockage isolé) exigent le même code.
  try{
    const _h = pin ? cgiPinHash(pin) : "";
    const _ts = Date.now();
    try{ localStorage.setItem("cgi_pin_ts", String(_ts)); }catch(e){}
    if(typeof saveBase==="function") saveBase("cgi_pin", { hash:_h, savedAt:_ts });
  }catch(e){}
}
// #1 — le déverrouillage expire après 24 h (et après un vidage de cache, l'horodatage disparaît → re-demande)
var CGI_PIN_TTL = 30*60*1000;   // #76/#80/#84 — déverrouillage valable 30 min sur PC ; le PWA iOS re-verrouille dès la mise en arrière-plan (voir effet _relock)
function cgiUnlockMark(){ try{ localStorage.setItem("cgi_unlock_ts", String(Date.now())); }catch(e){} }
function cgiUnlockValid(){ try{ var t=parseInt(localStorage.getItem("cgi_unlock_ts")||"0",10); return t>0 && (Date.now()-t) < CGI_PIN_TTL; }catch(e){ return false; } }
function cgiLockClear(){ try{ localStorage.removeItem("cgi_unlock_ts"); }catch(e){} }
function cgiCheckPin(pin){ var h=cgiGetPin(); return !!h && h===cgiPinHash(pin); }

function PinLock({onUnlock, onDemo}){
  const [pin,setPin]=React.useState("");
  const [err,setErr]=React.useState(false);
  React.useEffect(()=>{
    if(pin.length===4){
      if(cgiCheckPin(pin)){
        cgiUnlockMark();
        onUnlock();
      } else {
        setErr(true);
        try{ navigator.vibrate && navigator.vibrate(140); }catch(e){}
        setTimeout(()=>{ setPin(""); setErr(false); }, 420);
      }
    }
  },[pin]);
  const press=(d)=>{ try{ navigator.vibrate && navigator.vibrate(8); }catch(e){} setErr(false); setPin(p=> p.length<4 ? p+d : p); };
  const back=()=>{ try{ navigator.vibrate && navigator.vibrate(8); }catch(e){} setPin(p=>p.slice(0,-1)); };
  const KEYS=["1","2","3","4","5","6","7","8","9","","0","⌫"];
  const GOLD="#C9A86A", ONYX="#0B0A08", T2="rgba(245,240,232,.5)", T3="rgba(245,240,232,.32)", RED="#C8553D";
  return (
    <div style={{position:"fixed",inset:0,zIndex:99999,background:ONYX,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'-apple-system',sans-serif",color:"#F5F0E8",padding:24,boxSizing:"border-box"}}>
      <img src={APP_LOGO} alt="" style={{width:74,height:66,objectFit:"contain",marginBottom:16,filter:"drop-shadow(0 2px 12px rgba(0,0,0,.7))"}}/>
      <div style={{fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:23,letterSpacing:2.5,marginBottom:3,textAlign:"center",lineHeight:1.1}}>
        <span style={{color:GOLD}}>J.C.</span> GLOBAL INVESTMENTS
      </div>
      <div style={{fontSize:10,letterSpacing:2.5,textTransform:"uppercase",color:T3,marginBottom:34}}>Accès privé · saisis ton code</div>
      <div style={{display:"flex",gap:18,marginBottom:38,transition:"transform .1s",transform:err?"translateX(0)":"none"}}>
        {[0,1,2,3].map(i=>(
          <span key={i} style={{
            width:14,height:14,borderRadius:999,boxSizing:"border-box",
            border:`1.5px solid ${err?RED:GOLD}`,
            background:i<pin.length?(err?RED:GOLD):"transparent",
            transition:"background .15s,border-color .15s"
          }}/>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,70px)",gap:18}}>
        {KEYS.map((k,i)=> k==="" ? <span key={i}/> : (
          <button key={i} onClick={()=> k==="⌫"?back():press(k)} style={{
            width:70,height:70,borderRadius:999,
            border:`1px solid rgba(201,168,106,.28)`,background:"transparent",
            color:"#F5F0E8",fontSize:k==="⌫"?20:25,
            fontFamily:"'Cormorant Garamond',Georgia,serif",cursor:"pointer",
            WebkitTapHighlightColor:"transparent",userSelect:"none"
          }}>{k}</button>
        ))}
      </div>
      {onDemo && (
        <div style={{marginTop:30,display:"flex",flexDirection:"column",gap:9,alignItems:"center"}}>
          <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:T3}}>Mode démonstration</div>
          <div style={{display:"flex",gap:9,flexWrap:"wrap",justifyContent:"center"}}>
            {[["masked","Masqué"],["small","≈ 30 K$"],["large","≈ 1,6 M$"]].map(function(o){ return (
              <button key={o[0]} onClick={function(){ onDemo(o[0]); }} style={{
                background:"transparent",border:"1px solid rgba(201,168,106,.3)",
                borderRadius:999,padding:"8px 16px",color:T2,fontSize:11,letterSpacing:1,
                fontFamily:"'-apple-system',sans-serif",cursor:"pointer",WebkitTapHighlightColor:"transparent"
              }}>{o[1]}</button>); })}
          </div>
        </div>
      )}
    </div>
  );
}

function App(){
  const[tab,setTab]=useState(0);
  // #65 — le PIN est redemandé À CHAQUE rechargement (on ne se fie plus au TTL de 24 h).
  // Il s'affiche en fin de chargement (le rendu PinLock est gaté après l'écran de chargement).
  const[unlocked,setUnlocked]=useState(()=>{ try{ return !cgiGetPin(); }catch(e){ return true; } });
  const[demo,setDemo]=useState(false);   // #66/#79 — mode démo actif
  const[demoMode,setDemoMode]=useState(null); // #79 — null | "masked" | "small" | "large"
  const[cloudBankSync,setCloudBankSync]=useState(null); // #86e — {breakdown,savedAt,totalEUR} du cloud
  // #76 — PWA iOS : l'app est gelée puis reprise sans remonter React → re-verrouiller à chaque
  // retour au premier plan si un code existe et que le déverrouillage a expiré (TTL 90 s).
  React.useEffect(()=>{
    const _standalone = (()=>{ try{ return (window.navigator.standalone===true) || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches); }catch(e){ return false; } })();
    // #85 — verrouillage FIABLE : sur PWA installé (iOS/Android), on re-verrouille dès que l'app
    // passe en arrière-plan → à la réouverture, l'écran PIN est déjà là, sans dépendre d'un
    // événement de reprise (non fiable sur iOS). Sur navigateur PC, re-verrouillage par TTL.
    function _lockNow(){ try{ if(cgiGetPin()){ cgiLockClear(); setUnlocked(false); setDemo(false); setDemoMode(null); } }catch(e){} }
    function _relockIfExpired(){ try{ if(cgiGetPin() && !cgiUnlockValid()){ cgiLockClear(); setUnlocked(false); setDemo(false); setDemoMode(null); } }catch(e){} }
    function _onVis(){ if(document.visibilityState==="hidden"){ if(_standalone) _lockNow(); } else { _relockIfExpired(); } }
    document.addEventListener("visibilitychange", _onVis);
    window.addEventListener("pagehide", _standalone?_lockNow:_relockIfExpired);
    window.addEventListener("pageshow", _relockIfExpired);
    window.addEventListener("focus", _relockIfExpired);
    const _iv=setInterval(_relockIfExpired, 5000);
    return ()=>{ document.removeEventListener("visibilitychange", _onVis); window.removeEventListener("pagehide", _lockNow); window.removeEventListener("pagehide", _relockIfExpired); window.removeEventListener("pageshow", _relockIfExpired); window.removeEventListener("focus", _relockIfExpired); clearInterval(_iv); };
  }, []);
  const[chartData,setChartData]=useState(CHART_MONTHLY);
  // Séries temporelles en state pour pouvoir les muter après snapshot/refresh
  const[liveDD,setLiveDD]=useState(DD);
  const[liveGDBS,setLiveGDBS]=useState(GDBS);
  const[liveGC,setLiveGC]=useState(GC_FULL);
  const[liveGSB,setLiveGSB]=useState(GS_B100_EXT);
  const[liveBench,setLiveBench]=useState(BENCH_IDX);
  const[liveCM,setLiveCM]=useState(CRYPTO_MONTHLY);
  const[liveSM,setLiveSM]=useState(STOCKS_MONTHLY);
  const[liveTM,setLiveTM]=useState(TOTAL_MONTHLY);
  const[liveInv,setLiveInv]=useState(INV_SEED_OK);
  const[kvRefreshTick,setKvRefreshTick]=useState(0);
  const[liveFutures,setLiveFutures]=useState(SEED_FUTURES);
  const[ibkrTrades,setIbkrTrades]=useState([]);   // #67l — archive des exécutions IBKR (affichage seul)
  const[liveIbkrAnnex,setLiveIbkrAnnex]=useState(SEED_IBKR_ANNEX);
  // v25.02 Phase 2b — cours CGIC effectif : points post-Chart recalcules sur le cumul DB.
  const gcEff = React.useMemo(function(){ return recomputeGcFromDB(liveGC, liveDD, liveInv); }, [liveGC, liveDD, liveInv]);
  // v25.04 — liste des investisseurs connus (depuis la DB cgi_inv), grandit avec les nouveaux.
  const invHolders = React.useMemo(function(){
    const set=[]; (liveInv||[]).forEach(function(m){ if(m && m.holder && set.indexOf(m.holder)<0) set.push(m.holder); });
    return set.length ? set : ["FLO","GB"];
  }, [liveInv]);
  // Version counter pour forcer re-render après sync ICON_DB (variable module non-reactive)
  const[iconDbVersion,setIconDbVersion]=useState(0);
  const bumpIconDb = () => setIconDbVersion(v=>v+1);
  const[txns,setTxns]=useState(SEED_TXNS_REAL);
  const[ready,setReady]=useState(false);
  // v4.0 P2 — notifications patrimoine + dernier trade clôturé (dédupliquées)
  useEffect(function(){
    try{
      var dd=liveDD||[];
      if(dd.length>=2){
        var lastRow=dd[dd.length-1];
        var lastTot=lastRow&&lastRow[2], lastDate=lastRow&&lastRow[0];
        if(lastTot){
          var prevTot=dd[dd.length-2][2];
          var weekTot=null, lim=new Date(lastDate); lim.setDate(lim.getDate()-7);
          for(var i=dd.length-2;i>=0;i--){ if(new Date(dd[i][0])<=lim){ weekTot=dd[i][2]; break; } }
          if(weekTot==null && dd.length>=6) weekTot=dd[dd.length-6][2];
          var dPct=prevTot?((lastTot-prevTot)/prevTot*100):null;
          var wPct=weekTot?((lastTot-weekTot)/weekTot*100):null;
          var body="Total : "+Math.round(lastTot).toLocaleString("fr-FR")+" €";
          if(dPct!=null) body+="\nJour : "+(dPct>=0?"+":"")+dPct.toFixed(2)+"%";
          if(wPct!=null) body+="\nSemaine : "+(wPct>=0?"+":"")+wPct.toFixed(2)+"%";
          cgiNotifPush({type:"meteo",emoji:(dPct!=null?(dPct>=0?"📈":"📉"):"🌤️"),
            dedupeKey:"meteo_"+lastDate, title:"Météo patrimoine", body:body, telegram:false}); // v5.4 — Telegram géré par le worker cron (même app fermée)
        }
      }
      var closed=(computeClosedTrades(txns||[]).closed)||[];
      if(closed.length){
        var t=closed.slice().sort(function(a,b){return new Date(b.exitDate)-new Date(a.exitDate);})[0];
        if(t&&t.exitDate){
          var up=t.pnlUSD>=0;
          cgiNotifPush({type:"trade",emoji:up?"✅":"❌",dedupeKey:"trade_"+t.ticker+"_"+t.exitDate,
            title:"Trade clôturé : "+t.ticker,
            body:(up?"+":"")+"$"+Math.round(t.pnlUSD).toLocaleString("fr-FR")+(t.pct!=null?(" ("+(up?"+":"")+t.pct.toFixed(1)+"%)"):"")+" · "+t.exitDate, telegram:true});
        }
      }
    }catch(e){}
  },[liveDD,txns]);
  const[showSnap,setShowSnap]=useState(false);
  const[showTrade,setShowTrade]=useState(false);
  const[eur,setEur]=useState(false);
  const[hidden,setHidden]=useState(false);
  const[live,setLive]=useState(()=>{
    // #24 — relire en priorité le DERNIER ÉTAT AFFICHÉ (cache local écrit à chaque mise à jour).
    // Garantit que la vue d'arrivée = dernier snapshot vu, sans flash de la valeur embarquée.
    try{
      const raw=localStorage.getItem('cgi_live_cache');
      if(raw){ const c=JSON.parse(raw); if(c && c.portfolio && Array.isArray(c.portfolio.items) && c.portfolio.items.length){
        const items=c.portfolio.items;
        const cryptoItems=items.filter(x=>x.cat==="Crypto");
        const stockItems=items.filter(x=>x.cat!=="Crypto" && x.cat!=="Cash Matelas");
        return {...CURRENT, ...c,
          crypto:{...CURRENT.crypto, items:cryptoItems.length?cryptoItems:CURRENT.crypto.items, total:cryptoItems.reduce((a,x)=>a+(x.val||0),0)||CURRENT.crypto.total},
          stocks:{...CURRENT.stocks, items:stockItems.length?stockItems:CURRENT.stocks.items, total:stockItems.reduce((a,x)=>a+(x.val||0),0)||CURRENT.stocks.total},
          portfolio:{...CURRENT.portfolio, items:items}};
      }}
    }catch(e){}
    // Repli : reconstruire depuis les positions locales sauvegardées
    try{
      const lvPort=lsv9Get('cgi_portfolio'), lvCryp=lsv9Get('cgi_crypto'), lvStk=lsv9Get('cgi_stocks'), lvBank=lsv9Get('cgi_bank');
      const lvGDBS=lsv9Get('cgi_gdbs');
      const lastLocalGDBS=(Array.isArray(lvGDBS)&&lvGDBS.length)?lvGDBS[lvGDBS.length-1]:null;
      if(lvPort && lvCryp && lvStk && lvBank){
        const uE=CURRENT.usdEur, eU=1/uE;
        const cryptoT=lvCryp.total||(lvCryp.items||[]).reduce((s,x)=>s+(x.val||0),0);
        const stocksT=lvStk.total||(lvStk.items||[]).reduce((s,x)=>s+(x.val||0),0);
        const bankUSD=Math.round((lvBank.totalEUR||0)*eU);
        const totalUSD=cryptoT+stocksT+bankUSD;
        const newLive={...CURRENT,date:lvPort.date||CURRENT.date,totalUSD,totalEUR:Math.round(totalUSD*uE),usdEur:uE,eurUsd:eU,
          crypto:{...CURRENT.crypto,...lvCryp},stocks:{...CURRENT.stocks,...lvStk},bank:{...CURRENT.bank,...lvBank},
          portfolio:{...lvPort},_fromSnapshot:lvPort.date};
        const gS=(lastLocalGDBS&&lastLocalGDBS[1])||calcGdbPrices(newLive).gdbS;
        const gC=(lastLocalGDBS&&lastLocalGDBS[2])||calcGdbPrices(newLive).gdbC;
        return {...newLive, gdbS:gS, gdbC:gC};
      }
    }catch(e){}
    // Repli : dernier snapshot DD sauvegardé (ou build embarqué)
    let _DDb = DD, _GDBSb = GDBS;
    try{ const sd=lsv9Get('cgi_dd');   if(Array.isArray(sd)&&sd.length)  _DDb=sd;   }catch(e){}
    try{ const sg=lsv9Get('cgi_gdbs'); if(Array.isArray(sg)&&sg.length)  _GDBSb=sg; }catch(e){}
    const lastDD = _DDb.length > 0 ? _DDb[_DDb.length-1] : null;
    const lastGDBS = _GDBSb.length > 0 ? _GDBSb[_GDBSb.length-1] : null;
    if(lastDD && lastDD[0] > CURRENT.date){
      const usdEur  = lastDD[5] || CURRENT.usdEur;
      const eurUsd  = 1/usdEur;
      const btcPrice = lastDD[3] || CURRENT.btcPrice;
      const gdbS    = lastGDBS ? lastGDBS[1] : (lastDD[4] || CURRENT.gdbS);
      const gdbC    = lastGDBS ? lastGDBS[2] : CURRENT.gdbC;
      const totalEUR = lastDD[2] || CURRENT.totalEUR;
      const totalUSD = Math.round(totalEUR * eurUsd);
      return {...CURRENT, date: lastDD[0], usdEur, eurUsd, btcPrice, gdbS, gdbC, totalEUR, totalUSD, _fromSnapshot: lastDD[0]};
    }
    return {...CURRENT};
  });
  // #86e — réconciliation du Cash Matelas APRÈS construction de `live` : applique le breakdown
  // cloud (le plus récent) directement à l'état affiché, quelle que soit la branche de boot ayant
  // construit `live`. Évite toute dépendance à l'ordre boot/adoption. Idempotent (ne boucle pas).
  const _bankSyncDone = useRef(0);
  // #86g — OBSERVATEUR du solde bancaire : dès que le breakdown change dans l'état affiché
  // (quel que soit l'écran d'édition : dépôt, saisie, snapshot…), publier au cloud, horodaté.
  // Garantit la propagation multi-appareils sans dépendre du chemin d'édition. Le 1er passage
  // (boot) est ignoré ; les valeurs stables ne re-poussent pas (signature).
  const _lastBankSig = useRef(null);
  const [bankToast,setBankToast]=useState(null); // #86h — retour visible de la synchro banque
  useEffect(()=>{
    const bd = (live && live.bank && live.bank.breakdown) || null;
    if(!bd) return;
    const sig = Object.keys(bd).sort().map(k=>k+":"+Math.round(bd[k]||0)).join("|");
    if(_lastBankSig.current===null){ _lastBankSig.current=sig; return; } // boot : mémoriser sans pousser
    if(_lastBankSig.current===sig) return;
    _lastBankSig.current=sig;
    (async()=>{
      try{
        const total=Object.values(bd).reduce((s,v)=>s+(v||0),0);
        const ok=await saveBase('cgi_bank', {...live.bank, breakdown:{...bd}, totalEUR:total, savedAt:Date.now()});
        console.info("[bank] solde modifié → "+(ok?"publié au cloud":"ÉCHEC push")+" ("+sig+")");
        setBankToast(ok? "☁️ Solde banque synchronisé" : "⚠️ Échec de synchro (hors ligne ?)");
      }catch(e){ setBankToast("⚠️ Échec de synchro banque"); }
      setTimeout(()=>setBankToast(null), 3200);
    })();
  }, [live]);
  useEffect(()=>{
    if(!cloudBankSync || !live) return;
    const cbTs=cloudBankSync.savedAt||0;
    if(_bankSyncDone.current===cbTs) return;
    const _bd=cloudBankSync.breakdown||{};
    const liveBankTs=(live.bank&&live.bank.savedAt)||0;
    if(cbTs<liveBankTs) { _bankSyncDone.current=cbTs; return; } // live déjà plus récent
    // Le breakdown live diffère-t-il du cloud ?
    const curBd=(live.bank&&live.bank.breakdown)||{};
    let differs=false; Object.keys(_bd).forEach(k=>{ if((curBd[k]||0)!==(_bd[k]||0)) differs=true; });
    if(!differs){ _bankSyncDone.current=cbTs; return; }
    _bankSyncDone.current=cbTs;
    const uE=live.usdEur||0.92, eU=1/uE;
    const patchItems=(grp)=>{ if(!grp||!grp.items) return grp;
      return {...grp, items:grp.items.map(it=>{ if(it.cat!=="Cash Matelas") return it;
        const kk=Object.keys(_bd).find(k=>k.toUpperCase()===(it.t||"").toUpperCase()); if(kk==null) return it;
        const v=_bd[kk]||0; return {...it, valEUR:v, qty:v, val:Math.round(v*eU)}; })};
    };
    const newBankTotal=Object.values(_bd).reduce((s,v)=>s+(v||0),0);
    const _next={...live,
      bank:{...live.bank, breakdown:{..._bd}, totalEUR:(cloudBankSync.totalEUR!=null?cloudBankSync.totalEUR:newBankTotal), savedAt:cbTs},
      stocks:patchItems(live.stocks),
      portfolio: live.portfolio?patchItems(live.portfolio):live.portfolio };
    // recomposer le total (bank en $ + crypto + stocks)
    try{
      const cryptoT=(_next.crypto&&_next.crypto.total)||0;
      const stocksT=(_next.stocks&&_next.stocks.items||[]).reduce((s,x)=>s+(x.val||0),0);
      const bankUSD=Math.round(newBankTotal*eU);
      _next.totalUSD=cryptoT+stocksT+bankUSD; _next.totalEUR=Math.round(_next.totalUSD*uE);
    }catch(e){}
    try{ lsv9Set('cgi_bank', {...(_next.bank)}); }catch(e){}
    setLive(_next);
    console.info("[bank] Cash Matelas réconcilié sur le cloud (savedAt "+new Date(cbTs).toISOString().slice(0,16)+")");
  }, [cloudBankSync, live]);
  // #24 — persiste le dernier état affiché (portfolio.items = source de vérité de buildSections)
  useEffect(()=>{
    try{
      const pit = live && live.portfolio && live.portfolio.items;
      if(Array.isArray(pit) && pit.length){
        const slim = pit.map(x=>({t:x.t,cat:x.cat,qty:x.qty,pa:x.pa,live:x.live,val:x.val,valEUR:x.valEUR,pnl:x.pnl,pct:x.pct}));
        const c={date:live.date||null,usdEur:live.usdEur,eurUsd:live.eurUsd,btcPrice:live.btcPrice,gdbS:live.gdbS,gdbC:live.gdbC,totalUSD:live.totalUSD,totalEUR:live.totalEUR,_fromSnapshot:live._fromSnapshot,portfolio:{items:slim}};
        localStorage.setItem('cgi_live_cache', JSON.stringify(c));
      }
    }catch(e){}
  },[live]);
  const[refreshing,setRefreshing]=useState(false);
  const[refreshedAt,setRefreshedAt]=useState(null);
  const[refreshErr,setRefreshErr]=useState(null);
  const[gistSync,setGistSync]=useState(null);
  const[gistError,setGistError]=useState(null);
  const[showGistDiag,setShowGistDiag]=useState(false);
  const[themeName,setThemeName]=useState(()=>{
    try{
      var saved=localStorage.getItem('cgi_theme');
      // Bascule unique vers le nouveau thème LUXE (même si "dark" était sauvegardé)
      if(!localStorage.getItem('cgi_luxe_v1')){
        localStorage.setItem('cgi_luxe_v1','1');
        localStorage.setItem('cgi_theme','luxe');
        return 'luxe';
      }
      return saved||'luxe';
    }catch{ return 'luxe'; }
  });
  const[showTheme,setShowTheme]=useState(false);
  const[showSettings,setShowSettings]=useState(false); // LOT1 — panneau réglages
  const[soundOn,setSoundOn]=useState(cgiSound.isOn()); // #71 — sons de navigation
  const[showAbout,setShowAbout]=useState(false); // v4.14 — page À propos
  const[showDiag2,setShowDiag2]=useState(false); // #9 — panneau Diagnostic & maintenance
  const[showDevices,setShowDevices]=useState(false); // #9 — registre des appareils connectés
  const[devList,setDevList]=useState([]); // #9 — appareils du registre
  const[devLoading,setDevLoading]=useState(false);
  const[devLabel,setDevLabel]=useState(()=>{ try{ return cgiDeviceLabel(); }catch(e){ return "Appareil"; } });
  const myDeviceId = React.useMemo(()=>{ try{ return cgiDeviceId(); }catch(e){ return ""; } },[]);
  // #9 — enregistre cet appareil au démarrage (forward-compatible : no-op cloud si worker non maj)
  React.useEffect(()=>{ cgiRegisterDevice().catch(()=>{}); },[]);
  function loadDevices(){
    setDevLoading(true);
    cgiDevicesList().then(list=>{ setDevList(list||[]); }).catch(()=>{}).finally(()=>setDevLoading(false));
  }
  const[settingsMsg,setSettingsMsg]=useState("");
  async function forceCronCheck(){
    setSettingsMsg("🔄 Vérification en cours…");
    try{
      const r=await fetch(CF_WORKER_URL+"/check-now",{method:"POST",headers:{"X-Auth-Key":CF_AUTH_KEY},signal:AbortSignal.timeout(20000)});
      const d=await r.json();
      setSettingsMsg(d.ok?"✓ Vérification lancée — regarde Telegram.":("Erreur : "+(d.error||("HTTP "+r.status))));
    }catch(e){ setSettingsMsg("Erreur réseau (worker redéployé ?)."); }
    setTimeout(()=>setSettingsMsg(""),5000);
  }
  // ── Écran de démarrage ──────────────────────────────────────────────────
  const[startScreen,setStartScreen]=useState(true); // afficher l'écran de choix
  const[startLoading,setStartLoading]=useState(true); // en train de charger les 2 sources
  const[kvData_snap,setKvData_snap]=useState(null); // {totalUSD, totalEUR, date, raw}
  const[kvError,setKvError]=useState(null);         // message si KV inaccessible
  const[chosenSource,setChosenSource]=useState("local"); // "local" | "cloudflare"
  // localData initialisé avec liveDD (peut inclure des snapshots précédents)
  const[localData,setLocalData]=useState(()=>{
    // v23.18 — refléter les données LOCALES fraîches (miroir v9) plutôt que le build figé.
    let _dd = DD, _gdbs = GDBS;
    try{
      const lvDD = lsv9Get('cgi_dd'); const lvGB = lsv9Get('cgi_gdbs');
      if(Array.isArray(lvDD) && lvDD.length) _dd = lvDD;
      if(Array.isArray(lvGB) && lvGB.length) _gdbs = lvGB;
    }catch(e){}
    const lastRow = _dd.length>0 ? _dd[_dd.length-1] : null;
    const lastDate = lastRow ? lastRow[0] : CURRENT.date;
    const fresher = lastRow && lastRow[0] > CURRENT.date;
    const totalEUR = fresher ? lastRow[2] : CURRENT.totalEUR;
    const totalUSD = fresher ? Math.round(totalEUR / (lastRow[5]||CURRENT.usdEur)) : CURRENT.totalUSD;
    const lastGDBS = _gdbs.length>0 ? _gdbs[_gdbs.length-1] : null;
    return {
      totalUSD, totalEUR,
      date: lastDate,
      gdbS: lastGDBS?.[1] || CURRENT.gdbS,
      gdbC: lastGDBS?.[2] || CURRENT.gdbC,
    };
  });
  // Apply theme to global C on every render
  C = THEMES[themeName]||THEMES.dark;
  cc = getCC();

  const applyTheme = (name) => {
    C = THEMES[name]||THEMES.dark;
    cc = getCC();
    setThemeName(name);
    try{ localStorage.setItem('cgi_theme', name); }catch{}
    setShowTheme(false);
  };

  const handleRefresh = useCallback(async()=>{
    setRefreshing(true); setRefreshErr(null);
    try{
      const prices = await fetchAllPrices();
      const liveEurUsd = prices.EURUSD || (1/CURRENT.usdEur);
      const liveUsdEur = 1 / liveEurUsd;
      const todayStr = todayNC();

      // Utiliser setLive(prev=>) pour avoir l'état live courant (post-trades)
      setLive(prev=>{
        let srcEFF = prev || CURRENT;
        // #24 — si l'état courant est dégradé (build non rafraîchi), repartir du cache avant d'appliquer les prix
        try{
          const c=JSON.parse(localStorage.getItem('cgi_live_cache')||'null');
          if(c && c.totalUSD && c.portfolio && Array.isArray(c.portfolio.items) && c.portfolio.items.length && (!srcEFF.totalUSD || c.totalUSD > srcEFF.totalUSD*1.05)){
            const items=c.portfolio.items;
            const cI=items.filter(x=>x.cat==="Crypto"), sI=items.filter(x=>x.cat!=="Crypto"&&x.cat!=="Cash Matelas");
            srcEFF={...srcEFF, usdEur:c.usdEur||srcEFF.usdEur, eurUsd:c.eurUsd||srcEFF.eurUsd, btcPrice:c.btcPrice||srcEFF.btcPrice, gdbS:c.gdbS||srcEFF.gdbS, gdbC:c.gdbC||srcEFF.gdbC,
              crypto:{...(srcEFF.crypto||{}), items:cI.length?cI:(srcEFF.crypto&&srcEFF.crypto.items), total:cI.reduce((a,x)=>a+(x.val||0),0)},
              stocks:{...(srcEFF.stocks||{}), items:sI.length?sI:(srcEFF.stocks&&srcEFF.stocks.items), total:sI.reduce((a,x)=>a+(x.val||0),0)},
              portfolio:{...(srcEFF.portfolio||{}), items:items}};
          }
        }catch(e){}
        const updated = applyPrices(prices, liveUsdEur, srcEFF);
        const {gdbS: gdbS_r, gdbC: gdbC_r} = calcGdbPrices(updated);

        // Mettre à jour DD/GDBS/GC en même temps
        const cryptoEUR_r = Math.round((updated.crypto && updated.crypto.total ? updated.crypto.total : 0)*liveUsdEur);
        const totalEUR_r  = updated.totalEUR;
        const gdbSCalc    = gdbS_r || CURRENT.gdbS;
        const gdbCCalc    = gdbC_r || CURRENT.gdbC;
        const btcR        = updated.btcPrice || CURRENT.btcPrice;

        setLiveDD(d => {
          const last = d[d.length-1];
          const row = [todayStr, cryptoEUR_r, totalEUR_r, btcR, gdbSCalc, liveUsdEur];
          return last && last[0]===todayStr ? [...d.slice(0,-1), row] : [...d, row];
        });
        // Mettre à jour BENCH_IDX avec les prix live du refresh
        const ethLive  = prices["ETH"]  || null;
        const sp500L   = prices["QQQ"]  || null;
        const nqLive   = prices["QQQ"]  || null;
        const msciLive = prices["URTH"] || null;  // URTH = iShares MSCI World ETF
        if(btcR || ethLive || sp500L) {
          setLiveBench(b => {
            const last = b.length>0 ? b[b.length-1] : null;
            const row = [todayStr, btcR||null, ethLive||null, sp500L||null, nqLive||null, msciLive||null];
            return last && last[0]===todayStr ? [...b.slice(0,-1), row] : [...b, row];
          });
        }
        // v23.23 — setLiveGDBS / setLiveGC retirés du refresh.
        // Les séries CGIS/CGIC ne se mettent à jour QUE via les snapshots (contrôle
        // utilisateur). Cela évite que les dépôts/retraits ou les trades KuCoin
        // « polluent » la série des prix de fond avec des événements non-marché.
        // Les cartes live (live.gdbS / live.gdbC) restent à jour via calcGdbPrices.

        return {
          ...srcEFF,
          ...updated,
          eurUsd: liveEurUsd,
          usdEur: liveUsdEur,
          gdbS: gdbS_r,
          gdbC: gdbC_r,
          errors: prices.errors,
        };
      });
      const ts = new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
      setRefreshedAt(ts);
      // Mettre à jour localData avec les nouvelles valeurs live
      setLive(prev2=>{
        if(prev2) setLocalData({
          totalUSD: prev2.totalUSD||CURRENT.totalUSD,
          totalEUR: prev2.totalEUR||CURRENT.totalEUR,
          date: todayNC(),
          gdbS: prev2.gdbS||CURRENT.gdbS,
          gdbC: prev2.gdbC||CURRENT.gdbC,
        });
        // #24 — cache du dernier état réel affiché (positions = source de vérité buildSections)
        try{
          const pit = prev2 && prev2.portfolio && prev2.portfolio.items;
          // Ne JAMAIS écraser le cache avec une valeur dégradée (refresh partiel/échoué) :
          // on n'écrit que si assez de prix ont été récupérés OU si le total ne baisse pas vs cache.
          let oldCacheTotal=0;
          try{ const o=JSON.parse(localStorage.getItem('cgi_live_cache')||'null'); if(o) oldCacheTotal=o.totalUSD||0; }catch(e){}
          const okPrices = prices && Object.keys(prices).filter(k=>k!=="errors"&&k!=="EURUSD"&&prices[k]!=null).length>=3;
          const newTotal = (prev2 && prev2.totalUSD)||0;
          const safeToCache = oldCacheTotal===0 || okPrices || newTotal>=oldCacheTotal*0.97;
          if(Array.isArray(pit) && pit.length && safeToCache){
            const slim = pit.map(x=>({t:x.t,cat:x.cat,qty:x.qty,pa:x.pa,live:x.live,val:x.val,valEUR:x.valEUR,pnl:x.pnl,pct:x.pct}));
            const c={date:todayNC(),usdEur:prev2.usdEur,eurUsd:prev2.eurUsd,btcPrice:prev2.btcPrice,gdbS:prev2.gdbS,gdbC:prev2.gdbC,totalUSD:prev2.totalUSD,totalEUR:prev2.totalEUR,portfolio:{items:slim}};
            localStorage.setItem('cgi_live_cache', JSON.stringify(c));
          }
        }catch(e){}
        // #61 — handleRefresh écrit total/crypto/actions/cash depuis le MODÈLE UNIQUE (= hero). Fonds écrits par l'onglet JCGI.
        try{
          if(prev2 && prev2.crypto && prev2.stocks){
            const _m = computePortfolioModel(prev2);
            const _cur = lsv9Get('cgi_fund_stats')||{};
            saveBase('cgi_fund_stats',{..._cur,
              totalUSD:_m.totalUSD,
              totalEUR:_m.totalEUR,
              cryptoUSD:_m.cryptoUSD,
              stocksUSD:_m.stocksUSD,
              cashUSD:_m.cashUSD,
              usdEur:_m.usdEur, ts:Date.now()});
            cgiReport("Baromètre · snapshot", {totalUSD:_m.totalUSD, cryptoUSD:_m.cryptoUSD, stocksUSD:_m.stocksUSD});
          }
        }catch(e){}
        return prev2;
      });
      // Rapport détaillé : succès et échecs
      const successList = Object.keys(YF_MAP).filter(k=>prices[k]!=null);
      if(prices.BTC) successList.push("BTC");
      if(prices.EURUSD) successList.push("EUR");
      const failList = [...new Set(prices.errors)];
      if(failList.length>0){
        setRefreshErr({ok:successList.filter(k=>!failList.includes(k)), fail:failList});
      } else {
        setRefreshErr({ok:successList, fail:[]});
      }
      // Auto-fermeture après 8s
      setTimeout(()=>setRefreshErr(null), 8000);
    } catch(e){ setRefreshErr({ok:[], fail:["Erreur réseau: "+e.message]}); }
    finally{ setRefreshing(false); }
  },[]);

  // Merge live prices into effective CURRENT data
  // EFF = live est la source unique de vérité
  const _EFF_RAW = live || CURRENT;
  const EFF = (typeof demoMode!=="undefined" && demoMode && DEMO_TARGETS[demoMode]) ? scaleEFFForDemo(_EFF_RAW, DEMO_TARGETS[demoMode]) : _EFF_RAW;
  // #67j — signature des txns : le rebuild des positions doit se RE-jouer quand les transactions
  // changent (ex. ajustements IBKR fusionnés depuis le cloud APRÈS le premier rebuild du boot).
  const _txnsSigOf = a => (a?a.length:0) + "|" + ((a&&a.length&&a[a.length-1]&&a[a.length-1].id)||"");
  // #12 — voyant Live : cloud connecté ET trades IBKR appliqués
  const liveOk = !!(gistSync && EFF && EFF._fromTxnsApplied);


  // v4.14 — actualisation auto au lancement (plus besoin d'actualiser à la main)
  const autoRefRef = useRef(false);
  useEffect(function(){
    if(!ready || autoRefRef.current) return;
    autoRefRef.current = true;
    var id=setTimeout(function(){ try{ handleRefresh(); }catch(e){} }, 900);
    return function(){ clearTimeout(id); };
  },[ready]);

  const liveProps = {eur, setEur, hidden, setHidden, EFF, refreshing, handleRefresh, refreshedAt, refreshErr, fromSnapshot: live?._fromSnapshot||null, gistSync, liveDD, liveGDBS, liveGC, liveGSB, liveCM};

  // ── Préchargement au démarrage — charge local + KV en parallèle ──────────
  useEffect(()=>{
    (async()=>{
      // Phase 1 v23.01 — migration unique v8→v9 (idempotente, sans effet visible)
      migrateV8toV9();
      // v23.18 — données LOCALES fraîches depuis le miroir v9 (cgi_dd/cgi_gdbs),
      // et non le build figé ni liveDD (encore au build à ce stade). Total inclus.
      const _localDD   = (lsv9Get('cgi_dd')   && lsv9Get('cgi_dd').length)   ? lsv9Get('cgi_dd')   : (liveDD||DD);
      const localLastGDBS = (lsv9Get('cgi_gdbs') && lsv9Get('cgi_gdbs').length) ? lsv9Get('cgi_gdbs') : (liveGDBS||GDBS);
      const _lastDD    = _localDD.length>0 ? _localDD[_localDD.length-1] : null;
      const localLastDate = _lastDD ? _lastDD[0] : CURRENT.date;
      const lastGDBSRow = localLastGDBS.length>0 ? localLastGDBS[localLastGDBS.length-1] : null;
      const _fresher  = _lastDD && _lastDD[0] > CURRENT.date;
      const lTotalEUR = _fresher ? _lastDD[2] : CURRENT.totalEUR;
      const lTotalUSD = _fresher ? Math.round(lTotalEUR / (_lastDD[5]||CURRENT.usdEur)) : CURRENT.totalUSD;
      setLocalData(prev=>({
        ...prev,
        totalUSD: lTotalUSD,
        totalEUR: lTotalEUR,
        date: localLastDate,
        gdbS: lastGDBSRow?.[1] || CURRENT.gdbS,
        gdbC: lastGDBSRow?.[2] || CURRENT.gdbC,
      }));
      // v23.24 — aligner live.gdbS/gdbC sur la base GDBS locale fraîche.
      // Sans ça, le dernier point du chart utilise live.gdbS/gdbC = build figé
      // alors que la base GDBS locale (lsv9) a les vraies valeurs du snapshot.
      if(lastGDBSRow){
        setLive(prev => prev ? {
          ...prev,
          gdbS: lastGDBSRow[1] || prev.gdbS,
          gdbC: lastGDBSRow[2] || prev.gdbC,
        } : prev);
      }
      try {
        const res=await fetch(CF_WORKER_URL+"/read",{headers:{"X-Auth-Key":CF_AUTH_KEY},signal:AbortSignal.timeout(18000)});
        if(res.ok){
          const kv=await res.json();
          // Phase 1 v23.01 — seeder le miroir local v9 depuis KV (écriture additive)
          lsv9SeedFromKv(kv);
          // Phase 3 v23.04 — /read KV a réussi → on est en ligne → re-pousser les bases dirty
          flushDirtyBases();
          const kvPort=kv.cgi_portfolio,kvStk=kv.cgi_stocks,kvCryp=kv.cgi_crypto,kvBank=kv.cgi_bank;
          try{ if(kvBank && kvBank.breakdown) setCloudBankSync({breakdown:kvBank.breakdown, savedAt:(kvBank.savedAt||Date.now()), totalEUR:kvBank.totalEUR}); }catch(e){} // #86i — armer la réconciliation quel que soit le chemin de boot
          // v1.0 CGI — fallback sur CURRENT si les bases portfolio manquent dans le KV
          const cryptoSrc = kvCryp || CURRENT.crypto;
          const stocksSrc = kvStk  || CURRENT.stocks;
          const bankSrc   = kvBank || CURRENT.bank;
          const uE=CURRENT.usdEur, eU=1/uE;
          const cryptoT=cryptoSrc.total||(cryptoSrc.items||[]).reduce((s,x)=>s+(x.val||0),0);
          const stocksT=stocksSrc.total||(stocksSrc.items||[]).reduce((s,x)=>s+(x.val||0),0);
          const bankUSD=Math.round((bankSrc.totalEUR||0)*eU);
          const totalUSD=cryptoT+stocksT+bankUSD;
          const lastGDBS=kv.cgi_gdbs&&kv.cgi_gdbs.length>0?kv.cgi_gdbs[kv.cgi_gdbs.length-1]:null;
          const lastDD_kv=kv.cgi_dd&&kv.cgi_dd.length>0?kv.cgi_dd[kv.cgi_dd.length-1]:null;
          const kvDate = lastDD_kv?.[0] || (kvPort||{}).date || CURRENT.date || "—";
          setKvData_snap({totalUSD:totalUSD||CURRENT.totalUSD,totalEUR:Math.round((totalUSD||CURRENT.totalUSD)*uE),date:kvDate,gdbS:lastGDBS?.[1]||CURRENT.gdbS,gdbC:lastGDBS?.[2]||CURRENT.gdbC,raw:kv});
          // Auto-init : pousser les bases portfolio vers le KV si absentes
          if(!kvPort||!kvCryp||!kvStk||!kvBank){
            fetch(`${CF_WORKER_URL}/write-bases`,{method:"POST",signal:AbortSignal.timeout(20000),
              headers:{"Content-Type":"application/json","X-Auth-Key":CF_AUTH_KEY},
              body:JSON.stringify({
                cgi_portfolio: CURRENT.portfolio||{date:CURRENT.date,items:[]},
                cgi_crypto:    CURRENT.crypto,
                cgi_stocks:    CURRENT.stocks,
                cgi_bank:      CURRENT.bank,
              })
            }).then(()=>console.info("[kv-init] bases portfolio poussées vers le KV"))
              .catch(e=>console.warn("[kv-init] échec push portfolio:",e&&e.message));
          }
        } else { setKvError("KV inaccessible ("+res.status+")"); }
      } catch(e){ setKvError("KV hors ligne"); }
      setStartLoading(false);
    })();
  },[]);

  function applyStartChoice(useKV){
    setStartScreen(false);
    setChosenSource(useKV ? "cloudflare" : "local");
    // v23.25 — helper partagé par les deux branches (cloud et local)
    const _mergeArrays = (base, kv) => {
      if(!kv || !kv.length) return base;
      const map = {};
      base.forEach(r=>{ if(r[0]) map[r[0]] = r; });
      kv.forEach(r=>{ if(r[0]) map[r[0]] = r; }); // kv écrase si même date
      return Object.values(map).sort((a,b)=>a[0].localeCompare(b[0]));
    };
    if(useKV&&kvData_snap?.raw){
      const kv=kvData_snap.raw;
      // Fusionner la base hardcodée avec les données KV pour combler les trous
      if(kv.cgi_dd)    setLiveDD(_mergeArrays(DD, kv.cgi_dd));
      if(kv.cgi_gdbs){
        var _gdbsRaw = _mergeArrays(GDBS, kv.cgi_gdbs);
        setLiveGDBS(_gdbsRaw.filter(function(p){ return Array.isArray(p) && isFinite(p[1]) && isFinite(p[2]); }));
      }
      if(kv.cgi_gc)    setLiveGC(_mergeArrays(GC_FULL, kv.cgi_gc));
      if(kv.cgi_gsb)   setLiveGSB(_mergeArrays(GS_B100_EXT, kv.cgi_gsb));
      if(kv.cgi_cm)    setLiveCM(unionMonthlyByYear(CRYPTO_MONTHLY, kv.cgi_cm));
      if(kv.cgi_sm)    setLiveSM(unionMonthlyByYear(STOCKS_MONTHLY, kv.cgi_sm));
      if(kv.cgi_tm)    setLiveTM(unionMonthlyByYear(TOTAL_MONTHLY, kv.cgi_tm));
      if(kv.cgi_inv)   { const _mi=unionTxnsById(INV_SEED_OK, kv.cgi_inv); setLiveInv(_mi); FUND_PARTS=cumulFundParts(_mi); }
      if(kv.cgi_futures)    setLiveFutures(unionTxnsById(SEED_FUTURES, kv.cgi_futures));
      if(kv.cgi_ibkr_annex) setLiveIbkrAnnex(unionTxnsById(SEED_IBKR_ANNEX, kv.cgi_ibkr_annex));
      if(kv.cgi_bench) setLiveBench(_mergeArrays(BENCH_IDX, kv.cgi_bench));
      if(kv.cgi_yfmap&&typeof kv.cgi_yfmap==="object") Object.assign(YF_MAP,kv.cgi_yfmap);
      try{ YF_MAP.NICK="NICK.MI"; }catch(e){} // v4.5 — garde NICK.MI même après merge KV
      if(kv.cgi_icons&&typeof kv.cgi_icons==="object"){
        // Merger : KV écrase les entrées existantes (KV = vérité cloud)
        // mais on conserve les entrées localStorage qui ne seraient pas dans KV
        const merged = { ...serializeIconDb(), ...kv.cgi_icons };
        loadIconDb(merged); // charge + persiste en localStorage
        seedBankLogos();    // réinjecter les URLs banque (toujours fixes)
        lsWriteIcons(serializeIconDb());
        bumpIconDb();
      }
      const kvPort=kv.cgi_portfolio,kvCryp=kv.cgi_crypto,kvStk=kv.cgi_stocks,kvBank=kv.cgi_bank;
      try{ if(kvBank && kvBank.breakdown) setCloudBankSync({breakdown:kvBank.breakdown, savedAt:(kvBank.savedAt||Date.now()), totalEUR:kvBank.totalEUR}); }catch(e){} // #86i
      if(kvPort&&kvCryp&&kvStk&&kvBank){
        try{
          const uE=CURRENT.usdEur,eU=1/uE;
          const cryptoT=kvCryp.total||(kvCryp.items||[]).reduce((s,x)=>s+(x.val||0),0);
          const stocksT=kvStk.total||(kvStk.items||[]).reduce((s,x)=>s+(x.val||0),0);
          const bankUSD=Math.round((kvBank.totalEUR||0)*eU);
          const totalUSD=cryptoT+stocksT+bankUSD;
          const newLive={...CURRENT,date:kvPort.date||CURRENT.date,totalUSD,totalEUR:Math.round(totalUSD*uE),usdEur:uE,eurUsd:eU,
            crypto:{...CURRENT.crypto,...kvCryp},stocks:{...CURRENT.stocks,...kvStk},bank:{...CURRENT.bank,...kvBank},
            portfolio:{...kvPort},_fromSnapshot:kvPort.date};
          const{gdbS,gdbC}=calcGdbPrices(newLive);
          setLive({...newLive,gdbS,gdbC});
          setRefreshedAt("cloudflare "+kvPort.date);
        }catch(e){ try{ console.error("Boot KV positions: repli sur base —",e); }catch(x){} }
      }
    } else {
      // v23.25 — boot LOCAL : calquer exactement le boot cloud en lisant lsv9 au lieu de KV.
      // C'est l'endroit correct (applyStartChoice, post-boot-effects) pour fixer live.gdbS/gdbC.
      const lvDD   = lsv9Get('cgi_dd');
      const lvGDBS = lsv9Get('cgi_gdbs');
      const lvGC   = lsv9Get('cgi_gc');
      const lvGSB  = lsv9Get('cgi_gsb');
      const lvInv  = lsv9Get('cgi_inv'); if(lvInv){ const _mi2=unionTxnsById(INV_SEED_OK, lvInv); setLiveInv(_mi2); FUND_PARTS=cumulFundParts(_mi2); }
      const lvFut = lsv9Get('cgi_futures'); if(lvFut){ setLiveFutures(unionTxnsById(SEED_FUTURES, lvFut)); }
      const lvAnx = lsv9Get('cgi_ibkr_annex'); if(lvAnx){ setLiveIbkrAnnex(unionTxnsById(SEED_IBKR_ANNEX, lvAnx)); }
      if(lvDD)   setLiveDD(_mergeArrays(DD, lvDD));
      if(lvGDBS) setLiveGDBS(_mergeArrays(GDBS, lvGDBS));
      if(lvGC)   setLiveGC(_mergeArrays(GC_FULL, lvGC));
      if(lvGSB)  setLiveGSB(_mergeArrays(GS_B100_EXT, lvGSB));
      // Aligner live.gdbS/gdbC sur le dernier snapshot local (même logique que le cloud)
      const lastLocalGDBS = lvGDBS && lvGDBS.length>0 ? lvGDBS[lvGDBS.length-1] : null;
      // v24.05 — injecter aussi les POSITIONS locales (crypto/stocks/bank), comme le boot
      // cloud le fait depuis KV. Sans ça, les prix affichés (ex. BTC) restaient sur le
      // build au lieu de la dernière valeur enregistrée localement.
      const lvPort=lsv9Get('cgi_portfolio'), lvCryp=lsv9Get('cgi_crypto'), lvStk=lsv9Get('cgi_stocks'), lvBank=lsv9Get('cgi_bank');
      if(lvPort && lvCryp && lvStk && lvBank){
        try{
          const uE=CURRENT.usdEur, eU=1/uE;
          const cryptoT=lvCryp.total||(lvCryp.items||[]).reduce((s,x)=>s+(x.val||0),0);
          const stocksT=lvStk.total||(lvStk.items||[]).reduce((s,x)=>s+(x.val||0),0);
          const bankUSD=Math.round((lvBank.totalEUR||0)*eU);
          const totalUSD=cryptoT+stocksT+bankUSD;
          const newLive={...CURRENT,date:lvPort.date||CURRENT.date,totalUSD,totalEUR:Math.round(totalUSD*uE),usdEur:uE,eurUsd:eU,
            crypto:{...CURRENT.crypto,...lvCryp},stocks:{...CURRENT.stocks,...lvStk},bank:{...CURRENT.bank,...lvBank},
            portfolio:{...lvPort},_fromSnapshot:lvPort.date};
          // gdbS/gdbC : base GDBS locale (snapshot validé) prioritaire sur le calcul prix-positions
          const gS=(lastLocalGDBS && lastLocalGDBS[1]) || calcGdbPrices(newLive).gdbS;
          const gC=(lastLocalGDBS && lastLocalGDBS[2]) || calcGdbPrices(newLive).gdbC;
          setLive({...newLive, gdbS:gS, gdbC:gC});
          setRefreshedAt("local "+(lvPort.date||""));
        }catch(e){ try{ console.error("Boot local positions: repli sur base —",e); }catch(x){} }
      } else if(lastLocalGDBS && lastLocalGDBS[1]){
        setLive(prev => ({
          ...(prev || CURRENT),
          gdbS: lastLocalGDBS[1],
          gdbC: lastLocalGDBS[2] || (prev||CURRENT).gdbC,
        }));
      }
    }
    // #24 — le cache (dernier refresh réel) PRIME sur les positions du snapshot, dont les prix
    // sont périmés (seul le taux EUR/USD bougeait → ex. 140233 au lieu de la vraie valeur).
    // On reconstruit AUSSI crypto/stocks.items pour que applyPrices (au refresh) reparte de ces
    // bons prix en cas d'échec de fetch, au lieu de retomber sur les prix du build.
    try{
      const raw=localStorage.getItem('cgi_live_cache');
      if(raw){ const c=JSON.parse(raw); if(c && c.portfolio && Array.isArray(c.portfolio.items) && c.portfolio.items.length){
        const items=c.portfolio.items;
        const cryptoItems=items.filter(x=>x.cat==="Crypto");
        const stockItems=items.filter(x=>x.cat!=="Crypto" && x.cat!=="Cash Matelas");
        const cryptoTotal=cryptoItems.reduce((a,x)=>a+(x.val||0),0);
        const stocksTotal=stockItems.reduce((a,x)=>a+(x.val||0),0);
        setLive(prev=>{
          const base=prev||CURRENT;
          return {...base, usdEur:c.usdEur||base.usdEur, eurUsd:c.eurUsd||base.eurUsd, btcPrice:c.btcPrice||base.btcPrice,
            gdbS:c.gdbS||base.gdbS, gdbC:c.gdbC||base.gdbC, totalUSD:c.totalUSD||base.totalUSD, totalEUR:c.totalEUR||base.totalEUR,
            crypto:{...(base.crypto||{}), items:cryptoItems.length?cryptoItems:(base.crypto&&base.crypto.items), total:cryptoTotal||(base.crypto&&base.crypto.total)},
            stocks:{...(base.stocks||{}), items:stockItems.length?stockItems:(base.stocks&&base.stocks.items), total:stocksTotal||(base.stocks&&base.stocks.total)},
            portfolio:{...(base.portfolio||{}), items:items}};
        });
      }}
    }catch(e){}
  }

  // v5.4 #2 — Accueil à jour au lancement : choisit AUTOMATIQUEMENT le cloud (dernière version KV)
  // dès qu'il est chargé ; repli local si KV indisponible. Plus besoin de choisir manuellement.
  useEffect(function(){
    if(!startScreen || startLoading) return;
    if(kvData_snap && !kvError) applyStartChoice(true);
    else applyStartChoice(false);
  }, [startScreen, startLoading, kvData_snap, kvError]);

  useEffect(()=>{
    (async()=>{
      const pingResult = await cfPing();
      const gistOk = pingResult === null;
      if(!gistOk) setGistError(pingResult||{status:null,statusText:"Réponse vide",body:""});
      setGistSync(gistOk);
      const[cd,tx]=await Promise.all([load(SK.chart,CHART_MONTHLY),load(SK.txns,SEED_TXNS_REAL)]);
      setChartData(cd);
      // #67k — l'état initial des txns privilégie le stockage v9 (maintenu par les fusions),
      // le legacy SK.txns ne sert que de repli.
      let _l9tx=null; try{ const _a=lsv9Get('cgi_txns'); if(Array.isArray(_a)&&_a.length) _l9tx=_a; }catch(e){}
      setTxns(_l9tx || tx);

      // ── Charger les bases depuis Cloudflare KV (remplace les constantes statiques) ─
      try {
        const res = await fetch(CF_WORKER_URL+"/read",{
          headers:{"X-Auth-Key":CF_AUTH_KEY},
          signal: AbortSignal.timeout(18000),
        });
        if(res.ok){
          const kvData = await res.json();
          // Phase 3 v23.05 — réconciliation des transactions (fusion par id).
          // Récupère une txn ajoutée offline (présente en local, pas en KV) ET
          // une txn faite sur un autre appareil (présente en KV, pas en local).
          try{
            var TXNS_SEEDVER="real_v1";
            var _SEEDVER_KEY="cgi_txns_seedver";
            var _txnsMig = false;
            try{ _txnsMig = (localStorage.getItem(_SEEDVER_KEY)===TXNS_SEEDVER); }catch(e){}
            var _localTx = []; try{ var _lt=lsv9Get('cgi_txns'); if(Array.isArray(_lt)) _localTx=_lt; }catch(e){}
            var _kvTx = Array.isArray(kvData.cgi_txns) ? kvData.cgi_txns : [];
            // #67 fix — les exécutions brutes IBKR (ids "ibkr_…") ne doivent JAMAIS vivre dans cgi_txns :
            // elles doublonnent les saisies manuelles (fills partiels agrégés) et faussent le rebuild des
            // positions (« vérité unique »). Les ajustements "ibkradj_…" de la réconciliation restent légitimes.
            var _noRaw = t => !(t && typeof t.id==="string" && t.id.indexOf("ibkr_")===0);
            var _lB=_localTx.length, _kB=_kvTx.length;
            _localTx=_localTx.filter(_noRaw); _kvTx=_kvTx.filter(_noRaw);
            var _purgedRaw=(_lB-_localTx.length)+(_kB-_kvTx.length);
            if(_purgedRaw>0) console.info("[txns] "+_purgedRaw+" exécution(s) brute(s) IBKR purgée(s) (rollback #67).");
            if(!_txnsMig){
              // Migration jamais marquée. On ne ré-injecte le seed d'origine QUE si
              // il n'y a AUCUNE transaction nulle part (ni en local, ni dans le cloud).
              // Sinon (données présentes local OU cloud, ex. après vidage de cache), on RESTAURE.
              if(_localTx.length>0 || _kvTx.length>0){
                const merged = unionTxnsById(_localTx, _kvTx);
                setTxns(merged); lsv9Set('cgi_txns', merged);
                try{ localStorage.setItem(_SEEDVER_KEY, TXNS_SEEDVER); }catch(e){}
                if(merged.length > _kvTx.length){ saveBase('cgi_txns', merged); }
                console.info("[txns] restauration (local "+_localTx.length+" + cloud "+_kvTx.length+" → "+merged.length+"), seed NON ré-injecté.");
              } else {
                setTxns(SEED_TXNS_REAL);
                lsv9Set('cgi_txns', SEED_TXNS_REAL);
                try{ localStorage.setItem(_SEEDVER_KEY, TXNS_SEEDVER); }catch(e){}
                saveBase('cgi_txns', SEED_TXNS_REAL);
                console.info("[txns] seed initial (aucune transaction nulle part): "+SEED_TXNS_REAL.length+".");
              }
            } else {
              const merged = unionTxnsById(_localTx, _kvTx);
              // #67k — TOUJOURS pousser la fusion dans l'état React : l'état initial vient du
              // stockage legacy (load(SK.txns)) qui peut être périmé même quand local v9 == cloud.
              // L'ancienne condition « longueurs égales → rien à faire » laissait alors l'état sur
              // la version legacy SANS les ajustements IBKR → positions figées à chaque boot.
              setTxns(merged);
              if(merged.length !== _localTx.length || merged.length !== _kvTx.length){ lsv9Set('cgi_txns', merged); }
              if(_purgedRaw>0 || merged.length > _kvTx.length){ saveBase('cgi_txns', merged); }
              console.info("[txns] état aligné sur la fusion : "+merged.length+" txn(s) (local v9 "+_localTx.length+" · cloud "+_kvTx.length+")");
            }
          }catch(e){ console.warn("[txns] réconciliation échouée:", e && e.message); }
          // Phase 3 v23.06 — réconciliation des snapshots (fusion par date d).
          // Récupère un snapshot local-only ET un snapshot fait sur un autre appareil,
          // et popule la clé canonique cgi_snapshots (restée vide jusqu'ici).
          try{
            const kvSnap = Array.isArray(kvData.cgi_snapshots) ? kvData.cgi_snapshots : [];
            const mergedSnap = unionSnapsByDate(cd, kvSnap);
            if(mergedSnap.length !== cd.length || mergedSnap.length !== kvSnap.length){
              setChartData(mergedSnap);
              lsv9Set('cgi_snapshots', mergedSnap);
              console.info("[snap] fusion local("+cd.length+") ∪ KV("+kvSnap.length+") = "+mergedSnap.length+" point(s)");
            }
            if(mergedSnap.length > kvSnap.length){   // local apporte des dates absentes du cloud → re-push
              saveBase('cgi_snapshots', mergedSnap);
              console.info("[snap] re-push KV : "+(mergedSnap.length - kvSnap.length)+" snapshot(s) manquant(s)");
            }
          }catch(e){ console.warn("[snap] réconciliation échouée:", e && e.message); }
          // Remplacer les séries statiques si KV a des données plus récentes
          const kvDD   = kvData.cgi_dd;
          const kvGDBS = kvData.cgi_gdbs;
          const kvGC   = kvData.cgi_gc;
          const kvGSB  = kvData.cgi_gsb;
          const kvCM   = kvData.cgi_cm;
          const kvSM   = kvData.cgi_sm;
          const kvTM   = kvData.cgi_tm;
          const kvYF   = kvData.cgi_yfmap;
          const kvPort = kvData.cgi_portfolio;
          const kvCryp = kvData.cgi_crypto;
          const kvStk  = kvData.cgi_stocks;
          const kvBank = kvData.cgi_bank;
          // #67 — adopter les positions synchronisées depuis IBKR par le worker,
          // si le tampon cloud ibkrSync est plus récent que le local (quantités = vérité IBKR).
          try{
            const _adoptIbkr=(key,kvv)=>{ if(!kvv||!kvv.ibkrSync) return;
              const loc=lsv9Get(key); const locTs=(loc&&loc.ibkrSync)||0;
              if(kvv.ibkrSync>locTs){ lsv9Set(key,kvv);
                console.info("[ibkr] "+key+" adopté depuis le cloud ("+new Date(kvv.ibkrSync).toISOString().slice(0,16)+")"); } };
            _adoptIbkr('cgi_portfolio', kvPort); _adoptIbkr('cgi_stocks', kvStk); _adoptIbkr('cgi_crypto', kvCryp);
            // #62 — PIN partagé : adopter le hash du cloud si présent et plus récent (ou si local
            // absent). Rend le code obligatoire sur TOUS les appareils, y compris le PWA iPhone
            // dont le localStorage est isolé. Si un code cloud existe et que la session n'est pas
            // valide, on (re)verrouille immédiatement.
            try{
              const _cp=kvData.cgi_pin;
              if(_cp && typeof _cp==="object" && ("hash" in _cp)){
                const _localHash=cgiGetPin(); const _localTs=(()=>{ try{ return parseInt(localStorage.getItem("cgi_pin_ts")||"0",10)||0; }catch(e){ return 0; } })();
                const _cloudTs=_cp.savedAt||0;
                if(_cloudTs>=_localTs && _cp.hash!==_localHash){
                  try{ if(_cp.hash) localStorage.setItem("cgi_pin", _cp.hash); else localStorage.removeItem("cgi_pin"); localStorage.setItem("cgi_pin_ts", String(_cloudTs)); }catch(e){}
                  console.info("[pin] code synchronisé depuis le cloud ("+(_cp.hash?"actif":"désactivé")+")");
                  if(_cp.hash && !cgiUnlockValid()){ setUnlocked(false); }
                }
              }
            }catch(e){}
            // #82 — cash matelas multi-appareils : adopter cgi_bank du cloud si son snapshot
            // (savedAt) est plus récent que le local. Sans ça, une modif + snapshot faits sur le
            // téléphone n'étaient jamais repris sur le PC (le local écrasait le cloud au boot).
            try{
              if(kvBank && kvBank.savedAt){
                const _lb=lsv9Get('cgi_bank'); const _lbTs=(_lb&&_lb.savedAt)||0;
                // #86f — comparer aussi le CONTENU : les saveBase du boot re-tamponnent le local au
                // même savedAt (égalité), ce qui bloquait l'adoption alors que le cloud diffère.
                // On adopte si le cloud est plus récent OU (égal/antérieur MAIS breakdown différent).
                const _cbd=kvBank.breakdown||{}, _lbd=(_lb&&_lb.breakdown)||{};
                let _bankDiffers=false; const _allK=new Set([...Object.keys(_cbd),...Object.keys(_lbd)]);
                _allK.forEach(k=>{ if(Math.round(_cbd[k]||0)!==Math.round(_lbd[k]||0)) _bankDiffers=true; });
                const _cbSavedAt=Math.max(kvBank.savedAt,_lbTs)+(_bankDiffers?1:0);
                // #86e — mémoriser pour la réconciliation post-boot (déclenchée dès que le contenu diffère)
                try{ if(kvBank.breakdown) setCloudBankSync({ breakdown:kvBank.breakdown, savedAt:_cbSavedAt, totalEUR:kvBank.totalEUR }); }catch(e){}
                if(kvBank.savedAt>_lbTs || _bankDiffers){ lsv9Set('cgi_bank', {...kvBank, savedAt:_cbSavedAt});
                  // #86c — l'affichage du Cash Matelas provient de cgi_portfolio (items cat "Cash
                  // Matelas"), PAS de cgi_bank. On répercute donc le breakdown adopté sur ces items
                  // du portfolio local, sinon le PC garde les anciens montants malgré l'adoption.
                  try{
                    const _bd=kvBank.breakdown||{};
                    // #86d — patcher les objets kvData EN MÉMOIRE (c'est eux qui construisent `live`
                    // au boot cloud), pas lsv9 (que le refresh ne relit pas). Idempotent.
                    const _syncBankItems=(obj)=>{ if(!obj||!obj.items) return;
                      const eU=obj.usdEur||0.92;
                      obj.items=obj.items.map(it=>{ if((it.cat)!=="Cash Matelas") return it;
                        const kk=Object.keys(_bd).find(k=>k.toUpperCase()===(it.t||"").toUpperCase());
                        if(kk==null) return it; const v=_bd[kk]||0;
                        if((it.valEUR!=null?it.valEUR:it.qty)!==v){ return {...it, valEUR:v, qty:v, val:Math.round(v*(1/(eU||0.92)))}; }
                        return it; });
                      obj.totalEUR = (obj.items||[]).filter(x=>x.cat==="Cash Matelas").reduce((s,x)=>s+(x.valEUR||0),0) || obj.totalEUR;
                    };
                    _syncBankItems(kvPort); _syncBankItems(kvStk);
                    // et miroir local pour cohérence hors-ligne
                    try{ const _lp=lsv9Get('cgi_portfolio'); if(_lp){ _syncBankItems(_lp); lsv9Set('cgi_portfolio',_lp); } }catch(e){}
                    console.info("[bank] items Cash Matelas réalignés sur le breakdown cloud (kvPort/kvStk)");
                  }catch(e){}
                  console.info("[bank] cgi_bank adopté du cloud (snapshot "+new Date(kvBank.savedAt).toISOString().slice(0,16)+" > local "+(_lbTs?new Date(_lbTs).toISOString().slice(0,16):"aucun")+")"); }
                else { console.info("[bank] cgi_bank cloud ignoré (local plus récent ou égal : cloud "+new Date(kvBank.savedAt).toISOString().slice(0,16)+" ≤ local "+(_lbTs?new Date(_lbTs).toISOString().slice(0,16):"?")+")"); }
              } else { console.info("[bank] cgi_bank cloud SANS savedAt (appareil source en ancienne version ?) — non adopté"); }
            }catch(e){}
            // #67n — clé de VÉRITÉ IBKR (quantités + cash USD, horodatée par le worker à chaque
            // synchro) : conservée telle quelle, elle sert de source directe au Cash Dip.
            try{
              if(kvData.cgi_ibkr_truth && kvData.cgi_ibkr_truth.ts){
                // #67p — clé localStorage DÉDIÉE : lsv9Set refuse silencieusement les clés hors
                // liste blanche LSV9_KEYS (ligne ~1302) → la vérité n'était jamais persistée.
                // Même pattern que cgi_watchlist_direct.
                localStorage.setItem('cgi_ibkr_truth_direct', JSON.stringify(kvData.cgi_ibkr_truth));
                console.info("[dip] clé de vérité IBKR reçue du cloud : cashUSD="+kvData.cgi_ibkr_truth.cashUSD+" · âge "+Math.round((Date.now()-kvData.cgi_ibkr_truth.ts)/36e5)+" h");
                // #67o — re-dériver les positions maintenant que la vérité est disponible :
                // le premier rebuild du boot a pu s'exécuter avant l'arrivée de cette clé.
                setTimeout(function(){ try{ handleRefresh(); }catch(e){} }, 800);
              } else {
                console.warn("[dip] clé de vérité IBKR ABSENTE de /read — worker ≥ v67-cgi requis, ou aucune synchro /ibkr_sync effectuée.");
              }
            }catch(e){}
          }catch(e){}

          // N'utiliser les données KV que si elles sont plus récentes que le build
          const buildLastDate = DD[DD.length-1] && DD[DD.length-1][0];
          const kvLastDate    = kvDD && kvDD.length>0 ? kvDD[kvDD.length-1][0] : null;
          const kvIsNewer     = kvLastDate && kvLastDate > buildLastDate;

          // Phase 3 v23.08 — DD & GDBS : FUSION par date (build ∪ miroir local ∪ KV),
          // au lieu d'un remplacement en bloc. KV prioritaire sur conflit ; re-push des
          // dates présentes en local mais absentes du cloud (récupère un snapshot offline).
          try {
            const mergedDD = unionSeriesByDate(unionSeriesByDate(DD, lsv9Get('cgi_dd')), kvDD);
            setLiveDD(mergedDD);
            lsv9Set('cgi_dd', mergedDD);
            const kvDDlen = (kvDD&&kvDD.length)||0;
            if(mergedDD.length > kvDDlen){ saveBase('cgi_dd', mergedDD); console.info("[dd] re-push KV : "+(mergedDD.length-kvDDlen)+" date(s) locale(s)"); }

            const mergedGDBS = unionSeriesByDate(unionSeriesByDate(GDBS, lsv9Get('cgi_gdbs')), kvGDBS);
            // v1.0 CGI — purger les entrées Infinity/NaN dans GDBS
      var cleanedGDBS = mergedGDBS.filter(function(p){ return Array.isArray(p) && isFinite(p[1]) && isFinite(p[2]); });
      if(cleanedGDBS.length === 0) cleanedGDBS = [[todayNC(), CURRENT.gdbS||100, CURRENT.gdbC||100]];
      setLiveGDBS(cleanedGDBS);
            lsv9Set('cgi_gdbs', mergedGDBS);
            const kvGlen = (kvGDBS&&kvGDBS.length)||0;
            if(mergedGDBS.length > kvGlen){ saveBase('cgi_gdbs', mergedGDBS); console.info("[gdbs] re-push KV : "+(mergedGDBS.length-kvGlen)+" date(s) locale(s)"); }
            console.info("[dd] fusion DD="+mergedDD.length+" · GDBS="+mergedGDBS.length);
          } catch(e){ console.warn("[dd] réconciliation DD/GDBS échouée:", e && e.message); }

          // Phase 3 v23.09 — GC / GSB / BENCH : même fusion par date (build ∪ miroir v9 ∪ KV).
          try {
            const mergedGC = unionSeriesByDate(unionSeriesByDate(GC_FULL, lsv9Get('cgi_gc')), kvGC);
            setLiveGC(mergedGC); lsv9Set('cgi_gc', mergedGC);
            const kvGCl=(kvGC&&kvGC.length)||0;
            if(mergedGC.length>kvGCl){ saveBase('cgi_gc', mergedGC); console.info("[gc] re-push KV : "+(mergedGC.length-kvGCl)+" date(s)"); }

            const mergedGSB = unionSeriesByDate(unionSeriesByDate(GS_B100_EXT, lsv9Get('cgi_gsb')), kvGSB);
            setLiveGSB(mergedGSB); lsv9Set('cgi_gsb', mergedGSB);
            const kvGSBl=(kvGSB&&kvGSB.length)||0;
            if(mergedGSB.length>kvGSBl){ saveBase('cgi_gsb', mergedGSB); console.info("[gsb] re-push KV : "+(mergedGSB.length-kvGSBl)+" date(s)"); }

            const kvBench = kvData.cgi_bench;
            const mergedBench = unionSeriesByDate(unionSeriesByDate(BENCH_IDX, lsv9Get('cgi_bench')), kvBench);
            setLiveBench(mergedBench); lsv9Set('cgi_bench', mergedBench);
            const kvBl=(kvBench&&kvBench.length)||0;
            if(mergedBench.length>kvBl){ saveBase('cgi_bench', mergedBench); console.info("[bench] re-push KV : "+(mergedBench.length-kvBl)+" date(s)"); }
            console.info("[series] fusion GC="+mergedGC.length+" · GSB="+mergedGSB.length+" · BENCH="+mergedBench.length);
          } catch(e){ console.warn("[series] réconciliation GC/GSB/BENCH échouée:", e && e.message); }

          // Phase 3 v23.10 — mensuelles CM/SM/TM : union par année (build ∪ miroir v9 ∪ KV).
          try {
            const recM = function(buildC, lsKey, kvVal){
              const merged = unionMonthlyByYear(unionMonthlyByYear(buildC, lsv9Get(lsKey)), kvVal);
              lsv9Set(lsKey, merged);
              if(totalFilled(merged) > totalFilled(kvVal)){ saveBase(lsKey, merged); }
              return merged;
            };
            const mCM = recM(CRYPTO_MONTHLY, 'cgi_cm', kvCM); setLiveCM(mCM);
            const mSM = recM(STOCKS_MONTHLY, 'cgi_sm', kvSM); setLiveSM(mSM);
            const mTM = recM(TOTAL_MONTHLY,  'cgi_tm', kvTM); setLiveTM(mTM);
            console.info("[monthly] fusion CM/SM/TM (mois remplis : "+totalFilled(mCM)+"/"+totalFilled(mSM)+"/"+totalFilled(mTM)+")");
          } catch(e){ console.warn("[monthly] réconciliation CM/SM/TM échouée:", e && e.message); }

          // v25.00 Phase 1 — reconciliation de la base investissements cgi_inv (union par id).
          // Recupere un mouvement offline (local, pas en KV) ET un mouvement dun autre appareil.
          try{
            const kvInv = Array.isArray(kvData.cgi_inv) ? kvData.cgi_inv : [];
            const localInv = lsv9Get('cgi_inv') || INV_SEED_OK;
            const mergedInv = unionTxnsById(localInv, kvInv);
            FUND_PARTS = cumulFundParts(mergedInv);   // v25.01 — parts live = cumul DB
            if(mergedInv.length !== localInv.length || mergedInv.length !== kvInv.length){
              setLiveInv(mergedInv);
              lsv9Set('cgi_inv', mergedInv);
              console.info("[inv] fusion local("+localInv.length+") + KV("+kvInv.length+") = "+mergedInv.length+" mvt(s)");
            }
            if(mergedInv.length > kvInv.length){
              saveBase('cgi_inv', mergedInv);
              console.info("[inv] re-push KV : "+(mergedInv.length - kvInv.length)+" mvt(s) local/seed manquant(s)");
            }
          }catch(e){ console.warn("[inv] reconciliation:", e && e.message); }
          // v26.00 Lot B — reconciliation futures + annexe IBKR (union par id, comme cgi_inv).
          try{
            const kvFut = Array.isArray(kvData.cgi_futures) ? kvData.cgi_futures : [];
            const localFut = lsv9Get('cgi_futures') || SEED_FUTURES;
            const mFut = unionTxnsById(localFut, kvFut);
            if(mFut.length !== localFut.length || mFut.length !== kvFut.length){ setLiveFutures(mFut); lsv9Set('cgi_futures', mFut); }
            if(mFut.length > kvFut.length){ saveBase('cgi_futures', mFut); }
            const kvAnx = Array.isArray(kvData.cgi_ibkr_annex) ? kvData.cgi_ibkr_annex : [];
            const localAnx = lsv9Get('cgi_ibkr_annex') || SEED_IBKR_ANNEX;
            const mAnx = unionTxnsById(localAnx, kvAnx);
            if(mAnx.length !== localAnx.length || mAnx.length !== kvAnx.length){ setLiveIbkrAnnex(mAnx); lsv9Set('cgi_ibkr_annex', mAnx); }
            if(mAnx.length > kvAnx.length){ saveBase('cgi_ibkr_annex', mAnx); }
          }catch(e){ console.warn("[futures/annex] reconciliation:", e && e.message); }
          // #67l — archive des exécutions IBKR (cgi_ibkr_trades) : affichage History uniquement,
          // jamais injectée dans cgi_txns (les fills partiels doublonneraient le rebuild).
          try{ const _it=kvData.cgi_ibkr_trades; if(_it && Array.isArray(_it.trades)){ setIbkrTrades(_it.trades);
            _IBKR_TRADES_CACHE=_it.trades;
            try{ localStorage.setItem('cgi_ibkr_trades_direct', JSON.stringify({ts:Date.now(),trades:_it.trades})); }catch(e){}
            console.info("[ibkr] archive exécutions chargée : "+_it.trades.length+" (fusionnées dans History/Spot et le drill-down par position)"); } }catch(e){}

          // Diagnostic récence (plus aucune série n'est remplacée en bloc ici)
          if(kvIsNewer) console.info("Bases KV plus récentes ("+kvLastDate+" > "+buildLastDate+")");
          else          console.info("Build plus récent que KV ("+buildLastDate+" >= "+kvLastDate+")");

          // YF_MAP : toujours merger (nouveaux tickers ajoutés par l'utilisateur)
          if(kvYF && typeof kvYF === "object"){
            Object.assign(YF_MAP, kvYF);
          }

          // Portfolio : injecter l'état matérialisé le plus RÉCENT entre local (miroir v9) et KV.
          // v23.16 — read-side "état matérialisé" : récence par savedAt (estampillé à chaque trade),
          // injection EN BLOC (pas de fusion champ par champ), aucun rejeu de l'historique.
          const lCryp=lsv9Get('cgi_crypto'), lStk=lsv9Get('cgi_stocks'), lBank=lsv9Get('cgi_bank'), lPort=lsv9Get('cgi_portfolio');
          const localSavedAt = Math.max((lCryp&&lCryp.savedAt)||0,(lStk&&lStk.savedAt)||0,(lBank&&lBank.savedAt)||0,(lPort&&lPort.savedAt)||0);
          const kvSavedAt    = Math.max((kvCryp&&kvCryp.savedAt)||0,(kvStk&&kvStk.savedAt)||0,(kvBank&&kvBank.savedAt)||0,(kvPort&&kvPort.savedAt)||0);
          const localFresher = localSavedAt > kvSavedAt && lPort && lCryp && lStk && lBank;
          const pCryp = localFresher ? lCryp : kvCryp;
          const pStk  = localFresher ? lStk  : kvStk;
          const pBank = localFresher ? lBank : kvBank;
          const pPort = localFresher ? lPort : kvPort;
          if(pPort && pCryp && pStk && pBank){
            const pPortDate = pPort.date || null;
            const buildDate  = CURRENT.date || DD[DD.length-1]?.[0];
            if(pPortDate && pPortDate > buildDate){
              console.info("[positions] injection "+(localFresher?"LOCAL v9":"KV")+" (savedAt local="+localSavedAt+" / KV="+kvSavedAt+", date="+pPortDate+")");
              const usdEur  = CURRENT.usdEur;
              const eurUsd  = 1/usdEur;
              const bankUSD = Math.round((pBank.totalEUR||CURRENT.bank.totalEUR)*eurUsd);
              const cryptoT = pCryp.total || pCryp.items.reduce((s,x)=>s+(x.val||0),0);
              const stocksT = pStk.total  || pStk.items.reduce((s,x)=>s+(x.val||0),0);
              const totalUSD = cryptoT + stocksT + bankUSD;
              const totalEUR = Math.round(totalUSD * usdEur);
              const newLivePos = {
                ...CURRENT,
                date:     pPortDate,
                totalUSD, totalEUR, usdEur, eurUsd,
                crypto:   {...CURRENT.crypto, ...pCryp, date: pPortDate},
                stocks:   {...CURRENT.stocks, ...pStk,  date: pPortDate},
                bank:     {...CURRENT.bank,   ...pBank, date: pPortDate},
                portfolio:{...pPort},
                _fromSnapshot: pPortDate,
              };
              delete newLivePos.savedAt;   // ne pas re-déclencher la persistance write-side
              const {gdbS: kgS, gdbC: kgC} = calcGdbPrices(newLivePos);
              // v23.24 — au boot sans refresh, les positions injectées ont des prix
              // périmés (dernier trade, pas les prix Yahoo actuels) → calcGdbPrices
              // donnerait des valeurs erronées. On préfère la base GDBS locale
              // (dernier snapshot validé). Le refresh recalculera avec les vrais prix.
              const _injGDBS  = lsv9Get('cgi_gdbs');
              const _injLastG = _injGDBS && _injGDBS.length>0 ? _injGDBS[_injGDBS.length-1] : null;
              const gdbSFinal = (_injLastG && _injLastG[1]) || kgS;
              const gdbCFinal = (_injLastG && _injLastG[2]) || kgC;
              setLive({...newLivePos, gdbS: gdbSFinal, gdbC: gdbCFinal});
              setRefreshedAt(localFresher ? "local v9" : ("snapshot "+pPortDate));
            }
          }
        }
      } catch(e){
        console.warn("Chargement bases KV échoué:", e.message);
      }

      // Dernier snapshot disponible
      const snapshots = cd.filter(r=>r.ao||r.t||r.w).sort((a,b)=>b.d.localeCompare(a.d));
      const last = snapshots[0];

      if(last?._portfolio){
        // ── Reconstruction depuis le dernier snapshot ─────────────────────
        // On utilise les QUANTITÉS du snapshot mais les PRIX de CURRENT
        // pour éviter d'afficher des valeurs périmées
        const p      = last._portfolio;
        const usdEur = CURRENT.usdEur;   // toujours le taux actuel
        const eurUsd = CURRENT.eurUsd;

        // Crypto : quantités snapshot + prix CURRENT
        const cryptoItems = p.crypto?.items?.map(x=>{
          const cur = CURRENT.crypto.items.find(c=>c.t===x.t);
          const livePrice = cur?.live || x.live || CURRENT.btcPrice;
          const qty = x.qty || cur?.qty || 0;
          const val = Math.round(qty * livePrice);
          const pnl = Math.round(val - qty * (x.pa || cur?.pa || 0));
          return { ...cur, ...x, live:livePrice, val, pnl, pct: cur?.pa ? (livePrice-cur.pa)/cur.pa : x.pct };
        }) || CURRENT.crypto.items;
        const cryptoTotal = cryptoItems.reduce((s,x)=>s+x.val,0);

        // Stocks : quantités snapshot + prix CURRENT
        const stocksItems = p.stocks?.items?.map(x=>{
          const cur = CURRENT.stocks.items.find(s=>s.t===x.t);
          const livePrice = cur?.live || x.live || 0;
          const qty = x.qty || cur?.qty || 0;
          const val = Math.round(qty * livePrice);
          const pnl = Math.round(val - qty * (x.pa || cur?.pa || 0));
          return { ...cur, ...x, live:livePrice, val, pnl };
        }) || CURRENT.stocks.items;
        const stocksTotal = stocksItems.reduce((s,x)=>s+x.val,0);

        // Banque : valeurs du snapshot (en €, on fait confiance)
        const bankEUR  = p.bank?.totalEUR || CURRENT.bank.totalEUR;
        const bankUSD  = Math.round(bankEUR * eurUsd);
        const totalUSD = cryptoTotal + stocksTotal + bankUSD;
        const totalEUR = Math.round(totalUSD * usdEur);

        // Reconstruire portfolio.items unifié
        const allItems = [
          ...cryptoItems.map(x=>({...x,cat:"Crypto"})),
          ...stocksItems.map(x=>({...x})),
          ...Object.entries(p.bank?.breakdown||CURRENT.bank.breakdown).map(([k,v])=>({
            t:k,cat:"Cash Matelas",qty:1,pa:v,live:v,valEUR:v,
            val:Math.round(v*eurUsd),pnl:0,pct:0,
          })),
        ];
        const snapEFF = {
          ...CURRENT,
          totalUSD, totalEUR, usdEur, eurUsd,
          btcPrice: CURRENT.btcPrice,
          gdbC: CURRENT.gdbC,
          gdbS: CURRENT.gdbS,
          crypto: {...CURRENT.crypto, date:p.date||last.d, total:cryptoTotal, items:cryptoItems},
          stocks: {...CURRENT.stocks, date:p.date||last.d, total:stocksTotal, items:stocksItems},
          bank:   {...CURRENT.bank, date:p.date||last.d, totalEUR:bankEUR, breakdown:p.bank?.breakdown||CURRENT.bank.breakdown},
          portfolio: {date:p.date||last.d, items:allItems},
          errors: [],
          _fromSnapshot: p.date || last.d,
        };
        const {gdbS: gdbS_s, gdbC: gdbC_s} = calcGdbPrices(snapEFF);
        setLive({...snapEFF, gdbS:gdbS_s, gdbC:gdbC_s});
        setRefreshedAt(`snapshot ${p.date||last.d}`);

      } else {
        // ── Fallback : CURRENT est déjà l'état final (les trades sont déjà intégrés) ──
        // On n'applique PAS les transactions — elles sont déjà dans CURRENT.crypto/stocks
        const replayedEFF = CURRENT;
        if(last){
          const usdEur  = last.eur || replayedEFF.usdEur;
          const eurUsd  = 1 / usdEur;
          const banqueEUR = last.cb || replayedEFF.bank.totalEUR;
          const btcPrice  = last.b  || replayedEFF.btcPrice;
          const btcItem   = replayedEFF.crypto.items[0];
          const btcVal    = Math.round(btcItem.qty * btcPrice);
          setLive({
            ...replayedEFF,
            usdEur, eurUsd, btcPrice,
            crypto: {...replayedEFF.crypto,
              items:[{...btcItem, live:btcPrice, val:btcVal,
                pnl:btcVal-Math.round(btcItem.pa*btcItem.qty)}]},
            bank: {...replayedEFF.bank, totalEUR:banqueEUR},
            errors:[], _fromSnapshot:last.d,
          });
          setRefreshedAt(`snapshot ${last.d}`);
        } else if(tx.length > 0){
          setLive({...replayedEFF, errors:[], _fromSnapshot:null});
          setRefreshedAt(`${tx.length} transaction(s)`);
        }
      }

      setReady(true);
      // v2.06 — forcer un refresh DATA KV 4s après le boot (saveBase async terminés)
      setTimeout(function(){ setKvRefreshTick(function(k){ return k+1; }); }, 2500);
    })();
  },[]);

  // v5.4 — garde-fou anti-blocage : si le boot n'a pas fini sous 8 s (plantage ou
  // await qui traîne), on force l'affichage pour ne jamais rester coincé sur l'écran de chargement.
  useEffect(function(){
    const _t = setTimeout(function(){ setReady(true); }, 8000);
    return function(){ clearTimeout(_t); };
  }, []);

  // ── Mise à jour des bases de données depuis un snapshot ──────────────────
  const [snapResult, setSnapResult] = useState(null); // {ok, log, errors, snap, nextData}

  // ── Pull-to-refresh ──────────────────────────────────────────────────────
  const[pullY,setPullY]=useState(0);
  const pullStartY=useRef(0);
  const pullActive=useRef(false);
  const PULL_THRESHOLD=50; // réduit de 70 à 50 pour plus de réactivité

  // LOT1 — pull-to-refresh retiré (le bouton ↺ du header suffit)

  function updateBasesFromSnapshot(snap, src, liveSeries){
    const log = [], errors = [];
    const today = snap.d;
    const usdEur = snap.eur || src.usdEur;
    const eurUsd = 1/usdEur;

    // Utiliser les séries live (post-snapshots précédents) si disponibles
    const _DD    = liveSeries?.liveDD    || liveDD    || DD;
    const _GDBS  = liveSeries?.liveGDBS  || liveGDBS  || GDBS;
    const _GC    = liveSeries?.liveGC    || liveGC    || GC_FULL;
    const _GSB   = liveSeries?.liveGSB   || liveGSB   || GS_B100_EXT;
    const _CM    = liveSeries?.liveCM    || liveCM    || CRYPTO_MONTHLY;
    const _SM    = liveSeries?.liveSM    || liveSM    || STOCKS_MONTHLY;
    const _TM    = liveSeries?.liveTM    || liveTM    || TOTAL_MONTHLY;
    const _BENCH = liveSeries?.liveBench || liveBench || BENCH_IDX;

    // ── Valeurs live du snapshot ───────────────────────────────────────────
    const btcLive  = snap._portfolio?.items?.find(x=>x.t==="BTC")?.live || src.btcPrice;
    const cryptoEUR= snap.wallet_crypto || Math.round((src.crypto?.total||0)*usdEur);
    const totalEUR = snap.total_eur || src.totalEUR; // total portefeuille hors immo
    const gdbS     = snap.gdbs || src.gdbS;
    const gdbC     = snap.gdbc || src.gdbC;
    const GS_JAN   = 11.7681;
    const MONTHS_FR= ["JAN","FEV","MAR","AVR","MAI","JUI","JUL","AOU","SEP","OCT","NOV","DEC"];

    // Helper upsert : écrase la ligne si la date existe déjà, sinon insère et trie
    function upsert(arr, row){
      const d = row[0];
      const idx = arr.findIndex(r=>r[0]===d);
      if(idx>=0){ const next=[...arr]; next[idx]=row; return next; }
      return [...arr, row].sort((a,b)=>a[0].localeCompare(b[0]));
    }

    // ── 1. Mise à jour DD ─────────────────────────────────────────────────
    const newRow = [today, cryptoEUR, totalEUR, btcLive, gdbS, usdEur];
    let newDD = upsert([..._DD], newRow);
    const existed = _DD.some(r=>r[0]===today);
    log.push("✓ DD : ligne "+(existed?"mise à jour":"ajoutée")+" ("+today+")");

    // ── 2. Mise à jour GDBS ───────────────────────────────────────────────
    let newGDBS = [..._GDBS];
    if(gdbS && gdbC){
      newGDBS = upsert(newGDBS, [today, gdbS, gdbC]);
      log.push("✓ GDBS : mis à jour (CGIS="+gdbS+", CGIC="+gdbC+")");
    } else errors.push("INDICES : indice C ou S manquant");

    // ── 3. Mise à jour GC_FULL ────────────────────────────────────────────
    let newGC = [..._GC];
    if(gdbC){
      newGC = upsert(newGC, [today, gdbC]);
      log.push("✓ GC_FULL : mis à jour");
    }

    // ── 4. Mise à jour GS_B100_EXT ────────────────────────────────────────
    let newGSB = [..._GSB];
    if(gdbS){
      const gsb = round2(gdbS/GS_JAN*100);
      newGSB = upsert(newGSB, [today, gsb]);
      log.push("✓ GS_B100_EXT : mis à jour ("+gsb+")");
    }

    // ── 5. Monthly : helper générique ─────────────────────────────────────
    function updateMonthly(base, liveEOM, year, monthIdx, inv=0){
      const m = MONTHS_FR[monthIdx];
      const updated = {...base};
      if(!updated[year]){
        // Nouvelle année
        updated[year] = { m:MONTHS_FR.map((_,i)=>i<=monthIdx?m:null).filter(Boolean),
          bom:[liveEOM,...Array(11).fill(null)],eom:[liveEOM,...Array(11).fill(null)],
          pct:[0,...Array(11).fill(null)],pnl:[0,...Array(11).fill(null)],
          inv:[inv,...Array(11).fill(null)],ttl_pnl:0,ttl_pct:0 };
        return updated;
      }
      const d = {...updated[year]};
      const months = d.m || MONTHS_FR;
      const mi = months.indexOf(m);
      if(mi >= 0){
        // Mois existant → mise à jour EOM
        const bom = d.bom[mi] || liveEOM;
        const pnl = Math.round(liveEOM - bom - (d.inv?.[mi]||0));
        const pct = bom ? round2(pnl/bom) : 0;
        d.eom = [...d.eom]; d.eom[mi] = liveEOM;
        d.pnl = [...d.pnl]; d.pnl[mi] = pnl;
        d.pct = [...d.pct]; d.pct[mi] = pct;
      } else {
        // Nouveau mois dans l'année existante
        const prevEOM = d.eom.filter(v=>v!=null).slice(-1)[0] || liveEOM;
        const mi2 = monthIdx;
        d.m    = [...d.m]; d.m[mi2]=m;
        d.bom  = [...d.bom]; d.bom[mi2]=prevEOM;
        d.eom  = [...d.eom]; d.eom[mi2]=liveEOM;
        const pnl2 = Math.round(liveEOM-prevEOM-inv);
        d.pnl  = [...d.pnl]; d.pnl[mi2]=pnl2;
        d.pct  = [...d.pct]; d.pct[mi2]=pnl2/prevEOM;
        d.inv  = [...(d.inv||[])]; d.inv[mi2]=inv;
      }
      d.ttl_pnl = d.pnl.filter(v=>v!=null).reduce((s,v)=>s+v,0);
      updated[year] = d;
      return updated;
    }

    const todayD = new Date(today);
    const year   = String(todayD.getFullYear());
    const monthI = todayD.getMonth();

    // ── 6. CRYPTO_MONTHLY ─────────────────────────────────────────────────
    let newCM = updateMonthly({..._CM}, cryptoEUR, year, monthI);
    log.push("✓ CRYPTO_MONTHLY : mis à jour ("+year+" "+MONTHS_FR[monthI]+" EOM=€"+cryptoEUR+")");

    // ── 7. STOCKS_MONTHLY ─────────────────────────────────────────────────
    const stocksEUR = Math.round((src.stocks?.items||[]).filter(x=>x.cat!=="Cash"&&x.cat!=="Cash Matelas").reduce((s,x)=>s+(x.val||0),0)*usdEur);
    let newSM = updateMonthly({..._SM}, stocksEUR, year, monthI);
    log.push("✓ STOCKS_MONTHLY : mis à jour (€"+stocksEUR+")");

    // ── 8. TOTAL_MONTHLY ──────────────────────────────────────────────────
    const totalLiveEUR = Math.round(totalEUR);
    let newTM = updateMonthly({..._TM}, totalLiveEUR, year, monthI);
    log.push("✓ TOTAL_MONTHLY : mis à jour (€"+totalLiveEUR+")");

    // ── 9. BENCH_IDX (indices de référence BTC/ETH/SP500/NASDAQ/MSCI) ──────
    // Toutes les valeurs sont disponibles dans le snap (issues du dernier refresh)
    const benchBTC  = snap._portfolio?.items?.find(x=>x.t==="BTC")?.live || btcLive || null;
    const benchETH  = snap._portfolio?._ethLive || snap.eth || null;
    const benchSP   = snap.sp500 || snap._portfolio?.items && src.stocks?.items?.find(x=>x.t==="QQQ")?.live || null;
    const benchNQ   = snap.nq   || benchSP || null;  // QQQ = proxy NASDAQ aussi
    const benchMSCI = snap.msci || src.stocks?.items?.find(x=>x.t==="URTH")?.live || null;
    // On upsert seulement si on a au moins BTC (qui vient du snapshot)
    let newBench = [..._BENCH];
    if(benchBTC){
      // Garder les valeurs existantes pour les colonnes qu'on n'a pas
      const existing = _BENCH.find(r=>r[0]===today);
      newBench = upsert(newBench, [
        today,
        benchBTC,
        benchETH  || existing?.[2] || null,   // ETH
        benchSP   || existing?.[3] || null,   // SP500
        benchNQ   || existing?.[4] || null,   // NASDAQ
        benchMSCI || existing?.[5] || null,   // MSCI
      ]);
      const ethLog = benchETH ? `, ETH=$${Math.round(benchETH)}` : "";
      log.push("✓ BENCH_IDX : BTC mis à jour ("+today+", $"+benchBTC+")"+ethLog);
    }

    // ── 10. Portfolio / Crypto / Stocks dans CURRENT (via snap) ───────────
    log.push("✓ _portfolio : sauvegardé avec date "+today);

    return {
      ok: errors.length===0, log, errors,
      newDD, newGDBS, newGC, newGSB, newCM, newSM, newTM, newBench,
    };
  }

  const addSnap=useCallback(async snap=>{
    const result = updateBasesFromSnapshot(snap, EFF||CURRENT, {liveDD, liveGDBS, liveGC, liveGSB, liveCM, liveSM, liveTM, liveBench});

    // Sauvegarder dans chartData (snapshots journaliers)
    // Règle : écrase si même date (snap.d), crée nouvelle ligne sinon
    // snap.d est déjà en UTC+11 via todayNC() ou choisi manuellement par l'utilisateur
    const snapDate = snap.d;
    const next=[...chartData.filter(r=>r.d!==snapDate), snap]
      .sort((a,b)=>a.d.localeCompare(b.d));
    setChartData(next);

    // Mettre à jour les états React des séries
    setLiveDD(result.newDD);
    setLiveGDBS(result.newGDBS);
    // Mettre à jour localData avec les valeurs du snapshot
    const src = EFF||CURRENT;
    setLocalData({
      totalUSD: src.totalUSD,
      totalEUR: src.totalEUR,
      date: snap.d || todayNC(),
      gdbS: snap.gdbs || src.gdbS,
      gdbC: snap.gdbc || src.gdbC,
    });
    setLiveGC(result.newGC);
    setLiveGSB(result.newGSB);
    setLiveCM(result.newCM);
    setLiveSM(result.newSM);
    setLiveTM(result.newTM);
    if(result.newBench) setLiveBench(result.newBench);
    setSnapResult({...result, snap, next, pendingUpload:true});
  },[chartData, EFF]);

  const doSnapUpload = useCallback(async()=>{
    if(!snapResult) return;
    const {next, newDD, newGDBS, newGC, newGSB, newCM, newSM, newTM, newBench} = snapResult;
    const uploadLog = [], uploadErrors = [];
    const liveState = snapResult.snap && snapResult.snap._portfolio
      ? snapResult.snap._portfolio : (EFF || CURRENT);

    // 1. Sauvegarder les snapshots journaliers
    try {
      await save(SK.chart, next);
      saveBase('cgi_snapshots', next);   // Phase 3 — base canonique : miroir v9 local + KV cgi_snapshots
      // #83 — historique des soldes par banque (Cash Matelas), pour la courbe du BankModal.
      // Stockage dédié (hors conteneur v9 restrictif), une entrée par jour de snapshot.
      try{
        const _bk=(liveState&&liveState.bank&&liveState.bank.breakdown)||null;
        if(_bk){
          const _d=(liveState&&liveState.date)||new Date().toISOString().slice(0,10);
          let _h=[]; try{ _h=JSON.parse(localStorage.getItem('cgi_bank_hist')||'[]'); }catch(e){}
          _h=_h.filter(x=>x&&x.d!==_d); _h.push({d:_d, bk:{..._bk}});
          _h.sort((a,b)=>a.d<b.d?-1:1); if(_h.length>400) _h=_h.slice(-400);
          localStorage.setItem('cgi_bank_hist', JSON.stringify(_h));
        }
      }catch(e){}
      saveBase('cgi_dd',   newDD);       // Phase 3 v23.08 — série DD : miroir v9 + KV + offline dirty
      saveBase('cgi_gdbs', newGDBS);     // Phase 3 v23.08 — série GDBS
      saveBase('cgi_gc',   newGC);                          // Phase 3 v23.09
      saveBase('cgi_gsb',  newGSB);                         // Phase 3 v23.09
      saveBase('cgi_bench', newBench || liveBench || BENCH_IDX); // Phase 3 v23.09
      saveBase('cgi_cm', newCM);   // Phase 3 v23.10 — mensuelles
      saveBase('cgi_sm', newSM);   // Phase 3 v23.10
      saveBase('cgi_tm', newTM);   // Phase 3 v23.10
      // v23.19 — positions aussi en local-first (miroir v9 + cloud best-effort)
      const _srcPos = EFF || CURRENT;
      saveBase('cgi_portfolio', _srcPos.portfolio || CURRENT.portfolio);
      saveBase('cgi_crypto',    _srcPos.crypto    || CURRENT.crypto);
      saveBase('cgi_stocks',    _srcPos.stocks    || CURRENT.stocks);
      saveBase('cgi_bank',      {...( _srcPos.bank || CURRENT.bank ), savedAt: Date.now()});
      uploadLog.push("✓ Bases locales enregistrées — snapshots, séries, positions ("+next.length+" points)");
    } catch(e){ uploadErrors.push("✗ Snapshots : "+e.message); }

    // 2+3. Sauvegarder toutes les bases en un seul appel /write-bases (avec retry)
    let basesOk = false;
    for(let attempt = 1; attempt <= 3 && !basesOk; attempt++){
      try {
        const bases = {
          cgi_txns: txns,
          cgi_bench: newBench || liveBench || BENCH_IDX,
          // Séries temporelles
          cgi_dd:   newDD,
          cgi_gdbs: newGDBS,
          cgi_gc:   newGC,
          cgi_gsb:  newGSB,
          // Monthly
          cgi_cm:   newCM,
          cgi_sm:   newSM,
          cgi_tm:   newTM,
          // Portfolio complet
          cgi_portfolio: (EFF||CURRENT).portfolio || CURRENT.portfolio,
          cgi_crypto:    (EFF||CURRENT).crypto    || CURRENT.crypto,
          cgi_stocks:    (EFF||CURRENT).stocks    || CURRENT.stocks,
          cgi_bank:      {...((EFF||CURRENT).bank || CURRENT.bank), savedAt: Date.now()},
          // YF_MAP (tickers refresh)
          cgi_yfmap: YF_MAP,
          cgi_icons: serializeIconDb(),
        };
        const res = await fetch(CF_WORKER_URL+"/write-bases", {
          method:"POST",
          headers:{"Content-Type":"application/json","X-Auth-Key":CF_AUTH_KEY},
          body: JSON.stringify(bases),
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json();
        if(!res.ok) throw new Error("HTTP "+res.status+" — "+(data.error||""));
        let written = new Set(data.written||[]);
        // v1.0 CGI — fallback : si le batch n'a rien écrit, tenter clé par clé
        if(written.size === 0){
          console.warn("[snapshot] batch write-bases vide — fallback saveBase individuel");
          const indivWritten = [];
          await Promise.all(Object.entries(bases).map(async([k,v])=>{
            if(v==null) return;
            const ok = await saveBase(k,v);
            if(ok) indivWritten.push(k);
          }));
          written = new Set(indivWritten);
          console.info("[snapshot] fallback écrit:", indivWritten.join(", "));
        }
        const snap   = snapResult.snap || {};
        const src    = EFF || CURRENT;
        // Ligne par base — on reprend les mêmes valeurs que dans le log local pour cohérence
        const snapDate = snap.d || today();
        if(written.has("cgi_bench")){
          const btc = newBench?.find(r=>r.d===snapDate);
          uploadLog.push("✓ BENCH_IDX : BTC="+(btc?"$"+btc.BTC:"—")+(btc?.ETH?" ETH=$"+btc.ETH:"")+" ("+snapDate+")");
        }
        if(written.has("cgi_dd")){
          const row = newDD?.find(r=>r.d===snapDate);
          uploadLog.push("✓ DD : "+(row?"ligne ("+snapDate+")":"mis à jour"));
        }
        if(written.has("cgi_gdbs")){
          const row = newGDBS?.find(r=>r.d===snapDate);
          uploadLog.push("✓ GDBS : "+(row?"CGIS="+row["CGIS"]+", CGIC="+row["CGIC"]:"mis à jour"));
        }
        if(written.has("cgi_gc"))  uploadLog.push("✓ GC_FULL : mis à jour");
        if(written.has("cgi_gsb")){
          const row = newGSB?.find(r=>r.d===snapDate);
          uploadLog.push("✓ GS_B100_EXT : "+(row?row["GS.B100"]:"mis à jour"));
        }
        if(written.has("cgi_cm")){
          const last = newCM && newCM[newCM.length-1];
          uploadLog.push("✓ CRYPTO_MONTHLY : "+(last?last.y+" "+last.m+" EOM=€"+last.eur:"mis à jour"));
        }
        if(written.has("cgi_sm")){
          const last = newSM && newSM[newSM.length-1];
          uploadLog.push("✓ STOCKS_MONTHLY : "+(last?"€"+last.eur:"mis à jour"));
        }
        if(written.has("cgi_tm")){
          const last = newTM && newTM[newTM.length-1];
          uploadLog.push("✓ TOTAL_MONTHLY : "+(last?"€"+last.eur:"mis à jour"));
        }
        if(written.has("cgi_txns"))     uploadLog.push("✓ Transactions : "+txns.length+" lignes");
        if(written.has("cgi_portfolio")) uploadLog.push("✓ Portfolio : sauvegardé");
        if(written.has("cgi_crypto"))   uploadLog.push("✓ Crypto : sauvegardé");
        if(written.has("cgi_stocks"))   uploadLog.push("✓ Stocks : sauvegardé");
        if(written.has("cgi_bank"))     uploadLog.push("✓ Bank : sauvegardé");
        if(written.has("cgi_yfmap"))    uploadLog.push("✓ YF_MAP : "+Object.keys(YF_MAP).length+" tickers");
        if(written.has("cgi_icons"))    uploadLog.push("✓ ICON_DB : "+Object.keys(ICON_DB).length+" icônes");
        // Clés échouées (dans ALLOWED mais non écrites)
        const failed = Object.keys(bases).filter(k=>!written.has(k));
        failed.forEach(k=>uploadErrors.push("✗ "+k+" : non confirmé"));
        basesOk = true;
      } catch(e){
        if(attempt < 3){
          await new Promise(r=>setTimeout(r, 2000));
        } else {
          uploadErrors.push("✗ Bases ("+attempt+" essais) : "+e.message);
        }
      }
    }

    setSnapResult(prev=>({...prev, pendingUpload:false, uploadLog, uploadErrors, uploadDone:true}));
      setKvRefreshTick(k=>k+1);
  },[snapResult, txns, EFF]);

  // v23.19 — Snapshot unifié : dès qu'un snapshot est calculé (addSnap → pendingUpload),
  // on persiste en local ET on tente le cloud automatiquement, en une seule action.
  // Le local réussit toujours ; seul l'envoi cloud peut figurer en erreur (offline).
  const _snapAutoRef = useRef(null);
  useEffect(()=>{
    if(snapResult && snapResult.pendingUpload && !snapResult.uploadDone && _snapAutoRef.current !== snapResult){
      _snapAutoRef.current = snapResult;
      doSnapUpload();
    }
  }, [snapResult, doSnapUpload]);

  const addTxn=useCallback(async t=>{
    const next=[t,...txns];setTxns(next);
    await save(SK.txns,next);                 // legacy (gdb_sons_v8 + KV cgi_data) — inchangé
    saveBase('cgi_txns', next);               // Phase 2 — base canonique : miroir v9 local + KV cgi_txns
  },[txns]);

  // v4.17 — Aperçu : injecte les quantités + PRU calculés depuis les transactions
  // dans les positions affichées (sans persister — un rechargement restaure l'état KV).
  const applyPositionsFromTxns=useCallback(()=>{
    const base=live||CURRENT;
    if(!base) return;
    const pos=computeOpenPositions(txns||[]);
    const posByTk={}; pos.forEach(p=>{ posByTk[p.ticker]=p; });
    const CRYPTO_HINT={BTC:1,ETH:1,SOL:1,XRP:1,ADA:1,DOGE:1,DOT:1,AVAX:1,LINK:1,MATIC:1,LTC:1,BCH:1,BNB:1};
    const rate=base.usdEur||(base.eurUsd?1/base.eurUsd:1);     // USD→EUR
    const eurUsd=base.eurUsd||(rate?1/rate:1);                 // EUR→USD
    const sum=function(arr){ return arr.reduce(function(s,x){ return s+(x.val||0); },0); };

    if(base.portfolio && base.portfolio.items && base.portfolio.items.length>0){
      // ── portfolio.items est la SOURCE DE VÉRITÉ (lu par buildSections) ──
      const pItems=base.portfolio.items;
      const seen={};
      const tradedTks={}; (txns||[]).forEach(function(t){ if(t&&t.ticker) tradedTks[t.ticker]=1; });
      let newItems=pItems.map(function(it){
        if(it.cat==="Crypto"||it.cat==="Cash Matelas") return it; // garder crypto + cash intacts
        const cp=posByTk[it.t];
        if(!cp){
          // pas de position calculée : si le ticker a été tradé → vendu à 100% → on retire ;
          // sinon (jamais tradé : or, indices détenus hors txns…) → on garde tel quel
          return tradedTks[it.t] ? null : it;
        }
        seen[it.t]=1;
        const lv=it.live||cp.avgUSD||1;
        const qty=cp.qty;
        const val=Math.round(qty*lv);
        const pa=cp.avgUSD!=null?cp.avgUSD:it.pa;
        const investi=(pa||lv)*qty;
        return {...it, qty:qty, pa:pa, val:val, pnl:Math.round(val-investi), pct:investi>0?(val-investi)/investi:0, valEUR:Math.round(val*rate)};
      }).filter(Boolean);
      pos.forEach(function(p){
        if(CRYPTO_HINT[p.ticker]) return; // actions seulement — pas d'ajout crypto
        if(seen[p.ticker]||pItems.some(function(x){ return x.t===p.ticker; })) return;
        const lv=p.avgUSD||1; const val=Math.round(p.qty*lv);
        newItems=newItems.concat([{t:p.ticker, qty:p.qty, pa:p.avgUSD||null, live:lv, val:val, pnl:0, pct:0, valEUR:Math.round(val*rate), cat:"Picking", _fromTxns:true}]);
      });
      // dérive stocks/crypto/bank depuis portfolio (même logique que buildSections)
      // v5.4 — cash buy-the-dip IBKR : USD = solde actuel, EUR = 0 ; on conserve STRC/KUCOIN/autres
      const _dipIt=pItems.find(function(x){ return (x.t||"").toUpperCase()==="USD"; });
      let DIP_USD=(_dipIt&&_dipIt.val!=null)?_dipIt.val:0; // solde IBKR USD — synchronisé par #67 (Cash Report)
      // #67l — la source la plus fiable est le portefeuille ADOPTÉ du cloud (estampillé ibkrSync),
      // l'état en mémoire pouvant encore porter la valeur du build.
      try{ const _p9=lsv9Get('cgi_portfolio'); const _u9=_p9&&_p9.items&&_p9.items.find(x=>(x.t||"").toUpperCase()==="USD");
        if(_p9&&_p9.ibkrSync&&_u9&&_u9.val!=null) DIP_USD=_u9.val; }catch(e){}
      // #67n — source DIRECTE et prioritaire : la clé de vérité IBKR (Cash Report, worker).
      // Le tampon ibkrSync pouvait être hérité par les écritures de l'app (valeur du build
      // recopiée avec le tampon) — la clé de vérité, elle, n'est écrite QUE par le worker.
      let _dipSrc="base/adopté";
      try{ const _tr=JSON.parse(localStorage.getItem('cgi_ibkr_truth_direct')||'null');
        if(_tr&&_tr.ts&&(Date.now()-_tr.ts)<48*36e5&&_tr.cashUSD!=null){ DIP_USD=_tr.cashUSD; _dipSrc="vérité IBKR ("+Math.round((Date.now()-_tr.ts)/36e5)+" h)"; }
        else if(_tr&&_tr.ts){ _dipSrc="vérité IBKR PÉRIMÉE ("+Math.round((Date.now()-_tr.ts)/36e5)+" h)"; }
        else { _dipSrc="vérité IBKR ABSENTE du stockage local"; } }catch(e){ _dipSrc="erreur lecture vérité"; }
      console.info("[dip] rebuild — source: "+_dipSrc+" · valeur: "+DIP_USD);
      var _hasUSD=false, _hasEUR=false;
      newItems=newItems.map(function(it){
        if(it.cat!=="Cash") return it;
        if(it.t==="USD"){ _hasUSD=true; return {...it, qty:DIP_USD, pa:1, live:1, val:Math.round(DIP_USD), valEUR:Math.round(DIP_USD*rate), pnl:0, pct:0}; }
        if(it.t==="EURO"){ _hasEUR=true; return {...it, qty:0, pa:it.pa||1.17, live:eurUsd, val:0, valEUR:0, pnl:0, pct:0}; }
        return it; // STRC, KUCOIN, etc. inchangés
      });
      if(!_hasUSD) newItems=newItems.concat([{t:"USD", cat:"Cash", qty:DIP_USD, pa:1, live:1, val:Math.round(DIP_USD), valEUR:Math.round(DIP_USD*rate), pnl:0, pct:0, _fromTxns:true}]);
      if(!_hasEUR) newItems=newItems.concat([{t:"EURO", cat:"Cash", qty:0, pa:1.17, live:eurUsd, val:0, valEUR:0, pnl:0, pct:0, _fromTxns:true}]);
      const cryptoItems=newItems.filter(function(x){ return x.cat==="Crypto"; });
      const stocksItems=newItems.filter(function(x){ return x.cat!=="Crypto"&&x.cat!=="Cash Matelas"; });
      const cryptoTotal=sum(cryptoItems), stocksTotal=sum(stocksItems);
      const bankTotalEUR=newItems.filter(function(x){ return x.cat==="Cash Matelas"; }).reduce(function(s,x){ return s+(x.valEUR||0); },0);
      const bankUSD=Math.round(bankTotalEUR*eurUsd);
      const totalUSD=cryptoTotal+stocksTotal+bankUSD, totalEUR=Math.round(totalUSD*rate);
      const tmpEFF={...base, portfolio:{...base.portfolio, items:newItems}, crypto:{...base.crypto, total:cryptoTotal, items:cryptoItems}, stocks:{...base.stocks, total:stocksTotal, items:stocksItems}, bank:{...base.bank, totalEUR:bankTotalEUR}};
      const g=calcGdbPrices(tmpEFF);
      setLive({...tmpEFF, totalUSD:totalUSD, totalEUR:totalEUR, usdEur:rate, eurUsd:eurUsd, gdbS:g.gdbS, gdbC:g.gdbC, _fromTxnsApplied:true, _txnsSig:_txnsSigOf(txns)});
      // #61 — PERSISTER les positions reconstruites (local + cloud) → survit au rechargement ET au vidage de cache
      try{ saveBase('cgi_crypto', tmpEFF.crypto); saveBase('cgi_stocks', tmpEFF.stocks);
        var _bkSA=(function(){ try{ var b=lsv9Get('cgi_bank'); return (b&&b.savedAt)||0; }catch(e){ return 0; } })();
        saveBase('cgi_bank', {...tmpEFF.bank, ...(_bkSA?{savedAt:_bkSA}:{})});
        saveBase('cgi_portfolio', tmpEFF.portfolio); }catch(e){}
      return;
    }

    // ── repli : pas de portfolio.items → on met à jour les ACTIONS seulement ──
    if(!base.stocks||!base.crypto) return;
    const stockTks={};  (base.stocks.items||[]).forEach(function(it){ stockTks[it.t]=1; });
    const tradedTks={}; (txns||[]).forEach(function(t){ if(t&&t.ticker) tradedTks[t.ticker]=1; });
    const updItems=function(items){
      return (items||[]).map(function(it){
        const cp=posByTk[it.t];
        if(!cp) return tradedTks[it.t] ? null : it; // tradé mais net 0 → vendu → retiré
        const lv=it.live||cp.avgUSD||1; const qty=cp.qty; const val=Math.round(qty*lv);
        const pa=cp.avgUSD!=null?cp.avgUSD:it.pa; const investi=(pa||lv)*qty;
        return {...it, qty:qty, pa:pa, val:val, pnl:Math.round(val-investi), pct:investi>0?(val-investi)/investi:0};
      }).filter(Boolean);
    };
    let newStocks=updItems(base.stocks.items);
    const newCrypto=(base.crypto.items||[]).slice(); // crypto inchangé
    pos.forEach(function(p){
      if(CRYPTO_HINT[p.ticker]||stockTks[p.ticker]) return; // actions seulement
      const lv=p.avgUSD||1;
      newStocks=newStocks.concat([{t:p.ticker, qty:p.qty, pa:p.avgUSD||null, live:lv, val:Math.round(p.qty*lv), pnl:0, pct:0, cat:"Picking", _fromTxns:true}]);
    });
    // v5.4 — cash dip IBKR aussi dans le repli : USD = solde, EUR = 0
    const _dipIt2=(base.stocks.items||[]).find(function(x){ return (x.t||"").toUpperCase()==="USD"; });
    let DIP_USD_FB=(_dipIt2&&_dipIt2.val!=null)?_dipIt2.val:0; var _hUSD=false,_hEUR=false;
    try{ const _p9b=lsv9Get('cgi_portfolio'); const _u9b=_p9b&&_p9b.items&&_p9b.items.find(x=>(x.t||"").toUpperCase()==="USD");
      if(_p9b&&_p9b.ibkrSync&&_u9b&&_u9b.val!=null) DIP_USD_FB=_u9b.val; }catch(e){}
    try{ const _trb=JSON.parse(localStorage.getItem('cgi_ibkr_truth_direct')||'null');   // #67n/p — clé de vérité IBKR prioritaire (stockage dédié)
      if(_trb&&_trb.ts&&(Date.now()-_trb.ts)<48*36e5&&_trb.cashUSD!=null) DIP_USD_FB=_trb.cashUSD; }catch(e){}
    newStocks=newStocks.map(function(it){
      if(it.cat!=="Cash") return it;
      if(it.t==="USD"){ _hUSD=true; return {...it, qty:DIP_USD_FB, pa:1, live:1, val:Math.round(DIP_USD_FB), valEUR:Math.round(DIP_USD_FB*rate), pnl:0, pct:0}; }
      if(it.t==="EURO"){ _hEUR=true; return {...it, qty:0, pa:it.pa||1.17, live:eurUsd, val:0, valEUR:0, pnl:0, pct:0}; }
      return it;
    });
    if(!_hUSD) newStocks=newStocks.concat([{t:"USD", cat:"Cash", qty:DIP_USD_FB, pa:1, live:1, val:Math.round(DIP_USD_FB), valEUR:Math.round(DIP_USD_FB*rate), pnl:0, pct:0, _fromTxns:true}]);
    if(!_hEUR) newStocks=newStocks.concat([{t:"EURO", cat:"Cash", qty:0, pa:1.17, live:eurUsd, val:0, valEUR:0, pnl:0, pct:0, _fromTxns:true}]);
    const stocksTotal=sum(newStocks), cryptoTotal=sum(newCrypto);
    const bankUSD=(base.bank&&base.bank.totalEUR!=null)?Math.round(base.bank.totalEUR*eurUsd):((base.bank&&base.bank.total)||0);
    const totalUSD=cryptoTotal+stocksTotal+bankUSD, totalEUR=Math.round(totalUSD*rate);
    const tmpEFF={...base, crypto:{...base.crypto, total:cryptoTotal, items:newCrypto}, stocks:{...base.stocks, total:stocksTotal, items:newStocks}, bank:{...base.bank}};
    const g=calcGdbPrices(tmpEFF);
    setLive({...tmpEFF, totalUSD:totalUSD, totalEUR:totalEUR, usdEur:rate, eurUsd:eurUsd, gdbS:g.gdbS, gdbC:g.gdbC, _fromTxnsApplied:true, _txnsSig:_txnsSigOf(txns)});
    // #61 — PERSISTER (local + cloud) → survit au rechargement et au vidage de cache
    try{ saveBase('cgi_crypto', tmpEFF.crypto); saveBase('cgi_stocks', tmpEFF.stocks);
      var _bkSA2=(function(){ try{ var b=lsv9Get('cgi_bank'); return (b&&b.savedAt)||0; }catch(e){ return 0; } })();
      saveBase('cgi_bank', {...tmpEFF.bank, ...(_bkSA2?{savedAt:_bkSA2}:{})}); }catch(e){}
  },[live,txns]);

  // #61 — VÉRITÉ UNIQUE : reconstruire AUTOMATIQUEMENT les positions depuis les transactions
  // après chaque actualisation. Garantit que les deux appareils, à partir des MÊMES transactions,
  // affichent EXACTEMENT les mêmes positions (plus de dépendance à un état matérialisé périmé).
  React.useEffect(()=>{
    if(txns && txns.length>0 && live && (!live._fromTxnsApplied || live._txnsSig !== _txnsSigOf(txns))){
      if(live._fromTxnsApplied) console.info("[txns] transactions modifiées ("+(live._txnsSig||"∅")+" → "+_txnsSigOf(txns)+") — rebuild des positions re-appliqué");
      try{ applyPositionsFromTxns(); }catch(e){}
      // #67m — re-priser juste après : le rebuild repart des prix de la base, potentiellement
      // anciens (titre créé par ajustement au prix du jour de l'ajustement, prix figés du build).
      // handleRefresh applique les cours Yahoo à jour sur les positions reconstruites.
      if(live._fromTxnsApplied) setTimeout(function(){ try{ handleRefresh(); }catch(e){} }, 600);
    }
  }, [live, txns, applyPositionsFromTxns]);

  // v25.05 Phase 4 — applyInvestment : transfert Cash Matelas <-> fonds, creation/destruction
  // de parts (cumul DB), conservation EXACTE du cours (deltaUSD=montant/usdEur, shares=deltaUSD/cours$).
  // E1 : debit/credit Cash Matelas SEULEMENT si holder===INV_OWNER ; sinon apport externe (fonds brut).
  const applyInvestment=useCallback(inv=>{
    const base=live||CURRENT;
    const ue=base.usdEur;
    const cours$=inv.fonds==="CGIC"?base.gdbC:base.gdbS;
    const montantEUR=parseFloat(inv.montant)||0;
    if(!cours$||cours$<=0||montantEUR<=0||!inv.holder) return;
    const sign=inv.io==="IN"?1:-1;
    const montantUSD=montantEUR/ue;
    const shares=montantUSD/cours$;
    const sharesSigned=sign*shares;
    const coursEur=cours$*ue;
    // 1. Ligne DB (montant signe comme le seed : negatif pour OUT)
    const row={ id:uid(), date:inv.date, fonds:inv.fonds, holder:inv.holder, io:inv.io,
      shares:parseFloat(sharesSigned.toFixed(6)), vps:parseFloat(coursEur.toFixed(6)), montant:parseFloat((sign*montantEUR).toFixed(2)) };
    const newInv=[...(liveInv||INV_SEED_OK), row];
    // 2. FUND_PARTS sync (avant setLive : calcGdbPrices lira la nouvelle valeur)
    FUND_PARTS=cumulFundParts(newInv);
    // 3. Positions
    setLive(prev=>{
      const b=prev||CURRENT;
      const u=b.usdEur||(b.eurUsd?1/b.eurUsd:0.8605);
      const eurUsd=b.eurUsd||1/u;
      const deltaUSD=sign*(montantEUR/u);
      const tgt=inv.fonds==="CGIC"?"KUCOIN":"EURO";
      // Injecter deltaUSD dans le cash-bucket du fonds. Robuste : recherche insensible a la
      // casse, creation si absent, et NORMALISATION du ticker vers KUCOIN/EURO (calcGdbPrices
      // lit ces tickers en exact -> sinon le fonds n'augmente pas et le cours derive).
      let stocksItems=b.stocks.items.map(i=>({...i}));
      let fi=stocksItems.findIndex(x=>(x.t||"").toUpperCase()===tgt);
      if(fi<0){
        stocksItems.push(inv.fonds==="CGIC"
          ? {t:"KUCOIN",cat:"Cash",qty:0,pa:1,live:1,val:0,pnl:0,pct:0}
          : {t:"EURO",cat:"Cash",qty:0,pa:1.17,live:eurUsd,val:0,pnl:0,pct:0});
        fi=stocksItems.length-1;
      }
      { const it={...stocksItems[fi]}; it.t=tgt; it.val=(it.val||0)+deltaUSD;
        if(inv.fonds==="CGIS"){ it.qty=(it.qty||0)+sign*montantEUR; } stocksItems[fi]=it; }
      let bank={...b.bank, breakdown:{...b.bank.breakdown}};
      let portfolioItems=b.portfolio&&b.portfolio.items;
      // Tuile du bucket fonds dans portfolio.items (affichage KuCoin / EURO)
      if(portfolioItems){
        let seen=false;
        portfolioItems=portfolioItems.map(it=>{
          if((it.t||"").toUpperCase()!==tgt) return it;
          seen=true; const nv=(it.val||0)+deltaUSD;
          return inv.fonds==="CGIS"
            ? {...it, t:tgt, val:nv, qty:(it.qty||0)+sign*montantEUR, valEUR:(it.valEUR!=null?it.valEUR:0)+sign*montantEUR}
            : {...it, t:tgt, val:nv, valEUR:Math.round(nv*u)};
        });
        if(!seen) portfolioItems=[...portfolioItems, inv.fonds==="CGIC"
          ? {t:"KUCOIN",cat:"Cash",qty:0,pa:1,live:1,val:deltaUSD,pnl:0,pct:0,valEUR:Math.round(deltaUSD*u)}
          : {t:"EURO",cat:"Cash",qty:sign*montantEUR,pa:1.17,live:eurUsd,val:deltaUSD,pnl:0,pct:0,valEUR:sign*montantEUR}];
      }
      if(inv.holder===INV_OWNER){
        bank.breakdown[inv.bank]=(bank.breakdown[inv.bank]||0)-sign*montantEUR;
        bank.totalEUR=Object.values(bank.breakdown).reduce((s,v)=>s+v,0);
        if(portfolioItems){
          portfolioItems=portfolioItems.map(it=>{
            if(it.cat!=="Cash Matelas"||it.t!==inv.bank) return it;
            const nv=(it.valEUR!=null?it.valEUR:it.qty)-sign*montantEUR;
            return {...it, qty:nv, valEUR:nv, val:Math.round(nv*eurUsd), live:eurUsd};
          });
        }
      }
      const stocksTotal=stocksItems.filter(x=>x.cat!=="Cash").reduce((s,x)=>s+x.val,0);
      const cashStocks =stocksItems.filter(x=>x.cat==="Cash").reduce((s,x)=>s+x.val,0);
      const bankUSD    =Math.round(bank.totalEUR/u);
      const totalUSD   =b.crypto.total+stocksTotal+bankUSD+cashStocks;
      const updated={...b, stocks:{...b.stocks, items:stocksItems, total:Math.round((b.stocks.total||0)+deltaUSD)}, bank, totalUSD, totalEUR:Math.round(totalUSD*u),
        ...(portfolioItems?{portfolio:{...b.portfolio, items:portfolioItems}}:{}), savedAt:Date.now()};
      const {gdbS,gdbC}=calcGdbPrices(updated);
      return {...updated, gdbS, gdbC};
    });
    // 4. Persister cgi_inv (local + cloud, dirty si offline)
    setLiveInv(newInv);
    lsv9Set('cgi_inv', newInv);
    saveBase('cgi_inv', newInv);
    console.info("[invest] "+inv.io+" "+inv.fonds+" "+inv.holder+" "+montantEUR+" -> "+sharesSigned.toFixed(4)+" parts | FUND_PARTS="+JSON.stringify(FUND_PARTS));
  },[live, liveInv]);

  const applyTradeToEFF=useCallback(trade=>{
    setLive(prev=>{
      const base = prev||CURRENT;
      if(trade._directBank){
        // Dépôt/Retrait bancaire
        // Recalcul depuis prev.bank (pas src.bank qui peut être stale)
        const isRetrait = trade.side==="RETRAIT";
        const montantEUR = trade.qty; // qty = montant en €
        const delta = isRetrait ? -montantEUR : montantEUR;
        const bankName = trade.bankAccount;
        const eurUsd = base.eurUsd || 1/(base.usdEur||0.852);

        // Nouveau bank depuis prev
        const newBreakdown = {...base.bank.breakdown};
        newBreakdown[bankName] = (newBreakdown[bankName]||0) + delta;
        const newTotalEUR = Object.values(newBreakdown).reduce((s,v)=>s+v, 0);
        const newBank = {
          ...base.bank,
          breakdown: newBreakdown,
          totalEUR: newTotalEUR,
        };

        // Mettre à jour portfolio.items pour le Cash Matelas correspondant
        let newPortfolioItems = base.portfolio?.items;
        if(newPortfolioItems){
          newPortfolioItems = newPortfolioItems.map(item=>{
            if(item.cat!=="Cash Matelas" || item.t!==bankName) return item;
            const newValEUR = (item.valEUR||item.qty) + delta;  // peut être négatif (découvert)
            const newQty    = newValEUR; // qty = montant €
            const newVal    = Math.round(newValEUR * eurUsd);
            return {...item, qty:newQty, valEUR:newValEUR, val:newVal, live:eurUsd};
          });
        }

        // Recalc totaux
        const deltaUSD = Math.round(delta * eurUsd);
        const newTotalUSD = base.totalUSD + deltaUSD;
        const newTotalEURtot = Math.round(newTotalUSD * (base.usdEur||0.852));

        return {
          ...base,
          bank: newBank,
          totalUSD: newTotalUSD,
          totalEUR: newTotalEURtot,
          ...(newPortfolioItems ? {portfolio:{...base.portfolio, items:newPortfolioItems}} : {}),
          savedAt: Date.now(),   // v23.11 — tampon : déclenche la persistance de l'état
        };
      }
      // Achat/Vente : applyTrade retourne un objet complet
      const updated = applyTrade(trade, base);
      // Recalculer CGIC et CGIS depuis les nouvelles valeurs
      const {gdbS, gdbC} = calcGdbPrices(updated);
      return {...base, ...updated, gdbS, gdbC, savedAt: Date.now()};   // v23.11 — tampon de persistance
    });
  },[]);

  // v23.11 — Persistance de l'état du portefeuille après un trade (modèle « état matérialisé »).
  // On NE rejoue PAS l'historique : on persiste l'état muté tel quel, tamponné par savedAt.
  // L'effet ne persiste que quand savedAt change (= un trade) ; refresh/boot ne le déclenchent pas.
  const _lastPersistedTrade = useRef(null);
  useEffect(()=>{
    const stamp = live && live.savedAt;
    if(!stamp || _lastPersistedTrade.current === stamp) return;
    _lastPersistedTrade.current = stamp;
    try {
      if(live.crypto)    saveBase('cgi_crypto',    {...live.crypto,    savedAt: stamp});
      if(live.stocks)    saveBase('cgi_stocks',    {...live.stocks,    savedAt: stamp});
      if(live.bank)      saveBase('cgi_bank',      {...live.bank,      savedAt: stamp});
      if(live.portfolio) saveBase('cgi_portfolio', {...live.portfolio, savedAt: stamp, date: live.date});
      console.info("[positions] état persisté après trade (savedAt="+stamp+")");
    } catch(e){ console.warn("[positions] persistance échouée:", e && e.message); }
  }, [live]);

  // Splash : on le retire seulement quand l'app est prete (anime jusqu'au bout du chargement).
  useEffect(()=>{
    if(!ready) return;
    if(typeof window!=="undefined" && window.__hideLoader){ window.__hideLoader(); return; }
    const l=(typeof document!=="undefined")&&document.getElementById("loader");
    if(l){ l.style.opacity="0"; setTimeout(function(){ l.style.display="none"; }, 500); }
  }, [ready]);

  const delTxn=useCallback(async id=>{
    const next=txns.filter(t=>t.id!==id);setTxns(next);await save(SK.txns,next);
    saveBase('cgi_txns', next);   // Phase 3 — propager la suppression vers la base canonique
  },[txns]);

  if(!ready)return(
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:18}}>
      <img src={APP_LOGO} alt="J.C. Global Investments" style={{height:120,width:"auto",objectFit:"contain",filter:"drop-shadow(0 8px 30px rgba(201,168,106,.35))"}}/>
      <div style={{fontFamily:"'Cormorant Garamond',Georgia,serif",fontWeight:400,fontSize:22,color:C.text,letterSpacing:6,textAlign:"center"}}><span style={{color:C.gold,fontWeight:500}}>J.C.</span><br/>GLOBAL INVESTMENTS</div>
      <div style={{color:C.text3,fontSize:10,letterSpacing:4}}>CHARGEMENT…</div>
    </div>
  );

  // ── Écran de démarrage ────────────────────────────────────────────────────
  if(startScreen) return(
    <div style={{fontFamily:"'-apple-system',sans-serif",background:C.bg,minHeight:"100vh",color:C.text,maxWidth:430,margin:"0 auto",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
      {/* Logo */}
      <img src={APP_LOGO} alt="J.C. Global Investments" style={{height:108,width:"auto",objectFit:"contain",marginBottom:18,filter:"drop-shadow(0 6px 26px rgba(201,168,106,.32))"}}/>
      <div style={{fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:24,fontWeight:400,color:C.text,letterSpacing:5,marginBottom:6,textAlign:"center"}}><span style={{color:C.gold,fontWeight:500}}>J.C.</span> GLOBAL INVESTMENTS</div>
      <div style={{fontSize:10,color:C.text3,marginBottom:34,letterSpacing:3}}>CHOISIR LA SOURCE DE DONNÉES</div>
      <div style={{position:"absolute",top:16,right:20,fontSize:10,color:C.gold,fontFamily:C.font}}>{APP_VERSION}</div>

      {startLoading ? (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
          <div style={{fontSize:24,animation:"spin 1s linear infinite"}}>↻</div>
          <div style={{fontSize:12,color:C.gray}}>Connexion à Cloudflare...</div>
        </div>
      ) : (
        <div style={{width:"100%",display:"flex",flexDirection:"column",gap:14}}>

          {/* Carte LOCAL */}
          <div onClick={()=>applyStartChoice(false)} style={{
            background:C.bg2,borderRadius:16,padding:"18px 20px",
            border:`2px solid ${C.btc}`,cursor:"pointer",
            boxShadow:"0 4px 20px rgba(247,147,26,.15)",
          }}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:22}}>📱</span>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:C.text}}>Base locale</div>
                  <div style={{fontSize:10,color:C.gray}}>Build intégré dans l'app</div>
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:18,fontWeight:600,color:C.btc}}>${fmtK(localData?.totalUSD||0)}</div>
                <div style={{fontSize:11,color:C.gray}}>€{fmtK(localData?.totalEUR||0)}</div>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.gray,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
              <span>📅 {localData?.date||"—"}</span>
              <span>CGIS ${localData?.gdbS||"—"} · CGIC ${localData?.gdbC||"—"}</span>
            </div>
          </div>

          {/* Carte CLOUDFLARE */}
          {kvError ? (
            <div style={{background:C.bg2,borderRadius:16,padding:"18px 20px",border:`2px solid ${C.border}`,opacity:.6}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:22}}>☁️</span>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:C.gray}}>Cloudflare KV</div>
                  <div style={{fontSize:10,color:C.red}}>{kvError}</div>
                </div>
              </div>
            </div>
          ) : (
            <div onClick={()=>applyStartChoice(true)} style={{
              background:C.bg2,borderRadius:16,padding:"18px 20px",
              border:`2px solid ${C.teal}`,cursor:"pointer",
              boxShadow:"0 4px 20px rgba(56,189,248,.1)",
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:22}}>☁️</span>
                  <div>
                    <div style={{fontSize:14,fontWeight:600,color:C.text}}>Cloudflare KV</div>
                    <div style={{fontSize:10,color:C.gray}}>Dernier snapshot cloud</div>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:18,fontWeight:600,color:C.teal}}>${fmtK(kvData_snap?.totalUSD||0)}</div>
                  <div style={{fontSize:11,color:C.gray}}>€{fmtK(kvData_snap?.totalEUR||0)}</div>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.gray,paddingTop:8,borderTop:`1px solid ${C.border}`}}>
                <span>📅 {kvData_snap?.date||"—"}</span>
                <span>CGIS ${kvData_snap?.gdbS||"—"} · CGIC ${kvData_snap?.gdbC||"—"}</span>
              </div>
            </div>
          )}

        </div>
      )}
      <style>{"@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}"}</style>
    </div>
  );

  if(!unlocked) return <PinLock onUnlock={()=>{ setDemo(false); setDemoMode(null); setUnlocked(true); }} onDemo={(kind)=>{ const k=kind||"masked"; setDemo(true); setDemoMode(k); setHidden(k==="masked"); setUnlocked(true); }}/>;

  return(
    <div key={themeName} style={{fontFamily:C.font||"'-apple-system',sans-serif",background:C.bg,minHeight:"100vh",color:C.text,maxWidth:430,margin:"0 auto",paddingBottom:78,boxShadow:themeName==="midnight"?"0 0 80px rgba(180,100,240,.08)":themeName==="bitcoin"?"0 0 80px rgba(247,147,26,.06)":"none"}}>
      {demo && (
        <div onClick={()=>{ setDemo(false); setDemoMode(null); setHidden(false); setUnlocked(false); }} style={{position:"fixed",top:8,left:"50%",transform:"translateX(-50%)",zIndex:99998,background:"rgba(201,168,106,.15)",border:"1px solid rgba(201,168,106,.5)",color:C.gold,fontSize:10,letterSpacing:2,textTransform:"uppercase",padding:"4px 12px",borderRadius:999,cursor:"pointer",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)"}}>{(demoMode==="small"?"Démo · ≈ 30 K$":demoMode==="large"?"Démo · ≈ 1,6 M$":"Mode démo")+" · toucher pour quitter"}</div>
      )}
      {bankToast && (
        <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",zIndex:99999,background:"rgba(20,22,28,.96)",border:`1px solid ${C.border2}`,color:C.text,fontSize:12.5,fontWeight:600,padding:"10px 18px",borderRadius:12,boxShadow:"0 8px 24px rgba(0,0,0,.4)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)"}}>{bankToast}</div>
      )}
      <div style={{
        padding:"13px 16px 11px 2px",display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,zIndex:100,
        background:C.bg,
        backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
      }}>
        {/* Gauche : logo cliquable -> accueil (comme la maquette) */}
        <div onClick={()=>setTab(0)} data-snd="home" title="Accueil" style={{display:"flex",alignItems:"center",gap:1,cursor:"pointer",minWidth:0}}>
          <img src={APP_LOGO} alt="J.C." style={{width:54,height:48,objectFit:"contain",flexShrink:0,filter:"drop-shadow(0 2px 7px rgba(0,0,0,.5))"}}/>
          <span style={{fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:15,fontWeight:600,letterSpacing:2,lineHeight:1.05,color:C.text}}>
            <span style={{color:C.gold}}>J.C.</span><br/>GLOBAL INV.
          </span>
        </div>

        {/* Droite : notifications + reglages (#63 — Achat/Vente déplacé dans l'onglet Portfolio) */}
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <NotifBell inline/>
          <button onClick={()=>setShowSettings(true)} title="Reglages" style={{
            width:32,height:32,borderRadius:C.radiusSm||8,
            border:`1px solid ${C.border2}`,background:"transparent",
            cursor:"pointer",color:C.text2,
            display:"flex",alignItems:"center",justifyContent:"center",
          }}><Icon name="gear" size={17}/></button>
        </div>
      </div>
      {/* ── Pull-to-refresh retiré (LOT1) ── */}
      <div style={{padding:"0 16px"}}>
        {tab===0 && <PageOverview chartData={chartData} onSnapshot={()=>setShowSnap(true)} {...liveProps} liveDD={liveDD} liveCM={liveCM} liveGDBS={liveGDBS} liveGC={gcEff} chosenSource={chosenSource} iconDbVersion={iconDbVersion} bumpIconDb={bumpIconDb}/>}
        {tab===1 && <PageAllocation hidden={hidden} EFF={EFF} eur={eur} setEur={setEur} iconDbVersion={iconDbVersion} bumpIconDb={bumpIconDb} liveOk={liveOk} onTrade={()=>setShowTrade(true)} txns={txns} ibkrTrades={ibkrTrades}/>}
        {tab===2 && <PageStats chartData={chartData} hidden={hidden} EFF={EFF} eur={eur} liveDD={liveDD} src={EFF||CURRENT} liveInv={liveInv} liveCM={liveCM} liveSM={liveSM} liveTM={liveTM}/>}
        {tab===3 && <PageGDB chartData={chartData} hidden={hidden} EFF={EFF} eur={eur} liveGSB={liveGSB} liveGDBS={liveGDBS} liveBench={liveBench} liveGC={gcEff} liveDD={liveDD} liveInv={liveInv}/>}
        {tab===6 && <PageWatchlist EFF={EFF} hidden={hidden}/>}
        {tab===5 && <PageLegend txns={txns} liveFutures={liveFutures} hidden={hidden} eur={eur} EFF={EFF} liveIbkrAnnex={liveIbkrAnnex} ibkrTrades={ibkrTrades}/>}
        {tab===4 && <PageData EFF={EFF} hidden={hidden} txns={txns} addTxn={addTxn} delTxn={delTxn} applyPositions={applyPositionsFromTxns} chartData={chartData} kvRefreshTick={kvRefreshTick}
          liveDD={liveDD} liveGDBS={liveGDBS} liveGC={gcEff} liveGSB={liveGSB}
          handleRefresh={handleRefresh} refreshing={refreshing} gistSync={gistSync} onOpenKvDiag={()=>setShowGistDiag(true)}
          liveCM={liveCM} liveSM={liveSM} liveTM={liveTM} liveBench={liveBench} liveInv={liveInv} liveFutures={liveFutures} liveIbkrAnnex={liveIbkrAnnex}/> }
        {/* Buy & Sell accessible via bouton flottant uniquement */}
      </div>
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:430,background:C.bg,borderTop:`1px solid ${C.border}`,display:"flex",padding:"8px 0 20px",zIndex:100}}>
        {TABS.map((lb,i)=>(
          (i===4||i===0) ? null : (
          <button key={i} onClick={()=>setTab(i)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,height:52,padding:"4px 2px",background:"none",border:"none",cursor:"pointer",color:tab===i?C.gold:C.text3,transition:"color .15s"}}>
            {i===3
              ? <img src={APP_LOGO} alt="JCGI" style={{width:40,height:33,objectFit:"contain",marginTop:-4,opacity:tab===i?1:.5,transition:"opacity .15s"}}/>
              : <Icon name={NAV_ICONS[i]} size={21}/>}
            <span style={{fontSize:9,fontWeight:700,lineHeight:1,display:"block"}}>{lb}</span>
          </button>
          )
        ))}
      </div>
      {/* Buy & Sell accessible via snapshot uniquement */}
      {/* Toast refresh — visible depuis tous les onglets */}
      {refreshErr&&typeof refreshErr==="object"&&(
        <div style={{
          position:"fixed",top:52,left:"50%",transform:"translateX(-50%)",
          zIndex:300,width:"92%",maxWidth:410,
          background:C.bg1,border:`1px solid ${C.border2}`,
          borderRadius:10,padding:"10px 14px",
          boxShadow:"0 6px 24px rgba(0,0,0,.7)",
          fontSize:11,
        }}
          onClick={()=>setRefreshErr(null)}
        >
          {refreshErr.fail?.length>0&&(
            <div style={{color:C.red,marginBottom:refreshErr.ok?.length?5:0}}>
              <span style={{fontWeight:700}}>⚠ Échec :</span> {refreshErr.fail.join(", ")}
            </div>
          )}
          {refreshErr.ok?.length>0&&(
            <div style={{color:C.green}}>
              <span style={{fontWeight:700}}>✓ Mis à jour :</span> {refreshErr.ok.join(", ")}
            </div>
          )}
          <div style={{fontSize:9,color:C.text3,marginTop:4,textAlign:"right"}}>Appuie pour fermer</div>
        </div>
      )}
      {showTrade&&<TradeModal onClose={()=>setShowTrade(false)} onAdd={addTxn} onTradeApplied={applyTradeToEFF} EFF={EFF} holders={invHolders} onInvestApplied={applyInvestment}/>}
      {showGistDiag&&(
        <div style={{position:"fixed",inset:0,zIndex:600,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onClick={()=>setShowGistDiag(false)}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:C.bg1,borderRadius:"20px 20px 0 0",padding:"20px 20px 40px",
            width:"100%",maxWidth:430,border:`1px solid ${C.border}`,
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:C.border,margin:"0 auto 16px"}}/>
            <div style={{fontSize:13,fontWeight:600,color:gistSync?C.green:C.red,marginBottom:14}}>
              {gistSync?"🟢":"🔴"} Connexion Cloudflare — {gistSync?"Opérationnelle":"Erreur"}
            </div>
            <div style={{background:C.bg2,borderRadius:10,padding:"12px 14px",fontFamily:C.font,fontSize:11,display:"flex",flexDirection:"column",gap:8}}>
              <div><span style={{color:C.gray}}>WORKER :</span> <span style={{color:C.text,fontSize:9}}>{CF_WORKER_URL}</span></div>
              <div><span style={{color:C.gray}}>AUTH_KEY :</span> <span style={{color:C.text}}>{CF_AUTH_KEY.slice(0,8)}…</span></div>
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:8}}>
                <span style={{color:C.gray}}>Statut :</span>{" "}
                {gistSync ? (
                  <span style={{color:C.green,fontWeight:700}}>✓ Connecté — lecture/écriture OK</span>
                ) : (
                  <span style={{color:C.red,fontWeight:700}}>
                    {gistError?.status ?? "—"} {gistError?.statusText ?? "Connexion impossible"}
                  </span>
                )}
              </div>
              {!gistSync && gistError?.body&&(
                <div style={{borderTop:`1px solid ${C.border}`,paddingTop:8}}>
                  <div style={{color:C.gray,marginBottom:4}}>Réponse serveur :</div>
                  <div style={{color:C.text,wordBreak:"break-all",fontSize:10}}>{gistError.body}</div>
                </div>
              )}
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:8}}>
                <span style={{color:C.gray}}>Endpoint :</span>
                <div style={{color:C.teal,fontSize:9,wordBreak:"break-all",marginTop:2}}>
                  {CF_WORKER_URL}/ping
                </div>
              </div>
            </div>
            {!gistSync&&(
              <div style={{marginTop:12,fontSize:10,color:C.gray,lineHeight:1.5}}>
                💡 Capture d'écran et envoie-la pour diagnostic.
              </div>
            )}
            <button onClick={()=>setShowGistDiag(false)} style={{
              marginTop:14,width:"100%",padding:"10px 0",borderRadius:10,
              background:gistSync?C.green+"22":C.bg2,
              border:`1px solid ${gistSync?C.green:C.border}`,
              color:gistSync?C.green:C.text,fontSize:13,cursor:"pointer",fontWeight:700,
            }}>Fermer</button>
          </div>
        </div>
      )}
      {showSnap&&<SnapshotModal onSave={addSnap} onClose={()=>setShowSnap(false)} EFF={EFF}/>}

      {/* ── Écran résultat snapshot ── */}
      {snapResult&&(
        <div style={{position:"fixed",inset:0,zIndex:700,background:"rgba(0,0,0,.85)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onClick={snapResult.uploadDone?()=>setSnapResult(null):undefined}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:C.bg1,borderRadius:"20px 20px 0 0",padding:"20px 16px 40px",
            width:"100%",maxWidth:430,border:`1px solid ${C.border}`,maxHeight:"80vh",overflowY:"auto",
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:C.border,margin:"0 auto 16px"}}/>

            <div style={{fontSize:14,fontWeight:600,color:snapResult.ok?C.green:C.red,marginBottom:14}}>
              {snapResult.ok?"✅ Bases de données mises à jour":"⚠️ Erreurs lors de la mise à jour"}
            </div>

            {/* ── Base locale ── */}
            <div style={{background:C.bg2,borderRadius:12,padding:"10px 14px",marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:600,color:C.gray,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>📱 Base locale</div>
              {snapResult.log.map((l,i)=>(
                <div key={i} style={{fontSize:11,color:l.startsWith("✓")?C.green:C.red,fontFamily:C.font,marginBottom:3}}>{l}</div>
              ))}
              {snapResult.errors.map((e,i)=>(
                <div key={i} style={{fontSize:11,color:C.red,fontFamily:C.font,marginBottom:3}}>{e}</div>
              ))}
            </div>

            {/* ── Cloudflare KV ── */}
            {snapResult.uploadDone ? (
              <div style={{background:C.bg2,borderRadius:12,padding:"10px 14px",marginBottom:14}}>
                <div style={{fontSize:10,fontWeight:600,color:C.gray,textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>💾 Enregistrement (local + cloud)</div>
                {(snapResult.uploadLog||[]).map((l,i)=>(
                  <div key={i} style={{fontSize:11,color:l.startsWith("✓")?C.green:C.red,fontFamily:C.font,marginBottom:3}}>{l}</div>
                ))}
                {(snapResult.uploadErrors||[]).map((e,i)=>(
                  <div key={i} style={{fontSize:11,color:C.red,fontFamily:C.font,marginBottom:3}}>{e}</div>
                ))}
              </div>
            ) : snapResult.pendingUpload ? (
              <div style={{background:C.bg2,borderRadius:12,padding:"10px 14px",marginBottom:14}}>
                <div style={{fontSize:10,fontWeight:600,color:C.gray,textTransform:"uppercase",letterSpacing:.5,marginBottom:4}}>💾 Enregistrement</div>
                <div style={{fontSize:11,color:C.gray}}>Enregistré en local — envoi cloud en cours…</div>
              </div>
            ) : null}

            {/* Boutons */}
            {snapResult.pendingUpload&&!snapResult.uploadDone&&(
              <button onClick={()=>setSnapResult(null)} style={{
                width:"100%",padding:"10px 0",borderRadius:10,
                background:"transparent",border:`1px solid ${C.border}`,
                color:C.gray,fontSize:12,cursor:"pointer",
              }}>Fermer</button>
            )}
            {snapResult.uploadDone&&(
              <button onClick={()=>setSnapResult(null)} style={{
                width:"100%",padding:"12px 0",borderRadius:10,
                background:C.bg2,border:`1px solid ${C.green}`,
                color:C.green,fontSize:13,fontWeight:600,cursor:"pointer",
              }}>Fermer</button>
            )}
          </div>
        </div>
      )}
      {showSettings&&(
        <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onClick={()=>setShowSettings(false)}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:C.bg1,borderRadius:"20px 20px 0 0",padding:"20px 16px 36px",
            width:"100%",maxWidth:430,border:`1px solid ${C.border}`,maxHeight:"85vh",overflowY:"auto",
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:C.border,margin:"0 auto 16px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:600,color:C.text}}>⚙️ Réglages</div>
              <button onClick={()=>setShowSettings(false)} style={{background:"none",border:"none",color:C.gray,fontSize:22,cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <button onClick={()=>setEur(!eur)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.bg,cursor:"pointer"}}>
                <span style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:18}}>💱</span><span style={{fontSize:13,fontWeight:700,color:C.text}}>Devise d'affichage</span></span>
                <span style={{fontSize:13,fontWeight:600,color:eur?C.green:C.gold}}>{eur?"EUR €":"USD $"}</span>
              </button>
              <button onClick={()=>setHidden(!hidden)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.bg,cursor:"pointer"}}>
                <span style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:18}}>{hidden?"🙈":"👁"}</span><span style={{fontSize:13,fontWeight:700,color:C.text}}>Masquer les montants</span></span>
                <span style={{fontSize:13,fontWeight:600,color:hidden?C.btc:C.gray}}>{hidden?"Masqué":"Visible"}</span>
              </button>
              <button onClick={()=>{setShowSettings(false);setShowTheme(true);}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.bg,cursor:"pointer"}}>
                <span style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:18}}>🎨</span><span style={{fontSize:13,fontWeight:700,color:C.text}}>Thème</span></span>
                <span style={{fontSize:12,color:C.gray}}>{themeName} ›</span>
              </button>
              <button onClick={()=>{const v=cgiSound.toggle();setSoundOn(v);}} data-snd="none" style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.bg,cursor:"pointer"}}>
                <span style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:18}}>{soundOn?"🔊":"🔈"}</span><span style={{fontSize:13,fontWeight:700,color:C.text}}>Sons &amp; vibrations</span></span>
                <span style={{fontSize:12,fontWeight:600,color:soundOn?C.green:C.gray}}>{soundOn?"Activés":"Coupés"}</span>
              </button>
              <button onClick={()=>{setShowSettings(false);setTab(4);}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.bg,cursor:"pointer"}}>
                <span style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:18}}>🗄️</span><span style={{fontSize:13,fontWeight:700,color:C.text}}>Base de données (Data)</span></span>
                <span style={{fontSize:12,color:C.gray}}>›</span>
              </button>
              <button onClick={forceCronCheck} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.bg,cursor:"pointer"}}>
                <span style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:18}}>🔄</span><span style={{fontSize:13,fontWeight:700,color:C.text}}>Forcer la vérification</span></span>
                <span style={{fontSize:11,color:C.gray}}>alertes + technique ›</span>
              </button>
              <button onClick={()=>{setShowSettings(false);loadDevices();setShowDevices(true);}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.bg,cursor:"pointer"}}>
                <span style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:18}}>📱</span><span style={{fontSize:13,fontWeight:700,color:C.text}}>Appareils connectés</span></span>
                <span style={{fontSize:12,color:C.gray}}>›</span>
              </button>
              <button onClick={()=>{setShowSettings(false);setShowDiag2(true);}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.bg,cursor:"pointer"}}>
                <span style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:18}}>🔧</span><span style={{fontSize:13,fontWeight:700,color:C.text}}>Diagnostic &amp; maintenance</span></span>
                <span style={{fontSize:12,color:C.gray}}>›</span>
              </button>
              <button onClick={()=>{setShowSettings(false);setShowAbout(true);}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"12px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.bg,cursor:"pointer"}}>
                <span style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:18}}>ℹ️</span><span style={{fontSize:13,fontWeight:700,color:C.text}}>À propos</span></span>
                <span style={{fontSize:12,color:C.gray}}>{APP_VERSION} ›</span>
              </button>
            </div>
            {settingsMsg&&<div style={{fontSize:11,color:C.green,marginTop:12,textAlign:"center"}}>{settingsMsg}</div>}
            <div style={{fontSize:10,color:C.text3,textAlign:"center",marginTop:16,opacity:.7}}>{APP_VERSION} · source : {chosenSource||"—"}</div>
          </div>
        </div>
      )}
      {showAbout&&(
        <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onClick={()=>setShowAbout(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:C.bg1,borderRadius:"20px 20px 0 0",padding:"20px 20px 36px",width:"100%",maxWidth:430,maxHeight:"85vh",overflowY:"auto",border:`1px solid ${C.border}`}}>
            <div style={{width:36,height:4,borderRadius:2,background:C.border,margin:"0 auto 18px"}}/>
            <div style={{textAlign:"center",marginBottom:18}}>
              <img src={APP_LOGO} alt="JCGI" style={{width:96,height:80,objectFit:"contain",margin:"0 auto",filter:"drop-shadow(0 4px 14px rgba(0,0,0,.5))"}}/>
              <div style={{fontSize:22,fontWeight:700,marginTop:8,letterSpacing:2}}><span style={{color:C.gold}}>J.C.</span> <span style={{color:C.text2}}>GLOBAL INVESTMENTS</span></div>
              <div style={{fontSize:11,color:C.gray,marginTop:6,fontStyle:"italic"}}>Excellence, Vision &amp; Résilience</div>
              <div style={{display:"inline-block",marginTop:12,background:C.gold+"22",border:`1px solid ${C.gold}66`,borderRadius:20,padding:"4px 14px",fontSize:13,fontWeight:600,color:C.gold}}>Version {APP_VERSION}</div>
            </div>
            {/* #69 — feuille de route : tickets en attente par groupe (mise à jour à chaque version) */}
            <div style={{fontSize:10,fontWeight:600,color:C.text3,textTransform:"uppercase",letterSpacing:.5,marginBottom:10,textAlign:"center"}}>Feuille de route · tickets en attente</div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:22}}>
              {[
                ["Groupe D — Sécurité & PIN", [["#62","PIN serveur + code oublié (nécessite une addition côté worker)"],["#55","En attente"]]],
                ["Groupe E — Gros chantiers", [["#54","Import KuCoin"],["#60","Trade à double ticker"],["#67","Mise à jour auto des positions IBKR"],["#68","Annotations du graphe Portfolio"]]],
                ["Divers", [["#61","Refactor des identifiants gdb*"]]],
              ].map(function(g){ var grp=g[0], items=g[1]; return(
                <div key={grp} style={{background:C.bg2,borderRadius:10,border:`1px solid ${C.border}`,padding:"10px 12px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.gold,marginBottom:6}}>{grp}</div>
                  {items.map(function(it){ return(
                    <div key={it[0]} style={{display:"flex",gap:8,alignItems:"baseline",marginBottom:3}}>
                      <span style={{fontSize:10,fontWeight:700,color:C.text3,minWidth:30}}>{it[0]}</span>
                      <span style={{fontSize:11.5,color:C.text2,lineHeight:1.35}}>{it[1]}</span>
                    </div>
                  ); })}
                </div>
              ); })}
            </div>
            <div style={{fontSize:10,fontWeight:600,color:C.text3,textTransform:"uppercase",letterSpacing:.5,marginBottom:10,textAlign:"center"}}>Historique des versions</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[
                ["v7.30","Cash matelas — réconciliation armée dans tous les chemins de démarrage. Le bandeau « ☁️ synchronisé » a confirmé que le téléphone publie bien au cloud ; le blocage était côté PC. La réconciliation du solde bancaire n'était activée que dans un seul des trois chemins de boot ; selon celui emprunté, le PC ignorait le solde du cloud. Elle est désormais armée dans tous les chemins : le solde modifié sur le téléphone est repris sur le PC au rechargement, quel que soit l'état de démarrage."],
                ["v7.29","Diagnostic visible du cash matelas. Un petit bandeau confirme désormais à l'écran quand un solde bancaire est publié au cloud (« ☁️ Solde banque synchronisé ») ou échoue (« ⚠️ Échec de synchro »). Cela permet de voir immédiatement, sur le téléphone, si une modification déclenche bien l'envoi — et de localiser un éventuel blocage résiduel."],
                ["v7.28","Deux bugs racines corrigés. (1) PIN : la fonction d'écriture (saveBase) refusait la clé cgi_pin car absente de sa liste blanche — le hash du code n'était donc jamais publié au cloud, et un appareil neuf (ex. PWA iPhone réinstallé) n'avait aucun code à réclamer. cgi_pin est ajouté à la liste blanche : le code se synchronise enfin entre appareils. (2) Cash matelas : plutôt que dépendre du chemin d'édition (dépôt, saisie, snapshot…), un observateur publie désormais tout changement de solde bancaire au cloud dès qu'il survient dans l'état, horodaté — la modification faite sur le téléphone est reprise sur le PC au rechargement."],
                ["v7.27","Service worker — fin des versions bloquées en cache (#88). La cause racine de la non-synchronisation du cash matelas était que le PWA iPhone servait une version antérieure à v7.22 depuis son cache (l'écriture du cloud confirmait un solde daté du 25 juin, jamais mis à jour). Un service worker en network-first est ajouté : l'app charge désormais toujours la dernière version en ligne (cache uniquement en secours hors-ligne) et se recharge automatiquement à chaque nouvelle version. Important : pour l'installer la première fois, supprimer le PWA de l'écran d'accueil de l'iPhone puis le réinstaller ; ensuite les mises à jour seront automatiques. Une fois l'iPhone en v7.27, la modification du cash matelas sera publiée au cloud et reprise sur le PC."],
                ["v7.26","Cash matelas — adoption par contenu. La console a révélé que le PC refusait le solde du cloud parce que son cgi_bank local portait le MÊME horodatage (les écritures de boot le re-tamponnent), alors même que le contenu pouvait différer. Désormais l'adoption compare aussi le breakdown : si le solde du cloud diffère du local, il est adopté et réconcilié même à horodatage égal. Rappel : cela suppose que l'appareil source a bien publié sa modification au cloud."],
                ["v7.25","Correctif de démarrage : l'effet de réconciliation du cash matelas (v7.24) référençait l'état live avant sa déclaration, ce qui empêchait l'app de charger (« Cannot access live before initialization »). L'effet est déplacé après la déclaration de live ; l'app recharge normalement et la réconciliation du cash matelas multi-appareils fonctionne."],
                ["v7.24","Cash matelas — réconciliation à l'épreuve des balles. Le système de démarrage a plusieurs branches (cloud, local, injection de positions) et selon celle empruntée, le solde bancaire du cloud pouvait être ignoré à l'affichage. Plutôt que de patcher chaque branche, un effet dédié applique désormais le solde bancaire du cloud (le plus récent) directement à l'état affiché APRÈS sa construction, quelle que soit la branche de boot — les lignes Cash Matelas, le total banque et le patrimoine sont recalculés. Idempotent (pas de boucle). Une modification faite sur le téléphone se reflète sur le PC au rechargement."],
                ["v7.23","Cash matelas — le vrai maillon manquant. L'affichage du Cash Matelas dans Portfolio provient des lignes « Cash Matelas » de cgi_portfolio, et non de cgi_bank ; or cgi_portfolio n'est adopté du cloud que sur le tampon de synchro IBKR, jamais sur une simple modification de solde bancaire. Résultat : le PC adoptait bien cgi_bank mais continuait d'afficher les anciens montants issus du portfolio. Désormais, quand cgi_bank est adopté du cloud, les lignes Cash Matelas de cgi_portfolio (et cgi_stocks) sont réalignées sur le breakdown adopté, puis l'affichage est reconstruit — la modification faite sur le téléphone apparaît enfin sur le PC."],
                ["v7.22","Cash matelas multi-appareils fiabilisé. Un dépôt/retrait Cash Matelas pousse désormais le nouveau solde au cloud immédiatement et horodaté (sans attendre un snapshot). La reconstruction des positions ne peut plus effacer cet horodatage (le savedAt existant est préservé lors de ses écritures de cgi_bank). Combiné à l'adoption au démarrage (savedAt le plus récent) et au garde-fou du worker, une modification faite sur un appareil se propage aux autres. Journaux [bank] conservés pour tracer une éventuelle anomalie."],
                ["v7.21","#62 — code PIN synchronisé entre appareils. Jusqu'ici le code était stocké uniquement en local : le PWA iPhone, dont le stockage est isolé, n'avait aucun code enregistré et ne demandait donc jamais rien. Désormais le hash du code (jamais le code en clair) est publié dans le cloud à sa définition et adopté au démarrage sur tous les appareils ; le worker (v69-cgi) conserve la version la plus récente. Un code défini sur un appareil devient ainsi obligatoire partout. Diagnostic ajouté sur la synchronisation du cash matelas ([bank] …) pour tracer un éventuel appareil resté en ancienne version. Important : le PWA iPhone n'ayant pas de service worker, il peut servir une version en cache — le supprimer de l'écran d'accueil puis le réinstaller une fois garantit le chargement de cette mise à jour."],
                ["v7.20","Correctifs #84–#87. #84 : verrouillage PC porté à 30 min. #85 : sur l'app installée (iPhone/Android), le code est redemandé de façon fiable — l'app se re-verrouille dès sa mise en arrière-plan, sans dépendre d'un événement de reprise (non fiable sur iOS) ; le code s'affiche donc à chaque réouverture. #86 : le cash matelas modifié et snapshoté sur un appareil est maintenant horodaté (savedAt) et propagé aux autres — le worker (v68-cgi) refuse d'écraser un snapshot plus récent. #87 : le P&L de la page Home en « tout l'historique » affiche désormais la même mesure que l'onglet Portfolio (plus-value latente des positions rapportée au capital investi), pour la cohérence entre les deux écrans. Note : l'historique clairsemé des courbes de détail CGIC/CGIS reste une limite des données Excel source (janv.→mai 2026)."],
                ["v7.19","Correctifs #77b + #80–#83. #77b : le pic aberrant en fin de courbe CGIC/CGIS (graphe base 100 ET sparklines des cartes) est neutralisé par un anti-pic à report testé (un point isolé qui bondit de plus de 35 % puis revient est remplacé par la dernière valeur saine ; les tendances progressives sont préservées). #80 : le code PIN reste demandé à chaque vrai chargement et au retour d'arrière-plan, mais la session passe de 90 s à 10 min (fini les redemandes trop fréquentes sur PC) ; filet de sécurité périodique pour le PWA iOS. #81 : retour haptique (vibreur) à chaque appui du clavier du code. #82 : le cash matelas modifié et snapshoté sur un appareil est désormais adopté sur les autres (comparaison par horodatage de snapshot). #83 : cliquer une banque (LCL, BCI, DeBlock) dans Cash Matelas ouvre une fenêtre dédiée avec la courbe d'évolution de son solde (enregistré à chaque snapshot) et sans actualités — une banque n'étant pas un instrument coté."],
                ["v7.18","Lot d'améliorations #73–#79. #73 : la fenêtre détail d'un titre lit la quantité depuis la position live (fin du décalage type AXON 12,5 vs 10,5). #74 : « Crypto » renommé « Cryptos » dans Portfolio. #75 : le rendement et le P&L du bloc « patrimoine total » (Home) sont money-weighted (nets des apports), corrigeant le +1116 % aberrant en « tout l'historique ». #76 : le code PIN est redemandé à chaque ouverture, y compris au retour de veille du PWA iOS (re-verrouillage sur reprise, session ramenée à 90 s). #77 : anti-pic local sur les courbes CGIC/CGIS du graphe base 100 (le pic vertical isolé est neutralisé ; les trous 04–05 restent une limite des données Excel ssource). #78 : le montant des fonds CGIC/CGIS (NAV, haut-droite de chaque bloc) adopte la police Cormorant du patrimoine total. #79 : mode démo à trois options — montants masqués, portefeuille fictif ≈ 30 K$, portefeuille fictif ≈ 1,6 M$ (montants mis à l'échelle de façon cohérente sur toute l'app)."],
                ["v7.17","Trades unifiés + flux cash par devise (#60). History revient à une liste unique dans Spot : saisies manuelles et exécutions IBKR fusionnées, l'exécution IBKR (fill réel, précis) étant prioritaire sur une saisie manuelle du même titre/sens/jour (les ajustements automatiques deviennent alors redondants et s'effacent de l'affichage). Le clic sur une ligne conserve le drill-down habituel (graphe + position + historique). Dans Portfolio, cliquer la ligne Cash Dip (USD) — ou une ligne EUR — ouvre le journal des flux de cette devise : chaque vente d'un titre y apparaît en entrée de cash, chaque achat en sortie (ex. vendre CRM puis acheter NVDA via l'USD génère CRM→USD en entrée puis USD→NVDA en sortie). Tout est alimenté par la même source unifiée, à jour automatiquement à chaque synchronisation IBKR."],
                ["v7.16","History & Portfolio. History gagne un troisième onglet « IBKR » : la liste chronologique des exécutions archivées (achats/ventes, quantité, prix, badge doré), mise à jour automatiquement à chaque synchronisation IBKR — informationnelle, hors calculs de positions et de P&L (anti-doublon). Portfolio : les sections (Crypto, Stocks, Indices ETF, Or, Cash…) sont désormais triées par ordre de grandeur décroissant — donut, légende et cartes suivent le même ordre — et « Stock Picking » est renommé « Stocks » (cibles d'allocation persistées préservées)."],
                ["v7.15","Cash Dip : le vrai coupable était la liste blanche du stockage v9. lsv9Set refuse silencieusement (return false) toute clé absente de LSV9_KEYS — la clé de vérité IBKR n'était donc JAMAIS persistée malgré sa réception du cloud, et le rebuild la déclarait « absente ». La vérité IBKR est désormais stockée dans une clé localStorage dédiée (cgi_ibkr_truth_direct), le même pattern que la watchlist, immunisé contre les mécaniques du conteneur v9. Ajout d'un log au chargement de l'archive des exécutions IBKR ([ibkr] archive exécutions chargée : N) — rappel : elles s'affichent dans History via la recherche par ticker."],
                ["v7.14","Cash Dip instrumenté et auto-réparant. La console indique désormais, à chaque reconstruction, la source et la valeur du Cash Dip ([dip] rebuild — source … · valeur …) ainsi que la réception de la clé de vérité IBKR au démarrage ([dip] clé de vérité reçue / ABSENTE). Quand la clé arrive du cloud après le premier rebuild du boot, une re-dérivation des positions est déclenchée automatiquement : plus de dépendance à l'ordre d'arrivée."],
                ["v7.13","Cash Dip : lecture directe de la clé de vérité IBKR. Le tampon ibkrSync du portefeuille pouvait être hérité par les écritures de l'app (le rebuild recopiait le tampon avec une valeur de build), rendant le stockage v9 faussement « vérité IBKR » — le Cash Dip restait à 166 $. Le worker (v67-cgi) expose désormais cgi_ibkr_truth (quantités + cash USD du Cash Report, horodatés, écrits uniquement par lui) dans /read ; l'app la conserve au boot et le rebuild y lit le Cash Dip en priorité (validité 48 h), avec les anciennes sources en repli."],
                ["v7.12","History affiche les exécutions IBKR + Cash Dip fiabilisé. Les 234 exécutions brutes archivées (cgi_ibkr_trades, exposées par le worker v66-cgi dans /read) apparaissent désormais dans History lors d'une recherche par ticker : badge IBKR doré, dédoublonnées contre les saisies manuelles, comptées à part (« +N IBKR ») et exclues des calculs Position/PRU comme du rebuild des positions. Le Cash Dip lit sa valeur depuis le portefeuille adopté du cloud (estampillé ibkrSync) plutôt que depuis l'état en mémoire qui pouvait encore porter la valeur du build. Enfin, un rafraîchissement des prix est déclenché automatiquement après chaque rebuild provoqué par un changement de transactions : les positions reconstruites sont immédiatement valorisées aux cours Yahoo du jour au lieu des prix de la base."],
                ["v7.11","Chaînon manquant trouvé et corrigé : l'état des transactions n'était jamais mis à jour. L'état React txns est chargé au boot depuis le stockage legacy (load SK.txns) ; la fusion cloud ne l'alignait sur la liste fusionnée QUE si sa longueur différait du local v9 ou du cloud — or local v9 et cloud étaient tous deux corrects et identiques (198 txns avec les ajustements IBKR), donc la condition concluait « rien à faire » et l'état restait sur la version legacy sans les ajustements, à chaque boot. Le rebuild (v7.10, piloté par signature) ne voyait donc jamais de changement. Désormais : (1) l'état initial privilégie le stockage v9, legacy en repli ; (2) l'état est TOUJOURS aligné sur la fusion, avec log explicite. La chaîne complète devient : fusion → signature modifiée → rebuild → positions IBKR exactes."],
                ["v7.10","LE correctif : rebuild des positions piloté par signature. Le rebuild (« vérité unique ») était protégé par un drapeau one-shot : au démarrage il s'exécutait AVANT l'arrivée des transactions du cloud, se marquait « appliqué » avec les txns locales périmées, puis refusait de se rejouer quand la fusion apportait les ajustements IBKR quelques instants plus tard — l'app affichait donc d'anciennes quantités (AXON 15,5, NOW absent) alors que ses propres transactions étaient correctes. Le drapeau est remplacé par une signature des transactions (nombre + dernier id) : tout changement de txns redéclenche le rebuild. Côté worker (v65-cgi), la vérité IBKR (quantités + cash USD) est mémorisée à chaque synchro et superposée à toute écriture entrante de cgi_portfolio/cgi_stocks : un appareil périmé ne peut plus dégrader le cloud."],
                ["v7.09","Prix AXON débloqué — garde-fou anti-verrouillage. Le filtre « prix aberrant » (variation > 50 %) rejetait indéfiniment le vrai prix d'un titre dès que la référence stockée était périmée (AXON figé à 386,94 $ rejetant 597 $ à chaque rafraîchissement). Désormais, un prix « aberrant » qui se confirme à ±5 % sur deux lectures consécutives est accepté (la référence était fausse) ; un glitch ponctuel reste ignoré. Deux rafraîchissements suffisent pour débloquer un titre verrouillé."],
                ["v7.08","Baromètre : fin des NAV/P&L fantaisistes. L'onglet Stats écrasait les champs fonds du snapshot cgi_fund_stats avec un vieux schéma et un P&L time-weighted (_allRow), effaçant navUSD, valueUSD, sh, mEUR et ue publiés par l'onglet JCGI — d'où les P&L incohérents du baromètre (−17,4 %, +9,6 %, +11,6 %…) selon le dernier onglet visité. L'onglet Stats n'écrit plus que les totaux ; les champs fonds sont écrits exclusivement par l'onglet JCGI (money-weighted, conforme au design #61)."],
                ["v7.07","Positions IBKR : valorisation et Cash Dip corrigés. computeOpenPositions valorisait les trades uniquement via valueUSD, champ absent des ajustements IBKR — une position créée par ajustement (ex. NOW) était comptée à 1 $ l'unité, donc quasi invisible. Repli qty×price ajouté, et le worker (v63-cgi) écrit désormais valueUSD sur ses ajustements et répare ceux existants. Le Cash Dip n'est plus codé en dur (166,36 $) dans la reconstruction : il reprend la valeur du poste USD, elle-même synchronisée depuis le Cash Report IBKR. Les tickers IBKR sont auto-enregistrés dans cgi_yfmap pour que l'actualisation des prix les couvre (ex. NOW, AXON)."],
                ["v7.06","Baromètre en dollars + Cash Dip automatique. L'onglet JCGI publie aussi la NAV en USD (navUSD) ; le worker (v62-cgi) affiche désormais les NAV des fonds en dollars avec l'équivalent euro en petit dessous (taux de l'app), et les actifs sous gestion avec leur contre-valeur euro. La synchronisation IBKR lit en plus la section « Cash Report » de la Flex Query pour tenir le Cash Dip (poste USD) à jour automatiquement — ajouter cette section à la requête Flex. /baro_debug expose maintenant le snapshot complet (nav, navUSD, valueUSD, pnlPct, ue) pour le diagnostic."],
                ["v7.05","#67 corrigé — réconciliation au lieu d'injection. L'injection des exécutions brutes IBKR dans cgi_txns (v7.04) doublonnait les saisies manuelles et faussait la reconstruction des positions (« vérité unique » #61) : positions gonflées et titres clôturés ressuscités. Rollback automatique : l'app purge désormais toute transaction d'id « ibkr_… » à la fusion (les ajustements « ibkradj_… » restent). Le worker (v61-cgi) réconcilie par delta : net par ticker (ΣBUY−ΣSELL) comparé à la position IBKR réelle, un seul trade d'ajustement par écart, idempotent. Exécutions brutes archivées à part dans cgi_ibkr_trades. Mode &dry=1 sur /ibkr_sync pour prévisualiser sans écrire."],
                ["v7.04","#67 complet — synchronisation IBKR intégrale. Le worker (v60-cgi) lit le même rapport Flex pour : (1) les positions ouvertes → quantités de cgi_portfolio, cgi_stocks et cgi_crypto (tampon ibkrSync) ; (2) les trades → ajout des exécutions manquantes dans cgi_txns (ids ibkr_<tradeID>, dédoublonnage aussi par date+ticker+sens+quantité pour ignorer les saisies manuelles existantes). L'app adopte au démarrage les positions du cloud si leur tampon ibkrSync est plus récent que le local, et fusionne les nouveaux trades comme avant. La liste des trades et les positions restent donc à jour sans import manuel."],
                ["v7.03","Baromètre ≡ app. L'onglet JCGI publie désormais aussi la valeur USD de chaque fonds au moment du push et le taux €/$ retenu ; le worker (v59-cgi) fait dériver le NAV et le P&L publiés par le simple ratio valeur live / valeur au push — mathématiquement exact pour le money-weighted et insensible aux conventions de change. L'onglet resynchronise aussi cgi_portfolio vers le cloud à chaque ouverture (fin des positions fantômes côté baromètre). Nouveau (#67) : synchronisation automatique des positions depuis IBKR via Flex Web Service (variables Cloudflare IBKR_FLEX_TOKEN et IBKR_FLEX_QUERY_ID, route /ibkr_sync, rafraîchissement avant chaque envoi cron)."],
                ["v7.02","Baromètres Telegram autonomes. L'onglet JCGI publie désormais aussi les parts (sh) et les capitaux investis en euros (mEUR) de chaque fonds dans le snapshot cgi_fund_stats. Le worker (v56-cgi) recalcule les baromètres en direct à chaque envoi : prix Yahoo + positions cgi_portfolio, NAV = valeur/parts et P&L money-weighted = valeur/capitaux − 1, sans nécessiter d'ouvrir l'application. Le snapshot ne sert plus que de source pour ces valeurs lentes et de repli complet si les prix live échouent. Ouvrir l'onglet JCGI une fois après cette mise à jour pour initialiser sh et mEUR."],
                ["v7.01","Bloc CGIC/CGIS : « depuis création » et « P&L · ALL » affichent désormais le MÊME chiffre — le rendement money-weighted (gain réel rapporté aux capitaux investis). Auparavant « depuis création » et « P&L · ALL » pouvaient diverger (ex. CGIC +21,5 % vs +25,9 %) car l'un mesurait le gain sur capitaux investis et l'autre le rendement de l'indice base-100 ; ils sont maintenant alignés sur la même mesure. Les P&L par période plus courte (1W, 1M, MTD, YTD, 1Y, 2Y) restent en rendement temporel de la période."],
                ["v7.00","Onglet JCGI — cohérence par période. (1) Densité de juin corrigée : les courbes des blocs et le graphe « comparaison à base 100 » n'utilisaient qu'une source clairsemée ; ils prennent désormais la source la PLUS dense (snapshots de juin embarqués ou journal quotidien) puis prolongent avec le journal → juin redevient détaillé jour par jour. (2) P&L cohérents : « depuis création » affichait un rendement pondéré par les capitaux (money-weighted) alors que « P&L · ALL » affichait un rendement temporel (time-weighted) — les deux sont désormais alignés sur la même base temporelle (identique à la sparkline et au graphe de comparaison). (3) Onglet Home : le graphe patrimoine trace maintenant CGIC/CGIS depuis le même tableau de vérité que l'onglet JCGI (fini les deux onglets qui divergeaient). (4) Onglet Portfolio : titre « Total portefeuille » retiré, « Répartition » renommé « Allocation ». Note : la ligne CGIS reste droite sur jan→mai 2026 car le fichier Excel source n'a que ~2 points/mois sur cette période ; elle se densifie automatiquement dès juin via les snapshots."],
                ["v6.99","Courbes CGIC et CGIS du graphe « comparaison à base 100 » LISSÉES (splines Catmull-Rom → Bézier) : les angles sont arrondis, les benchmarks restent en trait fin. Sécurité (Groupe D) : #65 — le code PIN est redemandé à CHAQUE rechargement (le déverrouillage ne persiste plus 24 h) et s'affiche en fin de chargement. #66 — bouton « Mode démo » sur l'écran PIN : ouvre l'app avec tous les montants masqués et un badge « démo » (touche-le pour re-verrouiller), pour montrer l'app sans exposer les valeurs réelles. #62 (PIN serveur + code oublié) reste ouvert : il demande une petite addition côté worker."],
                ["v6.98","CGIS quotidien intégré (fichier CGIS.xlsx) : 117 points 2025→mai 2026 convertis en indice base-100 ancré sur le mensuel CGIS — la courbe CGIS est désormais quotidienne comme CGIC. ALIMENTATION CONTINUE : les courbes se prolongent automatiquement avec le journal quotidien (cgi_daily) — chaque jour ouvert densifie la courbe et met à jour le dernier point, sans intervention. Repli sur le KV de juin si le journal est vide. Note : janvier→mai 2026 reste peu dense (peu de points dans les fichiers d'origine) ; cette zone se remplira au fil des snapshots."],
                ["v6.97","Tableau de vérité QUOTIDIEN intégré. CGIC : 512 points quotidiens (issus du fichier d'origine) convertis en indice base-100 ET ancrés sur le tableau mensuel — tie-out exact aux fins de mois, donc parfaitement cohérent avec les P&L. Les courbes CGIC (carte + « base 100 ») sont désormais quotidiennes au lieu de droites entre deux mois. Juin : la forme quotidienne du KV nettoyé est ré-ancrée entre fin mai et la valeur du jour (endpoints exacts → pas de pic aberrant). CGIS reste mensuel (pas d'historique quotidien fiable) avec détail KV en juin. Points KV incohérents (stub 31/05, 01→07/06) purgés à la lecture."],
                ["v6.96","Incohérence carte JCGI résolue : la mini-courbe de chaque fonds et son P&L dérivent maintenant EXACTEMENT de la même série, bâtie uniquement sur le tableau de vérité mensuel (+ valeur du jour). La sparkline lisait auparavant la série quotidienne du cron (_GDBS), une source distincte qui divergeait du tableau — d'où la courbe verte qui montait pendant que le P&L affichait du rouge. Échantillonnage caré sur la date de création pour un rebase base-100 exact (ALL/2Y). Le P&L de la carte colle désormais à la méthode officielle des Statistiques."],
                ["v6.95","Cohérence des P&L de l'onglet JCGI : les fonds n'utilisaient plus la méthode officielle (composition mensuelle, live inclus) — c'est rétabli, donc 1M/YTD/1Y/2Y/ALL concordent avec l'onglet Statistiques. Graphe « Comparaison à base 100 » corrigé : plus de longs plateaux horizontaux — les courbes CGIC/CGIS ne s'affichent plus avant la création du fonds (au lieu d'une fausse ligne à 100), ignorent les mois sans données et rejoignent la valeur du jour. Groupe J (#72) : ajout de la bourse de Chicago (CME · CBOT) et fenêtre d'infos par place (séance, pause, prochaine ouverture/clôture avec compte à rebours, jours de cotation, fuseau)."],
                ["v6.94","Page « Base de données » : « Actualiser les prix » et « Connexion Cloudflare KV » y sont déplacés depuis Réglages. Graphes des fonds JCGI : sur les fenêtres courtes (1W/1M/MTD) la courbe ne sera plus plate — elle s'appuie désormais sur l'historique QUOTIDIEN enregistré (CGIC/CGIS) plutôt que sur les seuls points mensuels, avec repli mensuel pour les longues périodes. « À propos » (#69) : nouvelle feuille de route listant les tickets en attente par groupe, tenue à jour à chaque version."],
                ["v6.93","Onglet JCGI repensé (#70) : le sélecteur de période passe tout en haut et pilote toute la page. Chaque fonds (CGIC / CGIS) affiche désormais un mini-graphe + un P&L unique calé sur cette période, et le graphe « Comparaison à base 100 » suit le même réglage (son ancien sélecteur sous le titre est retiré). Retouches : l'engrenage des réglages adopte le même cadre carré-arrondi que la cloche ; le bouton Achat / Vente s'intercale entre Live et Target, en plus compact."],
                ["v6.92","Clic de navigation façon touche de clavier (fini les sons mélodiques type « game boy »), accompagné d'une légère vibration sur mobile. Réglage renommé « Sons & vibrations ». Groupe C : le bouton Achat / Vente quitte la bannière du haut pour l'onglet Portfolio (juste sous le sélecteur Live / Target) ; les positions de chaque pôle sont désormais classées par poids décroissant (la plus grosse en premier)."],
                ["v6.91","Premiers retours sonores de navigation (#71). Baromètre Telegram (#2) retravaillé côté serveur : « Allocation du fonds » mise en avant, actifs sous gestion en pied discret, titre allégé, et P&L crypto « depuis l'origine » désormais issu uniquement de la source de vérité (fini l'approximation €/$)."],
                ["v6.90","Réglages (#9) : les outils techniques (cohérence des chiffres, stockage, cloud, push/pull, verrouillage par code) sont regroupés dans une fiche « Diagnostic & maintenance » au lieu d'encombrer la page À propos. Nouvelle fiche « Appareils connectés » : registre des appareils qui se synchronisent (nom personnalisable, dernière activité, retrait à distance). Le registre multi-appareils s'active une fois le worker à jour (clé cgi_devices)."],
                ["v6.89","Baromètre Telegram (#2) : le total et le P&L des fonds étaient parfois faux car publiés seulement au refresh / depuis l'onglet JCGI. L'accueil publie désormais en continu un snapshot complet et certifié (mêmes valeurs que le tableau « Source de vérité », éditable) : total, crypto, actions, cash, cours/action et P&L all-time des deux fonds."],
                ["v6.88","Sécurité (#1) : le code PIN est de nouveau demandé toutes les 24 h (le déverrouillage expire), et après un vidage de cache. Avant, une fois déverrouillé l'accès restait ouvert toute la session."],
                ["v6.87","Les graphes et le tableau de l'accueil exploitent désormais TES snapshots manuels (cgi_snapshots) en plus du journal quotidien : chaque snapshot daté (crypto €, actions €) devient un point de la série. Les trous des horizons courts se remplissent automatiquement avec l'historique que tu as déjà enregistré."],
                ["v6.86","Accueil : le sélecteur d'horizons masque désormais les doublons — un horizon court (3j, 7j…) n'apparaît que lorsqu'il contient réellement plus de points que le précédent. Tant que le journal quotidien est clairsemé, on ne voit plus 1j/3j/7j identiques ; ils reviennent au fil des jours."],
                ["v6.85","Le tableau « Source de vérité » de la page Data est désormais ÉDITABLE : touche n'importe quelle valeur (début, fin, Δ%, apports, perf) pour la corriger à la main. La correction est stockée, synchronisée entre appareils, et les graphes de l'accueil s'alignent dessus. Valeur soulignée en or = modifiée ; ↺ réinitialise la ligne."],
                ["v6.84","Page Data : nouveau tableau « Source de vérité — Accueil » (valeurs € par horizon : points, début, fin, Δ%, apports, perf hors apports) pour Patrimoine/Crypto/Actions. Les graphes de l'accueil lisent désormais EXACTEMENT ces mêmes valeurs (une seule fonction de calcul), garantissant la cohérence chiffre↔courbe."],
                ["v6.83","Accueil cohérent : le pourcentage de chaque horizon est désormais calculé sur les extrémités exactes de la courbe affichée (le chiffre suit toujours le sens du tracé), et seuls les horizons disposant de vraies données sont proposés — D/3D/1S réapparaissent automatiquement au fil des snapshots quotidiens."],
                ["v6.82","Barre de chargement repensée : progression non-linéaire — montée vive qui ralentit en approchant la fin (au lieu de foncer puis se figer), et finition franche et accélérée jusqu'à 100 %."],
                ["v6.81","Journal de snapshots quotidiens : à chaque ouverture, le patrimoine du jour (crypto + actions) est enregistré et synchronisé. Les graphes de l'accueil utilisent ce journal, ce qui redonne du sens aux horizons courts (D · 3D · 1S, réactivés) — ils se remplissent jour après jour."],
                ["v6.80","Accueil : les timeframes des graphes s'appliquent vraiment — retrait des options qui ne pouvaient pas différer (D/3D/1S : données mensuelles, pas de granularité jour ; 2A = ALL car le fonds Actions débute en 2025). Restent 1M · 3M · YTD · 1A · ALL, toutes distinctes et prolongées jusqu'à la valeur live."],
                ["v6.79","Engrenage du bouton réglages vraiment refait (8 dents régulières, cadre carré-arrondi comme cloche/transaction) ; le plan d'allocation cible est enfin sauvegardé (et synchronisé entre appareils) ; mini-graphes Crypto/Actions de l'accueil non figés sous 7j (prolongés jusqu'à la valeur live)."],
                ["v6.78","Onglet « Legend » renommé « History » ; Portfolio : « Détail »→« Live » (voyant vert quand le cloud est connecté et les trades IBKR à jour) et « Allocation »→« Target » ; bouton réglages parfaitement rond."],
                ["v6.77","Nettoyage du repo public : retrait de toutes les traces de branding hérité (commentaires, page À propos, signature de bas de page)."],
                ["v6.76","Verrouillage par code PIN : écran de déverrouillage à 4 chiffres, local à l'appareil."],
                ["v6.75","Modal de transaction épuré : libellés Achat / Vente · Dépôt · Investir, sans icônes."],
                ["v6.39","Transactions : LCL ajouté en contrepartie (Bourso retiré), position initiale réconciliée (plus d'effacement), Qté + PA bien visibles."],
                ["v6.37","Allocation : bloc PLAN CIBLE éditable (saisie libre + bouton Arrondir) ; mini-graphes des fonds corrigés (courbes propres)."],
                ["v6.36","Mini-graphes Home par fonds ; cibles d'allocation éditables persistées."],
                ["v6.34","JCGI base 100 : ETH retiré, historique remonté à 2022, indices via ETF fiables ; courbes CGIC/CGIS lissées."],
                ["v6.31","Worker : résumé patrimoine live + Telegram ; logos agrandis, hero plein largeur, timeframes D/3D."],
                ["v6.29","Nouveau blason J.C. GLOBAL INVESTMENTS partout ; sous-titres centrés."],
                ["v6.24","Worker : benchmarks S&P/Nasdaq/MSCI + notifications Telegram (cron)."],
                ["v6.19","Home : timeframe en menu déroulant + P&L des fonds qui suit la période ; Stats : toggle Mensuel/Annuel sous le graphe ; titres centrés ; Répartition en devise ; écran de chargement (version + barre constante)."],
                ["v6.15","P&L unifié partout (Home = JCGI = Stats) via composition des rendements mensuels — fin des valeurs aberrantes/identiques."],
                ["v6.11","Stats branché sur les données live (plus de Total périmé) ; modal fonds : capital net IN−OUT."],
                ["v6.09","Stats : barres avec dégradé + reflet, courbe « P&L cumulé » avec timeframe."],
                ["v6.05","JCGI base 100 : couleurs re-séparées, séries vides masquées, données assainies."],
                ["v6.03","Correctif P&L CGIC/CGIS (capital net investi) + données mensuelles Stats."],
                ["v6.0","Refonte LUXE : thème Onyx & Champagne, titres Cinzel, bloc position + historique de trades, recherches ticker, mode annuel, logos ETH/LCL."],
                ["v4.17","Panneau « Positions calculées » : reconstitution des positions depuis le journal de transactions."],
                ["v4.16","Timeframes intraday, sélection/suppression/recoloration des tracés, repli multi-symboles."],
                ["v4.15","Couche de dessin fiabilisée (capture dédiée) + rafraîchissement auto de la date locale."],
                ["v4.14","Corrections : dessin (coordonnées logiques), NICK fiabilisé, synchro watchlist multi-appareils, météo Telegram automatique, page À propos."],
                ["v4.13","Dessin Fibonacci & trendlines (persistés par ticker, partagés Suivi↔Portfolio) + onglet Flux (rotation des capitaux)."],
                ["v4.12","Indicateurs de tracé : moyennes mobiles, Ichimoku, sous-panneau RSI (plein écran)."],
                ["v4.11","Graphique Portfolio unifié (un seul chandelier) + mode plein écran."],
                ["v4.10","Onglet Congrès (retiré ensuite : source gratuite fermée)."],
                ["v4.9","Onglets Macro (secteurs/taux/VIX/dominance) + Top/Flop (hausses/baisses)."],
                ["v4.8","Onglet Funding : taux de financement BTC/ETH (Bybit + OKX)."],
                ["v4.7","Bouton Outils unique + dashboard d'indicateurs BTC (cycle, on-chain, sentiment) à cartes extensibles."],
                ["v4.5","Logos réels, autocomplétion de tickers, graphique TradingView + zones, édition des transactions, correctif NICK."],
                ["v4.4","Refonte de la barre du haut : cloche de notifications + réglages, accès direct aux données."],
                ["v4.0","Conditions de suivi structurées, moteur de validation technique, notifications Telegram, worker cron autonome."],
                ["v3.x","Onglet Suivi de marché (watchlist) avec thèse, scoring et alertes de prix ; analyse IA des news."],
                ["v2.x","Suivi multi-actifs (crypto / actions / banque) par catégories, conversions EUR/USD, instantanés de patrimoine et historique."],
                ["v1.0","Première version J.C. GLOBAL INVESTMENTS : positions, patrimoine total, fonds CGIC/CGIS calibrés ~100, synchro Cloudflare KV."],
              ].map(([v,desc])=>(
                <div key={v} style={{display:"flex",gap:10}}>
                  <span style={{fontSize:12,fontWeight:600,color:C.btc,minWidth:42,flexShrink:0}}>{v}</span>
                  <span style={{fontSize:12,color:C.text2,lineHeight:1.5}}>{desc}</span>
                </div>
              ))}
            </div>
            <div style={{fontSize:10,color:C.text3,textAlign:"center",marginTop:18,opacity:.7}}>Tableau de bord patrimonial personnel · React + Cloudflare Workers</div>
          </div>
        </div>
      )}
      {showDiag2&&(
        <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onClick={()=>setShowDiag2(false)}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:C.bg1,borderRadius:"20px 20px 0 0",padding:"20px 16px 36px",
            width:"100%",maxWidth:430,border:`1px solid ${C.border}`,maxHeight:"85vh",overflowY:"auto",
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:C.border,margin:"0 auto 16px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:14,fontWeight:600,color:C.text}}>🔧 Diagnostic &amp; maintenance</div>
              <button onClick={()=>setShowDiag2(false)} style={{background:"none",border:"none",color:C.gray,fontSize:22,cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            <div style={{fontSize:11,color:C.text3,marginBottom:10,lineHeight:1.5}}>Outils techniques : vérification de cohérence, état du stockage, synchronisation cloud et verrouillage par code.</div>
            <button onClick={()=>{ try{ const r=cgiAudit(); const ref=r.ref||{}; let msg="App "+r.version+"  ·  snapshot KV: $"+(r.kvTotalUSD||"—")+" (il y a "+(r.kvAgeSec!=null?r.kvAgeSec+"s":"—")+")\n"+(r.txnCount!=null?r.txnCount+" transactions\n":"")+"────────────\nTRONC DE VÉRITÉ (réf = Home)\n\nTotal: $"+(ref.totalUSD||"—")+"\nCrypto: $"+(ref.cryptoUSD||"—")+"\nActions: $"+(ref.stocksUSD||"—")+"\nCash: $"+(ref.cashUSD!=null?ref.cashUSD:"—")+"\nTaux EUR/USD: "+(ref.usdEur!=null?ref.usdEur.toFixed(4):"—")+"\n\n"; Object.keys(r.sources).forEach(s=>{ const v=r.sources[s]; msg+="• "+s+"\n"; if(v.totalUSD!=null)msg+="   total $"+v.totalUSD+"\n"; if(v.cgicPnl!=null)msg+="   CGIC "+v.cgicPnl.toFixed(1)+"% · CGIS "+(v.cgisPnl!=null?v.cgisPnl.toFixed(1):"—")+"%\n"; }); msg+="\n"+(r.ecarts.length?("⚠️ ÉCARTS:\n"+r.ecarts.join("\n")):"✅ Tout concorde."); alert(msg); }catch(e){ alert("Audit indisponible: "+e.message); } }}
              style={{width:"100%",marginTop:16,background:C.bg3,border:`1px solid ${C.gold}66`,color:C.gold,borderRadius:9,fontSize:12.5,fontWeight:600,padding:"9px 0",cursor:"pointer",fontFamily:C.font}}>
              🔍 Vérifier la cohérence des chiffres
            </button>
            <button onClick={()=>{ try{ const h=cgiStorageHealth(); let m="STOCKAGE LOCAL (cet appareil)\n\nTaille conteneur: "+h.totalKB+" Ko\nPersistance: "+(h.persists?"✅ OK":"❌ ÉCHEC"+(h.writeErr?" ("+h.writeErr+")":""))+"\nSeed transactions: "+(h.txnsSeedver||"—")+"\n\nPlus grosses clés:\n"+h.topKeys.map(t=>"• "+t.k+" : "+t.kb+" Ko").join("\n"); if(!h.persists) m+="\n\n⚠️ L'écriture locale échoue (quota Safari). C'est pourquoi les imports sautent au rechargement."; alert(m); }catch(e){ alert("Diag stockage indisponible: "+e.message); } }}
              style={{width:"100%",marginTop:9,background:"transparent",border:`1px solid ${C.border}`,color:C.text3,borderRadius:9,fontSize:12,fontWeight:600,padding:"9px 0",cursor:"pointer",fontFamily:C.font}}>
              💾 Diagnostic du stockage
            </button>
            <button onClick={()=>{ cgiCloudInspect().then(c=>{ if(c._error){ alert("⚠️ Cloud illisible: "+c.msg); return; } let m="CONTENU RÉEL DU CLOUD (KV)\n\n"; Object.keys(c).forEach(k=>{ m+=k+" : "+c[k]+"\n"; }); m+="\nSi cgi_txns est absent ou à 0, l'écriture vers le cloud échoue."; alert(m); }).catch(e=>alert("Erreur: "+e.message)); }}
              style={{width:"100%",marginTop:9,background:"transparent",border:`1px solid ${C.border}`,color:C.text3,borderRadius:9,fontSize:12,fontWeight:600,padding:"9px 0",cursor:"pointer",fontFamily:C.font}}>
              🔎 Inspecter le cloud (KV)
            </button>
            <button onClick={()=>{ if(!window.confirm("Pousser CET appareil vers le cloud ?\n\nLes données de cet appareil deviendront la référence partagée. À lancer sur l'appareil À JOUR (celui où tu saisis).")) return; cgiForcePushToCloud().then(n=>{ alert("✅ "+n+" base(s) publiée(s) vers le cloud. Lance ensuite « Forcer la synchro depuis le cloud » sur l'autre appareil."); }).catch(e=>alert("⚠️ Échec: "+e.message)); }}
              style={{width:"100%",marginTop:9,background:"transparent",border:`1px solid ${C.border}`,color:C.text3,borderRadius:9,fontSize:12,fontWeight:600,padding:"9px 0",cursor:"pointer",fontFamily:C.font}}>
              ☁️⬆️ Pousser cet appareil vers le cloud
            </button>
            <button onClick={()=>{ if(!window.confirm("Forcer la synchro depuis le cloud ?\n\nLes données de CET appareil seront remplacées par celles du cloud (la source partagée). À utiliser sur l'appareil en retard.")) return; cgiForcePullFromCloud().then(n=>{ alert("✅ "+n+" base(s) resynchronisée(s) depuis le cloud. L'app va recharger."); setTimeout(()=>location.reload(), 600); }).catch(e=>alert("⚠️ Échec: "+e.message)); }}
              style={{width:"100%",marginTop:9,background:"transparent",border:`1px solid ${C.border}`,color:C.text3,borderRadius:9,fontSize:12,fontWeight:600,padding:"9px 0",cursor:"pointer",fontFamily:C.font}}>
              ☁️⬇️ Forcer la synchro depuis le cloud
            </button>
            <button onClick={()=>{
              if(cgiGetPin()){
                const cur=window.prompt("Verrouillage actif.\n\nSaisis ton code actuel pour le modifier ou le désactiver :"); if(cur===null) return;
                if(!cgiCheckPin(cur)){ alert("Code incorrect."); return; }
                const np=window.prompt("Nouveau code à 4 chiffres\n(laisse vide pour DÉSACTIVER le verrouillage) :"); if(np===null) return;
                if(np===""){ cgiSetPinRaw(""); cgiLockClear(); alert("🔓 Verrouillage désactivé."); return; }
                if(!/^\d{4}$/.test(np)){ alert("Il faut exactement 4 chiffres."); return; }
                cgiSetPinRaw(np); cgiUnlockMark(); alert("✅ Code mis à jour.");
              } else {
                const np=window.prompt("Choisis un code à 4 chiffres :"); if(np===null) return;
                if(!/^\d{4}$/.test(np)){ alert("Il faut exactement 4 chiffres."); return; }
                const cf=window.prompt("Confirme le code :"); if(cf===null) return;
                if(cf!==np){ alert("Les deux codes ne correspondent pas."); return; }
                cgiSetPinRaw(np); alert("🔒 Verrouillage activé.\nIl sera demandé au prochain lancement de l'app.");
              }
            }}
              style={{width:"100%",marginTop:9,background:"transparent",border:`1px solid ${C.gold}66`,color:C.gold,borderRadius:9,fontSize:12,fontWeight:600,padding:"9px 0",cursor:"pointer",fontFamily:C.font}}>
              🔒 Verrouillage par code {cgiGetPin()?"· actif":"· inactif"}
            </button>
            <div style={{fontSize:10,color:C.text3,textAlign:"center",marginTop:18,opacity:.7}}>{APP_VERSION} · source : {chosenSource||"—"}</div>
          </div>
        </div>
      )}
      {showDevices&&(
        <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onClick={()=>setShowDevices(false)}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:C.bg1,borderRadius:"20px 20px 0 0",padding:"20px 16px 36px",
            width:"100%",maxWidth:430,border:`1px solid ${C.border}`,maxHeight:"85vh",overflowY:"auto",
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:C.border,margin:"0 auto 16px"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:14,fontWeight:600,color:C.text}}>📱 Appareils connectés</div>
              <button onClick={()=>setShowDevices(false)} style={{background:"none",border:"none",color:C.gray,fontSize:22,cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            <div style={{fontSize:11,color:C.text3,marginBottom:14,lineHeight:1.5}}>Appareils qui se sont synchronisés avec ton portefeuille. La liste multi-appareils nécessite le worker à jour (clé <span style={{fontFamily:"monospace",color:C.text2}}>cgi_devices</span>) ; sinon seul cet appareil apparaît.</div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
              <input value={devLabel} onChange={e=>setDevLabel(e.target.value)} maxLength={40} placeholder="Nom de cet appareil"
                style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:"9px 12px",color:C.text,fontSize:13,fontFamily:C.font}}/>
              <button onClick={()=>{ cgiSetDeviceLabel(devLabel); cgiRegisterDevice().then(()=>loadDevices()).catch(()=>{}); }}
                style={{background:C.btc,border:"none",color:"#000",borderRadius:9,fontSize:12,fontWeight:700,padding:"9px 14px",cursor:"pointer",fontFamily:C.font,flexShrink:0}}>
                Renommer
              </button>
            </div>
            {devLoading
              ? <div style={{fontSize:12,color:C.gray,textAlign:"center",padding:"18px 0"}}>Chargement…</div>
              : (devList.length===0
                ? <div style={{fontSize:12,color:C.gray,textAlign:"center",padding:"18px 0"}}>Aucun appareil enregistré.</div>
                : <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {devList.map(function(d){
                      var isMe = d.id===myDeviceId;
                      var ms = Date.now()-(d.lastSeen||0);
                      var rel;
                      if(ms<60000) rel="à l'instant";
                      else if(ms<3600000) rel="il y a "+Math.floor(ms/60000)+" min";
                      else if(ms<86400000) rel="il y a "+Math.floor(ms/3600000)+" h";
                      else rel="il y a "+Math.floor(ms/86400000)+" j";
                      var icon = /iphone|ipad/i.test(d.platform||"")?"📱":(/mac/i.test(d.platform||"")?"💻":(/windows|linux/i.test(d.platform||"")?"🖥️":(/android/i.test(d.platform||"")?"📱":"🖥️")));
                      return React.createElement("div",{key:d.id,style:{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,border:"1px solid "+(isMe?C.btc:C.border),background:isMe?C.btc+"11":C.bg}},
                        React.createElement("span",{style:{fontSize:20,flexShrink:0}},icon),
                        React.createElement("div",{style:{flex:1,minWidth:0}},
                          React.createElement("div",{style:{fontSize:13,fontWeight:700,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},(d.label||d.platform||"Appareil"),isMe?React.createElement("span",{style:{marginLeft:8,fontSize:10,fontWeight:600,color:C.btc,background:C.btc+"22",borderRadius:6,padding:"1px 6px"}},"Cet appareil"):null),
                          React.createElement("div",{style:{fontSize:11,color:C.text3,marginTop:2}},(d.platform||"—")+" · vu "+rel)
                        ),
                        isMe?null:React.createElement("button",{onClick:function(){ if(!window.confirm("Retirer « "+(d.label||d.platform||"cet appareil")+" » du registre ?")) return; setDevLoading(true); cgiDeviceRemove(d.id).then(function(){ loadDevices(); }).catch(function(){ setDevLoading(false); }); },style:{background:"none",border:"1px solid "+C.border,color:C.red,borderRadius:8,fontSize:11,fontWeight:600,padding:"6px 10px",cursor:"pointer",fontFamily:C.font,flexShrink:0}},"Retirer")
                      );
                    })}
                  </div>
                )
            }
            <button onClick={()=>loadDevices()} disabled={devLoading}
              style={{width:"100%",marginTop:14,background:"transparent",border:`1px solid ${C.border}`,color:C.text3,borderRadius:9,fontSize:12,fontWeight:600,padding:"9px 0",cursor:devLoading?"not-allowed":"pointer",fontFamily:C.font}}>
              ↺ Rafraîchir la liste
            </button>
          </div>
        </div>
      )}

      {showTheme&&(
        <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"flex-end",justifyContent:"center"}}
          onClick={()=>setShowTheme(false)}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:C.bg1,borderRadius:"20px 20px 0 0",padding:"20px 20px 36px",
            width:"100%",maxWidth:430,border:`1px solid ${C.border}`,
          }}>
            <div style={{width:36,height:4,borderRadius:2,background:C.border,margin:"0 auto 18px"}}/>
            <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:16}}>🎨 Thème de l'application</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {[
                ["dark",      "🌑","Fond sombre · Optimal la nuit"],
                ["arctic",    "☀️","Fond clair · Idéal en plein jour"],
                ["bloomberg", "🖥","Terminal · Style Bloomberg Pro"],
                ["midnight",  "✦", "Violet & Or · Premium crypto"],
                ["bitcoin",   "₿", "Orange pill · Bitcoin Standard"],
                ["frozen",    "❄️", "Blizzard · Frozen Throne"],
                ["tropical",  "🌴","Cocotiers · Eau turquoise"],
              ].map(([key,ic,desc])=>{
                const T=THEMES[key];
                return(
                  <button key={key} onClick={()=>applyTheme(key)} style={{
                    display:"flex",alignItems:"center",gap:14,padding:"14px 16px",
                    borderRadius:12,border:`2px solid ${themeName===key?C.btc:C.border}`,
                    background:themeName===key?C.btc+"11":C.bg2,
                    cursor:"pointer",textAlign:"left",transition:"all .15s",
                  }}>
                    <span style={{fontSize:22,flexShrink:0}}>{ic}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:C.text,
                        fontFamily:key==="bloomberg"?"'Courier New',monospace":"inherit"}}>{T.name}</div>
                      <div style={{fontSize:11,color:C.text3,marginTop:2}}>{desc}</div>
                    </div>
                    {/* Mini palette */}
                    <div style={{display:"flex",gap:3,flexShrink:0}}>
                      {[T.bg1,T.btc,T.green,T.blue].map((c,i)=>(
                        <div key={i} style={{width:12,height:12,borderRadius:3,background:c,border:`1px solid ${T.border}`}}/>
                      ))}
                    </div>
                    {themeName===key&&<span style={{color:C.btc,fontSize:16,flexShrink:0}}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <style>{"*{box-sizing:border-box}button{outline:none}::-webkit-scrollbar{display:none}input,select{-webkit-appearance:none}@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}"}</style>
    </div>
  );
}


// v5.4 — Garde-fou : affiche l'erreur au lieu d'un écran noir (et aide au diagnostic)
class CGIErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state={err:null}; }
  static getDerivedStateFromError(err){ return {err:err}; }
  componentDidCatch(err,info){ try{ console.error("CGI crash:",err,info); }catch(e){} }
  render(){
    if(this.state.err){
      var e=this.state.err;
      return React.createElement("div",{style:{padding:"22px 18px",fontFamily:"ui-monospace,Menlo,monospace",color:"#e8e8e8",background:"#0b0e14",minHeight:"100vh",fontSize:12,lineHeight:1.55,overflowY:"auto"}},
        React.createElement("div",{style:{color:"#EAB308",fontWeight:600,fontSize:16,marginBottom:12}},"⚠️ Erreur de rendu CGI"),
        React.createElement("div",{style:{color:"#f87171",marginBottom:12,whiteSpace:"pre-wrap",fontWeight:700}}, String((e&&e.message)||e)),
        React.createElement("pre",{style:{whiteSpace:"pre-wrap",color:"#9aa3b2",fontSize:10,maxHeight:"45vh",overflow:"auto",background:"#070a10",padding:10,borderRadius:8}}, (e&&e.stack)||""),
        React.createElement("button",{onClick:function(){ try{ location.reload(); }catch(x){} }, style:{marginTop:16,padding:"9px 18px",background:"#EAB308",border:"none",borderRadius:8,fontWeight:600,cursor:"pointer",color:"#000"}},"Recharger")
      );
    }
    return this.props.children;
  }
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(CGIErrorBoundary, null, React.createElement(App)));