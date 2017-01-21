/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');
var validateDatastoreConnection = require('./datastore-methods/validate-datastore-connection');
var leaseConnection = require('./datastore-methods/lease-connection');
var sendStatement = require('./datastore-methods/send-statement');
var sendNativeQuery = require('./datastore-methods/send-native-query');
var runTransaction = require('./datastore-methods/run-transaction');


/**
 * buildRegisteredDatastoreInstance()
 *
 * Build a registered datastore instance (s.k.a. "rdi").
 *
 * > This is the dictionary that will be stored on `hook.datastores`,
 * > with the public datastore methods such as leaseConnection().
 * >
 * > Note that this is used by .initialize(), and is only pulled out into
 * > a separate file for clarity.  It shouldn't need to be called from
 * > anywhere else, at least not at the moment.
 *
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param {String} datastoreName
 * @param {Dictionary} normalizedDatastoreConfig
 * @param {Dictionary} adapter
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @returns {Dictionary}
 *          @property {[type]} [propName] [description]
 *          @property {[type]} [propName] [description]
 *          @property {[type]} [propName] [description]
 *          @property {[type]} [propName] [description]
 */
module.exports = function buildRegisteredDatastoreInstance(datastoreName, normalizedDatastoreConfig, adapter) {

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // TODO: take the logic in `validate-datastore-connection` and inline it here
  // (it isn't being used anywhere else, and it's really more of a compatibility check)
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  // Set up our `rdi` (registered datastore instance).
  var rdi = {};

  // Get the adapter api version
  var adapterApiVersion = adapter.adapterApiVersion || 0;

  // Set the normalizedDatastoreConfig properties on the datastore object
  // for use in the hook.
  rdi.internalConfig = normalizedDatastoreConfig;

  // Store the adapter on the internal datastore
  rdi.adapter = adapter;

  //  ╔═╗╦ ╦╔═╗╔╦╗╔═╗╔╗╔╔╦╗  ┌┬┐┬ ┬┌─┐  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐
  //  ╠═╣║ ║║ ╦║║║║╣ ║║║ ║    │ ├─┤├┤    ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤
  //  ╩ ╩╚═╝╚═╝╩ ╩╚═╝╝╚╝ ╩    ┴ ┴ ┴└─┘  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘
  //  ┬ ┬┬┌┬┐┬ ┬  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐  ┌─┐┬ ┬┌┐┌┌─┐┌┬┐┬┌─┐┌┐┌┌─┐
  //  ││││ │ ├─┤   ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤   ├┤ │ │││││   │ ││ ││││└─┐
  //  └┴┘┴ ┴ ┴ ┴  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘  └  └─┘┘└┘└─┘ ┴ ┴└─┘┘└┘└─┘
  // Augment the datastore with functions for working with it directly.
  // .transaction, .leaseConnection, and .sendStatement methods.

  //  ╦  ╔═╗╔═╗╔═╗╔═╗  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
  //  ║  ║╣ ╠═╣╚═╗║╣   │  │ │││││││├┤ │   │ ││ ││││
  //  ╩═╝╚═╝╩ ╩╚═╝╚═╝  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
  // Add a wrapper for handling the .leaseConnection method
  rdi.leaseConnection = function(during, cb) {
    // Validate the adapter API version and that the datastore is able
    // to run the lease connection as far as we can tell.
    try {
      validateDatastoreConnection({
        datastoreIdentity: datastoreName,
        adapterApiVersion: adapterApiVersion,
        adapter: adapter
      });
    } catch (e) {
      return cb(e);
    }

    var adapterDatastore = adapter.datastores[datastoreName];

    // Build up options to send to lease connection
    var options = {
      datastoreIdentity: datastoreName,
      driver: adapterDatastore.driver,
      manager: adapterDatastore.manager,
      config: adapterDatastore.config,
      duringFn: during
    };

    try {
      return leaseConnection(options, cb);
    } catch (e) {
      // Try and return out the cb if the function throws
      if (_.isFunction(cb)) {
        return cb(e);
      }
      throw e;
    }
  };


  //  ╔═╗╔═╗╔╗╔╔╦╗  ┌─┐┌┬┐┌─┐┌┬┐┌─┐┌┬┐┌─┐┌┐┌┌┬┐
  //  ╚═╗║╣ ║║║ ║║  └─┐ │ ├─┤ │ ├┤ │││├┤ │││ │
  //  ╚═╝╚═╝╝╚╝═╩╝  └─┘ ┴ ┴ ┴ ┴ └─┘┴ ┴└─┘┘└┘ ┴
  // Add a wrapper for handling the .sendStatement method
  rdi.sendStatement = function(statement, dbConnection, cb) {
    // Validate the adapter API version and that the datastore is able
    // to run the lease connection as far as we can tell.
    try {
      validateDatastoreConnection({
        datastoreIdentity: datastoreName,
        adapterApiVersion: adapterApiVersion,
        adapter: adapter
      });
    } catch (e) {
      return cb(e);
    }

    var adapterDatastore = adapter.datastores[datastoreName];

    // Build up options to send to send statement
    var options = {
      datastoreIdentity: datastoreName,
      driver: adapterDatastore.driver,
      manager: adapterDatastore.manager,
      config: adapterDatastore.config,
      statement: statement,
      dbConnection: dbConnection
    };

    try {
      return sendStatement(options, cb);
    } catch (e) {
      // Try and return out the cb if the sendStatement call throws
      if (_.isFunction(cb)) {
        return cb(e);
      }
      return e;
    }
  };


  //  ╔═╗╔═╗╔╗╔╔╦╗  ┌┐┌┌─┐┌┬┐┬┬  ┬┌─┐  ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬
  //  ╚═╗║╣ ║║║ ║║  │││├─┤ │ │└┐┌┘├┤   │─┼┐│ │├┤ ├┬┘└┬┘
  //  ╚═╝╚═╝╝╚╝═╩╝  ┘└┘┴ ┴ ┴ ┴ └┘ └─┘  └─┘└└─┘└─┘┴└─ ┴
  // Add a wrapper for handling the .sendNativeQuery method
  rdi.sendNativeQuery = function(nativeQuery, dbConnection, cb) {



    // TODO: change function signature ^^

    // TODO: move this code in w/ the rest of the implementation:
    // (because an explicit cb won't always exist)
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // Validate the adapter API version and that the datastore is able
    // to run the lease connection as far as we can tell.
    try {
      validateDatastoreConnection({
        datastoreIdentity: datastoreName,
        adapterApiVersion: adapterApiVersion,
        adapter: adapter
      });
    } catch (e) {
      return cb(e);
    }
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    var adapterDatastore = adapter.datastores[datastoreName];

    // Build up options to send to send statement
    var options = {
      datastoreIdentity: datastoreName,
      driver: adapterDatastore.driver,
      manager: adapterDatastore.manager,
      config: adapterDatastore.config,
      nativeQuery: nativeQuery,
      dbConnection: dbConnection
    };

    try {
      return sendNativeQuery(options, cb);
    } catch (e) {
      // Try and return out the cb if the sendNativeQuery call throws
      if (_.isFunction(cb)) {
        return cb(e);
      }
      return e;
    }
  };


  //  ╔╦╗╦═╗╔═╗╔╗╔╔═╗╔═╗╔═╗╔╦╗╦╔═╗╔╗╔
  //   ║ ╠╦╝╠═╣║║║╚═╗╠═╣║   ║ ║║ ║║║║
  //   ╩ ╩╚═╩ ╩╝╚╝╚═╝╩ ╩╚═╝ ╩ ╩╚═╝╝╚╝
  // Add a wrapper for handling the .transaction method
  rdi.transaction = function(during, cb) {
    // Validate the adapter API version and that the datastore is able
    // to run the lease connection as far as we can tell.
    try {
      validateDatastoreConnection({
        datastoreIdentity: datastoreName,
        adapterApiVersion: adapterApiVersion,
        adapter: adapter
      });
    } catch (e) {
      return cb(e);
    }

    var adapterDatastore = adapter.datastores[datastoreName];

    // Build up options to send to send statement
    var options = {
      datastoreIdentity: datastoreName,
      driver: adapterDatastore.driver,
      manager: adapterDatastore.manager,
      config: adapterDatastore.config,
      duringFn: during
    };

    try {
      return runTransaction(options, cb);
    } catch (e) {
      // Try and return out the cb if the runTransaction call throws
      if (_.isFunction(cb)) {
        return cb(e);
      }
      return e;
    }
  };//</attach .transaction() function>

  // Now that we've gotten it all ready to go, return our registered
  // datastore instance.
  return rdi;

};
