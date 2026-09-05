const express = require("express");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/*
==================================================
SHIVA 2.0 — AI ROUTER
Providers:
1. Gemini
2. Groq
3. Mistral
4. Qwen
==================================================
*/

/* -----------------------------------------------
   PROVIDER CONFIGURATION
------------------------------------------------ */

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


/* -----------------------------------------------
   CHECK PROVIDER
------------------------------------------------ */

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

    return {
        valid: true
    };
}


/* -----------------------------------------------
   GEMINI
------------------------------------------------ */

async function callGemini(message) {

    const apiKey = process.env.GEMINI_API_KEY;

    const url =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
        apiKey;

    const response = await fetch(url, {
        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        {
                            text: message
                        }
                    ]
                }
            ]
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data?.error?.message ||
            "Gemini API request failed."
        );
    }

    const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
        throw new Error("Gemini returned an empty response.");
    }

    return text;
}


/* -----------------------------------------------
   GROQ
------------------------------------------------ */

async function callGroq(message) {

    const apiKey = process.env.GROQ_API_KEY;

    const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },

            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",

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

    const text =
        data?.choices?.[0]?.message?.content;

    if (!text) {
        throw new Error("Groq returned an empty response.");
    }

    return text;
}


/* -----------------------------------------------
   MISTRAL
------------------------------------------------ */

async function callMistral(message) {

    const apiKey = process.env.MISTRAL_API_KEY;

    const response = await fetch(
        "https://api.mistral.ai/v1/chat/completions",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },

            body: JSON.stringify({
                model: "mistral-small-latest",

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

    const text =
        data?.choices?.[0]?.message?.content;

    if (!text) {
        throw new Error("Mistral returned an empty response.");
    }

    return text;
}


/* -----------------------------------------------
   QWEN
------------------------------------------------ */

async function callQwen(message) {

    const apiKey = process.env.QWEN_API_KEY;

    const response = await fetch(
        "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },

            body: JSON.stringify({
                model: "qwen-plus",

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
            "Qwen API request failed."
        );
    }

    const text =
        data?.choices?.[0]?.message?.content;

    if (!text) {
        throw new Error("Qwen returned an empty response.");
    }

    return text;
}


/* -----------------------------------------------
   AI ROUTER
------------------------------------------------ */

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


/* -----------------------------------------------
   GET STATUS
------------------------------------------------ */

app.get("/api/status", (req, res) => {

    res.json({
        success: true,

        message:
            "Shiva 2.0 Backend + AI Router is working! 🚀",

        providers: {
            gemini: !!process.env.GEMINI_API_KEY,
            groq: !!process.env.GROQ_API_KEY,
            mistral: !!process.env.MISTRAL_API_KEY,
            qwen: !!process.env.QWEN_API_KEY
        }
    });

});


/* -----------------------------------------------
   POST MESSAGE
------------------------------------------------ */

app.post("/api/message", async (req, res) => {

    try {

        const provider =
            String(req.body.provider || "gemini")
                .toLowerCase();

        const message =
            typeof req.body.message === "string"
                ? req.body.message.trim()
                : "";

        /*
        Backward compatibility with the
        previous test API.
        */

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


        const providerCheck =
            checkProvider(provider);


        if (!providerCheck.valid) {

            return res.status(400).json({
                success: false,
                error: providerCheck.message
            });

        }


        const reply =
            await routeToAI(provider, message);


        res.json({

            success: true,

            provider: provider,

            reply: reply

        });

    }

    catch (error) {

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


/* -----------------------------------------------
   SERVER
------------------------------------------------ */

app.listen(PORT, "0.0.0.0", () => {

    console.log(
        `Shiva 2.0 Backend running on port ${PORT}`
    );

});
