import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

if (!window.__ENV__) {
  throw new Error("env.js not loaded");
}

const {
  FREE_AI_URL,
  PREMIUM_AI_URL,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  RECAPTCHA_SITE_KEY,
} = window.__ENV__;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Register Service Worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log(
          "ServiceWorker registration successful:",
          registration.scope,
        );
      })
      .catch((err) => {
        console.error("ServiceWorker registration failed:", err);
      });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements ---
  const body = document.body;
  const chatMessages = document.getElementById("chat-messages");
  const userInput = document.getElementById("user-input");
  const sendBtn = document.getElementById("send-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const newChatBtn = document.getElementById("new-chat-btn");
  const newFolderBtn = document.getElementById("new-folder-btn");
  const actionBtn = document.getElementById("action-btn");
  const actionSheet = document.getElementById("action-sheet");
  const overlay = document.getElementById("overlay");
  const micBtn = document.getElementById("mic-action");
  const voiceVisualizerContainer = document.getElementById(
    "voice-visualizer-container",
  );
  const voiceVisualizer = document.getElementById("voice-visualizer");
  const recordingTimer = document.getElementById("recording-timer");
  const stopRecordingBtn = document.getElementById("stop-recording-btn");
  const fileUploadInput = document.getElementById("file-upload-input");
  const fileUploadBtn = document.getElementById("file-upload-action");
  const uploadedFilesContainer = document.getElementById("uploaded-files");
  const hamburgerMenu = document.getElementById("hamburger-menu");
  const sidebar = document.getElementById("sidebar");
  const chatHistoryContainer = document.getElementById("chat-history");
  const imageGalleryContainer = document.getElementById("image-gallery");
  const welcomeScreen = document.getElementById("welcome-screen");
  const contextMenu = document.getElementById("context-menu");
  const chatContextMenu = document.getElementById("chat-context-menu");
  const editMessageBtn = document.getElementById("edit-message-btn");
  const copyMessageBtn = document.getElementById("copy-message-btn");
  const moveChatBtn = document.getElementById("move-chat-btn");
  const deleteChatBtnContext = document.getElementById(
    "delete-chat-btn-context",
  );
  const sidebarTabs = document.querySelectorAll(".sidebar-tab");
  const chatsContent = document.getElementById("chats-content");
  const galleryContent = document.getElementById("gallery-content");
  const themeSelector = document.getElementById("theme-selector");
  const themeOptions = document.getElementById("theme-options");
  const installPrompt = document.getElementById("install-prompt");
  const installButton = document.getElementById("install-button");

  // Share Modal Elements
  const shareModal = document.getElementById("share-modal");
  const shareCloseBtn = document.getElementById("share-close-btn");
  const shareLinkInput = document.getElementById("share-link-input");
  const shareCopyBtn = document.getElementById("share-copy-btn");
  const shareMethods = document.querySelectorAll(".share-method");

  // Auth Elements
  const loginBtn = document.getElementById("login-btn");
  const userProfile = document.getElementById("user-profile");
  const userAvatar = document.getElementById("user-avatar");
  const userName = document.getElementById("user-name");
  const userEmail = document.getElementById("user-email");
  const userPlan = document.getElementById("user-plan");
  const signOutBtn = document.getElementById("sign-out-btn");
  const closeSidebarBtn = document.getElementById("close-sidebar-btn");

  // New Chat Modal Elements
  const newChatModal = document.getElementById("new-chat-modal");
  const folderSelect = document.getElementById("folder-select");
  const cancelNewChatBtn = document.getElementById("cancel-new-chat");
  const confirmNewChatBtn = document.getElementById("confirm-new-chat");

  // --- State ---
  let deferredPrompt;
  let mediaRecorder;
  let audioContext;
  let analyser;
  let microphone;
  let currentResponseController = null;
  let isGeneratingResponse = false;
  let lastUserPrompt = null;
  let animationId;
  let currentChatId = null;
  let chatToMoveId = null;
  let folders = {
    unfiled: { name: "Unfiled", chats: {} },
  };
  let imageGallery = [];
  let messageIdCounter = 0;
  let messagePairToEdit = null;
  let messagePairToShare = null;
  let expandedFolderId = null;
  let longPressTimer;
  let isLongPress = false;
  let longPressTarget = null;
  let recordingStartTime;
  let recordingInterval;
  let uploadedFiles = [];
  let voiceBars = [];
  let abortController = null;
  let isStreaming = false;
  let currentUser = null;
  let userPlanType = "free"; // Default to free plan
  let isFirstMessage = true; // Track if it's the first message

  // Anonymous user limits
  const ANON_LIMIT = 99050;
  let anonMessageCount = parseInt(
    localStorage.getItem("anonMessageCount") || "0",
  );

  const themes = [
    { id: "light", name: "Light", preview: "#f8f9fa" },
    { id: "dark", name: "Dark", preview: "#1a1d23" },
    {
      id: "system",
      name: "System",
      preview: "linear-gradient(to right, #f8f9fa 50%, #1a1d23 50%)",
    },
    { id: "gold", name: "Gold", preview: "#fffdf7" },
    { id: "diamond", name: "Diamond", preview: "#f8fbff" },
    { id: "neon", name: "Neon", preview: "#0a0a0a" },
    { id: "cyberpunk", name: "Cyberpunk", preview: "#0d0221" },
    { id: "vintage", name: "Vintage", preview: "#f4e8d0" },
    { id: "ocean", name: "Ocean", preview: "#e6f3ff" },
    { id: "sunset", name: "Sunset", preview: "#fff5e6" },
    { id: "forest", name: "Forest", preview: "#e8f5e9" },
    { id: "galaxy", name: "Galaxy", preview: "#0a0e27" },
    { id: "rose", name: "Rose", preview: "#fff0f5" },
  ];

  // API URLs
  const FREE_API_ENDPOINT =
    FREE_AI_URL ||
    "https://billy-free-ai-production.up.railway.app/ask/universal";
  const PREMIUM_API_ENDPOINT =
    PREMIUM_AI_URL ||
    "https://zynara-ai-production.up.railway.app/ask/universal";
  const STT_URL = "https://zynara-ai-production.up.railway.app/stt";
  const STOP_URL = "https://zynara-ai-production.up.railway.app/stop";

  // --- Authentication Functions ---
  const checkAuthState = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      currentUser = session.user;
      await getUserPlan();
      showUserProfile(session.user);
      loadUserChats();
    } else {
      showLoginButton();
    }
  };

  const getUserPlan = async () => {
    if (!currentUser) {
      userPlanType = "free";
      return "free";
    }

    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("plan")
        .eq("user_id", currentUser.id)
        .single();

      if (error) {
        console.error("Error fetching user plan:", error);
        userPlanType = "free";
        return "free";
      }

      userPlanType = data.plan || "free";
      return userPlanType;
    } catch (err) {
      console.error("Error in getUserPlan:", err);
      userPlanType = "free";
      return "free";
    }
  };

  const showLoginButton = () => {
    loginBtn.style.display = "flex";
    userProfile.style.display = "none";
  };

  const hideLoginButton = () => {
    loginBtn.style.display = "none";
  };

  const showUserProfile = (user) => {
    userProfile.style.display = "flex";
    userAvatar.textContent = user.email.charAt(0).toUpperCase();
    userName.textContent =
      user.user_metadata?.full_name || user.email.split("@")[0];
    userEmail.textContent = user.email;

    // Update plan display
    const planDisplay =
      userPlanType.charAt(0).toUpperCase() + userPlanType.slice(1);
    userPlan.textContent = planDisplay + " Plan";

    // Add visual indicator for premium plans
    if (userPlanType === "premium" || userPlanType === "lifetime") {
      userPlan.classList.add("premium-plan");
    } else {
      userPlan.classList.remove("premium-plan");
    }
  };

  const hideUserProfile = () => {
    userProfile.style.display = "none";
  };

  const signIn = () => {
    // Redirect to login.html for authentication
    window.location.href = "login.html";
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error signing out:", error);
    } else {
      currentUser = null;
      userPlanType = "free";
      hideUserProfile();
      showLoginButton();
      clearChat();
    }
  };

  // --- Anonymous User Functions ---
  const incrementAnonCount = () => {
    anonMessageCount++;
    localStorage.setItem("anonMessageCount", anonMessageCount.toString());
  };

  const resetAnonCount = () => {
    anonMessageCount = 0;
    localStorage.setItem("anonMessageCount", "0");
  };

  // --- Supabase Storage Functions ---
  const uploadToSupabase = async (file, folder = "chat-media") => {
    if (!currentUser) {
      showToast("Please sign in to upload files");
      return null;
    }

    const fileExt = file.name.split(".").pop();
    const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from(folder)
      .upload(fileName, file);

    if (error) {
      console.error("Error uploading file:", error);
      showToast("Failed to upload file");
      return null;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(folder).getPublicUrl(fileName);

    return publicUrl;
  };

  const downloadFromSupabase = async (url, filename) => {
    try {
      // Extract file path from URL
      const urlObj = new URL(url);
      const filePath = urlObj.pathname.split("/").pop();

      const { data, error } = await supabase.storage
        .from("chat-media")
        .download(filePath);

      if (error) {
        console.error("Error downloading file:", error);
        throw error;
      }

      // Create blob and download
      const blob = new Blob([data]);
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      showToast("File downloaded successfully!");
    } catch (error) {
      console.error("Error downloading file:", error);
      showToast("Failed to download file");
    }
  };

  /* ===============================
       USER CHAT PERSISTENCE (SAFE)
    ================================= */

  let saveTimeout = null;

  /**
   * Debounced save to Supabase
   * - Prevents excessive writes
   * - Safe to call frequently
   */
  const saveUserChats = () => {
    if (!currentUser) return;

    // Debounce saves (2s after last change)
    clearTimeout(saveTimeout);

    saveTimeout = setTimeout(async () => {
      try {
        const { error } = await supabase.from("user_chats").upsert(
          {
            user_id: currentUser.id,
            folders: folders,
            image_gallery: imageGallery,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );

        if (error) {
          console.error("Error saving chats:", error);
        }
      } catch (err) {
        console.error("Unexpected save error:", err);
      }
    }, 2000);
  };

  /**
   * Load chats from Supabase
   * - Safe defaults
   * - Handles empty rows
   */
  const loadUserChats = async () => {
    if (!currentUser) return;

    try {
      const { data, error } = await supabase
        .from("user_chats")
        .select("folders, image_gallery")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (error) {
        console.error("Error loading chats:", error);
        return;
      }

      // Safe defaults
      folders = data?.folders ?? {
        unfiled: { name: "Unfiled", chats: {} },
      };

      imageGallery = Array.isArray(data?.image_gallery)
        data.image_gallery
        : [];

      displayFoldersAndChats();
      displayImageGallery();
    } catch (err) {
      console.error("Unexpected load error:", err);
    }
  };

  // --- PWA Install Prompt ---
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installPrompt.classList.add("visible");
  });

  installButton.addEventListener("click", async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      console.log("User accepted install prompt");
    } else {
      console.log("User dismissed install prompt");
    }

    deferredPrompt = null;
    installPrompt.classList.remove("visible");
  });

  // --- Functions ---
  /* ===============================
       MARKDOWN RENDER CORE
    ================================= */

  const renderMarkdown = (raw, container) => {
    container.innerHTML = marked.parse(raw, {
      gfm: true,
      breaks: true,
    });
  };

  /* ===============================
       CODE BLOCK ENHANCER
    ================================= */

  const enhanceCodeBlocks = (container) => {
    container.querySelectorAll("pre > code").forEach((code) => {
      const lang = code.className.replace("language-", "") || "plaintext";

      const codeText = code.textContent;

      const wrapper = document.createElement("div");
      wrapper.className = "code-section";

      createCodeBlock({ lang, code: codeText }, wrapper);

      code.parentElement.replaceWith(wrapper);
    });
  };

  /* ===============================
       MAIN MESSAGE RENDERER
    ================================= */

  const renderMessageContent = (content, messageElement) => {
    // Handle string content with markdown and code blocks
    if (typeof content === "string") {
      // Extract all code blocks and replace them with placeholders
      const codeBlocks = [];
      let processedContent = content;

      // Create a unique identifier for each code block
      let codeBlockIdCounter = 0;

      // Extract all code blocks with triple backticks
      const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
      let match;
      while ((match = codeBlockRegex.exec(content)) !== null) {
        const lang = match[1] || "plaintext";
        const code = match[2];
        const id = `code-${codeBlockIdCounter++}`;

        codeBlocks.push({ id, lang, code });
        processedContent = processedContent.replace(
          match[0],
          `__CODE_BLOCK_${id}__`,
        );
      }

      // Extract code blocks with section headers and equals signs
      const sectionHeaderEqualsRegex =
        /\*\*([^*]+)\*\*\s*={4,}\s*```(\w+)?\n([\s\S]*?)```/g;
      while (
        (match = sectionHeaderEqualsRegex.exec(processedContent)) !== null
      ) {
        const title = match[1];
        const lang = match[2] || "plaintext";
        const code = match[3];
        const id = `code-${codeBlockIdCounter++}`;

        codeBlocks.push({ id, title, lang, code });
        processedContent = processedContent.replace(
          match[0],
          `__CODE_BLOCK_${id}__`,
        );
      }

      // Extract code blocks with section headers and dashes
      const sectionHeaderDashRegex =
        /\*\*([^*]+)\*\*\s*-{4,}\s*```(\w+)?\n([\s\S]*?)```/g;
      while ((match = sectionHeaderDashRegex.exec(processedContent)) !== null) {
        const title = match[1];
        const lang = match[2] || "plaintext";
        const code = match[3];
        const id = `code-${codeBlockIdCounter++}`;

        codeBlocks.push({ id, title, lang, code });
        processedContent = processedContent.replace(
          match[0],
          `__CODE_BLOCK_${id}__`,
        );
      }

      // Parse the content with marked
      messageElement.innerHTML = marked.parse(processedContent, {
        gfm: true,
        breaks: true,
      });

      // Replace placeholders with actual code blocks
      codeBlocks.forEach((block) => {
        const placeholder = `__CODE_BLOCK_${block.id}__`;

        // Find and replace the placeholder
        const elements = Array.from(messageElement.childNodes);
        for (let i = 0; i < elements.length; i++) {
          const element = elements[i];
          if (
            element.nodeType === Node.TEXT_NODE &&
            element.textContent.includes(placeholder)
          ) {
            // Create a new element to replace the text node
            const wrapper = document.createElement("div");
            wrapper.innerHTML = element.textContent.replace(placeholder, "");

            // Insert the wrapper before the text node
            element.parentNode.insertBefore(wrapper, element);

            // Create and insert the code block
            createCodeBlock(block, messageElement);

            // Remove the original text node
            element.parentNode.removeChild(element);
            break;
          } else if (
            element.innerHTML &&
            element.innerHTML.includes(placeholder)
          ) {
            element.innerHTML = element.innerHTML.replace(placeholder, "");
            createCodeBlock(block, element);
            break;
          }
        }
      });

      // Handle inline code
      messageElement.innerHTML = messageElement.innerHTML.replace(
        /`([^`]+)`/g,
        '<code class="inline-code">$1</code>',
      );

      // Style inline code
      messageElement.querySelectorAll(".inline-code").forEach((code) => {
        code.style.backgroundColor = "rgba(175, 184, 193, 0.2)";
        code.style.padding = "0.2em 0.4em";
        code.style.borderRadius = "3px";
        code.style.fontFamily = "monospace";
      });
      return;
    }

    // STRUCTURED CONTENT
    if (!content || typeof content !== "object") return;

    switch (content.type) {
      case "image":
        handleImageContent(content, messageElement);
        break;
      case "video":
        handleVideoContent(content, messageElement);
        break;
      case "audio":
        handleAudioContent(content, messageElement);
        break;
      case "code":
        handleCodeContent(content, messageElement);
        break;
      case "search_result":
        handleSearchResultContent(content, messageElement);
        break;
      case "code_result":
        handleCodeResultContent(content, messageElement);
        break;
    }
  };

  /* ===============================
       CODE BLOCK UI
    ================================= */

  const createCodeBlock = (block, parentElement) => {
    const codeBlockElement = document.createElement("div");
    codeBlockElement.className = "code-section";

    // Add title if present
    if (block.title) {
      const titleElement = document.createElement("h3");
      titleElement.textContent = block.title;
      titleElement.style.marginTop = "0";
      titleElement.style.marginBottom = "1rem";
      titleElement.style.color = "var(--primary-color)";
      codeBlockElement.appendChild(titleElement);
    }

    // Create code block
    const codeBlockInner = document.createElement("div");
    codeBlockInner.className = "code-block";
    codeBlockInner.setAttribute("data-lang", block.lang || "plaintext");

    // Create code header
    const codeHeader = document.createElement("div");
    codeHeader.className = "code-header";

    const languageLabel = document.createElement("div");
    languageLabel.className = "code-language";

    // Add language icon
    const languageIcon = document.createElement("div");
    languageIcon.className = "code-language-icon";

    // Set icon color based on language
    const languageColors = {
      javascript: "#f7df1e",
      python: "#3776ab",
      html: "#e34c26",
      css: "#1572b6",
      json: "#000000",
      react: "#61dafb",
      plaintext: "#555555",
    };

    languageIcon.style.backgroundColor =
      languageColors[block.lang] || languageColors["plaintext"];

    const languageText = document.createElement("span");
    languageText.textContent = (block.lang || "plaintext").toUpperCase();

    languageLabel.appendChild(languageIcon);
    languageLabel.appendChild(languageText);

    const codeActions = document.createElement("div");
    codeActions.className = "code-actions";

    // Copy button
    const copyBtn = document.createElement("button");
    copyBtn.className = "code-action-btn copy-code-btn";
    copyBtn.innerHTML =
      '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
    copyBtn.title = "Copy Code";
    copyBtn.addEventListener("click", () => {
      const code = codeBlockInner.querySelector("code").textContent;
      navigator.clipboard
        .writeText(code)
        .then(() => {
          showToast("Code copied to clipboard!");
        })
        .catch((err) => {
          console.error("Failed to copy code: ", err);
        });
    });

    codeActions.appendChild(copyBtn);

    // Preview button for supported languages
    if (
      block.lang === "html" ||
      block.lang === "javascript" ||
      block.lang === "css" ||
      block.lang === "react"
    ) {
      const previewBtn = document.createElement("button");
      previewBtn.className = "code-action-btn preview-code-btn";
      previewBtn.innerHTML =
        '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5.99 11.99 5 11.99s-2.24 5-5 5-5-2.24-5-5-5 2.24-5 5 5zm0-8c-1.66 0-3 1.34-3 3s1.34-3 3-3 1.34-3 3-3zm0-8c1.66 0 3 1.34 3 3s-1.34 3-3 3-1.34-3-3-3z"/></svg>';
      previewBtn.title = "Preview Code";
      previewBtn.addEventListener("click", () => {
        const code = codeBlockInner.querySelector("code").textContent;
        const lang = block.lang;
        showCodePreview(code, lang);
      });

      codeActions.appendChild(previewBtn);
    }

    codeHeader.appendChild(languageLabel);
    codeHeader.appendChild(codeActions);

    // Create code content area
    const codeContent = document.createElement("div");
    codeContent.className = "code-content";

    const preElement = document.createElement("pre");
    const codeElement = document.createElement("code");
    codeElement.className = `language-${block.lang || "plaintext"}`;
    codeElement.textContent = block.code;

    preElement.appendChild(codeElement);
    codeContent.appendChild(preElement);

    // Assemble code block
    codeBlockInner.appendChild(codeHeader);
    codeBlockInner.appendChild(codeContent);

    codeBlockElement.appendChild(codeBlockInner);

    // Add to parent element
    parentElement.appendChild(codeBlockElement);

    // Highlight code
    const codeElementToHighlight = codeBlockElement.querySelector("code");
    if (codeElementToHighlight) {
      hljs.highlightElement(codeElementToHighlight);
    }

    // Style the code section
    codeBlockElement.style.marginBottom = "1.5rem";
    codeBlockElement.style.border = "1px solid var(--border-color)";
    codeBlockElement.style.borderRadius = "8px";
    codeBlockElement.style.padding = "1rem";
    codeBlockElement.style.backgroundColor = "var(--code-bg)";
  };

  /* ===============================
       IMAGE (GALLERY SAFE)
    ================================= */

  const handleImageContent = (content, messageElement) => {
    const mediaContainer = document.createElement("div");
    mediaContainer.className = "media-container";

    const img = document.createElement("img");
    img.src = content.url;
    img.alt = "Generated Image";
    img.loading = "lazy";

    // Handle broken images (404s)
    img.onerror = () => {
      console.warn("Failed to load image, removing from view:", content.url);
      mediaContainer.remove();
      const index = imageGallery.indexOf(content.url);
      if (index > -1) {
        imageGallery.splice(index, 1);
        saveUserChats();
        displayImageGallery();
      }
    };

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "media-download-btn";
    downloadBtn.innerHTML =
      '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
    downloadBtn.title = "Download Image";
    downloadBtn.addEventListener("click", () =>
      downloadFromSupabase(content.url, "image.png"),
    );

    mediaContainer.appendChild(img);
    mediaContainer.appendChild(downloadBtn);
    messageElement.appendChild(mediaContainer);
  };

  /* ===============================
       VIDEO
    ================================= */

  const handleVideoContent = (content, messageElement) => {
    const mediaContainer = document.createElement("div");
    mediaContainer.className = "media-container";

    const video = document.createElement("video");
    video.controls = true;
    video.autoplay = false;
    const source = document.createElement("source");
    source.src = content.url;
    source.type = "video/mp4";

    // Handle broken videos
    source.onerror = () => {
      mediaContainer.remove();
      const index = imageGallery.indexOf(content.url);
      if (index > -1) {
        /* handle removal */
      }
    };

    video.appendChild(source);

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "media-download-btn";
    downloadBtn.innerHTML =
      '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
    downloadBtn.title = "Download Video";
    downloadBtn.addEventListener("click", () =>
      downloadFromSupabase(content.url, "video.mp4"),
    );

    mediaContainer.appendChild(video);
    mediaContainer.appendChild(downloadBtn);
    messageElement.appendChild(mediaContainer);
  };

  /* ===============================
       AUDIO + VISUALIZER
    ================================= */

  const handleAudioContent = (content, messageElement) => {
    const mediaContainer = document.createElement("div");
    mediaContainer.className = "media-container";

    const audio = document.createElement("audio");
    audio.controls = true;
    const source = document.createElement("source");
    source.src = content.url;
    source.type = "audio/mpeg";
    audio.appendChild(source);

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "media-download-btn";
    downloadBtn.innerHTML =
      '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
    downloadBtn.title = "Download Audio";
    downloadBtn.addEventListener("click", () =>
      downloadFromSupabase(content.url, "audio.mp3"),
    );

    mediaContainer.appendChild(audio);
    mediaContainer.appendChild(downloadBtn);
    messageElement.appendChild(mediaContainer);
  };

  const handleCodeContent = (content, messageElement) => {
    const lang = content.language || "plaintext";

    // Create code block object for reuse
    const codeBlock = {
      id: `code-${Date.now()}`,
      lang: lang,
      code: content.code,
    };

    // Use the helper function to create the code block
    createCodeBlock(codeBlock, messageElement);
  };

  const handleSearchResultContent = (content, messageElement) => {
    const container = document.createElement("div");
    container.className = "search-result-container";
    const title = document.createElement("strong");
    title.textContent = "Web Search Results:";
    container.appendChild(title);

    if (Array.isArray(content.data)) {
      content.data.forEach((result) => {
        const item = document.createElement("div");
        item.className = "search-item";

        const link = document.createElement("a");
        link.href = result.url || result.link || "#";
        link.target = "_blank";
        link.className = "search-title";
        link.textContent = result.title || "Untitled";

        const snippet = document.createElement("span");
        snippet.className = "search-snippet";
        snippet.textContent =
          result.body || result.snippet || "No description.";

        item.appendChild(link);
        item.appendChild(snippet);
        container.appendChild(item);
      });
    } else {
      const fallback = document.createElement("div");
      fallback.textContent = JSON.stringify(content.data);
      container.appendChild(fallback);
    }
    messageElement.appendChild(container);
  };

  const handleCodeResultContent = (content, messageElement) => {
    const container = document.createElement("div");
    container.className = "code-execution-output";
    if (content.data && content.data.stderr) {
      container.classList.add("code-execution-error");
      container.textContent = content.data.stderr || content.data;
    } else {
      container.textContent =
        content.data.stdout ||
        content.data.output ||
        JSON.stringify(content.data);
    }
    messageElement.appendChild(container);
  };

  const showCodePreview = (code, language) => {
    const previewModal = document.createElement("div");
    previewModal.className = "code-preview-modal";

    const previewHeader = document.createElement("div");
    previewHeader.className = "code-preview-header";

    const previewTitle = document.createElement("div");
    previewTitle.className = "code-preview-title";
    previewTitle.textContent = `${language.toUpperCase()} Preview`;

    const closeBtn = document.createElement("button");
    closeBtn.className = "close-preview-btn";
    closeBtn.innerHTML =
      '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    closeBtn.addEventListener("click", () => {
      document.body.removeChild(previewModal);
    });

    previewHeader.appendChild(previewTitle);
    previewHeader.appendChild(closeBtn);

    const previewContent = document.createElement("div");
    previewContent.className = "code-preview-content";

    if (language === "html" || language === "react") {
      const iframe = document.createElement("iframe");
      iframe.className = "code-preview-iframe";

      // For React, wrap in a simple HTML structure
      if (language === "react") {
        const reactCode = `
                <!DOCTYPE html>
                <html>
                <head>
                    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
                    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
                    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
                </head>
                <body>
                    <div id="root"></div>
                    <script type="text/babel">
                        ${code}
                    </script>
                </body>
                </html>
                `;
        iframe.srcdoc = reactCode;
      } else {
        iframe.srcdoc = code;
      }

      previewContent.appendChild(iframe);
    } else {
      // For non-HTML code, just show it in a formatted block
      const preElement = document.createElement("pre");
      preElement.className = "code-preview-code";

      const codeElement = document.createElement("code");
      codeElement.className = `language-${language}`;
      codeElement.textContent = code;

      preElement.appendChild(codeElement);
      previewContent.appendChild(preElement);

      // Highlight code
      hljs.highlightElement(codeElement);
    }

    previewModal.appendChild(previewHeader);
    previewModal.appendChild(previewContent);

    // Add event listener to close when clicking outside
    previewModal.addEventListener("click", (e) => {
      if (e.target === previewModal) {
        document.body.removeChild(previewModal);
      }
    });

    document.body.appendChild(previewModal);
  };

  /* ===============================
       TOAST
    ================================= */

  const showToast = (msg) => {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  };

  // --- File Upload Functions ---
  const handleFileUpload = async (files) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      uploadedFiles.push(file);
      displayUploadedFile(file);
    }
  };

  const displayUploadedFile = (file) => {
    const fileElement = document.createElement("div");
    fileElement.className = "uploaded-file";

    const fileName = document.createElement("span");
    fileName.className = "uploaded-file-name";
    fileName.textContent = file.name;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-file-btn";
    removeBtn.innerHTML =
      '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    removeBtn.addEventListener("click", () => {
      removeUploadedFile(file, fileElement);
    });

    fileElement.appendChild(fileName);
    fileElement.appendChild(removeBtn);
    uploadedFilesContainer.appendChild(fileElement);
  };

  const removeUploadedFile = (file, fileElement) => {
    const index = uploadedFiles.indexOf(file);
    if (index > -1) {
      uploadedFiles.splice(index, 1);
    }
    uploadedFilesContainer.removeChild(fileElement);
  };

  const clearUploadedFiles = () => {
    uploadedFiles = [];
    uploadedFilesContainer.innerHTML = "";
  };

  // --- Voice Recording Functions ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      const audioChunks = [];

      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      microphone = audioContext.createMediaStreamSource(stream);
      microphone.connect(analyser);
      analyser.fftSize = 256;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // Show visualizer
      voiceVisualizerContainer.classList.add("active");
      recordingStartTime = Date.now();

      // Update timer
      recordingInterval = setInterval(updateRecordingTimer, 1000);

      // Animate voice bars
      const animateBars = () => {
        animationId = requestAnimationFrame(animateBars);
        analyser.getByteFrequencyData(dataArray);

        // Update bars based on frequency data
        for (let i = 0; i < voiceBars.length; i++) {
          const dataIndex = Math.floor((i * bufferLength) / voiceBars.length);
          const value = dataArray[dataIndex];
          const height = Math.max(4, (value / 255) * 60);
          voiceBars[i].style.height = `${height}px`;
        }
      };
      animateBars();

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

        try {
          const formData = new FormData();
          formData.append("file", audioBlob, "recording.webm");

          const response = await fetch(STT_URL, {
            method: "POST",
            body: formData,
          });
          if (!response.ok)
            throw new Error(`STT Error: ${response.statusText}`);
          const data = await response.json();
          const transcription = data.transcription;

          if (transcription) {
            handleSendMessage(transcription);
          } else {
            addMessageToChat("bot", "Sorry, I could not understand the audio.");
          }
        } catch (error) {
          console.error("STT Error:", error);
          addMessageToChat(
            "bot",
            `An error occurred during transcription: ${error.message}`,
          );
        }
      };

      mediaRecorder.start();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      showToast("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());

      // Hide visualizer
      voiceVisualizerContainer.classList.remove("active");

      // Clear timer
      clearInterval(recordingInterval);
      recordingTimer.textContent = "00:00";

      // Stop animation
      cancelAnimationFrame(animationId);

      // Reset bars
      voiceBars.forEach((bar) => {
        bar.style.height = "4px";
      });

      // Clean up audio context
      if (microphone) microphone.disconnect();
      if (audioContext) audioContext.close();
    }
  };

  const updateRecordingTimer = () => {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    recordingTimer.textContent = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const addMessageToChat = (sender, content, messageId = null) => {
    const messagePair = document.createElement("div");
    messagePair.className = "message-pair";
    messagePair.dataset.messageId = messageId || `msg-${messageIdCounter++}`;

    const messageElement = document.createElement("div");
    messageElement.classList.add("message", `${sender}-message`);
    const messageContent = document.createElement("div");
    messageContent.className = "message-content";

    // Add message options
    const messageOptions = document.createElement("div");
    messageOptions.className = "message-options";

    if (sender === "bot") {
      // Add regenerate option for bot messages
      const regenerateBtn = document.createElement("button");
      regenerateBtn.className = "message-option-btn";
      regenerateBtn.title = "Regenerate Response";
      regenerateBtn.innerHTML =
        '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
      regenerateBtn.addEventListener("click", () =>
        regenerateResponse(messagePair),
      );

      // Add copy option for bot messages
      const copyBtn = document.createElement("button");
      copyBtn.className = "message-option-btn";
      copyBtn.title = "Copy Message";
      copyBtn.innerHTML =
        '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
      copyBtn.addEventListener("click", () => copyMessage(messagePair));

      // Add share option for bot messages
      const shareBtn = document.createElement("button");
      shareBtn.className = "message-option-btn";
      shareBtn.title = "Share Message";
      shareBtn.innerHTML =
        '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3c-.79 0-1.5-.31-2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92z"/></svg>';
      shareBtn.addEventListener("click", () => shareMessage(messagePair));

      messageOptions.appendChild(regenerateBtn);
      messageOptions.appendChild(copyBtn);
      messageOptions.appendChild(shareBtn);
    } else {
      // Add copy option for user messages
      const copyBtn = document.createElement("button");
      copyBtn.className = "message-option-btn";
      copyBtn.title = "Copy Message";
      copyBtn.innerHTML =
        '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
      copyBtn.addEventListener("click", () => copyMessage(messagePair));

      // Add edit option for user messages
      const editBtn = document.createElement("button");
      editBtn.className = "message-option-btn";
      editBtn.title = "Edit Message";
      editBtn.innerHTML =
        '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
      editBtn.addEventListener("click", () => editMessage(messagePair));

      messageOptions.appendChild(copyBtn);
      messageOptions.appendChild(editBtn);
    }

    messageElement.appendChild(messageContent);
    messageElement.appendChild(messageOptions);
    messagePair.appendChild(messageElement);

    renderMessageContent(content, messageContent);
    chatMessages.appendChild(messagePair);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return messagePair;
  };

  // Function to create thinking dots animation
  const createThinkingDots = () => {
    const dotsContainer = document.createElement("div");
    dotsContainer.className = "thinking-dots";

    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dotsContainer.appendChild(dot);
    }

    return dotsContainer;
  };

  // Function to create status indicator
  const createStatusIndicator = (status) => {
    const statusContainer = document.createElement("div");
    statusContainer.className = "status-indicator";

    const statusIcon = document.createElement("div");
    statusIcon.className = "status-icon";

    const statusText = document.createElement("div");
    statusText.className = "status-text";
    statusText.textContent = status;

    statusContainer.appendChild(statusIcon);
    statusContainer.appendChild(statusText);

    return statusContainer;
  };

  // Function to create progress indicator for media generation
  const createProgressIndicator = (messageElement, type) => {
    const progressContainer = document.createElement("div");
    progressContainer.className = "progress-container";

    const progressBar = document.createElement("div");
    progressBar.className = "progress-bar";

    const progressText = document.createElement("div");
    progressText.className = "progress-text";
    progressText.textContent = `Generating ${type}... 0%`;

    progressContainer.appendChild(progressBar);
    progressContainer.appendChild(progressText);

    messageElement.appendChild(progressContainer);

    // Animate progress
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 95) progress = 95;

      progressBar.style.width = `${progress}%`;
      progressText.textContent = `Generating ${type}... ${Math.floor(progress)}%`;

      if (progress >= 95) {
        clearInterval(progressInterval);

        // Add loading spinner after progress completes
        setTimeout(() => {
          progressContainer.remove();

          const loadingContainer = document.createElement("div");
          loadingContainer.style.display = "flex";
          loadingContainer.style.alignItems = "center";
          loadingContainer.style.justifyContent = "center";
          loadingContainer.style.padding = "1rem";

          const loadingText = document.createElement("span");
          loadingText.textContent = `Finalizing ${type}...`;

          const spinner = document.createElement("div");
          spinner.className = "loading-spinner";

          loadingContainer.appendChild(loadingText);
          loadingContainer.appendChild(spinner);
          messageElement.appendChild(loadingContainer);
        }, 500);
      }
    }, 200);

    return progressContainer;
  };

  // Function to toggle send/pause buttons
  const toggleSendPauseButtons = (showPause) => {
    if (showPause) {
      sendBtn.classList.add("hidden");
      pauseBtn.classList.add("visible");
    } else {
      sendBtn.classList.remove("hidden");
      pauseBtn.classList.remove("visible");
    }
  };

  const stopResponseGeneration = async () => {
    if (currentResponseController) {
      currentResponseController.abort();
      currentResponseController = null;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      // Call the stop endpoint
      const stopResponse = await fetch(STOP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
      });

      if (!stopResponse.ok) {
        console.warn(
          "Failed to stop generation on backend:",
          stopResponse.statusText,
        );
      }
    } catch (e) {
      console.warn("Backend stop failed:", e);
    }

    isGeneratingResponse = false;
    toggleSendPauseButtons(false);

    // Remove any status indicators
    document.querySelectorAll(".status-indicator").forEach((el) => el.remove());

    // Remove any progress indicators
    document
      .querySelectorAll(".progress-container")
      .forEach((el) => el.remove());

    // Remove any loading spinners
    document.querySelectorAll(".loading-spinner").forEach((el) => {
      if (el.parentElement) {
        el.parentElement.remove();
      }
    });
  };

  // Function to regenerate a response
  const regenerateResponse = async (messagePair) => {
    // Find the user message that prompted this response
    let userMessage = null;
    let prevElement = messagePair.previousElementSibling;

    while (prevElement) {
      if (prevElement.classList.contains("message-pair")) {
        const userMsgElement = prevElement.querySelector(".user-message");
        if (userMsgElement) {
          userMessage =
            userMsgElement.querySelector(".message-content").textContent;
          break;
        }
      }
      prevElement = prevElement.previousElementSibling;
    }

    if (!userMessage) {
      showToast("Could not find the original message to regenerate.");
      return;
    }

    // Remove the current bot message
    messagePair.remove();

    // Generate a new response
    handleSendMessage(userMessage);
  };

  // Function to copy a message
  const copyMessage = async (messagePair) => {
    const messageContent = messagePair.querySelector(".message-content");
    const textToCopy = messageContent.textContent;

    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast("Message copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy message: ", err);
      showToast("Failed to copy message");
    }
  };

  // Function to share a message
  const shareMessage = (messagePair) => {
    messagePairToShare = messagePair;
    const messageContent =
      messagePair.querySelector(".message-content").textContent;

    // Generate a shareable link (in a real app, this would be a unique URL)
    const shareUrl = `${window.location.origin}/shared/${messagePair.dataset.messageId}`;
    shareLinkInput.value = shareUrl;

    // Show the share modal
    shareModal.style.display = "flex";
  };

  // Function to edit a user message
  const editMessage = async (messagePair) => {
    const messageElement = messagePair.querySelector(".user-message");
    const messageContent = messagePair.querySelector(".message-content");
    const originalText = messageContent.textContent;

    const textarea = document.createElement("textarea");
    textarea.className = "edit-textarea";
    textarea.value = originalText;

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.className = "preview-btn";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "preview-btn";
    cancelBtn.style.background = "var(--sidebar-hover-bg)";

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "edit-actions";
    actionsDiv.appendChild(cancelBtn);
    actionsDiv.appendChild(saveBtn);

    messageContent.replaceWith(textarea);
    messageElement.appendChild(actionsDiv);

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const saveEdit = () => {
      const newText = textarea.value.trim();
      if (newText && newText !== originalText) {
        // Remove all subsequent messages
        let nextElement = messagePair.nextElementSibling;
        while (nextElement) {
          const nextPair = nextElement;
          nextElement = nextPair.nextElementSibling;
          nextPair.remove();
        }

        // Update the user message in the chat history
        const userMsgHistory = folders["unfiled"].chats[
          currentChatId
        ].messages.find((m) => m.id === messagePair.dataset.messageId);
        if (userMsgHistory) {
          userMsgHistory.text = newText;
        }

        // Remove all messages after this one from the history
        const messageIndex = folders["unfiled"].chats[
          currentChatId
        ].messages.findIndex((m) => m.id === messagePair.dataset.messageId);
        if (messageIndex !== -1) {
          folders["unfiled"].chats[currentChatId].messages = folders[
            "unfiled"
          ].chats[currentChatId].messages.slice(0, messageIndex + 1);
        }

        saveUserChats();

        // Replace textarea with new content
        const newContent = document.createElement("div");
        newContent.className = "message-content";
        newContent.textContent = newText;
        textarea.replaceWith(newContent);
        actionsDiv.remove();

        // Send the new message
        handleSendMessage(newText);
      } else {
        // Revert to original content
        const revertContent = document.createElement("div");
        revertContent.className = "message-content";
        revertContent.textContent = originalText;
        textarea.replaceWith(revertContent);
        actionsDiv.remove();
      }
    };

    saveBtn.addEventListener("click", saveEdit);
    cancelBtn.addEventListener("click", () => {
      const revertContent = document.createElement("div");
      revertContent.className = "message-content";
      revertContent.textContent = originalText;
      textarea.replaceWith(revertContent);
      actionsDiv.remove();
    });
  };

  const handleSendMessage = async (messageText = null) => {
    const message = messageText || userInput.value.trim();
    if (!message) return;

    // Check if user is authenticated
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Handle anonymous user limit
    if (!session) {
      if (anonMessageCount >= ANON_LIMIT) {
        showToast(
          `You've reached the limit of ${ANON_LIMIT} messages. Sign in to continue chatting.`,
        );
        setTimeout(() => {
          window.location.href = "login.html";
        }, 1500);
        return;
      }
      incrementAnonCount();
    }

    // Fade out the welcome screen if it's the first message
    if (isFirstMessage && welcomeScreen) {
      welcomeScreen.classList.add("fade-out");
      setTimeout(() => {
        welcomeScreen.style.display = "none";
      }, 500);
      isFirstMessage = false;
    }

    // Create a new chat if needed
    if (!currentChatId) {
      currentChatId = Date.now().toString();
      folders.unfiled.chats[currentChatId] = {
        title: message.substring(0, 30) + "...",
        messages: [],
      };
    }

    // Handle file uploads to Supabase
    if (uploadedFiles.length > 0) {
      const uploadedUrls = [];
      for (const file of uploadedFiles) {
        const url = await uploadToSupabase(file);
        if (url) {
          uploadedUrls.push({
            name: file.name,
            size: file.size,
            type: file.type,
            url: url,
          });
        }
      }

      if (uploadedUrls.length > 0) {
        const fileContent = {
          type: "files",
          files: uploadedUrls,
        };
        addMessageToChat("user", fileContent);
        folders["unfiled"].chats[currentChatId].messages.push({
          id: `msg-${messageIdCounter++}`,
          sender: "user",
          text: `Uploaded ${uploadedUrls.length} file(s)`,
        });
      }
      clearUploadedFiles();
    }

    // Add text message to UI
    const userMessagePair = addMessageToChat("user", message);
    folders.unfiled.chats[currentChatId].messages.push({
      id: userMessagePair.dataset.messageId,
      sender: "user",
      text: message,
    });

    saveUserChats();

    userInput.value = "";
    userInput.style.height = "22px";

    // Create bot message placeholder with thinking dots
    const botMessagePair = addMessageToChat("bot", "");
    const botMessageContent = botMessagePair.querySelector(".message-content");
    botMessageContent.appendChild(createThinkingDots());

    folders.unfiled.chats[currentChatId].messages.push({
      id: botMessagePair.dataset.messageId,
      sender: "bot",
      text: "Thinking...",
    });
    saveUserChats();

    // Show pause button and hide send button
    isGeneratingResponse = true;
    toggleSendPauseButtons(true);

    try {
      // Determine which API endpoint to use based on user plan
      const API_ENDPOINT =
        userPlanType === "premium" || userPlanType === "lifetime"
          ? PREMIUM_API_ENDPOINT
          : FREE_API_ENDPOINT
);

      // Create an AbortController to allow stopping the request
      currentResponseController = new AbortController();

      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Cache-Control": "no-cache",
          ...(session
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        cache: "no-store",
        body: JSON.stringify({
          prompt: message,
          stream: true,
          user_id: currentUser?.id || "anonymous",
        }),
        signal: currentResponseController.signal,
      });

      if (!response.ok) {
        // Provide specific error feedback
        if (response.status === 400) {
          throw new Error(
            "Bad Request: The server requires a text prompt and could not process request.",
          );
        }
        throw new Error(`API Error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      botMessageContent.innerHTML = "";

      let buffer = "";
      let fullText = "";
      let currentStatus = null;
      let statusElement = null;
      let progressElement = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process SSE events
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          // Skip empty lines or non-data events
          if (!rawEvent.startsWith("data:")) continue;

          const jsonStr = rawEvent.slice(5).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          let data;
          try {
            data = JSON.parse(jsonStr);
          } catch (e) {
            console.error("Error parsing SSE data:", e);
            continue;
          }

          // Handle different event types
          if (data.type === "starting") {
            continue;
          }

          // STATUS EVENTS - Show status like "Generating image", "Searching online"
          if (data.type === "status") {
            // Remove previous status if exists
            if (statusElement) {
              statusElement.remove();
            }

            // Create new status indicator
            statusElement = createStatusIndicator(data.status);
            botMessageContent.appendChild(statusElement);
            currentStatus = data.status;

            // If this is a media generation status, add a progress bar
            if (
              data.status &&
              (data.status.toLowerCase().includes("image") ||
                data.status.toLowerCase().includes("video"))
            ) {
              const mediaType = data.status.toLowerCase().includes("image")
                ? "image"
                : "video";
              progressElement = createProgressIndicator(
                botMessageContent,
                mediaType,
              );
            }
            continue;
          }

          // TOKEN STREAM
          if (data.type === "token" && data.text) {
            // Remove status indicator if we're now getting actual content
            if (statusElement) {
              statusElement.remove();
              statusElement = null;
            }

            // Remove progress indicator if we're now getting actual content
            if (progressElement) {
              progressElement.remove();
              progressElement = null;
            }

            fullText += data.text;
            botMessageContent.textContent = fullText;

            // Save live text
            const msgObj = folders["unfiled"].chats[
              currentChatId
            ].messages.find((m) => m.id === botMessagePair.dataset.messageId);

            if (msgObj) msgObj.text = fullText;
          }

          // IMAGE
          if (data.type === "image" && data.url) {
            // Remove status indicator if we're now getting actual content
            if (statusElement) {
              statusElement.remove();
              statusElement = null;
            }

            // Remove progress indicator if we're now getting actual content
            if (progressElement) {
              progressElement.remove();
              progressElement = null;
            }

            renderMessageContent(
              { type: "image", url: data.url },
              botMessageContent,
            );

            // Add to image gallery
            if (!imageGallery.includes(data.url)) {
              imageGallery.push(data.url);
              saveUserChats();
              displayImageGallery();
            }
          }

          // VIDEO
          if (data.type === "video" && data.url) {
            // Remove status indicator if we're now getting actual content
            if (statusElement) {
              statusElement.remove();
              statusElement = null;
            }

            // Remove progress indicator if we're now getting actual content
            if (progressElement) {
              progressElement.remove();
              progressElement = null;
            }

            renderMessageContent(
              { type: "video", url: data.url },
              botMessageContent,
            );
          }

          // SEARCH RESULTS
          if (data.type === "tool" && data.tool === "web_search") {
            // Remove status indicator if we're now getting actual content
            if (statusElement) {
              statusElement.remove();
              statusElement = null;
            }

            // Remove progress indicator if we're now getting actual content
            if (progressElement) {
              progressElement.remove();
              progressElement = null;
            }

            renderMessageContent(
              {
                type: "search_result",
                data: data.result,
              },
              botMessageContent,
            );
          }

          // CODE EXECUTION RESULTS
          if (data.type === "tool" && data.tool === "run_code") {
            // Remove status indicator if we're now getting actual content
            if (statusElement) {
              statusElement.remove();
              statusElement = null;
            }

            // Remove progress indicator if we're now getting actual content
            if (progressElement) {
              progressElement.remove();
              progressElement = null;
            }

            renderMessageContent(
              {
                type: "code_result",
                data: data.result,
              },
              botMessageContent,
            );
          }

          // DONE
          if (data.type === "done") {
            saveUserChats();
            return;
          }
        }
      }
    } catch (error) {
      // If the request was aborted, don't show an error message
      if (error.name === "AbortError") {
        console.log("Request was aborted");
        return;
      }

      console.error("Error:", error);
      const botMessageContent =
        botMessagePair.querySelector(".message-content");
      renderMessageContent(
        `An error occurred: ${error.message}. Please try again.`,
        botMessageContent,
      );
      folders["unfiled"].chats[currentChatId].messages.find(
        (m) => m.id === botMessagePair.dataset.messageId,
      ).text = `Error: ${error.message}`;
      saveUserChats();
    } finally {
      // Reset state when response is complete or aborted
      isGeneratingResponse = false;
      currentResponseController = null;
      toggleSendPauseButtons(false);

      // Remove any status indicators
      document
        .querySelectorAll(".status-indicator")
        .forEach((el) => el.remove());

      // Remove any progress indicators
      document
        .querySelectorAll(".progress-container")
        .forEach((el) => el.remove());

      // Remove any loading spinners
      document.querySelectorAll(".loading-spinner").forEach((el) => {
        if (el.parentElement) {
          el.parentElement.remove();
        }
      });
    }
  };

  const clearChat = () => {
    chatMessages.innerHTML = "";
    currentChatId = null;
    messageIdCounter = 0;
    if (welcomeScreen) {
      welcomeScreen.classList.remove("hidden");
      welcomeScreen.classList.remove("fade-out");
      welcomeScreen.style.display = "flex";
      isFirstMessage = true;
    }
  };

  const setTheme = (themeId) => {
    if (themeId === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      body.setAttribute("data-theme", prefersDark ? "dark" : "light");
    } else {
      body.setAttribute("data-theme", themeId);
    }
    localStorage.setItem("theme", themeId);

    // Update active theme in UI
    document.querySelectorAll(".theme-option").forEach((option) => {
      option.classList.remove("active");
      if (option.dataset.theme === themeId) {
        option.classList.add("active");
      }
    });
  };

  const loadTheme = () => {
    const savedTheme = localStorage.getItem("theme") || "light";
    setTheme(savedTheme);
  };

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      if (localStorage.getItem("theme") === "system") {
        setTheme("system");
      }
    });

  const initializeThemeSelector = () => {
    themeOptions.innerHTML = "";

    themes.forEach((theme) => {
      const themeOption = document.createElement("div");
      themeOption.className = "theme-option";
      themeOption.dataset.theme = theme.id;

      const themePreview = document.createElement("div");
      themePreview.className = "theme-preview";
      themePreview.style.background = theme.preview;

      const themeName = document.createElement("span");
      themeName.textContent = theme.name;

      themeOption.appendChild(themePreview);
      themeOption.appendChild(themeName);

      themeOption.addEventListener("click", () => {
        setTheme(theme.id);
      });

      themeOptions.appendChild(themeOption);
    });

    // Set initial active theme
    const savedTheme = localStorage.getItem("theme") || "light";
    document
      .querySelector(`.theme-option[data-theme="${savedTheme}"]`)
      ?.classList.add("active");
  };

  const showActionSheet = () => {
    actionSheet.classList.add("visible");
    overlay.classList.add("visible");
  };

  const hideActionSheet = () => {
    actionSheet.classList.remove("visible");
    overlay.classList.remove("visible");
  };

  // --- Folder & Chat Management ---
  const displayFoldersAndChats = () => {
    chatHistoryContainer.innerHTML = "";
    for (const folderId in folders) {
      const folder = folders[folderId];
      const folderEl = document.createElement("div");
      folderEl.className = "folder";
      folderEl.dataset.folderId = folderId;

      if (folderId === expandedFolderId) {
        folderEl.classList.add("expanded");
      }

      const folderHeader = document.createElement("div");
      folderHeader.className = "folder-header";
      folderHeader.innerHTML = `
                <span class="folder-name">${folder.name}</span>
                <svg class="svg-icon" style="transform: rotate(-90deg); transition: transform 0.3s;" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5-5-5-5z"/></svg>
            `;
      folderEl.appendChild(folderHeader);

      // Add long press handler for folder
      folderHeader.addEventListener("mousedown", (e) => {
        if (e.button === 0) {
          // Left click only
          longPressTarget = { type: "folder", id: folderId, name: folder.name };
          longPressTimer = setTimeout(() => {
            isLongPress = true;
            folderHeader.classList.add("long-press");
            showDeleteDialog("folder", folderId, folder.name);
          }, 500);
        }
      });

      folderHeader.addEventListener("mouseup", () => {
        clearTimeout(longPressTimer);
        setTimeout(() => {
          folderHeader.classList.remove("long-press");
        }, 100);
      });

      folderHeader.addEventListener("mouseleave", () => {
        clearTimeout(longPressTimer);
        folderHeader.classList.remove("long-press");
      });

      folderHeader.addEventListener("click", (e) => {
        if (!isLongPress) {
          folderEl.classList.toggle("expanded");
          const arrow = folderHeader.querySelector(".svg-icon");
          arrow.style.transform = folderEl.classList.contains("expanded")
            ? "rotate(0deg)"
            : "rotate(-90deg)";

          if (folderEl.classList.contains("expanded")) {
            expandedFolderId = folderId;
          } else {
            expandedFolderId = null;
          }
        }
        isLongPress = false;
      });

      // Touch events for mobile
      folderHeader.addEventListener("touchstart", (e) => {
        longPressTarget = { type: "folder", id: folderId, name: folder.name };
        longPressTimer = setTimeout(() => {
          isLongPress = true;
          folderHeader.classList.add("long-press");
          showDeleteDialog("folder", folderId, folder.name);
        }, 500);
      });

      folderHeader.addEventListener("touchend", () => {
        clearTimeout(longPressTimer);
        setTimeout(() => {
          folderHeader.classList.remove("long-press");
        }, 100);
      });

      folderHeader.addEventListener("touchmove", () => {
        clearTimeout(longPressTimer);
        folderHeader.classList.remove("long-press");
      });

      const chatsContainer = document.createElement("div");
      chatsContainer.className = "folder-chats";

      for (const chatId in folder.chats) {
        const chat = folder.chats[chatId];
        const chatItem = document.createElement("div");
        chatItem.className = "chat-history-item";
        chatItem.dataset.chatId = chatId;
        chatItem.textContent = chat.title;
        if (chatId === currentChatId) {
          chatItem.classList.add("active");
        }

        // Add long press handler for chat
        chatItem.addEventListener("mousedown", (e) => {
          if (e.button === 0) {
            // Left click only
            longPressTarget = { type: "chat", id: chatId, name: chat.title };
            longPressTimer = setTimeout(() => {
              isLongPress = true;
              chatItem.classList.add("long-press");
              showDeleteDialog("chat", chatId, chat.title);
            }, 500);
          }
        });

        chatItem.addEventListener("mouseup", () => {
          clearTimeout(longPressTimer);
          setTimeout(() => {
            chatItem.classList.remove("long-press");
          }, 100);
        });

        chatItem.addEventListener("mouseleave", () => {
          clearTimeout(longPressTimer);
          chatItem.classList.remove("long-press");
        });

        chatItem.addEventListener("click", (e) => {
          if (!isLongPress) {
            loadChat(chatId);
          }
          isLongPress = false;
        });

        // Touch events for mobile
        chatItem.addEventListener("touchstart", (e) => {
          longPressTarget = { type: "chat", id: chatId, name: chat.title };
          longPressTimer = setTimeout(() => {
            isLongPress = true;
            chatItem.classList.add("long-press");
            showDeleteDialog("chat", chatId, chat.title);
          }, 500);
        });

        chatItem.addEventListener("touchend", () => {
          clearTimeout(longPressTimer);
          setTimeout(() => {
            chatItem.classList.remove("long-press");
          }, 100);
        });

        chatItem.addEventListener("touchmove", () => {
          clearTimeout(longPressTimer);
          chatItem.classList.remove("long-press");
        });

        chatItem.addEventListener("contextmenu", (e) =>
          showChatContextMenu(e, chatId),
        );
        chatsContainer.appendChild(chatItem);
      }
      folderEl.appendChild(chatsContainer);
      chatHistoryContainer.appendChild(folderEl);
    }
  };

  const showDeleteDialog = (type, id, name) => {
    const overlay = document.createElement("div");
    overlay.className = "delete-overlay";

    const dialog = document.createElement("div");
    dialog.className = "delete-dialog";

    const isFolder = type === "folder";
    const message = isFolder
      ? `Are you sure you want to delete folder "${name}" and all its chats? This action cannot be undone.`
      : `Are you sure you want to delete this chat? This action cannot be undone.`;

    dialog.innerHTML = `
            <h3>Delete ${isFolder ? "Folder" : "Chat"}</h3>
            <p>${message}</p>
            <div class="delete-dialog-buttons">
                <button class="cancel-delete">Cancel</button>
                <button class="confirm-delete">Delete</button>
            </div>
        `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const cancelBtn = dialog.querySelector(".cancel-delete");
    const confirmBtn = dialog.querySelector(".confirm-delete");

    const closeDialog = () => {
      document.body.removeChild(overlay);
    };

    cancelBtn.addEventListener("click", closeDialog);

    confirmBtn.addEventListener("click", () => {
      if (isFolder) {
        deleteFolder(id);
      } else {
        deleteChat(id);
      }
      closeDialog();
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        closeDialog();
      }
    });
  };

  const deleteFolder = (folderId) => {
    if (folderId === "unfiled") {
      alert("Cannot delete Unfiled folder.");
      return;
    }

    // Move all chats from this folder to unfiled
    const folderToDelete = folders[folderId];
    if (folderToDelete && folderToDelete.chats) {
      for (const chatId in folderToDelete.chats) {
       folders.unfiled.chats[chatId] = folderToDelete.chats[chatId];
      }
    }

    delete folders[folderId];
    saveUserChats();
    displayFoldersAndChats();

    // Clear current chat if it was in deleted folder
    if (currentChatId && folders["unfiled"].chats[currentChatId]) {
      // Chat moved to unfiled, no need to clear
    } else if (currentChatId) {
      clearChat();
    }
  };

  const createFolder = () => {
    const folderName = prompt("Enter folder name:");
    if (folderName) {
      const folderId = "folder_" + Date.now();
      folders[folderId] = { name: folderName, chats: {} };
      saveUserChats();
      displayFoldersAndChats();
    }
  };

  const loadChat = (chatId) => {
    clearChat();
    currentChatId = chatId;
    let chat = null;
    for (const folderId in folders) {
      if (folders[folderId].chats[chatId]) {
        chat = folders[folderId].chats[chatId];
        break;
      }
    }
    if (chat) {
      chat.messages.forEach((msg) => {
        addMessageToChat(msg.sender, msg.text, msg.id);
      });
      displayFoldersAndChats();
    }
  };

  const deleteChat = (chatId) => {
    for (const folderId in folders) {
      if (folders[folderId].chats[chatId]) {
        delete folders[folderId].chats[chatId];
        saveUserChats();
        if (currentChatId === chatId) {
          clearChat();
        }
        displayFoldersAndChats();
        break;
      }
    }
  };

  const moveChatToFolder = (chatId, targetFolderId) => {
    let chatToMove = null;
    let sourceFolderId = null;

    for (const folderId in folders) {
      if (folders[folderId].chats[chatId]) {
        chatToMove = folders[folderId].chats[chatId];
        sourceFolderId = folderId;
        delete folders[folderId].chats[chatId];
        break;
      }
    }

    if (chatToMove && targetFolderId) {
      folders[targetFolderId].chats[chatId] = chatToMove;
      saveUserChats();
      displayFoldersAndChats();
    }
  };

  const showChatContextMenu = (e, chatId) => {
    e.preventDefault();
    chatToMoveId = chatId;
    const rect = e.target.getBoundingClientRect();
    chatContextMenu.style.top = `${rect.bottom + window.scrollY}px`;
    chatContextMenu.style.left = `${rect.left + window.scrollX}px`;
    chatContextMenu.classList.add("visible");
  };

  const hideChatContextMenu = () => {
    chatContextMenu.classList.remove("visible");
  };

  // --- New Chat in Folder Functions ---
  const showNewChatModal = () => {
    // Populate folder select with current folders
    folderSelect.innerHTML = "";
    for (const folderId in folders) {
      const folder = folders[folderId];
      const option = document.createElement("option");
      option.value = folderId;
      option.textContent = folder.name;
      folderSelect.appendChild(option);
    }

    // Show modal
    newChatModal.style.display = "flex";
    overlay.classList.add("visible");
  };

  const hideNewChatModal = () => {
    newChatModal.style.display = "none";
    overlay.classList.remove("visible");
  };

  const startNewChatInFolder = (folderId) => {
    // Create new chat in the specified folder
    const message = userInput.value.trim() || "New chat";
    const chatId = Date.now().toString();

    // Add chat to the specified folder
    if (!folders[folderId]) {
      folders[folderId] = { name: `Folder ${folderId}`, chats: {} };
    }

    folders[folderId].chats[chatId] = {
      title: message.substring(0, 30) + "...",
      messages: [],
    };

    // Set as current chat and clear display
    currentChatId = chatId;
    clearChat();

    // Save and update display
    saveUserChats();
    displayFoldersAndChats();

    // If there's a message, send it
    if (message && message !== "New chat") {
      handleSendMessage(message);
    }

    // Clear input
    userInput.value = "";
  };

  // --- Image Gallery Management ---
  const displayImageGallery = () => {
    imageGalleryContainer.innerHTML = "";
    imageGallery.forEach((url) => {
      const imgContainer = document.createElement("div");
      imgContainer.className = "media-container";
      imgContainer.style.position = "relative";

      const img = document.createElement("img");
      img.src = url;
      img.alt = "Generated Image";
      img.loading = "lazy";
      img.onclick = () => window.open(url, "_blank");

      // Add error handling for gallery items
      img.onerror = () => {
        console.warn("Gallery image failed to load, removing:", url);
        imgContainer.remove();
        // Remove from array permanently to stop loop
        const index = imageGallery.indexOf(url);
        if (index > -1) {
          imageGallery.splice(index, 1);
          saveUserChats();
          displayImageGallery();
        }
      };

      const downloadBtn = document.createElement("button");
      downloadBtn.className = "media-download-btn";
      downloadBtn.innerHTML =
        '<svg class="svg-icon" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
      downloadBtn.title = "Download Image";
      downloadBtn.addEventListener("click", () =>
        downloadFromSupabase(url, "image.png"),
      );

      imgContainer.appendChild(img);
      imgContainer.appendChild(downloadBtn);
      imageGalleryContainer.appendChild(imgContainer);
    });
  };

  // --- Message Interaction (Edit/Copy) ---
  const showContextMenu = (e, messagePair) => {
    e.preventDefault();
    e.stopPropagation();
    messagePairToEdit = messagePair;
    const rect = e.target.getBoundingClientRect();
    contextMenu.style.top = `${rect.bottom + window.scrollY}px`;
    contextMenu.style.left = `${rect.left + window.scrollX}px`;
    contextMenu.classList.add("visible");
  };

  const hideContextMenu = () => {
    contextMenu.classList.remove("visible");
  };

  // --- Event Listeners ---
  // Auth event listeners
  loginBtn.addEventListener("click", signIn);
  signOutBtn.addEventListener("click", signOut);

  // Listen for auth state changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN") {
      currentUser = session.user;
      resetAnonCount(); // Reset anonymous message count when user signs in
      await getUserPlan(); // Get user plan
      hideLoginButton();
      showUserProfile(session.user);
      loadUserChats();
    } else if (event === "SIGNED_OUT") {
      currentUser = null;
      userPlanType = "free";
      hideUserProfile();
      showLoginButton();
      clearChat();
    }
  });

  sendBtn.addEventListener("click", () => handleSendMessage());
  pauseBtn.addEventListener("click", () => stopResponseGeneration());
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  userInput.addEventListener("input", () => {
    userInput.style.height = "auto";
    userInput.style.height = userInput.scrollHeight + "px";
  });

  // File upload event listeners
  fileUploadBtn.addEventListener("click", () => {
    fileUploadInput.click();
  });

  fileUploadInput.addEventListener("change", (e) => {
    handleFileUpload(e.target.files);
  });

  // Drag and drop file upload
  document.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  });

  // Voice recording event listeners
  micBtn.addEventListener("mousedown", startRecording);
  stopRecordingBtn.addEventListener("click", stopRecording);

  micBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startRecording();
  });

  micBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    stopRecording();
  });

  micBtn.addEventListener("mouseleave", stopRecording);

  // New Chat Button - Show folder selection modal
  newChatBtn.addEventListener("click", showNewChatModal);

  // New Chat Modal Event Listeners
  cancelNewChatBtn.addEventListener("click", hideNewChatModal);

  confirmNewChatBtn.addEventListener("click", () => {
    const selectedFolderId = folderSelect.value;
    startNewChatInFolder(selectedFolderId);
    hideNewChatModal();
  });

  // Close modal when clicking outside
  newChatModal.addEventListener("click", (e) => {
    if (e.target === newChatModal) {
      hideNewChatModal();
    }
  });

  newFolderBtn.addEventListener("click", createFolder);

  actionBtn.addEventListener("click", showActionSheet);
  overlay.addEventListener("click", () => {
    hideActionSheet();
    hideContextMenu();
    hideChatContextMenu();
    hideNewChatModal();
    shareModal.style.display = "none";
    sidebar.classList.remove("visible");
  });

  const actionSheetItems = document.querySelectorAll(
    "#action-sheet li[data-prompt]",
  );
  actionSheetItems.forEach((item) => {
    item.addEventListener("click", () => {
      const prompt = item.getAttribute("data-prompt");
      userInput.value = prompt;
      userInput.focus();
      hideActionSheet();
    });
  });
  document
    .getElementById("cancel-action")
    .addEventListener("click", hideActionSheet);

  hamburgerMenu.addEventListener("click", () => {
    sidebar.classList.toggle("visible");
  });

  // Theme selector toggle
  const themeSelectorHeader = document.querySelector(".theme-selector-header");
  themeSelectorHeader.addEventListener("click", () => {
    themeSelector.classList.toggle("expanded");
    const arrow = themeSelectorHeader.querySelector(".svg-icon");
    arrow.style.transform = themeSelector.classList.contains("expanded")
      ? "rotate(0deg)"
      : "rotate(-90deg)";
  });

  // Context menu listeners
  chatMessages.addEventListener("contextmenu", (e) => {
    const userMessage = e.target.closest(".user-message");
    if (userMessage) {
      const messagePair = userMessage.closest(".message-pair");
      showContextMenu(e, messagePair);
    }
  });
  document.addEventListener("click", (e) => {
    if (!contextMenu.contains(e.target) && !newChatModal.contains(e.target)) {
      hideContextMenu();
    }
  });
  editMessageBtn.addEventListener("click", editMessage);
  copyMessageBtn.addEventListener("click", copyMessage);

  // Chat context menu listeners
  moveChatBtn.addEventListener("click", () => {
    // Only show folders that are currently expanded
    const folderOptions = Object.keys(folders)
      .filter((id) => id === expandedFolderId || id === "unfiled")
      .map((id) => `<option value="${id}">${folders[id].name}</option>`)
      .join("");

    if (folderOptions === "") {
      alert("Please open a folder first before moving a chat.");
      hideChatContextMenu();
      return;
    }

    const popup = document.createElement("div");
    popup.style.position = "fixed";
    popup.style.top = "50%";
    popup.style.left = "50%";
    popup.style.transform = "translate(-50%, -50%)";
    popup.style.background = "var(--sidebar-bg)";
    popup.style.padding = "20px";
    popup.style.borderRadius = "8px";
    popup.style.boxShadow = "var(--shadow-color)";
    popup.style.zIndex = "1001";
    popup.innerHTML = `
            <p>Move chat to:</p>
            <select id="folder-select">${folderOptions}</select>
            <button id="confirm-move">Move</button>
        `;
    document.body.appendChild(popup);

    document.getElementById("confirm-move").addEventListener("click", () => {
      const targetFolderId = document.getElementById("folder-select").value;
      moveChatToFolder(chatToMoveId, targetFolderId);
      document.body.removeChild(popup);
    });
    hideChatContextMenu();
  });

  deleteChatBtnContext.addEventListener("click", () => {
    if (confirm("Are you sure you want to delete this chat?")) {
      deleteChat(chatToMoveId);
    }
    hideChatContextMenu();
  });

  // Sidebar tab listeners
  sidebarTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.tab;
      sidebarTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      if (tabName === "chats") {
        chatsContent.classList.add("active");
        galleryContent.classList.remove("active");
      } else {
        chatsContent.classList.remove("active");
        galleryContent.classList.add("active");
      }
    });
  });

  // Share modal event listeners
  shareCloseBtn.addEventListener("click", () => {
    shareModal.style.display = "none";
  });

  shareCopyBtn.addEventListener("click", () => {
    navigator.clipboard
      .writeText(shareLinkInput.value)
      .then(() => {
        showToast("Link copied to clipboard!");
      })
      .catch((err) => {
        console.error("Failed to copy link: ", err);
        showToast("Failed to copy link");
      });
  });

  shareMethods.forEach((method) => {
    method.addEventListener("click", () => {
      const shareMethod = method.dataset.method;
      const shareUrl = shareLinkInput.value;
      const shareText =
        messagePairToShare.querySelector(".message-content").textContent;

      if (shareMethod === "email") {
        window.location.href = `mailto:?subject=Check out this message from ZyNara AI&body=${encodeURIComponent(shareText + "\n\n" + shareUrl)}`;
      } else if (shareMethod === "twitter") {
        window.open(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
          "_blank",
        );
      } else if (shareMethod === "facebook") {
        window.open(
          `https://www.facebook.com/sharer/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
          "_blank",
        );
      } else if (shareMethod === "whatsapp") {
        window.open(
          `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`,
          "_blank",
        );
      }

      shareModal.style.display = "none";
    });
  });

  // --- Initial Load ---
  loadTheme();
  initializeThemeSelector();

  // Check authentication state
  checkAuthState();

  // Initialize voice bars
  const initializeVoiceBars = () => {
    voiceVisualizer.innerHTML = "";
    for (let i = 0; i < 20; i++) {
      const bar = document.createElement("div");
      bar.className = "voice-bar";
      bar.style.height = "4px";
      voiceVisualizer.appendChild(bar);
      voiceBars.push(bar);
    }
  };

  initializeVoiceBars();

  // Close sidebar button
  closeSidebarBtn.addEventListener("click", () => {
    sidebar.classList.remove("visible");
  });

  document.addEventListener("click", (e) => {
    if (
      sidebar.classList.contains("visible") &&
      !sidebar.contains(e.target) &&
      !hamburgerMenu.contains(e.target)
    ) {
      sidebar.classList.remove("visible");
    }
  });
});

(function () {
  const CONSENT_KEY = "zynara_consent_v1";

  // Show banner if not accepted
  if (!localStorage.getItem(CONSENT_KEY)) {
    document.getElementById("consent-banner").style.display = "block";
  }

  // Accept all consents
  document.getElementById("accept-consent").addEventListener("click", () => {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({
        disclaimer: true,
        cookies: true,
        privacy: true,
        accepted_at: new Date().toISOString(),
      }),
    );

    document.getElementById("consent-banner").remove();
  });
})();