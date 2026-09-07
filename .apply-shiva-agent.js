const fs = require("fs");

const file = "server.js";
let s = fs.readFileSync(file, "utf8");

if (!s.includes('model: "gpt-5.6-luna"')) {
  s = s.replace(
    /const PROVIDERS = \{[\s\S]*?\n\};/,
`const PROVIDERS = {
  gemini: {
    name: "Gemini",
    model: "gemini-3.8-flash"
  },
  groq: {
    name: "Groq",
    model: "openai/gpt-oss-120b"
  },
  luna: {
    name: "OpenAI Luna",
    model: "gpt-5.6-luna"
  }
};`
  );
}

s = s.replace(
  /function providerAvailable\(provider\) \{[\s\S]*?\n\}/,
`function providerAvailable(provider) {
  if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  if (provider === "groq") return Boolean(process.env.GROQ_API_KEY);
  if (provider === "luna") return Boolean(process.env.OPENAI_API_KEY);
  return false;
}`
);

const marker = "// --------------------------------------------------\n// BACKEND STATUS";

if (!s.includes('app.post("/api/agent"')) {
  const bridge = `
// --------------------------------------------------
// SHIVA AUTONOMOUS AGENT BRIDGE
// --------------------------------------------------

const AGENT_COOLDOWN = new Map();

function agentCooldown(provider) {
  const until = AGENT_COOLDOWN.get(provider) || 0;
  if (until <= Date.now()) {
    AGENT_COOLDOWN.delete(provider);
    return 0;
  }
  return until - Date.now();
}

function setAgentCooldown(provider, ms) {
  AGENT_COOLDOWN.set(provider, Date.now() + ms);
}

function agentTools(tools) {
  if (!Array.isArray(tools)) return [];

  return tools
    .filter(t => t && typeof t.name === "string")
    .map(t => ({
      type: "function",
      name: t.name,
      description: String(t.description || ""),
      parameters: t.parameters || {
        type: "object",
        properties: {}
      }
    }));
}

async function callGeminiAgent(reqData) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini provider is not configured.");

  const context = reqData.context || "";

  const body = {
    model: PROVIDERS.gemini.model,
    system_instruction: {
      parts: [{
        text:
          SHIVA_IDENTITY +
          "\\n\\n" +
          context +
          "\\n\\nYou are the Shiva 2.0 autonomous coding agent. Inspect before editing. Use tools when required. Test after changes."
      }]
    },
    input: reqData.previous_interaction_id
      ? (reqData.tool_results || []).map(r => ({
          type: "function_result",
          name: r.name,
          call_id: r.call_id,
          result: [{
            type: "text",
            text: JSON.stringify(r.result)
          }]
        }))
      : String(reqData.message || ""),
    tools: agentTools(reqData.tools)
  };

  if (reqData.previous_interaction_id) {
    body.previous_interaction_id = reqData.previous_interaction_id;
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const e = new Error(
      data?.error?.message || "Gemini agent request failed."
    );
    e.status = response.status;
    e.provider = "gemini";
    throw e;
  }

  const function_calls = (data.steps || [])
    .filter(x => x?.type === "function_call")
    .map(x => ({
      id: x.id,
      call_id: x.id,
      name: x.name,
      arguments: x.arguments || {}
    }));

  const output = (data.steps || [])
    .filter(x => x?.type === "model_output")
    .flatMap(x => x.content || [])
    .map(x => x.text || "")
    .join("");

  return {
    provider: "gemini",
    interaction_id: data.id || null,
    function_calls,
    output
  };
}

async function callGroqAgent(reqData) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Groq provider is not configured.");

  const messages = [
    {
      role: "system",
      content:
        SHIVA_IDENTITY +
        "\\n\\n" +
        (reqData.context || "") +
        "\\n\\nYou are the Shiva 2.0 autonomous coding agent. Use tools when required."
    },
    ...(Array.isArray(reqData.history) ? reqData.history : []),
    {
      role: "user",
      content: String(reqData.message || "")
    }
  ];

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key
      },
      body: JSON.stringify({
        model: PROVIDERS.groq.model,
        messages,
        tools: agentTools(reqData.tools),
        tool_choice: "auto"
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const e = new Error(
      data?.error?.message || "Groq agent request failed."
    );
    e.status = response.status;
    e.provider = "groq";
    throw e;
  }

  const msg = data?.choices?.[0]?.message || {};

  const function_calls = (msg.tool_calls || []).map(call => {
    let args = {};

    try {
      args = JSON.parse(call.function?.arguments || "{}");
    } catch {}

    return {
      id: call.id,
      call_id: call.id,
      name: call.function?.name,
      arguments: args
    };
  });

  return {
    provider: "groq",
    interaction_id: null,
    function_calls,
    output: msg.content || ""
  };
}

async function callLunaAgent(reqData) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Luna provider is not configured.");

  const text =
    SHIVA_IDENTITY +
    "\\n\\n" +
    (reqData.context || "") +
    "\\n\\nYou are the Shiva 2.0 autonomous coding agent. Use tools when required.\\n\\n" +
    String(reqData.message || "");

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key
      },
      body: JSON.stringify({
        model: PROVIDERS.luna.model,
        input: text,
        tools: agentTools(reqData.tools),
        max_output_tokens: 1200
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const e = new Error(
      data?.error?.message || "Luna agent request failed."
    );
    e.status = response.status;
    e.provider = "luna";
    throw e;
  }

  const function_calls = (data.output || [])
    .filter(x => x?.type === "function_call")
    .map(x => {
      let args = {};

      try {
        args = JSON.parse(x.arguments || "{}");
      } catch {}

      return {
        id: x.id,
        call_id: x.call_id,
        name: x.name,
        arguments: args
      };
    });

  return {
    provider: "luna",
    interaction_id: data.id || null,
    function_calls,
    output: data.output_text || ""
  };
}

app.post("/api/agent", authenticate, async (req, res) => {
  const body = req.body || {};
  const requested = body.provider || "gemini";

  const order = [
    requested,
    "gemini",
    "groq",
    "luna"
  ].filter(
    (p, i, a) => PROVIDERS[p] && a.indexOf(p) === i
  );

  const failures = [];

  for (const provider of order) {
    if (!providerAvailable(provider)) continue;
    if (agentCooldown(provider)) continue;

    try {
      let result;

      if (provider === "gemini") {
        result = await callGeminiAgent(body);
      } else if (provider === "groq") {
        result = await callGroqAgent(body);
      } else {
        result = await callLunaAgent(body);
      }

      return res.json({
        success: true,
        ...result,
        failures
      });
    } catch (error) {
      failures.push({
        provider,
        status: error.status || null,
        error: error.message || "Provider failed."
      });

      if (error.status === 429) {
        setAgentCooldown(
          provider,
          String(error.message || "").toLowerCase().includes("credit")
            ? 86400000
            : 60000
        );
      }

      console.error(
        "Agent provider failed:",
        provider,
        error.message
      );
    }
  }

  return res.status(503).json({
    success: false,
    error: "All configured AI providers are currently unavailable.",
    failures
  });
});

`;

  if (!s.includes(marker)) {
    throw new Error("Backend status marker not found.");
  }

  s = s.replace(marker, bridge + marker);
}

fs.writeFileSync(file, s);
console.log("SHIVA_AGENT_BRIDGE_APPLIED");
