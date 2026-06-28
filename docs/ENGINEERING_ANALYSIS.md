# Tuning Calibration Suite – Engineering Analysis

**Revision:** 1.0.0  
**Classification:** Internal Technical Reference  
**Audience:** Lead Engineers, ECU Calibration Architects, Security Reviewers

---

## 1. Memory Pointer & ODA Protection

### 1.1 The Problem: Overlapping Maps and Silent Corruption

In a production ECU binary (e.g. Bosch EDC17 at 2MB), a single `.xdf` definition file may describe 300–600 overlapping logical maps. An axis array for fuel injection timing may share byte ranges with an adjacent correction table. A naive write-back that ignores overlaps will corrupt the adjacent map silently—the binary will still checksum correctly (if the checksum region covers both) but the ECU's runtime behavior will be wrong. This is the most dangerous class of calibration bug because it produces no error during flashing.

### 1.2 ODA (Overlapping Data Area) Detection

The `BinaryParser` enforces a strict pre-write validation pass called ODA detection. Before executing any `writeCell()` call, the server-side Route Handler runs `validateNoOverlap()`:

```typescript
function validateNoOverlap(
  defs: MapDefinition[],
  activeDefId: string
): void {
  const active = defs.find(d => d.id === activeDefId)!;
  const activeStart = active.offset;
  const activeEnd   = active.offset + active.rows * active.cols * byteSize(active.dataType);

  for (const def of defs) {
    if (def.id === activeDefId) continue;
    const defStart = def.offset;
    const defEnd   = def.offset + def.rows * def.cols * byteSize(def.dataType);

    const overlaps = activeStart < defEnd && activeEnd > defStart;
    if (overlaps) {
      throw new Error(
        `ODA VIOLATION: Map "${activeDefId}" [0x${activeStart.toString(16)}–0x${activeEnd.toString(16)}] ` +
        `overlaps with map "${def.id}" [0x${defStart.toString(16)}–0x${defEnd.toString(16)}]. ` +
        `Patch aborted.`
      );
    }
  }
}
```

This runs in O(n) per patch request where n is the number of registered maps—acceptable for n < 1000 in typical ECU definition files.

### 1.3 Zero-Trust IP Protection (BFF Pattern)

The map definition files (`.xdf`/`.json`) contain the hex offsets that represent the tuning company's proprietary reverse-engineering work. These must never be transmitted to the client browser.

**Read pipeline:**
1. Client uploads the raw binary.
2. The Next.js Route Handler (`/api/parse-map`) reads the binary server-side using `DataView`.
3. The handler computes physical values and returns a `ParsedMap`: a list of `(col, row, physical)` tuples with an opaque `mapId` (SHA-256 of `defId + sessionToken`).
4. The response JSON contains **zero offsets, zero raw values, zero internal names**.

**Write pipeline:**
1. Client sends `{ mapId, deltas[] }` where `delta.newPhysical` is the tuner's edited value.
2. The server uses `mapId` to look up the `MapDefinition` from an in-memory dictionary (never serialized, never logged).
3. The server executes the reverse A2L formula and calls `BinaryParser.writeCell()`.
4. The patched binary is returned as a base64 blob or a streaming download.

An attacker who intercepts the network traffic sees only physical values in human-readable units (e.g. `14.7` for lambda, `1200` for rpm). They cannot reconstruct the offset dictionary.

---

## 2. Transactional Checksum Pipeline

### 2.1 Lifecycle Overview

```
Client Request: { mapId, deltas[] }
        │
        ▼
[1] Route Handler: Resolve mapId → MapDefinition
        │
        ▼
[2] BinaryParser.writeCell() × N  (all deltas applied to cloned buffer)
        │
        ▼
[3] Identify checksum blocks: union of MapDefinition.checksumBlocks across all deltas
        │
        ▼
[4] ChecksumEngine.applyBlocks(buffer, blockIds)
        │
      ┌─┴──────────────────────────────────────────────────────────┐
      │ For each block:                                              │
      │   strategy.compute(view, regionStart, regionEnd) → checksum │
      │   writeChecksum(view, checksum, block)                      │
      │   verify(view, checksum, block)  ← FAIL-SAFE               │
      │     if readback ≠ checksum → throw Error → ABORT EXPORT     │
      └────────────────────────────────────────────────────────────┘
        │
        ▼
[5] cloneBuffer() → base64 encode → HTTP 200 response
        │
        ▼
[6] Client downloads .bin file
```

### 2.2 Fail-Safe Rationale

Node.js's V8 engine and the OS memory subsystem are generally reliable, but a `DataView.setUint16()` call followed immediately by `DataView.getUint16()` at the same offset exercises the same memory path and will catch:
- Logic errors in endianness flags (passing `le=true` on a Big-Endian block).
- Off-by-one errors in `storeOffset` computation.
- Silent integer overflow or underflow in checksum arithmetic.

The cost is two DataView operations per checksum block (typically 1–8 per ECU type), adding microseconds to the request. The benefit is a hard abort before a corrupted binary reaches the tuner's hands.

### 2.3 Additive 16-bit Two's Complement – Algorithm Specification

Used by: Bosch EDC15, EDC16, many Siemens/Continental variants.

```
sum = 0
for each byte B in region [regionStart, regionEnd):
    sum = (sum + B) & 0xFFFF
checksum = (~sum + 1) & 0xFFFF
```

The final `& 0xFFFF` on the negation is critical in JavaScript: `~sum` produces a signed 32-bit integer; adding 1 may produce a value outside the `[0, 65535]` range. The mask ensures the result fits in a `uint16` store.

---

## 3. V8 Engine Memory Scaling

### 3.1 Problem Statement

A tuning session may involve:
- 1× raw binary: up to 8MB.
- 1× XDF definition: up to 2MB JSON.
- 50 concurrent parsing requests (workshop environment with multiple technicians).

Naively, 50 concurrent Node.js workers each holding an 8MB `Buffer` = 400MB heap. V8's default `--max-old-space-size` is 512MB on 64-bit systems; this would cause OOM crashes.

### 3.2 Architecture: Single-Copy Buffer with Shared Read Access

**Principle:** Parse requests are read-only. A single `ArrayBuffer` representing the uploaded binary can be shared across multiple `DataView` instances simultaneously—`DataView` does not copy the underlying memory.

```
Upload → Buffer.from(req.body) → stored in LRU cache keyed by SHA-256(binary)
                 │
        ┌────────┴────────┐
        │                 │
  DataView (req A)   DataView (req B)
  [read-only]        [read-only]
```

Write requests clone the buffer before mutation:

```typescript
const mutableBuffer = parser.cloneBuffer(); // ArrayBuffer.slice() – OS copy-on-write
```

This means:
- N concurrent read requests: 1 buffer allocation (8MB).
- N concurrent write requests: N buffer allocations (N × 8MB), each short-lived, GC'd after the response.

### 3.3 JSON Definition Streaming

The XDF/JSON map definition file (up to 2MB) is parsed once at server startup using `JSON.parse()` on the file content, stored in a `Map<string, MapDefinition>`. This is held in the Node.js module cache—it is not re-parsed per request. Memory cost: ~2MB (JSON string) + ~4MB (object graph) = 6MB, amortized across all requests.

For definition files larger than 10MB, use streaming JSON parsing (`stream-json` npm package) to avoid a single synchronous blocking parse that delays the event loop.

### 3.4 Heap Pressure Estimation

| Scenario                         | Heap contribution |
|----------------------------------|-------------------|
| Definition file (parsed, cached) | ~6 MB             |
| Uploaded binary (LRU, 1 entry)   | ~8 MB             |
| 50 concurrent write clones       | ~400 MB peak      |
| Response serialization (base64)  | ~11 MB per write  |

**Recommendation:** Deploy with `NODE_OPTIONS="--max-old-space-size=1024"` and limit concurrent write requests to 10 via a semaphore (`p-limit` or custom `AsyncSemaphore`) to cap peak heap at ~150MB. Read requests are effectively free beyond the initial binary cache.

### 3.5 GC Pressure Mitigation

- Use `Buffer.allocUnsafe()` for intermediate buffers where zeroing is unnecessary (the data is immediately overwritten by `DataView` writes).
- Avoid creating intermediate `Uint8Array` views of the full binary for checksum computation; the `DataView` loop in `Additive16TwosStrategy.compute()` accesses bytes one-at-a-time, which is GC-pressure-free.
- Stream the base64-encoded patched binary to the HTTP response using `Buffer.from(buffer).toString('base64')` piped to a `Readable`, rather than building a 10MB JSON string.

---

*End of Engineering Analysis*
