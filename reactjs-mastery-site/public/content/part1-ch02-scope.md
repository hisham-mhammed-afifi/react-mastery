# Part 1, Chapter 2: Scope, Scope Chain & Lexical Environment

## What You Will Learn

- Distinguish between global scope, function scope, and block scope, and identify which declaration keywords create bindings in each
- Describe how the JavaScript engine constructs a Lexical Environment and uses the outer environment reference to resolve variables
- Trace the scope chain for nested functions and predict which variable a given reference resolves to
- Explain the precise behavioral differences between `var`, `let`, and `const` beyond simple hoisting rules
- Define the Temporal Dead Zone (TDZ), identify its boundaries, and recognize the edge cases where it causes unexpected errors
- Apply scope knowledge to debug common React issues including stale closures and unintended variable sharing

---

## 2.1 Global Scope, Function Scope, Block Scope

JavaScript has three levels of scope, each defining a region of code where a binding (a name-to-value association) is accessible. Understanding which scope a variable belongs to is fundamental to predicting program behavior.

### Global Scope

The global scope is the outermost scope in any JavaScript program. Variables declared in the global scope are accessible from every function and block in the program. As covered in Part 1, Chapter 1, Section 1.2, the Global Environment Record is a composite of an Object Environment Record (for `var` and `function` declarations) and a Declarative Environment Record (for `let`, `const`, and `class` declarations).

```javascript
// Global scope: accessible everywhere
var globalVar = "I am global (var)";
let globalLet = "I am global (let)";
const GLOBAL_CONST = "I am global (const)";

function readGlobals() {
  // All three are accessible inside any function
  console.log(globalVar);    // "I am global (var)"
  console.log(globalLet);    // "I am global (let)"
  console.log(GLOBAL_CONST); // "I am global (const)"
}

readGlobals();

// Critical difference: only var attaches to the global object
console.log(window.globalVar);    // "I am global (var)" (in browsers)
console.log(window.globalLet);    // undefined
console.log(window.GLOBAL_CONST); // undefined
```

In practice, polluting the global scope is a well-known anti-pattern. Every global variable risks naming collisions with third-party libraries, browser APIs, or other scripts on the page. Modern JavaScript development relies on **module scope** to avoid this problem.

### Module Scope

ES modules introduce a scope level between global and function scope. Every variable declared at the top level of a module is scoped to that module, not to the global object. Only explicitly exported bindings are accessible to other modules.

```javascript
// logger.js (module scope)
const LOG_PREFIX = "[App]"; // Private to this module

export function log(message) {
  console.log(`${LOG_PREFIX} ${message}`);
}

// This variable is NOT accessible from any other module
// and does NOT appear on the global object
const internalCounter = 0;
```

```javascript
// app.js
import { log } from "./logger.js";

log("Application started"); // "[App] Application started"
// console.log(LOG_PREFIX);  // ReferenceError: LOG_PREFIX is not defined
// console.log(internalCounter); // ReferenceError
```

> **React Connection:** Every React component file is an ES module. The component function, its hooks, helper utilities, and constants all live in module scope. Variables declared outside the component function (but inside the module) persist across renders and are shared across all instances of the component. This makes module scope the natural location for constants, configuration objects, and singleton caches, but a dangerous place for mutable, instance-specific state.

```javascript
// UserList.jsx (module scope)
const API_BASE = "https://api.example.com"; // Safe: constant, shared across renders
let renderCount = 0; // Dangerous: shared across ALL instances of UserList

export default function UserList({ users }) {
  renderCount += 1; // Every render of ANY UserList instance increments this
  console.log("Total renders across all UserList instances:", renderCount);

  return users.map(user => <li key={user.id}>{user.name}</li>);
}
```

### Function Scope

A function body creates a new scope. Variables declared with `var` inside a function are accessible throughout the entire function body, regardless of block nesting. Variables declared with `let` or `const` obey the narrower block scope rules described below.

```javascript
function processOrder(order) {
  // `var` declarations are scoped to the entire function
  var status = "processing";

  if (order.isPriority) {
    var discount = 0.1; // Still function-scoped, NOT limited to this if-block
    status = "priority processing";
  }

  // `discount` is accessible here, even though it was declared inside the if-block
  // If order.isPriority was false, discount is `undefined` (hoisted but never assigned)
  console.log(status);   // "priority processing" (if isPriority was true)
  console.log(discount); // 0.1 (if isPriority was true), or undefined (if false)
}

processOrder({ isPriority: true });
```

### Block Scope

Introduced in ES2015, block scope confines `let`, `const`, and `class` declarations to the nearest enclosing block (`{}`). A "block" is any code delimited by curly braces: `if` bodies, `for` loops, `while` loops, `switch` cases, `try`/`catch`/`finally` blocks, and even standalone `{}` blocks.

```javascript
function demonstrateBlockScope() {
  let outerLet = "outer";

  if (true) {
    let innerLet = "inner";     // Block-scoped to this if-block
    const innerConst = "inner"; // Block-scoped to this if-block
    var innerVar = "inner";     // Function-scoped, escapes the block

    console.log(outerLet);  // "outer" -- accessible from enclosing scope
    console.log(innerLet);  // "inner"
    console.log(innerConst); // "inner"
  }

  console.log(innerVar);  // "inner" -- var escapes the block
  // console.log(innerLet);  // ReferenceError: innerLet is not defined
  // console.log(innerConst); // ReferenceError: innerConst is not defined
}

demonstrateBlockScope();
```

Block scope is particularly important in loops, where each iteration can have its own scope:

```javascript
// With let: each iteration creates a new block scope
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log("let:", i), 100);
}
// Output: "let: 0", "let: 1", "let: 2"
// Each closure captures a different `i` from its own block scope

// With var: there is only one function-scoped `i`
for (var j = 0; j < 3; j++) {
  setTimeout(() => console.log("var:", j), 100);
}
// Output: "var: 3", "var: 3", "var: 3"
// All three closures share the same `j`, which is 3 after the loop
```

> **Common Mistake:** The `var`-in-a-loop problem is one of the most frequently encountered scope bugs in JavaScript. Before `let` existed, the workaround was an IIFE (Immediately Invoked Function Expression) to create a new scope per iteration: `(function(i) { setTimeout(() => console.log(i), 100); })(j);`. With `let`, the language itself creates a fresh binding per iteration. When encountering legacy code that uses `var` in loops with asynchronous callbacks, this is almost always the source of bugs where "all callbacks see the same value."

### Scope Hierarchy Visualization

```
+-------------------------------------------------------+
| Global Scope                                          |
|  var globalVar, function globalFunc                    |
|                                                       |
|  +---------------------------------------------------+|
|  | Module Scope (each .js file)                      ||
|  |  const API_BASE, function helperFunc               ||
|  |                                                   ||
|  |  +-----------------------------------------------+||
|  |  | Function Scope (function body)                |||
|  |  |  var localVar, parameters                      |||
|  |  |                                               |||
|  |  |  +-------------------------------------------+|||
|  |  |  | Block Scope (if, for, while, {})          ||||
|  |  |  |  let blockLet, const blockConst            ||||
|  |  |  +-------------------------------------------+|||
|  |  +-----------------------------------------------+||
|  +---------------------------------------------------+|
+-------------------------------------------------------+
```

---

## 2.2 Lexical Environment and How JavaScript Resolves Variables

The scope rules described above are implemented through a specification mechanism called the **Lexical Environment**. Understanding this mechanism reveals exactly how the engine resolves variable references.

### What a Lexical Environment Is

A Lexical Environment is a specification type (defined in ECMAScript Section 9.1) that consists of two components:

1. **Environment Record**: an object that stores the actual identifier bindings (variable names mapped to values) for the current scope
2. **Outer Environment Reference**: a pointer to the Lexical Environment of the enclosing scope, or `null` for the global scope

```
Lexical Environment
+----------------------------------+
| Environment Record               |
|  identifier -> value             |
|  identifier -> value             |
+----------------------------------+
| Outer Environment Reference  ----+--> [Parent Lexical Environment]
+----------------------------------+
```

Every time the engine enters a new scope (a function body, a block, or a module), it creates a new Lexical Environment whose outer reference points to the enclosing scope's Lexical Environment. This chain of references is the **scope chain**.

### Types of Environment Records

The ECMAScript specification defines several types of Environment Records, each used in different contexts:

| Type | Used For | Notable Behavior |
|---|---|---|
| **Declarative** | Function bodies, blocks, `catch` clauses | Directly binds identifiers to values; most common type |
| **Object** | `with` statements, global scope (for `var`) | Binds identifiers to properties of a binding object |
| **Function** | Function execution contexts | Extends Declarative; adds `this` binding, `arguments`, `new.target` |
| **Module** | ES module top-level | Extends Declarative; supports immutable `import` bindings |
| **Global** | Global scope | Composite of Object (for `var`/`function`) and Declarative (for `let`/`const`/`class`) |

### How Variable Resolution Works

When the engine encounters a variable reference, it follows a precise algorithm:

1. Look in the current Lexical Environment's Environment Record
2. If not found, follow the outer environment reference to the parent Lexical Environment
3. Repeat step 2, walking up the chain
4. If the global Lexical Environment is reached and the identifier is still not found:
   - In strict mode: throw a `ReferenceError`
   - In non-strict mode: for assignments, create a new property on the global object (an accidental global); for reads, throw a `ReferenceError`

```javascript
var globalColor = "blue";

function outer() {
  var outerSize = "large";

  function middle() {
    var middleShape = "circle";

    function inner() {
      var innerOpacity = 0.5;

      // Resolving `globalColor`:
      // Step 1: Check inner's Environment Record -> not found
      // Step 2: Check middle's Environment Record -> not found
      // Step 3: Check outer's Environment Record -> not found
      // Step 4: Check Global Environment Record -> found: "blue"
      console.log(globalColor); // "blue"

      // Resolving `outerSize`:
      // Step 1: Check inner's -> not found
      // Step 2: Check middle's -> not found
      // Step 3: Check outer's -> found: "large"
      console.log(outerSize); // "large"
    }

    inner();
  }

  middle();
}

outer();
```

### V8's Optimization: Compile-Time Resolution

In theory, the scope chain walk could be expensive for deeply nested functions. In practice, modern engines like V8 eliminate this overhead through **compile-time resolution**. During compilation, V8 resolves each variable reference into a coordinate pair: `{hops, index}`, where `hops` is the number of outer references to follow and `index` is the position within that scope's storage array. This means variable access is an O(1) array lookup preceded by a fixed number of pointer dereferences, not a dynamic name-based search.

```javascript
// Conceptually, V8 resolves `middleShape` inside `inner` as:
// { hops: 1, index: 0 }
// Meaning: follow the outer reference once (from inner to middle),
// then read index 0 of middle's scope array.

// `globalColor` inside `inner` would be:
// { hops: 3, index: <position in global record> }
```

This optimization means that the performance difference between accessing a local variable and a variable several scopes up is negligible in modern engines. However, caching a frequently accessed outer variable in a local binding remains useful for readability.

> **React Connection:** When React calls a component function, it creates a new Lexical Environment for that call. Every hook callback, event handler, and helper function defined inside the component closes over this environment. The variables they "see" are determined by the scope chain established at the time the component function executes, not at the time the callback fires. This is why a `useEffect` callback captures the state value from the render in which it was created, a concept known as the "render snapshot."

```javascript
function SearchResults({ query }) {
  const [results, setResults] = useState([]);

  useEffect(() => {
    // This closure's scope chain:
    // 1. useEffect callback's own Environment Record (empty)
    // 2. SearchResults's Environment Record: { query: "react", results: [], setResults: fn }
    // 3. Module scope
    // 4. Global scope

    // `query` is resolved from SearchResults's environment (step 2)
    fetchResults(query).then(data => setResults(data));
  }, [query]);

  return results.map(r => <div key={r.id}>{r.title}</div>);
}
```

---

## 2.3 The Scope Chain in Action

The scope chain is the linked list of Lexical Environments that the engine traverses during variable resolution. It is established **lexically** (based on where functions are written in the source code), not dynamically (based on where functions are called).

### Lexical Scope vs Dynamic Scope

JavaScript uses **lexical scoping** (also called static scoping). The scope chain of a function is determined by its position in the source code, at author time. This is in contrast to dynamic scoping (used by some languages like Bash and older Lisps), where the scope chain follows the call stack.

```javascript
var greeting = "Hello";

function sayGreeting() {
  // The scope chain for sayGreeting is determined by WHERE it is defined,
  // not WHERE it is called. It was defined in the global scope,
  // so its outer reference points to the Global Environment Record.
  console.log(greeting);
}

function wrapper() {
  var greeting = "Hola"; // This has NO effect on sayGreeting's scope chain
  sayGreeting(); // Still logs "Hello", not "Hola"
}

wrapper(); // "Hello"
```

If JavaScript used dynamic scoping, `sayGreeting()` would resolve `greeting` by looking up the call stack and find `"Hola"` in `wrapper`'s scope. Lexical scoping means it always looks at the scope where `sayGreeting` was written, which is the global scope.

> **See Also:** Part 1, Chapter 1, Section 1.5 for a detailed exercise demonstrating how functions defined at the global level resolve variables from the global scope regardless of where they are called.

### Nested Scope Chains

When functions are nested inside other functions, the scope chain grows longer. Each nested function's Lexical Environment points to its enclosing function's Lexical Environment.

```javascript
function createUserGreeting(greeting) {
  // Scope chain: createUserGreeting -> Global

  function formatName(firstName, lastName) {
    // Scope chain: formatName -> createUserGreeting -> Global

    function addTitle(title) {
      // Scope chain: addTitle -> formatName -> createUserGreeting -> Global

      // `title` resolved from own scope
      // `firstName`, `lastName` resolved from formatName's scope (1 hop)
      // `greeting` resolved from createUserGreeting's scope (2 hops)
      return `${greeting}, ${title} ${firstName} ${lastName}`;
    }

    return addTitle("Dr.");
  }

  return formatName("Jane", "Smith");
}

console.log(createUserGreeting("Welcome")); // "Welcome, Dr. Jane Smith"
```

### Scope Chain with Blocks

Block scopes (`if`, `for`, `while`, standalone `{}`) also create Lexical Environments that participate in the chain. However, only `let`, `const`, and `class` declarations create bindings in block-level environments.

```javascript
function processItems(items) {
  const results = []; // Function scope

  for (let i = 0; i < items.length; i++) {
    // Block scope for the loop: { i: <current value> }

    const item = items[i]; // Block scope for this iteration

    if (item.isActive) {
      // Another nested block scope
      const label = `Active: ${item.name}`;
      results.push(label);
      // `label` resolved from this if-block's scope
      // `item` resolved from the for-loop iteration's scope (1 hop)
      // `results` resolved from the function scope (2 hops)
      // `items` resolved from the function scope (2 hops, via parameter)
    }
  }

  // `i`, `item`, and `label` are all inaccessible here
  return results;
}

console.log(processItems([
  { name: "Widget", isActive: true },
  { name: "Gadget", isActive: false },
  { name: "Doohickey", isActive: true },
]));
// ["Active: Widget", "Active: Doohickey"]
```

### Shadowing

When a variable in an inner scope has the same name as a variable in an outer scope, the inner variable **shadows** the outer one. The scope chain resolution stops at the first match.

```javascript
const theme = "light";

function applyTheme() {
  const theme = "dark"; // Shadows the outer `theme`

  function renderHeader() {
    // Resolves `theme` from applyTheme's scope: "dark"
    console.log("Header theme:", theme);
  }

  function renderFooter() {
    const theme = "contrast"; // Shadows both outer `theme` variables
    // Resolves `theme` from own scope: "contrast"
    console.log("Footer theme:", theme);
  }

  renderHeader(); // "Header theme: dark"
  renderFooter(); // "Footer theme: contrast"
}

applyTheme();
console.log("Global theme:", theme); // "Global theme: light" (unchanged)
```

> **Common Mistake:** Accidentally shadowing a variable is a frequent source of confusion. A particularly insidious case occurs when a parameter name matches an outer variable. The developer intends to reference the outer variable but unknowingly references the parameter instead (or vice versa). ESLint's `no-shadow` rule can detect these situations.

```javascript
const user = { name: "Admin", role: "superadmin" };

function updateUser(user) {
  // The parameter `user` shadows the outer `user`.
  // Any reference to `user` inside this function resolves to the parameter.
  // The outer `user` is completely inaccessible from this scope.
  console.log(user); // Logs the parameter, not { name: "Admin", role: "superadmin" }
}

updateUser({ name: "Guest", role: "viewer" });
// Logs: { name: "Guest", role: "viewer" }
```

---

## 2.4 `var` vs `let` vs `const`: More Than Just Hoisting

The three variable declaration keywords differ in scope, hoisting behavior, reassignment rules, and initialization. These differences have practical consequences that extend well beyond the textbook descriptions.

### Behavioral Comparison

| Behavior | `var` | `let` | `const` |
|---|---|---|---|
| Scope | Function (or global) | Block | Block |
| Hoisted? | Yes, initialized to `undefined` | Yes, but uninitialized (TDZ) | Yes, but uninitialized (TDZ) |
| Re-declarable in same scope? | Yes | No (SyntaxError) | No (SyntaxError) |
| Reassignable? | Yes | Yes | No (TypeError) |
| Creates global object property? | Yes (in global scope) | No | No |
| Per-iteration binding in `for`? | No (one shared binding) | Yes (fresh binding each iteration) | Yes (but cannot reassign; use with `for...of`/`for...in`) |

### `var`: Function Scope and Its Consequences

`var` declarations are scoped to the nearest enclosing function (or global scope if there is no function). They ignore block boundaries entirely.

```javascript
function varQuirks() {
  console.log(x); // undefined (hoisted, initialized to undefined)

  if (false) {
    // This block NEVER executes, yet `var x` is still hoisted
    var x = "surprise";
  }

  console.log(x); // undefined (hoisted but never assigned, since if-block didn't run)

  for (var i = 0; i < 3; i++) {
    // `i` is function-scoped
  }
  console.log(i); // 3 (leaked out of the for-loop)
}

varQuirks();
```

Another `var` quirk: redeclaring a `var` in the same scope is silently allowed, which can mask bugs.

```javascript
function processData(data) {
  var result = [];

  // ... 50 lines of code ...

  var result = data.map(item => item.value); // Silently redeclares `result`
  // The original `result = []` is overwritten. No error, no warning.

  return result;
}
```

### `let`: Block Scope with Reassignment

`let` confines the variable to the nearest block and forbids redeclaration within the same scope. It can be reassigned.

```javascript
function processQueue(queue) {
  let current = null;

  while (queue.length > 0) {
    current = queue.shift(); // Reassignment is allowed

    let attempts = 0; // Fresh `attempts` for each iteration

    while (attempts < 3) {
      const success = tryProcess(current);
      if (success) break;
      attempts += 1; // Reassignment within the same block scope
    }
  }

  // `attempts` is not accessible here (block-scoped to the while body)
  console.log("Last processed:", current);
}
```

### `const`: Block Scope Without Reassignment

`const` creates a block-scoped binding that cannot be reassigned. It does **not** make the value immutable; it makes the binding immutable.

```javascript
const config = {
  apiUrl: "https://api.example.com",
  timeout: 5000,
};

// This is ALLOWED: mutating the object's properties
config.timeout = 10000;
config.retries = 3;
console.log(config); // { apiUrl: "...", timeout: 10000, retries: 3 }

// This is NOT ALLOWED: reassigning the binding
// config = { apiUrl: "https://other.com" }; // TypeError: Assignment to constant variable

const numbers = [1, 2, 3];
numbers.push(4);     // ALLOWED: mutating the array
// numbers = [5, 6]; // NOT ALLOWED: reassigning the binding
console.log(numbers); // [1, 2, 3, 4]
```

> **Common Mistake:** Developers often believe `const` creates immutable values. It creates immutable **bindings**. The object or array assigned to a `const` variable can still be modified (properties added, removed, or changed; elements pushed or spliced). To achieve true immutability, use `Object.freeze()` (shallow) or a deep-freeze utility. In React, this distinction matters because state objects declared with `const` in a component body are still mutable; React's immutability requirement is enforced by convention and the `useState`/`useReducer` API, not by `const`.

### The Modern Consensus on `var` vs `let` vs `const`

The prevailing best practice as of 2025:

1. **Use `const` by default** for every binding that does not need reassignment
2. **Use `let`** when reassignment is necessary (loop counters, accumulators, values that change)
3. **Avoid `var` entirely** in new code; it provides no benefit that `let` does not, and its function-scoping and redeclaration behavior introduce risk

This consensus is reflected in ESLint configurations (`no-var` rule), style guides from Airbnb and Google, and official documentation from MDN.

> **React Connection:** In React components, most values are `const`: the destructured props, state values from `useState`, refs from `useRef`, memoized values from `useMemo`, and callback functions from `useCallback`. The `let` keyword appears primarily in event handlers or effects that accumulate values in a local loop. The `var` keyword has no legitimate use case in modern React code.

```javascript
function ProductList({ products, onSelect }) {
  // All const: none of these bindings are reassigned
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const listRef = useRef(null);

  const filteredProducts = useMemo(
    () => products.filter(p => p.name.includes(filter)),
    [products, filter]
  );

  const handleSelect = useCallback((product) => {
    onSelect(product);
  }, [onSelect]);

  // `let` only when reassignment is truly needed
  const handleBulkSelect = () => {
    let count = 0; // Will be reassigned in the loop
    for (const product of filteredProducts) {
      if (product.inStock) {
        onSelect(product);
        count += 1;
      }
    }
    console.log(`Selected ${count} products`);
  };

  return /* JSX */;
}
```

---

## 2.5 Temporal Dead Zone (TDZ) Deep Dive

The Temporal Dead Zone is the period between entering a scope and reaching the declaration of a `let`, `const`, or `class` binding. During the TDZ, the binding exists in the Environment Record (it has been hoisted) but is marked as uninitialized. Any attempt to read or write the binding throws a `ReferenceError`.

### TDZ Boundaries

The TDZ begins when the scope is entered (the block or function is started) and ends when the declaration is evaluated during execution.

```javascript
{
  // TDZ for `message` starts here (beginning of the block)

  // All of these throw ReferenceError:
  // console.log(message);         // Read access
  // message = "early";            // Write access
  // console.log(typeof message);  // Even typeof throws in the TDZ!

  let message = "initialized"; // TDZ for `message` ends here

  console.log(message); // "initialized" -- safe to access
}
```

### TDZ Is Temporal, Not Spatial

The TDZ is based on **execution time**, not position in the source code. A function defined above a `let` declaration can safely reference the variable, as long as the function is called after the declaration executes.

```javascript
{
  // This function is defined above the `let` declaration.
  // But it does NOT throw, because it is called AFTER `value` is initialized.
  function readValue() {
    return value; // Resolves from the enclosing block's scope
  }

  let value = 42; // TDZ ends here

  console.log(readValue()); // 42 -- called after initialization, so it works
}
```

```javascript
{
  // This WILL throw, because the function is called BEFORE `value` is initialized.
  function readValueEarly() {
    return value;
  }

  // readValueEarly(); // ReferenceError: Cannot access 'value' before initialization

  let value = 42;

  console.log(readValueEarly()); // 42 -- only safe if called after this point
}
```

### TDZ Edge Cases

#### Edge Case 1: `typeof` in the TDZ

The `typeof` operator normally returns `"undefined"` for undeclared variables (a safe way to check if a global exists). However, `typeof` on a TDZ variable throws a `ReferenceError`, because the variable is declared but not initialized.

```javascript
console.log(typeof undeclaredVariable); // "undefined" -- safe, no error

{
  // console.log(typeof blockScoped); // ReferenceError! Not safe in the TDZ.
  let blockScoped = "hello";
  console.log(typeof blockScoped);     // "string"
}
```

#### Edge Case 2: TDZ in Default Parameters

Function default parameters are evaluated left to right, and each parameter can reference previously declared parameters. But referencing a parameter that has not yet been evaluated triggers a TDZ error.

```javascript
// This works: `b` defaults to `a`, which has already been evaluated
function validDefaults(a = 1, b = a) {
  console.log(a, b); // 1, 1
}
validDefaults();

// This throws: `a` defaults to `b`, but `b` has not been evaluated yet
function invalidDefaults(a = b, b = 1) {
  console.log(a, b);
}
// invalidDefaults(); // ReferenceError: Cannot access 'b' before initialization
```

#### Edge Case 3: TDZ in `class` Declarations

`class` declarations are hoisted like `let` and `const`, meaning they are subject to the TDZ.

```javascript
// const instance = new MyClass(); // ReferenceError: Cannot access 'MyClass' before initialization

class MyClass {
  constructor() {
    this.value = 42;
  }
}

const instance = new MyClass(); // Works after the declaration
console.log(instance.value); // 42
```

#### Edge Case 4: TDZ with Destructuring

If a destructuring pattern references a variable that is being declared in the same statement, a TDZ error occurs.

```javascript
// This throws because `a` is in the TDZ when the right side is evaluated
// let { a = a } = {}; // ReferenceError: Cannot access 'a' before initialization

// This works because `a` is fully initialized before `b`'s default is evaluated
let { a = 1, b = a } = {};
console.log(a, b); // 1, 1
```

#### Edge Case 5: TDZ in `for` Loop Headers

In a `for` loop with `let`, the loop variable is in the TDZ for the initializer expression on the right side of the same declaration.

```javascript
// This throws because `i` references itself during its own initialization
// for (let i = (console.log(i), 0); i < 3; i++) {} // ReferenceError

// This works because `i` is only read after initialization
for (let i = 0; i < 3; i++) {
  console.log(i); // 0, 1, 2
}
```

### Why the TDZ Exists

The TDZ serves as a **safety mechanism**. Before `let` and `const`, `var`'s initialization to `undefined` during hoisting was a common source of silent bugs: accessing a variable before its assignment silently returned `undefined` instead of signaling an error. The TDZ forces developers to declare variables before using them, catching mistakes that `var` would hide.

```javascript
// With var: silent bug
function riskyVar() {
  console.log(count); // undefined -- no error, but probably not intentional
  // ... potentially hundreds of lines of code ...
  var count = 10;
}

// With let: explicit error
function safeLet() {
  // console.log(count); // ReferenceError -- bug is caught immediately
  // ... code ...
  let count = 10;
}
```

> **React Connection:** TDZ errors can surface in React components when helper functions or variables are organized in an unexpected order. Consider a component where a helper is defined after a hook that references it. Because the component body executes top-to-bottom, and `const`/`let` bindings are in the TDZ until their declaration, referencing a `const` function before its declaration line within the same component body will throw.

```javascript
function Dashboard() {
  // This throws because `formatData` is a const in the TDZ
  // const processed = formatData(rawData); // ReferenceError

  const [rawData] = useState([1, 2, 3]);

  // `formatData` declared here; TDZ ends
  const formatData = (data) => data.map(d => d * 2);

  // Safe to use after declaration
  const processed = formatData(rawData);

  return <div>{processed.join(", ")}</div>;
}
```

The solution is to either declare the helper before its first use, or use a regular function declaration (which is fully hoisted and not subject to the TDZ):

```javascript
function Dashboard() {
  const [rawData] = useState([1, 2, 3]);

  // Function declaration: fully hoisted, accessible anywhere in the function
  function formatData(data) {
    return data.map(d => d * 2);
  }

  // Or simply declare const helpers before first use
  const processed = formatData(rawData);
  return <div>{processed.join(", ")}</div>;
}
```

---

## 2.6 Exercise: Predict Output of Tricky Scope Scenarios

### Problem Statement

For each of the following code snippets, predict the exact console output. After writing your predictions, run the code to verify. For each snippet, explain **why** the output is what it is, referencing the specific scope rules at play.

---

### Scenario 1: Shadowing Across Scopes

```javascript
let x = 1;

function alpha() {
  let x = 2;

  function beta() {
    let x = 3;
    console.log("A:", x);
  }

  beta();
  console.log("B:", x);
}

alpha();
console.log("C:", x);
```

**Predict the output before reading the solution.**

---

#### Solution: Scenario 1

```
A: 3
B: 2
C: 1
```

**Explanation:** Each function creates its own scope with a local `x` that shadows the outer `x`. `beta` resolves `x` from its own scope (3). After `beta` returns, `alpha` resolves `x` from its own scope (2). After `alpha` returns, the global scope resolves `x` from the global scope (1). None of the inner assignments affect the outer variables because `let` creates a new binding in each scope.

---

### Scenario 2: `var` Hoisting in Blocks

```javascript
function mystery() {
  console.log("A:", a);

  if (true) {
    var a = 10;
    console.log("B:", a);
  }

  console.log("C:", a);

  if (false) {
    var b = 20;
  }

  console.log("D:", b);
}

mystery();
```

**Predict the output before reading the solution.**

---

#### Solution: Scenario 2

```
A: undefined
B: 10
C: 10
D: undefined
```

**Explanation:** Both `var a` and `var b` are hoisted to the function scope during the creation phase, initialized to `undefined`. The first `console.log` sees `a` as `undefined` (hoisted but not yet assigned). Inside the `if (true)` block, `a` is assigned `10`, which is visible in the function scope. The `if (false)` block never executes, so `b` remains `undefined`. The key insight: `var` declarations in blocks that never execute are still hoisted.

---

### Scenario 3: Closure Over Loop Variables

```javascript
const callbacks = [];

for (var i = 0; i < 5; i++) {
  callbacks.push(function() {
    return i;
  });
}

console.log("A:", callbacks[0]());
console.log("B:", callbacks[2]());
console.log("C:", callbacks[4]());

const callbacks2 = [];

for (let j = 0; j < 5; j++) {
  callbacks2.push(function() {
    return j;
  });
}

console.log("D:", callbacks2[0]());
console.log("E:", callbacks2[2]());
console.log("F:", callbacks2[4]());
```

**Predict the output before reading the solution.**

---

#### Solution: Scenario 3

```
A: 5
B: 5
C: 5
D: 0
E: 2
F: 4
```

**Explanation:** With `var`, there is a single `i` binding in the enclosing function (or global) scope. By the time any callback executes, the loop has completed and `i` is `5`. All callbacks close over the same `i`. With `let`, each iteration creates a fresh `j` binding in a new block scope. Each callback closes over its own `j`, preserving the value at the time the callback was created.

---

### Scenario 4: TDZ Interaction with Scope Chain

```javascript
let value = "global";

function outer() {
  console.log("A:", value);

  function inner() {
    console.log("B:", value);
    let value = "inner";
    console.log("C:", value);
  }

  inner();
}

outer();
```

**Predict the output before reading the solution.**

---

#### Solution: Scenario 4

```
A: global
B: [ReferenceError: Cannot access 'value' before initialization]
```

The code throws at the line logged as "B". Lines "C" and any subsequent code in `inner` never execute.

**Explanation:** Inside `outer`, there is no local `value`, so "A" resolves to the global `"global"`. Inside `inner`, there is a `let value = "inner"` declaration. This `let` is hoisted to `inner`'s scope, shadowing the global `value`. At the point of `console.log("B:", value)`, the `value` binding exists in `inner`'s scope but is in the TDZ (uninitialized). Even though there is a perfectly valid `value` in the outer scope, the inner `let` declaration has already claimed the identifier for this scope, and accessing it before its declaration throws.

This is the TDZ's most counterintuitive behavior: the mere presence of a `let` or `const` declaration in a scope prevents access to identically named variables in outer scopes, even before the declaration line.

---

### Scenario 5: Mixed Declaration Types

```javascript
function config() {
  var mode = "development";
  let port = 3000;
  const host = "localhost";

  {
    var mode = "production";  // Redeclares the function-scoped `mode`
    let port = 8080;          // New block-scoped `port`, shadows the outer `port`
    const host = "0.0.0.0";  // New block-scoped `host`, shadows the outer `host`

    console.log("A:", mode, port, host);
  }

  console.log("B:", mode, port, host);
}

config();
```

**Predict the output before reading the solution.**

---

#### Solution: Scenario 5

```
A: production 8080 0.0.0.0
B: production 3000 localhost
```

**Explanation:** Inside the block, `var mode = "production"` does not create a new variable; it reassigns the existing function-scoped `mode` (because `var` ignores block boundaries and allows redeclaration). The `let port` and `const host` inside the block create new block-scoped bindings that shadow the outer ones. After the block exits, the block-scoped `port` and `host` are gone, so the outer `port` (3000) and `host` ("localhost") are visible again. However, `mode` was genuinely reassigned to `"production"` because both `var` declarations refer to the same function-scoped binding.

### Key Takeaway

These scenarios demonstrate the interplay between scope levels, hoisting, the TDZ, and variable shadowing. The most common sources of bugs are: (1) `var` leaking out of blocks, (2) closures over a single `var` loop variable, and (3) the TDZ preventing access to an outer-scope variable when an inner `let`/`const` of the same name exists. Mastering these patterns eliminates an entire category of JavaScript bugs and builds the foundation for understanding React's closure-based hook system.

> **See Also:** Part 1, Chapter 3, Section 3.5 for a deeper treatment of closures in loops, and Part 1, Chapter 3, Section 3.3 for the stale closure problem in React hooks.

---

## Chapter Summary

Scope determines where variables are accessible in a JavaScript program, operating at four levels: global, module, function, and block. The engine implements scope through Lexical Environments, each containing an Environment Record for bindings and an outer reference forming the scope chain. Variable resolution walks this chain from the innermost scope outward, following lexical (authorship-based) structure rather than call-site structure. The three declaration keywords (`var`, `let`, `const`) differ fundamentally in their scoping rules, hoisting behavior, and the safety guarantees they provide, with the Temporal Dead Zone serving as a critical mechanism that prevents the silent `undefined` bugs that `var` allows.

---

## Further Reading

- [MDN: Closures (includes lexical scoping)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures) — MDN's authoritative guide to closures and lexical scope
- [MDN: `let` statement](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let) — detailed documentation including TDZ behavior
- [ECMAScript 2026 Specification: Lexical Environments](https://tc39.es/ecma262/multipage/executable-code-and-execution-contexts.html) — the specification's formal definition of Environment Records and scope resolution
- [Dmitry Soshnikov: Lexical Environments](https://dmitrysoshnikov.com/ecmascript/es5-chapter-3-2-lexical-environments-ecmascript-implementation/) — detailed walkthrough of the specification's environment model
- [Variable Scope, Closure (javascript.info)](https://javascript.info/closure) — thorough interactive tutorial on closures and the Lexical Environment
- [TkDodo: Hooks, Dependencies and Stale Closures](https://tkdodo.eu/blog/hooks-dependencies-and-stale-closures) — practical guide to scope-related bugs in React hooks
- [Dmitri Pavlutin: Be Aware of Stale Closures when Using React Hooks](https://dmitripavlutin.com/react-hooks-stale-closures/) — real-world examples of stale closure issues
- [Grokking V8 Closures for Fun (and Profit?)](https://mrale.ph/blog/2012/09/23/grokking-v8-closures-for-fun.html) — how V8 implements scope chains at the engine level
