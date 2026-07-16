// PostCSS config — Vite picks this up automatically and runs every imported CSS
// file through Tailwind (expands @tailwind directives via tailwind.config.ts)
// then autoprefixer. Not imported anywhere; its presence at the extension root
// is what wires Tailwind into the build.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
