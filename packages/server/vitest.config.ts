import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import swc from "unplugin-swc";

export default defineConfig({
    plugins: [
        tsconfigPaths(),
        // SWC reads emitDecoratorMetadata from tsconfig.json, aligning
        // test transforms with the Babel production build (PR #36).
        swc.vite()
    ],
    test: {
        globals: true,
        environment: "node",
        include: ["src/**/*.test.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            reportsDirectory: "./coverage"
        },
        pool: "forks"
    }
});
