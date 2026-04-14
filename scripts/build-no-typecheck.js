#!/usr/bin/env node
/**
 * Build the server webpack bundle WITHOUT the ForkTsCheckerWebpackPlugin.
 *
 * The upstream codebase has pre-existing Buffer type errors that fail on
 * Node 22+ @types/node. Babel handles transpilation fine (it ignores types),
 * but the type checker plugin blocks the webpack build.
 *
 * Usage: node scripts/build-no-typecheck.js
 */
const path = require("path");
const { merge } = require("webpack-merge");
const webpack = require("webpack");

const baseConfig = require(path.resolve(__dirname, "../packages/server/scripts/webpack.main.config"));

// Merge with production mode, strip the type checker plugin
const config = merge(baseConfig, { mode: "production" });
config.plugins = config.plugins.filter(
    p => p.constructor.name !== "ForkTsCheckerWebpackPlugin"
);

const compiler = webpack(config);
compiler.run((err, stats) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(stats.toString({ colors: true, errors: true, warnings: false }));
    if (stats.hasErrors()) {
        process.exit(1);
    }
    compiler.close(() => process.exit(0));
});
