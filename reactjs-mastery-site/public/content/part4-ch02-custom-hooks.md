# Part 4, Chapter 2: Custom Hooks Architecture

## What You Will Learn

- Apply the core design principles that distinguish well-architected custom hooks from ad-hoc extractions
- Compose complex domain hooks from small, single-purpose utility hooks using a clear layering strategy
- Choose the correct return value shape (tuple, object, or hybrid) for a given hook's contract
- Design hooks that accept configuration objects with sensible defaults, following the patterns established by TanStack Query and SWR
- Implement ref-stable callbacks using `useEffectEvent` (React 19.2+) and understand why the older "latest ref" pattern is now superseded
- Test custom hooks effectively using `renderHook` and `act` from `@testing-library/react`
- Build a library of 10 production-ready hooks covering storage, media queries, debouncing, click-outside detection, intersection observation, and more

---

## 2.1 Principles of Great Custom Hooks

A custom hook is a JavaScript function whose name starts with `use` and that calls other hooks internally. The purpose of custom hooks is to extract reusable stateful logic from components, not to share state itself. Each call to a custom hook creates an independent instance of state and effects.

### Principle 1: Name for Intent, Not Implementation

A hook's name should describe *what capability it provides*, not *how it is implemented internally*. The consumer should be able to use the hook without knowing whether it relies on `useState`, `useEffect`, `useReducer`, or any other primitive.

```javascript
// Bad: name describes implementation
function useStateWithLocalStorage(key, initialValue) {
  // ...
}

// Good: name describes intent
function useLocalStorage(key, initialValue) {
  // ...
}

// Bad: generic lifecycle wrapper
function useOnMount(callback) {
  useEffect(callback, []);
}

// Good: domain-specific behavior
function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
```

The React team explicitly discourages generic lifecycle wrappers such as `useMount`, `useEffectOnce`, or `useUpdateEffect`. These hooks obscure dependency tracking and encourage developers to think in lifecycle terms rather than synchronization terms.

### Principle 2: Single Responsibility

Each custom hook should encapsulate one coherent behavior. When a hook manages fetching, form validation, modal state, and analytics tracking simultaneously, it becomes difficult to test, debug, and reuse.

```javascript
// Bad: a "god hook" that does too many things
function useUserDashboard(userId) {
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [theme, setTheme] = useState('light');
  const [modalOpen, setModalOpen] = useState(false);
  // 100+ lines of mixed concerns...
  return { user, notifications, theme, setTheme, modalOpen, setModalOpen };
}

// Good: separate hooks for separate concerns
function useUser(userId) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchUser(userId)
      .then((data) => { if (!cancelled) setUser(data); })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  return { user, loading, error };
}

function useNotifications(userId) {
  // Separate hook for notifications
}
```

### Principle 3: Share Logic, Not State

A common misconception is that two components calling the same custom hook share state. They do not. Each call creates a completely independent instance.

```javascript
function useCounter(initialValue = 0) {
  const [count, setCount] = useState(initialValue);
  const increment = () => setCount((c) => c + 1);
  return { count, increment };
}

function ComponentA() {
  const { count, increment } = useCounter(); // Independent state
  return <button onClick={increment}>A: {count}</button>;
}

function ComponentB() {
  const { count, increment } = useCounter(); // Different instance entirely
  return <button onClick={increment}>B: {count}</button>;
}
// Clicking "A" does not affect "B"
```

To share state between components, lift the state up to a common ancestor or use context. The custom hook can still encapsulate the logic, but the state must be provided externally.

### Principle 4: Do Not Prefix with `use` Unless the Function Calls Hooks

The `use` prefix is a signal to both React and developers that a function follows the Rules of Hooks (must be called at the top level of a component or another hook, never conditionally). If a function performs a pure computation or utility operation without calling any hooks, it should not use the `use` prefix.

```javascript
// Wrong: no hooks are called inside, so "use" prefix is misleading
function useFormatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

// Correct: plain utility function
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}
```

### Principle 5: Extract When Reuse or Clarity Demands It

Not every `useState` + `useEffect` combination warrants extraction into a custom hook. Extract when:

- The same logic appears (or will appear) in multiple components.
- The component is growing large and the hook represents a discrete, testable unit of behavior.
- The logic is complex enough that naming it improves readability.

Premature extraction creates indirection without benefit. Three lines of `useState` + `useEffect` in a single component are often clearer than an imported hook whose implementation must be looked up.

> **Common Mistake:** Extracting every piece of state management into a custom hook regardless of reuse potential. This leads to a proliferation of single-use hooks that fragment the component's logic across multiple files without improving readability or reusability. Extract hooks when the abstraction genuinely earns its name.

---

## 2.2 Composing Hooks: Small Hooks That Build On Each Other

The power of custom hooks lies in composition. Small, focused hooks serve as building blocks for larger, domain-specific hooks. This mirrors the functional programming principle of composing simple functions into complex behavior.

### The Hook Layering Model

Hooks naturally form three layers:

```
┌─────────────────────────────────────────────────────┐
│  Layer 3: Domain Hooks                              │
│  useCheckoutFlow, useChatRoom, useSearchFilters     │
│  (business logic, composed from layers 1 and 2)     │
├─────────────────────────────────────────────────────┤
│  Layer 2: Utility Hooks                             │
│  useLocalStorage, useDebounce, usePrevious,         │
│  useMediaQuery, useEventListener                    │
│  (reusable, generic, composed from layer 1)         │
├─────────────────────────────────────────────────────┤
│  Layer 1: React Primitives                          │
│  useState, useEffect, useRef, useMemo, useReducer,  │
│  useCallback, useContext, useSyncExternalStore       │
└─────────────────────────────────────────────────────┘
```

Each layer depends only on the layer below it. Domain hooks compose utility hooks; utility hooks compose primitives.

### Composition in Practice

Consider building a search feature that debounces user input, persists the last query to local storage, and tracks whether the debounced value differs from the current input (indicating a pending search).

```javascript
// Layer 2: useDebounce (utility)
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Layer 2: useLocalStorage (utility)
function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value) => {
    const valueToStore =
      value instanceof Function ? value(storedValue) : value;
    setStoredValue(valueToStore);
    window.localStorage.setItem(key, JSON.stringify(valueToStore));
  };

  return [storedValue, setValue];
}

// Layer 2: usePrevious (utility)
function usePrevious(value) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}
```

```javascript
// Layer 3: useSearch (domain hook, composes all three utilities)
import { useState } from 'react';

function useSearch({ storageKey = 'lastSearch', debounceMs = 300 } = {}) {
  const [lastQuery, setLastQuery] = useLocalStorage(storageKey, '');
  const [query, setQuery] = useState(lastQuery);
  const debouncedQuery = useDebounce(query, debounceMs);
  const previousQuery = usePrevious(debouncedQuery);
  const isPending = query !== debouncedQuery;

  const updateQuery = (newQuery) => {
    setQuery(newQuery);
    setLastQuery(newQuery);
  };

  return {
    query,
    debouncedQuery,
    previousQuery,
    isPending,
    setQuery: updateQuery,
  };
}
```

The `useSearch` hook composes three utility hooks. Each utility hook is independently testable and reusable in other contexts. The domain hook provides a clean API to the component:

```javascript
function SearchPage() {
  const { query, debouncedQuery, isPending, setQuery } = useSearch();

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search..."
      />
      {isPending && <span>Searching...</span>}
      <SearchResults query={debouncedQuery} />
    </div>
  );
}
```

### When Composition Creates Too Much Indirection

Composition is not always beneficial. If a "composed" hook simply passes through to a single inner hook with no additional logic, the abstraction adds complexity without value.

```javascript
// Unnecessary: just wraps useState with no added behavior
function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  const toggle = () => setValue((v) => !v);
  return [value, toggle];
}
// This IS worth extracting: it adds the toggle function,
// which is a distinct behavior that prevents consumers from
// needing to write the toggling logic themselves.

// NOT worth extracting: no added behavior
function useCount() {
  return useState(0);
}
// This is just useState with a different name.
```

> **See Also:** Part 1, Chapter 8, Section 8.5 for the general principle of function composition that underlies hook composition.

---

## 2.3 Hook Return Value Design (Tuple vs Object vs Both)

The return value of a custom hook defines its public API. The shape of this return value affects how consumers destructure, rename, and use the hook's outputs.

### Tuple (Array) Returns

A tuple return uses array destructuring. This is the pattern established by `useState`:

```javascript
const [value, setValue] = useState(initialValue);
```

**When to use tuples:**

- The hook returns exactly two values (a value and its setter, or a value and a status).
- The hook may be called multiple times in the same component, requiring easy renaming.
- The positional relationship between elements is obvious.

```javascript
function useToggle(initialValue = false) {
  const [value, setValue] = useState(initialValue);

  const toggle = useCallback(() => setValue((v) => !v), []);
  const setTrue = useCallback(() => setValue(true), []);
  const setFalse = useCallback(() => setValue(false), []);

  // Tuple return: [state, actions]
  return [value, { toggle, setTrue, setFalse }];
}

// Easy to rename when used multiple times:
function Modal() {
  const [isOpen, { toggle: toggleOpen }] = useToggle(false);
  const [isAnimating, { toggle: toggleAnimating }] = useToggle(false);
  // ...
}
```

### Object Returns

An object return uses property destructuring. Properties are self-documenting and order-independent.

**When to use objects:**

- The hook returns three or more values.
- The hook is unlikely to be called multiple times in a single component.
- Consumers typically need only a subset of the returned values.

```javascript
function useFetch(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => { if (!cancelled) setData(json); })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [url]);

  // Object return: self-documenting, order-independent
  return { data, error, loading };
}

// Consumer picks only what it needs:
function UserProfile({ userId }) {
  const { data: user, loading } = useFetch(`/api/users/${userId}`);
  // "error" is available but not destructured here
  if (loading) return <Spinner />;
  return <h1>{user.name}</h1>;
}
```

### Hybrid Returns

Some hooks benefit from a hybrid approach: a tuple whose second element is an object of actions.

```javascript
function useCounter(initialValue = 0) {
  const [count, setCount] = useState(initialValue);

  const actions = useMemo(() => ({
    increment: () => setCount((c) => c + 1),
    decrement: () => setCount((c) => c - 1),
    reset: () => setCount(initialValue),
    set: setCount,
  }), [initialValue]);

  // Hybrid: [value, actionsObject]
  return [count, actions];
}

// Clean destructuring:
const [count, { increment, decrement, reset }] = useCounter(10);
```

This pattern provides the rename-ability of tuples for the primary value and the self-documentation of objects for the actions.

### Decision Framework

| Criterion | Tuple | Object | Hybrid |
|---|---|---|---|
| Number of return values | 2 | 3+ | 2 (value + actions bundle) |
| Multiple calls in one component | Common | Rare | Moderate |
| Self-documenting | No (positional) | Yes | Partially |
| Consumer uses subset | Awkward (must skip positions) | Natural | Natural for actions |
| Familiar pattern | `useState`, `useReducer` | `useFetch`, TanStack Query | `useToggle`, `useCounter` |

> **Common Mistake:** Returning more than three positional values in a tuple. Beyond two or three positions, the meaning of each element becomes ambiguous. If a consumer must write `const [, , , refetch] = useSomething()` to access the fourth value, the return shape should be an object.

---

## 2.4 Hooks That Accept Configuration Objects

Hooks with more than two parameters benefit from a configuration object pattern. This approach provides named parameters, easy defaults, and extensibility without breaking existing consumers.

### The Pattern

Separate required arguments from optional configuration:

```javascript
function useAsync(asyncFunction, options = {}) {
  const {
    immediate = true,
    onSuccess = null,
    onError = null,
    retryCount = 0,
    retryDelay = 1000,
  } = options;

  const [state, setState] = useState({
    data: null,
    error: null,
    loading: immediate,
  });

  const execute = useCallback(async (...args) => {
    setState({ data: null, error: null, loading: true });

    let lastError = null;
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const data = await asyncFunction(...args);
        setState({ data, error: null, loading: false });
        onSuccess?.(data);
        return data;
      } catch (err) {
        lastError = err;
        if (attempt < retryCount) {
          await new Promise((r) => setTimeout(r, retryDelay * (attempt + 1)));
        }
      }
    }

    setState({ data: null, error: lastError, loading: false });
    onError?.(lastError);
    return null;
  }, [asyncFunction, retryCount, retryDelay, onSuccess, onError]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [immediate, execute]);

  return { ...state, execute };
}
```

### Usage

```javascript
function UserProfile({ userId }) {
  const { data: user, loading, error, execute: refetch } = useAsync(
    () => fetch(`/api/users/${userId}`).then((r) => r.json()),
    {
      immediate: true,
      retryCount: 2,
      onError: (err) => console.error('Failed to load user:', err),
    }
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage error={error} onRetry={refetch} />;
  return <UserCard user={user} />;
}
```

### The TanStack Query Pattern: Options-First Design

TanStack Query (React Query) v5 popularized the "single options object" pattern where even the required parameters are part of the configuration object:

```javascript
// TanStack Query style: everything in one options object
function useQuery(options) {
  const {
    queryKey,
    queryFn,
    enabled = true,
    staleTime = 0,
    gcTime = 5 * 60 * 1000,
    retry = 3,
    refetchOnWindowFocus = true,
    onSuccess,
    onError,
  } = options;

  // Implementation...
}

// Usage:
const result = useQuery({
  queryKey: ['users', userId],
  queryFn: () => fetchUser(userId),
  staleTime: 30000,
  retry: 2,
});
```

This design scales well because adding new options never changes the function signature.

### Global Configuration with Local Overrides

For hooks used application-wide, provide a context-based global configuration with per-call overrides:

```javascript
import { createContext, useContext } from 'react';

const FetchConfigContext = createContext({
  baseUrl: '',
  headers: {},
  timeout: 10000,
  retryCount: 1,
});

function FetchConfigProvider({ children, config }) {
  return (
    <FetchConfigContext.Provider value={config}>
      {children}
    </FetchConfigContext.Provider>
  );
}

function useFetchWithConfig(endpoint, localOptions = {}) {
  const globalConfig = useContext(FetchConfigContext);

  // Local options override global config
  const config = { ...globalConfig, ...localOptions };

  const url = `${config.baseUrl}${endpoint}`;

  return useAsync(
    () =>
      fetch(url, {
        headers: config.headers,
        signal: AbortSignal.timeout(config.timeout),
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    { retryCount: config.retryCount, immediate: true }
  );
}
```

```javascript
// App setup: global defaults
function App() {
  return (
    <FetchConfigProvider
      config={{
        baseUrl: 'https://api.example.com',
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
        retryCount: 2,
      }}
    >
      <Dashboard />
    </FetchConfigProvider>
  );
}

// Component: uses global defaults, overrides timeout
function Dashboard() {
  const { data, loading } = useFetchWithConfig('/dashboard/stats', {
    timeout: 5000, // Override: shorter timeout for this endpoint
  });
  // ...
}
```

> **See Also:** Part 3, Chapter 4, Section 4.5 for a deep dive on `useContext` patterns and optimization.

---

## 2.5 Hooks with Ref-Stable Callbacks

A recurring challenge in custom hook design is handling callback parameters that should not cause effects to re-synchronize when they change. For example, an interval hook should not restart the interval every time the callback function is recreated.

### The Problem

```javascript
// Naive implementation: restarts interval whenever callback changes
function useInterval(callback, delay) {
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(callback, delay);
    return () => clearInterval(id);
  }, [callback, delay]); // callback in deps: restarts on every render
}

function Timer() {
  const [count, setCount] = useState(0);

  // This function is recreated every render because it closes over count
  useInterval(() => {
    setCount(count + 1);
  }, 1000);
  // Result: interval restarts every second, count is always 1
}
```

### The Legacy Solution: Latest Ref Pattern

Before React 19.2, the standard workaround was to store the latest callback in a ref:

```javascript
function useInterval(callback, delay) {
  const savedCallback = useRef(callback);

  // Update ref to latest callback on every render
  useLayoutEffect(() => {
    savedCallback.current = callback;
  });

  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]); // Only delay causes re-synchronization
}
```

This works but has drawbacks: it requires understanding the ref-update timing, the `useLayoutEffect` for synchronous ref updates, and the indirection through `savedCallback.current`.

### The Modern Solution: `useEffectEvent` (React 19.2+)

`useEffectEvent` declares a function that always reads the latest props and state but is not part of the effect's dependency array. It was designed precisely for this use case.

```javascript
import { useEffect, useEffectEvent } from 'react';

function useInterval(callback, delay) {
  const onTick = useEffectEvent(callback);

  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => onTick(), delay);
    return () => clearInterval(id);
  }, [delay]); // onTick is NOT listed as a dependency
}

// Usage: works correctly, always reads latest count
function Timer() {
  const [count, setCount] = useState(0);

  useInterval(() => {
    setCount(count + 1); // Always reads current count
  }, 1000);

  return <p>Count: {count}</p>;
}
```

### Rules for `useEffectEvent`

1. **Call only from effects**: `useEffectEvent` functions may only be called from inside `useEffect`, `useLayoutEffect`, or other effect events.
2. **Never include in dependency arrays**: the linter correctly excludes them from deps.
3. **Do not pass to child components**: they are not stable references by design; React intentionally changes their identity to prevent misuse as props.
4. **Do not call during render**: they read latest values, which could cause inconsistencies if called in the render phase.

### Building Hooks with `useEffectEvent`

The pattern applies broadly to any hook that accepts callbacks used inside effects:

```javascript
function useEventListener(eventName, handler, element) {
  const onEvent = useEffectEvent(handler);

  useEffect(() => {
    const targetElement = element?.current || window;
    targetElement.addEventListener(eventName, onEvent);
    return () => targetElement.removeEventListener(eventName, onEvent);
  }, [eventName, element]);
}

function useOnlineStatus(options = {}) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const onStatusChange = useEffectEvent(() => {
    const newStatus = navigator.onLine;
    setIsOnline(newStatus);
    if (newStatus) {
      options.onOnline?.();
    } else {
      options.onOffline?.();
    }
  });

  useEffect(() => {
    window.addEventListener('online', onStatusChange);
    window.addEventListener('offline', onStatusChange);
    return () => {
      window.removeEventListener('online', onStatusChange);
      window.removeEventListener('offline', onStatusChange);
    };
  }, []);

  return isOnline;
}
```

> **Common Mistake:** Using `useEffectEvent` as a general-purpose stable callback replacement (similar to how `useCallback` with an empty dependency array is sometimes misused). `useEffectEvent` is specifically for decoupling non-reactive logic from effects. For callbacks passed to child components as props, continue using `useCallback`. For callbacks used in event handlers (onClick, onChange), neither `useEffectEvent` nor the ref pattern is needed; simply define the function in the component body.

---

## 2.6 Testing Custom Hooks (renderHook, act)

Custom hooks are functions that contain React logic, so they cannot be called outside of a React component. The `renderHook` utility from `@testing-library/react` solves this by rendering the hook inside a lightweight test component.

### Setup

`renderHook` is built into `@testing-library/react` (v13+). The standalone package `@testing-library/react-hooks` is deprecated; do not install it.

```javascript
// Install (if not already present):
// npm install --save-dev @testing-library/react @testing-library/jest-dom
```

### Basic Testing Pattern

```javascript
import { renderHook, act } from '@testing-library/react';

function useCounter(initialValue = 0) {
  const [count, setCount] = useState(initialValue);
  const increment = () => setCount((c) => c + 1);
  const decrement = () => setCount((c) => c - 1);
  const reset = () => setCount(initialValue);
  return { count, increment, decrement, reset };
}

describe('useCounter', () => {
  test('initializes with default value', () => {
    const { result } = renderHook(() => useCounter());
    expect(result.current.count).toBe(0);
  });

  test('initializes with provided value', () => {
    const { result } = renderHook(() => useCounter(10));
    expect(result.current.count).toBe(10);
  });

  test('increments the count', () => {
    const { result } = renderHook(() => useCounter());

    // act() is required when calling functions that trigger state updates
    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });

  test('decrements the count', () => {
    const { result } = renderHook(() => useCounter(5));

    act(() => {
      result.current.decrement();
    });

    expect(result.current.count).toBe(4);
  });

  test('resets to initial value', () => {
    const { result } = renderHook(() => useCounter(10));

    act(() => {
      result.current.increment();
      result.current.increment();
    });

    expect(result.current.count).toBe(12);

    act(() => {
      result.current.reset();
    });

    expect(result.current.count).toBe(10);
  });
});
```

### Testing with Changing Arguments

The `rerender` function allows you to test how a hook responds to prop changes:

```javascript
function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

describe('useDocumentTitle', () => {
  test('sets document title on mount', () => {
    renderHook(() => useDocumentTitle('Dashboard'));
    expect(document.title).toBe('Dashboard');
  });

  test('updates document title when argument changes', () => {
    const { rerender } = renderHook(
      ({ title }) => useDocumentTitle(title),
      { initialProps: { title: 'Dashboard' } }
    );

    expect(document.title).toBe('Dashboard');

    rerender({ title: 'Settings' });
    expect(document.title).toBe('Settings');
  });
});
```

### Testing Async Hooks

For hooks that involve asynchronous operations, use `waitFor` to wait for state to settle:

```javascript
import { renderHook, waitFor } from '@testing-library/react';

function useAsync(asyncFn) {
  const [state, setState] = useState({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, error: null, loading: true });

    asyncFn()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (!cancelled) setState({ data: null, error, loading: false });
      });

    return () => { cancelled = true; };
  }, [asyncFn]);

  return state;
}

describe('useAsync', () => {
  test('resolves data successfully', async () => {
    const mockFetch = () => Promise.resolve({ name: 'Alice' });
    const { result } = renderHook(() => useAsync(mockFetch));

    // Initially loading
    expect(result.current.loading).toBe(true);

    // Wait for async operation to complete
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual({ name: 'Alice' });
    expect(result.current.error).toBeNull();
  });

  test('handles errors', async () => {
    const mockFetch = () => Promise.reject(new Error('Network failure'));
    const { result } = renderHook(() => useAsync(mockFetch));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error.message).toBe('Network failure');
  });
});
```

### Testing with Context Providers

When a hook depends on context, use the `wrapper` option:

```javascript
import { createContext, useContext, useState } from 'react';

const ThemeContext = createContext('light');

function useTheme() {
  return useContext(ThemeContext);
}

describe('useTheme', () => {
  test('returns the theme from context', () => {
    const wrapper = ({ children }) => (
      <ThemeContext.Provider value="dark">
        {children}
      </ThemeContext.Provider>
    );

    const { result } = renderHook(() => useTheme(), { wrapper });
    expect(result.current).toBe('dark');
  });
});
```

### When to Test Through a Component Instead

For simple hooks, testing through a real component is sometimes more natural and provides higher confidence:

```javascript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  const toggle = () => setValue((v) => !v);
  return [value, toggle];
}

function TestToggleComponent() {
  const [isOn, toggle] = useToggle();
  return (
    <button onClick={toggle}>
      {isOn ? 'ON' : 'OFF'}
    </button>
  );
}

test('toggle switches between ON and OFF', async () => {
  const user = userEvent.setup();
  render(<TestToggleComponent />);

  expect(screen.getByText('OFF')).toBeInTheDocument();

  await user.click(screen.getByRole('button'));
  expect(screen.getByText('ON')).toBeInTheDocument();

  await user.click(screen.getByRole('button'));
  expect(screen.getByText('OFF')).toBeInTheDocument();
});
```

> **See Also:** Part 4, Chapter 6, Section 6.7 for a comprehensive treatment of testing strategies for hooks.

---

## 2.7 Real-World Hook Library

This section presents ten production-ready custom hooks. Each hook follows the principles established earlier: single responsibility, descriptive naming, appropriate return shapes, and proper cleanup.

### `useLocalStorage` / `useSessionStorage`

Synchronizes React state with browser storage. Reads the initial value from storage, writes updates back, and handles serialization.

```javascript
import { useState, useCallback, useEffect } from 'react';

function useStorage(storageObject, key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = storageObject.getItem(key);
      return item !== null ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value) => {
      setStoredValue((current) => {
        const valueToStore =
          value instanceof Function ? value(current) : value;
        try {
          storageObject.setItem(key, JSON.stringify(valueToStore));
        } catch (error) {
          console.warn(`Failed to save to storage key "${key}":`, error);
        }
        return valueToStore;
      });
    },
    [key, storageObject]
  );

  const removeValue = useCallback(() => {
    setStoredValue(initialValue);
    try {
      storageObject.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove storage key "${key}":`, error);
    }
  }, [key, initialValue, storageObject]);

  // Listen for changes from other tabs/windows
  useEffect(() => {
    const handleStorageChange = (event) => {
      if (event.key === key && event.storageArea === storageObject) {
        try {
          setStoredValue(
            event.newValue !== null
              ? JSON.parse(event.newValue)
              : initialValue
          );
        } catch {
          setStoredValue(initialValue);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, initialValue, storageObject]);

  return [storedValue, setValue, removeValue];
}

function useLocalStorage(key, initialValue) {
  return useStorage(window.localStorage, key, initialValue);
}

function useSessionStorage(key, initialValue) {
  return useStorage(window.sessionStorage, key, initialValue);
}
```

```javascript
// Usage
function PreferencesPanel() {
  const [theme, setTheme] = useLocalStorage('theme', 'light');
  const [fontSize, setFontSize, resetFontSize] = useLocalStorage('fontSize', 16);

  return (
    <div>
      <select value={theme} onChange={(e) => setTheme(e.target.value)}>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <input
        type="range"
        min={12}
        max={24}
        value={fontSize}
        onChange={(e) => setFontSize(Number(e.target.value))}
      />
      <button onClick={resetFontSize}>Reset Font Size</button>
    </div>
  );
}
```

### `useMediaQuery`

Tracks whether a CSS media query matches, enabling responsive behavior in component logic.

```javascript
import { useState, useEffect } from 'react';

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    setMatches(mediaQueryList.matches);

    const handler = (event) => setMatches(event.matches);
    mediaQueryList.addEventListener('change', handler);
    return () => mediaQueryList.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
```

```javascript
// Usage
function ResponsiveLayout({ children }) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isTablet = useMediaQuery('(min-width: 769px) and (max-width: 1024px)');
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  return (
    <div className={isMobile ? 'layout-mobile' : 'layout-desktop'}>
      {isMobile ? <MobileNav /> : <DesktopNav />}
      <main style={{ animation: prefersReducedMotion ? 'none' : undefined }}>
        {children}
      </main>
    </div>
  );
}
```

### `useDebounce` / `useThrottle`

`useDebounce` delays a value update until a specified period of inactivity. `useThrottle` limits updates to at most once per interval.

```javascript
import { useState, useEffect, useRef } from 'react';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

function useThrottle(value, interval) {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastUpdated = useRef(Date.now());

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastUpdated.current;

    if (elapsed >= interval) {
      setThrottledValue(value);
      lastUpdated.current = now;
    } else {
      const timer = setTimeout(() => {
        setThrottledValue(value);
        lastUpdated.current = Date.now();
      }, interval - elapsed);

      return () => clearTimeout(timer);
    }
  }, [value, interval]);

  return throttledValue;
}
```

```javascript
// Usage: search with debounced API calls
function SearchBar() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQuery) {
      // Only fires 300ms after the user stops typing
      fetchSearchResults(debouncedQuery);
    }
  }, [debouncedQuery]);

  return (
    <input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="Search..."
    />
  );
}
```

### `useClickOutside`

Detects clicks outside a referenced element. Essential for closing dropdowns, modals, and popovers.

```javascript
import { useEffect, useRef } from 'react';

function useClickOutside(handler) {
  const ref = useRef(null);

  useEffect(() => {
    const listener = (event) => {
      // Do nothing if clicking ref's element or its descendants
      if (!ref.current || ref.current.contains(event.target)) {
        return;
      }
      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [handler]);

  return ref;
}
```

```javascript
// Usage
function Dropdown({ onClose, children }) {
  const dropdownRef = useClickOutside(onClose);

  return (
    <div ref={dropdownRef} className="dropdown">
      {children}
    </div>
  );
}
```

### `usePrevious`

Stores the previous value of a variable across renders. Useful for comparison logic (detecting changes, animations, transitions).

```javascript
import { useRef, useEffect } from 'react';

function usePrevious(value) {
  const ref = useRef();

  useEffect(() => {
    ref.current = value;
  }, [value]);

  // Returns the value from the previous render
  return ref.current;
}
```

```javascript
// Usage: detect direction of count change
function Counter() {
  const [count, setCount] = useState(0);
  const previousCount = usePrevious(count);

  const direction =
    previousCount === undefined
      ? 'initial'
      : count > previousCount
        ? 'up'
        : count < previousCount
          ? 'down'
          : 'same';

  return (
    <div>
      <p>Count: {count} ({direction})</p>
      <button onClick={() => setCount((c) => c + 1)}>+</button>
      <button onClick={() => setCount((c) => c - 1)}>-</button>
    </div>
  );
}
```

### `useIntersectionObserver`

Tracks whether an element is visible within the viewport using the Intersection Observer API. Used for lazy loading, infinite scroll triggers, and scroll-based animations.

```javascript
import { useState, useEffect, useRef } from 'react';

function useIntersectionObserver(options = {}) {
  const {
    threshold = 0,
    root = null,
    rootMargin = '0px',
  } = options;

  const ref = useRef(null);
  const [entry, setEntry] = useState(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([observerEntry]) => setEntry(observerEntry),
      { threshold, root, rootMargin }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [threshold, root, rootMargin]);

  return { ref, entry, isIntersecting: entry?.isIntersecting ?? false };
}
```

```javascript
// Usage: fade in elements as they scroll into view
function FadeInSection({ children }) {
  const { ref, isIntersecting } = useIntersectionObserver({
    threshold: 0.1,
    rootMargin: '50px',
  });

  return (
    <div
      ref={ref}
      style={{
        opacity: isIntersecting ? 1 : 0,
        transform: isIntersecting ? 'translateY(0)' : 'translateY(20px)',
        transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
      }}
    >
      {children}
    </div>
  );
}
```

### `useEventListener`

Attaches an event listener to a target element with automatic cleanup and a stable callback.

```javascript
import { useEffect, useRef } from 'react';

function useEventListener(eventName, handler, element) {
  // Store the latest handler in a ref to avoid re-subscribing on every render
  const savedHandler = useRef(handler);

  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    const targetElement = element?.current || window;

    if (!targetElement?.addEventListener) return;

    const eventListener = (event) => savedHandler.current(event);

    targetElement.addEventListener(eventName, eventListener);
    return () => targetElement.removeEventListener(eventName, eventListener);
  }, [eventName, element]);
}
```

```javascript
// Usage: keyboard shortcut handler
function App() {
  useEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAllModals();
    }
    if (event.ctrlKey && event.key === 'k') {
      event.preventDefault();
      openCommandPalette();
    }
  });

  return <main>{/* ... */}</main>;
}
```

### `useOnlineStatus`

Tracks the browser's online/offline status in real time.

```javascript
import { useState, useEffect } from 'react';

function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
```

```javascript
// Usage
function SaveButton({ onSave }) {
  const isOnline = useOnlineStatus();

  return (
    <button onClick={onSave} disabled={!isOnline}>
      {isOnline ? 'Save' : 'Offline - Save disabled'}
    </button>
  );
}
```

### `useWindowSize`

Tracks the current window dimensions, debounced to avoid excessive re-renders during resize.

```javascript
import { useState, useEffect } from 'react';

function useWindowSize(debounceMs = 100) {
  const [size, setSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    let timeoutId;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setSize({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }, debounceMs);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, [debounceMs]);

  return size;
}
```

```javascript
// Usage
function ResponsiveGrid({ items }) {
  const { width } = useWindowSize();
  const columns = width > 1200 ? 4 : width > 768 ? 3 : width > 480 ? 2 : 1;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 16 }}>
      {items.map((item) => (
        <Card key={item.id} item={item} />
      ))}
    </div>
  );
}
```

### `useCopyToClipboard`

Copies text to the clipboard and tracks the operation's success state.

```javascript
import { useState, useCallback, useRef } from 'react';

function useCopyToClipboard(resetDelay = 2000) {
  const [state, setState] = useState({ copied: false, error: null });
  const timeoutRef = useRef(null);

  const copy = useCallback(
    async (text) => {
      // Clear any existing timeout
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      try {
        await navigator.clipboard.writeText(text);
        setState({ copied: true, error: null });

        // Reset after delay
        timeoutRef.current = setTimeout(() => {
          setState({ copied: false, error: null });
        }, resetDelay);

        return true;
      } catch (error) {
        setState({ copied: false, error });
        return false;
      }
    },
    [resetDelay]
  );

  return { copy, copied: state.copied, error: state.error };
}
```

```javascript
// Usage
function ShareLink({ url }) {
  const { copy, copied } = useCopyToClipboard();

  return (
    <button onClick={() => copy(url)}>
      {copied ? 'Copied!' : 'Copy Link'}
    </button>
  );
}
```

---

## 2.8 Exercise: Build a Hooks Library with 10 Production-Ready Hooks

### Problem Statement

Build a complete custom hooks library containing all 10 hooks from Section 2.7. Each hook must meet these requirements:

1. Proper cleanup of all side effects (event listeners, timers, observers).
2. SSR safety: hooks that access browser APIs (`window`, `navigator`, `document`) must handle server-side rendering by returning sensible defaults when those APIs are unavailable.
3. A test suite using `renderHook` and `act`.
4. The library should be organized as a single module with named exports.

For this exercise, add SSR safety to each hook and write at least two tests per hook.

### Starter Code: Project Structure

```
hooks-library/
├── src/
│   ├── hooks/
│   │   ├── useLocalStorage.js
│   │   ├── useMediaQuery.js
│   │   ├── useDebounce.js
│   │   ├── useThrottle.js
│   │   ├── useClickOutside.js
│   │   ├── usePrevious.js
│   │   ├── useIntersectionObserver.js
│   │   ├── useEventListener.js
│   │   ├── useOnlineStatus.js
│   │   ├── useWindowSize.js
│   │   └── useCopyToClipboard.js
│   └── index.js
├── __tests__/
│   └── hooks.test.js
└── package.json
```

### Solution

**`src/hooks/useLocalStorage.js`**: refer to the implementation in Section 2.7, adding the SSR guard:

```javascript
// SSR-safe version: check for window before accessing localStorage
import { useState, useCallback, useEffect } from 'react';

const isBrowser = typeof window !== 'undefined';

export function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    if (!isBrowser) return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value) => {
      setStoredValue((current) => {
        const valueToStore =
          value instanceof Function ? value(current) : value;
        if (isBrowser) {
          try {
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
          } catch (error) {
            console.warn(`useLocalStorage: failed to set "${key}"`, error);
          }
        }
        return valueToStore;
      });
    },
    [key]
  );

  const removeValue = useCallback(() => {
    setStoredValue(initialValue);
    if (isBrowser) {
      try {
        window.localStorage.removeItem(key);
      } catch (error) {
        console.warn(`useLocalStorage: failed to remove "${key}"`, error);
      }
    }
  }, [key, initialValue]);

  // Sync across tabs
  useEffect(() => {
    if (!isBrowser) return;

    const handleStorage = (event) => {
      if (event.key === key) {
        try {
          setStoredValue(
            event.newValue !== null
              ? JSON.parse(event.newValue)
              : initialValue
          );
        } catch {
          setStoredValue(initialValue);
        }
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}
```

**`src/hooks/useMediaQuery.js`**:

```javascript
import { useState, useEffect } from 'react';

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const handler = (event) => setMatches(event.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
```

**`src/hooks/useDebounce.js`**:

```javascript
import { useState, useEffect } from 'react';

export function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
```

**`src/hooks/useThrottle.js`**:

```javascript
import { useState, useEffect, useRef } from 'react';

export function useThrottle(value, interval) {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastUpdated = useRef(Date.now());

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastUpdated.current;

    if (elapsed >= interval) {
      setThrottledValue(value);
      lastUpdated.current = now;
    } else {
      const timer = setTimeout(() => {
        setThrottledValue(value);
        lastUpdated.current = Date.now();
      }, interval - elapsed);
      return () => clearTimeout(timer);
    }
  }, [value, interval]);

  return throttledValue;
}
```

**`src/hooks/useClickOutside.js`**:

```javascript
import { useEffect, useRef } from 'react';

export function useClickOutside(handler) {
  const ref = useRef(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const listener = (event) => {
      if (!ref.current || ref.current.contains(event.target)) return;
      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [handler]);

  return ref;
}
```

**`src/hooks/usePrevious.js`**:

```javascript
import { useRef, useEffect } from 'react';

export function usePrevious(value) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}
```

**`src/hooks/useIntersectionObserver.js`**:

```javascript
import { useState, useEffect, useRef } from 'react';

export function useIntersectionObserver(options = {}) {
  const { threshold = 0, root = null, rootMargin = '0px' } = options;
  const ref = useRef(null);
  const [entry, setEntry] = useState(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([observerEntry]) => setEntry(observerEntry),
      { threshold, root, rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, root, rootMargin]);

  return { ref, entry, isIntersecting: entry?.isIntersecting ?? false };
}
```

**`src/hooks/useEventListener.js`**:

```javascript
import { useEffect, useRef } from 'react';

export function useEventListener(eventName, handler, element) {
  const savedHandler = useRef(handler);

  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    const targetElement = element?.current || (typeof window !== 'undefined' ? window : null);
    if (!targetElement?.addEventListener) return;

    const listener = (event) => savedHandler.current(event);
    targetElement.addEventListener(eventName, listener);
    return () => targetElement.removeEventListener(eventName, listener);
  }, [eventName, element]);
}
```

**`src/hooks/useOnlineStatus.js`**:

```javascript
import { useState, useEffect } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return isOnline;
}
```

**`src/hooks/useWindowSize.js`**:

```javascript
import { useState, useEffect } from 'react';

export function useWindowSize(debounceMs = 100) {
  const [size, setSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timeoutId;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setSize({ width: window.innerWidth, height: window.innerHeight });
      }, debounceMs);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, [debounceMs]);

  return size;
}
```

**`src/hooks/useCopyToClipboard.js`**:

```javascript
import { useState, useCallback, useRef, useEffect } from 'react';

export function useCopyToClipboard(resetDelay = 2000) {
  const [state, setState] = useState({ copied: false, error: null });
  const timeoutRef = useRef(null);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        setState({ copied: false, error: new Error('Clipboard API not available') });
        return false;
      }

      try {
        await navigator.clipboard.writeText(text);
        setState({ copied: true, error: null });

        timeoutRef.current = setTimeout(() => {
          setState({ copied: false, error: null });
        }, resetDelay);

        return true;
      } catch (error) {
        setState({ copied: false, error });
        return false;
      }
    },
    [resetDelay]
  );

  return { copy, copied: state.copied, error: state.error };
}
```

**`src/index.js`** (barrel file):

```javascript
export { useLocalStorage } from './hooks/useLocalStorage';
export { useMediaQuery } from './hooks/useMediaQuery';
export { useDebounce } from './hooks/useDebounce';
export { useThrottle } from './hooks/useThrottle';
export { useClickOutside } from './hooks/useClickOutside';
export { usePrevious } from './hooks/usePrevious';
export { useIntersectionObserver } from './hooks/useIntersectionObserver';
export { useEventListener } from './hooks/useEventListener';
export { useOnlineStatus } from './hooks/useOnlineStatus';
export { useWindowSize } from './hooks/useWindowSize';
export { useCopyToClipboard } from './hooks/useCopyToClipboard';
```

### Test Suite

```javascript
// __tests__/hooks.test.js
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useLocalStorage,
  useDebounce,
  usePrevious,
  useOnlineStatus,
  useWindowSize,
  useCopyToClipboard,
  useMediaQuery,
  useClickOutside,
  useEventListener,
  useThrottle,
} from '../src/index';

// --- useLocalStorage ---
describe('useLocalStorage', () => {
  beforeEach(() => window.localStorage.clear());

  test('returns initial value when storage is empty', () => {
    const { result } = renderHook(() => useLocalStorage('testKey', 'default'));
    expect(result.current[0]).toBe('default');
  });

  test('persists value to localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('testKey', 'default'));

    act(() => {
      result.current[1]('updated');
    });

    expect(result.current[0]).toBe('updated');
    expect(JSON.parse(window.localStorage.getItem('testKey'))).toBe('updated');
  });

  test('reads existing value from localStorage', () => {
    window.localStorage.setItem('testKey', JSON.stringify('existing'));
    const { result } = renderHook(() => useLocalStorage('testKey', 'default'));
    expect(result.current[0]).toBe('existing');
  });

  test('removes value from localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('testKey', 'default'));

    act(() => {
      result.current[1]('value');
    });

    act(() => {
      result.current[2](); // removeValue
    });

    expect(result.current[0]).toBe('default');
    expect(window.localStorage.getItem('testKey')).toBeNull();
  });
});

// --- useDebounce ---
describe('useDebounce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 500));
    expect(result.current).toBe('hello');
  });

  test('updates value after delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello', delay: 500 } }
    );

    rerender({ value: 'world', delay: 500 });
    expect(result.current).toBe('hello'); // Not yet updated

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current).toBe('world');
  });
});

// --- usePrevious ---
describe('usePrevious', () => {
  test('returns undefined on first render', () => {
    const { result } = renderHook(() => usePrevious('initial'));
    expect(result.current).toBeUndefined();
  });

  test('returns previous value after update', () => {
    const { result, rerender } = renderHook(
      ({ value }) => usePrevious(value),
      { initialProps: { value: 'first' } }
    );

    rerender({ value: 'second' });
    expect(result.current).toBe('first');

    rerender({ value: 'third' });
    expect(result.current).toBe('second');
  });
});

// --- useOnlineStatus ---
describe('useOnlineStatus', () => {
  test('returns true when online', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true); // Default in test env
  });

  test('responds to offline event', () => {
    const { result } = renderHook(() => useOnlineStatus());

    act(() => {
      // Simulate going offline
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current).toBe(false);

    // Restore
    act(() => {
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      });
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current).toBe(true);
  });
});

// --- useWindowSize ---
describe('useWindowSize', () => {
  test('returns current window dimensions', () => {
    const { result } = renderHook(() => useWindowSize(0));
    expect(result.current.width).toBe(window.innerWidth);
    expect(result.current.height).toBe(window.innerHeight);
  });
});

// --- useCopyToClipboard ---
describe('useCopyToClipboard', () => {
  test('initializes with copied as false', () => {
    const { result } = renderHook(() => useCopyToClipboard());
    expect(result.current.copied).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test('copies text to clipboard', async () => {
    // Mock the clipboard API
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const { result } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      await result.current.copy('Hello, World!');
    });

    expect(writeText).toHaveBeenCalledWith('Hello, World!');
    expect(result.current.copied).toBe(true);
  });
});

// --- useThrottle ---
describe('useThrottle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('returns initial value immediately', () => {
    const { result } = renderHook(() => useThrottle('hello', 500));
    expect(result.current).toBe('hello');
  });

  test('throttles rapid value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useThrottle(value, 500),
      { initialProps: { value: 'a' } }
    );

    // Rapid updates within the throttle interval
    rerender({ value: 'b' });
    rerender({ value: 'c' });

    // Should still show the first value (throttled)
    // After the interval, it updates to the latest
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current).toBe('c');
  });
});

// --- useEventListener ---
describe('useEventListener', () => {
  test('attaches event listener to window', () => {
    const handler = jest.fn();
    renderHook(() => useEventListener('click', handler));

    act(() => {
      window.dispatchEvent(new Event('click'));
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('cleans up listener on unmount', () => {
    const handler = jest.fn();
    const { unmount } = renderHook(() => useEventListener('click', handler));

    unmount();

    act(() => {
      window.dispatchEvent(new Event('click'));
    });

    expect(handler).not.toHaveBeenCalled();
  });
});

// --- useMediaQuery ---
describe('useMediaQuery', () => {
  test('returns match status for a media query', () => {
    // jsdom's matchMedia returns false by default
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    expect(typeof result.current).toBe('boolean');
  });
});
```

### Key Takeaway

A production-ready hooks library demands attention to three concerns beyond raw functionality: cleanup (every subscription, timer, and observer must be torn down), SSR safety (browser APIs must be guarded), and testability (every hook should be verifiable in isolation via `renderHook`). Organizing hooks in layers (primitives, utilities, domain) and exporting them through a barrel file produces a maintainable, composable library that scales with the application.

---

## Chapter Summary

Custom hooks architecture is the discipline of extracting, composing, and designing reusable stateful logic. Great hooks follow five principles: name for intent, maintain single responsibility, share logic rather than state, reserve the `use` prefix for functions that call hooks, and extract only when reuse or clarity demands it. Hooks compose in layers, from React primitives through utility hooks to domain-specific hooks. The return value shape (tuple, object, or hybrid) should match the hook's usage patterns. Configuration objects with sensible defaults, modeled after TanStack Query and SWR, make hooks extensible without fragile positional parameters. `useEffectEvent` (React 19.2+) replaces the "latest ref" pattern for stabilizing callbacks inside effects. Testing with `renderHook` and `act` provides isolated, reliable verification of hook behavior.

## Further Reading

- [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks) (official React documentation)
- [useEffectEvent API Reference](https://react.dev/reference/react/useEffectEvent) (official React documentation)
- [How to Test Custom React Hooks](https://kentcdodds.com/blog/how-to-test-custom-react-hooks) (Kent C. Dodds)
- [The Query Options API](https://tkdodo.eu/blog/the-query-options-api) (TkDodo)
- [usehooks-ts](https://usehooks-ts.com/) (community hook library with source code)
- [usehooks.com](https://usehooks.com/) (ui.dev hook library)
