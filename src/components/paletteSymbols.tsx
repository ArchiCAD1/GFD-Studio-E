import type { ReactNode } from 'react';

/** Line symbols for the equipment palette, drawn like the SLD symbol each
 * item becomes. Keyed by itemKey; items without one use their icon. */
// Boards: the library's 2:1 board symbols on a 20 × 10 rectangle; fills are solid, the pattern tells the kind.
const BOARD_EDGE = <rect x="2" y="7" width="20" height="10" />;
const FILL = { fill: 'currentColor', stroke: 'none' } as const;
const MAIN_FRAME = <rect x="4" y="9" width="16" height="6" />;
const CROSS = <path d="M2 7L22 17M2 17L22 7" />;
const BOARD_CODE = (code: string) => <>{BOARD_EDGE}<text x="12" y="14.4" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="currentColor" stroke="none" fontFamily="Arial, Helvetica, sans-serif">{code}</text></>;
const SMDB_ICON = <>{BOARD_EDGE}<path d="M2 7L22 7L2 17Z" {...FILL} /><path d="M2 17L22 7" /></>;
const MAIN_ICON = <>{BOARD_EDGE}<path d="M4 9L20 9L4 15Z" {...FILL} /><path d="M4 15L20 9" />{MAIN_FRAME}</>;
const EMAIN_ICON = <>{BOARD_EDGE}<path d="M4 9L12 12L4 15Z" {...FILL} /><path d="M20 9L12 12L20 15Z" {...FILL} /><path d="M4 9L20 15M4 15L20 9" />{MAIN_FRAME}</>;
const BREAKER = <><path d="M12 3v5M12 16v5M12 8l5 5" /><circle cx="12" cy="8" r="1.2" /></>;
const MOTOR = <><circle cx="12" cy="12" r="8" /><path d="M8.5 15V9l3.5 4 3.5-4v6" /></>;
const CABLE = 'M4 16c4-8 6 8 10 0 1.5-3 3-3 6 0';

const SYMBOLS: Record<string, ReactNode> = {
  transformer: <><circle cx="12" cy="8.5" r="5" /><circle cx="12" cy="15.5" r="5" /></>,
  tie: <><path d="M3 12h6M15 12h6M9 12l5-4" /><circle cx="9" cy="12" r="1.2" /><circle cx="15" cy="12" r="1.2" /></>,
  generator: <><circle cx="12" cy="12" r="8" /><path d="M14.5 9.5A3.5 3.5 0 1 0 15 13h-3" /></>,
  'generator:ACB': <><circle cx="9" cy="12" r="5" /><path d="M17 7v10M17 12l3-3" /><circle cx="17" cy="7" r="1" /></>,
  'board:MC': BOARD_CODE('MC'),
  'board:MDB': MAIN_ICON,
  'board:LV-MDB': MAIN_ICON,
  'board:LV-ACB': MAIN_ICON,
  'board:EMDB': EMAIN_ICON,
  'board:LV-EMDB': EMAIN_ICON,
  'board:SMDB': SMDB_ICON,
  'board:DB': <>{BOARD_EDGE}<path d="M2 17L22 7" /></>,
  'board:EDB': <>{BOARD_EDGE}{CROSS}</>,
  'board:MCC': <>{BOARD_EDGE}<path d="M2 7H22V12H2Z" {...FILL} /><path d="M2 12H22" /></>,
  'board:EMCC': <>{BOARD_EDGE}<path d="M2 7L22 7L12 12Z" {...FILL} /><path d="M2 17L22 17L12 12Z" {...FILL} />{CROSS}</>,
  'board:FP': <>{BOARD_EDGE}<path d="M2 12H22" /></>,
  'board:UPS': BOARD_CODE('UPS'),
  'device:ACB': <>{BREAKER}<path d="M9 16h6" /></>,
  'device:MCCB': BREAKER,
  'device:MCB': <><path d="M12 3v5M12 16v5M12 8l4 4" /><circle cx="12" cy="8" r="1" /></>,
  'device:ISOL': <path d="M12 3v5M12 16v5M12 8l5 5M9 8h6" />,
  'acc:meter': <><circle cx="12" cy="12" r="7" /><path d="M12 3v2M12 19v2M9 14l1.5-4 1.5 2 1.5-2 1.5 4" /></>,
  'acc:ct-meter': <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2" /></>,
  'acc:rcd': <><path d="M12 3v5M12 16v5M12 8l5 5" /><rect x="5" y="9" width="7" height="6" rx="1" /></>,
  'acc:isolator': <path d="M12 3v6M12 15v6M9 9h6M9 15h6M12 9l4 5" />,
  'acc:spd': <path d="M12 3v4M12 17v4M9 7h6l-2 5h4l-6 5" />,
  'acc:pmu': <><rect x="4" y="5" width="16" height="12" rx="1.5" /><path d="M7 13l3-4 2 3 2-5 3 6" /></>,
  'acc:cable-fr': <path d={CABLE} strokeDasharray="3 2" />,
  'acc:cable-lszh': <><path d={CABLE} /><path d="M4 20h16" /></>,
  cable: <path d={CABLE} />,
  'starter:DOL': <><path d="M12 3v5M12 16v5M12 8l4 6" /><path d="M8 8h8" /></>,
  'starter:SD': <><path d="M12 4l7 12H5z" /><path d="M12 13v4M8.5 19h7" /></>,
  'starter:SS': <><circle cx="12" cy="12" r="8" /><path d="M8 14c2 2 6 2 8 0-2-2-6-2-8-4 2-2 6-2 8 0" /></>,
  'starter:VFD': <><rect x="4" y="5" width="16" height="14" rx="1.5" /><path d="M6 15c3-6 6 6 9 0 1-2 2-2 3 0" /></>,
  'load:motor': MOTOR,
  'load:ahu': <><circle cx="12" cy="12" r="8" /><path d="M12 4v16M4 12h16" /></>,
  'load:chiller': <path d="M12 3v18M5 7.5l14 9M5 16.5l14-9" />,
  'load:fire-pump': <><circle cx="12" cy="13" r="7" /><path d="M12 6V3M9 13l3-3 3 3-3 3z" /></>,
  'load:ev': <><rect x="5" y="4" width="12" height="16" rx="2" /><path d="M11 8l-2 4h3l-2 4M17 9h2v5" /></>,
  'load:pv': <><rect x="4" y="6" width="16" height="10" rx="1" /><path d="M4 11h16M9 6v10M15 6v10" /></>,
  'load:lighting': <><circle cx="12" cy="12" r="6" /><path d="M8 8l8 8M16 8l-8 8" /></>,
  'load:it': <><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M8 20h8M12 16v4" /></>,
  'load:general': <path d="M12 3v5M7 8h10l-5 13z" />,
  capacitor: <path d="M12 3v7M12 14v7M6 10h12M6 14h12" />
};

export const hasSymbol = (key: string) => key in SYMBOLS;

export function PaletteSymbol({ k, size = 20 }: { k: string; size?: number }) {
  return (
    <svg className="palette-ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {SYMBOLS[k]}
    </svg>
  );
}
