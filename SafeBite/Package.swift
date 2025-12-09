// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SafeBite",
    defaultLocalization: "en",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "SafeBite",
            targets: ["SafeBite"]
        ),
    ],
    dependencies: [
        // The Composable Architecture
        .package(url: "https://github.com/pointfreeco/swift-composable-architecture", from: "1.15.0"),
        // Firebase
        .package(url: "https://github.com/firebase/firebase-ios-sdk", from: "11.0.0"),
        // Kingfisher for async image loading
        .package(url: "https://github.com/onevcat/Kingfisher", from: "7.0.0"),
    ],
    targets: [
        .target(
            name: "SafeBite",
            dependencies: [
                .product(name: "ComposableArchitecture", package: "swift-composable-architecture"),
                .product(name: "FirebaseAuth", package: "firebase-ios-sdk"),
                .product(name: "FirebaseFirestore", package: "firebase-ios-sdk"),
                .product(name: "FirebaseAnalytics", package: "firebase-ios-sdk"),
                .product(name: "FirebaseCrashlytics", package: "firebase-ios-sdk"),
                .product(name: "Kingfisher", package: "Kingfisher"),
            ],
            path: "SafeBite"
        ),
        .testTarget(
            name: "SafeBiteTests",
            dependencies: ["SafeBite"],
            path: "SafeBiteTests"
        ),
    ]
)
