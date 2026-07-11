# Readability Guidelines

- Format TypeScript, TSX, JavaScript, JSON, YAML, and CSS with Prettier.
- Keep one statement per line. Do not compress control flow, callbacks, or error
  handling into a single line.
- Break long function signatures, type definitions, object literals, argument
  lists, and method chains across multiple lines.
- Format JSX so nested elements and conditional branches reflect the component
  hierarchy through indentation.
- Use descriptive names and small, focused functions when they make intent
  easier to understand.
- Add comments only when they explain reasoning or constraints that the code
  cannot express clearly on its own.
- Preserve generated files as generated output; make readability improvements
  in their source files instead.
- Before finishing a code change, run `pnpm check` and `pnpm test`.
