# Part 3, Chapter 4: State Management - The Decision Tree

## What You Will Learn

- Apply a systematic decision tree for choosing the correct state management approach for each piece of state in an application
- Identify derived state and eliminate unnecessary `useState` + `useEffect` synchronization by computing values during render
- Distinguish controlled from uncontrolled components and select the appropriate pattern based on the consumer's needs
- Configure React Context with performance optimizations (value memoization, context splitting, dispatch separation) and recognize when Context is insufficient
- Differentiate server state from client state and explain why each requires a fundamentally different management strategy
- Use URL search parameters as a state management mechanism for shareable, bookmarkable application state
- Build the same feature using four different state strategies and evaluate the trade-offs

---

## 4.1 Local State: Always Start Here

The default state management approach in React is local state: `useState` or `useReducer` within the component that owns and uses the state. This is not a simplification for beginners; it is the correct first choice for senior engineers.

```javascript
function ExpandableSection({ title, children }) {
  // Local state: only this component needs to know if it is expanded
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="expandable">
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
      >
        {title} {isExpanded ? "▾" : "▸"}
      </button>
      {isExpanded && <div className="expandable-body">{children}</div>}
    </div>
  );
}
```

Local state is the right choice when:

- Only the component (and possibly its direct children via props) needs the value.
- The state represents ephemeral UI: toggle visibility, input focus, animation progress, scroll position, hover state.
- The state does not need to survive navigation or be shareable via URL.

A useful heuristic from Dan Abramov: "If this component were rendered twice side by side, should an interaction in one copy affect the other?" If no, it is local state.

> **See Also:** Part 3, Chapter 2, Section 2.1 for `useState` internals and Section 2.5 for `useReducer` mechanics.

---

## 4.2 Lifting State Up: When Siblings Need to Share

When two sibling components need access to the same state, the state must be "lifted" to their closest common ancestor. The ancestor owns the state and passes it down as props.

```javascript
function TemperatureConverter() {
  // State is lifted to the common ancestor of both inputs
  const [celsius, setCelsius] = useState(0);
  const fahrenheit = celsius * 9 / 5 + 32;

  return (
    <div className="converter">
      <TemperatureInput
        label="Celsius"
        value={celsius}
        onChange={(value) => setCelsius(value)}
      />
      <TemperatureInput
        label="Fahrenheit"
        value={fahrenheit}
        onChange={(value) => setCelsius((value - 32) * 5 / 9)}
      />
    </div>
  );
}

function TemperatureInput({ label, value, onChange }) {
  return (
    <label>
      {label}:
      <input
        type="number"
        value={value.toFixed(1)}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </label>
  );
}
```

### When Lifting Becomes Impractical

Lifting state works well for closely related components (siblings, parent-child). When the state must travel through many intermediate components, lifting introduces prop drilling. The solutions covered in Chapter 3 (composition, Context, external stores) address this escalation.

The progression is:

```
Local state → Lift to parent → Lift higher → Prop drilling → Composition → Context → External store
```

Each step increases the sharing scope but also increases complexity. Move rightward only when the current approach produces concrete problems, not in anticipation of hypothetical future needs.

---

## 4.3 Deriving State: The Most Underused Pattern

Derived state is any value that can be computed from existing state or props. It should not be stored in `useState` because storing it creates a synchronization obligation: every time the source changes, the derived value must be updated. Forgetting to synchronize, or synchronizing incorrectly, produces bugs.

### The Anti-Pattern: Syncing Derived State via useEffect

```javascript
// Anti-pattern: storing derived state and syncing with useEffect
function OrderSummary({ items }) {
  const [total, setTotal] = useState(0);
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    setTotal(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
    setItemCount(items.reduce((sum, item) => sum + item.quantity, 0));
  }, [items]);

  return (
    <div>
      <p>{itemCount} items</p>
      <p>Total: ${total.toFixed(2)}</p>
    </div>
  );
}

// Problems:
// 1. Extra render cycle: first render shows stale total/count,
//    then useEffect fires, triggers setState, second render shows correct values.
// 2. Flash of incorrect content between the two renders.
// 3. Two extra state variables to manage that add no information.
```

### The Correct Approach: Compute During Render

```javascript
// Correct: derive values during render
function OrderSummary({ items }) {
  // Computed on every render; always in sync, zero extra state
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div>
      <p>{itemCount} items</p>
      <p>Total: ${total.toFixed(2)}</p>
    </div>
  );
}
```

If the computation is expensive, use `useMemo` to cache the result:

```javascript
function OrderSummary({ items }) {
  const { total, itemCount } = useMemo(() => ({
    total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
  }), [items]);

  return (
    <div>
      <p>{itemCount} items</p>
      <p>Total: ${total.toFixed(2)}</p>
    </div>
  );
}
```

> **Common Mistake:** Developers habitually reach for `useState` + `useEffect` to "sync" derived values because it feels explicit. This pattern is nearly always wrong. It introduces an unnecessary render cycle, risks desynchronization, and adds state management overhead. The rule: if a value can be computed from existing state or props, compute it during render. Do not store it.

### The Decision Test

Before creating a new `useState`, ask: "Can I compute this from state or props I already have?" If the answer is yes, it is derived state and belongs as a `const` in the render body (or `useMemo` for expensive derivations).

---

## 4.4 Controlled vs Uncontrolled Components

A component is **controlled** when its value is driven by props and changes are reported via callbacks. A component is **uncontrolled** when it manages its own internal state, and the parent reads the value only when needed (typically via a ref).

### Controlled Component

```javascript
function ControlledInput({ value, onChange }) {
  // The parent owns the state; this component is a pure rendering conduit
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function SearchForm() {
  const [query, setQuery] = useState("");

  return (
    <form>
      <ControlledInput value={query} onChange={setQuery} />
      <p>Searching for: {query}</p>
    </form>
  );
}
```

### Uncontrolled Component

```javascript
function UncontrolledInput({ defaultValue, inputRef }) {
  // The component manages its own state; the parent reads via ref
  return <input defaultValue={defaultValue} ref={inputRef} />;
}

function QuickForm() {
  const nameRef = useRef(null);

  function handleSubmit(e) {
    e.preventDefault();
    console.log("Name:", nameRef.current.value);
  }

  return (
    <form onSubmit={handleSubmit}>
      <UncontrolledInput defaultValue="" inputRef={nameRef} />
      <button type="submit">Submit</button>
    </form>
  );
}
```

### When to Choose Each

| Factor | Controlled | Uncontrolled |
|--------|-----------|-------------|
| Real-time validation | Yes (value available every keystroke) | No (value read on demand) |
| Conditional formatting | Yes (transform value before rendering) | No |
| Multiple inputs synchronized | Yes (single source of truth) | Difficult |
| Performance with many inputs | May cause cascading re-renders | No re-renders on input |
| Simplicity | More boilerplate | Less boilerplate |
| Integration with form libraries | Most libraries expect controlled | Some (React Hook Form) use uncontrolled |

For most production forms, **controlled components** are preferred because they provide a single source of truth. For performance-sensitive forms with many fields, **uncontrolled components** (via React Hook Form) reduce re-renders by avoiding state updates on every keystroke.

> **See Also:** Part 3, Chapter 6 for the complete forms guide, including React Hook Form integration.

---

## 4.5 `useContext` Deep Dive: Setup, Optimization, Patterns

### Basic Setup

```javascript
import { createContext, useContext, useState, useMemo } from "react";

// 1. Create the context with a default value
const ThemeContext = createContext("light");

// 2. Create a provider component
function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("light");

  // Memoize the value to prevent unnecessary consumer re-renders
  // when the provider re-renders for reasons unrelated to theme
  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// 3. Create a custom hook for consumption
function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

// 4. Consume in any descendant
function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
      Switch to {theme === "light" ? "dark" : "light"} mode
    </button>
  );
}
```

### The Custom Hook Pattern

Always wrap `useContext` in a custom hook. This provides:

- **Validation:** The hook can throw if used outside the provider, producing a clear error message instead of cryptic `undefined` bugs.
- **Encapsulation:** Consumers import `useTheme`, not `ThemeContext`. The context implementation can change without affecting consumers.
- **Discoverability:** `useTheme` is self-documenting; `useContext(ThemeContext)` requires knowing the context name.

---

## 4.6 Why Context Re-Renders Everything (and How to Fix It)

When a Context provider's `value` changes, **every** component that calls `useContext` on that context re-renders. There is no built-in mechanism for a consumer to subscribe to only a part of the context value.

```javascript
// Problem: changing user.name causes EVERY consumer to re-render,
// including those that only read user.theme
const AppContext = createContext(null);

function App() {
  const [state, setState] = useState({
    user: { name: "Alice", role: "admin" },
    theme: "dark",
    notifications: 5,
  });

  return (
    <AppContext.Provider value={{ state, setState }}>
      <Header />     {/* Only needs theme */}
      <Sidebar />    {/* Only needs notifications */}
      <UserMenu />   {/* Only needs user */}
    </AppContext.Provider>
  );
}
```

### Fix 1: Split Contexts

Separate unrelated data into independent contexts:

```javascript
const ThemeContext = createContext("light");
const UserContext = createContext(null);
const NotificationContext = createContext(0);

function AppProviders({ children }) {
  const [theme, setTheme] = useState("dark");
  const [user, setUser] = useState({ name: "Alice", role: "admin" });
  const [notifications, setNotifications] = useState(5);

  return (
    <ThemeContext.Provider value={useMemo(() => ({ theme, setTheme }), [theme])}>
      <UserContext.Provider value={useMemo(() => ({ user, setUser }), [user])}>
        <NotificationContext.Provider value={notifications}>
          {children}
        </NotificationContext.Provider>
      </UserContext.Provider>
    </ThemeContext.Provider>
  );
}

// Now changing user.name only re-renders UserContext consumers
```

### Fix 2: Separate State from Dispatch

When using `useReducer` with Context, provide state and dispatch through separate contexts. Since `dispatch` never changes identity, components that only dispatch (and never read state) do not re-render when state changes:

```javascript
const StateContext = createContext(null);
const DispatchContext = createContext(null);

function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialState);

  return (
    <DispatchContext.Provider value={dispatch}>
      <StateContext.Provider value={state}>
        {children}
      </StateContext.Provider>
    </DispatchContext.Provider>
  );
}

function useCartState() {
  return useContext(StateContext);
}

function useCartDispatch() {
  return useContext(DispatchContext); // Stable identity; never causes re-renders
}

// AddToCartButton only dispatches; it never re-renders when cart state changes
function AddToCartButton({ productId }) {
  const dispatch = useCartDispatch();
  return (
    <button onClick={() => dispatch({ type: "ADD", payload: productId })}>
      Add to Cart
    </button>
  );
}
```

### Fix 3: External Store via useSyncExternalStore

For high-frequency state updates, bypass Context entirely and use an external store:

```javascript
function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  return {
    getState: () => state,
    setState: (updater) => {
      state = typeof updater === "function" ? updater(state) : updater;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const cartStore = createStore({ items: [], total: 0 });

// Components subscribe to specific slices
function CartTotal() {
  const total = useSyncExternalStore(
    cartStore.subscribe,
    () => cartStore.getState().total
  );

  return <span>Total: ${total.toFixed(2)}</span>;
}

function CartCount() {
  const count = useSyncExternalStore(
    cartStore.subscribe,
    () => cartStore.getState().items.length
  );

  return <span>{count} items</span>;
}
```

> **See Also:** Part 3, Chapter 2, Section 2.14 for the `useSyncExternalStore` API reference.

---

## 4.7 Context + useReducer: Poor Man's Redux

Combining Context with `useReducer` creates a lightweight state management system suitable for medium-complexity state shared across a subtree.

```javascript
const TodoContext = createContext(null);
const TodoDispatchContext = createContext(null);

function todoReducer(state, action) {
  switch (action.type) {
    case "ADD":
      return {
        ...state,
        todos: [...state.todos, {
          id: crypto.randomUUID(),
          text: action.payload,
          done: false,
        }],
      };
    case "TOGGLE":
      return {
        ...state,
        todos: state.todos.map((t) =>
          t.id === action.payload ? { ...t, done: !t.done } : t
        ),
      };
    case "DELETE":
      return {
        ...state,
        todos: state.todos.filter((t) => t.id !== action.payload),
      };
    case "SET_FILTER":
      return { ...state, filter: action.payload };
    default:
      return state;
  }
}

function TodoProvider({ children }) {
  const [state, dispatch] = useReducer(todoReducer, {
    todos: [],
    filter: "all",
  });

  return (
    <TodoDispatchContext.Provider value={dispatch}>
      <TodoContext.Provider value={state}>
        {children}
      </TodoContext.Provider>
    </TodoDispatchContext.Provider>
  );
}

function useTodoState() {
  const ctx = useContext(TodoContext);
  if (!ctx) throw new Error("useTodoState requires TodoProvider");
  return ctx;
}

function useTodoDispatch() {
  const ctx = useContext(TodoDispatchContext);
  if (!ctx) throw new Error("useTodoDispatch requires TodoProvider");
  return ctx;
}
```

This pattern provides: centralized state logic (the reducer), testable transitions (test the reducer as a pure function), stable dispatch identity (no useCallback wrappers needed), and explicit action types (self-documenting state changes).

### When to Graduate to an External Library

Context + useReducer reaches its limits when:

- **Many consumers access different slices.** Context re-renders all consumers on any state change, even with split contexts.
- **Middleware is needed.** Async actions, logging, or persistence middleware requires wrapping dispatch, which Context does not support natively.
- **DevTools are needed.** Redux DevTools, Zustand's middleware, and similar tools provide time-travel debugging and state inspection.
- **Performance-sensitive updates.** High-frequency state changes (real-time data, drag-and-drop coordinates) cause excessive re-renders through Context.

---

## 4.8 When to Reach for External State (Redux, Zustand, Jotai, Signals)

### Zustand: Simple, Minimal, Outside the React Tree

```javascript
import { create } from "zustand";

const useCartStore = create((set, get) => ({
  items: [],
  total: 0,

  addItem: (product) =>
    set((state) => {
      const items = [...state.items, product];
      return { items, total: items.reduce((s, i) => s + i.price, 0) };
    }),

  removeItem: (productId) =>
    set((state) => {
      const items = state.items.filter((i) => i.id !== productId);
      return { items, total: items.reduce((s, i) => s + i.price, 0) };
    }),

  getItemCount: () => get().items.length,
}));

// Components subscribe to specific slices (automatic selector)
function CartTotal() {
  const total = useCartStore((state) => state.total);
  return <span>Total: ${total.toFixed(2)}</span>;
}

function CartCount() {
  const count = useCartStore((state) => state.items.length);
  return <span>{count} items</span>;
}

function AddButton({ product }) {
  const addItem = useCartStore((state) => state.addItem);
  return <button onClick={() => addItem(product)}>Add</button>;
}
```

Zustand components re-render only when their selected slice changes, solving the Context re-render problem by design.

### Jotai: Atomic, Bottom-Up State

```javascript
import { atom, useAtom, useAtomValue } from "jotai";

// Atoms are independent units of state
const filterAtom = atom("all");
const todosAtom = atom([]);

// Derived atoms compute from other atoms
const filteredTodosAtom = atom((get) => {
  const todos = get(todosAtom);
  const filter = get(filterAtom);
  if (filter === "active") return todos.filter((t) => !t.done);
  if (filter === "completed") return todos.filter((t) => t.done);
  return todos;
});

function TodoList() {
  const filteredTodos = useAtomValue(filteredTodosAtom);
  return (
    <ul>
      {filteredTodos.map((t) => (
        <li key={t.id}>{t.text}</li>
      ))}
    </ul>
  );
}
```

### The Decision Framework

| Need | Recommendation |
|------|---------------|
| Simple local UI state | `useState` |
| Complex local state with many transitions | `useReducer` |
| Shared state in a small subtree (low frequency) | Context + useReducer |
| Shared state across the app (medium frequency) | Zustand |
| Granular, composable state atoms | Jotai |
| Enterprise app with strict patterns, middleware, DevTools | Redux Toolkit |
| Server data (fetching, caching, synchronization) | TanStack Query (not client state at all) |
| Shareable, bookmarkable state | URL search parameters |

---

## 4.9 Server State vs Client State: Fundamentally Different

TkDodo (Dominik Dorfmeister, maintainer of TanStack Query) articulated a foundational distinction: server state and client state are different categories that require different management strategies.

| Aspect | Client State | Server State |
|--------|-------------|-------------|
| Ownership | The application owns it entirely | The server owns it; the client has a snapshot |
| Freshness | Always current (you set it) | Potentially stale (others may have changed it) |
| Synchronicity | Synchronous access | Asynchronous (network latency) |
| Lifecycle | Created, updated, destroyed by the app | Fetched, cached, refetched, invalidated |
| Examples | Theme, UI toggles, form drafts, selections | User profiles, product lists, order history |

### The Anti-Pattern: Storing Server Data in Client State

```javascript
// Anti-pattern: fetching data and storing it in useState
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/users/${userId}`)
      .then((r) => r.json())
      .then((data) => { setUser(data); setLoading(false); })
      .catch((err) => { setError(err); setLoading(false); });
  }, [userId]);

  // Problems:
  // - No caching: re-fetches on every mount
  // - No deduplication: two components fetching the same user = two requests
  // - No background refetch: data goes stale silently
  // - No optimistic updates: mutations require manual state management
  // - Race conditions if userId changes rapidly
}
```

### The Correct Approach: TanStack Query

```javascript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

function UserProfile({ userId }) {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => fetch(`/api/users/${userId}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;

  return <h1>{user.name}</h1>;
}

// Mutation with cache invalidation
function UpdateUserButton({ userId, newName }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      fetch(`/api/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: newName }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      // Invalidate the cache; TanStack Query refetches automatically
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
    },
  });

  return (
    <button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
      {mutation.isPending ? "Saving..." : "Update Name"}
    </button>
  );
}
```

TanStack Query handles caching, deduplication, background refetching, stale-while-revalidate, error/loading states, and garbage collection. None of this should be built manually in useState + useEffect.

> **Common Mistake:** Developers often copy server data into Zustand or Redux after fetching it, creating two sources of truth (the cache and the store) that must be manually synchronized. Let TanStack Query be the single source of truth for server data. If you need a derived value, use TanStack Query's `select` option or compute it during render.

---

## 4.10 URL as State: Search Params as Your State Manager

Some application state belongs in the URL. If the state represents something the user might bookmark, share via link, or navigate back to via browser history, URL search parameters are the appropriate storage mechanism.

### When URL State Is Appropriate

- Search queries, filter selections, sort order, pagination page numbers
- Selected tab or view mode
- Dashboard configurations, date ranges, comparison parameters
- Any state where "sharing a link shares the state"

### Basic Implementation with useSearchParams

```javascript
import { useSearchParams } from "react-router-dom";

function ProductCatalog() {
  const [searchParams, setSearchParams] = useSearchParams();

  const category = searchParams.get("category") || "all";
  const sortBy = searchParams.get("sort") || "name";
  const page = parseInt(searchParams.get("page") || "1", 10);

  function updateFilters(updates) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      });
      return next;
    });
  }

  return (
    <div>
      <FilterBar
        category={category}
        sortBy={sortBy}
        onChange={(key, value) => updateFilters({ [key]: value, page: 1 })}
      />
      <ProductGrid category={category} sortBy={sortBy} page={page} />
      <Pagination
        page={page}
        onChange={(p) => updateFilters({ page: p })}
      />
    </div>
  );
}
// URL: /products?category=electronics&sort=price&page=2
// This state is bookmarkable, shareable, and works with browser back/forward.
```

### nuqs: Type-Safe URL State

The `nuqs` library provides a `useState`-like API for URL parameters with built-in parsing, type safety, and batched updates:

```javascript
import { useQueryState, parseAsInteger, parseAsStringEnum } from "nuqs";

function ProductCatalog() {
  const [category, setCategory] = useQueryState(
    "category",
    parseAsStringEnum(["all", "electronics", "clothing", "books"])
      .withDefault("all")
  );
  const [sortBy, setSortBy] = useQueryState("sort", { defaultValue: "name" });
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  return (
    <div>
      <FilterBar
        category={category}
        sortBy={sortBy}
        onCategoryChange={setCategory}
        onSortChange={(value) => {
          setSortBy(value);
          setPage(1); // Reset page when sort changes
        }}
      />
      <ProductGrid category={category} sortBy={sortBy} page={page} />
      <Pagination page={page} onChange={setPage} />
    </div>
  );
}
```

### URL State vs In-Memory State

URL state and client state are complementary, not competing. URL state is for user-facing application configuration that should be shareable and navigable. Client state is for ephemeral UI interactions that have no meaning outside the current session.

---

## 4.11 Exercise: Build the Same Feature with 4 Different State Strategies, Compare

### Problem Statement

Build a product filter panel that manages three pieces of state: a search query, a category filter, and a sort order. Implement it using four different strategies: (A) local useState, (B) useReducer, (C) Context + useReducer, and (D) URL search params. Compare the trade-offs.

### Strategy A: Local useState

```javascript
function ProductPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState("name");

  // Derived state: compute during render
  const filtered = products
    .filter((p) => category === "all" || p.category === category)
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    .toSorted((a, b) =>
      sortBy === "price" ? a.price - b.price : a.name.localeCompare(b.name)
    );

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." />
      <select value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="all">All</option>
        <option value="electronics">Electronics</option>
        <option value="clothing">Clothing</option>
      </select>
      <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
        <option value="name">Name</option>
        <option value="price">Price</option>
      </select>
      <p>{filtered.length} results</p>
      <ProductGrid products={filtered} />
    </div>
  );
}
```

### Strategy B: useReducer

```javascript
function filterReducer(state, action) {
  switch (action.type) {
    case "SET_QUERY": return { ...state, query: action.payload };
    case "SET_CATEGORY": return { ...state, category: action.payload };
    case "SET_SORT": return { ...state, sortBy: action.payload };
    case "RESET": return { query: "", category: "all", sortBy: "name" };
    default: return state;
  }
}

function ProductPage() {
  const [filters, dispatch] = useReducer(filterReducer, {
    query: "", category: "all", sortBy: "name",
  });

  const filtered = products
    .filter((p) => filters.category === "all" || p.category === filters.category)
    .filter((p) => p.name.toLowerCase().includes(filters.query.toLowerCase()))
    .toSorted((a, b) =>
      filters.sortBy === "price" ? a.price - b.price : a.name.localeCompare(b.name)
    );

  return (
    <div>
      <input
        value={filters.query}
        onChange={(e) => dispatch({ type: "SET_QUERY", payload: e.target.value })}
      />
      <select
        value={filters.category}
        onChange={(e) => dispatch({ type: "SET_CATEGORY", payload: e.target.value })}
      >
        <option value="all">All</option>
        <option value="electronics">Electronics</option>
        <option value="clothing">Clothing</option>
      </select>
      <select
        value={filters.sortBy}
        onChange={(e) => dispatch({ type: "SET_SORT", payload: e.target.value })}
      >
        <option value="name">Name</option>
        <option value="price">Price</option>
      </select>
      <button onClick={() => dispatch({ type: "RESET" })}>Reset All</button>
      <ProductGrid products={filtered} />
    </div>
  );
}
```

### Strategy C: Context + useReducer (Shared Across Components)

```javascript
// FilterContext.js
const FilterStateContext = createContext(null);
const FilterDispatchContext = createContext(null);

function FilterProvider({ children }) {
  const [state, dispatch] = useReducer(filterReducer, {
    query: "", category: "all", sortBy: "name",
  });

  return (
    <FilterDispatchContext.Provider value={dispatch}>
      <FilterStateContext.Provider value={state}>
        {children}
      </FilterStateContext.Provider>
    </FilterDispatchContext.Provider>
  );
}

function useFilters() {
  const ctx = useContext(FilterStateContext);
  if (!ctx) throw new Error("useFilters requires FilterProvider");
  return ctx;
}

function useFilterDispatch() {
  const ctx = useContext(FilterDispatchContext);
  if (!ctx) throw new Error("useFilterDispatch requires FilterProvider");
  return ctx;
}

// FilterBar.js (reads state, dispatches actions)
function FilterBar() {
  const filters = useFilters();
  const dispatch = useFilterDispatch();

  return (
    <div>
      <input
        value={filters.query}
        onChange={(e) => dispatch({ type: "SET_QUERY", payload: e.target.value })}
      />
      {/* ...category and sort selects... */}
    </div>
  );
}

// ProductGrid.js (reads state only)
function ProductGrid() {
  const filters = useFilters();
  const filtered = products
    .filter((p) => filters.category === "all" || p.category === filters.category)
    .filter((p) => p.name.toLowerCase().includes(filters.query.toLowerCase()));
  return <ul>{filtered.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

### Strategy D: URL Search Params

```javascript
function ProductPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const category = searchParams.get("cat") || "all";
  const sortBy = searchParams.get("sort") || "name";

  function updateParam(key, value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "" || value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });
  }

  const filtered = products
    .filter((p) => category === "all" || p.category === category)
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    .toSorted((a, b) =>
      sortBy === "price" ? a.price - b.price : a.name.localeCompare(b.name)
    );

  return (
    <div>
      <input value={query} onChange={(e) => updateParam("q", e.target.value)} />
      <select value={category} onChange={(e) => updateParam("cat", e.target.value)}>
        <option value="all">All</option>
        <option value="electronics">Electronics</option>
        <option value="clothing">Clothing</option>
      </select>
      <select value={sortBy} onChange={(e) => updateParam("sort", e.target.value)}>
        <option value="name">Name</option>
        <option value="price">Price</option>
      </select>
      <ProductGrid products={filtered} />
    </div>
  );
}
// URL: /products?q=keyboard&cat=electronics&sort=price
```

### Comparison Table

| Aspect | useState | useReducer | Context + useReducer | URL Params |
|--------|---------|-----------|---------------------|------------|
| Complexity | Lowest | Low | Medium | Low |
| Shareable via link | No | No | No | Yes |
| Browser back/forward | No | No | No | Yes |
| Survives page refresh | No | No | No | Yes |
| Cross-component sharing | Props only | Props only | Any descendant | Any component |
| Testability | In component | Reducer testable | Reducer testable | Integration test |
| Best for | Single component | Complex transitions | Shared subtree state | Bookmarkable filters |

### Key Takeaway

There is no universally "best" state management approach. The correct choice depends on the state's characteristics: who needs it (local vs shared), how it changes (simple vs complex transitions), whether it should survive navigation (ephemeral vs persistent), and whether it should be shareable (in-memory vs URL). Senior engineers choose the minimal abstraction that fits the specific requirements, starting with local state and escalating only when concrete needs demand it.

---

## Chapter Summary

State management in React follows a decision tree: start with local `useState`, lift state to a common ancestor when siblings need to share, compute derived values during render instead of storing them, and escalate to Context (for low-frequency cross-cutting data), Zustand/Jotai (for high-frequency shared state), or TanStack Query (for server data) only when simpler approaches are insufficient. Context re-renders all consumers on any value change; context splitting, dispatch separation, and external stores via `useSyncExternalStore` mitigate this. Server state and client state are fundamentally different categories: server state is a stale snapshot that needs caching and refetching (TanStack Query), while client state is synchronous and fully owned by the application. URL search parameters are the correct state mechanism for filters, pagination, and any state that should be bookmarkable and shareable.

## Further Reading

- [Thinking in React (React Documentation)](https://react.dev/learn/thinking-in-react) — the official state management starting point
- [Don't Sync State. Derive It! (Kent C. Dodds)](https://kentcdodds.com/blog/dont-sync-state-derive-it) — eliminating unnecessary state
- [React Query as a State Manager (TkDodo)](https://tkdodo.eu/blog/react-query-as-a-state-manager) — server state vs client state distinction
- [Zustand and React Context (TkDodo)](https://tkdodo.eu/blog/zustand-and-react-context) — combining Zustand with dependency injection
- [You Might Not Need an Effect (React Documentation)](https://react.dev/learn/you-might-not-need-an-effect) — derived state anti-patterns
- [nuqs: Type-Safe URL State for React](https://nuqs.dev/) — URL-as-state library documentation
