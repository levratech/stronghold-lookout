import type { PrincipalKeyReadModel } from "../authority/authority-types";

const dbName = "stronghold-lookout-command-signing";
const dbVersion = 1;
const storeName = "principal-command-keys";
const principalIndexName = "principal_id";
const webCryptoAlgorithmName = "Ed25519";
const strongholdAlgorithmName = "ed25519";
const defaultEnvelopeTTLSeconds = 60;

export type CommandSigningPostureStatus =
  | "ready"
  | "missing"
  | "unregistered"
  | "unsupported"
  | "unavailable"
  | "error";

export interface CommandSigningSupport {
  supported: boolean;
  detail: string;
}

export interface StoredCommandSigningKey {
  storage_key: string;
  principal_id: string;
  key_id: string;
  algorithm: "ed25519";
  public_key: string;
  private_key: CryptoKey;
  created_at: string;
}

export interface CommandSigningPosture {
  status: CommandSigningPostureStatus;
  detail: string;
  principalId?: string;
  keyId?: string;
  algorithm: "ed25519";
  localKeyCount: number;
  support: CommandSigningSupport;
}

export interface BrowserCommandSigningKeyRegistration {
  principalId: string;
  keyId: string;
  algorithm: "ed25519";
  publicKey: string;
  createdAt: string;
}

export interface CommandPayloadSignature {
  principalId: string;
  keyId: string;
  algorithm: "ed25519";
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  data: unknown;
  dataJSON: string;
  signingPayloadJSON: string;
  principalSignature: string;
}

export interface SignedCommandEnvelope {
  auth: {
    issuer_sig: string;
    principal_sig: string;
    identity_id?: string;
    principal_id: string;
    key_id: string;
    iat: string;
    exp: string;
    nonce: string;
  };
  data: unknown;
}

export async function detectNativeEd25519Support(): Promise<CommandSigningSupport> {
  if (!globalThis.crypto?.subtle) {
    return {
      supported: false,
      detail: "This browser does not expose WebCrypto subtle crypto.",
    };
  }
  if (!globalThis.indexedDB) {
    return {
      supported: false,
      detail: "This browser cannot persist non-exportable signing keys in IndexedDB.",
    };
  }

  try {
    const pair = await generateNativeEd25519KeyPair();
    const publicKey = await exportRawPublicKey(pair.publicKey);
    if (publicKey.byteLength !== 32) {
      return {
        supported: false,
        detail: "WebCrypto Ed25519 returned unexpected public key material.",
      };
    }
    const smoke = new TextEncoder().encode("stronghold-ed25519-smoke");
    await crypto.subtle.sign({ name: webCryptoAlgorithmName }, pair.privateKey, smoke);
    return {
      supported: true,
      detail: "Native WebCrypto Ed25519 is available for Level 3 command signing.",
    };
  } catch (error) {
    return {
      supported: false,
      detail: error instanceof Error
        ? `Native WebCrypto Ed25519 is unavailable: ${error.message}`
        : "Native WebCrypto Ed25519 is unavailable.",
    };
  }
}

export async function getCommandSigningPosture(
  principalId: string | undefined,
  serverKeys: PrincipalKeyReadModel[],
): Promise<CommandSigningPosture> {
  const support = await detectNativeEd25519Support();
  if (!support.supported) {
    return {
      status: "unsupported",
      detail: `${support.detail} Use Lookout Desktop for Level 3 Stronghold access.`,
      algorithm: strongholdAlgorithmName,
      localKeyCount: 0,
      support,
    };
  }
  if (!principalId) {
    return {
      status: "unavailable",
      detail: "No active principal is resolved for command signing.",
      algorithm: strongholdAlgorithmName,
      localKeyCount: 0,
      support,
    };
  }

  try {
    const localKeys = await listStoredCommandSigningKeys(principalId);
    if (!localKeys.length) {
      return {
        status: "missing",
        detail: "No browser-local Ed25519 command-signing key exists for the active principal.",
        principalId,
        algorithm: strongholdAlgorithmName,
        localKeyCount: 0,
        support,
      };
    }

    const activeServerKeys = serverKeys.filter(
      (key) =>
        key.principal_id === principalId &&
        key.algorithm === strongholdAlgorithmName &&
        key.status === "active" &&
        !key.revoked_at,
    );
    const selected = localKeys.find((localKey) =>
      activeServerKeys.some((serverKey) => serverKey.key_id === localKey.key_id),
    );
    if (!selected) {
      return {
        status: "unregistered",
        detail:
          "A local Ed25519 key exists, but Sentry does not report a matching active principal key record.",
        principalId,
        keyId: localKeys[0].key_id,
        algorithm: strongholdAlgorithmName,
        localKeyCount: localKeys.length,
        support,
      };
    }

    return {
      status: "ready",
      detail: "The active principal has a browser-local Ed25519 key with an active Sentry key binding.",
      principalId,
      keyId: selected.key_id,
      algorithm: strongholdAlgorithmName,
      localKeyCount: localKeys.length,
      support,
    };
  } catch (error) {
    return {
      status: "error",
      detail: error instanceof Error ? error.message : "Unable to inspect browser command-signing keys.",
      principalId,
      algorithm: strongholdAlgorithmName,
      localKeyCount: 0,
      support,
    };
  }
}

export async function generateAndStoreBrowserCommandSigningKey(
  principalId: string,
): Promise<BrowserCommandSigningKeyRegistration> {
  const support = await detectNativeEd25519Support();
  if (!support.supported) {
    throw new Error(`${support.detail} Use Lookout Desktop for Level 3 Stronghold access.`);
  }

  const keyPair = await generateNativeEd25519KeyPair();
  const publicKey = base64RawURL(new Uint8Array(await exportRawPublicKey(keyPair.publicKey)));
  const keyId = `lookout-web-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
  const createdAt = new Date().toISOString();
  const record: StoredCommandSigningKey = {
    storage_key: storageKey(principalId, keyId),
    principal_id: principalId,
    key_id: keyId,
    algorithm: strongholdAlgorithmName,
    public_key: publicKey,
    private_key: keyPair.privateKey,
    created_at: createdAt,
  };
  await putStoredCommandSigningKey(record);
  return {
    principalId,
    keyId,
    algorithm: strongholdAlgorithmName,
    publicKey,
    createdAt,
  };
}

export async function signCommandPayload({
  principalId,
  keyId,
  data,
  ttlSeconds = defaultEnvelopeTTLSeconds,
}: {
  principalId: string;
  keyId?: string;
  data: unknown;
  ttlSeconds?: number;
}): Promise<CommandPayloadSignature> {
  const key = await getStoredCommandSigningKey(principalId, keyId);
  if (!key) {
    throw new Error("No browser-local command-signing key is available for this principal.");
  }

  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);
  const nonce = crypto.randomUUID();
  const dataJSON = JSON.stringify(data ?? null);
  const signingPayloadJSON = await signingPayloadJSONFor({
    principalId,
    keyId: key.key_id,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    nonce,
    dataJSON,
  });
  const signature = await crypto.subtle.sign(
    { name: webCryptoAlgorithmName },
    key.private_key,
    new TextEncoder().encode(signingPayloadJSON),
  );

  return {
    principalId,
    keyId: key.key_id,
    algorithm: strongholdAlgorithmName,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    nonce,
    data,
    dataJSON,
    signingPayloadJSON,
    principalSignature: base64RawURL(new Uint8Array(signature)),
  };
}

export async function buildSignedCommandEnvelope({
  principalId,
  keyId,
  identityId,
  issuerSignature,
  data,
  ttlSeconds,
}: {
  principalId: string;
  keyId?: string;
  identityId?: string;
  issuerSignature: string;
  data: unknown;
  ttlSeconds?: number;
}): Promise<SignedCommandEnvelope> {
  const signature = await signCommandPayload({ principalId, keyId, data, ttlSeconds });
  return {
    auth: {
      issuer_sig: issuerSignature,
      principal_sig: signature.principalSignature,
      identity_id: identityId,
      principal_id: principalId,
      key_id: signature.keyId,
      iat: signature.issuedAt,
      exp: signature.expiresAt,
      nonce: signature.nonce,
    },
    data,
  };
}

async function generateNativeEd25519KeyPair(): Promise<CryptoKeyPair> {
  const key = await crypto.subtle.generateKey(
    { name: webCryptoAlgorithmName } as Algorithm,
    false,
    ["sign", "verify"],
  );
  if (!("privateKey" in key) || !("publicKey" in key)) {
    throw new Error("WebCrypto did not return an Ed25519 key pair.");
  }
  return key;
}

async function exportRawPublicKey(publicKey: CryptoKey) {
  return crypto.subtle.exportKey("raw", publicKey);
}

async function signingPayloadJSONFor({
  principalId,
  keyId,
  issuedAt,
  expiresAt,
  nonce,
  dataJSON,
}: {
  principalId: string;
  keyId: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  dataJSON: string;
}) {
  const dataHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(dataJSON));
  return JSON.stringify({
    principal_id: principalId,
    key_id: keyId,
    iat: issuedAt,
    exp: expiresAt,
    nonce,
    data_sha256: base64RawURL(new Uint8Array(dataHash)),
  });
}

async function listStoredCommandSigningKeys(principalId: string): Promise<StoredCommandSigningKey[]> {
  const db = await openCommandSigningDB();
  try {
    const tx = db.transaction(storeName, "readonly");
    const index = tx.objectStore(storeName).index(principalIndexName);
    return await idbRequest<StoredCommandSigningKey[]>(index.getAll(IDBKeyRange.only(principalId)));
  } finally {
    db.close();
  }
}

async function getStoredCommandSigningKey(
  principalId: string,
  keyId?: string,
): Promise<StoredCommandSigningKey | null> {
  const db = await openCommandSigningDB();
  try {
    if (keyId) {
      const tx = db.transaction(storeName, "readonly");
      const key = await idbRequest<StoredCommandSigningKey | undefined>(
        tx.objectStore(storeName).get(storageKey(principalId, keyId)),
      );
      return key ?? null;
    }
    const keys = await listStoredCommandSigningKeys(principalId);
    return keys.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  } finally {
    db.close();
  }
}

async function putStoredCommandSigningKey(record: StoredCommandSigningKey) {
  const db = await openCommandSigningDB();
  try {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(record);
    await idbTransactionDone(tx);
  } finally {
    db.close();
  }
}

function openCommandSigningDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(storeName)
        ? request.transaction?.objectStore(storeName)
        : db.createObjectStore(storeName, { keyPath: "storage_key" });
      if (store && !store.indexNames.contains(principalIndexName)) {
        store.createIndex(principalIndexName, principalIndexName, { unique: false });
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Unable to open command-signing key store."));
    request.onsuccess = () => resolve(request.result);
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
    request.onsuccess = () => resolve(request.result);
  });
}

function idbTransactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
}

function storageKey(principalId: string, keyId: string) {
  return `${principalId}:${keyId}`;
}

function base64RawURL(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
