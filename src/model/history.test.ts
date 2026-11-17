import { describe, expect, it } from 'vitest';
import { MAX_STEPS, record, redo, reset, stepLabel, undo } from './history';

describe('undo / redo', () => {
  it('undoes and redoes steps in order', () => {
    let h = reset('a');
    h = record(h, 'b', 1000);
    h = record(h, 'c', 3000);
    expect(h.present).toBe('c');
    h = undo(h);
    expect(h.present).toBe('b');
    h = undo(h);
    expect(h.present).toBe('a');
    expect(undo(h)).toBe(h); // nothing left
    h = redo(redo(h));
    expect(h.present).toBe('c');
    expect(redo(h)).toBe(h);
  });

  it('a new change after undo drops the redo steps', () => {
    let h = record(record(reset(1), 2, 1000), 3, 3000);
    h = record(undo(h), 9, 5000);
    expect([h.past, h.present, h.future]).toEqual([[1, 2], 9, []]);
  });

  it('changes close together are one step', () => {
    let h = record(reset('a'), 'b', 1000);
    h = record(h, 'bc', 1200);
    h = record(h, 'bcd', 1400);
    expect(undo(h).present).toBe('a');
    h = record(h, 'x', 5000);
    expect(undo(h).present).toBe('bcd');
  });

  it('a forced step is never merged', () => {
    const h = record(record(reset('a'), 'b', 1000), 'c', 1100, 0);
    expect(undo(h).present).toBe('b');
  });

  it('the same value is not a step, and history is capped', () => {
    const h = reset({ v: 1 });
    expect(record(h, h.present, 10)).toBe(h);
    let big = reset(0);
    for (let i = 1; i <= MAX_STEPS + 20; i++) big = record(big, i, i * 1000);
    expect(big.past).toHaveLength(MAX_STEPS);
  });
});

describe('step names for Undo and Redo', () => {
  const name = (h: { pastLabels: (string | undefined)[]; past: unknown[] }) => (h.past.length ? h.pastLabels[h.past.length - 1] : undefined);
  it('the label of a step moves with undo and redo', () => {
    let h = record(record(reset('a'), 'b', 1000, 600, 'Move'), 'c', 3000, 600, 'Offset');
    expect(name(h)).toBe('Offset');
    h = undo(h);
    expect([name(h), h.futureLabels[0]]).toEqual(['Move', 'Offset']);
    h = undo(h);
    expect([name(h), h.futureLabels]).toEqual([undefined, ['Move', 'Offset']]);
    h = redo(h);
    expect([name(h), h.futureLabels]).toEqual(['Move', ['Offset']]);
    h = redo(h);
    expect([name(h), h.futureLabels]).toEqual(['Offset', []]);
  });

  it('a step merged into the one before keeps the newer label; a new change drops the redo labels', () => {
    let h = record(reset('a'), 'b', 1000, 600, 'Move');
    h = record(h, 'bc', 1200, 600, 'Rotate');
    expect([h.past.length, name(h)]).toEqual([1, 'Rotate']);
    // A merged change with no name of its own keeps the step's name.
    h = record(h, 'bcd', 1400, 600);
    expect([h.past.length, name(h)]).toEqual([1, 'Rotate']);
    h = undo(h);
    h = record(h, 'x', 5000, 600, 'Erase');
    expect([h.futureLabels, name(h)]).toEqual([[], 'Erase']);
  });

  it('join merges into the step before whatever the time: one undo, the newer label (else the older)', () => {
    let h = record(reset('a'), 'b', 1000, 0, 'Move');
    h = record(h, 'c', 90000, 0, 'Copy', true);
    expect([h.past, name(h)]).toEqual([['a'], 'Copy']);
    h = record(h, 'd', 91000, 0, undefined, true);
    expect([h.past.length, name(h)]).toEqual([1, 'Copy']);
    expect(undo(h).present).toBe('a');
    // With nothing before it, a joined change is a step of its own.
    expect(record(reset('a'), 'b', 5, 600, 'Move', true).past).toEqual(['a']);
  });

  it('the labels stay level with the steps when the history is capped', () => {
    let h = reset(0);
    for (let i = 1; i <= MAX_STEPS + 5; i += 1) h = record(h, i, i * 10000, 600, `S${i}`);
    expect([h.pastLabels.length, h.past.length, name(h)]).toEqual([MAX_STEPS, MAX_STEPS, `S${MAX_STEPS + 5}`]);
  });

  it('stepLabel: the command word in title case, else the text before the first middle dot, at most 28 characters (a middle dot, not a full stop)', () => {
    expect(stepLabel('MOVE  3 objects moved · ⌘Z to undo')).toBe('Move');
    expect(stepLabel('OFFSET  0.30 m · ⌘Z to undo')).toBe('Offset');
    expect(stepLabel('Cable tray 300 mm · ⌘Z to undo')).toBe('Cable tray 300 mm');
    expect(stepLabel('Line drawn')).toBe('Line drawn');
    expect(stepLabel('A very long description of what was done to the drawing · ⌘Z to undo')).toBe('A very long description of…');
    expect(stepLabel('A very long description of what was done to the drawing · ⌘Z to undo')!.length).toBeLessThanOrEqual(28);
    expect(stepLabel('')).toBeUndefined();
  });
});
