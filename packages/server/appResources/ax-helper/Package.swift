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
                .product(name: "Testing", package: "swift-testing")
            ],
            path: "Tests/AXHelperTests",
            swiftSettings: [
                .swiftLanguageMode(.v5)
            ]
        )
    ]
)
