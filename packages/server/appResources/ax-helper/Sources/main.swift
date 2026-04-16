import Foundation
import ApplicationServices

let args = CommandLine.arguments
let startTime = DispatchTime.now()

var traceId: String? = nil
if let idx = args.firstIndex(of: "--trace-id"), idx + 1 < args.count {
    traceId = args[idx + 1]
}

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

// Pre-flight: check accessibility permission
guard MessagesApp.checkAccessibility() else {
    writeError("Accessibility permission not granted. Grant in System Settings > Privacy & Security > Accessibility.")
    writeJSON(OutputResult(ok: false, op: command, error: "permission_denied", ms: elapsed(), trace: traceId))
    exit(ExitCode.permissionDenied.rawValue)
}

// Pre-flight: find Messages.app (except for check which reports this)
func requireMessages() -> MessagesApp {
    guard let messages = MessagesApp.find() else {
        writeError("Messages.app is not running.")
        writeJSON(OutputResult(ok: false, op: command, error: "messages_not_running", ms: elapsed(), trace: traceId))
        exit(ExitCode.operationFailed.rawValue)
    }
    return messages
}

func requireMenuBar(_ messages: MessagesApp) -> AXUIElement {
    guard let menuBar = messages.getMenuBar() else {
        writeError("Cannot access Messages.app menu bar.")
        writeJSON(OutputResult(ok: false, op: command, error: "no_menu_bar", ms: elapsed(), trace: traceId))
        exit(ExitCode.operationFailed.rawValue)
    }
    return menuBar
}

func pressMenuItemByName(_ menuBar: AXUIElement, name: String, op: String) {
    guard let identifier = AXHelper.menuItemIds[name] else {
        writeError("Unknown menu item name: \(name)")
        writeJSON(OutputResult(ok: false, op: op, error: "unknown_item", ms: elapsed(), trace: traceId))
        exit(ExitCode.operationFailed.rawValue)
    }
    guard let item = AXHelper.findMenuItem(menuBar, identifier: identifier) else {
        writeError("Menu item not found: \(identifier)")
        writeJSON(OutputResult(ok: false, op: op, error: "menu_item_not_found", ms: elapsed(), trace: traceId))
        exit(ExitCode.operationFailed.rawValue)
    }
    guard item.enabled else {
        writeError("Menu item disabled: \(identifier)")
        writeJSON(OutputResult(ok: false, op: op, error: "menu_item_disabled", ms: elapsed(), trace: traceId))
        exit(ExitCode.operationFailed.rawValue)
    }
    let result = AXHelper.pressMenuItem(item.element)
    guard result == .success else {
        writeError("AXPerformAction failed: \(result.rawValue)")
        writeJSON(OutputResult(ok: false, op: op, error: "ax_press_failed_\(result.rawValue)", ms: elapsed(), trace: traceId))
        exit(ExitCode.operationFailed.rawValue)
    }
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
    let messages = requireMessages()
    let menuBar = requireMenuBar(messages)
    pressMenuItemByName(menuBar, name: "tapback", op: "tapback")
    // Note: tapback picker appears — the actual type selection requires
    // further AX interaction with the picker UI. For now, pressing the
    // menu item opens the picker. Type selection is a future enhancement.
    writeJSON(OutputResult(ok: true, op: "tapback", type: tapbackType, ms: elapsed(), trace: traceId))

case "mark-read":
    let messages = requireMessages()
    let menuBar = requireMenuBar(messages)
    pressMenuItemByName(menuBar, name: "mark-read", op: "mark-read")
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
    let messages = requireMessages()
    let menuBar = requireMenuBar(messages)
    let itemName = direction == "next" ? "navigate-next" : "navigate-prev"
    pressMenuItemByName(menuBar, name: itemName, op: "navigate")
    writeJSON(OutputResult(ok: true, op: "navigate", direction: direction, ms: elapsed(), trace: traceId))

case "check":
    let hasPermission = MessagesApp.checkAccessibility()
    let messagesRunning = MessagesApp.find() != nil

    if !hasPermission {
        writeJSON(OutputResult(ok: false, op: "check", error: "permission_denied", ms: elapsed(), trace: traceId))
        exit(ExitCode.permissionDenied.rawValue)
    }
    if !messagesRunning {
        writeJSON(OutputResult(ok: false, op: "check", error: "messages_not_running", ms: elapsed(), trace: traceId))
        exit(ExitCode.operationFailed.rawValue)
    }

    let messages = MessagesApp.find()!
    let menuBar = requireMenuBar(messages)
    let items = AXHelper.discoverMenuItems(menuBar)
    writeJSON(OutputResult(ok: true, op: "check", ms: elapsed(), trace: traceId, menuItems: items))

default:
    writeError("Unknown command: \(command)")
    writeError("Commands: tapback, mark-read, navigate, check")
    exit(ExitCode.invalidArguments.rawValue)
}
