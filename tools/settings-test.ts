// Hardware check for camera settings: apply a recipe's settings, verify, then undo to the original values.
// Usage: npm run settings-test -- <recipe-id>
import { WebUSB } from 'usb';
import { WebUsbTransport } from '../src/ptp/webusb-transport';
import { CameraService } from '../src/canon/camera-service';
import { FIELDS, formatSetting, type CameraSettings } from '../src/canon/camera-settings';
import { R100_USB } from '../src/canon/ops';
import { ALL_BUILTIN_RECIPES } from '../src/recipe/builtin';
import { cameraSettingsFor } from '../src/recipe/mapping';

const recipe = ALL_BUILTIN_RECIPES.find((r) => r.id === (process.argv[2] ?? 'fxw-kodachrome-64'));
if (!recipe) throw new Error('unknown recipe id');
const show = (s: Partial<CameraSettings>) => FIELDS.filter((f) => s[f.key] !== undefined).map((f) => `${f.key}=${formatSetting(f.key, s[f.key]!)}`).join(', ');

const device = (await new WebUSB({ allowAllDevices: true }).getDevices()).find((d) => d.vendorId === R100_USB.vendorId && d.productId === R100_USB.productId);
if (!device) throw new Error('No EOS R100 found');
const svc = new CameraService(new WebUsbTransport(device), 'usb');
const target = cameraSettingsFor(recipe);
console.log(`target (${recipe.name}): ${show(target)}`);
const { result } = await svc.applyCameraSettings(target);
console.log(`before: ${show(result.before)}`);
console.log(`after:  ${show(result.after)}`);
console.log(`changed ${result.changes.length}, mismatched: ${result.mismatched.join(', ') || 'none'}`);
const fresh = await svc.readSnapshot();
console.log(`fresh session: ${show(fresh.settings)}`);
const undo = await svc.applyCameraSettings(result.before);
console.log(`undo -> ${show(undo.result.after)}; mismatched: ${undo.result.mismatched.join(', ') || 'none'}`);
