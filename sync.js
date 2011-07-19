/* This file currently requires ES5, mostly for map, reduce, et al. */

/* some MochiKit shims */
function partial(f) {
  var args = [this];
  args.push.apply(args, Array.prototype.slice.call(arguments, 1,
                                                   arguments.length));
  return f.bind.apply(f, args);
}

function extend(a, b) {
  a.push.apply(a, b);
  return a;
}

function forEach(a, f) {
  return a.forEach(f);
}

function chain(a) {
  var res = [];
  res.push.apply(res, a);
  for (var i = 1; i < arguments.length; i++) {
    res.push.apply(res, arguments[i]);
  }
  return res;
}

function arrayEqual(a, b) {
  if (a.length != b.length)
    return false;

  return a.every(
    function(element, index, array) {
      return element === b[index];
    }
  );
}

/* taken directly from MochiKit */
function _flattenArray(res, lst) {
  for (var i = 0; i < lst.length; i++) {
    var o = lst[i];
    if (o instanceof Array)
      arguments.callee(res, o);
    else
      res.push(o);
  }
  return res;
}

function flattenArray(lst) {
  return _flattenArray([], lst);
}

/**
 * function detectUpdates(snapshot, current)
 *
 * @param  snapshot
 *         An old version of the object.
 *
 * @param  current
 *         The current version of the object.
 *
 * @return An array of change operations.
 *
 * Ramsey and Csirmaz characterize all changes to the tree in terms of
 * three operations:
 *
 *   1.) create
 *   2.) remove
 *   3.) edit
 *
 * We need to determine which changes have occured, and sequence them
 * such that the object is never in an incoherent state.
 *
 *   { "foo": 1, "bar": { "baz": 42 }}
 *
 * For example, we must avoid a sequence that calls for a deletion of
 * "bar" followed by an edit to "baz".
 *
 * A path syntax is useful to express the locations of changes, and
 * maps relatively cleanly to URIs. We express keys as path segments,
 * with arrays implying numeric path segments for their members. Keys
 * with objects or arrays as values have a "/" path separator
 * appended. Given an object
 *
 *   {
 *     "foo": 1,
 *     "bar":
 *      {
 *        "baz": 42,
 *        "qux": [43, 44, 45, 46]
 *      }
 *   }
 *
 * the following paths map to these values
 *
 *   /foo       => 1
 *   /bar/baz   => 42
 *   /bar/qux/2 => 45
 *
 * In the JSON sync algorithm, Ramsey and Csirmaz's directories
 * correspond to objects and arrays, while their files correspond to
 * primitive JSON values such as strings and integers.
 *
 * The function isObjectOrArray() is used to distinguish between the
 * two cases.
 */
function isObjectOrArray(x) {
  return ((x !== null) && (typeof(x) == 'object'));
}

/**
 * As an object pair is scanned, we can safely ignore keys that are
 * present in both objects that also share identical primitive
 * values. The function identifySuspects() returns a list of keys that
 * warrant further inspection.
 **/
function identifySuspects(snapshot, current) {
  /**
   * First, the union of both objects' keys must be calculated. This
   * code is suboptimal if both arguments are arrays, since we could
   * simply run Object.keys() on the longer of the two in that case.
   **/
  var keySet = {};
  forEach(extend(Object.keys(snapshot), Object.keys(current)),
          function(key) { keySet[key] = true });
  /**
   * Using the keys present in one or both objects, filter out those
   * that are present with identical primitive values.
   **/
  return Object.keys(keySet).filter(
    function(key) {
      return (isObjectOrArray(snapshot[key]) ||
              isObjectOrArray(current[key]) ||
              snapshot[key] !== current[key]);
    }
  );
}

/**
 * We use Command objects to represent operations performed
 * on each replica.
 **/
function Command(action, path, value) {
  this.action = action;
  this.path = path;
  this.value = value;
}

Command.prototype = {
  equals: function(other) {
    return (other && other.action == this.action &&
            arrayEqual(this.path, other.path) &&
            (isObjectOrArray(other.value) && isObjectOrArray(this.value) ?
             other.value.constructor == this.value.constructor :
             other.value === this.value));
  },
  /**
   * Check whether the other command's path starts with our path.
   **/
  isParentOf: function(other) {
    return other.path.length > this.path.length &&
           arrayEqual(other.path.slice(0, this.path.length), this.path);
  }
};

/**
 * Objects need to be created in preorder (before their child nodes),
 * to avoid a disconnected tree.
 **/
function created(path, value) {
  if (isObjectOrArray(value)) {
    /* object created. Prepend the creation record to its children */
    return extend([new Command('create', path, value.constructor())],
                  _detectUpdates(path, {}, value));
  }

  /* primitive created */
  return [new Command('create', path, value)];
}

/**
 * Objects need to be removed in postorder (after their child nodes),
 * to avoid a disconnected graph. This is the same way "rm -rf" works.
 **/
function removed(path, value) {
  if (isObjectOrArray(value)) {
    /* Object removed. Append the removal record to its children. */
    return extend(_detectUpdates(path, value, {}),
                  [new Command('remove', path)]);
  }

  /* primitive removed */
  return [new Command('remove', path)];
}

/**
 * Some edit operations are more complicated than they first
 * appear. In particular, we want to recurse into object values where
 * the key was previously a primitive. This approach provides us with
 * a detailed creation log, and allows us to reconcile more JSON
 * graphs, because it provides a detailed log of the created children
 * of the new object.
 **/
function edited(path, old, update) {
  if (isObjectOrArray(old) && !isObjectOrArray(update)) {
    /* object replaced by primitive */
    return extend([new Command('edit', path, update)],
                  _detectUpdates(path, old, {}));
  } else if (!isObjectOrArray(old) && isObjectOrArray(update)) {
    /* primitive replaced by object */
    return extend([new Command('edit', path, update.constructor())],
                  _detectUpdates(path, {}, update));
  }

  /* primitive edit */
  return [new Command('edit', path, update)];
}


function _detectUpdates(stack, snapshot, current) {
  /* check for edits and recurse into objects and arrays */
  var suspects = identifySuspects(snapshot, current);
  return flattenArray(suspects.map(
    function(key) {
      var old = snapshot[key];
      var update = current[key];
      var path = stack.concat([key]);

      /* create */
      if (typeof(old) == 'undefined')
        return created(path, update);

      /* remove */
      if (typeof(update) == 'undefined')
        return removed(path, old);

      /* edit */
      if (!isObjectOrArray(old) || !isObjectOrArray(update))
        return edited(path, old, update);

      /* recurse into object/array values at the same path */
      /**
       * We need to detect container type changes. This type of edit
       * changes the algebra described by Ramsey and Csirmaz a bit,
       * because it imposes additional ordering constraints on the
       * update sequence, which complicates the algorithm, but it
       * seems worth it to avoid profiling JSON.
       *
       * When an object's type changes at a path π, we want to reverse
       * the normal order of operations that Ramsey and Csirmaz give,
       * because we assume that a deletion of all of the array's
       * elements preceded the change from array to object. This
       * assumption does prevent key preservation across non-idiomatic
       * transformations between Object and Array types.
       *
       *  remove(π/π')
       *  removeObj(π, Array(m))
       *  createObj(π, Object(m))
       *  create(π/π')
       *
       * In otherwords, when an Array at path π is changed to an
       * Object, that implies a recursive deletion of all its
       * children, a removal of an Array at path π, a creation of an
       * Object at path π, and recursive creation of the Object's
       * members. This means we have to interleave creates and
       * removes, unlike Ramsey and Csirmaz.
       *
       **/

      ///XXX change this to recurse and return
      var changeSequence = [];
      if (old.constructor != update.constructor)
        changeSequence.push(new Command('edit', path, update.constructor()));

      /**
       * Now we recurse into objects and arrays, and append
       * the current key to our path stack.
       **/
      return extend(changeSequence,
                    _detectUpdates(path, old, update));

    }
  ));
}
var detectUpdates = partial(_detectUpdates, []);

/**
 * function orderUpdates(updates)
 *
 * @param  updates
 *         An array of produced by detectUpdates.
 *
 * @return An array of change operations in the canonical order.
 *
 * Once we have our updates, we'll need to order the records in the
 * canonical sequence described by Ramsey and Csirmaz for path π:
 *
 * (a) Commands of the form edit (π, Dir(m)), in any order determined
 *     by π.
 * (b) Commands of the form create (π, X), in preorder.
 * (c) Commands of the form remove (π), in postorder.
 * (d) Commands of the form edit (π, File(m, x)), in any order
 *     determined by π.
 *
 **/
function orderUpdates(updates) {
  var dirEdits = [];
  var creates = [];
  var removes = [];
  var edits = [];

  /**
   *  _detectUpdates orders creates and removes canonically, so we
   *  just need to weed out the edits.
   **/
  forEach(updates, function(update) {
    if (update.action == 'edit')
      isObjectOrArray(value) ? dirEdits.push(update) : edits.push(update);
    else if (update.action == 'create')
      creates.push(update);
    else if (update.action == 'remove')
      removes.push(update);
  });

  return chain(dirEdits, creates, removes, edits);
}


/**
 *
 *
 * Excerpt from Ramsey and Csirmaz:
 *
 *    The reconciler takes the sequences S1 , ... , Sn that are
 *    computed to have been performed at each replica. It com- putes
 *    sequences S ∗ 1 , ... , S ∗ n that make the filesystems as close
 *    as possible. The idea of the algorithm is that a command C ∈
 *    Si should be propagated to replica j (included ∗ in Sj ) iff
 *    three criteria are met:
 *
 *      * C ∈ Sj , i.e., C has not already been performed at
 *        replica j
 *
 *      * no commands at replicas other than i conflict with C
 *
 *      * no commands at replicas other than i conflict with commands
 *        that must precede C
 *
 *    A command C must precede command C iff they appear in the same
 *    sequence Si , C precedes C in Si , and they do not commute (C ;
 *    C C; C ).
 *
 **/

/**
 * function commandInList(command, commands)
 *
 * Check whether a command appears in a list of commands, so we can
 * tell if a command has already been performed at a replica.
 *
 **/
function commandInList(command, commands) {
  return commands.some(function(element, index, array) {
      return (element instanceof Command && element.equals(command));
  });
}

/**
 * Now we find commands with paths that are of interest, make sure
 * it's not the same command, and then check to see if it's a break.
 *
 * function conflictsFromReplicas(command, commandListsFromOtherReplicas)
 *
 * @param  command
 *         A Command object.
 *
 * @param  commandListsFromOtherReplicas
 *         A list of command lists from other replicas ([[],[],[]]).
 *
 * @return A list of objects conforming to the interface:
 *         {
 *           command: Command
 *           conflicts: [Command, Command, Command...]
 *           commandList: [Command, Command, Command...]
 *         }
 *
 **/

/**
 * Check whether an edit or create operation has been attempted under
 * a remove.
 **/
function isBreak(a, b) {
  return a.isParentOf(b) &&
         ((!isObjectOrArray(a.value) || a.action == 'remove') &&
          b.action != 'remove');
}

/**
 * Check whether the commands would result in a broken graph,
 * or whether they are attempting to insert the different values
 * at the same path.
 **/
function doesConflict(command, other) {
  var broken = isBreak(command, other) || isBreak(other, command);
  return broken || (arrayEqual(command.path, other.path)
                    && !command.equals(other));
}

function conflictsFromReplica(command, commandList) {
    return {
      'command': command,
      'conflicts': commandList.filter(partial(doesConflict, command)),
      'commandList': commandList
    };
}

function conflictsFromReplicas(command, commandListsFromOtherReplicas) {
  return commandListsFromOtherReplicas.map(
    partial(conflictsFromReplica, command)
  );
}

/**
 * If a command doesn't conflict, we still might have to put it in the
 * conflict list if an earlier command did conflict, and that command
 * is a precondition for the current command.
 **/
function mustPrecede(command, earlierCommand) {
  if (earlierCommand.action == 'edit')
    return false;

  return earlierCommand.isParentOf(command);
}

function precedingCommandsConflict(command, conflictList) {
  return conflictList.some(partial(mustPrecede, command));
}

function reconcile(commandLists) {
  var propagations = [];
  var conflicts = [];

  forEach(commandLists, function() {
    propagations.push([]);
    conflicts.push([]);
  });

  for (var i = 0; i < commandLists.length; ++i) {
    for (var j = 0; j < commandLists.length; ++j) {
      if (i != j) {
        forEach(commandLists[i],
          function(command) {
            if (!commandInList(command, commandLists[j])) {
              var others = chain(commandLists.slice(0, i),
                                 commandLists.slice(i + 1));
              var conflict = conflictsFromReplicas(command, others);
              if (conflict.every(
                  function(c) { return c.conflicts.length == 0 })) {
                if (precedingCommandsConflict(command, conflicts[j])) {
                  conflicts[j].push(command);
                } else {
                  propagations[j].push(command);
                }
              } else {
                conflicts[j].push(command);
              }
            }
          }
        );
      }
    }
  }

  return {'propagations': propagations, 'conflicts': conflicts};
}

/**
 * Map a path array to an object reference, such that [foo, bar, baz]
 * becomes a reference to the value at obj[foo][bar][baz].
 **/
function pathToReference(obj, path) {
  return path.reduce(
    function(reference, segment) {
      return reference ? reference[segment] : reference;
    }, obj
  );
}

/**
 * Apply a single command to an object.
 **/
function applyCommand(target, command) {
  var container =
    pathToReference(target, command.path.slice(0, command.path.length - 1));

  if (command.action == 'remove')
    delete container[command.path[command.path.length - 1]];

  container[command.path[command.path.length - 1]] = command.value;
}

/**
 * Apply a list of commands to an object.
 **/
function applyCommands(target, commands) {
  forEach(commands, partial(applyCommand, target));
}

/**
 * Now we define a more traditional OO api to wrap this functionality.
 *
 * @param identifiers
 *        A string or array of strings for the synchronizer to identify
 *        fields to be used as a identifiers.
 *
 * @param onConflict
 *        A function that will be called when a conflict arises.
 *
 * @param onPropagate
 *        A function that will be called when a propagation arises.
 **/
function Synchronizer(ids, onConflict, onPropagate) {
  this.identifiers = isObjectorArray(ids) ? ids : [ids];
  this.onConflict = onConflict;
  this.onPropagate = onPropagate;
}

Synchronizer.prototype = {
  /**
   * Synchronize JSON objects.
   *
   * @param snapshot
   *        A common baseline JSON object to work from.
   *
   * @param jsonObjects
   *        An array of JSON objects to sync, all of which are derived
   *        from the common baseline.
   **/
  sync: function(snapshot, jsonObjects) {

  }
};
