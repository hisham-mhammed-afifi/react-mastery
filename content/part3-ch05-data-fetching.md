# Part 3, Chapter 5: Data Fetching Patterns

## What You Will Learn

- Identify the five core problems with fetching data in raw `useEffect` (race conditions, no caching, no deduplication, no background refetch, boilerplate explosion)
- Implement AbortController-based cleanup to prevent stale state updates and cancel in-flight HTTP requests
- Model every fetch operation as a three-state machine: loading, error, data
- Build a production-quality `useFetch` custom hook and explain why a library is still preferable
- Apply TanStack Query patterns for queries, mutations, cache invalidation, and optimistic updates
- Implement infinite scroll with cursor-based pagination using `useInfiniteQuery` and Intersection Observer
- Design a prefetching strategy that warms the cache before the user navigates

---

## 5.1 Fetching in useEffect: The Naive Approach and Its Problems

The most common starting point for data fetching in React is `useEffect` with `fetch`:

```javascript
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/users/${userId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setUser(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [userId]);

  if (loading) return <Spinner />;
  if (error) return <ErrorMessage message={error} />;
  return <h1>{user.name}</h1>;
}
```

This code works for simple cases but suffers from five fundamental problems:

**1. Race conditions.** If `userId` changes rapidly (e.g., the user clicks through a list), multiple fetch requests are in flight simultaneously. The responses may arrive out of order, causing the component to display data for a previous `userId`.

**2. No caching.** Every time the component mounts, it fetches again. Navigate away and return: another fetch. Two components displaying the same user: two identical requests.

**3. No request deduplication.** If `<UserAvatar userId={5} />` and `<UserName userId={5} />` both mount, two independent requests for the same user fire simultaneously.

**4. No background refetching.** Once data is fetched, it never refreshes. If another user edits the profile on a different device, the displayed data becomes stale silently.

**5. Boilerplate explosion.** Every fetch location requires three `useState` calls (`data`, `loading`, `error`), cleanup logic, error handling, and potentially retry logic. This is 20-30 lines of near-identical code per endpoint.

---

## 5.2 Race Conditions in Data Fetching (and How to Prevent Them)

A race condition occurs when two asynchronous operations complete in a different order than they were initiated, and the application does not account for the ordering.

```
Timeline of a race condition:
  t=0: userId changes to 1 → fetch("/api/users/1") starts
  t=50: userId changes to 2 → fetch("/api/users/2") starts
  t=100: fetch for user 2 resolves → setUser(user2) ✓
  t=200: fetch for user 1 resolves → setUser(user1) ✗ STALE!

  The UI now shows user 1's data, but userId is 2.
```

### Solution 1: Boolean Ignore Flag

The simplest race condition fix uses a mutable boolean that the cleanup function sets to `true`:

```javascript
useEffect(() => {
  let ignore = false;

  async function fetchUser() {
    try {
      const res = await fetch(`/api/users/${userId}`);
      const data = await res.json();
      if (!ignore) {
        setUser(data);
        setLoading(false);
      }
    } catch (err) {
      if (!ignore) {
        setError(err.message);
        setLoading(false);
      }
    }
  }

  setLoading(true);
  fetchUser();

  return () => { ignore = true; };
}, [userId]);
```

When `userId` changes, the cleanup function from the previous effect runs, setting `ignore = true`. The old fetch's `.then` handler checks `ignore` before calling `setState`, preventing the stale update.

Limitation: the HTTP request still completes; only the state update is prevented. Bandwidth is wasted.

### Solution 2: AbortController (Preferred)

AbortController cancels the actual HTTP request at the browser level:

```javascript
useEffect(() => {
  const controller = new AbortController();

  async function fetchUser() {
    try {
      setLoading(true);
      const res = await fetch(`/api/users/${userId}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUser(data);
      setLoading(false);
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message);
        setLoading(false);
      }
      // AbortError is expected; silently ignore it
    }
  }

  fetchUser();
  return () => controller.abort();
}, [userId]);
```

When `userId` changes, `controller.abort()` cancels the in-flight request. The fetch promise rejects with an `AbortError`, which the catch block ignores. No stale data, no wasted bandwidth.

> **See Also:** Part 1, Chapter 6, Section 6.7 for AbortController fundamentals and Part 3, Chapter 2, Section 2.8 for the complete list of useEffect bugs.

---

## 5.3 Loading, Error, Data: The Three States of Every Fetch

Every asynchronous data operation exists in one of three states at any moment. Modeling these states explicitly prevents impossible combinations (e.g., showing both a spinner and an error simultaneously).

```javascript
// Explicit three-state model using useReducer
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

function useDataFetch(url) {
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
```

Using `useReducer` ensures that state transitions are atomic. It is impossible to reach a state where `loading` is `true` and `error` is non-null simultaneously, because each action replaces the entire state object.

> **Common Mistake:** Using three separate `useState` calls for `data`, `loading`, and `error` allows inconsistent intermediate states. Between `setLoading(false)` and `setError(message)`, there is a brief moment where `loading` is false but `error` is still null, potentially rendering the `data` view with no data. A single `useReducer` eliminates this class of bug.

---

## 5.4 AbortController for Cleanup

AbortController is the standard Web API for cancelling asynchronous operations. It is not React-specific; it works with `fetch`, `addEventListener`, and any API that accepts an `AbortSignal`.

```javascript
function useSearch(query) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        setResults(data.results);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Search failed:", err);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [query]);

  return { results, loading };
}
```

### Modern AbortSignal Conveniences

```javascript
// AbortSignal.timeout: auto-abort after a duration
fetch(url, { signal: AbortSignal.timeout(5000) }); // 5-second timeout

// AbortSignal.any: abort on ANY of multiple signals
const controller = new AbortController();
fetch(url, {
  signal: AbortSignal.any([
    controller.signal,           // Manual cancellation
    AbortSignal.timeout(10000),  // 10-second timeout
  ]),
});
```

---

## 5.5 Custom `useFetch` Hook: Building It Right

A production-quality custom hook wraps the three-state model with AbortController cleanup:

```javascript
function useFetch(url, options = {}) {
  const { enabled = true } = options;
  const [state, dispatch] = useReducer(fetchReducer, {
    data: null,
    loading: enabled,
    error: null,
  });

  useEffect(() => {
    if (!enabled || !url) {
      dispatch({ type: "FETCH_SUCCESS", payload: null });
      return;
    }

    const controller = new AbortController();
    dispatch({ type: "FETCH_START" });

    async function doFetch() {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        dispatch({ type: "FETCH_SUCCESS", payload: data });
      } catch (err) {
        if (err.name !== "AbortError") {
          dispatch({ type: "FETCH_ERROR", payload: err.message });
        }
      }
    }

    doFetch();
    return () => controller.abort();
  }, [url, enabled]);

  return state;
}

// Usage
function ProductDetail({ productId }) {
  const { data: product, loading, error } = useFetch(
    productId ? `/api/products/${productId}` : null,
    { enabled: !!productId }
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;
  if (!product) return null;

  return (
    <div>
      <h1>{product.name}</h1>
      <p>${product.price.toFixed(2)}</p>
    </div>
  );
}
```

### What This Hook Still Lacks

Even a well-built `useFetch` lacks: caching (re-fetches on every mount), deduplication (parallel mounts fetch independently), background refetching (no stale-while-revalidate), retry logic, window focus revalidation, and shared cache invalidation. These gaps are why data-fetching libraries exist.

---

## 5.6 Why You Should Use a Data Fetching Library

The problems that `useFetch` cannot solve require a centralized cache manager that operates outside the component tree. Data-fetching libraries provide:

| Capability | Raw useEffect | TanStack Query / SWR |
|------------|--------------|---------------------|
| Automatic caching | No | Yes (configurable staleTime, gcTime) |
| Request deduplication | No | Yes (same queryKey = one request) |
| Background refetching | No | Yes (on window focus, interval, reconnect) |
| Stale-while-revalidate | No | Yes (show cached data, refetch in background) |
| Optimistic updates | Manual | Built-in lifecycle (onMutate, onError rollback) |
| Cache invalidation | Not applicable | Yes (fuzzy key matching, targeted invalidation) |
| DevTools | No | Yes (visual cache inspection, manual refetch) |
| Retry logic | Manual | Built-in (configurable count and backoff) |
| Parallel / dependent queries | Manual | First-class (enabled option, query dependencies) |
| Infinite scroll / pagination | Manual | `useInfiniteQuery` with cursor support |

The React documentation explicitly recommends using a data-fetching library for production applications rather than raw `useEffect`.

---

## 5.7 TanStack Query (React Query) Patterns

### Basic Query

```javascript
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,  // Data fresh for 5 minutes
      gcTime: 30 * 60 * 1000,    // Cache garbage-collected after 30 minutes
      retry: 2,                    // Retry failed requests twice
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProductCatalog />
    </QueryClientProvider>
  );
}

function ProductCatalog() {
  const { data: products, isPending, error } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  if (isPending) return <Spinner />;
  if (error) return <ErrorBanner message={error.message} />;

  return (
    <ul>
      {products.map((p) => (
        <li key={p.id}>{p.name}: ${p.price.toFixed(2)}</li>
      ))}
    </ul>
  );
}
```

### Query Key Factory Pattern

```javascript
// Centralized query key definitions prevent key string mismatches
const productQueries = {
  all: () => ["products"],
  lists: () => [...productQueries.all(), "list"],
  list: (filters) => [...productQueries.lists(), filters],
  details: () => [...productQueries.all(), "detail"],
  detail: (id) => [...productQueries.details(), id],
};

// Usage in components
function ProductList({ category }) {
  const { data } = useQuery({
    queryKey: productQueries.list({ category }),
    queryFn: () => fetchProducts({ category }),
  });
}

function ProductDetail({ productId }) {
  const { data } = useQuery({
    queryKey: productQueries.detail(productId),
    queryFn: () => fetchProduct(productId),
  });
}

// Targeted cache invalidation
queryClient.invalidateQueries({ queryKey: productQueries.lists() });
// Invalidates all list variants without touching detail caches
```

### Mutations with Cache Invalidation

```javascript
import { useMutation, useQueryClient } from "@tanstack/react-query";

function AddProductForm() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (newProduct) => {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProduct),
      });
      if (!res.ok) throw new Error("Failed to create product");
      return res.json();
    },
    onSuccess: () => {
      // Invalidate product list queries; they refetch automatically
      queryClient.invalidateQueries({ queryKey: productQueries.lists() });
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    mutation.mutate({
      name: formData.get("name"),
      price: parseFloat(formData.get("price")),
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" required placeholder="Product name" />
      <input name="price" type="number" step="0.01" required placeholder="Price" />
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Adding..." : "Add Product"}
      </button>
      {mutation.error && <p className="error">{mutation.error.message}</p>}
    </form>
  );
}
```

---

## 5.8 SWR Patterns: Stale-While-Revalidate Strategy

SWR (by Vercel) implements the same core caching strategy with a simpler API:

```javascript
import useSWR from "swr";

const fetcher = (url) => fetch(url).then((res) => res.json());

function UserProfile({ userId }) {
  const { data: user, error, isLoading, mutate } = useSWR(
    `/api/users/${userId}`,
    fetcher,
    {
      revalidateOnFocus: true,    // Refetch when window regains focus
      revalidateOnReconnect: true, // Refetch when network reconnects
      dedupingInterval: 2000,      // Deduplicate requests within 2 seconds
    }
  );

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBanner message={error.message} />;

  return <h1>{user.name}</h1>;
}
```

### SWR Mutation

```javascript
import useSWRMutation from "swr/mutation";

async function updateUser(url, { arg }) {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });
  return res.json();
}

function EditUserForm({ userId }) {
  const { trigger, isMutating } = useSWRMutation(
    `/api/users/${userId}`,
    updateUser
  );

  async function handleSubmit(formData) {
    await trigger({ name: formData.get("name") });
    // SWR automatically revalidates the matching key after mutation
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit(new FormData(e.target)); }}>
      <input name="name" />
      <button disabled={isMutating}>Save</button>
    </form>
  );
}
```

### When to Choose SWR vs TanStack Query

| Factor | SWR | TanStack Query |
|--------|-----|---------------|
| Bundle size | ~5 KB | ~16 KB |
| API complexity | Minimal | Feature-rich |
| Mutation support | Basic (`useSWRMutation`) | Advanced (lifecycle callbacks, optimistic) |
| Infinite scroll | `useSWRInfinite` | `useInfiniteQuery` (more ergonomic) |
| DevTools | Community plugin | Built-in |
| Cache invalidation | `mutate(key)` | Fuzzy key matching, surgical invalidation |
| Framework support | React only | React, Vue, Solid, Angular, Svelte |

> **See Also:** Part 3, Chapter 4, Section 4.9 for the server state vs client state distinction that underlies both libraries' design.

---

## 5.9 Optimistic Updates: Updating UI Before the Server Responds

Optimistic updates display the expected result immediately, then confirm or roll back when the server responds. This eliminates the perceived latency of waiting for a network round-trip.

### TanStack Query: Cache-Level Optimistic Update

```javascript
function useToggleTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (todoId) => {
      const res = await fetch(`/api/todos/${todoId}/toggle`, { method: "PATCH" });
      if (!res.ok) throw new Error("Toggle failed");
      return res.json();
    },

    onMutate: async (todoId) => {
      // 1. Cancel outgoing refetches to prevent overwriting optimistic data
      await queryClient.cancelQueries({ queryKey: ["todos"] });

      // 2. Snapshot the current cache value (for rollback)
      const previousTodos = queryClient.getQueryData(["todos"]);

      // 3. Optimistically update the cache
      queryClient.setQueryData(["todos"], (old) =>
        old.map((todo) =>
          todo.id === todoId ? { ...todo, done: !todo.done } : todo
        )
      );

      // 4. Return the snapshot as context for onError
      return { previousTodos };
    },

    onError: (err, todoId, context) => {
      // Roll back to the snapshot on failure
      queryClient.setQueryData(["todos"], context.previousTodos);
    },

    onSettled: () => {
      // Always refetch after mutation to sync with server
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
}

function TodoItem({ todo }) {
  const toggleMutation = useToggleTodo();

  return (
    <li
      className={todo.done ? "completed" : ""}
      onClick={() => toggleMutation.mutate(todo.id)}
      style={{ opacity: toggleMutation.isPending ? 0.6 : 1 }}
    >
      {todo.text}
    </li>
  );
}
```

> **Common Mistake:** Forgetting to cancel outgoing refetches in `onMutate`. If a background refetch resolves between the optimistic update and the mutation response, it overwrites the optimistic data with stale server data, causing a visible flicker. Always call `queryClient.cancelQueries` before setting optimistic data.

---

## 5.10 Pagination, Infinite Scroll, and Cursor-Based Fetching

### Offset-Based Pagination

```javascript
function PaginatedProducts() {
  const [page, setPage] = useState(1);

  const { data, isPending } = useQuery({
    queryKey: ["products", "list", { page }],
    queryFn: () => fetch(`/api/products?page=${page}&limit=20`).then((r) => r.json()),
    placeholderData: (previousData) => previousData, // Keep previous data while loading next page
  });

  return (
    <div>
      {isPending ? <Spinner /> : (
        <ProductGrid products={data.items} />
      )}
      <div className="pagination">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          Previous
        </button>
        <span>Page {page} of {data?.totalPages}</span>
        <button onClick={() => setPage((p) => p + 1)} disabled={page >= (data?.totalPages ?? 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
```

### Cursor-Based Infinite Scroll with useInfiniteQuery

```javascript
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

function InfiniteProductFeed() {
  const sentinelRef = useRef(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    error,
  } = useInfiniteQuery({
    queryKey: ["products", "infinite"],
    queryFn: async ({ pageParam }) => {
      const url = pageParam
        ? `/api/products?cursor=${pageParam}&limit=20`
        : "/api/products?limit=20";
      const res = await fetch(url);
      return res.json();
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  // Intersection Observer: fetch next page when sentinel enters viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    const sentinel = sentinelRef.current;
    if (sentinel) observer.observe(sentinel);

    return () => {
      if (sentinel) observer.unobserve(sentinel);
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isPending) return <Spinner />;
  if (error) return <ErrorBanner message={error.message} />;

  // Flatten pages into a single array
  const allProducts = data.pages.flatMap((page) => page.items);

  return (
    <div>
      <ul className="product-feed">
        {allProducts.map((product) => (
          <li key={product.id} className="product-card">
            <h3>{product.name}</h3>
            <span>${product.price.toFixed(2)}</span>
          </li>
        ))}
      </ul>

      {/* Sentinel element: triggers fetchNextPage when visible */}
      <div ref={sentinelRef} style={{ height: 1 }} />

      {isFetchingNextPage && <Spinner />}
      {!hasNextPage && <p className="end-message">No more products</p>}
    </div>
  );
}
```

### Cursor-Based vs Offset-Based

| Aspect | Offset-Based | Cursor-Based |
|--------|-------------|-------------|
| Implementation | `?page=3&limit=20` | `?cursor=abc123&limit=20` |
| Stability under mutations | Breaks (items shift) | Stable (cursor points to fixed position) |
| Performance at scale | Degrades (OFFSET in SQL) | Constant (indexed lookup) |
| Random page access | Easy (`?page=N`) | Difficult (must traverse) |
| Best for | Paginated tables with page numbers | Infinite scroll, real-time feeds |

---

## 5.11 Prefetching and Cache Warming

Prefetching loads data into the cache before the user needs it, eliminating perceived loading times on navigation.

### Prefetch on Hover

```javascript
function ProductLink({ product }) {
  const queryClient = useQueryClient();

  function handleMouseEnter() {
    // Warm the cache when the user hovers; data is ready when they click
    queryClient.prefetchQuery({
      queryKey: productQueries.detail(product.id),
      queryFn: () => fetchProduct(product.id),
      staleTime: 60 * 1000, // Consider fresh for 1 minute
    });
  }

  return (
    <Link
      to={`/products/${product.id}`}
      onMouseEnter={handleMouseEnter}
    >
      {product.name}
    </Link>
  );
}
```

### Prefetch on Route Transition

```javascript
// In a route loader (React Router v7+ / TanStack Router)
function productDetailLoader(queryClient) {
  return async ({ params }) => {
    // If data is fresh in cache, return immediately (no fetch)
    // If stale, fetch in background and return cached data
    await queryClient.ensureQueryData({
      queryKey: productQueries.detail(params.productId),
      queryFn: () => fetchProduct(params.productId),
      staleTime: 5 * 60 * 1000,
    });
    return null; // Data is now in cache; component reads via useQuery
  };
}
```

### Prefetch Adjacent Pages

```javascript
function PaginatedList({ currentPage }) {
  const queryClient = useQueryClient();

  // Prefetch the next page in the background
  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ["products", "list", { page: currentPage + 1 }],
      queryFn: () => fetchProducts({ page: currentPage + 1 }),
    });
  }, [currentPage, queryClient]);

  // ... render current page
}
```

---

## 5.12 Exercise: Build a Data-Heavy Dashboard with Proper Fetching Patterns

### Problem Statement

Build a dashboard that displays: (1) a summary card with total revenue and order count, (2) a paginated orders table, and (3) a real-time notifications feed. Use TanStack Query for all data fetching, implementing proper caching, pagination, and automatic refetching.

### Solution

```javascript
import {
  useQuery,
  useInfiniteQuery,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60 * 1000, retry: 2 },
  },
});

// Query key factory
const dashboardQueries = {
  summary: () => ["dashboard", "summary"],
  orders: (filters) => ["dashboard", "orders", filters],
  notifications: () => ["dashboard", "notifications"],
};

// API functions (abstracted from components)
async function fetchSummary() {
  const res = await fetch("/api/dashboard/summary");
  if (!res.ok) throw new Error("Failed to load summary");
  return res.json();
}

async function fetchOrders({ page, sortBy }) {
  const res = await fetch(`/api/orders?page=${page}&sort=${sortBy}&limit=10`);
  if (!res.ok) throw new Error("Failed to load orders");
  return res.json();
}

async function fetchNotifications({ pageParam }) {
  const url = pageParam
    ? `/api/notifications?cursor=${pageParam}&limit=15`
    : "/api/notifications?limit=15";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load notifications");
  return res.json();
}

// Component 1: Summary Card
function SummaryCard() {
  const { data, isPending, error } = useQuery({
    queryKey: dashboardQueries.summary(),
    queryFn: fetchSummary,
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  if (isPending) return <div className="summary-skeleton" />;
  if (error) return <p className="error">Failed to load summary</p>;

  return (
    <div className="summary-card">
      <div>
        <h3>Revenue</h3>
        <span className="metric">${data.totalRevenue.toLocaleString()}</span>
      </div>
      <div>
        <h3>Orders</h3>
        <span className="metric">{data.orderCount}</span>
      </div>
      <div>
        <h3>Avg Order</h3>
        <span className="metric">
          ${(data.totalRevenue / data.orderCount).toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// Component 2: Paginated Orders Table
function OrdersTable() {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("date");

  const { data, isPending } = useQuery({
    queryKey: dashboardQueries.orders({ page, sortBy }),
    queryFn: () => fetchOrders({ page, sortBy }),
    placeholderData: (prev) => prev,
  });

  // Prefetch next page
  useEffect(() => {
    if (data?.totalPages && page < data.totalPages) {
      queryClient.prefetchQuery({
        queryKey: dashboardQueries.orders({ page: page + 1, sortBy }),
        queryFn: () => fetchOrders({ page: page + 1, sortBy }),
      });
    }
  }, [page, sortBy, data?.totalPages]);

  return (
    <div>
      <div className="table-controls">
        <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }}>
          <option value="date">Date</option>
          <option value="total">Total</option>
          <option value="status">Status</option>
        </select>
      </div>

      {isPending ? (
        <TableSkeleton rows={10} />
      ) : (
        <table className="orders-table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.orders.map((order) => (
              <tr key={order.id}>
                <td>{order.id}</td>
                <td>{order.customerName}</td>
                <td>${order.total.toFixed(2)}</td>
                <td><StatusBadge status={order.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="pagination">
        <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}>Previous</button>
        <span>Page {page} of {data?.totalPages ?? "..."}</span>
        <button onClick={() => setPage((p) => p + 1)} disabled={page >= (data?.totalPages ?? 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

// Component 3: Infinite Notifications Feed
function NotificationsFeed() {
  const sentinelRef = useRef(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } =
    useInfiniteQuery({
      queryKey: dashboardQueries.notifications(),
      queryFn: fetchNotifications,
      initialPageParam: null,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      refetchInterval: 10 * 1000, // Poll for new notifications
    });

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    const el = sentinelRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isPending) return <Spinner />;

  const allNotifications = data.pages.flatMap((p) => p.items);

  return (
    <div className="notifications-feed">
      <h3>Notifications</h3>
      <ul>
        {allNotifications.map((n) => (
          <li key={n.id} className={`notification ${n.read ? "" : "unread"}`}>
            <span className="notification-text">{n.message}</span>
            <time>{formatRelativeTime(n.createdAt)}</time>
          </li>
        ))}
      </ul>
      <div ref={sentinelRef} />
      {isFetchingNextPage && <Spinner />}
    </div>
  );
}

// Dashboard: composes all three components
function Dashboard() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="dashboard">
        <h1>Dashboard</h1>
        <SummaryCard />
        <div className="dashboard-grid">
          <OrdersTable />
          <NotificationsFeed />
        </div>
      </div>
    </QueryClientProvider>
  );
}
```

### Key Takeaway

Each section of the dashboard uses a different fetching pattern appropriate to its data characteristics: the summary card uses auto-refetching on a 30-second interval for near-real-time metrics; the orders table uses offset-based pagination with next-page prefetching for instant page transitions; the notifications feed uses cursor-based infinite scroll with polling for real-time updates. All three share a centralized cache via `QueryClient`, enabling deduplication and coordinated invalidation. The query key factory ensures consistent, hierarchical cache organization. This exercise demonstrates that production dashboards rarely need a single fetching strategy; they compose multiple patterns based on each data source's access patterns and freshness requirements.

---

## Chapter Summary

Data fetching in React requires solving five problems that raw `useEffect` cannot address: race conditions, caching, deduplication, background refetching, and boilerplate. AbortController prevents stale state updates by cancelling in-flight requests during cleanup. The three-state model (loading, error, data) ensures UI consistency. TanStack Query provides a complete server-state management system with query key factories for organized caching, `useMutation` for writes with cache invalidation, optimistic updates for perceived performance, and `useInfiniteQuery` for cursor-based infinite scroll. SWR offers a lighter alternative for read-heavy applications. Prefetching on hover or route transition eliminates perceived loading times by warming the cache before the user needs the data.

## Further Reading

- [TanStack Query v5 Documentation](https://tanstack.com/query/v5/docs) — official API reference and guides
- [Practical React Query (TkDodo)](https://tkdodo.eu/blog/practical-react-query) — the authoritative blog series on TanStack Query patterns
- [SWR Documentation](https://swr.vercel.app/) — official SWR guide from Vercel
- [You Might Not Need an Effect (React Documentation)](https://react.dev/learn/you-might-not-need-an-effect) — when not to fetch in useEffect
- [Fixing Race Conditions in React with useEffect (Max Rozen)](https://maxrozen.com/race-conditions-fetching-data-react-with-useeffect) — detailed race condition analysis
- [Query Key Factory (TkDodo)](https://tkdodo.eu/blog/effective-react-query-keys) — the query key organization pattern
