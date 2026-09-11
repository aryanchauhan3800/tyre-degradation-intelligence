/**
 * TYRETRACE — Thermal Palette & Temperature Color Utilities
 *
 * Implements the exact 8-stop F1 thermal scale requested:
 * < 60°C     = Deep Blue
 * 60–70°C    = Blue / Cyan
 * 70–80°C    = Cyan
 * 80–90°C    = Green
 * 90–100°C   = Yellow
 * 100–110°C  = Orange
 * 110–120°C  = Red-Orange
 * > 120°C    = Intense Red
 */

export interface ThermalColorStop {
  temp: number;
  label: string;
  hex: string;
  r: number;
  g: number;
  b: number;
}

export const THERMAL_PALETTE_STOPS: ThermalColorStop[] = [
  { temp: 50, label: '< 60°C', hex: '#0526e6', r: 5, g: 38, b: 230 },      // Deep blue
  { temp: 65, label: '60–70°C', hex: '#0094f2', r: 0, g: 148, b: 242 },    // Blue/cyan
  { temp: 75, label: '70–80°C', hex: '#00e5f5', r: 0, g: 229, b: 245 },    // Cyan
  { temp: 85, label: '80–90°C', hex: '#1ee038', r: 30, g: 224, b: 56 },     // Green
  { temp: 95, label: '90–100°C', hex: '#faeb0a', r: 250, g: 235, b: 10 },   // Yellow
  { temp: 105, label: '100–110°C', hex: '#ff7b00', r: 255, g: 123, b: 0 },  // Orange
  { temp: 115, label: '110–120°C', hex: '#ff2e05', r: 255, g: 46, b: 5 },   // Red-orange
  { temp: 125, label: '> 120°C', hex: '#f50505', r: 245, g: 5, b: 5 },      // Intense red
];

/**
 * Returns integer RGB hex value (e.g. 0xff2e05) for Three.js materials
 */
export function getThermalColorHex(tempC: number): number {
  if (tempC <= 60) {
    // Deep blue
    return 0x0526e6;
  }
  if (tempC < 70) {
    // 60-70: Deep blue -> Blue/cyan
    const t = (tempC - 60) / 10;
    const r = Math.round(5 * (1 - t) + 0 * t);
    const g = Math.round(38 * (1 - t) + 148 * t);
    const b = Math.round(230 * (1 - t) + 242 * t);
    return (r << 16) | (g << 8) | b;
  }
  if (tempC < 80) {
    // 70-80: Blue/cyan -> Cyan
    const t = (tempC - 70) / 10;
    const r = 0;
    const g = Math.round(148 * (1 - t) + 229 * t);
    const b = Math.round(242 * (1 - t) + 245 * t);
    return (r << 16) | (g << 8) | b;
  }
  if (tempC < 90) {
    // 80-90: Cyan -> Green
    const t = (tempC - 80) / 10;
    const r = Math.round(0 * (1 - t) + 30 * t);
    const g = Math.round(229 * (1 - t) + 224 * t);
    const b = Math.round(245 * (1 - t) + 56 * t);
    return (r << 16) | (g << 8) | b;
  }
  if (tempC < 100) {
    // 90-100: Green -> Yellow
    const t = (tempC - 90) / 10;
    const r = Math.round(30 * (1 - t) + 250 * t);
    const g = Math.round(224 * (1 - t) + 235 * t);
    const b = Math.round(56 * (1 - t) + 10 * t);
    return (r << 16) | (g << 8) | b;
  }
  if (tempC < 110) {
    // 100-110: Yellow -> Orange
    const t = (tempC - 100) / 10;
    const r = Math.round(250 * (1 - t) + 255 * t);
    const g = Math.round(235 * (1 - t) + 123 * t);
    const b = Math.round(10 * (1 - t) + 0 * t);
    return (r << 16) | (g << 8) | b;
  }
  if (tempC < 118) {
    // 110-118: Orange -> Fiery Red
    const t = (tempC - 110) / 8;
    const r = 255;
    const g = Math.round(102 * (1 - t) + 12 * t);
    const b = Math.round(0 * (1 - t) + 5 * t);
    return (r << 16) | (g << 8) | b;
  }
  // >= 118-120°C: Pure Intense Blazing Crimson Red
  const t = Math.min(1.0, (tempC - 118) / 10);
  const r = Math.round(255 * (1 - t) + 245 * t);
  const g = Math.round(12 * (1 - t) + 0 * t);
  const b = Math.round(5 * (1 - t) + 2 * t);
  return (r << 16) | (g << 8) | b;
}

/**
 * Returns CSS hex string for HUD elements & badges (e.g. "#ff2e05")
 */
export function getThermalColorCss(tempC: number): string {
  const hex = getThermalColorHex(tempC).toString(16).padStart(6, '0');
  return `#${hex}`;
}
