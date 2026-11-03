/**
 * Interface icons. Drawn as simple strokes so they stay legible at 16–24 px and
 * in monochrome; the logo mark is deliberately not a copy of any existing mark.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps): IconProps => ({
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  ...props,
});

export const IconDashboard = (props: IconProps): JSX.Element => (
  <svg {...base(props)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="4.5" rx="1.5" />
    <rect x="3" y="14" width="7" height="6.5" rx="1.5" />
    <rect x="14" y="11.5" width="7" height="9" rx="1.5" />
  </svg>
);

export const IconAtoms = (props: IconProps): JSX.Element => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="2.2" />
    <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(30 12 12)" />
    <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)" />
  </svg>
);

export const IconPlay = (props: IconProps): JSX.Element => (
  <svg {...base(props)}>
    <path d="M7 4.5v15l12-7.5-12-7.5z" />
  </svg>
);

export const IconJobs = (props: IconProps): JSX.Element => (
  <svg {...base(props)}>
    <path d="M4 7h16M4 12h16M4 17h10" />
    <circle cx="18" cy="17" r="2.2" />
  </svg>
);

export const IconShield = (props: IconProps): JSX.Element => (
  <svg {...base(props)}>
    <path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3z" />
    <path d="M9.2 12.2l2 2 3.6-4" />
  </svg>
);

export const IconSettings = (props: IconProps): JSX.Element => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.6M12 18.6v2.6M4.9 4.9l1.9 1.9M17.2 17.2l1.9 1.9M2.8 12h2.6M18.6 12h2.6M4.9 19.1l1.9-1.9M17.2 6.8l1.9-1.9" />
  </svg>
);

export const IconSun = (props: IconProps): JSX.Element => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const IconMoon = (props: IconProps): JSX.Element => (
  <svg {...base(props)}>
    <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />
  </svg>
);

export const IconDownload = (props: IconProps): JSX.Element => (
  <svg {...base(props)}>
    <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />
  </svg>
);

export const IconUpload = (props: IconProps): JSX.Element => (
  <svg {...base(props)}>
    <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
  </svg>
);

export const IconTrash = (props: IconProps): JSX.Element => (
  <svg {...base(props)}>
    <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
  </svg>
);

export const IconStop = (props: IconProps): JSX.Element => (
  <svg {...base(props)}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

export const IconPlus = (props: IconProps): JSX.Element => (
  <svg {...base(props)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
