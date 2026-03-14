export const DIFFICULTY_CONFIG = {
  easy: { bearDepth: 1, hunterDepth: 1, setupDepth: 1, quiescenceDepth: 0, rolloutDepth: 0, rolloutWeight: 0, targetRating: 3 },
  medium: { bearDepth: 2, hunterDepth: 2, setupDepth: 1, quiescenceDepth: 0, rolloutDepth: 0, rolloutWeight: 0, targetRating: 5 },
  hard: { bearDepth: 8, hunterDepth: 5, setupDepth: 5, quiescenceDepth: 2, rolloutDepth: 5, rolloutWeight: 0.6, targetRating: 8 }
};

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
  moveBacktrackPenalty
}) {
  function hunterPressureProfile(local) {
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

  function bearEscapeProfile(local) {
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

  function immediateTrapCount(local) {
    let traps = 0;
    for (const move of getHunterLegalMoves(local)) {
      const afterHunter = applyVirtualMove(local, 'hunters', move);
      if (getBearLegalMoves(afterHunter).length === 0) traps += 1;
    }
    return traps;
  }

  function tacticalMoveScore(local, sideToMove, move) {
    const next = applyVirtualMove(local, sideToMove, move);
    const mobility = getBearLegalMoves(next).length;
    const reachable4 = reachableCount(next, next.bear, 4);
    const { trapReplies, squeezeReplies } = hunterPressureProfile(next);
    const { safeRoutes, trapRoutes, squeezeRoutes, frontierReach } = bearEscapeProfile(next);
    const immediateTraps = immediateTrapCount(next);

    if (sideToMove === 'bear') {
      return (
        safeRoutes * 420 +
        frontierReach * 22 +
        reachable4 * 14 +
        mobility * 160 -
        trapReplies * 1500 -
        immediateTraps * 1700 -
        squeezeReplies * 340 -
        trapRoutes * 620 -
        squeezeRoutes * 210
      );
    }

    return (
      immediateTraps * 1800 +
      trapRoutes * 520 +
      squeezeRoutes * 180 -
      safeRoutes * 360 -
      reachable4 * 24 -
      mobility * 240 -
      trapReplies * 60
    );
  }

  function isTacticalState(local) {
    const mobility = getBearLegalMoves(local).length;
    if (mobility <= 2) return true;
    const { trapReplies, squeezeReplies } = hunterPressureProfile(local);
    if (trapReplies > 0 || squeezeReplies > 0) return true;
    const { trapRoutes, squeezeRoutes } = bearEscapeProfile(local);
    return trapRoutes > 0 || squeezeRoutes > 0;
  }

  function evaluateState(local, perspective = 'bear') {
    const mobility = getBearLegalMoves(local).length;
    const trapped = local.bear !== null && mobility === 0;
    const escaped = local.bearMoves >= maxBearMoves;

    if (trapped) {
      const score = -250000 + local.bearMoves * 140;
      return perspective === 'bear' ? score : -score;
    }
    if (escaped) {
      const score = 250000 - local.bearMoves * 80;
      return perspective === 'bear' ? score : -score;
    }

    let distanceSum = 0;
    let pressure = 0;
    for (const hunter of local.hunters) {
      const dist = nodeDistance(local.bear, hunter);
      distanceSum += dist;
      pressure += 1 / Math.max(1, dist);
    }

    const centerDistance = nodeDistance(local.bear, 18);
    const hunterAdjacency = local.hunters.filter((hunter) => adjacency.get(local.bear)?.includes(hunter)).length;
    const twoStepMobility = getBearLegalMoves(local)
      .map((to) => {
        const simulated = cloneState(local);
        simulated.bear = to;
        return getBearLegalMoves(simulated).length;
      })
      .reduce((sum, value) => sum + value, 0);
    const reachable3 = reachableCount(local, local.bear, 3);
    const safeAdjacents = getBearLegalMoves(local).filter(
      (to) => !local.hunters.some((hunter) => adjacency.get(to)?.includes(hunter))
    ).length;
    const { trapReplies, squeezeReplies } = hunterPressureProfile(local);
    const { safeRoutes, trapRoutes, squeezeRoutes, frontierReach } = bearEscapeProfile(local);
    const mobilityDanger = mobility <= 1 ? 180 : mobility === 2 ? 80 : 0;

    const bearScore =
      mobility * 52 +
      twoStepMobility * 16 +
      reachable3 * 10 +
      safeAdjacents * 14 +
      safeRoutes * 42 +
      frontierReach * 5 +
      distanceSum * 0.7 -
      pressure * 140 -
      trapReplies * 90 -
      squeezeReplies * 26 -
      trapRoutes * 120 -
      squeezeRoutes * 55 -
      mobilityDanger -
      centerDistance * 0.5 -
      hunterAdjacency * 32;
    return perspective === 'bear' ? bearScore : -bearScore;
  }

  function legalMovesFor(side, local) {
    if (side === 'bear') return getBearLegalMoves(local).map((to) => ({ to }));
    return getHunterLegalMoves(local);
  }

  function orderedMoves(local, sideToMove, perspective, maximizing) {
    const moves = legalMovesFor(sideToMove, local);
    return moves.sort((a, b) => {
      const stateA = applyVirtualMove(local, sideToMove, a);
      const stateB = applyVirtualMove(local, sideToMove, b);
      const scoreA =
        evaluateState(stateA, perspective) +
        tacticalMoveScore(local, sideToMove, a) -
        repetitionPenalty(stateA) -
        moveBacktrackPenalty(sideToMove, a);
      const scoreB =
        evaluateState(stateB, perspective) +
        tacticalMoveScore(local, sideToMove, b) -
        repetitionPenalty(stateB) -
        moveBacktrackPenalty(sideToMove, b);
      return maximizing ? scoreB - scoreA : scoreA - scoreB;
    });
  }

  function stateHash(local, depth, quiescenceDepth, sideToMove, perspective) {
    const hunters = [...local.hunters].sort((a, b) => a - b).join(',');
    return `${local.bear}|${hunters}|${local.bearMoves}|${depth}|${quiescenceDepth}|${sideToMove}|${perspective}`;
  }

  function minimax(local, depth, quiescenceDepth, sideToMove, perspective, alpha, beta, transposition) {
    const bearMoves = getBearLegalMoves(local);
    const terminalBearTrapped = local.bear !== null && bearMoves.length === 0;
    if (terminalBearTrapped || local.bearMoves >= maxBearMoves) {
      return evaluateState(local, perspective);
    }

    if (depth === 0) {
      if (quiescenceDepth <= 0 || !isTacticalState(local)) {
        return evaluateState(local, perspective);
      }
      depth = 1;
      quiescenceDepth -= 1;
    }

    const key = stateHash(local, depth, quiescenceDepth, sideToMove, perspective);
    const cached = transposition.get(key);
    if (cached !== undefined) return cached;

    const maximizing = sideToMove === perspective;
    const moves = orderedMoves(local, sideToMove, perspective, maximizing);
    if (moves.length === 0) {
      return evaluateState(local, perspective);
    }

    if (maximizing) {
      let best = -Infinity;
      for (const move of moves) {
        const next = applyVirtualMove(local, sideToMove, move);
        const score = minimax(
          next,
          depth - 1,
          quiescenceDepth,
          sideToMove === 'bear' ? 'hunters' : 'bear',
          perspective,
          alpha,
          beta,
          transposition
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
      const score = minimax(
        next,
        depth - 1,
        quiescenceDepth,
        sideToMove === 'bear' ? 'hunters' : 'bear',
        perspective,
        alpha,
        beta,
        transposition
      );
      if (score < best) best = score;
      if (score < beta) beta = score;
      if (beta <= alpha) break;
    }
    transposition.set(key, best);
    return best;
  }

  function greedyRolloutScore(local, perspective, pliesRemaining) {
    let current = cloneState(local);
    let sideToMove = current.turn ?? perspective;

    for (let ply = 0; ply < pliesRemaining; ply += 1) {
      if (current.bear === null || current.bearMoves >= maxBearMoves || getBearLegalMoves(current).length === 0) {
        break;
      }

      const moves = legalMovesFor(sideToMove, current);
      if (moves.length === 0) break;

      const maximizing = sideToMove === perspective;
      let chosenMove = moves[0];
      let chosenScore = maximizing ? -Infinity : Infinity;

      for (const move of moves) {
        const next = applyVirtualMove(current, sideToMove, move);
        const score = evaluateState(next, perspective) + tacticalMoveScore(current, sideToMove, move);
        if (maximizing ? score > chosenScore : score < chosenScore) {
          chosenScore = score;
          chosenMove = move;
        }
      }

      current = applyVirtualMove(current, sideToMove, chosenMove);
      sideToMove = sideToMove === 'bear' ? 'hunters' : 'bear';
    }

    return evaluateState(current, perspective);
  }

  function selectTacticalMoveWithRollout(local, sideToMove, perspective, moves, rolloutDepth) {
    if (rolloutDepth <= 0 || moves.length === 0) return null;
    if (!isTacticalState(local)) return null;

    let bestMove = null;
    let bestScore = -Infinity;

    for (const move of moves) {
      const simulated = applyVirtualMove(local, sideToMove, move);
      const score =
        greedyRolloutScore(simulated, perspective, rolloutDepth) +
        tacticalMoveScore(local, sideToMove, move) -
        repetitionPenalty(simulated) -
        moveBacktrackPenalty(sideToMove, move);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  function chooseBearMove(local, difficulty, difficultyConfig) {
    const moves = getBearLegalMoves(local);
    if (moves.length === 0) return null;

    if (difficulty === 'easy') {
      let bestMove = moves[0];
      let bestScore = -Infinity;

      for (const to of moves) {
        const simulated = cloneState(local);
        simulated.bear = to;
        const hunterResponses = getHunterLegalMoves(simulated);
        let worstReply = Infinity;
        if (hunterResponses.length === 0) {
          worstReply = evaluateState(simulated, 'bear');
        } else {
          for (const reply of hunterResponses) {
            const afterReply = cloneState(simulated);
            afterReply.hunters[reply.hunterIndex] = reply.to;
            worstReply = Math.min(worstReply, evaluateState(afterReply, 'bear'));
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
    const tacticalOverride = selectTacticalMoveWithRollout(local, 'bear', 'bear', moves.map((to) => ({ to })), rolloutDepth);
    if (tacticalOverride) return tacticalOverride.to;
    const effectiveDepth =
      difficulty === 'hard'
        ? depth + (moves.length <= 2 ? 2 : hunterPressureProfile(local).trapReplies > 0 ? 1 : 0)
        : depth;
    let bestMove = moves[0];
    let bestScore = -Infinity;
    const transposition = new Map();

    for (const to of moves) {
      const simulated = applyVirtualMove(local, 'bear', { to });
      const rolloutBonus =
        rolloutDepth > 0 && isTacticalState(simulated)
          ? greedyRolloutScore(simulated, 'bear', rolloutDepth) * rolloutWeight
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
          transposition
        ) +
        tacticalMoveScore(local, 'bear', { to }) +
        rolloutBonus -
        repetitionPenalty(simulated) -
        moveBacktrackPenalty('bear', { to });
      if (score > bestScore) {
        bestScore = score;
        bestMove = to;
      }
    }

    return bestMove;
  }

  function chooseHunterMove(local, difficulty, difficultyConfig) {
    const moves = getHunterLegalMoves(local);
    if (moves.length === 0) return null;

    if (difficulty === 'easy') {
      let best = moves[0];
      let bestScore = Infinity;

      for (const move of moves) {
        const simulated = cloneState(local);
        simulated.hunters[move.hunterIndex] = move.to;
        const score = getBearLegalMoves(simulated).length;
        if (score < bestScore) {
          bestScore = score;
          best = move;
        }
      }

      return best;
    }

    const { hunterDepth: depth, quiescenceDepth, rolloutDepth, rolloutWeight } = difficultyConfig;
    const tacticalOverride = selectTacticalMoveWithRollout(local, 'hunters', 'hunters', moves, rolloutDepth);
    if (tacticalOverride) return tacticalOverride;
    const bearProfile = bearEscapeProfile(local);
    const effectiveDepth =
      difficulty === 'hard'
        ? depth + (bearProfile.safeRoutes <= 1 ? 1 : 0)
        : depth;
    let best = moves[0];
    let bestScore = -Infinity;
    const transposition = new Map();

    for (const move of moves) {
      const simulated = applyVirtualMove(local, 'hunters', move);
      const rolloutBonus =
        rolloutDepth > 0 && isTacticalState(simulated)
          ? greedyRolloutScore(simulated, 'hunters', rolloutDepth) * rolloutWeight
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
          transposition
        ) +
        tacticalMoveScore(local, 'hunters', move) +
        rolloutBonus -
        repetitionPenalty(simulated) -
        moveBacktrackPenalty('hunters', move);
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }

    return best;
  }

  function scoreLunette(local, lunette, difficulty, difficultyConfig, boardNodes) {
    let bearBestReply = -Infinity;

    for (const node of boardNodes) {
      if (lunette.includes(node.id)) continue;
      const simulated = cloneState(local);
      simulated.hunters = [...lunette];
      simulated.bear = node.id;
      const immediate = evaluateState(simulated, 'bear');

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
        new Map()
      );
      bearBestReply = Math.max(bearBestReply, responseScore);
    }

    return bearBestReply;
  }

  function chooseBearStartPosition(local, difficulty, difficultyConfig, freePositions) {
    if (freePositions.length === 0) return null;
    let best = freePositions[0];
    let bestScore = -Infinity;

    for (const pos of freePositions) {
      const simulated = cloneState(local);
      simulated.bear = pos;
      let score = evaluateState(simulated, 'bear');

      if (difficulty !== 'easy') {
        score = minimax(
          simulated,
          difficultyConfig.setupDepth,
          difficultyConfig.quiescenceDepth,
          'bear',
          'bear',
          -Infinity,
          Infinity,
          new Map()
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
