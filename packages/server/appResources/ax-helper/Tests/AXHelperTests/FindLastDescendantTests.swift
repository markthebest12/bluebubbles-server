import Foundation
import Testing

// Import the executable's internal namespace. The test target compiles
// alongside the executable target's sources; `AXHelper` is resolved at link
// time because the executable sources are non-main-attribute top-level types.
@testable import ax_helper

// MARK: - Test tree fixture

/// Plain-Swift tree node used to exercise `AXHelper.walkLast` without requiring
/// a live `AXUIElement`. Each node has a unique `id` so tests can verify
/// traversal order (not just "a match was found"). Children are declared
/// in visit order — `walkLast` walks them left-to-right.
///
/// Built as a class (not a struct) so nested nodes can reference the same
/// instance by identity if ever needed; the tests only compare by `id` so
/// either would work, but a reference type avoids a few `let`-dance gymnastics
/// when constructing deep trees inline.
private final class TestNode {
    let id: Int
    let children: [TestNode]
    init(_ id: Int, _ children: [TestNode] = []) {
        self.id = id
        self.children = children
    }
}

private func kids(_ n: TestNode) -> [TestNode] { n.children }

@Suite("AXHelper.walkLast traversal")
struct FindLastDescendantTests {

    // MARK: - Predicate & ordering

    @Test("No match returns nil")
    func noMatchReturnsNil() {
        let tree = TestNode(1, [TestNode(2), TestNode(3, [TestNode(4)])])
        let result = AXHelper.walkLast(
            root: tree,
            children: kids,
            matches: { _ in false },
            maxDepth: 10,
            skipRoot: false
        )
        #expect(result == nil)
    }

    @Test("Root-only match is returned when no descendants match")
    func rootMatchReturnedWhenNoDescendantMatches() {
        let tree = TestNode(42, [TestNode(1), TestNode(2)])
        let result = AXHelper.walkLast(
            root: tree,
            children: kids,
            matches: { $0.id == 42 },
            maxDepth: 10,
            skipRoot: false
        )
        #expect(result?.id == 42)
    }

    @Test("Returns last match in DFS tree order when multiple descendants match")
    func lastMatchInDFSOrderWins() {
        // Pre-order DFS visits: 1, 2, 5 (first), 3, 6 (second), 4.
        // All three of {5, 6, 7} set .isMatch via a distinct marker id >= 100.
        //   root
        //   ├─ 2
        //   │  └─ 100   <- match A (first)
        //   ├─ 3
        //   │  └─ 101   <- match B (second, should win)
        //   └─ 4
        let tree = TestNode(1, [
            TestNode(2, [TestNode(100)]),
            TestNode(3, [TestNode(101)]),
            TestNode(4)
        ])
        let result = AXHelper.walkLast(
            root: tree,
            children: kids,
            matches: { $0.id >= 100 },
            maxDepth: 10,
            skipRoot: false
        )
        #expect(result?.id == 101)
    }

    @Test("Deepest last match wins over earlier sibling match")
    func deeperLaterMatchWinsOverShallower() {
        // Earlier match at depth 1 (id=100) must be overwritten by a later,
        // deeper match at depth 3 (id=101) reached via the second child.
        //   root
        //   ├─ 100        <- depth 1, match A
        //   └─ 2
        //      └─ 3
        //         └─ 101  <- depth 3, match B (should win)
        let tree = TestNode(1, [
            TestNode(100),
            TestNode(2, [TestNode(3, [TestNode(101)])])
        ])
        let result = AXHelper.walkLast(
            root: tree,
            children: kids,
            matches: { $0.id >= 100 },
            maxDepth: 10,
            skipRoot: false
        )
        #expect(result?.id == 101)
    }

    @Test("Earlier match is not overwritten by later non-match")
    func earlierMatchPreservedWhenLaterSiblingsDoNotMatch() {
        //   root
        //   ├─ 100        <- match (should win)
        //   ├─ 2
        //   └─ 3
        let tree = TestNode(1, [TestNode(100), TestNode(2), TestNode(3)])
        let result = AXHelper.walkLast(
            root: tree,
            children: kids,
            matches: { $0.id == 100 },
            maxDepth: 10,
            skipRoot: false
        )
        #expect(result?.id == 100)
    }

    // MARK: - Depth bounds

    @Test("Nodes beyond maxDepth are not visited")
    func respectsMaxDepth() {
        // Chain: root (depth 0) -> 2 (depth 1) -> 3 (depth 2) -> 100 (depth 3).
        // With maxDepth=2, only root and 2 are visited. The match at depth 3
        // must NOT be found; result is nil.
        let tree = TestNode(1, [TestNode(2, [TestNode(3, [TestNode(100)])])])
        let result = AXHelper.walkLast(
            root: tree,
            children: kids,
            matches: { $0.id == 100 },
            maxDepth: 2,
            skipRoot: false
        )
        #expect(result == nil)
    }

    @Test("maxDepth of 0 yields nil even if root matches")
    func maxDepthZeroReturnsNilEvenWhenRootMatches() {
        // `maxDepth` is a strict upper bound on `depth` — with maxDepth=0, the
        // initial `depth < maxDepth` guard fails immediately and nothing is
        // visited. Root match is ignored. This matches the pre-existing
        // AXUIElement semantics (a callable bound of 0 = "do nothing").
        let tree = TestNode(100)
        let result = AXHelper.walkLast(
            root: tree,
            children: kids,
            matches: { _ in true },
            maxDepth: 0,
            skipRoot: false
        )
        #expect(result == nil)
    }

    @Test("Match exactly at maxDepth boundary is found; one past is not")
    func maxDepthBoundaryInclusive() {
        // Chain: 1 -> 2 -> 3 -> 4. maxDepth=3 visits depths 0..2 (nodes 1, 2, 3).
        // maxDepth=4 visits depths 0..3 (nodes 1, 2, 3, 4).
        let deep = TestNode(1, [TestNode(2, [TestNode(3, [TestNode(4)])])])

        let atBoundary = AXHelper.walkLast(
            root: deep,
            children: kids,
            matches: { $0.id == 3 },
            maxDepth: 3,
            skipRoot: false
        )
        #expect(atBoundary?.id == 3)

        let justPast = AXHelper.walkLast(
            root: deep,
            children: kids,
            matches: { $0.id == 4 },
            maxDepth: 3,
            skipRoot: false
        )
        #expect(justPast == nil)

        let included = AXHelper.walkLast(
            root: deep,
            children: kids,
            matches: { $0.id == 4 },
            maxDepth: 4,
            skipRoot: false
        )
        #expect(included?.id == 4)
    }

    // MARK: - skipRoot semantics (#58)

    @Test("skipRoot=false honours a root match")
    func skipRootFalseHonoursRootMatch() {
        let tree = TestNode(100, [TestNode(2), TestNode(3)])
        let result = AXHelper.walkLast(
            root: tree,
            children: kids,
            matches: { $0.id == 100 },
            maxDepth: 10,
            skipRoot: false
        )
        #expect(result?.id == 100)
    }

    @Test("skipRoot=true ignores a root match")
    func skipRootTrueIgnoresRootMatch() {
        // Root (id=100) would match, but skipRoot suppresses it. No descendant
        // matches, so the result is nil.
        let tree = TestNode(100, [TestNode(2), TestNode(3)])
        let result = AXHelper.walkLast(
            root: tree,
            children: kids,
            matches: { $0.id == 100 },
            maxDepth: 10,
            skipRoot: true
        )
        #expect(result == nil)
    }

    @Test("skipRoot=true still walks children and returns descendant match")
    func skipRootTrueStillWalksChildren() {
        // Root (id=100) would match but is skipped; descendant (id=100 also)
        // IS returned because skipRoot only applies to the entry-level root.
        let tree = TestNode(100, [
            TestNode(2),
            TestNode(3, [TestNode(100)])  // the real target
        ])
        let result = AXHelper.walkLast(
            root: tree,
            children: kids,
            matches: { $0.id == 100 },
            maxDepth: 10,
            skipRoot: true
        )
        #expect(result?.id == 100)
        // To be sure this isn't the root being returned by accident, use
        // identity on the nested node: rebuild with distinct markers.
        let sentinel = TestNode(999)
        let tree2 = TestNode(100, [TestNode(2), TestNode(3, [sentinel])])
        let result2 = AXHelper.walkLast(
            root: tree2,
            children: kids,
            matches: { $0.id == 999 || $0.id == 100 },
            maxDepth: 10,
            skipRoot: true
        )
        #expect(result2?.id == 999)
    }

    @Test("skipRoot does not cascade into descendant recursion")
    func skipRootDoesNotCascade() {
        // skipRoot should ONLY skip the original entry root. Every descendant
        // must have its predicate evaluated normally. Here, the only match is a
        // direct child of the root — if skipRoot incorrectly cascaded, it would
        // suppress that child's match and return nil.
        let tree = TestNode(1, [TestNode(100), TestNode(2)])
        let result = AXHelper.walkLast(
            root: tree,
            children: kids,
            matches: { $0.id == 100 },
            maxDepth: 10,
            skipRoot: true
        )
        #expect(result?.id == 100)
    }

    // MARK: - Edge cases

    @Test("Empty children tree with matching root")
    func leafRootMatches() {
        let leaf = TestNode(42)
        let result = AXHelper.walkLast(
            root: leaf,
            children: kids,
            matches: { $0.id == 42 },
            maxDepth: 10,
            skipRoot: false
        )
        #expect(result?.id == 42)
    }

    @Test("Predicate evaluated exactly once per visited node (children)")
    func predicateCalledOncePerVisitedNode() {
        // Track how many times the predicate is invoked to guard against a
        // regression that double-evaluates (e.g. root check then children
        // check).
        let tree = TestNode(1, [TestNode(2), TestNode(3, [TestNode(4)])])
        var calls = 0
        _ = AXHelper.walkLast(
            root: tree,
            children: kids,
            matches: { _ in calls += 1; return false },
            maxDepth: 10,
            skipRoot: false
        )
        #expect(calls == 4)  // 1 + 2 + 3 + 4
    }

    @Test("skipRoot=true skips exactly one predicate evaluation")
    func skipRootSavesOnePredicateCall() {
        let tree = TestNode(1, [TestNode(2), TestNode(3, [TestNode(4)])])
        var callsFull = 0
        _ = AXHelper.walkLast(
            root: tree,
            children: kids,
            matches: { _ in callsFull += 1; return false },
            maxDepth: 10,
            skipRoot: false
        )

        var callsSkipped = 0
        _ = AXHelper.walkLast(
            root: tree,
            children: kids,
            matches: { _ in callsSkipped += 1; return false },
            maxDepth: 10,
            skipRoot: true
        )

        #expect(callsFull == 4)
        #expect(callsSkipped == 3)
        #expect(callsFull - callsSkipped == 1)
    }
}
