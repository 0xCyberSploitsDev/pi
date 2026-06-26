import type { Config } from "tailwindcss";

export default {
	content: ["./index.html", "./src/**/*.{ts,tsx}"],
	darkMode: "class",
	theme: {
		extend: {
			colors: {
				// Dark OLED terminal palette (ui-ux-pro-max design system).
				base: "#020617",
				surface: "#0F172A",
				"surface-raised": "#1E293B",
				border: "#1E293B",
				"border-strong": "#334155",
				content: "#F8FAFC",
				muted: "#94A3B8",
				subtle: "#64748B",
				accent: "#22C55E",
				"accent-hover": "#16A34A",
				danger: "#EF4444",
				warning: "#F59E0B",
				info: "#38BDF8",
			},
			fontFamily: {
				sans: ["Fira Sans", "system-ui", "sans-serif"],
				mono: ["Fira Code", "ui-monospace", "monospace"],
			},
			boxShadow: {
				glow: "0 0 12px rgba(34, 197, 94, 0.35)",
			},
			keyframes: {
				"fade-in": {
					"0%": { opacity: "0", transform: "translateY(4px)" },
					"100%": { opacity: "1", transform: "translateY(0)" },
				},
				blink: {
					"0%, 100%": { opacity: "1" },
					"50%": { opacity: "0" },
				},
			},
			animation: {
				"fade-in": "fade-in 200ms ease-out",
				blink: "blink 1s step-end infinite",
			},
		},
	},
	plugins: [],
} satisfies Config;
