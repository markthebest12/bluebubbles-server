// .lintstagedrc.js
module.exports = {
    "packages/server/{src,test,mocks}/**/*.{ts,tsx,js,jsx}": [
        "eslint --fix",
        "prettier --config ./packages/server/.prettierrc --write"
    ],
    "packages/ui/src/**/*.{ts,tsx,js,jsx}": [
        "eslint --fix",
        "prettier --config ./packages/ui/.prettierrc --write"
    ],
    "**/*.{json,css,scss,md}": [
        "prettier --write"
    ]
};
