import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // tesseract.js's worker script is dynamically required by path at
  // runtime (src/worker-script/node/index.js), which Next's bundler/file
  // tracer can't see statically — without this, Vercel's serverless
  // function ships without that file and OCR crashes with
  // "Cannot find module '.../tesseract.js/src/worker-script/node/index.js'".
  // Marking it external makes Vercel trace and include the real
  // node_modules package instead of trying to bundle it.
  serverExternalPackages: ['tesseract.js'],
  // Even externalized, the worker script's own `require('..')` back into
  // the package root isn't picked up by static tracing — force-include
  // the whole package trees (tesseract.js's worker script + the
  // WASM/core engine it loads) so the worker thread can actually resolve
  // its own dependencies at runtime.
  // tesseract.js's worker thread pulls in enough of its own transitive
  // deps (bmp-js, node-fetch -> whatwg-url -> tr46/webidl-conversions,
  // idb-keyval, wasm-feature-detect, zlibjs, ...) that listing them one by
  // one was a losing game of whack-a-mole — each fix revealed the next
  // missing module. Including the whole node_modules tree for this one
  // route is blunt but reliable, and this project is small enough that
  // the extra function size isn't a real concern.
  outputFileTracingIncludes: {
    '/api/parse-report': ['./node_modules/**/*'],
  },
};

export default nextConfig;
