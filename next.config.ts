import type { NextConfig } from "next";

const staticExport = process.env.CALORIETEXT_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(staticExport
    ? {
        output: "export",
        trailingSlash: true,
        basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "/Calorietext",
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
