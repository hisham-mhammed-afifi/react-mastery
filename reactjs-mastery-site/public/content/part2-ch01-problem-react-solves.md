# Part 2, Chapter 1: The Problem React Solves

## What You Will Learn

- Identify the specific technical problems that imperative DOM manipulation causes at scale
- Contrast the jQuery mental model ("find elements, do things to them") with the React mental model ("describe UI for this state")
- Explain declarative UI programming and articulate why describing "what" is superior to specifying "how" for complex interfaces
- Apply the formula `UI = f(state)` to reason about component behavior
- Trace data flow through a unidirectional architecture and explain why one-way flow produces more predictable applications than two-way binding
- Build a non-trivial UI both imperatively and declaratively to experience the difference firsthand

---

## 1.1 The Pain of Imperative DOM Manipulation

Every web application begins as a simple document. The browser parses HTML, constructs the Document Object Model (DOM), and renders pixels on screen. When the application needs to change what the user sees, code must modify the DOM: insert nodes, remove nodes, change attributes, update text content. This is **imperative DOM manipulation**, the process of giving the browser step-by-step instructions for transitioning from one visual state to another.

At small scale, imperative DOM manipulation is straightforward. Consider a counter:

```javascript
// Imperative counter: step-by-step DOM instructions
const counterDisplay = document.getElementById("counter");
const incrementButton = document.getElementById("increment");
const decrementButton = document.getElementById("decrement");

let count = 0;

function updateDisplay() {
  counterDisplay.textContent = count;
  // Must manually handle every visual consequence of the state change
  counterDisplay.classList.toggle("negative", count < 0);
  counterDisplay.classList.toggle("zero", count === 0);
  decrementButton.disabled = count <= -10;
  incrementButton.disabled = count >= 10;
}

incrementButton.addEventListener("click", () => {
  count += 1;
  updateDisplay();
});

decrementButton.addEventListener("click", () => {
  count -= 1;
  updateDisplay();
});
```

This works, but notice the structural problem: the application state (`count`) and the DOM state (text content, CSS classes, disabled attributes) are two separate things that must be manually synchronized. The `updateDisplay` function is the synchronization bridge. Every time state changes, the developer must remember to call this function, and the function must account for every visual consequence of every possible state value.

### The Synchronization Problem at Scale

The counter has one piece of state and five DOM effects. A real application has hundreds of state values and thousands of DOM elements. The synchronization burden grows combinatorially:

```javascript
// A simplified "real-world" imperative UI: user profile editor
function updateProfileUI(user, permissions, networkStatus) {
  // Name field
  document.getElementById("name-input").value = user.name;
  document.getElementById("name-input").disabled = !permissions.canEdit;
  document.getElementById("name-error").style.display =
    user.name.length === 0 ? "block" : "none";

  // Avatar
  const avatar = document.getElementById("avatar");
  avatar.src = user.avatarUrl || "/default-avatar.png";
  avatar.classList.toggle("loading", user.avatarUploading);

  // Save button
  const saveBtn = document.getElementById("save-btn");
  saveBtn.disabled =
    !permissions.canEdit || networkStatus === "offline" || user.saving;
  saveBtn.textContent = user.saving ? "Saving..." : "Save";
  saveBtn.classList.toggle("btn-disabled", saveBtn.disabled);

  // Status bar
  const status = document.getElementById("status");
  if (networkStatus === "offline") {
    status.textContent = "You are offline";
    status.className = "status-bar offline";
  } else if (user.saving) {
    status.textContent = "Saving changes...";
    status.className = "status-bar saving";
  } else if (user.lastSaved) {
    status.textContent = `Last saved ${formatTime(user.lastSaved)}`;
    status.className = "status-bar saved";
  } else {
    status.textContent = "";
    status.className = "status-bar";
  }

  // Permissions banner
  const banner = document.getElementById("permissions-banner");
  if (!permissions.canEdit) {
    banner.style.display = "block";
    banner.textContent = "You have read-only access";
  } else {
    banner.style.display = "none";
  }

  // ... and this continues for every element on the page
}
```

This function has several critical weaknesses:

1. **It must be called after every state change.** Forget to call it, and the UI becomes stale. There is no mechanism to enforce this.

2. **It touches every element regardless of what changed.** If only `user.name` changed, the function still recalculates the avatar, save button, status bar, and permissions banner. Optimizing this requires tracking which specific state values changed, adding significant complexity.

3. **The DOM is the implicit source of truth.** If another piece of code modifies the save button directly (perhaps a third-party library), the `updateProfileUI` function has no way to detect or correct that interference.

4. **Adding new state requires updating the function.** Every new feature (undo support, draft indicators, collaboration cursors) adds more branches and more DOM operations to an already fragile function.

> **Common Mistake:** Developers working imperatively often attempt to optimize by only updating "what changed" rather than re-rendering everything. This leads to complex diffing logic scattered throughout the application. Each optimization introduces potential for missed updates, creating subtle bugs where the DOM drifts out of sync with application state. React was created precisely to automate this optimization.

### State Scattered Across the DOM

The most insidious problem with imperative DOM manipulation is that the DOM itself becomes an implicit state container. When code reads values from the DOM to make decisions, the DOM is no longer just a view; it is a database:

```javascript
// Anti-pattern: reading state from the DOM
function handleSubmit() {
  const name = document.getElementById("name-input").value;
  const email = document.getElementById("email-input").value;
  const isAdmin = document.getElementById("admin-checkbox").checked;

  // The DOM is the source of truth for application data.
  // If any other code modifies these elements, this function
  // reads corrupted state without knowing it.

  if (isAdmin && !name) {
    document.getElementById("name-error").style.display = "block";
    document.getElementById("name-error").textContent =
      "Admin users must have a name";
    return;
  }

  submitForm({ name, email, isAdmin });
}
```

This pattern means the application has no single, authoritative representation of its state. State lives partly in JavaScript variables, partly in DOM element properties, and partly in CSS classes. Debugging requires inspecting all three simultaneously.

---

## 1.2 jQuery vs React: A Mental Model Shift

jQuery, released in 2006, solved the immediate problems of its era: inconsistent browser APIs, verbose DOM selection syntax, and painful cross-browser compatibility issues. Its core mental model can be summarized in one sentence:

**jQuery: "Find elements in the DOM, then do things to them."**

```javascript
// The jQuery mental model: selection + mutation
$(".notification-badge")
  .text(unreadCount)
  .toggleClass("hidden", unreadCount === 0)
  .toggleClass("urgent", unreadCount > 10);

$(".message-list")
  .empty()
  .append(
    messages.map(
      (msg) =>
        `<li class="message ${msg.read ? "read" : "unread"}">
          <span class="sender">${msg.sender}</span>
          <span class="preview">${msg.preview}</span>
        </li>`
    )
  );

$(".compose-btn").prop("disabled", !isOnline);
```

jQuery was never designed for building applications. It was a utility library for DOM manipulation, and it was excellent at that. The problems emerged when developers used jQuery as an application framework.

### Why jQuery Broke Down at Scale

**No component model.** jQuery applications had no built-in way to encapsulate a piece of UI with its behavior and state. Developers created ad-hoc patterns (jQuery plugins, widget factories), but these lacked standardized interfaces, lifecycle management, or state isolation.

**No state management.** Application state lived wherever the developer happened to put it: global variables, DOM attributes, data attributes, closures inside event handlers. There was no enforced pattern for how state flows through the application.

**Untracked dependencies.** When multiple jQuery operations targeted the same DOM element, there was no mechanism to detect conflicts or enforce ordering. Plugin A might add a class that Plugin B's CSS selector depends on, creating invisible coupling:

```javascript
// Two independent jQuery modules unknowingly coupled
// Module A: notification system
$(".header-badge").addClass("has-notifications").text(count);

// Module B: theme system (written by a different developer)
// Uses .has-notifications to position the theme toggle
$(".header-badge.has-notifications").css("margin-right", "20px");

// Module C: accessibility overlay
// Removes classes it considers "visual-only"
$(".header-badge").removeClass("has-notifications"); // Breaks Module B
```

**The DOM as the runtime database.** In jQuery applications, the inspectable DOM at runtime bore little resemblance to the original HTML source. Understanding the current state of the application required inspecting live DOM nodes, reading data attributes, and checking CSS computed styles. The application's behavior could not be understood from reading the source code alone.

### The React Mental Model

React's mental model is fundamentally different:

**React: "Describe what the UI should look like for this state."**

```javascript
function NotificationBadge({ unreadCount }) {
  if (unreadCount === 0) return null;

  return (
    <span className={`badge ${unreadCount > 10 ? "urgent" : ""}`}>
      {unreadCount}
    </span>
  );
}

function MessageList({ messages }) {
  return (
    <ul className="message-list">
      {messages.map((msg) => (
        <li key={msg.id} className={`message ${msg.read ? "read" : "unread"}`}>
          <span className="sender">{msg.sender}</span>
          <span className="preview">{msg.preview}</span>
        </li>
      ))}
    </ul>
  );
}

function ComposeButton({ isOnline }) {
  return (
    <button className="compose-btn" disabled={!isOnline}>
      Compose
    </button>
  );
}
```

Notice the structural differences:

| Aspect | jQuery | React |
|--------|--------|-------|
| Core operation | Select and mutate DOM nodes | Describe UI for given state |
| State location | DOM, globals, closures | Explicit state (useState, props) |
| Update mechanism | Manual DOM operations | Automatic reconciliation |
| Component model | Ad-hoc plugins | First-class components |
| Data flow | Uncontrolled | Unidirectional (props down) |
| Side effects | Anywhere, anytime | Quarantined in useEffect |
| Debugging | Inspect live DOM | Inspect state and props |

The shift from jQuery to React is not merely a technology swap. It is a paradigm shift from **imperative, mutation-based programming** to **declarative, state-driven programming**.

> **Common Mistake:** Developers transitioning from jQuery to React often continue thinking imperatively: "When the user clicks, find the element and change its class." The React mental model requires a different approach: "When the user clicks, update state. The component re-renders with the new state, and the class is determined by the state value." Reaching for `document.querySelector` inside a React component is almost always a sign of imperative thinking leaking into a declarative codebase.

---

## 1.3 Declarative UI: Describe What, Not How

The term "declarative" is used broadly in programming, but in the context of UI development, it has a precise meaning: **declarative UI code describes the desired end-state of the interface rather than the sequence of operations required to achieve it.**

### Imperative vs Declarative: A Precise Comparison

Consider rendering a filtered, sorted list of products:

```javascript
// Imperative: specify every step
function renderProducts(products, filterCategory, sortBy) {
  const container = document.getElementById("product-list");

  // Step 1: Clear existing content
  container.innerHTML = "";

  // Step 2: Filter
  const filtered = [];
  for (let i = 0; i < products.length; i++) {
    if (
      filterCategory === "all" ||
      products[i].category === filterCategory
    ) {
      filtered.push(products[i]);
    }
  }

  // Step 3: Sort
  filtered.sort((a, b) => {
    if (sortBy === "price") return a.price - b.price;
    if (sortBy === "name") return a.name.localeCompare(b.name);
    return 0;
  });

  // Step 4: Create DOM elements
  for (const product of filtered) {
    const li = document.createElement("li");
    li.className = "product-item";

    const nameSpan = document.createElement("span");
    nameSpan.className = "product-name";
    nameSpan.textContent = product.name;

    const priceSpan = document.createElement("span");
    priceSpan.className = "product-price";
    priceSpan.textContent = `$${product.price.toFixed(2)}`;

    if (product.onSale) {
      const badge = document.createElement("span");
      badge.className = "sale-badge";
      badge.textContent = "SALE";
      li.appendChild(badge);
    }

    li.appendChild(nameSpan);
    li.appendChild(priceSpan);
    container.appendChild(li);
  }

  // Step 5: Update the count display
  document.getElementById("product-count").textContent =
    `${filtered.length} products`;
}
```

```javascript
// Declarative: describe the desired result
function ProductList({ products, filterCategory, sortBy }) {
  const filtered = products
    .filter(
      (p) => filterCategory === "all" || p.category === filterCategory
    )
    .toSorted((a, b) => {
      if (sortBy === "price") return a.price - b.price;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return 0;
    });

  return (
    <div>
      <p className="product-count">{filtered.length} products</p>
      <ul className="product-list">
        {filtered.map((product) => (
          <li key={product.id} className="product-item">
            {product.onSale && <span className="sale-badge">SALE</span>}
            <span className="product-name">{product.name}</span>
            <span className="product-price">
              ${product.price.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

The declarative version is not just shorter; it differs structurally in several important ways:

1. **No reference to the previous state.** The imperative version must clear the container (`innerHTML = ""`) before rebuilding. The declarative version has no concept of "previous"; it describes the current state, and React handles the transition.

2. **No DOM API calls.** The declarative version never calls `createElement`, `appendChild`, or `textContent`. It describes the desired structure, and the renderer translates that description into DOM operations.

3. **The structure mirrors the output.** Reading the declarative version reveals the visual structure immediately: a div containing a paragraph and an unordered list. The imperative version requires tracing through procedural logic to reconstruct the visual structure mentally.

4. **Data transformations are separated from DOM operations.** The filtering and sorting are pure data transformations (functional operations on arrays). The rendering is a structural description. In the imperative version, data transformation and DOM manipulation are interleaved.

### Declarative Does Not Mean Giving Up Control

A common objection is that declarative code removes the developer's ability to control precisely how updates happen. This concern is largely unfounded. React provides escape hatches for the rare situations where direct DOM access is necessary:

```javascript
function VideoPlayer({ src, isPlaying }) {
  const videoRef = useRef(null);

  // useEffect: the escape hatch for imperative operations
  useEffect(() => {
    if (isPlaying) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  return <video ref={videoRef} src={src} />;
}
```

The `play()` and `pause()` methods on the `<video>` element are inherently imperative; there is no declarative equivalent. React acknowledges this by providing refs and effects as controlled channels for imperative code. The key difference from jQuery is that these imperative operations are scoped to individual components and triggered by state changes, not scattered throughout the application.

> **See Also:** Part 1, Chapter 6, Section 6.7 for AbortController patterns in useEffect, and Part 2, Chapter 6 for the complete lifecycle-to-hooks mapping.

---

## 1.4 UI as a Function of State: `UI = f(state)`

The formula `UI = f(state)` is the single most important mental model in React. It states that the user interface is a deterministic output of the current application state. Given the same state, the same UI is produced every time. There is no hidden context, no accumulated mutation history, no temporal dependency.

### What the Formula Means Precisely

```
          ┌─────────────────────┐
  state ──►  Component Function  ──► UI Description (React Elements)
          └─────────────────────┘
```

The "function" in `UI = f(state)` is the component itself. The "state" includes both the component's own state (`useState`, `useReducer`) and external inputs (props, context). The "UI" is the React element tree (virtual DOM) that the component returns.

```javascript
// A component is literally a function from state to UI
function TemperatureDisplay({ celsius }) {
  // Derived values are computed from state, not stored separately
  const fahrenheit = (celsius * 9) / 5 + 32;
  const classification =
    celsius < 0 ? "freezing" :
    celsius < 15 ? "cold" :
    celsius < 25 ? "comfortable" :
    celsius < 35 ? "warm" : "hot";

  // The UI is a pure function of these values
  return (
    <div className={`temp-display ${classification}`}>
      <span className="celsius">{celsius}°C</span>
      <span className="fahrenheit">{fahrenheit.toFixed(1)}°F</span>
      <span className="classification">{classification}</span>
    </div>
  );
}
```

Notice several important properties:

**Determinism.** If `celsius` is 22, the display always shows "22°C", "71.6°F", and "comfortable". There is no scenario where the same input produces a different output.

**No temporal dependency.** The component does not care whether `celsius` was previously 10 or 30. It does not care whether this is the first render or the hundredth. It computes its output solely from the current input.

**Derived state is computed, not stored.** The `fahrenheit` and `classification` values are derived from `celsius` during each render. They are not stored as separate state that must be manually synchronized.

> **See Also:** Part 1, Chapter 8, Section 8.6 for the formal definition of pure functions and referential transparency that underpin this model.

### Why This Model Eliminates Entire Categories of Bugs

In imperative systems, bugs emerge from incorrect state transitions: the code that moves the UI from state A to state B has a defect, but the code that moves from state A to state C works fine. This means the bug is only visible for specific sequences of user actions.

In the `UI = f(state)` model, there are no transitions. There is only the current state and the resulting UI. If the UI is wrong for a given state, the bug is visible every time that state occurs, regardless of how the user arrived at it. This makes bugs more reproducible and easier to diagnose.

```javascript
// Imperative: transition-based bugs
let isOpen = false;

function toggleModal() {
  if (isOpen) {
    // Close: must reverse every DOM change from opening
    modal.classList.remove("open");
    overlay.classList.remove("visible");
    document.body.style.overflow = "";
    modal.setAttribute("aria-hidden", "true");
    // Bug: forgot to remove the escape key listener
    isOpen = false;
  } else {
    // Open
    modal.classList.add("open");
    overlay.classList.add("visible");
    document.body.style.overflow = "hidden";
    modal.setAttribute("aria-hidden", "false");
    document.addEventListener("keydown", handleEscape);
    isOpen = true;
  }
}

// Declarative: state-based, no transitions to get wrong
function Modal({ isOpen, onClose, children }) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="overlay visible" onClick={onClose}>
      <div
        className="modal open"
        role="dialog"
        aria-hidden={!isOpen}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
```

The imperative version has a bug: the escape key listener is added on open but never removed on close, causing a memory leak and potential unexpected behavior. The declarative version makes this category of bug structurally impossible because the effect cleanup runs automatically when `isOpen` changes to `false` or the component unmounts.

### The Origin: Jordan Walke and Functional Inspiration

The `UI = f(state)` model did not emerge from nowhere. React's creator, Jordan Walke, was directly inspired by functional programming concepts. At Facebook in 2011, Walke built a prototype called **FaxJS** that treated UI rendering as a function evaluation: given the current application data, compute the complete UI tree, then diff the result against the previous tree to determine minimal DOM updates.

Walke was also influenced by **XHP**, a PHP extension used internally at Facebook that allowed composable HTML-like components in server-rendered pages. XHP demonstrated that treating UI as composable function output (on the server) was practical at scale. Walke's insight was to bring this model to the client, where the DOM could be treated as a render target rather than a mutable database.

The prototype was imported into Facebook's codebase in March 2012, renamed from FaxJS to FBolt, and eventually to React. It was first deployed on Facebook's News Feed, then on Instagram's web client, and open-sourced at JSConf US in May 2013.

---

## 1.5 Unidirectional Data Flow and Why It Matters

React enforces a constraint on how data moves through an application: **data flows in one direction, from parent components to child components, through props.** This is unidirectional data flow, and it is one of React's most consequential architectural decisions.

### The Data Flow Model

```
  ┌──────────────────────────────────────────┐
  │                  App                      │
  │  state: { user, products, cart }          │
  │                                           │
  │    ┌─────────────┐   ┌────────────────┐  │
  │    │   Header     │   │  ProductList    │  │
  │    │  props: user │   │  props: products│  │
  │    └─────────────┘   │                  │  │
  │                       │  ┌────────────┐ │  │
  │                       │  │ ProductCard │ │  │
  │                       │  │ props: item │ │  │
  │                       │  └────────────┘ │  │
  │                       └────────────────┘  │
  └──────────────────────────────────────────┘

  Data flows DOWN through props.
  Events flow UP through callback props.
```

```javascript
function App() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");

  const addItem = (text) => {
    setItems((prev) => [...prev, { id: Date.now(), text, done: false }]);
  };

  const toggleItem = (id) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item
      )
    );
  };

  const filteredItems = items.filter((item) => {
    if (filter === "active") return !item.done;
    if (filter === "completed") return item.done;
    return true;
  });

  return (
    <div>
      {/* Data flows DOWN: App -> AddItemForm */}
      <AddItemForm onAdd={addItem} />

      {/* Data flows DOWN: App -> FilterBar */}
      <FilterBar current={filter} onChange={setFilter} />

      {/* Data flows DOWN: App -> ItemList -> ItemRow */}
      <ItemList items={filteredItems} onToggle={toggleItem} />
    </div>
  );
}

function ItemList({ items, onToggle }) {
  return (
    <ul>
      {items.map((item) => (
        // Data continues flowing DOWN
        <ItemRow key={item.id} item={item} onToggle={onToggle} />
      ))}
    </ul>
  );
}

function ItemRow({ item, onToggle }) {
  // Events flow UP through callback invocation
  return (
    <li
      className={item.done ? "completed" : ""}
      onClick={() => onToggle(item.id)}
    >
      {item.text}
    </li>
  );
}
```

### Why Unidirectional Flow Produces Better Applications

**Predictable state changes.** In a unidirectional architecture, every state change originates from an explicit action (a `setState` call, a dispatch). The developer can trace any UI anomaly back to its source by following the data flow upstream. This is fundamentally different from two-way binding, where a change in the view can trigger a model update, which triggers another view update, creating a cascade that is difficult to trace.

**Single source of truth.** State lives in one place (the component that owns it or an external store). There is no ambiguity about which version of the data is authoritative. In two-way binding systems, both the model and the view hold copies of the data, and disagreements between them are a constant source of bugs.

**Easier debugging.** React DevTools allow inspection of the component tree, showing each component's props and state. Because data flows in one direction, the question "why does this component show the wrong value?" always has a linear answer: trace the prop upward to the parent that supplied it.

### The Contrast: Two-Way Binding

Two-way binding, as popularized by Angular 1.x, creates a bidirectional link between the model and the view:

```javascript
// Conceptual two-way binding (Angular 1.x style)
// The input's value is bound to $scope.username
// Typing in the input updates $scope.username
// Changing $scope.username updates the input
// <input ng-model="username" />

// This seems convenient, but creates problems at scale:
// 1. Model A updates View B
// 2. View B's change triggers Model C (via a watcher)
// 3. Model C updates View D
// 4. View D triggers Model A (via another watcher)
// Result: an update cycle that is extremely difficult to trace
```

Two-way binding works well for simple forms in small applications. The problems manifest when the application grows and state relationships become complex. When any piece of state can be modified from multiple directions (user input, server response, timer callback, another component's watcher), determining why the application is in a particular state requires understanding every possible mutation path.

**The Facebook notification bug.** The canonical example of why Facebook built React: the chat notification badge would show unread messages that had already been read, or fail to update when new messages arrived. This bug persisted because the notification count, the chat window state, and the message list were synchronized through multiple bidirectional bindings. Fixing the bug in one code path would introduce it in another. The unidirectional data flow model makes this category of bug structurally difficult to create, because there is exactly one place where the notification count is computed and exactly one path through which it reaches the badge.

> **Common Mistake:** Developers sometimes confuse "unidirectional data flow" with "state can never flow upward." State does not flow upward. What flows upward are **events** (via callback props). A child component calls `onToggle(item.id)`, which is a function provided by the parent. The parent then decides whether and how to update its state. The child never directly mutates the parent's state.

### When Unidirectional Flow Seems Inconvenient

The most common complaint about unidirectional data flow is "prop drilling": passing data through multiple intermediate components that do not use it. This is a real ergonomic issue, but it has well-established solutions:

```javascript
// Prop drilling: AddItemForm needs onAdd, but it passes through Layout
function App() {
  const [items, setItems] = useState([]);
  const addItem = (text) => { /* ... */ };

  return <Layout onAdd={addItem} items={items} />;
}

function Layout({ onAdd, items }) {
  // Layout does not use onAdd; it just passes it through
  return (
    <div>
      <Sidebar />
      <Main onAdd={onAdd} items={items} />
    </div>
  );
}
```

Solutions include React Context (for widely shared data), component composition (passing components as children instead of data as props), and external state management libraries. These solutions preserve unidirectional flow while reducing the syntactic overhead of threading data through the component tree.

> **See Also:** Part 3, Chapter 4 for a complete decision tree for state management, including Context, Zustand, and Redux.

---

## 1.6 Exercise: Build a TODO App Imperatively, Then See Why React Exists

### Problem Statement

Build a functional TODO application twice: first using imperative DOM manipulation (vanilla JavaScript), then using React's declarative model. The application must support: adding items, toggling completion, deleting items, and filtering by status (all, active, completed).

### Part A: Imperative Implementation

```javascript
// Imperative TODO application: vanilla JavaScript
// HTML assumed: <input id="todo-input">, <button id="add-btn">,
// <ul id="todo-list">, <span id="count">, <div id="filters">

let todos = [];
let currentFilter = "all";

function addTodo() {
  const input = document.getElementById("todo-input");
  const text = input.value.trim();
  if (!text) return;

  todos.push({ id: Date.now(), text, done: false });
  input.value = "";
  renderTodos();
}

function toggleTodo(id) {
  const todo = todos.find((t) => t.id === id);
  if (todo) {
    todo.done = !todo.done;
    renderTodos();
  }
}

function deleteTodo(id) {
  todos = todos.filter((t) => t.id !== id);
  renderTodos();
}

function setFilter(filter) {
  currentFilter = filter;
  // Must manually update filter button styles
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === filter);
  });
  renderTodos();
}

function renderTodos() {
  const list = document.getElementById("todo-list");
  const count = document.getElementById("count");

  // Step 1: Determine which todos to show
  const filtered = todos.filter((t) => {
    if (currentFilter === "active") return !t.done;
    if (currentFilter === "completed") return t.done;
    return true;
  });

  // Step 2: Destroy all existing DOM nodes
  list.innerHTML = "";

  // Step 3: Rebuild every list item from scratch
  filtered.forEach((todo) => {
    const li = document.createElement("li");
    li.className = `todo-item ${todo.done ? "completed" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = todo.done;
    checkbox.addEventListener("change", () => toggleTodo(todo.id));

    const span = document.createElement("span");
    span.className = "todo-text";
    span.textContent = todo.text;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteTodo(todo.id));

    li.appendChild(checkbox);
    li.appendChild(span);
    li.appendChild(deleteBtn);
    list.appendChild(li);
  });

  // Step 4: Update the count
  const activeCount = todos.filter((t) => !t.done).length;
  count.textContent = `${activeCount} item${activeCount !== 1 ? "s" : ""} left`;
}

// Wire up event listeners
document.getElementById("add-btn").addEventListener("click", addTodo);
document.getElementById("todo-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTodo();
});

// Set up filter buttons
document.getElementById("filters").innerHTML = `
  <button class="filter-btn active" data-filter="all" onclick="setFilter('all')">All</button>
  <button class="filter-btn" data-filter="active" onclick="setFilter('active')">Active</button>
  <button class="filter-btn" data-filter="completed" onclick="setFilter('completed')">Completed</button>
`;

// Initial render
renderTodos();
```

**Problems with this implementation:**

1. `renderTodos()` destroys and rebuilds the entire list on every change, which kills performance for large lists and destroys any in-progress user interactions (focus, text selection, scroll position).
2. Event listeners are created and destroyed on every render, with no cleanup mechanism for the old ones (the `innerHTML = ""` approach removes them implicitly, but this is fragile).
3. The `todos` array is mutated directly (`todo.done = !todo.done`), making it impossible to implement undo or track what changed.
4. `setFilter` must manually manage the active class on filter buttons, separate from the rendering logic.
5. There is no mechanism to ensure `renderTodos()` is called after every state change. A developer adding a new feature might forget.

### Part B: Declarative React Implementation

```javascript
import { useState } from "react";

function TodoApp() {
  const [todos, setTodos] = useState([]);
  const [inputText, setInputText] = useState("");
  const [filter, setFilter] = useState("all");

  const addTodo = () => {
    const text = inputText.trim();
    if (!text) return;
    setTodos((prev) => [...prev, { id: Date.now(), text, done: false }]);
    setInputText("");
  };

  const toggleTodo = (id) => {
    setTodos((prev) =>
      prev.map((todo) =>
        todo.id === id ? { ...todo, done: !todo.done } : todo
      )
    );
  };

  const deleteTodo = (id) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
  };

  // Derived state: computed from existing state, not stored separately
  const filteredTodos = todos.filter((todo) => {
    if (filter === "active") return !todo.done;
    if (filter === "completed") return todo.done;
    return true;
  });

  const activeCount = todos.filter((t) => !t.done).length;

  return (
    <div className="todo-app">
      <div className="input-row">
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTodo()}
          placeholder="What needs to be done?"
        />
        <button onClick={addTodo}>Add</button>
      </div>

      <ul className="todo-list">
        {filteredTodos.map((todo) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            onToggle={toggleTodo}
            onDelete={deleteTodo}
          />
        ))}
      </ul>

      <div className="footer">
        <span>{activeCount} item{activeCount !== 1 ? "s" : ""} left</span>
        <FilterBar current={filter} onChange={setFilter} />
      </div>
    </div>
  );
}

function TodoItem({ todo, onToggle, onDelete }) {
  return (
    <li className={`todo-item ${todo.done ? "completed" : ""}`}>
      <input
        type="checkbox"
        checked={todo.done}
        onChange={() => onToggle(todo.id)}
      />
      <span className="todo-text">{todo.text}</span>
      <button className="delete-btn" onClick={() => onDelete(todo.id)}>
        Delete
      </button>
    </li>
  );
}

function FilterBar({ current, onChange }) {
  const filters = ["all", "active", "completed"];

  return (
    <div className="filters">
      {filters.map((f) => (
        <button
          key={f}
          className={`filter-btn ${current === f ? "active" : ""}`}
          onClick={() => onChange(f)}
        >
          {f.charAt(0).toUpperCase() + f.slice(1)}
        </button>
      ))}
    </div>
  );
}
```

### Comparing the Two Implementations

| Concern | Imperative | React |
|---------|-----------|-------|
| Rendering | Destroy and rebuild entire list | React diffs and patches only changed nodes |
| State location | Global `todos` array, mutated in place | Component state via `useState`, updated immutably |
| Re-render trigger | Manual `renderTodos()` call | Automatic on `setState` |
| Event listener cleanup | Implicit via `innerHTML = ""` | Managed by React's event delegation |
| Component encapsulation | None; all logic in one scope | `TodoItem` and `FilterBar` are isolated units |
| Filter button styling | Manual class toggle in `setFilter` | Derived from `current === f` in the JSX |
| Adding a feature | Must modify `renderTodos` and add manual sync | Add state and describe UI; React handles sync |

### Key Takeaway

The imperative version requires the developer to be the synchronization engine between state and DOM. Every state change demands explicit, complete instructions for updating the view. The React version requires the developer to describe the relationship between state and UI once. React handles the synchronization automatically, efficiently, and correctly. This is the problem React solves: it eliminates the entire class of state-to-DOM synchronization bugs by making the developer responsible only for the "what" (desired UI for each state) and never the "how" (DOM operations to achieve it).

---

## Chapter Summary

React was created to solve a specific, well-defined problem: at scale, manually synchronizing application state with DOM state produces an unmanageable number of bugs. The imperative approach (exemplified by jQuery-era code) requires developers to specify every DOM operation for every state transition, a burden that grows combinatorially with application complexity. React replaces this with a declarative model where the UI is a deterministic function of state (`UI = f(state)`), and the framework handles the DOM reconciliation automatically. Combined with unidirectional data flow, this model produces applications where state changes are predictable, traceable, and debuggable, eliminating entire categories of synchronization bugs that plagued imperative UIs.

## Further Reading

- [React as a UI Runtime (Dan Abramov)](https://overreacted.io/react-as-a-ui-runtime/) — React's conceptual model explained by a core team member
- [Writing Resilient Components (Dan Abramov)](https://overreacted.io/writing-resilient-components/) — principles for building robust React components
- [Pete Hunt: React: Rethinking Best Practices (JSConf EU 2013)](https://2013.jsconf.eu/speakers/pete-hunt-react-rethinking-best-practices.html) — the talk that introduced React's philosophy to the world
- [Jordan Walke Reactiflux Q&A Transcript](https://www.reactiflux.com/transcripts/jordan-walke) — React's creator discusses the original motivations
- [Our First 50,000 Stars (React Blog)](https://legacy.reactjs.org/blog/2016/09/28/our-first-50000-stars.html) — official history of React's development
- [Declarative vs. Imperative (Dimitri Glazkov)](https://glazkov.com/2024/01/16/declarative-vs-imperative/) — a precise analysis of what "declarative" means
