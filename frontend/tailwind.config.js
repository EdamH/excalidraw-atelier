/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Instrument Serif"', "Georgia", "serif"],
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      keyframes: {
        "smooth-fade-in": {
          "0%": {
            opacity: "0",
            transform: "translateY(10px) scale(0.98)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0) scale(1)",
          },
        },
        "pop-in": {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "80%": { transform: "scale(1.1)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        "slide-in": {
          "0%": { opacity: "0", transform: "translateX(-8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "ink-bleed": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "numeral-rise": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "rule-draw": {
          "0%": { width: "0%" },
          "100%": { width: "100%" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "modal-enter": {
          "0%": {
            opacity: "0",
            transform: "translateY(24px) scale(0.99)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0) scale(1)",
          },
        },
        "dot-loop": {
          "0%, 100%": { opacity: "0.25" },
          "50%": { opacity: "1" },
        },
        "pet-hop": {
          "0%, 100%": { transform: "scaleX(1) scaleY(1)" },
          "40%": { transform: "scaleX(0.92) scaleY(1.06)" },
          "60%": { transform: "scaleX(1.06) scaleY(0.92)" },
        },
        "pet-wiggle": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "20%": { transform: "rotate(-4deg)" },
          "40%": { transform: "rotate(4deg)" },
          "60%": { transform: "rotate(-2deg)" },
          "80%": { transform: "rotate(2deg)" },
        },
        "pet-breathe": {
          "0%, 100%": { transform: "scaleX(1) scaleY(1)" },
          "50%": { transform: "scaleX(1.03) scaleY(0.97)" },
        },
        "pet-sway": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "25%": { transform: "rotate(3deg)" },
          "75%": { transform: "rotate(-3deg)" },
        },
        "pet-shiver": {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-2px)" },
          "75%": { transform: "translateX(2px)" },
        },
        "pet-ghost": {
          "0%, 100%": { opacity: "0.3" },
          "50%": { opacity: "0.6" },
        },
        "heart-float": {
          "0%": { opacity: "1", transform: "translateY(0)" },
          "60%": { opacity: "0.7", transform: "translateY(-20px)" },
          "100%": { opacity: "0", transform: "translateY(-35px)" },
        },
        "text-float": {
          "0%": { opacity: "1", transform: "translateY(0)" },
          "40%": { opacity: "1", transform: "translateY(-10px)" },
          "100%": { opacity: "0", transform: "translateY(-30px)" },
        },
      },
      animation: {
        "smooth-fade-in": "smooth-fade-in 0.3s ease-out forwards",
        "pop-in": "pop-in 0.45s ease-out",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
        "slide-in": "slide-in 0.25s ease-out",
        "ink-bleed": "ink-bleed 0.5s ease-out forwards",
        "numeral-rise": "numeral-rise 0.7s ease-out forwards",
        "rule-draw": "rule-draw 0.6s ease-out forwards",
        "fade-in": "fade-in 0.2s ease-out forwards",
        "modal-enter": "modal-enter 0.35s cubic-bezier(0.2, 0.7, 0.2, 1) forwards",
        "dot-loop": "dot-loop 1.3s ease-in-out infinite",
        "pet-hop": "pet-hop 0.5s ease-in-out infinite",
        "pet-wiggle": "pet-wiggle 0.8s ease-in-out infinite",
        "pet-breathe": "pet-breathe 2.5s ease-in-out infinite",
        "pet-sway": "pet-sway 2s ease-in-out infinite",
        "pet-shiver": "pet-shiver 0.3s ease-in-out infinite",
        "pet-ghost": "pet-ghost 3s ease-in-out infinite",
        "heart-float": "heart-float 0.9s ease-out forwards",
        "text-float": "text-float 1.4s ease-out forwards",
      },
      colors: {
        paper: {
          DEFAULT: "#FAF7F0",
          deep: "#F2EDE0",
        },
        ink: {
          DEFAULT: "#1A0E2E",
          soft: "#4B3768",
          fade: "#8C7FA3",
        },
        plum: {
          DEFAULT: "#682EB0",
          deep: "#3E1C6A",
          haze: "#EFE7FA",
        },
        gold: {
          DEFAULT: "#FFD701",
          deep: "#A67102",
        },
        rule: "rgba(26,14,46,0.15)",
        destructive: {
          DEFAULT: "#C0392B",
          foreground: "#FAF7F0",
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
