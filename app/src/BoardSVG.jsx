import { PROVINCES, BONUS_FIELDS, BORDERS, BORDER_SLOTS, SLOT_R, SUPPLY_AREAS, SUPPLY_R, IMG_W, IMG_H } from './boardData';
import { PLAYERS, BONUS_IMAGES } from './gameData';

// Calibration dots (40 angle measurements + 4 board corners)
export const CALIB_DOTS = [
  {x:245,y:0},{x:246,y:103},{x:178,y:0},{x:193,y:85},       // 0-3
  {x:291,y:89},{x:307,y:67},{x:306,y:0},{x:423,y:68},       // 4-7
  {x:423,y:125},{x:397,y:127},{x:301,y:174},{x:215,y:119},   // 8-11
  {x:122,y:0},{x:122,y:145},{x:81,y:222},{x:0,y:221},       // 12-15
  {x:0,y:304},{x:0,y:384},{x:132,y:313},{x:119,y:396},       // 16-19
  {x:147,y:475},{x:61,y:479},{x:0,y:510},{x:226,y:549},     // 20-23
  {x:162,y:405},{x:248,y:379},{x:250,y:549},{x:308,y:399},   // 24-27
  {x:348,y:336},{x:423,y:333},{x:423,y:233},{x:317,y:242},   // 28-31
  {x:285,y:283},{x:206,y:178},{x:206,y:192},{x:143,y:241},   // 32-35
  {x:250,y:220},{x:188,y:276},{x:227,y:311},{x:186,y:357},   // 36-39
  {x:0,y:0},{x:423,y:0},{x:423,y:549},{x:0,y:549},           // 40-43 corners
];

export const DEFAULT_CALIB_EDGES = [[40,12],[12,2],[2,0],[0,6],[6,41],[41,8],[8,30],[30,29],[29,42],[42,26],[26,23],[23,43],[43,22],[22,15],[15,40],[1,0],[1,3],[2,3],[4,5],[5,6],[4,10],[9,10],[8,9],[10,31],[11,13],[13,33],[12,13],[13,14],[14,15],[14,35],[33,34],[34,35],[31,30],[31,32],[32,28],[28,29],[35,37],[37,38],[38,32],[38,25],[16,18],[16,17],[18,37],[19,24],[19,17],[24,20],[24,25],[20,21],[21,22],[20,23],[25,27],[27,28],[1,11],[11,33],[1,10],[5,7],[25,26],[18,19],[17,22],[18,39],[25,39],[10,36],[33,36],[36,37],[1,4]];

function SupplyArea({ area, playerIdx, game, editMode, editOverrides, editSelected, onEditSelect }) {
  const pl = PLAYERS[playerIdx];
  const markersLeft = game?.mrem?.[playerIdx] ?? 12;

  function pos(type, id, dx, dy) {
    const ov = editOverrides?.[`${type}-${id}`];
    return { x: ov?.x ?? dx, y: ov?.y ?? dy };
  }
  function isSelected(type, id) {
    return editSelected?.type === type && editSelected?.id === id;
  }

  const r = SUPPLY_R;

  return (
    <g>
      {/* Control marker slot outlines (actual markers rendered in HTML overlay) */}
      {area.tokens.map((s, i) => {
        const sid = `${playerIdx}-tok-${i}`;
        const p = pos('supply', sid, s.x, s.y);
        const sel = isSelected('supply', sid);
        const hasMarker = i < markersLeft;
        return (
          <g key={`sup-${sid}`}
            onClick={editMode ? (e) => { e.stopPropagation(); onEditSelect?.('supply', sid); } : undefined}
            style={editMode ? { cursor: 'pointer' } : undefined}>
            <circle cx={p.x} cy={p.y} r={r}
              fill="transparent"
              stroke={sel ? '#ff0000' : '#c9a84c'}
              strokeWidth={sel ? 3 : 1}
              opacity={hasMarker ? 1 : 0.2}
            />
          </g>
        );
      })}

      {/* Senate column — empty slot outlines */}
      {(() => {
        const senateCol = area.senate;
        return senateCol.map((s, i) => {
          const sid = `${playerIdx}-sen-${i}`;
          const p = pos('supply', sid, s.x, s.y);
          const sel = isSelected('supply', sid);
          return (
            <g key={`sen-${sid}`}
              onClick={editMode ? (e) => { e.stopPropagation(); onEditSelect?.('supply', sid); } : undefined}
              style={editMode ? { cursor: 'pointer' } : undefined}>
              <circle cx={p.x} cy={p.y} r={r}
                fill={sel ? 'rgba(255,0,0,0.4)' : 'transparent'}
                stroke={sel ? '#ff0000' : '#c9a84c'}
                strokeWidth={sel ? 3 : 1.5}
                opacity={0.3}
              />
            </g>
          );
        });
      })()}
    </g>
  );
}

export default function BoardSVG({ occupiedSlotIds = [], isDragging = false, game, onClaimBonus,
  editMode = false, editSelected, editOverrides = {}, onEditSelect, showBorders = false,
  calibEdges, calibDotSelected, onCalibDotClick, extraDots }) {

  const provMap = {};
  for (const p of PROVINCES) provMap[p.id] = p;

  return (
    <svg viewBox={`0 0 ${IMG_W} ${IMG_H}`} style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
      <image href="/caesar-board.jpg" x="0" y="0" width={IMG_W} height={IMG_H} />

      {/* Border lines through slots at computed angles */}
      {showBorders && BORDER_SLOTS.map(slot => {
        const ov = editOverrides[`border-${slot.id}`];
        const bx = ov?.x ?? slot.x;
        const by = ov?.y ?? slot.y;
        const lineAngle = ((slot.angle || 0) + 90) * Math.PI / 180;
        const len = 30;
        const x1 = bx - len * Math.cos(lineAngle);
        const y1 = by - len * Math.sin(lineAngle);
        const x2 = bx + len * Math.cos(lineAngle);
        const y2 = by + len * Math.sin(lineAngle);
        const color = slot.type === 'sword' ? '#e54' : slot.type === 'shield' ? '#48f' : '#4c8';
        return (
          <g key={`bline-${slot.id}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={color} strokeWidth={2} opacity={0.8} />
            <circle cx={bx} cy={by} r={3} fill="#fff" opacity={0.9} />
            <text x={bx} y={by - 7} textAnchor="middle" fontSize="6" fontWeight="bold"
              fill="#fff" stroke="#000" strokeWidth="0.3" style={{ pointerEvents: 'none' }}>
              {slot.id}
            </text>
          </g>
        );
      })}

      {/* Province boundary network */}
      {showBorders && (() => {
        const edges = calibEdges || DEFAULT_CALIB_EDGES;
        const allDots = [...CALIB_DOTS, ...(extraDots || [])];
        return <>
          {edges.map(([a, b], i) => {
            if (!allDots[a] || !allDots[b]) return null;
            return (
              <line key={`edge-${i}`} x1={allDots[a].x} y1={allDots[a].y}
                x2={allDots[b].x} y2={allDots[b].y}
                stroke="#ff0" strokeWidth={1.5} opacity={0.6} />
            );
          })}
          {allDots.map((d, i) => {
            const connected = edges.some(([a, b]) => a === i || b === i);
            if (!connected && i !== calibDotSelected) return null;
            const isExtra = i >= CALIB_DOTS.length;
            return (
              <g key={`dot-${i}`}
                onClick={onCalibDotClick ? (e) => { e.stopPropagation(); onCalibDotClick(i); } : undefined}
                style={onCalibDotClick ? { cursor: 'pointer' } : undefined}>
                <circle cx={d.x} cy={d.y} r={6}
                  fill={i === calibDotSelected ? '#f00' : isExtra ? '#0f0' : i >= 40 ? '#f80' : '#ff0'}
                  stroke={i === calibDotSelected ? '#fff' : '#000'}
                  strokeWidth={i === calibDotSelected ? 2 : 0.8} opacity={0.9} />
                <text x={d.x + 7} y={d.y + 3} fontSize="7" fontWeight="bold"
                  fill="#ff0" stroke="#000" strokeWidth="0.4"
                  style={{ pointerEvents: 'none' }}>{i}</text>
              </g>
            );
          })}
          {PROVINCES.map(p => (
            <text key={`plbl-${p.id}`} x={p.x} y={p.y} textAnchor="middle" fontSize="7" fontWeight="bold"
              fill="#ff0" stroke="#000" strokeWidth="0.3" style={{ pointerEvents: 'none' }}>
              {p.id}
            </text>
          ))}
        </>;
      })()}

      {/* Supply areas — battle tokens + senate slots */}
      {SUPPLY_AREAS.map((area, pi) => (
        <SupplyArea key={`supply-${pi}`} area={area} playerIdx={pi} game={game}
          editMode={editMode} editOverrides={editOverrides}
          editSelected={editSelected} onEditSelect={onEditSelect} />
      ))}
    </svg>
  );
}
