// Canon EOS PTP codes. Source: libgphoto2 camlibs/ptp2/ptp.h (verified), see PLAN.md 5.2.

export const R100_USB = { vendorId: 0x04a9, productId: 0x3312 } as const;
export const CANON_VENDOR_ID = 0x04a9;

export const Op = {
  GetDeviceInfo: 0x1001,
  OpenSession: 0x1002,
  CloseSession: 0x1003,
  SetDevicePropValueEx: 0x9110,
  SetRemoteMode: 0x9114,
  SetEventMode: 0x9115,
  GetEvent: 0x9116,
  RequestDevicePropValue: 0x9127,
  SetUILock: 0x911b,
  ResetUILock: 0x911c,
  KeepDeviceOn: 0x911d,
  GetPictureStylePCFlavorParam: 0x9189,
  SetPictureStylePCFlavorParam: 0x918a,
} as const;

export const Prop = {
  WhiteBalance: 0xd109,
  ColorTemperature: 0xd10a,
  WhiteBalanceAdjustA: 0xd10b,
  WhiteBalanceAdjustB: 0xd10c,
  BatteryPower: 0xd111,
  PictureStyle: 0xd110,
  ModelID: 0xd116,
  PictureStyleUserSet1: 0xd160,
  PictureStyleUserSet2: 0xd161,
  PictureStyleUserSet3: 0xd162,
  PictureStyleExUserSet1: 0xd163,
  PictureStyleExUserSet2: 0xd164,
  PictureStyleExUserSet3: 0xd165,
  PictureStyleParam1: 0xd170,
  PictureStyleParam2: 0xd171,
  PictureStyleParam3: 0xd172,
  HighISONoiseReduction: 0xd178,
  HighlightTonePriority: 0xd13b,
  FlavorLUTParams: 0xd17f,
} as const;

export const EventType = {
  PropValueChanged: 0xc189,
  AvailListChanged: 0xc18a,
} as const;

/** Properties that the probe asks for explicitly with 0x9127. Reported safe on EOS RP. */
export const SAFE_REQUEST_PROPS: readonly number[] = [
  Prop.FlavorLUTParams,
  Prop.PictureStyleParam1,
  Prop.PictureStyleParam2,
  Prop.PictureStyleParam3,
];

/**
 * Never send 0x9127 for these: on an EOS RP it blocked the camera until power-cycle
 * (Style Studio research note RP_LIVE_INPUTS). Their values arrive in the event drain.
 */
export const NEVER_REQUEST_PROPS: ReadonlySet<number> = new Set([
  Prop.PictureStyleUserSet1,
  Prop.PictureStyleUserSet2,
  Prop.PictureStyleUserSet3,
  Prop.PictureStyleExUserSet1,
  Prop.PictureStyleExUserSet2,
  Prop.PictureStyleExUserSet3,
]);

const names: Record<number, string> = {};
for (const [k, v] of Object.entries(Op)) names[v] = k;
const propNames: Record<number, string> = {};
for (const [k, v] of Object.entries(Prop)) propNames[v] = k;

export const opName = (code: number): string => names[code] ?? `0x${code.toString(16).toUpperCase()}`;
export const propName = (code: number): string => propNames[code] ?? `0x${code.toString(16).toUpperCase()}`;
