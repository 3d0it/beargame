import { TURN_HINT_CODES, VALIDATION_ERROR_CODES } from './game-state-codes.js';

export function createRulesEngine({
  stateRef,
  adjacency,
  cloneState,
  isValidNodeId,
  isOccupied,
  getBearLegalMoves,
  getValidBearStartPositions,
  isBearTrapped,
  rememberMove,
  rememberPosition,
  rememberResponsePattern,
  finishRound,
  maxBearMoves,
  hints
}) {
  function canMove(from, to, local = stateRef.current) {
    if (!isValidNodeId(from) || !isValidNodeId(to)) return false;
    return adjacency.get(from).includes(to) && !isOccupied(to, local);
  }

  function applyBearMove(to) {
    const state = stateRef.current;
    if (!canMove(state.bear, to)) return false;

    const before = cloneState(state);
    const from = state.bear;
    state.bear = to;
    state.bearMoves += 1;
    state.validationErrorCode = VALIDATION_ERROR_CODES.NONE;

    if (isBearTrapped()) {
      state.message = `Orso bloccato in ${state.bearMoves} mosse.`;
      state.turnHintCode = TURN_HINT_CODES.MATCH_OVER;
      finishRound('hunters-win');
      return true;
    }

    if (state.bearMoves >= maxBearMoves) {
      state.message = "L'Orso non è stato immobilizzato entro 40 mosse: manche patta.";
      state.turnHintCode = TURN_HINT_CODES.MATCH_OVER;
      finishRound('draw');
      return true;
    }

    state.turn = 'hunters';
    state.message = hints.huntersTurn;
    state.turnHintCode = TURN_HINT_CODES.HUNTERS_TURN;
    rememberMove('bear', from, to);
    rememberPosition();
    rememberResponsePattern('bear', before, state);
    return true;
  }

  function applyHunterMove(hunterIndex, to) {
    const state = stateRef.current;
    if (!Number.isInteger(hunterIndex) || hunterIndex < 0 || hunterIndex >= state.hunters.length) {
      return false;
    }

    const before = cloneState(state);
    const from = state.hunters[hunterIndex];
    if (!canMove(from, to)) return false;

    state.hunters[hunterIndex] = to;
    state.selectedHunter = null;
    state.validationErrorCode = VALIDATION_ERROR_CODES.NONE;

    if (isBearTrapped()) {
      state.message = `Orso bloccato in ${state.bearMoves} mosse.`;
      state.turnHintCode = TURN_HINT_CODES.MATCH_OVER;
      finishRound('hunters-win');
      return true;
    }

    state.turn = 'bear';
    state.message = hints.bearTurn;
    state.turnHintCode = TURN_HINT_CODES.BEAR_TURN;
    rememberMove('hunters', from, to);
    rememberPosition();
    rememberResponsePattern('hunters', before, state);
    return true;
  }

  function chooseHuntersLunette(lunette) {
    const state = stateRef.current;
    state.hunters = [...lunette];
    state.selectedHunter = null;

    const validBearStarts = getValidBearStartPositions();
    if (validBearStarts.length === 0) {
      state.message = 'Orso bloccato in 0 mosse.';
      finishRound('hunters-win');
      return;
    }

    state.phase = 'setup-bear';
    state.turn = 'bear';
    state.message = "L'Orso sceglie una posizione iniziale.";
    state.turnHintCode = TURN_HINT_CODES.BEAR_SETUP;
    state.validationErrorCode = VALIDATION_ERROR_CODES.NONE;
    rememberPosition();
  }

  function setBearStartPosition(nodeId) {
    const state = stateRef.current;
    state.bear = nodeId;
    state.phase = 'playing';
    state.turn = 'bear';
    state.message = hints.bearTurn;
    state.turnHintCode = TURN_HINT_CODES.BEAR_TURN;
    state.validationErrorCode = VALIDATION_ERROR_CODES.NONE;
    rememberPosition();
  }

  return {
    canMove,
    applyBearMove,
    applyHunterMove,
    chooseHuntersLunette,
    setBearStartPosition
  };
}
