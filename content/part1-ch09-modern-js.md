# Part 1, Chapter 9: Modern JavaScript Features That Power React

## What You Will Learn

- Apply destructuring patterns for objects, arrays, nested structures, defaults, and renaming in component props and state
- Use rest and spread syntax in every context: objects, arrays, and function parameters
- Explain how optional chaining, nullish coalescing, and short-circuit evaluation power React's conditional rendering
- Describe how React uses Symbols internally (via `$$typeof`) to prevent XSS attacks
- Use Iterators, Generators, WeakMap, WeakSet, Proxy, and Reflect in practical scenarios
- Compare ESM and CommonJS module systems and apply dynamic imports with `React.lazy` for code splitting
- Build a reactive state object using Proxy that automatically tracks and notifies on property changes

---

## 9.1 Destructuring (Objects, Arrays, Nested, Defaults, Renaming)

Destructuring extracts values from objects and arrays into distinct variables. It is ubiquitous in React for props, state, and hook return values.

### Object Destructuring

```javascript
const user = { name: "Alice", role: "admin", email: "alice@example.com" };

// Basic extraction
const { name, role } = user;
console.log(name); // "Alice"
console.log(role); // "admin"

// Renaming (alias)
const { name: userName, email: userEmail } = user;
console.log(userName);  // "Alice"
console.log(userEmail); // "alice@example.com"

// Default values
const { theme = "light", locale = "en" } = {};
console.log(theme);  // "light" (default applied)
console.log(locale); // "en"

// Combined renaming and default
const { role: userRole = "viewer" } = {};
console.log(userRole); // "viewer"
```

### Array Destructuring

```javascript
// Position-based extraction
const coordinates = [40.7128, -74.006];
const [latitude, longitude] = coordinates;

// Skipping elements
const [first, , third] = [10, 20, 30];
console.log(first); // 10
console.log(third); // 30

// Swapping variables
let a = 1;
let b = 2;
[a, b] = [b, a];
console.log(a, b); // 2, 1
```

> **React Connection:** Array destructuring is the syntax behind `useState`: `const [count, setCount] = useState(0)`. The hook returns a two-element array, and destructuring assigns the first element (current value) and the second (setter function) to named variables. This is why you can name the variables anything you want, unlike object destructuring which requires matching property names.

### Nested Destructuring

```javascript
const apiResponse = {
  data: {
    user: { id: 1, profile: { avatar: "photo.jpg", bio: "Developer" } },
  },
  meta: { page: 1, total: 42 },
};

const {
  data: {
    user: {
      id,
      profile: { avatar, bio },
    },
  },
  meta: { total },
} = apiResponse;

console.log(id);     // 1
console.log(avatar); // "photo.jpg"
console.log(total);  // 42
```

### Destructuring in Function Parameters

```javascript
// Destructuring props directly in the parameter list
function ProductCard({ name, price, inStock = true, onAddToCart }) {
  return (
    <div className="product-card">
      <h3>{name}</h3>
      <span>${price.toFixed(2)}</span>
      <button disabled={!inStock} onClick={onAddToCart}>
        {inStock ? "Add to Cart" : "Out of Stock"}
      </button>
    </div>
  );
}
```

> **Common Mistake:** Destructuring a property that may not exist on the object without providing a default value. This silently produces `undefined`, which can cause runtime errors downstream. Always provide defaults for optional props: `function Alert({ message, severity = "info" })`.

---

## 9.2 Rest/Spread in Every Context (Objects, Arrays, Function Params)

Rest (`...`) collects remaining elements; spread (`...`) expands elements. The syntax is identical but the direction differs: rest gathers, spread scatters.

### Object Spread and Rest

```javascript
// Spread: merge objects (creates a new object)
const defaults = { theme: "dark", fontSize: 14, language: "en" };
const overrides = { fontSize: 18, language: "fr" };
const config = { ...defaults, ...overrides };
console.log(config); // { theme: "dark", fontSize: 18, language: "fr" }

// Rest: collect remaining properties
const { theme, ...otherSettings } = config;
console.log(theme);          // "dark"
console.log(otherSettings);  // { fontSize: 18, language: "fr" }
```

### Array Spread and Rest

```javascript
// Spread: combine arrays
const frontend = ["React", "Vue", "Angular"];
const backend = ["Node", "Django", "Rails"];
const fullStack = [...frontend, ...backend];

// Rest: collect remaining elements
const [primary, ...alternatives] = frontend;
console.log(primary);      // "React"
console.log(alternatives); // ["Vue", "Angular"]
```

### Function Parameter Rest

```javascript
// Collect any number of arguments
function mergeConfigs(base, ...overrides) {
  return overrides.reduce((merged, override) => ({ ...merged, ...override }), base);
}

const result = mergeConfigs(
  { a: 1, b: 2 },
  { b: 3, c: 4 },
  { c: 5, d: 6 }
);
console.log(result); // { a: 1, b: 3, c: 5, d: 6 }
```

### Props Forwarding in React

Rest and spread are essential for forwarding unknown props to underlying elements:

```javascript
function Button({ variant, size, children, ...restProps }) {
  const className = `btn btn-${variant} btn-${size}`;
  // Spread remaining props (onClick, disabled, aria-*, data-*, etc.)
  return (
    <button className={className} {...restProps}>
      {children}
    </button>
  );
}

// Usage: all standard button attributes are forwarded
<Button variant="primary" size="large" onClick={handleClick} disabled={isLoading}>
  Submit
</Button>
```

> **See Also:** Part 1, Chapter 7, Section 7.2 for how spread creates shallow copies and its implications for immutable state updates.

---

## 9.3 Template Literals and Tagged Templates

### Template Literals

Template literals (backtick strings) support interpolation and multiline content:

```javascript
const user = { name: "Alice", items: 3 };

const message = `Hello, ${user.name}! You have ${user.items} item${
  user.items === 1 ? "" : "s"
} in your cart.`;

console.log(message);
// "Hello, Alice! You have 3 items in your cart."
```

### Tagged Templates

A tagged template is a function that processes template literal parts. The function receives an array of string segments and the interpolated values separately.

```javascript
function highlight(strings, ...values) {
  return strings.reduce((result, str, i) => {
    const value = i < values.length ? `<mark>${values[i]}</mark>` : "";
    return result + str + value;
  }, "");
}

const term = "React";
const version = 19;
const html = highlight`Learn ${term} version ${version} today`;
console.log(html);
// "Learn <mark>React</mark> version <mark>19</mark> today"
```

### Tagged Templates in CSS-in-JS

Tagged templates power CSS-in-JS libraries like styled-components:

```javascript
// Simplified illustration of how styled-components works
function css(strings, ...values) {
  return strings.reduce((result, str, i) => {
    const value = typeof values[i] === "function" ? values[i] : values[i] || "";
    return result + str + value;
  }, "");
}

const primaryColor = "#3b82f6";
const styles = css`
  background-color: ${primaryColor};
  padding: 12px 24px;
  border-radius: 6px;
`;

console.log(styles);
// "\n  background-color: #3b82f6;\n  padding: 12px 24px;\n  border-radius: 6px;\n"
```

> **React Connection:** Libraries like `styled-components` and `Emotion` use tagged template literals to create React components with scoped CSS. The tag function parses the CSS, generates unique class names, and returns a React component. Understanding tagged templates demystifies how `styled.div\`color: red;\`` produces a component.

---

## 9.4 Optional Chaining and Nullish Coalescing

### Optional Chaining (`?.`)

Safely accesses deeply nested properties without checking each level for `null` or `undefined`. If any link in the chain is nullish, the expression short-circuits and returns `undefined`.

```javascript
const user = {
  profile: {
    address: { city: "Portland" },
  },
};

// Without optional chaining: defensive checks at every level
const city = user && user.profile && user.profile.address && user.profile.address.city;

// With optional chaining: concise and safe
const cityShort = user?.profile?.address?.city;
console.log(cityShort); // "Portland"

// When a link is missing
const missingUser = null;
console.log(missingUser?.profile?.address?.city); // undefined (no error)

// Works with methods
const result = user?.profile?.getDisplayName?.();

// Works with bracket notation
const key = "city";
const dynamicCity = user?.profile?.address?.[key];
```

### Nullish Coalescing (`??`)

Returns the right operand when the left is `null` or `undefined`. Unlike `||`, it does not treat `0`, `""`, or `false` as falsy.

```javascript
const config = {
  timeout: 0,         // Intentionally zero
  retries: null,      // Not configured
  verbose: false,     // Intentionally false
  label: "",          // Intentionally empty
};

// || treats 0, "", false as falsy (WRONG for intentional values)
console.log(config.timeout || 5000);  // 5000 (wrong! 0 was intentional)
console.log(config.verbose || true);  // true (wrong! false was intentional)

// ?? only falls back on null/undefined (CORRECT)
console.log(config.timeout ?? 5000);  // 0 (correct)
console.log(config.retries ?? 3);     // 3 (correct: retries was null)
console.log(config.verbose ?? true);  // false (correct)
console.log(config.label ?? "default"); // "" (correct)
```

> **Common Mistake:** Using `||` for default values when `0`, `""`, or `false` are valid values. This is especially common in React props: `const limit = props.pageSize || 20` silently replaces `pageSize={0}` with `20`. Use `??` instead: `const limit = props.pageSize ?? 20`.

---

## 9.5 Short-Circuit Evaluation (&&, ||) and Why React Uses It for Conditional Rendering

### `&&` for Conditional Rendering

The `&&` operator returns the first falsy operand, or the last operand if all are truthy. React leverages this for conditional rendering:

```javascript
function Notifications({ count }) {
  return (
    <div>
      {count > 0 && <Badge count={count} />}
      {/* If count > 0 is true, React renders <Badge />.
          If count > 0 is false, React renders false (which produces nothing). */}
    </div>
  );
}
```

**The `0` pitfall:** `&&` returns the first falsy value, and `0` is falsy. If the left operand evaluates to `0`, React renders the literal `0` on screen:

```javascript
// BUG: when count is 0, this renders "0" on screen
function BrokenNotifications({ count }) {
  return <div>{count && <Badge count={count} />}</div>;
}

// FIX: explicitly compare to produce a boolean
function FixedNotifications({ count }) {
  return <div>{count > 0 && <Badge count={count} />}</div>;
}
```

### `||` for Fallback Values

```javascript
function UserGreeting({ name }) {
  // If name is an empty string, this incorrectly shows "Guest"
  const displayName = name || "Guest";
  return <h1>Welcome, {displayName}</h1>;
}
```

For empty-string-safe fallbacks, use `??` instead of `||`.

### Ternary for Two-Branch Rendering

```javascript
function StatusIndicator({ isOnline }) {
  return (
    <span className={isOnline ? "status-online" : "status-offline"}>
      {isOnline ? "Online" : "Offline"}
    </span>
  );
}
```

---

## 9.6 Symbols (Understanding React's Internal Symbols Like `$$typeof`)

### What Symbols Are

A `Symbol` is a primitive type that produces a unique, immutable identifier. No two calls to `Symbol()` produce the same value.

```javascript
const id1 = Symbol("description");
const id2 = Symbol("description");
console.log(id1 === id2); // false (always unique)

// Symbols as object keys (non-enumerable by default)
const SECRET = Symbol("secret");
const config = {
  visible: "public data",
  [SECRET]: "hidden data",
};

console.log(Object.keys(config));       // ["visible"] (Symbol key not included)
console.log(config[SECRET]);            // "hidden data"
console.log(JSON.stringify(config));    // '{"visible":"public data"}' (Symbol key omitted)
```

### `Symbol.for()`: Global Symbol Registry

`Symbol.for(key)` creates or retrieves a Symbol from a global registry. Two calls with the same key return the same Symbol.

```javascript
const a = Symbol.for("react.element");
const b = Symbol.for("react.element");
console.log(a === b); // true (same entry in the global registry)
```

### How React Uses `$$typeof` for XSS Protection

Every React element includes a `$$typeof` property set to `Symbol.for('react.element')`. React checks this property before rendering and rejects any object that does not have it.

```javascript
// A React element (created by JSX or React.createElement)
const element = <div>Hello</div>;
console.log(element);
// {
//   $$typeof: Symbol(react.element),
//   type: "div",
//   props: { children: "Hello" },
//   ...
// }
```

The security insight: **JSON cannot represent Symbols**. If an attacker injects a JSON payload mimicking a React element (e.g., via a database storing user-controlled JSON), the payload cannot include a valid `$$typeof` Symbol. `JSON.parse()` has no way to produce a Symbol. React sees the missing or string-valued `$$typeof` and refuses to render the object.

```javascript
// Attacker's JSON payload (stored in database)
const malicious = JSON.parse('{"type":"div","props":{"dangerouslySetInnerHTML":{"__html":"<script>alert(1)</script>"}}}');

// This object has no $$typeof (or $$typeof is undefined)
// React will NOT render it as an element
console.log(malicious.$$typeof); // undefined
```

> **React Connection:** `Symbol.for('react.element')` (and related symbols like `Symbol.for('react.fragment')`, `Symbol.for('react.portal')`) are the internal markers that React uses to identify its own element types. This is a practical application of Symbols' two key properties: uniqueness (preventing forgery) and JSON-incompatibility (preventing injection from untrusted data sources).

---

## 9.7 Iterators and Generators

### The Iteration Protocol

An object is **iterable** if it implements a `[Symbol.iterator]()` method that returns an **iterator** (an object with a `next()` method returning `{ value, done }`).

```javascript
const range = {
  from: 1,
  to: 5,

  [Symbol.iterator]() {
    let current = this.from;
    const last = this.to;

    return {
      next() {
        if (current <= last) {
          return { value: current++, done: false };
        }
        return { value: undefined, done: true };
      },
    };
  },
};

for (const num of range) {
  console.log(num); // 1, 2, 3, 4, 5
}

console.log([...range]); // [1, 2, 3, 4, 5]
```

### Generator Functions

Generators simplify iterator creation. A generator function (`function*`) pauses at each `yield` and resumes when `next()` is called.

```javascript
function* fibonacci() {
  let a = 0;
  let b = 1;
  while (true) {
    yield a;
    [a, b] = [b, a + b];
  }
}

const fib = fibonacci();
console.log(fib.next().value); // 0
console.log(fib.next().value); // 1
console.log(fib.next().value); // 1
console.log(fib.next().value); // 2
console.log(fib.next().value); // 3

// Take the first 8 Fibonacci numbers
function* take(n, iterable) {
  let count = 0;
  for (const item of iterable) {
    if (count >= n) return;
    yield item;
    count++;
  }
}

console.log([...take(8, fibonacci())]); // [0, 1, 1, 2, 3, 5, 8, 13]
```

### Iterator Helpers (ES2025)

ES2025 adds chainable methods directly to `Iterator.prototype`, enabling lazy, memory-efficient data processing:

```javascript
// Iterator.from wraps any iterable; helper methods chain lazily
const result = Iterator.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  .filter(n => n % 2 === 0)
  .map(n => n * n)
  .take(3)
  .toArray();

console.log(result); // [4, 16, 36]
// No intermediate arrays created between steps
```

> **See Also:** Part 1, Chapter 6, Section 6.5 for how `async/await` is built on generators under the hood.

---

## 9.8 WeakMap and WeakSet (How Frameworks Track Internal State)

### WeakMap

A `WeakMap` holds key-value pairs where keys must be objects (or non-registered Symbols). When a key object is garbage-collected, the entry is automatically removed.

```javascript
const metadata = new WeakMap();

function processElement(element) {
  // Associate data with an element without preventing its garbage collection
  metadata.set(element, {
    processedAt: Date.now(),
    attempts: 1,
  });
}

function getMetadata(element) {
  return metadata.get(element);
}

let element = { id: "card-1", type: "div" };
processElement(element);
console.log(getMetadata(element)); // { processedAt: ..., attempts: 1 }

element = null; // The element is now eligible for GC
// The WeakMap entry is also removed (eventually), preventing memory leaks
```

### WeakSet

A `WeakSet` stores objects without preventing garbage collection. Useful for tracking membership.

```javascript
const processed = new WeakSet();

function processOnce(item) {
  if (processed.has(item)) {
    console.log("Already processed, skipping");
    return;
  }

  processed.add(item);
  // ... perform processing
  console.log("Processing:", item.name);
}

const task = { name: "Send email" };
processOnce(task); // "Processing: Send email"
processOnce(task); // "Already processed, skipping"
```

### Practical Use Cases

**Private data storage (pre-ES2022 private fields):**

```javascript
const privateState = new WeakMap();

class Timer {
  constructor(duration) {
    privateState.set(this, { duration, elapsed: 0, running: false });
  }

  start() {
    const state = privateState.get(this);
    state.running = true;
  }

  getElapsed() {
    return privateState.get(this).elapsed;
  }
}
// When a Timer instance is GC'd, its private state is automatically freed
```

**Memoization cache without memory leaks:**

```javascript
const cache = new WeakMap();

function computeLayout(element) {
  if (cache.has(element)) return cache.get(element);

  const layout = expensiveLayoutCalculation(element);
  cache.set(element, layout);
  return layout;
}
// Cache entries vanish when elements are garbage-collected
```

> **React Connection:** React's DevTools use WeakMap to associate debug metadata with fiber nodes without preventing fibers from being garbage-collected during reconciliation. WeakMap is the appropriate data structure whenever you need to attach metadata to objects whose lifetime you do not control.

---

## 9.9 Proxy and Reflect (How State Management Libraries Intercept Changes)

### Proxy Fundamentals

A `Proxy` wraps an object and intercepts fundamental operations through **trap** handlers.

```javascript
const handler = {
  get(target, property, receiver) {
    console.log(`Reading property: ${String(property)}`);
    return Reflect.get(target, property, receiver);
  },
  set(target, property, value, receiver) {
    console.log(`Setting ${String(property)} = ${value}`);
    return Reflect.set(target, property, value, receiver);
  },
};

const user = new Proxy({ name: "Alice", age: 30 }, handler);

user.name;       // Logs: "Reading property: name"
user.age = 31;   // Logs: "Setting age = 31"
```

### Reflect: The Default Behavior

`Reflect` provides methods that correspond to each Proxy trap, implementing the default behavior. Using `Reflect` inside traps ensures correct prototype chain handling and `receiver` propagation.

```javascript
// Without Reflect: works for simple cases but breaks for inheritance
const handler = {
  get(target, prop) {
    return target[prop]; // Breaks if target uses getters with `this`
  },
};

// With Reflect: correct for all cases
const handlerCorrect = {
  get(target, prop, receiver) {
    return Reflect.get(target, prop, receiver); // Preserves `this` in getters
  },
};
```

### Validation Proxy

```javascript
function createValidated(target, schema) {
  return new Proxy(target, {
    set(obj, prop, value, receiver) {
      const validator = schema[prop];
      if (validator && !validator(value)) {
        throw new TypeError(
          `Invalid value for ${String(prop)}: ${JSON.stringify(value)}`
        );
      }
      return Reflect.set(obj, prop, value, receiver);
    },
  });
}

const user = createValidated(
  { name: "", age: 0 },
  {
    name: (v) => typeof v === "string" && v.length > 0,
    age: (v) => typeof v === "number" && v >= 0 && v <= 150,
  }
);

user.name = "Alice"; // OK
user.age = 30;       // OK
// user.age = -5;    // TypeError: Invalid value for age: -5
// user.name = "";   // TypeError: Invalid value for name: ""
```

### How Frameworks Use Proxy for Reactivity

Libraries like MobX, Valtio, and Vue 3 build their reactivity systems on Proxy:

- **`get` trap**: tracks which properties a component reads during render (dependency tracking)
- **`set` trap**: notifies subscribers when a tracked property changes (triggering re-renders)

```javascript
// Simplified reactive state (conceptual illustration)
function createReactiveState(initialState, onUpdate) {
  return new Proxy(initialState, {
    get(target, prop, receiver) {
      // In a real framework, this would register the current
      // component/effect as a dependency of this property
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      const oldValue = target[prop];
      const result = Reflect.set(target, prop, value, receiver);
      if (oldValue !== value) {
        onUpdate(prop, value, oldValue);
      }
      return result;
    },
  });
}
```

---

## 9.10 Module Systems: ESM vs CommonJS, Dynamic Imports, Tree-Shaking

### ES Modules (ESM)

The standard module system, supported in browsers and Node.js. Declarations are statically analyzable.

```javascript
// math.js
export function add(a, b) { return a + b; }
export function multiply(a, b) { return a * b; }
export const PI = 3.14159;

// app.js
import { add, PI } from "./math.js";
console.log(add(2, 3)); // 5

// Default export
// logger.js
export default function log(message) {
  console.log(`[LOG] ${message}`);
}

// app.js
import log from "./logger.js";
log("Application started");
```

### CommonJS (CJS)

The legacy module system used in Node.js. Modules are loaded synchronously and evaluated at runtime.

```javascript
// math.js
module.exports.add = function(a, b) { return a + b; };
module.exports.PI = 3.14159;

// app.js
const { add, PI } = require("./math");
```

### Key Differences

| Feature | ESM | CommonJS |
|---|---|---|
| Syntax | `import` / `export` | `require()` / `module.exports` |
| Evaluation | Static (parse-time) | Dynamic (runtime) |
| Loading | Asynchronous | Synchronous |
| Tree-shaking | Supported | Not supported |
| Top-level `this` | `undefined` | `module.exports` |
| Browser support | Native | Requires bundler |

### Dynamic Imports and Code Splitting

`import()` returns a Promise that resolves to the module, enabling code splitting:

```javascript
// Load a module only when needed
async function loadChart() {
  const { BarChart } = await import("./charts.js");
  return BarChart;
}

// React.lazy: code splitting at the component level
const HeavyEditor = React.lazy(() => import("./RichTextEditor"));

function App() {
  return (
    <Suspense fallback={<div>Loading editor...</div>}>
      <HeavyEditor />
    </Suspense>
  );
}
```

### Tree-Shaking

Tree-shaking eliminates unused exports from the final bundle. It depends on ESM's static structure.

```javascript
// utils.js exports 20 functions
export function formatDate(d) { /* ... */ }
export function formatCurrency(n) { /* ... */ }
export function formatPhone(s) { /* ... */ }
// ... 17 more

// app.js imports only one
import { formatDate } from "./utils.js";
// Tree-shaking removes the other 19 from the bundle
```

Best practices for tree-shaking:

1. Use `import`/`export` exclusively (not `require`)
2. Set `"sideEffects": false` in `package.json` for libraries
3. Prefer named exports over default exports (easier for bundlers to analyze)
4. Avoid barrel files (`index.js` re-exporting everything) when they include modules with side effects

> **React Connection:** `React.lazy()` combined with `Suspense` is React's built-in code-splitting mechanism. It uses dynamic `import()` under the hood. Route-based code splitting (one chunk per page) is the highest-impact optimization for initial load time. See Part 4, Chapter 1, Section 1.9 for a comprehensive treatment of code splitting strategies.

---

## 9.11 Exercise: Build a Reactive State Object Using Proxy

### Problem Statement

Build a `createStore` function that:

1. Wraps a state object in a Proxy to intercept reads and writes
2. Allows subscribing to state changes with callback functions
3. Supports nested object reactivity (deep proxy wrapping)
4. Provides a `getState()` method that returns a snapshot of the current state
5. Prevents direct mutation of the state snapshot (returns a frozen copy)

### Starter Code

```javascript
function createStore(initialState) {
  // Implement: proxy-based reactive store with subscribe/getState
}

// Usage should look like:
// const store = createStore({ count: 0, user: { name: "Alice" } });
// store.subscribe((prop, value) => console.log(`${prop} changed to ${value}`));
// store.state.count = 1; // Triggers subscriber
// store.state.user.name = "Bob"; // Triggers subscriber for nested changes
```

### Solution

```javascript
function createStore(initialState) {
  // Subscribers: functions called when state changes
  const subscribers = new Set();

  // Deep clone the initial state so the store owns its data
  const state = structuredClone(initialState);

  // Create a Proxy handler that intercepts get and set
  function createReactiveProxy(target, path = "") {
    return new Proxy(target, {
      get(obj, prop, receiver) {
        const value = Reflect.get(obj, prop, receiver);

        // If the value is a nested object, wrap it in a Proxy too.
        // This enables deep reactivity: store.state.user.name = "Bob"
        // triggers through the nested proxy.
        if (typeof value === "object" && value !== null && typeof prop === "string") {
          return createReactiveProxy(value, path ? `${path}.${prop}` : prop);
        }

        return value;
      },

      set(obj, prop, value, receiver) {
        const oldValue = obj[prop];

        // Only notify if the value actually changed
        if (Object.is(oldValue, value)) {
          return true;
        }

        const result = Reflect.set(obj, prop, value, receiver);

        // Build the full property path for the notification
        const fullPath = path ? `${path}.${String(prop)}` : String(prop);

        // Notify all subscribers
        subscribers.forEach((callback) => {
          callback(fullPath, value, oldValue);
        });

        return result;
      },

      // Prevent property deletion (state should be updated, not removed)
      deleteProperty(obj, prop) {
        throw new Error(`Cannot delete property "${String(prop)}" from store state`);
      },
    });
  }

  // The reactive proxy wrapping the actual state
  const reactiveState = createReactiveProxy(state);

  return {
    // Expose the reactive proxy as `state`
    state: reactiveState,

    // Subscribe to changes; returns an unsubscribe function
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },

    // Return a frozen deep copy (snapshot) of the current state
    getState() {
      return Object.freeze(structuredClone(state));
    },

    // Get the number of active subscribers (useful for debugging)
    get subscriberCount() {
      return subscribers.size;
    },
  };
}

// ============================================
// Test the implementation
// ============================================
const store = createStore({
  count: 0,
  user: { name: "Alice", preferences: { theme: "dark" } },
  items: [],
});

// Subscribe to changes
const unsubscribe = store.subscribe((path, newValue, oldValue) => {
  console.log(`[Store] ${path}: ${JSON.stringify(oldValue)} -> ${JSON.stringify(newValue)}`);
});

// Top-level property change
store.state.count = 1;
// [Store] count: 0 -> 1

store.state.count = 2;
// [Store] count: 1 -> 2

// Nested property change
store.state.user.name = "Bob";
// [Store] user.name: "Alice" -> "Bob"

// Deeply nested change
store.state.user.preferences.theme = "light";
// [Store] user.preferences.theme: "dark" -> "light"

// No notification when value does not change (Object.is check)
store.state.count = 2;
// (no output: value did not change)

// Snapshot is frozen and independent
const snapshot = store.getState();
console.log(snapshot.count);           // 2
console.log(snapshot.user.name);       // "Bob"
// snapshot.count = 99;                // TypeError: Cannot assign to read-only property

// Unsubscribe
unsubscribe();
store.state.count = 3; // No output (subscriber removed)
console.log(store.subscriberCount);    // 0
```

### How This Connects to Real Frameworks

This exercise implements the core of what libraries like Valtio do:

1. **Proxy intercepts writes** (the `set` trap) to detect state changes without requiring explicit `setState` calls
2. **Deep reactivity** is achieved by lazily wrapping nested objects in Proxies on access (the `get` trap)
3. **Subscribers** are notified only when values actually change (the `Object.is` check mirrors React's comparison)
4. **Snapshots** provide a frozen, immutable view of the current state (similar to `useSnapshot()` in Valtio)

The key difference from React's built-in `useState`: React requires explicit setter calls and new object references to detect changes. Proxy-based libraries allow direct mutation syntax (`state.count++`) while still producing the correct notifications and immutable snapshots for React's reconciliation.

### Key Takeaway

Proxy and Reflect provide the foundation for reactive state management systems. The `get` trap enables dependency tracking (knowing which components read which properties), while the `set` trap enables change notification (triggering re-renders only for affected components). Understanding this pattern demystifies how state management libraries achieve their "write mutations, get reactivity" developer experience.

---

## Chapter Summary

Modern JavaScript features form the syntactic and semantic foundation of React development. Destructuring and rest/spread provide the ergonomics for props, state, and immutable updates. Optional chaining and nullish coalescing eliminate defensive checks for nested data. Symbols power React's internal XSS protection mechanism via `$$typeof`. Iterators and generators enable lazy data processing (formalized in ES2025 with Iterator Helpers). WeakMap and WeakSet provide memory-safe metadata storage for framework internals. Proxy and Reflect underpin the reactivity systems of state management libraries. ES modules with dynamic `import()` enable code splitting via `React.lazy`, while their static structure makes tree-shaking possible.

---

## Further Reading

- [MDN: Destructuring Assignment](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring_assignment) — complete reference for all destructuring patterns
- [MDN: Optional Chaining](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining) — specification-level detail on `?.` behavior
- [Why Do React Elements Have a $$typeof Property? (Dan Abramov)](https://overreacted.io/why-do-react-elements-have-typeof-property/) — the definitive explanation of Symbols in React security
- [MDN: Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) — complete reference for all Proxy traps
- [Iterator Helpers: The Most Underrated Feature in ES2025 (LogRocket)](https://blog.logrocket.com/iterator-helpers-es2025/) — comprehensive guide to the new Iterator methods
- [MDN: JavaScript Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) — authoritative guide to ESM
- [React.lazy API Reference](https://react.dev/reference/react/lazy) — official documentation for code-splitting with React
