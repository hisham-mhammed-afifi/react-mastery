# Part 3, Chapter 2: Hooks - The Complete Deep Dive

## What You Will Learn

- Explain how `useState` persists state between renders via Fiber's hook linked list, and apply lazy initialization and functional updates correctly
- Choose between `useState` and `useReducer` using a concrete decision framework based on state complexity and transition count
- Diagnose and fix the three most common `useEffect` bugs: missing dependencies, infinite loops, and race conditions
- Distinguish `useEffect`, `useLayoutEffect`, and `useInsertionEffect` by their timing relative to DOM mutations and browser paint
- Use `useRef` as both a DOM reference and a mutable instance variable for timers, previous values, and flags
- Apply `useMemo` and `useCallback` judiciously, understanding when the React Compiler makes them unnecessary
- Build custom hooks that compose multiple built-in hooks into reusable, testable abstractions

---

## 2.1 `useState` Internals: How State Persists Between Renders

When a function component calls `useState(initialValue)`, React does not create a new variable each time the component renders. Instead, it reads from (or creates) a node in the hook linked list attached to the component's fiber.

```javascript
function Counter() {
  // On the first render (mount), React creates a hook node:
  //   { memoizedState: 0, queue: {...}, next: null }
  // On subsequent renders (updates), React reads the existing node
  // and returns the current memoizedState value.
  const [count, setCount] = useState(0);

  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

The `setCount` function is bound to the specific hook node via closure. Calling `setCount(5)` enqueues an update on that hook's update queue. React schedules a re-render, during which it processes the queue and computes the new `memoizedState`.

> **See Also:** Part 2, Chapter 7, Section 7.2 for the complete linked-list mechanism, dispatcher pattern, and why hook call order must be consistent.

---

## 2.2 `useState` with Lazy Initialization

When the initial state requires an expensive computation, pass a **function** to `useState` instead of a value:

```javascript
// Expensive: parseJSON runs on EVERY render (result discarded after mount)
function SearchFilters() {
  const [filters, setFilters] = useState(
    JSON.parse(localStorage.getItem("filters") || "{}")
  );
  // ...
}

// Lazy: parseJSON runs ONLY on the first render
function SearchFilters() {
  const [filters, setFilters] = useState(() => {
    return JSON.parse(localStorage.getItem("filters") || "{}");
  });
  // ...
}
```

React calls the initializer function only during the mount phase. On subsequent renders, the function is never invoked. Use lazy initialization whenever the initial value involves:

- Parsing (JSON, URL parameters, cookies)
- Reading from storage (localStorage, sessionStorage, IndexedDB)
- Computing derived values from large datasets
- Creating objects that are expensive to construct

### Storing Functions as State

If the state value itself is a function, the lazy initializer syntax is required to prevent React from treating it as an initializer:

```javascript
// Bug: React calls myValidator() as a lazy initializer
const [validate, setValidate] = useState(myValidator);

// Correct: wrap in an arrow function
const [validate, setValidate] = useState(() => myValidator);

// Updating also requires a wrapper
setValidate(() => newValidator);
```

---

## 2.3 `useState` Gotcha: State Updates Are Asynchronous

Calling `setState` does not immediately change the state value. The update is enqueued, and the current render continues with the old value:

```javascript
function Counter() {
  const [count, setCount] = useState(0);

  function handleClick() {
    setCount(count + 1);
    console.log(count); // Still 0! The state has not changed yet.
    // The new value (1) is visible only in the NEXT render.
  }

  return <button onClick={handleClick}>{count}</button>;
}
```

This is not a bug; it is a consequence of React's rendering model. The `count` variable is a constant within each render. `setCount` schedules a new render where `count` will have the updated value.

> **See Also:** Part 2, Chapter 5, Section 5.8 for how React batches multiple `setState` calls and Section 5.9 for the microtask-based scheduling mechanism.

### Multiple Updates in the Same Handler

```javascript
function Counter() {
  const [count, setCount] = useState(0);

  function handleTripleClick() {
    setCount(count + 1); // Enqueues: set to 0 + 1 = 1
    setCount(count + 1); // Enqueues: set to 0 + 1 = 1 (same stale count!)
    setCount(count + 1); // Enqueues: set to 0 + 1 = 1

    // Result: count becomes 1, not 3
  }
}
```

All three calls read the same `count` (0) from the current render's closure. The solution is functional updates (Section 2.4).

---

## 2.4 Functional Updates: `setState(prev => prev + 1)` and Why It Matters

The functional update form passes a function to `setState`. React calls this function with the **most recent pending state**, not the state from the current render's closure:

```javascript
function Counter() {
  const [count, setCount] = useState(0);

  function handleTripleClick() {
    setCount((prev) => prev + 1); // 0 + 1 = 1
    setCount((prev) => prev + 1); // 1 + 1 = 2
    setCount((prev) => prev + 1); // 2 + 1 = 3

    // Result: count becomes 3
  }
}
```

Each updater function receives the result of the previous update in the queue, forming a chain of transformations.

### When Functional Updates Are Required

1. **Multiple updates in the same event handler** (as shown above).
2. **Updates inside stale closures** (timers, intervals, event listeners captured from old renders).
3. **Updates based on previous state** in any context where the closure might hold a stale value.

```javascript
function Timer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      // Without functional update: always reads seconds=0 from the closure
      // setSeconds(seconds + 1); // Bug: stuck at 1

      // With functional update: reads the latest value
      setSeconds((prev) => prev + 1); // Correct: increments properly
    }, 1000);

    return () => clearInterval(id);
  }, []); // Empty deps: effect captures initial closure

  return <span>{seconds}s</span>;
}
```

> **Common Mistake:** Developers often use the direct form `setCount(count + 1)` when the update depends on the previous value, particularly inside `useEffect` callbacks with stale closures. The rule of thumb: if the new value depends on the old value, always use the functional form `setCount(prev => prev + 1)`.

---

## 2.5 `useReducer`: When State Logic Gets Complex

`useReducer` manages state through a reducer function: a pure function that takes the current state and an action, and returns the new state.

```javascript
const initialState = {
  items: [],
  loading: false,
  error: null,
};

function cartReducer(state, action) {
  switch (action.type) {
    case "ADD_ITEM":
      return {
        ...state,
        items: [...state.items, action.payload],
      };
    case "REMOVE_ITEM":
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.payload),
      };
    case "FETCH_START":
      return { ...state, loading: true, error: null };
    case "FETCH_SUCCESS":
      return { ...state, items: action.payload, loading: false };
    case "FETCH_ERROR":
      return { ...state, error: action.payload, loading: false };
    case "CLEAR":
      return initialState;
    default:
      return state;
  }
}

function ShoppingCart() {
  const [state, dispatch] = useReducer(cartReducer, initialState);

  useEffect(() => {
    dispatch({ type: "FETCH_START" });
    fetch("/api/cart")
      .then((res) => res.json())
      .then((data) => dispatch({ type: "FETCH_SUCCESS", payload: data }))
      .catch((err) => dispatch({ type: "FETCH_ERROR", payload: err.message }));
  }, []);

  if (state.loading) return <Spinner />;
  if (state.error) return <ErrorMessage message={state.error} />;

  return (
    <ul>
      {state.items.map((item) => (
        <li key={item.id}>
          {item.name}
          <button onClick={() => dispatch({ type: "REMOVE_ITEM", payload: item.id })}>
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
```

### Dispatch Stability

React guarantees that `dispatch` has a **stable identity** across renders. It never changes. This makes it safe to pass through Context or include in dependency arrays without causing re-renders or effect re-executions.

---

## 2.6 `useReducer` vs `useState`: Decision Framework

| Factor | `useState` | `useReducer` |
|--------|-----------|-------------|
| State shape | Single primitive or simple object | Object with multiple related fields |
| Number of transitions | 1-3 distinct state changes | 4+ named action types |
| Dependency on previous state | Occasional (use functional update) | Frequent (reducer always receives current state) |
| Testability | Test the component | Test the reducer as a pure function in isolation |
| Dispatch stability | Setter is stable, but wrapper callbacks are not | `dispatch` is guaranteed stable across renders |
| Context integration | Requires wrapping setters in `useCallback` | Pass `dispatch` directly through Context |

**Start with `useState`. Migrate to `useReducer` when:**
- The state object grows beyond 2-3 fields that change together.
- You find yourself writing 4+ event handlers that each call `setState` with different logic.
- You need to pass the updater through Context (dispatch is inherently stable).

---

## 2.7 `useEffect` Complete Guide: Dependencies, Cleanup, Timing

`useEffect` synchronizes a side effect with reactive values. The dependency array declares which values the effect reads; the cleanup function undoes the effect before re-execution or unmount.

```javascript
function DocumentTitle({ title }) {
  useEffect(() => {
    // Setup: synchronize the document title with the prop
    document.title = title;

    // No cleanup needed for this effect
  }, [title]); // Re-runs only when title changes
}

function WebSocketFeed({ channel }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    // Setup: connect to the channel
    const ws = new WebSocket(`wss://feed.example.com/${channel}`);
    ws.onmessage = (event) => {
      setMessages((prev) => [...prev, JSON.parse(event.data)]);
    };

    // Cleanup: disconnect when channel changes or component unmounts
    return () => ws.close();
  }, [channel]); // Re-runs when channel changes

  return (
    <ul>
      {messages.map((msg, i) => (
        <li key={i}>{msg.text}</li>
      ))}
    </ul>
  );
}
```

### Dependency Array Rules

- **Every reactive value** (props, state, derived values) read inside the effect must be listed.
- **Stable values** (`dispatch`, `useRef` objects, imported constants) do not need listing.
- **Omitting the array entirely** means the effect runs after every render.
- **An empty array `[]`** means the effect runs once after mount and cleans up on unmount.

> **See Also:** Part 2, Chapter 6, Section 6.7 for the synchronization mental model and why the dependency array is a declaration, not an optimization.

---

## 2.8 `useEffect` Common Bugs: Missing Deps, Infinite Loops, Race Conditions

### Bug 1: Missing Dependencies

```javascript
function UserGreeting({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch(`/api/users/${userId}`).then((r) => r.json()).then(setUser);
  }, []); // Bug: userId is missing from deps

  // When userId changes, the effect does not re-run.
  // The component shows the old user's data.
}

// Fix: include userId in the dependency array
useEffect(() => {
  fetch(`/api/users/${userId}`).then((r) => r.json()).then(setUser);
}, [userId]);
```

### Bug 2: Infinite Loop

```javascript
function SearchResults({ query }) {
  const [results, setResults] = useState([]);

  useEffect(() => {
    const filtered = allProducts.filter((p) => p.name.includes(query));
    setResults(filtered); // setState triggers re-render, which runs effect again
  }, [query, results]); // Bug: results is in deps, but the effect updates results

  // Fix: remove results from deps (it is not read by the effect)
  // Better: compute derived state during render, no effect needed
  const results = allProducts.filter((p) => p.name.includes(query));
}
```

### Bug 3: Race Condition

```javascript
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Bug: if userId changes rapidly, multiple fetches are in flight.
    // The last one to resolve "wins," but it might not be the latest userId.
    fetch(`/api/users/${userId}`)
      .then((r) => r.json())
      .then((data) => setUser(data));
  }, [userId]);

  // Fix: use a cleanup flag or AbortController
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/users/${userId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setUser(data);
      });

    return () => { cancelled = true; };
  }, [userId]);

  // Better fix: AbortController cancels the request entirely
  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/users/${userId}`, { signal: controller.signal })
      .then((r) => r.json())
      .then(setUser)
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      });

    return () => controller.abort();
  }, [userId]);
}
```

> **Common Mistake:** Creating objects or arrays inside the component body and including them in the dependency array causes the effect to run on every render, because a new reference is created each time. Either move the creation inside the effect, memoize with `useMemo`, or use primitive values as dependencies.

---

## 2.9 `useLayoutEffect`: When You Need Synchronous DOM Reads

`useLayoutEffect` runs synchronously after DOM mutations but before the browser paints. Use it when you need to measure the DOM and apply changes based on those measurements before the user sees the initial render.

```javascript
function Tooltip({ targetRef, text }) {
  const tooltipRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    // Runs before paint: user never sees the tooltip in the wrong position
    const targetRect = targetRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    setCoords({
      top: targetRect.bottom + 8,
      left: targetRect.left + targetRect.width / 2 - tooltipRect.width / 2,
    });
  }, [targetRef]);

  return (
    <div
      ref={tooltipRef}
      className="tooltip"
      style={{ position: "fixed", top: coords.top, left: coords.left }}
    >
      {text}
    </div>
  );
}
```

If this used `useEffect` instead, the tooltip would briefly appear at (0, 0) before jumping to the correct position, creating a visible flicker.

> **See Also:** Part 2, Chapter 5, Section 5.4 for the exact timing of `useLayoutEffect` within the commit phase.

---

## 2.10 `useRef`: More Than Just DOM References

`useRef` returns a mutable object `{ current: initialValue }` that persists for the entire lifetime of the component. While commonly used for DOM element references, its primary value is as a **mutable container that does not trigger re-renders**.

```javascript
// DOM reference: the most common use case
function AutoFocusInput() {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current.focus();
  }, []);

  return <input ref={inputRef} placeholder="Focused on mount" />;
}
```

### Key Property: No Re-render on Mutation

```javascript
function RenderCounter() {
  const renderCount = useRef(0);
  renderCount.current += 1; // Mutate freely; no re-render triggered

  return <span>Renders: {renderCount.current}</span>;
}
```

---

## 2.11 `useRef` as an Instance Variable

### Storing Timer IDs

```javascript
function Stopwatch() {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);

  function start() {
    if (intervalRef.current !== null) return; // Prevent double-start
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
  }

  function stop() {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }

  useEffect(() => {
    return () => clearInterval(intervalRef.current); // Cleanup on unmount
  }, []);

  return (
    <div>
      <span>{elapsed}s</span>
      <button onClick={start}>Start</button>
      <button onClick={stop}>Stop</button>
    </div>
  );
}
```

### Tracking Previous Values

```javascript
function usePrevious(value) {
  const ref = useRef();

  useEffect(() => {
    ref.current = value; // Update AFTER render
  });

  return ref.current; // During render, still holds the previous value
}

function PriceTracker({ price }) {
  const previousPrice = usePrevious(price);
  const direction = previousPrice != null
    ? price > previousPrice ? "up" : price < previousPrice ? "down" : "same"
    : "same";

  return (
    <span className={`price ${direction}`}>
      ${price.toFixed(2)} {direction === "up" ? "▲" : direction === "down" ? "▼" : ""}
    </span>
  );
}
```

### Storing the Latest Callback

```javascript
function useLatestCallback(callback) {
  const ref = useRef(callback);

  useEffect(() => {
    ref.current = callback;
  });

  return useCallback((...args) => ref.current(...args), []);
}
```

This pattern returns a stable function reference that always invokes the latest version of the callback. It prevents stale closures in effects and event handlers without adding the callback to dependency arrays.

---

## 2.12 `useMemo` and `useCallback`: When, Why, and When NOT To

### `useMemo`: Cache an Expensive Computation

```javascript
function ProductList({ products, sortBy }) {
  // Without useMemo: sorts on every render, even if products/sortBy unchanged
  const sorted = useMemo(() => {
    return products.toSorted((a, b) => {
      if (sortBy === "price") return a.price - b.price;
      return a.name.localeCompare(b.name);
    });
  }, [products, sortBy]);

  return (
    <ul>
      {sorted.map((p) => (
        <li key={p.id}>{p.name}: ${p.price}</li>
      ))}
    </ul>
  );
}
```

### `useCallback`: Cache a Function Definition

```javascript
function ParentWithMemoChild() {
  const [count, setCount] = useState(0);

  // Without useCallback: new function reference every render,
  // defeating React.memo on ExpensiveChild
  const handleReset = useCallback(() => {
    setCount(0);
  }, []);

  return (
    <div>
      <button onClick={() => setCount((c) => c + 1)}>{count}</button>
      <ExpensiveChild onReset={handleReset} />
    </div>
  );
}

const ExpensiveChild = React.memo(function ExpensiveChild({ onReset }) {
  console.log("ExpensiveChild rendered");
  return <button onClick={onReset}>Reset</button>;
});
```

### When NOT to Use Them

- **Trivially cheap computations.** `useMemo(() => a + b, [a, b])` adds overhead that exceeds the saved work.
- **No memoized consumers.** `useCallback` is pointless if the child is not wrapped in `React.memo`.
- **The React Compiler handles it.** The React Compiler (v1.0) automatically inserts memoization. For new projects using the compiler, manual `useMemo` and `useCallback` are largely unnecessary.

### The React Compiler Changes Everything

The React Compiler analyzes component code at build time and automatically applies the equivalent of `React.memo`, `useMemo`, and `useCallback` where beneficial. For the ~95% of components that follow the Rules of React (pure rendering, no mutation of external state), the compiler eliminates the need for manual memoization entirely.

Manual memoization remains necessary when:
- Third-party libraries rely on reference equality checks the compiler cannot detect.
- Performance profiling reveals specific cases where the compiler's heuristics are insufficient.

> **See Also:** Part 2, Chapter 7, Section 7.6 for what the React Compiler assumes about component purity.

---

## 2.13 `useId`: Generating Stable IDs for Accessibility

`useId` generates a unique, stable ID that is consistent between server and client rendering. It solves the accessibility requirement of linking form inputs to labels, descriptions, and error messages.

```javascript
function FormField({ label, error, ...inputProps }) {
  const id = useId();

  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={!!error}
        {...inputProps}
      />
      {error && (
        <p id={`${id}-error`} className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// Multiple instances on the same page each get unique IDs
function RegistrationForm() {
  return (
    <form>
      <FormField label="Username" name="username" />
      <FormField label="Email" name="email" type="email" />
      <FormField label="Password" name="password" type="password" />
    </form>
  );
}
// Generated IDs: :r0:, :r1:, :r2: (stable across server/client)
```

Do not use `useId` for list keys. Keys require stable, data-driven identifiers; `useId` generates render-order-dependent identifiers.

---

## 2.14 `useSyncExternalStore`: Bridging External State to React

`useSyncExternalStore` safely reads from external stores (Redux, Zustand, browser APIs) in concurrent rendering without tearing.

```javascript
// Subscribing to browser online/offline status
function useOnlineStatus() {
  return useSyncExternalStore(
    // subscribe: called with a callback that the store should invoke on change
    (callback) => {
      window.addEventListener("online", callback);
      window.addEventListener("offline", callback);
      return () => {
        window.removeEventListener("online", callback);
        window.removeEventListener("offline", callback);
      };
    },
    // getSnapshot: returns the current value (called during render)
    () => navigator.onLine,
    // getServerSnapshot: for SSR (optional)
    () => true
  );
}

function StatusBar() {
  const isOnline = useOnlineStatus();
  return <span className={isOnline ? "online" : "offline"}>
    {isOnline ? "Connected" : "Offline"}
  </span>;
}
```

> **See Also:** Part 2, Chapter 8, Section 8.7 for how `useSyncExternalStore` prevents tearing in concurrent rendering.

---

## 2.15 `useInsertionEffect`: For CSS-in-JS Libraries

`useInsertionEffect` runs before any DOM mutations. It is designed exclusively for CSS-in-JS libraries that need to inject `<style>` tags before `useLayoutEffect` reads the DOM.

```javascript
// For CSS-in-JS library authors ONLY
function useCSS(rule) {
  useInsertionEffect(() => {
    const sheet = document.createElement("style");
    sheet.textContent = rule;
    document.head.appendChild(sheet);
    return () => sheet.remove();
  }, [rule]);
}

function StyledComponent() {
  useCSS(".dynamic-box { background: coral; padding: 16px; border-radius: 8px; }");
  return <div className="dynamic-box">Styled dynamically</div>;
}
```

Application developers should not use `useInsertionEffect` directly. It exists for library authors building CSS-in-JS solutions like Emotion or styled-components.

---

## 2.16 `useImperativeHandle` with `forwardRef`

`useImperativeHandle` customizes the value exposed to a parent component through a ref, creating a controlled imperative API instead of exposing the raw DOM node.

### React 19: No forwardRef Needed

```javascript
// React 19: ref is a regular prop
function VideoPlayer({ src, ref }) {
  const videoRef = useRef(null);

  useImperativeHandle(ref, () => ({
    play() {
      videoRef.current.play();
    },
    pause() {
      videoRef.current.pause();
    },
    seek(time) {
      videoRef.current.currentTime = time;
    },
    // The parent cannot access videoRef.current directly.
    // Only play, pause, and seek are exposed.
  }), []);

  return <video ref={videoRef} src={src} />;
}

// Parent uses the restricted API
function MediaPlayer() {
  const playerRef = useRef(null);

  return (
    <div>
      <VideoPlayer ref={playerRef} src="/video.mp4" />
      <button onClick={() => playerRef.current.play()}>Play</button>
      <button onClick={() => playerRef.current.pause()}>Pause</button>
      <button onClick={() => playerRef.current.seek(0)}>Restart</button>
    </div>
  );
}
```

### Pre-React 19: forwardRef Required

```javascript
// React 18 and earlier
const VideoPlayer = forwardRef(function VideoPlayer({ src }, ref) {
  const videoRef = useRef(null);

  useImperativeHandle(ref, () => ({
    play() { videoRef.current.play(); },
    pause() { videoRef.current.pause(); },
  }), []);

  return <video ref={videoRef} src={src} />;
});
```

`forwardRef` is deprecated in React 19 but still functional. A codemod is available for migration.

---

## 2.17 Exercise: Build 5 Custom Hooks That Combine Multiple Built-in Hooks

### Problem Statement

Build five custom hooks, each composing multiple built-in hooks. Each hook must be reusable across components.

### Hook 1: `useLocalStorage`

```javascript
function useLocalStorage(key, initialValue) {
  // Lazy initialization: read from localStorage on first render only
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  // Sync to localStorage whenever value or key changes
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.error("Failed to write to localStorage:", err);
    }
  }, [key, value]);

  return [value, setValue];
}

// Usage
function ThemeSettings() {
  const [theme, setTheme] = useLocalStorage("theme", "light");
  return (
    <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
      Theme: {theme}
    </button>
  );
}
```

**Key Takeaway:** `useLocalStorage` combines `useState` (with lazy initialization) and `useEffect` (for side-effect synchronization) into a single abstraction that persists state across page reloads.

### Hook 2: `useDebounce`

```javascript
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer); // Cleanup resets the timer
  }, [value, delay]);

  return debouncedValue;
}

// Usage
function SearchInput() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery) {
      fetchSearchResults(debouncedQuery);
    }
  }, [debouncedQuery]); // Only fetches after 300ms of inactivity

  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
}
```

**Key Takeaway:** `useDebounce` composes `useState` and `useEffect` with cleanup to delay value propagation, preventing excessive API calls during rapid user input.

### Hook 3: `useMediaQuery`

```javascript
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handler = (event) => setMatches(event.matches);

    mediaQuery.addEventListener("change", handler);
    // Sync in case the value changed between render and effect
    setMatches(mediaQuery.matches);

    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

// Usage
function ResponsiveLayout({ children }) {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const isTablet = useMediaQuery("(min-width: 640px) and (max-width: 1023px)");

  return (
    <div className={isMobile ? "mobile" : isTablet ? "tablet" : "desktop"}>
      {children}
    </div>
  );
}
```

**Key Takeaway:** `useMediaQuery` composes `useState` (with lazy init) and `useEffect` (with subscription and cleanup) to bridge a browser API into React's reactivity model.

### Hook 4: `useFetch`

```javascript
function useFetch(url) {
  const [state, dispatch] = useReducer(fetchReducer, {
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    dispatch({ type: "FETCH_START" });

    fetch(url, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => dispatch({ type: "FETCH_SUCCESS", payload: data }))
      .catch((err) => {
        if (err.name !== "AbortError") {
          dispatch({ type: "FETCH_ERROR", payload: err.message });
        }
      });

    return () => controller.abort();
  }, [url]);

  return state;
}

function fetchReducer(state, action) {
  switch (action.type) {
    case "FETCH_START":
      return { data: null, loading: true, error: null };
    case "FETCH_SUCCESS":
      return { data: action.payload, loading: false, error: null };
    case "FETCH_ERROR":
      return { data: null, loading: false, error: action.payload };
    default:
      return state;
  }
}

// Usage
function UserProfile({ userId }) {
  const { data: user, loading, error } = useFetch(`/api/users/${userId}`);

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage message={error} />;
  return <h1>{user.name}</h1>;
}
```

**Key Takeaway:** `useFetch` composes `useReducer` (for complex tri-state management) and `useEffect` (with AbortController cleanup) into a reusable data-fetching abstraction. The reducer makes the loading/success/error transitions explicit and testable.

### Hook 5: `useClickOutside`

```javascript
function useClickOutside(ref, handler) {
  // Store the latest handler in a ref to avoid stale closures
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    function handleClick(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        handlerRef.current(event);
      }
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, [ref]); // ref object is stable; handler is read from handlerRef
}

// Usage
function Dropdown({ onClose, children }) {
  const dropdownRef = useRef(null);
  useClickOutside(dropdownRef, onClose);

  return (
    <div ref={dropdownRef} className="dropdown">
      {children}
    </div>
  );
}
```

**Key Takeaway:** `useClickOutside` composes `useRef` (for handler stability and DOM reference), plus `useEffect` (for native event listener management with cleanup). The handler ref pattern avoids the need to list `handler` as a dependency, preventing unnecessary listener re-registration.

---

## Chapter Summary

React's built-in hooks form a layered system: `useState` and `useReducer` manage state; `useEffect`, `useLayoutEffect`, and `useInsertionEffect` synchronize with external systems at different points in the rendering pipeline; `useRef` provides mutable storage without triggering re-renders; `useMemo` and `useCallback` offer manual memoization that the React Compiler is increasingly automating; and specialized hooks (`useId`, `useSyncExternalStore`, `useImperativeHandle`) address specific patterns. Custom hooks compose these primitives into reusable abstractions, extracting both logic and side-effect management from components without adding wrapper elements or changing the component tree structure.

## Further Reading

- [useState (React Documentation)](https://react.dev/reference/react/useState) — official API reference with lazy initialization and functional update examples
- [useReducer (React Documentation)](https://react.dev/reference/react/useReducer) — official reference with dispatch patterns
- [Should I useState or useReducer? (Kent C. Dodds)](https://kentcdodds.com/blog/should-i-usestate-or-usereducer) — the authoritative decision framework
- [useState lazy initialization and function updates (Kent C. Dodds)](https://kentcdodds.com/blog/use-state-lazy-initialization-and-function-updates) — deep dive into initialization patterns
- [When to useMemo and useCallback (Kent C. Dodds)](https://kentcdodds.com/blog/usememo-and-usecallback) — the case against premature memoization
- [A Complete Guide to useEffect (Dan Abramov)](https://overreacted.io/a-complete-guide-to-useeffect/) — the definitive mental model for effects
