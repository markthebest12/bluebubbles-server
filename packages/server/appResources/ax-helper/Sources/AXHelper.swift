import ApplicationServices

struct MenuItemResult {
    let element: AXUIElement
    let enabled: Bool
}

enum AXHelper {

    // Known menu item identifiers for Messages.app on Tahoe
    static let menuItemIds: [String: String] = [
        "tapback": "tapback_last_message\u{2026}",
        "mark-read": "mark_all_as_read",
        "navigate-next": "go_to_next_conversation",
        "navigate-prev": "go_to_previous_conversation",
        // For check command — enumerate all
        "send": "send_message",
        "reply": "reply_to_last_message\u{2026}",
        "new-message": "new_message",
        "mark-unread": "mark_as_unread",
        "show-details": "show_details",
        "delete": "delete_conversation\u{2026}"
    ]

    static func findMenuItem(_ menuBar: AXUIElement, identifier: String, maxDepth: Int = 8) -> MenuItemResult? {
        return searchForItem(menuBar, identifier: identifier, depth: 0, maxDepth: maxDepth)
    }

    static func pressMenuItem(_ item: AXUIElement) -> AXError {
        return AXUIElementPerformAction(item, kAXPressAction as CFString)
    }

    static func discoverMenuItems(_ menuBar: AXUIElement) -> [String: String] {
        var results: [String: String] = [:]
        for (name, identifier) in menuItemIds {
            if let item = findMenuItem(menuBar, identifier: identifier) {
                results[name] = item.enabled ? "enabled" : "disabled"
            } else {
                results[name] = "missing"
            }
        }
        return results
    }

    // MARK: - Private

    private static func searchForItem(_ element: AXUIElement, identifier: String, depth: Int, maxDepth: Int) -> MenuItemResult? {
        if getIdentifier(element) == identifier {
            let enabled = getEnabled(element)
            return MenuItemResult(element: element, enabled: enabled)
        }
        if depth >= maxDepth { return nil }
        for child in getChildren(element) {
            if let found = searchForItem(child, identifier: identifier, depth: depth + 1, maxDepth: maxDepth) {
                return found
            }
        }
        return nil
    }

    private static func getChildren(_ element: AXUIElement) -> [AXUIElement] {
        var value: AnyObject?
        let err = AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value)
        return err == .success ? (value as? [AXUIElement] ?? []) : []
    }

    private static func getIdentifier(_ element: AXUIElement) -> String? {
        var value: AnyObject?
        let err = AXUIElementCopyAttributeValue(element, kAXIdentifierAttribute as CFString, &value)
        return err == .success ? (value as? String) : nil
    }

    private static func getEnabled(_ element: AXUIElement) -> Bool {
        var value: AnyObject?
        let err = AXUIElementCopyAttributeValue(element, kAXEnabledAttribute as CFString, &value)
        return err == .success ? (value as? Bool ?? false) : false
    }
}
