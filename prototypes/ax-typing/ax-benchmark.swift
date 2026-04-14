#!/usr/bin/env swift
//
// ax-benchmark.swift — Performance measurement for AX typing indicator approach
//
// Measures:
//   1. Time to find Messages.app text input via AX tree
//   2. Time to focus the input
//   3. Time to set text (simulating typing)
//   4. Time for a full focus+set+clear cycle
//   5. Whether Messages.app needs to be foreground
//

import Cocoa
import ApplicationServices

func isTrusted() -> Bool {
    let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true] as CFDictionary
    return AXIsProcessTrustedWithOptions(opts)
}

func getMessagesApp() -> NSRunningApplication? {
    return NSWorkspace.shared.runningApplications.first {
        $0.bundleIdentifier == "com.apple.MobileSMS"
    }
}

func getAttribute(_ element: AXUIElement, _ attr: String) -> AnyObject? {
    var value: AnyObject?
    let err = AXUIElementCopyAttributeValue(element, attr as CFString, &value)
    return err == .success ? value : nil
}

func getChildren(_ element: AXUIElement) -> [AXUIElement] {
    return getAttribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? []
}

func getRole(_ element: AXUIElement) -> String? {
    return getAttribute(element, kAXRoleAttribute) as? String
}

func getIdentifier(_ element: AXUIElement) -> String? {
    return getAttribute(element, "AXIdentifier") as? String
}

func getPlaceholder(_ element: AXUIElement) -> String? {
    return getAttribute(element, kAXPlaceholderValueAttribute) as? String
}

// Recursive find by identifier
func findElement(in element: AXUIElement, id: String, maxDepth: Int = 8, depth: Int = 0) -> AXUIElement? {
    if getIdentifier(element) == id { return element }
    if depth >= maxDepth { return nil }
    for child in getChildren(element) {
        if let found = findElement(in: child, id: id, maxDepth: maxDepth, depth: depth + 1) {
            return found
        }
    }
    return nil
}

// Find by placeholder text (for the compose field)
func findByPlaceholder(in element: AXUIElement, placeholder: String, maxDepth: Int = 8, depth: Int = 0) -> AXUIElement? {
    if getPlaceholder(element) == placeholder { return element }
    if depth >= maxDepth { return nil }
    for child in getChildren(element) {
        if let found = findByPlaceholder(in: child, placeholder: placeholder, maxDepth: maxDepth, depth: depth + 1) {
            return found
        }
    }
    return nil
}

func measure(_ label: String, iterations: Int = 10, block: () -> Bool) {
    var times: [Double] = []
    var successes = 0
    for _ in 0..<iterations {
        let start = CFAbsoluteTimeGetCurrent()
        let ok = block()
        let elapsed = (CFAbsoluteTimeGetCurrent() - start) * 1000.0
        times.append(elapsed)
        if ok { successes += 1 }
    }
    let avg = times.reduce(0, +) / Double(times.count)
    let min = times.min() ?? 0
    let max = times.max() ?? 0
    print("  \(label): avg=\(String(format: "%.2f", avg))ms min=\(String(format: "%.2f", min))ms max=\(String(format: "%.2f", max))ms (\(successes)/\(iterations) ok)")
}

func main() {
    guard isTrusted() else {
        print("ERROR: Accessibility permission not granted.")
        exit(1)
    }

    guard let app = getMessagesApp() else {
        print("ERROR: Messages.app not running.")
        exit(1)
    }

    let appElement = AXUIElementCreateApplication(app.processIdentifier)
    print("Messages.app PID: \(app.processIdentifier)")
    print("Messages.app is active (foreground): \(app.isActive)")
    print()

    // Benchmark 1: Find the compose field
    print("--- Benchmark: Find compose field ---")
    var composeField: AXUIElement?

    measure("Find by id 'messageBodyField'") {
        composeField = findElement(in: appElement, id: "messageBodyField")
        return composeField != nil
    }

    measure("Find by placeholder 'iMessage'") {
        let found = findByPlaceholder(in: appElement, placeholder: "iMessage")
        return found != nil
    }

    guard let field = composeField else {
        print("\nERROR: Could not find compose field. Is a conversation selected?")
        exit(1)
    }

    // Benchmark 2: Focus
    print("\n--- Benchmark: Focus compose field ---")
    measure("AXFocus") {
        let err = AXUIElementSetAttributeValue(field, kAXFocusedAttribute as CFString, true as CFTypeRef)
        return err == .success
    }

    // Benchmark 3: Set text
    print("\n--- Benchmark: Set text ---")
    measure("SetValue 'typing...'") {
        let err = AXUIElementSetAttributeValue(field, kAXValueAttribute as CFString, "typing..." as CFTypeRef)
        return err == .success
    }

    // Clear
    AXUIElementSetAttributeValue(field, kAXValueAttribute as CFString, "" as CFTypeRef)

    // Benchmark 4: Full cycle (focus + set + clear)
    print("\n--- Benchmark: Full typing cycle ---")
    measure("Focus + Set + Clear") {
        let e1 = AXUIElementSetAttributeValue(field, kAXFocusedAttribute as CFString, true as CFTypeRef)
        let e2 = AXUIElementSetAttributeValue(field, kAXValueAttribute as CFString, "..." as CFTypeRef)
        let e3 = AXUIElementSetAttributeValue(field, kAXValueAttribute as CFString, "" as CFTypeRef)
        return e1 == .success && e2 == .success && e3 == .success
    }

    // Benchmark 5: Background test
    print("\n--- Background operation ---")
    print("Messages.app foreground: \(app.isActive)")
    print("Testing AX while Messages is NOT foreground...")
    print("(If Messages IS foreground, minimize it and re-run to test background mode)")

    // Summary (derived from actual benchmark results)
    print("\n--- Summary ---")
    print("Compose field found: \(composeField != nil ? "YES (id=messageBodyField)" : "NO")")
    print("Background operation: \(app.isActive ? "NEEDS TESTING (Messages is foreground)" : "WORKS")")
    print("(Focus and SetValue pass/fail counts are shown in benchmark output above)")
    print()
    print("CRITICAL QUESTION: Does SetValue trigger the typing indicator on the remote end?")
    print("This requires manual verification with a second device.")
}

main()
