import Cocoa
import ApplicationServices

struct MessagesApp {
    let app: NSRunningApplication
    let element: AXUIElement

    static func find() -> MessagesApp? {
        guard let app = NSWorkspace.shared.runningApplications.first(where: {
            $0.bundleIdentifier == "com.apple.MobileSMS"
        }) else {
            return nil
        }
        return MessagesApp(app: app, element: AXUIElementCreateApplication(app.processIdentifier))
    }

    static func checkAccessibility() -> Bool {
        let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue(): false] as CFDictionary
        return AXIsProcessTrustedWithOptions(opts)
    }

    func getMenuBar() -> AXUIElement? {
        var value: AnyObject?
        let err = AXUIElementCopyAttributeValue(element, kAXMenuBarAttribute as CFString, &value)
        guard err == .success, let value = value else { return nil }
        return (value as! AXUIElement)
    }
}
