//@ts-check

const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // pg and adapter-pg use Node.js built-ins (util/types); exclude from browser bundle
  serverExternalPackages: ['pg', '@prisma/adapter-pg'],
  experimental: {},
  turbopack: {
    // Monorepo workspace root — Turbopack can't infer it when `next` is hoisted
    root: path.resolve(__dirname, '../..'),
  },
};

module.exports = nextConfig;
