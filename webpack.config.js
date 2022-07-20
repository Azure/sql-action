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
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: "ts-loader"
            }
        ]
    }
};