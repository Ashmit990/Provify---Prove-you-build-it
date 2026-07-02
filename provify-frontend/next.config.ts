import type { NextConfig } from "next";

// standalone output is required for the Docker runtime image.
// On Vercel, we skip it (Vercel handles its own bundling).
const isDockerBuild = process.env.DOCKER_BUILD === "1";

const nextConfig: NextConfig = {
  output: isDockerBuild ? "standalone" : undefined,
};

export default nextConfig;
