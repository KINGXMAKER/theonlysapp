/* ========================================
   AI Module — OpenRouter, Chat, Command Bar, Task Generation
   ======================================== */

var BBO_AI = (function () {
  "use strict";

  var OR_KEY_STORAGE = "bbo_openrouter_key";
  var OR_MODEL_STORAGE = "bbo_openrouter_model";
  var chatHistory = [];

  /* --- Config --- */
  function getApiKey() { return localStorage.getItem(OR_KEY_STORAGE) || ""; }
  function getModel() { return localStorage.getItem(OR_MODEL_STORAGE) || "deepseek/deepseek-chat-v3-0324:free"; }

  /* --- OpenRouter API Call --- */
  function callAI(systemPrompt, userMessage, callback) {
    var key = getApiKey();
    if (!key) {
      callback("Set your OpenRouter API key first (click the gear icon in the header).", true);
      return;
    }
    var messages = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    if (typeof userMessage === "string") {
      messages.push({ role: "user", content: userMessage });
    } else {
      messages = messages.concat(userMessage);
    }

    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key,
        "HTTP-Referer": "https://bbouniverse.com",
        "X-Title": "BBO Ambassador Task Hub"
      },
      body: JSON.stringify({
        model: getModel(),
        messages: messages,
        max_tokens: 2048,
        temperature: 0.7
      })
    })
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.error) {
        callback("API Error: " + (data.error.message || JSON.stringify(data.error)), true);
      } else {
        var reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        callback(reply || "No response from AI.", false);
      }
    })
    .catch(function (err) {
      callback("Connection failed: " + err.message, true);
    });
  }

  /* --- Chat Panel --- */
  function toggleChat() {
    var panel = document.getElementById("chat-panel");
    var btn = document.getElementById("btn-chat");
    var isOpen = panel.classList.toggle("open");
    document.body.classList.toggle("chat-open", isOpen);
    if (btn) btn.classList.toggle("active", isOpen);
    if (isOpen) document.getElementById("chat-input").focus();
  }

  function addChatMsg(text, role) {
    var container = document.getElementById("chat-messages");
    var div = document.createElement("div");
    div.className = "chat-msg " + role;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  function sendChat() {
    var input = document.getElementById("chat-input");
    var msg = input.value.trim();
    if (!msg) return;
    input.value = "";

    addChatMsg(msg, "user");
    chatHistory.push({ role: "user", content: msg });

    var thinkEl = addChatMsg("Thinking...", "ai thinking");
    var sendBtn = document.getElementById("chat-send-btn");
    sendBtn.disabled = true;

    var sysPrompt = "You are the AI assistant for THE ONLYS — BBO Ambassador Task Hub. " +
      "You help King Maker manage brand ambassador tasks, events, and content assignments. " +
      "Be concise, helpful, and match the brand's confident energy. " +
      "Here's the current board state:\n\n" + BBO_APP.getBoardSummary() +
      "\n\nYou can help with:\n- Task management advice\n- Event planning\n- Ambassador coordination\n- Content strategy\n- Workflow optimization";

    var messagesForAI = chatHistory.slice(-10);

    callAI(sysPrompt, messagesForAI, function (reply, isError) {
      thinkEl.remove();
      addChatMsg(reply, "ai");
      chatHistory.push({ role: "assistant", content: reply });
      sendBtn.disabled = false;
    });
  }

  /* --- AI Command Bar --- */
  function toggleAIBar() {
    var bar = document.getElementById("ai-bar");
    var btn = document.getElementById("btn-ai-bar");
    var isVisible = bar.classList.toggle("visible");
    if (btn) btn.classList.toggle("active", isVisible);
    if (isVisible) document.getElementById("ai-command").focus();
  }

  function parseCommand() {
    var input = document.getElementById("ai-command");
    var cmd = input.value.trim();
    if (!cmd) return;

    var createBtn = document.getElementById("ai-command-btn");
    createBtn.disabled = true;
    createBtn.textContent = "Parsing...";

    var sysPrompt = "You are a task parser for the BBO Ambassador Task Hub. " +
      "Parse the user's natural language into a JSON task object.\n\n" +
      "Return ONLY valid JSON with these fields:\n" +
      '{"title":"...","description":"...","priority":"high|medium|low","status":"todo|in-progress|done","due":"YYYY-MM-DD","label":"content|event|outreach|promo|merch|admin","ambassador":"...","link":""}\n\n' +
      "Ambassadors: " + BBO_APP.ambassadors.join(", ") + "\n" +
      "Today: " + BBO_APP.todayStr() + "\n\n" +
      "If you can't determine a field, use reasonable defaults. Always return valid JSON only, no extra text.";

    callAI(sysPrompt, cmd, function (reply, isError) {
      createBtn.disabled = false;
      createBtn.textContent = "Create";

      if (isError) { alert(reply); return; }

      try {
        var cleaned = reply.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        var taskData = JSON.parse(cleaned);
        // Populate the task modal with parsed data
        BBO_TASKS.openModal(null);
        if (taskData.title) document.getElementById("task-title").value = taskData.title;
        if (taskData.description) document.getElementById("task-desc").value = taskData.description;
        if (taskData.priority) document.getElementById("task-priority").value = taskData.priority;
        if (taskData.status) document.getElementById("task-status").value = taskData.status;
        if (taskData.due) document.getElementById("task-due").value = taskData.due;
        if (taskData.label) document.getElementById("task-label").value = taskData.label;
        if (taskData.ambassador) document.getElementById("task-ambassador").value = taskData.ambassador;
        if (taskData.link) document.getElementById("task-link").value = taskData.link;
        input.value = "";
      } catch (e) {
        alert("AI response wasn't valid JSON. Try rephrasing.\n\nRaw response:\n" + reply);
      }
    });
  }

  /* --- Generate Tasks from Event --- */
  function generateTasks() {
    var eventType = document.getElementById("gen-event-type").value;
    var eventDate = document.getElementById("gen-event-date").value;
    var venue = document.getElementById("gen-venue").value;
    var notes = document.getElementById("gen-notes").value;

    if (!eventDate) { alert("Please select an event date."); return; }

    var genBtn = document.getElementById("btn-gen-go");
    genBtn.disabled = true;
    genBtn.textContent = "Generating...";

    var sysPrompt = "You are a task generator for THE ONLYS — BBO brand ambassador team. " +
      "Generate tasks needed for an upcoming event.\n\n" +
      "Return a JSON array of task objects. Each task:\n" +
      '{"title":"...","description":"...","priority":"high|medium|low","status":"todo","due":"YYYY-MM-DD","label":"event|content|promo|outreach","ambassador":"","link":""}\n\n' +
      "Generate 5-8 practical tasks that cover: pre-event prep, content creation, day-of logistics, post-event follow-up.\n" +
      "Set due dates relative to the event date. High priority for day-of tasks.\n" +
      "Ambassadors: " + BBO_APP.ambassadors.join(", ") + "\n" +
      "Today: " + BBO_APP.todayStr() + "\n\n" +
      "Return ONLY the JSON array, no other text.";

    var userMsg = "Generate tasks for: " + eventType + " on " + eventDate;
    if (venue) userMsg += " at " + venue;
    if (notes) userMsg += ". Notes: " + notes;

    callAI(sysPrompt, userMsg, function (reply, isError) {
      genBtn.disabled = false;
      genBtn.textContent = "Generate with AI";

      if (isError) { alert(reply); return; }

      try {
        var cleaned = reply.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        var taskList = JSON.parse(cleaned);
        if (!Array.isArray(taskList)) throw new Error("Not an array");

        var count = 0;
        taskList.forEach(function (t) {
          BBO_TASKS.addTask({
            title: t.title || "Untitled Task",
            description: t.description || "",
            priority: t.priority || "medium",
            status: t.status || "todo",
            due: t.due || eventDate,
            label: t.label || "event",
            ambassador: t.ambassador || "",
            link: t.link || ""
          });
          count++;
        });

        document.getElementById("generate-overlay").classList.remove("active");
        alert("Created " + count + " tasks for " + eventType + "!");
      } catch (e) {
        alert("Couldn't parse AI response. Try again.\n\n" + reply);
      }
    });
  }

  /* --- Init --- */
  function init() {
    // Chat panel
    var btnChat = document.getElementById("btn-chat");
    if (btnChat) btnChat.addEventListener("click", toggleChat);

    var chatInput = document.getElementById("chat-input");
    if (chatInput) {
      chatInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); sendChat(); }
      });
    }
    var chatSendBtn = document.getElementById("chat-send-btn");
    if (chatSendBtn) chatSendBtn.addEventListener("click", sendChat);

    // AI command bar
    var btnAIBar = document.getElementById("btn-ai-bar");
    if (btnAIBar) btnAIBar.addEventListener("click", toggleAIBar);

    var aiCmd = document.getElementById("ai-command");
    if (aiCmd) {
      aiCmd.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); parseCommand(); }
      });
    }
    var aiCmdBtn = document.getElementById("ai-command-btn");
    if (aiCmdBtn) aiCmdBtn.addEventListener("click", parseCommand);

    // Generate tasks
    var btnGen = document.getElementById("btn-generate");
    if (btnGen) {
      btnGen.addEventListener("click", function () {
        document.getElementById("generate-overlay").classList.add("active");
      });
    }
    var btnGenGo = document.getElementById("btn-gen-go");
    if (btnGenGo) btnGenGo.addEventListener("click", generateTasks);
  }

  return {
    init: init,
    toggleChat: toggleChat,
    sendChat: sendChat,
    parseCommand: parseCommand,
    generateTasks: generateTasks,
    callAI: callAI
  };
})();
