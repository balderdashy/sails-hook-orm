/**
 * Module dependencies
 */

var assert = require('assert');
var _ = require('@sailshq/lodash');
var doWithConnection = require('./private/do-with-connection');

/**
 * helpLeaseConnection()
 *
 * Get a connection from the specified datastore's manager, run the
 * provided `during` function, and finally release the connection.
 *
 * > This utility is for a datastore (RDI) method.  Before attempting to use this,
 * > the datastore method should guarantee that the adapter (via its driver) actually
 * > supports all the necessary pieces.
 *
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param  {Dictionary} options
 *         @required {Ref} manager
 *         @required {Ref} driver
 *
 *         @required {Function} during
 *                   @param {Ref} db   [The leased database connection.]
 *                   @param {Function} proceed
 *                          @param {Error?} err
 *                          @param {Ref?} resultMaybe
 *         @optional {Dictionary} meta
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param  {Function} done
 *         @param {Error?} err
 *         @param {Ref?} resultMaybe
 *                If set, this is the result sent back from the provided
 *                `during` function.
 */
module.exports = function helpLeaseConnection(options, done){

  assert(!options.connection, 'A pre-existing `connection` should never be passed in to the helpLeaseConnection() utility.  (Instead, use doWithConnection().)');
  assert(_.keys(_.pick(options, ['manager','driver','during','meta'])).length === _.keys(options).length, 'Unexpected extra options');

  // Use the `doWithConnection` utility to do everything, and rely on it
  // to trigger the `done` callback when finished.
  doWithConnection(options, done);

};


// To test:
// ```
// sails.getDatastore().leaseConnection(function(db, proceed){ console.log('db connection: '+db); return proceed(undefined, 'fun result'); }).exec(function(){if (arguments[0]) { console.log('ERROR:', arguments[0]); return; } console.log('Ok.  Result:',arguments[1]);  })
// ```
//
// Or:
// ```
// sails.getDatastore().leaseConnection(function(db, proceed){  User.find().usingConnection(db).exec(proceed); }).exec(function(){if (arguments[0]) { console.log('ERROR:', arguments[0]); return; } console.log('Ok.  Result:',arguments[1]);  })
// ```

