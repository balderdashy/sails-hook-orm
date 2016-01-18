/**
 * Module dependencies
 */

var path = require('path');
var fs = require('fs');
var adapterNotInstalledError = require('../constants/adapter-not-installed.error');
var couldNotLoadAdapterError = require('../constants/could-not-load-adapter.error');
var adapterNotCompatibleError = require('../constants/adapter-not-compatible.error');
var unrecognizedDatastoreError = require('../constants/unrecognized-datastore.error');
var invalidDatastoreError = require('../constants/invalid-datastore.error');
var constructError = require('./construct-error');


/**
 * normalizeDatastore()
 *
 * Normalize properties of a datastore/connection
 * (handles deprecation warnings / validation errors and making types consistent)
 *
 * @param {String}  connection
 *                  (identity)
 *
 * @param {String}  modelID
 *          // Optional, improves quality of error messages
 *          // Identity of the model this connection came from
 *
 * @throws {Err.fatal}    __UnknownConnection__
 * @throws {Err.fatal}    __InvalidConnection__
 * @throws {Err.fatal}    __InvalidAdapter__
 * @api private
 */

module.exports = function howto_normalizeDatastore(sails){
  return function normalizeDatastore(connection, modelID) {

    // If the specified datastore configuration has not been specified, then throw a fatal error.
    var connectionObject = sails.config.connections[connection];
    if (!connectionObject) {
      throw constructError(unrecognizedDatastoreError, {
        datastoreIdentity: connection,
        modelIdentity: modelID
      });
    }

    var moduleName = connectionObject.adapter;

    // Adapter is required for a connection
    if (!connectionObject.adapter) {
      // Invalid connection found, throw fatal error.
      throw constructError(invalidDatastoreError, {
        datastoreIdentity: connection,
        modelIdentity: modelID
      });
    }

    // Check if the referenced adapter has aready been loaded one way or another.
    // If it hasn't, we'll try and load it as a dependency from `node_modules`
    if (!sails.adapters[connectionObject.adapter]) {


      ////////////////////////////////////////////////////////////////////////////////
      // This is voodoo for backwards compatibility that can probably be deleted.
      ////////////////////////////////////////////////////////////////////////////////
      // // (Format adapter name to make sure we make the best attempt we can)
      // if (!moduleName.match(/^(sails-|waterline-)/)) {
      //   moduleName = 'sails-' + moduleName;
      // }
      ////////////////////////////////////////////////////////////////////////////////

      // Since it is unknown so far, try and load the adapter from `node_modules`
      sails.log.verbose('Loading adapter (', moduleName, ') for ' + modelID, ' from `node_modules` directory...');

      // Before trying to actually require the adapter, determine the path to the module
      // relative to the app we're loading:
      var node_modules = path.resolve(sails.config.appPath, 'node_modules');
      var modulePath = path.join(node_modules, moduleName);

      // Now try to require it from the appPath (execute the code)
      try {
        sails.adapters[moduleName] = require(modulePath);
      } catch (e) {
        // If there was a problem loading the adapter,
        // then check to make sure the module exists in the `node_modules/` directory.
        if (!fs.existsSync(modulePath)) {
          // If adapter package doesn't exist, that means it is not installed, so we throw a refined error.
          throw constructError(adapterNotInstalledError, {
            adapterPackageName: moduleName,
            datastoreIdentity: connection
          });
        }
        // Otherwise we have no idea what crazy stuff is going on in there, so throw a more generic
        // invalid adapter error.
        else {
          throw constructError(couldNotLoadAdapterError, {
            adapterPackageName: moduleName,
            originalErrorStackTrace: e.stack,
            datastoreIdentity: connection
          });
        }
      }
    }//</adapter package wasn't already loaded>

    // Defaults connection object to its adapter's defaults
    // TODO: pull this out into waterline core
    var itsAdapter = sails.adapters[connectionObject.adapter];
    connection = sails.util.merge({}, itsAdapter.defaults, connectionObject);

    // Compatibility check: If the adapter has a `registerCollection` method, it must be a v0.9.x adapter.
    if (itsAdapter.registerCollection) {
      throw constructError(adapterNotCompatibleError, {
        adapterPackageName: moduleName,
        datastoreIdentity: connection
      });
    }


    // Success- connection normalized and validated
    // (any missing adapters were either acquired, or the loading process was stopped w/ a fatal error)
    return connection;
  };
};
