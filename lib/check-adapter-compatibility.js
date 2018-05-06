/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');
var flaverr = require('flaverr');
var chalk = require('chalk');
var util = require('util');


/**
 * checkAdapterCompatibility()
 *
 * Check that the adapter is compatible with the currently-installed release of Sails / Waterline
 * by verifying its declared adapter API version.
 *
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param  {String} datastoreName
 * @param  {Ref} adapter
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @throws {Error} If adapter is not compatible with this version of Sails / Waterline.
 *          @property {String} code
 *                    • 'E_NOT_COMPATIBLE'
 *
 * @throws {Error} If anything else completely unexpected is noticed
 */
module.exports = function checkAdapterCompatibility(datastoreName, adapter) {

  // Set the expected API version for adapters.
  var EXPECTED_ADAPTER_API_VERSION = 1;

  // Assert valid usage
  if (!datastoreName || !_.isString(datastoreName)) {
    throw new Error('Consistency violation: A valid `datastoreName` must be provided as the 1st argument.');
  }
  if (!_.isObject(adapter)) {
    throw new Error('Consistency violation: A valid `adapter` must be provided as the 2nd argument.');
  }


  // Set up a suffix for use in a few of the error messages below
  var COMPATIBILITY_ERROR_MSG_SUFFIX = ''+
  'If there is %s version of this adapter, try updating the semver range for\n'+
  'this dependency in your package.json file.  If you aren\'t sure, check the repo\n'+
  'on GitHub, or contact the adapter\'s maintainer.  If you *are* the maintainer\n'+
  'of this adapter and need help, visit http://sailsjs.com/support.\n';


  // Check that this adapter is compatibile with the current version of Sails / Waterline.
  var prefixForAdapterApiVersionError =
  'The adapter used by the `' + datastoreName + '` datastore is not compatible with\n'+
  'the current version of Sails/Waterline.\n';

  var doesNotDeclareValidApiVersion = (
    !_.has(adapter, 'adapterApiVersion') ||
    !_.isNumber(adapter.adapterApiVersion)
  );
  if (doesNotDeclareValidApiVersion) {
    throw flaverr('E_NOT_COMPATIBLE', new Error(
      '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
      '\n'+prefixForAdapterApiVersionError + '\n'+
      'The adapter should expose a valid `adapterApiVersion`.\n\n'+
      'If you\'re using Sails ≥1.0, try:\n'+
      chalk.bold('npm install ' + adapter.identity + '@latest --save\n')+
      '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'
    ));
  }//-•

  if (adapter.adapterApiVersion < EXPECTED_ADAPTER_API_VERSION) {
    throw flaverr('E_NOT_COMPATIBLE', new Error(
      '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
      '\n'+prefixForAdapterApiVersionError + '\n'+
      'The adapter\'s declared `adapterApiVersion` is too old.  '+
      '(Expecting `'+EXPECTED_ADAPTER_API_VERSION+'`).\n\n'+
      util.format(COMPATIBILITY_ERROR_MSG_SUFFIX, 'a newer')+
      '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'
    ));
  }//-•

  if (adapter.adapterApiVersion > EXPECTED_ADAPTER_API_VERSION) {
    throw flaverr('E_NOT_COMPATIBLE', new Error(
      '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'+
      '\n'+prefixForAdapterApiVersionError + '\n'+
      'The adapter\'s declared `adapterApiVersion` is too new.  '+
      '(Expecting `'+EXPECTED_ADAPTER_API_VERSION+'`).\n\n'+
      util.format(COMPATIBILITY_ERROR_MSG_SUFFIX, 'an older')+
      '\n-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-\n'
    ));
  }//-•

};
