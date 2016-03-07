/**
 * Module dependencies
 */

var path = require('path');
var _ = require('lodash');
var unrecognizedDatastoreError = require('../constants/unrecognized-datastore.error');
var invalidDatastoreError = require('../constants/invalid-datastore.error');
var constructError = require('./construct-error');
var loadAdapterFromAppDependencies = require('./load-adapter-from-app-dependencies');


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
 * @required {String}  datastoreIdentity [f.k.a. "connection" identity]
 * @optional {String}  modelIdentity [Identity of the model this datastore came from. Optional, improves quality of error messages.]
 * @required {Dictionary} hook
 * @required {SailsApp} sails
 *
 * @returns {Dictionary} [datastore/connection]
 * @throws {Error} E_ADAPTER_NOT_COMPATIBLE
 * @throws {Error} E_ADAPTER_NOT_INSTALLED
 * @throws {Error} E_COULD_NOT_LOAD_ADAPTER
 * @throws {Error} E_UNRECOGNIZED_DATASTORE
 * @throws {Error} E_INVALID_DATASTORE
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

  // The `adapter` property of the datastore config is usually the package name of an adapter,
  // but it also sometimes might be the adapter's identity (for custom adapters).
  var adapterIdentity = datastoreConfig.adapter;

  // Adapter is required for a datastore.
  if (!adapterIdentity) {
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
  //
  // Check if the referenced adapter has aready been loaded one way or another.
  if (!hook.adapters[adapterIdentity]) {
    // If it hasn't, we'll try and load it as a dependency from the app's `node_modules/` folder.
    hook.adapters[adapterIdentity] = loadAdapterFromAppDependencies(adapterIdentity, datastoreIdentity, sails);
  }


  //  ╔╗╔╔═╗╦═╗╔╦╗╔═╗╦  ╦╔═╗╔═╗  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐  ┌─┐┌─┐┌┐┌┌─┐┬┌─┐
  //  ║║║║ ║╠╦╝║║║╠═╣║  ║╔═╝║╣    ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤   │  │ ││││├┤ ││ ┬
  //  ╝╚╝╚═╝╩╚═╩ ╩╩ ╩╩═╝╩╚═╝╚═╝  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘  └─┘└─┘┘└┘└  ┴└─┘

  // Now build our normalized datastore config to return.
  var normalizedDatastoreConfig = {};

  // Adapters can provide a `defaults` dictionary which serves as a set of default properties for datastore config.
  // Since the adapter has already been validated, we know it exists; so use that as the basis for
  // our normalized datastore configuration. (note: this step may eventually supported by Waterline core, in which case it could be removed here)
  _.extend(normalizedDatastoreConfig, hook.adapters[adapterIdentity].defaults);

  // And then merge in the the app-level datastore configuration.
  _.extend(normalizedDatastoreConfig, datastoreConfig);


  // Success- datastore has been normalized and validated.
  // (any missing adapters were either loaded (synchronously),
  //  or the loading process was stopped w/ a fatal error)
  return normalizedDatastoreConfig;
};
