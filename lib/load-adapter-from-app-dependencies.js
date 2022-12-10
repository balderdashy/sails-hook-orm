/**
 * Module dependencies
 */

var fs = require('fs');
var Path = require('path');
var validateAdapter = require('./validate-adapter');
var constructError = require('./construct-error');
var adapterNotInstalledError = require('../constants/adapter-not-installed.error');
var couldNotLoadAdapterError = require('../constants/could-not-load-adapter.error');



/**
 * loadAdapterFromAppDependencies()
 *
 * Attempt to load an adapter from the Sails app's node_modules directory, and then
 * validate it (checking for deprecation errors, etc).
 *
 * @required  {String} adapterPackageName
 * @optional  {String} datastoreIdentity  [just to make error messages nicer]
 * @required  {SailsApp} sails
 *
 * @returns {Dictionary} [adapter]
 * @throws {Error} E_ADAPTER_NOT_INSTALLED
 * @throws {Error} E_COULD_NOT_LOAD_ADAPTER
 * @throws {Error} E_ADAPTER_NOT_COMPATIBLE
 */

module.exports = function loadAdapterFromAppDependencies(adapterPackageName, datastoreIdentity, sails, reloadAdapter) {

  //  ╦  ╔═╗╔═╗╔╦╗  ╔═╗╔╦╗╔═╗╔═╗╔╦╗╔═╗╦═╗
  //  ║  ║ ║╠═╣ ║║  ╠═╣ ║║╠═╣╠═╝ ║ ║╣ ╠╦╝
  //  ╩═╝╚═╝╩ ╩═╩╝  ╩ ╩═╩╝╩ ╩╩   ╩ ╚═╝╩╚═
  //  ┌─  ┌─┐┬─┐┌─┐┌┬┐  ┌─┐┌─┐┌─┐  ┌┐┌┌─┐┌┬┐┌─┐    ┌┬┐┌─┐┌┬┐┬ ┬┬  ┌─┐┌─┐  ┌─┐┌─┐┬  ┌┬┐┌─┐┬─┐  ─┐
  //  │───├┤ ├┬┘│ ││││  ├─┤├─┘├─┘  ││││ │ ││├┤     ││││ │ │││ ││  ├┤ └─┐  ├┤ │ ││   ││├┤ ├┬┘───│
  //  └─  └  ┴└─└─┘┴ ┴  ┴ ┴┴  ┴    ┘└┘└─┘─┴┘└─┘────┴ ┴└─┘─┴┘└─┘┴─┘└─┘└─┘  └  └─┘┴─┘─┴┘└─┘┴└─  ─┘

  // Since it is unknown so far, try and load the adapter from `node_modules`
  sails.log.verbose('Loading adapter (`%s`) from this app\'s `node_modules/` directory...', adapterPackageName);

  // Before trying to actually require the adapter, determine the path to the module
  // relative to the app we're loading:
  var userlandDependenciesPath = Path.resolve(sails.config.appPath, 'node_modules');
  var adapterPackagePath = Path.join(userlandDependenciesPath, adapterPackageName);


  // Now try to require the adapter from userland dependencies (node_modules of the sails app).
  var adapter;
  try {
    // This is a work around so we don't have to modify each adapter interface. By default, NodeJS
    // module system requires files with a cache. Because of that, each adapter will be a Singleton
    // so we can't have two instances of Sails using the same adapter, making Sails unuseful for
    // multi-same-technology-databases.
    // The ideal solution would be that adapters export a function instead of an object, so each
    // adapter can choose what to cache and what not. But that will imply a breaking change in all
    // the adapters interfaces.
    if (reloadAdapter) {
      delete require.cache[require.resolve(adapterPackagePath)];
    }
    adapter = require(adapterPackagePath);
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


  //  ╔═╗╦ ╦╔═╗╔═╗╦╔═  ╔═╗╔╦╗╔═╗╔═╗╔╦╗╔═╗╦═╗  ╔═╗╔═╗╔╦╗╔═╗╔═╗╔╦╗╦╔╗ ╦╦  ╦╔╦╗╦ ╦
  //  ║  ╠═╣║╣ ║  ╠╩╗  ╠═╣ ║║╠═╣╠═╝ ║ ║╣ ╠╦╝  ║  ║ ║║║║╠═╝╠═╣ ║ ║╠╩╗║║  ║ ║ ╚╦╝
  //  ╚═╝╩ ╩╚═╝╚═╝╩ ╩  ╩ ╩═╩╝╩ ╩╩   ╩ ╚═╝╩╚═  ╚═╝╚═╝╩ ╩╩  ╩ ╩ ╩ ╩╚═╝╩╩═╝╩ ╩  ╩
  //
  // Validate & normalize.
  adapter = validateAdapter(adapter, adapterPackageName, datastoreIdentity);

  return adapter;
};
