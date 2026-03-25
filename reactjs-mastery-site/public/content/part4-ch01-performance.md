# Part 4, Chapter 1: Performance - Measuring Before Optimizing

## What You Will Learn

- Use the React DevTools Profiler and React Performance Tracks to diagnose rendering bottlenecks with confidence
- Navigate Chrome DevTools' Performance tab to identify long tasks, layout thrashing, and main-thread congestion in React applications
- Interpret Core Web Vitals (LCP, INP, CLS) and their direct implications for React architecture decisions
- Distinguish between necessary and unnecessary re-renders using concrete measurement techniques
- Apply `React.memo`, `useMemo`, and `useCallback` only when profiling data justifies their use, and understand how the React Compiler changes this calculus
- Implement virtualization, code splitting, bundle analysis, image optimization, and Web Worker offloading as targeted solutions to measured problems

---

## 1.1 React DevTools Profiler: Reading Flamegraphs

The single most important principle in performance work is: **measure first, optimize second**. The React DevTools Profiler exists precisely for this purpose. It records what React does during a session and presents the results as flamegraphs, ranked charts, and component-level timing data.

### Setting Up the Profiler

The React DevTools browser extension (available for Chrome and Firefox) includes a Profiler tab. Before recording, enable these settings in the DevTools gear icon:

- **Record why each component rendered**: reveals whether a re-render was caused by a state change, a parent re-render, or a context update.
- **Highlight updates when components render**: provides a live visual overlay during interaction.

```javascript
// To enable profiling in production builds, alias react-dom:
// In webpack:
// resolve: { alias: { 'react-dom$': 'react-dom/profiling' } }

// In Vite:
// resolve: { alias: { 'react-dom': 'react-dom/profiling' } }
```

> **Common Mistake:** Profiling a standard production build produces empty results. Production builds strip profiling data by default. You must either profile in development mode or create a dedicated profiling build using the `react-dom/profiling` alias. Development mode adds overhead, so profiling builds offer a more accurate picture of real-world timing.

### Reading the Flamegraph

The flamegraph view shows a hierarchical chart of components, where width represents render time. Each bar is a component; wider bars took longer to render. Color indicates relative render cost: warm colors (yellow, orange) for slow renders and cool colors (blue, teal) for fast ones. Gray bars represent components that did **not** re-render during that commit.

```
┌──────────────────────────────────────────────────────┐
│  App (3.2ms)                                         │
├────────────────────┬─────────────────────────────────┤
│  Header (0.4ms)    │  Dashboard (2.6ms)              │
│                    ├───────────┬─────────────────────┤
│                    │ Sidebar   │ DataGrid (2.1ms)    │
│                    │ (0.3ms)   ├──────────┬──────────┤
│                    │           │ Row×100  │ Filter   │
│                    │           │ (1.8ms)  │ (0.2ms)  │
└────────────────────┴───────────┴──────────┴──────────┘
```

In this example, the `DataGrid` component and its rows consume most of the render time. The `Header` and `Sidebar` render quickly. The flamegraph directs attention to `DataGrid` as the first target for investigation.

### The Ranked Chart

Switch to the ranked chart view to see components sorted by render duration, longest first. This view is useful when the component tree is deep and the flamegraph becomes hard to read. The ranked chart immediately answers: "Which component took the most time during this commit?"

### React Performance Tracks (React 19.2+)

React 19.2 introduced Performance Tracks, which integrate directly into Chrome DevTools' Performance panel. Instead of switching between the React DevTools Profiler tab and Chrome's Performance tab, you see React-specific events on a unified timeline alongside network requests, JavaScript execution, and layout/paint operations.

Four tracks appear:

1. **Scheduler Track**: displays tasks organized by priority (Blocking, Transition, Suspense, Idle). Each render pass shows four phases: Update, Render, Commit, and Remaining Effects.
2. **Components Track**: a flamegraph of component render durations and effect durations, color-coded to match scheduler phases.
3. **Server Track** (development only): visualizes React Server Components promises. Rejected promises appear in red.
4. **Changed Props** (development only): click any component render entry to inspect which props changed, identifying the cause of re-renders.

```javascript
// Performance Tracks are enabled automatically in development builds.
// For profiling builds, use the react-dom/profiling alias.

// Recording: open Chrome DevTools > Performance tab > click Record
// Interact with the app, then stop recording.
// Look for the "React" section in the timeline.
```

Performance Tracks are available only in Chromium-based browsers (Chrome, Edge, Brave, Arc).

---

## 1.2 Chrome DevTools Performance Tab for React

While React DevTools focuses on React-specific rendering, Chrome DevTools' Performance tab provides the full picture: JavaScript execution, layout calculations, painting, compositing, network requests, and memory usage.

### Recording a Performance Trace

1. Open DevTools (F12) and navigate to the **Performance** tab.
2. Set CPU throttling to **6x slowdown** to simulate mid-range mobile devices. Performance work done on a fast development machine often misses issues that users experience on slower hardware.
3. Click the record button, perform the user interaction you want to measure, and stop recording.

### Anatomy of the Trace

The trace consists of several lanes:

- **Network lane**: shows resource loading timelines (scripts, images, fonts).
- **Main thread lane**: the flame chart of JavaScript execution. Each bar is a function call; wider bars took longer. Look for bars labeled with your component names.
- **Frames lane**: vertical bars indicating frame production. Tall bars or gaps indicate dropped frames.
- **Timings lane**: shows performance marks, measures, and Core Web Vitals events.

### Identifying Long Tasks

A **long task** is any main-thread task exceeding 50ms. Long tasks block the browser from responding to user input, causing perceived sluggishness. In the Performance tab, long tasks appear with a red flag in the corner.

```javascript
// You can programmatically observe long tasks:
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.warn('Long task detected:', {
      duration: entry.duration,
      startTime: entry.startTime,
      name: entry.name,
    });
  }
});
observer.observe({ type: 'longtask', buffered: true });
```

### Layout Thrashing

Layout thrashing occurs when JavaScript repeatedly reads a layout property (e.g., `offsetHeight`), then writes to the DOM, forcing the browser to recalculate layout multiple times within a single frame. In the Performance trace, this appears as alternating purple (Layout) and yellow (Script) blocks within a single task.

```javascript
// Layout thrashing: reads and writes interleaved
function resizeElements(elements) {
  elements.forEach((el) => {
    const height = el.offsetHeight; // Forces layout read
    el.style.height = (height * 2) + 'px'; // Triggers layout invalidation
  });
}

// Fixed: batch reads, then batch writes
function resizeElementsBatched(elements) {
  const heights = elements.map((el) => el.offsetHeight); // All reads first
  elements.forEach((el, i) => {
    el.style.height = (heights[i] * 2) + 'px'; // All writes after
  });
}
```

> **React Connection:** React's virtual DOM naturally batches DOM writes during the commit phase, which avoids most layout thrashing. However, code inside `useLayoutEffect` runs synchronously after DOM mutations but before the browser paints. Reading and writing DOM properties inside `useLayoutEffect` can cause layout thrashing if not batched carefully.

### Memory Profiling

In the Performance tab, enable the "Memory" checkbox before recording. A growing heap size that never decreases (a sawtooth pattern that trends upward) indicates a memory leak. Common causes in React applications include:

- Event listeners added in `useEffect` without cleanup
- `setInterval` or `setTimeout` not cleared on unmount
- Stale closures holding references to large objects
- Subscriptions (WebSocket, observable) not unsubscribed

---

## 1.3 Lighthouse and Core Web Vitals

Lighthouse is an automated auditing tool built into Chrome DevTools that scores pages on performance, accessibility, best practices, and SEO. Core Web Vitals are the subset of metrics that Google uses to evaluate real-world user experience.

### The Three Core Web Vitals

**LCP (Largest Contentful Paint)**: measures loading performance. It reports the time at which the largest visible content element (image, video poster, or text block) finishes rendering.

| Rating | Threshold |
|---|---|
| Good | <= 2.5 seconds |
| Needs improvement | 2.5s - 4.0s |
| Poor | > 4.0 seconds |

**INP (Interaction to Next Paint)**: measures responsiveness. It records the latency of every discrete user interaction (click, tap, keypress) during the page's lifetime and reports the worst (or near-worst) value. INP replaced First Input Delay (FID) as a Core Web Vital in March 2024 because FID only measured the delay of the *first* interaction, missing slow interactions that occur later in the session.

| Rating | Threshold |
|---|---|
| Good | <= 200ms |
| Needs improvement | 200ms - 500ms |
| Poor | > 500ms |

**CLS (Cumulative Layout Shift)**: measures visual stability. It quantifies how much visible content shifts unexpectedly during the page's lifetime.

| Rating | Threshold |
|---|---|
| Good | <= 0.1 |
| Needs improvement | 0.1 - 0.25 |
| Poor | > 0.25 |

### Measuring Core Web Vitals

```javascript
// Using the web-vitals library (maintained by Google)
// npm install web-vitals
import { onLCP, onINP, onCLS } from 'web-vitals';

function reportMetric(metric) {
  console.log(metric.name, metric.value, metric.rating);
  // Send to your analytics endpoint
  navigator.sendBeacon('/analytics', JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    navigationType: metric.navigationType,
  }));
}

onLCP(reportMetric);
onINP(reportMetric);
onCLS(reportMetric);
```

### React-Specific Implications

| Metric | React Impact | Common Causes |
|---|---|---|
| LCP | Large JavaScript bundles delay rendering. SSR or streaming SSR improves LCP by sending HTML before JavaScript loads. | Unoptimized images, render-blocking scripts, client-only rendering |
| INP | Expensive re-renders during interaction block the main thread, delaying the next paint. State updates that trigger wide re-render trees directly worsen INP. | Unoptimized event handlers, synchronous state updates triggering large re-renders, heavy computation in render path |
| CLS | Components that render with placeholder dimensions and then shift when data arrives cause layout shift. | Images without width/height, dynamically injected content, web fonts causing FOUT |

> **Common Mistake:** Using `loading="lazy"` on the Largest Contentful Paint element (typically a hero image) delays its load, directly worsening LCP. For above-the-fold images, use `loading="eager"` (the default) and add `fetchPriority="high"` to signal the browser to prioritize that resource.

```javascript
// Hero image: load eagerly with high priority
function HeroBanner({ imageUrl, alt }) {
  return (
    <img
      src={imageUrl}
      alt={alt}
      width={1200}
      height={600}
      fetchPriority="high"
      // Do NOT add loading="lazy" here
    />
  );
}

// Below-the-fold image: lazy load
function ProductCard({ product }) {
  return (
    <img
      src={product.thumbnailUrl}
      alt={product.name}
      width={300}
      height={200}
      loading="lazy"
    />
  );
}
```

---

## 1.4 Identifying Unnecessary Re-Renders

A re-render occurs when React calls a component function to produce new JSX output. Not all re-renders are problems. React's diffing algorithm ensures that only actual DOM changes are committed. The question is not "did it re-render?" but "did the re-render take long enough to cause a visible problem?"

### What Triggers a Re-Render

A component re-renders when:

1. Its **state** changes (via `useState` setter or `useReducer` dispatch).
2. Its **parent** re-renders (even if the props passed to the child have not changed).
3. A **context** it consumes changes.

```javascript
import { useState } from 'react';

function Parent() {
  const [count, setCount] = useState(0);

  // Every time count changes, Parent re-renders.
  // This causes Child to re-render too, even though
  // Child receives no props related to count.
  return (
    <div>
      <button onClick={() => setCount(c => c + 1)}>
        Count: {count}
      </button>
      <Child />
    </div>
  );
}

function Child() {
  console.log('Child rendered'); // Logs on every parent re-render
  return <p>I am a child component</p>;
}
```

### Using the Profiler to Detect Unnecessary Re-Renders

With "Record why each component rendered" enabled in the React DevTools Profiler, each component in the flamegraph shows the reason for its re-render:

- "State changed" (expected)
- "Parent re-rendered" (may or may not be necessary)
- "Context changed" (investigate whether the component needed the changed value)
- "Hooks changed" (a hook's dependencies changed)

The "Highlight updates" feature in the Components tab adds a colored border around components as they re-render. Rapid or widespread flashing during a simple interaction signals re-renders that deserve investigation.

### A Diagnostic Approach

Before optimizing, categorize re-renders:

1. **Necessary and fast**: the component depends on changed data and renders quickly. No action needed.
2. **Unnecessary but fast**: the component re-renders without need, but each render costs under 1ms. Likely not worth optimizing.
3. **Unnecessary and slow**: the component re-renders without need, and each render is expensive. This is the target for optimization.
4. **Necessary and slow**: the component legitimately needs to re-render, but the render itself is expensive. Optimize the render logic (memoize computations, reduce DOM nodes, virtualize lists).

```javascript
// Diagnostic utility: wrap components to measure render time
function withRenderTimer(Component, label) {
  return function TimedComponent(props) {
    const start = performance.now();
    const result = Component(props);
    const duration = performance.now() - start;
    if (duration > 1) {
      console.warn(`${label} render took ${duration.toFixed(2)}ms`);
    }
    return result;
  };
}
```

> **React Connection:** React's Strict Mode in development intentionally double-invokes component functions to help detect side effects. This means you will see twice as many renders in development. Do not use development-mode render counts as a performance metric. Always profile using profiling builds.

---

## 1.5 The Cost of Rendering: When It Actually Matters

React rendering is fast. Calling a component function and producing a virtual DOM tree typically takes microseconds for simple components. The performance cost becomes meaningful only when:

- The component tree is **wide** (hundreds of components re-render simultaneously).
- The component's render logic is **expensive** (large computations, complex JSX structures, or many DOM nodes).
- Re-renders happen at **high frequency** (typing in an input, dragging, scrolling, animation frames).

### Benchmarking Render Cost

```javascript
import { Profiler } from 'react';

function onRenderCallback(
  id,           // The "id" prop of the Profiler tree that committed
  phase,        // "mount" or "update"
  actualDuration, // Time spent rendering the committed update
  baseDuration,   // Estimated time to render the entire subtree without memoization
  startTime,      // When React began rendering this update
  commitTime      // When React committed this update
) {
  if (actualDuration > 5) {
    console.table({
      id,
      phase,
      actualDuration: actualDuration.toFixed(2) + 'ms',
      baseDuration: baseDuration.toFixed(2) + 'ms',
    });
  }
}

function App() {
  return (
    <Profiler id="Dashboard" onRender={onRenderCallback}>
      <Dashboard />
    </Profiler>
  );
}
```

The `actualDuration` is the time React spent rendering the components that actually changed. The `baseDuration` is the estimated time to render the entire subtree from scratch. If `actualDuration` is much smaller than `baseDuration`, memoization is already working effectively.

### The 16ms Budget

At 60 frames per second, the browser has approximately 16.6ms per frame to execute JavaScript, perform layout, paint, and composite. React's render phase consumes part of this budget. If a single render exceeds the budget, the frame drops, and the user perceives jank.

```
  Frame budget: ~16.6ms at 60fps
  ┌─────────────────────────────────────────────┐
  │  JavaScript (React render + commit)  │ Layout│Paint│
  │  ◄────── Keep under ~10ms ──────────►│       │     │
  └─────────────────────────────────────────────┘
```

For interactions that need to feel instantaneous (button clicks, form inputs), aim for total JavaScript execution under 100ms. For animations, stay within the 16ms frame budget.

### When NOT to Optimize

Premature optimization wastes development time and adds complexity. Do not optimize unless:

- Profiling data shows a measurable bottleneck
- Users report sluggish behavior on target devices
- Core Web Vitals metrics fall below "good" thresholds

> **See Also:** Part 3, Chapter 2, Section 2.12 for the foundational explanation of `useMemo` and `useCallback` semantics.

---

## 1.6 `React.memo`: When It Helps, When It Hurts

`React.memo` is a higher-order component that prevents re-rendering when props have not changed (using shallow comparison by default).

### How It Works

```javascript
import { memo, useState } from 'react';

// Without memo: re-renders every time Parent re-renders
function ExpensiveList({ items }) {
  console.log('ExpensiveList rendered');
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}

const MemoizedExpensiveList = memo(ExpensiveList);

function Parent() {
  const [query, setQuery] = useState('');
  const [items] = useState([
    { id: 1, name: 'React' },
    { id: 2, name: 'Vue' },
    { id: 3, name: 'Angular' },
  ]);

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      {/* MemoizedExpensiveList skips re-render when items reference is stable */}
      <MemoizedExpensiveList items={items} />
    </div>
  );
}
```

### When `React.memo` Helps

- The component is **expensive to render** (complex computations, deep JSX trees, many children).
- The component receives **stable props** (primitives, or objects/arrays whose references do not change between renders).
- The component is **rendered frequently** by a parent whose state changes do not affect the child.

### When `React.memo` Hurts (or Is Useless)

```javascript
// PROBLEM: New object created every render defeats memo
function Parent() {
  const [count, setCount] = useState(0);

  // This object is recreated on every render,
  // so memo's shallow comparison always returns false
  const style = { color: 'blue', fontSize: 14 };

  return (
    <div>
      <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
      {/* memo provides zero benefit here because style is always a new reference */}
      <MemoizedChild style={style} />
    </div>
  );
}

const MemoizedChild = memo(function Child({ style }) {
  console.log('Child rendered');
  return <p style={style}>Hello</p>;
});
```

Situations where `React.memo` is counterproductive:

1. **Props change on every render**: memo adds the overhead of a shallow comparison without ever skipping a render.
2. **The component is cheap to render**: the comparison itself may cost more than simply re-rendering.
3. **The component accepts children**: `children` is a new reference on every render unless explicitly memoized.

### Custom Comparison Functions

```javascript
const MemoizedChart = memo(
  function Chart({ data, theme }) {
    // Expensive chart rendering logic
    return <canvas>{/* ... */}</canvas>;
  },
  // Custom comparison: only re-render if data length changes or theme changes
  (prevProps, nextProps) => {
    return (
      prevProps.data.length === nextProps.data.length &&
      prevProps.theme === nextProps.theme
    );
  }
);
```

> **Common Mistake:** Writing custom comparison functions that are too broad (skipping re-renders when data has actually changed) or too narrow (comparing deeply nested objects on every render, which is more expensive than just re-rendering). Custom comparators should be simple, fast, and limited to props that are genuinely expensive to render.

---

## 1.7 `useMemo` and `useCallback`: The Real Rules

These hooks memoize values (`useMemo`) and functions (`useCallback`) to preserve referential identity across renders. They serve two purposes: avoiding expensive recomputation and stabilizing references for downstream `React.memo` or dependency arrays.

### `useMemo` for Expensive Computations

```javascript
import { useMemo, useState } from 'react';

function ProductList({ products, minPrice }) {
  // Without useMemo: this filter + sort runs on every render,
  // even when products and minPrice haven't changed
  const filteredProducts = useMemo(() => {
    console.log('Filtering and sorting products...');
    return products
      .filter((p) => p.price >= minPrice)
      .sort((a, b) => a.price - b.price);
  }, [products, minPrice]);

  return (
    <ul>
      {filteredProducts.map((p) => (
        <li key={p.id}>{p.name}: ${p.price}</li>
      ))}
    </ul>
  );
}
```

### `useCallback` for Stable Function References

```javascript
import { useCallback, useState, memo } from 'react';

const TodoItem = memo(function TodoItem({ todo, onToggle }) {
  console.log(`TodoItem ${todo.id} rendered`);
  return (
    <li>
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => onToggle(todo.id)}
      />
      {todo.text}
    </li>
  );
});

function TodoList() {
  const [todos, setTodos] = useState([
    { id: 1, text: 'Learn React', completed: false },
    { id: 2, text: 'Build app', completed: false },
  ]);

  // Without useCallback, onToggle is a new function every render,
  // defeating the memo on TodoItem
  const onToggle = useCallback((id) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    );
  }, []); // Empty deps: uses functional update, so no external dependencies

  return (
    <ul>
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} onToggle={onToggle} />
      ))}
    </ul>
  );
}
```

### The Rules for When to Use Them

**Use `useMemo` when:**
- The computation is genuinely expensive (filtering/sorting large arrays, complex calculations) AND the result can be reused across renders.
- The value is passed as a prop to a memoized child component and must maintain referential identity.
- The value is used in a dependency array of another hook.

**Use `useCallback` when:**
- The function is passed as a prop to a memoized child component.
- The function is used in a dependency array of `useEffect`, `useMemo`, or another `useCallback`.

**Do NOT use them when:**
- The computation is trivial (simple math, basic string concatenation).
- The result is only used within the same component and nothing downstream depends on referential identity.
- The component does not use `React.memo` and no hook depends on the value's identity.

### The React Compiler (React Forget)

The React Compiler, which reached v1.0 stability in October 2025, is a build-time Babel plugin that automatically memoizes components and values. When enabled, it analyzes component code and inserts memoization where beneficial.

```javascript
// Before the React Compiler: manual memoization
function ProductPage({ productId }) {
  const product = useMemo(() => findProduct(productId), [productId]);
  const handleAddToCart = useCallback(() => {
    addToCart(product);
  }, [product]);

  return <ProductDetails product={product} onAddToCart={handleAddToCart} />;
}

// With the React Compiler: write plain code, memoization is automatic
function ProductPage({ productId }) {
  const product = findProduct(productId);
  const handleAddToCart = () => {
    addToCart(product);
  };

  return <ProductDetails product={product} onAddToCart={handleAddToCart} />;
}
// The compiler inserts the equivalent of useMemo/useCallback at build time.
```

Key facts about the React Compiler:

- Works with React 17, 18, and 19.
- Install: `npm install --save-dev babel-plugin-react-compiler`
- Reported results at Meta: up to 12% faster initial loads and certain interactions up to 2.5x faster.
- Can memoize conditional branches and code after early returns, which manual memoization cannot.
- Existing `useMemo`/`useCallback` calls are safe to leave in place; the compiler works alongside them.
- Requires adherence to the Rules of React (idempotent components, immutable props and state, side effects in effects only).

Even with the compiler, understanding *why* memoization matters remains essential for diagnosing issues and for projects that have not yet adopted the compiler.

> **See Also:** Part 2, Chapter 7, Section 7.1 for the Rules of React that the compiler depends upon.

---

## 1.8 Virtualization: Rendering 10,000 Items

When a component needs to render a list with thousands of items, rendering all of them to the DOM simultaneously creates performance problems: slow initial render, high memory usage, and janky scrolling. Virtualization solves this by rendering only the items currently visible in the viewport, plus a small buffer above and below.

### The Concept

```
  ┌───────────────────────────────┐
  │   Items above viewport        │  ← Not rendered (replaced by spacer)
  │   (e.g., items 0-49)         │
  ├───────────────────────────────┤
  │   Visible viewport            │  ← Only these items exist in the DOM
  │   (e.g., items 50-65)        │
  ├───────────────────────────────┤
  │   Items below viewport        │  ← Not rendered (replaced by spacer)
  │   (e.g., items 66-9999)      │
  └───────────────────────────────┘
```

Instead of rendering 10,000 DOM nodes, virtualization renders approximately 20 (the visible items plus a small overscan buffer), using CSS to position them correctly and maintain accurate scroll height.

### Using @tanstack/react-virtual

TanStack Virtual (formerly react-virtual) is the recommended library for new projects. It is framework-agnostic, headless (no opinion on markup or styling), and supports variable-size items, dynamic measurement, sticky headers, and horizontal/grid layouts.

```javascript
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

function VirtualList({ items }) {
  const parentRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50, // Estimated row height in pixels
    overscan: 5, // Render 5 extra items above and below viewport
  });

  return (
    <div
      ref={parentRef}
      style={{ height: '500px', overflow: 'auto' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {items[virtualItem.index].name}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Using react-window

react-window provides a simpler, component-based API for standard list and grid layouts with fixed or variable sizing.

```javascript
import { FixedSizeList } from 'react-window';

function VirtualListSimple({ items }) {
  const Row = ({ index, style }) => (
    <div style={style}>
      {items[index].name}
    </div>
  );

  return (
    <FixedSizeList
      height={500}
      itemCount={items.length}
      itemSize={50}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

### Choosing Between the Two

| Criterion | @tanstack/react-virtual | react-window |
|---|---|---|
| API style | Headless (hooks) | Component-based |
| Variable row heights | Built-in with dynamic measurement | Requires `VariableSizeList` with manual size tracking |
| Sticky headers/footers | Supported | Requires workarounds |
| Grid support | Supported | `FixedSizeGrid`, `VariableSizeGrid` |
| Bundle size | ~5 KB gzipped | ~6 KB gzipped |
| Maintenance | Actively maintained | Slower maintenance cycle |

### When to Virtualize

Virtualize when the list exceeds approximately 100 items. Below that threshold, the overhead of virtualization (measuring, positioning, handling scroll events) often exceeds the savings from reduced DOM nodes. Profile to confirm.

> **React Connection:** Virtualization fundamentally changes how React manages the component tree. Instead of mounting and unmounting thousands of components, React manages a small pool of component instances that are recycled as the user scrolls. This aligns with React's declarative model: describe what should be visible, and the virtualizer handles which DOM nodes exist.

---

## 1.9 Code Splitting: `React.lazy` + `Suspense` + Dynamic Imports

Code splitting breaks a single large JavaScript bundle into smaller chunks that load on demand. This reduces the initial bundle size, improving both load time and time-to-interactive.

### The Mechanism

JavaScript's dynamic `import()` expression returns a promise that resolves to a module. Bundlers (webpack, Vite, esbuild) recognize `import()` calls and automatically create separate chunks.

```javascript
// Static import: included in the main bundle
import Dashboard from './Dashboard';

// Dynamic import: creates a separate chunk loaded on demand
const DashboardModule = import('./Dashboard');
```

`React.lazy` wraps a dynamic import so React can render the component with `Suspense` as a fallback.

```javascript
import { lazy, Suspense } from 'react';

// Each lazy() call creates a separate chunk
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const Analytics = lazy(() => import('./pages/Analytics'));

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </Suspense>
  );
}

function PageSkeleton() {
  return (
    <div className="page-skeleton">
      <div className="skeleton-header" />
      <div className="skeleton-content" />
    </div>
  );
}
```

### Preloading for Perceived Performance

Loading a chunk only when the user navigates to a route causes a visible loading state. Preloading anticipates the navigation and fetches the chunk in advance.

```javascript
// Preload on hover: user hovers over a navigation link
function NavLink({ to, children, load }) {
  return (
    <Link
      to={to}
      onMouseEnter={() => load()}
      onFocus={() => load()}
    >
      {children}
    </Link>
  );
}

// Usage
const settingsImport = () => import('./pages/Settings');
const Settings = lazy(settingsImport);

function Navigation() {
  return (
    <nav>
      <NavLink to="/settings" load={settingsImport}>
        Settings
      </NavLink>
    </nav>
  );
}
```

```javascript
// Webpack magic comments for browser-level prefetching
const Analytics = lazy(() =>
  import(/* webpackPrefetch: true */ './pages/Analytics')
);
// This injects <link rel="prefetch"> into the document head,
// telling the browser to fetch the chunk during idle time.
```

### Granular Suspense Boundaries

Place `Suspense` boundaries close to lazy components rather than wrapping the entire application. This keeps the rest of the UI interactive while only the lazy section shows a fallback.

```javascript
function DashboardPage() {
  return (
    <div>
      <DashboardHeader /> {/* Renders immediately */}
      <DashboardSidebar /> {/* Renders immediately */}

      {/* Only the chart area shows a fallback while loading */}
      <Suspense fallback={<ChartSkeleton />}>
        <HeavyChart />
      </Suspense>

      {/* Only the table area shows a fallback while loading */}
      <Suspense fallback={<TableSkeleton />}>
        <DataTable />
      </Suspense>
    </div>
  );
}

const HeavyChart = lazy(() => import('./components/HeavyChart'));
const DataTable = lazy(() => import('./components/DataTable'));
```

### Error Handling with Lazy Components

Network failures during chunk loading cause the lazy component's promise to reject. Without an error boundary, this crashes the entire application.

```javascript
import { Component, lazy, Suspense } from 'react';

class LazyErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div>
          <p>Failed to load this section.</p>
          <button onClick={() => this.setState({ hasError: false })}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Wrap lazy components in both ErrorBoundary and Suspense
function ProtectedLazySection() {
  return (
    <LazyErrorBoundary>
      <Suspense fallback={<LoadingSpinner />}>
        <LazyComponent />
      </Suspense>
    </LazyErrorBoundary>
  );
}
```

> **Common Mistake:** `React.lazy` only supports default exports. If the target module uses named exports, create an intermediate module that re-exports the component as default, or use an inline wrapper:

```javascript
// Module uses named export:
// export function Analytics() { ... }

// Inline wrapper for React.lazy:
const Analytics = lazy(() =>
  import('./Analytics').then((module) => ({ default: module.Analytics }))
);
```

> **See Also:** Part 4, Chapter 5 for comprehensive error boundary architecture.

---

## 1.10 Bundle Analysis and Tree Shaking

A large JavaScript bundle is one of the most common performance problems in React applications. Bundle analysis reveals what is in the bundle, how large each dependency is, and where size can be reduced.

### Bundle Analysis Tools

**For Vite/Rollup projects:**

```javascript
// vite.config.js
import { visualizer } from 'rollup-plugin-visualizer';

export default {
  plugins: [
    visualizer({
      open: true, // Automatically open the report in the browser
      gzipSize: true,
      brotliSize: true,
      filename: 'bundle-report.html',
    }),
  ],
};
```

**For webpack projects:**

```javascript
// webpack.config.js
const BundleAnalyzerPlugin =
  require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  plugins: [
    new BundleAnalyzerPlugin({
      analyzerMode: 'static', // Generates an HTML file
      openAnalyzer: true,
    }),
  ],
};
```

**Universal (source-map-explorer):**

```bash
# Works with any bundler that produces source maps
npx source-map-explorer dist/assets/*.js
```

### Reading the Treemap

The treemap shows rectangles proportional to file size. Large rectangles indicate large modules. Look for:

1. **Entire library imports**: a rectangle for `lodash` (71 KB) when only `debounce` (1 KB) is used.
2. **Duplicate packages**: two different versions of the same library included due to dependency conflicts.
3. **Unused dependencies**: libraries imported but never called.
4. **Large polyfills**: polyfills for features already supported by your target browsers.

### Tree Shaking

Tree shaking is the process by which bundlers eliminate unused code from the final output. It works by analyzing static `import`/`export` statements to determine which exports are actually used.

```javascript
// Tree-shakeable: ES module with named exports
// The bundler can remove unused exports
import { debounce } from 'lodash-es'; // Only debounce is included

// NOT tree-shakeable: CommonJS module
const _ = require('lodash'); // Entire library is included
const debounce = _.debounce;
```

**Requirements for tree shaking:**
- Use ES module syntax (`import`/`export`), not CommonJS (`require`/`module.exports`).
- The library must mark itself as side-effect-free via `"sideEffects": false` in its `package.json`.
- Avoid re-exporting everything through barrel files (`index.js` that re-exports all modules), as some bundlers cannot tree-shake through barrel files efficiently.

```javascript
// Barrel file that can hurt tree shaking:
// src/utils/index.js
export { formatDate } from './formatDate';
export { formatCurrency } from './formatCurrency';
export { calculateTax } from './calculateTax';
// ... 50 more exports

// If you import one function, some bundlers may include all of them.
// Direct imports are safer:
import { formatDate } from './utils/formatDate';
```

### Practical Size Reduction Strategies

```javascript
// 1. Replace heavy libraries with lighter alternatives
// moment.js (67 KB gzipped) → date-fns (tree-shakeable, import only what you need)
import { format, parseISO } from 'date-fns';

// 2. Use direct imports for large libraries
// Bad: imports entire icon library
import { FaHome, FaUser } from 'react-icons/fa';
// Better: import individual icons (if the library supports it)
import FaHome from 'react-icons/fa/FaHome';

// 3. Audit with bundler analysis
// Run: npx vite-bundle-visualizer
// or: npx webpack-bundle-analyzer stats.json
```

> **React Connection:** React itself is approximately 40 KB gzipped (react + react-dom). This is a fixed cost. The variable cost comes from application code and third-party libraries. Every dependency added to a React project increases the time users wait before the application becomes interactive. Bundle analysis makes these costs visible.

---

## 1.11 Image Optimization Strategies

Images are often the largest assets on a page, frequently responsible for slow LCP and unnecessary bandwidth consumption.

### Responsive Images with `srcSet`

Serve different image sizes based on viewport width so mobile users do not download desktop-sized images.

```javascript
function ResponsiveImage({ src, alt, sizes }) {
  return (
    <img
      srcSet={`
        ${src}?w=400 400w,
        ${src}?w=800 800w,
        ${src}?w=1200 1200w,
        ${src}?w=1600 1600w
      `}
      sizes={sizes || '(max-width: 600px) 400px, (max-width: 1024px) 800px, 1200px'}
      src={`${src}?w=800`}
      alt={alt}
      loading="lazy"
      decoding="async"
    />
  );
}
```

### Modern Image Formats

AVIF and WebP offer significant size reductions over JPEG and PNG. Use the `<picture>` element to provide multiple formats with fallbacks.

```javascript
function OptimizedImage({ src, alt, width, height, priority }) {
  return (
    <picture>
      {/* Browser picks the first supported format */}
      <source srcSet={`${src}.avif`} type="image/avif" />
      <source srcSet={`${src}.webp`} type="image/webp" />
      <img
        src={`${src}.jpg`}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
      />
    </picture>
  );
}
```

### Preventing Layout Shift

Always specify `width` and `height` attributes on images. Without explicit dimensions, the browser cannot reserve space for the image before it loads, causing content to shift when the image appears.

```javascript
// Bad: causes CLS when the image loads
function Avatar({ user }) {
  return <img src={user.avatarUrl} alt={user.name} />;
}

// Good: reserves space, prevents CLS
function Avatar({ user }) {
  return (
    <img
      src={user.avatarUrl}
      alt={user.name}
      width={48}
      height={48}
      style={{ borderRadius: '50%' }}
    />
  );
}
```

### Lazy Loading with Intersection Observer

For image galleries or content-heavy pages, native `loading="lazy"` works for most cases. For more control (e.g., custom thresholds or placeholder effects), use the Intersection Observer API.

```javascript
import { useEffect, useRef, useState } from 'react';

function LazyImage({ src, alt, width, height, placeholder }) {
  const imgRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // Start loading 200px before viewport
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={imgRef}
      style={{
        width,
        height,
        backgroundColor: placeholder || '#e0e0e0',
        overflow: 'hidden',
      }}
    >
      {isInView && (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          onLoad={() => setIsLoaded(true)}
          style={{
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity 0.3s ease-in-out',
          }}
        />
      )}
    </div>
  );
}
```

### Build-Time Image Optimization

For Vite projects, `vite-imagetools` provides build-time image transformation:

```javascript
// Import with query parameters for transformation
import heroAvif from './hero.jpg?format=avif&w=1200';
import heroWebp from './hero.jpg?format=webp&w=1200';
import heroJpg from './hero.jpg?w=1200&quality=80';
```

For non-framework setups, tools like Sharp (Node.js), Squoosh, or ImageOptim handle pre-build compression.

---

## 1.12 Web Workers for Heavy Computation

JavaScript is single-threaded: all application code, rendering, and event handling share the main thread. CPU-intensive operations (sorting millions of records, parsing large files, complex calculations) block the main thread, freezing the UI. Web Workers run JavaScript in a separate thread, keeping the main thread responsive.

### Basic Web Worker Usage

```javascript
// worker.js - runs in a separate thread
self.addEventListener('message', (event) => {
  const { data, sortField, sortDirection } = event.data;

  // Expensive sort operation: does not block the main thread
  const sorted = [...data].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    const direction = sortDirection === 'asc' ? 1 : -1;
    return aVal > bVal ? direction : aVal < bVal ? -direction : 0;
  });

  self.postMessage({ sorted });
});
```

```javascript
// React component using the worker
import { useEffect, useRef, useState, useCallback } from 'react';

function SortableDataTable({ data }) {
  const workerRef = useRef(null);
  const [sortedData, setSortedData] = useState(data);
  const [sorting, setSorting] = useState(false);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('./worker.js', import.meta.url)
    );

    workerRef.current.addEventListener('message', (event) => {
      setSortedData(event.data.sorted);
      setSorting(false);
    });

    // Terminate worker on unmount to prevent memory leaks
    return () => workerRef.current.terminate();
  }, []);

  const handleSort = useCallback((sortField, sortDirection) => {
    setSorting(true);
    workerRef.current.postMessage({ data, sortField, sortDirection });
  }, [data]);

  return (
    <div>
      <TableHeader onSort={handleSort} />
      {sorting ? <LoadingOverlay /> : <TableBody data={sortedData} />}
    </div>
  );
}
```

### Simplifying with Comlink

Comlink (by the Google Chrome team) wraps `postMessage` with a proxy-based RPC interface, making worker communication feel like regular async function calls.

```javascript
// heavy-computation.worker.js
import { expose } from 'comlink';

const api = {
  sortLargeDataset(data, field, direction) {
    return [...data].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      const dir = direction === 'asc' ? 1 : -1;
      return aVal > bVal ? dir : aVal < bVal ? -dir : 0;
    });
  },

  parseCSV(csvString) {
    const lines = csvString.split('\n');
    const headers = lines[0].split(',');
    return lines.slice(1).map((line) => {
      const values = line.split(',');
      return headers.reduce((obj, header, i) => {
        obj[header.trim()] = values[i]?.trim();
        return obj;
      }, {});
    });
  },
};

expose(api);
```

```javascript
// React hook wrapping the worker
import { wrap } from 'comlink';
import { useEffect, useRef, useMemo } from 'react';

function useWorker() {
  const workerRef = useRef(null);

  const api = useMemo(() => {
    workerRef.current = new Worker(
      new URL('./heavy-computation.worker.js', import.meta.url)
    );
    return wrap(workerRef.current);
  }, []);

  useEffect(() => {
    return () => workerRef.current?.terminate();
  }, []);

  return api;
}

// Usage in a component
function DataProcessor({ rawCSV }) {
  const worker = useWorker();
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;

    worker.parseCSV(rawCSV).then((parsed) => {
      if (!cancelled) setData(parsed);
    });

    return () => { cancelled = true; };
  }, [rawCSV, worker]);

  if (!data) return <p>Processing...</p>;
  return <DataTable data={data} />;
}
```

### When to Use Web Workers

| Use Case | Worker Appropriate? |
|---|---|
| Sorting/filtering > 10,000 records | Yes |
| JSON parsing of multi-MB payloads | Yes |
| Image processing (resize, crop, compress) | Yes |
| Cryptographic operations | Yes |
| Simple array filter (< 1000 items) | No (overhead exceeds benefit) |
| DOM manipulation | No (workers cannot access the DOM) |
| Fetching data from an API | No (use `fetch` on the main thread with async/await) |

> **Common Mistake:** Creating a new Worker instance on every render. Workers have a startup cost, so create them once (in a `useEffect` or `useMemo`) and reuse them. Always terminate workers when the component unmounts to prevent memory leaks.

---

## 1.13 Exercise: Profile a Slow App, Identify Bottlenecks, Optimize, Measure Again

### Problem Statement

You are given a React application that renders a product catalog with filtering and sorting capabilities. The application is noticeably slow: typing in the search filter feels sluggish, switching sort order takes over a second, and the initial render is delayed. Your task is to profile the application, identify the bottlenecks, apply targeted optimizations, and verify the improvements with measurements.

### Starter Code

```javascript
// App.jsx - The slow application
import { useState } from 'react';

// Simulate a large dataset
function generateProducts(count) {
  const categories = ['Electronics', 'Clothing', 'Books', 'Home', 'Sports'];
  const products = [];
  for (let i = 0; i < count; i++) {
    products.push({
      id: i,
      name: `Product ${i} - ${categories[i % categories.length]}`,
      price: Math.round(Math.random() * 500 * 100) / 100,
      category: categories[i % categories.length],
      rating: Math.round(Math.random() * 5 * 10) / 10,
      description: `This is a detailed description for product ${i}. `.repeat(3),
    });
  }
  return products;
}

// Problem 1: Data generated on every render
const ALL_PRODUCTS = generateProducts(10000);

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Problem 2: Expensive computation runs on every render, even if
  // unrelated state (like an unrelated parent) changes
  const filteredProducts = ALL_PRODUCTS
    .filter((p) => {
      const matchesSearch = p.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === 'All' || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      if (a[sortField] > b[sortField]) return dir;
      if (a[sortField] < b[sortField]) return -dir;
      return 0;
    });

  return (
    <div>
      <h1>Product Catalog</h1>

      <div>
        <input
          type="text"
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          <option value="All">All Categories</option>
          <option value="Electronics">Electronics</option>
          <option value="Clothing">Clothing</option>
          <option value="Books">Books</option>
          <option value="Home">Home</option>
          <option value="Sports">Sports</option>
        </select>

        <select
          value={sortField}
          onChange={(e) => setSortField(e.target.value)}
        >
          <option value="name">Name</option>
          <option value="price">Price</option>
          <option value="rating">Rating</option>
        </select>

        <button
          onClick={() =>
            setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
          }
        >
          {sortDirection === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {/* Problem 3: Rendering all 10,000 items to the DOM */}
      <div>
        {filteredProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}

// Problem 4: Expensive component with no memoization
function ProductCard({ product }) {
  // Simulating expensive render logic
  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(product.price);

  const stars = '★'.repeat(Math.round(product.rating)) +
    '☆'.repeat(5 - Math.round(product.rating));

  return (
    <div style={{ border: '1px solid #ccc', padding: 12, margin: 8 }}>
      <h3>{product.name}</h3>
      <p>{formattedPrice}</p>
      <p>{stars} ({product.rating})</p>
      <p>{product.category}</p>
      <p>{product.description}</p>
    </div>
  );
}

export default App;
```

### Step-by-Step Profiling Process

**Step 1: Establish a baseline.** Open the React DevTools Profiler, click Record, type a character into the search input, and stop recording. Note the render duration. Repeat for changing the sort direction.

**Step 2: Enable "Record why each component rendered."** Observe that every `ProductCard` re-renders on every keystroke, even if the product data has not changed.

**Step 3: Open Chrome DevTools Performance tab with 6x CPU throttle.** Record the same interaction. Look for long tasks (red flags on tasks > 50ms).

### Solution

```javascript
// App.jsx - The optimized application
import { useState, useMemo, useCallback, memo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

// Data generated once, outside the component (this was already correct)
const ALL_PRODUCTS = generateProducts(10000);

function generateProducts(count) {
  const categories = ['Electronics', 'Clothing', 'Books', 'Home', 'Sports'];
  const products = [];
  for (let i = 0; i < count; i++) {
    products.push({
      id: i,
      name: `Product ${i} - ${categories[i % categories.length]}`,
      price: Math.round(Math.random() * 500 * 100) / 100,
      category: categories[i % categories.length],
      rating: Math.round(Math.random() * 5 * 10) / 10,
      description: `This is a detailed description for product ${i}. `.repeat(3),
    });
  }
  return products;
}

// Fix 4: Memoize the ProductCard to skip re-renders when props are stable
const ProductCard = memo(function ProductCard({ product }) {
  const formattedPrice = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(product.price);

  const stars = '★'.repeat(Math.round(product.rating)) +
    '☆'.repeat(5 - Math.round(product.rating));

  return (
    <div style={{ border: '1px solid #ccc', padding: 12, margin: 8 }}>
      <h3>{product.name}</h3>
      <p>{formattedPrice}</p>
      <p>{stars} ({product.rating})</p>
      <p>{product.category}</p>
      <p>{product.description}</p>
    </div>
  );
});

function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const parentRef = useRef(null);

  // Fix 2: Memoize the expensive filter + sort computation
  const filteredProducts = useMemo(() => {
    return ALL_PRODUCTS
      .filter((p) => {
        const matchesSearch = p.name
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        const matchesCategory =
          selectedCategory === 'All' || p.category === selectedCategory;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        const dir = sortDirection === 'asc' ? 1 : -1;
        if (a[sortField] > b[sortField]) return dir;
        if (a[sortField] < b[sortField]) return -dir;
        return 0;
      });
  }, [searchQuery, selectedCategory, sortField, sortDirection]);

  // Fix 3: Virtualize the list to render only visible items
  const virtualizer = useVirtualizer({
    count: filteredProducts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150, // Estimated card height
    overscan: 10,
  });

  const toggleDirection = useCallback(() => {
    setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
  }, []);

  return (
    <div>
      <h1>Product Catalog</h1>
      <p>Showing {filteredProducts.length} products</p>

      <div>
        <input
          type="text"
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          <option value="All">All Categories</option>
          <option value="Electronics">Electronics</option>
          <option value="Clothing">Clothing</option>
          <option value="Books">Books</option>
          <option value="Home">Home</option>
          <option value="Sports">Sports</option>
        </select>

        <select
          value={sortField}
          onChange={(e) => setSortField(e.target.value)}
        >
          <option value="name">Name</option>
          <option value="price">Price</option>
          <option value="rating">Rating</option>
        </select>

        <button onClick={toggleDirection}>
          {sortDirection === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {/* Fix 3: Virtualized list container */}
      <div
        ref={parentRef}
        style={{ height: '600px', overflow: 'auto' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <ProductCard
                product={filteredProducts[virtualItem.index]}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
```

### What Each Fix Addresses

| Problem | Symptom | Fix | Impact |
|---|---|---|---|
| Unoptimized filter/sort | 10,000-item filter+sort on every render | `useMemo` with proper deps | Filter/sort skipped when inputs unchanged |
| 10,000 DOM nodes | Slow initial render, scroll jank | Virtualization with `@tanstack/react-virtual` | Only ~15 DOM nodes at any time |
| All ProductCards re-render | Every card re-renders on keystroke | `React.memo` on ProductCard | Only cards with changed data re-render |
| Sort toggle creates new function | Minor: new function ref on every render | `useCallback` for toggle handler | Stable reference (minor gain here) |

### Verification Process

After applying optimizations, repeat the profiling:

1. **React DevTools Profiler**: record the same search-typing interaction. Compare the flamegraph. The commit duration should drop dramatically (from hundreds of milliseconds to single-digit milliseconds for stable states).
2. **Chrome Performance tab**: record with 6x throttle. Long tasks should be eliminated or significantly shortened.
3. **Quantitative comparison**: use the `<Profiler>` component to log `actualDuration` before and after. Expect a 10x or greater improvement for scroll and filter interactions.

### Key Takeaway

Performance optimization is a disciplined, measurement-driven process. The workflow is always: **profile, identify the specific bottleneck, apply a targeted fix, and measure again**. The three most impactful optimizations for React applications are: (1) memoizing expensive computations, (2) virtualizing long lists, and (3) preventing unnecessary re-renders of expensive components. Apply each only when profiling data justifies it.

---

## Chapter Summary

Performance optimization in React is a measurement-first discipline. The React DevTools Profiler and Chrome DevTools Performance tab provide the data needed to identify bottlenecks before writing any optimization code. Core Web Vitals (LCP, INP, CLS) define the thresholds that matter to real users. The tools for addressing measured problems include `React.memo`, `useMemo`, and `useCallback` for controlling re-renders; virtualization for long lists; `React.lazy` with `Suspense` for code splitting; bundle analysis for identifying bloat; responsive images and modern formats for media optimization; and Web Workers for offloading CPU-intensive computation. The React Compiler automates much of the memoization work, but understanding the underlying principles remains essential for diagnosing and solving performance issues that tooling alone cannot address.

## Further Reading

- [React DevTools Profiler](https://react.dev/reference/react/Profiler) (official React documentation)
- [React Performance Tracks](https://react.dev/blog/2025/04/21/react-19-2#react-performance-tracks) (React 19.2 announcement)
- [React Compiler v1.0](https://react.dev/blog/2025/10/07/react-compiler-1) (official React blog)
- [Interaction to Next Paint (INP)](https://web.dev/articles/inp) (web.dev)
- [Understanding useMemo and useCallback](https://www.joshwcomeau.com/react/usememo-and-usecallback/) (Josh Comeau)
- [TanStack Virtual Documentation](https://tanstack.com/virtual/latest) (official docs)
- [Code Splitting with React.lazy and Suspense](https://web.dev/articles/code-splitting-suspense) (web.dev)
- [Comlink: Web Workers Made Easy](https://github.com/GoogleChromeLabs/comlink) (Google Chrome Labs)
