import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { callTool, clientLabel, offeredTools, type ToolContext } from './tools';
import { redactPaths } from './project';

/** MCP server over stdio: the engineer's own AI program (any MCP client, or a local model through one)
 * starts `lvds mcp` and calls the tools. The app has no AI of its own, no account and no key. Runs on this
 * computer only; project files never leave it except as the short results the client asks for. Read-only
 * tools always; tools that change a project only when started with --write (and even then they preview
 * unless called with mode apply / propose). */
const READ_INSTRUCTIONS = 'Read and check LV Design Studio projects (low-voltage electrical design). Start with list_projects, then project_summary or run_checks. These tools never change a project. Results are a design aid: a qualified engineer checks them.';
const WRITE_INSTRUCTIONS = `${READ_INSTRUCTIONS.replace(' These tools never change a project.', '')} Tools that change a project preview by default: show the preview to the engineer and only call again with mode apply / propose when they agree. Value changes (cable, breaker, load, settings) are proposals in Reports → Changes: the engineer accepts and applies them in the app. Use size_circuits to size, propose_changes for other values; add_panel, add_circuit, move_panel, rename_panels and copy_panel change the structure (undo_change puts a change back).`;

export function createMcp(ctx: ToolContext, version: string): McpServer {
  const server = new McpServer(
    { name: 'lv-design-studio', title: 'LV Design Studio', version },
    { instructions: ctx.write ? WRITE_INSTRUCTIONS : READ_INSTRUCTIONS }
  );
  for (const t of offeredTools(ctx)) {
    server.registerTool(t.name, {
      title: t.title,
      description: t.description,
      inputSchema: t.input,
      annotations: t.writes
        ? { title: t.title, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
        : { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async (args: Record<string, unknown>) => {
      try {
        return { content: [{ type: 'text' as const, text: JSON.stringify(await callTool(t, args, { ...ctx, client: clientLabel(server.server.getClientVersion()) ?? 'unnamed MCP client' })) }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text' as const, text: redactPaths((e as Error).message, ctx.folder) }] };
      }
    });
  }
  return server;
}

export async function startMcp(ctx: ToolContext, version: string): Promise<void> {
  await createMcp(ctx, version).connect(new StdioServerTransport());
}

/** How this copy of lvds was started: the program running it and the lvds file. Inside the installed app
 * the program is the app itself, run as Node (ELECTRON_RUN_AS_NODE: no window), so no separate Node is needed. */
export interface Runtime { execPath: string; script: string; electron: boolean }

/** What an AI program needs to start this MCP server: the "mcpServers" entry most MCP clients take.
 * `lvds mcp-config` prints it, to paste into the program's MCP settings. */
export function mcpConfig(rt: Runtime, write: boolean, groups?: string[]): { mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }> } {
  return {
    mcpServers: {
      'lv-design-studio': {
        command: rt.execPath,
        args: [rt.script, 'mcp', ...(write ? ['--write'] : []), ...(groups ? ['--tools', groups.length ? groups.join(',') : 'core'] : [])],
        ...(rt.electron ? { env: { ELECTRON_RUN_AS_NODE: '1' } } : {})
      }
    }
  };
}
