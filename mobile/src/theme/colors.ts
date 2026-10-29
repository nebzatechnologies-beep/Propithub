// Propithub Mobile Theme Tokens (Exact Web & Figma 1-to-1 Parity)
// Supports System, Light, and Night (Dark) Modes like Paytm & Swiggy

export interface ThemePalette {
  isDark: boolean;
  background: string;
  surface: string;
  surfaceSunken: string;
  surfaceMuted: string;
  surfaceElevated: string;
  card: string;
  
  // Text Tokens
  text: string;       // Primary Text (Dark/Light adaptive)
  navy: string;       // Primary Screen Titles & Headings
  ink: string;        // Body & Primary Text
  inkSoft: string;    // Subtitles, Captions & Muted Text
  inkMuted: string;   // Extra soft hints
  
  // Border Tokens
  border: string;     // Standard Border alias
  line: string;       // Standard Card & Section Borders
  lineLight: string;  // Subtle Dividers
  lineStrong: string; // Active Borders & Focus
  
  // Brand Tokens
  primary: string;      // Brand Emerald
  primaryDark: string;  // Deep Emerald
  primaryLight: string; // Emerald Tint / Pill Background
  primaryBorder: string;

  // Status & Semantic Colors
  amber: string;
  amberBg: string;
  blue: string;
  blueBg: string;
  crimson: string;
  crimsonBg: string;
  brass: string;
  brassBg: string;

  // Role Badges
  roleOwner: string;
  roleTenant: string;
  roleManager: string;
  roleStaff: string;

  // Status Bar
  statusBarStyle: 'dark' | 'light';
  statusBarBg: string;
}

export const LightColors: ThemePalette = {
  isDark: false,
  background: '#F8F9FB',
  surface: '#FFFFFF',
  surfaceSunken: '#F8FAFC',
  surfaceMuted: '#F1F5F9',
  surfaceElevated: '#FFFFFF',
  card: '#F8FAFC',

  text: '#0F172A',
  navy: '#0F172A',
  ink: '#1E293B',
  inkSoft: '#64748B',
  inkMuted: '#94A3B8',

  border: '#E2E8F0',
  line: '#E2E8F0',
  lineLight: '#F1F5F9',
  lineStrong: '#CBD5E1',

  primary: '#10B981',
  primaryDark: '#059669',
  primaryLight: '#D1FAE5',
  primaryBorder: 'rgba(16, 185, 129, 0.3)',

  amber: '#D97706',
  amberBg: '#FEF3C7',
  blue: '#2563EB',
  blueBg: '#DBEAFE',
  crimson: '#DC2626',
  crimsonBg: '#FEE2E2',
  brass: '#C59B27',
  brassBg: '#FEF9C3',

  roleOwner: '#10B981',
  roleTenant: '#059669',
  roleManager: '#2563EB',
  roleStaff: '#D97706',

  statusBarStyle: 'dark',
  statusBarBg: '#FFFFFF',
};

export const DarkColors: ThemePalette = {
  isDark: true,
  background: '#0B0F17',
  surface: '#131B28',
  surfaceSunken: '#0E1520',
  surfaceMuted: '#151E2E',
  surfaceElevated: '#1E293B',
  card: '#1E293B',

  text: '#F1F5F9',
  navy: '#F1F5F9',
  ink: '#F1F5F9',
  inkSoft: '#94A3B8',
  inkMuted: '#64748B',

  border: '#1E293B',
  line: '#1E293B',
  lineLight: '#162234',
  lineStrong: '#334155',

  primary: '#10B981',
  primaryDark: '#059669',
  primaryLight: 'rgba(16, 185, 129, 0.18)',
  primaryBorder: 'rgba(16, 185, 129, 0.35)',

  amber: '#FBBF24',
  amberBg: 'rgba(251, 191, 36, 0.15)',
  blue: '#38BDF8',
  blueBg: 'rgba(56, 189, 248, 0.15)',
  crimson: '#F87171',
  crimsonBg: 'rgba(248, 113, 113, 0.15)',
  brass: '#10B981',
  brassBg: 'rgba(16, 185, 129, 0.15)',

  roleOwner: '#10B981',
  roleTenant: '#059669',
  roleManager: '#38BDF8',
  roleStaff: '#FBBF24',

  statusBarStyle: 'light',
  statusBarBg: '#131B28',
};

// Mutable active Colors reference for backwards compatibility
export const Colors: ThemePalette = { ...LightColors };

export const setGlobalThemeColors = (isDark: boolean): ThemePalette => {
  const next = isDark ? DarkColors : LightColors;
  Object.assign(Colors, next);
  return next;
};

export const Typography = {
  screenTitle: { fontSize: 20, fontWeight: '700' as const, color: Colors.navy },
  sectionHeader: { fontSize: 15, fontWeight: '600' as const, color: Colors.navy },
  cardTitle: { fontSize: 13, fontWeight: '600' as const, color: Colors.navy },
  body: { fontSize: 12, fontWeight: '400' as const, color: Colors.ink },
  caption: { fontSize: 10, fontWeight: '400' as const, color: Colors.inkSoft },
  badge: { fontSize: 8.5, fontWeight: '700' as const, textTransform: 'uppercase' as const },
};
