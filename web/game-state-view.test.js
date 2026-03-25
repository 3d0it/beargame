import { describe, expect, it } from 'vitest';
import { formatStatusMessage } from './game-state-view.js';
import { GAME_PHASES, TURN_HINT_CODES, VALIDATION_ERROR_CODES } from './game-state-codes.js';

describe('formatStatusMessage', () => {
  it('uses validationErrorCode instead of the raw message text', () => {
    expect(
      formatStatusMessage({
        phase: GAME_PHASES.SETUP_BEAR,
        aiThinking: false,
        aiThinkingSide: null,
        turnHintCode: TURN_HINT_CODES.BEAR_SETUP,
        validationErrorCode: VALIDATION_ERROR_CODES.BEAR_INVALID_START,
        message: 'testo arbitrario'
      })
    ).toContain('Posizione iniziale non valida');
  });

  it('prioritizes the aiThinking state', () => {
    expect(
      formatStatusMessage({
        phase: GAME_PHASES.PLAYING,
        aiThinking: true,
        aiThinkingSide: 'hunters',
        turnHintCode: TURN_HINT_CODES.BEAR_TURN,
        validationErrorCode: VALIDATION_ERROR_CODES.NONE,
        message: 'fallback'
      })
    ).toBe('IA sta pensando per i Cacciatori...');
  });

  it('no longer interprets state.message content when codes are missing', () => {
    expect(
      formatStatusMessage({
        phase: GAME_PHASES.PLAYING,
        aiThinking: false,
        aiThinkingSide: null,
        turnHintCode: null,
        validationErrorCode: VALIDATION_ERROR_CODES.NONE,
        message: 'Turno dell Orso: seleziona una casella adiacente libera.'
      })
    ).toBe('Turno dell Orso: seleziona una casella adiacente libera.');
  });
});
