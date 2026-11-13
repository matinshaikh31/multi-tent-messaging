import { describe, it, expect } from 'vitest';
import { canTransition } from '../../src/modules/webhooks/webhook.state-machine';

// Unit tests for the status state machine.
// These tests run WITHOUT a database — just pure logic.
// This is WHY we isolate the state machine in its own file.

describe('State Machine: canTransition()', () => {
  it('allows QUEUED -> SENT', () => {
    expect(canTransition('QUEUED', 'SENT')).toBe(true);
  });

  it('allows QUEUED -> DELIVERED (skipped SENT)', () => {
    // Per README: DELIVERED can advance QUEUED directly (delayed SENT event accommodation)
    expect(canTransition('QUEUED', 'DELIVERED')).toBe(true);
  });

  it('allows SENT -> DELIVERED', () => {
    expect(canTransition('SENT', 'DELIVERED')).toBe(true);
  });

  it('allows DELIVERED -> READ', () => {
    expect(canTransition('DELIVERED', 'READ')).toBe(true);
  });

  it('allows QUEUED -> FAILED', () => {
    expect(canTransition('QUEUED', 'FAILED')).toBe(true);
  });

  it('allows SENT -> FAILED', () => {
    expect(canTransition('SENT', 'FAILED')).toBe(true);
  });

  it('blocks READ -> SENT (backward regression)', () => {
    expect(canTransition('READ', 'SENT')).toBe(false);
  });

  it('blocks READ -> DELIVERED (backward regression)', () => {
    expect(canTransition('READ', 'DELIVERED')).toBe(false);
  });

  it('blocks DELIVERED -> SENT (backward regression)', () => {
    expect(canTransition('DELIVERED', 'SENT')).toBe(false);
  });

  it('blocks FAILED -> SENT (terminal state)', () => {
    expect(canTransition('FAILED', 'SENT')).toBe(false);
  });

  it('blocks FAILED -> READ (terminal state)', () => {
    expect(canTransition('FAILED', 'READ')).toBe(false);
  });

  it('blocks READ -> READ (same status)', () => {
    expect(canTransition('READ', 'READ')).toBe(false);
  });

  it('blocks DELIVERED -> FAILED (terminal after DELIVERED)', () => {
    // FAILED only allowed from QUEUED or SENT
    expect(canTransition('DELIVERED', 'FAILED')).toBe(false);
  });
});

