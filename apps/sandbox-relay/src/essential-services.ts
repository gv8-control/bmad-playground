/**
 * Daytona Tier 1 "Essential Services" allowlist — domains the sandbox reaches
 * directly. The relay rejects requests targeting these so it doesn't add a hop
 * (and a failure mode) for traffic that already works.
 *
 * Source: https://www.daytona.io/docs/network-limits#essential-services
 * Fetched 2026-07-22. If Daytona updates the list, this file is the single
 * place to sync — the relay loads it at startup.
 *
 * Matching: exact hostname or wildcard suffix. `*.example.com` matches
 * `example.com` and any subdomain `foo.example.com`. Bare `example.com`
 * matches only `example.com` (no subdomains).
 */

// Exact hostnames (no wildcard) — the host must match exactly.
export const ESSENTIAL_SERVICES_EXACT: ReadonlySet<string> = new Set([
  // NPM / Node
  'registry.npmjs.org',
  'registry.npmjs.com',
  'nodejs.org',
  'nodesource.com',
  'deb.nodesource.com',
  'npm.pkg.github.com',
  'yarnpkg.com',
  'yarn.npmjs.org',
  'yarnpkg.netlify.com',
  'bun.sh',
  // Nix
  'cache.nixos.org',
  'channels.nixos.org',
  'releases.nixos.org',
  // Git hosting
  'github.com',
  'gh.io',
  'ghcr.io',
  'gitlab.com',
  'bitbucket.org',
  'code.storage',
  'dev.azure.com',
  'login.microsoftonline.com',
  'visualstudio.com',
  'ssh.dev.azure.com',
  'vs-ssh.visualstudio.com',
  // Python
  'pypi.org',
  'pypi.python.org',
  'files.pythonhosted.org',
  'bootstrap.pypa.io',
  'astral.sh',
  'repo.anaconda.com',
  // Rust
  'crates.io',
  'static.crates.io',
  'index.crates.io',
  'static.rust-lang.org',
  'rustup.rs',
  'sh.rustup.rs',
  'doc.rust-lang.org',
  // Go
  'proxy.golang.org',
  'sum.golang.org',
  'index.golang.org',
  'go.dev',
  'golang.org',
  // C/C++
  'cmake.org',
  // Composer
  'packagist.org',
  'packagist.com',
  // NuGet
  'nuget.org',
  // Hex
  'hex.pm',
  // Ruby
  'rubygems.org',
  // Maven
  'repo1.maven.org',
  'repo.maven.apache.org',
  // Google Fonts
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  // Google Cloud / downloads
  'accounts.google.com',
  'dl.google.com',
  'packages.cloud.google.com',
  // Docker registries
  'docker.io',
  'mcr.microsoft.com',
  'registry.k8s.io',
  'gcr.io',
  'registry.cloud.google.com',
  'quay.io',
  'quay-registry.s3.amazonaws.com',
  'public.ecr.aws',
  // CDN
  'fastly.com',
  'cloudflare.com',
  'gateway.ai.cloudflare.com',
  'unpkg.com',
  'jsdelivr.net',
  // AI/ML
  'openai.com',
  'chatgpt.com',
  'generativelanguage.googleapis.com',
  'gemini.google.com',
  'aistudio.google.com',
  'ai.google.dev',
  'models.dev',
  'api.perplexity.ai',
  'api.deepseek.com',
  'api.groq.com',
  'api.expo.dev',
  'openrouter.ai',
  'chat.qwen.ai',
  'dashscope.aliyuncs.com',
  'dashscope-intl.aliyuncs.com',
  'cursor.com',
  'cursor.sh',
  'opencode.ai',
  'aider.chat',
  'huggingface.co',
  'hf.co',
  'api.letta.com',
  'api.fireworks.ai',
  'open.bigmodel.cn',
  'ampcode.com',
  'trynia.ai',
  'zenmux.ai',
  'api.x.ai',
  'copass.id',
  'ai-gateway.vercel.sh',
  'api.elevenlabs.io',
  'api.featherless.ai',
  // Cloud storage
  'api.box.com',
  'app.box.com',
  'upload.box.com',
  'account.box.com',
  // Daytona
  'app.daytona.io',
  // Developer tools
  'convex.dev',
  'convex.cloud',
  'convex.site',
  'herokuapp.com',
  'vercel.com',
  'supabase.com',
  'supabase.co',
  'clerk.com',
  'clerk.dev',
  'accounts.dev',
  'clerk.accounts.dev',
  'workos.com',
  'authkit.app',
  'inngest.com',
  'posthog.com',
  'sentry.io',
  'sentry-cdn.com',
  'linear.app',
  'figma.com',
  'figmafiles.com',
  'clickup.com',
  'acli.atlassian.com',
  'railway.app',
  'railway.com',
  'api.useautumn.com',
  'playwright.dev',
  'cdn.playwright.dev',
  'doppler.com',
  'auth0.com',
  'sanity.io',
  'sanity.work',
  'mesa.dev',
  'buildkite.com',
  'api.app.shortcut.com',
  'app.shortcut.com',
  'api.usaspending.gov',
  'files.usaspending.gov',
  'img.logo.dev',
  'logo.dev',
  'browserbase.com',
  // Messaging
  'api.telegram.org',
  'web.whatsapp.com',
  // LLM observability
  'api.smith.langchain.com',
]);

// Wildcard suffixes — `*.example.com` matches `example.com` and `*.example.com`.
// Stored without the `*.` prefix (e.g. `github.com` matches `github.com` and
// `api.github.com`). This is the superset of all wildcard entries from the
// Essential Services list.
export const ESSENTIAL_SERVICES_WILDCARD: ReadonlySet<string> = new Set([
  // NPM / Node
  'yarnpkg.com',
  'bun.sh',
  // Git hosting
  'github.com',
  'githubusercontent.com',
  'gitlab.com',
  'code.storage',
  'dev.azure.com',
  'visualstudio.com',
  // Python
  'astral.sh',
  // Rust
  // (none wildcard)
  // Go
  'golang.org',
  // Composer
  'packagist.org',
  // NuGet
  'nuget.org',
  // Hex
  'hex.pm',
  // Ruby
  'rubygems.org',
  // Ubuntu/Debian
  'ubuntu.com',
  'debian.org',
  // CDN
  'workers.dev',
  'r2.cloudflarestorage.com',
  // AI/ML
  'anthropic.com',
  'claude.ai',
  'platform.claude.com',
  'openai.com',
  'cursor.com',
  'cursor.sh',
  'opencode.ai',
  'huggingface.co',
  'hf.co',
  'xethub.hf.co',
  'cdn.hf.co',
  'aws.cdn.hf.co',
  'gcp.cdn.hf.co',
  'z.ai',
  'moonshot.ai',
  'minimax.io',
  'kimi.com',
  'cursor.sh',
  'ampcode.com',
  'openai.azure.com',
  'services.ai.azure.com',
  'trynia.ai',
  'devin.ai',
  'copass.id',
  // Docker
  'docker.io',
  'docker.com',
  'gcr.io',
  'pkg.dev',
  'ecr.aws',
  // Google Cloud
  'googleapis.com',
  'storage.googleapis.com',
  'gstatic.com',
  // AWS
  'us-east-1.amazonaws.com',
  'us-east-2.amazonaws.com',
  'us-west-1.amazonaws.com',
  'us-west-2.amazonaws.com',
  'eu-central-1.amazonaws.com',
  'eu-central-2.amazonaws.com',
  'eu-north-1.amazonaws.com',
  'eu-south-1.amazonaws.com',
  'eu-south-2.amazonaws.com',
  'eu-west-1.amazonaws.com',
  'eu-west-2.amazonaws.com',
  'eu-west-3.amazonaws.com',
  'ap-south-1.amazonaws.com',
  // Cloud storage
  'blob.core.windows.net',
  'app.box.com',
  'ent.box.com',
  'boxcloud.com',
  // Developer tools
  'convex.dev',
  'convex.cloud',
  'convex.site',
  'herokuapp.com',
  'vercel.com',
  'vercel.app',
  'supabase.com',
  'supabase.co',
  'clerk.com',
  'clerk.dev',
  'accounts.dev',
  'clerk.accounts.dev',
  'workos.com',
  'authkit.app',
  'inngest.com',
  'posthog.com',
  'sentry.io',
  'sentry-cdn.com',
  'linear.app',
  'figma.com',
  'figmafiles.com',
  'clickup.com',
  'railway.app',
  'railway.com',
  'kiro.dev',
  'us-east-1.kiro.dev',
  'browserbase.com',
  'shopify.com',
  'myshopify.com',
  'shopify.dev',
  'shopifycdn.com',
  'doppler.com',
  'auth0.com',
  'sanity.io',
  'sanity.work',
  'mesa.dev',
  'buildkite.com',
  'whatsapp.net',
  'langfuse.com',
  'cloud.langfuse.com',
  // Ubuntu/Debian (wildcard)
  'ubuntu.com',
  'debian.org',
]);

/**
 * Returns true if `hostname` is on the Essential Services allowlist (the
 * sandbox can reach it directly, so the relay should refuse to proxy).
 *
 * Checks exact match first, then wildcard suffixes. A wildcard `*.example.com`
 * matches `example.com` and any `sub.example.com`. Case-insensitive (DNS is).
 */
export function isEssentialService(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();

  if (ESSENTIAL_SERVICES_EXACT.has(host)) return true;

  // Check wildcard suffixes: for `api.github.com`, check `api.github.com`,
  // then `github.com`, then `com` — but we only store meaningful suffixes.
  // Walk up the domain labels.
  const parts = host.split('.');
  for (let i = 1; i < parts.length; i++) {
    const suffix = parts.slice(i).join('.');
    if (ESSENTIAL_SERVICES_WILDCARD.has(suffix)) return true;
  }

  return false;
}
