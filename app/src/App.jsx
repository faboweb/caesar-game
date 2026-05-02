import { useState, useCallback, useRef, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { SLOTS, PROVS, MARKER_SUPPLY, PLAYERS, TYPE_ICONS, BONUS_ICONS, createTokenSet, shuffle } from './gameData';
import './App.css';

// ── Draggable hook (lightweight, no @dnd-kit/sortable needed) ──
function useDraggable(id) {
  return {
    attributes: { role: 'button', tabIndex: 0, 'data-draggable-id': id },
    listeners: {}, // dnd-kit handles via DndContext
    setNodeRef: () => {},
  };
}

// ── Helpers ──
function freshGame() {
  const bonusTypes = shuffle(['Tactics','Wealth','Might','Tactics','Wealth','Might',
    'Tactics','Wealth','Might','Wealth','Might','Tactics','Might']);
  const bonus = PROVS.map((_, i) => {
    if (i === 8) return { type: 'Senate', pi: i, claimed: false };
    return bonusTypes.length ? { type: bonusTypes.pop(), pi: i, claimed: false } : null;
  }).filter(Boolean);

  return {
    cp: 0,
    bags: [shuffle(createTokenSet()), shuffle(createTokenSet())],
    hands: [[], []],
    board: [],
    markers: [],
    bonus,
    mrem: [12, 12],
  };
}

let idCounter = 0;
function uid() { return ++idCounter; }

function tokenId(source, index) { return `${source}-${index}`; }

// ── Token rendering ──
function TokenFace({ v, rotated, fontSize = 18 }) {
  const vals = rotated ? [v[1], v[0]] : v;
  return (
    <div className="token-inner">
      <div className="tv tv-l" style={{ fontSize }}>{vals[0]}</div>
      <div className="tv" style={{ fontSize }}>{vals[1]}</div>
    </div>
  );
}

// ── Main App ──
export default function App() {
  const [game, setGame] = useState(() => {
    const saved = localStorage.getItem('caesar_react_auto');
    if (saved) try { return JSON.parse(saved); } catch {}
    return freshGame();
  });
  const [showOverlay, setShowOverlay] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [dragPos, setDragPos] = useState(null);
  const boardWrapRef = useRef(null);
  const boardImgRef = useRef(null);
  const canvasRef = useRef(null);

  // Autosave
  useEffect(() => {
    localStorage.setItem('caesar_react_auto', JSON.stringify(game));
  }, [game]);

  // Draw board to hidden canvas for magnifier
  useEffect(() => {
    const img = boardImgRef.current;
    if (!img) return;
    const setup = () => {
      const canvas = canvasRef.current;
      if (!canvas || !img.naturalWidth) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
    };
    if (img.complete) setup();
    else img.addEventListener('load', setup);
  }, []);

  const { cp, bags, hands, board, markers, bonus, mrem } = game;
  const player = PLAYERS[cp];

  // Size the board-wrap to fit container while maintaining image aspect ratio
  const [chipSize, setChipSize] = useState(24);
  const [wrapSize, setWrapSize] = useState({});
  const fitBoard = useCallback(() => {
    const img = boardImgRef.current;
    const container = boardWrapRef.current?.parentElement;
    if (!img || !container || !img.naturalWidth) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const ar = img.naturalWidth / img.naturalHeight;
    let w, h;
    if (cw / ch > ar) {
      // Container is wider than image — height-constrained
      h = ch;
      w = ch * ar;
    } else {
      // Container is taller than image — width-constrained
      w = cw;
      h = cw / ar;
    }
    setWrapSize({ width: w, height: h });
    setChipSize(h * 0.058);
  }, []);
  useEffect(() => {
    fitBoard();
    window.addEventListener('resize', fitBoard);
    return () => window.removeEventListener('resize', fitBoard);
  }, [fitBoard]);

  // ── Sensors ──
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 150, tolerance: 8 },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  // ── Parse drag ID ──
  function parseDragId(id) {
    if (!id) return null;
    const parts = id.split('-');
    return { source: parts[0], index: parseInt(parts[1]) };
  }

  // ── Find closest slot to a point ──
  function closestSlot(clientX, clientY) {
    const wrap = boardWrapRef.current;
    if (!wrap) return null;
    const rect = wrap.getBoundingClientRect();
    const xPct = ((clientX - rect.left) / rect.width) * 100;
    const yPct = ((clientY - rect.top) / rect.height) * 100;
    let best = null, bestDist = Infinity;
    for (const s of SLOTS) {
      const d = Math.hypot(xPct - s.x, yPct - s.y);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    // Also check free drop for markers
    return bestDist < 5 ? best : null;
  }

  // ── Get the token being dragged ──
  function getActiveToken() {
    const parsed = parseDragId(activeId);
    if (!parsed) return null;
    if (parsed.source === 'hand') {
      return hands[cp][parsed.index];
    }
    if (parsed.source === 'board') {
      return board[parsed.index];
    }
    if (parsed.source === 'supply') {
      return { isMarker: true };
    }
    return null;
  }

  // ── DnD handlers ──
  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragMove = useCallback((event) => {
    const { activatorEvent, delta } = event;
    if (activatorEvent) {
      const touch = activatorEvent.touches?.[0] || activatorEvent;
      setDragPos({
        x: touch.clientX + (delta?.x || 0),
        y: touch.clientY + (delta?.y || 0),
      });
    }
  }, []);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    setActiveId(null);
    setDragPos(null);

    const parsed = parseDragId(active.id);
    if (!parsed) return;

    // Find drop target — use the closest slot from final position
    const activatorEvent = event.activatorEvent;
    const delta = event.delta;
    let targetSlot = null;
    if (activatorEvent) {
      const touch = activatorEvent.touches?.[0] || activatorEvent;
      const finalX = touch.clientX + delta.x;
      const finalY = touch.clientY + delta.y;
      targetSlot = closestSlot(finalX, finalY);
    }

    // Also check if over a droppable
    if (over && over.id?.toString().startsWith('slot-')) {
      const slotId = parseInt(over.id.toString().replace('slot-', ''));
      targetSlot = SLOTS.find(s => s.id === slotId) || targetSlot;
    }

    setGame(prev => {
      const next = JSON.parse(JSON.stringify(prev));

      if (parsed.source === 'hand') {
        // Dragged from hand
        if (targetSlot && !next.board.some(b => b.slotId === targetSlot.id)) {
          // Place on empty slot
          const tok = next.hands[next.cp].splice(parsed.index, 1)[0];
          next.board.push({ tok: { type: tok.type, v: tok.v }, slotId: targetSlot.id, rot: tok.rot || false, pl: next.cp });
        }
        // Else: dropped nowhere — stays in hand
      } else if (parsed.source === 'board') {
        const bt = next.board[parsed.index];
        if (bt && bt.pl === next.cp) {
          if (targetSlot && targetSlot.id !== bt.slotId && !next.board.some(b => b.slotId === targetSlot.id)) {
            // Move to different slot
            bt.slotId = targetSlot.id;
          } else if (!targetSlot) {
            // Dropped off board — return to hand
            next.hands[next.cp].push({ type: bt.tok.type, v: [...bt.tok.v], rot: bt.rot });
            next.board.splice(parsed.index, 1);
          }
          // Else: dropped on same slot — no-op
        }
      } else if (parsed.source === 'supply') {
        // Dropped supply marker
        if (next.mrem[next.cp] > 0) {
          const wrap = boardWrapRef.current;
          if (wrap && activatorEvent) {
            const touch = activatorEvent.touches?.[0] || activatorEvent;
            const rect = wrap.getBoundingClientRect();
            const xPct = ((touch.clientX + delta.x - rect.left) / rect.width) * 100;
            const yPct = ((touch.clientY + delta.y - rect.top) / rect.height) * 100;
            next.markers.push({ pl: next.cp, x: xPct, y: yPct });
            next.mrem[next.cp]--;
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
      if (!prev.bags[prev.cp].length) return prev;
      const next = JSON.parse(JSON.stringify(prev));
      next.hands[next.cp].push({ ...next.bags[next.cp].pop(), rot: false, uid: uid() });
      return next;
    });
  }

  function endTurn() {
    setShowOverlay(true);
  }

  function confirmTurn() {
    setShowOverlay(false);
    setGame(prev => ({ ...prev, cp: 1 - prev.cp }));
  }

  function claimBonus(pi) {
    setGame(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const b = next.bonus.find(b => b.pi === pi);
      if (b) b.claimed = true;
      return next;
    });
  }

  function newGame() {
    if (confirm('Start new game?')) setGame(freshGame());
  }

  // ── Magnifier ──
  function renderMagnifier() {
    if (!dragPos || !boardImgRef.current) return null;
    const img = boardImgRef.current;
    const rect = img.getBoundingClientRect();

    // Map drag position to image coordinates
    const imgX = ((dragPos.x - rect.left) / rect.width) * img.naturalWidth;
    const imgY = ((dragPos.y - rect.top) / rect.height) * img.naturalHeight;

    const zoom = 2.5;
    const loupeSize = 150;

    // Background position to center the zoomed area
    const bgW = img.naturalWidth * zoom * (rect.width / img.naturalWidth);
    const bgH = img.naturalHeight * zoom * (rect.height / img.naturalHeight);
    const bgX = -(((dragPos.x - rect.left) / rect.width) * bgW - loupeSize / 2);
    const bgY = -(((dragPos.y - rect.top) / rect.height) * bgH - loupeSize / 2);

    // Position loupe above the finger
    const loupeX = dragPos.x - loupeSize / 2;
    const loupeY = dragPos.y - loupeSize - 40;

    // Get token values for display inside loupe
    const tok = getActiveToken();
    const isToken = tok && !tok.isMarker;
    const v0 = isToken ? (tok.rot ? (tok.v?.[1] ?? tok.tok?.v[1]) : (tok.v?.[0] ?? tok.tok?.v[0])) : null;
    const v1 = isToken ? (tok.rot ? (tok.v?.[0] ?? tok.tok?.v[0]) : (tok.v?.[1] ?? tok.tok?.v[1])) : null;

    return (
      <div
        className="magnifier"
        style={{
          left: loupeX,
          top: Math.max(10, loupeY),
          width: loupeSize,
          height: loupeSize,
          backgroundImage: `url(${img.src})`,
          backgroundSize: `${bgW}px ${bgH}px`,
          backgroundPosition: `${bgX}px ${bgY}px`,
        }}
      >
        {isToken && (
          <div className={`magnifier-token p${cp}`}>
            <div className="tv tv-l">{v0}</div>
            <div className="tv">{v1}</div>
          </div>
        )}
        {tok?.isMarker && (
          <div className={`magnifier-token p${cp}`}>
            <span style={{color:'#c9a84c',fontWeight:'bold',fontSize:14}}>M</span>
          </div>
        )}
        <div className="magnifier-crosshair" />
      </div>
    );
  }

  // ── Render ──
  const activeToken = getActiveToken();
  const isDragging = activeId !== null;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="app">
        {/* Header */}
        <div className="header">
          <div>
            <span className={`player-name p${cp}`}>{player.name}</span>
            <span className="bag-count">({bags[cp].length} in bag)</span>
          </div>
          <span className="markers-label">Markers: {mrem[cp]}/12</span>
        </div>

        {/* Board */}
        <div className="board-container">
          <div className="board-wrap" ref={boardWrapRef} style={wrapSize.width ? {width: wrapSize.width, height: wrapSize.height} : {}}>
            <img
              ref={boardImgRef}
              className="board-img"
              src="/caesar-board.jpg"
              alt="Board"
              onLoad={fitBoard}
            />
            <div className="board-overlay">
              {/* Slot targets */}
              {SLOTS.map(slot => {
                const occupied = board.some(b => b.slotId === slot.id);
                if (occupied) return null;
                return (
                  <div
                    key={`slot-${slot.id}`}
                    className={`slot-target ${isDragging ? 'highlight' : 'empty'}`}
                    style={{
                      left: `${slot.x}%`, top: `${slot.y}%`,
                      width: chipSize, height: chipSize,
                    }}
                    data-slot={slot.id}
                  />
                );
              })}

              {/* Placed tokens */}
              {board.map((bt, i) => {
                const slot = SLOTS.find(s => s.id === bt.slotId);
                if (!slot) return null;
                const vals = bt.rot ? [bt.tok.v[1], bt.tok.v[0]] : bt.tok.v;
                const draggingThis = activeId === `board-${i}`;
                return (
                  <DraggableDiv key={`bt-${i}`} id={`board-${i}`}>
                    <div
                      className={`board-token p${bt.pl}`}
                      style={{
                        left: `${slot.x}%`, top: `${slot.y}%`,
                        width: chipSize, height: chipSize,
                        fontSize: chipSize * 0.4,
                        opacity: draggingThis ? 0.3 : 1,
                      }}
                    >
                      <div className="tv tv-l">{vals[0]}</div>
                      <div className="tv">{vals[1]}</div>
                    </div>
                  </DraggableDiv>
                );
              })}

              {/* Supply markers */}
              {[0, 1].map(pl =>
                MARKER_SUPPLY[pl].slice(0, mrem[pl]).map((pos, mi) => (
                  pl === cp ? (
                    <DraggableDiv key={`supply-${pl}-${mi}`} id={`supply-${pl}-${mi}`}>
                      <div
                        className={`supply-marker p${pl}`}
                        style={{
                          left: `${pos.x}%`, top: `${pos.y}%`,
                          width: chipSize * 0.55, height: chipSize * 0.55,
                        }}
                      />
                    </DraggableDiv>
                  ) : (
                    <div
                      key={`supply-${pl}-${mi}`}
                      className={`supply-marker p${pl}`}
                      style={{
                        left: `${pos.x}%`, top: `${pos.y}%`,
                        width: chipSize * 0.55, height: chipSize * 0.55,
                      }}
                    />
                  )
                ))
              )}

              {/* Control markers on board */}
              {markers.map((m, i) => (
                <div
                  key={`cm-${i}`}
                  className={`ctrl-marker p${m.pl}`}
                  style={{
                    left: `${m.x}%`, top: `${m.y}%`,
                    width: chipSize * 0.7, height: chipSize * 0.7,
                    fontSize: chipSize * 0.3,
                  }}
                >M</div>
              ))}

              {/* Bonus tokens */}
              {bonus.filter(b => !b.claimed).map(b => {
                const prov = PROVS[b.pi];
                return (
                  <div
                    key={`bonus-${b.pi}`}
                    className="bonus-token"
                    style={{
                      left: `${prov.x}%`, top: `${prov.y}%`,
                      width: chipSize * 0.8, height: chipSize * 0.8,
                      fontSize: chipSize * 0.35,
                    }}
                    onClick={() => claimBonus(b.pi)}
                  >
                    {BONUS_ICONS[b.type] || '?'}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Hand panel */}
        <div className="hand-panel">
          <div className="hand-tokens">
            {hands[cp].length === 0 && (
              <div className="empty-hand">No tokens — draw from bag</div>
            )}
            {hands[cp].map((t, i) => {
              const vals = t.rot ? [t.v[1], t.v[0]] : t.v;
              const draggingThis = activeId === `hand-${i}`;
              return (
                <DraggableDiv key={`hand-${t.uid || i}`} id={`hand-${i}`}>
                  <div className={`hand-token p${cp} ${draggingThis ? 'dragging' : ''}`}>
                    <div className="token-inner">
                      <div className="tv tv-l">{vals[0]}</div>
                      <div className="tv">{vals[1]}</div>
                    </div>
                    <span className="token-icon">{TYPE_ICONS[t.type]}</span>
                  </div>
                </DraggableDiv>
              );
            })}
          </div>
          <div className="actions">
            <button className="btn" onClick={draw} disabled={!bags[cp].length}>Draw</button>
            <button className="btn" onClick={endTurn}>End Turn</button>
            <button className="btn" onClick={newGame}>New</button>
          </div>
        </div>

        {/* Turn overlay */}
        {showOverlay && (
          <div className="turn-overlay" onClick={confirmTurn}>
            <h2>Pass device to {PLAYERS[1 - cp].name}</h2>
            <p>Tap when ready</p>
          </div>
        )}

        {/* Drag overlay */}
        <DragOverlay dropAnimation={null}>
          {activeToken && !activeToken.isMarker && (
            <div className={`drag-token p${cp}`}>
              <div className="tv tv-l">{activeToken.rot ? activeToken.v?.[1] || activeToken.tok?.v[1] : activeToken.v?.[0] || activeToken.tok?.v[0]}</div>
              <div className="tv">{activeToken.rot ? activeToken.v?.[0] || activeToken.tok?.v[0] : activeToken.v?.[1] || activeToken.tok?.v[1]}</div>
            </div>
          )}
          {activeToken?.isMarker && (
            <div className={`drag-token p${cp}`} style={{ width: 36, height: 36 }}>
              <span style={{ color: '#c9a84c', fontWeight: 'bold', fontSize: 14 }}>M</span>
            </div>
          )}
        </DragOverlay>

        {/* Magnifier */}
        {isDragging && renderMagnifier()}

        {/* Hidden canvas for magnifier */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </DndContext>
  );
}

// ── DraggableDiv wrapper ──
// Uses dnd-kit's useDraggable internally
import { useDraggable as useDndDraggable } from '@dnd-kit/core';

function DraggableDiv({ id, children }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDndDraggable({ id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
