import Foundation

let args = CommandLine.arguments
let startTime = DispatchTime.now()

// Parse --trace-id from anywhere in args
var traceId: String? = nil
if let idx = args.firstIndex(of: "--trace-id"), idx + 1 < args.count {
    traceId = args[idx + 1]
}

// First positional argument after binary name is the command
guard args.count >= 2 else {
    writeError("Usage: ax-helper <command> [args] [--trace-id <id>]")
    writeError("Commands: tapback, mark-read, navigate, check")
    exit(ExitCode.invalidArguments.rawValue)
}

let command = args[1]

func elapsed() -> Int {
    let end = DispatchTime.now()
    return Int(Double(end.uptimeNanoseconds - startTime.uptimeNanoseconds) / 1_000_000)
}

switch command {
case "tapback":
    guard args.count >= 3 else {
        writeError("Usage: ax-helper tapback <type> [--trace-id <id>]")
        writeError("Types: heart, thumbsup, thumbsdown, haha, emphasis, question")
        exit(ExitCode.invalidArguments.rawValue)
    }
    let tapbackType = args[2]
    let validTypes = ["heart", "thumbsup", "thumbsdown", "haha", "emphasis", "question"]
    guard validTypes.contains(tapbackType) else {
        writeError("Invalid tapback type: \(tapbackType). Valid: \(validTypes.joined(separator: ", "))")
        exit(ExitCode.invalidArguments.rawValue)
    }
    // TODO: implement in Task 2
    writeJSON(OutputResult(ok: true, op: "tapback", type: tapbackType, ms: elapsed(), trace: traceId))

case "mark-read":
    // TODO: implement in Task 2
    writeJSON(OutputResult(ok: true, op: "mark-read", ms: elapsed(), trace: traceId))

case "navigate":
    guard args.count >= 3 else {
        writeError("Usage: ax-helper navigate <next|prev> [--trace-id <id>]")
        exit(ExitCode.invalidArguments.rawValue)
    }
    let direction = args[2]
    guard direction == "next" || direction == "prev" else {
        writeError("Invalid direction: \(direction). Valid: next, prev")
        exit(ExitCode.invalidArguments.rawValue)
    }
    // TODO: implement in Task 2
    writeJSON(OutputResult(ok: true, op: "navigate", direction: direction, ms: elapsed(), trace: traceId))

case "check":
    // TODO: implement in Task 2
    writeJSON(OutputResult(ok: true, op: "check", ms: elapsed(), trace: traceId))

default:
    writeError("Unknown command: \(command)")
    writeError("Commands: tapback, mark-read, navigate, check")
    exit(ExitCode.invalidArguments.rawValue)
}
