import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Prevent accidental value changes on all number inputs when scrolling the mouse wheel
document.addEventListener(
  'wheel',
  () => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === 'number') {
      active.blur();
    }
  },
  { passive: true }
);

// Auto-select initial '0' on focus across all roles and pages so typing immediately replaces it
document.addEventListener(
  'focusin',
  (event) => {
    const target = event.target as HTMLElement | null;
    if (target instanceof HTMLInputElement && target.type === 'number') {
      if (target.value === '0') {
        setTimeout(() => {
          if (document.activeElement === target && target.value === '0') {
            target.select();
          }
        }, 10);
      }
    }
  },
  true
);

// Global sanitizer: strip any accidental leading zeros on any number input
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  'value'
)?.set;

document.addEventListener(
  'input',
  (event) => {
    const target = event.target as HTMLElement | null;
    if (target instanceof HTMLInputElement && target.type === 'number') {
      const val = target.value;
      if (val.length > 1 && val.startsWith('0') && !val.startsWith('0.')) {
        const stripped = val.replace(/^0+(?=\d)/, '');
        if (stripped !== val) {
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(target, stripped);
          } else {
            target.value = stripped;
          }
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
  },
  true
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
