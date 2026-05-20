# Newline Prevention Rule

- File content must use actual newline characters, never literal `\n` escape sequences.
- When using create_file or edit_file, the content parameter must contain real line breaks.
- Verify multi-line content uses proper newlines before completing any write operation.
- This applies to ALL file content operations.