/* tests/import/workerClient.test.js — Unit 2: worker boundary RPC.
 *
 * The real Worker isn't available in Node, so we use a mock Worker that
 * simulates the message protocol synchronously (queued via setTimeout).
 */

const path = require('path');
const ENGINE = require(path.resolve(__dirname, '..', '..', 'import-engine', 'index.js'));
const WC = require(path.resolve(__dirname, '..', '..', 'import-engine', 'workerClient.js'));

class MockWorker {
  constructor() {
    this._listeners = { message: [] };
    this._handler = null;
    this.terminated = false;
  }
  set onmessage(fn) { /* not used */ }
  addEventListener(ev, fn) {
    if (ev === 'message') this._listeners.message.push(fn);
  }
  // Tests set _handler; it receives postMessage payloads and may call _emit.
  _emit(msg) {
    setTimeout(() => {
      this._listeners.message.forEach(fn => fn({ data: msg }));
    }, 0);
  }
  postMessage(msg) {
    if (this._handler) this._handler(msg, this);
  }
  terminate() { this.terminated = true; }
}

function makeFile() {
  return {
    name: 'sample.pdf',
    type: 'application/pdf',
    arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3, 4]).buffer),
  };
}

describe('worker client', () => {
  it('round-trips an import via the message protocol', async () => {
    let captured;
    const Ctor = function () {
      const w = new MockWorker();
      w._handler = (msg) => {
        captured = msg;
        if (msg.type === 'import') {
          w._emit({ type: 'progress', id: msg.id, message: { stage: 'extract' } });
          w._emit({ type: 'result',   id: msg.id, result: { ok: true, project: { v: 8 }, warnings: [] } });
        }
      };
      return w;
    };

    const client = ENGINE.createWorkerClient({ scriptUrl: 'x', WorkerCtor: Ctor });
    const progress = [];
    const handle = client.import(makeFile(), { onProgress: m => progress.push(m.stage) });
    const result = await handle.result;

    expect(captured.type).toBe('import');
    expect(captured.file.name).toBe('sample.pdf');
    expect(captured.file.bytes).toBeInstanceOf(Uint8Array);
    expect(progress).toEqual(['extract']);
    expect(result.ok).toBe(true);
  });

  it('propagates errors and rehydrates typed names', async () => {
    const Ctor = function () {
      const w = new MockWorker();
      w._handler = (msg) => {
        if (msg.type === 'import') {
          w._emit({ type: 'error', id: msg.id, error: { name: 'ImportParseError', message: 'oops', details: { x: 1 } } });
        }
      };
      return w;
    };
    const client = ENGINE.createWorkerClient({ scriptUrl: 'x', WorkerCtor: Ctor });
    await expect(client.import(makeFile()).result).rejects.toMatchObject({
      name: 'ImportParseError',
      message: 'oops',
      details: { x: 1 },
    });
  });

  it('sends cancel messages and terminates cleanly', async () => {
    const sent = [];
    const Ctor = function () {
      const w = new MockWorker();
      w._handler = (msg) => { sent.push(msg.type); };
      return w;
    };
    const client = ENGINE.createWorkerClient({ scriptUrl: 'x', WorkerCtor: Ctor });
    const handle = client.import(makeFile());
    const swallow = handle.result.catch(() => {}); // we'll terminate, expect rejection
    // Wait one tick so the import message is sent before we cancel.
    await new Promise(r => setTimeout(r, 0));
    handle.cancel();
    expect(sent).toContain('import');
    expect(sent).toContain('cancel');

    client.terminate();
    await swallow;
    expect(client._worker.terminated).toBe(true);
  });

  it('terminate rejects inflight imports with AbortedError', async () => {
    const Ctor = function () {
      const w = new MockWorker();
      w._handler = () => {}; // never reply
      return w;
    };
    const client = ENGINE.createWorkerClient({ scriptUrl: 'x', WorkerCtor: Ctor });
    const handle = client.import(makeFile());
    const assertion = expect(handle.result).rejects.toMatchObject({ name: 'ImportAbortedError' });
    await new Promise(r => setTimeout(r, 0));
    client.terminate();
    await assertion;
  });

  it('throws when no Worker constructor is available', () => {
    expect(() => ENGINE.createWorkerClient({ scriptUrl: 'x' })).toThrow(/no Worker constructor/);
  });
});
