// Line icons from the approved design prototype (design/apple-minimal-prototype). Decorative only:
// every icon is aria-hidden, so the text next to it carries the meaning.
const PATHS = {
  compass: <><circle cx="12" cy="12" r="9" /><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z" /></>,
  bookmark: <path d="M6 4h12v17l-6-4-6 4V4Z" />,
  sliders: <><path d="M4 7h8m4 0h4M4 17h3m4 0h9" /><circle cx="14" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  location: <path d="m21 3-7 18-3-8-8-3 18-7Z" />,
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
  leaf: <><path d="M5 18C0 8 10 3 21 3c0 12-6 20-16 15Z" /><path d="m3 21 12-12" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12 4 4L19 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  heart: <path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
  lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2" /></>,
  phone: <path d="m6 3 4 5-3 3a15 15 0 0 0 6 6l3-3 5 4c-1 4-4 4-7 2A25 25 0 0 1 4 10C2 7 2 4 6 3Z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  edit: <path d="m4 20 1-5L16 4l4 4L9 19l-5 1Zm10-14 4 4" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></>,
  note: <path d="M5 3h14v18H5zM9 7h6m-6 4h6m-6 4h4" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className ? `icon ${className}` : "icon"} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

/** The SafeBite leaf mark used in the header and on the sign-in screen. */
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" focusable="false"><path d="M9 22c-5-8 1-15 14-15 0 13-7 19-14 15Z" /><path d="m8 25 11-13" /></svg>
    </span>
  );
}
