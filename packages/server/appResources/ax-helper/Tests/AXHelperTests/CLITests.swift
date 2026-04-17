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

    // Contract/shape test only — asserts the JSON structure of tapback output
    // regardless of whether the operation succeeded. In a test environment
    // without Messages.app running, this falls through to the error path; both
    // {ok:true,type:...} and {ok:false,error:...} shapes are accepted. A
    // behavioral test requires mocking Messages.app's AX tree, which is out
    // of scope here.
    @Test("Tapback output JSON has the expected shape")
    func tapbackOutputHasExpectedShape() throws {
        let result = try ArgumentParsingTests.runCLI(["tapback", "heart", "--trace-id", "test123"])
        // Exit code should NOT be 3 (invalid args) — it passed argument validation
        #expect(result.exitCode != 3)
        let data = result.stdout.data(using: .utf8)!
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(json["op"] as? String == "tapback")
        #expect(json["trace"] as? String == "test123")
        #expect(json["ok"] != nil)
        #expect(json["ms"] != nil)
        // type is present on success, error on failure — both valid
        let hasTypeOrError = json["type"] != nil || json["error"] != nil
        #expect(hasTypeOrError)
    }

    @Test("Mark-read produces valid JSON with op field")
    func markReadOutputIsValidJSON() throws {
        let result = try ArgumentParsingTests.runCLI(["mark-read"])
        #expect(result.exitCode != 3)
        let data = result.stdout.data(using: .utf8)!
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(json["op"] as? String == "mark-read")
        #expect(json["ok"] != nil)
    }

    @Test("Navigate with valid args produces valid JSON with op and trace")
    func navigateOutputIsValidJSON() throws {
        let result = try ArgumentParsingTests.runCLI(["navigate", "next", "--trace-id", "abc"])
        #expect(result.exitCode != 3)
        let data = result.stdout.data(using: .utf8)!
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(json["op"] as? String == "navigate")
        #expect(json["trace"] as? String == "abc")
        #expect(json["ok"] != nil)
        // direction is present on success, error on failure — both valid
        let hasDirectionOrError = json["direction"] != nil || json["error"] != nil
        #expect(hasDirectionOrError)
    }

    @Test("Check produces valid JSON with op field")
    func checkOutputIsValidJSON() throws {
        let result = try ArgumentParsingTests.runCLI(["check"])
        let data = result.stdout.data(using: .utf8)!
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        #expect(json["op"] as? String == "check")
        #expect(json["ok"] != nil)
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
