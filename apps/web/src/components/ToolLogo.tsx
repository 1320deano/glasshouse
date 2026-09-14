import type { SVGProps } from "react";
import type { AgentTool } from "@glasshouse/schema";

/**
 * The mark of the tool an agent is running in: Claude's burst for Claude Code, Codex's own mark,
 * Cursor's cube, a folder for the watcher. It stands where the plain coloured dot used to sit
 * beside the tool name on an agent card, so the tool is recognised by its logo from across the
 * room.
 *
 * These are the makers' own marks, not drawings of them, and each is shown exactly as its maker
 * publishes it: the maker's own path, the maker's own viewBox, the maker's own colour. A logo
 * that has been re-tinted is the wrong logo - Claude Code is coral, not blue; Cursor and Codex
 * are black, not purple or teal - so nothing here is recoloured to suit the palette, and the
 * Room's own colour coding lives in `TOOL_COLOURS` (labels.ts) instead.
 *
 *   Claude Code  https://claude.ai/favicon.svg          - the Claude burst, in Anthropic's own
 *                                                         #D97757 taken from that file's fill
 *   Codex        the Codex mark OpenAI ships the Codex app under: the scalloped disc around a
 *                `>_` prompt, black. This is deliberately NOT the OpenAI blossom, which is the
 *                company's mark and not this product's. Traced from the published app mark by
 *                @lobehub/icons-static-svg (MIT); replace it if OpenAI publishes its own SVG.
 *   Cursor       https://cursor.com - the cube from the logo in the site's own header, drawn in
 *                `currentColor` there and black on light, with the viewBox tightened to the mark
 *
 * They must not be redrawn by hand. To refresh one, take the maker's published SVG, use its `d`
 * path, its `fill-rule` and a viewBox that frames that path, and put its published colour in
 * `fill` below.
 *
 * Decoration only: the tool's name is always written beside the mark, so the mark is hidden from
 * screen readers (rule: an icon never carries a fact on its own).
 */
type Mark = { viewBox: string; path: string; fill: string; fillRule?: "evenodd" };

const MARKS: Record<AgentTool, Mark> = {
  "claude-code": {
    viewBox: "0 0 248 248",
    fill: "#D97757",
    path: "M52.4285 162.873L98.7844 136.879L99.5485 134.602L98.7844 133.334H96.4921L88.7237 132.862L62.2346 132.153L39.3113 131.207L17.0249 130.026L11.4214 128.844L6.2 121.873L6.7094 118.447L11.4214 115.257L18.171 115.847L33.0711 116.911L55.485 118.447L71.6586 119.392L95.728 121.873H99.5485L100.058 120.337L98.7844 119.392L97.7656 118.447L74.5877 102.732L49.4995 86.1905L36.3823 76.62L29.3779 71.7757L25.8121 67.2858L24.2839 57.3608L30.6515 50.2716L39.3113 50.8623L41.4763 51.4531L50.2636 58.1879L68.9842 72.7209L93.4357 90.6804L97.0015 93.6343L98.4374 92.6652L98.6571 91.9801L97.0015 89.2625L83.757 65.2772L69.621 40.8192L63.2534 30.6579L61.5978 24.632C60.9565 22.1032 60.579 20.0111 60.579 17.4246L67.8381 7.49965L71.9133 6.19995L81.7193 7.49965L85.7946 11.0443L91.9074 24.9865L101.714 46.8451L116.996 76.62L121.453 85.4816L123.873 93.6343L124.764 96.1155H126.292V94.6976L127.566 77.9197L129.858 57.3608L132.15 30.8942L132.915 23.4505L136.608 14.4708L143.994 9.62643L149.725 12.344L154.437 19.0788L153.8 23.4505L150.998 41.6463L145.522 70.1215L141.957 89.2625H143.994L146.414 86.7813L156.093 74.0206L172.266 53.698L179.398 45.6635L187.803 36.802L193.152 32.5484H203.34L210.726 43.6549L207.415 55.1159L196.972 68.3492L188.312 79.5739L175.896 96.2095L168.191 109.585L168.882 110.689L170.738 110.53L198.755 104.504L213.91 101.787L231.994 98.7149L240.144 102.496L241.036 106.395L237.852 114.311L218.495 119.037L195.826 123.645L162.07 131.592L161.696 131.893L162.137 132.547L177.36 133.925L183.855 134.279H199.774L229.447 136.524L237.215 141.605L241.8 147.867L241.036 152.711L229.065 158.737L213.019 154.956L175.45 145.977L162.587 142.787H160.805V143.85L171.502 154.366L191.242 172.089L215.82 195.011L217.094 200.682L213.91 205.172L210.599 204.699L188.949 188.394L180.544 181.069L161.696 165.118H160.422V166.772L164.752 173.152L187.803 207.771L188.949 218.405L187.294 221.832L181.308 223.959L174.813 222.777L161.187 203.754L147.305 182.486L136.098 163.345L134.745 164.2L128.075 235.42L125.019 239.082L117.887 241.8L111.902 237.31L108.718 229.984L111.902 215.452L115.722 196.547L118.779 181.541L121.58 162.873L123.291 156.636L123.14 156.219L121.773 156.449L107.699 175.752L86.304 204.699L69.3663 222.777L65.291 224.431L58.2867 220.768L58.9235 214.27L62.8713 208.48L86.304 178.705L100.44 160.155L109.551 149.507L109.462 147.967L108.959 147.924L46.6977 188.512L35.6182 189.93L30.7788 185.44L31.4156 178.115L33.7079 175.752L52.4285 162.873Z",
  },
  // The `>_` inside the disc is a hole, not a shape: it only reads as a prompt because the even-odd
  // rule cuts it out of the fill. Drop `fillRule` and the mark becomes a solid blob.
  codex: {
    viewBox: "0 0 24 24",
    fill: "#000000",
    fillRule: "evenodd",
    path: "M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z",
  },
  cursor: {
    viewBox: "23 15 452.407 515.755",
    fill: "#000000",
    path: "m466.383 137.073-206.469-119.2034c-6.63-3.8287-14.811-3.8287-21.441 0l-206.4586 119.2034c-5.5734 3.218-9.0144 9.169-9.0144 15.615v240.375c0 6.436 3.441 12.397 9.0144 15.615l206.4686 119.203c6.63 3.829 14.811 3.829 21.441 0l206.468-119.203c5.574-3.218 9.015-9.17 9.015-15.615v-240.375c0-6.436-3.441-12.397-9.015-15.615zm-12.969 25.25-199.316 345.223c-1.347 2.326-4.904 1.376-4.904-1.319v-226.048c0-4.517-2.414-8.695-6.33-10.963l-195.7577-113.019c-2.3263-1.347-1.3764-4.905 1.3182-4.905h398.6305c5.661 0 9.199 6.136 6.368 11.041h-.009z",
  },
  // The folder watcher is not a product and has no mark of its own, so it carries the folder it
  // is following - drawn here on purpose, because there is no real logo to use, and in the Room's
  // own slate rather than a brand colour it does not have.
  watcher: {
    viewBox: "0 0 16 16",
    fill: "#64748b",
    path: "M2.9 3.5h3.2l1.5 1.8h4.5a.9.9 0 0 1 .9.9v6a.9.9 0 0 1-.9.9H2.9a.9.9 0 0 1-.9-.9V4.4a.9.9 0 0 1 .9-.9Zm5.1 7.4a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z",
  },
};

/**
 * `preserveAspectRatio` is left at its default on purpose: the marks are not all square (Cursor's
 * cube is taller than it is wide), so the mark is scaled to fit the box and centred rather than
 * stretched to fill it.
 */
export function ToolLogo({ tool, size = 15, ...rest }: SVGProps<SVGSVGElement> & { tool: AgentTool; size?: number }) {
  const mark = MARKS[tool];
  return (
    <svg
      className="tool-logo"
      data-tool={tool}
      width={size}
      height={size}
      viewBox={mark.viewBox}
      fill={mark.fill}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={mark.path} fillRule={mark.fillRule} clipRule={mark.fillRule} />
    </svg>
  );
}
