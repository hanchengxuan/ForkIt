// Small inline icon set (stroke icons, currentColor) so the UI needs no emoji or icon library.
type P = { className?: string };

const stroke = (d: React.ReactNode, width = 2) =>
  function Icon({ className = "size-5" }: P) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
        {d}
      </svg>
    );
  };

const fill = (d: string) =>
  function Icon({ className = "size-5" }: P) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
        <path d={d} />
      </svg>
    );
  };

export const Heart = fill("M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z");
export const Star = fill("M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z");
export const Crown = fill("M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z");
export const Send = fill("M21 3L3 10.5l7.5 3 3 7.5z");
export const X = stroke(<path d="M6 6l12 12M18 6L6 18" />, 2.6);
export const Ban = stroke(<><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>, 2.2);
export const Pin = stroke(<><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>);
export const User = stroke(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
export const Users = stroke(<><circle cx="9" cy="8" r="3.5" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M15 14.5a5 5 0 0 1 6.5 5.5" /></>);
export const Arrow = stroke(<path d="M5 12h14M13 6l6 6-6 6" />, 2.4);
export const Share = stroke(<><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M16 6l-4-4-4 4" /><path d="M12 2v13" /></>);
export const Copy = stroke(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>);
export const Check = stroke(<path d="M5 12l5 5L20 7" />, 2.6);
export const Plus = stroke(<path d="M12 5v14M5 12h14" />);
export const Pencil = stroke(<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />);
export const Search = stroke(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>);
export const Clock = stroke(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const Calendar = stroke(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>);
export const Glass = stroke(<path d="M7 21h10M12 15v6M5 3h14l-7 12z" />);
export const Leaf = stroke(<><path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15" /><path d="M5 19l7-7" /></>);
export const Sun = stroke(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>);
export const Phone = stroke(<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />);
export const Globe = stroke(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>);
export const ChevronUp = stroke(<path d="M6 15l6-6 6 6" />, 2.4);
export const ChevronDown = stroke(<path d="M6 9l6 6 6-6" />, 2.6);
export const Refresh = stroke(<><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /></>, 2.2);
export const Hand = stroke(<><path d="M9 11V5a2 2 0 0 1 4 0v5" /><path d="M13 10V8a2 2 0 0 1 4 0v4" /><path d="M17 11a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8h-1a7 7 0 0 1-6-3.4L3.3 14a2 2 0 0 1 3.4-2L9 15" /></>, 2.2);
export const Fork = stroke(<path d="M7 3v8a2 2 0 0 0 4 0V3M9 13v8M17 21V3c-2 1-3 4-3 7v3h3" />);
