/**
 * Module dependencies
 */

var util = require('util');
var _ = require('@sailshq/lodash');
var flaverr = require('flaverr');
var VALIDATIONS = require('waterline/accessible/allowed-validations');
var DEPRECATED_VALIDATIONS = require('../constants/deprecated-validations.list');
var UNSUPPORTED_VALIDATIONS = require('../constants/invalid-validations.list');
var modelHasNoDatastoreError = require('../constants/model-has-no-datastore.error');
var constructError = require('./construct-error');

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

  //  ██╗   ██╗ █████╗ ██╗     ██╗██████╗  █████╗ ████████╗███████╗
  //  ██║   ██║██╔══██╗██║     ██║██╔══██╗██╔══██╗╚══██╔══╝██╔════╝
  //  ██║   ██║███████║██║     ██║██║  ██║███████║   ██║   █████╗
  //  ╚██╗ ██╔╝██╔══██║██║     ██║██║  ██║██╔══██║   ██║   ██╔══╝
  //   ╚████╔╝ ██║  ██║███████╗██║██████╔╝██║  ██║   ██║   ███████╗
  //    ╚═══╝  ╚═╝  ╚═╝╚══════╝╚═╝╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝
  //
  //  ██╗██████╗ ███████╗███╗   ██╗████████╗██╗████████╗██╗   ██╗
  //  ██║██╔══██╗██╔════╝████╗  ██║╚══██╔══╝██║╚══██╔══╝╚██╗ ██╔╝
  //  ██║██║  ██║█████╗  ██╔██╗ ██║   ██║   ██║   ██║    ╚████╔╝
  //  ██║██║  ██║██╔══╝  ██║╚██╗██║   ██║   ██║   ██║     ╚██╔╝
  //  ██║██████╔╝███████╗██║ ╚████║   ██║   ██║   ██║      ██║
  //  ╚═╝╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝   ╚═╝      ╚═╝

  if (!modelIdentity.match(/^[a-z_][a-z0-9_]*$/)) {
    throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
                    '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                    'The `' + originalModelDef.globalId + '` model has an invalid name.\n'+
                    'Model names must start with a letter and contain only letters, numbers and underscores.\n'+
                    '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));
  }

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

  // If there's a top-level `connection`, bail out (should be `datastore`).
  if (normalizedModelDef.connection) {
    throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
                    '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                    'In model `' + modelIdentity + '`:\n'+
                    'The `connection` setting is no longer supported.  Please use `datastore` instead.\n'+
                    'See https://sailsjs.com/docs/concepts/models-and-orm/model-settings for more info.\n'+
                    '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));
  }

  // If there's a top-level `autoCreatedAt`, `autoUpdatedAt` or `autoPK` model setting, bail out.
  if (!_.isUndefined(normalizedModelDef.autoCreatedAt) || !_.isUndefined(normalizedModelDef.autoUpdatedAt) || !_.isUndefined(normalizedModelDef.autoPK)) {
    throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
                    '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                    'In model `' + modelIdentity + '`:\n'+
                    'The `autoCreatedAt`, `autoUpdatedAt` and `autoPK` top-level model settings were removed\n'+
                    'in Sails 1.0. See http://sailsjs.com/docs/concepts/models-and-orm/attributes for info\n'+
                    'on configuring attributes to be timestamps.  For info on changing the primary key of a model,\n'+
                    'see https://sailsjs.com/docs/concepts/models-and-orm/model-settings#?primarykey.\n'+
                    '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));
  }

  // If there's a top-level `types` model setting, bail out.
  if (!_.isUndefined(normalizedModelDef.types)) {
    throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
                    '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                    'In model `' + modelIdentity + '`:\n'+
                    'The `types` model setting was removed in Sails 1.0.  To perform custom validation on\n'+
                    'an attribute, set `validations: { custom: true }` on that attribute.\n'+
                    'See https://sailsjs.com/docs/concepts/models-and-orm/validations for info\n'+
                    '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));
  }

  if (!normalizedModelDef.attributes[normalizedModelDef.primaryKey]) {
    throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
                    '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                    'In model `' + modelIdentity + '`:\n'+
                    'The primary key is set to `' + normalizedModelDef.primaryKey + '`, but no such attribute was found on the model.\n'+
                    'You must define an `' + normalizedModelDef.primaryKey + '` attribute in `api/' + originalModelDef.globalId + '.js` or in `config/models.js`.\n'+
                    'See http://sailsjs.com/upgrading#?changes-to-model-configuration for info\n'+
                    '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));

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
      throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
                      '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                      'In model `' + modelIdentity + '`:\n'+
                      'The `toJSON` instance method is no longer supported.\n'+
                      'Instead, please use the `customToJSON` model setting.\n'+
                      'See http://sailsjs.com/docs/concepts/models-and-orm/model-settings for more info.\n'+
                      '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));
    }

    // Ignore `protected` attribute modifier
    if (val.protected) {
      throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
        '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
        'In model `' + modelIdentity + '`:\n'+
        'The `protected` attribute modifier is no longer supported.\n'+
        'Instead, please use the `customToJSON` model setting to filter out attributes.\n'+
        'See http://sailsjs.com/docs/concepts/models-and-orm/model-settings for more info.\n'+
        '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));
    }

    // If the attribute is a function, log a message
    if (_.isFunction(val)) {
      throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
                      '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                      'In the `' + attributeName + '` attribute of model `' + modelIdentity + '`:\n'+
                      'Model instance methods are no longer supported in Sails v1.\n'+
                      'Please refactor the logic from this instance method into\n'+
                      'a static method, model method or helper.\n'+
                      '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));
    }

    //  ┬ ┬┌─┐┌┐┌┌┬┐┬  ┌─┐  ┌┬┐┌─┐┌─┐┌─┐┬ ┬┬ ┌┬┐┌─┐╔╦╗┌─┐  ┌─┐┌┐┌┌─┐
    //  ├─┤├─┤│││ │││  ├┤    ││├┤ ├┤ ├─┤│ ││  │ └─┐ ║ │ │  ├┤ │││└─┐
    //  ┴ ┴┴ ┴┘└┘─┴┘┴─┘└─┘  ─┴┘└─┘└  ┴ ┴└─┘┴─┘┴ └─┘ ╩ └─┘  └  ┘└┘└─┘

    // Throw an error if a "defaultsTo" function is detected.
    if (_.isFunction(val.defaultsTo)) {
      throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
                      '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                      'In the `' + attributeName + '` attribute of model `' + modelIdentity + '`:\n'+
                      'The `defaultsTo` property can no longer be specified as a function in Sails 1.0.  If you\n'+
                      'need to calculate a value for the attribute before creating a record, try wrapping your\n'+
                      '`create` logic in a helper (see http://sailsjs.com/docs/concepts/helpers) or using a lifecycle\n'+
                      'hook (see https://sailsjs.com/documentation/concepts/models-and-orm/lifecycle-callbacks#callbacks-on-create).\n'+
                      '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));
    }

    //  ┬ ┬┌─┐┌┐┌┌┬┐┬  ┌─┐  ┌─┐┬─┐┬┌┬┐┌─┐┬─┐┬ ┬╦╔═┌─┐┬ ┬  ┌─┐┬─┐┌─┐┌─┐
    //  ├─┤├─┤│││ │││  ├┤   ├─┘├┬┘││││├─┤├┬┘└┬┘╠╩╗├┤ └┬┘  ├─┘├┬┘│ │├─┘
    //  ┴ ┴┴ ┴┘└┘─┴┘┴─┘└─┘  ┴  ┴└─┴┴ ┴┴ ┴┴└─ ┴ ╩ ╩└─┘ ┴   ┴  ┴└─└─┘┴

    // Throw an error if a `primaryKey` attribute is declared on an attribute.
    if (!_.isUndefined(val.primaryKey)) {
      throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
                      '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                      'In the `' + attributeName + '` attribute of model `' + modelIdentity + '`:\n'+
                      'The `primaryKey` property can no longer be specified on an attribute in Sails 1.0.\n'+
                      'If you want to declare `' + attributeName + '` to be the primary key of `' + modelIdentity + '`,\n' +
                      'set `primaryKey: \'' + attributeName + '\'` at the top level of the model.\n' +
                      '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));
    }

    //  ┌─┐─┐ ┬┌─┐┌─┐┌┐┌┌┬┐  ┌┬┐┬ ┬┌─┐┌─┐  ┌─┐┬ ┬┌─┐┬─┐┌┬┐┌─┐┬ ┬┌┬┐┌─┐
    //  ├┤ ┌┴┬┘├─┘├─┤│││ ││   │ └┬┘├─┘├┤   └─┐├─┤│ │├┬┘ │ │  │ │ │ └─┐
    //  └─┘┴ └─┴  ┴ ┴┘└┘─┴┘   ┴  ┴ ┴  └─┘  └─┘┴ ┴└─┘┴└─ ┴ └─┘└─┘ ┴ └─┘

    // If the attribute value is a string, expand it into a type.
    if (_.isString(val)) {
      normalizedModelDef.attributes[attributeName] = { type: val };
      val = normalizedModelDef.attributes[attributeName];
    }

    //  ┌─┐┌┐┌┌─┐┬ ┬┬─┐┌─┐  ┌┬┐┬ ┬┌─┐┌─┐  ┌─┐┬─┐  ┌─┐┌─┐┌─┐┌─┐┌─┐┬┌─┐┌┬┐┬┌─┐┌┐┌
    //  ├┤ │││└─┐│ │├┬┘├┤    │ └┬┘├─┘├┤   │ │├┬┘  ├─┤└─┐└─┐│ ││  │├─┤ │ ││ ││││
    //  └─┘┘└┘└─┘└─┘┴└─└─┘   ┴  ┴ ┴  └─┘  └─┘┴└─  ┴ ┴└─┘└─┘└─┘└─┘┴┴ ┴ ┴ ┴└─┘┘└┘
    //  ┌┬┐┌─┐┌─┐┬  ┌─┐┬─┐┌─┐┌┬┐┬┌─┐┌┐┌
    //   ││├┤ │  │  ├─┤├┬┘├─┤ │ ││ ││││
    //  ─┴┘└─┘└─┘┴─┘┴ ┴┴└─┴ ┴ ┴ ┴└─┘┘└┘

    if (
      // If `type` is used, it must be a non-empty string.
      (!_.isUndefined(val.type) && (!_.isString(val.type) || val.type === '')) ||
      // Otherwise, `model` or `collection` must be specified.
      (_.isUndefined(val.type) && _.isUndefined(val.model) && _.isUndefined(val.collection) )
    ) {
      throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
                      '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                      'In the `' + attributeName + '` attribute of model `' + modelIdentity + '`:\n'+
                      'Attributes must have either a `type` property that is a non-empty string declaring\n'+
                      'the attribute\'s data type, a `model` property declaring a singular association with\n'+
                      'another model, or a `collection` property declaring a plural assocation with another model.\n'+
                      '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));
    }

    //  ┌┐┌┌─┐┬─┐┌┬┐┌─┐┬  ┬┌─┐┌─┐  ┌┬┐┬ ┬┌─┐┌─┐  ┌┐┌┌─┐┌┬┐┌─┐┌─┐
    //  ││││ │├┬┘│││├─┤│  │┌─┘├┤    │ └┬┘├─┘├┤   │││├─┤│││├┤ └─┐
    //  ┘└┘└─┘┴└─┴ ┴┴ ┴┴─┘┴└─┘└─┘   ┴  ┴ ┴  └─┘  ┘└┘┴ ┴┴ ┴└─┘└─┘

    // Make sure all type names are lowercased (so that using `type: 'STRING'` doesn't throw an error).
    if (!_.isUndefined(val.type)) {
      val.type = val.type.toLowerCase();
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
          sails.log.debug('  The `'+ propertyName+ '` property is not valid for associations.  Ignoring...\n');
          delete val[propertyName];
          return;
        }

        // Log a deprecation message and move the NEW version of the validation into a `validations` dictionary.
        sails.log.debug('In attribute `' + attributeName + '` of  model `' + modelIdentity + '`:');
        sails.log.debug('  The `' + propertyName + '` validation rule is now `' + DEPRECATED_VALIDATIONS[propertyName] + '` (changing it for you this time).\n');
        val.validations = val.validations || {};
        val.validations[DEPRECATED_VALIDATIONS[propertyName]] = property;
        delete val[propertyName];
        return;

      }

      // Ok, is it a no-longer-supported validation?
      if (UNSUPPORTED_VALIDATIONS[propertyName]) {

        // If so, throw a nicer error than waterline-schema would.
        throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
                        '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                        'In the `' + attributeName + '` attribute of model `' + modelIdentity + '`:\n'+
                        'The `' + propertyName + '` validation is no longer supported.\n'+
                        'Try using a custom validation instead!\n'+
                        'See http://sailsjs.com/docs/concepts/models-and-orm/validations for info\n'+
                        '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));
      }

      // Fine I give up.  We'll let waterline-schema determine whether this property is valid or not.

    });

    //  ┌─┐┬ ┬┌─┐┌─┐┬┌─  ┬  ┬┌─┐┬  ┬┌┬┐┌─┐┌┬┐┬┌─┐┌┐┌┌─┐
    //  │  ├─┤├┤ │  ├┴┐  └┐┌┘├─┤│  │ ││├─┤ │ ││ ││││└─┐
    //  └─┘┴ ┴└─┘└─┘┴ ┴   └┘ ┴ ┴┴─┘┴─┴┘┴ ┴ ┴ ┴└─┘┘└┘└─┘

    // Now loop through any validations and verify that they are appropriate for the attribute's type,
    // and that they are configured properly.
    _.each(_.keys(val.validations), function(validation) {
      var rule = VALIDATIONS[validation];
      if (!rule) {
        throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
          '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
          'In the `' + attributeName + '` attribute of model `' + modelIdentity + '`:\n'+
          'The `' + validation + '` validation rule is not a supported validation rule.\n'+
          'Supported validation rules are: \n'+
          _.keys(VALIDATIONS).reduce(function(a,v){a +=' - ' + v + '\n'; return a;},'') +
          '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));
      }
      if (!_.contains(rule.expectedTypes, val.type)) {
        throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
                        '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                        'In the `' + attributeName + '` attribute of model `' + modelIdentity + '`:\n'+
                        'The `' + validation + '` validation rule does not apply to the `' + val.type + '` attribute type.\n'+
                        '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));
      }
      if (!_.isFunction(rule.checkConfig)) { throw new Error('Consistency violation: Rule is missing `checkConfig` function!  (Could an out-of-date dependency still be installed?  (To resolve, try running `rm -rf node_modules && rm package-lock.json && npm install`.)'); }
      var ruleConfigError = rule.checkConfig(val.validations[validation]);
      if (ruleConfigError) {
        throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
                        '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                        'In the `' + attributeName + '` attribute of model `' + modelIdentity + '`:\n'+
                        'The configuration provided for the `' + validation + '` validation rule is invalid:\n'+
                        ruleConfigError + '\n'+
                        '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));
      }
    });

    //  ┬  ┬┌─┐┬  ┬┌┬┐┌─┐┌┬┐┌─┐  ┌─┐┬  ┬ ┬┬─┐┌─┐┬    ┌─┐┌─┐┌─┐┌─┐┌─┐┬┌─┐┌┬┐┬┌─┐┌┐┌┌─┐
    //  └┐┌┘├─┤│  │ ││├─┤ │ ├┤   ├─┘│  │ │├┬┘├─┤│    ├─┤└─┐└─┐│ ││  │├─┤ │ ││ ││││└─┐
    //   └┘ ┴ ┴┴─┘┴─┴┘┴ ┴ ┴ └─┘  ┴  ┴─┘└─┘┴└─┴ ┴┴─┘  ┴ ┴└─┘└─┘└─┘└─┘┴┴ ┴ ┴ ┴└─┘┘└┘└─┘

    // If the attribute is a plural association, make sure it doesn't have a `columnName`.
    if (val.collection) {
      if (val.columnName) {
        throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
                        '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                        'In the `' + attributeName + '` attribute of model `' + modelIdentity + '`:\n'+
                        'The `columnName` property is not valid for plural associations.\n'+
                        'If this is a "many-to-many" association and you wish to customize the junction table,\n'+
                        'use the `through` property.\n\n'+
                        'See http://sailsjs.com/docs/concepts/models-and-orm/associations/through-associations\n'+
                        'for more details.\n'+
                        '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));

      }

      // Otherwise there's nothing more to check for plural associations.
      return;
    }

    //  ┌┐ ┌─┐┬┬    ┌─┐┌┐┌  ┬ ┬┌┐┌┌─┐┬ ┬┌─┐┌─┐┌─┐┬─┐┌┬┐┌─┐┌┬┐  ┌┬┐┬ ┬┌─┐┌─┐┌─┐
    //  ├┴┐├─┤││    │ ││││  │ ││││└─┐│ │├─┘├─┘│ │├┬┘ │ ├┤  ││   │ └┬┘├─┘├┤ └─┐
    //  └─┘┴ ┴┴┴─┘  └─┘┘└┘  └─┘┘└┘└─┘└─┘┴  ┴  └─┘┴└─ ┴ └─┘─┴┘   ┴  ┴ ┴  └─┘└─┘
    if (noLongerSupportedTypes[val.type]) {
      throw flaverr({ name: 'userError', code: 'E_INVALID_MODEL_DEF' }, new Error(
                      '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
                      'In the `' + attributeName + '` attribute of model `' + modelIdentity + '`:\n'+
                      'The type "' + val.type + '" is no longer supported.  To use this type in your model, change\n'+
                      '`type` to one of the supported types and set the `columnType` property to a column \n'+
                      'type supported by the model\'s adapter, e.g. { type: \'' + noLongerSupportedTypes[val.type].suggestType + '\', columnType: \'' + noLongerSupportedTypes[val.type].suggestColumnType + '\' }\n'+
                      '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'));

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

    // Set the `unique` autoMigration property to `true` if it's the primary key,
    // otherwise default it to `false` if it's not already configured.
    val.autoMigrations.unique = val.autoMigrations.unique || (normalizedModelDef.primaryKey === attributeName) || false;

    // Set the `autoIncrement` autoMigration property to `false` if it's not already configured.
    val.autoMigrations.autoIncrement = val.autoMigrations.autoIncrement || false;

    // Set the `columnType` autoMigration property for non-associations.  `columnType` for
    // singular ("model") associations will be set later, in a call to `normalizeColumnTypes`.
    // This lets `waterline-schema` further validate the models (e.g. verifying that associations
    // are valid) before we continue.
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

  // If a datastore is not configured in our normalized model def (i.e. it is falsy), then we throw a fatal error.
  if (!normalizedModelDef.datastore) {
    throw constructError(modelHasNoDatastoreError, { modelIdentity: modelIdentity });
  }

  //  ┌┐┌┌─┐┬─┐┌┬┐┌─┐┬  ┬┌─┐┌─┐  ┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐  ┌─┐┌─┐┌┐┌┌─┐┬┌─┐
  //  ││││ │├┬┘│││├─┤│  │┌─┘├┤    ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤   │  │ ││││├┤ ││ ┬
  //  ┘└┘└─┘┴└─┴ ┴┴ ┴┴─┘┴└─┘└─┘  ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘  └─┘└─┘┘└┘└  ┴└─┘

  // Make sure that `Model.datastore` is a string.
  if (!_.isString(normalizedModelDef.datastore)) {
    throw new Error(
      '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
      'In model `' + modelIdentity + '`:\n'+
      'The `datastore` property must be a string representing the datastore to use for the model.\n'+
      'Instead, got: ' + util.inspect(normalizedModelDef.datastore, {depth: null}) + '\n'+
      (_.isArray(normalizedModelDef.datastore) ? '(Models can only use one datastore at a time.)\n' : '') +
      '-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n');
  }

  // Grab the normalized configuration for the datastore referenced by this model.
  // If the normalized model def doesn't have a `schema` flag, then check out its
  // normalized datastore config to see if _it_ has a `schema` setting.
  //
  // > Usually this is a default coming from the adapter itself-- for example,
  // > `sails-mongo` and `sails-disk` set `schema: false` by default, whereas
  // > `sails-mysql` and `sails-postgresql` default to `schema: true`.
  // > See `lib/validate-datastore-config.js` to see how that stuff gets in there.
  var normalizedDatastoreConfig = hook.normalizedDSConfigs[normalizedModelDef.datastore];
  if (!_.isObject(normalizedDatastoreConfig)) {
    throw new Error('A model (`'+modelIdentity+'`) references a datastore which cannot be found (`'+normalizedModelDef.datastore+'`).  If this model definition has an explicit `datastore` property, check that it is spelled correctly.  If not, check your default `datastore` (usually located in `config/models.js`).  Finally, check that this datastore (`'+normalizedModelDef.datastore+'`) is valid as per http://sailsjs.com/config/datastores.');
  }
  if (_.isUndefined(normalizedModelDef.schema)) {
    if (!_.isUndefined(normalizedDatastoreConfig.schema)) {
      normalizedModelDef.schema = normalizedDatastoreConfig.schema;
    }
  }

  //  ┌─┐┬ ┬┌─┐┌─┐┬┌─  ┌┬┐┌─┐┌┐┌┌─┐┌─┐  ╔═╗╦╔═┌─┐
  //  │  ├─┤├┤ │  ├┴┐  ││││ │││││ ┬│ │  ╠═╝╠╩╗└─┐
  //  └─┘┴ ┴└─┘└─┘┴ ┴  ┴ ┴└─┘┘└┘└─┘└─┘  ╩  ╩ ╩└─┘
  // If the model's datastore is using `sails-mongo`, ensure that the primary key is set up properly.

  if (normalizedDatastoreConfig.adapter === 'sails-mongo') {
    // If this model is using the default datastore, and it's not defining its own primary key attribute,
    // then we'll have already logged a warning in `initialize.js` if the default primary key attribute
    // wasn't set up correctly.
    if (normalizedModelDef.datastore !== 'default' || (originalModelDef.attributes && originalModelDef.attributes[normalizedModelDef.primaryKey])) {
      var primaryKeyAttr = normalizedModelDef.attributes[normalizedModelDef.primaryKey];
      if (primaryKeyAttr.autoIncrement || (primaryKeyAttr.type !== 'string' && normalizedModelDef.dontUseObjectIds !== true) || primaryKeyAttr.columnName !== '_id') {
        sails.log.debug('In model `' + modelIdentity + '`:');
        sails.log.debug('The default primary key attribute (`' + normalizedModelDef.primaryKey + '`) is not set up correctly.' );
        sails.log.debug('When using `sails-mongo`, primary keys MUST have `columnName: \'_id\'`,');
        sails.log.debug('and must _not_ have `autoIncrement: true`.');
        sails.log.debug('Also, in most cases (unless `dontUseObjectIds` has been set to `true` for the model),');
        sails.log.debug('then the `type` of the primary key must also be `string`.');
        sails.log.debug();
        sails.log.debug('We\'ll set this up for you this time...');
        sails.log.debug();

        delete primaryKeyAttr.autoMigrations.autoIncrement;
        primaryKeyAttr.type = 'string';
        primaryKeyAttr.columnName = '_id';

      }
    }
  }

  //
  //  ┌─┐┌┬┐┌┬┐┌─┐┌─┐┬ ┬   ┌─┐┌─┐┌┬┐┌┬┐┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐  ┌┬┐┌─┐┌┬┐┬ ┬┌─┐┌┬┐
  //  ├─┤ │  │ ├─┤│  ├─┤   │ ┬├┤  │  ││├─┤ │ ├─┤└─┐ │ │ │├┬┘├┤   │││├┤  │ ├─┤│ │ ││
  //  ┴ ┴ ┴  ┴ ┴ ┴└─┘┴ ┴  o└─┘└─┘ ┴ ─┴┘┴ ┴ ┴ ┴ ┴└─┘ ┴ └─┘┴└─└─┘  ┴ ┴└─┘ ┴ ┴ ┴└─┘─┴┘
  // Attach .getDatastore() method to model.

  /**
   * WLModel.getDatastore()
   *
   * @returns {Datastore}
   */
  normalizedModelDef.getDatastore = function (){

    if (arguments.length > 0) {
      throw new Error('The `getDatastore()` model method should be called with no arguments.  (To look up a particular datastore by name, use `sails.getDatastore()`.)');
    }

    return hook.getDatastore(normalizedModelDef.datastore);

  };


  //  ┌─┐┌┬┐┌┬┐┌─┐┌─┐┬ ┬   ┌┐┌┌─┐┌┬┐┬┬  ┬┌─┐  ┌┬┐┌─┐┌┬┐┬ ┬┌─┐┌┬┐
  //  ├─┤ │  │ ├─┤│  ├─┤   │││├─┤ │ │└┐┌┘├┤   │││├┤  │ ├─┤│ │ ││
  //  ┴ ┴ ┴  ┴ ┴ ┴└─┘┴ ┴  o┘└┘┴ ┴ ┴ ┴ └┘ └─┘  ┴ ┴└─┘ ┴ ┴ ┴└─┘─┴┘
  // Attach .native() method to model.

  /**
   * WLModel.native()
   *
   * Obtain a raw MongoDB collection instance; the physical representation of this model.
   * (This is the traditional, no-longer-recommended way of performing raw Mongo queries.)
   *
   * > Provides backwards compatibility.  For more info, see:
   * >  • http://sailsjs.com/docs/reference/waterline-orm/models/native
   * >  • https://github.com/balderdashy/sails-mongo/blob/8fcf69a2edea3977b7b094552aab45fddad3a673/lib/adapter.js#L246-L262
   *
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param {Function}
   *        @param {Error?} err
   *        @param {Ref} rawMongoCollection
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  normalizedModelDef.native = function (done){

    // Log a compatibility warning.
    console.warn('\n'+
      '`.native()` is deprecated.  Please use `.getDatastore().manager` instead.\n'+
      '(See http://sailsjs.com/upgrading)\n'
    );

    // Ensure valid usage.
    if (!done) {
      throw new Error('No callback function provided when invoking .native().');
    }
    else if (!_.isFunction(done)) {
      throw new Error('Invalid callback function provided when invoking .native().');
    }

    // Determine if this model is using sails-mongo as its adapter.
    var isUsingSailsMongo = (function __get__(){
      var normalizedDatastoreConfig = hook.normalizedDSConfigs[normalizedModelDef.datastore];
      var adapterIdentity = hook.adapters[normalizedDatastoreConfig.adapter].identity;
      return adapterIdentity === 'sails-mongo';
    })();

    // If it is not using sails-mongo, send back an error.
    if (!isUsingSailsMongo) {
      return done(new Error('This model (`'+normalizedModelDef.identity+'`) does not appear to be using the `sails-mongo` adapter, so the `.native()` method is not available.  (See http://sailsjs.com/docs/reference/waterline-orm/models/native)'));
    }

    // Sanity check:
    if (!normalizedModelDef.tableName || !_.isString(normalizedModelDef.tableName)) {
      return done(new Error('Consistency violation: Models should always have a valid `tableName` at this point, but this model (`'+normalizedModelDef.identity+'`) does not...'));
    }

    // Since the db connection manager exposed by `sails-mongo` is actually
    // the same as the Mongo client's `db` instance, we can treat it as such.
    var db = normalizedModelDef.getDatastore().manager;
    var rawMongoCollection = db.collection(normalizedModelDef.tableName);

    return done(undefined, rawMongoCollection);

  };



  //  ┌─┐┌┬┐┌┬┐┌─┐┌─┐┬ ┬   ┌─┐ ┬ ┬┌─┐┬─┐┬ ┬  ┌┬┐┌─┐┌┬┐┬ ┬┌─┐┌┬┐
  //  ├─┤ │  │ ├─┤│  ├─┤   │─┼┐│ │├┤ ├┬┘└┬┘  │││├┤  │ ├─┤│ │ ││
  //  ┴ ┴ ┴  ┴ ┴ ┴└─┘┴ ┴  o└─┘└└─┘└─┘┴└─ ┴   ┴ ┴└─┘ ┴ ┴ ┴└─┘─┴┘
  // Attach .query() method to model.

  /**
   * WLModel.query()
   *
   * Run a native SQL query.
   * (This is the traditional, no-longer-recommended way of performing raw SQL queries.)
   *
   * > Provides backwards compatibility.  For more info, see:
   * >  • http://sailsjs.com/docs/reference/waterline-orm/models/query
   *
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   * @param {String} sql
   * @param {Array} valuesToEscape
   * @param {Function}
   *        @param {Error?} err
   *        @param {Ref} rawResult
   * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
   */
  normalizedModelDef.query = function (sql, valuesToEscape, done){

    // Log a compatibility warning.
    console.warn('\n'+
      '`.query()` is deprecated.  Please use `.getDatastore().sendNativeQuery()` instead.\n'+
      '(See http://sailsjs.com/upgrading)\n'
    );

    // Handle variadic usage:
    // ```
    // .query('foo', function(){...})
    // ```
    if (arguments.length === 2 && _.isFunction(valuesToEscape)) {
      done = valuesToEscape;
      valuesToEscape = [];
    }

    // Ensure valid usage.
    if (!done) {
      throw new Error('No callback function provided when invoking .query().');
    }
    else if (!_.isFunction(done)) {
      throw new Error('Invalid callback function provided when invoking .query().');
    }

    // Call the `sendNativeQuery()` method on this model's datastore (RDI).
    normalizedModelDef.getDatastore().sendNativeQuery(sql, valuesToEscape, done);

  };

  //  ██████╗ ███████╗████████╗██╗   ██╗██████╗ ███╗   ██╗
  //  ██╔══██╗██╔════╝╚══██╔══╝██║   ██║██╔══██╗████╗  ██║
  //  ██████╔╝█████╗     ██║   ██║   ██║██████╔╝██╔██╗ ██║
  //  ██╔══██╗██╔══╝     ██║   ██║   ██║██╔══██╗██║╚██╗██║
  //  ██║  ██║███████╗   ██║   ╚██████╔╝██║  ██║██║ ╚████║
  //  ╚═╝  ╚═╝╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝

  // Return the normalized model definition.
  return normalizedModelDef;

};
