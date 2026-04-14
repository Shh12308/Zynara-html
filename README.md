# HeloxAi

Perfect — that explains everything 👍 You’re still at the web-only stage, so nothing “Capacitor-native” exists yet on your machine.

Let’s get you set up properly step-by-step.

⸻

🚀 Step 1 — Go into your project folder

Open terminal in your HTML project:

cd your-project-folder

This is the folder that contains your index.html.

⸻

📦 Step 2 — Install Capacitor

Run:

npm init -y
npm install @capacitor/core @capacitor/cli


⸻

⚙️ Step 3 — Initialize Capacitor

npx cap init

It will ask:
	•	App name → anything (e.g. HeloxAI)
	•	App ID → something like:

com.yourname.heloxai


⸻

🌐 Step 4 — Tell Capacitor where your HTML is

Edit (or create) capacitor.config.json:

{
  "appId": "com.yourname.heloxai",
  "appName": "HeloxAI",
  "webDir": ".",
  "bundledWebRuntime": false
}

👉 Important:
	•	"webDir": "." = your HTML folder (GitHub-style project)

⸻

🤖 Step 5 — Add Android platform

npx cap add android

👉 THIS is the step that creates:

android/app/src/main/AndroidManifest.xml


⸻

📱 Step 6 — Open Android Studio

npx cap open android

Now Android Studio opens your native app.

⸻

🎤 Step 7 — Add microphone permission

Go here:

android/app/src/main/AndroidManifest.xml

Add:

<uses-permission android:name="android.permission.RECORD_AUDIO" />


⸻

🔄 Step 8 — Sync changes

Every time you edit web code:

npx cap sync android


⸻

⚡ What you have now (important)

You now have 3 layers:

Layer	Purpose
HTML (your GitHub code)	UI + mic JS
Capacitor	Bridge to native
Android app	Permissions + hardware access


⸻

🎤 For your STT voice system

Your current mic code will work AS-IS:

navigator.mediaDevices.getUserMedia({ audio: true })

Capacitor will handle it once Android permission is added.

⸻

⚠️ Key point (very important)

Right now:

👉 You ONLY have a website
👉 After npx cap add android, it becomes a real mobile app

⸻

