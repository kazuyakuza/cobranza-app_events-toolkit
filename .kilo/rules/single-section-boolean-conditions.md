# Single-Section Boolean Conditions Rule

## Guidelines

- Boolean conditions in statements like `if`, `while`, etc., must be kept to a single section.
- If a condition requires more than one section, it must be extracted into a separate method with a descriptive name.
- The method call must replace the complex condition in the original statement.

## Examples

- Incorrect

```text
if (some_bool_var && some_num_var >= some_constant_num) {
    // ... 
}
```

- Correct

```text
if (some_meaning_name(...params...)) {
    // ... 
}
```
