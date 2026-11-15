// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { NewProjectWizard } from './BriefEditor';
import { RuleRows, appliesText } from './docs/RuleRows';
import DesignReferencesView from './docs/DesignReferencesView';
import { BUILT_IN_REFERENCES, applyReference } from '../model/designReference';
import { sampleProject } from '../data/sampleProject';
import type { DesignRule } from '../model/designRules';

const noop = () => {};
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('new project: authority and design rules', () => {
  it('offers country, authority and rule set, starting on DEWA, with the values the project starts with', () => {
    const html = renderToStaticMarkup(<NewProjectWizard initialName="Villa" references={BUILT_IN_REFERENCES} onQuick={noop} onCreate={noop} onCancel={noop} />);
    const t = text(html);
    expect(t).toContain('Authority and design rules');
    expect(html).toMatch(/<option value="United Arab Emirates" selected="">United Arab Emirates<\/option>/);
    expect(t).toMatch(/DEWA — Dubai.*ADDC — Abu Dhabi.*EtihadWE — Northern Emirates/);
    expect(t).toContain('DEWA (Dubai) — built-in v1');
    expect(t).toMatch(/415 V · 50 Hz.*Ambient 45 °C.*VD 4 %.*Min wire 2.5 \/ 4 mm².*ELCB 100 \/ 30 mA.*To verify/);
    expect(t).toContain('filled in as DEWA');
  });
});

describe('rule rows', () => {
  const rule = (p: Partial<DesignRule>): DesignRule => ({ id: 'r', kind: 'elcbMa', when: {}, value: 30, ...p });
  it('describes what a row applies to', () => {
    expect(appliesText(rule({}))).toBe('All circuits');
    expect(appliesText(rule({ when: { category: 'power', loadType: 'hvac', minKw: 5 } }))).toBe('Power · HVAC · from 5 kW');
  });
  it('shows rows from a reference read only with their source, and the project\'s own as fields', () => {
    const html = renderToStaticMarkup(<RuleRows rows={[rule({ id: 'mine', kind: 'minWireMm2', value: 6, when: { loadType: 'hvac' } })]} fixed={[rule({ id: 'ref', when: { loadType: 'sockets' }, from: 'ADDC (Abu Dhabi) v2', clause: '5.4.8' })]} onChange={noop} empty="none" />);
    const t = text(html);
    expect(t).toContain('Small power / sockets');
    expect(t).toContain('30 mA');
    expect(t).toContain('ADDC (Abu Dhabi) v2');
    expect(html).toMatch(/aria-label="Value"[^>]*value="6"/);
    expect(t).toContain('Here');
    expect(renderToStaticMarkup(<RuleRows rows={[]} empty="No rule rows yet" />)).toContain('No rule rows yet');
  });
});

describe('design references', () => {
  it('has the builds-on choice and the rule rows section', () => {
    const t = text(renderToStaticMarkup(<DesignReferencesView project={sampleProject} onApply={noop} onStatus={noop} />));
    expect(t).toContain('Builds on');
    expect(t).toContain('Nothing (stand-alone)');
    expect(t).toContain('Rule rows');
  });
});

describe('changing the authority of a running project', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const dewa = BUILT_IN_REFERENCES.find((r) => r.id === 'builtin-dewa')!;
  const addc = BUILT_IN_REFERENCES.find((r) => r.id === 'builtin-addc')!;
  const mount = async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onApply = vi.fn();
    const project = applyReference(sampleProject, dewa);
    await act(async () => root.render(<DesignReferencesView project={project} onApply={onApply} onStatus={noop} />));
    const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === label);
    const click = (el: Element | undefined) => act(async () => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const row = (name: string) => [...host.querySelectorAll('tr')].find((r) => r.textContent?.includes(name));
    const find = (label: string) => vi.waitFor(() => { const b = button(label); expect(b).toBeDefined(); return b; });
    return { host, root, onApply, click, row, find, button };
  };

  it('guards another authority\'s set with a warning and a tick box', async () => {
    const { host, root, onApply, click, row, find, button } = await mount();
    expect(text(host.innerHTML)).toContain('The authority is chosen when the project starts.');
    await click(row('ADDC (Abu Dhabi)'));
    await click(await find('Change authority…'));
    await vi.waitFor(() => expect(text(host.innerHTML)).toContain('This project is under DEWA. Changing to ADDC sizes the circuits again; sizes set by hand stay.'));
    const box = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.closest('label')?.textContent?.trim()).toBe('I want to change the authority');
    expect((button('Change authority') as HTMLButtonElement).disabled).toBe(true);
    await click(box);
    expect((button('Change authority') as HTMLButtonElement).disabled).toBe(false);
    await click(button('Change authority'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ id: addc.id }));
    act(() => root.unmount());
    host.remove();
  });

  it('applies the authority\'s own set as before, with no tick box', async () => {
    const { host, root, click, row, find } = await mount();
    await click(row('DEWA (Dubai)'));
    await click(await find('Apply to this project…'));
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    act(() => root.unmount());
    host.remove();
  });
});
