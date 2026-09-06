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
