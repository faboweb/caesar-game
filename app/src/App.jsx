import { useState, useCallback, useRef, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
} from '@dnd-kit/core';
import { BORDER_SLOTS, PROVINCES, BONUS_FIELDS, DEFAULT_BONUS_ASSIGN, BONUS_PROVINCE_OPTIONS, SUPPLY_AREAS, SUPPLY_POLY } from './boardData';
import { PLAYERS, createTokenSet, shuffle, tokenImage, ALL_TOKEN_IMAGES, BONUS_IMAGES } from './gameData';
import BoardSVG, { DEFAULT_CALIB_EDGES, CALIB_DOTS } from './BoardSVG';
import { createSoloState, executeBotTurn, checkAndCloseProvinces, checkBorderDomination, checkWinCondition, getProvinceInfluence, getBordersForProvince } from './soloEngine';
import { smartExecuteBotTurn } from './smartEngine';
import './App.css';

// All images to preload
const ALL_IMAGES = [
  ...ALL_TOKEN_IMAGES,
  ...Object.values(BONUS_IMAGES),
  '/tokens/caesar_marker.png',
  '/tokens/pompey_marker.png',
  '/tokens/red_back.png',
  '/tokens/pur_back.png',
  '/caesar-board.jpg',
];

function preloadImages(urls) {
  return Promise.all(urls.map(src => new Promise((resolve) => {
    const img = new Image();
    img.onload = resolve;
    img.onerror = resolve; // don't block on missing images
    img.src = src;
  })));
}

// ── Helpers ──
function freshGame(assign = DEFAULT_BONUS_ASSIGN, mode = 'local', difficulty = 'normal') {
  // Random bonus types for non-Italia fields
  const italiaCount = Object.values(assign).filter(p => p.startsWith('italia')).length;
  const randomCount = BONUS_FIELDS.length - italiaCount;
  const types = shuffle(
    Array.from({ length: randomCount }, (_, i) => ['Tactics','Wealth','Might'][i % 3])
  );
  const bonus = BONUS_FIELDS.map(bf => {
    const province = assign[bf.id] || '';
    if (province === 'italia_0') {
      return { type: 'Senate', province, claimed: false };
    }
    if (province === 'italia_1') {
      return { type: 'Senate', province, claimed: true };
    }
    return { type: types.pop(), province, claimed: false };
  });

  const bags = [shuffle(createTokenSet()), shuffle(createTokenSet())];
  // Each player draws 2 tokens at game start (per rules)
  const hands = [[], []];
  for (let pl = 0; pl < 2; pl++) {
    for (let i = 0; i < 2; i++) {
      if (bags[pl].length > 0) hands[pl].push({ ...bags[pl].pop(), rot: false, uid: ++idCounter });
    }
  }
  const g = {
    cp: 0,
    mode,
    bags,
    hands,
    board: [],
    markers: [],
    bonus,
    mrem: [12, 12],
  };
  if (mode === 'solo') {
    g.solo = createSoloState();
    g.difficulty = difficulty;
  }
  return g;
}

let idCounter = 0;
function uid() { return ++idCounter; }

// Convert SVG/image coords to percentage for overlay positioning
function svgToPercent(x, y) {
  return { left: (x / 423) * 100, top: (y / 549) * 100 };
}

// ── DraggableDiv wrapper ──
function DraggableDiv({ id, children, style }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      style={{ ...style, opacity: isDragging ? 0.3 : 1 }}>
      {children}
    </div>
  );
}

// ── Main App ──
export default function App() {
  const [imagesLoaded, setImagesLoaded] = useState(false);
  useEffect(() => { preloadImages(ALL_IMAGES).then(() => setImagesLoaded(true)); }, []);

  if (!imagesLoaded) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100dvh', background: '#1a1208', color: '#c9a84c',
        fontFamily: 'Georgia, serif', fontSize: 18,
      }}>
        Loading…
      </div>
    );
  }

  return <AppInner />;
}

function AppInner() {
  const [game, setGame] = useState(() => {
    const saved = localStorage.getItem('caesar_v2');
    if (saved) try {
      const g = JSON.parse(saved);
      // Migrate old pi-based bonus to province-based
      if (g.bonus?.[0] && 'pi' in g.bonus[0] && !('province' in g.bonus[0])) {
        return freshGame();
      }
      return g;
    } catch {}
    return freshGame();
  });
  const [showOverlay, setShowOverlay] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [dragPos, setDragPos] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editSelected, setEditSelected] = useState(null);
  const [radialMenu, setRadialMenu] = useState(null); // { x, y, source, index }
  const [mainMenu, setMainMenu] = useState(false);
  const [borderCalibrate, setBorderCalibrate] = useState(false);
  const [calibDots, setCalibDots] = useState(() => {
    const s = localStorage.getItem('caesar_calib_dots');
    return s ? JSON.parse(s) : [];
  });
  const [calibEdges, setCalibEdges] = useState(() => {
    const s = localStorage.getItem('caesar_calib_edges');
    return s ? JSON.parse(s) : null; // null = use defaults from BoardSVG
  });
  const [calibDotSelect, setCalibDotSelect] = useState(null); // first dot index for connect/disconnect
  const [editOverrides, setEditOverrides] = useState(() => {
    const s = localStorage.getItem('caesar_overrides_v2');
    return s ? JSON.parse(s) : {};
  });
  const [bonusAssign, setBonusAssign] = useState(() => {
    const s = localStorage.getItem('caesar_bonus_assign_v2');
    return s ? JSON.parse(s) : { ...DEFAULT_BONUS_ASSIGN };
  });
  const boardWrapRef = useRef(null);

  // Autosave
  useEffect(() => {
    localStorage.setItem('caesar_v2', JSON.stringify(game));
  }, [game]);
  useEffect(() => {
    localStorage.setItem('caesar_bonus_assign_v2', JSON.stringify(bonusAssign));
  }, [bonusAssign]);

  const { cp, bags, hands, board, markers, bonus, mrem } = game;
  const player = PLAYERS[cp];
  const hp = game.mode === 'solo' ? 0 : cp; // human player index (always 0 in solo)

  // ── Sensors ──
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  // ── Parse drag ID ──
  function parseDragId(id) {
    if (!id) return null;
    const parts = id.split('-');
    // supply-{player}-{index} has 3 parts
    if (parts[0] === 'supply' && parts.length === 3) {
      return { source: 'supply', pl: parseInt(parts[1]), index: parseInt(parts[2]) };
    }
    // claimed-{player}-{index} — bonus token in supply area
    if (parts[0] === 'claimed' && parts.length === 3) {
      return { source: 'claimed', pl: parseInt(parts[1]), index: parseInt(parts[2]) };
    }
    return { source: parts[0], index: parseInt(parts[1]) };
  }

  // ── Convert client coords to image/SVG coords (423x549) ──
  function clientToSvg(clientX, clientY) {
    const wrap = boardWrapRef.current;
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 423,
      y: ((clientY - rect.top) / rect.height) * 549,
    };
  }

  // ── Find closest slot to client coordinates (respects edit overrides) ──
  function closestSlot(clientX, clientY) {
    const svg = clientToSvg(clientX, clientY);
    if (!svg) return null;
    let best = null, bestDist = Infinity;
    for (const s of BORDER_SLOTS) {
      const ov = editOverrides[`border-${s.id}`];
      if (ov?.deleted) continue;
      const sx = ov?.x ?? s.x;
      const sy = ov?.y ?? s.y;
      const d = Math.hypot(svg.x - sx, svg.y - sy);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    return bestDist < 50 ? best : null;
  }

  // ── Find closest province bonus field to SVG coords ──
  function closestProvince(clientX, clientY) {
    const svg = clientToSvg(clientX, clientY);
    if (!svg) return null;
    let best = null, bestDist = Infinity;
    for (const p of PROVINCES) {
      const d = Math.hypot(svg.x - p.bx, svg.y - p.by);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    return bestDist < 40 ? best : null;
  }

  // ── Check if drop position is in a supply area (point-in-polygon from border data) ──
  function isInSupplyArea(clientX, clientY, playerIdx) {
    const svg = clientToSvg(clientX, clientY);
    if (!svg) return false;
    const poly = SUPPLY_POLY[playerIdx];
    if (!poly) return false;
    // Ray-casting point-in-polygon
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > svg.y) !== (yj > svg.y) &&
          svg.x < (xj - xi) * (svg.y - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  // ── Get the token being dragged (always includes pl = owner) ──
  function getActiveToken() {
    const parsed = parseDragId(activeId);
    if (!parsed) return null;
    if (parsed.source === 'hand') return { ...hands[hp][parsed.index], pl: hp };
    if (parsed.source === 'board') return board[parsed.index]; // already has pl
    if (parsed.source === 'supply') return { isMarker: true, pl: parsed.pl ?? hp };
    if (parsed.source === 'marker') return { isMarker: true, placed: true, pl: markers[parsed.index]?.pl ?? hp };
    if (parsed.source === 'bonus') return { isBonus: true, index: parsed.index, pl: hp };
    if (parsed.source === 'claimed') return { isBonus: true, claimed: true, index: parsed.index, pl: parsed.pl };
    return null;
  }

  const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;

  // ── Get final client position from drag event ──
  // Mobile: offset upward so drop point is above finger. Desktop: no offset.
  const DRAG_Y_OFFSET = isTouchDevice ? -80 : 0;
  function getFinalPos(event) {
    const { activatorEvent, delta } = event;
    if (!activatorEvent) return null;
    const touch = activatorEvent.touches?.[0] || activatorEvent;
    return {
      x: touch.clientX + (delta?.x || 0),
      y: touch.clientY + (delta?.y || 0) + DRAG_Y_OFFSET,
    };
  }

  // ── DnD handlers ──
  const handleDragStart = useCallback((event) => {
    // Block drags during bot turn
    if (botRunning.current) return;
    setActiveId(event.active.id);
  }, []);

  const handleDragMove = useCallback((event) => {
    const pos = getFinalPos(event);
    if (pos) setDragPos(pos);
  }, []);

  const handleDragEnd = useCallback((event) => {
    const { active } = event;
    setActiveId(null);
    setDragPos(null);

    const parsed = parseDragId(active.id);
    if (!parsed) return;

    const finalPos = getFinalPos(event);

    // Check if dropped on trash zone (near 290,420 in board coords)
    const wrap = boardWrapRef.current;
    let droppedOnTrash = false;
    if (finalPos && wrap) {
      const rect = wrap.getBoundingClientRect();
      const rx = (finalPos.x - rect.left) / rect.width;
      const ry = (finalPos.y - rect.top) / rect.height;
      const dx = rx - 260 / 423, dy = ry - 500 / 549;
      droppedOnTrash = Math.sqrt(dx * dx + dy * dy) < 0.1;
    }

    if (droppedOnTrash && (parsed.source === 'hand' || parsed.source === 'board')) {
      setGame(prev => {
        const next = JSON.parse(JSON.stringify(prev));
        const pl = prev.mode === 'solo' ? 0 : next.cp;
        if (parsed.source === 'hand') {
          const tok = next.hands[pl].splice(parsed.index, 1)[0];
          if (tok) next.bags[pl].push(tok);
        } else if (parsed.source === 'board') {
          const bt = next.board[parsed.index];
          if (bt && bt.pl === pl) {
            next.bags[pl].push({ type: bt.tok.type, v: [...bt.tok.v] });
            next.board.splice(parsed.index, 1);
          }
        }
        return next;
      });
      return;
    }

    const targetSlot = finalPos ? closestSlot(finalPos.x, finalPos.y) : null;

    setGame(prev => {
      const next = JSON.parse(JSON.stringify(prev));

      const pl = prev.mode === 'solo' ? 0 : next.cp;

      if (parsed.source === 'hand') {
        if (targetSlot && !next.board.some(b => b.slotId === targetSlot.id)) {
          const tok = next.hands[pl].splice(parsed.index, 1)[0];
          next.board.push({
            tok: { type: tok.type, v: tok.v },
            slotId: targetSlot.id,
            rot: tok.rot || false,
            pl,
          });
        }
      } else if (parsed.source === 'board') {
        const bt = next.board[parsed.index];
        if (bt && bt.pl === pl) {
          if (targetSlot && targetSlot.id !== bt.slotId && !next.board.some(b => b.slotId === targetSlot.id)) {
            bt.slotId = targetSlot.id;
          } else if (!targetSlot) {
            next.hands[pl].push({ type: bt.tok.type, v: [...bt.tok.v], rot: bt.rot });
            next.board.splice(parsed.index, 1);
          }
        }
      } else if (parsed.source === 'supply') {
        // Place control marker — snap to province bonus field
        const supplyPl = parsed.pl ?? next.cp;
        if (next.mrem[supplyPl] > 0 && finalPos) {
          const prov = closestProvince(finalPos.x, finalPos.y);
          if (prov) {
            next.markers.push({ pl: supplyPl, x: prov.bx, y: prov.by, provId: prov.id });
            next.mrem[supplyPl]--;
          }
        }
      } else if (parsed.source === 'marker') {
        const m = next.markers[parsed.index];
        if (m && finalPos) {
          // Check if dropped back on own supply area — return to grid
          if (isInSupplyArea(finalPos.x, finalPos.y, m.pl)) {
            next.markers.splice(parsed.index, 1);
            next.mrem[m.pl]++;
          } else {
            // Reposition — snap to province bonus field
            const prov = closestProvince(finalPos.x, finalPos.y);
            if (prov) {
              m.x = prov.bx;
              m.y = prov.by;
              m.provId = prov.id;
            }
          }
        }
      } else if (parsed.source === 'bonus') {
        // Claim bonus token by dragging to either player's supply area
        if (finalPos) {
          for (const pi of [0, 1]) {
            if (isInSupplyArea(finalPos.x, finalPos.y, pi)) {
              const b = next.bonus[parsed.index];
              if (b && !b.claimed) {
                b.claimed = true;
                b.claimedBy = pi;
              }
              break;
            }
          }
        }
      } else if (parsed.source === 'claimed') {
        // Unclaim bonus token by dragging out of supply area
        if (finalPos) {
          const stillInSupply = [0, 1].some(pi => isInSupplyArea(finalPos.x, finalPos.y, pi));
          if (!stillInSupply) {
            const b = next.bonus[parsed.index];
            if (b) {
              b.claimed = false;
              delete b.claimedBy;
            }
          }
        }
      }

      return next;
    });
  }, [cp]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setDragPos(null);
  }, []);

  // ── Actions ──
  function draw() {
    setGame(prev => {
      const pl = prev.mode === 'solo' ? 0 : prev.cp;
      if (!prev.bags[pl].length) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      next.hands[pl].push({ ...next.bags[pl].pop(), rot: false, uid: uid() });
      return next;
    });
  }

  const [winner, setWinner] = useState(null);
  const [botCmd, setBotCmd] = useState(null); // brief popup: { draw, place, discard }
  const botRunning = useRef(false);

  const [extraTurnMsg, setExtraTurnMsg] = useState(false);
  const [mightSelect, setMightSelect] = useState(false); // waiting for player to pick opponent token
  const pendingEndTurn = useRef(null); // stored end-turn state while picking

  function endTurn() {
    const prev = game;
    const next = JSON.parse(JSON.stringify(prev));
    const pl = prev.mode === 'solo' ? 0 : prev.cp;

    // Auto-close provinces and claim bonuses
    const closed = checkAndCloseProvinces(next);
    const afterClose = closed !== next ? closed : next;

    // Check border domination (place markers on dominated borders)
    const afterBorder = checkBorderDomination(afterClose);
    const result = afterBorder !== afterClose ? afterBorder : afterClose;

    // Count newly claimed bonus effects for this player
    const newBonuses = result.bonus.filter((b, i) =>
      b.claimed && b.claimedBy === pl && !(prev.bonus[i]?.claimed)
    );
    const gotTactics = newBonuses.some(b => b.type === 'Tactics');
    const gotMight = newBonuses.some(b => b.type === 'Might');
    const wealthCount = newBonuses.filter(b => b.type === 'Wealth').length;

    // Auto-draw: 1 base + 1 per Wealth (amphora) bonus earned
    const drawCount = 1 + wealthCount;
    for (let i = 0; i < drawCount; i++) {
      if (result.bags[pl].length > 0) {
        result.hands[pl].push({ ...result.bags[pl].pop(), rot: false, uid: uid() });
      }
    }

    // Might bonus: let player pick an opponent's token to remove
    if (gotMight) {
      const opp = 1 - pl;
      const hasOppTokens = result.board.some(bt => bt.pl === opp);
      if (hasOppTokens) {
        result._pendingTactics = gotTactics; // remember if tactics also earned
        setGame(result);
        setMightSelect(true);
        return;
      }
    }

    finishEndTurn(result, pl, gotTactics);
  }

  function handleMightPick(boardIndex) {
    setMightSelect(false);
    const prev = game;
    const next = JSON.parse(JSON.stringify(prev));
    const pl = prev.mode === 'solo' ? 0 : prev.cp;
    const bt = next.board[boardIndex];
    if (!bt || bt.pl === pl) return;
    // Flip face down — influence becomes 0/0
    bt.flipped = true;
    const hadTactics = prev._pendingTactics;
    delete next._pendingTactics;
    setGame(next);
    setTimeout(() => finishEndTurn(next, pl, hadTactics), 100);
  }

  function handleMightPickMarker(markerIndex) {
    setMightSelect(false);
    const prev = game;
    const next = JSON.parse(JSON.stringify(prev));
    const pl = prev.mode === 'solo' ? 0 : prev.cp;
    const m = next.markers[markerIndex];
    if (!m || m.pl === pl) return;
    // Flip control marker — adjacent provinces don't grant extra markers
    m.flipped = true;
    const hadTactics = prev._pendingTactics;
    delete next._pendingTactics;
    setGame(next);
    setTimeout(() => finishEndTurn(next, pl, hadTactics), 100);
  }

  function finishEndTurn(result, pl, gotTactics) {
    if (gotTactics) {
      setGame(result);
      setExtraTurnMsg(true);
      setTimeout(() => setExtraTurnMsg(false), 2500);
      return;
    }

    const win = checkWinCondition(result);
    if (win) { setGame(result); setWinner(win.winner); return; }

    if (result.mode === 'solo') {
      if (botRunning.current) return;
      botRunning.current = true;
      setGame({ ...result, cp: 1 });
      setTimeout(() => runBotTurn(result), 600);
    } else {
      setGame(result);
      setShowOverlay(true);
    }
  }

  function confirmTurn() {
    setShowOverlay(false);
    setGame(prev => {
      const next = { ...prev, cp: 1 - prev.cp };
      // Auto-draw for next player if hand is empty
      if (next.hands[next.cp].length === 0 && next.bags[next.cp].length > 0) {
        const h = JSON.parse(JSON.stringify(next));
        h.hands[h.cp].push({ ...h.bags[h.cp].pop(), rot: false, uid: uid() });
        return h;
      }
      return next;
    });
  }

  function runBotTurn(prevGame) {
    const input = prevGame || game;
    const executor = input.difficulty === 'hard' ? smartExecuteBotTurn : executeBotTurn;
    const { game: nextGame, command } = executor({ ...input, cp: 1 });
    setGame(nextGame);
    botRunning.current = false;
    setBotCmd(command);
    setTimeout(() => setBotCmd(null), 3000);
    const win = checkWinCondition(nextGame);
    if (win) setWinner(win.winner);
  }

  function claimBonus(provId) {
    setGame(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const pl = prev.mode === 'solo' ? 0 : prev.cp;
      const b = next.bonus.find(b => b.province === provId && !b.claimed);
      if (b) { b.claimed = true; b.claimedBy = pl; }
      return next;
    });
  }

  function rotateToken(source, index) {
    // 180° rotate — shows the other value on top
    setGame(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const pl = prev.mode === 'solo' ? 0 : prev.cp;
      if (source === 'hand') {
        const t = next.hands[pl][index];
        if (t) t.rot = !t.rot;
      } else if (source === 'board') {
        const t = next.board[index];
        if (t && t.pl === pl) t.rot = !t.rot;
      }
      return next;
    });
    setRadialMenu(null);
  }

  function flipToken(source, index) {
    // Flip — show backside image
    setGame(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const pl = prev.mode === 'solo' ? 0 : prev.cp;
      if (source === 'hand') {
        const t = next.hands[pl][index];
        if (t) t.flipped = !t.flipped;
      } else if (source === 'board') {
        const t = next.board[index];
        if (t) t.flipped = !t.flipped;
      }
      return next;
    });
    setRadialMenu(null);
  }

  function showRadialMenu(e, source, index) {
    e.stopPropagation();
    const rect = boardWrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setRadialMenu({
      x: e.clientX,
      y: e.clientY,
      source,
      index,
    });
  }

  function undo() {
    setGame(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const pl = prev.mode === 'solo' ? 0 : prev.cp;
      for (let i = next.board.length - 1; i >= 0; i--) {
        if (next.board[i].pl === pl) {
          const bt = next.board[i];
          next.hands[pl].push({ type: bt.tok.type, v: [...bt.tok.v], rot: bt.rot });
          next.board.splice(i, 1);
          return next;
        }
      }
      return prev;
    });
  }

  function newGame(mode, difficulty) {
    setGame(freshGame(bonusAssign, mode || 'local', difficulty));
    setWinner(null);
  }

  function putBack() {
    // Return last hand token to the bag
    setGame(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const pl = prev.mode === 'solo' ? 0 : prev.cp;
      const hand = next.hands[pl];
      if (hand.length > 0) {
        const tok = hand.pop();
        next.bags[pl].push(tok);
      }
      return next;
    });
  }

  function exportState() {
    const g = game;
    const pNames = ['Caesar', 'Crassus'];
    const lines = [];
    lines.push(`=== Game State (${g.mode} mode, turn: ${pNames[g.cp]}) ===`);
    lines.push('');

    // Board plays in order
    lines.push('── Plays (in order) ──');
    g.board.forEach((bt, i) => {
      const slot = BORDER_SLOTS.find(s => s.id === bt.slotId);
      const provs = slot ? slot.p.join('/') : '?';
      const val = bt.rot ? `${bt.tok.v[1]}|${bt.tok.v[0]}` : `${bt.tok.v[0]}|${bt.tok.v[1]}`;
      lines.push(`${i + 1}. ${pNames[bt.pl]}: ${bt.tok.type} ${val} → slot ${bt.slotId} (${provs})`);
    });
    lines.push('');

    // Province status
    lines.push('── Provinces ──');
    for (const prov of PROVINCES) {
      if (prov.id === 'italia') continue;
      const inf = getProvinceInfluence(g.board, prov.id);
      const borders = getBordersForProvince(prov.id);
      const marker = g.markers.find(m => m.provId === prov.id);
      const status = marker ? `→ ${pNames[marker.pl]}` : inf.filled === inf.total ? 'CLOSED' : 'open';
      lines.push(`${prov.id}: ${inf[0]}v${inf[1]} (${inf.filled}/${inf.total} borders) ${status}`);
    }
    lines.push('');

    // Markers remaining
    lines.push('── Control Markers ──');
    lines.push(`Caesar: ${g.mrem[0]} remaining`);
    lines.push(`Crassus: ${g.mrem[1]} remaining`);
    lines.push('');

    // Hands
    for (let pl = 0; pl < 2; pl++) {
      const hand = g.hands[pl];
      if (hand.length > 0) {
        lines.push(`── ${pNames[pl]} Hand ──`);
        hand.forEach(t => {
          const val = t.rot ? `${t.v[1]}|${t.v[0]}` : `${t.v[0]}|${t.v[1]}`;
          lines.push(`  ${t.type} ${val}`);
        });
        lines.push('');
      }
    }

    // Bot token line
    if (g.solo?.tokenLine?.length > 0) {
      lines.push('── Crassus Token Line ──');
      g.solo.tokenLine.forEach(t => lines.push(`  ${t.type} ${t.v[0]}|${t.v[1]}`));
      lines.push('');
    }

    // Bags
    lines.push(`── Bags: Caesar ${g.bags[0].length}, Crassus ${g.bags[1].length} ──`);

    const text = lines.join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
    return text;
  }


  // ── Edit mode: direct drag on circles ──
  const editDragRef = useRef(null); // { type, id, startX, startY }
  const [editDragPos, setEditDragPos] = useState(null); // screen coords while dragging

  function handleEditCirclePointerDown(e, type, id) {
    e.stopPropagation();
    e.preventDefault();
    e.target.setPointerCapture?.(e.pointerId);
    editDragRef.current = { type, id, sx: e.clientX, sy: e.clientY, moved: false };
    setEditSelected({ type, id });
  }

  function handleEditPointerMove(e) {
    if (!editDragRef.current) return;
    const { sx, sy } = editDragRef.current;
    if (!editDragRef.current.moved && Math.hypot(e.clientX - sx, e.clientY - sy) < 6) return;
    editDragRef.current.moved = true;
    setEditDragPos({ x: e.clientX, y: e.clientY });
  }

  function handleEditPointerUp(e) {
    if (!editDragRef.current) return;
    const { type, id, moved } = editDragRef.current;
    if (moved && editDragPos) {
      const wrap = boardWrapRef.current;
      if (wrap) {
        const rect = wrap.getBoundingClientRect();
        const x = Math.round(((editDragPos.x - rect.left) / rect.width) * 423);
        const y = Math.round(((editDragPos.y - rect.top) / rect.height) * 549);
        const key = `${type}-${id}`;
        const prev = editOverrides[key] || {};
        const next = { ...editOverrides, [key]: { ...prev, x, y } };
        setEditOverrides(next);
        localStorage.setItem('caesar_overrides_v2', JSON.stringify(next));
      }
    }
    editDragRef.current = null;
    setEditDragPos(null);
  }


  function handleEditSelect(type, id) {
    if (!editMode) return;
    setEditSelected(editSelected?.type === type && editSelected?.id === id ? null : { type, id });
  }

  function editSetProp(prop, value) {
    if (!editSelected) return;
    const key = `${editSelected.type}-${editSelected.id}`;
    const prev = editOverrides[key] || {};
    const next = { ...editOverrides, [key]: { ...prev, [prop]: value } };
    setEditOverrides(next);
    localStorage.setItem('caesar_overrides_v2', JSON.stringify(next));
  }

  function editDelete() {
    if (!editSelected) return;
    const key = `${editSelected.type}-${editSelected.id}`;
    const next = { ...editOverrides, [key]: { ...(editOverrides[key] || {}), deleted: true } };
    setEditOverrides(next);
    localStorage.setItem('caesar_overrides_v2', JSON.stringify(next));
    setEditSelected(null);
  }

  // Get info about selected item
  function getSelectedInfo() {
    if (!editSelected) return null;
    const { type, id } = editSelected;
    if (type === 'border') {
      const b = BORDER_SLOTS.find(s => s.id === Number(id));
      return b ? { label: `Border ${id}: ${b.p.join(' — ')}`, slotType: b.type, borderP: b.p } : null;
    }
    if (type === 'bonus') {
      const assigned = bonusAssign[Number(id)] || '(none)';
      return { label: `Bonus #${id} → ${assigned}`, isBonus: true, bonusId: Number(id) };
    }
    if (type === 'supply') return { label: `Supply: ${id}` };
    return null;
  }

  // ── Border calibration ──
  function handleCalibClick(e) {
    if (!borderCalibrate) return;
    const wrap = boardWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 423);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 549);
    // If near an existing dot (hardcoded or user-added), treat as dot click
    const nearIdx = CALIB_DOTS.findIndex(d => Math.hypot(d.x - x, d.y - y) < 15);
    if (nearIdx >= 0) {
      handleCalibDotClick(nearIdx);
      return;
    }
    const nearExtra = calibDots.findIndex(d => Math.hypot(d.x - x, d.y - y) < 15);
    if (nearExtra >= 0) {
      handleCalibDotClick(CALIB_DOTS.length + nearExtra);
      return;
    }
    // Otherwise add a new dot — but not during connect/disconnect mode
    // (only add new dots when no dot is selected)
    if (calibDotSelect !== null) return;
    const next = [...calibDots, { x, y }];
    setCalibDots(next);
    localStorage.setItem('caesar_calib_dots', JSON.stringify(next));
  }

  function calibUndo() {
    const next = calibDots.slice(0, -1);
    setCalibDots(next);
    localStorage.setItem('caesar_calib_dots', JSON.stringify(next));
  }

  function calibExport() {
    const text = JSON.stringify(calibDots);
    navigator.clipboard?.writeText(text).catch(() => {});
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;color:#0f0;font:11px monospace;padding:10px;overflow:auto;white-space:pre-wrap;word-break:break-all;user-select:text;-webkit-user-select:text';
    div.textContent = text;
    const btn = document.createElement('button');
    btn.textContent = 'Close';
    btn.style.cssText = 'position:fixed;top:5px;right:5px;z-index:10000;padding:8px 16px;font-size:14px';
    btn.onclick = () => { div.remove(); btn.remove(); };
    document.body.appendChild(div);
    document.body.appendChild(btn);
  }

  function calibClear() {
    if (confirm('Clear all calibration dots?')) {
      setCalibDots([]);
      localStorage.removeItem('caesar_calib_dots');
    }
  }

  function handleCalibDotClick(dotIndex) {
    if (calibDotSelect === null) {
      // First dot selected
      setCalibDotSelect(dotIndex);
    } else {
      // Second dot — toggle edge
      const a = Math.min(calibDotSelect, dotIndex);
      const b = Math.max(calibDotSelect, dotIndex);
      if (a === b) { setCalibDotSelect(null); return; }

      setCalibEdges(prev => {
        // Get current edges (from state or defaults)
        const current = prev || DEFAULT_CALIB_EDGES;
        const exists = current.some(e => e[0] === a && e[1] === b);
        let next;
        if (exists) {
          next = current.filter(e => !(e[0] === a && e[1] === b));
        } else {
          next = [...current, [a, b]];
        }
        localStorage.setItem('caesar_calib_edges', JSON.stringify(next));
        return next;
      });
      setCalibDotSelect(null);
    }
  }

  function exportOverrides() {
    const text = JSON.stringify(editOverrides);
    // Show in a full-screen selectable div
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;color:#0f0;font:11px monospace;padding:10px;overflow:auto;white-space:pre-wrap;word-break:break-all;user-select:text;-webkit-user-select:text';
    div.textContent = text;
    const btn = document.createElement('button');
    btn.textContent = 'Close';
    btn.style.cssText = 'position:fixed;top:5px;right:5px;z-index:10000;padding:8px 16px;font-size:14px';
    btn.onclick = () => { div.remove(); btn.remove(); };
    document.body.appendChild(div);
    document.body.appendChild(btn);
  }

  // ── Magnifier ──

  function renderMagnifier() {
    const dp = dragPos || editDragPos;
    if (!dp) return null;
    const wrap = boardWrapRef.current;
    if (!wrap) return null;
    const tok = getActiveToken();
    const isToken = tok && !tok.isMarker && !tok.isBonus;
    const loupeSize = 120;
    const zoom = 2.5;

    // Position: desktop = at cursor, mobile = above/below finger
    let loupeX, loupeY;
    if (!isTouchDevice) {
      loupeX = dp.x - loupeSize / 2;
      loupeY = dp.y - loupeSize / 2;
    } else {
      // dp.y is already shifted by DRAG_Y_OFFSET (-80px above finger)
      const fingerY = dp.y - DRAG_Y_OFFSET; // actual finger position
      const screenMid = window.innerHeight / 2;
      loupeX = dp.x - loupeSize / 2;
      loupeY = fingerY > screenMid ? fingerY - loupeSize - 100 : fingerY + 40;
    }
    loupeX = Math.max(4, Math.min(window.innerWidth - loupeSize - 4, loupeX));
    loupeY = Math.max(4, Math.min(window.innerHeight - loupeSize - 4, loupeY));

    const rect = wrap.getBoundingClientRect();
    const relX = (dp.x - rect.left) / rect.width;
    const relY = (dp.y - rect.top) / rect.height;
    // Position the cloned board so the drag point is centered in the loupe
    const cloneLeft = -relX * rect.width * zoom + loupeSize / 2;
    const cloneTop = -relY * rect.height * zoom + loupeSize / 2;

    const tokData = isToken ? (tok.tok || tok) : null;
    const tokRot = isToken ? (tok.rot ?? false) : false;
    const tokPl = tok?.pl ?? cp;

    // Background position: center the drag point in the loupe
    const bgWidth = rect.width * zoom;
    const bgHeight = rect.height * zoom;
    const bgX = -relX * bgWidth + loupeSize / 2;
    const bgY = -relY * bgHeight + loupeSize / 2;

    // Render placed tokens at zoomed positions relative to loupe
    const tokenSize = 34 * zoom / (rect.width / 423); // scale token size to match zoom
    const boardTokens = board.map((bt, i) => {
      const slot = BORDER_SLOTS.find(s => s.id === bt.slotId);
      if (!slot) return null;
      const ov = editOverrides[`border-${slot.id}`];
      const sx = ov?.x ?? slot.x;
      const sy = ov?.y ?? slot.y;
      // Position in loupe coordinates
      const tx = (sx / 423) * bgWidth + bgX;
      const ty = (sy / 549) * bgHeight + bgY;
      const angle = (slot.angle || 0) - 90 + (bt.rot ? 180 : 0);
      return (
        <img key={`mag-bt-${i}`} src={bt.flipped ? `/tokens/${bt.pl === 0 ? 'red' : 'pur'}_back.png` : tokenImage(bt.tok.type, bt.tok.v, bt.pl)}
          style={{
            position: 'absolute',
            left: tx - tokenSize / 2, top: ty - tokenSize / 2,
            width: tokenSize, height: tokenSize,
            transform: `rotate(${angle}deg)`,
            pointerEvents: 'none',
          }} draggable={false} />
      );
    });

    // Render control markers at zoomed positions
    const markerTokens = markers.map((m, i) => {
      const mx = (m.x / 423) * bgWidth + bgX;
      const my = (m.y / 549) * bgHeight + bgY;
      return (
        <img key={`mag-mk-${i}`} src={m.pl === 0 ? '/tokens/caesar_marker.png' : '/tokens/pompey_marker.png'}
          style={{
            position: 'absolute',
            left: mx - tokenSize / 2, top: my - tokenSize / 2,
            width: tokenSize, height: tokenSize,
            pointerEvents: 'none',
          }} draggable={false} />
      );
    });

    return (
      <div className="magnifier" style={{
        left: loupeX, top: loupeY,
        width: loupeSize, height: loupeSize,
        overflow: 'hidden',
        backgroundImage: 'url(/caesar-board.jpg)',
        backgroundSize: `${bgWidth}px ${bgHeight}px`,
        backgroundPosition: `${bgX}px ${bgY}px`,
        backgroundRepeat: 'no-repeat',
      }}>
        {boardTokens}
        {markerTokens}
        {/* Trash icon in magnifier */}
        {(() => {
          const trashX = (260 / 423) * bgWidth + bgX;
          const trashY = (500 / 549) * bgHeight + bgY;
          const trashSize = 36 * zoom / (rect.width / 423);
          return (
            <div style={{
              position: 'absolute', left: trashX - trashSize / 2, top: trashY - trashSize / 2,
              width: trashSize, height: trashSize, borderRadius: '50%',
              background: 'rgba(0,0,0,0.6)', border: '2px solid rgba(255,215,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: trashSize * 0.5, pointerEvents: 'none',
            }}>🗑</div>
          );
        })()}
        {/* Dragged token in center */}
        {isToken && (
          <div className={`magnifier-token p${tokPl}`} style={{ transform: tokRot ? 'rotate(180deg)' : undefined }}>
            <img src={tokenImage(tokData.type, tokData.v, tokPl)} className="token-img" draggable={false} />
          </div>
        )}
        {tok?.isMarker && (
          <div className={`magnifier-token p${cp}`}>
            <span style={{ color: '#c9a84c', fontWeight: 'bold', fontSize: 14 }}>M</span>
          </div>
        )}
        <div className="magnifier-crosshair" />
      </div>
    );
  }


  // ── Render ──
  const isDragging = activeId !== null;
  const activeToken = getActiveToken();
  const occupiedSlotIds = board.map(b => b.slotId);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="app">
        {/* Board */}
        <div className="board-container">
          <div className="board-wrap" ref={boardWrapRef}
            onPointerMove={editMode ? handleEditPointerMove : undefined}
            onPointerUp={editMode ? handleEditPointerUp : undefined}
            onClick={borderCalibrate ? handleCalibClick : undefined}
            style={editMode || borderCalibrate ? {touchAction:'none'} : undefined}>
            <BoardSVG occupiedSlotIds={occupiedSlotIds} isDragging={isDragging} game={game} onClaimBonus={claimBonus}
              editMode={editMode} editSelected={editSelected} editOverrides={editOverrides}
              onEditSelect={handleEditSelect} showBorders={borderCalibrate}
              calibEdges={calibEdges} calibDotSelected={calibDotSelect}
              onCalibDotClick={borderCalibrate ? handleCalibDotClick : undefined}
              extraDots={borderCalibrate ? calibDots : undefined} />

            {/* Interactive HTML overlay */}
            <div className="board-overlay">
              {/* Bot token line — overlay on Pompey supply area */}
              {game.mode === 'solo' && game.solo?.tokenLine?.length > 0 && (
                <div style={{
                  position: 'absolute', bottom: 0, right: 0,
                  display: 'flex', flexWrap: 'wrap', gap: 2,
                  padding: 4, maxWidth: '45%',
                  pointerEvents: 'none', zIndex: 8,
                  justifyContent: 'flex-end',
                }}>
                  {game.solo.tokenLine.map((t, i) => (
                    <div key={`bot-${i}`} style={{
                      width: 28, height: 28, borderRadius: '50%', overflow: 'hidden',
                      border: '1px solid #5577BB',
                    }}>
                      <img src={tokenImage(t.type, t.v, 1)} className="token-img" draggable={false} />
                    </div>
                  ))}
                </div>
              )}

              {/* Bot thinking indicator */}
              {game.mode === 'solo' && cp === 1 && !winner && (
                <div style={{
                  position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(26,18,8,0.9)', border: '1px solid #5577BB', borderRadius: 6,
                  padding: '4px 12px', color: '#5577BB', fontSize: 12, fontFamily: 'Georgia, serif',
                  zIndex: 25, pointerEvents: 'none',
                }}>
                  Crassus is thinking{game.difficulty === 'hard' ? ' hard' : ''}...
                </div>
              )}

              {/* Bot command popup */}
              {botCmd && game.mode === 'solo' && cp === 0 && (
                <div style={{
                  position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(26,18,8,0.9)', border: '1px solid #5577BB', borderRadius: 6,
                  padding: '4px 12px', color: '#c9a84c', fontSize: 11, fontFamily: 'Georgia, serif',
                  zIndex: 25, pointerEvents: 'none', whiteSpace: 'nowrap',
                }}>
                  Crassus: drew {botCmd.draw}, placed {botCmd.place}, discarded {botCmd.discard}
                </div>
              )}

              {/* Might selection prompt */}
              {mightSelect && (
                <div style={{
                  position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(26,18,8,0.95)', border: '1px solid #e54', borderRadius: 6,
                  padding: '6px 14px', color: '#e54', fontSize: 12, fontFamily: 'Georgia, serif',
                  zIndex: 35, whiteSpace: 'nowrap',
                }}>
                  Might! Tap opponent's token or marker to flip
                </div>
              )}

              {/* Extra turn notification */}
              {extraTurnMsg && (
                <div style={{
                  position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                  background: 'rgba(26,18,8,0.9)', border: '1px solid #c9a84c', borderRadius: 6,
                  padding: '4px 12px', color: '#c9a84c', fontSize: 12, fontFamily: 'Georgia, serif',
                  zIndex: 25, pointerEvents: 'none', whiteSpace: 'nowrap',
                }}>
                  Tactics! Take another turn
                </div>
              )}

              {/* Trash zone — on border to asia/supply area, visible when dragging */}
              {isDragging && (() => {
                const tp = svgToPercent(260, 500);
                return (
                  <div style={{
                    position: 'absolute',
                    left: `${tp.left}%`, top: `${tp.top}%`,
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none', zIndex: 25,
                    fontSize: 24, opacity: 0.8,
                  }}>
                    <div style={{
                      background: 'rgba(0,0,0,0.6)',
                      borderRadius: '50%',
                      width: 36, height: 36,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '2px solid rgba(255,215,0,0.5)',
                    }}>
                      🗑
                    </div>
                  </div>
                );
              })()}

              {/* Top-right area — tap to open menu */}
              {!editMode && !borderCalibrate && (
                <div
                  onClick={() => setMainMenu(m => !m)}
                  style={{
                    position: 'absolute',
                    right: 0, top: 0,
                    width: `${(100/423)*100}%`,
                    height: `${(80/549)*100}%`,
                    cursor: 'pointer',
                    pointerEvents: 'all',
                    zIndex: 20,
                  }}
                />
              )}

              {/* Placed tokens on board */}
              {!editMode && board.map((bt, i) => {
                const slot = BORDER_SLOTS.find(s => s.id === bt.slotId);
                if (!slot) return null;
                const ov = editOverrides[`border-${slot.id}`];
                const sx = ov?.x ?? slot.x;
                const sy = ov?.y ?? slot.y;
                const pos = svgToPercent(sx, sy);
                const isMine = bt.pl === cp;
                const isOpp = !isMine;
                const mightTarget = mightSelect && isOpp;
                // Calibrated angle: perpendicular to border, pointing toward p[0]
                // Subtract 90 because token "top" starts at CSS up (-90° from x-axis)
                const angle = (slot.angle || 0) - 90;
                const flipAngle = bt.rot ? 180 : 0;
                const rotOffset = bt.rotAngle || 0;
                return (
                  <DraggableDiv key={`board-${i}`} id={`board-${i}`} style={{
                    position: 'absolute',
                    left: `${pos.left}%`, top: `${pos.top}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: mightTarget ? 30 : 5,
                    pointerEvents: mightSelect ? (mightTarget ? 'all' : 'none') : 'all',
                  }}>
                    <div
                      className={`board-token p${bt.pl}`}
                      style={{
                        width: 34, height: 34,
                        transform: `rotate(${angle + flipAngle + rotOffset}deg)`,
                        boxShadow: mightTarget ? '0 0 8px 3px rgba(255,0,0,0.8)' : undefined,
                        borderRadius: '50%',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (mightSelect && isOpp) {
                          handleMightPick(i);
                        } else {
                          showRadialMenu(e, 'board', i);
                        }
                      }}
                    >
                      <img src={bt.flipped ? `/tokens/${bt.pl === 0 ? 'red' : 'pur'}_back.png` : tokenImage(bt.tok.type, bt.tok.v, bt.pl)} className="token-img" draggable={false} />
                    </div>
                  </DraggableDiv>
                );
              })}

              {/* Draggable control markers on board */}
              {!editMode && markers.map((m, i) => {
                const pos = svgToPercent(m.x, m.y);
                const markerImg = m.pl === 0 ? '/tokens/caesar_marker.png' : '/tokens/pompey_marker.png';
                const isOppMarker = m.pl !== (game.mode === 'solo' ? 0 : cp);
                const mightTarget = mightSelect && isOppMarker && !m.flipped;
                return (
                  <DraggableDiv key={`marker-${i}`} id={`marker-${i}`} style={{
                    position: 'absolute',
                    left: `${pos.left}%`, top: `${pos.top}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: mightTarget ? 30 : 6,
                    pointerEvents: mightSelect ? (mightTarget ? 'all' : 'none') : undefined,
                  }}>
                    <div className="board-token" style={{
                      width: 34, height: 34,
                      opacity: m.flipped ? 0.4 : 1,
                      boxShadow: mightTarget ? '0 0 8px 3px rgba(255,0,0,0.8)' : undefined,
                      borderRadius: '50%',
                    }}
                      onClick={mightTarget ? (e) => { e.stopPropagation(); handleMightPickMarker(i); } : undefined}
                    >
                      <img src={markerImg} className="token-img" draggable={false} />
                    </div>
                  </DraggableDiv>
                );
              })}

              {/* Calibration dots removed — now rendered in SVG via BoardSVG */}
              {false && calibDots.map((d, i) => {
              })}

              {/* Edit mode: draggable border + bonus circles */}
              {editMode && BORDER_SLOTS.map(slot => {
                if (editOverrides[`border-${slot.id}`]?.deleted) return null;
                const ov = editOverrides[`border-${slot.id}`];
                const sx = ov?.x ?? slot.x;
                const sy = ov?.y ?? slot.y;
                const isDraggingThis = editDragRef.current?.type === 'border' && editDragRef.current?.id === slot.id && editDragRef.current?.moved;
                const p = isDraggingThis && editDragPos
                  ? (() => { const r = boardWrapRef.current?.getBoundingClientRect(); return r ? svgToPercent(Math.round(((editDragPos.x - r.left) / r.width) * 423), Math.round(((editDragPos.y - r.top) / r.height) * 549)) : svgToPercent(sx, sy); })()
                  : svgToPercent(sx, sy);
                const sel = editSelected?.type === 'border' && editSelected?.id === slot.id;
                return (
                  <div key={`edit-border-${slot.id}`}
                    onPointerDown={(e) => handleEditCirclePointerDown(e, 'border', slot.id)}
                    style={{
                      position: 'absolute',
                      left: `${p.left}%`, top: `${p.top}%`,
                      transform: 'translate(-50%, -50%)',
                      width: 32, height: 32,
                      borderRadius: '50%',
                      background: sel ? 'rgba(255,0,0,0.4)' : 'rgba(201,168,76,0.15)',
                      border: `2.5px solid ${sel ? '#ff0000' : '#c9a84c'}`,
                      cursor: 'grab',
                      zIndex: isDraggingThis ? 50 : 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 'bold', color: '#fff',
                      textShadow: '0 0 3px #000, 0 0 3px #000',
                      pointerEvents: 'all', touchAction: 'none',
                    }}>
                    {slot.id}
                  </div>
                );
              })}
              {editMode && BONUS_FIELDS.map(bf => {
                const bid = String(bf.id);
                if (editOverrides[`bonus-${bid}`]?.deleted) return null;
                const ov = editOverrides[`bonus-${bid}`];
                const sx = ov?.x ?? bf.x;
                const sy = ov?.y ?? bf.y;
                const isDraggingThis = editDragRef.current?.type === 'bonus' && editDragRef.current?.id === bid && editDragRef.current?.moved;
                const p = isDraggingThis && editDragPos
                  ? (() => { const r = boardWrapRef.current?.getBoundingClientRect(); return r ? svgToPercent(Math.round(((editDragPos.x - r.left) / r.width) * 423), Math.round(((editDragPos.y - r.top) / r.height) * 549)) : svgToPercent(sx, sy); })()
                  : svgToPercent(sx, sy);
                const sel = editSelected?.type === 'bonus' && editSelected?.id === bid;
                return (
                  <div key={`edit-bonus-${bid}`}
                    onPointerDown={(e) => handleEditCirclePointerDown(e, 'bonus', bid)}
                    style={{
                      position: 'absolute',
                      left: `${p.left}%`, top: `${p.top}%`,
                      transform: 'translate(-50%, -50%)',
                      width: 32, height: 32,
                      borderRadius: '50%',
                      background: sel ? 'rgba(255,0,0,0.4)' : 'rgba(201,168,76,0.15)',
                      border: `1.5px solid ${sel ? '#ff0000' : '#c9a84c'}`,
                      cursor: 'grab',
                      zIndex: isDraggingThis ? 50 : 10,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 'bold',
                      color: '#ff0', textShadow: '0 0 3px #000, 0 0 3px #000',
                      pointerEvents: 'all', touchAction: 'none',
                    }}>
                    {bf.id}
                  </div>
                );
              })}

              {/* Draggable supply control markers — both players */}
              {!editMode && [0, 1].map(pi => SUPPLY_AREAS[pi].tokens.map((s, i) => {
                if (i >= mrem[pi]) return null;
                const pos = svgToPercent(s.x, s.y);
                const markerImg = pi === 0 ? '/tokens/caesar_marker.png' : '/tokens/pompey_marker.png';
                return (
                  <DraggableDiv key={`supply-${pi}-${i}`} id={`supply-${pi}-${i}`} style={{
                    position: 'absolute',
                    left: `${pos.left}%`, top: `${pos.top}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 3,
                  }}>
                    <div className="board-token" style={{ width: 34, height: 34 }}>
                      <img src={markerImg} className="token-img" draggable={false} />
                    </div>
                  </DraggableDiv>
                );
              }))}

              {/* Draggable bonus tokens on provinces */}
              {!editMode && bonus.map((b, i) => {
                if (b.claimed) return null;
                const bf = BONUS_FIELDS[i];
                if (!bf) return null;
                const ov = editOverrides[`bonus-${bf.id}`];
                const px = ov?.x ?? bf.x;
                const py = ov?.y ?? bf.y;
                const pos = svgToPercent(px, py);
                const bonusImg = BONUS_IMAGES[b.type];
                return (
                  <DraggableDiv key={`bonus-${i}`} id={`bonus-${i}`} style={{
                    position: 'absolute',
                    left: `${pos.left}%`, top: `${pos.top}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 4,
                  }}>
                    <div className="board-token" style={{ width: 32, height: 32 }}>
                      <img src={bonusImg} className="token-img" draggable={false} />
                    </div>
                  </DraggableDiv>
                );
              })}

              {/* Draggable claimed bonus tokens in supply areas */}
              {!editMode && [0, 1].map(pi => {
                const claimed = bonus.map((b, i) => ({ ...b, idx: i }))
                  .filter(b => b.claimed && b.claimedBy === pi);
                const senateClaimed = claimed.filter(b => b.type === 'Senate');
                const otherClaimed = claimed.filter(b => b.type !== 'Senate');
                const senateCol = SUPPLY_AREAS[pi].senate;
                const baseX = senateCol[0]?.x ?? (pi === 0 ? 99 : 323);

                return [
                  ...senateClaimed.map((b, si) => {
                    if (si >= senateCol.length) return null;
                    const pos = svgToPercent(senateCol[si].x, senateCol[si].y);
                    return (
                      <DraggableDiv key={`claimed-${pi}-${b.idx}`} id={`claimed-${pi}-${b.idx}`} style={{
                        position: 'absolute',
                        left: `${pos.left}%`, top: `${pos.top}%`,
                        transform: 'translate(-50%, -50%)',
                        zIndex: 4,
                      }}>
                        <div className="board-token" style={{ width: 30, height: 30 }}>
                          <img src={BONUS_IMAGES.Senate} className="token-img" draggable={false} />
                        </div>
                      </DraggableDiv>
                    );
                  }),
                  ...otherClaimed.map((b, oi) => {
                    const startY = pi === 0
                      ? (senateCol[senateCol.length - 1]?.y ?? 124) + 28
                      : (senateCol[0]?.y ?? 422) - 28;
                    const step = pi === 0 ? 16 : -16;
                    const cy = startY + oi * step;
                    const pos = svgToPercent(baseX, cy);
                    const bonusImg = BONUS_IMAGES[b.type];
                    return (
                      <DraggableDiv key={`claimed-${pi}-${b.idx}`} id={`claimed-${pi}-${b.idx}`} style={{
                        position: 'absolute',
                        left: `${pos.left}%`, top: `${pos.top}%`,
                        transform: 'translate(-50%, -50%)',
                        zIndex: 4,
                      }}>
                        <div className="board-token" style={{ width: 30, height: 30 }}>
                          {bonusImg && <img src={bonusImg} className="token-img" draggable={false} />}
                        </div>
                      </DraggableDiv>
                    );
                  }),
                ];
              })}
            </div>
          </div>
        </div>

        {/* Main menu */}
        {mainMenu && (
          <div className="main-menu-backdrop" onClick={() => setMainMenu(false)}>
            <div className="main-menu" onClick={e => e.stopPropagation()}>
              <button onClick={() => { setEditMode(true); setEditSelected(null); setMainMenu(false); }}>
                Calibration
              </button>
              <button onClick={() => { newGame('solo', 'normal'); setMainMenu(false); }}>
                Solo (Normal)
              </button>
              <button onClick={() => { newGame('solo', 'hard'); setMainMenu(false); }}>
                Solo (Hard)
              </button>
              <button onClick={() => { newGame('local'); setMainMenu(false); }}>
                2 Player
              </button>
              <button onClick={() => {
                const data = JSON.stringify(game);
                navigator.clipboard?.writeText(data).catch(() => {});
                alert('Game saved to clipboard');
                setMainMenu(false);
              }}>
                Save
              </button>
              <button onClick={() => {
                const data = prompt('Paste saved game:');
                if (data) try { setGame(JSON.parse(data)); setMainMenu(false); } catch { alert('Invalid data'); }
              }}>
                Load
              </button>
              <button onClick={() => {
                const text = exportState();
                alert(text);
                setMainMenu(false);
              }}>
                Export
              </button>
            </div>
          </div>
        )}

        {/* Hand panel / Edit panel */}
        <div className="hand-panel">
          {borderCalibrate ? (
            <>
              <div style={{fontSize:11,color:'#ff0',padding:8,textAlign:'center'}}>
                {calibDotSelect !== null
                  ? `Tap second dot to connect/disconnect from ${calibDotSelect}`
                  : 'Tap a dot to select, then another to toggle edge'}
              </div>
              <div className="actions">
                {calibDotSelect !== null && (
                  <>
                    <button className="btn" onClick={() => setCalibDotSelect(null)}>Cancel</button>
                    <button className="btn" style={{background:'#8b1a1a'}} onClick={() => {
                      // Delete all edges connected to selected dot
                      const current = calibEdges || DEFAULT_CALIB_EDGES;
                      const next = current.filter(([a, b]) => a !== calibDotSelect && b !== calibDotSelect);
                      setCalibEdges(next);
                      localStorage.setItem('caesar_calib_edges', JSON.stringify(next));
                      setCalibDotSelect(null);
                    }}>Delete</button>
                  </>
                )}
                <button className="btn" onClick={() => {
                  const edges = calibEdges || DEFAULT_CALIB_EDGES;
                  navigator.clipboard?.writeText(JSON.stringify(edges)).catch(() => {});
                  alert('Edges copied');
                }}>Copy</button>
                <button className="btn" onClick={() => { setBorderCalibrate(false); setCalibDotSelect(null); }}
                  style={{background:'#c9a84c',color:'#2b1810'}}>Done</button>
              </div>
            </>
          ) : editMode && editSelected ? (() => {
            const info = getSelectedInfo();
            const key = `${editSelected.type}-${editSelected.id}`;
            const ov = editOverrides[key] || {};
            return (
              <div style={{padding:'4px 0'}}>
                <div style={{fontSize:11,color:'#c9a84c',marginBottom:4}}>
                  {info?.label || `${editSelected.type} ${editSelected.id}`}
                </div>
                {editSelected.type === 'border' && (
                  <div style={{display:'flex',gap:4,marginBottom:4}}>
                    <span style={{fontSize:10,color:'#999',alignSelf:'center'}}>Type:</span>
                    {['sword','shield','ship'].map(t => (
                      <button key={t} className="btn" style={{
                        flex:'none',width:60,minHeight:30,fontSize:10,
                        background: (ov.slotType || info?.slotType) === t ? '#c9a84c' : undefined,
                        color: (ov.slotType || info?.slotType) === t ? '#2b1810' : undefined,
                      }} onClick={() => editSetProp('slotType', t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {editSelected.type === 'border' && (
                  <div style={{display:'flex',gap:4,marginBottom:4,flexWrap:'wrap'}}>
                    <span style={{fontSize:10,color:'#999',alignSelf:'center'}}>Border:</span>
                    <select style={{flex:1,fontSize:10,background:'#2b1810',color:'#f5f0e8',border:'1px solid #c9a84c',borderRadius:4,padding:2}}
                      value={ov.p0 || info?.borderP?.[0] || ''}
                      onChange={e => editSetProp('p0', e.target.value)}>
                      {PROVINCES.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                    </select>
                    <span style={{color:'#999'}}>—</span>
                    <select style={{flex:1,fontSize:10,background:'#2b1810',color:'#f5f0e8',border:'1px solid #c9a84c',borderRadius:4,padding:2}}
                      value={ov.p1 || info?.borderP?.[1] || ''}
                      onChange={e => editSetProp('p1', e.target.value)}>
                      {PROVINCES.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                    </select>
                  </div>
                )}
                {editSelected.type === 'bonus' && (
                  <div style={{display:'flex',gap:4,marginBottom:4}}>
                    <span style={{fontSize:10,color:'#999',alignSelf:'center'}}>Province:</span>
                    <select style={{flex:1,fontSize:10,background:'#2b1810',color:'#f5f0e8',border:'1px solid #c9a84c',borderRadius:4,padding:2}}
                      value={bonusAssign[Number(editSelected.id)] || ''}
                      onChange={e => {
                        const next = { ...bonusAssign, [Number(editSelected.id)]: e.target.value };
                        setBonusAssign(next);
                      }}>
                      <option value="">(none)</option>
                      {BONUS_PROVINCE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                )}
                <div style={{display:'flex',gap:4}}>
                  <button className="btn" style={{flex:1,minHeight:30,fontSize:10,background:'#8b1a1a'}}
                    onClick={editDelete}>Delete</button>
                  <button className="btn" style={{flex:1,minHeight:30,fontSize:10}}
                    onClick={() => setEditSelected(null)}>Deselect</button>
                </div>
              </div>
            );
          })() : editMode ? (
            <>
              <div style={{fontSize:11,color:'#999',padding:8,textAlign:'center'}}>
                Drag circles to reposition. Tap to select &amp; edit properties.
              </div>
              <div className="actions">
                <button className="btn" style={{background:'#c9a84c',color:'#2b1810'}}
                  onClick={() => setEditMode(false)}>Done</button>
                <button className="btn" onClick={exportOverrides}>Copy</button>
                <button className="btn" onClick={() => {
                  if (confirm('Reset all calibration overrides?')) {
                    setEditOverrides({});
                    localStorage.removeItem('caesar_overrides_v2');
                  }
                }}>Reset</button>
                <button className="btn" onClick={() => { setEditMode(false); setBorderCalibrate(true); }}>Borders</button>
              </div>
            </>
          ) : (
            <div className="hand-row">
              <div className="hand-tokens">
                {hands[hp].map((t, i) => {
                  const draggingThis = activeId === `hand-${i}`;
                  return (
                    <DraggableDiv key={`hand-${t.uid || i}`} id={`hand-${i}`} style={{ display: 'contents' }}>
                      <div
                        className={`hand-token p${hp} ${draggingThis ? 'dragging' : ''}`}
                        onClick={(e) => showRadialMenu(e, 'hand', i)}
                        style={{ transform: t.rot ? 'rotate(180deg)' : undefined }}
                      >
                        <img src={t.flipped ? `/tokens/${hp === 0 ? 'red' : 'pur'}_back.png` : tokenImage(t.type, t.v, hp)} className="token-img" draggable={false} />
                      </div>
                    </DraggableDiv>
                  );
                })}
              </div>
              <div className="hand-buttons">
                <button className="btn" onClick={endTurn}
                  disabled={game.mode === 'solo' && cp === 1}>
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Turn overlay */}
        {showOverlay && game.mode !== 'solo' && (
          <div className="turn-overlay" onClick={confirmTurn}>
            <h2>Pass device to {PLAYERS[1 - cp].name}</h2>
            <p>Tap when ready</p>
          </div>
        )}

        {/* Winner overlay */}
        {winner !== null && (
          <div className="turn-overlay" onClick={() => setWinner(null)}>
            <h2 style={{ color: winner === 0 ? '#E93034' : '#5577BB' }}>
              {PLAYERS[winner].name} Wins!
            </h2>
            <p>Tap to dismiss</p>
          </div>
        )}


        {/* Drag overlay */}
        <DragOverlay dropAnimation={null}>
          {activeToken && !activeToken.isMarker && !activeToken.isBonus && (() => {
            const tok = activeToken.tok || activeToken;
            const rot = activeToken.rot ?? false;
            const flipped = activeToken.flipped ?? false;
            const pl = activeToken.pl ?? cp;
            const imgSrc = flipped ? `/tokens/${pl === 0 ? 'red' : 'pur'}_back.png` : tokenImage(tok.type, tok.v, pl);
            return (
              <div className="drag-token" style={{ transform: rot ? 'rotate(180deg)' : undefined }}>
                <img src={imgSrc} className="token-img" draggable={false} />
              </div>
            );
          })()}
          {activeToken?.isMarker && (() => {
            const pl = activeToken.pl ?? cp;
            return (
              <div className="drag-token" style={{ width: 32, height: 32 }}>
                <img src={pl === 0 ? '/tokens/caesar_marker.png' : '/tokens/pompey_marker.png'}
                  className="token-img" draggable={false} />
              </div>
            );
          })()}
          {activeToken?.isBonus && (() => {
            const b = bonus[activeToken.index];
            const img = b ? BONUS_IMAGES[b.type] : null;
            return img ? (
              <div className="drag-token" style={{ width: 36, height: 36 }}>
                <img src={img} className="token-img" draggable={false} />
              </div>
            ) : null;
          })()}
        </DragOverlay>

        {/* Radial menu */}
        {radialMenu && (
          <div className="radial-backdrop" onClick={() => setRadialMenu(null)}>
            <div className="radial-menu" style={{ left: radialMenu.x, top: radialMenu.y }}
              onClick={e => e.stopPropagation()}>
              <button className="radial-btn" style={{ transform: 'translate(-60px, -20px)' }}
                onClick={() => rotateToken(radialMenu.source, radialMenu.index)}>
                &#x21BB;
              </button>
              <button className="radial-btn" style={{ transform: 'translate(20px, -20px)' }}
                onClick={() => flipToken(radialMenu.source, radialMenu.index)}>
                &#x21C5;
              </button>
            </div>
          </div>
        )}

        {isDragging && renderMagnifier()}
      </div>
    </DndContext>
  );
}
