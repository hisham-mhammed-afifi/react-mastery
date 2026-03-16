# Part 1, Chapter 10: JavaScript Design Patterns for React

## What You Will Learn

- Implement the Module pattern for encapsulation and explain how ES modules supersede the IIFE-based approach
- Build an Observer system and connect it to React's rendering model and `useSyncExternalStore`
- Distinguish the Pub/Sub pattern from Observer and implement a decoupled event bus
- Apply the Factory, Strategy, Mediator, Singleton, Command, and Decorator patterns in React-specific contexts
- Map each classical design pattern to its modern React equivalent (hooks, context, reducers, HOCs)
- Implement a complete React use case for each pattern

---

## 10.1 Module Pattern (Encapsulation, Private State)

The Module pattern uses closures to create private state that is inaccessible from outside the module. It is the foundational encapsulation pattern in JavaScript.

> **See Also:** Part 1, Chapter 3, Section 3.4 for the closure mechanics behind the Module pattern.

### The Pattern

```javascript
const notificationService = (function() {
  // Private state
  let notifications = [];
  let idCounter = 0;

  // Private function
  function generateId() {
    return `notif-${++idCounter}`;
  }

  // Public API
  return {
    add(message, severity = "info") {
      const notification = { id: generateId(), message, severity, timestamp: Date.now() };
      notifications.push(notification);
      return notification;
    },

    dismiss(id) {
      notifications = notifications.filter(n => n.id !== id);
    },

    getAll() {
      return [...notifications]; // Return a copy, not the internal array
    },

    clear() {
      notifications = [];
    },
  };
})();

notificationService.add("File saved", "success");
notificationService.add("Connection lost", "error");
console.log(notificationService.getAll().length); // 2
// notificationService.notifications; // undefined (private)
// notificationService.generateId();  // TypeError (private)
```

### Modern Equivalent: ES Modules

ES modules provide file-level encapsulation without IIFEs. Variables not exported are private by default.

```javascript
// notification-service.js
let notifications = [];
let idCounter = 0;

function generateId() {
  return `notif-${++idCounter}`;
}

export function add(message, severity = "info") {
  const notification = { id: generateId(), message, severity, timestamp: Date.now() };
  notifications.push(notification);
  return notification;
}

export function dismiss(id) {
  notifications = notifications.filter(n => n.id !== id);
}

export function getAll() {
  return [...notifications];
}
```

> **React Connection:** Every React component file is an ES module. Variables declared outside the component function (but inside the module) are module-scoped and private. This is where constants, utility functions, and configuration objects should live. Module-scoped variables persist across renders and are shared across all instances of the component, making them appropriate for static data but dangerous for mutable, instance-specific state.

---

## 10.2 Observer Pattern (Event Systems, State Subscriptions)

The Observer pattern defines a one-to-many relationship: when a **subject** changes state, all registered **observers** are notified automatically.

### The Pattern

```javascript
function createObservable(initialValue) {
  let value = initialValue;
  const observers = new Set();

  return {
    getValue() {
      return value;
    },

    setValue(newValue) {
      if (Object.is(value, newValue)) return; // Skip if unchanged
      const oldValue = value;
      value = newValue;
      observers.forEach(observer => observer(value, oldValue));
    },

    subscribe(observer) {
      observers.add(observer);
      return () => observers.delete(observer); // Return unsubscribe function
    },

    get observerCount() {
      return observers.size;
    },
  };
}

// Usage
const temperature = createObservable(20);

const unsubscribe = temperature.subscribe((newTemp, oldTemp) => {
  console.log(`Temperature changed from ${oldTemp}°C to ${newTemp}°C`);
});

temperature.setValue(22); // "Temperature changed from 20°C to 22°C"
temperature.setValue(22); // (no output: same value, skip)
temperature.setValue(18); // "Temperature changed from 22°C to 18°C"

unsubscribe();
temperature.setValue(25); // (no output: observer removed)
```

### Observer Pattern in React: `useSyncExternalStore`

React 18 introduced `useSyncExternalStore` as the formalized observer contract between external stores and React components. It requires exactly two functions: `subscribe` (register an observer) and `getSnapshot` (read the current value).

```javascript
import { useSyncExternalStore } from "react";

// A store built on the observer pattern
function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  return {
    getState() {
      return state;
    },

    setState(updater) {
      state = typeof updater === "function" ? updater(state) : updater;
      listeners.forEach(listener => listener());
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const counterStore = createStore({ count: 0 });

// React hook bridging the observer pattern to React's rendering
function useCounterStore() {
  return useSyncExternalStore(
    counterStore.subscribe,
    counterStore.getState
  );
}

function Counter() {
  const { count } = useCounterStore();
  return (
    <button onClick={() => counterStore.setState(s => ({ count: s.count + 1 }))}>
      Count: {count}
    </button>
  );
}
```

> **React Connection:** React's entire rendering model is observer-based. Components "subscribe" to state (via `useState`, `useContext`, or external stores). When state changes, React notifies subscribed components and re-renders them. The `useSyncExternalStore` hook makes this subscription contract explicit and concurrent-rendering-safe. Libraries like Zustand are built on exactly this pattern. See Part 3, Chapter 4, Section 4.8 for when to reach for external state management.

---

## 10.3 Pub/Sub Pattern (Decoupled Communication)

The Pub/Sub (Publish/Subscribe) pattern extends Observer by introducing a **message broker** (event bus) that decouples publishers from subscribers. Publishers do not know who subscribes; subscribers do not know who publishes. Communication happens through named channels (event types).

### Observer vs Pub/Sub

| Aspect | Observer | Pub/Sub |
|---|---|---|
| Coupling | Subject knows its observers | Publishers and subscribers are independent |
| Communication | Direct (subject notifies observers) | Indirect (via event bus) |
| Use case | One subject, many observers | Many-to-many communication |

### The Pattern

```javascript
function createEventBus() {
  const channels = new Map();

  return {
    publish(event, data) {
      const subscribers = channels.get(event);
      if (subscribers) {
        subscribers.forEach(callback => callback(data));
      }
    },

    subscribe(event, callback) {
      if (!channels.has(event)) {
        channels.set(event, new Set());
      }
      channels.get(event).add(callback);

      // Return unsubscribe function
      return () => {
        const subs = channels.get(event);
        subs.delete(callback);
        if (subs.size === 0) channels.delete(event);
      };
    },

    // One-time subscription
    once(event, callback) {
      const unsubscribe = this.subscribe(event, (data) => {
        callback(data);
        unsubscribe();
      });
      return unsubscribe;
    },
  };
}

// Usage: decoupled components communicating via events
const bus = createEventBus();

// Cart module subscribes to product events
bus.subscribe("product:added-to-cart", (product) => {
  console.log(`Cart: added ${product.name}`);
});

// Analytics module subscribes independently
bus.subscribe("product:added-to-cart", (product) => {
  console.log(`Analytics: tracking ${product.name} addition`);
});

// Product module publishes (does not know about cart or analytics)
bus.publish("product:added-to-cart", { name: "Keyboard", price: 79.99 });
// "Cart: added Keyboard"
// "Analytics: tracking Keyboard addition"
```

> **Common Mistake:** Using a global event bus as the primary communication mechanism in a React application. While Pub/Sub is useful for cross-cutting concerns (analytics, logging, error reporting), using it for component-to-component communication bypasses React's unidirectional data flow. State changes that affect the UI should flow through React's state system (props, context, state libraries) so that React can properly reconcile and batch updates. Reserve Pub/Sub for side-effect coordination, not for driving UI state.

---

## 10.4 Factory Pattern (Creating Components Dynamically)

The Factory pattern provides a function that creates objects (or components) without exposing the creation logic. The caller specifies what to create, and the factory handles how.

### The Pattern

```javascript
// Component factory: returns the correct component based on type
function createFormField(config) {
  const { type, name, label, options, ...rest } = config;

  switch (type) {
    case "text":
    case "email":
    case "password":
      return { component: "input", props: { type, name, ...rest } };

    case "textarea":
      return { component: "textarea", props: { name, rows: 4, ...rest } };

    case "select":
      return {
        component: "select",
        props: { name, ...rest },
        children: options.map(opt => ({ value: opt.value, label: opt.label })),
      };

    case "checkbox":
      return { component: "input", props: { type: "checkbox", name, ...rest } };

    default:
      throw new Error(`Unknown field type: ${type}`);
  }
}
```

### Factory Pattern in React: Dynamic Component Rendering

```javascript
// Component registry (a map from type strings to components)
const widgetRegistry = {
  chart: ChartWidget,
  table: TableWidget,
  metric: MetricWidget,
  timeline: TimelineWidget,
};

// Factory function: resolves type to component
function createWidget(widgetConfig) {
  const WidgetComponent = widgetRegistry[widgetConfig.type];

  if (!WidgetComponent) {
    console.warn(`Unknown widget type: ${widgetConfig.type}`);
    return <div>Unknown widget type: {widgetConfig.type}</div>;
  }

  return <WidgetComponent key={widgetConfig.id} {...widgetConfig.props} />;
}

// Dashboard renders widgets dynamically from configuration
function Dashboard({ widgets }) {
  return (
    <div className="dashboard-grid">
      {widgets.map(createWidget)}
    </div>
  );
}

// Usage: configuration-driven UI
const dashboardConfig = [
  { id: "w1", type: "metric", props: { label: "Revenue", value: 42000 } },
  { id: "w2", type: "chart", props: { data: salesData, chartType: "bar" } },
  { id: "w3", type: "table", props: { columns: cols, rows: rows } },
];

<Dashboard widgets={dashboardConfig} />
```

> **React Connection:** The Factory pattern appears in React whenever components are rendered from configuration data: CMS-driven pages, form builders, dashboard systems, and plugin architectures. `React.createElement` itself is a factory function: it takes a type (string or component) and props, and produces a React element. The pattern enables building flexible, data-driven UIs where the component structure is determined at runtime.

---

## 10.5 Strategy Pattern (Swappable Algorithms, Render Strategies)

The Strategy pattern defines a family of interchangeable algorithms. The client selects which algorithm to use at runtime without modifying the code that uses it.

### The Pattern

```javascript
// Strategy objects: each implements the same interface
const sortStrategies = {
  byName: (a, b) => a.name.localeCompare(b.name),
  byPrice: (a, b) => a.price - b.price,
  byRating: (a, b) => b.rating - a.rating,
  byNewest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
};

function sortProducts(products, strategyName) {
  const strategy = sortStrategies[strategyName];
  if (!strategy) throw new Error(`Unknown sort strategy: ${strategyName}`);
  return products.toSorted(strategy);
}
```

### Strategy Pattern in React: Validation Strategies

```javascript
// Validation strategy objects
const validators = {
  required: (value) =>
    value !== "" && value !== null && value !== undefined ? null : "This field is required",

  email: (value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "Invalid email address",

  minLength: (min) => (value) =>
    value.length >= min ? null : `Must be at least ${min} characters`,

  maxLength: (max) => (value) =>
    value.length <= max ? null : `Must be at most ${max} characters`,

  pattern: (regex, message) => (value) =>
    regex.test(value) ? null : message,
};

// Component accepts validation strategies as configuration
function FormField({ name, label, value, onChange, validationRules = [] }) {
  const [error, setError] = useState(null);

  const validate = (val) => {
    for (const rule of validationRules) {
      const errorMessage = rule(val);
      if (errorMessage) {
        setError(errorMessage);
        return false;
      }
    }
    setError(null);
    return true;
  };

  const handleBlur = () => validate(value);

  return (
    <div>
      <label>{label}</label>
      <input name={name} value={value} onChange={onChange} onBlur={handleBlur} />
      {error && <span className="error">{error}</span>}
    </div>
  );
}

// Usage: compose validation strategies per field
<FormField
  name="email"
  label="Email"
  value={email}
  onChange={handleChange}
  validationRules={[validators.required, validators.email]}
/>

<FormField
  name="password"
  label="Password"
  value={password}
  onChange={handleChange}
  validationRules={[validators.required, validators.minLength(8), validators.maxLength(128)]}
/>
```

The algorithms (validation rules) are interchangeable and composable. Adding a new validation rule requires no changes to `FormField`.

---

## 10.6 Mediator Pattern (Centralized State Management)

The Mediator pattern centralizes communication: instead of components communicating directly with each other, they communicate through a central mediator. This reduces coupling from many-to-many to many-to-one.

### The Pattern

```javascript
function createFormMediator() {
  const fields = new Map();
  const subscribers = new Set();

  function notify() {
    const state = Object.fromEntries(fields);
    subscribers.forEach(callback => callback(state));
  }

  return {
    registerField(name, initialValue = "") {
      fields.set(name, initialValue);
    },

    updateField(name, value) {
      fields.set(name, value);
      notify();
    },

    getField(name) {
      return fields.get(name);
    },

    getState() {
      return Object.fromEntries(fields);
    },

    isValid() {
      return Array.from(fields.values()).every(value => value !== "");
    },

    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
  };
}
```

### Mediator in React: Context as a Mediator

React's Context API naturally implements the Mediator pattern. A context provider acts as the central mediator; child components communicate through it rather than directly with each other.

```javascript
const FormContext = createContext();

function FormMediator({ children, onSubmit }) {
  const [fields, setFields] = useState({});

  const updateField = useCallback((name, value) => {
    setFields(prev => ({ ...prev, [name]: value }));
  }, []);

  const getField = useCallback((name) => fields[name] ?? "", [fields]);

  const isValid = Object.values(fields).every(v => v !== "");

  const contextValue = useMemo(
    () => ({ updateField, getField, fields, isValid }),
    [updateField, getField, fields, isValid]
  );

  return (
    <FormContext.Provider value={contextValue}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(fields); }}>
        {children}
      </form>
    </FormContext.Provider>
  );
}

function MediatedInput({ name, label }) {
  const { getField, updateField } = useContext(FormContext);
  // This component does not know about other fields.
  // All coordination happens through the FormContext mediator.
  return (
    <div>
      <label>{label}</label>
      <input
        value={getField(name)}
        onChange={(e) => updateField(name, e.target.value)}
      />
    </div>
  );
}

function SubmitButton() {
  const { isValid } = useContext(FormContext);
  return <button type="submit" disabled={!isValid}>Submit</button>;
}
```

> **React Connection:** Redux is a formalized mediator: components dispatch actions to a central store (the mediator), and the store notifies subscribed components of state changes. No component communicates directly with another. This eliminates prop drilling and tight coupling at the cost of adding a layer of indirection.

---

## 10.7 Singleton Pattern (Global Stores, Configuration)

The Singleton pattern ensures a class or module produces exactly one instance and provides global access to it.

### The Pattern in JavaScript

In JavaScript, ES modules are natural singletons. The module system evaluates a module once and caches the result; all importers receive the same instance.

```javascript
// api-client.js (module-scoped singleton)
const config = {
  baseUrl: "https://api.example.com",
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
};

let authToken = null;

export function setAuthToken(token) {
  authToken = token;
}

export async function request(endpoint, options = {}) {
  const response = await fetch(`${config.baseUrl}${endpoint}`, {
    ...options,
    headers: {
      ...config.headers,
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...options.headers,
    },
    signal: options.signal ?? AbortSignal.timeout(config.timeout),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// Every file that imports from api-client.js shares the same
// authToken and config. The module is evaluated once.
```

### Singleton in React: Zustand Stores

```javascript
import { create } from "zustand";

// This store is a module-scoped singleton.
// All components that call useAuthStore share the same state.
const useAuthStore = create((set) => ({
  user: null,
  token: null,

  login: async (credentials) => {
    const { user, token } = await authenticateUser(credentials);
    set({ user, token });
  },

  logout: () => set({ user: null, token: null }),
}));

// Component A and Component B both read and write the same store
function Navbar() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  return user ? <button onClick={logout}>Logout {user.name}</button> : null;
}
```

> **Common Mistake:** Using the Singleton pattern for state that should be instance-specific. A singleton authentication store is appropriate (one user session per app), but a singleton form store is not (multiple forms on the same page would share state). When you need multiple instances of the same store type, use React Context for dependency injection: create the store inside a Provider so each subtree gets its own instance.

---

## 10.8 Command Pattern (Undo/Redo, Action Dispatching)

The Command pattern encapsulates operations as objects. Each command is a self-contained description of an action, enabling logging, queueing, undoing, and replaying operations.

### The Pattern

```javascript
// Command objects describe what to do
function createAddItemCommand(item) {
  return {
    type: "ADD_ITEM",
    payload: item,
    timestamp: Date.now(),
  };
}

function createRemoveItemCommand(itemId) {
  return {
    type: "REMOVE_ITEM",
    payload: { id: itemId },
    timestamp: Date.now(),
  };
}

// Executor: processes commands against state
function executeCommand(state, command) {
  switch (command.type) {
    case "ADD_ITEM":
      return { ...state, items: [...state.items, command.payload] };
    case "REMOVE_ITEM":
      return { ...state, items: state.items.filter(i => i.id !== command.payload.id) };
    default:
      return state;
  }
}
```

### Command Pattern in React: `useReducer` with Undo/Redo

React's `useReducer` is a direct implementation of the command pattern: actions are commands, and the reducer is the executor.

```javascript
function undoableReducer(reducer) {
  const initialUndoState = {
    past: [],
    present: undefined,
    future: [],
  };

  return function(state, action) {
    switch (action.type) {
      case "UNDO": {
        if (state.past.length === 0) return state;
        const previous = state.past[state.past.length - 1];
        const newPast = state.past.slice(0, -1);
        return { past: newPast, present: previous, future: [state.present, ...state.future] };
      }

      case "REDO": {
        if (state.future.length === 0) return state;
        const next = state.future[0];
        const newFuture = state.future.slice(1);
        return { past: [...state.past, state.present], present: next, future: newFuture };
      }

      default: {
        const newPresent = reducer(state.present, action);
        if (Object.is(newPresent, state.present)) return state;
        return { past: [...state.past, state.present], present: newPresent, future: [] };
      }
    }
  };
}

// The inner reducer handles domain logic
function todosReducer(state, action) {
  switch (action.type) {
    case "ADD_TODO":
      return [...state, { id: Date.now(), text: action.text, done: false }];
    case "TOGGLE_TODO":
      return state.map(t => t.id === action.id ? { ...t, done: !t.done } : t);
    case "REMOVE_TODO":
      return state.filter(t => t.id !== action.id);
    default:
      return state;
  }
}

// Usage in a component
function TodoApp() {
  const [state, dispatch] = useReducer(
    undoableReducer(todosReducer),
    { past: [], present: [], future: [] }
  );

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  return (
    <div>
      <button onClick={() => dispatch({ type: "UNDO" })} disabled={!canUndo}>Undo</button>
      <button onClick={() => dispatch({ type: "REDO" })} disabled={!canRedo}>Redo</button>
      <button onClick={() => dispatch({ type: "ADD_TODO", text: "New task" })}>Add</button>

      <ul>
        {state.present.map(todo => (
          <li key={todo.id} onClick={() => dispatch({ type: "TOGGLE_TODO", id: todo.id })}>
            {todo.done ? "✓" : "○"} {todo.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

The `undoableReducer` is a **higher-order reducer**: it wraps any reducer to add undo/redo capability. This composability is a direct consequence of the command pattern's separation of command description from execution.

> **See Also:** Part 3, Chapter 2, Section 2.5 for a full treatment of `useReducer`, and Part 4, Chapter 4 for state machines that extend the command pattern with guards and transitions.

---

## 10.9 Decorator Pattern (Enhancing Functions/Components)

The Decorator pattern wraps an object or function to add behavior without modifying the original. In React, Higher-Order Components (HOCs) are the primary implementation.

### The Pattern: Function Decorators

```javascript
// A decorator that adds logging to any function
function withLogging(fn, label) {
  return function(...args) {
    console.log(`[${label}] called with:`, args);
    const result = fn.apply(this, args);
    console.log(`[${label}] returned:`, result);
    return result;
  };
}

function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

const loggedCalculateTotal = withLogging(calculateTotal, "calculateTotal");
loggedCalculateTotal([
  { price: 10, quantity: 2 },
  { price: 25, quantity: 1 },
]);
// [calculateTotal] called with: [[{ price: 10, quantity: 2 }, ...]]
// [calculateTotal] returned: 45
```

### The Pattern: Component Decorators (HOCs)

```javascript
// HOC that adds error boundary behavior
function withErrorFallback(WrappedComponent, FallbackComponent) {
  return class extends React.Component {
    state = { hasError: false };

    static getDerivedStateFromError() {
      return { hasError: true };
    }

    componentDidCatch(error, info) {
      console.error("Component error:", error, info);
    }

    render() {
      if (this.state.hasError) {
        return <FallbackComponent />;
      }
      return <WrappedComponent {...this.props} />;
    }
  };
}

// Decorate a component
const SafeDashboard = withErrorFallback(Dashboard, ErrorMessage);
```

### Modern Alternative: Custom Hooks

Custom hooks provide the same behavior augmentation without wrapper components:

```javascript
// Instead of withAuth(Component), use useAuth() inside the component
function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus().then(setUser).finally(() => setLoading(false));
  }, []);

  return { user, loading, isAuthenticated: user !== null };
}

function ProtectedPage() {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) return <Spinner />;
  if (!isAuthenticated) return <Navigate to="/login" />;

  return <Dashboard user={user} />;
}
```

> **React Connection:** HOCs (the decorator pattern) dominated React code-reuse from 2016 to 2019. Custom hooks have largely replaced them because hooks avoid wrapper nesting, make data flow explicit, and are more compatible with the React Compiler's optimization. However, HOCs remain appropriate for error boundaries (which require class components), route-level guards, and third-party library integration. See Part 1, Chapter 8, Section 8.7 for the full comparison.

---

## 10.10 Exercise: Map Each Pattern to a Real React Use Case and Implement It

### Problem Statement

For each of the nine patterns covered in this chapter, identify its most natural React equivalent. Then implement a complete, working example for **three** of the patterns: Observer (with `useSyncExternalStore`), Command (undo/redo), and Factory (dynamic component rendering).

### Pattern-to-React Mapping Table

| Pattern | React Equivalent | Example |
|---|---|---|
| Module | ES module scope per component file | Constants, utility functions outside the component |
| Observer | `useSyncExternalStore`, `useState`, `useEffect` | External store subscription |
| Pub/Sub | Event bus for cross-cutting concerns | Analytics events, error reporting |
| Factory | Dynamic component rendering from config | Dashboard widgets, CMS page builder |
| Strategy | Props/config that select algorithms | Validation rules, sort comparators, render strategies |
| Mediator | Context + Provider as central coordinator | Form coordination, multi-panel layouts |
| Singleton | Module-scoped stores (Zustand, Redux) | Auth store, API client, feature flags |
| Command | `useReducer` with action objects | State transitions, undo/redo, action logging |
| Decorator | HOCs, custom hooks | `withAuth`, `useAuth`, `withErrorBoundary` |

### Implementation 1: Observer Pattern with `useSyncExternalStore`

```javascript
// theme-store.js: a standalone observable store
function createThemeStore() {
  let theme = "light";
  const listeners = new Set();

  return {
    getSnapshot() {
      return theme;
    },

    setTheme(newTheme) {
      if (theme === newTheme) return;
      theme = newTheme;
      listeners.forEach(listener => listener());
    },

    toggle() {
      this.setTheme(theme === "light" ? "dark" : "light");
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const themeStore = createThemeStore();

// React hook: bridges the observer store to React
function useTheme() {
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot
  );

  return { theme, toggleTheme: () => themeStore.toggle() };
}

// Components subscribe independently; only re-render when theme changes
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme}>
      Current theme: {theme}
    </button>
  );
}

function ThemedPanel() {
  const { theme } = useTheme();
  return (
    <div className={`panel panel-${theme}`}>
      Content styled by theme
    </div>
  );
}
```

### Implementation 2: Factory Pattern with Dynamic Rendering

```javascript
// Widget components
function StatWidget({ title, value, unit }) {
  return <div className="widget stat"><h4>{title}</h4><p>{value} {unit}</p></div>;
}

function ListWidget({ title, items }) {
  return (
    <div className="widget list">
      <h4>{title}</h4>
      <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
    </div>
  );
}

function ChartWidget({ title, data }) {
  return (
    <div className="widget chart">
      <h4>{title}</h4>
      <div className="chart-placeholder">[Chart: {data.length} data points]</div>
    </div>
  );
}

// Factory: registry maps type strings to components
const widgetFactory = {
  stat: StatWidget,
  list: ListWidget,
  chart: ChartWidget,
};

function renderWidget(config) {
  const Component = widgetFactory[config.type];
  if (!Component) return <div key={config.id}>Unknown widget: {config.type}</div>;
  return <Component key={config.id} {...config.props} />;
}

// Configuration-driven dashboard
function ConfigurableDashboard({ layout }) {
  return <div className="dashboard">{layout.map(renderWidget)}</div>;
}

// Usage
const dashboardLayout = [
  { id: "1", type: "stat", props: { title: "Users", value: 1420, unit: "active" } },
  { id: "2", type: "list", props: { title: "Tasks", items: ["Deploy", "Review", "Test"] } },
  { id: "3", type: "chart", props: { title: "Revenue", data: [100, 200, 150, 300] } },
];

<ConfigurableDashboard layout={dashboardLayout} />
```

### Implementation 3: Command Pattern with Undo/Redo

```javascript
// Reusable undoable hook (command pattern + reducer)
function useUndoable(reducer, initialState) {
  const [state, dispatch] = useReducer(
    (undoState, action) => {
      switch (action.type) {
        case "@@UNDO": {
          if (undoState.past.length === 0) return undoState;
          const prev = undoState.past[undoState.past.length - 1];
          return {
            past: undoState.past.slice(0, -1),
            present: prev,
            future: [undoState.present, ...undoState.future],
          };
        }
        case "@@REDO": {
          if (undoState.future.length === 0) return undoState;
          const next = undoState.future[0];
          return {
            past: [...undoState.past, undoState.present],
            present: next,
            future: undoState.future.slice(1),
          };
        }
        default: {
          const newPresent = reducer(undoState.present, action);
          if (Object.is(newPresent, undoState.present)) return undoState;
          return {
            past: [...undoState.past, undoState.present],
            present: newPresent,
            future: [],
          };
        }
      }
    },
    { past: [], present: initialState, future: [] }
  );

  return {
    state: state.present,
    dispatch,
    undo: () => dispatch({ type: "@@UNDO" }),
    redo: () => dispatch({ type: "@@REDO" }),
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    historyLength: state.past.length,
  };
}

// Domain reducer (knows nothing about undo/redo)
function drawingReducer(state, action) {
  switch (action.type) {
    case "ADD_SHAPE":
      return [...state, action.shape];
    case "REMOVE_LAST":
      return state.slice(0, -1);
    case "CLEAR":
      return [];
    default:
      return state;
  }
}

// Component using the undoable command pattern
function DrawingApp() {
  const { state: shapes, dispatch, undo, redo, canUndo, canRedo } = useUndoable(drawingReducer, []);

  const addCircle = () => dispatch({
    type: "ADD_SHAPE",
    shape: { type: "circle", x: Math.random() * 400, y: Math.random() * 300, r: 20 },
  });

  return (
    <div>
      <div>
        <button onClick={addCircle}>Add Circle</button>
        <button onClick={() => dispatch({ type: "REMOVE_LAST" })}>Remove Last</button>
        <button onClick={() => dispatch({ type: "CLEAR" })}>Clear</button>
        <button onClick={undo} disabled={!canUndo}>Undo</button>
        <button onClick={redo} disabled={!canRedo}>Redo</button>
      </div>
      <div className="canvas">
        {shapes.map((shape, i) => (
          <div key={i} style={{
            position: "absolute",
            left: shape.x,
            top: shape.y,
            width: shape.r * 2,
            height: shape.r * 2,
            borderRadius: "50%",
            backgroundColor: "steelblue",
          }} />
        ))}
      </div>
    </div>
  );
}
```

### Key Takeaway

Classical design patterns provide a shared vocabulary for recurring software problems. In React, these patterns manifest through the framework's own abstractions: the Observer pattern becomes `useSyncExternalStore`, the Command pattern becomes `useReducer`, the Factory pattern becomes dynamic component rendering, the Mediator becomes Context, the Singleton becomes module-scoped stores, the Strategy becomes configurable props, and the Decorator becomes HOCs or custom hooks. Recognizing these mappings allows you to apply decades of design pattern wisdom directly to React architecture decisions.

---

## Chapter Summary

JavaScript's classical design patterns remain relevant in React development, though they manifest through the framework's functional, component-based abstractions. The Observer pattern underpins React's rendering model and `useSyncExternalStore`. The Command pattern powers `useReducer` and undo/redo systems. The Factory pattern enables configuration-driven dynamic rendering. The Mediator pattern appears in Context-based coordination. The Singleton pattern applies to module-scoped state stores. The Strategy pattern enables swappable algorithms via props. The Decorator pattern evolved from HOCs to custom hooks. Recognizing these patterns in React code provides both a design vocabulary and proven solutions to recurring architecture problems.

---

## Further Reading

- [Patterns.dev: Design Patterns](https://www.patterns.dev/) — modern design patterns with React-specific examples
- [useSyncExternalStore (React Documentation)](https://react.dev/reference/react/useSyncExternalStore) — the official observer contract for external stores
- [useReducer (React Documentation)](https://react.dev/reference/react/useReducer) — React's built-in command pattern implementation
- [The State Reducer Pattern with React Hooks (Kent C. Dodds)](https://kentcdodds.com/blog/the-state-reducer-pattern-with-react-hooks) — advanced command pattern with inversion of control
- [Implementing Undo History (Redux Documentation)](https://redux.js.org/usage/implementing-undo-history) — canonical undo/redo with higher-order reducers
- [Zustand and React Context (TkDodo)](https://tkdodo.eu/blog/zustand-and-react-context) — singleton stores with dependency injection
- [Do React Hooks Replace Higher Order Components? (Eric Elliott)](https://medium.com/javascript-scene/do-react-hooks-replace-higher-order-components-hocs-7ae4a08b7b58) — decorator pattern evolution
