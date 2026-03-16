# Part 1, Chapter 8: Higher-Order Functions & Functional Patterns

## What You Will Learn

- Define higher-order functions and identify both built-in and custom examples in JavaScript
- Use `map`, `filter`, `reduce`, `forEach`, `every`, and `some` to transform and query data declaratively
- Build custom higher-order functions that accept or return functions for reusable behavior
- Implement currying and partial application, and apply them to React event handler patterns
- Compose small, single-purpose functions into pipelines using `pipe` and `compose`
- Distinguish pure functions from impure ones, identify side effects, and explain why React's rendering model requires purity
- Connect higher-order function concepts to React components, hooks, and Higher-Order Components (HOCs)

---

## 8.1 Functions as First-Class Citizens

In JavaScript, functions are **first-class values**. They can be assigned to variables, stored in data structures, passed as arguments to other functions, and returned from functions. This property is the foundation of every pattern in this chapter.

```javascript
// Assigned to a variable
const greet = function(name) {
  return `Hello, ${name}`;
};

// Stored in a data structure
const validators = [
  (value) => value.length > 0,
  (value) => value.includes("@"),
  (value) => value.length < 255,
];

// Passed as an argument
function runValidator(validator, value) {
  return validator(value);
}

console.log(runValidator(validators[1], "alice@example.com")); // true

// Returned from a function
function createGreeter(greeting) {
  return function(name) {
    return `${greeting}, ${name}!`;
  };
}

const sayHello = createGreeter("Hello");
const sayGoodbye = createGreeter("Goodbye");

console.log(sayHello("Alice"));   // "Hello, Alice!"
console.log(sayGoodbye("Bob"));   // "Goodbye, Bob!"
```

> **See Also:** Part 1, Chapter 3, Section 3.1 for how the returned function forms a closure over the `greeting` variable.

Functions being first-class is not merely a language feature; it is the architectural basis for React. Components are functions. Hooks are functions that accept and return functions. Event handlers are functions passed as props. The entire React programming model assumes that functions can be created, passed around, and composed freely.

---

## 8.2 Higher-Order Functions: map, filter, reduce, forEach, every, some

A **higher-order function** (HOF) is any function that takes a function as an argument, returns a function, or both. JavaScript's array methods are the most common examples.

### `Array.prototype.map(callback)`

Transforms each element by applying `callback`, returning a new array of the same length.

```javascript
const products = [
  { name: "Keyboard", price: 79.99 },
  { name: "Mouse", price: 49.99 },
  { name: "Monitor", price: 299.99 },
];

// Transform each product into a formatted string
const priceLabels = products.map(
  (product) => `${product.name}: $${product.price.toFixed(2)}`
);

console.log(priceLabels);
// ["Keyboard: $79.99", "Mouse: $49.99", "Monitor: $299.99"]
```

> **React Connection:** `map` is the primary tool for rendering lists in React. Every `{items.map(item => <Component key={item.id} />)}` pattern is a higher-order function call. The callback transforms data into JSX elements. Understanding `map` deeply (it always returns an array of the same length, never mutates, and requires a unique `key`) is essential for React list rendering.

### `Array.prototype.filter(predicate)`

Returns a new array containing only elements for which `predicate` returns `true`.

```javascript
const orders = [
  { id: 1, status: "shipped", total: 150 },
  { id: 2, status: "pending", total: 89 },
  { id: 3, status: "shipped", total: 220 },
  { id: 4, status: "cancelled", total: 45 },
];

const shippedOrders = orders.filter((order) => order.status === "shipped");
console.log(shippedOrders);
// [{ id: 1, status: "shipped", total: 150 }, { id: 3, status: "shipped", total: 220 }]

// Chaining: filter then map
const shippedTotals = orders
  .filter((order) => order.status === "shipped")
  .map((order) => order.total);

console.log(shippedTotals); // [150, 220]
```

### `Array.prototype.reduce(callback, initialValue)`

Accumulates array elements into a single value. The callback receives the accumulator and the current element.

```javascript
const lineItems = [
  { product: "Widget", quantity: 3, unitPrice: 10 },
  { product: "Gadget", quantity: 1, unitPrice: 25 },
  { product: "Doohickey", quantity: 5, unitPrice: 4 },
];

// Sum the total cost
const totalCost = lineItems.reduce(
  (sum, item) => sum + item.quantity * item.unitPrice,
  0 // Initial accumulator value
);

console.log(totalCost); // 75

// Build an object: group items by product
const byProduct = lineItems.reduce((grouped, item) => {
  grouped[item.product] = item;
  return grouped;
}, {});

console.log(byProduct.Widget); // { product: "Widget", quantity: 3, unitPrice: 10 }
```

**ES2024 alternative for grouping:** `Object.groupBy` eliminates the common reduce-to-group pattern:

```javascript
const ordersByStatus = Object.groupBy(orders, (order) => order.status);
console.log(ordersByStatus.shipped);
// [{ id: 1, ... }, { id: 3, ... }]
```

> **Common Mistake:** Using `reduce` when `map` or `filter` (or both chained) would be clearer. `reduce` is the most general array method and can implement any array transformation, but its power comes at the cost of readability. A `reduce` that builds a new array is almost always better expressed as `map` or `filter`. Reserve `reduce` for accumulating into a non-array result (sums, objects, grouped data) or when a single-pass transformation is necessary for performance.

### `Array.prototype.forEach(callback)`

Executes `callback` for each element. Returns `undefined`. Used purely for side effects.

```javascript
const notifications = ["Message received", "Friend request", "Update available"];

notifications.forEach((notification, index) => {
  console.log(`${index + 1}. ${notification}`);
});
// 1. Message received
// 2. Friend request
// 3. Update available
```

Unlike `map`, `forEach` does not return a new array. It is appropriate when the goal is a side effect (logging, DOM manipulation, API calls) rather than a data transformation.

### `Array.prototype.every(predicate)` and `Array.prototype.some(predicate)`

`every` returns `true` if all elements satisfy the predicate. `some` returns `true` if at least one element does. Both short-circuit: `every` stops at the first `false`, `some` stops at the first `true`.

```javascript
const formFields = [
  { name: "username", value: "alice", valid: true },
  { name: "email", value: "alice@example.com", valid: true },
  { name: "password", value: "", valid: false },
];

const isFormValid = formFields.every((field) => field.valid);
console.log(isFormValid); // false

const hasAnyInput = formFields.some((field) => field.value.length > 0);
console.log(hasAnyInput); // true
```

> **React Connection:** `every` and `some` are useful in form validation, conditional rendering, and permission checks. For example, a "Submit" button might be enabled only when `fields.every(f => f.valid)`, or a warning banner shows when `errors.some(e => e.severity === "critical")`.

---

## 8.3 Custom Higher-Order Functions

Beyond built-in array methods, higher-order functions are a general pattern for abstracting reusable behavior.

### Functions That Accept Functions

```javascript
// A retry utility: accepts any async operation and retries it
function withRetry(operation, maxAttempts = 3) {
  let attempts = 0;

  return async function(...args) {
    while (attempts < maxAttempts) {
      try {
        return await operation(...args);
      } catch (error) {
        attempts += 1;
        if (attempts >= maxAttempts) throw error;
        console.log(`Attempt ${attempts} failed, retrying...`);
      }
    }
  };
}

const fetchUserWithRetry = withRetry(
  async (userId) => {
    const response = await fetch(`/api/users/${userId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },
  3
);

// Usage: automatically retries up to 3 times
// const user = await fetchUserWithRetry(42);
```

### Functions That Return Functions

```javascript
// A permission checker factory
function createPermissionChecker(userPermissions) {
  return function(requiredPermission) {
    return userPermissions.includes(requiredPermission);
  };
}

const canAccess = createPermissionChecker(["read", "write", "admin"]);

console.log(canAccess("read"));    // true
console.log(canAccess("delete"));  // false
console.log(canAccess("admin"));   // true
```

### Functions That Do Both

```javascript
// A timing wrapper: accepts a function, returns a timed version
function withTiming(fn, label) {
  return function(...args) {
    const start = performance.now();
    const result = fn(...args);
    const duration = performance.now() - start;
    console.log(`${label || fn.name}: ${duration.toFixed(2)}ms`);
    return result;
  };
}

function sortLargeArray(arr) {
  return [...arr].sort((a, b) => a - b);
}

const timedSort = withTiming(sortLargeArray, "sortLargeArray");

const numbers = Array.from({ length: 100000 }, () => Math.random());
const sorted = timedSort(numbers);
// Logs: "sortLargeArray: 42.17ms" (time varies)
```

These patterns (retry, permission checking, timing) illustrate the power of HOFs: they separate the "what" (the business logic) from the "how" (retry policy, permission model, performance measurement).

---

## 8.4 Currying and Partial Application

### Currying

Currying transforms a function that takes multiple arguments into a chain of functions, each taking exactly one argument.

```javascript
// Non-curried
function add(a, b) {
  return a + b;
}

// Curried (manually)
function curriedAdd(a) {
  return function(b) {
    return a + b;
  };
}

console.log(curriedAdd(5)(3)); // 8

const addFive = curriedAdd(5);
console.log(addFive(10));      // 15
console.log(addFive(20));      // 25
```

### Partial Application

Partial application fixes some arguments of a function and returns a new function expecting the remaining ones. Unlike currying, partial application can fix any number of arguments at once.

```javascript
// Using bind for partial application
function createApiUrl(baseUrl, version, endpoint) {
  return `${baseUrl}/api/${version}/${endpoint}`;
}

// Fix the first two arguments
const createV2Url = createApiUrl.bind(null, "https://api.example.com", "v2");

console.log(createV2Url("users"));    // "https://api.example.com/api/v2/users"
console.log(createV2Url("products")); // "https://api.example.com/api/v2/products"
```

### Currying in React Event Handlers

A practical application of currying in React: creating parameterized event handlers without inline arrow functions in JSX.

```javascript
function SettingsForm() {
  const [settings, setSettings] = useState({
    theme: "dark",
    language: "en",
    fontSize: 14,
  });

  // Curried handler: field name -> event -> state update
  const handleChange = (field) => (event) => {
    setSettings((prev) => ({ ...prev, [field]: event.target.value }));
  };

  return (
    <form>
      <select value={settings.theme} onChange={handleChange("theme")}>
        <option value="dark">Dark</option>
        <option value="light">Light</option>
      </select>

      <select value={settings.language} onChange={handleChange("language")}>
        <option value="en">English</option>
        <option value="es">Spanish</option>
      </select>

      <input
        type="number"
        value={settings.fontSize}
        onChange={handleChange("fontSize")}
      />
    </form>
  );
}
```

`handleChange("theme")` returns a function that React calls with the event. The field name is captured via closure (currying), eliminating the need for a separate handler per field.

> **Common Mistake:** Calling a curried handler incorrectly in JSX. Writing `onChange={handleChange("theme")(event)}` or `onChange={handleChange}` instead of `onChange={handleChange("theme")}` is a frequent error. The first form calls the function immediately during render (passing `event` which does not exist yet). The second passes the outer function without applying the field name. The correct form, `handleChange("theme")`, returns the inner function for React to call later with the event.

---

## 8.5 Function Composition (pipe and compose)

Function composition combines small, single-purpose functions into a pipeline where the output of one becomes the input of the next.

### `compose`: Right-to-Left Execution

```javascript
const compose = (...fns) => (x) => fns.reduceRight((acc, fn) => fn(acc), x);
```

`compose(f, g, h)(x)` evaluates as `f(g(h(x)))`. The rightmost function runs first.

### `pipe`: Left-to-Right Execution

```javascript
const pipe = (...fns) => (x) => fns.reduce((acc, fn) => fn(acc), x);
```

`pipe(f, g, h)(x)` evaluates as `h(g(f(x)))`. The leftmost function runs first. Most developers find `pipe` more readable because it follows natural reading order.

### Practical Example: Data Transformation Pipeline

```javascript
const pipe = (...fns) => (x) => fns.reduce((acc, fn) => fn(acc), x);

// Small, single-purpose functions
const filterActive = (users) => users.filter((u) => u.active);
const sortByName = (users) => users.toSorted((a, b) => a.name.localeCompare(b.name));
const take = (n) => (arr) => arr.slice(0, n);
const formatNames = (users) => users.map((u) => `${u.name} (${u.role})`);

// Compose them into a pipeline
const getTopActiveUsers = pipe(
  filterActive,
  sortByName,
  take(5),
  formatNames
);

const users = [
  { name: "Zara", role: "admin", active: true },
  { name: "Alice", role: "editor", active: true },
  { name: "Bob", role: "viewer", active: false },
  { name: "Carol", role: "editor", active: true },
  { name: "Dave", role: "admin", active: true },
  { name: "Eve", role: "viewer", active: true },
  { name: "Frank", role: "editor", active: true },
  { name: "Grace", role: "admin", active: true },
];

console.log(getTopActiveUsers(users));
// ["Alice (editor)", "Carol (editor)", "Dave (admin)", "Eve (viewer)", "Frank (editor)"]
```

Each function in the pipeline is independently testable, reusable, and composable. Adding a new transformation (e.g., filtering by role) requires only inserting a function into the pipeline.

### The TC39 Pipeline Operator (Stage 2)

A pipeline operator (`|>`) is under consideration by TC39 (currently Stage 2, using the "Hack pipes" variant with a `%` placeholder). If standardized, it would enable:

```javascript
// Hypothetical future syntax (not yet standard)
// users |> filterActive(%) |> sortByName(%) |> take(5)(%) |> formatNames(%)
```

Until this is standardized, `pipe` and `compose` utilities serve the same purpose.

> **React Connection:** Function composition is the conceptual foundation for React's custom hooks pattern. A complex hook like `useFormValidation` might internally compose `useState`, `useEffect`, and `useCallback`. Redux middleware chains are function composition. Even JSX itself is composition: `<Layout><Sidebar /><Content /></Layout>` composes components by nesting them.

---

## 8.6 Pure Functions and Side Effects

### Pure Functions

A function is **pure** if it satisfies two conditions:

1. **Deterministic**: given the same inputs, it always produces the same output
2. **No side effects**: it does not cause observable changes outside its own scope

```javascript
// Pure: deterministic, no side effects
function calculateDiscount(price, discountRate) {
  return price * (1 - discountRate);
}

console.log(calculateDiscount(100, 0.2)); // 80 (always)
console.log(calculateDiscount(100, 0.2)); // 80 (always)

// Impure: depends on external mutable state
let taxRate = 0.08;
function calculateTotal(price) {
  return price * (1 + taxRate); // Reading external variable
}

// Impure: causes a side effect
function logAndReturn(value) {
  console.log(value); // Side effect: I/O
  return value;
}

// Impure: non-deterministic
function generateId() {
  return Math.random().toString(36).slice(2); // Different every time
}
```

### Side Effects

A **side effect** is any observable interaction with the world outside the function's local scope:

- Modifying external variables or object properties
- Writing to the console, DOM, network, or storage
- Reading from mutable external state (`Date.now()`, `Math.random()`, global variables)
- Throwing exceptions
- Mutating function arguments

### Referential Transparency

A pure function produces **referentially transparent** expressions: the function call can be replaced with its return value without changing program behavior.

```javascript
// Referentially transparent
const result = calculateDiscount(100, 0.2);
// We can replace every occurrence of calculateDiscount(100, 0.2) with 80
// and the program behaves identically.

// NOT referentially transparent
const id = generateId();
// We cannot replace generateId() with a specific string,
// because it returns a different value each time.
```

### Why Purity Matters for React

React's rendering model depends on purity:

1. **Rendering must be pure.** Given the same props and state, a component must return the same JSX. React may call component functions multiple times (Strict Mode, concurrent rendering), so impure renders produce inconsistent UIs.

2. **`useEffect` quarantines side effects.** Side effects (data fetching, subscriptions, DOM mutations) are pushed into `useEffect`, which runs after the pure render phase completes.

3. **Memoization assumes purity.** `React.memo`, `useMemo`, and `useCallback` skip re-computation when inputs have not changed. This optimization is only correct if the computation is pure; an impure computation might return a different result even with identical inputs.

4. **Concurrent rendering relies on purity.** React's ability to pause, discard, and replay renders (via Suspense and transitions) assumes that rendering has no side effects. An impure render that fires a network request would duplicate requests when React replays it.

```javascript
// Pure component: safe for React to call multiple times
function PriceDisplay({ basePrice, discount }) {
  const finalPrice = basePrice * (1 - discount);
  return <span>${finalPrice.toFixed(2)}</span>;
}

// Impure component: UNSAFE, breaks React's assumptions
function BrokenCounter({ label }) {
  // Side effect during render: modifies external state
  globalClickCount += 1; // DO NOT do this
  return <span>{label}: {globalClickCount}</span>;
}
```

> **React Connection:** The React Compiler (released as v1.0 in October 2025) automatically memoizes components and computations, eliminating much of the need for manual `useMemo` and `useCallback`. This automation is only possible because the compiler assumes components are pure. If your components perform side effects during render, the compiler's optimizations produce incorrect behavior. Purity is not just a best practice; it is a contract that enables React's optimization pipeline.

---

## 8.7 How React Components Are Higher-Order Functions

React components are functions that take props as input and return JSX as output. This makes React's component model a direct application of functional programming principles.

### Components as Functions

```javascript
// A React component is a function: Props -> JSX
function UserCard({ name, role, avatarUrl }) {
  return (
    <div className="user-card">
      <img src={avatarUrl} alt={name} />
      <h3>{name}</h3>
      <span>{role}</span>
    </div>
  );
}

// Rendering a list is map: Array<Data> -> Array<JSX>
function UserList({ users }) {
  return (
    <div>
      {users.map((user) => (
        <UserCard key={user.id} {...user} />
      ))}
    </div>
  );
}
```

### Higher-Order Components (HOCs)

A Higher-Order Component is a function that takes a component and returns a new enhanced component. It is the React-specific application of higher-order functions.

```javascript
// A HOC that adds loading state
function withLoading(WrappedComponent) {
  return function WithLoadingComponent({ isLoading, ...props }) {
    if (isLoading) {
      return <div className="spinner">Loading...</div>;
    }
    return <WrappedComponent {...props} />;
  };
}

// Usage
const UserListWithLoading = withLoading(UserList);

// In parent:
// <UserListWithLoading isLoading={loading} users={users} />
```

### HOCs vs Custom Hooks

HOCs were the dominant code-reuse pattern before React 16.8. Custom hooks have largely replaced them because they avoid the "wrapper hell" problem and provide more transparent data flow.

```javascript
// HOC approach: adds a wrapper component to the tree
const EnhancedComponent = withAuth(withTheme(withLogging(MyComponent)));
// Result: <WithAuth><WithTheme><WithLogging><MyComponent /></WithLogging></WithTheme></WithAuth>

// Custom hook approach: no wrappers, flat composition
function MyComponent() {
  const auth = useAuth();
  const theme = useTheme();
  useLogging("MyComponent");

  // All data is explicitly visible; no hidden prop injection
  return <div style={{ color: theme.primary }}>{auth.user.name}</div>;
}
```

HOCs remain useful for cross-cutting wrappers that need to surround the entire component (error boundaries, layout wrappers, third-party library integrations), but custom hooks are the default choice for sharing stateful logic.

### Custom Hooks as Function Composition

Custom hooks compose built-in hooks into reusable behavior, following the same composition principle as `pipe`:

```javascript
// Small, composable hooks
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored !== null ? JSON.parse(stored) : initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Compose them into a feature-specific hook
function useDebouncedSearch(key, delay = 300) {
  const [query, setQuery] = useLocalStorage(key, "");
  const debouncedQuery = useDebounce(query, delay);

  return { query, setQuery, debouncedQuery };
}
```

> **See Also:** Part 4, Chapter 2 for a comprehensive treatment of custom hook architecture and design principles.

---

## 8.8 Exercise: Build `pipe`, `compose`, `curry`, and `memoize` from Scratch

### Problem Statement

Implement these four fundamental functional programming utilities from scratch. Each must:

1. Work correctly with the provided test cases
2. Handle edge cases (no arguments, single argument, multiple argument types)
3. Include comments explaining the implementation strategy

### Starter Code

```javascript
// Implement these four functions:
function pipe(...fns) { /* your code */ }
function compose(...fns) { /* your code */ }
function curry(fn) { /* your code */ }
function memoize(fn) { /* your code */ }
```

---

### Solution

```javascript
// ============================================
// pipe: left-to-right function composition
// ============================================
function pipe(...fns) {
  // Return a function that takes an initial value
  // and passes it through each function in order
  return function(initialValue) {
    return fns.reduce(
      (accumulator, currentFn) => currentFn(accumulator),
      initialValue
    );
  };
}

// Test
const addOne = (x) => x + 1;
const double = (x) => x * 2;
const square = (x) => x * x;

const transform = pipe(addOne, double, square);
console.log(transform(3)); // pipe: 3 -> 4 -> 8 -> 64
console.log(transform(0)); // pipe: 0 -> 1 -> 2 -> 4

// ============================================
// compose: right-to-left function composition
// ============================================
function compose(...fns) {
  // Same as pipe but processes functions in reverse order.
  // reduceRight iterates from the last function to the first.
  return function(initialValue) {
    return fns.reduceRight(
      (accumulator, currentFn) => currentFn(accumulator),
      initialValue
    );
  };
}

// Test: compose(f, g, h)(x) = f(g(h(x)))
const transformComposed = compose(square, double, addOne);
console.log(transformComposed(3)); // compose: addOne(3)=4, double(4)=8, square(8)=64
// Same result as pipe(addOne, double, square)(3)

// ============================================
// curry: transform a multi-argument function into
// a chain of single-argument functions
// ============================================
function curry(fn) {
  // `curried` collects arguments across calls.
  // When enough arguments have been collected (>= fn.length),
  // call the original function. Otherwise, return a new
  // function that collects more arguments.
  return function curried(...args) {
    if (args.length >= fn.length) {
      // All arguments collected; call the original function
      return fn.apply(this, args);
    }

    // Not enough arguments yet; return a function that
    // collects more and merges them with existing args
    return function(...moreArgs) {
      return curried.apply(this, [...args, ...moreArgs]);
    };
  };
}

// Test
function calculateShipping(weight, distance, rate) {
  return weight * distance * rate;
}

const curriedShipping = curry(calculateShipping);

// All these produce the same result:
console.log(curriedShipping(10, 100, 0.05));   // 50
console.log(curriedShipping(10)(100)(0.05));    // 50
console.log(curriedShipping(10, 100)(0.05));    // 50
console.log(curriedShipping(10)(100, 0.05));    // 50

// Partial application via currying
const heavyPackage = curriedShipping(50);        // Fix weight = 50
const heavyLocal = heavyPackage(10);             // Fix distance = 10
console.log(heavyLocal(0.05));                   // 25

// ============================================
// memoize: cache results of a pure function
// ============================================
function memoize(fn) {
  // Use a Map for the cache. The key is a serialized
  // version of the arguments. This works correctly for
  // primitive arguments but has limitations for object
  // arguments (two different objects with the same contents
  // would produce the same cache key).
  const cache = new Map();

  return function(...args) {
    const key = JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

// Test: expensive computation
let callCount = 0;
function expensiveCalculation(n) {
  callCount += 1;
  let result = 0;
  for (let i = 0; i < n; i++) {
    result += Math.sqrt(i);
  }
  return result;
}

const memoizedCalc = memoize(expensiveCalculation);

console.log(memoizedCalc(10000)); // Computes: ~666616.46...
console.log(callCount);           // 1

console.log(memoizedCalc(10000)); // Returns cached result instantly
console.log(callCount);           // Still 1 (function was not called again)

console.log(memoizedCalc(5000));  // Different input: computes
console.log(callCount);           // 2

// Test: memoized recursive Fibonacci
const fib = memoize(function(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
});

console.log(fib(40)); // 102334155 (instant, not 2^40 calls)
```

### Production Considerations

The `memoize` implementation above uses `JSON.stringify` for cache keys. Production implementations should consider:

1. **Unbounded cache growth**: add a maximum size with LRU eviction
2. **Object arguments**: `JSON.stringify({ a: 1 })` equals `JSON.stringify({ a: 1 })`, but this serialization is slow for large objects; consider using a `WeakMap` for single-object-argument functions
3. **Non-serializable arguments**: functions, Symbols, and circular references break `JSON.stringify`

```javascript
// Memoize with a single-argument WeakMap cache (for object arguments)
function memoizeWeak(fn) {
  const cache = new WeakMap();

  return function(arg) {
    if (cache.has(arg)) {
      return cache.get(arg);
    }

    const result = fn(arg);
    cache.set(arg, result);
    return result;
  };
}
```

### Key Takeaway

These four utilities (`pipe`, `compose`, `curry`, `memoize`) are the building blocks of functional programming in JavaScript. `pipe` and `compose` combine functions into pipelines. `curry` enables partial application and specialized function creation. `memoize` caches pure function results for performance. Together, they enable a programming style where small, tested, pure functions are composed into complex behavior, a style that aligns perfectly with React's component and hook architecture.

> **See Also:** Part 1, Chapter 3, Section 3.6 for a more detailed `memoize` implementation with practical debounce and throttle patterns.

---

## Chapter Summary

Higher-order functions, which accept or return other functions, are the backbone of both JavaScript and React programming. The built-in array methods (`map`, `filter`, `reduce`, `every`, `some`) provide declarative data transformation, while custom HOFs enable reusable abstractions like retry logic, permission checking, and timing wrappers. Currying and partial application create specialized functions from general ones, a pattern used directly in React event handlers. Function composition via `pipe` and `compose` builds complex behavior from small, testable units, mirroring how custom hooks compose built-in hooks. Pure functions, which produce no side effects and are deterministic, are not merely a best practice but a contract that React's rendering model, memoization system, and concurrent features depend upon.

---

## Further Reading

- [MDN: Array.prototype.map()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map) — authoritative reference for all array HOFs
- [Eloquent JavaScript, Chapter 5: Higher-Order Functions](https://eloquentjavascript.net/05_higher_order.html) — foundational treatment of HOFs
- [Array Reduce vs Chaining vs For Loop (Kent C. Dodds)](https://kentcdodds.com/blog/array-reduce-vs-chaining-vs-for-loop) — when to use reduce vs chaining
- [Master the JavaScript Interview: What Is a Pure Function? (Eric Elliott)](https://medium.com/javascript-scene/master-the-javascript-interview-what-is-a-pure-function-d1c076bec976) — definitive guide to purity
- [Currying (javascript.info)](https://javascript.info/currying-partials) — interactive tutorial on currying and partial application
- [JavaScript Function Composition: What's the Big Deal? (James Sinclair)](https://jrsinclair.com/articles/2022/javascript-function-composition-whats-the-big-deal/) — practical guide to composition patterns
- [Higher-Order Components (React Legacy Docs)](https://legacy.reactjs.org/docs/higher-order-components.html) — official React HOC documentation
