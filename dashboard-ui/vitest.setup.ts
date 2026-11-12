// react-router's MemoryRouter warns on every server render; the SSR tests would overflow verify.mjs's 1 MB output buffer.
const error = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("useLayoutEffect does nothing on the server")) return;
  error(...args);
};
