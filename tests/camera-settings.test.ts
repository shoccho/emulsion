import { describe, expect, it } from 'vitest';
import { CameraService } from '../src/canon/camera-service';
import { diffSettings, formatSetting } from '../src/canon/camera-settings';
import { FakeR100 } from '../src/canon/fake-r100';
import { Op, Prop } from '../src/canon/ops';
import { FUJI_X_WEEKLY_RECIPES } from '../src/recipe/builtin';
import { cameraSettingsFor } from '../src/recipe/mapping';
import { newRecipe } from '../src/recipe/schema';

const sleep = async () => {};
const svc = (fake = new FakeR100()) => ({ fake, s: new CameraService(fake.transport, 'demo', { sleep, pollIntervalMs: 0 }) });
const int = (b: Uint8Array | undefined) => new DataView(b!.buffer, b!.byteOffset).getInt32(0, true);

describe('recipe -> camera settings', () => {
  it('maps Kodachrome 64 to R100 values', () => {
    const r = FUJI_X_WEEKLY_RECIPES.find((x) => x.id === 'fxw-kodachrome-64')!;
    expect(cameraSettingsFor(r)).toEqual({ wbMode: 1, shiftAB: 7, shiftMG: -2, highIsoNr: 3, htp: 1 });
  });

  it('includes kelvin only in colour-temperature mode', () => {
    const r = FUJI_X_WEEKLY_RECIPES.find((x) => x.id === 'fxw-kodak-portra-400-v2')!;
    expect(cameraSettingsFor(r)).toMatchObject({ wbMode: 9, kelvin: 5200 });
    expect(cameraSettingsFor(newRecipe('a', 'A'))).not.toHaveProperty('kelvin');
  });

  it('formats values in camera terms', () => {
    expect(formatSetting('shiftAB', 7)).toBe('A7');
    expect(formatSetting('shiftAB', -3)).toBe('B3');
    expect(formatSetting('shiftMG', -2)).toBe('G2');
    expect(formatSetting('highIsoNr', 0)).toBe('Standard');
    expect(formatSetting('wbMode', 23)).toBe('AWB (White priority)');
  });

  it('diff skips kelvin outside colour-temperature mode and unchanged fields', () => {
    expect(diffSettings({ wbMode: 0, kelvin: 5200, htp: 0 }, { wbMode: 1, kelvin: 6000, htp: 0 })).toEqual([{ key: 'wbMode', from: 0, to: 1 }]);
  });
});

describe('applying camera settings on the fake R100', () => {
  it('reads current settings into the snapshot', async () => {
    const { s } = svc();
    const snap = await s.readSnapshot();
    expect(snap.settings).toEqual({ wbMode: 0, kelvin: 5200, shiftAB: 0, shiftMG: 0, highIsoNr: 0, htp: 0 });
  });

  it('writes only changed values, flips the green/magenta sign on the wire, and reads back', async () => {
    const { fake, s } = svc();
    const target = cameraSettingsFor(FUJI_X_WEEKLY_RECIPES.find((x) => x.id === 'fxw-kodachrome-64')!);
    const { result, snapshot } = await s.applyCameraSettings(target);
    expect(result.mismatched).toEqual([]);
    expect(result.changes.map((c) => c.key)).toEqual(['wbMode', 'shiftAB', 'shiftMG', 'highIsoNr', 'htp']);
    expect(int(fake.props.get(Prop.WhiteBalance))).toBe(1);
    expect(int(fake.props.get(Prop.WhiteBalanceAdjustA))).toBe(7);
    expect(int(fake.props.get(Prop.WhiteBalanceAdjustB))).toBe(2); // G2 is +2 on the R100
    expect(snapshot.settings).toMatchObject(target);
    expect(fake.sessionOpen).toBe(false);
  });

  it('undo restores the previous values', async () => {
    const { s } = svc();
    const { result } = await s.applyCameraSettings({ wbMode: 1, shiftAB: 3 });
    const { snapshot } = await s.applyCameraSettings(result.before);
    expect(snapshot.settings).toMatchObject({ wbMode: 0, shiftAB: 0 });
  });

  it('refuses a value outside the camera allowed list before writing anything', async () => {
    const { fake, s } = svc();
    await expect(s.applyCameraSettings({ shiftAB: 2, highIsoNr: 7 })).rejects.toThrow(/does not accept/);
    expect(fake.transport.calls.some((c) => c.code === Op.SetDevicePropValueEx)).toBe(false);
  });

  it('refuses on low battery and on other models', async () => {
    await expect(svc(new FakeR100({ battery: 0 })).s.applyCameraSettings({ wbMode: 1 })).rejects.toThrow(/battery/);
    await expect(svc(new FakeR100({ model: 'Canon EOS RP' })).s.applyCameraSettings({ wbMode: 1 })).rejects.toThrow(/not supported/);
  });
});
