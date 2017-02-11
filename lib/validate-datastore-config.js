/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');
var unrecognizedDatastoreError = require('../constants/unrecognized-datastore.error');
var invalidDatastoreError = require('../constants/invalid-datastore.error');
var constructError = require('./construct-error');
var validateAdapter = require('./validate-adapter');

/**
 * validateDatastoreConfig()
 *
 * Normalize and validate the provided datastore (fka "connection") configuration.
 *
 * @required {String}  datastoreIdentity [f.k.a. "connection" identity]
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

module.exports = function validateDatastoreConfig(datastoreIdentity, hook, sails){

  //  ╔═╗╔═╗╦═╗╔═╗╔═╗╦═╗╔╦╗  ╔╗ ╔═╗╔═╗╦╔═╗  ╦  ╦╔═╗╦  ╦╔╦╗╔═╗╔╦╗╦╔═╗╔╗╔
  //  ╠═╝║╣ ╠╦╝╠╣ ║ ║╠╦╝║║║  ╠╩╗╠═╣╚═╗║║    ╚╗╔╝╠═╣║  ║ ║║╠═╣ ║ ║║ ║║║║
  //  ╩  ╚═╝╩╚═╚  ╚═╝╩╚═╩ ╩  ╚═╝╩ ╩╚═╝╩╚═╝   ╚╝ ╩ ╩╩═╝╩═╩╝╩ ╩ ╩ ╩╚═╝╝╚╝
  //  ┌─  ┌─┐┌─┐  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐  ┌─┐┌─┐┌┐┌┌─┐┬┌─┐  ─┐
  //  │───│ │├┤    ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤   │  │ ││││├┤ ││ ┬───│
  //  └─  └─┘└    ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘  └─┘└─┘┘└┘└  ┴└─┘  ─┘

  // If the specified datastore configuration has not been specified, then throw a fatal error.
  var datastoreConfig = sails.config.datastores[datastoreIdentity];
  if (!datastoreConfig) {
    throw constructError(unrecognizedDatastoreError, {
      datastoreIdentity: datastoreIdentity
    });
  }


  var adapterIdentity;

  // If `adapter` property of the datastore is a dictionary, then assume
  // that this is an inline adapter definition (e.g. `require('sails-mysql')`).
  if (_.isObject(datastoreConfig.adapter)) {

    // The adapter must have an identity (e.g. `sails-mongo`).
    if (!datastoreConfig.adapter.identity) {
      throw new Error('Consistency violation: the adapter for datastore `' + datastoreIdentity + '` does not have an `identity` property.');
    }

    // Adapter identities must be unique.
    if (hook.adapters[datastoreConfig.adapter.identity] && hook.adapters[datastoreConfig.adapter.identity] !== datastoreConfig.adapter) {
      throw new Error('Consistency violation: attempted to load two different data adapters with the identity `' + datastoreConfig.adapter.identity + '`.');
    }

    // Shortcut reference to the adapter's identity.
    adapterIdentity = datastoreConfig.adapter.identity;

    // Then we'll validate our inline adapter definition.
    // (note that this is mutating it inline!)
    datastoreConfig.adapter = validateAdapter(datastoreConfig.adapter, adapterIdentity, datastoreIdentity);

    // Next, we'll register the adapter.
    hook.adapters[adapterIdentity] = datastoreConfig.adapter;

    // And finally, we'll change the datastore configuration dictionary so that its
    // `adapter` property is actually a string again.
    datastoreConfig.adapter = adapterIdentity;

  }
  // Else if it is a string, the `adapter` property of the datastore config is usually
  // the package name of an adapter, but it also sometimes might be the adapter's
  // "identity" (for custom, defined-in-app adapters).
  else if (_.isString(datastoreConfig.adapter) && datastoreConfig.adapter !== '') {
    adapterIdentity = datastoreConfig.adapter;
  }
  // The `adapter` property is required for a datastore config dictionary.
  else {
    // Invalid datastore found; throw fatal error.
    throw constructError(invalidDatastoreError, {
      datastoreIdentity: datastoreIdentity
    });
  }



  //  ╔╗╔╔═╗╦═╗╔╦╗╔═╗╦  ╦╔═╗╔═╗  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐  ┌─┐┌─┐┌┐┌┌─┐┬┌─┐
  //  ║║║║ ║╠╦╝║║║╠═╣║  ║╔═╝║╣    ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤   │  │ ││││├┤ ││ ┬
  //  ╝╚╝╚═╝╩╚═╩ ╩╩ ╩╩═╝╩╚═╝╚═╝  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘  └─┘└─┘┘└┘└  ┴└─┘

  // Now build our normalized datastore config to return.
  var normalizedDatastoreConfig = {};

  // Adapters can provide a `defaults` dictionary which serves as a set of default properties for datastore config.
  // If an adapter exists for this datastore, we know it has already been validated; so we can safely use that as
  // the basis for our normalized datastore configuration. (note: this step may eventually supported by Waterline core,
  // in which case it could be removed here)
  if (hook.adapters[adapterIdentity]) {
    _.extend(normalizedDatastoreConfig, hook.adapters[adapterIdentity].defaults);
  }

  // Either way, then merge in the the app-level datastore configuration.
  _.extend(normalizedDatastoreConfig, datastoreConfig);

  // If the datastore config has a `url` property, trim any trailing slashes off of it.
  if (_.isString(normalizedDatastoreConfig.url)) {
    normalizedDatastoreConfig.url = normalizedDatastoreConfig.url.replace(/\/$/,'');
  }

  // Success- datastore has been normalized and validated.
  // (any missing adapters were ignored)
  return normalizedDatastoreConfig;
};
