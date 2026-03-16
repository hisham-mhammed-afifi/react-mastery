# Part 1, Chapter 3: Closures - The Foundation of React Hooks

## What You Will Learn

- Define what a closure is in precise terms and explain why "a function that remembers its scope" is an incomplete description
- Identify exactly which variables a closure captures and how V8 optimizes memory allocation for closed-over variables
- Diagnose the stale closure problem in React hooks and apply three distinct strategies to fix it
- Implement the closure-based module pattern and compare it to ES module encapsulation
- Recognize and fix the classic closure-in-loop trap using IIFEs, `let`, and functional patterns
- Build production-quality `memoize`, `debounce`, `throttle`, and `curry` utilities using closures
- Construct a simplified `useState` implementation that demonstrates how React hooks rely on closures

---

## 3.1 What Closures Really Are (Not Just "Function Remembers Its Scope")

The standard definition of a closure, "a function that remembers its outer scope," is correct but incomplete. It obscures the mechanism and leads to imprecise reasoning. A more rigorous definition:

**A closure is the combination of a function and a reference to the Lexical Environment in which that function was created.** When a function is defined inside another function, the inner function retains a reference to the outer function's Environment Record. This reference persists even after the outer function has returned and its execution context has been popped from the call stack.

> **See Also:** Part 1, Chapter 2, Section 2.2 for the full definition of Lexical Environments and Environment Records.

### Closures Are Created at Function Definition, Not at Function Call

Every function in JavaScript creates a closure at the moment it is defined. The closure is not a special construct; it is a fundamental property of how functions work in a language with lexical scoping.

```javascript
function createMultiplier(factor) {
  // When `multiply` is defined here, it forms a closure over
  // createMultiplier's Environment Record: { factor: <value> }
  function multiply(number) {
    return number * factor;
  }

  return multiply;
}

const double = createMultiplier(2);
const triple = createMultiplier(3);

// createMultiplier has returned. Its execution context is gone.
// But the Environment Record { factor: 2 } survives because
// `double` holds a closure that references it.

console.log(double(5));  // 10
console.log(triple(5));  // 15
console.log(double(10)); // 20
```

### Closures Capture Variables by Reference, Not by Value

A closure does not snapshot the values of outer variables at the time it is created. It captures a **reference** to the Environment Record itself. Any changes to the closed-over variable are visible to the closure, and vice versa.

```javascript
function createCounter() {
  let count = 0;

  return {
    increment() {
      count += 1; // Modifies the closed-over variable
    },
    getCount() {
      return count; // Reads the current value, not a snapshot
    },
  };
}

const counter = createCounter();
counter.increment();
counter.increment();
counter.increment();
console.log(counter.getCount()); // 3, not 0

// Both `increment` and `getCount` share the same Environment Record.
// When `increment` modifies `count`, `getCount` sees the updated value.
```

This capture-by-reference behavior is the reason closures can both read and write to outer variables. It is also the root cause of the stale closure problem in React (covered in Section 3.3).

### Every Function Is a Closure (Even If Unused)

Technically, every function in JavaScript is a closure. A function at the global level closes over the Global Environment Record. A method in an object literal closes over whatever scope it was defined in. The term "closure" is most commonly used when the behavior is observable: when an inner function references variables from an outer scope that would otherwise be garbage-collected.

```javascript
// This is technically a closure, but the behavior is uninteresting
// because the global scope is never garbage-collected.
const TAX_RATE = 0.08;
function calculateTax(amount) {
  return amount * TAX_RATE; // Closes over global TAX_RATE
}

// This is where closures become interesting: the outer scope
// would normally be garbage-collected, but the closure keeps it alive.
function createTaxCalculator(rate) {
  return function(amount) {
    return amount * rate; // `rate` survives because of this closure
  };
}

const calcSalesTax = createTaxCalculator(0.08);
const calcLuxuryTax = createTaxCalculator(0.15);
```

---

## 3.2 Closures and Memory: What Gets Captured?

Understanding which variables a closure retains is critical for writing memory-efficient code. The answer involves both specification-level behavior and engine-level optimization.

### Specification Behavior: The Entire Lexical Environment

Per the ECMAScript specification, a function's internal `[[Environment]]` slot references the entire Lexical Environment of the scope in which it was created. In a naive implementation, this would mean every variable in the outer scope is retained.

### V8's Optimization: Only Referenced Variables

In practice, V8 (and other modern engines) perform **scope analysis** during parsing. The parser identifies which variables in an outer scope are actually referenced by inner functions. Only those variables are promoted from the stack to a heap-allocated **Context object**. Variables that no inner function references remain on the stack and are freed when the outer function returns.

```javascript
function processData(data) {
  const hugeTemporary = generateLargeReport(data); // 50 MB object
  const summary = hugeTemporary.summary;            // Small string

  return function getSummary() {
    // Only `summary` is referenced. V8 does NOT capture `hugeTemporary`.
    // The 50 MB object is eligible for garbage collection.
    return summary;
  };
}

const retrieveSummary = processData(rawData);
// At this point, `hugeTemporary` has been garbage-collected.
// Only `summary` (a small string) is retained.
```

### The Shared Context Gotcha

All closures created within the same scope share a single Context object. This has a subtle memory implication: if one sibling closure references a large variable and another references a small one, the large variable cannot be garbage-collected as long as either closure is alive.

```javascript
function createHandlers(data) {
  const largeCache = buildCache(data);  // 100 MB cache
  const config = { timeout: 5000 };     // Tiny object

  // Both closures share the same Context: { largeCache, config }
  return {
    processItem(item) {
      return largeCache.lookup(item); // References largeCache
    },
    getConfig() {
      return config; // Only references config, but largeCache is still retained
    },
  };
}

const handlers = createHandlers(dataset);

// Even if we only use handlers.getConfig() and never call processItem(),
// largeCache stays in memory because both closures share one Context.
```

**Mitigation:** If a closure retains a large object unnecessarily, restructure the code so that the large object is in a different scope from the small one:

```javascript
function createHandlers(data) {
  const config = { timeout: 5000 };

  // Move the large object into its own scope
  const processItem = createProcessor(data);

  return {
    processItem,
    getConfig() {
      return config; // Now largeCache is NOT in this scope
    },
  };
}

function createProcessor(data) {
  const largeCache = buildCache(data);
  return function(item) {
    return largeCache.lookup(item);
  };
}
```

### The `eval` Exception

If a scope contains a call to `eval()`, V8 cannot determine at compile time which variables `eval` might access. It is forced to capture **every** variable in the scope into the Context object, defeating the optimization entirely.

```javascript
function riskyScope() {
  const a = 1;
  const b = 2;
  const hugeObject = { /* ... massive data ... */ };

  // eval forces V8 to capture everything: a, b, hugeObject
  return function() {
    return eval("a + b"); // V8 cannot know what eval will reference
  };
}
```

> **Common Mistake:** Some developers use `eval()` or `new Function()` inside closures for dynamic behavior. Beyond the security risks, this forces the engine to retain the entire outer scope in memory, preventing the garbage collection of variables that would otherwise be freed. Avoid `eval()` in any code where memory efficiency matters.

> **React Connection:** In React components, the closures created by hooks (`useEffect`, `useCallback`, event handlers) share a Context with all other closures in the same component function body. If a component defines a large computed value in the function body and also defines several hook callbacks, all those callbacks keep the large value alive. Memoizing expensive computations with `useMemo` or moving them into separate functions (outside the component body) can reduce unnecessary memory retention.

---

## 3.3 Stale Closure Problem (And Why React Hooks Suffer from It)

The stale closure problem occurs when a closure captures a variable that later changes, but the closure continues to reference the old value. In vanilla JavaScript, this is rarely an issue because closures capture by reference. The problem emerges in React because **each render creates a new set of variables**.

### Why Stale Closures Happen in React

Dan Abramov articulated the definitive mental model: **each render has its own props, state, event handlers, and effects.** When React calls a component function, it creates a new Lexical Environment with that render's specific prop and state values. Any callback defined during that render closes over those specific values.

```javascript
function Timer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const intervalId = setInterval(() => {
      // This closure captured `seconds` from the render
      // where this effect was created. If the dependency array
      // is empty [], this effect runs only on mount, and
      // `seconds` is frozen at 0 forever.
      console.log("Current seconds:", seconds); // Always 0
      setSeconds(seconds + 1);                  // Always sets to 1
    }, 1000);

    return () => clearInterval(intervalId);
  }, []); // Empty dependency array: effect never re-runs

  return <div>{seconds}</div>; // Displays 1 forever after first tick
}
```

The timeline of what happens:

```
Render 1: seconds = 0
  - useEffect creates a closure over { seconds: 0 }
  - setInterval fires every second
  - Each tick: setSeconds(0 + 1) -> sets state to 1

Render 2: seconds = 1
  - useEffect does NOT re-run (empty deps [])
  - The interval callback still has the closure from Render 1
  - Each tick: setSeconds(0 + 1) -> sets state to 1 again (no change)

Result: Timer is stuck at 1
```

### Fix 1: Functional State Updates

The simplest fix. Instead of reading the state value from the closure, use the functional updater form of `setState`. React passes the current state to the updater function, bypassing the stale closure entirely.

```javascript
function Timer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const intervalId = setInterval(() => {
      // The updater function receives the CURRENT state, not the closed-over value.
      setSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(intervalId);
  }, []); // Empty deps is now safe because we never read `seconds` in the callback

  return <div>{seconds}</div>;
}
```

### Fix 2: Correct Dependency Arrays

Include all variables that the effect callback reads in the dependency array. React will re-run the effect (including cleanup) whenever those values change, creating a fresh closure each time.

```javascript
function Timer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const intervalId = setInterval(() => {
      console.log("Current seconds:", seconds); // Fresh value each time
      setSeconds(seconds + 1);
    }, 1000);

    return () => clearInterval(intervalId); // Cleans up the old interval
  }, [seconds]); // Re-runs whenever seconds changes

  return <div>{seconds}</div>;
}
```

This approach works but creates and destroys a new interval on every tick, which is less efficient than Fix 1.

### Fix 3: The Ref Escape Hatch

Use `useRef` to hold a mutable value that persists across renders without triggering re-renders. Store the latest value in the ref and read from `ref.current` in the callback.

```javascript
function Timer() {
  const [seconds, setSeconds] = useState(0);
  const secondsRef = useRef(seconds);

  // Keep the ref in sync with the latest state
  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      // Read from the ref, which always holds the latest value
      console.log("Current seconds:", secondsRef.current);
      setSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(intervalId);
  }, []);

  return <div>{seconds}</div>;
}
```

> **Common Mistake:** Developers often see the `react-hooks/exhaustive-deps` ESLint warning and suppress it with `// eslint-disable-next-line` instead of fixing the stale closure. This warning exists precisely to prevent stale closures. Suppressing it without understanding the consequence leads to subtle bugs where the UI appears frozen or shows incorrect data. The correct responses are: use a functional updater, add the missing dependency, or use a ref.

---

## 3.4 Closure-Based Module Pattern

Before ES modules (`import`/`export`), the module pattern was the primary way to achieve encapsulation in JavaScript. It uses closures to create private state that is inaccessible from outside the module.

### The Classic Module Pattern

```javascript
const authModule = (function() {
  // Private state: not accessible from outside
  let currentUser = null;
  let authToken = null;
  const SESSION_DURATION = 3600000; // 1 hour in ms

  // Private functions
  function isTokenExpired(token) {
    return Date.now() - token.issuedAt > SESSION_DURATION;
  }

  // Public API: returned object with methods that close over private state
  return {
    login(username, password) {
      // Simulated authentication
      authToken = { value: generateToken(), issuedAt: Date.now() };
      currentUser = { username, loginTime: Date.now() };
      return true;
    },

    logout() {
      currentUser = null;
      authToken = null;
    },

    getCurrentUser() {
      if (authToken && !isTokenExpired(authToken)) {
        return { ...currentUser }; // Return a copy, not the original
      }
      return null;
    },

    isAuthenticated() {
      return currentUser !== null && authToken !== null && !isTokenExpired(authToken);
    },
  };
})();

// Usage
authModule.login("admin", "secret123");
console.log(authModule.isAuthenticated()); // true
console.log(authModule.getCurrentUser());  // { username: "admin", loginTime: ... }

// Private state is truly private
// console.log(authModule.currentUser);  // undefined (not a property of the returned object)
// console.log(authModule.authToken);    // undefined
// console.log(authModule.isTokenExpired); // undefined
```

### The Revealing Module Pattern

A refinement where all functions are defined as private, and the return object explicitly maps public names to the desired functions. This makes the public API self-documenting.

```javascript
const cartModule = (function() {
  let items = [];

  function addItem(product, quantity) {
    const existing = items.find(item => item.product.id === product.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      items.push({ product, quantity });
    }
  }

  function removeItem(productId) {
    items = items.filter(item => item.product.id !== productId);
  }

  function getTotal() {
    return items.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0
    );
  }

  function getItems() {
    return items.map(item => ({ ...item })); // Return copies
  }

  function clear() {
    items = [];
  }

  // Reveal only the desired public interface
  return {
    addItem,
    removeItem,
    getTotal,
    getItems,
    clear,
  };
})();
```

### Module Pattern vs ES Modules

| Aspect | Closure Module Pattern | ES Modules |
|---|---|---|
| Mechanism | IIFE + closure | File-based scope + `import`/`export` |
| Privacy | Truly private (inaccessible variables) | Private by default; `export` makes things public |
| Singleton | IIFE creates a singleton automatically | Modules are cached; first import creates singleton |
| Static analysis | Not statically analyzable | Statically analyzable (enables tree shaking) |
| Multiple instances | Use a factory function (no IIFE) | Re-execute the module code (not standard) |
| Modern usage | Legacy patterns, specific use cases | Standard for all new code |

> **React Connection:** React's `useState` hook follows the revealing module pattern internally. React's hooks system maintains a private array of state values (the "fiber" linked list) and returns a limited public interface: `[currentValue, setterFunction]`. The internal state storage is inaccessible to the component; only the getter (current value) and setter are exposed. Understanding the module pattern makes hooks demystified rather than magical.

---

## 3.5 Closures in Loops: The Classic Trap

This is one of the most frequently tested JavaScript concepts and a common source of production bugs. The problem was introduced in Part 1, Chapter 2, Section 2.1, but warrants deeper treatment here.

### The Problem

```javascript
function createButtonHandlers(buttonLabels) {
  const handlers = [];

  for (var i = 0; i < buttonLabels.length; i++) {
    handlers.push(function() {
      console.log("Clicked:", buttonLabels[i]);
    });
  }

  return handlers;
}

const handlers = createButtonHandlers(["Save", "Cancel", "Delete"]);
handlers[0](); // "Clicked: undefined" (not "Clicked: Save")
handlers[1](); // "Clicked: undefined"
handlers[2](); // "Clicked: undefined"
```

All three handlers log `undefined` because they all close over the same `var i`. After the loop completes, `i` is `3`, and `buttonLabels[3]` is `undefined`.

### Solution 1: Use `let`

The simplest and most modern solution. `let` creates a fresh binding per iteration.

```javascript
function createButtonHandlers(buttonLabels) {
  const handlers = [];

  for (let i = 0; i < buttonLabels.length; i++) {
    handlers.push(function() {
      console.log("Clicked:", buttonLabels[i]);
    });
  }

  return handlers;
}

const handlers = createButtonHandlers(["Save", "Cancel", "Delete"]);
handlers[0](); // "Clicked: Save"
handlers[1](); // "Clicked: Cancel"
handlers[2](); // "Clicked: Delete"
```

### Solution 2: IIFE (Pre-ES6 Pattern)

Create a new scope per iteration by wrapping the closure creation in an IIFE.

```javascript
function createButtonHandlers(buttonLabels) {
  const handlers = [];

  for (var i = 0; i < buttonLabels.length; i++) {
    (function(capturedIndex) {
      handlers.push(function() {
        console.log("Clicked:", buttonLabels[capturedIndex]);
      });
    })(i); // Pass `i` by value into the IIFE
  }

  return handlers;
}
```

### Solution 3: `forEach` or `map`

Array methods naturally create a new function scope per iteration.

```javascript
function createButtonHandlers(buttonLabels) {
  return buttonLabels.map(function(label) {
    return function() {
      console.log("Clicked:", label);
    };
  });
}
```

### Solution 4: Factory Function

Extract the closure creation into a separate function.

```javascript
function createClickHandler(label) {
  return function() {
    console.log("Clicked:", label);
  };
}

function createButtonHandlers(buttonLabels) {
  const handlers = [];
  for (var i = 0; i < buttonLabels.length; i++) {
    handlers.push(createClickHandler(buttonLabels[i]));
  }
  return handlers;
}
```

> **React Connection:** The loop closure problem surfaces in React when rendering lists. A common scenario is creating event handlers inside a `.map()` call. Because `.map()` creates a new function scope per iteration, the closure correctly captures each item. However, bugs appear when developers attempt to optimize by defining the handler outside the loop, inadvertently creating a single closure instead of one per item.

```javascript
// Correct: each iteration's arrow function closes over its own `product`
function ProductList({ products, onAddToCart }) {
  return (
    <ul>
      {products.map(product => (
        <li key={product.id}>
          {product.name}
          <button onClick={() => onAddToCart(product)}>
            Add to Cart
          </button>
        </li>
      ))}
    </ul>
  );
}
```

---

## 3.6 Practical Closures: Memoization, Debounce, Throttle, Currying

Closures are the foundation of many utility functions used daily in JavaScript development. Each of the following implementations relies on a closure to maintain private state between invocations.

### Memoization

Memoization caches the results of expensive function calls, returning the cached result when the same inputs recur. The cache is stored in a closure.

```javascript
function memoize(fn) {
  const cache = new Map(); // Private cache, accessible only through the closure

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

// Usage
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const memoizedFib = memoize(fibonacci);
// Note: this only memoizes the top-level call.
// For recursive memoization, the recursive calls must also use the memoized version.

// Self-referential memoization:
const fib = memoize(function(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2); // Calls the memoized version
});

console.log(fib(40)); // 102334155 (returns instantly, not 2^40 calls)
```

### Debounce

Debouncing delays a function's execution until a specified period of inactivity has passed. Each new call resets the timer. The timer ID is stored in a closure.

```javascript
function debounce(fn, delay) {
  let timerId = null; // Private state: the pending timer

  return function(...args) {
    // Clear the previous timer (if any)
    clearTimeout(timerId);

    // Set a new timer
    timerId = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

// Usage: search input that waits for the user to stop typing
const searchInput = document.querySelector("#search");
const debouncedSearch = debounce(function(event) {
  console.log("Searching for:", event.target.value);
  // API call would go here
}, 300);

searchInput.addEventListener("input", debouncedSearch);
```

### Debounce with Cancel Support

```javascript
function debounce(fn, delay) {
  let timerId = null;

  function debounced(...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  }

  debounced.cancel = function() {
    clearTimeout(timerId);
    timerId = null;
  };

  debounced.flush = function() {
    // Immediately execute the pending call
    clearTimeout(timerId);
    fn.apply(this);
  };

  return debounced;
}
```

### Throttle

Throttling ensures a function is called at most once per specified time period. Unlike debounce (which delays until inactivity), throttle guarantees regular execution during continuous input.

```javascript
function throttle(fn, interval) {
  let lastCallTime = 0;       // Timestamp of the last execution
  let timerId = null;          // Timer for the trailing call

  return function(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    if (timeSinceLastCall >= interval) {
      // Enough time has passed; execute immediately
      lastCallTime = now;
      fn.apply(this, args);
    } else {
      // Schedule a trailing call for the remaining time
      clearTimeout(timerId);
      timerId = setTimeout(() => {
        lastCallTime = Date.now();
        fn.apply(this, args);
      }, interval - timeSinceLastCall);
    }
  };
}

// Usage: scroll handler that fires at most once per 200ms
const throttledScroll = throttle(function() {
  console.log("Scroll position:", window.scrollY);
}, 200);

window.addEventListener("scroll", throttledScroll);
```

### Currying

Currying transforms a function that takes multiple arguments into a chain of functions, each taking a single argument. The intermediate functions are closures that accumulate arguments.

```javascript
function curry(fn) {
  return function curried(...args) {
    // If enough arguments have been collected, call the original function
    if (args.length >= fn.length) {
      return fn.apply(this, args);
    }

    // Otherwise, return a new function that collects more arguments
    return function(...moreArgs) {
      return curried.apply(this, [...args, ...moreArgs]);
    };
  };
}

// Usage
function calculatePrice(basePrice, taxRate, discount) {
  return basePrice * (1 + taxRate) * (1 - discount);
}

const curriedPrice = curry(calculatePrice);

// All of these produce the same result:
console.log(curriedPrice(100, 0.08, 0.1));    // 97.2
console.log(curriedPrice(100)(0.08)(0.1));    // 97.2
console.log(curriedPrice(100, 0.08)(0.1));    // 97.2

// Partial application via currying
const withTax = curriedPrice(100)(0.08);       // Closes over basePrice and taxRate
console.log(withTax(0));                       // 108 (no discount)
console.log(withTax(0.2));                     // 86.4 (20% discount)
```

> **React Connection:** Debounce and throttle are commonly used in React event handlers (search inputs, scroll handlers, resize observers). However, closures interact with React's render cycle: a new debounced function is created on every render if defined inside the component. Use `useMemo` or `useRef` to persist the debounced function across renders.

```javascript
function SearchBar({ onSearch }) {
  // Persist the debounced function across renders with useMemo
  const debouncedSearch = useMemo(
    () => debounce((value) => onSearch(value), 300),
    [onSearch]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => debouncedSearch.cancel();
  }, [debouncedSearch]);

  return (
    <input
      type="text"
      onChange={(e) => debouncedSearch(e.target.value)}
      placeholder="Search..."
    />
  );
}
```

---

## 3.7 Exercise: Build a Mini `useState` Using Closures

### Problem Statement

Build a simplified version of React's `useState` hook that demonstrates how closures enable persistent state across multiple "renders." Your implementation should:

1. Maintain a private array of state values (the "state store")
2. Track which state slot each `useState` call corresponds to (via a cursor/index)
3. Return `[currentValue, setterFunction]` from each `useState` call
4. Provide a `render` function that resets the cursor and re-executes the component

This exercise reveals the closure mechanics behind React's hook system.

### Starter Code

```javascript
// Your task: implement the ReactLite module below
const ReactLite = (function() {
  // Private state goes here

  return {
    useState(initialValue) {
      // Implement me
    },
    render(Component) {
      // Implement me
    },
  };
})();

// Test component
function Counter() {
  const [count, setCount] = ReactLite.useState(0);
  const [name, setName] = ReactLite.useState("React");

  console.log(`Render: count = ${count}, name = ${name}`);

  return { count, setCount, name, setName };
}
```

### Solution

```javascript
const ReactLite = (function() {
  // Private state: the module pattern in action
  let stateStore = [];  // Array of state values, one per useState call
  let cursor = 0;       // Tracks which useState call we are processing
  let component = null; // The currently registered component function

  return {
    useState(initialValue) {
      // Capture the current cursor position in a closure.
      // This is critical: each useState call gets its own `stateIndex`
      // that persists across renders via closure.
      const stateIndex = cursor;

      // On the first render, initialize the state slot
      if (stateStore[stateIndex] === undefined) {
        stateStore[stateIndex] = initialValue;
      }

      // Create a setter function that closes over `stateIndex`.
      // No matter when this setter is called, it always updates
      // the correct slot in the state store.
      const setState = (newValue) => {
        // Support functional updates: setState(prev => prev + 1)
        if (typeof newValue === "function") {
          stateStore[stateIndex] = newValue(stateStore[stateIndex]);
        } else {
          stateStore[stateIndex] = newValue;
        }

        // Trigger a re-render (like React does after setState)
        ReactLite.render(component);
      };

      // Read the current value and advance the cursor
      const currentValue = stateStore[stateIndex];
      cursor += 1;

      return [currentValue, setState];
    },

    render(Component) {
      // Store the component for re-renders triggered by setState
      component = Component;

      // Reset the cursor so useState calls map to the correct slots.
      // This is why hooks must be called in the same order every render:
      // the cursor must align with the state store indices.
      cursor = 0;

      // Call the component function, which will call useState internally
      return Component();
    },
  };
})();

// Test the implementation
function Counter() {
  const [count, setCount] = ReactLite.useState(0);
  const [name, setName] = ReactLite.useState("React");

  console.log(`Render: count = ${count}, name = ${name}`);

  return { count, setCount, name, setName };
}

// First render
let output = ReactLite.render(Counter);
// Logs: "Render: count = 0, name = React"

// Update count
output.setCount(1);
// Logs: "Render: count = 1, name = React"

// Update count using functional updater
output = ReactLite.render(Counter); // Re-render to get fresh output reference
output.setCount(prev => prev + 10);
// Logs: "Render: count = 11, name = React"

// Update name
output = ReactLite.render(Counter);
output.setName("React Mastery");
// Logs: "Render: count = 11, name = React Mastery"
```

### How Closures Power This Implementation

Three distinct closure mechanisms are at work:

1. **The module pattern closure**: `stateStore`, `cursor`, and `component` are private variables in the IIFE's scope. They persist across all calls to `useState` and `render`.

2. **The `stateIndex` closure**: Each `useState` call captures its own `stateIndex` value via closure. Even though `cursor` increments after each call, `stateIndex` is a `const` that was set when the closure was created. This is why the setter for `count` (index 0) always updates slot 0, and the setter for `name` (index 1) always updates slot 1.

3. **The `setState` closure**: Each setter function closes over its specific `stateIndex`, allowing it to target the correct slot in `stateStore` regardless of when or where it is called.

### Key Takeaway

React hooks rely on closures at every level: the internal state store is encapsulated via the module pattern, each hook call captures its position via a cursor closure, and each setter function maintains a stable reference to its state slot. This is why hooks must be called in the same order on every render: the cursor-based indexing depends on consistent call order. Calling a hook conditionally would shift all subsequent cursor positions, causing hooks to read from the wrong state slots.

> **See Also:** Part 2, Chapter 7, Section 7.1 for the full explanation of why hooks must follow strict call-order rules.

---

## 3.8 Exercise: Fix 5 Stale Closure Bugs (React-like Scenarios)

### Problem Statement

Each of the following code snippets contains a stale closure bug. For each one:

1. Identify the bug and explain why it occurs
2. Provide a corrected version
3. Explain which fix strategy you used and why

---

### Bug 1: The Frozen Counter

```javascript
function Counter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setCount(count + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return <span>{count}</span>;
}
```

#### Fix

```javascript
function Counter() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      // Fix: use functional updater to avoid reading stale `count`
      setCount(prev => prev + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []); // Empty deps is now safe

  return <span>{count}</span>;
}
```

**Explanation:** The original callback closes over `count` from the initial render (value `0`). Every tick calls `setCount(0 + 1)`, setting state to `1` repeatedly. The functional updater `prev => prev + 1` receives the current state from React, bypassing the stale closure entirely. **Strategy: functional state update.**

---

### Bug 2: The Stale Logger

```javascript
function ChatRoom({ roomId }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const connection = createConnection(roomId);

    connection.on("message", (newMessage) => {
      setMessages([...messages, newMessage]);
    });

    return () => connection.disconnect();
  }, [roomId]);

  return <MessageList messages={messages} />;
}
```

#### Fix

```javascript
function ChatRoom({ roomId }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const connection = createConnection(roomId);

    connection.on("message", (newMessage) => {
      // Fix: functional updater ensures we always have the latest messages
      setMessages(prev => [...prev, newMessage]);
    });

    return () => connection.disconnect();
  }, [roomId]);

  return <MessageList messages={messages} />;
}
```

**Explanation:** The callback closes over `messages` from the render when the effect ran. Each new message replaces the array with `[...staleMessages, newMessage]`, losing all messages received since the effect was created. The functional updater always receives the current state. **Strategy: functional state update.**

---

### Bug 3: The Lagging Event Handler

```javascript
function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  const handleSearch = useCallback(() => {
    fetchResults(query).then(data => setResults(data));
  }, []); // Missing dependency: query

  return (
    <div>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <button onClick={handleSearch}>Search</button>
      <ResultList results={results} />
    </div>
  );
}
```

#### Fix

```javascript
function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  const handleSearch = useCallback(() => {
    fetchResults(query).then(data => setResults(data));
  }, [query]); // Fix: include query in dependencies

  return (
    <div>
      <input value={query} onChange={e => setQuery(e.target.value)} />
      <button onClick={handleSearch}>Search</button>
      <ResultList results={results} />
    </div>
  );
}
```

**Explanation:** `useCallback` with an empty dependency array creates the function once and never updates it. The `query` inside the callback is frozen at `""`. Adding `query` to the dependency array causes `useCallback` to produce a new function whenever `query` changes, ensuring the closure always has the latest value. **Strategy: correct dependency array.**

---

### Bug 4: The Stale Notification

```javascript
function NotificationBanner({ notifications }) {
  const [dismissed, setDismissed] = useState([]);

  const latestNotification = notifications[notifications.length - 1];

  useEffect(() => {
    if (!latestNotification) return;

    const timer = setTimeout(() => {
      // Show notification count using stale `notifications` and `dismissed`
      const active = notifications.filter(n => !dismissed.includes(n.id));
      console.log(`${active.length} unread notifications`);
    }, 5000);

    return () => clearTimeout(timer);
  }, [latestNotification]);

  // ... dismiss handlers
}
```

#### Fix

```javascript
function NotificationBanner({ notifications }) {
  const [dismissed, setDismissed] = useState([]);

  const latestNotification = notifications[notifications.length - 1];

  // Keep refs to latest values
  const notificationsRef = useRef(notifications);
  const dismissedRef = useRef(dismissed);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    dismissedRef.current = dismissed;
  }, [dismissed]);

  useEffect(() => {
    if (!latestNotification) return;

    const timer = setTimeout(() => {
      // Fix: read from refs to get the latest values
      const active = notificationsRef.current.filter(
        n => !dismissedRef.current.includes(n.id)
      );
      console.log(`${active.length} unread notifications`);
    }, 5000);

    return () => clearTimeout(timer);
  }, [latestNotification]);
}
```

**Explanation:** The original effect depends only on `latestNotification`, so it does not re-run when `notifications` or `dismissed` change. The `setTimeout` callback captures stale values. Using refs allows the timeout callback to read the latest values without adding them to the dependency array (which would cause the timer to reset on every change). **Strategy: ref escape hatch.**

---

### Bug 5: The Double-Counting Toggle

```javascript
function ToggleCounter() {
  const [isOn, setIsOn] = useState(false);
  const [toggleCount, setToggleCount] = useState(0);

  const handleToggle = useCallback(() => {
    setIsOn(!isOn);
    setToggleCount(toggleCount + 1);
  }, []); // Missing both dependencies

  return (
    <div>
      <button onClick={handleToggle}>
        {isOn ? "ON" : "OFF"} (toggled {toggleCount} times)
      </button>
    </div>
  );
}
```

#### Fix

```javascript
function ToggleCounter() {
  const [isOn, setIsOn] = useState(false);
  const [toggleCount, setToggleCount] = useState(0);

  const handleToggle = useCallback(() => {
    // Fix: use functional updaters for both state values
    setIsOn(prev => !prev);
    setToggleCount(prev => prev + 1);
  }, []); // Empty deps is now safe because we never read state directly

  return (
    <div>
      <button onClick={handleToggle}>
        {isOn ? "ON" : "OFF"} (toggled {toggleCount} times)
      </button>
    </div>
  );
}
```

**Explanation:** The original callback closes over `isOn = false` and `toggleCount = 0` from the initial render. Every click calls `setIsOn(!false)` (always `true`) and `setToggleCount(0 + 1)` (always `1`). Using functional updaters for both ensures each click reads the current state. **Strategy: functional state update.**

---

### Key Takeaway

The stale closure problem in React follows a single pattern: a callback captures a render's state or props, and that callback persists beyond the render it was created in (via `setInterval`, `setTimeout`, `useCallback` with missing deps, or event subscriptions). The three fix strategies are:

1. **Functional state updates** (`prev => newValue`): best when the stale value is used only to compute the next state
2. **Correct dependency arrays**: best when the callback should simply be recreated with fresh values
3. **Refs** (`useRef`): best when the callback must persist (e.g., in a subscription) but needs access to changing values

---

## Chapter Summary

Closures are the mechanism by which functions retain access to their enclosing Lexical Environments after those environments would otherwise be garbage-collected. They capture variables by reference (not by value), share Context objects with sibling closures, and form the foundation of patterns ranging from the module pattern to memoization. In React, closures are both the power behind hooks (each `useState` call captures its position via closure) and the source of the stale closure problem (callbacks capture a specific render's values). Mastering closures means understanding that every React render creates a fresh scope, and any callback defined during that render is a photograph of that moment in time.

---

## Further Reading

- [A Complete Guide to useEffect (Dan Abramov)](https://overreacted.io/a-complete-guide-to-useeffect/) — the definitive mental model for closures in React effects
- [Making setInterval Declarative with React Hooks (Dan Abramov)](https://overreacted.io/making-setinterval-declarative-with-react-hooks/) — practical stale closure solutions with intervals
- [Hooks, Dependencies and Stale Closures (TkDodo)](https://tkdodo.eu/blog/hooks-dependencies-and-stale-closures) — practical guide to diagnosing and fixing stale closures
- [MDN: Closures](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures) — authoritative reference on closure mechanics
- [Variable Scope, Closure (javascript.info)](https://javascript.info/closure) — interactive tutorial with exercises
- [Grokking V8 Closures for Fun (and Profit?)](https://mrale.ph/blog/2012/09/23/grokking-v8-closures-for-fun.html) — deep dive into V8's closure memory model
- [Be Aware of Stale Closures when Using React Hooks (Dmitri Pavlutin)](https://dmitripavlutin.com/react-hooks-stale-closures/) — real-world stale closure examples and fixes
