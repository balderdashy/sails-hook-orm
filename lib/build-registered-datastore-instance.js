/**
 * Module dependencies
 */

var assert = require('assert');
var _ = require('@sailshq/lodash');
var parley = require('parley');
var flaverr = require('flaverr');
var helpLeaseConnection = require('./datastore-method-utils/help-lease-connection');
var helpSendStatement = require('./datastore-method-utils/help-send-statement');
var helpSendNativeQuery = require('./datastore-method-utils/help-send-native-query');
var helpRunTransaction = require('./datastore-method-utils/help-run-transaction');


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
 * @returns {Dictionary} a new registered datastore instance (or "RDI")
 *          @property {String} name
 *          @property {Dictionary} config
 *          @property {Ref} driver
 *          @property {Ref} manager
 *          @property {Function} leaseConnection
 *          @property {Function} transaction
 *          @property {Function} sendNativeQuery
 *          @property {Function} sendStatement
 */
module.exports = function buildRegisteredDatastoreInstance(datastoreName, normalizedDatastoreConfig, adapter) {

  // Set up our `rdi` (registered datastore instance).
  var rdi = {};

  // Set the `name` property.
  rdi.name = datastoreName;

  // Set up the `config` property, but use the normalized configuration.
  // (this might slightly vary from the `config` property of the DS entry
  // from the underlying adapter-- if the adapter even exposes one in the
  // first place)
  rdi.config = normalizedDatastoreConfig;

  // Now check whether this adapter is compatible w/ datastore methods in general.
  var genericDoesNotSupportDatastoreMethodsError;

  var GENERIC_UNSUPPORTED_DSM_ERROR_MSG_SUFFIX = ''+
  'If there is an older/ newer version of this adapter, try updating the semver range for this dependency '+
  'in your package.json file.  If you aren\'t sure, check the repo on GitHub, or contact the adapter\'s '+
  'maintainer.  If you *are* the maintainer of this adapter and need help, visit http://sailsjs.com/support.';

  // If this adapter doesn't expose its datastores, then we can't provide any
  // functional datastore methods to allow userland code to work with them.
  //
  // > This is relevant for older adapters, or adapters which only support usage
  // > via models.  Note that this partial level of support may no longer be an
  // > option in future versions of Sails and Waterline.
  if (!_.has(adapter, 'datastores')) {
    genericDoesNotSupportDatastoreMethodsError = flaverr('E_NOT_SUPPORTED', new Error(
      'The adapter used by the `' + datastoreName + '` datastore does not expose '+
      'direct access to its internal datastore entries for use outside the adapter.  '+
      '(It would need to set its own `datastores` property in order to use this method.)\n'+
      GENERIC_UNSUPPORTED_DSM_ERROR_MSG_SUFFIX
    ));
  }
  else {

    // Try to find the adapter datastore being used.
    //
    // > This should exist in a standardized form to allow us to talk directly to
    // > the driver and access the live manager instance.)
    var adapterDSEntry = adapter.datastores[datastoreName];

    if (!adapterDSEntry) {
      genericDoesNotSupportDatastoreMethodsError = flaverr('E_NOT_SUPPORTED', new Error(
        'The adapter used by the `' + datastoreName + '` datastore does not fully support '+
        'this method.  The adapter\'s exposed `datastores` dictionary is invalid, or is '+
        'missing the expected entry for `' + datastoreName + '`.  (There may be a bug!  '+
        'Or... this adapter might just not support the thing you\'re trying to do.)\n'+
        GENERIC_UNSUPPORTED_DSM_ERROR_MSG_SUFFIX
      ));
    }
    else {

      // Validate that the raw adapter datastore entry we just located provides the right
      // information in the right format.  If it conforms to the spec, it should have
      // `manager`, `driver`, and `config` keys.
      //
      // > Otherwise, we wouldn't actually be capable of running the datastore methods.
      if (!_.has(adapterDSEntry, 'manager') || !_.has(adapterDSEntry, 'driver') || !_.has(adapterDSEntry, 'config')) {
        genericDoesNotSupportDatastoreMethodsError = flaverr('E_NOT_SUPPORTED', new Error(
          'The adapter used by the `' + datastoreName + '` datastore does not fully support '+
          'this method.  The adapter exposes its internal datastore entries as `datastores`, '+
          'and that dictionary even contains the expected datastore entry for `' + datastoreName + '`.  '+
          'But the entry is missing one or more mandatory keys, like `driver`, `manager`, '+
          'or `config`.  (There may be a bug!  Or... this adapter might just not support '+
          'the thing you\'re trying to do.)\n'+
          GENERIC_UNSUPPORTED_DSM_ERROR_MSG_SUFFIX
        ));
      }
      // Otherwise, we know we must have access to a `manager` and `driver`,
      // so set references to both of them on the RDI.
      else {
        rdi.manager = adapterDSEntry.manager;
        rdi.driver = adapterDSEntry.driver;
      }//</else>

    }//</else>

  }//</else>

  //>-




  // Now, assuming it is accessible, check the driver to see what interface layer it supports.
  //
  // > This is used below to determine whether particular high-level datastore methods are
  // > permitted to run.  For example, we prevent you from calling `sendStatement()` if the
  // > driver does not implement the "queryable" interface layer; that is, if it doesn't have
  // > a particular set of methods.
  // >
  // > (Note that datastore methods can also fail due to something generic, like the fact that
  // > datstore methods aren't supported by this adapter AT ALL.  That was just checked above.)
  var isConnectable;
  var isQueryable;
  var isTransactional;

  if (!genericDoesNotSupportDatastoreMethodsError) {

    assert(_.isObject(adapter.datastores[datastoreName].driver), 'At this point in the code, we should have already verified that the driver is a dictionary-- but it is not!');

    var driverMethodNames = _.keys(adapter.datastores[datastoreName].driver);

    isConnectable = _.difference([
      'createManager',
      'destroyManager',
      'getConnection',
      'releaseConnection'
    ], driverMethodNames)
    .length === 0;

    isQueryable = isConnectable && _.difference([
      'sendNativeQuery',
      'compileStatement',
      'parseNativeQueryResult',
      'parseNativeQueryError'
    ], driverMethodNames)
    .length === 0;

    isTransactional = isQueryable && _.difference([
      'beginTransaction',
      'commitTransaction',
      'rollbackTransaction'
    ], driverMethodNames)
    .length === 0;

  }//>-


  //  ╔═╗╦ ╦╔═╗╔╦╗╔═╗╔╗╔╔╦╗  ┌┬┐┬ ┬┌─┐  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐
  //  ╠═╣║ ║║ ╦║║║║╣ ║║║ ║    │ ├─┤├┤    ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤
  //  ╩ ╩╚═╝╚═╝╩ ╩╚═╝╝╚╝ ╩    ┴ ┴ ┴└─┘  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘
  //  ┬ ┬┬┌┬┐┬ ┬  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐  ┌─┐┬ ┬┌┐┌┌─┐┌┬┐┬┌─┐┌┐┌┌─┐
  //  ││││ │ ├─┤   ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤   ├┤ │ │││││   │ ││ ││││└─┐
  //  └┴┘┴ ┴ ┴ ┴  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘  └  └─┘┘└┘└─┘ ┴ ┴└─┘┘└┘└─┘
  // Augment the datastore with functions for working with it directly.
  // These are methods like `.transaction()`, `.leaseConnection()`,
  // `.sendStatement()`, and `.sendNativeQuery()`.
  //
  // > At this point, we attach datastore methods-- but note that, if there was any
  // > relevant error detected above, then the datastore methods will simply act as
  // > stubs that send back that error.

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
   * @param  {Dictionary?} _meta
   * @param  {Dictionary?} more
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @returns {Deferred?} if no explicit callback was provided
   */
  rdi.leaseConnection = function(_during, explicitCb, _meta, more) {

    var options = {
      manager: rdi.manager,
      driver: rdi.driver,

      during: _during,
      meta: _meta,
    };

    if (more) {
      _.extend(options, more);
    }

    return parley(function _handleExec(done){

      if (genericDoesNotSupportDatastoreMethodsError) {
        return done(genericDoesNotSupportDatastoreMethodsError);
      }

      if (!isConnectable) {
        return done(flaverr('E_NOT_SUPPORTED', new Error(
          'Cannot use `.leaseConnection()` with this datastore because the underlying adapter '+
          'does not implement the "connectable" interface layer.  This may be because of a '+
          'natural limitation of the technology, or it could just be that the adapter\'s '+
          'developer(s) have not finished implementing one or more driver methods.'
        )));
      }

      if (!_.isFunction(options.during)) {
        return done(flaverr({ name: 'UsageError' }, new Error(
          'Invalid `during` function passed in to `.leaseConnection()`.  (Not a function!)'
        )));
      }

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
   * @param  {Dictionary?} _meta
   * @param  {Dictionary?} more
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @returns {Deferred?} if no explicit callback was provided
   */
  rdi.sendStatement = function(_statement, explicitCb, _meta, more) {

    var options = {
      manager: rdi.manager,
      driver: rdi.driver,
      connection: undefined,

      statement: _statement,
      meta: _meta,
    };

    if (more) {
      _.extend(options, more);
    }

    return parley(function _handleExec(done){

      if (genericDoesNotSupportDatastoreMethodsError) {
        return done(genericDoesNotSupportDatastoreMethodsError);
      }

      if (!isQueryable) {
        return done(flaverr('E_NOT_SUPPORTED', new Error(
          'Cannot use `.sendStatement()` with this datastore because the underlying adapter '+
          'does not implement the "queryable" interface layer.  This may be because of a '+
          'natural limitation of the technology, or it could just be that the adapter\'s '+
          'developer(s) have not finished implementing one or more driver methods.'
        )));
      }

      if (!_.isObject(options.statement)) {
        return done(flaverr({ name: 'UsageError' }, new Error(
          'Invalid statement passed in to `.sendStatement()`.  (See http://sailsjs.com/docs/reference/waterline-orm/datstores/send-statement)'
        )));
      }

      helpSendStatement(options, done);

    }, explicitCb, {

      meta: function(_meta){
        options.meta = _meta;
        return this;
      },

      usingConnection: function(_usingConnection){
        options.connection = _usingConnection;
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
   * @param  {Array} _valuesToEscape
   * @param  {Function?} explicitCb
   * @param  {Dictionary?} _meta
   * @param  {Dictionary?} more
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @returns {Deferred?} if no explicit callback was provided
   */
  rdi.sendNativeQuery = function(_nativeQuery, _valuesToEscape, explicitCb, _meta, more) {

    // Handle variadic usage:
    // ```
    // sendNativeQuery('foo', function(){...})
    // ```
    if (arguments.length === 2 && _.isFunction(_valuesToEscape)) {
      explicitCb = _valuesToEscape;
      _valuesToEscape = undefined;
    }
    // ```
    // sendNativeQuery('foo', function(){...}, ()=>{…})
    // ```
    else if (arguments.length === 3 && _.isFunction(_valuesToEscape)) {
      _meta = explicitCb;
      explicitCb = _valuesToEscape;
      _valuesToEscape = undefined;
    }


    var options = {
      manager: rdi.manager,
      driver: rdi.driver,
      connection: undefined,

      nativeQuery: _nativeQuery,
      valuesToEscape: _valuesToEscape,
      meta: _meta,
    };

    if (more) {
      _.extend(options, more);
    }

    return parley(function _handleExec(done){

      if (genericDoesNotSupportDatastoreMethodsError) {
        return done(genericDoesNotSupportDatastoreMethodsError);
      }

      if (!isQueryable) {
        return done(flaverr('E_NOT_SUPPORTED', new Error(
          'Cannot use `.sendNativeQuery()` with this datastore because the underlying adapter '+
          'does not implement the "queryable" interface layer.  This may be because of a '+
          'natural limitation of the technology, or it could just be that the adapter\'s '+
          'developer(s) have not finished implementing one or more driver methods.'
        )));
      }

      if (!options.nativeQuery) {
        return done(flaverr({ name: 'UsageError' }, new Error(
          'Invalid native query passed in to `.sendNativeQuery()`.  (Must be truthy-- e.g. "SELECT * FROM foo")'
        )));
      }

      helpSendNativeQuery(options, done);

    }, explicitCb, {

      meta: function(_meta){
        options.meta = _meta;
        return this;
      },

      usingConnection: function(_usingConnection){
        options.connection = _usingConnection;
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
   * @param  {Dictionary?} _meta
   * @param  {Dictionary?} more
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @returns {Deferred?} if no explicit callback was provided
   */
  rdi.transaction = function(_during, explicitCb, _meta, more) {

    var options = {
      manager: rdi.manager,
      driver: rdi.driver,

      during: _during,
      meta: _meta,
    };

    if (more) {
      _.extend(options, more);
    }

    return parley(function _handleExec(done){

      if (genericDoesNotSupportDatastoreMethodsError) {
        return done(genericDoesNotSupportDatastoreMethodsError);
      }

      if (!isTransactional) {
        return done(flaverr('E_NOT_SUPPORTED', new Error(
          'Cannot use `.transaction()` with this datastore because the underlying adapter '+
          'does not implement the "transactional" interface layer.  This may be because of a '+
          'natural limitation of the technology, or it could just be that the adapter\'s '+
          'developer(s) have not finished implementing one or more driver methods.'
        )));
      }

      if (!_.isFunction(options.during)) {
        return done(flaverr({ name: 'UsageError' }, new Error(
          'Invalid `during` function passed in to `.transaction()`.  (Not a function!)'
        )));
      }

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
