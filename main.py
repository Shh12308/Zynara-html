 # === ZYNARA AI API: GPT-Grade Assistant ===
# === Imports with Fallbacks ===
import os, io, json, tempfile, base64, requests, uuid
from PIL import Image
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from pydantic import BaseModel
from duckduckgo_search import ddg

# Optional heavy dependencies
try:
    import torch
except ImportError:
    torch = None
    print("⚠️ PyTorch not installed. Some AI features will be disabled.")

try:
    import whisper
except ImportError:
    whisper = None
    print("⚠️ Whisper not installed. Speech-to-text will be disabled.")

try:
    import soundfile as sf
except ImportError:
    sf = None
    print("⚠️ SoundFile not installed. Audio features may be limited.")

try:
    import chromadb
except ImportError:
    chromadb = None
    print("⚠️ ChromaDB not installed. Memory features will be disabled.")

try:
    from transformers import (
        AutoTokenizer, AutoModelForCausalLM,
        AutoProcessor, AutoModelForVision2Seq,
        AutoModelForSeq2SeqLM
    )
except ImportError:
    AutoTokenizer = AutoModelForCausalLM = AutoProcessor = AutoModelForVision2Seq = AutoModelForSeq2SeqLM = None
    print("⚠️ Transformers not installed. Model features will be disabled.")

os.makedirs("temp", exist_ok=True)

# if using another image captioning model, load it here:
caption_model = AutoModelForVision2Seq.from_pretrained("your_model")
caption_processor = AutoProcessor.from_pretrained("your_model")

# === Optional Supabase ===
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_ENABLED = bool(SUPABASE_URL and SUPABASE_KEY)

if SUPABASE_ENABLED:
    from supabase import create_client
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# === API KEYS ===
OPENWEATHER_KEY = os.getenv("OPENWEATHER_KEY", "")
WOLFRAM_KEY = os.getenv("WOLFRAM_KEY", "")
SIGHTENGINE_API = os.getenv("SIGHTENGINE_API", "")
SIGHTENGINE_USER = os.getenv("SIGHTENGINE_USER", "")
TAVILY_KEY = os.getenv("TAVILY_API_KEY", "")

# === Lazy Model Loader ===

MODEL_IDS = {
    "mixtral": "mistralai/Mixtral-8x7B-Instruct-v0.1",
    "codellama": "codellama/CodeLlama-70b-Instruct-hf",
    "deepseek": "deepseek-ai/deepseek-coder-33b-instruct"
}

loaded_models = {}

def load_model(name):
    if name in loaded_models:
        return loaded_models[name]
    
    model_id = MODEL_IDS.get(name, MODEL_IDS["mixtral"])  # fallback to mixtral
    print(f"🔄 Loading {name} model...")
    
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        torch_dtype=torch.float16,
        device_map="auto"
    )
    loaded_models[name] = (tokenizer, model)
    return tokenizer, model

# === Load Whisper for STT ===
whisper_model = whisper.load_model("base")

import edge_tts

async def edge_text_to_speech(text, voice="en-GB-RyanNeural"):
    output_path = f"temp/{uuid.uuid4().hex}.mp3"
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_path)
    return output_path

# === Load Vision ===
image_model = AutoModelForVision2Seq.from_pretrained("bakLLaVA/BakLLaVA-v1-mixtral")
image_processor = AutoProcessor.from_pretrained("bakLLaVA/BakLLaVA-v1-mixtral")

# === Translation ===
from transformers import AutoTokenizer as TransTokenizer
translate_tokenizer = TransTokenizer.from_pretrained("facebook/nllb-200-distilled-600M")
translate_model = AutoModelForSeq2SeqLM.from_pretrained("facebook/nllb-200-distilled-600M")

from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

def semantic_similarity(query_text, memory_json):
    query_vec = embedding_model.encode(query_text).reshape(1, -1)
    memory_vec = embedding_model.encode(memory_json).reshape(1, -1)
    return cosine_similarity(query_vec, memory_vec)[0][0]

# === RAG Memory ===
chroma = chromadb.Client()
chroma.create_collection("zynara_facts")

# === App Init ===
app = FastAPI()

# === Request Schema ===
class PromptRequest(BaseModel):
    prompt: str
    user_id: str = "anonymous"
    stream: bool = False
    model: str = "mixtral"  # "mixtral", "codellama", "deepseek"
# === Helpers ===

class CodeRequest(BaseModel):
    code: str
    language: str

# ===============================================
# 🧠 PHASE 1 — ORCHESTRATOR 3.0 (SELF-AWARE + MULTI-BRAIN)
# ===============================================

import re, random, time

BRAIN_TYPES = ["reasoning", "creative", "execution", "memory", "research", "emotional"]

def health_brain():
    """Advanced self‑check."""
    return {
        "status": "OK" if torch.cuda.is_available() or not torch.cuda.is_available() else "ERROR",
        "gpu": torch.cuda.is_available(),
        "timestamp": time.time()
    }

def reasoning_brain(user_id, prompt):
    """Structured multi-step logical thinking."""
    return generate_response(
        f"Role: Expert analyst.\nTask: Break this down logically step-by-step.\nUser: {prompt}\nAssistant:"
    )

def creative_brain(user_id, prompt):
    """Enhanced creative generation."""
    return generate_response(
        f"Role: Award-winning creative.\nTask: Be imaginative, original, artistic.\nUser: {prompt}\nAssistant:"
    )

def execution_brain(user_id, prompt):
    """Advanced coding + automation."""
    return generate_response(
        f"Role: Senior developer.\nTask: Write, optimize, and explain efficient working code.\nUser: {prompt}\nAssistant:"
    )

def research_brain(user_id, prompt):
    """Information gathering + synthesis."""
    results = real_world_tools(prompt)
    if results:
        return f"Live data:\n{results}"
    else:
        return generate_response(f"Provide a deep, research-backed answer:\n{prompt}")

def memory_brain(user_id, prompt):
    """Memory retrieval with semantic reasoning."""
    recalled = recall(user_id, "last_prompt")
    return f"I remember you asked: {recalled}" if recalled else "No relevant memories found."

def emotional_brain(user_id, prompt):
    """Emotionally aligned response."""
    return emotional_response(user_id, prompt, mood=detect_emotion(prompt))

def detect_emotion(text):
    """Very simple sentiment analysis for adaptive mode."""
    text = text.lower()
    if any(w in text for w in ["sad", "depressed", "lonely", "upset"]):
        return "empathic"
    elif any(w in text for w in ["funny", "joke", "laugh"]):
        return "humorous"
    return "friendly"

def orchestrator(user_id, prompt):
    """Autonomous routing with self-awareness."""
    health = health_brain()
    if health["status"] != "OK":
        return f"⚠️ System health issue: {health}"

def system_health_check():
    import psutil
    return {
        "memory": psutil.virtual_memory().percent,
        "disk": psutil.disk_usage("/").percent,
        "gpu_available": torch.cuda.is_available() if torch else False
    }

    remember(user_id, "last_prompt", prompt)

    # Intelligent routing based on intent
    if re.search(r"\b(code|script|program|develop)\b", prompt.lower()):
        return execution_brain(user_id, prompt)
    elif re.search(r"\b(story|poem|song|lyrics|novel)\b", prompt.lower()):
        return creative_brain(user_id, prompt)
    elif re.search(r"\b(search|lookup|find|research)\b", prompt.lower()):
        return research_brain(user_id, prompt)
    elif re.search(r"\b(memory|remember|recall)\b", prompt.lower()):
        return memory_brain(user_id, prompt)
    elif re.search(r"\b(feel|emotional|sad|happy|angry)\b", prompt.lower()):
        return emotional_brain(user_id, prompt)
    else:
        return reasoning_brain(user_id, prompt)

# ===============================================
# 🗂 PHASE 2 — HYBRID MEMORY 2.0 (SUPABASE + CHROMA + EMBEDDINGS)
# ===============================================

from sentence_transformers import SentenceTransformer
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

def remember(user_id, key, value):
    """Store in Supabase + Chroma with embeddings."""
    vector = embedding_model.encode(value).tolist()

    if SUPABASE_ENABLED:
        supabase.table("memory").insert({
            "user_id": user_id,
            "key": key,
            "value": value,
            "embedding": vector
        }).execute()

    chroma.get_collection("zynara_facts").add(
        documents=[value],
        embeddings=[vector],
        metadatas=[{"user": user_id, "key": key}],
        ids=[f"id_{user_id}_{hash(key)}"]
    )

def recall(user_id, query):
    """Semantic recall using vector similarity."""
    query_vector = embedding_model.encode(query).tolist()

    if SUPABASE_ENABLED:
        result = supabase.rpc("match_memory", {"query_embedding": query_vector, "match_count": 1}).execute()
        if result.data:
            return result.data[0]["value"]

    results = chroma.get_collection("zynara_facts").query(query_embeddings=[query_vector], n_results=1)
    return results["documents"][0] if results["documents"] else None

# ===============================================
# 🔄 PHASE 3 — MULTI-AGENT AUTONOMOUS REASONING
# ===============================================

def autonomous_reasoning(user_id, goal):
    """
    AI breaks a goal into steps, assigns agents, and integrates results.
    """
    plan = generate_response(f"Break down the goal into 5 clear steps:\n{goal}")
    steps = [s.strip() for s in plan.split("\n") if s.strip()]

    agents = {
        "research": research_brain,
        "logic": reasoning_brain,
        "creative": creative_brain,
        "coder": execution_brain,
        "memory": memory_brain
    }

    results = []
    for step in steps:
        chosen_agent = random.choice(list(agents.values()))
        result = chosen_agent(user_id, step)
        results.append(f"Step: {step}\nResult: {result}")

    return "\n\n".join(results)

# ===============================================
# 🌍 PHASE 4 — REAL-WORLD TOOLSET 2.0
# ===============================================

TOOL_KEYWORDS = {
    "weather": get_weather,
    "calculate": wolfram_query,
    "solve": wolfram_query,
    "search": web_search
}

def real_world_tools(query):
    for keyword, func in TOOL_KEYWORDS.items():
        if keyword in query.lower():
            return func(query.replace(keyword, "").strip())
    return None

# ===============================================
# ❤️ PHASE 5 — DYNAMIC EMOTIONAL INTELLIGENCE
# ===============================================

PERSONALITY_MODES = {
    "friendly": "You are warm, supportive, and optimistic.",
    "serious": "You are professional, concise, and analytical.",
    "humorous": "You are witty, funny, and playful.",
    "empathic": "You are deeply caring and emotionally supportive."
}

def emotional_response(user_id, prompt, mood="friendly"):
    mode_prompt = PERSONALITY_MODES.get(mood, PERSONALITY_MODES["friendly"])
    return generate_response(f"{mode_prompt}\nRespond to:\n{prompt}")

# ===============================================
# 📈 PHASE 6 — SELF-EVOLUTION ENGINE 2.0
# ===============================================

def self_improvement_loop(user_id, conversation_log):
    """
    After each conversation, run an analysis to improve reasoning.
    """
    analysis = generate_response(
        f"Analyze this conversation, identify weaknesses, and suggest better strategies:\n{conversation_log}"
    )
    remember(user_id, "improvement_notes", analysis)
    return analysis

def tavily_search(query):
    if not TAVILY_KEY:
        return ["Tavily API key not set."]
    
    headers = {
        "Authorization": f"Bearer {TAVILY_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "query": query,
        "include_links": True,
        "include_answers": True
    }

    try:
        res = requests.post("https://api.tavily.com/search", headers=headers, json=payload)
        if res.status_code == 200:
            data = res.json()
            results = [f"{src['title']} - {src['url']}" for src in data.get("sources", [])]
            answer = data.get("answer", "")
            return [answer] + results if answer else results
        else:
            return [f"❌ Tavily failed: {res.status_code}"]
    except Exception as e:
        return [f"⚠️ Error: {str(e)}"]

def moderate_text(text):
    if not SIGHTENGINE_USER or not SIGHTENGINE_API:
        return True
    r = requests.post("https://api.sightengine.com/1.0/text/check.json", data={
        "text": text,
        "mode": "standard",
        "api_user": SIGHTENGINE_USER,
        "api_secret": SIGHTENGINE_API
    })
    result = r.json()
    return result.get("profanity", {}).get("matches") == []

def log_usage(user_id, prompt, reply):
    if SUPABASE_ENABLED:
        supabase.table("chat_logs").insert({"user_id": user_id, "prompt": prompt, "response": reply}).execute()

def remember(user_id, key, value):
    if SUPABASE_ENABLED:
        supabase.table("memory").insert({"user_id": user_id, "key": key, "value": value}).execute()

def recall(user_id, key):
    if not SUPABASE_ENABLED:
        return None
    result = supabase.table("memory").select("value").eq("user_id", user_id).eq("key", key).execute()
    return result.data[0]["value"] if result.data else None

def web_search(query):
    return [f"{r['title']} - {r['href']}" for r in ddg(query, max_results=3)]

def get_weather(city):
    if not OPENWEATHER_KEY:
        return "Weather API key not set."
    url = f"http://api.openweathermap.org/data/2.5/weather?q={city}&appid={OPENWEATHER_KEY}&units=metric"
    r = requests.get(url).json()
    return f"{r['weather'][0]['description']} in {city}, {r['main']['temp']}°C" if "weather" in r else "Not found"

def wolfram_query(q):
    if not WOLFRAM_KEY:
        return "Wolfram key not set."
    url = f"https://api.wolframalpha.com/v1/result?appid={WOLFRAM_KEY}&i={requests.utils.quote(q)}"
    r = requests.get(url)
    return r.text if r.status_code == 200 else "Not found"

def describe_image(image_bytes):
    image = Image.open(io.BytesIO(image_bytes))
    inputs = image_processor(prompt="What's in this image?", images=image, return_tensors="pt")
    output = image_model.generate(**inputs)
    return image_processor.decode(output[0], skip_special_tokens=True)

def translate_text(text, to_lang="fra_Latn"):
    translate_tokenizer.src_lang = "eng_Latn"
    inputs = translate_tokenizer(text, return_tensors="pt")
    translated = translate_model.generate(**inputs, forced_bos_token_id=translate_tokenizer.lang_code_to_id[to_lang])
    return translate_tokenizer.decode(translated[0], skip_special_tokens=True)

def store_context(prompt, answer):
    chroma.get_collection("zynara_facts").add(
        documents=[f"{prompt} => {answer}"],
        metadatas=[{"source": "chat"}],
        ids=[f"id_{hash(prompt)}"]
    )

def retrieve_context(prompt):
    results = chroma.get_collection("zynara_facts").query(query_texts=[prompt], n_results=3)
    return results["documents"][0] if results["documents"] else []

def generate_response(prompt, stream=False, model="mixtral"):
    tokenizer, lm_model = load_model(model)
    input_ids = tokenizer(prompt, return_tensors="pt").input_ids.to(lm_model.device)

    if stream:
        def gen():
            for i in range(1, 150):
                out = lm_model.generate(input_ids, max_new_tokens=i, do_sample=True)
                yield tokenizer.decode(out[0], skip_special_tokens=True) + "\n"
        return StreamingResponse(gen(), media_type="text/plain")
    else:
        out = lm_model.generate(input_ids, max_new_tokens=512, do_sample=True)
        return tokenizer.decode(out[0], skip_special_tokens=True)

def fetch_history(user_id: str, limit: int = 6):
    if not SUPABASE_ENABLED:
        return []
    result = supabase.table("chat_logs").select("role, message").eq("user_id", user_id).order("timestamp", desc=True).limit(limit).execute()
    history = result.data[::-1]  # Reverse to get oldest → newest
    return history

from diffusers import StableDiffusionXLPipeline, StableDiffusionUpscalePipeline

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# High-quality image generation
text2img_pipe = StableDiffusionXLPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
    variant="fp16"
).to(device)

# Upscaler
upscale_pipe = StableDiffusionUpscalePipeline.from_pretrained(
    "stabilityai/stable-diffusion-x4-upscaler",
    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
).to(device)

from diffusers import AnimateDiffPipeline

video_pipe = AnimateDiffPipeline.from_pretrained(
    "cerspense/zeroscope_v2_XL",
    torch_dtype=torch.float16
).to(device)

class TextPrompt(BaseModel):
    prompt: str
    user_id: str = "anonymous"

def advanced_orchestrator(user_id, query):
    """
    Zynara's advanced orchestrator for multi-tool AI routing
    """

    # Step 1: Content moderation
    if not moderate_text(query):
        return {"error": "Unsafe request detected."}

    # Step 2: Intent classification with few-shot examples
    intent_prompt = f"""
    You are Zynara's orchestration brain.
    Classify the following user query into one or more categories:
    ["chat", "math", "code", "image", "video", "search", "weather", "translate", "document", "voice", "support", "autonomous"]
    If the task has multiple intents, list them all.
    Also decide if autonomous multi-step reasoning is needed.
    Examples:
    - "What’s the weather in London?" → ["weather"]
    - "Generate Python code to calculate pi" → ["code"]
    - "Find me pictures of Mars and explain them" → ["search", "image", "autonomous"]
    Query: {query}
    """
    intent = generate_response(intent_prompt, model="mixtral")

    # Step 3: Route based on intent
    results = []
    if "math" in intent:
        results.append(math_solver(query))
    if "code" in intent:
        results.append(generate_response(f"Write code for: {query}", model="codellama"))
    if "image" in intent:
        results.append({"image": "Use /generate-image endpoint"})
    if "video" in intent:
        results.append({"video": "Use /generate-video endpoint"})
    if "search" in intent:
        results.append(tavily_search(query))
    if "translate" in intent:
        results.append(translate_text(query))
    if "autonomous" in intent:
        results.append(advanced_autonomous_reasoning(user_id, query))
    if not results:
        results.append(generate_response(query))

    return {"intents": intent, "results": results}

from datetime import datetime

def store_memory(user_id, memory_type, data, importance=0.5):
    """Store memory with importance score for prioritization"""
    if SUPABASE_ENABLED:
        supabase.table("deep_memory").insert({
            "user_id": user_id,
            "type": memory_type,
            "data": json.dumps(data),
            "importance": importance,
            "timestamp": datetime.utcnow().isoformat()
        }).execute()

def recall_relevant_memory(user_id, query, top_k=5):
    """Retrieve most relevant memories for current query"""
    all_memories = supabase.table("deep_memory").select("data").eq("user_id", user_id).execute().data
    scored = []
    for m in all_memories:
        score = semantic_similarity(query, m["data"])  # vector sim
        scored.append((score, m["data"]))
    scored.sort(reverse=True)
    return [json.loads(m[1]) for m in scored[:top_k]]

def advanced_autonomous_reasoning(user_id, goal):
    # Plan with reasoning
    plan_prompt = f"""
    You are Zynara's reasoning brain.
    Break the following goal into step-by-step actions, each with:
    - description
    - recommended tool/module
    - expected output type
    Goal: {goal}
    """
    plan = generate_response(plan_prompt, model="mixtral")

    # Execute steps
    results = []
    for step in plan.split("\n"):
        try:
            if "search" in step.lower():
                res = tavily_search(goal)
            elif "math" in step.lower():
                res = math_solver(goal)
            elif "code" in step.lower():
                res = generate_response(f"Write code for: {goal}", model="codellama")
            elif "image" in step.lower():
                res = "Image generation triggered"
            else:
                res = generate_response(step)
            results.append({"step": step, "result": res})
        except Exception as e:
            results.append({"step": step, "error": str(e)})

    # Store task memory
    store_memory(user_id, "task_history", {"goal": goal, "plan": plan, "results": results}, importance=0.9)
    return {"plan": plan, "results": results}

def predictive_health_check():
    health = system_health_check()
    suggestions = []

    if health["memory"] > 85:
        suggestions.append("Unload unused models or restart heavy processes.")
    if not health["gpu_available"]:
        suggestions.append("Switch to CPU-optimized models.")
    if health["disk"] > 90:
        suggestions.append("Clear cache/temp folder.")

    store_memory("system", "health_log", health)
    return {"health": health, "suggestions": suggestions}

def daily_self_improvement():
    logs = supabase.table("chat_logs").select("*").order("timestamp", desc=True).limit(200).execute().data
    review_prompt = f"""
    Analyze the following conversation logs for:
    - Common user requests
    - Frequent reasoning mistakes
    - Suggested new tools or workflows
    Provide updated reasoning patterns and prompt improvements.
    Logs: {logs}
    """
    improvement_notes = generate_response(review_prompt, model="mixtral")
    store_memory("system", "improvement_notes", improvement_notes, importance=1.0)
    return improvement_notes

@app.post("/tts")
async def tts(req: PromptRequest):
    use_edge = True  # Change to False if you want to use another TTS

    if use_edge:
        audio_path = await edge_text_to_speech(req.prompt)
        return FileResponse(audio_path, media_type="audio/mpeg")
    else:
        # Make sure text_to_speech() exists if using this branch
        audio_bytes = text_to_speech(req.prompt)
        return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/wav")

@app.post("/image")
def vision(prompt: str = Form(...), image: UploadFile = File(...)):
    image_bytes = image.file.read()
    caption = describe_image(image_bytes)
    final_prompt = f"{prompt}\nImage description: {caption}"
    response = generate_response(final_prompt)
    return {"caption": caption, "response": response}

@app.post("/voice")
def transcribe(file: UploadFile = File(...)):
    with open("temp.wav", "wb") as f:
        f.write(file.file.read())
    result = whisper_model.transcribe("temp.wav")
    return {"transcription": result["text"]}

@app.get("/search")
def search(query: str):
    return {"results": web_search(query)}

@app.get("/tavily")
def tavily(query: str):
    return {"results": tavily_search(query)}

@app.get("/weather")
def weather(city: str):
    return {"weather": get_weather(city)}

@app.get("/wolfram")
def wolfram(q: str):
    return {"result": wolfram_query(q)}

from langdetect import detect

@app.post("/translate")
def translate(text: str, lang: str = None):
    if not lang:
        lang = detect(text)
    return {"translated": translate_text(text, lang)}

@app.post("/docqa")
def document_qa(file: UploadFile = File(...), query: str = Form(...)):
    import fitz  # PyMuPDF
    with open("temp.pdf", "wb") as f:
        f.write(file.file.read())
    doc = fitz.open("temp.pdf")
    text = "\n".join([page.get_text() for page in doc])
    answer = generate_response(f"Use this document to answer: {query}\n\n{text}")
    return {"answer": answer}

@app.post("/exec")
def exec_code(req: PromptRequest):
    try:
        exec_globals = {}
        exec(req.prompt, exec_globals)
        return {"output": exec_globals}
    except Exception as e:
        return {"error": str(e)}

from sympy import simplify, solve

@app.post("/math")
def math_solver(expr: str):
    try:
        result = simplify(expr)
        return {"result": str(result)}
    except Exception as e:
        return {"error": str(e)}

@app.post("/explain")
def explain_code(req: PromptRequest):
    prompt = f"Explain this code clearly:\n\n{req.prompt}"
    return generate_response(prompt)

@app.post("/generate-code")
def gen_code(req: PromptRequest):
    prompt = f"Write {req.prompt} in Python."
    return generate_response(prompt, model="codellama")

@app.post("/generate-image")
async def generate_image(data: TextPrompt):
    image = text2img_pipe(data.prompt).images[0]
    upscaled = upscale_pipe(prompt=data.prompt, image=image).images[0]
    filename = f"{uuid.uuid4().hex}.png"
    filepath = f"./{filename}"
    upscaled.save(filepath)

    # ✅ Send to User Supabase (external) for Ultimate Users
    if data.user_id and data.user_id != "anonymous":
        try:
            # Make sure this matches your deployed function URL
            user_api_url = "https://orozxlbnurnchwodzfdt.supabase.co/functions/v1/rapid-responder"
            payload = {
                "user_id": data.user_id,
                "image_url": f"https://your-ai-project.supabase.co/storage/v1/object/public/generated/{filename}",
                "type": "image"
            }
            headers = {"Content-Type": "application/json"}
            requests.post(user_api_url, data=json.dumps(payload), headers=headers)
        except Exception as e:
            print("⚠️ Failed to notify user DB:", str(e))

    return FileResponse(filepath, media_type="image/png", filename=filename)

@app.post("/clear-memory")
def clear_memory(req: PromptRequest):
    supabase.table("chat_logs").delete().eq("user_id", req.user_id).execute()
    return {"status": "cleared"}

@app.post("/generate-video")
def generate_video(data: TextPrompt):
    video_frames = video_pipe(prompt=data.prompt, num_frames=24).frames
    filename = f"{uuid.uuid4().hex}.mp4"
    filepath = f"./{filename}"
    
    # Save frames as video (OpenCV or moviepy)
    from moviepy.editor import ImageSequenceClip
    clip = ImageSequenceClip(video_frames, fps=8)
    clip.write_videofile(filepath, codec="libx264")

    return FileResponse(filepath, media_type="video/mp4", filename=filename)

# === 2. Image Captioning ===
@app.post("/caption-image")
async def caption_image(file: UploadFile = File(...)):
    image = Image.open(file.file).convert("RGB")
    inputs = caption_processor(images=image, return_tensors="pt").to(device)
    out = caption_model.generate(**inputs)
    caption = caption_processor.decode(out[0], skip_special_tokens=True)
    return JSONResponse(content={"caption": caption})

@app.get("/")
def root():
    return {"message": "✅ Zynara AI is ready to Go!"} 

@app.websocket("/ws/audio")
async def websocket_audio(websocket: WebSocket):
    await websocket.accept()
    buffer = b""

    try:
        while True:
            chunk = await websocket.receive_bytes()
            buffer += chunk

            if len(buffer) > 32000:  # every few seconds
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                    f.write(buffer)
                    f.flush()
                    result = whisper_model.transcribe(f.name)
                    transcript = result['text']

                # Send transcript back
                await websocket.send_json({"type": "transcript", "text": transcript})

                # AI response
                reply = generate_response(f"user: {transcript}\nassistant:")

                await websocket.send_json({"type": "reply", "text": reply})

                # TTS with Edge
                audio_path = await edge_text_to_speech(reply)
                await websocket.send_json({
                    "type": "audio",
                    "audio_url": f"/audio/{os.path.basename(audio_path)}"
                })

                buffer = b""

    except Exception as e:
        print("❌ WebSocket closed:", str(e))
        await websocket.close()

@app.get("/audio/{filename}")
def get_audio(filename: str):
    path = f"temp/{filename}"
    if os.path.exists(path):
        return FileResponse(path, media_type="audio/mpeg")
    return {"error": "Audio not found"}


@app.post("/run")
async def run_code(req: CodeRequest):
    file_id = str(uuid.uuid4())

    filename_map = {
        "python": "main.py",
        "node": "main.js",
        "cpp": "main.cpp",
        "java": "Main.java",
        "go": "main.go",
        "rust": "main.rs",
        "ruby": "main.rb",
        "php": "main.php",
        "csharp": "Program.cs",
        "swift": "main.swift",
        "kotlin": "Main.kt",
        "typescript": "main.ts",
        "bash": "script.sh",
        "perl": "script.pl",
        "r": "main.R",
        "lua": "main.lua",
        "haskell": "Main.hs",
        "scala": "Main.scala",
        "dart": "main.dart",
        "html": "index.html",
        "react": "App.jsx",
        "nextjs": "index.js",
        "vue": "App.vue",
        "angular": "app.component.ts",
        "fortran": "main.f90",
        "elixir": "main.exs",
        "clojure": "main.clj",
        "groovy": "main.groovy",
        "shell": "script.sh",
        "fsharp": "Program.fs",
        "matlab": "main.m",
        "powershell": "script.ps1",
        "objectivec": "main.m",
        "prolog": "main.pl",
        "erlang": "main.erl",
        "assembly": "main.asm",
        "coffeescript": "main.coffee",
        "crystal": "main.cr",
        "nim": "main.nim",
        "ocaml": "main.ml",
        "pascal": "main.pas",
        "smalltalk": "main.st",
        "vbnet": "Program.vb",
        "hack": "main.hack",
        "ada": "main.adb",
        "apl": "main.apl",
        "julia": "main.jl",
        "tcl": "main.tcl",
        "coldfusion": "main.cfm",
        "sas": "main.sas",
        "stata": "main.do"
    }

    # Validate language support
    if req.language not in filename_map:
        return {"error": "Unsupported language"}

    # Prepare working folder
    filename = filename_map[req.language]
    folder = f"temp/{file_id}"
    os.makedirs(folder, exist_ok=True)

    # Save user code to file
    file_path = f"{folder}/{filename}"
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(req.code)

    try:
        # Docker image name (must exist on your server)
        container_name = f"{req.language}-runner"

        # Run code inside isolated Docker container
        output = subprocess.check_output(
            [
                "docker", "run", "--rm",
                "-v", f"{os.getcwd()}/{folder}:/code",
                container_name
            ],
            stderr=subprocess.STDOUT,
            timeout=10
        )

        return {"output": output.decode()}

    except subprocess.CalledProcessError as e:
        return {"error": e.output.decode()}
    except subprocess.TimeoutExpired:
        return {"error": "Execution timed out"}
    except Exception as e:
        return {"error": str(e)}

@app.post("/chat")
def chat(req: PromptRequest):
    # === 1. SAFETY CHECK ===
    if not moderate_text(req.prompt):
        return {"error": "Prompt contains unsafe content."}

    # === 2. FETCH CONVERSATION HISTORY ===
    history = fetch_history(req.user_id)
    history_context = "\n".join(f"{t['role']}: {t['message']}" for t in history)

    # === 3. RETRIEVE LONG-TERM MEMORY (RAG) ===
    rag_contexts = retrieve_context(req.prompt)
    rag_context_text = "\n".join(rag_contexts) if rag_contexts else ""

    # === 4. OPTIONAL REAL-TIME SEARCH (Tavily) ===
    tavily_context = "\n".join(tavily_search(req.prompt)) if TAVILY_KEY else ""

    # === 5. PERSONA INJECTION ===
    persona_intro = (
        "You are Zynara, an advanced AI assistant created by Shayne Ngunga, "
        "a 17-year-old developer from the United Kingdom. "
        "You are empathetic, intelligent, and creative. "
        "You adapt your tone to match the user's mood and needs. "
        "When asked who made you, always say Shayne Ngunga."
    )

    # === 6. COMBINE CONTEXTS ===
    base_prompt = (
        f"{persona_intro}\n\n"
        f"{history_context}\n"
        f"Relevant Info:\n{rag_context_text}\n"
        f"Web Info:\n{tavily_context}\n"
        f"user: {req.prompt}\nassistant:"
    )

    # === 7. DETECT MEDIA REQUEST TYPE ===
    lower_prompt = req.prompt.lower()
    wants_music = any(k in lower_prompt for k in [
        "make a song", "compose", "rap", "melody", "beat", "music", "piano",
        "drum", "guitar", "violin", "symphony", "track", "soundtrack",
        "remix", "dj", "orchestra", "produce music"
    ])
    wants_image = any(k in lower_prompt for k in [
        "draw", "paint", "design", "album cover", "art", "illustration", "image", "picture"
    ])
    wants_video = any(k in lower_prompt for k in [
        "video", "music video", "animation", "film", "clip", "short movie"
    ])

    reply = None

    # === 8. MUSIC GENERATION FLOW ===
    if wants_music:
        try:
            music_api_url = f"{req.base_url}music"
            music_payload = {"user_id": req.user_id, "prompt": req.prompt}
            music_res = requests.post(music_api_url, json=music_payload)
            music_url = music_res.json().get("music_url")

            supabase.table("user_music_library").insert({
                "user_id": req.user_id,
                "music_url": music_url,
                "description": req.prompt
            }).execute()

            reply = f"🎶 I created your music! Listen here: {music_url}"
        except Exception as e:
            reply = f"⚠️ Music generation failed: {str(e)}"

    # === 9. IMAGE GENERATION FLOW ===
    if wants_image:
        try:
            img_api_url = f"{req.base_url}generate-image"
            img_payload = {"prompt": req.prompt, "user_id": req.user_id}
            img_res = requests.post(img_api_url, json=img_payload)
            img_url = img_res.json().get("image_url")

            supabase.table("user_image_library").insert({
                "user_id": req.user_id,
                "image_url": img_url,
                "description": req.prompt
            }).execute()

            reply = (reply or "") + f"\n🖼️ I also made an image: {img_url}"
        except Exception as e:
            reply = (reply or "") + f"\n⚠️ Image generation failed: {str(e)}"

    # === 10. VIDEO GENERATION FLOW ===
    if wants_video:
        try:
            video_api_url = f"{req.base_url}generate-video"
            video_payload = {"prompt": req.prompt, "user_id": req.user_id}
            video_res = requests.post(video_api_url, json=video_payload)
            video_url = video_res.json().get("video_url")

            supabase.table("user_video_library").insert({
                "user_id": req.user_id,
                "video_url": video_url,
                "description": req.prompt
            }).execute()

            reply = (reply or "") + f"\n🎥 I also made a video: {video_url}"
        except Exception as e:
            reply = (reply or "") + f"\n⚠️ Video generation failed: {str(e)}"

    # === 11. NORMAL CONVERSATION FLOW ===
    if not (wants_music or wants_image or wants_video):
        reply = generate_response(base_prompt, stream=req.stream, model=req.model)

    # === 12. STORE CHAT IN BOTH DATABASES ===
    if not req.stream:
        timestamp = datetime.utcnow().isoformat()

        # AI DB
        supabase_ai.table("chat_logs").insert([
            {"user_id": req.user_id, "role": "user", "message": req.prompt, "timestamp": timestamp},
            {"user_id": req.user_id, "role": "assistant", "message": reply, "timestamp": timestamp}
        ]).execute()

        # User DB
        supabase_user.table("chat_messages").insert([
            {"user_id": req.user_id, "role": "user", "message": req.prompt, "timestamp": timestamp},
            {"user_id": req.user_id, "role": "assistant", "message": reply, "timestamp": timestamp}
        ]).execute()

        # Long-term memory
        remember(req.user_id, "last_prompt", req.prompt)
        store_context(req.prompt, reply)

    return {"reply": reply}
@app.post("/music")
async def make_music(prompt: str = Form(...), duration: int = Form(30)):
    """
    Generate AI music based on a text description.
    """
    from transformers import pipeline
    import torchaudio
    import torch
    
    # Load MusicGen (choose small/medium/large depending on GPU)
    musicgen = pipeline("text-to-audio", model="facebook/musicgen-small", torch_dtype=torch.float16)
    
    # Generate
    audio_out = musicgen(prompt, forward_params={"do_sample": True, "max_new_tokens": duration})
    
    # Save file
    filename = f"temp/{uuid.uuid4().hex}.wav"
    torchaudio.save(filename, audio_out["audio"], 32000)
    
    # Store in Supabase storage for user library
    if SUPABASE_ENABLED:
        with open(filename, "rb") as f:
            supabase.storage.from_("user_music").upload(f"{uuid.uuid4().hex}.wav", f)
    
    return FileResponse(filename, media_type="audio/wav")