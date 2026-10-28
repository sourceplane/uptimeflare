// A stand-in for the Workers runtime's `cloudflare:sockets`: `connect` hands
// back a socket whose `opened` the test decides. `sockets.behaviour` is set
// per test; `sockets.calls` records every connect.
type Behaviour = "open" | "refuse" | "hang";

export const sockets: { behaviour: Behaviour; calls: { hostname: string; port: number }[] } = {
  behaviour: "open",
  calls: [],
};

export function connect(address: { hostname: string; port: number }) {
  sockets.calls.push(address);
  const opened =
    sockets.behaviour === "open"
      ? Promise.resolve({})
      : sockets.behaviour === "refuse"
        ? Promise.reject(Object.assign(new Error("connection refused"), { name: "Error" }))
        : new Promise(() => {});
  // Never left unhandled when a test does not await it.
  opened.catch(() => {});
  return { opened, close: async () => {} };
}
