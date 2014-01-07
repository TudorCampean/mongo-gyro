var Promise = require('bluebird');

global.testPromise = Promise;

process.stderr.on('data', function(data) {
  console.log(data);
});

if (process.argv.pop() === 'test/index.js') {
  var mocha     = require('mocha');
  require("mocha-as-promised")(mocha);
} else {
  require("mocha-as-promised")();
}

var ObjectID = require('mongodb').ObjectID;

var chai = global.chai = require("chai");
chai.use(require("chai-as-promised"));
chai.use(require("sinon-chai"));
chai.should();

var _ = require('lodash');


global.expect         = chai.expect;
global.AssertionError = chai.AssertionError;
global.Assertion      = chai.Assertion;
global.assert         = chai.assert;


var Mongo = require('../mongo');

var testData = {
  "name": "1234" 
};

var testTable = "test-mongo-gyro";

describe("Mongo", function() {
  it("should be able to create a new instance", function() {
    expect(new Mongo()).to.be.ok;
  });

  it("that new instance should have a localhost url by default", function() {
    expect(new Mongo().url).to.equal("mongodb://localhost:27017");
  })

  it("should be able to emit and receive events", function() {
    var mongo = new Mongo();
    var deferred = Promise.defer();
    mongo.on("test", function(data) { 
      expect(data.name).to.equal(testData.name);
      deferred.fulfill();
    });
    mongo.emit("test", testData);
    return deferred.promise;
  });

  it("should be able to connect to a mongodb", function() {
    var mongo = new Mongo();

    return mongo.connect(function(err, db) { // callback test
        expect(err).to.be.null;
        expect(db).to.be.ok;
      })
      .then(function(db)  { // promise test
        expect(db).to.be.ok;
      });
  });

  it("should be able to take a url as then first parameter", function() {
    var url = "mongo://localhost:27017/test";
    var mongo = new Mongo(url);

    expect(mongo.url).to.equal(url);
  });

  var mongo = new Mongo();


  before(function() {
    return mongo.remove(testTable, {})
      .then(function() {
        return mongo.insert(testTable, _.clone(testData));
      });
  });

  describe("#collection", function() {
    it("should have a collection", function() {
      return mongo.collection("test", 
        function(err, collection) { //callback test
          expect(collection).to.be.ok;
        })
        .then(function(collection) { //promise test
          expect(collection).to.be.ok;
        });
    });
  });

  describe("ObjectID manipulation", function() {
    it("should be able to create a new objectid", function() {
      expect(mongo.newId()).to.be.ok;
      expect(mongo.isValidObjectID(mongo.newId())).to.be.ok;
    });

    it("should be able to determine if something is a valid objectid", function() {
      expect(mongo.isValidObjectID(mongo.newId().toString())).to.be.ok;
    });

    it("should be able to determine if something is an invalid objectid", function() {
      expect(mongo.isValidObjectID("123")).to.be.not.ok;
    });

    it("should be able to cast to object ids", function() {
      var obj = { "_id": mongo.newId().toString() };
      obj = mongo.cast(obj);
      expect(typeof obj._id).to.equal(typeof new ObjectID());
    });

    it("should be able to uncast from object ids", function() {
      var obj = { "_id": mongo.newId() };
      obj = mongo.cast(obj);

      obj = mongo.uncast(obj);
      expect(typeof obj._id).to.equal("string");
    });
  });

  // these all return arrays
  describe("finders", function () {
    it("should be able to find test data", function() {
      return mongo.find(testTable, {"name": "1234"}, 
        function(err, obj) { // callback test
          expect(err).to.be.null;
          expect(mongo.isValidObjectID(obj[0]._id)).to.be.ok;
          expect(obj[0].name).to.equal(testData.name);
        })
        .then(function(obj) { // promise test
          expect(mongo.isValidObjectID(obj[0]._id)).to.be.ok;
          expect(obj[0].name).to.equal(testData.name);
        });
    });

    it("should be able to find test data with a sort in options", function() {
      var creation_date = new Date().getTime();

      return mongo.insert(testTable, {"name": "4321" })
        .then(function() {
          return mongo.find(testTable, {}, { sort: { "name": -1 } },
            function(err, obj) { // callback test
              expect(mongo.isValidObjectID(obj[0]._id)).to.be.ok;
              expect(mongo.isValidObjectID(obj[1]._id)).to.be.ok;
              expect(obj[0].name).to.equal("4321");
              expect(obj[1].name).to.equal("1234");
            });
        })
        .then(function(obj) { // promise test
          expect(mongo.isValidObjectID(obj[0]._id)).to.be.ok;
          expect(mongo.isValidObjectID(obj[1]._id)).to.be.ok;
          expect(obj[0].name).to.equal("4321");
          expect(obj[1].name).to.equal("1234");
        });
    });

    it("should be able to find test data with a limit in options", function() {
      var creation_date = new Date().getTime();

      return mongo.insert(testTable, {"name": "4321" })
        .then(function() {
          return mongo.find(testTable, {}, { sort: { "name": -1 }, limit: 1 });
        })
        .then(function(obj) { // promise test
          expect(mongo.isValidObjectID(obj[0]._id)).to.be.ok;
          expect(obj.length).to.equal(1);
          expect(obj[1]).to.not.be.ok;
          expect(obj[0].name).to.equal("4321");
        });
    });

    it("should be able to find test data with a limit in options", function() {
      var creation_date = new Date().getTime();

      return mongo.insert(testTable, { "name": "54321" })
        .then(function() {
          return mongo.insert(testTable, { "name": "54320" });
        })
        .then(function() {
          return mongo.find(testTable, {}, { sort: { "name": -1 }, limit: 1, skip: 1 });
        })
        .then(function(obj) { // promise test
          expect(mongo.isValidObjectID(obj[0]._id)).to.be.ok;
          expect(obj[1]).to.not.be.ok;
          expect(obj[0].name).to.equal("54320");
        });
    });

    it("should be able to paginate test data with a limit in options", function() {
      var creation_date = new Date().getTime();
      var limit = 5;

      return mongo.insert(testTable, { "name": "54321" })
        .then(function() {
          return mongo.insert(testTable, { "name": "54320" });
        })
        .then(function() {
          return mongo.pagination(testTable, {}, { limit: limit, skip: 1 });
        })
        .then(function(obj) { // promise test
          expect(obj).to.not.be.undefined;
          expect(obj.count).to.equal(limit);
          expect(obj.total > 0).to.be.ok; 
        });
    });

    it("should be able to find test data", function() {
      return mongo.findOne(testTable, {"name": "1234"}, 
        function(err, obj) { // callback test
          expect(mongo.isValidObjectID(obj._id)).to.be.ok;
          expect(obj.name).to.equal(testData.name);
        })
        .then(function(obj) { // promise test
          expect(mongo.isValidObjectID(obj._id)).to.be.ok;
          expect(obj.name).to.equal(testData.name);
        });
    });

    it("should be able to make multiple finds in parallel without breaking -- should wait for connection", function() {
      // create a new mongo
      var mongo = new Mongo();

      var testFind = function() {
        return mongo.findOne(testTable, {"name": "1234"})
          .then(function(obj) { // promise test
            expect(mongo.isValidObjectID(obj._id)).to.be.ok;
            expect(obj.name).to.equal(testData.name);
            return obj;
          });
      }

      var fns = [];

      for(var i = 0; i < 10; i++) {
        fns.push(testFind());
      }

      return Promise.all(fns)
        .then(function(results) {
          results.length.should.equal(10);
        });
    })
  });

  describe("insert", function() {
    it("should be able to insert test data", function() {
      return mongo.insert(testTable, {"name": "1234"}, 
        function(err, obj) {  // callback
          expect(mongo.isValidObjectID(obj[0]._id)).to.be.ok;
          expect(obj[0].name).to.equal(testData.name);
        })
        .then(function(obj) {  // promise  
          expect(mongo.isValidObjectID(obj[0]._id)).to.be.ok;
          expect(obj[0].name).to.equal(testData.name);
        });
    });
  });

  describe("update", function() {
    it("should be able to update test data", function() {
      return mongo.findOne(testTable, { "name": "1234"})
        .then(function(obj) {
          obj.name = "4321";

          return mongo.update(testTable, { _id: obj._id }, { "$set": { "name": obj.name } },
            function(err, updateObj) {  // callback
              expect(updateObj[1].ok).to.equal(1);
            });
        })
        .then(function(updateObj) { // promise
          expect(updateObj[1].ok).to.equal(1);
        });
    });
  });

  describe("find and modify", function() {
    it("should be able to update test data", function() {
      return mongo.findOne(testTable, { "name": "1234"})
        .then(function(obj) {
          obj.name = "4321";

          return mongo.findAndModify(testTable, { _id: obj._id }, { "$set": { "name": obj.name } },
            function(err, updateObj) {  // callback
              expect(updateObj.name).to.equal("4321");
            });
        })
        .then(function(updateObj) { // promise
          expect(updateObj.name).to.equal("4321");
        });
    });
  });

  describe("remove", function() {
    it("should be able to remove objects", function() {
      return mongo.findOne(testTable, { "name": "4321" })
        .then(function(obj) {
          return mongo.remove(testTable, { _id: obj._id },
            function(err, updateObj) { // callback
              expect(updateObj).to.be.ok;
            });
        })
        .then(function(updateObj) { // promise
          expect(updateObj).to.be.ok;
        });
    });
  });

  describe("aggregate", function() {
    it("should be able to run an aggregate function", function() {
      return mongo.insert(testTable, {"name": "1234567890", "value": 5})
        .then(function(obj) {
          return mongo.aggregate(testTable, {
            "$match": { "name": "1234567890" },
            "$group": { 
              _id: "agg", 
              "total":  {
                "$sum": "$value" 
              }
            }
          }, function(err, obj) { // callback
            expect(obj[0].total).to.equal(5);
          });
        })
        .then(function(obj) { // promise
          expect(obj[0].total).to.equal(5);
        });
    });
  });

  describe("Sequence", function() {
    it("should be able to increment", function() {
      return mongo.getNextSequence("test_seq", { "name": "1234"}, { upsert: true }, 
        function(err, seq) { // callback
          expect(seq).to.be.ok;
        })
        .then(function(seq) { // promise
          // greater than 0 is acceptable
          expect(seq).to.be.ok;
        });
    });
  });

  describe("EnsureIndex", function() {
    it("should be able to create an index", function() {
      return mongo.ensureIndex(testTable, "name",
        function(err, obj) {
          expect(obj).to.be.undefined;
        })
        .then(function(obj) {
          // doesn't return a value....
          expect(obj).to.be.undefined;
        });
    });

    it("should be able to create a unique index", function() {
      return mongo.ensureIndex(testTable, "email", {"unique": 1})
        .then(function(obj) { //pr
          expect(obj).to.be.undefined;
          return mongo.insert(testTable, { "email": "blah@blah.com" });
        })
        .then(function() {
          return mongo.insert(testTable, {"email": "blah@blah.com"});
        })
        .caught(function(err) {
          expect(err).to.be.ok;
        });
    });
  });

  describe("DropIndex", function() {
    it("should be able to drop indexes", function() {
      return mongo.dropIndexes(testTable, "name", 
        function(err, obj) {
          expect(obj).to.be.true;
        })
        .then(function(obj) {
          expect(obj).to.be.true;
        });
    });
  });
});