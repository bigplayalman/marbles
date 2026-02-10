import {
  MarbleConfig,
  PLAYER_NAMES,
  MARBLE_COLORS,
  MAX_MARBLES,
} from '@shared/types';

export interface RaceSettings {
  marbles: MarbleConfig[];
  gravityScale: number;
}

export interface LobbyUI {
  container: HTMLElement;
  show: () => void;
  hide: () => void;
  destroy: () => void;
}

let playerCounter = 0;

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function getUnusedPlayerName(usedNames: Set<string>): string {
  for (const name of PLAYER_NAMES) {
    if (!usedNames.has(name)) return name;
  }
  return `Player ${++playerCounter}`;
}

function getUnusedColor(usedColors: Set<string>): string {
  for (const color of MARBLE_COLORS) {
    if (!usedColors.has(color)) return color;
  }
  return `hsl(${Math.random() * 360}, 70%, 55%)`;
}

export function createLobbyUI(
  parent: HTMLElement,
  onStart: (settings: RaceSettings) => void,
): LobbyUI {
  const container = document.createElement('div');
  container.id = 'lobby-screen';
  container.style.cssText = `
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #fff;
    z-index: 100;
  `;

  const marbles: MarbleConfig[] = [];
  const usedNames = new Set<string>();
  const usedColors = new Set<string>();
  let gravityScale = 0.0004;

  // Add the player's marble by default
  const playerColor = MARBLE_COLORS[0];
  marbles.push({
    id: generateId(),
    name: 'My Marble',
    color: playerColor,
    isBot: false,
  });
  usedColors.add(playerColor);
  usedNames.add('My Marble');

  function renderLobby() {
    container.innerHTML = `
      <div style="
        background: rgba(0, 0, 0, 0.5);
        border-radius: 20px;
        padding: 40px;
        max-width: 600px;
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
      ">
        <h1 style="text-align: center; margin: 0 0 8px 0; font-size: 26px; color: #ffd700; line-height: 1.3;">
          THE AMAZING RYAN'S RACE FOR ALL THE MARBLES
        </h1>
        <p style="text-align: center; margin: 0 0 32px 0; color: #aaa; font-size: 14px;">
          Set up your marbles and start the race!
        </p>

        <!-- Marble List -->
        <div id="marble-list" style="margin-bottom: 24px;">
          ${marbles.map((m, i) => `
            <div style="
              display: flex;
              align-items: center;
              gap: 12px;
              padding: 12px 16px;
              margin-bottom: 8px;
              background: rgba(255, 255, 255, 0.05);
              border-radius: 10px;
              border: 1px solid rgba(255, 255, 255, 0.08);
            ">
              <input type="color" value="${m.color}" data-idx="${i}" class="marble-color"
                style="width: 36px; height: 36px; border: none; border-radius: 50%; cursor: pointer; background: none; padding: 0;" />
              <input type="text" value="${m.name}" data-idx="${i}" class="marble-name"
                maxlength="20"
                style="
                  flex: 1;
                  background: rgba(255, 255, 255, 0.1);
                  border: 1px solid rgba(255, 255, 255, 0.15);
                  color: #fff;
                  padding: 8px 12px;
                  border-radius: 6px;
                  font-size: 15px;
                  outline: none;
                " />
              <span style="color: #666; font-size: 12px; min-width: 40px;">
                ${i === 0 ? 'YOU' : 'P' + (i + 1)}
              </span>
              ${i > 0 ? `
                <button data-idx="${i}" class="marble-remove" style="
                  background: rgba(255, 50, 50, 0.3);
                  border: 1px solid rgba(255, 50, 50, 0.4);
                  color: #ff6b6b;
                  width: 32px;
                  height: 32px;
                  border-radius: 6px;
                  cursor: pointer;
                  font-size: 18px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                ">x</button>
              ` : '<div style="width: 32px;"></div>'}
            </div>
          `).join('')}
        </div>

        <!-- Add Player Buttons -->
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <button id="btn-add-player" style="
            flex: 1;
            background: rgba(74, 144, 217, 0.3);
            border: 1px solid rgba(74, 144, 217, 0.5);
            color: #7fdbff;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 15px;
            cursor: pointer;
            font-weight: 600;
            transition: background 0.2s;
          " ${marbles.length >= MAX_MARBLES ? 'disabled' : ''}>
            + Add Player (${marbles.length}/${MAX_MARBLES})
          </button>
          <button id="btn-add-5-players" style="
            background: rgba(74, 144, 217, 0.15);
            border: 1px solid rgba(74, 144, 217, 0.3);
            color: #7fdbff;
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            transition: background 0.2s;
          " ${marbles.length + 5 > MAX_MARBLES ? 'disabled' : ''}>
            +5 Players
          </button>
          <button id="btn-bulk-import" style="
            background: rgba(255, 215, 0, 0.15);
            border: 1px solid rgba(255, 215, 0, 0.3);
            color: #ffd700;
            padding: 12px 16px;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            transition: background 0.2s;
          " ${marbles.length >= MAX_MARBLES ? 'disabled' : ''}>
            Bulk Import
          </button>
        </div>

        <!-- Bulk Import Panel (hidden by default) -->
        <div id="bulk-import-panel" style="display: none; margin-bottom: 32px;">
          <label style="font-size: 13px; color: #aaa; display: block; margin-bottom: 6px;">
            Enter names separated by commas or new lines (max ${MAX_MARBLES - marbles.length} more)
          </label>
          <textarea id="bulk-import-text" placeholder="e.g. Thunderball, Big Red, Slick&#10;Pebble&#10;Cannonball, Dizzy" rows="5"
            style="
              width: 100%;
              box-sizing: border-box;
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.15);
              color: #fff;
              padding: 10px 14px;
              border-radius: 8px;
              font-size: 14px;
              font-family: 'Segoe UI', system-ui, sans-serif;
              outline: none;
              resize: vertical;
            "></textarea>
          <div style="display: flex; gap: 10px; margin-top: 8px;">
            <button id="btn-bulk-add" style="
              flex: 1;
              background: linear-gradient(135deg, #ffd700, #f0a500);
              border: none;
              color: #1a1a2e;
              padding: 10px 20px;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: transform 0.1s;
            ">
              Add Players
            </button>
            <button id="btn-bulk-cancel" style="
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.15);
              color: #aaa;
              padding: 10px 16px;
              border-radius: 8px;
              font-size: 14px;
              cursor: pointer;
            ">
              Cancel
            </button>
          </div>
          <p id="bulk-import-status" style="margin: 6px 0 0 0; font-size: 12px; color: #aaa;"></p>
        </div>

        <!-- Track Seed -->
        <div style="margin-bottom: 24px;">
          <label style="font-size: 13px; color: #aaa; display: block; margin-bottom: 6px;">
            Track Seed (leave empty for random)
          </label>
          <input type="number" id="track-seed" placeholder="Random"
            style="
              width: 100%;
              box-sizing: border-box;
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.15);
              color: #fff;
              padding: 10px 14px;
              border-radius: 8px;
              font-size: 15px;
              outline: none;
            " />
        </div>

        <!-- Gravity Slider -->
        <div style="margin-bottom: 24px;">
          <label style="font-size: 13px; color: #aaa; display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span>Gravity</span>
            <span id="gravity-value" style="color: #7fdbff; font-weight: 600;">${gravityScale.toFixed(4)}</span>
          </label>
          <input type="range" id="gravity-slider" min="0.0001" max="0.002" step="0.0001" value="${gravityScale}"
            style="
              width: 100%;
              accent-color: #4a90d9;
              height: 6px;
              cursor: pointer;
            " />
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #666; margin-top: 4px;">
            <span>Feather</span>
            <span>Moon</span>
            <span>Normal</span>
            <span>Heavy</span>
          </div>
        </div>

        <!-- Start Race Button -->
        <button id="btn-start-race" style="
          width: 100%;
          background: linear-gradient(135deg, #2ecc40, #27ae60);
          border: none;
          color: #fff;
          padding: 16px 32px;
          font-size: 20px;
          font-weight: bold;
          border-radius: 12px;
          cursor: pointer;
          transition: transform 0.1s, box-shadow 0.2s;
          box-shadow: 0 4px 15px rgba(46, 204, 64, 0.3);
        " ${marbles.length < 2 ? 'disabled style="opacity: 0.5;"' : ''}>
          START RACE
        </button>
        ${marbles.length < 2 ? '<p style="text-align: center; color: #ff6b6b; font-size: 13px; margin-top: 8px;">Add at least 2 marbles to race</p>' : ''}
      </div>
    `;

    // Bind events
    container.querySelectorAll('.marble-name').forEach(el => {
      (el as HTMLInputElement).addEventListener('change', (e) => {
        const idx = parseInt((e.target as HTMLInputElement).dataset.idx!);
        const newName = (e.target as HTMLInputElement).value.trim();
        if (newName) {
          usedNames.delete(marbles[idx].name);
          marbles[idx].name = newName;
          usedNames.add(newName);
        }
      });
    });

    container.querySelectorAll('.marble-color').forEach(el => {
      (el as HTMLInputElement).addEventListener('input', (e) => {
        const idx = parseInt((e.target as HTMLInputElement).dataset.idx!);
        usedColors.delete(marbles[idx].color);
        marbles[idx].color = (e.target as HTMLInputElement).value;
        usedColors.add(marbles[idx].color);
      });
    });

    container.querySelectorAll('.marble-remove').forEach(el => {
      (el as HTMLButtonElement).addEventListener('click', (e) => {
        const idx = parseInt((e.currentTarget as HTMLButtonElement).dataset.idx!);
        usedNames.delete(marbles[idx].name);
        usedColors.delete(marbles[idx].color);
        marbles.splice(idx, 1);
        renderLobby();
      });
    });

    document.getElementById('btn-add-player')?.addEventListener('click', () => {
      if (marbles.length >= MAX_MARBLES) return;
      addPlayer();
      renderLobby();
    });

    document.getElementById('btn-add-5-players')?.addEventListener('click', () => {
      for (let i = 0; i < 5 && marbles.length < MAX_MARBLES; i++) {
        addPlayer();
      }
      renderLobby();
    });

    document.getElementById('btn-bulk-import')?.addEventListener('click', () => {
      const panel = document.getElementById('bulk-import-panel');
      if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      }
    });

    document.getElementById('btn-bulk-cancel')?.addEventListener('click', () => {
      const panel = document.getElementById('bulk-import-panel');
      if (panel) panel.style.display = 'none';
      const textarea = document.getElementById('bulk-import-text') as HTMLTextAreaElement;
      if (textarea) textarea.value = '';
    });

    document.getElementById('btn-bulk-add')?.addEventListener('click', () => {
      const textarea = document.getElementById('bulk-import-text') as HTMLTextAreaElement;
      if (!textarea || !textarea.value.trim()) return;

      // Split by commas or newlines, trim, filter empty/duplicate
      const names = textarea.value
        .split(/[,\n]+/)
        .map(n => n.trim())
        .filter(n => n.length > 0)
        .map(n => n.substring(0, 20)); // respect maxlength

      // Deduplicate within the import list
      const uniqueNames: string[] = [];
      const seen = new Set<string>();
      for (const name of names) {
        const lower = name.toLowerCase();
        if (!seen.has(lower)) {
          seen.add(lower);
          uniqueNames.push(name);
        }
      }

      const slots = MAX_MARBLES - marbles.length;
      const toAdd = uniqueNames.slice(0, slots);
      let skippedDuplicates = 0;

      for (const name of toAdd) {
        // Skip if name already exists in current marble list
        if (usedNames.has(name)) {
          skippedDuplicates++;
          continue;
        }
        const color = getUnusedColor(usedColors);
        marbles.push({
          id: generateId(),
          name,
          color,
          isBot: true,
        });
        usedNames.add(name);
        usedColors.add(color);
      }

      const added = toAdd.length - skippedDuplicates;
      const truncated = uniqueNames.length - toAdd.length;
      const parts: string[] = [];
      if (added > 0) parts.push(`Added ${added} player${added !== 1 ? 's' : ''}`);
      if (skippedDuplicates > 0) parts.push(`${skippedDuplicates} duplicate${skippedDuplicates !== 1 ? 's' : ''} skipped`);
      if (truncated > 0) parts.push(`${truncated} skipped (max ${MAX_MARBLES} players)`);

      const statusMsg = parts.length > 0 ? parts.join('. ') + '.' : '';

      renderLobby();

      // Re-open panel to show status feedback
      const panel = document.getElementById('bulk-import-panel');
      if (panel) panel.style.display = 'block';
      // Clear the textarea after import
      const newTextarea = document.getElementById('bulk-import-text') as HTMLTextAreaElement;
      if (newTextarea) newTextarea.value = '';

      if (statusMsg) {
        const status = document.getElementById('bulk-import-status');
        if (status) {
          status.textContent = statusMsg;
          status.style.color = added > 0 ? '#2ecc40' : '#ff6b6b';
        }
      }
    });

    document.getElementById('gravity-slider')?.addEventListener('input', (e) => {
      gravityScale = parseFloat((e.target as HTMLInputElement).value);
      const label = document.getElementById('gravity-value');
      if (label) label.textContent = gravityScale.toFixed(4);
    });

    document.getElementById('btn-start-race')?.addEventListener('click', () => {
      if (marbles.length < 2) return;
      onStart({ marbles: [...marbles], gravityScale });
    });
  }

  function addPlayer() {
    const name = getUnusedPlayerName(usedNames);
    const color = getUnusedColor(usedColors);
    marbles.push({
      id: generateId(),
      name,
      color,
      isBot: true,
    });
    usedNames.add(name);
    usedColors.add(color);
  }

  function show() {
    container.style.display = 'flex';
    renderLobby();
  }

  function hide() {
    container.style.display = 'none';
  }

  function destroy() {
    container.remove();
  }

  parent.appendChild(container);
  renderLobby();

  return { container, show, hide, destroy };
}
