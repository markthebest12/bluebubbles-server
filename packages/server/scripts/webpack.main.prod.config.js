const { merge } = require('webpack-merge');
const TerserPlugin = require('terser-webpack-plugin');

const baseConfig = require('./webpack.main.config');

module.exports = merge(baseConfig, {
    mode: 'production',
    optimization: {
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    keep_classnames: true,
                    keep_fnames: true,
                    // Disable mangling and aggressive compression — decorator
                    // metadata emits references that depend on declaration order.
                    // Terser's reordering causes TDZ errors (e.g. "Cannot access
                    // 'fa' before initialization"). Bundle size is irrelevant for
                    // a server-side Electron app.
                    mangle: false,
                    compress: {
                        collapse_vars: false,
                        reduce_vars: false,
                    },
                },
            }),
        ],
    },
});
