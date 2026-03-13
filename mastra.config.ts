// mastra.config.ts
export default {
  modelProviders: {
    openai: {
      apiKeyEnv: "OPENAI_API_KEY"
    }
  },
  telemetryDisabled: process.env.MASTRA_TELEMETRY_DISABLED === "1"
};