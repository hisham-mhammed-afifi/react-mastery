# Part 2, Chapter 4: React Fiber Architecture

## What You Will Learn

- Explain why the old stack reconciler's synchronous, uninterruptible rendering was insufficient for complex applications
- Describe a Fiber node's key fields and explain how `child`, `sibling`, and `return` pointers form a linked-list tree
- Trace how double buffering (the current tree and the work-in-progress tree) enables atomic UI updates
- Walk through the work loop's `beginWork` and `completeWork` phases to explain how Fiber processes updates incrementally
- Explain time slicing and how React yields control to the browser after approximately 5ms of work
- Map React's lane-based priority system to concrete update types and explain how `startTransition` leverages low-priority lanes
- Draw a complete Fiber tree for a given component hierarchy, including all pointer relationships

---

## 4.1 Why React Needed Fiber (The Problem with the Old Stack Reconciler)

React versions 0.x through 15.x used a **stack reconciler**: a synchronous, recursive algorithm that traversed the entire component tree in a single, uninterruptible pass. When a state update triggered re-rendering, the reconciler called component render methods recursively, compared old and new element trees, and applied DOM mutations, all within one continuous block of main-thread execution.

For small component trees, this approach was fast enough to be imperceptible. For large trees (hundreds or thousands of components), a single reconciliation pass could block the main thread for tens or even hundreds of milliseconds. During that time, the browser could not process user input, run animations, or repaint the screen.

### The Specific Problems

**Dropped frames and jank.** The browser targets 16.67ms per frame (60fps). If reconciliation takes 50ms, at least two frames are dropped. Users perceive this as stutter during scrolling, typing, or animations.

**Inability to interrupt.** Once the stack reconciler began processing an update, it could not pause. If a high-priority user interaction (a keypress, a click) arrived during a low-priority update (a background data refresh), the interaction had to wait until the reconciliation completed. The user experienced input lag.

**All-or-nothing execution.** The reconciler could not break work into smaller chunks, spread work across multiple frames, or abandon stale work. If a component triggered a re-render while a previous render was in progress, the previous work was wasted.

```javascript
// The stack reconciler's problem, conceptualized:
function stackReconcile(component) {
  // This is ONE synchronous, blocking function call.
  // If the tree has 10,000 nodes, this blocks the main thread
  // for however long it takes to process all 10,000.
  const element = component.render();
  for (const child of element.children) {
    stackReconcile(child); // Recursive, uses the JS call stack
    // CANNOT pause here, CANNOT check if the user typed something,
    // CANNOT yield to the browser for painting
  }
  applyDOMUpdates(component);
}
```

### The Insight: Reimplement the Call Stack

Andrew Clark's original Fiber architecture document articulated the core insight: the stack reconciler's limitation was its dependence on the JavaScript call stack. The call stack is a runtime structure that the program cannot inspect, pause, or resume. Once a function call begins, it runs to completion.

Fiber replaces the implicit call stack with an explicit, heap-allocated data structure: the fiber tree. Each fiber node is a "virtual stack frame" that React controls entirely. Because fiber nodes exist as objects in memory (on the heap, not on the call stack), React can:

- **Pause** work after processing a fiber and yield to the browser
- **Resume** work later by picking up where it left off
- **Abort** work if a higher-priority update arrives
- **Reuse** completed work from a previous render if nothing changed

Fiber was announced in April 2017 and shipped with React 16.0 in September 2017.

---

## 4.2 What a Fiber Node Is (Unit of Work)

A fiber node is a JavaScript object that represents a single unit of work in React's rendering pipeline. There is one fiber node for every component instance, every host DOM element, and every fragment in the application. The fiber persists across renders (it is not recreated each time like React elements), accumulating state, effects, and priority information.

### Key Fields

```javascript
// Simplified Fiber node structure (conceptual, not actual React source)
{
  // Identity
  tag: 0,                    // FunctionComponent=0, ClassComponent=1,
                             // HostComponent=5, HostText=6, Fragment=7, etc.
  type: UserProfile,         // The function, class, or string ("div")
  key: "user-42",            // Reconciliation key (from JSX)

  // Tree structure (linked list)
  child: FiberNode,          // First child
  sibling: FiberNode,        // Next sibling
  return: FiberNode,         // Parent

  // Double buffering
  alternate: FiberNode,      // Counterpart in the other tree

  // State and props
  pendingProps: { id: 42 },  // Props for the current render
  memoizedProps: { id: 41 }, // Props from the last committed render
  memoizedState: { ... },    // State from the last committed render
                             // (for hooks: linked list of hook states)

  // Output
  stateNode: HTMLDivElement, // The actual DOM node (host) or class instance

  // Effects
  flags: 0,                  // Bitmask: Placement, Update, Deletion, etc.
  subtreeFlags: 0,           // Aggregated flags from children

  // Scheduling
  lanes: 0,                  // Pending work priority (bitmask)
  childLanes: 0,             // Aggregated lanes from children
}
```

### Tag Values

The `tag` field identifies what kind of fiber this is, which determines how `beginWork` and `completeWork` process it:

| Tag | Name | Description |
|-----|------|-------------|
| 0 | FunctionComponent | A function that returns elements |
| 1 | ClassComponent | A class extending React.Component |
| 3 | HostRoot | The root of the React tree |
| 5 | HostComponent | A DOM element (`"div"`, `"span"`, etc.) |
| 6 | HostText | A text node |
| 7 | Fragment | A React.Fragment |
| 11 | ForwardRef | A component wrapped in forwardRef |
| 12 | MemoComponent | A component wrapped in React.memo |
| 13 | SuspenseComponent | A Suspense boundary |

### stateNode

For host components (tag 5), `stateNode` holds a reference to the actual DOM element. For class components (tag 1), it holds the class instance. For function components (tag 0), `stateNode` is `null` because function components have no instances.

---

## 4.3 The Fiber Tree Structure (child, sibling, return pointers)

Fiber does not use a traditional tree structure with an array of children per node. Instead, it uses a **linked list** with three pointers per node:

- **`child`**: Points to the fiber's **first** child only
- **`sibling`**: Points to the fiber's **next sibling** in the parent's child list
- **`return`**: Points to the fiber's **parent**

This design enables efficient traversal without arrays or recursion:

```
Component hierarchy:
  <App>
    <Header />
    <Main>
      <Sidebar />
      <Content />
    </Main>
    <Footer />
  </App>

Fiber linked-list tree:

  App
  │
  child
  │
  ▼
  Header ──sibling──► Main ──sibling──► Footer
                      │
                      child
                      │
                      ▼
                      Sidebar ──sibling──► Content

  Every node has a "return" pointer back to its parent:
    Header.return = App
    Main.return = App
    Footer.return = App
    Sidebar.return = Main
    Content.return = Main
```

### Why a Linked List Instead of an Array

The linked-list structure has two advantages for Fiber's work loop:

1. **Constant-time insertion and removal.** Adding or removing a child does not require shifting array elements. This matters during reconciliation when children are added, removed, or reordered.

2. **Stateless traversal.** The work loop can traverse the entire tree using only the current fiber pointer and three simple rules: go to `child` (depth-first), go to `sibling` (breadth within a level), go to `return` (walk up). No stack, no queue, no index. The traversal can be paused at any fiber and resumed later by simply storing the current pointer.

> **See Also:** Part 1, Chapter 5, Section 5.1 for how linked data structures work via prototype chains and pointer-based traversal.

---

## 4.4 Current Tree vs Work-In-Progress Tree (Double Buffering)

React maintains two fiber trees simultaneously:

1. **The current tree**: represents what is currently rendered on screen. The root fiber's `current` pointer references this tree.
2. **The work-in-progress (WIP) tree**: being built during the render phase to represent the next version of the UI.

Every fiber in the current tree has an `alternate` field pointing to its counterpart in the WIP tree, and vice versa. This bidirectional link enables React to reuse fibers across renders rather than creating new objects.

```
              Current Tree                    Work-In-Progress Tree
              (on screen)                     (being computed)

              ┌─────┐          alternate      ┌─────┐
              │ App │ ◄─────────────────────► │ App │
              └──┬──┘                         └──┬──┘
                 │                               │
              ┌──┴───┐                        ┌──┴───┐
              │Header│ ◄──────────────────►   │Header│
              └──────┘                        └──────┘
```

### The Double-Buffering Metaphor

This technique is borrowed from computer graphics. In double-buffered rendering, a graphics engine draws the next frame into an invisible back buffer while the current frame is displayed. Once the back buffer is complete, the buffers are swapped atomically: the back buffer becomes the front buffer, and the user sees the new frame with no flicker or partial updates.

React's commit phase performs this swap. After the render phase completes the WIP tree (with all necessary changes computed but no DOM mutations applied), the commit phase:

1. Applies all DOM mutations in one synchronous batch
2. Swaps the root pointer so the WIP tree becomes the new current tree
3. The old current tree becomes the new WIP tree for the next update (its fibers will be reused via `alternate`)

This guarantees that the user never sees a partially updated UI. Either the old state is displayed (during the render phase) or the new state is displayed (after the commit phase). There is no in-between.

### Fiber Reuse via `alternate`

When React begins rendering an update, it does not create an entirely new fiber tree from scratch. For each fiber in the current tree, it checks the `alternate`:

```javascript
// Conceptual fiber cloning logic
function createWorkInProgress(current, pendingProps) {
  let workInProgress = current.alternate;

  if (workInProgress === null) {
    // First render: create a new fiber
    workInProgress = createFiber(current.tag, pendingProps, current.key);
    workInProgress.type = current.type;
    workInProgress.stateNode = current.stateNode;
    workInProgress.alternate = current;
    current.alternate = workInProgress;
  } else {
    // Subsequent render: reuse the existing alternate fiber
    workInProgress.pendingProps = pendingProps;
    workInProgress.flags = 0;        // Reset effects
    workInProgress.subtreeFlags = 0;
    // type, stateNode, child/sibling/return are reused
  }

  // Copy over fields that carry forward
  workInProgress.lanes = current.lanes;
  workInProgress.childLanes = current.childLanes;
  workInProgress.memoizedState = current.memoizedState;

  return workInProgress;
}
```

This reuse strategy minimizes garbage collection pressure. Instead of creating thousands of new objects per render, React updates existing objects in place.

---

## 4.5 Work Loop: How Fiber Processes Updates

The work loop is the algorithm that drives the render phase. It processes the fiber tree one node at a time, using two functions: `beginWork` (going down the tree) and `completeWork` (going back up).

### The Loop

```javascript
// Simplified work loop (conceptual)
function workLoopConcurrent() {
  // Process fibers until there are none left OR time runs out
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}

function performUnitOfWork(unitOfWork) {
  const next = beginWork(unitOfWork);  // Process this fiber, return first child

  if (next !== null) {
    // This fiber has children; move down to the first child
    workInProgress = next;
  } else {
    // This fiber is a leaf; complete it and walk sideways/up
    completeUnitOfWork(unitOfWork);
  }
}
```

### beginWork: Walking Down

`beginWork` is called on each fiber as the work loop descends the tree. Its responsibilities:

1. Compare `pendingProps` to `memoizedProps`. If identical and there is no pending work on this fiber's lanes, **bail out** early (skip the entire subtree).
2. For function components: call the component function with the new props, producing a new element tree.
3. For class components: call `render()` with new props and state.
4. For host components: process the children elements.
5. **Reconcile children**: compare the new element children against the current fiber's children, creating, updating, or marking fibers for deletion. This is where the diffing algorithm from Chapter 3 executes.
6. Return the first child fiber (or `null` if this is a leaf node).

### completeWork: Walking Up

`completeWork` is called on each fiber as the work loop ascends back up the tree. Its responsibilities:

1. For host components: create the actual DOM element (but do not insert it into the document). Diff the old and new props and record attribute changes.
2. Bubble up `subtreeFlags` and `childLanes` from children to the parent. This enables React to skip entire subtrees during commit if they have no effects.
3. If this fiber has a sibling, the work loop moves to the sibling (and begins descending again). If not, it moves to the parent (and completes that).

### Traversal Visualization

```javascript
// Given this component tree:
// <App>
//   <Header />
//   <Main>
//     <Sidebar />
//     <Content />
//   </Main>
// </App>

// The work loop visits fibers in this order:
// 1. beginWork(App)        → returns Header (first child)
// 2. beginWork(Header)     → returns null (leaf)
// 3. completeWork(Header)  → has sibling Main
// 4. beginWork(Main)       → returns Sidebar (first child)
// 5. beginWork(Sidebar)    → returns null (leaf)
// 6. completeWork(Sidebar) → has sibling Content
// 7. beginWork(Content)    → returns null (leaf)
// 8. completeWork(Content) → no sibling, walk up to Main
// 9. completeWork(Main)    → no sibling (Footer omitted), walk up to App
// 10. completeWork(App)    → root reached, render phase done
```

> **Common Mistake:** Developers sometimes assume that React "re-renders the entire tree" on every state change. In practice, `beginWork`'s bail-out optimization means that fibers with unchanged props and no pending work in their lanes are skipped entirely. Only the fibers on the path from the root to the changed component (and the changed component's subtree) are processed.

---

## 4.6 Time Slicing: Breaking Rendering Into Chunks

Time slicing is the mechanism by which Fiber yields control to the browser between units of work. Instead of processing the entire fiber tree synchronously, the concurrent work loop checks whether it has exceeded its time budget after each unit of work:

```javascript
function workLoopConcurrent() {
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
  // If workInProgress is not null, there is still work to do.
  // React will schedule a continuation via the scheduler.
}

function shouldYield() {
  // Returns true if the current time slice (~5ms) has been exhausted
  return getCurrentTime() >= deadline;
}
```

When `shouldYield()` returns `true`, the work loop exits. React stores the `workInProgress` pointer (the next fiber to process) and returns control to the browser. The browser can then:

- Process pending user input events
- Run `requestAnimationFrame` callbacks
- Perform layout and paint

React schedules a continuation using `MessageChannel` (which posts a macrotask), and the work loop resumes from exactly where it left off on the next available frame.

### Synchronous vs Concurrent Work Loops

React maintains two versions of the work loop:

```javascript
// Synchronous: used for urgent updates (SyncLane)
function workLoopSync() {
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress); // No yield check
  }
}

// Concurrent: used for non-urgent updates (TransitionLane, DefaultLane)
function workLoopConcurrent() {
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}
```

Urgent updates (discrete user interactions like clicks) use the synchronous loop because users expect immediate feedback. Non-urgent updates (transitions, data fetching results) use the concurrent loop, which can be interrupted.

---

## 4.7 Priority Lanes: Not All Updates Are Equal

React's lane system assigns a priority level to every update. Lanes are represented as a 31-bit bitmask (fitting in a single JavaScript integer), where each bit represents a specific priority level. React uses bitwise operations for O(1) priority merging and comparison.

### The Lane Hierarchy

| Priority | Lane | Typical Source |
|----------|------|---------------|
| Highest | **SyncLane** | Discrete user events: clicks, key presses, form submissions |
| High | **InputContinuousLane** | Continuous interactions: scrolling, mouse movement, dragging |
| Normal | **DefaultLane** | Standard `setState` calls, data fetching completions |
| Low | **TransitionLanes** (16 lanes) | `startTransition` updates, non-urgent UI changes |
| Lowest | **IdleLane** | Background work, offscreen preparation |

### How Lanes Drive Scheduling

Each fiber has a `lanes` field indicating what work is pending on it, and a `childLanes` field aggregating pending lanes from its children. The fiber root maintains a set of all pending lanes across the entire tree.

When the scheduler decides what to work on next, it selects the highest-priority pending lane set and processes only updates tagged with those lanes. Lower-priority updates are deferred.

```javascript
// Conceptual lane selection (simplified)
function getNextLanes(root) {
  const pendingLanes = root.pendingLanes;

  if (pendingLanes & SyncLane) return SyncLane;
  if (pendingLanes & InputContinuousLane) return InputContinuousLane;
  if (pendingLanes & DefaultLane) return DefaultLane;
  if (pendingLanes & TransitionLanes) {
    return getHighestPriorityTransitionLane(pendingLanes);
  }
  if (pendingLanes & IdleLane) return IdleLane;

  return NoLanes; // Nothing to do
}
```

### Lane Batching

Multiple updates with the same lane are batched into a single render pass. This is how React 18's automatic batching works: all `setState` calls within the same event handler are assigned the same lane and processed together.

```javascript
function handleClick() {
  setName("Alice");   // Tagged with SyncLane
  setAge(30);         // Tagged with SyncLane (same event)
  setCity("Portland"); // Tagged with SyncLane (same event)
  // All three are batched into one render because they share a lane
}
```

> **See Also:** Part 1, Chapter 6, Section 6.4 for why React batches state updates and its connection to the event loop.

---

## 4.8 How `startTransition` Uses Priority Lanes

`startTransition` is the developer-facing API for marking updates as non-urgent. Internally, it assigns updates to a TransitionLane instead of the default SyncLane or DefaultLane.

```javascript
import { useState, useTransition } from "react";

function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isPending, startTransition] = useTransition();

  function handleChange(e) {
    const value = e.target.value;

    // Urgent: update the input immediately (SyncLane)
    setQuery(value);

    // Non-urgent: update the results list (TransitionLane)
    startTransition(() => {
      const filtered = expensiveFilter(allProducts, value);
      setResults(filtered);
    });
  }

  return (
    <div>
      <input value={query} onChange={handleChange} />
      {isPending && <div className="spinner" />}
      <ResultsList results={results} />
    </div>
  );
}
```

### The Priority Split in Action

When the user types "a":

1. `setQuery("a")` is assigned **SyncLane**. React processes this immediately using the synchronous work loop. The input field updates within the same frame.

2. `setResults(filtered)` inside `startTransition` is assigned a **TransitionLane**. React schedules this as a separate render pass using the concurrent work loop.

3. If the user types "ab" before the transition render completes, React **interrupts** the in-progress transition (which was filtering for "a"), discards that work, and starts a new transition render for "ab". The stale "a" results are never committed to the DOM.

4. The `isPending` flag is `true` from the moment the transition starts until it commits, allowing the spinner to display.

### React 19: Async Transitions (Actions)

React 19 extended `startTransition` to accept async functions:

```javascript
function SaveButton({ data }) {
  const [isPending, startTransition] = useTransition();

  async function handleSave() {
    startTransition(async () => {
      // isPending is true throughout this entire async flow
      await saveToServer(data);
      // Update local state after the server confirms
      setStatus("saved");
    });
  }

  return (
    <button onClick={handleSave} disabled={isPending}>
      {isPending ? "Saving..." : "Save"}
    </button>
  );
}
```

The `isPending` state remains `true` for the duration of the async function, providing a built-in loading indicator without additional state management.

> **Common Mistake:** Developers sometimes wrap every state update in `startTransition`, assuming it will improve performance across the board. Transitions add scheduling overhead and delay the update. They should be used only for updates where the user does not expect immediate visual feedback: search results, page transitions, non-critical list updates. Never wrap direct user input updates (typing, toggling) in a transition, as this introduces perceptible input lag.

---

## 4.9 Exercise: Draw the Fiber Tree for a Given Component Hierarchy

### Problem Statement

Given the following component hierarchy, draw the complete fiber tree showing all `child`, `sibling`, and `return` pointers. For each fiber, identify the `tag` (FunctionComponent, HostComponent, or HostText) and the `type`.

```javascript
function App() {
  return (
    <div className="app">
      <Navigation />
      <main>
        <article>
          <h1>React Fiber</h1>
          <p>A deep dive into architecture.</p>
        </article>
        <Sidebar />
      </main>
    </div>
  );
}

function Navigation() {
  return (
    <nav>
      <a href="/">Home</a>
      <a href="/about">About</a>
    </nav>
  );
}

function Sidebar() {
  return (
    <aside>
      <h3>Related</h3>
    </aside>
  );
}
```

### Solution

First, expand all components to their host element output, then draw the fiber tree.

```
Fiber Tree (with pointer types labeled):

HostRoot (tag: 3)
  │
  child
  │
  ▼
FunctionComponent: App (tag: 0)
  │
  child
  │
  ▼
HostComponent: div.app (tag: 5)
  │
  child
  │
  ▼
FunctionComponent: Navigation (tag: 0) ──sibling──► HostComponent: main (tag: 5)
  │                                                    │
  child                                                child
  │                                                    │
  ▼                                                    ▼
HostComponent: nav (tag: 5)                          HostComponent: article (tag: 5) ──sibling──► FunctionComponent: Sidebar (tag: 0)
  │                                                    │                                            │
  child                                                child                                        child
  │                                                    │                                            │
  ▼                                                    ▼                                            ▼
HostComponent: a[/] (tag: 5) ──sibling──►          HostComponent: h1 (tag: 5) ──sibling──►      HostComponent: aside (tag: 5)
  │                          HostComponent: a[/about]    │                   HostComponent: p        │
  child                        (tag: 5)                  child                 (tag: 5)              child
  │                              │                       │                       │                   │
  ▼                              child                   ▼                       child               ▼
HostText:                        │                     HostText:                 │                 HostComponent: h3 (tag: 5)
"Home"                           ▼                     "React Fiber"             ▼                   │
(tag: 6)                       HostText:               (tag: 6)               HostText:             child
                               "About"                                        "A deep dive..."      │
                               (tag: 6)                                       (tag: 6)              ▼
                                                                                                  HostText:
                                                                                                  "Related"
                                                                                                  (tag: 6)
```

**Return pointers** (not drawn for clarity, but every fiber's `return` points to its parent):
- `Navigation.return = div.app`
- `main.return = div.app`
- `nav.return = Navigation`
- `article.return = main`
- `Sidebar.return = main`
- All text nodes' `return` points to their parent host element.

### Traversal Order (beginWork / completeWork)

Using the work loop algorithm from Section 4.5:

| Step | Action | Fiber |
|------|--------|-------|
| 1 | beginWork | HostRoot |
| 2 | beginWork | App (FunctionComponent) |
| 3 | beginWork | div.app (HostComponent) |
| 4 | beginWork | Navigation (FunctionComponent) |
| 5 | beginWork | nav |
| 6 | beginWork | a[/] |
| 7 | beginWork | "Home" (text, leaf) |
| 8 | completeWork | "Home" |
| 9 | completeWork | a[/] → has sibling a[/about] |
| 10 | beginWork | a[/about] |
| 11 | beginWork | "About" (leaf) |
| 12 | completeWork | "About" |
| 13 | completeWork | a[/about] → no sibling, return to nav |
| 14 | completeWork | nav → no sibling, return to Navigation |
| 15 | completeWork | Navigation → has sibling main |
| 16 | beginWork | main |
| 17 | beginWork | article |
| 18 | beginWork | h1 |
| 19 | beginWork | "React Fiber" (leaf) |
| 20 | completeWork | "React Fiber" |
| 21 | completeWork | h1 → has sibling p |
| 22 | beginWork | p |
| 23 | beginWork | "A deep dive..." (leaf) |
| 24 | completeWork | "A deep dive..." |
| 25 | completeWork | p → no sibling, return to article |
| 26 | completeWork | article → has sibling Sidebar |
| 27 | beginWork | Sidebar (FunctionComponent) |
| 28 | beginWork | aside |
| 29 | beginWork | h3 |
| 30 | beginWork | "Related" (leaf) |
| 31 | completeWork | "Related" |
| 32 | completeWork | h3 → no sibling, return to aside |
| 33 | completeWork | aside → no sibling, return to Sidebar |
| 34 | completeWork | Sidebar → no sibling, return to main |
| 35 | completeWork | main → no sibling, return to div.app |
| 36 | completeWork | div.app → no sibling, return to App |
| 37 | completeWork | App → no sibling, return to HostRoot |
| 38 | completeWork | HostRoot → render phase complete |

In concurrent mode, React can yield between any two steps. If time slicing interrupts at step 16, for example, React stores `workInProgress = main` and yields to the browser. On the next frame, it resumes at step 16 and continues from `main`.

### Key Takeaway

The fiber tree is a linked-list structure that mirrors the component hierarchy but replaces the implicit call stack with explicit, controllable pointers. Each fiber node can be processed independently (one unit of work), enabling React to pause, resume, and prioritize rendering. The `child`/`sibling`/`return` pointers enable depth-first traversal without recursion, and the `alternate` pointer enables double-buffered atomic updates. Understanding this structure makes React's concurrent features (time slicing, transitions, Suspense) mechanistically clear rather than magical.

---

## Chapter Summary

React Fiber replaces the stack reconciler's synchronous, uninterruptible rendering with an incremental, priority-aware architecture. Each fiber node is a unit of work in a heap-allocated linked-list tree, connected by `child`, `sibling`, and `return` pointers. The work loop processes fibers via `beginWork` (descending, reconciling) and `completeWork` (ascending, constructing DOM). Double buffering via the `alternate` field ensures atomic UI updates. Time slicing yields to the browser after approximately 5ms, and the lane-based priority system ensures urgent updates (user interactions) preempt non-urgent work (transitions). `startTransition` leverages low-priority lanes to keep the UI responsive during expensive state updates.

## Further Reading

- [React Fiber Architecture (Andrew Clark)](https://github.com/acdlite/react-fiber-architecture) — the original design document that defined Fiber's goals and approach
- [A Deep Dive into React Fiber (LogRocket)](https://blog.logrocket.com/deep-dive-react-fiber/) — detailed walkthrough of Fiber internals with source code references
- [How React Lanes Work (JavaScript in Plain English)](https://javascript.plainenglish.io/how-react-lanes-work-react-internal-deep-dive-2025-e4ac04d0534b) — in-depth explanation of the lane priority system
- [useTransition (React Documentation)](https://react.dev/reference/react/useTransition) — official API reference for transition-based priority management
- [Inside Fiber: An In-Depth Overview (ag-grid)](https://blog.ag-grid.com/inside-fiber-an-in-depth-overview-of-the-new-reconciliation-algorithm-in-react/) — comprehensive technical walkthrough with diagrams
- [The How and Why of React's Usage of Linked List in Fiber (angular.love)](https://angular.love/the-how-and-why-on-reacts-usage-of-linked-list-in-fiber-to-walk-the-components-tree/) — detailed analysis of why Fiber uses linked lists
