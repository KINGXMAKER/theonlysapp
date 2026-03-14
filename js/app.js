/* ========================================
   App Core — Tab Switching, Shared State, Utilities
   ======================================== */

var BBO_APP = (function () {
  "use strict";

  /* --- Constants --- */
  var LABELS = ["content", "event", "outreach", "promo", "merch", "admin"];
  var DEFAULT_AMBASSADORS = ["Ktari", "Anjphobia", "Chanel aka Cardi C", "Msss Lee", "Alenexiss_", "Trillionaire T"];
  var AMBASSADOR_KEY = "bbo_ambassadors";

  /* --- Shared State --- */
  var tasks = [];
  var events = [];
  var announcements = [];
  var availability = [];
  var ambassadors = [];
  var activeTab = "tasks";

  /* --- Load ambassadors --- */
  function loadAmbassadors() {
    try {
      var stored = localStorage.getItem(AMBASSADOR_KEY);
      ambassadors = stored ? JSON.parse(stored) : DEFAULT_AMBASSADORS.slice();
    } catch (e) { ambassadors = DEFAULT_AMBASSADORS.slice(); }
  }

  function saveAmbassadors() {
    localStorage.setItem(AMBASSADOR_KEY, JSON.stringify(ambassadors));
  }

  /* --- Tab Switching --- */
  function switchTab(tabName) {
    activeTab = tabName;
    // Update tab buttons
    var btns = document.querySelectorAll(".tab-btn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", btns[i].dataset.tab === tabName);
    }
    // Update tab content
    var contents = document.querySelectorAll(".tab-content");
    for (var j = 0; j < contents.length; j++) {
      contents[j].classList.toggle("active", contents[j].id === "tab-" + tabName);
    }
    // Notify modules
    window.dispatchEvent(new CustomEvent("tab-changed", { detail: { tab: tabName } }));
  }

  /* --- Utility Functions --- */
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    var d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return "";
    var d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function isOverdue(task) {
    if (!task.due || task.status === "done") return false;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var due = new Date(task.due + "T00:00:00");
    return due < today;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function getBoardSummary() {
    var todo = tasks.filter(function (t) { return t.status === "todo"; }).length;
    var prog = tasks.filter(function (t) { return t.status === "in-progress"; }).length;
    var done = tasks.filter(function (t) { return t.status === "done"; }).length;
    var overdue = tasks.filter(isOverdue).length;
    var summary = "Current board: " + tasks.length + " tasks (" + todo + " to do, " + prog + " in progress, " + done + " done, " + overdue + " overdue).\n";
    if (tasks.length > 0) {
      summary += "Tasks:\n";
      tasks.forEach(function (t) {
        summary += "- \"" + t.title + "\" [" + t.priority + ", " + t.label + ", " + t.status + "]";
        if (t.ambassador) summary += " assigned to " + t.ambassador;
        if (t.due) summary += " due " + t.due;
        if (isOverdue(t)) summary += " (OVERDUE)";
        summary += "\n";
      });
    }
    summary += "Ambassadors: " + ambassadors.join(", ") + "\n";
    summary += "Today: " + todayStr();
    return summary;
  }

  /* --- Populate ambassador dropdowns (used by multiple modules) --- */
  function populateAmbassadorSelect(selectEl, includeAll) {
    var current = selectEl.value;
    selectEl.innerHTML = includeAll
      ? '<option value="">All Ambassadors</option>'
      : '<option value="">Unassigned</option>';
    ambassadors.forEach(function (a) {
      selectEl.innerHTML += '<option value="' + escapeHtml(a) + '">' + escapeHtml(a) + '</option>';
    });
    selectEl.value = current;
  }

  /* --- Settings: Firebase config UI --- */
  function openSettings() {
    document.getElementById("settings-overlay").classList.add("active");
    // Populate fields
    var config = BBO_FB.loadConfig() || {};
    document.getElementById("fb-apiKey").value = config.apiKey || "";
    document.getElementById("fb-authDomain").value = config.authDomain || "";
    document.getElementById("fb-projectId").value = config.projectId || "";
    document.getElementById("fb-storageBucket").value = config.storageBucket || "";
    document.getElementById("fb-messagingSenderId").value = config.messagingSenderId || "";
    document.getElementById("fb-appId").value = config.appId || "";
    // OpenRouter
    document.getElementById("or-key").value = localStorage.getItem("bbo_openrouter_key") || "";
    document.getElementById("or-model").value = localStorage.getItem("bbo_openrouter_model") || "deepseek/deepseek-chat-v3-0324:free";
    updateFirebaseStatus();
    updateKeyStatus();
  }

  function saveSettings() {
    // Firebase config
    var config = {
      apiKey: document.getElementById("fb-apiKey").value.trim(),
      authDomain: document.getElementById("fb-authDomain").value.trim(),
      projectId: document.getElementById("fb-projectId").value.trim(),
      storageBucket: document.getElementById("fb-storageBucket").value.trim(),
      messagingSenderId: document.getElementById("fb-messagingSenderId").value.trim(),
      appId: document.getElementById("fb-appId").value.trim()
    };
    if (config.projectId) {
      BBO_FB.saveConfig(config);
      BBO_FB.init(config);
      BBO_FB.migrateTasks().then(function (count) {
        if (count > 0) alert("Migrated " + count + " tasks from local storage to Firebase!");
        updateFirebaseStatus();
      });
    }
    // OpenRouter
    var orKey = document.getElementById("or-key").value.trim();
    var orModel = document.getElementById("or-model").value;
    if (orKey) localStorage.setItem("bbo_openrouter_key", orKey);
    localStorage.setItem("bbo_openrouter_model", orModel);

    updateFirebaseStatus();
    updateKeyStatus();
    document.getElementById("settings-overlay").classList.remove("active");
  }

  function updateFirebaseStatus() {
    var el = document.getElementById("fb-status");
    if (!el) return;
    if (BBO_FB.isConnected()) {
      el.innerHTML = '<span class="dot connected"></span> Connected';
      el.className = "fb-status";
    } else {
      el.innerHTML = '<span class="dot disconnected"></span> Not Connected';
      el.className = "fb-status";
    }
  }

  function updateKeyStatus() {
    var el = document.getElementById("key-status");
    if (!el) return;
    var key = localStorage.getItem("bbo_openrouter_key");
    if (key) {
      el.className = "key-status valid";
      el.textContent = "Key saved";
    } else {
      el.className = "key-status missing";
      el.textContent = "No key set — AI features won't work";
    }
  }

  /* --- Init --- */
  function init() {
    loadAmbassadors();

    // Tab button click handlers
    var tabBtns = document.querySelectorAll(".tab-btn");
    for (var i = 0; i < tabBtns.length; i++) {
      tabBtns[i].addEventListener("click", function () {
        switchTab(this.dataset.tab);
      });
    }

    // Settings
    document.getElementById("btn-settings").addEventListener("click", openSettings);
    document.getElementById("btn-save-settings").addEventListener("click", saveSettings);
    document.getElementById("settings-overlay").addEventListener("click", function (e) {
      if (e.target === this) this.classList.remove("active");
    });

    // ESC key
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var overlays = document.querySelectorAll(".modal-overlay.active");
        for (var j = 0; j < overlays.length; j++) {
          overlays[j].classList.remove("active");
        }
        if (document.getElementById("chat-panel").classList.contains("open")) {
          BBO_AI.toggleChat();
        }
      }
    });

    // Firebase status (autoInit is called from boot after all modules register)
    updateFirebaseStatus();

    // Start on My Tasks tab (command center default)
    switchTab("mytasks");
  }

  /* --- Public API --- */
  return {
    LABELS: LABELS,
    DEFAULT_AMBASSADORS: DEFAULT_AMBASSADORS,
    tasks: tasks,
    events: events,
    announcements: announcements,
    availability: availability,
    ambassadors: ambassadors,
    setTasks: function (t) { tasks.length = 0; Array.prototype.push.apply(tasks, t); },
    setEvents: function (e) { events.length = 0; Array.prototype.push.apply(events, e); },
    setAnnouncements: function (a) { announcements.length = 0; Array.prototype.push.apply(announcements, a); },
    setAvailability: function (a) { availability.length = 0; Array.prototype.push.apply(availability, a); },
    loadAmbassadors: loadAmbassadors,
    saveAmbassadors: saveAmbassadors,
    switchTab: switchTab,
    genId: genId,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    todayStr: todayStr,
    isOverdue: isOverdue,
    escapeHtml: escapeHtml,
    getBoardSummary: getBoardSummary,
    populateAmbassadorSelect: populateAmbassadorSelect,
    openSettings: openSettings,
    init: init
  };
})();
