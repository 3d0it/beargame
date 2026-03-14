// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function mountAppDom() {
  document.body.innerHTML = `
    <main class="app">
      <section id="startScreen" class="screen">
        <button id="modeHvHBtn" class="mode-btn is-active" type="button"></button>
        <button id="modeHvCBtn" class="mode-btn" type="button"></button>
        <div id="computerSidePanel" class="side-panel is-hidden">
          <button id="computerBearBtn" class="side-btn is-active" type="button"></button>
          <button id="computerHuntersBtn" class="side-btn" type="button"></button>
        </div>
        <div id="difficultyPanel" class="side-panel is-hidden">
          <button id="difficultyEasyBtn" class="side-btn is-active" type="button"></button>
          <button id="difficultyMediumBtn" class="side-btn" type="button"></button>
          <button id="difficultyHardBtn" class="side-btn" type="button"></button>
        </div>
        <button id="startMatchBtn" type="button"></button>
      </section>
      <section id="gameScreen" class="screen is-hidden">
        <button id="backToMenuBtn" type="button"></button>
        <button id="newMatchBtn" type="button"></button>
        <p id="gameModeLabel"></p>
        <p id="roundLabel"></p>
        <p id="turnLabel"></p>
        <p id="movesLabel"></p>
        <p id="messageLabel"></p>
        <p id="resultBanner"></p>
        <p id="roundOneResult"></p>
        <p id="roundTwoResult"></p>
        <p id="matchResultLabel"></p>
        <section class="board-panel">
          <svg id="board" viewBox="0 0 100 100"></svg>
        </section>
      </section>
    </main>
  `;
}

function getNodeHit(cx, cy) {
  return document.querySelector(`#board circle.node-hit[cx="${cx}"][cy="${cy}"]`);
}

describe('ui integration', () => {
  beforeEach(() => {
    vi.resetModules();
    mountAppDom();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: vi.fn(() => Promise.resolve())
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('bootstrappa l interfaccia e avvia una partita hvh', async () => {
    await import('./main.js');

    document.getElementById('startMatchBtn').click();

    expect(document.getElementById('startScreen').classList.contains('is-hidden')).toBe(true);
    expect(document.getElementById('gameScreen').classList.contains('is-hidden')).toBe(false);
    expect(document.getElementById('roundLabel').textContent).toContain('1/2');
    expect(document.querySelectorAll('#board circle.node-hit').length).toBe(21);
  });

  it('aggiorna board e status su setup + prima mossa reale', async () => {
    await import('./main.js');
    document.getElementById('startMatchBtn').click();

    // Setup cacciatori: clic lunetta destra [7,8,9], nodo 8
    getNodeHit('78', '50').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('messageLabel').textContent).toContain('Orso: scegli');

    // Setup orso: nodo 18 (centro)
    getNodeHit('50', '50').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('turnLabel').textContent).toContain('Orso');

    // Prima mossa orso: 18 -> 16
    getNodeHit('50', '35').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('turnLabel').textContent).toContain('Cacciatori');
    expect(document.getElementById('movesLabel').textContent).toContain('Mosse 1/40');
    expect(document.querySelectorAll('#board .piece-bear').length).toBe(1);
    expect(document.querySelectorAll('#board .piece-hunter').length).toBe(3);
  });
});
