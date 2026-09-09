/**
 * The whole icon set. Line icons, drawn on a 16px grid at 1.5px, inheriting `currentColor` so
 * they take the colour of the text beside them. No icon font, no emoji, no decoration: an icon
 * appears only where it says something a word would have to repeat.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 14, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6.5 8 10.5 12 6.5" />
  </Icon>
);

export const ChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </Icon>
);

export const ArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12.5 8H3.5M7 4l-3.5 4L7 12" />
  </Icon>
);

export const ArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 8h9M9 4l3.5 4L9 12" />
  </Icon>
);

export const ArrowUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 12.5v-9M4 7l4-3.5L12 7" />
  </Icon>
);

export const Check = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 8.5 6.25 11.5 13 4.5" />
  </Icon>
);

export const Info = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 7.25v3.5M8 5.1v.1" />
  </Icon>
);

export const Alert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2.4 14.6 13.6H1.4L8 2.4Z" />
    <path d="M8 6.6v2.9M8 11.4v.1" />
  </Icon>
);

export const Handoff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 5.5h8.5M8 2.75 10.75 5.5 8 8.25" />
    <path d="M14 10.5H5.5M8 13.25 5.25 10.5 8 7.75" />
  </Icon>
);

export const ThumbsDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.75 2.5h4.9a1.6 1.6 0 0 1 1.55 1.2l.8 3.2a1.3 1.3 0 0 1-1.26 1.6H8.9l.42 2.6a1.3 1.3 0 0 1-2.42.86L4.75 8.5" />
    <path d="M4.75 2.5H2.9v6h1.85" />
  </Icon>
);

export const Inbox = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 9.5 3.6 3.4A1.2 1.2 0 0 1 4.76 2.5h6.48a1.2 1.2 0 0 1 1.16.9L14 9.5" />
    <path d="M2 9.5h3.2l.8 1.6h4l.8-1.6H14v3.2a.8.8 0 0 1-.8.8H2.8a.8.8 0 0 1-.8-.8Z" />
  </Icon>
);

export const Layers = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 1.9 14.2 5 8 8.1 1.8 5 8 1.9Z" />
    <path d="M1.8 8 8 11.1 14.2 8M1.8 11 8 14.1 14.2 11" />
  </Icon>
);

export const Screen = (p: IconProps) => (
  <Icon {...p}>
    <rect x="1.8" y="2.6" width="12.4" height="8.4" rx="1.2" />
    <path d="M5.6 13.4h4.8" />
  </Icon>
);

export const Search = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7.2" cy="7.2" r="4.4" />
    <path d="m10.6 10.6 2.7 2.7" />
  </Icon>
);

export const Copy = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5.6" y="5.6" width="8" height="8" rx="1.4" />
    <path d="M10.4 5.6V4a1.4 1.4 0 0 0-1.4-1.4H4a1.4 1.4 0 0 0-1.4 1.4v5a1.4 1.4 0 0 0 1.4 1.4h1.6" />
  </Icon>
);

/** The sidebar toggle: a window with its left pane. Pressed means "the pane is open". */
export const PanelLeft = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="3" width="12" height="10" rx="2" />
    <path d="M6 3v10" />
  </Icon>
);

export const PanelRight = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="3" width="12" height="10" rx="2" />
    <path d="M10 3v10" />
  </Icon>
);

/** Two densities: comfortable rows, or tight rows. */
export const Rows = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="2.5" width="12" height="4.5" rx="1.5" />
    <rect x="2" y="9" width="12" height="4.5" rx="1.5" />
  </Icon>
);

export const Sparkle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2.5c.4 2.8 2.2 4.6 5 5-2.8.4-4.6 2.2-5 5-.4-2.8-2.2-4.6-5-5 2.8-.4 4.6-2.2 5-5Z" />
  </Icon>
);

/** The product mark: a pane of glass with the one thing worth looking at inside it. */
export const Mark = ({ size = 18, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false" {...rest}>
    <rect x="1.5" y="1.5" width="17" height="17" rx="5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="10" cy="10" r="3" fill="var(--accent)" />
  </svg>
);

/** The front door: Deano's two products, side by side. */
export const Grid = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="2" width="5" height="5" rx="1.5" />
    <rect x="9" y="2" width="5" height="5" rx="1.5" />
    <rect x="2" y="9" width="5" height="5" rx="1.5" />
    <rect x="9" y="9" width="5" height="5" rx="1.5" />
  </Icon>
);

/** The Potting Shed: a seedling, for the helpers it raises. */
export const Sprout = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 14V8" />
    <path d="M8 8c0-3 2-5 5.5-5C13.5 6.5 11.5 8 8 8Z" />
    <path d="M8 10.5C8 8 6.5 6.5 3 6.5c0 3 1.5 4.5 5 4Z" />
    <path d="M4.5 14h7" />
  </Icon>
);

/** Boundaries: the fence a helper keeps inside. */
export const Fence = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3.5v10M8 3.5v10M13 3.5v10" />
    <path d="M1.5 6.5h13M1.5 10.5h13" />
  </Icon>
);

/** A hand raised: stop and ask the owner. */
export const Hand = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 8.5V4a1 1 0 0 1 2 0v3.5M7 7V3a1 1 0 0 1 2 0v4M9 7V3.5a1 1 0 0 1 2 0V8M11 8V5.5a1 1 0 0 1 2 0v4.5c0 2.5-2 4.5-4.5 4.5S4 12.5 4 10.5V9a1 1 0 0 1 2 0" />
  </Icon>
);

/** Rules the helper already knows. */
export const Book = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3.5h4.5a1 1 0 0 1 1 1V13a1 1 0 0 0-1-1H3V3.5Z" />
    <path d="M13 3.5H8.5a1 1 0 0 0-1 1V13a1 1 0 0 1 1-1H13V3.5Z" />
  </Icon>
);

/** Rubbish: remove a helper. */
export const Trash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" />
  </Icon>
);

export const Plus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);

export const Download = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
  </Icon>
);
