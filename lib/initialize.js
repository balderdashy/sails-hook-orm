/**
 * Module dependencies
 */

var util = require('util');
var _ = require('@sailshq/lodash');
var async = require('async');
var prompt = require('prompt');
var chalk = require('chalk');
var loadModelsAndCustomAdapters = require('./load-models-and-custom-adapters');
var validateDatastoreConfig = require('./validate-datastore-config');
var validateModelDef = require('./validate-model-def');
var buildWaterlineOntology = require('./build-waterline-ontology');
var loadAdapterFromAppDependencies = require('./load-adapter-from-app-dependencies');
var buildRegisteredDatastoreInstance = require('./build-registered-datastore-instance');


/**
 * `initialize()`
 *
 * Initialize this hook.
 *
 * @required  {Dictionary} hook
 * @required  {SailsApp} sails
 * @required  {Function} done
 */
module.exports = function initialize(hook, sails, done){

  ////////////////////////////////////////////////////////////////////////////
  // NOTE: If a user hook needs to add or modify model definitions,
  // the hook should wait until `hook:orm:loaded`, then reload the original
  // model modules `orm/loadAppModules`. Finally, the ORM should be flushed using
  // `reload()` below.
  ////////////////////////////////////////////////////////////////////////////

  // Now do a number of things, some of them in parallel.
  async.auto({


    // Load model and adapter definitions which are defined in the project.
    // (this is from e.g. `api/models/` and `api/adapters/`--
    //  note that this does NOT include adapters which need to be loaded from the node_modules directory!)
    _loadModelsAndCustomAdapters: function (next) {
      loadModelsAndCustomAdapters(hook, sails, next);
    },


    // Warning!  This feature is undocumented/experimental and may change at any time!
    _mergeInProgrammaticModuleDefs: ['_loadModelsAndCustomAdapters',function (unused, next) {
      _.extend(hook.models, sails.config.orm.moduleDefinitions.models);
      _.extend(hook.adapters, sails.config.orm.moduleDefinitions.adapters);
      return next();
    }],


    // Get an array of datastore identities.
    //
    // Note that we do not attempt to validate/normalize model defs or datastore configs here.
    // If model defs or datastore configs cannot be parsed, we simply ignore them.
    _determineRelevantDatastoreNames: ['_mergeInProgrammaticModuleDefs', function (unused, next){

      try {

        var relevantDatastoreNames = [];
        _.each(sails.config.datastores, function _eachDatastoreConfig(datastoreConfig, datastoreName) {

          // If the datastore config is even remotely valid, then fail with a fatal error.
          // (note that this will also be more thoroughly checked later)
          if (!_.isObject(datastoreConfig) || (!_.isString(datastoreConfig.adapter) && !_.isObject(datastoreConfig.adapter))) {
            throw new Error('Invalid configuration for datastore `'+datastoreName+'`: '+util.inspect(datastoreConfig, {depth:5})+'');
          }

          // Now, if we made it here, then we know this datastore is relevant.
          relevantDatastoreNames.push(datastoreName);

        });//</_.each>

        return next(undefined, relevantDatastoreNames);

      } catch (e) { return next(e); }

    }],



    //  ╦  ╔═╗╔═╗╔╦╗  ╔═╗╔╦╗╔═╗╔═╗╔╦╗╔═╗╦═╗┌─┐
    //  ║  ║ ║╠═╣ ║║  ╠═╣ ║║╠═╣╠═╝ ║ ║╣ ╠╦╝└─┐
    //  ╩═╝╚═╝╩ ╩═╩╝  ╩ ╩═╩╝╩ ╩╩   ╩ ╚═╝╩╚═└─┘
    //  ┌─  ┌─┐┬─┐┌─┐┌┬┐  ┌─┐┌─┐┌─┐  ┌┐┌┌─┐┌┬┐┌─┐    ┌┬┐┌─┐┌┬┐┬ ┬┬  ┌─┐┌─┐  ┌─┐┌─┐┬  ┌┬┐┌─┐┬─┐  ─┐
    //  │───├┤ ├┬┘│ ││││  ├─┤├─┘├─┘  ││││ │ ││├┤     ││││ │ │││ ││  ├┤ └─┐  ├┤ │ ││   ││├┤ ├┬┘───│
    //  └─  └  ┴└─└─┘┴ ┴  ┴ ┴┴  ┴    ┘└┘└─┘─┴┘└─┘────┴ ┴└─┘─┴┘└─┘┴─┘└─┘└─┘  └  └─┘┴─┘─┴┘└─┘┴└─  ─┘
    //
    // For every valid datastore config which is relevant (i.e. referenced by at least one model, or app-wide defaults, or with `forceLoadAdapter` set)
    // ensure its referenced adapter is loaded. Note that we do not attempt to validate/normalize stuff here-- the goal is just to ensure we
    // have the referenced adapters.
    //
    // If we find a not-yet-loaded adapter being referenced from an in-use datastore, then attempt to require it from the `node_modules/`
    // directory of this Sails application.
    _attemptToLoadUnrecognizedAdapters: ['_determineRelevantDatastoreNames', function (async_data, next){
      try {
        _.each(async_data._determineRelevantDatastoreNames, function _eachRelevantDatastoreName(datastoreName) {

          // Now, if we made it here, then we're ready to take a look at this datastore config and check up on its adapter.
          var datastoreConfig = sails.config.datastores[datastoreName];

          // Check if the referenced adapter has aready been loaded one way or another.
          if (_.isObject(datastoreConfig) && _.isString(datastoreConfig.adapter)) {
            var referencedAdapter = hook.adapters[datastoreConfig.adapter];

            // If it hasn't...
            if (!referencedAdapter) {

              // Otherwise, we'll try and load it as a dependency from the app's `node_modules/` folder,
              // and also validate and normalize it.
              hook.adapters[datastoreConfig.adapter] = loadAdapterFromAppDependencies(datastoreConfig.adapter, datastoreName, sails);

            }//</ if the adapter string references an adapter that we haven't loaded yet >-

          }//</ if datastore config is an object and its `adapter` prop is a string >-

        });//</_.each() :: each relevant datastore identity>
      }
      catch (e) { return next(e); }

      return next();
    }],


    // Validate and normalize datastore configurations.
    _validateDatastoreConfigsAndBuildAccessors: ['_attemptToLoadUnrecognizedAdapters', function (async_data, next){

      try {

        // Loop over relevant datastore configs and validate/normalize the raw config of each one,
        // saving the normalized config on `hook.normalizedDSConfigs` for use in subsequent steps.
        hook.normalizedDSConfigs = {};
        _.each(async_data._determineRelevantDatastoreNames, function _eachRelevantDatastoreName(datastoreName) {

          hook.normalizedDSConfigs[datastoreName] = validateDatastoreConfig(datastoreName, hook, sails);

        });//</_.each() datastore name>

      } catch (e) { return next(e); }


      return next();
    }],


    // Normalize model definitions and merge in defaults from `sails.config.models.*`.
    // This is what will be passed in to Waterline when building the ontology.
    _normalizeModelDefs: ['_validateDatastoreConfigsAndBuildAccessors', function (unused, next) {
      try {
        _.each(_.keys(hook.models), function (identity) {
          var originalModelDef = hook.models[identity];
          var normalizedModelDef = validateModelDef(hook.models[identity], identity, hook, sails);
          // Note: prior to March 2016, the normalized def was merged back into
          // the original model def rather than replacing it.
          hook.models[identity] = normalizedModelDef;
        });
      }
      catch (e) { return next(e); }
      return next();
    }],



    //  ╔═╗╦═╗╔═╗╔╦╗╦ ╦╔═╗╔╦╗╦╔═╗╔╗╔  ╔═╗╦ ╦╔═╗╔═╗╦╔═
    //  ╠═╝╠╦╝║ ║ ║║║ ║║   ║ ║║ ║║║║  ║  ╠═╣║╣ ║  ╠╩╗
    //  ╩  ╩╚═╚═╝═╩╝╚═╝╚═╝ ╩ ╩╚═╝╝╚╝  ╚═╝╩ ╩╚═╝╚═╝╩ ╩
    //  ┌─  ┬ ┬┌─┐┬─┐┌┐┌┬┌┐┌┌─┐┌─┐   ─┐
    //  │───│││├─┤├┬┘││││││││ ┬└─┐ ───│
    //  └─  └┴┘┴ ┴┴└─┘└┘┴┘└┘└─┘└─┘   ─┘
    //
    // If NODE_ENV is "production", check if any models are using
    // a datastore running on `sails-disk`.  If so, show a warning.
    _productionCheck: ['_normalizeModelDefs', function (unused, next) {
      try {

        // We use `process.env.NODE_ENV` instead of `sails.config.environment`
        // to allow for the environment to be set to e.g. "staging" while the
        // NODE_ENV is set to "production".
        if (process.env.NODE_ENV === 'production') {
          // > **Remember:**
          // > In a production environment, regardless of your logical `environment`
          // > config, the NODE_ENV environment variable should be set.  Setting
          // > `sails.config.environment` to production does this automatically.

          // e.g. ['default', 'foobar']
          var datastoresUsingSailsDisk = _.reduce(sails.config.datastores, function(memo, datastoreConf, identity){
            if (datastoreConf.adapter === 'sails-disk') {
              memo.push(identity);
            }
            return memo;
          }, []);

          // e.g. ['user', 'product']
          var modelsUsingSailsDisk = _.reduce(hook.models, function(memo, normalizedModelDef, identity){

            // Look up the referenced datastore for this model, and then check to see if
            // it matches any of the datastores using the sails-disk adapter.
            var referencedDatastore = normalizedModelDef.datastore;
            if (_.contains(datastoresUsingSailsDisk, referencedDatastore)) {
              memo.push(identity);
            }
            return memo;
          }, []);

          if (modelsUsingSailsDisk.length > 0) {
            sails.log.warn('The default `sails-disk` adapter is not designed for use as a production database;');
            sails.log.warn('(it stores the entire contents of your database in memory)');
            sails.log.warn('Instead, please use another adapter; e.g. sails-postgresql or sails-mongo.');
            sails.log.warn('For more info, see: http://sailsjs.com/docs/concepts/deployment');
            sails.log.warn('To hide this warning message, enable `sails.config.orm.skipProductionWarnings`.');
          }
        }//>-
      }
      // Just in case.
      catch (e) {
        return next(e);
      }

      // Otherwise it worked!
      return next();
    }],

    // Before continuing any further to actually start up the ORM,
    // check the migrate settings for each model to prompt the user
    // to make a decision if no migrate configuration is present.
    //
    // Note that, if this is a production environment, the `migrate`
    // setting will always be forced to "safe" in Waterline.
    _doubleCheckMigration: ['_productionCheck', function (unused, next) {

      // If there are no models, we're good.
      if (_.keys(hook.models).length === 0) {
        return next();
      }

      // If a project-wide migrate setting (sails.config.models.migrate) is defined, we're good.
      if (typeof sails.config.models.migrate !== 'undefined') {
        return next();
      }

      // If this is a production NODE_ENV, show a slightly different message and skip the prompt.
      if (process.env.NODE_ENV === 'production') {
        console.log('');
        sails.log.info('A project-wide `sails.config.models.migrate` setting has not been configured for this app.');
        sails.log.info('Since the NODE_ENV env variable is set to "production", auto-migration will be disabled automatically.');
        sails.log.info('(i.e. `migrate: \'safe\'`)');
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
        'http://sailsjs.com/docs/concepts/models-and-orm/model-settings#?migrate\n'
        // 'command(⌘)+click to open links in the terminal'
      );
      console.log('',
        'In a production environment (NODE_ENV==="production") Sails always uses'+'\n',
        'migrate:"safe" to protect against inadvertent deletion of your data.\n',
        'However during development, you have a few other options for convenience:'+'\n\n',
        '1. '+chalk.bold.cyan('safe')+'  - never auto-migrate my database(s). I will do it myself (for production)','\n',
        '2. '+chalk.bold.yellow('alter')+' - wipe/drop and attempt to re-insert ALL my data (for development)\n',
        '3. '+chalk.bold.red('drop')+'  - wipe/drop ALL my data every time I lift Sails (for tests)\n'
      );
      console.log('What would you like Sails to do this time?');
      console.log();
      console.log(chalk.gray('To skip this prompt in the future, set `sails.config.models.migrate`.'));
      console.log(chalk.gray('Usually this is done in a config file (e.g. `config/models.js`),'));
      console.log(chalk.gray('or as an override (e.g. `sails lift --models.migrate=\'alter\').'));
      console.log();
      console.log('** DO NOT CHOOSE "alter" or "drop" IF YOU ARE WORKING WITH PRODUCTION DATA **');
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
        console.log('-----------------------------------------------------------------');
        console.log();
        setTimeout(function (){
          return next();
        },600);
      });

    }],

    // Once all user model and adapter definitions are loaded
    // and normalized, go ahead and initialize the ORM.
    _buildOntology: ['_doubleCheckMigration', function (async_data, next) {
      // If `sails` is already exiting due to previous errors, bail out.
      if (sails._exiting) {
        // This is possible since we are doing asynchronous things in the initialize function,
        // and e.g. another hook may have failed to load in the mean time since we began initializing.
        // Also note that `reload()` below calls initialize again, so this could happen during that
        // process as well.
        return next(new Error('SAILS EXITING'));
      }

      buildWaterlineOntology(hook, sails, function (err, freshOntology) {
        if (err) { return next(err); }

        // Finally, continue onward, passing the ontology through for use below.
        return next(null, freshOntology);
      });
    }],



    // Expose `hook.datastores`; a dictionary indexed by datastore identity.
    // We only build datastore dictionaries for datastore configs that are in use by one or more models
    // (or have the `forceLoadAdapter` setting enabled).
    _buildRDIs: ['_buildOntology', function (async_data, next){

      try {

        // Start building `hook.datastores`
        hook.datastores = {};

        // Loop over relevant datastore configs.
        _.each(async_data._determineRelevantDatastoreNames, function _eachRelevantDatastoreName(datastoreName) {

          // Look up the normalized config for this datastore.
          var normalizedDatastoreConfig = hook.normalizedDSConfigs[datastoreName];

          // Find the adapter used by this datastore
          var adapter = hook.adapters[normalizedDatastoreConfig.adapter];

          // Build our registered datastore instance (s.k.a. "rdi") - a dictionary
          // with public methods as well as other important state.  Then expose
          // our new rdi on `hook.datastores`.
          hook.datastores[datastoreName] = buildRegisteredDatastoreInstance(datastoreName, normalizedDatastoreConfig, adapter);

        });//</_.each() datastore name>

      } catch (e) { return next(e); }


      //  ╔╦╗╔═╗╔╦╗╔═╗╔═╗╔╦╗╔═╗╦═╗╔═╗  ┌─┐┌─┐┌┬┐┌┬┐┌─┐┬─┐
      //   ║║╠═╣ ║ ╠═╣╚═╗ ║ ║ ║╠╦╝║╣   │ ┬├┤  │  │ ├┤ ├┬┘
      //  ═╩╝╩ ╩ ╩ ╩ ╩╚═╝ ╩ ╚═╝╩╚═╚═╝  └─┘└─┘ ┴  ┴ └─┘┴└─
      // Attach a getter function to the hook for returning the correct datastore
      // by name.

      /**
       * @param  {String?} datastoreName
       *         defaults to "default"
       *
       * @returns {Dictionary}
       *          the registered datastore instance
       */
      hook.getDatastore = function getDatastore(datastoreName) {

        // If no datastore name was specified, then assume the "default" datastore.
        if (_.isUndefined(datastoreName)) {
          datastoreName = 'default';
        }//>-

        var foundDatastore = hook.datastores[datastoreName];
        if (!foundDatastore) {
          throw new Error('Could not find a datastore by that name. Perhaps it hasn\'t been defined in the configuration?');
        }//-•

        // Only expose public methods, plus `manager`, `driver`, and `name` to userland.
        return {
          name: datastoreName,
          manager: foundDatastore.manager,
          driver: foundDatastore.driver,
          config: foundDatastore.config,
          leaseConnection: foundDatastore.leaseConnection,
          transaction: foundDatastore.transaction,
          sendStatement: foundDatastore.sendStatement,
          sendNativeQuery: foundDatastore.sendNativeQuery
        };
        // TODO: ^^take care of this filtering elsewhere, or make it irrelevant (see buildRDI() utility)

      };


      // Also expose this as sails.getDatastore().
      sails.getDatastore = hook.getDatastore;

      return next();

    }],



    // Now take each of the "collection" instances returned by Waterline and modify them a bit for Sails.
    // Then stuff them back onto `hook.models`.
    _augmentAndExposeFinalModels: ['_buildRDIs', function (async_data, next){

      try {
        _.each(async_data._buildOntology.collections, function _eachInstantiatedModel(wlModel, modelIdentity) {

          // Bind context (`this`) for models.
          // (this allows `this` to be used in custom model methods)
          _.bindAll(wlModel);

          // Derive information about this model's associations from its schema
          // and attach/expose the metadata as `SomeModel.associations` (an array)
          wlModel.associations = _.reduce(wlModel.attributes, function _eachAttribute(memo, attrDef, attrName) {
            // Skip non-associations.
            if (!_.isObject(attrDef) || (!attrDef.model && !attrDef.collection)) {
              return memo;
            }

            // Build an informational dictionary describing this association.
            var assocInfo = { alias: attrName };
            if (attrDef.model) {
              assocInfo.type = 'model';
              assocInfo.model = attrDef.model;
            }
            else if (attrDef.collection) {
              assocInfo.type = 'collection';
              assocInfo.collection = attrDef.collection;
              if (attrDef.via) {
                assocInfo.via = attrDef.via;
              }
            }
            memo.push(assocInfo);
            return memo;
          }, []);

          // Set `hook.models.*` reference to our instantiated model.
          // Exposed as `hook.models[modelIdentity]`.
          hook.models[modelIdentity] = wlModel;

          // If configured to do so (based on `sails.config.globals.models`), then expose a reference
          // to this model as a global variable (based on its `globalId`).
          if (_.isObject(sails.config.globals) && sails.config.globals.models === true) {
            if (_.isString(hook.models[modelIdentity].globalId)) {
              global[hook.models[modelIdentity].globalId] = wlModel;
            }
            // If there is no `globalId`, fall back to the identity.
            // This is for backwards compatibility-- nowadays, Waterline
            // takes care of this automatically:
            else {
              global[modelIdentity] = wlModel;
            }
          }
        });//</each collection from Waterline>
      }//</try>
      catch (e) { return next(e); }

      return next();
    }],


  }, done);//</async.auto>
};
