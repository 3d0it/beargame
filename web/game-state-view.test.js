import { describe, expect, it } from 'vitest';
import { formatStatusMessage } from './game-state-view.js';
import { GAME_PHASES, TURN_HINT_CODES, VALIDATION_ERROR_CODES } from './game-state-codes.js';

describe('formatStatusMessage', () => {
  it('usa validationErrorCode invece del testo grezzo del messaggio', () => {
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

  it('dà priorità allo stato aiThinking', () => {
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

  it('non interpreta più il contenuto di state.message quando i codici mancano', () => {
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
