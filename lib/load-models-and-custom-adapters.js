/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');
var async = require('async');
var validateAdapter = require('./validate-adapter');



/**
 * loadModelsAndCustomAdapters()
 *
 * Load this app's models and custom adapters (i.e. from `api/models/` and `api/adapters/`)
 * onto `hook.models` and `hook.adapters`.  Custom adapters will be validated.
 *
 * (These dictionaries are also aliased as `sails.models` and `sails.adapters`.)
 *
 * @param  {Dictionary} hook
 * @param  {SailsApp} sails
 * @param  {Function} done
 *         @param {Error} err
 */
module.exports = function loadModelsAndCustomAdapters(hook, sails, done) {
  sails.log.silly('Loading the app\'s models and any custom adapters...');

  async.auto({

    models: function(next) {
      sails.log.silly('Loading app models...');

      // Load app's model definitions
      // Case-insensitive, using filename to determine identity.
      // (This calls out to the `moduleloader` hook, which uses `sails-build-dictionary` and `includeall`
      //  to `require` and collate the relevant code for these modules-- also adding an appropriate `globalId`
      //  property.  If configured to do so, Sails will use this `globalId` to expose your models process-wide
      //  as globals.)
      sails.modules.loadModels(function modulesLoaded(err, modelDefs) {

        if (err) {
          if (err.code === 'include-all:DUPLICATE' && err.duplicateIdentity) {
            return next(new Error(
                            '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                            'Attempted to load two models with the same identity (`' + err.duplicateIdentity + '`).  Please rename one of the files.\n'+
                            'The model identity is the lower-cased version of the filename.\n'+
                            '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));
          }
          return next(err);
        }

        // Update the dictionary of models stored on our hook (`sails.hooks.orm.models`).
        // Note that the reference on the app instance (`sails.models`) is just an alias of this.
        _.extend(hook.models, modelDefs);

        // Loop through models and coerce `connection` to `datastore` with a warning.
        _.each(hook.models, function(modelDef, modelIdentity) {
          if (modelDef.connection) {
            sails.log.debug('In model `' + modelIdentity + '`: the `connection` setting is deprecated.  Please use `datastore` instead.\n');
            modelDef.datastore = modelDef.connection;
          }
        });

        return next();
      });
    },

    adapters: function(next) {
      sails.log.silly('Loading app adapters...');

      // Load custom adapters
      // Case-insensitive, using filename to determine identity
      sails.modules.loadAdapters(function modulesLoaded(err, customAdapters) {
        if (err) { return next(err); }

        // Validate/normalize custom adapters, and store the normalized versions
        // in the dictionary of adapters exposed on our hook (`sails.hooks.orm.adapters`).
        // Note that the reference on the app instance (`sails.adapters`) is just an alias of this.
        try {
          _.each(_.keys(customAdapters), function (identity) {
            hook.adapters[identity] = validateAdapter(customAdapters[identity], identity);
          });
        }
        catch (e) {
          return next(e);
        }

        return next();
      });
    }

  }, done);
};
