const express = require("express");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const PROVIDERS = {
    gemini: {
        name: "Gemini",
        apiKey: process.env.GEMINI_API_KEY
    },
    groq: {
        name: "Groq",
        apiKey: process.env.GROQ_API_KEY
    },
    mistral: {
        name: "Mistral",
        apiKey: process.env.MISTRAL_API_KEY
    },
    qwen: {
        name: "Qwen",
        apiKey: process.env.QWEN_API_KEY
    }
};

function checkProvider(provider) {
    if (!PROVIDERS[provider]) {
        return {
            valid: false,
            message: `Unknown provider: ${provider}`
        };
    }

    if (!PROVIDERS[provider].apiKey) {
        return {
            valid: false,
            message: `${PROVIDERS[provider].name} API key is not configured.`
        };
    }

    return { valid: true };
}

/* =========================
   GEMINI
   Current model:
   gemini-3.8-flash
   Interactions API
========================= */

async function callGemini(message) {
    const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": process.env.GEMINI_API_KEY
            },
            body: JSON.stringify({
                model: "gemini-3.8-flash",
                input: message
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data?.error?.message ||
            data?.message ||
            "Gemini API request failed."
        );
    }

    const text =
        data?.outputs
            ?.filter(item => item?.type === "text")
            ?.map(item => item?.text)
            ?.join("") ||
        data?.output_text ||
        "";

    if (!text) {
        throw new Error("Gemini returned an empty response.");
    }

    return text;
}

/* =========================
   GROQ
   Current model:
   openai/gpt-oss-120b
========================= */

async function callGroq(message) {
    const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                messages: [
                    {
                        role: "user",
                        content: message
                    }
                ]
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data?.error?.message ||
            "Groq API request failed."
        );
    }

    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
        throw new Error("Groq returned an empty response.");
    }

    return text;
}

/* =========================
   MISTRAL
   Current model:
   mistral-small-2603
========================= */

async function callMistral(message) {
    const response = await fetch(
        "https://api.mistral.ai/v1/chat/completions",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`
            },
            body: JSON.stringify({
                model: "mistral-small-2603",
                messages: [
                    {
                        role: "user",
                        content: message
                    }
                ]
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data?.message ||
            data?.error?.message ||
            "Mistral API request failed."
        );
    }

    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
        throw new Error("Mistral returned an empty response.");
    }

    return text;
}

/* =========================
   QWEN
   Current Singapore model:
   qwen3.8-27b

   Existing international endpoint
   remains supported.
========================= */

async function callQwen(message) {
    const response = await fetch(
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.QWEN_API_KEY}`
            },
            body: JSON.stringify({
                model: "qwen3.8-27b",
                messages: [
                    {
                        role: "user",
                        content: message
                    }
                ]
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data?.error?.message ||
            data?.message ||
            "Qwen API request failed."
        );
    }

    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
        throw new Error("Qwen returned an empty response.");
    }

    return text;
}

/* =========================
   AI ROUTER
========================= */

async function routeToAI(provider, message) {
    switch (provider) {
        case "gemini":
            return await callGemini(message);

        case "groq":
            return await callGroq(message);

        case "mistral":
            return await callMistral(message);

        case "qwen":
            return await callQwen(message);

        default:
            throw new Error(
                `Unsupported provider: ${provider}`
            );
    }
}

/* =========================
   STATUS
========================= */

app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        message: "Shiva 2.0 Backend + AI Router is working! 🚀",
        providers: {
            gemini: !!process.env.GEMINI_API_KEY,
            groq: !!process.env.GROQ_API_KEY,
            mistral: !!process.env.MISTRAL_API_KEY,
            qwen: !!process.env.QWEN_API_KEY
        }
    });
});

/* =========================
   MESSAGE
========================= */

app.post("/api/message", async (req, res) => {
    try {
        const provider =
            String(req.body.provider || "gemini").toLowerCase();

        const message =
            typeof req.body.message === "string"
                ? req.body.message.trim()
                : "";

        /* Preserve existing backend test */
        if (!message && req.body.name) {
            return res.json({
                success: true,
                message:
                    "Hello " +
                    req.body.name +
                    "! Backend received your data. 🚀"
            });
        }

        if (!message) {
            return res.status(400).json({
                success: false,
                error: "Message is required."
            });
        }

        const providerCheck = checkProvider(provider);

        if (!providerCheck.valid) {
            return res.status(400).json({
                success: false,
                error: providerCheck.message
            });
        }

        const reply = await routeToAI(
            provider,
            message
        );

        res.json({
            success: true,
            provider: provider,
            reply: reply
        });

    } catch (error) {
        console.error(
            "AI Router Error:",
            error.message
        );

        res.status(500).json({
            success: false,
            error:
                error.message ||
                "AI provider request failed."
        });
    }
});

/* =========================
   SERVER
========================= */

app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `Shiva 2.0 Backend running on port ${PORT}`
    );
});


