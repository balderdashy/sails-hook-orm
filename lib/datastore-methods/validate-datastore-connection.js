/**
 * Module dependencies
 */

var _ = require('@sailshq/lodash');
var flaverr = require('flaverr');


/**
 * Verify that this adapter implements the necessary features to allow for
 * high-level datastore methods to be used.
 *
 * > This also checks that the adapter is compatible with the currently-installed
 * > release of Sails / Waterline (by verifying its declared adapter API version.)
 *
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @param  {String} datastoreIdentity
 * @param  {Ref} adapter
 * - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
 * @throws {Error} If adapter is not compatible for use with datastore methods, or
 *                 or if it is not compatible with this version of Sails / Waterline.
 *          @property {String} code  [=> 'E_NOT_COMPATIBLE']
 *
 * @throws {Error} If anything else completely unexpected is noticed
 */
module.exports = function checkAdapterCompatibility(datastoreIdentity, adapter) {


  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // TODO: tweak the naming of this function to clarify that it's just a generic check now,
  // and that it's actually more about the adapter than it is the datastore
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  // Assert valid usage
  if (!datastoreIdentity || !_.isString(datastoreIdentity)) {
    throw new Error('Consistency violation: A valid `datastoreIdentity` must be provided as the 1st argument.');
  }
  if (!_.isObject(adapter)) {
    throw new Error('Consistency violation: A valid `adapter` must be provided as the 2nd argument.');
  }


  // Set up a suffix for use in a few of the error messages below
  var COMPATIBILITY_ERROR_MSG_SUFFIX = ''+
  'If there is an older/ newer version of this adapter, try updating the semver range for this dependency '+
  'in your package.json file.  If you aren\'t sure, check the repo on GitHub, or contact the adapter\'s '+
  'maintainer.  If you *are* the maintainer of this adapter and need help, visit http://sailsjs.com/support.';


  // Check that this adapter is compatibile with the current version of Sails / Waterline.
  var prefixForAdapterApiVersionError =
  'The adapter used by the `' + datastoreIdentity + '` datastore is not compatible with '+
  'the current version of Sails/Waterline.';

  var doesNotDeclareValidApiVersion = (
    !_.has(adapter, 'adapterApiVersion') ||
    !_.isNumber(adapter.adapterApiVersion)
  );
  if (doesNotDeclareValidApiVersion) {
    throw flaverr('E_NOT_COMPATIBLE', new Error(
      prefixForAdapterApiVersionError + '\n'+
      'The adapter should expose a valid `adapterApiVersion`.\n'+
      COMPATIBILITY_ERROR_MSG_SUFFIX
    ));
  }//-•


  var EXPECTED_ADAPTER_API_VERSION = 1;

  if (adapter.adapterApiVersion < EXPECTED_ADAPTER_API_VERSION) {
    throw flaverr('E_NOT_COMPATIBLE', new Error(
      prefixForAdapterApiVersionError + '\n'+
      'The adapter\'s declared `adapterApiVersion` is too old.  '+
      '(Expecting `'+EXPECTED_ADAPTER_API_VERSION+'`).\n'+
      COMPATIBILITY_ERROR_MSG_SUFFIX
    ));
  }//-•

  if (adapter.adapterApiVersion > EXPECTED_ADAPTER_API_VERSION) {
    throw flaverr('E_NOT_COMPATIBLE', new Error(
      prefixForAdapterApiVersionError + '\n'+
      'The adapter\'s declared `adapterApiVersion` is too new.  '+
      '(Expecting `'+EXPECTED_ADAPTER_API_VERSION+'`).\n'+
      COMPATIBILITY_ERROR_MSG_SUFFIX
    ));
  }//-•



  // If this adapter doesn't expose its datastores, then we can't provide any
  // functional datastore methods to allow userland code to work with them.
  //
  // > This is relevant for older adapters, or adapters which only support usage
  // > via models.  Note that this partial level of support may no longer be an
  // > option in future versions of Sails and Waterline.
  if (!_.has(adapter, 'datastores')) {
    throw flaverr('E_NOT_COMPATIBLE', new Error(
      'The adapter used by the ' + datastoreIdentity + ' datastore does not support '+
      'direct access to its datastores (e.g. for leasing connections directly.)  '+
      'It needs to expose its internal datastores in order for them to be used '+
      'outside the adapter.\n'+
      COMPATIBILITY_ERROR_MSG_SUFFIX
    ));
  }//-•

  // Try to find the adapter datastore being used.
  //
  // > This should exist in a standardized form to allow us to talk directly to
  // > the driver and access the live manager instance.)
  var adapterDatastore = adapter.datastores[datastoreIdentity];
  if (!adapterDatastore) {
    throw flaverr('E_NOT_COMPATIBLE', new Error(
      'The adapter used by the ' + datastoreIdentity + ' datastore does not support '+
      'direct access to its datastores (e.g. for leasing connections directly.)  '+
      'The adapter\'s exposed `datastores` dictionary doesn\'t exist, is invalid, '+
      'or is missing the expected reference to this datastore.\n'+
      COMPATIBILITY_ERROR_MSG_SUFFIX
    ));
  }//-•

  // Validate that the raw adapter datastore entry we just located provides the right
  // information in the right format.  If it conforms to the spec, it should have
  // `manager`, `driver`, and `config` keys.
  //
  // > Otherwise, we wouldn't actually be capable of running the datastore methods.
  if (!_.has(adapterDatastore, 'manager') || !_.has(adapterDatastore, 'driver') || !_.has(adapterDatastore, 'config')) {
    throw flaverr('E_NOT_COMPATIBLE', new Error(
      'The adapter used by the ' + datastoreIdentity + ' datastore does not support '+
      'direct access to its datastores (e.g. for leasing connections directly.)  '+
      'The adapter\'s exposed `datastores` dictionary contains the expected reference '+
      'to this datastore, but that reference is missing one or more mandatory keys '+
      '(like `driver`, `manager`, or `config`).\n'+
      COMPATIBILITY_ERROR_MSG_SUFFIX
    ));
  }//-•

};
