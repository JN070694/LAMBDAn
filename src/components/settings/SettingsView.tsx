import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useStore } from '@/store';
import type { AppSettings, GamepadMapping } from '@/types';

const DEFAULT_MAPPING: GamepadMapping = {
  select: 0, back: 1, skipCorrect: 2, skipIncorrect: 3,
  media: 4, references: 5, pause: 9, score: 8,
};

const ACTIONS: { key: keyof GamepadMapping; label: string; note?: string }[] = [
  { key: 'select',       label: 'Select' },
  { key: 'back',         label: 'Back' },
  { key: 'skipCorrect',  label: 'Skip, Mark Correct' },
  { key: 'skipIncorrect',label: 'Skip, Mark Incorrect' },
  { key: 'media',        label: 'Media' },
  { key: 'references',   label: 'References' },
  { key: 'pause',        label: 'Pause' },
  { key: 'score',        label: 'See Score', note: 'active quizzes only' },
];

const DEFAULT_LABELS: Record<number, string> = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB',
  6: 'LT', 7: 'RT', 8: 'Select', 9: 'Start',
};

export default function SettingsView() {
  const [tab, setTab] = useState<'quiz' | 'gamepad' | 'about'>('quiz');
  const { settings, setSettings, gamepadMapping, setGamepadMapping } = useStore();
  const [localMapping, setLocalMapping] = useState<GamepadMapping>(DEFAULT_MAPPING);
  const [remapping, setRemapping] = useState<keyof GamepadMapping | null>(null);
  const [remapWizardIndex, setRemapWizardIndex] = useState(0);
  const [remapAllActive, setRemapAllActive] = useState(false);

  useEffect(() => {
    invoke<AppSettings>('get_settings').then(setSettings).catch(() => {});
    invoke<GamepadMapping>('get_gamepad_mapping').then(m => {
      setLocalMapping(m);
      setGamepadMapping(m);
    }).catch(() => {});
  }, []);

  useEffect(() => { setLocalMapping(gamepadMapping); }, [gamepadMapping]);

  const saveSettings = async (s: AppSettings) => {
    setSettings(s);
    await invoke('save_settings', { settings: s });
  };

  const saveMapping = async () => {
    setGamepadMapping(localMapping);
    await invoke('save_gamepad_mapping', { mapping: localMapping });
  };

  const resetDefaults = () => setLocalMapping(DEFAULT_MAPPING);

  // Individual remap: listen for next gamepad button press
  const startRemap = (key: keyof GamepadMapping) => {
    setRemapping(key);
    const poll = setInterval(() => {
      const gamepads = navigator.getGamepads();
      for (const gp of gamepads) {
        if (!gp) continue;
        for (let i = 0; i < gp.buttons.length; i++) {
          if (gp.buttons[i].pressed) {
            setLocalMapping(m => ({ ...m, [key]: i }));
            setRemapping(null);
            clearInterval(poll);
            return;
          }
        }
      }
    }, 50);
    setTimeout(() => { clearInterval(poll); setRemapping(null); }, 10000);
  };

  // Remap all wizard
  const startRemapAll = () => {
    setRemapWizardIndex(0);
    setRemapAllActive(true);
    listenForNextButton(0, {});
  };

  const listenForNextButton = (idx: number, acc: Partial<GamepadMapping>) => {
    if (idx >= ACTIONS.length) {
      setLocalMapping(m => ({ ...m, ...acc }));
      setRemapAllActive(false);
      return;
    }
    const poll = setInterval(() => {
      const gamepads = navigator.getGamepads();
      for (const gp of gamepads) {
        if (!gp) continue;
        for (let i = 0; i < gp.buttons.length; i++) {
          if (gp.buttons[i].pressed) {
            const newAcc = { ...acc, [ACTIONS[idx].key]: i };
            clearInterval(poll);
            setRemapWizardIndex(idx + 1);
            setTimeout(() => listenForNextButton(idx + 1, newAcc), 400);
            return;
          }
        }
      }
    }, 50);
  };

  return (
    <div>
      {/* Tabs */}
      <div className="settings-tabs" style={{ marginBottom: 24 }}>
        {(['quiz', 'gamepad', 'about'] as const).map(t => (
          <div key={t} className={`settings-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </div>
        ))}
      </div>

      {/* ── Quiz tab ── */}
      {tab === 'quiz' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="section-label">Quiz Behaviour</div>
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Instant Feedback</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
                Show correct / incorrect immediately after each answer
              </div>
            </div>
            <button
              className={`toggle ${settings.instantFeedback ? 'on' : 'off'}`}
              onClick={() => saveSettings({ ...settings, instantFeedback: !settings.instantFeedback })}
              aria-label="Toggle instant feedback"
            >
              <div className="toggle-knob" />
            </button>
          </div>
        </div>
      )}

      {/* ── Gamepad tab ── */}
      {tab === 'gamepad' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* BETA placeholder */}
          <div style={{ border: '2px dashed #ccc', borderRadius: 10, height: 180,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 8, background: '#fafafa' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700,
              color: '#ccc', letterSpacing: '0.1em' }}>BETA</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#bbb',
              letterSpacing: '0.08em' }}>gamepad image not available in this version</span>
          </div>

          {/* Gamepad status */}
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Gamepad Status</div>
              <div style={{ fontSize: 11, color: '#888', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                {navigator.getGamepads().some(g => g)
                  ? 'Gamepad connected'
                  : 'No gamepad detected — connect via USB or Bluetooth'}
              </div>
            </div>
            <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
              background: navigator.getGamepads().some(g => g) ? '#000' : '#ccc',
              border: '1.5px solid #999' }} />
          </div>

          {/* Remap all wizard */}
          {remapAllActive && (
            <div className="card" style={{ background: '#000', color: '#fff', textAlign: 'center', padding: 20 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 8 }}>
                Press button for:
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                {ACTIONS[remapWizardIndex]?.label ?? 'Done'}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#888' }}>
                {remapWizardIndex + 1} / {ACTIONS.length}
              </div>
              <button className="btn btn-secondary" style={{ marginTop: 16 }}
                onClick={() => setRemapAllActive(false)}>
                Cancel
              </button>
            </div>
          )}

          {/* Mapping table */}
          <div className="table" style={{ '--cols': '1fr 1fr 1fr' } as React.CSSProperties}>
            <div className="table-head" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <div>Action</div>
              <div>Button</div>
              <div>Remap</div>
            </div>
            {ACTIONS.map((action, i) => (
              <div key={action.key} className="table-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{action.label}</div>
                  {action.note && <div style={{ fontSize: 10, color: '#888', fontFamily: 'var(--font-mono)' }}>{action.note}</div>}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                  {remapping === action.key
                    ? <span style={{ fontWeight: 700 }}>Press a button…</span>
                    : DEFAULT_LABELS[localMapping[action.key]] ?? `Button ${localMapping[action.key]}`
                  }
                </div>
                <div>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => startRemap(action.key)}
                    disabled={!!remapping || remapAllActive}
                  >
                    Change
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={resetDefaults}>Reset Defaults</button>
            <button className="btn btn-secondary" onClick={startRemapAll} disabled={remapAllActive}>
              Remap All
            </button>
            <button className="btn btn-primary" onClick={saveMapping}>Save</button>
          </div>
        </div>
      )}

      {/* ── About tab ── */}
      {tab === 'about' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="section-label">About</div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['Version', '1.0.0-beta'],
              ['Built with', 'Tauri v2 · Rust · React · TypeScript'],
              ['Database', 'SQLite (rusqlite)'],
              ['License', 'AGPL-3.0'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#666' }}>{k}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
