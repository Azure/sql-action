const path = require('path');

module.exports = {
    entry: {
        main: './src/main.ts',
        setup: './src/setup.ts'
    },
    target: 'node',
    output: {
        path: path.resolve(__dirname, 'lib'),
        filename: "[name].js"
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