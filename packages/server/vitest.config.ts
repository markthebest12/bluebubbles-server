import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";
import path from "path";

export default defineConfig({
    plugins: [
        // SWC reads emitDecoratorMetadata from tsconfig.json, aligning
        // test transforms with the Babel production build (PR #36).
        swc.vite()
    ],
    resolve: {
        alias: {
            "@server/": path.resolve(__dirname, "src/server") + "/",
            "@server": path.resolve(__dirname, "src/server/index.ts"),
            "@windows/": path.resolve(__dirname, "src/windows") + "/",
            "@trays/": path.resolve(__dirname, "src/trays") + "/"
        }
    },
    test: {
        globals: true,
        environment: "node",
        setupFiles: ["./test/setup.ts"],
        include: ["src/**/*.test.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            reportsDirectory: "./coverage"
        },
        pool: "forks"
    }
});
