import { useState } from 'react';
import type { WriteStage } from '../canon/registration';
import { local } from './router';

const CONSENT_KEY = 'recipe-loader.consent.v1';

/** PLAN.md rule 10: the first write needs an explicit risk acknowledgement. */
export function useConsent(): [boolean, (v: boolean) => void] {
  const [given, setGiven] = useState(() => local.get(CONSENT_KEY) === 'yes');
  return [
    given,
    (v: boolean) => {
      setGiven(v);
      if (v) local.set(CONSENT_KEY, 'yes');
    },
  ];
}

export function ConsentBox({ given, onChange }: { given: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="consent">
      <input type="checkbox" checked={given} onChange={(e) => onChange(e.target.checked)} />
      <span>
        I understand this is an unofficial tool, not made or supported by Canon. It writes to my camera's User Def. slot,
        backs the slot up first and checks the result, but I use it at my own risk.
      </span>
    </label>
  );
}

const STAGES: { key: WriteStage; label: string }[] = [
  { key: 'preflight', label: 'Checking the camera' },
  { key: 'backup', label: 'Backing up the slot' },
  { key: 'lock', label: 'Locking camera buttons' },
  { key: 'style', label: 'Writing style data' },
  { key: 'state', label: 'Writing slot settings' },
  { key: 'verify', label: 'Reading back to verify' },
];

export function StageList({ stage }: { stage: WriteStage | null }) {
  if (!stage) return null;
  const idx = STAGES.findIndex((s) => s.key === stage);
  return (
    <ol className="stages" aria-live="polite">
      {STAGES.map((s, i) => (
        <li key={s.key} className={i < idx ? 'done' : i === idx ? 'current' : ''}>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

export const STAGE_TEXT: Record<WriteStage, string> = {
  preflight: 'before anything was written (checks)',
  backup: 'while backing up; nothing was written',
  lock: 'while locking the camera; nothing was written',
  style: 'while writing the style data',
  state: 'while writing the slot settings (the style data was already written)',
  unlock: 'while unlocking the camera buttons (the write itself finished)',
  verify: 'while reading back to verify',
};
