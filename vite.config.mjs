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
                popup: resolve(import.meta.dirname, "src/popup.html"),
                background: resolve(import.meta.dirname, "src/background.js"),
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
