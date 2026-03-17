# Part 2, Chapter 8: Concurrent React

## What You Will Learn

- Define what "concurrent" means in React's single-threaded context: cooperative scheduling that can pause, resume, and abandon rendering work
- Distinguish urgent updates (synchronous, uninterruptible) from transition updates (interruptible, low-priority) and explain the lane-based mechanism that separates them
- Apply `useTransition` and `useDeferredValue` to the correct scenarios and articulate the mental model for each
- Explain how Suspense declares loading states, how the `use()` hook integrates with Suspense for data fetching, and how streaming SSR leverages Suspense boundaries
- Identify the tearing problem in concurrent rendering and explain how `useSyncExternalStore` prevents it
- Build a search interface that demonstrates the concrete UX difference between transition-based and synchronous rendering

---

## 8.1 What "Concurrent" Means in React's Context

Concurrent rendering does not mean React uses multiple threads. JavaScript is single-threaded; React cannot execute two computations simultaneously. "Concurrent" in React means **cooperative scheduling**: React can pause rendering work, yield control to the browser for higher-priority tasks (user input, painting), and resume rendering later.

Before React 18, all rendering was synchronous. When a state update triggered a render, React processed the entire component tree in one uninterruptible pass. If that pass took 100ms, the browser could not respond to clicks, keystrokes, or animations for 100ms.

With concurrent rendering (default in React 18+), React breaks rendering into small units of work (one fiber node per unit). After processing each unit, React checks whether higher-priority work has arrived. If so, it pauses the current render, handles the urgent work, and either resumes or restarts the original render.

```
Synchronous rendering (React 17):
  ┌──────────────────────────────────────────┐
  │  Render entire tree (50ms, uninterruptible) │
  └──────────────────────────────────────────┘
  │                                            │
  User types "a"                    Browser can finally respond

Concurrent rendering (React 18+):
  ┌───────┐  ┌───────┐  ┌───────┐  ┌───────┐
  │ Work  │  │ Yield │  │ Work  │  │ Work  │
  │ (5ms) │  │ → user│  │ (5ms) │  │ (5ms) │
  └───────┘  │ input │  └───────┘  └───────┘
             └───────┘
  React processes work in ~5ms chunks, yielding between each.
  User input is handled immediately during yield points.
```

### Concurrent Rendering is Not a Mode

A common misconception is that concurrent rendering is a separate "mode" that must be enabled. In React 18 and later, concurrent rendering is the default behavior for all applications that use `createRoot`. There is no toggle. However, not every update uses concurrent rendering: only updates marked as transitions or deferred values are rendered concurrently. Standard `setState` calls from event handlers still render synchronously for immediate user feedback.

> **See Also:** Part 2, Chapter 4, Section 4.6 for time slicing mechanics, and Section 4.7 for the lane-based priority system.

---

## 8.2 Interruptible Rendering: Pause, Resume, Abandon

The Fiber architecture enables three capabilities that were impossible with the synchronous stack reconciler:

### Pause and Resume

When React is rendering a transition update and the ~5ms time slice expires, it stores the current `workInProgress` pointer (the next fiber to process) and yields to the browser. On the next available frame, it resumes from exactly that fiber, continuing the depth-first traversal.

```javascript
function SlowList({ items }) {
  return (
    <ul>
      {items.map((item) => (
        // Each SlowItem takes ~1ms to render
        <SlowItem key={item.id} item={item} />
      ))}
    </ul>
  );
}

function SlowItem({ item }) {
  // Simulate expensive render
  const start = performance.now();
  while (performance.now() - start < 1) {} // 1ms artificial delay
  return <li>{item.name}</li>;
}

// With 500 items, synchronous rendering blocks for ~500ms.
// Concurrent rendering processes ~5 items per frame, yielding
// between each chunk. The browser remains responsive throughout.
```

### Abandon (Interrupt and Restart)

If a higher-priority update arrives while a transition render is in progress, React abandons the in-progress work-in-progress tree and starts a new render that incorporates both the high-priority update and the transition update. The abandoned work is discarded; no partial results are committed to the DOM.

```javascript
function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isPending, startTransition] = useTransition();

  function handleChange(e) {
    const value = e.target.value;
    setQuery(value); // Urgent: SyncLane

    startTransition(() => {
      setResults(filterProducts(value)); // Non-urgent: TransitionLane
    });
  }

  // User types "a", "ab", "abc" rapidly:
  // 1. "a" → urgent render updates input, transition starts filtering
  // 2. "ab" → urgent render updates input, ABANDONS "a" transition,
  //           starts new transition for "ab"
  // 3. "abc" → urgent render updates input, ABANDONS "ab" transition,
  //           starts new transition for "abc"
  // Only the "abc" transition ever commits. No wasted DOM updates.
}
```

### The Safety Guarantee

Interruption is safe because:

1. The render phase produces no side effects (Section 7.4 and 5.6 covered this in detail). Abandoned renders have no observable consequences.
2. The commit phase is synchronous and uninterruptible. The user never sees a partially committed update.
3. State updates from abandoned renders are not lost; they are incorporated into the next render.

---

## 8.3 Transitions: Urgent vs Non-Urgent Updates

React classifies every state update into one of two categories:

**Urgent updates** reflect direct user interaction and demand immediate visual feedback: typing into an input, clicking a button, selecting a dropdown option. These are assigned high-priority lanes (SyncLane) and rendered synchronously.

**Transition updates** reflect non-critical UI changes that the user does not expect to be instantaneous: filtering a list, switching tabs, navigating to a new page. These are assigned low-priority lanes (TransitionLanes) and rendered concurrently.

By default, all `setState` calls are urgent. The developer explicitly marks updates as transitions using `startTransition` or `useTransition`.

```javascript
import { useState, useTransition } from "react";

function ProductSearch({ products }) {
  const [query, setQuery] = useState("");
  const [filteredProducts, setFilteredProducts] = useState(products);
  const [isPending, startTransition] = useTransition();

  function handleSearch(e) {
    const value = e.target.value;

    // Urgent: update the input field immediately
    setQuery(value);

    // Transition: filter the list in the background
    startTransition(() => {
      const results = products.filter((p) =>
        p.name.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredProducts(results);
    });
  }

  return (
    <div>
      <input value={query} onChange={handleSearch} placeholder="Search..." />
      {isPending && <div className="loading-bar" />}
      <ProductGrid products={filteredProducts} />
    </div>
  );
}
```

The user types and sees the input update instantly. The product grid updates in the background. If the grid takes 200ms to re-render, the input never stutters because React prioritizes the urgent update over the transition.

### React 19: Async Transitions (Actions)

React 19 extended `startTransition` to accept async functions, creating a pattern the documentation calls "Actions":

```javascript
function PublishButton({ articleId }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  async function handlePublish() {
    startTransition(async () => {
      // isPending becomes true immediately
      try {
        await publishArticle(articleId);
        // State update after async operation
        setError(null);
      } catch (err) {
        setError(err.message);
      }
      // isPending becomes false after all state updates commit
    });
  }

  return (
    <div>
      <button onClick={handlePublish} disabled={isPending}>
        {isPending ? "Publishing..." : "Publish"}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
```

The `isPending` flag remains `true` for the entire duration of the async function, providing a built-in loading state without separate `isLoading` state management.

---

## 8.4 `useTransition` and `useDeferredValue` Mental Models

### useTransition: "I Control the Update, I Want to Defer It"

Use `useTransition` when you own the `setState` call and want to mark it as non-urgent. You get `isPending` for loading feedback and `startTransition` to wrap the update.

```javascript
function TabSwitcher({ tabs }) {
  const [activeTab, setActiveTab] = useState(tabs[0].id);
  const [isPending, startTransition] = useTransition();

  function selectTab(tabId) {
    startTransition(() => {
      setActiveTab(tabId); // Non-urgent: render the new tab content in background
    });
  }

  return (
    <div>
      <nav>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => selectTab(tab.id)}
            className={activeTab === tab.id ? "active" : ""}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {isPending && <div className="tab-loading" />}
      <TabContent tabId={activeTab} />
    </div>
  );
}
```

### useDeferredValue: "I Don't Control the Update, I Want a Deferred Copy"

Use `useDeferredValue` when you receive a value (typically a prop) and want to defer the expensive rendering that depends on it. You do not own the setter, so you cannot wrap it in `startTransition`.

```javascript
function SearchResults({ query }) {
  // query changes on every keystroke (urgent update from parent).
  // deferredQuery lags behind, updating only when React is idle.
  const deferredQuery = useDeferredValue(query);

  // The expensive rendering uses the deferred value.
  // While the deferred value is stale, the component renders
  // with the old query (keeping the previous results visible).
  const isStale = query !== deferredQuery;

  return (
    <div style={{ opacity: isStale ? 0.7 : 1 }}>
      <ExpensiveFilteredList query={deferredQuery} />
    </div>
  );
}
```

### The Key Difference

| Aspect | useTransition | useDeferredValue |
|--------|--------------|------------------|
| What you defer | A state update (the setter call) | A value (typically a prop) |
| Who controls the update | You (you call setState) | Someone else (parent, context) |
| Loading indicator | `isPending` boolean | Compare original vs deferred value |
| Wrapping | Wrap the setState call | Wrap the value |

> **Common Mistake:** Developers sometimes wrap every `setState` call in `startTransition`, assuming it improves performance universally. Transitions add scheduling overhead and delay the update. Only use them for updates where the user does not expect immediate feedback. Wrapping a text input's `onChange` handler entirely in a transition would make typing feel laggy.

---

## 8.5 Suspense: Declarative Loading States

Suspense allows components to "wait" for asynchronous data by declaring a loading state at a boundary level rather than managing loading state imperatively in each component.

### The Suspense Contract

A component signals that it is not ready to render by **suspending**: internally, React detects that a promise is pending (via the `use()` hook or a Suspense-compatible library) and falls back to the nearest `<Suspense>` boundary's `fallback` prop.

```javascript
import { Suspense } from "react";

function App() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<div className="skeleton">Loading chart...</div>}>
        <RevenueChart />
      </Suspense>
      <Suspense fallback={<div className="skeleton">Loading orders...</div>}>
        <RecentOrders />
      </Suspense>
    </div>
  );
}
```

The `<h1>Dashboard</h1>` renders immediately. If `RevenueChart` suspends (its data is still loading), the fallback skeleton is shown in its place. `RecentOrders` renders independently; if its data arrives first, it appears while the chart is still loading.

### Nested Suspense Boundaries

Suspense boundaries nest. The closest ancestor boundary catches the suspension:

```javascript
<Suspense fallback={<PageSkeleton />}>
  <Header />
  <Suspense fallback={<SidebarSkeleton />}>
    <Sidebar />
  </Suspense>
  <Suspense fallback={<ContentSkeleton />}>
    <MainContent />
    <Suspense fallback={<CommentsSkeleton />}>
      <Comments />
    </Suspense>
  </Suspense>
</Suspense>
```

If `Comments` suspends, only `<CommentsSkeleton />` is shown. The rest of the page remains visible. If `MainContent` suspends, `<ContentSkeleton />` replaces both `MainContent` and `Comments` (because `Comments` is inside that boundary). Strategic boundary placement controls the granularity of loading states.

### Suspense with Transitions

When a Suspense boundary is triggered during a transition (not an urgent update), React keeps the old UI visible instead of immediately showing the fallback. The `isPending` flag from `useTransition` indicates that the transition is in progress, allowing the developer to show a subtle loading indicator (a spinner, a dimmed overlay) rather than replacing the entire content with a skeleton.

```javascript
function TabPanel({ tabs }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [isPending, startTransition] = useTransition();

  function selectTab(tabId) {
    startTransition(() => {
      setActiveTab(tabId);
    });
  }

  return (
    <div>
      <TabBar active={activeTab} onSelect={selectTab} />
      <div style={{ opacity: isPending ? 0.6 : 1 }}>
        <Suspense fallback={<TabSkeleton />}>
          <TabContent tabId={activeTab} />
        </Suspense>
      </div>
    </div>
  );
}
// When switching tabs via transition, the old tab content stays visible
// (dimmed to 60% opacity) while the new tab's data loads.
// The fallback skeleton only appears if there is no old content to show
// (e.g., the very first render).
```

---

## 8.6 Suspense for Data Fetching (The Current Model)

### The `use()` Hook

React 19 introduced the `use()` hook for reading promises and context directly in components:

```javascript
import { use, Suspense } from "react";

// The promise is created OUTSIDE the component (e.g., in a loader, a cache,
// or passed from a Server Component). Creating it inside the component
// would create a new promise on every render.
function UserProfile({ userPromise }) {
  // use() suspends the component until the promise resolves.
  // While suspended, React shows the nearest Suspense fallback.
  const user = use(userPromise);

  return (
    <div className="profile">
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
}

function App() {
  const userPromise = fetchUser(42); // Returns a promise (cached/stable)

  return (
    <Suspense fallback={<div>Loading user...</div>}>
      <UserProfile userPromise={userPromise} />
    </Suspense>
  );
}
```

Unlike other hooks, `use()` can be called conditionally:

```javascript
function ConditionalData({ shouldLoad, dataPromise }) {
  if (shouldLoad) {
    const data = use(dataPromise); // Allowed inside a condition
    return <DataView data={data} />;
  }
  return <EmptyState />;
}
```

### Error Handling with Suspense

When a promise passed to `use()` rejects, the error propagates to the nearest Error Boundary:

```javascript
import { Component } from "react";

class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <div className="error">Failed to load: {this.state.error.message}</div>;
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div>Loading...</div>}>
        <UserProfile userPromise={fetchUser(42)} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

> **Common Mistake:** Creating the promise inside the component that calls `use()` causes an infinite suspend-render loop. Each render creates a new promise (new reference), which React treats as a new pending value, causing suspension again. The promise must be created outside the component and passed in as a prop, or cached via a library.

### Streaming SSR and Suspense

On the server, Suspense boundaries integrate with streaming SSR. When a component suspends during server rendering, React sends the fallback HTML to the client immediately and continues rendering other parts of the page. When the suspended data resolves, React streams the completed HTML as a replacement chunk. The client-side hydration then swaps the fallback for the real content.

```
Server timeline:
  1. Render <Header /> → stream HTML immediately
  2. Render <RevenueChart /> → suspends (data loading)
     → stream <div class="skeleton">Loading chart...</div>
  3. Render <RecentOrders /> → data available
     → stream <table>...</table>
  4. RevenueChart data resolves
     → stream replacement HTML for the chart
  5. Client hydration activates interactivity
```

This means the user sees content progressively rather than waiting for the entire page to render on the server.

---

## 8.7 How Concurrent Features Use Fiber's Priority System

Every concurrent feature maps directly to Fiber's lane-based priority system:

### useTransition → TransitionLane

```javascript
startTransition(() => {
  setState(newValue);
  // This update is assigned a TransitionLane (low priority).
  // React uses workLoopConcurrent (interruptible) to process it.
});
```

### useDeferredValue → TransitionLane (internally)

`useDeferredValue` internally creates a transition update for the deferred value. When the original value changes, React schedules a transition-priority re-render with the new deferred value.

### Urgent setState → SyncLane

```javascript
function handleClick() {
  setState(newValue);
  // This update is assigned SyncLane (highest priority).
  // React uses workLoopSync (uninterruptible) to process it.
}
```

### Suspense → Lane Deferral

When a component suspends, its subtree is deferred. React continues processing other parts of the tree that are not suspended. When the promise resolves, React schedules a new render at the appropriate priority to fill in the suspended content.

### The Priority Interrupt Mechanism

```
Timeline: User is typing while a transition renders

1. startTransition(() => setResults(filter(query)))
   → Assigned TransitionLane
   → workLoopConcurrent begins processing fibers

2. After ~5ms, React yields (shouldYield() returns true)
   → Browser handles pending events

3. User types another character → onChange fires
   → setQuery(newValue) assigned SyncLane
   → SyncLane > TransitionLane in priority

4. React detects higher-priority work pending
   → Abandons the in-progress transition WIP tree
   → Processes the SyncLane update synchronously
   → Input updates immediately on screen

5. After SyncLane commit, React restarts the transition
   → New transition incorporates both the SyncLane state and the
     new transition state
   → workLoopConcurrent resumes with fresh data
```

> **See Also:** Part 2, Chapter 4, Section 4.7 for the complete lane hierarchy table and Section 4.8 for `startTransition`'s lane assignment mechanics.

---

## 8.8 Exercise: Build a Search with Transitions vs Without, Compare UX

### Problem Statement

Build two versions of a product search page: one using synchronous rendering (no transitions) and one using `useTransition`. Both versions filter a list of 10,000 products. Compare the input responsiveness, rendering behavior, and user experience.

### Shared Setup: Generate Test Data

```javascript
// Generate 10,000 products for testing
function generateProducts(count) {
  const categories = ["Electronics", "Clothing", "Books", "Home", "Sports"];
  const adjectives = ["Premium", "Classic", "Modern", "Vintage", "Deluxe"];
  const nouns = ["Widget", "Gadget", "Tool", "Device", "Kit"];

  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `${adjectives[i % adjectives.length]} ${nouns[Math.floor(i / adjectives.length) % nouns.length]} ${i + 1}`,
    category: categories[i % categories.length],
    price: Math.round(Math.random() * 200 * 100) / 100,
  }));
}

const allProducts = generateProducts(10000);
```

### Version A: Synchronous (No Transitions)

```javascript
import { useState } from "react";

function SyncSearch() {
  const [query, setQuery] = useState("");

  // Filtering happens during render (synchronous, blocking)
  const filtered = allProducts.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  function handleChange(e) {
    setQuery(e.target.value);
    // This setState triggers a synchronous re-render.
    // The component must filter 10,000 items AND render them
    // before the browser can update the input field.
  }

  return (
    <div>
      <h2>Synchronous Search</h2>
      <input
        value={query}
        onChange={handleChange}
        placeholder="Search products..."
      />
      <p>{filtered.length} results</p>
      <ul>
        {filtered.slice(0, 100).map((p) => (
          <li key={p.id}>
            {p.name} — ${p.price.toFixed(2)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// User experience: typing feels sluggish. Each keystroke blocks
// until filtering and rendering complete. On slow devices, the
// input visibly lags behind the user's typing.
```

### Version B: With useTransition

```javascript
import { useState, useTransition } from "react";

function TransitionSearch() {
  const [query, setQuery] = useState("");
  const [filteredProducts, setFilteredProducts] = useState(allProducts);
  const [isPending, startTransition] = useTransition();

  function handleChange(e) {
    const value = e.target.value;

    // Urgent: update the input immediately
    setQuery(value);

    // Non-urgent: filter the list in the background
    startTransition(() => {
      const results = allProducts.filter((p) =>
        p.name.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredProducts(results);
    });
  }

  return (
    <div>
      <h2>Transition Search</h2>
      <input
        value={query}
        onChange={handleChange}
        placeholder="Search products..."
      />
      <p>
        {filteredProducts.length} results
        {isPending && " (updating...)"}
      </p>
      <div style={{ opacity: isPending ? 0.6 : 1, transition: "opacity 0.2s" }}>
        <ul>
          {filteredProducts.slice(0, 100).map((p) => (
            <li key={p.id}>
              {p.name} — ${p.price.toFixed(2)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// User experience: typing is perfectly responsive. The input
// updates on every keystroke without delay. The results list
// updates asynchronously, with a subtle opacity change indicating
// that filtering is in progress. If the user types faster than
// React can filter, intermediate results are skipped entirely.
```

### Version C: With useDeferredValue (Alternative Approach)

```javascript
import { useState, useDeferredValue } from "react";

function DeferredSearch() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;

  // Filtering uses the deferred query, which lags behind the input
  const filtered = allProducts.filter((p) =>
    p.name.toLowerCase().includes(deferredQuery.toLowerCase())
  );

  return (
    <div>
      <h2>Deferred Value Search</h2>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search products..."
      />
      <p>
        {filtered.length} results
        {isStale && " (updating...)"}
      </p>
      <div style={{ opacity: isStale ? 0.6 : 1, transition: "opacity 0.2s" }}>
        <ul>
          {filtered.slice(0, 100).map((p) => (
            <li key={p.id}>
              {p.name} — ${p.price.toFixed(2)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// This achieves similar UX to the useTransition version but
// with a simpler API: one state variable, one deferred copy.
// Appropriate when the filtering logic is tightly coupled to render.
```

### Comparison

| Metric | Synchronous | useTransition | useDeferredValue |
|--------|-------------|---------------|------------------|
| Input responsiveness | Sluggish (blocked by render) | Instant | Instant |
| Results update timing | Immediate (blocks input) | Deferred (background) | Deferred (background) |
| Intermediate results skipped | No (every keystroke renders) | Yes (stale transitions abandoned) | Yes (stale values deferred) |
| Loading indicator | Not applicable | `isPending` boolean | Compare `query !== deferredQuery` |
| State variables needed | 1 (`query`) | 2 (`query`, `filteredProducts`) | 1 (`query`) + deferred copy |

### Key Takeaway

Concurrent rendering via transitions transforms the user experience of computationally expensive updates from "the entire UI freezes while work completes" to "urgent interactions remain responsive while expensive work happens in the background." The mechanism is not parallelism; it is cooperative scheduling that prioritizes user-facing updates over non-critical work. The choice between `useTransition` and `useDeferredValue` depends on whether you control the state setter (`useTransition`) or are deferring a received value (`useDeferredValue`).

---

## Chapter Summary

Concurrent React is cooperative scheduling on a single thread: React breaks rendering into interruptible units of work, yields to the browser between chunks, and prioritizes urgent updates (user interactions) over transitions (non-critical UI changes). `useTransition` marks state updates as non-urgent, providing an `isPending` indicator while the update renders in the background. `useDeferredValue` creates a lagging copy of a value for the same purpose when the developer does not control the setter. Suspense declares loading states at boundary level, integrating with the `use()` hook for data fetching and with streaming SSR for progressive page rendering. The `useSyncExternalStore` hook prevents tearing (visual inconsistencies caused by external stores changing mid-render) by forcing synchronous snapshots. All concurrent features are built on Fiber's lane-based priority system, where SyncLane handles urgent updates and TransitionLanes handle deferrable work.

## Further Reading

- [useTransition (React Documentation)](https://react.dev/reference/react/useTransition) — official API reference with patterns and caveats
- [useDeferredValue (React Documentation)](https://react.dev/reference/react/useDeferredValue) — official API reference with comparison to useTransition
- [Suspense (React Documentation)](https://react.dev/reference/react/Suspense) — official Suspense boundary reference
- [use (React Documentation)](https://react.dev/reference/react/use) — the new hook for reading promises and context
- [useSyncExternalStore Demystified (Epic React)](https://www.epicreact.dev/use-sync-external-store-demystified-for-practical-react-development-w5ac0) — tearing prevention explained
- [React useTransition: Performance Game Changer or...? (developerway.com)](https://www.developerway.com/posts/use-transition) — practical analysis with benchmarks and edge cases
