export function greet(name) {
  if (typeof name !== "string" || name.length === 0) throw new Error("bad input");
  return `Hello, ${name}!`;
}
export function farewell(name) {
  if (typeof name !== "string") throw new TypeError("farewell(name) needs a string; got " + typeof name);
  return `Goodbye, ${name}.`;
}
export const VERSION = "1.0.0";
