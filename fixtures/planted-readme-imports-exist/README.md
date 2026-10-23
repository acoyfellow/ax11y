# greeter-fixture

Say hello and goodbye.

## Quick start

```ts
import { greet, farewell, welcome } from "greeter-fixture";

const hello: string = greet("Ada");
console.log(hello, farewell("Ada"), welcome);
```

## API

- `greet(name: string): string` returns a greeting. Throws when `name` is empty.
- `farewell(name: string): string` returns a goodbye.
- `VERSION: string` is the package version.
