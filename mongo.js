var _          = require('lodash');
var Promise = require('bluebird/js/main/promise')();

var MongoClient    = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;

Promise.delay = function(ms) {
  var promise = new Promise();
  setTimeout(promise.resolve, ms);
  return promise;
};

Promise.promisifyAll(MongoClient);

// Takes url to a mongodb
var Mongo = module.exports = function(url, options) {
  options || (options = {});

  this.client = MongoClient;
  this.url = url || "mongodb://localhost:27017";
  this._db = null;
  this.reconnectTimeout = options.reconnectTimeout || 5000;
  this.connected = false;
};

_.extend(Mongo.prototype, {
  connect: Promise.method(function() {
    return Promise.bind(this)
      .then(function() {
        if(this.connected) {
          return this._db;
        }

        return this.client.connectAsync(this.url);
      })
      .then(function(db) {
        this._db = db;
        this.connected = true;
        this.setupEvents();
        return db;
      })
      .catch(function(err) {
        console.error(err);
        if (err !== null) throw err;
        this._db = null;
        this.connected = false;
        return Promise.delay(this.reconnectTimeout)
          .bind(this)
          .then(function() {
            console.log("Attempting to reconnect to mongodb: ", this.url);
            return this.connect();
          });
      });
  }),

  setupEvents: function() {
    this._db.on('close', function() {
      this.connected = false;
    }.bind(this));

    this._db.on('reconnect', function() {
      this.connected = true;
    }.bind(this));
  },

  collection: function(collectionName) {
    return this.connect()
      .bind(this)
      .then(function() {
        var collection = this._db.collection(collectionName);
        Promise.promisifyAll(collection);
        return collection;
      });
  },

  isValidObjectID: function(id) {
    var checkForHexRegExp = new RegExp("^[0-9a-fA-F]{24}$");
    return (typeof id === 'string') && id.length === 24 && checkForHexRegExp.test(id);
  },

  // Automatic casting to ObjectID
  cast: function(obj) {
    _.each(obj, function(val, key) {
      if (_.isString(val)) {
        if (this.isValidObjectID(val)) {
          obj[key] = ObjectID(val);
        }
      } else if (_.isObject(val)) {
        if (val['$oid']) {
          obj[key] = val['$oid'];
        } else {
          return this.cast(val);
        }
      } else {
        return;
      }
    }.bind(this));

    return obj;
  },

  uncast: function(obj) {
    _.each(obj, function(val, key) {
      if (val && _.isFunction(val.toHexString)) {
        obj[key] = val.toHexString();
      } else if (_.isObject(val)) {
        if (val['$oid']) {
          obj[key] = val['$oid'];
        } else {
          return this.uncast(val);
        }
      } else {
        return;
      }
    }.bind(this));

    return obj;
  },

  // generate a new object id
  newId: function() {
    return new ObjectID().toHexString();
  },

  // retrieve the cursor
  _cursor: function(collectionName, query, options) {
    var cursor;
    options = options || {};
    if (options.fields) {
      var fields = options.fields;
      delete options.fields;
      cursor = this._db.collection(collectionName).find(query, fields, options);
    } else {
      cursor = this._db.collection(collectionName).find(query, options);
    }

    Promise.promisifyAll(cursor);

    return cursor;
  },

  // Find with a cursor, can pass in options.fields and get specific fields
  findCursor: function(collectionName, query, options) {
    query = this.cast(query);

    return this.connect()
      .bind(this)
      .then(function() {
        return this._cursor(collectionName, query, options);
      });
  },

  // Count associated with findCursor
  count: function(collectionName, query, options, callback) {
    query = this.cast(query);
    options = options || {};

    return this.findCursor(collectionName, query, options)
      .then(function(cursor) {
        return cursor.countAsync();
      });
  },

  // Find all docs matching query and turn into an array
  find: function(collectionName, query, options) {
    query = this.cast(query);

    return this.connect()
      .bind(this)
      .then(function() {
        return this._cursor(collectionName, query, options);
      }).then(function(cursor) {
        return cursor.toArrayAsync();
      });
  },

  // Find a single doc matching query
  findOne: function(collectionName, query) {
    query = this.cast(query);

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.findOneAsync(query);
      })
      .then(function(object) {
        // this comes back as a singular, but we always expect an array
        object = this.uncast([object]);
        return object;
      });
  },

  // Insert a document (safe: true)
  insert: function(collectionName, obj, options) {
    obj = this.cast(obj);
    options = _.extend({ safe: true }, options || {}); // force safe mode

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.insertAsync(obj, options);
      })
      .then(function(object) {
        object = this.uncast(object);
        return object;
      });
  },

  // Update one or more docs
  update: function(collectionName, query, obj, options) {
    query = this.cast(query);
    obj = this.cast(obj);
    options = _.extend({ safe: true }, options || {}); // force safe mode

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.updateAsync(query, obj, options);
      });
  },

  // Update and return one doc
  findAndModify: function(collectionName, query, obj, options) {
    query = this.cast(query);
    obj = this.cast(obj);

    var sort = options.sort || {};
    delete options.sort;

    options = _.extend({ new: true, safe: true }, options || {}); // force new mode, safe mode
    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.findAndModifyAsync(query, sort, obj, options);
      })
      .then(function(object) {
        object = this.uncast(object);
        return object;
      });
  },

  // Remove a document and returns count
  remove: function(collectionName, query, options) {
    query = this.cast(query);
    options = _.extend({ safe: true }, options || {}); // force new mode, safe mode

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.removeAsync(query, options);
      });
  },

  // Aggregate
  aggregate: function(collectionName, query) {
    query = this.cast(query);

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.aggregateAsync(query);
      })
      .then(function(object) {
        object = this.uncast(object);
        return object;
      });
  },

  // Erases all records from a collection, if any
  eraseCollection: function(collectionName) {
    return this.remove(collectionName, {});
  },

  // Get next sequence for counter
  getNextSequence: function(collectionName, query) {
    query = this.cast(query);

    return this.findAndModify(collectionName, query, {"$inc": {seq: 1}}, {new: true})
      .then(function(obj) {
        return obj.seq;
      });
  },

  // Indexes
  ensureIndex: function(collectionName, index) {
    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        collection.ensureIndexAsync(index);
      });
  },

  dropIndexes: function(collectionName, callback) {
    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.dropIndexesAsync(callback);
      });
  }

});