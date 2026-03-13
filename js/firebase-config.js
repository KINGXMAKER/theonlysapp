/* ========================================
   Firebase Configuration & Firestore Helpers
   ======================================== */

var BBO_FB = (function () {
  "use strict";

  var FB_CONFIG_KEY = "bbo_firebase_config";
  var db = null;
  var _connected = false;
  var _listeners = {}; // collection -> unsubscribe functions

  /* --- Config Storage --- */
  function saveConfig(config) {
    localStorage.setItem(FB_CONFIG_KEY, JSON.stringify(config));
  }

  function loadConfig() {
    try {
      var stored = localStorage.getItem(FB_CONFIG_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (e) { return null; }
  }

  function isConnected() { return _connected; }

  /* --- Initialize Firebase --- */
  function init(config) {
    if (!config || !config.projectId) return false;
    try {
      // Check if already initialized
      if (firebase.apps && firebase.apps.length > 0) {
        firebase.app().delete().then(function () {
          _initApp(config);
        });
      } else {
        _initApp(config);
      }
      return true;
    } catch (e) {
      console.error("Firebase init error:", e);
      _connected = false;
      return false;
    }
  }

  function _initApp(config) {
    firebase.initializeApp(config);
    db = firebase.firestore();
    _connected = true;
    console.log("Firebase connected: " + config.projectId);
    // Dispatch event so other modules know
    window.dispatchEvent(new CustomEvent("firebase-ready"));
  }

  /* --- Auto-init on page load --- */
  function autoInit() {
    var config = loadConfig();
    if (config && config.projectId) {
      init(config);
      return true;
    }
    return false;
  }

  /* --- Firestore CRUD Helpers --- */

  // Add a document (auto ID)
  function fbAdd(collection, data) {
    if (!db) return Promise.reject(new Error("Firebase not connected"));
    data.created_at = firebase.firestore.FieldValue.serverTimestamp();
    return db.collection(collection).add(data).then(function (docRef) {
      return docRef.id;
    });
  }

  // Set a document with specific ID
  function fbSet(collection, id, data) {
    if (!db) return Promise.reject(new Error("Firebase not connected"));
    return db.collection(collection).doc(id).set(data, { merge: true });
  }

  // Update fields on a document
  function fbUpdate(collection, id, data) {
    if (!db) return Promise.reject(new Error("Firebase not connected"));
    data.updated_at = firebase.firestore.FieldValue.serverTimestamp();
    return db.collection(collection).doc(id).update(data);
  }

  // Delete a document
  function fbDelete(collection, id) {
    if (!db) return Promise.reject(new Error("Firebase not connected"));
    return db.collection(collection).doc(id).delete();
  }

  // Get all documents in a collection
  function fbGetAll(collection, orderBy, direction) {
    if (!db) return Promise.reject(new Error("Firebase not connected"));
    var ref = db.collection(collection);
    if (orderBy) ref = ref.orderBy(orderBy, direction || "desc");
    return ref.get().then(function (snapshot) {
      var results = [];
      snapshot.forEach(function (doc) {
        var data = doc.data();
        data._id = doc.id;
        // Convert Firestore timestamps to ISO strings
        if (data.created_at && data.created_at.toDate) {
          data.created_at = data.created_at.toDate().toISOString();
        }
        if (data.updated_at && data.updated_at.toDate) {
          data.updated_at = data.updated_at.toDate().toISOString();
        }
        results.push(data);
      });
      return results;
    });
  }

  // Get a single document
  function fbGet(collection, id) {
    if (!db) return Promise.reject(new Error("Firebase not connected"));
    return db.collection(collection).doc(id).get().then(function (doc) {
      if (!doc.exists) return null;
      var data = doc.data();
      data._id = doc.id;
      if (data.created_at && data.created_at.toDate) {
        data.created_at = data.created_at.toDate().toISOString();
      }
      return data;
    });
  }

  // Real-time listener on a collection
  function fbOnSnapshot(collection, callback, orderBy, direction) {
    if (!db) return function () { };
    // Unsubscribe previous listener for this collection
    if (_listeners[collection]) {
      _listeners[collection]();
    }
    var ref = db.collection(collection);
    if (orderBy) ref = ref.orderBy(orderBy, direction || "desc");

    var unsub = ref.onSnapshot(function (snapshot) {
      var results = [];
      snapshot.forEach(function (doc) {
        var data = doc.data();
        data._id = doc.id;
        if (data.created_at && data.created_at.toDate) {
          data.created_at = data.created_at.toDate().toISOString();
        }
        if (data.updated_at && data.updated_at.toDate) {
          data.updated_at = data.updated_at.toDate().toISOString();
        }
        results.push(data);
      });
      callback(results);
    });

    _listeners[collection] = unsub;
    return unsub;
  }

  // Test connection by reading a doc
  function testConnection() {
    if (!db) return Promise.reject(new Error("Firebase not initialized"));
    return db.collection("_health").doc("ping").set({ t: Date.now() })
      .then(function () { return true; })
      .catch(function () { return false; });
  }

  /* --- Migration: localStorage → Firestore --- */
  function migrateTasks() {
    if (!db) return Promise.resolve(0);
    var MIGRATE_FLAG = "bbo_tasks_migrated";
    if (localStorage.getItem(MIGRATE_FLAG)) return Promise.resolve(0);

    try {
      var stored = localStorage.getItem("bbo_tasks");
      var tasks = stored ? JSON.parse(stored) : [];
      if (tasks.length === 0) return Promise.resolve(0);

      var batch = db.batch();
      var count = 0;
      tasks.forEach(function (t) {
        var ref = db.collection("tasks").doc(t.id || BBO_FB._genId());
        batch.set(ref, t);
        count++;
      });

      return batch.commit().then(function () {
        localStorage.setItem(MIGRATE_FLAG, "true");
        console.log("Migrated " + count + " tasks to Firestore");
        return count;
      });
    } catch (e) {
      console.error("Migration error:", e);
      return Promise.resolve(0);
    }
  }

  function _genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* --- Public API --- */
  return {
    saveConfig: saveConfig,
    loadConfig: loadConfig,
    init: init,
    autoInit: autoInit,
    isConnected: isConnected,
    add: fbAdd,
    set: fbSet,
    update: fbUpdate,
    del: fbDelete,
    getAll: fbGetAll,
    get: fbGet,
    onSnapshot: fbOnSnapshot,
    testConnection: testConnection,
    migrateTasks: migrateTasks,
    _genId: _genId
  };
})();
