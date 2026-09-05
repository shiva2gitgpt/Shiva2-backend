const express=require("express");
const cors=require("cors");

const app=express();
const PORT=process.env.PORT||3000;

app.use(cors());
app.use(express.json({limit:"1mb"}));

const PROVIDERS={
 gemini:{
  name:"Gemini",
  apiKey:process.env.GEMINI_API_KEY
 },
 groq:{
  name:"Groq",
  apiKey:process.env.GROQ_API_KEY
 }
};

const SHIVA_IDENTITY=`
You are Shiva AI, the AI assistant inside the Shiva 2.0 platform.

Identity:
- You are part of Shiva 2.0.
- You were developed by SHIVA.
- SHIVA is the developer/creator of the Shiva 2.0 platform.
- The currently selected provider is only your underlying AI engine.
- If the user asks who developed or created you, say that you are Shiva AI developed by SHIVA.
- Do not identify OpenAI, Google, Groq, or another provider as the developer of Shiva AI.
- If the user mentions the selected provider name such as "Groq" or "Gemini", understand that they normally mean the currently selected AI engine unless the conversation clearly indicates otherwise.
- Keep your Shiva AI identity consistent even when the underlying provider changes.
- Be helpful, accurate and natural.
`;

function checkProvider(provider){

 if(!PROVIDERS[provider])
  return {
   valid:false,
   message:`Unknown provider: ${provider}`
  };

 if(!PROVIDERS[provider].apiKey)
  return {
   valid:false,
   message:`${PROVIDERS[provider].name} API key is not configured.`
  };

 return {valid:true};

}

function cleanHistory(history){

 if(!Array.isArray(history))
  return [];

 return history
  .filter(
   m=>
    m &&
    ["user","assistant"].includes(m.role) &&
    typeof m.content==="string"
  )
  .slice(-30)
  .map(
   m=>({
    role:m.role,
    content:m.content.slice(0,12000)
   })
  );

}

async function callGemini(message,history){

 const transcript=
  history.length
  ?history
   .map(
    m=>
     `${m.role==="user"?"SHIVA":"SHIVA AI"}: ${m.content}`
   )
   .join("\n\n")
  :"";

 const input=
  transcript
  ?`${transcript}\n\nSHIVA: ${message}`
  :message;

 const response=await fetch(
  "https://generativelanguage.googleapis.com/v1beta/interactions",
  {
   method:"POST",
   headers:{
    "Content-Type":"application/json",
    "x-goog-api-key":process.env.GEMINI_API_KEY
   },
   body:JSON.stringify({
    model:"gemini-3.8-flash",
    system_instruction:SHIVA_IDENTITY,
    input
   })
  }
 );

 const data=await response.json();

 if(!response.ok)
  throw new Error(
   data?.error?.message||
   data?.message||
   "Gemini API request failed."
  );

 const text=
  data?.steps
   ?.filter(x=>x?.type==="model_output")
   ?.flatMap(x=>x?.content||[])
   ?.filter(x=>x?.type==="text")
   ?.map(x=>x?.text||"")
   ?.join("")||
  data?.output_text||
  "";

 if(!text)
  throw new Error(
   "Gemini returned an empty response."
  );

 return text;

}

async function callGroq(message,history){

 const messages=[
  {
   role:"system",
   content:SHIVA_IDENTITY
  },
  ...history,
  {
   role:"user",
   content:message
  }
 ];

 const response=await fetch(
  "https://api.groq.com/openai/v1/chat/completions",
  {
   method:"POST",
   headers:{
    "Content-Type":"application/json",
    "Authorization":
     `Bearer ${process.env.GROQ_API_KEY}`
   },
   body:JSON.stringify({
    model:"openai/gpt-oss-120b",
    messages
   })
  }
 );

 const data=await response.json();

 if(!response.ok)
  throw new Error(
   data?.error?.message||
   "Groq API request failed."
  );

 const text=
  data?.choices?.[0]?.message?.content;

 if(!text)
  throw new Error(
   "Groq returned an empty response."
  );

 return text;

}

async function routeToAI(
 provider,
 message,
 history
){

 switch(provider){

  case"gemini":
   return callGemini(
    message,
    history
   );

  case"groq":
   return callGroq(
    message,
    history
   );

  default:
   throw new Error(
    `Unsupported provider: ${provider}`
   );

 }

}

app.get(
 "/api/status",
 (req,res)=>{

  res.json({
   success:true,
   message:
    "Shiva 2.0 Backend + AI Router is working! 🚀",
   providers:{
    gemini:!!process.env.GEMINI_API_KEY,
    groq:!!process.env.GROQ_API_KEY
   }
  });

 }
);

app.post(
 "/api/message",
 async(req,res)=>{

  try{

   const provider=
    String(
     req.body.provider||"gemini"
    ).toLowerCase();

   const mode=
    String(
     req.body.mode||"unified"
    ).toLowerCase();

   const message=
    typeof req.body.message==="string"
    ?req.body.message.trim()
    :"";

   const history=
    cleanHistory(req.body.history);

   if(!message&&req.body.name){

    return res.json({
     success:true,
     message:
      `Hello ${req.body.name}! Backend received your data. 🚀`
    });

   }

   if(!message){

    return res.status(400).json({
     success:false,
     error:"Message is required."
    });

   }

   if(
    !["unified","split"].includes(mode)
   ){

    return res.status(400).json({
     success:false,
     error:
      "Unknown chat mode: use unified or split."
    });

   }

   const check=
    checkProvider(provider);

   if(!check.valid){

    return res.status(400).json({
     success:false,
     error:check.message
    });

   }

   const reply=
    await routeToAI(
     provider,
     message,
     history
    );

   res.json({
    success:true,
    mode,
    provider,
    reply
   });

  }catch(error){

   console.error(
    "AI Router Error:",
    error.message
   );

   res.status(500).json({
    success:false,
    error:
     error.message||
     "AI provider request failed."
   });

  }

 }
);

app.listen(
 PORT,
 "0.0.0.0",
 ()=>console.log(
  `Shiva 2.0 Backend running on port ${PORT}`
 )
);
