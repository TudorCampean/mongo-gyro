var _          = require('lodash');
var Promise = require('bluebird');

var EventEmitter   = require('events').EventEmitter;
var MongoClient    = require('mongodb').MongoClient;
var ObjectID = require('mongodb').ObjectID;

Promise.delay = function(ms) {
  var promise = new Promise(function(resolve, reject) {
    setTimeout(resolve, ms);
  });
  return promise;
};

Promise.promisifyAll(MongoClient);

// Takes url to a mongodb
var Mongo = module.exports = function(url, options) {
  this.options = options || {};

  this.client = MongoClient;
  this.url = url || "mongodb://localhost:27017";
  this._db = null;
  this.connection = "disconnected";
  this.reconnectTimeout = this.options.reconnectTimeout || 500;
};

Mongo.prototype = Object.create(EventEmitter.prototype);

_.extend(Mongo.prototype, {
  connect: Promise.method(function() {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] == 'function' && args.pop();

    return Promise
      .bind(this)
      .then(function() {
        if(this.connection === "connected") {
          callback && callback(null, this._db);
          return this._db;
        } else if(this.connection === "connecting") {
          return Promise.delay(this.reconnectTimeout)
            .bind(this)
            .then(function() {
              return this.connect(callback);
            });
        }

        this.connection = "connecting";
        return this.client.connectAsync(this.url, this.options)
          .bind(this)
          .then(function(db) {
            this._db = db;
            this.emit("connect", this.url);
            this.connection = "connected";
            this.setupEvents();
            callback && callback(null, db);
            return db;
          })
          .caught(function(err) {
            this.emit("error", err);
            this.connection = "disconnected";
            callback && callback(err);
            throw err;
          });
      });
  }),

  setupEvents: function() {
    this._db.setMaxListeners(100);
    this._db.on('close', function() {
      this.connected = false;
      this.emit("close", this.url);
    }.bind(this));

    this._db.on('reconnect', function() {
      this.connected = true;
      this.emit("reconnect", this.url);
    }.bind(this));
  },

  collection: Promise.method(function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] == 'function' && args.pop();

    return Promise
      .bind(this)
      .then(function() {
        if(this.connected) {
          callback && callback(null, this._db.collection(collectionName));
          return this._db;
        }

        return this.connect();
      })
      .then(function() {
        var collection = this._db.collection(collectionName);
        // gives promises to collection
        Promise.promisifyAll(collection);
        callback && callback(null, this._db);
        return collection;
      })
      .caught(function(err) {
        this.emit("error", err);
        if(callback) { callback(err); }
        throw err;
      });
  }),

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
  _cursor: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] == 'function' && args.pop();
    var options = args.length > 2 && typeof args[args.length - 1] == 'object' && args.pop();
    options = options || {};

    var cursor;
    if (options.fields) {
      var fields = options.fields;
      delete options.fields;
      cursor = this._db.collection(collectionName).find(query, fields, options);
    } else {
      cursor = this._db.collection(collectionName).find(query, options);
    }

    Promise.promisifyAll(cursor);

    callback && callback(null, cursor);
    return cursor;
  },

  // Find with a cursor, can pass in options.fields and get specific fields
  findCursor: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] == 'function' && args.pop();
    var options = args.length > 2 && typeof args[args.length - 1] == 'object' && args.pop();

    options = options || {};

    query = this.cast(query);

    return this.connect()
      .bind(this)
      .then(function() {
        return this._cursor(collectionName, query, options, callback);
      })
      .caught(function(err) {
        this.emit("error", err);
        if(callback) { callback(err); }
        throw err;
      });
  },

  // Count associated with findCursor
  count: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] == 'function' && args.pop();
    var options = args.length > 2 && typeof args[args.length - 1] == 'object' && args.pop();

    options = options || {};

    query = this.cast(query);

    return this.findCursor(collectionName, query, options)
      .bind(this)
      .then(function(cursor) {
        return cursor.countAsync();
      })
      .then(function(count) {
        callback && callback(null, count);
        return count;
      })
      .caught(function(err) {
        this.emit("error", err);
        if(callback) { callback(err); }
        throw err;
      });
  },

  // Find all docs matching query and turn into an array
  find: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] == 'function' && args.pop();
    var options = args.length > 2 && typeof args[args.length - 1] == 'object' && args.pop();

    options = options || {};

    query = this.cast(query);

    return this.connect()
      .bind(this)
      .then(function() {
        return this._cursor(collectionName, query, options);
      })
      .then(function(cursor) {
        return cursor.toArrayAsync();
      })
      .then(this.uncast)
      .then(function(obj) {
        callback && callback(null, obj);
        return obj;
      })
      .caught(function(err) {
        this.emit("error", err);
        if(callback) { callback(err); }
        throw err;
      });
  },

  // Find a single doc matching query
  findOne: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] == 'function' && args.pop();
    var options = args.length > 2 && typeof args[args.length - 1] == 'object' && args.pop();

    options = options || {};

    query = this.cast(query);
    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.findOneAsync(query, options);
      })
      .then(this.uncast)
      .then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .caught(function(err) {
        this.emit("error", err);
        if(callback) { callback(err); }
        throw err;
      });
  },

  // Insert a document (safe: true)
  insert: function(collectionName, obj) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] == 'function' && args.pop();
    var options = args.length > 2 && typeof args[args.length - 1] == 'object' && args.pop();

    obj = this.cast(obj);
    options = _.extend({ safe: true }, options || {}); // force safe mode

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.insertAsync(obj, options);
      })
      .then(this.uncast)
      .then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .caught(function(err) {
        this.emit("error", err);
        if(callback) { callback(err); }
        throw err;
      });
  },

  // Update one or more docs
  update: function(collectionName, query, obj) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] == 'function' && args.pop();
    var options = args.length > 3 && typeof args[args.length - 1] == 'object' && args.pop();


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
  findAndModify: function(collectionName, query, obj) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] == 'function' && args.pop();    
    var options = typeof args[args.length - 1] == 'object' && args.pop();
    var options = args.length > 3 && typeof args[args.length - 1] == 'object' && args.pop();

    query = this.cast(query);
    obj = this.cast(obj);
    options = _.extend({ new: true, safe: true }, options || {}); // force new mode, safe mode


    var sort = options.sort || {};
    delete options.sort;

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.findAndModifyAsync(query, sort, obj, options);
      })
      .then(function(response) {
        // mongodb gives the response as the object [0] and updateObject[1]
        response.pop(); // pop off updateObject

        // it could also be a multiupdate -- if it is, return response as array
        if(options.multi) {
          return this.uncast(response);
        } else {
        // if not, what eves
          return this.uncast(response[0]);
        }
      }).then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .caught(function(err) {
        this.emit("error", err);
        if(callback) { callback(err); }
        throw err;
      });
  },

  // Remove a document and returns count
  remove: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] == 'function' && args.pop();    
    var options = args.length > 2 && typeof args[args.length - 1] == 'object' && args.pop();

    query = this.cast(query);
    options = _.extend({ safe: true }, options || {}); // force new mode, safe mode

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.removeAsync(query, options);
      }).then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .caught(function(err) {
        this.emit("error", err);
        if(callback) { callback(err); }
        throw err;
      });
  },

  // Aggregate
  aggregate: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] == 'function' && args.pop();    
    var options = args.length > 2 && typeof args[args.length - 1] == 'object' && args.pop();
    options = options || {};

    query = this.cast(query);

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        // weird bug if options is empty, and undefined doesn't seem to work -- seems to either be mongo-node or the promisify framework ... 
        // since aggregate has a different set of options from everything else, it's probably default objects
        if(!_.isEmpty(options)) {
          return collection.aggregateAsync(query, options);
        } else {
          return collection.aggregateAsync(query);
        }
      })
      .then(this.uncast)
      .then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .caught(function(err) {
        this.emit("error", err);
        if(callback) { callback(err); }
        throw err;
      });
  },

  // Get next sequence for counter
  getNextSequence: function(collectionName, query) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] == 'function' && args.pop();
    var options = args.length > 2 && typeof args[args.length - 1] == 'object' && args.pop();

    query = this.cast(query);
    options = _.extend({ safe: true, new: true }, options || {}); 

    return this.findAndModify(collectionName, query, {"$inc": {seq: 1}}, options)
      .then(function(obj) {
        return obj.seq;
      }).then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .caught(function(err) {
        this.emit("error", err);
        if(callback) { callback(err); }
        throw err;
      });
  },

  // Indexes
  ensureIndex: function(collectionName, index) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] == 'function' && args.pop();

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        collection.ensureIndexAsync(index);
      }).then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .caught(function(err) {
        this.emit("error", err);
        if(callback) { callback(err); }
        throw err;
      });
  },

  // Erases all records from a collection, if any
  eraseCollection: function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] == 'function' && args.pop();

    return this.remove(collectionName, {})
      .then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .caught(function(err) {
        this.emit("error", err);
        if(callback) { callback(err); }
        throw err;
      });
  },


  dropIndexes: function(collectionName) {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] == 'function' && args.pop();

    return this.collection(collectionName)
      .bind(this)
      .then(function(collection) {
        return collection.dropIndexesAsync();
      }).then(function(data) {
        callback && callback(null, data);
        return data;
      })
      .caught(function(err) {
        this.emit("error", err);
        if(callback) { callback(err); }
        throw err;
      });
  }

});