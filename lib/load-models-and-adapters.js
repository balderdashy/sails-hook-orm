/**
 * Module dependencies
 */

var _ = require('lodash');
var async = require('async');


/**
 * loadModelsAndAdapters()
 *
 * Load this app's models and adapters (i.e. from `api/models/` and `api/adapters/`)
 * onto `hook.models` and `hook.adapters`.
 *
 * (These dictionaries are also aliased as `sails.models` and `sails.adapters`.)
 *
 * @param  {Dictionary} hook
 * @param  {SailsApp} sails
 * @param  {Function} cb
 *         @param {Error} err
 */
module.exports = function loadModelsAndAdapters(hook, sails, cb) {
  sails.log.verbose('Loading the app\'s models and adapters...');

  async.auto({

    models: function(next) {
      sails.log.verbose('Loading app models...');

      // Load app's model definitions
      // Case-insensitive, using filename to determine identity.
      // (This calls out to the `moduleloader` hook, which uses `sails-build-dictionary` and `includeall`
      //  to `require` and collate the relevant code for these modules-- also adding an appropriate `globalId`
      //  property.  If configured to do so, Sails will use this `globalId` to expose your models process-wide
      //  as globals.)
      sails.modules.loadModels(function modulesLoaded(err, modules) {
        if (err) { return next(err); }

        // Update the dictionary of models stored on our hook (`sails.hooks.orm.models`).
        // Note that the reference on the app instance (`sails.models`) is just an alias of this.
        _.merge(hook.models, modules);
        // Make careful note that this `_.merge()` is for backwards compatibility.
        // It may be replaced with `_.extend()` in a future version of Sails.

        return next();
      });
    },

    adapters: function(next) {
      sails.log.verbose('Loading app adapters...');

      // Load custom adapters
      // Case-insensitive, using filename to determine identity
      sails.modules.loadAdapters(function modulesLoaded(err, modules) {
        if (err) { return next(err); }

        // Update the dictionary of adapters stored on our hook (`sails.hooks.orm.adapters`).
        // Note that the reference on the app instance (`sails.adapters`) is just an alias of this.
        _.extend(hook.adapters, modules);

        return next();
      });
    }

  }, cb);
};
