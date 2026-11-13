import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from '../../src/utils/cursor';

describe('Cursor utilities', () => {
  it('encodes and decodes a cursor round-trip', () => {
    const payload = { createdAt: '2026-01-01T00:00:00.000Z', id: 'msg-abc' };
    const encoded = encodeCursor(payload);
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual(payload);
  });

  it('returns null for a malformed cursor', () => {
    expect(decodeCursor('not-valid-base64!!!')).toBeNull();
  });

  it('returns null for a cursor missing required fields', () => {
    const bad = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url');
    expect(decodeCursor(bad)).toBeNull();
  });
});

