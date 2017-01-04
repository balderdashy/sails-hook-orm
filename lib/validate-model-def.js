/**
 * Module dependencies
 */

var util = require('util');
var _ = require('lodash');
var modelHasNoDatastoreError = require('../constants/model-has-no-datastore.error');
var modelHasMultipleDatastoresError = require('../constants/model-has-multiple-datastores.error');
var constructError = require('./construct-error');

var VALIDATIONS = require('waterline/accessible/allowed-validations');
var DEPRECATED_VALIDATIONS = require('../constants/deprecated-validations.list');
var ATTRIBUTE_PROPS = require('waterline/accessible/valid-attribute-properties');

/**
 * validateModelDef()
 *
 * Validate, normalize, and mix in implicit defaults for a particular model
 * definition.  Includes adjustments for backwards compatibility.
 *
 * @required {Dictionary} originalModelDef
 * @required {String} modelIdentity
 * @required {Dictionary} hook
 * @required {SailsApp} sails
 *
 * @returns {Dictionary} [normalized model definition]
 * @throws {Error} E_MODEL_HAS_MULTIPLE_DATASTORES
 * @throws {Error} E_MODEL_HAS_NO_DATASTORE
 */

module.exports = function validateModelDef (originalModelDef, modelIdentity, hook, sails) {

  // Rebuild model definition to provide a layer of insulation against any
  // changes that might tamper with the original, raw definition.
  //
  // Model settings are determined using the following rules:
  // (in descending order of precedence)
  // • explicit model def
  // • sails.config.models
  // • implicit framework defaults
  var normalizedModelDef;

  // We start off with some implicit defaults:
  normalizedModelDef = {
    // Set `identity` so it is available on the model itself.
    identity: modelIdentity,
    // Default the table name to the identity.
    tableName: modelIdentity,
    // Default attributes to an empty dictionary (`{}`).
    // > Note that we handle merging attributes as a special case below
    // > (i.e. because we're doing a shallow `.extend()` rather than a deep merge)
    // > This allows app-wide defaults to include attributes that will be shared across
    // > all models.
    attributes: {}
  };

  //  ███╗   ███╗███████╗██████╗  ██████╗ ███████╗
  //  ████╗ ████║██╔════╝██╔══██╗██╔════╝ ██╔════╝
  //  ██╔████╔██║█████╗  ██████╔╝██║  ███╗█████╗
  //  ██║╚██╔╝██║██╔══╝  ██╔══██╗██║   ██║██╔══╝
  //  ██║ ╚═╝ ██║███████╗██║  ██║╚██████╔╝███████╗
  //  ╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝
  //
  //  ██████╗ ███████╗███████╗ █████╗ ██╗   ██╗██╗  ████████╗███████╗
  //  ██╔══██╗██╔════╝██╔════╝██╔══██╗██║   ██║██║  ╚══██╔══╝██╔════╝
  //  ██║  ██║█████╗  █████╗  ███████║██║   ██║██║     ██║   ███████╗
  //  ██║  ██║██╔══╝  ██╔══╝  ██╔══██║██║   ██║██║     ██║   ╚════██║
  //  ██████╔╝███████╗██║     ██║  ██║╚██████╔╝███████╗██║   ███████║
  //  ╚═════╝ ╚══════╝╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝   ╚══════╝
  //

  // Next, merge in app-wide defaults.
  _.extend(normalizedModelDef, _.omit(sails.config.models, ['attributes']));
  // Merge in attributes from app-wide defaults, if there are any.
  if (!_.isFunction(sails.config.models.attributes) && !_.isArray(sails.config.models.attributes) && _.isObject(sails.config.models.attributes)) {
    normalizedModelDef.attributes = _.extend(normalizedModelDef.attributes, sails.config.models.attributes);
  }

  // Finally, fold in the original properties provided in the userland model definition.
  _.extend(normalizedModelDef, _.omit(originalModelDef, ['attributes']));
  // Merge in attributes from the original model def, if there are any.
  if (!_.isFunction(originalModelDef.attributes) && !_.isArray(originalModelDef.attributes) && _.isObject(originalModelDef.attributes)) {
    normalizedModelDef.attributes = _.extend(normalizedModelDef.attributes, originalModelDef.attributes);
  }

  // If there's a top-level `autoCreatedAt`, `autoUpdatedAt` or `autoPK` model setting, bail out.
  if (!_.isUndefined(normalizedModelDef.autoCreatedAt) || !_.isUndefined(normalizedModelDef.autoUpdatedAt) || !_.isUndefined(normalizedModelDef.autoPK)) {
    throw new Error(
                    '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                    'The `autoCreatedAt`, `autoUpdatedAt` and `autoPK` top-level model settings were removed\n'+
                    'in Sails 1.0. See http://sailsjs.com/docs/concepts/models-and-orm/attributes for info\n'+
                    'on configuring attributes to be timestamps or auto-incrementing numbers.\n'+
                    '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n');
  }

  // If there's a top-level `types` model setting, bail out.
  if (!_.isUndefined(normalizedModelDef.types)) {
    throw new Error(
                    '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                    'The `types` model setting was removed in Sails 1.0.  To perform custom validation on\n'+
                    'an attribute, set `validations: { custom: true }` on that attribute.\n'+
                    'See http://sailsjs.com/docs/concepts/models-and-orm/validations for info\n'+
                    '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n');
  }


  //  ███╗   ██╗ ██████╗ ██████╗ ███╗   ███╗ █████╗ ██╗     ██╗███████╗███████╗
  //  ████╗  ██║██╔═══██╗██╔══██╗████╗ ████║██╔══██╗██║     ██║╚══███╔╝██╔════╝
  //  ██╔██╗ ██║██║   ██║██████╔╝██╔████╔██║███████║██║     ██║  ███╔╝ █████╗
  //  ██║╚██╗██║██║   ██║██╔══██╗██║╚██╔╝██║██╔══██║██║     ██║ ███╔╝  ██╔══╝
  //  ██║ ╚████║╚██████╔╝██║  ██║██║ ╚═╝ ██║██║  ██║███████╗██║███████╗███████╗
  //  ╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚═╝╚══════╝╚══════╝
  //
  //   █████╗ ████████╗████████╗██████╗ ██╗██████╗ ██╗   ██╗████████╗███████╗███████╗
  //  ██╔══██╗╚══██╔══╝╚══██╔══╝██╔══██╗██║██╔══██╗██║   ██║╚══██╔══╝██╔════╝██╔════╝
  //  ███████║   ██║      ██║   ██████╔╝██║██████╔╝██║   ██║   ██║   █████╗  ███████╗
  //  ██╔══██║   ██║      ██║   ██╔══██╗██║██╔══██╗██║   ██║   ██║   ██╔══╝  ╚════██║
  //  ██║  ██║   ██║      ██║   ██║  ██║██║██████╔╝╚██████╔╝   ██║   ███████╗███████║
  //  ╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚═╝  ╚═╝╚═╝╚═════╝  ╚═════╝    ╚═╝   ╚══════╝╚══════╝

  // A mapping of formerly-acceptable types to the currently-accepted types.
  var typeMapping = {
    text: 'string',
    integer: 'number',
    float: 'number',
    date: 'number',
    datetime: 'number',
    binary: 'ref',
    array: 'json',
    mediumtext: 'string',
    longtext: 'string',
    objectId: 'string'
  };

  var noLongerSupportedTypes = {
    array: {
      suggestType: 'json',
      suggestColumnType: 'array'
    },
    date: {
      suggestType: 'string',
      suggestColumnType: 'date'
    },
    datetime: {
      suggestType: 'string',
      suggestColumnType: 'datetime'
    },
    binary: {
      suggestType: 'ref',
      suggestColumnType: 'binary'
    },
    objectid: {
      suggestType: 'ref',
      suggestColumnType: 'objectid'
    }
  };

  // Loop through and normalize each attribute in the model.
  _.each(normalizedModelDef.attributes, function updateProperties (val, attributeName) {

    // If an attribute is set to `false`, delete it from the model.
    if (val === false) {
      delete normalizedModelDef.attributes[attributeName];
      return;
    }

    //  ┬ ┬┌─┐┌┐┌┌┬┐┬  ┌─┐  ┬┌┐┌┌─┐┌┬┐┌─┐┌┐┌┌─┐┌─┐  ┌┬┐┌─┐┌┬┐┬ ┬┌─┐┌┬┐┌─┐
    //  ├─┤├─┤│││ │││  ├┤   ││││└─┐ │ ├─┤││││  ├┤   │││├┤  │ ├─┤│ │ ││└─┐
    //  ┴ ┴┴ ┴┘└┘─┴┘┴─┘└─┘  ┴┘└┘└─┘ ┴ ┴ ┴┘└┘└─┘└─┘  ┴ ┴└─┘ ┴ ┴ ┴└─┘─┴┘└─┘

    // Always ignore `toJSON` for now.
    if (attributeName === 'toJSON') {
      return;
    }

    // If the attribute is a function, log a message
    if (_.isFunction(val)) {
      sails.log.debug('It looks like you are using an instance method (`' + attributeName + '`) defined on the `' + originalModelDef.globalId + '` model.');
      sails.log.debug('Model instance methods are deprecated in Sails v1, and support will be removed.');
      sails.log.debug('Please refactor the logic from this instance method into a static method model method or helper.');
    }

    //  ┬ ┬┌─┐┌┐┌┌┬┐┬  ┌─┐  ┌┬┐┌─┐┌─┐┌─┐┬ ┬┬ ┌┬┐┌─┐╔╦╗┌─┐  ┌─┐┌┐┌┌─┐
    //  ├─┤├─┤│││ │││  ├┤    ││├┤ ├┤ ├─┤│ ││  │ └─┐ ║ │ │  ├┤ │││└─┐
    //  ┴ ┴┴ ┴┘└┘─┴┘┴─┘└─┘  ─┴┘└─┘└  ┴ ┴└─┘┴─┘┴ └─┘ ╩ └─┘  └  ┘└┘└─┘

    // Throw an error if a "defaultsTo" function is detected.
    if (_.isFunction(val.defaultsTo)) {
      throw new Error(
                      '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                      'In the `' + attributeName + '` attribute of model `' + modelIdentity + '`:\n'+
                      'The `defaultsTo` property can no longer be specified as a function in Sails 1.0.  If you\n'+
                      'need to calculate a value for the attribute before creating a record, try wrapping your\n'+
                      '`create` logic in a helper (see http://sailsjs.com/docs/concepts/helpers).\n'+
                      '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n');
    }

    //  ┬ ┬┌─┐┌┐┌┌┬┐┬  ┌─┐  ┌─┐┬─┐┬┌┬┐┌─┐┬─┐┬ ┬╦╔═┌─┐┬ ┬  ┌─┐┬─┐┌─┐┌─┐
    //  ├─┤├─┤│││ │││  ├┤   ├─┘├┬┘││││├─┤├┬┘└┬┘╠╩╗├┤ └┬┘  ├─┘├┬┘│ │├─┘
    //  ┴ ┴┴ ┴┘└┘─┴┘┴─┘└─┘  ┴  ┴└─┴┴ ┴┴ ┴┴└─ ┴ ╩ ╩└─┘ ┴   ┴  ┴└─└─┘┴

    // Throw an error if a `primaryKey` attribute is declared on an attribute.
    if (!_.isUndefined(val.primaryKey)) {
      throw new Error(
                      '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                      'In the `' + attributeName + '` attribute of model `' + modelIdentity + '`:\n'+
                      'The `primaryKey` property can no longer be specified on an attribute in Sails 1.0.\n'+
                      'If you want to declare `' + attributeName + '` to be the primary key of `' + modelIdentity + '`,\n' +
                      'set `primaryKey: \'' + attributeName + '\'` at the top level of the model.\n' +
                      '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n');
    }

    //  ┌─┐─┐ ┬┌─┐┌─┐┌┐┌┌┬┐  ┌┬┐┬ ┬┌─┐┌─┐  ┌─┐┬ ┬┌─┐┬─┐┌┬┐┌─┐┬ ┬┌┬┐┌─┐
    //  ├┤ ┌┴┬┘├─┘├─┤│││ ││   │ └┬┘├─┘├┤   └─┐├─┤│ │├┬┘ │ │  │ │ │ └─┐
    //  └─┘┴ └─┴  ┴ ┴┘└┘─┴┘   ┴  ┴ ┴  └─┘  └─┘┴ ┴└─┘┴└─ ┴ └─┘└─┘ ┴ └─┘

    // If the attribute value is a string, expand it into a type.
    if (_.isString(val)) {
      normalizedModelDef.attributes[attributeName] = { type: val };
      val = normalizedModelDef.attributes[attributeName];
    }

    //  ┬─┐┌─┐┌┬┐┌─┐┬  ┬┌─┐  ┌─┐┌─┐┌─┐┌─┐┌─┐┬┌─┐┌┬┐┬┌─┐┌┐┌  ┬  ┬┌─┐┬  ┬┌┬┐┌─┐┌┬┐┬┌─┐┌┐┌┌─┐
    //  ├┬┘├┤ ││││ │└┐┌┘├┤   ├─┤└─┐└─┐│ ││  │├─┤ │ ││ ││││  └┐┌┘├─┤│  │ ││├─┤ │ ││ ││││└─┐
    //  ┴└─└─┘┴ ┴└─┘ └┘ └─┘  ┴ ┴└─┘└─┘└─┘└─┘┴┴ ┴ ┴ ┴└─┘┘└┘   └┘ ┴ ┴┴─┘┴─┴┘┴ ┴ ┴ ┴└─┘┘└┘└─┘

    // Associations don't need `validations` dictionaries, so complain if we see them.
    if (val.collection || val.model) {
      if (!_.isUndefined(val.validations)) {
        sails.log.debug('In attribute `' + attributeName + '` of  model `' + modelIdentity + '`:');
        sails.log.debug('The `validations` property is not valid for associations.  Ignoring...\n');
        delete val.validations;
      }
    }

    //  ┬ ┬┌─┐┌┐┌┌┬┐┬  ┌─┐  ┌┬┐┌─┐┌─┐   ┬  ┌─┐┬  ┬┌─┐┬    ┬  ┬┌─┐┬  ┬┌┬┐┌─┐┌┬┐┬┌─┐┌┐┌┌─┐
    //  ├─┤├─┤│││ │││  ├┤    │ │ │├─┘───│  ├┤ └┐┌┘├┤ │    └┐┌┘├─┤│  │ ││├─┤ │ ││ ││││└─┐
    //  ┴ ┴┴ ┴┘└┘─┴┘┴─┘└─┘   ┴ └─┘┴     ┴─┘└─┘ └┘ └─┘┴─┘   └┘ ┴ ┴┴─┘┴─┴┘┴ ┴ ┴ ┴└─┘┘└┘└─┘

    // First, loop through each property and if it's a validation or deprecated validation, massage it
    // into the `validations` property.
    _.each(val, function handleTopLevelValidations(property, propertyName) {

      // Is this property a supported validation?
      if (VALIDATIONS[propertyName]) {

        // For associations, that was a trick question.  No validations are valid!
        if (val.collection || val.model) {
          sails.log.debug('In attribute `' + attributeName + '` of  model `' + modelIdentity + '`:');
          sails.log.debug('The `'+ propertyName+ '` property is not valid for associations.  Ignoring...\n');
          delete val[propertyName];
          return;
        }

        // Move the validation into the `validations` dictionary.
        val.validations = val.validations || {};
        val.validations[propertyName] = property;
        delete val[propertyName];
        return;
      }

      // Ok, maybe it's a deprecated validation?
      if (DEPRECATED_VALIDATIONS[propertyName]) {

        // For associations, that was a trick question.  No validations are valid!
        if (val.collection || val.model) {
          sails.log.debug('In attribute `' + attributeName + '` of  model `' + modelIdentity + '`:');
          sails.log.debug('The `'+ propertyName+ '` property is not valid for associations.  Ignoring...\n');
          delete val[propertyName];
          return;
        }

        // Log a deprecation message and move the NEW version of the validation into a `validations` dictionary.
        sails.log.debug('The `' + propertyName + '` validation is now `' + DEPRECATED_VALIDATIONS[propertyName] + '`.');
        sails.log.debug('Please add it as `validations: { ' + DEPRECATED_VALIDATIONS[propertyName] + ': ' + JSON.stringify(property) + ' }` instead.\n');
        val.validations = val.validations || {};
        val.validations[DEPRECATED_VALIDATIONS[propertyName]] = property;
        delete val[propertyName];
        return;

      }

      // Fine I give up.  We'll let waterline-schema determine whether this property is valid or not.

    });

    //  ┌─┐┬ ┬┌─┐┌─┐┬┌─  ┬  ┬┌─┐┬  ┬┌┬┐┌─┐┌┬┐┬┌─┐┌┐┌  ┌┬┐┬ ┬┌─┐┌─┐┌─┐
    //  │  ├─┤├┤ │  ├┴┐  └┐┌┘├─┤│  │ ││├─┤ │ ││ ││││   │ └┬┘├─┘├┤ └─┐
    //  └─┘┴ ┴└─┘└─┘┴ ┴   └┘ ┴ ┴┴─┘┴─┴┘┴ ┴ ┴ ┴└─┘┘└┘   ┴  ┴ ┴  └─┘└─┘

    // Now loop through any validations and verify that they are appropriate for the attribute's type.
    _.each(_.keys(val.validations), function(validation) {
      var rule = VALIDATIONS[validation];
      if (!_.contains(rule.expectedTypes, val.type)) {
        throw new Error(
                        '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                        'In the `' + attributeName + '` attribute of model `' + modelIdentity + '`:\n'+
                        'The `' + validation + '` validation does not apply to the `' + val.type + '` attribute type.\n'+
                        '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n');
      }
    });

    // If the attribute is a plural association, continue -- there's nothing else for us to do here.
    // (for singular associations, we do want to add an `autoMigrations` dictionary).
    if (val.collection) { return; }

    //  ┌┐ ┌─┐┬┬    ┌─┐┌┐┌  ┬ ┬┌┐┌┌─┐┬ ┬┌─┐┌─┐┌─┐┬─┐┌┬┐┌─┐┌┬┐  ┌┬┐┬ ┬┌─┐┌─┐┌─┐
    //  ├┴┐├─┤││    │ ││││  │ ││││└─┐│ │├─┘├─┘│ │├┬┘ │ ├┤  ││   │ └┬┘├─┘├┤ └─┐
    //  └─┘┴ ┴┴┴─┘  └─┘┘└┘  └─┘┘└┘└─┘└─┘┴  ┴  └─┘┴└─ ┴ └─┘─┴┘   ┴  ┴ ┴  └─┘└─┘
    if (noLongerSupportedTypes[val.type]) {
      throw new Error(
                      '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                      'In the `' + attributeName + '` attribute of model `' + modelIdentity + '`:\n'+
                      'The type "' + val.type + '" is no longer supported.  To use this type in your model, change\n'+
                      '`type` to one of the supported types and set the `columnType` property to a column \n'+
                      'type supported by the model\'s datastore, e.g. { type: \'' + noLongerSupportedTypes[val.type].suggestType + '\', columnType: \'' + noLongerSupportedTypes[val.type].suggestColumnType + '\' }\n'+
                      '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n');

    }

    //  ┌┬┐┌─┐┌─┐  ┌┬┐┌─┐┌─┐┬─┐┌─┐┌─┐┌─┐┌┬┐┌─┐┌┬┐  ┌┬┐┬ ┬┌─┐┌─┐┌─┐
    //  │││├─┤├─┘   ││├┤ ├─┘├┬┘├┤ │  ├─┤ │ ├┤  ││   │ └┬┘├─┘├┤ └─┐
    //  ┴ ┴┴ ┴┴    ─┴┘└─┘┴  ┴└─└─┘└─┘┴ ┴ ┴ └─┘─┴┘   ┴  ┴ ┴  └─┘└─┘

    // If the attribute type is no longer supported, transform it with a warning.
    if (typeMapping[val.type]) {
      sails.log.debug('In model `'+ modelIdentity + '`, the `' + attributeName + '` attribute declares deprecated type `' + val.type+'`.');
      sails.log.debug('Please update to a known type (changing to `' + typeMapping[val.type] + '` for now). If you wish to use');
      sails.log.debug('a specific column type supported by your database, set the `columnType` property');
      sails.log.debug('(otherwise the adapter will choose an appropriate column type automatically, if relevant).\n');
      val.type = typeMapping[val.type];
    }

    //  ┌─┐┌─┐┌┬┐  ┌─┐┬ ┬┌┬┐┌─┐╔╦╗┬┌─┐┬─┐┌─┐┌┬┐┬┌─┐┌┐┌┌─┐  ┬  ┬┌─┐┬  ┬ ┬┌─┐┌─┐
    //  └─┐├┤  │   ├─┤│ │ │ │ │║║║││ ┬├┬┘├─┤ │ ││ ││││└─┐  └┐┌┘├─┤│  │ │├┤ └─┐
    //  └─┘└─┘ ┴   ┴ ┴└─┘ ┴ └─┘╩ ╩┴└─┘┴└─┴ ┴ ┴ ┴└─┘┘└┘└─┘   └┘ ┴ ┴┴─┘└─┘└─┘└─┘

    // Every attribute needs an `autoMigrations` dictionary
    val.autoMigrations = val.autoMigrations || {};

    // Move certain attribute properties into `autoMigrations`.  These are not valid top-level
    // properties as far as waterline-schema is concerned.
    var PROPS_TO_AUTOMIGRATE = ['autoIncrement', 'unique', 'columnType'];
    _.each(PROPS_TO_AUTOMIGRATE, function(property) {
      if (!_.isUndefined(val[property])) {
        val.autoMigrations[property] = val[property];
        delete val[property];
      }
    });

    // Set the `unique` autoMigration property.
    val.autoMigrations.unique = val.autoMigrations.unique || false;

    // Set the `autoIncrement` autoMigration property.
    val.autoMigrations.autoIncrement = val.autoMigrations.autoIncrement || false;

    // Set the `columnType` autoMigration property for non-associations.  `columnType` for
    // associations will be set later, in a call to `normalizeColumnTypes`.  This lets
    // `waterline-schema` further validate the models (e.g. verifying that associations are
    // valid) before we continue.
    if (val.type) {
      val.autoMigrations.columnType = val.autoMigrations.columnType || (function setColumnType() {
        // Primary keys get a special '_stringkey' or '_numberkey' column type.
        if (normalizedModelDef.primaryKey === attributeName) {
          return '_' + val.type.toLowerCase() + 'key';
        }
        // Timestamps get a special '_stringtimestamp' or '_numbertimestamp' column type.
        if (val.autoUpdatedAt || val.autoCreatedAt) {
          return '_' + val.type.toLowerCase() + 'timestamp';
        }
        // Otherwise just use the lower-cased type, prefixed with an underscore.
        return '_' + val.type.toLowerCase();
      })();

    }

  });

//  ███╗   ██╗ ██████╗ ██████╗ ███╗   ███╗ █████╗ ██╗     ██╗███████╗███████╗
//  ████╗  ██║██╔═══██╗██╔══██╗████╗ ████║██╔══██╗██║     ██║╚══███╔╝██╔════╝
//  ██╔██╗ ██║██║   ██║██████╔╝██╔████╔██║███████║██║     ██║  ███╔╝ █████╗
//  ██║╚██╗██║██║   ██║██╔══██╗██║╚██╔╝██║██╔══██║██║     ██║ ███╔╝  ██╔══╝
//  ██║ ╚████║╚██████╔╝██║  ██║██║ ╚═╝ ██║██║  ██║███████╗██║███████╗███████╗
//  ╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚═╝╚══════╝╚══════╝
//
//  ████████╗ ██████╗ ██████╗       ██╗     ███████╗██╗   ██╗███████╗██╗
//  ╚══██╔══╝██╔═══██╗██╔══██╗      ██║     ██╔════╝██║   ██║██╔════╝██║
//     ██║   ██║   ██║██████╔╝█████╗██║     █████╗  ██║   ██║█████╗  ██║
//     ██║   ██║   ██║██╔═══╝ ╚════╝██║     ██╔══╝  ╚██╗ ██╔╝██╔══╝  ██║
//     ██║   ╚██████╔╝██║           ███████╗███████╗ ╚████╔╝ ███████╗███████╗
//     ╚═╝    ╚═════╝ ╚═╝           ╚══════╝╚══════╝  ╚═══╝  ╚══════╝╚══════╝
//

  // If this is production, force `migrate: safe`!!
  // (note that we check `sails.config.environment` and process.env.NODE_ENV
  //  just to be on the conservative side)
  if ( normalizedModelDef.migrate !== 'safe' && (sails.config.environment === 'production' || process.env.NODE_ENV === 'production')) {
    normalizedModelDef.migrate = 'safe';
    sails.log.verbose('For `%s` model, forcing Waterline to use `migrate: "safe" strategy (since this is production)', modelIdentity);
  }

  //  ┌─┐┌─┐┌┬┐  ┌┬┐┬┌─┐┬─┐┌─┐┌┬┐┌─┐  ┬  ┬┌─┐┬  ┬ ┬┌─┐
  //  └─┐├┤  │   │││││ ┬├┬┘├─┤ │ ├┤   └┐┌┘├─┤│  │ │├┤
  //  └─┘└─┘ ┴   ┴ ┴┴└─┘┴└─┴ ┴ ┴ └─┘   └┘ ┴ ┴┴─┘└─┘└─┘

  // Now that we have a normalized model definition, verify that a valid datastore setting is present:
  // (note that much of the stuff below about arrays is for backwards-compatibility)

  // If a datastore is not configured in our normalized model def (i.e. it is falsy or an empty array), then we throw a fatal error.
  if (!normalizedModelDef.datastore || _.isEqual(normalizedModelDef.datastore, [])) {
    throw constructError(modelHasNoDatastoreError, { modelIdentity: modelIdentity });
  }

  //  ┌┐┌┌─┐┬─┐┌┬┐┌─┐┬  ┬┌─┐┌─┐  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐  ┌─┐┌─┐┌┐┌┌─┐┬┌─┐
  //  ││││ │├┬┘│││├─┤│  │┌─┘├┤    ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤   │  │ ││││├┤ ││ ┬
  //  ┘└┘└─┘┴└─┴ ┴┴ ┴┴─┘┴└─┘└─┘  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘  └─┘└─┘┘└┘└  ┴└─┘

  // Coerce `Model.datastore` to an array.
  // (note that future versions of Sails may skip this step and keep it as a string instead of an array)
  if (!_.isArray(normalizedModelDef.datastore)) {
    normalizedModelDef.datastore = [
      normalizedModelDef.datastore
    ];
  }
  // Explicitly prevent more than one datastore from being used.
  if (normalizedModelDef.datastore.length > 1) {
    throw constructError(modelHasMultipleDatastoresError, { modelIdentity: modelIdentity });
  }

  // Grab the normalized configuration for the datastore referenced by this model.
  // If the normalized model def doesn't have a `schema` flag, then check out its
  // normalized datastore config to see if _it_ has a `schema` setting.
  //
  // > Usually this is a default coming from the adapter itself-- for example,
  // > `sails-mongo` and `sails-disk` set `schema: false` by default, whereas
  // > `sails-mysql` and `sails-postgresql` default to `schema: true`.
  // > See `lib/validate-datastore-config.js` to see how that stuff gets in there.
  var referencedDatastore = hook.datastores[normalizedModelDef.datastore[0]];
  if (!_.isObject(referencedDatastore)) {
    throw new Error('Consistency violation: A model (`'+modelIdentity+'`) references a datastore which cannot be found (`'+normalizedModelDef.datastore[0]+'`).  If this model definition has an explicit `datastore` property, check that it is spelled correctly.  If not, check your default `datastore` (usually located in `config/models.js`).  Finally, check that this datastore (`'+normalizedModelDef.datastore[0]+'`) is valid as per http://sailsjs.com/docs/reference/configuration/sails-config-datastores.');
  }
  var normalizedDatastoreConfig = referencedDatastore.internalConfig;
  if (_.isUndefined(normalizedModelDef.schema)) {
    if (!_.isUndefined(normalizedDatastoreConfig.schema)) {
      normalizedModelDef.schema = normalizedDatastoreConfig.schema;
    }
  }

  //  ██████╗ ███████╗████████╗██╗   ██╗██████╗ ███╗   ██╗
  //  ██╔══██╗██╔════╝╚══██╔══╝██║   ██║██╔══██╗████╗  ██║
  //  ██████╔╝█████╗     ██║   ██║   ██║██████╔╝██╔██╗ ██║
  //  ██╔══██╗██╔══╝     ██║   ██║   ██║██╔══██╗██║╚██╗██║
  //  ██║  ██║███████╗   ██║   ╚██████╔╝██║  ██║██║ ╚████║
  //  ╚═╝  ╚═╝╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝

  // Return the normalized model definition.
  return normalizedModelDef;

};
