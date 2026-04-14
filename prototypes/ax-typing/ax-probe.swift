#!/usr/bin/env swift
//
// ax-probe.swift — Accessibility API probe for Messages.app
//
// Queries the AX hierarchy of Messages.app to find text input fields.
// Used to evaluate whether typing indicators can be triggered via AX
// instead of the Private API (which is dead on Tahoe).
//
// Requirements:
//   - Accessibility permission granted to Terminal.app (or whatever runs this)
//   - Messages.app must be running
//
// Usage:
//   swift ax-probe.swift [--dump]     Probe Messages.app AX tree
//   swift ax-probe.swift --set-text "hello"   Set text in the input field
//   swift ax-probe.swift --focus      Focus the text input field
//

import Cocoa
import ApplicationServices

// MARK: - Helpers

func isTrusted() -> Bool {
    let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true] as CFDictionary
    return AXIsProcessTrustedWithOptions(opts)
}

func getMessagesApp() -> NSRunningApplication? {
    return NSWorkspace.shared.runningApplications.first {
        $0.bundleIdentifier == "com.apple.MobileSMS"
    }
}

func axElement(for app: NSRunningApplication) -> AXUIElement {
    return AXUIElementCreateApplication(app.processIdentifier)
}

func getAttribute(_ element: AXUIElement, _ attr: String) -> AnyObject? {
    var value: AnyObject?
    let err = AXUIElementCopyAttributeValue(element, attr as CFString, &value)
    return err == .success ? value : nil
}

func getChildren(_ element: AXUIElement) -> [AXUIElement] {
    guard let children = getAttribute(element, kAXChildrenAttribute) as? [AXUIElement] else {
        return []
    }
    return children
}

func getRole(_ element: AXUIElement) -> String? {
    return getAttribute(element, kAXRoleAttribute) as? String
}

func getSubrole(_ element: AXUIElement) -> String? {
    return getAttribute(element, kAXSubroleAttribute) as? String
}

func getTitle(_ element: AXUIElement) -> String? {
    return getAttribute(element, kAXTitleAttribute) as? String
}

func getDescription(_ element: AXUIElement) -> String? {
    return getAttribute(element, kAXDescriptionAttribute) as? String
}

func getValue(_ element: AXUIElement) -> String? {
    return getAttribute(element, kAXValueAttribute) as? String
}

func getIdentifier(_ element: AXUIElement) -> String? {
    return getAttribute(element, "AXIdentifier") as? String
}

func getPlaceholder(_ element: AXUIElement) -> String? {
    return getAttribute(element, kAXPlaceholderValueAttribute) as? String
}

// MARK: - Tree Walker

struct AXNode {
    let element: AXUIElement
    let role: String?
    let subrole: String?
    let title: String?
    let description: String?
    let value: String?
    let identifier: String?
    let placeholder: String?
    let depth: Int
}

func walkTree(_ element: AXUIElement, depth: Int = 0, maxDepth: Int = 8) -> [AXNode] {
    var nodes: [AXNode] = []
    let node = AXNode(
        element: element,
        role: getRole(element),
        subrole: getSubrole(element),
        title: getTitle(element),
        description: getDescription(element),
        value: getValue(element),
        identifier: getIdentifier(element),
        placeholder: getPlaceholder(element),
        depth: depth
    )
    nodes.append(node)

    if depth < maxDepth {
        for child in getChildren(element) {
            nodes.append(contentsOf: walkTree(child, depth: depth + 1, maxDepth: maxDepth))
        }
    }
    return nodes
}

func printNode(_ node: AXNode) {
    let indent = String(repeating: "  ", count: node.depth)
    var parts: [String] = []
    if let role = node.role { parts.append("role=\(role)") }
    if let subrole = node.subrole { parts.append("subrole=\(subrole)") }
    if let title = node.title, !title.isEmpty { parts.append("title=\"\(title)\"") }
    if let desc = node.description, !desc.isEmpty { parts.append("desc=\"\(desc)\"") }
    if let id = node.identifier, !id.isEmpty { parts.append("id=\"\(id)\"") }
    if let ph = node.placeholder, !ph.isEmpty { parts.append("placeholder=\"\(ph)\"") }
    if let val = node.value {
        let truncated = val.count > 50 ? String(val.prefix(50)) + "..." : val
        parts.append("value=\"\(truncated)\"")
    }
    print("\(indent)\(parts.joined(separator: " | "))")
}

// MARK: - Find Text Input

func findTextInputs(_ element: AXUIElement) -> [AXUIElement] {
    let nodes = walkTree(element)
    return nodes.compactMap { node in
        guard let role = node.role else { return nil }
        // Look for text areas, text fields, and web areas that might contain text input
        if role == kAXTextAreaRole as String ||
           role == kAXTextFieldRole as String ||
           (role == "AXWebArea" && node.subrole == nil) {
            return node.element
        }
        return nil
    }
}

// MARK: - Actions

func setText(_ element: AXUIElement, text: String) -> Bool {
    let err = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, text as CFTypeRef)
    return err == .success
}

func focusElement(_ element: AXUIElement) -> Bool {
    let err = AXUIElementSetAttributeValue(element, kAXFocusedAttribute as CFString, true as CFTypeRef)
    return err == .success
}

func performPress(_ element: AXUIElement) -> Bool {
    let err = AXUIElementPerformAction(element, kAXPressAction as CFString)
    return err == .success
}

// MARK: - Main

func main() {
    let args = CommandLine.arguments

    // Check accessibility trust
    guard isTrusted() else {
        print("ERROR: Accessibility permission not granted.")
        print("Grant access in: System Settings > Privacy & Security > Accessibility")
        print("Add Terminal.app (or your terminal emulator) to the allowed list.")
        exit(1)
    }

    // Find Messages.app
    guard let messagesApp = getMessagesApp() else {
        print("ERROR: Messages.app is not running.")
        print("Please open Messages.app first.")
        exit(1)
    }

    print("Found Messages.app (PID: \(messagesApp.processIdentifier))")
    let appElement = axElement(for: messagesApp)

    // Mode: dump full tree
    if args.contains("--dump") {
        print("\n--- AX Tree Dump (max depth 8) ---\n")
        let nodes = walkTree(appElement)
        for node in nodes {
            printNode(node)
        }
        print("\n--- End dump (\(nodes.count) nodes) ---")
        return
    }

    // Find text inputs
    let textInputs = findTextInputs(appElement)
    print("Found \(textInputs.count) text input element(s)\n")

    for (i, input) in textInputs.enumerated() {
        let role = getRole(input) ?? "?"
        let value = getValue(input) ?? "<empty>"
        let placeholder = getPlaceholder(input) ?? "<none>"
        let identifier = getIdentifier(input) ?? "<none>"
        print("[\(i)] role=\(role) id=\(identifier) placeholder=\(placeholder) value=\"\(value)\"")
    }

    // Mode: set text
    if let idx = args.firstIndex(of: "--set-text"), idx + 1 < args.count {
        let text = args[idx + 1]
        guard let firstInput = textInputs.first else {
            print("\nERROR: No text input found to set text on.")
            exit(1)
        }
        print("\nAttempting to set text to: \"\(text)\"")
        let focused = focusElement(firstInput)
        print("  Focus result: \(focused ? "OK" : "FAILED")")
        let set = setText(firstInput, text: text)
        print("  SetValue result: \(set ? "OK" : "FAILED")")

        // Re-read value
        let newValue = getValue(firstInput) ?? "<empty>"
        print("  Current value: \"\(newValue)\"")

        print("\n** CHECK: Did the remote recipient see a typing indicator? **")
        return
    }

    // Mode: focus
    if args.contains("--focus") {
        guard let firstInput = textInputs.first else {
            print("\nERROR: No text input found to focus.")
            exit(1)
        }
        print("\nAttempting to focus text input...")
        let result = focusElement(firstInput)
        print("  Focus result: \(result ? "OK" : "FAILED")")

        print("\n** CHECK: Did the remote recipient see a typing indicator? **")
        return
    }

    // Default: just probe
    if textInputs.isEmpty {
        print("No text inputs found. Run with --dump to see the full AX tree.")
    } else {
        print("\nTo test typing indicator trigger:")
        print("  swift ax-probe.swift --focus           # Focus the input field")
        print("  swift ax-probe.swift --set-text \"hi\"   # Set text in the field")
        print("  swift ax-probe.swift --dump            # Full AX tree dump")
    }
}

main()
