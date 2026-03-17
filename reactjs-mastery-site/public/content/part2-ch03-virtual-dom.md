# Part 2, Chapter 3: The Virtual DOM Deep Dive

## What You Will Learn

- Describe what the virtual DOM is (a plain JavaScript object tree) and what it is not (a shadow copy of the real DOM)
- Trace how React builds the virtual DOM tree by recursively calling component functions
- Explain the two heuristic assumptions that reduce tree diffing from O(n^3) to O(n)
- Predict React's behavior when element types change (tear-down-and-rebuild) versus when they remain the same (attribute patching and child recursion)
- Articulate why keys exist, how they enable efficient list reconciliation, and why index-as-key causes both performance degradation and state corruption
- Manually diff two virtual DOM trees and determine the minimal set of DOM operations

---

## 3.1 What the Virtual DOM Actually Is

The virtual DOM is a tree of plain JavaScript objects. Each object describes an element that should exist on screen: its type, its properties, and its children. These objects are the React elements produced by JSX compilation.

```javascript
// This JSX:
<div className="container">
  <h1>Products</h1>
  <ul>
    <li>Keyboard</li>
    <li>Mouse</li>
  </ul>
</div>

// Produces this object tree (simplified):
{
  type: "div",
  props: {
    className: "container",
    children: [
      {
        type: "h1",
        props: { children: "Products" }
      },
      {
        type: "ul",
        props: {
          children: [
            { type: "li", props: { children: "Keyboard" } },
            { type: "li", props: { children: "Mouse" } }
          ]
        }
      }
    ]
  }
}
```

This tree is not a copy of the real DOM. It does not contain DOM nodes, event listeners, computed styles, or layout information. It is a lightweight description, a blueprint that tells React what the DOM should look like. The real DOM is the browser's internal representation: a complex structure with hundreds of properties per node, layout calculations, paint layers, and accessibility tree entries. A React element object has approximately five fields. This asymmetry is the source of the virtual DOM's efficiency: comparing and creating JavaScript objects is orders of magnitude cheaper than creating and modifying DOM nodes.

### What the Virtual DOM Is Not

The virtual DOM is not a performance optimization in the absolute sense. Direct, targeted DOM manipulation (knowing exactly which node to change and changing only that node) will always be faster than creating an entire object tree, diffing it against a previous tree, and then applying changes. The virtual DOM is a **programming model optimization**: it allows developers to write declarative code (describe the desired UI) while React handles the imperative DOM operations. The performance trade-off is that React does slightly more work than the theoretical minimum, but the developer does dramatically less work and produces fewer bugs.

> **See Also:** Part 2, Chapter 1, Section 1.3 for the declarative programming model that the virtual DOM enables.

---

## 3.2 Creating the Virtual DOM Tree from Your Components

When React renders your application, it starts at the root component and recursively evaluates every component in the tree. Each component function call produces a subtree of React elements, which may contain references to other components that must themselves be evaluated.

```javascript
function App() {
  return (
    <main>
      <Header title="Store" />
      <ProductList products={products} />
    </main>
  );
}

function Header({ title }) {
  return <h1 className="header">{title}</h1>;
}

function ProductList({ products }) {
  return (
    <ul>
      {products.map((p) => (
        <ProductItem key={p.id} product={p} />
      ))}
    </ul>
  );
}

function ProductItem({ product }) {
  return <li className="product">{product.name}</li>;
}
```

React processes this tree top-down:

```
Step 1: Call App()
  Returns: <main> with children <Header> and <ProductList>

Step 2: Encounter <Header title="Store">
  Call Header({ title: "Store" })
  Returns: <h1 className="header">Store</h1>
  This is a host element (string type). No further component calls needed.

Step 3: Encounter <ProductList products={[...]}>
  Call ProductList({ products: [...] })
  Returns: <ul> with children [<ProductItem>, <ProductItem>, ...]

Step 4: For each <ProductItem>:
  Call ProductItem({ product: { id: 1, name: "Keyboard" } })
  Returns: <li className="product">Keyboard</li>
```

After all component functions have been called, the result is a complete tree of host elements (strings like `"div"`, `"h1"`, `"li"`). This is the virtual DOM tree for the current render. React stores this tree and, on subsequent renders, produces a new tree and compares it to the previous one.

### The Element Tree vs the Fiber Tree

The element tree (virtual DOM) produced by component calls is ephemeral: it is created during each render and discarded after diffing. React's internal working structure is the **fiber tree**, a persistent, mutable data structure where each node (fiber) holds additional information: the component's state, a reference to the underlying DOM node, pointers to parent/child/sibling fibers, effect flags, and priority lane assignments.

```
Element Tree (immutable, recreated each render):
  { type: "div", props: { children: [...] } }

Fiber Tree (mutable, persists across renders):
  FiberNode {
    type: "div",
    stateNode: <actual DOM div>,
    memoizedProps: { children: [...] },
    memoizedState: null,
    child: FiberNode { ... },
    sibling: FiberNode { ... },
    return: FiberNode { ... },   // parent pointer
    alternate: FiberNode { ... }, // previous version
    flags: 0,                     // effect flags (Update, Placement, etc.)
    lanes: 0,                     // priority
  }
```

> **See Also:** Part 2, Chapter 4 for the complete Fiber architecture, including the work loop, double buffering, and priority lanes.

---

## 3.3 The Diffing Algorithm: How React Compares Two Trees

When a component's state or props change, React produces a new element tree and must determine what changed. The naive approach to comparing two trees (finding the minimum edit distance) has O(n^3) time complexity. For a tree of 1,000 elements, that is one billion operations, far too slow for interactive UI at 60 frames per second.

React uses a heuristic algorithm that operates in O(n) time by making two assumptions (covered in detail in Section 3.4). The algorithm processes the tree top-down, comparing elements at each position:

```
Old Tree:              New Tree:
  <div>                  <div>
    <h1>Title</h1>         <h1>New Title</h1>    ← Same type, diff props
    <p>Content</p>         <span>Content</span>   ← Different type!
    <Footer />             <Footer />             ← Same type, diff recursively
  </div>                 </div>
```

For each pair of old and new elements at the same position, React follows this decision tree:

1. **Old element is null, new element exists**: Mount the new element (create DOM node, insert).
2. **Old element exists, new element is null**: Unmount the old element (destroy DOM node, cleanup).
3. **Old and new have different types**: Unmount old, mount new (tear-down-and-rebuild).
4. **Old and new have the same type**: Keep the existing DOM node/component instance, update changed props, recurse into children.

---

## 3.4 The Two Assumptions That Make O(n) Diffing Possible

### Assumption 1: Elements of Different Types Produce Different Trees

When React encounters two elements with different types at the same position, it does not attempt to find similarities between their subtrees. It destroys the entire old subtree and builds the new one from scratch.

This assumption prunes the comparison space dramatically. Instead of comparing every node in the old subtree against every node in the new subtree (O(n^2) or worse), React simply discards the old subtree in O(m) time (where m is the size of the old subtree) and creates the new subtree in O(k) time (where k is the size of the new subtree). The total work is O(m + k), which is linear in the size of the trees involved.

This heuristic is correct for nearly all real-world UI patterns. A `<div>` subtree and a `<section>` subtree, while potentially similar in structure, almost certainly represent different semantic content. A `<SearchResults>` component and a `<ShoppingCart>` component at the same position definitely represent different UI. The rare case where two different types produce identical DOM structures is an acceptable trade-off for the algorithmic simplification.

### Assumption 2: Keys Provide Stable Child Identity

Without additional information, React can only match children by their position (index) in the parent's children list. Keys provide a developer-supplied identity that allows React to match children across renders regardless of their position. This transforms list diffing from a positional comparison (which breaks on insertions) to an identity-based comparison (which handles reordering efficiently).

```javascript
// Without keys: positional matching
// Old:  [A, B, C]       positions: [0, 1, 2]
// New:  [X, A, B, C]    positions: [0, 1, 2, 3]
// React sees: position 0 changed (A->X), position 1 changed (B->A),
//             position 2 changed (C->B), position 3 is new (C)
// Result: 4 DOM operations (3 updates + 1 insert)

// With keys: identity matching
// Old:  [A(key=a), B(key=b), C(key=c)]
// New:  [X(key=x), A(key=a), B(key=b), C(key=c)]
// React sees: key=x is new (insert), key=a/b/c are unchanged (reorder)
// Result: 1 DOM operation (1 insert at position 0)
```

---

## 3.5 Element Type Changes: Tear Down and Rebuild

When React detects that the element type at a given position has changed, it performs a complete tear-down of the old subtree and a fresh mount of the new subtree.

### Host Element Type Change

```javascript
// Render 1
function App() {
  return <div className="wrapper"><Counter /></div>;
}

// Render 2 (type changed from div to section)
function App() {
  return <section className="wrapper"><Counter /></section>;
}
```

React's response:
1. Unmount the `<div>` and its entire subtree (including the `<Counter>` component instance)
2. Counter's cleanup effects run; Counter's state is destroyed
3. Create a new `<section>` DOM node
4. Mount a new `<Counter>` instance inside it (with fresh initial state)

### Component Type Change

```javascript
function App({ showAdmin }) {
  return (
    <main>
      {showAdmin ? <AdminPanel /> : <UserPanel />}
    </main>
  );
}
```

When `showAdmin` changes from `true` to `false`, React sees that the element type at that position changed from `AdminPanel` to `UserPanel`. Even if both components render identical DOM structures, React tears down `AdminPanel` (destroying all its state) and mounts a fresh `UserPanel`.

This behavior is important for state isolation. If React tried to reuse the `AdminPanel` instance for `UserPanel`, state from the admin context would leak into the user context, creating security and correctness issues.

```javascript
// Demonstrating state loss on type change
function FormA() {
  const [value, setValue] = useState("FormA initial");
  return <input value={value} onChange={(e) => setValue(e.target.value)} />;
}

function FormB() {
  const [value, setValue] = useState("FormB initial");
  return <input value={value} onChange={(e) => setValue(e.target.value)} />;
}

function App() {
  const [useA, setUseA] = useState(true);
  return (
    <div>
      {/* Toggling between FormA and FormB destroys state each time */}
      {useA ? <FormA /> : <FormB />}
      <button onClick={() => setUseA((prev) => !prev)}>Toggle</button>
    </div>
  );
}
```

Every toggle destroys the current form's state and creates a fresh instance. The input field resets to the initial value each time, because the component type changed and React performed a full tear-down-and-rebuild.

> **Common Mistake:** Developers sometimes define components inside other components' render functions. This creates a new function reference on every render, causing React to see a "type change" at that position on every render, destroying and recreating the entire subtree (including all state) on every update:
> ```javascript
> function App() {
>   // Bug: SearchBar is redefined on every render.
>   // React sees a "new" component type each time.
>   function SearchBar() {
>     const [query, setQuery] = useState("");
>     return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
>   }
>
>   return <SearchBar />;
>   // The input loses its value on every App re-render!
> }
>
> // Fix: define SearchBar outside App
> function SearchBar() {
>   const [query, setQuery] = useState("");
>   return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
> }
>
> function App() {
>   return <SearchBar />;
> }
> ```

---

## 3.6 Same Type Elements: Update Props, Recurse Children

When the old and new elements have the same type, React preserves the existing DOM node (for host elements) or component instance (for component elements) and performs a targeted update.

### Same-Type Host Elements

React compares the old and new props and updates only the attributes that changed:

```javascript
// Old element
<div className="card" style={{ color: "red", fontSize: 14 }} tabIndex={0} />

// New element
<div className="card active" style={{ color: "blue", fontSize: 14 }} />

// React's DOM operations:
// 1. Update className: "card" -> "card active"
// 2. Update style.color: "red" -> "blue"
// 3. style.fontSize unchanged (14 === 14), skip
// 4. Remove tabIndex attribute (present in old, absent in new)
```

React does not replace the DOM node. The same `<div>` element persists in the browser; only its changed attributes are modified. This is significantly cheaper than destroying and recreating the node.

### Same-Type Component Elements

When React encounters the same component type at the same position, it keeps the existing component instance (preserving state) and passes the new props:

```javascript
// Render 1
<UserAvatar name="Alice" size={48} />

// Render 2
<UserAvatar name="Bob" size={48} />

// React's behavior:
// 1. Keep the existing UserAvatar instance (state is preserved)
// 2. Update props: name changes from "Alice" to "Bob"
// 3. Call the UserAvatar function with new props
// 4. Diff the returned element tree against the previous return
```

This is the mechanism that allows component state to persist across renders. As long as the component type and position in the tree remain the same, React treats it as the same instance.

### Recursing on Children

After handling the element itself, React recursively processes its children. For a fixed set of children (not a dynamic list), React compares children by position:

```javascript
// Old
<ul>
  <li>Apple</li>
  <li>Banana</li>
</ul>

// New
<ul>
  <li>Apple</li>
  <li>Cherry</li>    // Position 1 changed: update text "Banana" -> "Cherry"
  <li>Date</li>      // Position 2 is new: mount
</ul>

// React's operations:
// Position 0: same type (li), same content ("Apple"). No change.
// Position 1: same type (li), content changed. Update text node.
// Position 2: new element. Create <li>, insert text "Date", append to <ul>.
```

This positional comparison works well for static structures. For dynamic lists (where items can be inserted, removed, or reordered), positional matching produces incorrect and inefficient results. This is where keys become essential.

---

## 3.7 Keys: Why They Exist and How They Work

Keys are string identifiers that tell React which child element corresponds to which item in a list. They transform child reconciliation from positional matching to identity-based matching.

### The Problem Keys Solve

Consider a list where a new item is inserted at the beginning:

```javascript
// Render 1
<ul>
  <li>Banana</li>
  <li>Cherry</li>
</ul>

// Render 2 (Apple inserted at position 0)
<ul>
  <li>Apple</li>
  <li>Banana</li>
  <li>Cherry</li>
</ul>
```

**Without keys (positional matching):**
- Position 0: `<li>Banana</li>` vs `<li>Apple</li>` — type is same, update text content
- Position 1: `<li>Cherry</li>` vs `<li>Banana</li>` — type is same, update text content
- Position 2: nothing vs `<li>Cherry</li>` — mount new element

React performs three DOM operations: two text updates and one insertion. Every existing element is unnecessarily modified.

**With keys (identity matching):**

```javascript
// Render 1
<ul>
  <li key="banana">Banana</li>
  <li key="cherry">Cherry</li>
</ul>

// Render 2
<ul>
  <li key="apple">Apple</li>
  <li key="banana">Banana</li>
  <li key="cherry">Cherry</li>
</ul>
```

- Key `"apple"`: not in old list — mount new element at position 0
- Key `"banana"`: found in old list — same content, move to position 1 (or keep; the DOM node is reused)
- Key `"cherry"`: found in old list — same content, move to position 2

React performs one DOM operation: insert the new `<li>Apple</li>` at the beginning. The existing elements are left untouched.

### How React Uses Keys Internally

When diffing a list of children that have keys, React builds a map from key to old fiber/element. For each new child, it looks up the key in the map:

```
Old children map:  { "banana": FiberNode(...), "cherry": FiberNode(...) }

New children list:  ["apple", "banana", "cherry"]

Processing:
  "apple"  → not in map → create new fiber, mark as Placement
  "banana" → found in map → reuse fiber, check if props changed
  "cherry" → found in map → reuse fiber, check if props changed

Remaining in map after processing: (none)
Any remaining old fibers would be marked for Deletion.
```

This map-based lookup is O(1) per child (amortized), making the entire list diff O(n) where n is the number of children.

### Keys and State Preservation

Keys control whether React considers two elements at different positions to be "the same instance." This directly affects state:

```javascript
function ChatRoom({ roomId }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const connection = connectToRoom(roomId);
    connection.onMessage((msg) => setMessages((prev) => [...prev, msg]));
    return () => connection.disconnect();
  }, [roomId]);

  return <div>{messages.map((m) => <p key={m.id}>{m.text}</p>)}</div>;
}

function App() {
  const [currentRoom, setCurrentRoom] = useState("general");

  return (
    <div>
      {/* Without key: switching rooms keeps the old ChatRoom instance.
          State (messages) persists incorrectly across rooms. */}
      <ChatRoom roomId={currentRoom} />

      {/* With key: switching rooms creates a fresh ChatRoom instance.
          Old state is destroyed, new connection is established. */}
      <ChatRoom key={currentRoom} roomId={currentRoom} />
    </div>
  );
}
```

Adding `key={currentRoom}` to `ChatRoom` forces React to treat each room as a distinct instance. When `currentRoom` changes, React unmounts the old `ChatRoom` (clearing messages, disconnecting) and mounts a fresh one. Without the key, React sees the same component type at the same position and reuses the instance, leaving stale messages from the previous room on screen.

---

## 3.8 Common Key Mistakes That Destroy Performance

### Mistake 1: Using Array Index as Key

```javascript
function TodoList({ todos }) {
  return (
    <ul>
      {todos.map((todo, index) => (
        // Anti-pattern: index as key
        <TodoItem key={index} todo={todo} />
      ))}
    </ul>
  );
}
```

When items are reordered, inserted at the beginning, or deleted from the middle, the index-to-content mapping changes. React matches by key, so key `0` is matched to whatever item is now at index 0, even if that is a completely different item. This causes two categories of problems:

**Performance degradation:** Every item after the insertion/deletion point appears "changed" to React, triggering unnecessary prop comparisons, re-renders, and DOM updates.

**State corruption:** Component state is associated with keys. If `TodoItem` has local state (an input field, an animation state, a checkbox), that state follows the key, not the content. When items shift, the state stays at the old index position, creating visible bugs:

```javascript
// Scenario: user types "hello" in the first todo's input field
// State: key=0 has input value "hello"

// User adds a new todo at the beginning of the list
// Now: key=0 maps to the NEW item, but still has input value "hello"
// The old first item (now at key=1) loses its input value
```

> **Common Mistake:** Developers often rationalize index keys with "my list never changes order." Requirements evolve. A list that is static today may gain sorting, filtering, or drag-and-drop tomorrow. Using stable IDs from the data source (database IDs, UUIDs) as keys is always safer and costs nothing in performance.

### Mistake 2: Using Random Values as Keys

```javascript
function ItemList({ items }) {
  return (
    <ul>
      {items.map((item) => (
        // Anti-pattern: new random key on every render
        <li key={Math.random()}>{item.name}</li>
      ))}
    </ul>
  );
}
```

A new random value is generated on every render, so every key is new every time. React sees no matching keys between renders and unmounts every old element, then mounts every new element from scratch. This is the worst possible performance: every render destroys and rebuilds the entire list, losing all component state and DOM state (scroll position, focus, input values).

### Mistake 3: Duplicate Keys

```javascript
function TagList({ tags }) {
  return (
    <div>
      {tags.map((tag) => (
        // Bug if tags contains duplicates: key="react" appears twice
        <span key={tag}>{tag}</span>
      ))}
    </div>
  );
}
```

When React encounters duplicate keys, it cannot reliably match elements. The behavior is undefined: some elements may not update, others may be incorrectly reused, and React will emit a development-mode warning. The fix is to ensure keys are unique within each sibling list (using a combination of value and index if necessary, or deduplicating the data).

### The Correct Approach

```javascript
function ProductList({ products }) {
  return (
    <ul>
      {products.map((product) => (
        // Correct: stable, unique ID from the data source
        <ProductCard key={product.id} product={product} />
      ))}
    </ul>
  );
}
```

If items do not have an ID, generate one when the item is created (not during rendering):

```javascript
function addTodo(text) {
  return {
    id: crypto.randomUUID(), // Generated once at creation time
    text,
    done: false,
  };
}
```

---

## 3.9 Exercise: Manually Diff Two Virtual DOM Trees on Paper

### Problem Statement

Given the following two virtual DOM trees (representing consecutive renders of the same component), determine the exact set of DOM operations React will perform. Assume all list items have keys as shown.

**Render 1 (old tree):**

```javascript
<div className="app">
  <h1>Shopping List</h1>
  <input className="search" placeholder="Filter..." />
  <ul>
    <li key="milk">Milk</li>
    <li key="eggs">Eggs</li>
    <li key="bread">Bread</li>
  </ul>
  <footer>3 items</footer>
</div>
```

**Render 2 (new tree):**

```javascript
<div className="app dark">
  <h1>Shopping List</h1>
  <ul>
    <li key="juice">Orange Juice</li>
    <li key="milk">Milk</li>
    <li key="bread">Bread (whole wheat)</li>
  </ul>
  <p className="summary">3 items remaining</p>
</div>
```

### Solution

Walk through the tree top-down, comparing old and new elements at each position:

**Root: `<div className="app">` vs `<div className="app dark">`**
- Same type (`div`). Keep the DOM node.
- `className` changed: `"app"` → `"app dark"`. **DOM operation: update className attribute.**

**Child position 0: `<h1>Shopping List</h1>` vs `<h1>Shopping List</h1>`**
- Same type, same content. **No DOM operation.**

**Child position 1: `<input className="search" ...>` vs `<ul>...</ul>`**
- Different types (`input` vs `ul`). **Tear down and rebuild.**
- **DOM operations:** Remove the `<input>` node. Create a new `<ul>` node with its children (see below). Insert `<ul>` at position 1.

**New `<ul>` children (keyed list comparison is not applicable here because the `<ul>` is newly created):**
- All children are freshly mounted:
  - Create `<li>` with text "Orange Juice"
  - Create `<li>` with text "Milk"
  - Create `<li>` with text "Bread (whole wheat)"
- **DOM operations:** 3 createElement + 3 appendChild

**Child position 2: `<ul>...</ul>` (old) vs `<p className="summary">...</p>` (new)**
- Different types (`ul` vs `p`). **Tear down and rebuild.**
- **DOM operations:** Remove old `<ul>` and all its `<li>` children. Create `<p>`, set className to "summary", set text to "3 items remaining". Insert at position 2.

**Child position 3: `<footer>3 items</footer>` vs (nothing)**
- Old element exists, new element does not. **Unmount.**
- **DOM operation:** Remove `<footer>` node.

### Summary of DOM Operations

| # | Operation | Target |
|---|-----------|--------|
| 1 | Update attribute | `div.className`: "app" → "app dark" |
| 2 | Remove node | `<input>` at position 1 |
| 3 | Create + insert node | `<ul>` with 3 `<li>` children at position 1 |
| 4 | Remove node | Old `<ul>` with 3 `<li>` children at position 2 |
| 5 | Create + insert node | `<p className="summary">` at position 2 |
| 6 | Remove node | `<footer>` at position 3 |

**Important observation:** The old `<ul>` (at position 2 in the old tree) and the new `<ul>` (at position 1 in the new tree) contain overlapping items (`milk`, `bread`). However, because they appear at different positions and the element at the old position 1 was an `<input>` (not a `<ul>`), React does not attempt to match them. The positional mismatch means the old `<ul>` is treated as a completely separate element from the new `<ul>`. The keyed items `milk` and `bread` inside the old `<ul>` are destroyed and recreated inside the new `<ul>`.

This illustrates a critical insight: **keys only help within the same parent element.** They do not enable cross-parent matching. Restructuring the tree (moving a list to a different position) causes a full rebuild of that list, regardless of keys.

### Key Takeaway

Manual diffing reveals that React's algorithm is mechanical and predictable. At each tree position, React makes one of four decisions: skip (nothing changed), update (same type, different props), tear-down-and-rebuild (different type), or mount/unmount (element added/removed). Understanding this decision process allows developers to predict when state will be preserved versus destroyed, and to structure their component trees to avoid unnecessary rebuilds. The exercise also demonstrates that structural changes to the tree (moving elements to different positions) are more expensive than content changes within a stable structure.

---

## Chapter Summary

The virtual DOM is a tree of plain JavaScript objects that describes the desired UI. React builds it by recursively calling component functions, then diffs it against the previous tree using an O(n) heuristic algorithm. Two assumptions make this efficiency possible: different element types produce different trees (triggering tear-down-and-rebuild), and developer-supplied keys provide stable child identity (enabling efficient list reconciliation). Keys must be stable and unique; using array indices or random values as keys causes performance degradation and state corruption. Understanding the diffing algorithm allows developers to predict exactly when React will preserve state, when it will destroy and recreate components, and how to structure component trees for optimal reconciliation.

## Further Reading

- [Reconciliation (React Legacy Documentation)](https://legacy.reactjs.org/docs/reconciliation.html) — React's official explanation of the diffing algorithm and its heuristics
- [Preserving and Resetting State (React Documentation)](https://react.dev/learn/preserving-and-resetting-state) — official guide to how position and keys affect state
- [Index as a Key is an Anti-Pattern (Robin Pokorny)](https://robinpokorny.com/blog/index-as-a-key-is-an-anti-pattern/) — the definitive article on why index keys are problematic
- [React Reconciliation: How It Works and Why Should We Care (developerway.com)](https://www.developerway.com/posts/reconciliation-in-react) — visual, in-depth reconciliation walkthrough
- [Virtual DOM is Pure Overhead (Rich Harris / Svelte Blog)](https://svelte.dev/blog/virtual-dom-is-pure-overhead) — the canonical critique of the virtual DOM approach
- [React Fiber Architecture (Andrew Clark)](https://github.com/acdlite/react-fiber-architecture) — technical overview of how Fiber builds on the virtual DOM model
