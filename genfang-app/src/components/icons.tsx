const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconHome = () => (<svg viewBox="0 0 24 24" {...base}><path d="M4 10.5 12 4l8 6.5V20h-5.5v-6h-5v6H4z" /></svg>);
export const IconInbox = () => (<svg viewBox="0 0 24 24" {...base}><path d="M4 13.5 6.5 5h11L20 13.5V19H4z" /><path d="M4 13.5h4.5a3.5 3.5 0 0 0 7 0H20" /></svg>);
export const IconQuote = () => (<svg viewBox="0 0 24 24" {...base}><path d="M6 3.5h8.5L18 7v13.5H6z" /><path d="M14 3.5V7.5h4M9 12h6M9 15.5h6" /></svg>);
export const IconMore = () => (<svg viewBox="0 0 24 24" {...base}><path d="M4 7h16M4 12h16M4 17h10" /></svg>);
export const IconChevron = () => (<svg className="chev" viewBox="0 0 24 24" {...base}><path d="m9 5 7 7-7 7" /></svg>);
export const IconBack = () => (<svg viewBox="0 0 24 24" {...base} strokeWidth={2}><path d="m15 5-7 7 7 7" /></svg>);
export const IconChart = () => (<svg viewBox="0 0 24 24" {...base}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>);
