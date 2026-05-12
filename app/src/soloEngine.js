// Solo mode engine for Caesar! — Auto-Crassus bot
import { BORDERS, BORDER_SLOTS, PROVINCES } from './boardData';
import { shuffle } from './gameData';

// ── Command Tiles ──
const COMMAND_TILES = [
  { draw: 1, place: 1, discard: 0 },
  { draw: 2, place: 1, discard: 1 },
  { draw: 2, place: 2, discard: 0 },
  { draw: 3, place: 1, discard: 2 },
  { draw: 3, place: 2, discard: 1 },
  { draw: 3, place: 3, discard: 0 },
];

export function createSoloState() {
  return {
    commandDeck: shuffle([...COMMAND_TILES]),
    commandIdx: 0,
    tokenLine: [],       // face-up ordered tokens
    animating: false,
  };
}

// ── Province Scoring ──

export function getBordersForProvince(provId) {
  return BORDERS.filter(b => b.p.includes(provId));
}

// Pre-compute for performance
export const PROVINCE_BORDERS = {};
for (const p of PROVINCES) {
  PROVINCE_BORDERS[p.id] = getBordersForProvince(p.id);
}

export function getProvinceInfluence(board, provId) {
  const borders = PROVINCE_BORDERS[provId] || [];
  const result = { 0: 0, 1: 0, filled: 0, total: borders.length, slots: [] };

  for (const b of borders) {
    const placed = board.find(bt => bt.slotId === b.id);
    if (placed) {
      result.filled++;
      // Flipped tokens count as 0/0
      if (placed.flipped) {
        result.slots.push({ slotId: b.id, pl: placed.pl, val: 0 });
      } else {
        // Each border has p:[provA, provB]. The token's top value (v[0]) faces p[0],
        // bottom value (v[1]) faces p[1]. Rotation swaps which faces which.
        const provIdx = b.p.indexOf(provId); // 0 or 1
        let val;
        if (provIdx === 0) {
          val = placed.rot ? placed.tok.v[1] : placed.tok.v[0]; // top faces p[0]
        } else {
          val = placed.rot ? placed.tok.v[0] : placed.tok.v[1]; // bottom faces p[1]
        }
        result[placed.pl] += val;
        result.slots.push({ slotId: b.id, pl: placed.pl, val });
      }
    }
  }
  return result;
}

export function isProvinceClosed(board, provId) {
  const inf = getProvinceInfluence(board, provId);
  return inf.filled === inf.total;
}

export function getProvinceWinner(board, provId) {
  const inf = getProvinceInfluence(board, provId);
  if (inf.filled < inf.total) return null;
  if (inf[0] > inf[1]) return 0;
  if (inf[1] > inf[0]) return 1;
  // Tie: no control marker placed
  return 'tie';
}

// Who placed the last influence token on this province?
export function getLastPlacer(board, provId) {
  const borders = PROVINCE_BORDERS[provId] || [];
  const slotIds = new Set(borders.map(b => b.id));
  for (let i = board.length - 1; i >= 0; i--) {
    if (slotIds.has(board[i].slotId)) return board[i].pl;
  }
  return null;
}

// ── Province Closure Detection ──

export function checkAndCloseProvinces(game) {
  const next = JSON.parse(JSON.stringify(game));
  let changed = false;

  for (const prov of PROVINCES) {
    if (prov.id === 'italia') continue; // italia uses italia_0 / italia_1 bonus slots
    if (next.markers.some(m => m.provId === prov.id)) continue; // already claimed
    if (next.closedTies?.includes(prov.id)) continue; // already resolved as tie
    if (!isProvinceClosed(next.board, prov.id)) continue;

    const winner = getProvinceWinner(next.board, prov.id);
    if (winner === null) continue;

    // Bonus token goes to whoever placed the last influence token
    const lastPl = getLastPlacer(next.board, prov.id);
    const bi = next.bonus.findIndex(b => b.province === prov.id && !b.claimed);
    if (bi >= 0 && lastPl !== null) {
      next.bonus[bi].claimed = true;
      next.bonus[bi].claimedBy = lastPl;
      changed = true;
    }

    if (winner === 'tie') {
      // Tie: no control marker placed, province space left empty
      if (!next.closedTies) next.closedTies = [];
      next.closedTies.push(prov.id);
      changed = true;
      continue;
    }

    // Place control marker
    if (next.mrem[winner] > 0) {
      next.markers.push({ pl: winner, x: prov.bx, y: prov.by, provId: prov.id });
      next.mrem[winner]--;
      changed = true;
    }
  }

  return changed ? next : game;
}

// ── Token-Slot Compatibility ──

export function canPlace(tokenType, slotType) {
  const t = tokenType.toLowerCase();
  const s = slotType.toLowerCase();
  if (t === 'wreath') return true;
  if (t === 'ship+shield' || t === 'shipshield') return s === 'ship' || s === 'shield';
  if (t === 'sword') return s === 'sword';
  if (t === 'shield') return s === 'shield';
  if (t === 'ship') return s === 'ship';
  return false;
}

// ── AI Decision Tree ──

function getEmptySlotsForProvince(board, provId) {
  const borders = PROVINCE_BORDERS[provId] || [];
  const occupiedIds = new Set(board.map(b => b.slotId));
  return borders.filter(b => !occupiedIds.has(b.id));
}

function tokenActiveValue(tok, rot) {
  return rot ? tok.v[1] : tok.v[0];
}

function tokenMaxValue(tok) {
  return Math.max(tok.v[0], tok.v[1]);
}

function tokenMinValue(tok) {
  return Math.min(tok.v[0], tok.v[1]);
}

function isLandlocked(provId) {
  const borders = PROVINCE_BORDERS[provId] || [];
  return borders.every(b => b.type !== 'ship');
}

export function choosePlacement(game) {
  const { board } = game;
  const tokenLine = game.solo.tokenLine;
  if (!tokenLine.length) return null;

  const occupiedIds = new Set(board.map(b => b.slotId));

  // Helper: find compatible tokens and the value they'd contribute to a province
  // provId = the province we're trying to influence (determines which face counts)
  function findCandidates(slot, provId) {
    const candidates = [];
    const provIdx = slot.p.indexOf(provId); // 0 or 1
    for (let ti = 0; ti < tokenLine.length; ti++) {
      const tok = tokenLine[ti];
      if (!canPlace(tok.type, slot.type)) continue;
      // Both orientations: value facing the target province
      for (const rot of [false, true]) {
        let val;
        if (provIdx === 0) {
          val = rot ? tok.v[1] : tok.v[0]; // top faces p[0]
        } else {
          val = rot ? tok.v[0] : tok.v[1]; // bottom faces p[1]
        }
        candidates.push({ ti, tok, rot, val });
      }
    }
    return candidates;
  }

  // Priority A: Can bot WIN a province?
  for (const prov of PROVINCES) {
    if (prov.id === 'italia') continue;
    if (game.markers.some(m => m.provId === prov.id)) continue;

    const emptySlots = getEmptySlotsForProvince(board, prov.id);
    if (emptySlots.length !== 1) continue; // exactly 1 empty = can close it

    const inf = getProvinceInfluence(board, prov.id);
    const slot = BORDER_SLOTS.find(s => s.id === emptySlots[0].id);
    if (!slot) continue;

    const candidates = findCandidates(slot, prov.id);
    // Find lowest-value token that would give bot majority
    const winning = candidates
      .filter(c => inf[1] + c.val > inf[0]) // bot wins
      .sort((a, b) => a.val - b.val);

    if (winning.length > 0) {
      const pick = winning[0];
      return { slotId: slot.id, tokenIndex: pick.ti, rotate: pick.rot };
    }
  }

  // Priority B: Can bot CLOSE a province? (even if losing)
  for (const prov of PROVINCES) {
    if (prov.id === 'italia') continue;
    if (game.markers.some(m => m.provId === prov.id)) continue;

    const emptySlots = getEmptySlotsForProvince(board, prov.id);
    if (emptySlots.length !== 1) continue;

    const slot = BORDER_SLOTS.find(s => s.id === emptySlots[0].id);
    if (!slot) continue;

    const candidates = findCandidates(slot, prov.id);
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.val - b.val);
      return { slotId: slot.id, tokenIndex: candidates[0].ti, rotate: candidates[0].rot };
    }
  }

  // Priority C: Reinforce province where bot is losing the most
  const losingProvinces = [];
  for (const prov of PROVINCES) {
    if (prov.id === 'italia') continue;
    if (game.markers.some(m => m.provId === prov.id)) continue;

    const inf = getProvinceInfluence(board, prov.id);
    if (inf.filled === 0) continue;
    if (inf[0] > inf[1]) {
      const emptySlots = getEmptySlotsForProvince(board, prov.id);
      if (emptySlots.length > 0) {
        losingProvinces.push({ prov, deficit: inf[0] - inf[1], emptySlots });
      }
    }
  }

  if (losingProvinces.length > 0) {
    losingProvinces.sort((a, b) => b.deficit - a.deficit);
    for (const lp of losingProvinces) {
      for (const es of lp.emptySlots) {
        const slot = BORDER_SLOTS.find(s => s.id === es.id);
        if (!slot) continue;
        const candidates = findCandidates(slot, lp.prov.id);
        if (candidates.length > 0) {
          candidates.sort((a, b) => b.val - a.val);
          return { slotId: slot.id, tokenIndex: candidates[0].ti, rotate: candidates[0].rot };
        }
      }
    }
  }

  // Priority D: Place on any empty slot, prefer landlocked provinces
  const allEmpty = BORDER_SLOTS.filter(s => !occupiedIds.has(s.id));
  allEmpty.sort((a, b) => {
    const aLand = a.p.some(p => isLandlocked(p)) ? 0 : 1;
    const bLand = b.p.some(p => isLandlocked(p)) ? 0 : 1;
    if (aLand !== bLand) return aLand - bLand;
    const aBorders = Math.min(...a.p.map(p => (PROVINCE_BORDERS[p] || []).length));
    const bBorders = Math.min(...b.p.map(p => (PROVINCE_BORDERS[p] || []).length));
    return aBorders - bBorders;
  });

  for (const slot of allEmpty) {
    // Pick the province from this slot's two that bot cares more about
    const bestProv = slot.p.reduce((best, pid) => {
      if (pid === 'italia') return best;
      const inf = getProvinceInfluence(board, pid);
      const deficit = inf[0] - inf[1]; // positive = human leads
      return (!best || deficit > best.deficit) ? { id: pid, deficit } : best;
    }, null);
    const targetProv = bestProv?.id || slot.p[0];
    const candidates = findCandidates(slot, targetProv);
    if (candidates.length > 0) {
      // Use medium value
      candidates.sort((a, b) => a.val - b.val);
      const mid = Math.floor(candidates.length / 2);
      return { slotId: slot.id, tokenIndex: candidates[mid].ti, rotate: candidates[mid].rot };
    }
  }

  return null; // no valid placement
}

// ── Win Condition ──

export function checkWinCondition(game) {
  if (game.mrem[0] <= 0) return { winner: 0 };
  if (game.mrem[1] <= 0) return { winner: 1 };
  return null;
}

// ── Border Domination ──
// When a player controls both provinces on a border that has the opponent's token,
// place a control marker on that border token.

export function checkBorderDomination(game) {
  const next = JSON.parse(JSON.stringify(game));
  let changed = false;

  for (const bt of next.board) {
    const border = BORDERS.find(b => b.id === bt.slotId);
    if (!border) continue;
    const [provA, provB] = border.p;

    // Already has a border marker?
    if (next.markers.some(m => m.borderId === border.id)) continue;

    // Check each player: do they control both adjacent provinces?
    for (const pl of [0, 1]) {
      if (bt.pl === pl) continue; // it's their own token, skip
      const controlsA = next.markers.some(m => m.provId === provA && m.pl === pl && !m.flipped);
      const controlsB = next.markers.some(m => m.provId === provB && m.pl === pl && !m.flipped);
      if (controlsA && controlsB && next.mrem[pl] > 0) {
        next.markers.push({ pl, x: border.x, y: border.y, borderId: border.id });
        next.mrem[pl]--;
        changed = true;
        break;
      }
    }
  }

  return changed ? next : game;
}

// ── Bot Bonus Processing ──
// After province closures, process bonus effects the bot earned.

function processBotBonuses(game, prevBonus) {
  const next = JSON.parse(JSON.stringify(game));
  const bot = 1;

  // Find newly claimed bonuses for the bot
  const newBonuses = next.bonus.filter((b, i) =>
    b.claimed && b.claimedBy === bot && !(prevBonus[i]?.claimed)
  );
  if (newBonuses.length === 0) return { game: next, gotTactics: false };

  const gotTactics = newBonuses.some(b => b.type === 'Tactics');
  const gotMight = newBonuses.some(b => b.type === 'Might');
  const wealthCount = newBonuses.filter(b => b.type === 'Wealth').length;

  // Wealth: draw extra tokens to token line
  for (let i = 0; i < wealthCount; i++) {
    if (next.bags[bot].length > 0) {
      next.solo.tokenLine.push(next.bags[bot].pop());
    }
  }

  // Might: flip the opponent's most valuable token in a contested province
  if (gotMight) {
    let bestIdx = -1;
    let bestScore = -1;
    for (let i = 0; i < next.board.length; i++) {
      const bt = next.board[i];
      if (bt.pl !== 0 || bt.flipped) continue; // only target human's non-flipped tokens
      const border = BORDERS.find(b => b.id === bt.slotId);
      if (!border) continue;
      // Score: highest influence this token contributes to provinces where bot is competing
      for (const provId of border.p) {
        if (provId === 'italia') continue;
        if (next.markers.some(m => m.provId === provId)) continue; // already closed
        const provIdx = border.p.indexOf(provId);
        let val;
        if (provIdx === 0) {
          val = bt.rot ? bt.tok.v[1] : bt.tok.v[0];
        } else {
          val = bt.rot ? bt.tok.v[0] : bt.tok.v[1];
        }
        if (val > bestScore) {
          bestScore = val;
          bestIdx = i;
        }
      }
    }
    if (bestIdx >= 0) {
      next.board[bestIdx].flipped = true;
    }
  }

  return { game: next, gotTactics };
}

// ── Execute Bot Turn ──

function executeSingleBotTurn(game) {
  const next = JSON.parse(JSON.stringify(game));
  const solo = next.solo;

  // Get current command tile
  if (solo.commandIdx >= solo.commandDeck.length) {
    solo.commandDeck = shuffle([...COMMAND_TILES]);
    solo.commandIdx = 0;
  }
  const cmd = solo.commandDeck[solo.commandIdx];
  solo.commandIdx++;

  // Phase 1: Draw tokens from bag to token line
  for (let i = 0; i < cmd.draw; i++) {
    if (next.bags[1].length > 0) {
      const tok = next.bags[1].pop();
      solo.tokenLine.push(tok);
    }
  }

  // Phase 2: Place tokens
  const placements = [];
  for (let i = 0; i < cmd.place; i++) {
    if (solo.tokenLine.length === 0) break;
    const decision = choosePlacement(next);
    if (!decision) break;

    const tok = solo.tokenLine.splice(decision.tokenIndex, 1)[0];
    next.board.push({
      tok: { type: tok.type, v: tok.v },
      slotId: decision.slotId,
      rot: decision.rotate,
      pl: 1,
    });
    placements.push(decision.slotId);
  }

  // Phase 3: Discard from left of token line
  for (let i = 0; i < cmd.discard; i++) {
    if (solo.tokenLine.length > 0) {
      solo.tokenLine.shift(); // remove from left (oldest)
    }
  }

  // Snapshot bonus state before closures
  const prevBonus = JSON.parse(JSON.stringify(next.bonus));

  // Check province closures
  const closed = checkAndCloseProvinces(next);
  const afterClose = closed !== next ? closed : next;
  afterClose.solo = next.solo; // preserve solo state

  // Check border domination (new markers on dominated borders)
  const afterBorder = checkBorderDomination(afterClose);
  if (afterBorder !== afterClose) afterBorder.solo = afterClose.solo;

  // Process bonus effects (Wealth, Might, Tactics)
  const { game: afterBonus, gotTactics } = processBotBonuses(afterBorder, prevBonus);
  afterBonus.solo = afterBorder.solo;

  return { game: afterBonus, command: cmd, placements, gotTactics };
}

export function executeBotTurn(game) {
  let { game: result, command, placements, gotTactics } = executeSingleBotTurn(game);

  // Tactics bonus: bot gets an extra turn (max 1 extra to prevent infinite loops)
  if (gotTactics) {
    const extra = executeSingleBotTurn({ ...result, cp: 1 });
    result = extra.game;
    placements = [...placements, ...extra.placements];
    // Don't chain tactics — one extra turn max per original turn
  }

  // Switch turn back to human
  result.cp = 0;

  return { game: result, command, placements };
}
