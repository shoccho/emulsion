import { useState } from 'react';
import { diffSettings, formatSetting, settingLabel, type CameraSettings } from '../canon/camera-settings';
import { useCamera } from './camera-context';
import { Notice } from './components';
import { ConsentBox, useConsent } from './write';

/** Shows what a recipe would change in the camera-wide settings and applies it, with undo. */
export function CameraSettingsPanel({ target, recipeName }: { target: Partial<CameraSettings>; recipeName: string }) {
  const cam = useCamera();
  const [undo, setUndo] = useState<Partial<CameraSettings> | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [consent, setConsent] = useConsent();
  if (!cam.snapshot) return null;
  const changes = diffSettings(cam.snapshot.settings, target);

  const apply = async (t: Partial<CameraSettings>, isUndo: boolean) => {
    setMsg(null);
    try {
      const r = await cam.applySettings(t);
      if (r.mismatched.length) {
        setMsg({ tone: 'warn', text: `The camera did not take: ${r.mismatched.map(settingLabel).join(', ')}. Check them on the camera.` });
      } else if (isUndo) {
        setMsg({ tone: 'ok', text: 'Previous camera settings restored.' });
        setUndo(null);
      } else {
        setMsg({ tone: 'ok', text: r.changes.length ? `Applied ${r.changes.length} setting${r.changes.length === 1 ? '' : 's'}.` : 'Already set.' });
        const prev: Partial<CameraSettings> = {};
        for (const c of r.changes) if (c.from !== undefined) prev[c.key] = c.from;
        if (r.before.wbMode !== undefined) prev.wbMode = r.before.wbMode;
        setUndo(r.changes.length ? prev : null);
      }
    } catch (e) {
      setMsg({ tone: 'error', text: `Nothing was retried. ${String((e as Error).message ?? e)}` });
    }
  };

  return (
    <div className="settings-panel">
      {changes.length === 0 ? (
        <p className="small ok-text">The camera already has this recipe's white balance, WB shift, noise reduction and highlight tone priority.</p>
      ) : (
        <>
          <table className="changes">
            <thead>
              <tr>
                <th>Setting</th>
                <th>Now</th>
                <th>{recipeName}</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.key}>
                  <td>{settingLabel(c.key)}</td>
                  <td className="muted">{c.from === undefined ? 'unknown' : formatSetting(c.key, c.from)}</td>
                  <td>
                    <strong>{formatSetting(c.key, c.to)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">These change the camera for all shooting, not just this User Def. slot.</p>
          {!consent && <ConsentBox given={consent} onChange={setConsent} />}
          <button className="primary" disabled={!consent || !!cam.busy || !cam.snapshot.battery.okToWrite} onClick={() => void apply(target, false)}>
            Apply camera settings
          </button>
        </>
      )}
      {undo && (
        <button className="secondary" disabled={!!cam.busy} onClick={() => void apply(undo, true)}>
          Undo camera settings
        </button>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
