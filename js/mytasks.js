/* ========================================
   My Tasks — Simple Task List
   ======================================== */

var BBO_MYTASKS = (function () {
  "use strict";

  var STORAGE_KEY = "bbo_mytasks";
  var COLLECTION = "mytasks";
  var tasks = [];
  var editingId = null;

  /* DOM refs */
  var modalOverlay, modalTitle, fieldTitle, fieldNotes, btnDelete, searchInput;

  /* --- Persistence --- */
  function save() {
    if (BBO_FB.isConnected()) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  function load() {
    if (BBO_FB.isConnected()) {
      return BBO_FB.getAll(COLLECTION, "created_at", "desc").then(function (data) {
        data.forEach(function (t) { if (!t.id && t._id) t.id = t._id; });
        tasks = data;
        render();
      });
    }
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      tasks = stored ? JSON.parse(stored) : [];
    } catch (e) { tasks = []; }
    render();
    return Promise.resolve();
  }

  /* --- CRUD --- */
  function addTask(data) {
    data.created_at = new Date().toISOString();
    data.updated_at = data.created_at;
    data.done = false;

    if (BBO_FB.isConnected()) {
      return BBO_FB.add(COLLECTION, data).then(function (id) {
        data._id = id; data.id = id;
        tasks.unshift(data);
        render();
        return id;
      });
    }
    data.id = BBO_APP.genId();
    tasks.unshift(data);
    save(); render();
    return Promise.resolve(data.id);
  }

  function updateTask(id, updates) {
    updates.updated_at = new Date().toISOString();
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id || tasks[i]._id === id) {
        Object.assign(tasks[i], updates);
        break;
      }
    }
    if (BBO_FB.isConnected()) {
      return BBO_FB.update(COLLECTION, id, updates).then(function () { render(); });
    }
    save(); render();
    return Promise.resolve();
  }

  function deleteTask(id) {
    tasks = tasks.filter(function (t) { return t.id !== id && t._id !== id; });
    if (BBO_FB.isConnected()) {
      return BBO_FB.del(COLLECTION, id).then(function () { render(); });
    }
    save(); render();
    return Promise.resolve();
  }

  function toggleDone(id) {
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id || tasks[i]._id === id) {
        updateTask(id, { done: !tasks[i].done });
        return;
      }
    }
  }

  /* --- Filter --- */
  function getFiltered() {
    var search = searchInput ? searchInput.value.toLowerCase().trim() : "";
    var filtered = tasks.slice();
    if (search) {
      filtered = filtered.filter(function (t) {
        return (t.title || "").toLowerCase().indexOf(search) !== -1 ||
          (t.notes || "").toLowerCase().indexOf(search) !== -1;
      });
    }
    // Active first, then done
    var active = filtered.filter(function (t) { return !t.done; });
    var done = filtered.filter(function (t) { return t.done; });
    return active.concat(done);
  }

  /* --- Render --- */
  function render() {
    var filtered = getFiltered();
    var container = document.getElementById("mt-cards");
    if (!container) return;

    var activeCount = tasks.filter(function (t) { return !t.done; }).length;
    var doneCount = tasks.filter(function (t) { return t.done; }).length;

    if (filtered.length === 0) {
      container.innerHTML = '<div class="mt-empty">' +
        '<p>' + (tasks.length === 0 ? 'No tasks yet \u2014 tap + Add Task' : 'No results') + '</p>' +
        '</div>';
      return;
    }

    var html = '';

    // Count header
    html += '<div class="mt-count-bar">' +
      '<span>' + activeCount + ' active</span>' +
      (doneCount > 0 ? '<span class="mt-done-count">' + doneCount + ' done</span>' : '') +
    '</div>';

    html += filtered.map(function (t) {
      var tid = t.id || t._id;
      var esc = BBO_APP.escapeHtml;
      var doneClass = t.done ? " mt-item-done" : "";
      var timeStr = t.updated_at ? BBO_APP.formatDateTime(t.updated_at) : "";
      var notesPreview = t.notes ? esc(t.notes).substring(0, 80) + (t.notes.length > 80 ? "..." : "") : "";

      return '<div class="mt-item' + doneClass + '">' +
        '<div class="mt-item-check" onclick="BBO_MYTASKS.toggleDone(\'' + tid + '\')">' +
          (t.done ? '&#9745;' : '&#9744;') +
        '</div>' +
        '<div class="mt-item-content" onclick="BBO_MYTASKS.edit(\'' + tid + '\')">' +
          '<div class="mt-item-title">' + esc(t.title) + '</div>' +
          (notesPreview ? '<div class="mt-item-notes">' + notesPreview + '</div>' : '') +
          (timeStr ? '<div class="mt-item-time">' + timeStr + '</div>' : '') +
        '</div>' +
      '</div>';
    }).join("");

    container.innerHTML = html;
  }

  /* --- Email Export --- */
  function emailTasks() {
    var active = tasks.filter(function (t) { return !t.done; });
    if (active.length === 0) {
      alert("No active tasks to send.");
      return;
    }

    var subject = "BBO Command Center \u2014 Active Tasks";
    var body = "ACTIVE TASKS (" + active.length + ")\n";
    body += "========================\n\n";

    active.forEach(function (t, i) {
      body += (i + 1) + ". " + t.title + "\n";
      if (t.notes) body += "   Notes: " + t.notes + "\n";
      body += "\n";
    });

    body += "---\nSent from BBO Command Center";

    window.location.href = "mailto:?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
  }

  /* --- Modal --- */
  function openModal(task) {
    if (task) {
      editingId = task.id || task._id;
      modalTitle.textContent = "EDIT TASK";
      fieldTitle.value = task.title || "";
      fieldNotes.value = task.notes || "";
      btnDelete.style.display = "inline-block";
    } else {
      editingId = null;
      modalTitle.textContent = "ADD TASK";
      fieldTitle.value = "";
      fieldNotes.value = "";
      btnDelete.style.display = "none";
    }
    modalOverlay.classList.add("active");
    setTimeout(function () { fieldTitle.focus(); }, 100);
  }

  function closeModal() {
    modalOverlay.classList.remove("active");
    editingId = null;
  }

  function saveFromModal() {
    var title = fieldTitle.value.trim();
    if (!title) {
      fieldTitle.style.borderColor = "var(--pink)";
      fieldTitle.focus();
      setTimeout(function () { fieldTitle.style.borderColor = ""; }, 1500);
      return;
    }

    var data = {
      title: title,
      notes: fieldNotes.value.trim()
    };

    if (editingId) {
      updateTask(editingId, data);
    } else {
      addTask(data);
    }
    closeModal();
  }

  function deleteFromModal() {
    if (!editingId || !confirm("Delete this task?")) return;
    deleteTask(editingId);
    closeModal();
  }

  function edit(id) {
    var task = null;
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id || tasks[i]._id === id) { task = tasks[i]; break; }
    }
    if (task) openModal(task);
  }

  /* --- Init --- */
  function init() {
    modalOverlay = document.getElementById("mt-modal-overlay");
    modalTitle = document.getElementById("mt-modal-title");
    fieldTitle = document.getElementById("mt-title");
    fieldNotes = document.getElementById("mt-notes");
    btnDelete = document.getElementById("mt-btn-delete");
    searchInput = document.getElementById("mt-search");

    document.getElementById("btn-add-mytask").addEventListener("click", function () { openModal(null); });
    document.getElementById("mt-btn-save").addEventListener("click", saveFromModal);
    document.getElementById("mt-btn-cancel").addEventListener("click", closeModal);
    document.getElementById("mt-modal-close").addEventListener("click", closeModal);
    btnDelete.addEventListener("click", deleteFromModal);
    modalOverlay.addEventListener("click", function (e) { if (e.target === modalOverlay) closeModal(); });

    var emailBtn = document.getElementById("btn-email-tasks");
    if (emailBtn) emailBtn.addEventListener("click", emailTasks);

    if (searchInput) searchInput.addEventListener("input", render);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && modalOverlay.classList.contains("active") && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        saveFromModal();
      }
    });

    load();

    window.addEventListener("firebase-ready", function () { load(); });
  }

  return {
    init: init,
    render: render,
    edit: edit,
    openModal: openModal,
    toggleDone: toggleDone,
    addTask: addTask,
    updateTask: updateTask
  };
})();
