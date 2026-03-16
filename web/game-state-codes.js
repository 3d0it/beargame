export const GAME_PHASES = {
  SETUP_HUNTERS: 'setup-hunters',
  SETUP_BEAR: 'setup-bear',
  PLAYING: 'playing',
  MATCH_OVER: 'match-over',
  TIE_AFTER_TWO_ROUNDS: 'tie-after-two-rounds'
};

export const TURN_HINT_CODES = {
  HUNTERS_SETUP: 'hunters-setup',
  BEAR_SETUP: 'bear-setup',
  BEAR_TURN: 'bear-turn',
  HUNTERS_TURN: 'hunters-turn',
  HUNTER_SELECTED: 'hunter-selected',
  MATCH_OVER: 'match-over'
};

export const VALIDATION_ERROR_CODES = {
  NONE: null,
  BEAR_INVALID_START: 'bear-invalid-start',
  HUNTER_INVALID_MOVE: 'hunter-invalid-move'
};
