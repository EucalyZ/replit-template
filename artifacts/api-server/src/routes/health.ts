import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/setup-status", (_req, res) => {
  const hasReplitOpenAI = !!(
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL &&
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  );
  const hasDirectOpenAI = !!process.env.OPENAI_API_KEY;
  const hasReplitAnthropic = !!(
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL &&
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY
  );
  const hasDirectAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasProxyKey = !!process.env.PROXY_API_KEY;

  res.json({
    proxyApiKey: hasProxyKey,
    openai: {
      configured: hasReplitOpenAI || hasDirectOpenAI,
      mode: hasReplitOpenAI ? "replit-integration" : hasDirectOpenAI ? "api-key" : "none",
    },
    anthropic: {
      configured: hasReplitAnthropic || hasDirectAnthropic,
      mode: hasReplitAnthropic ? "replit-integration" : hasDirectAnthropic ? "api-key" : "none",
    },
  });
});

export default router;
