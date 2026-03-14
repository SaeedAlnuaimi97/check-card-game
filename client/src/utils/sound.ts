/**
 * Simple sound effect utility.
 * Preloads sounds and provides functions to play them.
 */

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

/**
 * Play a cloned audio node at given volume.
 * Non-blocking — errors are silently ignored (e.g. browser autoplay policy).
 */
function playClone(source: HTMLAudioElement, volume = 0.5): void {
  const clone = source.cloneNode() as HTMLAudioElement;
  clone.volume = volume;
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
