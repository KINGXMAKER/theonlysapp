/* ========================================
   Announcements Module — Feed System
   ======================================== */

var BBO_ANNOUNCEMENTS = (function () {
  "use strict";

  var CATEGORIES = [
    { value: "priorities", label: "This Week's Priorities", color: "#ff1493" },
    { value: "call-times", label: "Event Call Times", color: "#5b9aff" },
    { value: "posting", label: "Posting Instructions", color: "#ffb142" },
    { value: "campaign", label: "Campaign Themes", color: "#c57bff" },
    { value: "emergency", label: "Emergency Updates", color: "#ff4757" },
    { value: "logistics", label: "Dress Code / Location / Check-In", color: "#2ed573" }
  ];

  var editingId = null;

  function init() {
    window.addEventListener("tab-changed", function (e) {
      if (e.detail.tab === "announcements") loadAndRender();
    });
    window.addEventListener("firebase-ready", function () {
      if (document.querySelector('.tab-btn.active[data-tab="announcements"]')) loadAndRender();
    });
  }

  function loadAndRender() {
    if (BBO_FB.isConnected()) {
      BBO_FB.getAll("announcements", "created_at", "desc").then(function (data) {
        BBO_APP.setAnnouncements(data);
        render();
      });
    } else {
      try {
        var stored = localStorage.getItem("bbo_announcements");
        BBO_APP.setAnnouncements(stored ? JSON.parse(stored) : []);
      } catch (e) { BBO_APP.setAnnouncements([]); }
      render();
    }
  }

  function saveLocal() {
    if (!BBO_FB.isConnected()) {
      localStorage.setItem("bbo_announcements", JSON.stringify(BBO_APP.announcements));
    }
  }

  function getCatInfo(val) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].value === val) return CATEGORIES[i];
    }
    return { value: val, label: val, color: "#999" };
  }

  function render() {
    var container = document.getElementById("announcements-view");
    if (!container) return;

    var html = '<div class="announcements-container">';

    // Header with add button
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">';
    html += '<h2 style="font-family:var(--font-heading);font-size:1.4rem;letter-spacing:2px">ANNOUNCEMENTS</h2>';
    html += '<button class="btn-add" onclick="BBO_ANNOUNCEMENTS.openModal()">+ Post Update</button>';
    html += '</div>';

    var items = BBO_APP.announcements.slice();
    // Pinned first
    items.sort(function (a, b) {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });

    if (items.length === 0) {
      html += '<div class="empty-state" style="padding:60px 20px">No announcements yet. Post your first update!</div>';
    }

    items.forEach(function (a) {
      var id = a.id || a._id;
      var cat = getCatInfo(a.category);
      var time = a.created_at ? timeAgo(a.created_at) : "";

      html += '<div class="announcement-card' + (a.pinned ? ' pinned' : '') + '">';
      html += '<div class="announcement-header">';
      html += '<span class="announcement-title">' + (a.pinned ? '&#128204; ' : '') + BBO_APP.escapeHtml(a.title) + '</span>';
      html += '</div>';
      html += '<div class="announcement-body">' + BBO_APP.escapeHtml(a.body) + '</div>';
      html += '<div class="announcement-footer">';
      html += '<span class="announcement-category" style="background:' + cat.color + '22;color:' + cat.color + '">' + cat.label + '</span>';
      html += '<span class="announcement-time">' + time + '</span>';
      html += '<div class="announcement-actions">';
      html += '<button onclick="BBO_ANNOUNCEMENTS.openModal(\'' + id + '\')">Edit</button>';
      html += '<button class="delete" onclick="BBO_ANNOUNCEMENTS.remove(\'' + id + '\')">Delete</button>';
      html += '</div></div></div>';
    });

    html += '</div>';
    container.innerHTML = html;
  }

  function timeAgo(isoStr) {
    if (!isoStr) return "";
    var now = Date.now();
    var then = new Date(isoStr).getTime();
    var diff = Math.floor((now - then) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    if (diff < 604800) return Math.floor(diff / 86400) + "d ago";
    return new Date(isoStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function openModal(id) {
    editingId = id || null;
    var overlay = document.getElementById("announcement-overlay");
    var title = document.getElementById("ann-modal-title");
    var fieldTitle = document.getElementById("ann-title");
    var fieldBody = document.getElementById("ann-body");
    var fieldCat = document.getElementById("ann-category");
    var fieldPin = document.getElementById("ann-pinned");

    if (editingId) {
      var ann = null;
      for (var i = 0; i < BBO_APP.announcements.length; i++) {
        var a = BBO_APP.announcements[i];
        if (a.id === editingId || a._id === editingId) { ann = a; break; }
      }
      if (ann) {
        title.textContent = "EDIT ANNOUNCEMENT";
        fieldTitle.value = ann.title || "";
        fieldBody.value = ann.body || "";
        fieldCat.value = ann.category || "priorities";
        fieldPin.checked = !!ann.pinned;
      }
    } else {
      title.textContent = "NEW ANNOUNCEMENT";
      fieldTitle.value = "";
      fieldBody.value = "";
      fieldCat.value = "priorities";
      fieldPin.checked = false;
    }
    overlay.classList.add("active");
    setTimeout(function () { fieldTitle.focus(); }, 100);
  }

  function closeModal() {
    document.getElementById("announcement-overlay").classList.remove("active");
    editingId = null;
  }

  function save() {
    var t = document.getElementById("ann-title").value.trim();
    var b = document.getElementById("ann-body").value.trim();
    var c = document.getElementById("ann-category").value;
    var p = document.getElementById("ann-pinned").checked;

    if (!t) { alert("Title is required."); return; }

    var data = { title: t, body: b, category: c, pinned: p };

    if (editingId) {
      // Update
      for (var i = 0; i < BBO_APP.announcements.length; i++) {
        var a = BBO_APP.announcements[i];
        if (a.id === editingId || a._id === editingId) {
          Object.assign(a, data);
          break;
        }
      }
      if (BBO_FB.isConnected()) {
        BBO_FB.update("announcements", editingId, data).then(function () { render(); });
      } else { saveLocal(); render(); }
    } else {
      // New
      data.id = BBO_APP.genId();
      data.created_at = new Date().toISOString();
      if (BBO_FB.isConnected()) {
        BBO_FB.add("announcements", data).then(function (fbId) {
          data._id = fbId;
          BBO_APP.announcements.unshift(data);
          render();
        });
      } else {
        BBO_APP.announcements.unshift(data);
        saveLocal();
        render();
      }
    }
    closeModal();
  }

  function remove(id) {
    if (!confirm("Delete this announcement?")) return;
    BBO_APP.setAnnouncements(BBO_APP.announcements.filter(function (a) { return a.id !== id && a._id !== id; }));
    if (BBO_FB.isConnected()) {
      BBO_FB.del("announcements", id).then(function () { render(); });
    } else { saveLocal(); render(); }
  }

  return {
    CATEGORIES: CATEGORIES,
    init: init,
    render: render,
    openModal: openModal,
    closeModal: closeModal,
    save: save,
    remove: remove
  };
})();
