import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#0f0f1a",
        card: "#1a1a2e",
        border: "#2a2a4a",
        accent: "#c9a84c",
        text: "#e8e8f0",
        muted: "#8a8aa0"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        serif: ["Cinzel", "Georgia", "serif"]
      }
    }
  },
  plugins: []
};

export default config;
