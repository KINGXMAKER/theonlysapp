/* ========================================
   My Tasks Module — Personal Command Center
   ======================================== */

var BBO_MYTASKS = (function () {
  "use strict";

  var STORAGE_KEY = "bbo_mytasks";
  var COLLECTION = "mytasks";
  var PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };
  var STATUSES = ["not-started", "in-progress", "done", "blocked"];
  var CATEGORIES = ["content", "event", "outreach", "promo", "merch", "admin", "tech", "finance", "personal"];

  var tasks = [];
  var editingId = null;

  /* --- DOM refs --- */
  var modalOverlay, modalTitle, fieldTitle, fieldDesc, fieldPriority, fieldStatus,
    fieldDue, fieldCategory, fieldOwner, fieldNotes, btnDelete,
    searchInput, filterPriority, filterStatus, filterOwner, filterCategory, sortSelect;

  /* --- Data Persistence --- */
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

    if (BBO_FB.isConnected()) {
      return BBO_FB.add(COLLECTION, data).then(function (id) {
        data._id = id;
        data.id = id;
        tasks.push(data);
        render();
        return id;
      });
    }
    data.id = BBO_APP.genId();
    tasks.push(data);
    save();
    render();
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
    save();
    render();
    return Promise.resolve();
  }

  function deleteTask(id) {
    tasks = tasks.filter(function (t) { return t.id !== id && t._id !== id; });
    if (BBO_FB.isConnected()) {
      return BBO_FB.del(COLLECTION, id).then(function () { render(); });
    }
    save();
    render();
    return Promise.resolve();
  }

  /* --- Helpers --- */
  function todayStr() { return BBO_APP.todayStr(); }

  function isOverdue(t) {
    if (!t.due || t.status === "done") return false;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(t.due + "T00:00:00") < today;
  }

  function isDueToday(t) {
    if (!t.due || t.status === "done") return false;
    return t.due === todayStr();
  }

  /* --- Owner Management --- */
  function getOwners() {
    var owners = ["King Maker"];
    // Pull assistant names from ambassadors list
    BBO_APP.ambassadors.forEach(function (a) {
      if (owners.indexOf(a) === -1) owners.push(a);
    });
    // Also pull any unique owners already in tasks
    tasks.forEach(function (t) {
      if (t.owner && owners.indexOf(t.owner) === -1) owners.push(t.owner);
    });
    return owners;
  }

  function populateOwnerDropdowns() {
    var owners = getOwners();
    [filterOwner, fieldOwner].forEach(function (sel) {
      if (!sel) return;
      var current = sel.value;
      var isFilter = sel === filterOwner;
      sel.innerHTML = isFilter ? '<option value="">All Owners</option>' : '';
      owners.forEach(function (o) {
        sel.innerHTML += '<option value="' + BBO_APP.escapeHtml(o) + '">' + BBO_APP.escapeHtml(o) + '</option>';
      });
      sel.value = current;
    });
  }

  /* --- Dashboard --- */
  function updateDashboard() {
    var active = tasks.filter(function (t) { return t.status !== "done"; });
    var urgent = active.filter(function (t) { return t.priority === "urgent"; }).length;
    var overdue = active.filter(isOverdue).length;
    var dueToday = active.filter(isDueToday).length;

    var el1 = document.getElementById("mt-urgent-count");
    var el2 = document.getElementById("mt-overdue-count");
    var el3 = document.getElementById("mt-today-count");
    var el4 = document.getElementById("mt-total-count");
    if (el1) el1.textContent = urgent;
    if (el2) el2.textContent = overdue;
    if (el3) el3.textContent = dueToday;
    if (el4) el4.textContent = active.length;
  }

  /* --- Filter & Sort --- */
  function getFiltered() {
    var filtered = tasks.slice();
    var search = searchInput ? searchInput.value.toLowerCase().trim() : "";
    var priF = filterPriority ? filterPriority.value : "";
    var staF = filterStatus ? filterStatus.value : "";
    var ownF = filterOwner ? filterOwner.value : "";
    var catF = filterCategory ? filterCategory.value : "";
    var sort = sortSelect ? sortSelect.value : "newest";

    if (search) {
      filtered = filtered.filter(function (t) {
        return (t.title || "").toLowerCase().indexOf(search) !== -1 ||
          (t.description || "").toLowerCase().indexOf(search) !== -1 ||
          (t.notes || "").toLowerCase().indexOf(search) !== -1 ||
          (t.owner || "").toLowerCase().indexOf(search) !== -1;
      });
    }
    if (priF) filtered = filtered.filter(function (t) { return t.priority === priF; });
    if (staF) filtered = filtered.filter(function (t) { return t.status === staF; });
    if (ownF) filtered = filtered.filter(function (t) { return t.owner === ownF; });
    if (catF) filtered = filtered.filter(function (t) { return t.category === catF; });

    if (sort === "newest") {
      filtered.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
    } else if (sort === "due-soonest") {
      filtered.sort(function (a, b) { return (a.due || "9999") > (b.due || "9999") ? 1 : -1; });
    } else if (sort === "priority") {
      filtered.sort(function (a, b) {
        return (PRIORITY_ORDER[a.priority] || 2) - (PRIORITY_ORDER[b.priority] || 2);
      });
    }

    return filtered;
  }

  /* --- Render --- */
  function render() {
    updateDashboard();
    populateOwnerDropdowns();

    var filtered = getFiltered();
    var container = document.getElementById("mt-cards");
    if (!container) return;

    if (filtered.length === 0) {
      container.innerHTML = '<div class="mt-empty">' +
        '<div class="mt-empty-icon">&#128203;</div>' +
        '<p>' + (tasks.length === 0 ? 'No tasks yet — add your first one' : 'No tasks match your filters') + '</p>' +
        '</div>';
      return;
    }

    container.innerHTML = filtered.map(function (t) {
      var tid = t.id || t._id;
      var overdue = isOverdue(t);
      var dueToday = isDueToday(t);
      var dateStr = t.due ? BBO_APP.formatDate(t.due) : "";
      var esc = BBO_APP.escapeHtml;

      // Status classes
      var statusClass = "mt-status-" + t.status;
      var statusLabel = { "not-started": "Not Started", "in-progress": "In Progress", "done": "Done", "blocked": "Blocked" }[t.status] || t.status;

      // Priority class
      var priClass = "mt-pri-" + t.priority;

      // Date display
      var dateHtml = "";
      if (dateStr) {
        var dateClass = "mt-card-date";
        if (overdue) dateClass += " overdue";
        else if (dueToday) dateClass += " today";
        dateHtml = '<span class="' + dateClass + '">' + (overdue ? "&#9888; " : dueToday ? "&#128197; " : "") + dateStr + '</span>';
      }

      // Updated time
      var updatedStr = t.updated_at ? BBO_APP.formatDateTime(t.updated_at) : "";

      return '<div class="mt-card ' + (overdue ? "mt-card-overdue" : "") + ' ' + (t.status === "done" ? "mt-card-done" : "") + '" onclick="BBO_MYTASKS.edit(\'' + tid + '\')">' +
        '<div class="mt-card-top">' +
          '<span class="mt-card-title">' + esc(t.title) + '</span>' +
          '<span class="mt-pri-badge ' + priClass + '">' + esc(t.priority) + '</span>' +
        '</div>' +
        '<div class="mt-card-row">' +
          '<span class="mt-status-badge ' + statusClass + '">' + statusLabel + '</span>' +
          (t.category ? '<span class="mt-card-cat label-' + t.category + '">' + esc(t.category) + '</span>' : '') +
          dateHtml +
        '</div>' +
        (t.description ? '<p class="mt-card-desc">' + esc(t.description).substring(0, 120) + (t.description.length > 120 ? "..." : "") + '</p>' : '') +
        '<div class="mt-card-bottom">' +
          (t.owner ? '<span class="mt-card-owner">&#128100; ' + esc(t.owner) + '</span>' : '') +
          (updatedStr ? '<span class="mt-card-time">' + updatedStr + '</span>' : '') +
        '</div>' +
      '</div>';
    }).join("");
  }

  /* --- Modal --- */
  function openModal(task) {
    if (task) {
      editingId = task.id || task._id;
      modalTitle.textContent = "EDIT TASK";
      fieldTitle.value = task.title || "";
      fieldDesc.value = task.description || "";
      fieldPriority.value = task.priority || "medium";
      fieldStatus.value = task.status || "not-started";
      fieldDue.value = task.due || "";
      fieldCategory.value = task.category || "admin";
      fieldOwner.value = task.owner || "King Maker";
      fieldNotes.value = task.notes || "";
      btnDelete.style.display = "inline-block";
    } else {
      editingId = null;
      modalTitle.textContent = "ADD TASK";
      fieldTitle.value = "";
      fieldDesc.value = "";
      fieldPriority.value = "medium";
      fieldStatus.value = "not-started";
      fieldDue.value = "";
      fieldCategory.value = "admin";
      fieldOwner.value = "King Maker";
      fieldNotes.value = "";
      btnDelete.style.display = "none";
    }
    populateOwnerDropdowns();
    if (task && task.owner) fieldOwner.value = task.owner;
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
      fieldTitle.style.borderColor = "var(--high)";
      fieldTitle.focus();
      setTimeout(function () { fieldTitle.style.borderColor = ""; }, 1500);
      return;
    }

    var data = {
      title: title,
      description: fieldDesc.value.trim(),
      priority: fieldPriority.value,
      status: fieldStatus.value,
      due: fieldDue.value,
      category: fieldCategory.value,
      owner: fieldOwner.value,
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
    fieldDesc = document.getElementById("mt-desc");
    fieldPriority = document.getElementById("mt-priority");
    fieldStatus = document.getElementById("mt-status");
    fieldDue = document.getElementById("mt-due");
    fieldCategory = document.getElementById("mt-category");
    fieldOwner = document.getElementById("mt-owner");
    fieldNotes = document.getElementById("mt-notes");
    btnDelete = document.getElementById("mt-btn-delete");
    searchInput = document.getElementById("mt-search");
    filterPriority = document.getElementById("mt-filter-priority");
    filterStatus = document.getElementById("mt-filter-status");
    filterOwner = document.getElementById("mt-filter-owner");
    filterCategory = document.getElementById("mt-filter-category");
    sortSelect = document.getElementById("mt-sort");

    // Event listeners
    document.getElementById("btn-add-mytask").addEventListener("click", function () { openModal(null); });
    document.getElementById("mt-btn-save").addEventListener("click", saveFromModal);
    document.getElementById("mt-btn-cancel").addEventListener("click", closeModal);
    document.getElementById("mt-modal-close").addEventListener("click", closeModal);
    btnDelete.addEventListener("click", deleteFromModal);
    modalOverlay.addEventListener("click", function (e) { if (e.target === modalOverlay) closeModal(); });

    if (searchInput) searchInput.addEventListener("input", render);
    if (filterPriority) filterPriority.addEventListener("change", render);
    if (filterStatus) filterStatus.addEventListener("change", render);
    if (filterOwner) filterOwner.addEventListener("change", render);
    if (filterCategory) filterCategory.addEventListener("change", render);
    if (sortSelect) sortSelect.addEventListener("change", render);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && modalOverlay.classList.contains("active") && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        saveFromModal();
      }
    });

    // Load data
    load();

    // Firebase ready
    window.addEventListener("firebase-ready", function () {
      load();
    });
  }

  return {
    init: init,
    render: render,
    edit: edit,
    openModal: openModal,
    addTask: addTask,
    updateTask: updateTask
  };
})();
