// Icons from the v3 designs. 24 by 24, stroke based.
const P = {
  "up": `<path d="M12 19V5M5 12l7-7 7 7"/>`,
  "home": `<path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-6h6v6"/>`,
  "chat": `<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>`,
  "clock": `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  "gear": `<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>`,
  "search": `<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`,
  "pen": `<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>`,
  "mic": `<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>`,
  "wave": `<path d="M4 10v4M8 6v12M12 9v6M16 4v16M20 10v4"/>`,
  "left": `<path d="m15 18-6-6 6-6"/>`,
  "right": `<path d="m9 18 6-6-6-6"/>`,
  "down": `<path d="m6 9 6 6 6-6"/>`,
  "panel": `<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16"/>`,
  "eye": `<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`,
  "mail": `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>`,
  "alert": `<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><circle cx="12" cy="16.5" r=".7" fill="currentColor"/>`,
  "trend": `<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>`,
  "bulb": `<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>`,
  "check": `<path d="m5 12 5 5 9-10"/>`,
  "x": `<path d="M6 6l12 12M18 6 6 18"/>`,
  "plus": `<path d="M12 5v14M5 12h14"/>`,
  "star": `<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>`,
  "link": `<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`,
  "refresh": `<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>`,
  "mute": `<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M3 3l18 18"/>`,
  "end": `<path d="M3 14.5c5-4.5 13-4.5 18 0l-2 3-3-1v-3c-2.5-.8-5.5-.8-8 0v3l-3 1z"/>`,
  "bell": `<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>`,
  "moon": `<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>`,
  "plug": `<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>`,
  "book": `<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>`,
  "server": `<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>`,
  "at": `<circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1"/>`,
  "code": `<path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>`,
  "dollar": `<path d="M12 3v18"/><path d="M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6"/>`,
  "filter": `<path d="M4 5h16l-6 7v6l-4 2v-8z"/>`,
  "more": `<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>`,
  "ext": `<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>`,
  "spark": `<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>`,
} as const;

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, stroke = 1.8, className }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={{ display: "block", flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: P[name] }} />
  );
}
