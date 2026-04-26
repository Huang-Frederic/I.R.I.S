// 'server-only' is a Next.js sentinel that throws on import unless the bundler
// rewrites it. Vitest doesn't, so we alias it to this empty module in
// vitest.config.ts so server-flagged modules can be unit-tested for their pure parts.
export {};
