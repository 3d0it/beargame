import { MAX_BEAR_MOVES, createGame } from './game.js';
import { createBoardRenderer } from './board-renderer.js';
import { formatStatusMessage } from './game-state-view.js';

const SETTINGS_STORAGE_KEY = 'beargame.settings.v1';
const FIRST_MATCH_TUTORIAL_KEY = 'beargame.first-match-tutorial.v1';
const FIRST_MATCH_TUTORIAL_STEPS = [
  "Scopo: i Cacciatori vincono se bloccano l'Orso; l'Orso fa patta se resta libero per 40 mosse.",
  'Setup Cacciatori: all inizio scegli una lunetta, cioè una delle 4 terne di posizioni iniziali. Sul tavoliere le lunette valide sono evidenziate.',
  "Mossa Orso: tocca una casella adiacente libera. Mossa Cacciatori: tocca un cacciatore, poi una casella adiacente libera.",
  'La partita è in 2 manche: nella seconda i ruoli si invertono automaticamente.'
];

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
const reviewTutorialBtn = optionalElement('reviewTutorialBtn');
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
loadSavedSettings();
applyRuntimeRenderingWorkarounds();

function requiredElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required DOM element: #${id}`);
  return element;
}

function optionalElement(id) {
  return document.getElementById(id);
}

function isNativeCapacitorApp() {
  const capacitor = window.Capacitor;
  if (!capacitor) return false;
  if (typeof capacitor.isNativePlatform === 'function') {
    return capacitor.isNativePlatform();
  }
  return capacitor.platform === 'android' || capacitor.platform === 'ios';
}

function applyRuntimeRenderingWorkarounds() {
  if (!document?.documentElement) return;
  document.documentElement.classList.toggle('is-native-app', isNativeCapacitorApp());
}

function isStorageAvailable() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizeMode(mode) {
  return mode === 'hvc' ? 'hvc' : 'hvh';
}

function normalizeComputerSide(side) {
  return side === 'hunters' ? 'hunters' : 'bear';
}

function normalizeDifficulty(difficulty) {
  if (difficulty === 'medium') return 'medium';
  if (difficulty === 'hard') return 'hard';
  return 'easy';
}

function loadSavedSettings() {
  if (!isStorageAvailable()) return;
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    selectedMode = normalizeMode(parsed?.mode);
    selectedComputerSide = normalizeComputerSide(parsed?.computerSide);
    selectedDifficulty = normalizeDifficulty(parsed?.difficulty);
  } catch {
    selectedMode = 'hvh';
    selectedComputerSide = 'bear';
    selectedDifficulty = 'easy';
  }
}

function saveSettings() {
  if (!isStorageAvailable()) return;
  const payload = {
    mode: selectedMode,
    computerSide: selectedComputerSide,
    difficulty: selectedDifficulty
  };
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota/security errors and keep running with in-memory settings.
  }
}

function hasSeenFirstMatchTutorial() {
  if (!isStorageAvailable()) return false;
  try {
    return window.localStorage.getItem(FIRST_MATCH_TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}

function markFirstMatchTutorialSeen() {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(FIRST_MATCH_TUTORIAL_KEY, '1');
  } catch {
    // Ignore quota/security errors and keep running.
  }
}

function canRenderTutorialPopup() {
  return (
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    Boolean(document.body) &&
    typeof document.body.appendChild === 'function'
  );
}

function showFirstMatchTutorialPopup() {
  if (!canRenderTutorialPopup()) return;

  const overlay = document.createElement('section');
  overlay.className = 'tutorial-popup';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Guida rapida partita');

  const card = document.createElement('div');
  card.className = 'tutorial-popup-card';

  const title = document.createElement('h3');
  title.textContent = 'Guida rapida';

  const body = document.createElement('p');
  body.className = 'tutorial-popup-text';

  const actions = document.createElement('div');
  actions.className = 'tutorial-popup-actions';

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'tutorial-popup-btn';
  skipBtn.textContent = 'Chiudi';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'tutorial-popup-btn tutorial-popup-btn--primary';

  let stepIndex = 0;
  const syncStep = () => {
    body.textContent = FIRST_MATCH_TUTORIAL_STEPS[stepIndex];
    nextBtn.textContent = stepIndex >= FIRST_MATCH_TUTORIAL_STEPS.length - 1 ? 'Ho capito' : 'Avanti';
  };

  const closePopup = () => {
    overlay.remove();
  };

  skipBtn.addEventListener('click', closePopup);
  nextBtn.addEventListener('click', () => {
    if (stepIndex >= FIRST_MATCH_TUTORIAL_STEPS.length - 1) {
      closePopup();
      return;
    }
    stepIndex += 1;
    syncStep();
  });

  actions.append(skipBtn, nextBtn);
  card.append(title, body, actions);
  overlay.append(card);
  document.body.appendChild(overlay);
  syncStep();
}

function maybeShowFirstMatchTutorialPopup() {
  if (hasSeenFirstMatchTutorial()) return;
  markFirstMatchTutorialSeen();
  showFirstMatchTutorialPopup();
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

function humanModeLabel(state) {
  const mode = state.mode ?? selectedMode;
  const computerSide = state.computerSide ?? selectedComputerSide;
  const difficulty = state.difficulty ?? selectedDifficulty;

  return mode === 'hvh'
    ? 'Modalità: 2 Giocatori'
    : `Modalità: Contro IA (${difficultyLabel(difficulty)}, manche 1: IA = ${computerSide === 'bear' ? 'Orso' : 'Cacciatori'})`;
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
  gameModeLabel.textContent = humanModeLabel(state);
  roundLabel.textContent = `Manche ${state.round}/2`;
  turnLabel.textContent = state.turn ? (state.turn === 'bear' ? 'Orso' : 'Cacciatori') : '-';
  movesLabel.textContent = `Mosse ${state.bearMoves}/${MAX_BEAR_MOVES}`;
  messageLabel.textContent = formatStatusMessage(state);

  const roundResults = state.roundResults ?? [];
  const firstRound = roundResults[0] ?? null;
  const secondRound = roundResults[1] ?? null;
  setTextAndTitle(roundOneResult, describeRoundResult(firstRound, 1, state));
  setTextAndTitle(roundTwoResult, describeRoundResult(secondRound, 2, state));
  setTextAndTitle(matchResultLabel, describeMatchResult(state));
  applyResultBanner(state);
}

function refreshGameUI() {
  boardRenderer.render();
  updateStatus();
}

function playerLabel(playerId, state = game.getState()) {
  const mode = state.mode ?? selectedMode;
  const computerSide = state.computerSide ?? selectedComputerSide;

  if (mode === 'hvc') {
    const computerIsPlayer1 = computerSide === 'bear';
    if (playerId === 'player-1') return computerIsPlayer1 ? 'IA' : 'Umano';
    if (playerId === 'player-2') return computerIsPlayer1 ? 'Umano' : 'IA';
  }

  if (playerId === 'player-1') return 'Giocatore 1';
  if (playerId === 'player-2') return 'Giocatore 2';
  return '-';
}

function hasValidImmobilizationMoves(value) {
  return Number.isInteger(value) && value >= 0;
}

function describeRoundResult(roundResult, fallbackRoundNumber, state) {
  if (!roundResult) return `Manche ${fallbackRoundNumber}: in attesa`;
  const hunters = playerLabel(roundResult.huntersPlayer, state);
  const bear = playerLabel(roundResult.bearPlayer, state);
  if (roundResult.reason === 'hunters-win') {
    if (!hasValidImmobilizationMoves(roundResult.immobilizationMoves)) {
      return `Manche ${roundResult.round}: Vincono Cacciatori (${hunters}).`;
    }
    return `Manche ${roundResult.round}: Vincono Cacciatori (${hunters}) in ${roundResult.immobilizationMoves} mosse.`;
  }
  return `Manche ${roundResult.round}: Patta, Orso (${bear}) a ${MAX_BEAR_MOVES} mosse.`;
}

function describeMatchResult(state) {
  if (!state.matchSummary) return 'Finale: in attesa';
  if (state.matchSummary.isTie) return 'Finale: parità';
  const winner = playerLabel(state.matchSummary.winnerPlayer, state);
  const loserPlayer = state.matchSummary.winnerPlayer === 'player-1' ? 'player-2' : 'player-1';
  const loser = playerLabel(loserPlayer, state);
  const roundResults = state.roundResults ?? [];
  const winnerRound = roundResults.find(
    (roundResult) =>
      roundResult.huntersPlayer === state.matchSummary.winnerPlayer && roundResult.reason === 'hunters-win'
  );
  const loserRound = roundResults.find(
    (roundResult) => roundResult.huntersPlayer === loserPlayer && roundResult.reason === 'hunters-win'
  );

  if (!winnerRound || !hasValidImmobilizationMoves(winnerRound.immobilizationMoves)) {
    return `Finale: Vince ${winner}`;
  }
  if (loserRound) {
    if (!hasValidImmobilizationMoves(loserRound.immobilizationMoves)) {
      return `Finale: Vince ${winner} (${winnerRound.immobilizationMoves}), ${loser} n/d`;
    }
    return `Finale: Vince ${winner} (${winnerRound.immobilizationMoves}), ${loser} ${loserRound.immobilizationMoves}`;
  }
  return `Finale: Vince ${winner} (${winnerRound.immobilizationMoves}), ${loser} >${MAX_BEAR_MOVES}`;
}

function setTextAndTitle(element, text) {
  element.textContent = text;
  element.title = text;
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
  saveSettings();
  showGameScreen();
  refreshGameUI();
  maybeShowFirstMatchTutorialPopup();
}

modeHvHBtn.addEventListener('click', () => {
  selectedMode = 'hvh';
  saveSettings();
  updateModeUI();
});

modeHvCBtn.addEventListener('click', () => {
  selectedMode = 'hvc';
  saveSettings();
  updateModeUI();
});

computerBearBtn.addEventListener('click', () => {
  selectedComputerSide = 'bear';
  saveSettings();
  updateModeUI();
});

computerHuntersBtn.addEventListener('click', () => {
  selectedComputerSide = 'hunters';
  saveSettings();
  updateModeUI();
});

difficultyEasyBtn.addEventListener('click', () => {
  selectedDifficulty = 'easy';
  saveSettings();
  updateModeUI();
});

difficultyMediumBtn.addEventListener('click', () => {
  selectedDifficulty = 'medium';
  saveSettings();
  updateModeUI();
});

difficultyHardBtn.addEventListener('click', () => {
  selectedDifficulty = 'hard';
  saveSettings();
  updateModeUI();
});

startMatchBtn.addEventListener('click', startMatch);
reviewTutorialBtn?.addEventListener('click', showFirstMatchTutorialPopup);

newMatchBtn.addEventListener('click', () => {
  game.newMatch(selectedMode, selectedComputerSide, selectedDifficulty);
  saveSettings();
  refreshGameUI();
});

backToMenuBtn.addEventListener('click', showStartScreen);

game.setOnChange(refreshGameUI);

updateModeUI();
