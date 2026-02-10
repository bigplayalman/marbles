import { MarbleConfig, MarbleState, RaceResult } from '@shared/types';

export interface HUD {
  container: HTMLElement;
  update: (
    marbles: MarbleConfig[],
    states: MarbleState[],
    raceTime: number,
    status: 'countdown' | 'racing' | 'finished',
    countdown: number,
  ) => void;
  showResults: (results: RaceResult[]) => void;
  destroy: () => void;
}

export function createHUD(parent: HTMLElement): HUD {
  const container = document.createElement('div');
  container.id = 'hud';
  container.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    font-family: 'Segoe UI', monospace;
    color: #fff;
  `;
  parent.appendChild(container);

  // Timer display
  const timerEl = document.createElement('div');
  timerEl.style.cssText = `
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 24px;
    font-weight: bold;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
  `;
  container.appendChild(timerEl);

  // Countdown overlay
  const countdownEl = document.createElement('div');
  countdownEl.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 120px;
    font-weight: bold;
    text-shadow: 4px 4px 8px rgba(0,0,0,0.8);
    opacity: 0;
    transition: opacity 0.2s, transform 0.2s;
  `;
  container.appendChild(countdownEl);

  // Position tracker
  const positionsEl = document.createElement('div');
  positionsEl.style.cssText = `
    position: absolute;
    top: 16px;
    right: 16px;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 8px;
    padding: 12px 16px;
    min-width: 180px;
    backdrop-filter: blur(4px);
  `;
  container.appendChild(positionsEl);

  // Results overlay
  const resultsEl = document.createElement('div');
  resultsEl.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.85);
    border-radius: 16px;
    padding: 32px 48px;
    min-width: 350px;
    backdrop-filter: blur(8px);
    display: none;
    pointer-events: auto;
    border: 2px solid rgba(255, 215, 0, 0.3);
  `;
  container.appendChild(resultsEl);

  let lastCountdown = -1;

  function update(
    marbles: MarbleConfig[],
    states: MarbleState[],
    raceTime: number,
    status: 'countdown' | 'racing' | 'finished',
    countdown: number,
  ) {
    // Timer
    if (status === 'racing' || status === 'finished') {
      const secs = (raceTime / 1000).toFixed(1);
      timerEl.textContent = `${secs}s`;
      timerEl.style.opacity = '1';
    } else {
      timerEl.style.opacity = '0';
    }

    // Countdown
    if (status === 'countdown') {
      const displayNum = Math.ceil(countdown);
      if (displayNum !== lastCountdown) {
        lastCountdown = displayNum;
        countdownEl.textContent = displayNum > 0 ? String(displayNum) : 'GO!';
        countdownEl.style.color = displayNum > 0 ? '#fff' : '#2ecc40';
        countdownEl.style.opacity = '1';
        countdownEl.style.transform = 'translate(-50%, -50%) scale(1)';

        // Animate
        setTimeout(() => {
          countdownEl.style.transform = 'translate(-50%, -50%) scale(1.3)';
          countdownEl.style.opacity = '0.5';
        }, 600);
      }
    } else {
      countdownEl.style.opacity = '0';
      lastCountdown = -1;
    }

    // Position tracker
    const sorted = [...states].sort((a, b) => (a.position || 999) - (b.position || 999));
    let posHtml = '<div style="font-size: 14px; font-weight: bold; margin-bottom: 8px; color: #ffd700;">POSITIONS</div>';
    for (const state of sorted) {
      const config = marbles.find(m => m.id === state.id);
      if (!config) continue;
      const pos = state.position || '?';
      const isDQ = state.disqualified;
      const medal = isDQ ? '' : pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : '';
      const statusStr = isDQ ? ' DQ' : state.finished ? ' ✓' : '';
      const timeStr = state.finishTime ? ` (${(state.finishTime / 1000).toFixed(1)}s)` : '';
      posHtml += `
        <div style="display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 13px;
          ${isDQ ? 'opacity: 0.4; text-decoration: line-through;' : state.finished ? 'opacity: 0.7;' : ''}">
          <span style="min-width: 24px;">${isDQ ? 'DQ' : medal || pos + '.'}</span>
          <span style="width: 10px; height: 10px; border-radius: 50%; background: ${config.color}; flex-shrink: 0;"></span>
          <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${config.name}</span>
          <span style="color: ${isDQ ? '#ff4136' : '#aaa'}; font-size: 11px;">${isDQ ? 'DQ' : timeStr + statusStr}</span>
        </div>
      `;
    }
    positionsEl.innerHTML = posHtml;
  }

  function showResults(results: RaceResult[]) {
    resultsEl.style.display = 'block';
    let html = '<div style="text-align: center; font-size: 28px; font-weight: bold; color: #ffd700; margin-bottom: 20px;">RACE RESULTS</div>';

    for (const result of results) {
      const isDQ = result.finishTime < 0;
      const medal = isDQ ? '' : result.position === 1 ? '🥇' : result.position === 2 ? '🥈' : result.position === 3 ? '🥉' : '';
      const isWinner = result.position === 1 && !isDQ;
      html += `
        <div style="display: flex; align-items: center; gap: 12px; padding: 8px 0; font-size: ${isWinner ? '18px' : '15px'};
          ${isWinner ? 'color: #ffd700;' : ''} ${isDQ ? 'opacity: 0.4; text-decoration: line-through;' : ''}">
          <span style="min-width: 32px; text-align: center;">${isDQ ? 'DQ' : medal || result.position + '.'}</span>
          <span style="width: 14px; height: 14px; border-radius: 50%; background: ${result.marbleColor}; flex-shrink: 0;"></span>
          <span style="flex: 1; font-weight: ${isWinner ? 'bold' : 'normal'};">${result.marbleName}</span>
          <span style="color: ${isDQ ? '#ff4136' : '#aaa'};">${isDQ ? 'Disqualified' : (result.finishTime / 1000).toFixed(2) + 's'}</span>
        </div>
      `;
    }

    html += `
      <div style="text-align: center; margin-top: 24px; pointer-events: auto;">
        <button id="btn-new-race" style="
          background: #4a90d9;
          color: #fff;
          border: none;
          padding: 12px 32px;
          font-size: 16px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: bold;
        ">New Race</button>
      </div>
    `;
    resultsEl.innerHTML = html;
  }

  function destroy() {
    container.remove();
  }

  return { container, update, showResults, destroy };
}
