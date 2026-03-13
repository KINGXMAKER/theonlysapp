/* ========================================
   Events Hub Module
   ======================================== */

var BBO_EVENTS = (function () {
  "use strict";

  var editingId = null;
  var viewMode = "list"; // "list" or "detail"
  var detailId = null;
  var statusFilter = "all";

  function init() {
    window.addEventListener("tab-changed", function (e) {
      if (e.detail.tab === "events") loadAndRender();
    });
    window.addEventListener("firebase-ready", function () {
      if (document.querySelector('.tab-btn.active[data-tab="events"]')) loadAndRender();
    });
  }

  function loadAndRender() {
    if (BBO_FB.isConnected()) {
      BBO_FB.getAll("events", "date", "asc").then(function (data) {
        data.forEach(function (ev) { if (!ev.id && ev._id) ev.id = ev._id; });
        BBO_APP.setEvents(data);
        render();
      });
    } else {
      try {
        var stored = localStorage.getItem("bbo_events");
        BBO_APP.setEvents(stored ? JSON.parse(stored) : []);
      } catch (e) { BBO_APP.setEvents([]); }
      render();
    }
  }

  function saveLocal() {
    if (!BBO_FB.isConnected()) {
      localStorage.setItem("bbo_events", JSON.stringify(BBO_APP.events));
    }
  }

  function render() {
    var container = document.getElementById("events-view");
    if (!container) return;

    if (viewMode === "detail" && detailId) {
      renderDetail(container);
      return;
    }

    var html = '<div class="events-container">';

    // Header
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">';
    html += '<h2 style="font-family:var(--font-heading);font-size:1.4rem;letter-spacing:2px">EVENT HUB</h2>';
    html += '<button class="btn-add" onclick="BBO_EVENTS.openModal()">+ Create Event</button>';
    html += '</div>';

    // Status filters
    html += '<div class="events-filter-row">';
    ["all", "upcoming", "active", "completed"].forEach(function (s) {
      html += '<button class="event-filter-btn' + (statusFilter === s ? ' active' : '') +
        '" onclick="BBO_EVENTS.setFilter(\'' + s + '\')">' +
        s.charAt(0).toUpperCase() + s.slice(1) + '</button>';
    });
    html += '</div>';

    // Filter events
    var events = BBO_APP.events.filter(function (ev) {
      if (statusFilter === "all") return true;
      return ev.status === statusFilter;
    });

    if (events.length === 0) {
      html += '<div class="empty-state" style="padding:60px 20px">No events yet. Create your first event!</div>';
    }

    html += '<div class="events-grid">';
    events.forEach(function (ev) {
      var id = ev.id || ev._id;
      html += '<div class="event-card" onclick="BBO_EVENTS.viewDetail(\'' + id + '\')">';
      html += '<span class="event-card-status ' + (ev.status || 'upcoming') + '">' + (ev.status || 'upcoming') + '</span>';
      html += '<div class="event-card-title">' + BBO_APP.escapeHtml(ev.title || 'Untitled Event') + '</div>';

      if (ev.date) {
        var d = new Date(ev.date);
        html += '<div class="event-card-detail">&#128197; ' + d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) + '</div>';
      }
      if (ev.callTime) html += '<div class="event-card-detail">&#9200; Call: ' + BBO_APP.escapeHtml(ev.callTime) + '</div>';
      if (ev.venue) html += '<div class="event-card-detail">&#128205; ' + BBO_APP.escapeHtml(ev.venue) + '</div>';
      if (ev.dressCode) html += '<div class="event-card-detail">&#128087; ' + BBO_APP.escapeHtml(ev.dressCode) + '</div>';

      if (ev.roster && ev.roster.length > 0) {
        html += '<div class="event-card-roster">';
        ev.roster.forEach(function (r) { html += '<span>' + BBO_APP.escapeHtml(r) + '</span>'; });
        html += '</div>';
      }

      html += '</div>';
    });
    html += '</div></div>';

    container.innerHTML = html;
  }

  function renderDetail(container) {
    var ev = null;
    for (var i = 0; i < BBO_APP.events.length; i++) {
      var e = BBO_APP.events[i];
      if (e.id === detailId || e._id === detailId) { ev = e; break; }
    }
    if (!ev) { viewMode = "list"; render(); return; }

    var id = ev.id || ev._id;
    var html = '<div class="event-detail">';
    html += '<button class="event-detail-back" onclick="BBO_EVENTS.backToList()">&#8592; Back to Events</button>';

    html += '<div class="event-detail-header">';
    html += '<span class="event-card-status ' + (ev.status || 'upcoming') + '">' + (ev.status || 'upcoming') + '</span>';
    html += '<h2>' + BBO_APP.escapeHtml(ev.title || 'Untitled Event') + '</h2>';
    html += '<div style="margin-top:10px;display:flex;gap:8px">';
    html += '<button class="btn-add" style="font-size:0.78rem;padding:6px 14px" onclick="BBO_EVENTS.openModal(\'' + id + '\')">Edit Event</button>';
    html += '<button class="btn-add" style="font-size:0.78rem;padding:6px 14px;background:rgba(255,71,87,0.15);color:var(--high)" onclick="BBO_EVENTS.remove(\'' + id + '\')">Delete</button>';
    html += '</div></div>';

    // Info grid
    html += '<div class="event-info-grid">';
    var infoItems = [
      { label: "Date", value: ev.date ? new Date(ev.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "TBD" },
      { label: "Call Time", value: ev.callTime || "TBD" },
      { label: "Venue", value: ev.venue || "TBD" },
      { label: "Dress Code", value: ev.dressCode || "TBD" }
    ];
    infoItems.forEach(function (item) {
      html += '<div class="event-info-item"><div class="event-info-label">' + item.label + '</div><div class="event-info-value">' + BBO_APP.escapeHtml(item.value) + '</div></div>';
    });
    html += '</div>';

    // Ambassador Roster
    if (ev.roster && ev.roster.length > 0) {
      html += '<div class="event-section"><h3>AMBASSADOR ROSTER</h3>';
      html += '<div class="event-card-roster" style="gap:8px">';
      ev.roster.forEach(function (r) { html += '<span style="padding:4px 12px;font-size:0.8rem">' + BBO_APP.escapeHtml(r) + '</span>'; });
      html += '</div></div>';
    }

    // Notes
    if (ev.notes) {
      html += '<div class="event-section"><h3>NOTES</h3>';
      html += '<div style="background:var(--surface);padding:14px;border-radius:var(--radius-sm);color:var(--gray-text);white-space:pre-wrap;font-size:0.88rem">' + BBO_APP.escapeHtml(ev.notes) + '</div></div>';
    }

    // Asset Links
    if (ev.links && ev.links.length > 0) {
      html += '<div class="event-section"><h3>ASSETS & LINKS</h3>';
      ev.links.forEach(function (link) {
        html += '<a href="' + BBO_APP.escapeHtml(link) + '" target="_blank" rel="noopener" style="display:block;color:var(--soft-pink);font-size:0.85rem;margin-bottom:4px;text-decoration:none">&#128279; ' + BBO_APP.escapeHtml(link) + '</a>';
      });
      html += '</div>';
    }

    // Linked Tasks
    var linkedTasks = BBO_APP.tasks.filter(function (t) { return t.label === "event" && t.due === (ev.date ? ev.date.substring(0, 10) : ""); });
    if (linkedTasks.length > 0) {
      html += '<div class="event-section"><h3>LINKED TASKS</h3>';
      linkedTasks.forEach(function (t) {
        var tid = t.id || t._id;
        html += '<div style="background:var(--card);border:1px solid var(--gray-subtle);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:6px;cursor:pointer;transition:all 0.2s" onclick="BBO_TASKS.editTask(\'' + tid + '\')" onmouseover="this.style.borderColor=\'var(--border-hover)\'" onmouseout="this.style.borderColor=\'var(--gray-subtle)\'">';
        html += '<span class="priority-badge ' + t.priority + '" style="font-size:0.6rem;margin-right:8px">' + t.priority + '</span>';
        html += '<span style="font-weight:600;font-size:0.85rem">' + BBO_APP.escapeHtml(t.title) + '</span>';
        if (t.ambassador) html += '<span style="color:var(--soft-pink);font-size:0.75rem;margin-left:8px">' + BBO_APP.escapeHtml(t.ambassador) + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
  }

  function setFilter(f) { statusFilter = f; render(); }
  function viewDetail(id) { detailId = id; viewMode = "detail"; render(); }
  function backToList() { viewMode = "list"; detailId = null; render(); }

  function openModal(id) {
    editingId = id || null;
    var overlay = document.getElementById("event-overlay");
    var titleEl = document.getElementById("ev-modal-title");

    var fields = {
      title: document.getElementById("ev-title"),
      date: document.getElementById("ev-date"),
      callTime: document.getElementById("ev-calltime"),
      venue: document.getElementById("ev-venue"),
      dressCode: document.getElementById("ev-dresscode"),
      notes: document.getElementById("ev-notes"),
      links: document.getElementById("ev-links"),
      status: document.getElementById("ev-status")
    };

    if (editingId) {
      var ev = null;
      for (var i = 0; i < BBO_APP.events.length; i++) {
        var e = BBO_APP.events[i];
        if (e.id === editingId || e._id === editingId) { ev = e; break; }
      }
      if (ev) {
        titleEl.textContent = "EDIT EVENT";
        fields.title.value = ev.title || "";
        fields.date.value = ev.date ? ev.date.substring(0, 10) : "";
        fields.callTime.value = ev.callTime || "";
        fields.venue.value = ev.venue || "";
        fields.dressCode.value = ev.dressCode || "";
        fields.notes.value = ev.notes || "";
        fields.links.value = ev.links ? ev.links.join("\n") : "";
        fields.status.value = ev.status || "upcoming";
        // Roster checkboxes
        updateRosterCheckboxes(ev.roster || []);
      }
    } else {
      titleEl.textContent = "CREATE EVENT";
      fields.title.value = "";
      fields.date.value = "";
      fields.callTime.value = "";
      fields.venue.value = "";
      fields.dressCode.value = "";
      fields.notes.value = "";
      fields.links.value = "";
      fields.status.value = "upcoming";
      updateRosterCheckboxes([]);
    }
    overlay.classList.add("active");
  }

  function updateRosterCheckboxes(selected) {
    var container = document.getElementById("ev-roster-checks");
    if (!container) return;
    container.innerHTML = "";
    BBO_APP.ambassadors.forEach(function (a) {
      var checked = selected.indexOf(a) !== -1;
      var label = document.createElement("label");
      label.style.cssText = "display:flex;align-items:center;gap:6px;font-size:0.85rem;color:var(--white);cursor:pointer;padding:4px 0";
      label.innerHTML = '<input type="checkbox" value="' + BBO_APP.escapeHtml(a) + '"' + (checked ? ' checked' : '') + ' style="accent-color:var(--pink)"> ' + BBO_APP.escapeHtml(a);
      container.appendChild(label);
    });
  }

  function closeModal() {
    document.getElementById("event-overlay").classList.remove("active");
    editingId = null;
  }

  function save() {
    var title = document.getElementById("ev-title").value.trim();
    if (!title) { alert("Event title is required."); return; }

    // Get roster from checkboxes
    var roster = [];
    var checks = document.querySelectorAll("#ev-roster-checks input[type=checkbox]:checked");
    for (var i = 0; i < checks.length; i++) roster.push(checks[i].value);

    var linksRaw = document.getElementById("ev-links").value.trim();
    var links = linksRaw ? linksRaw.split("\n").map(function (l) { return l.trim(); }).filter(Boolean) : [];

    var data = {
      title: title,
      date: document.getElementById("ev-date").value,
      callTime: document.getElementById("ev-calltime").value.trim(),
      venue: document.getElementById("ev-venue").value.trim(),
      dressCode: document.getElementById("ev-dresscode").value.trim(),
      notes: document.getElementById("ev-notes").value.trim(),
      links: links,
      roster: roster,
      status: document.getElementById("ev-status").value
    };

    if (editingId) {
      for (var j = 0; j < BBO_APP.events.length; j++) {
        var e = BBO_APP.events[j];
        if (e.id === editingId || e._id === editingId) { Object.assign(e, data); break; }
      }
      if (BBO_FB.isConnected()) {
        BBO_FB.update("events", editingId, data).then(function () { render(); });
      } else { saveLocal(); render(); }
    } else {
      data.id = BBO_APP.genId();
      if (BBO_FB.isConnected()) {
        BBO_FB.add("events", data).then(function (fbId) {
          data._id = fbId;
          BBO_APP.events.push(data);
          render();
        });
      } else {
        BBO_APP.events.push(data);
        saveLocal();
        render();
      }
    }
    closeModal();
  }

  function remove(id) {
    if (!confirm("Delete this event?")) return;
    BBO_APP.setEvents(BBO_APP.events.filter(function (e) { return e.id !== id && e._id !== id; }));
    if (BBO_FB.isConnected()) {
      BBO_FB.del("events", id).then(render);
    } else { saveLocal(); }
    viewMode = "list"; detailId = null;
    render();
  }

  return {
    init: init,
    render: render,
    setFilter: setFilter,
    viewDetail: viewDetail,
    backToList: backToList,
    openModal: openModal,
    closeModal: closeModal,
    save: save,
    remove: remove
  };
})();
