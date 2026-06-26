import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		proxy: {
			// Server mounts the REST API under /api and the WS under /ws.
			"/api": {
				target: "http://localhost:3000",
				changeOrigin: true,
			},
			"/ws": {
				target: "ws://localhost:3000",
				ws: true,
			},
		},
	},
	build: {
		outDir: "dist",
		sourcemap: true,
	},
});
