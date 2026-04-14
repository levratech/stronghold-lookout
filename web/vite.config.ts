import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const drawbridgeTarget = process.env.LOOKOUT_AUTH_PROXY_TARGET ?? "http://127.0.0.1:3000";
const natsTarget = process.env.LOOKOUT_NATS_PROXY_TARGET ?? "http://127.0.0.1:8443";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/_/auth": {
        target: drawbridgeTarget,
        changeOrigin: true,
      },
      "/_/nats": {
        target: natsTarget,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
