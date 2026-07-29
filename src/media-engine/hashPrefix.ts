/** Fast SHA-256 hex prefix for debug ownership checks. */
export async function sha256Prefix(
  data: ArrayBuffer | Uint8Array,
  chars = 12,
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return "no-subtle";
  const buf =
    data instanceof Uint8Array
      ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      : data;
  const digest = await subtle.digest("SHA-256", buf as ArrayBuffer);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < Math.min(bytes.length, Math.ceil(chars / 2)); i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex.slice(0, chars);
}

export async function sha256PrefixBlob(
  blob: Blob,
  chars = 12,
): Promise<string> {
  const ab = await blob.arrayBuffer();
  return sha256Prefix(ab, chars);
}
