import type { ReactNode } from 'react';
import type { SlotInfo } from '../canon/camera-service';
import { FILTERS, TONINGS } from '../canon/styles';
import type { RecipePlan, PlanLine } from '../recipe/mapping';
import { useCamera } from './camera-context';

export const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

export function Notice({ tone, children, onClose }: { tone: 'error' | 'warn' | 'ok' | 'info'; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div>{children}</div>
      {onClose && (
        <button className="link" onClick={onClose} aria-label="Dismiss">
          Dismiss
        </button>
      )}
    </div>
  );
}

/** Connection status and connect buttons; shown at the top of camera-related pages. */
export function ConnectBar() {
  const cam = useCamera();
  if (cam.snapshot) {
    const { info, battery } = cam.snapshot;
    return (
      <div className="connect-bar">
        <div>
          <strong>{info.model.replace(/^Canon /, '')}</strong>
          {cam.kind === 'demo' && <span className="badge">demo</span>}
          <span className="muted"> · firmware {info.firmware} · battery {battery.label}</span>
        </div>
        <div className="row">
          <button onClick={() => void cam.refresh().catch(() => {})} disabled={!!cam.busy}>
            Refresh
          </button>
          <button className="secondary" onClick={cam.disconnect} disabled={!!cam.busy}>
            Disconnect
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="connect-bar">
      <div>
        {cam.busy ? (
          <span>{cam.busy}</span>
        ) : cam.supported ? (
          <span>Connect the R100 with a USB cable and switch it on.</span>
        ) : (
          <span>This browser cannot use USB devices. Use Chrome or Edge, or try the demo camera.</span>
        )}
      </div>
      <div className="row">
        {cam.supported && (
          <button className="primary" onClick={() => void cam.connectUsb()} disabled={!!cam.busy}>
            Connect camera
          </button>
        )}
        <button className="secondary" onClick={() => void cam.connectDemo()} disabled={!!cam.busy}>
          Try demo camera
        </button>
      </div>
    </div>
  );
}

export function CameraErrors() {
  const cam = useCamera();
  return (
    <>
      {cam.error && (
        <Notice tone="error" onClose={cam.clearError}>
          {cam.error}
        </Notice>
      )}
      {cam.busy && cam.snapshot && <Notice tone="info">{cam.busy}</Notice>}
    </>
  );
}

export function slotSettings(s: SlotInfo): string {
  const w = s.words;
  const mono = w.base === 0x86;
  const parts = [`contrast ${signed(w.contrast)}`];
  if (mono) {
    parts.push(`filter ${FILTERS[w.filter] ?? w.filter}`, `toning ${TONINGS[w.toning] ?? w.toning}`);
  } else {
    parts.push(`saturation ${signed(w.saturation)}`, `colour tone ${signed(w.colorTone)}`);
  }
  parts.push(`sharpness ${w.sharpness}/${w.fineness}/${w.threshold}`);
  return parts.join(' · ');
}

function Lines({ lines }: { lines: PlanLine[] }) {
  return (
    <dl className="lines">
      {lines.map((l) => (
        <div key={l.label}>
          <dt>{l.label}</dt>
          <dd>
            {l.value}
            {l.note && <span className="muted"> ({l.note})</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** PLAN.md section 3: every recipe shows what goes in the slot, what to set by hand, and what is not possible. */
export function PlanView({ plan }: { plan: RecipePlan }) {
  return (
    <div className="plan">
      <section>
        <h3>Written to the slot</h3>
        <Lines lines={plan.inSlot} />
      </section>
      <section>
        <h3>Camera settings</h3>
        <p className="muted small">Camera-wide, not part of a User Def. slot. White balance, WB shift, noise reduction and highlight tone priority can be applied over USB below; Auto Lighting Optimizer is set by hand.</p>
        <Lines lines={plan.byHand} />
      </section>
      {plan.notPossible.length > 0 && (
        <section>
          <h3>Not possible on this camera</h3>
          <Lines lines={plan.notPossible} />
        </section>
      )}
    </div>
  );
}

export function FilePicker({ label, onFile, accept = '.json,application/json' }: { label: string; onFile: (f: File) => void; accept?: string }) {
  return (
    <label className="button secondary file-picker">
      {label}
      <input
        type="file"
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
    </label>
  );
}
