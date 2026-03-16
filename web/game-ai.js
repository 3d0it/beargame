import {
  AI_HEURISTIC_PROFILE,
  DIFFICULTY_CONFIG,
  POSITION_PROFILE
} from './game-ai-profile.js';

export { DIFFICULTY_CONFIG } from './game-ai-profile.js';

const CENTER_NODE = POSITION_PROFILE.centerNode;
const INNER_RING_NODES = new Set(POSITION_PROFILE.innerRingNodes);
const OUTER_GATEWAYS = new Set(POSITION_PROFILE.outerGateways);

export function createAiEngine({
  adjacency,
  maxBearMoves,
  cloneState,
  nodeDistance,
  reachableCount,
  getBearLegalMoves,
  getHunterLegalMoves,
  applyVirtualMove,
  repetitionPenalty,
  moveBacktrackPenalty,
  responseLoopPenalty
}) {
  function sumWeightedFeatures(features, weights) {
    let total = 0;
    for (const [key, value] of Object.entries(features)) {
      total += value * (weights[key] ?? 0);
    }
    return total;
  }

  function stateCacheKey(local) {
    const hunters = [...local.hunters].sort((a, b) => a - b).join(',');
    return `${local.bear}|${hunters}|${local.bearMoves}|${local.turn}`;
  }

  function createAnalysisCache() {
    return {
      bearLegalMoves: new Map(),
      hunterLegalMoves: new Map(),
      reachableCounts: new Map(),
      hunterPressure: new Map(),
      centralControl: new Map(),
      bearEscape: new Map(),
      immediateTrap: new Map(),
      staticFeatures: new Map(),
      tacticalFeatures: new Map()
    };
  }

  function memoize(cache, key, compute) {
    if (cache.has(key)) return cache.get(key);
    const value = compute();
    cache.set(key, value);
    return value;
  }

  function scoreForPerspective(bearAdvantage, perspective) {
    return perspective === 'bear' ? bearAdvantage : -bearAdvantage;
  }

  function extendBearHistory(bearHistory, nextState) {
    if (!Array.isArray(bearHistory) || typeof nextState?.bear !== 'number') return bearHistory;
    const last = bearHistory[bearHistory.length - 1];
    if (last === nextState.bear) return bearHistory;
    return [...bearHistory, nextState.bear];
  }

  function searchBearLoopPenalty(nextState, bearHistory, perspective) {
    if (typeof nextState?.bear !== 'number' || !Array.isArray(bearHistory) || bearHistory.length === 0) {
      return 0;
    }

    let penalty = 0;

    for (let i = bearHistory.length - 1; i >= 0; i -= 1) {
      if (bearHistory[i] !== nextState.bear) continue;
      const recency = bearHistory.length - i;
      penalty += Math.max(
        0,
        AI_HEURISTIC_PROFILE.antiLoop.searchBearRepeatBase -
          recency * AI_HEURISTIC_PROFILE.antiLoop.searchBearRepeatRecencyStep
      );
      break;
    }

    if (bearHistory.length >= 2 && nextState.bear === bearHistory[bearHistory.length - 2]) {
      penalty += AI_HEURISTIC_PROFILE.antiLoop.searchBearBacktrackBase;
    }

    return scoreForPerspective(-penalty, perspective);
  }

  function cachedBearLegalMoves(local, analysis) {
    if (!analysis) return getBearLegalMoves(local);
    return memoize(analysis.bearLegalMoves, stateCacheKey(local), () => getBearLegalMoves(local));
  }

  function cachedHunterLegalMoves(local, analysis) {
    if (!analysis) return getHunterLegalMoves(local);
    return memoize(analysis.hunterLegalMoves, stateCacheKey(local), () => getHunterLegalMoves(local));
  }

  function cachedReachableCount(local, start, maxDepth, analysis) {
    if (!analysis) return reachableCount(local, start, maxDepth);
    const key = `${stateCacheKey(local)}|${start}|${maxDepth}`;
    return memoize(analysis.reachableCounts, key, () => reachableCount(local, start, maxDepth));
  }

  function hunterPressureProfile(local, analysis) {
    if (analysis) {
      return memoize(analysis.hunterPressure, stateCacheKey(local), () => hunterPressureProfile(local));
    }

    let trapReplies = 0;
    let squeezeReplies = 0;

    for (const move of getHunterLegalMoves(local)) {
      const afterHunter = applyVirtualMove(local, 'hunters', move);
      const mobilityAfter = getBearLegalMoves(afterHunter).length;
      if (mobilityAfter === 0) {
        trapReplies += 1;
      } else if (mobilityAfter === 1) {
        squeezeReplies += 1;
      }
    }

    return { trapReplies, squeezeReplies };
  }

  function centralControlProfile(local, analysis) {
    if (analysis) {
      return memoize(analysis.centralControl, stateCacheKey(local), () => centralControlProfile(local));
    }

    const bearAtCenter = local.bear === CENTER_NODE;
    const bearNearCenter = bearAtCenter || INNER_RING_NODES.has(local.bear);
    const bearAdjacency = adjacency.get(local.bear) ?? [];
    const directBlockers = bearAdjacency.filter((nodeId) => local.hunters.includes(nodeId)).length;
    const outerEscapes = getBearLegalMoves(local).filter(
      (nodeId) => nodeId !== CENTER_NODE && !INNER_RING_NODES.has(nodeId)
    ).length;
    const innerRingControl = [...INNER_RING_NODES].filter(
      (nodeId) => nodeId !== local.bear && local.hunters.includes(nodeId)
    ).length;
    const reachableOuterGateways = new Set();

    for (const to of getBearLegalMoves(local)) {
      for (const next of adjacency.get(to) ?? []) {
        if (OUTER_GATEWAYS.has(next) && !local.hunters.includes(next)) {
          reachableOuterGateways.add(next);
        }
      }
    }

    const openOuterGateways = [...OUTER_GATEWAYS].filter(
      (nodeId) => !local.hunters.includes(nodeId) && local.bear !== nodeId
    ).length;

    return {
      bearAtCenter,
      bearNearCenter,
      bearInCentralZone: bearNearCenter,
      directBlockers,
      outerEscapes,
      innerRingControl,
      openOuterGateways,
      reachableOuterGateways: reachableOuterGateways.size
    };
  }

  function bearEscapeProfile(local, analysis) {
    if (analysis) {
      return memoize(analysis.bearEscape, stateCacheKey(local), () => bearEscapeProfile(local));
    }

    let safeRoutes = 0;
    let trapRoutes = 0;
    let squeezeRoutes = 0;
    let frontierReach = 0;

    for (const to of getBearLegalMoves(local)) {
      const afterBear = applyVirtualMove(local, 'bear', { to });
      frontierReach += reachableCount(afterBear, to, 4);
      const { trapReplies, squeezeReplies } = hunterPressureProfile(afterBear);

      if (trapReplies > 0) {
        trapRoutes += 1;
      } else if (squeezeReplies > 0) {
        squeezeRoutes += 1;
      } else {
        safeRoutes += 1;
      }
    }

    return { safeRoutes, trapRoutes, squeezeRoutes, frontierReach };
  }

  function immediateTrapCount(local, analysis) {
    if (analysis) {
      return memoize(analysis.immediateTrap, stateCacheKey(local), () => immediateTrapCount(local));
    }

    let traps = 0;
    for (const move of getHunterLegalMoves(local)) {
      const afterHunter = applyVirtualMove(local, 'hunters', move);
      if (getBearLegalMoves(afterHunter).length === 0) traps += 1;
    }
    return traps;
  }

  function extractStaticFeatures(local, analysis) {
    if (analysis) {
      return memoize(analysis.staticFeatures, stateCacheKey(local), () => extractStaticFeatures(local));
    }

    let distanceSum = 0;
    let pressure = 0;
    for (const hunter of local.hunters) {
      const dist = nodeDistance(local.bear, hunter);
      distanceSum += dist;
      pressure += 1 / Math.max(1, dist);
    }

    const legalBearMoves = cachedBearLegalMoves(local, analysis);
    const mobility = legalBearMoves.length;
    const twoStepMobility = legalBearMoves
      .map((to) => {
        const simulated = cloneState(local);
        simulated.bear = to;
        return cachedBearLegalMoves(simulated, analysis).length;
      })
      .reduce((sum, value) => sum + value, 0);
    const reachable3 = cachedReachableCount(local, local.bear, 3, analysis);
    const safeAdjacents = legalBearMoves.filter(
      (to) => !local.hunters.some((hunter) => adjacency.get(to)?.includes(hunter))
    ).length;
    const { trapReplies, squeezeReplies } = hunterPressureProfile(local, analysis);
    const { safeRoutes, trapRoutes, squeezeRoutes, frontierReach } = bearEscapeProfile(local, analysis);
    const centerControl = centralControlProfile(local, analysis);
    const mobilityDanger =
      mobility <= 1
        ? AI_HEURISTIC_PROFILE.mobilityDanger.oneMove
        : mobility === 2
          ? AI_HEURISTIC_PROFILE.mobilityDanger.twoMoves
          : 0;

    return {
      mobility,
      twoStepMobility,
      reachable3,
      safeAdjacents,
      safeRoutes,
      frontierReach,
      distanceSum,
      pressure,
      trapReplies,
      squeezeReplies,
      trapRoutes,
      squeezeRoutes,
      bearAtCenter: centerControl.bearAtCenter ? 1 : 0,
      reachableOuterGateways: centerControl.bearNearCenter ? centerControl.reachableOuterGateways : 0,
      directBlockers: centerControl.bearInCentralZone ? centerControl.directBlockers : 0,
      innerRingControl: centerControl.bearInCentralZone ? centerControl.innerRingControl : 0,
      outerEscapes: centerControl.bearInCentralZone ? centerControl.outerEscapes : 0,
      centerDistance: nodeDistance(local.bear, CENTER_NODE),
      hunterAdjacency: local.hunters.filter((hunter) => adjacency.get(local.bear)?.includes(hunter)).length,
      mobilityDanger
    };
  }

  function staticScoreFromFeatures(features, perspective) {
    const weights =
      perspective === 'bear'
        ? AI_HEURISTIC_PROFILE.evaluation.bear
        : AI_HEURISTIC_PROFILE.evaluation.hunters;

    return (
      sumWeightedFeatures(
        {
          mobility: features.mobility,
          twoStepMobility: features.twoStepMobility,
          reachable3: features.reachable3,
          safeAdjacents: features.safeAdjacents,
          safeRoutes: features.safeRoutes,
          frontierReach: features.frontierReach,
          distanceSum: features.distanceSum,
          pressure: features.pressure,
          trapReplies: features.trapReplies,
          squeezeReplies: features.squeezeReplies,
          trapRoutes: features.trapRoutes,
          squeezeRoutes: features.squeezeRoutes,
          bearAtCenter: features.bearAtCenter,
          reachableOuterGateways: features.reachableOuterGateways,
          directBlockers: features.directBlockers,
          innerRingControl: features.innerRingControl,
          outerEscapes: features.outerEscapes,
          mobilityDanger: features.mobilityDanger,
          centerDistance: features.centerDistance,
          hunterAdjacency: features.hunterAdjacency
        },
        weights
      )
    );
  }

  function extractTacticalFeatures(local, sideToMove, move, analysis) {
    const key = `${stateCacheKey(local)}|${sideToMove}|${JSON.stringify(move)}`;
    if (analysis) {
      return memoize(analysis.tacticalFeatures, key, () => extractTacticalFeatures(local, sideToMove, move));
    }

    const next = applyVirtualMove(local, sideToMove, move);
    const mobility = cachedBearLegalMoves(next, analysis).length;
    const reachable4 = cachedReachableCount(next, next.bear, 4, analysis);
    const { trapReplies, squeezeReplies } = hunterPressureProfile(next, analysis);
    const { safeRoutes, trapRoutes, squeezeRoutes, frontierReach } = bearEscapeProfile(next, analysis);
    const immediateTraps = immediateTrapCount(next, analysis);
    const centerBefore = centralControlProfile(local, analysis);
    const centerAfter = centralControlProfile(next, analysis);

    return {
      safeRoutes,
      frontierReach,
      reachable4,
      mobility,
      bearAtCenter: centerAfter.bearAtCenter ? 1 : 0,
      reachableOuterGateways: centerAfter.bearNearCenter ? centerAfter.reachableOuterGateways : 0,
      directBlockers: centerAfter.bearInCentralZone ? centerAfter.directBlockers : 0,
      innerRingControl: centerAfter.bearInCentralZone ? centerAfter.innerRingControl : 0,
      outerEscapes: centerAfter.bearInCentralZone ? centerAfter.outerEscapes : 0,
      trapReplies,
      immediateTraps,
      squeezeReplies,
      trapRoutes,
      squeezeRoutes,
      reachableOuterGatewaysDelta: centerBefore.reachableOuterGateways - centerAfter.reachableOuterGateways,
      openOuterGatewaysDelta: centerBefore.openOuterGateways - centerAfter.openOuterGateways,
      outerEscapesDelta: centerBefore.outerEscapes - centerAfter.outerEscapes
    };
  }

  function tacticalMoveScore(local, sideToMove, move, analysis) {
    const features = extractTacticalFeatures(local, sideToMove, move, analysis);

    if (sideToMove === 'bear') {
      return sumWeightedFeatures(features, AI_HEURISTIC_PROFILE.tactical.bear);
    }

    return sumWeightedFeatures(features, AI_HEURISTIC_PROFILE.tactical.hunters);
  }

  function isTacticalState(local, analysis) {
    const mobility = cachedBearLegalMoves(local, analysis).length;
    if (mobility <= 2) return true;
    const { trapReplies, squeezeReplies } = hunterPressureProfile(local, analysis);
    if (trapReplies > 0 || squeezeReplies > 0) return true;
    const { trapRoutes, squeezeRoutes } = bearEscapeProfile(local, analysis);
    return trapRoutes > 0 || squeezeRoutes > 0;
  }

  function evaluateState(local, perspective = 'bear', analysis) {
    const mobility = cachedBearLegalMoves(local, analysis).length;
    const trapped = local.bear !== null && mobility === 0;
    const escaped = local.bearMoves >= maxBearMoves;

    if (trapped) {
      const score =
        AI_HEURISTIC_PROFILE.terminal.trappedBase +
        local.bearMoves * AI_HEURISTIC_PROFILE.terminal.trappedMoveBonus;
      return perspective === 'bear' ? score : -score;
    }
    if (escaped) {
      const score =
        AI_HEURISTIC_PROFILE.terminal.escapedBase -
        local.bearMoves * AI_HEURISTIC_PROFILE.terminal.escapedMovePenalty;
      return perspective === 'bear' ? score : -score;
    }

    const features = extractStaticFeatures(local, analysis);
    return staticScoreFromFeatures(features, perspective);
  }

  function legalMovesFor(side, local, analysis) {
    if (side === 'bear') return cachedBearLegalMoves(local, analysis).map((to) => ({ to }));
    return cachedHunterLegalMoves(local, analysis);
  }

  function orderedMoves(local, sideToMove, perspective, maximizing, analysis, bearHistory) {
    const moves = legalMovesFor(sideToMove, local, analysis);
    return moves.sort((a, b) => {
      const stateA = applyVirtualMove(local, sideToMove, a);
      const stateB = applyVirtualMove(local, sideToMove, b);
      const searchPenaltyA = sideToMove === 'bear' ? searchBearLoopPenalty(stateA, bearHistory, perspective) : 0;
      const searchPenaltyB = sideToMove === 'bear' ? searchBearLoopPenalty(stateB, bearHistory, perspective) : 0;
      const scoreA =
        evaluateState(stateA, perspective, analysis) +
        tacticalMoveScore(local, sideToMove, a, analysis) -
        repetitionPenalty(stateA) -
        responseLoopPenalty(sideToMove, local, stateA) -
        moveBacktrackPenalty(sideToMove, a) +
        searchPenaltyA;
      const scoreB =
        evaluateState(stateB, perspective, analysis) +
        tacticalMoveScore(local, sideToMove, b, analysis) -
        repetitionPenalty(stateB) -
        responseLoopPenalty(sideToMove, local, stateB) -
        moveBacktrackPenalty(sideToMove, b) +
        searchPenaltyB;
      return maximizing ? scoreB - scoreA : scoreA - scoreB;
    });
  }

  function stateHash(local, depth, quiescenceDepth, sideToMove, perspective) {
    const hunters = [...local.hunters].sort((a, b) => a - b).join(',');
    return `${local.bear}|${hunters}|${local.bearMoves}|${depth}|${quiescenceDepth}|${sideToMove}|${perspective}`;
  }

  function minimax(local, depth, quiescenceDepth, sideToMove, perspective, alpha, beta, transposition, analysis, bearHistory) {
    const bearMoves = cachedBearLegalMoves(local, analysis);
    const terminalBearTrapped = local.bear !== null && bearMoves.length === 0;
    if (terminalBearTrapped || local.bearMoves >= maxBearMoves) {
      return evaluateState(local, perspective, analysis);
    }

    if (depth === 0) {
      if (quiescenceDepth <= 0 || !isTacticalState(local, analysis)) {
        return evaluateState(local, perspective, analysis);
      }
      depth = 1;
      quiescenceDepth -= 1;
    }

    const key = stateHash(local, depth, quiescenceDepth, sideToMove, perspective);
    const cached = transposition.get(key);
    if (cached !== undefined) return cached;

    const maximizing = sideToMove === perspective;
    const moves = orderedMoves(local, sideToMove, perspective, maximizing, analysis, bearHistory);
    if (moves.length === 0) {
      return evaluateState(local, perspective, analysis);
    }

    if (maximizing) {
      let best = -Infinity;
      for (const move of moves) {
        const next = applyVirtualMove(local, sideToMove, move);
        const nextBearHistory = sideToMove === 'bear' ? extendBearHistory(bearHistory, next) : bearHistory;
        const score = minimax(
          next,
          depth - 1,
          quiescenceDepth,
          sideToMove === 'bear' ? 'hunters' : 'bear',
          perspective,
          alpha,
          beta,
          transposition,
          analysis,
          nextBearHistory
        );
        if (score > best) best = score;
        if (score > alpha) alpha = score;
        if (beta <= alpha) break;
      }
      transposition.set(key, best);
      return best;
    }

    let best = Infinity;
    for (const move of moves) {
      const next = applyVirtualMove(local, sideToMove, move);
      const nextBearHistory = sideToMove === 'bear' ? extendBearHistory(bearHistory, next) : bearHistory;
      const score = minimax(
        next,
        depth - 1,
        quiescenceDepth,
        sideToMove === 'bear' ? 'hunters' : 'bear',
        perspective,
        alpha,
        beta,
        transposition,
        analysis,
        nextBearHistory
      );
      if (score < best) best = score;
      if (score < beta) beta = score;
      if (beta <= alpha) break;
    }
    transposition.set(key, best);
    return best;
  }

  function greedyRolloutScore(local, perspective, pliesRemaining, analysis, bearHistory = [local.bear]) {
    let current = cloneState(local);
    let sideToMove = current.turn ?? perspective;
    let currentBearHistory = bearHistory;

    for (let ply = 0; ply < pliesRemaining; ply += 1) {
      if (current.bear === null || current.bearMoves >= maxBearMoves || cachedBearLegalMoves(current, analysis).length === 0) {
        break;
      }

      const moves = legalMovesFor(sideToMove, current, analysis);
      if (moves.length === 0) break;

      const maximizing = sideToMove === perspective;
      let chosenMove = moves[0];
      let chosenScore = maximizing ? -Infinity : Infinity;

      for (const move of moves) {
        const next = applyVirtualMove(current, sideToMove, move);
        const score =
          evaluateState(next, perspective, analysis) +
          tacticalMoveScore(current, sideToMove, move, analysis) +
          (sideToMove === 'bear' ? searchBearLoopPenalty(next, currentBearHistory, perspective) : 0);
        if (maximizing ? score > chosenScore : score < chosenScore) {
          chosenScore = score;
          chosenMove = move;
        }
      }

      current = applyVirtualMove(current, sideToMove, chosenMove);
      if (sideToMove === 'bear') currentBearHistory = extendBearHistory(currentBearHistory, current);
      sideToMove = sideToMove === 'bear' ? 'hunters' : 'bear';
    }

    return evaluateState(current, perspective, analysis);
  }

  function selectTacticalMoveWithRollout(local, sideToMove, perspective, moves, rolloutDepth, analysis, bearHistory) {
    if (rolloutDepth <= 0 || moves.length === 0) return null;
    if (!isTacticalState(local, analysis)) return null;

    let bestMove = null;
    let bestScore = -Infinity;

    for (const move of moves) {
      const simulated = applyVirtualMove(local, sideToMove, move);
      const nextBearHistory = sideToMove === 'bear' ? extendBearHistory(bearHistory, simulated) : bearHistory;
      const score =
        greedyRolloutScore(simulated, perspective, rolloutDepth, analysis, nextBearHistory) +
        tacticalMoveScore(local, sideToMove, move, analysis) -
        repetitionPenalty(simulated) -
        responseLoopPenalty(sideToMove, local, simulated) -
        moveBacktrackPenalty(sideToMove, move) +
        (sideToMove === 'bear' ? searchBearLoopPenalty(simulated, bearHistory, perspective) : 0);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  function chooseBearMove(local, difficulty, difficultyConfig) {
    const analysis = createAnalysisCache();
    const bearHistory = [local.bear];
    const moves = cachedBearLegalMoves(local, analysis);
    if (moves.length === 0) return null;

    if (difficulty === 'easy') {
      let bestMove = moves[0];
      let bestScore = -Infinity;

      for (const to of moves) {
        const simulated = cloneState(local);
        simulated.bear = to;
        const hunterResponses = cachedHunterLegalMoves(simulated, analysis);
        let worstReply = Infinity;
        if (hunterResponses.length === 0) {
          worstReply = evaluateState(simulated, 'bear', analysis);
        } else {
          for (const reply of hunterResponses) {
            const afterReply = cloneState(simulated);
            afterReply.hunters[reply.hunterIndex] = reply.to;
            worstReply = Math.min(worstReply, evaluateState(afterReply, 'bear', analysis));
          }
        }

        if (worstReply > bestScore) {
          bestScore = worstReply;
          bestMove = to;
        }
      }

      return bestMove;
    }

    const { bearDepth: depth, quiescenceDepth, rolloutDepth, rolloutWeight } = difficultyConfig;
    const tacticalOverride = selectTacticalMoveWithRollout(
      local,
      'bear',
      'bear',
      moves.map((to) => ({ to })),
      rolloutDepth,
      analysis,
      bearHistory
    );
    if (tacticalOverride) return tacticalOverride.to;
    const effectiveDepth =
      difficulty === 'hard'
        ? depth +
          (moves.length <= 2
            ? AI_HEURISTIC_PROFILE.search.hardBearLowMobilityDepthBonus
            : hunterPressureProfile(local, analysis).trapReplies > 0
              ? AI_HEURISTIC_PROFILE.search.hardBearTrapReplyDepthBonus
              : 0)
        : depth;
    let bestMove = moves[0];
    let bestScore = -Infinity;
    const transposition = new Map();

    for (const to of moves) {
      const simulated = applyVirtualMove(local, 'bear', { to });
      const nextBearHistory = extendBearHistory(bearHistory, simulated);
      const rolloutBonus =
        rolloutDepth > 0 && isTacticalState(simulated, analysis)
          ? greedyRolloutScore(simulated, 'bear', rolloutDepth, analysis, nextBearHistory) * rolloutWeight
          : 0;
      const score =
        minimax(
          simulated,
          effectiveDepth - 1,
          quiescenceDepth,
          'hunters',
          'bear',
          -Infinity,
          Infinity,
          transposition,
          analysis,
          nextBearHistory
        ) +
        tacticalMoveScore(local, 'bear', { to }, analysis) +
        rolloutBonus -
        repetitionPenalty(simulated) -
        responseLoopPenalty('bear', local, simulated) -
        moveBacktrackPenalty('bear', { to }) +
        searchBearLoopPenalty(simulated, bearHistory, 'bear');
      if (score > bestScore) {
        bestScore = score;
        bestMove = to;
      }
    }

    return bestMove;
  }

  function chooseHunterMove(local, difficulty, difficultyConfig) {
    const analysis = createAnalysisCache();
    const bearHistory = [local.bear];
    const moves = cachedHunterLegalMoves(local, analysis);
    if (moves.length === 0) return null;

    if (difficulty === 'easy') {
      let best = moves[0];
      let bestScore = Infinity;

      for (const move of moves) {
        const simulated = cloneState(local);
        simulated.hunters[move.hunterIndex] = move.to;
        const score = cachedBearLegalMoves(simulated, analysis).length;
        if (score < bestScore) {
          bestScore = score;
          best = move;
        }
      }

      return best;
    }

    const { hunterDepth: depth, quiescenceDepth, rolloutDepth, rolloutWeight } = difficultyConfig;
    const tacticalOverride = selectTacticalMoveWithRollout(
      local,
      'hunters',
      'hunters',
      moves,
      rolloutDepth,
      analysis,
      bearHistory
    );
    if (tacticalOverride) return tacticalOverride;
    const bearProfile = bearEscapeProfile(local, analysis);
    const effectiveDepth =
      difficulty === 'hard'
        ? depth + (bearProfile.safeRoutes <= 1 ? AI_HEURISTIC_PROFILE.search.hardHunterLowSafeRoutesDepthBonus : 0)
        : depth;
    let best = moves[0];
    let bestScore = -Infinity;
    const transposition = new Map();

    for (const move of moves) {
      const simulated = applyVirtualMove(local, 'hunters', move);
      const rolloutBonus =
        rolloutDepth > 0 && isTacticalState(simulated, analysis)
          ? greedyRolloutScore(simulated, 'hunters', rolloutDepth, analysis) * rolloutWeight
          : 0;
      const score =
        minimax(
          simulated,
          effectiveDepth - 1,
          quiescenceDepth,
          'bear',
          'hunters',
          -Infinity,
          Infinity,
          transposition,
          analysis,
          bearHistory
        ) +
        tacticalMoveScore(local, 'hunters', move, analysis) +
        rolloutBonus -
        repetitionPenalty(simulated) -
        responseLoopPenalty('hunters', local, simulated) -
        moveBacktrackPenalty('hunters', move);
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }

    return best;
  }

  function scoreLunette(local, lunette, difficulty, difficultyConfig, boardNodes) {
    const analysis = createAnalysisCache();
    let bearBestReply = -Infinity;

    for (const node of boardNodes) {
      if (lunette.includes(node.id)) continue;
      const simulated = cloneState(local);
      simulated.hunters = [...lunette];
      simulated.bear = node.id;
      const immediate = evaluateState(simulated, 'bear', analysis);

      if (difficulty === 'easy') {
        bearBestReply = Math.max(bearBestReply, immediate);
        continue;
      }

      const responseScore = minimax(
        simulated,
        difficultyConfig.setupDepth,
        difficultyConfig.quiescenceDepth,
        'bear',
        'bear',
        -Infinity,
        Infinity,
        new Map(),
        analysis
      );
      bearBestReply = Math.max(bearBestReply, responseScore);
    }

    return bearBestReply;
  }

  function chooseBearStartPosition(local, difficulty, difficultyConfig, freePositions) {
    const analysis = createAnalysisCache();
    if (freePositions.length === 0) return null;
    let best = freePositions[0];
    let bestScore = -Infinity;

    for (const pos of freePositions) {
      const simulated = cloneState(local);
      simulated.bear = pos;
      let score = evaluateState(simulated, 'bear', analysis);

      if (difficulty !== 'easy') {
        score = minimax(
          simulated,
          difficultyConfig.setupDepth,
          difficultyConfig.quiescenceDepth,
          'bear',
          'bear',
          -Infinity,
          Infinity,
          new Map(),
          analysis
        );
      }

      if (score > bestScore) {
        bestScore = score;
        best = pos;
      }
    }

    return best;
  }

  return {
    chooseBearMove,
    chooseHunterMove,
    chooseBearStartPosition,
    scoreLunette
  };
}
