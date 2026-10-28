// Uint8Array.fromHex and Uint8Array.prototype.toHex (ES2026), which the
// compacted monitor state packs its latency arrays with. The Workers runtime
// has both; Node 22, which runs these tests, has neither — so the tests add
// them, exactly as specified, and the app's code runs unchanged.
type HexStatics = { fromHex?: (hex: string) => Uint8Array };
type HexProto = { toHex?: () => string };

const statics = Uint8Array as unknown as HexStatics;
if (!statics.fromHex) {
  statics.fromHex = (hex: string) => {
    if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) throw new SyntaxError("invalid hex");
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  };
}
const proto = Uint8Array.prototype as unknown as HexProto;
if (!proto.toHex) {
  proto.toHex = function (this: Uint8Array) {
    return Array.from(this, (b) => b.toString(16).padStart(2, "0")).join("");
  };
}
