# Part 1, Chapter 6: The Event Loop, Microtasks & Async Patterns

## What You Will Learn

- Describe the event loop cycle in precise order: call stack execution, microtask queue drain, rendering opportunity, macrotask selection
- Predict the execution order of `setTimeout`, `Promise.then`, `queueMicrotask`, and `requestAnimationFrame` in any combination
- Explain how React leverages the microtask queue for automatic batching of state updates
- Trace how `async/await` desugars into generators and promises, and what V8 does when it encounters `await`
- Apply structured error handling patterns for asynchronous code using `try/catch`, `.catch()`, and unhandled rejection handlers
- Use `AbortController` to cancel in-flight fetch requests, including the `AbortSignal.timeout()` and `AbortSignal.any()` APIs
- Build a production-quality cancellable fetch wrapper suitable for React `useEffect` cleanup

---

## 6.1 Single-Threaded JavaScript: What It Really Means

JavaScript executes on a single thread. At any given moment, only one piece of JavaScript code is running. There is no parallel execution of two functions, no race condition between two callbacks modifying the same variable, and no need for mutexes or locks.

This single thread runs an **event loop**, a continuously cycling algorithm that picks tasks from queues and executes them one at a time. The browser (or Node.js) provides additional threads for I/O, timers, and rendering, but all JavaScript callback execution happens on the main thread.

```javascript
// This runs entirely on the main thread, blocking everything else
function computeExpensiveResult(iterations) {
  let result = 0;
  for (let i = 0; i < iterations; i++) {
    result += Math.sqrt(i) * Math.sin(i);
  }
  return result;
}

console.log("Before computation");
const result = computeExpensiveResult(100_000_000); // Blocks for several seconds
console.log("After computation:", result);
// During computeExpensiveResult, no click handlers, no animations,
// no setTimeout callbacks, and no rendering can occur.
```

> **See Also:** Part 1, Chapter 1, Section 1.3 for how the call stack manages execution contexts and why a blocked stack freezes the entire thread.

The single-threaded model has a profound implication: **any long-running synchronous operation blocks the entire thread**, preventing UI updates, event handling, and animations. The event loop, combined with asynchronous APIs, is the mechanism that allows JavaScript to remain responsive despite this limitation.

---

## 6.2 The Event Loop Cycle: Call Stack > Microtask Queue > Macrotask Queue

The event loop is defined by the HTML Living Standard (for browsers) and the libuv library (for Node.js). Each iteration of the loop follows a precise sequence.

### The Algorithm

```
┌─────────────────────────────────────────────┐
│               EVENT LOOP CYCLE              │
│                                             │
│  1. Pick ONE task from the macrotask queue  │
│     (if any are ready)                      │
│           │                                 │
│           ▼                                 │
│  2. Execute it to completion                │
│     (call stack must empty)                 │
│           │                                 │
│           ▼                                 │
│  3. Drain the ENTIRE microtask queue        │
│     (including microtasks added during      │
│      microtask processing)                  │
│           │                                 │
│           ▼                                 │
│  4. Rendering opportunity (browser decides) │
│     a. requestAnimationFrame callbacks      │
│     b. Style recalculation                  │
│     c. Layout                               │
│     d. Paint                                │
│           │                                 │
│           ▼                                 │
│  5. Return to step 1                        │
└─────────────────────────────────────────────┘
```

### What Goes Where

| Microtask Queue | Macrotask (Task) Queue | Rendering Phase |
|---|---|---|
| `Promise.then` / `.catch` / `.finally` | `setTimeout` / `setInterval` | `requestAnimationFrame` |
| `queueMicrotask()` | I/O callbacks (network, file) | Style / Layout / Paint |
| `MutationObserver` | UI events (click, keydown, input) | `ResizeObserver` |
| | `MessageChannel` / `postMessage` | `IntersectionObserver` |

### Critical Behavioral Details

**Microtasks drain completely before any macrotask or rendering.** After every macrotask, the engine processes all pending microtasks, including any microtasks enqueued during microtask processing. This means a recursive microtask loop can starve rendering and macrotasks indefinitely.

```javascript
// DANGER: This starves the macrotask queue and rendering
function infiniteMicrotasks() {
  queueMicrotask(() => {
    console.log("microtask");
    infiniteMicrotasks(); // Enqueues another microtask before the queue empties
  });
}
// infiniteMicrotasks(); // The page freezes; setTimeout and rAF never fire
```

**One macrotask per cycle.** The event loop picks exactly one macrotask per iteration (when available). Between each macrotask, the microtask queue is fully drained.

**Rendering is optional.** The browser targets approximately 60 frames per second (one frame every ~16.7ms), but it may skip rendering if nothing has changed or if the tab is not visible. `requestAnimationFrame` callbacks run only when the browser decides to render.

### Tracing Through an Example

```javascript
console.log("A"); // 1. Synchronous: runs immediately

setTimeout(() => console.log("B"), 0); // 2. Schedules macrotask

Promise.resolve().then(() => console.log("C")); // 3. Schedules microtask

queueMicrotask(() => console.log("D")); // 4. Schedules microtask

console.log("E"); // 5. Synchronous: runs immediately
```

**Output:** `A`, `E`, `C`, `D`, `B`

**Trace:**
1. The current macrotask (the script itself) executes synchronously: logs `A`, schedules `B` as a macrotask, schedules `C` as a microtask, schedules `D` as a microtask, logs `E`.
2. The script macrotask completes. The microtask queue is drained: `C`, then `D` (FIFO order).
3. The next event loop iteration picks the `setTimeout` macrotask: logs `B`.

> **React Connection:** React's automatic batching (React 18+) exploits the microtask queue. When multiple `setState` calls occur within the same synchronous execution, React enqueues the batch flush as a microtask. Because microtasks run after all synchronous code completes but before rendering, React processes all state updates in a single render pass. This is why calling `setState` three times in a row does not cause three re-renders.

---

## 6.3 `setTimeout` vs `Promise.then` vs `queueMicrotask` vs `requestAnimationFrame`

Each scheduling mechanism has different timing characteristics. Choosing the right one depends on what you are trying to accomplish.

### `setTimeout(fn, delay)`

Schedules `fn` as a **macrotask** after at least `delay` milliseconds. The actual delay is often longer due to timer clamping (browsers enforce a minimum of ~4ms after 5 levels of nesting) and the fact that the macrotask must wait for the current task, all microtasks, and potentially rendering to complete.

```javascript
console.log("before");
setTimeout(() => console.log("timeout"), 0);
console.log("after");
// Output: "before", "after", "timeout"
```

**Use for:** Deferring non-urgent work to a future event loop iteration; breaking up long computations; implementing delays.

### `Promise.resolve().then(fn)` and `queueMicrotask(fn)`

Both schedule `fn` as a **microtask**, meaning `fn` runs after the current synchronous code completes but before any macrotask or rendering.

```javascript
Promise.resolve().then(() => console.log("promise"));
queueMicrotask(() => console.log("microtask"));
console.log("sync");
// Output: "sync", "promise", "microtask"
// (Both are microtasks; they run in FIFO enqueue order)
```

**The difference:** `queueMicrotask` is more efficient because it enqueues the callback directly without creating a Promise object. `Promise.resolve().then(fn)` creates a resolved Promise and attaches `fn` as a reaction, which involves slightly more overhead.

**Use `queueMicrotask` for:** Scheduling code that must run after the current synchronous code but before the browser renders or processes macrotasks. Common uses include ensuring consistent ordering of operations and batching DOM updates.

**Use `Promise.then` for:** Chaining asynchronous operations that naturally produce Promises (fetch, async function results).

### `requestAnimationFrame(fn)`

Schedules `fn` to run during the **rendering phase** of the event loop, just before the browser paints the next frame. It is neither a microtask nor a macrotask; it belongs to a separate rendering callback queue.

```javascript
requestAnimationFrame(() => {
  console.log("rAF: about to paint");
  // This runs right before the browser commits pixels to the screen
});
```

**Use for:** Animations, visual measurements (reading layout), and any work that should be synchronized with the display refresh rate.

> **Common Mistake:** Using `setTimeout(fn, 0)` for animations instead of `requestAnimationFrame`. A `setTimeout` callback runs at the next available macrotask opportunity, which may not align with the browser's rendering cycle. This causes animations to skip frames or appear janky. `requestAnimationFrame` guarantees that the callback runs exactly once per frame, synchronized with the display.

```javascript
// Wrong: animation with setTimeout
function animateWrong(element, targetX) {
  let x = 0;
  function step() {
    x += 2;
    element.style.transform = `translateX(${x}px)`;
    if (x < targetX) setTimeout(step, 0); // Not synced with display
  }
  step();
}

// Correct: animation with requestAnimationFrame
function animateCorrect(element, targetX) {
  let x = 0;
  function step() {
    x += 2;
    element.style.transform = `translateX(${x}px)`;
    if (x < targetX) requestAnimationFrame(step); // Synced with display
  }
  requestAnimationFrame(step);
}
```

### Execution Order Summary

Given all four mechanisms scheduled at the same time:

```javascript
setTimeout(() => console.log("1: setTimeout"), 0);
requestAnimationFrame(() => console.log("2: rAF"));
Promise.resolve().then(() => console.log("3: Promise"));
queueMicrotask(() => console.log("4: queueMicrotask"));
console.log("5: synchronous");
```

**Guaranteed order:** `5: synchronous`, `3: Promise`, `4: queueMicrotask`

**Likely order for the rest:** `2: rAF`, then `1: setTimeout` (but the relative order of rAF and setTimeout is not guaranteed by the spec; it depends on whether the browser decides to render before processing the timer).

---

## 6.4 Why React Batches State Updates (Event Loop Connection)

React's batching mechanism is a direct application of event loop mechanics. Understanding how batching works requires understanding when microtasks execute.

### Pre-React 18: Batching Only in Synthetic Events

Before React 18, batching only occurred inside React's own event handlers. State updates in asynchronous contexts (setTimeout, fetch.then, native event handlers) triggered a separate re-render for each `setState` call.

```javascript
// React 17: Two separate re-renders inside setTimeout
function Counter() {
  const [count, setCount] = useState(0);
  const [flag, setFlag] = useState(false);

  function handleClick() {
    setTimeout(() => {
      setCount(c => c + 1); // Re-render #1
      setFlag(f => !f);     // Re-render #2
    }, 0);
  }
}
```

### React 18+: Automatic Batching Everywhere

React 18 introduced `createRoot`, which enables automatic batching in all contexts. The mechanism:

1. When `setState` is called, React marks the update as pending but does not immediately re-render.
2. React schedules a flush of pending updates using the microtask queue.
3. All `setState` calls within the same synchronous execution are collected.
4. When the microtask fires (after the synchronous code completes), React processes all queued updates in a single render pass.

```javascript
// React 18+: One re-render, regardless of context
function Counter() {
  const [count, setCount] = useState(0);
  const [flag, setFlag] = useState(false);

  function handleClick() {
    // Both updates are batched into a single re-render
    setTimeout(() => {
      setCount(c => c + 1); // Queued
      setFlag(f => !f);     // Queued
      // Microtask flush: one render with both updates
    }, 0);
  }

  // Also batched inside fetch callbacks, native event handlers, etc.
  async function handleSubmit() {
    const data = await fetchData();
    setCount(data.count);    // Queued
    setFlag(data.isActive);  // Queued
    // One render after both updates
  }
}
```

### `flushSync`: Opting Out of Batching

For rare cases where immediate DOM updates are needed (e.g., measuring layout after a state change), `flushSync` forces a synchronous re-render:

```javascript
import { flushSync } from "react-dom";

function handleClick() {
  flushSync(() => {
    setCount(c => c + 1);
  });
  // DOM is updated here; you can measure it
  const height = elementRef.current.offsetHeight;

  flushSync(() => {
    setFlag(true);
  });
  // DOM is updated again
}
```

> **React Connection:** The connection between React's batching and the event loop is precise. React's scheduler uses `queueMicrotask` (or `MessageChannel` as a fallback) to schedule the batch flush. This guarantees that all synchronous `setState` calls within a single task are collected before React begins rendering. Understanding this explains why `console.log(state)` immediately after `setState` shows the old value: the state update is queued as a microtask, not yet processed.

---

## 6.5 `async/await` Under the Hood (Generators + Promises)

`async/await`, introduced in ES2017, is syntactic sugar over generators and promises. Understanding its desugared form clarifies exactly what happens when the engine encounters `await`.

### What `async` Does to a Function

An `async` function always returns a Promise. If the function returns a value, the Promise is resolved with that value. If the function throws, the Promise is rejected with the error.

```javascript
async function getUser() {
  return { name: "Alice" };
}

// Equivalent to:
function getUser() {
  return Promise.resolve({ name: "Alice" });
}

// Both return a Promise that resolves to { name: "Alice" }
```

### What `await` Does

When the engine encounters `await expression`:

1. It evaluates `expression` and wraps the result in `Promise.resolve()` (if not already a Promise)
2. It **suspends** the async function's execution context, saving all local variables and the program counter
3. It attaches a continuation handler (`.then()`) to the promise
4. It **returns control to the caller**; the async function's implicit promise is still pending
5. When the awaited promise settles, the continuation runs as a **microtask**, resuming the function from the point after `await`

```javascript
async function fetchUserData(userId) {
  console.log("A: before await");

  const response = await fetch(`/api/users/${userId}`);
  // Execution suspends here. Control returns to the caller.
  // When fetch resolves, the function resumes as a microtask.

  console.log("B: after first await");

  const data = await response.json();
  // Suspends again. Resumes when json() resolves.

  console.log("C: after second await");
  return data;
}

console.log("1: before call");
const promise = fetchUserData(42);
console.log("2: after call");

// Output order:
// "1: before call"
// "A: before await"
// "2: after call"          <-- caller regains control when await suspends
// "B: after first await"   <-- resumes as microtask after fetch resolves
// "C: after second await"  <-- resumes as microtask after json() resolves
```

### The Generator Equivalent

The desugared form reveals the mechanics:

```javascript
// async/await version
async function processOrder(orderId) {
  const order = await fetchOrder(orderId);
  const receipt = await chargePayment(order.total);
  return { order, receipt };
}

// Conceptual desugaring using generators
function processOrder(orderId) {
  return runGenerator(function* () {
    const order = yield fetchOrder(orderId);
    const receipt = yield chargePayment(order.total);
    return { order, receipt };
  });
}

function runGenerator(generatorFn) {
  const generator = generatorFn();

  return new Promise((resolve, reject) => {
    function advance(method, value) {
      let result;
      try {
        result = generator[method](value);
      } catch (error) {
        return reject(error);
      }

      if (result.done) {
        return resolve(result.value);
      }

      // Wrap yielded value in Promise.resolve, then advance on resolution
      Promise.resolve(result.value).then(
        (resolved) => advance("next", resolved),
        (rejected) => advance("throw", rejected)
      );
    }

    advance("next", undefined);
  });
}
```

Each `yield` suspends the generator. The runner advances it by calling `generator.next(resolvedValue)`, which resumes execution from the point of suspension. This is exactly what `await` does internally.

> **Common Mistake:** Treating `await` as if it pauses the entire program. It only suspends the current async function. The caller and the rest of the event loop continue running. A common bug is placing sequential `await` calls where they could be parallel:

```javascript
// Sequential: total time = fetchUser time + fetchOrders time
async function loadDashboard(userId) {
  const user = await fetchUser(userId);     // Waits for this...
  const orders = await fetchOrders(userId); // ...then starts this
  return { user, orders };
}

// Parallel: total time = max(fetchUser time, fetchOrders time)
async function loadDashboardFast(userId) {
  const [user, orders] = await Promise.all([
    fetchUser(userId),
    fetchOrders(userId),
  ]);
  return { user, orders };
}
```

---

## 6.6 Error Handling in Async Code: try/catch, `.catch()`, Unhandled Rejections

Asynchronous error handling follows different rules than synchronous code. Errors in callbacks, promises, and async functions each require specific treatment.

### `try/catch` with `async/await`

The `try/catch` statement works naturally with `async/await`, catching both synchronous errors and rejected promises:

```javascript
async function createUser(userData) {
  try {
    validateUserData(userData);                    // Sync: throws if invalid
    const response = await fetch("/api/users", {   // Async: rejects on network error
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const user = await response.json();            // Async: rejects if invalid JSON
    return user;
  } catch (error) {
    // Catches sync throws, fetch rejections, and HTTP errors
    console.error("Failed to create user:", error.message);
    throw error; // Re-throw to propagate to the caller
  }
}
```

### `.catch()` on Promise Chains

For promise-based code (without `async/await`), `.catch()` handles rejections:

```javascript
function loadConfiguration() {
  return fetch("/api/config")
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((config) => {
      validateConfig(config);
      return config;
    })
    .catch((error) => {
      console.error("Config load failed:", error.message);
      return getDefaultConfig(); // Fallback: returns a resolved promise
    });
}
```

A `.catch()` anywhere in the chain catches rejections from any preceding `.then()`. After `.catch()`, the chain continues with a resolved promise (unless `.catch()` itself throws or returns a rejected promise).

### Unhandled Promise Rejections

A promise rejection that is never caught triggers the `unhandledrejection` event in browsers and `process.on('unhandledRejection')` in Node.js. Starting with Node.js 15, unhandled rejections terminate the process by default.

```javascript
// Global handler for unhandled rejections
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled rejection:", event.reason);
  // Report to error tracking service
  errorTracker.captureException(event.reason);
  event.preventDefault(); // Prevent default console error
});
```

### Error Handling Patterns for React

```javascript
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadUser() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/users/${userId}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to load user: ${response.status}`);
        }

        const data = await response.json();
        setUser(data);
      } catch (err) {
        // Distinguish between intentional cancellation and real errors
        if (err.name !== "AbortError") {
          setError(err);
        }
      } finally {
        // Only update loading state if the request was not cancelled
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadUser();
    return () => controller.abort();
  }, [userId]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  return <div>{user.name}</div>;
}
```

> **React Connection:** Error boundaries in React catch errors during rendering, but they do not catch errors inside event handlers or asynchronous code (effects, callbacks). Async errors must be handled with `try/catch` inside the async function itself, with the error state stored via `useState`. This is why the loading/error/data pattern shown above is ubiquitous in React components. See Part 4, Chapter 5 for comprehensive error handling architecture.

---

## 6.7 AbortController for Cancellation (Critical for React Data Fetching)

`AbortController` provides a standard mechanism for cancelling asynchronous operations, most commonly `fetch` requests. In React, it is essential for preventing state updates on unmounted components and avoiding race conditions.

### Basic Usage

```javascript
const controller = new AbortController();

// Pass the signal to fetch
fetch("/api/data", { signal: controller.signal })
  .then((response) => response.json())
  .then((data) => console.log(data))
  .catch((error) => {
    if (error.name === "AbortError") {
      console.log("Request was cancelled");
    } else {
      console.error("Fetch failed:", error);
    }
  });

// Cancel the request at any time
controller.abort();
```

**Key rules:**
- Each `AbortController` instance is **single-use**. Once `abort()` is called, the signal remains aborted permanently. Create a new controller for each new operation.
- `abort()` causes the fetch promise to reject with an `AbortError`. Always check `error.name === "AbortError"` to distinguish cancellation from real errors.
- The signal can be passed to multiple fetch calls; aborting the controller cancels all of them.

### `AbortSignal.timeout()` (Modern API)

Creates a signal that automatically aborts after a specified duration, throwing a `TimeoutError`:

```javascript
// Automatically cancel if the request takes more than 5 seconds
try {
  const response = await fetch("/api/slow-endpoint", {
    signal: AbortSignal.timeout(5000),
  });
  const data = await response.json();
} catch (error) {
  if (error.name === "TimeoutError") {
    console.error("Request timed out after 5 seconds");
  } else if (error.name === "AbortError") {
    console.error("Request was aborted");
  } else {
    console.error("Fetch failed:", error);
  }
}
```

### `AbortSignal.any()` (Modern API)

Combines multiple signals; the resulting signal aborts when any input signal aborts. This enables combining user cancellation with timeout:

```javascript
const userController = new AbortController();

const combinedSignal = AbortSignal.any([
  userController.signal,       // User clicks "Cancel"
  AbortSignal.timeout(10000),  // 10-second timeout
]);

fetch("/api/large-dataset", { signal: combinedSignal })
  .then((response) => response.json())
  .catch((error) => {
    console.error("Request ended:", error.name); // "AbortError" or "TimeoutError"
  });

// User can cancel manually:
cancelButton.addEventListener("click", () => userController.abort());
```

### AbortController in React `useEffect`

The canonical pattern for data fetching with cleanup:

```javascript
function SearchResults({ query }) {
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    if (!query) {
      setResults([]);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();

    async function search() {
      setStatus("loading");

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(`Search failed: ${response.status}`);
        }

        const data = await response.json();
        setResults(data.items);
        setStatus("success");
      } catch (error) {
        if (error.name !== "AbortError") {
          setStatus("error");
        }
        // If AbortError, do nothing: the component has unmounted
        // or the query has changed, so updating state is unnecessary
      }
    }

    search();

    // Cleanup: abort in-flight request when query changes or component unmounts
    return () => controller.abort();
  }, [query]);

  return (
    <div>
      {status === "loading" && <Spinner />}
      {status === "error" && <div>Search failed</div>}
      {status === "success" && results.map((r) => <ResultItem key={r.id} item={r} />)}
    </div>
  );
}
```

This pattern prevents race conditions: if the user types "rea" then "react", the first request for "rea" is aborted before its response can overwrite the results for "react."

> **Common Mistake:** Forgetting to cancel in-flight requests in `useEffect` cleanup. Without `AbortController`, a slow response from a previous query can arrive after a newer response and overwrite it, causing the UI to display stale results. React's Strict Mode (development only) mounts, unmounts, and remounts components to surface this exact bug. If your component sets state without checking for cancellation, you will see console warnings about setting state on unmounted components.

---

## 6.8 Exercise: Predict the Console.log Order in 10 Async Puzzles

### Problem Statement

For each puzzle, predict the exact order of console output. Write your prediction before reading the solution.

---

### Puzzle 1: Basic Ordering

```javascript
console.log("A");
setTimeout(() => console.log("B"), 0);
Promise.resolve().then(() => console.log("C"));
console.log("D");
```

#### Solution

**Output:** `A`, `D`, `C`, `B`

Synchronous code runs first (`A`, `D`). Microtask `C` runs before macrotask `B`.

---

### Puzzle 2: Nested Microtasks

```javascript
Promise.resolve().then(() => {
  console.log("A");
  Promise.resolve().then(() => console.log("B"));
});
Promise.resolve().then(() => console.log("C"));
```

#### Solution

**Output:** `A`, `C`, `B`

Two microtasks are queued: the first (logs `A` and queues `B`) and the second (logs `C`). Microtasks run in FIFO order: the first runs, logging `A` and queueing `B`. The second runs, logging `C`. Then the newly queued `B` runs. The microtask queue is drained completely, including microtasks added during processing.

---

### Puzzle 3: setTimeout Nesting

```javascript
setTimeout(() => {
  console.log("A");
  Promise.resolve().then(() => console.log("B"));
}, 0);
setTimeout(() => console.log("C"), 0);
```

#### Solution

**Output:** `A`, `B`, `C`

The first `setTimeout` callback runs as a macrotask, logging `A` and queueing microtask `B`. Before the next macrotask (`C`), the microtask queue is drained: `B` runs. Then the second `setTimeout` macrotask runs: `C`.

---

### Puzzle 4: async/await Ordering

```javascript
async function main() {
  console.log("A");
  await Promise.resolve();
  console.log("B");
}

console.log("C");
main();
console.log("D");
```

#### Solution

**Output:** `C`, `A`, `D`, `B`

`C` is logged synchronously. `main()` is called: `A` is logged synchronously. `await Promise.resolve()` suspends `main` and returns control to the caller. `D` is logged synchronously. Then the microtask for the resolved promise runs, resuming `main`: `B` is logged.

---

### Puzzle 5: Mixed Timers and Promises

```javascript
setTimeout(() => console.log("A"), 0);
queueMicrotask(() => console.log("B"));
Promise.resolve().then(() => console.log("C"));
setTimeout(() => console.log("D"), 0);
queueMicrotask(() => console.log("E"));
```

#### Solution

**Output:** `B`, `C`, `E`, `A`, `D`

All synchronous code runs first (nothing to log). Microtask queue drains: `B`, `C`, `E` (FIFO order). Then macrotasks: `A`, `D` (FIFO order).

---

### Puzzle 6: Promise Constructor

```javascript
console.log("A");

new Promise((resolve) => {
  console.log("B");
  resolve();
  console.log("C");
}).then(() => console.log("D"));

console.log("E");
```

#### Solution

**Output:** `A`, `B`, `C`, `E`, `D`

The Promise constructor's executor function runs **synchronously**. `A` is logged. Inside the constructor: `B` is logged, the promise is resolved, `C` is logged (resolve does not stop execution). The `.then` callback is queued as a microtask. `E` is logged synchronously. Microtask `D` runs.

---

### Puzzle 7: Async Function Return

```javascript
async function first() {
  console.log("A");
  return "B";
}

first().then((value) => console.log(value));
console.log("C");
```

#### Solution

**Output:** `A`, `C`, `B`

`first()` is called: `A` is logged synchronously. The function returns `"B"`, which is wrapped in a resolved promise. The `.then` callback (logging `"B"`) is queued as a microtask. `C` is logged synchronously. Microtask runs: `B`.

---

### Puzzle 8: Multiple Awaits

```javascript
async function step1() {
  console.log("A");
  await step2();
  console.log("B");
}

async function step2() {
  console.log("C");
  await Promise.resolve();
  console.log("D");
}

console.log("E");
step1();
console.log("F");
```

#### Solution

**Output:** `E`, `A`, `C`, `F`, `D`, `B`

`E` is logged. `step1()` is called: `A` is logged. `step2()` is called: `C` is logged. `await Promise.resolve()` suspends `step2`, returning control up through `step1` (which is also suspended at `await step2()`) to the top level. `F` is logged. Microtask: `step2` resumes, logs `D`, returns (resolving the promise `step1` awaits). Microtask: `step1` resumes, logs `B`.

---

### Puzzle 9: Microtask Inside setTimeout

```javascript
setTimeout(() => {
  console.log("A");
  queueMicrotask(() => {
    console.log("B");
    queueMicrotask(() => console.log("C"));
  });
  console.log("D");
}, 0);

setTimeout(() => console.log("E"), 0);
```

#### Solution

**Output:** `A`, `D`, `B`, `C`, `E`

First macrotask runs: `A` is logged, microtask `B` is queued, `D` is logged. Macrotask completes. Microtask queue drains: `B` runs (logs `B`, queues `C`). `C` runs. Only then does the next macrotask run: `E`.

---

### Puzzle 10: Promise.all and Ordering

```javascript
console.log("A");

Promise.all([
  Promise.resolve().then(() => {
    console.log("B");
    return "b";
  }),
  Promise.resolve().then(() => {
    console.log("C");
    return "c";
  }),
]).then((results) => console.log("D:", results));

Promise.resolve().then(() => console.log("E"));

console.log("F");
```

#### Solution

**Output:** `A`, `F`, `B`, `C`, `E`, `D: ["b","c"]`

`A` and `F` are synchronous. Three microtasks are queued: the two `Promise.resolve().then()` inside `Promise.all`, and the standalone `E` microtask. Microtasks run in FIFO order: `B`, `C`, `E`. After both inner promises resolve, `Promise.all` resolves, queueing a new microtask for the `D` callback. That runs next: `D: ["b","c"]`.

---

### Key Takeaway

The consistent algorithm for predicting async output is: (1) run all synchronous code first, (2) drain the microtask queue completely (including recursively added microtasks), (3) run one macrotask, (4) repeat from step 2. `await` suspends only the current async function and queues the continuation as a microtask. Promise constructors execute synchronously.

---

## 6.9 Exercise: Build a Cancellable Fetch Wrapper

### Problem Statement

Build a reusable `createFetcher` function that:

1. Wraps the Fetch API with automatic AbortController management
2. Supports timeout via `AbortSignal.timeout()`
3. Provides a `.cancel()` method to manually abort the request
4. Handles AbortError gracefully (does not treat cancellation as an error)
5. Is suitable for use in React `useEffect` cleanup

### Starter Code

```javascript
function createFetcher(url, options = {}) {
  // Implement: create an AbortController, combine signals,
  // return an object with { promise, cancel }
}

// Usage should look like:
// const { promise, cancel } = createFetcher("/api/data", { timeout: 5000 });
// promise.then(data => console.log(data)).catch(err => console.error(err));
// cancel(); // Manually abort
```

### Solution

```javascript
function createFetcher(url, options = {}) {
  const {
    timeout = 30000,        // Default 30-second timeout
    ...fetchOptions         // Pass remaining options to fetch
  } = options;

  // Create a controller for manual cancellation
  const controller = new AbortController();

  // Combine manual abort signal with timeout signal
  // If AbortSignal.any is not available, fall back to manual timeout
  let signal;
  if (typeof AbortSignal.any === "function") {
    signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(timeout),
    ]);
  } else {
    // Fallback for older environments
    signal = controller.signal;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    // Clear timeout if request completes
    controller.signal.addEventListener("abort", () => clearTimeout(timeoutId));
  }

  // Create the fetch promise with error normalization
  const promise = fetch(url, { ...fetchOptions, signal })
    .then((response) => {
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.response = response;
        throw error;
      }
      return response.json();
    })
    .catch((error) => {
      // Normalize cancellation: return a special result instead of throwing
      if (error.name === "AbortError") {
        return { cancelled: true, data: null, error: null };
      }
      if (error.name === "TimeoutError") {
        return { cancelled: true, data: null, error: "Request timed out" };
      }
      // Re-throw real errors
      throw error;
    });

  return {
    promise,
    cancel: () => controller.abort(),
  };
}

// ============================================
// Usage in vanilla JavaScript
// ============================================
const { promise, cancel } = createFetcher("/api/products", {
  timeout: 5000,
  headers: { Authorization: "Bearer token123" },
});

promise
  .then((result) => {
    if (result.cancelled) {
      console.log("Request was cancelled or timed out");
      return;
    }
    console.log("Products:", result);
  })
  .catch((error) => {
    console.error("Real error:", error.message);
  });

// Cancel after 2 seconds if still pending
setTimeout(cancel, 2000);
```

### Usage in React

```javascript
function ProductList({ categoryId }) {
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    const { promise, cancel } = createFetcher(
      `/api/products?category=${categoryId}`,
      { timeout: 10000 }
    );

    setStatus("loading");

    promise
      .then((result) => {
        if (result.cancelled) return; // Do nothing on cancellation
        setProducts(result);
        setStatus("success");
      })
      .catch((error) => {
        setStatus("error");
      });

    // Cleanup: cancel on unmount or when categoryId changes
    return cancel;
  }, [categoryId]);

  if (status === "loading") return <div>Loading...</div>;
  if (status === "error") return <div>Failed to load products</div>;
  return (
    <ul>
      {products.map((p) => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  );
}
```

### Key Takeaway

A cancellable fetch wrapper centralizes three concerns: AbortController lifecycle management, timeout handling, and cancellation error normalization. In React, the `.cancel()` method maps directly to the `useEffect` cleanup function, ensuring that in-flight requests are aborted when dependencies change or the component unmounts. This prevents race conditions (stale responses overwriting fresh data) and eliminates "state update on unmounted component" warnings.

> **See Also:** Part 3, Chapter 5, Section 5.2 for a comprehensive treatment of race conditions in React data fetching, and Part 3, Chapter 5, Section 5.4 for the full AbortController integration with React patterns.

---

## Chapter Summary

JavaScript's single thread runs an event loop that cycles through macrotasks, microtask queue drains, and rendering opportunities. Microtasks (Promise callbacks, `queueMicrotask`) always execute before macrotasks (`setTimeout`) and rendering (`requestAnimationFrame`), which is why recursive microtasks can starve the UI. React 18+ exploits this ordering by scheduling batch flushes as microtasks, ensuring all synchronous state updates are processed in a single render. `async/await` is syntactic sugar over generators and promises, where each `await` suspends the function and schedules its continuation as a microtask. `AbortController` provides the standard cancellation mechanism for `fetch` and other async operations, and is essential in React's `useEffect` cleanup to prevent race conditions and stale state updates.

---

## Further Reading

- [MDN: Using Microtasks in JavaScript with queueMicrotask()](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide) — authoritative guide to microtask scheduling
- [MDN: In Depth: Microtasks and the JavaScript Runtime Environment](https://developer.mozilla.org/en-US/docs/Web/API/HTML_DOM_API/Microtask_guide/In_depth) — specification-level detail on microtask processing
- [Event Loop: Microtasks and Macrotasks (javascript.info)](https://javascript.info/event-loop) — interactive tutorial with visualizations
- [Faster Async Functions and Promises (V8 Blog)](https://v8.dev/blog/fast-async) — how V8 optimized `async/await` to one microtick per `await`
- [Automatic Batching for Fewer Renders in React 18](https://github.com/reactwg/react-18/discussions/21) — official explanation of React 18's batching mechanism
- [MDN: AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) — standard API reference for request cancellation
- [MDN: AbortSignal.any()](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static) — combining multiple abort signals
- [Don't Sleep on AbortController (kettanaito.com)](https://kettanaito.com/blog/dont-sleep-on-abort-controller) — advanced patterns and use cases beyond fetch
