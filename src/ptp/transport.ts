export interface TransactRequest {
  code: number;
  params?: number[];
  dataOut?: Uint8Array;
  expectDataIn?: boolean;
  timeoutMs?: number;
}

export interface TransactResult {
  responseCode: number;
  params: number[];
  dataIn?: Uint8Array;
}

export interface Transport {
  open(): Promise<void>;
  close(): Promise<void>;
  /** One full PTP transaction. Sends command (+ optional data), returns response + any inbound data. */
  transact(req: TransactRequest): Promise<TransactResult>;
}

export const ResponseCode = {
  OK: 0x2001,
  GeneralError: 0x2002,
  SessionNotOpen: 0x2003,
  OperationNotSupported: 0x2005,
  ParameterNotSupported: 0x2006,
  DeviceBusy: 0x2019,
  SessionAlreadyOpen: 0x201e,
} as const;

export class PtpError extends Error {
  constructor(
    readonly opCode: number,
    readonly responseCode: number,
    message?: string,
  ) {
    super(message ?? `PTP op 0x${hex(opCode)} failed with response 0x${hex(responseCode)}`);
    this.name = 'PtpError';
  }
}

export class TimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} timed out after ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

export function hex(n: number, width = 4): string {
  return n.toString(16).toUpperCase().padStart(width, '0');
}

/** Throws PtpError unless the response is OK. */
export function expectOk(code: number, r: TransactResult): TransactResult {
  if (r.responseCode !== ResponseCode.OK) throw new PtpError(code, r.responseCode);
  return r;
}
