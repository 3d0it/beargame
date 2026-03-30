import { GAME_PHASES, TURN_HINT_CODES, VALIDATION_ERROR_CODES } from './game-state-codes.js';

const STATUS_BY_TURN_HINT = {
  [TURN_HINT_CODES.HUNTERS_SETUP]: "Cacciatori: scegli una lunetta sull'arco esterno.",
  [TURN_HINT_CODES.BEAR_SETUP]: 'Orso: scegli la posizione iniziale.',
  [TURN_HINT_CODES.BEAR_TURN]: 'Orso: scegli una casella adiacente libera.',
  [TURN_HINT_CODES.HUNTERS_TURN]: 'Cacciatori: seleziona pedina e destinazione adiacente.',
  [TURN_HINT_CODES.HUNTER_SELECTED]: 'Cacciatore selezionato: scegli una casella libera.',
  [TURN_HINT_CODES.MATCH_OVER]: 'Partita conclusa.'
};

const STATUS_BY_VALIDATION_ERROR = {
  [VALIDATION_ERROR_CODES.BEAR_INVALID_START]:
    "Posizione iniziale non valida: l'Orso deve avere almeno una mossa disponibile.",
  [VALIDATION_ERROR_CODES.HUNTER_INVALID_MOVE]: 'Mossa non valida: scegli una casella libera.'
};

export function formatStatusMessage(state) {
  if (state.aiThinking) {
    return state.aiThinkingSide === 'hunters'
      ? 'IA sta pensando per i Cacciatori...'
      : "IA sta pensando per l'Orso...";
  }

  if (state.phase === GAME_PHASES.MATCH_OVER || state.phase === GAME_PHASES.TIE_AFTER_TWO_ROUNDS) {
    return STATUS_BY_TURN_HINT[TURN_HINT_CODES.MATCH_OVER];
  }

  if (state.validationErrorCode && STATUS_BY_VALIDATION_ERROR[state.validationErrorCode]) {
    return STATUS_BY_VALIDATION_ERROR[state.validationErrorCode];
  }

  if (state.turnHintCode && STATUS_BY_TURN_HINT[state.turnHintCode]) {
    return STATUS_BY_TURN_HINT[state.turnHintCode];
  }

  return typeof state.message === 'string' ? state.message : '';
}
