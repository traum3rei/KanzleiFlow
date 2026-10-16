import zlib from "zlib";

/**
 * Standard IEEE 802.3 CRC32 calculation table.
 */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c;
}

export function calculateCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipFileEntry {
  path: string;
  data: Buffer;
  modifiedDate?: Date;
}

/**
 * Creates a standard deterministic ZIP archive from a list of buffer entries.
 * Uses zero third-party dependencies and produces standard PKZIP 2.0 archives
 * compatible with macOS Archive Utility, Windows File Explorer, unzip, and BNotK XNP.
 */
export function createDeterministicZip(entries: ZipFileEntry[]): Buffer {
  const localFileChunks: Buffer[] = [];
  const centralDirectoryHeaders: Buffer[] = [];

  let currentOffset = 0;

  // Fixed DOS timestamp for determinism: 2026-10-15 12:00:00
  // DOS time format: Bits 0-4: seconds/2, bits 5-10: minutes, bits 11-15: hours
  // DOS date format: Bits 0-4: day, bits 5-8: month, bits 9-15: year - 1980
  const dosTime = (12 << 11) | (0 << 5) | (0 >> 1); // 12:00:00
  const dosDate = ((2026 - 1980) << 9) | (10 << 5) | 15; // 2026-10-15

  for (const entry of entries) {
    const rawPath = entry.path.replace(/\\/g, "/");
    const nameBuffer = Buffer.from(rawPath, "utf-8");
    const uncompressedData = entry.data;
    const crc = calculateCrc32(uncompressedData);

    // Deflate compression
    const compressedData = zlib.deflateRawSync(uncompressedData, { level: 6 });
    // Use stored if compressed is larger or equal
    const useCompression = compressedData.length < uncompressedData.length;
    const finalData = useCompression ? compressedData : uncompressedData;
    const compressionMethod = useCompression ? 8 : 0;

    // 1. Local File Header (30 bytes + name length)
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // General purpose bit flag (UTF-8)
    localHeader.writeUInt16LE(compressionMethod, 8); // Compression method
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14); // CRC32
    localHeader.writeUInt32LE(finalData.length, 18); // Compressed size
    localHeader.writeUInt32LE(uncompressedData.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length
    nameBuffer.copy(localHeader, 30);

    localFileChunks.push(localHeader, finalData);

    // 2. Central Directory Header (46 bytes + name length)
    const cdHeader = Buffer.alloc(46 + nameBuffer.length);
    cdHeader.writeUInt32LE(0x02014b50, 0); // Signature
    cdHeader.writeUInt16LE(20, 4); // Version made by (2.0)
    cdHeader.writeUInt16LE(20, 6); // Version needed to extract (2.0)
    cdHeader.writeUInt16LE(0x0800, 8); // General purpose bit flag (UTF-8)
    cdHeader.writeUInt16LE(compressionMethod, 10); // Compression method
    cdHeader.writeUInt16LE(dosTime, 12);
    cdHeader.writeUInt16LE(dosDate, 14);
    cdHeader.writeUInt32LE(crc, 16); // CRC32
    cdHeader.writeUInt32LE(finalData.length, 20); // Compressed size
    cdHeader.writeUInt32LE(uncompressedData.length, 24); // Uncompressed size
    cdHeader.writeUInt16LE(nameBuffer.length, 28); // File name length
    cdHeader.writeUInt16LE(0, 30); // Extra field length
    cdHeader.writeUInt16LE(0, 32); // File comment length
    cdHeader.writeUInt16LE(0, 34); // Disk number start
    cdHeader.writeUInt16LE(0, 36); // Internal file attributes
    cdHeader.writeUInt32LE(0x81a40000, 38); // External file attributes (regular file -rw-r--r--)
    cdHeader.writeUInt32LE(currentOffset, 42); // Relative offset of local header
    nameBuffer.copy(cdHeader, 46);

    centralDirectoryHeaders.push(cdHeader);
    currentOffset += localHeader.length + finalData.length;
  }

  const centralDirectoryOffset = currentOffset;
  const centralDirectoryBuffer = Buffer.concat(centralDirectoryHeaders);
  const centralDirectorySize = centralDirectoryBuffer.length;

  // 3. End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // Signature
  eocd.writeUInt16LE(0, 4); // Number of this disk
  eocd.writeUInt16LE(0, 6); // Disk where central directory starts
  eocd.writeUInt16LE(entries.length, 8); // Number of central directory records on this disk
  eocd.writeUInt16LE(entries.length, 10); // Total number of central directory records
  eocd.writeUInt32LE(centralDirectorySize, 12); // Size of central directory
  eocd.writeUInt32LE(centralDirectoryOffset, 16); // Offset of start of central directory
  eocd.writeUInt16LE(0, 20); // ZIP file comment length

  return Buffer.concat([...localFileChunks, centralDirectoryBuffer, eocd]);
}
