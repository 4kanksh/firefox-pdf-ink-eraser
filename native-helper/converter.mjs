// Converts Word and PowerPoint files to PDF for PDF Ink Eraser, with
// LibreOffice compiled to WebAssembly. LibreOffice's browser version can't
// run in a Firefox extension page (it needs shared memory between threads,
// which Firefox only allows on cross-origin isolated pages), so the viewer
// asks this program instead, through Firefox's native messaging.
//
// Firefox starts it when the viewer connects and closes its stdin when the
// viewer goes away. Each message is a 32-bit length in native byte order
// (little-endian on Windows) followed by that much UTF-8 JSON.
//
// Request:  { id, name, data }            data: the file, base64
// Replies:  { id, part, last }            the PDF, base64, in pieces
//           { id, error }
// Firefox accepts at most 1 MB per message from a program, so the PDF comes
// back in pieces.
import { writeSync } from "node:fs";
import { createWorkerConverter } from "@matbee/libreoffice-converter/server";

const PIECE = 512 * 1024;

// stdout carries the messages, so anything else written there (by
// LibreOffice or its worker threads) would break them. Send it to stderr,
// which Firefox shows in the Browser Console.
const send = message => {
  const body = Buffer.from(JSON.stringify(message));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  writeSync(1, Buffer.concat([header, body]));
};
process.stdout.write = (chunk, encoding, callback) => process.stderr.write(chunk, encoding, callback);

// Started on the first request and kept for the next ones.
let converter = null;

async function convert({ id, name, data }) {
  try {
    converter ??= createWorkerConverter();
    const result = await (await converter).convert(Buffer.from(data, "base64"), { outputFormat: "pdf" }, name);
    const pdf = Buffer.from(result.data);
    for (let start = 0; start < pdf.length; start += PIECE) {
      const end = Math.min(start + PIECE, pdf.length);
      send({ id, part: pdf.subarray(start, end).toString("base64"), last: end === pdf.length });
    }
  } catch (error) {
    send({ id, error: String(error?.message ?? error) });
  }
}

// One conversion at a time: LibreOffice converts one document at a time
// anyway.
let queue = Promise.resolve();
let input = Buffer.alloc(0);
process.stdin.on("data", chunk => {
  input = Buffer.concat([input, chunk]);
  while (input.length >= 4 && input.length >= 4 + input.readUInt32LE(0)) {
    const length = input.readUInt32LE(0);
    const message = JSON.parse(input.subarray(4, 4 + length).toString());
    input = input.subarray(4 + length);
    queue = queue.then(() => convert(message));
  }
});
process.stdin.on("end", () => process.exit(0));
