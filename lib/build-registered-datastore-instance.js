/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');
var parley = require('parley');
var helpLeaseConnection = require('./datastore-methods/help-lease-connection');
var helpSendStatement = require('./datastore-methods/help-send-statement');
var helpSendNativeQuery = require('./datastore-methods/help-send-native-query');
var helpRunTransaction = require('./datastore-methods/help-run-transaction');


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

  // Set up our `rdi` (registered datastore instance).
  var rdi = {};

  // Get the adapter api version
  var adapterApiVersion = adapter.adapterApiVersion || 0;

  // Set the normalizedDatastoreConfig properties on the datastore object
  // for use in the hook.
  rdi.internalConfig = normalizedDatastoreConfig;

  // Store the adapter on the internal datastore
  rdi.adapter = adapter;

  // = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =
  // FUTURE: As an optimization, we _could_ check whether the datastore is able to
  // use datastore methods at all (or even on a per-method basis) up here.
  // If not, instead of attaching the proper methods, we could attach fakes.
  // Thus individual calls to datastore methods wouldn't have to involve the
  // more-complicated checks.  (Note that, at the moment, it's not clear that
  // this is even a bottleneck.  So we should really verify that first before
  // embarking down this road.)
  // = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =


  //  ╔═╗╦ ╦╔═╗╔╦╗╔═╗╔╗╔╔╦╗  ┌┬┐┬ ┬┌─┐  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐
  //  ╠═╣║ ║║ ╦║║║║╣ ║║║ ║    │ ├─┤├┤    ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤
  //  ╩ ╩╚═╝╚═╝╩ ╩╚═╝╝╚╝ ╩    ┴ ┴ ┴└─┘  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘
  //  ┬ ┬┬┌┬┐┬ ┬  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐  ┌─┐┬ ┬┌┐┌┌─┐┌┬┐┬┌─┐┌┐┌┌─┐
  //  ││││ │ ├─┤   ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤   ├┤ │ │││││   │ ││ ││││└─┐
  //  └┴┘┴ ┴ ┴ ┴  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘  └  └─┘┘└┘└─┘ ┴ ┴└─┘┘└┘└─┘
  // Augment the datastore with functions for working with it directly.
  // These are methods like `.transaction()`, `.leaseConnection()`,
  // `.sendStatement()`, and `.sendNativeQuery()`.

  //  ╦  ╔═╗╔═╗╔═╗╔═╗  ┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
  //  ║  ║╣ ╠═╣╚═╗║╣   │  │ │││││││├┤ │   │ ││ ││││
  //  ╩═╝╚═╝╩ ╩╚═╝╚═╝  └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴ ┴└─┘┘└┘
  /**
   * leaseConnection()
   *
   * Lease a new connection from the datastore for use in running multiple queries
   * on the same connection (i.e. so that the logic provided in `during` can reuse
   * the db connection).  When finished, or if a fatal error occurs, `during` should
   * call its callback, at which time this will take care of releasing the db connection
   * back to the manager (i.e. pool).
   *
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function} _during
   * @param  {Function?} explicitCb
   * @param  {Dictionary?} more
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @returns {Deferred?} if no explicit callback was provided
   */
  rdi.leaseConnection = function(_during, explicitCb, more) {

    var options = {
      datastoreName: datastoreName,
      adapter: adapter,

      during: _during,
      meta: undefined,
    };

    if (more) {
      _.extend(options, more);
    }

    return parley(function _handleExec(done){
      helpLeaseConnection(options, done);
    }, explicitCb, {

      meta: function(_meta){
        options.meta = _meta;
        return this;
      },

    });//</parley()>

  };//</attach .leaseConnection() function>


  //  ╔═╗╔═╗╔╗╔╔╦╗  ┌─┐┌┬┐┌─┐┌┬┐┌─┐┌┬┐┌─┐┌┐┌┌┬┐
  //  ╚═╗║╣ ║║║ ║║  └─┐ │ ├─┤ │ ├┤ │││├┤ │││ │
  //  ╚═╝╚═╝╝╚╝═╩╝  └─┘ ┴ ┴ ┴ ┴ └─┘┴ ┴└─┘┘└┘ ┴

  /**
   * [sendStatement description]
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Dictionary} _statement
   * @param  {Function?} explicitCb
   * @param  {Dictionary?} more
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @returns {Deferred?} if no explicit callback was provided
   */
  rdi.sendStatement = function(_statement, explicitCb, more) {

    var options = {
      datastoreName: datastoreName,
      adapter: adapter,

      statement: _statement,
      meta: undefined,
      usingConnection: undefined,
    };

    if (more) {
      _.extend(options, more);
    }

    return parley(function _handleExec(done){
      helpSendStatement(options, done);
    }, explicitCb, {

      meta: function(_meta){
        options.meta = _meta;
        return this;
      },

      usingConnection: function(_usingConnection){
        options.usingConnection = _usingConnection;
        return this;
      },

    });//</parley()>

  };//</attach .sendStatement() function>


  //  ╔═╗╔═╗╔╗╔╔╦╗  ┌┐┌┌─┐┌┬┐┬┬  ┬┌─┐  ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬
  //  ╚═╗║╣ ║║║ ║║  │││├─┤ │ │└┐┌┘├┤   │─┼┐│ │├┤ ├┬┘└┬┘
  //  ╚═╝╚═╝╝╚╝═╩╝  ┘└┘┴ ┴ ┴ ┴ └┘ └─┘  └─┘└└─┘└─┘┴└─ ┴
  /**
   * [sendNativeQuery description]
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {String} _nativeQuery
   * @param  {Function?} explicitCb
   * @param  {Dictionary?} more
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @returns {Deferred?} if no explicit callback was provided
   */
  rdi.sendNativeQuery = function(_nativeQuery, explicitCb, more) {

    var options = {
      datastoreName: datastoreName,
      adapter: adapter,

      nativeQuery: _nativeQuery,
      meta: undefined,
      usingConnection: undefined,
    };

    if (more) {
      _.extend(options, more);
    }

    return parley(function _handleExec(done){
      helpSendNativeQuery(options, done);
    }, explicitCb, {

      meta: function(_meta){
        options.meta = _meta;
        return this;
      },

      usingConnection: function(_usingConnection){
        options.usingConnection = _usingConnection;
        return this;
      },

    });//</parley()>

  };//</attach .sendNativeQuery() function>


  //  ╔╦╗╦═╗╔═╗╔╗╔╔═╗╔═╗╔═╗╔╦╗╦╔═╗╔╗╔
  //   ║ ╠╦╝╠═╣║║║╚═╗╠═╣║   ║ ║║ ║║║║
  //   ╩ ╩╚═╩ ╩╝╚╝╚═╝╩ ╩╚═╝ ╩ ╩╚═╝╝╚╝

  /**
   * [transaction description]
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param  {Function} _during
   * @param  {Function?} explicitCb
   * @param  {Dictionary?} more
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @returns {Deferred?} if no explicit callback was provided
   */
  rdi.transaction = function(_during, explicitCb, more) {

    var options = {
      datastoreName: datastoreName,
      adapter: adapter,

      during: _during,
      meta: undefined,
    };

    if (more) {
      _.extend(options, more);
    }

    return parley(function _handleExec(done){
      helpRunTransaction(options, done);
    }, explicitCb, {

      meta: function(_meta){
        options.meta = _meta;
        return this;
      }

    });//</parley()>

  };//</attach .transaction() function>

  // Now that we've gotten it all ready to go, return our registered
  // datastore instance.
  return rdi;

};
