import type { Config } from 'tailwindcss';

// Tailwind config for the extension (popup + dashboard surfaces).
//
// Tailwind scans the `content` files for class names and generates CSS only for
// the classes it finds. If a file isn't matched here, its Tailwind classes
// silently produce no CSS — first thing to check when a component "has no styles."
export default {
  content: [
    // Both UI surfaces live under entrypoints/ (popup/, dashboard/).
    './entrypoints/**/*.{html,ts,tsx}',
    // Phase 1 step 6 adds shared components here; globbing a not-yet-existing
    // dir is harmless.
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Overriding `sans` makes Inter the DEFAULT body font app-wide (Tailwind's
        // base styles point the page at fontFamily.sans) — no class needed on body.
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        // `font-display` -> Bodoni Moda, for titles/headings. Apply it explicitly.
        display: ['"Bodoni Moda Variable"', '"Bodoni Moda"', 'Georgia', 'serif'],
      },
      colors: {
        // Hot-pink ACCENT — used sparingly (primary action, a highlight, a focus
        // ring), never as a flood. Vivid enough to read as text on white, unlike
        // the original pastel. Reusable anywhere a color goes: `text-brand`,
        // `bg-brand`, `border-brand`, etc.
        brand: '#ec4899',
      },
    },
  },
  plugins: [],
} satisfies Config;
