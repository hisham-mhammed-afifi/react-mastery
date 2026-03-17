# Part 2, Chapter 6: Component Lifecycle Mapped to Hooks

## What You Will Learn

- Describe the three phases of the class component lifecycle (mounting, updating, unmounting) and the methods that execute in each
- Map each class lifecycle method to its hook-based equivalent, including cases where no direct equivalent exists
- Explain why `useEffect(fn, [])` is fundamentally different from `componentDidMount`, despite similar timing
- Apply the synchronization mental model for effects: "keep this side effect in sync with these reactive values" rather than "run this code at this moment"
- Identify when effects are unnecessary by recognizing anti-patterns (derived state, prop-driven resets, data transformations)
- Convert a complete class component to a function component with hooks, correctly mapping every lifecycle concern

---

## 6.1 Class Component Lifecycle Methods (The Old Model)

Before hooks (React 16.8, February 2019), React components managed side effects and state through class-based lifecycle methods. These methods are functions that React calls at specific moments during a component's existence. Understanding them remains valuable because they expose the temporal model that hooks were designed to replace, and because error boundaries still require class components.

A class component's lifecycle is divided into three phases:

```
MOUNTING                    UPDATING                     UNMOUNTING
(component created)         (props or state change)      (component removed)

constructor()               static getDerivedStateFromProps()
                            shouldComponentUpdate()
render()                    render()
                            getSnapshotBeforeUpdate()
componentDidMount()         componentDidUpdate()         componentWillUnmount()
```

Each method fires at a specific point in the rendering pipeline:

```javascript
class UserProfile extends React.Component {
  constructor(props) {
    super(props);
    this.state = { user: null, loading: true };
    // Initialize state and bind methods
  }

  componentDidMount() {
    // Component is now in the DOM. Safe to:
    // - Fetch data
    // - Set up subscriptions
    // - Measure DOM elements
    this.fetchUser(this.props.userId);
  }

  componentDidUpdate(prevProps, prevState) {
    // Called after every update (not on initial mount).
    // Must guard against infinite loops with a condition.
    if (prevProps.userId !== this.props.userId) {
      this.fetchUser(this.props.userId);
    }
  }

  componentWillUnmount() {
    // Component is about to be removed from the DOM.
    // Clean up subscriptions, timers, pending requests.
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  async fetchUser(userId) {
    this.abortController = new AbortController();
    this.setState({ loading: true });
    try {
      const res = await fetch(`/api/users/${userId}`, {
        signal: this.abortController.signal,
      });
      const user = await res.json();
      this.setState({ user, loading: false });
    } catch (err) {
      if (err.name !== "AbortError") {
        this.setState({ loading: false });
      }
    }
  }

  render() {
    const { user, loading } = this.state;
    if (loading) return <div>Loading...</div>;
    if (!user) return <div>User not found</div>;
    return <h1>{user.name}</h1>;
  }
}
```

---

## 6.2 Mounting: constructor > render > componentDidMount

The mounting phase executes when a component is created and inserted into the DOM for the first time.

### constructor(props)

Called before the component mounts. Used for two purposes: initializing local state and binding event handler methods.

```javascript
class SearchForm extends React.Component {
  constructor(props) {
    super(props); // Required: must call super(props) first
    this.state = {
      query: props.initialQuery || "",
      results: [],
    };
    // Binding was necessary because class methods lose `this` context
    // when passed as callbacks
    this.handleSubmit = this.handleSubmit.bind(this);
  }
}
```

### render()

Called to produce the React element tree. Must be a pure function of `this.props` and `this.state`: no side effects, no direct DOM manipulation, no `setState` calls.

### componentDidMount()

Called once, immediately after the component's DOM nodes are inserted into the document. This is the standard location for:

- Data fetching
- DOM measurements (reading `getBoundingClientRect`, setting up `ResizeObserver`)
- Setting up subscriptions (WebSocket, event listeners, third-party libraries)
- Starting timers

```javascript
class LiveClock extends React.Component {
  constructor(props) {
    super(props);
    this.state = { time: new Date() };
  }

  componentDidMount() {
    // Start the timer after the component is in the DOM
    this.timerID = setInterval(() => {
      this.setState({ time: new Date() });
    }, 1000);
  }

  componentWillUnmount() {
    clearInterval(this.timerID);
  }

  render() {
    return <span>{this.state.time.toLocaleTimeString()}</span>;
  }
}
```

---

## 6.3 Updating: shouldComponentUpdate > render > componentDidUpdate

The updating phase executes whenever a component receives new props, calls `setState`, or calls `forceUpdate`.

### shouldComponentUpdate(nextProps, nextState)

An optional optimization method. Returns `true` (default) to allow the render, or `false` to skip it. Used to prevent unnecessary renders when the developer knows the output would be identical.

```javascript
class ExpensiveList extends React.Component {
  shouldComponentUpdate(nextProps) {
    // Only re-render if the items array reference changed
    return nextProps.items !== this.props.items;
  }

  render() {
    return (
      <ul>
        {this.props.items.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
    );
  }
}
```

`React.PureComponent` provides a built-in shallow comparison of all props and state, equivalent to a `shouldComponentUpdate` that checks every field.

### componentDidUpdate(prevProps, prevState, snapshot)

Called after every update (not on the initial mount). The previous props and state are available for comparison, enabling conditional side effects:

```javascript
class UserData extends React.Component {
  componentDidUpdate(prevProps) {
    // Fetch new data only when the userId prop changes
    if (this.props.userId !== prevProps.userId) {
      this.fetchUser(this.props.userId);
    }
  }
}
```

> **Common Mistake:** Calling `setState` unconditionally inside `componentDidUpdate` creates an infinite loop: the update triggers `componentDidUpdate`, which calls `setState`, which triggers another update. Always guard `setState` calls in `componentDidUpdate` with a condition comparing previous and current props or state.

### getDerivedStateFromProps(props, state)

A static method called before every render (both mount and update). Returns an object to update state, or `null` to indicate no change. Rarely needed; the React documentation recommends alternatives for most use cases.

### getSnapshotBeforeUpdate(prevProps, prevState)

Called after `render` but before DOM mutations. Returns a value (the "snapshot") that is passed as the third argument to `componentDidUpdate`. Used for reading DOM state (e.g., scroll position) before it changes. No hook equivalent exists.

---

## 6.4 Unmounting: componentWillUnmount

Called immediately before a component is removed from the DOM. This is the cleanup phase: cancel pending network requests, remove event listeners, clear timers, disconnect subscriptions.

```javascript
class StockTicker extends React.Component {
  componentDidMount() {
    this.ws = new WebSocket("wss://stocks.example.com");
    this.ws.onmessage = (event) => {
      this.setState({ price: JSON.parse(event.data).price });
    };
  }

  componentWillUnmount() {
    // Clean up: close the WebSocket connection
    this.ws.close();
  }

  render() {
    return <span>${this.state.price}</span>;
  }
}
```

The fundamental problem with the class lifecycle model is visible in this example: the setup logic (`componentDidMount`) and the cleanup logic (`componentWillUnmount`) are in two separate methods, physically distant in the code. Related logic is split across the component. When a component has multiple independent side effects (a WebSocket, a timer, and a resize listener), each setup/cleanup pair is interleaved with the others inside shared lifecycle methods, making the code harder to reason about.

---

## 6.5 How Hooks Map to Lifecycle

The following table provides the mapping, but with a critical caveat: hooks do not map 1:1 to lifecycle methods. Hooks model behavior as reactions to data dependencies, not as responses to temporal events.

| Class Method | Hook Equivalent | Caveats |
|---|---|---|
| `constructor` (state init) | `useState(initialValue)` | No constructor needed |
| `constructor` (ref init) | `useRef(initialValue)` | |
| `constructor` (method binding) | Not needed | Arrow functions or inline handlers |
| `componentDidMount` | `useEffect(fn, [])` | Runs after paint, not after mount; captures initial values |
| `componentDidUpdate` | `useEffect(fn, [deps])` | Runs on mount AND update; more precise via deps |
| `componentWillUnmount` | Return cleanup from `useEffect` | Cleanup also runs before each re-execution |
| `shouldComponentUpdate` | `React.memo(Component)` | Wraps the component; shallow prop comparison |
| `getDerivedStateFromProps` | Compute during render, or conditional `setState` in render | |
| `getSnapshotBeforeUpdate` | **No hook equivalent** | Must use a class component |
| `componentDidCatch` | **No hook equivalent** | Error boundaries must be class components |

### The Structural Difference

In class components, related logic is split across lifecycle methods:

```javascript
// Class: setup and cleanup for the SAME concern
// are split across different methods
class ChatRoom extends React.Component {
  componentDidMount() {
    this.connection = createConnection(this.props.roomId);
    this.connection.connect();    // Setup in one place
  }

  componentDidUpdate(prevProps) {
    if (prevProps.roomId !== this.props.roomId) {
      this.connection.disconnect(); // Cleanup in another place
      this.connection = createConnection(this.props.roomId);
      this.connection.connect();    // Re-setup in yet another place
    }
  }

  componentWillUnmount() {
    this.connection.disconnect();   // Final cleanup in a third place
  }
}
```

With hooks, related logic is colocated:

```javascript
// Hooks: setup and cleanup for the SAME concern
// are together in one effect
function ChatRoom({ roomId }) {
  useEffect(() => {
    const connection = createConnection(roomId);
    connection.connect();           // Setup

    return () => {
      connection.disconnect();      // Cleanup (same effect)
    };
  }, [roomId]); // Re-runs when roomId changes
}
```

The hook version handles all three class scenarios (mount, update, unmount) in a single `useEffect` call. The dependency array (`[roomId]`) replaces the manual `prevProps.roomId !== this.props.roomId` comparison. The cleanup function replaces both the update-time disconnection and the unmount-time disconnection.

---

## 6.6 `useEffect` is NOT componentDidMount (The Mental Model Difference)

This is the single most important conceptual shift when moving from classes to hooks. Despite superficial similarity in timing, `useEffect(fn, [])` and `componentDidMount` operate on fundamentally different mental models.

### The Class Mental Model: Moments in Time

Class lifecycle methods answer temporal questions:
- "What should happen when the component **mounts**?"
- "What should happen when the component **updates**?"
- "What should happen when the component **unmounts**?"

This model treats the component as an entity that transitions between states over time. Side effects are tied to specific moments in that timeline.

### The Hooks Mental Model: Synchronization with State

`useEffect` answers a relational question:
- "What external behavior should be synchronized with **these specific values**?"

This model treats effects as ongoing relationships between reactive values and external systems. The dependency array declares which values the effect depends on. When those values change, the effect re-synchronizes.

### The Practical Difference

```javascript
// Class: "When the component mounts, start listening to the window resize"
class WindowSize extends React.Component {
  componentDidMount() {
    window.addEventListener("resize", this.handleResize);
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.handleResize);
  }

  handleResize = () => {
    this.setState({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  };
}
```

```javascript
// Hooks: "Keep the width and height synchronized with the window size"
function useWindowSize() {
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    function handleResize() {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []); // No reactive dependencies; syncs with window, which never changes identity

  return size;
}
```

Both produce the same behavior, but the mental framing is different. The class version says "do this on mount, undo it on unmount." The hook version says "synchronize with the window resize event." The synchronization framing is more robust because it naturally handles cases where dependencies change:

```javascript
function useEventSource(url) {
  const [data, setData] = useState(null);

  useEffect(() => {
    // "Synchronize with the event source at this URL"
    const source = new EventSource(url);
    source.onmessage = (event) => setData(JSON.parse(event.data));

    return () => source.close();
  }, [url]); // When URL changes, disconnect from old, connect to new

  return data;
}
```

If `url` changes, the effect automatically disconnects from the old URL and connects to the new one. In a class component, this would require `componentDidUpdate` with a manual comparison of `prevProps.url !== this.props.url`, plus duplicated setup/teardown logic.

### The Stale Closure Trap

The closure-based nature of hooks means each effect callback captures a snapshot of values from its render:

```javascript
function Timer() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      console.log(count); // Always logs the initial value: 0
      setCount(count + 1); // Always sets to 0 + 1 = 1
    }, 1000);
    return () => clearInterval(id);
  }, []); // Empty deps: effect captures count=0 forever

  return <span>{count}</span>; // Stuck at 1
}

// Fix: use the functional updater form
useEffect(() => {
  const id = setInterval(() => {
    setCount((c) => c + 1); // Reads latest value via updater
  }, 1000);
  return () => clearInterval(id);
}, []);
```

> **Common Mistake:** Developers often try to replicate class lifecycle patterns exactly: `useEffect(fn, [])` for "mount", a separate `useEffect` for "update", and cleanup for "unmount." This results in multiple effects that should be one, missed dependencies, and stale closure bugs. The correct approach is to think in terms of what each effect synchronizes with, let the dependency array drive re-execution, and use cleanup for teardown.

> **See Also:** Part 1, Chapter 3, Section 3.3 for the stale closure problem in JavaScript, and Part 1, Chapter 3, Section 3.7 for building a mini useState using closures.

---

## 6.7 The Synchronization Mental Model for Effects

The React documentation (react.dev) frames effects through a specific mental model: effects are synchronization mechanisms that connect React's rendering model to external systems. This framing has several practical implications.

### An Effect's Lifecycle is Independent of the Component's Lifecycle

An effect does not mount and unmount with the component. It **starts synchronizing** and **stops synchronizing**. These transitions can happen multiple times while the component remains mounted:

```javascript
function ChatRoom({ roomId, serverUrl }) {
  useEffect(() => {
    // Start synchronizing: connect to the chat room
    const connection = createConnection(serverUrl, roomId);
    connection.connect();

    return () => {
      // Stop synchronizing: disconnect
      connection.disconnect();
    };
  }, [serverUrl, roomId]);
  // Effect lifecycle:
  //   Mount with roomId="general" → connect to general
  //   roomId changes to "react"  → disconnect from general, connect to react
  //   roomId changes to "random" → disconnect from react, connect to random
  //   Unmount                     → disconnect from random
}
```

The effect synchronized three different times during the component's single mounted lifetime. Each synchronization was a complete start/stop cycle.

### Cleanup Runs Before Each Re-Execution, Not Just on Unmount

This is a critical difference from `componentWillUnmount`. Effect cleanup runs:

1. Before the effect re-executes (when dependencies change)
2. When the component unmounts

```javascript
function DocumentTitle({ title }) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    return () => {
      // Runs when title changes AND on unmount
      document.title = previousTitle;
    };
  }, [title]);
}
```

### The Dependency Array is a Declaration, Not an Optimization

The dependency array is not "an optional performance hint." It is a declaration of which reactive values the effect reads. Every value from the component scope (props, state, values derived from them) that the effect uses must be in the array. The `react-hooks/exhaustive-deps` ESLint rule enforces this.

```javascript
// Wrong: "I only want this to run on mount"
useEffect(() => {
  fetchData(userId); // Uses userId but doesn't declare it
}, []); // Lint warning: 'userId' is missing from the dependency array

// Correct: declare what the effect reads
useEffect(() => {
  fetchData(userId);
}, [userId]); // Effect re-runs when userId changes, which is correct
```

### When You Do Not Need an Effect

The React documentation identifies several common anti-patterns where developers use effects unnecessarily:

```javascript
// Anti-pattern 1: Deriving state from props
// Wrong: effect to "sync" derived value
function FilteredList({ items, category }) {
  const [filtered, setFiltered] = useState([]);

  useEffect(() => {
    setFiltered(items.filter((i) => i.category === category));
  }, [items, category]);

  // Correct: compute during render (no effect needed)
  const filtered = items.filter((i) => i.category === category);
}

// Anti-pattern 2: Resetting state when a prop changes
// Wrong: effect to reset
function UserProfile({ userId }) {
  const [comment, setComment] = useState("");

  useEffect(() => {
    setComment("");
  }, [userId]);

  // Correct: use a key to force a fresh instance
  // In the parent: <UserProfile key={userId} userId={userId} />
}

// Anti-pattern 3: Chaining state updates through effects
// Wrong: cascading effects
function Form() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    setFullName(firstName + " " + lastName);
  }, [firstName, lastName]);

  // Correct: compute during render
  const fullName = firstName + " " + lastName;
}
```

> **See Also:** Part 2, Chapter 5, Section 5.6 for why the render phase must be pure and where side effects belong in the pipeline.

---

## 6.8 Exercise: Convert a Class Component to Hooks, Mapping Each Lifecycle Method

### Problem Statement

Convert the following class component to a function component with hooks. The component fetches user data on mount and when the `userId` prop changes, subscribes to a WebSocket for real-time status updates, and tracks the window width for responsive layout. Map each lifecycle concern to its hook equivalent and explain the mapping.

### Starter Code (Class Component)

```javascript
class UserDashboard extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      user: null,
      loading: true,
      error: null,
      onlineStatus: "unknown",
      windowWidth: window.innerWidth,
    };
    this.handleResize = this.handleResize.bind(this);
  }

  componentDidMount() {
    this.fetchUser(this.props.userId);
    this.connectWebSocket(this.props.userId);
    window.addEventListener("resize", this.handleResize);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.userId !== this.props.userId) {
      this.fetchUser(this.props.userId);

      if (this.ws) this.ws.close();
      this.connectWebSocket(this.props.userId);
    }
  }

  componentWillUnmount() {
    if (this.abortController) this.abortController.abort();
    if (this.ws) this.ws.close();
    window.removeEventListener("resize", this.handleResize);
  }

  handleResize() {
    this.setState({ windowWidth: window.innerWidth });
  }

  async fetchUser(userId) {
    this.abortController = new AbortController();
    this.setState({ loading: true, error: null });
    try {
      const res = await fetch(`/api/users/${userId}`, {
        signal: this.abortController.signal,
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const user = await res.json();
      this.setState({ user, loading: false });
    } catch (err) {
      if (err.name !== "AbortError") {
        this.setState({ error: err.message, loading: false });
      }
    }
  }

  connectWebSocket(userId) {
    this.ws = new WebSocket(`wss://status.example.com/${userId}`);
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.setState({ onlineStatus: data.status });
    };
  }

  render() {
    const { user, loading, error, onlineStatus, windowWidth } = this.state;
    const isCompact = windowWidth < 768;

    if (loading) return <div className="spinner">Loading...</div>;
    if (error) return <div className="error">{error}</div>;

    return (
      <div className={`dashboard ${isCompact ? "compact" : "full"}`}>
        <h1>{user.name}</h1>
        <span className={`status ${onlineStatus}`}>{onlineStatus}</span>
        <p>{user.bio}</p>
      </div>
    );
  }
}
```

### Solution (Function Component with Hooks)

```javascript
import { useState, useEffect } from "react";

function UserDashboard({ userId }) {
  // constructor: state initialization → useState
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [onlineStatus, setOnlineStatus] = useState("unknown");
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Derived value: computed during render, no state needed
  const isCompact = windowWidth < 768;

  // Effect 1: Data fetching
  // Maps to: componentDidMount + componentDidUpdate (userId check) + componentWillUnmount (abort)
  // Mental model: "Keep user data synchronized with the current userId"
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    async function fetchUser() {
      try {
        const res = await fetch(`/api/users/${userId}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setUser(data);
        setLoading(false);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    fetchUser();

    // Cleanup: abort fetch if userId changes or component unmounts
    return () => controller.abort();
  }, [userId]); // Re-synchronizes when userId changes

  // Effect 2: WebSocket subscription
  // Maps to: componentDidMount + componentDidUpdate (userId check) + componentWillUnmount (close)
  // Mental model: "Keep online status synchronized with this user's WebSocket feed"
  useEffect(() => {
    const ws = new WebSocket(`wss://status.example.com/${userId}`);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setOnlineStatus(data.status);
    };

    // Cleanup: close WebSocket if userId changes or component unmounts
    return () => ws.close();
  }, [userId]); // Re-synchronizes when userId changes

  // Effect 3: Window resize listener
  // Maps to: componentDidMount (addEventListener) + componentWillUnmount (removeEventListener)
  // Mental model: "Keep windowWidth synchronized with the browser window size"
  useEffect(() => {
    function handleResize() {
      setWindowWidth(window.innerWidth);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []); // No reactive dependencies; window never changes identity

  // render() → the function's return value
  if (loading) return <div className="spinner">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className={`dashboard ${isCompact ? "compact" : "full"}`}>
      <h1>{user.name}</h1>
      <span className={`status ${onlineStatus}`}>{onlineStatus}</span>
      <p>{user.bio}</p>
    </div>
  );
}
```

### Mapping Summary

| Class Concern | Hook Replacement | Key Insight |
|---|---|---|
| `constructor` (state init) | Three `useState` calls | State is split by concern, not bundled |
| `this.handleResize` binding | Inline function in effect | No `this`, no binding needed |
| `componentDidMount` (fetch) | `useEffect(..., [userId])` | Runs on mount AND when userId changes |
| `componentDidMount` (WebSocket) | Separate `useEffect(..., [userId])` | Each concern gets its own effect |
| `componentDidMount` (resize) | `useEffect(..., [])` | Independent of props |
| `componentDidUpdate` (userId check) | Dependency array `[userId]` | No manual prevProps comparison |
| `componentWillUnmount` (abort) | Cleanup return in fetch effect | Colocated with setup |
| `componentWillUnmount` (ws.close) | Cleanup return in WebSocket effect | Colocated with setup |
| `componentWillUnmount` (resize) | Cleanup return in resize effect | Colocated with setup |

### Key Takeaway

The class component mixed three independent concerns (data fetching, WebSocket subscription, window resize tracking) across three lifecycle methods (`componentDidMount`, `componentDidUpdate`, `componentWillUnmount`). The hook version separates these concerns into three independent effects, each with its own setup and cleanup colocated in the same function. The dependency array replaces manual `prevProps` comparisons with a declarative contract: "this effect depends on `userId`." The mental shift from lifecycle events ("when the component mounts/updates/unmounts") to synchronization ("keep this synchronized with these values") produces code that is easier to reason about, less prone to missed cleanup, and naturally handles the mount-update-unmount cycle without three separate code paths.

---

## Chapter Summary

Class component lifecycle methods model time as discrete phases (mounting, updating, unmounting), requiring developers to split related logic across multiple methods. Hooks replace this temporal model with a synchronization model: `useEffect` declares a relationship between reactive values and external systems, and React manages the start/stop cycle automatically. The dependency array is not an optimization hint but a declaration of which values the effect reads, enabling React to re-synchronize precisely when needed. `useEffect(fn, [])` is not equivalent to `componentDidMount` because it captures a snapshot of props and state rather than reading mutable `this.props`/`this.state`. Many common uses of effects (derived state, conditional state resets, data transformations) are unnecessary and should be replaced with computations during render or key-based component reset.

## Further Reading

- [A Complete Guide to useEffect (Dan Abramov)](https://overreacted.io/a-complete-guide-to-useeffect/) — the definitive mental model shift from lifecycle to synchronization
- [Synchronizing with Effects (React Documentation)](https://react.dev/learn/synchronizing-with-effects) — official guide to the synchronization model
- [You Might Not Need an Effect (React Documentation)](https://react.dev/learn/you-might-not-need-an-effect) — anti-patterns and alternatives to unnecessary effects
- [Lifecycle of Reactive Effects (React Documentation)](https://react.dev/learn/lifecycle-of-reactive-effects) — how effects start, stop, and re-synchronize independently of component lifecycle
- [useEffect vs useLayoutEffect (Kent C. Dodds)](https://kentcdodds.com/blog/useeffect-vs-uselayouteffect) — timing differences and when to use each
- [Myths About useEffect (Kent C. Dodds / Epic React)](https://www.epicreact.dev/myths-about-useeffect) — common misconceptions debunked
