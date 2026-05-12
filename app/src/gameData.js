// ── Slot positions (x%, y%) on the board image ──────────────
export const SLOTS = [
  { id: 0, x:36.6, y: 5.1, type:'Shield', p:['H.Ult','H.Cit'] },
  { id: 1, x:42.1, y: 5.1, type:'Sword',  p:['H.Ult','H.Cit'] },
  { id: 2, x:47.3, y: 5.1, type:'Ship',   p:['H.Ult','H.Cit'] },
  { id: 3, x:26.7, y: 9.5, type:'Ship',   p:['H.Ult','Maur'] },
  { id: 4, x:26.7, y:13.1, type:'Sword',  p:['H.Ult','Maur'] },
  { id: 5, x:49.2, y:10.9, type:'Ship',   p:['H.Cit','Sard'] },
  { id: 6, x:70.4, y: 6.9, type:'Ship',   p:['H.Cit','Gall'] },
  { id: 7, x:39.7, y:16.0, type:'Ship',   p:['Maur','Sard'] },
  { id: 8, x:25.5, y:21.5, type:'Sword',  p:['Maur','Num'] },
  { id: 9, x:30.7, y:21.5, type:'Shield', p:['Maur','Num'] },
  { id:10, x:87.9, y:11.8, type:'Sword',  p:['Gall','G.Cis'] },
  { id:11, x:87.9, y:15.5, type:'Shield', p:['Gall','G.Cis'] },
  { id:12, x:68.6, y:15.5, type:'Ship',   p:['Sard','G.Cis'] },
  { id:13, x:48.0, y:23.7, type:'Ship',   p:['Sard','Sic'] },
  { id:14, x:39.0, y:28.2, type:'Ship',   p:['Num','Sic'] },
  { id:15, x:18.4, y:33.9, type:'Sword',  p:['Num','Afr'] },
  { id:16, x:23.6, y:33.9, type:'Shield', p:['Num','Afr'] },
  { id:17, x:55.6, y:32.1, type:'Ship',   p:['Sic','Ital'] },
  { id:18, x:61.0, y:32.1, type:'Shield', p:['Sic','Ital'] },
  { id:19, x:75.2, y:25.1, type:'Sword',  p:['G.Cis','Ital'] },
  { id:20, x:91.7, y:27.7, type:'Shield', p:['G.Cis','Dalm'] },
  { id:21, x:82.7, y:34.6, type:'Ship',   p:['Ital','Dalm'] },
  { id:22, x:61.9, y:39.2, type:'Ship',   p:['Ital','Ach'] },
  { id:23, x:93.4, y:41.0, type:'Sword',  p:['Dalm','Mac'] },
  { id:24, x:32.6, y:37.5, type:'Ship',   p:['Afr','Sic'] },
  { id:25, x:11.3, y:47.4, type:'Sword',  p:['Afr','Cyr'] },
  { id:26, x:72.8, y:47.4, type:'Shield', p:['Ach','Mac'] },
  { id:27, x:32.6, y:50.6, type:'Ship',   p:['Ach','Cyr'] },
  { id:28, x:51.5, y:54.6, type:'Ship',   p:['Ach','Cret'] },
  { id:29, x:37.8, y:64.1, type:'Ship',   p:['Cret','Aeg'] },
  { id:30, x:65.7, y:61.6, type:'Ship',   p:['Cret','Asia'] },
  { id:31, x:14.7, y:62.8, type:'Sword',  p:['Cyr','Aeg'] },
  { id:32, x:81.6, y:56.1, type:'Ship',   p:['Asia','Mac'] },
  { id:33, x:35.5, y:79.4, type:'Sword',  p:['Aeg','Syr'] },
  { id:34, x:74.5, y:76.5, type:'Shield', p:['Asia','Syr'] },
];

export const PROVS = [
  { n:'Hisp. Ult.',   x:24, y:8  },
  { n:'Hisp. Cit.',   x:46, y:4  },
  { n:'Mauritania',   x:17, y:18 },
  { n:'Gallia',       x:82, y:6  },
  { n:'Sardinia',     x:42, y:17 },
  { n:'G. Cisalpina', x:80, y:22 },
  { n:'Numidia',      x:20, y:28 },
  { n:'Sicilia',      x:40, y:32 },
  { n:'Italia',       x:58, y:33 },
  { n:'Africa',       x:10, y:41 },
  { n:'Dalmatia',     x:86, y:35 },
  { n:'Achaia',       x:44, y:47 },
  { n:'Macedonia',    x:76, y:50 },
  { n:'Cyrene',       x:12, y:55 },
  { n:'Creta',        x:42, y:62 },
  { n:'Aegyptus',     x:14, y:75 },
  { n:'Asia',         x:60, y:72 },
  { n:'Syria',        x:42, y:88 },
];

export const MARKER_SUPPLY = [
  // Caesar — top-left corner, 2 cols x 6 rows
  [
    {x:4.3,y:1.8},{x:9.0,y:1.8},
    {x:4.3,y:4.4},{x:9.0,y:4.4},
    {x:4.3,y:6.9},{x:9.0,y:6.9},
    {x:4.3,y:9.5},{x:9.0,y:9.5},
    {x:4.3,y:12.0},{x:9.0,y:12.0},
    {x:4.3,y:14.6},{x:9.0,y:14.6},
  ],
  // Pompey — bottom-right corner, 2 cols x 6 rows
  [
    {x:86.3,y:85.2},{x:91.0,y:85.2},
    {x:86.3,y:87.8},{x:91.0,y:87.8},
    {x:86.3,y:90.3},{x:91.0,y:90.3},
    {x:86.3,y:92.9},{x:91.0,y:92.9},
    {x:86.3,y:95.4},{x:91.0,y:95.4},
    {x:86.3,y:98.0},{x:91.0,y:98.0},
  ],
];

export const PLAYERS = [
  { name: 'Caesar', bg: '#E93034', hi: '#E93034' },
  { name: 'Pompey', bg: '#5577BB', hi: '#5577BB' },
];

export const TYPE_ICONS = { Sword:'⚔️', Shield:'🛡️', Ship:'⚓', 'Ship+Shield':'⚓🛡️', Wreath:'🌿' };
export const BONUS_ICONS = { Tactics:'⚡', Wealth:'💰', Might:'💪', Senate:'🏛️' };
export const BONUS_IMAGES = {
  Tactics: '/tokens/bonus_tactics.png',
  Wealth: '/tokens/bonus_wealth.png',
  Might: '/tokens/bonus_might.png',
  Senate: '/tokens/bonus_senate.png',
};

export function createTokenSet() {
  return [
    // Shield (4)
    { type:'Shield', v:[0,6] },
    { type:'Shield', v:[1,5] },
    { type:'Shield', v:[2,4] },
    { type:'Shield', v:[3,3] },
    // Ship+Shield — plays on ship OR shield slots (1)
    { type:'Ship+Shield', v:[4,4] },
    // Ship (4)
    { type:'Ship', v:[0,6] },
    { type:'Ship', v:[1,5] },
    { type:'Ship', v:[2,4] },
    { type:'Ship', v:[3,3] },
    // Sword (5)
    { type:'Sword', v:[0,6] },
    { type:'Sword', v:[0,7] },
    { type:'Sword', v:[1,5] },
    { type:'Sword', v:[2,4] },
    { type:'Sword', v:[3,3] },
    // Wreath — wild, plays on any slot (5)
    { type:'Wreath', v:[0,4] },
    { type:'Wreath', v:[1,3] },
    { type:'Wreath', v:[2,2] },
    { type:'Wreath', v:[2,2] },
    { type:'Wreath', v:[3,3] },
  ];
}

export function tokenImage(type, v, player = 0) {
  const prefix = player === 0 ? 'red' : 'pur';
  const tname = type === 'Ship+Shield' ? 'shipshield' : type.toLowerCase();
  return `/tokens/${prefix}_${tname}_${v[0]}_${v[1]}.png`;
}

export const ALL_TOKEN_IMAGES = createTokenSet().reduce((acc, t) => {
  for (const p of [0, 1]) {
    const src = tokenImage(t.type, t.v, p);
    if (!acc.includes(src)) acc.push(src);
  }
  return acc;
}, []);

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
