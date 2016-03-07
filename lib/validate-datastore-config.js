/**
 * Module dependencies
 */

var path = require('path');
var fs = require('fs');
var _ = require('lodash');
var adapterNotInstalledError = require('../constants/adapter-not-installed.error');
var couldNotLoadAdapterError = require('../constants/could-not-load-adapter.error');
var adapterNotCompatibleError = require('../constants/adapter-not-compatible.error');
var unrecognizedDatastoreError = require('../constants/unrecognized-datastore.error');
var invalidDatastoreError = require('../constants/invalid-datastore.error');
var constructError = require('./construct-error');


/**
 * validateDatastoreConfig()
 *
 * Normalize and validate the provided datastore (fka "connection") configuration,
 * as well as its adapter (handles deprecation warnings).
 *
 * ----------------------------------------------------------------------------
 * > ##### IMPORTANT
 * > If the datastore's referenced adapter has not been loaded yet, this function
 * > WILL ATTEMPT TO REQUIRE IT from this app's `node_modules` folder.
 * ----------------------------------------------------------------------------
 *
 * @required {String}  datastoreIdentity (f.k.a. "connection" identity)
 *
 * @required {String}  modelIdentity
 *          Identity of the model this connection came from
 *          (Optional, improves quality of error messages.)
 *
 * @required {Dictionary} hook
 *
 * @required {SailsApp} sails
 *
 *
 * @returns {Dictionary} [datastore/connection]
 * @throws {Error} E_ADAPTER_NOT_COMPATIBLE
 * @throws {Error} E_ADAPTER_NOT_INSTALLED
 * @throws {Error} E_COULD_NOT_LOAD_ADAPTER
 * @throws {Error} E_UNRECOGNIZED_DATASTORE
 * @throws {Error} E_INVALID_DATASTORE
 *
 * @api private
 */

module.exports = function validateDatastoreConfig(datastoreIdentity, modelIdentity, hook, sails){

  //  ╔═╗╔═╗╦═╗╔═╗╔═╗╦═╗╔╦╗  ╔╗ ╔═╗╔═╗╦╔═╗  ╦  ╦╔═╗╦  ╦╔╦╗╔═╗╔╦╗╦╔═╗╔╗╔
  //  ╠═╝║╣ ╠╦╝╠╣ ║ ║╠╦╝║║║  ╠╩╗╠═╣╚═╗║║    ╚╗╔╝╠═╣║  ║ ║║╠═╣ ║ ║║ ║║║║
  //  ╩  ╚═╝╩╚═╚  ╚═╝╩╚═╩ ╩  ╚═╝╩ ╩╚═╝╩╚═╝   ╚╝ ╩ ╩╩═╝╩═╩╝╩ ╩ ╩ ╩╚═╝╝╚╝
  //  ┌─  ┌─┐┌─┐  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐  ┌─┐┌─┐┌┐┌┌─┐┬┌─┐  ─┐
  //  │───│ │├┤    ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤   │  │ ││││├┤ ││ ┬───│
  //  └─  └─┘└    ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘  └─┘└─┘┘└┘└  ┴└─┘  ─┘

  // If the specified datastore configuration has not been specified, then throw a fatal error.
  var datastoreConfig = sails.config.connections[datastoreIdentity];
  if (!datastoreConfig) {
    throw constructError(unrecognizedDatastoreError, {
      datastoreIdentity: datastoreIdentity,
      modelIdentity: modelIdentity
    });
  }

  // The `adapter` property of the datastore config is the package name of an adapter.
  var adapterPackageName = datastoreConfig.adapter;

  // Adapter is required for a datastore.
  if (!adapterPackageName) {
    // Invalid datastore found; throw fatal error.
    throw constructError(invalidDatastoreError, {
      datastoreIdentity: datastoreIdentity,
      modelIdentity: modelIdentity
    });
  }


  //  ╦  ╔═╗╔═╗╔╦╗  ╔═╗╔╦╗╔═╗╔═╗╔╦╗╔═╗╦═╗
  //  ║  ║ ║╠═╣ ║║  ╠═╣ ║║╠═╣╠═╝ ║ ║╣ ╠╦╝
  //  ╩═╝╚═╝╩ ╩═╩╝  ╩ ╩═╩╝╩ ╩╩   ╩ ╚═╝╩╚═
  //  ┌─  ┌─┐┬─┐┌─┐┌┬┐  ┌─┐┌─┐┌─┐  ┌┐┌┌─┐┌┬┐┌─┐    ┌┬┐┌─┐┌┬┐┬ ┬┬  ┌─┐┌─┐  ┌─┐┌─┐┬  ┌┬┐┌─┐┬─┐  ─┐
  //  │───├┤ ├┬┘│ ││││  ├─┤├─┘├─┘  ││││ │ ││├┤     ││││ │ │││ ││  ├┤ └─┐  ├┤ │ ││   ││├┤ ├┬┘───│
  //  └─  └  ┴└─└─┘┴ ┴  ┴ ┴┴  ┴    ┘└┘└─┘─┴┘└─┘────┴ ┴└─┘─┴┘└─┘┴─┘└─┘└─┘  └  └─┘┴─┘─┴┘└─┘┴└─  ─┘

  // Check if the referenced adapter has aready been loaded one way or another.
  // If it hasn't, we'll try and load it as a dependency from `node_modules`
  if (!hook.adapters[adapterPackageName]) {

    // Since it is unknown so far, try and load the adapter from `node_modules`
    sails.log.verbose('Loading adapter (', adapterPackageName, ') for ' + modelIdentity, ' from `node_modules` directory...');

    // Before trying to actually require the adapter, determine the path to the module
    // relative to the app we're loading:
    var userlandDependenciesPath = path.resolve(sails.config.appPath, 'node_modules');
    var adapterPackagePath = path.join(userlandDependenciesPath, adapterPackageName);

    // Now try to require the adapter from userland dependencies (node_modules of the sails app).
    try {
      hook.adapters[adapterPackageName] = require(adapterPackagePath);
    } catch (e) {
      // If there was a problem loading the adapter,
      // then check to make sure the package exists in the `node_modules/` directory.
      if (!fs.existsSync(adapterPackagePath)) {
        // If adapter package doesn't exist, that means it is not installed, so we throw a refined error.
        throw constructError(adapterNotInstalledError, {
          adapterPackageName: adapterPackageName,
          datastoreIdentity: datastoreIdentity
        });
      }
      // Otherwise we have no idea what crazy stuff is going on in there, so throw a more generic
      // invalid adapter error.
      else {
        throw constructError(couldNotLoadAdapterError, {
          adapterPackageName: adapterPackageName,
          originalErrorStackTrace: e.stack,
          datastoreIdentity: datastoreIdentity
        });
      }
    }
  }//</adapter package wasn't already loaded>




  //  ╔═╗╦ ╦╔═╗╔═╗╦╔═  ╔═╗╔╦╗╔═╗╔═╗╔╦╗╔═╗╦═╗  ╔═╗╔═╗╔╦╗╔═╗╔═╗╔╦╗╦╔╗ ╦╦  ╦╔╦╗╦ ╦
  //  ║  ╠═╣║╣ ║  ╠╩╗  ╠═╣ ║║╠═╣╠═╝ ║ ║╣ ╠╦╝  ║  ║ ║║║║╠═╝╠═╣ ║ ║╠╩╗║║  ║ ║ ╚╦╝
  //  ╚═╝╩ ╩╚═╝╚═╝╩ ╩  ╩ ╩═╩╝╩ ╩╩   ╩ ╚═╝╩╚═  ╚═╝╚═╝╩ ╩╩  ╩ ╩ ╩ ╩╚═╝╩╩═╝╩ ╩  ╩
  //  ┌─  ┌─┐┬ ┬┌─┐┬ ┬  ┌┬┐┌─┐┌─┐┬─┐┌─┐┌─┐┌─┐┌┬┐┬┌─┐┌┐┌  ┌┬┐┌─┐┌─┐┌─┐   ┌─┐┌┬┐┌─┐    ─┐
  //  │───└─┐├─┤│ ││││   ││├┤ ├─┘├┬┘├┤ │  ├─┤ │ ││ ││││  │││└─┐│ ┬└─┐   ├┤  │ │    ───│
  //  └─  └─┘┴ ┴└─┘└┴┘  ─┴┘└─┘┴  ┴└─└─┘└─┘┴ ┴ ┴ ┴└─┘┘└┘  ┴ ┴└─┘└─┘└─┘┘  └─┘ ┴ └─┘    ─┘

  // Compatibility check: If the adapter has a `registerCollection` property, it must be a v0.9.x adapter.
  // So we throw an appropriate error.
  if (hook.adapters[adapterPackageName].registerCollection) {
    throw constructError(adapterNotCompatibleError, {
      adapterPackageName: adapterPackageName,
      datastoreIdentity: datastoreIdentity
    });
  }




  //  ╔╗╔╔═╗╦═╗╔╦╗╔═╗╦  ╦╔═╗╔═╗  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐  ┌─┐┌─┐┌┐┌┌─┐┬┌─┐
  //  ║║║║ ║╠╦╝║║║╠═╣║  ║╔═╝║╣    ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤   │  │ ││││├┤ ││ ┬
  //  ╝╚╝╚═╝╩╚═╩ ╩╩ ╩╩═╝╩╚═╝╚═╝  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘  └─┘└─┘┘└┘└  ┴└─┘

  // Now build our normalized datastore config to return.
  var normalizedDatastoreConfig = {};

  // If adapter provides a `defaults` dictionary, use that as the basis for our normalized datastore configuration.
  // (note: this step may eventually supported by Waterline core, in which case it could be removed here)
  if (hook.adapters[adapterPackageName].defaults) {
    if (!util.isFunction(hook.adapters[adapterPackageName].defaults) && !util.isArray(hook.adapters[adapterPackageName].defaults) && util.isObject(hook.adapters[adapterPackageName].defaults)) {
      _.extend(normalizedDatastoreConfig, hook.adapters[adapterPackageName].defaults);
    }
    else {
      throw constructError(couldNotLoadAdapterError, {
        adapterPackageName: adapterPackageName,
        originalErrorStackTrace: (new Error('Adapter has an invalid `defaults` property.  If provided, `defaults` should be a dictionary.')).stack,
        datastoreIdentity: datastoreIdentity
      });
    }
  }

  // And then merge in the the app-level datastore configuration.
  _.extend(normalizedDatastoreConfig, datastoreConfig);


  // Success- datastore has been normalized and validated.
  // (any missing adapters were either loaded (synchronously),
  //  or the loading process was stopped w/ a fatal error)
  return normalizedDatastoreConfig;
};
