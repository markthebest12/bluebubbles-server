import Foundation

enum ExitCode: Int32 {
    case success = 0
    case operationFailed = 1
    case permissionDenied = 2
    case invalidArguments = 3
}

struct OutputResult: Encodable {
    let ok: Bool
    let op: String
    var type: String?
    var direction: String?
    var error: String?
    var ms: Int?
    var trace: String?
    var menuItems: [String: String]?
}

func writeJSON(_ result: OutputResult) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = .sortedKeys
    if let data = try? encoder.encode(result),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}

func writeError(_ message: String) {
    FileHandle.standardError.write(Data("\(message)\n".utf8))
}
