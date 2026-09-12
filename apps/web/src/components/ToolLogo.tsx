import type { SVGProps } from "react";
import type { AgentTool } from "@glasshouse/schema";
import { TOOL_COLOURS } from "./labels";

/**
 * The mark of the tool an agent is running in: Claude's burst, Codex's knot, Cursor's cube, a
 * folder for the watcher. It stands where the plain coloured dot used to sit beside the tool name
 * on an agent card, so the tool is recognised by its logo from across the room.
 *
 * Each mark is drawn in that tool's own hue (`TOOL_COLOURS`), so the colour coding the rest of the
 * Room already uses — the tool mix bar and its legend on the right — keeps saying the same thing.
 * Decoration only: the tool's name is always written beside it, so the mark is hidden from screen
 * readers (rule: an icon never carries a fact on its own).
 */
export function ToolLogo({ tool, size = 15, ...rest }: SVGProps<SVGSVGElement> & { tool: AgentTool; size?: number }) {
  const colour = TOOL_COLOURS[tool];
  return (
    <svg className="tool-logo" data-tool={tool} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" {...rest}>
      {tool === "claude-code" && <ClaudeBurst colour={colour} />}
      {tool === "codex" && <CodexKnot colour={colour} />}
      {tool === "cursor" && <CursorCube colour={colour} />}
      {tool === "watcher" && <WatcherFolder colour={colour} />}
    </svg>
  );
}

/**
 * Claude: the burst. Thirteen spokes of uneven length from one centre, round-capped so they meet
 * in a solid middle.
 */
const CLAUDE_SPOKES = [6.3, 4.9, 6.0, 5.2, 6.3, 4.9, 5.6, 6.3, 5.0, 6.1, 5.2, 6.3, 4.9];

function ClaudeBurst({ colour }: { colour: string }) {
  const step = 360 / CLAUDE_SPOKES.length;
  return (
    <g stroke={colour} strokeWidth={1.45} strokeLinecap="round">
      {CLAUDE_SPOKES.map((len, i) => (
        <line key={i} x1="8" y1="8" x2="8" y2={8 - len} transform={`rotate(${(i * step).toFixed(2)} 8 8)`} />
      ))}
    </g>
  );
}

/** Codex: the six-lobed knot, three long rounded loops laid over each other a sixth of a turn apart. */
function CodexKnot({ colour }: { colour: string }) {
  return (
    <g stroke={colour} strokeWidth={1.1}>
      {[0, 60, 120].map((angle) => (
        <rect key={angle} x="4.8" y="1" width="6.4" height="14" rx="3.2" transform={`rotate(${angle} 8 8)`} />
      ))}
    </g>
  );
}

/** Cursor: the cube seen corner-on and drawn out to a point, its three faces in three depths of the one hue. */
function CursorCube({ colour }: { colour: string }) {
  return (
    <g fill={colour}>
      <path d="M8 1.1 13.6 4.3 8 7.6 2.4 4.3Z" opacity={0.4} />
      <path d="M2.4 4.3 8 7.6V15.1L2.4 9.4Z" opacity={0.68} />
      <path d="M13.6 4.3v5.1L8 15.1V7.6Z" />
    </g>
  );
}

/** The folder watcher: no agent of its own, so it carries the folder it is following. */
function WatcherFolder({ colour }: { colour: string }) {
  return (
    <g stroke={colour} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12.2V4.4a.9.9 0 0 1 .9-.9h3.2l1.5 1.8h4.5a.9.9 0 0 1 .9.9v6a.9.9 0 0 1-.9.9H2.9a.9.9 0 0 1-.9-.9Z" />
      <circle cx="8" cy="9.3" r="1.6" />
    </g>
  );
}
