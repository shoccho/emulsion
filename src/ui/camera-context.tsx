import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CameraService, describeSlot, type CameraSnapshot, type SlotTarget } from '../canon/camera-service';
import type { ApplyResult, CameraSettings } from '../canon/camera-settings';
import { FakeR100 } from '../canon/fake-r100';
import { CANON_VENDOR_ID, R100_USB } from '../canon/ops';
import type { Slot, SlotBackup, WriteStage } from '../canon/registration';
import { WebUsbTransport } from '../ptp/webusb-transport';
import { db, type StoredBackup } from '../store/db';

export interface WriteOutcome {
  verified: boolean;
  backup: StoredBackup;
}

interface CameraState {
  supported: boolean;
  kind: 'usb' | 'demo' | null;
  snapshot: CameraSnapshot | null;
  busy: string | null;
  stage: WriteStage | null;
  error: string | null;
  connectUsb(): Promise<void>;
  connectDemo(): Promise<void>;
  disconnect(): void;
  refresh(): Promise<void>;
  clearError(): void;
  backup(slot: Slot, reason: string): Promise<StoredBackup>;
  write(slot: Slot, target: SlotTarget, reason: string): Promise<WriteOutcome>;
  applySettings(target: Partial<CameraSettings>): Promise<ApplyResult>;
}

const Ctx = createContext<CameraState | null>(null);

export function useCamera(): CameraState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCamera outside CameraProvider');
  return c;
}

function toStoredBackup(b: SlotBackup, reason: string): StoredBackup {
  const label = describeSlot(b.slot, b.style, b.state).label;
  return { id: `${b.takenAt}-slot${b.slot}`, slot: b.slot, model: b.model, firmware: b.firmware, takenAt: b.takenAt, reason, label, style: b.style, state: b.state };
}

export function friendlyUsbError(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  if (/Unable to claim interface|claimInterface/i.test(msg)) {
    return 'Chrome could not take control of the camera. Another program is using it: quit EOS Utility, Image Capture or Photos, unplug and replug the cable, and try again. On Windows the camera needs the WinUSB driver (see Help).';
  }
  if (/Access denied|SecurityError/i.test(msg)) return 'The browser was not allowed to open the camera. See Help for your operating system.';
  if (/disconnected|NotFoundError|device unavailable/i.test(msg)) return 'The camera was disconnected. Check the cable and that the camera is switched on.';
  if (/timed out/i.test(msg)) return `The camera stopped answering (${msg}). Switch it off and on, then reconnect.`;
  return msg;
}

export function CameraProvider({ children }: { children: ReactNode }) {
  const supported = typeof navigator !== 'undefined' && 'usb' in navigator;
  const serviceRef = useRef<CameraService | null>(null);
  const deviceRef = useRef<USBDevice | null>(null);
  const [kind, setKind] = useState<'usb' | 'demo' | null>(null);
  const [snapshot, setSnapshot] = useState<CameraSnapshot | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stage, setStage] = useState<WriteStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    serviceRef.current = null;
    deviceRef.current = null;
    setKind(null);
    setSnapshot(null);
    setBusy(null);
    setStage(null);
  }, []);

  useEffect(() => {
    if (!supported) return;
    const onDisconnect = (e: USBConnectionEvent) => {
      if (e.device === deviceRef.current) {
        reset();
        setError('The camera was disconnected.');
      }
    };
    navigator.usb.addEventListener('disconnect', onDisconnect);
    return () => navigator.usb.removeEventListener('disconnect', onDisconnect);
  }, [supported, reset]);

  const run = useCallback(async <T,>(label: string, fn: (s: CameraService) => Promise<T>): Promise<T> => {
    const s = serviceRef.current;
    if (!s) throw new Error('No camera connected.');
    setBusy(label);
    setError(null);
    try {
      return await fn(s);
    } catch (e) {
      setError(friendlyUsbError(e));
      throw e;
    } finally {
      setBusy(null);
      setStage(null);
    }
  }, []);

  const start = useCallback(
    async (service: CameraService, k: 'usb' | 'demo') => {
      serviceRef.current = service;
      setKind(k);
      try {
        const snap = await run('Reading the camera…', (s) => s.readSnapshot());
        setSnapshot(snap);
      } catch {
        reset();
      }
    },
    [run, reset],
  );

  const connectUsb = useCallback(async () => {
    setError(null);
    let device: USBDevice;
    try {
      device = await navigator.usb.requestDevice({ filters: [{ vendorId: CANON_VENDOR_ID }] });
    } catch {
      return; // picker closed
    }
    if (device.productId !== R100_USB.productId) {
      setError(`This camera (USB id ${device.productId.toString(16)}) is not supported yet. Only the EOS R100 works today. Other recent Canons, such as the R50, could be added: see "Which cameras?" on the Help page to help.`);
      return;
    }
    deviceRef.current = device;
    await start(new CameraService(new WebUsbTransport(device), 'usb'), 'usb');
  }, [start]);

  const connectDemo = useCallback(async () => {
    setError(null);
    const fake = new FakeR100({ latencyMs: 40 });
    await start(new CameraService(fake.transport, 'demo', { pollIntervalMs: 50 }), 'demo');
  }, [start]);

  const refresh = useCallback(async () => {
    const snap = await run('Reading the camera…', (s) => s.readSnapshot());
    setSnapshot(snap);
  }, [run]);

  const backup = useCallback(
    (slot: Slot, reason: string) =>
      run(`Backing up User Def. ${slot}…`, async (s) => {
        const b = toStoredBackup(await s.backupSlot(slot), reason);
        await db.putBackup(b);
        return b;
      }),
    [run],
  );

  const write = useCallback(
    (slot: Slot, target: SlotTarget, reason: string) =>
      run(`Writing User Def. ${slot}…`, async (s) => {
        let saved: StoredBackup | null = null;
        const { result, snapshot: snap } = await s.writeTarget(
          slot,
          target,
          async (b) => {
            saved = toStoredBackup(b, reason);
            await db.putBackup(saved); // if this fails, nothing is written
          },
          setStage,
        );
        setSnapshot(snap);
        return { verified: result.verified, backup: saved! };
      }),
    [run],
  );

  const applySettings = useCallback(
    (target: Partial<CameraSettings>) =>
      run('Setting camera settings…', async (s) => {
        const { result, snapshot: snap } = await s.applyCameraSettings(target);
        setSnapshot(snap);
        return result;
      }),
    [run],
  );

  const value = useMemo<CameraState>(
    () => ({
      supported,
      kind,
      snapshot,
      busy,
      stage,
      error,
      connectUsb,
      connectDemo,
      disconnect: reset,
      refresh,
      clearError: () => setError(null),
      backup,
      write,
      applySettings,
    }),
    [supported, kind, snapshot, busy, stage, error, connectUsb, connectDemo, reset, refresh, backup, write, applySettings],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
