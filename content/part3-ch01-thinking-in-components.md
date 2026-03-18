# Part 3, Chapter 1: Thinking in Components

## What You Will Learn

- Apply concrete heuristics for deciding when to split a component and when to keep it intact
- Articulate the single responsibility principle as it applies to React components, distinguishing between reusable UI components and business-logic components
- Evaluate the container/presentational pattern in the context of hooks and explain why Dan Abramov deprecated it
- Design component prop interfaces that are narrow, composable, and self-documenting
- Use ES6 default parameters to replace the deprecated `defaultProps` and implement runtime validation without TypeScript
- Leverage `children` as a composition primitive for flexible, reusable component architectures
- Decompose a complex UI mockup into a well-structured component tree

---

## 1.1 Component Decomposition: When to Split

Component decomposition is the act of breaking a large component into smaller, focused components. It is one of the most consequential architectural decisions in a React application, and it is frequently done either too aggressively (creating premature abstractions) or too conservatively (producing monolithic components that are difficult to maintain).

### Signals That a Component Should Be Split

**The component manages unrelated state.** When a component holds state for a modal, a form, a tooltip, and a data table, those are four independent concerns sharing a single scope. A state change in the modal triggers a re-render of the entire component, including the table.

```javascript
// Before: one component manages unrelated concerns
function UserDashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [selectedUser, setSelectedUser] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState(null);

  // 200 lines of JSX mixing modal, search, table, and tooltip...
}

// After: each concern is its own component
function UserDashboard() {
  const [selectedUser, setSelectedUser] = useState(null);

  return (
    <div className="dashboard">
      <UserSearch onSelect={setSelectedUser} />
      <UserTable selectedUser={selectedUser} />
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}
```

**The component renders multiple logical sections.** If the JSX tree contains distinct visual regions (a header, a sidebar, a content area, a footer), each region is a natural extraction candidate.

**The same markup appears in multiple places.** Duplicated JSX is the clearest signal for extraction. The duplicated section becomes a reusable component.

**The component is difficult to name.** If a component's purpose cannot be captured in a concise name, it likely has too many responsibilities.

### When NOT to Split

Kent C. Dodds offers a counterbalancing heuristic: "Don't be afraid of a growing component until you start experiencing real problems. It is far easier to maintain a component until it needs to be broken up than to maintain a premature abstraction."

Premature extraction creates problems of its own:

```javascript
// Over-extracted: every visual element is its own component
function ProductCard({ product }) {
  return (
    <ProductCardContainer>
      <ProductCardImageWrapper>
        <ProductCardImage src={product.imageUrl} />
      </ProductCardImageWrapper>
      <ProductCardBody>
        <ProductCardTitle text={product.name} />
        <ProductCardPrice amount={product.price} />
        <ProductCardBadge type={product.badge} />
      </ProductCardBody>
    </ProductCardContainer>
  );
}

// Each of those "components" is just a styled div with one prop.
// The abstraction adds indirection without adding value.
// Better: keep it flat until there is a reason to extract.
function ProductCard({ product }) {
  return (
    <div className="product-card">
      <img src={product.imageUrl} alt={product.name} className="product-image" />
      <div className="product-body">
        <h3 className="product-title">{product.name}</h3>
        <span className="product-price">${product.price.toFixed(2)}</span>
        {product.badge && <span className="badge">{product.badge}</span>}
      </div>
    </div>
  );
}
```

### The Three Legitimate Reasons to Split

1. **Performance.** When a state change in one part of the component causes expensive re-renders in an unrelated part, extracting the unrelated part into a separate component allows React to skip its re-render (via `React.memo` or naturally, if its props do not change).

2. **Reuse.** When the same visual/behavioral unit appears in multiple locations, extracting it eliminates duplication.

3. **Complexity management.** When the component's state, effects, and event handlers become difficult to trace because they intermingle multiple concerns.

---

## 1.2 Single Responsibility for Components

The single responsibility principle (SRP), adapted from object-oriented design, states that a component should have one reason to change. In React terms: a component should encapsulate one logical concern.

### Identifying Responsibilities

A "responsibility" in React maps to one of several categories:

- **Data fetching** for a specific resource
- **State management** for a specific user interaction
- **Rendering** a specific visual unit
- **Orchestrating** the composition of child components

```javascript
// Violation: one component handles fetching, filtering, sorting, and rendering
function ProductCatalog() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => { setProducts(data); setLoading(false); });
  }, []);

  const filtered = products.filter(
    (p) => filter === "all" || p.category === filter
  );
  const sorted = filtered.toSorted((a, b) => {
    if (sortBy === "price") return a.price - b.price;
    return a.name.localeCompare(b.name);
  });

  if (loading) return <Spinner />;

  return (
    <div>
      <FilterBar value={filter} onChange={setFilter} />
      <SortSelect value={sortBy} onChange={setSortBy} />
      <ul>
        {sorted.map((p) => (
          <li key={p.id}>{p.name}: ${p.price}</li>
        ))}
      </ul>
    </div>
  );
}
```

```javascript
// SRP applied: data fetching extracted to a custom hook,
// filtering/sorting is derived state, rendering is the component's job
function useProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/products", { signal: controller.signal })
      .then((res) => res.json())
      .then(setProducts)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  return { products, loading };
}

function ProductCatalog() {
  const { products, loading } = useProducts();
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");

  if (loading) return <Spinner />;

  const visible = products
    .filter((p) => filter === "all" || p.category === filter)
    .toSorted((a, b) =>
      sortBy === "price" ? a.price - b.price : a.name.localeCompare(b.name)
    );

  return (
    <div>
      <FilterBar value={filter} onChange={setFilter} />
      <SortSelect value={sortBy} onChange={setSortBy} />
      <ProductGrid products={visible} />
    </div>
  );
}
```

The component now has one responsibility: orchestrating the catalog view. Data fetching lives in `useProducts`. The grid rendering lives in `ProductGrid`. Filter and sort controls are their own components.

### Reusable vs Business Components

Maintaining a clear separation between two categories of components improves maintainability:

| Category | Examples | Characteristics |
|----------|---------|-----------------|
| **Reusable UI** | Button, Input, Card, Modal, Badge | No business logic; styled; accept generic props; live in a shared `components/` directory |
| **Business** | ProductCatalog, UserProfile, OrderHistory | Combine reusable UI components with domain-specific logic; live in feature directories |

> **See Also:** Part 4, Chapter 8 for design system architecture that formalizes this separation.

---

## 1.3 Container vs Presentational Pattern (Still Useful?)

The container/presentational pattern, popularized by Dan Abramov in 2015, divided components into two categories:

- **Presentational components**: concerned with how things look. Receive data via props, have no state (or only UI state like "is expanded"), and do not call hooks for data fetching.
- **Container components**: concerned with how things work. Fetch data, manage state, and pass data down to presentational components.

```javascript
// The original pattern (pre-hooks)

// Container: handles data fetching and state
class UserListContainer extends React.Component {
  state = { users: [], loading: true };

  componentDidMount() {
    fetch("/api/users")
      .then((res) => res.json())
      .then((users) => this.setState({ users, loading: false }));
  }

  render() {
    return (
      <UserList users={this.state.users} loading={this.state.loading} />
    );
  }
}

// Presentational: pure rendering
function UserList({ users, loading }) {
  if (loading) return <Spinner />;
  return (
    <ul>
      {users.map((u) => (
        <li key={u.id}>{u.name}</li>
      ))}
    </ul>
  );
}
```

### Dan Abramov's Deprecation

In 2019, Abramov added a prominent update to his original article: "I no longer suggest splitting your components like this." His reasoning: hooks allow any component to fetch data and manage state without a wrapper component. A custom hook replaces the container entirely.

```javascript
// Modern equivalent: custom hook replaces the container
function useUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/users", { signal: controller.signal })
      .then((res) => res.json())
      .then(setUsers)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  return { users, loading };
}

// The component uses the hook directly; no container needed
function UserList() {
  const { users, loading } = useUsers();

  if (loading) return <Spinner />;
  return (
    <ul>
      {users.map((u) => (
        <li key={u.id}>{u.name}</li>
      ))}
    </ul>
  );
}
```

### When the Pattern Still Has Value

The underlying principle (separating data logic from rendering) remains sound. The mechanism changed from "two components" to "a hook and a component." In certain contexts, the explicit two-component split still adds value:

- **Design system libraries** benefit from purely presentational components that accept data via props and contain zero side effects. This makes them portable across applications.
- **Large teams** sometimes enforce the split to ensure clear responsibilities during code review.
- **Testing**: presentational components are trivially testable by passing props; logic-heavy hooks are testable in isolation via `renderHook`.

---

## 1.4 Smart vs Dumb Components (The Modern Take)

"Smart" and "dumb" are informal aliases for container and presentational, respectively. The modern interpretation, informed by hooks, reframes the distinction:

| Aspect | "Smart" (Logic-Bearing) | "Dumb" (Pure Rendering) |
|--------|------------------------|------------------------|
| Calls hooks | Yes (`useState`, `useEffect`, custom hooks) | Minimal (perhaps `useState` for local UI state only) |
| Manages side effects | Yes (data fetching, subscriptions) | No |
| Awareness of application domain | Yes (knows about users, products, orders) | No (knows about visual props: text, color, onClick) |
| Reusability | Low (coupled to specific features) | High (used across features) |

```javascript
// "Dumb" component: knows nothing about the application domain
function DataTable({ columns, rows, onRowClick, emptyMessage }) {
  if (rows.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.id ?? i} onClick={() => onRowClick?.(row)}>
            {columns.map((col) => (
              <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// "Smart" component: knows about orders, uses the generic DataTable
function OrderHistory() {
  const { orders, loading } = useOrders();

  const columns = [
    { key: "id", label: "Order #" },
    { key: "date", label: "Date", render: (row) => formatDate(row.date) },
    { key: "total", label: "Total", render: (row) => `$${row.total.toFixed(2)}` },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
  ];

  if (loading) return <Spinner />;

  return (
    <DataTable
      columns={columns}
      rows={orders}
      onRowClick={(order) => navigate(`/orders/${order.id}`)}
      emptyMessage="No orders yet."
    />
  );
}
```

> **Common Mistake:** Developers sometimes pass domain-specific props through generic components, coupling them to the application. A `DataTable` that accepts an `orders` prop instead of a generic `rows` prop cannot be reused for a user list or a product list. Keep reusable components domain-agnostic by accepting generic prop names and using render functions or composition for domain-specific formatting.

---

## 1.5 Component API Design: Props as a Public Interface

A component's props are its public API. Well-designed props make the component intuitive to use, hard to misuse, and easy to extend.

### Principles of Good Prop Design

**Narrow interfaces.** Accept only the data the component needs. A `UserAvatar` should accept `name` and `imageUrl`, not an entire `user` object. This reduces coupling and makes the component's dependencies explicit.

```javascript
// Overly broad: coupled to the entire user shape
function UserAvatar({ user }) {
  return <img src={user.profile.avatarUrl} alt={user.displayName} />;
}

// Narrow: accepts only what it renders
function UserAvatar({ imageUrl, name, size = 40 }) {
  return (
    <img
      src={imageUrl}
      alt={name}
      width={size}
      height={size}
      className="avatar"
    />
  );
}
```

**Consistent naming conventions.** Follow established patterns:

| Pattern | Convention | Example |
|---------|-----------|---------|
| Event handlers | `on` + event name | `onClick`, `onChange`, `onSubmit` |
| Boolean flags | `is` or `has` prefix | `isDisabled`, `isLoading`, `hasError` |
| Render callbacks | `render` prefix | `renderHeader`, `renderItem` |
| Content slots | Descriptive noun | `header`, `footer`, `icon` |

**Avoid boolean prop explosion.** When a component accumulates many boolean flags, it is often a sign that a single `variant` or `type` prop would be clearer:

```javascript
// Boolean explosion: hard to remember valid combinations
<Button primary large outline rounded />

// Structured variants: clear, constrained options
<Button variant="primary" size="lg" style="outline" />
```

**Spread remaining props.** For components that wrap native HTML elements, accept and spread additional props so consumers can add `className`, `id`, `aria-*` attributes, and event handlers without the component needing to declare each one:

```javascript
function TextInput({ label, error, ...rest }) {
  const id = useId();
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={`input ${error ? "input-error" : ""}`}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        {...rest}
      />
      {error && <p id={`${id}-error`} className="error-text">{error}</p>}
    </div>
  );
}
```

---

## 1.6 Default Props and Prop Validation (Runtime Checks Without TS)

### defaultProps: Deprecated for Function Components in React 19

React 19 removed `defaultProps` support for function components entirely. The replacement is ES6 default parameter syntax in the destructuring pattern:

```javascript
// Deprecated (React 19 ignores this for function components)
function Pagination({ page, pageSize, total }) { /* ... */ }
Pagination.defaultProps = { page: 1, pageSize: 20 };

// Modern replacement: ES6 default parameters
function Pagination({ page = 1, pageSize = 20, total }) {
  const totalPages = Math.ceil(total / pageSize);

  return (
    <nav aria-label="Pagination">
      <span>Page {page} of {totalPages}</span>
    </nav>
  );
}
```

Class components still support `defaultProps` because class syntax does not support parameter destructuring in the same way.

### PropTypes: Removed in React 19

PropTypes checks are completely removed in React 19. The `prop-types` package still exists for backward compatibility, but React no longer calls it. No console warnings appear for invalid props.

### Runtime Validation Alternatives

For applications written in pure JavaScript (without TypeScript), runtime validation at component boundaries remains valuable. Two modern approaches:

**JSDoc annotations** provide editor support (autocomplete, hover documentation) without runtime cost:

```javascript
/**
 * @param {Object} props
 * @param {string} props.title - The card's heading text
 * @param {string} [props.subtitle] - Optional subheading
 * @param {React.ReactNode} props.children - Card body content
 * @param {'default' | 'elevated' | 'outlined'} [props.variant='default']
 */
function Card({ title, subtitle, children, variant = "default" }) {
  return (
    <div className={`card card-${variant}`}>
      <h3>{title}</h3>
      {subtitle && <p className="subtitle">{subtitle}</p>}
      <div className="card-body">{children}</div>
    </div>
  );
}
```

**Schema validation libraries** (Zod, Valibot) provide runtime validation for critical boundaries:

```javascript
import { z } from "zod";

const ProductSchema = z.object({
  id: z.number(),
  name: z.string().min(1),
  price: z.number().positive(),
  category: z.enum(["electronics", "clothing", "books"]),
});

function ProductCard({ product }) {
  // Validate at the boundary (development only)
  if (process.env.NODE_ENV !== "production") {
    ProductSchema.parse(product);
  }

  return (
    <div className="product-card">
      <h3>{product.name}</h3>
      <span>${product.price.toFixed(2)}</span>
    </div>
  );
}
```

> **Common Mistake:** Developers upgrading to React 19 sometimes find that their `defaultProps` silently stop working. Function components with `defaultProps` will receive `undefined` for omitted props instead of the default values. The fix is straightforward: move defaults into the destructuring pattern. An automated codemod is available: `npx types-react-codemod@latest preset-19 ./src`.

---

## 1.7 Children as the Most Powerful Prop

The `children` prop is React's primary composition mechanism. Anything placed between a component's opening and closing JSX tags is passed as `props.children`. This enables a pattern where the parent component controls the layout, styling, and behavior, while the consumer controls the content.

### Basic Composition

```javascript
function Panel({ title, children }) {
  return (
    <section className="panel">
      <h2 className="panel-title">{title}</h2>
      <div className="panel-body">{children}</div>
    </section>
  );
}

// Consumer controls content; Panel controls structure
function App() {
  return (
    <Panel title="User Settings">
      <ProfileForm />
      <NotificationPreferences />
      <DangerZone />
    </Panel>
  );
}
```

### Children as a Performance Optimization

Passing components as children rather than rendering them inside a parent can prevent unnecessary re-renders:

```javascript
// Problem: ExpensiveChild re-renders every time count changes
function Parent() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <button onClick={() => setCount((c) => c + 1)}>{count}</button>
      <ExpensiveChild /> {/* Re-renders on every count change */}
    </div>
  );
}

// Solution: lift ExpensiveChild to a higher level and pass as children
function CounterWrapper({ children }) {
  const [count, setCount] = useState(0);

  return (
    <div>
      <button onClick={() => setCount((c) => c + 1)}>{count}</button>
      {children} {/* children is the same reference; does not re-render */}
    </div>
  );
}

function App() {
  return (
    <CounterWrapper>
      <ExpensiveChild />
    </CounterWrapper>
  );
}
```

In the second version, `ExpensiveChild` is created by `App` and passed as `children` to `CounterWrapper`. When `count` changes, `CounterWrapper` re-renders, but `children` is the same JSX element reference (created by `App`, which did not re-render), so `ExpensiveChild` does not re-render.

> **See Also:** Part 2, Chapter 5, Section 5.1 for the complete list of re-render triggers and why children composition prevents propagation.

### Named Slots via Props

For components that need content in multiple specific locations, named props (sometimes called "slots") complement `children`:

```javascript
function PageLayout({ header, sidebar, children, footer }) {
  return (
    <div className="page-layout">
      <header className="page-header">{header}</header>
      <div className="page-body">
        <aside className="page-sidebar">{sidebar}</aside>
        <main className="page-content">{children}</main>
      </div>
      <footer className="page-footer">{footer}</footer>
    </div>
  );
}

function DashboardPage() {
  return (
    <PageLayout
      header={<Navigation />}
      sidebar={<DashboardSidebar />}
      footer={<FooterLinks />}
    >
      <DashboardContent />
    </PageLayout>
  );
}
```

### Compound Components

Compound components are a set of components that work together, sharing implicit state through Context. The parent establishes the state; children consume it without explicit prop threading.

```javascript
import { createContext, useContext, useState } from "react";

const AccordionContext = createContext(null);

function Accordion({ children, allowMultiple = false }) {
  const [openItems, setOpenItems] = useState(new Set());

  function toggle(id) {
    setOpenItems((prev) => {
      const next = new Set(allowMultiple ? prev : []);
      if (prev.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <AccordionContext.Provider value={{ openItems, toggle }}>
      <div className="accordion">{children}</div>
    </AccordionContext.Provider>
  );
}

function AccordionItem({ id, title, children }) {
  const { openItems, toggle } = useContext(AccordionContext);
  const isOpen = openItems.has(id);

  return (
    <div className="accordion-item">
      <button
        className="accordion-header"
        onClick={() => toggle(id)}
        aria-expanded={isOpen}
      >
        {title}
        <span className={`chevron ${isOpen ? "open" : ""}`} />
      </button>
      {isOpen && <div className="accordion-body">{children}</div>}
    </div>
  );
}

// Usage: clean, declarative API
function FAQ() {
  return (
    <Accordion>
      <AccordionItem id="q1" title="What is React?">
        <p>React is a JavaScript library for building user interfaces.</p>
      </AccordionItem>
      <AccordionItem id="q2" title="What are hooks?">
        <p>Hooks are functions that let you use state and lifecycle features.</p>
      </AccordionItem>
      <AccordionItem id="q3" title="What is JSX?">
        <p>JSX is syntactic sugar for React.createElement calls.</p>
      </AccordionItem>
    </Accordion>
  );
}
```

> **See Also:** Part 3, Chapter 3 for advanced composition patterns including render props, higher-order components, and the provider pattern.

---

## 1.8 Exercise: Decompose a Complex UI into a Component Tree

### Problem Statement

Given the following mockup description of an e-commerce product page, decompose it into a component tree. For each component, specify: its name, its props, whether it is reusable or business-specific, and where state should live.

**Mockup Description:**
- A sticky header with a logo, search bar, cart icon with item count badge
- A breadcrumb trail (Home > Electronics > Headphones)
- A product section containing:
  - An image gallery (main image + thumbnail strip)
  - Product title, price (with optional sale price), star rating, review count
  - A "Select Size" dropdown
  - An "Add to Cart" button (disabled when out of stock)
  - A tabbed section: Description, Specifications, Reviews
- A "Related Products" carousel at the bottom
- A footer with links

### Solution

```javascript
// ============================================
// Component Tree (hierarchical)
// ============================================
// <App>
//   <StickyHeader>                    [reusable, layout]
//     <Logo />                        [reusable]
//     <SearchBar />                   [reusable, owns: query state]
//     <CartIcon count={itemCount} />  [reusable]
//   </StickyHeader>
//
//   <Breadcrumb items={[...]} />      [reusable]
//
//   <ProductPage>                     [business, owns: selectedSize, activeTab]
//     <ProductGallery>                [reusable, owns: selectedImageIndex]
//       <MainImage src={...} />       [reusable]
//       <ThumbnailStrip              [reusable]
//         images={[...]}
//         selected={index}
//         onSelect={fn}
//       />
//     </ProductGallery>
//
//     <ProductInfo>                   [business]
//       <h1>{title}</h1>
//       <PriceDisplay                [reusable]
//         price={price}
//         salePrice={salePrice}
//       />
//       <StarRating                  [reusable]
//         rating={4.5}
//         reviewCount={128}
//       />
//       <SizeSelector                [reusable, callback: onSelect]
//         sizes={[...]}
//         selected={selectedSize}
//         onSelect={fn}
//       />
//       <AddToCartButton             [business]
//         disabled={!inStock}
//         onClick={fn}
//       />
//     </ProductInfo>
//
//     <TabPanel                      [reusable, owns: activeTab]
//       tabs={[
//         { id: "desc", label: "Description", content: <Description /> },
//         { id: "specs", label: "Specifications", content: <SpecTable /> },
//         { id: "reviews", label: "Reviews", content: <ReviewList /> },
//       ]}
//     />
//   </ProductPage>
//
//   <RelatedProducts products={[...]} />  [business]
//   <Footer />                            [reusable]
// </App>

// ============================================
// Implementation of key components
// ============================================

// Reusable: PriceDisplay (knows nothing about products)
function PriceDisplay({ price, salePrice }) {
  const hasDiscount = salePrice != null && salePrice < price;

  return (
    <div className="price-display">
      {hasDiscount && (
        <span className="price-original">${price.toFixed(2)}</span>
      )}
      <span className={hasDiscount ? "price-sale" : "price"}>
        ${(hasDiscount ? salePrice : price).toFixed(2)}
      </span>
      {hasDiscount && (
        <span className="price-discount">
          {Math.round((1 - salePrice / price) * 100)}% off
        </span>
      )}
    </div>
  );
}

// Reusable: StarRating (generic rating display)
function StarRating({ rating, reviewCount, maxStars = 5 }) {
  return (
    <div className="star-rating" aria-label={`${rating} out of ${maxStars} stars`}>
      {Array.from({ length: maxStars }, (_, i) => (
        <span
          key={i}
          className={`star ${i < Math.round(rating) ? "filled" : "empty"}`}
        >
          ★
        </span>
      ))}
      {reviewCount != null && (
        <span className="review-count">({reviewCount} reviews)</span>
      )}
    </div>
  );
}

// Reusable: TabPanel (generic tabbed container)
function TabPanel({ tabs, defaultTab }) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? tabs[0]?.id);
  const activeContent = tabs.find((t) => t.id === activeTab)?.content;

  return (
    <div className="tab-panel">
      <div className="tab-bar" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="tab-content" role="tabpanel">
        {activeContent}
      </div>
    </div>
  );
}

// Business: ProductPage (orchestrates the product view)
function ProductPage({ productId }) {
  const { product, loading } = useProduct(productId);
  const [selectedSize, setSelectedSize] = useState(null);
  const { addToCart } = useCart();

  if (loading) return <Spinner />;
  if (!product) return <NotFound />;

  return (
    <div className="product-page">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: product.category, href: `/category/${product.categorySlug}` },
          { label: product.name },
        ]}
      />

      <div className="product-layout">
        <ProductGallery images={product.images} />

        <div className="product-info">
          <h1>{product.name}</h1>
          <PriceDisplay price={product.price} salePrice={product.salePrice} />
          <StarRating rating={product.rating} reviewCount={product.reviewCount} />

          <SizeSelector
            sizes={product.sizes}
            selected={selectedSize}
            onSelect={setSelectedSize}
          />

          <button
            className="add-to-cart-btn"
            disabled={!product.inStock || !selectedSize}
            onClick={() => addToCart(product.id, selectedSize)}
          >
            {product.inStock ? "Add to Cart" : "Out of Stock"}
          </button>
        </div>
      </div>

      <TabPanel
        tabs={[
          { id: "desc", label: "Description", content: <p>{product.description}</p> },
          { id: "specs", label: "Specifications", content: <SpecTable specs={product.specs} /> },
          { id: "reviews", label: "Reviews", content: <ReviewList productId={product.id} /> },
        ]}
      />

      <RelatedProducts categoryId={product.categoryId} excludeId={product.id} />
    </div>
  );
}
```

### Decomposition Decisions Explained

| Decision | Reasoning |
|----------|-----------|
| `PriceDisplay` is reusable | Used for product cards, cart items, order history |
| `StarRating` is reusable | Used for product pages, review cards, seller profiles |
| `TabPanel` is reusable | Used for product details, user settings, documentation |
| `ProductPage` is business | Orchestrates domain-specific components with product data |
| `selectedSize` state lives in `ProductPage` | It is specific to the purchase flow, not to any child component |
| `activeTab` state lives in `TabPanel` | Tab selection is internal UI state; the parent does not need it |
| `ProductGallery` owns `selectedImageIndex` | Image selection is internal to the gallery interaction |
| `SearchBar` owns `query` state | The search input is a self-contained interaction |

### Key Takeaway

Component decomposition is driven by three forces: reusability (will this exact UI appear elsewhere?), responsibility separation (does this component have one clear purpose?), and state locality (which component is the lowest common ancestor that needs this state?). Reusable components accept generic props and know nothing about the application domain. Business components combine reusable components with domain-specific data and behavior. The `children` prop and named slot props (header, footer, content) enable flexible composition without tight coupling.

---

## Chapter Summary

Thinking in components requires balancing extraction against premature abstraction. The three legitimate reasons to split a component are performance isolation, code reuse, and complexity management. The container/presentational pattern has been superseded by custom hooks for logic extraction, though the principle of separating concerns remains valid. Component prop interfaces should be narrow, consistently named, and use ES6 default parameters (not the deprecated `defaultProps`). The `children` prop is React's most powerful composition tool, enabling patterns from simple content slots to compound components with shared implicit state via Context. Every decomposition decision should answer: what is this component's single responsibility, and where does its state belong?

## Further Reading

- [Thinking in React (React Documentation)](https://react.dev/learn/thinking-in-react) — the official guide to the component mindset
- [When to Break Up a Component into Multiple Components (Kent C. Dodds)](https://kentcdodds.com/blog/when-to-break-up-a-component-into-multiple-components) — practical heuristics for decomposition
- [Presentational and Container Components (patterns.dev)](https://www.patterns.dev/react/presentational-container-pattern/) — the pattern's history and modern status
- [React Components Composition: How to Get It Right (developerway.com)](https://www.developerway.com/posts/components-composition-how-to-get-it-right) — composition strategies and anti-patterns
- [Compound Components with React Hooks (Kent C. Dodds)](https://kentcdodds.com/blog/compound-components-with-react-hooks) — the Context-based compound component pattern
- [React 19 Upgrade Guide (React Documentation)](https://react.dev/blog/2024/04/25/react-19-upgrade-guide) — defaultProps and PropTypes removal details
