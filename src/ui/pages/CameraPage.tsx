import { CONTRIBUTING_URL } from '../project';
import { useCallback, useEffect, useState } from 'react';
import { targetFromBackup, type SlotInfo } from '../../canon/camera-service';
import { WriteError, type Slot } from '../../canon/registration';
import { db, type StoredBackup } from '../../store/db';
import { backupToFile, downloadText, parseBackupFile, readFileText, storedLookId } from '../../store/files';
import { FIELDS, formatSetting } from '../../canon/camera-settings';
import { useCamera } from '../camera-context';
import { CameraErrors, ConnectBar, FilePicker, Notice, slotSettings } from '../components';
import { useLibrary } from '../library-context';
import { ConsentBox, STAGE_TEXT, StageList, useConsent } from '../write';

const fileStamp = (iso: string) => iso.replace(/[:.]/g, '-').slice(0, 19);

function downloadBackup(b: StoredBackup) {
  downloadText(`r100-user-def-${b.slot}-${fileStamp(b.takenAt)}.json`, JSON.stringify(backupToFile(b), null, 2));
}

function SlotCard({ s, onBackedUp }: { s: SlotInfo; onBackedUp: () => void }) {
  const cam = useCamera();
  const lib = useLibrary();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(s.header.name ? s.header.name.charAt(0) + s.header.name.slice(1).toLowerCase() : 'Captured look');
  const [msg, setMsg] = useState<string | null>(null);
  const already = s.kind === 'pc' && lib.looks.some((l) => l.kind === 'carrier' && l.carrier.length === s.style.length && l.carrier.every((x, i) => x === s.style[i]));

  return (
    <article className="card slot">
      <div className="slot-head">
        <span className="slot-num">User Def. {s.slot}</span>
        <span className={`badge ${s.kind === 'pc' ? 'badge-accent' : ''}`}>{s.kind === 'pc' ? 'computer style' : 'base style'}</span>
      </div>
      <h3>{s.label}</h3>
      <p className="muted small">{slotSettings(s)}</p>
      <div className="row wrap-row">
        <button
          disabled={!!cam.busy}
          onClick={() =>
            void cam
              .backup(s.slot, 'manual backup')
              .then((b) => {
                downloadBackup(b);
                setMsg('Backed up and downloaded.');
                onBackedUp();
              })
              .catch(() => {})
          }
        >
          Back up
        </button>
        {s.kind === 'pc' && !already && !naming && (
          <button className="secondary" onClick={() => setNaming(true)}>
            Save as look
          </button>
        )}
        {already && <span className="muted small">In your looks</span>}
      </div>
      {naming && (
        <form
          className="row inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void lib
              .saveLook({ id: storedLookId(), name: name.trim() || 'Captured look', carrier: s.style.slice(), source: 'captured', addedAt: new Date().toISOString() })
              .then(() => {
                setNaming(false);
                setMsg('Saved to your looks. Recipes can now use it.');
              })
              .catch((err) => setMsg(`Could not save: ${String(err)}`));
          }}
        >
          <input aria-label="Look name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
          <button type="submit" className="primary">
            Save
          </button>
          <button type="button" className="link" onClick={() => setNaming(false)}>
            Cancel
          </button>
        </form>
      )}
      {msg && <p className="small ok-text">{msg}</p>}
    </article>
  );
}

function BackupRow({ b, slots, onChanged }: { b: StoredBackup; slots: SlotInfo[]; onChanged: () => void }) {
  const cam = useCamera();
  const [target, setTarget] = useState<Slot>(b.slot);
  const [confirming, setConfirming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [consent, setConsent] = useConsent();
  const [result, setResult] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const current = slots.find((s) => s.slot === target);

  const restore = async () => {
    setResult(null);
    try {
      const out = await cam.write(target, targetFromBackup(b), `before restoring "${b.label}"`);
      setResult(
        out.verified
          ? { tone: 'ok', text: `Restored "${b.label}" to User Def. ${target}. Verified by reading it back.` }
          : { tone: 'warn', text: `Written, but the read-back did not match. The previous contents were backed up first.` },
      );
      onChanged();
    } catch (e) {
      const where = e instanceof WriteError ? STAGE_TEXT[e.stage] : '';
      setResult({ tone: 'error', text: `Restore failed ${where}. ${String((e as Error).message ?? e)}` });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <li className="backup">
      <div className="backup-main">
        <div>
          <strong>{b.label}</strong> <span className="muted">from User Def. {b.slot}</span>
          <div className="muted small">
            {new Date(b.takenAt).toLocaleString()} · {b.reason}
          </div>
        </div>
        <div className="row wrap-row">
          <button className="secondary" onClick={() => downloadBackup(b)}>
            Download
          </button>
          {confirmDelete ? (
            <>
              <button className="link danger" onClick={() => void db.deleteBackup(b.id).then(onChanged)}>
                Delete permanently
              </button>
              <button className="link" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </>
          ) : (
            <button className="link danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
        </div>
      </div>
      {cam.snapshot && (
        <div className="restore">
          <label>
            Restore into{' '}
            <select value={target} onChange={(e) => setTarget(Number(e.target.value) as Slot)} disabled={!!cam.busy}>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  User Def. {n}
                </option>
              ))}
            </select>
          </label>
          {!confirming ? (
            <button onClick={() => setConfirming(true)} disabled={!!cam.busy}>
              Restore…
            </button>
          ) : (
            <div className="confirm">
              <p className="small">
                This replaces <strong>{current?.label ?? `User Def. ${target}`}</strong> in User Def. {target}. It is backed up first.
              </p>
              {!consent && <ConsentBox given={consent} onChange={setConsent} />}
              <div className="row">
                <button className="primary" disabled={!consent || !!cam.busy} onClick={() => void restore()}>
                  Restore to User Def. {target}
                </button>
                <button className="link" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
              <StageList stage={cam.stage} />
            </div>
          )}
        </div>
      )}
      {result && <Notice tone={result.tone}>{result.text}</Notice>}
    </li>
  );
}

export function CameraPage() {
  const cam = useCamera();
  const lib = useLibrary();
  const [backups, setBackups] = useState<StoredBackup[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  const reload = useCallback(() => {
    db.listBackups()
      .then(setBackups)
      .catch(() => setBackups([]));
  }, []);
  useEffect(reload, [reload, cam.snapshot]);

  return (
    <>
      <h1>Camera</h1>
      <p className="muted small">
        Works with the Canon EOS R100 only, for now. The R50 and other recent Canons could be supported;{' '}
        <a href={CONTRIBUTING_URL}>help add yours</a>.
      </p>
      <ConnectBar />
      <CameraErrors />
      {!cam.supported && (
        <Notice tone="warn">
          This browser has no WebUSB. Use Chrome, Edge or Opera on a computer or an Android phone. See <a href="#/help">Help</a>.
        </Notice>
      )}

      {cam.snapshot ? (
        <>
          <h2>User Defined picture styles</h2>
          <div className="grid3">
            {cam.snapshot.slots.map((s) => (
              <SlotCard key={s.slot} s={s} onBackedUp={reload} />
            ))}
          </div>
          <h2>Camera settings</h2>
          <p className="small">
            {FIELDS.filter((f) => cam.snapshot!.settings[f.key] !== undefined && (f.key !== 'kelvin' || cam.snapshot!.settings.wbMode === 9))
              .map((f) => `${f.label}: ${formatSetting(f.key, cam.snapshot!.settings[f.key]!)}`)
              .join(' · ')}
          </p>
          <p className="muted small">
            To load a recipe, open <a href="#/recipes">Recipes</a>, pick one and choose a slot. Then select that User Def. style on the camera.
          </p>
        </>
      ) : (
        !cam.busy && (
          <section className="card intro">
            <h2>How it works</h2>
            <ol>
              <li>Connect your EOS R100 by USB cable and switch it on. Close EOS Utility first.</li>
              <li>
                Pick a <a href="#/recipes">recipe</a>, or make your own.
              </li>
              <li>Write it into User Def. 1, 2 or 3. The slot is backed up first and checked afterwards.</li>
              <li>Unplug, select that User Def. picture style on the camera, set the by-hand settings listed with the recipe, and shoot.</li>
            </ol>
            {lib.ready && <p className="muted small">{lib.recipes.length} recipes available.</p>}
          </section>
        )
      )}

      <h2>Backups</h2>
      <p className="muted small">
        A backup is taken automatically before every write and kept in this browser. Download important ones; clearing browser data removes them.
      </p>
      <div className="row">
        <FilePicker
          label="Restore from file…"
          onFile={(f) => {
            setFileError(null);
            readFileText(f)
              .then((t) => db.putBackup(parseBackupFile(t, `file-${Date.now()}`)))
              .then(reload)
              .catch((e) => setFileError(String((e as Error).message ?? e)));
          }}
        />
      </div>
      {fileError && <Notice tone="error">{fileError}</Notice>}
      {backups.length === 0 ? (
        <p className="muted">No backups yet.</p>
      ) : (
        <ul className="backups">
          {backups.map((b) => (
            <BackupRow key={b.id} b={b} slots={cam.snapshot?.slots ?? []} onChanged={reload} />
          ))}
        </ul>
      )}
      {!cam.snapshot && backups.length > 0 && <p className="muted small">Connect the camera to restore a backup.</p>}
    </>
  );
}

