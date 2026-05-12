// Smart AI engine for Caesar! — Minimax with alpha-beta pruning
import { BORDERS, BORDER_SLOTS, PROVINCES } from './boardData';
import { createTokenSet, shuffle } from './gameData';
import {
  PROVINCE_BORDERS,
  canPlace,
  getProvinceInfluence,
  isProvinceClosed,
  getProvinceWinner,
  getLastPlacer,
  checkAndCloseProvinces,
  checkBorderDomination,
  checkWinCondition,
} from './soloEngine';

// ── Command Tiles (same as soloEngine) ──
const COMMAND_TILES = [
  { draw: 1, place: 1, discard: 0 },
  { draw: 2, place: 1, discard: 1 },
  { draw: 2, place: 2, discard: 0 },
  { draw: 3, place: 1, discard: 2 },
  { draw: 3, place: 2, discard: 1 },
  { draw: 3, place: 3, discard: 0 },
];

// ── Evaluation Weights ──
const W = {
  markers:    100,  // marker advantage (primary win signal)
  province:    10,  // per-province influence advantage
  closure:     25,  // near-closure tactical value
  domination:  40,  // border domination potential
  bonus:       15,  // bonus token value
  tempo:        3,  // token efficiency
};

const BONUS_VALUE = { Tactics: 15, Might: 10, Wealth: 5, Senate: 0 };

// ── Lightweight Search State ──

function createSearchState(game) {
  const board = game.board.map(b => ({
    slotId: b.slotId, pl: b.pl, rot: b.rot,
    type: b.tok.type, v: b.tok.v, flipped: b.flipped || false,
    borderMarker: b.borderMarker,
  }));
  return {
    board,
    markers: game.markers.map(m => ({
      pl: m.pl, provId: m.provId, borderId: m.borderId, flipped: m.flipped || false,
    })),
    mrem: [game.mrem[0], game.mrem[1]],
    closedTies: game.closedTies ? [...game.closedTies] : [],
    bonus: game.bonus.map(b => ({
      type: b.type, province: b.province, claimed: b.claimed, claimedBy: b.claimedBy,
    })),
    occupied: new Set(board.map(b => b.slotId)),
  };
}

function cloneSearchState(s) {
  const board = s.board.map(b => ({ ...b, v: [b.v[0], b.v[1]] }));
  return {
    board,
    markers: s.markers.map(m => ({ ...m })),
    mrem: [s.mrem[0], s.mrem[1]],
    closedTies: [...s.closedTies],
    bonus: s.bonus.map(b => ({ ...b })),
    occupied: new Set(s.occupied),
  };
}

// Convert search state back to game-like object for soloEngine functions
function toGameLike(state) {
  return {
    board: state.board.map(b => ({
      tok: { type: b.type, v: b.v },
      slotId: b.slotId, pl: b.pl, rot: b.rot, flipped: b.flipped,
      borderMarker: b.borderMarker,
    })),
    markers: state.markers.map(m => ({
      pl: m.pl, x: 0, y: 0, provId: m.provId, borderId: m.borderId, flipped: m.flipped,
    })),
    mrem: [...state.mrem],
    closedTies: [...state.closedTies],
    bonus: state.bonus.map(b => ({ ...b })),
  };
}

// Apply province closures and border domination on a search state
function applyPostPlacement(state) {
  const gameLike = toGameLike(state);
  const afterClose = checkAndCloseProvinces(gameLike);
  const afterBorder = checkBorderDomination(afterClose !== gameLike ? afterClose : gameLike);
  const result = afterBorder !== afterClose && afterBorder !== gameLike ? afterBorder : afterClose !== gameLike ? afterClose : gameLike;

  // Sync back to search state format
  return {
    board: result.board.map(b => ({
      slotId: b.slotId, pl: b.pl, rot: b.rot,
      type: b.tok.type, v: b.tok.v, flipped: b.flipped || false,
      borderMarker: b.borderMarker,
    })),
    markers: result.markers.map(m => ({
      pl: m.pl, provId: m.provId, borderId: m.borderId, flipped: m.flipped || false,
    })),
    mrem: [...result.mrem],
    closedTies: result.closedTies ? [...result.closedTies] : [],
    bonus: result.bonus.map(b => ({ ...b })),
    occupied: new Set(result.board.map(b => b.slotId)),
  };
}

// ── Move Generation ──

function generateMoves(state, tokenLine) {
  const moves = [];
  const seen = new Set(); // deduplicate symmetric rotations for equal values
  for (let ti = 0; ti < tokenLine.length; ti++) {
    const tok = tokenLine[ti];
    for (const slot of BORDER_SLOTS) {
      if (state.occupied.has(slot.id)) continue;
      if (!canPlace(tok.type, slot.type)) continue;
      const rotations = tok.v[0] === tok.v[1] ? [false] : [false, true];
      for (const rot of rotations) {
        const key = `${ti}-${slot.id}-${rot}`;
        if (seen.has(key)) continue;
        seen.add(key);
        moves.push({ slotId: slot.id, ti, rot, tok });
      }
    }
  }
  return moves;
}

// Quick heuristic for move ordering (higher = search first)
function moveQuickScore(move, state) {
  const slot = BORDER_SLOTS.find(s => s.id === move.slotId);
  if (!slot) return 0;
  let score = 0;
  for (const provId of slot.p) {
    if (provId === 'italia') continue;
    const borders = PROVINCE_BORDERS[provId] || [];
    const inf = getProvinceInfluenceFromState(state, provId);
    const empty = inf.total - inf.filled;
    // Value this move contributes to the province
    const provIdx = slot.p.indexOf(provId);
    const val = provIdx === 0
      ? (move.rot ? move.tok.v[1] : move.tok.v[0])
      : (move.rot ? move.tok.v[0] : move.tok.v[1]);

    if (empty === 1) {
      // This closes the province
      if (inf[1] + val > inf[0]) score += 1000; // bot wins
      else if (inf[1] + val === inf[0]) score += 200; // tie
      else score += 100; // closes but loses (still progress)
    } else {
      // Urgency × value
      score += val * (inf.filled + 1) / inf.total * 5;
      // Bonus if province has a good bonus token
      const b = state.bonus.find(b => b.province === provId && !b.claimed);
      if (b) score += (BONUS_VALUE[b.type] || 0) * 0.3;
    }
  }
  return score;
}

// Faster influence calculation directly from search state
function getProvinceInfluenceFromState(state, provId) {
  const borders = PROVINCE_BORDERS[provId] || [];
  const result = { 0: 0, 1: 0, filled: 0, total: borders.length };
  for (const b of borders) {
    const placed = state.board.find(bt => bt.slotId === b.id);
    if (!placed) continue;
    result.filled++;
    if (placed.flipped) continue;
    const provIdx = b.p.indexOf(provId);
    const val = provIdx === 0
      ? (placed.rot ? placed.v[1] : placed.v[0])
      : (placed.rot ? placed.v[0] : placed.v[1]);
    result[placed.pl] += val;
  }
  return result;
}

// ── Evaluation Function ──

function evaluateState(state) {
  let score = 0;

  // 1. Marker advantage (primary win signal)
  const botMarkers = 12 - state.mrem[1];
  const humMarkers = 12 - state.mrem[0];
  score += W.markers * (botMarkers - humMarkers);

  // Win/loss detection
  if (state.mrem[1] <= 0) return 100000;
  if (state.mrem[0] <= 0) return -100000;

  // 2-4. Province-level evaluation
  for (const prov of PROVINCES) {
    if (prov.id === 'italia') continue;
    const hasMarker = state.markers.some(m => m.provId === prov.id);
    if (hasMarker) continue;
    if (state.closedTies.includes(prov.id)) continue;

    const inf = getProvinceInfluenceFromState(state, prov.id);
    const empty = inf.total - inf.filled;
    const advantage = inf[1] - inf[0]; // positive = bot leads

    // Bonus multiplier for this province
    const bonusTok = state.bonus.find(b => b.province === prov.id && !b.claimed);
    const bonusMult = 1 + (bonusTok ? (BONUS_VALUE[bonusTok.type] || 0) / 30 : 0);

    // Province influence advantage (weighted by fill progress)
    if (inf.filled > 0) {
      const urgency = inf.filled / inf.total;
      score += W.province * advantage * urgency * bonusMult;
    }

    // Near-closure bonus (1 empty slot)
    if (empty === 1) {
      if (advantage > 0) score += W.closure * bonusMult;
      else if (advantage < 0) score -= W.closure * 0.6 * bonusMult;
    } else if (empty === 2) {
      if (advantage > 0) score += W.closure * 0.3 * bonusMult;
      else if (advantage < 0) score -= W.closure * 0.2 * bonusMult;
    }
  }

  // 5. Border domination potential
  for (const bt of state.board) {
    if (state.markers.some(m => m.borderId === bt.slotId)) continue;
    const border = BORDERS.find(b => b.id === bt.slotId);
    if (!border) continue;
    const [provA, provB] = border.p;
    for (const pl of [0, 1]) {
      if (bt.pl === pl) continue;
      const controlsOne = state.markers.some(m =>
        (m.provId === provA || m.provId === provB) && m.pl === pl && !m.flipped
      );
      if (!controlsOne) continue;
      // Check if player leads in the other province
      const otherProv = state.markers.some(m => m.provId === provA && m.pl === pl && !m.flipped)
        ? provB : provA;
      const inf = getProvinceInfluenceFromState(state, otherProv);
      const adv = inf[pl] - inf[1 - pl];
      const factor = pl === 1 ? 1 : -1;
      if (adv > 0) score += W.domination * 0.8 * factor;
      else if (inf.filled > 0) score += W.domination * 0.3 * factor;
    }
  }

  // 6. Bonus tokens claimed
  for (const b of state.bonus) {
    if (!b.claimed) continue;
    const val = BONUS_VALUE[b.type] || 0;
    if (b.claimedBy === 1) score += W.bonus * val / 15;
    else score -= W.bonus * val / 15;
  }

  return score;
}

// ── Turn Sequence Enumeration ──

function enumerateTurnSequences(state, tokenLine, numPlacements) {
  if (numPlacements === 0 || tokenLine.length === 0) {
    return [{ moves: [], state }];
  }

  const moves = generateMoves(state, tokenLine);
  // Sort by quick heuristic (best first for pruning)
  moves.sort((a, b) => moveQuickScore(b, state) - moveQuickScore(a, state));
  // Prune: keep top moves to limit branching
  const maxMoves = numPlacements >= 3 ? 8 : numPlacements >= 2 ? 10 : moves.length;
  const pruned = moves.slice(0, maxMoves);

  const sequences = [];
  for (const move of pruned) {
    // Apply move
    const next = cloneSearchState(state);
    const tok = tokenLine[move.ti];
    next.board.push({
      slotId: move.slotId, pl: 1, rot: move.rot,
      type: tok.type, v: [tok.v[0], tok.v[1]], flipped: false,
    });
    next.occupied.add(move.slotId);

    // Recurse for remaining placements
    const remaining = tokenLine.filter((_, i) => i !== move.ti);
    const subSequences = enumerateTurnSequences(next, remaining, numPlacements - 1);
    for (const sub of subSequences) {
      sequences.push({
        moves: [{ slotId: move.slotId, tokenIndex: move.ti, rotate: move.rot }, ...sub.moves],
        state: sub.state,
      });
    }
  }

  return sequences;
}

// ── Opponent Response Simulation ──

function computeAvgOpponentValues(game) {
  // Figure out what tokens the opponent (player 0) has NOT yet played
  const fullSet = createTokenSet();
  const playedTypes = {};
  for (const bt of game.board) {
    if (bt.pl !== 0) continue;
    const key = `${bt.tok.type}-${bt.tok.v[0]}-${bt.tok.v[1]}`;
    playedTypes[key] = (playedTypes[key] || 0) + 1;
  }
  // Remove played from full set
  const remaining = [];
  const usedKeys = { ...playedTypes };
  for (const t of fullSet) {
    const key = `${t.type}-${t.v[0]}-${t.v[1]}`;
    if (usedKeys[key] && usedKeys[key] > 0) {
      usedKeys[key]--;
    } else {
      remaining.push(t);
    }
  }
  // Average value per slot type
  const avgBySlotType = {};
  for (const slotType of ['sword', 'shield', 'ship']) {
    const compatible = remaining.filter(t => canPlace(t.type, slotType));
    if (compatible.length === 0) { avgBySlotType[slotType] = 2; continue; }
    const avgMax = compatible.reduce((sum, t) => sum + Math.max(t.v[0], t.v[1]), 0) / compatible.length;
    avgBySlotType[slotType] = avgMax;
  }
  return avgBySlotType;
}

function simulateOpponentResponse(state, avgValues) {
  // Generate pseudo-moves for opponent (player 0)
  const oppMoves = [];
  for (const slot of BORDER_SLOTS) {
    if (state.occupied.has(slot.id)) continue;
    const avgVal = avgValues[slot.type] || 2;
    // Evaluate: what would placing here do for opponent?
    for (const provId of slot.p) {
      if (provId === 'italia') continue;
      const inf = getProvinceInfluenceFromState(state, provId);
      if (state.markers.some(m => m.provId === provId)) continue;
      const empty = inf.total - inf.filled;
      let moveScore = avgVal * (inf.filled + 1) / inf.total;
      if (empty === 1) {
        // Opponent closes it
        if (inf[0] + avgVal > inf[1]) moveScore += 50; // opponent wins
        else moveScore += 10;
      }
      oppMoves.push({ slotId: slot.id, provId, avgVal, moveScore });
    }
  }
  // Pick top-5 opponent moves, simulate them, return worst-case eval delta
  oppMoves.sort((a, b) => b.moveScore - a.moveScore);
  let worstEval = evaluateState(state);
  for (const om of oppMoves.slice(0, 5)) {
    const next = cloneSearchState(state);
    const slot = BORDER_SLOTS.find(s => s.id === om.slotId);
    if (!slot) continue;
    const provIdx = slot.p.indexOf(om.provId);
    const v0 = provIdx === 0 ? Math.round(om.avgVal) : Math.max(0, Math.round(om.avgVal) - 1);
    const v1 = provIdx === 1 ? Math.round(om.avgVal) : Math.max(0, Math.round(om.avgVal) - 1);
    next.board.push({
      slotId: om.slotId, pl: 0, rot: false,
      type: slot.type.charAt(0).toUpperCase() + slot.type.slice(1),
      v: [v0, v1], flipped: false,
    });
    next.occupied.add(om.slotId);
    const afterEffects = applyPostPlacement(next);
    const eval_ = evaluateState(afterEffects);
    if (eval_ < worstEval) worstEval = eval_;
  }
  return worstEval;
}

// ── Main Search Entry Point ──

function searchBotTurn(game, numPlacements, tokenLine) {
  const state = createSearchState(game);
  const sequences = enumerateTurnSequences(state, tokenLine, numPlacements);

  if (sequences.length === 0) return [];

  const avgValues = computeAvgOpponentValues(game);
  let bestScore = -Infinity;
  let bestMoves = [];

  for (const seq of sequences) {
    // Apply post-placement effects (province closure, border domination)
    const afterEffects = applyPostPlacement(seq.state);

    // Evaluate with opponent response
    const score = simulateOpponentResponse(afterEffects, avgValues);

    if (score > bestScore) {
      bestScore = score;
      bestMoves = seq.moves;
    }
  }

  return bestMoves;
}

// ── Execute Smart Bot Turn (drop-in replacement) ──

export function smartExecuteBotTurn(game) {
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
      solo.tokenLine.push(next.bags[1].pop());
    }
  }

  // Phase 2: Smart placement via minimax search
  const placements = [];
  const bestMoves = searchBotTurn(next, cmd.place, [...solo.tokenLine]);

  // Apply the chosen placements sequentially
  // Each move.tokenIndex is relative to the token line at that step (after prior removals)
  for (const move of bestMoves) {
    if (solo.tokenLine.length === 0) break;
    let idx = move.tokenIndex;
    if (idx >= solo.tokenLine.length) idx = 0;
    const tok = solo.tokenLine.splice(idx, 1)[0];
    if (!tok) break;
    next.board.push({
      tok: { type: tok.type, v: tok.v },
      slotId: move.slotId,
      rot: move.rotate,
      pl: 1,
    });
    placements.push(move.slotId);
  }

  // Phase 3: Discard from left of token line
  for (let i = 0; i < cmd.discard; i++) {
    if (solo.tokenLine.length > 0) {
      solo.tokenLine.shift();
    }
  }

  // Snapshot bonus state before closures
  const prevBonus = JSON.parse(JSON.stringify(next.bonus));

  // Check province closures
  const closed = checkAndCloseProvinces(next);
  const afterClose = closed !== next ? closed : next;
  afterClose.solo = next.solo;

  // Check border domination
  const afterBorder = checkBorderDomination(afterClose);
  if (afterBorder !== afterClose) afterBorder.solo = afterClose.solo;

  // Process bonus effects
  const { game: afterBonus, gotTactics } = processBotBonuses(afterBorder, prevBonus);
  afterBonus.solo = afterBorder.solo;

  let result = afterBonus;

  // Tactics: extra turn (max 1)
  if (gotTactics) {
    const extra = smartExecuteSingleExtra(result);
    result = extra.game;
    placements.push(...extra.placements);
  }

  result.cp = 0;
  return { game: result, command: cmd, placements };
}

// Simplified extra turn for Tactics bonus
function smartExecuteSingleExtra(game) {
  const next = JSON.parse(JSON.stringify(game));
  const solo = next.solo;

  if (solo.commandIdx >= solo.commandDeck.length) {
    solo.commandDeck = shuffle([...COMMAND_TILES]);
    solo.commandIdx = 0;
  }
  const cmd = solo.commandDeck[solo.commandIdx];
  solo.commandIdx++;

  for (let i = 0; i < cmd.draw; i++) {
    if (next.bags[1].length > 0) {
      solo.tokenLine.push(next.bags[1].pop());
    }
  }

  const placements = [];
  const bestMoves = searchBotTurn(next, cmd.place, [...solo.tokenLine]);
  for (const move of bestMoves) {
    if (solo.tokenLine.length === 0) break;
    let idx = move.tokenIndex;
    if (idx >= solo.tokenLine.length) idx = 0;
    const tok = solo.tokenLine.splice(idx, 1)[0];
    if (!tok) break;
    next.board.push({
      tok: { type: tok.type, v: tok.v },
      slotId: move.slotId,
      rot: move.rotate,
      pl: 1,
    });
    placements.push(move.slotId);
  }

  for (let i = 0; i < cmd.discard; i++) {
    if (solo.tokenLine.length > 0) solo.tokenLine.shift();
  }

  const closed = checkAndCloseProvinces(next);
  const afterClose = closed !== next ? closed : next;
  afterClose.solo = next.solo;
  const afterBorder = checkBorderDomination(afterClose);
  if (afterBorder !== afterClose) afterBorder.solo = afterClose.solo;

  return { game: afterBorder, placements };
}

// Bot bonus processing (same logic as soloEngine but inline to avoid circular deps)
function processBotBonuses(game, prevBonus) {
  const next = JSON.parse(JSON.stringify(game));
  const bot = 1;
  const newBonuses = next.bonus.filter((b, i) =>
    b.claimed && b.claimedBy === bot && !(prevBonus[i]?.claimed)
  );
  if (newBonuses.length === 0) return { game: next, gotTactics: false };

  const gotTactics = newBonuses.some(b => b.type === 'Tactics');
  const gotMight = newBonuses.some(b => b.type === 'Might');
  const wealthCount = newBonuses.filter(b => b.type === 'Wealth').length;

  for (let i = 0; i < wealthCount; i++) {
    if (next.bags[bot].length > 0) {
      next.solo.tokenLine.push(next.bags[bot].pop());
    }
  }

  if (gotMight) {
    // Smart might: flip the token that hurts bot most in a contested province
    let bestIdx = -1;
    let bestImpact = -Infinity;
    const state = createSearchState(next);
    for (let i = 0; i < next.board.length; i++) {
      const bt = next.board[i];
      if (bt.pl !== 0 || bt.flipped) continue;
      // Simulate flipping this token and measure eval improvement
      const flipped = cloneSearchState(state);
      const fb = flipped.board.find(b => b.slotId === bt.slotId && b.pl === 0);
      if (fb) fb.flipped = true;
      const impact = evaluateState(flipped) - evaluateState(state);
      if (impact > bestImpact) {
        bestImpact = impact;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      next.board[bestIdx].flipped = true;
    }
  }

  return { game: next, gotTactics };
}
