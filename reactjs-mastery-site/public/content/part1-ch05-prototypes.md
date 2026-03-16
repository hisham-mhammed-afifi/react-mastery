# Part 1, Chapter 5: Prototypes & Inheritance

## What You Will Learn

- Trace the prototype chain for any object and explain how property lookup delegates through `[[Prototype]]` links
- Distinguish between `__proto__`, `.prototype`, and `Object.getPrototypeOf()`, and identify which to use in modern code
- Explain what the `new` keyword does step by step and how constructor functions create instances
- Describe how ES6 classes map to prototype-based patterns and identify where classes go beyond "syntactic sugar"
- Articulate why React moved from class components to functional components, citing the three official motivations
- Apply the composition-over-inheritance principle in both JavaScript object design and React component architecture
- Implement a simplified React class component from scratch using only prototypes and constructor functions

---

## 5.1 Prototype Chain Visualized

JavaScript does not have classical inheritance in the way Java or C++ do. Instead, objects delegate property lookups to other objects through an internal link called `[[Prototype]]`. This delegation chain is the **prototype chain**.

### How Property Lookup Works

When a property is accessed on an object, the engine follows this algorithm:

1. Check if the object itself has the property (an "own property")
2. If not found, follow the `[[Prototype]]` link to the next object in the chain
3. Repeat step 2, walking up the chain
4. If the chain ends (`[[Prototype]]` is `null`) and the property is still not found, return `undefined`

```javascript
const animal = {
  alive: true,
  breathe() {
    return "breathing";
  },
};

const dog = Object.create(animal); // dog's [[Prototype]] is animal
dog.breed = "Labrador";
dog.bark = function() {
  return "Woof!";
};

const puppy = Object.create(dog); // puppy's [[Prototype]] is dog
puppy.name = "Max";

// Property lookup traces:
console.log(puppy.name);    // "Max"       -- found on puppy itself
console.log(puppy.breed);   // "Labrador"  -- not on puppy, found on dog
console.log(puppy.alive);   // true        -- not on puppy or dog, found on animal
console.log(puppy.bark());  // "Woof!"     -- found on dog
console.log(puppy.breathe()); // "breathing" -- found on animal
console.log(puppy.fly);     // undefined   -- not found anywhere in the chain
```

### Visualizing the Chain

```
puppy                    dog                     animal                Object.prototype
+----------------+      +----------------+      +----------------+    +------------------+
| name: "Max"    |      | breed: "Lab"   |      | alive: true    |    | toString()       |
|                |      | bark: [fn]     |      | breathe: [fn]  |    | hasOwnProperty() |
| [[Prototype]] -+----->| [[Prototype]] -+----->| [[Prototype]] -+--->| valueOf()        |
+----------------+      +----------------+      +----------------+    | [[Prototype]]: null
                                                                      +------------------+
```

Every ordinary object's chain eventually reaches `Object.prototype`, whose own `[[Prototype]]` is `null`. This is the end of the chain.

### Own Properties vs Inherited Properties

The `hasOwnProperty` method (or the modern `Object.hasOwn()`) distinguishes between properties directly on an object and those inherited through the chain.

```javascript
console.log(puppy.hasOwnProperty("name"));   // true  -- own property
console.log(puppy.hasOwnProperty("breed"));  // false -- inherited from dog
console.log(puppy.hasOwnProperty("alive"));  // false -- inherited from animal

// Modern alternative (ES2022):
console.log(Object.hasOwn(puppy, "name"));   // true
console.log(Object.hasOwn(puppy, "breed"));  // false
```

### Property Shadowing

When an object has an own property with the same name as a prototype property, the own property **shadows** (overrides) the inherited one. The prototype's property is not modified.

```javascript
const base = { color: "red" };
const derived = Object.create(base);

console.log(derived.color); // "red" -- inherited from base

derived.color = "blue";     // Creates an OWN property on derived
console.log(derived.color); // "blue" -- own property shadows base.color
console.log(base.color);    // "red"  -- unchanged

delete derived.color;       // Removes the own property
console.log(derived.color); // "red"  -- inheritance resumes
```

> **React Connection:** Property shadowing is conceptually similar to how React component props work. A child component receives props from its parent, but can maintain its own local state that "shadows" the inherited value. When the local state is removed (component resets), the parent's prop value becomes visible again. Understanding delegation and shadowing helps reason about data flow in component trees.

---

## 5.2 `__proto__` vs `prototype` vs `Object.getPrototypeOf()`

These three terms are a persistent source of confusion. They refer to different things and serve different purposes.

### `[[Prototype]]` (Internal Slot)

Every JavaScript object has an internal slot called `[[Prototype]]` that holds a reference to another object (or `null`). This is the actual link that forms the prototype chain. It is not directly accessible as a property; it exists at the engine level.

### `Object.getPrototypeOf(obj)` and `Object.setPrototypeOf(obj, proto)`

These are the **standard, recommended** methods for reading and writing an object's `[[Prototype]]`:

```javascript
const parent = { role: "parent" };
const child = Object.create(parent);

console.log(Object.getPrototypeOf(child) === parent); // true

// Setting a prototype (use sparingly; see performance note below)
const newParent = { role: "adoptive parent" };
Object.setPrototypeOf(child, newParent);
console.log(child.role); // "adoptive parent"
```

### `__proto__` (Deprecated Accessor)

The `__proto__` property is a getter/setter on `Object.prototype` that exposes `[[Prototype]]`. It exists in **Annex B** of the ECMAScript specification (legacy, browser-only features) and is deprecated for use as an accessor.

```javascript
const obj = {};
console.log(obj.__proto__ === Object.prototype); // true

// Deprecated: do not use for getting/setting prototypes
// Use Object.getPrototypeOf() and Object.create() instead
```

However, the `__proto__` syntax **inside object literals** was standardized in ES2022 and is not deprecated:

```javascript
const parent = { greet() { return "hello"; } };

// This syntax is standard and non-deprecated (ES2022+)
const child = {
  __proto__: parent,
  name: "child",
};

console.log(child.greet()); // "hello"
console.log(Object.getPrototypeOf(child) === parent); // true
```

### `FunctionName.prototype` (The Prototype Property on Functions)

Every function (except arrow functions) has a `.prototype` property. This is **not** the function's own prototype. It is the object that becomes the `[[Prototype]]` of instances created with `new FunctionName()`.

```javascript
function Vehicle(type) {
  this.type = type;
}

Vehicle.prototype.describe = function() {
  return `A ${this.type} vehicle`;
};

const car = new Vehicle("sedan");

// car's [[Prototype]] is Vehicle.prototype
console.log(Object.getPrototypeOf(car) === Vehicle.prototype); // true

// Vehicle's OWN [[Prototype]] is Function.prototype (it's a function)
console.log(Object.getPrototypeOf(Vehicle) === Function.prototype); // true

// Vehicle.prototype is NOT Vehicle's [[Prototype]]; it's the blueprint for instances
```

> **Common Mistake:** Confusing `Constructor.prototype` with the constructor's own prototype. `Vehicle.prototype` is the object given to instances. `Object.getPrototypeOf(Vehicle)` is `Function.prototype` (because `Vehicle` is a function). These are entirely different objects serving different purposes.

### Summary Table

| Term | What It Is | How to Access |
|---|---|---|
| `[[Prototype]]` | Internal link forming the chain | Not directly accessible |
| `Object.getPrototypeOf(obj)` | Standard way to read `[[Prototype]]` | `Object.getPrototypeOf(obj)` |
| `Object.setPrototypeOf(obj, proto)` | Standard way to write `[[Prototype]]` | Use sparingly (performance cost) |
| `Object.create(proto)` | Create new object with specified `[[Prototype]]` | Preferred for setting prototype at creation |
| `obj.__proto__` | Deprecated accessor for `[[Prototype]]` | Avoid in favor of standard methods |
| `{ __proto__: proto }` | Object literal syntax for `[[Prototype]]` | Standard (ES2022), safe to use |
| `Constructor.prototype` | Object assigned as `[[Prototype]]` of `new` instances | `Constructor.prototype` |

---

## 5.3 Constructor Functions and the `new` Keyword

Before ES6 classes, constructor functions were the primary mechanism for creating objects with shared behavior. Understanding them is essential because ES6 classes are built on top of this mechanism.

### What `new` Does (Step by Step)

When `new Constructor(args)` is called, the engine performs four operations:

1. **Creates a new empty object**
2. **Sets the new object's `[[Prototype]]`** to `Constructor.prototype`
3. **Calls `Constructor` with `this` bound to the new object**, passing the arguments
4. **Returns the new object** (unless the constructor explicitly returns a different object)

```javascript
function UserAccount(name, email) {
  // Step 3: `this` is the newly created object
  this.name = name;
  this.email = email;
  this.createdAt = Date.now();
  // Step 4: implicit return of `this`
}

// Methods on the prototype are shared across all instances
UserAccount.prototype.getDisplayName = function() {
  return `${this.name} <${this.email}>`;
};

UserAccount.prototype.isOlderThan = function(ms) {
  return Date.now() - this.createdAt > ms;
};

const alice = new UserAccount("Alice", "alice@example.com");
const bob = new UserAccount("Bob", "bob@example.com");

console.log(alice.getDisplayName()); // "Alice <alice@example.com>"
console.log(bob.getDisplayName());   // "Bob <bob@example.com>"

// Both instances share the same prototype methods
console.log(alice.getDisplayName === bob.getDisplayName); // true
```

### Simulating `new` Manually

To verify the four-step process:

```javascript
function simulateNew(Constructor, ...args) {
  // Step 1: Create a new empty object
  const instance = {};

  // Step 2: Set its [[Prototype]] to Constructor.prototype
  Object.setPrototypeOf(instance, Constructor.prototype);

  // Step 3: Call the constructor with `this` = instance
  const result = Constructor.apply(instance, args);

  // Step 4: If the constructor returned an object, use that; otherwise use instance
  return (typeof result === "object" && result !== null) ? result : instance;
}

function Product(name, price) {
  this.name = name;
  this.price = price;
}

Product.prototype.format = function() {
  return `${this.name}: $${this.price}`;
};

const widget = simulateNew(Product, "Widget", 9.99);
console.log(widget.format()); // "Widget: $9.99"
console.log(widget instanceof Product); // true
```

> **See Also:** Part 1, Chapter 4, Section 4.1 for the `new` binding rule and how it takes the highest precedence among the four `this` binding rules.

### The `instanceof` Operator

`instanceof` checks whether `Constructor.prototype` exists anywhere in an object's prototype chain:

```javascript
console.log(alice instanceof UserAccount);  // true
console.log(alice instanceof Object);       // true (Object.prototype is in the chain)
console.log(alice instanceof Array);        // false
```

### Constructor Return Values

If a constructor function explicitly returns an object, `new` uses that object instead of the one it created. If the constructor returns a primitive (or returns nothing), the auto-created object is used.

```javascript
function Quirky() {
  this.normal = true;
  return { overridden: true }; // Explicit object return
}

const q = new Quirky();
console.log(q.normal);     // undefined (the auto-created object was discarded)
console.log(q.overridden); // true (the explicitly returned object is used)
```

---

## 5.4 ES6 Classes: Syntactic Sugar Over Prototypes

ES6 classes provide a cleaner syntax for the constructor-plus-prototype pattern. Internally, they create the same prototype chain structures. However, classes also introduce behaviors that go beyond what prototype syntax alone provides.

### A Class and Its Prototype Equivalent

```javascript
// ES6 class syntax
class TaskItem {
  constructor(title, priority) {
    this.title = title;
    this.priority = priority;
    this.completed = false;
  }

  complete() {
    this.completed = true;
  }

  toString() {
    const status = this.completed ? "done" : "pending";
    return `[${status}] ${this.title} (${this.priority})`;
  }
}

// Equivalent prototype syntax
function TaskItemProto(title, priority) {
  this.title = title;
  this.priority = priority;
  this.completed = false;
}

TaskItemProto.prototype.complete = function() {
  this.completed = true;
};

TaskItemProto.prototype.toString = function() {
  const status = this.completed ? "done" : "pending";
  return `[${status}] ${this.title} (${this.priority})`;
};
```

Both produce the same prototype chain. Instances of `TaskItem` have `TaskItem.prototype` as their `[[Prototype]]`.

### Where Classes Are More Than Sugar

Several class features have no direct prototype-era equivalent:

**1. Classes enforce `new`:**

```javascript
class Widget {}
// Widget(); // TypeError: Class constructor Widget cannot be invoked without 'new'

function WidgetProto() {}
WidgetProto(); // No error -- silently corrupts global scope in non-strict mode
```

**2. Class methods are non-enumerable:**

```javascript
class Example {
  method() {}
}

// method is non-enumerable (does not appear in for...in loops)
console.log(Object.getOwnPropertyDescriptor(Example.prototype, "method").enumerable);
// false

function ExampleProto() {}
ExampleProto.prototype.method = function() {};

// method IS enumerable
console.log(Object.getOwnPropertyDescriptor(ExampleProto.prototype, "method").enumerable);
// true
```

**3. Classes are always in strict mode:**

The entire body of a class runs in strict mode, regardless of the surrounding code.

**4. Private fields and methods (ES2022):**

Truly private members, enforced by the engine, not by naming convention:

```javascript
class BankAccount {
  #balance;              // Private field
  #accountNumber;

  constructor(accountNumber, initialBalance) {
    this.#accountNumber = accountNumber;
    this.#balance = initialBalance;
  }

  deposit(amount) {
    this.#validateAmount(amount);
    this.#balance += amount;
  }

  getBalance() {
    return this.#balance;
  }

  // Private method
  #validateAmount(amount) {
    if (amount <= 0) {
      throw new Error("Amount must be positive");
    }
  }
}

const account = new BankAccount("ACC-001", 1000);
account.deposit(500);
console.log(account.getBalance()); // 1500

// account.#balance;       // SyntaxError: Private field '#balance' must be declared
// account.#validateAmount(100); // SyntaxError
```

**5. Static fields and static initialization blocks (ES2022):**

```javascript
class IdGenerator {
  static #nextId = 1;

  static {
    // Static initialization block: runs once when the class is evaluated
    // Can perform complex setup logic
    if (typeof globalThis.INITIAL_ID === "number") {
      IdGenerator.#nextId = globalThis.INITIAL_ID;
    }
  }

  static generate() {
    return IdGenerator.#nextId++;
  }
}

console.log(IdGenerator.generate()); // 1
console.log(IdGenerator.generate()); // 2
```

### Class Inheritance with `extends` and `super`

```javascript
class Shape {
  constructor(color) {
    this.color = color;
  }

  describe() {
    return `A ${this.color} shape`;
  }
}

class Circle extends Shape {
  constructor(color, radius) {
    super(color); // Calls Shape's constructor with `this` = new Circle instance
    this.radius = radius;
  }

  area() {
    return Math.PI * this.radius ** 2;
  }

  describe() {
    return `A ${this.color} circle with radius ${this.radius}`;
  }
}

const circle = new Circle("blue", 5);
console.log(circle.describe()); // "A blue circle with radius 5"
console.log(circle.area());     // 78.539...
console.log(circle instanceof Circle); // true
console.log(circle instanceof Shape);  // true
```

Under the hood, `extends` sets up two prototype links:
1. `Circle.prototype.[[Prototype]]` = `Shape.prototype` (instance method inheritance)
2. `Circle.[[Prototype]]` = `Shape` (static method inheritance)

> **Common Mistake:** Forgetting to call `super()` in a derived class constructor. If a class `extends` another class, the constructor **must** call `super()` before accessing `this`. Omitting `super()` throws a `ReferenceError`. This requirement exists because the parent constructor is responsible for initializing the object that `this` refers to.

```javascript
class Derived extends Shape {
  constructor(color) {
    // this.color = color; // ReferenceError: Must call super constructor first
    super(color);
    this.extra = true;    // Safe: super() has been called
  }
}
```

---

## 5.5 Why React Moved From Classes to Functions

React's shift from class components to functional components was not a stylistic preference. It was motivated by three concrete problems with classes that the React team documented in the Hooks RFC and accompanying blog posts.

### Problem 1: Stateful Logic Is Hard to Reuse

In class components, stateful logic (data fetching, subscriptions, form handling) is distributed across lifecycle methods: `componentDidMount`, `componentDidUpdate`, `componentWillUnmount`. Extracting this logic for reuse requires patterns like Higher-Order Components (HOCs) or render props, both of which restructure the component tree and create "wrapper hell."

```javascript
// HOC pattern: wraps the original component, adding layers to the tree
function withWindowSize(WrappedComponent) {
  return class extends React.Component {
    state = { width: window.innerWidth };

    componentDidMount() {
      window.addEventListener("resize", this.handleResize);
    }

    componentWillUnmount() {
      window.removeEventListener("resize", this.handleResize);
    }

    handleResize = () => {
      this.setState({ width: window.innerWidth });
    };

    render() {
      return <WrappedComponent windowWidth={this.state.width} {...this.props} />;
    }
  };
}

// Each HOC adds a wrapper component to the tree:
// <WithAuth><WithTheme><WithWindowSize><ActualComponent /></WithWindowSize></WithTheme></WithAuth>
```

Custom hooks solve this without wrappers:

```javascript
function useWindowSize() {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return width;
}

// No wrappers, no tree restructuring
function Dashboard() {
  const width = useWindowSize();
  return <div>Window width: {width}</div>;
}
```

### Problem 2: Related Logic Is Split Across Lifecycle Methods

In class components, a single concern (e.g., subscribing to a data source) is split across `componentDidMount` (subscribe), `componentDidUpdate` (handle changes), and `componentWillUnmount` (unsubscribe). Unrelated concerns are mixed into the same lifecycle method.

```javascript
class ChatRoom extends React.Component {
  componentDidMount() {
    this.subscribeToChat(this.props.roomId);   // Concern A: chat subscription
    document.title = this.props.roomId;         // Concern B: document title
  }

  componentDidUpdate(prevProps) {
    if (prevProps.roomId !== this.props.roomId) {
      this.unsubscribeFromChat(prevProps.roomId); // Concern A
      this.subscribeToChat(this.props.roomId);     // Concern A
      document.title = this.props.roomId;           // Concern B
    }
  }

  componentWillUnmount() {
    this.unsubscribeFromChat(this.props.roomId); // Concern A
  }
  // ...
}
```

With hooks, each concern is self-contained:

```javascript
function ChatRoom({ roomId }) {
  // Concern A: chat subscription (setup + cleanup together)
  useEffect(() => {
    const connection = subscribeToChat(roomId);
    return () => connection.unsubscribe();
  }, [roomId]);

  // Concern B: document title (separate, independent)
  useEffect(() => {
    document.title = roomId;
  }, [roomId]);
}
```

### Problem 3: Classes Confuse People and Machines

The `this` keyword in class components is a constant source of bugs (as covered extensively in Part 1, Chapter 4). Beyond human confusion, classes also present optimization challenges:

- Method names in classes cannot be minified (they are string-keyed properties on the prototype)
- Classes make hot module reloading unreliable (the prototype chain must be carefully preserved)
- Component folding (precomputing parts of the component tree at build time) is harder with classes

> **React Connection:** The React team's official recommendation since React 16.8 (February 2019) is to write all new components as functions with hooks. Class components are not deprecated and will continue to work, but no new React features (concurrent rendering, server components, `use` hook) are designed for classes. Understanding class components remains necessary for maintaining legacy codebases, but new code should use functions exclusively.

---

## 5.6 Composition Over Inheritance (And Why React Chose This)

The Gang of Four's design principle, "favor object composition over class inheritance," is central to React's architecture. React's official documentation states: "At Facebook, we use React in thousands of components, and we haven't found any use cases where we would recommend creating component inheritance hierarchies."

### The Problem with Inheritance Hierarchies

Inheritance creates rigid, tightly coupled hierarchies. Adding behavior requires inserting a new level in the hierarchy, which affects all descendants.

```javascript
// Inheritance approach: rigid hierarchy
class Component {}
class InteractiveComponent extends Component {}
class DraggableComponent extends InteractiveComponent {}
class ResizableComponent extends InteractiveComponent {}
// What if you need both Draggable AND Resizable? Diamond problem.
class DraggableResizableComponent extends ??? {}
```

JavaScript's single-inheritance model (each object has exactly one `[[Prototype]]`) means a class can only extend one parent. Mixins were the traditional workaround, but they introduce implicit dependencies, name collisions, and snowballing complexity.

### Composition in Plain JavaScript

Composition assembles behavior from independent, reusable pieces:

```javascript
// Composable behaviors as factory functions
const withLogging = (base) => ({
  ...base,
  log(message) {
    console.log(`[${base.name}] ${message}`);
  },
});

const withValidation = (base) => ({
  ...base,
  validate(value) {
    return value !== null && value !== undefined;
  },
});

const withFormatting = (base) => ({
  ...base,
  formatCurrency(amount) {
    return `$${amount.toFixed(2)}`;
  },
});

// Compose any combination of behaviors
const productService = withFormatting(
  withValidation(
    withLogging({ name: "ProductService" })
  )
);

productService.log("Starting");          // "[ProductService] Starting"
productService.validate("data");          // true
productService.formatCurrency(19.5);      // "$19.50"
```

### Composition in React Components

React achieves composition through three mechanisms:

**1. Props (configuration):**

```javascript
function Button({ variant, size, children, onClick }) {
  const className = `btn btn-${variant} btn-${size}`;
  return <button className={className} onClick={onClick}>{children}</button>;
}

// Compose via props, not inheritance
<Button variant="primary" size="large">Save</Button>
<Button variant="danger" size="small">Delete</Button>
```

**2. Children (containment):**

```javascript
function Card({ title, children }) {
  return (
    <div className="card">
      <div className="card-header">{title}</div>
      <div className="card-body">{children}</div>
    </div>
  );
}

// Compose any content inside the card
<Card title="User Profile">
  <Avatar user={currentUser} />
  <UserDetails user={currentUser} />
</Card>
```

**3. Custom hooks (behavior):**

```javascript
function useFormField(initialValue, validator) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState(null);

  const onChange = (newValue) => {
    setValue(newValue);
    const validationError = validator(newValue);
    setError(validationError);
  };

  return { value, error, onChange };
}

// Compose form behavior into any component
function RegistrationForm() {
  const email = useFormField("", validateEmail);
  const password = useFormField("", validatePassword);

  return (
    <form>
      <input value={email.value} onChange={e => email.onChange(e.target.value)} />
      {email.error && <span>{email.error}</span>}
      <input value={password.value} onChange={e => password.onChange(e.target.value)} />
      {password.error && <span>{password.error}</span>}
    </form>
  );
}
```

> **React Connection:** React's entire architecture embodies composition. Components compose other components via JSX. Custom hooks compose built-in hooks (`useState`, `useEffect`, `useRef`). Context providers compose configuration into subtrees. At no level does React require or encourage inheritance beyond the now-obsolete `extends React.Component`. This is a deliberate design decision: composition is more flexible, more testable, and avoids the rigidity of inheritance hierarchies.

---

## 5.7 Exercise: Implement a Class Component from Scratch Using Prototypes

### Problem Statement

Build a simplified version of React's class component system using only prototypes and constructor functions (no `class` keyword). Your implementation should:

1. Create a `Component` base constructor with `setState` and a mechanism to trigger re-rendering
2. Implement prototype-based inheritance so that custom components "extend" `Component`
3. Demonstrate method delegation through the prototype chain
4. Show how `this` binding issues arise naturally in this pattern

This exercise reveals the machinery that ES6 class components hide behind syntactic sugar.

### Starter Code

```javascript
// Your task: implement Component and the inheritance mechanism

function Component(props) {
  // Implement: store props, initialize state
}

// Implement: Component.prototype.setState
// Implement: Component.prototype.render (abstract, to be overridden)

// Then create a Counter "class" that extends Component
// using prototype-based inheritance (no `class` keyword)
```

### Solution

```javascript
// ============================================
// Base Component constructor (like React.Component)
// ============================================
function Component(props) {
  this.props = props || {};
  this.state = {};
}

// setState: merge new state and trigger re-render
Component.prototype.setState = function(partialState) {
  // Merge partial state into current state (shallow merge, like React)
  this.state = Object.assign({}, this.state, partialState);

  // Trigger re-render
  this._update();
};

// Internal update mechanism
Component.prototype._update = function() {
  // In real React, this would diff the virtual DOM and apply changes.
  // Here, we simply call render() and log the output.
  const output = this.render();
  console.log("Rendered:", JSON.stringify(output, null, 2));
};

// Default render (to be overridden by subclasses)
Component.prototype.render = function() {
  throw new Error("Component subclass must implement render()");
};

// ============================================
// Counter "class" extending Component
// ============================================
function Counter(props) {
  // Step 1: Call the parent constructor with `this` context
  // This is what `super(props)` does in ES6 class syntax
  Component.call(this, props);

  // Initialize component-specific state
  this.state = { count: props.initialCount || 0 };
}

// Step 2: Set up the prototype chain
// Counter.prototype should delegate to Component.prototype
Counter.prototype = Object.create(Component.prototype);

// Step 3: Fix the constructor reference
// Without this, Counter instances would report their constructor as Component
Counter.prototype.constructor = Counter;

// Step 4: Define Counter-specific methods on its prototype
Counter.prototype.render = function() {
  return {
    type: "div",
    children: [
      { type: "span", text: "Count: " + this.state.count },
      { type: "button", text: "+", onClick: "increment" },
      { type: "button", text: "-", onClick: "decrement" },
    ],
  };
};

Counter.prototype.increment = function() {
  this.setState({ count: this.state.count + 1 });
};

Counter.prototype.decrement = function() {
  this.setState({ count: this.state.count - 1 });
};

// ============================================
// Verify the prototype chain
// ============================================
const counter = new Counter({ initialCount: 5 });

// Prototype chain: counter -> Counter.prototype -> Component.prototype -> Object.prototype
console.log(counter instanceof Counter);   // true
console.log(counter instanceof Component); // true

// render() is found on Counter.prototype (overrides Component.prototype.render)
counter._update();
// Rendered: { type: "div", children: [...] }

// setState is found on Component.prototype (inherited)
counter.increment();
// Rendered: { type: "div", children: [{ text: "Count: 6" }, ...] }

counter.increment();
// Rendered: { type: "div", children: [{ text: "Count: 7" }, ...] }

counter.decrement();
// Rendered: { type: "div", children: [{ text: "Count: 6" }, ...] }

// ============================================
// Demonstrating the `this` binding problem
// ============================================
const incrementFn = counter.increment;
// incrementFn(); // TypeError: Cannot read properties of undefined (reading 'state')
// Method extraction loses `this` binding, exactly the problem React class components had

// Fix 1: bind in the constructor (what React developers did manually)
function CounterWithBinding(props) {
  Component.call(this, props);
  this.state = { count: props.initialCount || 0 };
  // Bind methods to the instance
  this.increment = this.increment.bind(this);
  this.decrement = this.decrement.bind(this);
}

CounterWithBinding.prototype = Object.create(Component.prototype);
CounterWithBinding.prototype.constructor = CounterWithBinding;
CounterWithBinding.prototype.render = Counter.prototype.render;
CounterWithBinding.prototype.increment = Counter.prototype.increment;
CounterWithBinding.prototype.decrement = Counter.prototype.decrement;

const boundCounter = new CounterWithBinding({ initialCount: 0 });
const safeIncrement = boundCounter.increment;
safeIncrement(); // Works! `this` is bound to boundCounter
// Rendered: { type: "div", children: [{ text: "Count: 1" }, ...] }
```

### Prototype Chain Visualization for This Exercise

```
counter (instance)
+----------------------------+
| props: { initialCount: 5 } |
| state: { count: 5 }       |
| [[Prototype]] -------------+---> Counter.prototype
+----------------------------+    +-----------------------------+
                                  | render: [Function]          |
                                  | increment: [Function]       |
                                  | decrement: [Function]       |
                                  | constructor: Counter        |
                                  | [[Prototype]] --------------+---> Component.prototype
                                  +-----------------------------+    +---------------------------+
                                                                     | setState: [Function]      |
                                                                     | _update: [Function]       |
                                                                     | render: [Function] (base) |
                                                                     | [[Prototype]] ------------+---> Object.prototype
                                                                     +---------------------------+
```

### Key Takeaway

ES6 classes hide a significant amount of prototype machinery: calling the parent constructor (`Component.call(this, props)`), setting up the prototype chain (`Object.create(Component.prototype)`), fixing the constructor reference, and manually binding methods for event handlers. The `class`/`extends`/`super` syntax handles all of this automatically. Understanding the prototype-level implementation reveals why class components have `this` binding issues (method extraction from the prototype), why `super()` must be called before `this` in derived constructors (the parent constructor initializes the object), and why React ultimately moved to functional components where none of this machinery is needed.

---

## Chapter Summary

JavaScript's prototype chain is a delegation mechanism where objects link to other objects via `[[Prototype]]` references, with property lookups walking the chain until a match is found or `null` is reached. Constructor functions and the `new` keyword create instances whose `[[Prototype]]` points to `Constructor.prototype`. ES6 classes provide cleaner syntax for this pattern while adding enforcement (must use `new`, strict mode, non-enumerable methods) and new capabilities (private fields, static blocks). React's migration from class components to functional components was driven by three problems with classes: difficulty reusing stateful logic, fragmentation of related code across lifecycle methods, and the inherent complexity of `this`. The composition-over-inheritance principle, which React embodies through props, children, and custom hooks, produces more flexible and maintainable architectures than class hierarchies.

---

## Further Reading

- [MDN: Inheritance and the Prototype Chain](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Inheritance_and_the_prototype_chain) — the authoritative reference on prototype mechanics
- [MDN: The Performance Hazards of `[[Prototype]]` Mutation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/The_performance_hazards_of_prototype_mutation) — why `Object.setPrototypeOf` should be avoided
- [JavaScript Engine Fundamentals: Optimizing Prototypes (Mathias Bynens)](https://mathiasbynens.be/notes/prototypes) — how V8 optimizes prototype chains with hidden classes and inline caches
- [Introducing Hooks (React Documentation)](https://legacy.reactjs.org/docs/hooks-intro.html) — the three official motivations for moving away from classes
- [How Are Function Components Different from Classes? (Dan Abramov)](https://overreacted.io/how-are-function-components-different-from-classes/) — the behavioral difference between mutable `this` and closures
- [Composition vs Inheritance (React Documentation)](https://legacy.reactjs.org/docs/composition-vs-inheritance.html) — React's official stance on preferring composition
- [Mixins Are Dead. Long Live Composition (Dan Abramov)](https://medium.com/@dan_abramov/mixins-are-dead-long-live-higher-order-components-94a0d2f9e750) — the case against mixins and for compositional patterns
