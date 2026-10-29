import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { Appearance, ColorSchemeName, Platform } from 'react-native';
import {
  ThemePalette,
  LightColors,
  DarkColors,
  setGlobalThemeColors,
} from '../theme/colors';

export type ThemeMode = 'system' | 'light' | 'dark';

interface MobileThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  isDark: boolean;
  colors: ThemePalette;
  toggleTheme: () => void;
}

const MobileThemeContext = createContext<MobileThemeContextType | null>(null);

const STORAGE_THEME_MODE_KEY = 'propithub_mobile_theme_mode';
const STORAGE_WEB_THEME_KEY = 'propithub-theme';

const getInitialThemeMode = (): ThemeMode => {
  try {
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      const saved = (globalThis as any).localStorage.getItem(STORAGE_THEME_MODE_KEY);
      if (saved === 'system' || saved === 'light' || saved === 'dark') {
        return saved as ThemeMode;
      }
      const webSaved = (globalThis as any).localStorage.getItem(STORAGE_WEB_THEME_KEY);
      if (webSaved === 'dark' || webSaved === 'light') {
        return webSaved as ThemeMode;
      }
    }
  } catch {}
  return 'system';
};

// ── Robust RGB Parser ────────────────────────────────────────────────────────
interface RGBColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const parseCSSColor = (colorStr: string): RGBColor | null => {
  if (!colorStr || colorStr === 'transparent' || colorStr === 'inherit') return null;

  // Handle rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = colorStr.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s\/]+([\d.]+))?\)/i);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  // Handle Hex (#FFF, #FFFFFF)
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
  }

  return null;
};

// ── Real-Time CSSOM Atomic Rule Scanner & Exact Dark Palette Transformation ───
let isScanning = false;
let currentIsDarkState = false;
let headMutationObserver: MutationObserver | null = null;

const scanAndApplyRNWDarkOverrides = (isDark: boolean) => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  try {
    currentIsDarkState = isDark;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';

    if (document.body) {
      document.body.style.backgroundColor = isDark ? '#0B0F17' : '#F8F9FB';
      document.body.style.color = isDark ? '#F1F5F9' : '#0F172A';
      document.body.style.colorScheme = isDark ? 'dark' : 'light';
    }

    let styleTag = document.getElementById('propithub-mobile-dark-mode-override') as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'propithub-mobile-dark-mode-override';
      document.head.appendChild(styleTag);
    }

    if (!isDark) {
      // In Light Mode, completely clear dark overrides!
      // Enforce clean light mode baseline for root and form inputs.
      styleTag.textContent = `
        html[data-theme="light"],
        [data-theme="light"] body,
        [data-theme="light"] #root,
        [data-theme="light"] [data-testid="root"] {
          background-color: #F8F9FB !important;
          color: #0F172A !important;
        }

        /* Form inputs in light mode */
        [data-theme="light"] input,
        [data-theme="light"] textarea,
        [data-theme="light"] select {
          background-color: #F8FAFC !important;
          color: #0F172A !important;
          border-color: #E2E8F0 !important;
        }
        [data-theme="light"] input::placeholder,
        [data-theme="light"] textarea::placeholder {
          color: #94A3B8 !important;
        }
      `;
      return;
    }

    const overrides: string[] = [];
    const seen = new Set<string>();

    // 1. Base Framework Setup
    overrides.push(`
      html[data-theme="dark"],
      [data-theme="dark"] body,
      [data-theme="dark"] #root,
      [data-theme="dark"] [data-testid="root"] {
        background-color: #0B0F17 !important;
        color: #F1F5F9 !important;
      }

      /* Form inputs in dark mode */
      [data-theme="dark"] input,
      [data-theme="dark"] textarea,
      [data-theme="dark"] select {
        background-color: #0E1520 !important;
        color: #F1F5F9 !important;
        border-color: #1E293B !important;
      }
      [data-theme="dark"] input::placeholder,
      [data-theme="dark"] textarea::placeholder {
        color: #64748B !important;
      }

      /* Exemptions: Documents & Invoices stay clean printable white */
      [data-theme="dark"] [data-keep-light="true"],
      [data-theme="dark"] [data-keep-light="true"] *,
      [data-theme="dark"] .keep-white,
      [data-theme="dark"] .keep-white *,
      [data-theme="dark"] .invoice-paper,
      [data-theme="dark"] .invoice-paper * {
        background-color: #FFFFFF !important;
        color: #0F172A !important;
      }

      /* Dynamic SVG icon color adaptations */
      [data-theme="dark"] svg[stroke="#0284C7"],
      [data-theme="dark"] svg[stroke="#0369A1"] {
        stroke: #38BDF8 !important;
      }
      [data-theme="dark"] svg[fill="#0284C7"],
      [data-theme="dark"] svg[fill="#0369A1"] {
        fill: #38BDF8 !important;
      }
      [data-theme="dark"] svg[stroke="#059669"] {
        stroke: #34D399 !important;
      }
      [data-theme="dark"] svg[stroke="#2563EB"] {
        stroke: #60A5FA !important;
      }
      [data-theme="dark"] svg[stroke="#DC2626"] {
        stroke: #F87171 !important;
      }

      /* Subscreen header logo badges in dark mode */
      [data-theme="dark"] [class*="logoBadge"],
      [data-theme="dark"] .logoBadge {
        background-color: rgba(16, 185, 129, 0.15) !important;
        border-color: rgba(16, 185, 129, 0.3) !important;
      }
    `);

    // 2. Scan every CSS rule in document.styleSheets
    for (let s = 0; s < document.styleSheets.length; s++) {
      const sheet = document.styleSheets[s];
      try {
        if ((sheet.ownerNode as HTMLElement)?.id === 'propithub-mobile-dark-mode-override') continue;

        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;

        for (let r = 0; r < rules.length; r++) {
          const rule = rules[r] as CSSStyleRule;
          if (!rule.selectorText) continue;

          const sel = rule.selectorText;
          const style = rule.style;
          if (!style) continue;

          // ── A. BACKGROUND COLORS ──────────────────────────────────────────
          const bgVal = style.backgroundColor;
          if (bgVal) {
            const rgb = parseCSSColor(bgVal);
            if (rgb && rgb.a > 0.05) {
              const { r, g, b } = rgb;

              // Pure White Card -> #131B28
              if (r >= 250 && g >= 250 && b >= 250) {
                if (!seen.has('bg:' + sel)) {
                  seen.add('bg:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { background-color: #131B28 !important; }`);
                }
              }
              // Screen Background (Slate 50 / #F8FAFC) -> #0B0F17
              else if (r >= 244 && r <= 249 && g >= 248 && g <= 252 && b >= 250) {
                if (!seen.has('bg:' + sel)) {
                  seen.add('bg:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { background-color: #0B0F17 !important; }`);
                }
              }
              // Inactive Capsule Tabs / Chips / Sunken Boxes (#E2E8F0, #F1F5F9, #F3F4F6) -> #1E293B
              else if (
                (r >= 220 && r <= 243 && g >= 228 && g <= 246 && b >= 238 && b <= 250) ||
                (r >= 240 && r <= 244 && g >= 243 && g <= 246 && b >= 244 && b <= 248)
              ) {
                if (!seen.has('bg:' + sel)) {
                  seen.add('bg:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { background-color: #1E293B !important; }`);
                }
              }
              // Mint / Emerald Tint Banners & Shortcuts (#ECFDF5, #D1FAE5, #DEF7EC, #F0FDF4) -> Dark Emerald Tint
              else if (g >= 240 && r >= 200 && r <= 242 && b >= 220 && b <= 250 && g > r) {
                if (!seen.has('bg:' + sel)) {
                  seen.add('bg:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { background-color: rgba(16, 185, 129, 0.15) !important; }`);
                }
              }
              // Red Alert Banners (#FEF2F2, #FEE2E2) -> Dark Ruby Tint
              else if (r >= 250 && g <= 245 && b <= 245 && r > g && r > b) {
                if (!seen.has('bg:' + sel)) {
                  seen.add('bg:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { background-color: rgba(239, 68, 68, 0.15) !important; }`);
                }
              }
              // Amber Alert Banners (#FEF3C7, #FEF9C3) -> Dark Amber Tint
              else if (r >= 250 && g >= 240 && b <= 200) {
                if (!seen.has('bg:' + sel)) {
                  seen.add('bg:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { background-color: rgba(245, 158, 11, 0.15) !important; }`);
                }
              }
              // Sky / Blue Tint Banners (#EFF6FF, #DBEAFE, #F0F9FF, #E0F2FE, #BAE6FD) -> Dark Sapphire/Sky Tint
              else if ((b >= 240 && r <= 245 && g <= 252 && b > r) || (b >= 220 && g >= 200 && r <= 210 && b > r)) {
                if (!seen.has('bg:' + sel)) {
                  seen.add('bg:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { background-color: rgba(2, 132, 199, 0.15) !important; }`);
                }
              }
            }
          }

          // ── B. TEXT COLORS ────────────────────────────────────────────────
          const colorVal = style.color;
          if (colorVal) {
            const rgb = parseCSSColor(colorVal);
            if (rgb && rgb.a > 0.05) {
              const { r, g, b } = rgb;

              // Primary Dark Text (Slate 900 / 800: #0F172A, #1E293B, #111827, #334155, #000000) -> #F1F5F9 (Crisp Slate White)
              if (r <= 60 && g <= 70 && b <= 90) {
                if (!seen.has('text:' + sel)) {
                  seen.add('text:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { color: #F1F5F9 !important; }`);
                }
              }
              // Muted / Secondary Text (Slate 500 / 600: #64748B, #475569, #6B7280) -> #94A3B8 (Soft Slate)
              else if (r >= 65 && r <= 115 && g >= 80 && g <= 130 && b >= 100 && b <= 150) {
                if (!seen.has('text:' + sel)) {
                  seen.add('text:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { color: #94A3B8 !important; }`);
                }
              }
              // Soft Hint / Inactive Tab Labels (#94A3B8) -> #64748B
              else if (r >= 140 && r <= 155 && g >= 155 && g <= 170 && b >= 175 && b <= 190) {
                if (!seen.has('text:' + sel)) {
                  seen.add('text:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { color: #94A3B8 !important; }`);
                }
              }
              // Dark Emerald Text (#065F46, #047857, #059669, #166534, #15803D) on banners -> #34D399 (Bright Legible Mint, leaving #10B981 brand untouched)
              else if (r <= 30 && g >= 90 && g <= 165 && b >= 50 && g > r * 2) {
                if (!seen.has('text:' + sel)) {
                  seen.add('text:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { color: #34D399 !important; }`);
                }
              }
              // Dark Red Warning Text (#DC2626, #991B1B, #B91C1C) -> #F87171 (Bright Salmon Red)
              else if (r >= 150 && g <= 60 && b <= 60) {
                if (!seen.has('text:' + sel)) {
                  seen.add('text:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { color: #F87171 !important; }`);
                }
              }
              // Dark Amber Text (#D97706, #B45309, #92400E) -> #FCD34D (Bright Amber)
              else if (r >= 180 && g >= 100 && g <= 170 && b <= 30) {
                if (!seen.has('text:' + sel)) {
                  seen.add('text:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { color: #FCD34D !important; }`);
                }
              }
              // Dark Blue / Sky / Cyan Text (#0369A1, #0284C7, #075985, #2563EB, #1D4ED8, #1E40AF) -> #38BDF8 / #60A5FA
              else if (b >= 150 && r <= 50 && b > r * 2 && g <= 170) {
                if (!seen.has('text:' + sel)) {
                  seen.add('text:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { color: #38BDF8 !important; }`);
                }
              }
            }
          }

          // ── C. BORDER COLORS ──────────────────────────────────────────────
          const borderVal = style.borderColor || style.borderBottomColor || style.borderTopColor;
          if (borderVal) {
            const rgb = parseCSSColor(borderVal);
            if (rgb && rgb.a > 0.05) {
              const { r, g, b } = rgb;

              // Light Grey Borders (#E2E8F0, #CBD5E1, #D1D5DB, #F1F5F9) -> #1E293B
              if (r >= 195 && g >= 205 && b >= 215) {
                if (!seen.has('border:' + sel)) {
                  seen.add('border:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { border-color: #1E293B !important; }`);
                }
              }
              // Light Mint Borders (#A7F3D0, #BBF7D0, #D1FAE5) -> Dark Mint Border
              else if (g >= 220 && r >= 150 && b >= 190 && g > r) {
                if (!seen.has('border:' + sel)) {
                  seen.add('border:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { border-color: rgba(16, 185, 129, 0.35) !important; }`);
                }
              }
              // Light Red Borders (#FCA5A5, #FECACA) -> Dark Red Border
              else if (r >= 240 && g <= 210 && b <= 210 && r > g) {
                if (!seen.has('border:' + sel)) {
                  seen.add('border:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { border-color: rgba(239, 68, 68, 0.35) !important; }`);
                }
              }
              // Light Amber Borders (#FDE68A, #FEF08A) -> Dark Amber Border
              else if (r >= 240 && g >= 220 && b <= 160) {
                if (!seen.has('border:' + sel)) {
                  seen.add('border:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { border-color: rgba(245, 158, 11, 0.35) !important; }`);
                }
              }
              // Light Blue / Sky Borders (#BFDBFE, #DBEAFE, #BAE6FD, #7DD3FC) -> Dark Blue/Sky Border
              else if (b >= 235 && r <= 220 && g <= 240 && b > r) {
                if (!seen.has('border:' + sel)) {
                  seen.add('border:' + sel);
                  overrides.push(`[data-theme="dark"] ${sel} { border-color: rgba(2, 132, 199, 0.35) !important; }`);
                }
              }
            }
          }
        }
      } catch (err) {
        // Cross-origin protection
      }
    }

    styleTag.textContent = overrides.join('\n');
  } catch (err) {
    console.warn('[MobileThemeContext] Scanner error:', err);
  }
};

export const MobileThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getInitialThemeMode);
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(() => Appearance.getColorScheme());

  // Listen to OS system theme changes in real-time
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => subscription.remove();
  }, []);

  // Compute active dark state based on user choice vs OS system
  const isDark = useMemo(() => {
    if (themeMode === 'dark') return true;
    if (themeMode === 'light') return false;
    return systemScheme === 'dark';
  }, [themeMode, systemScheme]);

  // Sync global tokens & Web CSS
  useEffect(() => {
    currentIsDarkState = isDark;
    setGlobalThemeColors(isDark);
    scanAndApplyRNWDarkOverrides(isDark);

    try {
      if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
        (globalThis as any).localStorage.setItem(STORAGE_THEME_MODE_KEY, themeMode);
        (globalThis as any).localStorage.setItem(STORAGE_WEB_THEME_KEY, isDark ? 'dark' : 'light');
      }
    } catch {}

    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    // Rescan on DOM/Style mutations so freshly mounted screens and modals instantly get themed
    if (!headMutationObserver && typeof MutationObserver !== 'undefined' && document.head) {
      headMutationObserver = new MutationObserver((mutations) => {
        // Prevent recursive loop if mutation originated from our own style tag
        const onlyOurTag = mutations.every((m) => {
          const target = m.target as HTMLElement;
          return (
            target &&
            (target.id === 'propithub-mobile-dark-mode-override' ||
              target.parentElement?.id === 'propithub-mobile-dark-mode-override')
          );
        });
        if (onlyOurTag) return;

        if (!isScanning) {
          isScanning = true;
          requestAnimationFrame(() => {
            // ALWAYS use the active currentIsDarkState, never a stale closure
            scanAndApplyRNWDarkOverrides(currentIsDarkState);
            isScanning = false;
          });
        }
      });
      headMutationObserver.observe(document.head, { childList: true, subtree: true });
    }

    const timeout = setTimeout(() => {
      scanAndApplyRNWDarkOverrides(currentIsDarkState);
    }, 150);

    return () => {
      clearTimeout(timeout);
    };
  }, [isDark, themeMode]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeModeState((prev) => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'light';
      return isDark ? 'light' : 'dark';
    });
  }, [isDark]);

  const colors = useMemo(() => (isDark ? DarkColors : LightColors), [isDark]);

  return (
    <MobileThemeContext.Provider
      value={{
        themeMode,
        setThemeMode,
        isDark,
        colors,
        toggleTheme,
      }}
    >
      {children}
    </MobileThemeContext.Provider>
  );
};

export const useMobileTheme = (): MobileThemeContextType => {
  const context = useContext(MobileThemeContext);
  if (!context) {
    const isDark = Appearance.getColorScheme() === 'dark';
    return {
      themeMode: 'system',
      setThemeMode: () => {},
      isDark,
      colors: isDark ? DarkColors : LightColors,
      toggleTheme: () => {},
    };
  }
  return context;
};
