// Select the camera's picture style. Usage: npx tsx tools/research/select-style.ts 0x21
import { WebUSB } from 'usb';
import { WebUsbTransport } from '../../src/ptp/webusb-transport';
import { CameraService } from '../../src/canon/camera-service';
import { selectPictureStyle } from '../../src/canon/capture';
import { Prop, R100_USB } from '../../src/canon/ops';
const id = Number(process.argv[2]);
const d = (await new WebUSB({ allowAllDevices: true }).getDevices()).find((x) => x.productId === R100_USB.productId);
if (!d) throw new Error('no R100');
const svc = new CameraService(new WebUsbTransport(d), 'usb');
await svc.withSession(async (s) => {
  await selectPictureStyle(s, id);
  const v = s.props.get(Prop.PictureStyle)!;
  console.log('selected style now 0x' + new DataView(v.buffer, v.byteOffset).getUint32(0, true).toString(16));
});
