import { createGame } from './game.js';
import { createBoardRenderer } from './board-renderer.js';

registerServiceWorker();

const game = createGame();
const board = requiredElement('board');
const startScreen = requiredElement('startScreen');
const gameScreen = requiredElement('gameScreen');
const modeHvHBtn = requiredElement('modeHvHBtn');
const modeHvCBtn = requiredElement('modeHvCBtn');
const computerSidePanel = requiredElement('computerSidePanel');
const computerBearBtn = requiredElement('computerBearBtn');
const computerHuntersBtn = requiredElement('computerHuntersBtn');
const difficultyPanel = requiredElement('difficultyPanel');
const difficultyEasyBtn = requiredElement('difficultyEasyBtn');
const difficultyMediumBtn = requiredElement('difficultyMediumBtn');
const difficultyHardBtn = requiredElement('difficultyHardBtn');
const startMatchBtn = requiredElement('startMatchBtn');
const backToMenuBtn = requiredElement('backToMenuBtn');
const newMatchBtn = requiredElement('newMatchBtn');
const gameModeLabel = requiredElement('gameModeLabel');
const roundLabel = requiredElement('roundLabel');
const turnLabel = requiredElement('turnLabel');
const movesLabel = requiredElement('movesLabel');
const messageLabel = requiredElement('messageLabel');
const resultBanner = requiredElement('resultBanner');
const roundOneResult = requiredElement('roundOneResult');
const roundTwoResult = requiredElement('roundTwoResult');
const matchResultLabel = requiredElement('matchResultLabel');

const boardRenderer = createBoardRenderer({
  board,
  game,
  onAfterNodeClick: updateStatus
});

let selectedMode = 'hvh';
let selectedComputerSide = 'bear';
let selectedDifficulty = 'easy';

function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.warn('[sw] registration failed:', error);
  });
}

function requiredElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required DOM element: #${id}`);
  return element;
}

function setActiveButton(activeBtn, buttons) {
  for (const btn of buttons) {
    btn.classList.toggle('is-active', btn === activeBtn);
  }
}

function updateModeUI() {
  const isVsComputer = selectedMode === 'hvc';
  computerSidePanel.classList.toggle('is-hidden', !isVsComputer);
  difficultyPanel.classList.toggle('is-hidden', !isVsComputer);
  setActiveButton(selectedMode === 'hvh' ? modeHvHBtn : modeHvCBtn, [modeHvHBtn, modeHvCBtn]);
  setActiveButton(
    selectedComputerSide === 'bear' ? computerBearBtn : computerHuntersBtn,
    [computerBearBtn, computerHuntersBtn]
  );
  setActiveButton(
    selectedDifficulty === 'easy'
      ? difficultyEasyBtn
      : selectedDifficulty === 'medium'
        ? difficultyMediumBtn
        : difficultyHardBtn,
    [difficultyEasyBtn, difficultyMediumBtn, difficultyHardBtn]
  );
}

function humanModeLabel() {
  return selectedMode === 'hvh'
    ? 'Modalità: 2 Giocatori'
    : `Modalità: Contro PC (${difficultyLabel(selectedDifficulty)}, manche 1: PC = ${selectedComputerSide === 'bear' ? 'Orso' : 'Cacciatori'})`;
}

function difficultyLabel(difficulty) {
  if (difficulty === 'medium') return 'Medio';
  if (difficulty === 'hard') return 'Difficile';
  return 'Facile';
}

function showGameScreen() {
  startScreen.classList.add('is-hidden');
  gameScreen.classList.remove('is-hidden');
}

function showStartScreen() {
  gameScreen.classList.add('is-hidden');
  startScreen.classList.remove('is-hidden');
}

function updateStatus() {
  const state = game.getState();
  gameModeLabel.textContent = humanModeLabel();
  roundLabel.textContent = `Manche: ${state.round}/2`;
  turnLabel.textContent = state.turn
    ? `Turno: ${state.turn === 'bear' ? 'Orso' : 'Cacciatori'}`
    : 'Turno: -';
  movesLabel.textContent = `Mosse Orso: ${state.bearMoves}/40`;
  messageLabel.textContent = primaryMessage(state);

  const roundResults = state.roundResults ?? [];
  const firstRound = roundResults[0] ?? null;
  const secondRound = roundResults[1] ?? null;
  roundOneResult.textContent = describeRoundResult(firstRound, 1);
  roundTwoResult.textContent = describeRoundResult(secondRound, 2);
  matchResultLabel.textContent = describeMatchResult(state);
  applyResultBanner(state);
}

function refreshGameUI() {
  boardRenderer.render();
  updateStatus();
  fitBoardToViewport();
}

function fitBoardToViewport() {
  if (typeof window === 'undefined') return;
  if (gameScreen.classList.contains('is-hidden')) return;
  if (typeof board.closest !== 'function') return;

  const boardPanel = board.closest('.board-panel');
  if (!boardPanel || typeof boardPanel.getBoundingClientRect !== 'function') return;

  const panelRect = boardPanel.getBoundingClientRect();
  const viewportHeight = window.innerHeight || 0;
  const panelWidth = getPanelContentWidth(boardPanel, panelRect.width);
  if (viewportHeight <= 0 || panelWidth <= 0) return;

  const bottomSafeGap = 12;
  const availableHeight = Math.max(220, viewportHeight - panelRect.top - bottomSafeGap);
  const desktopCap = window.innerWidth >= 1100 ? viewportHeight * 0.7 : Number.POSITIVE_INFINITY;
  const nextSize = Math.floor(Math.min(panelWidth, availableHeight, desktopCap));

  board.style.width = `${nextSize}px`;
  board.style.height = `${nextSize}px`;
}

function getPanelContentWidth(panel, fallbackWidth) {
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return panel.clientWidth || fallbackWidth || 0;
  }

  const style = window.getComputedStyle(panel);
  const paddingLeft = parseFloat(style.paddingLeft || '0') || 0;
  const paddingRight = parseFloat(style.paddingRight || '0') || 0;
  const contentWidth = (fallbackWidth || panel.clientWidth || 0) - paddingLeft - paddingRight;
  return Math.max(0, contentWidth);
}

function playerLabel(playerId) {
  const state = game.getState();
  const mode = state.mode ?? selectedMode;
  const computerSide = state.computerSide ?? selectedComputerSide;

  if (mode === 'hvc') {
    const computerIsPlayer1 = computerSide === 'bear';
    if (playerId === 'player-1') return computerIsPlayer1 ? 'Computer' : 'Umano';
    if (playerId === 'player-2') return computerIsPlayer1 ? 'Umano' : 'Computer';
  }

  if (playerId === 'player-1') return 'Giocatore 1';
  if (playerId === 'player-2') return 'Giocatore 2';
  return '-';
}

function describeRoundResult(roundResult, fallbackRoundNumber) {
  if (!roundResult) return `Manche ${fallbackRoundNumber}: in attesa`;
  const hunters = playerLabel(roundResult.huntersPlayer);
  const bear = playerLabel(roundResult.bearPlayer);
  if (roundResult.reason === 'hunters-win') {
    return `Manche ${roundResult.round}: vincono i Cacciatori (${hunters}), Orso (${bear}) bloccato in ${roundResult.immobilizationMoves} mosse.`;
  }
  return `Manche ${roundResult.round}: patta, Orso (${bear}) non immobilizzato entro 40 mosse.`;
}

function describeMatchResult(state) {
  if (!state.matchSummary) return 'Risultato finale: in attesa della seconda manche';
  if (state.matchSummary.isTie) return 'Risultato finale: parità';
  const winner = playerLabel(state.matchSummary.winnerPlayer);
  const roundResults = state.roundResults ?? [];
  const winnerRound = roundResults.find(
    (roundResult) =>
      roundResult.huntersPlayer === state.matchSummary.winnerPlayer && roundResult.reason === 'hunters-win'
  );

  if (!winnerRound) return `Risultato finale: vince ${winner}`;
  const loser = playerLabel(state.matchSummary.winnerPlayer === 'player-1' ? 'player-2' : 'player-1');
  return `Risultato finale: vince ${winner}. Ha immobilizzato l'Orso in ${winnerRound.immobilizationMoves} mosse; ${loser} non ci è riuscito entro 40.`;
}

function primaryMessage(state) {
  if (state.phase === 'match-over' || state.phase === 'tie-after-two-rounds') {
    return describeMatchResult(state);
  }
  return state.message;
}

function applyResultBanner(state) {
  resultBanner.classList.remove('hunters-win', 'draw', 'match-over', 'tie');

  const lastRound = state.lastRoundResult ?? null;
  if (state.phase === 'match-over') {
    resultBanner.textContent = 'Partita conclusa';
    resultBanner.classList.add('match-over');
    return;
  }

  if (state.phase === 'tie-after-two-rounds') {
    resultBanner.textContent = 'Partita conclusa in parità';
    resultBanner.classList.add('tie');
    return;
  }

  if (lastRound) {
    resultBanner.textContent = lastRound.reason === 'hunters-win'
      ? `Ultimo esito: manche ${lastRound.round} vinta dai Cacciatori`
      : `Ultimo esito: manche ${lastRound.round} patta`;
    resultBanner.classList.add(lastRound.reason === 'hunters-win' ? 'hunters-win' : 'draw');
    return;
  }

  resultBanner.textContent = 'Partita in corso';
}

function startMatch() {
  game.newMatch(selectedMode, selectedComputerSide, selectedDifficulty);
  showGameScreen();
  refreshGameUI();
}

modeHvHBtn.addEventListener('click', () => {
  selectedMode = 'hvh';
  updateModeUI();
});

modeHvCBtn.addEventListener('click', () => {
  selectedMode = 'hvc';
  updateModeUI();
});

computerBearBtn.addEventListener('click', () => {
  selectedComputerSide = 'bear';
  updateModeUI();
});

computerHuntersBtn.addEventListener('click', () => {
  selectedComputerSide = 'hunters';
  updateModeUI();
});

difficultyEasyBtn.addEventListener('click', () => {
  selectedDifficulty = 'easy';
  updateModeUI();
});

difficultyMediumBtn.addEventListener('click', () => {
  selectedDifficulty = 'medium';
  updateModeUI();
});

difficultyHardBtn.addEventListener('click', () => {
  selectedDifficulty = 'hard';
  updateModeUI();
});

startMatchBtn.addEventListener('click', startMatch);

newMatchBtn.addEventListener('click', () => {
  game.newMatch(selectedMode, selectedComputerSide, selectedDifficulty);
  refreshGameUI();
});

backToMenuBtn.addEventListener('click', showStartScreen);

game.setOnChange(refreshGameUI);
if (typeof window !== 'undefined') {
  window.addEventListener('resize', fitBoardToViewport);
  window.addEventListener('orientationchange', fitBoardToViewport);
}

updateModeUI();
