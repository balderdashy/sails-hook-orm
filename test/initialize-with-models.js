/**
 * Module dependencies
 */

var assert = require('assert');
var _ = require('@sailshq/lodash');
var Sails = require('sails').Sails;



describe('initialize() with model(s)', function (){


  describe('without the appropriate adapter(s)', function (){

    it('should fail to load the orm hook', function (done){

      // New up an instance of Sails.
      var app = new Sails();

      // Load the app.
      app.load({
        globals: false,
        log: { level: 'silent' },
        hooks: {
          // Inject the orm hook in this repo into this Sails app
          orm: require('../')
        },
        loadHooks: ['moduleloader', 'userconfig', 'orm'],
        datastores: {
          pretendDatabase: {
            adapter: 'sails-pretend-adapter-that-totally-does-not-exist'
          }
        },
        orm: {
          // THIS IS FOR EXPERIMENTAL USE ONLY!
          // (could change at any time)
          moduleDefinitions: {
            models: {
              foo: {
                datastore: 'pretendDatabase'
              }
            }
          }
        }
      },function (err) {
        if (err) {
          // Ensure this error was due to the orm hook failing to load--
          // and specifically that the proper error code was sent back.
          if (err.code === 'E_ADAPTER_NOT_INSTALLED') {
            return done();
          }
          else {
            // console.log(err.code,_.keys(err), err.stack);
            return done(new Error('Expected `E_ADAPTER_NOT_INSTALLED`, but got a different error: \n'+err.stack+'\n(for ^^^, error code is `'+err.code+'`'));
          }
        }

        // If we're here, then Sails loaded successfully, even though it should have
        // failed to load.  So we lower the Sails app to prevent it from interfering
        // with other tests.
        app.lower(function (err) {
          if (err) {
            console.log(' -- NOTE --\nAn **unrelated** error occurred while attempting to lower Sails:',err);
          }
          return done(new Error('Should have failed to load the ORM hook.'));
        });
      });
    });
  });//</without the appropriate adapter(s)>





  describe('with the appropriate adapter(s) and `migrate: safe`', function (){

    // New up an instance of Sails.
    var app = new Sails();

    // Load the app.
    before(function setup(done){
      app.load({
        globals: false,
        log: { level: 'warn' },
        hooks: {
          // Inject the orm hook in this repo into this Sails app
          orm: require('../')
        },
        loadHooks: ['moduleloader', 'userconfig', 'orm'],
        models: {
          migrate: 'safe',
          archiveModelIdentity: false,
        },
        datastores: {
          default: {
            // This isn't a config that sails-disk actually uses, but it should
            // get normalized (i.e. trailing slash removed) in sails-hook-orm
            // anyway to prevent having to do it at the adapter level.
            url: 'http://foo.com/'
          }
        },
        orm: {
          // THIS IS FOR EXPERIMENTAL USE ONLY!
          // (could change at any time)
          moduleDefinitions: {
            models: {
              foo: {
                primaryKey: 'id',
                attributes: {
                  id: {
                    type: 'number',
                    required: true
                  }
                }
              }
            }
          }
        }
      },done);
    });


    it('should have initialized the `orm` hook', function (){
      assert(app.hooks.orm);
    });

    it('should have set up a dictionary of models on the hook', function (){
      assert(_.isObject(app.hooks.orm.models) && !_.isArray(app.hooks.orm.models));
    });

    it('should have set up a dictionary of adapters on the hook', function (){
      assert(_.isObject(app.hooks.orm.adapters) && !_.isArray(app.hooks.orm.adapters));
    });

    it('should have also exposed `sails.models` as a direct reference to `sails.hooks.orm.models`', function (){
      assert(app.models === app.hooks.orm.models);
    });

    it('should contain the expected models in `sails.hooks.orm.models`', function (){
      assert.equal(_.keys(app.models).length, 1);
      assert(_.isObject(app.models.foo), new Error('Should have a model under the `foo` key'));
    });

    it('should trim the trailing slash off of the configured `url` for the datastore', function() {
      assert.equal(app.hooks.orm.datastores.default.config.url, 'http://foo.com');
    });

    it('should expose `sails.getDatastore()` (and on the hook too)', function (){
      assert(_.isFunction(app.getDatastore));
      assert(_.isFunction(app.hooks.orm.getDatastore));
    });

    it('should expose `.getDatastore()` method on models', function (){
      assert(_.isFunction(app.hooks.orm.models.foo.getDatastore), 'not a function');
    });


    // Lower the app.
    after(function teardown(done) {
      app.lower(done);
    });

  });//</with the appropriate adapter(s)>


  describe('with the duplicate model identities', function (){

    // New up an instance of Sails.
    var app = new Sails();

    // Hold the application def
    var appDef;

    // Load the app.
    before(function setup(){
      appDef = {
        globals: false,
        log: { level: 'silent' },
        hooks: {
          // Inject the orm hook in this repo into this Sails app
          orm: require('../')
        },
        loadHooks: ['moduleloader', 'userconfig', 'orm'],
        models: {
          migrate: 'safe'
        },
        datastores: {
          default: {
            // This isn't a config that sails-disk actually uses, but it should
            // get normalized (i.e. trailing slash removed) in sails-hook-orm
            // anyway to prevent having to do it at the adapter level.
            url: 'http://foo.com/'
          }
        },
        orm: {
          // THIS IS FOR EXPERIMENTAL USE ONLY!
          // (could change at any time)
          moduleDefinitions: {
            models: {
              foo: {
                identity: 'foo',
                primaryKey: 'id',
                attributes: {
                  id: {
                    type: 'number',
                    required: true
                  }
                }
              },
              bar: {
                identity: 'foo',
                primaryKey: 'id',
                attributes: {
                  id: {
                    type: 'number',
                    required: true
                  }
                }
              }
            }
          }
        }
      };
    });


    it('should not allow the ORM hook to load', function (done){
      app.load(appDef, function(err) {
        assert(err);
        return done();
      });
    });

    // Lower the app.
    after(function teardown(done) {
      app.lower(done);
    });

  });//</with duplicate model identities>

});
