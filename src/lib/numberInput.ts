import React from 'react';

/**
 * Format numeric value for inputs to prevent leading '0' when initialized to 0.
 * If value is 0 or empty, returns empty string so placeholder is cleanly visible.
 */
export function formatNumberInput(val: number | '' | null | undefined): string | number {
  if (val === undefined || val === null || val === 0 || val === '') {
    return '';
  }
  return val;
}

/**
 * Parses user input string from <input type="number"> or <input type="text">,
 * stripping accidental leading zeros (e.g. typing '5' into '0' resulting in '05').
 */
export function parseNumberInput(raw: string): number {
  if (!raw || raw.trim() === '') return 0;
  // Strip leading zeros before a digit, e.g. "05" -> "5", "0025000" -> "25000", but keep single "0"
  const cleaned = raw.replace(/^0+(?=\d)/, '');
  const parsed = Number(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Event handler to prevent mouse wheel from incrementing number inputs.
 */
export function handleNumberWheel(e: React.WheelEvent<HTMLInputElement | HTMLElement>) {
  if (e.currentTarget instanceof HTMLInputElement) {
    e.currentTarget.blur();
  }
}
