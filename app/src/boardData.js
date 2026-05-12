// Caesar! — Board data using actual board photo overlay
// viewBox matches image pixels: 423 x 549
// All coordinates in image pixel space

export const IMG_W = 423;
export const IMG_H = 549;
export const SLOT_R = 16;

// Province centers + bonus token positions (CV-detected from yellow circles)
export const PROVINCES = [
  // bx/by = control marker position (matches bonus field assigned via DEFAULT_BONUS_ASSIGN)
  { id:'hisp_ult',  name:'Hisp.\nUlt.',   x:102, y:44,  bx:212, by: 53, fill:'#c4b896' },
  { id:'hisp_cit',  name:'Hisp.\nCit.',   x:195, y:22,  bx:274, by: 53, fill:'#c4b896' },
  { id:'gallia',    name:'Gallia',         x:347, y:33,  bx:336, by:108, fill:'#c4b896' },
  { id:'mauritania',name:'Mauri-\ntania',  x:72,  y:99,  bx:156, by:123, fill:'#8a9a6e' },
  { id:'sardinia',  name:'Sardinia',       x:178, y:93,  bx:245, by:160, fill:'#8a9a6e' },
  { id:'gall_cis',  name:'Gallia\nCisal.', x:338, y:121, bx:375, by:197, fill:'#c4b896' },
  { id:'numidia',   name:'Numidia',        x:85,  y:154, bx:140, by:206, fill:'#8a9a6e' },
  { id:'sicilia',   name:'Sicilia',        x:169, y:176, bx:193, by:246, fill:'#8a9a6e' },
  { id:'italia',    name:'Italia',         x:245, y:181, bx:271, by:245, bx2:243, by2:267, fill:'#c4b090', bonusSlots:2 },
  { id:'dalmatia',  name:'Dalmatia',       x:364, y:192, bx:372, by:297, fill:'#c4b896' },
  { id:'africa',    name:'Africa',         x:42,  y:225, bx: 44, by:268, fill:'#8a9a6e' },
  { id:'achaia',    name:'Achaia',         x:186, y:258, bx:200, by:336, fill:'#8a9a6e' },
  { id:'macedonia', name:'Mace-\ndonia',   x:322, y:275, bx:286, by:356, fill:'#8a9a6e' },
  { id:'cyrene',    name:'Cyrene',         x:51,  y:302, bx: 35, by:354, fill:'#c4b896' },
  { id:'creta',     name:'Creta',          x:178, y:340, bx:162, by:379, fill:'#8a9a6e' },
  { id:'asia',      name:'Asia',           x:310, y:395, bx:215, by:456, fill:'#c4b896' },
  { id:'aegyptus',  name:'Aegyptus',       x:59,  y:412, bx: 40, by:446, fill:'#c4b896' },
  { id:'syria',     name:'Syria',          x:178, y:483, bx:109, by:520, fill:'#c4b896' },
];

// 30 borders — user-corrected positions, types, and province assignments
export const BORDERS = [
  { id: 0, p:['gall_cis','italia'],     type:'sword',  x:309, y:214 },
  { id: 1, p:['mauritania','sardinia'], type:'ship',   x:211, y:153 },
  { id: 2, p:['hisp_cit','gallia'],     type:'sword',  x:287, y: 86 },
  { id: 3, p:['hisp_ult','hisp_cit'],   type:'shield', x:244, y: 72 },
  { id: 4, p:['numidia','sicilia'],     type:'ship',   x:186, y:204 },
  { id: 5, p:['dalmatia','macedonia'],  type:'sword',  x:309, y:302 },
  { id: 6, p:['gallia','gall_cis'],     type:'sword',  x:377, y:137 },
  { id: 7, p:['sardinia','gallia'],      type:'shield', x:287, y:153 },
  { id: 8, p:['sardinia','sicilia'],    type:'ship',   x:224, y:195 },
  { id: 9, p:['hisp_ult','mauritania'], type:'ship',   x:205, y: 86 },
  { id:10, p:['aegyptus','syria'],      type:'sword',  x: 65, y:482 },
  { id:11, p:['sicilia','italia'],      type:'sword',  x:233, y:235 },
  { id:12, p:['mauritania','numidia'],  type:'sword',  x:173, y:164 },
  { id:13, p:['italia','dalmatia'],     type:'ship',   x:302, y:258 },
  { id:14, p:['africa','sicilia'],      type:'ship',   x:161, y:257 },
  { id:15, p:['africa','achaia'],       type:'ship',   x:155, y:295 },
  { id:16, p:['italia','macedonia'],    type:'shield', x:250, y:298 },
  { id:17, p:['italia','sardinia'],     type:'shield', x:281, y:197 },
  { id:18, p:['africa','cyrene'],       type:'shield', x: 70, y:307 },
  { id:19, p:['italia','achaia'],       type:'ship',   x:204, y:290 },
  { id:20, p:['africa','numidia'],      type:'sword',  x:110, y:232 },
  { id:21, p:['achaia','creta'],        type:'shield', x:160, y:333 },
  { id:22, p:['achaia','macedonia'],    type:'sword',  x:238, y:346 },
  { id:23, p:['cyrene','creta'],        type:'shield', x:121, y:357 },
  { id:24, p:['cyrene','aegyptus'],     type:'sword',  x: 59, y:392 },
  { id:25, p:['creta','asia'],          type:'shield', x:198, y:392 },
  { id:26, p:['aegyptus','creta'],      type:'ship',   x:135, y:401 },
  { id:27, p:['aegyptus','asia'],       type:'ship',   x:152, y:436 },
  { id:28, p:['asia','syria'],          type:'shield', x:179, y:501 },
  { id:29, p:['gallia','dalmatia'],     type:'shield', x:376, y:240 },
];

// Province boundary lines — polylines tracing the borders between adjacent provinces
// Each entry: [provA, provB, [[x,y], [x,y], ...]]
// Used in calibration mode to verify province areas
export const PROVINCE_LINES = [
  ['hisp_ult', 'hisp_cit',   [[245,4],[246,103]]],
  ['hisp_ult', 'mauritania',  [[0,65],[80,65],[140,100]]],
  ['hisp_cit', 'sardinia',    [[246,103],[230,130],[215,145]]],
  ['hisp_cit', 'gallia',      [[246,4],[246,103]]],
  ['gallia', 'sardinia',      [[246,103],[310,130]]],
  ['gallia', 'gall_cis',      [[310,130],[423,100]]],
  ['gallia', 'dalmatia',      [[423,100],[423,220],[376,240]]],
  ['mauritania', 'sardinia',  [[140,100],[215,145]]],
  ['mauritania', 'numidia',   [[0,65],[0,220],[80,220],[140,175]]],
  ['sardinia', 'sicilia',     [[215,145],[215,220]]],
  ['sardinia', 'gall_cis',    [[310,130],[310,170]]],
  ['sardinia', 'italia',      [[310,170],[280,200],[260,220]]],
  ['gall_cis', 'italia',      [[310,170],[310,220],[300,240]]],
  ['gall_cis', 'dalmatia',    [[423,100],[423,220]]],
  ['numidia', 'sicilia',      [[140,175],[215,220]]],
  ['numidia', 'africa',       [[0,220],[80,220],[120,240]]],
  ['sicilia', 'italia',       [[215,220],[260,220]]],
  ['sicilia', 'africa',       [[120,240],[170,270]]],
  ['italia', 'dalmatia',      [[300,240],[340,240],[376,240],[423,220]]],
  ['italia', 'achaia',        [[215,220],[215,310]]],
  ['italia', 'macedonia',     [[300,240],[280,310]]],
  ['africa', 'sicilia',       [[120,240],[170,270]]],
  ['africa', 'achaia',        [[120,240],[170,270],[170,310]]],
  ['africa', 'cyrene',        [[0,220],[0,340],[70,310]]],
  ['dalmatia', 'macedonia',   [[376,240],[423,320]]],
  ['achaia', 'macedonia',     [[215,310],[280,310],[320,340]]],
  ['achaia', 'creta',         [[170,310],[170,360]]],
  ['cyrene', 'creta',         [[70,310],[130,360]]],
  ['cyrene', 'aegyptus',      [[0,340],[0,420],[60,390]]],
  ['creta', 'asia',           [[170,360],[220,380],[260,390]]],
  ['creta', 'aegyptus',       [[130,360],[130,420]]],
  ['aegyptus', 'asia',        [[130,420],[170,450]]],
  ['aegyptus', 'syria',       [[0,420],[0,549],[170,549],[170,450]]],
  ['asia', 'syria',           [[170,450],[260,520]]],
  ['asia', 'macedonia',       [[320,340],[350,360],[423,320]]],
];

// Border angles calibrated from border dots — perpendicular direction toward p[0]
const BORDER_ANGLES = {
  0: -12.3, 1: -173.7, 2: -112.0, 3: 180, 4: 232.0, 5: -49.6,
  6: 244.9, 7: 141.5, 8: -44.4, 9: -247.8, 10: 264.8, 11: -137.3,
  12: -71.2, 13: -145.7, 14: -232.5, 15: 238.2, 16: 244.6, 17: 226.2,
  18: -85.6, 19: -45.8, 20: 98.5, 21: -52.1, 22: -197.4, 23: -170.1,
  24: -83.1, 25: -105.9, 26: 97.9, 27: 189.7, 28: -47.7, 29: -94.9,
};

export const BORDER_SLOTS = BORDERS.map(b => {
  const angle = BORDER_ANGLES[b.id] ?? 0;
  return { id: b.id, x: b.x, y: b.y, type: b.type, p: b.p, angle };
});

// Bonus fields — 19 physical positions (CV-detected yellow circles)
// Province assignment is editable; italia has 2 slots (0 + 1)
export const BONUS_FIELDS = [
  { id:  0, x: 243, y: 267 },
  { id:  1, x: 212, y:  53 },
  { id:  2, x: 274, y:  53 },
  { id:  3, x: 156, y: 123 },
  { id:  4, x: 245, y: 160 },
  { id:  5, x: 336, y: 108 },
  { id:  6, x: 140, y: 206 },
  { id:  7, x: 271, y: 245 },
  { id:  8, x: 162, y: 379 },
  { id:  9, x: 109, y: 520 },
  { id: 10, x: 375, y: 197 },
  { id: 11, x:  44, y: 268 },
  { id: 12, x: 193, y: 246 },
  { id: 13, x: 372, y: 297 },
  { id: 14, x:  35, y: 354 },
  { id: 15, x: 200, y: 336 },
  { id: 16, x: 286, y: 356 },
  { id: 17, x:  40, y: 446 },
  { id: 18, x: 215, y: 456 },
];

// Default province assignments for bonus fields (field id → province id)
// Computed by sum-of-distances to all province borders (least sum = inside that province)
// italia_0 = Senate (always unclaimed on start), italia_1 = empty (pre-claimed)
export const DEFAULT_BONUS_ASSIGN = {
  0: 'italia_1',
  1: 'hisp_ult',
  2: 'hisp_cit',
  3: 'mauritania',
  4: 'sardinia',
  5: 'gallia',
  6: 'numidia',
  7: 'italia_0',
  8: 'creta',
  9: 'syria',
  10: 'gall_cis',
  11: 'africa',
  12: 'sicilia',
  13: 'dalmatia',
  14: 'cyrene',
  15: 'achaia',
  16: 'macedonia',
  17: 'aegyptus',
  18: 'asia',
};

// All assignable province options (includes italia_0 and italia_1)
export const BONUS_PROVINCE_OPTIONS = [
  ...PROVINCES.filter(p => p.id !== 'italia').map(p => p.id),
  'italia_0',
  'italia_1',
];

// Supply areas — actual positions CV-detected from board photo
// Caesar: 3 cols (26,63,99) — col1&2: 6 rows, col3: 4 rows = 16 fields
// Pompey: 3 cols (323,358,393) — col1: 4 rows, col2&3: 6 rows = 16 fields
export const SUPPLY_R = SLOT_R;

const CAESAR_SUPPLY = [
  {x:26,y:22},{x:63,y:25},{x:99,y:26},
  {x:26,y:55},{x:63,y:58},{x:99,y:58},
  {x:27,y:88},{x:63,y:90},{x:99,y:91},
  {x:25,y:120},{x:63,y:122},{x:99,y:124},
  {x:26,y:153},{x:64,y:155},
  {x:26,y:186},{x:62,y:187},
];

const POMPEY_SUPPLY = [
  {x:356,y:359},{x:394,y:358},
  {x:358,y:390},{x:393,y:390},
  {x:323,y:422},{x:358,y:422},{x:392,y:422},
  {x:322,y:454},{x:357,y:454},{x:393,y:454},
  {x:321,y:486},{x:357,y:485},{x:392,y:485},
  {x:322,y:518},{x:358,y:518},{x:392,y:518},
];

// Supply area boundary polygons (from border calibration dots)
export const SUPPLY_POLY = [
  [[0,0], [122,0], [122,146], [83,222], [0,220]],         // Caesar: top-left
  [[423,335], [347,337], [306,398], [249,546], [249,549], [423,549]], // Pompey: bottom-right
];

export const SUPPLY_AREAS = [
  {
    all: CAESAR_SUPPLY,
    tokens: CAESAR_SUPPLY.filter(s => s.x < 80),   // left 2 cols = 12 battle token slots
    senate: CAESAR_SUPPLY.filter(s => s.x >= 80),   // right col = 4 senate slots
  },
  {
    all: POMPEY_SUPPLY,
    tokens: POMPEY_SUPPLY.filter(s => s.x > 340),   // right 2 cols = 12 battle token slots
    senate: POMPEY_SUPPLY.filter(s => s.x <= 340),   // left col = 4 senate slots
  },
];
