import { AI_OUTCOMES, AI_TURNS, terminalInfoForState } from './game-ai-model.js';
import {
  applyVirtualMoveToState,
  getBearLegalMovesForState,
  getHunterLegalMovesForState
} from './game-state-helpers.js';

const DRAW = AI_OUTCOMES.draw;
const HUNTERS_WIN = AI_OUTCOMES.huntersWin;

export function listStateSuccessors(state) {
  const mover = state.turn;
  const moves =
    mover === AI_TURNS.bear
      ? getBearLegalMovesForState(state).map((to) => ({ to }))
      : getHunterLegalMovesForState(state);

  return moves.map((move) => ({
    move,
    nextState: applyVirtualMoveToState(state, mover, move)
  }));
}

export function exactValueFromSuccessorInfo(successorInfo) {
  return {
    outcome: successorInfo.outcome,
    distance: successorInfo.distance + 1
  };
}

export function evaluateBearTurnFromSuccessors(successorInfos) {
  return selectBestExactValue(successorInfos, {
    defaultOutcome: HUNTERS_WIN,
    prefers(candidate, best) {
      if (candidate.outcome !== best.outcome) {
        return candidate.outcome === DRAW;
      }
      return candidate.distance > best.distance;
    }
  });
}

export function evaluateHuntersTurnFromSuccessors(successorInfos) {
  // Defensive fallback: legal encoded hunter turns always have at least one successor.
  return selectBestExactValue(successorInfos, {
    defaultOutcome: DRAW,
    prefers(candidate, best) {
      if (candidate.outcome !== best.outcome) {
        return candidate.outcome === HUNTERS_WIN;
      }

      if (candidate.outcome === HUNTERS_WIN) {
        return candidate.distance < best.distance;
      }

      return candidate.distance > best.distance;
    }
  });
}

export function evaluateNonTerminalStateFromSuccessors(state, successorInfos) {
  const terminal = terminalInfoForState(state);
  if (terminal) {
    return {
      ...terminal,
      optimalSuccessorIndexes: []
    };
  }

  return state.turn === AI_TURNS.bear
    ? evaluateBearTurnFromSuccessors(successorInfos)
    : evaluateHuntersTurnFromSuccessors(successorInfos);
}

function selectBestExactValue(successorInfos, policy) {
  let best = {
    outcome: policy.defaultOutcome,
    distance: 0
  };
  let optimalSuccessorIndexes = [];
  let hasChoice = false;

  for (let index = 0; index < successorInfos.length; index += 1) {
    const successorInfo = successorInfos[index];
    const candidate = exactValueFromSuccessorInfo(successorInfo);

    if (!hasChoice || policy.prefers(candidate, best)) {
      best = candidate;
      optimalSuccessorIndexes = [index];
      hasChoice = true;
      continue;
    }

    if (candidate.outcome === best.outcome && candidate.distance === best.distance) {
      optimalSuccessorIndexes.push(index);
    }
  }

  return {
    ...best,
    optimalSuccessorIndexes
  };
}
