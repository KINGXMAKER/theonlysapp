/* ========================================
   Tasks Module — Kanban Board
   ======================================== */

var BBO_TASKS = (function () {
  "use strict";

  var PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
  var editingId = null;
  var draggedId = null;

  /* --- DOM refs (set in init) --- */
  var modalOverlay, modalTitle, fieldTitle, fieldDesc, fieldPriority, fieldStatus,
    fieldDue, fieldLabel, fieldAmbassador, fieldLink, btnDelete,
    searchInput, filterAmbassador, filterPriority, filterLabel, sortBy;

  /* --- Data Access --- */
  function tasks() { return BBO_APP.tasks; }

  function saveTasks() {
    if (BBO_FB.isConnected()) {
      // Firestore is the source of truth; individual ops handle saves
      return;
    }
    localStorage.setItem("bbo_tasks", JSON.stringify(BBO_APP.tasks));
  }

  function loadTasks() {
    if (BBO_FB.isConnected()) {
      return BBO_FB.getAll("tasks", "created_at", "desc").then(function (data) {
        // Normalize IDs
        data.forEach(function (t) { if (!t.id && t._id) t.id = t._id; });
        BBO_APP.setTasks(data);
        render();
      });
    }
    try {
      var stored = localStorage.getItem("bbo_tasks");
      BBO_APP.setTasks(stored ? JSON.parse(stored) : []);
    } catch (e) { BBO_APP.setTasks([]); }
    return Promise.resolve();
  }

  /* --- Firestore task ops --- */
  function addTask(taskData) {
    if (BBO_FB.isConnected()) {
      return BBO_FB.add("tasks", taskData).then(function (id) {
        taskData._id = id;
        taskData.id = id;
        BBO_APP.tasks.push(taskData);
        render();
        return id;
      });
    }
    taskData.id = BBO_APP.genId();
    BBO_APP.tasks.push(taskData);
    saveTasks();
    render();
    return Promise.resolve(taskData.id);
  }

  function updateTask(id, updates) {
    // Update local
    for (var i = 0; i < BBO_APP.tasks.length; i++) {
      if (BBO_APP.tasks[i].id === id || BBO_APP.tasks[i]._id === id) {
        Object.assign(BBO_APP.tasks[i], updates);
        break;
      }
    }
    if (BBO_FB.isConnected()) {
      var fbId = id;
      return BBO_FB.update("tasks", fbId, updates).then(function () { render(); });
    }
    saveTasks();
    render();
    return Promise.resolve();
  }

  function deleteTaskById(id) {
    BBO_APP.setTasks(BBO_APP.tasks.filter(function (t) { return t.id !== id && t._id !== id; }));
    if (BBO_FB.isConnected()) {
      return BBO_FB.del("tasks", id).then(function () { render(); });
    }
    saveTasks();
    render();
    return Promise.resolve();
  }

  /* --- Stats --- */
  function updateStats() {
    var total = BBO_APP.tasks.length;
    var overdue = BBO_APP.tasks.filter(BBO_APP.isOverdue).length;
    var done = BBO_APP.tasks.filter(function (t) { return t.status === "done"; }).length;
    var el1 = document.getElementById("stat-total");
    var el2 = document.getElementById("stat-overdue");
    var el3 = document.getElementById("stat-done");
    if (el1) el1.textContent = total;
    if (el2) el2.textContent = overdue;
    if (el3) el3.textContent = done;
  }

  /* --- Filter & Sort --- */
  function getFiltered() {
    var filtered = BBO_APP.tasks.slice();
    var search = searchInput ? searchInput.value.toLowerCase().trim() : "";
    var ambF = filterAmbassador ? filterAmbassador.value : "";
    var priF = filterPriority ? filterPriority.value : "";
    var lblF = filterLabel ? filterLabel.value : "";
    var sort = sortBy ? sortBy.value : "";

    if (search) {
      filtered = filtered.filter(function (t) {
        return t.title.toLowerCase().indexOf(search) !== -1 ||
          (t.description && t.description.toLowerCase().indexOf(search) !== -1);
      });
    }
    if (ambF) filtered = filtered.filter(function (t) { return t.ambassador === ambF; });
    if (priF) filtered = filtered.filter(function (t) { return t.priority === priF; });
    if (lblF) filtered = filtered.filter(function (t) { return t.label === lblF; });

    if (sort === "due-asc") filtered.sort(function (a, b) { return (a.due || "9999") > (b.due || "9999") ? 1 : -1; });
    else if (sort === "due-desc") filtered.sort(function (a, b) { return (b.due || "") > (a.due || "") ? 1 : -1; });
    else if (sort === "priority") filtered.sort(function (a, b) { return (PRIORITY_ORDER[a.priority] || 1) - (PRIORITY_ORDER[b.priority] || 1); });
    return filtered;
  }

  /* --- Render Board --- */
  function render() {
    var filtered = getFiltered();
    var columns = { todo: [], "in-progress": [], done: [] };
    filtered.forEach(function (t) { if (columns[t.status]) columns[t.status].push(t); });

    ["todo", "in-progress", "done"].forEach(function (status) {
      var body = document.getElementById("body-" + status);
      var count = document.getElementById("count-" + status);
      if (!body || !count) return;
      var col = columns[status];
      count.textContent = col.length;

      if (col.length === 0) {
        body.innerHTML = '<div class="empty-state">No tasks here yet</div>';
        return;
      }

      body.innerHTML = col.map(function (t) {
        var overdue = BBO_APP.isOverdue(t);
        var dateStr = t.due ? BBO_APP.formatDate(t.due) : "";
        var tid = t.id || t._id;
        var linkHtml = t.link
          ? '<a href="' + BBO_APP.escapeHtml(t.link) + '" target="_blank" rel="noopener" class="task-link-icon" title="Open link" onclick="event.stopPropagation()">&#128279;</a>'
          : "";

        return '<div class="task-card" draggable="true" data-id="' + tid + '">' +
          '<div class="task-top">' +
          '<span class="task-title" onclick="BBO_TASKS.editTask(\'' + tid + '\')">' + BBO_APP.escapeHtml(t.title) + '</span>' +
          '<span class="priority-badge ' + t.priority + '">' + t.priority + '</span>' +
          '</div>' +
          '<div class="task-meta">' +
          (dateStr ? '<span class="task-date' + (overdue ? " overdue" : "") + '">' + (overdue ? "&#9888; " : "") + dateStr + '</span>' : '') +
          '<span class="task-label label-' + t.label + '">' + t.label + '</span>' +
          linkHtml +
          (t.ambassador ? '<span class="task-ambassador">' + BBO_APP.escapeHtml(t.ambassador) + '</span>' : '') +
          '</div></div>';
      }).join("");

      // Attach drag events
      var cards = body.querySelectorAll(".task-card");
      for (var i = 0; i < cards.length; i++) {
        cards[i].addEventListener("dragstart", handleDragStart);
        cards[i].addEventListener("dragend", handleDragEnd);
      }
    });

    updateStats();
  }

  /* --- Drag & Drop (Desktop) --- */
  function handleDragStart(e) {
    draggedId = e.currentTarget.dataset.id;
    e.currentTarget.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", draggedId);
  }

  function handleDragEnd(e) {
    e.currentTarget.classList.remove("dragging");
    var cols = document.querySelectorAll(".column");
    for (var i = 0; i < cols.length; i++) cols[i].classList.remove("drag-over");
    draggedId = null;
  }

  function initDragDrop() {
    var bodies = document.querySelectorAll(".column-body");
    for (var i = 0; i < bodies.length; i++) {
      (function (body) {
        body.addEventListener("dragover", function (e) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          body.closest(".column").classList.add("drag-over");
        });
        body.addEventListener("dragleave", function (e) {
          if (!body.contains(e.relatedTarget)) body.closest(".column").classList.remove("drag-over");
        });
        body.addEventListener("drop", function (e) {
          e.preventDefault();
          var col = body.closest(".column");
          col.classList.remove("drag-over");
          var newStatus = col.dataset.status;
          var id = e.dataTransfer.getData("text/plain");
          updateTask(id, { status: newStatus });
        });
      })(bodies[i]);
    }

    // Touch drag support
    var touchDragId = null, touchClone = null, touchOX = 0, touchOY = 0;

    document.addEventListener("touchstart", function (e) {
      var card = e.target.closest(".task-card");
      if (!card) return;
      card._tt = setTimeout(function () {
        touchDragId = card.dataset.id;
        card.classList.add("dragging");
        touchClone = card.cloneNode(true);
        touchClone.style.cssText = "position:fixed;width:" + card.offsetWidth + "px;pointer-events:none;z-index:9999;opacity:0.85;transform:rotate(2deg)";
        document.body.appendChild(touchClone);
        var t = e.touches[0], r = card.getBoundingClientRect();
        touchOX = t.clientX - r.left; touchOY = t.clientY - r.top;
        touchClone.style.left = (t.clientX - touchOX) + "px";
        touchClone.style.top = (t.clientY - touchOY) + "px";
      }, 400);
    }, { passive: true });

    document.addEventListener("touchmove", function (e) {
      var card = e.target.closest(".task-card");
      if (card && card._tt && !touchDragId) clearTimeout(card._tt);
      if (!touchDragId || !touchClone) return;
      e.preventDefault();
      var t = e.touches[0];
      touchClone.style.left = (t.clientX - touchOX) + "px";
      touchClone.style.top = (t.clientY - touchOY) + "px";
      var cols = document.querySelectorAll(".column");
      for (var i = 0; i < cols.length; i++) {
        var r = cols[i].getBoundingClientRect();
        cols[i].classList.toggle("drag-over", t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom);
      }
    }, { passive: false });

    document.addEventListener("touchend", function (e) {
      var card = e.target.closest(".task-card");
      if (card && card._tt) clearTimeout(card._tt);
      if (!touchDragId) return;
      if (touchClone) { document.body.removeChild(touchClone); touchClone = null; }
      var t = e.changedTouches[0], target = null;
      var cols = document.querySelectorAll(".column");
      for (var i = 0; i < cols.length; i++) {
        cols[i].classList.remove("drag-over");
        var r = cols[i].getBoundingClientRect();
        if (t.clientX >= r.left && t.clientX <= r.right && t.clientY >= r.top && t.clientY <= r.bottom) target = cols[i];
      }
      if (target) updateTask(touchDragId, { status: target.dataset.status });
      touchDragId = null;
      render();
    });
  }

  /* --- Modal --- */
  function openModal(task) {
    if (task) {
      editingId = task.id || task._id;
      modalTitle.textContent = "EDIT TASK";
      fieldTitle.value = task.title;
      fieldDesc.value = task.description || "";
      fieldPriority.value = task.priority;
      fieldStatus.value = task.status;
      fieldDue.value = task.due || "";
      fieldLabel.value = task.label;
      fieldAmbassador.value = task.ambassador || "";
      fieldLink.value = task.link || "";
      btnDelete.style.display = "inline-block";
    } else {
      editingId = null;
      modalTitle.textContent = "ADD TASK";
      fieldTitle.value = ""; fieldDesc.value = ""; fieldPriority.value = "medium";
      fieldStatus.value = "todo"; fieldDue.value = ""; fieldLabel.value = "content";
      fieldAmbassador.value = ""; fieldLink.value = "";
      btnDelete.style.display = "none";
    }
    modalOverlay.classList.add("active");
    setTimeout(function () { fieldTitle.focus(); }, 100);
  }

  function closeModal() { modalOverlay.classList.remove("active"); editingId = null; }

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
      label: fieldLabel.value,
      ambassador: fieldAmbassador.value,
      link: fieldLink.value.trim()
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
    deleteTaskById(editingId);
    closeModal();
  }

  /* --- Public: edit task by ID --- */
  function editTask(id) {
    var task = null;
    for (var i = 0; i < BBO_APP.tasks.length; i++) {
      if (BBO_APP.tasks[i].id === id || BBO_APP.tasks[i]._id === id) { task = BBO_APP.tasks[i]; break; }
    }
    if (task) openModal(task);
  }

  /* --- Populate label filter dropdown --- */
  function populateLabelDropdown() {
    if (!filterLabel) return;
    filterLabel.innerHTML = '<option value="">All Categories</option>';
    BBO_APP.LABELS.forEach(function (l) {
      filterLabel.innerHTML += '<option value="' + l + '">' + l.charAt(0).toUpperCase() + l.slice(1) + '</option>';
    });
  }

  /* --- Init --- */
  function init() {
    modalOverlay = document.getElementById("modal-overlay");
    modalTitle = document.getElementById("modal-title");
    fieldTitle = document.getElementById("task-title");
    fieldDesc = document.getElementById("task-desc");
    fieldPriority = document.getElementById("task-priority");
    fieldStatus = document.getElementById("task-status");
    fieldDue = document.getElementById("task-due");
    fieldLabel = document.getElementById("task-label");
    fieldAmbassador = document.getElementById("task-ambassador");
    fieldLink = document.getElementById("task-link");
    btnDelete = document.getElementById("btn-delete");
    searchInput = document.getElementById("search");
    filterAmbassador = document.getElementById("filter-ambassador");
    filterPriority = document.getElementById("filter-priority");
    filterLabel = document.getElementById("filter-label");
    sortBy = document.getElementById("sort-by");

    // Populate dropdowns
    populateLabelDropdown();
    BBO_APP.populateAmbassadorSelect(filterAmbassador, true);
    BBO_APP.populateAmbassadorSelect(fieldAmbassador, false);

    // Event listeners
    document.getElementById("btn-add-task").addEventListener("click", function () { openModal(null); });
    document.getElementById("btn-save").addEventListener("click", saveFromModal);
    document.getElementById("btn-cancel").addEventListener("click", closeModal);
    document.getElementById("modal-close").addEventListener("click", closeModal);
    btnDelete.addEventListener("click", deleteFromModal);
    modalOverlay.addEventListener("click", function (e) { if (e.target === modalOverlay) closeModal(); });

    if (searchInput) searchInput.addEventListener("input", render);
    if (filterAmbassador) filterAmbassador.addEventListener("change", render);
    if (filterPriority) filterPriority.addEventListener("change", render);
    if (filterLabel) filterLabel.addEventListener("change", render);
    if (sortBy) sortBy.addEventListener("change", render);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && modalOverlay.classList.contains("active") && e.target.tagName !== "TEXTAREA") {
        e.preventDefault(); saveFromModal();
      }
    });

    initDragDrop();

    // Load data
    loadTasks();

    // Listen for Firebase ready to reload
    window.addEventListener("firebase-ready", function () {
      loadTasks();
    });
  }

  return {
    init: init,
    render: render,
    editTask: editTask,
    addTask: addTask,
    updateTask: updateTask,
    loadTasks: loadTasks,
    openModal: openModal
  };
})();
