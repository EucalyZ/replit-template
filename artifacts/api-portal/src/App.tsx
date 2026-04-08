import { useState, useEffect, useCallback } from "react";

const BG = "hsl(222,47%,11%)";
const CARD = "hsl(222,47%,14%)";
const BORDER = "hsl(222,30%,22%)";
const TEXT = "hsl(210,40%,96%)";
const MUTED = "hsl(215,20%,65%)";

const OPENAI_BLUE = "#3b82f6";
const ANTHROPIC_ORANGE = "#f97316";
const BOTH_GRAY = "#6b7280";
const METHOD_GET = "#22c55e";
const METHOD_POST = "#a855f7";

const MODELS = [
  { id: "gpt-5.2", provider: "openai" },
  { id: "gpt-5-mini", provider: "openai" },
  { id: "gpt-5-nano", provider: "openai" },
  { id: "o4-mini", provider: "openai" },
  { id: "o3", provider: "openai" },
  { id: "claude-opus-4-6", provider: "anthropic" },
  { id: "claude-sonnet-4-6", provider: "anthropic" },
  { id: "claude-haiku-4-5", provider: "anthropic" },
];

const ENDPOINTS = [
  {
    method: "GET",
    path: "/v1/models",
    label: "Both",
    labelColor: BOTH_GRAY,
    desc: "Returns the list of all supported models from both providers.",
  },
  {
    method: "POST",
    path: "/v1/chat/completions",
    label: "OpenAI",
    labelColor: OPENAI_BLUE,
    desc: "OpenAI-compatible chat completions. Supports streaming, tool calls. Routes to OpenAI or Anthropic based on model prefix.",
  },
  {
    method: "POST",
    path: "/v1/messages",
    label: "Anthropic",
    labelColor: ANTHROPIC_ORANGE,
    desc: "Anthropic Messages API native format. Claude models pass through directly; OpenAI models are converted automatically.",
  },
];

const STEPS = [
  { n: 1, title: "Open CherryStudio Settings", desc: "Navigate to Settings → Model Provider." },
  {
    n: 2,
    title: "Add Provider",
    desc: 'Click "Add" and choose either OpenAI or Anthropic provider type. Both work — OpenAI compatible uses /v1/chat/completions, Anthropic native uses /v1/messages.',
  },
  {
    n: 3,
    title: "Set Base URL and Key",
    desc: "Paste the Base URL shown above as the API Endpoint. Set the API Key to your PROXY_API_KEY value.",
  },
  {
    n: 4,
    title: "Add Models",
    desc: "Manually enter the model IDs from the Available Models list below, or click the refresh icon if supported.",
  },
];

function useCopy() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = useCallback(async (text: string, key: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement("textarea");
        el.value = text;
        el.setAttribute("readonly", "");
        el.style.position = "absolute";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
    } catch { /* silent */ }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  return { copy, copiedKey };
}

function CopyBtn({ text, id }: { text: string; id: string }) {
  const { copy, copiedKey } = useCopy();
  const copied = copiedKey === id;
  return (
    <button
      onClick={() => copy(text, id)}
      style={{
        background: copied ? "#22c55e22" : "transparent",
        border: `1px solid ${copied ? "#22c55e" : BORDER}`,
        color: copied ? "#22c55e" : MUTED,
        borderRadius: 6,
        padding: "2px 10px",
        fontSize: 12,
        cursor: "pointer",
        transition: "all 0.2s",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: "20px 24px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ color: TEXT, fontSize: 16, fontWeight: 600, margin: "0 0 16px 0" }}>
      {children}
    </h2>
  );
}

function ProviderBadge({ provider }: { provider: string }) {
  return (
    <span
      style={{
        background: provider === "openai" ? "#3b82f611" : "#f9731611",
        color: provider === "openai" ? OPENAI_BLUE : ANTHROPIC_ORANGE,
        border: `1px solid ${provider === "openai" ? "#3b82f633" : "#f9731633"}`,
        borderRadius: 4,
        padding: "1px 7px",
        fontSize: 11,
        fontWeight: 500,
      }}
    >
      {provider === "openai" ? "OpenAI" : "Anthropic"}
    </span>
  );
}

type SetupStatus = {
  proxyApiKey: boolean;
  openai: { configured: boolean; mode: string };
  anthropic: { configured: boolean; mode: string };
} | null;

export default function App() {
  const [status, setStatus] = useState<"loading" | "online" | "offline">("loading");
  const [setup, setSetup] = useState<SetupStatus>(null);
  const baseUrl = window.location.origin;

  useEffect(() => {
    fetch("/api/healthz")
      .then((r) => setStatus(r.ok ? "online" : "offline"))
      .catch(() => setStatus("offline"));

    fetch("/api/setup-status")
      .then((r) => r.json())
      .then(setSetup)
      .catch(() => setSetup(null));
  }, []);

  const curlExample = `curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_PROXY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [{"role":"user","content":"Hello!"}],
    "stream": false
  }'`;

  const modelsExample = `curl ${baseUrl}/v1/models \\
  -H "Authorization: Bearer YOUR_PROXY_API_KEY"`;

  const dotStyle: React.CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: status === "online" ? "#22c55e" : status === "offline" ? "#ef4444" : "#6b7280",
    boxShadow:
      status === "online"
        ? "0 0 6px #22c55e"
        : status === "offline"
        ? "0 0 6px #ef4444"
        : "none",
    display: "inline-block",
    flexShrink: 0,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        color: TEXT,
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: "0 0 60px",
      }}
    >
      {/* Header */}
      <header
        style={{
          background: CARD,
          borderBottom: `1px solid ${BORDER}`,
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 60,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, #3b82f6, #a855f7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
            }}
          >
            ⚡
          </div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>AI Proxy API</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={dotStyle} />
          <span style={{ fontSize: 13, color: MUTED }}>
            {status === "loading" ? "Checking…" : status === "online" ? "Online" : "Offline"}
          </span>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Hero */}
        <div style={{ textAlign: "center", paddingBottom: 8 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 10px", background: "linear-gradient(90deg,#3b82f6,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            OpenAI + Anthropic Proxy
          </h1>
          <p style={{ color: MUTED, fontSize: 15, margin: 0 }}>
            One endpoint, two providers. Powered by Replit AI Integrations — no API keys required.
          </p>
        </div>

        {/* Setup Status */}
        {setup && (
          <Card>
            <SectionTitle>配置状态</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                {
                  label: "PROXY_API_KEY",
                  ok: setup.proxyApiKey,
                  okText: "已配置",
                  failText: "未设置 — 在 Replit Secrets 中添加 PROXY_API_KEY",
                },
                {
                  label: "OpenAI",
                  ok: setup.openai.configured,
                  okText: setup.openai.mode === "replit-integration" ? "Replit AI Integration" : "API Key (OPENAI_API_KEY)",
                  failText: "未配置 — 设置 OPENAI_API_KEY 或通过 Replit AI Integrations",
                },
                {
                  label: "Anthropic",
                  ok: setup.anthropic.configured,
                  okText: setup.anthropic.mode === "replit-integration" ? "Replit AI Integration" : "API Key (ANTHROPIC_API_KEY)",
                  failText: "未配置 — 设置 ANTHROPIC_API_KEY 或通过 Replit AI Integrations",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    background: BG,
                    border: `1px solid ${item.ok ? "#22c55e33" : "#ef444433"}`,
                    borderRadius: 8,
                    padding: "10px 14px",
                  }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{item.ok ? "✅" : "❌"}</span>
                  <span style={{ fontWeight: 600, fontSize: 13, flexShrink: 0, minWidth: 110 }}>{item.label}</span>
                  <span style={{ fontSize: 13, color: item.ok ? "#86efac" : "#fca5a5" }}>
                    {item.ok ? item.okText : item.failText}
                  </span>
                </div>
              ))}
            </div>
            {(!setup.proxyApiKey || !setup.openai.configured || !setup.anthropic.configured) && (
              <div style={{ marginTop: 14, padding: "10px 14px", background: "#f9731611", border: "1px solid #f9731633", borderRadius: 8, fontSize: 13, color: "#fdba74", lineHeight: 1.6 }}>
                <strong>拉取后快速配置：</strong>
                <br />1. Replit Secrets 中添加 <code style={{ color: TEXT }}>PROXY_API_KEY</code>（任意字符串）
                <br />2. 添加 <code style={{ color: TEXT }}>OPENAI_API_KEY</code> 和/或 <code style={{ color: TEXT }}>ANTHROPIC_API_KEY</code>
                <br />   <span style={{ color: MUTED }}>或：让 Replit Agent 运行 AI Integrations 初始化（免费，费用计入 Replit 积分）</span>
                <br />3. 重启 API Server workflow
              </div>
            )}
          </Card>
        )}

        {/* Connection Details */}
        <Card>
          <SectionTitle>Connection Details</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>Base URL</div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: BG,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                }}
              >
                <code style={{ flex: 1, fontSize: 14, color: TEXT, wordBreak: "break-all" }}>
                  {baseUrl}
                </code>
                <CopyBtn text={baseUrl} id="baseurl" />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>Authorization Header</div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: BG,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                }}
              >
                <code style={{ flex: 1, fontSize: 14, color: "#a855f7" }}>
                  Authorization: Bearer YOUR_PROXY_API_KEY
                </code>
                <CopyBtn text="Authorization: Bearer YOUR_PROXY_API_KEY" id="authheader" />
              </div>
            </div>
          </div>
        </Card>

        {/* API Endpoints */}
        <Card>
          <SectionTitle>API Endpoints</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {ENDPOINTS.map((ep) => (
              <div
                key={ep.path}
                style={{
                  background: BG,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: "12px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      background: ep.method === "GET" ? "#22c55e22" : "#a855f722",
                      color: ep.method === "GET" ? METHOD_GET : METHOD_POST,
                      border: `1px solid ${ep.method === "GET" ? "#22c55e44" : "#a855f744"}`,
                      borderRadius: 4,
                      padding: "1px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      flexShrink: 0,
                    }}
                  >
                    {ep.method}
                  </span>
                  <code style={{ flex: 1, fontSize: 14, color: TEXT, minWidth: 0 }}>
                    {baseUrl}{ep.path}
                  </code>
                  <span
                    style={{
                      background: `${ep.labelColor}22`,
                      color: ep.labelColor,
                      border: `1px solid ${ep.labelColor}44`,
                      borderRadius: 4,
                      padding: "1px 8px",
                      fontSize: 11,
                      fontWeight: 500,
                      flexShrink: 0,
                    }}
                  >
                    {ep.label}
                  </span>
                  <CopyBtn text={`${baseUrl}${ep.path}`} id={ep.path} />
                </div>
                <p style={{ margin: 0, fontSize: 13, color: MUTED, lineHeight: 1.5 }}>{ep.desc}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Available Models */}
        <Card>
          <SectionTitle>Available Models</SectionTitle>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: 10,
            }}
          >
            {MODELS.map((m) => (
              <div
                key={m.id}
                style={{
                  background: BG,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <code style={{ fontSize: 13, color: TEXT, wordBreak: "break-all" }}>{m.id}</code>
                <ProviderBadge provider={m.provider} />
              </div>
            ))}
          </div>
        </Card>

        {/* CherryStudio Setup */}
        <Card>
          <SectionTitle>CherryStudio Setup Guide</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {STEPS.map((s) => (
              <div key={s.n} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg,#3b82f6,#a855f7)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {s.n}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Quick Test */}
        <Card>
          <SectionTitle>Quick Test (curl)</SectionTitle>

          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 12, color: MUTED }}>List models</span>
              <CopyBtn text={modelsExample} id="models-curl" />
            </div>
            <pre
              style={{
                background: BG,
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                padding: "14px 16px",
                margin: 0,
                fontSize: 13,
                lineHeight: 1.6,
                overflowX: "auto",
                color: TEXT,
              }}
            >
              <span style={{ color: "#22c55e" }}>curl</span>{" "}
              <span style={{ color: "#f97316" }}>{baseUrl}/v1/models</span> \{"\n"}
              {"  "}<span style={{ color: "#3b82f6" }}>-H</span>{" "}
              <span style={{ color: "#a855f7" }}>"Authorization: Bearer YOUR_PROXY_API_KEY"</span>
            </pre>
          </div>

          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 12, color: MUTED }}>Chat completion</span>
              <CopyBtn text={curlExample} id="chat-curl" />
            </div>
            <pre
              style={{
                background: BG,
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                padding: "14px 16px",
                margin: 0,
                fontSize: 13,
                lineHeight: 1.6,
                overflowX: "auto",
                color: TEXT,
              }}
            >
              <span style={{ color: "#22c55e" }}>curl</span>{" "}
              <span style={{ color: "#f97316" }}>{baseUrl}/v1/chat/completions</span> \{"\n"}
              {"  "}<span style={{ color: "#3b82f6" }}>-H</span>{" "}
              <span style={{ color: "#a855f7" }}>"Authorization: Bearer YOUR_PROXY_API_KEY"</span> \{"\n"}
              {"  "}<span style={{ color: "#3b82f6" }}>-H</span>{" "}
              <span style={{ color: "#a855f7" }}>"Content-Type: application/json"</span> \{"\n"}
              {"  "}<span style={{ color: "#3b82f6" }}>-d</span>{" "}<span style={{ color: "#fbbf24" }}>'{"{"}</span>{"\n"}
              {"    "}<span style={{ color: "#34d399" }}>"model"</span>:{" "}
              <span style={{ color: "#fbbf24" }}>"claude-sonnet-4-6"</span>,{"\n"}
              {"    "}<span style={{ color: "#34d399" }}>"messages"</span>: [{"{"}
              <span style={{ color: "#34d399" }}>"role"</span>:{" "}
              <span style={{ color: "#fbbf24" }}>"user"</span>,{" "}
              <span style={{ color: "#34d399" }}>"content"</span>:{" "}
              <span style={{ color: "#fbbf24" }}>"Hello!"</span>
              {"}"}]{"\n"}
              {"  "}<span style={{ color: "#fbbf24" }}>{"}"}</span>'
            </pre>
          </div>
        </Card>

        {/* Footer */}
        <div style={{ textAlign: "center", color: MUTED, fontSize: 13, paddingTop: 8 }}>
          Powered by{" "}
          <span style={{ color: OPENAI_BLUE }}>OpenAI SDK</span>
          {" + "}
          <span style={{ color: ANTHROPIC_ORANGE }}>Anthropic SDK</span>
          {" via "}
          <span style={{ color: "#a855f7" }}>Replit AI Integrations</span>
          {" — "}
          Express 5 · TypeScript
        </div>
      </main>
    </div>
  );
}
