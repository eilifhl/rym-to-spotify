import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
    root: "src",
    base: "",
    build: {
        outDir: "../dist",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                popup: resolve(__dirname, "src/popup.html"),
                background: resolve(__dirname, "src/background.ts"),
                content_script: resolve(__dirname, "src/content_script.ts"),
            },
            output: {
                entryFileNames: "[name].js",
                chunkFileNames: "[name].js",
                assetFileNames: "[name].[ext]",
            },
        },
        sourcemap: "inline",
    },
});
