// Scriptable fake camera for tests and demo mode.

import { ResponseCode, hex, type TransactRequest, type TransactResult, type Transport } from './transport';

export type MockHandler = (req: TransactRequest) => TransactResult | Promise<TransactResult>;

export interface MockStep {
  code: number;
  /** If given, request params must equal these. */
  params?: number[];
  reply: TransactResult | MockHandler;
}

/**
 * Two modes:
 * - script: an ordered list of expected commands; any deviation throws.
 * - handlers: a map from opcode to handler; unknown opcodes answer OperationNotSupported.
 */
export class MockTransport implements Transport {
  readonly calls: TransactRequest[] = [];
  opened = false;
  closed = false;

  private constructor(
    private readonly script: MockStep[] | null,
    private readonly handlers: Map<number, MockHandler> | null,
  ) {}

  static scripted(steps: MockStep[]): MockTransport {
    return new MockTransport([...steps], null);
  }

  static handlers(map: Record<number, MockHandler>): MockTransport {
    return new MockTransport(null, new Map(Object.entries(map).map(([k, v]) => [Number(k), v])));
  }

  async open(): Promise<void> {
    this.opened = true;
    this.closed = false;
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  async transact(req: TransactRequest): Promise<TransactResult> {
    if (!this.opened || this.closed) throw new Error('mock transport not open');
    this.calls.push(req);
    if (this.script) {
      const step = this.script.shift();
      if (!step) throw new Error(`mock: unexpected extra command 0x${hex(req.code)}`);
      if (step.code !== req.code) throw new Error(`mock: expected 0x${hex(step.code)}, got 0x${hex(req.code)}`);
      if (step.params && JSON.stringify(step.params) !== JSON.stringify(req.params ?? [])) {
        throw new Error(`mock: 0x${hex(req.code)} params ${JSON.stringify(req.params)} != ${JSON.stringify(step.params)}`);
      }
      return typeof step.reply === 'function' ? step.reply(req) : step.reply;
    }
    const h = this.handlers!.get(req.code);
    if (!h) return { responseCode: ResponseCode.OperationNotSupported, params: [] };
    return h(req);
  }

  /** Script mode: true when every expected step was consumed. */
  get done(): boolean {
    return this.script ? this.script.length === 0 : true;
  }
}

export const ok = (dataIn?: Uint8Array, params: number[] = []): TransactResult =>
  dataIn ? { responseCode: ResponseCode.OK, params, dataIn } : { responseCode: ResponseCode.OK, params };
