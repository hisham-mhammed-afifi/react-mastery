# Part 1, Chapter 1: Execution Context & the Call Stack

## What You Will Learn

- Explain how the JavaScript engine creates execution contexts during the creation phase and what happens during the execution phase
- Distinguish between the Global Execution Context and Function Execution Contexts, including their internal components
- Trace the call stack for any sequence of nested function calls and predict the order of execution
- Identify the components of an execution context as defined by the ECMAScript specification: LexicalEnvironment, VariableEnvironment, and Realm
- Recognize the conditions that cause a stack overflow and apply recursion patterns that avoid it
- Connect execution context mechanics to how React component rendering works under the hood

---

## 1.1 How JavaScript Executes Code (Creation Phase vs Execution Phase)

JavaScript is often described as an "interpreted" language, but modern engines like V8 (Chrome, Node.js), SpiderMonkey (Firefox), and JavaScriptCore (Safari) employ sophisticated multi-tier compilation pipelines. Regardless of the engine, every piece of JavaScript code runs inside an **execution context**, the fundamental unit of code evaluation.

When the engine encounters a block of executable code (a script, a function body, or a module), it creates an execution context in two distinct phases.

### The Creation Phase

During the creation phase, the engine performs three critical operations before executing a single line of code:

1. **Creates the environment records** for variable and function bindings
2. **Sets up the scope chain** (the outer environment reference)
3. **Determines the value of `this`**

It is during this phase that the engine scans the code for declarations and allocates memory for them. This is the mechanism behind what developers colloquially call "hoisting."

```javascript
// Before any code runs, the creation phase has already:
// 1. Registered `greet` as a function (fully initialized)
// 2. Registered `message` as a var binding (initialized to undefined)
// 3. Registered `name` as a let binding (uninitialized, in the TDZ)

console.log(greet);    // [Function: greet] -- function declaration, fully hoisted
console.log(message);  // undefined -- var declaration, hoisted with default value
// console.log(name);  // ReferenceError -- let declaration, in Temporal Dead Zone

var message = "Hello";
let name = "React Developer";

function greet() {
  return message + ", " + name;
}
```

A crucial distinction exists in how different declaration types are handled during creation:

| Declaration Type | Registered During Creation? | Initial Value | Accessible Before Declaration? |
|---|---|---|---|
| `function` declaration | Yes | Full function body | Yes |
| `var` | Yes | `undefined` | Yes (returns `undefined`) |
| `let` | Yes | Uninitialized (TDZ) | No (ReferenceError) |
| `const` | Yes | Uninitialized (TDZ) | No (ReferenceError) |
| `class` | Yes | Uninitialized (TDZ) | No (ReferenceError) |

> **Common Mistake:** Many developers believe that `let` and `const` are "not hoisted." They are, in fact, hoisted: the engine registers the binding during the creation phase, which is why a `let` variable in a block shadows an outer variable of the same name even before the `let` statement is reached. The difference is that `let` and `const` bindings remain **uninitialized** until the engine reaches the declaration during execution, creating the Temporal Dead Zone (TDZ). MDN acknowledges this as a semantic debate but notes the spec treats them as hoisted.

```javascript
let value = "outer";

function demonstrate() {
  // If `let value` below were truly NOT hoisted,
  // this line would read "outer" from the enclosing scope.
  // Instead, it throws a ReferenceError, proving the inner
  // `let` declaration has already claimed this scope.
  console.log(value); // ReferenceError: Cannot access 'value' before initialization

  let value = "inner";
}

demonstrate();
```

### The Execution Phase

Once the creation phase completes, the engine begins executing the code line by line. During this phase:

- Variables receive their assigned values
- Function calls create new execution contexts (pushed onto the call stack)
- Expressions are evaluated
- Side effects (console.log, DOM manipulation, network requests) occur

```javascript
// Creation phase: `calculate` is registered as a function,
//                 `result` is registered as var (undefined)
// Execution phase begins:

var result = calculate(5, 3); // Line executes: calls calculate, which creates
                               // a new execution context for that function

console.log(result); // 15

function calculate(a, b) {
  // When called, a new execution context is created for `calculate`:
  //   Creation phase: `a` = 5, `b` = 3, `sum` = undefined (var)
  //   Execution phase: `sum` = 5 + 3 + (5 * 3 / (5 + 3)) = ~9.875
  //   Wait, let's trace it properly:

  var sum = a + b;           // sum = 8
  var product = a * b;       // product = 15
  return product;            // returns 15, this context is popped off the stack
}
```

> **React Connection:** Every time React calls your component function during a render, it creates a new execution context for that call. This means each render has its own creation phase where props, state values, and local variables are established. This is why each render "sees" its own props and state, a concept Dan Abramov calls the "render snapshot." Understanding creation vs execution phases explains why values captured in closures (such as inside `useEffect` callbacks) reflect the state at the time of that specific render, not the latest state.

---

## 1.2 Global Execution Context vs Function Execution Context

JavaScript has three types of execution contexts, each created for different kinds of executable code.

### The Global Execution Context (GEC)

The Global Execution Context is created when the JavaScript engine first starts processing a script. There is exactly one GEC per program (or per realm, in environments like iframes). It performs three setup operations during its creation phase:

1. **Creates the global object** (`window` in browsers, `globalThis` universally, `global` in Node.js)
2. **Sets `this` to reference the global object** (in non-strict, non-module code)
3. **Establishes the global Environment Record** for all top-level declarations

```javascript
// In a browser environment, the GEC has already created `window`
// and bound `this` to it.

console.log(this === window); // true (in non-strict, non-module browser code)

// var declarations in the global scope become properties of the global object
var globalVar = "I am on window";
console.log(window.globalVar); // "I am on window"

// let and const do NOT become properties of the global object
let globalLet = "I am NOT on window";
console.log(window.globalLet); // undefined
```

The distinction between `var` and `let`/`const` at the global level stems from the ECMAScript specification's design of the **Global Environment Record**. This record is a composite of two sub-records:

- An **Object Environment Record** backed by the global object (where `var` and `function` declarations live)
- A **Declarative Environment Record** for `let`, `const`, and `class` declarations (not attached to any object)

```
Global Environment Record
+------------------------------------------+
|  Object Environment Record               |
|  (backed by `window` / `globalThis`)     |
|  +--------------------------------------+|
|  |  var myVar = "hello"                 ||
|  |  function myFunc() { ... }           ||
|  +--------------------------------------+|
|                                          |
|  Declarative Environment Record          |
|  +--------------------------------------+|
|  |  let myLet = "world"                 ||
|  |  const myConst = 42                  ||
|  |  class MyClass { ... }              ||
|  +--------------------------------------+|
+------------------------------------------+
```

### Function Execution Context (FEC)

Every time a function is invoked, the engine creates a new Function Execution Context. Unlike the GEC, function contexts are created and destroyed throughout the program's lifetime. Each FEC has:

1. **A Function Environment Record** that stores local bindings and provides `this`
2. **An outer environment reference** pointing to the context where the function was lexically defined (not where it was called)
3. **`arguments` object** (for non-arrow functions)

```javascript
var language = "JavaScript";

function outer() {
  var framework = "React";

  function inner() {
    var library = "Redux";
    // `inner`'s Environment Record: { library: "Redux" }
    // Outer reference -> `outer`'s Environment Record: { framework: "React", inner: [Function] }
    // Outer's outer reference -> Global Environment Record: { language: "JavaScript", outer: [Function] }

    console.log(library);   // "Redux"   -- found in own environment
    console.log(framework); // "React"   -- found in outer's environment
    console.log(language);  // "JavaScript" -- found in global environment
  }

  inner();
}

outer();
```

### Eval Execution Context

The third type is the eval execution context, created when code is passed to `eval()`. In modern development, `eval()` is almost never used due to security risks, performance penalties, and the inability for engines to optimize the surrounding code. The engine cannot determine at compile time what variables `eval` might introduce, forcing it to use slower dynamic lookups.

```javascript
// Do not use eval in production code. This example is for educational purposes only.
function riskyFunction() {
  var localVar = 10;
  eval("var sneakyVar = 20;"); // Creates a binding in the calling context
  console.log(sneakyVar); // 20 -- eval injected a variable into this scope
}
```

> **React Connection:** React components are functions, and every render creates a new Function Execution Context. When React calls `<UserProfile user={currentUser} />`, it is essentially calling `UserProfile({ user: currentUser })`. This creates an FEC where `props.user` (or the destructured `user`) is a local binding in that context's environment record. If the parent re-renders with a new `currentUser`, a brand new FEC is created for `UserProfile` with a fresh binding. The old FEC (and its bindings) may still exist in memory if closures reference it (e.g., inside a `useEffect` callback), which is the root cause of stale closure bugs.

---

## 1.3 The Call Stack Visualized

The **call stack** (also called the execution stack or simply "the stack") is a Last-In, First-Out (LIFO) data structure that the JavaScript engine uses to manage execution contexts. When a function is called, its execution context is pushed onto the stack. When the function returns, its context is popped off.

### Tracing a Simple Call Stack

```javascript
function multiply(a, b) {
  return a * b;
}

function square(n) {
  return multiply(n, n);
}

function printSquare(n) {
  var result = square(n);
  console.log(result);
}

printSquare(4);
```

Here is the call stack at each stage of execution:

```
Step 1: Script starts
+------------------+
| Global Context   |  <-- bottom of stack, always present
+------------------+

Step 2: printSquare(4) is called
+------------------+
| printSquare(4)   |  <-- top of stack
+------------------+
| Global Context   |
+------------------+

Step 3: square(4) is called inside printSquare
+------------------+
| square(4)        |  <-- top of stack
+------------------+
| printSquare(4)   |
+------------------+
| Global Context   |
+------------------+

Step 4: multiply(4, 4) is called inside square
+------------------+
| multiply(4, 4)   |  <-- top of stack
+------------------+
| square(4)        |
+------------------+
| printSquare(4)   |
+------------------+
| Global Context   |
+------------------+

Step 5: multiply returns 16, its context is popped
+------------------+
| square(4)        |  <-- receives return value 16
+------------------+
| printSquare(4)   |
+------------------+
| Global Context   |
+------------------+

Step 6: square returns 16, its context is popped
+------------------+
| printSquare(4)   |  <-- result = 16
+------------------+
| Global Context   |
+------------------+

Step 7: console.log(16) executes, printSquare returns
+------------------+
| Global Context   |  <-- only global context remains
+------------------+
```

### The Call Stack and Single-Threaded Execution

JavaScript is single-threaded: only one execution context sits at the top of the call stack at any time, and only that context is actively running. This has a profound implication: if a function takes a long time to return, it **blocks** the entire thread.

```javascript
function blockForSeconds(seconds) {
  const start = Date.now();
  // This loop monopolizes the call stack.
  // No other code, event handlers, or UI updates can run.
  while (Date.now() - start < seconds * 1000) {
    // Busy waiting -- the call stack is occupied
  }
}

console.log("Before blocking");
blockForSeconds(3); // The browser freezes for 3 seconds
console.log("After blocking"); // Only prints after the 3-second wait
```

> **React Connection:** This is precisely why React introduced **concurrent rendering** in React 18. Before concurrent features, React's reconciliation (diffing the virtual DOM) was a synchronous operation that could block the call stack for long periods on complex component trees. The Fiber architecture breaks rendering work into small units that can yield control back to the browser, preventing the call stack from being monopolized. See Part 2, Chapter 4 for a detailed exploration of Fiber.

### V8's Internal Optimization: The Context Register

Modern engines like V8 optimize call stack management at the hardware level. V8 keeps a dedicated CPU register (e.g., `esi` on x86 architectures) pointing to the current execution context. This avoids the overhead of loading the context from the stack frame on every variable access. When a function call occurs, V8 updates this register to point to the new context, and when the function returns, it restores the previous context pointer. This is an implementation detail that developers never interact with directly, but it explains why function calls in modern JavaScript are remarkably fast.

---

## 1.4 Stack Overflow and Recursion Patterns

### What Causes a Stack Overflow

Every execution context pushed onto the call stack consumes memory. The call stack has a finite size (typically between 10,000 and 25,000 frames, depending on the engine and the size of each frame's local variables). When function calls exceed this limit, the engine throws a **RangeError: Maximum call stack size exceeded**.

```javascript
// The simplest stack overflow: infinite recursion
function forever() {
  forever(); // Each call adds a frame; the stack never shrinks
}

forever(); // RangeError: Maximum call stack size exceeded
```

### Recursion Done Right

Recursion is a legitimate and powerful technique. The key is ensuring every recursive path leads to a **base case** that stops the recursion.

```javascript
// Correctly structured recursion: computing factorial
function factorial(n) {
  // Base case: stop recursion when n reaches 0 or 1
  if (n <= 1) {
    return 1;
  }
  // Recursive case: each call gets closer to the base case
  return n * factorial(n - 1);
}

console.log(factorial(5)); // 120

// Call stack at deepest point:
// factorial(1)  <-- base case, starts returning
// factorial(2)
// factorial(3)
// factorial(4)
// factorial(5)
// Global Context
```

For small inputs, this works perfectly. But `factorial(100000)` will overflow the stack. The issue is that each recursive call must remain on the stack while waiting for the next call to return.

### Tail Call Optimization (TCO): The Spec vs Reality

ECMAScript 2015 introduced **proper tail calls** (PTC): if the last action a function performs is a function call (a "tail position" call), the engine may reuse the current stack frame instead of creating a new one. In theory, this makes certain recursive patterns run in constant stack space.

```javascript
// Tail-recursive factorial: the recursive call is in tail position
function factorialTailRecursive(n, accumulator = 1) {
  if (n <= 1) {
    return accumulator;
  }
  // The recursive call is the LAST operation; nothing happens after it returns.
  // A compliant engine can reuse this stack frame.
  return factorialTailRecursive(n - 1, n * accumulator);
}
```

However, as of 2025, **only Safari's JavaScriptCore implements proper tail calls**. V8 (Chrome, Node.js) and SpiderMonkey (Firefox) have chosen not to implement PTC due to concerns about debugging (stack traces would be incomplete) and performance tradeoffs. This means tail recursion is not a reliable strategy for avoiding stack overflows in most environments.

> **Common Mistake:** Developers sometimes write tail-recursive functions expecting them to be optimized, without realizing that only Safari supports this. In Node.js and Chrome, a tail-recursive function will overflow the stack on sufficiently deep inputs just like a non-tail-recursive one. Always verify the target environment's support before relying on tail call optimization.

### Practical Patterns for Avoiding Stack Overflow

Since TCO is not universally available, developers use alternative patterns:

#### Pattern 1: Convert Recursion to Iteration

The most straightforward approach. Any recursive algorithm can be rewritten with a loop.

```javascript
// Iterative factorial: zero risk of stack overflow
function factorialIterative(n) {
  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

console.log(factorialIterative(100000)); // Infinity (number overflow, but no stack overflow)
```

#### Pattern 2: The Trampoline

A trampoline is a higher-order function that converts recursive calls into a loop. Instead of calling itself directly, the recursive function returns a **thunk** (a zero-argument function wrapping the next call). The trampoline repeatedly invokes these thunks until a non-function value is returned.

```javascript
// The trampoline utility
function trampoline(fn) {
  return function(...args) {
    let result = fn(...args);
    // Keep calling as long as the result is a function (thunk)
    while (typeof result === "function") {
      result = result();
    }
    return result;
  };
}

// Rewrite factorial to return thunks instead of direct recursive calls
function factorialTrampoline(n, accumulator = 1) {
  if (n <= 1) {
    return accumulator; // Base case: return a value, not a function
  }
  // Return a thunk (function) instead of making a direct recursive call
  return () => factorialTrampoline(n - 1, n * accumulator);
}

const safeFact = trampoline(factorialTrampoline);
console.log(safeFact(100000)); // Infinity (number overflow, but no stack overflow)
```

The trampoline keeps the call stack at a constant depth of 2 frames: the trampoline's while loop and the current thunk execution.

#### Pattern 3: Explicit Stack (for tree/graph traversal)

When recursion is used to traverse data structures, an explicit stack (an array) can replace the call stack.

```javascript
// Recursive tree traversal (can overflow on deep trees)
function sumTreeRecursive(node) {
  if (node === null) return 0;
  return node.value + sumTreeRecursive(node.left) + sumTreeRecursive(node.right);
}

// Iterative tree traversal with explicit stack (no overflow risk)
function sumTreeIterative(root) {
  if (root === null) return 0;
  const stack = [root];
  let total = 0;

  while (stack.length > 0) {
    const node = stack.pop();
    total += node.value;
    if (node.right) stack.push(node.right);
    if (node.left) stack.push(node.left);
  }

  return total;
}

// Test with a sample tree
const tree = {
  value: 1,
  left: {
    value: 2,
    left: { value: 4, left: null, right: null },
    right: { value: 5, left: null, right: null },
  },
  right: {
    value: 3,
    left: null,
    right: { value: 6, left: null, right: null },
  },
};

console.log(sumTreeRecursive(tree));  // 21
console.log(sumTreeIterative(tree));  // 21
```

> **React Connection:** React's own reconciliation algorithm uses an iterative approach with linked list traversal rather than deep recursion. The Fiber architecture represents the component tree as a linked list of fiber nodes (with `child`, `sibling`, and `return` pointers), allowing React to traverse the tree iteratively. This was a deliberate design choice to avoid stack overflow on deeply nested component trees and to enable interruptible rendering. See Part 2, Chapter 4, Section 4.3 for the Fiber tree structure.

---

## 1.5 Exercise: Trace Execution Context for Nested Function Calls

### Problem Statement

Given the following code, trace the execution context and call stack state at each significant point. Predict the exact output (including order) and explain what happens at each step in terms of execution context creation and destruction.

```javascript
var name = "Global";

function first() {
  var name = "First";
  console.log("A:", name);
  second();
  console.log("B:", name);
}

function second() {
  var name = "Second";
  console.log("C:", name);
  third();
  console.log("D:", name);
}

function third() {
  console.log("E:", name);
}

first();
console.log("F:", name);
```

Before looking at the solution, write down:

1. The exact console output (all six log statements, in order)
2. The state of the call stack at the point where `third()` is executing
3. Which `name` variable does `third()` access, and why?

---

### Solution

#### Console Output

```
A: First
C: Second
E: Global
D: Second
B: First
F: Global
```

#### Step-by-Step Trace

**Step 1: Global Execution Context Creation Phase**

The engine scans the top-level code and creates the Global Execution Context:

```
Global Environment Record:
  name  -> undefined   (var, hoisted)
  first -> [Function]  (function declaration, fully hoisted)
  second -> [Function] (function declaration, fully hoisted)
  third -> [Function]  (function declaration, fully hoisted)
```

**Step 2: Global Execution Phase Begins**

```javascript
var name = "Global"; // name is now "Global" in Global Environment Record
```

**Step 3: `first()` is called**

A new Function Execution Context is created for `first`:

```
Call Stack:
  first() FEC       <-- top
  Global EC

first's Environment Record:
  name -> undefined  (var, creation phase)
Outer reference -> Global Environment Record
```

Execution phase of `first`:
- `var name = "First"` assigns `"First"` to `first`'s local `name`
- `console.log("A:", name)` resolves `name` in `first`'s environment, finds `"First"`
- **Output: `A: First`**

**Step 4: `second()` is called from within `first()`**

```
Call Stack:
  second() FEC      <-- top
  first() FEC
  Global EC

second's Environment Record:
  name -> undefined  (var, creation phase)
Outer reference -> Global Environment Record
  (second was defined in the global scope, NOT inside first)
```

Execution phase of `second`:
- `var name = "Second"` assigns `"Second"` to `second`'s local `name`
- `console.log("C:", name)` resolves `name` in `second`'s environment, finds `"Second"`
- **Output: `C: Second`**

**Step 5: `third()` is called from within `second()`**

```
Call Stack:
  third() FEC       <-- top (maximum depth in this program)
  second() FEC
  first() FEC
  Global EC

third's Environment Record:
  (no local declarations)
Outer reference -> Global Environment Record
  (third was defined in the global scope)
```

Execution phase of `third`:
- `console.log("E:", name)`: the engine looks for `name` in `third`'s environment record. Not found. It follows the outer reference to the **Global** Environment Record (because `third` was defined at the global level, its outer reference is the global scope, not `second`'s scope). Finds `name = "Global"`.
- **Output: `E: Global`**

**This is the critical insight:** scope chain follows **lexical** (where the function was written) structure, not the **call** (where the function was called from) structure.

**Step 6: `third()` returns, its context is popped**

```
Call Stack:
  second() FEC      <-- resumes execution
  first() FEC
  Global EC
```

- `console.log("D:", name)` in `second` resolves to `second`'s local `name`: `"Second"`
- **Output: `D: Second`**

**Step 7: `second()` returns, its context is popped**

```
Call Stack:
  first() FEC       <-- resumes execution
  Global EC
```

- `console.log("B:", name)` in `first` resolves to `first`'s local `name`: `"First"`
- **Output: `B: First`**

**Step 8: `first()` returns, its context is popped**

```
Call Stack:
  Global EC          <-- resumes execution
```

- `console.log("F:", name)` in the global scope resolves to the global `name`: `"Global"`
- **Output: `F: Global`**

#### Call Stack at `third()`'s Execution (Answer to Question 2)

```
+------------------+
| third() FEC      |  <-- executing console.log("E:", name)
+------------------+
| second() FEC     |  <-- paused, waiting for third() to return
+------------------+
| first() FEC      |  <-- paused, waiting for second() to return
+------------------+
| Global EC        |  <-- paused, waiting for first() to return
+------------------+
```

#### Which `name` Does `third()` Access? (Answer to Question 3)

`third()` accesses the **global** `name` variable (`"Global"`). Even though `third()` was called from inside `second()` (which has its own local `name = "Second"`), scope resolution follows the **lexical scope chain**, not the call stack. Since `third` is defined at the global level, its outer environment reference points to the Global Environment Record.

> **See Also:** Part 1, Chapter 2, Section 2.2 for a thorough treatment of lexical environments and the scope chain, and Part 1, Chapter 3, Section 3.1 for how closures build on this mechanism.

### Key Takeaway

The call stack determines the order of execution (which function runs when), but the **scope chain** (determined at author time by where functions are written) determines variable resolution. These two structures are independent. A function called deep in the call stack may resolve variables from the global scope if that is where it was lexically defined. Confusing the call stack with the scope chain is one of the most common sources of bugs in JavaScript.

---

## 1.5.1 Bonus Exercise: Tracing with Closures

### Problem Statement

Predict the output of the following code. Trace the call stack and explain which execution context each variable is resolved from.

```javascript
function createCounter(label) {
  var count = 0;

  function increment() {
    count += 1;
    console.log(label + ": " + count);
  }

  function getCount() {
    return count;
  }

  return { increment, getCount };
}

var counterA = createCounter("A");
var counterB = createCounter("B");

counterA.increment();
counterA.increment();
counterB.increment();
console.log("A has:", counterA.getCount());
console.log("B has:", counterB.getCount());
counterA.increment();
```

---

### Solution

#### Output

```
A: 1
A: 2
B: 1
A has: 2
B has: 1
A: 3
```

#### Explanation

When `createCounter("A")` is called, a new FEC is created with `label = "A"` and `count = 0` in its environment record. The returned `increment` and `getCount` functions close over this environment. Even after `createCounter` returns and its FEC is popped from the call stack, the environment record persists in memory because the returned functions hold a reference to it.

When `createCounter("B")` is called, a completely separate FEC is created with `label = "B"` and `count = 0`. The two counters have independent environment records.

Each call to `counterA.increment()` creates a new FEC for `increment`, whose outer reference points to `createCounter("A")`'s environment. It finds `count` there, increments it, and logs with label `"A"`.

```
After counterA.increment() call #1:
  createCounter("A")'s Environment Record: { label: "A", count: 1 }

After counterA.increment() call #2:
  createCounter("A")'s Environment Record: { label: "A", count: 2 }

After counterB.increment() call #1:
  createCounter("B")'s Environment Record: { label: "B", count: 1 }
```

The `getCount` calls read from the same closure, returning the current `count` in each respective environment.

### Key Takeaway

This exercise bridges execution context and closures. The environment record of a completed function call survives garbage collection as long as inner functions reference it. Each invocation of `createCounter` creates a separate environment record, which is why the two counters are independent. This pattern is the conceptual foundation of how `useState` works in React: each component instance maintains its own closure over its state values.

> **See Also:** Part 1, Chapter 3 for a complete treatment of closures, including how React hooks leverage this exact mechanism.

---

## The ECMAScript Specification View

For readers who want a precise understanding, the ECMAScript specification defines an execution context as a structure containing:

| Component | Purpose |
|---|---|
| **LexicalEnvironment** | Used for identifier resolution of `let`, `const`, and `class` bindings |
| **VariableEnvironment** | Holds `var` and `function` declaration bindings |
| **Realm** | The set of intrinsic objects and the global environment |
| **Function** | The function object being executed (null for global/eval contexts) |
| **ScriptOrModule** | The script or module record associated with this context |

When an execution context is created, both `LexicalEnvironment` and `VariableEnvironment` initially point to the **same** Environment Record. They diverge when a block scope is entered:

- `VariableEnvironment` never changes during execution of a function body. All `var` declarations attach to this environment regardless of block nesting.
- `LexicalEnvironment` is updated when entering a block (`if`, `for`, `{}`). A new Environment Record is pushed for `let`/`const`/`class` bindings, then restored when the block exits.

```javascript
function example() {
  // VariableEnvironment and LexicalEnvironment both point to
  // the function's Environment Record here.
  var x = 1;    // Goes to VariableEnvironment (function-scoped)
  let y = 2;    // Goes to current LexicalEnvironment (same as VE at this point)

  if (true) {
    // Entering a block: a new LexicalEnvironment is created.
    // VariableEnvironment still points to the function-level record.
    var z = 3;    // Goes to VariableEnvironment (function-scoped, ignores block)
    let w = 4;    // Goes to the NEW LexicalEnvironment (block-scoped)
    console.log(w); // 4 -- resolved in block's LexicalEnvironment
  }

  // Exiting the block: LexicalEnvironment is restored.
  console.log(x); // 1 -- from VariableEnvironment
  console.log(y); // 2 -- from LexicalEnvironment (function-level)
  console.log(z); // 3 -- from VariableEnvironment (var is function-scoped)
  // console.log(w); // ReferenceError -- block's LexicalEnvironment is gone
}

example();
```

This dual-environment design is why `var` is function-scoped (it always goes to the unchanging `VariableEnvironment`) while `let`/`const` are block-scoped (they go to whichever `LexicalEnvironment` is current).

> **Common Mistake:** Many older tutorials and blog posts describe a "Variable Object" (VO) or "Activation Object" (AO) as part of the execution context. These are outdated concepts from the ES3 specification era. The modern specification (ES5 and beyond) replaced them with **Environment Records**. Using the old terminology leads to incorrect mental models, particularly around how `let`/`const` block scoping works, because the VO/AO model had no concept of separate lexical and variable environments.

---

## Chapter Summary

Every piece of JavaScript code runs inside an execution context, which is created in two phases: the creation phase (where bindings are registered and memory is allocated) and the execution phase (where code runs line by line). The Global Execution Context is created once when a script loads; Function Execution Contexts are created and destroyed with every function call. The call stack manages these contexts in a LIFO structure, and its finite size means unbounded recursion causes stack overflow errors. Practical patterns like iteration, trampolines, and explicit stacks avoid this limitation. The ECMAScript specification models execution contexts with dual environments (LexicalEnvironment and VariableEnvironment), which is the mechanism behind the scoping differences between `var` and `let`/`const`.

---

## Further Reading

- [ECMAScript 2026 Specification: Executable Code and Execution Contexts](https://tc39.es/ecma262/multipage/executable-code-and-execution-contexts.html) — the authoritative source on how execution contexts are defined
- [MDN: Hoisting](https://developer.mozilla.org/en-US/docs/Glossary/Hoisting) — MDN's nuanced treatment of hoisting, including the debate around `let`/`const`
- [Just JavaScript by Dan Abramov](https://justjavascript.com/) — a mental model course that reframes how to think about values, variables, and scope
- [JavaScript to Know for React by Kent C. Dodds](https://kentcdodds.com/blog/javascript-to-know-for-react) — the JavaScript fundamentals most relevant to React development
- [Grokking V8 Closures for Fun (and Profit?)](https://mrale.ph/blog/2012/09/23/grokking-v8-closures-for-fun.html) — deep dive into how V8 implements closures and contexts at the engine level
- [Dmitry Soshnikov: Lexical Environments](https://dmitrysoshnikov.com/ecmascript/es5-chapter-3-2-lexical-environments-ecmascript-implementation/) — detailed walkthrough of the specification's environment model
- [Using Trampolines to Manage Large Recursive Loops in JavaScript](https://blog.logrocket.com/using-trampolines-to-manage-large-recursive-loops-in-javascript-d8c9db095ae3/) — practical guide to the trampoline pattern
