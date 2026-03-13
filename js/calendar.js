/* ========================================
   Calendar Module — Monthly Calendar View
   ======================================== */

var BBO_CALENDAR = (function () {
  "use strict";

  var currentYear, currentMonth;
  var DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  function init() {
    var now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();

    // Listen for tab changes to render
    window.addEventListener("tab-changed", function (e) {
      if (e.detail.tab === "calendar") render();
    });
    window.addEventListener("firebase-ready", function () {
      if (document.querySelector('.tab-btn.active[data-tab="calendar"]')) render();
    });
  }

  function render() {
    var container = document.getElementById("calendar-view");
    if (!container) return;

    var html = '<div class="calendar-container">';
    // Navigation
    html += '<div class="calendar-nav">';
    html += '<button class="cal-nav-btn" onclick="BBO_CALENDAR.prevMonth()">&#9664;</button>';
    html += '<h2>' + MONTH_NAMES[currentMonth] + ' ' + currentYear + '</h2>';
    html += '<button class="cal-nav-btn" onclick="BBO_CALENDAR.nextMonth()">&#9654;</button>';
    html += '</div>';

    // Day headers
    html += '<div class="calendar-grid">';
    DAY_NAMES.forEach(function (d) {
      html += '<div class="cal-day-header">' + d + '</div>';
    });

    // Calculate grid
    var firstDay = new Date(currentYear, currentMonth, 1).getDay();
    var daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    var prevDays = new Date(currentYear, currentMonth, 0).getDate();
    var todayStr = BBO_APP.todayStr();

    // Build task and event maps by date
    var tasksByDate = {};
    BBO_APP.tasks.forEach(function (t) {
      if (t.due) {
        if (!tasksByDate[t.due]) tasksByDate[t.due] = [];
        tasksByDate[t.due].push(t);
      }
    });
    var eventsByDate = {};
    BBO_APP.events.forEach(function (ev) {
      if (ev.date) {
        var dateKey = ev.date.substring(0, 10);
        if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
        eventsByDate[dateKey].push(ev);
      }
    });

    // Previous month fill
    for (var p = firstDay - 1; p >= 0; p--) {
      var pDay = prevDays - p;
      html += '<div class="cal-day other-month"><span class="cal-day-num">' + pDay + '</span></div>';
    }

    // Current month days
    for (var d = 1; d <= daysInMonth; d++) {
      var dateStr = currentYear + '-' + String(currentMonth + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var isToday = dateStr === todayStr;
      var dayTasks = tasksByDate[dateStr] || [];
      var dayEvents = eventsByDate[dateStr] || [];

      html += '<div class="cal-day' + (isToday ? ' today' : '') + '" onclick="BBO_CALENDAR.showDay(\'' + dateStr + '\', event)">';
      html += '<span class="cal-day-num">' + d + '</span>';

      // Task dots
      if (dayTasks.length > 0) {
        html += '<div>';
        dayTasks.slice(0, 5).forEach(function (t) {
          html += '<span class="cal-dot ' + (t.priority || 'medium') + '"></span>';
        });
        if (dayTasks.length > 5) html += '<span style="font-size:0.55rem;color:var(--gray-muted)">+' + (dayTasks.length - 5) + '</span>';
        html += '</div>';
      }

      // Event pills
      dayEvents.slice(0, 2).forEach(function (ev) {
        html += '<span class="cal-event-pill">' + BBO_APP.escapeHtml(ev.title || 'Event') + '</span>';
      });

      html += '</div>';
    }

    // Next month fill
    var totalCells = firstDay + daysInMonth;
    var remaining = (7 - (totalCells % 7)) % 7;
    for (var n = 1; n <= remaining; n++) {
      html += '<div class="cal-day other-month"><span class="cal-day-num">' + n + '</span></div>';
    }

    html += '</div></div>';

    // Popover container
    html += '<div class="cal-popover" id="cal-popover"></div>';

    container.innerHTML = html;
  }

  function prevMonth() {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    render();
  }

  function nextMonth() {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    render();
  }

  function showDay(dateStr, evt) {
    var popover = document.getElementById("cal-popover");
    if (!popover) return;

    var dayTasks = BBO_APP.tasks.filter(function (t) { return t.due === dateStr; });
    var dayEvents = BBO_APP.events.filter(function (ev) { return ev.date && ev.date.substring(0, 10) === dateStr; });

    if (dayTasks.length === 0 && dayEvents.length === 0) {
      popover.classList.remove("active");
      return;
    }

    var d = new Date(dateStr + "T00:00:00");
    var html = '<h3>' + d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + '</h3>';

    if (dayEvents.length > 0) {
      html += '<div style="margin-bottom:8px;font-size:0.7rem;color:var(--pink);font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Events</div>';
      dayEvents.forEach(function (ev) {
        html += '<div class="cal-popover-item" onclick="BBO_APP.switchTab(\'events\')">';
        html += '<strong>' + BBO_APP.escapeHtml(ev.title) + '</strong>';
        if (ev.venue) html += '<br><span style="color:var(--gray-muted)">' + BBO_APP.escapeHtml(ev.venue) + '</span>';
        html += '</div>';
      });
    }

    if (dayTasks.length > 0) {
      html += '<div style="margin-bottom:8px;font-size:0.7rem;color:var(--gray-text);font-weight:700;text-transform:uppercase;letter-spacing:0.5px">Tasks</div>';
      dayTasks.forEach(function (t) {
        var tid = t.id || t._id;
        html += '<div class="cal-popover-item" onclick="BBO_TASKS.editTask(\'' + tid + '\')">';
        html += '<span class="priority-badge ' + t.priority + '" style="font-size:0.6rem;margin-right:6px">' + t.priority + '</span>';
        html += BBO_APP.escapeHtml(t.title);
        html += '</div>';
      });
    }

    popover.innerHTML = html;

    // Position near click
    var rect = evt.currentTarget.getBoundingClientRect();
    var left = rect.right + 8;
    var top = rect.top;
    if (left + 300 > window.innerWidth) left = rect.left - 300;
    if (top + 300 > window.innerHeight) top = window.innerHeight - 310;

    popover.style.left = Math.max(8, left) + "px";
    popover.style.top = Math.max(8, top) + "px";
    popover.classList.add("active");

    // Close on outside click
    setTimeout(function () {
      document.addEventListener("click", function closer(e) {
        if (!popover.contains(e.target) && !e.target.closest(".cal-day")) {
          popover.classList.remove("active");
          document.removeEventListener("click", closer);
        }
      });
    }, 50);
  }

  return {
    init: init,
    render: render,
    prevMonth: prevMonth,
    nextMonth: nextMonth,
    showDay: showDay
  };
})();
