# Part 1, Chapter 7: Immutability & Data Manipulation

## What You Will Learn

- Distinguish between primitive types (stored by value) and reference types (stored by reference), and explain how this difference affects equality comparisons
- Perform shallow copies with spread syntax and `Object.assign`, and deep copies with `structuredClone`, identifying the limitations of each
- Apply immutable update patterns for objects, arrays, and deeply nested data structures using only built-in JavaScript methods
- Explain precisely why mutating state breaks React rendering, tracing the mechanism through `Object.is` reference comparison
- Choose between `structuredClone`, spread operators, and libraries like Immer based on data structure complexity and performance requirements
- Refactor mutating code into immutable equivalents using `map`, `filter`, spread, `toSorted`, and `toReversed`

---

## 7.1 Primitive vs Reference Types (And Why React Cares)

JavaScript values fall into two categories that behave fundamentally differently in assignment, comparison, and function passing.

### Primitive Types

The seven primitive types are: `string`, `number`, `bigint`, `boolean`, `undefined`, `symbol`, and `null`.

Primitives have three defining characteristics:

1. **Immutable**: the value `42` cannot be altered. Operations on primitives produce new values.
2. **Stored by value**: assigning a primitive to a variable copies the value itself. Two variables holding `42` are independent.
3. **Compared by value**: `42 === 42` is `true`; `"hello" === "hello"` is `true`.

```javascript
let price = 29.99;
let discountedPrice = price; // Copies the value 29.99

discountedPrice = 24.99;     // Changes only discountedPrice

console.log(price);           // 29.99 (unchanged)
console.log(discountedPrice); // 24.99

// Comparison by value
console.log(29.99 === 29.99); // true
console.log("react" === "react"); // true
```

### Reference Types

Everything that is not a primitive is a reference type: objects, arrays, functions, `Date`, `Map`, `Set`, `RegExp`, and all other built-in or custom objects.

Reference types have three contrasting characteristics:

1. **Mutable**: properties can be added, changed, or deleted on an existing object.
2. **Stored by reference**: a variable holds a pointer to the object in heap memory, not the object itself. Assignment copies the pointer, not the object.
3. **Compared by reference**: two distinct objects with identical contents are not equal.

```javascript
const userA = { name: "Alice", age: 30 };
const userB = userA; // Copies the reference (pointer), NOT the object

userB.age = 31;      // Mutates through userB

console.log(userA.age); // 31 (same object!)
console.log(userA === userB); // true (same reference)

// Two distinct objects with identical contents are NOT equal
const userC = { name: "Alice", age: 31 };
console.log(userA === userC); // false (different references)
```

### Visualizing the Difference

```
Primitive assignment:           Reference assignment:

let a = 42;                     const obj1 = { x: 1 };
let b = a;                      const obj2 = obj1;

Stack:                          Stack:                   Heap:
+-------+                      +-------+                +--------+
| a: 42 |                      | obj1 -+--------------->| x: 1   |
+-------+                      +-------+           ┌--->|        |
| b: 42 |  (independent copy)  | obj2 -+-----------┘    +--------+
+-------+                      +-------+  (same pointer)
```

> **React Connection:** This distinction is the foundation of React's change detection. React uses `Object.is()` to determine if state has changed. For primitives, `Object.is(42, 43)` returns `false`, correctly detecting the change. For objects, `Object.is(obj, obj)` returns `true` even if properties were mutated, because the reference has not changed. This is why React requires new object references for state updates: creating a new object (`{ ...obj, x: 2 }`) produces a new reference that `Object.is` can detect as different.

---

## 7.2 Shallow Copy vs Deep Copy: Spread, Object.assign, structuredClone

### Shallow Copy

A shallow copy creates a new object and copies the top-level properties. If a property's value is a reference type (a nested object or array), the copy contains the same reference, not a duplicate of the nested object.

#### Spread Syntax (`{ ...obj }` and `[...arr]`)

```javascript
const original = {
  name: "Product Widget",
  price: 49.99,
  tags: ["sale", "featured"],
  dimensions: { width: 10, height: 20 },
};

const shallowCopy = { ...original };

// Top-level properties are independent
shallowCopy.name = "Updated Widget";
console.log(original.name); // "Product Widget" (unchanged)

// Nested objects still share references!
shallowCopy.tags.push("new");
console.log(original.tags); // ["sale", "featured", "new"] (MUTATED!)

shallowCopy.dimensions.width = 99;
console.log(original.dimensions.width); // 99 (MUTATED!)
```

#### `Object.assign(target, ...sources)`

Functionally equivalent to spread for plain objects:

```javascript
const copy = Object.assign({}, original);
// Same shallow behavior as { ...original }
```

The difference: `Object.assign` mutates the target object, while spread always creates a new one. `Object.assign({}, source)` is equivalent to `{ ...source }` for copying.

#### Shallow Array Copy

```javascript
const numbers = [1, 2, 3];
const copy1 = [...numbers];           // Spread
const copy2 = numbers.slice();        // slice with no args
const copy3 = Array.from(numbers);    // Array.from

// All three produce independent shallow copies
copy1.push(4);
console.log(numbers); // [1, 2, 3] (unchanged)
```

> **Common Mistake:** Assuming that spread creates a deep copy. The spread operator copies only the first level of properties. Nested objects and arrays inside the spread result still point to the same heap objects as the original. This is the most frequent source of "phantom mutation" bugs in React state management, where updating a nested property in a copy accidentally mutates the original state.

### Deep Copy

A deep copy duplicates the entire object graph, including all nested objects, arrays, and other reference-type values.

#### `structuredClone()` (ES2022+)

The recommended built-in method for deep cloning:

```javascript
const original = {
  name: "Dashboard Config",
  layout: { columns: 3, rows: 2 },
  widgets: [
    { id: 1, type: "chart", data: [10, 20, 30] },
    { id: 2, type: "table", data: [40, 50, 60] },
  ],
  metadata: {
    created: new Date("2025-01-01"),
    tags: new Set(["production", "v2"]),
  },
};

const deepCopy = structuredClone(original);

// All levels are independent
deepCopy.layout.columns = 4;
deepCopy.widgets[0].data.push(40);
deepCopy.metadata.tags.add("updated");

console.log(original.layout.columns);   // 3 (unchanged)
console.log(original.widgets[0].data);  // [10, 20, 30] (unchanged)
console.log(original.metadata.tags);    // Set { "production", "v2" } (unchanged)

// structuredClone handles Date and Set correctly
console.log(deepCopy.metadata.created instanceof Date); // true
console.log(deepCopy.metadata.tags instanceof Set);     // true
```

**What `structuredClone` cannot clone** (throws `DataCloneError`):

- Functions
- DOM nodes
- Property descriptors, getters, setters
- The prototype chain (not preserved)
- Symbol-keyed properties (silently ignored)

```javascript
const withFunction = {
  name: "Config",
  validate: () => true, // Function: cannot be cloned
};

// structuredClone(withFunction); // DataCloneError: () => true could not be cloned
```

#### `JSON.parse(JSON.stringify(obj))` (Legacy Pattern)

Before `structuredClone`, this was the common deep-copy technique. It has significant limitations:

- Converts `Date` objects to strings (does not restore them as Dates)
- Drops `undefined` values, functions, `Symbol` keys, `Map`, `Set`
- Fails on circular references (throws `TypeError`)
- Converts `Infinity`, `-Infinity`, and `NaN` to `null`

```javascript
const data = {
  date: new Date(),
  value: undefined,
  count: NaN,
};

const jsonCopy = JSON.parse(JSON.stringify(data));
console.log(jsonCopy.date);  // "2025-03-16T..." (string, not Date)
console.log(jsonCopy.value); // absent (undefined was dropped)
console.log(jsonCopy.count); // null (NaN became null)
```

**Recommendation:** Use `structuredClone` for deep copies. Fall back to `JSON.parse(JSON.stringify())` only for plain data objects where the limitations are acceptable.

---

## 7.3 Immutable Update Patterns for Objects

In React state management, every state update must produce a new object reference. These patterns accomplish that for objects.

### Updating a Property

```javascript
const user = { name: "Alice", email: "alice@example.com", role: "editor" };

// Immutable update: create a new object with the changed property
const updatedUser = { ...user, role: "admin" };
// Properties listed after the spread override earlier ones

console.log(user.role);        // "editor" (original unchanged)
console.log(updatedUser.role); // "admin"
console.log(user === updatedUser); // false (new reference)
```

### Adding a Property

```javascript
const product = { name: "Widget", price: 9.99 };

const withDiscount = { ...product, discount: 0.15 };
console.log(withDiscount); // { name: "Widget", price: 9.99, discount: 0.15 }
```

### Removing a Property

```javascript
const config = { host: "localhost", port: 3000, debug: true };

// Destructure out the property to remove; collect the rest
const { debug, ...productionConfig } = config;
console.log(productionConfig); // { host: "localhost", port: 3000 }
console.log(config.debug);     // true (original unchanged)
```

### Computed Property Names

When the property to update is dynamic (stored in a variable):

```javascript
function updateField(obj, fieldName, value) {
  return { ...obj, [fieldName]: value };
}

const form = { username: "", email: "", password: "" };
const updated = updateField(form, "email", "alice@example.com");
console.log(updated); // { username: "", email: "alice@example.com", password: "" }
```

> **React Connection:** These patterns appear constantly in React event handlers and reducers. A form component might handle field changes with a single handler:

```javascript
function RegistrationForm() {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
  });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <form>
      <input name="username" value={formData.username} onChange={handleChange} />
      <input name="email" value={formData.email} onChange={handleChange} />
      <input name="password" value={formData.password} onChange={handleChange} />
    </form>
  );
}
```

---

## 7.4 Immutable Update Patterns for Arrays (map, filter, spread, slice)

Arrays require different patterns because their operations (adding, removing, updating items) map to different methods.

### Mutating vs Non-Mutating Array Methods

| Operation | Mutating (avoid in state) | Non-Mutating (use in state) |
|---|---|---|
| Add to end | `push()` | `[...arr, item]` |
| Add to start | `unshift()` | `[item, ...arr]` |
| Remove by index | `splice()` | `filter()`, `slice()` + spread |
| Remove by condition | `splice()` | `filter()` |
| Update an item | `arr[i] = x` | `map()` |
| Sort | `sort()` | `toSorted()` (ES2023) or `[...arr].sort()` |
| Reverse | `reverse()` | `toReversed()` (ES2023) or `[...arr].reverse()` |

### Adding Items

```javascript
const todos = [
  { id: 1, text: "Learn React", done: false },
  { id: 2, text: "Build project", done: false },
];

// Add to end
const withNewTodo = [...todos, { id: 3, text: "Deploy", done: false }];

// Add to start
const withUrgentTodo = [{ id: 0, text: "Fix bug", done: false }, ...todos];

// Insert at specific position
const insertAtIndex = (arr, index, item) => [
  ...arr.slice(0, index),
  item,
  ...arr.slice(index),
];

const withInserted = insertAtIndex(todos, 1, { id: 4, text: "Write tests", done: false });
```

### Removing Items

```javascript
// Remove by condition
const withoutCompleted = todos.filter(todo => !todo.done);

// Remove by ID
const withoutItem = todos.filter(todo => todo.id !== 2);

// Remove by index
const removeAtIndex = (arr, index) => [
  ...arr.slice(0, index),
  ...arr.slice(index + 1),
];
```

### Updating Items

```javascript
// Toggle a specific todo's done status
const toggled = todos.map(todo =>
  todo.id === 1 ? { ...todo, done: !todo.done } : todo
);

// Update a field on a specific item
const renamed = todos.map(todo =>
  todo.id === 2 ? { ...todo, text: "Build portfolio project" } : todo
);
```

### Sorting and Reversing (ES2023)

ES2023 introduced non-mutating counterparts to `sort()` and `reverse()`:

```javascript
const scores = [85, 92, 78, 95, 88];

// toSorted: returns a new sorted array (original unchanged)
const sorted = scores.toSorted((a, b) => b - a);
console.log(scores); // [85, 92, 78, 95, 88] (unchanged)
console.log(sorted); // [95, 92, 88, 85, 78]

// toReversed: returns a new reversed array
const reversed = scores.toReversed();
console.log(scores);   // [85, 92, 78, 95, 88] (unchanged)
console.log(reversed); // [88, 95, 78, 92, 85]

// toSpliced: non-mutating splice (ES2023)
const withReplacement = scores.toSpliced(2, 1, 100);
console.log(scores);          // [85, 92, 78, 95, 88] (unchanged)
console.log(withReplacement); // [85, 92, 100, 95, 88]

// with: replace at index (ES2023)
const withUpdated = scores.with(0, 99);
console.log(scores);      // [85, 92, 78, 95, 88] (unchanged)
console.log(withUpdated); // [99, 92, 78, 95, 88]
```

> **Common Mistake:** Using `Array.prototype.sort()` directly on state. `sort()` mutates the original array and returns the same reference. Even `[...state].sort()` is sometimes forgotten, and developers write `state.sort()` inside a `setState` call. Because `sort()` returns the same array reference (after mutating it), and some code paths may store or compare that reference, this leads to subtle bugs. Prefer `toSorted()` in ES2023+ environments, or always copy first: `[...state].sort(compareFn)`.

---

## 7.5 Immutable Update Patterns for Nested Data

Nested state structures require spreading at every level from the root to the changed leaf. This is the most error-prone area of immutable state management.

### Two-Level Nesting

```javascript
const state = {
  user: {
    name: "Alice",
    address: { city: "Portland", zip: "97201" },
  },
  preferences: {
    theme: "dark",
    notifications: true,
  },
};

// Update user's city
const updated = {
  ...state,
  user: {
    ...state.user,
    address: {
      ...state.user.address,
      city: "Seattle",
    },
  },
};

// state.user.address.city is still "Portland"
// updated.user.address.city is "Seattle"
// state.preferences === updated.preferences (same reference, untouched)
```

### Updating an Item in a Nested Array

```javascript
const appState = {
  projects: [
    {
      id: 1,
      name: "Website",
      tasks: [
        { id: 101, title: "Design homepage", done: false },
        { id: 102, title: "Build API", done: true },
      ],
    },
    {
      id: 2,
      name: "Mobile App",
      tasks: [
        { id: 201, title: "Setup React Native", done: false },
      ],
    },
  ],
};

// Mark task 101 as done in project 1
const updatedState = {
  ...appState,
  projects: appState.projects.map(project =>
    project.id === 1
      ? {
          ...project,
          tasks: project.tasks.map(task =>
            task.id === 101 ? { ...task, done: true } : task
          ),
        }
      : project
  ),
};
```

This pattern is correct but verbose. Each nesting level adds another spread and another conditional.

### When to Flatten Your State

If immutable updates become deeply nested, consider normalizing (flattening) the data structure:

```javascript
// Instead of deeply nested:
const nested = {
  projects: [
    { id: 1, tasks: [{ id: 101, done: false }, { id: 102, done: true }] },
  ],
};

// Use a normalized, flat structure:
const normalized = {
  projects: { 1: { id: 1, taskIds: [101, 102] } },
  tasks: {
    101: { id: 101, projectId: 1, done: false },
    102: { id: 102, projectId: 1, done: true },
  },
};

// Updating task 101 is now a single-level spread:
const updatedTasks = {
  ...normalized.tasks,
  101: { ...normalized.tasks[101], done: true },
};
```

> **See Also:** Part 3, Chapter 4, Section 4.3 for deriving state and Part 5, Section B for the "normalize data" rule.

### Using Immer for Complex Updates

When spread nesting becomes unwieldy, Immer provides ergonomic "mutative" syntax that produces immutable results:

```javascript
import { produce } from "immer";

const updatedState = produce(appState, (draft) => {
  // Write "mutations" on the draft; Immer handles immutability
  const project = draft.projects.find(p => p.id === 1);
  const task = project.tasks.find(t => t.id === 101);
  task.done = true;
});

// appState is unchanged; updatedState is a new object
// Only the changed path (projects[0].tasks[0]) gets new references
// Unchanged subtrees keep their original references (structural sharing)
```

Immer works by wrapping the state in a Proxy that intercepts mutations, records changes, and produces a new immutable state with structural sharing. The draft can be "mutated" freely; the original is never touched.

---

## 7.6 Why Mutation Breaks React Rendering

This section traces the exact mechanism by which mutation causes React to skip updates.

### React's Change Detection: `Object.is`

When `setState(newValue)` is called, React compares `newValue` to the current state using `Object.is()`. If the comparison returns `true`, React bails out and skips re-rendering.

For primitives, `Object.is` compares by value:

```javascript
Object.is(42, 43);       // false (different values, triggers re-render)
Object.is("hello", "hello"); // true (same value, no re-render)
```

For objects and arrays, `Object.is` compares by reference:

```javascript
const obj = { count: 0 };
Object.is(obj, obj);     // true (same reference, no re-render!)

const newObj = { ...obj, count: 1 };
Object.is(obj, newObj);  // false (different reference, triggers re-render)
```

### Mutation Scenario: The Silent Bug

```javascript
function BrokenCounter() {
  const [user, setUser] = useState({ name: "Alice", score: 0 });

  const handleIncrement = () => {
    user.score += 1;    // MUTATES the existing object
    setUser(user);      // Passes the SAME reference
    // Object.is(user, user) === true
    // React sees no change. No re-render. UI shows stale score.
  };

  return <div>{user.name}: {user.score}</div>;
}
```

The fix:

```javascript
function WorkingCounter() {
  const [user, setUser] = useState({ name: "Alice", score: 0 });

  const handleIncrement = () => {
    setUser({ ...user, score: user.score + 1 }); // New object reference
    // Object.is(oldUser, newUser) === false
    // React detects the change. Re-render occurs. UI updates.
  };

  return <div>{user.name}: {user.score}</div>;
}
```

### Mutation in Nested Objects: A Subtler Bug

```javascript
function BrokenNestedUpdate() {
  const [config, setConfig] = useState({
    display: { theme: "dark", fontSize: 14 },
    notifications: true,
  });

  const handleFontChange = () => {
    // Creates a new top-level object...
    const newConfig = { ...config };
    // ...but display is still the same reference
    newConfig.display.fontSize = 16; // MUTATES the original display object!
    setConfig(newConfig);
    // React re-renders (new top-level reference), but the original
    // config.display.fontSize is now 16 too. If any other component
    // or memoized value references config.display, it sees the mutation.
  };
}
```

The fix: spread at every nesting level:

```javascript
const handleFontChange = () => {
  setConfig({
    ...config,
    display: { ...config.display, fontSize: 16 },
  });
};
```

> **React Connection:** Mutation bugs are especially insidious with `React.memo`, `useMemo`, and `useCallback`. These optimizations rely on reference equality to skip work. If you mutate an object and pass it to a memoized child, the child's props appear unchanged (same reference), so it does not re-render, even though the data has changed. Conversely, if you create a new reference when nothing actually changed, memoized components re-render unnecessarily. Correct immutable updates ensure that references change if and only if data changes.

---

## 7.7 When to Use structuredClone vs Spread vs Libraries

### Decision Framework

| Scenario | Recommended Approach | Reason |
|---|---|---|
| Single-level state update | Spread (`{ ...obj, key: value }`) | Fastest, simplest, zero overhead |
| Array add/remove/update | Spread + `map`/`filter` | Standard immutable array patterns |
| 2-level nesting | Nested spread | Manageable verbosity |
| 3+ level nesting | Immer `produce()` | Readable, less error-prone |
| Full deep clone needed | `structuredClone()` | Built-in, handles circular refs, Date, Set, Map |
| Data with functions | Manual deep clone or lodash | `structuredClone` cannot clone functions |
| Performance-critical hot path | Spread (shallow) | ~20x faster than `structuredClone` |

### Performance Comparison

For a typical React state object (1-2 KB, 2-3 levels of nesting):

| Method | Relative Speed | Deep Copy? | Handles Special Types? |
|---|---|---|---|
| `{ ...obj }` / `Object.assign` | Fastest (~1x) | No (shallow only) | N/A |
| `[...arr].sort()` | Fast (~1.5x) | No (shallow) | N/A |
| `structuredClone()` | Moderate (~10-20x slower) | Yes | Date, Set, Map, circular refs |
| `JSON.parse(JSON.stringify())` | Moderate (~10-20x slower) | Yes | No (loses Date, undefined, NaN) |
| Immer `produce()` | Moderate (~5-10x slower) | Structural sharing | All JS types |

For React state updates, the performance difference is negligible in absolute terms. A `structuredClone` of a 5 KB object takes approximately 0.06ms. The bottleneck in React applications is rendering, not state cloning.

### `Object.freeze` for Development Safety

`Object.freeze()` makes an object shallowly immutable (properties cannot be added, removed, or reassigned). It serves as a development-time safety net: attempts to mutate a frozen object silently fail in non-strict mode or throw a `TypeError` in strict mode.

```javascript
const frozenState = Object.freeze({
  user: { name: "Alice" },
  count: 0,
});

// frozenState.count = 1;  // TypeError in strict mode (silently fails otherwise)

// BUT: freeze is shallow. Nested objects are NOT frozen.
frozenState.user.name = "Bob"; // This succeeds! user is not frozen.
```

For deep freezing, you need a recursive utility or Immer (which auto-freezes produced state by default).

---

## 7.8 Exercise: Refactor 10 Mutating Functions to Immutable Versions

### Problem Statement

Each of the following functions mutates its input. Refactor each one to return a new value without modifying the original. Use only built-in JavaScript methods (no libraries).

---

### 1. Add Item to Array

```javascript
// Mutating
function addItem(cart, item) {
  cart.push(item);
  return cart;
}
```

#### Solution

```javascript
function addItem(cart, item) {
  return [...cart, item];
}
```

---

### 2. Remove Item by ID

```javascript
// Mutating
function removeItem(cart, itemId) {
  const index = cart.findIndex(item => item.id === itemId);
  if (index !== -1) cart.splice(index, 1);
  return cart;
}
```

#### Solution

```javascript
function removeItem(cart, itemId) {
  return cart.filter(item => item.id !== itemId);
}
```

---

### 3. Update Object Property

```javascript
// Mutating
function updateEmail(user, newEmail) {
  user.email = newEmail;
  return user;
}
```

#### Solution

```javascript
function updateEmail(user, newEmail) {
  return { ...user, email: newEmail };
}
```

---

### 4. Toggle Boolean in Array Item

```javascript
// Mutating
function toggleTodo(todos, todoId) {
  const todo = todos.find(t => t.id === todoId);
  if (todo) todo.done = !todo.done;
  return todos;
}
```

#### Solution

```javascript
function toggleTodo(todos, todoId) {
  return todos.map(todo =>
    todo.id === todoId ? { ...todo, done: !todo.done } : todo
  );
}
```

---

### 5. Sort Array

```javascript
// Mutating
function sortByPrice(products) {
  return products.sort((a, b) => a.price - b.price);
}
```

#### Solution

```javascript
function sortByPrice(products) {
  return products.toSorted((a, b) => a.price - b.price);
  // Or for older environments: return [...products].sort((a, b) => a.price - b.price);
}
```

---

### 6. Reverse Array

```javascript
// Mutating
function reverseList(items) {
  return items.reverse();
}
```

#### Solution

```javascript
function reverseList(items) {
  return items.toReversed();
  // Or: return [...items].reverse();
}
```

---

### 7. Update Nested Property

```javascript
// Mutating
function updateCity(state, newCity) {
  state.user.address.city = newCity;
  return state;
}
```

#### Solution

```javascript
function updateCity(state, newCity) {
  return {
    ...state,
    user: {
      ...state.user,
      address: {
        ...state.user.address,
        city: newCity,
      },
    },
  };
}
```

---

### 8. Remove Object Key

```javascript
// Mutating
function removeField(config, fieldName) {
  delete config[fieldName];
  return config;
}
```

#### Solution

```javascript
function removeField(config, fieldName) {
  const { [fieldName]: _, ...rest } = config;
  return rest;
}
```

---

### 9. Increment Counter in Map-like Object

```javascript
// Mutating
function incrementCount(counts, key) {
  counts[key] = (counts[key] || 0) + 1;
  return counts;
}
```

#### Solution

```javascript
function incrementCount(counts, key) {
  return {
    ...counts,
    [key]: (counts[key] || 0) + 1,
  };
}
```

---

### 10. Replace Item at Index

```javascript
// Mutating
function replaceAt(items, index, newItem) {
  items[index] = newItem;
  return items;
}
```

#### Solution

```javascript
function replaceAt(items, index, newItem) {
  return items.with(index, newItem);
  // Or: return items.map((item, i) => i === index ? newItem : item);
}
```

---

### Key Takeaway

Every mutating operation has an immutable equivalent using spread, `map`, `filter`, `toSorted`, `toReversed`, `with`, or destructuring with rest. The pattern is consistent: create a new container (object or array), copy unchanged elements, and include the modification. For nested data, spread at every level from root to the changed leaf. These patterns form the backbone of React state management: every `setState` call should produce a new reference through one of these techniques.

---

## Chapter Summary

JavaScript's distinction between primitive types (compared by value) and reference types (compared by reference) is the foundation of React's change detection mechanism. React uses `Object.is` to compare state references; if the reference has not changed, the component does not re-render. Immutable update patterns (spread for objects, `map`/`filter`/`toSorted` for arrays, nested spreading for deep structures) ensure that every state change produces a new reference. For simple state, spread is sufficient; for deeply nested state, Immer provides ergonomic "mutative" syntax that produces correct immutable results. `structuredClone` serves as the built-in deep copy utility for cases where a full independent copy is needed, while `Object.freeze` provides development-time mutation detection.

---

## Further Reading

- [React Documentation: Updating Objects in State](https://react.dev/learn/updating-objects-in-state) — official guide to immutable object updates in React
- [React Documentation: Updating Arrays in State](https://react.dev/learn/updating-arrays-in-state) — official guide to immutable array updates
- [MDN: structuredClone()](https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone) — complete API reference and limitations
- [MDN: Object.is()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is) — the comparison algorithm React uses
- [Immer Documentation](https://immerjs.github.io/immer/) — the library for ergonomic immutable updates
- [Deep-Copying in JavaScript Using structuredClone (web.dev)](https://web.dev/articles/structured-clone) — comprehensive guide with browser support details
- [Redux: Immutable Update Patterns](https://redux.js.org/usage/structuring-reducers/immutable-update-patterns) — exhaustive reference for immutable patterns (applicable beyond Redux)
