// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ax-helper",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(url: "https://github.com/swiftlang/swift-testing.git", from: "0.15.0")
    ],
    targets: [
        .executableTarget(
            name: "ax-helper",
            path: "Sources",
            swiftSettings: [
                .swiftLanguageMode(.v5)
            ],
            linkerSettings: [
                .linkedFramework("ApplicationServices"),
                .linkedFramework("Cocoa")
            ]
        ),
        .testTarget(
            name: "AXHelperTests",
            dependencies: [
                .product(name: "Testing", package: "swift-testing"),
                // Depend on the executable target so unit tests can
                // `@testable import ax_helper` and exercise internal helpers
                // (e.g. `AXHelper.walkLast`) directly in-process. Integration
                // tests in CLITests.swift still fork the built binary — this
                // dependency does not affect them.
                .target(name: "ax-helper")
            ],
            path: "Tests/AXHelperTests",
            swiftSettings: [
                .swiftLanguageMode(.v5)
            ]
        )
    ]
)
