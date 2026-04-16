import Foundation
import Testing

@Suite("CLI Argument Parsing")
struct ArgumentParsingTests {

    static let binaryPath: String = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // AXHelperTests
            .deletingLastPathComponent()  // Tests
            .deletingLastPathComponent()  // Package root
        return url.appendingPathComponent(".build/debug/ax-helper").path
    }()

    static func runCLI(_ args: [String]) throws -> (stdout: String, stderr: String, exitCode: Int32) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: binaryPath)
        process.arguments = args

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        try process.run()
        process.waitUntilExit()

        let stdout = String(data: stdoutPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        let stderr = String(data: stderrPipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        return (stdout, stderr, process.terminationStatus)
    }

    // MARK: - Argument Parsing

    @Test("No arguments prints usage and exits 3")
    func noArgsPrintsUsageAndExits3() throws {
        let result = try Self.runCLI([])
        #expect(result.exitCode == 3)
        #expect(result.stderr.contains("Usage:"))
    }

    @Test("Unknown command exits 3")
    func unknownCommandExits3() throws {
        let result = try Self.runCLI(["bogus"])
        #expect(result.exitCode == 3)
        #expect(result.stderr.contains("Unknown command"))
    }

    @Test("Tapback missing type exits 3")
    func tapbackMissingTypeExits3() throws {
        let result = try Self.runCLI(["tapback"])
        #expect(result.exitCode == 3)
        #expect(result.stderr.contains("Usage:"))
    }

    @Test("Tapback invalid type exits 3")
    func tapbackInvalidTypeExits3() throws {
        let result = try Self.runCLI(["tapback", "invalid"])
        #expect(result.exitCode == 3)
        #expect(result.stderr.contains("Invalid tapback type"))
    }

    @Test("Navigate missing direction exits 3")
    func navigateMissingDirectionExits3() throws {
        let result = try Self.runCLI(["navigate"])
        #expect(result.exitCode == 3)
    }

    @Test("Navigate invalid direction exits 3")
    func navigateInvalidDirectionExits3() throws {
        let result = try Self.runCLI(["navigate", "sideways"])
        #expect(result.exitCode == 3)
        #expect(result.stderr.contains("Invalid direction"))
    }
}

@Suite("JSON Output Format")
struct JSONOutputTests {

    @Test("Tapback output is valid JSON with correct fields")
    func tapbackOutputIsValidJSON() throws {
        let result = try ArgumentParsingTests.runCLI(["tapback", "heart", "--trace-id", "test123"])
        let data = result.stdout.data(using: .utf8)!
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(json["op"] as? String == "tapback")
        #expect(json["type"] as? String == "heart")
        #expect(json["trace"] as? String == "test123")
        #expect(json["ms"] != nil)
    }

    @Test("Mark-read output is valid JSON")
    func markReadOutputIsValidJSON() throws {
        let result = try ArgumentParsingTests.runCLI(["mark-read"])
        let data = result.stdout.data(using: .utf8)!
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(json["op"] as? String == "mark-read")
        #expect(json["ok"] as? Bool == true)
    }

    @Test("Navigate output is valid JSON with direction")
    func navigateOutputIsValidJSON() throws {
        let result = try ArgumentParsingTests.runCLI(["navigate", "next", "--trace-id", "abc"])
        let data = result.stdout.data(using: .utf8)!
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(json["op"] as? String == "navigate")
        #expect(json["direction"] as? String == "next")
        #expect(json["trace"] as? String == "abc")
    }

    @Test("Check output is valid JSON")
    func checkOutputIsValidJSON() throws {
        let result = try ArgumentParsingTests.runCLI(["check"])
        let data = result.stdout.data(using: .utf8)!
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(json["op"] as? String == "check")
    }

    @Test("Trace ID is optional and absent when not provided")
    func traceIdOptional() throws {
        let result = try ArgumentParsingTests.runCLI(["mark-read"])
        let data = result.stdout.data(using: .utf8)!
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        // trace should be null/absent when not provided
        let traceIsAbsent = json["trace"] is NSNull || json["trace"] == nil
        #expect(traceIsAbsent)
    }
}
