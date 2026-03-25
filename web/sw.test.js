import { afterEach, describe, expect, it, vi } from 'vitest';

describe('sw.js', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('registers install and activate handlers correctly', async () => {
    const handlers = new Map();
    const skipWaiting = vi.fn();
    const claim = vi.fn(() => Promise.resolve());
    const waitUntil = vi.fn();

    const selfMock = {
      addEventListener: vi.fn((eventName, cb) => {
        handlers.set(eventName, cb);
      }),
      skipWaiting,
      clients: {
        claim
      }
    };

    vi.stubGlobal('self', selfMock);
    await import('./sw.js');

    expect(selfMock.addEventListener).toHaveBeenCalledTimes(2);
    expect(handlers.has('install')).toBe(true);
    expect(handlers.has('activate')).toBe(true);

    handlers.get('install')();
    expect(skipWaiting).toHaveBeenCalledTimes(1);

    handlers.get('activate')({ waitUntil });
    expect(claim).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });
});
