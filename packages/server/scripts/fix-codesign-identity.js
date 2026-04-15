// afterPack hook for electron-builder
// Fixes code signing identity mismatch that breaks macOS Accessibility permission checks.
//
// Problem: Ad-hoc signed Electron apps get Identifier=Electron (generic),
// but macOS TCC stores permissions under CFBundleIdentifier. AXIsProcessTrusted()
// looks up by code signing identifier, causing a permanent mismatch.
//
// Solution: Re-sign the app bundle with --identifier matching the appId.

const { execSync } = require("child_process");
const path = require("path");

module.exports = async function (context) {
    if (process.platform !== "darwin") return;

    const appPath = path.join(
        context.appOutDir,
        `${context.packager.appInfo.productFilename}.app`
    );
    const appId = context.packager.config.appId;

    console.log(`  • Fixing code signing identity: ${appId}`);
    execSync(
        `codesign --force --deep --sign - --identifier ${appId} "${appPath}"`,
        { stdio: "inherit" }
    );
};
