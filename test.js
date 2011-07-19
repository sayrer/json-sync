if (!this["output"]) output = print;
var passed = 0;
var failed = 0;

function is(got, expected, msg) {
  if (got == expected) {
    output("OK:   " + msg);
    ++passed;
  } else {
    output("FAIL: " + msg);
    output("Expected |" + expected + "|");
    output("     Got |" + got + "|");
    ++failed;
  }
}

function complete() {
  output("\nTests Complete");
  output("--------------");
  output("Passed: " + passed);
  output("Failed: " + failed);
  output("\n");
}

//
// test our internal functions
//

function test_isObjectOrArray() {
  is(isObjectOrArray({}), true, "isObjectOrArray detects an object");
  is(isObjectOrArray([]), true, "isObjectOrArray detects an array");
  is(isObjectOrArray("foo"), false, "isObjectOrArray shouldn't detect string");
  is(isObjectOrArray(4), false, "isObjectOrArray shouldn't detect integer");
  is(isObjectOrArray(5.5), false, "isObjectOrArray shouldn't detect float");
  is(isObjectOrArray(undefined), false,
     "isObjectOrArray shouldn't detect undefined");
  is(isObjectOrArray(null), false, "isObjectOrArray shouldn't detect null");
}

function test_identifySuspects() {
  var suspects = identifySuspects({"a": 1, "b": 2, "c": 3, "d": "hmm"},
                                  {"a": 1, "b": 2, "c": 3, "d": "hmm"});
  is(suspects.length, 0, "shouldn't be any suspects for matching primitives");
  suspects = identifySuspects({"a": 1, "b": 2, "c": 3, "d": "hmm"},
                                  {"a": 1, "b": 3, "c": 3, "d": "hmm"});
  is(suspects.length, 1, "should detect edited primitives");
  suspects = identifySuspects({"a": 1, "b": {}, "c": 3, "d": "hmm"},
                              {"a": 1, "b": {}, "c": 3, "d": "hmm"});
  is(suspects.length, 1, "should detect matching objects");
  suspects = identifySuspects({"a": 1, "b": 2, "c": 3, "d": "hmm"},
                              {"a": "1", "b": 2, "c": 3, "d": "hmm"});
  is(suspects.length, 1, "should detect primitive type change");
  suspects = identifySuspects({"a": 1, "b": 2, "c": 3, "d": "hmmm"},
                              {"a": 1, "b": 2, "c": 3, "d": "hmm"});
  is(suspects.length, 1, "should detect string edit");
  suspects = identifySuspects({"xxx": 1, "b": 2, "c": 3, "d": "hmm"},
                              {"yyy": 1, "b": 2, "c": 3, "d": "hmm"});
  is(suspects.length, 2, "should detect differing keys");
  suspects = identifySuspects({"0": 1, "b": 2, "c": 3, "d": "hmm"},
                              {0: 1, "b": 2, "c": 3, "d": "hmm"});
  is(suspects.length, 0, "should not detect key type changes");
}

function test_created() {
  var record = created(["foo"], {});
  is(record.length, 1, "created empty object is length 1");
  record = created(["foo"], 1);
  is(record.length, 1, "created primitive is length 1");
  record = created(["foo"], {"bar":"baz"});
  is(record.length, 2, "created populated object is length 2");
  record = created(["foo"], {"bar":"baz", "qux":"baz"});
  is(record.length, 3, "created populated object is length 3");
  is(record[0].action, "create", "create action is correct");
  is(record[0].path.length, 1, "creation paths in preorder");
  is(record[1].path.length, 2, "creation paths in preorder");
  is(record[1].value, "baz", "create has correct value");
  is(record[2].path.length, 2, "creation paths in preorder");
  is(record[2].value, "baz", "create has correct value");
}

function test_removed() {
  var record = removed(["foo"], {});
  is(record.length, 1, "removed empty object is length 1");
  record = removed(["foo"], 1);
  is(record.length, 1, "removed primitive is length 1");
  record = removed(["foo"], {"bar":"baz"});
  is(record.length, 2, "removed populated object is length 2");
  record = removed(["foo"], {"bar":"baz", "qux":"baz"});
  is(record.length, 3, "removed populated object is length 3");
  is(record[0].action, "remove", "remove action is correct");
  is(record[0].path.length, 2, "removal paths in postorder");
  is(record[1].path.length, 2, "removal paths in postorder");
  is(record[2].path.length, 1, "removal paths in postorder");
}

function test_edited() {
  var record = edited(["foo"], 5, 3);
  is(record.length, 1, "primitive edit is length 1");
  is(record[0].action, "edit", "edit action is correct");
  is(record[0].value, 3, "edit has correct value");
  is(record[0].path.length, 1, "edit path is correct");
  record = edited(["foo"], {"bar": "baz"}, 3);
  is(record.length, 2, "obj2primitive contains removals");
  is(record[0].action, "edit", "edits precede removals");
  is(record[1].action, "remove", "remove action is there");
  record = edited(["foo"], 3, {"bar": "baz"});
  is(record.length, 2, "primitive2object contains creations");
  is(record[0].action, "edit", "edits precede creations");
  is(record[1].action, "create", "create action is there");
};


// A snapshot, followed by four non-conflicting replicas
var snap =     { "foo": 1, "bar": 1, "baz": 1, "qux": 1 } 
var replica1 = { "foo": 0, "bar": 1, "baz": 1, "qux": 1 } 
var replica2 = { "foo": 1, "bar": 0, "baz": 1, "qux": 1 } 
var replica3 = { "foo": 1, "bar": 1, "baz": 0, "qux": 1 } 
var replica4 = { "foo": 1, "bar": 1, "baz": 1, "qux": 0 } 

function test_detectUpdates() {
  function checkReplica(name, replica) {
    var updateList = detectUpdates(snap, replica);
    is(updateList.length, 1, name + " has correct number of updates");
    is(updateList[0].action, "edit", name + " should have an edit");
    is(updateList[0].value, 0, name + " should have value 0");
  }
  checkReplica("replica1", replica1);
  checkReplica("replica2", replica2);
  checkReplica("replica3", replica3);
  checkReplica("replica4", replica4);
}

function test_orderUpdates() {

}

function test_Command() {
  var x = new Command("edit", ["foo"], 5);
  var y = new Command("edit", ["foo"], 5);
  is(x instanceof Command, true, "instanceof");
  is(x.equals(y), true, "equals method of Command works");
 
  x.value = "5";
  y.value = 5;
  is(x.equals(y), false, "equals method of Command detects type changes");

  x.value = {};
  y.value = {};
  is(x.equals(y), true, "equals method of Command matches {} values");
  
  x.value = [];
  y.value = [];
  is(x.equals(y), true, "equals method of Command matches [] values");

  x.value = "5";
  y.value = [];
  is(x.equals(y), false, "equals method of Command detects obj vs. primitive");
  
  var z = new Command("edit", ["foo","bar"], 5);
  is(x.isParentOf(z), true, "check for parents");
}

function test_commandInList() {
  var x = new Command("edit", ["foo"], 5);
  var y = new Command("remove", ["bar"]);
  var commandList = [new Command("edit", ["foo"], 5),
                     new Command("remove", ["bar"])];
  is(commandInList(x, commandList), true, "commandInList matches identical");
  is(commandInList(y, commandList), true, "commandInList matches removes");
  is(commandInList(new Command("edit", ["foo"], "bar"),
                   [new Command("edit", ["foo"], "bar")]),
     true, "edits match");
  is(commandInList(new Command("edit", ["foo"], 6), commandList), false,
     "commandInList fails differing values");
}

function test_doesConflict() {
  var x = new Command("edit", ["foo"], 1);
  var y = new Command("edit", ["foo"], 2);
  is(doesConflict(x, y), true, "doesConflict finds identical paths with different values");

  y.path = ["bar"];
  is(doesConflict(x, y), false, "doesConflict ignores mismatched paths");
  
  var a = new Command("remove", ["foo"]);
  var b = new Command("edit", ["foo","bar"], 42);
  is(doesConflict(a, b), true, "doesConflict catches edit under remove");
  is(doesConflict(b, a), true, "doesConflict catches edit under remove");
}


function test_applyCommand() {
  var c = new Command("edit", ["foo"], "bar");
  var target = {foo: "qux"};
  applyCommand(target, c);
  is(target.foo, "bar", "applying edit commands works");
}

function test_reconcileWithNoConflicts() {
  var syncdata = reconcile([detectUpdates(snap, replica1),
                            detectUpdates(snap, replica2),
                            detectUpdates(snap, replica3),
                            detectUpdates(snap, replica4)]);
  is(syncdata.propagations.length, 4, "correct number of propogation arrays");
  is(syncdata.propagations[0].length, 3, "correct number of commands to exec");
  is(syncdata.propagations[0][0].action, "edit", "is it an edit?");

  applyCommands(replica1, syncdata.propagations[0]);
  applyCommands(replica2, syncdata.propagations[1]);
  applyCommands(replica3, syncdata.propagations[2]);
  applyCommands(replica4, syncdata.propagations[3]);

  forEach([replica1, replica2, replica3, replica4],
    function (replica) {
      is(replica.foo, 0, "replica.foo is zero");
      is(replica.baz, 0, "replica.bar is zero");
      is(replica.bar, 0, "replica.baz is zero");
      is(replica.qux, 0, "replica.qux is zero");
    }
  );
}

function pathToArray(path) {
  return path == "/" ? [] : path.split("/").slice(1);
}

function commandFromArray(key, array) {
  var c = array.filter(
    function(c) { 
      return ("/" + c.path.join("/")) == key;
    }
  );
  return c[0];
}

function checkUpdate(list, path, expectAction, expectValue) {
  var x = commandFromArray(path, list);
  is(x.action, expectAction, path + " action");
  if (isObjectOrArray(expectValue))
    is(x.value.constructor, expectValue.constructor, path + " value");
  else
    is(x.value, expectValue, path + " value");
  is(arrayEqual(x.path, pathToArray(path)), true, path + " path");
}

function checkSync(obj1, obj2, path, value) {
  field1 = pathToReference(obj1, pathToArray(path));
  field2 = pathToReference(obj2, pathToArray(path));
  is(field1, field2, path + " in sync");
  is(field1, value, path + " correct value");
}

// the README examples

var snapshotJSON =
{
  "x": 42,
  "a": 1,
  "b":
  {
    "c": 2,
    "d":
    {
      "e": 3,
      "f": 4
    },
    "g": 5
  },
  "h": 6.6,
  "i": [7, 8, 9],
  "j": 10,
  "k": { "m": 11 },
  "n": 66,
}

var currentJSON =
{
  "x": 43,             /* edited */ 
  "a": 1,
  "new": 11,           /* created */
  "b":
  {
    "c": 2,
    "new2": 22,        /* created */
    "d":
    {
      "e": 3,
      /*"f": 4*/       /* removed */
    },
    "g": 55,           /* edited  */
  },
  /* "h": 6.6, */      /* removed */   
  "i": [7, 8, 9, 99],  /* added array element */
  "j": 10,
  "k": 42,             /* replaced object with primitive */
  "n": { "new3": 77 }, /* replaced primitive with object */
}


function test_complexReconcileWithNoConflicts() {
  var updates = detectUpdates(snapshotJSON, currentJSON);
  is(updates.length, 11, "detect correct number of updates");
  checkUpdate(updates, "/x", "edit", 43);
  checkUpdate(updates, "/new", "create", 11);
  checkUpdate(updates, "/b/new2", "create", 22);  
  checkUpdate(updates, "/b/d/f", "remove", undefined);
  checkUpdate(updates, "/b/g", "edit", 55);
  checkUpdate(updates, "/h", "remove", undefined);
  checkUpdate(updates, "/i/3", "create", 99);
  checkUpdate(updates, "/k/m", "remove", undefined);
  checkUpdate(updates, "/k", "edit", 42);
  checkUpdate(updates, "/n", "edit", {});
  checkUpdate(updates, "/n/new3", "create", 77);
  
  // now we check against an object that contains edits to other
  // fields, or identical edits.
  var otherJSON =
  {
    "x": 43,             /* edited to the same value */ 
    "a": 100,            /* non-conflicting edit */
    "new": 11,           /* created to the same value */
    "b":
    {
      /*"c": 2,*/        /* non-conflicting remove */
      "d":
      {
        "e": 3,
        /*"f": 4*/       /* removed same value */
      },
      "g": 5,            /* didn't edit  */
      "foo": 555         /* non-conflicting create */ 
    },
    "h": 6.6,            /* didn't remove */   
    "i": [7, 8, 9, 99],  /* added same array element */
    "j": 10,
    "k": { "m": 11 },    /* didn't touch */
    "n": 66              /* didn't touch */
  }

  var otherUpdates = detectUpdates(snapshotJSON, otherJSON);
  checkUpdate(otherUpdates, "/x", "edit", 43);
  checkUpdate(otherUpdates, "/a", "edit", 100);
  checkUpdate(otherUpdates, "/b/c", "remove", undefined);
  checkUpdate(otherUpdates, "/b/d/f", "remove", undefined);
  checkUpdate(otherUpdates, "/i/3", "create", 99);

  var syncdata = reconcile([updates, otherUpdates]);
  applyCommands(currentJSON, syncdata.propagations[0]);
  applyCommands(otherJSON, syncdata.propagations[1]);

  checkSync(currentJSON, otherJSON, "/x", 43);
  checkSync(currentJSON, otherJSON, "/a", 100);
  checkSync(currentJSON, otherJSON, "/new", 11);
  checkSync(currentJSON, otherJSON, "/b/c", undefined);
  checkSync(currentJSON, otherJSON, "/b/new2", 22);
  checkSync(currentJSON, otherJSON, "/b/d/f", undefined);
  checkSync(currentJSON, otherJSON, "/b/g", 55);
  checkSync(currentJSON, otherJSON, "/b/foo", 555);
  checkSync(currentJSON, otherJSON, "/h", undefined);
  checkSync(currentJSON, otherJSON, "/i/3", 99);
  checkSync(currentJSON, otherJSON, "/k", 42);
  checkSync(currentJSON, otherJSON, "/n/new3", 77);
  checkSync(currentJSON, otherJSON, "/j", 10);
}

function test_repeatedSyncsWithNoConflicts() {
  var originalJSON = {"foo": {"bar": "baz"}, "toBeRemoved":"goner",
                      "someArray":["tobeEdited"]};
  var clientJSON   = {"foo": {"bar": "baz"}, "toBeRemoved":"goner",
                      "someArray":["tobeEdited"]};
  var serverJSON   = {"foo": {"bar": "baz"}, "toBeRemoved":"goner",
                      "someArray":["tobeEdited"]};
  clientJSON["foo"]["clientAddition"] = "the client added this";
  serverJSON["foo"]["serverAddition"] = "the server added this";
  delete clientJSON["toBeRemoved"];  
  delete serverJSON["toBeRemoved"];
  clientJSON["someArray"][0] = "been edited";
  serverJSON["someArray"][0] = "been edited";

  var syncdata = reconcile([detectUpdates(originalJSON, clientJSON),
                            detectUpdates(originalJSON, serverJSON)]);
  applyCommands(clientJSON, syncdata.propagations[0]);
  applyCommands(serverJSON, syncdata.propagations[1]);
  
  
  is(clientJSON["foo"]["bar"] == serverJSON["foo"]["bar"],
     true, "unchanged fields remain");
  is(serverJSON["foo"]["clientAddition"], clientJSON["foo"]["clientAddition"],
     "server has client addition");
  is(clientJSON["foo"]["serverAddition"], serverJSON["foo"]["serverAddition"],
     "client has server addition");
  is(clientJSON["toBeRemoved"] == undefined, true, "removed from client");
  is(serverJSON["toBeRemoved"] == undefined, true, "removed from server");
  is(clientJSON["someArray"][0] == serverJSON["someArray"][0], true,
     "identically edited array ok");

  /* now all the fields are the same */
  originalJSON = { "foo": {"bar":"baz",
                   "clientAddition":"the client added this",
                   "serverAddition":"the server added this"},
                   "someArray":["been edited"]} ;
  clientJSON["someArray"][0] = "edited again";
  serverJSON["foo"]["bar"] = "edit some other field";
  syncdata = reconcile([detectUpdates(originalJSON, clientJSON), 
                        detectUpdates(originalJSON, serverJSON)]);
  applyCommands(clientJSON, syncdata.propagations[0]);
  applyCommands(serverJSON, syncdata.propagations[1]);
  
  is(serverJSON["someArray"][0], "edited again", "repeated edit works");
  is(serverJSON["foo"]["bar"], "edit some other field", "repeated edit works");
  
}

function test_conflictsFromReplica() {
  var conflictList = conflictsFromReplica(new Command("edit", ["f"], "b"),
                                          [new Command("edit", ["f"], "b")]);
  is(conflictList.conflicts.length, 0, "identical commands don't conflict");
}

function test_basicConflicts() {  
  // conflicting edits
  var snap = {"foo":"bar"}
  var clientJSON = {"foo":"baz"}
  var serverJSON = {"foo":"qux"}
  var syncdata = reconcile([detectUpdates(snap, clientJSON), 
                            detectUpdates(snap, serverJSON)]);
  // should have zero propagations and one conflict
  is(syncdata.propagations[0].length, 0,
     "complete edit conflict should have no propagations");
  is(syncdata.propagations[1].length, 0,
     "complete edit conflict should have no propagations");
  is(syncdata.conflicts[0].length, 1,
     "single edit field conflicting should have one conflict");
  is(syncdata.conflicts[1].length, 1,
     "single edit field conflicting should have one conflict");
  
  // conflicting creates
  var snap = {"foo":"bar"}
  var clientJSON = {"foo":"bar","baz":"qux"}
  var serverJSON = {"foo":"bar","baz":"quux"}
  var syncdata = reconcile([detectUpdates(snap, clientJSON), 
                            detectUpdates(snap, serverJSON)]);
                            
  // should have zero propagations and one conflict
  is(syncdata.propagations[0].length, 0,
     "complete create conflict should have no propagations");
  is(syncdata.propagations[1].length, 0,
     "complete create conflict should have no propagations");
  is(syncdata.conflicts[0].length, 1,
     "single create field conflicting should have one conflict");
  is(syncdata.conflicts[1].length, 1,
     "single create field conflicting should have one conflict");
     
  // edit that conflicts with a remove of its parent
  var snap = {"foo":{"bar":"baz"}, "xuq":"xuuq"}
  var clientJSON = {"xuq":"xuuq"}
  var serverJSON = {"foo":{"bar":"qux"}, "xuq":"xuuq"}
  var syncdata = reconcile([detectUpdates(snap, clientJSON), 
                            detectUpdates(snap, serverJSON)]);
  is(syncdata.propagations[0].length, 0,
     "complete remove conflict should have no propagations");
  is(syncdata.propagations[1].length, 0,
     "complete remove conflict should have no propagations");
  is(syncdata.conflicts[0].length, 1,
     "the client gets one conflict: the edit to /foo/bar");
  is(syncdata.conflicts[1].length, 2,
     "the server gets two conflicts: both of the removals");

  // edit that conflicts with an empty object
  var snap = {"foo":{"bar":"baz"}}
  var clientJSON = {}
  var serverJSON = {"foo":{"bar":"qux"}}
  var syncdata = reconcile([detectUpdates(snap, clientJSON), 
                            detectUpdates(snap, serverJSON)]);
  is(syncdata.propagations[0].length, 0,
     "complete remove conflict should have no propagations");
  is(syncdata.propagations[1].length, 0,
     "complete remove conflict should have no propagations");
  is(syncdata.conflicts[0].length, 1,
     "the client gets one conflict: the edit to /foo/bar");
  is(syncdata.conflicts[1].length, 2,
     "the server gets two conflicts: both of the removals");
  
  // hierarchical create conflict
  var snap = {"foo":"bar"}
  var clientJSON = {"foo":"bar", "baz":{"qux":"quux"}}
  var serverJSON = {"foo":"bar", "baz":"b"}
  var syncdata = reconcile([detectUpdates(snap, clientJSON), 
                            detectUpdates(snap, serverJSON)]);
  is(syncdata.propagations[0].length, 0,
     "complete remove conflict should have no propagations");
  is(syncdata.propagations[1].length, 0,
     "complete remove conflict should have no propagations");
  is(syncdata.conflicts[0].length, 1,
     "the client gets one conflict: creation of /baz");
  is(syncdata.conflicts[1].length, 2,
     "the server gets two conflicts: both of the client creates");
     
  // edited to primitive
  var snap = {"foo":"bar", "baz":{}}
  var clientJSON = {"foo":"bar", "baz":{"qux":"quux"}}
  var serverJSON = {"foo":"bar", "baz":"b"}
  var syncdata = reconcile([detectUpdates(snap, clientJSON), 
                            detectUpdates(snap, serverJSON)]);
  is(syncdata.propagations[0].length, 0,
     "complete remove conflict should have no propagations");
  is(syncdata.propagations[1].length, 0,
     "complete remove conflict should have no propagations");
  is(syncdata.conflicts[0].length, 1,
     "the client gets one conflict: edit of /baz");
  is(syncdata.conflicts[1].length, 1,
     "the server gets one conflict: the creation of /baz/qux");
}

function test_arrayMerging() {
  var snap = 
  {
    "foo":
    [
      {"a": "1"},
      {"b": "2"},
      {"c": "3"}
    ]
  }
  
  var clientJSON = 
  {
    "foo":
    [
      {"a": "1"},
      {"b": "2"},
      {"b2": "2b"},
      {"c": "3"}
    ]
  }
  
  var serverJSON = 
  {
    "foo":
    [
      {"a": "1"},
      {"a1": "1a"},
      {"b": "2"},
      {"c": "3"}
    ]
  }
  
  var syncdata = reconcile([detectUpdates(snap, clientJSON), 
                            detectUpdates(snap, serverJSON)]);
                            
  // The result we end up with here is a little counter-intuitive.
  // The object with keys "b" and "b2" both end up being creates
  // underneath /foo/2. This illustrates the need to let clients
  // define properties that serve as identifiers.
  is(syncdata.propagations[0].length, 3, "move the indexes up");
  is(syncdata.propagations[1].length, 1, "apply a create inside /foo/2");
  is(syncdata.conflicts[0].length, 0, "no conflicts in array merging");
  is(syncdata.conflicts[0].length, 0, "no conflicts in array merging");
  applyCommands(clientJSON, syncdata.propagations[0]);
  applyCommands(serverJSON, syncdata.propagations[1]);
  checkSync(clientJSON, serverJSON, "/foo/0/a", "1");
  checkSync(clientJSON, serverJSON, "/foo/1/a1", "1a");
  checkSync(clientJSON, serverJSON, "/foo/2/b", "2");
  checkSync(clientJSON, serverJSON, "/foo/2/b2", "2b");
  checkSync(clientJSON, serverJSON, "/foo/3/c", "3");
}

function test_arrayMergingWithIDs() {
  var snap = 
  {
    "foo":
    [
      {"a": "1"},
      {"b": "2"},
      {"c": "3"}
    ]
  }
  
  var clientJSON = 
  {
    "foo":
    [
      {"a": "1"},
      {"b": "2"},
      {"b2": "2b"},
      {"c": "3"}
    ]
  }
  
  var serverJSON = 
  {
    "foo":
    [
      {"a": "1"},
      {"a1": "1a"},
      {"b": "2"},
      {"c": "3"}
    ]
  }
  
  var syncdata = reconcile([detectUpdates(snap, clientJSON), 
                            detectUpdates(snap, serverJSON)]);
  output(syncdata.propagations[0].length + " " + syncdata.propagations[1].length)
  output(syncdata.conflicts[0].length + " " + syncdata.conflicts[1].length)
  forEach(syncdata.propagations[0], function(x) { output(x.action + " " + x.path + " = " + x.value)})
  output("-----------")
  forEach(syncdata.propagations[1], function(x) { output(x.action + " " + x.path + " = " + x.value)})
  
}

function test_complexConflictsMixedWithPropagations() {
  var snap =
  {
    "foo": 
    { 
       "bar": "baz",
       "bar2": "baz2"
    },
    "foo2":
    { 
      "hmm1": 
      { 
        "hmm": "yeah",
        "hm1": "hmmm",
        "hm2": "hmmmmmm"
      },
      "foo3": 
      { 
        "bar3": ["hmm", "yeah", "ok"],
        "baz3": 
          [
            {"a": "1"},
            {"b": "2"},
            {"c": "3"}
          ]
      }
    }
  }
  
  var clientJSON =
  {
    "foo": 
    { 
      "bar": "baz1",          /* conflict */
      "bar2": "baz2",
      "fff": "ggg"            /* no conflict create */
    },
    "foo2":
    { 
      "hmm1": 
      { 
        "hmm": "yeah",
        "hm1": "hmmm",
        "hm2": "hmmmmmm"
      },
      "foo3": 
      { 
        "bar3": ["hmm", "yeah", "ok"],
        "baz3": 
          [
            {"a": "1"},
            {"a2": "12"},
            {"b": "2"},
            {"c": "3"}
          ]
      }
    }
  }
  
  var serverJSON =
  {
    "foo": 
    { 
      "bar": "asdfasdf",      /* conflict */
      "bar2": "baz2",
      "fff": "ggg",           /* no conflict create */
      "fff2": "ggg2"          /* no conflict create */      
    },
    "foo2":
    { 
      "hmm1": 
      { 
        "hmm": "yeah",
        "hm1": "hmmm",
        "hm2": "hmmmmmm"
      },
      "foo3": 
      { 
        "bar3": ["hmm", "yeah", "ok"],
        "baz3": 
          [
            {"a": "1"},
            {"b": "2"},
            {"b2": "2b"},
            {"c": "3"}
          ]
      }
    }
  }
}

function runTests() {
  output("\n\nTests Starting");
  output("--------------");
  test_isObjectOrArray();
  test_identifySuspects();
  test_created();
  test_removed();
  test_edited();
  test_detectUpdates();
  test_orderUpdates();
  test_Command();
  test_commandInList();
  test_doesConflict();
  test_applyCommand();
  test_reconcileWithNoConflicts();
  test_complexReconcileWithNoConflicts();
  test_repeatedSyncsWithNoConflicts();
  test_conflictsFromReplica();
  test_basicConflicts();
  test_arrayMerging();
  //test_arrayMergingWithIDs();
  complete();
}

if (this["document"]) {
  window.onload = runTests;
} else {

  runTests();
}


