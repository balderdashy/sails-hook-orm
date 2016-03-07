/**
 * Module dependencies
 */

var util = require('util');
var _ = require('lodash');
var async = require('async');
var prompt = require('prompt');
var loadModelsAndAdapters = require('./lib/load-models-and-adapters');
var validateDatastoreConfig = require('./lib/validate-datastore-config');
var validateModelDef = require('./lib/validate-model-def');
var buildWaterlineOntology = require('./lib/build-waterline-ontology');



/**
 * toInitialize()
 *
 * Get the `.initialize()` function for this hook.
 *
 * @param  {Dictionary} hook
 * @param  {SailsApp} sails
 * @return {Function}
 */
module.exports = function toInitialize(hook, sails){

  /**
   * `initialize()`
   *
   * @param  {Function} done
   */
  return function initialize(done){
    sails.log.debug('\n-----------------\nThis app is loading a custom version of the `orm` hook.  See https://github.com/mikermcneil/sails-hook-orm for more information.\n-----------------');

    ////////////////////////////////////////////////////////////////////////////
    // NOTE: If a user hook needs to add or modify model definitions,
    // the hook should wait until `hook:orm:loaded`, then reload the original
    // model modules `orm/loadAppModules`. Finally, the ORM should be flushed using
    // `reload()` below.
    ////////////////////////////////////////////////////////////////////////////

    async.auto({


      // Load model and adapter definitions defined in the project
      _loadModelsAndAdapters: function (next) {
        loadModelsAndAdapters(hook, sails, next);
      },


      // Load any adapters for datastores with "forceLoadAdapter"
      // (this is because otherwise, the adapters for datastores not referenced from models will not be loaded)
      _forceLoadAdapters: function(next) {
        _.each(sails.config.connections, function(connection, connectionId) {
          if (connection.forceLoadAdapter) {
            validateDatastoreConfig(connectionId, '<FORCE>', sails);
          }
        });
        return next();
      },


      // Normalize model definitions and merge in defaults from
      // `sails.config.models.*`
      _normalizeModelDefs: ['_loadModelsAndAdapters', function (next) {
        _.each(_.keys(hook.models), function (identity) {
          var originalModelDef = hook.models[identity];
          var normalizedModelDef = validateModelDef(model, identity);
          // Note: prior to March 2016, the normalized def was merged back into
          // the original model def rather than replacing it.
          hook.models[identity] = normalizedModelDef;
        });
        return next();
      }],


      // Before continuing any further to actually start up the ORM,
      // check the migrate settings for each model to prompt the user
      // to make a decision if no migrate configuration is present.
      //
      // Note that, if this is a production environment, the `migrate`
      // setting has already been forced to "safe" when the model
      // definitions were validated/normalized.
      _doubleCheckMigration: ['_normalizeModelDefs', function (next) {

        // If there are no models, we're good.
        if (_.keys(hook.models).length === 0) {
          return next();
        }

        // If a project-wide migrate setting (sails.config.models.migrate) is defined, we're good.
        if (typeof sails.config.models.migrate !== 'undefined') {
          return next();
        }

        // Otherwise show a prompt
        console.log('-----------------------------------------------------------------');
        console.log();
        prompt.start();
        console.log('',
          'Excuse my interruption, but it looks like this app'+'\n',
          'does not have a project-wide "migrate" setting configured yet.'+'\n',
          '(perhaps this is the first time you\'re lifting it with models?)'+'\n',
          '\n',
          'In short, this setting controls whether/how Sails will attempt to automatically'+'\n',
          'rebuild the tables/collections/sets/etc. in your database schema.\n',
          'You can read more about the "migrate" setting here:'+'\n',
          'http://sailsjs.org/#!/documentation/concepts/ORM/model-settings.html?q=migrate\n'
          // 'command(⌘)+click to open links in the terminal'
        );
        console.log('',
          'In a production environment (NODE_ENV==="production") Sails always uses'+'\n',
          'migrate:"safe" to protect inadvertent deletion of your data.\n',
          'However during development, you have a few other options for convenience:'+'\n\n',
          '1. safe  - never auto-migrate my database(s). I will do it myself (by hand)','\n',
          '2. alter - auto-migrate, but attempt to keep my existing data (experimental)\n',
          '3. drop  - wipe/drop ALL my data and rebuild models every time I lift Sails\n'
        );
        console.log('What would you like Sails to do?');
        console.log();
        sails.log.info('To skip this prompt in the future, set `sails.config.models.migrate`.');
        sails.log.info('(conventionally, this is done in `config/models.js`)');
        console.log();
        sails.log.warn('** DO NOT CHOOSE "2" or "3" IF YOU ARE WORKING WITH PRODUCTION DATA **');
        console.log();
        prompt.get(['?'], function(err, result) {
          if (err) { return next(err); }
          result = result['?'];

          switch (result) {
            case 'alter':
            case '2':
              sails.config.models.migrate = 'alter';
              break;
            case 'drop':
            case '3':
              sails.config.models.migrate = 'drop';
              break;
            default:
              sails.config.models.migrate = 'safe';
              break;
          }

          console.log();
          console.log(' Temporarily using `sails.config.models.migrate="%s"...', sails.config.models.migrate);
          console.log(' (press CTRL+C to cancel-- continuing lift automatically in 0.5 seconds...)');
          console.log();
          setTimeout(function (){
            return next();
          },600);
        });

      }],

      // Once all user model and adapter definitions are loaded
      // and normalized, go ahead and initialize the ORM.
      _buildOntology: ['_doubleCheckMigration', function (next, async_data) {
        // If `sails` is already exiting due to previous errors, bail out.
        if (sails._exiting) {
          // This is possible since we are doing asynchronous things in the initialize function,
          // and e.g. another hook may have failed to load in the mean time since we began initializing.
          // Also note that `reload()` below calls initialize again, so this could happen during that
          // process as well.
          return next(new Error('SAILS EXITING'));
        }
        buildWaterlineOntology(async_data._normalizeModelDefs, hook, sails, function (err, wlOntology) {
          if (err) { return next(err); }

          // Currently that ^^ creates instantiated models and stuffs them back
          // in `hook.models`, as well as a few other things such as globalizing.
          // But that should really be done here.  TODO: do that here instead.

          return next();
        });
      }]

    }, done);
  };
};
