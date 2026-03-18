/**
 * Simple sound effect utility.
 * Preloads sounds and provides functions to play them.
 * Respects a localStorage toggle (`checkgame_sound_enabled`).
 */

const SOUND_STORAGE_KEY = 'checkgame_sound_enabled';

const pickAudio = new Audio('/pick.mp3');
pickAudio.preload = 'auto';

const burnAudio = new Audio('/card-burn.mp3');
burnAudio.preload = 'auto';

const swapAudio = new Audio('/card-swap.mp3');
swapAudio.preload = 'auto';

const winAudio = new Audio('/winning-player.mp3');
winAudio.preload = 'auto';

const turnAudio = new Audio('/player-turn.mp3');
turnAudio.preload = 'auto';

const gameStartingAudio = new Audio('/game-starting.mp3');
gameStartingAudio.preload = 'auto';

/**
 * Check if sound is enabled (defaults to true if not set).
 */
export function isSoundEnabled(): boolean {
  const stored = localStorage.getItem(SOUND_STORAGE_KEY);
  return stored !== 'false';
}

/**
 * Set sound enabled/disabled and persist to localStorage.
 */
export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
}

/**
 * Play a cloned audio node at given volume.
 * Uses `new Audio(src)` instead of `cloneNode()` for reliable cross-browser src
 * inheritance, and calls `load()` before `play()` to avoid buffering delays.
 * Non-blocking — errors are silently ignored (e.g. browser autoplay policy).
 * Respects the sound toggle.
 */
function playClone(source: HTMLAudioElement, volume = 0.5): void {
  if (!isSoundEnabled()) return;
  const clone = new Audio(source.src);
  clone.volume = volume;
  clone.load();
  clone.play().catch(() => {
    // Autoplay may be blocked until user interacts — ignore
  });
}

/**
 * Play the card pick / action sound effect.
 */
export function playPickSound(): void {
  playClone(pickAudio);
}

/**
 * Play the card burn sound effect.
 */
export function playBurnSound(): void {
  playClone(burnAudio);
}

/**
 * Play the card swap sound effect.
 */
export function playSwapSound(): void {
  playClone(swapAudio);
}

/**
 * Play the winning player sound effect.
 */
export function playWinSound(): void {
  playClone(winAudio, 0.7);
}

/**
 * Play the player turn notification sound effect.
 */
export function playTurnSound(): void {
  playClone(turnAudio, 0.6);
}

/**
 * Play the game-starting countdown sound effect (between rounds).
 */
export function playGameStartingSound(): void {
  playClone(gameStartingAudio, 0.6);
}
