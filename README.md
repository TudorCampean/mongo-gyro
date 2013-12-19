mongo-gyro
==========

Mongo-Gyro is a light-weight mongo wrapper for nodejs.  We found that the official mongo driver and alternatives were a little odd to use in practice (callback hell or unusual modeling).  Mongo-Gyro takes the official mongo-native driver for nodejs and makes it unsuck.

It supports both callbacks and promises -- it will callback first and then return the promise.  It casts and uncasts from strings to ObjectIds and back again automagically so you never have to worry about casting again.  Our ultimate goal is to make Mongo fun to work with.

We've also incorporated into our fork of Bookshelf, making it easy to use either SQL or Mongo using the same ORM modeled on Backbone.  (docs pending)


*See MongoDB docs for "options" for different calls, and also syntax of objects for update, findAndModify and aggregate calls*


## Setup
```
  npm install mongo-gyro
```

or add this to your package.json

```
  "mongo-gyro": "*"
```

and `npm install`


## Creating an instance

```
  var Mongo = require('mongo-gyro');

  var mongo = new Mongo(); // defaults to localhost:27017

  // or

  var url = "mongodb://[username:password@]host1[:port1][,host2[:port2],...[,hostN[:portN]]][/[database][?options]]"; // see http://docs.mongodb.org/manual/reference/connection-string/
  var mongo = new Mongo(url, [options]); // options here are connection options for mongodb
```

## Methods

All calls take a callback as the last parameter OR return a promise.  The promise library used is bluebird.

#### Example using a callback

```
  mongo.find("users", { "email": "spam@gmail.com"}, function(err, object) {
    if(err) {
      console.log(err);
    } else {
      console.log(object);
    }
  });
```

#### Example using a promise:
```
  mongo.find("users", { "email": "spam@gmail.com"})
    .then(function(object) {
      console.log(object);
    })
    .caught(function(err) { // if there is an error
      console.log(err);
    });
```


### Find

`mongo.find(collectionName, query, [options], [callback]);`

Options can specify sort, limit, skip, fields, and other find options.  Other options are specified in the MongoDB docs.

```
  mongo.find("users", { "email": "spam@gmail.com"});
```

```
  mongo.find("users", { "email": "spam@gmail.com"}, { "sort": { "email": -1 }, "limit": 1, "skip": 1, "fields": { "name": true, "email": true, "_id": true } });
```


### findCursor

Same as find, but you get the cursor back. Recommended for advanced users and only when needed.


### findOne

`mongo.findOne(collectionName, query, [options], [callback]);`

```
  mongo.findOne("users", { "email": "spam@gmail.com"});
```


### insert

`mongo.insert(collectionName, object, [options], [callback]);`

```
  mongo.insert("users", { "email": "spam@gmail.com", "name": "Billy Testestest"});
```


### update

Mongo's update doesn't actually bring back very much information.  We've found that it's almost always preferable for us to use findAndModify, but in some cases update is adequate.

`mongo.update(collectionName, query, object, [options], [callback]);`

```
  mongo.update("users", { "email": "spam@gmail.com" }, { "$set": { "name": "Willy Testestest" } });
```


### findAndModify

`mongo.findAndModify(collectionName, query, object, [options], [callback]);`

```
  mongo.findAndModify("users", { "email": "spam@gmail.com" }, { "$set": { "name": "Willy Testestest" } });
```


### remove

`mongo.remove(collectionName, query, [options], [callback]);`

```
  mongo.remove("users", { "email": "spam@gmail.com" });
```

### aggregate 


### aggregate

`mongo.aggregate(collectionName, pipeline, [options], [callback]);`

```
  mongo.aggregate("users", 
      { 
        "$match": { 
          "email": "spam@gmail.com" 
        } 
      },
      {
        "$project": { "email": 1, "total": 1 }
      },
      {
        "$group": {
          _id: "$email",
          revenue: {
            "$sum": "$total"
          }
        }
      });
```


### getNextSequence

-- This is a special helper for us.  Specifying { "upsert": true } in the options will create it if it doesn't exist (recommended).  Returns the next number in a sequence by incrementing the key "seq" in an object.

`mongo.getNextSequence(collectionName, query, [options], [callback]);`

```
  mongo.getNextSequence("users_counter", { "name": "number_of_users" });
```


### eraseCollection

Danger -- you probably don't want to put this in your code unless you are a sadomasochist.

`mongo.eraseCollection(collectionName, [callback]);`

```
  mongo.eraseCollection("users"); // and you definitely don't want this in your code unless its in a unit test
```


### ensureIndex

Doesn't return anything.

`mongo.ensureIndex(collectionName, index, [options], [callback]);`

```
  mongo.ensureIndex("users", "name");
  
  mongo.ensureIndex("users", "email", {"unique": true}); // for uniqueness
```


### dropIndexes

Removes all the indexes on a collection

`mongo.dropIndexes(collectionName, [callback]);`

```
  mongo.dropIndexes("users");
```