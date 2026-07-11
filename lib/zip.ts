// Minimal, dependency-free ZIP writer (STORE method — no compression). Enough
// to bundle a handful of already-compact files (e.g. per-employee .xlsx
// workbooks) into a single archive for download, without pulling in a zip
// library. Produces a standard ZIP with local file headers + a central
// directory, which every OS/unzip tool reads.

// CRC-32 (IEEE 802.3), table-driven.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function toBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data)
}

// Encode a filename as UTF-8 bytes (and flag the entry as UTF-8 in the header).
function encodeName(name: string): Uint8Array {
  return new TextEncoder().encode(name)
}

export type ZipEntry = { name: string; data: ArrayBuffer | Uint8Array }

/**
 * Build a ZIP archive (STORE / no compression) from the given entries and return
 * it as a Blob. Duplicate names are de-duplicated with a numeric suffix so a
 * clash never produces a corrupt archive.
 */
export function createZip(entries: ZipEntry[]): Blob {
  // DOS date/time — a fixed, valid timestamp keeps output deterministic.
  const dosTime = 0
  const dosDate = 0x21 // 1980-01-01

  const usedNames = new Set<string>()
  const uniqueName = (name: string): string => {
    if (!usedNames.has(name)) {
      usedNames.add(name)
      return name
    }
    const dot = name.lastIndexOf(".")
    const stem = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ""
    let i = 2
    let candidate = `${stem} (${i})${ext}`
    while (usedNames.has(candidate)) {
      i += 1
      candidate = `${stem} (${i})${ext}`
    }
    usedNames.add(candidate)
    return candidate
  }

  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encodeName(uniqueName(entry.name))
    const data = toBytes(entry.data)
    const crc = crc32(data)
    const size = data.length

    // Local file header (30 bytes + name).
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true) // signature
    local.setUint16(4, 20, true) // version needed
    local.setUint16(6, 0x0800, true) // flags: UTF-8 filename
    local.setUint16(8, 0, true) // method: store
    local.setUint16(10, dosTime, true)
    local.setUint16(12, dosDate, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, size, true) // compressed size
    local.setUint32(22, size, true) // uncompressed size
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true) // extra length
    localParts.push(new Uint8Array(local.buffer), nameBytes, data)

    // Central directory header (46 bytes + name).
    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true) // signature
    central.setUint16(4, 20, true) // version made by
    central.setUint16(6, 20, true) // version needed
    central.setUint16(8, 0x0800, true) // flags: UTF-8
    central.setUint16(10, 0, true) // method
    central.setUint16(12, dosTime, true)
    central.setUint16(14, dosDate, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, size, true)
    central.setUint32(24, size, true)
    central.setUint16(28, nameBytes.length, true)
    central.setUint16(30, 0, true) // extra length
    central.setUint16(32, 0, true) // comment length
    central.setUint16(34, 0, true) // disk number
    central.setUint16(36, 0, true) // internal attrs
    central.setUint32(38, 0, true) // external attrs
    central.setUint32(42, offset, true) // local header offset
    centralParts.push(new Uint8Array(central.buffer), nameBytes)

    offset += 30 + nameBytes.length + size
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0)
  const centralOffset = offset

  // End of central directory record (22 bytes).
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(4, 0, true) // disk number
  end.setUint16(6, 0, true) // central dir start disk
  end.setUint16(8, entries.length, true) // entries on this disk
  end.setUint16(10, entries.length, true) // total entries
  end.setUint32(12, centralSize, true)
  end.setUint32(16, centralOffset, true)
  end.setUint16(20, 0, true) // comment length

  return new Blob([...localParts, ...centralParts, new Uint8Array(end.buffer)], {
    type: "application/zip",
  })
}
