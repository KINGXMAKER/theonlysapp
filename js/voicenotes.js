/* ========================================
   Voice Notes Inbox — Record, Upload, Playback, AI Stubs
   ======================================== */

var BBO_VOICENOTES = (function () {
  "use strict";

  var STORAGE_KEY = "bbo_voicenotes";
  var COLLECTION = "voicenotes";
  var IDB_NAME = "bbo_voicenotes_audio";
  var IDB_STORE = "blobs";
  var IDB_VERSION = 1;

  var notes = [];
  var editingId = null;
  var idbReady = false;
  var idb = null;

  /* Recording state */
  var mediaRecorder = null;
  var recordingChunks = [];
  var recordingStartTime = 0;
  var recordingTimer = null;
  var isRecording = false;
  var isPaused = false;

  /* DOM refs */
  var modalOverlay, modalTitle, fieldTitle, fieldTags, fieldAssistant, fieldNotes,
    fieldTranscript, fieldSummary, fieldActions, btnDelete, btnTranscribe,
    btnSummarize, btnExtract, searchInput, filterTag, sortSelect,
    recordBtn, uploadBtn, recordingIndicator, recordingTime, pauseBtn, stopBtn;

  /* --- IndexedDB for Audio Blobs --- */
  function openIDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = function (e) {
        idb = e.target.result;
        idbReady = true;
        resolve(idb);
      };
      req.onerror = function () { reject(req.error); };
    });
  }

  function saveAudioBlob(id, blob) {
    return new Promise(function (resolve, reject) {
      if (!idb) return reject(new Error("IDB not ready"));
      var tx = idb.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(blob, id);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function getAudioBlob(id) {
    return new Promise(function (resolve, reject) {
      if (!idb) return reject(new Error("IDB not ready"));
      var tx = idb.transaction(IDB_STORE, "readonly");
      var req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function deleteAudioBlob(id) {
    return new Promise(function (resolve, reject) {
      if (!idb) return reject(new Error("IDB not ready"));
      var tx = idb.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  /* --- Metadata Persistence --- */
  function save() {
    if (BBO_FB.isConnected()) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }

  function load() {
    if (BBO_FB.isConnected()) {
      return BBO_FB.getAll(COLLECTION, "recorded_at", "desc").then(function (data) {
        data.forEach(function (n) { if (!n.id && n._id) n.id = n._id; });
        notes = data;
        render();
      });
    }
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      notes = stored ? JSON.parse(stored) : [];
    } catch (e) { notes = []; }
    render();
    return Promise.resolve();
  }

  /* --- CRUD (metadata) --- */
  function addNote(data) {
    data.recorded_at = data.recorded_at || new Date().toISOString();
    data.updated_at = data.recorded_at;

    if (BBO_FB.isConnected()) {
      return BBO_FB.add(COLLECTION, data).then(function (id) {
        data._id = id;
        data.id = id;
        notes.push(data);
        render();
        return id;
      });
    }
    data.id = BBO_APP.genId();
    notes.push(data);
    save();
    render();
    return Promise.resolve(data.id);
  }

  function updateNote(id, updates) {
    updates.updated_at = new Date().toISOString();
    for (var i = 0; i < notes.length; i++) {
      if (notes[i].id === id || notes[i]._id === id) {
        Object.assign(notes[i], updates);
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

  function deleteNote(id) {
    notes = notes.filter(function (n) { return n.id !== id && n._id !== id; });
    deleteAudioBlob(id).catch(function () { });
    if (BBO_FB.isConnected()) {
      return BBO_FB.del(COLLECTION, id).then(function () { render(); });
    }
    save();
    render();
    return Promise.resolve();
  }

  /* --- Helpers --- */
  function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return "0:00";
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function getAllTags() {
    var tags = {};
    notes.forEach(function (n) {
      if (n.tags) {
        n.tags.split(",").forEach(function (t) {
          var trimmed = t.trim().toLowerCase();
          if (trimmed) tags[trimmed] = true;
        });
      }
    });
    return Object.keys(tags).sort();
  }

  function populateTagFilter() {
    if (!filterTag) return;
    var current = filterTag.value;
    filterTag.innerHTML = '<option value="">All Tags</option>';
    getAllTags().forEach(function (t) {
      filterTag.innerHTML += '<option value="' + BBO_APP.escapeHtml(t) + '">' + BBO_APP.escapeHtml(t) + '</option>';
    });
    filterTag.value = current;
  }

  /* --- Recording --- */
  function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Your browser doesn't support audio recording.");
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      recordingChunks = [];
      mediaRecorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });

      mediaRecorder.ondataavailable = function (e) {
        if (e.data.size > 0) recordingChunks.push(e.data);
      };

      mediaRecorder.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        var blob = new Blob(recordingChunks, { type: mediaRecorder.mimeType });
        var duration = Math.round((Date.now() - recordingStartTime) / 1000);
        finishRecording(blob, duration);
      };

      mediaRecorder.start(250);
      isRecording = true;
      isPaused = false;
      recordingStartTime = Date.now();
      showRecordingUI();
      startTimer();
    }).catch(function (err) {
      console.error("Mic access denied:", err);
      alert("Microphone access denied. Please allow mic access and try again.");
    });
  }

  function getSupportedMimeType() {
    var types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    for (var i = 0; i < types.length; i++) {
      if (MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return "";
  }

  function pauseRecording() {
    if (!mediaRecorder || !isRecording) return;
    if (isPaused) {
      mediaRecorder.resume();
      isPaused = false;
      pauseBtn.textContent = "Pause";
      pauseBtn.classList.remove("vn-paused");
    } else {
      mediaRecorder.pause();
      isPaused = true;
      pauseBtn.textContent = "Resume";
      pauseBtn.classList.add("vn-paused");
    }
  }

  function stopRecording() {
    if (!mediaRecorder || !isRecording) return;
    isRecording = false;
    isPaused = false;
    clearInterval(recordingTimer);
    mediaRecorder.stop();
    hideRecordingUI();
  }

  function showRecordingUI() {
    recordBtn.style.display = "none";
    uploadBtn.style.display = "none";
    recordingIndicator.style.display = "flex";
  }

  function hideRecordingUI() {
    recordBtn.style.display = "";
    uploadBtn.style.display = "";
    recordingIndicator.style.display = "none";
    if (recordingTime) recordingTime.textContent = "0:00";
  }

  function startTimer() {
    if (recordingTime) recordingTime.textContent = "0:00";
    recordingTimer = setInterval(function () {
      if (isPaused) return;
      var elapsed = Math.round((Date.now() - recordingStartTime) / 1000);
      if (recordingTime) recordingTime.textContent = formatDuration(elapsed);
    }, 500);
  }

  function finishRecording(blob, duration) {
    var id = BBO_APP.genId();
    var now = new Date();
    var data = {
      title: "Voice Note — " + now.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        " " + now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      recorded_at: now.toISOString(),
      duration: duration,
      mime_type: blob.type,
      tags: "",
      assistant: "",
      notes: "",
      transcript: "",
      summary: "",
      action_items: "",
      has_audio: true
    };

    saveAudioBlob(id, blob).then(function () {
      return addNote(data);
    }).then(function (noteId) {
      // If Firebase assigned a different ID, re-save blob under that ID
      if (noteId !== id) {
        saveAudioBlob(noteId, blob).then(function () {
          deleteAudioBlob(id);
        });
      }
    });
  }

  /* --- File Upload --- */
  function handleUpload() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*";
    input.onchange = function () {
      if (!input.files || !input.files[0]) return;
      var file = input.files[0];
      var id = BBO_APP.genId();
      var now = new Date();

      // Get duration from audio element
      var tempUrl = URL.createObjectURL(file);
      var tempAudio = new Audio(tempUrl);
      tempAudio.addEventListener("loadedmetadata", function () {
        var duration = Math.round(tempAudio.duration);
        URL.revokeObjectURL(tempUrl);

        var data = {
          title: file.name.replace(/\.[^.]+$/, ""),
          recorded_at: now.toISOString(),
          duration: duration,
          mime_type: file.type,
          tags: "",
          assistant: "",
          notes: "",
          transcript: "",
          summary: "",
          action_items: "",
          has_audio: true
        };

        saveAudioBlob(id, file).then(function () {
          return addNote(data);
        }).then(function (noteId) {
          if (noteId !== id) {
            saveAudioBlob(noteId, file).then(function () {
              deleteAudioBlob(id);
            });
          }
        });
      });
      tempAudio.addEventListener("error", function () {
        URL.revokeObjectURL(tempUrl);
        alert("Could not read audio file. Try a different format.");
      });
    };
    input.click();
  }

  /* --- Filter & Sort --- */
  function getFiltered() {
    var filtered = notes.slice();
    var search = searchInput ? searchInput.value.toLowerCase().trim() : "";
    var tagF = filterTag ? filterTag.value : "";
    var sort = sortSelect ? sortSelect.value : "newest";

    if (search) {
      filtered = filtered.filter(function (n) {
        return (n.title || "").toLowerCase().indexOf(search) !== -1 ||
          (n.tags || "").toLowerCase().indexOf(search) !== -1 ||
          (n.notes || "").toLowerCase().indexOf(search) !== -1 ||
          (n.transcript || "").toLowerCase().indexOf(search) !== -1 ||
          (n.assistant || "").toLowerCase().indexOf(search) !== -1;
      });
    }
    if (tagF) {
      filtered = filtered.filter(function (n) {
        var ntags = (n.tags || "").toLowerCase().split(",").map(function (t) { return t.trim(); });
        return ntags.indexOf(tagF) !== -1;
      });
    }

    if (sort === "newest") {
      filtered.sort(function (a, b) { return new Date(b.recorded_at) - new Date(a.recorded_at); });
    } else if (sort === "oldest") {
      filtered.sort(function (a, b) { return new Date(a.recorded_at) - new Date(b.recorded_at); });
    } else if (sort === "longest") {
      filtered.sort(function (a, b) { return (b.duration || 0) - (a.duration || 0); });
    }

    return filtered;
  }

  /* --- Render --- */
  function render() {
    populateTagFilter();
    var filtered = getFiltered();
    var container = document.getElementById("vn-cards");
    if (!container) return;

    // Update count
    var countEl = document.getElementById("vn-count");
    if (countEl) countEl.textContent = notes.length;

    if (filtered.length === 0) {
      container.innerHTML = '<div class="vn-empty">' +
        '<div class="vn-empty-icon">&#127908;</div>' +
        '<p>' + (notes.length === 0 ? 'No voice notes yet — hit record or upload' : 'No notes match your filters') + '</p>' +
        '</div>';
      return;
    }

    container.innerHTML = filtered.map(function (n) {
      var nid = n.id || n._id;
      var esc = BBO_APP.escapeHtml;
      var dateStr = n.recorded_at ? BBO_APP.formatDateTime(n.recorded_at) : "";
      var durStr = formatDuration(n.duration);

      var tagsHtml = "";
      if (n.tags) {
        tagsHtml = n.tags.split(",").map(function (t) {
          var trimmed = t.trim();
          return trimmed ? '<span class="vn-tag">' + esc(trimmed) + '</span>' : '';
        }).join("");
      }

      return '<div class="vn-card" data-id="' + nid + '">' +
        '<div class="vn-card-top">' +
          '<span class="vn-card-title" onclick="BBO_VOICENOTES.edit(\'' + nid + '\')">' + esc(n.title) + '</span>' +
          '<span class="vn-card-dur">' + durStr + '</span>' +
        '</div>' +
        '<div class="vn-card-player" id="vn-player-' + nid + '">' +
          '<button class="vn-play-btn" onclick="BBO_VOICENOTES.play(\'' + nid + '\')">&#9654;</button>' +
          '<div class="vn-player-placeholder">Load audio to play</div>' +
        '</div>' +
        '<div class="vn-card-meta">' +
          '<span class="vn-card-date">' + dateStr + '</span>' +
          (n.assistant ? '<span class="vn-card-assistant">&#128100; ' + esc(n.assistant) + '</span>' : '') +
        '</div>' +
        (tagsHtml ? '<div class="vn-card-tags">' + tagsHtml + '</div>' : '') +
        (n.transcript ? '<div class="vn-card-transcript"><strong>Transcript:</strong> ' + esc(n.transcript).substring(0, 100) + (n.transcript.length > 100 ? "..." : "") + '</div>' : '') +
        '<div class="vn-card-actions">' +
          '<button class="vn-ai-btn" onclick="event.stopPropagation();BBO_VOICENOTES.aiAction(\'transcribe\',\'' + nid + '\')" title="Transcribe">&#128221; Transcribe</button>' +
          '<button class="vn-ai-btn" onclick="event.stopPropagation();BBO_VOICENOTES.aiAction(\'summarize\',\'' + nid + '\')" title="Summarize">&#128200; Summarize</button>' +
          '<button class="vn-ai-btn" onclick="event.stopPropagation();BBO_VOICENOTES.aiAction(\'tasks\',\'' + nid + '\')" title="Extract Tasks">&#9745; Tasks</button>' +
        '</div>' +
      '</div>';
    }).join("");
  }

  /* --- Playback --- */
  function play(id) {
    var playerEl = document.getElementById("vn-player-" + id);
    if (!playerEl) return;

    // Check if audio element already exists
    var existing = playerEl.querySelector("audio");
    if (existing) {
      if (existing.paused) existing.play();
      else existing.pause();
      return;
    }

    getAudioBlob(id).then(function (blob) {
      if (!blob) {
        playerEl.querySelector(".vn-player-placeholder").textContent = "Audio not found";
        return;
      }
      var url = URL.createObjectURL(blob);
      var audio = document.createElement("audio");
      audio.controls = true;
      audio.src = url;
      audio.style.cssText = "width:100%;height:36px;";
      audio.addEventListener("ended", function () {
        var btn = playerEl.querySelector(".vn-play-btn");
        if (btn) btn.textContent = "\u25B6";
      });

      // Replace placeholder with real player
      playerEl.innerHTML = "";
      playerEl.appendChild(audio);
      audio.play();
    }).catch(function () {
      playerEl.querySelector(".vn-player-placeholder").textContent = "Error loading audio";
    });
  }

  /* --- AI Stubs --- */
  function aiAction(action, id) {
    var note = null;
    for (var i = 0; i < notes.length; i++) {
      if (notes[i].id === id || notes[i]._id === id) { note = notes[i]; break; }
    }
    if (!note) return;

    var key = localStorage.getItem("bbo_openrouter_key");
    if (!key) {
      alert("Set your OpenRouter API key in Settings first.");
      return;
    }

    if (action === "transcribe") {
      alert("Transcription coming soon — will connect to OpenRouter Whisper / speech-to-text when ready.\n\nFor now, you can manually type the transcript by editing this note.");
      edit(id);
    } else if (action === "summarize") {
      if (!note.transcript) {
        alert("Transcribe the note first, then summarize.");
        return;
      }
      aiSummarize(id, note);
    } else if (action === "tasks") {
      if (!note.transcript) {
        alert("Transcribe the note first, then extract tasks.");
        return;
      }
      aiExtractTasks(id, note);
    }
  }

  function aiSummarize(id, note) {
    var model = localStorage.getItem("bbo_openrouter_model") || "deepseek/deepseek-chat-v3-0324:free";
    var key = localStorage.getItem("bbo_openrouter_key");
    var prompt = "Summarize this voice note transcript in 2-3 concise bullet points. " +
      "Keep it actionable. No fluff.\n\nTranscript:\n" + note.transcript;

    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500
      })
    }).then(function (r) { return r.json(); }).then(function (data) {
      var text = data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : "";
      if (text) {
        updateNote(id, { summary: text.trim() });
        alert("Summary saved!");
      } else {
        alert("AI returned empty response. Try again.");
      }
    }).catch(function (err) {
      console.error("AI summarize error:", err);
      alert("AI request failed: " + err.message);
    });
  }

  function aiExtractTasks(id, note) {
    var model = localStorage.getItem("bbo_openrouter_model") || "deepseek/deepseek-chat-v3-0324:free";
    var key = localStorage.getItem("bbo_openrouter_key");
    var prompt = "Extract action items from this voice note transcript. " +
      "Return them as a numbered list. Be specific and concise.\n\nTranscript:\n" + note.transcript;

    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({
        model: model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500
      })
    }).then(function (r) { return r.json(); }).then(function (data) {
      var text = data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : "";
      if (text) {
        updateNote(id, { action_items: text.trim() });
        alert("Action items extracted and saved!");
      } else {
        alert("AI returned empty response. Try again.");
      }
    }).catch(function (err) {
      console.error("AI extract error:", err);
      alert("AI request failed: " + err.message);
    });
  }

  /* --- Modal --- */
  function openModal(note) {
    if (note) {
      editingId = note.id || note._id;
      modalTitle.textContent = "EDIT VOICE NOTE";
      fieldTitle.value = note.title || "";
      fieldTags.value = note.tags || "";
      fieldAssistant.value = note.assistant || "";
      fieldNotes.value = note.notes || "";
      fieldTranscript.value = note.transcript || "";
      fieldSummary.value = note.summary || "";
      fieldActions.value = note.action_items || "";
      btnDelete.style.display = "inline-block";
    } else {
      editingId = null;
      modalTitle.textContent = "NEW VOICE NOTE";
      fieldTitle.value = "";
      fieldTags.value = "";
      fieldAssistant.value = "";
      fieldNotes.value = "";
      fieldTranscript.value = "";
      fieldSummary.value = "";
      fieldActions.value = "";
      btnDelete.style.display = "none";
    }
    // Populate assistant dropdown
    BBO_APP.populateAmbassadorSelect(fieldAssistant, false);
    if (note && note.assistant) fieldAssistant.value = note.assistant;
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
      tags: fieldTags.value.trim(),
      assistant: fieldAssistant.value,
      notes: fieldNotes.value.trim(),
      transcript: fieldTranscript.value.trim(),
      summary: fieldSummary.value.trim(),
      action_items: fieldActions.value.trim()
    };

    if (editingId) {
      updateNote(editingId, data);
    } else {
      data.recorded_at = new Date().toISOString();
      data.duration = 0;
      data.has_audio = false;
      addNote(data);
    }
    closeModal();
  }

  function deleteFromModal() {
    if (!editingId || !confirm("Delete this voice note?")) return;
    deleteNote(editingId);
    closeModal();
  }

  function edit(id) {
    var note = null;
    for (var i = 0; i < notes.length; i++) {
      if (notes[i].id === id || notes[i]._id === id) { note = notes[i]; break; }
    }
    if (note) openModal(note);
  }

  /* --- Init --- */
  function init() {
    modalOverlay = document.getElementById("vn-modal-overlay");
    modalTitle = document.getElementById("vn-modal-title");
    fieldTitle = document.getElementById("vn-title");
    fieldTags = document.getElementById("vn-tags");
    fieldAssistant = document.getElementById("vn-assistant");
    fieldNotes = document.getElementById("vn-notes");
    fieldTranscript = document.getElementById("vn-transcript");
    fieldSummary = document.getElementById("vn-summary");
    fieldActions = document.getElementById("vn-actions");
    btnDelete = document.getElementById("vn-btn-delete");
    searchInput = document.getElementById("vn-search");
    filterTag = document.getElementById("vn-filter-tag");
    sortSelect = document.getElementById("vn-sort");
    recordBtn = document.getElementById("vn-record-btn");
    uploadBtn = document.getElementById("vn-upload-btn");
    recordingIndicator = document.getElementById("vn-recording-indicator");
    recordingTime = document.getElementById("vn-recording-time");
    pauseBtn = document.getElementById("vn-pause-btn");
    stopBtn = document.getElementById("vn-stop-btn");

    // Events
    recordBtn.addEventListener("click", startRecording);
    uploadBtn.addEventListener("click", handleUpload);
    pauseBtn.addEventListener("click", pauseRecording);
    stopBtn.addEventListener("click", stopRecording);

    document.getElementById("vn-btn-save").addEventListener("click", saveFromModal);
    document.getElementById("vn-btn-cancel").addEventListener("click", closeModal);
    document.getElementById("vn-modal-close").addEventListener("click", closeModal);
    btnDelete.addEventListener("click", deleteFromModal);
    modalOverlay.addEventListener("click", function (e) { if (e.target === modalOverlay) closeModal(); });

    if (searchInput) searchInput.addEventListener("input", render);
    if (filterTag) filterTag.addEventListener("change", render);
    if (sortSelect) sortSelect.addEventListener("change", render);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && modalOverlay.classList.contains("active") && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        saveFromModal();
      }
    });

    // Open IndexedDB then load data
    openIDB().then(function () {
      load();
    }).catch(function (err) {
      console.error("IndexedDB error:", err);
      load();
    });

    // Firebase ready
    window.addEventListener("firebase-ready", function () {
      load();
    });
  }

  return {
    init: init,
    render: render,
    edit: edit,
    play: play,
    aiAction: aiAction
  };
})();
