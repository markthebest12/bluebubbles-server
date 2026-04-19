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

    // MARK: - AX Tree Traversal (shared helpers)

    /// Generic attribute getter. Wraps `AXUIElementCopyAttributeValue` and returns
    /// the raw CF value (as `Any?`) on success, `nil` on failure. Callers downcast
    /// to the expected Swift type (`String`, `Bool`, `[AXUIElement]`, `AXUIElement`,
    /// etc.). The erased return type matches the heterogeneity of AX attributes —
    /// a single element may expose strings, numbers, arrays, and references.
    static func attribute(_ element: AXUIElement, _ key: String) -> Any? {
        var value: AnyObject?
        return AXUIElementCopyAttributeValue(element, key as CFString, &value) == .success
            ? (value as Any?)
            : nil
    }

    /// Walks the AX subtree rooted at `element` and returns the last (deepest-last
    /// in tree order) descendant for which `matching` returns `true`. Returns the
    /// root itself if it matches and no descendant matches later.
    ///
    /// Use this for "find the newest X" scans where AX tree order mirrors
    /// chronological or DOM order (e.g. message bubbles in Messages.app). For
    /// "find the first match" semantics, callers should use a different helper —
    /// this one intentionally keeps walking.
    ///
    /// `maxDepth` prevents runaway recursion on pathological trees. 25 is a safe
    /// default for Messages.app's window-to-bubble depth; callers with shallower
    /// trees can pass a smaller bound.
    ///
    /// - Parameter maxDepth: Maximum number of edges from `element` to any visited node.
    ///   `element` itself is at depth 0. `maxDepth: 25` visits up to 25 edges below
    ///   the root, which is safe for Messages.app's window-to-bubble depth.
    /// - Parameter skipRoot: When true, `matching` is not evaluated on `element` itself —
    ///   only on its descendants. Callers that know the root is a container (window, app,
    ///   menu bar) that cannot possibly match their predicate should pass `true` to avoid
    ///   one wasted predicate evaluation and any attribute fetches it triggers. Defaults
    ///   to `false` to preserve the original semantics (root-inclusive).
    static func findLastDescendant(
        _ element: AXUIElement,
        matching: (AXUIElement) -> Bool,
        maxDepth: Int = 25,
        skipRoot: Bool = false
    ) -> AXUIElement? {
        return walkLast(
            root: element,
            children: { attribute($0, kAXChildrenAttribute) as? [AXUIElement] ?? [] },
            matches: matching,
            maxDepth: maxDepth,
            skipRoot: skipRoot
        )
    }

    /// Messages.app-specific: find the last `AXGroup` with identifier `"Sticker"`
    /// in the subtree. This is the stable identifier for an iMessage bubble on
    /// Tahoe and later; the last match in tree order is the newest message.
    ///
    /// - Parameter maxDepth: See `findLastDescendant(_:matching:maxDepth:skipRoot:)`.
    ///   Default 25 suits Messages.app's typical tree depth.
    /// - Parameter skipRoot: Forwarded to `findLastDescendant`. Typical callers pass the
    ///   focused window or an app element as `element`, neither of which can match the
    ///   Sticker predicate — passing `true` skips one predicate evaluation per call.
    static func findLastStickerGroup(in element: AXUIElement, maxDepth: Int = 25, skipRoot: Bool = false) -> AXUIElement? {
        return findLastDescendant(element, matching: { candidate in
            let role = attribute(candidate, kAXRoleAttribute) as? String ?? ""
            let ident = attribute(candidate, kAXIdentifierAttribute) as? String ?? ""
            return role == "AXGroup" && ident == "Sticker"
        }, maxDepth: maxDepth, skipRoot: skipRoot)
    }

    // MARK: - Pure traversal helper (testable)

    /// Pure, generic version of `findLastDescendant` with the AX dependency factored
    /// out via a `children` closure. The AXUIElement-facing API delegates here; tests
    /// exercise this directly with plain Swift values (e.g. a struct tree) to verify
    /// traversal order, depth bounds, predicate semantics, and `skipRoot` behavior
    /// without needing to construct AX tree fixtures.
    ///
    /// **Internal: exposed module-wide for `@testable import ax_helper` only.**
    /// Production code should use `findLastDescendant(_:matching:maxDepth:skipRoot:)`;
    /// this helper is a testing surface, not a stable API.
    ///
    /// Semantics:
    /// - Visits `root` first (if `skipRoot == false`), then children in order,
    ///   recursively. Later matches overwrite earlier ones, so the result is the
    ///   last match in DFS tree order.
    /// - `maxDepth` is the maximum number of edges from `root`. `root` itself is at
    ///   depth 0; children are at depth 1; etc. Nodes at or beyond `maxDepth` edges
    ///   are not visited.
    /// - Returns `nil` if no visited node matches.
    static func walkLast<T>(
        root: T,
        children: (T) -> [T],
        matches: (T) -> Bool,
        maxDepth: Int = 25,
        skipRoot: Bool = false
    ) -> T? {
        return walkLastRecursive(
            node: root,
            children: children,
            matches: matches,
            depth: 0,
            maxDepth: maxDepth,
            skipRoot: skipRoot
        )
    }

    // MARK: - Private

    private static func walkLastRecursive<T>(
        node: T,
        children: (T) -> [T],
        matches: (T) -> Bool,
        depth: Int,
        maxDepth: Int,
        skipRoot: Bool
    ) -> T? {
        guard depth < maxDepth else { return nil }
        // Skip root-level predicate evaluation when requested. Children are still
        // walked normally — skipRoot is scoped to the current call's root only.
        var best: T? = (skipRoot && depth == 0) ? nil : (matches(node) ? node : nil)
        for k in children(node) {
            if let found = walkLastRecursive(
                node: k,
                children: children,
                matches: matches,
                depth: depth + 1,
                maxDepth: maxDepth,
                skipRoot: false  // only the original root is skippable
            ) {
                best = found
            }
        }
        return best
    }

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
