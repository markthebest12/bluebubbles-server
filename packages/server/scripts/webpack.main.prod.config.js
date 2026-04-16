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
                    // Disable mangling and aggressive compression — the
                    // babel-plugin-transform-typescript-metadata plugin emits
                    // Reflect.metadata('design:type', Contact) references that
                    // create variable dependencies. Terser's reordering and
                    // renaming causes TDZ errors ("Cannot access 'fa' before
                    // initialization"). Bundle size is irrelevant for a
                    // server-side Electron app; correctness > size.
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
