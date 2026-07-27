// YouTube IFrame API player states.
export const PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
};

// Drift threshold in seconds. Below this, we do not seek — avoids stutter
// from micro-latency and normal jitter.
export const DRIFT_THRESHOLD_S = 2.0;

/**
 * Expected local playback time given a host snapshot.
 * If the host is playing, we advance by wall-clock delta since updatedAt.
 * If paused, expected time is frozen at the snapshot value.
 *
 * @param {object} playback - { state, currentTime, updatedAt }
 * @param {number} correctedNowMs - Date.now() + serverTimeOffset
 * @returns {number} expected local currentTime in seconds
 */
export function expectedTime(playback, correctedNowMs) {
  if (!playback) return 0;
  const { state, currentTime = 0, updatedAt = correctedNowMs } = playback;
  if (state === PLAYER_STATE.PLAYING) {
    return currentTime + (correctedNowMs - updatedAt) / 1000;
  }
  return currentTime;
}

/**
 * Should we seek to close a drift gap?
 * Returns true only when the drift exceeds DRIFT_THRESHOLD_S AND
 * the local player is in a state where seeking is safe.
 */
export function shouldSeek(localTime, expected, localState) {
  if (
    localState === PLAYER_STATE.BUFFERING ||
    localState === PLAYER_STATE.UNSTARTED
  ) {
    return false;
  }
  return Math.abs(localTime - expected) > DRIFT_THRESHOLD_S;
}
