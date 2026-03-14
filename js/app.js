/* ========================================
   App Core — Tab Switching, Utilities
   ======================================== */

var BBO_APP = (function () {
  "use strict";

  /* --- Constants --- */
  var DEFAULT_AMBASSADORS = ["Ktari", "Anjphobia", "Chanel aka Cardi C", "Msss Lee", "Alenexiss_", "Trillionaire T"];
  var AMBASSADOR_KEY = "bbo_ambassadors";

  /* --- Shared State --- */
  var ambassadors = [];
  var activeTab = "mytasks";

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
    var btns = document.querySelectorAll(".tab-btn");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", btns[i].dataset.tab === tabName);
    }
    var contents = document.querySelectorAll(".tab-content");
    for (var j = 0; j < contents.length; j++) {
      contents[j].classList.toggle("active", contents[j].id === "tab-" + tabName);
    }
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

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function getBoardSummary() {
    var summary = "Ambassadors: " + ambassadors.join(", ") + "\n";
    summary += "Today: " + todayStr();
    return summary;
  }

  /* --- Populate ambassador dropdowns --- */
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

  /* --- Settings --- */
  function openSettings() {
    document.getElementById("settings-overlay").classList.add("active");
    var config = BBO_FB.loadConfig() || {};
    document.getElementById("fb-apiKey").value = config.apiKey || "";
    document.getElementById("fb-authDomain").value = config.authDomain || "";
    document.getElementById("fb-projectId").value = config.projectId || "";
    document.getElementById("fb-storageBucket").value = config.storageBucket || "";
    document.getElementById("fb-messagingSenderId").value = config.messagingSenderId || "";
    document.getElementById("fb-appId").value = config.appId || "";
    document.getElementById("or-key").value = localStorage.getItem("bbo_openrouter_key") || "";
    document.getElementById("or-model").value = localStorage.getItem("bbo_openrouter_model") || "deepseek/deepseek-chat-v3-0324:free";
    updateFirebaseStatus();
    updateKeyStatus();
  }

  function saveSettings() {
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
    } else {
      el.innerHTML = '<span class="dot disconnected"></span> Not Connected';
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
      el.textContent = "No key set \u2014 AI features won't work";
    }
  }

  /* --- Init --- */
  function init() {
    loadAmbassadors();

    var tabBtns = document.querySelectorAll(".tab-btn");
    for (var i = 0; i < tabBtns.length; i++) {
      tabBtns[i].addEventListener("click", function () {
        switchTab(this.dataset.tab);
      });
    }

    document.getElementById("btn-settings").addEventListener("click", openSettings);
    document.getElementById("btn-save-settings").addEventListener("click", saveSettings);
    document.getElementById("settings-overlay").addEventListener("click", function (e) {
      if (e.target === this) this.classList.remove("active");
    });

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

    updateFirebaseStatus();
    switchTab("mytasks");
  }

  /* --- Public API --- */
  return {
    ambassadors: ambassadors,
    loadAmbassadors: loadAmbassadors,
    saveAmbassadors: saveAmbassadors,
    switchTab: switchTab,
    genId: genId,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    todayStr: todayStr,
    escapeHtml: escapeHtml,
    getBoardSummary: getBoardSummary,
    populateAmbassadorSelect: populateAmbassadorSelect,
    openSettings: openSettings,
    init: init
  };
})();
