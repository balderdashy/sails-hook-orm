/**
 * Module dependencies
 */

var util = require('util');
var _ = require('@sailshq/lodash');
var flaverr = require('flaverr');
var async = require('async');
var prompt = require('prompt');
var chalk = require('chalk');
var loadModelsAndCustomAdapters = require('./load-models-and-custom-adapters');
var validateDatastoreConfig = require('./validate-datastore-config');
var validateModelDef = require('./validate-model-def');
var buildOntologyAndRunAutoMigrations = require('./build-ontology-and-run-auto-migrations');
var loadAdapterFromAppDependencies = require('./load-adapter-from-app-dependencies');
var buildRegisteredDatastoreInstance = require('./build-registered-datastore-instance');
var checkAdapterCompatibility = require('./check-adapter-compatibility');


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

      var relevantDatastoreNames = [];
      try {

        _.each(sails.config.datastores, function _eachDatastoreConfig(datastoreConfig, datastoreName) {

          // If the datastore config is even remotely valid, then fail with a fatal error.
          // (note that this will also be more thoroughly checked later)
          if (!_.isObject(datastoreConfig) || (!_.isString(datastoreConfig.adapter) && !_.isObject(datastoreConfig.adapter))) {
            throw flaverr({ name: 'userError', code: 'E_INVALID_DATASTORE_CONFIG' }, new Error('Invalid configuration for datastore `'+datastoreName+'`:\n'+util.inspect(datastoreConfig, {depth:5})+''));
          }

          // Now, if we made it here, then we know this datastore is relevant.
          relevantDatastoreNames.push(datastoreName);

        });//</_.each>


      } catch (e) {
        return next(e);
      }

      // Always put "default" last.  This way when loading adapters, we can have it use
      // the 'sails-disk' adapter declared in another datastore (if any) instead of loading
      // the default one.
      relevantDatastoreNames = _.without(relevantDatastoreNames, 'default').concat(['default']);

      return next(undefined, relevantDatastoreNames);
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
    _attemptToLoadUnrecognizedAdapters: ['_determineRelevantDatastoreNames', function (aaData, next){

      try {
        _.each(aaData._determineRelevantDatastoreNames, function _eachRelevantDatastoreName(datastoreName) {

          // Now, if we made it here, then we're ready to take a look at this datastore config and check up on its adapter.
          var datastoreConfig = sails.config.datastores[datastoreName];

          // Check if the referenced adapter has aready been loaded one way or another.
          if (_.isObject(datastoreConfig) && _.isString(datastoreConfig.adapter)) {
            var referencedAdapter = hook.adapters[datastoreConfig.adapter];

            // If it hasn't...
            if (!referencedAdapter) {

              try {
                // Otherwise, we'll try and load it as a dependency from the app's `node_modules/` folder,
                // and also validate and normalize it.
                hook.adapters[datastoreConfig.adapter] = loadAdapterFromAppDependencies(datastoreConfig.adapter, datastoreName, sails);
              } catch (e) {
                // Special case -- the default adapter will load the sails-disk bundled with sails-hook-orm if it's not installed locally.
                if (datastoreName === 'default' && datastoreConfig.adapter === 'sails-disk' && e.code === 'E_ADAPTER_NOT_INSTALLED') {
                  hook.adapters[datastoreConfig.adapter] = require('sails-disk');
                }
                else {
                  throw e;
                }
              }

            }//</ if the adapter string references an adapter that we haven't loaded yet >-

          }//</ if datastore config is an object and its `adapter` prop is a string >-

        });//</_.each() :: each relevant datastore identity>
      } catch (e) { return next(e); }

      return next();
    }],


    // Validate and normalize datastore configurations.
    _validateDatastoreConfigsAndBuildAccessors: ['_attemptToLoadUnrecognizedAdapters', function (aaData, next){

      try {

        // Loop over relevant datastore configs and validate/normalize the raw config of each one,
        // saving the normalized config on `hook.normalizedDSConfigs` for use in subsequent steps.
        hook.normalizedDSConfigs = {};
        _.each(aaData._determineRelevantDatastoreNames, function _eachRelevantDatastoreName(datastoreName) {

          hook.normalizedDSConfigs[datastoreName] = validateDatastoreConfig(datastoreName, hook, sails);

        });//</_.each() datastore name>

      } catch (e) { return next(e); }


      return next();
    }],


    _checkForGlobalMongoSettings: ['_validateDatastoreConfigsAndBuildAccessors', function (aaData, next) {

      try {

        // Get the default adapter.
        var defaultAdapterIdentity = hook.normalizedDSConfigs.default.adapter;

        // Get the default primary key attribute name.
        var defaultPrimaryKey = sails.config.models.primaryKey;

        // Get the default primary key attribute def (if any)
        var defaultPrimaryKeyAttr = sails.config.models.attributes[defaultPrimaryKey];

        // If no attribute exists, we're done (for now).  Later on, each model will be checked
        // individually to ensure that if it's using Mongo, it has a correctly-configured PK attribute.
        // So no reason to get our panties all in a bunch about it just yet.
        if (!defaultPrimaryKeyAttr) {
          throw flaverr('E_NO_ATTR_DEF_FOR_DEFAULT_PKA', new Error('This model does not have an attribute for the default primary key.  That does not mean it is necessarily broken (it might have a custom PKA -- we just haven\'t bothered to look into it further yet, since we\'ll be checking again momentarily anyway.'));
        }

        if (defaultAdapterIdentity === 'sails-mongo' && (defaultPrimaryKeyAttr.autoIncrement || (defaultPrimaryKeyAttr.type !== 'string' && sails.config.models.dontUseObjectIds !== true) || defaultPrimaryKeyAttr.columnName !== '_id')) {

          sails.log.debug('It looks like the default datastore for this app is `sails-mongo`,');
          sails.log.debug('but the default primary key attribute (`' + defaultPrimaryKey + '`) is not set up correctly.' );
          sails.log.debug('When using `sails-mongo`, primary keys MUST have `columnName: \'_id\'`,');
          sails.log.debug('and must _not_ have `autoIncrement: true`.');
          sails.log.debug('Also, if `dontUseObjectIds` is not set to `true` for the model,');
          sails.log.debug('then the `type` of the primary key must be `string`.');
          sails.log.debug();
          sails.log.debug('We\'ll set this up for you this time...');
          sails.log.debug();
          delete defaultPrimaryKeyAttr.autoIncrement;
          defaultPrimaryKeyAttr.type = 'string';
          defaultPrimaryKeyAttr.columnName = '_id';

        }

      } catch (e) {
        switch(e.code) {
          case 'E_NO_ATTR_DEF_FOR_DEFAULT_PKA': return next();
          default: return next(e);
        }
      }//>-•

      return next();

    }],


    // Normalize model definitions and merge in defaults from `sails.config.models.*`.
    // This is what will be passed in to Waterline when building the ontology.
    _normalizeModelDefs: ['_validateDatastoreConfigsAndBuildAccessors', function (unused, next) {
      try {
        _.each(_.keys(hook.models), function (identity) {
          var normalizedModelDef = validateModelDef(hook.models[identity], identity, hook, sails);
          // Note: prior to March 2016, the normalized def was merged back into
          // the original model def (`hook.models[identity]`) rather than replacing it.
          hook.models[identity] = normalizedModelDef;

          // Ensure that the identity that is set in sails.hook.models is equal to the
          // model's identity so that you never end up with a global model id that is
          // different from the model identity.
          if (identity.toLowerCase() !== normalizedModelDef.identity) {
            throw new Error('A model was found that has different values for it\'s globalId and it\'s model identity. You should never manually set these values, they will be inferred for you.');
          }
        });
      } catch (e) {
        return next(e);
      }

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
            sails.log.warn('The default `sails-disk` adapter is not designed for use as a production database.');
            sails.log.warn('Instead, please use another adapter like sails-postgresql or sails-mongo.');
            sails.log.warn('For more info, see: http://sailsjs.com/docs/concepts/deployment');
            sails.log.warn('To hide this warning message, enable `sails.config.orm.skipProductionWarnings`.');
            sails.log.warn(' [?] If you\'re unsure, see https://sailsjs.com/support');
          }
        }//>-
      } catch (e) { return next(e); }

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
      if (!_.isUndefined(sails.config.models.migrate)) {
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
      console.log('--------------------------------------------------------------------------------');
      // console.log();
      prompt.start();
      console.log(
        ' Excuse my interruption, but it looks like this app\n'+
        ' does not have a "migrate" setting configured yet.\n'+
        ' (perhaps this is the first time you\'re lifting it with models?)\n'+
        ''
        // '\n'+
        // ' In short, this setting controls whether/how Sails attempts to\n'+
        // ' automatically rebuild your database(s) every time you lift.\n'+
        // ' You can read more about that here:\n'+
        // ' '+chalk.underline('sailsjs.com/docs/concepts/models-and-orm/model-settings#?migrate')+'\n'
        // // ' command(⌘)+click to open links in the terminal'
      );
      // console.log();
      console.log(chalk.gray(' Tired of seeing this prompt?  Edit '+chalk.bold('config/models.js')+'.'));
      // console.log(chalk.gray(' Or for a one-time override: '+chalk.bold('sails lift --models.migrate=\'alter\'')+''));
      // console.log();
      // console.log(chalk.gray(
      //   ' In short, this setting controls whether/how Sails attempts to\n'+
      //   ' automatically rebuild your database(s) every time you lift.\n'+
      //   ' You can read more about that here:\n'+
      //   ' '+chalk.underline('sailsjs.com/docs/concepts/models-and-orm/model-settings#?migrate')
      //   // ' command(⌘)+click to open links in the terminal'
      // ));
      console.log();
      console.log(
        ' In a production environment (NODE_ENV=production) Sails always uses'+'\n'+
        ' migrate:\'safe\' to protect against inadvertent deletion of your data.\n'+
        ' But '+chalk.bold('during development')+', you have a few different options:\n'+
        '\n'+
        ' 1. FOR DEV:      '+chalk.bold.cyan('alter')+chalk.reset('   wipe/drop and try to re-insert ALL my data ')+chalk.bold('(recommended)')+'\n'+
        ' 2. FOR TESTS:    '+chalk.bold.yellow('drop')+chalk.reset('    wipe/drop ALL my data every time I lift Sails\n')+
        ' 3. FOR STAGING:  '+chalk.bold.red('safe')+chalk.reset('    don\'t auto-migrate my data. I will do it myself\n')
      );
      // console.log('What would you like Sails to do '+chalk.bold('this time')+'?');
      console.log(chalk.gray(' Read more: '+chalk.underline('sailsjs.com/docs/concepts/models-and-orm/model-settings#?migrate')));
      console.log('--------------------------------------------------------------------------------');
      console.log();
      console.log('What would you like Sails to do '+chalk.bold('this time')+'?');
      console.log(chalk.gray(' ** NEVER CHOOSE "alter" or "drop" IF YOU ARE WORKING WITH PRODUCTION DATA **'));
      console.log();
      // console.log();
      prompt.get(['?'], function(err, result) {
        if (err) {
          console.log('_.keys(err)',_.keys(err));
          console.log(chalk.bgRed.white.bold('<canceled, probably with CTRL+C>'));
          console.log('--------------------------------------------------------------------------------');
          return next(err);
        }//-•

        result = result['?'];

        switch (result) {
          case 'alter':
          case '1':
            sails.config.models.migrate = 'alter';
            break;
          case 'drop':
          case '2':
            sails.config.models.migrate = 'drop';
            break;
          default:
            sails.config.models.migrate = 'safe';
            break;
        }

        console.log('--------------------------------------------------------------------------------');
        // console.log();
        console.log(
          ' OK!  Temporarily using '+chalk.bold('migrate:\''+sails.config.models.migrate+'\'')+'...'
        );
        // console.log(' (press CTRL+C to cancel-- continuing automatically in 0.5 seconds...)');
        console.log(chalk.gray(' To skip this prompt in the future, edit '+chalk.bold('config/models.js')+'.'));
        console.log('--------------------------------------------------------------------------------');
        console.log();
        setTimeout(function (){
          return next();
        },300);
      });

    }],

    // Verify that this adapter is compatible w/ this version of Sails / Waterline.
    // (if not, go ahead and throw)
    _checkAdapterCompatibility: ['_doubleCheckMigration', function (aaData, next) {

      _.each(aaData._determineRelevantDatastoreNames, function _eachRelevantDatastoreName(datastoreName) {

        // Look up the normalized config for this datastore.
        var normalizedDatastoreConfig = hook.normalizedDSConfigs[datastoreName];

        // Find the adapter used by this datastore
        var adapter = hook.adapters[normalizedDatastoreConfig.adapter];

        checkAdapterCompatibility(datastoreName, adapter);

      });

      return next();

    }],

    // Once all user model and adapter definitions are loaded
    // and normalized, go ahead and initialize the ORM.
    _buildOntology: ['_checkAdapterCompatibility', function (aaData, next) {
      // If `sails` is already exiting due to previous errors, bail out.
      if (sails._exiting) {
        // This is possible since we are doing asynchronous things in the initialize function,
        // and e.g. another hook may have failed to load in the mean time since we began initializing.
        // Also note that `reload()` below calls initialize again, so this could happen during that
        // process as well.
        return next(flaverr('E_SAILS_IS_ALREADY_EXITING', new Error('SAILS EXITING')));
      }

      if (sails.config.models.migrate === 'alter') {
        sails.log.info(chalk.cyan.bold('·• ')+chalk.bold('Auto-migrating...')+chalk.reset('  (alter)'));
        sails.log.info('   '+chalk.gray('Hold tight, this could take a moment.'));
        // sails.log.info('   '+chalk.gray('(Please don\'t press CTRL+C until this is finished.)'));
      }
      else if (sails.config.models.migrate === 'drop') {
        sails.log.info(chalk.yellow.bold('·• ')+chalk.bold('Auto-migrating...')+chalk.reset('  (drop)'));
        // sails.log.info('   '+chalk.gray('(Please don\'t press CTRL+C until this is finished.)'));
      }
      else {}


      buildOntologyAndRunAutoMigrations(hook, sails, function (err, freshOntology) {
        if (err) { return next(err); }

        if (sails.config.models.migrate === 'alter') {
          sails.log.info(' ✓ Auto-migration complete.');
          sails.log.blank();
        }
        else if (sails.config.models.migrate === 'drop') {
          sails.log.info(' ✓ Auto-migration complete.');
          sails.log.blank();
        }


        // Finally, continue onward, passing the ontology through for use below.
        return next(undefined, freshOntology);
      });
    }],



    // Expose `hook.datastores`; a dictionary indexed by datastore identity.
    // We only build datastore dictionaries for datastore configs that are in use by one or more models
    // (or have the `forceLoadAdapter` setting enabled).
    _buildRDIs: ['_buildOntology', function (aaData, next){

      try {

        // Start building `hook.datastores`
        hook.datastores = {};

        // Loop over relevant datastore configs.
        _.each(aaData._determineRelevantDatastoreNames, function _eachRelevantDatastoreName(datastoreName) {

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
       *          The registered datastore instance (RDI)
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

        // Return the registered datastore instance (RDI).
        // This includes public methods, plus state like `manager`, as well as static
        // metadata such as `config`, `driver`, and `name`.
        return foundDatastore;

      };


      // Also expose this as sails.getDatastore().
      sails.getDatastore = hook.getDatastore;

      // And finally, go ahead and grab a (singleton) reference to the
      // default datastore, and use it to expose a couple of the most
      // common datastore methods directly on the `sails` instance,
      // purely for convenience.
      // (These methods will always use the default datastore.)
      var defaultRDISingleton = hook.getDatastore();

      sails.sendNativeQuery = defaultRDISingleton.sendNativeQuery;
      sails.transaction = defaultRDISingleton.transaction;

      // All done w/ this step.
      return next();

    }],



    // Now take each of the "collection" instances returned by Waterline and modify them a bit for Sails.
    // Then stuff them back onto `hook.models`.
    _augmentAndExposeFinalModels: ['_buildRDIs', function (aaData, next){

      try {
        _.each(aaData._buildOntology.collections, function _eachInstantiatedModel(wlModel, modelIdentity) {

          // Bind context (`this`) for models.
          // (this allows `this` to be used in custom model methods)
          // Skip `customToJSON` since `this` inside a record's `toJSON` should
          // always refer to the record!
          _.each(wlModel, function(prop, propName) {
            if (_.isFunction(prop) && propName !== 'customToJSON') {
              _.bind(prop, wlModel);
            }
          });

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

            // If this is an internal model introduced by Waterline (indicated by the `_private` flag)
            // and not intended for userland access/manipulation, then don't globalize it.
            // (e.g. this flag is attached to implicit junction models.)
            if (hook.models[modelIdentity]._private) {
              // Don't globalize.
            }
            // Otherwise use the `globalId` to determine what to globalize it as.
            else if (_.isString(hook.models[modelIdentity].globalId) && hook.models[modelIdentity].globalId !== '') {
              global[hook.models[modelIdentity].globalId] = wlModel;
            }
            // If there is no `globalId`, fall back to the identity.
            else {
              global[modelIdentity] = wlModel;
            }
          }
        });//</each collection from Waterline>

      } catch (e) { return next(e); }

      return next();
    }],


  }, done);//</async.auto>
};
