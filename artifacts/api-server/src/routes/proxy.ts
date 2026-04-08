import { Router, type Request, type Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

// Support both Replit AI Integrations and direct API keys
const openaiBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? undefined;
const openaiApiKey =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??
  process.env.OPENAI_API_KEY ??
  "placeholder";

const anthropicBaseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL ?? undefined;
const anthropicApiKey =
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ??
  process.env.ANTHROPIC_API_KEY ??
  "placeholder";

const openaiClient = new OpenAI({
  baseURL: openaiBaseURL,
  apiKey: openaiApiKey,
});

const anthropicClient = new Anthropic({
  baseURL: anthropicBaseURL,
  apiKey: anthropicApiKey,
});

const MODELS = [
  { id: "gpt-5.2", object: "model", owned_by: "openai" },
  { id: "gpt-5-mini", object: "model", owned_by: "openai" },
  { id: "gpt-5-nano", object: "model", owned_by: "openai" },
  { id: "o4-mini", object: "model", owned_by: "openai" },
  { id: "o3", object: "model", owned_by: "openai" },
  { id: "claude-opus-4-6", object: "model", owned_by: "anthropic" },
  { id: "claude-sonnet-4-6", object: "model", owned_by: "anthropic" },
  { id: "claude-haiku-4-5", object: "model", owned_by: "anthropic" },
];

function verifyBearer(req: Request, res: Response): boolean {
  const auth = req.headers["authorization"] ?? "";
  const expected = `Bearer ${process.env.PROXY_API_KEY ?? ""}`;
  if (!auth || auth !== expected) {
    res.status(401).json({ error: { message: "Unauthorized", type: "invalid_request_error" } });
    return false;
  }
  return true;
}

function isAnthropicModel(model: string): boolean {
  return model.startsWith("claude-");
}

// ───────── Tool conversion helpers ─────────

function openaiToolsToAnthropic(tools: OpenAI.Chat.ChatCompletionTool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description ?? "",
    input_schema: (t.function.parameters ?? { type: "object", properties: {} }) as Anthropic.Tool["input_schema"],
  }));
}

function openaiToolChoiceToAnthropic(
  tc: OpenAI.Chat.ChatCompletionToolChoiceOption | undefined,
): Anthropic.MessageCreateParams["tool_choice"] | undefined {
  if (!tc) return undefined;
  if (tc === "auto") return { type: "auto" };
  if (tc === "none") return { type: "auto" };
  if (tc === "required") return { type: "any" };
  if (typeof tc === "object" && tc.type === "function") {
    return { type: "tool", name: tc.function.name };
  }
  return undefined;
}

function openaiMessagesToAnthropic(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): { system: string | undefined; messages: Anthropic.MessageParam[] } {
  let system: string | undefined;
  const converted: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      system = typeof msg.content === "string" ? msg.content : "";
      continue;
    }

    if (msg.role === "user") {
      converted.push({
        role: "user",
        content: typeof msg.content === "string" ? msg.content : (msg.content as Anthropic.ContentBlockParam[]),
      });
      continue;
    }

    if (msg.role === "assistant") {
      const content: Anthropic.ContentBlockParam[] = [];
      if (msg.content) {
        content.push({ type: "text", text: typeof msg.content === "string" ? msg.content : "" });
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let inputObj: Record<string, unknown> = {};
          try { inputObj = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input: inputObj,
          });
        }
      }
      converted.push({ role: "assistant", content });
      continue;
    }

    if (msg.role === "tool") {
      converted.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.tool_call_id,
            content: typeof msg.content === "string" ? msg.content : "",
          },
        ],
      });
      continue;
    }
  }

  return { system, messages: converted };
}

function anthropicResponseToOpenai(
  msg: Anthropic.Message,
  model: string,
): OpenAI.Chat.ChatCompletion {
  const toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];
  let textContent = "";

  for (const block of msg.content) {
    if (block.type === "text") {
      textContent += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  const finishReason: OpenAI.Chat.ChatCompletion.Choice["finish_reason"] =
    msg.stop_reason === "tool_use"
      ? "tool_calls"
      : msg.stop_reason === "end_turn"
      ? "stop"
      : "stop";

  return {
    id: `chatcmpl-${msg.id}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: textContent || null,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          refusal: null,
        },
        finish_reason: finishReason,
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: msg.usage.input_tokens,
      completion_tokens: msg.usage.output_tokens,
      total_tokens: msg.usage.input_tokens + msg.usage.output_tokens,
    },
  };
}

// ───────── GET /v1/models ─────────

router.get("/models", (req: Request, res: Response) => {
  if (!verifyBearer(req, res)) return;
  res.json({ object: "list", data: MODELS });
});

// ───────── POST /v1/chat/completions ─────────

router.post("/chat/completions", async (req: Request, res: Response) => {
  if (!verifyBearer(req, res)) return;

  const body = req.body as OpenAI.Chat.ChatCompletionCreateParams;
  const { model, messages, stream, tools, tool_choice, ...rest } = body;

  try {
    if (!isAnthropicModel(model)) {
      // ── OpenAI path ──
      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const keepalive = setInterval(() => {
          try { res.write(": keepalive\n\n"); } catch { /* ignore */ }
        }, 5000);

        req.on("close", () => clearInterval(keepalive));

        try {
          const oaiStream = await openaiClient.chat.completions.create({
            model,
            messages,
            stream: true,
            ...(tools ? { tools } : {}),
            ...(tool_choice ? { tool_choice } : {}),
            ...rest,
          } as OpenAI.Chat.ChatCompletionCreateParamsStreaming);

          for await (const chunk of oaiStream) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            (res as unknown as { flush?: () => void }).flush?.();
          }
          res.write("data: [DONE]\n\n");
        } finally {
          clearInterval(keepalive);
          res.end();
        }
      } else {
        const result = await openaiClient.chat.completions.create({
          model,
          messages,
          stream: false,
          ...(tools ? { tools } : {}),
          ...(tool_choice ? { tool_choice } : {}),
          ...rest,
        } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
        res.json(result);
      }
    } else {
      // ── Anthropic path ──
      const { system, messages: anthropicMessages } = openaiMessagesToAnthropic(messages);
      const anthropicTools = tools ? openaiToolsToAnthropic(tools) : undefined;
      const anthropicToolChoice = openaiToolChoiceToAnthropic(tool_choice);
      const maxTokens = (rest as Record<string, unknown>).max_tokens as number | undefined ?? 8192;

      const params: Anthropic.MessageCreateParams = {
        model,
        messages: anthropicMessages,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        ...(anthropicTools ? { tools: anthropicTools } : {}),
        ...(anthropicToolChoice ? { tool_choice: anthropicToolChoice } : {}),
      };

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const keepalive = setInterval(() => {
          try { res.write(": keepalive\n\n"); } catch { /* ignore */ }
        }, 5000);

        req.on("close", () => clearInterval(keepalive));

        try {
          const anthropicStream = anthropicClient.messages.stream(params);

          let msgId = "";
          const toolCallsAccum: Record<number, { id: string; name: string; arguments: string }> = {};
          let toolCallIndex = 0;
          let currentBlockType: string | null = null;

          for await (const event of anthropicStream) {
            if (event.type === "message_start") {
              msgId = `chatcmpl-${event.message.id}`;
              const chunk: OpenAI.Chat.ChatCompletionChunk = {
                id: msgId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null, logprobs: null }],
              };
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
              (res as unknown as { flush?: () => void }).flush?.();
            } else if (event.type === "content_block_start") {
              currentBlockType = event.content_block.type;
              if (event.content_block.type === "tool_use") {
                const idx = toolCallIndex++;
                toolCallsAccum[idx] = { id: event.content_block.id, name: event.content_block.name, arguments: "" };
                const chunk: OpenAI.Chat.ChatCompletionChunk = {
                  id: msgId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        tool_calls: [
                          {
                            index: idx,
                            id: event.content_block.id,
                            type: "function",
                            function: { name: event.content_block.name, arguments: "" },
                          },
                        ],
                      },
                      finish_reason: null,
                      logprobs: null,
                    },
                  ],
                };
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                (res as unknown as { flush?: () => void }).flush?.();
              }
            } else if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                const chunk: OpenAI.Chat.ChatCompletionChunk = {
                  id: msgId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [{ index: 0, delta: { content: event.delta.text }, finish_reason: null, logprobs: null }],
                };
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                (res as unknown as { flush?: () => void }).flush?.();
              } else if (event.delta.type === "input_json_delta") {
                const idx = toolCallIndex - 1;
                if (toolCallsAccum[idx]) toolCallsAccum[idx].arguments += event.delta.partial_json;
                const chunk: OpenAI.Chat.ChatCompletionChunk = {
                  id: msgId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        tool_calls: [{ index: idx, function: { arguments: event.delta.partial_json } }],
                      },
                      finish_reason: null,
                      logprobs: null,
                    },
                  ],
                };
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                (res as unknown as { flush?: () => void }).flush?.();
              }
            } else if (event.type === "message_delta") {
              const finishReason: OpenAI.Chat.ChatCompletionChunk.Choice["finish_reason"] =
                event.delta.stop_reason === "tool_use" ? "tool_calls" : "stop";
              const chunk: OpenAI.Chat.ChatCompletionChunk = {
                id: msgId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: {}, finish_reason: finishReason, logprobs: null }],
              };
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
              (res as unknown as { flush?: () => void }).flush?.();
            }
          }
          res.write("data: [DONE]\n\n");
        } finally {
          clearInterval(keepalive);
          res.end();
        }
      } else {
        // Non-streaming: always use stream internally (avoids Anthropic 10-min timeout)
        const anthropicStream = anthropicClient.messages.stream(params);
        const msg = await anthropicStream.finalMessage();
        const result = anthropicResponseToOpenai(msg, model);
        res.json(result);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: { message: msg, type: "api_error" } });
  }
});

// ───────── POST /v1/messages (Anthropic native) ─────────

router.post("/messages", async (req: Request, res: Response) => {
  if (!verifyBearer(req, res)) return;

  const body = req.body as Anthropic.MessageCreateParams & { model: string; stream?: boolean };
  const { model, stream } = body;

  try {
    if (isAnthropicModel(model)) {
      // ── Anthropic native passthrough ──
      const params: Anthropic.MessageCreateParams = {
        ...body,
        stream: undefined,
      };

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const keepalive = setInterval(() => {
          try { res.write(": keepalive\n\n"); } catch { /* ignore */ }
        }, 5000);
        req.on("close", () => clearInterval(keepalive));

        try {
          const anthropicStream = anthropicClient.messages.stream(params);
          for await (const event of anthropicStream) {
            res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
            (res as unknown as { flush?: () => void }).flush?.();
          }
          res.write("event: message_stop\ndata: {}\n\n");
        } finally {
          clearInterval(keepalive);
          res.end();
        }
      } else {
        const anthropicStream = anthropicClient.messages.stream(params);
        const msg = await anthropicStream.finalMessage();
        res.json(msg);
      }
    } else {
      // ── OpenAI model via Anthropic-format request ──
      type AnthropicMsg = { role: string; content: unknown };
      const anthropicMsgs = (body.messages ?? []) as AnthropicMsg[];

      // Convert Anthropic messages → OpenAI messages
      const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (body.system) {
        const systemText = typeof body.system === "string" ? body.system : "";
        if (systemText) openaiMessages.push({ role: "system", content: systemText });
      }

      for (const msg of anthropicMsgs) {
        if (msg.role === "user") {
          if (typeof msg.content === "string") {
            openaiMessages.push({ role: "user", content: msg.content });
          } else if (Array.isArray(msg.content)) {
            const parts = msg.content as Array<{ type: string; tool_use_id?: string; content?: string; text?: string }>;
            const toolResults = parts.filter((p) => p.type === "tool_result");
            if (toolResults.length > 0) {
              for (const tr of toolResults) {
                openaiMessages.push({
                  role: "tool",
                  tool_call_id: tr.tool_use_id ?? "",
                  content: typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content),
                });
              }
            } else {
              const textContent = parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
              openaiMessages.push({ role: "user", content: textContent });
            }
          }
        } else if (msg.role === "assistant") {
          if (typeof msg.content === "string") {
            openaiMessages.push({ role: "assistant", content: msg.content });
          } else if (Array.isArray(msg.content)) {
            const parts = msg.content as Array<{ type: string; id?: string; name?: string; input?: unknown; text?: string }>;
            const toolUses = parts.filter((p) => p.type === "tool_use");
            const textParts = parts.filter((p) => p.type === "text");
            const textContent = textParts.map((p) => p.text ?? "").join("");
            if (toolUses.length > 0) {
              openaiMessages.push({
                role: "assistant",
                content: textContent || null,
                tool_calls: toolUses.map((tu, i) => ({
                  id: tu.id ?? `call_${i}`,
                  type: "function" as const,
                  function: { name: tu.name ?? "", arguments: JSON.stringify(tu.input ?? {}) },
                })),
              });
            } else {
              openaiMessages.push({ role: "assistant", content: textContent });
            }
          }
        }
      }

      // Convert tools
      type AnthropicTool = { name: string; description?: string; input_schema: Record<string, unknown> };
      const anthropicTools = (body.tools ?? []) as AnthropicTool[];
      const openaiTools: OpenAI.Chat.ChatCompletionTool[] = anthropicTools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
        },
      }));

      // Convert tool_choice
      type AnthropicTC = { type: string; name?: string };
      const anthropicTC = body.tool_choice as AnthropicTC | undefined;
      let openaiTC: OpenAI.Chat.ChatCompletionToolChoiceOption | undefined;
      if (anthropicTC) {
        if (anthropicTC.type === "any") openaiTC = "required";
        else if (anthropicTC.type === "auto") openaiTC = "auto";
        else if (anthropicTC.type === "tool" && anthropicTC.name) {
          openaiTC = { type: "function", function: { name: anthropicTC.name } };
        }
      }

      if (stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();

        const keepalive = setInterval(() => {
          try { res.write(": keepalive\n\n"); } catch { /* ignore */ }
        }, 5000);
        req.on("close", () => clearInterval(keepalive));

        try {
          const oaiStream = await openaiClient.chat.completions.create({
            model,
            messages: openaiMessages,
            stream: true,
            ...(openaiTools.length > 0 ? { tools: openaiTools } : {}),
            ...(openaiTC ? { tool_choice: openaiTC } : {}),
            max_completion_tokens: (body.max_tokens as number | undefined) ?? 8192,
          });

          let msgId = `msg_${Date.now()}`;
          let inputTokens = 0;
          let outputTokens = 0;
          let sentStart = false;
          let currentText = "";
          let blockIndex = 0;
          const toolBlocks: Record<number, { id: string; name: string }> = {};
          let activeToolIndex: number | null = null;

          for await (const chunk of oaiStream) {
            if (!sentStart) {
              sentStart = true;
              res.write(`event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: msgId, type: "message", role: "assistant", content: [], model, stop_reason: null, usage: { input_tokens: 0, output_tokens: 0 } } })}\n\n`);
              res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`);
              (res as unknown as { flush?: () => void }).flush?.();
            }

            const choice = chunk.choices[0];
            if (!choice) continue;
            const delta = choice.delta;

            if (delta.content) {
              currentText += delta.content;
              res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: delta.content } })}\n\n`);
              (res as unknown as { flush?: () => void }).flush?.();
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (tc.id && tc.function?.name) {
                  const toolBlockIdx = blockIndex + 1 + idx;
                  toolBlocks[idx] = { id: tc.id, name: tc.function.name };
                  if (activeToolIndex !== idx) {
                    if (activeToolIndex !== null) {
                      res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: blockIndex + activeToolIndex + 1 })}\n\n`);
                    }
                    res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: toolBlockIdx, content_block: { type: "tool_use", id: tc.id, name: tc.function.name, input: {} } })}\n\n`);
                    activeToolIndex = idx;
                    (res as unknown as { flush?: () => void }).flush?.();
                  }
                }
                if (tc.function?.arguments) {
                  const toolBlockIdx = blockIndex + 1 + idx;
                  res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: toolBlockIdx, delta: { type: "input_json_delta", partial_json: tc.function.arguments } })}\n\n`);
                  (res as unknown as { flush?: () => void }).flush?.();
                }
              }
            }

            if (chunk.usage) {
              inputTokens = chunk.usage.prompt_tokens ?? 0;
              outputTokens = chunk.usage.completion_tokens ?? 0;
            }
          }

          // Close text block
          res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`);
          if (activeToolIndex !== null) {
            res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: blockIndex + activeToolIndex + 1 })}\n\n`);
          }
          const stopReason = activeToolIndex !== null ? "tool_use" : "end_turn";
          res.write(`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: outputTokens } })}\n\n`);
          res.write(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`);
        } finally {
          clearInterval(keepalive);
          res.end();
        }
      } else {
        const result = await openaiClient.chat.completions.create({
          model,
          messages: openaiMessages,
          stream: false,
          ...(openaiTools.length > 0 ? { tools: openaiTools } : {}),
          ...(openaiTC ? { tool_choice: openaiTC } : {}),
          max_completion_tokens: (body.max_tokens as number | undefined) ?? 8192,
        } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);

        // Convert OpenAI response → Anthropic Message format
        const choice = result.choices[0];
        const content: Anthropic.ContentBlock[] = [];
        if (choice?.message.content) {
          content.push({ type: "text", text: choice.message.content });
        }
        if (choice?.message.tool_calls) {
          for (const tc of choice.message.tool_calls) {
            let inputObj: Record<string, unknown> = {};
            try { inputObj = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
            content.push({ type: "tool_use", id: tc.id, name: tc.function.name, input: inputObj });
          }
        }
        const stopReason = choice?.finish_reason === "tool_calls" ? "tool_use" : "end_turn";
        const anthropicMsg: Anthropic.Message = {
          id: `msg_${result.id}`,
          type: "message",
          role: "assistant",
          content,
          model,
          stop_reason: stopReason as Anthropic.Message["stop_reason"],
          stop_sequence: null,
          usage: {
            input_tokens: result.usage?.prompt_tokens ?? 0,
            output_tokens: result.usage?.completion_tokens ?? 0,
          },
        };
        res.json(anthropicMsg);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: { type: "api_error", message: msg } });
  }
});

export default router;
