/* ========================================
   Availability / RSVP Module
   ======================================== */

var BBO_AVAILABILITY = (function () {
  "use strict";

  var EVENT_TYPES = [
    { value: "content-day", label: "Content Days" },
    { value: "pop-up", label: "Pop-Ups" },
    { value: "restaurant", label: "Restaurant Takeovers" },
    { value: "nightlife", label: "Nightlife Hostings" }
  ];

  var STATUSES = ["available", "maybe", "unavailable", "no-response"];
  var STATUS_LABELS = { "available": "Available", "maybe": "Maybe", "unavailable": "Unavailable", "no-response": "No Response" };

  function init() {
    window.addEventListener("tab-changed", function (e) {
      if (e.detail.tab === "availability") loadAndRender();
    });
    window.addEventListener("firebase-ready", function () {
      if (document.querySelector('.tab-btn.active[data-tab="availability"]')) loadAndRender();
    });
  }

  function loadAndRender() {
    if (BBO_FB.isConnected()) {
      BBO_FB.getAll("availability").then(function (data) {
        BBO_APP.setAvailability(data);
        render();
      });
    } else {
      try {
        var stored = localStorage.getItem("bbo_availability");
        BBO_APP.setAvailability(stored ? JSON.parse(stored) : []);
      } catch (e) { BBO_APP.setAvailability([]); }
      render();
    }
  }

  function saveLocal() {
    if (!BBO_FB.isConnected()) {
      localStorage.setItem("bbo_availability", JSON.stringify(BBO_APP.availability));
    }
  }

  function getStatus(ambassador, eventId) {
    for (var i = 0; i < BBO_APP.availability.length; i++) {
      var a = BBO_APP.availability[i];
      if (a.ambassador === ambassador && a.eventId === eventId) return a.status;
    }
    return "no-response";
  }

  function cycleStatus(ambassador, eventId) {
    var currentStatus = getStatus(ambassador, eventId);
    var idx = STATUSES.indexOf(currentStatus);
    var nextStatus = STATUSES[(idx + 1) % STATUSES.length];

    // Find existing record
    var found = false;
    for (var i = 0; i < BBO_APP.availability.length; i++) {
      var a = BBO_APP.availability[i];
      if (a.ambassador === ambassador && a.eventId === eventId) {
        a.status = nextStatus;
        found = true;
        if (BBO_FB.isConnected() && (a.id || a._id)) {
          BBO_FB.update("availability", a.id || a._id, { status: nextStatus });
        }
        break;
      }
    }

    if (!found) {
      var record = {
        id: BBO_APP.genId(),
        ambassador: ambassador,
        eventId: eventId,
        status: nextStatus
      };
      BBO_APP.availability.push(record);
      if (BBO_FB.isConnected()) {
        BBO_FB.add("availability", record);
      }
    }

    saveLocal();
    render();
  }

  function render() {
    var container = document.getElementById("availability-view");
    if (!container) return;

    // Get upcoming events for columns
    var upcomingEvents = BBO_APP.events.filter(function (ev) {
      return ev.status !== "completed";
    }).slice(0, 8);

    // Also include general event types if no events exist
    var columns = [];
    if (upcomingEvents.length > 0) {
      upcomingEvents.forEach(function (ev) {
        columns.push({
          id: ev.id || ev._id,
          label: ev.title || "Event",
          date: ev.date ? BBO_APP.formatDate(ev.date.substring(0, 10)) : ""
        });
      });
    }

    // Always show generic event types too
    EVENT_TYPES.forEach(function (et) {
      columns.push({ id: et.value, label: et.label, date: "" });
    });

    var html = '<div class="availability-container">';
    html += '<h2 style="font-family:var(--font-heading);font-size:1.4rem;letter-spacing:2px;margin-bottom:16px">AVAILABILITY / RSVP</h2>';
    html += '<p style="color:var(--gray-muted);font-size:0.82rem;margin-bottom:16px">Click a cell to cycle: <span style="color:var(--low)">Available</span> → <span style="color:var(--medium)">Maybe</span> → <span style="color:var(--high)">Unavailable</span> → <span style="color:var(--gray-muted)">No Response</span></p>';

    html += '<table class="avail-table">';
    html += '<thead><tr><th>Ambassador</th>';
    columns.forEach(function (col) {
      html += '<th>' + BBO_APP.escapeHtml(col.label);
      if (col.date) html += '<br><span style="font-weight:400;font-size:0.65rem;color:var(--gray-muted)">' + col.date + '</span>';
      html += '</th>';
    });
    html += '</tr></thead>';

    html += '<tbody>';
    BBO_APP.ambassadors.forEach(function (amb) {
      html += '<tr>';
      html += '<td class="avail-name">' + BBO_APP.escapeHtml(amb) + '</td>';
      columns.forEach(function (col) {
        var status = getStatus(amb, col.id);
        html += '<td class="avail-cell" onclick="BBO_AVAILABILITY.cycleStatus(\'' +
          BBO_APP.escapeHtml(amb).replace(/'/g, "\\'") + '\',\'' +
          BBO_APP.escapeHtml(col.id).replace(/'/g, "\\'") + '\')">';
        html += '<span class="avail-badge ' + status + '">' + STATUS_LABELS[status] + '</span>';
        html += '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';

    // Summary counts per column
    html += '<div class="avail-summary">';
    columns.forEach(function (col) {
      var counts = { available: 0, maybe: 0, unavailable: 0 };
      BBO_APP.ambassadors.forEach(function (amb) {
        var s = getStatus(amb, col.id);
        if (counts[s] !== undefined) counts[s]++;
      });
      html += '<div class="avail-summary-item"><strong>' + BBO_APP.escapeHtml(col.label) + ':</strong> ';
      html += '<span style="color:var(--low)">' + counts.available + ' yes</span>, ';
      html += '<span style="color:var(--medium)">' + counts.maybe + ' maybe</span>, ';
      html += '<span style="color:var(--high)">' + counts.unavailable + ' no</span>';
      html += '</div>';
    });
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
  }

  return {
    init: init,
    render: render,
    cycleStatus: cycleStatus,
    loadAndRender: loadAndRender
  };
})();
