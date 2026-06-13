/** Encodes a serializable value to a UTF-8 JSON byte array. */
export const encodeEvent = (event: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(event));

/** Decodes a UTF-8 JSON byte array into a typed value. */
export const decodeEvent = <T>(raw: Uint8Array): T => JSON.parse(new TextDecoder().decode(raw)) as T;
