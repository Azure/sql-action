const path = require('path');

module.exports = {
    entry: './src/main.ts',
    target: 'node',
    output: {
        path: path.resolve(__dirname, 'lib'),
        filename: "main.js"
    },
    resolve: {
        extensions: [".ts", ".tsx", ".js"]
    },
    stats: {
        warnings: false
    },
    optimization: {
        moduleIds: 'deterministic',
        chunkIds: 'deterministic'
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: "ts-loader"
            }
        ]
    }
};