# Part 2, Chapter 7: React's Rules and Why They Exist

## What You Will Learn

- Explain why hooks must be called at the top level of a component and why conditional hook calls cause state corruption, with reference to the linked-list data structure
- Describe how React tracks hooks internally using a singly-linked list on `fiber.memoizedState` and the dispatcher pattern that differentiates mount from update
- Articulate what "pure rendering" means precisely: idempotent output, no mutation of non-local values, no side effects during the render phase
- Explain why Strict Mode calls component functions twice and how this surfaces impurity bugs and missing effect cleanup
- Enumerate the complete contract between the developer and React, including what the React Compiler assumes about component purity
- Intentionally violate each rule and predict the resulting behavior

---

## 7.1 Rules of Hooks: Why Call Order Matters

React hooks have two rules that appear simple but carry deep architectural significance:

1. **Only call hooks at the top level.** Do not call hooks inside loops, conditions, or nested functions.
2. **Only call hooks from React functions.** Call hooks from function components or custom hooks, not from regular JavaScript functions.

These rules exist because of how React identifies which hook is which.

### The Identification Problem

When a component calls `useState` three times, React must know which `useState` corresponds to which piece of state. Hooks do not have names or keys. React does not see variable names like `count` or `name`; it sees three anonymous `useState` calls. The only distinguishing factor is **call order**: the first `useState` call produces the first state, the second produces the second, and so on.

```javascript
function UserForm() {
  // Hook call #1: always first
  const [name, setName] = useState("");

  // Hook call #2: always second
  const [email, setEmail] = useState("");

  // Hook call #3: always third
  const [age, setAge] = useState(0);

  // React's internal view on mount:
  //   Hook #1 → { memoizedState: "", next: Hook#2 }
  //   Hook #2 → { memoizedState: "", next: Hook#3 }
  //   Hook #3 → { memoizedState: 0, next: null }

  // On re-render, React walks this list:
  //   1st useState call → reads Hook #1 → returns ""
  //   2nd useState call → reads Hook #2 → returns ""
  //   3rd useState call → reads Hook #3 → returns 0
}
```

If the call order changes between renders, each hook reads the wrong node. Hook #2 would read Hook #1's state, Hook #3 would read Hook #2's state, and the entire component's state would be corrupted.

### What Happens When You Call Hooks Conditionally

```javascript
// BROKEN: conditional hook call
function BrokenComponent({ showName }) {
  const [email, setEmail] = useState("");

  // This hook is only called when showName is true
  if (showName) {
    const [name, setName] = useState("");  // Hook #2 (sometimes)
  }

  const [age, setAge] = useState(0);       // Hook #2 or #3 (depends!)

  // When showName is true:
  //   Call #1: useState("") → Hook #1 (email)    ✓
  //   Call #2: useState("") → Hook #2 (name)     ✓
  //   Call #3: useState(0)  → Hook #3 (age)      ✓

  // When showName changes to false:
  //   Call #1: useState("") → Hook #1 (email)    ✓
  //   Call #2: useState(0)  → Hook #2 (name!)    ✗ age reads name's state!
  //   (Hook #3 is never read; its state is orphaned)
}
```

React detects this mismatch and throws an error: "Rendered fewer hooks than expected." But even before the error, the state has already been corrupted: `age` received `name`'s value because the linked list was walked sequentially and the conditional skip shifted all subsequent positions.

### Why Not Use Named Keys Instead?

Dan Abramov addressed this directly in his article "Why Do Hooks Rely on Call Order?" The call-order approach was chosen over alternatives (named keys, symbol-based identification) for several reasons:

- **No namespace collisions.** Two custom hooks can each call `useState` internally without coordinating names.
- **No boilerplate.** Developers do not need to invent unique identifiers for each hook.
- **Composability.** Custom hooks are just functions that call other hooks. There is no registration, no configuration, no key management. The call-order contract is the simplest design that enables unrestricted composition.

> **See Also:** Part 1, Chapter 3, Section 3.7 for building a mini `useState` using closures, which demonstrates the array-index tracking mechanism.

---

## 7.2 How React Tracks Hooks Internally (Linked List of Hook Nodes)

Each hook call creates (on mount) or reads (on update) a node in a singly-linked list stored on the component's fiber.

### The Hook Node Structure

```javascript
// Internal hook object (simplified from React source)
{
  memoizedState: any,       // The hook's stored value
                            // useState: the state value
                            // useEffect: the effect object
                            // useRef: the ref object { current: ... }
                            // useMemo: [cachedValue, dependencies]
  baseState: any,           // Base state for update calculations
  baseQueue: null,          // Pending low-priority updates
  queue: {                  // Update queue for this hook
    pending: null,          // Circular linked list of pending updates
    dispatch: Function,     // The setState / dispatch function
    lastRenderedState: any, // State from the last committed render
  },
  next: Hook | null,        // Pointer to the next hook in the list
}
```

### The Linked List on the Fiber

The fiber node has a `memoizedState` field. For function components, this field points to the head of the hook linked list:

```
Fiber {
  memoizedState ──► Hook#1 { memoizedState: "", next: ──► Hook#2 { memoizedState: "", next: ──► Hook#3 { memoizedState: 0, next: null } } }
}
```

### The Dispatcher Pattern

React uses a global dispatcher (`ReactCurrentDispatcher.current`) that is swapped between different implementations depending on the component's lifecycle phase:

```javascript
// Conceptual dispatcher mechanism (simplified)
const Dispatcher = {
  mount: {
    useState(initialValue) {
      // Create a new hook node, append to list, initialize state
      const hook = mountWorkInProgressHook();
      hook.memoizedState = initialValue;
      const dispatch = dispatchSetState.bind(null, currentFiber, hook.queue);
      return [hook.memoizedState, dispatch];
    },
    useEffect(create, deps) {
      const hook = mountWorkInProgressHook();
      hook.memoizedState = { create, destroy: undefined, deps };
      // Flag fiber for effect processing during commit
    },
  },

  update: {
    useState(initialValue) {
      // Walk to the next hook in the existing list, process updates
      const hook = updateWorkInProgressHook();
      // Process any pending updates from the queue
      const newState = processUpdateQueue(hook);
      hook.memoizedState = newState;
      return [newState, hook.queue.dispatch];
    },
    useEffect(create, deps) {
      const hook = updateWorkInProgressHook();
      const prevDeps = hook.memoizedState.deps;
      if (areDepsEqual(prevDeps, deps)) {
        // Dependencies unchanged; skip this effect
        return;
      }
      hook.memoizedState = { create, destroy: undefined, deps };
      // Flag fiber for effect processing
    },
  },

  invalid: {
    useState() {
      throw new Error("Invalid hook call. Hooks can only be called inside a function component.");
    },
  },
};
```

Before calling a component function, React sets the dispatcher to `mount` (first render) or `update` (re-render). After the component returns, React sets it to `invalid`, ensuring that hooks called outside a component body throw an error immediately.

### The `renderWithHooks` Entry Point

```javascript
// Conceptual flow (simplified from ReactFiberHooks.js)
function renderWithHooks(fiber, Component, props) {
  // 1. Determine which dispatcher to use
  if (fiber.memoizedState === null) {
    ReactCurrentDispatcher.current = Dispatcher.mount;
  } else {
    ReactCurrentDispatcher.current = Dispatcher.update;
  }

  // 2. Call the component function
  //    Each hook call inside the function reads from the dispatcher
  const children = Component(props);

  // 3. Reset dispatcher to prevent hooks outside components
  ReactCurrentDispatcher.current = Dispatcher.invalid;

  return children;
}
```

> **See Also:** Part 2, Chapter 4, Section 4.2 for the fiber node structure, and Part 2, Chapter 4, Section 4.5 for how `beginWork` calls `renderWithHooks`.

---

## 7.3 Why You Can't Call Hooks Conditionally

With the linked-list mechanism understood, the conditional hook prohibition becomes mechanically clear. The linked list has no index, no keys, no identifiers. It is walked sequentially. If the Nth call on render K corresponds to Hook #N, then the Nth call on render K+1 must also correspond to Hook #N.

### Conditional Hooks: A Detailed Failure Trace

```javascript
function ConditionalHookDemo({ isAdmin }) {
  const [name, setName] = useState("Guest");   // Always Hook #1

  if (isAdmin) {
    const [role, setRole] = useState("admin");  // Hook #2 only if isAdmin
  }

  const [theme, setTheme] = useState("light");  // Hook #2 or #3

  useEffect(() => {
    console.log("Theme changed:", theme);
  }, [theme]);                                    // Hook #3 or #4
}
```

**Render 1 (`isAdmin = true`):**

```
Call 1: useState("Guest")  → creates Hook #1, memoizedState = "Guest"
Call 2: useState("admin")  → creates Hook #2, memoizedState = "admin"
Call 3: useState("light")  → creates Hook #3, memoizedState = "light"
Call 4: useEffect(...)     → creates Hook #4, memoizedState = { create, deps }

Linked list: Hook#1 → Hook#2 → Hook#3 → Hook#4
```

**Render 2 (`isAdmin = false`):**

```
Call 1: useState("Guest")  → reads Hook #1, returns "Guest"        ✓
Call 2: useState("light")  → reads Hook #2, returns "admin"        ✗ WRONG!
Call 3: useEffect(...)     → reads Hook #3, returns "light"        ✗ WRONG TYPE!

React detects the mismatch (expecting useState, got useEffect) and throws.
```

The state corruption happens because the walker advances one position per hook call, regardless of which hook is being called. There is no mechanism to "skip" a node or "look up" by name.

### Loops and Dynamic Hook Counts

The same problem applies to hooks inside loops:

```javascript
// BROKEN: dynamic number of hook calls
function DynamicHooks({ items }) {
  const states = items.map((item) => {
    // Each iteration calls useState; the count varies with items.length
    return useState(item.defaultValue);
  });
  // If items changes from [a, b, c] to [a, b],
  // the third hook is orphaned and the list misaligns.
}
```

> **Common Mistake:** Developers sometimes attempt to create "dynamic hooks" for variable-length lists by calling hooks inside `.map()` or `.forEach()`. This violates the rules and causes unpredictable state corruption. The correct pattern is to use a single `useState` or `useReducer` that holds the entire collection as one state value, or to create a separate child component for each item (each with its own isolated hook list).

---

## 7.4 Pure Rendering: No Side Effects During Render

React requires that component functions behave as pure functions during the render phase. "Pure" in React's context means:

1. **Idempotent output.** Given the same props, state, and context, the component always returns the same JSX.
2. **No mutation of non-local values.** The component must not modify variables, objects, or data structures that existed before the render began.
3. **No observable side effects.** No network requests, no DOM manipulation, no logging that affects program behavior, no writing to external stores.

### What Is Allowed During Render

Local mutation (creating and modifying new objects within the render) is explicitly allowed:

```javascript
function ShoppingCart({ items }) {
  // Local mutation: creating a new array and sorting it
  // This is ALLOWED because the array was created in this render
  const sorted = [...items].sort((a, b) => a.price - b.price);

  // Local object creation and mutation: ALLOWED
  const summary = {};
  for (const item of items) {
    summary[item.category] = (summary[item.category] || 0) + item.price;
  }

  return (
    <div>
      <ul>
        {sorted.map((item) => (
          <li key={item.id}>
            {item.name}: ${item.price.toFixed(2)}
          </li>
        ))}
      </ul>
      <pre>{JSON.stringify(summary, null, 2)}</pre>
    </div>
  );
}
```

### What Is Forbidden During Render

```javascript
// External counter: mutated during render
let globalRenderCount = 0;

function ImpureComponent({ data }) {
  globalRenderCount += 1; // FORBIDDEN: mutates external state

  console.log("Rendering:", data); // FORBIDDEN: observable side effect

  document.title = data.title; // FORBIDDEN: DOM mutation during render

  fetch("/api/analytics", {    // FORBIDDEN: network request during render
    method: "POST",
    body: JSON.stringify({ event: "render" }),
  });

  return <div>{data.content}</div>;
}
```

### Why Purity is Non-Negotiable

React's concurrent rendering features depend on purity:

- **Time slicing** may pause a render and resume it later. An impure render that fires a network request would fire the request at pause time, then fire it again when resumed, causing duplicate requests.
- **Concurrent rendering** may render the same component multiple times for different priority lanes. Impure renders would execute side effects once per concurrent render attempt.
- **The React Compiler** (v1.0) automatically memoizes components and computations. It assumes purity to determine when re-computation can be safely skipped. Impure components may produce incorrect output when the compiler caches their results.

> **See Also:** Part 2, Chapter 5, Section 5.6 for the render phase purity requirement and Section 5.7 for where side effects belong.

---

## 7.5 Why React Calls Components Twice in Strict Mode

React's `<StrictMode>` wrapper enables additional development-time checks that help identify potential problems before they reach production. The most visible check is **double invocation**: React calls certain functions twice during development to detect impure behavior.

### What Gets Double-Invoked

| Function | Double-Invoked? | Why |
|----------|----------------|-----|
| Component function body | Yes | Detect impure renders |
| `useState` initializer function | Yes | Detect side effects in initialization |
| `useMemo` computation function | Yes | Detect side effects in memoization |
| `useReducer` reducer function | Yes | Detect impure reducers |
| `useEffect` callback | No (but mount/unmount/remount cycle runs) | Test cleanup resilience |
| Event handlers | No | Not part of the render phase |

### The Effect Lifecycle Test

In addition to double-invoking render-phase functions, Strict Mode simulates a mount/unmount/remount cycle for effects:

```javascript
function ChatConnection({ roomId }) {
  useEffect(() => {
    console.log("Connecting to room:", roomId);
    const connection = createConnection(roomId);
    connection.connect();

    return () => {
      console.log("Disconnecting from room:", roomId);
      connection.disconnect();
    };
  }, [roomId]);

  return <div>Chat: {roomId}</div>;
}

// In development with StrictMode, the console shows:
// "Connecting to room: general"     (first mount)
// "Disconnecting from room: general" (simulated unmount)
// "Connecting to room: general"     (simulated remount)
```

This cycle surfaces effects that fail to clean up properly. If an effect sets up a WebSocket connection but does not close it in the cleanup function, the simulated unmount/remount reveals two active connections instead of one.

### The Purpose: Preparing for Reusable State

The React team introduced the mount/unmount/remount check to prepare for features where React preserves component state across unmount cycles. In React 19.2, this manifests as **Activities** (formerly Offscreen): components can be hidden (unmounted from the DOM but state preserved) and revealed (remounted) without losing state. Components must be resilient to this lifecycle for Activities to work correctly.

```javascript
// This effect works correctly with mount/unmount/remount:
useEffect(() => {
  const controller = new AbortController();
  fetchData(controller.signal);
  return () => controller.abort(); // Cleanup cancels the fetch
}, [dependency]);

// This effect is BROKEN (no cleanup):
useEffect(() => {
  const interval = setInterval(() => tick(), 1000);
  // Missing: return () => clearInterval(interval);
}, []);
// StrictMode reveals the bug: two intervals running simultaneously
```

> **Common Mistake:** Developers sometimes remove `<StrictMode>` to "fix" the double-rendering behavior, believing it causes bugs. The double rendering does not cause bugs; it reveals existing bugs. Removing StrictMode hides the problems without solving them. The correct response to double-render issues is to make the component pure and ensure effects have proper cleanup.

---

## 7.6 The Contract Between You and React

React's rules form a bilateral contract. The developer agrees to follow certain constraints; in return, React provides certain guarantees.

### What the Developer Promises

| Rule | Reason |
|------|--------|
| Render functions are pure | Enables concurrent rendering, time slicing, and automatic memoization |
| Hooks are called in the same order every render | Enables the linked-list state tracking mechanism |
| Hooks are called only from React functions | Ensures the dispatcher is set correctly |
| State is updated immutably | Enables change detection via `Object.is` reference comparison |
| Side effects are placed in effects or event handlers | Keeps the render phase safe for interruption and replay |
| Keys are stable and unique within sibling lists | Enables efficient reconciliation and correct state preservation |

### What React Provides in Return

| Guarantee | Mechanism |
|-----------|-----------|
| Consistent UI matching state | Automatic reconciliation and DOM patching |
| No torn renders (partial updates visible to user) | Synchronous commit phase |
| Efficient updates (only changed DOM nodes are touched) | Virtual DOM diffing with O(n) heuristics |
| Interruptible rendering for responsiveness | Fiber architecture with time slicing |
| Priority-based update scheduling | Lane system with urgent/transition distinction |
| Automatic batching of state updates | Microtask-based flush scheduling |
| Automatic memoization (with React Compiler) | Static analysis based on purity assumptions |

### The React Compiler and the Purity Contract

The React Compiler (v1.0, released October 2025) raises the stakes of the purity contract. The compiler performs static analysis at build time to automatically insert memoization, eliminating the need for manual `React.memo`, `useMemo`, and `useCallback` in most cases. Its analysis is based on the assumption that components follow the Rules of React.

```javascript
// Before the React Compiler: manual memoization
const MemoizedList = React.memo(function ProductList({ products }) {
  const sorted = useMemo(
    () => products.toSorted((a, b) => a.price - b.price),
    [products]
  );

  const handleClick = useCallback((id) => {
    addToCart(id);
  }, [addToCart]);

  return sorted.map((p) => (
    <ProductCard key={p.id} product={p} onClick={handleClick} />
  ));
});

// After the React Compiler: automatic memoization
// The compiler inserts equivalent optimizations automatically.
// No React.memo, useMemo, or useCallback needed.
function ProductList({ products }) {
  const sorted = products.toSorted((a, b) => a.price - b.price);

  const handleClick = (id) => {
    addToCart(id);
  };

  return sorted.map((p) => (
    <ProductCard key={p.id} product={p} onClick={handleClick} />
  ));
}
```

If a component violates purity (e.g., reading from a mutable global variable during render), the compiler may cache a stale result, producing incorrect UI. The `eslint-plugin-react-compiler` helps detect violations at lint time.

---

## 7.7 Exercise: Break Every Rule on Purpose and Observe What Happens

### Problem Statement

Create a component that intentionally violates each of React's core rules. For each violation, predict the resulting behavior, then run the code (with `<StrictMode>` enabled) and observe the actual outcome.

### Violation 1: Conditional Hook Call

```javascript
function ConditionalHookTest({ showExtra }) {
  const [count, setCount] = useState(0);

  // VIOLATION: hook called conditionally
  if (showExtra) {
    const [extra, setExtra] = useState("bonus");
  }

  const [name, setName] = useState("Alice");

  return (
    <div>
      <p>Count: {count}, Name: {name}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </div>
  );
}

// Predicted behavior: When showExtra changes from true to false,
// React throws: "Rendered fewer hooks than expected."
// Before the error, name would contain extra's state value ("bonus")
// because the linked list walker reads position #2, which is the
// now-skipped hook's node.
//
// Actual behavior: React throws the error on the first render
// where showExtra changes. The component crashes.
```

### Violation 2: Impure Render (Mutating External State)

```javascript
let renderCounter = 0;

function ImpureRenderTest() {
  renderCounter += 1;
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Render count: {renderCounter}</p>
      <p>State count: {count}</p>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </div>
  );
}

// Predicted behavior: In StrictMode, the component function runs
// twice per render. renderCounter increments by 2 on mount
// and by 2 on each state update, showing values like 2, 4, 6...
// instead of 1, 2, 3... The displayed count is double what
// the user expects.
//
// Actual behavior: Exactly as predicted. StrictMode's double
// invocation makes the mutation visible immediately.
// In production (no StrictMode), the bug is hidden but still
// present: concurrent features could cause the same doubling.
```

### Violation 3: Side Effect During Render

```javascript
function SideEffectRenderTest({ userId }) {
  const [user, setUser] = useState(null);

  // VIOLATION: fetch during render
  fetch(`/api/users/${userId}`)
    .then((res) => res.json())
    .then((data) => setUser(data));

  return <div>{user ? user.name : "Loading..."}</div>;
}

// Predicted behavior: Every render triggers a new fetch request.
// When the fetch completes, setUser triggers another render,
// which triggers another fetch, creating an infinite loop.
// In StrictMode, the initial render fires two fetch requests.
// Network tab shows an avalanche of requests.
//
// Actual behavior: Infinite loop. The component renders, fires
// a fetch, the fetch resolves and calls setUser, which triggers
// a re-render, which fires another fetch. The browser tab
// eventually becomes unresponsive.
```

### Violation 4: Missing Effect Cleanup

```javascript
function LeakyTimerTest() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setCount((c) => c + 1);
    }, 1000);
    // VIOLATION: no cleanup function returned
  }, []);

  return <p>Count: {count}</p>;
}

// Predicted behavior: In StrictMode (React 18+), the effect runs,
// the component is simulated-unmounted (no cleanup to run),
// then simulated-remounted (effect runs again). Two intervals
// are now running, so count increments by 2 every second.
//
// If the component actually unmounts and remounts (e.g., route change),
// each mount adds another interval without clearing previous ones,
// causing the count to accelerate: +1/sec, +2/sec, +3/sec...
//
// Actual behavior: Exactly as predicted. The count increments
// by 2 per second in development with StrictMode.
```

### Violation 5: Hook Called Outside a Component

```javascript
// VIOLATION: hook called in a regular function
function getWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  return width;
}

function App() {
  const width = getWindowWidth(); // Crashes immediately
  return <p>Width: {width}</p>;
}

// Predicted behavior: React throws:
// "Invalid hook call. Hooks can only be called inside the body
// of a function component."
// The dispatcher is set to the invalid-context dispatcher because
// getWindowWidth is not being called by React's renderWithHooks.
//
// Actual behavior: Throws immediately with the error above.
// Fix: rename to useWindowWidth and call it from inside the
// component body (making it a custom hook).
```

### Key Takeaway

Every React rule exists for a specific technical reason rooted in the framework's internal architecture. The hook call-order rule enables the linked-list state tracking mechanism. The purity rule enables concurrent rendering, time slicing, and the React Compiler's automatic memoization. The effect cleanup rule enables Strict Mode's mount/unmount/remount testing and future features like Activities. Violating these rules does not produce vague "bad practice" consequences; it produces concrete, predictable failures: state corruption, infinite loops, memory leaks, and runtime errors. Understanding why the rules exist transforms them from arbitrary constraints into logical consequences of React's design.

---

## Chapter Summary

React's rules are structural requirements of its internal architecture, not stylistic preferences. The Rules of Hooks enforce consistent call order because hooks are tracked via a position-based linked list on the fiber node; conditional calls corrupt the list and misalign state. Pure rendering is required because concurrent features (time slicing, transitions) may call component functions multiple times, discard results, or restart renders. Strict Mode surfaces violations by double-invoking render-phase functions and simulating mount/unmount/remount cycles for effects. The React Compiler amplifies the importance of these rules by assuming purity for automatic memoization. Together, these rules form a bilateral contract: the developer ensures purity and call-order consistency; React provides efficient, interruptible, automatically-optimized rendering.

## Further Reading

- [Rules of React (React Documentation)](https://react.dev/reference/rules) — the official, complete rule set
- [Why Do Hooks Rely on Call Order? (Dan Abramov)](https://overreacted.io/why-do-hooks-rely-on-call-order/) — design rationale for the linked-list approach
- [Components and Hooks Must Be Pure (React Documentation)](https://react.dev/reference/rules/components-and-hooks-must-be-pure) — detailed purity requirements
- [StrictMode (React Documentation)](https://react.dev/reference/react/StrictMode) — what gets double-invoked and why
- [The Rules of React (Sebastian Markbage)](https://gist.github.com/sebmarkbage/75f0838967cd003cd7f9ab938eb1958f) — foundational gist on purity semantics
- [Under the Hood of React's Hooks System (The Guild)](https://the-guild.dev/blog/react-hooks-system) — detailed internals of the hook linked list and dispatcher
