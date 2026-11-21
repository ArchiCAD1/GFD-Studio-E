import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { INFO_ENGINEERING } from '../model/changeClass';
import type { Project } from '../types';

/** MCP: what an AI program is not told unless the engineer starts the server with --show-names.
 *
 * The AI program may be a cloud service, and a project carries who the client is: the project and file name, the
 * parties and addresses of the submission forms, and who made and changed it. None of that is needed to design or
 * check a network, so the MCP server hides it by default: a project is called by an id made from its file name
 * (project-1a2b3c4d, accepted wherever a project is asked for), and those words are taken out of every result and
 * error message. Panel, circuit, level and room names are still sent: the tools cannot work without them. */

const PROJECT_FILE = /\.(gfde|lvds|json)$/i;
const ALIAS = /^project-[0-9a-f]{8}$/;
const HIDDEN = '[hidden]';

/** The id an AI program gets for a project file, in place of its name. The same file always has the same id. */
export const projectAlias = (file: string): string => `project-${createHash('sha256').update(file.toLowerCase()).digest('hex').slice(0, 8)}`;

const projectFiles = (folder: string): string[] => { try { return fs.readdirSync(folder).filter((f) => PROJECT_FILE.test(f)); } catch { return []; } };

/** The project file an id stands for, or undefined when the text is not an id of a file in the folder. */
export function fileOfAlias(ref: string, folder: string): string | undefined {
  return ALIAS.test(ref) ? projectFiles(folder).find((f) => projectAlias(f) === ref) : undefined;
}

/** whole: only where the word stands alone or as a folder or file name in a path — a file called Villa must not
 * take the word out of a panel named "Villa ground floor DB". */
type Swap = [word: string, to: string, whole?: boolean];
// Shorter words (a unit, a code, initials) are left: they would be found inside ordinary words and numbers.
// A number is only taken out when it is long (a plot or telephone number), not a rating or a year.
const worth = (v: unknown): v is string => typeof v === 'string' && v.trim().length >= (/\p{L}/u.test(v) ? 4 : 6);

/** The words to take out for a folder: every project file's name becomes its id. */
function fileSwaps(folder: string): Swap[] {
  return projectFiles(folder).flatMap((f): Swap[] => {
    const stem = f.replace(PROJECT_FILE, ''), id = projectAlias(f);
    return [[f, id], [stem, id, true]];
  });
}

/** The words to take out for one project: its name, the parties and addresses of its forms, who made and changed it. */
export function projectSwaps(p: Project, file: string): Swap[] {
  const id = projectAlias(file), out: Swap[] = [];
  if (worth(p.name)) out.push([p.name.trim(), id]);
  const engineering = new Set<string>(INFO_ENGINEERING as readonly string[]);
  for (const [k, v] of Object.entries(p.info ?? {})) if (!engineering.has(k) && worth(v)) out.push([v.trim(), HIDDEN]);
  for (const v of [p.createdBy, p.updatedBy, p.origin?.copiedFromName]) if (worth(v)) out.push([v.trim(), HIDDEN]);
  return out;
}

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A text without the words (longest first, so a name inside a longer name goes with it; case does not matter). */
export function hideWords(text: string, swaps: Swap[]): string {
  let out = text;
  for (const [word, to, whole] of [...swaps].sort((a, b) => b[0].length - a[0].length)) {
    out = out.replace(new RegExp(whole ? `(?<![\\p{L}\\p{N} ])${escaped(word)}(?![\\p{L}\\p{N} ])` : escaped(word), 'giu'), to);
  }
  return out;
}

/** A tool result with every text in it cleaned (values and keys). */
function hideDeep(v: unknown, swaps: Swap[]): unknown {
  if (typeof v === 'string') return hideWords(v, swaps);
  if (Array.isArray(v)) return v.map((x) => hideDeep(x, swaps));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [hideWords(k, swaps), hideDeep(x, swaps)]));
  return v;
}

/** Makes the cleaning function for one tool call: the folder's file names, and the opened project's own words. */
export function hider(folder: string, opened?: { project: Project; file: string }): { text: (s: string) => string; result: (v: unknown) => unknown } {
  const swaps = [...(opened ? projectSwaps(opened.project, opened.file) : []), ...fileSwaps(folder)];
  return { text: (s) => hideWords(s, swaps), result: (v) => hideDeep(v, swaps) };
}
