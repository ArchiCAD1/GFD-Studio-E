// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectSettings from './ProjectSettings';
import { newProject } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
beforeEach(() => { root = createRoot(document.body.appendChild(document.createElement('div'))); });
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ''; });

describe('Project settings: project number', () => {
  it('shows the number, limits it to 40 characters and saves it with the project', () => {
    const onSave = vi.fn();
    act(() => root.render(<ProjectSettings project={{ ...newProject('Villa'), info: { projectNo: 'P1', owner: 'Client' } }} onSave={onSave} onClose={() => {}} />));
    act(() => { [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Submission forms'))!.click(); });
    const input = [...document.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Project number'))!.querySelector('input')!;
    expect(input.value).toBe('P1');
    expect(input.maxLength).toBe(40);
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'P2611'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => { [...document.querySelectorAll('button')].find((b) => /^(Save|OK|Apply)/.test(b.textContent ?? ''))!.click(); });
    expect(onSave.mock.calls[0][0].info).toMatchObject({ projectNo: 'P2611', owner: 'Client' });
  });
});
