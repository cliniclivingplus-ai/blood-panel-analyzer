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
};

export default nextConfig;
