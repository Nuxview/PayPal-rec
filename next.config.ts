import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  serverExternalPackages: ["pdfkit"],
  outputFileTracingIncludes: {
    "/api/demo/reviewed-packet": [
      "./fixtures/restriction-agency-v1/inputs/*.txt",
      "./node_modules/@fontsource/inter/files/inter-latin-400-normal.woff",
      "./node_modules/@fontsource/inter/files/inter-latin-600-normal.woff",
    ],
  },
};

export default config;
