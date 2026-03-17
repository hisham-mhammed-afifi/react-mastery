# Part 2, Chapter 5: The Rendering Pipeline

## What You Will Learn

- Identify the five phases of React's rendering pipeline: trigger, render, reconciliation, commit, and browser paint
- Enumerate every condition that causes a React component to re-render (and debunk common misconceptions about when re-renders occur)
- Explain why the render phase must be free of side effects, with reference to Strict Mode double-invocation and concurrent rendering
- Trace the exact timing of DOM mutations, ref assignments, `useLayoutEffect`, browser paint, and `useEffect` during the commit and post-commit sequence
- Describe how React 18+ automatic batching groups multiple `setState` calls into a single render via microtask scheduling
- Use `flushSync` to opt out of batching when synchronous DOM access is required

---

## 5.1 Phase 1: Trigger (What Causes a Re-render?)

A render begins when React determines that a component's output may have changed. There are precisely four triggers that schedule a render:

### 1. Initial Mount

When the application starts, `createRoot(container).render(<App />)` schedules the first render of the entire component tree. Every component is rendered for the first time, and all resulting DOM nodes are created and inserted.

```javascript
import { createRoot } from "react-dom/client";

// This triggers the initial render of the entire tree
const root = createRoot(document.getElementById("root"));
root.render(<App />);
```

### 2. State Changes

Calling a state setter (`setState` from `useState`, `dispatch` from `useReducer`) marks the component's fiber as having pending work. React schedules a re-render of that component and its subtree.

```javascript
function Counter() {
  const [count, setCount] = useState(0);

  function handleClick() {
    setCount(count + 1); // Triggers a re-render of Counter
  }

  return <button onClick={handleClick}>{count}</button>;
}
```

**The same-state bailout:** If the new state value is identical to the current state (compared via `Object.is`), React may bail out and skip the re-render. However, this bailout has nuances: React may still call the component function once before bailing out (a "late bailout" during `beginWork`), especially on the first update after a render. This is a correctness guarantee, not a bug.

### 3. Parent Re-renders

When a parent component re-renders, **all of its children re-render by default**, regardless of whether their props changed. This is one of the most misunderstood aspects of React's rendering model.

```javascript
function Parent() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
      {/* Child re-renders every time Parent re-renders,
          even though it receives no props at all */}
      <ExpensiveChild />
    </div>
  );
}

function ExpensiveChild() {
  console.log("ExpensiveChild rendered"); // Logs on every Parent update
  return <div>Static content</div>;
}
```

> **Common Mistake:** Developers frequently believe that a component only re-renders when its props change. This is false. A component re-renders whenever its parent re-renders, unless the component is wrapped in `React.memo` (which performs a shallow prop comparison and skips re-rendering if props are unchanged). Without `React.memo`, React does not compare props at all; it re-renders the entire subtree unconditionally.

### 4. Context Changes

When a context provider's `value` prop changes (by reference), every component that consumes that context via `useContext` re-renders, regardless of which part of the context value the component actually uses.

```javascript
const ThemeContext = createContext({ color: "blue", fontSize: 14 });

function App() {
  const [theme, setTheme] = useState({ color: "blue", fontSize: 14 });

  return (
    <ThemeContext.Provider value={theme}>
      {/* Every consumer re-renders when theme changes,
          even if they only read theme.color and only fontSize changed */}
      <Header />
      <Content />
    </ThemeContext.Provider>
  );
}
```

> **See Also:** Part 3, Chapter 4, Section 4 for strategies to avoid unnecessary context-triggered re-renders (context splitting, selector patterns, external stores).

---

## 5.2 Phase 2: Render (Calling Your Component Functions)

When a render is triggered, React enters the **render phase**. During this phase, React calls component functions (or class component `render` methods) starting from the component that triggered the update, and recursively processes its children.

The term "render" is often confusing because it does not mean "update the screen." In React's terminology, rendering means **calling component functions to produce a new element tree**. The screen is not updated until the later commit phase.

```javascript
function ProductPage({ productId }) {
  console.log("ProductPage render"); // This runs during the render phase
  const [quantity, setQuantity] = useState(1);

  // These computations happen during the render phase
  const product = products.find((p) => p.id === productId);
  const total = product.price * quantity;

  // The return value is a React element tree (virtual DOM)
  return (
    <div>
      <h1>{product.name}</h1>
      <p>Total: ${total.toFixed(2)}</p>
      <QuantitySelector value={quantity} onChange={setQuantity} />
    </div>
  );
}
```

The render phase processes the fiber tree using the work loop described in Chapter 4: `beginWork` walks down the tree calling component functions and diffing children; `completeWork` walks back up constructing detached DOM elements.

> **See Also:** Part 2, Chapter 4, Section 4.5 for the complete `beginWork`/`completeWork` work loop.

### Render Phase Characteristics

- **No DOM mutations.** The render phase produces a work-in-progress fiber tree with effect flags, but no changes are applied to the browser DOM.
- **May be interrupted.** In concurrent mode, the render phase can be paused (via time slicing) and resumed later, or abandoned entirely if a higher-priority update arrives.
- **May be called multiple times.** React may call a component function more than once for a single visible update (due to concurrent restarts, Strict Mode double-invocation, or late bailout checks).

---

## 5.3 Phase 3: Reconciliation (Diffing Old vs New)

Reconciliation is the process of comparing the new element tree (produced by the render phase) against the previous fiber tree (the current tree) to determine what changed. This happens as part of `beginWork` during the render phase; it is not a separate sequential step.

The reconciliation algorithm applies the two heuristics covered in Chapter 3:

1. Elements of different types produce different trees (tear-down-and-rebuild).
2. Keys provide stable child identity for list diffing.

```javascript
// Reconciliation example: React compares old and new trees
// Old tree (current):
//   <div className="list">
//     <Item key="a" name="Apple" />
//     <Item key="b" name="Banana" />
//   </div>

// New tree (work-in-progress):
//   <div className="list active">
//     <Item key="b" name="Banana" />
//     <Item key="a" name="Apple" />
//     <Item key="c" name="Cherry" />
//   </div>

// Reconciliation result:
// 1. div: same type, update className ("list" -> "list active")
// 2. key="b": found in old tree, reuse fiber, move to position 0
// 3. key="a": found in old tree, reuse fiber, move to position 1
// 4. key="c": not in old tree, create new fiber (Placement flag)
```

The output of reconciliation is a set of **effect flags** on fiber nodes: `Placement` (new node to insert), `Update` (props changed), `Deletion` (node to remove), `ChildDeletion` (child needs removal). These flags are consumed by the commit phase.

> **See Also:** Part 2, Chapter 3, Sections 3.3 through 3.7 for the complete diffing algorithm, key mechanics, and the two O(n) assumptions.

---

## 5.4 Phase 4: Commit (Applying Changes to the Real DOM)

After the render phase completes the work-in-progress tree, React enters the **commit phase**. This phase is always **synchronous and uninterruptible**: once it begins, React applies all accumulated changes to the DOM without yielding to the browser. This guarantees that the user never sees a partially updated UI.

The commit phase has three sub-phases, executed in strict order:

### Sub-phase 1: Before Mutation

React processes `getSnapshotBeforeUpdate` (class components) and prepares for DOM changes. In function components, this sub-phase has minimal visible behavior.

### Sub-phase 2: Mutation

React walks the fiber tree and applies DOM operations:

```javascript
// Conceptual mutation phase operations:
// For each fiber with effect flags:

// Placement: insert new DOM node
parentNode.appendChild(newDOMNode);

// Update: modify existing DOM node attributes
existingDOMNode.className = "new-class";
existingDOMNode.style.color = "blue";

// Deletion: remove DOM node
parentNode.removeChild(oldDOMNode);
```

After mutations, **refs are updated**: `ref.current` is set to the new DOM node (or cleared for unmounted elements).

### Sub-phase 3: Layout

React runs **`useLayoutEffect` cleanup functions** (from the previous render), then runs **new `useLayoutEffect` callbacks**. These execute synchronously, before the browser paints.

```javascript
function Tooltip({ targetRef, content }) {
  const tooltipRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    // This runs AFTER DOM mutations but BEFORE browser paint.
    // We can read layout and update state synchronously.
    // The user never sees the tooltip in the wrong position.
    const rect = targetRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    setPosition({
      top: rect.top - tooltipRect.height - 8,
      left: rect.left + rect.width / 2 - tooltipRect.width / 2,
    });
  }, [targetRef]);

  return (
    <div
      ref={tooltipRef}
      className="tooltip"
      style={{ top: position.top, left: position.left }}
    >
      {content}
    </div>
  );
}
```

After `useLayoutEffect` callbacks complete, the commit phase is finished. React swaps the tree pointers (the work-in-progress tree becomes the new current tree).

---

## 5.5 Phase 5: Browser Paint

After the commit phase completes, control returns to the browser. The browser detects that the DOM has been modified and performs its own rendering pipeline:

```
React commit phase ends
        │
        ▼
Browser recalculates styles (CSSOM)
        │
        ▼
Browser performs layout (reflow)
        │
        ▼
Browser paints pixels to screen
        │
        ▼
React runs useEffect callbacks (passive effects)
```

The browser paint is not controlled by React. React simply modifies the DOM and yields; the browser decides when and how to paint. In practice, this happens within the same frame (within the 16.67ms budget at 60fps) because React's commit phase is synchronous and typically fast.

### Post-Paint: useEffect Execution

After the browser has painted, React executes **`useEffect` cleanup functions** (from the previous render) and then **new `useEffect` callbacks**. These are called "passive effects" because they do not block the visual update.

```javascript
function SearchResults({ query }) {
  const [results, setResults] = useState([]);

  useEffect(() => {
    // This runs AFTER the browser has painted.
    // The user sees the previous results (or a loading state)
    // while this fetch is in progress.
    const controller = new AbortController();

    async function fetchResults() {
      try {
        const res = await fetch(`/api/search?q=${query}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setResults(data);
      } catch (err) {
        if (err.name !== "AbortError") console.error(err);
      }
    }

    fetchResults();
    return () => controller.abort(); // Cleanup on next render or unmount
  }, [query]);

  return (
    <ul>
      {results.map((r) => (
        <li key={r.id}>{r.title}</li>
      ))}
    </ul>
  );
}
```

### The Complete Timeline

```
setState called
  │
  ▼
Render Phase (async, interruptible in concurrent mode)
  ├── Call component functions
  ├── Diff old vs new element trees (reconciliation)
  └── Build work-in-progress fiber tree with effect flags
  │
  ▼
Commit Phase (synchronous, uninterruptible)
  ├── Sub-phase 1: Before mutation (getSnapshotBeforeUpdate)
  ├── Sub-phase 2: Mutation (DOM insertions, updates, deletions)
  │                         (ref assignments)
  └── Sub-phase 3: Layout (useLayoutEffect cleanup, then callbacks)
  │
  ▼
Browser Paint (styles, layout, paint, composite)
  │
  ▼
Passive Effects (useEffect cleanup, then callbacks)
```

### Effect Execution Order: Children Before Parents

Due to React's depth-first fiber traversal, a child component's effects run before its parent's effects:

```javascript
function Parent() {
  useEffect(() => { console.log("Parent effect"); });
  useLayoutEffect(() => { console.log("Parent layout effect"); });

  return <Child />;
}

function Child() {
  useEffect(() => { console.log("Child effect"); });
  useLayoutEffect(() => { console.log("Child layout effect"); });

  return <div>Child</div>;
}

// Console output:
// "Child layout effect"    (layout effects: children first)
// "Parent layout effect"
// --- browser paints ---
// "Child effect"           (passive effects: children first)
// "Parent effect"
```

---

## 5.6 The Render Phase is Pure (No Side Effects!)

The render phase must be free of side effects. Component functions called during the render phase must behave as pure functions: given the same props and state, they must return the same element tree, and they must not cause observable changes outside their scope.

### Why Purity is Required

**Concurrent rendering.** In concurrent mode, React may call a component function, discard the result (because a higher-priority update arrived), and call it again later. If the component function had side effects (sending an analytics event, incrementing a counter, modifying a global variable), those effects would execute multiple times or execute for renders that never reach the screen.

**Strict Mode double-invocation.** In development, React's `<StrictMode>` deliberately calls component functions, `useState` initializers, `useMemo` callbacks, and reducer functions twice to surface impure code. If a component produces different results on the second invocation, it has an impurity bug.

```javascript
// Impure render: side effect in the component body
let renderCount = 0;

function Dashboard({ data }) {
  renderCount += 1; // BUG: mutates external variable during render
  console.log("Render #" + renderCount); // BUG: observable side effect

  return <div>{data.length} items</div>;
}

// In Strict Mode, this logs twice per render, and renderCount
// increments twice, producing incorrect counts.
```

### What Is and Is Not Allowed During Render

| Allowed | Not Allowed |
|---------|-------------|
| Computing derived values from props/state | Mutating variables outside the component |
| Creating new objects/arrays | Network requests (fetch, WebSocket) |
| Calling pure functions | Writing to localStorage/sessionStorage |
| Reading from props, state, context | Subscribing to external stores |
| Conditional logic (ternaries, early returns) | Setting timers (setTimeout, setInterval) |
| | Direct DOM manipulation |
| | Calling setState (except in event handlers) |

```javascript
// Pure render: all computations derived from inputs
function ProductList({ products, sortBy, filterCategory }) {
  // Derived computation: allowed during render
  const filtered = products.filter(
    (p) => filterCategory === "all" || p.category === filterCategory
  );

  const sorted = filtered.toSorted((a, b) => {
    if (sortBy === "price") return a.price - b.price;
    if (sortBy === "name") return a.name.localeCompare(b.name);
    return 0;
  });

  // Pure: same inputs always produce the same output
  return (
    <ul>
      {sorted.map((p) => (
        <li key={p.id}>
          {p.name}: ${p.price.toFixed(2)}
        </li>
      ))}
    </ul>
  );
}
```

> **Common Mistake:** Developers sometimes call `fetch` or set up subscriptions directly in the component body, outside of `useEffect`. This causes the request to fire on every render (including concurrent restarts and Strict Mode double-invocations), resulting in duplicate requests, race conditions, and wasted bandwidth. All side effects must be placed in `useEffect`, event handlers, or (in React 19) Actions.

---

## 5.7 The Commit Phase is Where Side Effects Live

Side effects are operations that interact with the world outside React's rendering model: DOM manipulation, network requests, timers, subscriptions, logging. React provides specific hooks that execute during or after the commit phase, each with distinct timing guarantees.

### useLayoutEffect: Synchronous, Pre-Paint

Runs synchronously after DOM mutations, before the browser paints. Use for DOM measurements and synchronous visual adjustments.

```javascript
function AutoResizeTextarea({ value, onChange }) {
  const textareaRef = useRef(null);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    // Reset height to measure scrollHeight accurately
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
    // Because this runs before paint, the user never sees
    // the textarea at the wrong height.
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      style={{ overflow: "hidden", resize: "none" }}
    />
  );
}
```

### useEffect: Asynchronous, Post-Paint

Runs after the browser has painted. Use for side effects that do not need to block the visual update: data fetching, subscriptions, analytics, timers.

```javascript
function ChatRoom({ roomId }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    // Runs after paint. The user sees the component immediately,
    // and the connection is established asynchronously.
    const connection = createConnection(roomId);
    connection.on("message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });
    connection.connect();

    return () => {
      // Cleanup runs before the next effect or on unmount
      connection.disconnect();
    };
  }, [roomId]);

  return (
    <ul>
      {messages.map((msg) => (
        <li key={msg.id}>{msg.text}</li>
      ))}
    </ul>
  );
}
```

### useInsertionEffect: Before DOM Mutations

Introduced in React 18, `useInsertionEffect` runs before any DOM mutations. It is designed exclusively for CSS-in-JS libraries that need to inject `<style>` tags before `useLayoutEffect` reads the DOM.

```javascript
// For CSS-in-JS library authors only
function useCSS(rule) {
  useInsertionEffect(() => {
    const style = document.createElement("style");
    style.textContent = rule;
    document.head.appendChild(style);
    return () => style.remove();
  });
}
```

### Timing Summary

```
                    useInsertionEffect
                           │
                    DOM Mutations (commit)
                           │
                    Ref assignments
                           │
                    useLayoutEffect cleanup (previous)
                    useLayoutEffect callback (current)
                           │
                    ─── Browser Paint ───
                           │
                    useEffect cleanup (previous)
                    useEffect callback (current)
```

---

## 5.8 Batching: How React Groups Multiple setState Calls

When multiple `setState` calls occur within the same synchronous execution context, React does not re-render between each one. Instead, it **batches** them: all updates are collected and processed in a single render pass.

```javascript
function UserForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState(0);

  function handleSubmit(formData) {
    // Three setState calls, but only ONE re-render
    setName(formData.name);
    setEmail(formData.email);
    setAge(formData.age);
    // React batches all three into a single render pass
  }

  console.log("Render"); // Logs once per handleSubmit, not three times
  return <div>{name} {email} {age}</div>;
}
```

### Why Batching Matters

Without batching, each `setState` would trigger a separate render:

```
Without batching (hypothetical):
  setName("Alice")  → render → commit → paint
  setEmail("a@b.c") → render → commit → paint
  setAge(30)         → render → commit → paint
  Total: 3 renders, possible flickering intermediate states

With batching (actual React behavior):
  setName("Alice")   ← enqueued
  setEmail("a@b.c")  ← enqueued
  setAge(30)          ← enqueued
  → single render → commit → paint
  Total: 1 render, consistent final state
```

Batching eliminates intermediate states where some values have updated but others have not. The user sees a single, consistent update.

---

## 5.9 Automatic Batching in React 18+

### Pre-React 18 Limitation

Before React 18, batching only worked inside React event handlers. Updates inside `setTimeout`, `Promise.then`, native DOM event listeners, or any asynchronous callback triggered a separate re-render for each `setState`:

```javascript
// Pre-React 18: NOT batched (each setState triggers a re-render)
function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(searchTerm) {
    setLoading(true);  // Render 1
    setQuery(searchTerm); // Render 2

    const data = await fetch(`/api?q=${searchTerm}`).then((r) => r.json());

    setResults(data);   // Render 3
    setLoading(false);  // Render 4
    // Total: 4 re-renders for one search operation
  }
}
```

### React 18+: Batching Everywhere

React 18 extended automatic batching to **all contexts**: promises, `setTimeout`, native event listeners, and any other asynchronous code. The same example above now produces a single re-render for the synchronous group and a single re-render for the post-await group:

```javascript
// React 18+: automatically batched
async function handleSearch(searchTerm) {
  setLoading(true);     // ┐
  setQuery(searchTerm); // ┘ Batched → 1 render

  const data = await fetch(`/api?q=${searchTerm}`).then((r) => r.json());

  setResults(data);     // ┐
  setLoading(false);    // ┘ Batched → 1 render
  // Total: 2 re-renders (one per synchronous execution block)
}
```

### The Microtask Mechanism

React 18's batching works by deferring the render flush to a **microtask**. When `setState` is called, React enqueues the update on the fiber but does not immediately start rendering. Instead, it schedules a microtask (via `queueMicrotask` or an equivalent internal mechanism). Multiple `setState` calls within the same synchronous execution all enqueue their updates before the microtask runs. When the JavaScript call stack empties and the microtask fires, React processes all enqueued updates in a single render pass.

> **See Also:** Part 1, Chapter 6, Section 6.2 for the microtask queue's position in the event loop and why microtasks run before macrotasks and rendering.

### Opting Out: flushSync

In rare cases, you need a DOM update to be applied immediately (e.g., to read the updated DOM for scroll position or focus management). `flushSync` forces React to process the enclosed updates synchronously:

```javascript
import { flushSync } from "react-dom";

function ChatMessages({ messages }) {
  const listRef = useRef(null);

  function handleNewMessage(message) {
    // Force synchronous render and DOM update
    flushSync(() => {
      setMessages((prev) => [...prev, message]);
    });

    // The DOM is now updated. We can safely scroll to the bottom.
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }

  return (
    <ul ref={listRef}>
      {messages.map((m) => (
        <li key={m.id}>{m.text}</li>
      ))}
    </ul>
  );
}
```

`flushSync` should be used sparingly. It bypasses batching, forces synchronous rendering, and can degrade performance if overused.

---

## 5.10 Exercise: Add console.logs to Trace the Full Render Pipeline

### Problem Statement

Instrument a component tree with `console.log` statements to observe the exact order of execution across the rendering pipeline: component function calls, `useLayoutEffect` cleanup and callbacks, browser paint (approximated), and `useEffect` cleanup and callbacks. Predict the output order before running the code, then verify.

### Starter Code

```javascript
import { useState, useEffect, useLayoutEffect } from "react";

function Parent() {
  const [count, setCount] = useState(0);

  console.log("1. Parent render");

  useLayoutEffect(() => {
    console.log("4. Parent useLayoutEffect");
    return () => console.log("Parent useLayoutEffect cleanup");
  });

  useEffect(() => {
    console.log("6. Parent useEffect");
    return () => console.log("Parent useEffect cleanup");
  });

  return (
    <div>
      <button onClick={() => setCount((c) => c + 1)}>
        Count: {count}
      </button>
      <Child label="A" />
      <Child label="B" />
    </div>
  );
}

function Child({ label }) {
  console.log(`2. Child ${label} render`);

  useLayoutEffect(() => {
    console.log(`3. Child ${label} useLayoutEffect`);
    return () => console.log(`Child ${label} useLayoutEffect cleanup`);
  });

  useEffect(() => {
    console.log(`5. Child ${label} useEffect`);
    return () => console.log(`Child ${label} useEffect cleanup`);
  });

  return <div>Child {label}</div>;
}
```

### Solution: Predicted Output

**On initial mount:**

```
1. Parent render
2. Child A render
2. Child B render
3. Child A useLayoutEffect
3. Child B useLayoutEffect
4. Parent useLayoutEffect
--- browser paints ---
5. Child A useEffect
5. Child B useEffect
6. Parent useEffect
```

**On clicking the button (re-render):**

```
1. Parent render
2. Child A render
2. Child B render
Child A useLayoutEffect cleanup      (previous layout effects clean up)
Child B useLayoutEffect cleanup
Parent useLayoutEffect cleanup
3. Child A useLayoutEffect            (new layout effects run)
3. Child B useLayoutEffect
4. Parent useLayoutEffect
--- browser paints ---
Child A useEffect cleanup            (previous passive effects clean up)
Child B useEffect cleanup
Parent useEffect cleanup
5. Child A useEffect                  (new passive effects run)
5. Child B useEffect
6. Parent useEffect
```

### Explanation of the Order

1. **Render phase (top-down):** Component functions are called in tree order. Parent renders first, then Child A, then Child B. This is the `beginWork` traversal going down.

2. **Layout effects (bottom-up):** After DOM mutations in the commit phase, `useLayoutEffect` callbacks run in the order fibers complete: children first, then parent. Cleanup from the previous render runs immediately before the new callback.

3. **Browser paint:** Occurs after layout effects complete but before passive effects.

4. **Passive effects (bottom-up):** `useEffect` callbacks run after paint, in the same bottom-up order as layout effects. Cleanup runs immediately before the new callback.

### Strict Mode Behavior

In development with `<StrictMode>`, the initial mount output includes double-invocations:

```
1. Parent render              (first invocation)
2. Child A render
2. Child B render
1. Parent render              (Strict Mode second invocation)
2. Child A render
2. Child B render
3. Child A useLayoutEffect    (effects run once, not doubled)
3. Child B useLayoutEffect
4. Parent useLayoutEffect
```

Strict Mode double-invokes component functions and certain hooks (useState initializers, useMemo callbacks) but does **not** double-invoke effect callbacks. The double invocation surfaces impure render logic by revealing inconsistent return values.

### Key Takeaway

The rendering pipeline follows a strict, predictable order: render phase (top-down component calls), commit phase (DOM mutations, then bottom-up layout effects), browser paint, then bottom-up passive effects. Understanding this order is essential for placing side effects in the correct hook (`useLayoutEffect` for pre-paint DOM measurements, `useEffect` for post-paint async work) and for debugging timing-sensitive behavior. The bottom-up effect order guarantees that children's DOM is fully committed before parents attempt to read layout.

---

## Chapter Summary

React's rendering pipeline consists of five sequential phases: trigger (state change, parent re-render, context change, or initial mount), render (calling component functions to produce a new element tree), reconciliation (diffing old and new trees to compute minimal changes), commit (synchronously applying DOM mutations, updating refs, and running layout effects), and browser paint (followed by asynchronous passive effects). The render phase must be pure because React may call component functions multiple times, discard results, or restart rendering in concurrent mode. React 18 introduced automatic batching via microtask scheduling, grouping all `setState` calls within the same synchronous execution into a single render regardless of their origin.

## Further Reading

- [Render and Commit (React Documentation)](https://react.dev/learn/render-and-commit) — official guide to the rendering phases
- [Queueing a Series of State Updates (React Documentation)](https://react.dev/learn/queueing-a-series-of-state-updates) — official explanation of batching
- [Automatic Batching for Fewer Renders in React 18 (React Working Group)](https://github.com/reactwg/react-18/discussions/21) — the original RFC for automatic batching
- [A (Mostly) Complete Guide to React Rendering Behavior (Mark Erikson)](https://blog.isquaredsoftware.com/2020/05/blogged-answers-a-mostly-complete-guide-to-react-rendering-behavior/) — comprehensive rendering behavior reference
- [useEffect vs useLayoutEffect (Kent C. Dodds)](https://kentcdodds.com/blog/useeffect-vs-uselayouteffect) — practical guide to effect timing
- [React Re-renders Guide: Everything, All at Once (developerway.com)](https://www.developerway.com/posts/react-re-renders-guide) — visual guide to re-render causes and prevention
