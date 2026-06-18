//@ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  // pg and adapter-pg use Node.js built-ins (util/types); exclude from browser bundle
  serverExternalPackages: ['pg', '@prisma/adapter-pg'],
  experimental: {},
};

module.exports = nextConfig;
