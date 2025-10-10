const UUID_TEMPLATE = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";

function getCrypto(): Crypto | null {
  if (typeof globalThis === "undefined") {
    return null;
  }
  const cryptoInstance = globalThis.crypto ?? (globalThis as unknown as { msCrypto?: Crypto }).msCrypto;
  return typeof cryptoInstance === "object" ? cryptoInstance : null;
}

function fallbackRandomValues(buffer: Uint8Array): void {
  for (let index = 0; index < buffer.length; index += 1) {
    buffer[index] = Math.floor(Math.random() * 256);
  }
}

function populateRandomValues(buffer: Uint8Array): void {
  const cryptoInstance = getCrypto();
  if (cryptoInstance?.getRandomValues) {
    cryptoInstance.getRandomValues(buffer);
    return;
  }
  fallbackRandomValues(buffer);
}

export function generateUUID(): string {
  const cryptoInstance = getCrypto();
  if (cryptoInstance?.randomUUID) {
    return cryptoInstance.randomUUID();
  }

  const buffer = new Uint8Array(16);
  populateRandomValues(buffer);

  buffer[6] = (buffer[6] & 0x0f) | 0x40;
  buffer[8] = (buffer[8] & 0x3f) | 0x80;

  let index = 0;
  return UUID_TEMPLATE.replace(/[xy]/g, (placeholder) => {
    const value = buffer[index];
    index += 1;
    const nibble = placeholder === "x" ? value : (value & 0x3f) | 0x80;
    return (nibble & 0xff).toString(16).padStart(2, "0");
  });
}

export function generateId(prefix?: string): string {
  const uuid = generateUUID();
  return prefix ? `${prefix}-${uuid}` : uuid;
}
