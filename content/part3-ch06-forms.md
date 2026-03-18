# Part 3, Chapter 6: Forms - The Complete Guide

## What You Will Learn

- Implement controlled forms (React owns the state) and uncontrolled forms (the DOM owns the state) and select the correct approach based on validation needs and performance requirements
- Apply three validation timing strategies (on change, on blur, on submit) and integrate schema validation with Zod
- Build a reusable form hook that encapsulates state management, validation, and submission logic
- Manage complex form state including dynamic field arrays, nested objects, and conditional fields
- Use React Hook Form's uncontrolled architecture for high-performance forms with fine-grained re-render control
- Implement multi-step wizard forms with per-step validation, state persistence, and navigation
- Handle file uploads and debounced inputs within React's rendering model

---

## 6.1 Controlled Forms: React Owns the State

In a controlled form, every input's value is stored in React state. The component re-renders on every keystroke, and the displayed value always reflects the state.

```javascript
function ContactForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    console.log("Submitting:", formData);
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Name
        <input name="name" value={formData.name} onChange={handleChange} />
      </label>
      <label>
        Email
        <input name="email" type="email" value={formData.email} onChange={handleChange} />
      </label>
      <label>
        Message
        <textarea name="message" value={formData.message} onChange={handleChange} />
      </label>
      <button type="submit">Send</button>
    </form>
  );
}
```

### Advantages of Controlled Forms

- **Real-time access to values.** Validation, character counts, conditional rendering, and derived computations can happen on every keystroke.
- **Single source of truth.** The React state is always authoritative; the input value cannot diverge from it.
- **Programmatic control.** Reset fields, set values from API responses, or transform input (e.g., uppercase) by modifying state.

### Disadvantages

- **Re-render on every keystroke.** For forms with 20+ fields, this can cause noticeable performance degradation as the entire form component (and its children) re-renders.
- **Boilerplate.** Each field requires a value prop, an onChange handler, and corresponding state management.

---

## 6.2 Uncontrolled Forms: The DOM Owns the State

In an uncontrolled form, the DOM manages input values internally. React reads values only when needed (typically on submit) via refs or the `FormData` API.

```javascript
function QuickFeedbackForm() {
  function handleSubmit(e) {
    e.preventDefault();
    // Read values from the DOM via FormData
    const formData = new FormData(e.target);
    const data = {
      rating: formData.get("rating"),
      comment: formData.get("comment"),
    };
    console.log("Submitting:", data);
    e.target.reset(); // Reset the form natively
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Rating
        <select name="rating" defaultValue="5">
          <option value="5">Excellent</option>
          <option value="4">Good</option>
          <option value="3">Average</option>
          <option value="2">Poor</option>
          <option value="1">Terrible</option>
        </select>
      </label>
      <label>
        Comment
        <textarea name="comment" defaultValue="" placeholder="Optional feedback..." />
      </label>
      <button type="submit">Submit</button>
    </form>
  );
}
```

### Advantages of Uncontrolled Forms

- **Zero re-renders during typing.** The DOM handles input state; React is not involved until submission.
- **Minimal boilerplate.** No `useState`, no `onChange` handlers per field.
- **Native form behavior.** Works with browser autofill, password managers, and progressive enhancement.

### React 19: Form Actions

React 19 introduced the `action` prop on `<form>`, enabling a hybrid model where uncontrolled forms submit directly to a function:

```javascript
function SubscribeForm() {
  async function subscribe(formData) {
    const email = formData.get("email");
    await fetch("/api/subscribe", {
      method: "POST",
      body: JSON.stringify({ email }),
      headers: { "Content-Type": "application/json" },
    });
  }

  return (
    <form action={subscribe}>
      <input name="email" type="email" required placeholder="your@email.com" />
      <button type="submit">Subscribe</button>
    </form>
  );
}
```

When the form submits, React calls the `action` function with a `FormData` object containing all named inputs. React automatically wraps the action in a transition, and resets the form on success for uncontrolled inputs.

> **See Also:** Part 2, Chapter 8, Section 8.3 for how transitions work and how `useActionState` provides pending state for form actions.

---

## 6.3 When to Use Each Approach

| Factor | Controlled | Uncontrolled |
|--------|-----------|-------------|
| Real-time validation | Yes (every keystroke) | Limited (on blur or submit) |
| Conditional field rendering based on input | Yes | Difficult |
| Character count / live preview | Yes | Difficult |
| Performance with many fields | Degrades (re-renders) | Excellent (no re-renders) |
| Integration with UI component libraries | Expected (most require value+onChange) | Requires Controller/adapter |
| Form reset | `setState(initialValues)` | `formRef.current.reset()` |
| Best for | Interactive forms, small to medium size | Large forms, surveys, simple submissions |

> **Common Mistake:** Mixing controlled and uncontrolled patterns on the same input. Setting both `value` and `defaultValue`, or setting `value` without `onChange`, produces warnings and broken behavior. An input must be either controlled (value + onChange) or uncontrolled (defaultValue, no value prop) for its entire lifetime.

---

## 6.4 Form Validation Patterns (On Change, On Blur, On Submit)

### On Submit Validation

Validation runs only when the user submits. This is the least intrusive approach; the user is never interrupted while filling out the form.

```javascript
function OnSubmitForm() {
  const [errors, setErrors] = useState({});

  function validate(data) {
    const errors = {};
    if (!data.name.trim()) errors.name = "Name is required";
    if (!data.email.includes("@")) errors.email = "Invalid email address";
    if (data.password.length < 8) errors.password = "Password must be at least 8 characters";
    return errors;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    const validationErrors = validate(data);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    submitToServer(data);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <input name="name" placeholder="Full name" />
        {errors.name && <span className="error">{errors.name}</span>}
      </div>
      <div>
        <input name="email" type="email" placeholder="Email" />
        {errors.email && <span className="error">{errors.email}</span>}
      </div>
      <div>
        <input name="password" type="password" placeholder="Password" />
        {errors.password && <span className="error">{errors.password}</span>}
      </div>
      <button type="submit">Register</button>
    </form>
  );
}
```

### On Blur Validation

Validation runs when a field loses focus. The user gets feedback after completing a field but is not interrupted while typing.

```javascript
function OnBlurForm() {
  const [values, setValues] = useState({ email: "", age: "" });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  function validateField(name, value) {
    if (name === "email" && !value.includes("@")) return "Invalid email";
    if (name === "age" && (isNaN(value) || value < 18)) return "Must be 18+";
    return null;
  }

  function handleBlur(e) {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const error = validateField(name, value);
    setErrors((prev) => ({ ...prev, [name]: error }));
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    // Clear error on change if field was previously touched
    if (touched[name]) {
      const error = validateField(name, value);
      setErrors((prev) => ({ ...prev, [name]: error }));
    }
  }

  return (
    <form>
      <input
        name="email"
        value={values.email}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="Email"
      />
      {touched.email && errors.email && <span className="error">{errors.email}</span>}

      <input
        name="age"
        value={values.age}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="Age"
      />
      {touched.age && errors.age && <span className="error">{errors.age}</span>}
    </form>
  );
}
```

### On Change Validation

Validation runs on every keystroke. Provides immediate feedback but can feel aggressive. Best for specific fields like password strength indicators.

### Schema Validation with Zod

Rather than writing validation logic per field, define a schema that validates the entire form data at once:

```javascript
import { z } from "zod";

const registrationSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email address"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain at least one uppercase letter")
    .regex(/[0-9]/, "Must contain at least one number"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

function validateForm(data) {
  const result = registrationSchema.safeParse(data);
  if (result.success) return {};

  // Transform Zod errors into a field-keyed object
  const errors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}
```

---

## 6.5 Building a Reusable Form Hook

A custom `useForm` hook encapsulates state, validation, touched tracking, and submission:

```javascript
function useForm({ initialValues, validate, onSubmit }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    const fieldValue = type === "checkbox" ? checked : value;

    setValues((prev) => ({ ...prev, [name]: fieldValue }));

    // Re-validate touched fields on change (clear errors as user corrects)
    if (touched[name] && validate) {
      const fieldErrors = validate({ ...values, [name]: fieldValue });
      setErrors((prev) => ({ ...prev, [name]: fieldErrors[name] || null }));
    }
  }

  function handleBlur(e) {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));

    if (validate) {
      const fieldErrors = validate(values);
      setErrors((prev) => ({ ...prev, [name]: fieldErrors[name] || null }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // Mark all fields as touched
    const allTouched = Object.keys(values).reduce(
      (acc, key) => ({ ...acc, [key]: true }),
      {}
    );
    setTouched(allTouched);

    // Run full validation
    const validationErrors = validate ? validate(values) : {};
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  }

  function getFieldProps(name) {
    return {
      name,
      value: values[name] ?? "",
      onChange: handleChange,
      onBlur: handleBlur,
    };
  }

  function getFieldError(name) {
    return touched[name] ? errors[name] : null;
  }

  return {
    values,
    errors,
    touched,
    submitting,
    handleSubmit,
    getFieldProps,
    getFieldError,
    reset,
    setValues,
  };
}

// Usage
function RegistrationForm() {
  const form = useForm({
    initialValues: { name: "", email: "", password: "", confirmPassword: "" },
    validate: (values) => validateForm(values), // Uses the Zod schema from Section 6.4
    onSubmit: async (values) => {
      await fetch("/api/register", {
        method: "POST",
        body: JSON.stringify(values),
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  return (
    <form onSubmit={form.handleSubmit}>
      <FormField label="Name" error={form.getFieldError("name")}>
        <input {...form.getFieldProps("name")} />
      </FormField>
      <FormField label="Email" error={form.getFieldError("email")}>
        <input {...form.getFieldProps("email")} type="email" />
      </FormField>
      <FormField label="Password" error={form.getFieldError("password")}>
        <input {...form.getFieldProps("password")} type="password" />
      </FormField>
      <FormField label="Confirm Password" error={form.getFieldError("confirmPassword")}>
        <input {...form.getFieldProps("confirmPassword")} type="password" />
      </FormField>
      <button type="submit" disabled={form.submitting}>
        {form.submitting ? "Registering..." : "Register"}
      </button>
    </form>
  );
}

function FormField({ label, error, children }) {
  const id = useId();
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {React.cloneElement(children, { id, "aria-invalid": !!error })}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
```

---

## 6.6 Complex Form State: Dynamic Fields, Nested Objects, Arrays

### Dynamic Field Arrays

```javascript
function InvoiceForm() {
  const [lineItems, setLineItems] = useState([
    { id: crypto.randomUUID(), description: "", quantity: 1, price: 0 },
  ]);

  function addItem() {
    setLineItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: "", quantity: 1, price: 0 },
    ]);
  }

  function removeItem(id) {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  }

  function updateItem(id, field, value) {
    setLineItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  }

  // Derived: compute total during render
  const total = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0
  );

  return (
    <form>
      {lineItems.map((item, index) => (
        <div key={item.id} className="line-item">
          <input
            value={item.description}
            onChange={(e) => updateItem(item.id, "description", e.target.value)}
            placeholder="Description"
          />
          <input
            type="number"
            value={item.quantity}
            onChange={(e) => updateItem(item.id, "quantity", parseInt(e.target.value) || 0)}
            min="1"
          />
          <input
            type="number"
            value={item.price}
            onChange={(e) => updateItem(item.id, "price", parseFloat(e.target.value) || 0)}
            step="0.01"
          />
          <span>${(item.quantity * item.price).toFixed(2)}</span>
          {lineItems.length > 1 && (
            <button type="button" onClick={() => removeItem(item.id)}>Remove</button>
          )}
        </div>
      ))}
      <button type="button" onClick={addItem}>Add Line Item</button>
      <p className="total">Total: ${total.toFixed(2)}</p>
    </form>
  );
}
```

> **Common Mistake:** Using array index as the key for dynamic field arrays. When items are removed from the middle, React reuses DOM nodes by index, causing input values to shift to wrong items. Always use a stable, unique identifier (a UUID generated at item creation time) as the key.

---

## 6.7 React Hook Form: Architecture and Patterns

React Hook Form (RHF) uses uncontrolled inputs by default, storing values via DOM refs. This eliminates re-renders during typing, making it significantly faster than controlled form libraries for large forms.

```javascript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  role: z.enum(["admin", "editor", "viewer"], { message: "Select a role" }),
});

function UserForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", role: "viewer" },
    mode: "onBlur", // Validate on blur; re-validate on change
  });

  async function onSubmit(data) {
    // data is typed and validated by Zod
    await fetch("/api/users", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    });
    reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <input {...register("name")} placeholder="Full name" />
        {errors.name && <span className="error">{errors.name.message}</span>}
      </div>
      <div>
        <input {...register("email")} type="email" placeholder="Email" />
        {errors.email && <span className="error">{errors.email.message}</span>}
      </div>
      <div>
        <select {...register("role")}>
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
        {errors.role && <span className="error">{errors.role.message}</span>}
      </div>
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving..." : "Create User"}
      </button>
    </form>
  );
}
```

### Field Arrays with useFieldArray

```javascript
import { useForm, useFieldArray } from "react-hook-form";

function TeamForm() {
  const { register, control, handleSubmit } = useForm({
    defaultValues: {
      teamName: "",
      members: [{ name: "", email: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "members",
  });

  return (
    <form onSubmit={handleSubmit(console.log)}>
      <input {...register("teamName")} placeholder="Team name" />

      {fields.map((field, index) => (
        <div key={field.id}>
          <input {...register(`members.${index}.name`)} placeholder="Member name" />
          <input {...register(`members.${index}.email`)} placeholder="Email" />
          {fields.length > 1 && (
            <button type="button" onClick={() => remove(index)}>Remove</button>
          )}
        </div>
      ))}

      <button type="button" onClick={() => append({ name: "", email: "" })}>
        Add Member
      </button>
      <button type="submit">Create Team</button>
    </form>
  );
}
```

> **See Also:** Part 3, Chapter 4, Section 4.4 for the controlled vs uncontrolled decision framework applied beyond forms.

---

## 6.8 Multi-Step Forms / Wizard Pattern

### Single Form Instance with Step Validation

```javascript
import { useForm, FormProvider, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";

// Per-step schemas
const step1Schema = z.object({
  name: z.string().min(1, "Required"),
  email: z.string().email("Invalid email"),
});

const step2Schema = z.object({
  address: z.string().min(1, "Required"),
  city: z.string().min(1, "Required"),
  zipCode: z.string().regex(/^\d{5}$/, "Must be 5 digits"),
});

const step3Schema = z.object({
  cardNumber: z.string().regex(/^\d{16}$/, "Must be 16 digits"),
  expiry: z.string().regex(/^\d{2}\/\d{2}$/, "MM/YY format"),
});

const fullSchema = step1Schema.merge(step2Schema).merge(step3Schema);

const stepSchemas = [step1Schema, step2Schema, step3Schema];
const stepFields = [
  ["name", "email"],
  ["address", "city", "zipCode"],
  ["cardNumber", "expiry"],
];

function CheckoutWizard() {
  const [step, setStep] = useState(0);

  const methods = useForm({
    resolver: zodResolver(fullSchema),
    defaultValues: {
      name: "", email: "", address: "", city: "",
      zipCode: "", cardNumber: "", expiry: "",
    },
    mode: "onBlur",
    shouldUnregister: false, // Preserve values when step components unmount
  });

  async function goToNext() {
    // Validate only the current step's fields
    const isValid = await methods.trigger(stepFields[step]);
    if (isValid) setStep((s) => Math.min(s + 1, 2));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function onSubmit(data) {
    await fetch("/api/checkout", {
      method: "POST",
      body: JSON.stringify(data),
      headers: { "Content-Type": "application/json" },
    });
  }

  const steps = [
    <PersonalInfoStep key="personal" />,
    <AddressStep key="address" />,
    <PaymentStep key="payment" />,
  ];

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)}>
        {/* Progress indicator */}
        <div className="step-indicator">
          {["Personal", "Address", "Payment"].map((label, i) => (
            <span key={i} className={`step-dot ${i <= step ? "active" : ""}`}>
              {label}
            </span>
          ))}
        </div>

        {/* Current step */}
        {steps[step]}

        {/* Navigation */}
        <div className="step-nav">
          {step > 0 && (
            <button type="button" onClick={goBack}>Back</button>
          )}
          {step < 2 ? (
            <button type="button" onClick={goToNext}>Next</button>
          ) : (
            <button type="submit" disabled={methods.formState.isSubmitting}>
              {methods.formState.isSubmitting ? "Processing..." : "Place Order"}
            </button>
          )}
        </div>
      </form>
    </FormProvider>
  );
}

function PersonalInfoStep() {
  const { register, formState: { errors } } = useFormContext();
  return (
    <div>
      <input {...register("name")} placeholder="Full name" />
      {errors.name && <span className="error">{errors.name.message}</span>}
      <input {...register("email")} type="email" placeholder="Email" />
      {errors.email && <span className="error">{errors.email.message}</span>}
    </div>
  );
}

function AddressStep() {
  const { register, formState: { errors } } = useFormContext();
  return (
    <div>
      <input {...register("address")} placeholder="Street address" />
      {errors.address && <span className="error">{errors.address.message}</span>}
      <input {...register("city")} placeholder="City" />
      {errors.city && <span className="error">{errors.city.message}</span>}
      <input {...register("zipCode")} placeholder="ZIP code" />
      {errors.zipCode && <span className="error">{errors.zipCode.message}</span>}
    </div>
  );
}

function PaymentStep() {
  const { register, formState: { errors } } = useFormContext();
  return (
    <div>
      <input {...register("cardNumber")} placeholder="Card number" />
      {errors.cardNumber && <span className="error">{errors.cardNumber.message}</span>}
      <input {...register("expiry")} placeholder="MM/YY" />
      {errors.expiry && <span className="error">{errors.expiry.message}</span>}
    </div>
  );
}
```

---

## 6.9 File Upload Handling

```javascript
function AvatarUpload({ onUpload }) {
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate on the client before uploading
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("File must be under 5MB");
      return;
    }

    // Generate a local preview
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleUpload() {
    const file = fileInputRef.current.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);

      const res = await fetch("/api/upload/avatar", {
        method: "POST",
        body: formData, // Do NOT set Content-Type; browser sets it with boundary
      });

      const { url } = await res.json();
      onUpload(url);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="avatar-upload">
      {preview && <img src={preview} alt="Preview" className="avatar-preview" />}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
      />
      <button type="button" onClick={handleUpload} disabled={!preview || uploading}>
        {uploading ? "Uploading..." : "Upload"}
      </button>
    </div>
  );
}
```

---

## 6.10 Debounced Form Inputs

For inputs that trigger expensive operations (search, API validation, autocomplete), debouncing prevents firing on every keystroke:

```javascript
function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function UsernameField() {
  const [username, setUsername] = useState("");
  const debouncedUsername = useDebouncedValue(username, 500);
  const [availability, setAvailability] = useState(null);
  const [checking, setChecking] = useState(false);

  // Check availability only after debounce settles
  useEffect(() => {
    if (!debouncedUsername || debouncedUsername.length < 3) {
      setAvailability(null);
      return;
    }

    const controller = new AbortController();
    setChecking(true);

    fetch(`/api/users/check?username=${debouncedUsername}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        setAvailability(data.available);
        setChecking(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setChecking(false);
      });

    return () => controller.abort();
  }, [debouncedUsername]);

  return (
    <div>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Choose a username"
      />
      {checking && <span className="checking">Checking...</span>}
      {availability === true && <span className="available">Available</span>}
      {availability === false && <span className="taken">Already taken</span>}
    </div>
  );
}
```

> **See Also:** Part 3, Chapter 2, Section 2.17 for the `useDebounce` custom hook implementation.

---

## 6.11 Exercise: Build a Multi-Step Form with Validation from Scratch

### Problem Statement

Build a three-step event registration form without using React Hook Form. Implement: per-step validation with Zod, navigation between steps, state persistence across steps, and a review step before submission.

### Solution

```javascript
import { useState, useId } from "react";
import { z } from "zod";

// Step schemas
const attendeeSchema = z.object({
  fullName: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().regex(/^\d{10}$/, "Phone must be 10 digits"),
});

const preferencesSchema = z.object({
  sessionTrack: z.enum(["frontend", "backend", "fullstack"], {
    message: "Select a track",
  }),
  dietaryNeeds: z.string().optional(),
  tshirtSize: z.enum(["S", "M", "L", "XL"], { message: "Select a size" }),
});

// Step 1: Attendee Info
function AttendeeStep({ data, errors, onChange }) {
  return (
    <div>
      <h3>Attendee Information</h3>
      <Field label="Full Name" error={errors.fullName}>
        <input value={data.fullName} onChange={(e) => onChange("fullName", e.target.value)} />
      </Field>
      <Field label="Email" error={errors.email}>
        <input type="email" value={data.email} onChange={(e) => onChange("email", e.target.value)} />
      </Field>
      <Field label="Phone" error={errors.phone}>
        <input value={data.phone} onChange={(e) => onChange("phone", e.target.value)} placeholder="1234567890" />
      </Field>
    </div>
  );
}

// Step 2: Preferences
function PreferencesStep({ data, errors, onChange }) {
  return (
    <div>
      <h3>Event Preferences</h3>
      <Field label="Session Track" error={errors.sessionTrack}>
        <select value={data.sessionTrack} onChange={(e) => onChange("sessionTrack", e.target.value)}>
          <option value="">Select a track</option>
          <option value="frontend">Frontend</option>
          <option value="backend">Backend</option>
          <option value="fullstack">Full Stack</option>
        </select>
      </Field>
      <Field label="Dietary Needs" error={errors.dietaryNeeds}>
        <input value={data.dietaryNeeds} onChange={(e) => onChange("dietaryNeeds", e.target.value)} placeholder="Optional" />
      </Field>
      <Field label="T-Shirt Size" error={errors.tshirtSize}>
        <select value={data.tshirtSize} onChange={(e) => onChange("tshirtSize", e.target.value)}>
          <option value="">Select size</option>
          <option value="S">Small</option>
          <option value="M">Medium</option>
          <option value="L">Large</option>
          <option value="XL">Extra Large</option>
        </select>
      </Field>
    </div>
  );
}

// Step 3: Review
function ReviewStep({ data }) {
  return (
    <div>
      <h3>Review Your Registration</h3>
      <dl className="review-list">
        <dt>Name</dt><dd>{data.fullName}</dd>
        <dt>Email</dt><dd>{data.email}</dd>
        <dt>Phone</dt><dd>{data.phone}</dd>
        <dt>Track</dt><dd>{data.sessionTrack}</dd>
        <dt>Dietary</dt><dd>{data.dietaryNeeds || "None"}</dd>
        <dt>T-Shirt</dt><dd>{data.tshirtSize}</dd>
      </dl>
    </div>
  );
}

// Reusable field wrapper
function Field({ label, error, children }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

// Main wizard component
function EventRegistrationWizard() {
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "", email: "", phone: "",
    sessionTrack: "", dietaryNeeds: "", tshirtSize: "",
  });

  const schemas = [attendeeSchema, preferencesSchema, null]; // null for review step

  function updateField(name, value) {
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear field error on change
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  function validateCurrentStep() {
    const schema = schemas[step];
    if (!schema) return true; // Review step has no validation

    const result = schema.safeParse(formData);
    if (result.success) {
      setErrors({});
      return true;
    }

    const stepErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (!stepErrors[field]) stepErrors[field] = issue.message;
    }
    setErrors(stepErrors);
    return false;
  }

  function handleNext() {
    if (validateCurrentStep()) {
      setStep((s) => s + 1);
    }
  }

  function handleBack() {
    setErrors({});
    setStep((s) => s - 1);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch("/api/events/register", {
        method: "POST",
        body: JSON.stringify(formData),
        headers: { "Content-Type": "application/json" },
      });
      alert("Registration successful!");
    } catch (err) {
      alert("Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const steps = [
    <AttendeeStep data={formData} errors={errors} onChange={updateField} />,
    <PreferencesStep data={formData} errors={errors} onChange={updateField} />,
    <ReviewStep data={formData} />,
  ];

  return (
    <form onSubmit={handleSubmit} className="wizard">
      {/* Progress bar */}
      <div className="progress">
        {["Attendee", "Preferences", "Review"].map((label, i) => (
          <span key={i} className={`step ${i === step ? "current" : i < step ? "done" : ""}`}>
            {i < step ? "✓" : i + 1}. {label}
          </span>
        ))}
      </div>

      {/* Current step content */}
      {steps[step]}

      {/* Navigation */}
      <div className="wizard-nav">
        {step > 0 && <button type="button" onClick={handleBack}>Back</button>}
        {step < 2 ? (
          <button type="button" onClick={handleNext}>Next</button>
        ) : (
          <button type="submit" disabled={submitting}>
            {submitting ? "Submitting..." : "Complete Registration"}
          </button>
        )}
      </div>
    </form>
  );
}
```

### Key Takeaway

Multi-step forms require three decisions: where state lives (a single useState object at the wizard level), how validation is scoped (per-step Zod schemas validated via `trigger` or `safeParse` on navigation), and how persistence works (keeping `shouldUnregister: false` in RHF, or simply not unmounting the state in a custom solution). The review step reads from the same shared state without additional fetching or synchronization. Per-step validation with `safeParse` prevents advancing with invalid data while allowing the user to leave earlier steps' data intact.

---

## Chapter Summary

React forms range from simple controlled inputs (React owns state, re-renders on every keystroke) to high-performance uncontrolled patterns (DOM owns state, React reads on demand). React Hook Form achieves the best of both worlds by using refs internally while exposing a clean hook-based API. Validation should run at the appropriate time: on submit for minimal interruption, on blur for balanced feedback, on change for real-time requirements. Schema validation with Zod centralizes validation logic and integrates seamlessly with React Hook Form via resolvers. React 19's form actions (`action` prop, `useActionState`, `useFormStatus`) add a server-oriented form model that works alongside client-side libraries. Multi-step forms require per-step validation scoped to the current step's fields, with shared state preserved across step transitions.

## Further Reading

- [React Hook Form Documentation](https://react-hook-form.com/) — official API reference and advanced usage guides
- [Forms (React Documentation)](https://react.dev/reference/react-dom/components/form) — React 19 form actions reference
- [useActionState (React Documentation)](https://react.dev/reference/react/useActionState) — the new hook for form action state
- [Zod Documentation](https://zod.dev/) — schema validation library reference
- [@hookform/resolvers (GitHub)](https://github.com/react-hook-form/resolvers) — Zod, Yup, and Valibot integration for React Hook Form
- [Build a Multistep Form with React Hook Form (ClarityDev)](https://claritydev.net/blog/build-a-multistep-form-with-react-hook-form) — step-by-step wizard pattern guide
